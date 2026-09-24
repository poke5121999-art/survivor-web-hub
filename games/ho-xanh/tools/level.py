# -*- coding: utf-8 -*-
"""Rút bản đồ 3D của vùng nông Hố Xanh (Dave the Diver) thành .glb + tệp dữ liệu cho game web.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/level.py            # mọi map trong MAPS
    python games/ho-xanh/tools/level.py A01        # một map

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json).

Bản gốc là 2.5D: vách đá, đá rời là mesh 3D (shader ProjectDR/2D_Sprite_Uber, mỗi mesh 4
submesh Top/Side/Bottom/Edge), còn Dave, cá, rong là sprite/Spine phẳng. Mỗi map có hai nửa:
- Prefab AreaA/Prefabs/Map_Axx: toàn bộ phần nhìn (MeshRenderer + SpriteRenderer).
- Scene A_Scenes/Axx_*.unity: phần chơi. PolygonCollider2D tên "MapCollderObj(Clone)" là
  vách va chạm, PlayerSpawnPoint là chỗ Dave xuống nước, SpawnerChestO2 là rương oxy.

Toạ độ ra giữ đơn vị Unity (1 đơn vị = 100 px sprite của Dave). Unity là hệ tay trái, glTF
tay phải: đổi bằng z -> -z và đảo chiều tam giác. Tệp dữ liệu 2D (va chạm, điểm sinh) chỉ
dùng x, y nên không đổi gì.
"""
import io, json, math, os, re, shutil, struct, subprocess, sys, tempfile

import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT_ART = os.path.join(GAME, 'art', 'level')
OUT_DATA = os.path.join(GAME, 'data')
DTD = os.environ.get('DTD_DATA', r'D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data')
BUNDLES = os.path.join(DTD, 'StreamingAssets', 'aa', 'StandaloneWindows64')
CACHE = os.path.join(tempfile.gettempdir(), 'ho-xanh-rip')

AREA = 'Assets/Contents/PlayContents/Ingame/AreaA/Prefabs/'
SCENES = 'Assets/Scenes/InGame/001DR/A_Scenes/'
# map id -> (các prefab phần nhìn: vách Map_Axx + bãi đá 3dRock_Axx [+ khối Map_TB], scene phần chơi). Hố Xanh bản gốc đổi map mỗi ngày trong
# số này, nên game web cũng bốc ngẫu nhiên một map mỗi lần lặn.
MAPS = {
    'A01': (['Map_A01', '3dRock_A01', 'Map_TB_A01_0101'], 'A01_01_01'),
    'A02': (['Map_A02', '3dRock_A02'], 'A02_01_01'),
    'A03': (['Map_A03', '3dRock_A03', 'Map_TB_A03_0102'], 'A03_01_02'),
    'A04': (['Map_A04', '3dRock_A04'], 'A04_01_02'),
    'A05': (['Map_A05', '3dRock_A05'], 'A05_01_01'),
    'A06': (['Map_A06', '3dRock_A06'], 'A06_01_02'),
}


def load_index():
    p = os.path.join(CACHE, 'bundle_index.json')
    if not os.path.exists(p):
        raise SystemExit('chưa có %s — chạy tools/rip.py trước' % p)
    ix = json.load(open(p, encoding='utf-8'))
    return ix['path'], ix['cab']


PATHS, CABS = load_index()


def load_with_deps(asset_path):
    """Nạp bundle chứa asset_path cùng mọi bundle mà nó trỏ tới (một tầng là đủ cho map)."""
    b = PATHS[asset_path]
    env0 = UnityPy.load(os.path.join(BUNDLES, b))
    deps = set()
    for sf in env0.files.values():
        for f in sf.files.values():
            for e in getattr(f, 'externals', []):
                c = e.path.split('/')[-1].lower()
                if c in CABS and CABS[c] != b:
                    deps.add(CABS[c])
    env = UnityPy.load(*[os.path.join(BUNDLES, x) for x in [b] + sorted(deps)])
    own = {o.assets_file.name.lower() for o in env0.objects}
    return env, own


# ---------------------------------------------------------------- transforms
def trs(t):
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    x, y, z, w = q.x, q.y, q.z, q.w
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m = np.eye(4)
    m[:3, :3] = r * np.array([s.x, s.y, s.z])
    m[:3, 3] = [p.x, p.y, p.z]
    return m


def world(t, cache):
    key = (t.assets_file.name, t.object_reader.path_id)
    if key not in cache:
        m = trs(t)
        if t.m_Father.m_PathID:
            m = world(t.m_Father.read(), cache) @ m
        cache[key] = m
    return cache[key]


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ('Transform', 'RectTransform'):
            return c.component.read()


def active_chain(go):
    """GameObject và mọi cha đều đang bật — map có sẵn nhiều biến thể tắt."""
    while go is not None:
        if not go.m_IsActive:
            return False
        t = transform_of(go)
        go = t.m_Father.read().m_GameObject.read() if t.m_Father.m_PathID else None
    return True


# ---------------------------------------------------------------- GLB writer
class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []
        self.materials, self.textures, self.images = [], [], []
        self.mat_index, self.mesh_index = {}, {}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, arr, ctype, typ, target, minmax=False):
        a = {'bufferView': self.view(arr.tobytes(), target), 'componentType': ctype,
             'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = arr.min(axis=0).tolist()
            a['max'] = arr.max(axis=0).tolist()
        self.accessors.append(a)
        return len(self.accessors) - 1

    def material(self, mat):
        key = (mat.assets_file.name, mat.object_reader.path_id)
        if key in self.mat_index:
            return self.mat_index[key]
        tex = None
        for name, env in mat.m_SavedProperties.m_TexEnvs:
            if name == '_MainTex' and env.m_Texture.m_PathID:
                img = env.m_Texture.read().image.convert('RGBA')
                buf = io.BytesIO()
                img.save(buf, 'PNG', optimize=True)
                self.images.append({'bufferView': self.view(buf.getvalue()), 'mimeType': 'image/png',
                                    'name': env.m_Texture.read().m_Name})
                self.textures.append({'source': len(self.images) - 1, 'sampler': 0})
                tex = len(self.textures) - 1
                break
        m = {'name': mat.m_Name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1},
             'extras': {'shader': 'ProjectDR/2D_Sprite_Uber'}}
        if tex is not None:
            m['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex}
            m['alphaMode'] = 'MASK'
        self.materials.append(m)
        self.mat_index[key] = len(self.materials) - 1
        return self.mat_index[key]

    def mesh(self, me, mats):
        key = (me.assets_file.name, me.object_reader.path_id, tuple(mats))
        if key in self.mesh_index:
            return self.mesh_index[key]
        h = MeshHandler(me)
        h.process()
        n = h.m_VertexCount
        pos = np.array(h.m_Vertices, dtype=np.float32).reshape(n, -1)[:, :3] * np.array([1, 1, -1], np.float32)
        attrs = {'POSITION': self.accessor(pos, 5126, 'VEC3', 34962, True)}
        if h.m_Normals:
            nrm = np.array(h.m_Normals, dtype=np.float32).reshape(n, -1)[:, :3] * np.array([1, 1, -1], np.float32)
            attrs['NORMAL'] = self.accessor(nrm, 5126, 'VEC3', 34962)
        if h.m_UV0:
            uv = np.array(h.m_UV0, dtype=np.float32).reshape(n, -1)[:, :2].copy()
            uv[:, 1] = 1 - uv[:, 1]
            attrs['TEXCOORD_0'] = self.accessor(uv, 5126, 'VEC2', 34962)
        prims = []
        for i, tris in enumerate(h.get_triangles()):
            if not len(tris) or i >= len(mats):
                continue
            idx = np.array(tris, dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
            prims.append({'attributes': attrs, 'indices': self.accessor(idx, 5125, 'SCALAR', 34963),
                          'material': mats[i]})
        self.meshes.append({'name': me.m_Name, 'primitives': prims})
        self.mesh_index[key] = len(self.meshes) - 1
        return self.mesh_index[key]

    def node(self, name, m, mesh=None):
        flip = np.diag([1, 1, -1, 1])
        g = flip @ m @ flip
        n = {'name': name, 'matrix': g.T.reshape(-1).tolist()}
        if mesh is not None:
            n['mesh'] = mesh
        self.nodes.append(n)

    def write(self, path):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'ho-xanh/tools/level.py'},
            'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
            'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials,
            'textures': self.textures, 'images': self.images,
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
            'accessors': self.accessors, 'bufferViews': self.views,
            'buffers': [{'byteLength': len(self.bin)}],
        }
        js = json.dumps(gltf, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)


# ---------------------------------------------------------------- export
def prefab_objects(env, path):
    """Mọi component trong cây của prefab path. Sáu map Map_A0x nằm chung MỘT bundle, nên
    phải đi từ GameObject gốc xuống chứ không lấy cả tệp."""
    root = None
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k == path and ptr.asset.type.name == 'GameObject':
                    root = ptr.asset.read()
            break
    stack, out = [root], []
    while stack:
        go = stack.pop()
        for c in go.m_Component:
            out.append(c.component)
            if c.component.type.name in ('Transform', 'RectTransform'):
                stack.extend(ch.read().m_GameObject.read() for ch in c.component.read().m_Children)
    return out


def export_visual(prefabs, glb_path):
    g, cache = Glb(), {}
    sprites, lo, hi = [], np.full(3, np.inf), np.full(3, -np.inf)
    comps = []
    for prefab in prefabs:
        path = AREA + prefab + '.prefab'
        env, _ = load_with_deps(path)
        comps += prefab_objects(env, path)
    for o in comps:
        if o.type.name == 'MeshRenderer':
            r = o.read()
            go = r.m_GameObject.read()
            if not r.m_Enabled or not active_chain(go):
                continue
            mf = [c for c in go.m_Component if c.component.type.name == 'MeshFilter']
            if not mf or not mf[0].component.read().m_Mesh.m_PathID:
                continue
            me = mf[0].component.read().m_Mesh.read()
            mats = [g.material(m.read()) for m in r.m_Materials if m.m_PathID]
            m = world(transform_of(go), cache)
            g.node(go.m_Name, m, g.mesh(me, mats))
            c = m[:3, 3]
            lo, hi = np.minimum(lo, c), np.maximum(hi, c)
        elif o.type.name == 'SpriteRenderer':
            r = o.read()
            go = r.m_GameObject.read()
            if not r.m_Enabled or not active_chain(go) or not r.m_Sprite.m_PathID:
                continue
            sp = r.m_Sprite.read()
            m = world(transform_of(go), cache)
            name = re.sub(r'[^\w-]', '_', sp.m_Name)
            p = os.path.join(OUT_ART, 'sprites', name + '.png')
            if not os.path.exists(p):
                os.makedirs(os.path.dirname(p), exist_ok=True)
                sp.image.save(p)
            col = r.m_Color
            sprites.append({'img': 'level/sprites/%s.png' % name, 'ppu': sp.m_PixelsToUnits,
                            'w': sp.m_Rect.width, 'h': sp.m_Rect.height,
                            'pivot': [sp.m_Pivot.x, sp.m_Pivot.y], 'flip': [r.m_FlipX, r.m_FlipY],
                            'color': [col.r, col.g, col.b, col.a], 'order': r.m_SortingOrder,
                            'm': [round(v, 5) for v in m.T.reshape(-1).tolist()]})
    g.write(glb_path)
    return {'meshes': len(g.nodes), 'sprites': sprites,
            'bounds': [lo.round(2).tolist(), hi.round(2).tolist()]}


def export_play(scene):
    env, own = load_with_deps(SCENES + scene + '.unity')
    cache = {}
    walls, spawn, o2, camera = [], None, [], None
    for o in env.objects:
        if o.assets_file.name.lower() not in own:
            continue
        t = o.type.name
        if t == 'PolygonCollider2D':
            c = o.read()
            go = c.m_GameObject.read()
            if c.m_IsTrigger or not go.m_Name.startswith('MapCollderObj') or not active_chain(go):
                continue
            m = world(transform_of(go), cache)
            for path in c.m_Points.m_Paths:
                pts = [(m @ np.array([p.x + c.m_Offset.x, p.y + c.m_Offset.y, 0, 1]))[:2] for p in path]
                walls.append([[round(float(x), 3), round(float(y), 3)] for x, y in pts])
        elif t == 'GameObject':
            go = o.read()
            if go.m_Name == 'PlayerSpawnPoint':
                spawn = world(transform_of(go), cache)[:2, 3].round(3).tolist()
            elif go.m_Name == 'CameraBound':
                for comp in go.m_Component:
                    if comp.component.type.name == 'PolygonCollider2D':
                        c = comp.component.read()
                        m = world(transform_of(go), cache)
                        camera = [(m @ np.array([p.x, p.y, 0, 1]))[:2].round(3).tolist()
                                  for p in c.m_Points.m_Paths[0]]
        elif t == 'MonoBehaviour':
            try:
                mb = o.read()
                cls = mb.m_Script.read().m_ClassName
            except Exception:
                continue
            if cls == 'SpawnerChestO2':
                go = mb.m_GameObject.read()
                if active_chain(go):
                    o2.append(world(transform_of(go), cache)[:2, 3].round(3).tolist())
    return {'walls': walls, 'spawn': spawn, 'o2': o2, 'cameraBound': camera}


def main():
    ids = sys.argv[1:] or list(MAPS)
    os.makedirs(OUT_ART, exist_ok=True)
    os.makedirs(OUT_DATA, exist_ok=True)
    data_p = os.path.join(OUT_DATA, 'levels.js')
    levels = {}
    if os.path.exists(data_p):
        src = open(data_p, encoding='utf-8').read()
        levels = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    for mid in ids:
        prefab, scene = MAPS[mid]
        print('%s: %s + %s' % (mid, '+'.join(prefab), scene), flush=True)
        raw = os.path.join(CACHE, mid + '.raw.glb')
        vis = export_visual(prefab, raw)
        # Hình học chiếm ~98% tệp (18 MB cho A01); nén meshopt còn ~4 MB. three.js giải
        # bằng MeshoptDecoder (vendor/meshopt_decoder.js).
        npx = shutil.which('npx') or shutil.which('npx.cmd')
        subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', os.path.join(OUT_ART, mid + '.glb'),
                        '-cc', '-kn', '-km'], check=True, stdout=subprocess.DEVNULL)
        play = export_play(scene)
        levels[mid] = dict(glb='level/%s.glb' % mid, **vis, **play)
        kb = os.path.getsize(os.path.join(OUT_ART, mid + '.glb')) // 1024
        print('   %d mesh, %d sprite, %d vách, %d rương O2, spawn %s, glb %d KB' % (
            vis['meshes'], len(vis['sprites']), len(play['walls']), len(play['o2']), play['spawn'], kb))
    with open(data_p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/level.py — đừng sửa tay.\nwindow.HX_LEVELS = ')
        json.dump(levels, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')


if __name__ == '__main__':
    main()
