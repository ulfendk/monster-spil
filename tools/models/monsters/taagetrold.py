"""
Tågetrold — a mist troll: big, soft grey with a pale belly, a big nose, sleepy eyes and a kind
smile, a shock of hair on its head, green moss patches, mist curling round its feet. At stage 2
(Mosetrold) moss grows over its shoulders. Sizes in px of the picture box (x right, f towards
the viewer, z up); it stomps.
"""
import math
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import troll
from lib.sdf import PX, Sculpt

BODY = K["fujiGray"]
MOSS = K["autumnGreen"]


def build():
    m = Model("taagetrold")
    s, body_pivot = troll(m, BODY, K["oldWhite"])
    rnd = random.Random(5)
    for _ in range(5):
        s.ball(S(rnd.uniform(-18, 18), rnd.uniform(-16, -2), rnd.uniform(-38, -20)), rnd.uniform(3, 4.5), op="paint", colour=MOSS, only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)
    top, _ = m.surface(body, 0, 3, down=True)
    t = top / PX
    hair = Sculpt(shade(BODY, -18))
    for i in range(9):
        a = (i - 4) * 0.28
        d = Vector((math.sin(a), -0.35, math.cos(a))).normalized()
        hair.round_cone(t - d * 2, t + d * (10 - abs(i - 4) * 0.8), 2.6, 0.6, k=1)
    m.part(hair, "hair", body_pivot, voxel=0.3, budget=700)
    moss = Sculpt(MOSS)
    for side in (-1, 1):
        moss.ellipsoid(S(side * 14, -4, -18), (9, 9, 4.5), k=2)
        moss.ball(S(side * 17, -2, -14), 2.2, colour=K["sakuraPink"])
    m.part(moss, "moss", body_pivot, voxel=0.35, budget=800, stages=(2, 3))
    eyes(m, body, body_pivot, 7, -4, size=0.72, kind="sleepy")
    cheeks(m, body, body_pivot, 11, -11, size=0.6)
    mouth(m, body, body_pivot, -20, kind="smile", width=0.7)
    chest_mark(m, body, body_pivot, -32, shade(MOSS, 20), size=0.6)
    m.pivot("seat", P(0, -6, 2), body_pivot)
    return m
