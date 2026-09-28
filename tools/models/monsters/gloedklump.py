"""
Glødeklump — a lump of glowing rock: knobbly and dark, orange cracks glowing all over, glowing
eyes and a glowing grin, stubby rock feet and arms, embers drifting up. At stage 2 (Glødkæmpe)
boulders grow on its shoulders. Sizes in px of the picture box (x right, f towards the
viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import FEET_Z, arms2, cracks, feet2
from lib.sdf import Sculpt

BODY = K["sumiInk5"]
GLOW = K["surimiOrange"]


def build():
    m = Model("gloedklump")
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -29), (26, 22, 23), k=0)
    # A boulder: a few soft lumps.
    for x, f, z, r in ((-12, -6, -13, 11), (12, -4, -17, 11), (0, -10, -10, 10)):
        s.ball(S(x, f, z), r, k=6)
    cracks(s, S(0, 0, -29), (26.3, 22.3, 23.3), GLOW, count=6, seed=7, width=1.2)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    feet2(m, shade(BODY, -6), 11, 4, size=0.9)
    arms2(m, body_pivot, BODY, 22, 4, -30, reach=(5, 5, -9), radius=5)

    b = Sculpt(BODY)
    for side in (-1, 1):
        b.ball(S(side * 20, -4, -10), 8, k=3)
        b.ball(S(side * 24, -8, -16), 6, k=3)
    cracks(b, S(0, -6, -12), (27, 12, 8), GLOW, count=4, seed=11, width=0.7)
    m.part(b, "boulders", body_pivot, voxel=0.45, budget=1200, stages=(2, 3), stage_shade=True)

    eyes(m, body, body_pivot, 9.5, -22, size=1.0, kind="glow")
    mouth(m, body, body_pivot, -38, kind="grin", width=1.0, glow=GLOW)
    chest_mark(m, body, body_pivot, -46, shade(GLOW, 10), size=0.6)
    m.pivot("seat", P(0, -6, -8), body_pivot)
    return m
