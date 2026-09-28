"""
Grottefisk — a blind cave fish: pale as a cave, a big head with milky eyes and a mouth of
teeth, pink fins, and a lure on a stalk from its brow with a glowing bulb at the end. At stage
2 (Grottehaj) its fins are bigger. Sizes in px of the picture box (x right, f towards the
viewer, z up); it swims.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import fish_tail, side_fins, slab_fin
from lib.sdf import PX, Sculpt

BODY = K["fujiWhite"]
FIN = K["sakuraPink"]


def build():
    m = Model("grottefisk")
    m.root["gait"] = "swim"
    m.root["hover"] = 1
    m.root["view"] = -1.05
    body_pivot = m.pivot("body", P(0, 0, -44))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 6, -26), (14, 16, 14), k=0)  # the big head
    s.chain([S(0, -4, -26), S(0, -16, -26), S(0, -24, -26)], [12, 8, 3.5], k=5)
    s.ellipsoid(S(0, 4, -34), (10, 14, 5), op="paint", colour=K["washi"], k=3)
    slab_fin(s, S(0, -8, -15), [(-3, 0), (5, 0), (0, 7), (-9, 5)], colour=FIN)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    fish_tail(m, body_pivot, S(0, -24, -26), FIN, size=0.9, forked=False)
    side_fins(m, body_pivot, 12, 6, -31, FIN, size=0.9)

    # The lure: a stalk from the brow, bending forward, a glowing bulb.
    lure = m.pivot("lure", S(0, 8, -12) * PX, body_pivot)
    lure["sway"] = 1
    l = Sculpt(shade(BODY, -10))
    l.chain([S(0, 8, -13), S(0, 11, -2), S(0, 19, 2), S(0, 25, -2)], [1.6, 1.3, 1.1, 0.9], k=0.6)
    m.part(l, "lure_stalk", lure, voxel=0.25, budget=400)
    g = Sculpt(K["carpYellow"])
    g.ball(S(0, 25, -5), 3.6)
    m.part(g, "lure_bulb", lure, voxel=0.25, budget=300, role="flat")

    eyes(m, body, body_pivot, 7, -24, size=0.7, kind="blind")
    mouth(m, body, body_pivot, -32, kind="grin", width=0.9)
    chest_mark(m, body, body_pivot, -36, shade(FIN, 10), size=0.5)
    m.pivot("seat", P(0, -2, -12), body_pivot)
    return m
