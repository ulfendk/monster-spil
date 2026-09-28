"""
Sivodder — a river otter: long, low and brown with a pale chest and face, small round ears,
a whiskered muzzle, a cat's smile, four stubby legs and a thick tapering tail, bubbles
trailing up. At stage 2 (Strømodder) and 3 (Havodder) a wave curls on its tail. Sizes in px
of the picture box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt, frame

BODY = K["boatYellow1"]
PALE = K["oldWhite"]


def build():
    m = Model("sivodder")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.chain([S(0, -18, -38), S(0, -4, -36), S(0, 8, -32)], [11, 12.5, 11], k=5)
    s.ellipsoid(S(0, 16, -20), (13, 12, 11.5), k=6)  # the head
    s.ellipsoid(S(0, 26, -23), (8, 6, 5.5), k=3, colour=PALE)  # the muzzle
    s.ball(S(0, 31.5, -20.5), 2.1, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 14, -34), (9, 10, 9), op="paint", colour=PALE, k=3)
    for side in (-1, 1):
        s.ellipsoid(S(side * 10, 12, -10), (4, 2.5, 4), k=1.5)  # round ears
        s.ellipsoid(S(side * 10, 13.5, -10), (2.4, 1, 2.4), op="paint", colour=shade(BODY, -20), k=0.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    w = Sculpt(INK)
    for side in (-1, 1):
        for k in (-1, 0, 1):
            a = S(side * 5, 28, -23 + k * 1.3)
            w.chain([a, a + S(side * 7, -1, k + 0.5), a + S(side * 13, -3, k * 2)], [0.5, 0.4, 0.3])
    m.part(w, "whiskers", body_pivot, voxel=0.2, budget=500, role="flat", smooth=0)

    legs4(m, shade(BODY, -8), ((-9, 8), (9, 8), (9, -16), (-9, -16)), -40, radius=4.2)
    tail = m.pivot("tail", P(0, -26, -40), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -26, -40), S(0, -36, -44), S(2, -46, -46)], [7, 5, 2], k=2)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=600, stage_shade=True)
    wave = Sculpt(K["springBlue"])
    wave.chain([S(2, -44, -44), S(3, -48, -36), S(3, -44, -30), S(2, -40, -32)], [3.4, 2.8, 2, 1.2], k=1)
    m.part(wave, "tail_wave", tail, voxel=0.3, budget=400, stages=(2, 3))

    eyes(m, body, body_pivot, 6, -16, size=0.7)
    cheeks(m, body, body_pivot, 10, -22, size=0.55)
    mouth(m, body, body_pivot, -27, kind="cat", width=0.6)
    chest_mark(m, body, body_pivot, -32, shade(K["springBlue"], 18), size=0.55)
    top, _ = m.surface(body, 0, 15, down=True)
    crown(m, top / PX, body_pivot, radius=6)
    m.pivot("seat", P(0, -8, -24), body_pivot)
    return m
