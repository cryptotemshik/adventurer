export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;
export const solscanToken = (a: string) => `https://solscan.io/token/${a}`;
export const pumpFun = (mint: string) => `https://pump.fun/coin/${mint}`;
export const dexScreener = (mint: string) => `https://dexscreener.com/solana/${mint}`;
export function hlExplorerAddr(address: string, network: string) {
  return network === "mainnet"
    ? `https://app.hyperliquid.xyz/explorer/address/${address}`
    : `https://app.hyperliquid-testnet.xyz/explorer/address/${address}`;
}
export function hlExplorerTx(hash: string, network: string) {
  return network === "mainnet"
    ? `https://app.hyperliquid.xyz/explorer/tx/${hash}`
    : `https://app.hyperliquid-testnet.xyz/explorer/tx/${hash}`;
}
export function txLink(txid: string | null | undefined, chain: string | null | undefined, network: string): string | null {
  if (!txid || txid.startsWith("sim:")) return null;
  return chain === "hl" ? hlExplorerTx(txid, network) : solscanTx(txid);
}
