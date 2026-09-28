"""
Glødsalamander — a fire salamander: long, low and red with yellow spots and a yellow belly,
a broad flat head with a wide smile, eyes up on top, four stubby splayed legs, a long tapering
tail and a row of little spikes down its back. The spikes grow at stage 2 (Ildsalamander) and
3 (Lavadrage), which also has little wings and a crown. Sizes in px of the picture box (x
right, f towards the viewer, z up); four legs swing from the hip.
"""
import math

from mathutils import Euler, Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import FEET_Z, legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["peachRed"]
BELLY = K["carpYellow"]


def build():
    m = Model("gloedsalamander")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -40), (12, 19, 8.5), k=0)
    s.ellipsoid(S(0, 17, -37), (14.5, 11, 9), k=6)  # the broad head
    s.ellipsoid(S(0, -2, -46), (10, 20, 4), op="paint", colour=BELLY, k=2)
    s.ellipsoid(S(0, 21, -42), (10, 8, 3), op="paint", colour=BELLY, k=2)
    for x, f, z, r in ((-6, -2, -33, 2.8), (5, -10, -33, 3), (-4, -16, -34, 2.4), (7, 4, -34, 2.5), (-9, 10, -32, 2.2), (9, 14, -31, 2.2)):
        s.ball(S(x, f, z), r + 1.5, op="paint", colour=BELLY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    tail = m.pivot("tail", P(0, -22, -41), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -22, -41), S(3, -34, -44), S(10, -44, -46), S(18, -48, -47)], [7, 5, 3, 1], k=2)
    t.ball(S(4, -34, -40), 2.6, op="paint", colour=BELLY)
    m.part(t, "tail_mesh", tail, voxel=0.4, budget=900, stage_shade=True)

    ridge = m.pivot("ridge", P(0, -4, -32), body_pivot)
    ridge["stageScale"] = 0.35
    r = Sculpt(K["surimiOrange"])
    for f in (8, 2, -4, -10, -16, -22):
        at, n = m.surface(body, 0, f, down=True)
        a = at / PX
        r.round_cone(a - Vector(n), a + Vector((0, 0, 5.5 - abs(f + 7) * 0.1)), 2.2, 0.4, k=0.5)
    m.part(r, "ridge_mesh", ridge, voxel=0.3, budget=600)

    legs4(m, shade(BODY, -6), ((-12, 8), (12, 8), (12, -16), (-12, -16)), -41, radius=3.8)

    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        rest = Euler((0, -side * 0.3, side * 0.5), "XYZ")
        shoulder = S(side * 9, -4, -34)
        wp = m.pivot(f"wing_{lr}", shoulder * PX, body_pivot, rotation=rest)
        R = rest.to_matrix()
        u, v, w = R @ Vector((side, 0, 0)), R @ Vector((0, 0, 1)), R @ Vector((0, 1, 0))
        wg = Sculpt(K["surimiOrange"])
        wg.slab(shoulder, frame(u, v, w), [(0, 1), (9, 13), (20, 16), (17, 8), (22, 3), (13, 1), (11, -5), (3, -3)], 2, rounding=0.8)
        m.part(wg, f"wing_{lr}_mesh", wp, voxel=0.35, budget=400, stages=(3, 3))

    eyes(m, body, body_pivot, 7, -32, size=0.75)
    cheeks(m, body, body_pivot, 11, -37, size=0.6)
    mouth(m, body, body_pivot, -39.5, kind="wide", width=0.9)
    chest_mark(m, body, body_pivot, -44, shade(BELLY, 10), size=0.5)
    top, _ = m.surface(body, 0, 15, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -30), body_pivot)
    return m
