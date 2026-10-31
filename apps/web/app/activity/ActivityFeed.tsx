"use client";

import { useState } from "react";
import { EventFeed, type FeedEvent } from "@/components/EventFeed";
import { usePolling } from "@/components/usePolling";

const FILTERS = [
  ["", "all"],
  ["tp_hit,buyback,burn", "🔥 big ones"],
  ["launch", "launches"],
  ["claim,split,payout,bridge_in,bridge_arrived", "fees"],
  ["open,add,reduce,close,deleverage,flip,flat", "trades"],
  ["sl_hit,cooldown,stopped,dead", "stops"],
] as const;

export function ActivityFeed({ initial, network }: { initial: FeedEvent[]; network: string }) {
  const [types, setTypes] = useState("");
  const [d] = usePolling<{ events: FeedEvent[] }>(`/api/events?limit=100${types ? `&types=${types}` : ""}`, 10_000, { events: initial });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`btn py-1.5 ${types === k ? "border-long/50 text-long" : "text-muted"}`} onClick={() => setTypes(k)} aria-pressed={types === k}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel px-4">
        <EventFeed events={d.events} network={network} showMarket />
      </div>
    </>
  );
}
