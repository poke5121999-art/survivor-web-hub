"""Leviathan (LeviathanWorldEvent / LeviathanAttack, R7) -> data/leviathan.js + art/vfx/leviathan/{head.bin,albedo.webp} + audio/monsters/Leviathan_*.mp3.

Chạy:  python -I games/dredge/tools/leviathan.py      (tools/greatwhite.py import hàm của tệp này)
Đọc:   Assets/GameObject/LeviathanAttackWorldEvent.prefab (cây xương, SkinnedMeshRenderer LeviathanHead, LeviathanWorldEvent.cs, 3 AudioSource),
       Assets/Mesh/LeviathanHead.asset, Assets/AnimationClip/Leviathan_{Idle,Attack}.anim (+ sự kiện DisableMovement/DisableBoatModel/KillPlayer),
       AnimatorController/WE_Leviathan (Idle -[trigger attack, 0 s]-> Attack), Material/WorldEventLeviathan_Mat, Audio/SFX/World Event/Leviathan/*.ogg.
       Leviathan.asset / LeviathanAttack.asset (điều kiện sinh) nằm sẵn ở data/worldevents.js, không đọc lại ở đây.
Ra:    window.DR_LEVIATHAN = { params, curves{spawnY,...}, bones, skinBones, bindPoses, clips{idle,attack}, mesh{url,nv,ni,...}, material, tex, audio }
       head.bin (little endian): u32 nv, u32 ni, f32 min[3], f32 max[3], f32 uvMin[2], f32 uvMax[2], pad tới 64 byte; rồi
       pos u16[nv*3] (chuẩn hoá theo min..max), uv u16[nv*2] (theo uvMin..uvMax), skinIndex u8[nv*4], skinWeight u8[nv*4], index u16[ni].
       Không ghi pháp tuyến: vật liệu web không chiếu sáng theo N·L (Lit_Shader gốc cũng không có N·L, xem js/water.js).
Toạ độ: như tools/phantomshark.py (đổi dấu z, quaternion (x,y,z,w) -> (-x,-y,z,w), tam giác đảo chiều).
Bẫy:   (1) LeviathanHead nằm cạnh cây xương 'root' chứ không phải con của nó: nút da chỉ cần cho vị trí gốc, phép da dùng bindpose;
       (2) đường cong clip có tiền tố 'root/...' tính từ nút có Animator (WE_LeviathanAttack), không phải từ gốc prefab;
       (3) clip Attack còn 6 đường cong m_Enabled của collider spineNCB: bỏ (web không có collider Leviathan);
       (4) vùng nhìn của mesh dài ~160 m: web đặt frustumCulled = false.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys, struct, subprocess, shutil
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
TEX_MAX = 256  # [ĐỀ XUẤT] cạnh lớn nhất của texture (gốc 512): ngân sách 1,5 MB của đơn vị R7


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


def guid_path(kind_dir, guid):
    d = os.path.join(ASSETS, kind_dir)
    for root, _, files in os.walk(d):
        for fn in sorted(files):
            if fn.endswith('.meta'):
                with io.open(os.path.join(root, fn), encoding='utf-8', errors='ignore') as f:
                    if 'guid: ' + guid in f.read(400):
                        return os.path.join(root, fn[:-5])
    raise SystemExit('không thấy tệp guid %s trong %s' % (guid, kind_dir))


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


def conv_q(q):
    return [-q[0], -q[1], q[2], q[3]]


def read_skinned_mesh(path):
    """Mesh YAML -> pos, uv, skinIndex, skinWeight, index (đã đổi sang three.js), bindposes."""
    d = list(yaml.load(open(path, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
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
    pos, uv, wts, idx4 = chan(0), chan(4), chan(12), chan(13)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)
    tris = []
    for sm in d['m_SubMeshes']:
        first = sm['firstByte'] // (2 if d.get('m_IndexFormat', 0) == 0 else 4)
        tris.append(idx[first: first + sm['indexCount']] + sm.get('baseVertex', 0))
    tri = np.concatenate(tris).reshape(-1, 3)[:, [0, 2, 1]]
    pos[:, 2] *= -1
    S = np.diag([1.0, 1.0, -1.0, 1.0])
    bind = []
    for b in d['m_BindPose']:
        M = np.array([[b['e%d%d' % (r, c)] for c in range(4)] for r in range(4)], dtype=np.float64)
        M = S @ M @ S
        bind.append(rnd(M.T.reshape(-1).tolist(), 6))
    return pos, uv[:, :2], idx4, wts, tri, bind, n


def write_bin(path, pos, uv, idx4, wts, tri):
    n = len(pos)
    assert n < 65536
    mn, mx = pos.min(axis=0), pos.max(axis=0)
    umn, umx = uv.min(axis=0), uv.max(axis=0)
    q = np.round((pos - mn) / np.maximum(mx - mn, 1e-9) * 65535).astype(np.uint16)
    qu = np.round((uv - umn) / np.maximum(umx - umn, 1e-9) * 65535).astype(np.uint16)
    w = np.clip(wts, 0, None)
    w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
    w8 = np.round(w * 255).astype(np.int32)
    w8[np.arange(n), w8.argmax(axis=1)] += 255 - w8.sum(axis=1)   # tổng đúng 255
    head = struct.pack('<II6f4f', n, tri.size, *mn.astype(np.float32), *mx.astype(np.float32), *umn.astype(np.float32), *umx.astype(np.float32))
    head += b'\0' * (64 - len(head))
    blob = head + q.tobytes() + qu.tobytes() + idx4.astype(np.uint8).tobytes() + w8.astype(np.uint8).tobytes() + tri.astype(np.uint16).reshape(-1).tobytes()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(blob)
    return {'nv': int(n), 'ni': int(tri.size), 'min': rnd(mn.tolist(), 4), 'max': rnd(mx.tolist(), 4), 'bytes': len(blob)}


def curves(path, root_name):
    doc = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
    out = {}

    def add(lst, kind):
        for c in lst:
            nm = c['path']
            keys = []
            for k in c['curve']['m_Curve']:
                if kind == 'q':
                    v, i, o = conv_q(vec(k['value'], 'xyzw')), conv_q(vec(k['inSlope'], 'xyzw')), conv_q(vec(k['outSlope'], 'xyzw'))
                elif kind == 'p':
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                else:
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                keys.append(rnd([float(k['time'])] + v + i + o, 5))
            out.setdefault(nm, {})[kind] = {'path': c['path'], 'keys': keys}
    add(doc['m_RotationCurves'], 'q')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    st = doc['m_AnimationClipSettings']
    return {'len': float(st['m_StopTime']), 'loop': bool(st['m_LoopTime']),
            'events': [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']], 'curves': out}


def anim_curve(c):
    """AnimationCurve của MonoBehaviour (m_Curve) -> [[t, v, inSlope, outSlope], ...] (Hermite như Unity; 'Infinity' = bậc thang)."""
    def f(x):
        return None if (isinstance(x, str) and 'nf' in x) else float(x)
    return [[float(k['time']), float(k['value']), f(k['inSlope']), f(k['outSlope'])] for k in c['m_Curve']]


def save_tex(src, outdir, name, gray=False):
    im = Image.open(src)
    im = im.convert('L') if gray else im.convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(outdir, exist_ok=True)
    p = os.path.join(outdir, name + '.webp')
    im.save(p, 'WEBP', quality=80, method=6)
    return os.path.getsize(p)


def encode_audio(ogg_rel, out_name, abr='64k'):
    src = os.path.join(ASSETS, 'Audio', 'SFX', 'World Event', ogg_rel)
    out = os.path.join(GAME, 'audio', 'monsters', out_name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-b:a', abr, out], check=True)
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).decode().strip())
    return {'src': 'audio/monsters/' + out_name + '.mp3', 'dur': round(dur, 2), 'orig': 'Assets/Audio/SFX/World Event/' + ogg_rel.replace('\\', '/'), 'bytes': os.path.getsize(out)}


def skeleton(objs, anim_go_name, mesh_go_name):
    """Cây xương rút gọn (chỉ xương da + tổ tiên) của prefab. Trả về (bones, index, skin xương, anim_tf, tpath)."""
    go_name = {i: o[1]['m_Name'] for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {o['m_GameObject']['fileID']: i for i, o in tf.items()}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    smr = [o[1] for o in objs.values() if o[0] == 137][0]
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    anim_tf = [tf_of_go[g] for g, n in ((k, go_name[k]) for k in tf_of_go) if n == anim_go_name][0]
    keep = set(bone_ids) | {anim_tf}
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
        bones.append({'name': go_name[go_of_tf[t]], 'parent': index.get(T['m_Father']['fileID'], -1), 'p': rnd(p, 6),
                      'q': rnd(conv_q(vec(T['m_LocalRotation'], 'xyzw')), 6), 's': rnd(vec(T['m_LocalScale']), 6)})

    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    return bones, index, [index[b] for b in bone_ids], index[anim_tf], {tpath(t): index[t] for t in order}, smr, go_name, tf, go_of_tf


def bind_clip(clip, by_path, anim_idx, label):
    """đường cong clip -> chỉ số xương; trả số đường cong không khớp (Unity bỏ qua các đường cong ấy)."""
    miss = 0
    for nm, d in list(clip['curves'].items()):
        for kind, v in list(d.items()):
            if v['path'] in by_path:
                v['bone'] = by_path[v['path']]
                del v['path']
            elif v['path'] == '':
                v['bone'] = anim_idx
                del v['path']
            else:
                miss += 1
                del d[kind]
        if not d:
            del clip['curves'][nm]
    return miss


def main():
    objs = load_doc(os.path.join(ASSETS, 'GameObject', 'LeviathanAttackWorldEvent.prefab'))
    bones, index, skin_bones, anim_idx, by_path, smr, go_name, tf, go_of_tf = skeleton(objs, 'WE_LeviathanAttack', 'LeviathanHead')
    pos, uv, idx4, wts, tri, bind, nv = read_skinned_mesh(guid_path('Mesh', smr['m_Mesh']['guid']))
    assert len(bind) == len(skin_bones)
    outdir = os.path.join(GAME, 'art', 'vfx', 'leviathan')
    mesh = write_bin(os.path.join(outdir, 'head.bin'), pos, uv, idx4, wts, tri)
    mesh['url'] = 'art/vfx/leviathan/head.bin'
    clips = {}
    for key, fn in (('idle', 'Leviathan_Idle.anim'), ('attack', 'Leviathan_Attack.anim')):
        clips[key] = curves(os.path.join(ASSETS, 'AnimationClip', fn), 'WE_LeviathanAttack')
        miss = bind_clip(clips[key], by_path, anim_idx, key)
        print('clip', key, 'len', clips[key]['len'], 'đường cong', sum(len(d) for d in clips[key]['curves'].values()), 'không khớp xương', miss)

    # bộ điều khiển đọc thật: Idle (mặc định) -[attack, 0 s, không exit time]-> Attack
    ctl = list(load_doc(os.path.join(ASSETS, 'AnimatorController', 'WE_Leviathan.controller')).values())
    st = {o[1]['m_Name']: o[1] for o in ctl if o[0] == 1102}
    trans = [o[1] for o in ctl if o[0] == 1101]
    assert sorted(st) == ['Attack', 'Idle'] and len(trans) == 1 and trans[0]['m_Conditions'][0]['m_ConditionEvent'] == 'attack'
    controller = {'cond': 'attack', 'dur': float(trans[0]['m_TransitionDuration']), 'hasExit': bool(trans[0]['m_HasExitTime'])}

    mono = [o[1] for o in objs.values() if o[0] == 114 and 'spawnDuration' in o[1]][0]
    cv = {k: anim_curve(mono[k]) for k in ('spawnYPosCurve', 'spawnMaterialVisibilityCurve', 'spawnVolumeCurve', 'spawnWakeVolumeCurve', 'holdYPosCurve',
                                           'despawnYPosCurve', 'despawnMaterialVisibilityCurve', 'despawnVolumeCurve', 'despawnWakeVolumeCurve')}
    ioff = vec(mono['intersectionPointOffset'])
    params = {k: float(mono[k]) for k in ('spawnDuration', 'holdDuration', 'despawnDuration', 'turnSpeed', 'pathLength', 'maxVolume')}
    params.update({'intersectionPointOffsetZ': ioff[2], 'fixedDt': 0.02, 'killClips': True})
    audio_src = [(o[1]['m_GameObject']['fileID'], o[1]) for o in objs.values() if o[0] == 82]
    params['audio'] = {'rumble': [25.0, 350.0], 'wake': [25.0, 200.0], 'alt': [25.0, 350.0]}
    for _, a in audio_src:
        assert float(a['MinDistance']) == 25.0

    mat = list(yaml.load(io.open(guid_path('Material', smr['m_Materials'][0]['guid']), encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    tsrc = guid_path('Texture2D', mat['m_TexEnvs']['_MainTex']['m_Texture']['guid'])
    tbytes = save_tex(tsrc, outdir, 'albedo')
    material = {'refract': float(mat['m_Floats']['_ArtificialRefractAmount']), 'refraction': float(mat['m_Floats']['_ArtificialRefraction']),
                'lightStrength': float(mat['m_Floats']['_LightStrength'])}

    aud, abytes = {}, 0
    for key, rel, name, loop, vol in (
            ('leviathan.attack', 'Leviathan/Leviathan Attack.ogg', 'Leviathan_Attack', False, 0.8),
            ('leviathan.boom', 'Leviathan/Leviathan Underwater Boom.ogg', 'Leviathan_Underwater_Boom', False, 0.8),
            ('leviathan.call1', 'Leviathan/Leviathan Call 1.ogg', 'Leviathan_Call_1', False, 0.8),
            ('leviathan.call2', 'Leviathan/Leviathan Call 2.ogg', 'Leviathan_Call_2', False, 0.8),
            ('leviathan.call3', 'Leviathan/Leviathan Call 3.ogg', 'Leviathan_Call_3', False, 0.8),
            ('leviathan.rumble', 'Leviathan/Leviathan Rumble Loop.ogg', 'Leviathan_Rumble_Loop', True, 0.8),
            ('leviathan.wake', 'Leviathan/Leviathan Wake Loop.ogg', 'Leviathan_Wake_Loop', True, 0.8)):
        e = encode_audio(rel, name, '64k' if name in ('Leviathan_Attack', 'Leviathan_Underwater_Boom') else '32k')   # tiếng gầm / vòng lặp trầm: 32 kb/s mono đủ (ngân sách 1,5 MB)
        abytes += e.pop('bytes')
        e.update({'loop': loop, 'vol': vol})
        aud['event.' + key] = e

    data = {
        'src': 'GameObject/LeviathanAttackWorldEvent.prefab (LeviathanWorldEvent.cs, LeviathanAnimationEvents.cs, LeviathanHead.asset, Leviathan_{Idle,Attack}.anim, WE_Leviathan)',
        'params': params, 'curves': cv, 'controller': controller, 'bones': bones, 'skinNode': -1, 'skinBones': skin_bones, 'animNode': anim_idx,
        'bindPoses': bind, 'mesh': mesh, 'clips': clips, 'material': material, 'tex': {'albedo': 'art/vfx/leviathan/albedo.webp'}, 'audio': aud,
        'boundary': {'center': None, 'soft': None, 'hard': None, 'checkIntervalSec': None},
    }
    # BoundaryEnforcer (Game.unity, đã có trong art/world/markers.json): toạ độ đổi z
    mk = json.load(io.open(os.path.join(GAME, 'art', 'world', 'markers.json'), encoding='utf-8'))
    b = [v for v in mk['volumes'] if v.get('type') == 'boundary'][0]
    f = b['fields']
    data['boundary'] = {'center': [round(b['pos'][0], 4), round(b['pos'][2], 4)], 'soft': float(f['mainSoftBoundaryRadius']), 'hard': float(f['mainHardBoundaryRadius']),
                        'demoSoft': float(f['demoSoftBoundaryRadius']), 'demoHard': float(f['demoHardBoundaryRadius']), 'checkIntervalSec': float(f['checkIntervalSec']),
                        'event': f['leviathanAttackEvent']['asset']}
    js = '// Generated by games/dredge/tools/leviathan.py from LeviathanAttackWorldEvent.prefab + clips + markers.json. Do not edit.\nwindow.DR_LEVIATHAN = ' + \
        json.dumps(data, separators=(',', ':')) + ';\n'
    io.open(os.path.join(GAME, 'data', 'leviathan.js'), 'w', encoding='utf-8', newline='\n').write(js)
    print('bones %d verts %d tris %d  js %d KB  bin %d KB  tex %d KB  audio %d KB' % (len(bones), nv, tri.size // 3, len(js) // 1024, mesh['bytes'] // 1024, tbytes // 1024, abytes // 1024))


if __name__ == '__main__':
    main()
