"""
Ekkoflagre — an echo bat: a round violet bat with a paler belly, huge pointed ears, a smile with
a little fang, two bat wings, sparks flying off it. At stage 2 (Ekkoflagermus) its wings and ears
are bigger. Sizes in px of the picture box (x right, f towards the viewer, z up); it flies.
"""
from mathutils import Euler, Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import feet2
from lib.sdf import PX, Sculpt, frame

BODY = shade(K["oniViolet"], -10)
BELLY = shade(K["oniViolet"], 15)


def build():
    m = Model("ekkoflagre")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 0, -30), (20, 18, 19), k=0)
    s.ellipsoid(S(0, 13, -38), (11, 7, 9), op="paint", colour=BELLY, k=2.5)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 11, 0, -16)
        ear = m.pivot(f"ear_{lr}", base * PX, body_pivot)
        ear["stageScale"] = 0.25
        up = S(side * 0.45, -0.1, 1).normalized()
        out = S(side * 0.2, 1, 0).normalized()
        F = frame(up.cross(out).normalized() * -side, up, out)
        e = Sculpt(BODY)
        e.slab(base, F, [(-6, 0), (6, 0), (1, 20)], 3.2, rounding=1.3)
        e.slab(base + out * 1.4, F, [(-3.8, 2), (3.8, 2), (0.6, 15)], 1.4, rounding=0.5, colour=K["sakuraPink"])
        m.part(e, f"ear_{lr}_mesh", ear, voxel=0.3, budget=500, stage_shade=True)
        rest = Euler((0, -side * 0.1, side * 0.4), "XYZ")
        shoulder = S(side * 16, -4, -26)
        wp = m.pivot(f"wing_{lr}", shoulder * PX, body_pivot, rotation=rest)
        wp["stageScale"] = 0.25
        R = rest.to_matrix()
        u, v, w = R @ Vector((side, 0, 0)), R @ Vector((0, 0, 1)), R @ Vector((0, 1, 0))
        wg = Sculpt(shade(BODY, -14))
        pts = [(0, 3), (12, 14), (30, 18), (26, 8), (32, 1), (22, -1), (20, -10), (8, -6)]
        wg.slab(shoulder, frame(u, v, w), pts, 2, rounding=0.8)
        for tip in ((30, 18), (32, 1), (20, -10)):
            a = shoulder + u * 11 + v * 12
            wg.round_cone(a, shoulder + u * tip[0] + v * tip[1], 1.1, 0.6, k=0.4, colour=shade(BODY, -26))
        m.part(wg, f"wing_{lr}_mesh", wp, voxel=0.35, budget=700)
    feet2(m, shade(BODY, -12), 8, 4, size=0.65)
    eyes(m, body, body_pivot, 8, -24, size=0.8)
    cheeks(m, body, body_pivot, 13, -31, size=0.7)
    mouth(m, body, body_pivot, -35, kind="smile", width=0.55, fang=True)
    chest_mark(m, body, body_pivot, -43, shade(K["carpYellow"], 10), size=0.5)
    m.pivot("seat", P(0, -6, -10), body_pivot)
    return m
