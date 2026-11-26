"""
바다 왕국 배경 — Blender 안에서(또는 명령줄 run_env.py -- sea) 실행.

    ns = {"__file__": r"<repo>/scripts/blender/build_sea_env.py"}
    exec(open(ns["__file__"], encoding="utf-8").read(), ns)
    ns["build_sea"](); ns["bake_ao"](); ns["export_glb"](r"<repo>/src/assets/models/env-sea-kingdom.glb")

- 도형 도구·Kenney 소품·합치기·AO 굽기·내보내기는 build_castle_env.py 것을 그대로 쓴다.
- 위치는 src/data/sea-kingdom.json 과 같다 (게임 (x, z) = Blender (x, -y)). 충돌은 JSON 이 맡는다.
- 북쪽(게임 z < -6.5)은 바다: 큰 물 판(water — 게임에서 일렁이는 물 셰이더) + 모래가 물 밑으로 비스듬히.
"""
import os

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None
exec(open(os.path.join(_here, "build_castle_env.py") if _here else globals()["CASTLE_SCRIPT"], encoding="utf-8").read(), globals())

COL = "SeaEnv"
TMP = "SeaEnv_tmp"
SHORE = -6.5  # 게임 z: 이보다 북쪽은 바다
# 바닷가 바위는 이끼 없이 돌만 (Kenney 바위 윗면의 풀 → 바위)
ROCKY = {"grass": "rock", "_defaultMat": "rock"}

MATS.update({
    "sand": (1.0, 0.9, 0.72, 1),
    "wetsand": (0.94, 0.82, 0.66, 1),
    "foam": (1.0, 1.0, 1.0, 1),
    "water": (0.48, 0.8, 1.0, 1),
    "umb_pink": (1.0, 0.62, 0.78, 1),
    "white": (1.0, 0.99, 0.96, 1),
    "towel": (0.62, 0.85, 1.0, 1),
    "sandcastle": (0.99, 0.84, 0.62, 1),
    "flag": (1.0, 0.45, 0.55, 1),
    "starfish": (1.0, 0.7, 0.45, 1),
})


def sea_ground(P):
    """모래사장: 바닷가(SHORE) 북쪽은 물 밑으로 비스듬히 내려가고, 남쪽 멀리는 낮은 모래 언덕"""
    size, n = 100, 40
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts:
        x, gz = v.co.x, -v.co.y
        if gz < SHORE:
            v.co.z = max(-1.2, (gz - SHORE) * 0.12) - 0.02
        else:
            d = max(abs(x) - 13, gz - 13, 0)
            t = min(1.0, d / 10)
            t = t * t * (3 - 2 * t)
            v.co.z = t * (noise.noise(Vector((x * 0.08, gz * 0.08, 4.1))) * 0.5 + 0.5) * 2.5 - 0.02
    P.append(obj_from_bm(bm, "sand", "sand"))
    # 젖은 모래 띠 (물가)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=40, y_segments=2, size=1.0)
    for v in bm.verts:
        x = v.co.x * 30
        gz = SHORE + 0.2 + v.co.y * 0.9 + math.sin(x * 0.7) * 0.15
        v.co = Vector((x, -gz, 0.004))
    P.append(obj_from_bm(bm, "wetsand", "wetsand"))


def sea_water(W, P):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=8, y_segments=8, size=1.0)
    for v in bm.verts:
        x = v.co.x * 120
        gz = SHORE + 0.15 - (v.co.y + 1) * 30  # 물가에서 북쪽으로 60m
        v.co = Vector((x, -gz, -0.06))
    W.append(obj_from_bm(bm, "water", "water", smooth=False))
    # 물가의 하얀 거품 (작은 덩어리 줄)
    for i in range(34):
        x = -16 + i * 0.97
        P.append(blob("foam", 0.32, G(x, SHORE + 0.05 + math.sin(i * 1.7) * 0.1, -0.02), scale=(1.6, 0.6, 0.12), subdiv=1, wobble=0.25, seed=i + 300))


def dock(P):
    """나무 부두: 물가에서 바다 쪽으로 (게임 x 5.2, z -6 ~ -12.6)"""
    for i in range(14):
        gz = -6.0 - i * 0.5
        P.append(box("wood", (2.2, 0.42, 0.08), G(5.2, gz, 0.12), bevel=0.02, rot=0.02 * ((i % 3) - 1)))
    for gz in (-6.4, -9.0, -11.6):
        for dx in (-1.0, 1.0):
            P.append(cyl("trunk", 0.09, 0.09, 1.1, G(5.2 + dx, gz, -0.85), seg=8))
    P.append(box("wood", (2.4, 0.2, 0.5), G(5.2, -12.8, 0.4), bevel=0.04))


def sand_castle(P, x, gz):
    P.append(box("sandcastle", (2.0, 2.0, 0.55), G(x, gz, 0.27), bevel=0.12))
    for dx, dz in ((-0.85, -0.85), (0.85, -0.85), (-0.85, 0.85), (0.85, 0.85)):
        P.append(cyl("sandcastle", 0.3, 0.27, 0.6, G(x + dx, gz + dz, 0.3), seg=14))
        P.append(cyl("sandcastle", 0.3, 0.0, 0.3, G(x + dx, gz + dz, 0.9), seg=14))
    P.append(cyl("sandcastle", 0.42, 0.38, 0.75, G(x, gz, 0.5), seg=16))
    P.append(cyl("sandcastle", 0.42, 0.0, 0.4, G(x, gz, 1.25), seg=16))
    P.append(cyl("white", 0.015, 0.015, 0.45, G(x, gz, 1.6), seg=6))
    P.append(box("flag", (0.28, 0.03, 0.17), G(x + 0.14, gz, 1.95), bevel=0.01))
    for i in range(6):  # 작은 조개 장식
        a = i * 1.05
        P.append(blob("umb_pink" if i % 2 else "starfish", 0.07, G(x + math.cos(a) * 0.98, gz + math.sin(a) * 0.98, 0.5), scale=(1, 0.5, 0.8), subdiv=1, wobble=0.1, seed=i))


def umbrella(P, x, gz):
    P.append(cyl("white", 0.04, 0.04, 2.3, G(x, gz, 0), seg=8))
    # 줄무늬 파라솔: 8조각을 분홍·하양 번갈아
    for i in range(8):
        a0 = i * math.tau / 8
        bm = bmesh.new()
        top = bm.verts.new((0, 0, 0.55))
        rim = [bm.verts.new((math.cos(a0 + k * math.tau / 32) * 1.5, math.sin(a0 + k * math.tau / 32) * 1.5, 0)) for k in range(5)]
        for k in range(4):
            bm.faces.new((top, rim[k], rim[k + 1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        P.append(obj_from_bm(bm, "umb", "umb_pink" if i % 2 == 0 else "white", smooth=False, loc=G(x, gz, 2.0)))
    P.append(blob("white", 0.07, G(x, gz, 2.6), subdiv=1, wobble=0))


def loungers(P, x, gz):
    for dx in (-0.65, 0.65):
        P.append(box("towel", (0.9, 1.8, 0.14), G(x + dx, gz, 0.3), bevel=0.05))
        P.append(box("towel", (0.9, 0.6, 0.12), G(x + dx, gz + 0.85, 0.48), bevel=0.05, rot=0))
        for ddx in (-0.35, 0.35):
            for dgz in (-0.75, 0.75):
                P.append(cyl("wood", 0.04, 0.04, 0.24, G(x + dx + ddx, gz + dgz, 0), seg=6))


def beach_decor(P):
    """불가사리·조개 (장식, 줍는 것 아님)"""
    rnd = random.Random(5)
    for i in range(14):
        x, gz = rnd.uniform(-12, 12), rnd.uniform(-5.5, 12)
        if abs(x - 3.5) < 2 and abs(gz - 2) < 2:
            continue
        if i % 3 == 0:
            for k in range(5):  # 불가사리: 다섯 팔
                a = k * math.tau / 5 + i
                P.append(blob("starfish", 0.09, G(x + math.cos(a) * 0.1, gz + math.sin(a) * 0.1, 0.03), scale=(1.6, 0.6, 0.35), subdiv=1, wobble=0.05, seed=i * 5 + k))
        else:
            P.append(blob("umb_pink" if i % 2 else "white", 0.08, G(x, gz, 0.03), scale=(1, 0.8, 0.45), subdiv=1, wobble=0.15, seed=i + 40))


def build_sea():
    reset()
    P, W = [], []
    sea_ground(P)
    sea_water(W, P)
    dock(P)
    # 바위 (sea-kingdom.json rock-*)
    kenney(P, "rock_largeB", -8.5, -3.5, rot=0.4, height=1.2, remap=ROCKY)
    kenney(P, "rock_tallB", 10, -4.4, rot=2.0, height=1.3, remap=ROCKY)
    kenney(P, "rock_largeB", -10.5, 7.5, rot=1.7, height=1.4, remap=ROCKY)
    kenney(P, "stone_largeA", -7.2, -4.6, rot=0.9, height=0.5, remap=ROCKY)
    # 야자수 (palm-*)
    palms = (("tree_palm", -6, 4), ("tree_palmBend", 7.5, 5.5), ("tree_palmTall", -11.5, 0.5), ("tree_palmDetailedShort", 11.5, 1.5), ("tree_palmBend", 2, -4.5))
    for i, (nm, x, gz) in enumerate(palms):
        kenney(P, nm, x, gz, rot=i * 1.3, height=4.2 if "Short" not in nm else 3.4)
    sand_castle(P, 3.5, 2)
    umbrella(P, -3.5, 7.5)
    loungers(P, -3.5, 9.5)
    beach_decor(P)
    # 바깥: 모래 언덕 위 야자수·바위, 바다 위 작은 섬
    rnd = random.Random(31)
    for i in range(14):
        a = rnd.uniform(-0.2, math.pi + 0.2)  # 남쪽 반원 (육지)
        r = rnd.uniform(16, 28)
        x, gz = math.cos(a) * r, math.sin(a) * r
        if gz < 0 or (gz > 12 and abs(x) < 3):
            continue
        d = max(abs(x) - 13, gz - 13, 0)
        t = min(1.0, d / 10)
        z = t * t * (3 - 2 * t) * (noise.noise(Vector((x * 0.08, gz * 0.08, 4.1))) * 0.5 + 0.5) * 2.5 - 0.1
        if i % 3 == 0:
            kenney(P, "rock_largeB", x, gz, z=z, rot=i, height=1.0, detail=0, remap=ROCKY)
        else:
            kenney(P, ("tree_palm", "tree_palmTall", "tree_palmBend")[i % 3], x, gz, z=z, rot=i * 0.7, height=rnd.uniform(3.6, 4.8), detail=0)
    for x, gz, r in ((-18, -24, 3.0), (16, -30, 2.2)):
        P.append(blob("sand", r, G(x, gz, -0.9), scale=(1.4, 1.1, 0.35), subdiv=2, wobble=0.15, seed=int(r * 10)))
        kenney(P, "tree_palmBend", x, gz, z=0.1, rot=r, height=3.8, detail=0)
    join_by_material(P, "static")
    join_by_material(W, "water")
    tmp = bpy.data.collections.get(TMP)
    if tmp:
        bpy.data.collections.remove(tmp)
