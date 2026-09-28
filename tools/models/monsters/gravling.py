"""
Gravling — a badger: a stocky grey badger with a pale belly, a long snout, little round ears, a
white stripe up its face and dark bands over its eyes, a smile, and big white claws for digging.
At stage 2 (Stengrævling) stones grow along its back. Sizes in px of the picture box (x right, f
towards the viewer, z up); four legs swing from the hip.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt

BODY = K["sumiInk6"]
PALE = K["fujiGray"]


def build():
    m = Model("gravling")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -6, -32), (18, 23, 13), k=0)
    s.ellipsoid(S(0, 13, -26), (13, 12, 11.5), k=7)
    s.round_cone(S(0, 20, -28), S(0, 30, -30), 6, 3, k=3)  # the snout
    s.ball(S(0, 31.5, -29.5), 2.2, k=0.6, colour=K["sumiInk4"])
    s.ellipsoid(S(0, 4, -41), (12, 16, 5), op="paint", colour=PALE, k=3)
    s.ellipsoid(S(0, 20, -20), (3.4, 18, 7), op="paint", colour=K["washi"], k=1.2)  # the stripe
    for side in (-1, 1):
        s.ellipsoid(S(side * 6.5, 20, -24), (4.5, 6, 4), op="paint", colour=K["sumiInk4"], k=1)  # the mask
        s.ball(S(side * 10, 8, -16), 3.6, k=1.2)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    legs4(m, shade(BODY, -6), ((-10, 8), (10, 8), (10, -20), (-10, -20)), -38, radius=5)
    claws = Sculpt(K["washi"])
    for x, f in ((-10, 8), (10, 8)):
        for c in (-1, 0, 1):
            claws.round_cone(S(x + c * 2.4, f + 6, -50), S(x + c * 2.8, f + 10, -51.5), 1, 0.4)
    m.part(claws, "claws", body_pivot, voxel=0.25, budget=300, outline=False)
    st = Sculpt(K["katanaGray"])
    for f in (-2, -10, -18):
        at, _ = m.surface(body, 0, f, down=True)
        st.ellipsoid(at / PX + Vector((0, 0, 1.5)), (5, 5, 3.5), k=0.6)
    m.part(st, "stones", body_pivot, voxel=0.3, budget=600, stages=(2, 3))
    eyes(m, body, body_pivot, 6, -21, size=0.62)
    cheeks(m, body, body_pivot, 9.5, -27, size=0.5)
    mouth(m, body, body_pivot, -32, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -38, shade(K["katanaGray"], 20), size=0.5)
    m.pivot("seat", P(0, -8, -18), body_pivot)
    return m
