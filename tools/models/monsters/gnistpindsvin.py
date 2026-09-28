"""
Gnistpindsvin — a spark hedgehog: a round brown hedgehog with a pale face and belly, a long
pointed snout with a dark nose, little round ears, a smile, and a coat of spikes tipped in
crackling yellow, sparks flying off it. At stage 2 (Lynpindsvin) its spikes are bigger. Sizes in
px of the picture box (x right, f towards the viewer, z up); four legs swing from the hip.
"""
import math

from mathutils import Vector

from lib.features import cheeks, chest_mark, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.parts import legs4
from lib.sdf import PX, Sculpt

BODY = K["boatYellow1"]
FACE = K["oldWhite"]
TIP = K["carpYellow"]


def build():
    m = Model("gnistpindsvin")
    m.root["gait"] = "trot"
    m.root["view"] = -0.78
    body_pivot = m.pivot("body", P(0, 0, -52))
    s = Sculpt(BODY)
    s.ellipsoid(S(0, -4, -34), (17, 20, 14), k=0)
    s.ellipsoid(S(0, 12, -32), (11, 10, 10), k=5, colour=FACE)  # the face
    s.round_cone(S(0, 18, -33), S(0, 28, -35), 6, 2.4, k=3, colour=FACE)  # the snout
    s.ball(S(0, 29.5, -35), 2.2, k=0.6, colour=K["sumiInk4"])
    for side in (-1, 1):
        s.ball(S(side * 9, 8, -24), 3.4, k=1.2, colour=FACE)
    body = m.part(s, "body_mesh", body_pivot, budget=4500, stage_shade=True)
    coat = m.pivot("coat", P(0, -6, -34), body_pivot)
    coat["stageScale"] = 0.2
    sp = Sculpt(BODY)
    for row in range(5):
        pitch = 0.05 + row * 0.32
        n = 10 - row
        for i in range(n):
            yaw = math.pi + (i - (n - 1) / 2) * (2.6 / n)
            d = Vector((math.cos(pitch) * math.sin(yaw), -math.cos(pitch) * math.cos(yaw), math.sin(pitch)))
            base = S(0, -6, -34) + Vector((d.x * 16, d.y * 19, d.z * 13))
            tip = base + d * 9
            sp.round_cone(base - d * 2, tip, 2.4, 0.4, k=0.5)
            sp.ball(tip - d * 1.2, 1.3, op="paint", colour=TIP)
    m.part(sp, "spikes", coat, voxel=0.3, budget=2500, stage_shade=True)
    legs4(m, shade(BODY, -10), ((-8, 6), (8, 6), (8, -16), (-8, -16)), -42, radius=3.6)
    eyes(m, body, body_pivot, 5.5, -29, size=0.66)
    cheeks(m, body, body_pivot, 9, -33, size=0.5)
    mouth(m, body, body_pivot, -38, kind="smile", width=0.45)
    chest_mark(m, body, body_pivot, -42, shade(TIP, 10), size=0.45)
    m.pivot("seat", P(0, -6, -18), body_pivot)
    return m
