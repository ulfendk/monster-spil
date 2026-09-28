"""
Mosmus — a moss mouse: a round mossy-green ball of a mouse with a yellow belly, big round ears,
a pale muzzle with a pink nose and whiskers, darker moss patches, a thin tail, and a little pink
flower on its head. At stage 2 (Mosrotte) and 3 (Moskonge) more flowers bloom. Sizes in px of
the picture box (x right, f towards the viewer, z up).
"""
import math
import random

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import arms2, feet2
from lib.sdf import PX, Sculpt, frame

BODY = K["autumnGreen"]


def flower(s, at, r=3.2):
    for i in range(5):
        a = i / 5 * math.tau
        s.ellipsoid(at + Vector((math.cos(a) * r, math.sin(a) * r * 0.6, 0.6)), (r * 0.8, r * 0.8, r * 0.45), k=0.8)
    s.ball(at + Vector((0, 0, 1.2)), r * 0.55, colour=K["carpYellow"])


def build():
    m = Model("mosmus")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -31), (22, 20, 20), k=0)
    s.ellipsoid(S(0, 17, -34), (8.5, 6.5, 6), k=4, colour=K["oldWhite"])
    s.ball(S(0, 23, -31.5), 2.2, k=0.8, colour=K["sakuraPink"])
    s.ellipsoid(S(0, 16, -43), (12, 7, 7), op="paint", colour=K["carpYellow"], k=2.5)
    rnd = random.Random(3)
    for _ in range(7):
        a = rnd.uniform(1.2, math.tau - 1.2)
        s.ball(S(math.sin(a) * 21, math.cos(a) * 19, rnd.uniform(-38, -18)), rnd.uniform(3.5, 5), op="paint", colour=shade(BODY, -14), only=BODY)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        base = S(side * 15, -2, -15)
        F = frame(Vector((1, 0, 0)), Vector((0, 0, 1)), S(side * 0.25, 1, 0).normalized())
        e = Sculpt(BODY)
        e.ellipsoid(base + Vector((side * 3, 0, 9)), (11, 11, 3), F, k=2)
        e.ellipsoid(base + Vector((side * 3, -2, 9)), (7.5, 7.5, 2), F, colour=K["sakuraPink"], k=0.6)
        m.part(e, f"ear_{'L' if side < 0 else 'R'}", body_pivot, voxel=0.35, budget=500, stage_shade=True)
    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 0, 1):
            a = S(side * 5, 20, -33 + k * 1.5)
            w.chain([a, a + S(side * 8, -1, k * 1.2 + 0.5), a + S(side * 15, -3, k * 2.5)], [0.55, 0.45, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=500, role="flat", smooth=0)
    feet2(m, shade(BODY, -8), 9, 6, size=0.8)
    arms2(m, body_pivot, BODY, 18, 8, -30, reach=(4, 6, -7), radius=3.6)
    tail = m.pivot("tail", P(0, -18, -44), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -17, -44), S(4, -28, -46), S(12, -34, -40), S(16, -33, -30)], [2.2, 1.9, 1.6, 1.2], k=0.8)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=400, stage_shade=True)
    top, _ = m.surface(body, 6, 0, down=True)
    fl = Sculpt(K["sakuraPink"])
    flower(fl, top / PX)
    m.part(fl, "flower", body_pivot, voxel=0.25, budget=500)
    more = Sculpt(K["washi"])
    for x, f in ((-10, -6), (12, -10)):
        at, _ = m.surface(body, x, f, down=True)
        flower(more, at / PX, 2.6)
    m.part(more, "flowers", body_pivot, voxel=0.25, budget=700, stages=(2, 3))
    eyes(m, body, body_pivot, 8.5, -23, size=0.85)
    cheeks(m, body, body_pivot, 14, -31, size=0.8)
    mouth(m, body, body_pivot, -39, kind="cat", width=0.7)
    chest_mark(m, body, body_pivot, -45, shade(K["springGreen"], 18), size=0.6)
    crown(m, top / PX + Vector((-6, 4, -1)), body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -12), body_pivot)
    return m
