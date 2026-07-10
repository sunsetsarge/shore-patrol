# Load the fused battleship GLB, ADD rendered 3D main-gun barrels at the fore/aft
# turret positions pointing toward the player (toward camera + down), and render
# broadside — same camera/framing as bs_left_cfg so the sprite lines up with the
# existing SHIP_FEATURES map. Barrels get the ship's lighting => rendered-quality,
# not flat vector.
# Usage: blender -b -P build_battleship_guns.py -- <glb> <out.png> [aimY] [aimZ] [len] [rad] [z0] [xfore] [xaft]
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--")+1:]
GLB   = argv[0]
OUT   = argv[1]
AIMY  = float(argv[2]) if len(argv) > 2 else -0.55   # toward camera
AIMZ  = float(argv[3]) if len(argv) > 3 else -0.85   # down
BLEN  = float(argv[4]) if len(argv) > 4 else 0.26
BRAD  = float(argv[5]) if len(argv) > 5 else 0.009
BZ0   = float(argv[6]) if len(argv) > 6 else 0.13    # barrel origin height (deck)
XF    = float(argv[7]) if len(argv) > 7 else -0.42   # fore turret X
XA    = float(argv[8]) if len(argv) > 8 else 0.46    # aft turret X
RES   = 1600

def log(*a): print("[guns]", *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    if e in engines:
        sc.render.engine = e; break
sc.render.film_transparent = True
sc.render.resolution_x = RES; sc.render.resolution_y = RES
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'

bpy.ops.import_scene.gltf(filepath=GLB)
for o in list(sc.objects):
    if o.type == 'MESH' and (o.name.startswith("Icosphere") or len(o.data.vertices) < 100):
        bpy.data.objects.remove(o, do_unlink=True)

ship = [o for o in sc.objects if o.type == 'MESH']

def world_bbox(objs):
    lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi

# Framing bbox from the SHIP ONLY (so framing == existing sprite)
lo, hi = world_bbox(ship)
center = (lo+hi)/2; size = hi-lo
log("ship bbox", tuple(round(v,3) for v in lo), tuple(round(v,3) for v in hi))

# ── Lighting (same as render_frames) ─────────────────────────────────────────
def add_sun(name, rot, energy):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy
    ob = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(ob)
    ob.rotation_euler = rot
add_sun("key", (math.radians(50), 0, math.radians(-30)), 3.5)
add_sun("fill", (math.radians(60), 0, math.radians(140)), 1.2)

# ── Gun material (dark gunmetal) ─────────────────────────────────────────────
mat = bpy.data.materials.new("gun"); mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.05, 0.05, 0.06, 1)
if "Metallic" in bsdf.inputs: bsdf.inputs["Metallic"].default_value = 0.85
if "Roughness" in bsdf.inputs: bsdf.inputs["Roughness"].default_value = 0.42

aim = Vector((0.0, AIMY, AIMZ)).normalized()
up = Vector((0,0,1))
# rotation that maps cylinder's +Z to `aim`
quat = up.rotation_difference(aim)

def add_barrel(x, y, z):
    bpy.ops.mesh.primitive_cylinder_add(radius=BRAD, depth=BLEN, vertices=20)
    b = bpy.context.active_object
    b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = quat
    # move so the barrel base sits at (x,y,z) and extends along aim
    b.location = Vector((x, y, z)) + aim * (BLEN*0.5)
    b.data.materials.append(mat)
    return b

# a low, flat turret at each main battery so barrels emerge from a mount
def add_turret(x, z):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.028, vertices=24)
    d = bpy.context.active_object
    d.location = (x, 0.0, z)
    d.data.materials.append(mat)
    return d

for X in (XF, XA):
    add_turret(X, BZ0)
    add_barrel(X-0.018, -0.03, BZ0+0.012)
    add_barrel(X+0.018, -0.03, BZ0+0.012)

# ── Camera (az=0, elev=7, fill 0.84 on the SHIP bbox) ────────────────────────
az = math.radians(0); elev = math.radians(7)
height = size.z; width_xy = max(size.x, size.y)
fov = 2*math.atan(18/50)
dist = max((height/0.84/2)/math.tan(fov/2), (width_xy/0.84/2)/math.tan(fov/2))
cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 50
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (center.x + dist*math.cos(elev)*math.sin(az),
                center.y - dist*math.cos(elev)*math.cos(az),
                center.z + dist*math.sin(elev))
cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
log("wrote", OUT)
print("DONE", flush=True)
