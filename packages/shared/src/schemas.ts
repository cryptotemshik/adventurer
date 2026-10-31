import { z } from "zod";

const asset = z.string().min(1).max(12).regex(/^[A-Za-z0-9]+$/);
const lev = z.number().int().min(1).max(5);

export const StrategySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), asset, side: z.enum(["long", "short"]), leverage: lev }),
  z.object({
    type: z.literal("basket"),
    side: z.enum(["long", "short"]),
    leverage: lev,
    legs: z
      .array(z.object({ asset, weightBps: z.number().int().min(500).max(9500) }))
      .min(2)
      .max(3),
  }),
  z.object({ type: z.literal("pair"), long: asset, short: asset, leverage: lev }),
  z.object({ type: z.literal("funding"), asset }),
]);

export const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "invalid solana address");

export const LaunchInputSchema = z.object({
  name: z.string().trim().min(1).max(32),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9$]+$/, "letters and digits only")
    .transform((s) => s.replace(/^\$/, "").toUpperCase()),
  description: z.string().trim().max(500).default(""),
  twitter: z.string().trim().url().max(200).optional().or(z.literal("")),
  telegram: z.string().trim().url().max(200).optional().or(z.literal("")),
  website: z.string().trim().url().max(200).optional().or(z.literal("")),
  devBuySol: z.string().regex(/^\d+(\.\d{1,9})?$/).default("0"),
  strategy: StrategySchema,
  community: z.boolean().default(false),
  payoutWallet: base58,
  flagship: z.boolean().default(false),
});
export type LaunchInput = z.infer<typeof LaunchInputSchema>;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
