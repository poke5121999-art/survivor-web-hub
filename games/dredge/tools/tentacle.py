"""Xúc tu đỏ gai của sự kiện thế giới TentacleAttack (V14: hoảng loạn cao) -> data/tentacle.js + art/vfx/tentacle/*.webp.

Chạy:  python -I games/dredge/tools/tentacle.py
Đọc:   Assets/GameObject/TentacleAttack.prefab (cây xương, SkinnedMeshRenderer, AttackingTentacle), Assets/Mesh/*.asset (mesh có trọng số xương
       trong kênh 12/13 của vertex buffer), Assets/AnimationClip/Armature_Spawn.anim + Tentacle_Retract.anim (bộ điều khiển
       AnimatorController/TentacleAttack: Empty -[play]-> Armature|Spawn; mọi trạng thái -[exit]-> Tentacle_Retract, 0,5 s),
       Material/AttackingTentacle_Mat.mat (Texture + Emission, _EmissionEffectiveDistance).
Ra:    window.DR_TENTACLE = { anchor, trackingStrength, bones[], skin{...}, clips{spawn,retract}, tex{albedo,emission}, emissionDistance }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z, quaternion (x,y,z,w) -> (-x,-y,z,w), tam giác đảo chiều, bindpose S·M·S).
Bẫy: đường cong hoạt ảnh là Hermite theo từng thành phần (inSlope/outSlope), quaternion chuẩn hoá sau khi nội suy; giữ nguyên khoá thưa chứ
     không lấy mẫu lại. Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'tentacle.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'tentacle')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
TEX_MAX = 256  # [ĐỀ XUẤT] cạnh lớn nhất của texture xúc tu (gốc 1024): hạt/xúc tu nhỏ trên màn hình, giữ ngân sách 90 MB


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
    """Tệp trong thư mục Assets/<kind_dir> có .meta chứa guid."""
    d = os.path.join(ASSETS, kind_dir)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as f:
                if 'guid: ' + guid in f.read(400):
                    return os.path.join(d, fn[:-5])
    raise SystemExit('không thấy tệp guid %s trong %s' % (guid, kind_dir))


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


def conv_q(q):  # Unity (x,y,z,w) -> three (đổi dấu z của không gian): (-x,-y,z,w)
    return [-q[0], -q[1], q[2], q[3]]


def read_skinned_mesh(path):
    """Mesh YAML -> pos, nrm, uv, skinIndex, skinWeight, index, bindposes (đã đổi sang three.js)."""
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
        if fmt == 4:
            return a.view(np.uint16).reshape(n, dim).astype(np.int64)
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
        bind.append(rnd(M.T.reshape(-1).tolist(), 6))  # three.js Matrix4.fromArray: cột trước
    return {'pos': rnd(pos.reshape(-1).tolist(), 4), 'nrm': rnd(nrm.reshape(-1).tolist(), 3), 'uv': rnd(uv[:, :2].reshape(-1).tolist(), 4),
            'index': tri.reshape(-1).tolist(), 'skinIndex': idx4.reshape(-1).tolist(), 'skinWeight': rnd(wts.reshape(-1).tolist(), 4)}, bind, n


def curves(path, root_name_of):
    """Đường cong của clip: {tên xương: {p, q, s}}, khoá [t, giá trị..., inSlope..., outSlope...] đã đổi hệ toạ độ."""
    doc = yaml.load(io.open(path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
    out = {}

    def add(lst, kind):
        for c in lst:
            nm = c['path'].split('/')[-1] if c['path'] else root_name_of
            keys = []
            for k in c['curve']['m_Curve']:
                if kind == 'q':
                    v, i, o = vec(k['value'], 'xyzw'), vec(k['inSlope'], 'xyzw'), vec(k['outSlope'], 'xyzw')
                    v, i, o = conv_q(v), conv_q(i), conv_q(o)
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
    events = [{'t': round(float(e['time']), 5), 'fn': e['functionName']} for e in doc['m_Events']]
    return {'len': float(doc['m_AnimationClipSettings']['m_StopTime']), 'loop': bool(doc['m_AnimationClipSettings']['m_LoopTime']),
            'events': events, 'curves': out}


def save_tex(src, name):
    im = Image.open(src).convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name + '.webp')
    im.save(p, 'WEBP', quality=80, method=6)
    return 'art/vfx/tentacle/' + name + '.webp', os.path.getsize(p)


def main():
    pre = os.path.join(ASSETS, 'GameObject', 'TentacleAttack.prefab')
    objs = load_doc(pre)
    go_name = {i: o[1]['m_Name'] for i, o in objs.items() if o[0] == 1}
    tf_of_go = {}
    for i, o in objs.items():
        if o[0] == 4:
            tf_of_go[o[1]['m_GameObject']['fileID']] = i
    go_of_tf = {v: k for k, v in tf_of_go.items()}
    tf = {i: o[1] for i, o in objs.items() if o[0] == 4}
    # bone list từ SkinnedMeshRenderer
    smr = [o[1] for o in objs.values() if o[0] == 137][0]
    skin_tf = tf_of_go[smr['m_GameObject']['fileID']]
    bone_ids = [b['fileID'] for b in smr['m_Bones']]
    mesh_path = guid_path('Mesh', smr['m_Mesh']['guid'])
    mat_path = guid_path('Material', smr['m_Materials'][0]['guid'])
    # toàn bộ nút Transform có tên và không thuộc hạt: gốc prefab + Armature + xương + nút Tentacle
    root_tf = [i for i, t in tf.items() if t['m_Father']['fileID'] == 0][0]
    keep = set(bone_ids) | {skin_tf}
    # thêm tổ tiên
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
        q = vec(T['m_LocalRotation'], 'xyzw')
        p = vec(T['m_LocalPosition'])
        p[2] = -p[2]
        bones.append({'name': go_name[go_of_tf[t]], 'parent': index.get(T['m_Father']['fileID'], -1), 'p': rnd(p, 6), 'q': rnd(conv_q(q), 6),
                      's': rnd(vec(T['m_LocalScale']), 6)})
    mesh, bind, nv = read_skinned_mesh(mesh_path)
    assert len(bind) == len(bone_ids), 'số bindpose %d khác số xương %d' % (len(bind), len(bone_ids))
    # hoạt ảnh: animator nằm ở GameObject nào -> đường dẫn tương đối của clip bắt đầu từ đó
    anim = [o[1] for o in objs.values() if o[0] == 95][0]
    anim_tf = tf_of_go[anim['m_GameObject']['fileID']]
    clips = {}
    for key, fn in (('spawn', 'Armature_Spawn.anim'), ('retract', 'Tentacle_Retract.anim')):
        clips[key] = curves(os.path.join(ASSETS, 'AnimationClip', fn), go_name[go_of_tf[anim_tf]])
    # kiểm: mỗi đường cong khớp một xương đúng đường dẫn từ Animator
    def tpath(t):
        p = []
        while t and t != anim_tf:
            p.append(go_name[go_of_tf[t]])
            t = tf[t]['m_Father']['fileID']
        return '/'.join(reversed(p))
    names = {tpath(t): bones[index[t]]['name'] for t in order if t in index}
    for k, c in clips.items():
        for nm, d in c['curves'].items():
            for kind, v in d.items():
                assert v['path'] in names or v['path'] == '', 'đường cong %s/%s không khớp xương' % (k, v['path'])
                v['bone'] = index[[t for t in order if tpath(t) == v['path']][0]] if v['path'] else index[anim_tf]
                del v['path']
    # MonoBehaviour AttackingTentacle
    mb = [o[1] for o in objs.values() if o[0] == 114 and 'tentacleAnchorPos' in o[1]][0]
    mat = list(yaml.load(io.open(mat_path, encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    tex = {}
    size = 0
    # tên thuộc tính Shader Graph không nói vai trò: 23e21d… trỏ AttackingTentacle_Emission.png, f4d8f1… trỏ AttackingTentacle_Texture.png
    for k, nm in (('Texture2D_23e21d2602df45a9921e7c096a6a9432', 'emission'), ('Texture2D_f4d8f19682674cb985d212562826db7c', 'albedo')):
        src = guid_path('Texture2D', mat['m_TexEnvs'][k]['m_Texture']['guid'])
        tex[nm], n = save_tex(src, nm)
        size += n
    data = {
        'src': 'GameObject/TentacleAttack.prefab (AttackingTentacle, Animator VineAttack/TentacleAttack.controller, Armature_Spawn.anim, Tentacle_Retract.anim)',
        'anchor': rnd(vec(mb['tentacleAnchorPos']), 4), 'trackingStrength': float(mb['trackingStrength']), 'animationDelay': float(mb['animationDelay']),
        'bones': bones, 'skinNode': index[skin_tf], 'skinBones': [index[b] for b in bone_ids], 'bindPoses': bind, 'mesh': mesh,
        'clips': clips, 'tex': tex, 'emissionDistance': float(mat['m_Floats']['_EmissionEffectiveDistance']),
        'retractBlend': 0.5,
    }
    js = '// Generated by games/dredge/tools/tentacle.py from TentacleAttack.prefab + clips. Do not edit.\nwindow.DR_TENTACLE = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('bones %d  verts %d  tris %d  clip spawn %.2fs retract %.2fs  js %d KB  tex %d KB' %
          (len(bones), nv, len(mesh['index']) // 3, clips['spawn']['len'], clips['retract']['len'], len(js) // 1024, size // 1024))


if __name__ == '__main__':
    main()
