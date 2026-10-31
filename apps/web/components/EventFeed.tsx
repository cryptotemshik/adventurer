import Link from "next/link";
import type { EventRow } from "@bias/db";
import { txLink } from "@/lib/links";

const CODE: Record<string, [string, string]> = {
  launch: ["LAUNCH", "text-text"],
  claim: ["CLAIM", "text-muted"],
  split: ["SPLIT", "text-muted"],
  payout: ["PAYOUT", "text-muted"],
  bridge_in: ["BRIDGE", "text-muted"],
  bridge_arrived: ["BRIDGE", "text-muted"],
  open: ["OPEN", "text-text"],
  add: ["ADD", "text-text"],
  reduce: ["REDUCE", "text-text"],
  close: ["CLOSE", "text-text"],
  tp_hit: ["TP", "text-long"],
  sl_hit: ["SL", "text-short"],
  deleverage: ["DELEV", "text-accent"],
  flip: ["FLIP", "text-accent"],
  flat: ["FLAT", "text-flat"],
  cooldown: ["COOL", "text-flat"],
  withdraw: ["WITHDRAW", "text-muted"],
  buyback: ["BUYBACK", "text-accent"],
  burn: ["BURN", "text-accent"],
  stopped: ["STOPPED", "text-short"],
  dead: ["DEAD", "text-muted"],
  alert: ["ALERT", "text-short"],
};

export type FeedEvent = EventRow & { ticker?: string | null; mint?: string | null; demo?: boolean };

export function EventFeed({ events, network, showMarket = false }: { events: FeedEvent[]; network: string; showMarket?: boolean }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-muted">No events yet.</p>;
  return (
    <table className="grid-table w-full text-[13px]">
      <tbody>
        {events.map((e) => {
          const link = txLink(e.txid, e.chain, network);
          const [code, color] = CODE[e.type] ?? [e.type.toUpperCase(), "text-muted"];
          return (
            <tr key={e.id}>
              <td className="num w-28 text-[11px] text-muted">{new Date(e.at).toISOString().slice(5, 16).replace("T", " ")}</td>
              <td className={`num w-20 text-[11px] font-semibold ${color}`}>{code}</td>
              {showMarket && (
                <td className="num w-24">
                  {e.ticker && e.mint ? (
                    <Link href={`/t/${e.mint}`} className="font-semibold hover:underline">
                      ${e.ticker}
                    </Link>
                  ) : (
                    <span className="text-muted">platform</span>
                  )}
                </td>
              )}
              <td className="max-w-0 truncate whitespace-normal text-text/90">
                {e.message}
                {e.demo && showMarket && <span className="tag ml-2">demo</span>}
              </td>
              <td className="w-14 text-right">
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="num text-[11px] text-muted hover:text-text">
                    tx ↗
                  </a>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
