import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(OUT,"metadata.json")))

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

r = S.post(f"{BASE}/openapi/v1/rigging", headers=HEADERS, json={"input_task_id": meta["refine_id"], "height_meters": 1.75}, timeout=30)
r.raise_for_status(); rig_id = r.json()["result"]; print(f"RIG_TASK: {rig_id}", flush=True)
t = poll("/openapi/v1/rigging", rig_id)
res = t["result"]
dl(res["rigged_character_glb_url"], os.path.join(OUT,"rigged.glb"))
ba = res.get("basic_animations", {})
if ba.get("walking_glb_url"): dl(ba["walking_glb_url"], os.path.join(OUT,"walking.glb"))
if ba.get("running_glb_url"): dl(ba["running_glb_url"], os.path.join(OUT,"running.glb"))
bal = S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json()
print(f"DONE rig_id={rig_id} balance={bal}", flush=True)
