import type { Metadata } from "next";
import { listEvents } from "@bias/db";
import { getDb } from "@/lib/db";
import { ActivityFeed } from "./ActivityFeed";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Activity", description: "Claims, trades, take-profits, buybacks and burns across all bias markets." };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const events = await listEvents(await getDb(), { limit: 100 });
  return (
    <>
      <PageTitle title="Activity" sub="Claims, trades, take-profits, buybacks and burns across all markets, with transaction links." />
      <ActivityFeed initial={JSON.parse(JSON.stringify(events))} network={process.env.HL_NETWORK ?? "testnet"} />
    </>
  );
}
