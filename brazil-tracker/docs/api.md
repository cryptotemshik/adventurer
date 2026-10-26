# API (`/api/*`)

Общие правила: `GET`, JSON (`application/json; charset=utf-8`), все числа числами, проценты в «процентах» (`50.69`),
время ISO 8601 с часовым поясом. Успешные ответы `Cache-Control: public, max-age=5`.

Поля свежести у всех ответов с данными:

| Поле | Тип | Смысл |
| --- | --- | --- |
| `fetchedAt` | string | когда сервер последний раз успешно получил данные источника |
| `stale` | bool | последняя попытка обновления не удалась, отдаём старую копию |
| `ageSeconds` | number | возраст данных относительно `fetchedAt` |
| `error` | string? | текст ошибки источника, если есть |

Коды: `200` (в том числе со `stale: true`), `503` `{error, stale:true}` если источник недоступен и сохранённой копии нет,
`429` при превышении лимита на IP, `404`/`405`. Ошибки 500 сервер не возвращает намеренно.

Replay (`?replay=1`, опционально `&frame=N`, `&scenario=complete|error`): те же формы плюс поле
`replay: { frame, frames, recordedAt, scenario }`.

## `GET /api/summary`

```jsonc
{
  "fetchedAt": "2026-10-26T00:06:10.659Z",
  "sourceUpdatedAt": "2026-10-25T21:04:44-03:00",   // dt/ht TSE
  "generatedAt": "2026-10-25T21:04:52-03:00",       // dg/hg TSE
  "stale": false, "ageSeconds": 0,
  "countedPct": 93.15,                              // % подсчитанных участков
  "sections": { "total": 499248, "counted": 465067 },
  "complete": false,                                // tf/and финальные ИЛИ 100% участков
  "mathematicallyDefined": false,                   // md TSE != "n"
  "winner": null,                                   // "lula" | "flavio" | null (только при complete/mathematicallyDefined)
  "candidates": { "lula": { "votes": 59556789, "pct": 51.67 }, "flavio": { "votes": 55699832, "pct": 48.33 } },
  "marginVotes": 3856957,                           // |lula − flavio|
  "marginPp": 3.35,                                 // |pct lula − pct flavio|
  "leader": "lula",                                 // "lula" | "flavio" | "tie"
  "breakEven": { "lulaNeedsPctOfRemaining": 27.23, "flavioNeedsPctOfRemaining": 72.77 }, // null при complete
  "electorate": 158745502, "electorateCounted": 147133472,
  "turnoutPct": 80.94, "validVotes": 115256621, "blankVotes": 1324805, "nullVotes": 2505202,
  "remainingValidVotesEst": 9096253,                // оценка, null если не хватает данных
  "sourceUrl": "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json"
}
```

## `GET /api/states`

```jsonc
{
  "fetchedAt": "…", "stale": false, "ageSeconds": 3,
  "missing": [],                       // UF без данных (ни свежих, ни старых)
  "states": [{
    "uf": "SP", "name": "Сан-Паулу", "stale": false,
    "countedPct": 93.22, "validVotes": 23769632, "electorate": 35000000, "electorateCounted": 32600000,
    "lula": { "votes": 10859107, "pct": 45.68 }, "flavio": { "votes": 12910525, "pct": 54.32 },
    "leader": "flavio", "marginVotes": 2051418,
    "flavioMinusLulaVotes": 2051418,   // со знаком: > 0 впереди Флавио
    "remainingValidVotesEst": 1840000,
    "complete": false, "sourceUpdatedAt": "2026-10-25T21:05:36-03:00"
  }]
}
```

28 строк: 27 штатов (включая DF) и `ZZ` (голосование за рубежом). Порядок произвольный, сортирует клиент.

## `GET /api/sp` (фаза 2)

```jsonc
{
  "fetchedAt": "…", "stale": false, "ageSeconds": 10, "missing": [],
  "regions": [
    { "key": "state",     "name": "Штат Сан-Паулу", "municipalities": 645, /* поля как у строки штата */ },
    { "key": "capital",   "name": "Столица (город Сан-Паулу)", "municipalities": 1, … },
    { "key": "grande_sp", "name": "Большой Сан-Паулу (без столицы)", "municipalities": 38, … },
    { "key": "interior",  "name": "Интерьор (вне RMSP)", "municipalities": 606, … }
  ]
}
```

`grande_sp` и `interior` присутствуют, только если загружены все 38 муниципалитетов. `interior = штат − RMSP (39)`.

## `GET /api/price`

```jsonc
{
  "fetchedAt": "…", "stale": false, "ageSeconds": 1,
  "source": "hyperliquid", "symbol": "xyz:EWZ",
  "delayed": false, "note": null,     // для yahoo: delayed=true и пояснение
  "markPx": 34.385, "oraclePx": 34.7, "midPx": 33.58, "prevDayPx": 45.268, "fundingRate": -0.0012,
  "change": {
    "m5":  { "abs": -6.071, "pct": -15.01, "from": 40.456 },
    "m15": { … }, "m60": { … }       // null, если нет точки рядом (±90 с)
  },
  "changeBasis": "mark-history",       // "mark-history" | "candles" | "none"
  "markLastChangedAt": "…", "markUnchangedSeconds": 0,   // null, пока неизвестно
  "history": [{ "t": "…", "px": 43.27 }],                // ~1-мин точки за 2 часа
  "historyBasis": "цены сделок, свечи 1 мин (Hyperliquid)"
}
```

## `GET /api/history` (фаза 2)

```jsonc
{ "fetchedAt": "…", "stale": false, "ageSeconds": 0,
  "points": [{ "t": "…", "sourceUpdatedAt": "…", "countedPct": 82.32, "lulaPct": 51.38, "flavioPct": 48.62,
               "marginVotes": 2798424,   // со знаком: lula − flavio
               "marginPp": 2.75,          // со знаком: lula − flavio
               "leader": "lula" }] }
```

Точка добавляется при каждом изменении данных TSE (хранится в SQLite Durable Object).

## `GET /api/health`

```jsonc
{
  "now": "…", "version": "<git sha>-<yyyymmddhhmm>", "replay": false,
  "instanceStartedAt": "…",            // счётчики ниже обнуляются при перезапуске DO
  "priceSource": "hyperliquid", "priceSymbol": "xyz:EWZ", "tseBaseUrl": "https://resultados.tse.jus.br/oficial",
  "sources": {
    "tse":   { "lastSuccessAt": "…", "lastErrorAt": null, "lastError": null, "ageSeconds": 2, "upstreamRequests": 68 },
    "price": { … }
  },
  "alerts": { "enabled": false, "lastSentAt": null, "lastMessage": null }
}
```
Не кэшируется.
