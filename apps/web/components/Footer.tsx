import Link from "next/link";
import { DISCLAIMER } from "@bias/shared";

const LINKS = [
  ["/", "Markets"],
  ["/launch", "Launch"],
  ["/explore", "Explore"],
  ["/activity", "Activity"],
  ["/proof", "Proof"],
  ["/graveyard", "Graveyard"],
  ["/bias", "$BIAS"],
  ["/docs", "Docs"],
] as const;

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-[1280px] px-4 py-5">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted" aria-label="footer">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-text">
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
          {DISCLAIMER.replace(/(^|\. )([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())}
        </p>
      </div>
    </footer>
  );
}
