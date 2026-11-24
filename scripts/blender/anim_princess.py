"""
공주 동작 클립 만들기 (그래픽 고도화 시범) — build_princess.py 로 "Rig" 뼈대를 만든 뒤 Blender 안에서 실행.

    ns = {}; exec(open(r"<repo>/scripts/blender/anim_princess.py", encoding="utf-8").read(), ns); ns["make_all"]()

뼈 축 약속 (build_princess.py 의 build_armature 가 맞춰 둠, 30fps):
- 팔·다리(아래로 뻗은 뼈): X 회전 음수 = 앞으로, 양수 = 뒤로
- 척추·머리(위로 뻗은 뼈): X 양수 = 앞으로 숙이기, Y = 좌우로 돌기, Z = 갸웃
- 팔 옆으로 들기: arm.L 은 Z 음수, arm.R 은 Z 양수
- 골반 위아래 이동: hips 의 location Y (뼈 방향이 위)
게임(three.js)은 클립 이름으로 찾는다: idle, walk, hop, wave.
걷기는 16프레임에 두 걸음 — 게임이 이동 속도에 맞춰 재생 속도를 바꾼다.
"""
import bpy
import math

RIG = "Rig"
FPS = 30
D = math.radians


def _rig():
    return bpy.data.objects[RIG]


def _clear(name):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    rig = _rig()
    ad = rig.animation_data or rig.animation_data_create()
    for t in list(ad.nla_tracks):
        if t.name == name:
            ad.nla_tracks.remove(t)


def make_action(name, frames, keys, cyclic=True):
    """keys: {뼈 이름: {"rot": {프레임: (x, y, z) 도}, "loc": {프레임: (x, y, z)}}}"""
    _clear(name)
    rig = _rig()
    ad = rig.animation_data
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for bone, chans in keys.items():
        pb = rig.pose.bones.get(bone)
        if pb is None:  # 이 뼈대에 없는 뼈 (동물 친구는 손·뒷머리가 없음)
            continue
        for f, deg in chans.get("rot", {}).items():
            pb.rotation_euler = tuple(D(v) for v in deg)
            pb.keyframe_insert("rotation_euler", frame=f)
        for f, loc in chans.get("loc", {}).items():
            pb.location = loc
            pb.keyframe_insert("location", frame=f)
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    act.frame_range = (0, frames)
    try:
        act.use_frame_range = True
        act.use_cyclic = cyclic
    except AttributeError:
        pass
    # 클립마다 NLA 트랙에 넣어 두면 glTF 로 모두 나간다
    track = ad.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
    ad.action = None
    return act


def cycle(pairs, period):
    """[(프레임, 값)] 에 마지막 프레임(=처음 값)을 붙여 끊김 없이 반복"""
    out = dict(pairs)
    out[period] = pairs[0][1]
    return out


def make_idle():
    """가만히: 숨쉬기(척추) + 천천히 두리번 + 팔 살랑"""
    P = 60
    return make_action("idle", P, {
        "spine": {"rot": cycle([(0, (0, 0, 0)), (30, (2.5, 0, 0))], P)},
        "head": {"rot": cycle([(0, (0, 0, 0)), (20, (-2, 6, 2)), (40, (1, -5, -2))], P)},
        "arm.L": {"rot": cycle([(0, (0, 0, -4)), (30, (2, 0, -7))], P)},
        "arm.R": {"rot": cycle([(0, (0, 0, 4)), (30, (2, 0, 7))], P)},
        "hips": {"loc": cycle([(0, (0, 0, 0)), (30, (0, -0.006, 0))], P)},
        "hair_back": {"rot": cycle([(0, (0, 0, 0)), (30, (3, 0, 0))], P)},
        "skirt": {"rot": cycle([(0, (0, 0, 0)), (30, (0, 0, 1.5))], P)},
    })


def make_walk():
    """걷기 한 주기(두 걸음): 다리 앞뒤, 팔은 반대로, 골반이 걸음마다 통통, 몸통 살짝 비틀기"""
    P = 16
    h = P // 2
    q = P // 4
    leg = 30
    arm = 24
    return make_action("walk", P, {
        "leg.L": {"rot": cycle([(0, (-leg, 0, 0)), (h, (leg, 0, 0))], P)},
        "leg.R": {"rot": cycle([(0, (leg, 0, 0)), (h, (-leg, 0, 0))], P)},
        # 발끝: 앞으로 뻗을 때 살짝 들고, 뒤로 갈 때 바닥을 밀기
        "foot.L": {"rot": cycle([(0, (-10, 0, 0)), (h, (12, 0, 0))], P)},
        "foot.R": {"rot": cycle([(0, (12, 0, 0)), (h, (-10, 0, 0))], P)},
        "arm.L": {"rot": cycle([(0, (arm, 0, -9)), (h, (-arm, 0, -9))], P)},
        "arm.R": {"rot": cycle([(0, (-arm, 0, 9)), (h, (arm, 0, 9))], P)},
        "hips": {
            "loc": cycle([(0, (0, 0, 0)), (q, (0, 0.035, 0)), (h, (0, 0, 0)), (h + q, (0, 0.035, 0))], P),
            "rot": cycle([(0, (0, 5, 0)), (h, (0, -5, 0))], P),
        },
        "spine": {"rot": cycle([(0, (4, -3, 0)), (h, (4, 3, 0))], P)},
        "head": {"rot": cycle([(0, (-3, 1, 0)), (q, (-1, 0, 1.5)), (h, (-3, -1, 0)), (h + q, (-1, 0, -1.5))], P)},
        "skirt": {"rot": cycle([(0, (-3, 0, 3)), (h, (-3, 0, -3))], P)},
        "hair_back": {"rot": cycle([(0, (6, 0, 0)), (q, (9, 0, 0)), (h, (6, 0, 0)), (h + q, (9, 0, 0))], P)},
    })


def make_hop():
    """폴짝: 웅크리기(준비) → 두 팔 번쩍 뛰어오르기 → 사뿐 착지(반동) → 제자리"""
    return make_action("hop", 26, {
        "hips": {"loc": {0: (0, 0, 0), 5: (0, -0.07, 0), 11: (0, 0.3, 0), 15: (0, 0.33, 0), 20: (0, -0.06, 0), 26: (0, 0, 0)}},
        "spine": {"rot": {0: (0, 0, 0), 5: (10, 0, 0), 11: (-8, 0, 0), 15: (-6, 0, 0), 20: (8, 0, 0), 26: (0, 0, 0)}},
        "head": {"rot": {0: (0, 0, 0), 5: (6, 0, 0), 11: (-10, 0, 0), 20: (4, 0, 0), 26: (0, 0, 0)}},
        "arm.L": {"rot": {0: (0, 0, 0), 5: (25, 0, -5), 11: (-10, 0, -125), 15: (-10, 0, -135), 20: (10, 0, -35), 26: (0, 0, 0)}},
        "arm.R": {"rot": {0: (0, 0, 0), 5: (25, 0, 5), 11: (-10, 0, 125), 15: (-10, 0, 135), 20: (10, 0, 35), 26: (0, 0, 0)}},
        "leg.L": {"rot": {0: (0, 0, 0), 5: (-12, 0, 0), 11: (14, 0, 0), 15: (8, 0, 0), 20: (-8, 0, 0), 26: (0, 0, 0)}},
        "leg.R": {"rot": {0: (0, 0, 0), 5: (-12, 0, 0), 11: (20, 0, 0), 15: (12, 0, 0), 20: (-8, 0, 0), 26: (0, 0, 0)}},
        "skirt": {"rot": {0: (0, 0, 0), 11: (8, 0, 0), 17: (-6, 0, 0), 22: (3, 0, 0), 26: (0, 0, 0)}},
        "hair_back": {"rot": {0: (0, 0, 0), 5: (-6, 0, 0), 11: (-14, 0, 0), 17: (16, 0, 0), 22: (-4, 0, 0), 26: (0, 0, 0)}},
    }, cyclic=False)


def make_wave():
    """손 흔들기 (인사·말 걸 때): 오른팔을 들어 세 번 흔들고 내리기, 고개 갸웃"""
    keys = {
        "arm.R": {"rot": {0: (0, 0, 0), 7: (-15, 0, 140), 12: (-15, 0, 125), 17: (-15, 0, 150), 22: (-15, 0, 125),
                          27: (-15, 0, 150), 32: (-15, 0, 135), 40: (0, 0, 0)}},
        "hand.R": {"rot": {0: (0, 0, 0), 12: (0, 0, -15), 17: (0, 0, 15), 22: (0, 0, -15), 27: (0, 0, 15), 32: (0, 0, 0)}},
        "head": {"rot": {0: (0, 0, 0), 8: (-3, 0, -7), 32: (-3, 0, -7), 40: (0, 0, 0)}},
        "spine": {"rot": {0: (0, 0, 0), 8: (-2, 0, 3), 32: (-2, 0, 3), 40: (0, 0, 0)}},
        "arm.L": {"rot": {0: (0, 0, 0), 8: (0, 0, -8), 32: (0, 0, -8), 40: (0, 0, 0)}},
    }
    return make_action("wave", 40, keys, cyclic=False)


def make_all(rig_name="Rig"):
    global RIG
    RIG = rig_name
    scene = bpy.context.scene
    scene.render.fps = FPS
    made = [make_idle(), make_walk(), make_hop(), make_wave()]
    # 보기 좋게 다시 쉬는 자세로
    rig = _rig()
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return [a.name for a in made]


def preview(name, frame):
    """클립 하나를 특정 프레임으로 보여 주기 (확인용)"""
    rig = _rig()
    ad = rig.animation_data
    for t in ad.nla_tracks:
        t.mute = True
    ad.action = bpy.data.actions[name]
    bpy.context.scene.frame_set(frame)


def stop_preview():
    rig = _rig()
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
