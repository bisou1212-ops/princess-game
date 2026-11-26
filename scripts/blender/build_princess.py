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
    skin, eye, shine, cheek, mouth, white, gem, yellow, leaf : 고정 색
- Blender 좌표: Z 위, 공주 얼굴은 -Y 쪽을 본다 (glTF로 내보내면 게임의 +Z 앞쪽이 됨).
- 바닥 z=0, 키 약 1.9m (게임의 치비 비율과 같음).
- 뼈대 (그래픽 고도화 시범): 모든 부위가 "Rig" 뼈대 하나를 함께 쓴다 (SkinnedMesh).
  조각마다 어느 뼈를 따라갈지 build_item 이 위치로 정하고(bone_for), 드레스·가방끈처럼
  몸통에 걸친 조각은 높이에 따라 골반·척추·치마 뼈에 부드럽게 나눠 붙인다(torso).
  동작 클립은 scripts/blender/anim_princess.py 가 만든다.
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
    "leaf": (0.52, 0.82, 0.52, 1.0),
    "brow": (0.45, 0.3, 0.28, 1.0),
    "nose": (1.0, 0.8, 0.76, 1.0),
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


def _bezier(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * (2 * (1 - t) * t) + p2 * (t * t)


def lock(mat, root, tip, width, thick, bend=(0, 0, 0), curl=0.0, seg=8, rings=9, flat_dir=None, bone=None):
    """머리카락 한 가닥 (그래픽 2차 G4): 뿌리 → 끝으로 가늘어지는 납작한 가닥, 곡선(bend)·끝 말림(curl).
    root·tip: 위치, bend: 가운데를 이만큼 밀어 휘게, curl: 끝을 바깥으로 말아 올리는 정도(m).
    flat_dir: 가닥이 납작한 방향(두께 방향). 없으면 머리 가운데에서 밖으로."""
    root, tip = Vector(root), Vector(tip)
    mid = (root + tip) / 2 + Vector(bend)
    pts = [_bezier(root, mid, tip, i / (rings - 1)) for i in range(rings)]
    if curl:
        # 끝 1/3 을 바깥(머리 가운데 반대)으로 말아 올림
        out = Vector((tip.x, tip.y, 0))
        out = out.normalized() if out.length > 1e-4 else Vector((0, -1, 0))
        for i in range(rings):
            t = i / (rings - 1)
            k = max(0.0, (t - 0.6) / 0.4)
            pts[i] = pts[i] + out * curl * k * k + Vector((0, 0, curl * 0.8 * k * k * k))
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        t = i / (rings - 1)
        fwd = (pts[min(i + 1, rings - 1)] - pts[max(i - 1, 0)]).normalized()
        n = Vector(flat_dir) if flat_dir else Vector((p.x, p.y, (p.z - 1.43) * 0.3))
        n = (n - fwd * n.dot(fwd))
        n = n.normalized() if n.length > 1e-5 else fwd.orthogonal().normalized()
        side = fwd.cross(n).normalized()
        # 뿌리는 넓고 끝은 뾰족 (가운데가 살짝 통통)
        # 끝까지 통통하다가 동글게 모이는 꽃잎 모양 (고드름처럼 뾰족하지 않게)
        k = max(0.0, 1 - t ** 1.8) ** 0.55 * (1 + 0.2 * math.sin(math.pi * t))
        if i == rings - 1:
            rows.append([bm.verts.new(p)])
            continue
        row = []
        for j in range(seg):
            a = math.tau * j / seg
            row.append(bm.verts.new(p + side * math.cos(a) * width * 0.5 * k + n * math.sin(a) * thick * 0.5 * k))
        rows.append(row)
    for i in range(rings - 2):
        r0, r1 = rows[i], rows[i + 1]
        for j in range(seg):
            bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    last, tipv = rows[-2], rows[-1][0]
    for j in range(seg):
        bm.faces.new((last[j], last[(j + 1) % seg], tipv))
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _new_obj(bm, "lock", mat)
    if bone:
        ob["bone"] = bone
    return ob


def skirt(mat, r_top, r_hem, z_top, z_hem, pleats=12, amp=0.03, seg=60, rings=8, belly=0.06):
    """주름 치마 (그래픽 2차 G4): 허리에서 밑단으로 종 모양으로 퍼지고, 아래로 갈수록 주름이 깊어진다"""
    bm = bmesh.new()
    rows = []
    for i in range(rings):
        t = i / (rings - 1)  # 0 = 허리, 1 = 밑단
        z = z_top + (z_hem - z_top) * t
        r = r_top + (r_hem - r_top) * (1 - (1 - t) ** 1.6) + belly * math.sin(t * math.pi)
        row = []
        for j in range(seg):
            a = math.tau * j / seg
            rr = r * (1 + amp / max(r, 0.1) * (t ** 1.3) * math.cos(pleats * a))
            row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z + (0.012 * t * t * math.cos(pleats * a)))))
        rows.append(row)
    for i in range(rings - 1):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    bm.faces.new(rows[0])  # 허리 막기
    bm.faces.new(list(reversed(rows[-1])))  # 밑단 막기
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _new_obj(bm, "skirt", mat)


def ruffle(mat, r, z, width=0.07, waves=24, depth=0.025, seg=96, flare=0.04):
    """밑단 물결 프릴 (그래픽 2차 G4): 위아래로 물결치는 얇은 띠"""
    bm = bmesh.new()
    rows = []
    for i in range(3):
        t = i / 2
        row = []
        for j in range(seg):
            a = math.tau * j / seg
            w = math.sin(waves * a)
            rr = r + flare * t + 0.012 * w * t
            row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z - width * t + depth * w * t)))
        rows.append(row)
    for i in range(2):
        for j in range(seg):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % seg], rows[i + 1][(j + 1) % seg], rows[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _new_obj(bm, "ruffle", mat)
    mod = ob.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.012
    mod.offset = 0
    return ob


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


# ── 뼈대 ──────────────────────────────────────────────
# 이름: (머리 위치, 꼬리 위치, 부모). .L = 공주의 왼쪽 = +X (얼굴이 -Y 를 봄)
BONES = {
    "root": ((0, 0, 0), (0, 0, 0.25), None),
    "hips": ((0, 0, 0.5), (0, 0, 0.72), "root"),
    "spine": ((0, 0, 0.72), (0, 0, 0.98), "hips"),
    "head": ((0, 0, 0.98), (0, 0, 1.8), "spine"),
    "hair_back": ((0, 0.2, 1.5), (0, 0.26, 1.12), "head"),
    "skirt": ((0, 0, 0.62), (0, 0, 0.15), "hips"),
}
for _s, _n in ((1, "L"), (-1, "R")):
    BONES[f"arm.{_n}"] = ((_s * 0.19, 0, 0.88), (_s * 0.3, -0.01, 0.64), "spine")
    BONES[f"hand.{_n}"] = ((_s * 0.3, -0.01, 0.64), (_s * 0.34, -0.01, 0.53), f"arm.{_n}")
    BONES[f"leg.{_n}"] = ((_s * 0.1, 0, 0.32), (_s * 0.1, 0, 0.07), "hips")
    BONES[f"foot.{_n}"] = ((_s * 0.1, 0, 0.07), (_s * 0.1, -0.13, 0.03), f"leg.{_n}")

RIG = "Rig"


def build_armature():
    """공통 뼈대. 뼈의 앞(-Y)·위(+Z) 방향을 고정해 두어 동작 스크립트가 같은 축을 쓰게 한다"""
    col = bpy.data.collections[COLLECTION]
    arm = bpy.data.armatures.new(RIG)
    ob = bpy.data.objects.new(RIG, arm)
    col.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (h, t, parent) in BONES.items():
        b = arm.edit_bones.new(name)
        b.head = h
        b.tail = t
        # 뼈의 X축이 늘 세상 +X 를 향하게 (위·아래·앞 어느 쪽을 향한 뼈든) → 앞뒤로 흔들기 = X축 회전
        d = (Vector(t) - Vector(h)).normalized()
        b.align_roll(Vector((1, 0, 0)).cross(d))
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "XYZ"
    return ob


def _smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def torso_weights(z):
    """몸통에 걸친 조각: 높이(z)에 따라 척추·골반·치마에 나눠 붙인다"""
    spine = _smooth(0.72, 0.88, z)
    skirt = 0.8 * _smooth(0.5, 0.1, z)
    hips = max(0.0, 1.0 - spine - skirt)
    return {"spine": spine, "hips": hips, "skirt": skirt}


def bone_for(part, c):
    """조각 하나(가운데 c)가 따라갈 뼈. 'torso' 면 꼭짓점 높이로 나눔"""
    side = "L" if c.x > 0 else "R"
    if part == "base":
        if c.z > 0.95:
            return "head"
        if c.z < 0.09:
            return f"foot.{side}"  # 발 (신발과 같은 뼈)
        if c.z < 0.4:
            return f"leg.{side}"
        if abs(c.x) > 0.28:
            return f"hand.{side}"
        if abs(c.x) > 0.13:
            return f"arm.{side}"
        return "spine"
    if part.startswith("hair"):
        return "hair_back" if (c.z < 1.3 or c.y > 0.45) else "head"
    if part in ("crown-gold", "headband-ribbon", "tiara", "flower-crown"):
        return "head"
    if part in ("shoes-flat", "boots", "slippers-bunny"):
        return f"foot.{side}"
    if part == "wand":
        return "hand.L"
    if part in ("necklace", "wings"):
        return "spine"
    return "torso"  # 드레스·하트 가방 …


def _apply_weights(ob, ranges):
    groups = {}

    def g(name):
        if name not in groups:
            groups[name] = ob.vertex_groups.new(name=name)
        return groups[name]

    co = ob.data.vertices
    for start, end, bone in ranges:
        idx = list(range(start, end))
        if bone != "torso":
            g(bone).add(idx, 1.0, "REPLACE")
            continue
        for i in idx:
            for name, w in torso_weights(co[i].co.z).items():
                if w > 1e-3:
                    g(name).add([i], w, "REPLACE")
    rig = bpy.data.objects.get(RIG)
    if rig:
        ob.parent = rig
        mod = ob.modifiers.new("Armature", "ARMATURE")
        mod.object = rig


# ── 합치기: 부위 하나 = 물체 하나 (재질 여러 개) ──────────────
# CAPTURE 가 리스트이면 합치지 않고 조각만 모은다 (친구 모델이 공주 부위를 다시 쓸 때)
CAPTURE = None


def build_item(name, pieces, collection=None):
    if CAPTURE is not None:
        for p in pieces:
            p["part"] = name  # 친구 모델이 뼈를 고를 때 쓴다
        CAPTURE.extend(pieces)
        return None
    col = bpy.data.collections.get(collection or COLLECTION)
    old = col.objects.get(name) if col else None
    if old:
        me = old.data
        bpy.data.objects.remove(old)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    bm = bmesh.new()
    mats = []
    ranges = []  # (첫 꼭짓점, 끝, 뼈)
    for p in pieces:
        mname = p["mat"]
        if mname not in mats:
            mats.append(mname)
        idx = mats.index(mname)
        ev = p.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(p.matrix_world)
        vstart = len(bm.verts)
        center = sum((v.co for v in me.vertices), Vector()) / max(1, len(me.vertices))
        start = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[start:]:
            f.material_index = idx
        ranges.append((vstart, len(bm.verts), p.get("bone") or bone_for(name, center)))
        ev.to_mesh_clear()
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(get_mat(m))
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if collection is None:
        _apply_weights(ob, ranges)
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
                data = o.data
                bpy.data.objects.remove(o)
                if data is not None and data.users == 0:
                    if isinstance(data, bpy.types.Mesh):
                        bpy.data.meshes.remove(data)
                    elif isinstance(data, bpy.types.Armature):
                        bpy.data.armatures.remove(data)
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
    # 눈썹 (살짝 웃는 아치) + 작은 코
    for s in (-1, 1):
        bx, by, bz = on_head(s * 0.15, 0.11, 0.002)
        P.append(torus("brow", 0.05, 0.009, (bx, by, bz), rot=(math.pi / 2, 0, 0), arc=(0.5, math.pi - 0.5), seg=10, ring=5))
    P.append(sphere("nose", 0.017, on_head(0, -0.075, 0.0), scale=(1.2, 0.7, 0.8), seg=10, rings=6))
    # 팔 + 손 (어깨에 둥근 이음새, 손은 엄지가 있는 벙어리장갑 모양)
    for s in (-1, 1):
        P.append(sphere("skin", 0.062, (s * 0.19, 0, 0.88), seg=14, rings=8))
        P.append(capsule("skin", 0.055, 0.26, (s * 0.25, 0, 0.76), rot=(0, s * 0.42, 0)))
        P.append(sphere("skin", 0.065, (s * 0.32, -0.01, 0.6), scale=(0.9, 0.75, 1.1), seg=14, rings=8))
        P.append(sphere("skin", 0.026, (s * 0.3, -0.06, 0.63), seg=10, rings=6))
    # 다리 + 발
    for s in (-1, 1):
        P.append(cone("skin", 0.065, 0.06, 0.26, (s * 0.1, 0, 0.15), seg=14))
        P.append(sphere("skin", 0.07, (s * 0.1, -0.03, 0.04), scale=(1, 1.35, 0.6), seg=14, rings=8))
    return build_item("base", P)


# ── 머리 ─────────────────────────────────────────────
def _on_cap(x, z, r=0.44, cy=0.01, cz=1.435, lift=0.0):
    """머리(모자 모양 머리카락) 앞면 위의 점"""
    y = -math.sqrt(max(r * r - x * x - (z - cz) ** 2, 0.0)) + cy - lift
    return Vector((x, y, z))


def bangs(P):
    """앞머리 (G4): 이마를 덮는 뾰족한 가닥 7개 — 가운데가 조금 길고 양옆은 바깥으로 휨"""
    xs = (-0.27, -0.18, -0.09, 0.0, 0.09, 0.18, 0.27)
    lens = (0.12, 0.16, 0.19, 0.16, 0.2, 0.15, 0.12)
    for i, (x, ln) in enumerate(zip(xs, lens)):
        root = _on_cap(x * 0.8, 1.76)
        tz = 1.74 - ln - 0.03
        tip = _on_cap(x * 1.05 + (0.015 if i % 2 else -0.015), tz, r=0.418, lift=0.004)
        out = Vector((x, -0.4, 0)).normalized()
        P.append(lock("tint", root, tip, 0.16, 0.045, bend=out * 0.03, flat_dir=(x, -0.42, 0.1)))


def side_locks(P, length=0.42):
    """얼굴 옆 머리 (G4): 관자놀이에서 볼 아래까지, 끝이 안쪽으로 살짝"""
    for s in (-1, 1):
        root = Vector((s * 0.36, -0.17, 1.64))
        tip = Vector((s * 0.35, -0.21, 1.64 - length))
        P.append(lock("tint", root, tip, 0.12, 0.05, bend=(s * 0.06, -0.03, 0), flat_dir=(s, -0.3, 0)))
        P.append(lock("tint", root + Vector((s * 0.02, 0.07, 0.02)), tip + Vector((s * 0.03, 0.07, 0.06)), 0.09, 0.04, bend=(s * 0.07, 0, 0), flat_dir=(s, 0, 0)))


def ahoge(P):
    """정수리에 톡 솟은 한 가닥 (G4)"""
    P.append(lock("tint", (0.02, -0.06, 1.85), (0.1, -0.2, 1.99), 0.05, 0.022, bend=(0.0, 0.06, 0.07), rings=7, seg=6))


def back_locks(P, n=7, z_root=1.5, z_tip=0.98, spread=1.25, width=0.17, curl=0.06):
    """긴 뒷머리 (G4): 뒤통수에서 부채꼴로 내려오는 굵은 가닥, 끝이 바깥으로 말림"""
    for i in range(n):
        a = -spread + 2 * spread * i / (n - 1)
        x, y = 0.37 * math.sin(a), 0.37 * math.cos(a) + 0.02
        root = Vector((x, y, z_root))
        tip = Vector((x * 1.25, y * 0.85 + 0.1, z_tip + 0.04 * ((i * 7) % 3)))
        P.append(lock("tint", root, tip, width, 0.085, bend=(x * 0.3, y * 0.35 + 0.03, 0), curl=curl, rings=10, flat_dir=(x, y, 0), bone="hair_back"))


def build_hair(kind):
    P = [hair_cap("tint", 0.435, (0, 0.01, 1.435), seg=40)]
    bangs(P)
    ahoge(P)
    if kind == "long":
        # 가닥 사이 빈틈을 채우는 뒷머리 덩어리 + 부채꼴 가닥
        P.append(sphere("tint", 1.0, (0, 0.17, 1.28), scale=(0.36, 0.2, 0.34), seg=20, rings=12))
        back_locks(P)
        side_locks(P)
    elif kind == "pigtails":
        side_locks(P, length=0.3)
        for s in (-1, 1):
            P.append(sphere("tint", 0.13, (s * 0.44, 0.06, 1.56), seg=16, rings=10))
            for k in range(3):
                dx = (k - 1) * 0.045
                P.append(lock("tint", (s * 0.47 + dx, 0.08 + abs(dx), 1.5), (s * (0.58 + dx * 1.5), 0.14, 1.06 + 0.04 * k), 0.15, 0.1, bend=(s * 0.08, 0.03, 0), curl=0.05, rings=9, flat_dir=(s, 0, 0)))
            P.append(torus("tint_light", 0.07, 0.025, (s * 0.47, 0.08, 1.46), rot=(0, 0, 0), seg=14, ring=6))
    elif kind == "bun":
        side_locks(P, length=0.3)
        P.append(sphere("tint", 0.16, (0, 0.1, 1.89), seg=20, rings=12))
        P.append(torus("tint_light", 0.12, 0.03, (0, 0.08, 1.8), rot=(0.25, 0, 0), seg=16, ring=6))
    elif kind == "short":
        # 단발: 뒤통수를 감싸는 둥근 머리 + 턱선까지 오는 옆머리 (끝이 안으로 동그랗게)
        P.append(sphere("tint", 1.0, (0, 0.1, 1.34), scale=(0.47, 0.37, 0.34), seg=28, rings=16))
        for s in (-1, 1):
            P.append(sphere("tint", 1.0, (s * 0.37, -0.12, 1.3), scale=(0.12, 0.15, 0.22), seg=16, rings=10))
            P.append(sphere("tint", 0.085, (s * 0.33, -0.17, 1.12), seg=14, rings=8))
        back_locks(P, n=5, z_root=1.42, z_tip=1.12, spread=1.1, width=0.16, curl=0.0)
    elif kind == "ponytail":
        side_locks(P, length=0.3)
        # 높이 묶은 포니테일 + 리본 끈
        P.append(sphere("tint", 0.11, (0, 0.42, 1.66), seg=16, rings=10))
        P.append(torus("tint_light", 0.08, 0.03, (0, 0.47, 1.63), rot=(math.pi / 2 - 0.5, 0, 0), seg=16, ring=6))
        for k in range(3):
            dx = (k - 1) * 0.06
            P.append(lock("tint", (dx, 0.5, 1.63), (dx * 1.6, 0.72 + abs(dx), 1.12 + 0.03 * k), 0.15, 0.09, bend=(dx, 0.14, 0.02), curl=0.05, rings=10, flat_dir=(0, 1, 0.3), bone="hair_back"))
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


def build_flower_crown():
    """꽃 화관: 초록 덩굴 고리 위에 꽃(꽃잎 = 옷 색, 가운데 노랑)이 빙 둘러 있다"""
    c = Vector((0, 0.04, 1.7))
    tilt = 0.3  # 앞이 살짝 내려오게
    R = 0.4
    P = [torus("leaf", R, 0.03, c, rot=(tilt, 0, 0), seg=32, ring=6)]
    n = 8
    for i in range(n):
        a = -math.pi / 2 + math.tau * i / n
        # 고리 위의 점 (x축으로 tilt 만큼 기울임)
        x, y = math.cos(a) * R, math.sin(a) * R
        p = c + Vector((x, y * math.cos(tilt), y * math.sin(tilt)))
        big = 0.095 if i == 0 else 0.075
        out = Vector((x, y, 0)).normalized()
        for k in range(5):
            b = math.tau * k / 5
            off = Vector((math.cos(b) * big * 0.8, 0, math.sin(b) * big * 0.8))
            # 꽃잎은 바깥(머리 밖)을 보게 고리 방향으로 돌림
            rot = Matrix.Rotation(math.atan2(out.x, -out.y), 4, "Z")
            P.append(sphere("tint", big * 0.62, p + rot @ off + out * 0.02, scale=(1, 0.5, 1), rot=(0, 0, math.atan2(out.x, -out.y)), seg=8, rings=5))
        P.append(sphere("yellow", big * 0.45, p + out * 0.035, seg=10, rings=6))
        if i % 2 == 1:
            P.append(sphere("leaf", 0.035, p + out * 0.01 + Vector((0, 0, -0.03)), scale=(1.4, 0.5, 0.7), seg=8, rings=5))
    return build_item("flower-crown", P)


# ── 드레스 ───────────────────────────────────────────
def puff_sleeves(P, mat="tint"):
    for s in (-1, 1):  # 퍼프 소매
        P.append(sphere(mat, 0.09, (s * 0.22, 0, 0.92), scale=(1, 1, 0.9), seg=14, rings=8))


def build_dress(kind):
    """드레스 (G4): 주름 치마(아래로 갈수록 깊은 주름) + 밑단 물결 프릴 + 퍼프 소매"""
    P = []
    if kind in ("basic", "flower"):
        P.append(cone("tint", 0.21, 0.19, 0.2, (0, 0, 0.88), seg=28))  # 윗옷
        P.append(skirt("tint", 0.22, 0.5, 0.8, 0.12, pleats=12, amp=0.03))
        P.append(ruffle("tint_light", 0.49, 0.14))
        P.append(torus("tint_light", 0.235, 0.035, (0, 0, 0.78), seg=28, ring=8))  # 허리 리본 띠
        P.append(torus("tint_light", 0.17, 0.03, (0, 0, 0.97), seg=20, ring=6))  # 깃
        puff_sleeves(P)
        if kind == "flower":
            for i in range(10):
                a = math.tau * i / 10
                P.append(sphere("tint_light", 0.07, (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.2), scale=(1, 1, 0.75), seg=10, rings=6))
            c = Vector((0, -0.215, 0.86))
            for i in range(5):
                a = math.tau * i / 5
                P.append(sphere("tint_light", 0.04, c + Vector((math.cos(a) * 0.045, -0.01, math.sin(a) * 0.045)), scale=(1, 0.5, 1), seg=10, rings=6))
            P.append(sphere("yellow", 0.03, c + Vector((0, -0.02, 0)), seg=10, rings=6))
    elif kind == "ribbon":
        # 주름 치마에 프릴 두 줄 + 뒤에 커다란 리본 + 가슴에 작은 리본
        P.append(cone("tint", 0.21, 0.19, 0.2, (0, 0, 0.88), seg=28))
        P.append(skirt("tint", 0.22, 0.52, 0.8, 0.12, pleats=14, amp=0.028))
        P.append(ruffle("tint_light", 0.51, 0.14, width=0.08))
        P.append(ruffle("tint_light", 0.44, 0.38, width=0.06, flare=0.03))
        P.append(torus("tint_light", 0.235, 0.035, (0, 0, 0.78), seg=28, ring=8))
        puff_sleeves(P)
        bow = Vector((0, 0.3, 0.78))
        for s in (-1, 1):
            P.append(sphere("tint_light", 1.0, (bow.x + s * 0.15, bow.y + 0.02, bow.z + 0.04), scale=(0.15, 0.06, 0.1), rot=(0, s * -0.35, 0), seg=16, rings=10))
            P.append(sphere("tint_light", 1.0, (bow.x + s * 0.07, bow.y + 0.04, bow.z - 0.2), scale=(0.05, 0.03, 0.18), rot=(0, s * 0.3, 0), seg=12, rings=8))
        P.append(sphere("tint", 0.06, bow + Vector((0, 0.02, 0)), seg=12, rings=8))
        front = Vector((0, -0.2, 0.9))
        for s in (-1, 1):
            P.append(cone("tint_light", 0.05, 0.0, 0.09, (front.x + s * 0.045, front.y, front.z), rot=(0, s * math.pi / 2, 0), scale=(1, 0.5, 1), seg=10))
        P.append(sphere("tint", 0.025, front + Vector((0, -0.01, 0)), seg=8, rings=6))
    elif kind == "puffy":
        P.append(cone("tint", 0.22, 0.18, 0.34, (0, 0, 0.82), seg=28))
        # 둥근 공 치마 + 세로 주름 (아래쪽이 깊게)
        sk = sphere("tint", 0.56, (0, 0, 0.42), scale=(1, 1, 0.72), seg=48, rings=20)
        for v in sk.data.vertices:
            a = math.atan2(v.co.y, v.co.x)
            t = max(0.0, min(1.0, 0.3 - v.co.z / 0.56))
            k = 1 + 0.055 * t * math.cos(14 * a)
            v.co.x *= k
            v.co.y *= k
        P.append(sk)
        P.append(ruffle("tint_light", 0.5, 0.27, width=0.08, waves=28))  # 치마 둘레 물결 프릴
        P.append(torus("tint_light", 0.21, 0.035, (0, 0, 0.66), seg=24, ring=6))
        puff_sleeves(P)
    return build_item(f"dress-{kind}", P)


# ── 신발 ─────────────────────────────────────────────
def build_shoes(kind):
    P = []
    for s in (-1, 1):
        if kind == "flat":
            P.append(sphere("tint", 0.09, (s * 0.1, -0.035, 0.045), scale=(1, 1.45, 0.6), seg=16, rings=10))
            P.append(sphere("tint_light", 0.025, (s * 0.1, -0.15, 0.07), seg=8, rings=6))
        elif kind == "bunny":
            # 폭신한 토끼 슬리퍼: 동그란 몸 + 귀 두 개 + 까만 눈
            P.append(sphere("tint", 0.1, (s * 0.1, -0.04, 0.05), scale=(1, 1.4, 0.65), seg=16, rings=10))
            for e in (-1, 1):
                P.append(sphere("tint_light", 1.0, (s * 0.1 + e * 0.035, -0.08, 0.13), scale=(0.022, 0.018, 0.06), rot=(0.3, e * 0.25, 0), seg=10, rings=6))
                P.append(sphere("eye", 0.011, (s * 0.1 + e * 0.03, -0.165, 0.075), seg=8, rings=5))
            P.append(sphere("cheek", 0.013, (s * 0.1, -0.18, 0.06), seg=8, rings=5))
        else:
            P.append(cone("tint", 0.085, 0.08, 0.27, (s * 0.1, 0, 0.14), seg=16))
            P.append(sphere("tint", 0.088, (s * 0.1, -0.05, 0.05), scale=(1, 1.3, 0.65), seg=16, rings=10))
            P.append(torus("tint_light", 0.083, 0.018, (s * 0.1, 0, 0.27), seg=16, ring=6))
    return build_item({"flat": "shoes-flat", "bunny": "slippers-bunny"}.get(kind, "boots"), P)


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


def build_heart_bag():
    """하트 가방: 오른쪽 어깨에서 왼쪽 허리로 끈, 왼쪽 옆구리에 하트 가방"""
    bag = Vector((-0.42, -0.12, 0.46))  # 왼손보다 아래, 치마 바깥
    P = []
    for s in (-1, 1):
        P.append(sphere("tint", 0.075, bag + Vector((s * 0.055, 0, 0.04)), scale=(1, 0.55, 1), seg=14, rings=8))
    P.append(cone("tint", 0.108, 0.0, 0.13, bag + Vector((0, 0, -0.05)), rot=(math.pi, 0, 0), scale=(1, 0.5, 1), seg=4))
    P.append(sphere("gem", 0.022, bag + Vector((0, -0.045, 0.03)), seg=8, rings=5))
    # 어깨끈: 오른쪽 어깨 → 가슴 앞(드레스 바깥) → 가방. 직선 두 토막
    pts = [Vector((0.17, -0.17, 0.98)), Vector((-0.1, -0.33, 0.74)), bag + Vector((0.02, 0, 0.1))]
    for a, b in zip(pts, pts[1:]):
        d = b - a
        P.append(cone("tint_light", 0.014, 0.014, d.length, (a + b) / 2, rot=d.to_track_quat("Z", "Y").to_euler(), seg=8))
    return build_item("heart-bag", P)


def build_all():
    reset()
    build_armature()
    build_base()
    for k in ("long", "pigtails", "bun", "short", "ponytail"):
        build_hair(k)
    build_crown()
    build_ribbon()
    build_tiara()
    build_flower_crown()
    for k in ("basic", "puffy", "flower", "ribbon"):
        build_dress(k)
    build_shoes("flat")
    build_shoes("boots")
    build_shoes("bunny")
    build_necklace()
    build_wings()
    build_wand()
    build_heart_bag()
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
    objs = sorted(col.objects, key=lambda o: o.type != "ARMATURE")  # 뼈대가 먼저
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
            export_skins=True,
            export_animations=True,
            export_animation_mode="ACTIONS",
            export_force_sampling=True,
            export_frame_step=1,
            export_def_bones=False,
            export_cameras=False,
            export_lights=False,
        )
