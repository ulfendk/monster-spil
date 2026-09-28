"""
Grenspringer — a squirrel: a russet chibi with tufted pointed ears, a pale muzzle, buck teeth, a
pale belly, a huge fluffy tail curling up behind, and an acorn held in its paws. At stage 2
(Kronespringer) a crown of twigs grows between its ears. Sizes in px of the picture box (x right,
f towards the viewer, z up); it waddles.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import chibi
from lib.sdf import PX, Sculpt, frame

BODY = shade(K["surimiOrange"], -18)


def build():
    m = Model("grenspringer")
    s, body_pivot = chibi(m, BODY, K["washi"])
    s.ellipsoid(S(0, 18, -12), (7.5, 5, 5), k=3, colour=K["washi"])
    s.ball(S(0, 22.5, -9.5), 1.8, k=0.6, colour=K["sumiInk4"])
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 10, 2, 7)
        up = S(side * 0.5, 0, 1).normalized()
        out = S(0, 1, 0)
        e = Sculpt(BODY)
        e.slab(base, frame(up.cross(out).normalized() * -side, up, out), [(-4.5, 0), (4.5, 0), (0, 11)], 3, rounding=1.2)
        e.round_cone(base + up * 9, base + up * 15 + Vector((side * 1, 0, 0)), 1.8, 0.4, k=0.5, colour=shade(BODY, -20))
        m.part(e, f"ear_{lr}", body_pivot, voxel=0.3, budget=400, stage_shade=True)
    tail = m.pivot("tail", P(0, -10, -40), body_pivot)
    tail["stageScale"] = 0.2
    t = Sculpt(BODY)
    t.chain([S(0, -11, -40), S(0, -22, -34), S(0, -26, -18), S(0, -22, -2), S(0, -14, 4), S(0, -12, -2)], [5, 9, 11, 10, 7, 4], k=4)
    t.ellipsoid(S(0, -24, -14), (5, 4, 14), op="paint", colour=mix(BODY, K["washi"], 0.4), k=3)
    m.part(t, "tail_mesh", tail, voxel=0.4, budget=1500, stage_shade=True)
    a = Sculpt(K["boatYellow1"])
    a.ellipsoid(S(0, 14, -36), (4.5, 4.5, 5.5), k=0)
    a.ellipsoid(S(0, 14, -31.5), (5.5, 5.5, 2.5), k=0.8, colour=shade(K["boatYellow1"], -18))
    m.part(a, "acorn", body_pivot, voxel=0.3, budget=500)
    top, _ = m.surface(body, 0, 2, down=True)
    tw = Sculpt(K["boatYellow1"])
    t0 = top / PX
    for side in (-1, 1):
        tw.chain([t0 + Vector((side * 3, 0, -1)), t0 + Vector((side * 6, 0, 7)), t0 + Vector((side * 10, 0, 11))], [1.6, 1.2, 0.8], k=0.5)
        tw.ellipsoid(t0 + Vector((side * 8, 0, 9)), (2.6, 1, 1.6), colour=K["autumnGreen"])
    m.part(tw, "twigs", body_pivot, voxel=0.25, budget=500, stages=(2, 3))
    eyes(m, body, body_pivot, 8, -4, size=0.8)
    cheeks(m, body, body_pivot, 13, -11, size=0.7)
    mouth(m, body, body_pivot, -15.5, kind="buck", width=0.5)
    chest_mark(m, body, body_pivot, -44, shade(K["springGreen"], 18), size=0.5)
    m.pivot("seat", P(0, -6, 12), body_pivot)
    return m
