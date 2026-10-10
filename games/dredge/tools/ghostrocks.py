"""Đá ma (GhostRock) của The Marrows / Gale Cliffs -> data/ghostrocks.js + art/vfx/ghostrocks/*.webp.

Chạy:  python -I games/dredge/tools/ghostrocks.py        (~1 phút: đọc thẳng scene Game.unity dạng YAML, không cần UnityPy)
Đọc:   Scenes/Game.unity: mọi MonoBehaviour GhostRock (rockMeshObject, rockRenderer), chuỗi Transform tới gốc scene, MeshFilter / MeshRenderer /
       MeshCollider của đối tượng rockMeshObject (layer 7 CollidesWithPlayer, m_IsActive 0 — GhostRockManager bật khi hiện)
       MonoBehaviour/GhostRockConfig.asset (ngưỡng sanity, giờ, khoảng cách), Mesh/Marrows_*RockMesh_0.asset (mesh vẽ = mesh va chạm),
       Material/MarrowsGhostRock_Mat.mat + Texture2D/TheMarrows_Rocks_Texture.png (Albedo), GhostRockManager (Scenes/Game.unity: 60 s, 5 đá/khung)
Ra:    window.DR_GHOSTROCKS = { config, manager, material, meshes{name:{pos,idx,uv}}, rocks:[{n, mesh, p[3], q[4], s[3], zone, mat}], tex }
Toạ độ: Unity trái tay -> three.js phải tay bằng đổi dấu z (vị trí z; quaternion (x,y,z,w) -> (-x,-y,z,w); tam giác đảo chiều). Thứ tự đá giữ
       đúng thứ tự allGhostRocks trong GhostRockManager (vòng quét 5 đá/khung của bản gốc phụ thuộc thứ tự).
Bẫy:   tools/world.py:38 cố ý bỏ nhánh GhostRocks khỏi landmask nên đá ma không ở trong đó; mỗi đá là 2 đối tượng (gốc có LODGroup + GhostRock,
       con "…RockMesh" có renderer + collider, m_IsActive 0), ma trận thế giới lấy ở đối tượng CON.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, json, math, os, re, sys
import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
SCENE = os.path.join(ASSETS, 'Scenes', 'Game.unity')
OUT_JS = os.path.join(GAME, 'data', 'ghostrocks.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'ghostrocks')
CL = yaml.CSafeLoader
TEX_MAX = 256  # [ĐỀ XUẤT] cạnh lớn nhất texture đá (gốc 1024?): ngân sách 90 MB dùng chung 10 đơn vị


def rnd(v, n=4):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, (float, np.floating)):
        r = round(float(v), n)
        return 0.0 if r == 0 else r
    return v


def vec(s, keys='xyz'):
    return [float(re.search(r'\b%s: (-?[\d.e+-]+)' % k, s).group(1)) for k in keys]


def guid_path(kind_dir, guid):
    d = os.path.join(ASSETS, kind_dir)
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as f:
                if 'guid: ' + guid in f.read(400):
                    return os.path.join(d, fn[:-5])
    raise SystemExit('không thấy guid %s trong %s' % (guid, kind_dir))


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_quat(R):
    t = R[0, 0] + R[1, 1] + R[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    i = int(np.argmax([R[0, 0], R[1, 1], R[2, 2]]))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(R[i, i] - R[j, j] - R[k, k] + 1) * 2
    q = [0, 0, 0, 0]
    q[i] = s / 4
    q[j] = (R[j, i] + R[i, j]) / s
    q[k] = (R[k, i] + R[i, k]) / s
    q[3] = (R[k, j] - R[j, k]) / s
    return q


def scan_scene():
    txt = io.open(SCENE, encoding='utf-8').read()
    parts = re.split(r'^--- !u!(\d+) &(-?\d+)[^\n]*\n', txt, flags=re.M)
    go, tf, mf, mr, mc, gr = {}, {}, {}, {}, {}, []
    mgr = None
    for i in range(1, len(parts), 3):
        typ, fid, body = int(parts[i]), int(parts[i + 1]), parts[i + 2]
        if typ == 1:
            m = re.search(r'm_Layer: (\d+)\n\s+m_Name: ([^\n]*)\n\s+m_TagString: ([^\n]*)\n(?:.*\n)*?\s+m_IsActive: (\d)', body)
            go[fid] = {'layer': int(m.group(1)), 'name': m.group(2).strip(), 'tag': m.group(3).strip(), 'active': int(m.group(4))}
        elif typ == 4:
            tf[fid] = {'go': int(re.search(r'm_GameObject: \{fileID: (\d+)', body).group(1)),
                       'q': vec(re.search(r'm_LocalRotation: (\{[^}]*\})', body).group(1), 'xyzw'),
                       'p': vec(re.search(r'm_LocalPosition: (\{[^}]*\})', body).group(1)),
                       's': vec(re.search(r'm_LocalScale: (\{[^}]*\})', body).group(1)),
                       'father': int(re.search(r'm_Father: \{fileID: (-?\d+)', body).group(1))}
        elif typ == 33:
            mg_ = re.search(r'm_Mesh: \{[^}]*guid: (\w+)', body)
            if mg_:
                mf[int(re.search(r'm_GameObject: \{fileID: (\d+)', body).group(1))] = mg_.group(1)
        elif typ == 23:
            g = int(re.search(r'm_GameObject: \{fileID: (\d+)', body).group(1))
            mm_ = re.search(r'm_Materials:\n\s+- \{[^}]*guid: (\w+)', body)
            mr[g] = (fid, mm_.group(1) if mm_ else None)
        elif typ == 64:
            g = int(re.search(r'm_GameObject: \{fileID: (\d+)', body).group(1))
            mg_ = re.search(r'm_Mesh: \{[^}]*guid: (\w+)', body)
            if not mg_:
                continue
            mc[g] = (mg_.group(1), int(re.search(r'm_Convex: (\d)', body).group(1)),
                     int(re.search(r'm_IsTrigger: (\d)', body).group(1)))
        elif typ == 114:
            if 'rockMeshObject:' in body:
                gr.append((fid, int(re.search(r'm_GameObject: \{fileID: (\d+)', body).group(1)),
                           int(re.search(r'rockMeshObject: \{fileID: (\d+)', body).group(1)),
                           int(re.search(r'rockRenderer: \{fileID: (\d+)', body).group(1))))
            elif 'allGhostRocks:' in body:
                mgr = [int(x) for x in re.findall(r'\{fileID: (\d+)\}', re.search(r'allGhostRocks:\n((?:  - \{fileID: \d+\}\n)+)', body).group(1))]
                mg = re.search(r'timeBetweenSanityAssignments: ([\d.]+)', body), re.search(r'rocksToCheckPerFrame: (\d+)', body)
                mgr_cfg = {'timeBetweenSanityAssignments': float(mg[0].group(1)) if mg[0] else None, 'rocksToCheckPerFrame': int(mg[1].group(1)) if mg[1] else None}
    return go, tf, mf, mr, mc, gr, mgr, mgr_cfg


def read_mesh(path):
    d = list(yaml.load(open(path, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    vd = d['m_VertexData']
    n = vd['m_VertexCount']
    ch = vd['m_Channels']
    assert all(c['stream'] == 0 for c in ch if c['dimension'] & 15), 'mesh nhiều luồng'
    raw = np.frombuffer(bytes.fromhex(vd['_typelessdata']), dtype=np.uint8)
    stride = len(raw) // n
    rows = raw[:stride * n].reshape(n, stride)

    def chan(i):
        c = ch[i]
        dim = c['dimension'] & 15
        assert c['format'] in (0, 1), 'kênh %d không phải float32/16' % i
        w = 4 if c['format'] == 0 else 2
        return rows[:, c['offset']: c['offset'] + w * dim].copy().view(np.float32 if w == 4 else np.float16).reshape(n, dim).astype(np.float64)
    pos, uv = chan(0), chan(4)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)
    sm = d['m_SubMeshes']
    assert len(sm) == 1, 'mesh nhiều submesh'
    idx = idx[:sm[0]['indexCount']]
    tri = idx.reshape(-1, 3)[:, [0, 2, 1]]
    pos[:, 2] *= -1
    return {'pos': rnd(pos.reshape(-1).tolist(), 4), 'uv': rnd(uv[:, :2].reshape(-1).tolist(), 4), 'idx': tri.reshape(-1).tolist()}, n


def main():
    go, tf, mf, mr, mc, gr, mgr, mgr_cfg = scan_scene()
    tf_of_go = {t['go']: i for i, t in tf.items()}
    gr_by_id = {g[0]: g for g in gr}
    assert mgr, 'không thấy GhostRockManager.allGhostRocks'
    cfg = list(yaml.load(open(os.path.join(ASSETS, 'MonoBehaviour', 'GhostRockConfig.asset'), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    mats = {}

    def world(t):  # ma trận 4x4 Unity (trái tay) của Transform t
        chain = []
        while t:
            chain.append(t)
            t = tf[t]['father']
        M = np.eye(4)
        for t in reversed(chain):
            T = tf[t]
            L = np.eye(4)
            L[:3, :3] = quat_mat(T['q']) @ np.diag(T['s'])
            L[:3, 3] = T['p']
            M = M @ L
        return M

    def path(t):
        out = []
        while t:
            out.append(go[tf[t]['go']]['name'])
            t = tf[t]['father']
        return '/'.join(reversed(out))

    mesh_names = {}
    rocks = []
    for fid in mgr:
        g = gr_by_id[fid]
        mg = g[2]
        t = tf_of_go[mg]
        guid, conv, trig = mc[mg]
        assert guid == mf[mg], 'mesh va chạm khác mesh vẽ ở %s' % path(t)
        assert not conv and not trig, 'collider lồi / trigger ở %s' % path(t)
        assert go[mg]['layer'] == 7 and go[mg]['active'] == 0
        M = world(t)
        S = np.linalg.norm(M[:3, :3], axis=0)
        R = M[:3, :3] / S
        assert abs(np.linalg.det(R) - 1) < 1e-3 and np.allclose(R.T @ R, np.eye(3), atol=1e-3), 'chuỗi cha có cắt xén ở %s' % path(t)
        q = mat_quat(R)
        p = M[:3, 3]
        mname = os.path.basename(guid_path('Mesh', guid))[:-6]  # bỏ ".asset"
        mesh_names[mname] = guid
        matguid = mr[mg][1]
        mats.setdefault(matguid, os.path.basename(guid_path('Material', matguid))[:-4])
        pth = path(t)
        rocks.append({'n': go[g[1]]['name'], 'mesh': mname, 'p': rnd([p[0], p[1], -p[2]], 3), 'q': rnd([-q[0], -q[1], q[2], q[3]], 5),
                      's': rnd(S.tolist(), 4), 'zone': 'GALE_CLIFFS' if 'Gale' in mats[matguid] or 'GaleCliffs' in pth else 'THE_MARROWS'})
    mnames = sorted(mesh_names)
    for r in rocks:
        r['mesh'] = mnames.index(r['mesh'])
    meshes, nv = {}, {}
    for nm in mnames:  # R6: Gale Cliffs 35 đá dựng ở js/ghostrocks.js nên mesh GaleCliffsRock2/3/4_LOD0 cũng xuất
        meshes[nm], nv[nm] = read_mesh(guid_path('Mesh', mesh_names[nm]))
    mm = list(yaml.load(open(os.path.join(ASSETS, 'Material', 'MarrowsGhostRock_Mat.mat'), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    alb = guid_path('Texture2D', mm['m_TexEnvs']['Texture2D_9aa7ba2263944b48bbf43c218dc48459']['m_Texture']['guid'])
    im = Image.open(alb).convert('RGB')
    s = TEX_MAX / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(OUT_ART, exist_ok=True)
    tp = os.path.join(OUT_ART, 'albedo.webp')
    im.save(tp, 'WEBP', quality=80, method=6)
    # R6: GaleCliffsGhostRocks_Mat (cùng GhostObject_Shader): Albedo guid 02718bc3..., Color_9a80 = (1,1,1), không có mặt nạ thứ hai
    gm = list(yaml.load(open(os.path.join(ASSETS, 'Material', 'GaleCliffsGhostRocks_Mat.mat'), 'rb').read().split(chr(10).encode(), 3)[3], Loader=CL).values())[0]['m_SavedProperties']
    galb = guid_path('Texture2D', gm['m_TexEnvs']['Texture2D_9aa7ba2263944b48bbf43c218dc48459']['m_Texture']['guid'])
    gim = Image.open(galb).convert('RGB')
    s2 = TEX_MAX / max(gim.size)
    if s2 < 1:
        gim = gim.resize((round(gim.width * s2), round(gim.height * s2)), Image.LANCZOS)
    gp = os.path.join(OUT_ART, 'albedo_gc.webp')
    gim.save(gp, 'WEBP', quality=80, method=6)
    gc = gm['m_Colors']['Color_9a80436dfae54f168ee3b031d4a7bfcb']
    c = mm['m_Colors']['Color_9a80436dfae54f168ee3b031d4a7bfcb']
    data = {
        'src': 'Scenes/Game.unity (GhostRockManager.allGhostRocks: %d GhostRock), MonoBehaviour/GhostRockConfig.asset, Material/MarrowsGhostRock_Mat.mat' % len(rocks),
        'config': {'sanityThresholdMin': cfg['sanityThresholdMin'], 'sanityThresholdMax': cfg['sanityThresholdMax'], 'spawnStartTime': cfg['spawnStartTime'],
                   'spawnEndTime': cfg['spawnEndTime'], 'minDistanceThreshold': cfg['minDistanceThreshold'], 'maxDistanceThreshold': cfg['maxDistanceThreshold']},
        'manager': mgr_cfg,
        'material': {'name': 'MarrowsGhostRock_Mat', 'shader': 'GhostObject_Shader', 'tint': rnd([c['r'], c['g'], c['b']], 5), 'albedo': 'art/vfx/ghostrocks/albedo.webp'},
        'materialGC': {'name': 'GaleCliffsGhostRocks_Mat', 'shader': 'GhostObject_Shader', 'tint': rnd([gc['r'], gc['g'], gc['b']], 5), 'albedo': 'art/vfx/ghostrocks/albedo_gc.webp'},
        'meshNames': mnames, 'meshes': [meshes[n] for n in mnames],
        'unmanaged': {'count': sum(1 for g in gr if g[0] not in set(mgr)), 'note': 'TheMarrows/GhostRocks (1): 109 GhostRock trùng vị trí từng cái với TheMarrows/GhostRocks nhưng KHÔNG nằm trong GhostRockManager.allGhostRocks => mesh luôn tắt, không bao giờ hiện (MONSTERS.md đếm 218 = 2 x 109)'},
        'rocks': rocks,
    }
    js = '// Generated by games/dredge/tools/ghostrocks.py from Game.unity (GhostRockManager). Do not edit.\nwindow.DR_GHOSTROCKS = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    zc = {}
    for r in rocks:
        zc[(r['zone'], mnames[r['mesh']])] = zc.get((r['zone'], mnames[r['mesh']]), 0) + 1
    print('rocks %d  meshes %s  js %d KB  tex %d KB' % (len(rocks), {n: nv[n] for n in mnames}, len(js) // 1024, os.path.getsize(tp) // 1024))
    for k, v in sorted(zc.items()):
        print(' ', k, v)
    ys = [r['s'][1] for r in rocks]
    print('scale y min/max', min(ys), max(ys))


if __name__ == '__main__':
    main()
