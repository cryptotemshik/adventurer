import Link from "next/link";
import { DISCLAIMER } from "@bias/shared";

export function Footer({ network }: { network: string }) {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted md:grid-cols-3">
        <div>
          <div className="font-display text-base text-text">every coin has a bias.</div>
          <p className="mt-2">launch on pump.fun. fees fund a position on hyperliquid. profit buys back &amp; burns.</p>
          <p className="mt-2 num text-xs">
            hyperliquid: <span className={network === "mainnet" ? "text-long" : "text-accent"}>{network}</span>
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-1" aria-label="footer">
          <Link href="/launch">launch</Link>
          <Link href="/explore">explore</Link>
          <Link href="/activity">activity</Link>
          <Link href="/proof">proof</Link>
          <Link href="/graveyard">graveyard</Link>
          <Link href="/bias">$BIAS</Link>
          <Link href="/docs">docs</Link>
        </nav>
        <p className="text-xs leading-relaxed">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
