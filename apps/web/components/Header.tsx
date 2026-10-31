"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WalletButton } from "./WalletButton";

const NAV = [
  ["/", "markets"],
  ["/explore", "explore"],
  ["/activity", "activity"],
  ["/proof", "proof"],
  ["/graveyard", "graveyard"],
  ["/bias", "$BIAS"],
  ["/docs", "docs"],
] as const;

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape") setSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (search) setTimeout(() => input.current?.focus(), 10);
  }, [search]);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="bias home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span className="font-display text-lg font-bold tracking-tight">bias</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="main">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2.5 py-1.5 text-sm ${path === href ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn hidden text-muted sm:inline-flex" onClick={() => setSearch(true)} aria-label="search markets">
            search <kbd className="chip">ctrl k</kbd>
          </button>
          <Link href="/launch" className="btn hidden border-long/40 text-long sm:inline-flex">
            launch market
          </Link>
          <WalletButton compact />
          <button className="btn lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="menu" aria-expanded={open}>
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-2 lg:hidden" aria-label="mobile">
          {[...NAV, ["/launch", "launch market"] as const].map(([href, label]) => (
            <Link key={href} href={href} className="block py-2 text-sm text-muted hover:text-text">
              {label}
            </Link>
          ))}
        </nav>
      )}
      {search && (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 pt-24" onClick={() => setSearch(false)} role="dialog" aria-modal="true" aria-label="search">
          <form
            className="panel mx-auto max-w-xl p-2"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(false);
              router.push(`/explore?q=${encodeURIComponent(q)}`);
            }}
          >
            <input ref={input} className="input num text-base" placeholder="ticker, name or contract address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="search query" />
          </form>
        </div>
      )}
    </header>
  );
}
