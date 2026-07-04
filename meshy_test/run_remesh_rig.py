import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(OUT,"metadata.json")))

def create(endpoint, payload):
    r = S.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=30)
    if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
    tid = r.json()["result"]; print(f"TASK: {tid}", flush=True); return tid

def poll(endpoint, tid, timeout=600):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json(); st, pg = t["status"], t.get("progress",0)
        print(f"  {st} {pg}% ({e}s)", flush=True)
        if st == "SUCCEEDED": return t
        if st in ("FAILED","CANCELED"): sys.exit(f"TASK_{st}: {t.get('task_error',{}).get('message','?')}")
        w = 15 if pg >= 95 else d; time.sleep(w); e += w
        if pg < 95: d = min(d*1.5, 30)
    sys.exit("TIMEOUT")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path,"wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print(f"DOWNLOADED: {path} ({os.path.getsize(path)/1e6:.1f} MB)", flush=True)

# Remesh to 100k faces (try v1 endpoint per skill docs; fall back to v2 per error message)
payload = {"input_task_id": meta["refine_id"], "target_formats": ["glb"], "target_polycount": 100000}
r = S.post(f"{BASE}/openapi/v1/remesh", headers=HEADERS, json=payload, timeout=30)
if r.status_code >= 400:
    print(f"v1 remesh -> {r.status_code}, trying v2", flush=True)
    r = S.post(f"{BASE}/openapi/v2/remesh", headers=HEADERS, json=payload, timeout=30)
    if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
    remesh_ep = "/openapi/v2/remesh"
else:
    remesh_ep = "/openapi/v1/remesh"
remesh_id = r.json()["result"]; print(f"REMESH TASK: {remesh_id} via {remesh_ep}", flush=True)
poll(remesh_ep, remesh_id)

rig_id = create("/openapi/v1/rigging", {"input_task_id": remesh_id, "height_meters": 1.75})
t = poll("/openapi/v1/rigging", rig_id)
res = t["result"]
dl(res["rigged_character_glb_url"], os.path.join(OUT,"rigged.glb"))
ba = res.get("basic_animations", {})
for k in ("walking_glb_url","running_glb_url"):
    if ba.get(k): dl(ba[k], os.path.join(OUT, k.replace("_glb_url","")+".glb"))
meta.update({"remesh_id": remesh_id, "rig_id": rig_id}); json.dump(meta, open(os.path.join(OUT,"metadata.json"),"w"), indent=2)
bal = S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json()
print(f"DONE rig_id={rig_id} balance={bal}", flush=True)
