import type { TseConfig } from './tse';

export interface Env {
  ASSETS: Fetcher;
  TRACKER: DurableObjectNamespace;
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  TSE_BASE_URL: string;
  TSE_CYCLE: string;
  TSE_ELECTION: string;
  PRICE_SOURCE: string;
  PRICE_SYMBOL: string;
  BUILD_VERSION?: string;
  REPLAY?: string;
  ALERT_THRESHOLDS_PP?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export function tseConfig(env: Env): TseConfig {
  return {
    baseUrl: env.TSE_BASE_URL || 'https://resultados.tse.jus.br/oficial',
    cycle: env.TSE_CYCLE || 'ele2026',
    election: env.TSE_ELECTION || '6258',
    office: '1',
    lulaNumber: '13',
    flavioNumber: '22',
  };
}

export const USER_AGENT = 'brazil-tracker/1.0 (+https://github.com/cryptotemshik/adventurer)';
