"""
Barkbille — a bark beetle: a brown beetle with wing cases of bark (grooved, moss on them), a
great forked horn on its head, a kawaii face and a smile, six legs. At stage 2 (Barkkriger) its
horn is bigger. Sizes in px of the picture box (x right, f towards the viewer, z up); it
skitters.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
DARK = shade(BODY, -18)
MOSS = K["autumnGreen"]


def build():
    m = Model("barkbille")
    m.root["gait"] = "skitter"
    m.root["hips"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 14, -34), (11, 9, 9), k=0)  # the head
    s.ellipsoid(S(0, -6, -32), (17, 19, 12), k=2, colour=DARK)  # the wing cases
    s.round_cone(S(0, 13, -32), S(0, -25, -30), 0.9, 0.9, op="paint", colour=shade(DARK, -12))  # the seam
    for x in (-9, -4, 4, 9):
        s.round_cone(S(x, 8, -22), S(x * 1.1, -22, -26), 0.8, 0.8, op="paint", colour=shade(DARK, -10))  # bark grooves
    for x, f in ((-8, -10), (7, -4), (0, -18)):
        s.ellipsoid(S(x, f, -20), (5, 5, 3), op="paint", colour=MOSS, k=1.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    horn = m.pivot("horn", S(0, 20, -30) * PX, body_pivot)
    horn["stageScale"] = 0.35
    h = Sculpt(DARK)
    h.chain([S(0, 20, -30), S(0, 26, -22), S(0, 28, -12)], [3, 2.4, 1.8], k=1)
    for side in (-1, 1):
        h.round_cone(S(0, 28, -13), S(side * 4, 29, -7), 1.6, 0.6, k=0.5)
    m.part(h, "horn_mesh", horn, voxel=0.3, budget=500)
    for i, (side, f, lean) in enumerate(((-1, 10, 5), (1, 10, 5), (1, 0, 0), (-1, 0, 0), (-1, -10, -5), (1, -10, -5))):
        hip = S(side * 12, f, -38)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        l = Sculpt(DARK)
        l.chain([hip, S(side * 19, f + lean * 0.6, -34), S(side * 22, f + lean * 1.4, -51)], [2.2, 1.8, 1.2], k=0.6)
        m.part(l, f"leg_{i}", leg, voxel=0.3, budget=350)
    eyes(m, body, body_pivot, 5, -32, size=0.62)
    cheeks(m, body, body_pivot, 8, -36, size=0.45)
    mouth(m, body, body_pivot, -38, kind="smile", width=0.4)
    chest_mark(m, body, body_pivot, -40, shade(MOSS, 25), size=0.4)
    m.pivot("seat", P(0, -6, -20), body_pivot)
    return m
