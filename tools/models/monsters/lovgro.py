"""
Løvgro — a sprout, one of the three starters: a big round green head on a small body, a
yellow belly, stubby arms and root-toed feet, and a sprout with two leaves growing from the
top of its head, swaying. At stage 2 (Løvtrold) two more leaves come out lower down the
stem, at stage 3 (Skovkonge) a pink flower opens at the top, and a crown of gold rings the
stem. Sizes in px of the 128-px picture box: x right, f towards the viewer, z up from the
box's middle; its feet stand 12 px above the bottom.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, chest_mark, crown, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["springGreen"]
BELLY = K["carpYellow"]
LEAF = mix(K["springGreen"], K["washi"], 0.2)
STEM = K["autumnGreen"]
FEET = shade(BODY, -14)
FEET_Z = -52


def leaf(m, parent, name, base, direction, length, width, stages=(1, 3)):
    """A leaf from `base` (px) along `direction`: an almond shape with a darker vein, swaying."""
    d = direction.normalized()
    side = Vector((0, -1, 0)).cross(d).normalized()
    if side.length < 0.5:
        side = Vector((1, 0, 0))
    normal = d.cross(side).normalized()
    pivot = m.pivot(name, base * PX, parent)
    pivot["sway"] = 1
    F = frame(side, d, normal)
    lf = Sculpt(LEAF)
    pts = [(math.sin(t * math.pi) * width * (1 - 0.25 * t), t * length) for t in (i / 10 for i in range(11))]
    outline = pts + [(-x, y) for x, y in reversed(pts[1:-1])]
    lf.slab(base, F, outline, 2.2, rounding=0.9)
    lf.round_cone(base + d * 1, base + d * length * 0.85 + normal * 0.7, 0.8, 0.4, colour=STEM)
    m.part(lf, f"{name}_mesh", pivot, voxel=0.3, budget=500, stages=stages)


def build():
    m = Model("lovgro")
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))

    s = Sculpt(BODY)
    s.ellipsoid(S(0, 3, -36), (15, 13, 13.5), k=0)  # the body
    s.ellipsoid(S(0, 4, -3), (21, 19, 19.5), k=7)  # the head
    s.ellipsoid(S(0, 14, -38), (10, 6, 10), op="paint", colour=BELLY, k=0.9)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    # ---- the sprout: a stem from the top of the head, two leaves (four at stage 2), a flower at 3.
    top, _ = m.surface(body, 0, 4, down=True)
    t = top / PX
    sprout = m.pivot("sprout", top, body_pivot)
    sprout["stageScale"] = 0.3
    stem = Sculpt(STEM)
    stem.chain([t + Vector((0, 0, -3)), t + Vector((0.5, 0, 7)), t + Vector((0, 0, 15))], [2.2, 1.8, 1.5], k=1)
    m.part(stem, "stem_mesh", sprout, voxel=0.3, budget=400)
    tip = t + Vector((0, 0, 14))
    for side in (-1, 1):
        leaf(m, sprout, f"leaf_{'L' if side < 0 else 'R'}", tip, Vector((side * 1, 0, 0.45)), 25, 10)
        leaf(m, sprout, f"leaf2_{'L' if side < 0 else 'R'}", t + Vector((0, 0, 6)), Vector((side * 1, 0.15, 0.2)), 12, 4.5, stages=(2, 3))
    fl = Sculpt(K["sakuraPink"])
    for i in range(5):
        # Petals opening up and out, a cup round a yellow heart.
        a = i / 5 * math.tau
        out = Vector((math.cos(a), math.sin(a), 0))
        fl.round_cone(tip + out * 1.5 + Vector((0, 0, 1.5)), tip + out * 6.5 + Vector((0, 0, 6.5)), 1.8, 3.4, k=1)
    fl.ball(tip + Vector((0, 0, 3.2)), 2.6, colour=K["carpYellow"])
    m.part(fl, "flower_mesh", sprout, voxel=0.3, budget=600, stages=(3, 3))
    crown(m, t + Vector((0, 0, -1)), body_pivot, radius=6)

    # ---- stubby arms, root-toed feet.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        arm = m.pivot(f"arm_{lr}", P(side * 13, 4, -30), body_pivot)
        a = Sculpt(BODY)
        a.round_cone(S(side * 13, 4, -30), S(side * 19, 9, -40), 4.2, 3.6, k=1.5)
        a.ball(S(side * 19.5, 10, -41.5), 4, k=1.5)
        m.part(a, f"arm_{lr}_mesh", arm, voxel=0.4, budget=400, stage_shade=True)
        foot = m.pivot(f"foot_{lr}", P(side * 7.5, 5, FEET_Z), m.root)
        f = Sculpt(FEET)
        f.ellipsoid(S(side * 7.5, 6, -48), (6.5, 8, 4.2), k=0)
        for c in (-1, 0, 1):
            f.round_cone(S(side * 7.5 + c * 3, 11, -49.5), S(side * 7.5 + c * 5, 16, -51), 1.8, 0.8, k=1, colour=K["boatYellow2"])
        m.part(f, f"foot_{lr}_mesh", foot, voxel=0.35, budget=450, stage_shade=True)

    eyes(m, body, body_pivot, 8, -2, size=0.8)
    cheeks(m, body, body_pivot, 15, -9, size=0.9)
    mouth(m, body, body_pivot, -12, kind="smile", width=0.7)
    chest_mark(m, body, body_pivot, -36, shade(K["springGreen"], 22), size=0.7)

    m.pivot("seat", P(0, -6, 14), body_pivot)
    return m
