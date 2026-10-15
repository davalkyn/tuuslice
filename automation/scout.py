"""Scout: the approval bot. Run it on your PC.

    python automation/scout.py check              verify the token and webhook (sends nothing)
    python automation/scout.py test-card          send one sample draft with buttons (publishes nowhere)
    python automation/scout.py ids                show your user ID and channel ID (stop serve first)
    python automation/scout.py serve              keep running: handle buttons, post approved fun items
    python automation/scout.py serve --dry-run    same, but publishing only writes to automation/state/dry-run

Scout is the only process that reads this bot's updates. Hermes must not use the same token.
"""

from __future__ import annotations

import argparse
import os
import time
from datetime import datetime, timedelta

import common
import publisher
from common import (
    Telegram,
    TelegramError,
    fun_card_text,
    load_item,
    log,
    news_buttons,
    news_card_text,
    new_id,
    now_iso,
    now_utc,
    read_json,
    save_item,
    write_json,
)


def finish_news(tg: Telegram, item_id: str, publish: bool, dry_run: bool) -> str | None:
    """Publish or reject a news draft. Returns a message for the owner only when nothing changed."""
    item = load_item(item_id)
    if item is None:
        return "That draft no longer exists."
    if item["status"] != "pending":
        return f"That draft is already {item['status']}."
    if not publish:
        item["status"] = "rejected"
        save_item(item)
        tg.edit(item["card_message_id"], news_card_text(item["post"], item["test"]) + "\n\n🗑 Rejected. Nothing was published.")
        return None
    ref = publisher.publish_news(item["post"], draft_id=item["id"], dry_run=dry_run or item["test"])
    item.update(status="published", published_ref=ref, published_at=now_iso())
    save_item(item)
    tg.edit(
        item["card_message_id"],
        news_card_text(item["post"], item["test"]) + f"\n\n✅ Published ({ref}). The site rebuilds in a few minutes.",
    )
    return None


def finish_fun(tg: Telegram, item_id: str, approve: bool) -> str | None:
    """Approve or reject a fun item. Approved items get the next free posting slot."""
    item = load_item(item_id)
    if item is None or item.get("kind") != "fun":
        return "That item no longer exists."
    if item["status"] != "pending":
        return f"That item is already {item['status']}."
    if not approve:
        item["status"] = "rejected"
        save_item(item)
        tg.edit(item["card_message_id"], fun_card_text(item) + "\n\n🗑 Rejected.")
        return None
    if not os.environ.get("TELEGRAM_CHANNEL_ID"):
        return "Set TELEGRAM_CHANNEL_ID in automation/.env first. Nothing was queued."

    schedule_path = common.STATE_DIR / "fun_schedule.json"
    schedule = read_json(schedule_path, {})
    now = now_utc()
    next_slot = datetime.fromisoformat(schedule["next_slot"]) if schedule.get("next_slot") else now
    slot = max(now, next_slot)
    interval = timedelta(hours=float(os.environ.get("FUN_POST_INTERVAL_HOURS", "6")))
    write_json(schedule_path, {"next_slot": (slot + interval).isoformat(timespec="seconds")})

    item.update(status="approved", post_at=slot.isoformat(timespec="seconds"))
    save_item(item)
    when = slot.astimezone().strftime("%a %H:%M")
    tg.edit(item["card_message_id"], fun_card_text(item) + f"\n\n✅ Approved. Posts {when} (your local time).")
    return None


def handle_callback(tg: Telegram, query: dict, dry_run: bool) -> None:
    sender = query.get("from", {}).get("id")
    if sender != tg.owner_id:
        tg.answer(query["id"], "Not for you.")
        log(f"ignored a button press from user {sender}")
        return
    tg.answer(query["id"], "On it…")
    action, _, item_id = query.get("data", "").partition(":")
    try:
        if action in ("p", "x"):
            outcome = finish_news(tg, item_id, publish=action == "p", dry_run=dry_run)
        elif action in ("f", "g"):
            outcome = finish_fun(tg, item_id, approve=action == "f")
        else:
            outcome = "Unknown button."
    except Exception as err:  # the item stays pending, so nothing half-happens
        log(f"button {action}:{item_id} failed: {err}")
        outcome = f"Not done: {err}"
    if outcome:
        tg.send(tg.owner_id, outcome)


def handle_update(tg: Telegram, update: dict, dry_run: bool) -> None:
    if "callback_query" in update:
        handle_callback(tg, update["callback_query"], dry_run)
        return
    message = update.get("message") or {}
    if message.get("from", {}).get("id") != tg.owner_id:
        return  # this bot only answers its owner
    text = message.get("text", "")
    if text.startswith("/start"):
        tg.send(tg.owner_id, "Scout is online. News drafts and fun posts will arrive here for approval.")
    elif text.startswith("/status"):
        tg.send(tg.owner_id, f"{pending_count()} item(s) waiting for your approval.")


def pending_count() -> int:
    return sum(1 for path in (common.STATE_DIR / "items").glob("*.json") if read_json(path, {}).get("status") == "pending")


def post_due_items(tg: Telegram, dry_run: bool) -> None:
    """Post approved fun items whose slot has arrived."""
    channel = os.environ.get("TELEGRAM_CHANNEL_ID")
    now = now_utc()
    for path in sorted((common.STATE_DIR / "items").glob("*.json")):
        item = read_json(path, None)
        if not item or item.get("kind") != "fun" or item.get("status") != "approved":
            continue
        if datetime.fromisoformat(item["post_at"]) > now:
            continue
        if dry_run:
            item.update(status="posted", posted_ref="dry run", posted_at=now_iso())
            log(f"dry run: would post {item['id']} to the channel")
        else:
            if not channel:
                log(f"cannot post {item['id']}: TELEGRAM_CHANNEL_ID is not set")
                continue
            try:
                if item["style"] == "poll":
                    ref = tg.poll(int(channel), item["question"], item["options"])
                else:
                    ref = tg.send(int(channel), item["text"])
            except TelegramError as err:
                log(f"could not post {item['id']}: {err}")
                continue
            item.update(status="posted", posted_ref=str(ref), posted_at=now_iso())
        save_item(item)
        log(f"posted fun item {item['id']}")


def send_test_card(tg: Telegram) -> None:
    post = {
        "title": "TEST: Scout approval check",
        "description": "A sample draft to check the buttons. Publish only writes it to the dry-run folder.",
        "status": "unconfirmed",
        "tags": ["test"],
        "body": "This is sample text for the approval check. Pressing Publish on a test draft never touches the website.",
        "sources": [{"name": "Scout test", "url": "https://example.com/test"}],
    }
    item = {"id": new_id(), "kind": "news", "status": "pending", "created": now_iso(), "post": post, "test": True}
    item["card_message_id"] = tg.send(tg.owner_id, news_card_text(post, test=True), news_buttons(item["id"]))
    save_item(item)
    print("Test card sent. Press Publish on it: the draft should only appear in automation/state/dry-run.")


def check() -> None:
    tg = Telegram.from_env()
    me = tg.me()
    print(f"Token works: @{me['username']} ({me['first_name']}).")
    if tg.webhook_url():
        print("A webhook is set. Scout cannot read updates until it is removed.")
    else:
        print("No webhook is set, so Scout can read button presses.")


def show_ids() -> None:
    """Print the user and chat IDs in Telegram's waiting updates: your user ID, and the channel ID.

    Stop `serve` first. Telegram allows one reader of updates at a time.
    """
    tg = Telegram.from_env()
    chats: dict = {}
    for update in tg.get_updates(0):
        message = update.get("message") or update.get("channel_post") or {}
        sender = message.get("from") or {}
        if sender:
            print(f"user id {sender.get('id')} ({sender.get('first_name', '')})")
        chat = message.get("chat") or {}
        if chat:
            chats[chat.get("id")] = (chat.get("type"), chat.get("title") or chat.get("first_name") or "")
        forwarded = message.get("forward_from_chat") or {}
        if forwarded:
            chats[forwarded.get("id")] = (forwarded.get("type"), forwarded.get("title") or "")
    for chat_id, (kind, name) in chats.items():
        print(f"chat id {chat_id} ({kind}) {name}")
    if not chats:
        print("No waiting updates. Send /start to Scout, or forward a channel post to Scout, then run this again.")


def serve(dry_run: bool) -> None:
    tg = Telegram.from_env()
    if tg.webhook_url():
        raise SystemExit("A webhook is set on this bot, so Scout cannot read updates. Remove the webhook first.")
    offset_path = common.STATE_DIR / "offset.json"
    offset = read_json(offset_path, {"offset": 0})["offset"]
    log("Scout is running" + (" in dry-run mode" if dry_run else "") + ". Press Ctrl+C to stop.")
    while True:
        try:
            updates = tg.get_updates(offset)
        except TelegramError as err:
            log(f"update poll failed: {err}")
            time.sleep(10)
            updates = []
        for update in updates:
            try:
                handle_update(tg, update, dry_run)
            except Exception as err:  # keep serving; the item stays pending
                log(f"update {update.get('update_id')} failed: {err}")
            offset = update["update_id"] + 1
            write_json(offset_path, {"offset": offset})
        try:
            post_due_items(tg, dry_run)
        except Exception as err:
            log(f"scheduled posting failed: {err}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scout: the Telegram approval bot for the GTA site.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="verify the token and webhook")
    sub.add_parser("test-card", help="send one sample draft")
    sub.add_parser("ids", help="show your user ID and chat IDs from waiting updates")
    serve_parser = sub.add_parser("serve", help="run the approval bot")
    serve_parser.add_argument("--dry-run", action="store_true", help="never touch git or the channel")
    args = parser.parse_args()

    if args.command == "check":
        check()
    elif args.command == "test-card":
        send_test_card(Telegram.from_env())
    elif args.command == "ids":
        show_ids()
    else:
        serve(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
