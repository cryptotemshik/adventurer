import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPng } from "./check";
import { OUTPUTS } from "./src/outputs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("twitter/launch images", () => {
  for (const o of OUTPUTS) {
    it(`${o.file} is exactly ${o.width}×${o.height} and < 5 MB`, () => {
      const p = join(root, o.file);
      expect(existsSync(p), `${o.file} missing — run pnpm twitter:images`).toBe(true);
      expect(() => checkPng(p, o.width, o.height)).not.toThrow();
    });
  }
});
