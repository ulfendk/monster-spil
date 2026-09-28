"""
Tågefisk — a mist fish: a soft sea-green fish with sleepy eyes and long see-through veil fins
trailing like mist, mist drifting about it. At stage 2 (Tågehaj) its veils are longer. Sizes
in px of the picture box (x right, f towards the viewer, z up); it swims.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import side_fins
from lib.sdf import PX, Sculpt, frame

BODY = shade(K["waveAqua2"], 10)
VEIL = mix(K["springBlue"], K["washi"], 0.4)


def build():
    m = Model("taagefisk")
    m.root["gait"] = "swim"
    m.root["hover"] = 1
    m.root["view"] = -1.05
    body_pivot = m.pivot("body", P(0, 0, -42))
    s = Sculpt(BODY)
    s.chain([S(0, 16, -26), S(0, 4, -26), S(0, -10, -26), S(0, -18, -26)], [9, 13, 10, 4], k=5)
    s.ellipsoid(S(0, 2, -34), (9, 14, 5), op="paint", colour=K["washi"], k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)

    # Veils: long see-through fins trailing back — the tail, and one above and one below.
    tail = m.pivot("tail", S(0, -18, -26) * PX, body_pivot)
    tail["stageScale"] = 0.3
    F = frame(S(0, -1, 0), Vector((0, 0, 1)), Vector((1, 0, 0)))
    v = Sculpt(VEIL)
    v.slab(S(0, -18, -26), F, [(0, 4), (10, 14), (22, 16), (30, 8), (26, 0), (30, -8), (22, -18), (10, -14), (0, -4)], 1.4, rounding=0.6)
    m.part(v, "veil_tail", tail, voxel=0.3, budget=700, opacity=0.7)
    for name, pts, base in (("veil_top", [(-8, 0), (8, 0), (0, 10), (-18, 12)], S(0, 0, -15)), ("veil_bottom", [(-6, 0), (6, 0), (-4, -9), (-16, -11)], S(0, -2, -37))):
        w = Sculpt(VEIL)
        w.slab(base, frame(S(0, 1, 0), Vector((0, 0, 1)), Vector((1, 0, 0))), pts, 1.4, rounding=0.6)
        m.part(w, name, body_pivot, voxel=0.3, budget=500, opacity=0.7)
    side_fins(m, body_pivot, 11, 6, -30, VEIL, size=1.0)

    eyes(m, body, body_pivot, 7, -22, size=0.72, kind="sleepy")
    cheeks(m, body, body_pivot, 10, -27, size=0.5)
    mouth(m, body, body_pivot, -30, kind="smile", width=0.5)
    chest_mark(m, body, body_pivot, -33, shade(K["springBlue"], 18), size=0.5)
    m.pivot("seat", P(0, -2, -14), body_pivot)
    return m
