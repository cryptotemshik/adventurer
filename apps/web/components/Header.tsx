"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WalletButton } from "./WalletButton";

const NAV = [
  ["/", "Markets"],
  ["/explore", "Explore"],
  ["/activity", "Activity"],
  ["/proof", "Proof"],
  ["/graveyard", "Graveyard"],
  ["/bias", "$BIAS"],
  ["/docs", "Docs"],
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
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-12 max-w-[1280px] items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="bias home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={22} height={22} />
          <span className="text-[15px] font-semibold tracking-tight">bias</span>
        </Link>
        <nav className="hidden h-12 items-stretch lg:flex" aria-label="main">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center border-b-2 px-3 text-[13px] ${path === href ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button className="hidden h-8 w-56 items-center justify-between rounded-[3px] border border-line px-2.5 text-[13px] text-muted hover:text-text md:flex" onClick={() => setSearch(true)} aria-label="search markets">
            Search markets <span className="num text-[11px]">⌘K</span>
          </button>
          <Link href="/launch" className="btn hidden sm:inline-flex">
            Launch
          </Link>
          <WalletButton compact />
          <button className="btn px-2.5 lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="menu" aria-expanded={open}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-1 lg:hidden" aria-label="mobile">
          {[...NAV, ["/launch", "Launch a market"] as const].map(([href, label]) => (
            <Link key={href} href={href} className="block border-b border-line py-2.5 text-sm text-muted last:border-0 hover:text-text">
              {label}
            </Link>
          ))}
        </nav>
      )}
      {search && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 pt-20" onClick={() => setSearch(false)} role="dialog" aria-modal="true" aria-label="search">
          <form
            className="panel mx-auto max-w-lg p-1"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(false);
              router.push(`/explore?q=${encodeURIComponent(q)}`);
            }}
          >
            <input ref={input} className="input num border-0" placeholder="Ticker, name or contract address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="search query" />
          </form>
        </div>
      )}
    </header>
  );
}
