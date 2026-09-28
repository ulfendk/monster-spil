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
