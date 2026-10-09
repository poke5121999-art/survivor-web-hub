"""Thuyền ma (GhostBoat_Player1/2/3/Pirate) và FogGhost tĩnh của The Marrows -> data/ghosts.js + art/vfx/ghosts/*.

Chạy:  python -I games/dredge/tools/ghosts.py          (~1 phút: nạp scene Game.unity qua tools/world.py, shader qua tools/particles.py)
Đọc:   GameObject/GhostBoat_{Player1,Player2,Player3,Pirate}.prefab (GhostBoatWorldEvent, NavMeshAgent, AudioSource, GhostModel),
       GameObject/FogGhost trong scene Game (script FogGhost: seenMaxDistanceThreshold, manuallyFadeOutIfCloserThanSeenDistance, vị trí, nút GhostModel),
       AnimationClip/FogGhost_FadeIn.anim + FogGhost_FadeOut.anim (đường cong float material.Vector1_76d8... = "Opacity", 2 s, tiếp tuyến 0),
       Material/GhostBoat_Mat.mat (Emission texture, Opacity), Texture2D/SmallBoat_Emission.png,
       shader Shader Graphs/FogGhost_Shader đã biên dịch: trạng thái pass (blend, ZWrite, ZTest, cull, hàng đợi) và DXBC (cache angler/shaders,
       cùng biến thể không keyword: BOOLEAN_367D..._ON không phải biến thể thật).
Ra:    window.DR_GHOSTS = { src, fade, shader, tex, meshFile, meshes{tên:{n,tri,off...}}, boats{sự kiện:{...}}, statics[...] }
       art/vfx/ghosts/meshes.bin   mọi mesh dùng chung (vị trí int16 lượng tử, uv int16, màu đỉnh uint8, chỉ số uint16), art/vfx/ghosts/emission.webp
Toạ độ: three.js (đổi dấu z như tools/world.py): vị trí, quaternion (-x,-y,z,w), tam giác đảo chiều. Chạy lại ra đúng từng byte.
Bẫy:   - Mesh ma KHÔNG có pháp tuyến dùng (shader chỉ đọc vị trí, uv, màu đỉnh) nên bỏ pháp tuyến, hàn đỉnh trùng (vị trí+uv+màu) để nhỏ lại.
       - Màu đỉnh của mesh không có kênh COLOR coi là trắng (Unity mặc định); alpha màu đỉnh nhân vào độ mờ.
       - FogGhost chỉ có nút con GhostModel; vị trí/xoay/tỉ lệ thế giới của MeshFilter = tích cả chuỗi (container × GhostModel).
"""
import io, json, os, re, struct, sys

import numpy as np
import yaml
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import world  # noqa: E402
_argv, sys.argv = sys.argv, sys.argv[:1]
import particles as PT  # noqa: E402  (Shaders: trạng thái pass của shader biên dịch)
sys.argv = _argv

sys.stdout.reconfigure(encoding='utf-8')
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
OUT_JS = os.path.join(GAME, 'data', 'ghosts.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'ghosts')
CL = yaml.CSafeLoader
HDR = re.compile(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
BOATS = ['GhostBoat_Player1', 'GhostBoat_Player2', 'GhostBoat_Player3', 'GhostBoat_Pirate']
OPACITY_PROP = 'Vector1_76d8fb83378743bca37835619bac53ee'   # "Opacity" của FogGhost_Shader


def rnd(v, n=4):
    if isinstance(v, np.ndarray):
        v = v.tolist()
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, (float, np.floating)):
        r = round(float(v), n)
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


def guid_file(kind_dir, guid):
    d = os.path.join(ASSETS, kind_dir)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as f:
                if 'guid: ' + guid in f.read(400):
                    return fn[:-5]
    raise SystemExit('không thấy tệp guid %s trong %s' % (guid, kind_dir))


def vec(d, keys='xyz'):
    return [float(d[k]) for k in keys]


# ---------------------------------------------------------------- mesh -> khối nhị phân
class Pack:
    """Gom mesh vào một tệp nhị phân. Mỗi mesh: bb(6) = tâm + nửa cạnh vị trí, uvb(4) = tâm + nửa cạnh uv; luồng: pos int16x3, uv int16x2,
    [col uint8x4], index uint16; đệm về bội 4 byte để js dựng TypedArray không lệch."""

    def __init__(self):
        self.buf = bytearray()
        self.meta = {}

    def add(self, name, m):
        pos = m['pos'].copy()
        pos[:, 2] *= -1                                    # three.js: đổi dấu z
        tri = np.concatenate([t for t in m['subs']]).astype(np.int64)[:, ::-1]   # đảo chiều tam giác
        uv = m['uv'] if m['uv'] is not None else np.zeros((len(pos), 2), np.float32)
        uv = uv.astype(np.float64)
        col = m['col'] if m['col'] is not None else None
        # hàn đỉnh trùng (vị trí, uv, màu) sau khi lượng tử
        pc, ph = (pos.min(0) + pos.max(0)) / 2, np.maximum((pos.max(0) - pos.min(0)) / 2, 1e-6)
        uc, uh = (uv.min(0) + uv.max(0)) / 2, np.maximum((uv.max(0) - uv.min(0)) / 2, 1e-6)
        qp = np.round((pos - pc) / ph * 32767).astype(np.int16)
        qu = np.round((uv - uc) / uh * 32767).astype(np.int16)
        qc = np.round(col * 255).astype(np.uint8) if col is not None else None
        key = np.concatenate([qp.astype(np.int32), qu.astype(np.int32)] + ([qc.astype(np.int32)] if qc is not None else []), axis=1)
        uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        order = np.argsort(first)                          # giữ thứ tự xuất hiện đầu tiên: cố định byte
        remap = np.empty(len(order), np.int64)
        remap[order] = np.arange(len(order))
        sel = first[order]
        tri = remap[inv.reshape(-1)][tri]
        keep = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
        tri = tri[keep]
        n = len(sel)
        assert n < 65536
        off = len(self.buf)
        self.buf += qp[sel].tobytes() + qu[sel].tobytes()
        if qc is not None:
            self.buf += qc[sel].tobytes()
        self.buf += tri.astype(np.uint16).tobytes()
        while len(self.buf) % 4:
            self.buf += b'\0'
        self.meta[name] = {'off': off, 'n': n, 'tri': int(len(tri)), 'col': qc is not None, 'bb': rnd(list(pc) + list(ph), 5),
                           'uvb': rnd(list(uc) + list(uh), 5)}
        return n, len(tri)


def main():
    # ---- prefab thuyền ma
    boats = {}
    mesh_names = {}
    for ev in BOATS:
        o = load_doc(os.path.join(ASSETS, 'GameObject', ev + '.prefab'))
        by = {t: [x[1] for x in o.values() if x[0] == t] for t in (4, 33, 82, 95, 114, 195)}
        gb = [x for x in by[114] if 'maxTravelDistance' in x][0]
        ag, au = by[195][0], by[82][0]
        model_tf = [x for x in by[4] if x['m_Father']['fileID'] != 0][0]
        mesh = guid_file('Mesh', by[33][0]['m_Mesh']['guid']).replace('.asset', '')
        mesh_names[ev] = mesh
        boats[ev] = {
            'mesh': mesh, 'modelScale': vec(model_tf['m_LocalScale']), 'modelPos': vec(model_tf['m_LocalPosition']),
            'maxTravelDistance': float(gb['maxTravelDistance']), 'despawnPlayerProximity': float(gb['despawnPlayerProximity']),
            'despawnDestinationProximity': float(gb['despawnDestinationProximity']), 'finishDelaySec': float(gb['finishDelaySec']),
            'foghornMin': float(gb['foghornDurationMin']), 'foghornMax': float(gb['foghornDurationMax']),
            'forbiddenSpawnLayers': int(gb['forbiddenSpawnLayers']['m_Bits']),
            'agent': {'radius': float(ag['m_Radius']), 'speed': float(ag['m_Speed']), 'accel': float(ag['m_Acceleration']),
                      'angular': float(ag['m_AngularSpeed']), 'type': int(ag['m_AgentTypeID'])},
            'horn': {'vol': float(au['m_Volume']), 'pitch': float(au['m_Pitch']), 'loop': bool(au['Loop']), 'min': float(au['MinDistance']),
                     'max': float(au['MaxDistance']), 'rolloff': int(au['rolloffMode'])},
        }
    # ---- đường cong FadeIn / FadeOut: tiếp tuyến 0 hai đầu = smoothstep (Hermite)
    fade = {}
    for key, fn in (('in', 'FogGhost_FadeIn.anim'), ('out', 'FogGhost_FadeOut.anim')):
        d = yaml.load(io.open(os.path.join(ASSETS, 'AnimationClip', fn), encoding='utf-8').read().split('\n', 3)[3], Loader=CL)['AnimationClip']
        c = d['m_FloatCurves'][0]
        assert c['attribute'] == 'material.' + OPACITY_PROP, c['attribute']
        fade[key] = {'len': float(d['m_AnimationClipSettings']['m_StopTime']),
                     'keys': [[float(k['time']), float(k['value']), float(k['inSlope']), float(k['outSlope'])] for k in c['curve']['m_Curve']]}
    # ---- vật liệu + shader biên dịch
    mat = list(yaml.load(io.open(os.path.join(ASSETS, 'Material', 'GhostBoat_Mat.mat'), encoding='utf-8').read().split('\n', 3)[3], Loader=CL).values())[0]
    emi = guid_file('Texture2D', mat['m_SavedProperties']['m_TexEnvs']['Texture2D_3928416cd23c4ee1bf58f20f4af23151']['m_Texture']['guid'])
    os.makedirs(OUT_ART, exist_ok=True)
    im = Image.open(os.path.join(ASSETS, 'Texture2D', emi)).convert('RGB')
    im.save(os.path.join(OUT_ART, 'emission.webp'), 'WEBP', lossless=True, method=6)
    st = PT.Shaders().get('Shader Graphs/FogGhost_Shader')
    shader = {
        'blend': st['blend'], 'zwrite': st['zw'], 'ztest': st['zt'], 'cull': st['cull'], 'queue': st['sq'], 'opacityDefault': mat['m_SavedProperties']['m_Floats'][OPACITY_PROP] if isinstance(mat['m_SavedProperties']['m_Floats'], dict) else None,
        # Hằng số đọc từ DXBC fragment (cache angler/shaders/FogGhost_Shader.txt): alpha = Opacity × đêm × sat(d·0,04 − 0,9) × a_đỉnh_màu × pow(max(1 − |đèn|, 0), 100)
        # đêm = 1 − sat(((cb0[5].y + 1)·0,5 − 0,263218)·41,425377); màu = pow(sương, 10)·(màu sương − tex·màu đỉnh) + 2·tex·màu đỉnh
        'dxbc': {'distOffset': -0.9, 'distK': 0.04, 'nightA': 0.263218, 'nightK': 41.425377, 'lightPow': 100.0, 'fogPow': 10.0, 'emitK': 2.0},
    }
    # ---- scene: FogGhost
    S = world.Scene(world.load_env())
    M = world.Meshes()
    pack = Pack()
    statics = []
    used = {}
    for g in sorted(S.G, key=lambda x: S.path(x)):
        for n, o in S.scripts(g):
            if n != 'FogGhost':
                continue
            d = o.parse_as_dict()
            kids = S.children(g)
            assert len(kids) == 1 and S.name(kids[0]) == 'GhostModel', S.path(g)
            c = kids[0]
            mf = S.comp_dicts(c, 'MeshFilter')[0]
            mo = S.deref(S.af, mf['m_Mesh'])
            m = M.get(mo)
            p, q, s, mir, shear = world.decompose(S.world(c))
            assert not mir, S.path(g)
            if m['name'] not in used:
                used[m['name']] = pack.add(m['name'], m)
            cp = world.decompose(S.world(g))[0]
            statics.append({'name': S.name(g), 'path': S.path(g), 'mesh': m['name'], 'x': rnd(cp[0], 3), 'z': rnd(cp[2], 3),
                            'pos': rnd(p, 4), 'q': rnd(q, 6), 'scale': rnd(s, 5),
                            'seen': float(d['seenMaxDistanceThreshold']), 'manual': bool(d['manuallyFadeOutIfCloserThanSeenDistance']),
                            'active': S.active(g)})
    # ---- mesh thuyền ma: tìm theo tên trong cùng env (cùng bundle hay phụ thuộc)
    byname = {}
    for o in S.env.objects:
        if o.type.name == 'Mesh':
            nm = o.peek_name() if hasattr(o, 'peek_name') else o.read().m_Name
            if nm in set(mesh_names.values()) and nm not in byname:
                byname[nm] = o
    missing = set(mesh_names.values()) - set(byname)
    if missing:
        raise SystemExit('không thấy mesh %s trong bundle nạp' % sorted(missing))
    for nm in sorted(set(mesh_names.values())):
        used[nm] = pack.add(nm, M.get(byname[nm]))
    with open(os.path.join(OUT_ART, 'meshes.bin'), 'wb') as f:
        f.write(bytes(pack.buf))
    data = {
        'src': 'GameObject/GhostBoat_*.prefab (GhostBoatWorldEvent), scene FogGhosts/* (FogGhost.cs), AnimationClip/FogGhost_Fade{In,Out}.anim, Material/GhostBoat_Mat.mat, Shader Graphs/FogGhost_Shader',
        'fade': fade, 'shader': shader, 'tex': 'art/vfx/ghosts/emission.webp', 'meshFile': 'art/vfx/ghosts/meshes.bin', 'meshes': pack.meta,
        'boats': boats, 'statics': statics,
    }
    js = '// Generated by games/dredge/tools/ghosts.py from the ghost boat prefabs + scene FogGhosts. Do not edit.\nwindow.DR_GHOSTS = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    print('statics %d  boats %d  meshes %s  bin %d KB  js %d KB' % (len(statics), len(boats), {k: v for k, v in used.items()}, len(pack.buf) // 1024, len(js) // 1024))


if __name__ == '__main__':
    main()
