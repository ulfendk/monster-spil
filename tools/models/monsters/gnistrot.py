"""
Gnistrot — a spark rat: a round grey rat with a pale belly and muzzle, yellow stripes down its
back, round ears, buck teeth, whiskers, a zigzag lightning bolt of a tail, sparks flying off it.
At stage 2 (Lynrotte) and 3 (Tordenrotte) its tail bolt is bigger; 3 wears the crown. Sizes in
px of the picture box (x right, f towards the viewer, z up).
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import arms2, feet2
from lib.sdf import PX, Sculpt, frame

BODY = K["katanaGray"]
BOLT = K["carpYellow"]


def build():
    m = Model("gnistrot")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -31), (21, 20, 19.5), k=0)
    s.ellipsoid(S(0, 17, -34), (8.5, 6.5, 6), k=4, colour=K["oldWhite"])
    s.ball(S(0, 23, -31.5), 2.1, k=0.8, colour=K["sakuraPink"])
    s.ellipsoid(S(0, 16, -43), (12, 7, 7), op="paint", colour=K["oldWhite"], k=2.5)
    for x in (-7, 0, 7):
        s.ellipsoid(S(x, -12, -18), (2.2, 12, 6), op="paint", colour=BOLT, k=1, only=BODY)
    for side in (-1, 1):
        s.ball(S(side * 14, 0, -14), 7, k=2)
        s.ball(S(side * 14, 3, -14), 4.4, op="paint", colour=K["sakuraPink"], k=0.6)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 0, 1):
            a = S(side * 5, 20, -33 + k * 1.5)
            w.chain([a, a + S(side * 8, -1, k * 1.2 + 0.5), a + S(side * 15, -3, k * 2.5)], [0.55, 0.45, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=500, role="flat", smooth=0)
    feet2(m, shade(BODY, -8), 9, 6, size=0.8)
    arms2(m, body_pivot, BODY, 18, 8, -30, reach=(4, 6, -7), radius=3.6)
    tail = m.pivot("tail", P(0, -18, -44), body_pivot)
    tail["stageScale"] = 0.25
    t = Sculpt(BOLT)
    bolt = [(0, 0), (4, 0), (1, 9), (8, 9), (-2, 26), (1, 14), (-5, 14)]
    t.slab(S(0, -19, -44), frame(S(0, -1, 0), Vector((0, 0, 1)), Vector((1, 0, 0))), bolt, 2.6, rounding=0.9)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=600)
    eyes(m, body, body_pivot, 8.5, -23, size=0.85)
    cheeks(m, body, body_pivot, 14, -31, size=0.8)
    mouth(m, body, body_pivot, -39, kind="buck", width=0.6)
    chest_mark(m, body, body_pivot, -46, shade(BOLT, 10), size=0.5)
    top, _ = m.surface(body, 0, 2, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -12), body_pivot)
    return m
