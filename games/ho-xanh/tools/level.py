# -*- coding: utf-8 -*-
"""Rút các vùng (zone) Hố Xanh của Dave the Diver thành .glb + data/zones.js cho game web.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/level.py            # mọi zone trong ZONES
    python games/ho-xanh/tools/level.py A01 B03    # vài zone

Cần bảng bundle mà rip.py đã quét (%TEMP%/ho-xanh-rip/bundle_index.json).

Mỗi zone là một scene 001DR/<vùng>_Scenes/<map>_<nối trên>_<nối dưới>[_Night].unity:
- Phần nhìn: scene chỉ có AssetReplacerLoader nạp prefab Terrains/<scene>_Terrain. Prefab này đã
  gộp sẵn vách Map_*, đá 3dRock_*, khối Map_TB_* và mọi trang trí (3dCoral, 3DSeaAnemone,
  2DWaveweed, 2DCoralSprites...) đúng như game gốc đặt, cùng hệ toạ độ với scene.
- Phần chơi: PolygonCollider2D "MapCollderObj(Clone)" là vách, SceneStartPoint/PlayerSpawnPoint là
  chỗ xuống nước, EscapePodZone là phao thoát, SpawnerChestO2 là rương oxy.
- Ánh sáng: RenderSettings (sương tuyến tính), mỗi nhóm Environment_* có một
  GlobalAmbientController + Volume URP; nhóm đang bật là thời tiết mặc định của scene.

Toạ độ giữ đơn vị Unity (1 đơn vị = 100 px sprite của Dave). Unity là hệ tay trái, glTF tay phải:
đổi bằng z -> -z và đảo chiều tam giác. Dữ liệu 2D chỉ dùng x, y nên không đổi gì.
"""
import io, json, os, re, shutil, struct, subprocess, sys, tempfile

import numpy as np
import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT_ART = os.path.join(GAME, 'art', 'level')
OUT_DATA = os.path.join(GAME, 'data')
DTD = os.environ.get('DTD_DATA', r'D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data')
BUNDLES = os.path.join(DTD, 'StreamingAssets', 'aa', 'StandaloneWindows64')
CACHE = os.path.join(tempfile.gettempdir(), 'ho-xanh-rip')

DR = 'Assets/Scenes/InGame/001DR/'
SEEWEED = 'Assets/Contents/PlayContents/Ingame/00_InGame_Common/Prefabs/Seeweed/'
# zone id -> scene. Tên scene = <map>_<mã nối trên>_<mã nối dưới>: zone dưới nối được khi mã trên
# của nó bằng mã dưới của zone trên (A03 dưới 02 -> B03/B04/B06 trên 02).
ZONES = {
    'A01': 'A_Scenes/A01_01_01', 'A02': 'A_Scenes/A02_01_01', 'A03': 'A_Scenes/A03_01_02',
    'A04': 'A_Scenes/A04_01_02', 'A05': 'A_Scenes/A05_01_01', 'A06': 'A_Scenes/A06_01_02',
    'A03N': 'A_Scenes/A03_01_02_Night', 'A04N': 'A_Scenes/A04_01_02_Night',
    'B01': 'B_Scenes/B01_01_01', 'B02': 'B_Scenes/B02_01_01', 'B03': 'B_Scenes/B03_02_02',
    'B04': 'B_Scenes/B04_02_01', 'B06': 'B_Scenes/B06_02_02', 'B04N': 'B_Scenes/B04_02_01_Night',
    'C03': 'C_Scenes/C03_01_01', 'C04': 'C_Scenes/C04_02_01',
}
# kelpColony_A06 mang SwitchReplacer trỏ tới Back_new (bản PC) / Back_new_ForSwitch: rặng tảo bẹ
# nền không nằm trong Terrain mà được thay vào lúc chạy, nên phải thêm tay.
EXTRA = {'A06': [SEEWEED + 'ALevel/Back_new.prefab']}

# Vai trò theo tên con cấp 1 của prefab Terrain. Runtime đọc vai trò từ tiền tố tên material
# ("rock:Base001_Top") vì gltfpack bỏ tên node.
ROLES = [
    (r'3dSeaAnemone', 'anemone'), (r'3dCoral', 'coral3d'), (r'2DWaveweed', 'waveweed'),
    (r'kelpColony', 'kelp'), (r'Back_new', 'back'),
    (r'Map_|3dRock|Octopus_Shortcut', 'rock'),
]
MAX_TEX = 1024


def role_of(name):
    for pat, role in ROLES:
        if re.match(pat, name, re.I):
            return role
    return 'prop'  # xác tàu, cửa, lươn vườn, bộ xương cá voi...


def load_index():
    p = os.path.join(CACHE, 'bundle_index.json')
    if not os.path.exists(p):
        raise SystemExit('chưa có %s — chạy tools/rip.py trước' % p)
    ix = json.load(open(p, encoding='utf-8'))
    return ix['path'], ix['cab']


PATHS, CABS = load_index()
_EXT = {}


def externals(b):
    if b not in _EXT:
        out = set()
        for sf in UnityPy.load(os.path.join(BUNDLES, b)).files.values():
            for f in getattr(sf, 'files', {}).values():
                for e in getattr(f, 'externals', []):
                    c = e.path.split('/')[-1].lower()
                    if c in CABS and CABS[c] != b:
                        out.add(CABS[c])
        _EXT[b] = out
    return _EXT[b]


def load_with_deps(asset_path):
    """Nạp bundle chứa asset_path cùng MỌI bundle nó trỏ tới, bắc cầu. Terrain trỏ sang material,
    material trỏ tiếp sang texture ở bundle khác: một tầng là thiếu (~100 bundle, ~190 MB)."""
    b = PATHS[asset_path]
    seen, todo = set(), [b]
    while todo:
        x = todo.pop()
        if x not in seen:
            seen.add(x)
            todo.extend(externals(x) - seen)
    env = UnityPy.load(*[os.path.join(BUNDLES, x) for x in [b] + sorted(seen - {b})])
    own = {o.assets_file.name.lower() for o in UnityPy.load(os.path.join(BUNDLES, b)).objects}
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


def parent_go(go):
    t = transform_of(go)
    return t.m_Father.read().m_GameObject.read() if t.m_Father.m_PathID else None


def active_chain(go, stop=None):
    """GameObject và mọi cha (tới stop, không tính stop) đều đang bật."""
    while go is not None and not (stop is not None and go.object_reader.path_id == stop):
        if not go.m_IsActive:
            return False
        go = parent_go(go)
    return True


def script_name(mb):
    try:
        return mb.m_Script.read().m_ClassName
    except Exception:
        return None


def mat4(m):
    return np.array([[getattr(m, 'e%d%d' % (r, c)) for c in range(4)] for r in range(4)])


def rgb(c):
    return [round(float(c['r'] if isinstance(c, dict) else c.r), 4),
            round(float(c['g'] if isinstance(c, dict) else c.g), 4),
            round(float(c['b'] if isinstance(c, dict) else c.b), 4)]


def rgba(c):
    return rgb(c) + [round(float(c.a), 4)]


# ---------------------------------------------------------------- GLB writer
class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []
        self.materials, self.textures, self.images = [], [], []
        self.mat_index, self.mesh_index, self.tex_index = {}, {}, {}

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

    def image(self, img, name, sampler=0):
        buf = io.BytesIO()
        img.save(buf, 'PNG', optimize=True)
        self.images.append({'bufferView': self.view(buf.getvalue()), 'mimeType': 'image/png', 'name': name})
        self.textures.append({'source': len(self.images) - 1, 'sampler': sampler})
        return len(self.textures) - 1

    def texture(self, ptr):
        """-> (chỉ số texture, có kênh alpha thật không). Ảnh > MAX_TEX bị thu nhỏ."""
        tex = ptr.read()
        key = (tex.assets_file.name, tex.object_reader.path_id)
        if key not in self.tex_index:
            img = tex.image.convert('RGBA')
            if max(img.size) > MAX_TEX:
                k = MAX_TEX / max(img.size)
                img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            alpha = img.getchannel('A').getextrema()[0] < 250
            self.tex_index[key] = (self.image(img, tex.m_Name), alpha)
        return self.tex_index[key]

    def material(self, mat, role):
        key = (mat.assets_file.name, mat.object_reader.path_id, role)
        if key in self.mat_index:
            return self.mat_index[key]
        sp = mat.m_SavedProperties
        F = {n: float(v) for n, v in sp.m_Floats}
        C = {n: c for n, c in sp.m_Colors}
        T = {n: e.m_Texture for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID}
        try:
            shader = mat.m_Shader.read().m_ParsedForm.m_Name
        except Exception:
            shader = '?'
        pbr = {'metallicFactor': 0, 'roughnessFactor': 1}
        m = {'name': '%s:%s' % (role, mat.m_Name), 'pbrMetallicRoughness': pbr}
        ex = {'hx': role, 'shader': shader}
        main = T.get('_MainTex') or T.get('_BaseMap')
        if main is not None:
            try:
                ti, alpha = self.texture(main)
                pbr['baseColorTexture'] = {'index': ti}
                if alpha:
                    m['alphaMode'] = 'MASK'
                    m['alphaCutoff'] = round(F.get('_Cutoff', 0.5), 3)
            except Exception as e:  # texture nằm ở bundle không nạp được
                ex['missingTex'] = str(e)[:80]
        base = C.get('_Color') or C.get('_BaseColor')
        if shader == 'ProjectDR/2D_Sprite_Uber':
            # Uber tô màu bằng cờ + tham số riêng; _DiffuseBright chỉ có tác dụng khi cờ bật.
            if F.get('_DIFFUSEBRIGHT'):
                base = C['_DiffuseBright']
            if F.get('_HSL'):
                ex['hsl'] = [round(F.get(k, 1), 3) for k in ('_Hue', '_Saturation', '_Lightness')]
            if F.get('_OVERLAYCOLOR'):
                ex['overlay'] = rgba(C['_OverlayColor'])
            if F.get('_EMISSIONCOLOR'):
                m['emissiveFactor'] = rgb(C['_EMColor'])
            if F.get('_GLOW') and T.get('_GlowMaskTex') is not None:
                try:
                    m['emissiveTexture'] = {'index': self.texture(T['_GlowMaskTex'])[0]}
                    m['emissiveFactor'] = [1, 1, 1]
                    ex['glow'] = round(F.get('_GlowIntensity', 1), 3)
                except Exception:
                    pass
            for k, n in (('_FogAmplify', 'fogAmplify'), ('_LightFactor', 'lightFactor'),
                         ('_AmbientStrength', 'ambientStrength')):
                if k in F:
                    ex[n] = round(F[k], 3)
            if F.get('_TRANSPARENT'):
                ex['transparent'] = 1
        elif shader == 'Shader Graphs/3D_GrassWave':
            # Màu rong = trộn hai màu theo chiều cao; ảnh 'Seaweed' 4x56 chỉ là khuôn trắng.
            a, b = rgb(C['Color_977930CE']), rgb(C['Color_BAF95677'])
            base = None
            pbr['baseColorFactor'] = [round((x + y) / 2, 4) for x, y in zip(a, b)] + [1]
            ex['gradient'] = [a, b]
            ex['wave'] = {k: round(v, 3) for k, v in F.items() if k.startswith('Vector1_')}
        elif shader.startswith('Custom/2D_PhysicallySeaweed'):
            ex['colors'] = [rgb(C[k]) for k in ('_Color1', '_Color2', '_Color3') if k in C]
            ex['lerps'] = [round(F[k], 3) for k in ('_ColorLerp1', '_ColorLerp2') if k in F]
            if '_Color2' in C:
                pbr['baseColorFactor'] = rgb(C['_Color2']) + [1]
        else:
            ex['colors'] = {n: rgba(c) for n, c in C.items()}
            ex['floats'] = {n: round(v, 3) for n, v in F.items() if not n.startswith('_Queue')}
        if base is not None:
            pbr['baseColorFactor'] = rgb(base) + [round(float(base.a), 4) if not F.get('_DIFFUSEBRIGHT') else 1]
        if F.get('_CullMode', 2) == 0:
            m['doubleSided'] = True
        m['extras'] = ex
        self.materials.append(m)
        self.mat_index[key] = len(self.materials) - 1
        return self.mat_index[key]

    def prim_attrs(self, pos, nrm=None, uv=None, col=None):
        attrs = {'POSITION': self.accessor(pos.astype(np.float32), 5126, 'VEC3', 34962, True)}
        if nrm is not None:
            attrs['NORMAL'] = self.accessor(nrm.astype(np.float32), 5126, 'VEC3', 34962)
        if uv is not None:
            attrs['TEXCOORD_0'] = self.accessor(uv.astype(np.float32), 5126, 'VEC2', 34962)
        if col is not None:
            attrs['COLOR_0'] = self.accessor(col.astype(np.float32), 5126, 'VEC4', 34962)
        return attrs

    def mesh(self, me, mats, role, skin=None, uid=None):
        """skin = ma trận 4x4 thế giới cho từng xương (đã nhân bindpose): nướng về tư thế đang đặt
        trong prefab, trả mesh theo toạ độ thế giới."""
        key = (me.assets_file.name, me.object_reader.path_id, tuple(mats), uid)
        if key in self.mesh_index:
            return self.mesh_index[key]
        h = MeshHandler(me)
        h.process()
        n = h.m_VertexCount
        pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
        nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] if h.m_Normals else None
        if skin is not None:
            pos, nrm = skin_vertices(h, n, pos, nrm, skin)
        flip = np.array([1, 1, -1])
        pos = pos * flip
        if nrm is not None:
            nrm = nrm * flip
        uv = None
        if h.m_UV0:
            uv = np.array(h.m_UV0, dtype=np.float32).reshape(n, -1)[:, :2].copy()
            uv[:, 1] = 1 - uv[:, 1]
        col = None
        if h.m_Colors:
            col = np.array(h.m_Colors, dtype=np.float32).reshape(n, -1)
            if col.max() > 1.001:
                col = col / 255.0
            if col.shape[1] == 3:
                col = np.hstack([col, np.ones((n, 1), np.float32)])
        attrs = self.prim_attrs(pos, nrm, uv, col)
        prims = []
        for i, tris in enumerate(h.get_triangles()):
            if not len(tris) or i >= len(mats):
                continue
            idx = np.array(tris, dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
            prims.append({'attributes': attrs, 'indices': self.accessor(idx, 5125, 'SCALAR', 34963),
                          'material': mats[i]})
        self.meshes.append({'name': me.m_Name, 'primitives': prims, 'extras': {'hx': role}})
        self.mesh_index[key] = len(self.meshes) - 1
        return self.mesh_index[key]

    def node(self, name, m, mesh, role):
        flip = np.diag([1, 1, -1, 1])
        g = flip @ m @ flip
        self.nodes.append({'name': name, 'matrix': g.T.reshape(-1).tolist(), 'mesh': mesh, 'extras': {'hx': role}})

    def write(self, path):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'ho-xanh/tools/level.py'},
            'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
            'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials,
            'textures': self.textures, 'images': self.images,
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                         {'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
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


def skin_vertices(h, n, pos, nrm, bones):
    w = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1) if h.m_BoneWeights else None
    ix = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1) if h.m_BoneIndices else None
    if w is None or ix is None:
        m = bones[0]
        return (np.c_[pos, np.ones(n)] @ m.T)[:, :3], (nrm @ m[:3, :3].T if nrm is not None else None)
    ix = np.clip(ix[:, :w.shape[1]], 0, len(bones) - 1)
    mats = np.stack(bones)[ix]                     # n x k x 4 x 4
    blend = (mats * w[:, :, None, None]).sum(1)    # n x 4 x 4
    p = np.einsum('nij,nj->ni', blend, np.c_[pos, np.ones(n)])[:, :3]
    if nrm is not None:
        nrm = np.einsum('nij,nj->ni', blend[:, :3, :3], nrm)
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    return p, nrm


# ---------------------------------------------------------------- sprites -> atlas
def sprite_quad(sp, img):
    """Bốn góc (dưới-trái, dưới-phải, trên-phải, trên-trái) theo đơn vị sprite, tính từ pivot."""
    ppu = sp.m_PixelsToUnits
    rw, rh = sp.m_Rect.width, sp.m_Rect.height
    ox = oy = 0.0
    if (round(rw), round(rh)) != img.size:  # ảnh đã bị cắt viền trong atlas gốc
        ox, oy = sp.m_RD.textureRectOffset.x, sp.m_RD.textureRectOffset.y
    x0 = (ox - sp.m_Pivot.x * rw) / ppu
    y0 = (oy - sp.m_Pivot.y * rh) / ppu
    x1, y1 = x0 + img.width / ppu, y0 + img.height / ppu
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


def pack_atlas(images, pad=2):
    """Xếp kệ theo chiều cao giảm dần. Nếu không vừa MAX_TEX thì thu nhỏ mọi ảnh cùng tỉ lệ.
    -> (ảnh atlas, {key: (u0, v0, u1, v1)})."""
    keys = sorted(images, key=lambda k: (-images[k].height, -images[k].width, k))
    scale = 1.0
    while True:
        sizes = {k: (max(1, round(images[k].width * scale)), max(1, round(images[k].height * scale))) for k in keys}
        place, x, y, row, W = {}, 0, 0, 0, MAX_TEX
        ok = True
        for k in keys:
            w, h = sizes[k][0] + 2 * pad, sizes[k][1] + 2 * pad
            if w > W:
                ok = False
                break
            if x + w > W:
                x, y, row = 0, y + row, 0
            place[k] = (x, y)
            x, row = x + w, max(row, h)
        H = y + row
        if ok and H <= MAX_TEX:
            break
        scale *= 0.92
    Hp = 1
    while Hp < H:
        Hp *= 2
    Wp = 1
    while Wp < max(x + 1 for x, _ in place.values()) + max(s[0] for s in sizes.values()) + 2 * pad and Wp < W:
        Wp *= 2
    Wp = min(max(Wp, 1), W)
    atlas = np.zeros((Hp, Wp, 4), np.uint8)
    uvs = {}
    for k in keys:
        w, h = sizes[k]
        im = images[k] if (w, h) == images[k].size else images[k].resize((w, h), Image.LANCZOS)
        a = np.pad(np.asarray(im.convert('RGBA')), ((pad, pad), (pad, pad), (0, 0)), mode='edge')
        px, py = place[k]
        atlas[py:py + h + 2 * pad, px:px + w + 2 * pad] = a
        uvs[k] = ((px + pad) / Wp, (py + pad) / Hp, (px + pad + w) / Wp, (py + pad + h) / Hp)
    return Image.fromarray(atlas, 'RGBA'), uvs, scale


# ---------------------------------------------------------------- export phần nhìn
def prefab_root(env, path):
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for k, ptr in o.read().m_Container:
                if k == path and ptr.asset.type.name == 'GameObject':
                    return ptr.asset.read()
    raise SystemExit('không thấy prefab %s' % path)


def prefab_objects(env, path):
    """Mọi component trong cây của prefab path (rip.py dùng cho rương O2, khoang cứu hộ)."""
    stack, out = [prefab_root(env, path)], []
    while stack:
        go = stack.pop()
        for c in go.m_Component:
            out.append(c.component)
            if c.component.type.name in ('Transform', 'RectTransform'):
                stack.extend(ch.read().m_GameObject.read() for ch in c.component.read().m_Children)
    return out


def walk_roles(root, top_role=None):
    """(GameObject, vai trò) cho cả cây. Vai trò lấy theo con cấp 1 của gốc."""
    out = []
    kids = [ch.read().m_GameObject.read() for ch in transform_of(root).m_Children]
    if top_role:
        kids, out = [root], []
    for k in kids:
        role = top_role or role_of(k.m_Name)
        stack = [k]
        while stack:
            go = stack.pop()
            out.append((go, role, k.m_Name))
            stack.extend(ch.read().m_GameObject.read() for ch in transform_of(go).m_Children)
    return out


def export_visual(zone, scene, glb_path):
    g, cache = Glb(), {}
    stats = {r: 0 for r in ('rock', 'coral3d', 'anemone', 'waveweed', 'kelp', 'back', 'prop', 'sprites')}
    groups, skipped, spines = {}, {}, []
    sprites, sprite_imgs, sprite_mats = [], {}, set()
    sources = [(DR + 'Terrains/%s_Terrain.prefab' % scene.split('/')[-1], None)]
    sources += [(p, 'back') for p in EXTRA.get(zone, [])]
    for path, forced in sources:
        env, _ = load_with_deps(path)
        root = prefab_root(env, path)
        for go, role, top in walk_roles(root, forced):
            if not go.m_IsActive or not active_chain(go):
                continue
            comps = {c.component.type.name: c.component for c in go.m_Component}
            mbs = [c.component.read() for c in go.m_Component if c.component.type.name == 'MonoBehaviour']
            spine = next((mb for mb in mbs if script_name(mb) == 'SkeletonAnimation'), None)
            m = world(transform_of(go), cache)
            if 'SpriteRenderer' in comps:
                r = comps['SpriteRenderer'].read()
                if not r.m_Enabled or not r.m_Sprite.m_PathID:
                    continue
                sp = r.m_Sprite.read()
                key = (sp.assets_file.name, sp.object_reader.path_id)
                try:
                    if key not in sprite_imgs:
                        sprite_imgs[key] = sp.image.convert('RGBA')
                except Exception:
                    skipped['sprite không giải được'] = skipped.get('sprite không giải được', 0) + 1
                    continue
                if r.m_DrawMode:
                    skipped['sprite sliced/tiled (vẽ như simple)'] = skipped.get('sprite sliced/tiled (vẽ như simple)', 0) + 1
                for mp in r.m_Materials:
                    if mp.m_PathID:
                        sprite_mats.add(mp.read().m_Name)
                sprites.append((key, sp, m, r.m_FlipX, r.m_FlipY, rgba(r.m_Color)))
                groups.setdefault(top, set()).add('sprites')
                continue
            if spine is not None:
                tt = spine.object_reader.read_typetree()
                try:
                    skel = spine.skeletonDataAsset.read().m_Name.replace('_SkeletonData', '')
                except Exception:
                    skel = '?'
                spines.append({'skel': skel, 'anim': tt.get('_animationName') or tt.get('AnimationName') or '',
                               'skin': tt.get('initialSkinName') or '', 'loop': bool(tt.get('loop', 1)),
                               'pos': [round(float(v), 3) for v in m[:3, 3]],
                               'm2': [round(float(m[0, 0]), 4), round(float(m[0, 1]), 4),
                                      round(float(m[1, 0]), 4), round(float(m[1, 1]), 4)]})
                groups.setdefault(top, set()).add('spine')
                continue
            if 'MeshRenderer' in comps:
                r = comps['MeshRenderer'].read()
                mf = comps.get('MeshFilter')
                if not r.m_Enabled or mf is None or not mf.read().m_Mesh.m_PathID:
                    continue
                me = mf.read().m_Mesh.read()
                mats = [g.material(x.read(), role) for x in r.m_Materials if x.m_PathID]
                g.node(go.m_Name, m, g.mesh(me, mats, role), role)
                stats[role] += 1
                groups.setdefault(top, set()).add(role)
            elif 'SkinnedMeshRenderer' in comps:
                r = comps['SkinnedMeshRenderer'].read()
                if not r.m_Enabled or not r.m_Mesh.m_PathID:
                    continue
                me = r.m_Mesh.read()
                binds = [mat4(b) for b in me.m_BindPose]
                if r.m_Bones and binds:
                    skin = [world(b.read(), cache) @ binds[i] if i < len(binds) else world(b.read(), cache)
                            for i, b in enumerate(r.m_Bones)]
                else:
                    skin = [m]
                mats = [g.material(x.read(), role) for x in r.m_Materials if x.m_PathID]
                uid = (r.assets_file.name, r.object_reader.path_id)  # mỗi renderer một tư thế riêng
                g.node(go.m_Name, np.eye(4), g.mesh(me, mats, role, skin, uid), role)
                stats[role] += 1
                groups.setdefault(top, set()).add(role)
    if sprites:
        add_sprites(g, sprites, sprite_imgs, sorted(sprite_mats))
        stats['sprites'] = len(sprites)
    g.write(glb_path)
    return stats, {k: sorted(v) for k, v in sorted(groups.items())}, skipped, spines


def add_sprites(g, sprites, imgs, src_mats):
    atlas, uvs, scale = pack_atlas(imgs)
    pos, uv, col, idx = [], [], [], []
    for i, (key, sp, m, fx, fy, color) in enumerate(sprites):
        q = sprite_quad(sp, imgs[key])
        u0, v0, u1, v1 = uvs[key]
        if fx:
            q[:, 0] = -q[:, 0]
        if fy:
            q[:, 1] = -q[:, 1]
        w = (np.c_[q, np.zeros(4), np.ones(4)] @ m.T)[:, :3] * np.array([1, 1, -1])
        pos.append(w)
        uv.append([[u0, v1], [u1, v1], [u1, v0], [u0, v0]])
        col.append([color] * 4)
        b = i * 4
        tri = [b, b + 1, b + 2, b, b + 2, b + 3]
        if (np.linalg.det(m[:3, :3]) < 0) != (fx != fy):
            tri = [b, b + 2, b + 1, b, b + 3, b + 2]
        idx += tri[::-1]  # z -> -z đảo chiều
    ti = g.image(atlas, 'deco_sprites_atlas', sampler=1)
    g.materials.append({'name': 'sprites:deco_sprites', 'alphaMode': 'MASK', 'alphaCutoff': 0.5, 'doubleSided': True,
                        'pbrMetallicRoughness': {'baseColorTexture': {'index': ti}, 'metallicFactor': 0, 'roughnessFactor': 1},
                        'extras': {'hx': 'sprites', 'shader': 'ProjectDR/2D_Sprite_Uber', 'sources': src_mats,
                                   'atlasScale': round(scale, 4)}})
    attrs = g.prim_attrs(np.concatenate(pos), None, np.array(uv, np.float32).reshape(-1, 2),
                         np.array(col, np.float32).reshape(-1, 4))
    ind = g.accessor(np.array(idx, np.uint32), 5125, 'SCALAR', 34963)
    g.meshes.append({'name': 'deco_sprites', 'primitives': [{'attributes': attrs, 'indices': ind,
                                                             'material': len(g.materials) - 1}],
                     'extras': {'hx': 'sprites'}})
    g.nodes.append({'name': 'deco_sprites', 'mesh': len(g.meshes) - 1, 'extras': {'hx': 'sprites'}})


# ---------------------------------------------------------------- export phần chơi + ánh sáng
def ambient_of(tt):
    lb = tt['lerpBoundary']
    return {'name': None, 'y0': round(lb['startPos'], 3), 'y1': round(lb['endPos'], 3),
            'curve': [[round(k['time'], 4), round(k['value'], 4)] for k in tt['fogLerpCurve']['m_Curve']],
            'fog0': rgb(tt['startFogColor']), 'fog1': rgb(tt['endFogColor']),
            'mid0': rgb(tt['startMidFogColor']), 'mid1': rgb(tt['endMidFogColor']),
            'far0': rgb(tt['startFarFogColor']), 'far1': rgb(tt['endFarFogColor']),
            'ambient': rgb(tt['ambientColor']), 'dir': rgb(tt['directionalColor']),
            'dirIntensity': round(tt['directionIntensity'], 4), 'shadowStrength': round(tt['shadowStrength'], 4),
            'multiFog': bool(tt.get('m_UseMultiFog'))}


def profile_of(pr):
    """VolumeProfile URP -> dạng phẳng. Tham số không override hoặc hiệu ứng tắt = mặc định URP."""
    comps = {}
    for cp in pr.components:
        c = cp.read()
        comps[script_name(c)] = c.object_reader.read_typetree()

    def val(cls, k, dflt):
        c = comps.get(cls)
        if not c or not c.get('active') or k not in c or not c[k]['m_OverrideState']:
            return dflt
        v = c[k]['m_Value']
        if isinstance(v, dict) and 'r' in v:
            return rgb(v)
        if isinstance(v, dict) and 'x' in v:
            return [round(v['x'], 4), round(v['y'], 4)]
        return round(float(v), 4)
    return {
        'profile': pr.m_Name,
        'bloom': {'threshold': val('Bloom', 'threshold', 0.9), 'intensity': val('Bloom', 'intensity', 0.0),
                  'scatter': val('Bloom', 'scatter', 0.7), 'tint': val('Bloom', 'tint', [1, 1, 1])},
        'vignette': {'color': val('Vignette', 'color', [0, 0, 0]), 'intensity': val('Vignette', 'intensity', 0.0),
                     'center': val('Vignette', 'center', [0.5, 0.5]), 'smoothness': val('Vignette', 'smoothness', 0.2)},
        'color': {'exposure': val('ColorAdjustments', 'postExposure', 0.0), 'contrast': val('ColorAdjustments', 'contrast', 0.0),
                  'saturation': val('ColorAdjustments', 'saturation', 0.0), 'filter': val('ColorAdjustments', 'colorFilter', [1, 1, 1]),
                  'hueShift': val('ColorAdjustments', 'hueShift', 0.0)},
        'chroma': val('ChromaticAberration', 'intensity', 0.0),
        'whiteBalance': {'temperature': val('WhiteBalance', 'temperature', 0.0), 'tint': val('WhiteBalance', 'tint', 0.0)},
    }


def volume_of(mb, go, cache):
    try:
        v = profile_of(mb.sharedProfile.read())
    except Exception:
        return None
    for c in go.m_Component:
        if c.component.type.name == 'BoxCollider':
            b = c.component.read()
            m = world(transform_of(go), cache)
            cx, cy, cz = b.m_Center.x, b.m_Center.y, b.m_Center.z
            sx, sy, sz = b.m_Size.x / 2, b.m_Size.y / 2, b.m_Size.z / 2
            pts = np.array([(m @ np.array([cx + i * sx, cy + j * sy, cz + k * sz, 1]))[:2]
                            for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)])
            v['region'] = {'minX': round(pts[:, 0].min(), 2), 'maxX': round(pts[:, 0].max(), 2),
                           'minY': round(pts[:, 1].min(), 2), 'maxY': round(pts[:, 1].max(), 2)}
    return v


def env_group(go, area):
    """Nhóm thời tiết: cha gần nhất tên Environment_*. 'Environment_A_EveningRain' -> 'EveningRain'."""
    g = go
    while g is not None:
        if g.m_Name.startswith('Environment'):
            k = re.sub(r'^Environment_?', '', g.m_Name)
            k = re.sub(r'^%s_?' % area, '', k)
            return k or 'Base', g
        g = parent_go(g)
    return re.sub(r'^GlobalFogColor_?', '', go.m_Name) or 'Base', None


def export_play(scene):
    area = scene.split('/')[-1][0]
    env, own = load_with_deps(DR + scene + '.unity')
    cache = {}
    walls, spawn, start0, o2, camera, pods = [], None, None, [], None, []
    fog, groups = None, {}
    for o in env.objects:
        if o.assets_file.name.lower() not in own:
            continue
        t = o.type.name
        if t == 'RenderSettings':
            rs = o.read_typetree()
            fog = {'start': round(rs['m_LinearFogStart'], 3), 'end': round(rs['m_LinearFogEnd'], 3),
                   'color': rgb(rs['m_FogColor']), 'mode': rs['m_FogMode'], 'on': bool(rs['m_Fog'])}
        elif t == 'PolygonCollider2D':
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
            if go.m_Name == 'PlayerSpawnPoint' and active_chain(go):
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
            except Exception:
                continue
            cls = script_name(mb)
            if cls not in ('SpawnerChestO2', 'SceneStartPoint', 'EscapePodZone', 'GlobalAmbientController',
                           'Volume', 'DynamicEnvironmentActivation') or not mb.m_GameObject.m_PathID:
                continue
            go = mb.m_GameObject.read()
            pos = world(transform_of(go), cache)[:2, 3].round(3).tolist()
            if cls == 'SpawnerChestO2' and active_chain(go):
                o2.append(pos)
            elif cls == 'SceneStartPoint' and mb.MyStartPtId == 0 and active_chain(go):
                start0 = pos
            elif cls == 'EscapePodZone' and active_chain(go):
                pods.append(pos)
            elif cls in ('GlobalAmbientController', 'Volume', 'DynamicEnvironmentActivation'):
                key, gnode = env_group(go, area)
                gr = groups.setdefault(key, {'active': None, 'ambient': None, 'volume': None,
                                             'surfaceVolume': None, 'states': None, '_node': gnode})
                inner = active_chain(go, gnode.object_reader.path_id if gnode is not None else None)
                if cls == 'GlobalAmbientController':
                    tt = o.read_typetree()
                    amb = ambient_of(tt)
                    amb['name'] = go.m_Name
                    gr['active'] = active_chain(go)
                    if gr['ambient'] is None or inner:
                        gr['ambient'] = amb
                elif cls == 'DynamicEnvironmentActivation':
                    gr['states'] = [[s['DayTime'], s['Weather']] for s in o.read_typetree()['States']]
                    if gr['active'] is None:
                        gr['active'] = active_chain(go)
                else:
                    slot = 'surfaceVolume' if 'Surface' in go.m_Name else 'volume'
                    if not inner:
                        continue
                    v = volume_of(mb, go, cache)
                    old = gr[slot]
                    # Nhiều Volume toàn cục (C: PP_D, PP_C_001): ưu tiên tên hoặc profile có 'Global'.
                    score = ('Global' in go.m_Name) * 2 + ('Global' in (v or {}).get('profile', ''))
                    if v is not None and (old is None or score > old[0]):
                        gr[slot] = (score, v)
    for gr in groups.values():
        for s in ('volume', 'surfaceVolume'):
            gr[s] = gr[s][1] if gr[s] else None
        gr.pop('_node')
    groups = {k: v for k, v in groups.items() if v['ambient'] is not None}
    # Nhóm nào sáng là do DynamicEnvironmentActivation theo (DayTime, Weather) lúc chạy, không
    # phải cờ bật trong scene: B04_02_01_Night lưu Environment_B_Day đang bật. Chọn nhóm có trạng
    # thái trời quang (Weather 0) đúng buổi: DayTime 0 cho scene ngày, 2 cho scene _Night.
    want = [2 if scene.endswith('_Night') else 0, 0]
    fit = sorted(k for k, v in groups.items() if want in (v['states'] or []))
    act = sorted(k for k, v in groups.items() if v['active'])
    note = None
    if len(act) > 1:
        note = 'nhiều nhóm đang bật: %s' % act
    pick = [k for k in fit if k in act] or [k for k in fit if not re.search('Rain|Luminous', k)] or fit or act
    if len(pick) > 1:
        pick = [k for k in pick if not re.search('Rain|Evening|Luminous', k)] or pick
    cur = pick[0] if pick else None
    light = None
    if cur:
        gr = groups.pop(cur)
        light = {'variant': cur, 'fog': fog, 'ambient': gr['ambient'], 'volume': gr['volume'],
                 'surfaceVolume': gr['surfaceVolume'], 'states': gr['states']}
    variants = {k: {'ambient': v['ambient'], 'volume': v['volume'], 'surfaceVolume': v['surfaceVolume'],
                    'states': v['states']} for k, v in sorted(groups.items())}
    return {'walls': walls, 'o2': o2, 'start': start0 or spawn, 'pods': pods, 'cameraBound': camera,
            'light': light, 'lightVariants': variants, 'note': note}


def gltfpack(raw, out):
    # Không -kn + có -mm: mọi mesh (kể cả bản sao dùng chung một mesh) cùng material gộp làm một,
    # mỗi zone chỉ còn vài chục draw call. Thiếu -mm thì 433 san hô vẫn là 433 draw call.
    # -km giữ tên material (mang vai trò), -ke giữ extras. three.js giải bằng MeshoptDecoder.
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-ke', '-mm'],
                   check=True, stdout=subprocess.DEVNULL)


def main():
    ids = sys.argv[1:] or list(ZONES)
    bad = [z for z in ids if z not in ZONES]
    if bad:
        raise SystemExit('zone không có: %s' % bad)
    os.makedirs(OUT_ART, exist_ok=True)
    data_p = os.path.join(OUT_DATA, 'zones.js')
    zones = {}
    if os.path.exists(data_p):
        src = open(data_p, encoding='utf-8').read()
        zones = json.loads(src[src.index('=') + 1:].strip().rstrip(';'))
    report = {}
    for zid in ids:
        scene = ZONES[zid]
        name = scene.split('/')[-1]
        parts = name.split('_')
        print('%s: %s' % (zid, name), flush=True)
        raw = os.path.join(CACHE, zid + '.raw.glb')
        stats, groups, skipped, spines = export_visual(zid, scene, raw)
        out = os.path.join(OUT_ART, zid + '.glb')
        gltfpack(raw, out)
        play = export_play(scene)
        pts = np.array([p for w in play['walls'] for p in w])
        z = {'id': zid, 'area': name[0], 'night': name.endswith('_Night'), 'scene': name,
             'top': parts[1], 'bottom': parts[2], 'glb': 'level/%s.glb' % zid,
             'walls': play['walls'], 'o2': play['o2'], 'start': play['start'], 'pods': play['pods'],
             'cameraBound': play['cameraBound'],
             'bounds': {'minX': round(float(pts[:, 0].min()), 3), 'maxX': round(float(pts[:, 0].max()), 3),
                        'minY': round(float(pts[:, 1].min()), 3), 'maxY': round(float(pts[:, 1].max()), 3)},
             'light': play['light'], 'lightVariants': play['lightVariants'], 'spines': spines}
        zones[zid] = z
        kb = os.path.getsize(out) // 1024
        report[zid] = dict(kb=kb, stats=stats, groups=groups, skipped=skipped, spines=len(spines), note=play['note'])
        print('   glb %d KB, %s, spine %d, vách %d, O2 %d, phao %d, start %s' % (
            kb, stats, len(spines), len(play['walls']), len(play['o2']), len(play['pods']), play['start']), flush=True)
        if skipped or play['note']:
            print('   bỏ/ghi chú:', skipped, play['note'], flush=True)
    zones = {k: zones[k] for k in ZONES if k in zones}
    with open(data_p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Sinh bởi tools/level.py — đừng sửa tay.\nwindow.HX_ZONES = ')
        json.dump(zones, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    with open(os.path.join(CACHE, 'level_report.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
