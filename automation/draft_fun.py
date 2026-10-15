"""Have the local model write a batch of fun channel posts (polls and short posts) for Scout to approve.

Nothing is posted here. Approved items are queued and posted to the channel on schedule by Scout.

    python automation/draft_fun.py                 # 4 items, default theme
    python automation/draft_fun.py --count 6
"""

from __future__ import annotations

import argparse

import common
from common import (
    LLMUnavailable,
    Telegram,
    TelegramError,
    ask_llm,
    extract_json,
    fun_buttons,
    fun_card_text,
    log,
    new_id,
    now_iso,
    read_json,
    save_item,
)

DEFAULT_THEME = (
    "GTA fan fun for a community channel: quick polls about favourite cities, cars, "
    "characters and playstyles, plus light trivia about earlier GTA games. Keep it friendly and spoiler-free."
)

SYSTEM_PROMPT = """You write short, friendly posts for a GTA fan Telegram channel.
Rules:
- Only use facts you are sure about. If you are not sure of a fact, leave it out.
- Never reveal story details, endings or character deaths.
- Do not include links.
- Reply with one JSON array and nothing else. Each element is an object with these keys:
  "style": "poll" or "text",
  "question": for polls, 10 to 250 characters, ending with a question mark,
  "options": for polls, 2 to 4 answers of up to 80 characters each,
  "text": for text posts, 40 to 380 characters,
  "check": a short note on what the owner should double-check, or an empty string."""


def validate_fun(raw: str) -> list[dict]:
    data = extract_json(raw)
    if not isinstance(data, list):
        raise ValueError("the model reply was not a JSON array")
    items = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        check = str(entry.get("check") or "")[:200]
        if entry.get("style") == "poll":
            question = str(entry.get("question") or "").strip()
            options = [str(option).strip() for option in entry.get("options") or []]
            valid = (
                10 <= len(question) <= 250
                and 2 <= len(options) <= 4
                and all(1 <= len(option) <= 80 for option in options)
                and len(set(options)) == len(options)
            )
            if valid:
                items.append({"style": "poll", "question": question, "options": options, "check": check})
        elif entry.get("style") == "text":
            text = str(entry.get("text") or "").strip()
            if 40 <= len(text) <= 380 and "http" not in text.lower():
                items.append({"style": "text", "text": text, "check": check})
    return items


def recent_fun_texts(limit: int = 20) -> list[str]:
    """Recent items, so the model doesn't repeat itself."""
    items = [read_json(path, {}) for path in (common.STATE_DIR / "items").glob("*.json")]
    fun = sorted((i for i in items if i.get("kind") == "fun"), key=lambda i: i.get("created", ""))
    return [i.get("question") or i.get("text", "") for i in fun[-limit:]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Draft fun channel posts for Scout to approve.")
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--theme", default=DEFAULT_THEME)
    args = parser.parse_args()

    tg = Telegram.from_env()
    recent = "\n".join(f"- {text}" for text in recent_fun_texts())
    prompt = (
        f"Write {args.count} items.\nTheme: {args.theme}\n"
        f"Do not repeat or closely copy these recent items:\n{recent or '- (none yet)'}"
    )
    try:
        drafts = validate_fun(ask_llm(SYSTEM_PROMPT, prompt, max_tokens=1600))
    except LLMUnavailable as err:
        log(f"stopped: {err}")
        return
    except ValueError as err:
        log(f"no usable fun posts this time: {err}")
        return

    sent = 0
    for draft in drafts[: args.count]:
        item = {"id": new_id(), "kind": "fun", "status": "pending", "created": now_iso(), **draft}
        try:
            item["card_message_id"] = tg.send(tg.owner_id, fun_card_text(item), fun_buttons(item["id"]))
        except TelegramError as err:
            log(f"stopped: {err}")
            break
        save_item(item)
        sent += 1
    log(f"{sent} fun post(s) sent to Scout for approval")


if __name__ == "__main__":
    main()
