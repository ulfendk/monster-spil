"""
Lygtemand — a will-o'-the-wisp: a floating flame of a spirit, orange with a yellow glow in its
belly and tongues of fire licking up its sides, glowing eyes and a grin, holding out a red
paper lantern that sways as it bobs along. At stage 2 (Lygtetrold) its flames are bigger.
Sizes in px of the picture box (x right, f towards the viewer, z up); it floats.
"""
import math

from mathutils import Vector

from lib.features import chest_mark, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.sdf import PX, Sculpt

BODY = K["surimiOrange"]
GLOW = K["carpYellow"]


def build():
    m = Model("lygtemand")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -33), (18, 16, 16), k=0)
    # Drawn up into tongues of fire: a tall one in the middle, others leaning out, red at the tips.
    for x, f, z_top, lean, r in ((0, -2, 10, 3, 9), (-9, 0, -4, -8, 6), (9, 0, -6, 8, 6), (-4, -8, 2, -4, 5.5), (5, -8, 0, 6, 5.5)):
        base = S(x * 0.6, f * 0.5, -26)
        tip = S(x + lean, f - 2, z_top)
        s.chain([base, (base + tip) / 2 + Vector((0, 0, 2)), tip], [r * 1.6, r, 0.8], k=5)
        s.ellipsoid(tip + Vector((0, 0, -3)), (4.5, 4.5, 6), op="paint", colour=K["autumnRed"], k=2.5)
    s.ellipsoid(S(0, 10, -34), (11, 9, 12), op="paint", colour=GLOW, k=4)
    s.ellipsoid(S(0, -2, -48), (13, 11, 6), k=4)  # a wisp of a base
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    tongues = m.pivot("tongues", S(0, 0, -30) * PX, body_pivot)
    tongues["stageScale"] = 0.3
    for i, (side, z, h) in enumerate(((-1, -38, 11), (1, -36, 12))):
        flame(m, S(side * 16, -2, z), tongues, f"tongue_{i}", height=h, width=3.8, lean=S(side * 0.7, -0.2, 1))

    # An arm holding out a stick, a paper lantern hanging from it, swaying.
    a = Sculpt(BODY)
    hand = S(20, 10, -34)
    a.round_cone(S(14, 4, -32), hand, 4, 3.4, k=1.5)
    m.part(a, "arm", body_pivot, voxel=0.35, budget=400)
    stick = Sculpt(K["boatYellow1"])
    end = S(26, 18, -24)
    stick.round_cone(hand, end, 1.2, 1, k=0.4)
    m.part(stick, "stick", body_pivot, voxel=0.25, budget=200, outline=False)
    lantern = m.pivot("lantern", end * PX, body_pivot)
    lantern["sway"] = 2
    l = Sculpt(K["autumnRed"])
    c = end + Vector((0, 0, -12))
    l.round_cone(end, end + Vector((0, 0, -4)), 0.5, 0.5, colour=INK)
    l.ellipsoid(c, (6, 6, 7.5), k=0)
    for z in (-6, 6):
        l.round_cone(c + Vector((0, 0, z)), c + Vector((0, 0, z * 1.2)), 3.4, 3.4, k=0.4, colour=K["sumiInk4"])
    for i in range(4):
        ang = i / 4 * math.tau
        l.ellipsoid(c + Vector((math.cos(ang) * 5.2, math.sin(ang) * 5.2, 0)), (1.6, 1.6, 4.5), op="paint", colour=GLOW, k=0.8)
    m.part(l, "lantern_mesh", lantern, voxel=0.3, budget=900)

    eyes(m, body, body_pivot, 7, -29, size=0.9, kind="dot")
    mouth(m, body, body_pivot, -39, kind="grin", width=0.8, glow=K["autumnRed"])
    chest_mark(m, body, body_pivot, -44, shade(GLOW, 10), size=0.5)
    m.pivot("seat", P(0, -6, -8), body_pivot)
    return m
