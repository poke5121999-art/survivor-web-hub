"""Tay đua: default male/female racer (Zing Speed) -> art/drivers/<id>.glb + data/drivers.js.

Run: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_driver.py
Skeleton = <g>/00root/h?characterroot.prefab, outfit = the newbie set 00500 (matches the fallback
Boy_00000 / Girl_00000 texture), face 00001. Clips = F_AvatarAnimator (male override reuses them),
generic rig, decoded from streamed/dense/constant clip data.
"""
import sys, os, io, json, math, struct, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs, UnityPy, numpy as np, lz4.block
from UnityPy.helpers.MeshHelper import MeshHandler
from PIL import Image

GAME = os.path.dirname(HERE)
OUT_ART = os.path.join(GAME, 'art', 'drivers')
OUT_DATA = os.path.join(GAME, 'data', 'drivers.js')
WORK = os.path.join(zs.REF, 'work', 'driver')
CABMAP = os.path.join(WORK, 'cabmap.json')

DRIVERS = [
    dict(id='nam', name='Tay đua nam', g='male', root='hmcharacterroot',
         parts=['01hair/hhair_00500', '02face/hface_00001', '03top/htop_00500', '04bottom/hbottom_00500', '05shoe/hshoe_00500']),
    dict(id='nu', name='Tay đua nữ', g='female', root='hfcharacterroot',
         parts=['01hair/hhair_00500', '02face/hface_00001', '03top/htop_00500', '04bottom/hbottom_00500', '05shoe/hshoe_00500']),
]
# role -> original clip (state names from F_AvatarAnimator Base Layer)
CLIPS = {
    'drive': 'Idle', 'left': 'TurnLeftIdle', 'right': 'TurnRightIdle',
    'drift_l': 'DriftLeftIdle', 'drift_r': 'DriftRightIdle',
    'boost': 'BoostIdle', 'boost_l': 'BoostTurnLeftIdle', 'boost_r': 'BoostTurnRightIdle',
    'boost_drift_l': 'BoostDriftLeftIdle', 'boost_drift_r': 'BoostDriftRightIdle',
    'ready': 'Ready', 'brake': 'Brake', 'brake_drift': 'BrakeDrift', 'little_brake': 'LittleBrake',
    'reverse': 'Reversing', 'reverse_l': 'ReversingLeft', 'reverse_r': 'ReversingRight',
    'jump': 'Jump', 'jump_acc': 'JumpAcc', 'fly': 'Flight', 'land': 'Landing',
    'crash_l': 'CrashLeft', 'crash_r': 'CrashRight', 'crash_f': 'CrashFront', 'crash_b': 'CrashBack',
    'hit': 'Hit', 'look_l': 'LookLeft', 'look_r': 'LookRight', 'throw': 'Throw', 'throw_back': 'ThrowBack',
    'win': 'Finish01', 'lose': 'UnFinish01', 'goal': 'Goal', 'celebrate': 'WaterCelebrate',
    'idle1': 'Idle01', 'idle2': 'Idle02', 'idle3': 'Idle03', 'idle4': 'Idle04', 'idle5': 'Idle05', 'idle6': 'Idle06',
}
LOOP = {'drive', 'left', 'right', 'drift_l', 'drift_r', 'boost', 'boost_l', 'boost_r', 'boost_drift_l',
        'boost_drift_r', 'reverse', 'reverse_l', 'reverse_r', 'fly', 'brake_drift'}
# Base Layer.Move = 2D freeform blend on (Turn, Accel); Reversing = 1D on Turn.
BLEND = {
    'move': {'params': ['Turn', 'Accel'], 'points': [
        ['boost_drift_l', -1, 0.5], ['boost_drift_r', 1, 0.5], ['boost_l', -0.5, 0.7], ['boost_r', 0.5, 0.7],
        ['drift_l', -1, 0], ['drift_r', 1, 0], ['left', -0.5, 0], ['right', 0.5, 0], ['boost', 0, 0.7], ['drive', 0, 0]]},
    'reverse': {'params': ['Turn'], 'points': [['reverse_l', -0.7], ['reverse', 0], ['reverse_r', 0.7]]},
    'jump': {'params': ['Accel'], 'points': [['jump', 0], ['jump_acc', 1]]},
}
TEX_MAX = 512


# ---------- bundle lookup (index.jsonl's cab field holds file names, so map CAB names ourselves) ----------
def _bundle_nodes(path):
    with open(path, 'rb') as f:
        if f.read(8) != b'UnityFS\0':
            return []
        ver = struct.unpack('>I', f.read(4))[0]
        for _ in range(2):
            while f.read(1) != b'\0':
                pass
        _size, csz, usz, flags = struct.unpack('>qIII', f.read(20))
        if ver >= 7:
            f.seek((f.tell() + 15) & ~15)
        if flags & 0x80:
            f.seek(-csz, 2)
        raw = f.read(csz)
    comp = flags & 0x3F
    if comp in (2, 3):
        raw = lz4.block.decompress(raw, uncompressed_size=usz)
    elif comp == 1:
        import lzma
        props, dsz = raw[0], struct.unpack('<I', raw[1:5])[0]
        filt = {'id': lzma.FILTER_LZMA1, 'dict_size': dsz, 'lc': props % 9, 'lp': (props // 9) % 5, 'pb': props // 45}
        raw = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[filt]).decompress(raw[5:])
    p = 16
    nb = struct.unpack('>i', raw[p:p + 4])[0]; p += 4 + nb * 10
    nn = struct.unpack('>i', raw[p:p + 4])[0]; p += 4
    names = []
    for _ in range(nn):
        p += 20
        e = raw.index(b'\0', p)
        names.append(raw[p:e].decode()); p = e + 1
    return names


def cab_map():
    if os.path.exists(CABMAP):
        return json.load(open(CABMAP))
    m = {}
    for r in zs.index():
        try:
            for n in _bundle_nodes(os.path.join(zs.IFS, r['f'])):
                m[n.lower()] = r['f']
        except Exception:
            pass
    os.makedirs(WORK, exist_ok=True)
    json.dump(m, open(CABMAP, 'w'))
    return m


def load(paths, cm, depth=2):
    env = UnityPy.Environment(); seen = set(); todo = [os.path.join(zs.IFS, p) for p in paths]
    for _ in range(depth + 1):
        nxt = []
        for p in todo:
            if p not in seen:
                seen.add(p); env.load_file(p)
        for f in list(env.files.values()):
            for sf in getattr(f, 'files', {}).values():
                for ext in getattr(sf, 'externals', []):
                    q = cm.get(os.path.basename(ext.path).lower())
                    if q and os.path.join(zs.IFS, q) not in seen:
                        nxt.append(os.path.join(zs.IFS, q))
        if not nxt:
            break
        todo = nxt
    return env


def bundle_of(cont):
    for r in zs.index():
        if cont in r['cont']:
            return r['f']
    raise SystemExit('asset not found in index: ' + cont)


def container_obj(env, cont):
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            c = getattr(sf, 'container', None)
            if c and cont in c:
                return c[cont].read()
    raise SystemExit('container entry not loaded: ' + cont)


# ---------- coordinate conversion (README): p -> (x,y,-z), q -> (-x,-y,z,w) ----------
def cp(v): return [v.x, v.y, -v.z]
def cq(q): return [-q.x, -q.y, q.z, q.w]
S = np.diag([1.0, 1.0, -1.0, 1.0])


def mat_of(m):
    a = np.array([[getattr(m, f'e{r}{c}') for c in range(4)] for r in range(4)], dtype=np.float64)
    return S @ a @ S


def transform_of(go):
    for c in go.m_Component:
        if c.component.type.name == 'Transform':
            return c.component.read()


def components(go, tname):
    return [c.component.read() for c in go.m_Component if c.component.type.name == tname]


# ---------- skeleton ----------
class Skel:
    def __init__(self, root_go):
        self.nodes = []      # {name, parent, t, r, s, path}
        self.by_name = {}
        self._walk(transform_of(root_go), -1, '')

    def _walk(self, tr, parent, path):
        name = tr.m_GameObject.read().m_Name
        if parent >= 0:
            path = name if not path else path + '/' + name
        self.add(name, parent, cp(tr.m_LocalPosition), cq(tr.m_LocalRotation), [tr.m_LocalScale.x, tr.m_LocalScale.y, tr.m_LocalScale.z], path)
        i = len(self.nodes) - 1
        for ch in tr.m_Children:
            self._walk(ch.read(), i, path)

    def add(self, name, parent, t, r, s, path):
        self.nodes.append(dict(name=name, parent=parent, t=t, r=r, s=s, path=path, children=[]))
        i = len(self.nodes) - 1
        if parent >= 0:
            self.nodes[parent]['children'].append(i)
        self.by_name.setdefault(name, i)
        return i

    def graft(self, tr):
        """Index of the node for a part's bone Transform; adds bones the root skeleton lacks."""
        name = tr.m_GameObject.read().m_Name
        if name in self.by_name:
            return self.by_name[name]
        par = tr.m_Father.read() if tr.m_Father.path_id else None
        pi = self.graft(par) if par is not None else 0
        pp = self.nodes[pi]['path']
        return self.add(name, pi, cp(tr.m_LocalPosition), cq(tr.m_LocalRotation),
                        [tr.m_LocalScale.x, tr.m_LocalScale.y, tr.m_LocalScale.z], (pp + '/' if pp else '') + name)


# ---------- animation clip decoding ----------
def decode_clip(clip):
    """-> (curves_at(t) -> np.array of all float curves, stop time, bindings)."""
    mc = clip.m_MuscleClip
    c = mc.m_Clip.data
    sc, dc, cc = c.m_StreamedClip, c.m_DenseClip, c.m_ConstantClip
    raw = struct.pack(f'<{len(sc.data)}I', *sc.data)
    frames = []
    p = 0
    while p < len(raw):
        t, nk = struct.unpack_from('<fI', raw, p); p += 8
        keys = []
        for _ in range(nk):
            idx, a, b, cc1, d = struct.unpack_from('<i4f', raw, p); p += 20
            keys.append((idx, a, b, cc1, d))
        frames.append((t, keys))
    ns = sc.curveCount
    nd = dc.m_CurveCount
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
    return at, mc.m_StartTime, mc.m_StopTime, clip.m_ClipBindingConstant.genericBindings, clip.m_SampleRate


def euler_to_q(e):
    x, y, z = [math.radians(a) for a in e]
    cx, sx, cy, sy, cz, sz = math.cos(x / 2), math.sin(x / 2), math.cos(y / 2), math.sin(y / 2), math.cos(z / 2), math.sin(z / 2)
    qx = (sx, 0, 0, cx); qy = (0, sy, 0, cy); qz = (0, 0, sz, cz)
    def mul(a, b):
        ax, ay, az, aw = a; bx, by, bz, bw = b
        return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
    return mul(mul(qy, qx), qz)   # Unity applies Z, then X, then Y


def sample_clip(clip, skel, hash2node):
    at, t0, t1, binds, sr = decode_clip(clip)
    sr = sr or 30.0
    n = max(2, int(round((t1 - t0) * sr)) + 1)
    times = np.linspace(t0, t1, n)
    vals = np.stack([at(t) for t in times])
    ch = {}   # (node, path) -> array
    ci = 0
    skipped = 0
    for b in binds:
        if b.isPPtrCurve:
            continue
        if b.typeID == 4 and b.attribute in (1, 2, 3, 4):
            w = 4 if b.attribute == 2 else 3
            node = hash2node.get(b.path)
            if node is None:
                skipped += 1
            else:
                v = vals[:, ci:ci + w]
                if b.attribute == 1:
                    ch[(node, 'translation')] = np.stack([v[:, 0], v[:, 1], -v[:, 2]], 1)
                elif b.attribute == 3:
                    ch[(node, 'scale')] = v.copy()
                else:
                    q = v if b.attribute == 2 else np.array([euler_to_q(e) for e in v])
                    q = np.stack([-q[:, 0], -q[:, 1], q[:, 2], q[:, 3]], 1)
                    q /= np.linalg.norm(q, axis=1, keepdims=True)
                    for i in range(1, len(q)):
                        if np.dot(q[i], q[i - 1]) < 0:
                            q[i] = -q[i]
                    ch[(node, 'rotation')] = q
            ci += w
        else:
            ci += 1
    return times - t0, ch, skipped


# ---------- glTF writer ----------
class GLB:
    def __init__(self):
        self.j = dict(asset=dict(version='2.0', generator='toc-do export_driver.py'), scenes=[dict(nodes=[0])], scene=0,
                      nodes=[], meshes=[], skins=[], materials=[], textures=[], images=[], samplers=[dict(magFilter=9729, minFilter=9987)],
                      accessors=[], bufferViews=[], buffers=[], animations=[])
        self.bin = bytearray()

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = dict(buffer=0, byteOffset=len(self.bin), byteLength=len(data))
        if target:
            bv['target'] = target
        self.bin += data
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def acc(self, arr, ctype, typ, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        a = dict(bufferView=self.view(arr.tobytes(), target), componentType=ctype, count=int(arr.shape[0]), type=typ)
        if normalized:
            a['normalized'] = True
        if minmax:
            a['min'] = [float(x) for x in np.atleast_1d(arr.min(0))]
            a['max'] = [float(x) for x in np.atleast_1d(arr.max(0))]
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def acc_many(self, arrs):
        """Several accessors in one bufferView: [(arr, componentType, type, minmax)] -> accessor ids."""
        blob, offs = bytearray(), []
        for a, *_ in arrs:
            blob += b'\0' * (-len(blob) % 4)
            offs.append(len(blob)); blob += np.ascontiguousarray(a).tobytes()
        bv = self.view(bytes(blob))
        ids = []
        for (a, ctype, typ, mm), off in zip(arrs, offs):
            acc = dict(bufferView=bv, byteOffset=off, componentType=ctype, count=int(a.shape[0]), type=typ)
            if ctype == 5122:
                acc['normalized'] = True
            if mm:
                acc['min'] = [float(x) for x in np.atleast_1d(a.min(0))]
                acc['max'] = [float(x) for x in np.atleast_1d(a.max(0))]
            self.j['accessors'].append(acc)
            ids.append(len(self.j['accessors']) - 1)
        return ids

    def image(self, png):
        self.j['images'].append(dict(bufferView=self.view(png), mimeType='image/png'))
        self.j['textures'].append(dict(sampler=0, source=len(self.j['images']) - 1))
        return len(self.j['textures']) - 1

    def write(self, path):
        for k in [k for k, v in self.j.items() if v == []]:
            del self.j[k]
        while len(self.bin) % 4:
            self.bin.append(0)
        self.j['buffers'] = [dict(byteLength=len(self.bin))]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(self.bin)


def tex_png(tex):
    im = tex.image
    if max(im.size) > TEX_MAX:
        k = TEX_MAX / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    a = np.asarray(im.convert('RGBA'))[:, :, 3]
    cut = bool((a < 128).mean() > 0.01)
    im = im.convert('RGBA') if cut else im.convert('RGB')
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
    return b.getvalue(), cut


def export_driver(d, cm, root_env, ctrl):
    g = d['g']
    root_go = container_obj(root_env, f"assets/resforassetbundles/avatar/character/{g}/00root/{d['root']}.prefab")
    skel = Skel(root_go)
    conts = [f"assets/resforassetbundles/avatar/character/{g}/{p}.prefab" for p in d['parts']]
    env = load([bundle_of(c) for c in conts], cm, depth=1)
    glb = GLB()
    tex_cache = {}
    meshes = []   # (name, primitives, skin joints)
    for cont in conts:
        go = container_obj(env, cont)
        stack = [transform_of(go)]
        smrs = []
        while stack:
            tr = stack.pop()
            smrs += components(tr.m_GameObject.read(), 'SkinnedMeshRenderer')
            stack += [c.read() for c in tr.m_Children]
        for smr in smrs:
            mesh = smr.m_Mesh.read()
            mh = MeshHandler(mesh); mh.process()
            pos = np.array(mh.m_Vertices, dtype=np.float32)[:, :3]; pos[:, 2] *= -1
            nrm = np.array(mh.m_Normals, dtype=np.float32)[:, :3]; nrm[:, 2] *= -1
            nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-8)
            uv = np.array(mh.m_UV0, dtype=np.float32)[:, :2].copy(); uv[:, 1] = 1 - uv[:, 1]
            bi = np.zeros((len(pos), 4), np.uint16); bw = np.zeros((len(pos), 4), np.float32)
            bi0 = np.array(mh.m_BoneIndices).reshape(len(pos), -1); bw0 = np.array(mh.m_BoneWeights).reshape(len(pos), -1)
            k = min(4, bi0.shape[1]); bi[:, :k] = bi0[:, :k]; bw[:, :k] = bw0[:, :k]   # skin may be 1/2-bone
            bw /= np.maximum(bw.sum(1, keepdims=True), 1e-8)
            joints = [skel.graft(b.read()) for b in smr.m_Bones]
            ibm = np.stack([mat_of(m).T.reshape(-1) for m in mesh.m_BindPose]).astype(np.float32)   # column-major
            a_pos = glb.acc(pos, 5126, 'VEC3', 34962, minmax=True)
            a_nrm = glb.acc(nrm, 5126, 'VEC3', 34962)
            a_uv = glb.acc(uv, 5126, 'VEC2', 34962)
            a_j = glb.acc(bi, 5123, 'VEC4', 34962)
            a_w = glb.acc(bw, 5126, 'VEC4', 34962)
            prims = []
            for si, tris in enumerate(mh.get_triangles()):
                if not tris:
                    continue
                idx = np.array(tris, dtype=np.uint32)[:, [0, 2, 1]].reshape(-1)
                matp = smr.m_Materials[min(si, len(smr.m_Materials) - 1)]
                mat = matp.read()
                key = mat.m_Name
                if key not in tex_cache:
                    tx = dict(mat.m_SavedProperties.m_TexEnvs).get('_MainTex')
                    m = dict(name=mat.m_Name, doubleSided=True,
                             pbrMetallicRoughness=dict(metallicFactor=0.0, roughnessFactor=0.85))
                    if tx is not None and tx.m_Texture.path_id:
                        png, cut = tex_png(tx.m_Texture.read())
                        m['pbrMetallicRoughness']['baseColorTexture'] = dict(index=glb.image(png))
                        if cut:
                            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5
                    glb.j['materials'].append(m)
                    tex_cache[key] = len(glb.j['materials']) - 1
                prims.append(dict(attributes=dict(POSITION=a_pos, NORMAL=a_nrm, TEXCOORD_0=a_uv, JOINTS_0=a_j, WEIGHTS_0=a_w),
                                  indices=glb.acc(idx.astype(np.uint16 if len(pos) < 65536 else np.uint32), 5123 if len(pos) < 65536 else 5125, 'SCALAR', 34963),
                                  material=tex_cache[key]))
            meshes.append((smr.m_GameObject.read().m_Name, prims, joints, ibm))
    # nodes: skeleton first (node i = skel i), then one node per skinned mesh under the root
    for n in skel.nodes:
        nd = dict(name=n['name'])
        if any(abs(x) > 1e-7 for x in n['t']): nd['translation'] = n['t']
        if any(abs(a - b) > 1e-7 for a, b in zip(n['r'], [0, 0, 0, 1])): nd['rotation'] = n['r']
        if any(abs(x - 1) > 1e-6 for x in n['s']): nd['scale'] = n['s']
        if n['children']: nd['children'] = list(n['children'])
        glb.j['nodes'].append(nd)
    glb.j['nodes'][0]['name'] = d['id']
    glb.j['nodes'][0].pop('translation', None); glb.j['nodes'][0].pop('rotation', None)
    for name, prims, joints, ibm in meshes:
        glb.j['meshes'].append(dict(name=name, primitives=prims))
        glb.j['skins'].append(dict(joints=joints, inverseBindMatrices=glb.acc(ibm, 5126, 'MAT4'), skeleton=skel.by_name.get('Root', 0)))
        glb.j['nodes'].append(dict(name=name, mesh=len(glb.j['meshes']) - 1, skin=len(glb.j['skins']) - 1))
        glb.j['nodes'][0].setdefault('children', []).append(len(glb.j['nodes']) - 1)
    # animations
    hash2node = {zlib.crc32(n['path'].encode()): i for i, n in enumerate(skel.nodes) if n['path']}
    clips = {c.read().m_Name: c.read() for c in ctrl.m_AnimationClips}
    info = {}
    a_t1 = None
    for role, cname in CLIPS.items():
        clip = clips.get(cname)
        if clip is None:
            print('  clip missing:', cname); continue
        times, ch, skipped = sample_clip(clip, skel, hash2node)
        arrs = [(times.astype(np.float32), 5126, 'SCALAR', True)]
        if a_t1 is None:
            a_t1 = glb.acc(np.array([0.0], np.float32), 5126, 'SCALAR', minmax=True)
        samplers, chans = [], []
        for (node, path), v in sorted(ch.items()):
            n = skel.nodes[node]
            rest = {'translation': n['t'], 'rotation': n['r'], 'scale': n['s']}[path]
            const = np.abs(v - v[0]).max() < 1e-5
            if const:
                r0 = np.array(rest)
                if np.abs(v[0] - r0).max() < 1e-4 or (path == 'rotation' and np.abs(v[0] + r0).max() < 1e-4):
                    continue   # same as rest pose: the mixer falls back to it
                v = v[:1]
            if path == 'rotation':
                arrs.append((np.round(np.clip(v, -1, 1) * 32767).astype(np.int16), 5122, 'VEC4', False))
            else:
                arrs.append((v.astype(np.float32), 5126, 'VEC3', False))
            samplers.append(dict(input=a_t1 if const else -1, output=len(arrs) - 1, interpolation='LINEAR'))
            chans.append(dict(sampler=len(samplers) - 1, target=dict(node=node, path=path)))
        ids = glb.acc_many(arrs)
        for sm in samplers:
            sm['input'] = ids[0] if sm['input'] == -1 else sm['input']
            sm['output'] = ids[sm['output']]
        glb.j['animations'].append(dict(name=role, samplers=samplers, channels=chans))
        info[role] = dict(src=cname, dur=round(float(times[-1]), 3), loop=role in LOOP)
        if skipped:
            print(f'  {cname}: {skipped} bindings without a bone')
    os.makedirs(OUT_ART, exist_ok=True)
    out = os.path.join(OUT_ART, d['id'] + '.glb')
    glb.write(out)
    print(f"{out}: {os.path.getsize(out) / 1e6:.2f} MB, {len(skel.nodes)} nodes, {len(meshes)} meshes, {len(info)} clips")
    return info


def main():
    cm = cab_map()
    root_cont = 'assets/resforassetbundles/avatar/character/female/00root/f_avataranimator.controller'
    root_env = load([bundle_of(root_cont)], cm, depth=1)
    ctrl = container_obj(root_env, root_cont)
    js = ['// Sinh bởi tools/export_driver.py — không sửa tay.',
          "(function (G) { G.TD = G.TD || {}; G.TD.DRIVERS = G.TD.DRIVERS || {}; })(typeof window !== 'undefined' ? window : globalThis);"]
    for d in DRIVERS:
        info = export_driver(d, cm, root_env, ctrl)
        rec = dict(id=d['id'], name=d['name'], glb=f"art/drivers/{d['id']}.glb",
                   clips={k: k for k in info}, clipInfo=info, blend=BLEND, mountOffset=[0, 0, 0],
                   seatNode='Car_Seat_M' if d['g'] == 'male' else 'Car_Seat',   # avatar anchor in original car prefabs
                   source=dict(gender=d['g'], parts=d['parts'], controller='F_AvatarAnimator'))
        js.append(f"TD.DRIVERS[{json.dumps(d['id'])}] = {json.dumps(rec, ensure_ascii=False)};")
    with open(OUT_DATA, 'w') as f:
        f.write('\n'.join(js) + '\n')
    print(OUT_DATA)


if __name__ == '__main__':
    main()
