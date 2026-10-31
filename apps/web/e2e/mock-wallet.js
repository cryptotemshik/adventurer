// Injected before page scripts: a Wallet Standard wallet backed by a WebCrypto Ed25519 key.
(() => {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (bytes) => {
    let n = 0n;
    for (const b of bytes) n = n * 256n + BigInt(b);
    let s = "";
    while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = "1" + s; else break; }
    return s;
  };
  let keys, account;
  const ready = crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]).then(async (k) => {
    keys = k;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
    account = { address: b58(pub), publicKey: pub, chains: ["solana:mainnet"], features: ["solana:signMessage", "solana:signTransaction", "solana:signAndSendTransaction"] };
    window.__mockWallet = account.address;
  });
  const listeners = {};
  const wallet = {
    version: "1.0.0",
    name: "Mock Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMwMEU1OEYiLz48L3N2Zz4=",
    chains: ["solana:mainnet", "solana:devnet"],
    get accounts() { return account && wallet._connected ? [account] : []; },
    _connected: false,
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => { await ready; wallet._connected = true; (listeners.change || []).forEach((f) => f({ accounts: [account] })); return { accounts: [account] }; } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet._connected = false; } },
      "standard:events": { version: "1.0.0", on: (ev, f) => { (listeners[ev] ||= []).push(f); return () => {}; } },
      "solana:signMessage": { version: "1.0.0", signMessage: async (...inputs) => Promise.all(inputs.map(async (i) => ({ signedMessage: i.message, signature: new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, i.message)) }))) },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: async (...inputs) => inputs.map((i) => ({ signedTransaction: i.transaction })) },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signAndSendTransaction: async (...inputs) => inputs.map(() => ({ signature: new Uint8Array(64) })) },
    },
  };
  const cb = ({ register }) => register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => cb(e.detail));
  try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: cb })); } catch {}
})();
