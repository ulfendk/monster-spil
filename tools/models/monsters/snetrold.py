"""
Snetrold — a snow troll: big and white with shaggy fur, a pale blue belly, a big nose, two
tusks, two stubby horns, long arms with icicles hanging off them. At stage 2 (Iskæmpe) its
horns are bigger. Sizes in px of the picture box (x right, f towards the viewer, z up); it
stomps (and can be ridden).
"""
import math

from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import troll
from lib.sdf import PX, Sculpt

BODY = K["washi"]
BELLY = shade(K["springBlue"], 20)
ICE = mix(K["springBlue"], K["washi"], 0.45)


def build():
    m = Model("snetrold")
    s, body_pivot = troll(m, BODY, BELLY, nose=K["sakuraPink"])
    # Shaggy: tufts hanging round the sides and back.
    for row, z in enumerate((-22, -31, -40)):
        for i in range(10):
            a = (i + row * 0.5) / 10 * math.tau
            if math.cos(a) > 0.6:
                continue
            p = S(math.sin(a) * 20.5, math.cos(a) * 16.5, z)
            s.round_cone(p, p + S(math.sin(a) * 3, math.cos(a) * 3, -7), 3.2, 0.8, k=1.5)
    body = m.part(s, "body_mesh", body_pivot, budget=5500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        root = S(side * 8, 4, 2)
        horn = m.pivot(f"horn_{lr}", root * PX, body_pivot)
        horn["stageScale"] = 0.4
        h = Sculpt(K["fujiGray"])
        h.round_cone(root - Vector((0, 0, 2)), root + S(side * 2.5, -1, 6), 3.4, 1.4, k=0.6)
        m.part(h, f"horn_{lr}_mesh", horn, voxel=0.3, budget=300)
    ic = Sculpt(ICE)
    for side in (-1, 1):
        for j, df in enumerate((-2, 2, 6)):
            top = S(side * (23 + j), df, -30 - j * 2)
            ic.round_cone(top, top - Vector((0, 0, 7 - j)), 1.8, 0.3, k=0.5)
    m.part(ic, "icicles", body_pivot, voxel=0.25, budget=500, opacity=0.9)
    eyes(m, body, body_pivot, 7, -4, size=0.72)
    mouth(m, body, body_pivot, -20, kind="tusks", width=0.8)
    chest_mark(m, body, body_pivot, -32, shade(K["springBlue"], 10), size=0.6)
    m.pivot("seat", P(0, -6, 2), body_pivot)
    return m
