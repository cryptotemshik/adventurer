import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("DRY_RUN: launch with a mock wallet → market in the feed → vote is signature-checked", async ({ page }) => {
  await page.addInitScript({ content: readFileSync(join(process.cwd(), "e2e", "mock-wallet.js"), "utf8") });
  await page.goto("/launch");
  await expect(page.getByRole("heading", { name: "launch a market" })).toBeVisible();

  // connect + SIWS
  await page.getByRole("button", { name: "connect wallet" }).last().click();
  await page.getByRole("button", { name: /Mock Wallet/ }).click();
  await page.getByRole("button", { name: /sign in/ }).first().click();
  await expect(page.getByRole("button", { name: "launch", exact: true })).toBeVisible({ timeout: 20_000 });

  // coin
  await page.getByPlaceholder("long boi").fill("e2e boi");
  await page.getByPlaceholder("LONGBOI").fill("EEBOI");
  await page.locator('input[type="file"]').setInputFiles({ name: "coin.png", mimeType: "image/png", buffer: PNG });
  // bias: SOL long 3×, community voting on
  await page.getByLabel("asset").selectOption("SOL");
  await page.getByText("community bias").click();
  await expect(page.getByText(/SL at −16\.7% price move/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "launch", exact: true }).click();
  await expect(page.getByText(/has a bias\./)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("market live (dry run)")).toBeVisible();

  // the market shows up in the feed
  await page.goto("/");
  const card = page.getByRole("link", { name: /\$EEBOI/ });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page.getByRole("heading", { name: "$EEBOI" })).toBeVisible();
  await expect(page.getByText("SOL LONG 3×").first()).toBeVisible();

  // vote: signed message, then the server checks the holder balance (the e2e wallet holds none)
  await page.getByRole("button", { name: "short", exact: true }).click();
  await expect(page.getByText(/you need to hold \$EEBOI to vote/)).toBeVisible({ timeout: 30_000 });

  // proof page lists the market with its addresses
  await page.goto("/proof");
  await expect(page.getByRole("link", { name: "$EEBOI" })).toBeVisible();
});

test("pages render and the disclaimer is everywhere", async ({ page }) => {
  for (const p of ["/", "/explore", "/activity", "/proof", "/graveyard", "/bias", "/docs"]) {
    await page.goto(p);
    await expect(page.getByText("positions are leveraged and can lose everything").first()).toBeVisible();
  }
});
