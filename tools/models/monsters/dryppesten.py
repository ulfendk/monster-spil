"""
Dryppesten — a dripstone: a grey stalagmite of a monster, ringed with paler layers, a drop of
water on its tip, sleepy eyes and a smile, stubby feet. At stage 2 (Drypstensvogter) little
stalagmites grow round it. Sizes in px of the picture box (x right, f towards the viewer, z up);
it waddles.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import feet2
from lib.sdf import PX, Sculpt

BODY = K["katanaGray"]
DROP = K["springBlue"]


def build():
    m = Model("dryppesten")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.chain([S(0, 0, -44), S(0, 0, -32), S(0, 0, -18), S(0, -1, -4), S(0, -2, 12)], [22, 17, 11.5, 6, 1.6], k=2.5)
    for z in (-34, -22, -10):
        s.ellipsoid(S(0, 0, z), (25, 25, 1.4), op="paint", colour=shade(BODY, 14), k=0.8)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)
    d = Sculpt(DROP)
    d.round_cone(S(0, -2, 12), S(0, -2, 18), 0.6, 2.4, k=0)
    d.ball(S(0, -2, 19.5), 2.8, k=1)
    m.part(d, "drop", body_pivot, voxel=0.25, budget=300)
    feet2(m, shade(BODY, -10), 10, 4, size=0.8)
    mini = Sculpt(BODY)
    for x, f, h in ((-22, 6, 12), (21, 2, 10), (-14, -14, 9)):
        mini.round_cone(S(x, f, -52), S(x, f, -52 + h), 4, 0.6, k=0.8)
    m.part(mini, "stalagmites", body_pivot, voxel=0.3, budget=600, stages=(2, 3))
    eyes(m, body, body_pivot, 7.5, -28, size=0.72, kind="sleepy")
    cheeks(m, body, body_pivot, 12, -34, size=0.6)
    mouth(m, body, body_pivot, -38, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -45, shade(DROP, 18), size=0.45)
    m.pivot("seat", P(0, -4, -10), body_pivot)
    return m
