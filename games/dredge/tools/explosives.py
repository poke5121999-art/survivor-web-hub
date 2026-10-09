"""24 diem no min (ExplosivePOI) -> data/explosives.js + art/world/explosives/*.webp  (W4, WORLD-GAPS.md muc 6).

Chay:  python -I games/dredge/tools/explosives.py        (~30 giay: doc thang Scenes/Game.unity dang YAML, nhu ghostrocks.py)
Doc:   Scenes/Game.unity: moi MonoBehaviour ExplosivePOI (id, animator, conversationNodeName), chuoi Transform toi goc scene, GameObject con cua
       doi tuong Animator (DestroyableBlockade/RuinWall/Tree/Bridge) tru nhanh Effects: MeshFilter, MeshRenderer, Box/Mesh/Sphere/CapsuleCollider;
       AnimatorController Destroyable + Explode_0.anim (Effects bat, Objects tat, DestroySelf sau 5 s), Mesh/*.asset, Material/*.mat, Texture2D.
Ra:    window.DR_EXPLOSIVES = [24 diem: { id, node, path, glint, x, z, r, kind, sfx, parts[], fx[], fp }], window.DR_EXPLOSIVE_LIB = { meshes, mats }
       fp = dau chan va cham trong landmask.png: cac doan [j, i, do dai] (hang j, cot i dau, so o) dung nhung o ma tools/world.py collect_colliders
       ve cho cac collider cua diem nay (cung phep bien doi, cung PIL polygon); luc chay js/explosives.js xoa chung khoi truong khoang cach khi `<id>-detonated`.
Toa do: Unity trai tay -> three.js phai tay bang doi dau z (nhu ghostrocks.py). Quaternion (x,y,z,w) -> (-x,-y,z,w); tam giac dao chieu.
Bay:   `[BAY DA SAP]` cac doi tuong DestroyableRock trong nhieu diem m_IsActive 0 (chi hien o bien the khac) nen KHONG co collider that; hieu luc active
       phai tinh theo ca chuoi cha. Mesh ve cua hau het da la "Combined Mesh (root_ scene) N" (static batching): khong dung lai duoc tung vien.
Rerunnable: cung dau vao ra cung dau ra.
"""
import io, json, math, os, re, sys
import numpy as np
import yaml
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
SCENE = os.path.join(ASSETS, 'Scenes', 'Game.unity')
OUT_JS = os.path.join(GAME, 'data', 'explosives.js')
OUT_ART = os.path.join(GAME, 'art', 'world', 'explosives')
LAND = os.path.join(GAME, 'art', 'world', 'landmask.png')
WORLD = os.path.join(GAME, 'art', 'world', 'world.json')
CL = yaml.CSafeLoader
SOLID = {7, 15, 24, 29}      # world.py boat_solid_layers: CollidesWithPlayer, CollidesWithPlayerAndCamera, CollidesWithPlayerAndMonster, Ice
TEX_MAX = 256                # [DE XUAT] canh lon nhat texture (ngan sach dung luong chung)


def rnd(v, n=4):
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, (float, np.floating)):
        r = round(float(v), n)
        return 0.0 if r == 0 else r
    return v


def vec(s, keys='xyz'):
    return [float(re.search(r'\b%s: (-?[\d.eE+-]+)' % k, s).group(1)) for k in keys]


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_quat(R):
    t = R[0, 0] + R[1, 1] + R[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        return [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    i = int(np.argmax([R[0, 0], R[1, 1], R[2, 2]]))
    j, k = (i + 1) % 3, (i + 2) % 3
    s = math.sqrt(R[i, i] - R[j, j] - R[k, k] + 1) * 2
    q = [0, 0, 0, 0]
    q[i] = s / 4
    q[j] = (R[j, i] + R[i, j]) / s
    q[k] = (R[k, i] + R[i, k]) / s
    q[3] = (R[k, j] - R[j, k]) / s
    return q


def guid_map(kind_dir, ext):
    out = {}
    d = os.path.join(ASSETS, kind_dir)
    for fn in os.listdir(d):
        if fn.endswith(ext + '.meta'):
            with io.open(os.path.join(d, fn), encoding='utf-8') as f:
                m = re.search(r'guid: (\w+)', f.read(400))
            if m:
                out[m.group(1)] = os.path.join(d, fn[:-5])
    return out


class Scene:
    def __init__(self):
        txt = io.open(SCENE, encoding='utf-8', newline='').read()
        self.docs = {}
        for m in re.finditer(r'--- !u!(\d+) &(-?\d+)[^\n]*\n(.*?)(?=\n--- !u!|\Z)', txt, re.S):
            self.docs[int(m.group(2))] = (int(m.group(1)), m.group(3))
        self.cache = {}

    def comps(self, g):
        return [int(c) for c in re.findall(r'component: \{fileID: (-?\d+)', self.docs[g][1])]

    def of_type(self, g, ty):
        return [c for c in self.comps(g) if c in self.docs and self.docs[c][0] == ty]

    def tr(self, g):
        return self.of_type(g, 4)[0]

    def name(self, g):
        return re.search(r'm_Name: ([^\n]*)', self.docs[g][1]).group(1).strip()

    def active(self, g):
        return re.search(r'm_IsActive: (\d)', self.docs[g][1]).group(1) == '1'

    def layer(self, g):
        return int(re.search(r'm_Layer: (\d+)', self.docs[g][1]).group(1))

    def go_of(self, c):
        return int(re.search(r'm_GameObject: \{fileID: (-?\d+)', self.docs[c][1]).group(1))

    def kids(self, g):
        b = self.docs[self.tr(g)][1]
        ch = re.search(r'm_Children:(.*?)m_Father', b, re.S).group(1)
        return [self.go_of(int(c)) for c in re.findall(r'- \{fileID: (-?\d+)\}', ch)]

    def father(self, g):
        f = int(re.search(r'm_Father: \{fileID: (-?\d+)', self.docs[self.tr(g)][1]).group(1))
        return self.go_of(f) if f else 0

    def local(self, g):
        b = self.docs[self.tr(g)][1]
        L = np.eye(4)
        L[:3, :3] = quat_mat(vec(re.search(r'm_LocalRotation: (\{[^}]*\})', b).group(1), 'xyzw')) @ np.diag(vec(re.search(r'm_LocalScale: (\{[^}]*\})', b).group(1)))
        L[:3, 3] = vec(re.search(r'm_LocalPosition: (\{[^}]*\})', b).group(1))
        return L

    def world(self, g):
        if g not in self.cache:
            p = self.father(g)
            self.cache[g] = self.local(g) if not p else self.world(p) @ self.local(g)
        return self.cache[g]

    def path(self, g):
        out = []
        while g:
            out.append(self.name(g))
            g = self.father(g)
        return '/'.join(reversed(out))

    def eff_active(self, g):
        while g:
            if not self.active(g):
                return False
            g = self.father(g)
        return True


def read_mesh(path):
    """Mesh .asset (YAML, mot submesh) -> pos (Unity, trai tay), uv, chi so tam giac (Unity)."""
    d = list(yaml.load(open(path, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    vd = d['m_VertexData']
    n = vd['m_VertexCount']
    ch = vd['m_Channels']
    assert len(d['m_SubMeshes']) == 1 and all(c['stream'] == 0 for c in ch if c['dimension'] & 15), 'mesh nhieu luong / submesh: ' + path
    raw = np.frombuffer(bytes.fromhex(vd['_typelessdata']), dtype=np.uint8)
    stride = len(raw) // n
    rows = raw[:stride * n].reshape(n, stride)

    def chan(i):
        c = ch[i]
        dim = c['dimension'] & 15
        w = 4 if c['format'] == 0 else 2
        assert c['format'] in (0, 1)
        return rows[:, c['offset']: c['offset'] + w * dim].copy().view(np.float32 if w == 4 else np.float16).reshape(n, dim).astype(np.float64)
    pos = chan(0)
    uv = chan(4) if ch[4]['dimension'] & 15 else np.zeros((n, 2))
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)[:d['m_SubMeshes'][0]['indexCount']]
    return pos, uv[:, :2], idx.reshape(-1, 3)


def clip_above(tri):
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


def collider_polys(S, g, c, mesh_of):
    """Da giac (three.js x, z) ma world.py collect_colliders ve cho mot collider (hoac None neu khong cat y=0)."""
    ty, body = S.docs[c]
    d = lambda k: re.search(r'\b%s: ([^\n]*)' % k, body).group(1)
    if d('m_IsTrigger') == '1' or d('m_Enabled') == '0':
        return None
    W = S.world(g)
    sx = np.linalg.norm(W[:3, :3], axis=0)
    if ty == 65:
        cc, sz = vec(re.search(r'm_Center: (\{[^}]*\})', body).group(1)), vec(re.search(r'm_Size: (\{[^}]*\})', body).group(1))
        corners = np.array([(W @ [cc[0] + ix * sz[0], cc[1] + iy * sz[1], cc[2] + iz * sz[2], 1])[:3] for ix in (-.5, .5) for iy in (-.5, .5) for iz in (-.5, .5)])
        if not (corners[:, 1].min() <= 0 < corners[:, 1].max()):
            return None
        return [hull([(x, -z) for x, _, z in corners])]
    if ty == 135:
        cc = vec(re.search(r'm_Center: (\{[^}]*\})', body).group(1))
        p = W @ [cc[0], cc[1], cc[2], 1]
        r = float(d('m_Radius')) * sx.max()
        if abs(p[1]) >= r:
            return None
        r0 = math.sqrt(r * r - p[1] * p[1])
        return [[(p[0] + r0 * math.cos(a), -p[2] + r0 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)]]
    if ty == 64:
        mg = re.search(r'm_Mesh: \{[^}]*guid: (\w+)', body)
        if not mg:
            return None
        pos, _, idx = mesh_of(mg.group(1))
        v = (np.c_[pos, np.ones(len(pos))] @ W.T)[:, :3]
        if not (v[:, 1].min() <= 0 < v[:, 1].max()):
            return None
        tv = v[idx]
        ymin, ymax = tv[:, :, 1].min(1), tv[:, :, 1].max(1)
        polys = [[(x, -z) for x, _, z in tri] for tri in tv[ymin >= 0]]
        for tri in tv[(ymin < 0) & (ymax >= 0)]:
            polys.append([(x, -z) for x, z in clip_above(tri)])
        return polys
    raise SystemExit('collider kieu %d chua ho tro (%s)' % (ty, S.path(g)))


def footprint(polys, L):
    """Cac doan [j, i, n] cua o landmask ma polys ve ra (cung PIL polygon nhu world.py Mask.poly)."""
    x0, z0, res = L['x0'], L['z0'], L['metresPerPixel']
    pts = [((x - x0) / res, (z - z0) / res) for poly in polys for x, z in poly]
    if not pts:
        return []
    ox, oy = int(math.floor(min(p[0] for p in pts))) - 2, int(math.floor(min(p[1] for p in pts))) - 2
    w, h = int(math.ceil(max(p[0] for p in pts))) - ox + 3, int(math.ceil(max(p[1] for p in pts))) - oy + 3
    img = Image.new('L', (w, h), 0)
    dr = ImageDraw.Draw(img)
    for poly in polys:
        if len(poly) >= 3:
            dr.polygon([((x - x0) / res - ox, (z - z0) / res - oy) for x, z in poly], fill=255)
    a = np.asarray(img) > 0
    runs = []
    for j in range(h):
        row = a[j]
        i = 0
        while i < w:
            if row[i]:
                k = i
                while k < w and row[k]:
                    k += 1
                runs.append([j + oy, i + ox, k - i])
                i = k
            else:
                i += 1
    return runs


def material_albedo(mat_path, tex_guid):
    """(ten texture, duong dan png, mau) cua vat lieu: texture dau tien co guid hop le (uu tien _MainTex/Albedo/BaseMap)."""
    d = list(yaml.load(open(mat_path, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    sp = d['m_SavedProperties']
    envs = sp.get('m_TexEnvs') or {}
    if isinstance(envs, list):
        envs = {k: v for e in envs for k, v in e.items()}
    best = None
    for k, v in envs.items():
        g = (v.get('m_Texture') or {}).get('guid')
        if not g or g not in tex_guid:
            continue
        pri = 0 if re.search(r'MainTex|Albedo|BaseMap|BaseColorMap', k) else 1
        if best is None or pri < best[0]:
            best = (pri, k, tex_guid[g])
    col = None
    cols = sp.get('m_Colors') or {}
    if isinstance(cols, list):
        cols = {k: v for e in cols for k, v in e.items()}
    for k, v in cols.items():
        if re.search(r'^_Color$|BaseColor|Tint', k):
            col = [v['r'], v['g'], v['b']]
            break
    return d.get('m_Shader'), (best[2] if best else None), col, (best[1] if best else None)


def main():
    S = Scene()
    L = json.load(io.open(WORLD, encoding='utf-8'))['landmask']
    land = np.asarray(Image.open(LAND).convert('L')) > 127
    mesh_guid, mat_guid, tex_guid = guid_map('Mesh', '.asset'), guid_map('Material', '.mat'), guid_map('Texture2D', '')
    mesh_cache = {}
    inst = np.fromfile(os.path.join(GAME, 'art', 'world', 'instances.bin'), dtype='<f4').reshape(-1, 10)
    particles_txt = io.open(os.path.join(GAME, 'data', 'particles.js'), encoding='utf-8').read()

    def mesh_of(guid):
        if guid not in mesh_cache:
            mesh_cache[guid] = read_mesh(mesh_guid[guid])
        return mesh_cache[guid]
    pois = sorted((k for k, (c, b) in S.docs.items() if c == 114 and 'impulseSource:' in b and re.search(r'\n  id: [\w-]+\n  animator:', b)),
                  key=lambda k: re.search(r'\n  id: ([\w-]+)', S.docs[k][1]).group(1))
    out = []
    for k in pois:
        b = S.docs[k][1]
        eid = re.search(r'\n  id: ([\w-]+)', b).group(1)
        node = re.search(r'conversationNodeName: (\w+)', b).group(1)
        g = S.go_of(k)
        an = int(re.search(r'animator: \{fileID: (-?\d+)', b).group(1))
        ag = S.go_of(an)
        ctrl = re.search(r'm_Controller: \{[^}]*guid: (\w+)', S.docs[an][1]).group(1)
        assert ctrl == 'f120cdef0d2849540a7cf3084bc13459', 'bo dieu khien khac Destroyable: ' + eid
        mb = yaml.load(b, Loader=CL)['MonoBehaviour']      # truong cua ConversationPOI (RefreshStatus)
        W = S.world(g)
        # tuong tac: SphereCollider (bk) hoac BoxCollider (size x scale) tren chinh doi tuong ExplosivePOI
        sc = np.linalg.norm(W[:3, :3], axis=0)
        sph, box = S.of_type(g, 135), S.of_type(g, 65)
        if sph:
            r = float(re.search(r'm_Radius: ([\d.eE+-]+)', S.docs[sph[0]][1]).group(1)) * sc.max()
            shape = 'sphere'
        else:
            sz = vec(re.search(r'm_Size: (\{[^}]*\})', S.docs[box[0]][1]).group(1))
            hx, hz = sz[0] * sc[0] / 2, sz[2] * sc[2] / 2
            r = max(hx, hz)
            shape = 'box %.2f x %.2f' % (hx * 2, hz * 2)
        polys, parts, fx, rend = [], [], [], []
        stats = {'col': 0, 'colPoly': 0, 'vis': 0, 'visSkipped': 0}

        def walk(x):
            nm = S.name(x)
            if nm == 'Effects':
                for e in S.kids(x):
                    w = S.world(e)
                    fx.append(rnd([w[0, 3], w[1, 3], -w[2, 3]], 3))
                return
            if S.eff_active(x):
                if S.layer(x) in SOLID:
                    for c in S.of_type(x, 65) + S.of_type(x, 64) + S.of_type(x, 135):
                        p = collider_polys(S, x, c, mesh_of)
                        if p:
                            polys.extend(p)
                            stats['col'] += 1
                            stats['colPoly'] += len(p)
                if S.of_type(x, 33) and S.of_type(x, 23):
                    rend.append(x)
                for mf in S.of_type(x, 33):
                    mg = re.search(r'm_Mesh: \{[^}]*guid: (\w+)', S.docs[mf][1])
                    mr = S.of_type(x, 23)
                    name = os.path.basename(mesh_guid[mg.group(1)])[:-6] if mg and mg.group(1) in mesh_guid else None
                    if name is None or name.startswith('Combined Mesh') or not mr:
                        stats['visSkipped'] += 1
                        continue
                    stats['vis'] += 1
                    parts.append((x, name, mg.group(1), mr[0]))
            for c in S.kids(x):
                walk(c)
        walk(ag)
        fp = footprint(polys, L)
        px = sum(r_[2] for r_ in fp)
        white = sum(int(land[j, i:i + n].sum()) for j, i, n in fp if 0 <= j < land.shape[0])
        wp = W[:3, 3]
        # vat canh dang ve: moi renderer dang active duoi doi tuong Animator co mot instance trong instances.bin (world.py da go static batching)
        hit = []
        for x in rend:
            w = S.world(x)
            m = np.where((np.abs(inst[:, 0] - w[0, 3]) < 0.02) & (np.abs(inst[:, 1] - w[1, 3]) < 0.02) & (np.abs(inst[:, 2] + w[2, 3]) < 0.02))[0]
            hit.extend(int(i) for i in m)
        hit = sorted(set(hit))
        kind = 'wood' if re.search(r'Tree|Bridge', S.name(ag)) else 'rock'
        glint = S.path(g) + '/InspectionGlint'
        if glint not in particles_txt:
            raise SystemExit('khong thay nguon hat ' + glint)
        print('%-18s %-26s (%.1f, %.1f) r=%.1f %-12s fp=%3d px land=%3d  renderers=%d instances=%d fx=%d  %s' % (eid, S.name(ag), wp[0], -wp[2], r, shape, px, white, len(rend), len(hit), len(fx), stats))
        out.append({'id': eid, 'node': node, 'path': S.path(g), 'glint': glint, 'x': rnd(wp[0], 2), 'z': rnd(-wp[2], 2), 'r': rnd(r, 2), 'kind': kind,
                    'sfx': 'boat.dynamite.wood' if kind == 'wood' else 'boat.dynamite.rock',
                    'once': bool(mb['isOneTimeOnly']), 'needs': (mb['enableNodeNames'] or []) if mb['enabledByOtherNodeVisit'] else [],
                    'hideAfter': (mb['otherNodeNames'] or []) if mb['shouldDisableOnOtherNodeVisit'] else [], 'fx': fx, 'inst': hit, 'fp': fp})
    assert len(out) == 24
    data = {'src': 'Scenes/Game.unity (24 ExplosivePOI), Destroyable.controller + Explode_0.anim, tools/world.py collect_colliders (dau chan)',
            'frames': {'unit': 'mot o landmask = %g m; fp = [[hang j, cot i dau, so o]]; inst = chi so trong instances.bin' % L['metresPerPixel']}}
    js = ('// Generated by games/dredge/tools/explosives.py from Game.unity (ExplosivePOI). Do not edit.' + chr(10) + 'window.DR_EXPLOSIVES = ' +
          json.dumps(out, separators=(',', ':')) + ';' + chr(10) + 'window.DR_EXPLOSIVES.meta = ' + json.dumps(data, separators=(',', ':')) + ';' + chr(10))
    io.open(OUT_JS, 'w', encoding='utf-8', newline=chr(10)).write(js)
    print('js %d KB' % (len(js) // 1024))


if __name__ == '__main__':
    main()
