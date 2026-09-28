"""
Kløverhop — a clover hare: a green chibi whose ears are three-leafed clovers, a white muzzle
with a pink nose, a cat's smile, a pale belly and a white puff of a tail. At stage 2
(Kløverhare) its ears have a lucky fourth leaf and a white clover flower. Sizes in px of the
picture box (x right, f towards the viewer, z up); it waddles.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import chibi
from lib.sdf import PX, Sculpt

BODY = K["springGreen"]
LEAF = K["autumnGreen"]


def build():
    m = Model("kloeverhop")
    s, body_pivot = chibi(m, BODY, K["washi"])
    s.ellipsoid(S(0, 18, -12), (7.5, 5, 5), k=3, colour=K["washi"])
    s.ball(S(0, 22.5, -9.5), 1.9, k=0.6, colour=K["sakuraPink"])
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        stem_base = S(side * 8, 2, 7)
        tip = S(side * 13, 0, 20)
        pivot = m.pivot(f"ear_{lr}", stem_base * PX, body_pivot)
        pivot["sway"] = 1
        e = Sculpt(LEAF)
        e.round_cone(stem_base, tip, 1.8, 1.4, k=0.5)
        for i in range(4):
            a = i / 3 * math.tau * (0.75 if i < 3 else 1) + side * 0.3
            leaf = tip + Vector((math.cos(a) * 5.5, 0, math.sin(a) * 5.5))
            if i < 3:
                e.ellipsoid(leaf + Vector((math.cos(a), 0, math.sin(a))) * 1.5, (7, 2, 7), k=1.2)
        m.part(e, f"ear_{lr}_mesh", pivot, voxel=0.3, budget=600)
        four = Sculpt(LEAF)
        four.ellipsoid(tip + Vector((side * 2, 0.5, -6)), (4.8, 1.8, 4.8), k=0.6)
        four.ball(tip + Vector((0, -2.2, 0)), 2.2, colour=K["washi"])
        m.part(four, f"luck_{lr}", pivot, voxel=0.3, budget=300, stages=(2, 3))
    tail = m.pivot("tail", P(0, -10, -38), body_pivot)
    t = Sculpt(K["washi"])
    t.ball(S(0, -11, -38), 5, k=0)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=400)
    eyes(m, body, body_pivot, 8, -4, size=0.8)
    cheeks(m, body, body_pivot, 13, -11, size=0.7)
    mouth(m, body, body_pivot, -15.5, kind="cat", width=0.5)
    chest_mark(m, body, body_pivot, -38, shade(LEAF, 30), size=0.6)
    m.pivot("seat", P(0, -6, 12), body_pivot)
    return m
