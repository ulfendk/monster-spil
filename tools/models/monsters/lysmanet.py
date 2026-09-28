"""
Lysmanet — a light jellyfish: a round violet bell with a paler rim and a kawaii face, long pink
and violet tentacles swaying under it, glowing, floating. At stage 2 (Lysgople) its tentacles are
longer. Sizes in px of the picture box (x right, f towards the viewer, z up).
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

BELL = shade(K["oniViolet"], 10)
PINK = K["sakuraPink"]


def build():
    m = Model("lysmanet")
    m.root["gait"] = "drift"
    m.root["hover"] = 1
    body_pivot = m.pivot("body", P(0, 0, -50))
    s = Sculpt(BELL)
    s.ellipsoid(S(0, 0, -16), (22, 20, 18), k=0)
    s.ellipsoid(S(0, 0, -30), (23, 21, 8), op="sub", k=2)
    s.ellipsoid(S(0, 0, -23), (22.5, 20.5, 2.5), op="paint", colour=mix(BELL, K["washi"], 0.4), k=1)
    body = m.part(s, "body_mesh", body_pivot, budget=3500, stage_shade=True)
    for i in range(7):
        a = i / 7 * math.tau
        root = S(math.cos(a) * 13, math.sin(a) * 11, -22)
        pivot = m.pivot(f"tentacle_{i}", root * PX, body_pivot)
        pivot["sway"] = 1.5
        pivot["stageScale"] = 0.25
        t = Sculpt(PINK if i % 2 else mix(BELL, PINK, 0.4))
        pts = [root + Vector((math.sin(j * 1.3 + i) * 2.5, 0, -j * 7)) for j in range(5)]
        t.chain(pts, [2.2, 1.9, 1.6, 1.2, 0.7], k=0.8)
        m.part(t, f"tentacle_{i}_mesh", pivot, voxel=0.3, budget=400)
    eyes(m, body, body_pivot, 7, -16, size=0.78)
    cheeks(m, body, body_pivot, 11.5, -21, size=0.6)
    mouth(m, body, body_pivot, -22, kind="smile", width=0.45)
    m.pivot("seat", P(0, -4, 4), body_pivot)
    return m
