"""Compile the raw pattern dumps + exported sprites into the web game's data.

    py -3 -I build_data.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/normal_raw.json                      (tools/extract_raw.py on NormalGamePlayConfig)
       REF/dump/full/{grapple,challenge,seasonal,tournament}_raw.json  (tools/extract_mode.py: {config, prefabs})
       REF/sprites/*.png + sprites.json               (tools/export_sprites.py)
Writes ../data/levels.json          Normal: {v, atlas, patterns, levels, random}
       ../data/mode-<file>.json     {v, sets: {modeId: {levels, random?}}, patterns, race?}: only patterns not in levels.json
                                    (mode-race.json also carries the Tournament config `race`, see RACE below)
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
         'AN_Grap1_BumperSmall004', 'A_PlotSelected', 'in_game', 'GradientVertical', 'A_Particle', 'A_FinishLight',
         'A_PlotNearestFeedback']
# In-game HUD art (ui_pages_ingame_default bundle), exported to REF/sprites_ui by export_named.py with meta.json:
# name -> pixel size it is packed at (the HUD draws them at most ~90 CSS px, so ~2x at DPR 2).
UI_EXTRA = {'B_PauseButton': 96}
# FX_Spawn (ui_pages_ingame_default): one particle, 0.5 s, size 1 x transform scale 2 = 2 world units, texture sheet
# FX_Grap1_Spawn 8 x 2 cells played once over the lifetime (UVModule). Cells 11..15 are empty, so 11 frames are packed.
SPAWN_FX = ('FX_Grap1_Spawn.tex', 8, 2, 11)
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
    # Tournament ("Race"): TournamentGamePlaySettings._possibleLevels, 21 maps of 1 or 3 patterns. Ghosts: build_race.py.
    'race': ('dump/full/tournament_raw.json', lambda c: {'mode.tournament': level_set(c['_possibleLevels'])}),
}


# Extra config kept in a mode file: Tournament's opponent count and ghost difficulty weights per number of daily wins
# (_difficultyLevels[i]._weightedDifficulties -> [[difficulty, weight], ...]; difficulty 4 = GhostDifficulty.ANY).
def RACE(c):
    lv = sorted((lit(d) for d in lit(c['_difficultyLevels'])), key=lambda d: d['_level'])
    # the daily leaderboard (remote settings `leaderboard`, competition "tournament") and the AI names / skins
    # (`social_profile`), both from the default remote config bundled in the APK
    rs = json.load(open(os.path.join(REF, 'dump/full/remote_settings_default.json'), encoding='utf-8'))
    lb = rs['leaderboard']
    comp = next(x for x in lb['competitions'] if x['id'] == 'tournament')
    ai = {a['id']: a for a in lb['aiDifficulties']}
    rewards = next(x for x in lb['rewards'] if x['id'] == comp['rewardsListId'])
    pools = {p['id']: p['resourceIds'] for p in lb['rewardPools']}
    sp = rs['social_profile']
    return {
        'opponents': c['_nbOpponents'],
        'difficulty': [[[w['_difficulty'], w['_weight']] for w in d['_weightedDifficulties']] for d in lv],
        'board': {
            'participants': comp['nbParticipants'], 'maxRankToWin': comp['maxRankToWin'],
            # aiDifficulties by index (difficulties[min(wins, n - 1)]): segments [high, low, start, min, max]
            'ai': [[[s['highPosition'], s['lowPosition'], s['startScore'], s['minOverallScore'], s['maxOverallScore']]
                    for s in ai[d['id']]['segments']] for d in comp['difficulties']],
            'rewards': [[r['position'], [[i['resourceId'], i['quantity']] for i in r['rewards']]]
                        for r in rewards['positionRewards']],
            'pools': {k: v for k, v in pools.items() if k == 'reward_pool.tournament_skin'},
        },
        'names': sp['playerNames'], 'skins': sp['playerSkinIds'],
        'namePrefix': sp['global']['defaultNamePrefix'], 'nameChance': sp['global']['defaultNameChancePercent'],
        'nameMax': sp['global']['nameMaxLength'],
    }


MODE_EXTRA = {'race': ('race', RACE)}

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


def compile_pattern(root, adv=False):
    """adv: Adventure mode (tools/build_adventure.py). Target.Start and BumperAnimationController.Start replace every
    target and bumper with the TargetAdventure / BumperAdventure prefab at the same position (and rotation), and
    destroy the original [asm 0x1200e74, 0x11ff9f4], so their sprites are not compiled: `targets` items become
    [x, y, initial] and `bumpers` items {p: [x, y], r: degrees, ini}, with `seq` their creation order ('t'/'b' + index)
    and `sp` the pattern's SpawnPoint positions (PatternController.SpawnPoints, portals). `initial` = the parent's name
    contains "INITIAL" (SetType keeps those NORMAL / SAME)."""
    out = {'draw': [], 'targets': [], 'bumpers': [], 'caps': [], 'polys': [], 'finish': [], 'spawn': None,
           'end': None, 'cam': [None, None]}
    if adv:
        out.update(seq=[], sp=[])
    pc = root['c'].get('StickmanHook.Services.PatternController', [{}])[0]
    out['entry'] = pc.get('entryPositions', 7); out['exit'] = pc.get('exitPositions', 7)

    def walk(n, pm, active, parent='', rot=0.0):
        m = mul(pm, local(n))
        act = active and n['active']
        name = n['name'].split(' (')[0]
        c = n['c']
        x, y = m[4], m[5]
        rot += n.get('r') or 0
        if name.startswith('End_'):
            # PatternController.EndObject is read for its position even when the object is inactive (Solo12).
            out['end'] = [r4(x), r4(y)]
        if not act:
            return
        if adv and 'Target' in c:
            out['seq'].append('t%d' % len(out['targets']))
            out['targets'].append([r4(x), r4(y), int('INITIAL' in parent)])
            return
        if adv and 'BumperAnimationController' in c:
            if m[0] * m[3] - m[1] * m[2] < 0:
                print('WARN mirrored bumper', root['name'], n['name'])
            out['seq'].append('b%d' % len(out['bumpers']))
            out['bumpers'].append({'p': [r4(x), r4(y)], 'r': r4(rot), 'ini': int('INITIAL' in parent)})
            return
        if adv and 'SpawnPoint' in c:
            out['sp'].append([r4(x), r4(y)])
        if name == 'StartCamera':
            out['cam'][0] = r4(x)
        elif name == 'EndCamera':
            out['cam'][1] = r4(x)
        elif name == 'Spawn':
            out['spawn'] = [r4(x), r4(y)]
        elif name in ('Spawn1', 'Spawn2', 'Spawn3', 'Spawn4'):
            # race start slots: TournamentGamePlayController.GetSpawnPointName = "Spawn" + (slot > 0 ? slot : "")
            out.setdefault('spawns', {})[int(name[5])] = [r4(x), r4(y)]
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
            walk(ch, m, act, n['name'], rot)

    # PatternSpawner sets transform.position after Instantiate, so the prefab root's own position is discarded
    # (FINISH05 has its root at x=37); rotation and scale stay.
    walk({**root, 'p': [0, 0]}, [1, 0, 0, 1, 0, 0], True)
    out['draw'].sort(key=lambda d: d['o'])
    # re-link bumpers to their (sorted) draw items
    for i, d in enumerate(out['draw']):
        if 'bumper' in d:
            out['bumpers'][d['bumper']]['draw'] = i
    if not out['finish']: del out['finish']
    if 'spawns' in out:
        out['spawns'] = [out['spawn']] + [out['spawns'][k] for k in sorted(out['spawns'])]
    return out


def pack_defaults(patterns):
    """First-load budget: most draw items of levels.json repeat their sprite's SpriteShadow ([0, -0.1, -10] on every
    bumper) and sorting order 0. Drop `sh` when it equals the sprite's most common one (`sh: 0` = no shadow where the
    sprite has a default) and `o` when 0. level.js `unpackDefaults` restores both at load. Saves ~50 KB."""
    from collections import Counter, defaultdict
    seen = defaultdict(Counter)
    for p in patterns.values():
        for it in p['draw']:
            seen[it['s']][json.dumps(it.get('sh'))] += 1
    shd = {}
    for s, c in seen.items():
        top = c.most_common(1)[0][0]
        if top != 'null':
            shd[s] = json.loads(top)
    for p in patterns.values():
        for it in p['draw']:
            if it['s'] in shd:
                if 'sh' not in it:
                    it['sh'] = 0
                elif it['sh'] == shd[it['s']]:
                    del it['sh']
            if it['o'] == 0:
                del it['o']
    return shd


def compile_patterns(nodes, names):
    return {name: compile_pattern(nodes[name]) for name in names}


def main():
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
        if fid in MODE_EXTRA:
            key, f = MODE_EXTRA[fid]
            mode_files[fid][key] = f({k: lit(v) for k, v in mraw['config'].items()})

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
    ui_meta = json.load(open(os.path.join(REF, 'sprites_ui/meta.json')))
    for name, size in UI_EXTRA.items():
        im = Image.open(os.path.join(REF, 'sprites_ui', name + '.png')).convert('RGBA')
        k = size / max(im.width, im.height)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        # screen-space art: the pivot is the centre, ppu 1 (the HUD scales it to CSS px itself)
        items.append((name, im, im.width / 2, im.height / 2, 1, 1))
    sheet = Image.open(os.path.join(REF, 'sprites_ui', SPAWN_FX[0] + '.png')).convert('RGBA')
    # the rings are one flat colour over alpha, but the texture keeps noise in the RGB of transparent pixels, which
    # lossless WebP has to store: flatten RGB to the ring colour (the most opaque pixel)
    a = sheet.getchannel('A')
    ring = sheet.getpixel(max(((x, y) for x in range(0, sheet.width, 4) for y in range(0, sheet.height, 4)),
                              key=lambda q: a.getpixel(q)))[:3]
    sheet = Image.merge('RGBA', [Image.new('L', sheet.size, v) for v in ring] + [a])
    cw, ch = sheet.width // SPAWN_FX[1], sheet.height // SPAWN_FX[2]
    for i in range(SPAWN_FX[3]):
        cx, cy = (i % SPAWN_FX[1]) * cw, (i // SPAWN_FX[1]) * ch
        # half resolution (first-load budget: 28 KB -> ~9 KB); the quad spans the cell, 2 world units across
        cell = sheet.crop((cx, cy, cx + cw, cy + ch)).resize((cw // 2, ch // 2), Image.LANCZOS)
        # 16 alpha levels: a 0.5 s flash, and lossless WebP halves its size
        cell.putalpha(cell.getchannel('A').point(lambda v: min(255, round(v / 17) * 17)))
        bbox = cell.getbbox() or (0, 0, 1, 1)
        items.append(('FX_Spawn%02d' % i, cell.crop(bbox), cw / 4 - bbox[0], ch / 4 - bbox[1], cw / 4, ch / 4))

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
            'random': raw['random'], 'shd': pack_defaults(patterns)}
    os.makedirs(os.path.join(GAME, 'data'), exist_ok=True)
    txt = json.dumps(ints(data), separators=(',', ':'))
    open(os.path.join(GAME, 'data/levels.json'), 'w').write(txt)
    print('patterns', len(patterns), 'sprites', len(rects), 'atlas', W, 'x', H, 'json', len(txt) // 1024, 'KB')
    for fid, md in mode_files.items():
        mt = json.dumps(ints(md), separators=(',', ':'))
        open(os.path.join(GAME, 'data/mode-%s.json' % fid), 'w').write(mt)
        print('mode-%s.json' % fid, {k: len(v['levels']) for k, v in md['sets'].items()}, 'new patterns', len(md['patterns']),
              len(mt) // 1024, 'KB')


if __name__ == '__main__':
    main()
