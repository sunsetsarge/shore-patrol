import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(OUT,"batch_results.json")))
r = S.post(f"{BASE}/openapi/v1/retexture", headers=HEADERS, json={
  "input_task_id": res["landing_craft"],
  "text_style_prompt": "battleship gray military steel hull, weathered navy paint, olive drab equipment, WWII warship colors",
  "enable_pbr": True}, timeout=30)
if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
tid = r.json()["result"]; print(f"RETEX: {tid}", flush=True)
e, d = 0, 5
while e < 600:
    t = S.get(f"{BASE}/openapi/v1/retexture/{tid}", headers=HEADERS, timeout=30).json()
    if t["status"] == "SUCCEEDED": break
    if t["status"] in ("FAILED","CANCELED"): sys.exit(f"FAILED: {t.get('task_error')}")
    w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w; d = min(d*1.5, 30)
url = t["model_urls"]["glb"]
r = S.get(url, timeout=300, stream=True); r.raise_for_status()
p = os.path.join(OUT,"landing_craft.glb")
with open(p,"wb") as f:
    for c in r.iter_content(8192): f.write(c)
print(f"REPLACED: {p} ({os.path.getsize(p)/1e6:.1f} MB)", flush=True)
if t.get("thumbnail_url"):
    r2 = S.get(t["thumbnail_url"], timeout=60); open(os.path.join(OUT,"landing_craft_thumb.png"),"wb").write(r2.content)
print("balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
