import bpy, math
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/Claude/Projects/Active/Beachhead/meshy_test/walking.glb")
dg = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
for o in meshes:
    oe = o.evaluated_get(dg)
    for c in oe.bound_box:
        w = oe.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
print("LO", lo, "HI", hi, "SIZE", hi-lo)
print("cameras", bpy.data.cameras.keys())
print("num objects", len(bpy.context.scene.objects))
for o in bpy.context.scene.objects:
    print(o.name, o.type)
