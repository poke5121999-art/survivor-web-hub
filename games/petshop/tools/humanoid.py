"""Unity Mecanim humanoid clips -> per-bone local rotations (and hips position) for one Avatar.

A humanoid AnimationClip stores no Transform curves: Animator bindings (typeID 95, customType 8) carry the human pose,
attribute = HumanoidMuscleType index:
  0..6 Motion T/Q, 7..13 Root T/Q (body centre, normalised by HumanConstant.m_Scale), 14..41 IK goals (LeftFoot,
  RightFoot, LeftHand, RightHand: T xyz + Q xyzw), 42..96 the 55 body muscles, 97..136 finger muscles (hand x finger x
  [1 Stretched, Spread, 2 Stretched, 3 Stretched]), 137.. TDoF translations (not used).
The Avatar (AvatarConstant.m_Human) gives the human skeleton (parent ids, T-pose locals) and per bone an Axes record
(PreQ, PostQ, Sgn, Limit min/max in radians, Type). Mecanim turns the 3 muscle values (x roll, y left-right, z
front-back) of a bone into its local rotation:
  xyz = Sgn * (m >= 0 ? m * Max : m * -Min)         (LimitUnproject)
  q   = ZYRoll2Quat(tan(xyz / 2))                   (Type 1; normalise(x, y + x*z, z - x*y, 1))
  local = PreQ * q * conj(PostQ)
RootT / RootQ are the BODY, not the hips: its rotation is the frame of the hip and shoulder lines (up = mid upper arms
- mid upper legs, right = (R - L upper leg) + (R - L upper arm)), which reproduces HumanConstant.m_RootX.q exactly on
the T-pose; its position is the centre of mass (taken as the mass-weighted human bones plus the T-pose offset to
m_RootX.t). The hips are rotated and moved so that this body frame lands on the clip's RootQ / RootT; with a bent spine
the pelvis then tilts against it as in Unity (placing the hips as the body itself shortened the stride by ~1/3 and
turned the women's walk into a sideways skate).
check() compares the feet this gives with the clip's own LeftFootT / RightFootT goal curves.
"""
import math
import numpy as np

# mecanim body bone order (HumanConstant.m_HumanBoneIndex): bone -> (muscle for x, y, z) as indices into the 55 body
# muscles (attribute - 42); -1 = no muscle on that axis
BONE_DOF = {
    7: (2, 1, 0),      # Spine: roll, left-right, front-back
    8: (5, 4, 3),      # Chest
    9: (8, 7, 6),      # UpperChest
    10: (11, 10, 9),   # Neck: turn, tilt, nod
    11: (14, 13, 12),  # Head
    1: (23, 22, 21),   # LeftUpperLeg: twist, in-out, front-back
    2: (31, 30, 29),   # RightUpperLeg
    3: (25, -1, 24),   # LeftLowerLeg: twist, -, stretch
    4: (33, -1, 32),   # RightLowerLeg
    5: (-1, 27, 26),   # LeftFoot: -, twist in-out, up-down
    6: (-1, 35, 34),   # RightFoot
    20: (-1, -1, 28),  # LeftToes
    21: (-1, -1, 36),  # RightToes
    12: (-1, 38, 37),  # LeftShoulder: -, front-back, down-up
    13: (-1, 47, 46),  # RightShoulder
    14: (41, 40, 39),  # LeftUpperArm: twist, front-back, down-up
    15: (50, 49, 48),  # RightUpperArm
    16: (43, -1, 42),  # LeftLowerArm: twist, -, stretch
    17: (52, -1, 51),  # RightLowerArm
    18: (-1, 45, 44),  # LeftHand: -, in-out, down-up
    19: (-1, 54, 53),  # RightHand
}


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def qconj(q):
    return np.array([-q[0], -q[1], -q[2], q[3]])


def qrot(q, v):
    p = qmul(qmul(q, np.array([v[0], v[1], v[2], 0.0])), qconj(q))
    return p[:3]


def V(d, keys="xyz"):
    return np.array([d[k] for k in keys], dtype=np.float64)


def swing_twist(d):
    """ShaderMotion HumanAxes.SwingTwist: AngleAxis(|d.yz|, d.yz) * AngleAxis(d.x, X), angles in radians."""
    yz = math.hypot(d[1], d[2])
    sw = np.array([0.0, 0.0, 0.0, 1.0])
    if yz > 1e-9:
        s = math.sin(yz / 2) / yz
        sw = np.array([0.0, d[1] * s, d[2] * s, math.cos(yz / 2)])
    tw = np.array([math.sin(d[0] / 2), 0.0, 0.0, math.cos(d[0] / 2)])
    return qmul(sw, tw)


def mat2q(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4])
    i = int(np.argmax(np.diag(m)))
    if i == 0:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        return np.array([s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
    if i == 1:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        return np.array([(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
    s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
    return np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s])


def zyroll2quat(h):
    q = np.array([h[0], h[1] + h[0] * h[2], h[2] - h[0] * h[1], 1.0])
    return q / np.linalg.norm(q)


def rollzy2quat(h):
    q = np.array([h[0], h[1] - h[0] * h[2], h[2] + h[0] * h[1], 1.0])
    return q / np.linalg.norm(q)


class Avatar:
    def __init__(self, a):
        """a = Avatar typetree with {'data': ...} wrappers removed."""
        A = a["m_Avatar"]
        H = A["m_Human"]
        sk = H["m_Skeleton"]
        self.tos = {int(k): v for k, v in a["m_TOS"]}
        self.parent = [n["m_ParentId"] for n in sk["m_Node"]]
        self.axes_id = [n["m_AxesId"] for n in sk["m_Node"]]
        self.names = [self.tos.get(i, "") for i in sk["m_ID"]]
        self.axes = sk["m_AxesArray"]
        X = H["m_SkeletonPose"]["m_X"]
        self.t0 = [V(x["t"]) for x in X]
        self.q0 = [V(x["q"], "xyzw") for x in X]
        self.bone = H["m_HumanBoneIndex"]
        self.mass = H["m_HumanBoneMass"]
        self.hands = [H["m_LeftHand"]["m_HandBoneIndex"], H["m_RightHand"]["m_HandBoneIndex"]]
        self.scale = H["m_Scale"]
        self.rootT = V(H["m_RootX"]["t"])
        self.rootQ = V(H["m_RootX"]["q"], "xyzw")
        # T-pose globals, and the centre-of-mass -> m_RootX.t offset in the body frame
        self.g0q, self.g0t = self.fk(self.q0)
        bq, bt = self.body(self.g0t)
        self.com_off = qrot(qconj(bq), self.rootT - bt)

    def body(self, gt):
        """Body frame (q, centre of mass) of a pose given the human nodes' global positions."""
        B = self.bone
        lul, rul, lua, rua = gt[B[1]], gt[B[2]], gt[B[14]], gt[B[15]]
        up = (lua + rua) / 2 - (lul + rul) / 2
        up /= np.linalg.norm(up)
        r = (rul - lul) + (rua - lua)
        r = r - up * np.dot(r, up)
        r /= np.linalg.norm(r)
        f = np.cross(r, up)
        q = mat2q(np.stack([r, up, f], 1))
        w = [(self.mass[b], gt[B[b]]) for b in range(min(len(self.mass), len(B))) if B[b] >= 0]
        com = sum(m * p for m, p in w) / sum(m for m, _ in w)
        return q, com

    def fk(self, locq, hips=None):
        gq, gt = [None] * len(self.parent), [None] * len(self.parent)
        for i, p in enumerate(self.parent):
            lq, lt = locq[i], self.t0[i]
            if hips is not None and i == self.bone[0]:
                gq[i], gt[i] = hips
                continue
            if p < 0:
                gq[i], gt[i] = lq, lt
            else:
                gq[i] = qmul(gq[p], lq)
                gt[i] = gt[p] + qrot(gq[p], lt)
        return gq, gt

    def from_axes(self, node, xyz_muscle):
        ax = self.axes[self.axes_id[node]]
        lim = ax["m_Limit"]
        mn, mx, sg = V(lim["m_Min"]), V(lim["m_Max"]), V(ax["m_Sgn"])
        m = np.array(xyz_muscle, dtype=np.float64)
        ang = sg * np.where(m >= 0, m * mx, m * -mn)
        q = swing_twist(ang)
        return qmul(qmul(V(ax["m_PreQ"], "xyzw"), q), qconj(V(ax["m_PostQ"], "xyzw")))

    def pose(self, val):
        """val: dict attribute -> value for one frame. Returns (local quats per human node, hips global (q, t))."""
        g = lambda a: val.get(a, 0.0)
        locq = list(self.q0)
        mus = [g(42 + i) for i in range(55)]
        for b, dof in BONE_DOF.items():
            node = self.bone[b] if b < len(self.bone) else -1
            if node is None or node < 0:
                continue
            locq[node] = self.from_axes(node, [mus[d] if d >= 0 else 0.0 for d in dof])
        for hand in range(2):
            idx = self.hands[hand]
            for f in range(5):
                base = 97 + hand * 20 + f * 4
                st1, spread, st2, st3 = g(base), g(base + 1), g(base + 2), g(base + 3)
                for k, xyz in enumerate([(0.0, spread, st1), (0.0, 0.0, st2), (0.0, 0.0, st3)]):
                    node = idx[f * 3 + k] if f * 3 + k < len(idx) else -1
                    if node is not None and node >= 0:
                        locq[node] = self.from_axes(node, xyz)
        rq = np.array([g(10), g(11), g(12), g(13)])
        rq = rq / (np.linalg.norm(rq) or 1)
        rt = np.array([g(7), g(8), g(9)]) * self.scale
        # pose the limbs with the hips at their T-pose, measure the body frame, then move the hips so that the body
        # frame equals the clip's (RootT, RootQ)
        h = self.bone[0]
        h0 = (self.g0q[h], self.g0t[h])
        _, gt = self.fk(locq, h0)
        bq, bt = self.body(gt)
        bt = bt + qrot(bq, self.com_off)
        c = qmul(rq, qconj(bq))
        hips_q = qmul(c, h0[0])
        hips_t = rt + qrot(c, h0[1] - bt)
        return locq, (hips_q, hips_t)

    def check(self, frames):
        """Mean distance (m) between the FK ankles and the clip's LeftFootT / RightFootT goals over the frames."""
        errs = []
        for val in frames:
            locq, hips = self.pose(val)
            gq, gt = self.fk(locq, hips)
            rq = np.array([val.get(10, 0), val.get(11, 0), val.get(12, 0), val.get(13, 1)])
            rq = rq / np.linalg.norm(rq)
            rt = np.array([val.get(7, 0), val.get(8, 0), val.get(9, 0)]) * self.scale
            for foot, base in ((self.bone[5], 14), (self.bone[6], 21)):
                goal = np.array([val.get(base, 0), val.get(base + 1, 0), val.get(base + 2, 0)]) * self.scale
                rel = qrot(qconj(rq), gt[foot] - rt)
                errs.append(np.linalg.norm(rel - goal))
        return float(np.mean(errs)), float(np.max(errs))
