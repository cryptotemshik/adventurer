"use client";

import { useState } from "react";
import { EventFeed, type FeedEvent } from "@/components/EventFeed";
import { usePolling } from "@/components/usePolling";

const FILTERS = [
  ["", "All"],
  ["tp_hit,buyback,burn", "Profit & burns"],
  ["launch", "Launches"],
  ["claim,split,payout,bridge_in,bridge_arrived", "Fees"],
  ["open,add,reduce,close,deleverage,flip,flat", "Trades"],
  ["sl_hit,cooldown,stopped,dead", "Stops"],
] as const;

export function ActivityFeed({ initial, network }: { initial: FeedEvent[]; network: string }) {
  const [types, setTypes] = useState("");
  const [d] = usePolling<{ events: FeedEvent[] }>(`/api/events?limit=100${types ? `&types=${types}` : ""}`, 10_000, { events: initial });
  return (
    <>
      <div className="mb-3 flex flex-wrap border-b border-line">
        {FILTERS.map(([k, label]) => (
          <button key={k} className="tab" onClick={() => setTypes(k)} aria-pressed={types === k}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel">
        <EventFeed events={d.events} network={network} showMarket />
      </div>
    </>
  );
}
