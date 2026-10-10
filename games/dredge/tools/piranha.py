"""Cá piranha + Mẹ Không Mắt của Devil's Spine (WORLD-GAPS.md R5) -> data/piranha.js + art/piranha/*.webp + art/piranha/audio/*.mp3.

Chạy:  python -I games/dredge/tools/piranha.py
Đọc:   Assets/Scenes/Game.unity (20 DSLittleMonsterSpawner + vị trí thế giới, DSMonsterManager, EntityPath 15 điểm, 27 collider tag Vent),
       Assets/GameObject/DSLittleMonster.prefab + DSBigMonster.prefab (DSLittleMonster.cs, DSBigMonster.cs, Rigidbody, NavMeshAgent, bộ spawner của mẹ,
       SkinnedMeshRenderer dsmomnster / DS_MotherMonster, xương), AnimatorController DevilsSpineLittleMonsterAnimator / DSMonsterSwimAnimator /
       DevilsSpineBigMonsterAnimator + AnimationClip (Take 001, DevilsSpineMonster_{Spawn,Despawn,Idle}, DS_Mother_{SwimIdle,Attack}),
       Assets/NavMeshData/NavMesh-DS_LargeNavMeshSurface.asset (agent 287145453 của mẹ), vật liệu DSMonster_Mat / DS_MotherMonster_Mat,
       GameConfigDataProd.numAttachedMonstersToNullifyEngines, 9 AudioClip (guid -> tên qua Assets/Audio/**.meta).
Ra:    window.DR_PIRANHA = { cfg, spawners[], vents[], manager, route[], little{...}, mother{...}, nav{...}, audio{...} } và thêm các khoá tiếng vào DR_AUDIO.
Toạ độ: như tools/tentacle.py (Unity trái tay -> three.js phải tay bằng đổi dấu z; quaternion (x,y,z,w) -> (-x,-y,z,w); tam giác đảo chiều).
Bẫy:   (1) Spawner và vent là GameObject lồng nhau: phải nhân cả chuỗi Transform cha (có xoay / tỉ lệ), không chỉ localPosition.
       (2) Mẹ có BỘ SPAWNER RIÊNG (3 con, spawnDistance 150) gắn trong prefab; neo nhà = LittleMonsterAnchor (1,-1,0) cục bộ, xoay theo mẹ.
       (3) DamageCollider của mẹ là nút con của xương headroot_jnt, bật bởi đường cong m_IsActive của clip Attack (bật 0 -> 1,5 s) chứ không luôn bật.
       (4) NavMesh của mẹ là bề mặt RIÊNG (DS_Large, agent 287145453), không phải navmask-generic của DRNav.
       (5) Rigidbody cá nhỏ: khối lượng 0,1, drag 10: lực forward·speed cho vận tốc cân bằng 0,8·speed (tích phân PhysX 0,02 s), không phải speed.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys, glob, shutil, subprocess, struct, base64
import numpy as np
import yaml
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'piranha.js')
OUT_ART = os.path.join(GAME, 'art', 'piranha')
OUT_AUDIO = os.path.join(OUT_ART, 'audio')
OGG_DIR = r'D:\dredge-ref\audio\gameaudio'
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
TEX_MAX = {'little': 256, 'mother': 512}   # [ĐỀ XUẤT] cạnh lớn nhất của texture (ngân sách < 1 MB cho cả đơn vị R5)


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
        objs[int(parts[i + 1])] = (int(parts[i]), list(body.values())[0])
    return objs


def yaml_asset(path):
    return list(yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]


def guid_path(kind_dir, guid):
    d = os.path.join(ASSETS, kind_dir)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as f:
                if 'guid: ' + guid in f.read(400):
                    return os.path.join(d, fn[:-5])
    raise SystemExit('không thấy tệp guid %s trong %s' % (guid, kind_dir))


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


def conv_q(q):
    return [-q[0], -q[1], q[2], q[3]]


# ---------------------------------------------------------------- scene: ma trận thế giới của chuỗi Transform
def qmat(x, y, z, w):
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


class Scene:
    def __init__(self, path):
        txt = io.open(path, encoding='utf-8').read()
        parts = HDR.split(txt)
        self.raw = {int(parts[i + 1]): (int(parts[i]), parts[i + 2]) for i in range(1, len(parts), 3)}
        self.cache = {}

    def Y(self, i):
        if i not in self.cache:
            self.cache[i] = list(yaml.load(self.raw[i][1], Loader=CL).values())[0]
        return self.cache[i]

    def comps(self, go):
        return [c['component']['fileID'] for c in self.Y(go)['m_Component']]

    def tf_of(self, go):
        for c in self.comps(go):
            if self.raw[c][0] in (4, 224):
                return c

    def find_script(self, go, guid):
        for c in self.comps(go):
            if self.raw[c][0] == 114 and ('guid: ' + guid) in self.raw[c][1]:
                return c

    def chain(self, tid):
        out = []
        while tid:
            T = self.Y(tid)
            out.append(T)
            tid = T['m_Father']['fileID']
        return out

    def world(self, tid):
        M = np.eye(4)
        for T in self.chain(tid):
            p, q, s = T['m_LocalPosition'], T['m_LocalRotation'], T['m_LocalScale']
            m = np.eye(4)
            m[:3, :3] = qmat(q['x'], q['y'], q['z'], q['w']) @ np.diag([s['x'], s['y'], s['z']])
            m[:3, 3] = [p['x'], p['y'], p['z']]
            M = m @ M
        return M

    def path(self, tid):
        return '/'.join(reversed([str(self.Y(T['m_GameObject']['fileID'])['m_Name']) for T in self.chain(tid)]))

    def active(self, go):
        return bool(self.Y(go)['m_IsActive'])

    def tree_active(self, tid):
        return all(self.Y(T['m_GameObject']['fileID'])['m_IsActive'] for T in self.chain(tid))


def script_guid(name):
    for line in io.open(os.path.join(ASSETS, 'Scripts', 'Assembly-CSharp', name + '.cs.meta'), encoding='utf-8'):
        if line.startswith('guid:'):
            return line.split()[1]


def three(p):
    return [round(float(p[0]), 3), round(float(p[1]), 3), round(-float(p[2]), 3)]


def spawn_cfg(c):
    return {k: float(c[k]) for k in ('speed', 'turnSpeed', 'wiggleAmount', 'wiggleSpeed', 'viewDistance', 'circleSpeed', 'circleDistance', 'lookFrequencySec')}


def scene_data():
    sc = Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    g_sp, g_mgr = script_guid('DSLittleMonsterSpawner'), script_guid('DSMonsterManager')
    spawners = []
    mono = {i: v for i, v in sc.raw.items() if v[0] == 114}
    for i, (k, body) in sorted(mono.items()):
        if 'guid: ' + g_sp not in body[:600]:
            continue
        m = sc.Y(i)
        go = m['m_GameObject']['fileID']
        tid = sc.tf_of(go)
        pos = sc.world(tid)[:3, 3]
        home = sc.world(m['homeAnchor']['fileID'])[:3, 3]
        cfgs = [spawn_cfg(c) for c in m['spawnConfigs']]
        spawners.append({'name': sc.path(tid), 'active': bool(sc.tree_active(tid) and m['m_Enabled']), 'pos': three(pos), 'home': three(home), 'cfgs': cfgs,
                         'canLosePlayerBySight': bool(m['canLosePlayerBySight']), 'attachDistance': float(m['attachDistanceThreshold']),
                         'timeBetweenSpawns': float(m['timeBetweenSpawnsSec']), 'timeBetweenChecks': float(m['timeBetweenSpawnChecksSec']),
                         'spawnDistance': float(m['spawnDistance']), 'despawnDistance': float(m['despawnDistance']), 'maxRange': float(m['maxRange']),
                         'displacedDespawnDistance': float(m['displacedDespawnDistance'])})
    spawners.sort(key=lambda s: int(s['name'].split('/')[-1]))
    # prefab của mẹ cũng mang một DSLittleMonsterSpawner (không nằm trong scene): đọc ở phần prefab
    mgr = [i for i, (k, body) in mono.items() if 'guid: ' + g_mgr in body[:600]]
    assert len(mgr) == 1, 'cần đúng 1 DSMonsterManager, thấy %d' % len(mgr)
    m = sc.Y(mgr[0])
    mt = sc.tf_of(m['m_GameObject']['fileID'])
    path_tf = sc.Y(m['path']['fileID'])  # EntityPath
    route = [three(sc.world(r['fileID'])[:3, 3]) for r in path_tf['route']]
    manager = {'name': sc.path(mt), 'pos': three(sc.world(mt)[:3, 3]), 'anchor': three(sc.world(m['anchorTransform']['fileID'])[:3, 3]),
               'spawnRange': float(m['spawnRange']), 'despawnRange': float(m['despawnRange']), 'deaggroRange': float(m['deaggroRange']),
               'timeBetweenSpawnChecks': float(m['timeBetweenSpawnChecks']), 'bigPrefabGuid': m['bigMonsterPrefab']['guid'], 'smallPrefabGuid': None}
    # vent: GameObject tag Vent có collider trigger; NavMeshObstacle cùng tag bị bỏ qua
    vents = []
    for gid, (k, body) in sorted(sc.raw.items()):
        if k == 1 and re.search(r'm_TagString: Vent\b', body):
            go = sc.Y(gid)
            cap = [c for c in sc.comps(gid) if sc.raw[c][0] in (135, 136, 65)]
            if not cap:
                continue
            c = sc.Y(cap[0])
            tid = sc.tf_of(gid)
            M = sc.world(tid)
            vents.append({'name': sc.path(tid), 'pos': three(M[:3, 3]), 'radius': float(c['m_Radius']), 'height': float(c.get('m_Height', 0)),
                          'dir': int(c.get('m_Direction', 1)), 'trigger': bool(c['m_IsTrigger']), 'scale': rnd([float(np.linalg.norm(M[:3, 0])), float(np.linalg.norm(M[:3, 1])), float(np.linalg.norm(M[:3, 2]))], 3),
                          'active': bool(sc.tree_active(tid) and c['m_Enabled'])})
    vents.sort(key=lambda v: int(v['name'].split('/')[-2]))
    return spawners, manager, route, vents


# ---------------------------------------------------------------- NavMesh DS_Large -> bitmap 1 m cục bộ
def navmesh_ds(box):
    txt = io.open(os.path.join(ASSETS, 'NavMeshData', 'NavMesh-DS_LargeNavMeshSurface.asset'), encoding='utf-8').read()
    tiles = [bytes.fromhex(h) for h in re.findall(r'm_MeshData: ([0-9a-f]+)', txt)]
    polys_all = []
    for b in tiles:
        magic, ver, tx, ty, layer, P, V = struct.unpack_from('<7i', b, 0)
        assert magic == 0x444E4156 and ver == 16
        verts = np.frombuffer(b, '<f4', V * 3, 72).reshape(V, 3)
        base = 72 + 12 * V
        for i in range(P):
            u = struct.unpack_from('<6H6HIBB2x', b, base + 32 * i)
            n = u[13]
            polys_all.append([(float(verts[j][0]), -float(verts[j][2])) for j in u[:n]])
    xs = [p[0] for poly in polys_all for p in poly]
    zs = [p[1] for poly in polys_all for p in poly]
    x0, x1, z0, z1 = int(np.floor(min(xs))) - 1, int(np.ceil(max(xs))) + 1, int(np.floor(min(zs))) - 1, int(np.ceil(max(zs))) + 1
    W, H = x1 - x0, z1 - z0
    im = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(im)
    for poly in polys_all:
        dr.polygon([(x - x0 - 0.5, z - z0 - 0.5) for x, z in poly], fill=255)
    m = np.array(im) > 127
    # DS_Large phủ cả thế giới (4002 x 4002 ô): chỉ giữ hộp quanh Devil's Spine (box = x0, x1, z0, z1 theo three.js), mẹ không rời khỏi đó
    bx0, bx1, bz0, bz1 = box
    cx0, cx1, cz0, cz1 = max(bx0 - x0, 0), min(bx1 - x0, W), max(bz0 - z0, 0), min(bz1 - z0, H)
    m = m[cz0:cz1, cx0:cx1]
    x0, z0, W, H = x0 + cx0, z0 + cz0, cx1 - cx0, cz1 - cz0
    os.makedirs(OUT_ART, exist_ok=True)
    Image.fromarray((m * 255).astype(np.uint8), 'L').save(os.path.join(OUT_ART, 'navmask-ds.png'), optimize=True)   # 255 = đi được; hàng 0 = z three nhỏ nhất
    return {'x0': x0, 'z0': z0, 'cols': W, 'rows': H, 'res': 1.0, 'png': 'art/piranha/navmask-ds.png', 'tiles': len(tiles), 'polys': len(polys_all), 'cells': int(m.sum())}


# ---------------------------------------------------------------- mesh có xương (màu đỉnh không bắt buộc)
def read_skinned_mesh(path):
    d = yaml_asset(path)
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
        raise SystemExit('định dạng kênh %d chưa hỗ trợ (kênh %d)' % (fmt, i))
    pos, nrm, uv, wts, idx4 = chan(0), chan(1), chan(4), chan(12), chan(13)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)
    tris = []
    for sm in d['m_SubMeshes']:
        first = sm['firstByte'] // (2 if d.get('m_IndexFormat', 0) == 0 else 4)
        tris.append(idx[first: first + sm['indexCount']] + sm.get('baseVertex', 0))
    tri = np.concatenate(tris).reshape(-1, 3)[:, [0, 2, 1]]
    pos[:, 2] *= -1
    nrm = nrm[:, :3].copy()
    nrm[:, 2] *= -1
    S = np.diag([1.0, 1.0, -1.0, 1.0])
    bind = []
    for b in d['m_BindPose']:
        M = np.array([[b['e%d%d' % (r, c)] for c in range(4)] for r in range(4)], dtype=np.float64)
        M = S @ M @ S
        bind.append(rnd(M.T.reshape(-1).tolist(), 5))
    # các xương đỉnh có trọng số nhỏ: giữ 4 kênh như Unity
    return {'pos': rnd(pos.reshape(-1).tolist(), 3), 'uv': rnd(uv[:, :2].reshape(-1).tolist(), 3),
            'index': tri.reshape(-1).tolist(), 'skinIndex': idx4.reshape(-1).tolist(), 'skinWeight': np.rint(wts * 100).astype(int).reshape(-1).tolist()}, bind, n   # trọng số lượng tử 1/100 (JS chia 100 rồi chuẩn hoá)


def clip_curves(path, root_name):
    doc = yaml_asset(path)
    out = {}

    def add(lst, kind):
        for c in lst:
            keys = []
            for k in c['curve']['m_Curve']:
                if kind == 'q':
                    v, i, o = conv_q(vec(k['value'], 'xyzw')), conv_q(vec(k['inSlope'], 'xyzw')), conv_q(vec(k['outSlope'], 'xyzw'))
                elif kind == 'p':
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                else:
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                keys.append(rnd([float(k['time'])] + v, 4) + rnd(i + o, 3))
            out.setdefault(c['path'], {})[kind] = keys
    add(doc['m_RotationCurves'], 'q')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    floats = {}
    for c in doc['m_FloatCurves']:
        floats[c['path'] + '#' + c['attribute']] = [[round(float(k['time']), 5), float(k['value'])] for k in c['curve']['m_Curve']]
    st = doc['m_AnimationClipSettings']
    return {'len': float(st['m_StopTime']), 'loop': bool(st['m_LoopTime']), 'events': [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']],
            'curves': out, 'floats': floats}


def clip_by_guid(guid):
    return guid_path('AnimationClip', guid)


def controller(name):
    """Trạng thái + chuyển tiếp thật từ tệp (không gõ tay)."""
    ctl = load_doc(os.path.join(ASSETS, 'AnimatorController', name + '.controller'))
    st = {i: o[1] for i, o in ctl.items() if o[0] == 1102}
    names = {i: v['m_Name'] for i, v in st.items()}
    out = {'states': {}, 'trans': []}
    for i, (k, v) in ctl.items():
        if k == 1102:
            out['states'][v['m_Name']] = {'motion': v['m_Motion']['guid'] if v['m_Motion']['fileID'] else None}
            for t in v['m_Transitions']:
                tv = ctl[t['fileID']][1]
                out['trans'].append({'from': v['m_Name'], 'to': names.get(tv['m_DstState']['fileID']), 'exit': bool(tv['m_HasExitTime']), 'exitTime': float(tv['m_ExitTime']),
                                     'dur': float(tv['m_TransitionDuration']), 'fixed': bool(tv['m_HasFixedDuration']), 'cond': [c['m_ConditionEvent'] for c in tv['m_Conditions']]})
        if k == 1107:
            for t in v['m_AnyStateTransitions']:
                tv = ctl[t['fileID']][1]
                out['trans'].append({'from': '*', 'to': names.get(tv['m_DstState']['fileID']), 'exit': bool(tv['m_HasExitTime']), 'exitTime': float(tv['m_ExitTime']),
                                     'dur': float(tv['m_TransitionDuration']), 'fixed': bool(tv['m_HasFixedDuration']), 'cond': [c['m_ConditionEvent'] for c in tv['m_Conditions']]})
    return out


def save_tex(src, name, size, gray=False):
    im = Image.open(src)
    im = im.convert('RGB')
    s = size / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=80, method=6)
    return 'art/piranha/' + name + '.webp', os.path.getsize(p)


def audio_name(guid):
    for dp, dn, fn in os.walk(os.path.join(ASSETS, 'Audio')):
        for f in fn:
            if f.endswith('.meta'):
                with io.open(os.path.join(dp, f), encoding='utf-8') as fh:
                    if 'guid: ' + guid in fh.read(300):
                        return f[:-9]       # bỏ '.ogg.meta'
    raise SystemExit('không thấy AudioClip guid ' + guid)


def encode_audio(name, loop):
    """mp3 mono 64 kb/s như PROF['sfx'] của tools/audio.py (vòng lặp: mono 48 kb/s, cắt 15 s)."""
    src = os.path.join(OGG_DIR, name.replace(' ', '_').replace("'", '_') + '.ogg')
    if not os.path.exists(src):
        cands = glob.glob(os.path.join(OGG_DIR, '*.ogg'))
        key = re.sub(r'[^a-z0-9]', '', name.lower())
        src = next(c for c in cands if re.sub(r'[^a-z0-9]', '', os.path.basename(c)[:-4].lower()) == key)
    os.makedirs(OUT_AUDIO, exist_ok=True)
    dst = os.path.join(OUT_AUDIO, re.sub(r'[^A-Za-z0-9_.-]', '_', name.replace(' ', '_')) + '.mp3')
    ff = shutil.which('ffmpeg')
    args = [ff, '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-b:a', '48k' if loop else '64k']
    if loop:
        args += ['-t', '15']
    subprocess.check_call(args + [dst])
    dur = float(subprocess.check_output([shutil.which('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).decode().strip())
    return 'art/piranha/audio/' + os.path.basename(dst), round(dur, 2), os.path.getsize(dst)


# ---------------------------------------------------------------- prefab: xương + mesh + clip
def prefab_model(prefab, anim_go_name, clip_defs, tex_key, tex_guids):
    objs = load_doc(os.path.join(ASSETS, 'GameObject', prefab + '.prefab'))
    go_name = {i: str(o[1]['m_Name']) for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {o['m_GameObject']['fileID']: i for i, o in tf.items()}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    smr = [o[1] for o in objs.values() if o[0] == 137][0]
    skin_tf = tf_of_go[smr['m_GameObject']['fileID']]
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    mesh_path = guid_path('Mesh', smr['m_Mesh']['guid'])
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    anim_tf = next(tf_of_go[g] for g, n in go_name.items() if n == anim_go_name and g in tf_of_go and any(o[0] == 95 and o[1]['m_GameObject']['fileID'] == g for o in objs.values()))
    keep = set(bone_ids) | {skin_tf, anim_tf}
    extra = {}
    for key, fn in clip_defs:
        extra[key] = clip_curves(fn, anim_go_name)
    # xương / nút được clip trỏ tới (kể cả DamageCollider)
    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    by_path = {}
    for t in tf:
        # chỉ nút nằm dưới anim_tf
        f, ok = t, False
        while f:
            if f == anim_tf:
                ok = True
                break
            f = tf[f]['m_Father']['fileID']
        if ok:
            by_path[tpath(t)] = t
    for key, c in extra.items():
        for pth in list(c['curves']) + [k.split('#')[0] for k in c['floats']]:
            if pth:
                assert pth in by_path, 'đường cong %s/%s không khớp nút nào' % (key, pth)
                keep.add(by_path[pth])
    for nm in ('DamageCollider', 'BumpCollider', 'LittleMonsterAnchor', 'DSMotherMonsterSpawner'):
        for g, n in go_name.items():
            if n == nm and g in tf_of_go:
                keep.add(tf_of_go[g])
    for t in list(keep):
        f = tf[t]['m_Father']['fileID']
        while f:
            keep.add(f)
            f = tf[f]['m_Father']['fileID']
    order = []

    def walk(t):
        if t in keep:
            order.append(t)
            for c in tf[t]['m_Children']:
                walk(c['fileID'])
    walk(root_tf)
    index = {t: i for i, t in enumerate(order)}
    bones = []
    for t in order:
        T = tf[t]
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        bones.append({'name': go_name[go_of_tf[t]], 'parent': index.get(T['m_Father']['fileID'], -1), 'p': rnd(p, 5),
                      'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 5), 's': rnd(vec(T['m_LocalScale']), 5)})
    mesh, bind, nv = read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids), 'số bindpose %d khác số xương %d' % (len(bind), len(bone_ids))
    clips = {}
    for key, c in extra.items():
        cur = {}
        for pth, d in c['curves'].items():
            for kind, keys in d.items():
                if kind == 's':   # đường cong tỉ lệ hằng bằng tỉ lệ nghỉ của xương: bỏ để nhẹ dữ liệu
                    rest = bones[index[by_path[pth]] if pth else index[anim_tf]]['s']
                    if all(abs(k[1 + j] - rest[j]) < 1e-3 for k in keys for j in range(3)) and all(abs(t) < 1e-6 for k in keys for t in k[4:]):
                        continue
                cur.setdefault(str(index[by_path[pth]] if pth else index[anim_tf]), {})[kind] = keys
        fl = {}
        for k, v in c['floats'].items():
            pth, attr = k.split('#')
            fl[str(index[by_path[pth]])] = {'attr': attr, 'keys': v}
        clips[key] = {'len': c['len'], 'loop': c['loop'], 'events': c['events'], 'curves': cur, 'floats': fl}
    # collider trong prefab
    cols = []
    for o in objs.values():
        if o[0] in (135, 136):
            v = o[1]
            cols.append({'node': go_name[v['m_GameObject']['fileID']], 'shape': 'sphere' if o[0] == 135 else 'capsule', 'radius': float(v['m_Radius']),
                         'height': float(v.get('m_Height', 0)), 'dir': int(v.get('m_Direction', 1)), 'trigger': bool(v['m_IsTrigger']),
                         'center': rnd([float(v['m_Center']['x']), float(v['m_Center']['y']), -float(v['m_Center']['z'])], 4), 'tag': next(o2[1]['m_TagString'] for i2, o2 in objs.items() if i2 == v['m_GameObject']['fileID'])})
    mat = yaml_asset(guid_path('Material', smr['m_Materials'][0]['guid']))['m_SavedProperties']
    tex, size = {}, 0
    for nm, g in tex_guids.items():
        tex[nm], n = save_tex(guid_path('Texture2D', g), tex_key + '_' + nm, TEX_MAX[tex_key])
        size += n
    data = {'bones': bones, 'skinNode': index[skin_tf], 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': mesh, 'clips': clips,
            'animNode': index[anim_tf], 'colliders': cols, 'tex': tex, 'floats': {k: float(v) for k, v in mat['m_Floats'].items() if not k.startswith('BOOLEAN')}}
    return objs, data, nv, size, index, go_name, tf_of_go


def mono_of(objs, key):
    return [o[1] for o in objs.values() if o[0] == 114 and key in o[1]][0]


def main():
    spawners, manager, route, vents = scene_data()
    pts = [p for s_ in spawners for p in (s_['pos'],)] + [v['pos'] for v in vents] + route + [manager['pos'], manager['anchor']]
    M = 120   # [ĐỀ XUẤT] lề quanh vùng quái: mẹ tuần tra theo 15 điểm, đuổi tối đa deaggroRange 250 quanh neo, spawner cá cách 80 m
    box = (int(min(p[0] for p in pts)) - M, int(max(p[0] for p in pts)) + M, int(min(p[2] for p in pts)) - M, int(max(p[2] for p in pts)) + M)
    nav = navmesh_ds(box)
    cfgd = yaml_asset(os.path.join(ASSETS, 'MonoBehaviour', 'GameConfigDataProd.asset'))
    n_null = int(cfgd['numAttachedMonstersToNullifyEngines'])

    # ---- cá nhỏ
    lt_objs = load_doc(os.path.join(ASSETS, 'GameObject', 'DSLittleMonster.prefab'))
    lc = controller('DevilsSpineLittleMonsterAnimator')
    sw = controller('DSMonsterSwimAnimator')
    swim_guid = sw['states']['Swim']['motion']
    _, little, nv_l, tx_l, idx_l, _, _ = prefab_model(
        'DSLittleMonster', 'DSMonster', [('swim', guid_path('AnimationClip', swim_guid))], 'little', {'albedo': 'd5a1e55baaa7dab4ba3cfedfc94eb1ee', 'emissive': '2be076e29d410b240b4ad27aea508a59'})
    lm = mono_of(lt_objs, 'latchedCallDelayMin')
    rb = [o[1] for o in lt_objs.values() if o[0] == 54][0]
    sph = [o[1] for o in lt_objs.values() if o[0] == 135][0]
    # clip gốc của animator gốc (Spawn / Despawn / Idle): chỉ nút Model (vị trí, tỉ lệ)
    root_clips = {}
    for nm in ('Spawn', 'Despawn', 'Idle'):
        c = clip_curves(guid_path('AnimationClip', lc['states'][nm]['motion']), 'DSLittleMonster')
        root_clips[nm.lower()] = {'len': c['len'], 'loop': c['loop'], 'events': c['events'], 'model': c['curves']['Model']}
    little.update({
        'rb': {'mass': float(rb['m_Mass']), 'drag': float(rb['m_Drag']), 'constraints': int(rb['m_Constraints'])},
        'sphere': {'radius': float(sph['m_Radius']), 'center': rnd(vec(sph['m_Center']), 4)},
        'latchedCallDelay': [float(lm['latchedCallDelayMin']), float(lm['latchedCallDelayMax'])],
        'viewMask': int(lm['layerMask']['m_Bits']), 'rootClips': root_clips, 'controller': lc,
        'audio': {'latched': [a['guid'] for a in lm['latchedCallAudioClips']], 'detect': lm['detectAudioClip']['guid'], 'scream': lm['screamAudioClip']['guid']}})
    little['controller'] = {'trans': lc['trans']}

    # ---- mẹ
    bg_objs = load_doc(os.path.join(ASSETS, 'GameObject', 'DSBigMonster.prefab'))
    bc = controller('DevilsSpineBigMonsterAnimator')
    idle_g, att_g = bc['states']['Idle']['motion'], bc['states']['DS_Attack']['motion']
    swim_idle = [fn for fn in glob.glob(os.path.join(ASSETS, 'AnimationClip', 'DS_Mother_SwimIdle.anim'))][0]
    # clip Idle của controller (d8fc4fe8...) -> tên tệp
    idle_path, att_path = guid_path('AnimationClip', idle_g), guid_path('AnimationClip', att_g)
    _, mother, nv_m, tx_m, idx_m, go_name_m, tf_of_go_m = prefab_model(
        'DSBigMonster', 'DS_MotherMonster', [('idle', idle_path), ('attack', att_path)], 'mother', {'albedo': '0137cfa6c00c586448f3faa597693d32', 'emissive': '8011d07f9f6182f4fb57d3a192794240'})
    bm = mono_of(bg_objs, 'chaseSpeed')
    nv = [o[1] for o in bg_objs.values() if o[0] == 195][0]
    spw = [o[1] for o in bg_objs.values() if o[0] == 114 and 'spawnConfigs' in o[1]][0]
    pf = [o[1] for o in bg_objs.values() if o[0] == 114 and 'waypointDistanceThreshold' in o[1]][0]
    tfw = [o[1] for o in bg_objs.values() if o[0] == 114 and 'pathLockThreshold' in o[1]][0]
    pm = [o[1] for o in bg_objs.values() if o[0] == 114 and 'updateFrequencySec' in o[1]][0]
    mother.update({
        'patrolSpeed': float(bm['patrolSpeed']), 'chaseSpeed': float(bm['chaseSpeed']), 'playerDetectionThreshold': float(bm['playerDetectionThreshold']),
        'littleMonsterSuppressionDuration': float(bm['littleMonsterSuppressionDuration']), 'attackDelay': float(bm['attackDelay']),
        'attackDistanceThreshold': float(bm['attackDistanceThreshold']), 'instaKill': bool(bm['instaKill']), 'damagePoints': int(bm['damagePoints']),
        'timeBetweenResponseCalls': float(bm['timeBetweenResponseCalls']), 'timeBetweenIdleCalls': [float(bm['timeBetweenIdleCallsMin']), float(bm['timeBetweenIdleCallsMax'])],
        'audioPitch': [float(bm['audioClipPitchMin']), float(bm['audioClipPitchMax'])],
        'agent': {'radius': float(nv['m_Radius']), 'speed': float(nv['m_Speed']), 'acceleration': float(nv['m_Acceleration']), 'angularSpeed': float(nv['m_AngularSpeed']),
                  'stoppingDistance': float(nv['m_StoppingDistance']), 'autoBraking': bool(nv['m_AutoBraking'])},
        'pathFollow': {'waypointDistanceThreshold': float(pf['waypointDistanceThreshold']), 'loop': bool(pf['loop'])},
        'targetFollow': {'arriveThreshold': float(tfw['arriveThreshold']), 'refreshSec': float(tfw['timeBetweenPathRefreshesSec']), 'overshoot': float(tfw['overshootDistance']),
                         'pathLockThreshold': float(tfw['pathLockThreshold'])},
        'proximityUpdateSec': float(pm['updateFrequencySec']),
        'spawner': {'cfgs': [spawn_cfg(c) for c in spw['spawnConfigs']], 'canLosePlayerBySight': bool(spw['canLosePlayerBySight']), 'attachDistance': float(spw['attachDistanceThreshold']),
                    'timeBetweenSpawns': float(spw['timeBetweenSpawnsSec']), 'timeBetweenChecks': float(spw['timeBetweenSpawnChecksSec']), 'spawnDistance': float(spw['spawnDistance']),
                    'despawnDistance': float(spw['despawnDistance']), 'maxRange': float(spw['maxRange']), 'displacedDespawnDistance': float(spw['displacedDespawnDistance'])},
        'controller': {'trans': bc['trans']},
        'audio': {'idle': bm['idleCallAudioClip']['guid'], 'response': bm['responseCallAudioClip']['guid'], 'attack': bm['attackAudioClip']['guid']}})
    # neo nhà của bộ spawner mẹ = LittleMonsterAnchor cục bộ so với gốc prefab
    anchor_go = next(g for g, n in go_name_m.items() if n == 'LittleMonsterAnchor')
    anc = [o[1] for o in bg_objs.values() if o[0] == 4 and o[1]['m_GameObject']['fileID'] == anchor_go][0]
    mother['spawner']['homeLocal'] = rnd([float(anc['m_LocalPosition']['x']), float(anc['m_LocalPosition']['y']), -float(anc['m_LocalPosition']['z'])], 4)
    # mẹ ở lại gốc prefab; vị trí nút gốc nằm trong bones[0]

    # ---- âm thanh: 9 clip của 2 prefab + vòng lặp "Ambient Spawn Spot" (ProximityAudioSource của mẹ)
    prox = [o[1] for o in bg_objs.values() if o[0] == 82 and o[1]['Loop']][0]
    clips = {
        'latched1': little['audio']['latched'][2], 'latched2': little['audio']['latched'][1], 'latched3': little['audio']['latched'][0],
        'detect': little['audio']['detect'], 'scream': little['audio']['scream'], 'idle': mother['audio']['idle'], 'response': mother['audio']['response'],
        'attack': mother['audio']['attack'], 'proximity': prox['m_audioClip']['guid']}
    audio, DRA, asz = {}, {}, 0
    for key, g in clips.items():
        nm = audio_name(g)
        loop = key == 'proximity'
        src, dur, sz = encode_audio(nm, loop)
        asz += sz
        k = 'ds.' + key
        DRA[k] = {'src': src, 'loop': loop, 'vol': 0.8, 'dur': dur, 'orig': "Assets/Audio/SFX/Monster/Devil's Spine/%s.wav" % nm}
        audio[key] = k
    mother['audio'] = {'keys': audio, 'proximity': {'min': float(prox['MinDistance']), 'max': float(prox['MaxDistance'])}}
    mother['audio']['call'] = None
    cs = [o[1] for o in bg_objs.values() if o[0] == 82 and not o[1]['Loop']]
    mother['audio']['callRange'] = {'min': float(cs[0]['MinDistance']), 'max': float(cs[0]['MaxDistance'])} if cs else None
    little['audio'] = {'keys': audio, 'range': {'min': 5.0, 'max': 50.0}}   # AudioSource của cá: MinDistance 5, MaxDistance 50 (prefab)

    data = {
        'src': 'Scenes/Game.unity (DevilsSpine/Monsters/MonsterSpawners/*, DevilsSpineMonsterManager, ThermalVents) + GameObject/DSLittleMonster|DSBigMonster.prefab',
        'cfg': {'numAttachedMonstersToNullifyEngines': n_null, 'fixedDt': 0.02, 'attachPointY': -0.3, 'colliderCenterY': 0.3},
        'spawners': spawners, 'vents': vents, 'manager': manager, 'route': route, 'nav': nav, 'little': little, 'mother': mother,
        'materials': {'little': {'emissionDistance': None, 'emissionStrength': None}, 'mother': {'emissionDistance': float(mother['floats'].get('_EmissionEffectiveDistance', 35))}},
    }
    js = '// Generated by games/dredge/tools/piranha.py from Game.unity + DSLittleMonster/DSBigMonster prefabs. Do not edit.\nwindow.DR_PIRANHA = ' + \
        json.dumps(data, separators=(',', ':')) + ';\nif (window.DR_AUDIO) Object.assign(window.DR_AUDIO, ' + json.dumps(DRA, separators=(',', ':')) + ');\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('spawners %d (cá tối đa %d)  vents %d  route %d  nav %dx%d %d ô' % (len(spawners), sum(len(s['cfgs']) for s in spawners), len(vents), len(route), nav['cols'], nav['rows'], nav['cells']))
    print('cá nhỏ: %d đỉnh %d xương swim %.2fs;  mẹ: %d đỉnh %d xương idle %.2fs attack %.2fs' % (
        nv_l, len(little['bones']), little['clips']['swim']['len'], nv_m, len(mother['bones']), mother['clips']['idle']['len'], mother['clips']['attack']['len']))
    print('js %d KB  tex %d KB  audio %d KB' % (len(js) // 1024, (tx_l + tx_m) // 1024, asz // 1024))


if __name__ == '__main__':
    main()
