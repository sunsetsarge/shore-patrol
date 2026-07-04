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

    wobble = unit.get("wobble")  # {"pitch":deg,"roll":deg,"bob":frac} static multi-frame motion
    oneshot = unit.get("oneshot", False)  # sample through the FINAL pose (death anims)
    animated = nframes > 1 and bpy.data.actions and not wobble
    if animated:
        act = max(bpy.data.actions, key=lambda a: a.frame_range[1]-a.frame_range[0])
        f0, f1 = act.frame_range
        sc.frame_start, sc.frame_end = int(f0), int(math.ceil(f1))
        if oneshot:
            frames = [int(round(f0 + i*(f1-f0)/(nframes-1))) for i in range(nframes)]
        else:
            frames = [int(round(f0 + i*(f1-f0)/nframes)) for i in range(nframes)]
    elif wobble:
        frames = list(range(nframes))
    else:
        frames = [sc.frame_current]

    dg = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in sc.objects if o.type == 'MESH']
    if animated:
        # union bbox across ALL sampled frames so falls stay in frame
        lo = hi = None
        for f in frames:
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            l, h = world_bbox(meshes, dg)
            lo = l if lo is None else Vector(map(min, lo, l))
            hi = h if hi is None else Vector(map(max, hi, h))
        sc.frame_set(frames[0])
    else:
        sc.frame_set(frames[0] if not wobble else sc.frame_current)
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

    elev = math.radians(unit.get("elev_deg", 10))
    cx = center.x + dist*math.cos(elev)*math.sin(az)
    cy = center.y - dist*math.cos(elev)*math.cos(az)
    cz = center.z + dist*math.sin(elev)
    cam.location = (cx, cy, cz)
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    roots = [o for o in sc.objects if o.parent is None and o.type in ('MESH','ARMATURE','EMPTY')]
    base_state = [(o, o.rotation_euler.copy(), o.location.copy()) for o in roots]
    for i, f in enumerate(frames):
        if wobble:
            ph = 2*math.pi*i/nframes
            pitch = math.radians(wobble.get("pitch", 0))*math.sin(ph)
            roll = math.radians(wobble.get("roll", 0))*math.cos(ph)
            bob = wobble.get("bob", 0)*height*math.sin(2*ph)
            for o, rot, loc in base_state:
                o.rotation_euler = (rot.x + pitch, rot.y + roll, rot.z)
                o.location = (loc.x, loc.y, loc.z + bob)
        else:
            sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, f"{name}_{i}.png")
        bpy.ops.render.render(write_still=True)
        log("wrote", sc.render.filepath)
log("ALL DONE")
