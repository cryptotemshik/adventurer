export class HlError extends Error {
  constructor(
    message: string,
    readonly context: { action: string; asset?: string; response?: unknown },
    options?: ErrorOptions,
  ) {
    super(`[hyperliquid:${context.action}${context.asset ? `:${context.asset}` : ""}] ${message}`, options);
    this.name = "HlError";
  }
}

/** Run an SDK call and rethrow anything as a descriptive HlError. */
export async function wrap<T>(action: string, asset: string | undefined, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HlError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const response = (e as { response?: unknown })?.response;
    throw new HlError(msg, { action, asset, response }, { cause: e });
  }
}

/** HL's per-order error for an IOC that found no liquidity within the limit price. */
export function isNoFillError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /could not immediately match/i.test(msg);
}
