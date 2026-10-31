import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sniffImage, toBase64, fromBase64 } from "./launch";

describe("launch helpers", () => {
  it("sniffs image types by magic bytes", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), "image/png")).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe("image/jpeg");
    expect(() => sniffImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), "image/png")).toThrow(/PNG/);
    expect(() => sniffImage(new Uint8Array(5 * 1024 * 1024), "image/png")).toThrow(/4 MB/);
  });
  it("base64 roundtrip", () => {
    const a = new Uint8Array(70000).map((_, i) => i % 251);
    expect(fromBase64(toBase64(a))).toEqual(a);
  });
});
