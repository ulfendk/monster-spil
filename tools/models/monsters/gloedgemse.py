"""
Glødgemse — an ember chamois: slim and red on long legs with dark hooves, a pale belly, cat
ears, a pale muzzle, two horns hooking back in gold, a white puff of a tail, embers drifting
off it. At stage 2 (Flammegemse) a flame burns between its horns. Sizes in px of the picture
box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import FEET_Z, legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["autumnRed"]
BELLY = K["oldWhite"]
HORN = K["carpYellow"]


def build():
    m = Model("gloedgemse")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -22), (11.5, 19, 10.5), k=0)
    s.round_cone(S(0, 8, -20), S(0, 13, -8), 8, 6.5, k=5)  # the neck
    s.ellipsoid(S(0, 15, -3), (11.5, 11, 10.5), k=6)  # the head
    s.ellipsoid(S(0, 24, -7), (6, 6.5, 5), k=3.5, colour=BELLY)  # the muzzle
    s.ball(S(0, 30, -5.5), 1.8, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 0, -30), (8, 16, 5), op="paint", colour=BELLY, k=2.5)
    s.ellipsoid(S(0, 12, -19), (6, 5, 8), op="paint", colour=BELLY, k=2)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 8, 12, 4)
        up = S(side * 0.55, 0, 1).normalized()
        out = S(side * 0.3, 1, 0).normalized()
        F = frame(up.cross(out).normalized() * -side, up, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-4.5, 0), (4.5, 0), (0, 10)], 3, rounding=1.2)
        e.slab(base + out * 1.1, F, [(-2.6, 1), (2.6, 1), (0, 7)], 1.5, rounding=0.5, colour=K["sakuraPink"])
        m.part(e, f"ear_{lr}", body_pivot, voxel=0.3, budget=300, stage_shade=True)
        root = S(side * 4, 10, 6)
        horn = m.pivot(f"horn_{lr}", root * PX, body_pivot)
        horn["stageScale"] = 0.25
        h = Sculpt(HORN)
        h.chain([root, S(side * 5, 8, 15), S(side * 6, 2, 20), S(side * 6.5, -4, 18)], [2.6, 2.1, 1.4, 0.5], k=0.6)
        m.part(h, f"horn_{lr}_mesh", horn, voxel=0.3, budget=400)

    legs4(m, BODY, ((-6.5, 8), (6.5, 8), (6.5, -16), (-6.5, -16)), -26, radius=3.4, hoof=K["sumiInk4"])
    tail = m.pivot("tail", P(0, -22, -18), body_pivot)
    t = Sculpt(K["washi"])
    t.ball(S(0, -24, -17), 5, k=0)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=400)

    top, _ = m.surface(body, 0, 11, down=True)
    flame(m, top / PX, body_pivot, "brow_flame", height=12, width=4, stages=(2, 3))
    eyes(m, body, body_pivot, 6, -1, size=0.72)
    cheeks(m, body, body_pivot, 9, -7, size=0.6)
    mouth(m, body, body_pivot, -10.5, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -16, shade(HORN, 10), size=0.55)
    m.pivot("seat", P(0, -4, -10), body_pivot)
    return m
