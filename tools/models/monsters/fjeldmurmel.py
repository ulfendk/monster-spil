"""
Fjeldmurmel — a mountain marmot: a plump brown chibi with a pale belly and muzzle, round ears,
chubby cheeks, buck teeth and a fluffy tail. At stage 2 (Klippemurmel) a little pebble crown of
stones sits on its head. Sizes in px of the picture box (x right, f towards the viewer, z up); it
waddles.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import chibi
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
PALE = K["oldWhite"]


def build():
    m = Model("fjeldmurmel")
    s, body_pivot = chibi(m, BODY, PALE)
    s.ellipsoid(S(0, 18, -12), (8, 5, 5.5), k=3, colour=PALE)
    s.ball(S(0, 22.5, -9.5), 1.9, k=0.6, colour=K["sumiInk4"])
    for side in (-1, 1):
        s.ball(S(side * 11, 13, -13), 6.5, k=3)  # chubby cheeks
        s.ball(S(side * 12, 2, 7), 4.2, k=1.5)  # round ears
        s.ball(S(side * 12, 4.5, 7), 2.4, op="paint", colour=shade(BODY, -20), k=0.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    tail = m.pivot("tail", P(0, -10, -40), body_pivot)
    t = Sculpt(shade(BODY, -8))
    t.chain([S(0, -11, -40), S(0, -18, -36), S(0, -20, -28)], [5, 6.5, 5], k=2.5)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=600, stage_shade=True)
    top, _ = m.surface(body, 0, 2, down=True)
    st = Sculpt(K["katanaGray"])
    for i in range(5):
        a = i / 5 * math.tau
        st.ball(top / PX + Vector((math.cos(a) * 6, math.sin(a) * 5, 1.5)), 2.6, k=0.6, colour=K["katanaGray"] if i % 2 else K["fujiGray"])
    m.part(st, "pebbles", body_pivot, voxel=0.3, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 8, -4, size=0.78)
    cheeks(m, body, body_pivot, 13, -11, size=0.7)
    mouth(m, body, body_pivot, -15.5, kind="buck", width=0.5)
    chest_mark(m, body, body_pivot, -38, shade(K["katanaGray"], 20), size=0.6)
    m.pivot("seat", P(0, -6, 12), body_pivot)
    return m
