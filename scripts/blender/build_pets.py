"""
펫 모델 만들기 (M8-5) — 유니콘·고양이·강아지. 네 발로 걷는 작은 치비 동물.

Blender MCP로 실행:
    ns = {"__file__": r"<repo>/scripts/blender/build_pets.py"}
    exec(open(ns["__file__"], encoding="utf-8").read(), ns)
    ns["build_pets"]()
    ns["export_pets"](r"<repo>/src/assets/models")

친구 스크립트(build_friends.py)의 도형·뼈대·합치기 도구를 빌려 쓴다.
규칙 (게임 코드 src/scenes/castle/pet-glb.ts 와 약속):
- 펫 하나 = 파일 하나: src/assets/models/pet-<id>.glb. 뼈대 물체 이름 = pets.json 의 id, 몸 = <id>_body.
- 뼈: root · body(등뼈, 앞 -Y 쪽으로) · head · ear.L/R · tail · leg.FL/FR/BL/BR.
  동작 클립은 없다 — 걷기·폴짝·꼬리 흔들기는 게임 코드(pet-animator.ts)가 뼈를 직접 돌린다.
- 가볍게: 한 마리 삼각형 약 4천 개 (성 마당이 화면 한도 10만에 가까움).
- Blender 좌표: Z 위, 얼굴은 -Y. 바닥 z=0. 머리 꼭대기 약 1m (공주 키의 절반쯤).
"""
import bpy
import math
import os
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None
F = {"__file__": os.path.join(_here, "build_friends.py")}
exec(open(F["__file__"], encoding="utf-8").read(), F)
P = F["P"]

PETS = "Pets"
IDS = ("unicorn", "cat", "puppy")

P["MAT_COLORS"].update({
    # 유니콘: 하얀 몸, 파스텔 무지개 갈기, 금빛 뿔
    "p_uni_body": (1.0, 0.97, 1.0, 1.0),
    "p_uni_snout": (1.0, 0.86, 0.92, 1.0),
    "p_uni_hoof": (0.8, 0.72, 1.0, 1.0),
    "p_mane_pink": (1.0, 0.66, 0.84, 1.0),
    "p_mane_lilac": (0.76, 0.66, 1.0, 1.0),
    "p_mane_mint": (0.6, 0.92, 0.82, 1.0),
    "p_mane_yellow": (1.0, 0.9, 0.55, 1.0),
    "p_gold": (1.0, 0.82, 0.38, 1.0),
    # 고양이: 살구색 치즈 고양이, 크림 배·주둥이
    "p_cat_fur": (1.0, 0.76, 0.52, 1.0),
    "p_cat_stripe": (0.95, 0.6, 0.38, 1.0),
    "p_cream": (1.0, 0.95, 0.86, 1.0),
    "p_pink": (1.0, 0.62, 0.74, 1.0),
    # 강아지: 크림 몸, 갈색 늘어진 귀
    "p_pup_fur": (1.0, 0.93, 0.8, 1.0),
    "p_pup_ear": (0.74, 0.54, 0.4, 1.0),
    "p_dark": (0.28, 0.2, 0.2, 1.0),
    # 목걸이 (펫 공통)
    "p_collar": (1.0, 0.5, 0.68, 1.0),
})

sphere, cone, capsule, torus = P["sphere"], P["cone"], P["capsule"], P["torus"]

# 공통 몸 치수
HEAD = Vector((0, -0.2, 0.66))
HEAD_R = 0.26
LEG_Y = (-0.12, 0.2)  # 앞발, 뒷발
LEG_X = 0.11


def _collection():
    col = bpy.data.collections.get(PETS)
    if col is None:
        col = bpy.data.collections.new(PETS)
        bpy.context.scene.collection.children.link(col)
    return col


def tag(ob, bone):
    ob["bone"] = bone
    return ob


def pet_bones(ear_down=False):
    b = {
        "root": ((0, 0, 0), (0, 0, 0.1), None),
        "body": ((0, 0.24, 0.36), (0, -0.14, 0.4), "root"),
        "head": ((0, -0.16, 0.46), (0, -0.2, HEAD.z + HEAD_R), "body"),
        "tail": ((0, 0.3, 0.38), (0, 0.42, 0.62), "body"),
    }
    for s, n in ((1, "L"), (-1, "R")):
        for y, fb in zip(LEG_Y, ("F", "B")):
            b[f"leg.{fb}{n}"] = ((s * LEG_X, y, 0.3), (s * LEG_X, y, 0.02), "body")
        if ear_down:
            b[f"ear.{n}"] = ((s * 0.22, -0.17, 0.84), (s * 0.28, -0.17, 0.58), "head")
        else:
            b[f"ear.{n}"] = ((s * 0.14, -0.17, 0.84), (s * 0.17, -0.17, 1.02), "head")
    return b


def _assign(p, c):
    return p.get("bone", "body")


def _body(pieces, fur, belly, hoof=None):
    """몸통 + 네 다리 + 머리 + 얼굴. 얼굴 위 자리를 돌려주는 on() 을 돌려준다"""
    pieces.append(tag(sphere(fur, 0.22, (0, 0.05, 0.34), scale=(0.95, 1.3, 0.9), seg=26, rings=14), "body"))
    pieces.append(tag(sphere(belly, 0.15, (0, -0.1, 0.3), scale=(0.9, 0.8, 0.9), seg=16, rings=8), "body"))
    for s, n in ((1, "L"), (-1, "R")):
        for y, fb in zip(LEG_Y, ("F", "B")):
            bone = f"leg.{fb}{n}"
            pieces.append(tag(capsule(fur, 0.062, 0.14, (s * LEG_X, y, 0.15), seg=12, rings=6), bone))
            pieces.append(tag(sphere(hoof or fur, 0.072, (s * LEG_X, y - 0.02, 0.045), scale=(1, 1.2, 0.62), seg=12, rings=7), bone))
    pieces.append(tag(sphere(fur, HEAD_R, HEAD, seg=30, rings=18), "head"))
    on = F["_face"](pieces, HEAD, HEAD_R, eye_x=0.11, eye_dz=0.0, cheek_x=0.18)
    for p in pieces[-6:]:
        tag(p, "head")
    return on


def _collar(pieces, bell=True):
    pieces.append(tag(torus("p_collar", 0.15, 0.03, (0, -0.16, 0.46), rot=(0.5, 0, 0), seg=16, ring=5), "body"))
    if bell:
        pieces.append(tag(sphere("p_gold", 0.04, (0, -0.31, 0.38), seg=10, rings=6), "body"))


def _rig(name, bones):
    _collection()
    rig = F["make_rig"](name, bones)
    # make_rig 은 Friends 컬렉션에 넣는다 → Pets 로 옮김
    for c in list(rig.users_collection):
        c.objects.unlink(rig)
    _collection().objects.link(rig)
    return rig


def _join(name, pieces, rig):
    ob = F["join_skinned"](name, pieces, rig, _assign)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    _collection().objects.link(ob)
    return ob


# ── 유니콘 ──────────────────────────────────────────
def build_unicorn():
    pieces = []
    on = _body(pieces, "p_uni_body", "p_uni_body", hoof="p_uni_hoof")
    # 주둥이 (말처럼 살짝 길게) + 콧구멍
    pieces.append(tag(sphere("p_uni_snout", 0.12, on(0, -0.12, -0.04), scale=(1.15, 0.8, 0.78), seg=16, rings=8), "head"))
    for s in (-1, 1):
        pieces.append(tag(sphere("p_pink", 0.018, on(s * 0.045, -0.12, 0.05), seg=8, rings=4), "head"))
    # 뿔: 금빛 고깔 + 감긴 줄
    horn = Vector((0, -0.29, 0.97))
    pieces.append(tag(cone("p_gold", 0.065, 0.0, 0.32, horn, rot=(0.35, 0, 0), seg=12), "head"))
    for i, (r, dz) in enumerate(((0.045, -0.06), (0.03, 0.02))):
        pieces.append(tag(torus("p_gold", r, 0.01, horn + Vector((0, -math.sin(0.35) * dz, math.cos(0.35) * dz)), rot=(0.35, 0, 0), seg=12, ring=4), "head"))
    # 작은 귀
    for s in (-1, 1):
        pieces.append(tag(cone("p_uni_body", 0.06, 0.0, 0.14, (s * 0.15, -0.14, 0.93), rot=(0, s * 0.3, 0), seg=10), f"ear.{'L' if s > 0 else 'R'}"))
        pieces.append(tag(cone("p_pink", 0.035, 0.0, 0.09, (s * 0.15, -0.165, 0.92), rot=(0, s * 0.3, 0), seg=8), f"ear.{'L' if s > 0 else 'R'}"))
    # 무지개 갈기 (G4): 머리 꼭대기 앞에서 목 뒤까지 흘러내리는 가닥
    mane = ("p_mane_pink", "p_mane_lilac", "p_mane_mint", "p_mane_yellow")
    lock = P["lock"]
    for i in range(6):
        a = -0.3 + i * 0.4  # 머리 꼭대기(앞) → 뒤로
        d = Vector((0, math.sin(a), math.cos(a)))
        root = HEAD + d * (HEAD_R * 1.0)
        side = 0.03 if i % 2 else -0.03
        tip = root + Vector((side, 0.13 + 0.03 * i, -0.06 - 0.05 * i))
        bone = "head" if i < 4 else "body"
        if i >= 4:
            root = Vector((0, 0.0 + (i - 4) * 0.09, 0.56 - (i - 4) * 0.05))
            tip = root + Vector((side, 0.12, -0.14))
        pieces.append(tag(lock(mane[i % 4], root, tip + d * 0.05, 0.16, 0.1, bend=d * 0.09, curl=0.04, rings=8, seg=8, flat_dir=d), bone))
    # 앞머리 한 가닥 (이마로 살짝 내려옴)
    pieces.append(tag(lock("p_mane_pink", HEAD + Vector((0.0, -0.12, 0.2)), HEAD + Vector((0.07, -0.21, 0.08)), 0.1, 0.05, bend=(0, -0.04, 0.03), rings=7, seg=8, flat_dir=(0, -1, 0.4)), "head"))
    # 무지개 꼬리: 아래로 흘러 끝이 말림
    for i, col in enumerate(mane):
        x = (i - 1.5) * 0.03
        pieces.append(tag(lock(col, (x, 0.3, 0.46), (x * 2.2, 0.5, 0.2 + 0.03 * i), 0.09, 0.06, bend=(0, 0.08, 0.06), curl=0.04, rings=8, seg=8, flat_dir=(0, 1, 0)), "tail"))
    _collar(pieces)
    rig = _rig("unicorn", pet_bones())
    return _join("unicorn", pieces, rig)


# ── 고양이 ──────────────────────────────────────────
def build_cat():
    pieces = []
    on = _body(pieces, "p_cat_fur", "p_cream")
    # 주둥이 (볼록 두 개) + 분홍 코
    for s in (-1, 1):
        pieces.append(tag(sphere("p_cream", 0.055, on(s * 0.04, -0.1, -0.03), scale=(1, 0.7, 0.8), seg=10, rings=6), "head"))
    pieces.append(tag(sphere("p_pink", 0.025, on(0, -0.065, 0.02), scale=(1.3, 0.7, 0.9), seg=8, rings=4), "head"))
    # 뾰족 귀 (안쪽 분홍)
    for s in (-1, 1):
        side = "L" if s > 0 else "R"
        pieces.append(tag(cone("p_cat_fur", 0.09, 0.0, 0.17, (s * 0.15, -0.15, 0.93), rot=(0, s * 0.32, 0), seg=10), f"ear.{side}"))
        pieces.append(tag(cone("p_pink", 0.055, 0.0, 0.11, (s * 0.148, -0.19, 0.92), rot=(0, s * 0.32, 0), seg=8), f"ear.{side}"))
    # 볼 털: 양옆으로 톡 삐져나온 털 두 가닥씩 (G4)
    for s in (-1, 1):
        for k in range(2):
            root = HEAD + Vector((s * 0.2, -0.06, -0.06 - k * 0.05))
            tip = root + Vector((s * 0.1, 0.02, -0.03 - k * 0.02))
            pieces.append(tag(P["lock"]("p_cat_fur", root, tip, 0.06, 0.035, rings=6, seg=6, flat_dir=(0, -1, 0)), "head"))
    # 이마 줄무늬
    for x in (-0.06, 0.0, 0.06):
        pieces.append(tag(sphere("p_cat_stripe", 1.0, HEAD + Vector((x, -0.12, 0.2)), scale=(0.018, 0.02, 0.06), seg=8, rings=4), "head"))
    # 등 줄무늬
    for i in range(3):
        pieces.append(tag(sphere("p_cat_stripe", 1.0, (0, 0.0 + i * 0.12, 0.53 - i * 0.02), scale=(0.15, 0.03, 0.03), seg=10, rings=4), "body"))
    # 긴 꼬리: 위로 휘어 올라감 (끝은 진한 색)
    pts = [Vector((0, 0.3, 0.38)), Vector((0, 0.38, 0.48)), Vector((0, 0.42, 0.6)), Vector((0, 0.4, 0.72))]
    for i in range(3):
        a, b = pts[i], pts[i + 1]
        mid = (a + b) / 2
        d = (b - a).normalized()
        rot = d.to_track_quat("Z", "Y").to_euler()
        pieces.append(tag(capsule("p_cat_fur" if i < 2 else "p_cat_stripe", 0.045, (b - a).length, mid, rot=(rot.x, rot.y, rot.z), seg=10, rings=6), "tail"))
    _collar(pieces)
    rig = _rig("cat", pet_bones())
    return _join("cat", pieces, rig)


# ── 강아지 ──────────────────────────────────────────
def build_puppy():
    pieces = []
    on = _body(pieces, "p_pup_fur", "p_cream")
    # 주둥이 + 까만 코 + 혀
    pieces.append(tag(sphere("p_cream", 0.1, on(0, -0.1, -0.04), scale=(1.15, 0.75, 0.78), seg=14, rings=8), "head"))
    pieces.append(tag(sphere("p_dark", 0.035, on(0, -0.06, 0.035), scale=(1.3, 0.8, 0.9), seg=10, rings=6), "head"))
    pieces.append(tag(sphere("p_pink", 0.03, on(0, -0.16, 0.01), scale=(1, 0.6, 1.2), seg=8, rings=4), "head"))
    # 늘어진 귀
    for s in (-1, 1):
        side = "L" if s > 0 else "R"
        pieces.append(tag(sphere("p_pup_ear", 1.0, (s * 0.26, -0.15, 0.6), scale=(0.06, 0.11, 0.17), rot=(0, s * 0.2, 0), seg=12, rings=8), f"ear.{side}"))
    # 한쪽 눈 둘레 얼룩 + 등 얼룩
    pieces.append(tag(sphere("p_pup_ear", 0.09, HEAD + Vector((-0.12, -0.17, 0.08)), scale=(1, 0.5, 1), seg=12, rings=6), "head"))
    pieces.append(tag(sphere("p_pup_ear", 0.13, (0.05, 0.12, 0.47), scale=(1.1, 1.2, 0.5), seg=12, rings=6), "body"))
    # 짧은 꼬리 (위로 쫑긋)
    pieces.append(tag(capsule("p_pup_fur", 0.045, 0.14, (0, 0.36, 0.48), rot=(-0.6, 0, 0), seg=10, rings=6), "tail"))
    _collar(pieces)
    rig = _rig("puppy", pet_bones(ear_down=True))
    return _join("puppy", pieces, rig)


def build_pets():
    col = bpy.data.collections.get(PETS)
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
    for name, fn in (("unicorn", build_unicorn), ("cat", build_cat), ("puppy", build_puppy)):
        out[name] = fn()
    tmp = bpy.data.collections.get(P["TEMP"])
    if tmp:
        bpy.data.collections.remove(tmp)
    fr = bpy.data.collections.get(F["FRIENDS"])
    if fr and not fr.objects:
        bpy.data.collections.remove(fr)
    # 나란히 세워 보기 (뼈대를 옮김)
    for i, name in enumerate(IDS):
        bpy.data.objects[name].location.x = (i - 1) * 0.9
    return out


def export_pets(folder):
    sizes = {}
    for pid in IDS:
        rig = bpy.data.objects[pid]
        body = bpy.data.objects[pid + "_body"]
        saved = rig.location.copy()
        rig.location = (0, 0, 0)
        for o in bpy.context.scene.objects:
            o.select_set(False)
        objs = [rig, body]
        for o in objs:
            o.hide_set(False)
            o.select_set(True)
        path = os.path.join(folder, f"pet-{pid}.glb")
        with bpy.context.temp_override(selected_objects=objs, active_object=rig):
            bpy.ops.export_scene.gltf(
                filepath=path,
                export_format="GLB",
                use_selection=True,
                export_apply=True,
                export_yup=True,
                export_texcoords=False,
                export_skins=True,
                export_animations=False,
                export_def_bones=False,
                export_cameras=False,
                export_lights=False,
            )
        rig.location = saved
        sizes[pid] = os.path.getsize(path)
    return sizes
