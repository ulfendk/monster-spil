"""
Istap — an ice spirit: a floating cluster of pale blue ice crystals, the big one in the middle
with a kawaii face, smaller ones leaning out round it. At stage 2 (Isspyd) more crystals grow.
Sizes in px of the picture box (x right, f towards the viewer, z up); it floats.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

ICE = shade(K["springBlue"], 12)
DEEP = K["crystalBlue"]


def crystal(s, base, axis, length, radius, colour=None):
    """A six-sided crystal from `base` along `axis`, a point at its end."""
    axis = axis.normalized()
    side = Vector((1, 0, 0)).cross(axis)
    side = side.normalized() if side.length > 0.1 else Vector((0, 1, 0))
    up = axis.cross(side).normalized()
    hexagon = [(math.cos(i / 6 * math.tau) * radius, math.sin(i / 6 * math.tau) * radius) for i in range(6)]
    s.slab(base + axis * length * 0.35, frame(side, up, axis), hexagon, length * 0.7, rounding=0.8, colour=colour, k=1)
    s.round_cone(base + axis * length * 0.68, base + axis * length, radius * 0.92, 0.5, colour=colour, k=0.8)


def build():
    m = Model("istap")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(ICE)
    crystal(s, S(0, 0, -46), Vector((0, 0, 1)), 44, 13)
    s.ellipsoid(S(0, 8, -30), (9, 6, 12), op="paint", colour=mix(ICE, K["washi"], 0.5), k=4)
    body = m.part(s, "body_mesh", body_pivot, budget=3500, stage_shade=True)
    c = Sculpt(DEEP)
    for ang, tilt, length, r in ((-1.2, 0.6, 26, 6), (1.3, 0.55, 24, 5.5), (2.6, 0.5, 20, 5), (-2.5, 0.6, 18, 4.5)):
        d = Vector((math.sin(ang) * tilt, -math.cos(ang) * tilt * 0.6, 1)).normalized()
        crystal(c, S(math.sin(ang) * 6, math.cos(ang) * 4, -44), d, length, r)
    m.part(c, "crystals", body_pivot, voxel=0.4, budget=2000)
    c2 = Sculpt(mix(DEEP, K["washi"], 0.3))
    for ang, tilt, length, r in ((-0.6, 0.9, 16, 4), (0.7, 0.9, 15, 4), (3.1, 0.8, 16, 4.2)):
        d = Vector((math.sin(ang) * tilt, -math.cos(ang) * tilt * 0.6, 1)).normalized()
        crystal(c2, S(math.sin(ang) * 10, math.cos(ang) * 6, -46), d, length, r)
    m.part(c2, "crystals_more", body_pivot, voxel=0.35, budget=1200, stages=(2, 3))
    eyes(m, body, body_pivot, 5.5, -26, size=0.7)
    cheeks(m, body, body_pivot, 9, -31, size=0.5)
    mouth(m, body, body_pivot, -33, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -39, mix(DEEP, K["washi"], 0.5), size=0.45)
    m.pivot("seat", P(0, -4, -2), body_pivot)
    return m
