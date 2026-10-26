// Telegram alerts (SPEC §8). Pure evaluation + a thin sender; state lives in the Durable Object.
import type { Leader, Summary } from './types';

export interface AlertState {
  leader: Leader | null;
  thresholdsHit: number[];
  completeSent: boolean;
  definedSent?: boolean;
  staleSent: boolean;
  lastSourceUpdatedAt: string | null;
  lastSourceChangeAt: number | null; // epoch ms when sourceUpdatedAt last changed (or first seen)
}

export const initialAlertState = (): AlertState => ({
  leader: null,
  thresholdsHit: [],
  completeSent: false,
  staleSent: false,
  lastSourceUpdatedAt: null,
  lastSourceChangeAt: null,
});

const NAMES: Record<string, string> = { lula: 'Лула', flavio: 'Флавио Болсонару', tie: 'ничья' };
const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ');

export interface AlertOptions {
  thresholdsPp: number[]; // e.g. [0.5, 0.2, 0.1]
  staleAfterMs: number; // 3 minutes
  hysteresisPp: number; // re-arm a threshold once the margin is this much above it
}

/**
 * Decides which messages to send given the previous state and a fresh summary.
 * `summary === null` means the TSE fetch failed (counts towards "data stopped").
 */
export function evaluateAlerts(prev: AlertState, summary: Summary | null, now: number, opts: AlertOptions): { messages: string[]; next: AlertState } {
  const next: AlertState = { ...prev, thresholdsHit: [...prev.thresholdsHit] };
  const messages: string[] = [];

  if (summary && !summary.stale) {
    if (summary.sourceUpdatedAt !== prev.lastSourceUpdatedAt || prev.lastSourceChangeAt === null) {
      next.lastSourceUpdatedAt = summary.sourceUpdatedAt;
      next.lastSourceChangeAt = now;
      if (prev.staleSent) {
        messages.push(`Данные TSE снова обновляются (подсчитано ${summary.countedPct.toFixed(2)}% участков).`);
        next.staleSent = false;
      }
    }

    const status = `Подсчитано ${summary.countedPct.toFixed(2)}%: Лула ${summary.candidates.lula.pct.toFixed(2)}%, Флавио ${summary.candidates.flavio.pct.toFixed(2)}%, отрыв ${fmt(summary.marginVotes)} голосов (${summary.marginPp.toFixed(2)} п.п.).`;

    if (prev.leader && summary.leader !== prev.leader && summary.leader !== 'tie') {
      messages.push(`Смена лидера: впереди ${NAMES[summary.leader]}. ${status}`);
    }
    if (summary.leader !== 'tie') next.leader = summary.leader;
    else if (!prev.leader) next.leader = null;

    for (const th of [...opts.thresholdsPp].sort((a, b) => b - a)) {
      const hit = next.thresholdsHit.includes(th);
      if (!hit && summary.marginPp < th && !summary.complete) {
        messages.push(`Отрыв меньше ${th} п.п. ${status}`);
        next.thresholdsHit.push(th);
      } else if (hit && summary.marginPp > th + opts.hysteresisPp) {
        next.thresholdsHit = next.thresholdsHit.filter((x) => x !== th);
      }
    }

    if (summary.mathematicallyDefined && !summary.complete && !prev.definedSent) {
      const w = summary.winner ? `: ${NAMES[summary.winner]}` : '';
      messages.push(`TSE: результат математически определён${w}. ${status}`);
      next.definedSent = true;
    }

    if (summary.complete && !prev.completeSent) {
      const w = summary.winner ? ` Избран: ${NAMES[summary.winner]} (по данным TSE).` : '';
      messages.push(`Подсчёт завершён.${w} ${status}`);
      next.completeSent = true;
    }
  }

  const done = summary?.complete || prev.completeSent;
  if (!done && next.lastSourceChangeAt !== null && now - next.lastSourceChangeAt > opts.staleAfterMs && !next.staleSent) {
    const min = Math.round((now - next.lastSourceChangeAt) / 60000);
    messages.push(`Данные TSE не обновлялись ${min} мин${summary === null ? ' (источник недоступен)' : ''}.`);
    next.staleSent = true;
  }

  return { messages, next };
}

export async function sendTelegram(fetcher: typeof fetch, token: string, chatId: string, text: string): Promise<void> {
  const res = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}
