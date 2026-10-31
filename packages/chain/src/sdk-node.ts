import { createRequire } from "node:module";
import { registerPumpSdk, type PumpModule, type PumpSwapModule } from "./sdk";

const require = createRequire(import.meta.url);
registerPumpSdk(
  require("@pump-fun/pump-sdk") as PumpModule,
  require("@pump-fun/pump-sdk/swap") as PumpSwapModule,
);
