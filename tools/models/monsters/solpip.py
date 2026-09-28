"""
Solpip — a sun chick: a round golden ball of a bird with a pale breast, a little orange beak,
big eyes, stubby wings, a fan of a tail, orange legs, and a sun of rays standing round the
back of its head. The rays grow at stage 2 (Solfugl) and 3 (Solfønix), which wears the crown.
Sizes in px of the picture box (x right, f towards the viewer, z up); its legs swing from the
hip.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import FEET_Z, bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["carpYellow"]
BELLY = K["washi"]
RAY = K["surimiOrange"]


def build():
    m = Model("solpip")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -27), (20, 18.5, 20), k=0)
    s.ellipsoid(S(0, 11, -34), (12, 8, 11), op="paint", colour=BELLY, k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    b = Sculpt(RAY)
    b.round_cone(S(0, 17, -24), S(0, 23, -26), 3.2, 0.7, k=0.8)
    m.part(b, "beak", body_pivot, voxel=0.3, budget=400)

    # The sun: rays in a ring round the back of the head, a little tilted back.
    sun_c = S(0, -6, -18)
    sun = m.pivot("sun", sun_c * PX, body_pivot)
    sun["stageScale"] = 0.3
    r = Sculpt(RAY)
    tilt = Matrix.Rotation(-0.35, 3, Vector((1, 0, 0)))
    for i in range(11):
        a = -math.pi * 0.08 + i / 10 * math.pi * 1.16
        d = tilt @ Vector((math.cos(a), 0, math.sin(a)))
        r.round_cone(sun_c + d * 17, sun_c + d * 26, 3.6, 0.5, k=0.6, colour=RAY if i % 2 else K["carpYellow"])
    m.part(r, "sun_mesh", sun, voxel=0.35, budget=1200)

    tail = m.pivot("tail", S(0, -17, -30) * PX, body_pivot)
    t = Sculpt(shade(BODY, -10))
    for dx in (-5, 0, 5):
        t.round_cone(S(dx * 0.4, -16, -30), S(dx, -25, -24), 3.2, 1.6, k=1)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=500, stage_shade=True)

    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 17, 2, -26), shade(BODY, -8), tip=RAY, length=18, height=15)
    bird_legs(m, RAY, 7, 2, -44)

    eyes(m, body, body_pivot, 8, -19, size=0.9)
    cheeks(m, body, body_pivot, 13, -26, size=0.75)
    mouth(m, body, body_pivot, -30, kind="none")
    chest_mark(m, body, body_pivot, -38, shade(RAY, 10), size=0.6)
    top, _ = m.surface(body, 0, 4, down=True)
    crown(m, top / PX, body_pivot, radius=6.5)
    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
