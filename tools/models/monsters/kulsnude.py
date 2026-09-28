"""
Kulsnude — a boar of coal: dark, heavy and low, glowing orange cracks down its sides, a pig's
snout, floppy ears, glowing eyes, two tusks and a curly tail. At stage 2 (Kulgris) a ridge of
glowing bristles rises along its back, bigger at stage 3 (Ildgalt). Sizes in px of the
picture box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
from mathutils import Vector

from lib.features import chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import FEET_Z, cracks, legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["sumiInk5"]
LIGHT = K["sumiInk6"]
GLOW = K["surimiOrange"]


def build():
    m = Model("kulsnude")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -29), (19, 25, 16), k=0)
    s.ellipsoid(S(0, 15, -18), (18, 16, 16.5), k=7)  # the head, big
    s.ellipsoid(S(0, 30, -23), (9, 5.5, 7), k=2.5, colour=K["sakuraPink"])  # the snout
    for side in (-1, 1):
        s.ball(S(side * 3.2, 35.3, -23), 1.8, k=0.6, op="sub")
    s.ellipsoid(S(0, 4, -40), (12, 18, 6), op="paint", colour=LIGHT, k=3)  # the belly
    cracks(s, S(0, -5, -30), (17.5, 25.5, 15.5), GLOW, count=6, seed=3, faces=Vector((0, -1, 0)))
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    for side in (-1, 1):
        base = S(side * 12, 15, -5)
        down = S(side * 0.9, 0.5, -0.6).normalized()
        out = S(side * 0.3, 1, 0.5).normalized()
        F = frame(out.cross(down).normalized(), down, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-5, 0), (5, 0), (3, 11), (0, 13), (-3, 11)], 3.2, rounding=1.4)
        e.slab(base + out * 1, F, [(-3, 1), (3, 1), (1.5, 9), (-1.5, 9)], 1.6, rounding=0.6, colour=K["sakuraPink"])
        m.part(e, f"ear_{'L' if side < 0 else 'R'}", body_pivot, voxel=0.35, budget=400, stage_shade=True)

    legs4(m, shade(BODY, -4), ((-8, 10), (8, 10), (8, -18), (-8, -18)), -34, radius=5.2)

    tail = m.pivot("tail", P(0, -29, -27), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -28, -27), S(0, -34, -25), S(2, -36, -20), S(5, -33, -18), S(4, -30, -21)], [2.2, 2, 1.8, 1.6, 1.3], k=0.8)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=400, stage_shade=True)

    # Stage 2 and 3: glowing bristles along the back.
    ridge = m.pivot("ridge", P(0, -4, -15), body_pivot)
    ridge["stageScale"] = 0.4
    r = Sculpt(BODY)
    for i, f in enumerate((10, 3, -4, -11, -18)):
        at, n = m.surface(body, 0, f, down=True)
        a = at / PX
        r.round_cone(a - Vector(n) * 1, a + Vector((0, 0, 7 - abs(i - 1.5))), 2.4, 0.4, k=0.6, colour=GLOW)
    m.part(r, "ridge_mesh", ridge, voxel=0.3, budget=500, stages=(2, 3))

    eyes(m, body, body_pivot, 8, -12, size=0.85, kind="glow")
    mouth(m, body, body_pivot, -30.5, kind="tusks", width=0.8)
    chest_mark(m, body, body_pivot, -32, shade(GLOW, 10), size=0.6)
    top, _ = m.surface(body, 0, 14, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -14), body_pivot)
    return m
