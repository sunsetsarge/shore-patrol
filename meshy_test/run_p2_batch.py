import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))

def create(endpoint, payload):
    for a in range(3):
        r = S.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=30)
        if r.status_code == 429: time.sleep(10); continue
        if r.status_code >= 400: sys.exit(f"ERROR {r.status_code} on {endpoint}: {r.text}")
        return r.json()["result"]
    sys.exit("rate limited")

def poll(endpoint, tid, timeout=900):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json(); st = t["status"]
        if st == "SUCCEEDED": return t
        if st in ("FAILED","CANCELED"): sys.exit(f"TASK_{st} {tid}: {t.get('task_error',{}).get('message','?')}")
        w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w
        if t.get("progress",0) < 95: d = min(d*1.5, 30)
    sys.exit(f"TIMEOUT {tid}")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path,"wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print(f"DOWNLOADED: {path} ({os.path.getsize(path)/1e6:.1f} MB)", flush=True)

meta = json.load(open(os.path.join(OUT,"metadata.json")))
batch = json.load(open(os.path.join(OUT,"batch_results.json")))
out = {}

# Death animations (action 183 Shot_and_Fall_Backward) on both rigs
for unit, rig in [("infantry", meta["rig_id"]), ("commando", batch["commando_rig"])]:
    print(f"=== death anim {unit} ===", flush=True)
    aid = create("/openapi/v1/animations", {"rig_task_id": rig, "action_id": 183})
    t = poll("/openapi/v1/animations", aid)
    dl(t["result"]["animation_glb_url"], os.path.join(OUT, f"{unit}_death.glb"))
    out[unit+"_death"] = aid

# Turret weapon models (rear-view renders later; no rig)
STYLE = ", stylized proportions, bold shapes, clean silhouette, retro arcade game asset"
weapons = [
  ("wpn_mg", "twin-barrel .50 caliber heavy machine gun on a pintle mount, WWII, dark gunmetal"),
  ("wpn_howitzer", "short-barreled WWII howitzer artillery gun on a compact field mount, olive drab"),
  ("wpn_sam", "two-tube surface-to-air missile launcher rack on a swivel mount, military gray, missiles visible"),
  ("wpn_pistol", "M1911 semi-automatic pistol, dark steel with wooden grip"),
]
for name, prompt in weapons:
    print(f"=== {name} ===", flush=True)
    pid = create("/openapi/v2/text-to-3d", {"mode":"preview","prompt":prompt+STYLE,"ai_model":"latest","symmetry_mode":"auto"})
    poll("/openapi/v2/text-to-3d", pid)
    rid = create("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
    t = poll("/openapi/v2/text-to-3d", rid)
    dl(t["model_urls"]["glb"], os.path.join(OUT, f"{name}.glb"))
    if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, f"{name}_thumb.png"))
    out[name] = rid

json.dump(out, open(os.path.join(OUT,"p2_results.json"),"w"), indent=2)
print("P2 BATCH DONE. balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
