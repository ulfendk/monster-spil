"""
Flodtrold — a river troll: big, dark green and mossy, a pale green-blue belly, a big nose, two
tusks, long arms, a tuft of reeds with brown cattails growing from its head, darker patches and
moss on its shoulders. Sizes in px of the picture box (x right, f towards the viewer, z up); it
stomps (and can be ridden).
"""
import random

from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import troll
from lib.sdf import PX, Sculpt

BODY = shade(K["autumnGreen"], -12)


def build():
    m = Model("flodtrold")
    s, body_pivot = troll(m, BODY, K["waveAqua2"])
    rnd = random.Random(2)
    for _ in range(6):
        s.ball(S(rnd.uniform(-18, 18), rnd.uniform(-16, -4), rnd.uniform(-38, -18)), rnd.uniform(3, 5), op="paint", colour=shade(BODY, -12), only=BODY)
    for side in (-1, 1):
        s.ellipsoid(S(side * 14, -4, -18), (8, 8, 4), k=2, colour=K["autumnGreen"])  # moss on the shoulders
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)
    top, _ = m.surface(body, 0, 3, down=True)
    t = top / PX
    reeds = m.pivot("reeds", top, body_pivot)
    reeds["sway"] = 1
    r = Sculpt(K["autumnGreen"])
    for i, (dx, df, h) in enumerate(((-4, 1, 16), (0, -1, 21), (4, 1, 17), (-7, -2, 12), (7, -2, 13))):
        tip = t + Vector((dx * 1.4, -df, h))
        r.round_cone(t + Vector((dx * 0.5, -df, -2)), tip, 1.2, 0.8, k=0.5)
        if i < 3:
            r.round_cone(tip - Vector((0, 0, 5)), tip - Vector((0, 0, 1)), 1.9, 1.9, colour=K["boatYellow1"], k=0.4)
    m.part(r, "reeds_mesh", reeds, voxel=0.25, budget=700)
    eyes(m, body, body_pivot, 7, -4, size=0.72)
    mouth(m, body, body_pivot, -20, kind="tusks", width=0.8)
    chest_mark(m, body, body_pivot, -32, shade(K["waveAqua2"], 18), size=0.6)
    m.pivot("seat", P(0, -6, 2), body_pivot)
    return m
