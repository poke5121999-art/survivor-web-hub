# -*- coding: utf-8 -*-
"""Bóc model trận của Pokémon PokéOne thành art/poke/<dex>.glb (+ ảnh shiny) và data/pokes.js.

    set PYTHONIOENCODING=utf-8
    python games/pokeone/tools/rip_poke.py            # cả ROSTER
    python games/pokeone/tools/rip_poke.py 1 25       # vài số dex (vẫn ghi lại pokes.js cho cả ROSTER đã có glb)

Cần `npx` (gltfpack 0.22). Tệp glb thô ghi vào %TEMP%/pokeone-rip-poke (P1_TMP để đổi). Giải thích và số đo: README-poke.md.
"""
import hashlib, io, json, os, re, shutil, struct, subprocess, sys, tempfile

import numpy as np
from PIL import Image
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

ROSTER = list(range(1, 23)) + [25, 26, 52, 53, 56, 57, 74, 75, 95,
                               161, 162, 163, 164, 165, 166, 167, 168]

# Vai trò -> số clip gốc. Bằng chứng từng dòng: README-poke.md.
ROLES = [('idle', 0), ('appear', 3), ('roar', 1), ('attack', 8), ('special', 9), ('special2', 12),
         ('hit', 13), ('hit2', 14), ('faint', 17)]

REF = r'D:\pokeone-ref'
SA = os.path.join(REF, r'extract\app\files\PokeOne_Data\StreamingAssets')
UNITY = '2018.4.36f1'
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ART = os.path.join(GAME, 'art', 'poke')
DATA_JS = os.path.join(GAME, 'data', 'pokes.js')
TMP = os.environ.get('P1_TMP') or os.path.join(tempfile.gettempdir(), 'pokeone-rip-poke')
FPS = 30
MAX_BAKE = 512
# Lưới 3DS gốc tính bằng cm (Bulbasaur cao 71,4 ở khung 0 của idle). Mọi vị trí nhân 0,01 ra mét, khớp ví dụ
# height 0.71 của Bulbasaur trong ARCH.md. Nhân thẳng vào số liệu, không đặt scale ở nút gốc: lưới skinned không nằm
# dưới nút gốc nên khối cầu cắt khung (frustum culling) của three sẽ lệch cỡ 100 lần và lưới bị cắt mất.
UNIT = 0.01
S_UNIT = np.diag([UNIT, UNIT, UNIT, 1.0])

F = np.diag([-1.0, 1.0, 1.0, 1.0])   # Unity (tay trái) -> glTF (tay phải): lật trục x, mặt model vẫn nhìn +Z


def rnd(v, n=5):
    return round(float(v), n) + 0.0


# ---------------------------------------------------------------- tra nguồn
def model_table():
    """pokemonmodels.txt (JSON có dấu phẩy thừa, byte latin-1) -> {dex: {'MaleID', 'ScaleFactor', 'Name'}}."""
    txt = io.open(os.path.join(REF, 'data', 'pokemonmodels.txt'), encoding='latin-1').read()
    txt = re.sub(r',(\s*[}\]])', r'\1', txt)
    return {p['ID']: p for p in json.loads(txt)['Pokemon']}


def model_folders():
    """paths.txt -> {modelId: (bundle, 'pokesN')}."""
    out = {}
    for line in io.open(os.path.join(REF, 'paths.txt'), encoding='utf-8'):
        b, _, p = line.rstrip('\n').split('\t')
        m = re.match(r'assets/assetbundles/(pokes\d+)/(\d+)/model\.prefab$', p)
        if m:
            out[int(m.group(2))] = (b, m.group(1))
    return out


_BUNDLE = {}


def container(bundle):
    """Nạp một bundle (giữ đúng một cái trong bộ nhớ) -> {đường dẫn container: PPtr}."""
    if bundle not in _BUNDLE:
        _BUNDLE.clear()
        env = UnityPy.load(os.path.join(SA, bundle))
        c = {}
        for o in env.objects:
            if o.type.name == 'AssetBundle':
                for k, p in o.read().m_Container:
                    c[k] = p.asset
        _BUNDLE[bundle] = c
    return _BUNDLE[bundle]


_GEN, _NODES = [], {}


def mono(ptr):
    """MonoBehaviour trong bundle -> (tên lớp, typetree). Bản IL2CPP không kèm typetree: m_Script đọc tay từ byte thô
    (fileID ở 16, pathID ở 20 — xem ARCH.md), rồi dựng typetree từ DummyDll."""
    o = ptr.deref()
    fid, pid = struct.unpack_from('<iq', o.get_raw_data(), 16)
    if fid != 0:
        return None, None
    ms = o.assets_file.objects[pid].read()
    if not _GEN:
        g = TypeTreeGenerator(UNITY)
        g.load_local_dll_folder(os.path.join(REF, 'il2cpp', 'DummyDll'))
        _GEN.append(g)
    key = (ms.m_AssemblyName, ms.m_ClassName)
    if key not in _NODES:
        _NODES[key] = _GEN[0].get_nodes_up(*key)
    return ms.m_ClassName, o.read_typetree(_NODES[key])


# ---------------------------------------------------------------- toán
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs_mat(t, q, s):
    m = np.eye(4)
    m[:3, :3] = quat_mat(q) * np.array(s)
    m[:3, 3] = t
    return m


def g_pos(v):
    return [-v[0] * UNIT, v[1] * UNIT, v[2] * UNIT]


def g_quat(v):
    return [v[0], -v[1], -v[2], v[3]]


def mat4(m):
    return np.array([[getattr(m, 'e%d%d' % (r, c)) for c in range(4)] for r in range(4)])


def hermite(keys, times, dims):
    """Đường cong Unity (khoá Hermite, dốc vô hạn = bậc thang) lấy mẫu tại times -> mảng (len(times), dims)."""
    comp = 'xyzw'[:dims] if dims > 1 else None

    def vec(k, f):
        v = k[f]
        return [v[a] for a in comp] if comp else [v]
    T = np.array([k['time'] for k in keys])
    V = np.array([vec(k, 'value') for k in keys], dtype=np.float64)
    if len(keys) == 1:
        return np.repeat(V, len(times), 0)
    Vo = np.array([vec(k, 'outSlope') for k in keys], dtype=np.float64)
    Vi = np.array([vec(k, 'inSlope') for k in keys], dtype=np.float64)
    tt = np.clip(times, T[0], T[-1])
    i = np.clip(np.searchsorted(T, tt, side='right') - 1, 0, len(T) - 2)
    dt = (T[i + 1] - T[i])[:, None]
    s = np.where(dt > 0, (tt[:, None] - T[i][:, None]) / np.where(dt > 0, dt, 1), 0)
    v0, v1, m0, m1 = V[i], V[i + 1], Vo[i], Vi[i + 1]
    step = ~np.isfinite(m0) | ~np.isfinite(m1)
    m0 = np.where(np.isfinite(m0), m0, 0) * dt
    m1 = np.where(np.isfinite(m1), m1, 0) * dt
    s2, s3 = s * s, s * s * s
    h = (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1
    return np.where(step, np.where(s >= 1, v1, v0), h)


# ---------------------------------------------------------------- 3DS TEV (PICA200)
# Bộ trộn 6 tầng của 3DS, tham số nằm trong PokeShaderReset. Nướng thành một ảnh màu: nguồn ánh sáng thay bằng hằng
# "đang được chiếu sáng" (xem README-poke.md, mục Vật liệu).
SRC_VTX, SRC_LPRI, SRC_LSEC, SRC_T0, SRC_T1, SRC_T2, SRC_T3, SRC_BUF, SRC_K, SRC_PREV = 0, 1, 2, 3, 4, 5, 6, 13, 14, 15
LIGHT_PRI = np.array([1.0, 1.0, 1.0, 1.0])
LIGHT_SEC = np.array([1.0, 0.0, 0.0, 0.0])   # .r = hệ số sáng tối (1 = phía sáng), .g = viền sáng (tắt)


def tev_sources(tev, need_alpha):
    """Tập nguồn mà kết quả cuối thật sự đọc (lần ngược từ tầng 5)."""
    n = len(tev['CombinersColorCombine'])
    used = set()
    want_c, want_a = {n - 1}, ({n - 1} if need_alpha else set())
    for i in range(n - 1, -1, -1):
        for kind, want in (('Color', want_c), ('Alpha', want_a)):
            if i not in want:
                continue
            mode = int(tev['Combiners%sCombine' % kind][i])
            nargs = 1 if mode == 0 else (3 if mode in (4, 8, 9) else 2)
            for j in range(nargs):
                src = int(tev['CombinersArgs%sSrc%d' % (kind, j)][i])
                op = int(tev['CombinersArgs%sOp%d' % (kind, j)][i])
                alpha = op in (2, 3) if kind == 'Color' else op in (0, 1)
                if src == SRC_PREV and i > 0:
                    (want_a if alpha else want_c).add(i - 1)
                elif src == SRC_BUF:
                    for k in range(i - 1, 0, -1):
                        if tev['CombinersUp%sBuff' % ('Alpha' if alpha else 'Color')][k]:
                            (want_a if alpha else want_c).add(k - 1)
                            break
                else:
                    used.add(src)
    return used


def tev_eval(tev, T, vtx, buf0):
    """T: {nguồn: mảng (N,4)} -> (N,4) màu cuối. Bộ đệm theo citra: tầng i đọc đầu ra tầng k-1 với k lớn nhất
    (k <= i-1) có cờ UpBuff; không có thì BuffColor của vật liệu."""
    n = len(tev['CombinersColorCombine'])
    N = next(iter(T.values())).shape[0] if T else (vtx.shape[0] if np.ndim(vtx) == 2 else 1)
    outs = []
    prev = np.zeros((N, 4))
    for i in range(n):
        K = tev['CombinersColor'][i]
        K = np.array([K['r'], K['g'], K['b'], K['a']])
        buf = np.zeros((N, 4))
        buf[:, :3], buf[:, 3] = buf0[:3], buf0[3]
        for k in range(1, i):
            if tev['CombinersUpColorBuff'][k]:
                buf[:, :3] = outs[k - 1][:, :3]
            if tev['CombinersUpAlphaBuff'][k]:
                buf[:, 3] = outs[k - 1][:, 3]

        def src(s):
            if s in T:
                return T[s]
            v = {SRC_VTX: vtx, SRC_LPRI: LIGHT_PRI, SRC_LSEC: LIGHT_SEC, SRC_K: K}.get(s)
            if v is not None:
                return np.broadcast_to(v, (N, 4))
            if s == SRC_BUF:
                return buf
            if s == SRC_PREV:
                return prev
            return np.zeros((N, 4))

        def color_arg(j):
            v = src(int(tev['CombinersArgsColorSrc%d' % j][i]))
            op = int(tev['CombinersArgsColorOp%d' % j][i])
            base = {0: v[:, :3], 1: v[:, :3], 2: v[:, 3:4], 3: v[:, 3:4], 4: v[:, 0:1], 5: v[:, 0:1],
                    8: v[:, 1:2], 9: v[:, 1:2], 12: v[:, 2:3], 13: v[:, 2:3]}[op]
            base = np.broadcast_to(base, (N, 3))
            return 1 - base if op in (1, 3, 5, 9, 13) else base

        def alpha_arg(j):
            v = src(int(tev['CombinersArgsAlphaSrc%d' % j][i]))
            op = int(tev['CombinersArgsAlphaOp%d' % j][i])
            base = v[:, {0: 3, 1: 3, 2: 0, 3: 0, 4: 1, 5: 1, 6: 2, 7: 2}[op]]
            return 1 - base if op % 2 else base

        def combine(mode, a, b, c):
            if mode == 0:
                return a
            if mode == 1:
                return a * b
            if mode == 2:
                return a + b
            if mode == 3:
                return a + b - 0.5
            if mode == 4:
                return a * c + b * (1 - c)
            if mode == 5:
                return a - b
            if mode in (6, 7):
                d = 4 * ((a - 0.5) * (b - 0.5))
                d = d.sum(1, keepdims=True) if d.ndim == 2 else d
                return np.broadcast_to(d, a.shape)
            if mode == 8:
                return a * b + c
            if mode == 9:
                return np.minimum(a + b, 1) * c
            raise ValueError('chế độ TEV %d' % mode)

        cm, am = int(tev['CombinersColorCombine'][i]), int(tev['CombinersAlphaCombine'][i])
        rgb = combine(cm, color_arg(0), color_arg(1), color_arg(2))
        if cm in (6, 7):
            rgb = np.broadcast_to(rgb[:, :1], (N, 3))
        a = combine(am, alpha_arg(0), alpha_arg(1), alpha_arg(2))
        out = np.empty((N, 4))
        out[:, :3] = np.clip(rgb * tev['CombinersColorScale'][i], 0, 1)
        out[:, 3] = np.clip(a * tev['CombinersAlphaScale'][i], 0, 1)
        if cm == 7:
            out[:, 3] = out[:, 0]
        outs.append(out)
        prev = out
    return prev


# ---------------------------------------------------------------- ảnh
_IMG = {}


def tex_array(t2d):
    key = (t2d.assets_file.name, t2d.object_reader.path_id)
    if key not in _IMG:
        _IMG[key] = np.asarray(t2d.image.convert('RGBA'), dtype=np.float64) / 255.0
    return _IMG[key]


def wrap(x, mirror):
    if mirror:
        y = np.mod(x, 2.0)
        return np.where(y > 1, 2 - y, y)
    return np.mod(x, 1.0)


def sample(img, s, t, mu, mv):
    """Toạ độ texture Unity (v hướng lên, sau scale/offset) -> RGBA nội suy song tuyến."""
    H, W = img.shape[:2]
    s, t = wrap(s, mu), wrap(t, mv)
    px, py = s * W - 0.5, (1 - t) * H - 0.5
    x0, y0 = np.floor(px), np.floor(py)
    fx, fy = (px - x0)[:, None], (py - y0)[:, None]
    x0, y0 = x0.astype(np.int64), y0.astype(np.int64)

    def ix(v, n, mirror):
        return np.clip(v, 0, n - 1) if mirror else np.mod(v, n)
    xa, xb = ix(x0, W, mu), ix(x0 + 1, W, mu)
    ya, yb = ix(y0, H, mv), ix(y0 + 1, H, mv)
    return (img[ya, xa] * (1 - fx) * (1 - fy) + img[ya, xb] * fx * (1 - fy)
            + img[yb, xa] * (1 - fx) * fy + img[yb, xb] * fx * fy)


# ---------------------------------------------------------------- vật liệu
class Mat:
    """Material Custom/PokemonShaderEx + PokeShaderReset của một SkinnedMeshRenderer."""

    def __init__(self, mat, tev):
        sp = mat.m_SavedProperties
        self.name = mat.m_Name
        self.F = {n: float(v) for n, v in sp.m_Floats}
        C = {n: c for n, c in sp.m_Colors}
        b = C.get('BuffColor')
        self.buf0 = np.array([b.r, b.g, b.b, b.a]) if b is not None else np.zeros(4)
        fc = C.get('FixedCol')
        self.fixed_col = np.array([fc.r, fc.g, fc.b, fc.a]) if fc is not None else np.ones(4)
        self.fixed_color = bool(int(self.F.get('FixedAttr', 0)) & (1 << 3))   # thuộc tính PICA: 3 = Color
        self.tev = tev
        self.tex = {}
        for n, e in sp.m_TexEnvs:
            m = re.match(r'_Texture(\d)$', n)
            if m and e.m_Texture.m_PathID:
                k = int(m.group(1))
                self.tex[SRC_T0 + k] = {'obj': e.m_Texture.read(), 'scale': (e.m_Scale.x, e.m_Scale.y),
                                        'offset': (e.m_Offset.x, e.m_Offset.y),
                                        'mu': bool(self.F.get('MirrorU%d' % k)), 'mv': bool(self.F.get('MirrorV%d' % k))}
        blend = self.F.get('_ColorDstFunc', 0) != 0 or self.F.get('_ColorSrcFunc', 1) != 1
        self.alpha = 'BLEND' if blend else ('MASK' if self.F.get('AlphaTestEnb') else 'OPAQUE')
        self.cutoff = max(self.F.get('AlphaTestRef', 0), 1 / 255.0) + 1e-3
        self.double = self.F.get('_Cull', 2) == 0
        self.used = tev_sources(tev, self.alpha != 'OPAQUE') & set(self.tex)
        self.rgb_used = tev_sources(tev, False)


def material_mode(m, anim_tex):
    """'texel' khi mọi ảnh cần dùng cùng scale/offset (và cùng đường cong offset) với _Texture0: nướng trên lưới
    điểm ảnh của _Texture0, giữ kiểu lặp gương. Ngược lại 'mesh': nướng trong khung UV của lưới."""
    if SRC_T0 not in m.used:
        return 'mesh'
    t0 = m.tex[SRC_T0]
    for s in m.used:
        t = m.tex[s]
        if (tuple(np.round(t['scale'], 4)) != tuple(np.round(t0['scale'], 4))
                or tuple(np.round(t['offset'], 4)) != tuple(np.round(t0['offset'], 4))
                or anim_tex.get(s) != anim_tex.get(SRC_T0)):
            return 'mesh'
    return 'texel'


def fold(i, n, how):
    """Chỉ số điểm ảnh chưa gói -> trong [0, n): 'clamp' (None = bỏ), 'repeat', 'mirror' (chu kỳ 2n)."""
    if how == 'repeat':
        return np.mod(i, n)
    if how == 'mirror':
        m = np.mod(i, 2 * n)
        return np.where(m >= n, 2 * n - 1 - m, m)
    return i


def raster_vertex_colors(P, tris, col, W, H, wu, wv):
    """Màu đỉnh nội suy trên tam giác, vẽ vào ảnh W x H -> (H*W, 4). P: toạ độ điểm ảnh (chưa gói) của từng đỉnh,
    wu/wv: kiểu gói trục ngang/dọc. Ô không tam giác nào phủ lấy màu ô lân cận (loang vài vòng), còn lại lấy trung bình."""
    acc, cnt = np.zeros((H, W, 4)), np.zeros((H, W))
    for a, b, c in tris:
        pa, pb, pc = P[a], P[b], P[c]
        x0, x1 = int(np.floor(min(pa[0], pb[0], pc[0]))), int(np.ceil(max(pa[0], pb[0], pc[0])))
        y0, y1 = int(np.floor(min(pa[1], pb[1], pc[1]))), int(np.ceil(max(pa[1], pb[1], pc[1])))
        if wu == 'clamp':
            x0, x1 = max(0, x0), min(W - 1, x1)
        if wv == 'clamp':
            y0, y1 = max(0, y0), min(H - 1, y1)
        if x1 < x0 or y1 < y0:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        px, py = xx + 0.5, yy + 0.5
        d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
        if abs(d) < 1e-12:
            continue
        la = ((pb[1] - pc[1]) * (px - pc[0]) + (pc[0] - pb[0]) * (py - pc[1])) / d
        lb = ((pc[1] - pa[1]) * (px - pc[0]) + (pa[0] - pc[0]) * (py - pc[1])) / d
        lc = 1 - la - lb
        inside = (la >= -0.02) & (lb >= -0.02) & (lc >= -0.02)
        if not inside.any():
            continue
        v = la[..., None] * col[a] + lb[..., None] * col[b] + lc[..., None] * col[c]
        ty, tx = fold(yy[inside], H, wv), fold(xx[inside], W, wu)
        np.add.at(acc, (ty, tx), v[inside])
        np.add.at(cnt, (ty, tx), 1)
    out = np.where(cnt[..., None] > 0, acc / np.maximum(cnt, 1)[..., None], np.nan)
    for _ in range(8):
        hole = np.isnan(out[..., 0])
        if not hole.any():
            break
        pad = np.pad(out, ((1, 1), (1, 1), (0, 0)), constant_values=np.nan)
        nb = np.stack([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
        k = (~np.isnan(nb[..., :1])).sum(0)
        fill = np.nan_to_num(nb).sum(0) / np.maximum(k, 1)
        grow = hole & (k[..., 0] > 0)
        out[grow] = fill[grow]
    out[np.isnan(out[..., 0])] = col.mean(0)
    return out.reshape(-1, 4)


class VtxColor:
    """Màu đỉnh của một lưới cho bộ trộn: mean khi không đổi, tam giác + UV để vẽ ra ảnh khi có đổi."""

    def __init__(self, mean, uv=None, tris=None, col=None):
        self.mean, self.uv, self.tris, self.col = mean, uv, tris, col

    def varies(self):
        return self.col is not None and np.abs(self.col - self.mean).max() > 0.02


def bake(m, mode, offsets, uv_box, vtx, shiny):
    """-> (ảnh PIL, có thay ảnh shiny không). offsets: {nguồn: (ox, oy)} của trạng thái cần nướng."""
    subst = False
    imgs = {}
    for s in m.used:
        o = m.tex[s]['obj']
        k = o.m_Name.lower()
        if shiny is not None and k in shiny:
            imgs[s] = tex_array(shiny[k])
            subst = True
        else:
            imgs[s] = tex_array(o)
    if mode == 'texel':
        H, W = imgs[SRC_T0].shape[:2]
        yy, xx = np.mgrid[0:H, 0:W]
        sn, tn = ((xx + 0.5) / W).ravel(), (1 - (yy + 0.5) / H).ravel()
        T = {}
        for s, img in imgs.items():
            T[s] = img.reshape(-1, 4) if img.shape[:2] == (H, W) else sample(img, sn, tn, False, False)
    else:
        (u0, v0), (u1, v1) = uv_box
        W = H = 8
        for s, img in imgs.items():
            sx, sy = m.tex[s]['scale']
            W = max(W, abs(sx) * (u1 - u0) * img.shape[1])
            H = max(H, abs(sy) * (v1 - v0) * img.shape[0])
        W = int(min(MAX_BAKE, 2 ** int(np.ceil(np.log2(W)))))
        H = int(min(MAX_BAKE, 2 ** int(np.ceil(np.log2(H)))))
        yy, xx = np.mgrid[0:H, 0:W]
        u = u0 + (xx.ravel() + 0.5) / W * (u1 - u0)
        v = v1 - (yy.ravel() + 0.5) / H * (v1 - v0)
        T = {}
        for s, img in imgs.items():
            t = m.tex[s]
            ox, oy = offsets.get(s, t['offset'])
            T[s] = sample(img, u * t['scale'][0] + ox, v * t['scale'][1] + oy, t['mu'], t['mv'])
    v = vtx.mean
    if SRC_VTX in m.rgb_used and vtx.varies():
        uv = vtx.uv
        if mode == 'mesh':
            P = np.c_[(uv[:, 0] - u0) / (u1 - u0) * W, (v1 - uv[:, 1]) / (v1 - v0) * H]
            wu = wv = 'clamp'
        else:
            t0 = m.tex[SRC_T0]
            ox, oy = offsets.get(SRC_T0, t0['offset'])
            P = np.c_[(uv[:, 0] * t0['scale'][0] + ox) * W, (1 - (uv[:, 1] * t0['scale'][1] + oy)) * H]
            wu, wv = ('mirror' if t0['mu'] else 'repeat'), ('mirror' if t0['mv'] else 'repeat')
        v = raster_vertex_colors(P, vtx.tris, vtx.col, W, H, wu, wv)
    out = tev_eval(m.tev, T, v, m.buf0)
    if out.shape[0] == 1:
        out = np.repeat(out, H * W, 0)
    px = np.round(out.reshape(H, W, 4) * 255).astype(np.uint8)
    img = Image.fromarray(px, 'RGBA')
    if m.alpha == 'OPAQUE':
        img = img.convert('RGB')
    return img, subst


# ---------------------------------------------------------------- GLB
class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.images, self.textures, self.samplers = [], [], [], [], []
        self.materials, self.meshes, self.nodes, self.skins, self.anims = [], [], [], [], []
        self._img = {}

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
        arr = np.ascontiguousarray(arr)
        a = {'bufferView': self.view(arr.tobytes(), target), 'componentType': ctype,
             'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            a['min'] = [float(x) for x in arr.reshape(arr.shape[0], -1).min(0)]
            a['max'] = [float(x) for x in arr.reshape(arr.shape[0], -1).max(0)]
        self.accessors.append(a)
        return len(self.accessors) - 1

    def sampler(self, ws, wt):
        s = {'magFilter': 9729, 'minFilter': 9987, 'wrapS': ws, 'wrapT': wt}
        if s not in self.samplers:
            self.samplers.append(s)
        return self.samplers.index(s)

    def texture(self, img, name, ws, wt):
        buf = io.BytesIO()
        img.save(buf, 'PNG', optimize=True)
        data = buf.getvalue()
        key = (hashlib.sha1(data).hexdigest(), ws, wt)
        if key not in self._img:
            self.images.append({'bufferView': self.view(data), 'mimeType': 'image/png', 'name': name})
            self.textures.append({'source': len(self.images) - 1, 'sampler': self.sampler(ws, wt), 'name': name})
            self._img[key] = len(self.textures) - 1
        return self._img[key]

    def write(self, path, roots):
        g = {'asset': {'version': '2.0', 'generator': 'pokeone/tools/rip_poke.py'},
             'scene': 0, 'scenes': [{'nodes': roots}], 'nodes': self.nodes, 'meshes': self.meshes,
             'materials': self.materials, 'textures': self.textures, 'images': self.images,
             'samplers': self.samplers, 'skins': self.skins, 'animations': self.anims,
             'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}]}
        g = {k: v for k, v in g.items() if v != []}
        js = json.dumps(g, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)


WRAP = {True: 33648, False: 10497}   # MIRRORED_REPEAT / REPEAT
CLAMP = 33071


# ---------------------------------------------------------------- clip
def decode_clip(ptr):
    """AnimationClip legacy -> {'len', 'loop', 'trs': {đường dẫn: {'t','r','s': mảng Unity}}, 'uv': {renderer:
    {'_TextureN': (N,2)}}}, lấy mẫu FPS khung/giây."""
    tt = ptr.read_typetree()
    L = 0.0
    for kind in ('m_RotationCurves', 'm_PositionCurves', 'm_ScaleCurves', 'm_FloatCurves', 'm_EulerCurves'):
        for c in tt[kind]:
            if c['curve']['m_Curve']:
                L = max(L, c['curve']['m_Curve'][-1]['time'])
    if tt['m_EulerCurves'] or tt['m_CompressedRotationCurves']:
        raise SystemExit('clip %s: có rãnh euler/nén, chưa hỗ trợ' % tt['m_Name'])
    n = max(1, int(round(L * FPS)))
    times = np.minimum(np.arange(n + 1) / FPS, L)
    trs = {}
    for kind, key, dims in (('m_PositionCurves', 't', 3), ('m_RotationCurves', 'r', 4), ('m_ScaleCurves', 's', 3)):
        for c in tt[kind]:
            if c['curve']['m_Curve']:
                v = hermite(c['curve']['m_Curve'], times, dims)
                if key == 'r':
                    v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
                trs.setdefault(c['path'].rstrip('/'), {})[key] = v
    uv = {}
    for c in tt['m_FloatCurves']:
        m = re.match(r'(_Texture\d)\.offset\.([xy])$', c['attribute'])
        if m and c['curve']['m_Curve']:
            d = uv.setdefault(c['path'].rstrip('/'), {}).setdefault(m.group(1), [None, None])
            d['xy'.index(m.group(2))] = hermite(c['curve']['m_Curve'], times, 1)[:, 0]
    return {'name': tt['m_Name'], 'len': float(L), 'loop': tt['m_WrapMode'] == 2, 'times': times, 'trs': trs, 'uv': uv}


def clip_digest(d):
    h = hashlib.sha1()
    for p in sorted(d['trs']):
        for k in sorted(d['trs'][p]):
            h.update(p.encode() + k.encode() + np.round(d['trs'][p][k], 4).tobytes())
    for p in sorted(d['uv']):
        for k in sorted(d['uv'][p]):
            for a in d['uv'][p][k]:
                if a is not None:
                    h.update(p.encode() + k.encode() + np.round(a, 4).tobytes())
    return h.hexdigest()


# ---------------------------------------------------------------- một loài
def export(dex, pm, folders):
    info = pm[dex]
    mid = info['MaleID']
    bundle, folder = folders[mid]
    C = container(bundle)
    pre = 'assets/assetbundles/%s/%d/' % (folder, mid)
    root = C[pre + 'model.prefab'].read()
    shiny = {k[len(pre) + 6:-4]: C[k].read() for k in C if k.startswith(pre + 'shiny/') and k.endswith('.png')}
    clip_ids = sorted(int(k[len(pre):-5]) for k in C if k.startswith(pre) and k.endswith('.anim'))
    clips = {n: decode_clip(C[pre + '%d.anim' % n]) for n in clip_ids}

    g = Glb()
    by_path, by_pid, tf_of = {}, {}, {}

    def add(t, path):
        go = t.m_GameObject.read()
        p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
        i = len(g.nodes)
        g.nodes.append({'name': go.m_Name, 'translation': [rnd(x) for x in g_pos([p.x, p.y, p.z])],
                        'rotation': [rnd(x, 7) for x in g_quat([q.x, q.y, q.z, q.w])],
                        'scale': [rnd(s.x), rnd(s.y), rnd(s.z)]})
        by_path[path], by_pid[t.object_reader.path_id], tf_of[i] = i, i, go
        kids = [add(c.read(), (path + '/' if path else '') + c.read().m_GameObject.read().m_Name) for c in t.m_Children]
        if kids:
            g.nodes[i]['children'] = kids
        return i

    add(root.m_Transform.read(), '')
    children = list(g.nodes[0].get('children', []))

    # tư thế nghỉ = khung 0 của clip idle (clip 0 thu gọn dây leo/cánh bằng scale 0; prefab để dạng bung ra)
    idle = clips.get(0)
    for path, tr in (idle['trs'] if idle else {}).items():
        i = by_path.get(path)
        if i is None:
            continue
        nd = g.nodes[i]
        if 't' in tr:
            nd['translation'] = [rnd(x) for x in g_pos(tr['t'][0])]
        if 'r' in tr:
            nd['rotation'] = [rnd(x, 7) for x in g_quat(tr['r'][0])]
        if 's' in tr:
            nd['scale'] = [rnd(x) for x in tr['s'][0]]

    def world():
        out = {}

        def walk(i, parent):
            nd = g.nodes[i]
            out[i] = parent @ trs_mat(nd['translation'], nd['rotation'], nd['scale'])
            for c in nd.get('children', []):
                walk(c, out[i])
        walk(0, np.eye(4))
        return out
    W_rest = world()

    # ---- lưới + vật liệu
    renderers = []
    for ni in children:
        go = tf_of[ni]
        smr = mb = None
        for c in go.m_Component:
            tn = c.component.type.name
            if tn == 'SkinnedMeshRenderer':
                smr = c.component.read()
            elif tn == 'MonoBehaviour':
                cls, tt = mono(c.component)
                if cls == 'PokeShaderReset':
                    mb = tt
        if smr is None:
            continue
        if not smr.m_Enabled or not go.m_IsActive:
            print('   bỏ renderer tắt', go.m_Name)
            continue
        if mb is None or len(smr.m_Materials) != 1:
            raise SystemExit('#%d %s: thiếu PokeShaderReset hoặc nhiều material (%d)' % (dex, go.m_Name, len(smr.m_Materials)))
        renderers.append((ni, go, smr, Mat(smr.m_Materials[0].read(), mb)))

    height_pts = []
    vis_nodes = {}   # tên renderer -> ([(nút, trạng thái, texture, material) của từng biến thể], {clip: [trạng thái từng khung]})
    mesh_nodes = []
    shiny_out = {}
    names_used = set()
    for ni, go, smr, m in renderers:
        me = smr.m_Mesh.read()
        h = MeshHandler(me)
        h.process()
        n = h.m_VertexCount
        pos_u = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
        nrm_u = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3]
        uv_u = np.array(h.m_UV0, dtype=np.float64).reshape(n, -1)[:, :2]
        # màu đỉnh: cờ bit 3 (Color) của FixedAttr bật thì GPU 3DS đọc hằng FixedCol thay kênh màu; bản Unity vẫn có
        # kênh màu nhưng toàn số 0. Màu đỉnh thay đổi thì vẽ ra ảnh theo UV (raster_vertex_colors).
        tris_u = np.array([t for t in h.get_triangles() if len(t)][0], dtype=np.int64).reshape(-1, 3)
        vtx = VtxColor(m.fixed_col)
        if h.m_Colors:
            col = np.array(h.m_Colors, dtype=np.float64).reshape(n, -1)
            if col.max() > 1.001:
                col = col / 255.0
            if col.shape[1] == 3:
                col = np.c_[col, np.ones(n)]
            if not m.fixed_color:
                vtx = VtxColor(col.mean(0), uv_u, tris_u, col)
        w = np.array(h.m_BoneWeights, dtype=np.float64).reshape(n, -1)
        ix = np.array(h.m_BoneIndices, dtype=np.int64).reshape(n, -1)[:, :w.shape[1]]
        if w.shape[1] < 4:
            w = np.hstack([w, np.zeros((n, 4 - w.shape[1]))])
            ix = np.hstack([ix, np.zeros((n, 4 - ix.shape[1]), np.int64)])
        w, ix = w[:, :4], ix[:, :4]
        w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
        ix[w == 0] = 0
        tris = [t for t in h.get_triangles() if len(t)]
        idx = np.array(tris[0], dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)

        pos = pos_u * [-UNIT, UNIT, UNIT]
        nrm = nrm_u * [-1, 1, 1]
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        joints = [by_pid[b.m_PathID] for b in smr.m_Bones]
        ibm = [S_UNIT @ F @ mat4(b) @ F @ np.linalg.inv(S_UNIT) for b in me.m_BindPose]
        a_pos = g.accessor(pos.astype(np.float32), 5126, 'VEC3', 34962, True)
        a_nrm = g.accessor(nrm.astype(np.float32), 5126, 'VEC3', 34962)
        a_j = g.accessor(ix.astype(np.uint16), 5123, 'VEC4', 34962)
        a_w = g.accessor(w.astype(np.float32), 5126, 'VEC4', 34962)
        a_idx = g.accessor(idx, 5125, 'SCALAR', 34963)
        skin = len(g.skins)
        g.skins.append({'joints': joints, 'skeleton': 0,
                        'inverseBindMatrices': g.accessor(np.stack([x.T for x in ibm]).reshape(-1, 16).astype(np.float32),
                                                          5126, 'MAT4')})

        # trạng thái offset UV theo thời gian của từng clip (biểu cảm mắt): khoá lượng tử 1/8, theo chu kỳ lặp
        anim_tex = {}
        for cn, d in clips.items():
            for tex, xy in d['uv'].get(go.m_Name, {}).items():
                s = SRC_T0 + int(tex[-1])
                anim_tex.setdefault(s, []).append((cn, tuple(None if a is None else tuple(np.round(a, 4)) for a in xy)))
        mode = material_mode(m, anim_tex)

        def key_of(s, ox, oy):
            t = m.tex[s]
            px, py = (2.0 if t['mu'] else 1.0), (2.0 if t['mv'] else 1.0)
            return (s, round(float(np.mod(ox, px)) * 8) / 8 % px, round(float(np.mod(oy, py)) * 8) / 8 % py)

        def state_at(d, fi):
            st = []
            for s in sorted(m.used):
                ox, oy = m.tex[s]['offset']
                xy = d['uv'].get(go.m_Name, {}).get('_Texture%d' % (s - SRC_T0))
                if xy:
                    ox = xy[0][fi] if xy[0] is not None else ox
                    oy = xy[1][fi] if xy[1] is not None else oy
                st.append(key_of(s, ox, oy))
            return tuple(st)
        rest = tuple(key_of(s, *m.tex[s]['offset']) for s in sorted(m.used))
        states = [rest]
        timeline = {}
        for cn, d in clips.items():
            seq = [state_at(d, fi) for fi in range(len(d['times']))]
            timeline[cn] = seq
            for st in seq:
                if st not in states:
                    states.append(st)

        box = (uv_u.min(0), uv_u.max(0))
        pad = (box[1] - box[0]) * 0.02 + 1e-4
        box = (box[0] - pad, box[1] + pad)
        base = m.tex[SRC_T0]['obj'].m_Name.lower() if SRC_T0 in m.tex else m.name.lower()
        variant_nodes = []
        if len(states) > 1:
            hide = g.accessor((pos.mean(0) - pos).astype(np.float32), 5126, 'VEC3', None, True)
        for k, st in enumerate(states):
            offs = {s: (ox, oy) for s, ox, oy in st}
            if mode == 'texel':
                t0 = m.tex[SRC_T0]
                ox, oy = offs.get(SRC_T0, t0['offset'])
                uv = np.c_[uv_u[:, 0] * t0['scale'][0] + ox, 1 - (uv_u[:, 1] * t0['scale'][1] + oy)]
                tex_name = base
                ws, wt = WRAP[t0['mu']], WRAP[t0['mv']]
                bake_key = (tex_name,)
            else:
                uv = np.c_[(uv_u[:, 0] - box[0][0]) / (box[1][0] - box[0][0]),
                           (box[1][1] - uv_u[:, 1]) / (box[1][1] - box[0][1])]
                tex_name = base + '_' + go.m_Name.lower() + ('_v%d' % k if k else '')
                ws = wt = CLAMP
            if mode == 'texel' and k > 0:
                ti, mi = variant_nodes[0][2], variant_nodes[0][3]
            else:
                img, _ = bake(m, mode, offs, box, vtx, None)
                if tex_name in names_used:
                    tex_name = tex_name + '_' + go.m_Name.lower()
                names_used.add(tex_name)
                ti = g.texture(img, tex_name, ws, wt)
                mat = {'name': tex_name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': ti},
                                                                  'metallicFactor': 0, 'roughnessFactor': 1}}
                if m.alpha == 'BLEND':
                    mat['alphaMode'] = 'BLEND'
                elif m.alpha == 'MASK':
                    mat['alphaMode'] = 'MASK'
                    mat['alphaCutoff'] = rnd(m.cutoff, 4)
                if m.double:
                    mat['doubleSided'] = True
                g.materials.append(mat)
                mi = len(g.materials) - 1
                simg, subst = bake(m, mode, offs, box, vtx, shiny)
                if subst:
                    shiny_out[tex_name] = simg
            prim = {'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'JOINTS_0': a_j, 'WEIGHTS_0': a_w,
                                   'TEXCOORD_0': g.accessor(uv.astype(np.float32), 5126, 'VEC2', 34962)},
                    'indices': a_idx, 'material': mi}
            mesh = {'name': go.m_Name + ('#%d' % k if k else ''), 'primitives': [prim]}
            if len(states) > 1:
                # ẩn biến thể không dùng bằng morph "co về tâm" (skinned mesh bỏ qua transform của nút, nên không
                # ẩn bằng scale nút được; GLTFLoader r140 không có KHR_node_visibility)
                prim['targets'] = [{'POSITION': hide}]
                mesh['weights'] = [0.0 if k == 0 else 1.0]
                # gltfpack bỏ mọi extras của lưới trừ targetNames: tên morph mang luôn renderer + số biến thể
                mesh['extras'] = {'targetNames': ['hide:%s:%d' % (go.m_Name, k)]}
            g.meshes.append(mesh)
            nd = len(g.nodes)
            g.nodes.append({'name': go.m_Name + ('#%d' % k if k else ''), 'mesh': len(g.meshes) - 1, 'skin': skin})
            variant_nodes.append((nd, st, ti, mi))
            mesh_nodes.append(nd)
        if len(states) > 1:
            vis_nodes[go.m_Name] = (variant_nodes, timeline)
        print('   %-18s %-5s %4d đỉnh  %s  dùng %s  trạng thái %d' % (
            go.m_Name, mode, n, m.alpha, ','.join('T%d' % (s - 3) for s in sorted(m.used)), len(states)))

        # khung bao tư thế nghỉ: đỉnh skin theo xương nghỉ (chỉ biến thể 0)
        mats = np.stack([W_rest[j] @ ibm[k] for k, j in enumerate(joints)])
        blend = (mats[ix] * w[:, :, None, None]).sum(1)
        P = np.einsum('nij,nj->ni', blend, np.c_[pos, np.ones(n)])[:, :3]
        height_pts.append(P)

    # renderer đứng ngay dưới gốc; bỏ nút renderer cũ (đã thay bằng nút biến thể)
    rend_nodes = {ni for ni, _, _, _ in renderers}
    g.nodes[0]['children'] = [c for c in children if c not in rend_nodes]
    for ni in rend_nodes:
        g.nodes[ni] = {'name': g.nodes[ni]['name'] + '_src'}
    roots = [0] + mesh_nodes

    # ---- animation
    anim_paths = {}
    for d in clips.values():
        for p, tr in d['trs'].items():
            if p in by_path:
                anim_paths.setdefault(p, set()).update(tr)
    digests, alias = {}, {}
    for cn in clip_ids:
        d = clips[cn]
        dg = clip_digest(d)
        if dg in digests:
            alias[cn] = digests[dg]
            continue
        digests[dg] = cn
        chans, samps = [], []
        times = d['times'].astype(np.float32).reshape(-1, 1)
        tin = g.accessor(times, 5126, 'SCALAR', None, True)
        tin2 = g.accessor(np.array([[0.0], [d['len']]], np.float32), 5126, 'SCALAR', None, True)
        for p, keys in sorted(anim_paths.items()):
            ni = by_path[p]
            tr = d['trs'].get(p, {})
            nd = g.nodes[ni]
            for key, path in (('t', 'translation'), ('r', 'rotation'), ('s', 'scale')):
                if key not in keys:
                    continue
                if key in tr:
                    v = tr[key]
                    if key == 't':
                        v = v * [-UNIT, UNIT, UNIT]
                    elif key == 'r':
                        v = v * [1, -1, -1, 1]
                        for i in range(1, len(v)):
                            if np.dot(v[i], v[i - 1]) < 0:
                                v[i] = -v[i]
                    if np.abs(v - v[0]).max() < 1e-6:
                        v, ti = v[:1].repeat(2, 0), tin2
                    else:
                        ti = tin
                else:
                    v, ti = np.array([nd[path], nd[path]]), tin2
                out = g.accessor(v.astype(np.float32), 5126, 'VEC4' if key == 'r' else 'VEC3')
                samps.append({'input': ti, 'output': out, 'interpolation': 'LINEAR'})
                chans.append({'sampler': len(samps) - 1, 'target': {'node': ni, 'path': path}})
        for rname, (variants, timeline) in vis_nodes.items():
            seq = timeline[cn]
            change = [0] + [i for i in range(1, len(seq)) if seq[i] != seq[i - 1]]
            t_k = np.array([[d['times'][i]] for i in change], np.float32)
            a_t = g.accessor(t_k, 5126, 'SCALAR', None, True)
            for nd_i, st, _, _ in variants:
                vals = np.array([0.0 if seq[i] == st else 1.0 for i in change], np.float32)
                samps.append({'input': a_t, 'output': g.accessor(vals, 5126, 'SCALAR'), 'interpolation': 'STEP'})
                chans.append({'sampler': len(samps) - 1, 'target': {'node': nd_i, 'path': 'weights'}})
        g.anims.append({'name': 'a%d' % cn, 'channels': chans, 'samplers': samps})

    os.makedirs(TMP, exist_ok=True)
    raw = os.path.join(TMP, '%d.raw.glb' % dex)
    g.write(raw, roots)
    out = os.path.join(ART, '%d.glb' % dex)
    gltfpack(raw, out)

    shiny_map = {}
    sdir = os.path.join(ART, 'shiny', str(dex))
    shutil.rmtree(sdir, ignore_errors=True)
    if shiny_out:
        os.makedirs(sdir)
        for name, img in sorted(shiny_out.items()):
            p = os.path.join(sdir, name + '.png')
            img.save(p, optimize=True)
            shiny_map[name] = rel(p)

    P = np.concatenate(height_pts)
    lo, hi = P.min(0), P.max(0)
    have = {cn: 'a%d' % alias.get(cn, cn) for cn in clip_ids}
    rec = {'glb': rel(out), 'scale': info.get('ScaleFactor', 1),
           'height': rnd(hi[1] - lo[1], 3),
           'clips': {role: have[n] for role, n in ROLES if n in have},
           'shiny': shiny_map}
    print('#%-3d %-11s model %4d  %5d KB  cao %.1f (y %.1f..%.1f, z %.1f..%.1f)  clip %s  trùng %s  shiny %d' % (
        dex, info['Name'], mid, os.path.getsize(out) // 1024, hi[1] - lo[1], lo[1], hi[1], lo[2], hi[2],
        ','.join(str(c) for c in clip_ids), alias, len(shiny_map)))
    return rec, info['Name']


def rel(p):
    return os.path.relpath(p, GAME).replace('\\', '/')


def gltfpack(raw, out):
    # -cc nén meshopt, -km giữ tên material (khoá shiny), -kn giữ tên nút, -ac giữ rãnh hằng (đổi clip không kẹt
    # tư thế cũ), -ke giữ extras.targetNames (tên morph biến thể mắt). Ảnh để nguyên PNG: game không có bộ giải basis.
    npx = shutil.which('npx') or shutil.which('npx.cmd')
    subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-kn', '-ac', '-ke'],
                   check=True, stdout=subprocess.DEVNULL)


def write_js(recs, names):
    lines = ['// Sinh bởi tools/rip_poke.py — đừng sửa tay. Hợp đồng: ARCH.md, số đo + bảng vai trò clip: tools/README-poke.md.',
             '// height = chiều cao khung bao ở khung 0 của clip idle, đơn vị Unity của prefab (chưa nhân scale).',
             '// Model nhìn về +Z, chân ở y = 0. clips: vai trò -> tên clip trong glb (a<số gốc>); thiếu vai trò = không có clip.',
             '// shiny: tên material/ảnh trong glb -> ảnh thay khi Pokémon là shiny.',
             'window.P1 = window.P1 || {};', 'P1.POKES = {']
    for dex in sorted(recs):
        lines.append('  %d: %s,  // %s' % (dex, json.dumps(recs[dex], ensure_ascii=False, separators=(', ', ': ')), names[dex]))
    lines.append('};')
    with open(DATA_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines) + '\n')


def main():
    pm, folders = model_table(), model_folders()
    want = [int(a) for a in sys.argv[1:]] or ROSTER
    bad = [d for d in want if d not in ROSTER]
    if bad:
        raise SystemExit('dex không có trong ROSTER: %s' % bad)
    os.makedirs(ART, exist_ok=True)
    recs, names = {}, {}
    old = os.path.join(TMP, 'records.json')
    if os.path.exists(old) and sys.argv[1:]:
        recs = {int(k): v for k, v in json.load(open(old, encoding='utf-8')).items()}
        names = {d: pm[d]['Name'] for d in recs}
    for dex in sorted(want, key=lambda d: (folders[pm[d]['MaleID']][0], d)):
        recs[dex], names[dex] = export(dex, pm, folders)
    recs = {d: r for d, r in recs.items() if d in ROSTER}
    os.makedirs(TMP, exist_ok=True)
    json.dump(recs, open(old, 'w', encoding='utf-8'))
    write_js(recs, names)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(ART) for f in fs)
    print('art/poke: %d tệp, %.1f MB' % (sum(len(fs) for _, _, fs in os.walk(ART)), total / 1e6))


if __name__ == '__main__':
    main()
