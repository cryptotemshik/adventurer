/**
 * `@bias/chain/launch` — what the web app (Next.js on Cloudflare Workers) needs: build/verify the launch tx,
 * IPFS metadata, bonding-curve reads, SIWS. Loads the pump SDK's ESM build statically (bundlers resolve
 * `@coral-xyz/anchor` via its `module` field). No node: imports.
 */
import * as pumpSdk from "@pump-fun/pump-sdk";
import { registerPumpSdk } from "./sdk";

registerPumpSdk(pumpSdk);

export * from "./web";
