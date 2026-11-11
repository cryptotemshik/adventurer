#!/usr/bin/env python3
"""Answers «Хочу …» requests posted in the food channel.

Run every few minutes by the food-bot-requests workflow (on the default branch). Reads new
channel posts via getUpdates; for each post from our channel that starts with «хочу», replies
«Ищу…», asks Claude Code (subscription token) for 3 options from restaurants.md, cheapest to
most expensive, and replies to the post with the result. Updates are confirmed after handling,
so a request is answered once. Without CLAUDE_CODE_OAUTH_TOKEN it leaves requests untouched.
"""
import datetime
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import send  # noqa: E402

ROOT = send.ROOT
TRIGGER = "хочу"
CLAUDE_TIMEOUT = 15 * 60
MSK = datetime.timezone(datetime.timedelta(hours=3))


def load_chat():
    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        return str(json.load(f).get("chat_id", "")).strip()


def pending_requests(chat):
    res = send.call("getUpdates", allowed_updates=["channel_post"], timeout=0)
    if not res.get("ok"):
        sys.exit(f"getUpdates failed: {res}")
    updates = res.get("result") if isinstance(res.get("result"), list) else []
    reqs = []
    for u in updates:
        post = u.get("channel_post") or {}
        text = (post.get("text") or "").strip()
        if str((post.get("chat") or {}).get("id")) == chat and text.lower().startswith(TRIGGER):
            reqs.append((u["update_id"], post["message_id"], text))
    last = updates[-1]["update_id"] if updates else None
    return reqs, last


def confirm(update_id):
    send.call("getUpdates", offset=update_id + 1, timeout=0)


def ensure_claude():
    if shutil.which("claude"):
        return
    subprocess.run(["npm", "install", "-g", "--silent", "@anthropic-ai/claude-code"], check=True)


def ask_claude(request):
    with open(os.path.join(ROOT, "bot", "request_prompt.md"), encoding="utf-8") as f:
        prompt = f.read()
    now = datetime.datetime.now(MSK).strftime("%d.%m.%Y %H:%M")
    prompt = prompt.replace("{REQUEST}", request).replace("{NOW}", now)
    out = os.path.join(ROOT, "reply.html")
    if os.path.exists(out):
        os.remove(out)
    env = {k: v for k, v in os.environ.items() if k != "TELEGRAM_BOT_TOKEN"}
    try:
        proc = subprocess.run(
            ["claude", "-p", prompt, "--allowedTools", "Read,Write,WebSearch,WebFetch", "--max-turns", "60"],
            cwd=ROOT, env=env, timeout=CLAUDE_TIMEOUT, capture_output=True, text=True,
        )
        print(proc.stdout[-2000:], proc.stderr[-2000:], sep="\n")
    except subprocess.TimeoutExpired:
        print("claude timed out")
    if os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            text = f.read().strip()
        os.remove(out)
        return text or None
    return None


def main():
    chat = load_chat()
    if not chat:
        sys.exit("config.json has no chat_id")
    if not send.DRY_RUN and not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        print("CLAUDE_CODE_OAUTH_TOKEN is not set; leaving requests for later")
        return
    reqs, last = pending_requests(chat)
    print(f"requests: {len(reqs)}")
    if reqs and not send.DRY_RUN:
        ensure_claude()
    for update_id, message_id, text in reqs:
        request = text[len(TRIGGER):].strip(" ,.:—-!") or text
        ack = send.call("sendMessage", chat_id=chat, text="🔎 Ищу варианты, это займёт несколько минут…",
                        reply_parameters={"message_id": message_id, "allow_sending_without_reply": True})
        reply = None if send.DRY_RUN else ask_claude(request)
        ack_id = (ack.get("result") or {}).get("message_id")
        if reply:
            send.send_text(chat, reply, reply_to=message_id)
            if ack_id:
                send.call("deleteMessage", chat_id=chat, message_id=ack_id)
        elif ack_id:
            send.call("editMessageText", chat_id=chat, message_id=ack_id,
                      text="😕 Не получилось подобрать варианты. Попробуй написать запрос по-другому.")
        confirm(update_id)
    if last is not None:
        confirm(last)


if __name__ == "__main__":
    main()
