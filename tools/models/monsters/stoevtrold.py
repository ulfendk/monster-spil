"""
Støvtrold — a dust troll: big and sandy, speckled darker, a pale belly, a big nose, two tusks, a
shock of darker hair, long arms, dust swirling round its feet. At stage 2 (Sandstormtrold) its hair
is wild and sand-coloured stones ride on its shoulders. Sizes in px of the picture box (x right, f
towards the viewer, z up); it stomps.
"""
import math
import random

from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import troll
from lib.sdf import PX, Sculpt

BODY = K["boatYellow2"]
DARK = K["boatYellow1"]


def build():
    m = Model("stoevtrold")
    s, body_pivot = troll(m, BODY, K["oldWhite"])
    rnd = random.Random(8)
    for _ in range(16):
        a, z = rnd.uniform(0, math.tau), rnd.uniform(-44, -14)
        if math.cos(a) > 0.5:
            continue
        s.ball(S(math.sin(a) * 20.5, math.cos(a) * 16.5, z), rnd.uniform(1.2, 2), op="paint", colour=DARK, only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)
    top, _ = m.surface(body, 0, 3, down=True)
    t = top / PX
    hair = Sculpt(DARK)
    for i in range(9):
        a = (i - 4) * 0.3
        d = Vector((math.sin(a), -0.3, math.cos(a))).normalized()
        hair.round_cone(t - d * 2, t + d * (11 - abs(i - 4) * 0.8), 2.8, 0.6, k=1)
    m.part(hair, "hair", body_pivot, voxel=0.3, budget=700)
    st = Sculpt(shade(DARK, -8))
    for side in (-1, 1):
        st.ellipsoid(S(side * 15, -4, -16), (6, 6, 4.5), k=0.6)
    m.part(st, "shoulder_stones", body_pivot, voxel=0.35, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 7, -4, size=0.72)
    mouth(m, body, body_pivot, -20, kind="tusks", width=0.8)
    chest_mark(m, body, body_pivot, -32, shade(DARK, 20), size=0.6)
    m.pivot("seat", P(0, -6, 2), body_pivot)
    return m
