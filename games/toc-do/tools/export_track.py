"""Export a Zing Speed visual track scene (Level_*_Art.unity) to art/tracks/<id>/.

Usage: python -I export_track.py <scene-name> <out-id> [--logic e_<name>] [--no-meshopt]

Output: track.glb (static geometry, world-baked, merged per material+lightmap), lm<N>.png lightmaps,
meta.json (fog, ambient, sun, sky, lightmaps, startPose), export.log (what was kept/skipped and why).

Lightmaps (what this game ships): ASTC, sRGB, Unity dLDR + Bakery shadowmask in alpha.
  rgb = baked indirect light (gamma space, decode x2), a = baked sun visibility (1 lit, 0 shadow).
  gamma-space shading: color = albedo * (2*lm.rgb + sunColor*sunIntensity*max(N.L,0)*lm.a) + emissive
"""
import io, json, math, os, re, struct, subprocess, sys, collections
import numpy as np
from PIL import Image
import UnityPy
from UnityPy.helpers import CompressionHelper
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs  # noqa: E402

GAME = os.path.dirname(HERE)
LM_NONE = 0xFFFE
SKIP_SHADER = re.compile(r'impostor|shadow|collider|occlu|trigger|invisible|^hidden/', re.I)
ALBEDO_SLOTS = ('_BaseMap', '_MainTex', '_Albedo', '_Diffuse', '_BaseColorMap', '_MainTexture')
BIG_TEX = re.compile(r'road|ground|lujie|lumian|dimian', re.I)
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    LOG.append(s)
    print(s, flush=True)


# --- bundle loading -------------------------------------------------------------------------
# index.jsonl records each bundle's file name, not the CAB-<hash> names inside, so externals
# cannot be resolved through zs.cab_map(); read the UnityFS directory of every bundle instead.
def _bundle_node_names(p):
    with open(p, 'rb') as f:
        d = f.read(4096)
        if not d.startswith(b'UnityFS\0'):
            return []
        i = 8
        ver = struct.unpack('>I', d[i:i + 4])[0]
        i += 4
        for _ in range(2):
            i = d.index(b'\0', i) + 1
        _size, csz, usz, flags = struct.unpack('>qIII', d[i:i + 20])
        i += 20
        if flags & 0x80:
            f.seek(-csz, 2)
        else:
            if ver >= 7:
                i = (i + 15) // 16 * 16
            f.seek(i)
        blk = f.read(csz)
    comp = flags & 0x3f
    info = blk if comp == 0 else CompressionHelper.decompress_lz4(blk, usz) if comp in (2, 3) else \
        CompressionHelper.decompress_lzma(blk) if comp == 1 else None
    if info is None:
        return []
    k = 16
    k += 4 + struct.unpack('>i', info[k:k + 4])[0] * 10
    nn = struct.unpack('>i', info[k:k + 4])[0]
    k += 4
    out = []
    for _ in range(nn):
        k += 20
        j = info.index(b'\0', k)
        out.append(info[k:j].decode())
        k = j + 1
    return out


def cab_map():
    m = {}
    for dp, _, fs in os.walk(os.path.join(zs.IFS, 'AssetBundles')):
        for fn in fs:
            p = os.path.join(dp, fn)
            try:
                for n in _bundle_node_names(p):
                    m[n.lower()] = p
            except Exception as e:  # a broken bundle should not stop the export
                log('cabmap: cannot read', p, e)
    return m


def load_with_deps(paths, depth=3):
    cm = cab_map()
    env = UnityPy.Environment()
    seen, todo, missing = set(), [os.path.join(zs.IFS, p) for p in paths], set()
    for _ in range(depth + 1):
        nxt = []
        for p in todo:
            if p not in seen:
                seen.add(p)
                env.load_file(p)
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for e in getattr(sf, 'externals', []):
                    n = os.path.basename(e.path).lower()
                    if n in cm:
                        if cm[n] not in seen:
                            nxt.append(cm[n])
                    else:
                        missing.add(n)
        if not nxt:
            break
        todo = nxt
    log(f'bundles loaded: {len(seen)}; unresolved externals: {sorted(missing)}')
    return env


# --- math -----------------------------------------------------------------------------------
def quat_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def trs(t):
    p, q, s = t['m_LocalPosition'], t['m_LocalRotation'], t['m_LocalScale']
    m = np.eye(4)
    m[:3, :3] = quat_mat((q['x'], q['y'], q['z'], q['w'])) * np.array([s['x'], s['y'], s['z']])
    m[:3, 3] = (p['x'], p['y'], p['z'])
    return m


def cv(v):
    return [round(float(v[0]), 4), round(float(v[1]), 4), round(float(-v[2]), 4)]


def col(c):
    return [round(c['r'], 4), round(c['g'], 4), round(c['b'], 4)]


# --- scene ----------------------------------------------------------------------------------
class Scene:
    def __init__(self, sf):
        self.sf = sf
        self.O = sf.objects
        self.typ = {pid: o.type.name for pid, o in self.O.items()}
        want = ('GameObject', 'Transform', 'MeshRenderer', 'MeshFilter', 'LODGroup', 'SkinnedMeshRenderer', 'Light')
        self.tt = {pid: self.O[pid].read_typetree() for pid, t in self.typ.items() if t in want}
        self.comps = {g: [c['component']['m_PathID'] for c in self.tt[g]['m_Component']]
                      for g, t in self.typ.items() if t == 'GameObject'}
        self.world, self.active, self.path = {}, {}, {}
        for pid, t in self.typ.items():
            if t == 'Transform' and self.tt[pid]['m_Father']['m_PathID'] == 0:
                self._walk(pid, np.eye(4), True, '')

    def comp(self, g, typ):
        return [c for c in self.comps[g] if self.typ.get(c) == typ]

    def _walk(self, t, parent, act, path):
        T = self.tt[t]
        g = T['m_GameObject']['m_PathID']
        G = self.tt[g]
        w = parent @ trs(T)
        a = act and bool(G['m_IsActive'])
        p = path + '/' + G['m_Name']
        self.world[g], self.active[g], self.path[g] = w, a, p
        for ch in T['m_Children']:
            self._walk(ch['m_PathID'], w, a, p)


def find_scene_file(env, scene_name):
    base = os.path.splitext(scene_name)[0]
    for f in env.files.values():
        for n, sf in getattr(f, 'files', {}).items():
            if n == 'BuildPlayer-' + base:
                return sf
    raise SystemExit(f'scene file BuildPlayer-{base} not found in loaded bundles')


# --- materials / textures -------------------------------------------------------------------
def tex_key(pptr):
    return (pptr.assetsfile.name if hasattr(pptr, 'assetsfile') and pptr.assetsfile else '', pptr.m_FileID, pptr.m_PathID)


class Mat:
    def __init__(self, m):
        self.m = m
        self.name = m.m_Name
        try:
            s = m.m_Shader.deref_parse_as_object()
            self.shader = s.m_ParsedForm.m_Name if s.m_ParsedForm else s.m_Name
        except Exception:
            self.shader = '?'
        sp = m.m_SavedProperties
        self.tex = {n: t for n, t in sp.m_TexEnvs if t.m_Texture.m_PathID != 0}
        self.f = dict(sp.m_Floats)
        self.c = {n: {'r': v.r, 'g': v.g, 'b': v.b, 'a': v.a} for n, v in sp.m_Colors}
        self.kw = set((m.m_ShaderKeywords or '').split())
        self.queue = m.m_CustomRenderQueue
        sl = self.shader.lower()
        self.albedo_slot = next((s for s in ALBEDO_SLOTS if s in self.tex), None)
        if '_ENABLE_ALPHATEST' in self.kw or 'alphatest' in sl or 'cutout' in sl or self.f.get('_AlphaClip', 0) > 0:
            self.alpha = 'MASK'
        elif '_ENABLE_ALPHABLEND' in self.kw or 'alphablend' in sl or 'transparent' in sl or self.queue >= 3000:
            self.alpha = 'BLEND'
        elif 'plant' in sl:
            self.alpha = 'MASK'
        else:
            self.alpha = 'OPAQUE'
        self.cutoff = float(self.f.get('_Cutoff', 0.5))
        self.double = self.f.get('_Cull', 2.0) == 0.0 or 'double' in sl
        tint_name = '_BaseColor' if sl.startswith(('qf_pbr', 'universal')) else '_Color'
        self.tint = self.c.get(tint_name) or self.c.get('_BaseColor') or self.c.get('_Color') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
        self.emissive = None
        if '_EMISSION' in self.kw and '_EmissionMap' in self.tex:
            e = self.c.get('_EmissionColor', {'r': 0, 'g': 0, 'b': 0})
            k = float(self.f.get('_EmissionScale', 1.0))
            if max(e['r'], e['g'], e['b']) * k > 0.01:
                self.emissive = [min(1.0, e['r'] * k), min(1.0, e['g'] * k), min(1.0, e['b'] * k)]
        self.layer2 = '_BaseMap2' if '_SECOND_LAYER' in self.kw and '_BaseMap2' in self.tex else None
        self.sky = 'sky' in sl
        self.water = 'water' in sl
        self.unlit = self.sky or 'no lm' in sl

    def st(self, slot):
        t = self.tex.get(slot)
        if not t:
            return (1.0, 1.0, 0.0, 0.0)
        return (t.m_Scale.x, t.m_Scale.y, t.m_Offset.x, t.m_Offset.y)


class Textures:
    """Decoded, resized, WebP-encoded images, deduplicated by (texture, alpha texture, size)."""

    def __init__(self):
        self.images, self.index = [], {}

    def get(self, mat, slot, cap, with_alpha):
        t = mat.tex[slot].m_Texture
        a = mat.tex.get('_AlphaTex') if with_alpha else None
        key = (tex_key(t), tex_key(a.m_Texture) if a else None, cap, with_alpha)
        if key in self.index:
            return self.index[key]
        try:
            tex = t.deref_parse_as_object()
            im = tex.image
        except Exception as e:
            log(f'  texture {slot} of {mat.name}: cannot decode ({e})')
            self.index[key] = None
            return None
        name = tex.m_Name
        if a:
            try:
                am = a.m_Texture.deref_parse_as_object().image
                ach = am.getchannel('A') if 'A' in am.getbands() and am.getextrema()[-1][0] < 250 else am.convert('L')
                im = im.convert('RGB')
                im.putalpha(ach.resize(im.size))
            except Exception as e:
                log(f'  alpha texture of {mat.name}: cannot decode ({e})')
        im = im.convert('RGBA' if with_alpha else 'RGB')
        if with_alpha and im.getextrema()[3][0] >= 250:
            with_alpha = False
            im = im.convert('RGB')
        w, h = im.size
        s = min(1.0, cap / max(w, h))
        if s < 1:
            im = im.resize((max(4, int(w * s)), max(4, int(h * s))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=82, method=6, alpha_quality=90)
        log(f'  tex {name} {w}x{h} -> {im.size[0]}x{im.size[1]} {"rgba" if with_alpha else "rgb"} {buf.tell() // 1024} KB')
        self.images.append({'name': name, 'data': buf.getvalue(), 'size': im.size, 'orig': (w, h), 'alpha': with_alpha})
        idx = len(self.images) - 1
        self.index[key] = idx
        return idx


# --- meshes ---------------------------------------------------------------------------------
class MeshCache:
    def __init__(self):
        self.c = {}

    def get(self, mesh):
        k = (mesh.object_reader.assets_file.name, mesh.object_reader.path_id)
        if k in self.c:
            return self.c[k]
        h = MeshHandler(mesh)
        h.process()
        pos = np.asarray(h.m_Vertices, dtype=np.float64).reshape(-1, 3)
        n = len(pos)

        def arr(v, d):
            if v is None or len(v) != n:
                return None
            return np.asarray(v, dtype=np.float64).reshape(n, -1)[:, :d]
        nrm = arr(h.m_Normals, 3)
        uv0 = arr(h.m_UV0, 2)
        uv1 = arr(h.m_UV1, 2)
        colr = arr(h.m_Colors, 4)
        subs = []
        idx = h.m_IndexBuffer or []
        for sm in mesh.m_SubMeshes:
            first = sm.firstByte // (2 if h.m_Use16BitIndices else 4)
            tri = np.asarray(idx[first:first + sm.indexCount], dtype=np.int64)
            if sm.topology != 0:
                log(f'  mesh {mesh.m_Name}: submesh topology {sm.topology} ignored')
                tri = np.zeros(0, dtype=np.int64)
            subs.append(tri.reshape(-1, 3) + (sm.baseVertex or 0))
        r = {'name': mesh.m_Name, 'pos': pos, 'nrm': nrm, 'uv0': uv0, 'uv1': uv1, 'col': colr, 'subs': subs}
        self.c[k] = r
        return r


# --- glb writer -----------------------------------------------------------------------------
class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': 'toc-do export_track.py'}, 'scene': 0,
                  'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'textures': [],
                  'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
                  'accessors': [], 'bufferViews': [], 'buffers': [],
                  'extensionsUsed': ['EXT_texture_webp'], 'extensionsRequired': ['EXT_texture_webp']}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.bin += data
        self.j['bufferViews'].append(v)
        return len(self.j['bufferViews']) - 1

    def acc(self, a, typ, target, minmax=False):
        ct = 5125 if a.dtype == np.uint32 else 5126
        bv = self.view(a.tobytes(), target)
        d = {'bufferView': bv, 'componentType': ct, 'count': int(a.shape[0]), 'type': typ}
        if minmax:
            d['min'] = a.min(0).tolist()
            d['max'] = a.max(0).tolist()
        self.j['accessors'].append(d)
        return len(self.j['accessors']) - 1

    def image(self, data):
        bv = self.view(data)
        self.j['images'].append({'bufferView': bv, 'mimeType': 'image/webp'})
        self.j['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(self.j['images']) - 1}}})
        return len(self.j['textures']) - 1

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


# --- logic config (start pose) --------------------------------------------------------------
def start_pose(logic):
    rows = zs.find(f'environments/{logic}/model/pick/checkpointconfig.asset')
    cfg = None
    for r in rows:
        try:
            env = UnityPy.load(os.path.join(zs.IFS, r['f']))
            for o in env.objects:
                if o.type.name == 'MonoBehaviour':
                    t = o.read_typetree()
                    if 'CheckPointDataList' in t:
                        cfg = t
                        break
        except Exception as e:
            log('checkpointconfig read failed:', r['f'], e)
        if cfg:
            break
    if not cfg:
        dump = os.path.join(zs.REF, 'dump', logic.replace('e_', '') + '_CheckPointConfig.json')
        if os.path.exists(dump):
            cfg = json.load(open(dump))
    if not cfg:
        log(f'start pose: no checkpointconfig for {logic}')
        return None, None
    cp = cfg['CheckPointDataList'][cfg.get('RaceStartCheckPointIndex', 0)]
    p, fw = cp['Position'], cp['Forward']
    pose = {'pos': cv((p['x'], p['y'], p['z'])), 'forward': cv((fw['x'], fw['y'], fw['z'])), 'checkpoint': cp['PointID']}
    pts = [cv((q['Position']['x'], q['Position']['y'], q['Position']['z'])) for q in cfg.get('TrackPointDataList', [])]
    return pose, pts


def export_lightmaps(O, out):
    lm_meta = []
    for o in O.values():
        if o.type.name != 'LightmapSettings':
            continue
        ls = o.read()
        for i, e in enumerate(ls.m_Lightmaps):
            try:
                t = e.m_Lightmap.deref_parse_as_object()
            except Exception as ex:
                log(f'lightmap {i}: cannot read ({ex})')
                continue
            im = t.image.convert('RGBA')
            fn = f'lm{i}.png'
            im.save(os.path.join(out, fn), optimize=True)
            a = np.asarray(im).astype(np.float32) / 255
            log(f'lightmap {i}: {t.m_Name} {t.m_Width}x{t.m_Height} fmt={t.m_TextureFormat} colorSpace={t.m_ColorSpace} '
                f'rgb mean={a[..., :3].mean():.3f} max={a[..., :3].max():.3f} alpha mean={a[..., 3].mean():.3f}')
            lm_meta.append({'index': i, 'file': fn, 'size': [t.m_Width, t.m_Height], 'source': t.m_Name,
                            'encoding': 'dLDR+shadowmask', 'rgbScale': 2.0,
                            'decode': 'rgb: gamma-space indirect light, x2 (Unity dLDR); a: baked sun visibility (Bakery shadowmask)'})
        log(f'lightmapsMode={ls.m_LightmapsMode} useShadowmask={getattr(ls, "m_UseShadowmask", None)}')
    return lm_meta


# --- main -----------------------------------------------------------------------------------
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = {a.split('=')[0]: (a.split('=') + [''])[1] for a in sys.argv[1:] if a.startswith('--')}
    if len(args) != 2:
        raise SystemExit(__doc__)
    scene_name, out_id = args
    if not scene_name.endswith('.unity'):
        scene_name += '.unity'
    logic = opts.get('--logic') or 'e_' + re.sub(r'^Level_|_Art$', '', os.path.splitext(scene_name)[0]).lower()
    out = os.path.join(GAME, 'art', 'tracks', out_id)
    os.makedirs(out, exist_ok=True)
    for fn in os.listdir(out):
        if re.match(r'(track\.glb|lm\d+\.png|sky\.webp|meta\.json|export\.log)$', fn):
            os.remove(os.path.join(out, fn))

    rows = [r for r in zs.find(scene_name) if any(c.endswith('/' + scene_name) for c in r['cont'])]
    if not rows:
        raise SystemExit(f'scene {scene_name} not in index')
    log(f'scene {scene_name}: bundle {rows[0]["f"]}')
    env = load_with_deps([rows[0]['f']])
    S = Scene(find_scene_file(env, scene_name))
    O, tt, typ = S.O, S.tt, S.typ

    lod_drop = set()
    for pid, t in typ.items():
        if t == 'LODGroup':
            lods = tt[pid]['m_LODs']
            keep = {r['renderer']['m_PathID'] for r in lods[0]['renderers']} if lods else set()
            for L in lods[1:]:
                for r in L['renderers']:
                    if r['renderer']['m_PathID'] not in keep:
                        lod_drop.add(r['renderer']['m_PathID'])

    lm_meta = export_lightmaps(O, out)
    lm_ok = {l['index'] for l in lm_meta}
    mats, meshes, texs = {}, MeshCache(), Textures()
    groups = collections.OrderedDict()
    skipped = collections.Counter()
    shader_slots = collections.defaultdict(set)

    def skip(reason, what):
        skipped[reason] += 1
        log(f'skip [{reason}] {what}')

    for pid, t in typ.items():
        if t == 'SkinnedMeshRenderer':
            g = tt[pid]['m_GameObject']['m_PathID']
            skip('skinned', S.path[g])
    for pid, t in typ.items():
        if t != 'MeshRenderer':
            continue
        R = tt[pid]
        g = R['m_GameObject']['m_PathID']
        where = S.path[g]
        if not S.active[g]:
            skipped['inactive'] += 1
            continue
        if not R['m_Enabled']:
            skip('renderer disabled', where)
            continue
        if pid in lod_drop:
            skipped['lod>0'] += 1
            continue
        mfs = S.comp(g, 'MeshFilter')
        if not mfs:
            skip('no meshfilter', where)
            continue
        try:
            mesh = O[mfs[0]].read().m_Mesh.deref_parse_as_object()
        except Exception as e:
            skip('mesh unresolved', f'{where} ({str(e)[:60]})')
            continue
        if R['m_StaticBatchInfo']['subMeshCount']:
            log(f'warn: {where} is static-batched; vertices may already be world space')
        M = meshes.get(mesh)
        world = S.world[g]
        lmi = R['m_LightmapIndex']
        so = R.get('m_LightmapScaleOffset') or R['m_LightmapTilingOffset']
        rmats = O[pid].read().m_Materials
        for si, tri in enumerate(M['subs']):
            if si >= len(rmats) or not len(tri):
                continue
            mp = rmats[si]
            mk = (mp.m_FileID, mp.m_PathID)
            if mk not in mats:
                try:
                    mats[mk] = Mat(mp.deref_parse_as_object())
                    shader_slots[mats[mk].shader] |= set(mats[mk].tex)
                except Exception as e:
                    mats[mk] = None
                    log(f'material unresolved {mk}: {e}')
            mat = mats[mk]
            if mat is None:
                skip('material unresolved', where)
                continue
            if SKIP_SHADER.search(mat.shader):
                skip('helper shader ' + mat.shader, where)
                continue
            if mat.albedo_slot is None and not mat.sky:
                log(f'note: {where} material {mat.name} ({mat.shader}) has no albedo texture; tint only')
            sky = mat.sky or '/no_pvs/' in where.lower() and 'sky' in where.lower()
            lm = lmi if (lmi < LM_NONE and not sky and not mat.unlit) else -1
            if lm >= 0 and lm not in lm_ok:
                log(f'note: {where} uses lightmap {lm} which has no texture; drawn unlightmapped')
                lm = -1
            key = (mk, lm, sky)
            gr = groups.setdefault(key, {'mat': mat, 'lm': lm, 'sky': sky, 'parts': [], 'objs': set()})
            gr['parts'].append((M, si, world, so))
            gr['objs'].add(M['name'])

    log('skipped: ' + ', '.join(f'{k}={v}' for k, v in skipped.items()))
    for sh, slots in sorted(shader_slots.items()):
        log(f'shader {sh}: texture slots {sorted(slots)}')

    glb = GLB()
    tex_glb = {}
    prims = 0
    used_lm = set()
    sky_info = None
    for (mk, lm, sky), gr in groups.items():
        mat = gr['mat']
        su, sv, ou, ov = mat.st(mat.albedo_slot) if mat.albedo_slot else (1, 1, 0, 0)
        P, N, U0, U1, C, I = [], [], [], [], [], []
        base = 0
        for M, si, world, so in gr['parts']:
            tri = M['subs'][si]
            used = np.unique(tri)
            remap = np.full(len(M['pos']), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            pos = M['pos'][used]
            p = (world[:3, :3] @ pos.T).T + world[:3, 3]
            P.append(p * [1, 1, -1])
            nm = np.linalg.inv(world[:3, :3]).T
            if M['nrm'] is not None:
                n = (nm @ M['nrm'][used].T).T
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
            else:
                n = np.tile([0.0, 1.0, 0.0], (len(used), 1))
            N.append(n * [1, 1, -1])
            uv = M['uv0'][used] if M['uv0'] is not None else np.zeros((len(used), 2))
            uv = uv * [su, sv] + [ou, ov]
            U0.append(np.stack([uv[:, 0], 1 - uv[:, 1]], 1))
            if lm >= 0:
                l = M['uv1'] if M['uv1'] is not None else M['uv0']
                l = l[used] if l is not None else np.zeros((len(used), 2))
                l = l * [so['x'], so['y']] + [so['z'], so['w']]
                U1.append(np.stack([l[:, 0], 1 - l[:, 1]], 1))
            if mat.layer2:
                C.append(M['col'][used] if M['col'] is not None else np.ones((len(used), 4)))
            t = remap[tri]
            # Unity->three z flip mirrors the mesh; a mirrored world matrix mirrors it back
            if np.linalg.det(world[:3, :3]) > 0:
                t = t[:, [0, 2, 1]]
            I.append(t + base)
            base += len(used)
        P = np.concatenate(P).astype(np.float32)
        attrs = {'POSITION': glb.acc(P, 'VEC3', 34962, True),
                 'NORMAL': glb.acc(np.concatenate(N).astype(np.float32), 'VEC3', 34962),
                 'TEXCOORD_0': glb.acc(np.concatenate(U0).astype(np.float32), 'VEC2', 34962)}
        if lm >= 0:
            attrs['TEXCOORD_1'] = glb.acc(np.concatenate(U1).astype(np.float32), 'VEC2', 34962)
            used_lm.add(lm)
        if C:
            attrs['COLOR_0'] = glb.acc(np.concatenate(C).astype(np.float32), 'VEC4', 34962)
        ind = glb.acc(np.concatenate(I).reshape(-1).astype(np.uint32), 'SCALAR', 34963)

        gm = {'name': mat.name, 'pbrMetallicRoughness': {
            'baseColorFactor': [mat.tint['r'], mat.tint['g'], mat.tint['b'], 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 1.0}}
        if mat.albedo_slot:
            big = BIG_TEX.search(mat.name) or sky
            ti = texs.get(mat, mat.albedo_slot, 1024 if big else 512, mat.alpha != 'OPAQUE')
            if ti is not None:
                if ti not in tex_glb:
                    tex_glb[ti] = glb.image(texs.images[ti]['data'])
                gm['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_glb[ti]}
        if mat.alpha != 'OPAQUE':
            gm['alphaMode'] = mat.alpha
            if mat.alpha == 'MASK':
                gm['alphaCutoff'] = mat.cutoff
        if mat.double:
            gm['doubleSided'] = True
        if mat.emissive:
            if mat.st('_EmissionMap') != mat.st(mat.albedo_slot):
                log(f'note: {mat.name} emission tiling {mat.st("_EmissionMap")} differs from albedo; emission uses albedo UVs')
            ei = texs.get(mat, '_EmissionMap', 512, False)
            if ei is not None:
                if ei not in tex_glb:
                    tex_glb[ei] = glb.image(texs.images[ei]['data'])
                gm['emissiveTexture'] = {'index': tex_glb[ei]}
                gm['emissiveFactor'] = mat.emissive
        extras = {'shader': mat.shader, 'lightmap': lm, 'renderQueue': mat.queue}
        if mat.layer2:
            # second layer blended by vertex color alpha; uv = TEXCOORD_0 * scale + offset (TEXCOORD_0 has layer 1 tiling baked).
            # Textures ride in occlusion/metallicRoughness slots: gltf-transform renumbers textures, so extras cannot hold indices.
            l2 = texs.get(mat, mat.layer2, 512, False)
            if l2 is not None:
                if l2 not in tex_glb:
                    tex_glb[l2] = glb.image(texs.images[l2]['data'])
                def rel_uv(slot):
                    s2u, s2v, o2u, o2v = mat.st(slot)
                    ku, kv = s2u / su, s2v / sv
                    return {'uvScale': [ku, kv], 'uvOffset': [o2u - ou * ku, 1 - o2v - (1 - ov) * kv]}
                c2 = mat.c.get('_BaseColor2', {'r': 1, 'g': 1, 'b': 1})
                gm['occlusionTexture'] = {'index': tex_glb[l2]}
                f = mat.f
                # parameters of the layer-1 weight computed in the game's GLES3 shader (see trackview.html)
                extras['layer2'] = dict(rel_uv(mat.layer2), texture='occlusionTexture', tint=[c2['r'], c2['g'], c2['b']],
                                        intensity1=f.get('_BaseColorIntensity', 1.0), intensity2=f.get('_BaseColor2Intensity', 1.0),
                                        heightContrast=f.get('_HeightContrast', 0.5), heightOffset=f.get('_HeightOffset', 0.5),
                                        inputVertexAlpha=f.get('_InputVertexAlpha', 0.0), normalZMask=f.get('_NormalZMask', 0.0),
                                        normalZMaskMul=f.get('_NormalZMaskMul', 0.0), normalZMaskAdd=f.get('_NormalZMaskAdd', 0.0))
                if '_HEIGHT_MASK' in mat.kw and '_HeightMaskTex' in mat.tex:
                    hm = texs.get(mat, '_HeightMaskTex', 256, False)
                    if hm is not None:
                        if hm not in tex_glb:
                            tex_glb[hm] = glb.image(texs.images[hm]['data'])
                        gm['pbrMetallicRoughness']['metallicRoughnessTexture'] = {'index': tex_glb[hm]}
                        extras['layer2']['mask'] = dict(rel_uv('_HeightMaskTex'), texture='metallicRoughnessTexture')
        if sky:
            extras['sky'] = True
        if mat.water:
            extras['water'] = True
        if mat.unlit:
            extras['unlit'] = True
        gm['extras'] = extras
        glb.j['materials'].append(gm)
        mi = len(glb.j['materials']) - 1
        name = ('sky:' if sky else '') + mat.name + (f'|lm{lm}' if lm >= 0 else '')
        glb.j['meshes'].append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mi, 'extras': extras}]})
        glb.j['nodes'].append({'name': name, 'mesh': len(glb.j['meshes']) - 1, 'extras': extras})
        glb.j['scenes'][0]['nodes'].append(len(glb.j['nodes']) - 1)
        prims += 1
        ntri = sum(len(x) for x in I)
        log(f'prim {name}: {mat.shader} alpha={mat.alpha} tris={ntri} verts={len(P)} from {sorted(gr["objs"])[:6]}')
        if sky:
            c = (P.min(0) + P.max(0)) / 2
            sky_info = {'type': 'mesh', 'node': name, 'shader': mat.shader,
                        'center': [round(float(x), 2) for x in c],
                        'radius': round(float(np.linalg.norm(P - c, axis=1).max()), 2)}

    raw = os.path.join(out, 'track.raw.glb')
    glb.write(raw)
    glb_path = os.path.join(out, 'track.glb')
    if '--no-meshopt' in opts:
        os.replace(raw, glb_path)
    else:
        cmd = ['npx', '-y', '@gltf-transform/cli@4', 'meshopt', raw, glb_path]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log('meshopt failed, keeping uncompressed glb:', r.stderr[-500:])
            os.replace(raw, glb_path)
        else:
            os.remove(raw)

    log('lightmaps used by primitives: ' + str(sorted(used_lm)))

    rs = next(o.read_typetree() for o in O.values() if o.type.name == 'RenderSettings')
    fog = {'enabled': bool(rs['m_Fog']), 'mode': {1: 'linear', 2: 'exp', 3: 'exp2'}.get(rs['m_FogMode'], rs['m_FogMode']),
           'color': col(rs['m_FogColor']), 'density': rs['m_FogDensity'], 'start': rs['m_LinearFogStart'], 'end': rs['m_LinearFogEnd']}
    ambient = {'mode': {0: 'skybox', 1: 'trilight', 3: 'flat', 4: 'custom'}.get(rs['m_AmbientMode'], rs['m_AmbientMode']),
               'sky': col(rs['m_AmbientSkyColor']), 'equator': col(rs['m_AmbientEquatorColor']),
               'ground': col(rs['m_AmbientGroundColor']), 'intensity': rs['m_AmbientIntensity']}
    if rs['m_SkyboxMaterial']['m_PathID']:
        log('note: RenderSettings has a skybox material; only the sky mesh is exported')
    sun = None
    for pid, t in typ.items():
        if t == 'Light' and tt[pid]['m_Type'] == 1 and tt[pid]['m_Enabled']:
            g = tt[pid]['m_GameObject']['m_PathID']
            if not S.active[g]:
                continue
            L = tt[pid]
            fwd = S.world[g][:3, :3] @ np.array([0, 0, 1.0])
            fwd /= np.linalg.norm(fwd)
            sun = {'dir': cv(fwd), 'color': col(L['m_Color']), 'intensity': round(L['m_Intensity'], 4),
                   'bake': L['m_BakingOutput']['lightmapBakeMode']['lightmapBakeType'], 'mixedMode': L['m_BakingOutput']['lightmapBakeMode']['mixedLightingMode']}
            break
    pose, pts = start_pose(logic)
    meta = {'id': out_id, 'scene': scene_name, 'logic': logic, 'glb': 'track.glb', 'primitives': prims,
            'colorSpace': 'gamma', 'fog': fog, 'ambient': ambient, 'sun': sun, 'sky': sky_info,
            'lightmaps': lm_meta, 'startPose': pose,
            'shading': 'gamma space, textures not sRGB-decoded: lit = albedo*(lm.rgb*rgbScale + sun.color*sun.intensity*max(dot(N,-sun.dir),0)*lm.a) + emissive; '
                       'no lightmap: albedo*(ambient.sky + sun term) ; sky/unlit: albedo',
            'trackPoints': [[round(v, 2) for v in q] for q in pts] if pts else None}
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        f.write(json.dumps({k: v for k, v in meta.items() if k != 'trackPoints'}, indent=1)[:-2])
        f.write(',\n "trackPoints": ' + json.dumps(meta['trackPoints'], separators=(',', ':')) + '\n}\n')

    tot = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    log(f'done: {prims} primitives, {len(texs.images)} textures '
        f'({sum(len(i["data"]) for i in texs.images) / 1e6:.2f} MB webp), {len(lm_meta)} lightmaps, folder {tot / 1e6:.2f} MB')
    with open(os.path.join(out, 'export.log'), 'w') as f:
        f.write('\n'.join(LOG) + '\n')


if __name__ == '__main__':
    main()
