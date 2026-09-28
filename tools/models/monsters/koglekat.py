"""
Koglekat — a pinecone cat: a brown cat covered in pinecone scales, a pale belly and muzzle, cat
ears, whiskers, a cat's smile, and a tail ending in a spray of green leaves. At stage 2
(Koglelos) its ears grow lynx tufts and its tail more leaves. Sizes in px of the picture box (x
right, f towards the viewer, z up); four legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["boatYellow1"]
PALE = K["oldWhite"]
SCALE = shade(BODY, -16)


def build():
    m = Model("koglekat")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -32), (13, 20, 12), k=0)
    s.ellipsoid(S(0, 13, -16), (14, 12.5, 12.5), k=7)
    s.ellipsoid(S(0, 23, -20), (7, 5.5, 5), k=3, colour=PALE)
    s.ball(S(0, 28, -17.5), 1.9, k=0.6, colour=K["sakuraPink"])
    s.ellipsoid(S(0, 4, -41), (9, 15, 4), op="paint", colour=PALE, k=2.5)
    # Pinecone scales down the back: rows of little ridges.
    for row in range(5):
        for i in range(5):
            f = -22 + row * 6
            x = (i - 2) * 5.5 + (row % 2) * 2.7
            at = S(x, f, -21 + abs(x) * -0.2 - abs(f + 8) * 0.12)
            s.ellipsoid(at, (3, 2, 1.4), op="paint", colour=SCALE, k=0.8, only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 8, 12, -5)
        up = S(side * 0.4, 0, 1).normalized()
        out = S(0, 1, 0)
        F = frame(up.cross(out).normalized() * -side, up, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-5, 0), (5, 0), (0, 11)], 3, rounding=1.2)
        e.slab(base + out * 1.2, F, [(-3, 1), (3, 1), (0, 8)], 1.4, rounding=0.5, colour=K["sakuraPink"])
        m.part(e, f"ear_{lr}", body_pivot, voxel=0.3, budget=400, stage_shade=True)
        tuft = Sculpt(INK)
        tuft.round_cone(base + up * 10, base + up * 15, 1.3, 0.3)
        m.part(tuft, f"tuft_{lr}", body_pivot, voxel=0.25, budget=150, stages=(2, 3))
    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 0, 1):
            a = S(side * 4.5, 25, -20 + k * 1.3)
            w.chain([a, a + S(side * 7, -1, k + 0.5), a + S(side * 13, -3, k * 2)], [0.5, 0.4, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=500, role="flat", smooth=0)
    legs4(m, shade(BODY, -6), ((-7.5, 8), (7.5, 8), (7.5, -18), (-7.5, -18)), -36, radius=4.2)
    tail = m.pivot("tail", P(0, -24, -30), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -24, -30), S(0, -32, -24), S(0, -34, -14)], [3.4, 2.8, 2.2], k=1)
    for ang in (-0.7, -0.25, 0.25, 0.7):
        # Leaves fanning up from the tip, flat to the sides.
        d = Vector((math.sin(ang), 0, math.cos(ang)))
        t.ellipsoid(S(0, -34, -14) + d * 6, (3, 1.4, 6), frame(Vector((0, 1, 0)).cross(d), Vector((0, 1, 0)), d), k=0.8, colour=K["autumnGreen"])
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=800, stage_shade=True)
    eyes(m, body, body_pivot, 6.5, -13, size=0.72)
    cheeks(m, body, body_pivot, 10, -19, size=0.55)
    mouth(m, body, body_pivot, -23.5, kind="cat", width=0.5)
    chest_mark(m, body, body_pivot, -30, shade(K["autumnGreen"], 25), size=0.55)
    m.pivot("seat", P(0, -8, -18), body_pivot)
    return m
