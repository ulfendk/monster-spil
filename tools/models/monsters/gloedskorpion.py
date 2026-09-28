"""
Glødskorpion — a glowing scorpion: dark red plates, six legs, two pincers held out in front,
fierce yellow eyes, and a jointed tail curling up over its back to a glowing orange sting.
At stage 2 (Lavaskorpion) a flame burns on the sting. Sizes in px of the picture box (x
right, f towards the viewer, z up); seen from a little to the side.
"""
from mathutils import Vector

from lib.features import chest_mark, eyes, flame, mouth
from lib.model import Model, P, S
from lib.palette import K, shade
from lib.parts import FEET_Z
from lib.sdf import PX, Sculpt

BODY = shade(K["autumnRed"], -12)
DARK = shade(BODY, -10)
GLOW = K["surimiOrange"]


def build():
    m = Model("gloedskorpion")
    m.root["gait"] = "skitter"
    m.root["hips"] = 1
    m.root["view"] = -0.8
    body_pivot = m.pivot("body", P(0, 0, FEET_Z))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, 16, -37), (11, 9, 7.5), k=0)  # the head
    s.ellipsoid(S(0, 3, -37), (14, 11, 8.5), k=3)  # the thorax
    for i, f in enumerate((-9, -17, -24)):
        s.ellipsoid(S(0, f, -37 + i), (13 - i * 2, 6, 7.5 - i * 0.6), k=1.5, colour=BODY if i % 2 else DARK)
    body = m.part(s, "body_mesh", body_pivot, budget=4000, stage_shade=True)

    tail = m.pivot("tail", P(0, -22, -36), body_pivot)
    t = Sculpt(BODY)
    seg = [S(0, -24, -35), S(0, -30, -27), S(0, -31, -17), S(0, -27, -8), S(0, -20, -3), S(0, -13, -3)]
    for i, (a, b) in enumerate(zip(seg, seg[1:])):
        t.ball((a + b) / 2, 5 - i * 0.5, k=1.2, colour=BODY if i % 2 else DARK)
    t.ball(S(0, -9, -4), 4, k=1, colour=GLOW)
    t.round_cone(S(0, -7, -5), S(0, -3, -11), 2, 0.3, k=0.6, colour=GLOW)
    m.part(t, "tail_mesh", tail, voxel=0.35, budget=1200, stage_shade=True)
    flame(m, S(0, -9, 0), tail, "sting_flame", height=10, width=3.5, stages=(2, 3))

    # Six legs: front left, front right, middle right, middle left, back left, back right
    # (so every other one steps together, three at a time).
    for i, (side, f, lean) in enumerate(((-1, 9, 5), (1, 9, 5), (1, 0, 0), (-1, 0, 0), (-1, -9, -5), (1, -9, -5))):
        hip = S(side * 10, f, -39)
        leg = m.pivot(f"foot_{i}", hip * PX, m.root)
        l = Sculpt(DARK)
        l.chain([hip, S(side * 19, f + lean * 0.6, -30), S(side * 25, f + lean * 1.6, FEET_Z + 1)], [2.2, 1.8, 1.1], k=0.6)
        m.part(l, f"leg_{i}", leg, voxel=0.3, budget=350)

    for side in (-1, 1):
        lr = "L" if side < 0 else "R"
        arm = m.pivot(f"arm_{lr}", P(side * 8, 18, -37), body_pivot)
        a = Sculpt(BODY)
        wrist = S(side * 18, 32, -34)
        a.chain([S(side * 8, 18, -38), S(side * 20, 23, -36), wrist], [3, 2.8, 3.2], k=0.8)
        a.ellipsoid(wrist + S(0, 4, 0), (6, 6.5, 4.5), k=1.5)
        a.round_cone(wrist + S(side * 2, 7, 1.5), wrist + S(-side * 1.5, 15, 2), 2.8, 0.6, k=0.6, colour=GLOW)
        a.round_cone(wrist + S(side * 2, 7, -2), wrist + S(-side * 0.5, 13, -2.5), 2.3, 0.6, k=0.6, colour=GLOW)
        m.part(a, f"pincer_{lr}", arm, voxel=0.3, budget=700, stage_shade=True)

    eyes(m, body, body_pivot, 4, -35, size=0.62, kind="fierce", iris=K["carpYellow"])
    mouth(m, body, body_pivot, -40, kind="none")
    chest_mark(m, body, body_pivot, -38, shade(GLOW, 10), size=0.45)
    m.pivot("seat", P(0, 0, -30), body_pivot)
    return m
