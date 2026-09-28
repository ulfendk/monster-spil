"""
Kvistugle — a twig owl: a round brown chibi owl with a pale face and belly, ear tufts, big owl
eyes, a hooked beak, bark-grooved wings, twiggy feet, and a sprig of leaves on its head. At
stage 2 (Grenugle) and 3 (Skovugle) its leaves grow; 3 wears the crown. Sizes in px of the
picture box (x right, f towards the viewer, z up); its legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
PALE = K["oldWhite"]


def build():
    m = Model("kvistugle")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -27), (20, 18, 21), k=0)
    for side in (-1, 1):
        s.ellipsoid(S(side * 7.5, 13, -20), (8, 5, 8), op="paint", colour=PALE, k=1.5)  # the face discs
        s.round_cone(S(side * 12, 4, -9), S(side * 17, 2, 2), 4, 0.8, k=2)  # ear tufts
    s.ellipsoid(S(0, 14, -38), (10, 6, 9), op="paint", colour=PALE, k=2)
    for i in range(4):
        s.round_cone(S(-8 + i * 5, 14, -34 - (i % 2) * 3), S(-6 + i * 5, 15, -37 - (i % 2) * 3), 1.2, 1.2, op="paint", colour=shade(PALE, -14))
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(K["carpYellow"])
    b.chain([S(0, 17, -24), S(0, 21, -26), S(0, 20.5, -29)], [2.6, 1.8, 0.6], k=0.8)
    m.part(b, "beak", body_pivot, voxel=0.25, budget=400)
    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 17, 0, -24), shade(BODY, -10), tip=shade(BODY, -24), length=20, height=17)
    bird_legs(m, shade(BODY, -22), 7, 2, -44)
    top, _ = m.surface(body, 0, 0, down=True)
    t = top / PX
    sprig = m.pivot("sprig", top, body_pivot)
    sprig["stageScale"] = 0.35
    lv = Sculpt(K["autumnGreen"])
    lv.round_cone(t - Vector((0, 0, 1)), t + Vector((0, 0, 6)), 1, 0.8, colour=shade(BODY, -20))
    for side in (-1, 1):
        lv.ellipsoid(t + Vector((side * 4, 0, 7)), (4.5, 1.5, 2.6), k=0.6)
    m.part(lv, "sprig_mesh", sprig, voxel=0.25, budget=500)
    eyes(m, body, body_pivot, 7.5, -20, size=0.8, kind="owl")
    mouth(m, body, body_pivot, -30, kind="none")
    chest_mark(m, body, body_pivot, -40, shade(K["autumnGreen"], 25), size=0.5)
    crown(m, t + Vector((0, 4, -1)), body_pivot, radius=6)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
