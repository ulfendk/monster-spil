"""
Stenbid — a biting rock: a grey boulder of a monster with moss on its crown, fierce eyes and a big
jaw full of square teeth, stubby stone feet. At stage 2 (Stenbider) and 3 (Klippebid) more moss
grows and stones stand on its back. Sizes in px of the picture box (x right, f towards the viewer,
z up).
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import feet2
from lib.sdf import PX, Sculpt

BODY = K["katanaGray"]
MOSS = K["autumnGreen"]


def build():
    m = Model("stenbid")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -28), (23, 20, 20), k=0)
    for x, f, z, r in ((-12, -6, -14, 10), (11, -4, -16, 10.5), (0, 12, -40, 12)):
        s.ball(S(x, f, z), r, k=6)
    s.ellipsoid(S(0, -2, -10), (17, 15, 6), op="paint", colour=MOSS, k=3)
    s.ellipsoid(S(0, 16, -40), (12, 5, 5), op="paint", colour=shade(BODY, -12), k=1.5)  # the jaw's edge
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    feet2(m, shade(BODY, -10), 11, 4, size=0.9)
    st = Sculpt(shade(BODY, -8))
    for x, f in ((-8, -12), (9, -10), (0, -18)):
        at, _ = m.surface(body, x, f, down=True)
        st.ellipsoid(at / PX + Vector((0, 0, 2)), (4.5, 4.5, 5), k=0.8)
    m.part(st, "stones", body_pivot, voxel=0.3, budget=600, stages=(2, 3))
    eyes(m, body, body_pivot, 9, -22, size=0.75, kind="fierce", iris=MOSS)
    mouth(m, body, body_pivot, -36, kind="grin", width=1.1)
    chest_mark(m, body, body_pivot, -46, shade(MOSS, 25), size=0.5)
    m.pivot("seat", P(0, -6, -6), body_pivot)
    return m
