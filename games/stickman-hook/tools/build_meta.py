"""Compile the original economy (bundled default remote settings) into the web game's meta table.

    py -3 -I build_meta.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/full/remote_settings_default.json   (customization, progression_road, game_modes, theme, rarity, booster)
       REF/apk/assets/aa/Android/*.bundle            (menu icons and the skin effect materials, via UnityPy)
       ../data/custom.json                           (tools/build_custom.py: trail and rope render data)
Writes ../data/meta.json and ../art/menu.webp

meta.json (arrays are positional to keep the file small; field names are in *Fields):
  items:       [id, asset, collection, rarity, unlock, value, name, xp, fx]   kind = id prefix; asset = key in custom.json,
               0 when it is the id without underscores; rarity, unlock = index into rarityIds / unlockIds;
               value = the road threshold that grants it (0 if none); fx = 1 + index into `fx` for effect variants, else 0
  noShadow:    indices of skins with hasShadow false (all effect variants)
  collections: {id: [name, kind, page, index, xp]}
  rarities:    {id: [name, color, dark]}, rarityIds: their order
  unlockIds, unlocks: unlock methods and their textTemplate, same order
  roads:       {roadResource: [[value, [[resource, qty]...], league?]...]}   only the roads the web game evaluates
  leagues:     {leagueId: name}
  modes:       [[id, name, [roadResource, value] | null]]                    unlock = first road step that grants it
  theme:       {levels: [[camera, effect, shadow, targets, finishLight, walls]...], perTheme}   '#RRGGBBAA'
  boosters:    {id: [name, rarity]}
  fx:          pixel ops [[op, ...]...] per distinct effect material, see js/fx.js
  trails, ropes: copied from custom.json so playing never needs custom.json unless a skin sheet is equipped
  menu:        {icon: [x, y, w, h]} in art/menu.webp, `_size` = [sheet w, h]
"""
import sys, os, re, json
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__)); GAME = os.path.dirname(HERE)
BUNDLES = os.path.join(REF, 'apk/assets/aa/Android')
rs = json.load(open(os.path.join(REF, 'dump/full/remote_settings_default.json'), encoding='utf-8'))
custom = json.load(open(os.path.join(GAME, 'data/custom.json')))

cz = rs['customization']
road = rs['progression_road']
XP_PER_LEVEL = 10  # GamePlaySettings._xpGainPerLevelCompleted
ROADS = ['progression.xp', 'achieved_level_mode.normal', 'achieved_level_mode.grapple', 'achieved_level_mode.challenge']
# item unlockMethod -> unlockConditions id, where they differ
UNLOCK_ALIAS = {'tournament': 'leaderboard_prize'}
RARITY_ORDER = ['common', 'epic', 'legendary', 'ultimate']


def asset_key(item):
    # Customization/Skins/IceCream/UI -> icecream (custom.json keys); variants share the base skin's folder
    addr = item.get('inGameAssetAddress') or item['uiAssetAddress']
    return addr.split('/')[2].lower().replace('_', '')


# ---- road thresholds -------------------------------------------------------------------------------------------
grants = {}  # resourceId -> (road, value)
roads = {}
for t in road['thresholds']:
    rid = t['progressionRoadResourceId']
    rewards = [[r['item']['resourceId'], r['item']['quantity']] for r in t.get('rewards', []) if 'item' in r]
    for res, _ in rewards:
        grants.setdefault(res, (rid, t['value']))
    if rid in ROADS:
        step = [t['value'], rewards]
        if t.get('leagueId'): step.append(t['leagueId'])
        roads.setdefault(rid, []).append(step)
for r in roads.values():
    r.sort(key=lambda s: s[0])

# ---- skin effect materials (AllIn1SpriteShader keywords -> a few pixel ops) ----------------------------------
fx_needed = sorted({i['effectMaterialAddress'] for i in cz['items'] if i.get('effectMaterialAddress')})


def bundle_for(address):
    pre = 'defaultlocalgroup_assets_' + address.lower().replace('/', '_').replace(' ', '') + '_'
    hits = [f for f in os.listdir(BUNDLES) if f.startswith(pre) and re.fullmatch(r'[0-9a-f]{32}\.bundle', f[len(pre):])]
    return os.path.join(BUNDLES, hits[0]) if hits else None


def rgb(c): return [round(c['r'], 3), round(c['g'], 3), round(c['b'], 3)]


def material_ops(t):
    kw = set(t.get('m_ValidKeywords') or t.get('m_ShaderKeywords') or [])
    f = dict(t['m_SavedProperties']['m_Floats']); c = dict(t['m_SavedProperties']['m_Colors'])
    ops = []
    if 'CHANGECOLOR_ON' in kw:
        ops.append(['chg', rgb(c['_ColorChangeTarget']), rgb(c['_ColorChangeNewCol']), round(f['_ColorChangeTolerance'], 3)])
    if 'HSV_ON' in kw and (f['_HsvShift'] % 360 or abs(f['_HsvSaturation'] - 1) > .01 or abs(f['_HsvBright'] - 1) > .01):
        ops.append(['hsv', round(f['_HsvShift'] % 360, 1), round(f['_HsvSaturation'], 3), round(f['_HsvBright'], 3)])
    if 'COLORSWAP_ON' in kw:
        sw = [rgb(c['_ColorSwapRed']), rgb(c['_ColorSwapGreen']), rgb(c['_ColorSwapBlue'])]
        if any(v != 1 for s in sw for v in s): ops.append(['swap'] + sw)
    if 'GREYSCALE_ON' in kw:
        ops.append(['grey', rgb(c['_GreyscaleTintColor']), round(f['_GreyscaleLuminosity'], 3)])
    if 'NEGATIVE_ON' in kw:
        ops.append(['neg', round(f['_NegativeAmount'], 3)])
    if 'POSTERIZE_ON' in kw and f['_PosterizeNumColors'] < 32:
        ops.append(['post', round(f['_PosterizeNumColors'])])
    if 'GRADIENT_ON' in kw:
        ops.append(['grad', rgb(c['_GradTopLeftCol']), rgb(c['_GradTopRightCol']), rgb(c['_GradBotLeftCol']),
                    rgb(c['_GradBotRightCol']), round(f['_GradBlend'], 3)])
    if 'PIXELATE_ON' in kw:
        ops.append(['pix', round(f['_PixelateSize'])])
    if 'GLOW_ON' in kw and f['_Glow'] > 0:
        ops.append(['glow', rgb(c['_GlowColor']), round(f['_Glow'], 3)])
    if 'HOLOGRAM_ON' in kw:
        ops.append(['holo', round(f['_HologramMinAlpha'], 3), round(f['_HologramMaxAlpha'], 3)])
    if 'OUTBASE_ON' in kw:
        ops.append(['out', rgb(c['_OutlineColor']), round(f['_OutlineAlpha'], 3), round(f['_OutlineWidth'], 3)])
    return ops


fx = {}
fx_key = {}
try:
    import UnityPy
except ImportError:
    UnityPy = None
for addr in fx_needed:
    b = bundle_for(addr) if UnityPy else None
    if not b:
        print('NO FX BUNDLE', addr); continue
    env = UnityPy.load(b)
    mat = next(o.read_typetree() for o in env.objects if o.type.name == 'Material')
    ops = material_ops(mat)
    key = '/'.join(addr.split('/')[2::2])  # Alien/HologramTravelers
    sig = json.dumps(ops)
    same = next((k for k, v in fx.items() if json.dumps(v) == sig), None)
    if same: fx_key[addr] = same
    else: fx[key] = ops; fx_key[addr] = key

# ---- items, collections, rarities ----------------------------------------------------------------------------
items = []
no_shadow = []
unlock_ids = {}
for it in sorted(cz['items'], key=lambda i: (i['categoryId'], i['itemId'])):
    kind = it['categoryId'] + 's'
    a = asset_key(it)
    if a not in custom[kind]:
        print('NO ASSET', it['itemId'], a); continue
    _, value = grants.get(it['itemId'], (None, 0))
    reward = it.get('reward') or {}
    unlock_ids.setdefault(it['unlockMethod'], len(unlock_ids))
    if it['categoryId'] == 'skin' and not it.get('hasShadow', True):
        no_shadow.append(len(items))
    fk = fx_key.get(it.get('effectMaterialAddress'))
    items.append([it['itemId'], 0 if a == it['itemId'].split('.')[1].replace('_', '') else a, it['collectionId'],
                  RARITY_ORDER.index(it['rarityId']), unlock_ids[it['unlockMethod']], value, it['displayName'],
                  reward.get('quantity', 0) if reward.get('resourceId') == 'progression.xp' else 0,
                  list(fx).index(fk) + 1 if fk else 0])

collections = {c['collectionId']: [c['displayName'], c['categoryId'] + 's', c['page'], c['index'],
                                   sum(r['quantity'] for r in c.get('rewards', []) if r['resourceId'] == 'progression.xp')]
               for c in cz['collections']}
rarities = {r['id']: [r['displayName'], '#' + r['colorCode'][1:7], '#' + r['darkColorCode'][1:7]]
            for r in sorted(rs['rarity']['rarities'], key=lambda r: RARITY_ORDER.index(r['id']))}
conds = {c['id']: c.get('textTemplate', '') for c in cz['unlockConditions']}
unlocks = [conds.get(UNLOCK_ALIAS.get(m, m), 'Locked') for m in unlock_ids]

modes = []
for m in rs['game_modes']['modes']:
    mid = m['id']
    if mid == 'mode.normal': g = None
    elif mid in grants: g = list(grants[mid])
    elif mid == 'mode.challenge': g = list(grants.get('unlocked_level_mode.challenge'))
    elif m.get('isSeasonal'): g = list(grants.get('flag.seasonal_event'))
    else: g = None
    modes.append([mid, m['displayName'], g])

th = rs['theme']
COLS = ['cameraBackgroundColor', 'effectBackgroundColor', 'shadowColor', 'targetsBackgroundColor', 'finishLightColor',
        'wallsReflectionColor']
theme = {'levels': [[t[k] for k in COLS] for t in th['levelColors']], 'perTheme': th['general']['nbLevelsPerTheme'],
         'modes': {t['gameModeId']: [t[k] for k in COLS] for t in th['gameModes']}}
boosters = {b['id']: [b['displayName'], b['rarityId']] for b in rs['booster']['boosters']}

# ---- menu icons ------------------------------------------------------------------------------------------------
ICONS = {'coin': 'Sprites/Currencies/SkinCoins', 'xp': 'Sprites/Currencies/Xp'}
for m in rs['game_modes']['modes']:
    if m.get('iconAddress'): ICONS[m['id']] = m['iconAddress']
for r in ('Common', 'Epic', 'Legendary'):
    ICONS['booster.' + r.lower()] = 'Boosters/%s/NoOutline' % r
ICON_PX = {'coin': 64, 'xp': 64}
menu = {}
if UnityPy:
    ims = []
    for key, addr in ICONS.items():
        b = bundle_for(addr)
        if not b: print('NO ICON BUNDLE', addr); continue
        env = UnityPy.load(b)
        sp = next((o.read() for o in env.objects if o.type.name == 'Sprite'), None)
        im = sp.image.convert('RGBA')
        im = im.crop(im.getbbox() or (0, 0, 1, 1))
        n = ICON_PX.get(key, 96)
        im.thumbnail((n, n), Image.LANCZOS)
        ims.append((key, im))
    x = y = shelf = 0; W = 512
    for key, im in sorted(ims, key=lambda t: -t[1].height):
        if x + im.width > W: x = 0; y += shelf + 2; shelf = 0
        menu[key] = [x, y, im.width, im.height]; x += im.width + 2; shelf = max(shelf, im.height)
    sheet = Image.new('RGBA', (W, y + shelf))
    menu['_size'] = [W, y + shelf]
    for key, im in ims: sheet.paste(im, tuple(menu[key][:2]))
    sheet.save(os.path.join(GAME, 'art/menu.webp'), quality=82, method=6)

meta = {
    'v': 1, 'xpPerLevel': XP_PER_LEVEL,
    'itemFields': ['id', 'asset', 'collection', 'rarity', 'unlock', 'value', 'name', 'xp', 'fx'],
    'items': items, 'noShadow': no_shadow, 'collections': collections, 'rarities': rarities, 'rarityIds': RARITY_ORDER,
    'unlockIds': list(unlock_ids), 'unlocks': unlocks,
    'roads': roads, 'leagues': {l['id']: l['leagueName'] for l in road['leagues']},
    'fallback': [[r['resourceId'], r['quantity']] for r in road['progressions'][0]['fallbackRewards']],
    'modes': modes, 'theme': theme, 'boosters': boosters, 'fx': list(fx.values()),
    'trails': custom['trails'], 'ropes': custom['ropes'], 'menu': menu,
}
txt = json.dumps(meta, separators=(',', ':'), ensure_ascii=False)
open(os.path.join(GAME, 'data/meta.json'), 'w', encoding='utf-8').write(txt)
print('items', len(items), 'collections', len(collections), 'fx', len(fx), 'xp road', len(roads['progression.xp']),
      'meta.json', len(txt.encode()) // 1024, 'KB', 'menu.webp',
      os.path.getsize(os.path.join(GAME, 'art/menu.webp')) // 1024 if menu else '-', 'KB')
