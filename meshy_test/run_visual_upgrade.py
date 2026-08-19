# Visual upgrade batch: replace the flat untextured grey craft + plain tank, and
# ADD beach dressing props (the beach is currently empty sand).
# Usage: MESHY_API_KEY=... python run_visual_upgrade.py [only_name]
import requests, time, os, sys, json
API_KEY = os.environ.get("MESHY_API_KEY","")
BASE = "https://api.meshy.ai"; HEADERS = {"Authorization": f"Bearer {API_KEY}"}
S = requests.Session(); S.trust_env = False
OUT = os.path.dirname(os.path.abspath(__file__))

def create(ep, p):
    for a in range(4):
        r = S.post(f"{BASE}{ep}", headers=HEADERS, json=p, timeout=30)
        if r.status_code == 429: time.sleep(15); continue
        if r.status_code >= 400: print(f"ERR {r.status_code}: {r.text}", flush=True); return None
        return r.json()["result"]
    return None

def poll(ep, tid, timeout=1500):
    e, d = 0, 5
    while e < timeout:
        r = S.get(f"{BASE}{ep}/{tid}", headers=HEADERS, timeout=30)
        t = r.json()
        if t.get("status") == "SUCCEEDED": return t
        if t.get("status") in ("FAILED","CANCELED"):
            print(f"FAIL {tid}: {t.get('task_error')}", flush=True); return None
        w = 15 if t.get("progress",0) >= 95 else d; time.sleep(w); e += w; d = min(d*1.5,30)
    return None

def dl(url, path):
    r = S.get(url, timeout=300, stream=True); r.raise_for_status()
    open(path,"wb").write(r.content); print("DL:", path, flush=True)

STYLE = ", highly detailed, physically based textures, weathered war-worn surfaces, bold readable silhouette, game asset"

def gen(name, prompt, symmetry="on"):
    if len(sys.argv) > 1 and sys.argv[1] != name: return
    if os.path.exists(os.path.join(OUT, name + ".glb")):
        print("SKIP (exists):", name, flush=True); return
    print("=== " + name + " ===", flush=True)
    pid = create("/openapi/v2/text-to-3d", {"mode":"preview","prompt":prompt,"ai_model":"latest","symmetry_mode":symmetry})
    if not pid or not poll("/openapi/v2/text-to-3d", pid): return
    rid = create("/openapi/v2/text-to-3d", {"mode":"refine","preview_task_id":pid,"enable_pbr":True,"ai_model":"latest"})
    if not rid: return
    t = poll("/openapi/v2/text-to-3d", rid)
    if not t: return
    dl(t["model_urls"]["glb"], os.path.join(OUT, name+".glb"))
    if t.get("thumbnail_url"): dl(t["thumbnail_url"], os.path.join(OUT, name+"_thumb.png"))
    print(name, "DONE", flush=True)

# --- Replace the flat grey craft (worst-looking assets; LCVP is the FIRST enemy seen) ---
gen("lcvp_v2",
    "a WWII Higgins boat LCVP landing craft, rectangular wooden and steel hull with a flat "
    "front bow ramp, low sides, small pilot house at the rear, olive drab and navy grey weathered "
    "paint, rivets and scuffs, sitting level like a boat in water" + STYLE)

gen("lst_v2",
    "a WWII LST tank landing ship, long low grey steel hull with large square bow doors at the front, "
    "flat tank deck, small bridge superstructure at the stern, naval grey weathered paint, "
    "rust streaks and rivets, an ocean-going landing vessel" + STYLE)

# --- The most-seen land unit; currently plain flat green with no detail ---
gen("tank_v2",
    "a WWII medium battle tank, angular sloped armor hull, prominent turret with a long main gun barrel, "
    "detailed road wheels and tracks, stowage boxes, spare track links and jerry cans on the hull, "
    "tow cables, olive drab weathered paint with mud and scratches, aggressive military silhouette" + STYLE)

# --- NEW: beach dressing. The beach is currently empty sand with nothing on it. ---
gen("obst_hedgehog",
    "a Czech hedgehog anti-tank beach obstacle, three heavy rusted steel I-beams welded crossing at the "
    "center forming a six-pointed star, rusty weathered metal, WWII beach defense" + STYLE, symmetry="off")

gen("obst_bunker",
    "a WWII concrete beach bunker pillbox, squat reinforced grey concrete box with a dark horizontal "
    "gun embrasure slit across the front, sandbags stacked at the base, weathered stained concrete, "
    "low and menacing" + STYLE)

gen("obst_wire",
    "a coil of rusty barbed wire on wooden stakes, a low tangled barricade section, "
    "weathered rusted wire and rough timber posts, WWII beach defense obstacle" + STYLE, symmetry="off")

gen("wreck_craft",
    "a destroyed burnt-out WWII landing craft wreck half sunk and tilted, blackened scorched hull, "
    "torn twisted metal, gaping holes, rusted and charred, abandoned battle wreckage" + STYLE, symmetry="off")

print("ALL DONE. balance:", S.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=10).json(), flush=True)
