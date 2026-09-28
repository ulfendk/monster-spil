"""
Magmamus — a round mouse of cooled magma: dark, cracked with glowing orange, big round ears
glowing inside, a pale muzzle with a pink nose and whiskers, a thin tail with a glowing tip,
embers drifting off it. At stage 2 (Magmarotte) a tuft of flame burns on its head, bigger at
stage 3 (Vulkanrotte). Sizes in px of the picture box (x right, f towards the viewer, z up).
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, shade
from lib.parts import FEET_Z, arms2, cracks, feet2
from lib.sdf import PX, Sculpt, frame

BODY = K["sumiInk5"]
LIGHT = K["sumiInk6"]
GLOW = K["surimiOrange"]


def build():
    m = Model("magmamus")
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -31), (22, 20, 20), k=0)
    s.ellipsoid(S(0, 17, -34), (8.5, 6.5, 6), k=4, colour=LIGHT)  # the muzzle
    s.ball(S(0, 23, -31.5), 2.2, k=0.8, colour=K["sakuraPink"])  # the nose
    s.ellipsoid(S(0, 16, -43), (12, 7, 7), op="paint", colour=LIGHT, k=2.5)
    cracks(s, S(0, 0, -31), (22.3, 20.3, 20.3), GLOW, count=5, seed=5, faces=Vector((0, -1, 0)))
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    for side in (-1, 1):
        base = S(side * 15, -2, -15)
        F = frame(Vector((1, 0, 0)), Vector((0, 0, 1)), S(side * 0.25, 1, 0).normalized())
        e = Sculpt(BODY)
        e.ellipsoid(base + Vector((side * 3, 0, 9)), (11, 11, 3), F, k=2)
        e.ellipsoid(base + Vector((side * 3, -2, 9)), (7.5, 7.5, 2), F, colour=K["sakuraPink"], k=0.6)
        m.part(e, f"ear_{'L' if side < 0 else 'R'}", body_pivot, voxel=0.35, budget=500, stage_shade=True)

    # Whiskers (flat ink).
    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 0, 1):
            a = S(side * 5, 20, -33 + k * 1.5)
            w.chain([a, a + S(side * 8, -1, k * 1.2 + 0.5), a + S(side * 15, -3, k * 2.5)], [0.55, 0.45, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=500, role="flat", smooth=0)

    feet2(m, shade(BODY, -6), 9, 6, size=0.8, toes=LIGHT)
    arms2(m, body_pivot, BODY, 18, 8, -30, reach=(4, 6, -7), radius=3.6)

    tail = m.pivot("tail", P(0, -18, -44), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -17, -44), S(4, -28, -46), S(12, -34, -40), S(16, -33, -30), S(15, -29, -24)], [2.2, 1.9, 1.6, 1.3, 1.1], k=0.8)
    t.ball(S(15, -29, -23.5), 2.4, k=1, colour=GLOW)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)

    top, _ = m.surface(body, 0, 2, down=True)
    tuft = m.pivot("tuft", top, body_pivot)
    tuft["stageScale"] = 0.4
    flame(m, top / PX + Vector((0, 0, -1.5)), tuft, "head_flame", height=13, width=4.5, stages=(2, 3))

    eyes(m, body, body_pivot, 8.5, -23, size=0.85)
    cheeks(m, body, body_pivot, 14, -31, size=0.8)
    mouth(m, body, body_pivot, -39, kind="cat", width=0.7)
    chest_mark(m, body, body_pivot, -45, shade(GLOW, 10), size=0.6)
    crown(m, top / PX + Vector((0, 4, -1)), body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -12), body_pivot)
    return m
