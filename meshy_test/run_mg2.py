import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))
def create(ep,p):
    for a in range(3):
        r=S.post(f"{BASE}{ep}",headers=HEADERS,json=p,timeout=30)
        if r.status_code==429: time.sleep(10); continue
        if r.status_code>=400: sys.exit(f"ERR {r.status_code}: {r.text}")
        return r.json()["result"]
def poll(ep,tid,to=900):
    e,d=0,5
    while e<to:
        r=S.get(f"{BASE}{ep}/{tid}",headers=HEADERS,timeout=30); r.raise_for_status(); t=r.json()
        if t["status"]=="SUCCEEDED": return t
        if t["status"] in ("FAILED","CANCELED"): sys.exit(f"FAIL {t.get('task_error')}")
        w=15 if t.get("progress",0)>=95 else d; time.sleep(w); e+=w; d=min(d*1.5,30)
def dl(u,p):
    r=S.get(u,timeout=300,stream=True); r.raise_for_status(); open(p,"wb").write(r.content); print("DL",p,flush=True)
prompt=("a single clean WW2 twin .50 caliber anti-aircraft machine gun on a simple tripod: two short parallel gun barrels "
        "side by side pointing up and forward, a compact boxy receiver, twin spade grips at the back, on a low three-leg tripod, "
        "dark gunmetal, chunky simple shapes, stylized retro arcade game asset, clean silhouette, isolated")
pid=create("/openapi/v2/text-to-3d",{"mode":"preview","prompt":prompt,"ai_model":"latest","symmetry_mode":"on"})
poll("/openapi/v2/text-to-3d",pid)
rid=create("/openapi/v2/text-to-3d",{"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
t=poll("/openapi/v2/text-to-3d",rid)
dl(t["model_urls"]["glb"],os.path.join(OUT,"wpn_mg2.glb"))
if t.get("thumbnail_url"): dl(t["thumbnail_url"],os.path.join(OUT,"wpn_mg2_thumb.png"))
print("MG2 DONE. bal:",S.get(f"{BASE}/openapi/v1/balance",headers=HEADERS,timeout=10).json(),flush=True)
