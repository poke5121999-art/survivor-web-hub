"""World transforms of scene.json nodes as full affine matrices.

Composing (position, rotation, scale) component-wise is wrong when a parent has non-uniform scale and a child is
rotated (Stage03's district wall: parent scale (1, 0.5, 1.75), child turned 90 degrees, so the child's x axis takes the
parent's 1.75). Matrices keep that right; boxes are read back as centre + the lengths of their transformed axes.
"""
import math


def mat_trs(t, q, s):
    x, y, z, w = q
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], t[i]] for i in range(3)]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) + (a[i][3] if j == 3 else 0) for j in range(4)] for i in range(3)]


def apply(m, v):
    return [m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] + m[i][3] for i in range(3)]


def apply_dir(m, v):
    return [m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] for i in range(3)]


class Xform:
    def __init__(self, nodes):
        self.N = nodes
        self.cache = {}

    def m(self, i):
        if i in self.cache:
            return self.cache[i]
        n = self.N[i]
        local = mat_trs(n.get("t") or (0, 0, 0), n.get("r") or (0, 0, 0, 1), n.get("s") or (1, 1, 1))
        out = local if n["p"] < 0 else mat_mul(self.m(n["p"]), local)
        self.cache[i] = out
        return out

    def box(self, i, center, half):
        """World box of a local (center, half extents) at node i: centre, full sizes along its own x/z axes, yaw.
        yaw rotates +z toward +x (three.js), taken from the transformed local x axis."""
        m = self.m(i)
        c = apply(m, center)
        ax = apply_dir(m, (half[0], 0, 0))
        ay = apply_dir(m, (0, half[1], 0))
        az = apply_dir(m, (0, 0, half[2]))
        L = lambda v: math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
        yaw = math.atan2(-ax[2], ax[0]) if L(ax) > 1e-9 else math.atan2(az[0], az[2])
        return c, [2 * L(ax), 2 * L(ay), 2 * L(az)], yaw

    def aabb(self, i, center, half):
        """Axis-aligned floor rectangle [cx, cz, hx, hz] of a local box at node i."""
        m = self.m(i)
        c = apply(m, center)
        hx = sum(abs(m[0][k]) * half[k] for k in range(3))
        hz = sum(abs(m[2][k]) * half[k] for k in range(3))
        return [c[0], c[2], hx, hz]
