"""
Åkandefrø — a lily-pad frog: bright green with a yellow belly, big eyes on top and a wide smile,
wearing a lily pad on its head like a hat with a pink water lily on it. At stage 2 (Åkandetudse)
the lily is open wide. Sizes in px of the picture box (x right, f towards the viewer, z up); it
hops.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import frog_body
from lib.sdf import PX, Sculpt

BODY = K["springGreen"]
PAD = K["autumnGreen"]


def build():
    m = Model("aakandefroe")
    s, body_pivot = frog_body(m, BODY, K["carpYellow"])
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    top, _ = m.surface(body, 0, -6, down=True)
    t = top / PX
    pad = m.pivot("pad", top, body_pivot)
    pad["sway"] = 0.6
    p = Sculpt(PAD)
    # Worn tipped forward a little, like a hat.
    R = Matrix.Rotation(0.4, 3, Vector((1, 0, 0)))
    p.ellipsoid(t + Vector((0, 0, 2.5)), (19, 17, 1.6), R, k=0)
    p.slab(t + Vector((0, 12, 2.5)), R, [(-2, 6), (2, 6), (0, -6)], 6, op="sub")
    p.ellipsoid(t + Vector((0, 0, 3.5)), (14, 12, 1.2), R, op="paint", colour=shade(PAD, 10), k=0.6)
    m.part(p, "pad_mesh", pad, voxel=0.3, budget=1200)
    lily = Sculpt(K["sakuraPink"])
    c = t + Vector((5, 3, 3))
    for i in range(6):
        a = i / 6 * math.tau
        lily.round_cone(c, c + Vector((math.cos(a) * 4, math.sin(a) * 4, 3)), 1.4, 2.2, k=0.8)
    lily.ball(c + Vector((0, 0, 1.5)), 1.8, colour=K["carpYellow"])
    m.part(lily, "lily", pad, voxel=0.25, budget=500, stages=(1, 1))
    big = Sculpt(K["sakuraPink"])
    for i in range(8):
        a = i / 8 * math.tau
        big.round_cone(c, c + Vector((math.cos(a) * 6.5, math.sin(a) * 6.5, 3.5)), 1.6, 2.8, k=0.8)
    big.ball(c + Vector((0, 0, 1.8)), 2.4, colour=K["carpYellow"])
    m.part(big, "lily_open", pad, voxel=0.25, budget=700, stages=(2, 3))
    eyes(m, body, body_pivot, 8.5, -22, size=0.72)
    cheeks(m, body, body_pivot, 12, -32, size=0.6)
    mouth(m, body, body_pivot, -35, kind="wide", width=0.9)
    chest_mark(m, body, body_pivot, -42, shade(K["carpYellow"], 10), size=0.5)
    m.pivot("seat", P(0, -4, -24), body_pivot)
    return m
