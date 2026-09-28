"""
Vindpust — a gust of wind: a white swirl of a cloud with a kawaii face and a grin, curling off
into a zigzag lightning tail, sparks flying off it, floating. At stage 2 (Vindhvirvel) and 3
(Stormånd) its tail is bigger; 3 wears the crown. Sizes in px of the picture box (x right, f
towards the viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["washi"]
BOLT = K["carpYellow"]


def build():
    m = Model("vindpust")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -48))
    s = Sculpt(BODY)
    for x, f, z, r in ((0, 0, -24, 15), (-12, 1, -28, 10), (12, 1, -27, 10.5), (-6, -2, -14, 10), (7, -2, -13, 10)):
        s.ball(S(x, f, z), r, k=4)
    # A curl of wind trailing off to one side.
    pts = [S(16 + 6 * math.sin(t), -2, -30 + 8 * math.cos(t) - t * 2) for t in (0, 0.9, 1.8, 2.7)]
    s.chain(pts, [7, 5, 3.5, 2], k=3)
    s.ellipsoid(S(0, 4, -32), (12, 8, 6), op="paint", colour=mix(BODY, K["springBlue"], 0.2), k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4000)
    tail = m.pivot("tail", S(-12, 0, -34) * PX, body_pivot)
    tail["stageScale"] = 0.3
    t = Sculpt(BOLT)
    bolt = [(0, 0), (4, 0), (1, -8), (7, -8), (-3, -24), (-0.5, -12), (-5, -12)]
    t.slab(S(-14, 0, -34), frame(Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, -1, 0))), bolt, 2.4, rounding=0.8)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=500, role="flat")
    eyes(m, body, body_pivot, 6.5, -22, size=0.75)
    cheeks(m, body, body_pivot, 10.5, -28, size=0.6)
    mouth(m, body, body_pivot, -30, kind="grin", width=0.55)
    top, _ = m.surface(body, 0, 0, down=True)
    crown(m, top / PX, body_pivot, radius=5.5)
    m.pivot("seat", P(0, -4, -4), body_pivot)
    return m
