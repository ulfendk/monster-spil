"""
Krystaltusse — a crystal toad: a grey toad with darker spots, a pale belly, sleepy eyes and a
wide smile, violet crystals growing out of its back. At stage 2 (Krystalpadde) its crystals are
bigger. Sizes in px of the picture box (x right, f towards the viewer, z up); it hops.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import frog_body
from lib.sdf import PX, Sculpt, frame

BODY = K["katanaGray"]
CRYSTAL = K["oniViolet"]


def build():
    m = Model("krystaltusse")
    s, body_pivot = frog_body(m, BODY, K["fujiGray"], spots=shade(BODY, -16), seed=13)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    crystals = m.pivot("crystals", P(0, -6, -26), body_pivot)
    crystals["stageScale"] = 0.35
    c = Sculpt(CRYSTAL)
    for x, f, h, r, lean in ((0, -6, 14, 4, 0), (-7, -2, 10, 3, -0.4), (7, -9, 11, 3.2, 0.35), (-4, -14, 8, 2.6, -0.2)):
        at, n = m.surface(body, x, f, down=True)
        a = at / PX
        d = Vector((math.sin(lean), 0, math.cos(lean)))
        hexagon = [(math.cos(i / 6 * math.tau) * r, math.sin(i / 6 * math.tau) * r) for i in range(6)]
        side = Vector((0, 1, 0)).cross(d).normalized()
        c.slab(a + d * h * 0.3, frame(side, d.cross(side), d), hexagon, h * 0.8, rounding=0.6, k=0.6)
        c.round_cone(a + d * h * 0.68, a + d * h, r * 0.9, 0.4, k=0.6)
    c.ellipsoid(S(0, -6, -20), (20, 20, 12), op="paint", colour=mix(CRYSTAL, K["washi"], 0.3), k=4)
    m.part(c, "crystals_mesh", crystals, voxel=0.3, budget=1500)
    eyes(m, body, body_pivot, 8.5, -22, size=0.62, kind="sleepy")
    cheeks(m, body, body_pivot, 12, -32, size=0.6)
    mouth(m, body, body_pivot, -35, kind="wide", width=0.9)
    chest_mark(m, body, body_pivot, -42, shade(CRYSTAL, 20), size=0.5)
    m.pivot("seat", P(0, -4, -24), body_pivot)
    return m
