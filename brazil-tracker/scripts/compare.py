import json, time, urllib.request
TSE="https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json"
API="https://brazil-tracker.michaelworkarb.workers.dev/api/summary"
UA={"User-Agent":"brazil-tracker/1.0 (verification)"}
def j(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
for k in range(3):
    for attempt in range(6):
        a=j(API)
        try: t=j(TSE)
        except Exception as e: print("tse err", e); time.sleep(15); continue
        tsrc=f"{t['dt'][6:]}-{t['dt'][3:5]}-{t['dt'][:2]}T{t['ht']}-03:00"
        if tsrc==a['sourceUpdatedAt']: break
        time.sleep(4)
    c={x['n']:x for ag in t['carg'][0]['agr'] for p in ag['par'] for x in p['cand']}
    rows=[("countedPct", round(float(t['s']['pstn'].replace(',','.')),2), a['countedPct']),
          ("lula votes", int(c['13']['vap']), a['candidates']['lula']['votes']),
          ("flavio votes", int(c['22']['vap']), a['candidates']['flavio']['votes']),
          ("lula pct", float(c['13']['pvap'].replace(',','.')), a['candidates']['lula']['pct']),
          ("flavio pct", float(c['22']['pvap'].replace(',','.')), a['candidates']['flavio']['pct']),
          ("valid", int(t['v']['vv']), a['validVotes'])]
    ok=all(x==y for _,x,y in rows)
    print(f"moment {k+1}: TSE {tsrc} API {a['sourceUpdatedAt']} match={tsrc==a['sourceUpdatedAt']} all_equal={ok}", rows if not ok else "")
    time.sleep(45)
