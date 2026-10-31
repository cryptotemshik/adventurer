import { z } from "zod";
import { getSettings, lastJobs, listAdminLog, listAlerts, logAdmin, poolStats, resolveAlert, setSetting, updateMarket, getMarket } from "@bias/db";
import { getDb } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export const GET = handle(async () => {
  await requireAdmin();
  const db = await getDb();
  const cfg = await getConfig();
  const [settings, jobs, alerts, log, pool] = await Promise.all([getSettings(db), lastJobs(db, 30), listAlerts(db, false, 100), listAdminLog(db, 100), poolStats(db)]);
  return ok({
    settings,
    effective: {
      LAUNCHES_ENABLED: cfg.LAUNCHES_ENABLED,
      TRADING_MODE: cfg.TRADING_MODE,
      MAX_NOTIONAL_PER_MARKET_USD: cfg.MAX_NOTIONAL_PER_MARKET_USD,
      MAX_TOTAL_NOTIONAL_USD: cfg.MAX_TOTAL_NOTIONAL_USD,
      ASSET_ALLOWLIST: cfg.allowlist.join(","),
      HL_NETWORK: cfg.HL_NETWORK,
      DRY_RUN: cfg.DRY_RUN,
    },
    jobs,
    alerts,
    log,
    pool,
  });
});

const SETTING_KEYS = ["LAUNCHES_ENABLED", "TRADING_MODE", "MAX_NOTIONAL_PER_MARKET_USD", "MAX_TOTAL_NOTIONAL_USD", "ASSET_ALLOWLIST"] as const;
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), key: z.enum(SETTING_KEYS), value: z.string().max(2000) }),
  z.object({ action: z.literal("pause"), market: z.string().max(64), value: z.boolean() }),
  z.object({ action: z.literal("hide"), market: z.string().max(64), value: z.boolean() }),
  z.object({ action: z.literal("community"), market: z.string().max(64), value: z.boolean() }),
  z.object({ action: z.literal("resolve_alert"), id: z.number().int() }),
]);

export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const a = Action.parse(await req.json());
  const db = await getDb();
  switch (a.action) {
    case "set": {
      if (a.key === "TRADING_MODE" && !["normal", "close_only", "halted"].includes(a.value)) return fail(400, "bad trading mode");
      if (a.key === "LAUNCHES_ENABLED" && !["true", "false"].includes(a.value)) return fail(400, "bad value");
      if (a.key.startsWith("MAX_") && !(Number(a.value) > 0)) return fail(400, "bad number");
      await setSetting(db, a.key, a.value);
      break;
    }
    case "pause":
    case "hide":
    case "community": {
      const m = await getMarket(db, a.market);
      if (!m) return fail(404, "unknown market");
      if (a.action === "community" && JSON.parse(m.strategy).type === "funding") return fail(400, "funding farms cannot be community markets");
      await updateMarket(db, m.id, a.action === "pause" ? { paused: a.value } : a.action === "hide" ? { hidden: a.value } : { community: a.value });
      break;
    }
    case "resolve_alert":
      await resolveAlert(db, a.id);
      break;
  }
  await logAdmin(db, admin, a.action, a);
  return ok({ ok: true });
});
