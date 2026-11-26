"""캐릭터 다시 만들기 (Blender 를 켜지 않고 명령줄로):
    blender -b --factory-startup --python scripts/blender/run_chars.py -- princess src/assets/models
    (princess | friends | pets 는 .glb 내보내기, preview-princess | preview-friends | preview-pets <폴더> <그림.png> 는 미리보기 그림)
"""
import bpy, sys, os, math
REPO = __import__("os").path.normpath(__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)), "..", ".."))
SB = REPO + "/scripts/blender/"
args = sys.argv[sys.argv.index("--") + 1:]
what, outdir = args[0], args[1]
png = args[2] if len(args) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)

def load(f, extra=None):
    ns = {"__file__": SB + f, "__name__": "x"}
    if extra: ns.update(extra)
    exec(open(SB + f, encoding="utf-8").read(), ns)
    return ns

def tris(objs):
    dg = bpy.context.evaluated_depsgraph_get(); t = {}
    for o in objs:
        if o.type != "MESH": continue
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); t[o.name] = len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    return t

def render(path, targets, cam_dist=4.2, z=1.0, lens=50, spread=1.3):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
    cam.location = (0.4, -cam_dist, z + 0.35); cam.data.lens = lens
    direction = __import__("mathutils").Vector((0, 0, z)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    for ang, en in ((50, 3.0), (-60, 1.2)):
        l = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); l.data.energy = en
        l.rotation_euler = (math.radians(55), 0, math.radians(ang)); sc.collection.objects.link(l)
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.75, 0.72, 0.8)
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try: sc.render.engine = eng; break
        except TypeError: pass
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = 1400, 700
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

if what.endswith("princess"):
    P = load("build_princess.py"); P["build_all"]()
    A = load("anim_princess.py"); A["make_all"]("Rig")
    col = bpy.data.collections[P["COLLECTION"]]
    t = tris(col.objects); print("TRIS", sum(t.values()), sorted(t.items(), key=lambda x: -x[1])[:14])
    if what == "princess":
        P["export_glb"](os.path.join(outdir, "princess.glb")); print("DONE")
    else:
        # 세 가지 옷차림을 나란히: 같은 물체를 복제할 수 없으니 한 벌씩 찍어 합친다
        outfits = [("hair-long", "crown-gold", "dress-puffy", "shoes-flat"), ("hair-pigtails", "tiara", "dress-ribbon", "boots"), ("hair-short", "flower-crown", "dress-flower", "slippers-bunny")]
        names = {o.name for o in col.objects}
        rig = bpy.data.objects["Rig"]
        if rig.animation_data: rig.animation_data.action = None
        for i, fit in enumerate(outfits):
            P["show_outfit"]([n for n in fit if n in names])
            render(png.replace(".png", f"-{i}.png"), [], cam_dist=4.6, z=1.0)
elif what.endswith("friends"):
    F = load("build_friends.py"); F["build_friends"]()
    A = load("anim_princess.py")
    t = tris([bpy.data.objects[i + "_body"] for i in F["IDS"]]); print("TRIS", t)
    if what == "friends":
        print(F["export_all"](outdir, A)); print("DONE")
    else:
        for i in F["IDS"]:
            o = bpy.data.objects[i]
            if o.animation_data: o.animation_data.action = None
        render(png, [], cam_dist=8.5, z=0.9, lens=50)
elif what.endswith("pets"):
    Pt = load("build_pets.py"); Pt["build_pets"]()
    t = tris([bpy.data.objects[i + "_body"] for i in Pt["IDS"]]); print("TRIS", t)
    if what == "pets":
        Pt["export_pets"](outdir); print("DONE")
    else:
        render(png, [], cam_dist=4.0, z=0.5)
