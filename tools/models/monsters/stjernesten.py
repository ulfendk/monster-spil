"""
Stjernesten — a fallen star: a plump golden five-pointed star with a pale heart, a kawaii face,
glowing, sparks flying off it, floating. Sizes in px of the picture box (x right, f towards the
viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

BODY = K["carpYellow"]


def build():
    m = Model("stjernesten")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    c = S(0, 0, -24)
    s = Sculpt(BODY)
    s.ellipsoid(c, (14, 10, 14), k=0)
    for i in range(5):
        a = math.pi / 2 + i / 5 * math.tau
        s.round_cone(c, c + Vector((math.cos(a) * 26, 0, math.sin(a) * 26)), 11, 3.2, k=4)
    s.ellipsoid(c + Vector((0, -6, -2)), (10, 5, 10), op="paint", colour=mix(BODY, K["washi"], 0.55), k=4)
    body = m.part(s, "body_mesh", body_pivot, budget=4500)
    eyes(m, body, body_pivot, 6, -21, size=0.72)
    cheeks(m, body, body_pivot, 10, -27, size=0.6)
    mouth(m, body, body_pivot, -29, kind="smile", width=0.45)
    m.pivot("seat", P(0, -4, 0), body_pivot)
    return m
