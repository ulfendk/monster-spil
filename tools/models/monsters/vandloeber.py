"""
Vandløber — a water strider: a small slim blue bug with a pale belly, a kawaii face and a smile,
standing on six very long thin legs spread out wide, their tips resting on little rings on the
water. At stage 2 (Vandskøjter) and 3 (Søløber) its legs are longer. Sizes in px of the picture
box (x right, f towards the viewer, z up); it skitters.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

BODY = K["crystalBlue"]
LEG = shade(K["springBlue"], -18)


def build():
    m = Model("vandloeber")
    m.root["gait"] = "skitter"
    m.root["hips"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 10, -30), (10, 10, 9.5), k=0)  # the head
    s.ellipsoid(S(0, -6, -32), (8.5, 15, 7), k=4)  # the long body
    s.ellipsoid(S(0, 2, -37), (6, 14, 3), op="paint", colour=K["washi"], k=2)
    body = m.part(s, "body_mesh", body_pivot, budget=3500, stage_shade=True)
    for i, (side, f, reach, back) in enumerate(((-1, 6, 16, 10), (1, 6, 16, 10), (1, -2, 26, -2), (-1, -2, 26, -2), (-1, -10, 24, -16), (1, -10, 24, -16))):
        hip = S(side * 6, f, -33)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        leg["stageScale"] = 0.15
        l = Sculpt(LEG)
        knee = S(side * (6 + reach * 0.5), f + back * 0.5, -22)
        tip = S(side * (6 + reach), f + back, -51)
        l.chain([hip, knee, tip], [1.6, 1.2, 0.8], k=0.5)
        l.ellipsoid(tip, (3.4, 3.4, 0.8), colour=mix(K["springBlue"], K["washi"], 0.5), k=0.4)
        m.part(l, f"leg_{i}", leg, voxel=0.25, budget=400)
    eyes(m, body, body_pivot, 5, -27, size=0.7)
    cheeks(m, body, body_pivot, 8, -32, size=0.5)
    mouth(m, body, body_pivot, -34, kind="smile", width=0.4)
    chest_mark(m, body, body_pivot, -36, shade(K["springBlue"], 18), size=0.4)
    top, _ = m.surface(body, 0, 10, down=True)
    crown(m, top / PX, body_pivot, radius=5)
    m.pivot("seat", P(0, -6, -24), body_pivot)
    return m
