import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY", "")
if not API_KEY: sys.exit("ERROR: MESHY_API_KEY not set")
BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))

def create_task(endpoint, payload):
    r = S.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=30)
    if r.status_code == 402: sys.exit("ERROR: insufficient credits (402)")
    r.raise_for_status()
    tid = r.json()["result"]; print(f"TASK_CREATED: {tid}", flush=True); return tid

def poll_task(endpoint, tid, timeout=600):
    elapsed, delay = 0, 5
    while elapsed < timeout:
        r = S.get(f"{BASE}{endpoint}/{tid}", headers=HEADERS, timeout=30); r.raise_for_status()
        t = r.json(); st, pg = t["status"], t.get("progress", 0)
        print(f"  {st} {pg}% ({elapsed}s)", flush=True)
        if st == "SUCCEEDED": return t
        if st in ("FAILED","CANCELED"): sys.exit(f"TASK_{st}: {t.get('task_error',{}).get('message','?')}")
        d = 15 if pg >= 95 else delay
        time.sleep(d); elapsed += d
        if pg < 95: delay = min(delay*1.5, 30)
    sys.exit("TIMEOUT")

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    with open(path, "wb") as f:
        for c in r.iter_content(8192): f.write(c)
    print(f"DOWNLOADED: {path} ({os.path.getsize(path)/1e6:.1f} MB)", flush=True)

PROMPT = ("WWII soldier in olive drab uniform and steel helmet holding a rifle, "
          "stylized cartoon proportions, bold shapes, flat cel-shaded colors, "
          "retro arcade game character, clean silhouette")

pid = create_task("/openapi/v2/text-to-3d", {"mode":"preview","prompt":PROMPT,"ai_model":"latest","pose_mode":"t-pose","symmetry_mode":"on"})
t = poll_task("/openapi/v2/text-to-3d", pid)
dl(t["model_urls"]["glb"], os.path.join(OUT, "preview.glb"))
if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, "preview_thumb.png"))

rid = create_task("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
t2 = poll_task("/openapi/v2/text-to-3d", rid)
dl(t2["model_urls"]["glb"], os.path.join(OUT, "refined.glb"))
if t2.get("thumbnail_url"): dl(t2["thumbnail_url"], os.path.join(OUT, "refined_thumb.png"))
json.dump({"preview_id":pid,"refine_id":rid,"prompt":PROMPT,"face_count":t2.get("face_count")}, open(os.path.join(OUT,"metadata.json"),"w"), indent=2)

bal = S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json()
print(f"DONE. preview_id={pid} refine_id={rid} face_count={t2.get('face_count')} balance={bal}", flush=True)
