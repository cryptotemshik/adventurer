import type { Metadata } from "next";
import { listEvents } from "@bias/db";
import { getDb } from "@/lib/db";
import { ActivityFeed } from "./ActivityFeed";

export const metadata: Metadata = { title: "activity", description: "every claim, trade, take-profit, buyback and burn across all bias markets." };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const events = await listEvents(await getDb(), { limit: 100 });
  return (
    <>
      <h1 className="font-display mb-1 text-3xl font-bold">activity</h1>
      <p className="mb-6 text-sm text-muted">the tape. every claim, trade, take-profit, buyback and burn, with a transaction link.</p>
      <ActivityFeed initial={JSON.parse(JSON.stringify(events))} network={process.env.HL_NETWORK ?? "testnet"} />
    </>
  );
}
