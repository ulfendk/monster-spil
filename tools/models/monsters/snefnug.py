"""
Snefnug — a snowflake spirit: a round white face in the middle of a big six-armed snowflake of
pale blue ice, slowly turning, floating. At stage 2 (Snestorm) the flake is bigger, and at
stage 3 (Isdronning) it wears the crown. Sizes in px of the picture box (x right, f towards
the viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

FACE = K["washi"]
ICE = mix(K["springBlue"], K["washi"], 0.3)


def build():
    m = Model("snefnug")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    centre = S(0, 0, -22)
    s = Sculpt(FACE)
    s.ellipsoid(centre, (13, 8, 13), k=0)
    body = m.part(s, "body_mesh", body_pivot, budget=2500)
    flake = m.pivot("flake", centre * PX, body_pivot)
    flake["spin"] = 0.3
    flake["stageScale"] = 0.25
    f = Sculpt(ICE)
    for i in range(6):
        a = i / 6 * math.tau
        d = Vector((math.cos(a), 0, math.sin(a)))
        n = Vector((-math.sin(a), 0, math.cos(a)))
        f.round_cone(centre - Vector((0, -2, 0)) + d * 10, centre + d * 32, 2.6, 1.6, k=1)
        for t, blen in ((0.5, 9), (0.75, 6)):
            at = centre + d * (10 + 22 * t)
            for sgn in (-1, 1):
                f.round_cone(at, at + (d * 0.6 + n * sgn).normalized() * blen, 1.6, 0.9, k=0.6)
        f.ball(centre + d * 33, 2.2, k=0.6, colour=K["springBlue"])
    m.part(f, "flake_mesh", flake, voxel=0.3, budget=2500)
    eyes(m, body, body_pivot, 5.5, -19, size=0.65)
    cheeks(m, body, body_pivot, 8, -24, size=0.45)
    mouth(m, body, body_pivot, -27, kind="smile", width=0.4)
    top, _ = m.surface(body, 0, 0, down=True)
    crown(m, top / PX, body_pivot, radius=5)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
