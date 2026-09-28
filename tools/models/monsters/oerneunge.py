"""
Ørneunge — the giant eagle's chick: a fluffy brown eaglet with a white head, a hooked yellow
beak, fierce yellow eyes, big brown wings with pale tips, yellow feet, a fan of a tail. At stage 2
(Ørnefalk) and 3 (Tordenørn) its wings are bigger; 3 wears the crown. Sizes in px of the picture
box (x right, f towards the viewer, z up); it flies (and can be ridden).
"""
from mathutils import Vector

from lib.features import chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
HEAD = K["washi"]
BEAK = K["carpYellow"]


def build():
    m = Model("oerneunge")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -2, -31), (17, 17, 17), k=0)
    s.ellipsoid(S(0, 5, -9), (13, 12.5, 12.5), k=6, colour=HEAD)
    s.ellipsoid(S(0, 8, -33), (10, 10, 12), op="paint", colour=mix(BODY, K["washi"], 0.3), k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(BEAK)
    b.chain([S(0, 15, -8), S(0, 21, -9), S(0, 24.5, -12), S(0, 23.5, -15.5)], [3.8, 2.8, 1.7, 0.6], k=1)
    m.part(b, "beak", body_pivot, voxel=0.3, budget=500)
    tail = m.pivot("tail", S(0, -17, -34) * PX, body_pivot)
    t = Sculpt(shade(BODY, -8))
    for dx in (-5, 0, 5):
        t.round_cone(S(dx * 0.4, -16, -34), S(dx, -27, -40), 3.4, 1.8, k=1)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)
    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 14, 2, -24), shade(BODY, -10), tip=K["oldWhite"], length=32, height=22, grow=0.3)
    bird_legs(m, BEAK, 7, 0, -44)
    eyes(m, body, body_pivot, 6, -6, size=0.75, kind="fierce", iris=BEAK)
    mouth(m, body, body_pivot, -15, kind="none")
    chest_mark(m, body, body_pivot, -32, shade(BEAK, 10), size=0.55)
    top, _ = m.surface(body, 0, 4, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -14), body_pivot)
    return m
