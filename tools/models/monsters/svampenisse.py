"""
Svampenisse — a mushroom gnome: a pale chibi with a big round nose, dot eyes and a white beard,
wearing a big red mushroom cap with white spots. At stage 2 (Svampekonge) little mushrooms grow
round the brim. Sizes in px of the picture box (x right, f towards the viewer, z up); it
waddles.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import gnome
from lib.sdf import PX, Sculpt

BODY = K["oldWhite"]
CAP = K["autumnRed"]


def build():
    m = Model("svampenisse")
    s, body_pivot = gnome(m, BODY, K["washi"], K["fujiWhite"], shade(BODY, -8))
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    top, _ = m.surface(body, 0, 2, down=True)
    t = top / PX
    c = Sculpt(CAP)
    c.ellipsoid(t + Vector((0, 0, 2)), (26, 23, 13), k=0)
    c.ellipsoid(t + Vector((0, 0, -8)), (27, 24, 8), op="sub", k=2)
    for i in range(9):
        a = i / 9 * math.tau
        c.ball(t + Vector((math.cos(a) * 15, math.sin(a) * 13, 9 - (i % 2) * 3)), 3.2, op="paint", colour=K["washi"])
    c.ball(t + Vector((0, 0, 15)), 3.4, op="paint", colour=K["washi"])
    m.part(c, "cap", body_pivot, voxel=0.4, budget=2000)
    mini = Sculpt(CAP)
    for a in (0.6, 2.4, 4.0):
        p = t + Vector((math.cos(a) * 24, math.sin(a) * 21, -4))
        mini.round_cone(p + Vector((0, 0, -3)), p, 1.4, 1.4, colour=K["washi"])
        mini.ellipsoid(p + Vector((0, 0, 1.2)), (3.4, 3.4, 2), k=0.5)
    m.part(mini, "mushrooms", body_pivot, voxel=0.3, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 6.5, -4, size=0.9, kind="dot")
    cheeks(m, body, body_pivot, 11, -11, size=0.6)
    mouth(m, body, body_pivot, -16, kind="smile", width=0.4)
    chest_mark(m, body, body_pivot, -40, shade(CAP, 20), size=0.5)
    m.pivot("seat", P(0, -6, 18), body_pivot)
    return m
