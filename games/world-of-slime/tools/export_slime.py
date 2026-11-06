"""Export all 218 slime variants (Normal prefab) to GLB, with clips split per species.

Run:  py -3.12 -I export_slime.py [--only bat,slime] [--workers 4]
Out:  <wos.ASSETS>/slime/<SL_Name>.glb           mesh + skeleton + textures, no clips
      <wos.ASSETS>/slime/anim/<species>.glb      skeleton-only GLB carrying the species clips (retarget by bone name)
      <wos.ASSETS>/slime/shared/*.webp           shader-wide ramp/matcap textures (from shader.bundle)
      <wos.ASSETS>/slime/index.json              manifest: variants, species, clips, rule data, material params

Clips live in character_shared_sl_<species>.bundle and the game plays the same clips on every variant of a species
(Unity binds by transform path). three.js binds by node name, so a species clip GLB works on a variant as long as no
bone name maps to two different paths across the species. The tool checks that per species and falls back to
embedding the clips in each variant GLB (index: clips="embedded") if it ever happens.

This file is also the shared library for export_npc.py and export_player.py (Skel, Builder, add_clip, write_index).
"""
import os, sys, io, json, zlib, shutil, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler
import wos

WEBP_Q = 85
LOSSLESS_ROLES = ('mask', 'decal', 'decalMask', 'subDecal')   # channel masks and crisp expression atlases
TEX_PROPS = {'_MainTex': 'albedo', '_BaseMap': 'albedo', '_MaskTex': 'mask', '_DecalTex': 'decal', '_EmissionMap': 'emission',
             '_EmissionDecalTex': 'emissionDecal', '_SkinTex': 'skin', '_MatCapTex': 'matcap', '_SubDecalTex': 'subDecal',
             '_DecalMaskTex': 'decalMask', '_BlendTex': 'blend', '_PipeTex': 'pipe', '_NormalMap': 'normal', '_BumpMap': 'normal'}
ELEMENTS = ['Fire', 'Water', 'Ground', 'Wind', 'Grass', 'Steel', 'Electric', 'Ice', 'Magic', 'Power', 'Light', 'Dark', 'Poison']
MB_FLOAT_FIELDS = ([f'decalViewWeight{i}' for i in range(1, 10)] + [f'subDecalViewWeight{i}' for i in range(1, 10)] +
                   ['_decalView', '_subDecalView', 'enableDecalView', 'enableSubDecalView', 'm_Enabled'])
MB_ATTR = {zlib.crc32(n.encode()): n for n in MB_FLOAT_FIELDS}
GO_ACTIVE = zlib.crc32(b'm_IsActive')


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def r4(v):
    return [round(float(x), 4) for x in v]


# ---------------------------------------------------------------- textures
def encode_webp(tex, role, max_size=1024):
    im = tex.image.convert('RGBA')
    if max(im.size) > max_size:
        k = max_size / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    alpha = bool((np.asarray(im)[:, :, 3] < 250).mean() > 0.001)
    if not alpha:
        im = im.convert('RGB')
    b = io.BytesIO()
    if role in LOSSLESS_ROLES:
        im.save(b, 'WEBP', lossless=True, method=6, exact=True)
    else:
        im.save(b, 'WEBP', quality=WEBP_Q, method=6, exact=True)
    return b.getvalue(), alpha


# ---------------------------------------------------------------- skeleton
class Skel:
    """Transform tree under a prefab root. Node 0 = root; node.path = Unity binding path (root excluded)."""

    def __init__(self, root_tr):
        self.nodes, self.by_pid = [], {}
        self._walk(root_tr, -1, '')

    def _walk(self, tr, parent, path):
        go = tr.m_GameObject.read()
        name = go.m_Name
        if parent >= 0:
            path = name if not path else path + '/' + name
        self.nodes.append(dict(name=name, parent=parent, path=path, t=wos.cp(tr.m_LocalPosition), r=wos.cq(tr.m_LocalRotation),
                               s=[tr.m_LocalScale.x, tr.m_LocalScale.y, tr.m_LocalScale.z], children=[], go=go,
                               active=bool(getattr(go, 'm_IsActive', True))))
        i = len(self.nodes) - 1
        self.by_pid[tr.object_reader.path_id] = i
        self.by_pid[('go', go.object_reader.path_id)] = i
        for c in go.m_Component:
            self.by_pid.setdefault(('c', c.component.path_id), i)
        if parent >= 0:
            self.nodes[parent]['children'].append(i)
        for ch in tr.m_Children:
            self._walk(ch.read(), i, path)

    def hash2node(self):
        return {zlib.crc32(n['path'].encode()): i for i, n in enumerate(self.nodes) if n['path']}

    def node_of(self, pptr):
        """Node index for a Transform or GameObject PPtr (same file)."""
        if not pptr or not pptr.path_id:
            return None
        return self.by_pid.get(pptr.path_id, self.by_pid.get(('go', pptr.path_id), self.by_pid.get(('c', pptr.path_id))))


def write_nodes(glb, nodes, keep_root_xform=False):
    """glTF node i = nodes[i]. Returns nothing; nodes must already be in parent-before-child order."""
    for n in nodes:
        nd = dict(name=n['name'])
        if any(abs(x) > 1e-7 for x in n['t']): nd['translation'] = r4(n['t'])
        if any(abs(a - b) > 1e-7 for a, b in zip(n['r'], [0, 0, 0, 1])): nd['rotation'] = [float(x) for x in n['r']]
        if any(abs(x - 1) > 1e-6 for x in n['s']): nd['scale'] = r4(n['s'])
        if n['children']: nd['children'] = list(n['children'])
        if n.get('extras'): nd['extras'] = n['extras']
        glb.j['nodes'].append(nd)
    if not keep_root_xform:
        for k in ('translation', 'rotation', 'scale'):
            glb.j['nodes'][0].pop(k, None)


# ---------------------------------------------------------------- meshes and materials
class Builder:
    """Adds a prefab's renderers (skinned and static) to a GLB, deduplicating materials and textures."""

    def __init__(self, glb, shared_dir, shared_rel, keep_all_props=True):
        self.glb, self.shared_dir, self.shared_rel = glb, shared_dir, shared_rel
        self.tex_ids, self.mat_ids, self.textures, self.materials = {}, {}, {}, {}
        self.keep_all = keep_all_props
        self.mesh_nodes = []   # (parent node index, glTF node dict)

    def tex(self, t, role):
        key = (t.object_reader.assets_file.name, t.object_reader.path_id)
        if key in self.tex_ids:
            return self.tex_ids[key]
        data, alpha = encode_webp(t, role)
        ti = self.glb.image(data, 'image/webp', t.m_Name)
        self.tex_ids[key] = ti
        self.textures[t.m_Name] = dict(role=role, kb=round(len(data) / 1024, 1), alpha=alpha, src=f'{t.m_Width}x{t.m_Height}')
        return ti

    def shared_tex(self, t):
        fn = t.m_Name + '.webp'
        p = os.path.join(self.shared_dir, fn)
        if not os.path.exists(p):
            os.makedirs(self.shared_dir, exist_ok=True)
            im = t.image
            tmp = p + f'.{os.getpid()}.tmp'
            im.save(tmp, 'WEBP', lossless=True, method=6, exact=True)
            try:
                os.replace(tmp, p)
            except PermissionError:          # another worker wrote the same shared texture first
                os.remove(tmp)
                if not os.path.exists(p):
                    raise
        return self.shared_rel + '/' + fn

    def material(self, mp):
        key = (mp.m_FileID, mp.path_id)
        if key in self.mat_ids:
            return self.mat_ids[key]
        mat = mp.read()
        mtt = mat.object_reader.read_typetree()
        texs, floats, colors = wos.tt_props(mtt)
        try:
            shader = mat.m_Shader.read().object_reader.read_typetree()['m_ParsedForm']['m_Name']
        except Exception:
            shader = None
        tdict = dict(mat.m_SavedProperties.m_TexEnvs)
        ext = dict(shader=shader, keywords=sorted(set(mtt.get('m_InvalidKeywords', []) + mtt.get('m_ValidKeywords', []) +
                                                     (mtt.get('m_ShaderKeywords', '') or '').split())),
                   floats={k: round(float(v), 5) for k, v in sorted(floats.items())},
                   colors={k: r4(v) for k, v in sorted(colors.items())}, tex={}, shared={}, texST={})
        m = dict(name=mat.m_Name, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=1.0))
        for prop, te in tdict.items():
            if te is None or not te.m_Texture.path_id:
                continue
            try:
                t = te.m_Texture.read()
            except Exception:
                ext.setdefault('missingTex', []).append(prop)
                continue
            if t.object_reader.type.name != 'Texture2D':
                continue
            st = [te.m_Scale.x, te.m_Scale.y, te.m_Offset.x, te.m_Offset.y]
            if st != [1, 1, 0, 0]:
                ext['texST'][prop] = r4(st)
            if te.m_Texture.m_FileID != 0 and t.object_reader.assets_file.name.lower() != mat.object_reader.assets_file.name.lower() and \
                    prop not in ('_MainTex', '_BaseMap', '_MaskTex', '_DecalTex', '_EmissionMap', '_SubDecalTex', '_DecalMaskTex', '_BlendTex'):
                ext['shared'][prop] = self.shared_tex(t)       # shader.bundle ramps / matcaps, shared by every model
                continue
            role = TEX_PROPS.get(prop, prop.lstrip('_'))
            ti = self.tex(t, role)
            ext['tex'][role if role not in ext['tex'] else prop] = ti
            if role == 'albedo':
                m['pbrMetallicRoughness']['baseColorTexture'] = dict(index=ti)
            if role == 'emission':
                m['emissiveTexture'] = dict(index=ti); m['emissiveFactor'] = [1, 1, 1]
        if not ext['texST']: del ext['texST']
        m['extras'] = ext
        self.glb.j['materials'].append(m)
        mi = len(self.glb.j['materials']) - 1
        self.mat_ids[key] = mi
        self.materials[mat.m_Name] = dict(shader=shader, tex=sorted(ext['tex']), shared=ext['shared'])
        return mi

    def _attrs(self, mesh, skinned):
        mh = MeshHandler(mesh); mh.process()
        nv = mh.m_VertexCount
        g = self.glb

        def arr(a, w):
            if a is None or len(a) == 0:
                return None
            x = np.array(a, np.float32).reshape(nv, -1)
            return x[:, :w].copy()
        pos = arr(mh.m_Vertices, 3); pos[:, 0] *= -1
        attrs = dict(POSITION=g.acc(pos, 5126, 'VEC3', 34962, minmax=True))
        nrm = arr(mh.m_Normals, 3)
        if nrm is not None:
            nrm[:, 0] *= -1
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
            attrs['NORMAL'] = g.acc(nrm, 5126, 'VEC3', 34962)
        for i, a in enumerate([mh.m_UV0, mh.m_UV1, mh.m_UV2, mh.m_UV3]):
            uv = arr(a, 2)
            if uv is not None:
                uv[:, 1] = 1 - uv[:, 1]
                attrs[f'TEXCOORD_{i}'] = g.acc(uv, 5126, 'VEC2', 34962)
        if mh.m_Colors is not None and len(mh.m_Colors):
            col = np.array(mh.m_Colors, np.float32).reshape(nv, -1)
            if col.max() > 1.5: col /= 255.0
            col = np.round(np.clip(col, 0, 1) * 255).astype(np.uint8)
            if col.shape[1] == 3: col = np.concatenate([col, np.full((nv, 1), 255, np.uint8)], 1)
            attrs['COLOR_0'] = g.acc(col, 5121, 'VEC4', 34962, normalized=True)
        if skinned:
            bi0 = np.array(mh.m_BoneIndices).reshape(nv, -1); bw0 = np.array(mh.m_BoneWeights, np.float32).reshape(nv, -1)
            bi = np.zeros((nv, 4), np.uint16); bw = np.zeros((nv, 4), np.float32)
            k = min(4, bi0.shape[1]); bi[:, :k] = bi0[:, :k]; bw[:, :k] = bw0[:, :k]
            bw /= np.maximum(bw.sum(1, keepdims=True), 1e-8)
            if bi.max() < 256:
                attrs['JOINTS_0'] = g.acc(bi.astype(np.uint8), 5121, 'VEC4', 34962)
            else:
                attrs['JOINTS_0'] = g.acc(bi, 5123, 'VEC4', 34962)
            attrs['WEIGHTS_0'] = g.acc(bw, 5126, 'VEC4', 34962)
        return mh, nv, attrs

    def _prims(self, mh, nv, attrs, mats):
        prims = []
        for si, tris in enumerate(mh.get_triangles()):
            if not len(tris):
                continue
            t = np.array(tris, np.uint32)[:, [0, 2, 1]].reshape(-1)          # X flip reverses winding
            idx = self.glb.acc(t.astype(np.uint16), 5123, 'SCALAR', 34963) if nv < 65536 else self.glb.acc(t, 5125, 'SCALAR', 34963)
            mp = mats[min(si, len(mats) - 1)] if mats else None
            p = dict(attributes=attrs, indices=idx)
            if mp is not None and mp.path_id:
                p['material'] = self.material(mp)
            prims.append(p)
        return prims

    def skinned(self, skel, node_i, smr):
        mesh = smr.m_Mesh.read()
        mh, nv, attrs = self._attrs(mesh, True)
        joints = [skel.node_of(b) for b in smr.m_Bones]
        if any(j is None for j in joints):
            raise RuntimeError(f'{mesh.m_Name}: {sum(j is None for j in joints)} bones outside the prefab tree')
        ibm = np.stack([wos.mat_of(m).T.reshape(-1) for m in mesh.m_BindPose]).astype(np.float32)
        g = self.glb
        g.j['meshes'].append(dict(name=mesh.m_Name, primitives=self._prims(mh, nv, attrs, list(smr.m_Materials))))
        root = skel.node_of(smr.m_RootBone)
        g.j['skins'].append(dict(joints=joints, inverseBindMatrices=g.acc(ibm, 5126, 'MAT4'), skeleton=root if root is not None else 0))
        nd = dict(name=skel.nodes[node_i]['name'] + '_skinned', mesh=len(g.j['meshes']) - 1, skin=len(g.j['skins']) - 1)
        if not skel.nodes[node_i]['active'] or not getattr(smr, 'm_Enabled', 1):
            nd['extras'] = dict(hidden=True)
        self.mesh_nodes.append((0, nd))              # skinned nodes go under the root (glTF ignores their transform)
        return dict(mesh=mesh.m_Name, verts=nv, tris=sum(len(t) for t in mh.get_triangles()), bones=len(joints))

    def static(self, skel, node_i, mf, mr):
        mesh = mf.m_Mesh.read()
        mh, nv, attrs = self._attrs(mesh, False)
        g = self.glb
        g.j['meshes'].append(dict(name=mesh.m_Name, primitives=self._prims(mh, nv, attrs, list(mr.m_Materials))))
        nd = dict(name=skel.nodes[node_i]['name'] + '_mesh', mesh=len(g.j['meshes']) - 1)
        if not skel.nodes[node_i]['active'] or not getattr(mr, 'm_Enabled', 1):
            nd['extras'] = dict(hidden=True)
        self.mesh_nodes.append((node_i, nd))         # static mesh follows its transform: child of its own node
        return dict(mesh=mesh.m_Name, verts=nv, tris=sum(len(t) for t in mh.get_triangles()), static=True)

    def all_renderers(self, skel, skip=lambda n: False):
        out = []
        for i, n in enumerate(skel.nodes):
            if skip(n):
                continue
            for r in wos.components(n['go'], 'SkinnedMeshRenderer'):
                if r.m_Mesh.path_id:
                    out.append(self.skinned(skel, i, r))
            mfs = wos.components(n['go'], 'MeshFilter')
            mrs = wos.components(n['go'], 'MeshRenderer')
            if mfs and mrs and mfs[0].m_Mesh.path_id:
                out.append(self.static(skel, i, mfs[0], mrs[0]))
        return out

    def finish_nodes(self):
        g = self.glb
        for parent, nd in self.mesh_nodes:
            g.j['nodes'].append(nd)
            g.j['nodes'][parent].setdefault('children', []).append(len(g.j['nodes']) - 1)


# ---------------------------------------------------------------- clips
KEY_TOL = 1e-3   # max linear-interpolation error kept when dropping samples (metres / quaternion units, ~0.1 deg)


def reduce_keys(t, v, tol):
    """Indices of samples to keep so linear interpolation stays within tol of every dropped sample."""
    n = len(t)
    keep, i = [0], 0
    while i < n - 1:
        j = i + 1
        while j + 1 < n:
            k = j + 1
            seg = slice(i + 1, k)
            w = ((t[seg] - t[i]) / (t[k] - t[i]))[:, None]
            err = np.abs(v[i] * (1 - w) + v[k] * w - v[seg]).max()
            if err > tol:
                break
            j = k
        keep.append(j)
        i = j
    return keep


def add_clip(glb, clip, hash2node, name=None, human=None):
    """Decode a Unity generic AnimationClip into a glTF animation targeting nodes via hash2node (crc32(path) -> node).
    Returns (report dict, set of unresolved path hashes)."""
    b0 = len(glb.bin)
    at, t0, t1, binds, sr = wos.decode_clip(clip)
    n = max(2, int(round((t1 - t0) * sr)) + 1)
    times = np.linspace(t0, t1, n)
    vals = np.stack([at(t) for t in times])
    ch, mb, active, ci, skipped, missing, hum = {}, {}, {}, 0, {}, set(), {}
    for b in binds:
        if b.isPPtrCurve:
            skipped[f'pptr{b.typeID}'] = skipped.get(f'pptr{b.typeID}', 0) + 1
            continue
        if b.typeID == 4 and b.attribute in (1, 2, 3, 4):
            w = 4 if b.attribute == 2 else 3
            node = hash2node.get(b.path)
            v = vals[:, ci:ci + w]
            if node is None:
                missing.add(b.path)
            elif b.attribute == 1:
                ch[(node, 'translation')] = np.stack([-v[:, 0], v[:, 1], v[:, 2]], 1)
            elif b.attribute == 3:
                ch[(node, 'scale')] = v.copy()
            else:
                q = v if b.attribute == 2 else np.array([wos.euler_to_q(e, b.customType) for e in v])
                q = np.stack([q[:, 0], -q[:, 1], -q[:, 2], q[:, 3]], 1)
                q /= np.linalg.norm(q, axis=1, keepdims=True)
                for i in range(1, len(q)):
                    if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
                ch[(node, 'rotation')] = q
            ci += w
            continue
        if b.typeID == 95 and human is not None:      # humanoid muscle / root curve (Animator binding)
            hum[b.attribute] = vals[:, ci]
        elif b.typeID == 114 and b.attribute in MB_ATTR:
            mb[MB_ATTR[b.attribute]] = vals[:, ci]
        elif b.typeID == 1 and b.attribute == GO_ACTIVE:
            node = hash2node.get(b.path)
            if node is None: missing.add(b.path)
            else: active[node] = vals[:, ci]
        else:
            k = f'type{b.typeID}/attr{b.attribute}'
            skipped[k] = skipped.get(k, 0) + 1
        ci += 1
    if human is not None and hum:
        for k, v in human(hum).items():
            ch[k] = v                                  # muscle-derived bone tracks win over generic ones
    tt0 = (times - t0).astype(np.float32)
    time_accs = {}

    def time_acc(keep):
        k = tuple(keep)
        if k not in time_accs:
            time_accs[k] = glb.acc(tt0[list(keep)], 5126, 'SCALAR', minmax=True)
        return time_accs[k]
    samplers, chans = [], []
    for (node, path), v in sorted(ch.items()):
        if np.abs(v - v[0]).max() < 1e-6:
            keep = [0]
        else:
            keep = reduce_keys(tt0, v, KEY_TOL)
        inp, v = time_acc(keep), v[keep]
        if path == 'rotation':      # normalized int16 quaternion (glTF 2.0 allows it; three.js de-normalizes)
            out = glb.acc(np.round(np.clip(v, -1, 1) * 32767).astype(np.int16), 5122, 'VEC4', normalized=True)
        else:
            out = glb.acc(v.astype(np.float32), 5126, 'VEC3')
        samplers.append(dict(input=inp, output=out, interpolation='LINEAR'))
        chans.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
    anim = dict(name=name or clip.m_Name, samplers=samplers, channels=chans)
    ex = dict(loop=bool(clip.m_MuscleClip.m_LoopTime), duration=round(float(t1 - t0), 4), fps=sr)
    tt = [round(float(x), 4) for x in times - t0]
    dec = {k[len('decalViewWeight'):]: v for k, v in mb.items() if k.startswith('decalViewWeight') and np.abs(v).max() > 1e-4}
    if dec:
        ex['decalWeights'] = {'times': tt, **{k: [round(float(x), 3) for x in v] for k, v in sorted(dec.items())}}
    sub = {k[len('subDecalViewWeight'):]: v for k, v in mb.items() if k.startswith('subDecalViewWeight') and np.abs(v).max() > 1e-4}
    if sub:
        ex['subDecalWeights'] = {'times': tt, **{k: [round(float(x), 3) for x in v] for k, v in sorted(sub.items())}}
    other = {k: v for k, v in mb.items() if 'ViewWeight' not in k}
    if other:
        ex['mbCurves'] = {'times': tt, **{k: [round(float(x), 3) for x in v] for k, v in other.items()}}
    if active:
        ex['activeCurves'] = {'times': tt, **{glb.j['nodes'][k]['name'] if k < len(glb.j['nodes']) else str(k):
                                              [int(x > 0.5) for x in v] for k, v in active.items()}}
    if clip.m_Events:
        ex['events'] = [dict(time=round(e.time, 4), fn=e.functionName, s=e.data, f=round(e.floatParameter, 4), i=e.intParameter)
                        for e in clip.m_Events]
    anim['extras'] = ex
    glb.j['animations'].append(anim)
    kb = (len(glb.bin) - b0) / 1024 + len(json.dumps(anim)) / 1024
    rep = dict(name=anim['name'], dur=ex['duration'], loop=ex['loop'], channels=len(chans), kb=round(kb, 1))
    if skipped: rep['skipped'] = skipped
    if missing: rep['missing'] = len(missing)
    if 'events' in ex: rep['events'] = [e['fn'] for e in ex['events']]
    return rep, missing


def write_index(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def container_map(env):
    out = {}
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            for k, v in (getattr(sf, 'container', None) or {}).items():
                out[k] = v
    return out


def script_class(mb_obj, scripts):
    """Resolve a MonoBehaviour's class through bundle_index scripts {"CAB:pathid": class}."""
    try:
        s = mb_obj.m_Script
        sf = mb_obj.object_reader.assets_file
        if s.m_FileID == 0:
            cab = os.path.basename(sf.name)
        else:
            cab = os.path.basename(sf.externals[s.m_FileID - 1].path).lower()
        return scripts.get(f'{cab}:{s.path_id}') or scripts.get(f'{cab.upper()}:{s.path_id}')
    except Exception:
        return None


def load_scripts():
    idx = json.load(open(os.path.join(wos.REF, 'cache', 'bundle_index.json'), encoding='utf-8'))
    s = idx['scripts']
    return {k.lower() if k.startswith('CAB') else k: v for k, v in s.items()} | s


# ================================================================ slimes
OUT = os.path.join(wos.ASSETS, 'slime')


def read_rules():
    """data.bundle: SlimeRenderingData per slime (by name) and the element table from CommonDataSet."""
    env, _ = wos.load(['data.bundle'])
    rules, elements = {}, {}
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        nm = o.peek_name()
        if nm and nm.startswith('SL_'):
            tt = o.read_typetree()
            if 'normalModelResourceName' in tt:
                rules[nm] = {k: v for k, v in tt.items() if k not in ('m_GameObject', 'm_Script', 'm_Enabled', 'm_Name')}
        elif nm == 'CommonDataSet':
            tt = o.read_typetree()
            for e in tt['elementUIData']:
                elements[e['elementEnglishName']] = dict(id=e['element'], key=e['elementName'],
                                                         pastel=r4([e['elementPastelColor'][c] for c in 'rgba']))
            for e in tt['elementGameData']:
                for v in elements.values():
                    if v['id'] == e['element']:
                        v['color'] = r4([e['elementColor'][c] for c in 'rgba'])
                        v['deathColor'] = r4([e['deathEffectColor'][c] for c in 'rgba'])
    del env
    return rules, elements


def split_elements(tag):
    out, s = [], tag
    while s:
        for e in sorted(ELEMENTS, key=len, reverse=True):
            if s.startswith(e):
                out.append(e); s = s[len(e):]; break
        else:
            return out + [s]
    return out


def export_variant(name, rule, species_bundle, scripts, embed_clips=False):
    """One slime variant -> slime/<name>.glb. Returns (meta, skeleton nodes, env-free clip list if embedded)."""
    bundle = f'character_sl_{name[3:].lower()}.bundle'
    env, loaded = wos.load([bundle, species_bundle, 'shader.bundle'], depth=0)
    cont = container_map(env)
    normal = (rule or {}).get('normalModelResourceName') or name + '_Normal'
    key = next((k for k in cont if k.lower().endswith('/' + normal.lower() + '.prefab')), None)
    if key is None:
        raise RuntimeError(f'{name}: prefab {normal} not in {bundle}')
    root_go = cont[key].read()
    skel = Skel(wos.transform_of(root_go))
    glb = wos.GLB('world-of-slime tools/export_slime.py')
    bld = Builder(glb, os.path.join(OUT, 'shared'), 'slime/shared')
    meshes = bld.all_renderers(skel)
    write_nodes(glb, skel.nodes)
    bld.finish_nodes()
    # per-prefab behaviours
    model_info, modifiers = None, []
    for i, n in enumerate(skel.nodes):
        for c in n['go'].m_Component:
            if c.component.type.name != 'MonoBehaviour':
                continue
            mb = c.component.read()
            cls = script_class(mb, scripts) or ''
            tt = mb.object_reader.read_typetree()
            if cls.endswith('SlimeModelInfo'):
                rope = skel.node_of(mb_pptr(mb, tt, '<RopeAttachTransform>k__BackingField'))
                model_info = dict(ropeAttachBone=skel.nodes[rope]['name'] if rope is not None else None,
                                  wwiseFootstepEvent=tt.get('<WwiseFootstepEvent>k__BackingField'))
            elif cls.endswith('SMMaterialModifier'):
                rn = skel.node_of(mb_pptr(mb, tt, '<Renderer>k__BackingField'))
                modifiers.append(dict(node=skel.nodes[i]['name'], renderer=skel.nodes[rn]['name'] if rn is not None else None,
                                      **{k: tt[k] for k in ('materialId', 'enableDecalView', '_decalView', 'enableSubDecalView', '_subDecalView') if k in tt}))
    clip_reps = []
    if embed_clips:
        h2n = skel.hash2node()
        for clip in sorted([o.read() for o in env.objects if o.type.name == 'AnimationClip'], key=lambda c: c.m_Name):
            rep, _ = add_clip(glb, clip, h2n)
            clip_reps.append(rep)
    glb.j['extras'] = dict(source=name, prefab=normal)
    out = os.path.join(OUT, f'{name}.glb')
    glb.write(out)
    parts = name.split('_')
    meta = dict(id=name, species=parts[1], glb=f'slime/{name}.glb', kb=round(os.path.getsize(out) / 1024, 1),
                prefab=normal, rule=rule, modelInfo=model_info, materialModifiers=modifiers, meshes=meshes,
                materials=[dict(name=m['name'], **{k: m['extras'][k] for k in ('shader', 'keywords', 'floats', 'colors', 'shared')},
                                tex=sorted(m['extras']['tex'])) for m in glb.j.get('materials', [])],
                textures=bld.textures, bones=[n['name'] for n in skel.nodes[1:]])
    nodes = [dict(name=n['name'], path=n['path'], parent=skel.nodes[n['parent']]['path'] if n['parent'] >= 0 else None,
                  t=n['t'], r=n['r'], s=n['s']) for n in skel.nodes]
    del env
    return meta, nodes, clip_reps


def mb_pptr(mb, tt, field):
    v = tt.get(field)
    if not v or not v.get('m_PathID'):
        return None
    class P:  # minimal PPtr-like
        path_id = v['m_PathID']
    return P


def species_clip_glb(species, species_bundle, union_nodes):
    """Skeleton-only GLB with every clip of the species. union_nodes: list of node dicts ordered parent first."""
    env, _ = wos.load([species_bundle], depth=0)
    glb = wos.GLB('world-of-slime tools/export_slime.py')
    by_path = {}
    nodes = []
    root = dict(name=f'SL_{species}_anim', path='', t=[0, 0, 0], r=[0, 0, 0, 1], s=[1, 1, 1], children=[])
    nodes.append(root); by_path[''] = 0
    for n in union_nodes:
        if n['path'] == '' or n['path'] in by_path:
            continue
        nodes.append(dict(name=n['name'], path=n['path'], t=n['t'], r=n['r'], s=n['s'], children=[]))
        by_path[n['path']] = len(nodes) - 1
        nodes[by_path[n['parent'] or '']]['children'].append(len(nodes) - 1)
    write_nodes(glb, nodes)
    h2n = {zlib.crc32(n['path'].encode()): i for i, n in enumerate(nodes) if n['path']}
    reps, missing = [], set()
    for clip in sorted([o.read() for o in env.objects if o.type.name == 'AnimationClip'], key=lambda c: c.m_Name):
        rep, miss = add_clip(glb, clip, h2n)
        reps.append(rep); missing |= miss
    animated = {nodes[c['target']['node']]['path'] for a in glb.j['animations'] for c in a['channels']}
    glb.j['extras'] = dict(source=species_bundle, retarget='by node name')
    out = os.path.join(OUT, 'anim', f'{species.lower()}.glb')
    glb.write(out)
    del env
    return dict(glb=f'slime/anim/{species.lower()}.glb', kb=round(os.path.getsize(out) / 1024, 1), clips=reps,
                unresolvedBindings=len(missing), animatedPaths=animated)


def clip_actions(name, species, clip_names):
    """{action: clip}: variant-specific clips SL_<Species>_<Tag>_<Action> win over the shared SL_<Species>_0_<Action>."""
    tag = name.split('_', 2)[2] if name.count('_') >= 2 else ''
    out = {}
    for pre in (f'SL_{species}_0_', f'SL_{species}_{tag}_', f'SL_{species}_{tag}_0_'):
        for c in clip_names:
            if c.lower().startswith(pre.lower()):     # clip names do not always match the variant's case (SL_ManTis_)
                if not c[len(pre):].startswith('0_'):
                    out[c[len(pre):]] = c
    if not out:                  # unusual naming: key by the last part after the species prefix
        for c in clip_names:
            out[c.split('_', 3)[-1]] = c
    return dict(sorted(out.items()))


def do_species(args):
    species, names, rules = args
    t0 = time.time()
    try:
        scripts = load_scripts_cached()
        sb = f'character_shared_sl_{species.lower()}.bundle'
        metas, union, conflict = [], {}, []
        for nm in names:
            meta, nodes, _ = export_variant(nm, rules.get(nm), sb, scripts)
            metas.append(meta)
            for n in nodes[1:]:
                union.setdefault(n['path'], n)
            meta['_paths'] = sorted(n['path'] for n in nodes[1:])
        order = sorted(union.values(), key=lambda n: n['path'].count('/'))
        sp = species_clip_glb(species, sb, order)
        names_seen = {}
        for p, n in union.items():
            if p in sp['animatedPaths']:
                names_seen.setdefault(n['name'], set()).add(p)
        for p, n in union.items():      # an animated name that also names another (static) node is ambiguous too
            if n['name'] in names_seen and p not in sp['animatedPaths']:
                names_seen[n['name']].add(p)
        conflict = {k: sorted(v) for k, v in names_seen.items() if len(v) > 1}
        del sp['animatedPaths']
        if conflict:       # name-based retarget would be ambiguous: keep clips inside each variant
            os.remove(os.path.join(OUT, 'anim', f'{species.lower()}.glb'))
            for nm in names:
                meta, _, reps = export_variant(nm, rules.get(nm), sb, scripts, embed_clips=True)
                m0 = next(m for m in metas if m['id'] == nm)
                m0.update(kb=meta['kb'], clips='embedded', actions=clip_actions(nm, species, [r['name'] for r in reps]))
            sp = dict(clips='embedded', reason=f'animated bone names on different paths: {conflict}')
        all_paths = set(union)
        sets = {tuple(m['_paths']) for m in metas}
        sp['boneSetsIdentical'] = len(sets) == 1
        sp['variants'] = [m['id'] for m in metas]
        for m in metas:
            extra = sorted(all_paths - set(m['_paths']))
            if extra:
                m['bonesMissingVsSpecies'] = extra
            del m['_paths']
            if 'clips' not in m:
                m['anim'] = sp.get('glb')
                m['actions'] = clip_actions(m['id'], species, [c['name'] for c in sp['clips']])
        return species, sp, metas, None, round(time.time() - t0, 1)
    except Exception:
        return species, None, None, traceback.format_exc(), round(time.time() - t0, 1)


_SCRIPTS = None


def load_scripts_cached():
    global _SCRIPTS
    if _SCRIPTS is None:
        _SCRIPTS = load_scripts()
    return _SCRIPTS


def folder_mb(path):
    tot = 0
    for dp, _, fs in os.walk(path):
        tot += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
    return round(tot / 1048576, 2)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    import multiprocessing as mp
    argv = sys.argv[1:]
    only = None
    if '--only' in argv:
        only = set(argv[argv.index('--only') + 1].lower().split(','))
    workers = int(argv[argv.index('--workers') + 1]) if '--workers' in argv else 4
    rules, elements = read_rules()
    log(f'{len(rules)} slime rules, {len(elements)} elements')
    by_species = {}
    for nm in sorted(rules):
        by_species.setdefault(nm.split('_')[1], []).append(nm)
    idx_path = os.path.join(OUT, 'index.json')
    old = json.load(open(idx_path, encoding='utf-8')) if (only and os.path.exists(idx_path)) else None
    if not only and os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'anim'), exist_ok=True)
    todo = [(sp, nms, rules) for sp, nms in sorted(by_species.items()) if not only or sp.lower() in only]
    species_out = dict(old['species']) if old else {}
    variants_out = {v['id']: v for v in old['variants']} if old else {}
    errors = {}
    with mp.Pool(min(workers, 4), maxtasksperchild=8) as pool:
        jobs = [(t[0], pool.apply_async(do_species, (t,))) for t in todo]
        for sp, j in jobs:
            try:
                species, spd, metas, err, sec = j.get(timeout=600)
            except mp.TimeoutError:
                errors[sp] = 'timeout'; log('TIMEOUT', sp); continue
            if err:
                errors[sp] = err; log('ERROR', sp, err.strip().splitlines()[-1]); continue
            species_out[species] = spd
            for m in metas:
                m['elements'] = split_elements(m['id'].split('_', 2)[2] if m['id'].count('_') >= 2 else '')
                m['elementIds'] = [elements[e]['id'] for e in m['elements'] if e in elements]
                variants_out[m['id']] = m
            log(f'{species}: {len(metas)} variants, clips {spd.get("glb", spd.get("clips"))} '
                f'{len(spd.get("clips", [])) if isinstance(spd.get("clips"), list) else ""} ({sec}s)')
    index = dict(generator='games/world-of-slime/tools/export_slime.py',
                 note='Normal prefab per variant (mesh+skin+textures). Clips per species in anim/<species>.glb; '
                      'bind with THREE.AnimationMixer on the variant scene (tracks resolve by node name). '
                      'Material extras hold all MixMaster/Unit params; shared ramps/matcaps under slime/shared.',
                 elements=elements, species=dict(sorted(species_out.items())),
                 variants=[variants_out[k] for k in sorted(variants_out)], errors=errors,
                 totalMB=0)
    write_index(idx_path, index)
    index['totalMB'] = folder_mb(OUT)
    write_index(idx_path, index)
    log(f'done: {len(index["variants"])} variants, {len(index["species"])} species, {len(errors)} errors, {index["totalMB"]} MB')


if __name__ == '__main__':
    main()
