"""
Gnistflue — a spark bee: a round golden bee with dark bands, a kawaii face, buzzing see-through
wings and a little sting, sparks flying off it, floating. At stage 2 (Gnistbi) and 3 (Lynhveps)
its wings are bigger; 3 wears the crown. Sizes in px of the picture box (x right, f towards the
viewer, z up).
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, shade
from lib.parts import bug_wings
from lib.sdf import PX, Sculpt

BODY = K["carpYellow"]
BAND = K["sumiInk4"]


def build():
    m = Model("gnistflue")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 6, -27), (15, 14, 15), k=0)
    s.ellipsoid(S(0, -12, -30), (13, 13, 12), k=5)
    for f in (-6, -15):
        s.ellipsoid(S(0, f, -29), (20, 3, 18), op="paint", colour=BAND, k=1, only=BODY)
    s.round_cone(S(0, -23, -31), S(0, -28, -33), 2.2, 0.4, k=0.8, colour=BAND)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)
    bug_wings(m, body_pivot, 5, -4, -14, size=1.0)
    ant = Sculpt(INK)
    for side in (-1, 1):
        ant.chain([S(side * 4, 12, -14), S(side * 7, 14, -6), S(side * 10, 12, -1)], [1, 0.8, 0.8], k=0.4)
        ant.ball(S(side * 10, 12, -0.5), 1.8)
    m.part(ant, "antennae", body_pivot, voxel=0.25, budget=400, role="flat", smooth=0)
    eyes(m, body, body_pivot, 6.5, -24, size=0.78)
    cheeks(m, body, body_pivot, 10.5, -30, size=0.6)
    mouth(m, body, body_pivot, -33, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -37, shade(BODY, 12), size=0.45)
    top, _ = m.surface(body, 0, 4, down=True)
    crown(m, top / PX, body_pivot, radius=5.5)
    m.pivot("seat", P(0, -6, -10), body_pivot)
    return m
