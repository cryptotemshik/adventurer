import "server-only";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@bias/shared";
import { HttpError } from "./http";

/** Validate image type by magic bytes (not just the declared mime) and size. */
export function sniffImage(buf: Uint8Array, declared: string): string {
  if (buf.byteLength === 0) throw new HttpError(400, "image is required");
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new HttpError(400, "image must be ≤ 4 MB");
  const b = buf;
  let mime: string | null = null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = "image/png";
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = "image/jpeg";
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) mime = "image/gif";
  else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    mime = "image/webp";
  if (!mime || !(IMAGE_TYPES as readonly string[]).includes(mime)) throw new HttpError(400, "image must be PNG, JPG, GIF or WebP");
  void declared;
  return mime;
}

export function toBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
