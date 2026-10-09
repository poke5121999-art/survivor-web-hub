"""DREDGE world exporter: the whole Game scene -> data for the three.js remake.

Run (repo root, ~10 min, needs UnityPy 1.25, Pillow, numpy, node + npx for gltfpack):
    python -I games/dredge/tools/world.py [--no-gltf]
Needs D:/dredge-ref/cache/bundle_index.json (tools/index_bundles.py). Reads only; nothing in the
game folder is touched. Writes games/dredge/art/world/:
    lib.glb            unique static meshes, one node per variant, named m<N>
    instances.bin      float32 x10 per instance: px py pz qx qy qz qw sx sy sz (three.js coords)
    instance_roots.bin uint8 per instance: index into world.json regions
    world.json         bounds, cell grid, mesh table, per-cell instance ranges, terrain, landmask
    terrain.png        16-bit grey heightmap; terrain_rg.png = same value as R(high) G(low) bytes
    landmask.png       white = boat cannot pass
    markers.json       POIs, docks, zones, weather/water/sanity volumes
    scene_config.json  Logic-object settings, light, fog, camera rig
Coordinates: Unity is left-handed (x right, y up, z forward); three.js is right-handed, so every
position/vertex gets z -> -z, quaternions (x,y,z,w) -> (-x,-y,z,w), triangle winding flips.
"""
import io, json, math, os, re, shutil, struct, subprocess, sys, time, collections

import numpy as np
import UnityPy
from PIL import Image, ImageDraw
from UnityPy.helpers.MeshHelper import MeshHandler

sys.stdout.reconfigure(encoding='utf-8')  # python -I ignores PYTHONIOENCODING

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'art', 'world')
DATA = os.environ.get('DREDGE_DATA', r'D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\DREDGE_Data')
AA = os.path.join(DATA, 'StreamingAssets', 'aa', 'StandaloneWindows')
CACHE = r'D:\dredge-ref\cache'
SCENE_BUNDLE = 'gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle'

STATIC_ROOTS = ['TheMarrows', 'GaleCliffs', 'StellarBasin', 'TwistedStrand', 'DevilsSpine',
                'OpenOcean', 'DLC1', 'DLC2', 'Docks']
# Subtrees that move, appear on events or only exist in cutscenes.
SKIP_NAMES = {'Cutscenes', 'AnimatedObjects', 'WreckMonster_Iceworld', 'GhostRocks', 'GhostRocks (1)'}
MAX_TEX = 512
CELL = 256.0
MASK_RES = 1.0  # metres per landmask pixel


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ---------------------------------------------------------------- loading
def load_env():
    cab = {}
    for n in os.listdir(AA):
        if n.endswith('.bundle'):
            for f in UnityPy.load(os.path.join(AA, n)).files.values():
                for k in getattr(f, 'files', {}):
                    cab[k.lower()] = n

    def deps(b):
        out = set()
        for f in UnityPy.load(os.path.join(AA, b)).files.values():
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', []):
                    c = e.path.split('/')[-1].lower()
                    if c in cab and cab[c] != b:
                        out.add(cab[c])
        return out
    seen, todo = set(), [SCENE_BUNDLE]
    while todo:
        x = todo.pop()
        if x not in seen:
            seen.add(x)
            todo.extend(deps(x) - seen)
    return UnityPy.load(*[os.path.join(AA, SCENE_BUNDLE)] +
                        [os.path.join(AA, n) for n in sorted(seen - {SCENE_BUNDLE})])


class Scene:
    def __init__(self, env):
        self.env = env
        self.objs = {}
        by_file = collections.Counter()
        for o in env.objects:
            self.objs[(o.assets_file.name.lower(), o.path_id)] = o
            if o.type.name == 'GameObject':
                by_file[o.assets_file.name] += 1
        # the scene proper is the CAB with the most GameObjects that is not a .sharedAssets
        self.main = max((n for n in by_file if not n.endswith('.sharedAssets')), key=by_file.get)
        self.T, self.G, self.C = {}, {}, {}
        self.ctype = {}
        for (fn, pid), o in self.objs.items():
            if fn != self.main.lower():
                continue
            t = o.type.name
            self.ctype[pid] = t
            if t in ('Transform', 'RectTransform'):
                self.T[pid] = o.parse_as_dict()
            elif t == 'GameObject':
                self.G[pid] = o.parse_as_dict()
        self.af = next(o for (fn, _), o in self.objs.items() if fn == self.main.lower()).assets_file
        self.tr_of = {t['m_GameObject']['m_PathID']: pid for pid, t in self.T.items()}
        self.roots = [t['m_GameObject']['m_PathID'] for pid, t in self.T.items()
                      if t['m_Father']['m_PathID'] == 0]
        self._w = {}
        self._cache = {}
        self.C = {}

    def deref(self, af, ptr):
        fid, pid = ptr['m_FileID'], ptr['m_PathID']
        if not pid:
            return None
        if fid == 0:
            name = af.name
        else:
            try:
                name = af.externals[fid - 1].path.split('/')[-1]
            except IndexError:
                return None
        return self.objs.get((name.lower(), pid))

    def obj(self, pid):
        return self.objs.get((self.main.lower(), pid))

    def name(self, gpid):
        return self.G[gpid]['m_Name']

    def children(self, gpid):
        return [self.T[c['m_PathID']]['m_GameObject']['m_PathID']
                for c in self.T[self.tr_of[gpid]]['m_Children']]

    def parent(self, gpid):
        f = self.T[self.tr_of[gpid]]['m_Father']['m_PathID']
        return self.T[f]['m_GameObject']['m_PathID'] if f else None

    def path(self, gpid):
        p = []
        while gpid:
            p.append(self.name(gpid))
            gpid = self.parent(gpid)
        return '/'.join(reversed(p))

    def world(self, gpid):
        tp = self.tr_of[gpid]
        if tp in self._w:
            return self._w[tp]
        t = self.T[tp]
        p, q, s = t['m_LocalPosition'], t['m_LocalRotation'], t['m_LocalScale']
        x, y, z, w = q['x'], q['y'], q['z'], q['w']
        n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
        x, y, z, w = x / n, y / n, z / n, w / n
        r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m = np.eye(4)
        m[:3, :3] = r * np.array([s['x'], s['y'], s['z']])
        m[:3, 3] = [p['x'], p['y'], p['z']]
        par = self.parent(gpid)
        if par:
            m = self.world(par) @ m
        self._w[tp] = m
        return m

    def active(self, gpid):
        while gpid:
            if not self.G[gpid]['m_IsActive']:
                return False
            gpid = self.parent(gpid)
        return True

    def comps(self, gpid):
        """[(type name, pid)] of the components of a scene GameObject."""
        if gpid not in self.C:
            self.C[gpid] = [(self.ctype.get(c['component']['m_PathID'], '?'), c['component']['m_PathID'])
                            for c in self.G[gpid]['m_Component']]
        return self.C[gpid]

    def comp_dicts(self, gpid, typ):
        return [self.obj(pid).parse_as_dict() for t, pid in self.comps(gpid) if t == typ]

    def script_name(self, o):
        k = (o.assets_file.name, o.path_id)
        if k not in self._cache:
            try:
                sc = self.deref(o.assets_file, o.parse_as_dict()['m_Script'])
                self._cache[k] = sc.parse_as_dict()['m_ClassName'] if sc else None
            except Exception:
                self._cache[k] = None
        return self._cache[k]

    def scripts(self, gpid):
        """[(class name, ObjectReader)] for MonoBehaviours on a scene GameObject."""
        out = []
        for t, pid in self.comps(gpid):
            if t == 'MonoBehaviour':
                o = self.obj(pid)
                out.append((self.script_name(o), o))
        return out

    def walk(self, gpid, skip=()):
        st = [gpid]
        while st:
            g = st.pop()
            if self.name(g) in skip:
                continue
            yield g
            st.extend(self.children(g))

    def top(self, name):
        return [g for g in self.roots if self.name(g) == name]


# ---------------------------------------------------------------- Odin serializer blobs
def odin_decode(blob):
    """Sirenix Odin binary -> python. Named fields become dict keys; array elements land in
    '$array'/'$items'; UnityEngine.Object references are {'$unity': index into ReferencedUnityObjects}."""
    b = bytes(blob)
    pos = [0]
    types = {}

    def take(n):
        v = b[pos[0]:pos[0] + n]
        pos[0] += n
        return v

    def i32():
        return struct.unpack('<i', take(4))[0]

    def string():
        flag = take(1)[0]
        n = i32()
        return take(n * 2).decode('utf-16le', 'replace') if flag else take(n).decode('latin1')

    def read_type():
        t = take(1)[0]
        if t == 47:
            tid = i32()
            types[tid] = string()
            return types[tid]
        if t == 48:
            return types.get(i32())
        return None  # 46: no type

    PRIM = {15: ('b', 1), 17: ('B', 1), 19: ('<h', 2), 21: ('<H', 2), 23: ('<i', 4), 25: ('<I', 4),
            27: ('<q', 8), 29: ('<Q', 8), 31: ('<f', 4), 33: ('<d', 8), 37: ('<H', 2), 43: ('?', 1)}

    def value(code):  # code = the named (odd) form of the entry
        if code in PRIM:
            f, n = PRIM[code]
            v = struct.unpack(f, take(n))[0]
            return chr(v) if code == 37 else v
        if code == 39:
            return string()
        if code in (35, 41):
            return take(16).hex()
        if code == 45:
            return None
        if code == 11:
            return {'$unity': i32()}
        if code == 13:
            return {'$guid': take(16).hex()}
        if code == 9:
            return {'$ref': i32()}
        if code == 50:
            return {'$ext': string()}
        raise ValueError('odin entry %d at %d' % (code, pos[0]))

    UNNAMED = (10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 51)

    def typed(inner, tname):
        if tname and isinstance(inner, dict):
            return {'$type': tname.split(',')[0], **inner}
        return inner

    def element(code):
        if code in (2, 4):
            tname = read_type()
            if code == 2:
                i32()
            return typed(node(), tname)
        if code == 8:
            cnt, sz = i32(), i32()
            return {'$prim': take(cnt * sz).hex()}
        if code in UNNAMED:
            return value(code - 1 if code != 46 else 45)
        raise ValueError('odin element code %d at %d' % (code, pos[0]))

    def node():
        out = {}
        while pos[0] < len(b):
            code = take(1)[0]
            if code in (5, 49):
                return out
            if code in (1, 3):
                name = string()
                tname = read_type()
                if code == 1:
                    i32()
                out[name] = typed(node(), tname)
            elif code == 6:
                take(8)
                arr = []
                while pos[0] < len(b):
                    c = take(1)[0]
                    if c == 7:
                        break
                    arr.append(element(c))
                out['$array'] = arr
            elif code in (2, 4, 8) or code in UNNAMED:
                out.setdefault('$items', []).append(element(code))
            elif code % 2 == 1 and 9 <= code <= 50:
                name = string()
                out[name] = value(code)
            else:
                raise ValueError('odin code %d at %d' % (code, pos[0]))
        return out

    return node()


# ---------------------------------------------------------------- static scenery
FLIP = np.array([1.0, 1.0, -1.0])
F4 = np.diag([1.0, 1.0, -1.0, 1.0])


def quat_from_matrix(r):
    t = r[0, 0] + r[1, 1] + r[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, s / 4]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = math.sqrt(1 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [s / 4, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
    elif r[1, 1] > r[2, 2]:
        s = math.sqrt(1 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / s, s / 4, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
    else:
        s = math.sqrt(1 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, s / 4, (r[1, 0] - r[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def decompose(m):
    """Unity world matrix -> (pos, quat, scale, mirrored) in three.js coordinates.
    A negative-determinant matrix cannot be a three.js rotation+scale in an InstancedMesh (culling
    flips per object), so the mirror is returned as a flag and baked into the mesh variant."""
    g = F4 @ m @ F4
    a = g[:3, :3]
    s = np.linalg.norm(a, axis=0)
    s[s == 0] = 1e-6
    r = a / s
    shear = float(np.abs(r.T @ r - np.eye(3)).max())
    mirrored = np.linalg.det(r) < 0
    if mirrored:
        r = r @ np.diag([-1.0, 1.0, 1.0])
    # nearest proper rotation when parents with non-uniform scale left some shear
    u, _, vt = np.linalg.svd(r)
    r = u @ vt
    return g[:3, 3], quat_from_matrix(r), s, bool(mirrored), shear


def lod_skip_set(S, root_gos):
    """Renderer component ids that belong only to LOD1+ of some LODGroup."""
    skip, keep = set(), set()
    for g in root_gos:
        for d in S.comp_dicts(g, 'LODGroup'):
            for i, lod in enumerate(d['m_LODs']):
                for r in lod['renderers']:
                    pid = r['renderer']['m_PathID']
                    (keep if i == 0 else skip).add(pid)
    return skip - keep


class Meshes:
    """Reads Unity meshes into numpy once; mirrored variants are derived on demand."""
    def __init__(self):
        self.cache = {}

    def get(self, o):
        key = (o.assets_file.name, o.path_id)
        if key not in self.cache:
            me = o.read()
            h = MeshHandler(me)
            h.process()
            n = h.m_VertexCount
            pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
            nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] if h.m_Normals else None
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
            subs = [np.array(t, dtype=np.uint32).reshape(-1, 3) for t in h.get_triangles()]
            self.cache[key] = dict(name=me.m_Name, pos=pos, nrm=nrm, uv=uv, col=col, subs=subs,
                                   key=key, vertex_color=col is not None)
        return self.cache[key]

    def batched(self, o, first, count, world):
        """Static batching baked many renderers into one 'Combined Mesh' in world space. Undo it:
        take this renderer's submeshes, map the used vertices back through its own world matrix,
        and dedupe by shape signature so the original unique mesh comes out once."""
        big = self.get(o)
        subs = big['subs'][first:first + count]
        used = np.unique(np.concatenate([t.reshape(-1) for t in subs]))
        remap = np.full(len(big['pos']), -1, np.int64)
        remap[used] = np.arange(len(used))
        inv = np.linalg.inv(world)
        w = np.c_[big['pos'][used], np.ones(len(used))]
        pos = (w @ inv.T)[:, :3]
        nrm = None
        if big['nrm'] is not None:
            nrm = big['nrm'][used] @ world[:3, :3]  # inverse transpose of the world matrix
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
        # Unity flips the winding of batched geometry under a mirroring matrix; undo that too
        flip = np.linalg.det(world[:3, :3]) < 0
        lsubs = [remap[t][:, ::-1].astype(np.uint32) if flip else remap[t].astype(np.uint32) for t in subs]
        sig = (len(used), tuple(len(t) for t in lsubs), tuple(np.round(pos.sum(0), 1)),
               tuple(np.round(pos.min(0), 1)), tuple(np.round(pos.max(0), 1)))
        if sig not in self.cache:
            self.cache[sig] = dict(
                name=big['name'] + '#%d' % len(self.cache), pos=pos, nrm=nrm,
                uv=big['uv'][used] if big['uv'] is not None else None,
                col=big['col'][used] if big['col'] is not None else None,
                subs=lsubs, key=sig, vertex_color=big['col'] is not None)
        return self.cache[sig]

    @staticmethod
    def three(mesh, mirror):
        """Vertices in three.js space: optional x mirror, then z -> -z, winding flipped for each."""
        pos, nrm = mesh['pos'], mesh['nrm']
        fl = FLIP * (np.array([-1.0, 1.0, 1.0]) if mirror else 1.0)
        pos = pos * fl
        nrm = nrm * fl if nrm is not None else None
        flips = 2 if mirror else 1  # one flip for z, one more for x
        subs = []
        for t in mesh['subs']:
            subs.append(t[:, ::-1] if flips % 2 else t)
        return pos, nrm, subs


class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []
        self.materials, self.textures, self.images = [], [], []
        self.tex_index, self.attr_cache = {}, {}

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

    def texture(self, tex_obj):
        """-> (texture index, has real alpha). Downscaled to MAX_TEX; jpg when opaque, png otherwise."""
        key = (tex_obj.assets_file.name, tex_obj.object_reader.path_id)
        if key not in self.tex_index:
            img = tex_obj.image.convert('RGBA')
            if max(img.size) > MAX_TEX:
                k = MAX_TEX / max(img.size)
                img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            alpha = img.getchannel('A').getextrema()[0] < 250
            buf = io.BytesIO()
            if alpha:
                img.save(buf, 'PNG', optimize=True)
                mime = 'image/png'
            else:
                img.convert('RGB').save(buf, 'JPEG', quality=82, optimize=True)
                mime = 'image/jpeg'
            self.images.append({'bufferView': self.view(buf.getvalue()), 'mimeType': mime,
                                'name': tex_obj.m_Name})
            self.textures.append({'source': len(self.images) - 1, 'sampler': 0})
            self.tex_index[key] = (len(self.textures) - 1, alpha, img)
        return self.tex_index[key]

    def mesh_variant(self, name, mesh, mirror, mat_ids):
        key = (id(mesh), mirror)
        if key not in self.attr_cache:
            pos, nrm, subs = Meshes.three(mesh, mirror)
            at = {'POSITION': self.accessor(pos.astype(np.float32), 5126, 'VEC3', 34962, True)}
            if nrm is not None:
                at['NORMAL'] = self.accessor(nrm.astype(np.float32), 5126, 'VEC3', 34962)
            if mesh['uv'] is not None:
                at['TEXCOORD_0'] = self.accessor(mesh['uv'], 5126, 'VEC2', 34962)
            if mesh['col'] is not None:
                at['COLOR_0'] = self.accessor(mesh['col'].astype(np.float32), 5126, 'VEC4', 34962)
            idx = [self.accessor(t.reshape(-1).astype(np.uint32), 5125, 'SCALAR', 34963) if len(t) else None
                   for t in subs]
            self.attr_cache[key] = (at, idx)
        at, idx = self.attr_cache[key]
        prims = []
        for i, ix in enumerate(idx):
            if ix is None or i >= len(mat_ids):
                continue
            prims.append({'attributes': at, 'indices': ix, 'material': mat_ids[i]})
        self.meshes.append({'name': name, 'primitives': prims})
        self.nodes.append({'name': name, 'mesh': len(self.meshes) - 1})

    def write(self, path):
        gltf = {
            'asset': {'version': '2.0', 'generator': 'dredge/tools/world.py'},
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


def build_material(glb, mat_obj):
    """Shader-graph materials keep their albedo in a GUID-named property; map it to glTF PBR."""
    mat = mat_obj.read()
    sp = mat.m_SavedProperties
    try:
        sh = mat.m_Shader.read()
        shader = sh.m_ParsedForm.m_Name if sh.m_ParsedForm else sh.m_Name
    except Exception:
        shader = '?'
    F = {n: float(v) for n, v in sp.m_Floats}
    C = {n: c for n, c in sp.m_Colors}
    T = {n: e.m_Texture for n, e in sp.m_TexEnvs if e.m_Texture.m_PathID}

    def pick(d, *prefixes):
        for p in prefixes:
            for k, v in d.items():
                if k.startswith(p):
                    return v
        return None
    tex_ptr = pick(T, 'Texture2D_9aa7ba22', '_MainTex', '_BaseMap')
    if tex_ptr is None and 'GaleCliffsWaterfall' in shader:
        # GaleCliffsWaterfall_Shader lấy mẫu Texture2D_40488f58 (cuộn UV, dời đỉnh): gắn làm baseColorTexture để gltfpack giữ UV0
        tex_ptr = pick(T, 'Texture2D_40488f58')
    tint = pick(C, 'Color_9a80436d', '_BaseColor', '_Color')
    pbr = {'metallicFactor': 0, 'roughnessFactor': 1}
    m = {'name': mat.m_Name, 'pbrMetallicRoughness': pbr, 'extras': {'shader': shader}}
    # Thông số shader graph theo tên hiển thị (GrassColour, SnowHeight...) cho js/world.js dựng lại shader toon gốc
    # (công thức đọc từ bytecode DXBC, xem tools/env.py --dis). Màu Color để nguyên giá trị gamma như trong .mat.
    try:
        props = {p.m_Name: (p.m_Description, p.m_Type) for p in sh.m_ParsedForm.m_PropInfo.m_Props}
    except Exception:
        props = {}
    params = {}
    for n, v in F.items():
        if n in props and not n.startswith('_Queue'):
            params[props[n][0]] = round(v, 5)
    for n, c in C.items():
        if n in props:
            params[props[n][0]] = [round(float(c.r), 5), round(float(c.g), 5), round(float(c.b), 5), round(float(c.a), 5)]
    if params:
        m['extras']['params'] = params
    kw = list(getattr(mat, 'm_ValidKeywords', None) or []) or (getattr(mat, 'm_ShaderKeywords', '') or '').split()
    if kw:
        m['extras']['keywords'] = sorted(kw)
    base = [1.0, 1.0, 1.0]
    if tint is not None:
        base = [round(float(tint.r), 4), round(float(tint.g), 4), round(float(tint.b), 4)]
    triplanar = 'Triplanar' in shader
    if tex_ptr is not None:
        try:
            ti, alpha, img = glb.texture(tex_ptr.read())
            if triplanar:
                # LitTriplanar lấy mẫu *_RGB theo UV0 × TextureScale + TextureOffset (không phải chiếu ba mặt):
                # gắn texture để gltfpack giữ TEXCOORD_0; màu đá/cỏ/cát nằm ở extras.params
                pbr['baseColorTexture'] = {'index': ti}
                m['extras']['triplanarTexture'] = tex_ptr.read().m_Name
            else:
                pbr['baseColorTexture'] = {'index': ti}
                if alpha and (F.get('_AlphaClip') or 'Foliage' in shader):
                    m['alphaMode'] = 'MASK'
                    m['alphaCutoff'] = round(F.get('_Cutoff', 0.5), 3)
        except Exception as e:  # texture in a bundle that did not load
            m['extras']['missingTex'] = str(e)[:80]
    # Lit_Shader "Emission" (cửa sổ, đèn): cộng sau sương, nhân LightStrength, tắt ban ngày nếu LightsTurnOffAtDay
    em_ptr = pick(T, 'Texture2D_c7b8c5c5')
    if em_ptr is not None:
        try:
            ei, _, eimg = glb.texture(em_ptr.read())
            if np.asarray(eimg.convert('RGB')).max() > 8:
                m['emissiveTexture'] = {'index': ei}
                m['emissiveFactor'] = [1.0, 1.0, 1.0]
        except Exception as e:
            m['extras']['missingEmission'] = str(e)[:80]
    pbr['baseColorFactor'] = base + [1.0]
    em = C.get('_EmissionColor')
    if em is not None and (em.r + em.g + em.b) > 0.01:
        m['emissiveFactor'] = [round(min(1.0, float(em.r)), 3), round(min(1.0, float(em.g)), 3),
                               round(min(1.0, float(em.b)), 3)]
    if F.get('_Surface') == 1:
        m['alphaMode'] = 'BLEND'
    if F.get('_Cull', 2) == 0:
        m['doubleSided'] = True
    return m


def collect_instances(S, M):
    """Every static LOD0 MeshRenderer under STATIC_ROOTS -> list of dicts.
    Mesh nằm dưới một SimpleBuoyantObject (phao, thuyền bến) mang thêm `buoy` = pid GameObject chứa nó và
    `buoyDepth` = objectDepth: export_scenery tách chúng khỏi instances.bin để js/world.js cho bập bềnh theo sóng."""
    inst = []
    stats = collections.Counter()
    roots = []
    for r in STATIC_ROOTS:
        roots += [(r, g) for g in S.top(r)]
    allgos = []
    for rn, rg in roots:
        allgos += list(S.walk(rg, SKIP_NAMES))
    skip_r = lod_skip_set(S, allgos)
    main = S.af
    sbo = {}  # pid GameObject -> objectDepth của SimpleBuoyantObject đang bật (SimpleBuoyantObject.cs:28-44)
    for g in allgos:
        if any(t == 'MonoBehaviour' for t, _ in S.comps(g)):
            for cn, o in S.scripts(g):
                if cn == 'SimpleBuoyantObject':
                    d = o.parse_as_dict()
                    if d.get('m_Enabled', 1):
                        sbo[g] = float(d['objectDepth'])

    def buoy_container(g):
        while g:
            if g in sbo:
                return g
            g = S.parent(g)
        return None
    for ri, (rn, rg) in enumerate(roots):
        for g in S.walk(rg, SKIP_NAMES):
            types = {t: p for t, p in S.comps(g)}
            if 'MeshFilter' not in types or 'MeshRenderer' not in types:
                continue
            if re.search(r'(?i)safezone|navobstacle|oozeplane|shadowcaster', S.name(g)):
                stats['debug_or_event_mesh'] += 1  # editor visualisation / event decals, not scenery
                continue
            if types['MeshRenderer'] in skip_r:
                stats['lod_skipped'] += 1
                continue
            if not S.active(g):
                stats['inactive'] += 1
                continue
            mf = S.obj(types['MeshFilter']).parse_as_dict()
            mr = S.obj(types['MeshRenderer']).parse_as_dict()
            if not mr['m_Enabled']:
                stats['disabled'] += 1
                continue
            if mr.get('m_CastShadows') == 3:  # ShadowsOnly: invisible blockers/shadow planes
                stats['shadows_only'] += 1
                continue
            mo = S.deref(main, mf['m_Mesh'])
            if mo is None:
                stats['nomesh'] += 1
                continue
            sb = mr.get('m_StaticBatchInfo', {})
            try:
                mesh = M.get(mo)
            except Exception as e:
                stats['mesh_unreadable'] += 1
                continue
            if sb.get('subMeshCount', 0) > 0 and mesh['name'].startswith('Combined Mesh'):
                mesh = M.batched(mo, sb['firstSubMesh'], sb['subMeshCount'], S.world(g))
                stats['static_batched'] += 1
            mats = [S.deref(main, p) for p in mr['m_Materials']]
            if any(x is None for x in mats):
                stats['nomat'] += 1
                continue
            pos, q, s, mir, shear = decompose(S.world(g))
            stats['shear>0.02'] += shear > 0.02
            bc = buoy_container(g)
            inst.append(dict(g=g, root=rn, mesh=mesh, mats=mats, pos=pos, q=q, s=s, mir=mir,
                             buoy=bc, buoyDepth=sbo.get(bc)))
            stats['buoyant'] += bc is not None
    stats['instances'] = len(inst)
    return inst, stats


# ---------------------------------------------------------------- terrain + depth mask
def export_terrain(S):
    """The scene's one Terrain is the seabed; its heights are the depth map."""
    tg = None
    for t, pid in [(t, p) for g in S.roots if S.name(g) == 'Terrain' for t, p in S.comps(g)]:
        if t == 'Terrain':
            tg = S.obj(pid)
    td_obj = S.deref(S.af, tg.parse_as_dict()['m_TerrainData'])
    d = td_obj.parse_as_dict()
    hm = d['m_Heightmap']
    res = hm['m_Resolution']
    h = np.array(hm['m_Heights'], dtype=np.int32).reshape(res, res)  # [z][x], 0..32766
    sc = hm['m_Scale']
    g = [g for g in S.roots if S.name(g) == 'Terrain'][0]
    w = S.world(g)
    size_x, size_z = sc['x'] * (res - 1), sc['z'] * (res - 1)
    size_y = sc['y']  # Unity stores the full height range here, not a per-step scale
    ux0, uy0, uz0 = w[0, 3], w[1, 3], w[2, 3]
    # row 0 of the image = smallest three.js z (= -largest Unity z)
    img16 = np.round(h[::-1].astype(np.float64) / 32766.0 * 65535.0).astype('<u2')
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(img16).save(os.path.join(OUT, 'terrain.png'), optimize=True)
    rg = np.zeros((res, res, 3), np.uint8)
    rg[..., 0] = img16 >> 8
    rg[..., 1] = img16 & 255
    Image.fromarray(rg, 'RGB').save(os.path.join(OUT, 'terrain_rg.png'), optimize=True)
    heights = h * (size_y / 32766.0) + uy0
    info = {
        'file': 'terrain.png', 'fileRG': 'terrain_rg.png', 'width': res, 'height': res,
        'x0': ux0, 'z0': -(uz0 + size_z), 'sizeX': size_x, 'sizeZ': size_z,
        'y0': uy0, 'sizeY': size_y, 'sampleSpacing': sc['x'],
        'heightFormula': 'y = y0 + (value/65535) * sizeY ; value = R*256+G for terrain_rg.png',
        'rows': 'row j is z = z0 + j*sizeZ/(height-1) (three.js z); col i is x = x0 + i*sizeX/(width-1)',
        'minY': float(heights.min()), 'maxY': float(heights.max()),
    }
    return info, heights, (ux0, uz0, size_x, size_z)


def find_config_asset(S, key):
    """First MonoBehaviour outside the scene file whose typetree has `key` (e.g. GameConfigData)."""
    for (fn, pid), o in S.objs.items():
        if fn == S.main.lower() or o.type.name != 'MonoBehaviour':
            continue
        try:
            d = o.parse_as_dict()
        except Exception:
            continue
        if key in d:
            return o, d
    return None, None


def export_depth_mask(S, heights):
    """WaveController.waveHeightMask: G = water depth, A = wave steepness (CODE.md 4.5). GameConfigData.worldSize
    is not readable (typetree stripped), so the 1500 m world size is confirmed by correlating G with the terrain."""
    for g in S.top('Logic'):
        for c in S.walk(g):
            for cn, o in S.scripts(c):
                if cn != 'WaveController':
                    continue
                d = o.parse_as_dict()
                to = S.deref(o.assets_file, d['waveHeightMask'])
                if to is None:
                    return None
                tex = to.read()
                img = tex.image.convert('RGBA')  # PIL row 0 = top = largest v = smallest three.js z
                arr = np.asarray(img)
                img.save(os.path.join(OUT, 'depthmask.png'), optimize=True)
                gs = np.asarray(Image.fromarray(arr[..., 1]).resize((513, 513), Image.BILINEAR), np.float64)
                hs = np.asarray(Image.fromarray(heights[::-1].astype(np.float32)).resize((513, 513), Image.BILINEAR),
                                np.float64)
                corr = float(np.corrcoef(gs.ravel(), hs.ravel())[0, 1])
                slope, icpt = np.polyfit(gs.ravel() / 255.0, hs.ravel(), 1)
                return {'file': 'depthmask.png', 'width': img.width, 'height': img.height, 'name': tex.m_Name,
                        'worldSize': 1500.0, 'worldSizeSource': 'derived: G correlates %.3f (inverse) with the terrain '
                        'over its 1500 m square; GameConfigData.worldSize itself is unreadable' % corr,
                        'uv': 'u = (x + worldSize/2)/worldSize, v = (z_unity + worldSize/2)/worldSize as in the game; '
                              'in the png row 0 = v 1 = most negative three.js z, col 0 = most negative x',
                        'channels': 'G = depth (0 shallow..255 deep), A = wave steepness, R/B see game',
                        'seabedYFromG': {'formula': 'y = intercept + slope * G/255', 'slope': float(slope),
                                         'intercept': float(icpt), 'correlation': corr}}
    return None


# ---------------------------------------------------------------- landmask
def hull(pts):
    pts = sorted(set(map(tuple, pts)))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def clip_above(tri):
    """Part of a 3D triangle with y >= 0 as a polygon of (x, z) points."""
    out = []
    n = len(tri)
    for i in range(n):
        a, b = tri[i], tri[(i + 1) % n]
        ina, inb = a[1] >= 0, b[1] >= 0
        if ina:
            out.append((a[0], a[2]))
        if ina != inb:
            t = (0 - a[1]) / (b[1] - a[1])
            out.append((a[0] + t * (b[0] - a[0]), a[2] + t * (b[2] - a[2])))
    return out


class Mask:
    def __init__(self, x0, z0, x1, z1, res):
        self.x0, self.z0, self.res = x0, z0, res
        self.w, self.h = int(math.ceil((x1 - x0) / res)), int(math.ceil((z1 - z0) / res))
        self.img = Image.new('L', (self.w, self.h), 0)
        self.dr = ImageDraw.Draw(self.img)

    def poly(self, pts):  # pts in three.js (x, z)
        if len(pts) >= 3:
            self.dr.polygon([((x - self.x0) / self.res, (z - self.z0) / self.res) for x, z in pts], fill=255)


def boat_solid_layers():
    """Layers the 'Player' layer collides with per the physics matrix, narrowed to real obstacles
    (CollidesWithPlayer*, Ice); Monster/Grid/Harvest layers also collide but are not terrain."""
    env = UnityPy.load(os.path.join(DATA, 'globalgamemanagers'))
    names, matrix = None, None
    for o in env.objects:
        if o.type.name == 'TagManager':
            names = o.parse_as_dict()['layers']
        elif o.type.name == 'PhysicsManager':
            matrix = o.parse_as_dict()['m_LayerCollisionMatrix']
    p = names.index('Player')
    hit = [j for j in range(32) if matrix[p] >> j & 1 and names[j]]
    solid = {j for j in hit if names[j].startswith('CollidesWithPlayer') or names[j] == 'Ice'}
    return solid, {j: names[j] for j in hit}


def collect_colliders(S, M, mask_roots, solid):
    """Draw every solid collider crossing y=0 under the static roots into a list of footprints.
    Returns (footprints per collider kind counts, list of (kind, polygons))."""
    main = S.af
    stats = collections.Counter()
    shapes = []
    skip = SKIP_NAMES
    for rn in mask_roots:
        for rg in S.top(rn):
            for g in S.walk(rg, skip):
                cs = [(t, p) for t, p in S.comps(g) if t in ('BoxCollider', 'SphereCollider', 'CapsuleCollider',
                                                              'MeshCollider')]
                if not cs:
                    continue
                if not S.active(g):
                    stats['inactive'] += 1
                    continue
                if S.G[g]['m_Layer'] not in solid:
                    stats['layer_not_solid'] += 1
                    continue
                W = S.world(g)
                sx = np.linalg.norm(W[:3, :3], axis=0)
                for t, pid in cs:
                    d = S.obj(pid).parse_as_dict()
                    if d.get('m_IsTrigger') or not d.get('m_Enabled', True):
                        stats['trigger_or_disabled'] += 1
                        continue
                    if t == 'BoxCollider':
                        c, sz = d['m_Center'], d['m_Size']
                        corners = []
                        for ix in (-.5, .5):
                            for iy in (-.5, .5):
                                for iz in (-.5, .5):
                                    corners.append(W @ [c['x'] + ix * sz['x'], c['y'] + iy * sz['y'],
                                                        c['z'] + iz * sz['z'], 1])
                        corners = np.array(corners)[:, :3]
                        if not (corners[:, 1].min() <= 0 < corners[:, 1].max()):
                            stats['box_not_crossing'] += 1
                            continue
                        shapes.append(('box', [hull([(x, -z) for x, _, z in corners])]))
                    elif t == 'SphereCollider':
                        c = d['m_Center']
                        p = W @ [c['x'], c['y'], c['z'], 1]
                        r = d['m_Radius'] * sx.max()
                        if abs(p[1]) >= r:
                            stats['sphere_not_crossing'] += 1
                            continue
                        r0 = math.sqrt(r * r - p[1] * p[1])
                        shapes.append(('sphere', [[(p[0] + r0 * math.cos(a), -p[2] + r0 * math.sin(a))
                                                   for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)]]))
                    elif t == 'CapsuleCollider':
                        c, ax = d['m_Center'], d['m_Direction']
                        hgt = d['m_Height']
                        r = d['m_Radius'] * max(sx[(ax + 1) % 3], sx[(ax + 2) % 3])
                        half = max(hgt * sx[ax] / 2 - r, 0)
                        axis = W[:3, ax] / (np.linalg.norm(W[:3, ax]) or 1)
                        p = (W @ [c['x'], c['y'], c['z'], 1])[:3]
                        e0, e1 = p - axis * half, p + axis * half
                        if not (min(e0[1], e1[1]) - r < 0 < max(e0[1], e1[1]) + r):
                            stats['capsule_not_crossing'] += 1
                            continue
                        pts = []
                        for e in (e0, e1):
                            for a in np.linspace(0, 2 * math.pi, 16, endpoint=False):
                                pts.append((e[0] + r * math.cos(a), -e[2] + r * math.sin(a)))
                        shapes.append(('capsule', [hull(pts)]))
                    else:
                        mo = S.deref(main, d['m_Mesh'])
                        if mo is None:
                            stats['mesh_missing'] += 1
                            continue
                        try:
                            me = M.get(mo)
                        except Exception:
                            stats['mesh_unreadable'] += 1
                            continue
                        v = (np.c_[me['pos'], np.ones(len(me['pos']))] @ W.T)[:, :3]
                        if not (v[:, 1].min() <= 0 < v[:, 1].max()):
                            stats['mesh_not_crossing'] += 1
                            continue
                        polys = []
                        for sub in me['subs']:
                            tv = v[sub]  # (n, 3, 3)
                            ymin, ymax = tv[:, :, 1].min(1), tv[:, :, 1].max(1)
                            full = tv[ymin >= 0]
                            for tri in full:
                                polys.append([(x, -z) for x, _, z in tri])
                            for tri in tv[(ymin < 0) & (ymax >= 0)]:
                                polys.append([(x, -z) for x, z in clip_above(tri)])
                        shapes.append(('mesh', polys))
                    stats[shapes[-1][0]] += 1
    return stats, shapes


# ---------------------------------------------------------------- generic serialized-field summaries
NOISE_KEYS = {'m_GameObject', 'm_Script', 'm_Name', 'm_ObjectHideFlags', 'm_EditorHideFlags',
              'm_PrefabInstance', 'm_PrefabAsset', 'm_CorrespondingSourceObject', 'm_Version',
              'm_PersistentCalls', 'm_Calls', 'm_ExtensionData', 'ReferencedUnityObjects',
              'PrefabModificationsReferencedUnityObjects', 'PrefabModifications', 'Prefab',
              'SerializedFormat', 'SerializedBytesString', 'SerializationNodes', 'SerializedBytes'}
NOISE_SCRIPTS = {'Cullable', 'SimpleBuoyantObject', 'AudioPauseConfig', 'Volume2D', 'RandomizeAudioPlayback',
                 'NavMeshObstacle'}


def r5(x):
    return round(x, 5) if isinstance(x, float) else x


def is_pptr(v):
    return isinstance(v, dict) and set(v.keys()) == {'m_FileID', 'm_PathID'}


class Summ:
    def __init__(self, S):
        self.S = S

    def target(self, af, p, deep=0):
        """Resolve a PPtr: scene objects by path, assets by name/class/id (deep>0: more fields)."""
        S = self.S
        o = S.deref(af, p)
        if o is None:
            return None if not p['m_PathID'] else {'unresolved': [p['m_FileID'], p['m_PathID']]}
        t = o.type.name
        inscene = o.assets_file.name == S.main
        if inscene:
            if t == 'GameObject':
                return {'go': S.path(o.path_id)}
            d = o.parse_as_dict()
            gp = d.get('m_GameObject', {}).get('m_PathID')
            res = {'go': S.path(gp) if gp in S.G else None, 'component': t}
            if t == 'MonoBehaviour':
                res['class'] = S.script_name(o)
            return res
        if t == 'MonoBehaviour':
            d = o.parse_as_dict()
            res = {'asset': d.get('m_Name'), 'class': S.script_name(o)}
            if 'id' in d:
                res['id'] = d['id']
            if deep > 0:
                res['fields'] = self.fields(o.assets_file, d, deep - 1)
            return res
        try:
            d = o.parse_as_dict()
            return {'asset': d.get('m_Name', ''), 'type': t}
        except Exception:
            return {'type': t}

    def val(self, af, v, deep=0, depth=0):
        if isinstance(v, float):
            return r5(v)
        if isinstance(v, (int, str, bool)) or v is None:
            return v
        if isinstance(v, list):
            if len(v) and all(isinstance(x, (int, float)) for x in v):
                return [r5(x) for x in v[:512]]
            return [self.val(af, x, deep, depth + 1) for x in v[:96]]
        if is_pptr(v):
            return self.target(af, v, deep)
        if isinstance(v, dict):
            ks = set(v)
            if {'r', 'g', 'b', 'a'} <= ks and len(ks) == 4:
                return [r5(v['r']), r5(v['g']), r5(v['b']), r5(v['a'])]
            if {'x', 'y'} <= ks and ks <= {'x', 'y', 'z', 'w'}:
                return [r5(v[k]) for k in 'xyzw' if k in v]
            if 'm_Curve' in v and 'm_PreInfinity' in v:
                return {'keys': [[r5(k['time']), r5(k['value']), r5(k['inSlope']), r5(k['outSlope'])]
                                 for k in v['m_Curve']], 'pre': v['m_PreInfinity'], 'post': v['m_PostInfinity']}
            if 'key0' in v and 'ctime0' in v:
                nc, na = v.get('m_NumColorKeys', 8), v.get('m_NumAlphaKeys', 8)
                return {'mode': v.get('m_Mode'),
                        'colors': [[r5(v['ctime%d' % i] / 65535.0)] + [r5(v['key%d' % i][c]) for c in 'rgb']
                                   for i in range(nc)],
                        'alphas': [[r5(v['atime%d' % i] / 65535.0), r5(v['key%d' % i]['a'])]
                                   for i in range(na)]}
            if depth > 6:
                return '...'
            return self.fields(af, v, deep, depth + 1)
        return str(v)

    def fields(self, af, d, deep=0, depth=0):
        out = {}
        for k, v in d.items():
            if k in NOISE_KEYS:
                continue
            x = self.val(af, v, deep, depth)
            if x is None or x == [] or x == {}:
                continue
            out[k] = x
        return out

    def odin(self, o, deep=0):
        """Decoded Odin blob of a scene MonoBehaviour with {'$unity': i} resolved through
        ReferencedUnityObjects; HarvestableItemData and friends collapse to their `id` string."""
        d = o.parse_as_dict()
        sd = d.get('serializationData')
        if not sd or not len(sd.get('SerializedBytes') or []):
            return None
        try:
            tree = odin_decode(sd['SerializedBytes'])
        except Exception as e:
            return {'_odinError': str(e)}
        refs = sd.get('ReferencedUnityObjects') or []
        af = o.assets_file

        def conv(n):
            if isinstance(n, dict):
                if set(n) == {'$unity'}:
                    t = self.target(af, refs[n['$unity']], deep) if n['$unity'] < len(refs) else None
                    if isinstance(t, dict) and 'id' in t:
                        return t['id']
                    return t
                if '$array' in n and len([k for k in n if k != '$type']) == 1:
                    return [conv(x) for x in n['$array']]
                if '$items' in n and len([k for k in n if k != '$type']) == 1:
                    return [conv(x) for x in n['$items']]
                return {k: conv(v) for k, v in n.items() if (k != '$type' or deep) and not (k == 'comparer' and v == {})}
            if isinstance(n, list):
                return [conv(x) for x in n]
            return r5(n)
        return conv(tree)


# ---------------------------------------------------------------- markers
def three_pos(W):
    return [float(W[0, 3]), float(W[1, 3]), float(-W[2, 3])]


def rot_y(W):
    """three.js rotation.y for the object (yaw of the Unity world matrix, sign flipped by the z mirror)."""
    f = W[:3, 2]  # Unity forward in world
    return float(-math.atan2(f[0], f[2]))


def lossy(W):
    return [float(x) for x in np.linalg.norm(W[:3, :3], axis=0)]


def collider_volumes(S, M, g):
    """Shape + placement of every collider on a GameObject, in three.js coordinates."""
    W = S.world(g)
    out = []
    sc = lossy(W)
    for t, pid in S.comps(g):
        if t not in ('BoxCollider', 'SphereCollider', 'CapsuleCollider', 'MeshCollider'):
            continue
        d = S.obj(pid).parse_as_dict()
        v = {'shape': t[:-8].lower(), 'trigger': bool(d.get('m_IsTrigger')), 'pos': three_pos(W),
             'rotY': rot_y(W), 'scale': sc}
        if t == 'BoxCollider':
            c = d['m_Center']
            v['center'] = [c['x'], c['y'], -c['z']]
            v['size'] = [d['m_Size']['x'], d['m_Size']['y'], d['m_Size']['z']]
        elif t == 'SphereCollider':
            c = d['m_Center']
            v['center'] = [c['x'], c['y'], -c['z']]
            v['radius'] = d['m_Radius']
        elif t == 'CapsuleCollider':
            c = d['m_Center']
            v['center'] = [c['x'], c['y'], -c['z']]
            v['radius'], v['height'], v['direction'] = d['m_Radius'], d['m_Height'], 'xyz'[d['m_Direction']]
        else:
            mo = S.deref(S.af, d['m_Mesh'])
            if mo is not None:
                try:
                    me = M.get(mo)
                    wv = (np.c_[me['pos'], np.ones(len(me['pos']))] @ W.T)[:, :3]
                    v['mesh'] = me['name']
                    v['outlineXZ'] = [[round(x, 2), round(-z, 2)] for x, z in hull([(p[0], p[2]) for p in wv])]
                    v['y'] = [float(wv[:, 1].min()), float(wv[:, 1].max())]
                except Exception:
                    v['mesh'] = None
        out.append(v)
    return out


MARKER_CONTAINERS = {'HarvestPOIs': 'harvestPOI', 'InspectPOIs': 'inspectPOI', 'InspectPOI': 'inspectPOI',
                     'HarvestZones': 'harvestZone'}
VOLUME_CLASSES = {'ZoneCollider': 'zone', 'HarvestZone': 'harvestZone', 'SanityModifier': 'sanity',
                  'WeatherTrigger': 'weather', 'WaterPropertyModifier': 'waterProperty',
                  'BoundaryEnforcer': 'boundary'}
POI_CLASSES = {'HarvestPOI', 'ItemPOI', 'BaitHarvestPOI', 'PlacedHarvestPOI'}


def build_markers(S, M):
    sm = Summ(S)
    # script index over the gameplay part of the scene (UI canvases hold thousands of MonoBehaviours)
    by_go = {}
    for g in S.G:
        if not any(t == 'MonoBehaviour' for t, _ in S.comps(g)):
            continue
        by_go[g] = S.scripts(g)
    root_of = {}

    def root(g):
        if g not in root_of:
            p = S.parent(g)
            root_of[g] = S.name(g) if p is None else root(p)
        return root_of[g]
    by_go = {g: s for g, s in by_go.items() if root(g) != 'GameCanvases'}
    chosen = {}  # gpid -> kind

    def mark(g, kind):
        chosen.setdefault(g, kind)
    for g in S.G:
        p = S.parent(g)
        if p is not None and S.name(p) in MARKER_CONTAINERS and root(g) != 'GameCanvases':
            mark(g, MARKER_CONTAINERS[S.name(p)])
    for g in S.top('Docks') + [c for r in S.top('DLC1') for c in S.children(r) if S.name(c) == 'Docks']:
        for c in S.children(g):
            mark(c, 'dockRoot')
    for g in S.top('Boundary'):
        mark(g, 'boundary')
    for g, scs in by_go.items():
        for cn, _ in scs:
            if cn in VOLUME_CLASSES:
                mark(g, VOLUME_CLASSES[cn])
            elif cn and (cn.endswith('Dock') and cn != 'Dock' or cn == 'Dock'):
                mark(g, 'dock')
            elif cn and cn.endswith('PropertyModifier'):
                mark(g, 'waterProperty')
    markers = []
    for g, kind in sorted(chosen.items(), key=lambda kv: S.path(kv[0])):
        W = S.world(g)
        scs = by_go.get(g, [])
        fields, odin = {}, {}
        for cn, o in scs:
            if cn in NOISE_SCRIPTS:
                continue
            d = o.parse_as_dict()
            f = sm.fields(o.assets_file, d)
            if f:
                fields[cn] = f
            od = sm.odin(o)
            if od:
                odin[cn] = od
        m = {'name': S.name(g), 'kind': kind, 'root': root(g), 'path': S.path(g), 'active': S.active(g),
             'pos': three_pos(W), 'rotY': rot_y(W), 'scripts': [c for c, _ in scs], 'fields': fields}
        if odin:
            m['odin'] = odin
        vols = collider_volumes(S, M, g)
        if vols:
            m['colliders'] = vols
        for cn, od in odin.items():
            if cn in POI_CLASSES and 'harvestPOIData' in od:
                m['harvestPOIData'] = od['harvestPOIData']
        markers.append(m)
    return markers, by_go, sm


def hz_items(S, sm, o):
    d = o.parse_as_dict()
    ids = []
    for p in d.get('harvestableItems', []):
        t = sm.target(o.assets_file, p)
        ids.append(t.get('id') if t else None)
    return ids


def build_docks(S, M, sm, by_go):
    docks = []
    for g, scs in by_go.items():
        names = [c for c, _ in scs]
        dock = [(c, o) for c, o in scs if c == 'Dock' or (c and c.endswith('Dock'))]
        if not dock:
            continue
        cn, o = dock[0]
        d = o.parse_as_dict()
        W = S.world(g)
        entry = {'name': S.name(g), 'path': S.path(g), 'class': cn, 'pos': three_pos(W), 'rotY': rot_y(W)}
        dd = S.deref(o.assets_file, d['dockData']) if 'dockData' in d else None
        if dd is not None:
            dfields = dd.parse_as_dict()
            entry['dockData'] = {'asset': dfields.get('m_Name'), 'id': dfields.get('id'),
                                 'fields': sm.fields(dd.assets_file, dfields, 0)}
        dests = []
        for p in d.get('destinations', []) or []:
            do = S.deref(o.assets_file, p)
            if do is None:
                continue
            dg = do.parse_as_dict()['m_GameObject']['m_PathID']
            dd_ = do.parse_as_dict()
            dests.append({'class': S.script_name(do), 'id': dd_.get('id'),
                          'titleKey': sm.val(do.assets_file, dd_.get('titleKey')),
                          'go': S.path(dg), 'pos': three_pos(S.world(dg))})
        entry['destinations'] = dests
        ba = d.get('boatActionsDestination')
        if ba and ba['m_PathID']:
            bo = S.deref(o.assets_file, ba)
            if bo is not None:
                bg = bo.parse_as_dict()['m_GameObject']['m_PathID']
                entry['boatActionsDestination'] = {'go': S.path(bg), 'pos': three_pos(S.world(bg))}
        la = d.get('lookAtTarget')
        if la and la['m_PathID']:
            lo = S.deref(o.assets_file, la)
            if lo is not None:
                lg = lo.parse_as_dict()['m_GameObject']['m_PathID']
                entry['lookAtTarget'] = {'go': S.path(lg), 'pos': three_pos(S.world(lg))}
        slots, pois = [], []
        for c in S.walk(g):
            nm = S.name(c)
            Wc = S.world(c)
            if re.match(r'(?i)dockslot', nm):
                slots.append({'name': nm, 'pos': three_pos(Wc), 'rotY': rot_y(Wc)})
            for cls, oo in by_go.get(c, []):
                if cls in ('DockPOI', 'ConversationPOI'):
                    pois.append({'class': cls, 'name': nm, 'path': S.path(c), 'pos': three_pos(Wc),
                                 'rotY': rot_y(Wc),
                                 'fields': sm.fields(oo.assets_file, oo.parse_as_dict())})
        entry['slots'] = sorted(slots, key=lambda s: s['name'])
        entry['pois'] = pois
        docks.append(entry)
    return sorted(docks, key=lambda e: e['path'])


def build_volumes(S, M, sm, by_go):
    vols = []
    for g, scs in by_go.items():
        for cn, o in scs:
            if cn not in VOLUME_CLASSES:
                continue
            d = o.parse_as_dict()
            W = S.world(g)
            v = {'type': VOLUME_CLASSES[cn], 'class': cn, 'name': S.name(g), 'path': S.path(g),
                 'active': S.active(g), 'pos': three_pos(W), 'rotY': rot_y(W),
                 'colliders': collider_volumes(S, M, g), 'fields': sm.fields(o.assets_file, d)}
            if cn == 'ZoneCollider':
                z = d.get('zone')
                v['zoneNames'] = [n for n, b in (('THE_MARROWS', 1), ('GALE_CLIFFS', 2), ('STELLAR_BASIN', 4),
                                                 ('TWISTED_STRAND', 8), ('DEVILS_SPINE', 16), ('OPEN_OCEAN', 32),
                                                 ('PALE_REACH', 64)) if z == -1 or (z & b)]
            if cn == 'HarvestZone':
                v['items'] = hz_items(S, sm, o)
            if cn == 'SanityModifier':
                v['radius'] = [d.get('fullValueRadius'), d.get('partialValueRadius')]
            vols.append(v)
    return sorted(vols, key=lambda e: (e['type'], e['path']))


# ---------------------------------------------------------------- scenery -> lib.glb / instances.bin
def export_scenery(S, M, no_gltf):
    inst, stats = collect_instances(S, M)
    log('instances', dict(stats))
    mat_key = lambda m: (m.assets_file.name, m.path_id)
    vkey = lambda i: (i['mesh']['key'], tuple(mat_key(m) for m in i['mats']), i['mir'])
    variants = {}
    for i in inst:
        variants.setdefault(vkey(i), i)
    order = sorted(variants, key=lambda k: (variants[k]['mesh']['name'], str(k)))
    vid = {k: 'm%d' % n for n, k in enumerate(order)}
    glb = Glb()
    mats = {}
    meshes_info = {}
    for k in order:
        i = variants[k]
        ids = []
        for m in i['mats']:
            mk = mat_key(m)
            if mk not in mats:
                glb.materials.append(build_material(glb, m))
                mats[mk] = len(glb.materials) - 1
            ids.append(mats[mk])
        glb.mesh_variant(vid[k], i['mesh'], i['mir'], ids)
        me = i['mesh']
        pos = me['pos'] * (np.array([-1.0, 1.0, 1.0]) if i['mir'] else 1.0) * FLIP
        meshes_info[vid[k]] = {
            'name': me['name'] + ('_mirrored' if i['mir'] else ''),
            'tris': int(sum(len(t) for t in me['subs'])),
            'radius': round(float(np.linalg.norm(pos, axis=1).max()), 3),
            'bbox': [np.round(pos.min(0), 3).tolist(), np.round(pos.max(0), 3).tolist()],
            'materials': [glb.materials[x]['name'] for x in ids],
        }
    os.makedirs(OUT, exist_ok=True)
    raw = os.path.join(CACHE, 'lib_raw.glb')
    glb.write(raw)
    log('raw glb %.1f MB, %d variants, %d materials, %d textures' % (
        os.path.getsize(raw) / 1e6, len(order), len(glb.materials), len(glb.textures)))
    out = os.path.join(OUT, 'lib.glb')
    if no_gltf:
        shutil.copyfile(raw, out)
    else:
        npx = shutil.which('npx') or shutil.which('npx.cmd')
        # -kn keeps the m<N> node names, -vpf/-vtf keep float positions/uvs so the geometry can be read
        # without KHR_mesh_quantization node transforms; no -mm: every variant stays its own node.
        subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-kn', '-km', '-ke', '-vpf',
                        '-vtf'], check=True, stdout=subprocess.DEVNULL)
    log('lib.glb %.1f MB' % (os.path.getsize(out) / 1e6))

    # Vật nổi (SimpleBuoyantObject): tách khỏi instances.bin, xuất thành danh sách riêng trong world.json để
    # js/world.js cập nhật y mỗi khung. Mỗi mục là một vật chủ (phao, thuyền bến) với các mesh con của nó;
    # biến thể mesh vẫn nằm trong lib.glb như mọi instance khác (id m<N> không đổi).
    groups = collections.OrderedDict()
    for i in inst:
        if i['buoy'] is not None:
            groups.setdefault(i['buoy'], []).append(i)
    buoys = []
    for gid, parts in sorted(groups.items(), key=lambda kv: S.path(kv[0])):
        c = three_pos(S.world(gid))
        ps = []
        for i in parts:
            q = i['q'] if i['q'][3] >= 0 else -i['q']
            ps.append({'mesh': vid[vkey(i)], 'pos': [round(float(x), 4) for x in i['pos']],
                       'q': [round(float(x), 6) for x in q], 's': [round(float(x), 5) for x in i['s']]})
        buoys.append({'name': S.name(gid), 'path': S.path(gid), 'root': parts[0]['root'],
                      'x': round(c[0], 3), 'y': round(c[1], 4), 'z': round(c[2], 3), 'depth': round(parts[0]['buoyDepth'], 4),
                      'cell': '%d,%d' % (int(math.floor(c[0] / CELL)), int(math.floor(c[2] / CELL))), 'parts': ps})
    inst = [i for i in inst if i['buoy'] is None]
    log('buoyant containers %d (%d mesh parts) split out of the static instances' % (len(buoys), sum(len(b['parts']) for b in buoys)))

    regions = STATIC_ROOTS
    rows = []
    for i in inst:
        p = i['pos']
        cell = (int(math.floor(p[0] / CELL)), int(math.floor(p[2] / CELL)))
        rows.append((cell, int(vid[vkey(i)][1:]), regions.index(i['root']), i))
    rows.sort(key=lambda r: (r[0], r[1]))
    arr = np.zeros((len(rows), 10), np.float32)
    reg = np.zeros(len(rows), np.uint8)
    cells = collections.OrderedDict()
    cell_reg = collections.defaultdict(collections.Counter)
    for n, (cell, v, rg, i) in enumerate(rows):
        q = i['q']
        if q[3] < 0:
            q = -q
        arr[n] = [*i['pos'], *q, *i['s']]
        reg[n] = rg
        c = cells.setdefault('%d,%d' % cell, collections.OrderedDict())
        k = 'm%d' % v
        if k in c:
            c[k][1] += 1
        else:
            c[k] = [n, 1]
        cell_reg['%d,%d' % cell][regions[rg]] += 1
    arr.tofile(os.path.join(OUT, 'instances.bin'))
    reg.tofile(os.path.join(OUT, 'instance_roots.bin'))
    ext = np.c_[arr[:, 0], arr[:, 2]]
    rad = np.array([meshes_info['m%d' % v]['radius'] for _, v, _, _ in rows]) * arr[:, 7:10].max(1)
    bounds = {'minX': float((ext[:, 0] - rad).min()), 'maxX': float((ext[:, 0] + rad).max()),
              'minZ': float((ext[:, 1] - rad).min()), 'maxZ': float((ext[:, 1] + rad).max())}
    # how many non-empty cells a 250 m view circle touches
    rng = np.random.RandomState(1)
    keys = [tuple(map(int, k.split(','))) for k in cells]
    touched = []
    for _ in range(400):
        x, z = ext[rng.randint(len(ext))]
        n = 0
        for cx, cz in keys:
            nx = min(max(x, cx * CELL), (cx + 1) * CELL)
            nz = min(max(z, cz * CELL), (cz + 1) * CELL)
            if (nx - x) ** 2 + (nz - z) ** 2 <= 250 ** 2:
                n += 1
        touched.append(n)
    return dict(inst=len(rows), buoys=buoys, stats=dict(stats), meshes=meshes_info, cells=cells,
                cellRegion={k: v.most_common(1)[0][0] for k, v in cell_reg.items()}, regions=regions,
                bounds=bounds, touched=(float(np.mean(touched)), int(max(touched))),
                variants=len(order), unique_meshes=len({k[0] for k in order}),
                mirrored=int(sum(1 for r in rows if r[3]['mir'])))


# ---------------------------------------------------------------- scene config
def mat_summary(S, sm, o):
    d = o.parse_as_dict()
    sp = d['m_SavedProperties']
    out = {'name': d['m_Name']}
    try:
        sh = S.deref(o.assets_file, d['m_Shader'])
        out['shader'] = sh.read().m_ParsedForm.m_Name
    except Exception:
        pass
    cols = {}
    for k, c in sp['m_Colors']:
        cols[k] = [r5(c['r']), r5(c['g']), r5(c['b']), r5(c['a'])]
    out['colors'] = cols
    out['floats'] = {k: r5(v) for k, v in sp['m_Floats']}
    texs = {}
    for k, e in sp['m_TexEnvs']:
        t = S.deref(o.assets_file, e['m_Texture'])
        if t is not None:
            texs[k] = t.parse_as_dict().get('m_Name')
    out['textures'] = texs
    return out


def build_scene_config(S, M, sm, by_go):
    cfg = {'note': 'Serialized values straight from the Game scene; vectors are Unity-local unless a key says three.js. '
                   'Curves: keys [time,value,inSlope,outSlope]; gradients: colors [t,r,g,b], alphas [t,a].'}
    logic = {}
    for lg in S.top('Logic'):
        for c in S.walk(lg):
            for cn, o in by_go.get(c, []):
                if cn in NOISE_SCRIPTS or cn == 'CullingBrain':  # culling-group bookkeeping, 250 KB of arrays
                    continue
                d = o.parse_as_dict()
                e = {'path': S.path(c), 'fields': sm.fields(o.assets_file, d, deep=1)}
                od = sm.odin(o, deep=1)
                if od:
                    e['odin'] = od
                logic.setdefault(cn, []).append(e)
    cfg['logic'] = logic
    sanity = {}
    for g, scs in by_go.items():
        for cn, o in scs:
            if cn and 'Sanity' in cn and cn not in ('SanityModifier',) and g not in S.top('Logic'):
                sanity.setdefault(cn, []).append({'path': S.path(g),
                                                  'fields': sm.fields(o.assets_file, o.parse_as_dict(), 1)})
    cfg['sanityRelated'] = sanity
    for g in S.top('Directional Light'):
        W = S.world(g)
        f = W[:3, 2] / np.linalg.norm(W[:3, 2])
        for t, pid in S.comps(g):
            if t == 'Light':
                d = S.obj(pid).parse_as_dict()
                cfg['directionalLight'] = {
                    'pos': three_pos(W), 'dirThreeJS': [float(f[0]), float(f[1]), float(-f[2])],
                    'unityForward': [float(x) for x in f], 'type': d['m_Type'],
                    'color': sm.val(S.af, d['m_Color']), 'intensity': d['m_Intensity'],
                    'shadows': {k: r5(v) for k, v in d['m_Shadows'].items() if k in ('m_Type', 'm_Strength', 'm_Bias', 'm_NormalBias')}}
    for (fn, pid), o in S.objs.items():
        if fn != S.main.lower():
            continue
        if o.type.name == 'RenderSettings':
            d = o.parse_as_dict()
            rs = {k: sm.val(S.af, d[k]) for k in ('m_Fog', 'm_FogColor', 'm_FogMode', 'm_FogDensity',
                  'm_LinearFogStart', 'm_LinearFogEnd', 'm_AmbientSkyColor', 'm_AmbientEquatorColor',
                  'm_AmbientGroundColor', 'm_AmbientIntensity', 'm_AmbientMode', 'm_SubtractiveShadowColor',
                  'm_ReflectionIntensity', 'm_DefaultReflectionMode')}
            sk = S.deref(S.af, d['m_SkyboxMaterial'])
            rs['skyboxMaterial'] = mat_summary(S, sm, sk) if sk is not None else None
            cfg['renderSettings'] = rs
    rig = {}
    for g in S.G:
        for t, pid in S.comps(g):
            if t != 'MonoBehaviour':
                continue
            cn = S.script_name(S.obj(pid))
            if cn and ('FreeLook' in cn or 'Cinemachine' in cn and 'Brain' in cn or cn in ('PlayerCamera', 'FollowCameraInWorld')):
                if S.path(g).startswith('Docks') or 'Dock' in S.path(g).split('/')[0]:
                    continue
                rig.setdefault(cn, []).append({'path': S.path(g),
                                               'fields': sm.fields(S.af, S.obj(pid).parse_as_dict(), 0)})
    cfg['cameraRig'] = rig or 'no CinemachineFreeLook/PlayerCamera object in the Game scene (it lives in the Player prefab)'
    cfg['cameraRigNote'] = 'Scene has no Camera components; the player camera (PlayerCamera + CinemachineFreeLook) is spawned from a prefab at runtime.'
    return cfg


# ---------------------------------------------------------------- main
def jdump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, separators=(',', ':'), ensure_ascii=False)
    log('wrote %s %.2f MB' % (name, os.path.getsize(p) / 1e6))


def main():
    no_gltf = '--no-gltf' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    S = Scene(load_env())
    log('scene loaded: %d GameObjects' % len(S.G))
    M = Meshes()

    sc = export_scenery(S, M, no_gltf)
    terrain, heights, trect = export_terrain(S)
    depth = export_depth_mask(S, heights)
    world_size = depth['worldSize'] if depth else None

    markers, by_go, sm = build_markers(S, M)
    docks = build_docks(S, M, sm, by_go)
    volumes = build_volumes(S, M, sm, by_go)
    jdump('markers.json', {'version': 1, 'units': 'unity metres, three.js right-handed (z negated)',
                           'markers': markers, 'docks': docks, 'volumes': volumes})
    jdump('scene_config.json', build_scene_config(S, M, sm, by_go))

    # landmask
    b = sc['bounds']
    tx0, tz0 = terrain['x0'], terrain['z0']
    x0 = min(b['minX'], tx0) - 32
    x1 = max(b['maxX'], tx0 + terrain['sizeX']) + 32
    z0 = min(b['minZ'], tz0) - 32
    z1 = max(b['maxZ'], tz0 + terrain['sizeZ']) + 32
    x0, z0 = math.floor(x0 / 16) * 16, math.floor(z0 / 16) * 16
    x1, z1 = math.ceil(x1 / 16) * 16, math.ceil(z1 / 16) * 16
    mask = Mask(x0, z0, x1, z1, MASK_RES)
    solid, hit = boat_solid_layers()
    log('boat collides with layers', hit, '-> solid', sorted(solid))
    cstats, shapes = collect_colliders(S, M, STATIC_ROOTS, solid)
    log('colliders', dict(cstats))
    for kind, polys in shapes:
        for p in polys:
            mask.poly(p)
    land_cells = 0
    if heights.max() > 0:
        hh = heights[::-1]
        ys, xs = np.nonzero(hh > 0)
        for y, x in zip(ys, xs):
            mx = (tx0 + x * terrain['sampleSpacing'] - x0) / MASK_RES
            mz = (tz0 + y * terrain['sampleSpacing'] - z0) / MASK_RES
            mask.dr.rectangle([mx - 1, mz - 1, mx + 1, mz + 1], fill=255)
            land_cells += 1
    mask.img.point(lambda v: 255 if v else 0).convert('1').save(os.path.join(OUT, 'landmask.png'), optimize=True)
    white = float((np.asarray(mask.img) > 0).mean())
    log('landmask %dx%d, %.1f%% solid' % (mask.w, mask.h, white * 100))

    for k in ('x0', 'z0'):
        pass
    world = {
        'version': 1, 'units': 'unity metres',
        'handedness': 'three.js right-handed. Converted from Unity left-handed: position/vertex z -> -z, '
                      'quaternion (x,y,z,w) -> (-x,-y,z,w), triangle winding flipped. +x east, +z south (Unity z = -z).',
        'instanceFormat': 'instances.bin = float32[10*N]: px,py,pz,qx,qy,qz,qw,sx,sy,sz; scales are positive '
                          '(mirrored instances use separate mesh variants with the x mirror baked in). '
                          'instance_roots.bin = uint8[N] index into regions. Cell ranges [offset,count] are instance indices.',
        'bounds': b, 'cell': CELL, 'cellKey': 'floor(x/cell),floor(z/cell) in three.js coordinates',
        'regions': sc['regions'], 'cellRegion': sc['cellRegion'], 'meshes': sc['meshes'], 'cells': sc['cells'],
        'buoyFormat': 'buoys[] = SimpleBuoyantObject (SimpleBuoyantObject.cs:28-44) không nằm trong instances.bin: {name, path, '
                      'x, y, z (vị trí vật chủ, three.js), depth (objectDepth), cell (khoá ô như cells), parts[{mesh m<N>, pos, q, s}]}; '
                      'y của vật chủ lerp về sóng(x, z) + depth, mọi mesh con dời theo cùng độ lệch.',
        'buoys': sc['buoys'],
        'counts': {'instances': sc['inst'], 'buoys': len(sc['buoys']), 'variants': sc['variants'],
                   'uniqueMeshes': sc['unique_meshes'],
                   'mirrored': sc['mirrored'], 'cells': len(sc['cells']), 'filtered': sc['stats']},
        'viewRadius250CellsTouched': {'mean': round(sc['touched'][0], 2), 'max': sc['touched'][1]},
        'terrain': terrain, 'depthMask': depth, 'worldSize': world_size,
        'landmask': {'file': 'landmask.png', 'x0': x0, 'z0': z0, 'metresPerPixel': MASK_RES,
                     'width': mask.w, 'height': mask.h, 'white': 'solid: boat cannot pass',
                     'pixel': 'pixel (i,j) covers x in [x0+i*res, +res), z in [z0+j*res, +res) (three.js); row 0 = min z',
                     'source': {'colliders': dict(cstats), 'terrainAbove0Samples': land_cells,
                                'solidLayers': {str(k): v for k, v in sorted(hit.items()) if k in solid},
                                'method': 'non-trigger Mesh/Box/Sphere/Capsule colliders under the static roots (docks '
                                          'included) on layers the Player layer collides with (CollidesWithPlayer*, Ice) '
                                          'that straddle y=0; mesh colliders: union of the parts of their triangles at '
                                          'y>=0 projected to XZ. Ice blocks only stop a boat without the Icebreaker.'}},
    }
    jdump('world.json', world)
    tot = 0
    for f in sorted(os.listdir(OUT)):
        n = os.path.getsize(os.path.join(OUT, f))
        tot += n
        log('%-22s %8.2f MB' % (f, n / 1e6))
    log('total %.2f MB' % (tot / 1e6))


if __name__ == '__main__':
    main()
