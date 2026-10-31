import Link from "next/link";
import type { EventRow } from "@bias/db";
import { txLink } from "@/lib/links";

const ICON: Record<string, string> = {
  launch: "🚀",
  claim: "⛏",
  split: "➗",
  payout: "↗",
  bridge_in: "🌉",
  bridge_arrived: "🌉",
  open: "▶",
  add: "＋",
  reduce: "－",
  close: "■",
  tp_hit: "🎯",
  sl_hit: "🛑",
  deleverage: "⚖",
  flip: "🔁",
  flat: "＝",
  cooldown: "❄",
  withdraw: "⇣",
  buyback: "🔥",
  burn: "🔥",
  stopped: "⚰",
  dead: "⚰",
  alert: "⚠",
};
const BIG = new Set(["tp_hit", "buyback", "burn"]);

export type FeedEvent = EventRow & { ticker?: string | null; mint?: string | null };

export function EventFeed({ events, network, showMarket = false }: { events: FeedEvent[]; network: string; showMarket?: boolean }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-muted">nothing yet. the tape is quiet.</p>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => {
        const link = txLink(e.txid, e.chain, network);
        return (
          <li key={e.id} className={`flex items-start gap-3 py-2.5 text-sm ${BIG.has(e.type) ? "bg-accent/5" : ""}`}>
            <span className="w-6 shrink-0 text-center" aria-hidden>
              {ICON[e.type] ?? "·"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                {showMarket && e.ticker && e.mint && (
                  <Link href={`/t/${e.mint}`} className="num font-semibold hover:underline">
                    ${e.ticker}
                  </Link>
                )}
                <span className={`num text-xs ${BIG.has(e.type) ? "text-accent" : e.type === "sl_hit" ? "text-short" : "text-muted"}`}>{e.type.replace("_", " ")}</span>
              </div>
              <div className="break-words text-text/90">{e.message}</div>
            </div>
            <div className="shrink-0 text-right">
              <time className="num block text-xs text-muted" dateTime={new Date(e.at).toISOString()}>
                {new Date(e.at).toISOString().slice(5, 16).replace("T", " ")}
              </time>
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="num text-xs text-flat underline-offset-2 hover:underline">
                  tx ↗
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
