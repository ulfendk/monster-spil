"""
Sculpting with signed distance fields (after antego's tools/models/build.py): primitives
joined with smooth unions (so a head grows out of a body without a seam), carved with
smooth subtractions, meshed with marching cubes. Every primitive can carry a colour, and
`paint` volumes colour the surface without changing its shape; `colours(obj)` then gives
each vertex the colour of the primitive nearest to it (or the last paint it lies in).

Units are pixels of the monster's 128-px picture box; Blender axes (x right, y back, z up).
`mesh()` scales down to model units (1 = 128 px) when it makes the Blender mesh.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from skimage import measure

V = Vector
PX = 1 / 128


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def _local(X, Y, Z, c, R):
    """World coordinates → primitive-local ones (R's columns are the local axes in world space)."""
    px, py, pz = X - c.x, Y - c.y, Z - c.z
    return (
        R[0][0] * px + R[1][0] * py + R[2][0] * pz,
        R[0][1] * px + R[1][1] * py + R[2][1] * pz,
        R[0][2] * px + R[1][2] * py + R[2][2] * pz,
    )


def _box_bounds(c, R, half):
    corners = [R @ V((sx * half[0], sy * half[1], sz * half[2])) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    lo = V((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
    hi = V((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
    return c + lo, c + hi


def frame(x, y, z):
    """A rotation from three axes (the local x, y and z in world space)."""
    return Matrix((V(x).normalized(), V(y).normalized(), V(z).normalized())).transposed()


class Prim:
    def __init__(self, fn, lo, hi, k, op, colour, only=None):
        self.fn, self.lo, self.hi, self.k, self.op, self.colour, self.only = fn, V(lo), V(hi), k, op, colour, only


class Sculpt:
    def __init__(self, colour=0xFFFFFF):
        self.prims = []
        self.paints = []
        self.colour = colour

    def _add(self, fn, lo, hi, k, op, colour, only=None):
        prim = Prim(fn, lo, hi, k, op, self.colour if colour is None else colour, only)
        (self.paints if op == "paint" else self.prims).append(prim)

    # --- primitives: k is the blend radius (px), op "add", "sub" or "paint"

    def round_cone(self, a, b, r1, r2, k=0.0, op="add", colour=None):
        a, b = V(a), V(b)
        ba = b - a
        l2 = max(ba.dot(ba), 1e-10)
        rr = r1 - r2
        a2 = l2 - rr * rr
        il2 = 1.0 / l2

        def fn(X, Y, Z):
            pax, pay, paz = X - a.x, Y - a.y, Z - a.z
            y = pax * ba.x + pay * ba.y + paz * ba.z
            z = y - l2
            qx, qy, qz = pax * l2 - ba.x * y, pay * l2 - ba.y * y, paz * l2 - ba.z * y
            x2 = qx * qx + qy * qy + qz * qz
            y2 = y * y * l2
            z2 = z * z * l2
            kk = math.copysign(1.0, rr) * rr * rr * x2
            d_end = np.sqrt(x2 + z2) * il2 - r2
            d_start = np.sqrt(x2 + y2) * il2 - r1
            d_mid = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - r1
            return np.where(np.sign(z) * a2 * z2 > kk, d_end, np.where(np.sign(y) * a2 * y2 < kk, d_start, d_mid))

        r = max(r1, r2)
        lo = V((min(a.x, b.x) - r, min(a.y, b.y) - r, min(a.z, b.z) - r))
        hi = V((max(a.x, b.x) + r, max(a.y, b.y) + r, max(a.z, b.z) + r))
        self._add(fn, lo, hi, k, op, colour)

    def chain(self, points, radii, k=0.0, op="add", colour=None):
        """Round cones through a list of points (a tail, a horn, a curved line)."""
        for i in range(len(points) - 1):
            self.round_cone(points[i], points[i + 1], radii[i], radii[i + 1], k, op, colour)

    def ball(self, c, r, k=0.0, op="add", colour=None):
        c = V(c)
        self._add(lambda X, Y, Z: np.sqrt((X - c.x) ** 2 + (Y - c.y) ** 2 + (Z - c.z) ** 2) - r, c - V((r, r, r)), c + V((r, r, r)), k, op, colour)

    def ellipsoid(self, c, radii, R=Matrix.Identity(3), k=0.0, op="add", colour=None, only=None):
        """(A paint with `only` colours just the surface that was that colour.)"""
        c, (rx, ry, rz) = V(c), radii

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            k0 = np.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2)
            k1 = np.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2)
            return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

        lo, hi = _box_bounds(c, R, radii)
        self._add(fn, lo, hi, k, op, colour, only)

    def torus(self, c, major, minor, R=Matrix.Identity(3), k=0.0, op="add", colour=None):
        """A ring lying in the local xy plane."""
        c = V(c)

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            q = np.sqrt(x * x + y * y) - major
            return np.sqrt(q * q + z * z) - minor

        e = major + minor
        lo, hi = _box_bounds(c, R, (e, e, minor))
        self._add(fn, lo, hi, k, op, colour)

    def slab(self, c, R, points, thickness, rounding=0.8, k=0.0, op="add", colour=None):
        """A flat shape (a 2D polygon in the local xy plane, px) pushed out `thickness` px along local z, edges rounded."""
        c = V(c)
        pts = [(float(x), float(y)) for x, y in points]
        h = thickness / 2
        rnd = min(rounding, h * 0.95)

        def fn(X, Y, Z):
            x, y, z = _local(X, Y, Z, c, R)
            d = (x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2
            s = np.ones_like(d)
            n = len(pts)
            for i in range(n):
                vx, vy = pts[i]
                wx_, wy_ = pts[i - 1]
                ex, ey = wx_ - vx, wy_ - vy
                px, py = x - vx, y - vy
                t = np.clip((px * ex + py * ey) / max(ex * ex + ey * ey, 1e-9), 0.0, 1.0)
                bx, by = px - ex * t, py - ey * t
                d = np.minimum(d, bx * bx + by * by)
                c1 = y >= vy
                c2 = y < wy_
                c3 = ex * py > ey * px
                flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
                s = np.where(flip, -s, s)
            d2 = s * np.sqrt(d) + rnd
            wz = np.abs(z) - (h - rnd)
            return np.minimum(np.maximum(d2, wz), 0) + np.sqrt(np.maximum(d2, 0) ** 2 + np.maximum(wz, 0) ** 2) - rnd

        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        half = (max(abs(min(xs)), abs(max(xs))), max(abs(min(ys)), abs(max(ys))), h)
        lo, hi = _box_bounds(c, R, half)
        self._add(fn, lo, hi, k, op, colour)

    # --- evaluation

    def distance(self, X, Y, Z):
        """The shape's distance at points (arrays), without the grid (for tests and colouring)."""
        D = np.full(np.broadcast(X, Y, Z).shape, 1e3, dtype=np.float64)
        for p in self.prims:
            d = p.fn(X, Y, Z)
            D = smax(D, -d, p.k) if p.op == "sub" else smin(D, d, p.k)
        return D

    def mesh(self, name, voxel=0.8):
        """Marching cubes over the shape; the mesh is in model units (px / 128)."""
        adds = [p for p in self.prims if p.op == "add"]
        pad = 3 * voxel + max(p.k for p in self.prims)
        lo = V((min(p.lo.x for p in adds), min(p.lo.y for p in adds), min(p.lo.z for p in adds))) - V((pad,) * 3)
        hi = V((max(p.hi.x for p in adds), max(p.hi.y for p in adds), max(p.hi.z for p in adds))) + V((pad,) * 3)
        n = [int(math.ceil((hi[i] - lo[i]) / voxel)) + 1 for i in range(3)]
        axes = [np.float32(lo[i]) + np.arange(n[i], dtype=np.float32) * np.float32(voxel) for i in range(3)]
        D = np.full(n, 1e3, dtype=np.float32)
        for p in self.prims:
            m = p.k + 2 * voxel
            sl = []
            for i in range(3):
                i0 = max(0, int((p.lo[i] - m - lo[i]) / voxel))
                i1 = min(n[i], int((p.hi[i] + m - lo[i]) / voxel) + 2)
                sl.append(slice(i0, i1))
            if any(s.stop <= s.start for s in sl):
                continue
            X = axes[0][sl[0]][:, None, None]
            Y = axes[1][sl[1]][None, :, None]
            Z = axes[2][sl[2]][None, None, :]
            d = p.fn(X, Y, Z).astype(np.float32)
            block = D[sl[0], sl[1], sl[2]]
            D[sl[0], sl[1], sl[2]] = smax(block, -d, p.k) if p.op == "sub" else smin(block, d, p.k)
        verts, faces, _normals, _ = measure.marching_cubes(D, level=0.0, spacing=(voxel, voxel, voxel))
        verts = (verts + np.array([lo.x, lo.y, lo.z], dtype=np.float32)) * PX
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts.tolist(), [], faces.tolist())
        me.update()
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=voxel * PX * 0.05)
        bm.normal_update()
        # Faces must point out: the topmost face's normal points up.
        top = max(bm.faces, key=lambda f: f.calc_center_median().z)
        if top.normal.z < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        return obj

    def colours(self, obj):
        """Each vertex's colour (0xRRGGBB): the nearest primitive's, then any paint it lies in."""
        co = np.array([v.co[:] for v in obj.data.vertices], dtype=np.float64) / PX
        X, Y, Z = co[:, 0], co[:, 1], co[:, 2]
        best = np.full(len(co), 1e9)
        colour = np.full(len(co), self.colour, dtype=np.int64)
        for p in self.prims:
            if p.op != "add":
                continue
            d = p.fn(X, Y, Z)
            closer = d < best - 1e-6
            best = np.where(closer, d, best)
            colour = np.where(closer, p.colour, colour)
        base = colour
        rgb = np.stack([(colour >> 16) & 255, (colour >> 8) & 255, colour & 255], axis=1).astype(np.float64)
        for p in self.paints:
            # A soft edge (about `p.k` px, at least one) so the paint doesn't follow the triangles.
            soft = max(p.k, 1.0)
            w = np.clip(0.5 - p.fn(X, Y, Z) / (2 * soft), 0.0, 1.0)
            if p.only is not None:
                w = np.where(base == p.only, w, 0.0)
            w = w[:, None]
            paint = np.array([(p.colour >> 16) & 255, (p.colour >> 8) & 255, p.colour & 255], dtype=np.float64)
            rgb = rgb * (1 - w) + paint * w
        rgb = np.clip(np.round(rgb), 0, 255).astype(np.int64)
        return (rgb[:, 0] << 16) | (rgb[:, 1] << 8) | rgb[:, 2]
