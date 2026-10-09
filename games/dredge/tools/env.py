"""Môi trường DREDGE (ánh sáng, sương, trời, hậu kỳ màu, hạt khí quyển) -> data/env.js + art/env/*.

Chạy (gốc repo, ~2 phút, cần world.py đã chạy để có art/world/scene_config.json + markers.json):
    python -I games/dredge/tools/env.py
    python -I games/dredge/tools/env.py --dis D:/dredge-ref/notes/shaders   # thêm: rã DXBC các shader môi trường
Nguồn: bundle gamescene (UnityPy, qua world.load_env), Volume/VolumeProfile của scene, vật liệu Skybox_Mat,
Terrain_Mat, Lit_Shader (texture mây/nhấp nháy), TerrainData (SplatAlpha 0), các ParticleSystem khí quyển.
Ghi:
    data/env.js            window.DR_ENV (gradient giờ, sương, hằng số shader, trời, hậu kỳ, volume vùng, hạt)
    art/env/lut.png        LUT màu 1024x32 của ColorLookup (GameSceneProfile_0) — để PNG, không nén mất dữ liệu
    art/env/*.webp         texture trời, mây che nắng, gradient nhấp nháy đèn, splat đáy biển (webp lossless)
Hằng số trong "shader" (350, 337, cam (0,752941; 0,235294; 0)...) đọc từ bytecode DXBC bản build bằng
D3DDisassemble (D3DCompiler_47.dll); --dis ghi lại bản rã để đối chiếu.
"""
import ctypes, io, json, math, os, sys

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')  # python -I bỏ qua PYTHONIOENCODING
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import world as WT  # noqa: E402  (load_env, Scene, Meshes, collider_volumes, three_pos, rot_y, lossy)

GAME = os.path.dirname(HERE)
OUT_ART = os.path.join(GAME, 'art', 'env')
OUT_JS = os.path.join(GAME, 'data', 'env.js')
WORLD = os.path.join(GAME, 'art', 'world')


def log(*a):
    WT.log(*a)


def r5(x):
    return round(float(x), 5)


def col4(c):
    return [r5(c['r']), r5(c['g']), r5(c['b']), r5(c['a'])]


# ---------------------------------------------------------------- texture ra đĩa
def save_tex(obj, name, size=None, fmt='webp', flip=False):
    img = obj.image
    if size and max(img.size) > size:
        k = size / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    if flip:
        img = img.transpose(Image.FLIP_TOP_BOTTOM)
    os.makedirs(OUT_ART, exist_ok=True)
    p = os.path.join(OUT_ART, name)
    if fmt == 'png':
        img.save(p, 'PNG', optimize=True)
    else:
        img.save(p, 'WEBP', lossless=True, quality=100, method=6)
    log('  %-28s %4dx%-4d %6.1f KB' % (name, img.width, img.height, os.path.getsize(p) / 1024))
    return 'art/env/' + name


def tex_by_name(S, name):
    for o in S.env.objects:
        if o.type.name == 'Texture2D':
            t = o.read()
            if t.m_Name == name:
                return t
    raise LookupError('texture %s not found in loaded bundles' % name)


# ---------------------------------------------------------------- volume hậu kỳ
def volume_component(S, af, ptr):
    o = S.deref(af, ptr)
    if o is None:
        return None, None
    d = o.parse_as_dict()
    sc = S.deref(o.assets_file, d['m_Script'])
    cls = sc.parse_as_dict()['m_ClassName'] if sc else '?'
    out = {'active': bool(d.get('active', 1))}
    for k, v in d.items():
        if isinstance(v, dict) and 'm_OverrideState' in v:
            if not v['m_OverrideState']:
                continue
            val = v.get('m_Value')
            if isinstance(val, dict) and 'r' in val:
                val = col4(val)
            elif isinstance(val, dict) and 'm_PathID' in val:
                t = S.deref(o.assets_file, val)
                val = t.read().m_Name if t is not None else None
                if t is not None:
                    out['_tex_' + k] = t
            elif isinstance(val, float):
                val = r5(val)
            out[k] = val
    return cls, out


def find_volumes(S, M):
    vols = []
    for g in S.G:
        for cn, o in S.scripts(g):
            if cn != 'Volume':
                continue
            d = o.parse_as_dict()
            prof = S.deref(o.assets_file, d['sharedProfile'])
            if prof is None:
                continue
            pd = prof.parse_as_dict()
            comps = {}
            for c in pd.get('components', []):
                cls, vals = volume_component(S, prof.assets_file, c)
                if cls:
                    comps[cls] = vals
            vols.append({'go': g, 'path': S.path(g), 'active': S.active(g) and bool(d.get('m_Enabled', 1)),
                         'global': bool(d['m_IsGlobal']), 'priority': r5(d['priority']),
                         'blendDistance': r5(d['blendDistance']), 'weight': r5(d['weight']),
                         'profile': prof.read().m_Name, 'components': comps,
                         'colliders': WT.collider_volumes(S, M, g) if not d['m_IsGlobal'] else []})
    return vols


# ---------------------------------------------------------------- vật liệu
def material_params(mat_obj):
    mat = mat_obj.read()
    sh = mat.m_Shader.read()
    props = {p.m_Name: p.m_Description for p in sh.m_ParsedForm.m_PropInfo.m_Props}
    sp = mat.m_SavedProperties
    out = {'name': mat.m_Name, 'shader': sh.m_ParsedForm.m_Name}
    for n, v in sp.m_Floats:
        if n in props:
            out[props[n]] = r5(v)
    for n, c in sp.m_Colors:
        if n in props:
            out[props[n]] = [r5(c.r), r5(c.g), r5(c.b), r5(c.a)]
    tex = {}
    for n, e in sp.m_TexEnvs:
        if e.m_Texture.m_PathID:
            try:
                tex[n] = e.m_Texture.read()
            except Exception:
                pass
    return out, tex


def terrain_info(S):
    for g in S.roots:
        if S.name(g) != 'Terrain':
            continue
        for t, pid in S.comps(g):
            if t != 'Terrain':
                continue
            d = S.obj(pid).parse_as_dict()
            mat = S.deref(S.af, d['m_MaterialTemplate'])
            tdo = S.deref(S.af, d['m_TerrainData'])
            td = tdo.parse_as_dict()
            alpha = [S.deref(tdo.assets_file, a) for a in td['m_SplatDatabase']['m_AlphaTextures']]
            return mat, alpha
    raise LookupError('Terrain component not found under the Terrain root')


# ---------------------------------------------------------------- hạt (chim, gió) và đèn biển
def mmc(c):
    """MinMaxCurve -> {state, max, min, curve (max), curveMin} (state 0 hằng, 1 đường cong, 2 hai đường cong, 3 hai hằng)."""
    def keys(cv):
        return [[r5(k['time']), r5(k['value']), r5(k['inSlope']), r5(k['outSlope'])] for k in cv.get('m_Curve', [])]
    out = {'state': c['minMaxState'], 'max': r5(c['scalar']), 'min': r5(c['minScalar'])}
    if c['minMaxState'] in (1, 2):
        out['curve'] = keys(c['maxCurve'])
        if c['minMaxState'] == 2:
            out['curveMin'] = keys(c['minCurve'])
    return out


def mmg(g):
    """MinMaxGradient -> {state, color} hoặc gradient Unity {colors [[t,r,g,b]], alphas [[t,a]]} (giữ giá trị gamma)."""
    def grad(gr):
        nc, na = gr['m_NumColorKeys'], gr['m_NumAlphaKeys']
        return {'mode': gr['m_Mode'],
                'colors': [[r5(gr['ctime%d' % i] / 65535)] + [r5(gr['key%d' % i][c]) for c in 'rgb'] for i in range(nc)],
                'alphas': [[r5(gr['atime%d' % i] / 65535), r5(gr['key%d' % i]['a'])] for i in range(na)]}
    st = g['minMaxState']
    if st == 0:
        return {'state': 0, 'color': col4(g['maxColor'])}
    if st == 2:
        return {'state': 2, 'min': col4(g['minColor']), 'max': col4(g['maxColor'])}
    out = {'state': st, 'gradient': grad(g['maxGradient'])}
    if st == 3:
        out['gradientMin'] = grad(g['minGradient'])
    return out


def mesh_json(M, mo):
    me = M.get(mo)
    pos, nrm, subs = WT.Meshes.three(me, False)
    out = {'name': me['name'], 'pos': [r5(v) for v in pos.reshape(-1)],
           'index': [int(i) for t in subs for i in t.reshape(-1)]}
    if me['uv'] is not None:
        out['uv'] = [r5(v) for v in me['uv'].reshape(-1)]
    if me['col'] is not None:
        out['color'] = [r5(v) for v in me['col'].reshape(-1)]
    return out


def scripts_of(S, names):
    """{tên lớp: [(pid GameObject, ObjectReader)]} cho các MonoBehaviour của scene; một lượt duyệt cho mọi tên."""
    out = {n: [] for n in names}
    for g in S.G:
        for cn, o in S.scripts(g):
            if cn in out:
                out[cn].append((g, o))
    return out


def time_of_day_windows(S, found):
    """TimeOfDayParticles (TimeOfDayParticles.cs:14-41): {pid ParticleSystem: [start, end]} theo phần lẻ của ngày.
    start < end: phát khi start < t < end; start > end: quấn qua nửa đêm, phát khi t > start hoặc t < end."""
    out = {}
    for g, o in found['TimeOfDayParticles']:
        d = o.parse_as_dict()
        ps = S.deref(o.assets_file, d['particles'])
        if ps is not None:
            out[ps.path_id] = [r5(d['particleStartTime']), r5(d['particleEndTime'])]
    return out


def particle_systems(S, M, tod=None):
    """ParticleSystem dùng BirdParticle_Shader (hải âu, đại bàng) và AtmosphericParticles_Shader (vệt gió quanh thuyền).
    tod = time_of_day_windows(): mỗi chim mang thêm `tod` [start, end] (cả 8 bộ phát chim là 0,27–0,6)."""
    tod = tod or {}
    birds, atmos, meshes, mats = [], [], {}, {}
    for g in S.G:
        comps = S.comps(g)
        rr = [pid for t, pid in comps if t == 'ParticleSystemRenderer']
        pp = [pid for t, pid in comps if t == 'ParticleSystem']
        if not rr or not pp or not S.active(g):
            continue
        rd = S.obj(rr[0]).parse_as_dict()
        mo = S.deref(S.af, rd['m_Materials'][0]) if rd['m_Materials'] else None
        if mo is None:
            continue
        mp, mt = material_params(mo)
        kind = 'bird' if 'BirdParticle' in mp['shader'] else 'atmos' if 'AtmosphericParticles' in mp['shader'] else None
        if not kind:
            continue
        d = S.obj(pp[0]).parse_as_dict()
        I, SH, EM = d['InitialModule'], d['ShapeModule'], d['EmissionModule']
        W = S.world(g)
        e = {'name': S.name(g), 'path': S.path(g), 'pos': WT.three_pos(W), 'rotY': r5(WT.rot_y(W)), 'scale': [r5(x) for x in WT.lossy(W)],
             'material': mp['name'], 'lengthInSec': r5(d['lengthInSec']), 'looping': bool(d['looping']), 'prewarm': bool(d['prewarm']),
             'simulationSpace': ['world', 'local', 'custom'][d['moveWithTransform']], 'scalingMode': d['scalingMode'],
             'startLifetime': mmc(I['startLifetime']), 'startSize': mmc(I['startSize']), 'startSpeed': mmc(I['startSpeed']),
             'startColor': mmg(I['startColor']), 'maxParticles': I['maxNumParticles'],
             'shape': {'type': SH['type'], 'radius': r5(SH['radius']['value']), 'donutRadius': r5(SH['donutRadius']),
                       'arc': r5(SH['arc']['value']), 'radiusThickness': r5(SH['radiusThickness']),
                       'position': [r5(SH['m_Position'][k]) for k in 'xyz'], 'rotation': [r5(SH['m_Rotation'][k]) for k in 'xyz']},
             'rate': mmc(EM['rateOverTime']),
             'bursts': [{'time': r5(b['time']), 'count': mmc(b['countCurve']), 'cycles': b['cycleCount'],
                         'interval': r5(b['repeatInterval']), 'probability': r5(b.get('probability', 1))} for b in EM['m_Bursts'][:EM['m_BurstCount']]],
             'renderer': {'mode': rd['m_RenderMode'], 'alignment': rd['m_RenderAlignment'], 'maxParticleSize': r5(rd['m_MaxParticleSize'])}}
        for mod, keys in (('VelocityModule', ('x', 'y', 'z', 'orbitalX', 'orbitalY', 'orbitalZ')), ('SizeModule', ('curve',)),
                          ('NoiseModule', ('strength',)), ('ColorModule', ('gradient',))):
            m = d[mod]
            if not m.get('enabled'):
                continue
            v = {}
            for k in keys:
                v[k] = mmg(m[k]) if k == 'gradient' else mmc(m[k])
            if mod == 'VelocityModule':
                v['inWorldSpace'] = bool(m.get('inWorldSpace'))
            if mod == 'NoiseModule':
                v['frequency'] = r5(m['frequency'])
            e[mod] = v
        T = d['TrailModule']
        if T.get('enabled'):
            e['TrailModule'] = {'lifetime': mmc(T['lifetime']), 'colorOverLifetime': mmg(T['colorOverLifetime']),
                                'widthOverTrail': mmc(T['widthOverTrail']), 'sizeAffectsWidth': bool(T['sizeAffectsWidth']),
                                'inheritParticleColor': bool(T['inheritParticleColor'])}
        if pp[0] in tod:
            e['tod'] = tod[pp[0]]
        if rd['m_RenderMode'] == 4 and rd['m_Mesh']['m_PathID']:
            meo = S.deref(S.af, rd['m_Mesh'])
            if meo is not None:
                mj = mesh_json(M, meo)
                meshes[mj['name']] = mj
                e['mesh'] = mj['name']
        if mp['name'] not in mats:
            entry = {k: v for k, v in mp.items() if k not in ('name',)}
            tx = mt.get('Texture2D_36eaeba2ca7641d8b6955ecaeab2d4cd')
            if tx is not None:
                entry['texture'] = save_tex(tx, 'bird_colours.png', fmt='png')
            mats[mp['name']] = entry
        (birds if kind == 'bird' else atmos).append(e)
    birds.sort(key=lambda e: e['path'])
    atmos.sort(key=lambda e: e['path'])
    return birds, atmos, meshes, mats


def lighthouse(S):
    """Đèn biển Greater Marrow: ConstantlyRotateOnY quay LighthouseBeam; các tấm Quad dùng LightBeam_Shader."""
    out = []
    for g in S.G:
        scs = dict(S.scripts(g))
        if 'ConstantlyRotateOnY' not in scs or S.name(g) != 'LighthouseBeam' or not S.active(g):
            continue
        rot = scs['ConstantlyRotateOnY'].parse_as_dict()
        Wp = S.world(g)
        inv = np.linalg.inv(Wp)
        root = S.parent(g)
        ds = dict(S.scripts(root)).get('DistanceScaler') if root else None
        Wr = S.world(root) if root else np.eye(4)
        e = {'path': S.path(g), 'pivot': WT.three_pos(Wp), 'pivotRotY': r5(WT.rot_y(Wp)),
             # ma trận Unity (hàng trước): gốc Lighthouse (DistanceScaler co giãn nó) và trục quay so với gốc
             'rootMatrix': [r5(x) for x in Wr.reshape(-1)], 'pivotLocal': [r5(x) for x in (np.linalg.inv(Wr) @ Wp).reshape(-1)],
             'rotateSpeed': r5(rot.get('rotateSpeed', 0)), 'counterClockwise': bool(rot.get('counterClockwise', 0)),
             'rootPos': WT.three_pos(S.world(root)) if root else None,
             'distanceScale': r5(ds.parse_as_dict().get('scale', 0)) if ds else 0, 'quads': []}
        for c in S.walk(g):
            if not S.active(c):
                continue
            for t, pid in S.comps(c):
                if t != 'MeshRenderer':
                    continue
                rd = S.obj(pid).parse_as_dict()
                mo = S.deref(S.af, rd['m_Materials'][0])
                mp, mt = material_params(mo)
                if 'LightBeam' not in mp['shader']:
                    continue
                L = inv @ S.world(c)  # ma trận Unity so với trục quay; JS đổi sang three.js
                tx = mt.get('Texture2D_7ED7D5F2')
                e['quads'].append({'name': S.name(c), 'local': [r5(x) for x in L.reshape(-1)],
                                   'opacity': mp.get('Opacity'), 'color': mp.get('Color'), 'fade': mp.get('FadeSmoothness'),
                                   'texture': save_tex(tx, 'beam_%s.webp' % tx.m_Name.lower(), 256) if tx is not None else None})
        out.append(e)
    return out


def weather_system(S, M, found, cfg):
    """Hằng số của WeatherController / Lightning / WeatherTrigger mà js/sky.js cần ngoài data/weather.js.
      - transitionDurationSec: trường scene của Logic/WeatherController (15 s). timeBetweenZoneChecks = 5 s là hằng
        private trong mã (WeatherController.cs:127), không serialize.
      - Lightning (FollowPlayer/Lightning): minRange, maxRange, thunderDelay (Lightning.cs:75, :98).
      - WeatherTrigger (WeatherTrigger.cs:17-32): vị trí + cầu trigger. Vật chủ nằm dưới SceneTimeResponder với
        onWhenNight thì chỉ bật ban đêm (SceneTimeResponder.cs:14-19): `nightOnly`. Vật chủ bị tắt ở tổ tiên không phải
        SceneTimeResponder thì không bao giờ chạy: bỏ."""
    W = cfg['logic']['WeatherController'][0]['fields']
    toggles = {}
    for g, o in found['SceneTimeResponder']:
        d = o.parse_as_dict()
        tgt = S.deref(o.assets_file, d['objectToToggle'])
        if tgt is not None:
            toggles[tgt.path_id] = bool(d['onWhenNight'])
    triggers = []
    for g, o in found['WeatherTrigger']:
        d = o.parse_as_dict()
        wd = S.deref(o.assets_file, d['weather'])
        chain, p = [], g
        while p:
            chain.append(p)
            p = S.parent(p)
        if any(c not in toggles and not S.G[c]['m_IsActive'] for c in chain):
            continue
        gated = [toggles[c] for c in chain if c in toggles]
        if gated and not all(gated):
            continue  # SceneTimeResponder không bao giờ bật nó
        cv = [c for c in WT.collider_volumes(S, M, g) if c.get('trigger') and c['shape'] == 'sphere']
        if wd is None or not cv:
            raise LookupError('WeatherTrigger %s has no WeatherData or no sphere trigger' % S.path(g))
        c = cv[0]
        Wm = S.world(g)
        ctr = Wm @ np.array([c['center'][0], c['center'][1], -c['center'][2], 1.0])
        triggers.append({'path': S.path(g), 'weather': wd.parse_as_dict()['m_Name'], 'cooldownDays': r5(d['cooldownDays']),
                         'chance': r5(d['chance']), 'nightOnly': bool(gated),
                         'pos': [r5(ctr[0]), r5(ctr[1]), r5(-ctr[2])], 'radius': r5(c['radius'] * max(c['scale']))})
    triggers.sort(key=lambda t: t['path'])
    lg = found['Lightning']
    if len(lg) != 1:
        raise LookupError('expected one Lightning component in the scene, found %d' % len(lg))
    ld = lg[0][1].parse_as_dict()
    return {'note': 'WeatherController.cs:295-449 (15 s lerp, 5 s zone check), Lightning.cs:47-101, WeatherTrigger.cs:17-32',
            'transitionSec': r5(W['transitionDurationSec']), 'zoneCheckSec': 5.0,
            'lightning': {'minRange': r5(ld['minRange']), 'maxRange': r5(ld['maxRange']), 'thunderDelay': r5(ld['thunderDelay'])},
            'triggers': triggers}


# ---------------------------------------------------------------- rã DXBC (tuỳ chọn)
def disassemble(S, outdir, names):
    from UnityPy.export.ShaderConverter import ShaderProgram
    from UnityPy.helpers import CompressionHelper
    from UnityPy.streams import EndianBinaryReader
    d3d = ctypes.WinDLL('D3DCompiler_47.dll')

    def dis(code):
        i = code.find(b'DXBC')
        if i < 0:
            return ''
        code = code[i:]
        out = ctypes.c_void_p()
        if d3d.D3DDisassemble(ctypes.c_char_p(code), ctypes.c_size_t(len(code)), 0, None, ctypes.byref(out)):
            return 'D3DDisassemble failed'
        vt = ctypes.cast(out, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        p = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vt[3])(out)
        n = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vt[4])(out)
        return ctypes.string_at(p, n).decode('latin1').replace('\x00', '')
    os.makedirs(outdir, exist_ok=True)
    done = set()
    for o in S.env.objects:
        if o.type.name != 'Shader':
            continue
        s = o.read()
        nm = s.m_ParsedForm.m_Name
        if nm.split('/')[-1] not in names or nm in done:
            continue
        done.add(nm)
        blob = bytes(s.compressedBlob)
        g = lambda a: a[0][0] if isinstance(a[0], list) else a[0]
        raw = CompressionHelper.decompress_lz4(blob[g(s.offsets):g(s.offsets) + g(s.compressedLengths)],
                                               g(s.decompressedLengths))
        prog = ShaderProgram(EndianBinaryReader(raw, endian='<'), s.object_reader.version)
        ps = s.m_ParsedForm.m_SubShaders[0].m_Passes[0]
        parts = []
        for kind, pr in (('vertex', ps.progVertex), ('fragment', ps.progFragment)):
            subs = sorted(((list(prog.m_SubPrograms[sp.m_BlobIndex].m_Keywords), sp.m_BlobIndex)
                           for sp in pr.m_SubPrograms), key=lambda x: (len(x[0]), x[0]))
            for kws, bi in subs[:6]:
                parts.append('// ==== %s %s keywords=%s\n%s' % (nm, kind, kws,
                                                                  dis(bytes(prog.m_SubPrograms[bi].m_ProgramCode))))
        fn = os.path.join(outdir, nm.split('/')[-1] + '.txt')
        with open(fn, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(parts))
        log('dis', fn)


# ---------------------------------------------------------------- chính
def main():
    t0 = WT.time.time()
    with open(os.path.join(WORLD, 'scene_config.json'), encoding='utf-8') as fh:
        cfg = json.loads(fh.read().replace('-Infinity', '-1e30').replace('Infinity', '1e30').replace('NaN', '0'))
    with open(os.path.join(WORLD, 'markers.json'), encoding='utf-8') as fh:
        markers = json.load(fh)
    S = WT.Scene(WT.load_env())
    M = WT.Meshes()
    log('scene loaded: %d GameObjects' % len(S.G))
    if '--dis' in sys.argv:
        disassemble(S, sys.argv[sys.argv.index('--dis') + 1],
                    {'Lit_Shader', 'LitTriplanar_Shader', 'Foliage_Shader', 'LitYBillboard_Shader', 'TerrainShader',
                     'Sky_Shader', 'LightBeam_Shader', 'AtmosphericParticles_Shader', 'FloatingParticle_Shader',
                     'BirdParticle_Shader', 'RavenParticle_Shader', 'UnderwaterObject_Shader',
                     'GaleCliffsWaterfall_Shader', 'Water_Shader'})

    L = cfg['logic']
    TC, FC = L['TimeController'][0]['fields'], L['FogController'][0]['fields']
    WC = L['WeatherController'][0]['fields']
    env = {
        'source': 'DREDGE 1.5.3: Game.unity (TimeController, FogController, WeatherController, Volume), '
                  'GameSceneProfile_0, Skybox_Mat, Terrain_Mat, DXBC Lit/LitTriplanar/Foliage/Sky/Terrain',
        'time': {k: TC[k] for k in ('sunColour', 'ambientLightColor', 'sceneLights', 'lightAngleMin', 'dawnTime',
                                    'duskTime', 'cloudLightEnableThreshold')},
        'light': {'intensity': cfg['directionalLight']['intensity'],
                  'shadowDistance': 70, 'shadowResolution': 1024},  # UniversalRP-HighQuality.asset
        'fog': {'densityOverDay': FC['defaultFogDensityOverDay'], 'colorOverDay': FC['defaultFogColorOverDay'],
                'height': FC['defaultFogHeight']},
        # Hằng số rã từ DXBC (Lit_Shader pass UniversalForward, giống hệt ở LitTriplanar/Foliage/Atmospheric):
        #   far = 350 + _FogDensity·337·(_FogRemove − 1);  f = (1 − cos(π·sat(d/far)))/2 · waveMask.b · max(0, 1 − 3·|ΣđènPhụ|)
        #   f = max(f − sat(y/_FogHeight), min(d/350, 1)); d = khoảng cách tới _FogCenter (= vị trí thuyền)
        #   màu = lerp(fog, lerp(fog, (0,752941; 0,235294; 0), 0,5), sat(dot(V, −L))² · max(0, 1 − |L.y| + min(2L.y, 0)))
        'fogShader': {'far': 350.0, 'densityK': 337.0, 'linearFar': 350.0, 'glow': [0.752941, 0.235294, 0.0],
                      'lightClearK': 3.0, 'remove': 0.0},
        # mây che nắng: tex(xz·0,003 + (_WindSpeed·0,05·_GameTime, 0)).r, sáng khi > _Cloudiness − 0,15 (mềm 0,15)
        'cloudShadow': {'scale': 0.003, 'windK': 0.05, 'soft': 0.15},
        'flicker': {'speed': 0.1},
        'wind': WC['_wind'],
        'weatherFallback': 'Fine',
    }

    # ---- texture dùng chung của Lit_Shader (mây che nắng, gradient nhấp nháy)
    os.makedirs(OUT_ART, exist_ok=True)
    log('textures')
    lit_mat = None
    for o in S.env.objects:
        if o.type.name == 'Material':
            m = o.read()
            if m.m_Name == 'GreaterMarrowBuildings_Material':
                lit_mat = o
                break
    lp, lt = material_params(lit_mat)
    env['textures'] = {
        'cloudShadow': save_tex(lt['_SampleTexture2D_9698af05d8cf4dae9cb12534835649ea_Texture_1'], 'cloud_shadow.webp'),
        'flicker': save_tex(lt['Texture2D_d75ba12263b343d3ad393c05a6dda1b7'], 'flicker.png', fmt='png'),
    }

    # ---- trời (Skybox_Mat, Sky_Shader)
    sky = cfg['renderSettings']['skyboxMaterial']
    C, F = sky['colors'], sky['floats']
    env['sky'] = {
        'skyColor': C['Color_E54291A1'], 'sunRadius': F['Vector1_347E43C'], 'sunIntensity': F['Vector1_A5B9DEDE'],
        'cloudFarTiling': F['Vector1_2813a68e46ef4f3692c8c80f67904331'],
        'textures': {
            'rgb': save_tex(tex_by_name(S, sky['textures']['Texture2D_3a06adad5c21431dbe7edb77f8100819']), 'sky_rgb.webp', 512),
            'warp': save_tex(tex_by_name(S, sky['textures']['Texture2D_9b6b592974bc499f892052f19645cabe']), 'sky_warp.webp', 128),
            'aurora': save_tex(tex_by_name(S, sky['textures']['Texture2D_f9a89aabb02a418092f5d9d018ec0c5f']), 'sky_aurora.webp'),
        },
    }

    # ---- đáy biển (Terrain_Mat, TerrainShader; splat = TerrainData.m_AlphaTextures[0])
    tmat, alphas = terrain_info(S)
    tp, tt = material_params(tmat)
    splat = alphas[0].read()
    env['terrain'] = {
        'material': {k: tp[k] for k in ('SandColour', 'AlgaeColour', 'RockColour', 'MagmaColour', 'TextureTiling')},
        'noise': save_tex(tt['Texture2D_494fdc27d75842baa0385cc9835255b2'], 'terrain_noise.webp', 256),
        # ảnh xoay đúng chiều nhìn (hàng trên = v 1); three.js flipY = true thì v 0 ở đáy như Unity
        'splat': save_tex(splat, 'terrain_splat.webp', 512),
        'uv': 'u = (x + 750)/1500, v = (−z + 750)/1500 (three.js x, z; Terrain gốc ở Unity (−750, −750), cỡ 1500)',
    }

    # ---- hậu kỳ
    log('volumes')
    vols = find_volumes(S, M)
    post = {'volumes': []}
    for v in vols:
        comps = v['components']
        for k, c in comps.items():
            for kk in [x for x in c if x.startswith('_tex_')]:
                t = c.pop(kk)
                if k == 'ColorLookup':
                    c['texturePath'] = save_tex(t.read(), 'lut%s.png' % ('' if v['global'] else '_' + v['profile']), fmt='png')
        e = {k: v[k] for k in ('path', 'active', 'global', 'priority', 'blendDistance', 'weight', 'profile', 'components')}
        if v['colliders']:
            e['colliders'] = v['colliders']
        post['volumes'].append(e)
        log('  volume %-40s global=%s profile=%s %s' % (v['path'], v['global'], v['profile'], list(comps)))
    pp = cfg['sanityRelated']['SanityChromaticAberration'][0]['fields']
    post['sanityChromaticCurve'] = pp['_chromaticAberrationCurve']
    post['note'] = ('URP ColorGradingMode = LDR (UniversalRP-HighQuality.asset): Bloom trên HDR, rồi LUT người dùng tra trong '
                    'không gian sRGB (UberPost), rồi LUT nội bộ (ColorAdjustments: colorFilter tuyến tính, contrast trong LogC '
                    'quanh 0,4135884, hueShift). Scatter thật = lerp(0,05; 0,95; scatter).')
    env['post'] = post

    log('particles / lighthouse / weather')
    found = scripts_of(S, ('TimeOfDayParticles', 'SceneTimeResponder', 'WeatherTrigger', 'Lightning'))
    birds, atmos, meshes, mats = particle_systems(S, M, time_of_day_windows(S, found))
    env['particles'] = {
        'note': 'ParticleSystem gốc (Game.unity). Chim: Mesh render, căn theo vận tốc (alignment 4), vỗ cánh trong BirdParticle_Shader: '
                'y += sin((t − R·G)·A·FlapSpeed)·B·FlapAmount·R với RGBA = màu đỉnh × màu hạt (ColorModule.b bật/tắt vỗ cánh); '
                'màu = MainTex × ambient.b, không sương. Gió: AtmosphericParticles theo thuyền, chỉ thấy vệt Trail.',
        'birds': birds, 'atmospheric': atmos, 'meshes': meshes, 'materials': mats}
    log('  %d bird emitters, %d atmospheric, meshes %s' % (len(birds), len(atmos), list(meshes)))
    env['lighthouse'] = lighthouse(S)
    log('  %d lighthouse beams' % len(env['lighthouse']))
    env['weather'] = weather_system(S, M, found, cfg)
    log('  weather: %d triggers %s, lightning %s' % (len(env['weather']['triggers']),
        [(t['weather'], t['nightOnly']) for t in env['weather']['triggers']], env['weather']['lightning']))

    with open(OUT_JS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Generated by games/dredge/tools/env.py from Game.unity (AssetRipper/UnityPy). Do not edit.\n')
        fh.write('window.DR_ENV = ')
        json.dump(env, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    log('wrote data/env.js %.1f KB in %.0f s' % (os.path.getsize(OUT_JS) / 1024, WT.time.time() - t0))


if __name__ == '__main__':
    main()
