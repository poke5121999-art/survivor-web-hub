"""Hệ hạt gốc của DREDGE (ParticleSystem) cho Biển Mù -> data/particles.js + art/vfx/p/*.

Chạy (từ gốc bản sao, ~1 phút; cần PyYAML có libyaml, numpy, Pillow; UnityPy cho phần shader):
    python -I games/dredge/tools/particles.py           # ghi data/particles.js, art/vfx/p/*.webp
    python -I games/dredge/tools/particles.py --dis     # thêm: rã DXBC đúng biến thể keyword của các vật liệu hạt
                                                        #       vào D:/dredge-ref/cache/particles/shaders/*.txt
Nguồn (chỉ đọc): YAML AssetRipper ở D:/dredge-ref/ripped/ExportedProject/Assets
    Prefabs/Player/PlayerContainer.prefab, GameObject/*.prefab, Scenes/Game.unity, Material/*.mat, Sprite/*.asset,
    Texture2D/*.png, Mesh/*.asset, Scripts/Assembly-CSharp/*.cs.meta (tên lớp MonoBehaviour)
    + Shader đã tuần tự hoá trong bundle (UnityPy): trạng thái pass "Universal Forward" (Blend, ZWrite, ZTest, Cull, Queue).
      Vật liệu Shader Graph của bản 1.5.3 KHÔNG ghi blend vào .mat (_SrcBlend 1, _DstBlend 0 là giá trị mặc định cũ),
      nên blend phải lấy từ shader đã biên dịch.
Ghi:
    data/particles.js   window.DR_PARTICLES       { <tên gọi>: { src, nodes:[...], materials:{...}, attach?, variants?, emitOnSpawn? } }
                        window.DR_PARTICLES_SCENE [ { name, pos, q, yaw, scale, tod, cull, buoy } ]  nguồn đặt sẵn trong Game.unity
                        window.DR_PARTICLES_LIB   { textures, sprites, meshes }  dùng chung
    art/vfx/p/*.webp    texture sprite/vật liệu hạt (thu nhỏ tối đa 128 px, webp)
    D:/dredge-ref/cache/particles/census.txt  danh sách mọi hệ đã lấy (đối chiếu)
Toạ độ: dữ liệu giữ hệ Unity (tay trái, như YAML); js/particles.js mô phỏng trong hệ Unity rồi đổi dấu z khi vẽ.
Riêng mesh hạt đã đổi sang three.js (z đổi dấu, tam giác đảo chiều) như tools/vfx.py.
Chạy lại ra đúng từng byte (thứ tự theo tệp nguồn, số làm tròn, webp nén cùng tham số).
"""
import ctypes, hashlib, io, json, math, os, re, sys

import numpy as np
import yaml
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')  # python -I bỏ qua PYTHONIOENCODING
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_argv, sys.argv = sys.argv, sys.argv[:1]  # vfx.py đọc sys.argv[1] làm thư mục Assets lúc import
import vfx as VX  # noqa: E402  (mmc, mmg, curve, gradient, trs_mat: dạng gọn đã kiểm ở vòng 1)
sys.argv = _argv

GAME = os.path.dirname(HERE)
ASSETS = r'D:\dredge-ref\ripped\ExportedProject\Assets'
DATA = os.environ.get('DREDGE_DATA', r'D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\DREDGE_Data')
AA = os.path.join(DATA, 'StreamingAssets', 'aa', 'StandaloneWindows')
OUT_JS = os.path.join(GAME, 'data', 'particles.js')
OUT_ART = os.path.join(GAME, 'art', 'vfx', 'p')
CACHE = r'D:\dredge-ref\cache\particles'
PLAYER = 'Prefabs/Player/PlayerContainer.prefab'
SCENE = 'Scenes/Game.unity'
TEX_MAX = 128  # [ĐỀ XUẤT] cạnh lớn nhất của texture hạt: hạt nhỏ trên màn hình, giữ ngân sách 90 MB

HDR = re.compile(rb'^--- !u!(\d+) &(-?\d+)[^\n]*\n', re.M)
CL = yaml.CSafeLoader


def log(*a):
    print(*a, flush=True)


def rnd(v, n=5):
    """Làm tròn đệ quy (giữ byte ổn định giữa các lần chạy). YAML Unity ghi vô cực là chuỗi 'Infinity'."""
    if isinstance(v, str) and v in ('Infinity', '-Infinity', 'NaN'):
        return 1e30 if v == 'Infinity' else -1e30 if v[0] == '-' else 0
    if isinstance(v, float):
        if v != v or v in (float('inf'), float('-inf')):
            return 1e30 if v > 0 else -1e30 if v < 0 else 0
        v = round(v, n)
        return 0 if v == 0 else (int(v) if v == int(v) and abs(v) < 1e9 else v)
    if isinstance(v, (list, tuple)):
        return [rnd(x, n) for x in v]
    if isinstance(v, dict):
        return {k: rnd(x, n) for k, x in v.items()}
    return v


# ---------------------------------------------------------------- chỉ mục guid -> tệp
class Guids:
    """guid của mọi .meta trong các thư mục cần dùng -> đường dẫn tương đối (không có .meta)."""

    SUBS = ('Material', 'Mesh', 'Texture2D', 'Sprite', 'Shader', 'Scripts')

    def __init__(self):
        self.path = {}
        rx = re.compile(r'^guid: ([0-9a-f]+)', re.M)
        for sub in self.SUBS:
            base = os.path.join(ASSETS, sub)
            for dp, dns, fns in os.walk(base):
                dns.sort()
                for fn in sorted(fns):
                    if not fn.endswith('.meta'):
                        continue
                    with open(os.path.join(dp, fn), encoding='utf-8', errors='replace') as fh:
                        m = rx.search(fh.read(400))
                    if m:
                        self.path[m.group(1)] = os.path.relpath(os.path.join(dp, fn[:-5]), ASSETS).replace(os.sep, '/')

    def get(self, ref):
        g = ref.get('guid') if isinstance(ref, dict) else ref
        return self.path.get(g) if g else None

    def cls(self, ref):
        p = self.get(ref)
        return os.path.basename(p)[:-3] if p and p.endswith('.cs') else None


# ---------------------------------------------------------------- tệp YAML Unity (prefab / scene)
class Doc:
    """Một tệp YAML Unity: chỉ mục khối theo fileID, đọc khối bằng libyaml khi cần; cây GameObject bằng regex (nhanh)."""

    def __init__(self, rel, guids):
        self.rel = rel
        self.g = guids
        with open(os.path.join(ASSETS, rel), 'rb') as fh:
            self.data = fh.read()
        hs = [(int(m.group(1)), int(m.group(2)), m.end(), m.start()) for m in HDR.finditer(self.data)]
        self.blk = {}
        for i, (c, f, s, _) in enumerate(hs):
            self.blk[f] = (c, s, hs[i + 1][3] if i + 1 < len(hs) else len(self.data))
        self.cache = {}
        self._tree()

    def raw(self, fid):
        c, s, e = self.blk[fid]
        return self.data[s:e]

    def type(self, fid):
        return self.blk[fid][0] if fid in self.blk else None

    def get(self, fid):
        if fid not in self.cache:
            d = yaml.load(self.raw(fid), Loader=CL)
            self.cache[fid] = list(d.values())[0]
        return self.cache[fid]

    def _tree(self):
        rn = re.compile(rb'\n  m_Name: ([^\n]*)')
        ra = re.compile(rb'\n  m_IsActive: (\d)')
        rc = re.compile(rb'- component: \{fileID: (-?\d+)\}')
        rg = re.compile(rb'm_GameObject: \{fileID: (-?\d+)\}')
        rf = re.compile(rb'm_Father: \{fileID: (-?\d+)\}')
        rs = re.compile(rb'm_Script: \{fileID: -?\d+, guid: ([0-9a-f]+)')
        self.name, self.active, self.comps = {}, {}, {}
        self.tr, self.go_of_tr, self.father, self.kids = {}, {}, {}, {}
        self.comp_go, self.mono = {}, {}
        for f, (c, s, e) in self.blk.items():
            if c == 1:
                b = self.data[s:e]
                m = rn.search(b)
                nm = m.group(1).decode('utf-8') if m else ''
                if nm[:1] in ('"', "'"):
                    nm = str(yaml.load('x: ' + nm, Loader=CL)['x'])
                self.name[f] = nm
                self.active[f] = ra.search(b).group(1) == b'1'
                self.comps[f] = [int(x) for x in rc.findall(b)]
            elif c in (4, 224):
                b = self.data[s:e]
                go = int(rg.search(b).group(1))
                self.tr[go] = f
                self.go_of_tr[f] = go
                self.father[f] = int(rf.search(b).group(1))
            elif c in (114, 198, 199, 33, 23):
                b = self.data[s:min(e, s + 900)]
                m = rg.search(b)
                if m:
                    self.comp_go[f] = int(m.group(1))
                if c == 114:
                    m = rs.search(self.data[s:min(e, s + 1500)])
                    if m:
                        self.mono[f] = self.g.cls(m.group(1).decode())
        for tf, fa in self.father.items():
            if fa:
                self.kids.setdefault(fa, []).append(tf)
        # thứ tự con theo m_Children của cha (giữ thứ tự Hierarchy)
        rk = re.compile(rb'- \{fileID: (-?\d+)\}')
        for fa in list(self.kids):
            b = self.raw(fa)
            i = b.find(b'm_Children:')
            j = b.find(b'm_Father:')
            order = [int(x) for x in rk.findall(b[i:j])] if i >= 0 else []
            pos = {k: n for n, k in enumerate(order)}
            self.kids[fa].sort(key=lambda k: pos.get(k, 1 << 30))

    def parent(self, go):
        fa = self.father.get(self.tr.get(go))
        return self.go_of_tr.get(fa) if fa else None

    def children(self, go):
        return [self.go_of_tr[k] for k in self.kids.get(self.tr.get(go), [])]

    def path(self, go):
        p = []
        while go:
            p.append(self.name.get(go, '?'))
            go = self.parent(go)
        return '/'.join(reversed(p))

    def find(self, path):
        """GameObject theo đường dẫn đầy đủ từ gốc."""
        return [g for g in self.name if self.path(g) == path]

    def comp(self, go, ctype):
        for c in self.comps.get(go, []):
            if self.type(c) == ctype:
                return c
        return None

    def scripts(self, go):
        return [(self.mono.get(c), c) for c in self.comps.get(go, []) if self.type(c) == 114]

    def script(self, go, cls):
        for n, c in self.scripts(go):
            if n == cls:
                return self.get(c)
        return None

    def local(self, go):
        t = self.get(self.tr[go])
        p, q, s = t['m_LocalPosition'], t['m_LocalRotation'], t['m_LocalScale']
        return [p['x'], p['y'], p['z']], [q['x'], q['y'], q['z'], q['w']], [s['x'], s['y'], s['z']]

    def matrix(self, go, stop=None):
        """Ma trận (hệ Unity) của go so với stop (None = thế giới)."""
        M = np.eye(4)
        while go and go != stop:
            p, q, s = self.local(go)
            M = VX.trs_mat(p, q, s) @ M
            go = self.parent(go)
        return M

    def chain_scale(self, go, stop=None):
        s = np.ones(3)
        while go and go != stop:
            s *= np.array(self.local(go)[2])
            go = self.parent(go)
        return s

    def active_chain(self, go, stop=None, managed=()):
        """Mọi tổ tiên (tới stop) đang bật; GameObject mang script trong managed (Cullable...) coi như bật vì script tự bật/tắt."""
        if '__all__' in managed:  # cây do script bật cả khối (BoatSubModelToggler, ability): bỏ qua cờ m_IsActive
            return True
        while go and go != stop:
            if not self.active.get(go, True) and not any(n in managed for n, _ in self.scripts(go))                     and not ('*_OnAssets' in managed and self.name.get(go, '').endswith('_OnAssets')):
                return False
            go = self.parent(go)
        return True

    def ancestors_scripts(self, go, stop=None):
        out = []
        while go and go != stop:
            out += [(n, c, go) for n, c in self.scripts(go)]
            go = self.parent(go)
        return out


# ---------------------------------------------------------------- toán quay
def mat_quat(R):
    """Ma trận quay 3x3 (đã bỏ tỉ lệ) -> quaternion (x, y, z, w)."""
    t = R[0, 0] + R[1, 1] + R[2, 2]
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s]
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        q = [0.25 * s, (R[0, 1] + R[1, 0]) / s, (R[0, 2] + R[2, 0]) / s, (R[2, 1] - R[1, 2]) / s]
    elif R[1, 1] > R[2, 2]:
        s = math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        q = [(R[0, 1] + R[1, 0]) / s, 0.25 * s, (R[1, 2] + R[2, 1]) / s, (R[0, 2] - R[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        q = [(R[0, 2] + R[2, 0]) / s, (R[1, 2] + R[2, 1]) / s, 0.25 * s, (R[1, 0] - R[0, 1]) / s]
    if q[3] < 0:
        q = [-x for x in q]
    return q


def decompose(M):
    """4x4 -> (vị trí, quaternion, tỉ lệ theo cột)."""
    s = np.linalg.norm(M[:3, :3], axis=0)
    R = M[:3, :3] / np.where(s == 0, 1, s)
    return M[:3, 3].tolist(), mat_quat(R), s.tolist()


# ---------------------------------------------------------------- MinMaxCurve / Gradient (dạng gọn của tools/vfx.py)
def mmc(m):
    return VX.mmc(m)


def mmg(m):
    return VX.mmg(m)


def mmc_zero(m):
    d = mmc(m)
    if 'c' in d:
        return d['c'] == 0
    if 'min' in d:
        return d['min'] == 0 and d['max'] == 0
    if 'curve' in d:
        return d['k'] == 0 or all(k[1] == 0 for k in d['curve'])
    return d['k'] == 0


def mmc_max(m):
    """Giá trị lớn nhất (constantMax của Unity cho hằng; đỉnh đường cong × k)."""
    d = mmc(m)
    if 'c' in d:
        return d['c']
    if 'min' in d:
        return max(d['min'], d['max'])
    if 'curve' in d:
        return max(k[1] for k in d['curve']) * d['k'] if d['curve'] else 0
    return max([k[1] for k in d['curveMax']] + [k[1] for k in d['curveMin']] or [0]) * d['k']


SHAPE = {0: 'sphere', 1: 'sphere', 2: 'hemisphere', 3: 'hemisphere', 4: 'cone', 5: 'box', 6: 'mesh', 7: 'cone',
         8: 'coneVolume', 9: 'coneVolume', 10: 'circle', 11: 'circle', 12: 'edge', 13: 'meshRenderer', 15: 'boxShell',
         16: 'boxEdge', 17: 'donut', 18: 'rectangle'}
RENDER = {0: 'billboard', 1: 'stretched', 2: 'horizontal', 3: 'vertical', 4: 'mesh', 5: 'none'}


# ---------------------------------------------------------------- ParticleSystem -> dạng gọn (js/particles.js đọc)
class Conv:
    """Đổi ParticleSystem + Renderer YAML sang dạng gọn; gom vật liệu, sprite, mesh dùng chung."""

    def __init__(self, guids):
        self.g = guids
        self.materials = {}     # id -> dict
        self.sprites = {}       # id -> {tex, r, pivot}
        self.textures = {}      # id -> {src, size, orig}
        self.meshes = {}        # tên -> {pos, nrm?, uv?, col?, index}
        self.state = None       # trạng thái pass từ bundle (Shaders)

    # ---- module
    def ps(self, P, R, node_of_ps):
        I = P['InitialModule']
        m = {'dur': P['lengthInSec'], 'loop': P['looping'], 'prewarm': P['prewarm'], 'play': P['playOnAwake'],
             'space': P['moveWithTransform'], 'scaling': P['scalingMode'], 'evm': P.get('emitterVelocityMode', 1),
             'stop': P.get('stopAction', 0), 'simSpeed': P.get('simulationSpeed', 1), 'maxN': I['maxNumParticles'],
             'life': mmc(I['startLifetime']), 'speed': mmc(I['startSpeed']), 'color': mmg(I['startColor']),
             'size': mmc(I['startSize']), 'rot': mmc(I['startRotation']), 'grav': mmc(I['gravityModifier'])}
        if not mmc_zero(P['startDelay']):
            m['delay'] = mmc(P['startDelay'])
        if I.get('size3D'):
            m['size3'] = [mmc(I['startSize']), mmc(I['startSizeY']), mmc(I['startSizeZ'])]
        if I.get('rotation3D'):
            m['rot3'] = [mmc(I['startRotationX']), mmc(I['startRotationY']), mmc(I['startRotation'])]
        if I.get('randomizeRotationDirection'):
            m['flipRot'] = I['randomizeRotationDirection']
        out = {'main': m}
        E = P['EmissionModule']
        if E['enabled']:
            e = {'rate': mmc(E['rateOverTime'])}
            if not mmc_zero(E['rateOverDistance']):
                e['dist'] = mmc(E['rateOverDistance'])
            bs = []
            for b in E.get('m_Bursts', [])[:E.get('m_BurstCount', 0)]:
                bs.append({'t': b['time'], 'n': mmc(b['countCurve']), 'cyc': b['cycleCount'], 'int': b['repeatInterval'],
                           'p': b.get('probability', 1)})
            if bs:
                e['bursts'] = bs
            out['emission'] = e
        S = P['ShapeModule']
        if S['enabled']:
            st = S['type']
            sh = {'type': SHAPE.get(st, st)}
            rad, arc = S['radius'], S['arc']
            if st in (0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 17):
                sh['r'] = rad['value']
                if rad.get('mode'):
                    sh['rMode'] = [rad['mode'], rad.get('spread', 0), mmc(rad['speed'])]
                sh['rt'] = S['radiusThickness']
            if st in (4, 7, 8, 9, 10, 11, 17):
                sh['arc'] = arc['value']
                if arc.get('mode'):
                    sh['arcMode'] = [arc['mode'], arc.get('spread', 0), mmc(arc['speed'])]
            if st in (4, 7, 8, 9):
                sh['angle'] = S['angle']
            if st in (8, 9):
                sh['len'] = S['length']
            if st == 17:
                sh['donut'] = S['donutRadius']
            if st in (5, 15, 16):
                sh['bt'] = [S['boxThickness'][k] for k in 'xyz']
            for k, nm in (('m_Position', 'pos'), ('m_Rotation', 'rot'), ('m_Scale', 'scl')):
                v = [S[k]['x'], S[k]['y'], S[k]['z']]
                if v != ([1, 1, 1] if k == 'm_Scale' else [0, 0, 0]):
                    sh[nm] = v
            for k, nm in (('randomDirectionAmount', 'rdir'), ('sphericalDirectionAmount', 'sdir'),
                          ('randomPositionAmount', 'rpos'), ('alignToDirection', 'align')):
                if S.get(k):
                    sh[nm] = S[k]
            if st in (6, 13):
                sh['mesh'] = self.mesh(S.get('m_Mesh'))
                sh['place'] = S['placementMode']
            out['shape'] = sh
        V = P['VelocityModule']
        if V['enabled']:
            v = {}
            for k in ('x', 'y', 'z'):
                if not mmc_zero(V[k]):
                    v[k] = mmc(V[k])
            orb = [V['orbitalX'], V['orbitalY'], V['orbitalZ']]
            if not all(mmc_zero(o) for o in orb):
                v['orb'] = [mmc(o) for o in orb]
                off = [V['orbitalOffsetX'], V['orbitalOffsetY'], V['orbitalOffsetZ']]
                if not all(mmc_zero(o) for o in off):
                    v['orbOff'] = [mmc(o) for o in off]
            if not mmc_zero(V['radial']):
                v['radial'] = mmc(V['radial'])
            sm = mmc(V['speedModifier'])
            if sm != {'c': 1}:
                v['speedMod'] = sm
            v['world'] = V['inWorldSpace']
            out['vel'] = v
        C = P['ClampVelocityModule']
        if C['enabled']:
            lv = {'dampen': C['dampen'], 'world': C['inWorldSpace']}
            if C['separateAxis']:
                lv['sep'] = [mmc(C['x']), mmc(C['y']), mmc(C['z'])]
            else:
                lv['mag'] = mmc(C['magnitude'])
            if not mmc_zero(C['drag']):
                lv['drag'] = mmc(C['drag'])
                lv['dragSize'] = C['multiplyDragByParticleSize']
                lv['dragVel'] = C['multiplyDragByParticleVelocity']
            out['limit'] = lv
        IV = P['InheritVelocityModule']
        if IV['enabled']:
            out['inherit'] = {'mode': IV['m_Mode'], 'k': mmc(IV['m_Curve'])}
        LE = P.get('LifetimeByEmitterSpeedModule')
        if LE and LE['enabled']:
            out['lbes'] = {'k': mmc(LE['m_Curve']), 'range': [LE['m_Range']['x'], LE['m_Range']['y']]}
        F = P['ForceModule']
        if F['enabled']:
            out['force'] = {'x': mmc(F['x']), 'y': mmc(F['y']), 'z': mmc(F['z']), 'world': F['inWorldSpace']}
        Z = P['SizeModule']
        if Z['enabled']:
            out['sizeOL'] = {'x': mmc(Z['curve'])}
            if Z['separateAxes']:
                out['sizeOL'].update({'y': mmc(Z['y']), 'z': mmc(Z['z']), 'sep': 1})
        RO = P['RotationModule']
        if RO['enabled']:
            out['rotOL'] = {'z': mmc(RO['curve'])}
            if RO['separateAxes']:
                out['rotOL'].update({'x': mmc(RO['x']), 'y': mmc(RO['y']), 'sep': 1})
        if P['ColorModule']['enabled']:
            out['colorOL'] = mmg(P['ColorModule']['gradient'])
        N = P['NoiseModule']
        if N['enabled']:
            nz = {'str': mmc(N['strength']), 'freq': N['frequency'], 'damp': N['damping'], 'oct': N['octaves'],
                  'octMul': N['octaveMultiplier'], 'octScale': N['octaveScale'], 'scroll': mmc(N['scrollSpeed']),
                  'q': N['quality'], 'pos': mmc(N['positionAmount']), 'rot': mmc(N['rotationAmount']),
                  'size': mmc(N['sizeAmount'])}
            if N['separateAxes']:
                nz['sep'] = 1
                nz['strY'] = mmc(N['strengthY'])
                nz['strZ'] = mmc(N['strengthZ'])
            out['noise'] = nz
        U = P['UVModule']
        if U['enabled']:
            uv = {'mode': U['mode'], 'time': U.get('timeMode', 0), 'fps': U.get('fps', 30), 'fot': mmc(U['frameOverTime']),
                  'start': mmc(U['startFrame']), 'cycles': U['cycles'], 'speedRange': [U['speedRange']['x'], U['speedRange']['y']]}
            if U['mode'] == 1:
                uv['sprites'] = [self.sprite(s['sprite']) for s in U.get('sprites', [])]
            else:
                uv.update({'tiles': [U['tilesX'], U['tilesY']], 'anim': U['animationType'], 'row': U['rowIndex'],
                           'rowMode': U.get('rowMode', 1)})
            if U.get('flipU') or U.get('flipV'):
                uv['flip'] = [U.get('flipU', 0), U.get('flipV', 0)]
            out['sheet'] = uv
        SB = P['SubModule']
        if SB['enabled']:
            subs = []
            for s in SB.get('subEmitters', []):
                fid = s['emitter']['fileID']
                if fid and fid in node_of_ps:
                    subs.append({'node': node_of_ps[fid], 'type': s['type'], 'props': s['properties'],
                                 'p': s.get('emitProbability', 1)})
            if subs:
                out['sub'] = subs
        T = P['TrailModule']
        if T['enabled']:
            out['trails'] = {'ratio': T['ratio'], 'life': mmc(T['lifetime']), 'minDist': T['minVertexDistance'],
                             'world': T['worldSpace'], 'die': T['dieWithParticles'], 'sizeW': T['sizeAffectsWidth'],
                             'sizeL': T.get('sizeAffectsLifetime', 0), 'inheritCol': T['inheritParticleColor'],
                             'colorOL': mmg(T['colorOverLifetime']), 'width': mmc(T['widthOverTrail']),
                             'colorOT': mmg(T['colorOverTrail']), 'texMode': T.get('textureMode', 0)}
        for key in ('CollisionModule', 'TriggerModule', 'LightsModule', 'CustomDataModule', 'ExternalForcesModule',
                    'SizeBySpeedModule', 'RotationBySpeedModule', 'ColorBySpeedModule'):
            if key in P and P[key].get('enabled'):
                out.setdefault('skipped', []).append(key)  # không chạy ở web (xem README)
        out['r'] = self.renderer(R)
        return out

    def renderer(self, R):
        mode = RENDER.get(R['m_RenderMode'], R['m_RenderMode'])
        r = {'mode': mode, 'align': R['m_RenderAlignment'], 'sort': R['m_SortMode'], 'minSz': R['m_MinParticleSize'],
             'maxSz': R['m_MaxParticleSize'], 'on': R.get('m_Enabled', 1)}
        if R.get('m_SortingFudge'):
            r['fudge'] = R['m_SortingFudge']
        if mode == 'stretched':
            r.update({'lscale': R['m_LengthScale'], 'vscale': R['m_VelocityScale'], 'cscale': R['m_CameraVelocityScale'],
                      'freeform': R.get('m_FreeformStretching', 0), 'rotStretch': R.get('m_RotateWithStretchDirection', 1)})
        piv = [R['m_Pivot'][k] for k in 'xyz']
        if any(piv):
            r['pivot'] = piv
        flip = [R['m_Flip'][k] for k in 'xyz']
        if any(flip):
            r['flip'] = flip
        if mode == 'mesh':
            r['mesh'] = self.mesh(R.get('m_Mesh'))
        mats = []
        for mref in R.get('m_Materials', []):
            mats.append(self.material(mref) if mref.get('guid') else None)
        r['mats'] = mats
        return r

    # ---- tài sản
    def sprite(self, ref):
        p = self.g.get(ref)
        if not p:
            return None
        sid = os.path.splitext(os.path.basename(p))[0]
        if sid in self.sprites:
            return sid
        d = list(yaml.load(open(os.path.join(ASSETS, p), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
        rd = d['m_RD']
        tex = self.texture(rd['texture'])
        tr = rd['textureRect']
        w, h = self.textures[tex]['orig'] if tex else (1, 1)
        # UV Unity: v tính từ đáy ảnh (giống three.js flipY = true)
        self.sprites[sid] = {'tex': tex, 'r': [tr['x'] / w, tr['y'] / h, (tr['x'] + tr['width']) / w, (tr['y'] + tr['height']) / h],
                             'pivot': [d['m_Pivot']['x'], d['m_Pivot']['y']], 'name': d['m_Name']}
        return sid

    def texture(self, ref):
        p = self.g.get(ref)
        if not p or not p.lower().endswith('.png'):
            return None
        tid = os.path.splitext(os.path.basename(p))[0]
        if tid in self.textures:
            return tid
        im = Image.open(os.path.join(ASSETS, p))
        orig = im.size
        im = im.convert('RGBA')
        if max(im.size) > TEX_MAX:
            k = TEX_MAX / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        os.makedirs(OUT_ART, exist_ok=True)
        fn = re.sub(r'[^A-Za-z0-9_.-]', '_', tid).lower() + '.webp'
        im.save(os.path.join(OUT_ART, fn), 'WEBP', lossless=True, quality=100, method=6, exact=True)
        self.textures[tid] = {'src': 'art/vfx/p/' + fn, 'size': list(im.size), 'orig': list(orig)}
        return tid

    def mesh(self, ref):
        p = self.g.get(ref) if ref else None
        if not p:
            return None
        name = os.path.splitext(os.path.basename(p))[0]
        if name not in self.meshes:
            self.meshes[name] = read_mesh(os.path.join(ASSETS, p))
        return name

    def material(self, ref):
        p = self.g.get(ref)
        if not p:
            return None
        mid = os.path.splitext(os.path.basename(p))[0]
        if mid in self.materials:
            return mid
        d = list(yaml.load(open(os.path.join(ASSETS, p), 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
        sp = d['m_SavedProperties']

        def items(x):
            if isinstance(x, dict):
                return list(x.items())
            out = []
            for e in x or []:
                out += list(e.items())
            return out
        shp = self.g.get(d['m_Shader']) if d.get('m_Shader', {}).get('guid') else None
        sname, props = shader_props(shp) if shp else ('?', {})
        kw = sorted(d.get('m_ValidKeywords') or (d.get('m_ShaderKeywords') or '').split())
        m = {'shader': sname.split('/')[-1], 'kw': kw, 'queue': d.get('m_CustomRenderQueue', -1)}
        tex, fl, col = {}, {}, {}
        for k, v in items(sp['m_TexEnvs']):
            if k in props and v['m_Texture'].get('guid'):
                t = self.texture(v['m_Texture'])
                if t:
                    tex[props[k]] = t
        for k, v in items(sp['m_Floats']):
            if k in props and not k.startswith(('BOOLEAN_', 'ENUM_', '_Queue')):
                fl[props[k]] = v
        for k, v in items(sp['m_Colors']):
            if k in props:
                col[props[k]] = [v['r'], v['g'], v['b'], v['a']]
        for k, v in (('tex', tex), ('fl', fl), ('col', col)):
            if v:
                m[k] = v
        st = self.state.get(sname) if self.state else None
        if st:
            m.update(st)
        self.materials[mid] = m
        return mid


def shader_props(rel):
    """Khối Properties của shader AssetRipper (thân là giả): tên nội bộ -> tên hiển thị."""
    txt = io.open(os.path.join(ASSETS, rel), encoding='utf-8').read()
    name = re.search(r'^Shader "([^"]+)"', txt, re.M).group(1)
    props = {}
    for m in re.finditer(r'^\s*(?:\[[^\]]*\]\s*)*(\w+)\s*\("([^"]*)"', txt, re.M):
        internal, disp = m.group(1), m.group(2)
        if disp in ('Texture2D', ''):
            disp = internal
        if internal.startswith('_Texture2DAsset_'):
            continue  # WaveMask / DLC1BiomeWaveMask nội bộ của graph (môi trường dùng chung uDrMask)
        props[internal] = disp
    return name, props


def read_mesh(p):
    """Mesh YAML -> three.js (z đổi dấu, tam giác đảo chiều): pos, nrm, uv (kênh 4), col (kênh 3), index."""
    d = list(yaml.load(open(p, 'rb').read().split(b'\n', 3)[3], Loader=CL).values())[0]
    vd = d['m_VertexData']
    n = vd['m_VertexCount']
    ch = vd['m_Channels']
    raw = bytes.fromhex(vd['_typelessdata'])
    FSZ = [4, 2, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4]
    streams = {}
    for c in ch:
        if c['dimension'] & 15:
            streams.setdefault(c['stream'], 0)
            streams[c['stream']] = max(streams[c['stream']], c['offset'] + FSZ[c['format']] * (c['dimension'] & 15))
    base, off = {}, 0
    for s in sorted(streams):
        base[s] = off
        off += (streams[s] * n + 15) // 16 * 16
    def chan(i):
        c = ch[i] if i < len(ch) else None
        if not c or not (c['dimension'] & 15):
            return None
        dim, fmt, st = c['dimension'] & 15, c['format'], c['stream']
        stride = streams[st]
        rows = np.frombuffer(raw[base[st]: base[st] + stride * n], dtype=np.uint8).reshape(n, stride)
        sz = FSZ[fmt]
        a = rows[:, c['offset']: c['offset'] + sz * dim].copy()
        if fmt == 0:
            return a.view(np.float32).reshape(n, dim).astype(np.float64)
        if fmt == 1:
            return a.view(np.float16).reshape(n, dim).astype(np.float64)
        if fmt == 2:
            return a.reshape(n, dim).astype(np.float64) / 255.0
        return None
    pos = chan(0)
    nrm = chan(1)
    col = chan(3)
    uv = chan(4)
    ib = bytes.fromhex(d['m_IndexBuffer'])
    idx = np.frombuffer(ib, dtype=np.uint16 if d.get('m_IndexFormat', 0) == 0 else np.uint32).astype(np.int64)
    tris = []
    for sm in d['m_SubMeshes']:
        first = sm['firstByte'] // (2 if d.get('m_IndexFormat', 0) == 0 else 4)
        tris.append(idx[first: first + sm['indexCount']] + sm.get('baseVertex', 0))
    tri = np.concatenate(tris).reshape(-1, 3)[:, [0, 2, 1]]
    pos[:, 2] *= -1
    out = {'pos': rnd(pos.reshape(-1).tolist(), 4), 'index': tri.reshape(-1).tolist()}
    if nrm is not None and nrm.shape[1] >= 3:
        nrm = nrm[:, :3]
        nrm[:, 2] *= -1
        out['nrm'] = rnd(nrm.reshape(-1).tolist(), 3)
    if uv is not None:
        out['uv'] = rnd(uv[:, :2].reshape(-1).tolist(), 4)
    if col is not None:
        out['col'] = rnd(col[:, :4].reshape(-1).tolist(), 3)
    return out


# ---------------------------------------------------------------- shader đã tuần tự hoá (bundle): trạng thái pass + DXBC
QUEUE_TAG = {'Background': 1000, 'Geometry': 2000, 'AlphaTest': 2450, 'Transparent': 3000, 'Overlay': 4000}


class Shaders:
    """Đọc Shader trong các bundle có shader hạt. Trạng thái lấy ở pass đầu (Universal Forward / pass vẽ màu)."""

    BUNDLES = ('player_assets', 'worldeventdata', 'itemdata', 'gamescene', 'game_assets', 'titlescene')

    def __init__(self):
        import UnityPy
        self.objs = {}
        for b in sorted(os.listdir(AA)):
            if not b.endswith('.bundle') or not any(b.startswith(k) for k in self.BUNDLES):
                continue
            env = UnityPy.load(os.path.join(AA, b))
            for o in env.objects:
                if o.type.name != 'Shader':
                    continue
                s = o.read()
                nm = s.m_ParsedForm.m_Name
                if nm not in self.objs:
                    self.objs[nm] = s
        self.cache = {}

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        s = self.objs.get(name)
        if s is None:
            self.cache[name] = None
            return None
        ss = s.m_ParsedForm.m_SubShaders[0]
        p = ss.m_Passes[0]
        st = p.m_State
        tags = dict(st.m_Tags.tags) if hasattr(st.m_Tags, 'tags') else {}
        tags.update(dict(ss.m_Tags.tags) if hasattr(ss.m_Tags, 'tags') else {})

        def fv(x):
            n = getattr(x, 'name', '') or ''
            return {'prop': n} if n and n != '<noninit>' else rnd(float(x.val))
        rb = st.rtBlend0
        q = tags.get('QUEUE', tags.get('Queue', 'Geometry'))
        mq = re.match(r'(\w+)([+-]\d+)?', q)
        queue = QUEUE_TAG.get(mq.group(1), 2000) + (int(mq.group(2)) if mq.group(2) else 0)
        out = {'blend': [fv(rb.srcBlend), fv(rb.destBlend), fv(rb.srcBlendAlpha), fv(rb.destBlendAlpha)],
               'blendOp': fv(rb.blendOp), 'zw': fv(st.zWrite), 'zt': fv(st.zTest), 'cull': fv(st.culling), 'sq': queue}
        self.cache[name] = out
        return out

    def dis(self, name, kwsets, outdir):
        """Rã DXBC của pass đầu theo từng bộ keyword vật liệu (chọn biến thể chứa đủ keyword, ít keyword thừa nhất)."""
        from UnityPy.export.ShaderConverter import ShaderProgram
        from UnityPy.helpers import CompressionHelper
        from UnityPy.streams import EndianBinaryReader
        s = self.objs.get(name)
        if s is None:
            return None
        blob = bytes(s.compressedBlob)
        g = lambda a: a[0][0] if isinstance(a[0], list) else a[0]
        raw = CompressionHelper.decompress_lz4(blob[g(s.offsets):g(s.offsets) + g(s.compressedLengths)], g(s.decompressedLengths))
        prog = ShaderProgram(EndianBinaryReader(raw, endian='<'), s.object_reader.version)
        ps = s.m_ParsedForm.m_SubShaders[0].m_Passes[0]
        parts = []
        for kws in kwsets:
            for kind, pr in (('vertex', ps.progVertex), ('fragment', ps.progFragment)):
                cands = []
                for sp in pr.m_SubPrograms:
                    k = list(prog.m_SubPrograms[sp.m_BlobIndex].m_Keywords)
                    if all(w in k for w in kws):
                        cands.append((len(k), k, sp.m_BlobIndex))
                if not cands:
                    parts.append('// ==== %s %s keywords=%s: KHÔNG có biến thể' % (name, kind, kws))
                    continue
                cands.sort(key=lambda c: (c[0], c[1]))
                _, k, bi = cands[0]
                parts.append('// ==== %s %s keywords=%s (biến thể %s)\n%s' % (name, kind, kws, k,
                                                                            dxbc_dis(bytes(prog.m_SubPrograms[bi].m_ProgramCode))))
        os.makedirs(outdir, exist_ok=True)
        fn = os.path.join(outdir, name.split('/')[-1] + '.txt')
        with open(fn, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write('\n'.join(parts))
        return fn


def dxbc_dis(code):
    """D3DDisassemble của D3DCompiler_47.dll (cùng cách tools/env.py --dis)."""
    i = code.find(b'DXBC')
    if i < 0:
        return '(không có DXBC)'
    code = code[i:]
    d3d = ctypes.WinDLL('D3DCompiler_47.dll')
    out = ctypes.c_void_p()
    if d3d.D3DDisassemble(ctypes.c_char_p(code), ctypes.c_size_t(len(code)), 0, None, ctypes.byref(out)):
        return 'D3DDisassemble failed'
    vt = ctypes.cast(out, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    p = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vt[3])(out)
    n = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vt[4])(out)
    return ctypes.string_at(p, n).decode('latin1').replace('\x00', '')


# ---------------------------------------------------------------- gom hệ hạt theo cây GameObject
def walk(doc, go):
    out, st = [], [go]
    while st:
        g = st.pop()
        out.append(g)
        st.extend(reversed(doc.children(g)))
    return out


def system(doc, conv, root, managed=('Cullable',), stop_names=()):
    """Mọi ParticleSystem đang bật dưới root (kể cả root) -> nodes, toạ độ so với root (hệ Unity).
    stop_names: không đi vào nhánh có tên này (ví dụ hệ con là prefab khác)."""
    gos = [g for g in walk(doc, root) if doc.comp(g, 198) is not None and doc.comp(g, 199) is not None
           and doc.active_chain(g, stop=doc.parent(root), managed=managed)
           and not any(n in stop_names for n in doc.path(g).split('/')[len(doc.path(root).split('/')):])]
    node_of_ps = {doc.comp(g, 198): i for i, g in enumerate(gos)}
    nodes = []
    for i, g in enumerate(gos):
        P, R = doc.get(doc.comp(g, 198)), doc.get(doc.comp(g, 199))
        d = conv.ps(P, R, node_of_ps)
        M = doc.matrix(g, stop=root) if g != root else np.eye(4)
        t, q, _ = decompose(M)
        cs = doc.chain_scale(g, stop=root) if g != root else np.ones(3)
        ls = doc.local(g)[2]
        par = doc.parent(g)
        node = {'name': doc.name[g], 'parent': gos.index(par) if par in gos else -1, 't': t, 'q': q, 'cs': cs.tolist(), 'ls': ls}
        # SimpleBuoyantObject: GameObject nổi theo sóng (SimpleBuoyantObject.cs:28-44)
        sb = doc.script(g, 'SimpleBuoyantObject')
        if sb is not None:
            node['buoy'] = {'depth': sb['objectDepth'], 'every': sb.get('timeBetweenUpdatingWaveSteepnessSec', 0.5)}
        node.update(d)
        nodes.append(node)
    return nodes, gos


def placement(doc, go, stop=None):
    p, q, s = decompose(doc.matrix(go, stop=stop))
    return {'pos': p, 'q': q, 'scale': s}


def mats_of(nodes, conv):
    ids = sorted({m for n in nodes for m in n['r']['mats'] if m})
    return {k: conv.materials[k] for k in ids}


def scene_meta(doc, root, nodes, gos, dists):
    """TimeOfDayParticles (cửa sổ giờ), Cullable (dải khoảng cách của CullingBrain) cho một nguồn đặt sẵn."""
    meta = {}
    for g in [root] + gos:
        for n, c in doc.scripts(g):
            if n == 'TimeOfDayParticles':
                d = doc.get(c)
                meta['tod'] = [d['particleStartTime'], d['particleEndTime']]
    for n, c, g in doc.ancestors_scripts(root):
        if n == 'Cullable':
            d = doc.get(c)
            band = dists.get(d['cullingGroupType'], [1, 200, 999999])
            o = d['sphereOffset']
            meta['cull'] = {'group': d['cullingGroupType'], 'near': band[0], 'far': band[1], 'r': d['sphereRadius'],
                            'c': doc.matrix(g)[:3, 3].tolist(), 'off': [o['x'], o['y'], o['z']]}
            break
    return meta


def culling_distances(doc):
    """CullingBrain.boundingDistances (Odin) -> {CullingGroupType: [band0, band1, band2]} (CullingBrain.cs:118-147)."""
    import odin
    for f, cls in doc.mono.items():
        if cls != 'CullingBrain':
            continue
        b = doc.raw(f)
        m = re.search(rb'SerializedBytes: ([0-9a-f]+)', b)
        d = odin.decode(bytes.fromhex(m.group(1).decode()))
        out = {}
        for it in d['boundingDistances']['$items']:
            raw = bytes.fromhex(it['$v']['$items'][0]['$bytes'])
            out[it['$k']] = [round(x, 3) for x in np.frombuffer(raw, dtype='<f4').tolist()]
        return out
    raise LookupError('CullingBrain not found in Game.unity')


# ---------------------------------------------------------------- danh sách cần lấy
# Hệ gọi theo tên (luồng khác gọi DRParticles.spawn(tên)): (tên, tệp, đường dẫn gốc, gắn vào)
NAMED = [
    ('RelicParticles', 'GameObject/RelicParticles.prefab', 'RelicParticles', None),
    ('BaitParticles', 'GameObject/BaitParticles.prefab', 'BaitParticles', None),
    ('AtrophyPlayerEffect', 'GameObject/AtrophyPlayerEffect.prefab', 'AtrophyPlayerEffect', None),
    ('AtrophyFishEffect', 'GameObject/AtrophyFishEffect.prefab', 'AtrophyFishEffect', None),
    ('SonarPulseEffect', PLAYER, 'PlayerContainer/Player/Abilities/FoghornAbility/SonarPulseEffect', 'Player'),
    ('BanishEffect', PLAYER, 'PlayerContainer/Player/Abilities/BanishAbility/BanishEffect', 'Player'),
    ('TeleportEffect', PLAYER, 'PlayerContainer/Player/PlayerTeleport/TeleportEffect', 'Player'),
    # ---- vòng 7 (S2 seams-data, MONSTERS.md §3.1): hệ hạt của các mối đe doạ ở The Marrows. att 'Parent' = vị trí/góc so với GameObject cha gốc
    # (scene) để đơn vị dùng nó tự đặt; các prefab sự kiện giữ nguyên vị trí gốc của prefab (att None).
    ('Ravens', 'GameObject/Ravens.prefab', 'Ravens', None),                                           # RavenWorldEvent: SwirlingRavens + RavenRotater/Impactfx
    ('SplashWorldEvent', 'GameObject/SplashWorldEvent.prefab', 'SplashWorldEvent', None),             # SplashWorldEvent.cs
    ('ParasiteWorldEvent', 'GameObject/ParasiteWorldEvent.prefab', 'ParasiteWorldEvent', None),       # ParasiteWorldEvent.cs (cùng thân với Splash)
    ('Waterspout', 'GameObject/Waterspout.prefab', 'Waterspout', None),
    ('Waterspout_Corrupt', 'GameObject/Waterspout_Corrupt.prefab', 'Waterspout_Corrupt', None),
    ('WaterspoutImpactfx', 'GameObject/WaterspoutImpactfx.prefab', 'WaterspoutImpactfx', None),
    ('GhostWindEvent', 'GameObject/GhostWindEvent.prefab', 'GhostWindEvent', None),                   # DirectionalWindEffect (chỉ về POI)
    ('DestinationWindEffect', 'GameObject/DestinationWindEffect.prefab', 'DestinationWindEffect', None),
    ('MarrowMonsterWake', 'GameObject/MarrowMonster.prefab', 'MarrowMonster/Monster/Model/marrow_swim/root_jnt/feeler1_jnt/BoatTrailParticles', 'Parent'),
    ('MarrowMonsterAttackSplash', 'GameObject/MarrowMonster.prefab', 'MarrowMonster/Monster/Model/marrow_swim/root_jnt/AttackSplash', 'Parent'),
    ('MarrowMonsterBoatDamageFX', 'GameObject/MarrowMonster.prefab', 'MarrowMonster/BoatDamageFX', 'Parent'),  # hitVFX của MarrowMonster.cs
    ('MonsterRayBoatDamageFX', 'GameObject/MonsterRayAttack1.prefab', 'MonsterRayAttack1/BoatDamageFX', 'Parent'),  # BoatDamageFX của cá đuối (cùng cây ở Attack2/Follow)
    ('PhantomSharkAppear', 'GameObject/PhantomSharkWorldEvent.prefab', 'PhantomSharkWorldEvent/AppearParticles', 'Parent'),
    ('PhantomSharkDisappear', 'GameObject/PhantomSharkWorldEvent.prefab', 'PhantomSharkWorldEvent/DisappearParticles', 'Parent'),
    ('PhantomSharkWake', 'GameObject/PhantomSharkWorldEvent.prefab', 'PhantomSharkWorldEvent/BoatTrailParticles', 'Parent'),
    ('TentacleTipParticles', 'GameObject/TentacleAttack.prefab',
     'TentacleAttack/TentacleAttack/Armature/Bone/Bone.001/Bone.002/Bone.003/Bone.004/Bone.005/Bone.006/Bone.007/Bone.008/Bone.009/TentacleTipParticles', 'Parent'),
    ('TentacleBaseParticles', 'GameObject/TentacleAttack.prefab', 'TentacleAttack/TentacleAttack/Armature/Bone/Bone.001/Bone.002/TentacleBaseParticles', 'Parent'),
    ('TentacleBigSplash', 'GameObject/TentacleAttack.prefab', 'TentacleAttack/TentacleAttack/BigSplashParticles', 'Parent'),
    ('FogDevilParticles', SCENE, 'FogDevilContainer/FogDevil/Particles', 'Parent'),                    # FogDevil.cs: Particles + AggroParticles (khói sương + 15 hạt giận)
    ('FogDevilAggroParticles', SCENE, 'FogDevilContainer/FogDevil/AggroParticles', 'Parent'),
]
# Hệ theo camera/thuyền trong Game.unity (luồng môi trường gọi): (tên, đường dẫn, follow)
FOLLOW = [('Rain', 'FollowCamera/Rain', 'camera'), ('Snow', 'FollowPlayer/Snow', 'player'),
          ('Lightning', 'FollowPlayer/Lightning', 'player'),
          ('EyeParticles', 'FollowPlayer/EyeParticles', 'player')]  # EyeParticlesWorldEvent.cs: bật/tắt, đổi maxParticles theo hoảng loạn
DLC = ('DLC1/', 'DLC2/')


def scene_roots(doc):
    """GameObject gốc của mọi nguồn đặt sẵn cần lấy, theo nhãn (thứ tự theo đường dẫn để chạy lại ra cùng thứ tự)."""
    sets = {}

    def add(label, gap, go):
        sets.setdefault((gap, label), set()).add(go)
    for go, nm in doc.name.items():
        if doc.comp(go, 198) is None:
            continue
        p = doc.path(go)
        if p.startswith(DLC):
            continue
        par = doc.parent(go)
        pn = doc.name.get(par, '')
        if nm == 'CampFire' and pn == 'Particles':
            if p.startswith('TwistedStrand/'):
                add('CampFire', 'E01', par)
            elif p.startswith('Docks/'):
                add('DockCampFire', 'K1', par)
        elif p.startswith('StellarBasin/Particles/') and re.match(r'^(Area)?Sparkles\d*$', nm):
            add('AreaSparkles' if nm.startswith('Area') else 'Sparkles', 'E02', go)
        elif re.match(r'^DevilsSpine/ThermalVents/[^/]+/', p):
            add('ThermalVent', 'E04', doc.find('/'.join(p.split('/')[:3]))[0])
        elif nm == 'InspectionGlint' and not p.startswith('WreckMonsters/'):  # quái vật: không port
            add('InspectionGlint', 'E09', go)
        elif re.match(r'^InspectPOIs/Shrine_[^/]+/Shrine_[^/]+/Particles$', p):
            add('ShrineParticles', 'E13', go)
        elif re.match(r'^GaleCliffs/FallingRocks/.*/ConstantRockfall$', p):
            add('ConstantRockfall', 'E10', go)
        elif re.match(r'^GaleCliffs/.*/GaleCliffsWaterfall/[^/]+$', p):
            add('GaleCliffsWaterfall', 'E10', par)
    out = []
    for (gap, label), gos in sorted(sets.items()):
        for go in sorted(gos, key=lambda g: (doc.path(g), g)):
            out.append((gap, label, go))
    return out


def main():
    import time
    t0 = time.time()
    os.makedirs(CACHE, exist_ok=True)
    guids = Guids()
    log('guid: %d tệp (%.0f s)' % (len(guids.path), time.time() - t0))
    conv = Conv(guids)
    conv.shaders = Shaders()
    conv.state = {}
    for nm in conv.shaders.objs:
        st = conv.shaders.get(nm)
        if st:
            conv.state[nm] = st
    log('shader: %d trong bundle (%.0f s)' % (len(conv.shaders.objs), time.time() - t0))
    census = []
    systems = {}
    docs = {}

    def doc_of(rel):
        if rel not in docs:
            docs[rel] = Doc(rel, guids)
        return docs[rel]

    # ---- hệ gọi theo tên
    pdoc = doc_of(PLAYER)
    player = pdoc.find('PlayerContainer/Player')[0]
    for name, rel, rpath, att in NAMED:
        doc = doc_of(rel)
        root = doc.find(rpath)[0]
        nodes, gos = system(doc, conv, root, managed=('__all__',))
        stop = player if att == 'Player' else (doc.parent(root) if att == 'Parent' else None)
        systems[name] = {'src': rel + ':' + rpath, 'attach': dict(placement(doc, root, stop=stop), to=att or 'root'), 'nodes': nodes}
        census.append((name, rel, rpath, len(nodes)))
    # biến thể theo thân thuyền BoatN
    for name in ('HullCriticalEffects', 'ChimneySmoke'):
        var = {}
        for n in range(1, 6):
            boat = pdoc.find('PlayerContainer/Player/Boat%d' % n)[0]
            if name == 'HullCriticalEffects':
                # BoatSubModelToggler.cs:80 bật cả cây khi số ô hỏng = DamageThreshold
                root = pdoc.find('PlayerContainer/Player/Boat%d/HullCriticalEffects' % n)[0]
            else:
                # BoatModelProxy.chimneySmoke: hệ khói BoostAbility chỉnh rateOverTime (BoostAbility.cs:120,188)
                bmp = pdoc.script(boat, 'BoatModelProxy')
                root = pdoc.comp_go[bmp['chimneySmoke']['fileID']]
            nodes, gos = system(pdoc, conv, root, managed=('__all__',))
            var['Boat%d' % n] = {'src': PLAYER + ':' + pdoc.path(root), 'attach': dict(placement(pdoc, root, stop=boat), to='Boat'),
                                 'nodes': nodes}
            census.append((name + '@Boat%d' % n, PLAYER, pdoc.path(root), len(nodes)))
        systems[name] = {'variantBy': 'parent', 'variants': var}

    # ---- Game.unity
    sdoc = doc_of(SCENE)
    log('Game.unity: %d GameObject (%.0f s)' % (len(sdoc.name), time.time() - t0))
    dists = culling_distances(sdoc)
    for name, rpath, follow in FOLLOW:
        root = sdoc.find(rpath)[0]
        froot = sdoc.parent(root)
        nodes, gos = system(sdoc, conv, root, managed=())
        fol = None
        for n, c in sdoc.scripts(froot):
            if n in ('FollowCameraInWorld', 'FollowPlayerInWorld'):
                d = sdoc.get(c)
                fol = {'target': follow, 'axes': [d['x'], d['y'], d['z']], 'rot': d['rotation']}
        systems[name] = {'src': SCENE + ':' + rpath, 'attach': dict(placement(sdoc, root, stop=froot), to=follow),
                         'follow': fol, 'nodes': nodes}
        census.append((name, SCENE, rpath, len(nodes)))
    scene, templates = [], {}
    for gap, label, root in scene_roots(sdoc):
        # K1: lửa trại bến Old Mayor nằm dưới *_OMD_OnAssets do WorldStateChanger OldMayorDockEnabler/Disabler bật theo cốt truyện
        managed = ('Cullable', '*_OnAssets') if gap == 'K1' else ('Cullable',)
        if not sdoc.active_chain(root, managed=managed):
            continue
        nodes, gos = system(sdoc, conv, root, managed=managed)
        if not nodes:
            continue
        key = hashlib.sha1(json.dumps(rnd(nodes), sort_keys=True).encode()).hexdigest()
        if key not in templates:
            k = sum(1 for v in templates.values() if v[1] == label)
            tname = label if k == 0 else '%s#%d' % (label, k + 1)
            templates[key] = (tname, label)
            systems[tname] = {'src': SCENE + ':' + sdoc.path(root), 'gap': gap, 'nodes': nodes}
        tname = templates[key][0]
        meta = scene_meta(sdoc, root, nodes, gos, dists)
        if gap == 'K1':
            meta['gate'] = 'OldMayorDock'  # [ĐỀ XUẤT] mặc định bật; bản gốc bật/tắt theo trạng thái cốt truyện
        scene.append(dict(name=tname, path=sdoc.path(root), **placement(sdoc, root), **meta))
    for tname, label in templates.values():
        census.append((tname, SCENE, systems[tname]['src'], len(systems[tname]['nodes'])))
    log('nguồn đặt sẵn: %d, mẫu: %d (%.0f s)' % (len(scene), len(templates), time.time() - t0))
    with open(os.path.join(CACHE, 'census.txt'), 'w', encoding='utf-8', newline='\n') as fh:
        for c in census:
            fh.write('%-28s %3d  %s : %s\n' % (c[0], c[3], c[1], c[2]))
        for s in scene:
            fh.write('scene %-22s %s %s tod=%s cull=%s\n' % (s['name'], rnd(s['pos'], 2), s['path'], s.get('tod'),
                                                            s.get('cull', {}).get('far')))
        for k, m in sorted(conv.materials.items()):
            fh.write('mat %-28s %s\n' % (k, json.dumps(m, ensure_ascii=False)))

    # ---- số của script điều khiển hệ (Emit/rate lúc chạy)
    abil = pdoc.find('PlayerContainer/Player/Abilities')[0]
    fh_ = next(pdoc.script(g, 'FoghornAbility') for g in walk(pdoc, abil) if pdoc.script(g, 'FoghornAbility') is not None)
    systems['SonarPulseEffect']['emitOnSpawn'] = {  # FoghornAbility.cs:130-133: startSize/startLifetime rồi Emit(1)
        'n': 1, 'size': fh_['mainSonarSize'], 'life': fh_['mainSonarLifetimeSec'],
        'mini': {'size': fh_['miniSonarSize'], 'life': fh_['miniSonarLifetimeSec']}}
    systems['Lightning']['emitOnSpawn'] = {'n': 1, 'y0': 1}  # Lightning.cs:83-87: đặt y = 0 rồi particles.Emit(1)
    ba = next(pdoc.script(g, 'BoostAbility') for g in walk(pdoc, abil) if pdoc.script(g, 'BoostAbility') is not None)
    for v in systems['ChimneySmoke']['variants'].values():
        # BoostAbility.cs:188 rateOverTime = Lerp(0, chimneySmokeEmissionMax, burn²) ghi đè rate của prefab mỗi khung:
        # rate gốc = chimneySmokeEmissionMax, js nhân với DRVfx.smokeBoost (0..1) qua setRate
        v['nodes'][0]['emission']['rate'] = {'c': ba['chimneySmokeEmissionMax']}
    if '--dis' in sys.argv:
        kws = {}
        for m in conv.materials.values():
            kws.setdefault(m['shader'], set()).add(tuple(k for k in m['kw'] if not k.startswith('_DLC1')))
        for sh, sets in sorted(kws.items()):
            full = next((n for n in conv.shaders.objs if n.split('/')[-1] == sh), None)
            if full:
                log('dis', conv.shaders.dis(full, sorted(sets), os.path.join(CACHE, 'shaders')))

    # ---- ghi
    def entry(e):
        out = {k: v for k, v in e.items() if k != 'nodes'}
        out['nodes'] = e['nodes']
        out['materials'] = mats_of(e['nodes'], conv)
        return out
    data = {}
    for name, e in systems.items():
        if 'variants' in e:
            var = {k: entry(v) for k, v in e['variants'].items()}
            first = var['Boat1']
            data[name] = {'src': first['src'], 'variantBy': 'parent', 'attach': first['attach'], 'nodes': first['nodes'],
                          'materials': first['materials'], 'variants': var}
        else:
            data[name] = entry(e)
    for s in scene:
        q = s['q']
        # yaw quanh trục y (hệ three.js: đổi dấu như world.py rot_y)
        s['yaw'] = -math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]))
    lib = {'textures': {k: {'src': v['src'], 'size': v['size']} for k, v in sorted(conv.textures.items())},
           'sprites': dict(sorted(conv.sprites.items())), 'meshes': dict(sorted(conv.meshes.items())),
           'cullingDistances': dists}
    js = ('// Generated by games/dredge/tools/particles.py from PlayerContainer.prefab, GameObject/*.prefab, Game.unity, '
          'Material/*.mat, Sprite/*.asset + serialized shaders (AssetRipper/UnityPy). Do not edit.\n'
          'window.DR_PARTICLES = ' + json.dumps(rnd(data), ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.DR_PARTICLES_SCENE = ' + json.dumps(rnd(scene, 4), ensure_ascii=False, separators=(',', ':')) + ';\n'
          'window.DR_PARTICLES_LIB = ' + json.dumps(rnd(lib), ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)
    art = sum(os.path.getsize(os.path.join(OUT_ART, f)) for f in os.listdir(OUT_ART))
    log('data/particles.js %.1f KB; %d hệ gọi tên, %d nguồn đặt sẵn, %d texture (%.1f KB), %d mesh (%.0f s)' % (
        len(js.encode()) / 1024, len(data), len(scene), len(conv.textures), art / 1024, len(conv.meshes), time.time() - t0))
    return conv, systems, scene


if __name__ == '__main__':
    main()
