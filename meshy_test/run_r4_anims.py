import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
v2 = json.load(open(os.path.join(OUT,"soldiers_v2.json")))

def poll(endpoint, tid, timeout=600):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json()
        if t["status"] == "SUCCEEDED": return t
        if t["status"] in ("FAILED","CANCELED"): sys.exit(f"FAILED {tid}: {t.get('task_error')}")
        w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w; d = min(d*1.5, 30)
    sys.exit("TIMEOUT")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path,"wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print("DOWNLOADED:", path, flush=True)

for unit in ("infantry","commando"):
    rig = v2[unit]["rig"]
    print(f"=== fire anim {unit} (action 104 Side_Shot) ===", flush=True)
    r = S.post(f"{BASE}/openapi/v1/animations", headers=HEADERS, json={"rig_task_id": rig, "action_id": 104}, timeout=30)
    if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
    t = poll("/openapi/v1/animations", r.json()["result"])
    dl(t["result"]["animation_glb_url"], os.path.join(OUT, f"{unit}_v2_fire.glb"))
print("R4 ANIMS DONE. balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
