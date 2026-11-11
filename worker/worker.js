// Cloudflare Worker: receives Telegram webhook updates for the food bot.
// When a channel admin posts «Хочу …» in the food channel, it replies «Ищу…» right away
// and starts the food-bot-requests GitHub workflow, which finds 3 options and replies.
//
// Secrets (Worker → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — the bot token from @BotFather
//   GITHUB_TOKEN       — fine-grained GitHub token with "Actions: Read and write" on cryptotemshik/adventurer

const CHAT_ID = "-1004433026306";
const REPO = "cryptotemshik/adventurer";
const WORKFLOW = "food-bot-requests.yml";
const REF = "dapp";
const TRIGGER = "хочу";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("food bot webhook is up");
    // Telegram sends the secret we registered with setWebhook; it is derived from the bot token.
    const expected = await webhookSecret(env.TELEGRAM_BOT_TOKEN);
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expected) {
      return new Response("forbidden", { status: 403 });
    }
    const update = await request.json().catch(() => ({}));
    const post = update.channel_post;
    const text = (post?.text || "").trim();
    if (post && String(post.chat?.id) === CHAT_ID && text.toLowerCase().startsWith(TRIGGER)) {
      ctx.waitUntil(handle(env, post, text));
    }
    return new Response("ok");
  },
};

async function handle(env, post, text) {
  const ack = await tg(env, "sendMessage", {
    chat_id: CHAT_ID,
    text: "🔎 Ищу варианты, это займёт пару минут…",
    reply_parameters: { message_id: post.message_id, allow_sending_without_reply: true },
  });
  const ackId = ack?.result?.message_id ?? "";
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "food-bot-worker",
    },
    body: JSON.stringify({
      ref: REF,
      inputs: { message_id: String(post.message_id), text: text.slice(0, 500), ack_id: String(ackId) },
    }),
  });
  if (!res.ok && ackId) {
    console.log("dispatch failed", res.status, await res.text());
    await tg(env, "editMessageText", {
      chat_id: CHAT_ID,
      message_id: ackId,
      text: "😕 Не получилось запустить поиск. Попробуй ещё раз чуть позже.",
    });
  }
}

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`food-bot:${token}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
