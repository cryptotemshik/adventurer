// Bindings available to the worker (kept by hand; `pnpm cf-typegen` regenerates a fuller version).
interface CloudflareEnv {
  ASSETS: Fetcher;
  BIAS_DB: DurableObjectNamespace<import("./worker").BiasDb>;
  NEXT_PUBLIC_SITE_URL: string;
  HL_NETWORK: string;
  LAUNCHES_ENABLED: string;
  TRADING_MODE: string;
  DRY_RUN: string;
  SESSION_SECRET?: string;
  JOB_TOKEN?: string;
  [key: string]: unknown;
}
