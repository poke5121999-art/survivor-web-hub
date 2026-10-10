"""Sinh vật Stellar Basin (SBMonster) + sứa nổ bào tử (Jellyfish) -> data/sbcreature.js, data/jelly.js, art/sb/*, audio/sb/* (WORLD-GAPS.md §4, đơn vị R2).

Chạy:  python -I games/dredge/tools/sbcreature.py            (~3-5 phút: nạp scene Game.unity 168 MB và 18 clip hoạt ảnh 1-22 MB)
Đọc (chỉ đọc) ở D:/dredge-ref/ripped/ExportedProject/Assets:
  Scenes/Game.unity   StellarBasin/SBMonster (SBMonsterAnimationHelper + VariablePlayerDamager + 4 Animator + AttackTentacleContainer ClampedLookAtTarget +
                      DetectionZone 5 SphereCollider trigger + 3 CapsuleCollider "Collider" ở cuối xúc tu tấn công) và
                      StellarBasin/JellyfishController (22 Jellyfish_Base: Jellyfish + RotationParent ConstantlyRotateOnY + PlayerDetector cầu 0,7)
  Mesh/*.asset        MainMouth_Mesh, MouthTentacles_Mesh, MouthTentacle_Mesh, Largetentacle_1..5, SmallTentacle_1, JellyFish (có trọng số xương)
  AnimationClip/*.anim  SBM_Mouth_*, SBMonster_ATentacle_*, SBM_LTentacles_*, SBM_STentacle_*, jellyfish_idle / jellyfish_explode
  AnimatorController/SBMonsterController + AnimatorOverrideController/SBMonsterTentacles{Attack,Large,Small}, JellyFish_controller
  Material/BioluminescentMouth_Mat, BioluminescentTentacle_Mat, Jellyfish_{Main,Core,Tentacle}_Mat (Shader Graphs/GlowPulseBioLume_Shader;
                      rã DXBC bằng tools/particles.py Shaders.dis -> D:/dredge-ref/cache/sb/GlowPulseBioLume_Shader.txt)
  GameObject/JellySporeEffect.prefab (SphereCollider trigger r 3,5 + JellySporeCollision + AudioSource)
Ra:    window.DR_SBCREATURE, window.DR_JELLY (+ ảnh webp ở art/sb/, tiếng mp3 ở audio/sb/ nếu có ffmpeg)
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w), tam giác đảo chiều, bindpose S·M·S), như tools/tentacle.py.
Bẫy:   - Clip dày (mouth Spawn/Idle/Banish: ~410 đường cong x 240 khoá, 17-22 MB YAML) được lấy mẫu lại 30 khung/s rồi giản lược (Ramer-Douglas-Peucker,
         sai số quaternion 0,003 / vị trí 2 cm / tỉ lệ 0,003) và nén int16; nội suy tuyến tính ở JS. Đường cong thưa (<= 20 khoá) cũng đi qua cùng đường.
       - Đường cong m_EulerCurves (xúc tu lớn / xúc tu tấn công) là góc Euler độ, thứ tự Unity ZXY (= 'YXZ' của three.js); đổi sang quaternion rồi mới giản lược.
       - Đường dẫn clip băm (path_0x...) giải bằng CRC32 của đường dẫn con cháu của gốc Animator.
       - SmallTentacle: SBMonsterAnimationHelper.Start đặt offset = 1 / Count * i với int / int = 0, nên cả 4 xúc tu nhỏ cùng pha (offset 0).
Rerunnable: cùng đầu vào ra cùng đầu ra từng byte.
"""
import base64, io, json, math, os, re, struct, sys, zlib

import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tentacle as TN  # noqa: E402  (guid_path, read_skinned_mesh, vec, rnd: cùng định dạng dữ liệu)

GAME = os.path.dirname(HERE)
ASSETS = TN.ASSETS
SCENE = os.path.join(ASSETS, 'Scenes', 'Game.unity')
OUT_SB = os.path.join(GAME, 'data', 'sbcreature.js')
OUT_JELLY = os.path.join(GAME, 'data', 'jelly.js')
OUT_ART = os.path.join(GAME, 'art', 'sb')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
rnd, vec = TN.rnd, TN.vec
FPS = 30  # m_SampleRate của mọi clip SB (đã kiểm: 30)
# Sai số giản lược [ĐỀ XUẤT]: quaternion 0,003 (~0,34 độ), vị trí 2 (đơn vị xương = cm vì cha co 0,01), tỉ lệ 0,003, số thực 0,005
TOL = {'p': 2.0, 'q': 0.003, 's': 0.003, 'f': 0.005}


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- scene
class Scene:
    def __init__(self):
        txt = io.open(SCENE, encoding='utf-8').read()
        ms = list(HDR.finditer(txt))
        self.docs = {}
        for i, m in enumerate(ms):
            end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
            self.docs[int(m.group(2))] = (int(m.group(1)), txt[m.end():end])
        self.cache = {}
        self.tr_of_go = {}
        for f, (t, s) in self.docs.items():
            if t in (4, 224):
                self.tr_of_go[int(re.search(r'm_GameObject: \{fileID: (-?\d+)\}', s).group(1))] = f
        log('scene docs', len(self.docs))

    def body(self, f):
        if f not in self.cache:
            self.cache[f] = list(yaml.load(self.docs[f][1], Loader=CL).values())[0]
        return self.cache[f]

    def typ(self, f):
        return self.docs[f][0]

    def children(self, go):
        return [self.body(c['fileID'])['m_GameObject']['fileID'] for c in self.body(self.tr_of_go[go])['m_Children']]

    def name(self, go):
        return self.body(go)['m_Name']

    def parent(self, go):
        p = self.body(self.tr_of_go[go])['m_Father']['fileID']
        return self.body(p)['m_GameObject']['fileID'] if p else None

    def comps(self, go):
        return [(self.typ(c['component']['fileID']), c['component']['fileID']) for c in self.body(go)['m_Component']]

    def comp(self, go, typ):
        return [(f, self.body(f)) for t, f in self.comps(go) if t == typ]

    def go_of_tf(self, tf):
        return self.body(tf)['m_GameObject']['fileID']

    def find(self, go, names):
        """Con cháu theo danh sách tên từ go."""
        for n in names:
            go = next(c for c in self.children(go) if self.name(c) == n)
        return go

    def roots(self, name):
        out = []
        for go, tf in self.tr_of_go.items():
            if self.body(tf)['m_Father']['fileID'] == 0 and self.name(go) == name:
                out.append(go)
        return out


def read_doc(path):
    return list(yaml.load(open(path, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]


def conv_q(q):
    return [-q[0], -q[1], q[2], q[3]]


def tfm(S, go):
    t = S.body(S.tr_of_go[go])
    p = vec(t['m_LocalPosition'])
    p[2] = -p[2]
    return {'t': p, 'q': conv_q(vec(t['m_LocalRotation'], 'xyzw')), 's': vec(t['m_LocalScale'])}


# ---------------------------------------------------------------- clip: đọc, lấy mẫu, giản lược, nén
def hermite_eval(keys, t):
    """keys: [(time, value(list), inSlope(list), outSlope(list))] -> giá trị theo từng thành phần (AnimationCurve Hermite; slope vô cực = bậc thang)."""
    n = len(keys[0][1])
    if t <= keys[0][0]:
        return list(keys[0][1])
    if t >= keys[-1][0]:
        return list(keys[-1][1])
    i = 1
    while keys[i][0] < t:
        i += 1
    a, b = keys[i - 1], keys[i]
    d = b[0] - a[0]
    u = (t - a[0]) / d
    u2, u3 = u * u, u * u * u
    out = []
    for c in range(n):
        m0, m1 = a[3][c], b[2][c]
        if not (math.isfinite(m0) and math.isfinite(m1)):
            out.append(a[1][c])
            continue
        out.append((2 * u3 - 3 * u2 + 1) * a[1][c] + (u3 - 2 * u2 + u) * m0 * d + (-2 * u3 + 3 * u2) * b[1][c] + (u3 - u2) * m1 * d)
    return out


def num(x):
    if isinstance(x, str):
        return {'Infinity': math.inf, '-Infinity': -math.inf}.get(x, 0.0)
    return float(x)


def curve_keys(c, comps):
    keys = []
    for k in c['curve']['m_Curve']:
        if comps == 1:
            keys.append((float(k['time']), [num(k['value'])], [num(k['inSlope'])], [num(k['outSlope'])]))
        else:
            ks = 'xyzw'[:comps]
            keys.append((float(k['time']), [num(k['value'][a]) for a in ks], [num(k['inSlope'][a]) for a in ks], [num(k['outSlope'][a]) for a in ks]))
    return keys


def euler_to_q(e):
    """Unity Quaternion.Euler(x, y, z) (độ; thứ tự ZXY) -> (x, y, z, w) Unity."""
    x, y, z = [math.radians(a) / 2 for a in e]
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    # q = qy * qx * qz
    qx = (sx, 0, 0, cx)
    qy = (0, sy, 0, cy)
    qz = (0, 0, sz, cz)

    def mul(a, b):
        return (a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
                a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2])
    return list(mul(mul(qy, qx), qz))


def rdp(vals, tol):
    """Giản lược chuỗi giá trị (N x C) lấy mẫu đều; trả chỉ số khoá giữ lại. Nội suy tuyến tính theo chỉ số."""
    n = len(vals)
    if n <= 2:
        return list(range(n))
    keep = [0, n - 1]
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        idx = np.arange(a + 1, b)
        w = ((idx - a) / (b - a))[:, None]
        approx = vals[a][None, :] * (1 - w) + vals[b][None, :] * w
        err = np.abs(vals[a + 1:b] - approx).max(axis=1)
        j = int(np.argmax(err))
        if err[j] > tol:
            m = a + 1 + j
            keep.append(m)
            stack.append((a, m))
            stack.append((m, b))
    return sorted(keep)


class Clip:
    """Một AnimationClip đã đọc: tracks[(path, kind)] = mảng mẫu (frames x comps) ở 30 khung/s; kind p / q / s / f:<attr>."""

    def __init__(self, fn):
        path = os.path.join(ASSETS, 'AnimationClip', fn)
        d = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
        st = d['m_AnimationClipSettings']
        self.fn = fn
        self.len = float(st['m_StopTime'])
        self.loop = bool(st['m_LoopTime'])
        assert int(d['m_SampleRate']) == FPS, fn
        self.events = [(round(float(e['time']), 5), e['functionName']) for e in d['m_Events']]
        self.nf = int(round(self.len * FPS)) + 1
        self.tracks = {}
        times = [i / FPS for i in range(self.nf)]
        times[-1] = self.len
        for lst, kind, comps in (('m_PositionCurves', 'p', 3), ('m_ScaleCurves', 's', 3), ('m_RotationCurves', 'q', 4), ('m_EulerCurves', 'e', 3)):
            for c in d[lst]:
                keys = curve_keys(c, comps)
                arr = np.array([hermite_eval(keys, t) for t in times])
                if kind == 'p':
                    arr[:, 2] *= -1
                elif kind == 'e':
                    arr = np.array([conv_q(euler_to_q(r)) for r in arr])
                    kind2 = 'q'
                    self.tracks[(c['path'], kind2)] = arr
                    continue
                elif kind == 'q':
                    arr = np.array([conv_q(list(r)) for r in arr])
                self.tracks[(c['path'], kind)] = arr
        self.floats = []   # (path, attribute, classID, mảng mẫu)
        for c in d['m_FloatCurves']:
            keys = curve_keys(c, 1)
            arr = np.array([hermite_eval(keys, t) for t in times])
            self.floats.append((c['path'], c['attribute'], int(c.get('classID', 0)), arr))
        for k in list(self.tracks):
            if k[1] == 'q':   # liên tục dấu theo bán cầu
                a = self.tracks[k]
                for i in range(1, len(a)):
                    if np.dot(a[i], a[i - 1]) < 0:
                        a[i] = -a[i]
        log('  clip', fn, 'len', self.len, 'frames', self.nf, 'tracks', len(self.tracks), 'floats', len(self.floats), 'events', len(self.events))


def pack_track(node, kind, arr, tol, rel):
    """-> (bytes, nkeys). Mỗi track: u16 node, u8 kind (0 p, 1 q, 2 s, 3 f), u8 nComp, u16 nKeys, nComp x (f32 min, f32 max), nKeys x u8 frame, nKeys*nComp x i16."""
    keep = rdp(arr, tol)
    if len(keep) == 2 and np.abs(arr[0] - arr[-1]).max() <= tol:
        keep = [0]
    sel = arr[keep]
    mn, mx = sel.min(axis=0), sel.max(axis=0)
    span = np.where(mx > mn, mx - mn, 1.0)
    q = np.round((sel - mn) / span * 65535 - 32768).astype('<i2')
    kc = {'p': 0, 'q': 1, 's': 2, 'f': 3}[kind]
    head = struct.pack('<HBBH', node, kc, arr.shape[1], len(keep)) + b''.join(struct.pack('<ff', float(a), float(b)) for a, b in zip(mn, mx))
    return head + bytes(keep) + q.tobytes(), len(keep)


# ---------------------------------------------------------------- bộ điều khiển Animator
def read_controller(path):
    """AnimatorController -> {params, states{name:{motion guid, cycleParam}}, default, any[], trans[]} (số đọc thẳng từ YAML)."""
    txt = io.open(path, encoding='utf-8').read()
    ms = list(HDR.finditer(txt))
    objs = {}
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
        objs[int(m.group(2))] = (int(m.group(1)), list(yaml.load(txt[m.end():end], Loader=CL).values())[0])
    ctl = next(o for t, o in objs.values() if t == 91)
    params = [p['m_Name'] for p in ctl['m_AnimatorParameters']]
    ptype = {p['m_Name']: p['m_Type'] for p in ctl['m_AnimatorParameters']}  # 4 bool, 9 trigger, 1 float
    sm = next(o for t, o in objs.values() if t == 1107)
    sname = {}
    states = {}
    for fid, (t, o) in objs.items():
        if t == 1102:
            sname[fid] = o['m_Name']
            states[o['m_Name']] = {'motion': o['m_Motion']['guid'], 'cycleParam': o['m_CycleOffsetParameter'] or None, 'cycleOffset': float(o['m_CycleOffset']),
                                   'speed': float(o['m_Speed'])}

    def tr(fid, frm):
        o = objs[fid][1]
        conds = [{'p': c['m_ConditionEvent'], 'mode': c['m_ConditionMode']} for c in o['m_Conditions']]  # 1 If, 2 IfNot (bool / trigger)
        for c in conds:
            c['t'] = {4: 'bool', 9: 'trigger', 1: 'float'}[ptype[c['p']]]
        return {'from': frm, 'to': sname[o['m_DstState']['fileID']], 'conds': conds, 'dur': float(o['m_TransitionDuration']),
                'exit': float(o['m_ExitTime']) if o['m_HasExitTime'] else None, 'offset': float(o['m_TransitionOffset']),
                'fixed': bool(o['m_HasFixedDuration']), 'self': bool(o['m_CanTransitionToSelf'])}
    trans = []
    for fid, (t, o) in objs.items():
        if t == 1102:
            for tf in o['m_Transitions']:
                trans.append(tr(tf['fileID'], o['m_Name']))
    anyt = [tr(tf['fileID'], '*') for tf in sm['m_AnyStateTransitions']]
    return {'params': params, 'ptype': ptype, 'states': states, 'default': sname[sm['m_DefaultState']['fileID']], 'trans': trans + anyt}


def override_map(name):
    d = list(yaml.load(open(os.path.join(ASSETS, 'AnimatorOverrideController', name + '.overrideController'), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    return {c['m_OriginalClip']['guid']: c['m_OverrideClip']['guid'] for c in d['m_Clips']}


# ---------------------------------------------------------------- vật liệu / ảnh
def save_tex(src, name, maxs, quality=80):
    im = Image.open(src)
    im = im.convert('RGB')
    s = maxs / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=quality, method=6)
    return 'art/sb/' + name + '.webp', os.path.getsize(p)


def read_mat(name):
    d = list(yaml.load(open(os.path.join(ASSETS, 'Material', name + '.mat'), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    return d


GLOW = {'alb': 'Texture2D_9aa7ba2263944b48bbf43c218dc48459', 'mask': 'Texture2D_4d740421464545a3b7ee68f44af80d8d',
        'scroll': 'Vector1_0ac8c91cbbec422da55838fc9dda4e17', 'scale': 'Vector1_a406839633634469825ab12f70095cca', 'sx': 'Vector1_09f9e63932c3441dbbfa896357cb5e56',
        'sy': 'Vector1_6fc5d28979694c8b99befcdb35ef2d82', 'noise': 'Vector1_510b5236724c4baf8b247633e22ae309', 'pulse': 'Vector1_d6d36bb5307a4f74a2f7513ff2789271',
        'col': 'Color_a7ce2b7bd770432e92093ddfae428c15'}


def glow_material(name, tag, size_alb, size_mask, share):
    """Thông số GlowPulseBioLume_Shader của một vật liệu + ảnh webp (share: ảnh đã lưu, dùng chung theo guid)."""
    sp = read_mat(name)
    out = {'src': 'Material/%s.mat' % name}
    for key, slot, sz in (('alb', GLOW['alb'], size_alb), ('mask', GLOW['mask'], size_mask)):
        g = sp['m_TexEnvs'][slot]['m_Texture']['guid']
        if g not in share:
            share[g] = save_tex(TN.guid_path('Texture2D', g), '%s_%s' % (tag, key), sz)
        out[key] = share[g][0]
    for k in ('scroll', 'scale', 'sx', 'sy', 'noise', 'pulse'):
        out[k] = rnd(float(sp['m_Floats'][GLOW[k]]), 5)
    out['glowStrength'] = rnd(float(sp['m_Floats']['_GlowStrength']), 5)
    out['fadeDist'] = rnd(float(sp['m_Floats']['_EmissionFadeDistance']), 5)
    c = sp['m_Colors'][GLOW['col']]
    out['col'] = rnd([float(c[k]) for k in 'rgb'], 6)
    return out


# ---------------------------------------------------------------- lưới
def pack_mesh(m):
    """Như tools/ray.py nhưng không có pháp tuyến (vật liệu web không dùng N·L): vị trí / uv uint16 theo hộp bao, chỉ số tam giác uint16,
    chỉ số xương uint8 x4, trọng số uint8 x4."""
    pos = np.array(m['pos'], dtype=np.float64).reshape(-1, 3)
    uv = np.array(m['uv'], dtype=np.float64).reshape(-1, 2)
    n = len(pos)
    assert n < 65536
    pmin, pmax = pos.min(0), pos.max(0)
    umin, umax = uv.min(0), uv.max(0)

    def q(a, lo, hi):
        return np.round((a - lo) / np.where(hi > lo, hi - lo, 1) * 65535).astype('<u2')
    si = np.array(m['skinIndex'], dtype=np.int64).reshape(n, -1)    # số ảnh hưởng xương mỗi đỉnh: 4 (miệng, xúc tu) hoặc 2 (sứa); đệm về 4
    sw = np.array(m['skinWeight'], dtype=np.float64).reshape(n, -1)
    assert si.max() < 256 and si.shape == sw.shape and si.shape[1] <= 4
    si = np.pad(si, ((0, 0), (0, 4 - si.shape[1])))
    sw = np.pad(sw, ((0, 0), (0, 4 - sw.shape[1])))
    parts = [q(pos, pmin, pmax).tobytes(), q(uv, umin, umax).tobytes(), np.array(m['index'], dtype='<u2').tobytes(),
             si.astype('u1').tobytes(), np.round(sw * 255).astype('u1').tobytes()]
    return {'n': n, 'tris': len(m['index']) // 3, 'pmin': rnd(pmin.tolist(), 5), 'pmax': rnd(pmax.tolist(), 5), 'umin': rnd(umin.tolist(), 5),
            'umax': rnd(umax.tolist(), 5), 'b64': base64.b64encode(b''.join(parts)).decode('ascii')}


def r3(v):
    return rnd(v, 5)


# ---------------------------------------------------------------- sinh vật Stellar Basin
def build_creature(S, share):
    sbm = next(g for g in S.roots('StellarBasin') for c in S.children(g) if S.name(c) == 'SBMonster')
    root = next(c for c in S.children(sbm) if S.name(c) == 'SBMonster')
    sb_t = tfm(S, sbm)
    mon_t = tfm(S, root)
    assert all(abs(a) < 1e-9 for a in sb_t['q'][:3]), 'StellarBasin có xoay'
    assert sb_t['s'] == [1.0, 1.0, 1.0]
    origin = [sb_t['t'][0] + mon_t['t'][0], sb_t['t'][1] + mon_t['t'][1], sb_t['t'][2] + mon_t['t'][2]]
    log('origin (three)', origin)
    gos = []

    def walk(g):
        gos.append(g)
        for c in S.children(g):
            walk(c)
    walk(root)
    path_of = {}

    def rec_path(g, pre):
        path_of[g] = pre
        for c in S.children(g):
            rec_path(c, (pre + '/' if pre else '') + S.name(c))
    rec_path(root, '')

    # --- nhóm Animator
    mouth_go = S.find(root, ['SBMonster_Mouth'])
    atk_container = S.find(root, ['AttackTentacleContainer'])
    atk_go = S.find(atk_container, ['SBMonster_AttackTentacle'])
    large_go = S.find(root, ['SBMonster_LargeTentacles'])
    small_cont = S.find(root, ['SmallTentacleContainer'])
    small_gos = [c for c in S.children(small_cont) if S.name(c).startswith('SMB_SmallTentacle')]
    assert len(small_gos) == 4
    groups = [('mouth', mouth_go, None), ('attack', atk_go, 'SBMonsterTentaclesAttack'), ('large', large_go, 'SBMonsterTentaclesLarge')] + \
             [('small%d' % i, g, 'SBMonsterTentaclesSmall') for i, g in enumerate(small_gos)]
    helper = [b for f, b in S.comp(root, 114) if b['m_Script']['guid'] == 'cc0e1497322d4b181c876c55018fdd7d'][0]
    anim_ref = {'mouth': helper['mouthAnimator']['fileID'], 'attack': helper['attackTentacleAnimator']['fileID'], 'large': helper['largeTentacleAnimator']['fileID']}
    for i, r in enumerate(helper['smallTentacleAnimators']):
        anim_ref['small%d' % i] = r['fileID']
    for gid, g, _ in groups:
        assert S.body(anim_ref[gid])['m_GameObject']['fileID'] == g, gid
    ctl = read_controller(os.path.join(ASSETS, 'AnimatorController', 'SBMonsterController.controller'))
    log('controller states', list(ctl['states']), 'default', ctl['default'])

    clip_cache = {}

    def get_clip(fn):
        if fn not in clip_cache:
            clip_cache[fn] = Clip(fn)
        return clip_cache[fn]
    STATE_KEY = {'Spawn': 'spawn', 'Idle': 'idle', 'AlertIdle': 'alert', 'Attack': 'attack', 'Banish': 'banish'}
    gclips = {}
    for gid, g, ov in groups:
        omap = override_map(ov) if ov else {}
        gclips[gid] = {}
        for st, info in ctl['states'].items():
            guid = omap.get(info['motion'], info['motion'])
            gclips[gid][STATE_KEY[st]] = os.path.basename(TN.guid_path('AnimationClip', guid))
        log(gid, gclips[gid])

    def resolve(g, path):
        if path == '':
            return g
        cur = g
        for part in path.split('/'):
            nxt = next((c for c in S.children(cur) if S.name(c) == part), None)
            if nxt is None:
                return None
            cur = nxt
        return cur

    def hashmap(g):
        m = {}

        def w(x, p):
            m[zlib.crc32(p.encode('utf-8')) & 0xFFFFFFFF] = x
            for c in S.children(x):
                w(c, (p + '/' if p else '') + S.name(c))
        for c in S.children(g):
            w(c, S.name(c))
        return m

    # --- lưới và SkinnedMeshRenderer
    smrs = []
    for g in gos:
        for f, b in S.comp(g, 137):
            smrs.append((g, f, b))
    log('SkinnedMeshRenderer', len(smrs))
    need = set([root, mouth_go, atk_container, atk_go, large_go, small_cont] + small_gos)
    mesh_ids = {}
    meshes = []
    renderers = []
    tf_go = {S.tr_of_go[g]: g for g in gos}
    for g, f, b in smrs:
        guid = b['m_Mesh']['guid']
        mp = TN.guid_path('Mesh', guid)
        if guid not in mesh_ids:
            m, bind, nv = TN.read_skinned_mesh(mp)
            mesh_ids[guid] = len(meshes)
            meshes.append({'name': os.path.basename(mp)[:-6], 'pack': pack_mesh(m), 'bind': bind})
        bones = [tf_go[r['fileID']] for r in b['m_Bones']]
        assert len(bones) == len(meshes[mesh_ids[guid]]['bind']), S.name(g)
        need.add(g)
        need.update(bones)
        mat = os.path.basename(TN.guid_path('Material', b['m_Materials'][0]['guid']))[:-4]
        grp = None
        a = g
        while a and not grp:
            for gid, gg, _ in groups:
                if gg == a:
                    grp = gid
            a = S.parent(a)
        renderers.append({'go': g, 'name': S.name(g), 'mesh': mesh_ids[guid], 'bones': bones, 'mat': mat, 'group': grp, 'enabled': bool(b['m_Enabled'])})
    colliders = []
    for g in gos:
        if S.name(g) == 'Collider' and S.body(g)['m_Layer'] == 16:
            cc = S.comp(g, 136)
            assert len(cc) == 1
            cb = cc[0][1]
            det = [b for f, b in S.comp(g, 114) if b['m_Script']['guid'] == '68031099925fd93d9c18324485b45e0e']
            assert det, 'Collider không có PlayerDetector'
            colliders.append({'go': g, 'radius': float(cb['m_Radius']), 'height': float(cb['m_Height']), 'dir': int(cb['m_Direction']),
                              'center': vec(cb['m_Center']), 'trigger': bool(cb['m_IsTrigger']), 'path': path_of[g]})
            need.add(g)
    log('collider', [(c['path'], c['radius'], c['height'], c['trigger']) for c in colliders])

    resolved = {}
    hashes = {gid: hashmap(g) for gid, g, _ in groups}
    for gid, g, _ in groups:
        if gid in ('small1', 'small2', 'small3'):
            continue   # cùng clip, cây con đồng cấu với small0: dùng lại khối của small0 qua bảng remap
        for key, fn in gclips[gid].items():
            if (gid, fn) in resolved:
                continue
            c = get_clip(fn)
            tr, fl, miss = [], [], []
            for (p, kind), arr in c.tracks.items():
                t = resolve(g, p)
                if t is None:
                    miss.append(p)
                    continue
                tr.append((t, kind, arr))
                need.add(t)
            for p, attr, cls, arr in c.floats:
                t = hashes[gid].get(int(p.split('_')[1], 16)) if p.startswith('path_0x') else resolve(g, p)
                if t is None:
                    miss.append(p)
                    continue
                fl.append((t, attr, cls, arr))
                need.add(t)
            resolved[(gid, fn)] = {'tracks': tr, 'floats': fl, 'clip': c}
            if miss:
                log('  !! %s/%s: %d đường dẫn không phân giải' % (gid, fn, len(miss)), miss[:5])
    for sg in small_gos:   # nút của bốn xúc tu nhỏ đồng cấu: giữ cả cây con để bảng remap phủ đủ
        st = [sg]
        while st:
            x = st.pop()
            need.add(x)
            st.extend(S.children(x))
    for g in list(need):
        a = S.parent(g)
        while a and a != sbm:
            need.add(a)
            a = S.parent(a)
    order = [g for g in gos if g in need]
    idx = {g: i for i, g in enumerate(order)}
    nodes = []
    for g in order:
        t = tfm(S, g)
        nodes.append({'name': S.name(g), 'parent': idx[S.parent(g)] if g != root else -1, 't': r3(t['t']), 'q': r3(t['q']), 's': r3(t['s'])})
    nodes[0].update({'t': [0, 0, 0], 'q': [0, 0, 0, 1], 's': [1, 1, 1]})   # vị trí của SBMonster gộp vào origin
    assert all(abs(a) < 1e-9 for a in mon_t['q'][:3]) and mon_t['s'] == [1.0, 1.0, 1.0]
    log('nodes', len(nodes), 'of', len(gos))

    clips_out = []
    clip_index = {}
    raw_total = 0
    for (gid, fn), r in resolved.items():
        c = r['clip']
        blobs = []
        nk = 0
        dropped = 0
        for t, kind, arr in r['tracks']:
            i = idx[t]
            rest = np.array({'p': nodes[i]['t'], 'q': nodes[i]['q'], 's': nodes[i]['s']}[kind], dtype=np.float64)
            same = np.abs(arr - rest).max() <= TOL[kind] * 0.5
            if kind == 'q':
                same = same or np.abs(arr + rest).max() <= TOL[kind] * 0.5
            if same:
                dropped += 1
                continue
            b, k = pack_track(i, kind, arr, TOL[kind] * (2 if gid == 'mouth' else 1), rest)   # răng / vỏ miệng: sai số gấp đôi
            blobs.append(b)
            nk += k
        body = struct.pack('<H', len(blobs)) + b''.join(blobs)
        raw_total += len(body)
        fl = []
        for t, attr, cls, arr in r['floats']:
            keep = rdp(arr, TOL['f'])
            if len(keep) == 2 and np.abs(arr[0] - arr[-1]).max() <= TOL['f']:
                keep = [0]
            fl.append({'n': idx[t], 'a': attr, 'c': cls, 'k': keep, 'v': rnd(arr[keep, 0].tolist(), 5)})
        clip_index[(gid, fn)] = len(clips_out)
        clips_out.append({'group': gid, 'file': fn, 'len': rnd(c.len, 5), 'loop': c.loop, 'frames': c.nf, 'ev': [list(e) for e in c.events], 'tracks': len(blobs),
                          'keys': nk, 'dropped': dropped, 'fl': fl, 'b64': base64.b64encode(body).decode('ascii')})
        log('  packed %s/%s: track %d (bỏ %d trùng tư thế nghỉ) khoá %d  %d KB' % (gid, fn, len(blobs), dropped, nk, len(body) // 1024))
    log('clip nhị phân tổng', raw_total // 1024, 'KB (trước base64)')

    def iso(a, b, out):
        out[idx[a]] = idx[b]
        ca = S.children(a)
        cb = [c for c in S.children(b)]
        for c in ca:
            d = next(x for x in cb if S.name(x) == S.name(c))
            iso(c, d, out)
    anim_out = []
    small0 = [g for gid, g, _ in groups if gid == 'small0'][0]
    for gid, g, _ in groups:
        ent = {'id': gid, 'node': idx[g]}
        if gid in ('small1', 'small2', 'small3'):
            assert gclips[gid] == gclips['small0']
            ent['clips'] = {k: clip_index[('small0', fn)] for k, fn in gclips[gid].items()}
            rm = {}
            iso(small0, g, rm)
            ent['remap'] = {str(a): b for a, b in rm.items() if a != b}
        else:
            ent['clips'] = {k: clip_index[(gid, fn)] for k, fn in gclips[gid].items()}
        anim_out.append(ent)

    det_go = S.find(root, ['DetectionZone'])
    det_t = tfm(S, det_go)
    spheres = []
    for f, b in S.comp(det_go, 135):
        assert b['m_IsTrigger'] == 1
        c = vec(b['m_Center'])
        spheres.append({'c': r3([c[0], c[1], -c[2]]), 'r': float(b['m_Radius'])})
    det = {'offset': r3(det_t['t']), 'spheres': spheres}
    look = [b for f, b in S.comp(atk_container, 114) if b['m_Script']['guid'] == '4f7dd0149a8e0ad8d279288231bb0e3c']
    assert look
    vpd = [b for f, b in S.comp(root, 114) if b['m_Script']['guid'] == '089ffe70778ad3b2b8ac2e0ccbfc9084'][0]
    params = {k: rnd(float(helper[k]), 5) for k in ('callDelaySec', 'aggroDelaySec', 'attackTentacleIdleSpeed', 'attackTentacleDetectedSpeed',
                                                    'attackTentacleSpeedTweenDuration', 'attackTentacleMinScale', 'attackTentacleMaxScale', 'attackTentacleMinProximity',
                                                    'attackTentacleMaxProximity', 'attackTentacleAngleThreshold', 'attackTentacleInRangeDurationThreshold',
                                                    'banishAchievementDistanceThreshold')}
    assert S.go_of_tf(helper['attackTentacleTransform']['fileID']) == atk_go
    dmg = {'damagePoints': int(vpd['damagePoints']), 'oneHitOnly': bool(vpd['oneHitOnly']), 'requireOneHealthToKill': bool(vpd['requireOneHealthToKill']),
           'extraDamageInNightmareMode': int(vpd['extraDamageInNightmareMode']), 'detectors': len(vpd['playerDetectors'])}
    asrc = S.body(helper['audioSource']['fileID'])
    aud = {'min': float(asrc['MinDistance']), 'max': float(asrc['MaxDistance']), 'rolloff': int(asrc['rolloffMode']), 'volume': float(asrc['m_Volume'])}
    clips_audio = {k: [r_['guid'] for r_ in helper[k]] for k in ('preAttackClips', 'attackClips', 'callClips', 'aggroClips')}
    clips_audio['emerge'] = [helper['emergeClip']['guid']]
    clips_audio['submerge'] = [helper['submergeClip']['guid']]
    mats = {}
    for r in renderers:
        if r['mat'] not in mats:
            mats[r['mat']] = glow_material(r['mat'], 'mouth' if 'Mouth' in r['mat'] else 'tent', 512, 256, share)
    rend_out = [{'node': idx[r['go']], 'name': r['name'], 'mesh': r['mesh'], 'bones': [idx[b] for b in r['bones']], 'mat': r['mat'], 'group': r['group'],
                 'enabled': r['enabled']} for r in renderers]
    coll_out = [{'node': idx[c['go']], 'radius': c['radius'], 'height': c['height'], 'dir': c['dir'], 'center': r3([c['center'][0], c['center'][1], -c['center'][2]]),
                 'path': c['path']} for c in colliders]
    data = {
        'src': 'Scenes/Game.unity StellarBasin/SBMonster (SBMonsterAnimationHelper.cs, SBMonsterAttackAnimationHelper.cs, ClampedLookAtTarget.cs, PlayerDetector.cs, VariablePlayerDamager.cs)',
        'origin': r3(origin), 'nodes': nodes, 'root': 0, 'attackContainer': idx[atk_container], 'attack': idx[atk_go],
        'groups': anim_out, 'clips': clips_out, 'controller': {k: ctl[k] for k in ('default', 'trans', 'ptype')},
        'states': {k: {'cycleParam': v['cycleParam']} for k, v in ctl['states'].items()},
        'renderers': rend_out, 'meshes': [{'name': m['name'], **m['pack'], 'bind': m['bind']} for m in meshes], 'mats': mats,
        'colliders': coll_out, 'detect': det, 'params': params, 'damage': dmg, 'audio': aud,
    }
    return data, clips_audio


def js_dump(name, var, data, header):
    out = '// Generated by games/dredge/tools/sbcreature.py. Do not edit.\n// %s\nwindow.%s = ' % (header, var) + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(name, 'w', encoding='utf-8', newline='\n').write(out)
    return len(out.encode('utf-8'))


# ---------------------------------------------------------------- sứa nổ bào tử
def jelly_mesh_groups(path):
    d = read_doc(path)
    ib = 2 if d.get('m_IndexFormat', 0) == 0 else 4
    out, start = [], 0
    for sm in d['m_SubMeshes']:
        out.append([start, int(sm['indexCount'])])
        start += int(sm['indexCount'])
    return out


def build_jelly(S, share):
    ctl = None
    for g in S.roots('StellarBasin'):
        for c in S.children(g):
            if S.name(c) == 'JellyfishController':
                ctl = c
                sb = g
    assert ctl
    ctlb = [b for f, b in S.comp(ctl, 114) if b['m_Script']['guid'] == '448ce3053c9749676f4a82a215024069'][0]
    sb_t, ct_t = tfm(S, sb), tfm(S, ctl)
    assert ct_t['t'] == [0.0, 0.0, 0.0] and ct_t['s'] == [1.0, 1.0, 1.0]
    jf_script = 'd64c5e1d892b76d2219d72194d1a86d4'
    rot_script = '6d80021999957262a721f1894961b209'
    inst = []
    template = None
    for ref in ctlb['jellyfishes']:
        jb = S.body(ref['fileID'])
        base = jb['m_GameObject']['fileID']
        bt = tfm(S, base)
        assert bt['s'] == [1.0, 1.0, 1.0]
        rp = next(c for c in S.children(base) if S.name(c) == 'RotationParent')
        rt = tfm(S, rp)
        rb = [b for f, b in S.comp(rp, 114) if b['m_Script']['guid'] == rot_script][0]
        body = S.children(rp)[0]
        bodyt = tfm(S, body)
        assert S.name(body) == 'Jellyfish' and bodyt['t'] == [0.0, 0.0, 0.0] and rt['t'] == [0.0, 0.0, 0.0] and rt['s'] == [1.0, 1.0, 1.0]

        def yaw(q):   # quaternion three (-x,-y,z,w) của phép quay quanh y -> góc Unity (độ), dương = quay theo chiều Unity (trái tay)
            return math.degrees(2 * math.atan2(-q[1], q[3]))
        # vị trí three (z đã đổi dấu): StellarBasin + JellyfishController (đã kiểm = 0) + base
        ux, uy, uz = sb_t['t'][0] + bt['t'][0], bt['t'][1], sb_t['t'][2] + bt['t'][2]
        assert abs(sb_t['t'][1]) < 1e-9
        key = [S.name(c) for c in S.children(body)]
        if template is None:
            template = (body, key)
        assert key == template[1], 'cấu trúc sứa khác nhau'
        inst.append({'name': S.name(base), 'x': r3(ux), 'y': r3(uy), 'z': r3(uz), 'yaw': r3(yaw(bt['q'])), 'rpYaw': r3(yaw(rt['q'])),
                     'rotateSpeed': float(rb['rotateSpeed']), 'ccw': bool(jb['counterClockwise']),
                     'upY': float(jb['upY']), 'downY': float(jb['downY']), 'rise': float(jb['riseDuration']), 'fall': float(jb['fallDuration']),
                     'retreat': float(jb['retreatDuration']), 'orbit': float(jb['orbitRadius']), 'variance': float(jb['orbitVariance']),
                     'varianceSpeed': float(jb['varianceSpeed']), 'varianceDelay': float(jb['varianceDelay'])})
        # x, z lưu theo three (z đã đổi dấu); yaw / rpYaw lưu theo Unity (độ, dương = quay theo chiều Unity)
    # nút mẫu của thân sứa (con của 'Jellyfish')
    body, key = template
    nodes = []
    idx = {}

    def add(g, parent):
        t = tfm(S, g)
        idx[g] = len(nodes)
        nodes.append({'name': S.name(g), 'parent': parent, 't': r3(t['t']), 'q': r3(t['q']), 's': r3(t['s'])})
        for c in S.children(g):
            add(c, idx[g])
    add(body, -1)
    nodes[0].update({'t': [0, 0, 0], 'q': [0, 0, 0, 1], 's': [1, 1, 1]})
    # lưới + vật liệu
    smr_go = next(c for c in S.children(body) if S.name(c) == 'JellyFish')
    smr = S.comp(smr_go, 137)[0][1]
    mp = TN.guid_path('Mesh', smr['m_Mesh']['guid'])
    m, bind, nv = TN.read_skinned_mesh(mp)
    tf_go = {S.tr_of_go[g]: g for g in idx}
    bones = [idx[tf_go[r['fileID']]] for r in smr['m_Bones']]
    assert len(bones) == len(bind)
    mats = {}
    slot = []
    for r in smr['m_Materials']:
        nm = os.path.basename(TN.guid_path('Material', r['guid']))[:-4]
        if nm not in mats:
            mats[nm] = glow_material(nm, 'jelly_' + nm.split('_')[1].lower(), 256, 128, share)
        slot.append(nm)
    groups = jelly_mesh_groups(mp)
    assert len(groups) == len(slot), (len(groups), len(slot))
    mesh = pack_mesh(m)
    mesh['groups'] = groups
    mesh['bind'] = bind
    # trước ra sau: nhiều submesh dùng cùng vật liệu -> gộp ở JS (mảng vật liệu theo thứ tự nhóm)
    # --- clip
    cdoc = read_controller(os.path.join(ASSETS, 'AnimatorController', 'JellyFish_controller.controller'))
    clips = {}
    for stname, info in cdoc['states'].items():
        fn = os.path.basename(TN.guid_path('AnimationClip', info['motion']))
        c = Clip(fn)
        blobs, nk, fl = [], 0, []
        for (p, kind), arr in c.tracks.items():
            g = body if p == '' else next((x for x in S.children(body) if S.name(x) == p.split('/')[0]), None)
            assert g is not None and '/' not in p, p
            i = idx[g]
            b, k = pack_track(i, kind, arr, TOL[kind], None)
            blobs.append(b)
            nk += k
        for p, attr, cls, arr in c.floats:
            g = next(x for x in S.children(body) if S.name(x) == p)
            keep = rdp(arr, TOL['f'])
            if len(keep) == 2 and np.abs(arr[0] - arr[-1]).max() <= TOL['f']:
                keep = [0]
            fl.append({'n': idx[g], 'a': attr, 'k': keep, 'v': rnd(arr[keep, 0].tolist(), 5)})
        clips[stname] = {'file': fn, 'len': rnd(c.len, 5), 'loop': c.loop, 'frames': c.nf, 'ev': [list(e) for e in c.events], 'fl': fl,
                         'b64': base64.b64encode(struct.pack('<H', len(blobs)) + b''.join(blobs)).decode('ascii')}
        log('  jelly clip', stname, fn, 'tracks', len(blobs), 'keys', nk)
    # --- cảm biến: JellyfishCore_ctrl (SphereCollider trigger + PlayerDetector)
    core = next(c for c in S.children(body) if S.name(c) == 'JellyfishCore_ctrl')
    sph = S.comp(core, 135)[0][1]
    assert sph['m_IsTrigger'] == 1
    sc = vec(sph['m_Center'])
    det = {'node': idx[core], 'radius': float(sph['m_Radius']), 'center': r3([sc[0], sc[1], -sc[2]])}
    # --- bào tử: JellySporeEffect.prefab (gốc + SphereCollider trigger + JellySporeCollision + AudioSource)
    pre = TN.load_doc(os.path.join(ASSETS, 'GameObject', 'JellySporeEffect.prefab'))
    proot = [o for o in pre.values() if o[0] == 1 and o[1]['m_Name'] == 'JellySporeEffect'][0][1]
    ptf = [o[1] for o in pre.values() if o[0] == 4 and o[1]['m_Father']['fileID'] == 0][0]
    psph = [o[1] for o in pre.values() if o[0] == 135][0]
    paud = [o[1] for o in pre.values() if o[0] == 82][0]
    pps = [o[1] for o in pre.values() if o[0] == 198 and o[1]['m_GameObject']['fileID'] == [i for i, oo in pre.items() if oo[0] == 1 and oo[1]['m_Name'] == 'JellySporeEffect'][0]][0]
    st = pps['InitialModule']
    life_max = max(float(st['startLifetime']['scalar']), float(st['startLifetime']['minScalar'] if 'minScalar' in st['startLifetime'] else 0))
    spore = {'offset': r3([float(ptf['m_LocalPosition']['x']), float(ptf['m_LocalPosition']['y']), -float(ptf['m_LocalPosition']['z'])]),
             'scale': float(ptf['m_LocalScale']['x']), 'radius': float(psph['m_Radius']), 'trigger': bool(psph['m_IsTrigger']),
             'duration': float(pps['lengthInSec']), 'lifeMax': life_max,
             'audio': {'min': float(paud['MinDistance']), 'max': float(paud['MaxDistance']), 'rolloff': int(paud['rolloffMode']), 'volume': float(paud['m_Volume']),
                       'guid': paud['m_audioClip']['guid']}}
    params = {'timeBetweenChecks': float(ctlb['timeBetweenChecks']), 'count': len(inst)}
    data = {'src': 'Scenes/Game.unity StellarBasin/JellyfishController (JellyfishController.cs, Jellyfish.cs, JellySporeCollision.cs, ConstantlyRotateOnY.cs)',
            'params': params, 'instances': inst, 'nodes': nodes, 'skin': {'node': idx[smr_go], 'bones': bones}, 'mesh': mesh, 'slots': slot, 'mats': mats,
            'clips': clips, 'states': {k: v for k, v in cdoc['states'].items() if k}, 'controller': {k: cdoc[k] for k in ('default', 'trans', 'ptype')},
            'detect': det, 'spore': spore}
    for k, v in data['states'].items():
        v.pop('motion', None)
    return data


# ---------------------------------------------------------------- hệ hạt (dùng máy chuyển của tools/particles.py, ghi vào dữ liệu của đơn vị)
PARTICLES = [   # (tên, tệp, đường dẫn gốc, gắn so với GameObject cha | None = tệp prefab, giữ vị trí gốc của prefab)
    ('SbAttackSplash', 'Scenes/Game.unity', 'StellarBasin/SBMonster/AttackTentacleContainer/SBMonster_AttackTentacle/Splash', True),
    ('JellyBoatTrail', 'Scenes/Game.unity', 'StellarBasin/JellyfishController/Jellyfish_Base/RotationParent/Jellyfish/BoatTrailParticles', True),
    ('JellySporeEffect', 'GameObject/JellySporeEffect.prefab', 'JellySporeEffect', False),
]


def build_particles():
    """Hệ hạt của vụ nổ bào tử, vệt nước của sứa và bọt nước lúc xúc tu đập (đều tắt sẵn trong scene: Jellyfish.Show / clip tấn công bật chúng).
    Texture đã có trong data/particles.js (cùng tid) dùng lại; chỉ texture mới được ghi (art/sb/p)."""
    import tempfile, shutil
    sys.argv = sys.argv[:1]
    import particles as PX
    tmp = tempfile.mkdtemp(prefix='sbp_')
    PX.OUT_ART = tmp
    guids = PX.Guids()
    conv = PX.Conv(guids)
    conv.shaders = PX.Shaders()
    conv.state = {}
    for nm in conv.shaders.objs:
        st = conv.shaders.get(nm)
        if st:
            conv.state[nm] = st
    docs = {}
    systems = {}
    for name, rel, rpath, parent in PARTICLES:
        if rel not in docs:
            docs[rel] = PX.Doc(rel, guids)
        doc = docs[rel]
        root = doc.find(rpath)[0]
        nodes, gos = PX.system(doc, conv, root, managed=('__all__',))
        stop = doc.parent(root) if parent else None
        systems[name] = {'src': rel + ':' + rpath, 'attach': dict(PX.placement(doc, root, stop=stop), to='Parent' if parent else 'root'), 'nodes': nodes}
        systems[name]['materials'] = PX.mats_of(nodes, conv)
        log('  hạt', name, 'hệ', len(nodes), 'vật liệu', len(systems[name]['materials']))
    txt = io.open(os.path.join(GAME, 'data', 'particles.js'), encoding='utf-8').read()
    ex = json.loads(txt[txt.index('window.DR_PARTICLES_LIB = ') + len('window.DR_PARTICLES_LIB = '):txt.rindex(';')])
    lib = {'textures': {}, 'sprites': {}, 'meshes': {}}
    os.makedirs(os.path.join(OUT_ART, 'p'), exist_ok=True)
    for tid, t in sorted(conv.textures.items()):
        if tid in ex['textures']:
            continue
        fn = os.path.basename(t['src'])
        shutil.copyfile(os.path.join(tmp, fn), os.path.join(OUT_ART, 'p', fn))
        lib['textures'][tid] = {'src': 'art/sb/p/' + fn, 'size': t['size']}
    for sid, sp in sorted(conv.sprites.items()):
        if sid not in ex['sprites']:
            lib['sprites'][sid] = sp
    for mn, m in sorted(conv.meshes.items()):
        if mn not in ex['meshes']:
            lib['meshes'][mn] = m
    shutil.rmtree(tmp, ignore_errors=True)
    log('  hạt: texture mới %d (dùng lại %d), sprite mới %d, mesh mới %d' % (len(lib['textures']), len(conv.textures) - len(lib['textures']), len(lib['sprites']), len(lib['meshes'])))
    return PX.rnd({'systems': systems, 'lib': lib})


# ---------------------------------------------------------------- tiếng
AUDIO_DIR = os.path.join(GAME, 'audio', 'sb')
OGG_DIR = r'D:\dredge-ref\audio\gameaudio'
# clip sinh vật SB đã có trong data/audio.js (tools/audio.py): dùng lại, không mã hoá lại
EXISTING = {'Stellar Basin Monster - Attack 1': 'monster.stellar.attack', 'Stellar Basin Monster - Call 1': 'monster.stellar.call',
            'Stellar Basin Monster - Emerge': 'monster.stellar.emerge', 'Stellar Basin Monster - Banish': 'monster.stellar.banish'}
# clip còn thiếu, mã hoá mono 48 kb/s [ĐỀ XUẤT: giữ dưới 1 MB cho cả đơn vị; bỏ Call 2 (15,5 s) vì nặng nhất, tiếng gọi chỉ còn Call 1]
NEW = ['Stellar Basin Monster - Pre Attack 1', 'Stellar Basin Monster - Pre Attack 2', 'Stellar Basin Monster - Attack 2', 'Stellar Basin Monster - Attack 3',
       'Stellar Basin Monster - Aggro 1', 'Stellar Basin Monster - Aggro 2', 'World Event - Mushroom Explode']


def audio_name_of(guid):
    for sub in ('SFX',):
        base = os.path.join(ASSETS, 'Audio', sub)
        for dp, dn, fns in os.walk(base):
            for fn in fns:
                if fn.endswith('.meta'):
                    with io.open(os.path.join(dp, fn), encoding='utf-8') as f:
                        if 'guid: ' + guid in f.read(300):
                            return os.path.splitext(os.path.splitext(fn)[0])[0]
    raise SystemExit('không thấy clip guid ' + guid)


def encode_audio():
    import shutil, subprocess
    ff = shutil.which('ffmpeg')
    out = {}
    cost = 0
    for name in NEW:
        key = 'sb.' + re.sub(r'[^a-z0-9]+', '', name.lower().replace('stellar basin monster - ', '').replace('world event - ', ''))
        stem = re.sub(r'[^A-Za-z0-9._-]+', '_', name).strip('_')
        src = os.path.join(OGG_DIR, stem + '.ogg')
        assert os.path.exists(src), src
        os.makedirs(AUDIO_DIR, exist_ok=True)
        dst = os.path.join(AUDIO_DIR, stem + '.mp3')
        if ff:
            subprocess.run([ff, '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-b:a', '48k', '-c:a', 'libmp3lame', dst], check=True)
        elif not os.path.exists(dst):
            raise SystemExit('cần ffmpeg trong PATH để mã hoá ' + name)
        # độ dài: ffprobe nếu có, không thì ước từ dung lượng
        dur = round(os.path.getsize(dst) * 8 / 48000, 2)
        cost += os.path.getsize(dst)
        out[key] = {'src': 'audio/sb/%s.mp3' % stem, 'loop': False, 'vol': 0.8, 'dur': dur, 'orig': name}
    log('tiếng mới %d clip, %d KB' % (len(out), cost // 1024))
    return out, cost


def main():
    S = Scene()
    share = {}
    data, aud = build_creature(S, share)
    jelly = build_jelly(S, share)
    parts = build_particles()
    data['particles'] = {'systems': {k: v for k, v in parts['systems'].items() if k.startswith('Sb')}, 'lib': parts['lib']}
    jelly['particles'] = {'systems': {k: v for k, v in parts['systems'].items() if k.startswith('Jelly')}}
    newaud, acost = encode_audio()
    # ánh xạ guid -> khoá DR_AUDIO
    keymap = dict(EXISTING)
    for k in newaud:
        keymap[newaud[k]['orig']] = k
    keys = {}
    for role, guids in aud.items():
        ks = []
        for g in guids:
            nm = audio_name_of(g)
            if nm in keymap:
                ks.append(keymap[nm])
        keys[role] = ks
    data['audioKeys'] = keys
    data['audioDefs'] = newaud
    jelly['spore']['audio']['key'] = keymap.get(audio_name_of(jelly['spore']['audio']['guid']))
    jelly['audioDefs'] = {k: v for k, v in newaud.items() if v['orig'].startswith('World Event')}
    data['audioDefs'] = {k: v for k, v in newaud.items() if not v['orig'].startswith('World Event')}
    n1 = js_dump(OUT_SB, 'DR_SBCREATURE', data, 'SBMonster (R2)')
    n2 = js_dump(OUT_JELLY, 'DR_JELLY', jelly, 'Jellyfish (R2)')
    art = sum(os.path.getsize(os.path.join(OUT_ART, f)) for f in os.listdir(OUT_ART))
    log('data/sbcreature.js %d KB, data/jelly.js %d KB, art/sb %d KB, audio/sb %d KB; tổng %d KB' % (n1 // 1024, n2 // 1024, art // 1024, acost // 1024,
                                                                                               (n1 + n2 + art + acost) // 1024))


if __name__ == '__main__':
    main()
