import Link from "next/link";
import { DISCLAIMER } from "@bias/shared";

export function Footer({ network }: { network: string }) {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-6 text-xs text-muted md:flex-row md:items-start md:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span className="text-text">bias</span>
          <Link href="/docs" className="hover:text-text">Docs</Link>
          <Link href="/proof" className="hover:text-text">Proof</Link>
          <Link href="/graveyard" className="hover:text-text">Graveyard</Link>
          <Link href="/bias" className="hover:text-text">$BIAS</Link>
          <span className="num">
            Hyperliquid <span className={network === "mainnet" ? "text-long" : "text-accent"}>{network}</span>
          </span>
        </div>
        <p className="max-w-xl leading-relaxed md:text-right">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
