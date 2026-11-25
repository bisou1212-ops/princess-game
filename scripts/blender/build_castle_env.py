"""
성 마당 배경 (그래픽 고도화 시범) — Blender 안에서 실행.

    ns = {}; exec(open(r"<repo>/scripts/blender/build_castle_env.py", encoding="utf-8").read(), ns)
    ns["build_all"](); ns["bake_ao"](); ns["export_glb"](r"<repo>/src/assets/models/env-castle.glb")

- 위치는 src/data/courtyard.json 과 같다. 게임 좌표 (x, z) = Blender (x, -y). 바닥 z=0.
- 충돌·길찾기는 그대로 courtyard.json 이 맡고, 이 파일은 "보이는 모습"만 바꾼다.
- 재질은 색 하나 + 버텍스 컬러(구운 AO, 구석이 은은하게 어두움) — 텍스처 없이 가볍게.
- 정적인 것은 재질별로 하나로 합쳐 내보낸다(그리기 호출 줄이기). 물은 따로(water) — 게임에서 일렁이는 셰이더.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix, noise

COL = "CastleEnv"
TMP = "CastleEnv_tmp"

MATS = {
    "stone": (1.0, 0.95, 0.97, 1),  # 성 벽 (크림 분홍)
    "trim": (0.95, 0.86, 0.94, 1),  # 띠·테두리
    "roof": (1.0, 0.6, 0.8, 1),
    "gold": (1.0, 0.84, 0.42, 1),
    "glass": (0.62, 0.82, 1.0, 1),
    "wood": (0.86, 0.69, 0.52, 1),
    "trunk": (0.78, 0.58, 0.43, 1),
    "leaf": (0.62, 0.86, 0.58, 1),
    "leaf2": (0.5, 0.8, 0.55, 1),
    "grass": (0.72, 0.9, 0.66, 1),
    "yard": (0.99, 0.94, 0.89, 1),
    "path": (0.95, 0.87, 0.8, 1),
    "soil": (0.8, 0.64, 0.52, 1),
    "rock": (0.86, 0.83, 0.9, 1),
    "basin": (0.9, 0.95, 1.0, 1),
    "water": (0.56, 0.82, 1.0, 1),
    # (그래픽 2차 G3) Kenney CC0 소품을 파스텔로 칠할 색
    "petal_pink": (1.0, 0.62, 0.78, 1),
    "petal_lilac": (0.8, 0.68, 1.0, 1),
    "petal_yellow": (1.0, 0.88, 0.45, 1),
    "mush_red": (1.0, 0.5, 0.56, 1),
    "mush_tan": (0.98, 0.82, 0.64, 1),
    "cream": (1.0, 0.97, 0.92, 1),
}


def mat(name):
    m = bpy.data.materials.get("env_" + name)
    if m is None:
        m = bpy.data.materials.new("env_" + name)
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = MATS[name]
    bsdf.inputs["Roughness"].default_value = 0.7
    m.diffuse_color = MATS[name]
    return m


def _tmp():
    c = bpy.data.collections.get(TMP)
    if c is None:
        c = bpy.data.collections.new(TMP)
        bpy.context.scene.collection.children.link(c)
    return c


def obj_from_bm(bm, name, mname, smooth=True, loc=(0, 0, 0)):
    """도형은 원점에서 만들고 물체 위치를 옮긴다 → 나중에 돌리거나 늘려도 제자리 기준"""
    for f in bm.faces:
        f.smooth = smooth
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(mname))
    ob = bpy.data.objects.new(name, me)
    ob.location = Vector(loc)
    _tmp().objects.link(ob)
    ob["mat"] = mname
    return ob


def G(x, gz, z=0.0):
    """게임 좌표 (x, z) + 높이 → Blender 위치"""
    return Vector((x, -gz, z))


# ── 도형 ──────────────────────────────────────────────
def box(mname, size, loc, bevel=0.06, rot=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel, segments=segs, affect="EDGES", profile=0.5)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(rot, 4, "Z"), verts=bm.verts)
    return obj_from_bm(bm, "box", mname, smooth=False, loc=loc)


def cyl(mname, r_bot, r_top, h, loc, seg=24, caps=True, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r_bot, radius2=r_top, depth=h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)  # 밑면이 물체 위치
    return obj_from_bm(bm, "cyl", mname, smooth, loc=loc)


def blob(mname, r, loc, scale=(1, 1, 1), subdiv=2, wobble=0.12, seed=0):
    """울퉁불퉁 동글한 덩어리 (나뭇잎·덤불·바위)"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in bm.verts:
        n = noise.noise(v.co * 2.2 + off)
        v.co *= 1 + wobble * n
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    return obj_from_bm(bm, "blob", mname, loc=loc)


def torus(mname, R, r, loc, seg=32, ring=8):
    bm = bmesh.new()
    rows = []
    for i in range(seg):
        a = math.tau * i / seg
        c = Vector((math.cos(a), math.sin(a), 0))
        rows.append([bm.verts.new(c * (R + r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))) for b in (math.tau * j / ring for j in range(ring))])
    for i in range(seg):
        r0, r1 = rows[i], rows[(i + 1) % seg]
        for j in range(ring):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % ring], r0[(j + 1) % ring]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj_from_bm(bm, "torus", mname, loc=loc)


def disk(mname, r, loc, seg=32):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=seg, radius=r)
    return obj_from_bm(bm, "disk", mname, loc=loc)


# ── Kenney CC0 소품 (그래픽 2차 G3) ──────────────────────
# Kenney Nature Kit · Fantasy Town Kit (CC0, kenney.nl) 에서 고른 .glb → art-source/kenney/ (출처: public/assets/CREDITS.md)
# 각진 로우폴리를 게임의 말랑한 화풍에 맞게: 겹친 점 합치기 + 부드러운 면, 잎은 서브디비전으로 동글게.
# Kenney 재질 이름 → 우리 배경 재질 (색·표면 무늬·AO·재질별 합치기를 그대로 탄다)
KENNEY_MATS = {
    "leafsGreen": "leaf", "leafsDark": "leaf2", "grass": "leaf2",
    "woodBark": "trunk", "woodInner": "wood", "wood": "wood", "woodDark": "trunk",
    "dirt": "rock", "stone": "rock", "_defaultMat": "cream", "colormap": "hedge",
    "colorRed": "petal_pink", "colorPurple": "petal_lilac", "colorYellow": "petal_yellow", "colorTan": "mush_tan",
}
# 동글게 다듬을 Kenney 재질 (서브디비전 단계) — 나무 잎만. 꽃줄기·풀은 그대로 (삼각형 16배가 되므로)
KENNEY_ROUND = {"leafsGreen": 2, "leafsDark": 2}


def kenney_dir():
    d = globals().get("KENNEY_DIR")
    if d:
        return d
    here = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
    return os.path.normpath(os.path.join(here, "..", "..", "art-source", "kenney"))


def kenney(P, name, x, gz, z=0.0, rot=0.0, scale=1.0, remap=None, round_=True, detail=2):
    """detail: 잎 서브디비전 최대 단계 (멀리 있는 나무는 1)"""
    """Kenney 모델 하나를 (x, gz) 에 놓는다. 재질마다 따로 나눠 P 에 넣는다 (밑면 = z)"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(kenney_dir(), name + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    bm_all = {}
    for o in new:
        if o.type != "MESH":
            continue
        me = o.data
        for poly_mat_i, m in enumerate(me.materials):
            src = (m.name.split(".")[0] if m else "_defaultMat")
            key = ((remap or {}).get(src, KENNEY_MATS.get(src, "cream")), KENNEY_ROUND.get(src, 0))
            bm = bm_all.setdefault(key, bmesh.new())
            tmp = bmesh.new()
            tmp.from_mesh(me)
            bmesh.ops.delete(tmp, geom=[f for f in tmp.faces if f.material_index != poly_mat_i], context="FACES")
            tmp.transform(o.matrix_world)
            me2 = bpy.data.meshes.new("_k")
            tmp.to_mesh(me2)
            tmp.free()
            bm.from_mesh(me2)
            bpy.data.meshes.remove(me2)
    for o in new:
        d = o.data
        bpy.data.objects.remove(o)
        if isinstance(d, bpy.types.Mesh) and d.users == 0:
            bpy.data.meshes.remove(d)
    # 밑면 가운데를 원점으로
    pts = [v.co.copy() for bm in bm_all.values() for v in bm.verts]
    if not pts:
        return
    min_z = min(p.z for p in pts)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    xf = Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(scale, 4) @ Matrix.Translation((-cx, -cy, -min_z))
    for (mname, lv), bm in bm_all.items():
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.transform(xf)
        ob = obj_from_bm(bm, "kenney_" + name, mname, smooth=True, loc=G(x, gz, z))
        lv = min(lv, detail) if round_ else 0
        if lv:
            mod = ob.modifiers.new("round", "SUBSURF")
            mod.levels = lv
            mod.render_levels = lv
        P.append(ob)


# 나무 종류: (파일, 원래 높이 → 이 배율이면 약 3.3m)
KENNEY_TREES = [("tree_oak", 2.7), ("tree_default", 2.0), ("tree_fat", 2.8), ("tree_tall", 1.9), ("tree_simple", 2.1)]
FLOWERS = ["flower_redA", "flower_redB", "flower_purpleA", "flower_purpleB", "flower_yellowA", "flower_yellowB"]


def k_tree(P, x, gz, kind=0, size=1.0, z=0.0, seed=0, detail=2):
    name, sc = KENNEY_TREES[kind % len(KENNEY_TREES)]
    kenney(P, name, x, gz, z=z, rot=random.Random(seed).uniform(0, math.tau), scale=sc * size, detail=detail)


def flower_clump(P, x, gz, seed=0, n=5, r=0.55, z=0.0):
    """작은 꽃 무더기 (Kenney 꽃, 파스텔 색)"""
    rnd = random.Random(seed)
    for i in range(n):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, r)
        kenney(P, rnd.choice(FLOWERS), x + math.cos(a) * d, gz + math.sin(a) * d, z=z, rot=rnd.uniform(0, math.tau), scale=rnd.uniform(2.1, 2.7))


# ── 부품 ──────────────────────────────────────────────
def battlements(P, x0, x1, gz, top, depth, along="x", size=0.55, gap=0.45):
    """성가퀴(凸凸): 벽 위에 일정한 간격의 네모 돌"""
    length = abs(x1 - x0)
    n = max(1, int((length + gap) // (size + gap)))
    span = n * size + (n - 1) * gap
    start = min(x0, x1) + (length - span) / 2 + size / 2
    for i in range(n):
        c = start + i * (size + gap)
        if along == "x":
            P.append(box("stone", (size, depth, 0.45), G(c, gz, top + 0.225), bevel=0.05, segs=1))
        else:
            P.append(box("stone", (depth, size, 0.45), G(gz, c, top + 0.225), bevel=0.05, segs=1))


def arched_window(P, x, gz, z, w=0.7, h=1.1, face=1, depth_axis="y"):
    """둥근 아치 창문: 유리 + 금테 (face=1 이면 앞(-gz 쪽 벽의 앞면 = 게임 +z))"""
    y = -gz - 0.02 * face
    glass = box("glass", (w, 0.06, h), (x, y, z), bevel=0.02)
    top = cyl("glass", w / 2, w / 2, 0.06, (x, y + 0.03, z + h / 2), seg=16)
    top.rotation_euler = (math.pi / 2, 0, 0)
    frame = torus("gold", w / 2 + 0.03, 0.035, (x, y - 0.04 * face, z + h / 2), seg=20, ring=6)
    frame.rotation_euler = (math.pi / 2, 0, 0)
    sill = box("trim", (w + 0.2, 0.18, 0.08), (x, y - 0.08 * face, z - h / 2 - 0.04), bevel=0.02)
    P += [glass, top, frame, sill]


def build_keep(P):
    """본성: 몸통 + 돌 띠 + 창문 + 성가퀴 + 가운데 뾰족 지붕 + 발코니"""
    cx, cz, w, d, h = 0, -9, 10, 5, 6
    P.append(box("stone", (w, d, h), G(cx, cz, h / 2), bevel=0.12, segs=3))
    for z in (0.35, 3.2):
        P.append(box("trim", (w + 0.16, d + 0.16, 0.22), G(cx, cz, z), bevel=0.05))
    P.append(box("trim", (w + 0.3, d + 0.3, 0.3), G(cx, cz, h), bevel=0.06))
    front = cz + d / 2  # 게임 z (카메라 쪽 면)
    battlements(P, -w / 2 + 0.3, w / 2 - 0.3, front - 0.2, h + 0.15, 0.4)
    battlements(P, -w / 2 + 0.3, w / 2 - 0.3, cz - d / 2 + 0.2, h + 0.15, 0.4)
    for x in (-3.4, -1.9, 1.9, 3.4):
        arched_window(P, x, front, 4.4, w=0.7, h=1.0)
    for x in (-3.2, 3.2):
        arched_window(P, x, front, 1.7, w=0.8, h=1.1)
    # 가운데 작은 탑 + 지붕 (정면의 중심)
    P.append(box("stone", (2.6, 2.6, 2.2), G(0, cz, h + 1.1), bevel=0.1))
    roof = cyl("roof", 2.1, 0.0, 2.4, G(0, cz, h + 2.2), seg=4, smooth=False)
    roof.rotation_euler = (0, 0, math.pi / 4)
    P.append(roof)
    P.append(blob("gold", 0.16, G(0, cz, h + 4.75), subdiv=1, wobble=0))
    arched_window(P, 0, cz + 1.3, h + 1.2, w=0.6, h=0.8)
    # 문 위 발코니
    P.append(box("trim", (2.6, 0.7, 0.18), G(0, front + 0.35, 3.0), bevel=0.05))
    for i in range(7):
        P.append(cyl("trim", 0.05, 0.05, 0.5, G(-1.15 + i * 0.383, front + 0.62, 3.09), seg=8))
    P.append(box("trim", (2.6, 0.12, 0.1), G(0, front + 0.66, 3.62), bevel=0.03))
    # 문 둘레 아치 장식 (문 자체는 게임이 그림: 톡하는 문)
    arch = torus("trim", 1.0, 0.1, G(0, front + 0.06, 2.4), seg=24, ring=8)
    arch.rotation_euler = (math.pi / 2, 0, 0)
    P.append(arch)
    for s in (-1, 1):
        P.append(box("trim", (0.22, 0.2, 2.4), G(s * 1.0, front + 0.06, 1.2), bevel=0.04))


def build_tower(P, x, gz, r=1.4, h=8):
    P.append(cyl("stone", r, r * 0.94, h, G(x, gz, 0), seg=32))
    P.append(cyl("trim", r + 0.12, r + 0.12, 0.25, G(x, gz, 0), seg=32))
    P.append(cyl("trim", r + 0.08, r + 0.08, 0.2, G(x, gz, 3.6), seg=32))
    P.append(cyl("trim", r * 1.12, r * 1.12, 0.32, G(x, gz, h - 0.32), seg=32))
    # 탑 성가퀴
    n = 10
    for i in range(n):
        a = math.tau * i / n
        p = G(x + math.cos(a) * r * 1.05, gz - math.sin(a) * r * 1.05, h + 0.2)
        b = box("stone", (0.42, 0.3, 0.42), p, bevel=0.04, rot=a + math.pi / 2, segs=1)
        P.append(b)
    # 고깔 지붕 + 금 장식 + 깃발
    P.append(cyl("roof", r * 1.2, 0.0, r * 2.4, G(x, gz, h + 0.1), seg=32))
    P.append(cyl("trim", r * 1.22, r * 1.22, 0.12, G(x, gz, h + 0.05), seg=32))
    tip = h + 0.1 + r * 2.4
    P.append(blob("gold", 0.13, G(x, gz, tip + 0.05), subdiv=1, wobble=0))
    P.append(cyl("gold", 0.025, 0.025, 0.8, G(x, gz, tip), seg=6))
    flag = box("roof", (0.45, 0.03, 0.28), G(x + 0.24, gz, tip + 0.62), bevel=0.01)
    P.append(flag)
    # 창문 (앞쪽)
    for z in (2.2, 5.2):
        arched_window(P, x, gz + r * 0.97, z, w=0.55, h=0.85)


def build_walls(P):
    # 북·서·동 벽 (높이 2.5), 남쪽 낮은 담 (0.8) — courtyard.json 과 같은 자리
    P.append(box("stone", (24, 1, 2.5), G(0, -11.5, 1.25), bevel=0.08))
    P.append(box("trim", (24.2, 1.2, 0.18), G(0, -11.5, 2.5), bevel=0.04))
    battlements(P, -11.6, 11.6, -11.5, 2.55, 0.9)
    for s in (-1, 1):
        x = s * 11.5
        P.append(box("stone", (1, 24, 2.5), G(x, 0, 1.25), bevel=0.08))
        P.append(box("trim", (1.2, 24.2, 0.18), G(x, 0, 2.5), bevel=0.04))
        battlements(P, -11.6, 11.6, x, 2.55, 0.9, along="y")
        # 남쪽 낮은 담 + 둥근 갓
        sx = s * 6.75
        P.append(box("stone", (10.5, 1, 0.8), G(sx, 11.5, 0.4), bevel=0.08))
        P.append(box("trim", (10.7, 1.15, 0.14), G(sx, 11.5, 0.82), bevel=0.05))
        # 문기둥 + 금 공 (카메라 바로 앞이라 낮게 — 화면 아래를 가리지 않게)
        P.append(box("stone", (0.8, 0.8, 1.1), G(s * 1.55, 11.5, 0.55), bevel=0.08))
        P.append(box("trim", (0.95, 0.95, 0.14), G(s * 1.55, 11.5, 1.1), bevel=0.04))
        P.append(blob("gold", 0.2, G(s * 1.55, 11.5, 1.37), subdiv=2, wobble=0))
        # 모퉁이 작은 탑
        for cz in (-11.5, 11.5):
            P.append(cyl("stone", 0.95, 0.9, 3.4 if cz < 0 else 1.6, G(x, cz, 0), seg=24))
            P.append(cyl("roof", 1.15, 0.0, 1.6, G(x, cz, 3.4 if cz < 0 else 1.6), seg=24))


def build_fountain(P, W):
    x, gz = 0, 0
    P.append(cyl("basin", 1.8, 1.85, 0.5, G(x, gz, 0), seg=40))
    P.append(torus("basin", 1.78, 0.14, G(x, gz, 0.52), seg=40, ring=10))
    P.append(cyl("basin", 0.3, 0.38, 1.1, G(x, gz, 0.2), seg=20))
    P.append(cyl("basin", 0.75, 0.25, 0.28, G(x, gz, 1.2), seg=28))
    P.append(torus("basin", 0.74, 0.07, G(x, gz, 1.48), seg=28, ring=8))
    P.append(cyl("basin", 0.1, 0.14, 0.45, G(x, gz, 1.45), seg=12))
    P.append(blob("gold", 0.13, G(x, gz, 1.98), subdiv=1, wobble=0))
    W.append(disk("water", 1.68, G(x, gz, 0.44), seg=40))
    W.append(disk("water", 0.68, G(x, gz, 1.43), seg=28))


def build_tree(P, x, gz, h=3.0, seed=0, detail=2):
    rnd = random.Random(seed)
    trunk = cyl("trunk", 0.32, 0.18, h * 0.5, G(x, gz, 0), seg=10)
    P.append(trunk)
    for s in (-1, 1):  # 뿌리
        P.append(blob("trunk", 0.16, G(x + s * 0.28, gz + 0.1 * s, 0.06), scale=(1.4, 1, 0.5), subdiv=1, wobble=0.1, seed=seed + s))
    clusters = [(0, 0, h * 0.62, 1.05), (0.55, 0.2, h * 0.72, 0.72), (-0.5, -0.15, h * 0.75, 0.75), (0.1, -0.45, h * 0.86, 0.7), (0, 0.35, h * 0.95, 0.62)]
    for i, (dx, dz, z, r) in enumerate(clusters):
        P.append(blob("leaf" if i % 2 == 0 else "leaf2", r * (0.9 + 0.2 * rnd.random()), G(x + dx, gz + dz, z), subdiv=detail, wobble=0.18, seed=seed * 7 + i))


def bush(P, x, gz, r=0.5, seed=0, detail=2):
    for i in range(3):
        a = seed * 1.3 + i * 2.1
        P.append(blob("leaf2" if i == 1 else "leaf", r * (0.8 + 0.15 * i), G(x + math.cos(a) * r * 0.5, gz + math.sin(a) * r * 0.4, r * 0.55), scale=(1, 1, 0.85), subdiv=detail, wobble=0.15, seed=seed * 5 + i))


def bench(P, x, gz, along_z=True):
    sx, sz = (0.8, 2.2) if along_z else (2.2, 0.8)
    for i in range(3):
        o = (i - 1) * 0.22
        P.append(box("wood", (0.2 if along_z else sx, sz if along_z else 0.2, 0.07), G(x + (o if along_z else 0), gz + (0 if along_z else o), 0.45), bevel=0.02))
    back_x = x + (0.36 if x < 0 else -0.36)
    for i in range(2):
        P.append(box("wood", (0.07, sz, 0.14), G(back_x, gz, 0.66 + i * 0.2), bevel=0.02))
    for dz in (-0.85, 0.85):
        for dx in (-0.28, 0.28):
            P.append(box("wood", (0.09, 0.09, 0.42), G(x + dx, gz + dz, 0.21), bevel=0.02))


def lamp(P, x, gz):
    P.append(cyl("trim", 0.18, 0.14, 0.15, G(x, gz, 0), seg=12))
    P.append(cyl("gold", 0.05, 0.05, 2.1, G(x, gz, 0.1), seg=8))
    P.append(cyl("glass", 0.16, 0.2, 0.32, G(x, gz, 2.2), seg=8))
    P.append(cyl("gold", 0.26, 0.0, 0.22, G(x, gz, 2.5), seg=8))
    P.append(blob("gold", 0.05, G(x, gz, 2.75), subdiv=1, wobble=0))


def flowerbed(P, x, gz, w=2.5, d=4.0):
    P.append(box("soil", (w - 0.2, d - 0.2, 0.36), G(x, gz, 0.18), bevel=0.06))
    # 둥근 돌 테두리
    n_w, n_d = int(w / 0.42), int(d / 0.42)
    for i in range(n_w + 1):
        t = -w / 2 + i * w / n_w
        for s in (-1, 1):
            P.append(blob("rock", 0.17, G(x + t, gz + s * d / 2, 0.2), scale=(1.15, 1, 0.9), subdiv=1, wobble=0.15, seed=i * 3 + s))
    for i in range(1, n_d):
        t = -d / 2 + i * d / n_d
        for s in (-1, 1):
            P.append(blob("rock", 0.17, G(x + s * w / 2, gz + t, 0.2), scale=(1, 1.15, 0.9), subdiv=1, wobble=0.15, seed=i * 5 + s))


def path_stones(P):
    """남쪽 문 → 분수 둘레 → 성문 으로 이어지는 징검돌 길"""
    rnd = random.Random(4)
    pts = []
    for i in range(9):  # 문에서 분수 앞까지
        pts.append((rnd.uniform(-0.25, 0.25), 10.6 - i * 0.95))
    for i in range(14):  # 분수 둘레 고리
        a = math.pi / 2 + math.tau * i / 14
        pts.append((math.cos(a) * 2.6, math.sin(a) * 2.6))
    for i in range(4):  # 분수 뒤에서 성문까지
        pts.append((rnd.uniform(-0.2, 0.2), -3.2 - i * 0.85))
    for i, (x, gz) in enumerate(pts):
        r = rnd.uniform(0.36, 0.48)
        st = cyl("path", r, r * 0.95, 0.06, G(x, gz, -0.02), seg=14)
        st.scale = (1, rnd.uniform(0.75, 1), 1)
        st.rotation_euler = (0, 0, rnd.uniform(0, math.pi))
        P.append(st)


def build_ground(P):
    """마당 바닥(평평) + 성 밖 완만한 언덕. 마당 안은 높이 0 (길찾기와 같음)"""
    size, n = 90, 48
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts:
        x, gz = v.co.x, -v.co.y
        d = max(abs(x), abs(gz))
        t = max(0.0, min(1.0, (d - 13.5) / 9))
        t = t * t * (3 - 2 * t)
        hill = (noise.noise(Vector((x * 0.07, gz * 0.07, 0.3))) * 0.5 + 0.5) * 4.0 + noise.noise(Vector((x * 0.2, gz * 0.2, 1.7))) * 0.6
        road = math.exp(-((x / 2.2) ** 2)) if gz > 12 else 0.0  # 남쪽 길은 낮게
        v.co.z = t * hill * (1 - 0.8 * road) - 0.02
    P.append(obj_from_bm(bm, "ground", "grass"))
    # 마당 바닥: 촘촘한 격자 (AO 가 구석·물건 밑에만 생기게 — 큰 면 하나면 모퉁이 그늘이 마당 전체로 번짐)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=11.5)
    P.append(obj_from_bm(bm, "yard", "yard", loc=(0, 0, 0.005)))
    # 바깥 길 (남쪽 문에서 아래로)
    P.append(box("path", (2.8, 20, 0.1), G(0, 22, -0.03), bevel=0.05))


def build_outside(P):
    """성 밖: 언덕 위 나무·덤불 (멀리서 깊이감)"""
    rnd = random.Random(11)
    spots = []
    for _ in range(26):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(16, 30)
        x, gz = math.cos(a) * r, math.sin(a) * r
        if gz > 10 and abs(x) < 4:
            continue  # 길 비우기
        spots.append((x, gz))
    for i, (x, gz) in enumerate(spots):
        d = max(abs(x), abs(gz))
        t = max(0.0, min(1.0, (d - 13.5) / 9))
        t = t * t * (3 - 2 * t)
        z = t * ((noise.noise(Vector((x * 0.07, gz * 0.07, 0.3))) * 0.5 + 0.5) * 4.0) - 0.1
        if i % 3 == 0:
            bush(P, x, gz, r=0.9, seed=i, detail=1)
            for o in P[-3:]:
                o.location.z += z
        else:
            # 멀리 있는 나무는 동글게 다듬는 단계를 낮춤 (삼각형 아끼기)
            k_tree(P, x, gz, kind=i, size=rnd.uniform(1.0, 1.4), z=z, seed=i, detail=0)  # 성 밖은 성벽에 가려 멀리만 보임
        if i % 5 == 1:
            kenney(P, "stump_round" if i % 2 else "log", x + 1.6, gz + 0.8, z=z, rot=i, scale=2.4)


def build_all():
    reset()
    P, W = [], []
    build_ground(P)
    build_keep(P)
    build_tower(P, -5.5, -9)
    build_tower(P, 5.5, -9)
    build_walls(P)
    build_fountain(P, W)
    # 마당 나무 4그루 (Kenney CC0, 동글게 다듬음) + 발치의 버섯
    for i, (x, gz) in enumerate(((-8, -4), (8, -4), (-8.5, 6), (8.5, 6))):
        k_tree(P, x, gz, kind=i % 2, seed=i + 1)
        kenney(P, "mushroom_redGroup" if i % 2 == 0 else "mushroom_tanGroup", x + (0.75 if x < 0 else -0.75), gz + 0.45, rot=i, scale=2.6)
    for i, (x, gz) in enumerate(((-10.3, -8), (-10.3, -2), (10.3, -8), (10.3, -2), (-10.3, 9.6), (10.3, 9.6), (-8.5, 10.4), (8.5, 10.4), (-3.2, -10.4), (3.2, -10.4))):
        bush(P, x, gz, r=0.55, seed=i)
        # 덤불 앞(마당 쪽) 작은 꽃 무더기
        flower_clump(P, x + (0.75 if x < 0 else -0.75), gz + (0.6 if gz < 0 else -0.6), seed=i + 50, n=3, r=0.3)
    flowerbed(P, -5, 2)
    flowerbed(P, 5, 2)
    bench(P, -8.5, 1)
    bench(P, 8.5, 1)
    for x, gz in ((-2.4, 9.2), (2.4, 9.2), (-2.4, -5.6), (2.4, -5.6)):
        lamp(P, x, gz)
    for i, (x, gz, r) in enumerate(((-10.2, 4.2, 0.35), (10.4, -5.2, 0.3), (-6.8, -6.3, 0.28), (7.2, 9.8, 0.32))):
        kenney(P, "rock_smallA" if i % 2 == 0 else "rock_smallC", x, gz, rot=i * 1.7, scale=r * 6.5)
    path_stones(P)
    build_outside(P)
    join_by_material(P, "static")
    join_by_material(W, "water")
    tmp = bpy.data.collections.get(TMP)
    if tmp:
        bpy.data.collections.remove(tmp)


def join_by_material(pieces, prefix):
    """같은 재질끼리 한 물체로 (게임에서 재질 하나 = 그리기 한 번)"""
    col = bpy.data.collections[COL]
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    groups = {}
    for p in pieces:
        groups.setdefault(p["mat"], []).append(p)
    for mname, items in groups.items():
        bm = bmesh.new()
        for p in items:
            ev = p.evaluated_get(dg)
            me = ev.to_mesh()
            me.transform(p.matrix_world)
            bm.from_mesh(me)
            ev.to_mesh_clear()
        name = "water" if prefix == "water" and mname == "water" else f"{prefix}_{mname}"
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat(mname))
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
    for p in pieces:
        d = p.data
        bpy.data.objects.remove(p)
        if d and d.users == 0:
            bpy.data.meshes.remove(d)


def reset():
    for cname in (COL, TMP):
        c = bpy.data.collections.get(cname)
        if c:
            for o in list(c.objects):
                d = o.data
                bpy.data.objects.remove(o)
                if d is not None and d.users == 0 and isinstance(d, bpy.types.Mesh):
                    bpy.data.meshes.remove(d)
            bpy.data.collections.remove(c)
    c = bpy.data.collections.new(COL)
    bpy.context.scene.collection.children.link(c)


def bake_ao(samples=24, distance=1.2):
    """구석·맞닿은 곳이 은은하게 어두운 AO 를 버텍스 컬러(Col)로 굽는다 (모든 물체가 서로 가리는 것까지)"""
    scene = bpy.context.scene
    prev = scene.render.engine
    try:
        scene.render.engine = "CYCLES"
    except TypeError as e:
        print("Cycles 없음", e)
        return
    scene.cycles.samples = samples
    # AO 거리: 짧게 (구석·맞닿은 곳만 은은하게). 기본값(약 10m)이면 성벽이 넓은 마당 전체를 어둡게 함
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    col = bpy.data.collections[COL]
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        if "Col" not in o.data.color_attributes:
            o.data.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        o.data.color_attributes.active_color = o.data.color_attributes["Col"]
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.render.bake.target = "VERTEX_COLORS"
    bpy.ops.object.bake(type="AO")
    scene.render.engine = prev


def export_glb(path):
    col = bpy.data.collections[COL]
    objs = list(col.objects)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    with bpy.context.temp_override(selected_objects=objs, active_object=objs[0]):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_texcoords=False,
            export_normals=True,
            export_vertex_color="ACTIVE",
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_draco_mesh_compression_enable=False,
        )
