#!/usr/bin/env python3
"""Sends outbox/*.json posts to the Telegram channel set in config.json.

Post format:
  {
    "send_at": "2026-11-12T16:00:00+03:00",   # optional; waits until then (if in the future)
    "messages": ["<b>HTML</b> text", ...],      # sent in order, split if longer than Telegram allows
    "poll": {"question": "...", "options": ["...", "..."], "multiple": true}   # optional, sent last
  }

Without post files it only checks the setup: prints the channel the bot sees,
or, when config.json has no chat_id yet, the chats from the bot's recent updates.

The bot token comes from the TELEGRAM_BOT_TOKEN env var (a GitHub secret).
DRY_RUN=1 prints what would be sent instead of calling Telegram.
"""
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN") == "1"
MAX_TEXT = 4000  # Telegram limit is 4096
MAX_WAIT = 3 * 3600


def call(method, **params):
    if DRY_RUN:
        print(f"--- {method}: {json.dumps(params, ensure_ascii=False, indent=1)}")
        return {"ok": True, "result": {}}
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    body = json.dumps(params).encode()
    for attempt in range(5):
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            res = json.load(e)
            retry = (res.get("parameters") or {}).get("retry_after")
            if e.code == 429 and retry:
                time.sleep(int(retry) + 1)
                continue
            return res
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 4:
                return {"ok": False, "description": str(e)}
            time.sleep(2 ** attempt)
    return {"ok": False, "description": "too many retries"}


def chunks(text, limit=MAX_TEXT):
    """Splits on blank lines, then lines, then hard cuts, keeping each part under the limit."""
    units = []  # (separator before the piece, piece)
    for para in text.split("\n\n"):
        lines = [para] if len(para) <= limit else para.split("\n")
        for j, line in enumerate(lines):
            sep = "\n\n" if j == 0 else "\n"
            while len(line) > limit:
                units.append((sep, line[:limit]))
                line, sep = line[limit:], ""
            units.append((sep, line))
    parts, cur = [], ""
    for sep, piece in units:
        if cur and len(cur) + len(sep) + len(piece) > limit:
            parts.append(cur)
            cur = piece
        else:
            cur = f"{cur}{sep}{piece}" if cur else piece
    if cur:
        parts.append(cur)
    return parts


def plain(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def send_text(chat, text):
    for part in chunks(text):
        common = {"chat_id": chat, "link_preview_options": {"is_disabled": True}}
        res = call("sendMessage", text=part, parse_mode="HTML", **common)
        if not res.get("ok") and "entit" in res.get("description", "").lower():
            print(f"HTML rejected ({res.get('description')}), sending as plain text")
            res = call("sendMessage", text=plain(part), **common)
        if not res.get("ok"):
            sys.exit(f"sendMessage failed: {res}")


def send_poll(chat, poll):
    options = [str(o).strip()[:100] for o in poll.get("options", []) if str(o).strip()][:12]
    if len(options) < 2:
        print("poll skipped: fewer than 2 options")
        return
    res = call(
        "sendPoll",
        chat_id=chat,
        question=str(poll.get("question", "Что заказать?"))[:300],
        options=[{"text": o} for o in options],
        is_anonymous=True,
        allows_multiple_answers=bool(poll.get("multiple", True)),
    )
    if not res.get("ok"):
        sys.exit(f"sendPoll failed: {res}")


def wait_until(send_at):
    try:
        at = datetime.datetime.fromisoformat(send_at)
    except (TypeError, ValueError):
        print(f"bad send_at {send_at!r}, sending now")
        return
    if at.tzinfo is None:
        at = at.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=3)))  # Moscow
    delay = (at - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
    if 0 < delay <= MAX_WAIT:
        print(f"waiting {int(delay)}s until {send_at}")
        if not DRY_RUN:
            time.sleep(delay)


def check_setup(chat):
    if chat:
        res = call("getChat", chat_id=chat)
        if not res.get("ok"):
            sys.exit(f"bot cannot see chat {chat}: {res}")
        r = res.get("result", {})
        print(f"OK: chat {r.get('id')} '{r.get('title')}' @{r.get('username')}")
        return
    res = call("getUpdates", allowed_updates=["channel_post", "my_chat_member", "message"])
    seen = {}
    for u in res.get("result", []):
        for key in ("channel_post", "my_chat_member", "message"):
            c = (u.get(key) or {}).get("chat")
            if c:
                seen[c["id"]] = c
    for c in seen.values():
        print(f"chat_id={c['id']} type={c.get('type')} title={c.get('title')} username={c.get('username')}")
    sys.exit("config.json has no chat_id yet; pick one from the list above")


def main(files):
    if not TOKEN and not DRY_RUN:
        sys.exit("TELEGRAM_BOT_TOKEN is not set")
    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        chat = str(json.load(f).get("chat_id", "")).strip()
    if not files:
        check_setup(chat)
        return
    if not chat:
        check_setup(chat)
    for path in sorted(files):
        with open(os.path.join(ROOT, path), encoding="utf-8") as f:
            post = json.load(f)
        print(f"== {path}")
        if post.get("send_at"):
            wait_until(post["send_at"])
        for text in post.get("messages", []):
            if str(text).strip():
                send_text(chat, str(text))
        if post.get("poll"):
            send_poll(chat, post["poll"])
        print(f"sent {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
