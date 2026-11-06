"""Shared helpers for World of Slime exporters: bundle loading, Unity->glTF conversion, clip decoding, GLB writer.

Coordinates: Unity is left-handed (+Y up, +Z forward). We flip X (like UnityGLTF), so the model still faces +Z
in glTF and three.js: p -> (-x, y, z), q -> (x, -y, -z, w), matrices S*M*S with S = diag(-1,1,1,1),
triangle winding reversed.
"""
import os, io, json, math, struct
import numpy as np
import UnityPy
from PIL import Image

GAME = os.environ.get('WOS_GAME', r"D:\Steam\steamapps\common\World of Slime Demo")
DATA = os.path.join(GAME, 'World of Slime_Data')
D = os.path.join(DATA, 'StreamingAssets', 'StandaloneWindows64')
REF = os.environ.get('WOS_REF', r"D:\wos-ref")              # caches + research notes, outside git
ASSETS = os.environ.get('WOS_ASSETS', r"D:\world-of-slime-assets")  # clone of poke5121999-art/world-of-slime-assets
CABMAP = os.path.join(REF, 'cache', 'cabmap.json')   # built by cabmap.py


def cab_map():
    return json.load(open(CABMAP))


def load(bundles, depth=0, skip=()):
    """Load bundles plus `depth` levels of their external CAB dependencies."""
    cm = cab_map()
    env = UnityPy.Environment(); seen = set(); todo = list(bundles)
    for _ in range(depth + 1):
        for b in todo:
            if b not in seen:
                seen.add(b); env.load_file(os.path.join(D, b))
        nxt = []
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', []):
                    q = cm.get(os.path.basename(e.path).lower())
                    if q and q not in seen and q not in skip and q not in nxt:
                        nxt.append(q)
        if not nxt:
            break
        todo = nxt
    return env, sorted(seen)


def container(env, suffix):
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            c = getattr(sf, 'container', None)
            if c:
                for k, v in c.items():
                    if k.lower().endswith(suffix.lower()):
                        return v.read()
    raise SystemExit('container entry not loaded: ' + suffix)


def cp(v): return [-v.x, v.y, v.z]
def cq(q): return [q.x, -q.y, -q.z, q.w]
S = np.diag([-1.0, 1.0, 1.0, 1.0])


def mat_of(m):
    a = np.array([[getattr(m, f'e{r}{c}') for c in range(4)] for r in range(4)], dtype=np.float64)
    return S @ a @ S


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name in ('Transform', 'RectTransform'):
            return c.component.read()


def components(go, tname):
    return [c.component.read() for c in go.m_Component if c.component.type.name == tname]


# ---------- clip decoding (Unity generic clip: streamed + dense + constant, in binding order) ----------
def decode_clip(clip):
    mc = clip.m_MuscleClip
    c = mc.m_Clip.data
    sc, dc, cc = c.m_StreamedClip, c.m_DenseClip, c.m_ConstantClip
    raw = struct.pack(f'<{len(sc.data)}I', *sc.data)
    frames, p = [], 0
    while p < len(raw):
        t, nk = struct.unpack_from('<fI', raw, p); p += 8
        keys = []
        for _ in range(nk):
            keys.append(struct.unpack_from('<i4f', raw, p)); p += 20
        frames.append((t, keys))
    ns, nd = sc.curveCount, dc.m_CurveCount
    dense = np.array(dc.m_SampleArray, dtype=np.float64).reshape(-1, nd) if nd else None
    const = np.array(cc.data, dtype=np.float64)

    def at(t):
        out = np.zeros(ns + nd + len(const))
        seg = {}
        for ft, keys in frames:
            if ft > t + 1e-6:
                break
            for k in keys:
                seg[k[0]] = (ft, k)
        for i, (ft, k) in seg.items():
            dt = t - ft if math.isfinite(ft) else 0.0
            out[i] = ((k[1] * dt + k[2]) * dt + k[3]) * dt + k[4]
        if nd:
            x = (t - dc.m_BeginTime) * dc.m_SampleRate
            i0 = int(min(max(math.floor(x), 0), len(dense) - 1)); i1 = min(i0 + 1, len(dense) - 1)
            w = min(max(x - i0, 0.0), 1.0)
            out[ns:ns + nd] = dense[i0] * (1 - w) + dense[i1] * w
        out[ns + nd:] = const
        return out
    return at, mc.m_StartTime, mc.m_StopTime, clip.m_ClipBindingConstant.genericBindings, clip.m_SampleRate or 30.0


def euler_to_q(e, order=4):
    """Unity euler curve -> quaternion. `order` = GenericBinding.customType = math::RotationOrder
    (0 XYZ, 1 XZY, 2 YZX, 3 YXZ, 4 ZXY = Unity default, 5 ZYX); the name is the order the axes are applied in.
    FBX-imported clips keep the DCC's order: World of Slime clips are 0 (XYZ, Blender), not Unity's ZXY."""
    rad = [math.radians(a) for a in e]
    qa = [(math.sin(rad[0] / 2), 0, 0, math.cos(rad[0] / 2)), (0, math.sin(rad[1] / 2), 0, math.cos(rad[1] / 2)),
          (0, 0, math.sin(rad[2] / 2), math.cos(rad[2] / 2))]
    def mul(a, b):
        ax, ay, az, aw = a; bx, by, bz, bw = b
        return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
    seq = {0: 'xyz', 1: 'xzy', 2: 'yzx', 3: 'yxz', 4: 'zxy', 5: 'zyx'}[order]
    q = (0, 0, 0, 1)
    for c in seq:                      # first-applied axis ends up rightmost: q = q_last * ... * q_first
        q = mul(qa['xyz'.index(c)], q)
    return q


# ---------- glTF writer ----------
class GLB:
    def __init__(self, generator):
        self.j = dict(asset=dict(version='2.0', generator=generator), scenes=[dict(nodes=[0])], scene=0,
                      nodes=[], meshes=[], skins=[], materials=[], textures=[], images=[],
                      samplers=[dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)],
                      accessors=[], bufferViews=[], buffers=[], animations=[])
        self.bin = bytearray()
        self.webp = False

    def view(self, data, target=None):
        self.bin += b'\0' * (-len(self.bin) % 4)
        bv = dict(buffer=0, byteOffset=len(self.bin), byteLength=len(data))
        if target: bv['target'] = target
        self.bin += data
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def acc(self, arr, ctype, typ, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        a = dict(bufferView=self.view(arr.tobytes(), target), componentType=ctype, count=int(arr.shape[0]), type=typ)
        if normalized: a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in np.atleast_1d(arr.min(0))]
            a['max'] = [float(x) for x in np.atleast_1d(arr.max(0))]
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def image(self, data, mime, name=None):
        img = dict(bufferView=self.view(data), mimeType=mime)
        if name: img['name'] = name
        self.j['images'].append(img)
        src = len(self.j['images']) - 1
        if mime == 'image/webp':
            self.webp = True
            self.j['textures'].append(dict(sampler=0, extensions=dict(EXT_texture_webp=dict(source=src))))
        else:
            self.j['textures'].append(dict(sampler=0, source=src))
        return len(self.j['textures']) - 1

    def write(self, path):
        if self.webp:
            self.j['extensionsUsed'] = ['EXT_texture_webp']
            self.j['extensionsRequired'] = ['EXT_texture_webp']
        for k in [k for k, v in self.j.items() if v == []]:
            del self.j[k]
        self.bin += b'\0' * (-len(self.bin) % 4)
        self.j['buffers'] = [dict(byteLength=len(self.bin))]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(self.bin)


def encode_tex(tex, fmt='webp', max_size=512, keep_alpha=None, lossless=False):
    im = tex.image.convert('RGBA')
    if max(im.size) > max_size:
        k = max_size / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    a = np.asarray(im)[:, :, 3]
    if keep_alpha is None:
        keep_alpha = bool((a < 250).mean() > 0.001)
    if not keep_alpha:
        im = im.convert('RGB')
    b = io.BytesIO()
    if fmt == 'webp':
        if lossless:
            im.save(b, 'WEBP', lossless=True, method=6, exact=True)
        else:
            im.save(b, 'WEBP', quality=90, method=6, exact=True)
        return b.getvalue(), 'image/webp', keep_alpha
    im.save(b, 'PNG', optimize=True)
    return b.getvalue(), 'image/png', keep_alpha


def tt_props(mat_tt):
    sp = mat_tt['m_SavedProperties']
    return dict(sp['m_TexEnvs']), dict(sp['m_Floats']), {k: [v['r'], v['g'], v['b'], v['a']] for k, v in sp['m_Colors']}
