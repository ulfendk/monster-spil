"""
Oasepadde — an oasis toad: sandy yellow with green spots, a pale belly, big eyes on top and a
wide smile, a sprig of green leaves on its head. At stage 2 (Oasetudse) its leaves are bigger.
Sizes in px of the picture box (x right, f towards the viewer, z up); it hops.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import frog_body
from lib.sdf import PX, Sculpt, frame

BODY = K["boatYellow2"]
LEAF = K["autumnGreen"]


def build():
    m = Model("oasepadde")
    s, body_pivot = frog_body(m, BODY, K["washi"], spots=LEAF, seed=8)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    top, _ = m.surface(body, 0, 0, down=True)
    t = top / PX
    sprig = m.pivot("sprig", top, body_pivot)
    sprig["stageScale"] = 0.35
    for i, ang in enumerate((-0.9, 0, 0.9)):
        leaf = m.pivot(f"leaf_{i}", top, sprig)
        leaf["sway"] = 1
        d = Vector((math.sin(ang), -0.3, math.cos(ang) + 0.3)).normalized()
        side = Vector((0, 1, 0)).cross(d).normalized()
        lf = Sculpt(LEAF)
        pts = [(math.sin(u * math.pi) * 3.6, u * 13) for u in (j / 8 for j in range(9))]
        lf.slab(t, frame(side, d, d.cross(side)), pts + [(-x, y) for x, y in reversed(pts[1:-1])], 1.8, rounding=0.7)
        m.part(lf, f"leaf_{i}_mesh", leaf, voxel=0.3, budget=300)
    eyes(m, body, body_pivot, 8.5, -22, size=0.72)
    cheeks(m, body, body_pivot, 12, -32, size=0.6)
    mouth(m, body, body_pivot, -35, kind="wide", width=0.9)
    chest_mark(m, body, body_pivot, -42, shade(LEAF, 20), size=0.5)
    m.pivot("seat", P(0, -4, -24), body_pivot)
    return m
