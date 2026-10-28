"""Compile the raw pattern dumps + exported sprites into the web game's data.

    py -3 -I build_data.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/normal_raw.json                      (tools/extract_raw.py on NormalGamePlayConfig)
       REF/dump/full/{grapple,challenge,seasonal}_raw.json  (tools/extract_mode.py: {config, prefabs})
       REF/sprites/*.png + sprites.json               (tools/export_sprites.py)
Writes ../data/levels.json          Normal: {v, atlas, patterns, levels, random}
       ../data/mode-<file>.json     {v, sets: {modeId: {levels, random?}}, patterns}: only patterns not in levels.json
       ../art/atlas.webp            one atlas for every mode

Everything is flattened to world units with the pattern root at the origin. Each drawable is an affine
matrix [a,b,c,d,e,f] mapping sprite units (pivot at 0,0, y up) to world. Colliders become capsules
(segment + radius) and polygon edge chains, which is all the original level geometry uses.
"""
import sys, os, json, math, ast
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
smeta = json.load(open(os.path.join(REF, 'sprites/sprites.json')))

PLAYER_FRAMES = ['CHAR_Classic0001', 'CHAR_Classic0005', 'CHAR_Classic0015', 'CHAR_Classic0020', 'CHAR_Classic0022',
                 'CHAR_Classic0028', 'CHAR_Classic0036']
# bumper hit clips: BumperAnimation (Large0001..0005) and BumperAnimationSmall (Small000..004), 30 fps
EXTRA = ['AN_Grap1_BumperLarge0001', 'AN_Grap1_BumperLarge0002', 'AN_Grap1_BumperLarge0003', 'AN_Grap1_BumperLarge0004',
         'AN_Grap1_BumperSmall000', 'AN_Grap1_BumperSmall001', 'AN_Grap1_BumperSmall002', 'AN_Grap1_BumperSmall003',
         'AN_Grap1_BumperSmall004', 'A_PlotSelected', 'in_game', 'GradientVertical', 'A_Particle', 'A_FinishLight']
# The level theme recolours these materials at run time (theme.levelColors targetsBackgroundColor / wallsReflectionColor;
# their saved _Color is theme 2's). Items using them carry `th` (1 targets background, 2 walls reflection) and keep `tint`
# only for a non-white sprite colour.
THEMED = {'TargetsBGMaterial': 1, 'WallReflectionMaterial': 2}


def ref(v):
    return v.split(':', 1)[1] if isinstance(v, str) and v.startswith('prefab:') else v


def lit(v):
    # extract_mode.py may store config values as python-repr strings
    if isinstance(v, str):
        try:
            return ast.literal_eval(v)
        except (ValueError, SyntaxError):
            return v
    return v


def level_set(det, rnd=()):
    out = {'levels': [[ref(p) for p in lit(d)['patternPrefabs']] for d in lit(det)]}
    rnd = [[ref(p) for p in lit(r)['_possiblePatterns']] for r in lit(rnd)]
    if rnd:
        out['random'] = rnd
    return out


# Mode data file -> (raw dump, config -> {modeId: level set}). The modes' patterns compile with the Normal code below.
MODES = {
    'grapple': ('dump/full/grapple_raw.json', lambda c: {
        'mode.grapple': level_set(c['_deterministicLevelDefinitions'], c['_randomPatternDefinitions'])}),
    'challenge': ('dump/full/challenge_raw.json', lambda c: {'mode.challenge': level_set(c['_levels'])}),
    'seasonal': ('dump/full/seasonal_raw.json', lambda c: {
        lit(e)['_eventId']: level_set(lit(e)['_deterministicLevelDefinitions']) for e in lit(c['_seasonalEventLevelDefinitions'])}),
}

def mul(m, n):
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f]


def local(n):
    r = math.radians(n['r']); cs, sn = math.cos(r), math.sin(r)
    sx, sy = n['s']
    return [cs * sx, sn * sx, -sn * sy, cs * sy, n['p'][0], n['p'][1]]


def ap(m, x, y):
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]


def axis_len(m, i):
    return math.hypot(m[0], m[1]) if i == 0 else math.hypot(m[2], m[3])


def r4(v):
    return round(v, 4)


def ints(x):
    # 1.0 -> 1: same value in JS, 12 KB less in levels.json (the first-load budget)
    if isinstance(x, float) and x == int(x):
        return int(x)
    if isinstance(x, list):
        return [ints(v) for v in x]
    if isinstance(x, dict):
        return {k: ints(v) for k, v in x.items()}
    return x


used = set(PLAYER_FRAMES + EXTRA)


def compile_pattern(root):
    out = {'draw': [], 'targets': [], 'bumpers': [], 'caps': [], 'polys': [], 'finish': [], 'spawn': None,
           'end': None, 'cam': [None, None]}
    pc = root['c'].get('StickmanHook.Services.PatternController', [{}])[0]
    out['entry'] = pc.get('entryPositions', 7); out['exit'] = pc.get('exitPositions', 7)

    def walk(n, pm, active):
        m = mul(pm, local(n))
        act = active and n['active']
        name = n['name'].split(' (')[0]
        c = n['c']
        x, y = m[4], m[5]
        if name.startswith('End_'):
            # PatternController.EndObject is read for its position even when the object is inactive (Solo12).
            out['end'] = [r4(x), r4(y)]
        if not act:
            return
        if name == 'StartCamera':
            out['cam'][0] = r4(x)
        elif name == 'EndCamera':
            out['cam'][1] = r4(x)
        elif name == 'Spawn':
            out['spawn'] = [r4(x), r4(y)]
        if 'Target' in c:
            out['targets'].append([r4(x), r4(y)])
        if 'FinishScript' in c:
            out['finish'].append(r4(x))
        draw_index = None
        for sr in c.get('SpriteRenderer', []):
            s = sr['m_Sprite']
            if not s or name == 'Halo':
                continue
            used.add(s)
            mat = (sr.get('mat') or [None])[0]
            col = sr['m_Color']
            tint = [col['r'], col['g'], col['b']]
            sm = m
            if sr['m_FlipX']: sm = mul(sm, [-1, 0, 0, 1, 0, 0])
            if sr['m_FlipY']: sm = mul(sm, [1, 0, 0, -1, 0, 0])
            item = {'s': s, 'm': [r4(v) for v in sm], 'o': sr['m_SortingOrder']}
            if sr['m_DrawMode'] != 0:
                item['size'] = [r4(sr['m_Size']['x']), r4(sr['m_Size']['y'])]
            if any(abs(t - 1) > 0.01 for t in tint):
                item['tint'] = [round(t, 3) for t in tint]
            if mat in THEMED:
                item['th'] = THEMED[mat]
            if mat == 'ShadowMaterial':
                item['shadow'] = 1
            elif 'SpriteShadow' in c:
                sh = c['SpriteShadow'][0]
                item['sh'] = [r4(sh['offsetX']), r4(sh['offsetY']), sh['sortingOrderDifference']]
            if name == 'Target' and s == 'A_PlotNeutral':
                item['target'] = len(out['targets']) - 1
            if 'BumperAnimationController' in c:
                item['bumper'] = len(out['bumpers'])
            if name in ('Arrow', 'AAA_GE_Grap1_Exports0029') and 'Animator' in c:
                item['bob'] = 1
            draw_index = len(out['draw'])
            out['draw'].append(item)
        for cap in c.get('CapsuleCollider2D', []):
            if cap['m_IsTrigger']:
                continue
            w, h = cap['m_Size']['x'], cap['m_Size']['y']
            ox, oy = cap['m_Offset']['x'], cap['m_Offset']['y']
            sx, sy = axis_len(m, 0), axis_len(m, 1)
            # Unity: direction 0 = Vertical, 1 = Horizontal; size is scaled by the lossy scale first.
            W, H = w * sx, h * sy
            if cap['m_Direction'] == 1:
                rad = H / 2; half = max(0.0, W / 2 - rad)
                ax = [m[0] / sx, m[1] / sx]
            else:
                rad = W / 2; half = max(0.0, H / 2 - rad)
                ax = [m[2] / sy, m[3] / sy]
            cx, cy = ap(m, ox, oy)
            seg = [r4(cx - ax[0] * half), r4(cy - ax[1] * half), r4(cx + ax[0] * half), r4(cy + ax[1] * half), r4(rad)]
            if 'BumperAnimationController' in c:
                bc = c['BumperAnimationController'][0]
                bumper = {'cap': seg, 'draw': draw_index}  # bounce / force only when the prefab overrides them
                if bc['overrideBounciness']:
                    bumper['bounce'] = r4(bc['bounciness'])
                if bc['forceBounce']:
                    bumper['force'] = [r4(bc['forceImpulse']['x']), r4(bc['forceImpulse']['y'])]
                out['bumpers'].append(bumper)
            else:
                out['caps'].append(seg)
        for pol in c.get('PolygonCollider2D', []):
            if pol['m_IsTrigger']:
                continue
            ox, oy = pol['m_Offset']['x'], pol['m_Offset']['y']
            for path in pol['m_Points']['m_Paths']:
                pts = []
                for p in path:
                    pts += [r4(v) for v in ap(m, p['x'] + ox, p['y'] + oy)]
                out['polys'].append(pts)
        for ch in n['ch']:
            walk(ch, m, act)

    # PatternSpawner sets transform.position after Instantiate, so the prefab root's own position is discarded
    # (FINISH05 has its root at x=37); rotation and scale stay.
    walk({**root, 'p': [0, 0]}, [1, 0, 0, 1, 0, 0], True)
    out['draw'].sort(key=lambda d: d['o'])
    # re-link bumpers to their (sorted) draw items
    for i, d in enumerate(out['draw']):
        if 'bumper' in d:
            out['bumpers'][d['bumper']]['draw'] = i
    if not out['finish']: del out['finish']
    return out


def compile_patterns(nodes, names):
    return {name: compile_pattern(nodes[name]) for name in names}


raw = json.load(open(os.path.join(REF, 'dump/normal_raw.json')))
patterns = compile_patterns(raw['patterns'], raw['patterns'])

mode_files = {}
for fid, (src, sets_of) in MODES.items():
    mraw = json.load(open(os.path.join(REF, src)))
    sets = sets_of({k: lit(v) for k, v in mraw['config'].items()})
    names = sorted({n for st in sets.values() for lv in st['levels'] + st.get('random', []) for n in lv})
    for n in names:
        # a name shared with Normal must be the same prefab, or levels.json would draw the wrong one
        if n in raw['patterns'] and json.dumps(raw['patterns'][n], sort_keys=True) != json.dumps(mraw['prefabs'][n], sort_keys=True):
            sys.exit('pattern %s differs between Normal and %s' % (n, fid))
    mode_files[fid] = {'v': 1, 'sets': sets,
                       'patterns': compile_patterns(mraw['prefabs'], [n for n in names if n not in raw['patterns']])}

# ---- atlas: trim transparent margins, shelf-pack, record rect + pivot (sprite units) ----
items = []
for name in sorted(used):
    if name not in smeta:
        print('MISSING SPRITE', name); continue
    im = Image.open(os.path.join(REF, 'sprites', name + '.png')).convert('RGBA')
    md = smeta[name]
    scale = 1.0
    if name.startswith('CHAR_'):
        scale = 0.5
    if name == 'GradientVertical':
        im = im.resize((8, 410), Image.LANCZOS); sx, sy = 8 / md['w'], 410 / md['h']
    else:
        sx = sy = scale
        if scale != 1.0:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    bbox = im.getbbox() or (0, 0, 1, 1)
    im = im.crop(bbox)
    px = md['px'] * sx - bbox[0]; py = md['py'] * sy - bbox[1]
    ppu = md['ppu'] * sx
    ppuy = md['ppu'] * sy
    items.append((name, im, px, py, ppu, ppuy))

items.sort(key=lambda t: -t[1].height)
W = 1024; x = y = shelf = 0; rects = {}
PAD = 2
for name, im, px, py, ppu, ppuy in items:
    if x + im.width + PAD > W:
        x = 0; y += shelf + PAD; shelf = 0
    rects[name] = [x, y, im.width, im.height, round(px, 2), round(py, 2), round(ppu, 3), round(ppuy, 3)]
    x += im.width + PAD; shelf = max(shelf, im.height)
H = y + shelf
atlas = Image.new('RGBA', (W, H))
for name, im, *_ in items:
    r = rects[name]; atlas.paste(im, (r[0], r[1]))
os.makedirs(os.path.join(GAME, 'art'), exist_ok=True)
atlas.save(os.path.join(GAME, 'art/atlas.webp'), lossless=True, quality=100, method=6)

data = {'v': 1, 'atlas': {'w': W, 'h': H, 'rects': rects}, 'patterns': patterns, 'levels': raw['deterministic'],
        'random': raw['random']}
os.makedirs(os.path.join(GAME, 'data'), exist_ok=True)
txt = json.dumps(ints(data), separators=(',', ':'))
open(os.path.join(GAME, 'data/levels.json'), 'w').write(txt)
print('patterns', len(patterns), 'sprites', len(rects), 'atlas', W, 'x', H, 'json', len(txt) // 1024, 'KB')
for fid, md in mode_files.items():
    mt = json.dumps(ints(md), separators=(',', ':'))
    open(os.path.join(GAME, 'data/mode-%s.json' % fid), 'w').write(mt)
    print('mode-%s.json' % fid, {k: len(v['levels']) for k, v in md['sets'].items()}, 'new patterns', len(md['patterns']),
          len(mt) // 1024, 'KB')
