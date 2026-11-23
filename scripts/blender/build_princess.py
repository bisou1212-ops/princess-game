"""
공주 모델 만들기 (M7 B단계) — Blender 안에서 실행하는 스크립트.

Blender MCP로 실행:  exec(open(r"<repo>/scripts/blender/build_princess.py", encoding="utf-8").read(), ns); ns["build_all"]()
내보내기:            ns["export_glb"](r"<repo>/src/assets/models/princess.glb")  (src/assets 라서 배포 때 파일 이름에 해시가 붙음)
또는 Blender > Scripting 탭에서 이 파일을 열고 Run Script.

규칙 (게임 코드 src/scenes/castle/princess-model.ts 와 약속):
- 물체 이름 = 부위 id. "base"(몸·얼굴)는 항상 보이고, 나머지는 items.json 의 옷 id 그대로
  (hair-long, crown-gold, dress-basic ...). 게임은 입은 옷 이름의 물체만 보이게 한다.
- 재질 이름으로 색을 정한다.
    tint        : 옷 색(팔레트)으로 바뀜
    tint_light  : 옷 색을 밝게 섞은 색으로 바뀜 (주름 장식·리본 등)
    tint_wing   : 옷 색 + 반투명 (날개)
    skin, eye, shine, cheek, mouth, white, gem, yellow : 고정 색
- Blender 좌표: Z 위, 공주 얼굴은 -Y 쪽을 본다 (glTF로 내보내면 게임의 +Z 앞쪽이 됨).
- 바닥 z=0, 키 약 1.9m (게임의 치비 비율과 같음).
"""
import bpy
import bmesh
import math
from mathutils import Matrix, Vector, Euler

COLLECTION = "Princess"
TEMP = "Princess_tmp"

# ── 재질 ─────────────────────────────────────────────
MAT_COLORS = {
    "tint": (1.0, 0.61, 0.81, 1.0),
    "tint_light": (1.0, 0.82, 0.91, 1.0),
    "tint_wing": (0.45, 0.75, 1.0, 0.75),
    "skin": (1.0, 0.90, 0.85, 1.0),
    "eye": (0.14, 0.12, 0.2, 1.0),
    "shine": (1.0, 1.0, 1.0, 1.0),
    "cheek": (1.0, 0.62, 0.72, 1.0),
    "mouth": (0.85, 0.38, 0.5, 1.0),
    "white": (1.0, 0.98, 0.95, 1.0),
    "gem": (0.85, 0.95, 1.0, 1.0),
    "yellow": (1.0, 0.93, 0.6, 1.0),
}


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    col = MAT_COLORS[name]
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = 0.6
    if col[3] < 1.0:
        bsdf.inputs["Alpha"].default_value = col[3]
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    m.diffuse_color = col
    return m


# ── 도형 만들기 (임시 물체; 나중에 부위별로 하나로 합침) ─────────
def _temp_collection():
    col = bpy.data.collections.get(TEMP)
    if col is None:
        col = bpy.data.collections.new(TEMP)
        bpy.context.scene.collection.children.link(col)
    return col


def _new_obj(bm, name, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = Euler(rot)
    ob.scale = scale
    ob["mat"] = mat
    _temp_collection().objects.link(ob)
    return ob


def sphere(mat, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), seg=24, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    return _new_obj(bm, "sphere", mat, loc, rot, scale)


def cone(mat, r_bottom, r_top, depth, loc, rot=(0, 0, 0), scale=(1, 1, 1), seg=24, caps=True, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r_bottom, radius2=r_top, depth=depth)
    return _new_obj(bm, "cone", mat, loc, rot, scale, smooth)


def capsule(mat, r, length, loc, rot=(0, 0, 0), seg=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts:
        v.co.z += length / 2 if v.co.z > 0 else -length / 2 if v.co.z < 0 else 0
    return _new_obj(bm, "capsule", mat, loc, rot)


def torus(mat, R, r, loc, rot=(0, 0, 0), arc=(0.0, math.tau), seg=32, ring=8):
    """XY 평면의 도넛(또는 호). arc=(시작각, 끝각)"""
    bm = bmesh.new()
    a0, a1 = arc
    closed = abs((a1 - a0) - math.tau) < 1e-6
    n = seg if closed else seg + 1
    rows = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg
        c = Vector((math.cos(a), math.sin(a), 0))
        row = []
        for j in range(ring):
            b = math.tau * j / ring
            p = c * (R + r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))
            row.append(bm.verts.new(p))
        rows.append(row)
    for i in range(n if closed else n - 1):
        r0, r1 = rows[i], rows[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % ring], r0[(j + 1) % ring]))
    if not closed:  # 끝 막기
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new_obj(bm, "torus", mat, loc, rot)


def star(mat, r_out, r_in, thickness, loc, rot=(0, 0, 0), points=5):
    """XZ 평면(앞 -Y를 보는) 별, 두께 있음"""
    bm = bmesh.new()
    ring = []
    for i in range(points * 2):
        a = math.pi / 2 + math.pi * i / points
        rr = r_out if i % 2 == 0 else r_in
        ring.append(Vector((math.cos(a) * rr, 0, math.sin(a) * rr)))
    front = [bm.verts.new(p + Vector((0, -thickness / 2, 0))) for p in ring]
    back = [bm.verts.new(p + Vector((0, thickness / 2, 0))) for p in ring]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    k = len(ring)
    for i in range(k):
        bm.faces.new((front[i], front[(i + 1) % k], back[(i + 1) % k], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new_obj(bm, "star", mat, loc, rot, smooth=False)


def hair_cap(mat, r, center, front_cut=0.1, back_cut=-0.44, seg=32, rings=20):
    """머리를 덮는 반구: 앞(-Y)은 이마가 보이게 높게, 뒤(+Y)는 낮게 자른다"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    # 비스듬한 평면 하나로 깔끔하게 자르기 (꼭짓점 단위로 지우면 계단처럼 보임)
    # 자르는 높이 z = b + m*y  (앞 y=-r 에서 front, 뒤 y=+r 에서 back)
    f = front_cut * r / 0.43
    b_ = back_cut * r / 0.43
    m = (b_ - f) / (2 * r)
    b = (f + b_) / 2
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, 0, b), plane_no=Vector((0, -m, 1)).normalized(), clear_inner=True)
    # 얇은 껍데기라 안쪽이 비어 보이지 않게 두께 대신 살짝 크게
    return _new_obj(bm, "haircap", mat, center)


def crown_band(mat, r_bottom, r_top, height, spike, loc, points=5, seg=40):
    bm = bmesh.new()
    lo, hi = [], []
    for i in range(seg):
        a = math.tau * i / seg
        s = max(0.0, math.cos(points * a + math.pi / 2)) ** 4  # 앞쪽(-Y) 가운데에 뾰족
        lo.append(bm.verts.new((math.cos(a) * r_bottom, math.sin(a) * r_bottom, 0)))
        hi.append(bm.verts.new((math.cos(a) * r_top, math.sin(a) * r_top, height + spike * s)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _new_obj(bm, "crown", mat, loc)
    mod = ob.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.025
    mod.offset = 0
    return ob


# ── 합치기: 부위 하나 = 물체 하나 (재질 여러 개) ──────────────
def build_item(name, pieces):
    col = bpy.data.collections.get(COLLECTION)
    old = bpy.data.objects.get(name)
    if old:
        me = old.data
        bpy.data.objects.remove(old)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    bm = bmesh.new()
    mats = []
    for p in pieces:
        mname = p["mat"]
        if mname not in mats:
            mats.append(mname)
        idx = mats.index(mname)
        ev = p.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(p.matrix_world)
        start = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[start:]:
            f.material_index = idx
        ev.to_mesh_clear()
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(get_mat(m))
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    # 임시 조각 지우기
    for p in pieces:
        pm = p.data
        bpy.data.objects.remove(p)
        if pm and pm.users == 0:
            bpy.data.meshes.remove(pm)
    return ob


def reset():
    for cname in (COLLECTION, TEMP):
        col = bpy.data.collections.get(cname)
        if col:
            for o in list(col.objects):
                me = o.data
                bpy.data.objects.remove(o)
                if me and me.users == 0:
                    bpy.data.meshes.remove(me)
            bpy.data.collections.remove(col)
    col = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(col)


HEAD = Vector((0, 0, 1.42))
HEAD_R = 0.40


def on_head(x, dz, lift=0.0):
    """머리 앞면(-Y) 위의 점 (x, 머리 가운데에서 dz만큼 위아래)"""
    y = -math.sqrt(max(HEAD_R**2 - x * x - dz * dz, 0.0)) - lift
    return (x, y, HEAD.z + dz)


# ── 몸·얼굴 ───────────────────────────────────────────
def build_base():
    P = []
    P.append(sphere("skin", HEAD_R, HEAD, seg=36, rings=24))
    P.append(cone("skin", 0.075, 0.07, 0.16, (0, 0, 1.0), seg=16))  # 목
    # 큰 눈 + 반짝 2개
    for s in (-1, 1):
        x = s * 0.145
        e = sphere("eye", 0.075, on_head(x, -0.01, -0.012), scale=(0.85, 0.35, 1.15), seg=20, rings=12)
        P.append(e)
        P.append(sphere("shine", 0.024, on_head(x + s * 0.0 + 0.025, 0.035, 0.012), scale=(1, 0.5, 1), seg=10, rings=6))
        P.append(sphere("shine", 0.011, on_head(x - 0.022, -0.045, 0.012), scale=(1, 0.5, 1), seg=8, rings=5))
        P.append(sphere("cheek", 0.06, on_head(s * 0.235, -0.1, -0.008), scale=(1, 0.35, 0.75), seg=14, rings=8))
    # 웃는 입 (아래쪽 반원 호)
    mx, my, mz = on_head(0, -0.14, 0.004)
    P.append(torus("mouth", 0.04, 0.011, (mx, my, mz), rot=(math.pi / 2, 0, 0), arc=(math.pi + 0.35, math.tau - 0.35), seg=12, ring=6))
    # 팔 + 손
    for s in (-1, 1):
        P.append(capsule("skin", 0.055, 0.26, (s * 0.25, 0, 0.76), rot=(0, s * 0.42, 0)))
        P.append(sphere("skin", 0.065, (s * 0.32, -0.01, 0.6), seg=14, rings=8))
    # 다리
    for s in (-1, 1):
        P.append(cone("skin", 0.065, 0.065, 0.26, (s * 0.1, 0, 0.13), seg=14))
    return build_item("base", P)


# ── 머리 ─────────────────────────────────────────────
def bangs(P):
    for x, z in ((-0.15, 1.6), (0.0, 1.635), (0.15, 1.6)):
        P.append(sphere("tint", 0.12, (x, -0.33, z), scale=(1.05, 0.45, 0.7), seg=16, rings=10))


def build_hair(kind):
    P = [hair_cap("tint", 0.435, (0, 0.01, 1.435))]
    bangs(P)
    if kind == "long":
        P.append(sphere("tint", 1.0, (0, 0.15, 1.18), scale=(0.42, 0.25, 0.5), seg=24, rings=16))
        for s in (-1, 1):
            P.append(capsule("tint", 0.085, 0.3, (s * 0.37, -0.04, 1.2)))
    elif kind == "pigtails":
        for s in (-1, 1):
            P.append(sphere("tint", 0.13, (s * 0.44, 0.06, 1.56), seg=16, rings=10))
            P.append(sphere("tint", 1.0, (s * 0.5, 0.1, 1.26), scale=(0.11, 0.11, 0.25), seg=16, rings=12))
            P.append(torus("tint_light", 0.07, 0.025, (s * 0.47, 0.08, 1.46), rot=(0, 0, 0), seg=14, ring=6))
    elif kind == "bun":
        P.append(sphere("tint", 0.16, (0, 0.1, 1.89), seg=20, rings=12))
        P.append(torus("tint_light", 0.12, 0.03, (0, 0.08, 1.8), rot=(0.25, 0, 0), seg=16, ring=6))
    return build_item(f"hair-{kind}", P)


# ── 왕관·머리띠 ───────────────────────────────────────
def build_crown():
    P = [crown_band("tint", 0.17, 0.19, 0.1, 0.1, (0, 0.03, 1.8))]
    for i in range(5):
        a = -math.pi / 2 + math.tau * i / 5
        P.append(sphere("gem", 0.03, (math.cos(a) * 0.19, 0.03 + math.sin(a) * 0.19, 2.0), seg=10, rings=6))
    P.append(sphere("gem", 0.038, (0, -0.175, 1.85), scale=(1, 0.6, 1), seg=12, rings=8))
    return build_item("crown-gold", P)


def build_ribbon():
    P = [torus("tint", 0.435, 0.03, (0, 0.03, 1.43), rot=(math.pi / 2, 0, 0), arc=(0.15, math.pi - 0.15), seg=28, ring=8)]
    bow = Vector((0.24, -0.06, 1.78))
    for s in (-1, 1):
        P.append(cone("tint", 0.1, 0.0, 0.18, (bow.x + s * 0.09, bow.y, bow.z), rot=(0, s * math.pi / 2, 0), scale=(1, 0.5, 1), seg=12))
    P.append(sphere("tint_light", 0.05, bow, seg=12, rings=8))
    return build_item("headband-ribbon", P)


def build_tiara():
    P = [torus("tint", 0.38, 0.022, (0, 0.02, 1.7), rot=(0.15, 0, 0), arc=(math.pi + 0.5, math.tau - 0.5), seg=24, ring=6)]
    for x, h in ((-0.16, 0.07), (0.0, 0.12), (0.16, 0.07)):
        y = -math.sqrt(max(0.38**2 - x * x, 0)) + 0.02
        P.append(cone("tint", 0.035, 0.0, h, (x, y, 1.72 + h / 2), seg=8))
    P.append(sphere("gem", 0.045, (0, -0.37, 1.73), scale=(1, 0.6, 1.2), seg=12, rings=8))
    return build_item("tiara", P)


# ── 드레스 ───────────────────────────────────────────
def build_dress(kind):
    P = []
    if kind in ("basic", "flower"):
        P.append(cone("tint", 0.5, 0.19, 0.86, (0, 0, 0.55), seg=36))
        P.append(torus("tint_light", 0.27, 0.035, (0, 0, 0.74), seg=28, ring=8))  # 허리 리본 띠
        P.append(torus("tint_light", 0.17, 0.03, (0, 0, 0.97), seg=20, ring=6))  # 깃
        if kind == "flower":
            for i in range(12):
                a = math.tau * i / 12
                P.append(sphere("tint_light", 0.1, (math.cos(a) * 0.48, math.sin(a) * 0.48, 0.14), scale=(1, 1, 0.75), seg=12, rings=8))
            c = Vector((0, -0.215, 0.86))
            for i in range(5):
                a = math.tau * i / 5
                P.append(sphere("tint_light", 0.04, c + Vector((math.cos(a) * 0.045, -0.01, math.sin(a) * 0.045)), scale=(1, 0.5, 1), seg=10, rings=6))
            P.append(sphere("yellow", 0.03, c + Vector((0, -0.02, 0)), seg=10, rings=6))
    elif kind == "puffy":
        P.append(cone("tint", 0.22, 0.18, 0.34, (0, 0, 0.82), seg=28))
        P.append(sphere("tint", 0.56, (0, 0, 0.42), scale=(1, 1, 0.72), seg=36, rings=20))
        P.append(torus("tint_light", 0.5, 0.05, (0, 0, 0.25), seg=36, ring=8))  # 치마 둘레 프릴 (치마 폭이 0.5인 높이)
        P.append(torus("tint_light", 0.21, 0.035, (0, 0, 0.66), seg=24, ring=6))
        for s in (-1, 1):  # 퍼프 소매
            P.append(sphere("tint", 0.09, (s * 0.22, 0, 0.93), seg=14, rings=8))
    return build_item(f"dress-{kind}", P)


# ── 신발 ─────────────────────────────────────────────
def build_shoes(kind):
    P = []
    for s in (-1, 1):
        if kind == "flat":
            P.append(sphere("tint", 0.09, (s * 0.1, -0.035, 0.045), scale=(1, 1.45, 0.6), seg=16, rings=10))
            P.append(sphere("tint_light", 0.025, (s * 0.1, -0.15, 0.07), seg=8, rings=6))
        else:
            P.append(cone("tint", 0.085, 0.08, 0.27, (s * 0.1, 0, 0.14), seg=16))
            P.append(sphere("tint", 0.088, (s * 0.1, -0.05, 0.05), scale=(1, 1.3, 0.65), seg=16, rings=10))
            P.append(torus("tint_light", 0.083, 0.018, (s * 0.1, 0, 0.27), seg=16, ring=6))
    return build_item("shoes-flat" if kind == "flat" else "boots", P)


# ── 장신구 ───────────────────────────────────────────
def build_necklace():
    P = [torus("tint", 0.14, 0.017, (0, -0.02, 0.96), rot=(-0.4, 0, 0), seg=28, ring=6)]
    P.append(sphere("tint", 0.045, (0, -0.2, 0.885), scale=(1, 0.6, 1.1), seg=12, rings=8))
    return build_item("necklace", P)


def build_wings():
    P = []
    for s in (-1, 1):
        P.append(sphere("tint_wing", 1.0, (s * 0.27, 0.3, 0.92), scale=(0.27, 0.04, 0.3), rot=(0, s * 0.45, s * -0.3), seg=20, rings=12))
        P.append(sphere("tint_wing", 1.0, (s * 0.22, 0.28, 0.6), scale=(0.18, 0.035, 0.2), rot=(0, s * -0.5, s * 0.3), seg=16, rings=10))
    return build_item("wings", P)


def build_wand():
    P = [cone("white", 0.018, 0.018, 0.46, (0.37, -0.13, 0.72), rot=(-0.5, 0, 0), seg=10)]
    P.append(star("tint", 0.1, 0.045, 0.04, (0.37, -0.25, 0.93)))
    return build_item("wand", P)


def build_all():
    reset()
    build_base()
    for k in ("long", "pigtails", "bun"):
        build_hair(k)
    build_crown()
    build_ribbon()
    build_tiara()
    for k in ("basic", "puffy", "flower"):
        build_dress(k)
    build_shoes("flat")
    build_shoes("boots")
    build_necklace()
    build_wings()
    build_wand()
    tmp = bpy.data.collections.get(TEMP)
    if tmp:
        bpy.data.collections.remove(tmp)


# 보여 줄 옷 조합 (나머지는 숨김) — 미리보기용
def show_outfit(names):
    col = bpy.data.collections[COLLECTION]
    for o in col.objects:
        visible = o.name == "base" or o.name in names
        o.hide_set(not visible)
        o.hide_render = not visible


def export_glb(path):
    col = bpy.data.collections[COLLECTION]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    objs = list(col.objects)
    for o in objs:
        o.hide_set(False)
        o.hide_render = False
        o.select_set(True)
    with bpy.context.temp_override(selected_objects=objs, active_object=objs[0]):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_texcoords=False,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
        )
