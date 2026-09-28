"""
Grusgekko — a gravel gecko: a long low sandy gecko speckled with grey, a pale belly, a wide
smile, big eyes on its broad head, four splayed legs and a long curling tail. At stage 2
(Skredgekko) and 3 (Bjerggekko) stony plates rise on its back; 3 wears the crown. Sizes in px of
the picture box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt

BODY = K["boatYellow2"]
SPECK = K["katanaGray"]


def build():
    m = Model("grusgekko")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -41), (11, 18, 7.5), k=0)
    s.ellipsoid(S(0, 16, -38), (13.5, 11, 8.5), k=6)
    s.ellipsoid(S(0, -2, -46), (9, 18, 3), op="paint", colour=K["oldWhite"], k=2)
    rnd = random.Random(41)
    for _ in range(14):
        s.ball(S(rnd.uniform(-9, 9), rnd.uniform(-20, 20), rnd.uniform(-36, -32)), rnd.uniform(1, 1.8), op="paint", colour=SPECK, only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    tail = m.pivot("tail", P(0, -22, -42), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -22, -42), S(4, -32, -45), S(12, -38, -47), S(18, -34, -48)], [6.5, 4.5, 2.8, 1], k=2)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=800, stage_shade=True)
    plates = m.pivot("plates", P(0, -4, -33), body_pivot)
    plates["stageScale"] = 0.4
    p = Sculpt(SPECK)
    for f in (6, -2, -10, -18):
        at, n = m.surface(body, 0, f, down=True)
        a = at / PX
        p.ellipsoid(a + Vector((0, 0, 1.5)), (3, 4, 3.5), k=0.6)
    m.part(p, "plates_mesh", plates, voxel=0.3, budget=600, stages=(2, 3))
    legs4(m, shade(BODY, -8), ((-12, 8), (12, 8), (12, -16), (-12, -16)), -42, radius=3.6)
    eyes(m, body, body_pivot, 7, -33, size=0.75)
    cheeks(m, body, body_pivot, 11, -38, size=0.55)
    mouth(m, body, body_pivot, -40.5, kind="wide", width=0.85)
    chest_mark(m, body, body_pivot, -45, shade(SPECK, 20), size=0.45)
    top, _ = m.surface(body, 0, 15, down=True)
    crown(m, top / PX, body_pivot, radius=5.5)
    m.pivot("seat", P(0, -6, -30), body_pivot)
    return m
