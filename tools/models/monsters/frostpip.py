"""
Frostpip — an ice chick: a round pale-blue ball of a bird with a white breast, an orange beak
and legs, stubby wings, a fan of a tail, and a crown of icicles standing up on its head. The
icicles grow at stage 2 (Frostfugl) and 3 (Isfønix), which wears the crown. Sizes in px of the
picture box (x right, f towards the viewer, z up); its legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["springBlue"]
ICE = mix(K["springBlue"], K["washi"], 0.55)
BEAK = K["surimiOrange"]


def build():
    m = Model("frostpip")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -27), (20, 18.5, 20), k=0)
    s.ellipsoid(S(0, 11, -34), (12, 8, 11), op="paint", colour=K["washi"], k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(BEAK)
    b.round_cone(S(0, 17, -24), S(0, 23, -26), 3.2, 0.7, k=0.8)
    m.part(b, "beak", body_pivot, voxel=0.3, budget=400)

    top, _ = m.surface(body, 0, -2, down=True)
    t = top / PX
    icicles = m.pivot("icicles", top, body_pivot)
    icicles["stageScale"] = 0.35
    c = Sculpt(ICE)
    for i in range(5):
        a = (i - 2) * 0.42
        d = Vector((math.sin(a), 0.15, math.cos(a)))
        c.round_cone(t - d * 2, t + d * (12 - abs(i - 2) * 2.5), 2.6, 0.4, k=0.8)
    m.part(c, "icicles_mesh", icicles, voxel=0.3, budget=600, opacity=0.9)

    tail = m.pivot("tail", S(0, -17, -30) * PX, body_pivot)
    tl = Sculpt(shade(BODY, -10))
    for dx in (-5, 0, 5):
        tl.round_cone(S(dx * 0.4, -16, -30), S(dx, -25, -24), 3.2, 1.6, k=1)
    m.part(tl, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)
    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 17, 2, -26), shade(BODY, -8), tip=ICE, length=18, height=15)
    bird_legs(m, BEAK, 7, 2, -44)

    eyes(m, body, body_pivot, 8, -19, size=0.9)
    cheeks(m, body, body_pivot, 13, -26, size=0.75)
    mouth(m, body, body_pivot, -30, kind="none")
    chest_mark(m, body, body_pivot, -38, shade(ICE, 5), size=0.6)
    crown(m, t + Vector((0, 5, -2)), body_pivot, radius=6)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
