"""
Ildflue — a firefly: a small dark bug with a kawaii face and a smile, buzzing see-through wings,
feelers, and a big round tail glowing warm yellow. It floats, glowing. At stage 2 (Lysflue) and 3
(Stjerneflue) its light is bigger; 3 wears the crown. Sizes in px of the picture box (x right, f
towards the viewer, z up).
"""
from mathutils import Vector

from lib.features import cheeks, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import bug_wings
from lib.sdf import PX, Sculpt

BODY = K["sumiInk5"]
LIGHT = K["carpYellow"]


def build():
    m = Model("ildflue")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 8, -24), (13, 12, 12), k=0)
    s.ellipsoid(S(0, -4, -26), (10, 9, 9), k=4)
    s.ellipsoid(S(0, 12, -30), (8, 5, 6), op="paint", colour=shade(BODY, 16), k=2)
    body = m.part(s, "body_mesh", body_pivot, budget=3500, stage_shade=True)
    lamp = m.pivot("lamp", S(0, -12, -30) * PX, body_pivot)
    lamp["stageScale"] = 0.25
    l = Sculpt(LIGHT)
    l.ellipsoid(S(0, -16, -31), (11, 12, 11), k=0)
    l.ellipsoid(S(0, -12, -31), (10.5, 2.4, 10.5), op="paint", colour=mix(LIGHT, K["washi"], 0.5), k=1)
    m.part(l, "lamp_mesh", lamp, voxel=0.35, budget=1500, role="flat")
    bug_wings(m, body_pivot, 5, 2, -13, size=0.9)
    ant = Sculpt(INK)
    for side in (-1, 1):
        ant.chain([S(side * 4, 14, -14), S(side * 7, 16, -6), S(side * 10, 14, -1)], [1, 0.8, 0.8], k=0.4)
        ant.ball(S(side * 10, 14, -0.5), 1.8, colour=LIGHT)
    m.part(ant, "antennae", body_pivot, voxel=0.25, budget=400, role="flat", smooth=0)
    eyes(m, body, body_pivot, 5.5, -22, size=0.72)
    cheeks(m, body, body_pivot, 9, -27, size=0.55)
    mouth(m, body, body_pivot, -30, kind="smile", width=0.4)
    top, _ = m.surface(body, 0, 8, down=True)
    crown(m, top / PX, body_pivot, radius=5)
    m.pivot("seat", P(0, -6, -10), body_pivot)
    return m
