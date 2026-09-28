"""
Drageunge — the dragon's baby (the weekly dragon's reward): a chibi fire dragon, its head
bigger than its body, a round snout with nostrils, big amber eyes with glints, two
back-swept horns and little fins for ears, a cream belly of plates, stubby arms and toed
feet, a row of orange spikes down its back, a curling tail with a flame at the tip, and
two bat wings. Horns, spikes and wings grow at each stage (`stageScale`); at stage 3 it
wears a golden crown. Sizes in px of the 128-px picture box: x right, f towards the
viewer, z up from the box's middle; its feet stand 12 px above the bottom.
"""
import math

from mathutils import Euler, Vector

from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.sdf import PX, Sculpt, frame

BODY = K["peachRed"]
DARK = shade(BODY, -10)
BELLY = mix(K["carpYellow"], K["washi"], 0.35)
HORN = K["oldWhite"]
SPIKE = K["surimiOrange"]
WING = shade(mix(BODY, K["autumnRed"], 0.55), -6)
BONE = shade(K["autumnRed"], -8)
FEET = shade(BODY, -6)

FEET_Z = -52


def build():
    m = Model("drageunge")
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))

    # ---- the body and head: one smooth shape.
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 2, -31), (24, 21, 21), k=0)
    s.ellipsoid(S(0, 3, -40), (26, 22, 12), k=6)
    s.ellipsoid(S(0, 4, 12), (27, 23, 23), k=9)  # the head
    s.ellipsoid(S(0, 20, 5), (14, 11, 9.5), k=5)  # the snout
    for side in (-1, 1):
        s.ball(S(side * 4.5, 30.5, 8), 2.2, k=1.2, op="sub")  # nostrils
        s.round_cone(S(side * 23, -2, 20), S(side * 35, -10, 27), 6.5, 1.8, k=3, colour=DARK)  # ear fins
        s.round_cone(S(side * 27, -4, 19), S(side * 33, -9, 17), 4, 1.4, k=2, colour=DARK)
    # The cream belly: raised plates, the creases between them shaded.
    for z, rx in ((-19, 12.5), (-27.5, 15), (-36, 15), (-44, 13)):
        front = 2 + 21 * max(0.0, 1 - ((z + 31) / 21) ** 2) ** 0.5 if z > -40 else 3 + 22 * (1 - ((z + 40) / 12) ** 2) ** 0.5
        s.ellipsoid(S(0, front - 3.5, z), (rx, 5, 4.8), k=1.4, colour=BELLY)
    s.ellipsoid(S(0, 18, -32), (15.5, 12, 18.5), k=2, op="paint", colour=shade(BELLY, -7), only=BODY)  # (between them)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    # ---- horns (growing from their base), spikes down the back.
    for side in (-1, 1):
        base = S(side * 11, -4, 29)
        h = Sculpt(HORN)
        h.chain([base, base + Vector((side * 3, 6, 10)), base + Vector((side * 4, 15, 15))], [5.2, 3.6, 1.0])
        pivot = m.pivot(f"horn_{'L' if side < 0 else 'R'}", base * PX, body_pivot)
        pivot["stageScale"] = 0.25
        m.part(h, f"horn_{'L' if side < 0 else 'R'}_mesh", pivot, voxel=0.5, budget=400)
    for i, z in enumerate((26, 13, -2, -16, -30)):
        at, n = m.surface(body, 0, z, back=True)
        size = (5.5, 7, 6, 5, 4)[i]
        sp = Sculpt(SPIKE)
        a = at / PX
        sp.round_cone(a - n * 2, a + n * size + Vector((0, 2, 0)), 3.4, 0.5)
        pivot = m.pivot(f"spike_{i}", at, body_pivot)
        pivot["stageScale"] = 0.3
        m.part(sp, f"spike_{i}_mesh", pivot, voxel=0.45, budget=160)

    # ---- the tail, curling out behind, with a flame at its tip.
    tail_pivot = m.pivot("tail", P(0, -14, -42), body_pivot)
    t = Sculpt(BODY)
    t.chain([S(0, -10, -40), S(6, -26, -47), S(16, -37, -46), S(26, -42, -38), S(31, -43, -28)], [8, 6.5, 5, 3.6, 2.4], k=3)
    t.round_cone(S(31, -43, -27), S(33, -43, -12), 4.8, 0.6, k=2, colour=SPIKE)
    t.ellipsoid(S(31.5, -43, -24), (3.4, 5, 4), k=1.5, op="paint", colour=K["carpYellow"])
    m.part(t, "tail_mesh", tail_pivot, budget=700, stage_shade=True)

    # ---- arms and feet.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        arm = m.pivot(f"arm_{lr}", P(side * 19, 8, -22), body_pivot)
        a = Sculpt(BODY)
        a.round_cone(S(side * 19, 8, -22), S(side * 23, 15, -32), 5.5, 4.6, k=2)
        a.ball(S(side * 23, 16, -34), 5.2, k=2)
        for c in (-1, 0, 1):
            a.ball(S(side * 23 + c * 2.4, 20.5, -36), 1.3, k=0.6, colour=HORN)
        m.part(a, f"arm_{lr}_mesh", arm, voxel=0.55, budget=500, stage_shade=True)

        foot = m.pivot(f"foot_{lr}", P(side * 12, 6, FEET_Z), m.root)
        f = Sculpt(FEET)
        f.ellipsoid(S(side * 12, 7, -47), (9.5, 12, 6), k=0)
        for c in (-1, 0, 1):
            f.ball(S(side * 12 + c * 4.6, 17.5, -49), 2.8, k=1.5, colour=HORN)
        m.part(f, f"foot_{lr}_mesh", foot, voxel=0.6, budget=500, stage_shade=True)

    # ---- bat wings from the upper back, swept back, a little raised.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        rest = Euler((0, -side * 0.15, side * 0.5), "XYZ")
        shoulder = S(side * 12, -12, -16)
        pivot = m.pivot(f"wing_{lr}", shoulder * PX, body_pivot, rotation=rest)
        pivot["stageScale"] = 0.2
        R = rest.to_matrix()
        u, v, w = R @ Vector((side, 0, 0)), R @ Vector((0, 0, 1)), R @ Vector((0, 1, 0))
        F = frame(u, v, w)
        at = lambda a, b, c=0.0: shoulder + u * a + v * b + w * c
        wg = Sculpt(WING)
        pts = [(0, -3), (15, 20), (40, 31), (35, 15), (43, 2), (30, -2), (28, -14), (10, -11)]
        wg.slab(shoulder, F, pts, 2.2, rounding=0.9)
        for tip in ((40, 31), (43, 2), (28, -14)):
            wg.round_cone(at(15, 20, 0.4), at(*tip, 0.4), 1.7, 0.8, k=0.5, colour=BONE)
        wg.round_cone(at(0, 0, 0.4), at(15, 20, 0.4), 2.4, 1.8, k=0.5, colour=BONE)
        wg.round_cone(at(15, 20, 0.4), at(14, 26, 0.6), 1.5, 0.3, k=0.4, colour=HORN)  # the claw at the wrist
        m.part(wg, f"wing_{lr}_mesh", pivot, voxel=0.5, budget=600)

    # ---- stage 3: a small golden crown between the horns.
    c = Sculpt(K["carpYellow"])
    top, _ = m.surface(body, 0, 7, down=True)  # in front of the horns
    ct = top / PX
    c.torus(ct + Vector((0, 0, 1.5)), 8.5, 2.1)
    for i in range(5):
        ang = i / 5 * math.tau
        out = Vector((math.cos(ang), math.sin(ang), 0))
        base = ct + out * 8.5 + Vector((0, 0, 2))
        c.round_cone(base, base + out * 1.6 + Vector((0, 0, 8)), 2.4, 0.7, k=0.8)
        if i % 2 == 0:
            c.ball(base + Vector((0, 0, 0.3)) + out * 2.0, 1.7, colour=K["crystalBlue"])  # a red gem
    m.part(c, "crown_mesh", body_pivot, voxel=0.4, budget=700, stages=(3, 3))

    # ---- the face (flat colours, like the game's own monsters).
    face(m, body, body_pivot)

    m.pivot("seat", P(0, -9, 33), body_pivot)
    return m


def face(m, body, parent):
    for side in (-1, 1):
        at, n = m.surface(body, side * 12, 18)
        right, up, out = m.tangent_frame(n, roll=side * 0.12)
        F = frame(right, up, out)
        p = at / PX
        on = lambda a, b, c: p + right * a + up * b + out * c
        e = Sculpt(INK)
        e.ellipsoid(on(0, 0, 0.3), (7.2, 8.8, 1.6), F)  # the ink rim
        e.ellipsoid(on(0, 0, 0.8), (6.2, 7.8, 1.9), F, colour=K["carpYellow"])  # amber
        e.ellipsoid(on(-side * 0.4, -0.3, 1.5), (4.2, 6.2, 1.9), F)  # the pupil
        e.ball(on(side * 2.2, 2.6, 3.2), 2.3, colour=K["washi"])
        e.ball(on(-side * 1.8, -3.0, 3.0), 1.1, colour=K["washi"])
        m.part(e, f"eye_{'L' if side < 0 else 'R'}", parent, voxel=0.3, budget=300, role="flat", face="open", smooth=0)
        # Shut: a happy arc.
        lid = Sculpt(INK)
        arc = [on(6 * math.cos(a), 6 * math.sin(a) - 2.5, 1.2) for a in (math.radians(d) for d in range(20, 170, 25))]
        lid.chain(arc, [1.3] * len(arc))
        m.part(lid, f"lid_{'L' if side < 0 else 'R'}", parent, voxel=0.3, budget=160, role="flat", face="shut", smooth=0)
        # Cheeks.
        at, n = m.surface(body, side * 20, 8)
        right, up, out = m.tangent_frame(n)
        ck = Sculpt(K["sakuraPink"])
        ck.ellipsoid(at / PX + out * 0.4, (5.5, 3.2, 1.0), frame(right, up, out))
        m.part(ck, f"cheek_{'L' if side < 0 else 'R'}", parent, voxel=0.3, budget=200, role="flat", opacity=0.85, smooth=0)

    # The mouth on the snout: a little ω smile with a fang, or open (crying out).
    at, n = m.surface(body, 0, 1.5)
    right, up, out = m.tangent_frame(n)
    F = frame(right, up, out)
    p = at / PX
    on = lambda a, b, c: p + right * a + up * b + out * c
    sm = Sculpt(INK)
    for side in (-1, 1):
        arc = [on(side * 3.2 + 3.2 * math.cos(a), 3.2 * math.sin(a) + 1, 0.6) for a in (math.radians(d) for d in range(200, 345, 24))]
        sm.chain(arc, [0.9] * len(arc))
    sm.round_cone(on(3.6, -1.3, 0.8), on(3.9, -4.6, 1.2), 1.5, 0.35, colour=K["washi"])
    m.part(sm, "smile", parent, voxel=0.25, budget=240, role="flat", face="smile", smooth=0)
    om = Sculpt(INK)
    om.ellipsoid(on(0, -1.5, 0.5), (6, 4.8, 1.6), F)
    om.ellipsoid(on(0, -3.2, 1.3), (3.6, 2.0, 1.4), F, colour=K["waveRed"])
    m.part(om, "mouth_open", parent, voxel=0.3, budget=300, role="flat", face="talk", smooth=0)
