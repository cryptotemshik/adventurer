import json, os, sys, time, urllib.request, datetime
OUT = sys.argv[1]; ROUNDS = int(sys.argv[2]); PERIOD = int(sys.argv[3])
B = "https://resultados.tse.jus.br/oficial/ele2026/6258/dados"
UFS = ['ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to','zz']
RMSP = [m['cd'] for m in json.load(open('/tmp/claude-0/disc/rmsp.json'))]
UA = {"User-Agent": "brazil-tracker/1.0 (fixture recorder)"}
def get(url, data=None):
    for t in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers={**UA, **({"content-type": "application/json"} if data else {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(15); continue
            print("HTTP", e.code, url, flush=True); return None
        except Exception as e:
            print("ERR", e, url, flush=True); time.sleep(5)
    print("GIVEUP", url, flush=True); return None
paths = ["br/br-c0001-e006258-u.json", "br/br-e006258-ab.json"] + [f"{u}/{u}-c0001-e006258-u.json" for u in UFS] + [f"sp/sp{m}-c0001-e006258-u.json" for m in RMSP]
for r in range(ROUNDS):
    start = time.time()
    ts = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    d = os.path.join(OUT, ts); os.makedirs(d, exist_ok=True)
    body = get("https://api.hyperliquid.xyz/info", json.dumps({"type": "metaAndAssetCtxs", "dex": "xyz"}).encode())
    if body: open(os.path.join(d, "hl-xyz.json"), "wb").write(body)
    for p in paths:
        b = get(f"{B}/{p}")
        if b: open(os.path.join(d, p.replace("/", "__")), "wb").write(b)
        time.sleep(1.2)
    try:
        br = json.load(open(os.path.join(d, "br__br-c0001-e006258-u.json")))
        print(ts, "pst", br["s"]["pst"], "and", br["and"], "tf", br["tf"], "md", br["md"], flush=True)
    except Exception as e: print(ts, "no br", e, flush=True)
    time.sleep(max(0, PERIOD - (time.time() - start)))
