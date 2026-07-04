import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="C:/Claude/Projects/Active/Beachhead/meshy_test/walking.glb")
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        print(o.name, "verts:", len(o.data.vertices), "dims:", o.dimensions, "loc:", o.location, "parent:", o.parent)
