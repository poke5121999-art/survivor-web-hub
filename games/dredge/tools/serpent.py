"""Rắn Gale Cliffs (GCMonster, WORLD-GAPS.md §4 / R1) -> data/serpent.js + art/vfx/serpent/*.webp + audio/monsters/*.mp3 (5 clip còn thiếu).

Chạy:  python -I games/dredge/tools/serpent.py          (~25 s; đọc Game.unity 168 MB một lần)
Đọc:   GameObject/GaleCliffMonster.prefab (GCMonster, SimplePathFollow, TargetFollow, TargetMove, VariablePlayerDamager, NavMeshAgent, DepthMonitor,
       PlayerProximityMonitor, FieldOfView ×3, CapsuleCollider PlayerDetector, AudioSource ×5, VFXVolumeFader, TransformFollower ×9, SkinnedMeshRenderer,
       cây Transform), MonoBehaviour/GaleCliffsMonster.asset (MonsterData), Mesh/GaleCliffMonster.asset, AnimationClip/GaleCliffMonster_{EyeClosedSwim,
       Swim,Attack}.anim + GaleCliffMonsterDepth_{Banished,Submerged,Emerged}Idle.anim, AnimatorController/GaleCliffMonster{,Depth}Animator.controller,
       Material/GaleCliffMonster_Mat.mat (Monster_Shader_0), NavMeshData/NavMesh-GC_EelNavMeshSurface.asset (agent -334000983),
       Scenes/Game.unity (GaleCliffsMonsterManager: GCMonsterManager, GCMonsterRouteReference [Odin: exitRoutes], 11 GCMonsterSpawnTrigger, 11 GCMonsterHole,
       25 FallingRocks, EntityPath A..J).
Ra:    window.DR_SERPENT = { data, monster, damager, agent, follow, move, eyes[], depthMonitor, proximity, collider, fader, audio, manager{routes, exitRoutes,
       triggers, holes, rocks, minTimeBetweenRockFallsSec}, nav{x0,z0,w,h,bits}, nodes[], skin{...}, followers[], clips{...}, animator{...}, mat, particles }
Toạ độ: như tools/angler.py (Unity trái tay -> three.js phải tay bằng đổi dấu z). Các hộp trigger xuất thành trục (ax, az) trong three.js. NavMesh: tile Detour
       'DNAV' của agent GC_Eel, toạ độ tile là CỤC BỘ so với m_Position của NavMeshData (khác Generic/Ray có m_Position = 0) -> thế giới = tile + m_Position.
Bẫy:   UV của mesh nằm ngoài [0,1] (texture lặp) nên lượng tử theo uvMin/uvMax; clip Depth có đường cong vị trí với path rỗng (nút của Animator, PivotTarget);
       TransformFollower lưu offset theo MÉT THẾ GIỚI (đã gồm tỉ lệ 0,7 của gốc), mô phỏng chạy trong không gian Unity (z đảo) ở serpent.js.
Rerunnable: cùng đầu vào ra cùng đầu ra (từng byte); thư mục audio/ chỉ ghi 5 mp3 của rắn, không đụng tệp khác.
"""
import base64, io, os, re, json, struct, subprocess, sys, shutil
import numpy as np
import yaml
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import angler as A   # noqa: E402  (dùng lại bộ đọc YAML/Scene/guid của đơn vị U1; không chạy main)
import odin           # noqa: E402

GAME = os.path.dirname(HERE)
ASSETS = A.ASSETS
OUT_JS = os.path.join(GAME, 'data', 'serpent.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'serpent')
OUT_AUDIO = os.path.join(GAME, 'audio', 'monsters')
OGG = r'D:\dredge-ref\audio\gameaudio'
rnd, vec, conv_q, b64 = A.rnd, A.vec, A.conv_q, A.b64
yaml_body, load_doc, guid_path = A.yaml_body, A.load_doc, A.guid_path

SPINE_FOLLOW_GUID = '9b125eb6e255ba06df2d0726d7535f8d'      # TransformFollower.cs
SCRIPTS = {'mgr': '87c9500482f62168e129f0033bcbd5bd', 'route': '887f7567efb56cc00e204183f7be60ef', 'trig': 'c96ea41688ed5c99bfb372e30cd1ff21',
           'hole': '3eaadefd44c0092eab8386d46c401b9d', 'rocks': 'ab07e0bf810087fd0acbcb408cd3456a', 'path': 'a6367fe9524a4729981081102ec4ef83'}
NAV_PAD = 8


# ---------------------------------------------------------------- mesh (UV có thể ngoài [0,1])
def read_mesh(path):
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
    pos, uv = chan(0), chan(4)
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
    uv = uv[:, :2]
    ulo, uhi = uv.min(0), uv.max(0)
    uq = np.round((uv - ulo) / np.maximum(uhi - ulo, 1e-9) * 65535).astype(np.uint16)
    assert n < 65536
    out = {'n': n, 'min': rnd(lo.tolist(), 4), 'max': rnd(hi.tolist(), 4), 'pos': b64(q), 'uvMin': rnd(ulo.tolist(), 5), 'uvMax': rnd(uhi.tolist(), 5),
           'uv': b64(uq), 'index': b64(tri.reshape(-1).astype(np.uint16))}
    wts, idx4 = chan(12), chan(13)
    assert idx4.max() < 256
    w8 = np.round(wts * 255).astype(np.int64)
    w8[:, 0] += 255 - w8.sum(1)
    out['skinIndex'] = b64(idx4.astype(np.uint8))
    out['skinWeight'] = b64(w8.astype(np.uint8))
    S = np.diag([1.0, 1.0, -1.0, 1.0])
    bind = []
    for b in d['m_BindPose']:
        M = np.array([[b['e%d%d' % (r, c)] for c in range(4)] for r in range(4)], dtype=np.float64)
        bind.append(rnd((S @ M @ S).T.reshape(-1).tolist(), 6))
    return out, bind, len(tri)


# ---------------------------------------------------------------- clip / animator
def clip(path, node_of_path):
    doc = yaml_body(path)
    curves = []

    def add(lst, kind):
        for c in lst:
            p = c['path'] if c['path'] is not None else ''
            assert p in node_of_path, 'đường cong %r không khớp nút nào' % p
            keys = []
            for k in c['curve']['m_Curve']:
                comp = 'xyzw' if kind == 'q' else 'xyz'
                v, i, o = A.vec(k['value'], comp), A.vec(k['inSlope'], comp), A.vec(k['outSlope'], comp)
                if kind == 'q':
                    v, i, o = conv_q(v), conv_q(i), conv_q(o)
                elif kind == 'p':
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                keys.append(rnd([float(k['time'])] + v + i + o, 5))
            curves.append({'node': node_of_path[p], 'kind': kind, 'keys': keys})
    add(doc['m_RotationCurves'], 'q')
    assert not doc['m_EulerCurves']
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    assert not doc['m_FloatCurves'] and not doc['m_CompressedRotationCurves']
    events = [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']]
    st = doc['m_AnimationClipSettings']
    return {'name': doc['m_Name'], 'len': round(float(st['m_StopTime']), 5), 'loop': bool(st['m_LoopTime']), 'events': events, 'curves': curves}


def controller(path):
    """Trạng thái {tên: {speed, clip guid}}, chuyển trạng thái (điều kiện kèm chế độ 1 If / 2 IfNot, thời lượng, exitTime) và cây trộn 1D nếu có."""
    objs = load_doc(path)
    states, trees, trans, params = {}, {}, [], {}
    default = None
    for i, (ty, b, _) in objs.items():
        if ty == 1102:
            m = b['m_Motion']['fileID']
            states[i] = {'name': b['m_Name'], 'speed': float(b['m_Speed']), 'clip': b['m_Motion'].get('guid'), 'tree': m if m in objs and objs[m][0] == 206 else None}
        if ty == 1107:
            default = b['m_DefaultState']['fileID']
        if ty == 91:
            params = {p['m_Name']: p['m_Type'] for p in b['m_AnimatorParameters']}
    for i, (ty, b, _) in objs.items():
        if ty == 1102:
            for t in b['m_Transitions']:
                tb = objs[t['fileID']][1]
                trans.append({'from': states[i]['name'], 'to': states[tb['m_DstState']['fileID']]['name'],
                              'when': [[c['m_ConditionEvent'], int(c['m_ConditionMode'])] for c in tb['m_Conditions']],
                              'duration': round(float(tb['m_TransitionDuration']), 5), 'fixed': bool(tb['m_HasFixedDuration']),
                              'exitTime': round(float(tb['m_ExitTime']), 5) if tb['m_HasExitTime'] else None})
    trans.sort(key=lambda t: (t['from'], t['to']))
    for s in states.values():
        if s['tree']:
            tb = objs[s['tree']][1]
            assert int(tb['m_BlendType']) == 0
            s['tree'] = {'param': tb['m_BlendParameter'], 'children': [{'t': float(c['m_Threshold']), 'clip': c['m_Motion']['guid']} for c in tb['m_Childs']]}
    return states, states[default]['name'], trans, params


# ---------------------------------------------------------------- tệp (mp3, texture)
def save_tex(src, name, maxsz):
    im = Image.open(src).convert('RGB')
    s = maxsz / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=80, method=6)
    return 'art/vfx/serpent/' + name + '.webp', os.path.getsize(p)


def safe(n):
    return re.sub(r'[^A-Za-z0-9._-]+', '_', n).strip('_')


def encode_mp3(name):
    """Gale Cliffs Monster - X.ogg (bản bóc của tools/audio.py) -> audio/monsters/<safe>.mp3, cùng thiết lập mono 64k của nhóm sfx; trả [đường dẫn, giây]."""
    ff = shutil.which('ffmpeg')
    if not ff:
        raise SystemExit('ffmpeg không có trên PATH')
    stem = safe(name)
    src = os.path.join(OGG, stem + '.ogg')
    if not os.path.exists(src):
        raise SystemExit('thiếu ' + src + ' (chạy tools/audio.py trước)')
    os.makedirs(OUT_AUDIO, exist_ok=True)
    dst = os.path.join(OUT_AUDIO, stem + '.mp3')
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', src, '-c:a', 'libmp3lame', '-ac', '1', '-b:a', '64k', '-map_metadata', '-1', '-fflags', '+bitexact', dst], check=True)
    out = subprocess.run([ff, '-i', dst, '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = re.findall(r'time=(\d+):(\d+):([\d.]+)', out)[-1]
    return 'audio/monsters/' + stem + '.mp3', round(int(m[0]) * 3600 + int(m[1]) * 60 + float(m[2]), 2)


# ---------------------------------------------------------------- navmesh GC_Eel
def navmask():
    import navmesh as N
    fn = os.path.join(N.NAVDIR, 'NavMesh-GC_EelNavMeshSurface.asset')
    txt = io.open(fn, encoding='utf-8').read()
    m = re.search(r'm_Position: \{x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+)\}', txt)
    off = [float(m.group(i)) for i in (1, 2, 3)]
    assert re.search(r'm_AgentTypeID: -334000983', txt)
    polys, allx, allz = [], [], []
    for b in [bytes.fromhex(h) for h in re.findall(r'm_MeshData: ([0-9a-f]+)', txt)]:
        verts, ps = N.tile_polys(b)
        for idx, fl, ar in ps:
            pts = [(float(verts[i][0]) + off[0], -(float(verts[i][2]) + off[2])) for i in idx]   # three.js (x, z)
            polys.append(pts)
            allx += [p[0] for p in pts]
            allz += [p[1] for p in pts]
    x0, z0 = int(np.floor(min(allx))) - NAV_PAD, int(np.floor(min(allz))) - NAV_PAD
    w, h = int(np.ceil(max(allx))) + NAV_PAD - x0, int(np.ceil(max(allz))) + NAV_PAD - z0
    im = Image.new('L', (w, h), 0)
    dr = ImageDraw.Draw(im)
    for pts in polys:
        dr.polygon([(x - x0 - 0.5, z - z0 - 0.5) for x, z in pts], fill=255)
    g = np.array(im) > 0
    return {'x0': x0, 'z0': z0, 'w': w, 'h': h, 'y': round(off[1] + 0.025, 4), 'bits': base64.b64encode(np.packbits(g.reshape(-1)).tobytes()).decode('ascii'),
            'src': 'NavMeshData/NavMesh-GC_EelNavMeshSurface.asset (agent -334000983, %d đa giác, vị trí NavMeshData %s)' % (len(polys), off)}, int(g.sum())


# ---------------------------------------------------------------- cảnh
def scene_part():
    sc = A.Scene(os.path.join(ASSETS, 'Scenes', 'Game.unity'))
    found = {k: [] for k in SCRIPTS}
    for fid, (ty, a, b) in sc.at.items():
        if ty != 114:
            continue
        m = re.search(r'm_Script: \{fileID: 11500000, guid: ([0-9a-f]+)', sc.txt[a:b])
        if m:
            for k, g in SCRIPTS.items():
                if m.group(1) == g:
                    found[k].append(fid)
    assert len(found['mgr']) == 1 and len(found['route']) == 1, (len(found['mgr']), len(found['route']))
    tfc = lambda fid: sc.comp(sc.get(fid)['m_GameObject']['fileID'], lambda ty, f: ty == 4)
    gname = lambda fid: str(sc.get(sc.get(fid)['m_GameObject']['fileID'])['m_Name'])
    pt = lambda tf: rnd([float(sc.world(tf)[0, 3]), -float(sc.world(tf)[2, 3])], 3)
    yaw3 = lambda tf: rnd(-float(np.arctan2(sc.world(tf)[0, 2], sc.world(tf)[2, 2])), 5)     # three yaw = −yaw Unity; hướng tiến (−sin θ, −cos θ)
    mg = sc.get(found['mgr'][0])
    md_guid = mg['monsterData']['guid']
    assert os.path.basename(guid_path('MonoBehaviour', md_guid)) == 'GaleCliffsMonster.asset'
    rr = sc.get(found['route'][0])
    od = odin.decode(bytes.fromhex(rr['serializationData']['SerializedBytes']))
    refs = [x['fileID'] for x in rr['serializationData']['ReferencedUnityObjects']]
    exit_routes = [[pt(refs[i['$unity']]) for i in L['$items']] for L in od['exitRoutes']['$items']]
    exit_names = [[sc.name_of_tf(refs[i['$unity']]) for i in L['$items']] for L in od['exitRoutes']['$items']]
    # EntityPath: chỉ các tuyến mà GCMonsterRouteReference.Routes tham chiếu (DSBigMonsterPath là của Devil's Spine)
    path_ids = [x['fileID'] for x in rr['routes']]
    routes, rname = [], {}
    for fid in path_ids:
        e = sc.get(fid)
        rname[fid] = len(routes)
        routes.append({'name': gname(fid), 'pts': [pt(p['fileID']) for p in e['route']], 'yaw0': yaw3(e['route'][0]['fileID'])})
    box = lambda c, W: ([float(np.linalg.norm(W[:3, i])) for i in range(3)], c)

    def obb(fid):
        gid = sc.get(fid)['m_GameObject']['fileID']
        cs = [sc.get(c['component']['fileID']) for c in sc.get(gid)['m_Component'] if sc.at[c['component']['fileID']][0] == 65]   # BoxCollider
        assert len(cs) == 1
        c = cs[0]
        W = sc.world(tfc(fid))
        s = [float(np.linalg.norm(W[:3, i])) for i in range(3)]
        cen = W @ np.array(vec(c['m_Center']) + [1.0])
        sz = vec(c['m_Size'])
        return {'c': rnd([float(cen[0]), -float(cen[2])], 3), 'h': rnd([sz[0] * s[0] / 2, sz[2] * s[2] / 2], 3), 'ax': rnd([float(W[0, 0] / s[0]), -float(W[2, 0] / s[0])], 5),
                'az': rnd([float(W[0, 2] / s[2]), -float(W[2, 2] / s[2])], 5), 'trigger': int(c['m_IsTrigger'])}
    triggers = []
    for fid in sorted(found['trig'], key=gname):
        t = sc.get(fid)
        o = obb(fid)
        assert o['trigger'] == 1
        triggers.append({'name': gname(fid), 'route': rname[t['spawnRoute']['fileID']], 'direction': int(t['direction']), 'box': {k: o[k] for k in ('c', 'h', 'ax', 'az')}})
    holes = []
    for fid in sorted(found['hole'], key=gname):
        t = sc.get(fid)
        o = obb(fid)
        holes.append({'name': gname(fid), 'hole': int(t['linkedHole']), 'island': int(t['linkedIsland']), 'box': {k: o[k] for k in ('c', 'h', 'ax', 'az')}})
    rocks = []
    for r in mg['allFallingRocks']:
        fid = r['fileID']
        t = sc.get(fid)
        rocks.append({'name': gname(fid), 'pos': pt(tfc(fid)), 'hole': int(t['associatedHole']), 'island': int(t['island'])})
    rocks.sort(key=lambda r: (r['island'], r['hole'], r['name']))
    return {'src': 'Scenes/Game.unity: GaleCliffsMonsterManager (GCMonsterManager.cs, GCMonsterRouteReference.cs, GCMonsterSpawnTrigger.cs, GCMonsterHole.cs, FallingRocks.cs)',
            'minTimeBetweenRockFallsSec': float(mg['minTimeBetweenRockFallsSec']), 'routes': routes, 'exitRoutes': exit_routes, 'exitNames': exit_names,
            'triggers': triggers, 'holes': holes, 'rocks': rocks}


# ---------------------------------------------------------------- prefab
def main():
    pre = os.path.join(ASSETS, 'GameObject', 'GaleCliffMonster.prefab')
    objs = load_doc(pre)
    go = {i: o[1] for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {t['m_GameObject']['fileID']: i for i, t in tf.items()}
    name_of_tf = {i: str(go[t['m_GameObject']['fileID']]['m_Name']) for i, t in tf.items()}

    def mb_with(field):
        r = [b for (ty, b, cls) in objs.values() if cls == 'MonoBehaviour' and field in b]
        assert len(r) == 1, field
        return r[0]
    gc = mb_with('attackDistanceThreshold')            # GCMonster.cs
    vpd = mb_with('damagePoints')                      # VariablePlayerDamager.cs
    spf = mb_with('loop')                              # SimplePathFollow.cs
    tfl = mb_with('overshootDistance')                 # TargetFollow.cs
    tmv = [b for (ty, b, cls) in objs.values() if cls == 'MonoBehaviour' and set(b) >= {'navMeshAgent', 'waypointDistanceThreshold'} and 'loop' not in b][0]  # TargetMove.cs
    dmon = mb_with('depthUpdateFrequencySec')
    pmon = mb_with('updateFrequencySec')
    fader = mb_with('maxBlendDistance')
    agent = [b for (ty, b, cls) in objs.values() if cls == 'NavMeshAgent'][0]
    eyes = [b for (ty, b, cls) in objs.values() if cls == 'MonoBehaviour' and 'viewRadius' in b]
    md = yaml_body(os.path.join(ASSETS, 'MonoBehaviour', 'GaleCliffsMonster.asset'))
    capsule = objs[[i for i, (ty, b, c) in objs.items() if ty == 136 and name_of_tf[tf_of_go[b['m_GameObject']['fileID']]] == 'PlayerDetector'][0]][1]
    body = objs[[i for i, (ty, b, c) in objs.items() if ty == 136 and name_of_tf[tf_of_go[b['m_GameObject']['fileID']]] == 'Collider'][0]][1]
    assert not int(capsule['m_IsTrigger']) and int(capsule['m_Direction']) == 2

    # ---- cây nút (bỏ Audio, PostProcessVolume, RockCollider; giữ mắt và BoatDamageFX làm điểm gắn)
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    SKIP = {'Audio', 'PostProcessVolume', 'RockCollider', 'Splash', 'WoodDebris', 'Flash', 'WaterSplash', 'subEmitter'}
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
    # nhiều nút trùng tên "GaleCliffMonster": theo thứ tự cây = [0] gốc, [1] Animator trạng thái (con của PivotTarget), [2] nút mesh (scale 0,01), [3] nút mesh con
    assert [n['name'] for n in nodes[:5]] == ['GaleCliffMonster', 'PivotTarget', 'GaleCliffMonster', 'GaleCliffMonster', 'GaleCliffMonster 1'], [n['name'] for n in nodes[:5]]

    # ---- mesh da (SkinnedMeshRenderer)
    smr = [b for (ty, b, cls) in objs.values() if cls == 'SkinnedMeshRenderer'][0]
    skin_mesh, bind, skin_tris = read_mesh(guid_path('Mesh', smr['m_Mesh']['guid']))
    bones = [index[b['fileID']] for b in smr['m_Bones']]
    assert len(bind) == len(bones)
    skin = {'node': index[tf_of_go[smr['m_GameObject']['fileID']]], 'bones': bones, 'bindPoses': bind, 'mesh': skin_mesh, 'rootBone': index[smr['m_RootBone']['fileID']]}

    # ---- TransformFollower (9 đốt sống)
    followers = []
    for (ty, b, cls) in objs.values():
        if cls == 'MonoBehaviour' and b['m_Script']['guid'] == SPINE_FOLLOW_GUID:
            followers.append({'node': index[tf_of_go[b['m_GameObject']['fileID']]], 'parent': index[b['parent']['fileID']], 'speed': float(b['speed']),
                              'offset': rnd(vec(b['transformOffset']), 6), 'rot': rnd(vec(b['rotationOffset']), 5), 'dist': round(float(b['originalDistance']), 6)})
    followers.sort(key=lambda f: nodes[f['node']]['name'])
    assert [nodes[f['node']]['name'] for f in followers] == ['spine%d_jnt' % i for i in range(1, 10)]

    # ---- hoạt ảnh: Animator trên nút GaleCliffMonster (StateAnimator) + Animator trên PivotTarget (cây trộn Proximity)
    def tpath(t, top):
        p = []
        while t and t != top:
            p.append(name_of_tf[t])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    anims, clips = {}, {}
    for (ty, a, cls) in [(o[0], o[1], o[2]) for o in objs.values() if o[2] == 'Animator']:
        top = tf_of_go[a['m_GameObject']['fileID']]

        def under(t):
            while t:
                if t == top:
                    return True
                t = tf[t]['m_Father']['fileID']
            return False
        npath = {tpath(t, top): index[t] for t in order if under(t)}
        ctrl = guid_path('AnimatorController', a['m_Controller']['guid'])
        states, default, trans, params = controller(ctrl)
        st = {}
        for s in states.values():
            if s['tree']:
                kids = []
                for ch in s['tree']['children']:
                    c = clip(guid_path('AnimationClip', ch['clip']), npath)
                    clips[c['name']] = c
                    kids.append({'t': ch['t'], 'clip': c['name']})
                st[s['name']] = {'speed': s['speed'], 'tree': {'param': s['tree']['param'], 'children': kids}}
            else:
                c = clip(guid_path('AnimationClip', s['clip']), npath)
                clips[c['name']] = c
                st[s['name']] = {'speed': s['speed'], 'clip': c['name']}
        anims[os.path.basename(ctrl)[:-11]] = {'node': index[top], 'states': st, 'default': default, 'transitions': trans, 'params': params}

    # ---- vật liệu (Monster_Shader_0, như Night Angler)
    mpath = guid_path('Material', smr['m_Materials'][0]['guid'])
    mdoc = yaml_body(mpath)['m_SavedProperties']
    size = 0
    tex = {}
    for key, prop, mx in (('albedo', 'Texture2D_f4d8f19682674cb985d212562826db7c', 512), ('emission', 'Texture2D_23e21d2602df45a9921e7c096a6a9432', 256)):
        tex[key], n = save_tex(guid_path('Texture2D', mdoc['m_TexEnvs'][prop]['m_Texture']['guid']), key, mx)
        size += n
    mats = {'name': os.path.basename(mpath)[:-4], 'shader': 'Shader Graphs/Monster_Shader (Monster_Shader_0)', 'albedo': tex['albedo'], 'emission': tex['emission'],
            'emissionStrength': float(mdoc['m_Floats']['Vector1_b0d9cca47aa941e7b3c694dbf011a310']),
            'emissionEffectiveDistance': float(mdoc['m_Floats']['_EmissionEffectiveDistance']), 'yFade': int(mdoc['m_Floats']['BOOLEAN_EE28029A70D44328B5150E5206E2185D'])}

    # ---- tiếng: 5 AudioSource + 4 clip gọi + tiếng tấn công (Addressables)
    def clipname(ref):
        return os.path.splitext(os.path.basename(guid_path(['AudioClip', 'Audio'], ref['guid'])))[0]
    audio = {}
    for key, fld in (('idle', 'idleLoopAudio'), ('aggro', 'aggroLoopAudio'), ('call', 'callAudio'), ('banish', 'banishAudio'), ('detected', 'playerDetectedAudio')):
        a = objs[gc[fld]['fileID']][1]
        audio[key] = {'clip': clipname(a['m_audioClip']), 'vol': float(a['m_Volume']), 'loop': bool(a['Loop']), 'min': float(a['MinDistance']), 'max': float(a['MaxDistance']),
                      'rolloff': int(a['rolloffMode'])}
    audio['aggroCalls'] = [clipname(c) for c in gc['aggroCalls']]
    audio['idleCalls'] = [clipname(c) for c in gc['idleCalls']]
    audio['attack'] = os.path.splitext(A.addressable(gc['attackSFX']['m_AssetGUID']).rsplit('/', 1)[-1])[0]
    # clip chưa có trong data/audio.js (tools/audio.py chỉ lấy Aggro Call 1, Attack, Banished, Idle Loop): mã hoá thêm 5 clip, serpent.js tự thêm vào DR_AUDIO
    have = {'Gale Cliffs Monster - Aggro Call 1', 'Gale Cliffs Monster - Attack', 'Gale Cliffs Monster - Banished', 'Gale Cliffs Monster - Idle Loop'}
    need = sorted({audio[k]['clip'] for k in ('idle', 'aggro', 'call', 'banish', 'detected')} | set(audio['aggroCalls']) | set(audio['idleCalls']) | {audio['attack']})
    extra = {}
    for nm in need:
        if nm in have:
            continue
        src, dur = encode_mp3(nm)
        loop = nm.endswith('Loop')
        extra[nm] = {'src': src, 'loop': loop, 'vol': 0.8, 'dur': dur, 'orig': 'Assets/Audio/SFX/Monster/Gale Cliffs/' + nm + '.wav'}
        size += os.path.getsize(os.path.join(GAME, src))
    audio['extra'] = extra

    nav, ncells = navmask()
    mgr = scene_part()
    data = {
        'src': 'GameObject/GaleCliffMonster.prefab + MonoBehaviour/GaleCliffsMonster.asset + Scenes/Game.unity (GaleCliffsMonsterManager)',
        'data': {k: float(v) for k, v in md.items() if k in ('worldPhaseMin', 'spawnTime', 'despawnTime', 'spawnMinDistance', 'spawnMaxDistance', 'despawnDistanceThreshold', 'idleDepth',
                                                           'disappearDepth', 'seekDelaySec', 'playerLostThreshold', 'patrolSpeed', 'huntSpeed', 'fleeSpeed')},
        'monster': {k: float(gc[k]) for k in ('attackMaxBoatSpeed', 'attackMovementSpeedMultiplier', 'attackDistanceThreshold', 'maxChaseTimeSec', 'timeBetweenPlayerDetectionAudioClips',
                                              'callAudioDelayMin', 'callAudioDelayMax', 'callAudioPitchMin', 'callAudioPitchMax', 'ambienceMaxVolume', 'ambienceFadeDurationSec',
                                              'arriveThreshold', 'attackDepthThreshold', 'proximityAnimatorThresholdNear', 'proximityAnimatorThresholdFar', 'moveSpeedScalar',
                                              'boatSpeedMin', 'boatSpeedMax')},
        'viewLayerMask': int(gc['viewLayerMask']['m_Bits']),
        'damager': {k: int(vpd[k]) for k in ('oneHitOnly', 'damagePoints', 'requireOneHealthToKill', 'extraDamageInNightmareMode')},
        'agent': {'speed': float(agent['m_Speed']), 'acceleration': float(agent['m_Acceleration']), 'angularSpeed': float(agent['m_AngularSpeed']),
                  'radius': float(agent['m_Radius']), 'stoppingDistance': float(agent['m_StoppingDistance']), 'autoBraking': int(agent['m_AutoBraking']),
                  'baseOffset': float(agent['m_BaseOffset']), 'height': float(agent['m_Height'])},
        'pathFollow': {'waypointDistanceThreshold': float(spf['waypointDistanceThreshold']), 'loop': int(spf['loop'])},
        'follow': {'arriveThreshold': float(tfl['arriveThreshold']), 'timeBetweenPathRefreshesSec': float(tfl['timeBetweenPathRefreshesSec']),
                   'overshootDistance': float(tfl['overshootDistance']), 'pathLockThreshold': float(tfl['pathLockThreshold'])},
        'move': {'waypointDistanceThreshold': float(tmv['waypointDistanceThreshold'])},
        'eyes': [{'name': name_of_tf[tf_of_go[e['m_GameObject']['fileID']]], 'node': node_idx(name_of_tf[tf_of_go[e['m_GameObject']['fileID']]]), 'viewRadius': float(e['viewRadius']),
                  'viewAngle': float(e['viewAngle']), 'interval': float(e['timeBetweenSearchesSec']), 'playerMask': int(e['playerMask']['m_Bits']),
                  'obstacleMask': int(e['obstacleMask']['m_Bits'])} for e in sorted(eyes, key=lambda e: name_of_tf[tf_of_go[e['m_GameObject']['fileID']]])],
        'depthMonitor': {'updateSec': float(dmon['depthUpdateFrequencySec'])},
        'proximity': {'updateSec': float(pmon['updateFrequencySec'])},
        'collider': {'detector': {'node': node_idx('PlayerDetector'), 'center': rnd([float(capsule['m_Center']['x']), float(capsule['m_Center']['y']), -float(capsule['m_Center']['z'])], 5),
                                  'radius': float(capsule['m_Radius']), 'height': float(capsule['m_Height']), 'direction': int(capsule['m_Direction'])},
                     'body': {'node': node_idx('Collider'), 'center': rnd([float(body['m_Center']['x']), float(body['m_Center']['y']), -float(body['m_Center']['z'])], 5),
                              'radius': float(body['m_Radius']), 'height': float(body['m_Height']), 'direction': int(body['m_Direction'])}},
        'fader': {'minBlendDistance': float(fader['minBlendDistance']), 'maxBlendDistance': float(fader['maxBlendDistance']), 'blendDurationSec': float(fader['blendDurationSec'])},
        'audio': audio, 'manager': mgr, 'nav': nav,
        'nodes': nodes, 'skin': skin, 'followers': followers, 'clips': clips, 'animator': anims, 'mat': mats,
        'particles': {'hit': ['MarrowMonsterBoatDamageFX', node_idx('BoatDamageFX')], 'wake': ['MarrowMonsterWake', node_idx('BoatTrailParticles')]},
    }
    js = ('// Generated by games/dredge/tools/serpent.py from GaleCliffMonster.prefab + GaleCliffsMonster.asset + Game.unity GaleCliffsMonsterManager. Do not edit.\n'
          'window.DR_SERPENT = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('nodes %d  skin verts %d tris %d bones %d  followers %d  clips %s  js %d KB  tex+audio %d KB  nav %dx%d (%d ô đi được)' %
          (len(nodes), skin_mesh['n'], skin_tris, len(bones), len(followers), ' '.join('%s %.2fs' % (k, c['len']) for k, c in sorted(clips.items())),
           len(js.encode('utf-8')) // 1024, size // 1024, nav['w'], nav['h'], ncells))
    print('routes %s  exit %d  triggers %d  holes %d  rocks %d  audio thêm %s' % (','.join(r['name'] + ':' + str(len(r['pts'])) for r in mgr['routes']), len(mgr['exitRoutes']),
                                                                              len(mgr['triggers']), len(mgr['holes']), len(mgr['rocks']), ','.join(extra)))


if __name__ == '__main__':
    main()
