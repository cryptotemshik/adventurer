/**
 * Renders every X / launch image from the HTML/SVG templates in twitter/src.
 * Usage (repo root): pnpm twitter:images   [optional ids: tweet-03 banner …]
 * Uses the pre-installed Playwright Chromium; fonts are embedded from twitter/src/fonts (OFL).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPng } from "./check";
import { OUTPUTS } from "./src/outputs";
import * as T from "./src/templates";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RENDER: Record<string, () => string> = {
  "tweet-01": T.tweet01,
  "tweet-02": T.tweet02,
  "tweet-03": T.tweet03,
  "tweet-04": T.tweet04,
  "tweet-05": T.tweet05,
  "tweet-06": T.tweet06,
  "tweet-07": T.tweet07,
  "tweet-08": T.tweet08,
  "tweet-09": T.tweet09,
  banner: T.banner,
  avatar: () => T.avatar(500),
  coin: () => T.avatar(1000),
};

/** Minimal slice of the Playwright API we use (keeps typecheck independent of a local playwright install). */
interface PwPage {
  setContent(html: string, o: { waitUntil: "load" }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<unknown>;
  screenshot(o: { type: "png"; clip: { x: number; y: number; width: number; height: number } }): Promise<Buffer>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<PwPage>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: { launch(): Promise<PwBrowser> };
}

function loadPlaywright(): Playwright {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    return require("/opt/node-tools/node_modules/playwright");
  }
}

async function main() {
  const only = process.argv.slice(2);
  const targets = OUTPUTS.filter((o) => only.length === 0 || only.includes(o.id));
  if (targets.length === 0) throw new Error(`no outputs match ${only.join(", ")}`);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    for (const o of targets) {
      const render = RENDER[o.id];
      if (!render) throw new Error(`no template for ${o.id}`);
      const page = await browser.newPage({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 });
      await page.setContent(render(), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const out = join(ROOT, o.file);
      mkdirSync(dirname(out), { recursive: true });
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: o.width, height: o.height } });
      writeFileSync(out, png);
      await page.close();
      try {
        const r = checkPng(out, o.width, o.height);
        console.log(`✓ ${o.file}  ${r.width}×${r.height}  ${(r.bytes / 1024).toFixed(0)} KB`);
      } catch (e) {
        failures.push((e as Error).message);
        console.error(`✗ ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} image(s) failed validation`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
