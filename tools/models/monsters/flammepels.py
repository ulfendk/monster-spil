"""
Flammepels — a fire fox kit, one of the three starters: a big round head with tall fox ears
(dark tips, pink inside), a cream muzzle and cheek tufts, a tuft of flame-coloured fur on its
crown, a cream ruff on its chest, dark socks on four short legs, and a big brush of a tail
with a flame at its tip. A kitsune: at stage 2 it has three tails, at stage 3 five, each with
its flame. Sizes in px of the 128-px picture box: x right, f towards the viewer (its nose
points that way; the game shows four-legged ones more from the side), z up from the box's
middle; its paws stand 12 px above the bottom.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, chest_mark, crown, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["peachRed"]
CREAM = K["washi"]
DARK = mix(shade(BODY, -20), K["sumiInk4"], 0.15)
FUR = K["surimiOrange"]
FEET_Z = -52


def build():
    m = Model("flammepels")
    m.root["gait"] = "trot"
    m.root["hips"] = 1
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))

    # ---- body and head: one shape.
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -8, -31), (14, 25, 13), k=0)  # the body, long from front to back
    s.ellipsoid(S(0, 9, -27), (12.5, 10, 13), k=6)  # the chest
    s.ellipsoid(S(0, 15, -3), (20, 17, 17.5), k=8)  # the head
    s.ellipsoid(S(0, 29, -8), (9, 9, 6.5), k=5, colour=CREAM)  # the muzzle
    s.ball(S(0, 37.5, -5.8), 2.6, k=0.8, colour=K["sumiInk4"])  # the nose
    for side in (-1, 1):
        # Cheek tufts, pointing out and down.
        s.round_cone(S(side * 14, 16, -11), S(side * 22, 10, -16), 4.5, 1.2, k=2.5, colour=CREAM)
    s.ellipsoid(S(0, 17, -24), (10, 7, 11), op="paint", colour=CREAM, k=2.5)  # the ruff
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    # ---- fox ears: flat, tall, a little outwards; pink inside, dark at the tip.
    for side in (-1, 1):
        base = S(side * 10, 12, 10)
        up = S(side * 0.35, 0.15, 1).normalized()
        out = S(0, 1, 0.15).normalized()  # (facing forwards)
        right = up.cross(out).normalized() * side
        F = frame(right, up, out)
        e = Sculpt(BODY)
        tri = [(-8, 0), (8, 0), (0, 22)]
        e.slab(base, F, tri, 5, rounding=2.2)
        e.slab(base + out * 1.6 + up * 3, F, [(x * 0.62, y * 0.62) for x, y in tri], 2.4, rounding=1, colour=K["sakuraPink"])
        e.ellipsoid(base + up * 21, (7, 5, 7), op="paint", colour=DARK, k=2, only=BODY)
        m.part(e, f"ear_{'L' if side < 0 else 'R'}", body_pivot, voxel=0.4, budget=500, stage_shade=True)

    # ---- a tuft of flame-coloured fur on the crown.
    t = Sculpt(FUR)
    for dx, h, lean in ((0, 10, 0), (-4.5, 7.5, -0.35), (4.5, 7.5, 0.35)):
        a = S(dx, 10, 13)
        t.round_cone(a, a + Vector((math.sin(lean) * h, -2, math.cos(lean) * h)), 3.4, 0.5, k=1.5)
    tp = m.pivot("tuft", S(0, 10, 13) * PX, body_pivot)
    tp["stageScale"] = 0.25
    m.part(t, "tuft_mesh", tp, voxel=0.35, budget=400)

    # ---- four short legs with dark socks, swinging from the hip.
    for i, (x, f) in enumerate(((-8.5, 7), (8.5, 7), (8.5, -24), (-8.5, -24))):
        hip = S(x, f, -34)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        l = Sculpt(BODY)
        l.round_cone(hip, S(x, f, -47), 5.4, 4.4, k=2)
        l.ellipsoid(S(x, f + 1.8, -48.8), (5, 6.5, 3.4), k=2, colour=DARK)
        l.ellipsoid(S(x, f, -46), (6, 6, 5.5), op="paint", colour=DARK, k=2)
        m.part(l, f"leg_{i}", leg, voxel=0.45, budget=450, stage_shade=True)

    # ---- tails: one, three at stage 2, five at stage 3 — fanned out, each with a flame.
    base = S(0, -30, -27)
    tail = m.pivot("tail", base * PX, body_pivot)
    for fan, stages in ((0.0, (1, 3)), (-0.42, (2, 3)), (0.42, (2, 3)), (-0.84, (3, 3)), (0.84, (3, 3))):
        R = Matrix.Rotation(fan, 3, Vector((0, 1, 0)))  # fanned sideways about the tail's root
        pts = [(0, -3, 0), (0, -16, -2), (0, -28, 5), (0, -34, 17), (0, -32, 28)]
        pts = [base + R @ S(*p) for p in pts]
        tl = Sculpt(BODY)
        tl.chain(pts, [5, 10, 12, 10, 5], k=3)
        tl.ellipsoid(pts[-1], (8.5, 8.5, 8.5), op="paint", colour=CREAM, k=2.5)
        m.part(tl, f"tail_{fan:+.1f}", tail, voxel=0.45, budget=1100, stages=stages, stage_shade=True)
        tip = (pts[-1] - pts[-2]).normalized()
        flame(m, pts[-1] + tip * 2.5, tail, f"flame_{fan:+.1f}", height=17, width=5.5, lean=tip, stages=stages)

    # ---- the face, the chest mark and the crown.
    eyes(m, body, body_pivot, 8, 1.5, size=0.78, iris=mix(BODY, K["sumiInk0"], 0.72))
    cheeks(m, body, body_pivot, 15.5, -5, size=0.8)
    mouth(m, body, body_pivot, -12, kind="cat", width=0.8, fang=True)
    chest_mark(m, body, body_pivot, -24, shade(BODY, 22), size=0.8)
    top, _ = m.surface(body, 0, 18, down=True)
    crown(m, top / PX, body_pivot, radius=7)

    m.pivot("seat", P(0, -8, -16), body_pivot)
    return m
