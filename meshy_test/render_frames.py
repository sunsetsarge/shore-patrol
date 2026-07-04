# Headless Blender renderer for Beachhead sprite frames.
# Usage: blender -b -P render_frames.py -- <config.json>
# config: {"units": [{"name","glb","frames","azimuth_deg"}], "out_dir", "res"}
import bpy, json, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--")+1:]
cfg = json.load(open(argv[0]))
OUT = cfg["out_dir"]; RES = cfg.get("res", 768)
os.makedirs(OUT, exist_ok=True)

def log(*a): print("[render]", *a, flush=True)

def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if e in engines:
            sc.render.engine = e; break
    else:
        sc.render.engine = "CYCLES"; sc.cycles.samples = 32
    sc.render.film_transparent = True
    sc.render.resolution_x = RES; sc.render.resolution_y = RES
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    return sc

def add_sun(name, rot_euler, energy):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o)
    o.rotation_euler = rot_euler
    return o

def world_bbox(objs, depsgraph):
    lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
    for o in objs:
        if o.type != 'MESH': continue
        # Meshy GLB exports include a stray ~42-vert "Icosphere" placeholder
        # (a unit reference sphere unrelated to the actual model) on rigged
        # exports. Exclude it from bbox/framing and rendering.
        if o.name.startswith("Icosphere") or len(o.data.vertices) < 100:
            continue
        oe = o.evaluated_get(depsgraph)
        for c in oe.bound_box:
            w = oe.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi

for unit in cfg["units"]:
    name, glb, nframes = unit["name"], unit["glb"], unit["frames"]
    az = math.radians(unit.get("azimuth_deg", 0))
    log("unit", name, "azimuth", unit.get("azimuth_deg", 0))
    sc = setup_scene()
    bpy.ops.import_scene.gltf(filepath=glb)

    # Remove Meshy's stray placeholder mesh(es) (e.g. "Icosphere") so they
    # can't appear in the render and don't skew the bounding box.
    for o in list(sc.objects):
        if o.type == 'MESH' and (o.name.startswith("Icosphere") or len(o.data.vertices) < 100):
            bpy.data.objects.remove(o, do_unlink=True)

    add_sun("key", (math.radians(50), 0, math.radians(-30)), 3.5)
    add_sun("fill", (math.radians(60), 0, math.radians(140)), 1.2)

    if nframes > 1 and bpy.data.actions:
        act = max(bpy.data.actions, key=lambda a: a.frame_range[1]-a.frame_range[0])
        f0, f1 = act.frame_range
        sc.frame_start, sc.frame_end = int(f0), int(math.ceil(f1))
        frames = [int(round(f0 + i*(f1-f0)/nframes)) for i in range(nframes)]
    else:
        frames = [sc.frame_current]
    sc.frame_set(frames[0])

    dg = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in sc.objects if o.type == 'MESH']
    lo, hi = world_bbox(meshes, dg)
    center = (lo+hi)/2; size = hi-lo
    height = size.z
    width_xy = max(size.x, size.y)  # worst-case horizontal extent across any azimuth

    cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 50
    cam = bpy.data.objects.new("cam", cam_d); bpy.context.collection.objects.link(cam)
    sc.camera = cam

    # Derive framing from the actual bbox: subject should fill ~84% of frame
    # height (8% margin each side), full body visible horizontally too.
    fill_frac = 0.84
    fov_v = 2*math.atan(18/50)  # sensor_height(36*res_y/res_x)/2 /lens; square res -> 18
    fov_h = 2*math.atan(18/50)
    dist_for_height = (height/fill_frac/2) / math.tan(fov_v/2)
    dist_for_width = (width_xy/fill_frac/2) / math.tan(fov_h/2)
    dist = max(dist_for_height, dist_for_width)

    elev = math.radians(10)
    cx = center.x + dist*math.cos(elev)*math.sin(az)
    cy = center.y - dist*math.cos(elev)*math.cos(az)
    cz = center.z + dist*math.sin(elev)
    cam.location = (cx, cy, cz)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    for i, f in enumerate(frames):
        sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, f"{name}_{i}.png")
        bpy.ops.render.render(write_still=True)
        log("wrote", sc.render.filepath)
log("ALL DONE")
