"""
Muldmus — a mole: a round dark ball of velvet with a paler belly, tiny dot eyes, a pink star of a
nose with little fingers round it, whiskers, a smile, big pale digging claws and a thin tail. At
stage 2 (Muldvarp) and 3 (Jordkonge) it wears a little miner's lamp, then the crown. Sizes in px of
the picture box (x right, f towards the viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import arms2, feet2
from lib.sdf import PX, Sculpt

BODY = K["sumiInk5"]
PALE = K["sumiInk6"]
NOSE = K["sakuraPink"]


def build():
    m = Model("muldmus")
    m.root["gait"] = "waddle"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -31), (22, 20, 20), k=0)
    s.ellipsoid(S(0, 16, -43), (12, 7, 7), op="paint", colour=PALE, k=2.5)
    s.round_cone(S(0, 16, -30), S(0, 23, -31), 5, 3.5, k=3, colour=NOSE)
    for i in range(10):
        a = i / 10 * math.tau
        s.round_cone(S(0, 24, -31), S(math.cos(a) * 5, 25.5, -31 + math.sin(a) * 5), 1.4, 1, k=0.8, colour=NOSE)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 1):
            a = S(side * 6, 20, -33 + k * 1.5)
            w.chain([a, a + S(side * 8, -1, k * 1.2), a + S(side * 14, -3, k * 2.5)], [0.5, 0.4, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=400, role="flat", smooth=0)
    feet2(m, shade(BODY, -8), 9, 6, size=0.8)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        arm = m.pivot(f"arm_{lr}", P(side * 18, 8, -32), body_pivot)
        a = Sculpt(BODY)
        paw = S(side * 24, 13, -38)
        a.round_cone(S(side * 18, 8, -32), paw, 4.5, 4.2, k=1.5)
        a.ellipsoid(paw, (6, 4, 5.5), k=1.5, colour=K["oldWhite"])
        for c in (-1, 0, 1):
            a.round_cone(paw + S(c * 2.8, 2, -2), paw + S(c * 3.4, 5, -5), 1.3, 0.5, k=0.5, colour=K["washi"])
        m.part(a, f"arm_{lr}_mesh", arm, voxel=0.3, budget=600, stage_shade=True)
    tail = m.pivot("tail", P(0, -18, -44), body_pivot)
    t = Sculpt(PALE)
    t.chain([S(0, -17, -44), S(3, -25, -46), S(8, -29, -44)], [1.8, 1.5, 1.1], k=0.6)
    m.part(t, "tail_mesh", tail, voxel=0.25, budget=300)
    top, _ = m.surface(body, 0, 6, down=True)
    lamp = Sculpt(K["carpYellow"])
    lamp.ellipsoid(top / PX + Vector((0, 2, 1)), (4, 3, 3), k=0.5, colour=K["katanaGray"])
    lamp.ball(top / PX + Vector((0, 5, 1.5)), 2.4)
    m.part(lamp, "lamp", body_pivot, voxel=0.25, budget=400, stages=(2, 2))
    eyes(m, body, body_pivot, 8, -24, size=0.8, kind="dot")
    cheeks(m, body, body_pivot, 13, -31, size=0.7)
    mouth(m, body, body_pivot, -38, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -45, shade(NOSE, 10), size=0.5)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -6, -12), body_pivot)
    return m
