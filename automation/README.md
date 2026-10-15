# Scout: news and fun posts, approved in Telegram

Nothing reaches the website or the channel until you press a button in Telegram.

```
feeds ──► draft_news.py ──► Qwen3 writes a draft ──► Scout sends it to you
                                                          │
                              you press Publish ◄─────────┘
                                   │
                  publisher.py writes the post, commits and pushes
                                   │
              Cloudflare rebuilds the site (about 2 minutes)

draft_fun.py ──► Qwen3 writes polls/posts ──► you press Approve ──► Scout posts to the channel on schedule
```

Everything runs on your PC. The PC only needs to be on when you want new drafts or to press buttons. The site stays online on Cloudflare either way.

## Files

| File | What it does |
| --- | --- |
| `scout.py` | The Telegram bot. The only process that reads its updates. Handles buttons, posts approved fun items. |
| `draft_news.py` | Reads the feeds in `sources.json`, drafts new stories with the local model, sends them to Scout. |
| `draft_fun.py` | Drafts polls and short channel posts, sends them to Scout for approval. |
| `publisher.py` | Writes an approved news post as Markdown, commits it and pushes to the site branch. |
| `common.py` | Config, Telegram calls, local model calls, shared checks. |
| `sources.json` | The feeds you trust. Empty until you add some. |
| `.env.example` | Settings template. Copy it to `.env` and fill it in. |
| `tests/` | Offline tests: `python -m unittest discover -s automation/tests -v` |

## Rules built in

- Only your Telegram user ID can press buttons. Anyone else gets "Not for you".
- Links in a post come only from the feed, never from the model.
- A draft can be labelled **verified** only if its feed is marked `"official": true`. Otherwise it is downgraded to unconfirmed.
- A draft that repeats 8 or more words from its source is rejected and rewritten once.
- Publishing refuses to run if the site checkout has changed tracked files, or if it isn't on the publish branch. A failed push is rolled back.
- Fun items get a slot at least `FUN_POST_INTERVAL_HOURS` apart, so the channel isn't flooded.

## One-time setup

1. **Replace the bot token.** The token you pasted into the chat is now in the transcript. In Telegram open @BotFather, send `/mybots`, pick GodModeV_bot, then **API Token → Revoke**. Use the new token only in `automation/.env` on your PC.
2. **Install Python 3.10 or newer** (python.org). On Windows, tick "Add python.exe to PATH". No packages to install, because everything uses the standard library.
3. **Let the PC push to GitHub without prompts.** Use Git Credential Manager with a fine-grained GitHub token limited to `davalkyn/tuuslice`, with Contents set to read and write. Don't put the token in the repo URL.
4. **Get a checkout on `master`** (the branch Cloudflare deploys). Set `REPO_DIR` to its full path.
5. **Create `automation/.env`** by copying `.env.example`. Fill in:
   - `TELEGRAM_BOT_TOKEN`: the new token from step 1
   - `TELEGRAM_OWNER_ID`: your numeric user ID (see step 7)
   - `TELEGRAM_CHANNEL_ID`: the community channel's ID (see step 8)
   - `LLM_BASE_URL` and `LLM_MODEL`: wherever Qwen3 14B answers. Ollama is `http://127.0.0.1:11434/v1` with model `qwen3:14b`. LM Studio's server is usually `http://127.0.0.1:1234/v1`.
   - `REPO_DIR` and `PUBLISH_BRANCH=master`
6. **Check the token:** `python automation/scout.py check`. It should say "Token works" and report no webhook.
7. **Find your user ID:** open a chat with Scout and send `/start`. Then run `python automation/scout.py ids` and copy your user ID into `.env`. (Stop `serve` first if it's running. Telegram allows only one reader at a time.)
8. **Connect the channel (for fun posts):**
   - In the channel's settings, add Scout as an admin with permission to post messages.
   - Forward any post from the channel to Scout.
   - Run `python automation/scout.py ids` and copy the `chat id` starting with `-100` into `TELEGRAM_CHANNEL_ID`.
9. **Test the buttons without publishing:** `python automation/scout.py test-card`, then press **Publish** on the card. The test draft lands in `automation/state/dry-run/` and never reaches git or the site.
10. **Add your feeds** to `sources.json`. Set `"official": true` only for newsroom feeds run by Rockstar, Take-Two, PlayStation or Xbox.

## Running it

Keep this running, in its own window:

```
python automation/scout.py serve
```

Draft news a few times a day, and fun posts once a day. In Windows Task Scheduler, create tasks whose action runs from the repo folder:

```
cd /d C:\path\to\tuuslice && python automation\draft_news.py
cd /d C:\path\to\tuuslice && python automation\draft_fun.py --count 4
```

Set news to run at 08:00, 12:00, 16:00 and 20:00. Turn on "Run task as soon as possible after a scheduled start is missed", so a sleeping PC catches up.

**Hermes:** it can run these same commands on its own schedule. Two rules: do not put the Scout token in Hermes's Telegram settings, because two readers on one bot split the button presses. And check that its scheduler really runs missed jobs. Its docs didn't say.

## Tuning

| Setting | Default | Meaning |
| --- | --- | --- |
| `NEWS_MAX_PER_RUN` | 3 | Drafts per drafting run, so approvals stay manageable |
| `FUN_POST_INTERVAL_HOURS` | 6 | Minimum gap between approved fun posts |
| `draft_fun.py --count` | 4 | Fun items per batch |
| `draft_fun.py --theme "…"` | GTA fan fun | What the fun items are about |

## Known limits

- The model only sees what the feed gives it. Feeds that include the full article text give better drafts than headline-only feeds.
- A 14B local model can still get facts wrong. Read every draft before you press Publish. The "Source" line on each card links to the original.
- Polls are sent with the current Bot API option format and fall back to plain strings. These were tested against a stand-in server, so check the first real poll in the channel.
- Scout only acts while `serve` is running. Presses made while it's off wait in Telegram for a limited time, so start it again soon.
