"""
Dampskjold — a steam turtle: a stocky red turtle under a high golden shell of plates, a sleepy
head poking out in front, four stubby legs, a pointed tail, steam rising off it. At stage 2
(Dampkæmpe) spikes rise on its shell. Sizes in px of the picture box (x right, f towards the
viewer, z up); four legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import FEET_Z, legs4
from lib.sdf import PX, Sculpt

BODY = shade(K["autumnRed"], -10)
SHELL = K["boatYellow1"]
PLATE = mix(K["boatYellow2"], K["washi"], 0.35)


def build():
    m = Model("dampskjold")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -2, -39), (18, 20, 8), k=0)
    s.ellipsoid(S(0, -4, -31), (23, 25, 14), k=2, colour=SHELL)  # the shell
    s.ellipsoid(S(0, -4, -39), (24.5, 26.5, 2.5), k=1.5, colour=shade(SHELL, -10))  # its rim
    s.round_cone(S(0, 14, -38), S(0, 22, -34), 7, 8.5, k=4)  # the neck
    s.ellipsoid(S(0, 25, -32), (11, 10, 9), k=4)  # the head
    for x, f in ((0, -4), (-10, 5), (10, 5), (-10, -13), (10, -13), (0, 12), (0, -20)):
        at = S(x, f, -17)
        s.ellipsoid(at + Vector((0, 0, -1)), (6, 6, 20), op="paint", colour=PLATE, k=1.2)
    s.ellipsoid(S(0, 24, -38), (8, 6, 3), op="paint", colour=PLATE, k=1.5)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    legs4(m, BODY, ((-14, 9), (14, 9), (14, -14), (-14, -14)), -40, radius=5.5)
    tail = m.pivot("tail", P(0, -24, -40), body_pivot)
    t = Sculpt(BODY)
    t.round_cone(S(0, -22, -40), S(0, -32, -45), 4.2, 0.8, k=1)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=300, stage_shade=True)

    sp = Sculpt(shade(SHELL, -16))
    for x, f in ((0, -4), (-10, 5), (10, 5), (-10, -13), (10, -13)):
        at, n = m.surface(body, x, f, down=True)
        a = at / PX
        sp.round_cone(a - Vector(n) * 1.5, a + Vector((0, 0, 6)), 3, 0.5, k=0.8)
    m.part(sp, "spikes", body_pivot, voxel=0.3, budget=600, stages=(2, 3))

    eyes(m, body, body_pivot, 5, -30, size=0.62, kind="sleepy")
    cheeks(m, body, body_pivot, 8.5, -35, size=0.55)
    mouth(m, body, body_pivot, -36, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -26, shade(PLATE, 12), x=0, size=0.6)
    m.pivot("seat", P(0, -4, -16), body_pivot)
    return m
