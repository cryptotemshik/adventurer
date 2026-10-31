"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useEffect, useState } from "react";
import { shortAddr } from "@bias/shared";
import { useSession } from "./Providers";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { wallets, select, connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (connected) setOpen(false);
  }, [connected]);

  const signedIn = session.wallet && publicKey && session.wallet === publicKey.toBase58();

  if (connected && publicKey) {
    return (
      <div className="relative">
        {signedIn ? (
          <button className="btn num" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>
            <span className="live-dot" aria-hidden />
            {shortAddr(publicKey.toBase58())}
            {session.tier !== "none" && <span className="chip text-accent border-accent/40">{session.tier}</span>}
          </button>
        ) : (
          <button className="btn btn-long" onClick={() => void session.signIn()} disabled={session.signing}>
            {session.signing ? "check wallet…" : compact ? "sign in" : "sign in with solana"}
          </button>
        )}
        {menu && (
          <div role="menu" className="panel absolute right-0 z-50 mt-2 w-56 p-2 text-sm shadow-2xl">
            <div className="px-2 py-1 text-muted">
              tier: <span className="text-text">{session.tier}</span>
            </div>
            {session.admin && (
              <a role="menuitem" href="/admin" className="block rounded px-2 py-1.5 hover:bg-panel-2">
                admin
              </a>
            )}
            <button
              role="menuitem"
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-panel-2"
              onClick={() => {
                setMenu(false);
                void session.signOut();
                void disconnect();
              }}
            >
              disconnect
            </button>
          </div>
        )}
        {session.error && !signedIn && <p className="absolute right-0 mt-1 w-64 text-right text-xs text-short">{session.error}</p>}
      </div>
    );
  }

  const installed = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);
  return (
    <>
      <button className="btn btn-long" onClick={() => setOpen(true)} disabled={connecting}>
        {connecting ? "connecting…" : compact ? "connect" : "connect wallet"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="connect a wallet">
          <div className="panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg">connect a wallet</h2>
              <button className="text-muted hover:text-text" onClick={() => setOpen(false)} aria-label="close">
                ✕
              </button>
            </div>
            {installed.length === 0 ? (
              <p className="text-sm text-muted">
                no solana wallet found. install{" "}
                <a className="underline" href="https://phantom.com" target="_blank" rel="noreferrer">
                  phantom
                </a>
                ,{" "}
                <a className="underline" href="https://solflare.com" target="_blank" rel="noreferrer">
                  solflare
                </a>{" "}
                or{" "}
                <a className="underline" href="https://backpack.app" target="_blank" rel="noreferrer">
                  backpack
                </a>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {installed.map((w) => (
                  <li key={w.adapter.name}>
                    <button
                      className="btn w-full justify-start"
                      onClick={() => {
                        select(w.adapter.name);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" width={22} height={22} className="rounded" />
                      {w.adapter.name}
                      {wallet?.adapter.name === w.adapter.name && connecting && <span className="ml-auto text-xs text-muted">connecting…</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">signing in is a message signature. it never moves funds.</p>
          </div>
        </div>
      )}
    </>
  );
}
