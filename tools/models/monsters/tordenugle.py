"""
Tordenugle — a thunder owl: a round dark-blue chibi owl with a grey face and belly, ear tufts,
big yellow owl eyes, a hooked beak, two little zigzag horns of lightning, feathered wings,
sparks flying off it. At stage 2 (Stormugle) its horns are bigger. Sizes in px of the picture
box (x right, f towards the viewer, z up); its legs swing from the hip.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt, frame

BODY = K["waveBlue2"]
PALE = K["fujiGray"]
BOLT = K["carpYellow"]


def build():
    m = Model("tordenugle")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -27), (20, 18, 21), k=0)
    for side in (-1, 1):
        s.ellipsoid(S(side * 7.5, 13, -20), (8, 5, 8), op="paint", colour=PALE, k=1.5)
        s.round_cone(S(side * 12, 4, -9), S(side * 17, 2, 2), 4, 0.8, k=2)
    s.ellipsoid(S(0, 14, -38), (10, 6, 9), op="paint", colour=PALE, k=2)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(BOLT)
    b.chain([S(0, 17, -24), S(0, 21, -26), S(0, 20.5, -29)], [2.6, 1.8, 0.6], k=0.8)
    m.part(b, "beak", body_pivot, voxel=0.25, budget=400)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        root = S(side * 5, 6, -5)
        horn = m.pivot(f"horn_{lr}", root * PX, body_pivot)
        horn["stageScale"] = 0.35
        h = Sculpt(BOLT)
        bolt = [(-1.6, 0), (1.6, 0), (2.4, 5), (5.5, 6), (3, 15), (0.8, 8), (-2, 7.5)]
        h.slab(root, frame(S(side, 0, 0), S(side * 0.2, 0, 1).normalized(), S(0, 1, 0)), [(x * side, y) for x, y in bolt], 2.2, rounding=0.7)
        m.part(h, f"horn_{lr}_mesh", horn, voxel=0.25, budget=400)
        feather_wing(m, body_pivot, side, S(side * 17, 0, -24), shade(BODY, -10), tip=BOLT, length=20, height=17)
    bird_legs(m, shade(BODY, -20), 7, 2, -44)
    eyes(m, body, body_pivot, 7.5, -20, size=0.8, kind="owl", iris=BOLT)
    mouth(m, body, body_pivot, -30, kind="none")
    chest_mark(m, body, body_pivot, -40, shade(BOLT, 10), size=0.5)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
