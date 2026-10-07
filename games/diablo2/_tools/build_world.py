# -*- coding: utf-8 -*-
"""Lever for the Diablo II world assets (contract v2, brain/plans/diablo2-d2r.md "Hop dong v2").

    PYTHONIOENCODING=utf-8 python build_world.py [--acts 1] [--quality 88] [--lossless]

Per act N writes
    assets/m/world_actN.js   D2_REG('m/world_actN', {pages, tilesets: {<set>: {pages, tiles, flags, palette}}})
    assets/m/maps_actN.js    D2_REG('m/maps_actN', {maps, presets, subs, levels, mazes, warps, waypointObjs})
                             (warps[id].byDir {l, r, b} when lvlwarp.txt reuses one Id, Act V;
                              maps[key].warps = marker tiles [x, y, rawStyle], maps[key].lit['x,y'] = the cells
                              drawn lit on mouse-over, [x, y, 'w'|'f', layer])
    assets/img/g/tiles_actN_<k>.webp  (one atlas shared by every tileset of the act, deduplicated)
and the index fragment assets/idx/world.json ({tilesets: {set: group}, maps: {act: group}}).

One tileset per LvlType (town + wilderness share 'act1'). A DS1 is resolved against the DT1 files it
lists itself; one DT1 key space (orientation_style_sequence) cannot hold every file of a LvlType, so a
style whose keys clash with an earlier DS1 of the same set gets an alias style (64+). Style 0 is always
aliased because layer value 0 means 'empty'. Consumers read style as (t >> 8) & 0xff, variant as t >> 16.
Rerunnable and deterministic.

Adding an act: add an ACTS entry (LvlPrest def ranges -> LvlType, LvlType -> tileset name).
"""
from __future__ import print_function
import hashlib
import io
import json
import os
import re
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2fmt  # noqa: E402
import build_index  # noqa: E402

G = 'D:/d2r-ref/fs/data/data/global/'
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))
IMG = os.path.join(OUT, 'img', 'g')
WEB_IMG = 'assets/img/g'
ALIAS_BASE = 64
PAGE = 2048
PAD = 2   # lossy WebP smears colour across 1 px; 2 px keeps neighbours out of each other's edge

ACTS = {
    1: {
        'budget': 12 * 1024 * 1024,
        'palette': 'act1',
        'tilesets': {1: 'act1', 2: 'act1', 3: 'act1cave', 4: 'act1crypt', 5: 'act1mon', 6: 'act1court',
                     7: 'act1bar', 8: 'act1jail', 9: 'act1cath', 10: 'act1cata', 11: 'act1tri'},
        # LvlPrest def range -> LvlType (lvlprest.txt has no LvlType column; LevelId is 0 for stamps)
        'defs': [(1, 3, 1), (4, 52, 2), (53, 107, 3), (108, 108, 2), (109, 159, 4), (160, 164, 2),
                 (165, 165, 5), (166, 166, 6), (167, 205, 7), (206, 255, 8), (256, 256, 6), (257, 257, 9),
                 (258, 299, 10), (300, 300, 11)],
        'sub_prefix': 'act1/', 'sub_type': 2,
        'levels': (0, 39),   # levels.txt Act column value, max Id kept
        'warps': (0, 18),    # lvlwarp Id range
        # floor used to fill the open ground of outdoor levels:
        # (tileset, LvlType whose files hold it | [dt1 paths], key[, field name, default 'grass'])
        'grass': [('act1', 2, (0, 0, 0))],
    },
    # Def ranges below come from lvlprest.txt: LevelType of levels.txt when LevelId is set, else the
    # 'Act N - <LvlType name>' prefix of Name, else the LvlType whose DT1 list covers the DS1's own list.
    # Exceptions settled by hand: Act 3 Slums/Burbs/Metro/Bridge/Travincal/Mephisto stamps are Kurast (22)
    # because only Kurast levels use them; Fortress Transition is Mesa (27). Defs 1090 (Pandemonium
    # Finale, Act 1 Tristram) and 1091 (Colossal Summit, Garden/) are left out, as are levels 133..137.
    2: {
        'budget': 9 * 1024 * 1024,
        'palette': 'act2',
        'quality': 84,   # q88 gives 10.1 MB of webp
        'tilesets': {12: 'act2town', 13: 'act2sewer', 14: 'act2harem', 15: 'act2basement', 16: 'act2desert',
                     17: 'act2tomb', 18: 'act2lair', 19: 'act2arcane'},
        'defs': [(301, 301, 12), (302, 352, 13), (353, 357, 14), (358, 361, 15), (362, 413, 16),
                 (414, 481, 17), (482, 509, 18), (510, 528, 19)],
        'sub_prefix': 'act2/', 'sub_type': 16,
        'levels': (1, 74),
        'warps': (19, 50),
        # (0,0,1) is plain sand; (0,0,0) in ground.dt1 is cracked and tomb.dt1 has a paved (0,0,1)
        'grass': [('act2desert', ['tiles/act2/town/ground.dt1'], (0, 0, 1))],
    },
    3: {
        'budget': 9 * 1024 * 1024,
        'palette': 'act3',
        'tilesets': {20: 'act3town', 21: 'act3jungle', 22: 'act3kurast', 23: 'act3spider', 24: 'act3dungeon',
                     25: 'act3sewer'},
        'defs': [(529, 529, 20), (530, 604, 21), (605, 658, 22), (659, 664, 23), (665, 704, 24),
                 (705, 747, 25), (748, 796, 22)],
        'sub_prefix': None, 'sub_type': None,
        'levels': (2, 102),
        'warps': (51, 68),
        # the most used floor of each type's stamps
        'grass': [('act3jungle', ['tiles/act3/ground/darkmud.dt1'], (0, 0, 0)),
                  ('act3kurast', ['tiles/act3/ground/darkgrass.dt1'], (0, 1, 0))],
    },
    4: {
        'budget': 9 * 1024 * 1024,
        'palette': 'act4',
        'tilesets': {26: 'act4town', 27: 'act4mesa', 28: 'act4lava'},
        'defs': [(797, 797, 26), (798, 835, 27), (836, 862, 28)],
        'sub_prefix': None, 'sub_type': None,
        'levels': (3, 108),
        'warps': (69, 70),
        'grass': [('act4mesa', ['tiles/act4/mesa/floor.dt1'], (0, 10, 0)),
                  ('act4lava', ['tiles/act4/lava/floor.dt1'], (0, 20, 0))],
    },
    5: {
        'budget': 9 * 1024 * 1024,
        'palette': 'act5',
        'quality': 80,   # q88 gives 11.2 MB of webp
        'tilesets': {29: 'act5town', 30: 'act5siege', 31: 'act5barricade', 32: 'act5temple', 33: 'act5icecave',
                     34: 'act5baal', 35: 'act5lava'},
        'defs': [(863, 863, 29), (864, 864, 32), (865, 879, 30), (880, 1002, 31), (1003, 1041, 33),
                 (1042, 1052, 32), (1053, 1058, 35), (1059, 1087, 34), (1088, 1089, 31)],
        'sub_prefix': 'expansion/', 'sub_type': 31,
        'levels': (4, 132),
        'warps': (71, 82),
        # Barricade SubType 10 lays snow patches on dirt, SubType 11 (Frozen Tundra) dirt patches on snow
        'grass': [('act5siege', ['tiles/expansion/siege/ground.dt1'], (0, 0, 0)),
                  ('act5barricade', ['tiles/expansion/siege/ground.dt1'], (0, 0, 0)),
                  ('act5barricade', ['tiles/expansion/siege/snow.dt1'], (0, 6, 0), 'snow')],
    },
}

_dt1_cache = {}


def tab(name):
    lines = io.open(G + 'excel/' + name, encoding='latin-1').read().split('\n')
    h = lines[0].rstrip('\r').split('\t')
    out = []
    for l in lines[1:]:
        c = l.rstrip('\r').split('\t')
        if len(c) < 3:
            continue
        out.append(dict(zip(h, c)))
    return out


def ival(v, d=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def dt1_tiles(path):
    if path not in _dt1_cache:
        _dt1_cache[path] = d2fmt.read_dt1(open(G + path, 'rb').read())
    return _dt1_cache[path]


_idx_cache = {}


def dt1_index(path):
    if path not in _idx_cache:
        ix = {}
        for t in dt1_tiles(path):
            ix.setdefault((t['orientation'], t['main_index'], t['sub_index']), []).append(t)
        _idx_cache[path] = ix
    return _idx_cache[path]


def norm_dt1(fn):
    q = fn.lower().replace(chr(92), '/').replace('.tg1', '.dt1')
    return re.sub(r'^.*?/tiles/', 'tiles/', q)


def ds1_key(f):
    return f.lower().replace(chr(92), '/').replace('.ds1', '')


def lvltype_files(type_id):
    for r in tab('lvltypes.txt'):
        if r.get('Id') == str(type_id):
            return ['tiles/' + r['File %d' % i].lower() for i in range(1, 33)
                    if r.get('File %d' % i, '0') not in ('0', '')]
    raise KeyError(type_id)


def read_lvlprest(act):
    spec = ACTS[act]['defs']
    rows = []
    for r in tab('lvlprest.txt'):
        d = ival(r.get('Def'), -1)
        lt = None
        for a, b, t in spec:
            if a <= d <= b:
                lt = t
        if lt is None:
            continue
        files = [r['File%d' % i] for i in range(1, 7) if r.get('File%d' % i, '0') not in ('0', '')]
        rows.append({'def': d, 'name': r['Name'].strip(), 'files': files, 'sizeX': ival(r['SizeX']),
                     'sizeY': ival(r['SizeY']), 'outdoors': r['Outdoors'] == '1', 'levelType': lt,
                     'levelId': ival(r['LevelId']), 'pick': ival(r['Files']), 'populate': ival(r['Populate'])})
    return rows


def read_levels(act):
    a, top = ACTS[act]['levels']
    out = {}
    for r in tab('levels.txt'):
        i = ival(r.get('Id'), -1)
        if i <= 0 or i > top or ival(r.get('Act'), -1) != a:
            continue
        out[i] = {'name': r['Name'].strip(), 'levelName': r.get('LevelName', ''),
                  'size': [ival(r['SizeX']), ival(r['SizeY'])], 'drlg': ival(r['DrlgType']),
                  'levelType': ival(r['LevelType']), 'subType': ival(r['SubType']), 'subTheme': ival(r['SubTheme']),
                  'subWaypoint': ival(r['SubWaypoint']), 'subShrine': ival(r['SubShrine']),
                  'vis': [ival(r['Vis%d' % k]) for k in range(8)], 'warp': [ival(r['Warp%d' % k]) for k in range(8)],
                  'waypoint': ival(r['Waypoint'], 255) != 255, 'teleport': ival(r['Teleport'])}
    return out


def read_mazes(levels):
    out = {}
    for r in tab('lvlmaze.txt'):
        lv = ival(r.get('Level'), -1)
        if lv in levels:
            out[lv] = {'rooms': [ival(r['Rooms']), ival(r['Rooms(N)']), ival(r['Rooms(H)'])],
                       'size': [ival(r['SizeX']), ival(r['SizeY'])], 'merge': ival(r['Merge'])}
    return out


def read_warps(act):
    a, b = ACTS[act]['warps']
    out = {}
    for r in tab('lvlwarp.txt'):
        i = ival(r.get('Id'), -1)
        if a <= i <= b:
            w = {'name': r['Name'], 'select': [ival(r['SelectX']), ival(r['SelectY']), ival(r['SelectDX']),
                                                ival(r['SelectDY'])],
                 'exitWalk': [ival(r['ExitWalkX']), ival(r['ExitWalkY'])],
                 'offset': [ival(r['OffsetX']), ival(r['OffsetY'])], 'dir': r['Direction'],
                 # lit: a lit tile set exists; tiles: sequence bit of the lit wall tile; noInteract: walk onto it
                 'lit': ival(r['LitVersion']), 'tiles': ival(r['Tiles'], 2), 'noInteract': ival(r['NoInteract'])}
            if i in out:
                # expansion rows share one Id for the l/r wall variants; the game picks by Direction
                first = out[i]
                by = first.setdefault('byDir', {first['dir']: dict((k, v) for k, v in first.items()
                                                                   if k != 'byDir')})
                by[w['dir']] = w
            else:
                out[i] = w
    return out


def waypoint_objs(act):
    """objpreset ids (DS1 object type 2) of the act's waypoints."""
    return sorted(ival(r['Index']) for r in tab('objpreset.txt')
                  if ival(r.get('Act')) == act and 'waypoint' in r.get('ObjectClass', '').lower())


def read_subs(act):
    pre = ACTS[act]['sub_prefix']
    out = []
    if not pre:
        return out
    for r in tab('lvlsub.txt'):
        f = r.get('File', '')
        if not f.lower().startswith(pre):
            continue
        out.append({'name': r['Name'].strip(), 'type': ival(r['Type']), 'file': f})
    return out


class TileSet(object):
    def __init__(self, name):
        self.name = name
        self.reg = {}        # (o, style, seq) -> (providers tuple, [tile dicts])
        self.alias = {}      # (style, providers sig) -> style actually written
        self.next_alias = ALIAS_BASE
        self.flags = []
        self.flag_idx = {}

    def resolve(self, libs, refs, label):
        """refs: set of (o, style, seq). Returns {(o,style,seq) -> (o, aliasStyle, seq)} for found keys."""
        prov = {}
        for k in refs:
            ps = tuple(sorted(p for p in libs if k in dt1_index(p)))
            if ps:
                prov[k] = ps
        out = {}
        for s in sorted(set(k[1] for k in prov)):
            ks = sorted(k for k in prov if k[1] == s)
            sig = (s, tuple(sorted(set(p for k in ks for p in prov[k]))))

            def fits(c):
                return all((k[0], c, k[2]) not in self.reg or self.reg[(k[0], c, k[2])][0] == prov[k] for k in ks)
            # the same file set can still give one key different providers when another DS1 lists only
            # some of the files, so one sig may need several alias styles
            cands = self.alias.setdefault(sig, [])
            a = next((c for c in cands if fits(c)), None)
            if a is None:
                if s != 0 and s not in cands and fits(s):
                    a = s
                else:
                    a = self.next_alias
                    self.next_alias += 1
                    assert a < 256, 'alias styles exhausted in ' + self.name
                cands.append(a)
            for k in ks:
                nk = (k[0], a, k[2])
                if nk in self.reg and self.reg[nk][0] != prov[k]:
                    raise RuntimeError('%s: key clash %s vs %s in %s' % (self.name, nk, self.reg[nk][0], label))
                if nk not in self.reg:
                    vs = [t for p in prov[k] for t in dt1_index(p)[k]]
                    self.reg[nk] = (prov[k], vs)
                out[k] = nk
        return out

    def flags_index(self, sub):
        key = tuple(int(v) for v in sub)
        if key not in self.flag_idx:
            self.flag_idx[key] = len(self.flags)
            self.flags.append(list(key))
        return self.flag_idx[key]


def ds1_refs(ds):
    refs = set()
    for layer in ds['walls']:
        for row in layer:
            for r in row:
                # hidden warp markers (orientation 10/11) still carry the level exits
                if r['prop1'] and (not r['hidden'] or r['orientation'] in (10, 11)):
                    o = r['orientation']
                    refs.add((o, r['style'], r['sequence']))
                    if o == 3:
                        refs.add((4, r['style'], r['sequence']))
                    if o in (10, 11) and not r['hidden']:
                        # lit version shown on mouse-over (D2Common DRLGROOMTILE_LoadWallWarpTiles: sequence | lvlwarp
                        # Tiles, 2 or 4)
                        refs.add((o, r['style'], r['sequence'] | 2))
                        refs.add((o, r['style'], r['sequence'] | 4))
                    elif o in (10, 11):
                        # a hidden marker is a floor warp: its lit floor tiles are style = marker sequence,
                        # sequence | 4 (DRLGROOMTILE_LoadFloorWarpTiles)
                        for q in range(4, 8):
                            refs.add((0, r['sequence'], q))
    for layer in ds['floors']:
        for row in layer:
            for r in row:
                if r['prop1'] and not r['hidden']:
                    refs.add((0, r['style'], r['sequence']))
    for layer in ds['shadows']:
        for row in layer:
            for r in row:
                if r['prop1'] and not r['hidden']:
                    refs.add((13, r['style'], r['sequence']))
    return refs


def flat(layer, kind, w, h, mp, orient=False):
    t = []
    o = []
    for y in range(h):
        for x in range(w):
            r = layer[y][x]
            v = 0
            ori = 0
            if r['prop1'] and (not r['hidden'] or (kind == 'wall' and r['orientation'] in (10, 11))):
                ori = r['orientation'] if kind == 'wall' else (0 if kind == 'floor' else 13)
                k = mp.get((ori, r['style'], r['sequence']))
                if k is not None:
                    v = (k[1] << 8) | k[2]
                else:
                    ori = 0
            t.append(v)
            o.append(ori if v else 0)
    return (t, o) if orient else t


def load_ds1(ts, f, miss, fallback_libs):
    key = ds1_key(f)
    raw = open(G + 'tiles/' + f.lower().replace(chr(92), '/'), 'rb').read()
    try:
        ds = d2fmt.read_ds1(raw)
    except struct.error:
        # d2fmt.read_ds1 overreads the substitution-group table of some v12 files (act1/outdoors/trees.ds1);
        # the tile layers come before it and parse fine, so pad and keep going.
        ds = d2fmt.read_ds1(raw + bytes(65536))
    libs = sorted(set(q for q in (norm_dt1(fn) for fn in ds['files']) if os.path.exists(G + q)))
    refs = ds1_refs(ds)
    mp = ts.resolve(libs, refs, key)
    lost = [k for k in refs if k not in mp]
    if lost and fallback_libs:
        # DS1 file list incomplete: try the LvlType files like the game does (Dt1Mask ignored)
        mp.update(ts.resolve(fallback_libs, set(lost), key))
        lost = [k for k in refs if k not in mp]
    if lost:
        miss[key] = sorted(lost)
    W, H = ds['width'], ds['height']
    floors = [flat(L, 'floor', W, H, mp) for L in ds['floors']]
    shadows = [flat(L, 'shadow', W, H, mp) for L in ds['shadows']]
    m = {'w': W, 'h': H, 'ts': ts.name,
         'floors': [L for L in floors if any(L)] or floors[:1],
         'walls': [], 'shadows': [L for L in shadows if any(L)],
         'objects': [{'type': o['type'], 'id': o['id'], 'x': o['x'], 'y': o['y']} for o in ds['objects']]}
    # level exits: warp marker tiles (orientation 10/11). Their raw style is the Vis index in levels.txt
    # (style >= 8 marks town / Tristram entry points). Kept raw because the tile key may be aliased.
    wp = set()
    lit = {}
    for li, L in enumerate(ds['walls']):
        for y in range(H):
            for x in range(W):
                r = L[y][x]
                if r['prop1'] and r['orientation'] in (10, 11):
                    wp.add((x, y, r['style']))
                    # cells drawn lit on mouse-over, [x, y, 'w' | 'f', layer]: the marker's own wall tile, or
                    # (hidden marker = floor warp) the 2x2 floor tiles of style = marker sequence around it
                    cells = []
                    if not r['hidden']:
                        cells.append([x, y, 'w', li])
                    else:
                        for fi, F in enumerate(ds['floors']):
                            for dy in (-1, 0):
                                for dx in (-1, 0):
                                    fx, fy = x + dx, y + dy
                                    if 0 <= fx < W and 0 <= fy < H:
                                        q = F[fy][fx]
                                        if q['prop1'] and q['style'] == r['sequence'] and q['sequence'] < 4:
                                            cells.append([fx, fy, 'f', fi])
                    if cells:
                        lit['%d,%d' % (x, y)] = cells
    if wp:
        m['warps'] = [list(t) for t in sorted(wp)]
        if lit:
            m['lit'] = lit
    if ds['substitution_groups']:
        m['groups'] = [[g['x'], g['y'], g['w'], g['h']] for g in ds['substitution_groups']]
    for L in ds['walls']:
        t, o = flat(L, 'wall', W, H, mp, True)
        if any(t):
            m['walls'].append({'t': t, 'o': o})
    return key, m


def build(act):
    spec = ACTS[act]
    rows = read_lvlprest(act)
    sets = {}
    for lt, name in sorted(spec['tilesets'].items()):
        if name not in sets:
            sets[name] = TileSet(name)
    type_libs = {}
    for lt in spec['tilesets']:
        type_libs[lt] = sorted(p for p in lvltype_files(lt) if os.path.exists(G + p))
    maps, presets, miss = {}, {}, {}
    for row in rows:
        ts = sets[spec['tilesets'][row['levelType']]]
        keys = []
        for f in row['files']:
            key, m = load_ds1(ts, f, miss, type_libs[row['levelType']])
            if key in maps and maps[key]['ts'] != ts.name:
                raise RuntimeError('%s used by two tilesets' % key)
            maps[key] = m
            keys.append(key)
        presets[row['def']] = {'name': row['name'], 'files': keys, 'sizeX': row['sizeX'], 'sizeY': row['sizeY'],
                               'outdoors': row['outdoors'], 'levelId': row['levelId'], 'levelType': row['levelType'],
                               'pick': row['pick'], 'ts': ts.name}
    subs = {}
    for s in read_subs(act):
        sub_ts = sets[spec['tilesets'][spec['sub_type']]]
        key, m = load_ds1(sub_ts, s['file'], miss, type_libs[spec['sub_type']])
        maps[key] = m
        subs[s['name']] = {'type': s['type'], 'file': key}
    extra = {}
    for g in spec['grass']:
        set_name, src, k = g[:3]
        libs = type_libs[src] if isinstance(src, int) else src
        gk = sets[set_name].resolve(libs, {k}, 'grass')[k]
        extra.setdefault(set_name, {})[g[3] if len(g) > 3 else 'grass'] = (gk[1] << 8) | gk[2]
    return rows, sets, maps, presets, subs, miss, extra


class Packer(object):
    """Shelf packer over full tile images (no alpha trim: the engine draws the variant's own w x h)."""

    def __init__(self, name):
        self.name = name
        self.items = []

    def add(self, rgba):
        rect = []
        self.items.append((rgba, rect))
        return rect

    def save(self, lossless, quality):
        order = sorted(self.items, key=lambda it: (-it[0].shape[0], -it[0].shape[1]))
        pages, cur = [], None
        x = y = shelf = 0
        for img, rect in order:
            h, w = img.shape[:2]
            if cur is None or x + w > PAGE:
                x, y, shelf = 0, y + shelf + PAD, 0
            if cur is None or y + h > PAGE:
                cur = np.zeros((PAGE, PAGE, 4), np.uint8)
                pages.append([cur, 0])
                x = y = shelf = 0
            cur[y:y + h, x:x + w] = img
            pages[-1][1] = max(pages[-1][1], y + h)
            rect.extend([x, y, w, h, len(pages) - 1])
            x += w + PAD
            shelf = max(shelf, h)
        if not os.path.isdir(IMG):
            os.makedirs(IMG)
        paths = []
        for i, (arr, used_h) in enumerate(pages):
            fn = '%s_%d.webp' % (self.name, i)
            im = Image.fromarray(arr[:max(1, used_h)])
            p = os.path.join(IMG, fn)
            for attempt in range(3):
                try:
                    if lossless:
                        im.save(p, 'WEBP', lossless=True, quality=100, method=6)
                    else:
                        im.save(p, 'WEBP', lossless=False, quality=quality, method=6, alpha_quality=100)
                    break
                except OSError:
                    if attempt == 2:
                        raise
            back = np.asarray(Image.open(p).convert('RGBA'))[..., 3]
            if not np.array_equal(back, arr[:max(1, used_h), :, 3]):
                raise RuntimeError('%s: alpha changed by the encoder' % fn)
            paths.append(WEB_IMG + '/' + fn)
        return paths


def pack(act, sets, pal, lossless, quality):
    atlas = Packer('tiles_act%d' % act)
    seen = {}
    entries = {}
    for name in sorted(sets):
        ts = sets[name]
        ent = entries[name] = []
        for key in sorted(ts.reg):
            o, s, q = key
            for t in ts.reg[key][1]:
                fi = ts.flags_index(t['subtile_flags'])
                roof = t['y_offset'] if o == 15 else 0
                flat_fill = o not in (0, 13) and t['mask'].any() and len(np.unique(t['pix'][t['mask']])) == 1
                if flat_fill or not t['mask'].any():
                    # solid-colour placeholder walls (hidden floor-warp markers among them): keep flags, draw nothing.
                    # Shown warp markers (orientation 10/11) are the stairs / cave mouth graphics and are drawn.
                    ent.append((key, None, 0, t['rarity'], fi, 0))
                    continue
                rgba = d2fmt.to_rgba(t['pix'], t['mask'], pal)
                if o == 13:
                    rgba[..., :3] = 0
                    rgba[..., 3] = np.where(t['mask'], 255, 0)
                digest = hashlib.sha1(rgba.tobytes() + str(rgba.shape).encode()).hexdigest()
                if digest not in seen:
                    seen[digest] = atlas.add(rgba)
                ent.append((key, seen[digest], t['y_min'] - roof, t['rarity'], fi, roof))
    pages = atlas.save(lossless, quality)
    out = {}
    for name in sorted(sets):
        tiles = {}
        for key, rect, ymin, rar, fi, roof in entries[name]:
            if rect is None:
                row = [0, 0, 0, 0, 0, rar, 0, fi]
            else:
                row = [rect[0], rect[1], rect[2], rect[3], ymin, rar, rect[4], fi]
            if roof:
                row.append(roof)
            tiles.setdefault('%d_%d_%d' % key, []).append(row)
        out[name] = {'pages': pages, 'tiles': tiles, 'flags': sets[name].flags, 'palette': ACTS[act]['palette']}
    return pages, out


def reg_js(group, obj):
    body = json.dumps(obj, separators=(',', ':'), sort_keys=True)
    return ('/* generated by _tools/build_world.py, do not edit */\n'
            'D2_REG(%s,%s);\n' % (json.dumps(group), body))


def write(path, text):
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d)
    for attempt in range(3):
        try:
            with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            return
        except OSError:
            if attempt == 2:
                raise


def build_act(act, lossless, quality):
    pal = d2fmt.load_palette(G + 'palette/%s/pal.dat' % ACTS[act]['palette'])
    quality = ACTS[act].get('quality', quality)
    rows, sets, maps, presets, subs, miss, extra = build(act)
    prefix = 'tiles_act%d_' % act
    if os.path.isdir(IMG):
        for fn in os.listdir(IMG):
            if fn.startswith(prefix) and fn.endswith('.webp'):
                os.remove(os.path.join(IMG, fn))
    pages, tilesets = pack(act, sets, pal, lossless, quality)
    for name, e in extra.items():
        tilesets[name].update(e)
    wg, mg = 'm/world_act%d' % act, 'm/maps_act%d' % act
    write(os.path.join(OUT, wg + '.js'), reg_js(wg, {'pages': pages, 'tilesets': tilesets}))
    levels = read_levels(act)
    write(os.path.join(OUT, mg + '.js'), reg_js(mg, {
        'maps': maps, 'presets': presets, 'subs': subs, 'levels': levels,
        'mazes': read_mazes(levels), 'warps': read_warps(act), 'waypointObjs': waypoint_objs(act)}))
    total = sum(os.path.getsize(os.path.join(IMG, fn)) for fn in os.listdir(IMG)
                if fn.startswith(prefix) and fn.endswith('.webp'))
    wsize, msize = os.path.getsize(os.path.join(OUT, wg + '.js')), os.path.getsize(os.path.join(OUT, mg + '.js'))
    ntiles = sum(len(v) for ts in tilesets.values() for v in ts['tiles'].values())
    print('act %d: ds1 %d, presets %d, subs %d, tile variants %d, pages %d' % (
        act, len(maps), len(presets), len(subs), ntiles, len(pages)))
    print('  sets %s' % ', '.join('%s=%d keys/%d alias/%d presets' % (
        k, len(sets[k].reg), sets[k].next_alias - ALIAS_BASE, sum(1 for p in presets.values() if p['ts'] == k))
        for k in sorted(sets)))
    # budget = the world group (its webp pages + world js); the maps group is reported beside it
    print('  tiles webp %.2f MB (%s); %s %d B, %s %d B; world group %.2f MB (budget %.0f MB), with maps %.2f MB' % (
        total / 1048576.0, 'lossless' if lossless else 'q%d' % quality, wg, wsize, mg, msize,
        (total + wsize) / 1048576.0, ACTS[act]['budget'] / 1048576.0, (total + wsize + msize) / 1048576.0))
    total += wsize
    print('  referenced keys without a DT1 tile: %d across %d ds1' % (sum(len(v) for v in miss.values()), len(miss)))
    for k in sorted(miss)[:8]:
        print('    ', k, miss[k][:4])
    return {'tilesets': {name: wg for name in tilesets}, 'maps': {str(act): mg}}, total > ACTS[act]['budget']


def main():
    argv = sys.argv[1:]
    acts = [1]
    quality = 88
    lossless = '--lossless' in argv
    if '--acts' in argv:
        acts = [int(a) for a in argv[argv.index('--acts') + 1].split(',')]
    if '--quality' in argv:
        quality = int(argv[argv.index('--quality') + 1])
    frag_path = os.path.join(OUT, 'idx', 'world.json')
    frag = {'tilesets': {}, 'maps': {}}
    if os.path.exists(frag_path):
        old = json.load(io.open(frag_path, encoding='utf-8'))
        frag['tilesets'].update(old.get('tilesets', {}))
        frag['maps'].update(old.get('maps', {}))
    over = False
    for act in acts:
        if act not in ACTS:
            raise SystemExit('act %d has no ACTS entry yet' % act)
        f, o = build_act(act, lossless, quality)
        frag['tilesets'].update(f['tilesets'])
        frag['maps'].update(f['maps'])
        over = over or o
    build_index.write_fragment('world', frag)
    if over:
        print('OVER BUDGET')
        sys.exit(1)


if __name__ == '__main__':
    main()
