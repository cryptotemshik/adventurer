import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const PUMP_IPFS_ENDPOINT = "https://pump.fun/api/ipfs";

export interface MetadataInput {
  image: Uint8Array;
  mime: string;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  dryRun: boolean;
}

/** Deterministic fake URI used in DRY_RUN (and as a test fixture). */
export function dryRunMetadataUri(i: Pick<MetadataInput, "image" | "name" | "symbol">): string {
  const enc = new TextEncoder();
  const h = sha256(new Uint8Array([...enc.encode(`${i.name}|${i.symbol}|`), ...i.image]));
  return `https://ipfs.io/ipfs/bafkreibiasdryrun${bytesToHex(h).slice(0, 32)}`;
}

/**
 * Upload image + metadata JSON to IPFS through pump.fun's own endpoint (the same one its UI uses):
 * multipart form `file,name,symbol,description,twitter,telegram,website,showName` → `{ metadataUri, metadata }`.
 * In dry-run, or if the upload fails while dry-run is on, a deterministic fake URI is returned.
 */
export async function uploadMetadata(i: MetadataInput): Promise<{ metadataUri: string; imageUri?: string }> {
  if (i.dryRun) return { metadataUri: dryRunMetadataUri(i) };
  const form = new FormData();
  form.append("file", new Blob([i.image as BlobPart], { type: i.mime }), `image.${i.mime.split("/")[1] ?? "png"}`);
  form.append("name", i.name);
  form.append("symbol", i.symbol);
  form.append("description", i.description);
  if (i.twitter) form.append("twitter", i.twitter);
  if (i.telegram) form.append("telegram", i.telegram);
  if (i.website) form.append("website", i.website);
  form.append("showName", "true");
  const res = await fetch(PUMP_IPFS_ENDPOINT, { method: "POST", body: form });
  if (!res.ok) throw new Error(`pump.fun ipfs upload failed: HTTP ${res.status}`);
  const body = (await res.json()) as { metadataUri?: string; metadata?: { image?: string } };
  if (!body.metadataUri) throw new Error("pump.fun ipfs upload: no metadataUri in response");
  return { metadataUri: body.metadataUri, imageUri: body.metadata?.image };
}
