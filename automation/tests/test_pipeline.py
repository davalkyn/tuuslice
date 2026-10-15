"""Offline tests for the Scout pipeline. No Telegram or model calls, and no real git remote.

Run from the repo root:  python -m unittest discover -s automation/tests -v
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

AUTOMATION = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AUTOMATION))

import common  # noqa: E402
import draft_fun  # noqa: E402
import draft_news  # noqa: E402
import publisher  # noqa: E402
import scout  # noqa: E402

SAMPLE_POST = {
    "title": "GTA 6 launch date confirmed for November 19",
    "description": "Rockstar's launch date is November 19, 2026 for PS5 and Xbox Series X|S.",
    "status": "verified",
    "tags": ["release date", "ps5"],
    "body": (
        "Rockstar has kept the launch date for November 19, 2026, on PlayStation 5 and Xbox Series X and S. "
        "PC is not dated yet.\n\nThat is the only confirmed detail for now."
    ),
    "sources": [{"name": "Official newsroom", "url": "https://example.com/launch"}],
}


class FakeTelegram:
    owner_id = 111

    def __init__(self):
        self.calls = []

    def answer(self, callback_id, text=""):
        self.calls.append(("answer", text))

    def send(self, chat_id, text, buttons=None):
        self.calls.append(("send", chat_id, text))
        return 42

    def edit(self, message_id, text):
        self.calls.append(("edit", message_id, text))

    def poll(self, chat_id, question, options):
        self.calls.append(("poll", chat_id, question, options))
        return 77


def git(*args: str, cwd: Path) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self._saved_state = common.STATE_DIR
        self._saved_env = dict(os.environ)
        common.STATE_DIR = self.tmp / "state"
        os.environ.update(
            {
                "TELEGRAM_OWNER_ID": "111",
                "TELEGRAM_CHANNEL_ID": "-1001",
                "PUBLISH_BRANCH": "master",
                "SCOUT_GIT_NAME": "Scout",
                "SCOUT_GIT_EMAIL": "scout@test.local",
            }
        )
        self.site = self._make_site()
        os.environ["REPO_DIR"] = str(self.site)

    def tearDown(self):
        common.STATE_DIR = self._saved_state
        os.environ.clear()
        os.environ.update(self._saved_env)

    def _make_site(self) -> Path:
        origin = self.tmp / "origin.git"
        site = self.tmp / "site"
        git("init", "-q", "--bare", "-b", "master", str(origin), cwd=self.tmp)
        git("init", "-q", "-b", "master", str(site), cwd=self.tmp)
        (site / "src/content/news").mkdir(parents=True)
        (site / "src/content/news/.gitkeep").write_text("")
        git("config", "user.email", "tester@test.local", cwd=site)
        git("config", "user.name", "Tester", cwd=site)
        git("add", "-A", cwd=site)
        git("commit", "-qm", "init", cwd=site)
        git("remote", "add", "origin", str(origin), cwd=site)
        git("push", "-q", "-u", "origin", "master", cwd=site)
        return site

    def _pending_news(self, test: bool = False) -> dict:
        item = {
            "id": common.new_id(),
            "kind": "news",
            "status": "pending",
            "created": common.now_iso(),
            "post": SAMPLE_POST,
            "test": test,
            "card_message_id": 42,
        }
        common.save_item(item)
        return item

    def _pending_fun(self) -> dict:
        item = {
            "id": common.new_id(),
            "kind": "fun",
            "style": "poll",
            "question": "Which GTA city do you like best?",
            "options": ["Vice City", "Los Santos"],
            "check": "",
            "status": "pending",
            "created": common.now_iso(),
            "card_message_id": 9,
        }
        common.save_item(item)
        return item

    # ---- parsing and checks -------------------------------------------------

    def test_extract_json_ignores_prose_and_think_blocks(self):
        reply = common.THINK_BLOCK.sub("", "<think>hmm {not this}</think> Sure: {\"title\": \"x\"} thanks")
        self.assertEqual(common.extract_json(reply), {"title": "x"})

    def test_verified_needs_an_official_feed(self):
        raw = json.dumps(
            {"title": "A title", "description": "A short description.", "status": "verified", "tags": ["GTA 6!"], "body": "x" * 130}
        )
        self.assertEqual(draft_news.validate_news(raw, official=False)["status"], "unconfirmed")
        post = draft_news.validate_news(raw, official=True)
        self.assertEqual(post["status"], "verified")
        self.assertEqual(post["tags"], ["gta 6"])

    def test_links_in_the_body_are_rejected(self):
        raw = json.dumps({"title": "t", "description": "d", "status": "rumor", "tags": [], "body": "See https://evil.example " + "x" * 130})
        with self.assertRaises(ValueError):
            draft_news.validate_news(raw, official=False)

    def test_copy_risk_catches_eight_word_runs_but_allows_paraphrase(self):
        source = "Rockstar Games said the new trailer will show Vice City in full detail next week for fans."
        self.assertTrue(common.copy_risk("Reports say Rockstar Games said the new trailer will show Vice City in full detail.", source))
        self.assertFalse(common.copy_risk("A fresh look at Vice City is expected soon, according to the studio.", source))

    def test_fun_validation_drops_bad_polls(self):
        raw = json.dumps(
            [
                {"style": "poll", "question": "Which GTA city do you like best?", "options": ["Vice City"]},
                {"style": "poll", "question": "Which GTA city do you like best?", "options": ["Vice City", "Liberty City"], "check": ""},
                {"style": "text", "text": "Launch week is almost here: what will you do first when the map opens up?", "check": ""},
            ]
        )
        self.assertEqual([item["style"] for item in draft_fun.validate_fun(raw)], ["poll", "text"])

    # ---- publishing ----------------------------------------------------------

    def test_rendered_post_has_the_fields_the_site_schema_needs(self):
        text = publisher.render_news(SAMPLE_POST, "2026-10-15")
        self.assertTrue(text.startswith("---\n"))
        for line in [
            'title: "GTA 6 launch date confirmed for November 19"',
            "pubDate: 2026-10-15",
            "status: verified",
            "featured: false",
            "draft: false",
        ]:
            self.assertIn(line, text)

    def test_publish_commits_and_pushes_to_the_branch(self):
        sha = publisher.publish_news(SAMPLE_POST, draft_id="abcdef123456")
        self.assertTrue(sha)
        self.assertEqual(len(list((self.site / "src/content/news").glob("*.md"))), 1)
        self.assertIn("News: GTA 6 launch date confirmed", git("log", "--oneline", "-1", "master", cwd=self.tmp / "origin.git"))
        self.assertEqual(git("status", "--porcelain", cwd=self.site), "")

    def test_publish_refuses_changed_tracked_files(self):
        (self.site / "src/content/news/.gitkeep").write_text("edited by hand")
        with self.assertRaises(RuntimeError):
            publisher.publish_news(SAMPLE_POST, draft_id="abcdef123456")
        self.assertFalse(list((self.site / "src/content/news").glob("*.md")))

    def test_stray_untracked_files_do_not_block_publishing(self):
        (self.site / "Thumbs.db").write_text("windows junk")
        publisher.publish_news(SAMPLE_POST, draft_id="abcdef123456")
        self.assertEqual(len(list((self.site / "src/content/news").glob("*.md"))), 1)

    # ---- button handling -----------------------------------------------------

    def test_a_stranger_cannot_publish(self):
        item = self._pending_news()
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 999}, "data": f"p:{item['id']}"}, dry_run=True)
        self.assertEqual(common.load_item(item["id"])["status"], "pending")
        self.assertIn(("answer", "Not for you."), tg.calls)

    def test_owner_publish_updates_the_card_once(self):
        item = self._pending_news()
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": f"p:{item['id']}"}, dry_run=True)
        self.assertEqual(common.load_item(item["id"])["status"], "published")
        edits = [call for call in tg.calls if call[0] == "edit"]
        self.assertEqual(len(edits), 1)
        self.assertIn("Published", edits[0][2])
        # A second press does nothing.
        scout.handle_callback(tg, {"id": "2", "from": {"id": 111}, "data": f"p:{item['id']}"}, dry_run=True)
        self.assertIn(("send", 111, "That draft is already published."), tg.calls)

    def test_reject_publishes_nothing(self):
        item = self._pending_news()
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": f"x:{item['id']}"}, dry_run=True)
        self.assertEqual(common.load_item(item["id"])["status"], "rejected")
        self.assertFalse(list((self.site / "src/content/news").glob("*.md")))

    def test_test_drafts_never_reach_git(self):
        item = self._pending_news(test=True)
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": f"p:{item['id']}"}, dry_run=False)
        self.assertEqual(common.load_item(item["id"])["status"], "published")
        self.assertFalse(list((self.site / "src/content/news").glob("*.md")))
        self.assertTrue(list((common.STATE_DIR / "dry-run").glob("*.md")))

    def test_bad_ids_are_refused_and_reported(self):
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": "p:../../etc"}, dry_run=True)
        self.assertTrue(any(call[0] == "send" and "Not done" in call[2] for call in tg.calls))

    # ---- fun posts -----------------------------------------------------------

    def test_approving_fun_gives_the_next_slot_and_spaces_posts(self):
        os.environ["FUN_POST_INTERVAL_HOURS"] = "6"
        first = self._pending_fun()
        second = self._pending_fun()
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": f"f:{first['id']}"}, dry_run=True)
        scout.handle_callback(tg, {"id": "2", "from": {"id": 111}, "data": f"f:{second['id']}"}, dry_run=True)
        a = common.load_item(first["id"])
        b = common.load_item(second["id"])
        self.assertEqual(a["status"], "approved")
        self.assertEqual(b["status"], "approved")
        gap = common.datetime.fromisoformat(b["post_at"]) - common.datetime.fromisoformat(a["post_at"])
        self.assertEqual(gap, timedelta(hours=6))
        del os.environ["FUN_POST_INTERVAL_HOURS"]

    def test_fun_item_posts_only_when_due(self):
        item = self._pending_fun()
        item.update(status="approved", post_at=(common.now_utc() + timedelta(hours=1)).isoformat(timespec="seconds"))
        common.save_item(item)
        tg = FakeTelegram()
        scout.post_due_items(tg, dry_run=False)
        self.assertEqual(tg.calls, [])

        item["post_at"] = (common.now_utc() - timedelta(minutes=1)).isoformat(timespec="seconds")
        common.save_item(item)
        scout.post_due_items(tg, dry_run=False)
        self.assertEqual(common.load_item(item["id"])["status"], "posted")
        self.assertEqual(tg.calls[0][0], "poll")
        self.assertEqual(tg.calls[0][1], -1001)

    def test_fun_approval_needs_a_channel(self):
        del os.environ["TELEGRAM_CHANNEL_ID"]
        item = self._pending_fun()
        tg = FakeTelegram()
        scout.handle_callback(tg, {"id": "1", "from": {"id": 111}, "data": f"f:{item['id']}"}, dry_run=True)
        self.assertEqual(common.load_item(item["id"])["status"], "pending")
        self.assertTrue(any("TELEGRAM_CHANNEL_ID" in call[2] for call in tg.calls if call[0] == "send"))


if __name__ == "__main__":
    unittest.main()
