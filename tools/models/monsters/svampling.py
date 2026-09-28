"""
Svampling — a little mushroom: a pale stalk of a body with a kawaii face under a big violet cap
spotted white, stubby feet, spores drifting off it. At stage 2 (Svampetrold) its cap is bigger
and little mushrooms grow at its feet. Sizes in px of the picture box (x right, f towards the
viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import feet2
from lib.sdf import PX, Sculpt

CAP = K["oniViolet"]
STALK = K["washi"]


def build():
    m = Model("svampling")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(STALK)
    s.ellipsoid(S(0, 0, -34), (15, 14, 16), k=0)
    body = m.part(s, "body_mesh", body_pivot, budget=3000)
    cap = m.pivot("cap", S(0, 0, -20) * PX, body_pivot)
    cap["stageScale"] = 0.2
    c = Sculpt(CAP)
    c.ellipsoid(S(0, 0, -14), (26, 24, 14), k=0)
    c.ellipsoid(S(0, 0, -24), (27, 25, 8), op="sub", k=2)
    for i in range(8):
        a = i / 8 * math.tau
        c.ball(S(math.cos(a) * 16, math.sin(a) * 15, -6 - (i % 2) * 3), 3.4, op="paint", colour=K["washi"])
    c.ball(S(0, 0, 0), 3.6, op="paint", colour=K["washi"])
    m.part(c, "cap_mesh", cap, voxel=0.4, budget=2000, stage_shade=True)
    feet2(m, shade(STALK, -14), 8, 4, size=0.75)
    mini = Sculpt(CAP)
    for x, f in ((-20, 6), (19, 2)):
        mini.round_cone(S(x, f, -52), S(x, f, -46), 1.8, 1.6, colour=STALK)
        mini.ellipsoid(S(x, f, -45), (4.5, 4.5, 2.6), k=0.6)
    m.part(mini, "mushrooms", body_pivot, voxel=0.3, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 7, -33, size=0.8)
    cheeks(m, body, body_pivot, 11, -38, size=0.6)
    mouth(m, body, body_pivot, -41, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -46, shade(CAP, 20), size=0.45)
    m.pivot("seat", P(0, -4, 4), body_pivot)
    return m
