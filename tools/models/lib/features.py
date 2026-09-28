"""
Pieces every sculpted monster has, placed on its sculpted surface: eyes (open and blinking),
mouths (a smile, a cat's ω, open for crying), a fang, cheeks, the chest mark of a later
stage and the golden crown of stage 3. Sizes in px of the picture box (see lib/model.py).
"""
import math

from mathutils import Vector

from .model import Model
from .palette import INK, K
from .sdf import PX, Sculpt, frame


def _on(m: Model, body, x, z, roll=0.0, **kw):
    """A spot on the body seen from the front at (x, z), and a way to place things round it."""
    at, n = m.surface(body, x, z, **kw)
    right, up, out = m.tangent_frame(n, roll=roll)
    p = at / PX
    return (lambda a, b, c: p + right * a + up * b + out * c), frame(right, up, out)


def eyes(m: Model, body, parent, x, z, size=1.0, iris=None, tilt=0.12, name="eye", kind="kawaii", skin=None):
    """
    Eyes at (±x, z) and how they blink (owl: big round eyes in pale rings). `kind`: kawaii (big, an ink rim, a coloured iris or all
    ink, a pupil, two glints; a happy arc when blinking), fierce (the same, smaller, slanting,
    under an angry brow), sleepy (half shut under a heavy lid), glow (glowing, no pupil — lava
    and spirits), dot (small ink dots).
    """
    for side in (-1, 1):
        roll = side * (0.35 if kind == "fierce" else tilt)
        on, F = _on(m, body, side * x, z, roll=roll)
        s = size * (0.8 if kind == "fierce" else 0.55 if kind == "dot" else 1.0)
        lr = "L" if side < 0 else "R"
        e = Sculpt(INK)
        if kind == "blind":
            # Milky, no pupil: a cave fish's.
            e.ellipsoid(on(0, 0, 0.3), (6.4 * s, 6.4 * s, 1.6 * s), F, colour=K["katanaGray"])
            e.ellipsoid(on(0, 0, 0.8), (5.6 * s, 5.6 * s, 1.8 * s), F, colour=K["washi"])
            e.ball(on(side * 1.6 * s, 1.8 * s, 1.9), 1.3 * s, colour=0xFFFFFF)
        elif kind == "glow":
            e.ellipsoid(on(0, 0, 0.3), (6.4 * s, 5.2 * s, 1.6 * s), F)
            e.ellipsoid(on(0, 0, 0.8), (5.4 * s, 4.2 * s, 1.8 * s), F, colour=iris or K["surimiOrange"])
            e.ellipsoid(on(0, 0.6 * s, 1.4), (3.2 * s, 2.4 * s, 1.6 * s), F, colour=K["carpYellow"])
        elif kind == "owl":
            # Big round eyes in pale rings.
            e.ellipsoid(on(0, 0, 0.2), (9 * s, 9 * s, 1.4 * s), F, colour=K["oldWhite"])
            e.ellipsoid(on(0, 0, 0.7), (6.2 * s, 6.2 * s, 1.8 * s), F, colour=iris or K["carpYellow"])
            e.ellipsoid(on(0, 0, 1.3), (3.8 * s, 3.8 * s, 1.8 * s), F)
            e.ball(on(side * 1.6 * s, 1.8 * s, 2.3), 1.4 * s, colour=K["washi"])
        elif kind == "dot":
            e.ellipsoid(on(0, 0, 0.5), (4 * s, 5 * s, 1.6 * s), F)
            e.ball(on(side * 1.2 * s, 1.6 * s, 1.6), 1.3 * s, colour=K["washi"])
        else:
            h = 0.55 if kind == "sleepy" else 1.0
            if iris is None:
                e.ellipsoid(on(0, -1.5 * (1 - h) * s, 0.5), (6.2 * s, 7.8 * s * h, 2.0 * s), F)
            else:
                e.ellipsoid(on(0, 0, 0.3), (7.2 * s, 8.8 * s * h, 1.6 * s), F)
                e.ellipsoid(on(0, 0, 0.8), (6.2 * s, 7.8 * s * h, 1.9 * s), F, colour=iris)
                e.ellipsoid(on(-side * 0.4 * s, -0.3 * s, 1.5), (4.2 * s, 6.2 * s * h, 1.9 * s), F)
            e.ball(on(side * 2.2 * s, 2.6 * s * h, 1.9), 1.9 * s * (0.8 if kind == "sleepy" else 1), colour=K["washi"])
            if kind != "sleepy":
                e.ball(on(-side * 1.8 * s, -3.0 * s, 1.9), 1.0 * s, colour=K["washi"])
        m.part(e, f"{name}_{lr}", parent, voxel=0.3, budget=300, role="flat", face="open", smooth=0)
        lid = Sculpt(INK)
        if kind in ("fierce", "glow", "blind"):
            lid.round_cone(on(-5.5 * s, 1 * s, 1.2), on(5.5 * s, -1.5 * s, 1.2), 1.2 * s, 1.2 * s)
        else:
            arc = [on(6 * s * math.cos(a), 6 * s * math.sin(a) - 2.5 * s, 1.2) for a in (math.radians(d) for d in range(20, 170, 25))]
            lid.chain(arc, [1.3 * s] * len(arc))
        m.part(lid, f"lid_{lr}", parent, voxel=0.3, budget=160, role="flat", face="shut", smooth=0)
        if kind in ("fierce", "sleepy"):
            # An angry brow slanting down to the nose, or a heavy lid.
            br = Sculpt(INK)
            if kind == "fierce":
                br.round_cone(on(side * 7 * s, 8.5 * s, 1.3), on(-side * 6 * s, 5 * s, 1.3), 1.2, 1.2)
            else:
                br.round_cone(on(-6.6 * s, 0.6 * s, 1.4), on(6.6 * s, 0.6 * s, 1.4), 1.1, 1.1)
            m.part(br, f"brow_{lr}", parent, voxel=0.3, budget=150, role="flat", face="open", smooth=0)


def cheeks(m: Model, body, parent, x, z, size=1.0):
    for side in (-1, 1):
        on, F = _on(m, body, side * x, z)
        ck = Sculpt(K["sakuraPink"])
        ck.ellipsoid(on(0, 0, 0.4), (5.5 * size, 3.2 * size, 1.0), F)
        m.part(ck, f"cheek_{'L' if side < 0 else 'R'}", parent, voxel=0.3, budget=200, role="flat", opacity=0.85, smooth=0)


def mouth(m: Model, body, parent, z, kind="smile", width=1.0, fang=False, x=0.0, glow=None):
    """
    A mouth at (x, z) on the front, and open for crying. `kind`: smile (a curve), cat (ω), buck
    (a smile with two front teeth), wide
    (a big grin of a curve), grin (a wide band with teeth — glowing in `glow`'s colour, if
    given), tusks (a smile with two tusks), none (only when it cries: a small open mouth).
    """
    on, F = _on(m, body, x, z)
    sm = Sculpt(INK)
    w = width * (1.6 if kind == "wide" else 1.0)
    if kind == "cat":
        for side in (-1, 1):
            arc = [on(side * 3.2 * w + 3.2 * w * math.cos(a), 3.2 * math.sin(a) + 1, 0.6) for a in (math.radians(d) for d in range(200, 345, 24))]
            sm.chain(arc, [0.9] * len(arc))
    elif kind == "grin":
        sm.ellipsoid(on(0, 0, 0.4), (8 * w, 3.2, 1.4), F, colour=glow or INK)
        sm.ellipsoid(on(0, 0, 0.2), (8.6 * w, 3.8, 1.2), F)
        for i in range(5):
            tx = (i - 2) * 3 * w
            sm.round_cone(on(tx, 2.6, 1.3), on(tx, 0.2, 1.4), 1.1, 0.3, colour=K["washi"])
    elif kind != "none":
        arc = [on(5.5 * w * math.cos(a), 4 * math.sin(a) + 2, 0.6) for a in (math.radians(d) for d in range(205, 340, 15))]
        sm.chain(arc, [1.0] * len(arc))
    if kind == "buck":
        for side in (-1, 1):
            sm.ellipsoid(on(side * 1.4 * w, -3.2, 1.0), (1.3 * w, 2.2, 0.8), F, colour=K["washi"])
    if kind == "tusks":
        for side in (-1, 1):
            sm.round_cone(on(side * 4.5 * w, -0.5, 1.0), on(side * 5.5 * w, 5, 2.2), 1.6, 0.5, colour=K["washi"])
    if fang and kind not in ("grin", "tusks", "none"):
        sm.round_cone(on(3.6 * w, -1.3, 0.8), on(3.9 * w, -4.6, 1.2), 1.5, 0.35, colour=K["washi"])
    if sm.prims:
        m.part(sm, "smile", parent, voxel=0.25, budget=300, role="flat", face="smile", smooth=0)
    om = Sculpt(INK)
    om.ellipsoid(on(0, -1.5, 0.5), (6 * width if kind != "none" else 3.5, 4.8 if kind != "none" else 3, 1.6), F)
    om.ellipsoid(on(0, -3.2, 1.3), (3.6 * width if kind != "none" else 2, 2.0, 1.4), F, colour=K["waveRed"])
    m.part(om, "mouth_open", parent, voxel=0.3, budget=300, role="flat", face="talk", smooth=0)


def chest_mark(m: Model, body, parent, z, colour, x=0.0, size=1.0):
    """The mark of an evolved monster (stage 2 and 3): a diamond on its chest."""
    on, F = _on(m, body, x, z)
    mk = Sculpt(colour)
    mk.slab(on(0, 0, 0.6), F, [(0, 7 * size), (5 * size, 0), (0, -7 * size), (-5 * size, 0)], 2.2, rounding=0.8)
    m.part(mk, "chest_mark", parent, voxel=0.3, budget=200, outline=False, stages=(2, 3))


def crown(m: Model, top_px: Vector, parent, radius=8.5, gem=None):
    """Stage 3: a small golden crown sitting at `top_px` (px, Blender axes)."""
    c = Sculpt(K["carpYellow"])
    c.torus(top_px + Vector((0, 0, 1.5)), radius, 2.1)
    for i in range(5):
        ang = i / 5 * math.tau
        out = Vector((math.cos(ang), math.sin(ang), 0))
        base = top_px + out * radius + Vector((0, 0, 2))
        c.round_cone(base, base + out * 1.6 + Vector((0, 0, 8)), 2.4, 0.7, k=0.8)
        if i % 2 == 0:
            c.ball(base + Vector((0, 0, 0.3)) + out * 2.0, 1.7, colour=gem or K["crystalBlue"])
    m.part(c, "crown_mesh", parent, voxel=0.4, budget=700, stages=(3, 3))


def flame(m: Model, base_px: Vector, parent, name, height=14.0, width=5.0, lean=Vector((0, 0, 1)), stages=(1, 3)):
    """A flame standing on `base_px` (px, Blender axes), leaning along `lean`: orange with a yellow heart, glowing (flat), flickering about its base."""
    pivot = m.pivot(name, base_px * PX, parent)
    pivot["flicker"] = 1
    f = Sculpt(K["surimiOrange"])
    tip = base_px + lean.normalized() * height
    f.round_cone(base_px, base_px + lean.normalized() * height * 0.35, width * 0.75, width, k=1.5)
    f.round_cone(base_px + lean.normalized() * height * 0.35, tip, width, 0.5, k=1.5)
    f.ellipsoid(base_px + lean.normalized() * height * 0.3, (width * 0.7, width * 0.7, height * 0.3), op="paint", colour=K["carpYellow"], k=1.5)
    m.part(f, f"{name}_mesh", pivot, voxel=0.35, budget=300, role="flat", stages=stages, smooth=1)
    return pivot
