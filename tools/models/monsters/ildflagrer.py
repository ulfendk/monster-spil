"""
Flammeskæl (ildflagrer) — sculpted after the drawing it came from (docs/drawings/ildflagrer.jpg)
and the hand-made model before it (client/src/cave/handmade/flammeskael.ts): a pale egg of a
body that is all head, flames licking up its sides and back, angry red eyes under frowning
brows, two nostrils, a wide mouth full of sharp teeth with a forked tongue hanging out, four
little yellow horns on the brow, a mane of flames with blue tips standing up from the head,
two big yellow bat wings glowing red to orange to yellow from the shoulder out (finger bones,
a scalloped edge, a hooked claw at the wrist), and a long thin tail curling up to a burning
torch. It hovers: no feet. Its wings beat and its flames flicker. At stage 2 (Flammedrage)
wings, mane and horns are bigger. Ridden, the middle of the mane is gone and the rider sits
in the gap. Sizes in px of the 128-px picture box: x right, f towards the viewer, z up from
the box's middle; sized as drawn (not fitted to the box: its wings reach past it).
"""
import math

from mathutils import Euler, Matrix, Vector

from lib.model import Model, P, S
from lib.palette import INK, K, mix, shade
from lib.sdf import PX, Sculpt, frame

SKIN = mix(mix(K["fujiWhite"], K["sakuraPink"], 0.28), K["surimiOrange"], 0.2)
CZ = -16  # the egg's middle (px, up from the box's middle)
W, H, D = 44, 54, 40
BOTTOM = CZ - H / 2
TOP = CZ + H / 2

# A flat three-tongued flame (px, x across, y up from its base's middle), 1 = 20 px tall.
FLAME = [(-6, 0), (-7.5, 6), (-5, 11), (-3.5, 7), (-1.5, 15), (0.5, 9), (3, 20), (4.5, 11), (6.5, 13), (7, 5), (6, 0), (0, -2)]


def teardrop(s, base, axis, height, width, colour=None):
    """A round flame from `base` (px) up `axis`: a teardrop turned on a lathe (as the hand-made one)."""
    prof = [(0.0, 0.05), (0.26, 0.5), (0.48, 0.44), (0.7, 0.28), (0.88, 0.12), (1.0, 0.02)]
    pts = [base + axis * (t * height) for t, _ in prof]
    s.chain(pts, [max(0.4, r * width) for _, r in prof], k=1.2, colour=colour)


def mane_flame(m, parent, name, base, height, width, lean, ridden=None):
    """A flame of the mane: orange, a blue tip, a yellow heart and a red streak; flickering about its base."""
    pivot = m.pivot(name, base * PX, parent)
    pivot["flicker"] = 1
    if ridden is not None:
        pivot["ridden"] = ridden
    axis = Matrix.Rotation(lean, 3, Vector((0, 1, 0))) @ Vector((0, 0, 1))
    f = Sculpt(K["surimiOrange"])
    teardrop(f, base, axis, height, width)
    f.ellipsoid(base + axis * height * 0.88, (width, width, height * 0.2), op="paint", colour=K["crystalBlue"], k=1)
    f.ellipsoid(base + axis * height * 0.3 + Vector((0, -width * 0.25, 0)), (width * 0.3, width * 0.3, height * 0.22), op="paint", colour=K["carpYellow"], k=1)
    f.ellipsoid(base + axis * height * 0.45 + Vector((width * 0.18, -width * 0.3, 0)), (width * 0.12, width * 0.3, height * 0.25), op="paint", colour=K["autumnRed"], k=0.6)
    part = m.part(f, f"{name}_mesh", pivot, voxel=0.35, budget=450, smooth=1)
    if ridden is not None:
        part["ridden"] = ridden
    return pivot


def build():
    m = Model("ildflagrer")
    m.root["gait"] = "fly"
    m.root["flap"] = 0.32
    m.root["flapRate"] = 6
    m.root["fit"] = 0
    body_pivot = m.pivot("body", P(0, 0, BOTTOM))

    # ---- the egg, fuller at the bottom, with flames painted up from below round the sides and back.
    s = Sculpt(SKIN)
    s.ellipsoid(S(0, 0, CZ), (W / 2, D / 2, H / 2), k=0)
    s.ellipsoid(S(0, 0, CZ - 8), (W / 2 + 2, D / 2 + 1.5, 16), k=6)
    for i in range(11):
        a = 1.25 + (i / 10) * (math.tau - 2.5)
        back = math.cos(a) < -0.3
        size = (1.7 if back else 1.3) * (0.85 + 0.15 * ((i * 7) % 3))
        # Standing on the egg at angle a round it (0 = the front), rising from the bottom.
        out = S(math.sin(a), math.cos(a), 0)
        across = Vector((0, 0, 1)).cross(out).normalized()
        F = frame(across, Vector((0, 0, 1)), out)
        c = out * (W / 2) + Vector((0, 0, BOTTOM + 2))
        s.slab(c, F, [(x * size, y * size) for x, y in FLAME], 30, op="paint", colour=K["surimiOrange"])
        s.slab(c + Vector((0, 0, 0.5)), F, [(x * size * 0.55 * 0.8, y * size * 0.55) for x, y in FLAME], 30, op="paint", colour=K["carpYellow"])
    s.ball(S(-3, 30, CZ - 7), 1.1, k=0.6, op="sub")
    s.ball(S(3, 30, CZ - 7), 1.1, k=0.6, op="sub")
    body = m.part(s, "body_mesh", body_pivot, budget=5000, stage_shade=True)

    # ---- bat wings behind the body, swept back a little: yellow, glowing orange then red towards the shoulder.
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        rest = Euler((0, 0, side * 0.25), "XYZ")
        shoulder = S(side * 17, -8, CZ - 2)
        pivot = m.pivot(f"wing_{lr}", shoulder * PX, body_pivot, rotation=rest)
        pivot["stageScale"] = 0.22
        R = rest.to_matrix()
        u, v, w = R @ Vector((side, 0, 0)), R @ Vector((0, 0, 1)), R @ Vector((0, 1, 0))
        F = frame(u, v, w)
        at = lambda a, b, c=0.0: shoulder + u * a + v * b + w * c
        pts = [(0, 2), (18, 22), (52, 44), (44, 27), (58, 18), (44, 9), (46, -2), (33, -1), (26, -14), (14, -6), (4, -10)]
        wg = Sculpt(K["carpYellow"])
        wg.slab(shoulder, F, pts, 2.4, rounding=0.9)
        for k, colour in ((0.62, K["surimiOrange"]), (0.32, K["autumnRed"])):
            wg.slab(shoulder, F, [(x * k, y * k) for x, y in pts], 8, op="paint", colour=colour)
        bone = shade(K["boatYellow2"], -6)
        wrist = at(18, 22, 0.5)
        wg.round_cone(at(0, 4, 0.5), wrist, 1.8, 1.6, k=0.4, colour=bone)
        wg.round_cone(wrist, at(52, 44, 0.6), 1.5, 1.2, k=0.4, colour=bone)
        for x, y in ((58, 18), (46, -2), (26, -14)):
            wg.round_cone(wrist, at(x, y, 0.6), 1.1, 0.8, k=0.4, colour=bone)
        wg.round_cone(wrist, wrist + v * 10 + u * -2, 2.2, 0.3, k=0.5)  # the hooked claw
        m.part(wg, f"wing_{lr}_mesh", pivot, voxel=0.45, budget=1100)

    # ---- the tail: from low on the back, curling out and up to a burning torch.
    t = Sculpt(K["surimiOrange"])
    curve = [S(12, -12, CZ - 20), S(30, -18, CZ - 12), S(44, -16, CZ + 12), S(50, -10, CZ + 42), S(52, -6, CZ + 56)]
    t.chain(curve, [2.6, 2.3, 2.2, 2.2, 2.4], k=1)
    m.part(t, "tail_mesh", body_pivot, voxel=0.4, budget=900)
    torch = S(52, -6, CZ + 56)
    for i, (dx, h, w, lean) in enumerate(((0, 18, 12, -0.15), (-4, 12, 8, 0.55), (4, 12, 8, -0.75))):
        mane_flame(m, body_pivot, f"torch_{i}", torch + Vector((dx, 0, -1)), h, w, lean)

    # ---- the mane of flames: two rows, the back one taller, leaning out from the middle.
    mane = m.pivot("mane", S(0, -4, TOP - 10) * PX, body_pivot)
    mane["stageScale"] = 0.22
    for i, (dx, h, w, lean, z) in enumerate((
        (-16, 26, 8, 0.5, -6), (-9, 36, 8, 0.25, -7), (-2, 44, 9, 0.06, -8), (6, 42, 9, -0.12, -7), (13, 32, 8, -0.32, -6), (19, 22, 7, -0.6, -5),
        (-19, 18, 7, 0.7, 2), (-11, 24, 8, 0.35, 3), (-3, 28, 8, 0.1, 4), (5, 30, 8, -0.1, 4), (12, 24, 8, -0.38, 3), (18, 16, 7, -0.7, 1),
    )):
        # (Ridden: the middle ones make way for the rider.)
        mane_flame(m, mane, f"mane_{i}", S(dx, z - 4, TOP - 10), h, w, -lean, ridden=0 if abs(dx) < 8 else None)

    # ---- four little yellow horns on the brow (they grow).
    for i, (x, z, lean, size) in enumerate(((-14, TOP - 12, 0.45, 1), (14, TOP - 12, -0.45, 1), (0, TOP - 8, 0, 1.05), (0, TOP - 19, 0, 0.8))):
        at, n = m.surface(body, x, z)
        base = at / PX
        pivot = m.pivot(f"horn_{i}", at, body_pivot)
        pivot["stageScale"] = 0.22
        axis = (Vector((0, 0, 1)) * 0.94 + Vector(n) * 0.35)
        axis = Matrix.Rotation(-lean, 3, Vector((0, 1, 0))) @ axis.normalized()
        h = Sculpt(K["carpYellow"])
        h.round_cone(base - axis * 2, base + axis * 9 * size, 2.8 * size, 0.4, k=0.5)
        m.part(h, f"horn_{i}_mesh", pivot, voxel=0.3, budget=250)

    face(m, body, body_pivot)
    m.pivot("seat", P(0, -14, TOP - 6), body_pivot)
    m.pivot("seat_ride", P(0, -4, TOP - 4), body_pivot)
    return m


def face(m, body, parent):
    eye_z = CZ + 2
    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        x = side * 10
        at, n = m.surface(body, x, eye_z)
        right, up, out = m.tangent_frame(n, roll=side * 0.35)
        F = frame(right, up, out)
        p = at / PX
        on = lambda a, b, c: p + right * a + up * b + out * c
        # An almond eye slanting down to the nose: angry.
        e = Sculpt(INK)
        e.ellipsoid(on(0, 0, 0.2), (5.9, 4.4, 1.5), F)
        e.ellipsoid(on(0, 0, 0.6), (5.5, 4.0, 1.8), F, colour=K["autumnRed"])
        e.ellipsoid(on(-side * 1, 0, 1.2), (2.0, 2.6, 1.6), F)
        e.ball(on(-side * 0.2, 1.2, 2.3), 0.8, colour=K["washi"])
        m.part(e, f"eye_{lr}", parent, voxel=0.25, budget=300, role="flat", face="open", smooth=0)
        # Shut: an angry line.
        lid = Sculpt(INK)
        lid.round_cone(on(-side * 6, 1, 1.2), on(side * 6, -1.5, 1.2), 1.1, 1.1)
        m.part(lid, f"lid_{lr}", parent, voxel=0.25, budget=120, role="flat", face="shut", smooth=0)
        # The frown over it.
        at2, n2 = m.surface(body, x, eye_z + 6)
        r2, u2, o2 = m.tangent_frame(n2)
        q = at2 / PX
        br = Sculpt(INK)
        br.round_cone(q - r2 * side * 7 - u2 * 2 + o2 * 1.2, q + r2 * side * 7 + u2 * 3 + o2 * 1.0, 1.1, 1.1)
        m.part(br, f"brow_{lr}", parent, voxel=0.25, budget=150, role="flat", smooth=0)

    # The mouth: wide, dark red inside, rows of sharp teeth; wider open when it cries.
    at, n = m.surface(body, 0, CZ - 15)
    right, up, out = m.tangent_frame(n)
    F = frame(right, up, out)
    p = at / PX
    on = lambda a, b, c: p + right * a + up * b + out * c
    for face_kind, open_k in (("smile", 1.0), ("talk", 1.7)):
        mo = Sculpt(shade(K["samuraiRed"], -18))
        mo.ellipsoid(on(0, 0, 0.3), (13, 4.5 * open_k, 1.6), F)
        mo.ellipsoid(on(0, 0, 0.1), (13.3, 4.8 * open_k, 1.3), F, colour=INK)
        for i in range(8):
            tx = (i - 3.5) * 3.1
            ty = (3.4 - abs(tx) * 0.07) * open_k
            mo.round_cone(on(tx, ty, 1.4), on(tx, ty - 3.2, 1.6), 1.2, 0.2, colour=K["washi"])
            if i > 0:
                lx = (i - 4) * 3.1
                ly = (-3.2 + abs(lx) * 0.07) * open_k
                mo.round_cone(on(lx, ly, 1.4), on(lx, ly + 2.8, 1.6), 1.1, 0.2, colour=K["washi"])
        m.part(mo, f"mouth_{face_kind}", parent, voxel=0.22, budget=900, role="flat", face=face_kind, smooth=0)
    # The forked tongue, hanging out to the side.
    tg = Sculpt(K["peachRed"])
    t0, t1, t2 = on(3, -1, 2.5), on(8, -9, 5), on(11, -15, 5.5)
    tg.chain([t0, t1, t2], [1.8, 1.5, 1.2], k=0.6)
    tg.round_cone(t2, t2 + right * -1.5 + up * -4, 1.0, 0.4, k=0.4)
    tg.round_cone(t2, t2 + right * 2.5 + up * -3.5, 1.0, 0.4, k=0.4)
    m.part(tg, "tongue", parent, voxel=0.3, budget=400)
    # Two nostrils.
    ns = Sculpt(INK)
    for side in (-1, 1):
        a2, n3 = m.surface(body, side * 3, CZ - 7)
        ns.ellipsoid(a2 / PX + Vector(n3) * 0.3, (1.1, 1.1, 0.8))
    m.part(ns, "nostrils", parent, voxel=0.25, budget=120, role="flat", smooth=0)
