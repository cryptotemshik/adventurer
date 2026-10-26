# Brazil tracker: подсчёт второго тура + EWZ

Live-страница: ход подсчёта голосов второго тура выборов президента Бразилии (25.10.2026, Лула против Флавио Болсонару)
по официальным файлам TSE и цена перпетуального контракта EWZ на Hyperliquid. Обновляется каждые 15 секунд.

**Прод:** https://brazil-tracker.michaelworkarb.workers.dev · replay: `?replay=1`

## Устройство

```
browser ──15 s──▶ Worker (/api/*, static assets, edge Cache API 5 s, isolate micro-cache 3 s, rate limit per IP)
                     │
                     ▼
              Durable Object "Tracker" (один на весь мир)
               ├─ TSE: файл на путь не чаще раза в 10 с (страна) / 15 с (штаты) / 30 с (Сан-Паулу), single-flight
               ├─ Hyperliquid: котировка раз в 5 с, 1-мин свечи раз в 60 с
               ├─ SQLite: последняя удачная копия ответов, история отрыва, mark-цены за 3 ч, состояние алертов
               └─ cron раз в минуту: обновление + Telegram-алерты
```

- `apps/web/`: фронтенд (Vite + TypeScript без фреймворка).
- `workers/api/`: Worker и Durable Object (`src/tracker.ts`), разбор TSE (`src/tse.ts`), формулы (`src/calc.ts`),
  источники цены (`src/price.ts`), алерты (`src/alerts.ts`), replay (`src/replay.ts`), тесты (`test/`).
- `fixtures/`: записанные живые снимки TSE и Hyperliquid (`replay.json`, `history-seed.json`, сырые образцы в `tse/`).
- `docs/`: [журнал проверки](docs/verification-log.md), [схема TSE](docs/tse-schema.md), [API](docs/api.md).
- `scripts/record.py`: запись снимков во время подсчёта; `scripts/build-fixtures.mjs`: сборка фикстур из записей.

Почему Durable Object, а не KV, как в ТЗ: Cache API и `cf.cacheTtl` работают внутри одной локации Cloudflare, и при
посетителях из разных стран каждая локация ходила бы в TSE сама. Единственный DO даёт ровно один запрос на путь за TTL
по всему миру. Ещё одна причина: бесплатный KV позволяет 1000 записей в день, а история с шагом 15 с — это 5760 записей.
SQLite в DO запись выдерживает и даёт атомарность для состояния алертов. Привязка `KV_HISTORY` поэтому не нужна.

## Команды

Нужен Node 20+.

```bash
cd brazil-tracker
npm i
npm test               # vitest: формулы §6, парсинг TSE/Hyperliquid, Сан-Паулу, устаревшие данные, алерты
npm run typecheck
npm run dev            # сборка фронта + wrangler dev на http://localhost:8787 (живые данные)
                       # replay локально: http://localhost:8787/?replay=1
```

Деплой (Workers + Static Assets, один URL `*.workers.dev`):

```bash
npx wrangler login     # или CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) в окружении
export BUILD_VERSION="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M)"
npm run build:web
npx wrangler deploy --config workers/api/wrangler.toml --var BUILD_VERSION:$BUILD_VERSION
```

Логи (видно каждый запрос к TSE строкой `{"upstream":"tse","path":…}`):

```bash
npx wrangler tail brazil-tracker
```

## Настройки (`workers/api/wrangler.toml`)

| Переменная | По умолчанию | Смысл |
| --- | --- | --- |
| `TSE_BASE_URL` | `https://resultados.tse.jus.br/oficial` | хост файлов результатов |
| `TSE_CYCLE` / `TSE_ELECTION` | `ele2026` / `6258` | цикл и код выборов (`6257` = первый тур) |
| `PRICE_SOURCE` | `hyperliquid` | `hyperliquid` или `yahoo` (котировка ETF с задержкой) |
| `PRICE_SYMBOL` | `xyz:EWZ` | для `yahoo`: `EWZ` |
| `ALERT_THRESHOLDS_PP` | `0.5,0.2,0.1` | пороги отрыва для алертов, п.п. |
| `REPLAY` | `0` | `1`: весь сайт работает на фикстурах |
| `BUILD_VERSION` | `dev` | задаётся при деплое |

Лимит запросов: 600 в минуту на IP (Workers Rate Limiting, `[[ratelimits]]`). Это с запасом под мобильных
операторов, у которых много абонентов за одним IP. Клиент делает 20 запросов в минуту.

## Telegram-алерты (фаза 2)

Сообщения шлются при смене лидера, когда отрыв опускается ниже порогов (0,5 / 0,2 / 0,1 п.п., с гистерезисом 0,05),
когда TSE помечает результат математически определённым, при завершении подсчёта и если данные TSE не обновляются
дольше 3 минут (плюс сообщение о восстановлении). Проверка идёт по cron раз в минуту, состояние лежит в DO, поэтому
дублей нет. Пока не заданы секреты, алерты только пишутся в лог.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN --config workers/api/wrangler.toml
npx wrangler secret put TELEGRAM_CHAT_ID  --config workers/api/wrangler.toml
```

## Replay и ручная проверка

- `?replay=1`: кадры, записанные во время подсчёта 25–26.10.2026, меняются каждые 15 с.
- `&frame=N`: зафиксировать кадр.
- `&scenario=error`: источник «упал», показываются данные 7 минут назад с пометкой.
- `&scenario=complete`: синтетический кадр «подсчёт завершён», собран из последнего реального с выставленными флагами.

Пересобрать фикстуры из новых записей:

```bash
python3 scripts/record.py /path/to/rec 40 300   # раунд раз в 5 мин: страна, 28 штатов, RMSP, цена
node scripts/build-fixtures.mjs /path/to/rec 24
```

## Ограничения и оговорки

- Порог победы считается по доле подсчитанных **участков**, а не голосов, поэтому он приблизительный (это сказано и в UI).
- Оценка оставшихся голосов предполагает, что в неподсчитанных участках явка и доля валидных голосов такие же, как в подсчитанных.
- `md = "e"` у TSE трактуется как «математически определено»; это вывод из наблюдения, а не из документации (см. журнал проверки).
- Изменения цены за 5/15/60 мин считаются по собственной истории mark (DO пишет точку раз в 15 с). Сразу после холодного старта они берутся по 1-мин свечам сделок, о чём есть пометка в UI.
