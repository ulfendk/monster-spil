"""
Halmhane — a straw rooster: a plump golden hen of a cockerel with a pale breast, a red comb
and wattle, an orange beak, golden wings, a tail of dark sickle feathers arching back, and
orange legs. At stage 2 (Ildhane) its comb is a crest of flame. Sizes in px of the picture
box (x right, f towards the viewer, z up); its legs swing from the hip.
"""
from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import FEET_Z, bird_legs, feather_wing
from lib.sdf import PX, Sculpt

BODY = K["carpYellow"]
BELLY = K["washi"]
RED = K["autumnRed"]
DARK = K["sumiInk5"]


def build():
    m = Model("halmhane")
    m.root["gait"] = "fly"
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -2, -30), (16, 18, 16), k=0)
    s.ellipsoid(S(0, 7, -8), (11, 10.5, 10.5), k=6)  # the head
    s.ellipsoid(S(0, 9, -32), (11, 10, 11), op="paint", colour=BELLY, k=3)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)

    b = Sculpt(K["surimiOrange"])
    b.round_cone(S(0, 16, -8), S(0, 23, -9.5), 3.2, 0.6, k=0.8)
    b.ellipsoid(S(0, 16, -16), (3, 2.5, 5), k=1.5, colour=RED)  # the wattle
    m.part(b, "beak", body_pivot, voxel=0.3, budget=500)
    comb = Sculpt(RED)
    for f, z, r in ((10, 2, 3.4), (6, 4.5, 4), (1, 4, 3.6), (-3, 1.5, 3)):
        comb.ball(S(0, f, z), r, k=1.2)
    m.part(comb, "comb", body_pivot, voxel=0.3, budget=600, stages=(1, 1))
    for i, (f, h) in enumerate(((8, 11), (3, 14), (-2, 11))):
        flame(m, S(0, f, 1), body_pivot, f"comb_flame_{i}", height=h, width=3.8, lean=S(0, -0.25, 1), stages=(2, 3))

    tail = m.pivot("tail", S(0, -16, -24) * PX, body_pivot)
    t = Sculpt(DARK)
    for dx, up in ((-3, 0), (0, 5), (3, 1)):
        t.chain([S(dx, -16, -24), S(dx * 1.3, -26, -14 + up * 0.4), S(dx * 1.5, -28, -1 + up), S(dx * 1.4, -22, 5 + up), S(dx * 1.2, -18, 3 + up)], [3, 2.8, 2.4, 1.8, 0.8], k=1)
    m.part(t, "tail_mesh", tail, voxel=0.3, budget=900)

    for side in (-1, 1):
        feather_wing(m, body_pivot, side, S(side * 14, 1, -25), shade(BODY, -8), tip=shade(BODY, -22), length=26, height=19)
    bird_legs(m, K["surimiOrange"], 6, 0, -42)

    eyes(m, body, body_pivot, 5.5, -5, size=0.65)
    cheeks(m, body, body_pivot, 9, -10, size=0.55)
    mouth(m, body, body_pivot, -12, kind="none")
    chest_mark(m, body, body_pivot, -30, shade(K["surimiOrange"], 10), size=0.55)
    m.pivot("seat", P(0, -6, -14), body_pivot)
    return m
