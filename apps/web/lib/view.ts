import type { Direction, MarketStatus, Strategy } from "@bias/shared";
import { strategyLabel, lamportsToSol } from "@bias/shared";
import type { Market } from "@bias/db";

/** Client-safe market DTO (numbers for display only; exact values stay in the ledger). */
export interface MarketView {
  id: string;
  idx: number;
  mint: string | null;
  name: string;
  ticker: string;
  description: string;
  image: string;
  socials: { twitter?: string; telegram?: string; website?: string };
  launcher: string;
  payoutWallet: string;
  solVault: string;
  hlAccount: string;
  hlAgent: string;
  strategy: Strategy;
  strategyLabel: string;
  community: boolean;
  flagship: boolean;
  deskBadge: boolean;
  featured: boolean;
  status: MarketStatus;
  direction: Direction;
  paused: boolean;
  hidden: boolean;
  demo: boolean;
  createdAt: number;
  endedAt: number | null;
  endReason: string | null;
  cooldownUntil: number | null;
  consecutiveStops: number;
  equityUsd: number;
  upnlUsd: number;
  notionalUsd: number;
  realizedPnlUsd: number;
  lifetimePnlUsd: number;
  lifetimePnlPct: number;
  profitTakenUsd: number;
  depositedUsd: number;
  feesClaimedSol: number;
  feesLauncherSol: number;
  feesPlatformSol: number;
  feesPositionSol: number;
  pipelineSol: number;
  inTransitSol: number;
  boughtBackSol: number;
  burnedTokens: string;
  burnedPct: number;
  mcapUsd: number;
  priceUsd: number;
  bondingProgress: number;
  graduated: boolean;
  riskToSl: number | null;
  riskToLiq: number | null;
  closestTp: number | null;
  respects: number;
  reconOk: boolean;
  snapshotAt: number | null;
}

const n = (s: string | null | undefined) => (s ? Number(s) : 0);
const sol = (s: string | null | undefined) => Number(lamportsToSol(s || "0"));

export function toView(m: Market): MarketView {
  const strategy = JSON.parse(m.strategy) as Strategy;
  const realized = n(m.realizedPnlUsd);
  const upnl = n(m.upnlUsd);
  const deposited = n(m.depositedUsd);
  const lifetime = realized + upnl;
  return {
    id: m.id,
    idx: m.idx,
    mint: m.mint,
    name: m.name,
    ticker: m.ticker,
    description: m.description,
    image: m.image,
    socials: safeJson(m.socials, {}),
    launcher: m.launcher,
    payoutWallet: m.payoutWallet,
    solVault: m.solVault,
    hlAccount: m.hlAccount,
    hlAgent: m.hlAgent,
    strategy,
    strategyLabel: strategyLabel(strategy, m.direction as Direction),
    community: m.community,
    flagship: m.flagship,
    deskBadge: m.deskBadge,
    featured: !!m.featuredUntil && m.featuredUntil > Date.now(),
    status: m.status as MarketStatus,
    direction: m.direction as Direction,
    paused: m.paused,
    hidden: m.hidden,
    demo: m.demo,
    createdAt: m.createdAt,
    endedAt: m.endedAt,
    endReason: m.endReason,
    cooldownUntil: m.cooldownUntil,
    consecutiveStops: m.consecutiveStops,
    equityUsd: n(m.equityUsd),
    upnlUsd: upnl,
    notionalUsd: n(m.notionalUsd),
    realizedPnlUsd: realized,
    lifetimePnlUsd: lifetime,
    lifetimePnlPct: deposited > 0 ? (lifetime / deposited) * 100 : 0,
    profitTakenUsd: n(m.profitTakenUsd),
    depositedUsd: deposited,
    feesClaimedSol: sol(m.feesClaimed),
    feesLauncherSol: sol(m.feesLauncher),
    feesPlatformSol: sol(m.feesPlatform),
    feesPositionSol: sol(m.feesPosition),
    pipelineSol: sol(m.pipelineLamports),
    inTransitSol: sol(m.inTransitLamports),
    boughtBackSol: sol(m.boughtBackLamports),
    burnedTokens: m.burnedTokens,
    burnedPct: m.burnedPct,
    mcapUsd: m.mcapUsd,
    priceUsd: m.priceUsd,
    bondingProgress: m.bondingProgress,
    graduated: m.graduated,
    riskToSl: m.riskToSl,
    riskToLiq: m.riskToLiq,
    closestTp: m.closestTp,
    respects: m.respects,
    reconOk: m.reconOk,
    snapshotAt: m.snapshotAt,
  };
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const STATUS_LABEL: Record<MarketStatus, string> = {
  pending_launch: "pending launch",
  waiting_for_fees: "waiting for fees",
  live: "live",
  cooldown: "cooldown",
  flat: "flat",
  stopped: "stopped",
  dead: "dead",
};
