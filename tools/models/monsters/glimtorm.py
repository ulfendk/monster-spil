"""
Glimtorm — a glow-worm: a soft golden worm of round segments, its tail end glowing bright,
feelers with glowing tips, a kawaii face, glowing all over. At stage 2 (Glimslange) and 3
(Lynormen) it's longer; 3 wears the crown. Sizes in px of the picture box (x right, f towards the
viewer, z up); it slithers.
"""
from mathutils import Vector

from lib.features import cheeks, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import worm
from lib.sdf import PX, Sculpt

BODY = shade(K["carpYellow"], -15)
GLOW = K["carpYellow"]


def build():
    m = Model("glimtorm")
    joints = [(0, 8, -40, 7.5), (3, 0, -45, 7.8), (1, -8, -47, 7.4), (-5, -15, -47.5, 7), (-10, -22, -48, 6.4), (-10, -30, -48.5, 6.4)]

    def glow(s, i, at, r):
        if i >= len(joints) - 2:
            s.ellipsoid(at, (r + 1, r + 1, r + 1), op="paint", colour=mix(GLOW, K["washi"], 0.5), k=1)

    h, head, body_pivot = worm(m, BODY, None, S(0, 14, -30), (10.5, 11, 10), joints, stages_last=(2, 3), paint=glow)
    hm = m.part(h, "head_mesh", head, budget=2500, stage_shade=True)
    f = Sculpt(INK)
    for side in (-1, 1):
        f.chain([S(side * 4, 12, -21), S(side * 7, 13, -14), S(side * 10, 11, -10)], [1, 0.8, 0.7], k=0.4)
    m.part(f, "feelers", head, voxel=0.25, budget=400, role="flat", smooth=0)
    tips = Sculpt(GLOW)
    for side in (-1, 1):
        tips.ball(S(side * 10, 11, -9.5), 2.2)
    m.part(tips, "feeler_tips", head, voxel=0.25, budget=300, role="flat")
    eyes(m, hm, head, 5, -28, size=0.7)
    cheeks(m, hm, head, 8, -33, size=0.5)
    mouth(m, hm, head, -35, kind="smile", width=0.4)
    top, _ = m.surface(hm, 0, 14, down=True)
    crown(m, top / PX, head, radius=5)
    m.pivot("seat", P(0, 0, -34), body_pivot)
    return m
