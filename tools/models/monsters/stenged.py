"""
Stenged — a mountain goat: a grey goat with a pale belly and muzzle, a white beard, cat-like ears,
dark hooves, a white puff of a tail, and thick ram's horns curling round beside its head. At stage
2 (Klippebuk) its horns are bigger. Sizes in px of the picture box (x right, f towards the viewer, z
up); four legs swing from the hip (and it can be ridden).
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["fujiGray"]
PALE = K["oldWhite"]
HORN = K["boatYellow2"]


def build():
    m = Model("stenged")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -22), (12.5, 19, 11.5), k=0)
    s.round_cone(S(0, 8, -20), S(0, 13, -8), 8.5, 7, k=5)
    s.ellipsoid(S(0, 15, -3), (11.5, 11, 10.5), k=6)
    s.ellipsoid(S(0, 24, -7), (6, 6.5, 5), k=3.5, colour=PALE)
    s.ball(S(0, 30, -5.5), 1.8, k=0.6, colour=K["sumiInk4"])
    s.round_cone(S(0, 22, -12), S(0, 20, -21), 4, 1.2, k=2, colour=K["washi"])
    s.ellipsoid(S(0, 0, -30), (8, 16, 5), op="paint", colour=PALE, k=2.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 10, 11, 1)
        up = S(side * 0.8, 0, 0.6).normalized()
        out = S(side * 0.3, 1, 0).normalized()
        e = Sculpt(BODY)
        e.slab(base, frame(up.cross(out).normalized() * -side, up, out), [(-3.5, 0), (3.5, 0), (0, 9)], 2.6, rounding=1)
        m.part(e, f"ear_{lr}", body_pivot, voxel=0.3, budget=300, stage_shade=True)
        root = S(side * 5, 12, 6)
        horn = m.pivot(f"horn_{lr}", root * PX, body_pivot)
        horn["stageScale"] = 0.3
        h = Sculpt(HORN)
        # A curl: up and back, out, down and round forward beside the cheek.
        pts = []
        for i in range(9):
            a = i / 8 * math.pi * 1.5
            r = 8 - i * 0.5
            pts.append(root + Vector((side * (2 + i * 0.9), math.sin(a) * r * 0.9 + 1, math.cos(a) * r - 3)))
        h.chain(pts, [3.6 - i * 0.3 for i in range(9)], k=0.8)
        for i in range(1, 8):
            h.ellipsoid(pts[i], (4, 4, 0.8), op="paint", colour=shade(HORN, -14), k=0.5)
        m.part(h, f"horn_{lr}_mesh", horn, voxel=0.3, budget=700)
    legs4(m, BODY, ((-6.5, 8), (6.5, 8), (6.5, -16), (-6.5, -16)), -26, radius=3.8, hoof=K["sumiInk4"])
    tail = m.pivot("tail", P(0, -22, -18), body_pivot)
    t = Sculpt(K["washi"])
    t.ball(S(0, -24, -17), 5, k=0)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=400)
    eyes(m, body, body_pivot, 6, -1, size=0.72)
    cheeks(m, body, body_pivot, 9, -7, size=0.6)
    mouth(m, body, body_pivot, -10.5, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -16, shade(HORN, 10), size=0.5)
    m.pivot("seat", P(0, -4, -10), body_pivot)
    return m
