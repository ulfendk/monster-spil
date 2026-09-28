"""
Dryppel — a water drop, one of the three starters: plump at the bottom, drawn up to a tip
that bends back a little, deeper blue towards the tip, a pale belly, a shine on its side,
little flipper feet and nub arms. At stage 2 (Bølgedryp) a curling wave rises on its back,
bigger at stage 3 (Storbølge), which also wears the crown. Sizes in px of the 128-px picture
box: x right, f towards the viewer, z up from the box's middle; its feet stand 12 px above
the bottom.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["springBlue"]
DEEP = mix(K["springBlue"], K["crystalBlue"], 0.6)
BELLY = K["washi"]
FEET_Z = -52


def build():
    m = Model("dryppel")
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))

    # ---- the drop: round below, drawn up to a tip that leans back.
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 1, -32), (27, 25, 21), k=0)
    s.chain([S(0, 1, -28), S(0, 0, -8), S(0, -3, 8), S(0, -8, 20)], [22, 15, 6.5, 1.6], k=7)
    s.ellipsoid(S(0, -6, 12), (12, 12, 14), op="paint", colour=DEEP, k=6)
    s.ellipsoid(S(0, 20, -38), (17, 10, 12), op="paint", colour=BELLY, k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    # A shine down its left side (flat, see-through).
    at, n = m.surface(body, -15, -16)
    right, up, out = m.tangent_frame(n, roll=-0.35)
    sh = Sculpt(K["washi"])
    p = at / PX
    sh.chain([p + up * 9 + out * 0.6, p + out * 0.9, p - up * 7 + out * 0.6], [1.4, 2.2, 1.2])
    sh.ball(p + up * 13 + out * 0.6, 1.5)
    m.part(sh, "shine", body_pivot, voxel=0.3, budget=300, role="flat", opacity=0.75, smooth=0)

    # ---- flipper feet and nub arms.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        foot = m.pivot(f"foot_{lr}", P(side * 12, 12, FEET_Z), m.root)
        f = Sculpt(DEEP)
        f.ellipsoid(S(side * 12, 15, -49), (8, 10, 4), k=0)
        m.part(f, f"foot_{lr}_mesh", foot, voxel=0.4, budget=350, stage_shade=True)
        arm = m.pivot(f"arm_{lr}", P(side * 24, 4, -28), body_pivot)
        a = Sculpt(BODY)
        a.round_cone(S(side * 23, 4, -28), S(side * 29, 9, -35), 5, 4, k=2)
        m.part(a, f"arm_{lr}_mesh", arm, voxel=0.4, budget=350, stage_shade=True)

    # ---- stage 2 and 3: a wave curling up its back, white crest on top.
    wave = m.pivot("wave", P(0, -20, -22), body_pivot)
    wave["stageScale"] = 0.3
    w = Sculpt(DEEP)
    curl = [S(0, -20, -24), S(0, -27, -12), S(0, -26, 0), S(0, -20, 7), S(0, -14, 6), S(0, -13, 1)]
    w.chain(curl, [9, 8, 6.5, 5, 3.5, 2.2], k=3)
    w.ellipsoid(S(0, -21, 5), (7, 7, 5), op="paint", colour=BELLY, k=2)
    for side in (-1, 1):
        w.round_cone(S(side * 6, -24, -18), S(side * 11, -27, -6), 4.5, 1.5, k=2)
    m.part(w, "wave_mesh", wave, voxel=0.4, budget=1000, stages=(2, 3), stage_shade=True)

    # ---- the face, chest mark and crown.
    eyes(m, body, body_pivot, 10, -24, size=0.95)
    cheeks(m, body, body_pivot, 18, -31)
    mouth(m, body, body_pivot, -33, kind="smile", width=0.8)
    chest_mark(m, body, body_pivot, -45, shade(K["crystalBlue"], 18), size=0.7)
    top, _ = m.surface(body, 0, 1, down=True)
    crown(m, top / PX + Vector((0, 0, -6)), body_pivot, radius=6.5)

    m.pivot("seat", P(0, -4, -8), body_pivot)
    return m
