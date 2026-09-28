"""
Sivsnog — a grass snake: green with a yellow belly and a bright yellow collar behind its head,
its head raised with a kawaii face, its body lying in a gentle S behind it, tapering to the
tail. The body is a string of segments on the joints of its spine, so it slithers. At stage 2
(Sivslange) it's longer. Sizes in px of the picture box (x right, f towards the viewer, z up).
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

BODY = K["autumnGreen"]
BELLY = K["carpYellow"]


def build():
    m = Model("sivsnog")
    m.root["gait"] = "slither"
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, -52))
    head = m.pivot("head", S(0, 16, -26) * PX, body_pivot)
    h = Sculpt(BODY)
    h.ellipsoid(S(0, 16, -26), (10.5, 12, 9.5), k=0)
    h.ellipsoid(S(0, 21, -31), (7.5, 8, 4), op="paint", colour=BELLY, k=2)
    hm = m.part(h, "head_mesh", head, budget=2500, stage_shade=True)
    joints = [(0, 10, -38, 7.5), (2, 2, -45, 7.5), (0, -7, -47, 7.2), (-6, -14, -47.5, 6.6), (-11, -21, -48, 5.8), (-12, -29, -48.5, 5), (-8, -36, -49, 4), (-2, -40, -49.5, 2.8)]
    for i, (x, f, z, r) in enumerate(joints):
        seg = m.pivot(f"spine_{i}", S(x, f, z) * PX, body_pivot)
        s = Sculpt(BODY)
        s.ellipsoid(S(x, f, z), (r, r * 1.05, r * 0.95), k=0)
        s.ellipsoid(S(x, f, z - r * 0.55), (r * 0.8, r, r * 0.45), op="paint", colour=BELLY, k=1.2)
        if i == 0:
            s.ellipsoid(S(x, f, z), (r + 1, 3, r + 1), op="paint", colour=BELLY, k=1)  # the collar
        m.part(s, f"segment_{i}", seg, voxel=0.4, budget=700, stage_shade=True, stages=(2, 3) if i == len(joints) - 1 else (1, 3))
    eyes(m, hm, head, 5.5, -23, size=0.72)
    cheeks(m, hm, head, 8.5, -28, size=0.5)
    mouth(m, hm, head, -30, kind="smile", width=0.45)
    chest_mark(m, hm, head, -32, shade(BELLY, 10), size=0.4)
    m.pivot("seat", P(0, 2, -30), body_pivot)
    return m
