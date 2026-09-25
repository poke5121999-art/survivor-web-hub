# -*- coding: utf-8 -*-
"""rip.py [spine|sector|audio|ui|all] [--ids a,b,c] -- boc asset theo tools/manifest.json
(sinh boi build_data.py) thang tu ban Steam. Tu chua: dung vd_common.py, khong dung vd-ref/.

    set PYTHONIOENCODING=utf-8
    python rip.py spine            # 4 nhan vat + moi quai/npc scoped (theo unit_map)
    python rip.py spine-meta       # chi ghi lai defaultMix + mixes (SkeletonDataAsset) vao art/spine/*/meta.json
    python rip.py sector           # 40 sector scoped
    python rip.py audio            # sfx+bgm trong manifest
    python rip.py ui               # icon atlas + font
    python rip.py all

Ghi de ra ngoai games/voiddiver/{art,audio,vendor,data/assets.js}. Cache trung gian rieng cua
rip.py (bundle_index, unit_map) nam o %TEMP%/voiddiver-rip/ - khong dinh vao git.
"""
import io, json, os, re, shutil, struct, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vd_common as vd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art')
AUDIO = os.path.join(ROOT, 'audio')
DATA = os.path.join(ROOT, 'data')
MANIFEST_P = os.path.join(os.path.dirname(__file__), 'manifest.json')


def load_manifest():
    return json.load(open(MANIFEST_P, encoding='utf-8'))


def save_manifest(m):
    json.dump(m, open(MANIFEST_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


# =====================================================================  SPINE
def tbytes(ta):
    s = ta.m_Script
    return s if isinstance(s, bytes) else s.encode('utf-8', 'surrogateescape')


UNIT_MAP_VERSION = 2  # bump khi doi truong thu thap -> ep vd_common cache lam lai


def build_unit_map(ids_wanted):
    """GameObject name (== Character/Monster/Npc Id dang chuoi) -> {skels, scale, radius,
    height, shadowRadius} - doc thang tu prefab (khong dung vd-ref cache)."""
    cache_p = os.path.join(vd.CACHE, 'unit_map_v%d.json' % UNIT_MAP_VERSION)
    if os.path.exists(cache_p):
        full = json.load(open(cache_p, encoding='utf-8'))
    else:
        fu = vd.bfile('remote_prefab_assets_unit')
        deps = [vd.bfile('be9e4d904692f945f3910b57349aeb09_monoscripts'),
                vd.bfile('dependencies_assets_spine')]

        def run(env):
            res = {}
            roots = [t for sf in vd.serialized_files(env, fu) for t in vd.roots_of(sf)]
            for t in roots:
                g = t.m_GameObject.deref_parse_as_object()
                info = {'skels': [], 'scale': t.m_LocalScale.x, 'radius': None, 'height': None,
                        'shadowRadius': None}
                stack = [t]
                while stack:
                    tr = stack.pop()
                    gg = tr.m_GameObject.deref_parse_as_object()
                    for c in gg.m_Component:
                        ob = c.component if hasattr(c, 'component') else c
                        if ob.path_id == 0:
                            continue
                        try:
                            oo = ob.deref()
                        except Exception:
                            continue
                        if oo.type.name == 'CapsuleCollider':
                            try:
                                ct = oo.read_typetree()
                                info['radius'] = round(ct.get('m_Radius', 0), 4)
                                info['height'] = round(ct.get('m_Height', 0), 4)
                            except Exception:
                                pass
                            continue
                        if oo.type.name != 'MonoBehaviour':
                            continue
                        try:
                            tt = oo.read_typetree()
                        except Exception:
                            continue
                        if 'skeletonDataAsset' in tt and 'initialSkinName' in tt:
                            try:
                                sda = oo.read().skeletonDataAsset.deref_parse_as_object()
                                sname = sda.m_Name
                            except Exception:
                                sname = None
                            info['skels'].append({'go': gg.m_Name, 'sda': sname, 'skin': tt.get('initialSkinName')})
                        else:
                            for k in tt:
                                if 'blobshadowradius' in k.lower() or (k.lower() == 'radius' and 'shadow' in gg.m_Name.lower()):
                                    try:
                                        info['shadowRadius'] = round(float(tt[k]), 4)
                                    except Exception:
                                        pass
                    for ch in tr.m_Children:
                        stack.append(ch.deref_parse_as_object())
                res[g.m_Name] = info
            return res

        full = vd.with_deps(fu, run, deps=deps)
        json.dump(full, open(cache_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    out = {}
    for k in ids_wanted:
        ks = str(k)
        if ks in full:
            out[k] = full[ks]
    return out


def spine_base_names(um):
    """{id: base_name} rut tu SkeletonData 'X_SW_SkeletonData'/'X_NW_SkeletonData' -> 'X'."""
    out = {}
    for uid, info in um.items():
        for s in info['skels']:
            sda = s.get('sda')
            if not sda:
                continue
            base = re.sub(r'_(SW|NW)_SkeletonData$', '', sda)
            out.setdefault(uid, set()).add(base)
    return {k: sorted(v) for k, v in out.items()}


def rip_spine_names(names, out_root):
    f = vd.bfile('dependencies_assets_spine')

    def rip(env, want):
        objs = list(env.objects)
        adas, sdas = [], []
        for o in objs:
            t = o.type.name
            if t == 'MonoBehaviour':
                try:
                    tt = o.read_typetree()
                except Exception:
                    continue
                if 'skeletonJSON' in tt:
                    sdas.append((o, tt))
                elif 'atlasFile' in tt:
                    adas.append((o, tt))
        byid = {o.path_id: o for o in objs}
        done = {}
        for name in want:
            d = os.path.join(out_root, name)
            os.makedirs(d, exist_ok=True)
            meta = {'name': name, 'skeletons': {}, 'atlas': None, 'pages': [], 'materials': []}
            ada = [x for x in adas if x[1]['m_Name'] in (name + '_Atlas', name + '_SW_Atlas', name + '_NW_Atlas')]
            if not ada:
                print('  KHONG THAY atlas cho', name)
                continue
            ao, att = ada[0]
            at = byid[att['atlasFile']['m_PathID']].read()
            atext = tbytes(at).decode('utf-8').replace('\r\n', '\n')
            aname = at.m_Name.replace('.atlas', '')
            open(os.path.join(d, aname + '.atlas'), 'w', encoding='utf-8', newline='\n').write(atext)
            meta['atlas'] = aname + '.atlas'
            # material khop dung theo SkeletonDataAsset.atlasAssets (khong doan theo ten) --
            # o day AtlasAsset ao da tro dung materials cua no roi (att['materials']).
            for mi, mp in enumerate(att['materials']):
                m = ao.read().materials[mi].deref_parse_as_object() if hasattr(ao.read(), 'materials') else None
                if m is None:
                    continue
                sh = vd.deref(m.m_Shader)
                shn = getattr(sh, 'm_Name', '?') if sh is not None else '?'
                tx = m.m_SavedProperties.m_TexEnvs
                meta['materials'].append({'name': m.m_Name, 'shader': shn})
                for k, v in tx:
                    if k == '_MainTex' and v.m_Texture.path_id:
                        img = v.m_Texture.deref_parse_as_object()
                        im = img.image.convert('RGBA')
                        fn = img.m_Name + '.png'
                        im.save(os.path.join(d, fn), optimize=True)
                        meta['pages'].append({'png': fn, 'size': list(im.size)})
            for so, stt in sdas:
                n = stt['m_Name'].replace('_SkeletonData', '')
                if not (n == name or n.startswith(name + '_')) or n.replace(name, '').strip('_') not in ('', 'NW', 'SW'):
                    continue
                sk = byid[stt['skeletonJSON']['m_PathID']].read()
                b = tbytes(sk)
                open(os.path.join(d, n + '.skel'), 'wb').write(b)
                meta['skeletons'][n] = {
                    'skel': n + '.skel', 'bytes': len(b), 'scale': stt.get('scale'),
                    'defaultMix': stt.get('defaultMix'), 'mixes': sda_mixes(stt),
                    'skins': None,
                }
            json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
            tot = sum(os.path.getsize(os.path.join(d, x)) for x in os.listdir(d))
            print('  %-28s skel=%s pages=%d total=%dKB' % (name, list(meta['skeletons']), len(meta['pages']), tot // 1024))
            done[name] = meta
        return done

    return vd.with_deps(f, lambda env: rip(env, names), deps=[vd.bfile('be9e4d904692f945f3910b57349aeb09_monoscripts')])


def sda_mixes(stt):
    """SkeletonDataAsset.fromAnimation/toAnimation/duration -> [[từ, tới, giây]] (AnimationStateData.SetMix)."""
    return [[a, b_, c] for a, b_, c in zip(stt.get('fromAnimation') or [], stt.get('toAnimation') or [],
                                           stt.get('duration') or [])]


def cmd_spine_meta():
    """Chỉ ghi lại defaultMix + mixes vào art/spine/*/meta.json đã có (không bóc lại skel/png)."""
    f = vd.bfile('dependencies_assets_spine')
    root = os.path.join(ART, 'spine')

    def go(env):
        n_upd = 0
        sdas = {}
        for o in env.objects:
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                tt = o.read_typetree()
            except Exception:
                continue
            if 'skeletonJSON' in tt:
                sdas[tt['m_Name'].replace('_SkeletonData', '')] = tt
        for name in sorted(os.listdir(root)):
            mp = os.path.join(root, name, 'meta.json')
            if not os.path.exists(mp):
                continue
            meta = json.load(open(mp, encoding='utf-8'))
            changed = False
            for k, sk in meta.get('skeletons', {}).items():
                tt = sdas.get(k)
                if tt is None:
                    continue
                mx = sda_mixes(tt)
                if sk.get('mixes') != mx or sk.get('defaultMix') != tt.get('defaultMix'):
                    sk['mixes'] = mx
                    sk['defaultMix'] = tt.get('defaultMix')
                    changed = True
            if changed:
                json.dump(meta, open(mp, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
                n_upd += 1
                print('  %-24s %s' % (name, {k: len(v.get('mixes') or []) for k, v in meta['skeletons'].items()}))
        print('meta.json cập nhật:', n_upd)

    return vd.with_deps(f, go, deps=[vd.bfile('be9e4d904692f945f3910b57349aeb09_monoscripts')])


def cmd_spine(ids_filter=None):
    m = load_manifest()
    ids = set(m['characters']) | set(m['monsters'])
    if ids_filter:
        ids &= set(ids_filter)
    print('unit_map cho', len(ids), 'id...')
    um = build_unit_map(ids)
    print('  ->', len(um), 'id co prefab/skeleton')
    bn = spine_base_names(um)
    all_names = sorted({n for names in bn.values() for n in names})
    print('ten skeleton doc nhat:', len(all_names))
    out_root = os.path.join(ART, 'spine')
    os.makedirs(out_root, exist_ok=True)
    done = rip_spine_names(all_names, out_root)
    m['spine'] = sorted(done.keys())
    m['spineByUnitId'] = {str(k): v for k, v in bn.items()}
    save_manifest(m)
    return done


# ====================================================================  SECTOR
FLIP = None


def cmd_sector(ids_filter=None):
    import numpy as np
    from UnityPy.helpers.MeshHelper import MeshHandler
    global FLIP
    FLIP = np.diag([1.0, 1.0, -1.0, 1.0])
    m = load_manifest()
    ids = list(m['sector'])
    if ids_filter:
        ids = [i for i in ids if i in set(ids_filter)]
    out_root = os.path.join(ART, 'sector')
    tex_root = os.path.join(out_root, 'tex')
    os.makedirs(tex_root, exist_ok=True)
    tex_written = {}  # texture (file,pathid) -> webp filename da ghi (dung chung giua sector)

    def gl(v):
        return [round(float(v[0]), 3), round(float(v[1]), 3), round(float(-v[2]), 3)]

    def rgba(c):
        return [round(float(c.r), 4), round(float(c.g), 4), round(float(c.b), 4), round(float(c.a), 4)]

    def trs(t):
        p, q, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
        x, y, z, w = q.x, q.y, q.z, q.w
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
        mm = np.eye(4)
        mm[:3, :3] = r * np.array([s.x, s.y, s.z])
        mm[:3, 3] = [p.x, p.y, p.z]
        return mm

    from PIL import Image

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
            a = {'bufferView': self.view(arr.tobytes(), target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
            if minmax:
                a['min'] = arr.min(axis=0).tolist()
                a['max'] = arr.max(axis=0).tolist()
            self.accessors.append(a)
            return len(self.accessors) - 1

        def texture(self, tex):
            key = (tex.assets_file.name, tex.object_reader.path_id)
            if key not in self.tex_index:
                img = tex.image.convert('RGBA')
                if max(img.size) > 1024:
                    k = 1024 / max(img.size)
                    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
                alpha = img.getchannel('A').getextrema()[0] < 250
                fname = re.sub(r'[^A-Za-z0-9_.-]', '_', tex.m_Name) + '.webp'
                fpath = os.path.join(tex_root, fname)
                if not os.path.exists(fpath):
                    img.save(fpath, 'WEBP', quality=90, method=6)
                point = tex.m_TextureSettings.m_FilterMode == 0
                self.textures.append({'source': len(self.images),
                                       'sampler': 1 if point else 0})
                self.images.append({'uri': 'tex/' + fname})
                self.tex_index[key] = (len(self.textures) - 1, alpha, list(img.size))
            return self.tex_index[key]

        def material(self, mat):
            key = (mat.assets_file.name, mat.object_reader.path_id)
            if key in self.mat_index:
                return self.mat_index[key]
            sp = mat.m_SavedProperties
            F = {n: float(v) for n, v in sp.m_Floats}
            C = {n: c for n, c in sp.m_Colors}
            T = {n: e.m_Texture for n, e in sp.m_TexEnvs if e.m_Texture.path_id}
            sh = vd.deref(mat.m_Shader)
            shader = sh.m_ParsedForm.m_Name if sh is not None and getattr(sh, 'm_ParsedForm', None) else getattr(sh, 'm_Name', '?')
            pbr = {'metallicFactor': 0, 'roughnessFactor': 1}
            mo = {'name': mat.m_Name, 'pbrMetallicRoughness': pbr}
            ex = {'shader': shader}
            main = T.get('_BaseMap') or T.get('_MainTex')
            tex = vd.deref(main) if main is not None else None
            if tex is not None and hasattr(tex, 'image'):
                ti, alpha, size = self.texture(tex)
                pbr['baseColorTexture'] = {'index': ti}
                if alpha and (F.get('_AlphaClip') or F.get('_Surface', 0) == 0):
                    mo['alphaMode'] = 'MASK'
                    mo['alphaCutoff'] = round(F.get('_AlphaThreshold', F.get('_Cutoff', 0.5)), 3)
                if F.get('_Surface') == 1:
                    mo['alphaMode'] = 'BLEND'
            base = C.get('_BaseColor') or C.get('_Color')
            tint = C.get('_TintColor')
            col = rgba(base) if base is not None else [1, 1, 1, 1]
            if tint is not None:
                col = [round(a * b, 4) for a, b in zip(col[:3], rgba(tint)[:3])] + [col[3]]
            pbr['baseColorFactor'] = col
            if F.get('_Cull', F.get('_CullMode', 2)) == 0:
                mo['doubleSided'] = True
            for k in ('_ShadowColor', '_EmissionColor'):
                if k in C:
                    ex[k.strip('_')] = rgba(C[k])
            for k in ('_EmissionIntensity', '_AlphaClip', '_Surface'):
                if k in F:
                    ex[k.strip('_')] = round(F[k], 3)
            mo['extras'] = ex
            self.materials.append(mo)
            self.mat_index[key] = len(self.materials) - 1
            return self.mat_index[key]

        def mesh(self, me, mats):
            key = (me.assets_file.name, me.object_reader.path_id, tuple(mats))
            if key in self.mesh_index:
                return self.mesh_index[key]
            h = MeshHandler(me)
            h.process()
            n = h.m_VertexCount
            if not n:
                self.mesh_index[key] = (None, 0, 0)
                return self.mesh_index[key]
            pos = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3] * [1, 1, -1]
            nrm = np.array(h.m_Normals, dtype=np.float64).reshape(n, -1)[:, :3] * [1, 1, -1] if h.m_Normals else None
            uv = None
            if h.m_UV0:
                uv = np.array(h.m_UV0, dtype=np.float32).reshape(n, -1)[:, :2].copy()
                uv[:, 1] = 1 - uv[:, 1]
            attrs = {'POSITION': self.accessor(pos.astype(np.float32), 5126, 'VEC3', 34962, True)}
            if nrm is not None:
                attrs['NORMAL'] = self.accessor(nrm.astype(np.float32), 5126, 'VEC3', 34962)
            if uv is not None:
                attrs['TEXCOORD_0'] = self.accessor(uv, 5126, 'VEC2', 34962)
            prims = []
            for i, tris in enumerate(h.get_triangles()):
                if not len(tris) or i >= len(mats) or mats[i] is None:
                    continue
                idx = np.array(tris, dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
                prims.append({'attributes': attrs, 'indices': self.accessor(idx, 5125, 'SCALAR', 34963), 'material': mats[i]})
            self.meshes.append({'name': me.m_Name, 'primitives': prims})
            self.mesh_index[key] = (len(self.meshes) - 1, n, sum(len(t) for t in h.get_triangles()))
            return self.mesh_index[key]

        def node(self, name, mmat, mesh):
            g = FLIP @ mmat @ FLIP
            self.nodes.append({'name': name, 'matrix': g.T.reshape(-1).tolist(), 'mesh': mesh})

        def write(self, path):
            gltf = {'asset': {'version': '2.0', 'generator': 'voiddiver/tools/rip.py'},
                    'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
                    'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials,
                    'textures': self.textures, 'images': self.images,
                    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                                 {'magFilter': 9728, 'minFilter': 9728, 'wrapS': 10497, 'wrapT': 10497}],
                    'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}]}
            js = json.dumps(gltf, separators=(',', ':')).encode()
            js += b' ' * (-len(js) % 4)
            bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
            with open(path, 'wb') as fh:
                fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
                fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
                fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)

    def clsname(o, cls_by_pathid):
        try:
            return cls_by_pathid.get(o.parse_monobehaviour_head().m_Script.path_id, '?').split('.')[-1]
        except Exception:
            return '?'

    def small(t, skip=('m_GameObject', 'm_Script', 'm_Enabled', 'm_Name')):
        def cl(v):
            if isinstance(v, float):
                return round(v, 3)
            if isinstance(v, dict):
                if set(v) == {'m_FileID', 'm_PathID'}:
                    return None if v['m_PathID'] == 0 else 'ptr'
                return {k: cl(x) for k, x in v.items()}
            if isinstance(v, list):
                return [cl(x) for x in v[:50]]
            return v
        return {k: cl(v) for k, v in t.items() if k not in skip}

    b = vd.bfile('remote_prefab_assets_sector')
    dep_ms = vd.bfile('be9e4d904692f945f3910b57349aeb09_monoscripts')

    def export_all(env):
        cls_by_pathid = {}
        # bang class monoscript: doc truc tiep tu env hop nhat (b + dep_ms deu da nap)
        for o in env.objects:
            if o.type.name == 'MonoScript':
                try:
                    d = o.read()
                    cls_by_pathid[o.path_id] = (d.m_Namespace + '.' + d.m_ClassName) if d.m_Namespace else d.m_ClassName
                except Exception:
                    continue
        roots = [t for sf in vd.serialized_files(env, b) for t in vd.roots_of(sf)]
        by_name = {}
        for t in roots:
            go = t.m_GameObject.deref_parse_as_object()
            by_name.setdefault(go.m_Name, t)
        results = {}
        for name in ids:
            root = by_name.get(str(name))
            if root is None:
                print('  KHONG THAY sector', name)
                continue
            g = Glb()
            data = {'id': name, 'space': 'glTF (x, y, -z cua Unity); met',
                    'colliders': [], 'lights': [], 'spawns': [], 'spines': [], 'misc': [], 'bounds': None}
            stats = {}
            lo, hi = np.full(3, 1e9), np.full(3, -1e9)

            def walk(tr, parent_m, path, active):
                go2 = tr.m_GameObject.deref_parse_as_object()
                mm = parent_m @ trs(tr)
                on = active and bool(go2.m_IsActive)
                p = path + '/' + go2.m_Name if path else go2.m_Name
                comps = {}
                for c in go2.m_Component:
                    ob = c.component if hasattr(c, 'component') else c
                    try:
                        o = ob.deref()
                    except FileNotFoundError as e:
                        if any(bi in str(e).lower() for bi in vd.BUILTIN):
                            continue
                        raise
                    comps.setdefault(o.type.name, []).append(o)
                pos = gl(mm[:3, 3])
                fwd = mm[:3, :3] @ np.array([0, 0, 1.0])
                yaw = round(float(np.degrees(np.arctan2(fwd[0], fwd[2]))), 1)
                if 'MeshRenderer' in comps and 'MeshFilter' in comps and on:
                    r = comps['MeshRenderer'][0].read()
                    mf = comps['MeshFilter'][0].read()
                    me = vd.deref(mf.m_Mesh)
                    if me is not None and r.m_Enabled:
                        mats = []
                        for mp in r.m_Materials:
                            mt = vd.deref(mp)
                            mats.append(g.material(mt) if mt is not None else None)
                        mi, nv, nt = g.mesh(me, mats)
                        if mi is not None:
                            g.node(go2.m_Name, mm, mi)
                            stats['renderers'] = stats.get('renderers', 0) + 1
                            stats['verts'] = stats.get('verts', 0) + nv
                            stats['tris'] = stats.get('tris', 0) + nt
                            h = MeshHandler(me); h.process()
                            v = np.array(h.m_Vertices, dtype=np.float64).reshape(h.m_VertexCount, -1)[:, :3]
                            w = (np.c_[v, np.ones(len(v))] @ mm.T)[:, :3]
                            lo[:] = np.minimum(lo, w.min(0)); hi[:] = np.maximum(hi, w.max(0))
                for bc in comps.get('BoxCollider', []):
                    t2 = bc.read_typetree()
                    c, s = t2['m_Center'], t2['m_Size']
                    ctr = (mm @ np.array([c['x'], c['y'], c['z'], 1]))[:3]
                    sc = np.linalg.norm(mm[:3, :3], axis=0)
                    data['colliders'].append({'path': p, 'center': gl(ctr),
                                               'size': [round(s['x'] * sc[0], 3), round(s['y'] * sc[1], 3), round(s['z'] * sc[2], 3)],
                                               'yaw': yaw, 'trigger': bool(t2['m_IsTrigger']), 'active': on and bool(t2['m_Enabled']),
                                               'kind': 'high' if '/HighObstacles/' in p else 'other'})
                for lt in comps.get('Light', []):
                    L = lt.read_typetree()
                    data['lights'].append({'path': p, 'pos': pos,
                                            'color': [round(L['m_Color'][k], 3) for k in 'rgb'],
                                            'intensity': round(L['m_Intensity'], 3), 'range': round(L['m_Range'], 3),
                                            'active': on and bool(L['m_Enabled'])})
                for mb in comps.get('MonoBehaviour', []):
                    cn = clsname(mb, cls_by_pathid)
                    if cn in ('AutoDestroy', 'SphereDrawer', 'ArrowDrawer', 'UniversalAdditionalLightData'):
                        continue
                    try:
                        t2 = mb.read_typetree()
                    except Exception:
                        continue
                    if cn.endswith('SpawnComponent') or 'Spawn' in cn or 'Entrance' in cn or 'Exit' in cn:
                        data['spawns'].append({'type': cn, 'path': p, 'pos': pos, 'yaw': yaw, 'active': on})
                    elif cn == 'SkeletonAnimation':
                        sda = vd.deref(mb.read().skeletonDataAsset)
                        data['spines'].append({'path': p, 'pos': pos, 'skeleton': sda.m_Name if sda is not None else None, 'active': on})
                    elif cn in ('GroundTypeData', 'VisualAreaData', 'HitableObstacle'):
                        data['misc'].append({'type': cn, 'path': p})
                for ch in tr.m_Children:
                    walk(ch.deref_parse_as_object(), mm, p, on)

            walk(root, np.eye(4), '', True)
            if stats.get('renderers'):
                a, bb = gl(lo), gl(hi)
                data['bounds'] = {'min': [min(a[i], bb[i]) for i in range(3)], 'max': [max(a[i], bb[i]) for i in range(3)]}
            data['stats'] = stats
            raw = os.path.join(out_root, str(name) + '.raw.glb')
            g.write(raw)
            out = os.path.join(out_root, str(name) + '.glb')
            npx = shutil.which('npx') or shutil.which('npx.cmd')
            try:
                subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-ke', '-mm',
                                 '-si', '0.6'],
                                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
                os.remove(raw)
            except Exception as e:
                print('  gltfpack loi, giu raw:', e)
                shutil.move(raw, out)
            json.dump(data, open(os.path.join(out_root, str(name) + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            print('  sector %s renderers=%s verts=%s tris=%s colliders=%d KB=%d' % (
                name, stats.get('renderers', 0), stats.get('verts', 0), stats.get('tris', 0),
                len(data['colliders']), os.path.getsize(out) // 1024))
            results[name] = data
        return results

    r = vd.with_deps(b, export_all, deps=[dep_ms])
    # gltfpack nhung anh vao lai bo dem nhi phan du da cho URI ngoai tu truoc - tach lai bang
    # tools/glb_extern_tex.js (so md5 voi tex/ da co, khop 465/465 luc do) de art/sector khong
    # phinh gap ~6x. Chay lai duoc nhieu lan (glb da het anh nhung thi bo qua).
    node = shutil.which('node') or r'D:\NodeJs\node.exe'
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glb_extern_tex.js')
    if os.path.exists(script):
        subprocess.run([node, script, out_root], check=False)
    return r


# =====================================================================  AUDIO
# BGM thật sự phát trong phạm vi (đo 2026-09-25): PlayBgm trong Lua đã lọc (1100/1101/1102/101-108, Common, LoungeQuest,
# NpcTalk), Sector.Bgm/CombatBgm của bộ City (tutorial) + Country, LoungeBgm mặc định, màn tiêu đề, pha 3 của boss Slender.
# Manifest liệt kê 38 bài vì gom theo theme rộng; mang hết ở chất lượng nghe được thì quá nặng, hạ còn 32 kbps mono thì nghe hỏng.
BGM_KEEP = {
    'Title', 'Lounge', 'Lounge_Pearl_Traffic_Jam', 'Lounge_Velvet_Catalog',
    'Scenario_Prologue_Memory', 'Scenario_Prologue_Meet', 'Scenario_Appear_Jin',
    'City_Ambience', 'City_Battle', 'BossDarkYoung_Battle', 'Country_Ambience', 'Country_Battle',
    'Town_8ghost_Battle', 'Town_8ghost_3Phase_Battle',
    'Gayoung_Theme', 'Mio_Theme', 'Noa_Theme', 'Raven_Theme',
}


def cmd_audio(kind_filter=None):
    m = load_manifest()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('khong thay ffmpeg trong PATH')
    tmpdir = tempfile.mkdtemp(prefix='vd_au_')
    done = {'sfx': [], 'bgm': []}
    try:
        for group, names in (('sfx', m.get('sfx', [])), ('bgm', m.get('bgm', []))):
            if kind_filter and group not in kind_filter:
                continue
            if group == 'bgm':
                names = [n for n in names if n in BGM_KEEP]
            if not names:
                continue
            bundle = vd.bfile('remote_sound_assets_' + group)
            env = vd.env_of([bundle])
            byname = {}
            for o in env.objects:
                if o.type.name == 'AudioClip':
                    d = o.read()
                    byname[d.m_Name] = d
            outdir = os.path.join(AUDIO, group)
            os.makedirs(outdir, exist_ok=True)
            for name in names:
                clip = byname.get(name)
                if clip is None:
                    print('  KHONG THAY', group, name)
                    continue
                items = list(clip.samples.items())
                if not items:
                    print('  KHONG GIAI DUOC', name)
                    continue
                tmp_wav = os.path.join(tmpdir, re.sub(r'[^A-Za-z0-9_.-]', '_', name) + '.wav')
                open(tmp_wav, 'wb').write(items[0][1])
                dst = os.path.join(outdir, re.sub(r'[^A-Za-z0-9_.-]', '_', name) + '.mp3')
                # BGM 128 kbps stereo (nhạc là thứ người chơi nghe suốt); SFX 96 kbps mono.
                rate = ['-b:a', '128k'] if group == 'bgm' else ['-b:a', '96k']
                ch = ['-ac', '2'] if group == 'bgm' else ['-ac', '1']
                try:
                    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', tmp_wav, '-codec:a', 'libmp3lame'] + rate + ch + [dst], check=True)
                except subprocess.CalledProcessError as e:
                    print('  LOI ffmpeg', name, e)
                    continue
                done[group].append(name)
                print('  %-6s %-40s %.1f KB' % (group, name, os.path.getsize(dst) / 1024))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    return done


# ========================================================================  UI
ICON_FAMILIES = ['skill', 'item', 'equipment', 'talent', 'buff', 'monster', 'common', 'ping',
                  'statuseffecttag', 'weakpoint', 'bag', 'goodssubtype', 'unit_character',
                  'unit_monster', 'unit_npc', 'unit_etc', 'area', 'area_npc', 'areadecoration',
                  'anomaly', 'employeecondition', 'employeeface', 'emoji']


def cmd_ui(families=None):
    from PIL import Image
    out_root = os.path.join(ART, 'ui')
    fams = families or ICON_FAMILIES
    report = {}
    for fam in fams:
        prefix = 'remote_spriteatlas_assets_icon_' + fam
        try:
            bfile = vd.bfile(prefix)
        except KeyError:
            print('  (khong co atlas)', fam)
            continue
        outdir = os.path.join(out_root, 'icon_' + fam)
        os.makedirs(outdir, exist_ok=True)

        def go(env):
            sprites = []
            for o in env.objects:
                if o.type.name == 'SpriteAtlas':
                    d = o.read()
                    for ptr in d.m_PackedSprites:
                        sprites.append(ptr.read())
            return sprites

        sprites = vd.with_deps(bfile, go)
        n_ok = 0
        for sp in sprites:
            try:
                img = sp.image.convert('RGBA')
            except Exception:
                continue
            img.save(os.path.join(outdir, sp.m_Name + '.webp'), 'WEBP', quality=92, method=6)
            n_ok += 1
        report[fam] = n_ok
        print('  icon_%-20s %d sprite' % (fam, n_ok))
    return report


# ==================================================================  PORTRAIT
def cmd_portrait():
    """art/ui/portrait/<id>_<Emotion>.webp - Npc table (day du, xem manifest) dung
    ten "<Id>_<DefaultImageName>"; o day boc luon toan bo sprite trong bundle (chi 222, nho)
    vi Npc.csv da la bang full (moi Npc deu trong pham vi)."""
    from PIL import Image
    outdir = os.path.join(ART, 'ui', 'portrait')
    os.makedirs(outdir, exist_ok=True)
    b = vd.bfile('remote_texture_assets_portrait')

    def go(env):
        out = []
        for o in env.objects:
            if o.type.name == 'Sprite':
                sp = o.read()
                out.append(sp)
        return out

    sprites = vd.with_deps(b, go)
    n, errs = 0, []
    for sp in sprites:
        try:
            img = sp.image.convert('RGBA')
            img.save(os.path.join(outdir, sp.m_Name + '.webp'), 'WEBP', quality=92, method=6)
            n += 1
        except Exception as e:
            errs.append('%s: %s' % (sp.m_Name, e))
    print('  portrait %d/%d loi=%s' % (n, len(sprites), errs))
    return n


def cmd_dialogimage():
    m = load_manifest()
    names = set(m.get('dialogImage', []))
    if not names:
        return 0
    from PIL import Image
    outdir = os.path.join(ART, 'ui', 'dialogimage')
    os.makedirs(outdir, exist_ok=True)
    b = vd.bfile('remote_texture_assets_dialogimage')

    def go(env):
        byname = {}
        for o in env.objects:
            if o.type.name in ('Sprite', 'Texture2D'):
                d = o.read()
                byname[d.m_Name] = d
        return byname

    byname = vd.with_deps(b, go)
    # ten khong thay trong remote_texture_assets_dialogimage -> thu them 2 bundle texture khac
    # (co the anh nam ngoai bundle "dialogimage" rieng, vd dung chung voi minimap/texture chung).
    fallback_bundles = ['dependencies_assets_texture', 'remote_texture_assets_minimap']
    missing0 = [n for n in names if n not in byname]
    for fb in fallback_bundles:
        if not missing0:
            break
        try:
            fbfile = vd.bfile(fb)
        except KeyError:
            continue

        def go2(env):
            out = {}
            for o in env.objects:
                if o.type.name in ('Sprite', 'Texture2D') and o.read().m_Name in missing0:
                    out[o.read().m_Name] = o.read()
            return out

        byname.update(vd.with_deps(fbfile, go2))
        missing0 = [n for n in names if n not in byname]

    n, missing, errs = 0, [], []
    for name in sorted(names):
        d = byname.get(name)
        if d is None:
            missing.append(name)
            continue
        try:
            img = d.image.convert('RGBA')
            img.save(os.path.join(outdir, name + '.webp'), 'WEBP', quality=92, method=6)
            n += 1
        except Exception as e:
            errs.append('%s: %s' % (name, e))
    print('  dialogimage %d/%d, thieu: %s, loi: %s' % (n, len(names), missing, errs))
    return n


# ====================================================================  TITLE
# Logo dung trong TitleImage! (scene bundle remote_scene_scenes_scene) nam trong
# dependencies_assets_sprite, khong phai bundle texture rieng - da do bang cach doc m_Sprite PPtr
# cua GameObject "TitleImage!" trong scene.
TITLE_SPRITES = ['Logo']


def cmd_title():
    from PIL import Image
    outdir = os.path.join(ART, 'ui', 'title')
    os.makedirs(outdir, exist_ok=True)
    b = vd.bfile('dependencies_assets_sprite')

    def go(env):
        saved = {}
        for o in env.objects:
            if o.type.name in ('Sprite', 'Texture2D') and o.read().m_Name in TITLE_SPRITES:
                d = o.read()
                img = d.image.convert('RGBA')
                img.save(os.path.join(outdir, d.m_Name + '.webp'), 'WEBP', quality=95, method=6)
                saved[d.m_Name] = True
        return saved

    saved = vd.with_deps(b, go, deps=[vd.bfile('dependencies_assets_texture')])
    print('  title %d/%d (%s)' % (len(saved), len(TITLE_SPRITES), list(saved.keys())))
    return len(saved)


# =======================================================================  ALL
def main():
    args = sys.argv[1:]
    cmd = args[0] if args else 'all'
    ids_filter = None
    for a in args[1:]:
        if a.startswith('--ids='):
            ids_filter = [int(x) for x in a[6:].split(',')]
    if cmd in ('spine', 'all'):
        print('== spine =='); cmd_spine(ids_filter)
    if cmd == 'spine-meta':
        print('== spine-meta =='); cmd_spine_meta()
    if cmd in ('sector', 'all'):
        print('== sector =='); cmd_sector(ids_filter)
    if cmd in ('audio', 'all'):
        print('== audio =='); cmd_audio()
    if cmd in ('ui', 'all'):
        print('== ui =='); cmd_ui()
    if cmd in ('portrait', 'all'):
        print('== portrait =='); cmd_portrait()
    if cmd in ('dialogimage', 'all'):
        print('== dialogimage =='); cmd_dialogimage()
    if cmd in ('title', 'all'):
        print('== title =='); cmd_title()


if __name__ == '__main__':
    main()
