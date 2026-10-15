"""Read the feeds in sources.json, have the local model draft new stories, and send each draft to Scout.

Nothing is published here. Every draft waits for a Publish press in Telegram.
Run it a few times a day (see automation/README.md):

    python automation/draft_news.py
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
from html import unescape

import common
from common import (
    AUTOMATION_DIR,
    LLMUnavailable,
    Telegram,
    TelegramError,
    ask_llm,
    clip,
    copy_risk,
    env,
    extract_json,
    log,
    new_id,
    now_iso,
    news_buttons,
    news_card_text,
    read_json,
    save_item,
    write_json,
)

SYSTEM_PROMPT = """You write short GTA 6 news posts for a fan community site.
Rules:
- Use only facts that appear in the article text you are given. Leave out anything you are unsure of.
- Write in your own words. Do not copy sentences, and never quote more than 10 words in a row.
- Set "status" to "verified" only when the article quotes an official Rockstar, Take-Two or platform statement.
  Use "rumor" for claims that are reported but not confirmed. Use "unconfirmed" when unsure.
- Reply with one JSON object and nothing else, with these keys:
  "title" (max 110 characters),
  "description" (one sentence, max 190 characters),
  "status" ("verified", "rumor" or "unconfirmed"),
  "tags" (2 to 4 lowercase words),
  "body" (2 to 4 short paragraphs of plain text, no headings, no links)."""

TEXT_TAGS = ("content", "encoded", "description", "summary")


def child_text(node, names) -> str:
    """Longest matching child text, ignoring XML namespaces."""
    best = ""
    for child in node:
        if child.tag.rsplit("}", 1)[-1] in names:
            value = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", child.text or ""))).strip()
            if len(value) > len(best):
                best = value
    return best


def fetch_feed(url: str, limit: int = 6) -> list[dict]:
    """Parse an RSS or Atom feed into title, link and article text."""
    request = urllib.request.Request(url, headers={"User-Agent": "scout-news/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())
    entries = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] not in ("item", "entry"):
            continue
        title = child_text(node, ("title",))
        link = child_text(node, ("link",))
        if not link:
            for child in node:
                if child.tag.rsplit("}", 1)[-1] == "link" and child.get("href"):
                    link = child.get("href")
                    break
        if not title or not link.startswith(("http://", "https://")):
            continue
        entries.append({"title": title, "link": link, "text": child_text(node, TEXT_TAGS) or title})
        if len(entries) >= limit:
            break
    return entries


def validate_news(raw: str, official: bool) -> dict:
    data = extract_json(raw)
    if not isinstance(data, dict):
        raise ValueError("the model reply was not a JSON object")
    title = clip(str(data.get("title") or ""), 110)
    description = clip(str(data.get("description") or ""), 190)
    body = str(data.get("body") or "").strip()
    status = data.get("status")
    if not title or not description or len(body) < 120:
        raise ValueError("a required field is missing or too short")
    if "http" in body.lower():
        raise ValueError("the body contains a link; links only come from the feed")
    if status not in ("verified", "rumor", "unconfirmed"):
        raise ValueError("the status is not one of the allowed values")
    if status == "verified" and not official:
        status = "unconfirmed"  # only official newsroom feeds can support a verified label
    tags: list[str] = []
    for raw_tag in data.get("tags") or []:
        tag = re.sub(r"[^a-z0-9 -]", "", str(raw_tag).lower()).strip()[:24]
        if tag and tag not in tags:
            tags.append(tag)
    return {"title": title, "description": description, "status": status, "tags": tags[:4], "body": body}


def write_post(entry: dict, feed: dict) -> dict:
    source_text = f"{entry['title']}\n{entry['text']}"
    prompt = (
        f"Article headline: {entry['title']}\n"
        f"Source: {feed['name']}\n"
        f"Article text:\n{entry['text'][:4000]}"
    )
    problem = "the model gave no usable draft"
    for _ in range(2):  # one retry if the draft is unusable
        try:
            post = validate_news(ask_llm(SYSTEM_PROMPT, prompt), official=bool(feed.get("official")))
        except ValueError as err:
            problem = str(err)
            continue
        if copy_risk(post["body"], source_text):
            problem = "too close to the source wording"
            prompt += "\nWrite it in entirely different words from the article."
            continue
        post["sources"] = [{"name": feed["name"], "url": entry["link"]}]
        return post
    raise ValueError(problem)


def main() -> None:
    tg = Telegram.from_env()
    config = read_json(Path(env("SOURCES_FILE", str(AUTOMATION_DIR / "sources.json"))), {"feeds": []})
    feeds = [feed for feed in config.get("feeds", []) if feed.get("enabled", True)]
    if not feeds:
        log("No feeds enabled. Add RSS feeds to automation/sources.json, then run this again.")
        return

    limit = int(env("NEWS_MAX_PER_RUN", "3"))
    seen_path = common.STATE_DIR / "seen.json"
    seen = set(read_json(seen_path, []))

    fresh = []
    for feed in feeds:
        try:
            entries = fetch_feed(feed["url"])
        except Exception as err:
            log(f"feed skipped: {feed.get('name', feed['url'])} ({type(err).__name__})")
            continue
        for entry in entries:
            key = hashlib.sha256(entry["link"].encode("utf-8")).hexdigest()[:24]
            if key not in seen:
                fresh.append((key, feed, entry))

    sent = 0
    for key, feed, entry in fresh:
        if sent >= limit:
            break
        seen.add(key)  # marked first, so a story that fails is not retried forever
        write_json(seen_path, sorted(seen))
        try:
            post = write_post(entry, feed)
            item = {
                "id": new_id(),
                "kind": "news",
                "status": "pending",
                "created": now_iso(),
                "post": post,
                "test": False,
            }
            item["card_message_id"] = tg.send(tg.owner_id, news_card_text(post), news_buttons(item["id"]))
            save_item(item)
        except (LLMUnavailable, TelegramError) as err:
            # Infrastructure problem, not a bad story: try this one again next run.
            seen.discard(key)
            write_json(seen_path, sorted(seen))
            log(f"stopped: {err}")
            break
        except Exception as err:  # a bad reply from the model skips this story only
            log(f"no draft for {entry['link']}: {err}")
            continue
        sent += 1
        log(f"draft sent to Scout: {post['title']}")
    log(f"{sent} draft(s) sent to Scout")


if __name__ == "__main__":
    main()
