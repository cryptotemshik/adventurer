/**
 * Registry for the pump.fun SDK modules.
 *
 * Why: `@pump-fun/pump-sdk`'s ESM build imports `{ BN }` from `@coral-xyz/anchor`, whose package has no
 * ESM `exports` — bundlers (Next/webpack, esbuild) resolve its `module` field fine, but Node's native ESM
 * loader (tsx, vitest) cannot. So:
 *  - `src/sdk-node.ts` loads the CommonJS build through `createRequire` (jobs, tests);
 *  - `src/launch-entry.ts` imports the ESM build statically (web bundle on Cloudflare Workers).
 * Both register the modules here, and every function in this package reads them through `pump()`.
 */
export type PumpModule = typeof import("@pump-fun/pump-sdk");
export type PumpSwapModule = typeof import("@pump-fun/pump-sdk/swap");

let pumpMod: PumpModule | null = null;
let swapMod: PumpSwapModule | null = null;

export function registerPumpSdk(p: PumpModule, s?: PumpSwapModule): void {
  pumpMod = p;
  if (s) swapMod = s;
}

export function pump(): PumpModule {
  if (!pumpMod) throw new Error("@bias/chain: pump sdk not registered (import @bias/chain or @bias/chain/launch)");
  return pumpMod;
}

export function pumpSwap(): PumpSwapModule {
  if (!swapMod) throw new Error("@bias/chain: pump swap sdk not registered (import @bias/chain)");
  return swapMod;
}
