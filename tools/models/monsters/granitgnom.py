"""
Granitgnom — a granite gnome: a grey chibi speckled like granite, a big round nose, dot eyes, a
white beard, and a hat of stone — a flat slab with a pointed stone on top. At stage 2
(Granitkæmpe) moss grows on its hat. Sizes in px of the picture box (x right, f towards the
viewer, z up); it waddles.
"""
import math
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import gnome
from lib.sdf import PX, Sculpt

BODY = K["katanaGray"]


def build():
    m = Model("granitgnom")
    s, body_pivot = gnome(m, BODY, K["fujiGray"], K["fujiWhite"], shade(BODY, 12))
    rnd = random.Random(31)
    for _ in range(18):
        a, z = rnd.uniform(0, math.tau), rnd.uniform(-44, 4)
        if math.cos(a) > 0.4 and z > -20:
            continue
        s.ball(S(math.sin(a) * 17, math.cos(a) * 15 + 4, z), rnd.uniform(0.9, 1.5), op="paint", colour=shade(BODY, -18), only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    top, _ = m.surface(body, 0, 2, down=True)
    t = top / PX
    h = Sculpt(shade(BODY, -8))
    h.ellipsoid(t + Vector((0, 0, -2)), (21, 19, 4), k=0)
    h.round_cone(t + Vector((0, 0, 0)), t + Vector((1, 2, 14)), 9, 2.5, k=2)
    m.part(h, "hat", body_pivot, voxel=0.4, budget=1200, stage_shade=True)
    moss = Sculpt(K["autumnGreen"])
    for x, f in ((-12, 4), (10, -6), (4, 12)):
        moss.ellipsoid(t + Vector((x, f, 1)), (5, 5, 2), k=1)
    m.part(moss, "hat_moss", body_pivot, voxel=0.3, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 6.5, -4, size=0.9, kind="dot")
    cheeks(m, body, body_pivot, 11, -11, size=0.6)
    mouth(m, body, body_pivot, -16, kind="smile", width=0.4)
    chest_mark(m, body, body_pivot, -40, shade(K["autumnGreen"], 25), size=0.5)
    m.pivot("seat", P(0, -6, 16), body_pivot)
    return m
