"""Night Angler (MarrowMonster, MONSTERS.md §2.1, đơn vị U1) -> data/angler.js + art/vfx/angler/*.webp.

Chạy:  python -I games/dredge/tools/angler.py          (~10 s; đọc Game.unity 168 MB một lần)
       python -I games/dredge/tools/angler.py --dis    (thêm: rã DXBC Monster_Shader + FogGhost_Shader vào D:/dredge-ref/cache/angler/shaders,
                                                       cần UnityPy + bundle game như tools/particles.py --dis)
Đọc:   MonoBehaviour/MarrowMonster.asset (MonsterData), GameObject/MarrowMonster.prefab (MarrowMonster, VariablePlayerDamager, NavMeshAgent,
       BuoyantObject + Rigidbody, CapsuleCollider, RangeSensor, AudioSource ×5, VFXVolumeFader, cây Transform, SkinnedMeshRenderer
       monster_marrow, MeshRenderer GhostModel), Mesh/monster_marrow.asset + Mesh/GhostBoat1_0.asset, AnimationClip/MarrowMonster_{Swim,Idle,
       Attack}.anim, AnimatorController/MarrowMonster{Position,State}Animator.controller, Material/MarrowMonster_Mat.mat (Monster_Shader_0),
       Material/MarrowMonsterGhostBoat_Mat.mat (FogGhost_Shader_0), Scenes/Game.unity (Logic/MonsterManager: secondsBetweenChecks, monsterConfigs;
       MarrowMonsterPaths/MarrowMonster{,2}/Path/1..10).
Ra:    window.DR_ANGLER = { data, monster, damager, agent, buoyancy, collider, sensor, audio, fader, manager{secondsBetweenChecks, configs[{maxSpawned,
       path[[x,z]...]}]}, nodes[], skin{...}, ghost{...}, clips{swim, idle, attack}, animator{...}, mat{monster, ghost} }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w), Euler độ (x,y,z) -> (-x,-y,z) cùng thứ tự
       ZXY = three 'YXZ', tam giác đảo chiều, bindpose S·M·S). Đường đi: toạ độ THẾ GIỚI three.js [x, z] (z đã đổi dấu).
Mesh: mã hoá base64 (Int16 vị trí lượng tử theo hộp bao, Uint16 uv, Uint8 xương/trọng số/màu, Uint16 chỉ số) để giữ data/angler.js nhỏ.
       Không ghi pháp tuyến: cả Monster_Shader lẫn FogGhost_Shader (DXBC) không đọc NORMAL ở pixel shader.
Bẫy: tên thuộc tính Monster_Shader: Texture2D_f4d8... = "Texture" (màu), Texture2D_23e2... = "Emission" (Properties của shader; tools/tentacle.py
     đặt ngược hai tên này). Clip Swim dùng m_EulerCurves (độ), không phải quaternion. Rerunnable: cùng đầu vào ra cùng đầu ra (từng byte).
"""
import base64, io, os, re, json, struct, sys
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'angler.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'angler')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
CATALOG = os.path.join('D:' + os.sep, 'dredge-ref', 'game', 'DREDGE.v1.5.3_LinkNeverDie.Com', 'DREDGE_Data', 'StreamingAssets', 'aa', 'catalog.json')
TEX_MAX = 256  # gốc MarrowMonster_Texture 256, Emission 128, SmallBoat_Emission_2 32: giữ nguyên cỡ


def rnd(v, n=5):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, float):
        r = round(v, n)
        return 0.0 if r == 0 else r
    return v


def load_doc(path):
    txt = io.open(path, encoding='utf-8').read()
    parts = HDR.split(txt)
    objs = {}
    for i in range(1, len(parts), 3):
        body = yaml.load(parts[i + 2], Loader=CL)
        objs[int(parts[i + 1])] = (int(parts[i]), list(body.values())[0], list(body.keys())[0])
    return objs


def yaml_body(path):
    return list(yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]


_guid_cache = {}


def guid_path(kind_dirs, guid):
    """Tệp trong Assets/<kind_dir> (đệ quy) có .meta chứa guid ở dòng guid đầu tiên."""
    if isinstance(kind_dirs, str):
        kind_dirs = [kind_dirs]
    for kd in kind_dirs:
        key = (kd, guid)
        if key in _guid_cache:
            return _guid_cache[key]
        for dp, _, fns in sorted(os.walk(os.path.join(ASSETS, kd))):
            for fn in sorted(fns):
                if fn.endswith('.meta'):
                    with io.open(os.path.join(dp, fn), encoding='utf-8', errors='replace') as f:
                        m = re.search(r'^guid: ([0-9a-f]+)', f.read(400), re.M)
                    if m and m.group(1) == guid:
                        _guid_cache[key] = os.path.join(dp, fn[:-5])
                        return _guid_cache[key]
    raise SystemExit('không thấy tệp guid %s trong %s' % (guid, kind_dirs))


_addr = None


def addressable(guid):
    """AssetReference guid -> đường dẫn asset trong catalog.json của bản build (cùng cách giải của tools/boat.py guid_path)."""
    global _addr
    if _addr is None:
        d = json.load(open(CATALOG, encoding='utf-8'))
        kd, bd, ed = (base64.b64decode(d[k]) for k in ('m_KeyDataString', 'm_BucketDataString', 'm_EntryDataString'))
        nb = struct.unpack_from('<i', bd, 0)[0]
        p, keys, buckets = 4, [], []
        for _ in range(nb):
            ko, ne = struct.unpack_from('<ii', bd, p)
            buckets.append(struct.unpack_from('<%di' % ne, bd, p + 8))
            p += 8 + 4 * ne
            t = kd[ko]
            if t in (0, 1):
                n = struct.unpack_from('<i', kd, ko + 1)[0]
                keys.append(kd[ko + 5:ko + 5 + n].decode('ascii' if t == 0 else 'utf-16-le'))
            else:
                keys.append(None)
        ne = struct.unpack_from('<i', ed, 0)[0]
        entries = [struct.unpack_from('<7i', ed, 4 + 28 * i) for i in range(ne)]
        _addr = {}
        for k, b in zip(keys, buckets):
            if isinstance(k, str) and re.fullmatch(r'[0-9a-f]{32}', k) and b:
                _addr[k] = d['m_InternalIds'][entries[b[0]][0]]
    r = _addr.get(guid)
    if not r:
        raise SystemExit('catalog.json không có AssetReference %s' % guid)
    return r


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


def conv_q(q):  # Unity (x,y,z,w) -> three (đổi dấu z của không gian): (-x,-y,z,w)
    return [-q[0], -q[1], q[2], q[3]]


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')


# ---------------------------------------------------------------- mesh
def read_mesh(path, skinned):
    """Mesh YAML -> dict mã hoá base64 (đã đổi sang three.js). skinned: thêm skinIndex/skinWeight + bindposes."""
    d = yaml_body(path)
    vd = d['m_VertexData']
    n, ch = vd['m_VertexCount'], vd['m_Channels']
    raw = bytes.fromhex(vd['_typelessdata'])
    FSZ = [4, 2, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4]
    streams = {}
    for c in ch:
        if c['dimension'] & 15:
            streams[c['stream']] = max(streams.get(c['stream'], 0), c['offset'] + FSZ[c['format']] * (c['dimension'] & 15))
    base, off = {}, 0
    for s in sorted(streams):
        base[s] = off
        off += (streams[s] * n + 15) // 16 * 16

    def chan(i):
        c = ch[i]
        if not (c['dimension'] & 15):
            return None
        dim, fmt, st = c['dimension'] & 15, c['format'], c['stream']
        stride = streams[st]
        rows = np.frombuffer(raw[base[st]: base[st] + stride * n], dtype=np.uint8).reshape(n, stride)
        a = rows[:, c['offset']: c['offset'] + FSZ[fmt] * dim].copy()
        if fmt == 0:
            return a.view(np.float32).reshape(n, dim).astype(np.float64)
        if fmt == 1:
            return a.view(np.float16).reshape(n, dim).astype(np.float64)
        if fmt == 2:
            return a.reshape(n, dim).astype(np.float64) / 255.0
        if fmt == 10:
            return a.view(np.uint32).reshape(n, dim).astype(np.int64)
        if fmt == 4:
            return a.view(np.uint16).reshape(n, dim).astype(np.int64)
        raise SystemExit('định dạng kênh %d chưa hỗ trợ (kênh %d)' % (fmt, i))
    pos, col, uv = chan(0), chan(3), chan(4)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)
    tris = []
    for sm in d['m_SubMeshes']:
        first = sm['firstByte'] // (2 if d.get('m_IndexFormat', 0) == 0 else 4)
        tris.append(idx[first: first + sm['indexCount']] + sm.get('baseVertex', 0))
    tri = np.concatenate(tris).reshape(-1, 3)[:, [0, 2, 1]]
    pos = pos.copy()
    pos[:, 2] *= -1
    lo, hi = pos.min(0), pos.max(0)
    q = np.round((pos - lo) / np.maximum(hi - lo, 1e-9) * 65535 - 32768).astype(np.int16)
    out = {'n': n, 'min': rnd(lo.tolist(), 4), 'max': rnd(hi.tolist(), 4), 'pos': b64(q),
           'uv': b64(np.round(np.clip(uv[:, :2], 0, 1) * 65535).astype(np.uint16)), 'index': b64(tri.reshape(-1).astype(np.uint16))}
    assert (uv[:, :2] >= -1e-4).all() and (uv[:, :2] <= 1 + 1e-4).all(), 'uv ngoài [0,1]: cần đổi lượng tử'
    assert n < 65536
    if col is not None:
        out['color'] = b64(np.round(col[:, :4] * 255).astype(np.uint8))
    bind = None
    if skinned:
        wts, idx4 = chan(12), chan(13)
        assert idx4.max() < 256
        w8 = np.round(wts * 255).astype(np.int64)
        w8[:, 0] += 255 - w8.sum(1)  # tổng trọng số đúng 255 sau lượng tử
        out['skinIndex'] = b64(idx4.astype(np.uint8))
        out['skinWeight'] = b64(w8.astype(np.uint8))
        S = np.diag([1.0, 1.0, -1.0, 1.0])
        bind = []
        for b in d['m_BindPose']:
            M = np.array([[b['e%d%d' % (r, c)] for c in range(4)] for r in range(4)], dtype=np.float64)
            M = S @ M @ S
            bind.append(rnd(M.T.reshape(-1).tolist(), 6))  # three.js Matrix4.fromArray: cột trước
    return out, bind, len(tri)


# ---------------------------------------------------------------- clip
def clip(path, node_of_path):
    """Đường cong của clip: [{node, kind 'q'|'e'|'p'|'s', keys[[t, v..., in..., out...]]}], đã đổi hệ toạ độ."""
    doc = yaml_body(path)
    curves = []

    def add(lst, kind):
        for c in lst:
            assert c['path'] in node_of_path, 'đường cong %s không khớp nút nào' % c['path']
            if kind == 'e':
                assert c['curve'].get('m_RotationOrder', 4) == 4, 'Euler không phải ZXY'
            keys = []
            for k in c['curve']['m_Curve']:
                comp = 'xyzw' if kind == 'q' else 'xyz'
                v, i, o = vec(k['value'], comp), vec(k['inSlope'], comp), vec(k['outSlope'], comp)
                if kind == 'q':
                    v, i, o = conv_q(v), conv_q(i), conv_q(o)
                elif kind == 'p':
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                elif kind == 'e':  # độ, ZXY: lật z của không gian -> đảo dấu góc quanh x và y
                    v[0], i[0], o[0], v[1], i[1], o[1] = -v[0], -i[0], -o[0], -v[1], -i[1], -o[1]
                keys.append(rnd([float(k['time'])] + v + i + o, 5))
            curves.append({'node': node_of_path[c['path']], 'kind': kind, 'keys': keys})
    add(doc['m_RotationCurves'], 'q')
    add(doc['m_EulerCurves'], 'e')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    assert not doc['m_FloatCurves'] and not doc['m_CompressedRotationCurves']
    events = [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']]
    st = doc['m_AnimationClipSettings']
    return {'name': doc['m_Name'], 'len': round(float(st['m_StopTime']), 5), 'loop': bool(st['m_LoopTime']), 'events': events, 'curves': curves}


def controller(path):
    """AnimatorController: trạng thái {tên: {speed, clip guid}}, mặc định, chuyển trạng thái (điều kiện, thời lượng, exitTime)."""
    objs = load_doc(path)
    states, trans = {}, []
    default = None
    for i, (ty, b, _) in objs.items():
        if ty == 1102:
            states[i] = {'name': b['m_Name'], 'speed': float(b['m_Speed']), 'clip': b['m_Motion'].get('guid')}
        if ty == 1107:
            default = b['m_DefaultState']['fileID']
    for i, (ty, b, _) in objs.items():
        if ty == 1102:
            for t in b['m_Transitions']:
                tb = objs[t['fileID']][1]
                trans.append({'from': states[i]['name'], 'to': states[tb['m_DstState']['fileID']]['name'],
                              'when': [c['m_ConditionEvent'] for c in tb['m_Conditions']], 'duration': round(float(tb['m_TransitionDuration']), 5),
                              'fixed': bool(tb['m_HasFixedDuration']), 'exitTime': round(float(tb['m_ExitTime']), 5) if tb['m_HasExitTime'] else None})
    trans.sort(key=lambda t: (t['from'], t['to']))
    return states, states[default]['name'], trans


def save_tex(src, name, rgba=False):
    im = Image.open(src).convert('RGBA' if rgba else 'RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=85, method=6, lossless=rgba)
    return 'art/vfx/angler/' + name + '.webp', os.path.getsize(p)


# ---------------------------------------------------------------- cảnh: MonsterManager + đường đi
class Scene:
    """Đọc từng khối của Game.unity theo fileID (chỉ parse khối cần)."""

    def __init__(self, path):
        self.txt = io.open(path, encoding='utf-8').read()
        self.at = {}
        hs = list(HDR.finditer(self.txt))
        for k, m in enumerate(hs):
            self.at[int(m.group(2))] = (int(m.group(1)), m.end(), hs[k + 1].start() if k + 1 < len(hs) else len(self.txt))
        self.cache = {}

    def get(self, fid):
        if fid not in self.cache:
            ty, a, b = self.at[fid]
            self.cache[fid] = list(yaml.load(self.txt[a:b], Loader=CL).values())[0]
        return self.cache[fid]

    def go_named(self, name):
        out = []
        for m in re.finditer(r'^  m_Name: %s\n' % re.escape(name), self.txt, re.M):
            start = self.txt.rfind('\n--- !u!', 0, m.start())
            h = HDR.match(self.txt, start + 1)
            if h and h.group(1) == '1':
                out.append(int(h.group(2)))
        return out

    def comp(self, go, pred):
        for c in self.get(go)['m_Component']:
            fid = c['component']['fileID']
            if pred(self.at[fid][0], fid):
                return fid
        return None

    def world(self, tf):
        """Ma trận thế giới Unity 4x4 của Transform."""
        M = np.eye(4)
        while tf:
            t = self.get(tf)
            p, q, s = vec(t['m_LocalPosition']), vec(t['m_LocalRotation'], 'xyzw'), vec(t['m_LocalScale'])
            x, y, z, w = q
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            L = np.eye(4)
            L[:3, :3] = R * np.array(s)
            L[:3, 3] = p
            M = L @ M
            tf = t['m_Father']['fileID']
        return M

    def name_of_tf(self, tf):
        return str(self.get(self.get(tf)['m_GameObject']['fileID'])['m_Name'])

    def path_of_tf(self, tf):
        out = []
        while tf:
            out.append(self.name_of_tf(tf))
            tf = self.get(tf)['m_Father']['fileID']
        return '/'.join(reversed(out))


def manager():
    sc = Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    gos = sc.go_named('MonsterManager')
    assert len(gos) == 1, 'MonsterManager: %d GameObject' % len(gos)
    mb = sc.comp(gos[0], lambda ty, fid: ty == 114 and 'secondsBetweenChecks' in sc.get(fid))
    m = sc.get(mb)
    cfgs = []
    for c in m['monsterConfigs']:
        md = guid_path('MonoBehaviour', c['monsterData']['guid'])
        pts, names = [], []
        for p in c['path']:
            W = sc.world(p['fileID'])
            pts.append(rnd([float(W[0, 3]), -float(W[2, 3])], 3))     # three.js [x, z]
            names.append(sc.path_of_tf(p['fileID']))
        cfgs.append({'monsterData': os.path.basename(md)[:-6], 'maxSpawned': int(c['maxSpawned']), 'path': pts, 'pathNames': names})
    return {'src': 'Scenes/Game.unity: ' + sc.path_of_tf(sc.comp(gos[0], lambda ty, fid: ty == 4)) + ' (MonsterManager.cs)',
            'secondsBetweenChecks': float(m['secondsBetweenChecks']), 'configs': cfgs}


# ---------------------------------------------------------------- prefab
def main():
    pre = os.path.join(ASSETS, 'GameObject', 'MarrowMonster.prefab')
    objs = load_doc(pre)
    go = {i: o[1] for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {t['m_GameObject']['fileID']: i for i, t in tf.items()}
    name_of_tf = {i: str(go[t['m_GameObject']['fileID']]['m_Name']) for i, t in tf.items()}
    by_cls = {}
    for i, (ty, b, cls) in objs.items():
        if cls == 'MonoBehaviour':
            by_cls.setdefault(b['m_Script']['guid'], []).append((i, b))
        else:
            by_cls.setdefault(cls, []).append((i, b))

    def mb_with(field):
        r = [b for (ty, b, cls) in objs.values() if cls == 'MonoBehaviour' and field in b]
        assert len(r) == 1, field
        return r[0]
    mm = mb_with('attackDistanceThreshold')            # MarrowMonster.cs
    vpd = mb_with('damagePoints')                      # VariablePlayerDamager.cs
    buoy = mb_with('objectDepth')                      # BuoyantObject.cs
    sensor = mb_with('SensorRange')                    # SensorToolkit RangeSensor
    fader = mb_with('maxBlendDistance')                # VFXVolumeFader.cs
    agent = by_cls['NavMeshAgent'][0][1]
    rb = objs[buoy['rb']['fileID']][1]
    cap = objs[mm['monsterCollider']['fileID']][1]
    md = yaml_body(os.path.join(ASSETS, 'MonoBehaviour', 'MarrowMonster.asset'))

    # ---- cây nút: toàn bộ Transform dưới gốc trừ Audio/Sensor/PostProcessVolume/BuoyancyEffectors/AttackSplash (AttackSplash tắt và không ai
    # bật: chỉ 3 tham chiếu là chính các component của nó)
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    SKIP = {'Audio', 'Sensor', 'PostProcessVolume', 'BuoyancyEffectors', 'AttackSplash'}
    order = []

    def walk(t):
        if name_of_tf[t] in SKIP:
            return
        order.append(t)
        for c in tf[t]['m_Children']:
            walk(c['fileID'])
    walk(root_tf)
    index = {t: i for i, t in enumerate(order)}
    nodes = []
    for t in order:
        T = tf[t]
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        nodes.append({'name': name_of_tf[t], 'parent': index.get(T['m_Father']['fileID'], -1), 'p': rnd(p, 5),
                      'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(vec(T['m_LocalScale']), 6)})
    node_idx = lambda nm: [i for i, n in enumerate(nodes) if n['name'] == nm][0]

    # ---- quái da thịt: SkinnedMeshRenderer monster_marrow
    smr = by_cls['SkinnedMeshRenderer'][0][1]
    skin_mesh, bind, skin_tris = read_mesh(guid_path('Mesh', smr['m_Mesh']['guid']), True)
    bones = [index[b['fileID']] for b in smr['m_Bones']]
    assert len(bind) == len(bones), 'số bindpose %d khác số xương %d' % (len(bind), len(bones))
    skin = {'node': index[tf_of_go[smr['m_GameObject']['fileID']]], 'bones': bones, 'bindPoses': bind, 'mesh': skin_mesh,
            'rootBone': index[smr['m_RootBone']['fileID']]}
    # ---- vỏ bọc tàu ma: GhostModel (MeshFilter + MeshRenderer)
    mf = by_cls['MeshFilter'][0][1]
    ghost_mesh, _, ghost_tris = read_mesh(guid_path('Mesh', mf['m_Mesh']['guid']), False)
    ghost = {'node': index[tf_of_go[mf['m_GameObject']['fileID']]], 'mesh': ghost_mesh, 'meshName': 'GhostBoat1_0'}

    # ---- hoạt ảnh: Animator Monster (PositionAnimator: Swim) + Animator marrow_swim (StateAnimator: Idle ×4 / MarrowMonster_Attack)
    def tpath(t, top):
        p = []
        while t and t != top:
            p.append(name_of_tf[t])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    anims = {}
    for i, a in by_cls['Animator']:
        top = tf_of_go[a['m_GameObject']['fileID']]
        def under(t):
            while t:
                if t == top:
                    return True
                t = tf[t]['m_Father']['fileID']
            return False
        npath = {tpath(t, top): index[t] for t in order if under(t)}
        ctrl = guid_path('AnimatorController', a['m_Controller']['guid'])
        states, default, trans = controller(ctrl)
        st = {}
        for s in states.values():
            c = clip(guid_path('AnimationClip', s['clip']), npath)
            st[s['name']] = {'speed': s['speed'], 'clip': c['name']}
            anims.setdefault('clips', {})[c['name']] = c
        anims[os.path.basename(ctrl)[:-11]] = {'node': index[top], 'states': st, 'default': default, 'transitions': trans}
    clips = anims.pop('clips')

    # ---- vật liệu
    def mat(guid):
        p = guid_path('Material', guid)
        return os.path.basename(p)[:-4], yaml_body(p)['m_SavedProperties']
    mname, mm_mat = mat(smr['m_Materials'][0]['guid'])
    gname, gh_mat = mat(by_cls['MeshRenderer'][0][1]['m_Materials'][0]['guid'])
    size = 0
    tex = {}
    for key, prop, mp, rgba in (('albedo', 'Texture2D_f4d8f19682674cb985d212562826db7c', mm_mat, False),
                                ('emission', 'Texture2D_23e21d2602df45a9921e7c096a6a9432', mm_mat, False),
                                ('ghostEmission', 'Texture2D_3928416cd23c4ee1bf58f20f4af23151', gh_mat, True)):
        src = guid_path('Texture2D', mp['m_TexEnvs'][prop]['m_Texture']['guid'])
        tex[key], n = save_tex(src, key, rgba)
        size += n
    mats = {
        'monster': {'name': mname, 'shader': 'Shader Graphs/Monster_Shader (Monster_Shader_0)', 'albedo': tex['albedo'], 'emission': tex['emission'],
                    'emissionStrength': float(mm_mat['m_Floats']['Vector1_b0d9cca47aa941e7b3c694dbf011a310']),
                    'emissionEffectiveDistance': float(mm_mat['m_Floats']['_EmissionEffectiveDistance']),
                    'yFade': int(mm_mat['m_Floats']['BOOLEAN_EE28029A70D44328B5150E5206E2185D'])},
        'ghost': {'name': gname, 'shader': 'Shader Graphs/FogGhost_Shader (FogGhost_Shader_0)', 'emission': tex['ghostEmission'],
                  'opacity': float(gh_mat['m_Floats']['Vector1_76d8fb83378743bca37835619bac53ee']),
                  'appearOnlyInFog': int(gh_mat['m_Floats']['_APPEARONLYINFOG'])},
    }

    # ---- tiếng
    def clipname(ref):
        return os.path.splitext(os.path.basename(guid_path(['AudioClip', 'Audio'], ref['guid'])))[0]
    audio = {}
    for key, fld in (('idle', 'idleLoopAudio'), ('aggro', 'aggroLoopAudio'), ('call', 'callAudio'), ('aggroCall', 'aggroCallAudio'), ('retreat', 'retreatAudio')):
        a = objs[mm[fld]['fileID']][1]
        audio[key] = {'clip': clipname(a['m_audioClip']), 'vol': float(a['m_Volume']), 'loop': bool(a['Loop']), 'min': float(a['MinDistance']),
                      'max': float(a['MaxDistance']), 'rolloff': int(a['rolloffMode'])}
    audio['calls'] = [clipname(c) for c in mm['callAudioClips']]
    audio['aggroCalls'] = [clipname(c) for c in mm['aggroCallAudioClips']]
    audio['attack'] = os.path.splitext(addressable(mm['attackSFX']['m_AssetGUID']).rsplit('/', 1)[-1])[0]   # AssetReference (Addressables)

    data = {
        'src': 'GameObject/MarrowMonster.prefab + MonoBehaviour/MarrowMonster.asset + Scenes/Game.unity (Logic/MonsterManager)',
        'data': {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in md.items()
                 if k in ('worldPhaseMin', 'spawnTime', 'despawnTime', 'spawnMinDistance', 'spawnMaxDistance', 'despawnDistanceThreshold', 'idleDepth',
                          'disappearDepth', 'seekDelaySec', 'playerLostThreshold', 'patrolSpeed', 'huntSpeed', 'fleeSpeed')},
        'monster': {k: float(mm[k]) for k in ('waypointDistanceThreshold', 'playerTargetReevaluationInterval', 'timeBetweenPlayerDetectionAudioClips',
                                              'callAudioDelayMin', 'callAudioDelayMax', 'moveSpeedScalar', 'boatSpeedMin', 'boatSpeedMax',
                                              'attackSpeedBoostFactor', 'attackMaxBoatSpeed', 'attackMovementSpeedMultiplier', 'attackDistanceThreshold')},
        'damager': {k: int(vpd[k]) for k in ('oneHitOnly', 'damagePoints', 'requireOneHealthToKill', 'extraDamageInNightmareMode')},
        'agent': {'speed': float(agent['m_Speed']), 'acceleration': float(agent['m_Acceleration']), 'angularSpeed': float(agent['m_AngularSpeed']),
                  'radius': float(agent['m_Radius']), 'stoppingDistance': float(agent['m_StoppingDistance']), 'autoBraking': int(agent['m_AutoBraking'])},
        'buoyancy': {'strength': float(buoy['strength']), 'objectDepth': float(buoy['objectDepth']), 'gravityModifier': float(buoy['gravityModifier']),
                     'mass': float(rb['m_Mass']), 'drag': float(rb['m_Drag']), 'node': node_idx('Monster')},
        'collider': {'center': rnd([float(cap['m_Center']['x']), float(cap['m_Center']['y']), -float(cap['m_Center']['z'])], 5),
                     'radius': float(cap['m_Radius']), 'height': float(cap['m_Height']), 'direction': int(cap['m_Direction']), 'node': node_idx('Collider')},
        'sensor': {'range': float(sensor['SensorRange']), 'interval': float(sensor['CheckInterval']), 'lineOfSight': int(sensor['RequiresLineOfSight']),
                   'blockMask': int(sensor['BlocksLineOfSight']['m_Bits'])},
        'fader': {'minBlendDistance': float(fader['minBlendDistance']), 'maxBlendDistance': float(fader['maxBlendDistance']),
                  'blendDurationSec': float(fader['blendDurationSec'])},
        'audio': audio,
        'manager': manager(),
        'nodes': nodes, 'skin': skin, 'ghost': ghost, 'clips': clips, 'animator': anims, 'mat': mats,
        'particles': {'wake': ['MarrowMonsterWake', node_idx('feeler1_jnt')], 'hit': ['MarrowMonsterBoatDamageFX', 0]},
    }
    js = ('// Generated by games/dredge/tools/angler.py from MarrowMonster.prefab + MarrowMonster.asset + Game.unity MonsterManager. Do not edit.\n'
          'window.DR_ANGLER = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('nodes %d  skin verts %d tris %d bones %d  ghost verts %d tris %d  clips %s  paths %s  js %d KB  tex %d KB' %
          (len(nodes), skin_mesh['n'], skin_tris, len(bones), ghost_mesh['n'], ghost_tris,
           ' '.join('%s %.2fs' % (k, c['len']) for k, c in sorted(clips.items())),
           ' | '.join('%s' % c['path'][4] for c in data['manager']['configs']), len(js.encode('utf-8')) // 1024, size // 1024))
    if '--dis' in sys.argv:
        dis()


def dis():
    """Rã DXBC pass đầu (biến thể không keyword, như vật liệu) của Monster_Shader + FogGhost_Shader trong bundle gamescene."""
    sys.path.insert(0, HERE)
    import UnityPy
    import particles as P
    sh = P.Shaders.__new__(P.Shaders)
    sh.objs, sh.cache = {}, {}
    for b in sorted(os.listdir(P.AA)):
        if b.startswith('gamescene') and b.endswith('.bundle'):
            for o in UnityPy.load(os.path.join(P.AA, b)).objects:
                if o.type.name == 'Shader':
                    s = o.read()
                    nm = s.m_ParsedForm.m_Name
                    if nm in ('Shader Graphs/Monster_Shader', 'Shader Graphs/FogGhost_Shader') and nm not in sh.objs:
                        sh.objs[nm] = s
    for nm in sorted(sh.objs):
        print(nm, sh.get(nm), sh.dis(nm, [[]], r'D:\dredge-ref\cache\angler\shaders'))


if __name__ == '__main__':
    main()
