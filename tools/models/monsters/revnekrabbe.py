"""
Revnekrabbe — a crack crab: a broad sandy crab with a cracked shell (grey cracks), a pale belly,
eyes on little stalks, two big pincers held up and eight walking legs. It walks sideways. Sizes in
px of the picture box (x right, f towards the viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import cracks
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
CRACK = K["katanaGray"]


def build():
    m = Model("revnekrabbe")
    m.root["gait"] = "skitter"
    m.root["hips"] = 1
    m.root["sideways"] = 1
    m.root["view"] = -0.5
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -36), (24, 17, 10), k=0)
    s.ellipsoid(S(0, 4, -42), (18, 12, 4), op="paint", colour=K["oldWhite"], k=2)
    cracks(s, S(0, 0, -36), (24.3, 17.3, 10.3), CRACK, count=6, seed=17, width=0.9, faces=Vector((0, -1, 0)))
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        st = Sculpt(BODY)
        tip = S(side * 6, 14, -22)
        st.round_cone(S(side * 5, 12, -32), tip, 1.8, 1.5, k=0.6)
        st.ball(tip + Vector((0, 0, 2)), 3.6, k=0.8, colour=K["washi"])
        m.part(st, f"stalk_{lr}", body_pivot, voxel=0.25, budget=400, stage_shade=True)
        e = Sculpt(INK)
        e.ball(tip + Vector((0, -3.2, 2.3)), 1.7)
        e.ball(tip + Vector((side * 0.5, -4.6, 3)), 0.6, colour=K["washi"])
        m.part(e, f"eye_{lr}", body_pivot, voxel=0.2, budget=200, role="flat", face="open", smooth=0)
        l = Sculpt(INK)
        l.round_cone(tip + Vector((-1.6, -3.6, 2)), tip + Vector((1.6, -3.6, 2)), 0.6, 0.6)
        m.part(l, f"lid_{lr}", body_pivot, voxel=0.2, budget=120, role="flat", face="shut", smooth=0)
        arm = m.pivot(f"arm_{lr}", P(side * 20, 8, -36), body_pivot)
        a = Sculpt(BODY)
        claw = S(side * 28, 14, -26)
        a.chain([S(side * 20, 8, -36), S(side * 27, 12, -34), claw], [3.4, 3, 3.4], k=1)
        a.ellipsoid(claw + S(0, 2, 2), (5.5, 5, 6.5), k=1.5)
        a.round_cone(claw + S(side * 1, 3, 6), claw + S(-side * 2, 6, 13), 2.6, 0.6, k=0.6)
        a.round_cone(claw + S(side * 2.5, 4, 5), claw + S(side * 4, 7, 11), 2, 0.5, k=0.6)
        m.part(a, f"pincer_{lr}", arm, voxel=0.3, budget=800, stage_shade=True)
    # Eight legs, four a side: every other one steps together.
    order = [(-1, 6), (1, 6), (1, 0), (-1, 0), (-1, -6), (1, -6), (1, -11), (-1, -11)]
    for i, (side, f) in enumerate(order):
        hip = S(side * 20, f, -38)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        l = Sculpt(shade(BODY, -10))
        l.chain([hip, S(side * 28, f, -34), S(side * 31, f - 1, -51)], [2, 1.7, 0.9], k=0.5)
        m.part(l, f"leg_{i}", leg, voxel=0.3, budget=300, stage_shade=True)
    cheeks(m, body, body_pivot, 11, -37, size=0.55)
    mouth(m, body, body_pivot, -40, kind="smile", width=0.45)
    m.pivot("seat", P(0, -4, -26), body_pivot)
    return m
