"""
Strømål — an electric eel: a long dark-blue eel of segments with yellow bands, a fin along its
back and a fin at its tail, a fierce face with a toothy grin, sparks flying off it. At stage 2
(Tordenål) it's longer. Sizes in px of the picture box (x right, f towards the viewer, z up); it
slithers.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import worm
from lib.sdf import PX, Sculpt, frame

BODY = K["waveBlue2"]
BAND = K["carpYellow"]


def build():
    m = Model("stroemaal")
    joints = [(0, 8, -40, 7), (4, 0, -45, 7), (2, -8, -47, 6.8), (-4, -15, -47.5, 6.4), (-10, -22, -48, 5.8), (-12, -30, -48.5, 5), (-10, -37, -49, 4)]

    def bands_and_fin(s, i, at, r):
        if i % 2 == 1:
            s.ellipsoid(at, (r + 1, 1.8, r + 1), op="paint", colour=BAND, k=0.8)
        s.slab(at + Vector((0, 0, r - 1)), frame(Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((1, 0, 0))), [(-4, 0), (4, 0), (1, 4.5), (-2, 4.5)], 1.6, rounding=0.6, colour=mix(BODY, K["springBlue"], 0.5), k=0.8)
        if i == len(joints) - 1:
            s.slab(at + Vector((0, 3, 0)), frame(S(0, -1, 0), Vector((0, 0, 1)), Vector((1, 0, 0))), [(0, 3), (9, 9), (12, 0), (9, -9), (0, -3)], 1.8, rounding=0.7, colour=mix(BODY, K["springBlue"], 0.5), k=0.8)

    h, head, body_pivot = worm(m, BODY, mix(BODY, K["washi"], 0.5), S(0, 14, -32), (10, 12, 9), joints, stages_last=(2, 3), paint=bands_and_fin)
    hm = m.part(h, "head_mesh", head, budget=2500, stage_shade=True)
    eyes(m, hm, head, 5, -29, size=0.62, kind="fierce", iris=BAND)
    mouth(m, hm, head, -35, kind="grin", width=0.6)
    chest_mark(m, hm, head, -38, shade(BAND, 10), size=0.4)
    m.pivot("seat", P(0, 0, -34), body_pivot)
    return m
