import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))

def create(endpoint, payload):
    for a in range(3):
        r = S.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=30)
        if r.status_code == 429: time.sleep(10); continue
        if r.status_code >= 400: sys.exit(f"ERROR {r.status_code}: {r.text}")
        return r.json()["result"]
    sys.exit("rate limited")

def poll(endpoint, tid, timeout=900):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json()
        if t["status"] == "SUCCEEDED": return t
        if t["status"] in ("FAILED","CANCELED"): sys.exit(f"FAILED {tid}: {t.get('task_error')}")
        w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w; d = min(d*1.5, 30)
    sys.exit(f"TIMEOUT {tid}")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path,"wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print("DOWNLOADED:", path, flush=True)

def gen(name, prompt):
    print(f"=== {name} ===", flush=True)
    pid = create("/openapi/v2/text-to-3d", {"mode":"preview","prompt":prompt,"ai_model":"latest","symmetry_mode":"on"})
    poll("/openapi/v2/text-to-3d", pid)
    rid = create("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
    t = poll("/openapi/v2/text-to-3d", rid)
    dl(t["model_urls"]["glb"], os.path.join(OUT, f"{name}.glb"))
    if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, f"{name}_thumb.png"))
    return rid

STYLE = ", stylized proportions, bold shapes, clean silhouette, retro arcade game asset"
gen("lcvp", "WWII Higgins boat LCVP landing craft: a simple rectangular open-top box-shaped hull like a floating shoebox, completely flat vertical rectangular bow ramp door at the front, low gray-green plywood sides, small helmeted soldier heads visible standing inside the open troop well, tiny engine box at the rear, NO cabin, NO superstructure, NO mast" + STYLE)
gen("lst", "WWII LST tank landing ship: long gray naval vessel with tall blunt bow with two large bow doors that open, flat deck, small bridge tower at the rear, anti-aircraft guns, large hull sitting low in the water" + STYLE)
print("R5 BOATS DONE. balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
