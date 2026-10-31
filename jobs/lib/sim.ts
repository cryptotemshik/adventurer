import Decimal from "decimal.js";
import { SimExchange, type Action, type AssetInfo } from "@bias/engine";
import type { TriggerKind } from "@bias/shared";
import type { Market } from "@bias/db";
import type { ChainOps, ExecResult, HlTreasuryOps, Venue, VenueState } from "./venue";

/**
 * Simulated Hyperliquid + Solana for DRY_RUN end-to-end tests. Same interfaces as the real
 * implementations; the exchange model (native triggers, isolated margin, liquidations) is the engine's SimExchange.
 */
export class SimWorld {
  ex = new Map<string, SimExchange>();
  vaults = new Map<string, bigint>();
  claimableFees = new Map<string, bigint>();
  tokens = new Map<string, bigint>(); // mint → burned
  supplyOf = 1_000_000_000_000_000n;
  solUsd = new Decimal(150);
  now = Date.UTC(2026, 9, 31, 20);
  existing = new Set<string>();
  constructor(public assets: Record<string, AssetInfo>) {}

  exchange(m: Market): SimExchange {
    let e = this.ex.get(m.hlAccount);
    if (!e) {
      e = new SimExchange(0, this.assets);
      e.spotMarks.USOL = this.solUsd;
      this.ex.set(m.hlAccount, e);
    }
    return e;
  }
  setPrice(asset: string, px: Decimal.Value) {
    for (const e of this.ex.values()) {
      e.now = this.now;
      e.setPrice(asset, px);
    }
  }
  state(m: Market): VenueState {
    const e = this.exchange(m);
    return {
      account: {
        accountValue: e.accountValue().toString(),
        withdrawable: e.collateral.toString(),
        spot: Object.fromEntries(Object.entries(e.spot).map(([k, v]) => [k, v.toString()])),
      },
      legs: e.legs(),
      triggers: e.triggers.map(({ label: _l, ...t }) => t),
    };
  }
}

export class SimVenue implements Venue {
  constructor(private w: SimWorld) {}
  async marks() {
    const out: Record<string, string> = {};
    for (const e of this.w.ex.values()) for (const [k, v] of Object.entries(e.marks)) out[k] = v.toString();
    return out;
  }
  async assets() {
    return this.w.assets;
  }
  async spotInfo() {
    return { assets: { USOL: { szDecimals: 2, maxLeverage: 1 } }, marks: { USOL: this.w.solUsd.toString() } };
  }
  async state(m: Market) {
    return this.w.state(m);
  }
  async fills(m: Market, since: number) {
    return this.w.exchange(m).fills.filter((f) => f.time >= since);
  }
  async fundingWindows() {
    return [0.0001, 0.0001];
  }
  async execute(m: Market, a: Action): Promise<ExecResult> {
    const e = this.w.exchange(m);
    e.now = this.w.now;
    const before = new Set(e.triggers.map((t) => t.oid));
    const labels: Record<number, { asset: string; label: TriggerKind }> = {};
    e.apply(a, labels);
    const placed = e.triggers
      .filter((t) => !before.has(t.oid))
      .map((t) => ({ oid: t.oid, asset: t.asset, label: t.label, tpsl: t.tpsl, triggerPx: t.triggerPx, sz: t.sz }));
    return { ok: true, note: `${a.kind}${a.kind === "order" ? ` ${a.reason} ${a.isBuy ? "buy" : "sell"} ${a.sz} ${a.asset}` : ""}`, placed: placed.length ? placed : undefined };
  }
}

export class SimHl implements HlTreasuryOps {
  approved = new Set<string>();
  constructor(private w: SimWorld) {}
  async exists(m: Market) {
    return this.w.existing.has(m.hlAccount);
  }
  async state(m: Market) {
    return this.w.state(m);
  }
  async sellSpot(m: Market, token: string, sz: string) {
    const e = this.w.exchange(m);
    const usdc = new Decimal(sz).mul(this.w.solUsd);
    e.spot[token] = (e.spot[token] ?? new Decimal(0)).sub(sz);
    e.spot.USDC = (e.spot.USDC ?? new Decimal(0)).add(usdc);
    return { usdc: usdc.toFixed(6) };
  }
  async buySpot(m: Market, token: string, usd: string) {
    const e = this.w.exchange(m);
    const sz = new Decimal(usd).div(this.w.solUsd).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    e.spot.USDC = (e.spot.USDC ?? new Decimal(0)).sub(sz.mul(this.w.solUsd));
    e.spot[token] = (e.spot[token] ?? new Decimal(0)).add(sz);
    return { sz: sz.toString() };
  }
  async usdTransfer(m: Market, usd: string, toPerp: boolean) {
    const e = this.w.exchange(m);
    const x = new Decimal(usd);
    if (toPerp) {
      e.spot.USDC = (e.spot.USDC ?? new Decimal(0)).sub(x);
      e.collateral = e.collateral.add(x);
    } else {
      e.collateral = e.collateral.sub(x);
      e.spot.USDC = (e.spot.USDC ?? new Decimal(0)).add(x);
    }
  }
  async approveAgent(m: Market) {
    this.approved.add(m.hlAgent);
  }
  async spotSend(m: Market, destination: string, token: string, amount: string) {
    const e = this.w.exchange(m);
    e.spot[token] = (e.spot[token] ?? new Decimal(0)).sub(amount);
    // hyperunit: SOL lands in the vault (destination encodes the vault in the sim)
    const vault = destination.replace(/^unitwd:/, "");
    this.w.vaults.set(vault, (this.w.vaults.get(vault) ?? 0n) + BigInt(new Decimal(amount).mul(1e9).toFixed(0)));
  }
}

export class SimChain implements ChainOps {
  constructor(private w: SimWorld, private vaultOf: (index: number) => string) {}
  async claimable(m: Market) {
    return this.w.claimableFees.get(m.solVault) ?? 0n;
  }
  async claim(m: Market) {
    const l = this.w.claimableFees.get(m.solVault) ?? 0n;
    this.w.claimableFees.set(m.solVault, 0n);
    this.w.vaults.set(m.solVault, (this.w.vaults.get(m.solVault) ?? 0n) + l);
    return { sig: null, lamports: l };
  }
  async vaultBalance(a: string) {
    return this.w.vaults.get(a) ?? 0n;
  }
  private debit(index: number, lamports: bigint) {
    const v = this.vaultOf(index);
    const bal = this.w.vaults.get(v) ?? 0n;
    if (bal < lamports) throw new Error(`sim: vault ${v} has ${bal}, needs ${lamports}`);
    this.w.vaults.set(v, bal - lamports);
  }
  async payout(index: number, outs: { to: string; lamports: bigint }[]) {
    for (const o of outs) {
      this.debit(index, o.lamports);
      this.w.vaults.set(o.to, (this.w.vaults.get(o.to) ?? 0n) + o.lamports);
    }
    return null;
  }
  async depositAddress(m: Market) {
    return `unitdep:${m.hlAccount}`;
  }
  async withdrawAddress(m: Market) {
    return `unitwd:${m.solVault}`;
  }
  async send(index: number, to: string, lamports: bigint) {
    this.debit(index, lamports);
    if (to.startsWith("unitdep:")) {
      // hyperunit deposit: arrives as USOL on HL spot; the account now exists
      const hl = to.slice(8);
      this.w.existing.add(hl);
      const e = this.w.exchange({ hlAccount: hl } as Market);
      e.spot.USOL = (e.spot.USOL ?? new Decimal(0)).add(new Decimal(lamports.toString()).div(1e9));
    }
    return null;
  }
  async buyAndBurn(index: number, mint: string, lamports: bigint) {
    this.debit(index, lamports);
    const tokens = lamports * 30_000n; // 1 lamport ≈ 30k raw tokens in the sim
    this.w.tokens.set(mint, (this.w.tokens.get(mint) ?? 0n) + tokens);
    return { buySig: null, burnSig: null, tokens };
  }
  async supply(mint: string) {
    return this.w.supplyOf - (this.w.tokens.get(mint) ?? 0n);
  }
  async coin() {
    return { priceUsd: 0.0001, mcapUsd: 100_000, progress: 42, graduated: false };
  }
}
