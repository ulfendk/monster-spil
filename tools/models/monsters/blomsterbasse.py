"""
Blomsterbasse — a flower bumblebee: a round fuzzy golden bee with dark bands, a kawaii face, see-
through wings buzzing, and a pink flower growing on its head. It floats. At stage 2
(Blomsterbille) its flower is open wider. Sizes in px of the picture box (x right, f towards the
viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import bug_wings
from lib.sdf import PX, Sculpt

BODY = K["carpYellow"]
BAND = K["sumiInk4"]


def build():
    m = Model("blomsterbasse")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 4, -28), (18, 16, 17), k=0)
    s.ellipsoid(S(0, -14, -30), (14, 12, 13), k=5)
    for f in (-6, -16):
        s.ellipsoid(S(0, f, -29), (22, 3, 20), op="paint", colour=BAND, k=1, only=BODY)
    s.round_cone(S(0, -24, -30), S(0, -28, -31), 2.2, 0.4, k=0.8, colour=BAND)  # the sting
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    bug_wings(m, body_pivot, 6, -4, -14, size=1.0)
    ant = Sculpt(INK)
    for side in (-1, 1):
        ant.chain([S(side * 5, 10, -13), S(side * 8, 12, -5), S(side * 11, 10, 0)], [1, 0.8, 0.8], k=0.4)
        ant.ball(S(side * 11, 10, 0.5), 1.8)
    m.part(ant, "antennae", body_pivot, voxel=0.25, budget=400, role="flat", smooth=0)
    top, _ = m.surface(body, -5, 4, down=True)
    t = top / PX
    fl = Sculpt(K["sakuraPink"])
    for i in range(5):
        a = i / 5 * math.tau
        fl.ellipsoid(t + Vector((math.cos(a) * 3.8, math.sin(a) * 3.8, 1)), (3.2, 3.2, 1.6), k=0.8)
    fl.ball(t + Vector((0, 0, 1.6)), 2.2, colour=K["washi"])
    flower = m.pivot("flower", top, body_pivot)
    flower["stageScale"] = 0.35
    m.part(fl, "flower_mesh", flower, voxel=0.25, budget=500)
    eyes(m, body, body_pivot, 7.5, -24, size=0.85)
    cheeks(m, body, body_pivot, 12, -31, size=0.7)
    mouth(m, body, body_pivot, -34, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -40, shade(K["springGreen"], 18), size=0.5)
    m.pivot("seat", P(0, -6, -10), body_pivot)
    return m
