import { PublicKey } from "@solana/web3.js";
import { getConnection, getSolBalance, getTokenSupply, getTokenBalance, verifyLaunchTx } from "@bias/chain";
import { HlInfo } from "@bias/hl";
import type { Market } from "@bias/db";
import Decimal from "decimal.js";
import type { VenueState } from "./venue";

/** Read-only chain/HL access for jobs that hold no seeds (reconcile, launch pickup, vote tally). */
export function readonlyOps(network: "testnet" | "mainnet") {
  const connection = getConnection(process.env.SOLANA_RPC, process.env.SOLANA_RPC_FALLBACK);
  const info = new HlInfo(network);
  return {
    connection,
    info,
    vaultBalance: (a: string) => getSolBalance(connection, new PublicKey(a)),
    supply: async (mint: string) => (await getTokenSupply(connection, new PublicKey(mint))).amount,
    balanceOf: (wallet: string, mint: string) => getTokenBalance(connection, new PublicKey(wallet), new PublicKey(mint)),
    exists: (m: Market) => info.userExists(m.hlAccount),
    state: async (m: Market): Promise<VenueState> => {
      const s = await info.accountState(m.hlAccount);
      return {
        account: { accountValue: s.accountValue, withdrawable: s.withdrawable, spot: Object.fromEntries(Object.entries(s.spot).map(([k, v]) => [k, v.total])) },
        legs: s.legs.filter((l) => !new Decimal(l.szi).isZero()),
        triggers: s.triggers,
      };
    },
    verifyLaunchTx,
  };
}
