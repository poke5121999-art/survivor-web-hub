# -*- coding: utf-8 -*-
"""rip_objects.py - boc vat the trong man lan (ruong, cua, bot dien thoai, thung dau, trigger...) cua VOID DIVER demo.

    set PYTHONIOENCODING=utf-8
    python tools/rip_objects.py                  # moi prefab ma bang trong pham vi can + Spine + anh minimap + data/objects.js
    python tools/rip_objects.py BrownBox SteelEntrance   # chi vai prefab (van ghi lai data/objects.js tu nhung gi co tren dia)
    python tools/rip_objects.py --spine | --minimap | --manifest

Ra:
    art/object/<Prefab>.glb   hinh (MeshRenderer + SkinnedMeshRenderer o tu the bind), gltfpack -kn giu tung node
    art/object/<Prefab>.json  collider, nhom con (Front/Back/Open/Close...), Spine, den, he hat, Animator + ten clip
    art/object/spine/<Ten>/   bo Spine 4.2 (skel + atlas + png + meta.json) cho World_PhoneBooth, NPC_Campaign
    art/object/minimap/<SectorId>.webp   anh minimap goc (remote_texture_assets_minimap, ten = Sector.Id)
    data/objects.js           VD.OBJECTS = { prefab: {...}, spine: {...}, minimap: {...} }

Moi node glb mang extras {path, group}: path la duong di tu goc prefab ("Front/2DBG_RewardBoxes_Safe_F"),
group la con cap 1. GLTFLoader dua extras vao userData nen JS bat/tat nhom theo path (GLTFLoader xoa '/' trong ten node).

Toa do: Unity tay trai -> glTF tay phai (z -> -z, dao chieu tam giac), giong tools cua sector (vd-ref/tools/vd_sector.py,
lop Glb chep tu do). Thu vien bundle: tools/vd_common.py.
"""
import io, json, os, re, shutil, struct, subprocess, sys, collections
import numpy as np
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vd

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'art', 'object')
MAX_TEX = 1024
FLIP = np.diag([1.0, 1.0, -1.0, 1.0])
MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'

# Prefab khong nam trong bang nao nhung man lan dung (ten lay tu names cua remote_prefab_assets_object).
EXTRA = ['WaveExit', 'SafeExit', 'PhoneBooth', 'DropGoods', 'IntervalTrap', 'TriggerTrap', 'CollisionTrigger',
         'PointerArrow', 'ZoneSpointLight', 'ZoneSpawnLight', 'SphereFieldExit', 'BoxFogField', 'SphereOilField',
         'SphereBlockedField', 'TrainingField', 'SanctuaryTree', 'Portal', 'PortalDefault']
SPINES = ['World_PhoneBooth', 'NPC_Campaign']


def table_prefabs():
    """Ten prefab ma cac bang trong pham vi (data/tables.js) tro toi."""
    src = open(os.path.join(GAME, 'data', 'tables.js'), encoding='utf-8').read()
    m = re.search(r'VD\.T\s*=\s*(\{.*\})\s*;?\s*$', src, re.S)
    T = json.loads(m.group(1)) if m else {}
    names = set()
    for t in ('RewardBox', 'Entrance', 'BreakableProp', 'DisposableObject', 'WaveExecutor', 'SpecialField'):
        for r in T.get(t, []):
            if r.get('PrefabName'):
                names.add(r['PrefabName'])
            if r.get('StressFailPrefabName'):
                names.add(r['StressFailPrefabName'])
    for z in T.get('ZoneSpawn', []):
        for s in z.get('SpawnDatas') or []:
            if s.get('PrefabName'):
                names.add(s['PrefabName'])
    return sorted(names), T


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


def gl(v):
    return [round(float(v[0]), 3), round(float(v[1]), 3), round(float(-v[2]), 3)]


def rgba(c):
    return [round(float(c.r), 4), round(float(c.g), 4), round(float(c.b), 4), round(float(c.a), 4)]


class Glb:
    """Chep tu vd-ref/tools/vd_sector.py (lop Glb), them extras cho node."""

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

    def image(self, img, name, sampler):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=90, method=6)
        self.images.append({'bufferView': self.view(buf.getvalue()), 'mimeType': 'image/webp', 'name': name})
        self.textures.append({'sampler': sampler, 'extensions': {'EXT_texture_webp': {'source': len(self.images) - 1}}})
        return len(self.textures) - 1

    def texture(self, tex):
        key = (tex.assets_file.name, tex.object_reader.path_id)
        if key not in self.tex_index:
            img = tex.image.convert('RGBA')
            if max(img.size) > MAX_TEX:
                k = MAX_TEX / max(img.size)
                img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            alpha = img.getchannel('A').getextrema()[0] < 250
            point = tex.m_TextureSettings.m_FilterMode == 0
            self.tex_index[key] = (self.image(img, tex.m_Name, 1 if point else 0), alpha, list(img.size))
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
        shader = sh.m_ParsedForm.m_Name if sh is not None and getattr(sh, 'm_ParsedForm', None) else '?'
        pbr = {'metallicFactor': 0, 'roughnessFactor': 1}
        m = {'name': mat.m_Name, 'pbrMetallicRoughness': pbr}
        ex = {'shader': shader}
        main = T.get('_BaseMap') or T.get('_MainTex')
        tex = vd.deref(main) if main is not None else None
        if tex is not None and hasattr(tex, 'image'):
            ti, alpha, size = self.texture(tex)
            pbr['baseColorTexture'] = {'index': ti}
            if alpha and (F.get('_AlphaClip') or F.get('_Surface', 0) == 0):
                m['alphaMode'] = 'MASK'
                m['alphaCutoff'] = round(F.get('_AlphaThreshold', F.get('_Cutoff', 0.5)), 3)
            if F.get('_Surface') == 1:
                m['alphaMode'] = 'BLEND'
        base = C.get('_BaseColor') or C.get('_Color')
        tint = C.get('_TintColor')
        col = rgba(base) if base is not None else [1, 1, 1, 1]
        if tint is not None:
            col = [round(a * b, 4) for a, b in zip(col[:3], rgba(tint)[:3])] + [col[3]]
        pbr['baseColorFactor'] = col
        if F.get('_Cull', F.get('_CullMode', 2)) == 0:
            m['doubleSided'] = True
        for k in ('_EmissionColor', '_ShadowColor'):
            if k in C:
                ex[k.strip('_')] = rgba(C[k])
        for k in ('_EmissionIntensity', '_pixelizeStep', '_AlphaClip', '_Surface'):
            if k in F:
                ex[k.strip('_')] = round(F[k], 3)
        m['extras'] = ex
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
        if not n:
            self.mesh_index[key] = (None, 0, 0, None)
            return self.mesh_index[key]
        raw = np.array(h.m_Vertices, dtype=np.float64).reshape(n, -1)[:, :3]
        pos = raw * [1, 1, -1]
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
        tris_all = h.get_triangles()
        for i, tris in enumerate(tris_all):
            if not len(tris) or i >= len(mats) or mats[i] is None:
                continue
            idx = np.array(tris, dtype=np.uint32).reshape(-1, 3)[:, ::-1].reshape(-1)
            prims.append({'attributes': attrs, 'indices': self.accessor(idx, 5125, 'SCALAR', 34963), 'material': mats[i]})
        if not prims:
            self.mesh_index[key] = (None, 0, 0, None)
            return self.mesh_index[key]
        self.meshes.append({'name': me.m_Name, 'primitives': prims})
        self.mesh_index[key] = (len(self.meshes) - 1, n, sum(len(t) for t in tris_all), raw)
        return self.mesh_index[key]

    def node(self, name, m, mesh, extras):
        g = FLIP @ m @ FLIP
        self.nodes.append({'name': name, 'matrix': [round(float(x), 6) for x in g.T.reshape(-1)], 'mesh': mesh, 'extras': extras})

    def write(self, path):
        gltf = {'asset': {'version': '2.0', 'generator': 'games/voiddiver/tools/rip_objects.py'},
                **({'extensionsUsed': ['EXT_texture_webp'], 'extensionsRequired': ['EXT_texture_webp']} if self.images else {}),
                'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
                'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.materials,
                'textures': self.textures, 'images': self.images,
                'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
                             {'magFilter': 9728, 'minFilter': 9728, 'wrapS': 10497, 'wrapT': 10497}],
                'accessors': self.accessors, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}]}
        if not self.nodes:
            gltf['scenes'] = [{'nodes': []}]
        js = json.dumps(gltf, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        bn = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
            fh.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            fh.write(struct.pack('<II', len(bn), 0x004E4942) + bn)


def class_map(env):
    out = {}
    for o in env.objects:
        if o.type.name == 'MonoScript':
            try:
                d = o.read()
                out[o.path_id] = d.m_ClassName
            except Exception:
                pass
    return out


def clsname(o, cmap):
    try:
        return cmap.get(o.parse_monobehaviour_head().m_Script.path_id, '?')
    except FileNotFoundError:
        raise
    except Exception:
        return '?'


def comps_of(go):
    out = collections.defaultdict(list)
    for c in go.m_Component:
        ob = c.component if hasattr(c, 'component') else c
        try:
            o = ob.deref()
        except FileNotFoundError as e:
            if any(b in str(e).lower() for b in vd.BUILTIN):
                continue
            raise
        out[o.type.name].append(o)
    return out


def export_prefab(env, root, cmap):
    name = root.m_GameObject.deref_parse_as_object().m_Name
    g = Glb()
    data = collections.OrderedDict(name=name, space='glTF (x, y, -z cua Unity); met; goc = chan prefab')
    for k in ('groups', 'colliders', 'spines', 'lights', 'particles', 'animators', 'behaviours', 'meshes'):
        data[k] = []
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)

    def walk(tr, parent_m, rel, active, is_root):
        go = tr.m_GameObject.deref_parse_as_object()
        # Goc prefab thuong co toa do cua lan dat cuoi trong editor (vd SteelEntrance 17,0,8): bo, lay chan = goc.
        m = np.eye(4) if is_root else parent_m @ trs(tr)
        if is_root:
            q = trs(tr); m[:3, :3] = q[:3, :3]
        on = active and bool(go.m_IsActive)
        comps = comps_of(go)
        if rel and '/' not in rel:
            data['groups'].append({'name': rel, 'active': bool(go.m_IsActive)})
        pos = gl(m[:3, 3])
        for kind in ('MeshRenderer', 'SkinnedMeshRenderer'):
            for r_o in comps.get(kind, []):
                r = r_o.read()
                if kind == 'MeshRenderer':
                    mf = comps.get('MeshFilter')
                    if not mf:
                        continue
                    me = vd.deref(mf[0].read().m_Mesh)
                else:
                    me = vd.deref(r.m_Mesh)
                if me is None or not r.m_Enabled:
                    continue
                if 'Skeleton' in (me.m_Name or '') or comps.get('MonoBehaviour') and any(clsname(x, cmap) == 'SkeletonAnimation' for x in comps['MonoBehaviour']):
                    continue      # mesh Spine sinh luc chay, bo
                mats = []
                for mp in r.m_Materials:
                    mt = vd.deref(mp)
                    mats.append(g.material(mt) if mt is not None else None)
                mi, nv, nt, raw = g.mesh(me, mats)
                if mi is None:
                    continue
                g.node(go.m_Name, m, mi, {'path': rel, 'group': rel.split('/')[0], 'active': on, 'skinned': kind == 'SkinnedMeshRenderer'})
                data['meshes'].append({'path': rel, 'mesh': me.m_Name, 'verts': nv, 'tris': nt, 'active': on})
                w = (np.c_[raw, np.ones(len(raw))] @ m.T)[:, :3]
                lo[:] = np.minimum(lo, w.min(0)); hi[:] = np.maximum(hi, w.max(0))
        sc = np.linalg.norm(m[:3, :3], axis=0)
        for bc in comps.get('BoxCollider', []):
            t = bc.read_typetree()
            c, s = t['m_Center'], t['m_Size']
            ctr = (m @ np.array([c['x'], c['y'], c['z'], 1]))[:3]
            data['colliders'].append({'path': rel, 'shape': 'box', 'center': gl(ctr),
                                      'size': [round(s['x'] * sc[0], 3), round(s['y'] * sc[1], 3), round(s['z'] * sc[2], 3)],
                                      'trigger': bool(t['m_IsTrigger']), 'active': on and bool(t['m_Enabled'])})
        for sc_o in comps.get('SphereCollider', []):
            t = sc_o.read_typetree()
            c = t['m_Center']
            ctr = (m @ np.array([c['x'], c['y'], c['z'], 1]))[:3]
            data['colliders'].append({'path': rel, 'shape': 'sphere', 'center': gl(ctr), 'radius': round(t['m_Radius'] * float(max(sc)), 3),
                                      'trigger': bool(t['m_IsTrigger']), 'active': on and bool(t['m_Enabled'])})
        for cc in comps.get('CapsuleCollider', []):
            t = cc.read_typetree()
            c = t['m_Center']
            ctr = (m @ np.array([c['x'], c['y'], c['z'], 1]))[:3]
            data['colliders'].append({'path': rel, 'shape': 'capsule', 'center': gl(ctr), 'radius': round(t['m_Radius'] * float(max(sc)), 3),
                                      'height': round(t['m_Height'] * float(max(sc)), 3), 'trigger': bool(t['m_IsTrigger']),
                                      'active': on and bool(t['m_Enabled'])})
        for lt in comps.get('Light', []):
            L = lt.read_typetree()
            data['lights'].append({'path': rel, 'type': ['spot', 'directional', 'point', 'area'][L['m_Type']] if L['m_Type'] < 4 else L['m_Type'],
                                   'pos': pos, 'color': [round(L['m_Color'][k], 3) for k in 'rgb'], 'intensity': round(L['m_Intensity'], 3),
                                   'range': round(L['m_Range'], 3), 'active': on and bool(L['m_Enabled'])})
        for ps in comps.get('ParticleSystem', []):
            data['particles'].append({'path': rel, 'pos': pos, 'active': on})
        for an in comps.get('Animator', []):
            a = an.read()
            ctl = vd.deref(a.m_Controller) if hasattr(a, 'm_Controller') else None
            clips = []
            if ctl is not None:
                for cp in getattr(ctl, 'm_AnimationClips', []) or []:
                    cl = vd.deref(cp)
                    if cl is not None:
                        clips.append(cl.m_Name)
            data['animators'].append({'path': rel, 'controller': ctl.m_Name if ctl is not None else None, 'clips': clips})
        for mb in comps.get('MonoBehaviour', []):
            cn = clsname(mb, cmap)
            if cn in ('SphereDrawer', 'RectangleDrawer', 'ColliderDrawer', 'UniversalAdditionalLightData', 'PlanePointHelper', 'NetworkObject'):
                continue
            if cn == 'SkeletonAnimation':
                t = mb.read_typetree()
                sda = vd.deref(mb.read().skeletonDataAsset)
                data['spines'].append({'path': rel, 'skeleton': sda.m_Name.replace('_SkeletonData', '') if sda is not None else None,
                                       'anim': t.get('_animationName'), 'loop': bool(t.get('loop')), 'active': on,
                                       'pos': pos, 'scale': [round(float(x), 3) for x in sc]})
                continue
            if rel == '' or cn in ('OutlineObject', 'Billboard', 'Image', 'InteractiveTrigger', 'Entrance', 'RewardBox', 'MimicObject',
                                    'PhoneBooth', 'WaveExit', 'SafeExit', 'DropGoods', 'BreakableProp', 'SpecialField', 'WaveExecutor',
                                    'SkillExecutor', 'IntervalTrap', 'TriggerTrap', 'CollisionTrigger', 'LootingInventory'):
                ent = {'path': rel, 'class': cn}
                if cn not in ('OutlineObject', 'Billboard', 'Image'):
                    # tham số thuần (số/chuỗi/bool) của component gốc: _canTriggered, _coolTime, _holdingTime, _holdingSfx...
                    try:
                        t = mb.read_typetree()
                        ent['fields'] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in t.items()
                                         if not k.startswith('m_') and isinstance(v, (int, float, str, bool))}
                    except FileNotFoundError:
                        raise
                    except Exception:
                        pass
                if cn in ('Image',):
                    try:
                        spr = vd.deref(mb.read().m_Sprite)
                        ent['sprite'] = spr.m_Name if spr is not None else None
                    except Exception:
                        pass
                data['behaviours'].append(ent)
        for ch in tr.m_Children:
            c = ch.deref_parse_as_object()
            cn_ = c.m_GameObject.deref_parse_as_object().m_Name
            walk(c, m, (rel + '/' + cn_) if rel else cn_, on, False)

    walk(root, np.eye(4), '', True, True)
    if len(g.nodes):
        a, b = gl(lo), gl(hi)
        data['bounds'] = {'min': [min(a[i], b[i]) for i in range(3)], 'max': [max(a[i], b[i]) for i in range(3)]}
    os.makedirs(OUT, exist_ok=True)
    if g.nodes:
        raw = os.path.join(OUT, name + '.raw.glb')
        g.write(raw)
        out = os.path.join(OUT, name + '.glb')
        npx = shutil.which('npx') or shutil.which('npx.cmd')
        try:
            subprocess.run([npx, '-y', 'gltfpack@0.22.0', '-i', raw, '-o', out, '-cc', '-km', '-ke', '-kn'], check=True,
                           stdout=subprocess.DEVNULL)
            os.remove(raw)
        except Exception as e:
            print('  gltfpack loi, giu ban chua nen:', e)
            os.replace(raw, out)
        data['glb'] = 'art/object/' + name + '.glb'
        data['glbKB'] = os.path.getsize(out) // 1024
    json.dump(data, open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(name, 'mesh', len(data['meshes']), 'groups', [x['name'] for x in data['groups']], 'spine',
          [x['skeleton'] for x in data['spines']], 'col', len(data['colliders']), data.get('glbKB'), flush=True)


def cmd_prefabs(names):
    b = vd.bfile('remote_prefab_assets_object')

    def run(env):
        cmap = class_map(env)
        roots = {}
        for sf in vd.serialized_files(env, b):
            for t in vd.roots_of(sf):
                n = t.m_GameObject.deref_parse_as_object().m_Name
                roots.setdefault(n, t)
        miss = []
        for n in names:
            if n not in roots:
                miss.append(n)
                continue
            export_prefab(env, roots[n], cmap)
        if miss:
            print('KHONG CO prefab:', miss)
        return miss
    return vd.with_deps(b, run, deps=[vd.bfile(MONO)])


def tbytes(ta):
    s = ta.m_Script
    return s if isinstance(s, bytes) else s.encode('utf-8', 'surrogateescape')


def cmd_spine(want):
    """Chep tu vd-ref/tools/vd_spine.py: skel nhi phan + atlas + trang png + meta.json."""
    f = vd.bfile('dependencies_assets_spine')

    def rip(env):
        objs = list(env.objects)
        sdas, adas = [], []
        for o in objs:
            if o.type.name == 'MonoBehaviour':
                try:
                    tt = o.read_typetree()
                except Exception:
                    continue
                if 'skeletonJSON' in tt:
                    sdas.append((o, tt))
                elif 'atlasFile' in tt:
                    adas.append((o, tt))
        byid = {o.path_id: o for o in objs}
        for name in want:
            d = os.path.join(OUT, 'spine', name)
            os.makedirs(d, exist_ok=True)
            meta = {'name': name, 'skeletons': {}, 'atlas': None, 'pages': []}
            ada = [x for x in adas if x[1]['m_Name'] in (name + '_Atlas', name + '_SW_Atlas')]
            if not ada:
                print('khong co atlas cho', name)
                continue
            ao, att = ada[0]
            at = byid[att['atlasFile']['m_PathID']].read()
            atext = tbytes(at).decode('utf-8').replace('\r\n', '\n')
            aname = at.m_Name.replace('.atlas', '')
            open(os.path.join(d, aname + '.atlas'), 'w', encoding='utf-8', newline='\n').write(atext)
            meta['atlas'] = aname + '.atlas'
            for i, mp in enumerate(att['materials']):
                m = ao.read().materials[i].deref_parse_as_object()
                for k, v in m.m_SavedProperties.m_TexEnvs:
                    if k == '_MainTex' and v.m_Texture.path_id:
                        img = v.m_Texture.deref_parse_as_object()
                        im = img.image.convert('RGBA')
                        fn = img.m_Name + '.png'
                        im.save(os.path.join(d, fn), optimize=True)
                        meta['pages'].append(fn)
            for so, stt in sdas:
                n = stt['m_Name'].replace('_SkeletonData', '')
                if not (n == name or n.startswith(name + '_')) or n.replace(name, '').strip('_') not in ('', 'NW', 'SW'):
                    continue
                sk = byid[stt['skeletonJSON']['m_PathID']].read()
                bts = tbytes(sk)
                open(os.path.join(d, n + '.skel'), 'wb').write(bts)
                meta['skeletons'][n] = {'skel': n + '.skel', 'scale': stt['scale'], 'defaultMix': stt['defaultMix'],
                                        'mixes': [[a, b_, c] for a, b_, c in zip(stt.get('fromAnimation', []), stt.get('toAnimation', []), stt.get('duration', []))]}
            json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), indent=1)
            print('spine', name, list(meta['skeletons']), meta['pages'], flush=True)
    vd.with_deps(f, rip, deps=[vd.bfile(MONO)])


def cmd_minimap(T):
    ids = {str(s['Id']) for s in T.get('Sector', [])}
    f = vd.bfile('remote_texture_assets_minimap')
    d = os.path.join(OUT, 'minimap')
    os.makedirs(d, exist_ok=True)

    def run(env):
        n = 0
        for o in env.objects:
            if o.type.name != 'Texture2D':
                continue
            t = o.read()
            if t.m_Name not in ids:
                continue
            t.image.convert('RGBA').save(os.path.join(d, t.m_Name + '.webp'), 'WEBP', quality=90, method=6)
            n += 1
        print('minimap', n, '/', len(ids), flush=True)
    vd.with_deps(f, run)


def cmd_manifest():
    man = {'prefab': {}, 'spine': {}, 'minimap': {}}
    for fn in sorted(os.listdir(OUT)):
        if fn.endswith('.json'):
            j = json.load(open(os.path.join(OUT, fn), encoding='utf-8'))
            ent = {'json': 'art/object/' + fn}
            if j.get('glb'):
                ent['glb'] = j['glb']
            if j.get('bounds'):
                ent['bounds'] = j['bounds']
            if j.get('spines'):
                ent['spine'] = sorted({s['skeleton'] for s in j['spines'] if s['skeleton']})
            man['prefab'][j['name']] = ent
    sd = os.path.join(OUT, 'spine')
    if os.path.isdir(sd):
        for n in sorted(os.listdir(sd)):
            if os.path.exists(os.path.join(sd, n, 'meta.json')):
                man['spine'][n] = {'dir': 'art/object/spine/' + n + '/'}
    md = os.path.join(OUT, 'minimap')
    if os.path.isdir(md):
        for fn in sorted(os.listdir(md)):
            man['minimap'][fn.split('.')[0]] = 'art/object/minimap/' + fn
    out = os.path.join(GAME, 'data', 'objects.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// SINH RA bởi tools/rip_objects.py — không sửa tay.\n')
        fh.write('window.VD = window.VD || {};\nVD.OBJECTS = ' + json.dumps(man, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('manifest', len(man['prefab']), 'prefab,', len(man['spine']), 'spine,', len(man['minimap']), 'minimap ->', out)


def main():
    args = sys.argv[1:]
    names, T = table_prefabs()
    flags = [a for a in args if a.startswith('--')]
    picks = [a for a in args if not a.startswith('--')]
    if not flags and not picks:
        cmd_prefabs(sorted(set(names + EXTRA)))
        cmd_spine(SPINES)
        cmd_minimap(T)
    if picks:
        cmd_prefabs(picks)
    if '--spine' in flags:
        cmd_spine(SPINES)
    if '--minimap' in flags:
        cmd_minimap(T)
    cmd_manifest()


if __name__ == '__main__':
    main()
