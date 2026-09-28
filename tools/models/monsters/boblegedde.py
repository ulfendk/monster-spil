"""
Boblegedde — a pike: long and lean, grey-green with dark green bands, a pale belly, a long jaw
full of teeth, fierce eyes, fins at its back and a forked tail, bubbles trailing up. At stage
2 (Stormgedde) its fins are bigger. Sizes in px of the picture box (x right, f towards the
viewer — its snout points that way; the game shows fish from the side — z up); it swims.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import fish_tail, side_fins, slab_fin
from lib.sdf import PX, Sculpt

BODY = shade(K["waveAqua2"], -10)
BELLY = K["oldWhite"]
BAND = K["autumnGreen"]


def build():
    m = Model("boblegedde")
    m.root["gait"] = "swim"
    m.root["hover"] = 1
    m.root["view"] = -1.05
    body_pivot = m.pivot("body", P(0, 0, -40))
    s = Sculpt(BODY)
    s.chain([S(0, 26, -28), S(0, 14, -26), S(0, -2, -26), S(0, -16, -26), S(0, -26, -26)], [6, 10.5, 12, 8, 3.5], k=4)
    s.ellipsoid(S(0, 25, -32), (5, 8, 2.5), k=2)  # the long lower jaw
    s.ellipsoid(S(0, 4, -33), (8, 26, 5), op="paint", colour=BELLY, k=2.5)
    for f in (8, -2, -12):
        s.ellipsoid(S(0, f, -18), (13, 2.5, 8), op="paint", colour=BAND, k=1.2, only=BODY)
    slab_fin(s, S(0, -12, -17), [(-2, 0), (4, 0), (0, 8), (-8, 6)], colour=BAND)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    fish_tail(m, body_pivot, S(0, -26, -26), BAND, size=1.0)
    side_fins(m, body_pivot, 9, 8, -31, BAND, size=0.9)
    eyes(m, body, body_pivot, 5, -23, size=0.6, kind="fierce", iris=K["carpYellow"])
    mouth(m, body, body_pivot, -30, kind="grin", width=0.6)
    chest_mark(m, body, body_pivot, -32, shade(K["springBlue"], 18), size=0.5)
    m.pivot("seat", P(0, 0, -14), body_pivot)
    return m
