"""Shared pieces for the Scout pipeline: config, Telegram, the local model, saved items.

Standard library only, so nothing needs installing on the PC.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent
STATE_DIR = AUTOMATION_DIR / "state"

TELEGRAM_TEXT_LIMIT = 4096  # Bot API: characters per text message
POLL_QUESTION_LIMIT = 300  # Bot API: characters in a poll question
POLL_OPTION_LIMIT = 100  # Bot API: characters per poll option
ITEM_ID = re.compile(r"[0-9a-f]{12}")
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class TelegramError(RuntimeError):
    """A Telegram call failed. Messages never contain the bot token."""


class LLMUnavailable(RuntimeError):
    """The local model could not be reached. Stories are retried on the next run."""


def load_dotenv(path: Path) -> None:
    """Read KEY=VALUE lines from automation/.env. Real environment variables win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_dotenv(AUTOMATION_DIR / ".env")


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        raise SystemExit(f"Missing {name}. Add it to automation/.env (see automation/README.md).")
    return value


def repo_dir() -> Path:
    return Path(env("REPO_DIR", str(AUTOMATION_DIR.parent))).resolve()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat(timespec="seconds")


def new_id() -> str:
    return secrets.token_hex(6)  # 12 hex characters: short enough for button data


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def log(message: str) -> None:
    line = f"{now_iso()} {message}"
    print(line, flush=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with (STATE_DIR / "scout.log").open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


class Lock:
    """Single-writer lock so two publishes never overlap. Works on Windows and Linux."""

    def __init__(self, name: str, stale_after: float = 900):
        self.path = STATE_DIR / f"{name}.lock"
        self.stale_after = stale_after

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and time.time() - self.path.stat().st_mtime > self.stale_after:
            self.path.unlink(missing_ok=True)
        try:
            os.close(os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        except FileExistsError:
            raise RuntimeError("another publish is still running; try again in a minute") from None
        return self

    def __exit__(self, *exc_info):
        self.path.unlink(missing_ok=True)


class Telegram:
    """The few Bot API calls Scout needs. Built on urllib so nothing is installed."""

    def __init__(self, token: str, owner_id: int, api_base: str = "https://api.telegram.org"):
        self._token = token
        self.owner_id = owner_id
        self._base = api_base.rstrip("/")

    @classmethod
    def from_env(cls) -> "Telegram":
        return cls(
            env("TELEGRAM_BOT_TOKEN"),
            int(env("TELEGRAM_OWNER_ID")),
            env("TELEGRAM_API_BASE", "https://api.telegram.org"),
        )

    def call(self, method: str, payload: dict | None = None, timeout: int = 70):
        request = urllib.request.Request(
            f"{self._base}/bot{self._token}/{method}",
            data=json.dumps(payload or {}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as err:
            raw = err.read()  # Telegram sends a JSON error body with 4xx codes
        except (urllib.error.URLError, OSError) as err:
            # Never echo the URL: it contains the token.
            raise TelegramError(f"{method}: network error ({type(err).__name__})") from None
        try:
            reply = json.loads(raw.decode("utf-8") or "{}")
        except ValueError:
            raise TelegramError(f"{method}: unreadable reply") from None
        if not reply.get("ok"):
            raise TelegramError(f"{method} failed: {reply.get('description', 'unknown error')}")
        return reply["result"]

    def me(self) -> dict:
        return self.call("getMe")

    def webhook_url(self) -> str:
        return self.call("getWebhookInfo").get("url", "")

    def get_updates(self, offset: int) -> list:
        return self.call(
            "getUpdates",
            {"offset": offset, "timeout": 50, "allowed_updates": ["message", "callback_query"]},
            timeout=70,
        )

    def send(self, chat_id: int, text: str, buttons: list | None = None) -> int:
        payload = {
            "chat_id": chat_id,
            "text": text[:TELEGRAM_TEXT_LIMIT],
            "link_preview_options": {"is_disabled": True},
        }
        if buttons:
            payload["reply_markup"] = {"inline_keyboard": buttons}
        return self.call("sendMessage", payload)["message_id"]

    def edit(self, message_id: int, text: str) -> None:
        """Replace a card's text and remove its buttons, so it can't be pressed twice."""
        self.call(
            "editMessageText",
            {
                "chat_id": self.owner_id,
                "message_id": message_id,
                "text": text[:TELEGRAM_TEXT_LIMIT],
                "link_preview_options": {"is_disabled": True},
                "reply_markup": {"inline_keyboard": []},
            },
        )

    def answer(self, callback_id: str, text: str = "") -> None:
        self.call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text[:200]})

    def poll(self, chat_id: int, question: str, options: list[str]) -> int:
        question = question[:POLL_QUESTION_LIMIT]
        options = [option[:POLL_OPTION_LIMIT] for option in options]
        base = {"chat_id": chat_id, "question": question, "is_anonymous": True}
        try:
            # Current Bot API: each option is an InputPollOption object.
            return self.call("sendPoll", {**base, "options": [{"text": o} for o in options]})["message_id"]
        except TelegramError as err:
            if "option" not in str(err).lower():
                raise
            # Older servers expect plain strings.
            return self.call("sendPoll", {**base, "options": options})["message_id"]


def ask_llm(system: str, user: str, max_tokens: int = 1200) -> str:
    """Call the local Qwen3 model over its OpenAI-compatible API.

    The "/no_think" soft switch turns Qwen3's reasoning off, so the reply is just the answer.
    """
    base = env("LLM_BASE_URL", "http://127.0.0.1:11434/v1").rstrip("/")
    payload = {
        "model": env("LLM_MODEL", "qwen3:14b"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user + "\n/no_think"},
        ],
        "temperature": 0.7,
        "top_p": 0.8,
        "max_tokens": max_tokens,
        "stream": False,
    }
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=900) as response:
            reply = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raise LLMUnavailable(f"the model server answered {err.code}") from None
    except (urllib.error.URLError, OSError) as err:
        raise LLMUnavailable(f"the local model is not reachable ({type(err).__name__})") from None
    return THINK_BLOCK.sub("", reply["choices"][0]["message"]["content"]).strip()


def extract_json(text: str):
    """Return the first JSON object or array found in a model reply."""
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char in "{[":
            try:
                value, _ = decoder.raw_decode(text, index)
                return value
            except ValueError:
                continue
    raise ValueError("the model reply contained no JSON")


def clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"


def shingles(text: str, size: int = 8) -> set[str]:
    words = re.findall(r"\w+", text.lower())
    return {" ".join(words[i : i + size]) for i in range(len(words) - size + 1)}


def copy_risk(new_text: str, source_text: str) -> bool:
    """True when the draft repeats any run of 8 consecutive words from the source."""
    return bool(shingles(new_text) & shingles(source_text))


def item_path(item_id: str) -> Path:
    if not ITEM_ID.fullmatch(item_id or ""):
        raise ValueError("unknown item id")
    return STATE_DIR / "items" / f"{item_id}.json"


def load_item(item_id: str):
    return read_json(item_path(item_id), None)


def save_item(item: dict) -> None:
    write_json(item_path(item["id"]), item)


def news_buttons(item_id: str) -> list:
    return [[
        {"text": "✅ Publish", "callback_data": f"p:{item_id}"},
        {"text": "🗑 Reject", "callback_data": f"x:{item_id}"},
    ]]


def fun_buttons(item_id: str) -> list:
    return [[
        {"text": "✅ Approve", "callback_data": f"f:{item_id}"},
        {"text": "🗑 Reject", "callback_data": f"g:{item_id}"},
    ]]


def news_card_text(post: dict, test: bool = False) -> str:
    header = "TEST DRAFT: nothing goes live" if test else f"NEWS DRAFT · {post['status'].upper()}"
    source = post["sources"][0]
    return (
        f"{header}\n\n{post['title']}\n\n{post['description']}\n\n{post['body'][:2400]}\n\n"
        f"Source: {source['name']}\n{source['url']}\n\nPublish this to the website?"
    )


def fun_card_text(item: dict) -> str:
    if item["style"] == "poll":
        content = f"POLL: {item['question']}\n" + "\n".join(f"• {option}" for option in item["options"])
    else:
        content = f"POST: {item['text']}"
    check = f"\n\nCheck first: {item['check']}" if item.get("check") else ""
    return f"FUN POST DRAFT\n\n{content}{check}\n\nApprove to queue it for the channel?"
