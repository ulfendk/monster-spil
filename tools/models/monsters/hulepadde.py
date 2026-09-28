"""
Hulepadde — a cave toad: pale as the rock it lives under, grey spots, a pale belly, sleepy eyes
on top of its head and a wide smile. At stage 2 (Grottepadde) glowing crystals grow on its
back. Sizes in px of the picture box (x right, f towards the viewer, z up); it hops.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import frog_body
from lib.sdf import PX, Sculpt

BODY = shade(K["oldWhite"], -10)


def build():
    m = Model("hulepadde")
    s, body_pivot = frog_body(m, BODY, K["washi"], spots=K["katanaGray"], seed=4)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    c = Sculpt(mix(K["springBlue"], K["washi"], 0.3))
    for x, f, h in ((-6, -6, 9), (4, -9, 11), (8, -2, 7), (-2, -14, 8)):
        at, n = m.surface(body, x, f, down=True)
        a = at / PX
        c.round_cone(a - Vector(n) * 2, a + Vector((x * 0.1, 0, h)), 2.8, 0.6, k=0.5)
    m.part(c, "crystals", body_pivot, voxel=0.3, budget=600, stages=(2, 3))
    eyes(m, body, body_pivot, 8.5, -22, size=0.62, kind="sleepy")
    cheeks(m, body, body_pivot, 12, -32, size=0.6)
    mouth(m, body, body_pivot, -35, kind="wide", width=0.9)
    chest_mark(m, body, body_pivot, -42, shade(K["springBlue"], 18), size=0.5)
    m.pivot("seat", P(0, -4, -24), body_pivot)
    return m
