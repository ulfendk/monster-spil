"""
Perlemusling — a pearl mussel: a violet shell lying open a little, the pink body inside with a
kawaii face peeking out and a pearl on its tongue. Crying, its shell opens wide. At stage 2
(Perleskjold) its pearl is bigger and ridges stand on its shell. Sizes in px of the picture
box (x right, f towards the viewer, z up); it hops.
"""
import math

from mathutils import Matrix, Vector

from lib.features import cheeks, eyes, mouth
from lib.model import Model, P, S
from lib.palette import K, mix, shade
from lib.sdf import PX, Sculpt

SHELL = shade(K["oniViolet"], -10)
INSIDE = K["sakuraPink"]


def half(m, parent, name, top, angle, face=None, stages=(1, 3)):
    """A shell half: a flattened dome with ribs fanning from the hinge at the back, hinged open by `angle`."""
    hinge = S(0, -16, -38)
    R = Matrix.Rotation(-angle if top else 0, 3, Vector((1, 0, 0)))
    s = Sculpt(SHELL)
    sign = 1 if top else -1
    c = hinge + R @ S(0, 16, sign * 2)
    s.ellipsoid(c, (21, 17, 6), k=0)
    s.ellipsoid(c + R @ Vector((0, 0, -sign * 4)), (19.5, 15.5, 5), op="sub", k=1)
    for i in range(7):
        a = (i - 3) * 0.32
        tip = c + R @ S(math.sin(a) * 19, math.cos(a) * 15, sign * 3.5)
        s.round_cone(hinge + R @ S(0, 1, sign * 3), tip, 1.4, 1.8, op="paint", colour=shade(SHELL, 14))
    m.part(s, name, parent, voxel=0.4, budget=1800, face=face, stages=stages)


def build():
    m = Model("perlemusling")
    m.root["gait"] = "bound"
    body_pivot = m.pivot("body", P(0, 0, -52))
    half(m, body_pivot, "shell_bottom", False, 0)
    half(m, body_pivot, "shell_top", True, 0.75, face="smile")
    half(m, body_pivot, "shell_top_open", True, 1.1, face="talk")
    s = Sculpt(INSIDE)
    s.ellipsoid(S(0, 4, -32), (15, 12, 11), k=0)
    body = m.part(s, "body_mesh", body_pivot, budget=2500)
    p = Sculpt(K["washi"])
    p.ball(S(0, 15, -39), 4.5)
    pearl = m.pivot("pearl", S(0, 15, -39) * PX, body_pivot)
    pearl["stageScale"] = 0.35
    m.part(p, "pearl_mesh", pearl, voxel=0.3, budget=500)
    eyes(m, body, body_pivot, 6, -28, size=0.75)
    cheeks(m, body, body_pivot, 10, -32, size=0.5)
    mouth(m, body, body_pivot, -34, kind="smile", width=0.45)
    m.pivot("seat", P(0, -8, -28), body_pivot)
    return m
