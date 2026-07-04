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

SOLDIERS = {
 "infantry": "WWII soldier in olive drab uniform and steel helmet, right arm holding a rifle firmly in his right hand, T-pose with arms outstretched, stylized proportions, bold shapes, clean silhouette, retro arcade game character",
 "commando": "WWII commando in tan khaki uniform and dark beret, right arm holding a submachine gun firmly in his right hand, T-pose with arms outstretched, stylized proportions, bold shapes, clean silhouette, retro arcade game character",
}
results = {}
for unit, prompt in SOLDIERS.items():
    print(f"=== {unit} v2 ===", flush=True)
    pid = create("/openapi/v2/text-to-3d", {"mode":"preview","prompt":prompt,"ai_model":"latest","pose_mode":"t-pose","symmetry_mode":"auto"})
    poll("/openapi/v2/text-to-3d", pid)
    rid = create("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
    t = poll("/openapi/v2/text-to-3d", rid)
    if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, f"{unit}_v2_thumb.png"))
    mid = create("/openapi/v1/remesh", {"input_task_id": rid, "target_formats":["glb"], "target_polycount": 100000})
    poll("/openapi/v1/remesh", mid)
    rig = create("/openapi/v1/rigging", {"input_task_id": mid, "height_meters": 1.75})
    poll("/openapi/v1/rigging", rig)
    for label, action in [("combatwalk", 234), ("death", 183)]:
        aid = create("/openapi/v1/animations", {"rig_task_id": rig, "action_id": action})
        t2 = poll("/openapi/v1/animations", aid)
        dl(t2["result"]["animation_glb_url"], os.path.join(OUT, f"{unit}_v2_{label}.glb"))
    results[unit] = {"refine": rid, "rig": rig}
json.dump(results, open(os.path.join(OUT,"soldiers_v2.json"),"w"), indent=2)
print("SOLDIERS V2 DONE. balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
