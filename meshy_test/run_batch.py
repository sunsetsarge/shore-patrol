import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))

def create(endpoint, payload):
    for attempt in range(3):
        r = S.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=30)
        if r.status_code == 429: time.sleep(10); continue
        if r.status_code >= 400: sys.exit(f"ERROR {r.status_code} on {endpoint}: {r.text}")
        return r.json()["result"]
    sys.exit("rate limited 3x")

def poll(endpoint, tid, timeout=900):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json(); st, pg = t["status"], t.get("progress",0)
        if st == "SUCCEEDED": return t
        if st in ("FAILED","CANCELED"): sys.exit(f"TASK_{st} {tid}: {t.get('task_error',{}).get('message','?')}")
        w = 15 if pg >= 95 else d; time.sleep(w); e += w
        if pg < 95: d = min(d*1.5, 30)
    sys.exit(f"TIMEOUT {tid}")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path,"wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print(f"DOWNLOADED: {path} ({os.path.getsize(path)/1e6:.1f} MB)", flush=True)

STYLE = ", stylized proportions, bold shapes, clean silhouette, retro arcade game asset"
def gen(name, prompt, pose=None):
    print(f"=== {name} ===", flush=True)
    p = {"mode":"preview","prompt":prompt+STYLE,"ai_model":"latest","symmetry_mode":"on"}
    if pose: p["pose_mode"] = pose
    pid = create("/openapi/v2/text-to-3d", p); poll("/openapi/v2/text-to-3d", pid)
    rid = create("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
    t = poll("/openapi/v2/text-to-3d", rid)
    dl(t["model_urls"]["glb"], os.path.join(OUT, f"{name}.glb"))
    if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, f"{name}_thumb.png"))
    return rid

results = {}
# Props (no rig)
results["tank"] = gen("tank", "WWII light tank, olive green armor, white star marking, front gun barrel")
results["landing_craft"] = gen("landing_craft", "WWII Higgins boat landing craft, boxy gray steel hull, flat front bow ramp")
results["helicopter"] = gen("helicopter", "military attack helicopter gunship, dark gray, stub wings with rocket pods, four rotor blades")
# Commando (rig + walk)
crid = gen("commando", "WWII commando soldier, tan khaki uniform, dark beret, submachine gun slung on chest", pose="t-pose")
mid = create("/openapi/v1/remesh", {"input_task_id": crid, "target_formats":["glb"], "target_polycount": 100000})
poll("/openapi/v1/remesh", mid)
rig = create("/openapi/v1/rigging", {"input_task_id": mid, "height_meters": 1.75})
t = poll("/openapi/v1/rigging", rig)
dl(t["result"]["basic_animations"]["walking_glb_url"], os.path.join(OUT, "commando_walking.glb"))
results["commando_rig"] = rig
json.dump(results, open(os.path.join(OUT,"batch_results.json"),"w"), indent=2)
bal = S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json()
print(f"BATCH DONE. balance={bal}", flush=True)
