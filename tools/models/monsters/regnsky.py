"""
Regnsky — a rain cloud: a puffy pale-grey cloud with sleepy eyes and a smile, raindrops falling
from it. At stage 2 (Tordensky) it's darker with a lightning bolt, and at stage 3 (Stormsky)
wears the crown. Sizes in px of the picture box (x right, f towards the viewer, z up); it
floats.
"""
from mathutils import Vector

from lib.features import cheeks, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

CLOUD = shade(K["fujiGray"], 20)


def build():
    m = Model("regnsky")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -44))
    s = Sculpt(CLOUD)
    for x, f, z, r in ((0, 0, -26, 16), (-15, 2, -30, 11), (15, 2, -30, 11), (-8, -2, -16, 11), (9, -2, -15, 12), (-24, 0, -34, 7.5), (24, 0, -34, 7.5), (0, 4, -36, 12)):
        s.ball(S(x, f, z), r, k=4)
    s.ellipsoid(S(0, 4, -40), (26, 12, 4), op="paint", colour=shade(CLOUD, -10), k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)
    b = Sculpt(K["carpYellow"])
    bolt = [(0, 0), (4, 0), (1, -7), (5, -7), (-3, -19), (-0.5, -10), (-4, -10)]
    b.slab(S(14, 6, -38), frame(Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))), bolt, 2.2, rounding=0.6)
    m.part(b, "bolt", body_pivot, voxel=0.3, budget=300, role="flat", stages=(2, 3))
    eyes(m, body, body_pivot, 7.5, -24, size=0.72, kind="sleepy")
    cheeks(m, body, body_pivot, 12, -30, size=0.6)
    mouth(m, body, body_pivot, -32, kind="smile", width=0.55)
    top, _ = m.surface(body, 0, 0, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
