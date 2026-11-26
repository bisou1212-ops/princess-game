"""배경 다시 만들기 (Blender 를 켜지 않고 명령줄로):
    blender -b --factory-startup --python scripts/blender/run_env.py -- castle   (또는 flower · sea)
→ src/assets/models/env-castle.glb / env-flower-kingdom.glb (AO 굽기 포함)
"""
import bpy, sys
REPO = __import__("os").path.normpath(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "..", ".."))
which = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if which == "castle":
    f = REPO + "/scripts/blender/build_castle_env.py"
    ns = {"__file__": f, "__name__": "env"}
    exec(open(f, encoding="utf-8").read(), ns)
    ns["build_all"]()
    out = REPO + "/src/assets/models/env-castle.glb"
elif which == "sea":
    f = REPO + "/scripts/blender/build_sea_env.py"
    ns = {"__file__": f, "__name__": "env"}
    exec(open(f, encoding="utf-8").read(), ns)
    ns["build_sea"]()
    out = REPO + "/src/assets/models/env-sea-kingdom.glb"
else:
    f = REPO + "/scripts/blender/build_flower_env.py"
    ns = {"__file__": f, "__name__": "env"}
    exec(open(f, encoding="utf-8").read(), ns)
    ns["build_flower"]()
    out = REPO + "/src/assets/models/env-flower-kingdom.glb"
col = bpy.data.collections[ns["COL"]]
tris = {}
dg = bpy.context.evaluated_depsgraph_get()
for o in col.objects:
    me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris[o.name] = len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
print("TRIS", sum(tris.values()), sorted(tris.items(), key=lambda t: -t[1])[:8])
ns["bake_ao"]()
ns["export_glb"](out)
print("DONE", out)
