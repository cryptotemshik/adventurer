import "server-only";
import { cookies } from "next/headers";
import { base58 } from "@bias/shared";
import { createSession, getSession, consumeNonce } from "@bias/db";
import { verifySiwsMessage } from "@bias/chain/launch";
import { getDb } from "./db";
import { getConfig } from "./config";
import { HttpError } from "./http";

export const SESSION_COOKIE = "bias_session";
const SESSION_TTL = 7 * 86_400_000;

export function randomId(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sign-In With Solana message (CAIP-122 style). */
export function siwsMessage(i: { domain: string; wallet: string; nonce: string; issuedAt: string; statement?: string }): string {
  return [
    `${i.domain} wants you to sign in with your Solana account:`,
    i.wallet,
    "",
    i.statement ?? "sign in to bias. this is a signature, not a transaction. it costs nothing.",
    "",
    `URI: https://${i.domain}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${i.nonce}`,
    `Issued At: ${i.issuedAt}`,
  ].join("\n");
}

export function parseSignedMessage(message: string): { domain: string; wallet: string; nonce: string; issuedAt: string } | null {
  const lines = message.split("\n");
  const domain = lines[0]?.match(/^(\S+) wants you to (sign in|vote) with your Solana account:$/)?.[1];
  const wallet = lines[1]?.trim();
  const nonce = message.match(/\nNonce: ([a-f0-9]+)/)?.[1];
  const issuedAt = message.match(/\nIssued At: (\S+)/)?.[1] ?? new Date().toISOString();
  if (!domain || !wallet || !nonce) return null;
  return { domain, wallet, nonce, issuedAt };
}

export function expectedDomain(req: Request): string {
  return new URL(req.url).host;
}

/** Verify a signed SIWS-style message: signature, wallet, domain, single-use nonce. */
export async function verifySigned(req: Request, message: string, signature: string, wallet: string) {
  if (!base58.safeParse(wallet).success) throw new HttpError(400, "bad wallet");
  const p = parseSignedMessage(message);
  if (!p || p.wallet !== wallet) throw new HttpError(400, "message does not match wallet");
  if (p.domain !== expectedDomain(req)) throw new HttpError(400, "wrong domain");
  if (!verifySiwsMessage({ message, signatureBase58: signature, publicKeyBase58: wallet })) throw new HttpError(401, "bad signature");
  if (!(await consumeNonce(await getDb(), p.nonce))) throw new HttpError(401, "nonce expired or used");
  return p;
}

export async function startSession(wallet: string) {
  const id = randomId();
  await createSession(await getDb(), id, wallet, SESSION_TTL);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function currentWallet(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const s = await getSession(await getDb(), id);
  return s?.wallet ?? null;
}

export async function requireWallet(): Promise<string> {
  const w = await currentWallet();
  if (!w) throw new HttpError(401, "sign in with your wallet first");
  return w;
}

export async function isAdmin(wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  const cfg = await getConfig();
  return cfg.adminWallets.includes(wallet);
}

export async function requireAdmin(): Promise<string> {
  const w = await requireWallet();
  if (!(await isAdmin(w))) throw new HttpError(403, "admins only");
  return w;
}
