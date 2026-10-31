import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "bias · coins with a position", template: "%s · bias" },
  description: "Launch a coin on pump.fun with a leveraged position on Hyperliquid. Creator fees fund the position; realized profit buys back and burns the coin.",
  openGraph: { type: "website", siteName: "bias", images: ["/og-default.png"] },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = { themeColor: "#0A0B0D", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:p-2">
          skip to content
        </a>
        <Providers rpc={rpc}>
          <Header />
          <main id="main" className="mx-auto max-w-[1280px] px-4 py-5">
            {children}
          </main>
          <Footer network={process.env.HL_NETWORK ?? "testnet"} />
        </Providers>
      </body>
    </html>
  );
}
