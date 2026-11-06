"""Cá mập ma của sự kiện thế giới PhantomShark (MONSTERS.md §2.11, U10) -> data/phantomshark.js + art/vfx/phantomshark/*.webp.

Chạy:  python -I games/dredge/tools/phantomshark.py
Đọc:   Assets/GameObject/PhantomSharkWorldEvent.prefab (cây xương, SkinnedMeshRenderer Shark_inner, PhantomSharkWorldEvent.cs, Rigidbody,
       CapsuleCollider trigger của nút Collider, VariablePlayerDamager, AudioSource), Assets/Mesh/Shark.asset (kênh 3 = màu đỉnh, kênh 12/13 =
       trọng số/chỉ số xương), AnimatorController/PhantomShark_Animator (Swim -[hết 1 vòng, hoà 3,5 s]-> SwimMouthOpen -[Bite, 0,1 s]-> Swim),
       AnimationClip/Armature_PhantomShark_{Swim,SwimMouthOpen}.anim, Material/PhantomSharkInner_Mat.mat, Data/WorldEvent/PhantomShark.asset (qua
       data/worldevents.js, không đọc lại ở đây).
Ra:    window.DR_PHANTOMSHARK = { params, hit, anim, bones[], skinNode, skinBones, bindPoses, mesh{pos,nrm,uv,col,...}, clips{swim,mouth},
       material{...}, tex{albedo,noise} }
Toạ độ: như tools/tentacle.py (Unity trái tay -> three.js phải tay bằng đổi dấu z; quaternion (x,y,z,w) -> (-x,-y,z,w); tam giác đảo chiều).
Bẫy:   (1) màu đỉnh R là mặt nạ tan dần theo vị trí trên thân (shader: x = sat(2·(1−_Opacity) + R − 1)); thiếu kênh 3 thì cá mập tan đều.
       (2) bộ điều khiển: Swim có chuyển tiếp CÓ exit time nhưng KHÔNG có điều kiện → tự há miệng sau 1 vòng; điều kiện Bite chỉ ở chiều ngược lại.
       (3) nút Collider xoay +90° quanh x nên trục Y của capsule thành trục z (tiến tới) của cá mập; tâm (0,2,0) ⇒ capsule nằm z 0..4 phía trước gốc.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'phantomshark.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'phantomshark')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
TEX_MAX = 256  # [ĐỀ XUẤT] cạnh lớn nhất của texture (gốc 1024/512): ngân sách 90 MB, cá mập chiếm vài trăm pixel trên màn hình


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


def read_skinned_mesh(path):
    """Mesh YAML -> pos, nrm, uv, col (R,G,B,A), skinIndex, skinWeight, index, bindposes (đã đổi sang three.js)."""
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
    pos, nrm, col, uv, wts, idx4 = chan(0), chan(1), chan(3), chan(4), chan(12), chan(13)
    assert col is not None, 'Shark.asset không có màu đỉnh (kênh 3)'
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
        bind.append(rnd(M.T.reshape(-1).tolist(), 6))
    return {'pos': rnd(pos.reshape(-1).tolist(), 4), 'nrm': rnd(nrm.reshape(-1).tolist(), 3), 'uv': rnd(uv[:, :2].reshape(-1).tolist(), 4),
            'col': rnd(col.reshape(-1).tolist(), 3), 'index': tri.reshape(-1).tolist(), 'skinIndex': idx4.reshape(-1).tolist(),
            'skinWeight': rnd(wts.reshape(-1).tolist(), 4)}, bind, n


def curves(path, root_name):
    doc = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
    out = {}

    def add(lst, kind):
        for c in lst:
            nm = c['path'].split('/')[-1] if c['path'] else root_name
            keys = []
            for k in c['curve']['m_Curve']:
                if kind == 'q':
                    v, i, o = conv_q(vec(k['value'], 'xyzw')), conv_q(vec(k['inSlope'], 'xyzw')), conv_q(vec(k['outSlope'], 'xyzw'))
                elif kind == 'p':
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                    v[2], i[2], o[2] = -v[2], -i[2], -o[2]
                else:
                    v, i, o = vec(k['value']), vec(k['inSlope']), vec(k['outSlope'])
                keys.append(rnd([float(k['time'])] + v + i + o, 6))
            out.setdefault(nm, {})[kind] = {'path': c['path'], 'keys': keys}
    add(doc['m_RotationCurves'], 'q')
    add(doc['m_PositionCurves'], 'p')
    add(doc['m_ScaleCurves'], 's')
    st = doc['m_AnimationClipSettings']
    return {'len': float(st['m_StopTime']), 'loop': bool(st['m_LoopTime']), 'events': [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']],
            'curves': out}


def save_tex(src, name, gray=False):
    im = Image.open(src)
    im = im.convert('L') if gray else im.convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=82, method=6)
    return 'art/vfx/phantomshark/' + name + '.webp', os.path.getsize(p)


def main():
    objs = load_doc(os.path.join(ASSETS, 'GameObject', 'PhantomSharkWorldEvent.prefab'))
    go_name = {i: o[1]['m_Name'] for i, o in objs.items() if o[0] == 1}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    tf_of_go = {o['m_GameObject']['fileID']: i for i, o in tf.items()}
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    smr = [o[1] for o in objs.values() if o[0] == 137][0]
    skin_tf = tf_of_go[smr['m_GameObject']['fileID']]
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    mesh_path = guid_path('Mesh', smr['m_Mesh']['guid'])
    mat_path = guid_path('Material', smr['m_Materials'][0]['guid'])
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    col_go = [i for i, n in go_name.items() if n == 'Collider'][0]
    col_tf = tf_of_go[col_go]
    keep = set(bone_ids) | {skin_tf, col_tf}
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
    mesh, bind, nv = read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids), 'số bindpose %d khác số xương %d' % (len(bind), len(bone_ids))

    anim = [o[1] for o in objs.values() if o[0] == 95][0]
    anim_tf = tf_of_go[anim['m_GameObject']['fileID']]

    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    by_path = {tpath(t): t for t in order}
    clips = {}
    for key, fn in (('swim', 'Armature_PhantomShark_Swim.anim'), ('mouth', 'Armature_PhantomShark_SwimMouthOpen.anim')):
        clips[key] = curves(os.path.join(ASSETS, 'AnimationClip', fn), go_name[go_of_tf[anim_tf]])
        for nm, d in clips[key]['curves'].items():
            for kind, v in d.items():
                assert v['path'] in by_path or v['path'] == '', 'đường cong %s/%s không khớp xương' % (key, v['path'])
                v['bone'] = index[by_path[v['path']]] if v['path'] else index[anim_tf]
                del v['path']

    # bộ điều khiển: đọc thật từ tệp (không gõ tay): trạng thái, thời gian hoà, exit time, điều kiện
    ctl = [o for o in load_doc(os.path.join(ASSETS, 'AnimatorController', 'PhantomShark_Animator.controller')).values()]
    st = {o[1]['m_Name']: o[1] for o in ctl if o[0] == 1102}
    trans = [o[1] for o in ctl if o[0] == 1101]
    assert sorted(st) == ['Swim', 'SwimMouthOpen'] and len(trans) == 2
    t_sw = [t for t in trans if not t['m_Conditions']][0]
    t_mo = [t for t in trans if t['m_Conditions']][0]
    assert t_mo['m_Conditions'][0]['m_ConditionEvent'] == 'Bite' and t_mo['m_Conditions'][0]['m_ConditionMode'] == 1
    controller = {'swimToMouth': {'exitTime': float(t_sw['m_ExitTime']), 'dur': float(t_sw['m_TransitionDuration']), 'fixed': bool(t_sw['m_HasFixedDuration'])},
                  'mouthToSwim': {'cond': 'Bite', 'dur': float(t_mo['m_TransitionDuration']), 'fixed': bool(t_mo['m_HasFixedDuration']), 'hasExit': bool(t_mo['m_HasExitTime'])}}

    # PhantomSharkWorldEvent + VariablePlayerDamager + capsule + rigidbody + AudioSource
    mono = [o[1] for o in objs.values() if o[0] == 114]
    ev = [m for m in mono if 'dodgeSensitivity' in m][0]
    dmg = [m for m in mono if 'damagePoints' in m][0]
    cap = [o[1] for o in objs.values() if o[0] == 136][0]
    rb = [o[1] for o in objs.values() if o[0] == 54][0]
    au = [o[1] for o in objs.values() if o[0] == 82][0]
    params = {'maxSpeed': float(ev['maxSpeed']), 'acceleration': float(ev['acceleration']), 'initialSpeed': float(ev['initialSpeed']),
              'turnSpeed': float(ev['turnSpeed']), 'dodgeSensitivity': float(ev['dodgeSensitivity']), 'delayBeforeDestroying': float(ev['delayBeforeDestroying']),
              'turnSpeedMax': 10.0, 'spawnY': -1.0, 'fixedDt': 0.02, 'appearFadeSec': 1.5, 'drag': float(rb['m_Drag']),
              'audio': {'min': float(au['MinDistance']), 'max': float(au['MaxDistance']), 'fadeInSec': 1.0}}
    hit = {'points': int(dmg['damagePoints']), 'oneHitOnly': bool(dmg['oneHitOnly']), 'requireOneHealth': bool(dmg['requireOneHealthToKill']),
           'capsule': {'radius': float(cap['m_Radius']), 'height': float(cap['m_Height']), 'dir': int(cap['m_Direction']), 'center': rnd(vec(cap['m_Center']), 4)},
           'node': index[col_tf]}

    mat = list(yaml.load(io.open(mat_path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    tex, size = {}, 0
    for k, nm, gray in (('_Albedo', 'albedo', False), ('_DistortionTexture', 'noise', True)):
        src = guid_path('Texture2D', mat['m_TexEnvs'][k]['m_Texture']['guid'])
        tex[nm], n = save_tex(src, nm, gray)
        size += n
    ut = mat['m_Colors']['_UVTiling']
    material = {'uvTiling': [float(ut['r']), float(ut['g'])], 'opacity': float(mat['m_Floats']['_Opacity']),
                # PhantomShark_Shader (DXBC, tools/particles.py --dis): màu = lerp(albedo, sương, k) + (1,2·albedo)² + (10, 0, 0,086358)·(n·x)^20;
                # x = sat(2·(1−_Opacity) + màuĐỉnh.R − 1); n = 1 − noise(thế giới.xz·UVTiling + 0,1·t); bỏ điểm ảnh khi n < x
                'selfLit': 1.2, 'edgeColor': [10.0, 0.0, 0.086358], 'edgePow': 20.0, 'scrollK': 0.1, 'cull': 0}

    data = {
        'src': 'GameObject/PhantomSharkWorldEvent.prefab (PhantomSharkWorldEvent.cs, Shark.asset, PhantomShark_Animator, PhantomSharkInner_Mat)',
        'params': params, 'hit': hit, 'controller': controller, 'bones': bones, 'skinNode': index[skin_tf], 'skinBones': [index[b] for b in bone_ids],
        'bindPoses': bind, 'mesh': mesh, 'clips': clips, 'material': material, 'tex': tex,
        'particles': {'appear': 'PhantomSharkAppear', 'disappear': 'PhantomSharkDisappear', 'wake': 'PhantomSharkWake'},
    }
    js = '// Generated by games/dredge/tools/phantomshark.py from PhantomSharkWorldEvent.prefab + clips. Do not edit.\nwindow.DR_PHANTOMSHARK = ' + \
        json.dumps(data, separators=(',', ':')) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('bones %d  verts %d  tris %d  swim %.2fs mouth %.2fs  js %d KB  tex %d KB' %
          (len(bones), nv, len(mesh['index']) // 3, clips['swim']['len'], clips['mouth']['len'], len(js) // 1024, size // 1024))


if __name__ == '__main__':
    main()
