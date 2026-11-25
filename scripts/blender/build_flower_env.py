"""
꽃 왕국 배경 (그래픽 고도화 확대 적용) — Blender 안에서 실행.

    ns = {"CASTLE_SCRIPT": r"<repo>/scripts/blender/build_castle_env.py"}
    exec(open(r"<repo>/scripts/blender/build_flower_env.py", encoding="utf-8").read(), ns)
    ns["build_flower"](); ns["bake_ao"](); ns["export_glb"](r"<repo>/src/assets/models/env-flower-kingdom.glb")

- 도형 도구·합치기·AO 굽기·내보내기는 build_castle_env.py 것을 그대로 쓴다.
- 위치는 src/data/flower-kingdom.json 과 같다 (게임 (x, z) = Blender (x, -y)). 충돌은 JSON 이 맡는다.
- 가게 문(shop-door)은 게임이 그린다(톡하는 문) — 여기서는 문 둘레 장식만.
"""
import os

_here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else None
exec(open(os.path.join(_here, "build_castle_env.py") if _here else globals()["CASTLE_SCRIPT"], encoding="utf-8").read(), globals())

COL = "FlowerEnv"
TMP = "FlowerEnv_tmp"

MATS.update({
    "grass": (0.66, 0.86, 0.59, 1),
    "meadow": (0.77, 0.92, 0.69, 1),
    "wall_pink": (1.0, 0.86, 0.92, 1),
    "wall_cream": (1.0, 0.95, 0.8, 1),
    "wall_mint": (0.88, 0.96, 0.84, 1),
    "roof_pink": (1.0, 0.56, 0.77, 1),
    "roof_orange": (1.0, 0.72, 0.36, 1),
    "roof_green": (0.5, 0.77, 0.48, 1),
    "beam": (0.8, 0.6, 0.45, 1),
    "white": (1.0, 0.99, 0.96, 1),
    "hedge": (0.55, 0.81, 0.52, 1),
    "cabbage": (0.68, 0.9, 0.55, 1),
    "red": (1.0, 0.45, 0.5, 1),
})


def gable_roof(P, mname, cx, gz, w, d, base_z, h, overhang=0.35):
    """박공지붕: 앞뒤(-gz 방향)로 비탈, 양옆은 세모 벽"""
    import bmesh as _bm
    bm = _bm.new()
    W, D = w / 2 + overhang, d / 2 + overhang
    v = [bm.verts.new(p) for p in ((-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0), (-W, 0, h), (W, 0, h))]
    bm.faces.new((v[0], v[1], v[5], v[4]))  # 앞 비탈
    bm.faces.new((v[2], v[3], v[4], v[5]))  # 뒤 비탈
    bm.faces.new((v[0], v[4], v[3]))
    bm.faces.new((v[1], v[2], v[5]))
    bm.faces.new((v[0], v[3], v[2], v[1]))
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, "roof", mname, smooth=False, loc=G(cx, gz, base_z))
    mod = ob.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.12
    P.append(ob)


def cottage(P, cx, gz, w, d, h, wall, roof, door=True, awning=None, chimney=True):
    """동화 같은 오두막: 벽 + 나무 기둥 무늬 + 둥근 창·꽃 상자 + 박공지붕 + 굴뚝 (+ 줄무늬 차양)"""
    front = gz + d / 2  # 게임 z (카메라 쪽 앞면)
    P.append(box(wall, (w, d, h), G(cx, gz, h / 2), bevel=0.08))
    P.append(box("beam", (w + 0.12, d + 0.12, 0.2), G(cx, gz, 0.1), bevel=0.04))  # 밑단
    P.append(box("beam", (w + 0.1, d + 0.1, 0.14), G(cx, gz, h - 0.07), bevel=0.03))  # 윗단
    for x in (-w / 2 + 0.08, w / 2 - 0.08):  # 모서리 기둥
        P.append(box("beam", (0.16, 0.16, h), G(cx + x, front - 0.02, h / 2), bevel=0.03))
    P.append(box("beam", (w, 0.12, 0.12), G(cx, front + 0.02, h * 0.55), bevel=0.02))  # 가로 들보
    gable_roof(P, roof, cx, gz, w, d, h - 0.02, min(w, d) * 0.8)  # 뾰족하게 — 위에서 봐도 지붕으로 보이게
    if chimney:
        P.append(box("wall_cream", (0.5, 0.5, 1.1), G(cx + w * 0.28, gz - 0.3, h + 0.7), bevel=0.05))
        P.append(box("beam", (0.62, 0.62, 0.12), G(cx + w * 0.28, gz - 0.3, h + 1.25), bevel=0.03))
    # 둥근 창 두 개 + 꽃 상자
    for s in (-1, 1):
        x = cx + s * w * 0.3
        win = cyl("glass", 0.34, 0.34, 0.08, G(x, front + 0.02, h * 0.62), seg=20)
        win.rotation_euler = (math.pi / 2, 0, 0)
        P.append(win)
        frame = torus("white", 0.36, 0.05, G(x, front + 0.08, h * 0.62), seg=24, ring=6)
        frame.rotation_euler = (math.pi / 2, 0, 0)
        P.append(frame)
        P.append(box("beam", (0.8, 0.22, 0.18), G(x, front + 0.14, h * 0.62 - 0.42), bevel=0.03))
        for i in range(4):
            col = ("red", "roof_pink", "wall_cream", "roof_orange")[i % 4]
            P.append(blob(col, 0.07, G(x - 0.27 + i * 0.18, front + 0.16, h * 0.62 - 0.28), subdiv=1, wobble=0.1, seed=i))
    if door:
        P.append(box("beam", (0.9, 0.1, 1.35), G(cx, front + 0.03, 0.68), bevel=0.03))
        P.append(blob("gold", 0.05, G(cx + 0.28, front + 0.1, 0.65), subdiv=1, wobble=0))
    else:  # 게임이 그리는 문 둘레 장식 아치
        arch = torus("white", 0.78, 0.08, G(cx, front + 0.05, 2.0), seg=24, ring=6)
        arch.rotation_euler = (math.pi / 2, 0, 0)
        P.append(arch)
    if awning:
        a, b = awning
        n = 7
        for i in range(n):
            x = cx - w * 0.45 + (i + 0.5) * (w * 0.9 / n)
            st = box(a if i % 2 == 0 else b, (w * 0.9 / n, 0.95, 0.08), G(x, front + 0.45, h * 0.84), bevel=0.01)
            st.rotation_euler = (-0.5, 0, 0)
            P.append(st)


def well(P, W, x, gz):
    P.append(cyl("rock", 1.15, 1.2, 0.85, G(x, gz, 0), seg=28))
    P.append(torus("rock", 1.12, 0.1, G(x, gz, 0.86), seg=28, ring=8))
    for s in (-1, 1):
        P.append(box("beam", (0.14, 0.14, 1.6), G(x + s * 0.95, gz, 1.6), bevel=0.03))
    gable_roof(P, "roof_pink", x, gz, 2.2, 1.2, 2.35, 0.6, overhang=0.2)
    P.append(box("beam", (2.0, 0.1, 0.1), G(x, gz, 2.05), bevel=0.02))
    P.append(cyl("beam", 0.16, 0.13, 0.25, G(x + 0.2, gz, 1.45), seg=12))  # 두레박
    W.append(disk("water", 1.0, G(x, gz, 0.6), seg=28))


def hedge_row(P, x0, gz0, x1, gz1, h=0.7, seed=0):
    """둥글둥글한 산울타리 (상자 대신)"""
    n = max(2, int(math.hypot(x1 - x0, gz1 - gz0) / 0.9))
    for i in range(n + 1):
        t = i / n
        x, gz = x0 + (x1 - x0) * t, gz0 + (gz1 - gz0) * t
        P.append(blob("hedge", 0.55, G(x, gz, h * 0.6), scale=(1, 1, h / 0.75), subdiv=1, wobble=0.14, seed=seed + i))


def garden(P, x, gz):
    """고고의 텃밭: 흙 두둑 + 양배추"""
    for r in range(2):
        z = gz + r * 1.1
        P.append(box("soil", (2.4, 0.7, 0.22), G(x, z, 0.11), bevel=0.08))
        for i in range(4):
            P.append(blob("cabbage", 0.19, G(x - 0.9 + i * 0.6, z, 0.3), scale=(1, 1, 0.8), subdiv=1, wobble=0.25, seed=r * 4 + i))


def windmill(P, x, gz, z0):
    P.append(cyl("wall_cream", 1.3, 0.9, 4.5, G(x, gz, z0), seg=16))
    P.append(cyl("roof_pink", 1.1, 0.0, 1.4, G(x, gz, z0 + 4.5), seg=16))
    hub = G(x, gz + 1.0, z0 + 3.9)
    for i in range(4):
        a = i * math.pi / 2 + 0.3
        blade = box("white", (0.4, 0.06, 2.4), hub + Vector((math.cos(a) * 1.2, 0, math.sin(a) * 1.2)), bevel=0.02)
        blade.rotation_euler = (0, -a + math.pi / 2, 0)
        P.append(blade)
    P.append(blob("beam", 0.2, hub, subdiv=1, wobble=0))


def flower_ground(P):
    size, n = 100, 48
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts:
        x, gz = v.co.x, -v.co.y
        d = max(abs(x), abs(gz))
        t = max(0.0, min(1.0, (d - 14) / 10))
        t = t * t * (3 - 2 * t)
        hill = (noise.noise(Vector((x * 0.06, gz * 0.06, 2.3))) * 0.5 + 0.5) * 5.0
        road = math.exp(-((x / 2.4) ** 2)) if gz > 12 else 0.0
        v.co.z = t * hill * (1 - 0.8 * road) - 0.02
    P.append(obj_from_bm(bm, "ground", "grass"))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=12.6)
    P.append(obj_from_bm(bm, "meadow", "meadow", loc=(0, 0, 0.005)))


def flower_paths(P):
    rnd = random.Random(8)
    pts = [(rnd.uniform(-0.3, 0.3), 12 - i * 0.95) for i in range(9)]  # 남쪽 입구 → 우물
    pts += [(-1.6 - i * 0.95, -2.6 - i * 0.62) for i in range(6)]  # 우물 → 가게
    pts += [(1.6 + i * 0.95, -2.6 - i * 0.62) for i in range(6)]  # 우물 → 빵집
    for x, gz in pts:
        r = rnd.uniform(0.34, 0.46)
        st = cyl("path", r, r * 0.95, 0.06, G(x, gz, -0.02), seg=14)
        st.scale = (1, rnd.uniform(0.75, 1), 1)
        st.rotation_euler = (0, 0, rnd.uniform(0, math.pi))
        P.append(st)


def flower_outside(P):
    rnd = random.Random(21)
    for i in range(24):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(17, 34)
        x, gz = math.cos(a) * r, math.sin(a) * r
        if gz > 12 and abs(x) < 4:
            continue
        d = max(abs(x), abs(gz))
        t = max(0.0, min(1.0, (d - 14) / 10))
        t = t * t * (3 - 2 * t)
        z = t * ((noise.noise(Vector((x * 0.06, gz * 0.06, 2.3))) * 0.5 + 0.5) * 5.0) - 0.1
        if i % 3 == 0:
            k = len(P)
            bush(P, x, gz, r=1.0, seed=i, detail=1)
            for o in P[k:]:
                o.location.z += z
        else:
            k_tree(P, x, gz, kind=i + 1, size=rnd.uniform(1.05, 1.5), z=z, seed=i + 40, detail=1 if math.hypot(x, gz) < 23 else 0)
        if i % 4 == 1:
            kenney(P, "stump_round" if i % 2 else "log", x + 1.5, gz - 0.9, z=z, rot=i, scale=2.4)
        if i % 3 == 2:
            flower_clump(P, x - 1.3, gz + 0.7, seed=i + 7, n=5, z=z)
    windmill(P, -21, -24, 2.6)


def build_flower():
    reset()
    P, W = [], []
    flower_ground(P)
    cottage(P, -7, -8, 5, 4, 2.6, "wall_pink", "roof_pink", door=False, awning=("roof_pink", "white"))  # 별사탕 가게
    cottage(P, 7, -8, 5, 4, 2.6, "wall_cream", "roof_orange", awning=("roof_orange", "white"))  # 빵집
    cottage(P, -9.5, 4, 3.5, 3, 2.2, "wall_mint", "roof_green", chimney=False)  # 정원 창고
    well(P, W, 0, -1)
    for i, (x, gz, h) in enumerate(((-11, -3, 3.0), (11, -2, 3.0), (10.5, 6, 3.4), (-3, -11, 3.0), (3, -11.5, 2.8))):
        k_tree(P, x, gz, kind=(i * 2) % 5, size=h / 3.2, seed=i + 30)
        kenney(P, "mushroom_redGroup" if i % 2 else "mushroom_tanGroup", x + (0.8 if x < 0 else -0.8), gz + 0.5, rot=i, scale=2.6)
    # 꽃 무더기: 집 앞 화단·울타리 안쪽
    for i, (x, gz) in enumerate(((-9.6, -5.4), (-4.4, -5.6), (4.4, -5.6), (9.6, -5.4), (-11.6, 1.0), (11.6, 2.4), (-7.4, 2.4), (11.4, 10.6), (-11.4, 10.8), (-4.8, 11.4), (4.8, 11.4))):
        flower_clump(P, x, gz, seed=i + 200, n=5, r=0.5)
    # 고고의 텃밭 둘레 나무 울타리 (남쪽·동쪽, 북쪽은 열어 둠)
    for i in range(3):
        kenney(P, "fence_simple", -10.7 + i * 1.2, 8.0, scale=1.2, round_=False)
    for i in range(2):
        kenney(P, "fence_simple", -7.9, 7.2 - i * 1.2, rot=math.pi / 2, scale=1.2, round_=False)
    # 산울타리 (flower-kingdom.json 의 hedge-* 자리)
    hedge_row(P, -12.6, -12.6, 12.6, -12.6, seed=1)
    hedge_row(P, -12.6, -12.2, -12.6, 12.6, seed=40)
    hedge_row(P, 12.6, -12.2, 12.6, 12.6, seed=80)
    hedge_row(P, -12.6, 12.6, -2.2, 12.6, h=0.5, seed=120)
    hedge_row(P, 2.2, 12.6, 12.6, 12.6, h=0.5, seed=160)
    garden(P, -9.5, 6.3)
    flower_paths(P)
    flower_outside(P)
    join_by_material(P, "static")
    join_by_material(W, "water")
    tmp = bpy.data.collections.get(TMP)
    if tmp:
        bpy.data.collections.remove(tmp)
