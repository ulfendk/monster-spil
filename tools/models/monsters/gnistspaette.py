"""
Gnistspætte — a spark woodpecker: a grey bird with a pale breast, white speckles, a red cap, a
long chisel of a beak, feathered wings and a fan of a tail, sparks flying off it. At stage 2
(Tordenspætte) its cap is a crest. Sizes in px of the picture box (x right, f towards the viewer,
z up); its legs swing from the hip.
"""
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["sumiInk6"]
CAP = K["autumnRed"]


def build():
    m = Model("gnistspaette")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -2, -31), (15, 17, 17), k=0)
    s.ellipsoid(S(0, 5, -9), (12, 11.5, 11.5), k=6)
    s.ellipsoid(S(0, 8, -33), (10, 10, 13), op="paint", colour=K["washi"], k=3)
    s.ellipsoid(S(0, 2, 2), (11, 11, 5), op="paint", colour=CAP, k=2)
    rnd = random.Random(21)
    for _ in range(12):
        s.ball(S(rnd.uniform(-14, 14), rnd.uniform(-18, -4), rnd.uniform(-38, -20)), rnd.uniform(1, 1.6), op="paint", colour=K["washi"], only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(K["boatYellow2"])
    b.round_cone(S(0, 15, -8), S(0, 27, -9), 2.8, 0.9, k=0.6)
    m.part(b, "beak", body_pivot, voxel=0.25, budget=400)
    crest = Sculpt(CAP)
    crest.chain([S(0, 4, 2), S(0, -2, 6), S(0, -8, 5)], [4, 3, 1], k=1.5)
    m.part(crest, "crest", body_pivot, voxel=0.3, budget=400, stages=(2, 3))
    tail = m.pivot("tail", S(0, -17, -32) * PX, body_pivot)
    t = Sculpt(shade(BODY, -12))
    for dx in (-5, 0, 5):
        t.round_cone(S(dx * 0.4, -16, -32), S(dx, -26, -40), 3.2, 1.6, k=1)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)
    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 13, 2, -24), shade(BODY, -10), tip=K["washi"], length=26, height=19)
    bird_legs(m, K["sumiInk4"], 6, 0, -44)
    eyes(m, body, body_pivot, 6, -7, size=0.7)
    cheeks(m, body, body_pivot, 9.5, -12, size=0.55)
    mouth(m, body, body_pivot, -14, kind="none")
    chest_mark(m, body, body_pivot, -32, shade(K["carpYellow"], 10), size=0.55)
    m.pivot("seat", P(0, -6, -14), body_pivot)
    return m
