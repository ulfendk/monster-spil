"""
Rodnisse — a root gnome: a brown chibi with a big round nose, little dot eyes, a white beard and
a tall pointed green hat bent over at the tip, roots for toes. At stage 2 (Rodtrold) leaves
sprout from its hat. Sizes in px of the picture box (x right, f towards the viewer, z up); it
waddles.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import gnome
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
HAT = K["autumnGreen"]


def build():
    m = Model("rodnisse")
    s, body_pivot = gnome(m, BODY, K["boatYellow2"], K["fujiWhite"], shade(BODY, 10))
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    top, _ = m.surface(body, 0, 2, down=True)
    t = top / PX
    hat = m.pivot("hat", top, body_pivot)
    hat["sway"] = 0.5
    h = Sculpt(HAT)
    h.ellipsoid(t + Vector((0, 0, -5)), (19, 17, 5), k=0)
    h.chain([t + Vector((0, 0, -4)), t + Vector((0, 2, 10)), t + Vector((0, 6, 22)), t + Vector((0, 12, 26))], [15, 9, 4, 1.8], k=3)
    m.part(h, "hat_mesh", hat, voxel=0.4, budget=1500)
    lv = Sculpt(K["springGreen"])
    for side in (-1, 1):
        lv.ellipsoid(t + Vector((side * 5, 4, 14)), (5, 1.6, 2.8), k=0.5)
    m.part(lv, "hat_leaves", hat, voxel=0.3, budget=400, stages=(2, 3))
    eyes(m, body, body_pivot, 6.5, -4, size=0.9, kind="dot")
    cheeks(m, body, body_pivot, 11, -11, size=0.6)
    mouth(m, body, body_pivot, -16, kind="smile", width=0.4)
    chest_mark(m, body, body_pivot, -40, shade(HAT, 25), size=0.5)
    m.pivot("seat", P(0, -6, 18), body_pivot)
    return m
