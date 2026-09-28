"""
Askefugl — an ash bird: soot grey with a paler breast, a hooked orange beak, fierce orange
eyes under angry brows, a crest of flames and a tail of flames, grey wings tipped in orange,
embers drifting off it. At stage 2 (Askefønix) its flames are bigger. Sizes in px of the
picture box (x right, f towards the viewer, z up); its legs swing from the hip.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import FEET_Z, bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = shade(K["katanaGray"], -8)
BELLY = shade(K["fujiGray"], 10)
BEAK = K["surimiOrange"]


def build():
    m = Model("askefugl")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -2, -31), (15, 17, 17), k=0)
    s.ellipsoid(S(0, 5, -9), (12.5, 12, 12), k=6)  # the head
    s.ellipsoid(S(0, 8, -33), (10, 10, 13), op="paint", colour=BELLY, k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    b = Sculpt(BEAK)
    b.chain([S(0, 15, -8), S(0, 21, -9), S(0, 24.5, -12), S(0, 23.5, -15.5)], [3.6, 2.6, 1.6, 0.6], k=1)
    m.part(b, "beak", body_pivot, voxel=0.3, budget=500)

    crest = m.pivot("crest", S(0, 2, 2) * PX, body_pivot)
    crest["stageScale"] = 0.35
    for i, (dx, lean, h) in enumerate(((0, S(0, -0.3, 1), 15), (-4, S(-0.4, -0.5, 1), 11), (4, S(0.4, -0.5, 1), 11))):
        flame(m, S(dx, 2, 1), crest, f"crest_{i}", height=h, width=4.2, lean=lean)
    tail = m.pivot("tail", S(0, -17, -30) * PX, body_pivot)
    tail["stageScale"] = 0.35
    for i, (dx, lean, h) in enumerate(((0, S(0, -1, 0.7), 17), (-4, S(-0.4, -1, 0.4), 13), (4, S(0.4, -1, 0.4), 13))):
        flame(m, S(dx, -17, -30), tail, f"tail_{i}", height=h, width=4.6, lean=lean)

    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 13, 2, -24), shade(BODY, -8), tip=BEAK, length=28, height=20)
    bird_legs(m, K["sumiInk4"], 6, 0, -44)

    eyes(m, body, body_pivot, 6, -6, size=0.75, kind="fierce", iris=BEAK)
    mouth(m, body, body_pivot, -15, kind="none")
    chest_mark(m, body, body_pivot, -32, shade(BEAK, 10), size=0.55)
    m.pivot("seat", P(0, -6, -14), body_pivot)
    return m
