"use client";

import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import bs58 from "bs58";

export interface SessionState {
  wallet: string | null;
  tier: "none" | "trader" | "desk" | "fund";
  balance: number;
  admin: boolean;
}

interface SessionCtx extends SessionState {
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  signing: boolean;
  error: string | null;
  signMessage: (msg: string) => Promise<string>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside provider");
  return c;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage: walletSign, connected } = useWallet();
  const [s, setS] = useState<SessionState>({ wallet: null, tier: "none", balance: 0, admin: false });
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const j = await r.json();
      setS(j.wallet ? j : { wallet: null, tier: "none", balance: 0, admin: false });
    } catch {}
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signMessage = useCallback(
    async (msg: string) => {
      if (!walletSign) throw new Error("this wallet cannot sign messages");
      const sig = await walletSign(new TextEncoder().encode(msg));
      return bs58.encode(sig);
    },
    [walletSign],
  );

  const signIn = useCallback(async () => {
    if (!publicKey) return false;
    setSigning(true);
    setError(null);
    try {
      const wallet = publicKey.toBase58();
      const n = await (await fetch(`/api/auth/nonce?wallet=${wallet}`, { cache: "no-store" })).json();
      const signature = await signMessage(n.message);
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: n.message, signature, wallet }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "sign-in failed");
      setS(j);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSigning(false);
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setS({ wallet: null, tier: "none", balance: 0, admin: false });
  }, []);

  // a different wallet got connected → the old session no longer matches
  useEffect(() => {
    if (connected && publicKey && s.wallet && publicKey.toBase58() !== s.wallet) void signOut();
  }, [connected, publicKey, s.wallet, signOut]);

  const value = useMemo(() => ({ ...s, signIn, signOut, refresh, signing, error, signMessage }), [s, signIn, signOut, refresh, signing, error, signMessage]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Providers({ children, rpc }: { children: ReactNode; rpc: string }) {
  return (
    <ConnectionProvider endpoint={rpc}>
      <WalletProvider wallets={[]} autoConnect>
        <SessionProvider>{children}</SessionProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
