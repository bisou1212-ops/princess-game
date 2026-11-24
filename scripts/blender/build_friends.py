"""
친구 모델 만들기 (M7 B단계) — 플로라 공주·토리(토끼)·고고(곰)·도치(고슴도치).

Blender MCP로 실행:
    ns = {}
    exec(open(r"<repo>/scripts/blender/build_friends.py", encoding="utf-8").read(), ns)
    ns["build_friends"]()
    ns["export_friends"](r"<repo>/src/assets/models/friends.glb")

공주 스크립트(build_princess.py)의 도형 도구를 그대로 빌려 쓴다.
규칙 (게임 코드 src/scenes/castle/friends-glb.ts 와 약속):
- 물체 이름 = characters.json 의 id (flora, tori, gogo, dochi). 친구 하나 = 물체 하나.
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
    return _join("flora", pieces)


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
    return _join("tori", pieces)


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
    return _join("gogo", pieces)


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
    return _join("dochi", pieces)


def build_friends():
    col = bpy.data.collections.get(FRIENDS)
    if col:
        for o in list(col.objects):
            me = o.data
            bpy.data.objects.remove(o)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
    _collection()
    out = {}
    for name, fn in (("flora", build_flora), ("tori", build_tori), ("gogo", build_gogo), ("dochi", build_dochi)):
        ob = fn()
        out[name] = ob
    tmp = bpy.data.collections.get(P["TEMP"])
    if tmp:
        bpy.data.collections.remove(tmp)
    # 나란히 세워 보기 (내보낼 때는 다시 0,0 으로)
    for i, name in enumerate(("flora", "tori", "gogo", "dochi")):
        out[name].location.x = (i - 1.5) * 1.3
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
