"""
Hophare — a hare: a sandy chibi with long ears (pink inside), a white muzzle with a pink nose,
buck teeth, a pale belly and a white puff of a tail. Its ears grow at stage 2 (Springhare) and
3 (Vindhare), which wears the crown. Sizes in px of the picture box (x right, f towards the
viewer, z up); it waddles.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import chibi
from lib.sdf import PX, Sculpt, frame

BODY = K["boatYellow2"]


def ears(m, parent, colour, inner, length=26, width=6.5):
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        base = S(side * 7, 2, 7)
        pivot = m.pivot(f"ear_{lr}", base * PX, parent)
        pivot["stageScale"] = 0.2
        up = S(side * 0.3, -0.15, 1).normalized()
        out = S(side * 0.15, 1, 0.1).normalized()
        e = Sculpt(colour)
        e.ellipsoid(base + up * length * 0.5, (width, 3.2, length * 0.5), frame(up.cross(out).normalized(), out, up), k=0)
        e.ellipsoid(base + up * length * 0.5 + out * 1.8, (width * 0.55, 1.6, length * 0.4), frame(up.cross(out).normalized(), out, up), colour=inner, k=0.6)
        m.part(e, f"ear_{lr}_mesh", pivot, voxel=0.35, budget=600, stage_shade=True)


def build():
    m = Model("hophare")
    s, body_pivot = chibi(m, BODY, K["washi"])
    s.ellipsoid(S(0, 18, -12), (7.5, 5, 5), k=3, colour=K["washi"])  # the muzzle
    s.ball(S(0, 22.5, -9.5), 1.9, k=0.6, colour=K["sakuraPink"])
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    ears(m, body_pivot, BODY, K["sakuraPink"])
    tail = m.pivot("tail", P(0, -10, -38), body_pivot)
    t = Sculpt(K["washi"])
    t.ball(S(0, -11, -38), 5, k=0)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=400)
    eyes(m, body, body_pivot, 8, -4, size=0.8)
    cheeks(m, body, body_pivot, 13, -11, size=0.7)
    mouth(m, body, body_pivot, -15.5, kind="buck", width=0.5)
    chest_mark(m, body, body_pivot, -38, shade(K["springGreen"], 18), size=0.6)
    top, _ = m.surface(body, 0, 2, down=True)
    crown(m, top / PX + Vector((0, -3, 0)), body_pivot, radius=5.5)
    m.pivot("seat", P(0, -6, 12), body_pivot)
    return m
