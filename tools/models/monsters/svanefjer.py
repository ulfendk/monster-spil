"""
Svanefjer — a swan: white all over, a long curving neck, an orange beak with a black knob, big
feathered wings, a fan of a tail, dark legs. At stage 2 (Svanedronning) its wings are bigger
and it wears a little crown. Sizes in px of the picture box (x right, f towards the viewer, z
up); it flies (and can be ridden).
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["washi"]
BEAK = K["surimiOrange"]


def build():
    m = Model("svanefjer")
    m.root["gait"] = "fly"
    m.root["view"] = -0.6
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -32), (15, 20, 13), k=0)
    s.chain([S(0, 8, -28), S(0, 14, -18), S(0, 11, -6), S(0, 12, 4)], [7, 5, 4.2, 4.2], k=4)  # the neck
    s.ellipsoid(S(0, 14, 8), (7.5, 8.5, 7), k=3.5)  # the head
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    b = Sculpt(BEAK)
    b.round_cone(S(0, 20, 7), S(0, 27, 4.5), 2.8, 1, k=0.8)
    b.ball(S(0, 20.5, 9.5), 1.8, k=0.8, colour=K["sumiInk4"])
    m.part(b, "beak", body_pivot, voxel=0.25, budget=400)

    tail = m.pivot("tail", S(0, -22, -30) * PX, body_pivot)
    tl = Sculpt(shade(BODY, -6))
    for dx in (-5, 0, 5):
        tl.round_cone(S(dx * 0.4, -21, -30), S(dx, -29, -24), 3.4, 1.8, k=1)
    m.part(tl, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)
    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 12, 2, -26), shade(BODY, -6), tip=mix(BODY, K["springBlue"], 0.25), length=32, height=22, grow=0.25)
    bird_legs(m, K["sumiInk4"], 6, -2, -42)

    eyes(m, body, body_pivot, 4, 10, size=0.55)
    cheeks(m, body, body_pivot, 5.5, 6, size=0.45)
    mouth(m, body, body_pivot, 3, kind="none")
    chest_mark(m, body, body_pivot, -30, shade(K["springBlue"], 10), size=0.55)
    from lib.features import crown
    top, _ = m.surface(body, 0, 13, down=True)
    crown(m, top / PX, body_pivot, radius=4.5)
    m.pivot("seat", P(0, -6, -18), body_pivot)
    return m
