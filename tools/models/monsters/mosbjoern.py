"""
Mosbjørn — a moss bear: a big stocky brown bear with a paler muzzle and belly, round ears,
sleepy eyes, darker patches, moss growing on its back with a little red mushroom, and white
claws. At stage 2 (Skovbjørn) ferns sprout from the moss. Sizes in px of the picture box (x
right, f towards the viewer, z up); four legs swing from the hip (and it can be ridden).
"""
import math
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
PALE = K["boatYellow2"]
MOSS = K["autumnGreen"]


def build():
    m = Model("mosbjoern")
    m.root["gait"] = "stomp"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -28), (19, 25, 16), k=0)
    s.ellipsoid(S(0, 16, -18), (16, 14, 14.5), k=8)  # the head
    s.ellipsoid(S(0, 28, -22), (8, 6.5, 6.5), k=3, colour=PALE)  # the muzzle
    s.ball(S(0, 34, -19.5), 2.6, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 4, -40), (12, 18, 6), op="paint", colour=PALE, k=3)
    for side in (-1, 1):
        s.ball(S(side * 12, 12, -5), 5, k=2)  # round ears
        s.ball(S(side * 12, 15, -5), 2.8, op="paint", colour=PALE, k=0.6)
    rnd = random.Random(6)
    for _ in range(5):
        s.ball(S(rnd.uniform(-17, 17), rnd.uniform(-24, -2), rnd.uniform(-36, -22)), rnd.uniform(3.5, 5), op="paint", colour=shade(BODY, -14), only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)
    moss = Sculpt(MOSS)
    for x, f, r in ((-6, -12, 9), (6, -4, 8), (0, -22, 7)):
        at, _ = m.surface(body, x, f, down=True)
        moss.ellipsoid(at / PX, (r, r, 3.5), k=2)
    at, _ = m.surface(body, 5, -14, down=True)
    a = at / PX
    moss.round_cone(a, a + Vector((0, 0, 5)), 1.4, 1.4, colour=K["washi"])
    moss.ellipsoid(a + Vector((0, 0, 6)), (4, 4, 2.5), k=0.6, colour=K["autumnRed"])
    m.part(moss, "moss", body_pivot, voxel=0.35, budget=1200)
    ferns = Sculpt(K["springGreen"])
    for x, f in ((-6, -12), (6, -4)):
        at, _ = m.surface(body, x, f, down=True)
        b0 = at / PX + Vector((0, 0, 2))
        for ang in (-0.6, 0, 0.6):
            ferns.round_cone(b0, b0 + Vector((math.sin(ang) * 6, 2, 9)), 1.8, 0.5, k=0.6)
    m.part(ferns, "ferns", body_pivot, voxel=0.3, budget=600, stages=(2, 3))
    legs4(m, shade(BODY, -8), ((-11, 10), (11, 10), (11, -20), (-11, -20)), -32, radius=6)
    claws = Sculpt(K["washi"])
    for x, f in ((-11, 10), (11, 10), (11, -20), (-11, -20)):
        for c in (-1, 0, 1):
            claws.round_cone(S(x + c * 2.6, f + 7, -50), S(x + c * 3, f + 9.5, -51.5), 1, 0.4)
    m.part(claws, "claws", body_pivot, voxel=0.25, budget=400, outline=False)
    eyes(m, body, body_pivot, 7.5, -12, size=0.72, kind="sleepy")
    cheeks(m, body, body_pivot, 11, -19, size=0.6)
    mouth(m, body, body_pivot, -26, kind="smile", width=0.55)
    chest_mark(m, body, body_pivot, -32, shade(MOSS, 25), size=0.6)
    m.pivot("seat", P(0, -8, -10), body_pivot)
    return m
