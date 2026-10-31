import { readFileSync, statSync } from "node:fs";

export const MAX_BYTES = 5 * 1024 * 1024;

/** Read width/height from a PNG's IHDR chunk. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  const sig = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== sig) throw new Error("not a PNG");
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("missing IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Throws unless the PNG at `path` is exactly w×h and smaller than 5 MB. */
export function checkPng(path: string, w: number, h: number): { width: number; height: number; bytes: number } {
  const bytes = statSync(path).size;
  const { width, height } = pngSize(readFileSync(path));
  if (width !== w || height !== h) throw new Error(`${path}: expected ${w}×${h}, got ${width}×${height}`);
  if (bytes >= MAX_BYTES) throw new Error(`${path}: ${bytes} bytes ≥ 5 MB`);
  return { width, height, bytes };
}
