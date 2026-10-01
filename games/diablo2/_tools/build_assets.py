#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dung art + tieng cua Flare (CC-BY-SA 3.0) cho Diablo II Act I web.

Chay lai bao nhieu lan cung duoc (xoa assets/img, assets/sfx, assets/music roi sinh lai).
  set FLARE_REF=D:\\flare-ref   (mac dinh D:\\flare-ref, can mods/fantasycore + mods/empyrean_campaign)
  set PYTHONIOENCODING=utf-8
  python games/diablo2/_tools/build_assets.py

Dau ra (trong games/diablo2/assets): manifest.js, img/*.webp, sfx/*.ogg, music/*.ogg.
Thoat != 0 neu assets > 35 MB.

Nguon su that cua Flare (doc tu flare-engine, master):
* Huong 0..7 (Utils::calcDirection, toa do ban do, x sang phai-xuong theo luoi, y xuong-trai theo luoi):
    theta = atan2(dy, dx); dir = (round(theta / 45deg) + 4 + 1) % 8
    dx>0,dy=0 (x+)  -> 5 ; dx>0,dy>0 -> 6 ; dy>0 (y+) -> 7 ; dx<0,dy>0 -> 0 ;
    dx<0,dy=0 -> 1 ; dx<0,dy<0 -> 2 ; dy<0 -> 3 ; dx>0,dy<0 -> 4
  Tren man hinh iso (sx=(x-y)*tw/2, sy=(x+y)*th/2): 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW
  (day cung la thu tu SW,W,NW,... trong hero_layers.txt gan so 7,0,1,...).
* Collision (MapCollision.h, ma so trong lop type=collision cua ban do):
    0 BLOCKS_NONE (di duoc) | 1 BLOCKS_ALL (tuong: chan di va tam nhin) |
    2 BLOCKS_MOVEMENT (nuoc/ho: chan di, khong chan tam nhin) |
    3 BLOCKS_ALL_HIDDEN (nhu 1, an tren minimap) | 4 BLOCKS_MOVEMENT_HIDDEN (nhu 2, an)
  Script nay coi "chan" (cho mat na) = {1,3}; {2,4} khong tinh la tuong (D2G col=2), o ngoai ban do
  tinh la chan.
* Mat na 8 hang xom: bit0 = N = (x, y-1), roi theo chieu kim dong ho tren luoi o:
    bit1 NE=(x+1,y-1) bit2 E=(x+1,y) bit3 SE=(x+1,y+1) bit4 S=(x,y+1)
    bit5 SW=(x-1,y+1) bit6 W=(x-1,y) bit7 NW=(x-1,y-1)
"""
import io, json, math, os, re, shutil, subprocess, sys, collections
from pathlib import Path
from PIL import Image

SCALE = 0.5
QUALITY = 80
MAX_MB = 35
FLARE = Path(os.environ.get('FLARE_REF', r'D:\flare-ref'))
MODS = FLARE / 'mods'
FC = MODS / 'fantasycore'
EC = MODS / 'empyrean_campaign'
ROOT = Path(__file__).resolve().parent.parent          # games/diablo2
ASSETS = ROOT / 'assets'
IMG = ASSETS / 'img'
SFX = ASSETS / 'sfx'
MUS = ASSETS / 'music'
REL = 'assets/'

DIR_NAMES = ['W', 'NW', 'N', 'NE', 'E', 'SE', 'S', 'SW']   # chi so 0..7
NOTES = []

_img_cache = {}


def load(p):
    p = str(p)
    if p not in _img_cache:
        if len(_img_cache) > 12:
            _img_cache.clear()
        _img_cache[p] = Image.open(p).convert('RGBA')
    return _img_cache[p]


def find_mod_file(rel):
    for m in (EC, FC):          # empyrean ghi de fantasycore, nhu engine
        p = m / rel
        if p.exists():
            return p
    return None


def s2(v):
    return int(round(v * SCALE))


def save_webp(im, name):
    IMG.mkdir(parents=True, exist_ok=True)
    p = IMG / name
    im.save(p, 'WEBP', quality=QUALITY, method=4, alpha_quality=100)
    return REL + 'img/' + name


# ----------------------------------------------------------------- anim parse
def parse_dur(v):
    v = v.strip()
    if v.endswith('ms'):
        return int(float(v[:-2]))
    if v.endswith('s'):
        return int(float(v[:-1]) * 1000)
    return int(float(v))


def parse_anim(path):
    images = {}
    anims = collections.OrderedDict()
    cur = None
    for raw in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        line = raw.strip()
        if not line or line[0] == '#':
            continue
        if line[0] == '[':
            name = line.strip('[]')
            cur = anims.setdefault(name, {'frames': 1, 'dur': 0, 'type': 'looped', 'active': None, 'fr': {}})
            continue
        k, _, v = line.partition('=')
        if k == 'image':
            parts = v.split(',')
            images[parts[1].strip() if len(parts) > 1 else ''] = parts[0].strip()
        elif cur is None:
            continue
        elif k == 'frames':
            cur['frames'] = int(v)
        elif k == 'duration':
            cur['dur'] = parse_dur(v)
        elif k == 'type':
            cur['type'] = v.strip()
        elif k == 'active_frame':
            try:
                cur['active'] = int(v)
            except ValueError:
                pass
        elif k == 'frame':
            f = [x.strip() for x in v.split(',')]
            n = [int(float(x)) for x in f[:8]]
            label = f[8] if len(f) > 8 else ''
            cur['fr'][(n[0], n[1])] = (n[2:], label)
    return images, anims


# ----------------------------------------------------------------- atlas pack
def shelf_pack(items, pad=1):
    """items: list of (key, Image). Tra ve (atlas, {key:(x,y,w,h)})."""
    area = sum((im.width + pad) * (im.height + pad) for _, im in items) or 1
    maxw = max([im.width for _, im in items] + [1]) + pad
    W = 256
    while W < math.sqrt(area * 1.12) or W < maxw:
        W *= 2
    W = min(W, 4096)
    order = sorted(items, key=lambda t: (-t[1].height, -t[1].width, str(t[0])))
    pos = {}
    x = y = rowh = 0
    for key, im in order:
        if x + im.width + pad > W:
            x = 0
            y += rowh + pad
            rowh = 0
        pos[key] = (x, y, im.width, im.height)
        x += im.width + pad
        rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new('RGBA', (W, max(H, 1)), (0, 0, 0, 0))
    for key, im in order:
        atlas.paste(im, pos[key][:2])
    return atlas, pos


def scale_crop(src, x, y, w, h):
    w = max(w, 1)
    h = max(h, 1)
    c = src.crop((x, y, x + w, y + h))
    return c.resize((max(1, s2(w)), max(1, s2(h))), Image.LANCZOS)


def build_sheet(animfile, outname, label):
    """Doc 1 tep anim .txt cua Flare, thu 1/2 tung khung, dong lai thanh 1 atlas WebP."""
    animfile = Path(animfile)
    images, anims = parse_anim(animfile)
    crops = {}        # (imgpath,x,y,w,h) -> Image
    for an, a in anims.items():
        for (fi, d), (r, lab) in a['fr'].items():
            ip = images.get(lab) or images.get('')
            if ip is None:
                continue
            srcp = find_mod_file(ip)
            if srcp is None:
                NOTES.append('thieu anh %s (%s)' % (ip, animfile.name))
                continue
            key = (str(srcp), r[0], r[1], r[2], r[3])
            if key not in crops:
                crops[key] = scale_crop(load(srcp), *r[:4])
    if not crops:
        NOTES.append('bo qua %s: khong co khung frame= (kieu position=?)' % label)
        return None
    atlas, pos = shelf_pack(list(crops.items()))
    out_anims = collections.OrderedDict()
    for an, a in anims.items():
        if not a['fr']:
            continue
        nf = max(max(k[0] for k in a['fr']) + 1, 1)
        f = []
        for fi in range(nf):
            row = []
            for d in range(8):
                e = a['fr'].get((fi, d))
                if e is None:
                    row.append(None)
                    continue
                r, lab = e
                ip = images.get(lab) or images.get('')
                srcp = find_mod_file(ip) if ip else None
                key = (str(srcp), r[0], r[1], r[2], r[3])
                if key not in pos:
                    row.append(None)
                    continue
                x, y, w, h = pos[key]
                row.append([x, y, w, h, s2(r[4]), s2(r[5])])
            if all(c is None for c in row[1:]) and row[0] is not None:
                row = [row[0]] * 8        # anim chi co huong 0 -> dung chung cho moi huong
            f.append(row)
        o = {'frames': nf, 'dur': a['dur'], 'type': a['type'], 'f': f}
        if a['active'] is not None:
            o['active'] = a['active']
        out_anims[an] = o
    img = save_webp(atlas, outname)
    return {'img': img, 'w': atlas.width, 'h': atlas.height, 'anims': out_anims}


# ----------------------------------------------------------------- sheets
ENEMIES = ['zombie', 'skeleton', 'skeleton_archer', 'skeleton_mage', 'goblin', 'goblin_elite',
           'antlion_small', 'antlion', 'fire_ant', 'minotaur']
POWERS = ['fireball', 'icicle', 'lightning', 'spark_blue', 'spark_red', 'freeze', 'blast', 'arrows',
          'ember', 'heal', 'runes', 'plasmaball', 'quake', 'cleave', 'thunderstrike', 'status_freeze']

WEAPONS = ['shortbow', 'longbow', 'staff', 'wand', 'dagger', 'shortsword', 'longsword', 'hand_axe',
           'battle_axe', 'mace', 'buckler', 'shield']
AV_COMMON = ['default_chest', 'default_feet', 'default_hands', 'default_legs',
             'cloth_gloves', 'cloth_pants', 'cloth_sandals', 'cloth_shirt',
             'leather_boots', 'leather_chest', 'leather_gloves', 'leather_hood', 'leather_pants',
             'chain_boots', 'chain_coif', 'chain_cuirass', 'chain_gloves', 'chain_greaves'] + WEAPONS
AV_SETS = {
    'female': ['head_long'] + AV_COMMON +
              ['mage_boots', 'mage_hood', 'mage_skirt', 'mage_sleeves', 'mage_vest'],
    'male': ['head_short'] + AV_COMMON +
            ['plate_boots', 'plate_cuirass', 'plate_gauntlets', 'plate_greaves', 'plate_helm'],
}


def slot_of(stem):
    if stem in ('buckler', 'shield'):
        return 'off'
    if stem in WEAPONS:
        return 'main'
    if stem.startswith('head_') or stem.endswith(('_hood', '_coif', '_helm')):
        return 'head'
    if stem.endswith(('_boots', '_sandals', '_feet')):
        return 'feet'
    if stem.endswith(('_gloves', '_gauntlets', '_hands')):
        return 'hands'
    if stem.endswith(('_pants', '_greaves', '_skirt', '_legs')):
        return 'legs'
    return 'chest'      # chest, shirt, cuirass, vest, sleeves


def build_all_sheets():
    sheets = collections.OrderedDict()
    slots = {}
    for e in ENEMIES:
        p = find_mod_file('animations/enemies/%s.txt' % e)
        if not p:
            NOTES.append('thieu enemy ' + e)
            continue
        s = build_sheet(p, 'enemy_%s.webp' % e, e)
        if s:
            sheets['enemy.' + e] = s
    for g, stems in AV_SETS.items():
        for st in stems:
            p = FC / 'animations' / 'avatar' / g / (st + '.txt')
            if not p.exists():
                NOTES.append('thieu avatar %s/%s' % (g, st))
                continue
            s = build_sheet(p, 'av_%s_%s.webp' % (g, st), g + '/' + st)
            if s:
                s['slot'] = slot_of(st)
                sheets['avatar.%s.%s' % (g, st)] = s
                slots['%s.%s' % (g, st)] = s['slot']
    for pw in POWERS:
        p = find_mod_file('animations/powers/%s.txt' % pw)
        if not p:
            NOTES.append('thieu power ' + pw)
            continue
        s = build_sheet(p, 'power_%s.webp' % pw, pw)
        if s:
            sheets['power.' + pw] = s
    for sub, pre in (('npcs', 'npc'), ('loot', 'loot')):
        for p in sorted((FC / 'animations' / sub).glob('*.txt')):
            s = build_sheet(p, '%s_%s.webp' % (pre, p.stem), sub + '/' + p.stem)
            if s:
                sheets['%s.%s' % (pre, p.stem)] = s
    return sheets, slots


def avatar_layer_order():
    names = {}
    for ln in (FC / 'engine' / 'hero_layers.txt').read_text().splitlines():
        ln = ln.strip()
        if ln.startswith('layer='):
            parts = ln[6:].split(',')
            names[parts[0].strip()] = [x.strip() for x in parts[1:]]
    return [names[n] for n in DIR_NAMES]


# ----------------------------------------------------------------- tilesets
def parse_tileset_def(path):
    tiles = collections.OrderedDict()
    cur = None
    for raw in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        ln = raw.strip()
        if not ln or ln[0] == '#':
            continue
        if ln.startswith('img='):
            cur = ln[4:].strip()
        elif ln.startswith('tile=') and cur:
            n = [int(float(x)) for x in ln[5:].split(',')]
            tiles[n[0]] = (cur, n[1:])
    return tiles


# Water tiles 176..191 are authored 'sunk' (origin y = -24 after halving: drawn one cell lower, meant to be
# hidden behind cliff-edge tiles). D2G has flat streams, so they are re-centred on their cell, and the bridge
# planks 200/201 (planks over the sunken dark water) get a copy 400/401 with the dark under-diamond made
# transparent (any pixel with max(rgb) < BRIDGE_DARK), so planks sit flat on the flat water.
# Cliff sprites 48..71 and 144..159 carry opaque pure-black faces (void behind the rock in Flare maps).
# They show up as black holes between rock pieces, so those pixels become dark rock instead.
CLIFF_IDS = list(range(48, 72)) + list(range(144, 160))
CLIFF_BLACK = 14
CLIFF_FILL = (40, 31, 25, 255)
WATER_IDS = range(176, 192)
BRIDGE_SRC = {400: 200, 401: 201}
BRIDGE_DARK = 48


def build_tileset(name):
    defs = parse_tileset_def(FC / 'tilesetdefs' / ('tileset_%s.txt' % name))
    crops = {}
    synth = {}
    for tid, (ip, r) in defs.items():
        srcp = find_mod_file(ip)
        if srcp is None:
            NOTES.append('thieu tileset anh ' + ip)
            continue
        key = (str(srcp), r[0], r[1], r[2], r[3])
        if key not in crops:
            crops[key] = scale_crop(load(srcp), *r[:4])
    if name == 'grassland':
        for tid in CLIFF_IDS:
            if tid not in defs:
                continue
            ip, r = defs[tid]
            key = (str(find_mod_file(ip)), r[0], r[1], r[2], r[3])
            im = crops[key].copy()
            px = im.load()
            for yy in range(im.height):
                for xx in range(im.width):
                    c = px[xx, yy]
                    if c[3] > 200 and max(c[:3]) < CLIFF_BLACK:
                        px[xx, yy] = CLIFF_FILL
            crops[key] = im
        for nid, sid in BRIDGE_SRC.items():
            ip, r = defs[sid]
            im = scale_crop(load(find_mod_file(ip)), *r[:4]).copy()
            px = im.load()
            for yy in range(im.height):
                for xx in range(im.width):
                    c = px[xx, yy]
                    if max(c[:3]) < BRIDGE_DARK:
                        px[xx, yy] = (0, 0, 0, 0)
            synth[nid] = (('bridge', sid), im, r)
            crops[('bridge', sid)] = im
    atlas, pos = shelf_pack(list(crops.items()))
    tiles = {}
    for tid, (ip, r) in defs.items():
        srcp = find_mod_file(ip)
        key = (str(srcp), r[0], r[1], r[2], r[3])
        if key in pos:
            x, y, w, h = pos[key]
            ox, oy = s2(r[4]), s2(r[5])
            if name == 'grassland' and tid in WATER_IDS:
                ox, oy = w // 2, h // 2
            tiles[tid] = [x, y, w, h, ox, oy]
    for nid, (key, im, r) in synth.items():
        x, y, w, h = pos[key]
        tiles[nid] = [x, y, w, h, s2(r[4]), s2(r[5])]
    return {'img': save_webp(atlas, 'tiles_%s.webp' % name), 'w': atlas.width, 'h': atlas.height,
            'tw': s2(192), 'th': s2(96), 'tiles': tiles}


# ----------------------------------------------------------------- autotile
NB = [(0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]   # bit0=N, kim dong ho
WALL_COL = (1, 3)


def parse_map(path):
    txt = Path(path).read_text(encoding='utf-8', errors='replace')
    hdr = {}
    layers = {}
    for blk in re.split(r'(?m)^\[', txt):
        name, _, body = blk.partition(']')
        if name == 'header':
            for ln in body.splitlines():
                k, _, v = ln.partition('=')
                hdr[k.strip()] = v.strip()
        elif name == 'layer':
            m = re.search(r'type=(\w+)', body)
            d = re.search(r'data=\s*([\d,\s\-]*)', body)
            if m and d and m.group(1) not in layers:
                layers[m.group(1)] = [int(x) for x in d.group(1).replace('\n', '').split(',') if x.strip()]
    return hdr, layers


def top(counter, n, minshare=0.0):
    tot = sum(counter.values()) or 1
    return [[k, v] for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
            if v / tot >= minshare][:n]


def learn_autotile(tileset_ids):
    maps = collections.defaultdict(list)
    for p in sorted((EC / 'maps').glob('*.txt')):
        hdr, layers = parse_map(p)
        m = re.search(r'tileset_(\w+)\.txt', hdr.get('tileset', ''))
        if m:
            maps[m.group(1)].append((p, hdr, layers))
    out = {}
    for ts in ('grassland', 'cave', 'dungeon'):
        known = tileset_ids[ts]
        floor = collections.Counter(); deco = collections.Counter(); blk = collections.Counter()
        walls = collections.defaultdict(collections.Counter)
        wbg = collections.defaultdict(collections.Counter)    # mask -> floor id found under a wall cell
        water = collections.Counter()
        used = 0
        for p, hdr, layers in maps.get(ts, []):
            w, h = int(hdr['width']), int(hdr['height'])
            bg, ob, col = layers.get('background'), layers.get('object'), layers.get('collision')
            if not (bg and ob and col) or len(col) != w * h or len(ob) != w * h or len(bg) != w * h:
                NOTES.append('map %s thieu/lech lop, bo qua' % p.name)
                continue
            used += 1
            for y in range(h):
                for x in range(w):
                    i = y * w + x
                    c = col[i]
                    if c in (2, 4) and bg[i] in known:
                        water[bg[i]] += 1
                    if c == 0:
                        if bg[i] in known:
                            floor[bg[i]] += 1
                        if ob[i] and ob[i] in known:
                            deco[ob[i]] += 1
                    elif c in WALL_COL and ob[i] and ob[i] in known:
                        mask = 0
                        for b, (dx, dy) in enumerate(NB):
                            nx, ny = x + dx, y + dy
                            if nx < 0 or ny < 0 or nx >= w or ny >= h or col[ny * w + nx] in WALL_COL:
                                mask |= 1 << b
                        if bg[i] and bg[i] in known:
                            wbg[mask][bg[i]] += 1
                        if mask == 0:
                            blk[ob[i]] += 1
                        else:
                            walls[mask][ob[i]] += 1
        out[ts] = {
            'floor': top(floor, 40, 0.002), 'deco': top(deco, 40, 0.002), 'blockers': top(blk, 30),
            'walls': {str(m): top(c, 8) for m, c in sorted(walls.items())},
            # wallBg[mask]: bg ids Flare puts UNDER a wall cell with that mask (bg 0 = black hole, skipped;
            # '0' = isolated blocker). D2G fills bg under every blocked cell from this, else from floor.
            'wallBg': {str(m): top(c, 6) for m, c in sorted(wbg.items())},
            'water': top(water, 16, 0.01),
            'maps': used,
        }
    out['grassland'].update(GRASSLAND_EXTRA)
    # tiles 92..95 are Flare's blue editor arrows (event hints), never scenery
    out['grassland']['deco'] = [e for e in out['grassland']['deco'] if e[0] not in (92, 93, 94, 95)]
    return out


# Hand-picked grassland pieces (ids = tile ids of tileset_grassland.txt, looked at in a contact sheet).
#  path   : cobble/dirt floor tiles 32..47            trees : leafy/pine/dead trees 240..255
#  bridge : wooden planks over water (400/401 = synthetic copies of 200/201 without the sunken dark diamond); 'x' = planks run along grid x (walking W-E), 'y' = along grid y
#  fence  : wooden palisade. Key = 4-bit mask of palisade neighbours, N=1 E=2 S=4 W=8 (grid N = (x,y-1),
#           i.e. screen NE). Grid-axis pieces: 104 = rails run along grid y (screen NE-SW),
#           107 = rails run along grid x (screen NW-SE), 110 = bare post (corners, T, ends, lone).
#           Only cells D2G marks as palisade (legend wall+fence) use it, never cliffs.
GRASSLAND_EXTRA = {
    'path': [[i, 1] for i in range(32, 48)],
    'trees': [[i, 1] for i in range(240, 256)],
    'bridge': {'x': [[400, 1]], 'y': [[401, 1]]},
    'fence': {str(m): ([[104, 1]] if m in (1, 4, 5) else [[107, 1]] if m in (2, 8, 10) else [[110, 1]])
              for m in range(16)},
}


# ----------------------------------------------------------------- town objects
# Object type -> how to draw it. parts = tiles of tileset `tileset`, drawn exactly like map tiles
# ([x,y,w,h,ox,oy] from tilesets[tileset].tiles[tile]) at cell (cx+dx, cy+dy), where (cx,cy) is the
# CENTRE of the object footprint ({type,x,y,w,h}: cx = x+(w-1)/2, cy = y+(h-1)/2). 'tile' = parts[0].tile.
# Draw in (x+y) order with the other obj tiles; `blocks` says whether D2G made the footprint blocked.
TOWN_OBJECTS = {
    'tent':     {'parts': [(72, 0, 0), (75, 0, 0)], 'note': 'Flare tent, two halves drawn on the same cell'},
    'forge':    {'parts': [(103, 0, 0)], 'note': 'anvil on a stump'},
    'wagon':    {'parts': [(98, -0.5, 0), (99, 0.5, 0), (100, 0, -0.5)], 'note': 'crates + logs (Flare has no wagon)'},
    'caravan':  {'parts': [(170, 0, 0)], 'note': 'beached boat standing in for the caravan'},
    'crates':   {'parts': [(96, 0, 0)], 'note': 'single crate / barrel'},
    'campfire': {'parts': [(102, 0, 0)], 'note': 'fire ring'},
    'stash':    {'parts': [(76, 0, 0)], 'note': 'wooden chest'},
    'waypoint': {'parts': [(265, 0, 0)], 'note': 'glowing rune circle (264 = inactive)'},
}


def town_objects(tileset):
    out = {}
    for k, v in TOWN_OBJECTS.items():
        parts = [{'tile': t, 'dx': dx, 'dy': dy} for t, dx, dy in v['parts']
                 if t in tileset['tiles']]
        if not parts:
            NOTES.append('townObjects.%s: thieu tile' % k)
            continue
        out[k] = {'tileset': 'grassland', 'tile': parts[0]['tile'], 'parts': parts}
    return out


# ----------------------------------------------------------------- power icons
def build_power_icons(ncells):
    """Flare power name (snake_case, from name= and from the file stem) and numeric power id -> icons.png cell."""
    def snake(n):
        return re.sub(r'[^a-z0-9]+', '_', n.lower()).strip('_')
    icons = {}
    root = EC / 'powers'
    files = [root / 'powers.txt'] + sorted((root / 'base').rglob('*.txt')) + sorted((root / 'categories').glob('*.txt'))
    seen = set()
    for p in files:
        if p in seen or not p.exists():
            continue
        seen.add(p)
        cur = None
        lines = expand_include(p) + ['[power]']
        for ln in lines:
            ln = ln.strip()
            if ln.startswith('[power]'):
                if cur and cur.get('icon') is not None and cur.get('icon') < ncells:
                    keys = []
                    if cur.get('name'):
                        keys.append(snake(cur['name']))
                    if p.parent.name != 'categories' and p.stem != 'powers':
                        keys.append(snake(p.stem))
                    if cur.get('id') is not None:
                        keys.append(str(cur['id']))
                    for k in keys:
                        icons.setdefault(k, cur['icon'])
                cur = {}
            elif cur is not None and '=' in ln:
                k, _, v = ln.partition('=')
                if k == 'icon':
                    try:
                        cur['icon'] = int(v.split(',')[0])
                    except ValueError:
                        pass
                elif k == 'id':
                    try:
                        cur['id'] = int(v)
                    except ValueError:
                        pass
                elif k == 'name':
                    cur['name'] = v.strip()
    return dict(sorted(icons.items()))


# ----------------------------------------------------------------- icons
def expand_include(path, depth=0):
    """Doc tep, thay dong INCLUDE bang noi dung tep (neu co trong clone thua)."""
    out = []
    for ln in Path(path).read_text(encoding='utf-8', errors='replace').splitlines():
        if ln.startswith('INCLUDE ') and depth < 4:
            q = find_mod_file(ln[8:].strip())
            if q:
                out += expand_include(q, depth + 1)
        else:
            out.append(ln)
    return out


def build_icons():
    src = load(FC / 'images' / 'icons' / 'icons.png')
    cell = 64
    cols, rows = src.width // cell, src.height // cell
    im = src.resize((s2(src.width), s2(src.height)), Image.LANCZOS)
    img = save_webp(im, 'icons.webp')
    names = {}
    for p in sorted((EC / 'items').rglob('*.txt')):
        name = icon = None
        for ln in expand_include(p) + ['[item]']:
            ln = ln.strip()
            if ln.startswith('[item]'):
                if name and icon is not None and name not in names:
                    names[name] = icon
                name = icon = None
            elif ln.startswith('name='):
                name = ln[5:].strip()
            elif ln.startswith('icon='):
                try:
                    icon = int(ln[5:].split(',')[0])
                except ValueError:
                    pass
    names = {k: v for k, v in names.items() if v < cols * rows}
    return {'img': img, 'cell': s2(cell), 'cols': cols, 'count': cols * rows}, names


# ----------------------------------------------------------------- sound
SFX_PICK = collections.OrderedDict()
for _e in ('zombie', 'skeleton', 'goblin', 'antlion', 'minotaur'):
    for _s in ('hit', 'die', 'phys'):
        SFX_PICK['%s_%s' % (_e, _s)] = 'enemies/%s_%s.ogg' % (_e, _s)
for _e in ('zombie', 'goblin', 'antlion'):
    SFX_PICK['%s_ment' % _e] = 'enemies/%s_ment.ogg' % _e
for _n in ('male_hit', 'male_die', 'female_hit', 'female_die', 'melee_attack', 'melee_attack_2',
           'melee_attack_3', 'level_up', 'no_mana', 'door_open', 'flying_loot', 'wood_open', 'heartbeat'):
    SFX_PICK[_n] = _n + '.ogg'
for _n in ('arrow_wall', 'block', 'burn', 'fireball', 'freeze', 'heal', 'potion', 'quake', 'shield',
           'shock', 'shoot', 'spikes', 'teleport', 'thunder', 'timestop', 'warcry'):
    SFX_PICK['power_' + _n] = 'powers/%s.ogg' % _n
for _n in ('coins', 'potion', 'metal', 'leather', 'gem', 'book'):
    SFX_PICK['inv_' + _n] = 'inventory/inventory_%s.ogg' % _n
for _n in ('leather1', 'leather2', 'metal1', 'metal2', 'cloth1', 'echo1', 'echo2'):
    SFX_PICK['step_' + _n] = 'steps/step_%s.ogg' % _n
for _n in ('stairs', 'teleporter', 'stone_open'):
    SFX_PICK['env_' + _n] = 'environment/%s.ogg' % _n

MUSIC = {'town': 'town_theme', 'overworld': 'overworld_theme', 'cave': 'cave_theme',
         'dungeon': 'dungeon_theme', 'boss': 'boss_theme'}


def build_sound():
    SFX.mkdir(parents=True, exist_ok=True)
    MUS.mkdir(parents=True, exist_ok=True)
    sfx = {}
    for k, rel in SFX_PICK.items():
        src = FC / 'soundfx' / rel
        if not src.exists():
            NOTES.append('thieu sfx ' + rel)
            continue
        shutil.copyfile(src, SFX / (k + '.ogg'))
        sfx[k] = REL + 'sfx/%s.ogg' % k
    music = {}
    ff = shutil.which('ffmpeg')
    for k, stem in MUSIC.items():
        src = FC / 'music' / (stem + '.ogg')
        dst = MUS / (k + '.ogg')
        done = False
        if ff:
            r = subprocess.run([ff, '-y', '-v', 'error', '-i', str(src), '-vn', '-map_metadata', '-1',
                                '-ac', '1', '-c:a', 'libvorbis', '-b:a', '64k',
                                '-fflags', '+bitexact', '-flags:a', '+bitexact', str(dst)])
            done = r.returncode == 0 and dst.exists()
        if not done:
            NOTES.append('ffmpeg khong re-encode duoc %s, chep nguyen ban' % stem)
            shutil.copyfile(src, dst)
        music[k] = REL + 'music/%s.ogg' % k
    return sfx, music


# ----------------------------------------------------------------- main
def dir_size(p):
    return sum(f.stat().st_size for f in Path(p).rglob('*') if f.is_file())


def main():
    if not (FC.exists() and EC.exists()):
        print('Khong thay %s (dat FLARE_REF)' % MODS)
        return 2
    for d in (IMG, SFX, MUS):
        if d.exists():
            shutil.rmtree(d)
    ASSETS.mkdir(parents=True, exist_ok=True)

    sheets, slots = build_all_sheets()
    tilesets = collections.OrderedDict((n, build_tileset(n)) for n in ('grassland', 'cave', 'dungeon'))
    autotile = learn_autotile({n: set(t['tiles']) for n, t in tilesets.items()})
    icons, icon_names = build_icons()
    power_icons = build_power_icons(icons['count'])
    sfx, music = build_sound()

    manifest = {
        'scale': SCALE,
        'dirs': 'Flare direction 0..7 = screen W,NW,N,NE,E,SE,S,SW (0=left, clockwise; '
                'grid +x = SE(5), +y = SW(7), -x = NW(1), -y = NE(3)); iso screen sx=(x-y)*tw/2, sy=(x+y)*th/2. '
                'Frame [x,y,w,h,ox,oy]: draw at (px-ox, py-oy), px,py = entity foot point. '
                'Anim with only dir 0 is copied to all 8 dirs.',
        'sheets': sheets,
        'avatarLayers': {'order': avatar_layer_order(), 'slots': slots},
        'tilesets': tilesets,
        'autotile': dict(autotile, _bits='mask bit0=N(x,y-1) clockwise: NE,E,SE,S,SW,W,NW (bit7); '
                                          'blocked = collision 1|3 or off-map; weights = counts in Flare maps'),
        'icons': icons,
        'iconNames': icon_names,
        'powerIcons': power_icons,
        'townObjects': town_objects(tilesets['grassland']),
        'sfx': sfx,
        'music': music,
    }
    js = 'window.D2_ASSETS = ' + json.dumps(manifest, separators=(',', ':'), ensure_ascii=True,
                                            sort_keys=False) + ';\n'
    with io.open(str(ASSETS / 'manifest.js'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)

    # bang kich thuoc
    total = dir_size(ASSETS)
    print('%-28s %10s' % ('muc', 'KB'))
    for sub in ('img', 'sfx', 'music'):
        print('%-28s %10d' % (sub, dir_size(ASSETS / sub) // 1024))
    print('%-28s %10d' % ('manifest.js', (ASSETS / 'manifest.js').stat().st_size // 1024))
    groups = collections.Counter()
    for f in IMG.glob('*.webp'):
        groups[f.name.split('_')[0]] += f.stat().st_size
    for g, sz in groups.most_common():
        print('  img/%-22s %10d' % (g + '_*', sz // 1024))
    for f in sorted(IMG.glob('*.webp'), key=lambda f: -f.stat().st_size)[:6]:
        print('  biggest %-30s %6d KB' % (f.name, f.stat().st_size // 1024))
    for f in sorted(MUS.glob('*.ogg')):
        print('  music %-12s %6d KB' % (f.name, f.stat().st_size // 1024))
    print('sheets=%d  tilesets=%s  sfx=%d  music=%d  icons=%d  iconNames=%d' %
          (len(sheets), list(tilesets), len(sfx), len(music), icons['count'], len(icon_names)))
    for n, a in autotile.items():
        print('autotile %-10s maps=%d floor=%d deco=%d blockers=%d wallMasks=%d' %
              (n, a['maps'], len(a['floor']), len(a['deco']), len(a['blockers']), len(a['walls'])))
    for n in NOTES:
        print('NOTE:', n)
    print('TONG %.2f MB / %d MB' % (total / 1048576, MAX_MB))
    if total > MAX_MB * 1048576:
        print('VUOT NGAN SACH')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
