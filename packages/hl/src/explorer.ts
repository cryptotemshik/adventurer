import type { HlNetwork } from "./types";

function base(network: HlNetwork): string {
  return network === "mainnet" ? "https://app.hyperliquid.xyz" : "https://app.hyperliquid-testnet.xyz";
}

export function hlExplorerAddressUrl(network: HlNetwork, address: string): string {
  return `${base(network)}/explorer/address/${address}`;
}

export function hlExplorerTxUrl(network: HlNetwork, hash: string): string {
  return `${base(network)}/explorer/tx/${hash}`;
}

export function hlApiUrl(network: HlNetwork): string {
  return network === "mainnet" ? "https://api.hyperliquid.xyz" : "https://api.hyperliquid-testnet.xyz";
}
