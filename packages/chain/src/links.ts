export function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}
export function solscanAccount(a: string): string {
  return `https://solscan.io/account/${a}`;
}
export function solscanToken(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}
export function pumpFunCoin(mint: string): string {
  return `https://pump.fun/coin/${mint}`;
}
