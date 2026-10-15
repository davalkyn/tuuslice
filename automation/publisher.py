"""Turn an approved news post into a Markdown file and push it, so Cloudflare rebuilds the site.

Only Scout calls this, and only after you press Publish in Telegram.
"""

from __future__ import annotations

import json
import re
import subprocess
import unicodedata
from pathlib import Path

import common

NEWS_DIR = Path("src/content/news")


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=300)
    if result.returncode:
        raise RuntimeError(f"git {args[0]} failed: {result.stderr.strip()[-200:]}")
    return result.stdout.strip()


def yaml_str(value: str) -> str:
    # A JSON string is also a valid YAML double-quoted string.
    return json.dumps(value, ensure_ascii=False)


def slugify(title: str) -> str:
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")
    return slug[:60].strip("-") or "news"


def render_news(post: dict, pub_date: str) -> str:
    """Markdown with the frontmatter that src/content.config.ts expects for news."""
    lines = [
        "---",
        f"title: {yaml_str(post['title'])}",
        f"description: {yaml_str(post['description'])}",
        f"pubDate: {pub_date}",
        f"status: {post['status']}",
        "tags:" if post["tags"] else "tags: []",
    ]
    lines += [f"  - {yaml_str(tag)}" for tag in post["tags"]]
    lines.append("sources:")
    for source in post["sources"]:
        lines.append(f"  - name: {yaml_str(source['name'])}")
        lines.append(f"    url: {yaml_str(source['url'])}")
    lines += ["featured: false", "draft: false", "---", "", post["body"].strip(), ""]
    return "\n".join(lines)


def publish_news(post: dict, *, draft_id: str, dry_run: bool = False) -> str:
    """Write the post, commit it and push. Returns the short commit id (or a dry-run label)."""
    pub_date = common.now_utc().date().isoformat()
    slug = f"{slugify(post['title'])}-{draft_id[:4]}"
    markdown = render_news(post, pub_date)

    if dry_run:
        path = common.STATE_DIR / "dry-run" / f"{slug}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(markdown, encoding="utf-8")
        return f"dry run: {path.name}"

    repo = common.repo_dir()
    branch = common.env("PUBLISH_BRANCH", "master")
    relative = NEWS_DIR / f"{slug}.md"
    target = repo / relative
    name = common.env("SCOUT_GIT_NAME", "Scout")
    email = common.env("SCOUT_GIT_EMAIL", "scout@localhost")

    with common.Lock("publish"):
        # Only changed tracked files block a publish. Stray untracked files (Thumbs.db, editor backups)
        # are ignored, because only the new post file is ever staged.
        if git("status", "--porcelain", "--untracked-files=no", cwd=repo):
            raise RuntimeError("the site checkout has uncommitted changes, so nothing was published")
        current = git("rev-parse", "--abbrev-ref", "HEAD", cwd=repo)
        if current != branch:
            raise RuntimeError(f"the site checkout is on '{current}', expected '{branch}'")
        git("pull", "--ff-only", "origin", branch, cwd=repo)
        before = git("rev-parse", "HEAD", cwd=repo)

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(markdown, encoding="utf-8")
        try:
            git("add", str(relative), cwd=repo)
            git(
                "-c", f"user.name={name}", "-c", f"user.email={email}",
                "commit", "-m", f"News: {post['title']}",
                cwd=repo,
            )
            git("push", "origin", f"HEAD:{branch}", cwd=repo)
        except Exception:
            # Undo the local commit and file so the checkout matches the remote again.
            git("reset", "--hard", before, cwd=repo)
            target.unlink(missing_ok=True)
            raise
        common.log(f"published {slug}")
        return git("rev-parse", "--short", "HEAD", cwd=repo)
