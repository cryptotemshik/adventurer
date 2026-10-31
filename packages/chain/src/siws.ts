import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

/** Verify a Sign-In-With-Solana message: ed25519 detached signature over the UTF-8 message bytes. */
export function verifySiwsMessage(i: { message: string; signatureBase58: string; publicKeyBase58: string }): boolean {
  try {
    const sig = bs58.decode(i.signatureBase58);
    const pk = bs58.decode(i.publicKeyBase58);
    if (sig.length !== 64 || pk.length !== 32) return false;
    return ed25519.verify(sig, new TextEncoder().encode(i.message), pk);
  } catch {
    return false;
  }
}
