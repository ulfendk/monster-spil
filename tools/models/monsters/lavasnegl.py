"""
Lavasnegl — a lava snail: a glowing orange body sliding on its long foot, a head reaching up
with eyes on stalks, and on its back a dark spiral shell with lava glowing in the groove.
Steam drifts off it. At stage 2 (Lavaskjold) its shell is bigger and grows spikes. Sizes in
px of the picture box (x right, f towards the viewer, z up); seen more from the side.
"""
import math

from mathutils import Vector

from lib.features import chest_mark, mouth
from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.parts import FEET_Z
from lib.sdf import PX, Sculpt, frame

BODY = K["surimiOrange"]
SHELL = K["sumiInk5"]
GLOW = K["samuraiRed"]


def build():
    m = Model("lavasnegl")
    m.root["gait"] = "glide"
    m.root["view"] = -0.95
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.chain([S(0, -32, -49), S(0, -16, -46), S(0, 4, -45), S(0, 14, -42)], [3, 7, 8.5, 8], k=4)
    s.round_cone(S(0, 14, -44), S(0, 19, -27), 9, 8, k=5)  # the head, reaching up
    s.ellipsoid(S(0, 0, -50), (9, 30, 3), op="paint", colour=shade(BODY, -12), k=2)  # the sole
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)

    # Eyes on stalks: pale balls with ink pupils; shut, the pupils go.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        st = Sculpt(BODY)
        tip = S(side * 6, 22, -10)
        st.round_cone(S(side * 3, 19, -21), tip, 2.2, 1.6, k=1)
        st.ball(tip + Vector((0, 0, 2.5)), 4, k=1, colour=K["washi"])
        m.part(st, f"stalk_{lr}", body_pivot, voxel=0.3, budget=500, stage_shade=True)
        e = Sculpt(INK)
        e.ball(tip + Vector((0, -3.4, 2.8)), 1.9)
        e.ball(tip + Vector((side * 0.6, -4.8, 3.6)), 0.7, colour=K["washi"])
        m.part(e, f"eye_{lr}", body_pivot, voxel=0.2, budget=200, role="flat", face="open", smooth=0)
        l = Sculpt(INK)
        l.round_cone(tip + Vector((-1.8, -3.9, 2.5)), tip + Vector((1.8, -3.9, 2.5)), 0.7, 0.7)
        m.part(l, f"lid_{lr}", body_pivot, voxel=0.2, budget=120, role="flat", face="shut", smooth=0)

    # The shell: a spiral standing up like a wheel, lava in its groove; bigger with spikes at stage 2.
    centre = S(0, -14, -21)
    shell = m.pivot("shell", centre * PX, body_pivot)
    shell["stageScale"] = 0.2
    sh = Sculpt(SHELL)
    pts, radii = [], []
    for i in range(34):
        a = i / 34 * math.tau * 2.1
        r = 21 * math.exp(-0.2 * a)
        pts.append(centre + Vector((0, -math.cos(a) * r, math.sin(a) * r)))
        radii.append(max(2.8, 10 * math.exp(-0.2 * a)))
    sh.chain(pts, radii, k=1)
    for side in (-1, 1):
        groove = [p + Vector((side * r * 0.95, 0, 0)) for p, r in zip(pts, radii)]
        for a, b in zip(groove, groove[1:]):
            sh.round_cone(a, b, 3.2, 3.2, op="paint", colour=K["surimiOrange"])
    m.part(sh, "shell_mesh", shell, voxel=0.4, budget=3000)
    sp = Sculpt(SHELL)
    for i in range(5):
        a = (i + 0.5) / 5 * math.pi
        base = centre + Vector((0, -math.cos(a) * 24, math.sin(a) * 24))
        sp.round_cone(base, base + Vector((0, -math.cos(a) * 7, math.sin(a) * 7)), 3, 0.5, k=1, colour=shade(SHELL, -6))
    m.part(sp, "spikes", shell, voxel=0.35, budget=500, stages=(2, 3))

    mouth(m, body, body_pivot, -36, kind="smile", width=0.6)
    chest_mark(m, body, body_pivot, -42, shade(GLOW, 10), size=0.5)
    m.pivot("seat", P(0, -8, -4), body_pivot)
    return m
