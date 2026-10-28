"""Particle systems of the customization trails, read from the APK bundles, for js/trailfx.js.

    py -3 -I build_trails.py [name ...]          (default: every trail; needs D:/stickman-hook-ref/tools/shenv.py)
    py -3 -I build_trails.py --show fire          print the modules read, write nothing

Each trail bundle `defaultlocalgroup_assets_customization_trails_<name>_ingame_*` holds one prefab:
    Prefab / Renderer (TrailRenderer, order -5) / BaseFollow (PS) / BaseFollow/{BaseSmoke, BaseShine, BaseFall} (PS)
PlayerController.DisplayTrail [asm 0x1206c14..0x1206d3c] instantiates it at the player's position as a child of the
player transform (cachedTransform, scale 0.3), from SpawnPlayer [asm 0x1206988]; DestroyTrailIfExists [asm 0x1206894]
runs first, so every spawn starts with no particles.

A system is kept when its GameObject is active in the hierarchy, its renderer is enabled and it emits (rate over time,
rate over distance or a burst with a count). Trails left with no system get no file (js/main.js TRAIL_NO_FX).

Writes ../data/trailfx/<name>.json and ../art/trailfx/<name>.webp (cells of every texture used, one atlas per trail):
  {v, name, line, img, cells: [[x,y,w,h]], systems: [system]}
  line: the TrailRenderer is drawn (its GameObject active and the renderer enabled)
  system: {name, order, blend: alpha|add|screen, tint: [r,g,b] (material colour factor), gain (material alpha factor),
           dur, delay, max, scaling: 'h' (Hierarchy: x lossy scale 0.3) | 'l' (Local: x 1),
           life, speed, size, rot, grav: MinMax; color: MinMaxGradient,
           rate: {t, d}: MinMax per second / per unit moved, bursts: [[time, count, cycles, interval, probability]],
           shape: null | {t: 'sphere'|'cone', r, th, ang}, inherit, vol: {x, y}, limit: {m, d}, noise: {s, f, sc},
           sol, rol: MinMax over the particle's life; col: MinMaxGradient over life,
           uv: null | {fot, sf: MinMax, cyc}, cells: [cell index...], aspect: [w/h per cell] (sprite mode),
           mode: 0 billboard | 1 stretched, pivot: [x, y], len, vel, maxSize}
  MinMax: number | {r: [a, b]} | {c: [33 samples over 0..1]} | {c, d} (random between two curves)
  MinMaxGradient: [r,g,b,a] | {r: [c0, c1]} | {g: G} | {g: G, h: G} (random between two) | {rc: G} (random colour)
  G: {m: 0 blend | 1 fixed, c: [[t, r, g, b]...], a: [[t, a]...]}
"""
import sys, os, io, json, math
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *  # noqa: F401,F403  (AND, load_with_deps, resolve, sfs)
from shenv import _sfs
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); GAME = os.path.dirname(HERE)
PRE = 'defaultlocalgroup_assets_customization_trails_'
CELL_MAX = 96          # [ĐỀ XUẤT] largest cell side in px: the biggest particle is ~1.8 units, ~240 px at zoom 5 on 1334 px
SAMPLES = 32

args = [a for a in sys.argv[1:] if not a.startswith('--')]
SHOW = '--show' in sys.argv


def r4(x): return round(float(x), 4)


# ---------- AnimationCurve / MinMaxCurve / Gradient ----------
def hermite(keys, t):
    if not keys: return 0.0
    if t <= keys[0]['time']: return keys[0]['value']
    if t >= keys[-1]['time']: return keys[-1]['value']
    for a, b in zip(keys, keys[1:]):
        if a['time'] <= t <= b['time']:
            dt = b['time'] - a['time']
            if dt <= 0: return b['value']
            m0, m1 = a['outSlope'], b['inSlope']
            if math.isinf(m0) or math.isinf(m1): return a['value']  # constant (stepped) key
            s = (t - a['time']) / dt
            h00 = 2 * s ** 3 - 3 * s ** 2 + 1; h10 = s ** 3 - 2 * s ** 2 + s
            h01 = -2 * s ** 3 + 3 * s ** 2; h11 = s ** 3 - s ** 2
            return h00 * a['value'] + h10 * m0 * dt + h01 * b['value'] + h11 * m1 * dt
    return keys[-1]['value']


def sample(curve, scalar):
    keys = curve['m_Curve']
    return [r4(hermite(keys, i / SAMPLES) * scalar) for i in range(SAMPLES + 1)]


def mm(c):
    s = c['minMaxState']
    if s == 0: return r4(c['scalar'])
    if s == 3: return {'r': [r4(c['minScalar']), r4(c['scalar'])]}
    if s == 1: return {'c': sample(c['maxCurve'], c['scalar'])}
    if s == 2: return {'c': sample(c['minCurve'], c['scalar']), 'd': sample(c['maxCurve'], c['scalar'])}
    raise ValueError('MinMaxCurve state %s' % s)


def mm_zero(v):
    if isinstance(v, (int, float)): return v == 0
    if 'r' in v: return v['r'][0] == 0 and v['r'][1] == 0
    return all(x == 0 for x in v['c'] + v.get('d', []))


def rgba(c): return [r4(c['r']), r4(c['g']), r4(c['b']), r4(c['a'])]


def grad(g):
    return {'m': g.get('m_Mode', 0),
            'c': [[r4(g['ctime%d' % i] / 65535)] + rgba(g['key%d' % i])[:3] for i in range(g['m_NumColorKeys'])],
            'a': [[r4(g['atime%d' % i] / 65535), r4(g['key%d' % i]['a'])] for i in range(g['m_NumAlphaKeys'])]}


def mmg(c):
    s = c['minMaxState']
    if s == 0: return rgba(c['maxColor'])
    if s == 1: return {'g': grad(c['maxGradient'])}
    if s == 2: return {'r': [rgba(c['minColor']), rgba(c['maxColor'])]}
    if s == 3: return {'g': grad(c['minGradient']), 'h': grad(c['maxGradient'])}
    if s == 4: return {'rc': grad(c['maxGradient'])}
    raise ValueError('MinMaxGradient state %s' % s)


# ---------- materials -> canvas blending ----------
# Mobile/Particles/Alpha Blended: tex * colour, SrcAlpha OneMinusSrcAlpha
# Legacy Shaders/Particles/Alpha Blended: 2 * colour * _TintColor * tex, SrcAlpha OneMinusSrcAlpha
# Legacy Shaders/Particles/Additive: 2 * colour * _TintColor * tex, SrcAlpha One -> 'lighter', alpha x 2 tint.a
#   (2 tint.rgb x colour.rgb x tex.rgb x 2 tint.a x colour.a x tex.a: the rgb factor goes into `tint`, the 2s into `gain`)
# Legacy Shaders/Particles/Additive (Soft): colour * tex, premultiplied, One OneMinusSrcColor -> 'screen'
#   (dst + src.a src.rgb (1 - dst) is the canvas 'screen' composite over an opaque backdrop); no _TintColor
# UI/Additive: tex * colour, SrcAlpha One -> 'lighter'
def material(m):
    sh = m['shader'] or ''
    cols = dict((k, v) for k, v in (m['colors'] or []))
    tc = cols.get('_TintColor', {'r': 0.5, 'g': 0.5, 'b': 0.5, 'a': 0.5})
    if sh == 'Mobile/Particles/Alpha Blended': return 'alpha', [1, 1, 1], 1
    if sh == 'Legacy Shaders/Particles/Alpha Blended':
        return 'alpha', [r4(2 * tc['r']), r4(2 * tc['g']), r4(2 * tc['b'])], r4(2 * tc['a'])
    if sh == 'Legacy Shaders/Particles/Additive':
        return 'add', [r4(tc['r']), r4(tc['g']), r4(tc['b'])], r4(4 * tc['a'])
    if sh == 'Legacy Shaders/Particles/Additive (Soft)': return 'screen', [1, 1, 1], 1
    if sh == 'UI/Additive': return 'add', [1, 1, 1], 1
    raise ValueError('shader %s' % sh)


# ---------- prefab walk ----------
def read_tree(sf, go, active_parent=True):
    g = go.read_typetree()
    node = {'name': g['m_Name'], 'active': active_parent and bool(g.get('m_IsActive')), 'comps': {}, 'children': []}
    tr = None
    for c in g['m_Component']:
        co = resolve(sf, c['component'])
        if co is None: continue
        tn = co.type.name
        if tn not in ('Transform', 'ParticleSystem', 'ParticleSystemRenderer', 'TrailRenderer'): continue
        ct = co.read_typetree()
        if tn == 'Transform': tr = ct
        if tn in ('ParticleSystemRenderer', 'TrailRenderer'):
            mats = []
            for mref in ct.get('m_Materials', []):
                mo = resolve(co.assets_file, mref)
                if not mo: mats.append(None); continue
                mt = mo.read_typetree()
                tex = None
                for tk, tv in mt.get('m_SavedProperties', {}).get('m_TexEnvs', []):
                    if tk == '_MainTex':
                        tex = resolve(mo.assets_file, tv['m_Texture'])
                sho = resolve(mo.assets_file, mt['m_Shader'])
                shn = None
                if sho:
                    try: shn = sho.read().m_ParsedForm.m_Name
                    except Exception: shn = None
                mats.append({'name': mt['m_Name'], 'pid': mo.path_id, 'shader': shn, 'tex': tex,
                             'colors': mt.get('m_SavedProperties', {}).get('m_Colors')})
            ct['_mats'] = mats
        if tn == 'ParticleSystem':
            ct['_pid'] = co.path_id
            sp = []
            for s in ct.get('UVModule', {}).get('sprites', []) or []:
                so = resolve(co.assets_file, s['sprite']) if s['sprite']['m_PathID'] else None
                sp.append(so)
            ct['_sprites'] = sp
        node['comps'][tn] = ct
    if tr:
        node['pos'] = [tr['m_LocalPosition']['x'], tr['m_LocalPosition']['y']]
        for ch in tr['m_Children']:
            cto = resolve(sf, ch)
            if cto is None: continue
            cg = resolve(cto.assets_file, cto.read_typetree()['m_GameObject'])
            if cg: node['children'].append(read_tree(cto.assets_file, cg, node['active']))
    return node


def prefab(bundle):
    env = load_with_deps(bundle)
    own = next(f for k, f in env.files.items() if os.path.basename(k) == bundle)
    for sf in _sfs(own):
        for o in sf.objects.values():
            if o.type.name != 'Transform': continue
            t = o.read_typetree()
            if t['m_Father']['m_PathID'] == 0:
                return read_tree(sf, resolve(sf, t['m_GameObject']))
    raise ValueError('no prefab root in ' + bundle)


def walk(n, path='', off=(0.0, 0.0)):
    path = path + '/' + n['name']
    yield path, n, off
    for ch in n['children']:
        # the root's own position is replaced by Instantiate(prefab, player position, ...): offsets start at its children
        yield from walk(ch, path, (off[0] + ch['pos'][0], off[1] + ch['pos'][1]))


# ---------- one particle system ----------
def emits(ps):
    E = ps['EmissionModule']
    if not E['enabled']: return False
    rt, rd = mm(E['rateOverTime']), mm(E['rateOverDistance'])
    bursts = [b for b in E['m_Bursts'][:E['m_BurstCount']] if not mm_zero(mm(b['countCurve']))]
    return not (mm_zero(rt) and mm_zero(rd)) or bool(bursts)


def system(path, node, off, warn):
    ps, rd = node['comps']['ParticleSystem'], node['comps']['ParticleSystemRenderer']
    I, E, S = ps['InitialModule'], ps['EmissionModule'], ps['ShapeModule']
    if ps['moveWithTransform'] != 1: warn.append('%s: simulation space %s' % (path, ps['moveWithTransform']))
    mat = next(m for m in rd['_mats'] if m)
    blend, tint, gain = material(mat)
    d = {'name': node['name'], 'pid': ps['_pid'], 'order': rd['m_SortingOrder'], 'blend': blend, 'tint': tint, 'gain': gain,
         'dur': r4(ps['lengthInSec']), 'delay': mm(ps['startDelay']), 'max': I['maxNumParticles'],
         'scaling': 'h' if ps['scalingMode'] == 0 else 'l',
         'life': mm(I['startLifetime']), 'speed': mm(I['startSpeed']), 'size': mm(I['startSize']),
         'rot': mm(I['startRotation']), 'grav': mm(I['gravityModifier']), 'color': mmg(I['startColor']),
         'rate': {'t': mm(E['rateOverTime']), 'd': mm(E['rateOverDistance'])},
         'bursts': [[r4(b['time']), mm(b['countCurve']), b['cycleCount'], r4(b['repeatInterval']), r4(b.get('probability', 1))]
                    for b in E['m_Bursts'][:E['m_BurstCount']] if not mm_zero(mm(b['countCurve']))],
         'off': [r4(off[0]), r4(off[1])]}
    if ps['scalingMode'] == 2: warn.append('%s: scaling mode Shape' % path)
    if I.get('size3D'): warn.append('%s: 3D start size ignored' % path)
    if I.get('rotation3D') and not (mm_zero(mm(I['startRotationX'])) and mm_zero(mm(I['startRotationY']))):
        warn.append('%s: 3D start rotation ignored' % path)
    d['shape'] = None
    if S['enabled']:
        if S['type'] not in (0, 4): warn.append('%s: shape type %s' % (path, S['type']))
        if S['arc']['value'] != 360: warn.append('%s: arc %s' % (path, S['arc']['value']))
        for k in ('m_Position', 'm_Rotation'):
            if any(abs(v) > 1e-6 for v in S[k].values()): warn.append('%s: shape %s %s' % (path, k, S[k]))
        if any(abs(v - 1) > 1e-6 for v in S['m_Scale'].values()): warn.append('%s: shape scale %s' % (path, S['m_Scale']))
        if S['randomDirectionAmount'] or S['sphericalDirectionAmount'] or S['randomPositionAmount']:
            warn.append('%s: shape randomisation' % path)
        d['shape'] = {'t': 'sphere' if S['type'] == 0 else 'cone', 'r': r4(S['radius']['value']), 'th': r4(S['radiusThickness']),
                      'ang': r4(math.radians(S['angle']))}
    iv = ps['InheritVelocityModule']
    d['inherit'] = mm(iv['m_Curve']) if iv['enabled'] else None
    if iv['enabled'] and iv['m_Mode'] != 0: warn.append('%s: inherit velocity mode %s' % (path, iv['m_Mode']))
    v = ps['VelocityModule']
    d['vol'] = None
    if v['enabled']:
        x, y = mm(v['x']), mm(v['y'])
        for k in ('orbitalX', 'orbitalY', 'orbitalZ', 'radial'):
            if not mm_zero(mm(v[k])): warn.append('%s: velocity %s' % (path, k))
        if not (mm_zero(x) and mm_zero(y)): d['vol'] = {'x': x, 'y': y}
    c = ps['ClampVelocityModule']
    d['limit'] = None
    if c['enabled']:
        if c['separateAxis']: warn.append('%s: limit velocity per axis' % path)
        if not mm_zero(mm(c['drag'])): warn.append('%s: limit velocity drag' % path)
        d['limit'] = {'m': mm(c['magnitude']), 'd': r4(c['dampen'])}
    nz = ps['NoiseModule']
    d['noise'] = None
    if nz['enabled']:
        if nz['separateAxes']: warn.append('%s: noise per axis' % path)
        d['noise'] = {'s': mm(nz['strength']), 'f': r4(nz['frequency']), 'sc': mm(nz['scrollSpeed']), 'damp': bool(nz['damping'])}
    sm = ps['SizeModule']
    d['sol'] = mm(sm['curve']) if sm['enabled'] else None
    if sm['enabled'] and sm['separateAxes']: warn.append('%s: size per axis' % path)
    rm = ps['RotationModule']
    d['rol'] = mm(rm['curve']) if rm['enabled'] else None
    cm = ps['ColorModule']
    d['col'] = mmg(cm['gradient']) if cm['enabled'] else None
    uv = ps['UVModule']
    d['uv'] = None
    if uv['enabled']:
        if uv['animationType'] != 0: warn.append('%s: texture sheet animation type %s' % (path, uv['animationType']))
        if uv.get('timeMode', 0) != 0: warn.append('%s: texture sheet time mode %s' % (path, uv['timeMode']))
        d['uv'] = {'fot': mm(uv['frameOverTime']), 'sf': mm(uv['startFrame']), 'cyc': r4(uv['cycles'])}
    for k in ('ForceModule', 'SizeBySpeedModule', 'RotationBySpeedModule', 'ColorBySpeedModule',
              'LifetimeByEmitterSpeedModule', 'TrailModule', 'LightsModule', 'TriggerModule'):
        if ps[k]['enabled']: warn.append('%s: %s ignored' % (path, k))
    # CollisionModule (type World, 3D): a 2D game has no 3D colliders; ExternalForcesModule: no wind zones or force fields
    # in the game scenes; SubModule: no sub emitters listed
    d['mode'] = rd['m_RenderMode']
    if d['mode'] not in (0, 1): warn.append('%s: render mode %s' % (path, d['mode']))
    d['pivot'] = [r4(rd['m_Pivot']['x']), r4(rd['m_Pivot']['y'])]
    d['len'] = r4(rd['m_LengthScale']); d['vel'] = r4(rd['m_VelocityScale'])
    d['maxSize'] = r4(rd['m_MaxParticleSize'])
    # texture cells
    tex = mat['tex']
    if uv['enabled'] and uv['mode'] == 1:
        cells = [('sprite', so.path_id, so) for so in ps['_sprites'] if so]
    elif uv['enabled']:
        cells = [('grid', tex.path_id, tex, uv['tilesX'], uv['tilesY'], i) for i in range(uv['tilesX'] * uv['tilesY'])]
    else:
        cells = [('grid', tex.path_id, tex, 1, 1, 0)]
    d['_cells'] = cells
    d['_tex'] = (mat['name'], mat['shader'], tex.read().m_Name if tex else None)
    return d


def can_move(d):
    """a stretched billboard is drawn along its velocity: with none it has no length"""
    return not (mm_zero(d['speed']) and mm_zero(d['grav']) and not d['inherit'] and not d['vol'] and not d['noise'])


def cell_image(c, cache):
    key = c[:2] + c[3:] if c[0] == 'grid' else c[:2]
    if key in cache: return cache[key]
    if c[0] == 'sprite':
        im = c[2].read().image.convert('RGBA')
    else:
        _, _, tex, tx, ty, i = c
        full = cache.setdefault(('tex', c[1]), tex.read().image.convert('RGBA'))
        w, h = full.width / tx, full.height / ty
        col, row = i % tx, i // tx  # Unity sheets start at the top left
        im = full.crop((round(col * w), round(row * h), round((col + 1) * w), round((row + 1) * h)))
    k = min(1.0, CELL_MAX / max(im.width, im.height))
    if k < 1: im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    cache[key] = im
    return im


def build(name, bundle):
    root = prefab(bundle)
    warn, systems, line = [], [], False
    for path, n, off in walk(root):
        tr = n['comps'].get('TrailRenderer')
        if tr: line = n['active'] and bool(tr['m_Enabled']) and bool(tr.get('m_Emitting', 1))
        ps = n['comps'].get('ParticleSystem')
        if not ps: continue
        why = None
        if not n['active']: why = 'inactive'
        elif not n['comps']['ParticleSystemRenderer']['m_Enabled']: why = 'renderer off'
        elif not emits(ps): why = 'emits nothing'
        if why:
            if SHOW: print('  skip', path, why)
            continue
        d = system(path, n, off, warn)
        if d['mode'] == 1 and not can_move(d):
            if SHOW: print('  skip', path, 'stretched billboard that never moves')
            continue
        systems.append(d)
    for w in warn: print('  WARN', name, w)
    return line, systems


def pack(images):
    """shelf pack with a 2 px gap; returns rects and the sheet size"""
    W = 512
    x = y = shelf = 0; rects = [None] * len(images)
    for i in sorted(range(len(images)), key=lambda i: -images[i].height):
        im = images[i]
        if x + im.width > W: x = 0; y += shelf + 2; shelf = 0
        rects[i] = (x, y, im.width, im.height); x += im.width + 2; shelf = max(shelf, im.height)
    return rects, W, y + shelf


bundles = sorted(b for b in os.listdir(AND) if b.startswith(PRE) and '_ingame_' in b)
names = {b[len(PRE):].split('_ingame_')[0]: b for b in bundles}
todo = args or sorted(names)
os.makedirs(os.path.join(GAME, 'data/trailfx'), exist_ok=True)
os.makedirs(os.path.join(GAME, 'art/trailfx'), exist_ok=True)
none = []
for name in todo:
    line, systems = build(name, names[name])
    if SHOW:
        print('==', name, 'line', line)
        for s in systems:
            print(' ', json.dumps({k: v for k, v in s.items() if not k.startswith('_')}, default=str)[:1500])
            print('   tex', s['_tex'], 'cells', len(s['_cells']))
        continue
    jp, ip = os.path.join(GAME, 'data/trailfx', name + '.json'), os.path.join(GAME, 'art/trailfx', name + '.webp')
    if not systems:
        none.append(name)
        for p in (jp, ip):
            if os.path.exists(p): os.remove(p)
        continue
    cache, keys, images = {}, [], []
    for s in systems:
        s['cells'] = []
        for c in s.pop('_cells'):
            k = c[:2] + c[3:] if c[0] == 'grid' else c[:2]
            if k not in keys:
                keys.append(k); images.append(cell_image(c, cache))
            s['cells'].append(keys.index(k))
        if s['uv'] is not None and s['cells'] and all(keys[i][0] == 'sprite' for i in s['cells']):
            s['aspect'] = [r4(images[i].width / images[i].height) for i in s['cells']]
        s.pop('_tex'); s.pop('pid')
    rects, W, H = pack(images)
    sheet = Image.new('RGBA', (W, H))
    for im, r in zip(images, rects): sheet.paste(im, r[:2])
    sheet.save(ip, quality=90, alpha_quality=90, method=6)
    out = {'v': 1, 'name': name, 'line': line, 'img': 'art/trailfx/%s.webp' % name, 'cells': [list(r) for r in rects],
           'systems': systems}
    io.open(jp, 'w', encoding='utf-8').write(json.dumps(out, separators=(',', ':')))
    print('%-10s line=%-5s systems=%s json=%d B webp=%d B (%dx%d)' % (
        name, line, ','.join('%s(%s)' % (s['name'], s['order']) for s in systems), os.path.getsize(jp), os.path.getsize(ip), W, H))
if not SHOW: print('no particles (js/main.js TRAIL_NO_FX):', none)
