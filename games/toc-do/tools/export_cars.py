"""Export Zing Speed kart prefabs to art/cars/<id>.glb and data/cars.js.

Run:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_cars.py [id ...]

Coordinates follow games/toc-do/README.md: (x,y,z)->(x,y,-z), quat (x,y,z,w)->(-x,-y,z,w),
triangle order flipped. Unity kart forward is +Z, so in the GLB the kart faces -Z.
Kart prefabs are shells; the real data lives in hncar_<id>.prefab (LOD0 skinned mesh, bind pose
used as-is) and in wheels/wheel_NNN or skinwheels/01wcar/wheel_NNNNN_skin_NNN prefabs.
"""
import io, json, os, re, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs, UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

OUT = os.path.normpath(os.path.join(HERE, '..'))
WORK = os.path.join(zs.REF, 'work', 'cars')
TEX_MAX = 512

# kart id -> param tier assignment (the car->params table is not in the APK assets; see cars.js note)
CARS = {
    '00004': dict(tier=0, name='Xe Kart Xanh'),
    '00006': dict(tier=1, name='Xe Husky'),
    '00297': dict(tier=2, name='Xe Cổ Điển Xanh'),
    '00016': dict(tier=2, name='Xe Công Thức Trắng'),
    '00175': dict(tier=3, name='Xe Địa Hình'),
    '00284': dict(tier=4, name='Xe Hổ Bơm Hơi'),
    '00254': dict(tier=5, name='Xe Thể Thao Tím'),
    '00055': dict(tier=6, name='Xe Siêu Tốc Đỏ'),
}
TIERS = {  # tier -> carparams asset names (real assets in dump/carparams)
    0: dict(engine='CarEngine_00', steer='CarSteer_00', driftExt='CarDriftExt_00', turbo='CarTurbo_00'),
    1: dict(engine='CarEngine_00', steer='CarSteer_02', driftExt='CarDriftExt_02', turbo='CarTurbo_01'),
    2: dict(engine='CarEngine_00', steer='CarSteer_03', driftExt='CarDriftExt_03', turbo='CarTurbo_015'),
    3: dict(engine='CarEngine_00', steer='CarSteer_04', driftExt='CarDriftExt_04', turbo='CarTurbo_02'),
    4: dict(engine='CarEngine_00', steer='CarSteer_05', driftExt='CarDriftExt_05', turbo='CarTurbo_03'),
    5: dict(engine='CarEngine_00', steer='CarSteer_057', driftExt='CarDriftExt_06', turbo='CarTurbo_04'),
    6: dict(engine='CarEngine_00', steer='CarSteer_06', driftExt='CarDriftExt_06', turbo='CarTurbo_06'),
}


# ---------------------------------------------------------------- loading
def cab_map():
    p = os.path.join(WORK, 'cabmap.json')
    if os.path.exists(p):
        return json.load(open(p))
    os.makedirs(WORK, exist_ok=True)
    m = {}
    for r in zs.index():
        if not (any(k in c.lower() for c in r['cont'] for k in ('vehicles/', 'shader', '0basecommon'))
                or any(n.startswith('Sha:') for n in r['names'])):
            continue
        try:
            env = UnityPy.load(os.path.join(zs.IFS, r['f']))
            for ff in env.files.values():
                for k in getattr(ff, 'files', {}):
                    m[k.lower()] = r['f']
        except Exception:
            pass
    json.dump(m, open(p, 'w'))
    return m


CM = None


def load(paths):
    global CM
    CM = CM or cab_map()
    env = UnityPy.Environment()
    seen, todo = set(), [os.path.join(zs.IFS, p) for p in paths]
    for _ in range(4):
        nxt = []
        for p in todo:
            if p not in seen:
                seen.add(p)
                env.load_file(p)
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', []):
                    n = e.path.split('/')[-1].lower()
                    if n in CM:
                        q = os.path.join(zs.IFS, CM[n])
                        if q not in seen:
                            nxt.append(q)
        if not nxt:
            break
        todo = nxt
    return env


def rd(p):
    try:
        return p.read() if p and p.m_PathID else None
    except Exception:
        return None


def props(d):
    sp = d.m_SavedProperties
    L = lambda x: x.items() if hasattr(x, 'items') else x
    return dict(L(sp.m_TexEnvs)), dict(L(sp.m_Floats)), dict(L(sp.m_Colors))


def prefab_root(env, r, suffix):
    """GameObject of the prefab; the container of the full env is too slow, so use the first bundle's."""
    path = [p for p in r['cont'] if p.lower().endswith(suffix)][0]
    light = UnityPy.load(os.path.join(zs.IFS, r['f']))
    pid = dict(light.container)[path].m_PathID
    for o in env.objects:
        if o.path_id == pid and o.type.name == 'GameObject':
            return o.read()
    raise RuntimeError('prefab object missing: ' + path)


# ---------------------------------------------------------------- math (unity space)
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t):
    m = np.eye(4)
    p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
    m[:3, :3] = quat_mat((q.x, q.y, q.z, q.w)) @ np.diag([s.x, s.y, s.z])
    m[:3, 3] = [p.x, p.y, p.z]
    return m


def walk(t, parent=np.eye(4), out=None):
    """-> list of (name, world matrix, GameObject, active-in-hierarchy-so-far)."""
    out = [] if out is None else out
    go = t.m_GameObject.read()
    w = parent @ trs(t)
    out.append((go.m_Name, w, go, t))
    if go.m_Name != 'root':  # skeleton under 'root' is skinning bones only
        for c in t.m_Children:
            walk(c.read(), w, out)
    return out


def flip_pos(a):
    a = np.array(a, dtype=np.float64).copy()
    a[..., 2] *= -1
    return a


# ---------------------------------------------------------------- textures
def fit(im, size=TEX_MAX):
    if max(im.size) > size:
        k = size / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    return im


def tex_of(mat_props, key):
    te = mat_props[0]
    t = te.get(key)
    x = rd(t.m_Texture) if t is not None else None
    if x is None:
        return None
    try:
        return fit(x.image.convert('RGBA'))
    except Exception:
        return None


def arr(im, size=None):
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def to_im(a, mode='RGB'):
    return Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8), mode)


def color(props_, key, default=(1, 1, 1)):
    c = props_[2].get(key)
    return np.array([c.r, c.g, c.b], dtype=np.float32) if c is not None else np.array(default, np.float32)


def encode(im, fmt):
    b = io.BytesIO()
    if fmt == 'jpg':
        im.convert('RGB').save(b, 'JPEG', quality=88, optimize=True)
    else:
        im.save(b, 'PNG', optimize=True)
    return b.getvalue()


# ---------------------------------------------------------------- glb builder
class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.acc, self.images, self.textures, self.materials, self.meshes, self.nodes = [], [], [], [], [], [], []

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, a, typ, comp, target, minmax=False):
        a = np.ascontiguousarray(a)
        d = {'bufferView': self._view(a.tobytes(), target), 'componentType': comp, 'count': len(a), 'type': typ}
        if minmax:
            d['min'] = a.min(0).astype(float).tolist()
            d['max'] = a.max(0).astype(float).tolist()
        self.acc.append(d)
        return len(self.acc) - 1

    def texture(self, im, fmt):
        data = encode(im, fmt)
        self.images.append({'bufferView': self._view(data), 'mimeType': 'image/jpeg' if fmt == 'jpg' else 'image/png'})
        self.textures.append({'source': len(self.images) - 1, 'sampler': 0})
        return len(self.textures) - 1

    def primitive(self, pos, nrm, uv, idx, mat):
        a = {'POSITION': self.accessor(pos.astype(np.float32), 'VEC3', 5126, 34962, True),
             'NORMAL': self.accessor(nrm.astype(np.float32), 'VEC3', 5126, 34962),
             'TEXCOORD_0': self.accessor(uv.astype(np.float32), 'VEC2', 5126, 34962)}
        ct, dt = (5123, np.uint16) if len(pos) < 65535 else (5125, np.uint32)
        return {'attributes': a, 'indices': self.accessor(idx.astype(dt).reshape(-1), 'SCALAR', ct, 34963), 'material': mat}

    def write(self, path, scene_nodes, extras):
        used = ['KHR_materials_clearcoat'] if any('KHR_materials_clearcoat' in m.get('extensions', {}) for m in self.materials) else []
        doc = {'asset': {'version': '2.0', 'generator': 'export_cars.py'},
               'scene': 0, 'scenes': [{'nodes': scene_nodes}], 'nodes': self.nodes, 'meshes': self.meshes,
               'materials': self.materials, 'textures': self.textures, 'images': self.images,
               'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
               'accessors': self.acc, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}],
               'extras': extras}
        if used:
            doc['extensionsUsed'] = used
        for k in ('textures', 'images'):
            if not doc[k]:
                del doc[k]
        if not doc['textures']:
            del doc['samplers']
        j = json.dumps(doc, separators=(',', ':')).encode()
        j += b' ' * (-len(j) % 4)
        b = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(b)))
            f.write(struct.pack('<II', len(j), 0x4E4F534A) + j)
            f.write(struct.pack('<II', len(b), 0x004E4942) + b)


# ---------------------------------------------------------------- materials
PAINT_REQUIRED = ('_MainTex',)


def mask_keys(p):
    te = p[0]
    mask = '_MaskTex1' if '_MaskTex1' in te else '_MaskMap2'
    rma = next((k for k in ('_RMA', '_RMASMap') if k in te), None)
    return mask, rma


def bake_paint(p, notes):
    """Return (albedo RGB, orm RGB, normal|None) arrays at one common size."""
    main = tex_of(p, '_MainTex')
    if main is None:
        return None
    size = main.size
    mk, rk = mask_keys(p)
    mask = tex_of(p, mk)
    base = arr(main)[..., :3]
    c1, c2 = color(p, '_paintColor1'), color(p, '_paintColor2')
    if mask is not None:
        m = arr(mask, size)
        t = 1 + (c1 - 1) * m[..., 0:1]
        t = t + (c2 - t) * m[..., 1:2]
        ao = m[..., 2]
        albedo = base * t
    else:
        albedo, ao = base * c1, np.ones(base.shape[:2], np.float32)
    rma = tex_of(p, rk) if rk else None
    if rma is not None:  # R roughness, G metallic, B ambient occlusion (checked on the wheel RMA)
        r = arr(rma, size)
        rough, metal, ao = r[..., 0], np.minimum(r[..., 1], 0.6), r[..., 2]
        notes.append('rma R=rough G=metal(cap .6) B=ao')
    else:  # old shader: _MaskMap1 R is a specular/gloss mask, _MaskMap2 B is AO
        m1 = tex_of(p, '_MaskMap1')
        g = arr(m1, size)[..., 0] if m1 is not None else np.full(base.shape[:2], 0.5, np.float32)
        rough, metal = np.clip(0.95 - 0.65 * g, 0.25, 0.95), np.full(base.shape[:2], 0.1, np.float32)
        notes.append('old shader: rough from _MaskMap1.R, ao from _MaskMap2.B')
    orm = np.stack([ao, rough, metal], -1)
    nk = next((k for k in ('_NormalMap', '_BumpMap') if k in p[0]), None)
    nrm = tex_of(p, nk) if nk else None
    return albedo, orm, (arr(nrm, size)[..., :3] if nrm is not None else None)


def add_paint(g, p, notes):
    r = bake_paint(p, notes)
    if r is None:
        return None
    albedo, orm, nrm = r
    orm_i = g.texture(to_im(orm), 'jpg')  # R=ao G=rough B=metal, shared by both slots
    m = {'name': 'paint', 'pbrMetallicRoughness': {
        'baseColorTexture': {'index': g.texture(to_im(albedo), 'jpg')},
        'metallicFactor': 1.0, 'roughnessFactor': 1.0, 'metallicRoughnessTexture': {'index': orm_i}},
        'occlusionTexture': {'index': orm_i},
        'extensions': {'KHR_materials_clearcoat': {'clearcoatFactor': 0.6, 'clearcoatRoughnessFactor': 0.12}}}
    if nrm is not None:
        m['normalTexture'] = {'index': g.texture(to_im(nrm), 'jpg')}
    g.materials.append(m)
    return len(g.materials) - 1


def add_glass(g, p, mname):
    a = tex_of(p, '_GlassAlphaTex') or tex_of(p, '_AlphaTex')
    c = tex_of(p, '_MainTex')
    if c is None:
        rgba = np.zeros((4, 4, 4), np.float32)
        rgba[..., 0:3], rgba[..., 3] = 0.1, 0.55
    else:
        rgba = arr(c)
        if a is not None:
            rgba[..., 3] = arr(a, c.size)[..., 0]
    m = {'name': 'glass', 'alphaMode': 'BLEND', 'doubleSided': True, 'pbrMetallicRoughness': {
        'baseColorTexture': {'index': g.texture(to_im(rgba, 'RGBA'), 'png')}, 'metallicFactor': 0.0, 'roughnessFactor': 0.08}}
    g.materials.append(m)
    return len(g.materials) - 1


def add_light(g, p):
    c, a = tex_of(p, '_MainTex'), tex_of(p, '_AlphaTex')
    if c is None:
        return None
    rgba = arr(c)
    if a is not None:
        rgba[..., 3] = arr(a, c.size)[..., 0]
    emi = rgba[..., :3] * rgba[..., 3:4]
    m = {'name': 'lights', 'alphaMode': 'BLEND', 'doubleSided': True,
         'pbrMetallicRoughness': {'baseColorTexture': {'index': g.texture(to_im(rgba, 'RGBA'), 'png')}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0},
         'emissiveFactor': [1, 1, 1], 'emissiveTexture': {'index': g.texture(to_im(emi), 'jpg')}}
    g.materials.append(m)
    return len(g.materials) - 1


def add_plain(g, rgb, name, rough=0.7, metal=0.1):
    g.materials.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [*rgb, 1], 'metallicFactor': metal, 'roughnessFactor': rough}})
    return len(g.materials) - 1


def add_wheel(g, p, notes):
    main = tex_of(p, '_MainTex')
    if main is None:
        return add_plain(g, (0.1, 0.1, 0.1), 'wheel')
    pbr = {'baseColorTexture': {'index': g.texture(to_im(arr(main)[..., :3]), 'jpg')}, 'metallicFactor': 1.0, 'roughnessFactor': 1.0}
    m = {'name': 'wheel', 'pbrMetallicRoughness': pbr}
    rma = tex_of(p, '_RMA')
    if rma is not None:
        r = arr(rma, main.size)
        oi = g.texture(to_im(np.stack([r[..., 2], r[..., 0], r[..., 1]], -1)), 'jpg')
        pbr['metallicRoughnessTexture'] = {'index': oi}
        m['occlusionTexture'] = {'index': oi}
    else:
        pbr['metallicFactor'], pbr['roughnessFactor'] = 0.25, 0.6
    nk = next((k for k in ('_NormalMap', '_BumpMap') if k in p[0]), None)
    n = tex_of(p, nk) if nk else None
    if n is not None:
        m['normalTexture'] = {'index': g.texture(to_im(arr(n)[..., :3]), 'jpg')}
    g.materials.append(m)
    return len(g.materials) - 1


# ---------------------------------------------------------------- meshes
def mesh_data(mesh_obj, world=None):
    h = MeshHandler(mesh_obj)
    h.process()
    v = np.array(h.m_Vertices, np.float64).reshape(-1, 3)
    n = np.array(h.m_Normals, np.float64).reshape(-1, 3)
    uv = np.array(h.m_UV0, np.float64).reshape(-1, 2)
    if world is not None:
        v = v @ world[:3, :3].T + world[:3, 3]
        n = n @ np.linalg.inv(world[:3, :3])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    subs = [np.array(t, np.int64).reshape(-1, 3) for t in h.get_triangles()]
    return v, n, uv, subs


def to_three(v, n, uv, tris):
    v, n = flip_pos(v), flip_pos(n)
    uv = np.stack([uv[:, 0], 1 - uv[:, 1]], 1)
    return v, n, uv, tris[:, [0, 2, 1]]


def renderer_of(go):
    mf = mr = None
    for c in go.m_Components:
        o = c.read()
        tn = o.object_reader.type.name
        if tn == 'MeshFilter':
            mf = o
        elif tn in ('MeshRenderer', 'SkinnedMeshRenderer'):
            mr = o
    mesh = rd(mf.m_Mesh) if mf else (rd(mr.m_Mesh) if mr is not None and hasattr(mr, 'm_Mesh') else None)
    return mesh, mr


def find_wheel(env_names, cid):
    """-> (prefab key, id) for the kart's wheel."""
    ids = [int(m.group(1)) for n in env_names for m in [re.search(r'wheel_(\d+)', n.lower())] if m]
    ids = ids + [int(cid)]
    for i in dict.fromkeys(ids):
        rs = zs.find('vehicles/wheels/wheel_%03d/hwheel_%03d.prefab' % (i, i))
        if rs:
            return rs[0], 'hwheel_%03d.prefab' % i, i
        skins = sorted({c for r in zs.find('skinwheels/01wcar/wheel_%05d_skin_' % i) for c in r['cont'] if '/hwheel_' in c.lower()})
        if skins:
            nm = skins[0].split('/')[-1]
            return next(r for r in zs.find(nm) if skins[0] in r['cont']), nm, i
    return None, None, None


# ---------------------------------------------------------------- per kart
def export_car(cid, spec):
    notes = []
    r = zs.find('ncar_%s/hncar_%s.prefab' % (cid, cid))[0]
    env = load([r['f']])
    root = prefab_root(env, r, '/hncar_%s.prefab' % cid)
    tr = [c.read() for c in root.m_Components if c.read().object_reader.type.name == 'Transform'][0]
    nodes = {}
    for name, w, go, t in walk(tr):
        nodes.setdefault(name, (w, go, t))
    g = Glb()
    log = {'orig': {}}
    body_prims, mat_ids = [], {}
    tex_names = []
    for o in env.objects:
        if o.type.name == 'Texture2D':
            try:
                tex_names.append(o.read().m_Name)
            except Exception:
                pass
    paint_props = None
    for want in ('Car_Lod0_Mesh', 'Car_Steering_Mesh'):
        if want not in nodes:
            continue
        w, go, _t = nodes[want]
        mesh, mr = renderer_of(go)
        if mesh is None:
            continue
        v, n, uv, subs = mesh_data(mesh, w)
        for si, tris in enumerate(subs):
            md = rd(mr.m_Materials[si]) if si < len(mr.m_Materials) else None
            key = (md.m_Name if md else 'none%d' % si)
            if key not in mat_ids:
                p = props(md) if md else None
                low = key.lower()
                if p is None:
                    mi = add_plain(g, (0.5, 0.5, 0.5), 'missing')
                elif 'paint' in low:
                    paint_props = paint_props or p
                    mi = add_paint(g, p, notes)
                elif 'glass' in low:
                    mi = add_glass(g, p, key)
                elif 'light' in low:
                    mi = add_light(g, p)
                else:
                    mi = None
                if mi is None:
                    mi = add_plain(g, (0.35, 0.35, 0.38), key)
                    notes.append('fallback grey for ' + key)
                mat_ids[key] = mi
                notes.append('%s -> %s' % (key, g.materials[mi]['name']))
            body_prims.append((to_three(v, n, uv, tris), mat_ids[key]))
            log['orig'][want] = log['orig'].get(want, 0) + len(tris)
    if paint_props is None or not any(g.materials[m]['name'] == 'paint' for _, m in body_prims):
        raise RuntimeError('no usable paint material (textures missing from the APK)')
    prims = [g.primitive(p[0], p[1], p[2], p[3], m) for p, m in body_prims]
    g.meshes.append({'name': 'body', 'primitives': prims})
    g.nodes.append({'name': 'body', 'mesh': 0})

    allv = np.concatenate([p[0][0] for p in body_prims])
    lo, hi = allv.min(0), allv.max(0)

    # wheels
    wr, wsuffix, wid = find_wheel(tex_names, cid)
    if wr is None:
        raise RuntimeError('wheel prefab not found')
    wenv = load([wr['f']])
    wroot = prefab_root(wenv, wr, '/' + wsuffix)
    wt = [c.read() for c in wroot.m_Components if c.read().object_reader.type.name == 'Transform'][0]
    wmesh = wmr = None
    for name, w, go, t in walk(wt):
        m_, r_ = renderer_of(go)
        if m_ is not None:
            wmesh, wmr, ww = m_, r_, w
    wv, wn, wuv, wsubs = mesh_data(wmesh, ww)
    wp = props(rd(wmr.m_Materials[0]))
    wmat = add_wheel(g, wp, notes)
    hubs = {'fl': 'FL_Tire', 'fr': 'FR_Tire', 'rl': 'BL_Tire', 'rr': 'BR_Tire'}
    wheels, scene = [], [0]
    for k, nm in hubs.items():
        w = nodes[nm][0]
        hub = w[:3, 3].copy()
        s = np.linalg.norm(w[:3, 0])
        left = hub[0] < 0
        v, n = wv * s, wn.copy()
        if left:  # rotate 180 deg about Y so the outer face looks outward on both sides
            v, n = v * [-1, 1, -1], n * [-1, 1, -1]
        tris = np.concatenate(wsubs)
        v3, n3, uv3, t3 = to_three(v, n, wuv, tris)
        mi = len(g.meshes)
        g.meshes.append({'name': 'wheel_' + k, 'primitives': [g.primitive(v3, n3, uv3, t3, wmat)]})
        h3 = flip_pos(hub)
        g.nodes.append({'name': 'wheel_' + k, 'mesh': mi, 'translation': [round(float(x), 5) for x in h3]})
        scene.append(len(g.nodes) - 1)
        rad = float(max(np.abs(wv[:, 1]).max(), np.abs(wv[:, 2]).max()) * s)
        wheels.append({'x': round(float(h3[0]), 4), 'y': round(float(h3[1]), 4), 'z': round(float(h3[2]), 4), 'r': round(rad, 4), 'front': k[0] == 'f'})
        log['orig']['wheel_' + k] = nm
    log['orig']['wheel_mesh'] = wsuffix

    # markers
    def marker(name, pos, src):
        g.nodes.append({'name': name, 'translation': [round(float(x), 5) for x in pos]})
        scene.append(len(g.nodes) - 1)
        log['orig'][name] = src

    def marker_q(name, src):
        t = nodes[src][2]
        p, q = flip_pos(nodes[src][0][:3, 3]), t.m_LocalRotation
        g.nodes.append({'name': name, 'translation': [round(float(x), 5) for x in p],
                        'rotation': [-q.x, -q.y, q.z, q.w]})
        scene.append(len(g.nodes) - 1)
        log['orig'][name] = src
        return p

    seat = None
    for nm, src in (('Car_Seat_M', 'Car_Seat_M'), ('Car_Seat', 'Car_Seat')):
        if src in nodes:
            p = marker_q(nm, src)
            seat = p if nm == 'Car_Seat_M' else seat
            if nm == 'Car_Seat_M':
                marker_q('driver_mount', src)
    # no exhaust transform exists in any kart prefab: synthesised from the rear of the body
    zr = hi[2]
    ex_y = float(wheels[2]['y'] + 0.05)
    for nm, sx in (('exhaust_l', -1), ('exhaust_r', 1)):
        marker(nm, (sx * 0.32 * (hi[0] - lo[0]) / 2, ex_y, zr - 0.05), 'synthesised (rear bounds)')
    if 'Car_Plate' in nodes:
        marker('plate', flip_pos(nodes['Car_Plate'][0][:3, 3]), 'Car_Plate')

    root_n = {'name': 'kart_' + cid, 'children': list(range(len(g.nodes)))}
    g.nodes.append(root_n)
    out = os.path.join(OUT, 'art', 'cars', cid.lstrip('0').rjust(2, '0') + '.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    g.write(out, [len(g.nodes) - 1], {'source': 'ncar_' + cid, 'wheel': wsuffix, 'log': log['orig']})
    shrink(out)
    fz = float(np.mean([w['z'] for w in wheels if w['front']]) - np.mean([w['z'] for w in wheels if not w['front']]))
    info = {
        'id': cid.lstrip('0').rjust(2, '0'), 'glb': 'art/cars/' + os.path.basename(out),
        'wheels': wheels, 'forward': [0, 0, -1 if fz < 0 else 1],
        'size': {'l': round(float(hi[2] - lo[2]), 3), 'w': round(float(hi[0] - lo[0]), 3), 'h': round(float(hi[1] - lo[1]), 3)},
        'driverMount': [round(float(x), 4) for x in seat] if seat is not None else None,
        'exhaust': [[round(float(x), 4) for x in n['translation']] for n in g.nodes if n['name'].startswith('exhaust')],
        'paint': [[round(float(x), 3) for x in color(paint_props, k)] for k in ('_paintColor1', '_paintColor2')],
        'bytes': os.path.getsize(out), 'wheelSource': wsuffix,
    }
    return info, notes


def shrink(path, limit=2_400_000):
    """Meshopt-compress (gltf-transform) only when the plain GLB is over budget."""
    if os.path.getsize(path) <= limit:
        return
    import subprocess
    tmp = path[:-4] + '.tmp.glb'
    r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'meshopt', path, tmp, '--level', 'high'], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(tmp):
        os.replace(tmp, path)
    else:
        print('meshopt failed:', r.stderr[-300:])


def norm(v, lo, hi):
    return int(round(1 + 9 * (v - lo) / (hi - lo)))


def stats_for(tier):
    P = json.load
    dp = os.path.join(zs.REF, 'dump', 'carparams')
    d = {k: P(open(os.path.join(dp, v + '.json'))) for k, v in TIERS[tier].items()}
    curve0 = lambda c: c['m_Curve'][0]['value']
    steer = curve0(d['steer']['m_drivingMaxAngSpeedCurve'])
    drift = d['driftExt']['m_driftMaxAngSpeed']
    nitro = d['turbo']['m_miniBoostMaxVDAngle']
    s = dict(handling=norm(steer, 82, 93), drift=norm(drift, 175, 200), nitro=norm(nitro, 50, 75))
    s['speed'] = min(10, 4 + tier)  # no per-kart speed asset exists; follows the assigned tier
    s['accel'] = min(10, 3 + tier)
    return {k: s[k] for k in ('speed', 'accel', 'handling', 'drift', 'nitro')}, TIERS[tier]


def main():
    ids = sys.argv[1:] or list(CARS)
    res, errs = {}, {}
    for cid in ids:
        try:
            info, notes = export_car(cid, CARS.get(cid, dict(tier=0, name='Xe ' + cid)))
            spec = CARS.get(cid, dict(tier=0, name='Xe ' + cid))
            info['name'] = spec['name']
            info['stats'], info['params'] = stats_for(spec['tier'])
            res[info['id']] = info
            print(cid, info['bytes'], 'bytes', info['size'], info['forward'], '; '.join(notes))
        except Exception as e:
            errs[cid] = str(e)
            print(cid, 'FAILED', e)
    path = os.path.join(OUT, 'data', 'cars.js')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not sys.argv[1:] or not os.path.exists(path):
        merged = res
    else:
        merged = json.loads(open(path).read().split('=', 1)[1].rstrip().rstrip(';'))
        merged.update(res)
    with open(path, 'w') as f:
        f.write('// generated by tools/export_cars.py; kart stats are assigned tiers over real carparams assets\n')
        f.write('TD.CARS = ' + json.dumps(merged, ensure_ascii=False, indent=1) + ';\n')
    for k, v in errs.items():
        print('ERR', k, v)


if __name__ == '__main__':
    main()
