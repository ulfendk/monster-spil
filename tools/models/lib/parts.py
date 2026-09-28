"""
Body parts many monsters share, each on its own pivot of the rig (lib/model.py): four legs
swinging from the hip, a bird's thin legs, stubby feet, nub arms, feathered wings — and lava
cracks painted over a surface. Sizes in px of the picture box (x right, f towards the
viewer, z up); FEET_Z is where feet stand.
"""
import math
import random

from mathutils import Euler, Vector

from .model import Model, P, S
from .palette import K, shade
from .sdf import PX, Sculpt, frame

FEET_Z = -52


def legs4(m: Model, colour, spots, hip_z, radius=5.0, sock=None, hoof=None, paw=True, stage_shade=True):
    """Four legs (spots: (x, f) front left, front right, back right, back left) from the hip at hip_z down to the ground, swinging from the hip."""
    m.root["hips"] = 1
    for i, (x, f) in enumerate(spots):
        hip = S(x, f, hip_z)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        l = Sculpt(colour)
        l.round_cone(hip, S(x, f, FEET_Z + 4), radius, radius * 0.82, k=2)
        if hoof:
            l.round_cone(S(x, f, FEET_Z + 5), S(x, f + 0.5, FEET_Z + 0.8), radius * 0.85, radius * 0.95, k=0.6, colour=hoof)
        elif paw:
            l.ellipsoid(S(x, f + 1.8, FEET_Z + 3), (radius * 0.95, radius * 1.2, radius * 0.65), k=2, colour=sock or colour)
        if sock:
            l.ellipsoid(S(x, f, FEET_Z + 7), (radius * 1.2, radius * 1.2, 6), op="paint", colour=sock, k=2)
        m.part(l, f"leg_{i}", leg, voxel=0.45, budget=450, stage_shade=stage_shade)


def bird_legs(m: Model, colour, x, f, hip_z, length=None):
    """Two thin legs with three toes forward and one back (foot_L, foot_R)."""
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        hip = S(side * x, f, hip_z)
        leg = m.pivot(f"foot_{lr}", hip * PX, m.root)
        l = Sculpt(colour)
        ankle = S(side * x, f + 1, FEET_Z + 2)
        l.round_cone(hip, ankle, 2.2, 1.7, k=0.8)
        for dx, df in ((-3.2, 5.5), (0, 6.5), (3.2, 5.5), (0, -3.5)):
            l.round_cone(ankle, ankle + S(dx, df, -1.5), 1.5, 1.0, k=0.8)
        m.part(l, f"leg_{lr}", leg, voxel=0.3, budget=400)


def feet2(m: Model, colour, x, f, size=1.0, toes=None, stage_shade=True):
    """Two stubby feet (foot_L, foot_R), maybe with toes."""
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        foot = m.pivot(f"foot_{lr}", P(side * x, f, FEET_Z), m.root)
        s = Sculpt(colour)
        s.ellipsoid(S(side * x, f + 2, FEET_Z + 4 * size), (8 * size, 10 * size, 4.5 * size), k=0)
        if toes:
            for c in (-1, 0, 1):
                s.ball(S(side * x + c * 4 * size, f + 10 * size, FEET_Z + 2.5 * size), 2.3 * size, k=1.2, colour=toes)
        m.part(s, f"foot_{lr}_mesh", foot, voxel=0.4, budget=400, stage_shade=stage_shade)


def arms2(m: Model, parent, colour, x, f, z, reach=(6, 6, -10), radius=4.5, hand=None, stage_shade=True):
    """Two nub arms (arm_L, arm_R) from the shoulder at (±x, f, z), reaching `reach` (out, forwards, down)."""
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        arm = m.pivot(f"arm_{lr}", P(side * x, f, z), parent)
        a = Sculpt(colour)
        end = S(side * (x + reach[0]), f + reach[1], z + reach[2])
        a.round_cone(S(side * x, f, z), end, radius, radius * 0.85, k=1.5)
        a.ball(end, radius * 0.95, k=1.5, colour=hand)
        m.part(a, f"arm_{lr}_mesh", arm, voxel=0.4, budget=400, stage_shade=stage_shade)


def feather_wing(m: Model, parent, side, shoulder_px, colour, tip=None, length=34, height=22, rest=(0.0, 0.25, 0.35), grow=0.2):
    """A folded bird's wing on the body's side at `shoulder_px`: feathers fanning back, the long ones tipped in `tip`."""
    lr = "L" if side < 0 else "R"
    euler = Euler((rest[0], side * rest[1], side * rest[2]), "XYZ")
    pivot = m.pivot(f"wing_{lr}", shoulder_px * PX, parent, rotation=euler)
    pivot["stageScale"] = grow
    R = euler.to_matrix()
    # The wing lies against the body: its plane faces sideways; it runs back (−f) and down.
    back, up, out = R @ S(0, -1, 0), R @ Vector((0, 0, 1)), R @ Vector((side, 0, 0))
    F = frame(back, up, out)
    w = Sculpt(colour)
    pts = [(0, 6), (length * 0.55, height * 0.45), (length, 0), (length * 0.9, -4), (length * 0.78, -2), (length * 0.66, -7), (length * 0.52, -4), (length * 0.4, -8), (length * 0.25, -5), (0, -height * 0.45)]
    w.slab(shoulder_px, F, pts, 3.4, rounding=1.4)
    if tip:
        w.slab(shoulder_px + back * length * 0.62, F, [(0, 12), (length, 12), (length, -12), (0, -12)], 10, op="paint", colour=tip)
    m.part(w, f"wing_{lr}_mesh", pivot, voxel=0.35, budget=600)
    return pivot


def cracks(s: Sculpt, centre_px, radii, colour, count=7, seed=1, width=1.3, faces=None):
    """Glowing cracks painted over an ellipsoid's surface (zig-zags), away from `faces` (a direction to keep clear, e.g. the front)."""
    rnd = random.Random(seed)
    c = Vector(centre_px)
    for _ in range(count):
        while True:
            yaw, pitch = rnd.uniform(0, math.tau), rnd.uniform(-0.6, 0.9)
            d = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
            if faces is None or d.dot(faces) < 0.55:
                break
        pts = []
        for j in range(4):
            yaw2 = yaw + (j - 1.5) * 0.18 + rnd.uniform(-0.08, 0.08)
            pitch2 = pitch + (j - 1.5) * 0.12 * (1 if rnd.random() > 0.5 else -1)
            d2 = Vector((math.cos(pitch2) * math.sin(yaw2), -math.cos(pitch2) * math.cos(yaw2), math.sin(pitch2)))
            pts.append(c + Vector((d2.x * radii[0], d2.y * radii[1], d2.z * radii[2])))
        for a, b in zip(pts, pts[1:]):
            s.round_cone(a, b, width, width * 0.8, op="paint", colour=colour)


def fish_tail(m: Model, parent, base_px, colour, size=1.0, forked=True, grow=0.25):
    """A tail fin standing upright behind `base_px` (the `tail` pivot): forked, or a round fan."""
    pivot = m.pivot("tail", base_px * PX, parent)
    pivot["stageScale"] = grow
    t = Sculpt(colour)
    F = frame(S(0, -1, 0), Vector((0, 0, 1)), Vector((1, 0, 0)))
    pts = ([(0, 3), (9, 13), (14, 14), (8, 4), (8, -4), (14, -14), (9, -13), (0, -3)] if forked
           else [(0, 4), (8, 12), (13, 10), (15, 0), (13, -10), (8, -12), (0, -4)])
    t.slab(base_px, F, [(x * size, y * size) for x, y in pts], 2.4, rounding=1)
    t.ellipsoid(base_px, (2.2 * size, 3 * size, 3.5 * size), k=1.5)
    m.part(t, "tail_mesh", pivot, voxel=0.35, budget=500)
    return pivot


def side_fins(m: Model, parent, x, f, z, colour, size=1.0):
    """Two little fins at the sides (arm_L, arm_R: they paddle)."""
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        at = S(side * x, f, z)
        pivot = m.pivot(f"arm_{lr}", at * PX, parent)
        F = frame(S(0, -1, 0), S(side * 0.3, 0, -1).normalized(), Vector((side, 0, 0.3)).normalized())
        s = Sculpt(colour)
        s.slab(at, F, [(x2 * size, y2 * size) for x2, y2 in ((0, 0), (7, 3), (10, 8), (4, 6), (0, 3))], 1.8, rounding=0.7)
        m.part(s, f"fin_{lr}", pivot, voxel=0.3, budget=250)


def slab_fin(s: Sculpt, base_px, points, thickness=2.2, colour=None):
    """An upright fin in the body's middle plane (x = 0), from (f, z) points relative to `base_px`."""
    F = frame(S(0, 1, 0), Vector((0, 0, 1)), Vector((1, 0, 0)))
    s.slab(base_px, F, points, thickness, rounding=0.9, colour=colour, k=1.2)


def frog_body(m: Model, colour, belly, spots=None, seed=1):
    """A squat frog: a wide body and head in one, eye bumps on top, big back haunches; legs on four pivots (they hop). Returns (sculpt, body pivot)."""
    m.root["gait"] = "bound"
    m.root["hips"] = 1
    m.root["view"] = -0.5
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(colour)
    s.ellipsoid(S(0, -2, -38), (19, 16, 12.5), k=0)
    s.ellipsoid(S(0, 8, -32), (17, 13, 10.5), k=6)  # the head
    for side in (-1, 1):
        s.ball(S(side * 8.5, 9, -23), 6.5, k=3)  # eye bumps
        s.ellipsoid(S(side * 14, -10, -42), (7, 9, 7), k=3)  # haunches
    s.ellipsoid(S(0, 8, -44), (13, 11, 5), op="paint", colour=belly, k=2.5)
    if spots:
        rnd = random.Random(seed)
        for _ in range(9):
            a = rnd.uniform(1.0, math.tau - 1.0)
            z = rnd.uniform(-38, -28)
            s.ball(S(math.sin(a) * 18, -2 - math.cos(a) * 15, z), rnd.uniform(1.8, 3), op="paint", colour=spots, only=colour)
    for i, (x, f, big) in enumerate(((-9, 11, False), (9, 11, False), (14, -10, True), (-14, -10, True))):
        at = S(x, f, -42)
        leg = m.pivot(f"foot_{i}", at * PX, m.root)
        l = Sculpt(colour)
        if big:
            l.ellipsoid(S(x * 1.1, f + 5, FEET_Z + 2.5), (5, 9, 2.8), k=0)
            for c in (-1, 0, 1):
                l.ball(S(x * 1.1 + c * 3.2, f + 13, FEET_Z + 1.8), 2, k=1)
        else:
            l.round_cone(at, S(x * 1.1, f + 3, FEET_Z + 3), 3.2, 2.6, k=1)
            for c in (-1, 0, 1):
                l.ball(S(x * 1.1 + c * 2.4, f + 5.5, FEET_Z + 1.6), 1.6, k=1)
        m.part(l, f"leg_{i}", leg, voxel=0.35, budget=350, stage_shade=True)
    return s, body_pivot


def troll(m: Model, colour, belly, nose=None, arm=None):
    """A troll: a big pear of a body with the head grown into it, a big nose, long arms reaching down, short thick legs (they stomp). Returns (sculpt, body pivot)."""
    m.root["gait"] = "stomp"
    m.root["hips"] = 1
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(colour)
    s.ellipsoid(S(0, 0, -30), (21, 17, 17), k=0)
    s.ellipsoid(S(0, 5, -9), (15, 13, 13), k=8)  # the head
    s.ellipsoid(S(0, 18, -12), (6.5, 6, 6.5), k=3, colour=nose or shade(colour, -8))  # the big nose
    s.ellipsoid(S(0, 11, -34), (13, 8, 12), op="paint", colour=belly, k=3)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        shoulder = S(side * 18, 2, -20)
        pivot = m.pivot(f"arm_{lr}", shoulder * PX, body_pivot)
        a = Sculpt(arm or colour)
        hand = S(side * 25, 8, -40)
        a.chain([shoulder, S(side * 24, 4, -30), hand], [6, 5.4, 5], k=2)
        a.ellipsoid(hand + S(0, 1, -3), (5.5, 5.5, 5), k=2)
        m.part(a, f"arm_{lr}_mesh", pivot, voxel=0.4, budget=600, stage_shade=True)
        hip = S(side * 9, 0, -42)
        leg = m.pivot(f"foot_{lr}", hip * PX, m.root)
        l = Sculpt(shade(colour, -6))
        l.round_cone(hip, S(side * 9.5, 1, FEET_Z + 4), 6.5, 6, k=1.5)
        l.ellipsoid(S(side * 9.5, 4, FEET_Z + 3), (7, 9, 3.6), k=2)
        m.part(l, f"leg_{lr}", leg, voxel=0.4, budget=500, stage_shade=True)
    return s, body_pivot


def chibi(m: Model, colour, belly, feet=None, arms=True):
    """A chibi biped: a big round head on a small body, a belly, stubby arms and feet (they waddle). Returns (sculpt, body pivot)."""
    m.root["gait"] = "waddle"
    m.root["hips"] = 1
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(colour)
    s.ellipsoid(S(0, 3, -37), (14, 12, 12), k=0)  # the body
    s.ellipsoid(S(0, 4, -8), (19, 17, 17.5), k=7)  # the head
    s.ellipsoid(S(0, 13, -39), (9, 6, 8.5), op="paint", colour=belly, k=2.5)
    if arms:
        arms2(m, body_pivot, colour, 12, 4, -31, reach=(6, 5, -9), radius=4)
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        foot = m.pivot(f"foot_{lr}", P(side * 7.5, 5, -46), m.root)
        f = Sculpt(feet or shade(colour, -10))
        f.round_cone(S(side * 7.5, 4, -46), S(side * 7.5, 5, FEET_Z + 3), 4.5, 4.2, k=1)
        f.ellipsoid(S(side * 7.5, 7, FEET_Z + 3), (6, 8, 3.6), k=1.5)
        m.part(f, f"foot_{lr}_mesh", foot, voxel=0.35, budget=400, stage_shade=True)
    return s, body_pivot


def bug_wings(m: Model, parent, x, f, z, size=1.0, colour=None):
    """Two see-through bug wings on the back that buzz (wing_L, wing_R)."""
    m.root["flap"] = 0.35
    m.root["flapRate"] = 40
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        root = S(side * x, f, z)
        rest = Euler((0, 0, side * 0.35), "XYZ")
        pivot = m.pivot(f"wing_{lr}", root * PX, parent, rotation=rest)
        R = rest.to_matrix()
        u, v = R @ Vector((side, 0, 0.35)).normalized(), R @ S(0, -1, 0.4).normalized()
        w = Sculpt(colour or K["washi"])
        pts = [(math.cos(t) * 12 * size + 12 * size, math.sin(t) * 6 * size) for t in (i / 12 * math.tau for i in range(12))]
        w.slab(root, frame(u, v, u.cross(v).normalized()), pts, 1.0, rounding=0.4)
        m.part(w, f"wing_{lr}_mesh", pivot, voxel=0.3, budget=300, opacity=0.55)


def gnome(m: Model, colour, belly, beard, nose):
    """A gnome: a chibi with a big round nose and a beard. Returns (sculpt, body pivot)."""
    s, body_pivot = chibi(m, colour, belly)
    s.ellipsoid(S(0, 19, -10), (6.5, 5.5, 6), k=2.5, colour=nose)  # the big nose
    s.ellipsoid(S(0, 14, -20), (11, 6, 10), k=4, colour=beard)  # the beard
    s.round_cone(S(0, 16, -22), S(0, 13, -34), 8, 2, k=3, colour=beard)
    return s, body_pivot


def worm(m: Model, colour, belly, head_at, head_radii, joints, stages_last=(1, 3), paint=None):
    """
    A long body that slithers: a head on its own pivot (`head`) and round segments on the joints
    of its spine (`spine_0` just behind the head …), each (x, f, z, radius) px; `paint(sculpt, i,
    at, r)` may colour a segment. Returns (head sculpt's mesh-to-be sculpt, head pivot, body pivot).
    """
    m.root["gait"] = "slither"
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    head = m.pivot("head", head_at * PX, body_pivot)
    h = Sculpt(colour)
    h.ellipsoid(head_at, head_radii, k=0)
    for i, (x, f, z, r) in enumerate(joints):
        at = S(x, f, z)
        seg = m.pivot(f"spine_{i}", at * PX, body_pivot)
        s = Sculpt(colour)
        s.ellipsoid(at, (r, r * 1.05, r * 0.95), k=0)
        if belly:
            s.ellipsoid(at - Vector((0, 0, r * 0.55)), (r * 0.8, r, r * 0.45), op="paint", colour=belly, k=1.2)
        if paint:
            paint(s, i, at, r)
        m.part(s, f"segment_{i}", seg, voxel=0.4, budget=700, stage_shade=True, stages=stages_last if i == len(joints) - 1 else (1, 3))
    return h, head, body_pivot
