# -*- coding: utf-8 -*-
"""Phần dùng chung của rip_map*.py: đọc cây GameObject của Unity thành hình học, rồi ghi glb.

Hình học ra theo khung glTF/three.js: x của Unity bị đảo (Unity tay trái, glTF tay phải), tam giác
đảo chiều quay cho khỏi lộn mặt. Đơn vị giữ nguyên đơn vị Unity.

Vì sao đảo x chứ không đảo z: máy ảnh PokéOne đứng phía +z Unity nhìn về -z (mặt tiền nhà quay về +z,
mặt sau bỏ trống). Đảo x giữ +z là "phía máy ảnh", nên trong three.js máy ảnh đặt ở +z nhìn về -z như
mặc định, và vật bên phải màn hình game vẫn ở bên phải.
"""
import io, json, math, os, re, shutil, struct, subprocess, tempfile

import numpy as np
import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

GAME_DATA = r'D:\pokeone-ref\extract\app\files\PokeOne_Data'
STREAMING = os.path.join(GAME_DATA, 'StreamingAssets')
MAP_BUNDLES = ['mdata'] + ['mdata%d' % i for i in range(2, 8)]
FLIP = np.diag([-1.0, 1.0, 1.0])


# ---------------------------------------------------------------- nạp bundle
def load_map_env():
    """Mọi mdata* nạp chung một env: material/texture của prefab có khi nằm ở bundle khác."""
    return UnityPy.load(*[os.path.join(STREAMING, b) for b in MAP_BUNDLES])


def prefab_index(env):
    """{tên prefab: [(đường dẫn container, PPtr GameObject)]} theo thứ tự mdata, mdata2... """
    out = {}
    for o in env.objects:
        if o.type.name != 'AssetBundle':
            continue
        for path, info in o.read().m_Container:
            if path.endswith('.prefab') and info.asset.type.name == 'GameObject':
                out.setdefault(os.path.basename(path)[:-7], []).append((path, info.asset))
    order = {'mapassets': 1}
    for i in range(2, 8):
        order['mapassets%d' % i] = i

    def rank(item):
        m = re.search(r'assetbundles/(mapassets\d*)/', item[0])
        return (order.get(m.group(1), 9) if m else 9, item[0])
    for k in out:
        out[k].sort(key=rank)
    return out


# ---------------------------------------------------------------- transform
def trs(t, pos=True, rot=True, scale=True):
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    m = np.eye(4)
    if rot:
        x, y, z, w = q.x, q.y, q.z, q.w
        m[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    if scale:
        m[:3, :3] = m[:3, :3] * np.array([s.x, s.y, s.z])
    if pos:
        m[:3, 3] = [p.x, p.y, p.z]
    return m


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ('Transform', 'RectTransform'):
            return c.component.read()


def key_of(obj):
    return (obj.assets_file.name, obj.object_reader.path_id)


class Frame:
    """Ma trận của mọi node tính từ gốc cây. Gốc chỉ giữ scale (bỏ vị trí và góc xoay): game đặt prefab
    bằng x,y,z + rx,ry,rz của MapObjectStruct, nên pivot = gốc prefab và trục = trục gốc prefab."""

    def __init__(self, root_t, keep_root=False):
        self.root = key_of(root_t)
        self.root_m = trs(root_t) if keep_root else trs(root_t, pos=False, rot=False)
        self.cache = {}

    def world(self, t):
        k = key_of(t)
        if k == self.root:
            return self.root_m
        if k not in self.cache:
            m = trs(t)
            if t.m_Father.m_PathID:
                m = self.world(t.m_Father.read()) @ m
            self.cache[k] = m
        return self.cache[k]


def mat4(m):
    return np.array([[getattr(m, 'e%d%d' % (r, c)) for c in range(4)] for r in range(4)])


# ---------------------------------------------------------------- material
_SHADER = {}


def _shader_name(mat):
    """Tên shader (đọc Shader rất chậm nên nhớ theo PPtr)."""
    sp = mat.m_Shader
    k = (mat.assets_file.name, sp.m_FileID, sp.m_PathID)
    if k not in _SHADER:
        try:
            _SHADER[k] = sp.read().m_ParsedForm.m_Name
        except Exception:
            _SHADER[k] = '?'
    return _SHADER[k]


def material_desc(mat):
    """Material Unity -> mô tả phẳng (không phụ thuộc glTF), dùng cho cả glb lẫn ảnh thu nhỏ."""
    sp = mat.m_SavedProperties
    F = {n: float(v) for n, v in sp.m_Floats}
    C = {n: c for n, c in sp.m_Colors}
    T = {n: e for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID}
    shader = _shader_name(mat)
    kw = (getattr(mat, 'm_ShaderKeywords', '') or '')
    kw = kw if isinstance(kw, str) else ' '.join(kw)
    s = shader.lower()
    d = {'name': mat.m_Name, 'shader': shader, 'tex': None, 'st': (1.0, 1.0, 0.0, 0.0),
         'color': [1.0, 1.0, 1.0, 1.0], 'mode': 'OPAQUE', 'cutoff': round(F.get('_Cutoff', 0.5), 3),
         'double': False, 'unlit': False, 'vcol': False, 'emissive': None, 'emissive_tex': None, 'extras': {}}
    main = T.get('_MainTex') or T.get('_BaseMap') or T.get('_MainTexture')
    if main is not None:
        d['tex'] = main.m_Texture
        d['st'] = (float(main.m_Scale.x), float(main.m_Scale.y), float(main.m_Offset.x), float(main.m_Offset.y))
    col = C.get('_Color') or C.get('_BaseColor') or C.get('_TintColor')
    if col is not None:
        d['color'] = [float(col.r), float(col.g), float(col.b), float(col.a)]
        if '_TintColor' in C and '_Color' not in C:  # hạt Legacy nhân đôi màu tint
            d['color'] = [min(1.0, 2 * x) for x in d['color'][:3]] + [d['color'][3]]
    if s.startswith('custom/primitive'):
        # Primitive vẽ một ô 32px của atlas ô nền '1' (64x64 ô): _TileX/_TileY = góc dưới-trái của ô (UV Unity).
        d['st'] = (1 / 64.0, 1 / 64.0, F.get('_TileX', 0.0), F.get('_TileY', 0.0))
        d['extras']['atlasCell'] = [int(round(F.get('_TileX', 0.0) * 64)), int(round(F.get('_TileY', 0.0) * 64))]
    if s == 'psx/windows':
        d['color'] = [1.0, 1.0, 1.0, 1.0]  # _Color là màu đèn cửa sổ ban đêm (MapManager.NightLights), ban ngày là ảnh gốc
        d['extras']['nightColor'] = [round(float(C['_Color'].r), 3), round(float(C['_Color'].g), 3), round(float(C['_Color'].b), 3)] if '_Color' in C else None
    mode = F.get('_Mode', 0)
    if ('cutout' in s or '_ALPHATEST_ON' in kw or ('standard' in s and mode == 1) or s.startswith('nature/tree')
            or (s == 'custom/trees' and mode == 1)):
        d['mode'] = 'MASK'
    elif ('transparent' in s or 'particle' in s or 'alpha blended' in s or '_ALPHABLEND_ON' in kw
          or '_ALPHAPREMULTIPLY_ON' in kw or ('standard' in s and mode in (2, 3)) or 'water' in s):
        d['mode'] = 'BLEND'
    if s.startswith('unlit') or 'particle' in s or s.startswith('mobile/particles') or 'skybox' in s:
        d['unlit'] = True
    if s == 'custom/tiles' or 'vertex' in s or s.endswith('colored') or 'particle' in s:
        # Custom/Tiles tô màu theo đỉnh: PaintTerrain/LoadVertexPaint và MapManager.AddColors ghi mesh.colors.
        d['vcol'] = True
    if 'additive' in s or s.endswith('/add'):
        d['extras']['additive'] = 1
    if F.get('_Cull', F.get('_CullMode', 2)) == 0 or 'particle' in s:
        d['double'] = True
    if 'water' in s:
        d['extras']['water'] = 1
        tr = F.get('_Transparency')
        if tr is not None:
            d['color'][3] = round(max(0.35, min(1.0, tr)), 3)
    if '_EMISSION' in kw and '_EmissionColor' in C:
        e = C['_EmissionColor']
        if max(e.r, e.g, e.b) > 0.01:
            d['emissive'] = [round(float(min(1.0, e.r)), 4), round(float(min(1.0, e.g)), 4), round(float(min(1.0, e.b)), 4)]
            if '_EmissionMap' in T:
                d['emissive_tex'] = T['_EmissionMap'].m_Texture
    return d


# ---------------------------------------------------------------- texture
class TexCache:
    """Giải Texture2D một lần. png(): ghi ra thư mục chung, trả tên tệp (đặt theo tên gốc)."""

    def __init__(self, out_dir, max_size=1024):
        self.out_dir, self.max_size = out_dir, max_size
        self.img, self.files, self.used_names, self.meta = {}, {}, {}, {}

    def image(self, ptr):
        tex = ptr.read()
        k = key_of(tex)
        if k not in self.img:
            im = tex.image.convert('RGBA')
            if max(im.size) > self.max_size:
                f = self.max_size / max(im.size)
                im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
            ts = tex.m_TextureSettings
            self.img[k] = im
            self.meta[k] = {'name': tex.m_Name, 'point': ts.m_FilterMode == 0,
                            'clampU': ts.m_WrapU == 1, 'clampV': ts.m_WrapV == 1,
                            'alpha': im.getchannel('A').getextrema()[0] < 250}
        return k, self.img[k], self.meta[k]

    def png(self, ptr):
        k, im, meta = self.image(ptr)
        if k not in self.files:
            base = re.sub(r'[^A-Za-z0-9_.-]+', '_', meta['name']).strip('_') or 'tex'
            name = base
            i = 2
            # So không phân biệt hoa/thường: trên Windows 'shadow' và 'Shadow' là một tệp,
            # trên Pages là hai — trùng thì tệp sau đè tệp trước và glb trỏ sai (404).
            while name.lower() in self.used_names and self.used_names[name.lower()] != k:
                name = '%s_%d' % (base, i)
                i += 1
            self.used_names[name.lower()] = k
            fn = name + '.png'
            p = os.path.join(self.out_dir, fn)
            os.makedirs(self.out_dir, exist_ok=True)
            buf = io.BytesIO()
            (im if meta['alpha'] else im.convert('RGB')).save(buf, 'PNG', optimize=True)
            data = buf.getvalue()
            if not os.path.exists(p) or open(p, 'rb').read() != data:
                with open(p, 'wb') as fh:
                    fh.write(data)
            self.files[k] = fn
        return self.files[k], meta


# ---------------------------------------------------------------- hình học
class Part:
    """Một submesh đã nướng về khung gốc (toạ độ Unity). tri: (m,3) theo chiều quay Unity."""
    __slots__ = ('mat', 'pos', 'nrm', 'uv', 'col', 'tri', 'node')

    def __init__(self, mat, pos, nrm, uv, col, tri, node):
        self.mat, self.pos, self.nrm, self.uv, self.col, self.tri, self.node = mat, pos, nrm, uv, col, tri, node


_MESH_CACHE = {}


def _builtin(kind):
    """Mesh dựng sẵn của Unity ('unity default resources' không có trong bản cài): dựng lại theo kích thước
    chuẩn của Unity. Sinh ở khung tay phải rồi đổi sang dữ liệu kiểu Unity (đảo z, sửa chiều theo pháp tuyến)."""
    P, N, U, T = [], [], [], []

    def quad(o, ax, ay, n, nu=1, nv=1):
        base = len(P)
        for j in range(nv + 1):
            for i in range(nu + 1):
                u, v = i / nu, j / nv
                P.append(np.array(o) + np.array(ax) * u + np.array(ay) * v)
                N.append(n)
                U.append((u, v))
        for j in range(nv):
            for i in range(nu):
                a = base + j * (nu + 1) + i
                T.extend([(a, a + 1, a + nu + 2), (a, a + nu + 2, a + nu + 1)])
    if kind == 10210:      # Quad 1x1, mặt nhìn về -z (Unity)
        quad((-0.5, -0.5, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    elif kind == 10209:    # Plane 10x10, lưới 10x10, mặt lên +y
        quad((-5, 0, 5), (10, 0, 0), (0, 0, -10), (0, 1, 0), 10, 10)
    elif kind == 10202:    # Cube 1x1x1
        for n in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
            n = np.array(n, float)
            a = np.roll(n, 1)
            b = np.cross(n, a)
            quad(tuple(n * 0.5 - a * 0.5 - b * 0.5), tuple(a), tuple(b), tuple(n))
    elif kind in (10206, 10207):  # Cylinder r=0.5 cao 2 / Sphere r=0.5
        seg, rings = 24, (1 if kind == 10206 else 12)
        for k in range(seg):
            a0, a1 = 2 * np.pi * k / seg, 2 * np.pi * (k + 1) / seg
            if kind == 10206:
                base = len(P)
                for a in (a0, a1):
                    c, s_ = np.cos(a), np.sin(a)
                    P.extend([(0.5 * c, -1, 0.5 * s_), (0.5 * c, 1, 0.5 * s_)])
                    N.extend([(c, 0, s_)] * 2)
                    U.extend([(a / (2 * np.pi), 0), (a / (2 * np.pi), 1)])
                T.extend([(base, base + 1, base + 3), (base, base + 3, base + 2)])
                for y, sgn in ((1, 1), (-1, -1)):
                    base = len(P)
                    P.extend([(0, y, 0), (0.5 * np.cos(a0), y, 0.5 * np.sin(a0)), (0.5 * np.cos(a1), y, 0.5 * np.sin(a1))])
                    N.extend([(0, sgn, 0)] * 3)
                    U.extend([(0.5, 0.5)] * 3)
                    T.append((base, base + 2, base + 1) if sgn > 0 else (base, base + 1, base + 2))
            else:
                for r in range(rings):
                    t0, t1 = np.pi * r / rings, np.pi * (r + 1) / rings
                    base = len(P)
                    for t in (t0, t1):
                        for a in (a0, a1):
                            v = (np.sin(t) * np.cos(a), np.cos(t), np.sin(t) * np.sin(a))
                            P.append(tuple(0.5 * x for x in v))
                            N.append(v)
                            U.append((a / (2 * np.pi), 1 - t / np.pi))
                    T.extend([(base, base + 1, base + 3), (base, base + 3, base + 2)])
    else:
        return None
    pos = np.array(P, float) * [1, 1, -1]
    nrm = np.array(N, float) * [1, 1, -1]
    tri = np.array(T, np.int64)[:, ::-1]
    # Sửa chiều từng tam giác theo pháp tuyến: với dữ liệu kiểu Unity, sau khi soi gương + đảo chiều lúc ghi
    # glTF, tam giác đúng khi cross(b-a, c-a) cùng hướng pháp tuyến (tính trên toạ độ Unity).
    a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    face = np.cross(b - a, c - a)
    wrong = (face * nrm[tri[:, 0]]).sum(1) < 0
    tri[wrong] = tri[wrong][:, ::-1]
    return pos, nrm, np.array(U, float), None, [tri], None, None


def mesh_ptr_arrays(owner, mptr):
    """Mesh qua PPtr; mesh dựng sẵn của Unity thì dựng lại."""
    if mptr.m_FileID:
        ext = owner.assets_file.externals[mptr.m_FileID - 1].path
        if 'unity default resources' in ext:
            k = ('builtin', mptr.m_PathID)
            if k not in _MESH_CACHE:
                _MESH_CACHE[k] = _builtin(mptr.m_PathID)
            return _MESH_CACHE[k]
    return mesh_arrays(mptr.read())


def mesh_arrays(me):
    k = key_of(me)
    if k not in _MESH_CACHE:
        h = MeshHandler(me)
        h.process()
        n = h.m_VertexCount
        pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
        nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] if h.m_Normals else None
        uv = np.array(h.m_UV0, dtype=np.float64).reshape(n, -1)[:, :2] if h.m_UV0 else None
        col = None
        if h.m_Colors:
            col = np.array(h.m_Colors, dtype=np.float64).reshape(n, -1)
            if col.max() > 1.001:
                col = col / 255.0
            if col.shape[1] == 3:
                col = np.hstack([col, np.ones((n, 1))])
        subs = [np.array(t, dtype=np.int64).reshape(-1, 3) for t in h.get_triangles()]
        bw = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1) if h.m_BoneWeights else None
        bi = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1) if h.m_BoneIndices else None
        _MESH_CACHE[k] = (pos, nrm, uv, col, subs, bw, bi)
        if len(_MESH_CACHE) > 400:
            _MESH_CACHE.pop(next(iter(_MESH_CACHE)))
    return _MESH_CACHE[k]


def _lod0_renderers(go):
    """Renderer thuộc LOD1+ của LODGroup (để bỏ). Trả tập key."""
    drop = set()
    for c in go.m_Component:
        if c.component.type.name == 'LODGroup':
            tt = c.component.read_typetree()
            for lod in tt.get('m_LODs', [])[1:]:
                for r in lod.get('renderers', []):
                    pp = r.get('renderer', {})
                    if pp.get('m_PathID'):
                        drop.add(pp['m_PathID'])
    return drop


def collect(root_go, keep_root=False, skip=None):
    """Cây GameObject -> ([Part], thống kê). Bỏ GameObject/renderer đang tắt và LOD phụ.
    skip(go) -> True để bỏ cả nhánh."""
    root_t = transform_of(root_go)
    fr = Frame(root_t, keep_root)
    parts, stats = [], {'renderers': 0, 'skinned': 0, 'particles': 0, 'drop_lod': 0, 'inactive': 0}
    drop = set()
    stack = [root_go]
    while stack:
        go = stack.pop()
        if not go.m_IsActive:
            stats['inactive'] += 1
            continue
        if skip is not None and skip(go):
            continue
        drop |= _lod0_renderers(go)
        comps = {}
        for c in go.m_Component:
            comps.setdefault(c.component.type.name, c.component)
        t = transform_of(go)
        stack.extend(ch.read().m_GameObject.read() for ch in t.m_Children)
        if 'ParticleSystemRenderer' in comps:
            stats['particles'] += 1
        for rtype in ('MeshRenderer', 'SkinnedMeshRenderer'):
            if rtype not in comps:
                continue
            rp = comps[rtype]
            if rp.m_PathID in drop:
                stats['drop_lod'] += 1
                continue
            r = rp.read()
            if not r.m_Enabled:
                continue
            if rtype == 'MeshRenderer':
                mf = comps.get('MeshFilter')
                if mf is None:
                    continue
                mfr = mf.read()
                mptr = mfr.m_Mesh
                if not mptr.m_PathID:
                    continue
                arr = mesh_ptr_arrays(mfr, mptr)
                if arr is None:
                    stats['unknown_builtin'] = stats.get('unknown_builtin', 0) + 1
                    continue
                m = fr.world(t)
                pos, nrm, uv, col, subs, _, _ = arr
                P = pos @ m[:3, :3].T + m[:3, 3]
                N = None
                if nrm is not None:
                    N = nrm @ np.linalg.inv(m[:3, :3])
                    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
                flip = np.linalg.det(m[:3, :3]) < 0
            else:
                if not r.m_Mesh.m_PathID:
                    continue
                me = r.m_Mesh.read()
                pos, nrm, uv, col, subs, bw, bi = mesh_arrays(me)
                binds = [mat4(b) for b in me.m_BindPose]
                bones = []
                for i, b in enumerate(r.m_Bones):
                    wb = fr.world(b.read()) if b.m_PathID else fr.world(t)
                    bones.append(wb @ binds[i] if i < len(binds) else wb)
                if not bones:
                    bones = [fr.world(t)]
                n = len(pos)
                if bw is None or bi is None:
                    B = np.repeat(bones[0][None], n, 0)
                else:
                    ix = np.clip(bi[:, :bw.shape[1]], 0, len(bones) - 1)
                    B = (np.stack(bones)[ix] * bw[:, :, None, None]).sum(1)
                P = np.einsum('nij,nj->ni', B, np.c_[pos, np.ones(n)])[:, :3]
                N = None
                if nrm is not None:
                    N = np.einsum('nij,nj->ni', B[:, :3, :3], nrm)
                    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
                flip = False
                stats['skinned'] += 1
            stats['renderers'] += 1
            mats = list(r.m_Materials)
            for i, tris in enumerate(subs):
                if not len(tris):
                    continue
                if i >= len(mats) or not mats[i].m_PathID:
                    continue
                tri = tris[:, ::-1] if flip else tris
                try:
                    mat = mats[i].read()
                except Exception:
                    stats['missing_mat'] = stats.get('missing_mat', 0) + 1
                    continue
                parts.append(Part(mat, P, N, uv, col, tri, go.m_Name))
            # Thừa material so với submesh: Unity vẽ lại submesh cuối với material thừa.
            for j in range(len(subs), len(mats)):
                if mats[j].m_PathID and len(subs) and len(subs[-1]):
                    tri = subs[-1][:, ::-1] if flip else subs[-1]
                    parts.append(Part(mats[j].read(), P, N, uv, col, tri, go.m_Name))
    return parts, stats


def aabb(parts):
    """AABB khung glTF (x đã đảo) của mọi đỉnh có dùng."""
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    for p in parts:
        v = p.pos[np.unique(p.tri)] @ FLIP
        lo = np.minimum(lo, v.min(0))
        hi = np.maximum(hi, v.max(0))
    return lo, hi


# ---------------------------------------------------------------- ghi glTF
SAMPLERS = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},   # 0 lặp, mượt
            {'magFilter': 9728, 'minFilter': 9984, 'wrapS': 10497, 'wrapT': 10497},   # 1 lặp, điểm
            {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071},   # 2 kẹp, mượt
            {'magFilter': 9728, 'minFilter': 9984, 'wrapS': 33071, 'wrapT': 33071}]   # 3 kẹp, điểm


class Gltf:
    """glTF có ảnh ngoài (uri tex_prefix + tên tệp) để các prop dùng chung một bộ ảnh."""

    def __init__(self, texcache, tex_prefix='tex/'):
        self.tc, self.prefix = texcache, tex_prefix
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []
        self.materials, self.textures, self.images = [], [], []
        self.mat_index, self.tex_index, self.img_index = {}, {}, {}
        self.ext_used = set()
        self.animations = []

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, arr, ctype, typ, target=None, minmax=False):
        a = {'bufferView': self.view(np.ascontiguousarray(arr).tobytes(), target), 'componentType': ctype,
             'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = [float(x) for x in arr.min(axis=0)]
            a['max'] = [float(x) for x in arr.max(axis=0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def texture(self, ptr):
        fn, meta = self.tc.png(ptr)
        samp = (2 if meta['clampU'] and meta['clampV'] else 0) + (1 if meta['point'] else 0)
        key = (fn, samp)
        if key not in self.tex_index:
            if fn not in self.img_index:
                self.images.append({'uri': self.prefix + fn, 'name': meta['name']})
                self.img_index[fn] = len(self.images) - 1
            self.textures.append({'source': self.img_index[fn], 'sampler': samp})
            self.tex_index[key] = len(self.textures) - 1
        return self.tex_index[key], meta

    def material(self, mat):
        k = key_of(mat)
        if k in self.mat_index:
            return self.mat_index[k]
        d = material_desc(mat)
        pbr = {'metallicFactor': 0.0, 'roughnessFactor': 1.0,
               'baseColorFactor': [round(x, 4) for x in d['color'][:3]] + [round(d['color'][3], 4) if d['mode'] == 'BLEND' else 1.0]}
        m = {'name': d['name'], 'pbrMetallicRoughness': pbr}
        ex = {'shader': d['shader']}
        ex.update(d['extras'])
        mode = d['mode']
        if d['tex'] is not None:
            try:
                ti, meta = self.texture(d['tex'])
                pbr['baseColorTexture'] = {'index': ti}
                if mode == 'OPAQUE' and meta['alpha'] and 'cutout' not in d['shader'].lower():
                    pass  # Standard opaque bỏ qua alpha của ảnh, giữ nguyên như Unity
                if mode == 'MASK' and not meta['alpha']:
                    mode = 'OPAQUE'
            except Exception as e:
                ex['missingTex'] = str(e)[:80]
        if mode != 'OPAQUE':
            m['alphaMode'] = mode
            if mode == 'MASK':
                m['alphaCutoff'] = d['cutoff']
        if d['double'] or mode == 'MASK':
            m['doubleSided'] = True  # lá cây/cỏ là mặt phẳng một lớp, Unity cũng vẽ hai mặt qua shader Cutout
        if d['unlit']:
            m['extensions'] = {'KHR_materials_unlit': {}}
            self.ext_used.add('KHR_materials_unlit')
        if d['emissive']:
            m['emissiveFactor'] = d['emissive']
            if d['emissive_tex'] is not None:
                try:
                    m['emissiveTexture'] = {'index': self.texture(d['emissive_tex'])[0]}
                except Exception:
                    pass
        ex['vcol'] = int(d['vcol'])
        m['extras'] = ex
        self.materials.append(m)
        self.mat_index[k] = (len(self.materials) - 1, d)
        return self.mat_index[k]

    def add_parts(self, parts, name):
        """Gộp Part theo material, đảo trục x, đảo chiều tam giác, trả chỉ số mesh."""
        buckets = {}
        for p in parts:
            buckets.setdefault(key_of(p.mat), []).append(p)
        prims = []
        for k, group in buckets.items():
            mi, d = self.material(group[0].mat)
            sx, sy, ox, oy = d['st']
            P, N, U, C, I = [], [], [], [], []
            base = 0
            has_n = all(p.nrm is not None for p in group)
            has_uv = all(p.uv is not None for p in group) and d['tex'] is not None
            has_c = d['vcol'] and all(p.col is not None for p in group)
            for p in group:
                used = np.unique(p.tri)
                remap = np.full(len(p.pos), -1, np.int64)
                remap[used] = np.arange(len(used))
                P.append(p.pos[used] @ FLIP)
                if has_n:
                    N.append(p.nrm[used] @ FLIP)
                if has_uv:
                    uv = p.uv[used] * [sx, sy] + [ox, oy]
                    U.append(np.c_[uv[:, 0], 1.0 - uv[:, 1]])
                if has_c:
                    C.append(p.col[used])
                I.append(remap[p.tri][:, ::-1] + base)
                base += len(used)
            attrs = {'POSITION': self.accessor(np.vstack(P).astype(np.float32), 5126, 'VEC3', 34962, True)}
            if has_n:
                attrs['NORMAL'] = self.accessor(np.vstack(N).astype(np.float32), 5126, 'VEC3', 34962)
            if has_uv:
                attrs['TEXCOORD_0'] = self.accessor(np.vstack(U).astype(np.float32), 5126, 'VEC2', 34962)
            if has_c:
                cc = np.vstack(C)
                top = self.materials[mi]['extras'].get('vcolScale') or float(cc[:, :3].max())
                if top > 1.001 and 'vcolScale' in self.materials[mi]['extras']:
                    cc = cc.copy()
                    cc[:, :3] /= top
                elif top > 1.001:
                    # Màu đỉnh > 1 (PaintTerrain làm sáng tới 1.27) mà glTF/gltfpack kẹp về [0,1]:
                    # chia màu đỉnh, nhân lại vào baseColorFactor của material.
                    cc = cc.copy()
                    cc[:, :3] /= top
                    m = self.materials[mi]
                    f = m['pbrMetallicRoughness']['baseColorFactor']
                    m['pbrMetallicRoughness']['baseColorFactor'] = [round(x * top, 4) for x in f[:3]] + f[3:]
                    m['extras']['vcolScale'] = round(top, 4)
                attrs['COLOR_0'] = self.accessor(np.clip(cc, 0, 1).astype(np.float32), 5126, 'VEC4', 34962)
            idx = np.vstack(I).reshape(-1).astype(np.uint32)
            prims.append({'attributes': attrs, 'indices': self.accessor(idx, 5125, 'SCALAR', 34963), 'material': mi})
        self.meshes.append({'name': name, 'primitives': prims})
        return len(self.meshes) - 1

    def add_node(self, name, mesh=None, **kw):
        n = {'name': name}
        if mesh is not None:
            n['mesh'] = mesh
        n.update(kw)
        self.nodes.append(n)
        return len(self.nodes) - 1

    def write(self, path, roots=None, extras=None):
        g = {'asset': {'version': '2.0', 'generator': 'pokeone/tools/rip_map_core.py'},
             'scene': 0, 'scenes': [{'nodes': roots if roots is not None else list(range(len(self.nodes)))}],
             'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials,
             'textures': self.textures, 'images': self.images, 'samplers': SAMPLERS,
             'accessors': self.accessors, 'bufferViews': self.views,
             'buffers': [{'uri': os.path.basename(path)[:-5] + '.bin', 'byteLength': len(self.bin)}]}
        if self.animations:
            g['animations'] = self.animations
        if extras:
            g['scenes'][0]['extras'] = extras
        if self.ext_used:
            g['extensionsUsed'] = sorted(self.ext_used)
        if not self.textures:
            for k in ('textures', 'images', 'samplers'):
                g.pop(k)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(g, fh, separators=(',', ':'))
        with open(path[:-5] + '.bin', 'wb') as fh:
            fh.write(bytes(self.bin))


_GLTFPACK = None


def _gltfpack_cmd():
    """gltfpack 0.22.0: gọi thẳng cli.js trong bộ đệm npx (nhanh hơn npx mỗi lần ~1 s), không có thì qua npx."""
    global _GLTFPACK
    if _GLTFPACK is None:
        import glob
        node = shutil.which('node') or shutil.which('node.exe')
        for pj in glob.glob(os.path.join(os.environ.get('LOCALAPPDATA', ''), 'npm-cache', '_npx', '*', 'node_modules', 'gltfpack', 'package.json')):
            if node and '"version": "0.22.0"' in open(pj, encoding='utf-8').read():
                _GLTFPACK = [node, os.path.join(os.path.dirname(pj), 'cli.js')]
                break
        else:
            _GLTFPACK = [shutil.which('npx') or shutil.which('npx.cmd'), '-y', 'gltfpack@0.22.0']
    return _GLTFPACK


def gltfpack(src, out, extra=()):
    """-cc nén meshopt, -tr giữ uri ảnh ngoài (ảnh dùng chung ở tex/), -ke giữ extras (shader gốc, vcol,
    atlasCell, nightColor...) để mã game đọc material.userData."""
    r = subprocess.run(_gltfpack_cmd() + ['-i', src, '-o', out, '-cc', '-tr', '-ke'] + list(extra),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError('gltfpack failed for %s: %s' % (src, r.stdout.decode('utf-8', 'replace')[-400:]))


def export_parts(parts, out_glb, texcache, name, tex_prefix='tex/'):
    """[Part] -> out_glb (qua tệp .gltf tạm cạnh out_glb để uri ảnh 'tex/..' trỏ đúng lúc gltfpack đọc)."""
    g = Gltf(texcache, tex_prefix)
    g.add_node(name, g.add_parts(parts, name))
    tmp = os.path.join(os.path.dirname(out_glb), '_tmp_%s.gltf' % re.sub(r'[^A-Za-z0-9_]+', '_', name))
    g.write(tmp)
    try:
        gltfpack(tmp, out_glb)
    finally:
        for p in (tmp, tmp[:-5] + '.bin'):
            if os.path.exists(p):
                os.remove(p)
    return g
