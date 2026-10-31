import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, SystemProgram } from "@solana/web3.js";
import { median, priorityFeeLamports, priorityFromSamples, stripComputeBudget, withComputeBudget } from "./tx";
import { solBudgetForMaxCost } from "./swap";
import "./sdk-node";

describe("fee math", () => {
  it("median handles odd/even/empty", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2);
  });
  it("priority = median of non-zero samples, capped", () => {
    expect(priorityFromSamples([0, 0, 0], 50_000)).toBe(0);
    expect(priorityFromSamples([0, 0, 100, 300, 200], 50_000)).toBe(200);
    expect(priorityFromSamples([0, 90_000, 120_000], 50_000)).toBe(50_000);
  });
  it("priority fee lamports rounds up", () => {
    expect(priorityFeeLamports(200_000, 50_000)).toBe(10_000n);
    expect(priorityFeeLamports(1, 1)).toBe(1n);
    expect(priorityFeeLamports(0, 50_000)).toBe(0n);
  });
  it("max-cost budget never exceeds lamports after slippage", () => {
    const b = solBudgetForMaxCost(1_000_000_000n, 300);
    expect(b).toBe(970_873_786n);
    expect((b * 10_300n) / 10_000n <= 1_000_000_000n).toBe(true);
  });
  it("compute budget is prepended once", () => {
    const a = Keypair.generate().publicKey;
    const t = SystemProgram.transfer({ fromPubkey: a, toPubkey: a, lamports: 1 });
    const ixs = withComputeBudget([ComputeBudgetProgram.setComputeUnitLimit({ units: 5 }), t], 100_000, 7);
    expect(ixs).toHaveLength(3);
    expect(ixs[0]!.programId.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(ixs[2]).toBe(t);
    expect(stripComputeBudget(ixs)).toEqual([t]);
    expect(withComputeBudget([t], 100_000, 0)).toHaveLength(2);
  });
});
