"""
Bølgehale — a wave beast: a blue four-legged creature with a pale belly and muzzle, a crest of
wave curls down its neck, a fin on its back and a fish's tail fin, bubbles trailing up. At
stage 2 (Bølgedrage) its crest and fins are bigger. Sizes in px of the picture box (x right,
f towards the viewer, z up); four legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import fish_tail, legs4, slab_fin
from lib.sdf import PX, Sculpt

BODY = K["crystalBlue"]
PALE = K["washi"]
CURL = K["springBlue"]


def build():
    m = Model("boelgehale")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -30), (13, 20, 12), k=0)
    s.ellipsoid(S(0, 15, -16), (13, 12, 12), k=7)  # the head
    s.ellipsoid(S(0, 25, -20), (7.5, 6, 5.5), k=3, colour=PALE)  # the muzzle
    s.ellipsoid(S(0, 4, -38), (9, 16, 5), op="paint", colour=PALE, k=3)
    slab_fin(s, S(0, -8, -19), [(-8, 0), (6, 0), (-2, 9), (-10, 7)], colour=CURL)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    crest = m.pivot("crest", S(0, 8, -4) * PX, body_pivot)
    crest["stageScale"] = 0.3
    c = Sculpt(CURL)
    for i, (f, z) in enumerate(((14, -4), (7, -9), (0, -15))):
        base = S(0, f, z)
        pts = [base + S(0, -3 * math.sin(a), 6 * math.sin(a * 0.5) + 4 * (1 - math.cos(a))) for a in (0, 0.9, 1.8, 2.7, 3.4)]
        c.chain(pts, [3.4, 3, 2.4, 1.8, 1.2], k=1)
        c.ball(pts[-1], 1.8, colour=PALE)
    m.part(c, "crest_mesh", crest, voxel=0.3, budget=900)

    legs4(m, shade(BODY, -8), ((-8, 8), (8, 8), (8, -15), (-8, -15)), -36, radius=4.4)
    fish_tail(m, body_pivot, S(0, -24, -28), CURL, size=0.9)

    eyes(m, body, body_pivot, 6.5, -13, size=0.75)
    cheeks(m, body, body_pivot, 10, -19, size=0.55)
    mouth(m, body, body_pivot, -24, kind="smile", width=0.55)
    chest_mark(m, body, body_pivot, -32, shade(CURL, 18), size=0.55)
    m.pivot("seat", P(0, -6, -16), body_pivot)
    return m
