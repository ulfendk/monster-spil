"""
Rumling — the alien left by the UFO: a sea-green chibi with a pale belly, big black slanting
alien eyes, a little smile, and two antennae with glowing yellow tips, glowing softly. Sizes in px
of the picture box (x right, f towards the viewer, z up); it waddles.
"""
from mathutils import Vector

from lib.features import eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import chibi
from lib.sdf import PX, Sculpt

BODY = K["waveAqua2"]
TIP = K["carpYellow"]


def build():
    m = Model("rumling")
    s, body_pivot = chibi(m, BODY, K["washi"])
    body = m.part(s, "body_mesh", body_pivot, budget=4500)
    a = Sculpt(shade(BODY, -12))
    for side in (-1, 1):
        a.chain([S(side * 6, 2, 8), S(side * 9, 3, 16), S(side * 13, 5, 22)], [1.6, 1.2, 1], k=0.5)
    m.part(a, "antennae", body_pivot, voxel=0.25, budget=500)
    tips = Sculpt(TIP)
    for side in (-1, 1):
        tips.ball(S(side * 13.5, 5, 23.5), 3)
    m.part(tips, "antenna_tips", body_pivot, voxel=0.25, budget=300, role="flat")
    eyes(m, body, body_pivot, 8, -5, size=0.95, kind="alien")
    mouth(m, body, body_pivot, -17, kind="smile", width=0.4)
    m.pivot("seat", P(0, -6, 12), body_pivot)
    return m
