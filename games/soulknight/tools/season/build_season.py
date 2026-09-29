# -*- coding: utf-8 -*-
"""Lever Season Mode (thế giới) từ dữ liệu thật 8.6: tilemap + điểm của escape_terrain_init / escape_terrain_scene1.

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/season/build_season.py
       (lần đầu hoặc thêm --extract: gọi extract_terrain.py để đổ bundle ra D:/sk86-ref/work/season/terrain, ~25 s)
Ra:    data/season-data.js (window.SK_SEASON.world), art/season/world/world0.png (atlas riêng, điểm ảnh gốc)
Số đo và cách đọc: tools/season/README.md.
"""
import io
import json
import math
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..'))
from skrip import Rip  # noqa: E402

TERRAIN = os.environ.get('SK_SEASON_TERRAIN', 'D:/sk86-ref/work/season/terrain')
DEC = 'D:/sk86-ref/decoded'
OUT_JS = os.path.join(GAME, 'data', 'season-data.js')
OUT_ART = os.path.join(GAME, 'art', 'season', 'world')
PX = 16                      # [ĐO] m_PixelsToUnits = 16 ở mọi sprite escape
MAPS = {'base': 'escape_terrain_init', 's1': 'escape_terrain_scene1'}
SCENE = {'base': 'Scene_Escape', 's1': 'Scene_Escape_1'}

# [ĐO] bảng dual-grid (TL,TR,BL,BR) -> chỉ số displayTileSubSprites; 6 = đầy, 12 = trống (xem README)
DUAL = {(1, 1, 1, 1): 6, (0, 0, 0, 1): 13, (0, 0, 1, 0): 0, (0, 1, 0, 0): 8, (1, 0, 0, 0): 15, (0, 1, 0, 1): 1,
        (1, 0, 1, 0): 11, (0, 0, 1, 1): 3, (1, 1, 0, 0): 9, (0, 1, 1, 1): 5, (1, 0, 1, 1): 2, (1, 1, 0, 1): 10,
        (1, 1, 1, 0): 7, (0, 1, 1, 0): 14, (1, 0, 0, 1): 4, (0, 0, 0, 0): 12}

rip = None
_sprites = {}      # tên -> (cab, obj)
frames = {}        # tên khung atlas -> (ảnh, ax, ay)


def load_json(p):
    return json.load(io.open(p, encoding='utf-8'))


def sprite_index():
    for cab, o in rip.objects(['escape', 'sprite_atlas', 'escape_config'], ('Sprite',)):
        nm = rip.tree(cab, o)['m_Name']
        _sprites.setdefault(nm, (cab, o))


def strip(ref):
    """'Sprite:dirt_6@escape' -> 'dirt_6'."""
    if not ref:
        return None
    s = ref.split(':', 1)[-1]
    return s.split('@')[0]


def add_frame(name, scale=1.0, key=None):
    """Sprite gốc -> khung atlas; scale nhân thêm (tilemap có transform x2). Trả tên khung hoặc None."""
    key = key or (name if scale == 1 else '%s@%g' % (name, scale))
    if key in frames:
        return key
    hit = _sprites.get(name)
    if not hit:
        print('  thiếu sprite', name)
        return None
    s = rip.sprite(*hit)
    if not s:
        print('  không đọc được sprite', name)
        return None
    _, img, ax, ay, ppu = s
    k = PX / ppu * scale
    if abs(k - 1) > 1e-3:
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.NEAREST)
        ax, ay = ax * k, ay * k
    frames[key] = (img, ax, ay)
    return key


# ---------------------------------------------------------------- lưới
def rle(s):
    out, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        n = j - i
        out.append(s[i] + (str(n) if n > 1 else ''))
        i = j
    return ''.join(out)


def overview_water(key, ux, uy):
    """[ĐO ảnh] ô ColMap chắn sông: đọc màu ảnh tổng quan để biết có phải nước không (xem README 'khe sông')."""
    if key != 's1':
        return None
    im = OVER.get(key)
    if im is None:
        im = OVER[key] = Image.open(os.path.join(TERRAIN, 'overview_Scene1.png')).convert('RGB')
    k = im.width / 350.0          # [ĐO] ảnh 1024 phủ đúng 350 đơn vị
    x, y = int(ux * k), int((350 - uy) * k)
    if not (0 <= x < im.width and 0 <= y < im.height):
        return None
    deep = shal = 0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            r_, g, b = im.getpixel((min(im.width - 1, max(0, x + dx)), min(im.height - 1, max(0, y + dy))))
            if b > r_ + 30 and b >= 80 and g < 110:
                deep += 1
            elif g >= 140 and b >= 150 and b > r_:
                shal += 1
    return 'deep' if deep >= 4 else 'shallow' if shal + deep >= 4 else None


OVER = {}


def build_map(key):
    bn = MAPS[key]
    tms = {t['name']: t for t in load_json(os.path.join(TERRAIN, bn + '_tilemaps.json'))['tilemaps']}
    pts = load_json(os.path.join(TERRAIN, bn + '_points.json'))
    objs = [o for o in load_json(os.path.join(TERRAIN, bn + '_objects.json'))['objects'] if o['canonical']]
    ms = pts['mapSize'][0]['fields']
    x0, y0 = ms['leftBottomLocalPosition']['x'], ms['leftBottomLocalPosition']['y']
    x1, y1 = ms['rightTopLocalPositionExclusive']['x'], ms['rightTopLocalPositionExclusive']['y']
    W, H = x1 - x0, y1 - y0
    P = lambda ux, uy: [round((ux - x0) * PX, 1), round((y1 - uy) * PX, 1)]   # noqa: E731
    # lưới ô 2 đơn vị (ô tilemap cell 1 x scale 2) phủ bản đồ
    cx0, cx1 = math.floor(x0 / 2) - 1, math.ceil(x1 / 2) + 1
    cy0, cy1 = math.floor(y0 / 2) - 1, math.ceil(y1 / 2) + 1
    CW, CH = cx1 - cx0, cy1 - cy0

    def cells(name):
        t = tms.get(name)
        return [(c[0], c[1], c[2]) for c in t['cells']] if t else []

    lay = {k: bytearray(CW * CH) for k in ('dirt', 'shallow', 'deep', 'tree', 'grass')}

    def setc(k, cx, cy):
        if cx0 <= cx < cx1 and cy0 <= cy < cy1:
            lay[k][(cy1 - 1 - cy) * CW + (cx - cx0)] = 1
    for nm, k in (('DirtTilemap', 'dirt'), ('ShallowWaterTilemap', 'shallow'), ('DeepWaterTilemap', 'deep'),
                  ('TreeMap', 'tree'), ('GrassTilemap', 'grass')):
        for cx, cy, _ in cells(nm):
            setc(k, cx, cy)

    solid = bytearray(b'.' * (W * H))

    def solid_unit(ux, uy, ch):
        i, j = int(math.floor(ux - x0)), int(math.floor(y1 - uy - 1e-6))
        if 0 <= i < W and 0 <= j < H:
            solid[j * W + i] = ord(ch)

    def solid_tile(cx, cy, ch):
        for ux in (2 * cx, 2 * cx + 1):
            for uy in (2 * cy + 0.5, 2 * cy + 1.5):
                solid_unit(ux + 0.5, uy, ch)
    filled = {'deep': 0, 'shallow': 0}
    for cx, cy, _ in cells('ColMap'):
        w = overview_water(key, 2 * cx + 1, 2 * cy + 1)
        if w:
            setc(w, cx, cy)
            filled[w] += 1
            if w == 'deep':
                setc('shallow', cx, cy)
        solid_tile(cx, cy, 'c')
    for cx, cy, _ in cells('TreeMap'):
        solid_tile(cx, cy, 't')
    for cx, cy, _ in cells('DeepWaterTilemap'):
        solid_tile(cx, cy, 'w')
    for cx, cy, _ in cells('FenceMap'):
        solid_tile(cx, cy, 'f')
    t = tms.get('SpriteColliderBake')
    for cx, cy, _ in (cells('SpriteColliderBake') if t else []):
        solid_unit(cx + 0.5, cy + 0.5, 'b')          # scale 1: ô 1 đơn vị
    for cx, cy, _ in cells('WallMap'):                  # Institute: ô 2 x scale 2 = 4 đơn vị
        for dx in range(4):
            for dy in range(4):
                solid_unit(4 * cx + dx + 0.5, 4 * cy + dy + 0.5, 'k')

    # tile rời (vẽ theo y): hàng rào, lều trại, tường/sàn Institute, cầu
    def tile_props(name, scale, cell, off=(0.0, 0.0), ysort=True, group=None):
        t = tms.get(name)
        if not t:
            return []
        out = []
        pal = []
        for p in t['palette']:
            nm = strip(p.get('sprite'))
            fl = 1 if (p.get('matrix') and p['matrix'][0] < 0) else 0
            pal.append((add_frame(nm, scale) if nm else None, fl))
        for cx, cy, pi in t['cells']:
            f, fl = pal[pi]
            if not f:
                continue
            ux = off[0] + scale * (cx + 0.5) * cell
            uy = off[1] + scale * (cy + 0.5) * cell
            x, y = P(ux, uy)
            out.append([x, y, f, fl, 1 if ysort else 0] + ([group] if group is not None else []))
        return out
    props = []
    props += tile_props('FenceMap', 2, 1)
    props += tile_props('DecoColMap', 2, 1)
    props += tile_props('FloorMap', 2, 2, off=(2.0, 2.0), ysort=False)
    props += tile_props('WallMap', 2, 2)
    bridges = []
    for b in pts.get('bridge', []):
        bf = b['fields']
        tm_name = strip(bf['bridgeTilemap'])
        t = tms.get(tm_name)
        cells_px = tile_props(tm_name, 2, 2, off=(1.0, 1.0), ysort=False)
        walk = []
        for cx, cy, _ in (t['cells'] if t else []):
            for dx in range(4):
                for dy in range(4):
                    ux, uy = 1 + 4 * cx + dx + 0.5, 1 + 4 * cy + dy + 0.5
                    walk.append([int(math.floor(ux - x0)), int(math.floor(y1 - uy))])
        bx, by = P(*b['world'])
        bridges.append({'id': b['name'], 'x': bx, 'y': by, 'tiles': cells_px, 'walk': walk,
                        'unlockDirectly': bf.get('unlockDirectly', 0),
                        'cost': [[m['itemId'].replace('esc_item_', ''), m['requiredCount']] for m in bf['requiredMaterials']]})

    # SpriteRenderer tĩnh (nhà trong căn cứ, hàng rào gỗ chắn, cửa hầm...). Bỏ quad cộng màu và gốc cổng.
    SKIP = {'UISprite', 'light_01', 'portal_center', 'bullet_13', None}
    decor = []
    boxes = []
    by_path = {o['path']: o for o in objs}
    for o in objs:
        if not o.get('active', True):
            continue
        parent = o['path'].rsplit('/', 1)[0]
        in_building = any(c.get('type') in BUILDING_CLS for c in by_path.get(parent, {}).get('components', []))
        in_bunker = '/Bunkers/' in o['path']
        in_gate = '/Teleports/' in o['path'] or o['path'].endswith('EscapeSceneTransferGate') or '/EscapeSceneTransferGate/' in o['path']
        for c in o['components']:
            if c.get('type') == 'SpriteRenderer' and not in_building and not in_bunker:
                nm = strip(c.get('sprite'))
                if nm in SKIP or (in_gate and nm != 'weapons3_102' and not nm.startswith('Institute') and not nm.startswith('common_hideRoom')):
                    continue
                f = add_frame(nm)
                if f:
                    x, y = P(*o['world'][:2])
                    decor.append([x, y, f, 1 if c.get('flipX') else 0, c.get('sortingOrder', 0)])
            if c.get('type') == 'BoxCollider2D' and not c.get('isTrigger') and not in_bunker:
                ox, oy = c['offset']
                sx, sy = c['size']
                wx, wy = o['world'][:2]
                boxes.append((wx + ox - sx / 2, wy + oy - sy / 2, wx + ox + sx / 2, wy + oy + sy / 2))
    for bx0, by0, bx1, by1 in boxes:
        for ux in range(int(math.floor(bx0)), int(math.ceil(bx1))):
            for uy in range(int(math.floor(by0)), int(math.ceil(by1))):
                # ô chỉ bị chắn khi hộp phủ >= nửa ô (hộp 4.8 x 2 không phình ra 6 x 3)
                if min(ux + 1, bx1) - max(ux, bx0) >= 0.5 and min(uy + 1, by1) - max(uy, by0) >= 0.5:
                    solid_unit(ux + 0.5, uy + 0.5, 'b')

    # [ĐO GrassTilemap EscapeTilemapRandomTileScatter.nonEdgeCellSpriteProbability] Init 0.2, Scene1 0.5
    grass_p = next((c['fields']['nonEdgeCellSpriteProbability'] for o in objs if o['path'].endswith('/Grid/GrassTilemap')
                    for c in o.get('components', []) if c.get('type') == 'EscapeTilemapRandomTileScatter'), 0.5)
    out = {
        'key': key, 'scene': SCENE[key], 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'W': W, 'H': H,
        'cx0': cx0, 'cy1': cy1, 'CW': CW, 'CH': CH, 'grassP': grass_p,
        'layers': {k: rle(''.join('#' if v else '.' for v in a)) for k, a in lay.items()},
        'solid': rle(solid.decode('ascii')), 'props': props, 'decor': decor, 'bridges': bridges,
        'waterFill': filled,
    }
    points(key, out, pts, objs, P)
    return out


BUILDING_CLS = {'EscapeShop', 'EscapeWarehouse', 'EscapeCraftStation', 'EscapeDesignTable', 'EscapeTent',
                'EscapeResearchStation', 'EscapeBeaconTeleporter'}


def fields_of(o, cls):
    for c in o['components']:
        if c.get('type') == cls:
            return c.get('fields') or {}
    return None


def points(key, out, pts, objs, P):
    loc = LOC
    cfg = ESC_CFG
    scene = SCENE[key]
    wid = lambda s: s.replace('esc_item_', '') if s else s   # noqa: E731
    out['enemies'] = []
    for e in pts.get('enemy', []):
        a = e['fields']['attribute']
        wp = e['fields'].get('weaponPool') or []
        x, y = P(*e['world'])
        out['enemies'].append({
            'x': x, 'y': y, 'group': e['group'], 'cfg': a['enemySpawnConfigIds'], 'cfgW': a['enemySpawnConfigWeightPool'],
            'alert': a['alertRange'], 'vision': a['visionRange'], 'drop': a['deathDropChestId'].replace('esc_chest_', ''),
            'weapons': [[wid(w['weaponItemId']), w['fireDurationMin'], w['fireDurationMax'], w['atkCd']] for w in wp],
            'weaponsW': e['fields'].get('weaponWeightPool') or []})
    out['chests'] = []
    for c in pts.get('chest', []):
        x, y = P(*c['world'])
        out['chests'].append({'x': x, 'y': y, 'id': c['fields']['chestId'].replace('esc_chest_', ''), 'group': c['group']})
    out['bunkers'] = []
    for b in pts.get('bunker', []):
        o = next(q for q in objs if q['path'] == b['path'])
        parts = []
        for q in objs:
            if q['path'].startswith(b['path'] + '/'):
                sr = fields_sr(q)
                if sr:
                    x, y = P(*q['world'][:2])
                    parts.append([x, y, add_frame(sr)])
        box = next(bx for bx in b['boxColliders'] if not bx['isTrigger'])
        wx, wy = o['world'][:2]
        x, y = P(wx, wy)
        out['bunkers'].append({'x': x, 'y': y, 'hp': b['fields']['maxHp'], 'parts': parts,
                               'box': [round((wx + box['offset'][0] - box['size'][0] / 2 - out['x0']) * PX, 1),
                                       round((out['y1'] - (wy + box['offset'][1] + box['size'][1] / 2)) * PX, 1),
                                       round(box['size'][0] * PX, 1), round(box['size'][1] * PX, 1)]})
    out['gates'] = []
    for g in pts.get('gate', []):
        f = g['fields']
        x, y = P(*g['world'])
        tgt = f.get('targetSceneName', '')
        kind = 'zone'
        if g['class'] == 'EscapeInstitudeTransferGate':
            kind, tgt = 'zone', 'Scene_Escape_4'
        elif tgt == 'Scene_Escape':
            kind = 'evac' if 'Evacuation' in g['name'] else 'home'
        elif tgt == 'Scene_Escape_1' and key == 'base':
            kind = 'deploy'
        out['gates'].append({'x': x, 'y': y, 'name': g['name'], 'kind': kind, 'target': tgt,
                             'dur': f.get('interactDuration', 2.0)})
    out['rescue'] = []
    for h in pts.get('heroRescue', []):
        x, y = P(*h['world'])
        out['rescue'].append({'x': x, 'y': y, 'npc': h['fields'].get('npcId'), 'hero': h['fields'].get('heroId', -1)})
    # [ĐO EscapeHeroRescueConfig] nhân vật có vị trí cố định trong cảnh này
    for hr in cfg['EscapeHeroRescueConfig']['heroes']:
        for op in hr['overridePositions']:
            if op['sceneName'] == scene:
                x, y = P(op['worldPosition']['x'], op['worldPosition']['y'])
                out['rescue'].append({'x': x, 'y': y, 'hero': hr['heroId'], 'lost': hr['lostProbability']})
    out['investigate'] = []
    for a in cfg['EscapeAreaInvestigationConfig']['areas']:
        if a['sceneName'] == scene:
            x, y = P(a['worldPosition']['x'], a['worldPosition']['y'])
            out['investigate'].append({'id': a['areaId'], 'x': x, 'y': y})
    out['treasure'] = []
    for ent in cfg['EscapeTreasureMapConfig']['entries']:
        for l in ent['locations']:
            if l['sceneName'] == scene:
                x, y = P(l['worldPosition']['x'], l['worldPosition']['y'])
                if [x, y] not in out['treasure']:
                    out['treasure'].append([x, y])
    out['beacons'] = []
    for b in cfg['EscapeBeaconConfig']['beacons']:
        if b['sceneName'] == scene:
            x, y = P(b['worldPosition']['x'], b['worldPosition']['y'])
            out['beacons'].append({'id': b['beaconId'], 'x': x, 'y': y, 'name': loc.get(b['beaconNameLocalizationKey'], ['', ''])[1],
                                   'dur': b['interactDuration']})
    out['npcs'] = []
    for n in cfg['EscapeNpcConfig']['npcs']:
        for pc in n['positionConfigs']:
            if pc['sceneName'] == scene:
                x, y = P(pc['worldPosition']['x'], pc['worldPosition']['y'])
                out['npcs'].append({'id': n['npcId'], 'x': x, 'y': y, 'prefab': strip(n['prefab']), 'need': pc['achievedNodeKeys']})
    sp = pts.get('spawn') or []
    if sp:
        out['spawn'] = P(*sp[0]['world'])
    for o in objs:
        if o['path'].endswith('/Teleports/1'):
            out['entry'] = P(*o['world'][:2])
    # nhà trong căn cứ
    out['buildings'] = []
    for o in objs:
        cls = next((c['type'] for c in o['components'] if c.get('type') in BUILDING_CLS), None)
        if not cls:
            continue
        f = fields_of(o, cls)
        hint = fields_of(o, 'EscapeBuildingNameHint') or {}
        trig = next((c for c in o['components'] if c.get('type') == 'BoxCollider2D' and c.get('isTrigger')), None)
        box = next((q for q in objs if q['path'] == o['path'] + '/box'), None)
        sr = next((c for c in box['components'] if c.get('type') == 'SpriteRenderer'), None) if box else None
        solids = [c for c in (box['components'] if box else []) if c.get('type') == 'BoxCollider2D' and not c.get('isTrigger')]
        wx, wy = o['world'][:2]
        bid = f.get('buildingName') or {'EscapeDesignTable': 'DesignTable', 'EscapeWarehouse': 'Warehouse'}.get(cls, cls)
        x, y = P(wx, wy)
        b = {'id': bid, 'cls': cls, 'x': x, 'y': y, 'name': loc.get(hint.get('localizationKey'), ['', hint.get('defaultName', bid)])[1],
             'nameKey': hint.get('localizationKey')}
        if trig:
            b['trig'] = [round((wx + trig['offset'][0] - trig['size'][0] / 2 - out['x0']) * PX, 1),
                         round((out['y1'] - (wy + trig['offset'][1] + trig['size'][1] / 2)) * PX, 1),
                         round(trig['size'][0] * PX, 1), round(trig['size'][1] * PX, 1)]
        if box and sr:
            bx, by = P(*box['world'][:2])
            b['sprite'] = [bx, by, add_frame(strip(sr.get('sprite'))), 1 if sr.get('flipX') else 0]
            bwx, bwy = box['world'][:2]
            b['solid'] = [[bwx + c['offset'][0] - c['size'][0] / 2, bwy + c['offset'][1] - c['size'][1] / 2,
                           bwx + c['offset'][0] + c['size'][0] / 2, bwy + c['offset'][1] + c['size'][1] / 2] for c in solids]
            b['solidCells'] = []
            for bx0, by0, bx1, by1 in b.pop('solid'):
                for ux in range(int(math.floor(bx0)), int(math.ceil(bx1))):
                    for uy in range(int(math.floor(by0)), int(math.ceil(by1))):
                        if min(ux + 1, bx1) - max(ux, bx0) >= 0.5 and min(uy + 1, by1) - max(uy, by0) >= 0.5:
                            b['solidCells'].append([ux - out['x0'], out['y1'] - uy - 1])
        out['buildings'].append(b)


def fields_sr(o):
    for c in o['components']:
        if c.get('type') == 'SpriteRenderer':
            return strip(c.get('sprite'))
    return None


# ---------------------------------------------------------------- rương + tiền cảnh escape.ab
def chest_prefabs():
    """[ĐO escape.ab] prefab rương -> (sprite đóng, sprite mở, số ô)."""
    out = {}
    for cab in rip.cabs('escape'):
        for root in rip.roots(cab):
            mb = {c: t for c, _, t in root.mbs()}
            if 'EscapeChest' not in mb:
                continue
            closed = None
            for nd, path, off in root.walk():
                if path.endswith('/box'):
                    s = nd.comp('SpriteRenderer')
                    hit = rip.resolve(s[2].get('m_Sprite'), s[0]) if s else None
                    closed = rip.tree(*hit)['m_Name'] if hit else None
            op = rip.resolve(mb['EscapeChest'].get('openSprite'), cab)
            opn = rip.tree(*op)['m_Name'] if op else None
            out[root.name] = {'closed': add_frame(closed) if closed else None, 'open': add_frame(opn) if opn else None,
                              'slots': mb['EscapeChest'].get('slotCount', 8)}
    return out


def tree_frames():
    return [add_frame('Tree_%d' % i) for i in range(3)]


# ---------------------------------------------------------------- đóng gói
def pack(frs, width=2048):
    items = sorted(frs.items(), key=lambda kv: (-kv[1][0].height, -kv[1][0].width, kv[0]))
    x = y = shelf = 0
    pos = {}
    for nm, (im, ax, ay) in items:
        if x + im.width + 2 > width:
            x, y, shelf = 0, y + shelf + 2, 0
        pos[nm] = (x, y)
        x += im.width + 2
        shelf = max(shelf, im.height)
    page = Image.new('RGBA', (width, y + shelf + 2), (0, 0, 0, 0))
    table = {}
    for nm, (im, ax, ay) in items:
        px_, py_ = pos[nm]
        page.paste(im, (px_, py_))
        table[nm] = [px_, py_, im.width, im.height, round(ax, 2), round(ay, 2)]
    return page, table


def main():
    global rip, LOC, ESC_CFG
    if '--extract' in sys.argv or not os.path.exists(os.path.join(TERRAIN, 'escape_terrain_scene1_tilemaps.json')):
        subprocess.check_call([sys.executable, os.path.join(HERE, 'extract_terrain.py'), '--nopreview'])
    LOC = load_json(os.path.join(DEC, 'localization_en_vi.json'))
    ESC_CFG = {e['cls']: e['data'] for e in load_json(os.path.join(DEC, 'mb', 'escape_config.json'))}
    rip = Rip(bundles=['escape', 'sprite_atlas', 'escape_config'])
    sprite_index()
    maps = {k: build_map(k) for k in MAPS}
    world = {
        'maps': maps,
        'chests': chest_prefabs(),
        'trees': tree_frames(),
        'treePool': [0, 1, 1, 2, 2, 2],            # [ĐO TreeMap EscapeTilemapRandomTileScatter.spritePool]
        'treeP': 0.8,                               # [ĐO nonEdgeCellSpriteProbability]
        'ground': [add_frame('grass_6', 2)] + [add_frame('grass_rand_%d' % i, 2) for i in range(6)],
        'grassDecor': add_frame('grass'),
        'dual': {k: [add_frame('%s_%d' % (k, i), 2) for i in range(16)] for k in ('dirt', 'water_shallow', 'water_deep')},
        'dualRand': {'dirt': [add_frame('dirt_rand_%d' % i, 2) for i in range(6)],
                     'water_shallow': [add_frame('water_shallow_rand_%d' % i, 2) for i in range(2)]},
        'dualTable': {''.join(map(str, k)): v for k, v in DUAL.items()},
        'misc': {n: add_frame(n) for n in ('weapons3_102', 'shovel_0', 'shovel_1', 'Box_0', 'Box_1', 'InstituteGate_1',
                                            'common_hideRoom_door_1_enter')},
    }
    page, table = pack(frames)
    os.makedirs(OUT_ART, exist_ok=True)
    for f in os.listdir(OUT_ART):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT_ART, f))
    page.save(os.path.join(OUT_ART, 'world0.png'), optimize=True)
    import hashlib
    v = hashlib.md5(page.tobytes()).hexdigest()[:8]
    world['atlas'] = {'src': 'art/season/world/world0.png', 'v': v, 'w': page.width, 'h': page.height, 'f': table}
    js = ('// SINH TỰ ĐỘNG bởi tools/season/build_season.py từ escape_terrain_init/scene1 (8.6.0) — không sửa tay.\n'
          'window.SK_SEASON = window.SK_SEASON || {};\nwindow.SK_SEASON.world = ' +
          json.dumps(world, ensure_ascii=False, separators=(',', ':')) + ';\n')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    for k, m in maps.items():
        print(k, 'units %dx%d' % (m['W'], m['H']), 'enemies', len(m['enemies']), 'chests', len(m['chests']),
              'gates', [(g['name'], g['kind']) for g in m['gates']], 'props', len(m['props']), 'decor', len(m['decor']),
              'buildings', [b['id'] for b in m['buildings']], 'water fill', m['waterFill'])
    print('atlas', page.size, len(table), 'frames ->', OUT_JS, '%.0f KB' % (os.path.getsize(OUT_JS) / 1024))


if __name__ == '__main__':
    main()
