import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDetail } from "@/lib/detail";
import { siteUrl } from "@/lib/config";
import { MarketDetail, type Detail } from "./MarketDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;
  const d = await getDetail(mint);
  if (!d) return { title: "market not found" };
  const m = d.market;
  const title = `$${m.ticker} · ${m.strategyLabel}`;
  const description = `${m.name}: fees fund a ${m.strategyLabel} position on hyperliquid; profit buys back & burns $${m.ticker}. status: ${m.status}.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function MarketPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const d = await getDetail(mint);
  if (!d) notFound();
  return <MarketDetail initial={JSON.parse(JSON.stringify(d)) as Detail} siteUrl={siteUrl()} />;
}
