#!/usr/bin/env python
"""Xuất VFX / HUD / font của Zing Speed Mobile cho Tốc Độ.

Chạy:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_fx_ui.py [fx|ui|fonts|all] [--describe <đuôi prefab>]

Ra: art/fx/*.webp, data/fx.js (TD.FX), art/ui/*.png, data/ui.js (TD.UI), art/ui/fonts/*.
Bản gốc ghi ParticleSystem bằng typetree đã sửa: mô-đun tắt (m_ModuleActiveBits) không được ghi,
nên đọc bằng cây lọc theo bit (xem read_ps). Mọi tham số lấy từ prefab gốc, `src` giữ đường dẫn.
"""
import hashlib, json, math, os, re, struct, sys
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import zs
import lz4.block
from UnityPy.classes import PPtr
from UnityPy.helpers import TypeTreeHelper as T
from UnityPy.streams import EndianBinaryReader
from PIL import Image

T.read_typetree_boost = None
FX_DIR = os.path.join(GAME, 'art', 'fx')
UI_DIR = os.path.join(GAME, 'art', 'ui')
FX_PRE = 'assets/resforassetbundles/effects/'

MODS = ['ShapeModule', 'EmissionModule', 'SizeModule', 'RotationModule', 'ColorModule', 'UVModule', 'VelocityModule',
        'InheritVelocityModule', 'ForceModule', 'ExternalForcesModule', 'ClampVelocityModule', 'NoiseModule',
        'SizeBySpeedModule', 'RotationBySpeedModule', 'ColorBySpeedModule', 'CollisionModule', 'TriggerModule',
        'SubModule', 'LightsModule', 'TrailModule', 'CustomDataModule']

# ---------------------------------------------------------------- nạp bundle kèm phụ thuộc
# index.jsonl có cab[] rỗng nên zs.load_with_deps không tìm được texture dùng chung: tự quét tên CAB trong đầu bundle.
CAB_CACHE = os.path.join(zs.REF, 'work', 'fxui', 'cabmap.json')
_cab = None
def cstr(b,p):
    e=b.index(b'\0',p); return b[p:e].decode(),e+1
def scan(path):
    with open(path,'rb') as f:
        h=f.read(256)
        sig,p=cstr(h,0)
        if sig!='UnityFS': return None
        ver=struct.unpack_from('>I',h,p)[0]; p+=4
        _,p=cstr(h,p); _,p=cstr(h,p)
        size,csz,usz,flags=struct.unpack_from('>qIII',h,p); p+=20
        if ver>=7: p=(p+15)&~15
        if flags&0x80:
            f.seek(0,2); f.seek(f.tell()-csz); 
        else: f.seek(p)
        data=f.read(csz)
    ct=flags&0x3f
    if ct==0: bi=data
    elif ct in (2,3): bi=lz4.block.decompress(data,uncompressed_size=usz)
    elif ct==1:
        import lzma
        d=lzma.LZMADecompressor(format=lzma.FORMAT_RAW,filters=[{'id':lzma.FILTER_LZMA1,'dict_size':1<<24,'lc':data[0]%9,'lp':(data[0]//9)%5,'pb':data[0]//45}])
        bi=d.decompress(data[5:],max_length=usz)
    q=16; n=struct.unpack_from('>i',bi,q)[0]; q+=4+n*10
    n=struct.unpack_from('>i',bi,q)[0]; q+=4
    names=[]
    for i in range(n):
        off,sz,fl=struct.unpack_from('>qqI',bi,q); q+=20
        nm,q=cstr(bi,q); names.append(nm)
    return names


def cab_map():
    global _cab
    if _cab is None:
        if os.path.exists(CAB_CACHE):
            _cab = json.load(open(CAB_CACHE))
        else:
            _cab = {}
            for r, _, fs in os.walk(os.path.join(zs.IFS, 'AssetBundles')):
                for fn in fs:
                    p = os.path.join(r, fn)
                    try:
                        for nm in scan(p) or []:
                            if not nm.endswith(('.resS', '.resource')):
                                _cab[nm.lower()] = os.path.relpath(p, zs.IFS)
                    except Exception:
                        pass
            os.makedirs(os.path.dirname(CAB_CACHE), exist_ok=True)
            json.dump(_cab, open(CAB_CACHE, 'w'))
    return _cab


def load_env(paths, rounds=2):
    import UnityPy
    cm = cab_map()
    env = UnityPy.Environment()
    seen = set()
    todo = [os.path.join(zs.IFS, p) for p in paths]
    for _ in range(rounds):
        for p in todo:
            if p not in seen:
                seen.add(p)
                env.load_file(p)
        nxt = []
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


# ---------------------------------------------------------------- đọc Unity

_CUR = [None]


def tt(o):
    _CUR[0] = o.assets_file
    try:
        return o.read_typetree()
    except Exception:
        return None


def pdr(ptr):
    if not ptr or ptr.get('m_PathID', 0) == 0:
        return None
    try:
        return PPtr(m_FileID=ptr['m_FileID'], m_PathID=ptr['m_PathID']).deref(_CUR[0])
    except Exception:
        return None


def read_ps(o):
    d = o.get_raw_data()
    bits = struct.unpack_from('<Q', d, 12)[0]
    src = o.serialized_type.node
    kids = [c for c in src.m_Children if not (c.m_Name in MODS and not (bits >> MODS.index(c.m_Name)) & 1)]
    root = type(src)(src.m_Level, src.m_Type, src.m_Name, src.m_ByteSize, src.m_Version, kids, src.m_TypeFlags,
                     src.m_VariableCount, src.m_Index, src.m_MetaFlag, src.m_RefTypeHash)
    _CUR[0] = o.assets_file
    return T.read_typetree(root, EndianBinaryReader(d, '<'), True, len(d), True, o.assets_file)


def load_prefab(suffix):
    import UnityPy
    suffix = suffix.lower()
    rs = [r for r in zs.find(suffix) if any(c.lower().endswith(suffix) for c in r['cont'])]
    if not rs:
        raise KeyError(suffix)
    f = rs[0]['f']
    # env.container của env lớn chậm (O(n^2) theo số bundle nạp): lấy path_id gốc từ env chỉ có bundle chính
    one = UnityPy.load(os.path.join(zs.IFS, f))
    pid = [v.path_id for k, v in one.container.items() if k.lower().endswith(suffix)][0]
    env = load_env([f])
    main = env.files[os.path.join(zs.IFS, f)]
    root = None
    for sf in main.files.values():
        if pid in getattr(sf, 'objects', {}):
            root = sf.objects[pid]
            break
    full = [c for c in rs[0]['cont'] if c.lower().endswith(suffix)][0]
    return env, root, full


def dump(root):
    out = []

    def rec(go_o, parent, path):
        go = tt(go_o)
        comps = {}
        for c in go['m_Component']:
            co = pdr(c['component'])
            if co is not None:
                comps.setdefault(co.type.name, []).append(co)
        tr = tt((comps.get('Transform') or comps.get('RectTransform'))[0])
        node = {'name': go['m_Name'], 'path': path + '/' + go['m_Name'], 'active': go['m_IsActive'], 'parent': parent,
                'pos': [tr['m_LocalPosition'][k] for k in 'xyz'], 'rot': [tr['m_LocalRotation'][k] for k in 'xyzw'],
                'scale': [tr['m_LocalScale'][k] for k in 'xyz'], 'comps': comps}
        out.append(node)
        _CUR[0] = (comps.get('Transform') or comps.get('RectTransform'))[0].assets_file
        for ch in tr['m_Children']:
            cto = pdr(ch)
            if cto is None:
                continue
            cgo = pdr(tt(cto)['m_GameObject'])
            if cgo is not None:
                rec(cgo, node, node['path'])
    rec(root, None, '')
    return out


def world(node):
    """Vị trí và tỉ lệ cộng dồn lên gốc (bỏ xoay: đủ cho hạt hướng +z cục bộ)."""
    chain = []
    n = node
    while n:
        chain.append(n)
        n = n['parent']
    p = [0, 0, 0]
    s = [1, 1, 1]
    for n in reversed(chain):
        q = n['rot']
        v = [n['pos'][i] * s[i] for i in range(3)]
        v = qrot(q_acc(chain, n), v) if False else v
        p = [p[i] + v[i] for i in range(3)]
        s = [s[i] * n['scale'][i] for i in range(3)]
    return p, s


def q_acc(chain, n):
    return n['rot']


def qrot(q, v):
    x, y, z, w = q
    t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])]


# ---------------------------------------------------------------- đường cong

def hermite(keys, t):
    if not keys:
        return 0.0
    if t <= keys[0]['time']:
        return keys[0]['value']
    for a, b in zip(keys, keys[1:]):
        if t <= b['time']:
            dt = b['time'] - a['time'] or 1e-6
            u = (t - a['time']) / dt
            m0, m1 = a['outSlope'] * dt, b['inSlope'] * dt
            if math.isinf(m0) or math.isinf(m1):
                return a['value']
            u2, u3 = u * u, u * u * u
            return (2 * u3 - 3 * u2 + 1) * a['value'] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b['value'] + (u3 - u2) * m1
    return keys[-1]['value']


def r4(x):
    return round(float(x), 4)


def mm(c):
    """MinMaxCurve -> [min, max] (chỉ giá trị gần đúng cho đường cong)."""
    st, sc, ms = c['minMaxState'], c['scalar'], c['minScalar']
    if st == 0:
        return [r4(sc), r4(sc)]
    if st == 3:
        return [r4(min(sc, ms)), r4(max(sc, ms))]
    xs = [hermite(c['maxCurve']['m_Curve'], i / 8) * sc for i in range(9)]
    if st == 2:
        ys = [hermite(c['minCurve']['m_Curve'], i / 8) * sc for i in range(9)]
        return [r4(min(ys)), r4(max(xs))]
    return [r4(min(xs)), r4(max(xs))]


def samples(c, n=9):
    """MinMaxCurve -> n mẫu theo đời hạt (đường cong max nhân scalar)."""
    st, sc = c['minMaxState'], c['scalar']
    if st in (0, 3):
        return [r4(sc)] * n
    return [r4(hermite(c['maxCurve']['m_Curve'], i / (n - 1)) * sc) for i in range(n)]


def grad(g):
    """Gradient -> [[t, r, g, b, a], ...] hợp khoá màu và khoá alpha."""
    nc, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    ck = [(g['ctime%d' % i] / 65535, g['key%d' % i]) for i in range(nc)]
    ak = [(g['atime%d' % i] / 65535, g['key%d' % i]['a']) for i in range(na)]

    def at(keys, t, f):
        if not keys:
            return f(None)
        if t <= keys[0][0]:
            return f(keys[0][1])
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t <= t1:
                u = (t - t0) / ((t1 - t0) or 1e-6)
                a, b = f(v0), f(v1)
                return [a[i] + (b[i] - a[i]) * u for i in range(len(a))] if isinstance(a, list) else a + (b - a) * u
        return f(keys[-1][1])
    ts = sorted({round(t, 4) for t, _ in ck} | {round(t, 4) for t, _ in ak})
    out = []
    for t in ts:
        rgb = at(ck, t, lambda v: [1, 1, 1] if v is None else [v['r'], v['g'], v['b']])
        a = at(ak, t, lambda v: 1.0 if v is None else v)
        out.append([r4(t)] + [r4(x) for x in rgb] + [r4(a)])
    return out


def col(c):
    return [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]


# ---------------------------------------------------------------- vật liệu, texture

TEX_CACHE = {}
DRY = [False]
SHAPES = {0: 'sphere', 1: 'sphere', 2: 'hemisphere', 3: 'hemisphere', 4: 'cone', 5: 'box', 6: 'mesh', 7: 'cone', 8: 'cone',
          9: 'cone', 10: 'circle', 11: 'circle', 12: 'edge', 13: 'mesh', 14: 'mesh', 15: 'box', 16: 'box', 17: 'donut', 18: 'rect'}


def mat_info(mo):
    m = tt(mo)
    if not m:
        return None
    sp = m['m_SavedProperties']
    texs = {}
    for k, v in sp['m_TexEnvs']:
        t = pdr(v['m_Texture'])
        if t is not None and t.type.name == 'Texture2D':
            texs[k] = {'obj': t, 'scale': [v['m_Scale']['x'], v['m_Scale']['y']], 'off': [v['m_Offset']['x'], v['m_Offset']['y']]}
    return {'name': m['m_Name'], 'tex': texs, 'col': {k: col(v) for k, v in sp['m_Colors']}, 'flt': dict(sp['m_Floats']),
            'kw': m.get('m_ShaderKeywords') or ''}


def blend_of(mi):
    f = mi['flt']
    dst = f.get('DstFactor', f.get('_DstBlend', f.get('_DstFactor')))
    if dst is not None:
        return 'add' if dst == 1 else 'alpha'
    n = mi['name'].lower()
    return 'add' if re.search(r'add|glow|light|fire|flame|spark', n) else 'alpha'


def main_tex(mi):
    for k in ('_MainTex', '_BaseMap', '_Tex', '_MainTexture'):
        if k in mi['tex']:
            return mi['tex'][k]
    return next(iter(mi['tex'].values()), None)


def export_tex(mi, maxdim=512):
    """Xuất texture chính (gộp _AlphaTex nếu có) vào art/fx. Trả tên tệp tương đối art/."""
    mt = main_tex(mi)
    if mt is None:
        return None
    t = mt['obj'].read()
    at = mi['tex'].get('_AlphaTex')
    key = (t.m_Name, at['obj'].read().m_Name if at else None)
    if key in TEX_CACHE:
        return TEX_CACHE[key]
    safe = re.sub(r'[^A-Za-z0-9_]+', '_', t.m_Name).lower()
    rel = 'art/fx/%s.webp' % safe
    if DRY[0]:
        TEX_CACHE[key] = rel
        return rel
    im = t.image.convert('RGBA')
    if at is not None:
        a = at['obj'].read().image.convert('L')
        if a.size != im.size:
            a = a.resize(im.size, Image.BILINEAR)
        im.putalpha(a)
    if max(im.size) > maxdim:
        k = maxdim / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    os.makedirs(FX_DIR, exist_ok=True)
    im.save(os.path.join(GAME, rel), 'WEBP', quality=88, method=5)
    TEX_CACHE[key] = rel
    return rel


# ---------------------------------------------------------------- layer

def zflip(v):
    return [v[0], v[1], -v[2]]


def ps_layer(node, p, rend):
    t = read_ps(p)
    I = t['InitialModule']
    L = {'kind': 'ps', 'name': node['name'], 'duration': r4(t['lengthInSec']), 'loop': bool(t['looping']),
         'prewarm': bool(t['prewarm']), 'simSpace': 'world' if t['moveWithTransform'] == 1 else 'local',
         'life': mm(I['startLifetime']), 'speed': mm(I['startSpeed']), 'size': mm(I['startSize']),
         'rot': mm(I['startRotation']), 'gravity': r4(mm(I['gravityModifier'])[1] * 9.81),
         'maxParticles': I.get('maxNumParticles')}
    sc = I['startColor']
    if sc['minMaxState'] == 1 or sc['minMaxState'] == 3:
        L['startColor'] = grad(sc['maxGradient'])[0][1:]
    else:
        L['startColor'] = col(sc['maxColor'])
        if sc['minMaxState'] == 2:
            L['startColorMin'] = col(sc['minColor'])
    em = t.get('EmissionModule')
    if em and em['enabled']:
        L['emit'] = {'rate': mm(em['rateOverTime'])[1], 'perMeter': mm(em['rateOverDistance'])[1],
                     'burst': [{'t': r4(b['time']), 'n': [int(x) for x in mm(b['countCurve'])], 'cycles': b.get('cycleCount', 1),
                                  'every': r4(b.get('repeatInterval', 0)), 'p': r4(b.get('probability', 1))} for b in em['m_Bursts']]}
    else:
        L['emit'] = {'rate': 0, 'perMeter': 0, 'burst': []}
    sh = t.get('ShapeModule')
    if sh and sh['enabled']:
        r = sh['radius']['value'] if isinstance(sh['radius'], dict) else sh['radius']
        L['shape'] = {'type': SHAPES.get(sh['type'], str(sh['type'])), 'code': sh['type'], 'radius': r4(r), 'angle': r4(sh['angle']),
                      'length': r4(sh['length']), 'box': [r4(sh['boxThickness'][k]) for k in 'xyz'],
                      'scale': [r4(sh['m_Scale'][k]) for k in 'xyz'], 'pos': zflip([r4(sh['m_Position'][k]) for k in 'xyz']),
                      'rot': [r4(sh['m_Rotation'][k]) for k in 'xyz'], 'randomDir': r4(sh['randomDirectionAmount'])}
    z = t.get('SizeModule')
    if z and z['enabled']:
        L['sizeOverLife'] = samples(z['curve'])
    c = t.get('ColorModule')
    if c and c['enabled']:
        g = c['gradient']
        L['color'] = grad(g['maxGradient']) if g['minMaxState'] in (1, 3) else [[0] + col(g['maxColor']), [1] + col(g['maxColor'])]
    rm = t.get('RotationModule')
    if rm and rm['enabled']:
        L['rotOverLife'] = mm(rm['curve'])
    u = t.get('UVModule')
    if u and u['enabled'] and (u['tilesX'] > 1 or u['tilesY'] > 1):
        L['sheet'] = {'cols': u['tilesX'], 'rows': u['tilesY'], 'fps': r4(u['fps']) if u['timeMode'] == 1 else 0,
                      'mode': 'row' if u['animationType'] == 1 else 'whole', 'cycles': r4(u['cycles']),
                      'frame': mm(u['frameOverTime']), 'start': mm(u['startFrame'])[1], 'timeMode': u['timeMode']}
    v = t.get('VelocityModule')
    if v and v['enabled']:
        L['velocity'] = [mm(v[k])[1] for k in ('x', 'y', 'z')]
    f = t.get('ForceModule')
    if f and f['enabled']:
        L['force'] = [mm(f[k])[1] for k in ('x', 'y', 'z')]
    iv = t.get('InheritVelocityModule')
    if iv and iv['enabled']:
        L['inheritVel'] = mm(iv['m_Curve'])[1]
    r = tt(rend)
    L['_scaleMode'] = t['scalingMode']
    L['render'] = {'mode': ['billboard', 'stretch', 'hbillboard', 'vbillboard', 'mesh'][r['m_RenderMode']] if r['m_RenderMode'] < 5 else r['m_RenderMode'],
                   'length': r4(r['m_LengthScale']), 'velocity': r4(r['m_VelocityScale']), 'maxSize': r4(r['m_MaxParticleSize'])}
    if L['render']['mode'] == 'mesh':
        m = pdr(r['m_Mesh'])
        mt_ = tt(m) if m is not None else None
        if mt_:
            e = mt_['m_LocalAABB']['m_Extent']
            L['render']['mesh'] = {'name': mt_['m_Name'], 'size': [r4(e[k] * 2) for k in 'xyz']}
    return L, r


def mesh_stats(mf):
    m = pdr(tt(mf)['m_Mesh'])
    if m is None:
        return None
    t = tt(m)
    if not t:
        return None
    c, e = t['m_LocalAABB']['m_Center'], t['m_LocalAABB']['m_Extent']
    return {'name': t['m_Name'], 'size': [r4(e[k] * 2) for k in 'xyz'], 'center': [r4(c[k]) for k in 'xyz']}


def material_layer(L, rend):
    r = tt(rend)
    mats = []
    for m in r['m_Materials']:
        mo = pdr(m)
        if mo is not None:
            mi = mat_info(mo)
            if mi:
                mats.append(mi)
    if not mats:
        return
    mi = next((m for m in mats if main_tex(m)), mats[0])
    L['blend'] = blend_of(mi)
    L['material'] = mi['name']
    tex = export_tex(mi)
    if tex:
        L['tex'] = tex
    mt = main_tex(mi)
    if mt:
        L['uvScale'] = [r4(x) for x in mt['scale']]
        L['uvOffset'] = [r4(x) for x in mt['off']]
    c = mi['col'].get('_Color') or mi['col'].get('_TintColor') or mi['col'].get('_BaseColor')
    if c:
        L['tint'] = c
    fl = mi['flt']
    if fl.get('_U') or fl.get('_V'):
        L['uvScroll'] = [r4(fl.get('_U', 0)), r4(fl.get('_V', 0))]


def fx_controls(nd):
    """NssFXHelper.FXControls: đường cong điều khiển thuộc tính vật liệu theo thời gian (key = mã KeyWord gốc)."""
    out = []
    for m in nd['comps'].get('MonoBehaviour', []):
        t = tt(m)
        for c in (t or {}).get('FXControls', []):
            k = c['Curve']['m_Curve']
            out.append({'key': c['KeyWord'], 'delay': r4(c['Delay']), 'color': col(c['TargetColor']),
                        'curve': [r4(hermite(k, i / 8) * c['CurveValueMulti']) for i in range(9)], 'speed': r4(c['CurveSpeedMulti']),
                        'wrap': c['CycleWrapMode'], 'len': r4(k[-1]['time'] if k else 0)})
    return out


def layers_of(nodes, want=None):
    out = []
    for nd in nodes:
        pos, scl = world(nd)
        base = {'path': nd['path'], 'pos': zflip([r4(x) for x in pos]), 'scale': [r4(x) for x in scl]}
        a, n = True, nd
        while n and n['parent']:  # gốc prefab thường tắt sẵn, bật lúc chạy: bỏ qua gốc
            a = a and n['active']
            n = n['parent']
        if not a:
            base['active'] = False
        ctl = fx_controls(nd)
        for p in nd['comps'].get('ParticleSystem', []):
            rend = nd['comps']['ParticleSystemRenderer'][0]
            L, r = ps_layer(nd, p, rend)
            L.update(base)
            sm = L.pop('_scaleMode')
            sc = scl if sm == 0 else nd['scale']
            L['k'] = r4(sum(abs(x) for x in sc) / 3)  # hệ số tỉ lệ cho size, speed, bán kính (scalingMode Hierarchy/Local)
            material_layer(L, rend)
            out.append(L)
        for key, kind in (('MeshRenderer', 'mesh'), ('TrailRenderer', 'trail'), ('LineRenderer', 'line')):
            for r in nd['comps'].get(key, []):
                L = {'kind': kind, 'name': nd['name']}
                L.update(base)
                material_layer(L, r)
                if ctl:
                    L['fx'] = ctl
                if kind == 'mesh' and nd['comps'].get('MeshFilter'):
                    ms = mesh_stats(nd['comps']['MeshFilter'][0])
                    if ms:
                        L['mesh'] = ms
                if kind in ('trail', 'line'):
                    t = tt(r)
                    L['time'] = r4(t.get('m_Time', 0))
                    w = t.get('m_Parameters', {}).get('widthMultiplier')
                    if w is not None:
                        L['width'] = r4(w)
                out.append(L)
    return out


def trace_layers(nodes):
    """TyreTraceConfig (vệt bánh xe) là MonoBehaviour trỏ TraceMaterial."""
    out = []
    for nd in nodes:
        for m in nd['comps'].get('MonoBehaviour', []):
            t = tt(m)
            if t and 'TraceMaterial' in t:
                mo = pdr(t['TraceMaterial'])
                if mo is None:
                    continue
                mi = mat_info(mo)
                L = {'kind': 'trace', 'name': nd['name'], 'path': nd['path'], 'blend': blend_of(mi), 'material': mi['name']}
                tex = export_tex(mi)
                if tex:
                    L['tex'] = tex
                c = mi['col'].get('_Color') or mi['col'].get('_TintColor')
                if c:
                    L['tint'] = c
                out.append(L)
    return out


def describe(suffix):
    env, root, full = load_prefab(suffix)
    nodes = dump(root)
    ls = layers_of(nodes) + trace_layers(nodes)
    return full, ls



# ---------------------------------------------------------------- vai trò VFX
# tên vai trò -> đường dẫn prefab (đuôi, dưới effects/). Prefab đầu tiên là chính.
ROLES = [
    ('drift_spark', 'fx_car_driftflame/driftflame_00004.prefab'),
    ('drift_flame_b', 'fx_car_driftflame/driftflame_00003.prefab'),
    ('drift_flame_c', 'fx_car_driftflame/driftflame_00010.prefab'),
    ('tire_smoke', 'fx_car_common/smoke/fx_car_common_smoke_lod1.prefab'),
    ('tire_dust', 'fx_car_common/trackphy/fx_car_tiredust_desert01_lod1.prefab'),
    ('skid', 'fx_car_common/line/fx_car_line_drifttire.prefab'),
    ('skid_move', 'fx_car_common/line/fx_car_line_movetire.prefab'),
    ('skid_driftback', 'fx_car_common/line/fx_car_line_driftbacktire.prefab'),
    ('tire_trail', 'fx_car_tire/tire_00001.prefab'),
    ('nitro_flame_big', 'fx_car_private/00001_s_sdfb/fx_car_nitrogenperfect_sdfb_lod1.prefab'),
    ('miniboost_flame', 'fx_car_private/00001_s_sdfb/fx_car_nitrogensmall_sdfb_lod1.prefab'),
    ('nitro_flame_big_ps', 'fx_car_private/00319_a_dts6a/fx_car_nitrogenperfect_dts6a_lod1.prefab'),
    ('miniboost_flame_ps', 'fx_car_private/00319_a_dts6a/fx_car_nitrogensmall_dts6a_lod1.prefab'),
    ('speedline', 'fx_camera/fx_camera_speedlinenormal_lod1.prefab'),
    ('speedline_small_accel', 'fx_camera/fx_camera_speedlinesmallaccel_lod1.prefab'),
    ('speedline_big_accel', 'fx_camera/fx_camera_speedlinebigaccel_lod1.prefab'),
    ('boost_flash', 'fx_camera/fx_camera_supernitro_lod1.prefab'),
    ('boost_burst', 'fx_car_common/burst/fx_car_burst1_comm_lod1.prefab'),
    ('boost_burst_big', 'fx_car_common/burst/fx_car_burst2_comm_lod1.prefab'),
    ('wind_trail', 'fx_car_common/fenghen/fx_car_fenghen_lod1.prefab'),
    ('wall_spark', 'fx_car_common/collision/fx_car_collision_front_lod1.prefab'),
    ('wall_hit', 'fx_car_common/collision/fx_car_collision_lod1.prefab'),
    ('wall_scrape', 'fx_car_common/collision/fx_car_collision_floor_lod1.prefab'),
    ('land_dust', 'fx_car_common/trackphy/fx_leapland_cement_lod1.prefab'),
    ('respawn', 'fx_system/fx_zhuazhu/fx_zhuazhu_skill_fuhuo_lod1.prefab'),
    ('finish_confetti', 'fx_env/fx_academy/fx_env_academy_caidai_01_lod1.prefab'),
    ('finish_firework', 'fx_system/fx_rallya/fx_rallya_levelpoint_firework_a_lod1.prefab'),
    ('finish_burst', 'fx_system/v45_tuya/fx_v45_tuya_finish_car_lod1.prefab'),
    ('start_line', 'fx_env/fx_scgongchang/fx_evn_scgongchang_startpoint_lod1.prefab'),
]


def clear(d, ext):
    os.makedirs(d, exist_ok=True)
    for fn in os.listdir(d):
        if fn.endswith(ext):
            os.remove(os.path.join(d, fn))


def build_fx():
    clear(FX_DIR, '.webp')
    out = {}
    for name, suf in ROLES:
        try:
            full, ls = describe(FX_PRE + suf)
        except Exception as e:
            print('  fx %-18s LỖI %r' % (name, e))
            continue
        if not ls:
            print('  fx %-18s không có layer' % name)
            continue
        act = [L for L in ls if L.get('active', True)] or ls
        main = next((L for L in act if L['kind'] == 'ps' and L.get('tex')), None) or next((L for L in act if L.get('tex')), act[0])
        e = {k: v for k, v in main.items() if k not in ('path',)}
        e['layers'] = ls
        e['src'] = full
        out[name] = e
        print('  fx %-18s %d layer, chính=%s tex=%s' % (name, len(ls), main['kind'], main.get('tex')))
    return out


def js_write(path, var, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write('/* Sinh bởi tools/export_fx_ui.py, đừng sửa tay. */\n')
        f.write('(function (g) { var TD = g.TD = g.TD || {}; TD.%s = ' % var)
        f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        f.write('; })(typeof window !== "undefined" ? window : globalThis);\n')


# ---------------------------------------------------------------- UI (atlas NGUI)

ATLAS_CACHE = os.path.join(zs.REF, 'work', 'fxui', 'atlas_catalog.json')


def atlas_catalog():
    if os.path.exists(ATLAS_CACHE):
        return json.load(open(ATLAS_CACHE))
    import UnityPy
    fs = {}
    for r in zs.index():
        for c in r['cont']:
            if c.endswith('.prefab') and '/atlas/' in c and '/ui/' in c:
                fs.setdefault(r['f'], []).append(c)
    out = {}
    for f in fs:
        env = UnityPy.load(os.path.join(zs.IFS, f))
        for k, v in env.container.items():
            if k.endswith('.prefab') and '/atlas/' in k:
                go = tt(v.deref())
                for c in go['m_Component']:
                    co = pdr(c['component'])
                    if co is not None and co.type.name == 'MonoBehaviour':
                        t = tt(co)
                        if t and 'mSprites' in t:
                            out[k] = {'bundle': f, 'sprites': [[s['name'], s['x'], s['y'], s['width'], s['height'], s['borderLeft'], s['borderTop'],
                                                                 s['borderRight'], s['borderBottom']] for s in t['mSprites']]}
    json.dump(out, open(ATLAS_CACHE, 'w'))
    return out


def tex_image(mi):
    mt = main_tex(mi)
    im = mt['obj'].read().image.convert('RGBA')
    at = mi['tex'].get('_AlphaTex')
    if at is not None:
        a = at['obj'].read().image.convert('L')
        if a.size != im.size:
            a = a.resize(im.size, Image.BILINEAR)
        im.putalpha(a)
    return im


_ATLAS_IMG = {}


def atlas_image(key):
    if key not in _ATLAS_IMG:
        ent = atlas_catalog()[key]
        import UnityPy
        one = UnityPy.load(os.path.join(zs.IFS, ent['bundle']))
        pid = one.container[key].path_id
        env = load_env([ent['bundle']], rounds=4)
        main = env.files[os.path.join(zs.IFS, ent['bundle'])]
        go = tt(next(sf.objects[pid] for sf in main.files.values() if pid in sf.objects))
        for c in go['m_Component']:
            co = pdr(c['component'])
            if co is not None and co.type.name == 'MonoBehaviour':
                t = tt(co)
                if t and 'mSprites' in t:
                    _ATLAS_IMG[key] = tex_image(mat_info(pdr(t['material'])))
                    break
    return _ATLAS_IMG[key]


# (tên, đuôi atlas, tên sprite)
UI_SPRITES = [
    # HUD đua
    ('speed_bg', 'ig_ingame/ig_ingame.prefab', 'BG_Speed'),
    ('speed_unit_kmh', 'ig_ingame/ig_ingame.prefab', 'Text_Kmh'),
    ('speed_font_km', 'ig_ingame/ig_ingame.prefab', 'Font_km'),
    ('speed_bar_bg', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Bg_Speed'),
    ('hud_bottom_frame', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_BottomFrame'),
    ('gauge_ring_bg', 'ig_ingame/ig_ingame.prefab', 'BG_Progress'),
    ('gauge_ring_fg', 'ig_ingame/ig_ingame.prefab', 'FG_Progress'),
    ('gauge_ring_big', 'ig_ingame/ig_ingame.prefab', 'BG_Progress_01'),
    ('gauge_ratio_ring', 'ig_ingame/ig_ingame.prefab', 'Icon_Ratio'),
    ('nitro_bar_green', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Icon_Bar_Grren'),
    ('nitro_bar_yellow', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Icon_Bar_Yellow'),
    ('nitro_bar_sign', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Icon_Bar_sign'),
    ('nitro_bar_bg', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Bg_Bar_01'),
    ('nitro_icon_blue', 'ig_singlefeature/ig_singlefeature.prefab', 'Icon_N2O_Blue'),
    ('nitro_icon_pink', 'ig_singlefeature/ig_singlefeature.prefab', 'Icon_N2O_Pink'),
    ('nitro_double_green', 'ig_singlefeature/ig_singlefeature.prefab', 'Icon_2N2O_Green'),
    ('nitro_double_yellow', 'ig_singlefeature/ig_singlefeature.prefab', 'Icon_2N2O_Yellow'),
    ('nitro_fire', 'ig_ingame/ig_ingame.prefab', 'Icon_Fire'),
    ('progress_blue', 'ig_ingame/ig_ingame.prefab', 'Icon_Progress_Blue'),
    ('progress_purple', 'ig_ingame/ig_ingame.prefab', 'Icon_Progress_Purple'),
    ('progress_red', 'ig_ingame/ig_ingame.prefab', 'Icon_Progress_Red'),
    ('progress_yellow', 'ig_ingame/ig_ingame.prefab', 'Icon_Progress_Yellow'),
    ('track_progress_bar', 'ig_ingame/ig_ingame.prefab', 'Bg_Progess_Map'),
    ('track_progress_bg', 'ig_ingame/ig_ingame.prefab', 'Bg_MapProgess02'),
    ('lap_flag', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Icon_Flag'),
    ('time_clock', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Icon_SandyClock'),
    ('time_icon', 'ig_ingame/ig_ingame.prefab', 'Icon_Time'),
    ('minimap_frame', 'ig_ingame/ig_ingame.prefab', 'BG_MiniMap'),
    ('minimap_arrow_player', 'ig_ingame/ig_ingame.prefab', 'BG_MultiPlayerArrow'),
    ('minimap_dot_player', 'ig_ingame/ig_ingame.prefab', 'BG_MultiPlayerPlayer'),
    ('minimap_look', 'ig_ingame/ig_ingame.prefab', 'BG_MultiPlayerLook'),
    ('btn_pause', 'ig_ingame/ig_ingame.prefab', 'Btn_Pause'),
    ('btn_drift_left', 'ig_ingame/ig_ingame.prefab', 'Icon_DriftLeft'),
    ('btn_drift_right', 'ig_ingame/ig_ingame.prefab', 'Icon_DriftRight'),
    ('btn_reverse', 'ig_ingame/ig_ingame.prefab', 'Icon_Reverse'),
    ('btn_jump', 'ig_ingame/ig_ingame.prefab', 'Icon_Jump'),
    ('btn_clamp', 'ig_ingame/ig_ingame.prefab', 'Icon_Clamp'),
    ('btn_skill', 'ig_ingame/ig_ingame.prefab', 'Icon_Skill'),
    ('btn_skill_bg', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_BtnSkill'),
    ('btn_circle_left', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_CircleLeft'),
    ('btn_circle_right', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_CircleRight'),
    ('btn_rocker', 'ig_ingame/ig_ingame.prefab', 'Icon_Rocker'),
    ('btn_rearview', 'ig_ingame/ig_ingame.prefab', 'Icon_rearview_01'),
    ('btn_reset', 'ig_ingame/ig_ingame.prefab', 'Icon_Replay'),
    ('item_missile', 'ig_ingame/ig_ingame.prefab', 'Icon_Missile'),
    ('item_shield', 'ig_ingame/ig_ingame.prefab', 'Icon_Shield'),
    ('item_slot_bg', 'ig_ingame/ig_ingame.prefab', 'Icon_Prop1Cirlcle2'),
    ('rank_banner_first', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Text_First'),
    ('rank_banner_finish', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Text_Finish'),
    ('rank_banner_victory', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'Text_Victory'),
    ('text_perfect', 'ig_ingame/ig_ingame.prefab', 'Font_Perfect'),
    # kết quả
    ('rank_1st', 'ig_settle/ig_settle.prefab', 'Font_1ST'),
    ('rank_2nd', 'ig_settle/ig_settle.prefab', 'Font_2nd'),
    ('rank_3rd', 'ig_settle/ig_settle.prefab', 'Font_3rd'),
    ('rank_4th', 'ig_settle/ig_settle.prefab', 'Font_4th'),
    ('rank_5th', 'ig_settle/ig_settle.prefab', 'Font_5th'),
    ('rank_big_1', 'ig_settle_ui3/ig_settle_ui3.prefab', 'Icon_Rank_1'),
    ('rank_big_2', 'ig_settle_ui3/ig_settle_ui3.prefab', 'Icon_Rank_2'),
    ('rank_big_3', 'ig_settle_ui3/ig_settle_ui3.prefab', 'Icon_Rank_3'),
    ('rank_row_1', 'ig_settle/ig_settle.prefab', 'BG_Rank_One'),
    ('rank_row_2', 'ig_settle/ig_settle.prefab', 'BG_Rank_Two'),
    ('rank_row_3', 'ig_settle/ig_settle.prefab', 'BG_Rank_Three'),
    ('rank_row_4', 'ig_settle/ig_settle.prefab', 'BG_Rank_Four'),
    ('result_row_blue', 'ig_settle/ig_settle.prefab', 'BG_CarBlue'),
    ('result_row_red', 'ig_settle/ig_settle.prefab', 'BG_CarRed'),
    ('result_row_green', 'ig_settle/ig_settle.prefab', 'BG_CarGreen'),
    ('result_row_yellow', 'ig_settle/ig_settle.prefab', 'BG_CarYellow'),
    ('result_award_bg', 'ig_settle/ig_settle.prefab', 'BG_AwardItem1'),
    ('result_title_bar', 'ig_settle/ig_settle.prefab', 'BG_Top_1'),
    ('result_new_record', 'ig_settle/ig_settle.prefab', 'Icon_NewRecord'),
    ('icon_star_on', 'ig_settle/ig_settle.prefab', 'Icon_Star_Light'),
    ('icon_star_off', 'ig_settle/ig_settle.prefab', 'Icon_Star_Gary'),
    ('btn_again', 'ig_settle_ui3/ig_settle_ui3.prefab', 'Icon_Again02'),
    ('btn_share', 'ig_settle_ui3/ig_settle_ui3.prefab', 'Btn_Share'),
    # huy chương, tiền
    ('trophy_cup', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Icon_Cup'),
    ('crown_gold', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Icon_GoldCrown'),
    ('medal_glory_1', 'og_rank/id_rank.prefab', 'Icon_GloryMedal01') if False else ('medal_glory', 'id_rank/id_rank.prefab', 'Icon_GloryMedal01'),
    ('cup_1', 'og_story/og_story.prefab', 'Icon_Cup1'),
    ('cup_2', 'og_story/og_story.prefab', 'Icon_Cup2'),
    ('cup_3', 'og_story/og_story.prefab', 'Icon_Cup3'),
    ('coin', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Icon_Gold'),
    ('coin_x2', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Icon_GoldCoin2X'),
    ('coin_settle', 'ig_settle/ig_settle.prefab', 'Icon_Gold'),
    ('exp_icon', 'ig_settle/ig_settle.prefab', 'Icon_Exp'),
    # nút, bảng, khung chọn
    ('btn_blue_l', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Blue_L'),
    ('btn_blue_m', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Blue_M'),
    ('btn_blue_s', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Blue_S'),
    ('btn_yellow_l', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Yellow_L'),
    ('btn_yellow_m', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Yellow_M'),
    ('btn_yellow_s', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Yellow_S'),
    ('btn_gray_m', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Gray_M'),
    ('btn_gray_s', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'Btn_Gray_S'),
    ('btn_flat_blue_l', 'c_basecomponent/c_basecomponent.prefab', 'Btn_Blue_L_02'),
    ('btn_flat_yellow_l', 'c_basecomponent/c_basecomponent.prefab', 'Btn_Yellow_L_02'),
    ('btn_flat_gray_l', 'c_basecomponent/c_basecomponent.prefab', 'Btn_Gray_L_02'),
    ('btn_close', 'c_basecomponent/c_basecomponent.prefab', 'Btn_TipClose_01'),
    ('panel_blue', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Panel'),
    ('panel_item', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Item'),
    ('panel_list_1', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_List_01'),
    ('panel_list_2', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_List_02'),
    ('panel_list_3', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_List_03'),
    ('panel_list_4', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_List_04'),
    ('panel_tips', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Tips_01'),
    ('panel_window', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Window1_Big'),
    ('panel_window_bg', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Window1_Bg'),
    ('select_frame_1', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_Select_01'),
    ('select_frame_2', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_Select_02'),
    ('select_frame_3', 'ig_ingame_ui3/ig_ingame_ui3.prefab', 'BG_Select_03'),
    ('select_highlight', 'c_perpetual_ui3/c_perpetual_ui3.prefab', 'BG_Selected'),
]

# texture rời (UIFX) -> (tên, tên texture, tên texture alpha hoặc None)
UI_TEXTURES = [
    ('countdown_1', 'UIFX_CountDown_01_NoMip', 'UIFX_CountDown_01_alpha_NoMip'),
    ('countdown_2', 'UIFX_CountDown_02_NoMip', 'UIFX_CountDown_02_alpha_NoMip'),
    ('countdown_3', 'UIFX_CountDown_03_NoMip', 'UIFX_CountDown_03_alpha_NoMip'),
    ('countdown_4', 'UIFX_CountDown_04_NoMip', 'UIFX_CountDown_04_alpha_NoMip'),
    ('timeup_digits', 'UIFX_NO_01_NoMip', None),
]

_TEXIDX = None


def find_tex(name):
    global _TEXIDX
    if _TEXIDX is None:
        _TEXIDX = {}
        for r in zs.index():
            for n in r['names']:
                if n.startswith('Tex:'):
                    _TEXIDX.setdefault(n[4:].lower(), r['f'])
    f = _TEXIDX.get(name.lower())
    if f is None:
        return None
    env = load_env([f])
    for o in env.objects:
        if o.type.name == 'Texture2D':
            t = o.read()
            if t.m_Name.lower() == name.lower():
                return t
    return None


def build_ui():
    clear(UI_DIR, '.png')
    cat = atlas_catalog()
    ui = {}
    for name, suf, sp in UI_SPRITES:
        keys = [k for k in cat if k.endswith('/' + suf)]
        hit = None
        for k in keys:
            for s in cat[k]['sprites']:
                if s[0].lower() == sp.lower():
                    hit = (k, s)
                    break
            if hit:
                break
        if not hit:
            print('  ui %-22s thiếu %s %s' % (name, suf, sp))
            continue
        k, s = hit
        _, x, y, w, h, bl, bt, br, bb = s
        im = atlas_image(k).crop((x, y, x + w, y + h))
        im.save(os.path.join(UI_DIR, name + '.png'), optimize=True)
        e = {'src': 'art/ui/%s.png' % name, 'w': w, 'h': h, 'from': '%s#%s' % (k.split('resforassetbundles/')[1], s[0])}
        if bl or bt or br or bb:
            e['border'] = [bl, bt, br, bb]
        ui[name] = e
    for name, tn, an in UI_TEXTURES:
        t = find_tex(tn)
        if t is None:
            print('  ui %-22s thiếu texture %s' % (name, tn))
            continue
        im = t.image.convert('RGBA')
        if an:
            a = find_tex(an)
            if a is not None:
                al = a.image.convert('L')
                if al.size != im.size:
                    al = al.resize(im.size, Image.BILINEAR)
                im.putalpha(al)
        if max(im.size) > 512:
            k = 512 / max(im.size)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        im.save(os.path.join(UI_DIR, name + '.png'), optimize=True)
        ui[name] = {'src': 'art/ui/%s.png' % name, 'w': im.width, 'h': im.height, 'from': 'Tex:' + tn}
    return ui


# ---------------------------------------------------------------- font

FONT_SRC = ['assets/ui/c_font/']  # fontbase/* chỉ là khung rỗng (2 glyph) hoặc Noto CJK 5,9 MB không có dấu Việt đủ
TEXT = 'ĐUA XE TỐC ĐỘ Hạng Vòng Về đích Đường đua Ợ ữ ỹ ằ ẳ'


def build_fonts():
    import UnityPy
    out = os.path.join(UI_DIR, 'fonts')
    os.makedirs(out, exist_ok=True)
    got = {}
    seen = set()
    for fn in os.listdir(out):
        os.remove(os.path.join(out, fn))
    for r in zs.index():
        for c in r['cont']:
            if c.endswith(('.ttf', '.otf')) and any(c.startswith(p) for p in FONT_SRC):
                import UnityPy
                env = UnityPy.load(os.path.join(zs.IFS, r['f']))
                for o in env.objects:
                    if o.type.name == 'Font':
                        f = o.read()
                        if f.m_FontData and f.m_Name.lower() == os.path.basename(c)[:-4].lower():
                            fn = os.path.basename(c)
                            data = bytes(f.m_FontData)
                            if len(data) < 100000 or hashlib.md5(data).hexdigest() in seen:
                                continue  # fontbase/* chỉ là khung rỗng; c_font/* là 4 bản trùng nhau
                            seen.add(hashlib.md5(data).hexdigest())
                            open(os.path.join(out, fn), 'wb').write(data)
                            got[fn] = len(data)
    return got


def coverage():
    from fontTools.ttLib import TTFont
    res = {}
    out = os.path.join(UI_DIR, 'fonts')
    need = sorted({ch for ch in TEXT if not ch.isspace()})
    for fn in sorted(os.listdir(out)):
        try:
            cm = TTFont(os.path.join(out, fn)).getBestCmap()
        except Exception as e:
            res[fn] = 'không đọc được %r' % e
            continue
        miss = [ch for ch in need if ord(ch) not in cm]
        res[fn] = {'glyphs': len(cm), 'covered': len(need) - len(miss), 'of': len(need), 'missing': ''.join(miss)}
    return res


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--describe':
        DRY[0] = True
        for s in a[1:]:
            full, ls = describe(s)
            print('==', full)
            for L in ls:
                print(json.dumps(L, ensure_ascii=False)[:int(os.environ.get('W', 900))])
        sys.exit()
    what = a[0] if a else 'all'
    if what in ('fx', 'all'):
        fx = build_fx()
        js_write(os.path.join(GAME, 'data', 'fx.js'), 'FX', fx)
    if what in ('ui', 'all'):
        ui = build_ui()
        js_write(os.path.join(GAME, 'data', 'ui.js'), 'UI', ui)
        print('ui: %d sprite' % len(ui))
    if what in ('fonts', 'all'):
        print('fonts:', build_fonts())
        print(json.dumps(coverage(), ensure_ascii=False, indent=1))
