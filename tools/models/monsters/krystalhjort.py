"""
Krystalhjort — a crystal deer: a slender golden-brown deer with white spots, a pale belly and
muzzle, cat-like ears, dark hooves, a white puff of a tail, and branching antlers of pale blue
crystal, sparks flying off it. Sizes in px of the picture box (x right, f towards the viewer, z
up); four legs swing from the hip (and it can be ridden).
"""
import random

from mathutils import Vector

from lib.features import cheeks, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt, frame

BODY = shade(K["carpYellow"], -20)
PALE = K["washi"]
CRYSTAL = mix(K["springBlue"], K["washi"], 0.3)


def build():
    m = Model("krystalhjort")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -22), (11.5, 19, 10.5), k=0)
    s.round_cone(S(0, 8, -20), S(0, 13, -8), 8, 6.5, k=5)
    s.ellipsoid(S(0, 15, -3), (11.5, 11, 10.5), k=6)
    s.ellipsoid(S(0, 24, -7), (6, 6.5, 5), k=3.5, colour=PALE)
    s.ball(S(0, 30, -5.5), 1.8, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 0, -30), (8, 16, 5), op="paint", colour=PALE, k=2.5)
    rnd = random.Random(12)
    for _ in range(9):
        s.ball(S(rnd.uniform(-9, 9), rnd.uniform(-18, 8), rnd.uniform(-18, -13)), rnd.uniform(1.4, 2.2), op="paint", colour=PALE, only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 9, 11, 3)
        up = S(side * 0.8, 0, 0.6).normalized()
        out = S(side * 0.3, 1, 0).normalized()
        F = frame(up.cross(out).normalized() * -side, up, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-3.5, 0), (3.5, 0), (0, 9)], 2.6, rounding=1)
        m.part(e, f"ear_{lr}", body_pivot, voxel=0.3, budget=300, stage_shade=True)
        root = S(side * 4, 10, 7)
        a = Sculpt(CRYSTAL)
        trunk = [root, root + S(side * 3, -1, 8), root + S(side * 7, -3, 16), root + S(side * 9, -5, 23)]
        a.chain(trunk, [2.2, 1.9, 1.5, 0.6], k=0.4)
        for i, j in ((1, 1), (2, -1)):
            a.round_cone(trunk[i + 1], trunk[i + 1] + S(side * 5, 4 * j, 5), 1.4, 0.4, k=0.4)
        m.part(a, f"antler_{lr}", body_pivot, voxel=0.25, budget=600)
    legs4(m, BODY, ((-6.5, 8), (6.5, 8), (6.5, -16), (-6.5, -16)), -26, radius=3.4, hoof=K["sumiInk4"])
    tail = m.pivot("tail", P(0, -22, -18), body_pivot)
    t = Sculpt(PALE)
    t.ball(S(0, -24, -17), 5, k=0)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=400)
    eyes(m, body, body_pivot, 6, -1, size=0.72)
    cheeks(m, body, body_pivot, 9, -7, size=0.6)
    mouth(m, body, body_pivot, -10.5, kind="smile", width=0.45)
    m.pivot("seat", P(0, -4, -10), body_pivot)
    return m
