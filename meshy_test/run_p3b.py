import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
batch = json.load(open(os.path.join(OUT,"batch_results.json")))
r = S.post(f"{BASE}/openapi/v1/animations", headers=HEADERS, json={"rig_task_id": batch["commando_rig"], "action_id": 234}, timeout=30)
if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
tid = r.json()["result"]; print("task", tid, flush=True)
e, d = 0, 5
while e < 600:
    t = S.get(f"{BASE}/openapi/v1/animations/{tid}", headers=HEADERS, timeout=30).json()
    if t["status"] == "SUCCEEDED": break
    if t["status"] in ("FAILED","CANCELED"): sys.exit(f"FAILED: {t.get('task_error')}")
    w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w; d = min(d*1.5, 30)
url = t["result"]["animation_glb_url"]
r = S.get(url, timeout=300, stream=True); r.raise_for_status()
p = os.path.join(OUT, "commando_combatwalk.glb")
with open(p,"wb") as f:
    for c in r.iter_content(8192): f.write(c)
print("REPLACED", p, os.path.getsize(p)//1024, "KB", flush=True)
