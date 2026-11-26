"""
친구 모델 만들기 (M7 B단계) — 플로라 공주·토리(토끼)·고고(곰)·도치(고슴도치)·삐삐(새).

Blender MCP로 실행:
    ns = {}
    exec(open(r"<repo>/scripts/blender/build_friends.py", encoding="utf-8").read(), ns)
    ns["build_friends"]()
    ns["export_friends"](r"<repo>/src/assets/models/friends.glb")

공주 스크립트(build_princess.py)의 도형 도구를 그대로 빌려 쓴다.
규칙 (게임 코드 src/scenes/castle/friends-glb.ts 와 약속):
- 친구 하나 = 파일 하나: src/assets/models/friend-<id>.glb (export_all).
  뼈대 물체 이름 = characters.json 의 id, 몸 메시 = <id>_body (뼈대에 붙은 SkinnedMesh).
  뼈 이름은 공주와 같다(hips·spine·head·arm.L …) → 같은 동작 클립·움직임 코드를 쓴다.
  동물은 귀(ear.L/R)·꼬리(tail) 뼈가 더 있다 (게임에서 스프링으로 출렁임).
- 친구 색은 고정 (옷 갈아입기 없음). 재질 이름은 f_ 로 시작.
- Blender 좌표: Z 위, 얼굴은 -Y. 바닥 z=0.
"""
import bpy
import math
import os
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None
_PRINCESS = os.path.join(_here, "build_princess.py") if _here else None

P = {}  # 공주 스크립트의 도구들
exec(open(_PRINCESS or globals().get("PRINCESS_SCRIPT"), encoding="utf-8").read(), P)

FRIENDS = "Friends"

P["MAT_COLORS"].update({
    # 플로라 공주 (라벤더)
    "f_flora_hair": (0.62, 0.46, 0.86, 1.0),
    "f_flora_dress": (0.79, 0.70, 1.0, 1.0),
    "f_flora_light": (0.93, 0.89, 1.0, 1.0),
    "f_gold": (1.0, 0.84, 0.35, 1.0),
    # 토리 (크림색 토끼, 초록 앞치마)
    "f_tori_fur": (1.0, 0.95, 0.88, 1.0),
    "f_tori_inner": (1.0, 0.72, 0.8, 1.0),
    "f_apron_green": (0.6, 0.84, 0.56, 1.0),
    "f_nose_pink": (1.0, 0.55, 0.68, 1.0),
    # 고고 (갈색 곰, 초록 멜빵바지, 밀짚모자)
    "f_gogo_fur": (0.78, 0.6, 0.42, 1.0),
    "f_gogo_light": (0.93, 0.82, 0.66, 1.0),
    "f_overall": (0.5, 0.76, 0.5, 1.0),
    "f_straw": (0.98, 0.85, 0.5, 1.0),
    "f_nose_dark": (0.3, 0.22, 0.2, 1.0),
    # 도치 (베이지 고슴도치, 갈색 가시, 하얀 요리사 모자)
    "f_dochi_face": (0.96, 0.87, 0.72, 1.0),
    "f_dochi_spike": (0.6, 0.42, 0.3, 1.0),
    "f_chef_white": (1.0, 1.0, 1.0, 1.0),
    "f_strawberry": (1.0, 0.42, 0.5, 1.0),
    # 삐삐 (노란 새, 분홍 스카프)
    "f_pippi_body": (1.0, 0.89, 0.54, 1.0),
    "f_pippi_wing": (1.0, 0.8, 0.45, 1.0),
    "f_beak": (1.0, 0.64, 0.3, 1.0),
    "f_scarf": (1.0, 0.6, 0.78, 1.0),
    # 파도 (바다 왕국의 민트색 거북이, 복숭아빛 등껍질, 하얀 선원 모자)
    "f_pado_skin": (0.62, 0.88, 0.74, 1.0),
    "f_pado_shell": (1.0, 0.7, 0.52, 1.0),
    "f_pado_spot": (1.0, 0.85, 0.66, 1.0),
    "f_pado_belly": (1.0, 0.95, 0.78, 1.0),
    "f_sailor_blue": (0.45, 0.7, 1.0, 1.0),
})

sphere, cone, capsule, torus, star = P["sphere"], P["cone"], P["capsule"], P["torus"], P["star"]


def _collection():
    col = bpy.data.collections.get(FRIENDS)
    if col is None:
        col = bpy.data.collections.new(FRIENDS)
        bpy.context.scene.collection.children.link(col)
    return col


def _join(name, pieces):
    _collection()
    P["CAPTURE"] = None
    return P["build_item"](name, pieces, FRIENDS)


# ── 뼈대 ──────────────────────────────────────────────
def make_rig(name, bones):
    """친구 뼈대 (물체 이름 = 친구 id). 뼈 축 규칙은 공주와 같다 (X축 = 세상 +X)"""
    col = _collection()
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    arm = bpy.data.armatures.new(name + "_arm")
    ob = bpy.data.objects.new(name, arm)
    col.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, (h, t, parent) in bones.items():
        b = arm.edit_bones.new(bname)
        b.head = h
        b.tail = t
        d = (Vector(t) - Vector(h)).normalized()
        b.align_roll(Vector((1, 0, 0)).cross(d))
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "XYZ"
    return ob


def animal_bones(head_z, head_r, body_r, ears=None, tail=None, wings=False):
    neck = head_z - head_r * 0.8
    b = {
        "root": ((0, 0, 0), (0, 0, 0.2), None),
        "hips": ((0, 0, 0.28), (0, 0, 0.58), "root"),
        "spine": ((0, 0, 0.58), (0, 0, neck), "hips"),
        "head": ((0, 0, neck), (0, 0, head_z + head_r), "spine"),
    }
    for s_, n in ((1, "L"), (-1, "R")):
        if wings:
            b[f"arm.{n}"] = ((s_ * 0.3, 0.03, 0.8), (s_ * 0.4, 0.03, 0.42), "spine")
        else:
            b[f"arm.{n}"] = ((s_ * body_r * 0.85, 0, 0.76), (s_ * (body_r + 0.14), -0.03, 0.5), "spine")
        b[f"leg.{n}"] = ((s_ * 0.15, 0, 0.28), (s_ * 0.15, 0, 0.06), "hips")
        b[f"foot.{n}"] = ((s_ * 0.15, 0, 0.06), (s_ * 0.15, -0.16, 0.03), f"leg.{n}")
        if ears:
            base, top = ears
            b[f"ear.{n}"] = ((s_ * 0.15, 0.02, base), (s_ * 0.17, 0.02, top), "head")
    if tail:
        b["tail"] = (tail[0], tail[1], "hips")
    return b


def _smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def join_skinned(name, pieces, rig, assign):
    """조각들을 몸 메시 하나로 합치고, 조각마다 assign(조각, 가운데)이 고른 뼈에 붙인다.
    assign 이 함수(z → {뼈: 무게})를 돌려주면 꼭짓점 높이로 나눠 붙인다 (몸통)."""
    import bmesh
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    bm = bmesh.new()
    mats, ranges = [], []
    for p in pieces:
        mname = p["mat"]
        if mname not in mats:
            mats.append(mname)
        idx = mats.index(mname)
        ev = p.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(p.matrix_world)
        center = sum((v.co for v in me.vertices), Vector()) / max(1, len(me.vertices))
        v0, f0 = len(bm.verts), len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[f0:]:
            f.material_index = idx
        ranges.append((v0, len(bm.verts), assign(p, center)))
        ev.to_mesh_clear()
    me = bpy.data.meshes.new(name + "_body")
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(P["get_mat"](m))
    ob = bpy.data.objects.new(name + "_body", me)
    _collection().objects.link(ob)
    groups = {}

    def g(n):
        if n not in groups:
            groups[n] = ob.vertex_groups.new(name=n)
        return groups[n]

    co = me.vertices
    for a, b, bone in ranges:
        if callable(bone):
            for i in range(a, b):
                for n, w in bone(co[i].co.z).items():
                    if w > 1e-3:
                        g(n).add([i], w, "REPLACE")
        else:
            g(bone).add(list(range(a, b)), 1.0, "REPLACE")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    for p in pieces:
        d = p.data
        bpy.data.objects.remove(p)
        if d and d.users == 0:
            bpy.data.meshes.remove(d)
    return ob


def animal_assign(head_z, head_r, body_r, ear_from=None, tail=False):
    """동물 친구: 조각 위치로 뼈 고르기"""
    def body(z):
        sp = _smooth(0.5, 0.85, z)
        return {"spine": sp, "hips": 1 - sp}

    def assign(p, c):
        side = "L" if c.x > 0 else "R"
        if ear_from is not None and c.z > ear_from:
            return f"ear.{side}"
        if c.z > head_z - head_r * 0.9:
            return "head"
        if tail and c.y > 0.28 and c.z < 0.8:
            return "tail"
        if c.z < 0.16:
            return f"foot.{side}"
        if abs(c.x) > body_r * 0.8 and 0.3 < c.z < 1.0:
            return f"arm.{side}"
        return body
    return assign


def _capture(fn, *args, remap=None):
    """공주 부위를 만들되 합치지 않고 조각만 받아 재질 이름을 바꾼다"""
    P["CAPTURE"] = []
    fn(*args)
    pieces = P["CAPTURE"]
    P["CAPTURE"] = None
    for p in pieces:
        p["mat"] = (remap or {}).get(p["mat"], p["mat"])
    return pieces


def _face(pieces, head, r, eye_x=0.14, eye_dz=-0.01, cheek_x=0.22):
    """동물 친구 얼굴: 큰 눈 + 반짝 + 볼 (머리 중심 head, 반지름 r)"""
    def on(x, dz, lift=0.0):
        y = -math.sqrt(max(r * r - x * x - dz * dz, 0.0)) - lift
        return (x, head.y + y, head.z + dz)

    for s in (-1, 1):
        pieces.append(sphere("eye", 0.07, on(s * eye_x, eye_dz, -0.012), scale=(0.85, 0.35, 1.15), seg=18, rings=10))
        pieces.append(sphere("shine", 0.022, on(s * eye_x + 0.024, eye_dz + 0.035, 0.012), scale=(1, 0.5, 1), seg=10, rings=6))
        pieces.append(sphere("cheek", 0.055, on(s * cheek_x, eye_dz - 0.1, -0.008), scale=(1, 0.35, 0.75), seg=12, rings=8))
    return on


# ── 플로라 공주: 공주 부위를 라벤더 색으로 ─────────────────
def build_flora():
    pieces = []
    pieces += _capture(P["build_base"])
    pieces += _capture(P["build_hair"], "long", remap={"tint": "f_flora_hair", "tint_light": "f_flora_light"})
    pieces += _capture(P["build_tiara"], remap={"tint": "f_gold"})
    pieces += _capture(P["build_dress"], "puffy", remap={"tint": "f_flora_dress", "tint_light": "f_flora_light"})
    pieces += _capture(P["build_shoes"], "flat", remap={"tint": "f_flora_dress", "tint_light": "f_flora_light"})
    rig = make_rig("flora", P["BONES"])

    def assign(p, c):
        b = P["bone_for"](p.get("part", "base"), c)
        return P["torso_weights"] if b == "torso" else b
    return join_skinned("flora", pieces, rig, assign)


# ── 동물 친구 공통 몸통: 동그란 배 + 짧은 팔다리 ─────────────
def _animal_body(pieces, fur, belly, head_z, head_r, body_r=0.34):
    pieces.append(sphere(fur, body_r, (0, 0, 0.5), scale=(1, 0.95, 1.15), seg=28, rings=16))
    pieces.append(sphere(belly, body_r * 0.7, (0, -body_r * 0.55, 0.48), scale=(1, 0.5, 1.1), seg=20, rings=12))
    for s in (-1, 1):
        pieces.append(capsule(fur, 0.07, 0.16, (s * (body_r + 0.02), -0.02, 0.62), rot=(0, s * 0.6, 0)))
        pieces.append(sphere(fur, 0.1, (s * 0.15, -0.06, 0.08), scale=(1, 1.3, 0.75), seg=14, rings=8))
    pieces.append(sphere(fur, head_r, (0, 0, head_z), seg=32, rings=20))


# ── 토리: 꽃집 토끼 ───────────────────────────────────
def build_tori():
    pieces = []
    head_z, head_r = 1.22, 0.38
    _animal_body(pieces, "f_tori_fur", "f_tori_fur", head_z, head_r)
    on = _face(pieces, Vector((0, 0, head_z)), head_r)
    pieces.append(sphere("f_tori_fur", 0.1, on(0, -0.13, -0.03), scale=(1.2, 0.6, 0.8), seg=14, rings=8))  # 주둥이
    pieces.append(sphere("f_nose_pink", 0.035, on(0, -0.09, 0.015), scale=(1.2, 0.6, 0.9), seg=10, rings=6))
    for s in (-1, 1):  # 긴 귀 (안쪽 분홍)
        pieces.append(capsule("f_tori_fur", 0.09, 0.42, (s * 0.15, 0.02, head_z + 0.56), rot=(0.1, s * 0.18, 0)))
        pieces.append(sphere("f_tori_inner", 1.0, (s * 0.15 + s * 0.03, -0.085, head_z + 0.56), scale=(0.05, 0.025, 0.24), rot=(0.1, s * 0.18, 0), seg=12, rings=8))
    # 초록 앞치마 + 앞치마 주머니 꽃
    pieces.append(sphere("f_apron_green", 0.3, (0, -0.2, 0.46), scale=(0.95, 0.3, 1.0), seg=20, rings=12))
    c = Vector((0.09, -0.3, 0.42))
    for i in range(5):
        a = math.tau * i / 5
        pieces.append(sphere("f_nose_pink", 0.03, c + Vector((math.cos(a) * 0.035, 0, math.sin(a) * 0.035)), scale=(1, 0.5, 1), seg=8, rings=5))
    pieces.append(sphere("yellow", 0.022, c + Vector((0, -0.01, 0)), seg=8, rings=5))
    pieces.append(sphere("f_tori_fur", 0.1, (0, 0.33, 0.35), seg=12, rings=8))  # 꼬리
    rig = make_rig("tori", animal_bones(head_z, head_r, 0.34, ears=(head_z + 0.3, head_z + 0.85), tail=((0, 0.28, 0.38), (0, 0.42, 0.33))))
    return join_skinned("tori", pieces, rig, animal_assign(head_z, head_r, 0.34, ear_from=head_z + 0.36, tail=True))


# ── 고고: 정원사 곰 ───────────────────────────────────
def build_gogo():
    pieces = []
    head_z, head_r = 1.28, 0.42
    _animal_body(pieces, "f_gogo_fur", "f_gogo_light", head_z, head_r, body_r=0.4)
    on = _face(pieces, Vector((0, 0, head_z)), head_r, eye_x=0.15, cheek_x=0.24)
    pieces.append(sphere("f_gogo_light", 0.14, on(0, -0.13, -0.05), scale=(1.15, 0.65, 0.8), seg=16, rings=10))  # 주둥이
    pieces.append(sphere("f_nose_dark", 0.045, on(0, -0.08, 0.02), scale=(1.3, 0.7, 0.9), seg=10, rings=6))
    for s in (-1, 1):  # 동그란 귀
        pieces.append(sphere("f_gogo_fur", 0.13, (s * 0.3, 0.02, head_z + 0.3), scale=(1, 0.6, 1), seg=14, rings=8))
        pieces.append(sphere("f_gogo_light", 0.07, (s * 0.3, -0.04, head_z + 0.3), scale=(1, 0.4, 1), seg=10, rings=6))
    # 초록 멜빵바지
    pieces.append(sphere("f_overall", 0.42, (0, 0, 0.42), scale=(1.0, 0.98, 0.85), seg=28, rings=14))
    pieces.append(sphere("f_overall", 0.2, (0, -0.3, 0.76), scale=(1.1, 0.35, 0.85), seg=16, rings=10))  # 가슴판
    for s in (-1, 1):
        pieces.append(sphere("f_straw", 0.035, (s * 0.13, -0.38, 0.84), scale=(1, 0.5, 1), seg=8, rings=5))  # 단추
    # 밀짚모자
    hat_z = head_z + 0.34
    pieces.append(cone("f_straw", 0.42, 0.42, 0.04, (0, 0, hat_z), seg=32))
    pieces.append(cone("f_straw", 0.24, 0.21, 0.2, (0, 0, hat_z + 0.12), seg=24))
    pieces.append(torus("f_overall", 0.235, 0.03, (0, 0, hat_z + 0.05), seg=24, ring=6))
    rig = make_rig("gogo", animal_bones(head_z, head_r, 0.4))
    return join_skinned("gogo", pieces, rig, animal_assign(head_z, head_r, 0.4))


# ── 도치: 빵집 고슴도치 ────────────────────────────────
def build_dochi():
    pieces = []
    head_z, head_r = 1.18, 0.38
    _animal_body(pieces, "f_dochi_face", "f_dochi_face", head_z, head_r, body_r=0.33)
    on = _face(pieces, Vector((0, 0, head_z)), head_r)
    # 뾰족한 코
    pieces.append(cone("f_dochi_face", 0.11, 0.03, 0.18, on(0, -0.1, -0.06), rot=(math.pi / 2, 0, 0), seg=14))
    pieces.append(sphere("f_nose_dark", 0.04, on(0, -0.1, 0.12), seg=10, rings=6))
    # 등·머리 뒤 가시: 머리·몸의 뒤쪽 반구에 고르게 (해바라기 씨 배치), 뒤-위로 비스듬히
    def quills(center, radius, n, sz=1.0):
        golden = math.pi * (3 - math.sqrt(5))
        for i in range(n * 3):
            z = 1 - 2 * (i + 0.5) / (n * 3)
            rr = math.sqrt(1 - z * z)
            a = golden * i
            pnt = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
            if pnt.y < 0.12 or pnt.z < -0.55:  # 얼굴·배 쪽은 비움
                continue
            d = (pnt + Vector((0, 0.5, 0.35))).normalized()
            pos = center + Vector((pnt.x * radius, pnt.y * radius, pnt.z * radius * sz))
            rot = d.to_track_quat("Z", "Y").to_euler()
            pieces.append(cone("f_dochi_spike", 0.065, 0.0, 0.22, pos + d * 0.06, rot=(rot.x, rot.y, rot.z), seg=6))
    quills(Vector((0, 0, head_z)), head_r * 0.95, 30)
    quills(Vector((0, 0, 0.5)), 0.33 * 0.95, 26, sz=1.15)
    # 하얀 앞치마 + 요리사 모자
    pieces.append(sphere("f_chef_white", 0.28, (0, -0.2, 0.46), scale=(0.95, 0.3, 1.0), seg=20, rings=12))
    hat_z = head_z + 0.3
    pieces.append(cone("f_chef_white", 0.2, 0.2, 0.16, (0, 0.02, hat_z), seg=24))
    for x, y in ((-0.12, 0.0), (0.12, 0.0), (0.0, -0.08), (0.0, 0.1), (0.0, 0.01)):
        pieces.append(sphere("f_chef_white", 0.15, (x, y + 0.02, hat_z + 0.16), seg=14, rings=8))
    # 앞치마의 딸기 무늬
    pieces.append(sphere("f_strawberry", 0.045, (0.08, -0.3, 0.48), scale=(1, 0.5, 1.15), seg=10, rings=6))
    pieces.append(sphere("f_apron_green", 0.02, (0.08, -0.315, 0.535), scale=(1.4, 0.5, 0.6), seg=8, rings=5))
    rig = make_rig("dochi", animal_bones(head_z, head_r, 0.33))
    return join_skinned("dochi", pieces, rig, animal_assign(head_z, head_r, 0.33))


# ── 삐삐: 부끄럼 많은 가수 새 ───────────────────────────
def build_pippi():
    pieces = []
    head_z, head_r = 1.22, 0.36
    pieces.append(sphere("f_pippi_body", 0.36, (0, 0, 0.52), scale=(1, 0.95, 1.1), seg=28, rings=16))
    pieces.append(sphere("f_tori_fur", 0.24, (0, -0.17, 0.5), scale=(1, 0.5, 1.1), seg=20, rings=12))  # 밝은 배
    pieces.append(sphere("f_pippi_body", head_r, (0, 0, head_z), seg=32, rings=20))
    on = _face(pieces, Vector((0, 0, head_z)), head_r, eye_x=0.13, cheek_x=0.21)
    # 작은 부리 (앞으로 뾰족)
    pieces.append(cone("f_beak", 0.075, 0.0, 0.16, on(0, -0.08, 0.03), rot=(math.pi / 2, 0, 0), seg=12))
    # 머리 깃털 세 가닥
    for sx, tilt in ((-0.07, 0.35), (0.0, 0.0), (0.07, -0.35)):
        pieces.append(sphere("f_pippi_wing", 1.0, (sx, 0.02, head_z + 0.4), scale=(0.045, 0.045, 0.13), rot=(0, tilt, 0), seg=10, rings=8))
    # 날개 (몸 옆, 살짝 들림)
    for s_ in (-1, 1):
        pieces.append(sphere("f_pippi_wing", 1.0, (s_ * 0.36, 0.03, 0.6), scale=(0.08, 0.2, 0.26), rot=(0.2, s_ * -0.35, 0), seg=16, rings=10))
        pieces.append(sphere("f_beak", 0.07, (s_ * 0.13, -0.05, 0.05), scale=(1.1, 1.5, 0.5), seg=12, rings=8))  # 발
    # 꼬리 깃털
    for i, a in enumerate((-0.35, 0.0, 0.35)):
        pieces.append(sphere("f_pippi_wing", 1.0, (math.sin(a) * 0.1, 0.36, 0.42 + abs(a) * 0.1), scale=(0.05, 0.16, 0.05), rot=(-0.6, 0, a), seg=10, rings=8))
    # 분홍 스카프 + 음표 브로치
    pieces.append(torus("f_scarf", 0.2, 0.05, (0, 0, 0.88), seg=24, ring=8))
    pieces.append(sphere("f_scarf", 0.06, (0.08, -0.2, 0.84), scale=(1, 0.6, 1.3), seg=10, rings=6))
    rig = make_rig("pippi", animal_bones(head_z, head_r, 0.36, tail=((0, 0.3, 0.45), (0, 0.48, 0.42)), wings=True))
    return join_skinned("pippi", pieces, rig, animal_assign(head_z, head_r, 0.3, tail=True))


# ── 파도: 바다 왕국 거북이 ─────────────────────────────
def build_pado():
    pieces = []
    head_z, head_r = 1.2, 0.38
    body_r = 0.36
    _animal_body(pieces, "f_pado_skin", "f_pado_belly", head_z, head_r, body_r=body_r)
    on = _face(pieces, Vector((0, 0, head_z)), head_r, eye_x=0.14, cheek_x=0.22)
    # 콧구멍 두 개 (그림 입은 이 아래에 붙는다)
    for s in (-1, 1):
        pieces.append(sphere("f_nose_dark", 0.016, on(s * 0.035, -0.075, 0.004), scale=(1, 0.6, 0.8), seg=8, rings=5))
    # 등껍질: 등 뒤의 큰 반구 + 육각 무늬 점 + 테두리
    shell_c = Vector((0, 0.14, 0.55))
    pieces.append(sphere("f_pado_shell", 0.44, shell_c, scale=(1.0, 0.62, 1.05), seg=32, rings=18))
    pieces.append(torus("f_pado_spot", 0.43, 0.045, shell_c + Vector((0, -0.02, 0)), rot=(math.pi / 2, 0, 0), seg=32, ring=8))
    for i, (ax, az) in enumerate(((0, 0.2), (-0.2, 0.05), (0.2, 0.05), (0, -0.18), (-0.18, -0.15), (0.18, -0.15), (0, 0.0))):
        # 등껍질(타원체) 겉면 위에 살짝 묻히게
        k = max(0.0, 1 - (ax / 0.44) ** 2 - (az / 0.462) ** 2)
        y = 0.44 * 0.62 * math.sqrt(k) - 0.012
        pieces.append(sphere("f_pado_spot", 0.085 if i < 6 else 0.1, shell_c + Vector((ax, y, az)), scale=(1, 0.3, 1), seg=12, rings=6))
    # 짧은 꼬리
    pieces.append(cone("f_pado_skin", 0.06, 0.0, 0.14, (0, 0.36, 0.22), rot=(-1.9, 0, 0), seg=10))
    # 하얀 선원 모자 + 파란 띠
    hat_z = head_z + head_r - 0.05
    pieces.append(cone("f_chef_white", 0.21, 0.18, 0.13, (0, 0.03, hat_z + 0.06), rot=(-0.12, 0, 0.1), seg=24))
    pieces.append(torus("f_sailor_blue", 0.2, 0.03, (0, 0.03, hat_z + 0.03), rot=(-0.12, 0, 0.1), seg=24, ring=6))
    pieces.append(cone("f_chef_white", 0.27, 0.25, 0.03, (0, 0.03, hat_z), rot=(-0.12, 0, 0.1), seg=28))
    rig = make_rig("pado", animal_bones(head_z, head_r, body_r))
    return join_skinned("pado", pieces, rig, animal_assign(head_z, head_r, body_r))


def build_friends():
    col = bpy.data.collections.get(FRIENDS)
    if col:
        for o in list(col.objects):
            data = o.data
            bpy.data.objects.remove(o)
            if data is not None and data.users == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Armature):
                    bpy.data.armatures.remove(data)
    _collection()
    out = {}
    for name, fn in (("flora", build_flora), ("tori", build_tori), ("gogo", build_gogo), ("dochi", build_dochi), ("pippi", build_pippi), ("pado", build_pado)):
        ob = fn()
        out[name] = ob
    tmp = bpy.data.collections.get(P["TEMP"])
    if tmp:
        bpy.data.collections.remove(tmp)
    # 나란히 세워 보기 — 몸이 아니라 뼈대를 옮긴다 (몸만 옮기면 뼈와 어긋남). 내보낼 때는 다시 0,0 으로
    for i, name in enumerate(("flora", "tori", "gogo", "dochi", "pippi", "pado")):
        bpy.data.objects[name].location.x = (i - 2.5) * 1.3
    return out


def export_friends(path):
    col = bpy.data.collections[FRIENDS]
    objs = list(col.objects)
    saved = {o.name: o.location.copy() for o in objs}
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.location = (0, 0, 0)
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
            export_animations=False,
            export_cameras=False,
            export_lights=False,
        )
    for o in objs:
        o.location = saved[o.name]


IDS = ("flora", "tori", "gogo", "dochi", "pippi", "pado")


def export_all(folder, anim_ns):
    """친구마다 파일 하나: 그 친구의 뼈대 + 몸 + 동작 클립(idle·walk·hop·wave)"""
    col = bpy.data.collections[FRIENDS]
    sizes = {}
    for fid in IDS:
        rig = bpy.data.objects[fid]
        body = bpy.data.objects[fid + "_body"]
        saved = rig.location.copy()
        rig.location = (0, 0, 0)
        # 다른 친구의 클립이 섞이지 않게: 클립을 이 뼈대로 새로 만든다 (이름이 같으므로 앞 친구 것은 지워짐)
        for other in IDS:
            o = bpy.data.objects[other]
            if o.animation_data:
                for t in list(o.animation_data.nla_tracks):
                    o.animation_data.nla_tracks.remove(t)
        anim_ns["make_all"](fid)
        for o in bpy.context.scene.objects:
            o.select_set(False)
        objs = [rig, body]
        for o in objs:
            o.hide_set(False)
            o.select_set(True)
        path = os.path.join(folder, f"friend-{fid}.glb")
        with bpy.context.temp_override(selected_objects=objs, active_object=rig):
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
                export_def_bones=False,
                export_cameras=False,
                export_lights=False,
            )
        rig.location = saved
        sizes[fid] = os.path.getsize(path)
    return sizes
