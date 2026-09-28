"""
Støvbold — a puffball: a round pale mushroom ball with brown speckles and a paler top, sleepy
eyes, stubby feet, spores drifting off it. At stage 2 (Sporebold) little puffballs grow round
its feet. Sizes in px of the picture box (x right, f towards the viewer, z up).
"""
import math
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import feet2
from lib.sdf import PX, Sculpt

BODY = K["oldWhite"]
SPECK = K["boatYellow2"]


def build():
    m = Model("stoevbold")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -30), (23, 21, 21), k=0)
    s.ball(S(0, 0, -8), 3.5, k=4)  # a little nub on top
    s.ellipsoid(S(0, -2, -14), (18, 16, 8), op="paint", colour=mix(BODY, K["washi"], 0.5), k=4)
    rnd = random.Random(9)
    for _ in range(22):
        a, z = rnd.uniform(0, math.tau), rnd.uniform(-44, -14)
        if math.cos(a) > 0.5 and -40 < z < -22:
            continue
        rr = math.sqrt(max(0.0, 1 - ((z + 30) / 21) ** 2))
        s.ball(S(math.sin(a) * 23 * rr, math.cos(a) * 21 * rr, z), rnd.uniform(1.2, 2), op="paint", colour=SPECK)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    feet2(m, shade(BODY, -12), 10, 4, size=0.8)
    mini = Sculpt(BODY)
    for x, f, r in ((-21, 8, 5), (22, 4, 4.5), (-14, -14, 4)):
        mini.ball(S(x, f, -48), r, k=1)
    m.part(mini, "puffballs", body_pivot, voxel=0.35, budget=700, stages=(2, 3))
    eyes(m, body, body_pivot, 8.5, -26, size=0.85, kind="sleepy")
    cheeks(m, body, body_pivot, 14, -32, size=0.75)
    mouth(m, body, body_pivot, -36, kind="smile", width=0.55)
    chest_mark(m, body, body_pivot, -43, shade(K["springGreen"], 18), size=0.5)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
