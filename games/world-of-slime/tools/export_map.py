"""Export every map prefab library (map_* bundles) to GLB with shared, deduplicated WebP textures.

Run:  py -3.12 -I games/world-of-slime/tools/export_map.py [bundle ...] [--workers 4] [--no-clear]
      (no bundle args = every map library: ter00-09, t00-08, int01-08, path_*, synt, cliff, npc, waterfall, shadow)
Out:  <wos.ASSETS>/map/<bundle>.glb      one node per prefab piece (root children), meshes/materials from mapres_*
      <wos.ASSETS>/map/tex/<hash>.webp   textures, shared by every GLB (external URIs "tex/<hash>.webp")
      <wos.ASSETS>/map/index.json        per piece: bundle, bounds, materials (shader + params), colliders, extras
      <wos.ASSETS>/map/combine.json      data.bundle MapCombineDataSet (autotile table) + piece->role lookup

Coordinates follow wos.py: Unity X is negated (p -> (-x,y,z)). A Unity world position (x,y,z) is (-x,y,z) in the GLB.
Vertex colours go out as the custom attribute `_COLOR` (three: geometry.attributes._color) so three does not
multiply them into albedo; the Tile Blend / Base shaders use them as masks.

export_prop.py imports `export_library` from this file.
"""
import os, sys, io, json, math, time, shutil, hashlib, zlib, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import wos

MAP_RX = re.compile(r'^map_(ter\d\d|t\d\d|int\d\d|path|synt|cliff|npc|waterfall|shadow)[^.]*\.bundle$')
TEX_MAX = 1024          # longest side of exported textures
WEBP_Q = 85
TASK_TIMEOUT = 900      # s per bundle
# path ids of meshes in Unity's built-in 'unity default resources'
BUILTIN_MESHES = {10202: 'Cube', 10206: 'Cylinder', 10207: 'Sphere', 10208: 'Capsule', 10209: 'Plane', 10210: 'Quad'}


# ---------------------------------------------------------------- small helpers
def bundle_index():
    return json.load(open(os.path.join(wos.REF, 'cache', 'bundle_index.json'), encoding='utf-8'))


def trs_matrix(t, r, s):
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * np.array(s)[None, :]; M[:3, 3] = t
    return M


def aabb_xform(M, lo, hi):
    c = np.array([[a, b, d, 1] for a in (lo[0], hi[0]) for b in (lo[1], hi[1]) for d in (lo[2], hi[2])])
    p = (M @ c.T).T[:, :3]
    return p.min(0), p.max(0)


def r4(v):
    return [round(float(x), 4) + 0.0 for x in v]


def encode_texture(tex, texdir):
    """Decode a Texture2D, write tex/<hash>.webp once (hash of the decoded pixels). Returns info dict."""
    im = tex.image.convert('RGBA')
    src = f'{tex.m_Width}x{tex.m_Height} fmt{tex.m_TextureFormat}'
    if max(im.size) > TEX_MAX:
        k = TEX_MAX / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    a = np.asarray(im)[:, :, 3]
    alpha = bool((a < 250).mean() > 0.001)
    if not alpha:
        im = im.convert('RGB')
    h = hashlib.sha1(im.tobytes() + repr(im.size).encode()).hexdigest()[:16]
    rel = f'tex/{h}.webp'
    path = os.path.join(texdir, h + '.webp')
    lossless = min(im.size) <= 16        # ramps (128x1, 8x1): keep exact
    if not os.path.exists(path):
        b = io.BytesIO()
        if lossless:
            im.save(b, 'WEBP', lossless=True, method=6, exact=True)
        else:
            im.save(b, 'WEBP', quality=WEBP_Q, method=6, exact=alpha)
        tmp = path + f'.{os.getpid()}.tmp'
        with open(tmp, 'wb') as f:
            f.write(b.getvalue())
        os.replace(tmp, path)
    return dict(hash=h, uri=rel, name=tex.m_Name, src=src, w=im.width, h=im.height, alpha=alpha,
                kb=round(os.path.getsize(path) / 1024, 1))


# ---------------------------------------------------------------- the exporter
class Library:
    """One bundle of prefabs -> one GLB. Every prefab root is a child of the scene root node."""

    def __init__(self, bundle, out_glb, texdir, tex_prefix, scripts, anims=False, generator='export_map.py'):
        self.bundle, self.out_glb, self.texdir, self.tex_prefix = bundle, out_glb, texdir, tex_prefix
        self.scripts, self.anims = scripts, anims
        self.glb = wos.GLB('world-of-slime ' + generator)
        self.glb.j['images'] = []
        self.mesh_ids, self.mat_ids, self.tex_ids, self.shader_names = {}, {}, {}, {}
        self.materials, self.textures, self.missing = {}, {}, []
        self.pieces = []
        self.attr_cache, self.idx_cache, self.quantized = {}, {}, False

    # textures: external URIs
    def tex_index(self, tex):
        key = (tex.assets_file.name, tex.object_reader.path_id)
        if key not in self.tex_ids:
            info = encode_texture(tex, self.texdir)
            self.textures[info['hash']] = info
            self.glb.j['images'].append(dict(uri=self.tex_prefix + info['uri'], mimeType='image/webp', name=tex.m_Name))
            src = len(self.glb.j['images']) - 1
            self.glb.j['textures'].append(dict(sampler=0, extensions=dict(EXT_texture_webp=dict(source=src))))
            self.glb.webp = True
            self.tex_ids[key] = (len(self.glb.j['textures']) - 1, info['hash'])
        return self.tex_ids[key]

    def shader_name(self, mat):
        pid = (mat.m_Shader.file_id, mat.m_Shader.path_id, mat.assets_file.name)
        if pid not in self.shader_names:
            try:
                sh = mat.m_Shader.read()
                n = sh.object_reader.peek_name() if hasattr(sh.object_reader, 'peek_name') else None
                if not n:
                    n = sh.object_reader.read_typetree()['m_ParsedForm']['m_Name']
            except Exception as e:
                n = '?'
            self.shader_names[pid] = n
        return self.shader_names[pid]

    def material(self, mp):
        try:
            mat = mp.read()
        except Exception as e:
            self.missing.append(f'material {mp.file_id}:{mp.path_id}: {e}')
            return None, None
        key = (mat.assets_file.name, mat.object_reader.path_id)
        if key in self.mat_ids:
            return self.mat_ids[key]
        mtt = mat.object_reader.read_typetree()
        _, floats, colors = wos.tt_props(mtt)
        shader = self.shader_name(mat)
        params = dict(name=mat.m_Name, shader=shader,
                      keywords=sorted(set(mtt.get('m_InvalidKeywords', []) + mtt.get('m_ValidKeywords', []) +
                                          (mtt.get('m_ShaderKeywords', '') or '').split())),
                      renderQueue=mtt.get('m_CustomRenderQueue', -1),
                      floats={k: round(float(v), 5) for k, v in sorted(floats.items())},
                      colors={k: r4(v) for k, v in sorted(colors.items())}, tex={}, texST={})
        m = dict(name=mat.m_Name, pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=1.0))
        gl_tex = {}
        for prop, te in sorted(dict(mat.m_SavedProperties.m_TexEnvs).items()):
            if not te.m_Texture.path_id:
                continue
            try:
                t = te.m_Texture.read()
                if t.object_reader.type.name != 'Texture2D':
                    params['tex'][prop] = '(' + t.object_reader.type.name + ')'
                    continue
                ti, h = self.tex_index(t)
                gl_tex[prop] = ti
                params['tex'][prop] = self.tex_prefix + self.textures[h]['uri']
                sc, of = te.m_Scale, te.m_Offset
                if (sc.x, sc.y, of.x, of.y) != (1, 1, 0, 0):
                    params['texST'][prop] = r4([sc.x, sc.y, of.x, of.y])
            except Exception as e:
                self.missing.append(f'texture {prop} of material {mat.m_Name}: {e}')
        mt = gl_tex.get('_MainTex', gl_tex.get('_BaseMap'))
        if mt is not None:
            m['pbrMetallicRoughness']['baseColorTexture'] = dict(index=mt)
        c = colors.get('_Color', colors.get('_BaseColor'))
        if c:
            m['pbrMetallicRoughness']['baseColorFactor'] = [min(1.0, max(0.0, float(x))) for x in c]
        if floats.get('_UseTransparent') or 'Transparent' in shader or mtt.get('m_CustomRenderQueue', -1) >= 3000:
            m['alphaMode'] = 'BLEND'
        elif floats.get('_Cutoff') and floats.get('_AlphaClip', floats.get('_UseCutoff', 0)):
            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = float(floats['_Cutoff'])
        m['extras'] = dict(params, texIndex=gl_tex)
        self.glb.j['materials'].append(m)
        idx = len(self.glb.j['materials']) - 1
        mid = f'{mat.m_Name}@{key[0][-8:]}:{key[1]}'
        self.materials[mid] = params
        self.mat_ids[key] = (idx, mid)
        return self.mat_ids[key]

    def mesh(self, mesh_pp, mats, skin_joints=None):
        mesh = mesh_pp.read()
        key = (mesh.assets_file.name, mesh.object_reader.path_id, tuple(mats), skin_joints is not None)
        if key in self.mesh_ids:
            return self.mesh_ids[key]
        akey = (mesh.assets_file.name, mesh.object_reader.path_id, skin_joints is not None)
        if akey in self.attr_cache:           # same mesh, other materials: reuse the vertex accessors
            attrs, mh, pos, has_col = self.attr_cache[akey]
            nv = mh.m_VertexCount
        else:
            attrs, mh, pos, has_col = self.vertex_attrs(mesh, skin_joints is not None)
            self.attr_cache[akey] = (attrs, mh, pos, has_col)
            nv = mh.m_VertexCount
        g = self.glb
        prims = []
        big = nv >= 65536
        tris_all = mh.get_triangles()
        for si, tris in enumerate(tris_all):
            if not tris or not mats:
                continue
            if (akey, si) not in self.idx_cache:
                idx = np.array(tris, np.uint32 if big else np.uint16)[:, [0, 2, 1]].reshape(-1)
                self.idx_cache[(akey, si)] = g.acc(idx, 5125 if big else 5123, 'SCALAR', 34963)
            # Unity: more materials than submeshes = each extra material draws the LAST submesh again (a second pass).
            # The Larus fountain water (Water_Flow_01 / Water_Fall: [FX_Alpha_Skyblue_Over, FX_Offset_WaterWave_012])
            # is such a pass; taking only mats[si] dropped the water surface (F5a).
            last = si == len(tris_all) - 1
            for mi in (mats[si:] if last and si < len(mats) else [mats[min(si, len(mats) - 1)]]):
                p = dict(attributes=attrs, indices=self.idx_cache[(akey, si)])
                if mi is not None:
                    p['material'] = mi
                prims.append(p)
        g.j['meshes'].append(dict(name=mesh.m_Name, primitives=prims))
        res = dict(index=len(g.j['meshes']) - 1, name=mesh.m_Name, verts=nv, tris=sum(len(t) for t in tris_all),
                   lo=pos.min(0) if nv else np.zeros(3), hi=pos.max(0) if nv else np.zeros(3), color=has_col,
                   bindposes=[wos.mat_of(m) for m in mesh.m_BindPose] if skin_joints is not None else None)
        self.mesh_ids[key] = res
        return res

    def qacc(self, arr, ctype, typ, stride):
        """Quantized vertex attribute (KHR_mesh_quantization): rows padded to `stride` bytes."""
        g = self.glb
        arr = np.ascontiguousarray(arr)
        n, w = arr.shape
        pad = stride // arr.dtype.itemsize - w
        if pad:
            arr = np.concatenate([arr, np.zeros((n, pad), arr.dtype)], 1)
        bv = g.view(arr.tobytes(), 34962)
        g.j['bufferViews'][bv]['byteStride'] = stride
        g.j['accessors'].append(dict(bufferView=bv, componentType=ctype, count=n, type=typ, normalized=True))
        self.quantized = True
        return len(g.j['accessors']) - 1

    def vertex_attrs(self, mesh, skinned):
        from UnityPy.helpers.MeshHelper import MeshHandler
        mh = MeshHandler(mesh); mh.process()
        nv = mh.m_VertexCount
        g = self.glb
        pos = np.array(mh.m_Vertices, np.float32).reshape(nv, -1)[:, :3].copy(); pos[:, 0] *= -1
        attrs = dict(POSITION=g.acc(pos, 5126, 'VEC3', 34962, minmax=True))
        if mh.m_Normals:
            nrm = np.array(mh.m_Normals, np.float32).reshape(nv, -1)[:, :3].copy(); nrm[:, 0] *= -1
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
            attrs['NORMAL'] = self.qacc(np.round(nrm * 127).astype(np.int8), 5120, 'VEC3', 4)
        for i in range(4):
            uv = getattr(mh, f'm_UV{i}', None)
            if uv:
                u = np.array(uv, np.float32).reshape(nv, -1)[:, :2].copy(); u[:, 1] = 1 - u[:, 1]
                if nv and u.min() >= 0 and u.max() <= 1:      # unit range: 16-bit normalized
                    attrs[f'TEXCOORD_{i}'] = self.qacc(np.round(u * 65535).astype(np.uint16), 5123, 'VEC2', 4)
                else:
                    attrs[f'TEXCOORD_{i}'] = g.acc(u, 5126, 'VEC2', 34962)
        has_col = bool(mh.m_Colors)
        if has_col:
            col = np.array(mh.m_Colors, np.float32).reshape(nv, -1)
            if col.max() > 1.5: col /= 255.0
            attrs['_COLOR'] = g.acc(np.round(np.clip(col, 0, 1) * 255).astype(np.uint8), 5121, 'VEC4', 34962, normalized=True)
        if skinned and mh.m_BoneIndices:
            bi0 = np.array(mh.m_BoneIndices).reshape(nv, -1)
            # one bone per vertex: the mesh has no weight channel (UnityPy gives None)
            bw0 = (np.array(mh.m_BoneWeights, np.float32).reshape(nv, -1) if mh.m_BoneWeights
                   else np.ones((nv, bi0.shape[1]), np.float32))
            k = min(4, bi0.shape[1])
            bi = np.zeros((nv, 4), np.uint16); bw = np.zeros((nv, 4), np.float32)
            bi[:, :k] = bi0[:, :k]; bw[:, :k] = bw0[:, :k]
            bw /= np.maximum(bw.sum(1, keepdims=True), 1e-8)
            if bi.max() < 256:
                attrs['JOINTS_0'] = g.acc(bi.astype(np.uint8), 5121, 'VEC4', 34962)
            else:
                attrs['JOINTS_0'] = g.acc(bi, 5123, 'VEC4', 34962)
            attrs['WEIGHTS_0'] = g.acc(bw, 5126, 'VEC4', 34962)
        return attrs, mh, pos, has_col

    # ---- prefab tree
    def collider(self, c, tname):
        d = dict(type=tname, trigger=bool(getattr(c, 'm_IsTrigger', False)), enabled=bool(getattr(c, 'm_Enabled', True)))
        if tname == 'BoxCollider':
            d.update(center=wos.cp(c.m_Center), size=[c.m_Size.x, c.m_Size.y, c.m_Size.z])
        elif tname == 'SphereCollider':
            d.update(center=wos.cp(c.m_Center), radius=c.m_Radius)
        elif tname == 'CapsuleCollider':
            d.update(center=wos.cp(c.m_Center), radius=c.m_Radius, height=c.m_Height, direction=c.m_Direction)
        elif tname == 'MeshCollider':
            d['convex'] = bool(c.m_Convex)
            try:
                me = c.m_Mesh.read()
                b = me.m_LocalAABB
                d.update(mesh=me.m_Name, center=wos.cp(b.m_Center), extent=[b.m_Extent.x, b.m_Extent.y, b.m_Extent.z])
            except Exception:
                d['mesh'] = None
        return {k: (r4(v) if isinstance(v, list) else round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}

    def particle_mesh(self, go, comp, nd, Mw, info, lo, hi):
        """ParticleSystemRenderer in Mesh mode (m_RenderMode 4) whose system holds one still particle (start speed 0, no
        shape / velocity / size / rotation module): the fountain pool surface (Water_Flow_02, mesh Plane001, size 1.3)
        and its rim (Water_Flow_Side, Circle_01, size 1.9) are drawn this way. Export it as a static mesh child scaled by
        startSize (alignment Local = the transform's rotation) with extras.particleMesh. Moving particle systems stay
        unexported (counted in `particles`)."""
        try:
            tt = comp.component.read_typetree()
            if tt.get('m_RenderMode') != 4 or not tt.get('m_Mesh', {}).get('m_PathID'):
                return
            ps = [c for c in go.m_Component if c.component.type.name == 'ParticleSystem']
            if not ps:
                return
            pt = ps[0].component.read_typetree()
            im = pt['InitialModule']
            moving = (im['startSpeed'].get('minMaxState') != 0 or abs(im['startSpeed'].get('scalar', 0)) > 1e-6 or
                      pt['ShapeModule'].get('enabled') or any(pt[m].get('enabled') for m in
                      ('VelocityModule', 'SizeModule', 'RotationModule', 'ForceModule', 'NoiseModule') if m in pt))
            if moving or tt.get('m_RenderAlignment') not in (1, 2):   # 1 World, 2 Local: mesh keeps a fixed orientation
                info['particleMeshSkipped'] = info.get('particleMeshSkipped', 0) + 1
                return
            sz = im['startSize']['scalar']
            s3 = [sz, im['startSizeY']['scalar'], im['startSizeZ']['scalar']] if im.get('size3D') else [sz, sz, sz]
            r = comp.component.read()
            ms = [self.material(mp) if mp.path_id else (None, None) for mp in r.m_Materials]
            ms = [x for x in ms if x[0] is not None] or [(None, None)]
            me = self.mesh(r.m_Mesh, [x[0] for x in ms])
            g = self.glb
            g.j['nodes'].append(dict(name=go.m_Name + '_particleMesh', mesh=me['index'], scale=r4(s3),
                                     extras=dict(particleMesh=True, startSize=r4(s3))))
            nd.setdefault('children', []).append(len(g.j['nodes']) - 1)
            nd.setdefault('extras', {})['hasParticleMesh'] = True
            for x in ms:
                if x[1] and x[1] not in info['materials']: info['materials'].append(x[1])
            info['meshes'].append(me['name']); info['verts'] += me['verts']; info['tris'] += me['tris']
            info['particleMeshes'] = info.get('particleMeshes', 0) + 1
            Ms = Mw @ np.diag([s3[0], s3[1], s3[2], 1.0])
            a, b = aabb_xform(Ms, me['lo'], me['hi']); lo[:] = np.minimum(lo, a); hi[:] = np.maximum(hi, b)
        except Exception as e:
            self.missing.append(f'particle mesh of {info["name"]}/{go.m_Name}: {e}')

    def piece(self, root_go, address=None):
        """Walk one prefab. Returns the glTF node index of its root and fills self.pieces."""
        g = self.glb
        info = dict(name=root_go.m_Name, address=address, meshes=[], materials=[], colliders=[], particles=0,
                    behaviours=[], skinned=0, inactive=0, verts=0, tris=0, vertexColor=False)
        pid2node, smrs, animators = {}, [], []
        lo, hi = np.full(3, np.inf), np.full(3, -np.inf)

        def walk(tr, M, path):
            go = tr.m_GameObject.read()
            nd = dict(name=go.m_Name)
            t, r = wos.cp(tr.m_LocalPosition), wos.cq(tr.m_LocalRotation)
            s = [tr.m_LocalScale.x, tr.m_LocalScale.y, tr.m_LocalScale.z]
            if path is not None:           # root keeps its prefab transform too (it is the placement origin)
                pass
            if any(abs(x) > 1e-7 for x in t): nd['translation'] = r4(t)
            if any(abs(a - b) > 1e-7 for a, b in zip(r, [0, 0, 0, 1])): nd['rotation'] = [float(x) for x in r]
            if any(abs(x - 1) > 1e-6 for x in s): nd['scale'] = r4(s)
            Mw = M @ trs_matrix(t, r, s)
            g.j['nodes'].append(nd)
            ni = len(g.j['nodes']) - 1
            pid2node[tr.object_reader.path_id] = ni
            active = bool(go.m_IsActive)
            if not active:
                info['inactive'] += 1
                nd.setdefault('extras', {})['inactive'] = True
            for comp in go.m_Component:
                tname = comp.component.type.name
                if tname in ('Transform', 'RectTransform'):
                    continue
                try:
                    c = comp.component.read()
                except Exception as e:
                    self.missing.append(f'{info["name"]}/{go.m_Name} {tname}: {e}'); continue
                if tname == 'MeshRenderer' and active and c.m_Enabled:
                    mfs = wos.components(go, 'MeshFilter')
                    ext_name = ''
                    if mfs and mfs[0].m_Mesh.file_id:
                        try:
                            ext_name = go.assets_file.externals[mfs[0].m_Mesh.file_id - 1].path.lower()
                        except Exception:
                            pass
                    if mfs and 'unity default resources' in ext_name:
                        # Unity built-in primitive (Plane 10x10 m / Quad 1x1 m / Cube ...): not in any bundle.
                        # Recorded so the web side can build the same primitive with the piece's material.
                        ms = [self.material(mp) for mp in c.m_Materials if mp.path_id]
                        prim = BUILTIN_MESHES.get(mfs[0].m_Mesh.path_id, f'builtin#{mfs[0].m_Mesh.path_id}')
                        nd.setdefault('extras', {})['builtinMesh'] = prim
                        info.setdefault('builtinMeshes', []).append(dict(node=go.m_Name, mesh=prim, materials=[x[1] for x in ms if x[1]],
                                                                         nodeMatrix=[round(float(x), 4) + 0.0 for x in Mw.T.reshape(-1)]))
                    elif mfs and mfs[0].m_Mesh.path_id:
                        try:
                            ms = [self.material(mp) if mp.path_id else (None, None) for mp in c.m_Materials]
                            me = self.mesh(mfs[0].m_Mesh, [x[0] for x in ms])
                            nd['mesh'] = me['index']
                            for x in ms:
                                if x[1] and x[1] not in info['materials']: info['materials'].append(x[1])
                            info['meshes'].append(me['name']); info['verts'] += me['verts']; info['tris'] += me['tris']
                            info['vertexColor'] |= me['color']
                            a, b = aabb_xform(Mw, me['lo'], me['hi']); lo[:] = np.minimum(lo, a); hi[:] = np.maximum(hi, b)
                        except Exception as e:
                            self.missing.append(f'mesh of {info["name"]}/{go.m_Name}: {e}')
                elif tname == 'SkinnedMeshRenderer' and active and c.m_Enabled and c.m_Mesh.path_id:
                    smrs.append((ni, c, Mw, go.m_Name))
                elif tname in ('BoxCollider', 'SphereCollider', 'CapsuleCollider', 'MeshCollider'):
                    d = self.collider(c, tname); d['node'] = go.m_Name
                    if Mw is not None:
                        d['nodeMatrix'] = [round(float(x), 4) for x in Mw.T.reshape(-1)]
                    info['colliders'].append(d)
                elif tname == 'ParticleSystem':
                    info['particles'] += 1
                elif tname == 'ParticleSystemRenderer' and active and c.m_Enabled:
                    self.particle_mesh(go, comp, nd, Mw, info, lo, hi)
                elif tname == 'MonoBehaviour':
                    sp = c.m_Script
                    cls = None
                    try:
                        cab = os.path.basename(go.assets_file.externals[sp.file_id - 1].path) if sp.file_id else go.assets_file.name
                        cls = self.scripts.get(f'{cab}:{sp.path_id}') or self.scripts.get(f'{cab.upper().replace("CAB-", "CAB-")}:{sp.path_id}')
                    except Exception:
                        pass
                    info['behaviours'].append(cls or f'?{sp.path_id}')
                elif tname == 'Animator':
                    animators.append((ni, c, path or ''))
            kids = []
            for ch in tr.m_Children:
                ctr = ch.read()
                cname = ctr.m_GameObject.read().m_Name
                kids.append(walk(ctr, Mw, cname if not path else path + '/' + cname))
            if kids: g.j['nodes'][ni]['children'] = g.j['nodes'][ni].get('children', []) + kids
            return ni

        root_tr = wos.transform_of(root_go)
        # bounds are relative to the piece root (root transform excluded): pieces are placed by their root
        rt = trs_matrix(wos.cp(root_tr.m_LocalPosition), wos.cq(root_tr.m_LocalRotation),
                        [root_tr.m_LocalScale.x, root_tr.m_LocalScale.y, root_tr.m_LocalScale.z])
        ri = walk(root_tr, np.linalg.inv(rt), '')
        for ni, smr, Mw, gname in smrs:
            try:
                joints = [pid2node[b.path_id] for b in smr.m_Bones if b.path_id in pid2node]
                if len(joints) != len(smr.m_Bones):
                    raise ValueError(f'{len(smr.m_Bones) - len(joints)} bones outside the prefab')
                ms = [self.material(mp) if mp.path_id else (None, None) for mp in smr.m_Materials]
                me = self.mesh(smr.m_Mesh, [x[0] for x in ms], skin_joints=joints)
                if not joints:   # skinned renderer with no bones: treat as static
                    g.j['nodes'][ni]['mesh'] = me['index']
                else:
                    ibm = np.stack([m.T.reshape(-1) for m in me['bindposes']]).astype(np.float32)
                    g.j['skins'].append(dict(joints=joints, inverseBindMatrices=g.acc(ibm, 5126, 'MAT4')))
                    # skinned mesh node: a fresh child of the piece root (glTF ignores the skinned node's transform)
                    g.j['nodes'].append(dict(name=gname + '_skinned', mesh=me['index'], skin=len(g.j['skins']) - 1))
                    g.j['nodes'][ri].setdefault('children', []).append(len(g.j['nodes']) - 1)
                for x in ms:
                    if x[1] and x[1] not in info['materials']: info['materials'].append(x[1])
                info['meshes'].append(me['name']); info['verts'] += me['verts']; info['tris'] += me['tris']
                info['skinned'] += 1; info['vertexColor'] |= me['color']
                a, b = aabb_xform(Mw, me['lo'], me['hi']); lo[:] = np.minimum(lo, a); hi[:] = np.maximum(hi, b)
            except Exception as e:
                self.missing.append(f'skinned mesh of {info["name"]}/{gname}: {e}')
        if self.anims and animators:
            info['clips'] = []
            for ni, an, path in animators:
                info['clips'] += self.animator_clips(an, ni, pid2node, info['name'])
        info['root'] = dict(translation=r4(wos.cp(root_tr.m_LocalPosition)), rotation=r4(wos.cq(root_tr.m_LocalRotation)),
                            scale=r4([root_tr.m_LocalScale.x, root_tr.m_LocalScale.y, root_tr.m_LocalScale.z]))
        if np.isfinite(lo).all():
            info['bounds'] = dict(min=r4(lo), max=r4(hi))
        info['behaviours'] = sorted(set(info['behaviours']))
        for k in ('colliders', 'behaviours', 'clips'):
            if k in info and not info[k]: del info[k]
        for k in ('particles', 'skinned', 'inactive'):
            if not info[k]: del info[k]
        info['meshes'] = sorted(set(info['meshes']))
        self.pieces.append(info)
        return ri

    # ---- animation (props): Animator -> controller -> clips, bindings relative to the Animator's GameObject
    def animator_clips(self, an, an_node, pid2node, piece_name):
        out = []
        try:
            ctrl = an.m_Controller.read() if an.m_Controller.path_id else None
        except Exception as e:
            self.missing.append(f'{piece_name}: animator controller unreadable: {e}'); return out
        if ctrl is None:
            return out
        clips = []
        tt = ctrl.object_reader.read_typetree()
        if 'm_AnimationClips' in tt:
            clips = list(ctrl.m_AnimationClips)
        elif 'm_Clips' in tt:                 # AnimatorOverrideController
            base = ctrl.m_Controller.read() if ctrl.m_Controller.path_id else None
            ov = {c.m_OriginalClip.path_id: c.m_OverrideClip for c in ctrl.m_Clips if c.m_OverrideClip.path_id}
            for c in (base.m_AnimationClips if base else []):
                clips.append(ov.get(c.path_id, c))
        # node paths relative to the Animator node
        g = self.glb
        rel = {}
        def paths(ni, p):
            if p: rel[zlib.crc32(p.encode())] = ni
            for c in g.j['nodes'][ni].get('children', []):
                nm = g.j['nodes'][c]['name']
                if nm.endswith('_skinned') and 'skin' in g.j['nodes'][c]:
                    continue
                paths(c, nm if not p else p + '/' + nm)
        paths(an_node, '')
        seen = set()
        for cp_ in clips:
            if not cp_.path_id or (cp_.file_id, cp_.path_id) in seen:
                continue
            seen.add((cp_.file_id, cp_.path_id))
            try:
                clip = cp_.read()
                out.append(self.clip(clip, rel))
            except Exception as e:
                self.missing.append(f'{piece_name}: clip {cp_.path_id}: {e}')
        return out

    def clip(self, clip, hash2node):
        g = self.glb
        at, t0, t1, binds, sr = wos.decode_clip(clip)
        n = max(2, int(round((t1 - t0) * min(sr, 30))) + 1)
        times = np.linspace(t0, t1, n)
        vals = np.stack([at(t) for t in times])
        ch, ci, skipped = {}, 0, []
        for b in binds:
            if b.isPPtrCurve:
                continue
            if b.typeID == 4 and b.attribute in (1, 2, 3, 4):
                w = 4 if b.attribute == 2 else 3
                node = hash2node.get(b.path)
                v = vals[:, ci:ci + w]
                if node is None:
                    skipped.append(f'path{b.path}')
                elif b.attribute == 1:
                    ch[(node, 'translation')] = np.stack([-v[:, 0], v[:, 1], v[:, 2]], 1)
                elif b.attribute == 3:
                    ch[(node, 'scale')] = v.copy()
                else:
                    q = v if b.attribute == 2 else np.array([wos.euler_to_q(e, b.customType) for e in v])
                    q = np.stack([q[:, 0], -q[:, 1], -q[:, 2], q[:, 3]], 1)
                    q /= np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-9)
                    for i in range(1, len(q)):
                        if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
                    ch[(node, 'rotation')] = q
                ci += w
            else:
                skipped.append(f'type{b.typeID}/attr{b.attribute}')
                ci += 1
        a_t = g.acc((times - t0).astype(np.float32), 5126, 'SCALAR', minmax=True)
        a_t1 = None
        samplers, chans = [], []
        for (node, path), v in sorted(ch.items()):
            if np.abs(v - v[0]).max() < 1e-6:
                if a_t1 is None: a_t1 = g.acc(np.array([0.0], np.float32), 5126, 'SCALAR', minmax=True)
                inp, v = a_t1, v[:1]
            else:
                inp = a_t
            samplers.append(dict(input=inp, output=g.acc(v.astype(np.float32), 5126, 'VEC4' if path == 'rotation' else 'VEC3'),
                                 interpolation='LINEAR'))
            chans.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
        ex = dict(loop=bool(clip.m_MuscleClip.m_LoopTime), duration=round(float(t1 - t0), 4))
        if clip.m_Events:
            ex['events'] = [dict(time=round(e.time, 4), fn=e.functionName, s=e.data) for e in clip.m_Events]
        if not chans:   # glTF forbids empty animations; keep it as a note
            return dict(name=clip.m_Name, channels=0, skipped=sorted(set(skipped))[:8], **ex)
        g.j['animations'].append(dict(name=clip.m_Name, samplers=samplers, channels=chans, extras=ex))
        return dict(name=clip.m_Name, channels=len(chans), skipped=sorted(set(skipped))[:8], **ex)

    def write(self, root_name):
        g = self.glb
        g.j['nodes'][0]['name'] = root_name
        if not g.j['images']:
            del g.j['images']
        ext = (['EXT_texture_webp'] if g.webp else []) + (['KHR_mesh_quantization'] if self.quantized else [])
        g.webp = False                      # wos.GLB.write would overwrite the extension lists
        if ext:
            g.j['extensionsUsed'] = ext; g.j['extensionsRequired'] = ext
        g.write(self.out_glb)
        return os.path.getsize(self.out_glb)


def prefab_roots(env, bundle):
    """(address, GameObject) for every prefab in the bundle's container, sorted by address."""
    out = []
    for f in env.files.values():
        if os.path.basename(getattr(f, 'name', '') or '').lower() != bundle.lower():
            continue
        for sf in getattr(f, 'files', {}).values():
            for k, v in (getattr(sf, 'container', None) or {}).items():
                if k.lower().endswith('.prefab'):
                    try:
                        if v.type.name == 'GameObject':
                            out.append((k, v.read()))
                    except Exception:
                        pass
    out.sort(key=lambda x: x[0])
    return out


def export_library(bundle, outdir, texdir, scripts, anims=False, extra=(), generator='export_map.py'):
    """Export one bundle of prefabs. Returns the manifest fragment (pieces, materials, textures, missing)."""
    t0 = time.time()
    env, loaded = wos.load([bundle] + list(extra), depth=2,
                           skip=('monoscripts.bundle',) + tuple(b for b in () ))
    if 'shader.bundle' not in loaded:
        env.load_file(os.path.join(wos.D, 'shader.bundle')); loaded.append('shader.bundle')
    roots = prefab_roots(env, bundle)
    # Bundle file names do not describe their content (map_ter05_cave.bundle holds the t01_Larus town), so the GLB
    # is named after the prefabs' Addressables folder; a bundle with several folders keeps its bundle name.
    folders = sorted({a.split('/')[-2] for a, _ in roots})
    stem = re.sub(r'[^a-z0-9_]+', '_', folders[0].lower()).strip('_') if len(folders) == 1 else bundle[:-7]
    lib = Library(bundle, os.path.join(outdir, stem + '.glb'), texdir, '', scripts, anims=anims, generator=generator)
    lib.glb.j['nodes'].append(dict(name=stem, children=[]))
    for addr, go in roots:
        try:
            ni = lib.piece(go, addr)
            lib.glb.j['nodes'][0]['children'].append(ni)
        except Exception as e:
            lib.missing.append(f'prefab {addr}: {type(e).__name__}: {e}')
    size = lib.write(stem)
    for p in lib.pieces:
        p['bundle'] = stem
    return dict(bundle=stem, sourceBundle=bundle, folders=folders, glb=os.path.basename(lib.out_glb), kb=round(size / 1024, 1), deps=loaded,
                pieces=lib.pieces, materials=lib.materials, textures=lib.textures, missing=lib.missing,
                sec=round(time.time() - t0, 1))


# ---------------------------------------------------------------- driver (shared with export_prop.py)
def scripts_table():
    try:
        return bundle_index().get('scripts', {})
    except Exception:
        return {}


def _one(argv):
    """Child mode: export_map.py --one <bundle> <outdir> <anims 0/1> <generator> <result.json>"""
    bundle, outdir, anims, generator, res = argv
    texdir = os.path.join(outdir, 'tex')
    try:
        r = export_library(bundle, outdir, texdir, scripts_table(), anims=anims == '1', generator=generator)
    except Exception as e:
        import traceback
        r = dict(bundle=bundle[:-7], error=f'{type(e).__name__}: {e}', trace=traceback.format_exc()[-1500:])
    with open(res + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(r, f, ensure_ascii=False)
    os.replace(res + '.tmp', res)


def run_all(bundles, outdir, workers=4, anims=False, generator='export_map.py', clear=True):
    """One child process per bundle (a crashed or hung child cannot stall the run), at most 4 at a time,
    one retry for a failed bundle (MemoryError on the shared machine)."""
    import subprocess
    from concurrent.futures import ThreadPoolExecutor
    texdir = os.path.join(outdir, 'tex')
    if clear and os.path.isdir(outdir):
        for n in os.listdir(outdir):
            p = os.path.join(outdir, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(texdir, exist_ok=True)
    work = os.path.join(outdir, '.work')
    os.makedirs(work, exist_ok=True)
    me = os.path.abspath(__file__)

    def job(b):
        res = os.path.join(work, b + '.json')
        r = None
        for attempt in range(2):
            if os.path.exists(res): os.remove(res)
            try:
                cp = subprocess.run([sys.executable, '-I', me, '--one', b, outdir, '1' if anims else '0', generator, res],
                                    timeout=TASK_TIMEOUT, capture_output=True, text=True, encoding='utf-8', errors='replace')
                if os.path.exists(res):
                    r = json.load(open(res, encoding='utf-8'))
                else:
                    r = dict(bundle=b[:-7], error=f'child exit {cp.returncode}', trace=(cp.stderr or '')[-1500:])
            except subprocess.TimeoutExpired:
                r = dict(bundle=b[:-7], error=f'timeout {TASK_TIMEOUT} s')
            if 'error' not in r:
                break
            time.sleep(5)
        if 'error' in r:
            print('FAIL', b, r['error'], r.get('trace', ''), flush=True)
        else:
            print(f"{r['bundle']}: {len(r['pieces'])} pieces, {r['kb']} KB, {len(r['textures'])} tex, "
                  f"{len(r['missing'])} missing, {r['sec']} s", flush=True)
        return r

    with ThreadPoolExecutor(min(4, workers)) as ex:
        results = list(ex.map(job, bundles))
    shutil.rmtree(work, ignore_errors=True)
    return results


def manifest(results, outdir, folder):
    """Merge worker results into <folder>/index.json. Paths are relative to the asset repo root."""
    texdir = os.path.join(outdir, 'tex')
    materials, textures, bundles, pieces = {}, {}, {}, []
    for r in sorted(results, key=lambda r: r['bundle']):
        if 'error' in r:
            bundles[r['bundle']] = dict(error=r['error']); continue
        if r['bundle'] in bundles:
            raise SystemExit(f'two bundles export to {r["glb"]}: rename rule in export_library needs a tie-break')
        bundles[r['bundle']] = dict(glb=f'{folder}/{r["glb"]}', sourceBundle=r['sourceBundle'], folders=r['folders'],
                                    kb=r['kb'], pieces=len(r['pieces']), deps=r['deps'],
                                    missing=r['missing'])
        for k, v in r['materials'].items():
            v = dict(v); v['tex'] = {p: (f'{folder}/{u}' if u.startswith('tex/') else u) for p, u in v['tex'].items()}
            materials[k] = v
        for h, t in r['textures'].items():
            t = dict(t); t['uri'] = f'{folder}/{t["uri"]}'; textures[h] = t
        for p in r['pieces']:
            p = dict(p); p['glb'] = f'{folder}/{r["glb"]}'
            pieces.append(p)
    # material ids: the material name, plus #2, #3 when different materials share a name
    by_name = {}
    for k in sorted(materials):
        by_name.setdefault(materials[k]['name'], []).append(k)
    rename, final = {}, {}
    for nm, keys in by_name.items():
        uniq = []
        for k in keys:
            body = json.dumps(materials[k], sort_keys=True)
            for i, (b, _) in enumerate(uniq):
                if b == body:
                    rename[k] = nm if i == 0 else f'{nm}#{i + 1}'; break
            else:
                uniq.append((body, k)); rename[k] = nm if len(uniq) == 1 else f'{nm}#{len(uniq)}'
                final[rename[k]] = materials[k]
    materials = final
    for p in pieces:
        p['materials'] = sorted({rename.get(m, m) for m in p['materials']})
    used = set(textures)
    on_disk = {n[:-5] for n in os.listdir(texdir) if n.endswith('.webp')}
    for h in on_disk - used:      # written by a worker whose result was lost: drop to keep the folder exact
        os.remove(os.path.join(texdir, h + '.webp'))
    tex_mb = sum(os.path.getsize(os.path.join(texdir, h + '.webp')) for h in used) / 1e6
    glb_mb = sum(b.get('kb', 0) for b in bundles.values()) / 1024
    idx = dict(generated_by=f'games/world-of-slime/tools/{"export_map.py" if folder == "map" else "export_prop.py"}',
               coords='Unity X negated: unity (x,y,z) -> glTF (-x,y,z); quaternions (x,-y,-z,w)',
               vertexColorAttribute='_COLOR',
               totals=dict(bundles=len(bundles), pieces=len(pieces), materials=len(materials), textures=len(textures),
                           glb_mb=round(glb_mb, 2), tex_mb=round(tex_mb, 2)),
               bundles=bundles, pieces=sorted(pieces, key=lambda p: (p['bundle'], p['name'])),
               materials=dict(sorted(materials.items())), textures=dict(sorted(textures.items())))
    with open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, separators=(',', ':'))
    return idx


# ---------------------------------------------------------------- MapCombineDataSet
def dump_combine(outdir):
    env, _ = wos.load(['data.bundle'])
    d = None
    for o in env.objects:
        if o.type.name == 'MonoBehaviour':
            try:
                if o.peek_name() == 'MapCombineDataSet':
                    d = o.read_typetree(); break
            except Exception:
                continue
    if d is None:
        raise SystemExit('MapCombineDataSet not found in data.bundle')
    for k in ('m_GameObject', 'm_Script', 'm_Enabled'):
        d.pop(k, None)
    roles = ('centerTiles', 'edgeTiles', 'convexCornerTiles', 'concaveCornerTiles', 'groundEdgeTiles', 'groundCornerTiles')
    lookup = {}
    for kind, groups in d['classfication'].items():
        for grp in groups:
            for role in roles:
                for nm in grp.get(role, []):
                    lookup.setdefault(nm, []).append(dict(kind=kind, group=grp['tileClassificationName'], role=role))
    d['_pieceRoles'] = dict(sorted(lookup.items()))
    d['_note'] = ('Dumped from data.bundle MapCombineDataSet. classfication.<kind>[] lists tile piece names (GameObject '
                  'names of prefabs in map/*.glb) per tile group and role. _pieceRoles is the reverse lookup.')
    with open(os.path.join(outdir, 'combine.json'), 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    return d, lookup


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if sys.argv[1:2] == ['--one']:
        return _one(sys.argv[2:])
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 4
    if '--workers' in sys.argv:
        args.remove(str(workers))
    outdir = os.path.join(wos.ASSETS, 'map')
    if args:
        bundles = [a if a.endswith('.bundle') else a + '.bundle' for a in args]
    else:
        bundles = sorted(b for b in bundle_index()['bundles'] if MAP_RX.match(b))
    print(len(bundles), 'bundles', flush=True)
    t0 = time.time()
    results = run_all(bundles, outdir, workers, clear='--no-clear' not in sys.argv and not args)
    if args:      # partial run (debugging): GLBs and textures are rewritten, index.json/combine.json are left alone
        print('partial run: index.json not rewritten; run without bundle names for the full manifest')
        return
    d, lookup = dump_combine(outdir)
    idx = manifest(results, outdir, 'map')
    names = {p['name'] for p in idx['pieces']}
    miss = sorted(n for n in lookup if n not in names)
    idx['combineNamesWithoutPiece'] = miss
    with open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(idx['totals']), f'combine names {len(lookup)}, without piece {len(miss)}', f'{time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
