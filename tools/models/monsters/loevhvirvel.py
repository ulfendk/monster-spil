"""
Løvhvirvel — a leaf whirl: a floating spirit of green leaves spinning round a round green face
with a grin, the leaves in two rings going round it. Sizes in px of the picture box (x right,
f towards the viewer, z up); it floats.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["springGreen"]
LEAF = K["autumnGreen"]


def build():
    m = Model("loevhvirvel")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    centre = S(0, 0, -24)
    s = Sculpt(BODY)
    s.ellipsoid(centre, (14, 13, 14), k=0)
    s.chain([centre + Vector((0, 0, 10)), centre + Vector((4, 2, 18)), centre + Vector((9, 4, 21)), centre + Vector((12, 3, 18))], [6, 3.5, 2, 1], k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=3500)
    for ring, (radius, tilt, speed, count) in enumerate(((21, 0.35, 1.2, 7), (26, -0.5, -0.8, 6))):
        pivot = m.pivot(f"ring_{ring}", centre * PX, body_pivot)
        pivot["spin"] = speed
        lf = Sculpt(LEAF if ring else mix(LEAF, BODY, 0.5))
        R = Matrix.Rotation(tilt, 3, Vector((1, 0, 0)))
        for i in range(count):
            a = i / count * math.tau
            # (The ring lies in the picture's plane, tilted: its pivot turns about the viewer's axis.)
            p = centre + R @ Vector((math.cos(a) * radius, 0, math.sin(a) * radius))
            along = R @ Vector((-math.sin(a), 0, math.cos(a)))
            lf.ellipsoid(p, (5.5, 1.4, 2.8), frame(along, Vector((0, 1, 0)), along.cross(Vector((0, 1, 0)))), k=0.6)
        m.part(lf, f"ring_{ring}_mesh", pivot, voxel=0.3, budget=1200)
    eyes(m, body, body_pivot, 6, -21, size=0.72)
    cheeks(m, body, body_pivot, 9.5, -26, size=0.55)
    mouth(m, body, body_pivot, -29, kind="grin", width=0.55)
    m.pivot("seat", P(0, -4, -6), body_pivot)
    return m
