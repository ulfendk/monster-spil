"""
Sandhvisker — a fennec fox: a small sandy fox with a pale face, chest and belly, enormous fennec
ears (pink inside), a cat's smile, and a big bushy tail with a dark tip, dust puffing round it. At
stage 2 (Sandræv) and 3 (Ørkenræv) its ears grow; 3 wears the crown. Sizes in px of the picture
box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt, frame

BODY = shade(K["boatYellow2"], 8)
PALE = K["washi"]


def build():
    m = Model("sandhvisker")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -8, -31), (12, 20, 11.5), k=0)
    s.ellipsoid(S(0, 8, -27), (11, 9, 12), k=6)
    s.ellipsoid(S(0, 15, -3), (16, 14, 14.5), k=7)
    s.ellipsoid(S(0, 25, -7), (7.5, 7, 5.5), k=3, colour=PALE)
    s.ball(S(0, 32, -5.5), 2, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 14, -24), (9, 7, 10), op="paint", colour=PALE, k=2.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 9, 12, 8)
        ear = m.pivot(f"ear_{lr}", base * PX, body_pivot)
        ear["stageScale"] = 0.2
        up = S(side * 0.55, 0.1, 1).normalized()
        out = S(side * 0.25, 1, 0).normalized()
        F = frame(up.cross(out).normalized() * -side, up, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-8, 0), (8, 0), (0.5, 24)], 3.2, rounding=1.4)
        e.slab(base + out * 1.5, F, [(-5.5, 2), (5.5, 2), (0.3, 19)], 1.5, rounding=0.6, colour=K["sakuraPink"])
        m.part(e, f"ear_{lr}_mesh", ear, voxel=0.3, budget=500, stage_shade=True)
    legs4(m, BODY, ((-6.5, 6), (6.5, 6), (6.5, -20), (-6.5, -20)), -36, radius=3.6, sock=PALE)
    tail = m.pivot("tail", P(0, -27, -28), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -27, -28), S(0, -38, -28), S(0, -46, -20), S(0, -46, -10)], [4, 8, 8.5, 5], k=3)
    t.ellipsoid(S(0, -46, -11), (6, 6, 5), op="paint", colour=K["sumiInk4"], k=2)
    m.part(t, "tail_mesh", tail, voxel=0.4, budget=900, stage_shade=True)
    eyes(m, body, body_pivot, 7, -1, size=0.75)
    cheeks(m, body, body_pivot, 11, -8, size=0.6)
    mouth(m, body, body_pivot, -12, kind="cat", width=0.5)
    chest_mark(m, body, body_pivot, -24, shade(K["boatYellow1"], 20), size=0.5)
    top, _ = m.surface(body, 0, 14, down=True)
    crown(m, top / PX, body_pivot, radius=5.5)
    m.pivot("seat", P(0, -8, -18), body_pivot)
    return m
