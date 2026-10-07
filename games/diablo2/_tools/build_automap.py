# -*- coding: utf-8 -*-
"""Lever for the Diablo II automap (the Tab overlay drawn from line-art cels, like D2).

    PYTHONIOENCODING=utf-8 python build_automap.py [--acts 1,2,3,4,5]

Writes (under games/diablo2/assets/)
    m/automap.js              D2_REG('m/automap', {automap: {acts, lt, obj}})
    img/g/automap_aN_<k>.webp one lossless page per act: the maximap.dc6 cels that act uses + units.dc6
and the index fragment idx/automap.json ({automap: 'm/automap'}).

    acts[N] = {pages, cels: {cel: rect}, units: [rect x8]}   rect = d2pack [x, y, w, h, ox, oy, page]
              cel anchor = top vertex of the tile diamond (the cel's 16x8 floor footprint is its bottom
              8 rows); units anchor = centre of the 17x9 cross
    lt[LvlType] = {'o_style_seq': [cels]}   key = the tile key of the world group's tileset (style may be
              an alias style of build_world.py), cels = Cel1..Cel4 of the automap.txt row D2 picks
    obj[objects.txt Class] = cel             objects.txt AutoMap (shrines, wells, stash, seals...)

automap.txt rows match the raw DS1 style, so the alias styles are mapped back by re-running
build_world.build(act) (deterministic, the same resolve as the shipped world group; the key sets are
compared below). Every act uses MaxiMap.dc6 (layouts/automap.json tilesDefaultFilename); D2 draws the
towns of Acts II, IV and V from whole pictures (Act2Map, Act4Map, ExTnMap) instead, not built here.
"""
from __future__ import print_function

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import d2fmt  # noqa: E402
import d2pack  # noqa: E402
import build_index  # noqa: E402
import build_world  # noqa: E402

GAME = os.path.dirname(HERE)
ASSETS = os.path.join(GAME, 'assets')
IMG_DIR = os.path.join(ASSETS, 'img', 'g')
GROUP = 'm/automap'
SRC = os.environ.get('D2R_DATA', 'D:/d2r-ref/fs/data/data')
G = SRC + '/global'

# gszAutomapLevelNames / gszAutomapTileNames of D2Common: the index is the LvlType id / the tile orientation
LEVEL_NAMES = ['', '1 Town', '1 Wilderness', '1 Cave', '1 Crypt', '1 Monestary', '1 Courtyard', '1 Barracks',
               '1 Jail', '1 Cathedral', '1 Catacombs', '1 Tristram', '2 Town', '2 Sewer', '2 Harem',
               '2 Basement', '2 Desert', '2 Tomb', '2 Lair', '2 Arcane', '3 Town', '3 Jungle', '3 Kurast',
               '3 Spider', '3 Dungeon', '3 Sewer', '4 Town', '4 Mesa', '4 Lava', '5 Town', '5 Siege',
               '5 Barricade', '5 Temple', '5 Ice', '5 Baal', '5 Lava']
TILE_NAMES = ['fl', 'wl', 'wr', 'wtlr', 'wtll', 'wtr', 'wbl', 'wbr', 'wld', 'wrd', 'wle', 'wre', 'co', 'sh',
              'tr', 'rf', 'ld', 'rd', 'fd', 'fi']
PICTURE_TOWNS = (12, 26, 29)
CEL_ANCHOR = (8, 24)
UNIT_ANCHOR = (8, 4)


def tab(name):
    with io.open('%s/excel/%s.txt' % (G, name), encoding='latin-1', newline='') as f:
        lines = f.read().split('\n')
    head = lines[0].rstrip('\r').split('\t')
    rows = []
    for l in lines[1:]:
        p = l.rstrip('\r').split('\t')
        if len(p) < 2:
            continue
        p += [''] * (len(head) - len(p))
        rows.append(dict(zip(head, p)))
    return rows


def sbyte(v):
    """automap.txt columns are signed chars in D2Common: 255 reads as -1."""
    v = int(v)
    return v - 256 if v > 127 else v


def read_rows():
    """LvlType -> [(o, style, start, end, [cels])] in file order (D2 takes the first match)."""
    out = {}
    for r in tab('automap'):
        if r['LevelName'] not in LEVEL_NAMES[1:] or r['TileName'] not in TILE_NAMES:
            continue
        cels = []
        for n in range(1, 5):
            c = int(r['Cel%d' % n] or -1)
            if c == -1:
                break
            cels.append(c)
        out.setdefault(LEVEL_NAMES.index(r['LevelName']), []).append(
            (TILE_NAMES.index(r['TileName']), sbyte(r['Style']), sbyte(r['StartSequence']),
             sbyte(r['EndSequence']), cels))
    return out


def cell_of(rows, o, style, seq):
    """DATATBLS_GetAutomapCellId (D2MOO): first row of the tile type whose style and sequence range fit."""
    for ro, rs, a, b, cels in rows:
        if ro != o or (rs != -1 and rs != style):
            continue
        if a != -1 and (a > seq or b < seq):
            continue
        return cels
    return None


def shipped_keys(act):
    """tile keys of each tileset in the shipped assets/m/world_actN.js."""
    p = os.path.join(ASSETS, 'm', 'world_act%d.js' % act)
    s = io.open(p, encoding='utf-8').read()
    body = json.loads(s[s.index(',', s.index('D2_REG(')) + 1:s.rindex(')')])
    return {k: set(v['tiles']) for k, v in body['tilesets'].items()}


def act_tables(act, rows):
    """-> {LvlType: {'o_style_seq': cels}} for the LvlTypes of one act."""
    spec = build_world.ACTS[act]
    sets = build_world.build(act)[1]
    ship = shipped_keys(act)
    out = {}
    for lt, name in sorted(spec['tilesets'].items()):
        ts = sets[name]
        raw = {}
        for (s, _sig), cands in ts.alias.items():
            for a in cands:
                if raw.get(a, s) != s:
                    raise RuntimeError('%s: style %d stands for raw styles %d and %d' % (name, a, raw[a], s))
                raw[a] = s
        keys = set('%d_%d_%d' % k for k in ts.reg)
        if keys != ship.get(name, set()):
            raise RuntimeError('%s: tile keys differ from the shipped world group (%d vs %d); rebuild the world '
                               'group first' % (name, len(keys), len(ship.get(name, ()))))
        if lt in PICTURE_TOWNS or lt not in rows:
            continue
        t = {}
        for (o, a, seq) in ts.reg:
            if o >= len(TILE_NAMES):
                continue
            cels = cell_of(rows[lt], o, raw[a], seq)
            if cels:
                t['%d_%d_%d' % (o, a, seq)] = cels
        out[lt] = t
    return out


def object_cels():
    out = {}
    for r in tab('objects'):
        c = int(r.get('AutoMap') or 0)
        if c and r.get('Class'):
            out[r['Class']] = c
    return out


def main():
    argv = sys.argv[1:]
    acts = [1, 2, 3, 4, 5]
    if '--acts' in argv:
        acts = [int(a) for a in argv[argv.index('--acts') + 1].split(',')]
    rows = read_rows()
    obj = object_cels()
    with open(G + '/ui/automap/maximap.dc6', 'rb') as f:
        maxi = [fr for row in d2fmt.read_dc6(f.read())['frames'] for fr in row]
    with open(G + '/ui/automap/units.dc6', 'rb') as f:
        units = [fr for row in d2fmt.read_dc6(f.read())['frames'] for fr in row]
    out_path = os.path.join(ASSETS, 'm', 'automap.js')
    data = {'acts': {}, 'lt': {}, 'obj': obj}
    if os.path.exists(out_path) and set(acts) != {1, 2, 3, 4, 5}:
        s = io.open(out_path, encoding='utf-8').read()
        data = json.loads(s[s.index('{', s.index('D2_REG(')):s.rindex(')')])['automap']
        data['obj'] = obj
    total = 0
    for act in acts:
        tables = act_tables(act, rows)
        used = sorted(set(c for t in tables.values() for cs in t.values() for c in cs) | set(obj.values()))
        pal = d2fmt.load_palette('%s/palette/%s/pal.dat' % (G, build_world.ACTS[act]['palette']))
        name = 'automap_a%d' % act
        for fn in os.listdir(IMG_DIR):
            if fn.startswith(name + '_') and fn.endswith('.webp'):
                os.remove(os.path.join(IMG_DIR, fn))
        atlas = d2pack.Atlas(name, IMG_DIR, 'assets/img/g', page_w=1024, page_h=2048)
        cels = {}
        for c in used:
            fr = maxi[c]
            cels[str(c)] = atlas.add(d2fmt.to_rgba(fr['pix'], fr['mask'], pal), *CEL_ANCHOR)
        urects = [atlas.add(d2fmt.to_rgba(fr['pix'], fr['mask'], pal), *UNIT_ANCHOR) for fr in units]
        pages = atlas.save(lossless=True)
        data['acts'][str(act)] = {'pages': pages, 'cels': {k: v for k, v in cels.items() if v}, 'units': urects}
        for lt, t in tables.items():
            data['lt'][str(lt)] = t
        size = sum(os.path.getsize(os.path.join(GAME, p)) for p in pages)
        total += size
        print('act %d: %d level types, %d tile keys with cels, %d cels, pages %s %d KB' % (
            act, len(tables), sum(len(t) for t in tables.values()), len(used), len(pages), size // 1024))
    text = ('/* generated by _tools/build_automap.py, do not edit */\n'
            "D2_REG('%s',{automap:%s});\n" % (GROUP, json.dumps(data, separators=(',', ':'), sort_keys=True)))
    with io.open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    js = os.path.getsize(out_path)
    print('m/automap.js %d KB; webp this run %d KB; total %.2f MB' % (js // 1024, total // 1024,
                                                                      (js + total) / 1048576.0))
    build_index.write_fragment('automap', {'automap': GROUP})


if __name__ == '__main__':
    main()
