/** Print a fresh 24-word BIP-39 mnemonic. Run offline: `pnpm tsx jobs/gen-seed.ts` */
import { generateMnemonic } from "@bias/keys";

console.log(generateMnemonic());
