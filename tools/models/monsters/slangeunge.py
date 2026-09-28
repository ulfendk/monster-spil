"""
Slangeunge — the sand serpent's baby: a little sandy cobra with dark bands, a pale belly, its head
raised under a spread hood (a darker eye-spot on the back of it), fierce yellow eyes and a forked
tongue flicking out; its body lies in a curve behind it, a string of segments on its spine, so it
slithers. At stage 2 (Klitslange) and 3 (Ørkenkobra) it's longer and its hood bigger. Sizes in px
of the picture box (x right, f towards the viewer, z up); it can be ridden.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import worm
from lib.sdf import PX, Sculpt, frame

BODY = K["boatYellow2"]
BAND = shade(K["boatYellow1"], -12)


def build():
    m = Model("slangeunge")
    joints = [(0, 6, -38, 7), (3, -2, -45, 7.4), (1, -10, -47, 7.2), (-5, -17, -47.5, 6.8), (-10, -24, -48, 6.2), (-12, -32, -48.5, 5.4), (-9, -39, -49, 4.2), (-4, -43, -49.5, 2.8)]

    def bands(s, i, at, r):
        if i % 2 == 0:
            s.ellipsoid(at, (r + 1, 2.2, r + 1), op="paint", colour=BAND, k=0.8)

    h, head, body_pivot = worm(m, BODY, K["oldWhite"], S(0, 12, -26), (10, 11, 9), joints, stages_last=(2, 3), paint=bands)
    h.round_cone(S(0, 10, -30), S(0, 8, -38), 7, 7, k=3)  # the neck
    hm = m.part(h, "head_mesh", head, budget=2500, stage_shade=True)
    hood = m.pivot("hood", S(0, 6, -28) * PX, head)
    hood["stageScale"] = 0.3
    hd = Sculpt(BODY)
    hd.ellipsoid(S(0, 5, -27), (17, 3.5, 14), k=0)
    hd.ellipsoid(S(0, 3, -25), (5, 2, 4), op="paint", colour=BAND, k=1)
    hd.ellipsoid(S(0, 7, -32), (10, 2.5, 7), op="paint", colour=K["oldWhite"], k=2)
    m.part(hd, "hood_mesh", hood, voxel=0.35, budget=900, stage_shade=True)
    tongue = Sculpt(K["peachRed"])
    t0 = S(0, 22, -30)
    tongue.round_cone(t0, t0 + S(0, 5, -1), 0.8, 0.7, k=0.3)
    for side in (-1, 1):
        tongue.round_cone(t0 + S(0, 5, -1), t0 + S(side * 1.6, 8, -2), 0.6, 0.3, k=0.3)
    m.part(tongue, "tongue", head, voxel=0.2, budget=300, outline=False)
    eyes(m, hm, head, 5, -23, size=0.62, kind="fierce", iris=K["carpYellow"])
    mouth(m, hm, head, -29, kind="smile", width=0.4)
    chest_mark(m, hm, head, -33, shade(BAND, 20), size=0.4)
    m.pivot("seat", P(0, -2, -34), body_pivot)
    return m
