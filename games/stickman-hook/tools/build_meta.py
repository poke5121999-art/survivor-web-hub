"""Compile the original economy (bundled default remote settings) into the web game's meta table.

    py -3 -I build_meta.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/full/remote_settings_default.json   (customization, progression_road, game_modes, theme, rarity, booster)
       REF/apk/assets/aa/Android/*.bundle            (menu icons and the skin effect materials, via UnityPy)
       ../data/custom.json                           (tools/build_custom.py: trail and rope render data)
Writes ../data/meta.json, ../art/menu.webp and, for js/bonus.js, ../data/bonus.json, ../art/wheel.webp, ../art/piggy.webp,
       ../art/skip.webp

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
bonus.json (js/bonus.js):
  wheel:       lucky_wheel config {prices, pools: [[poolId, rarity, weight, [[res, qty]...]]], forced} plus LuckyWheelSettings
               (resources.assets 'LuckyWheelConfig'): items, at (reward index), spin, recenter, curve keys [t, v, in, out], ticker
  piggy:       {fill: [[claimsThreshold, levelComplete, rewarded, iap]], rewards: skin ids, max}
  offers:      {freeCoins, skipPrice: [res, qty] of a rewarded ad, tickets: [[qty, coins]]}; skipCard: card.skip_level
               [minEffect, maxEffect, graduation, maxLevel]; periodic: {daily.free_coins: [qty, unit, isUtc]}
  wheelArt, piggyArt: rects in art/wheel.webp / art/piggy.webp, [x, y, w, h(, border l, b, r, t)]; also art/skip.webp
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


def named_sprites(address, names):
    """Sprites by name from a prefab bundle and its dependencies: {name: Sprite}."""
    sys.path.insert(0, os.path.join(REF, 'tools'))
    from shenv import load_with_deps
    env = load_with_deps(os.path.basename(bundle_for(address)))
    out = {}
    for o in env.objects:
        if o.type.name != 'Sprite': continue
        try: n = o.peek_name()
        except Exception: n = o.read().m_Name
        if n in names and n not in out: out[n] = o.read()
    return out


def first_sprite(address):
    b = bundle_for(address)
    return next((o.read() for o in UnityPy.load(b).objects if o.type.name == 'Sprite'), None) if b else None


def pack(entries, path, width=1024, quality=80):
    """Shelf-pack [(key, RGBA image, border or None)] into one webp; rect = [x, y, w, h(, l, b, r, t, k)].
    border = [l, b, r, t, scale] of the source sprite; the image was scaled by `scale`, so the rect keeps the scaled border
    in sheet pixels and k = 1 / scale: the size of one sheet pixel in reference UI units."""
    rects = {}
    x = y = shelf = 0
    for key, im, _ in sorted(entries, key=lambda e: -e[1].height):
        if x + im.width > width: x = 0; y += shelf + 2; shelf = 0
        rects[key] = [x, y, im.width, im.height]; x += im.width + 2; shelf = max(shelf, im.height)
    sheet = Image.new('RGBA', (width, y + shelf))
    for key, im, border in entries:
        sheet.paste(im, tuple(rects[key][:2]))
        if border and any(border[:4]):
            k = border[4] if len(border) > 4 else 1
            rects[key] += [round(v * k) for v in border[:4]] + [round(1 / k, 3)]
    sheet.save(os.path.join(GAME, path), quality=quality, method=6)
    rects['_size'] = [width, y + shelf]
    return rects


def sprite_im(sp, scale=1.0, tint=None):
    im = sp.image.convert('RGBA')
    if scale != 1: im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    if tint:  # bake a UI Image colour (multiply) into the pixels
        r, g, b, a = im.split()
        r, g, b = (ch.point(lambda v, k=k: round(v * k)) for ch, k in zip((r, g, b), tint[:3]))
        a = a.point(lambda v: round(v * tint[3]))
        im = Image.merge('RGBA', (r, g, b, a))
    return im


def fit(im, n):
    im = im.crop(im.getbbox() or (0, 0, 1, 1))
    im.thumbnail((n, n), Image.LANCZOS)
    return im


def lucky_wheel_settings():
    """LuckyWheelSettings 'LuckyWheelConfig' in resources.assets (no typetree in data.unity3d): read the raw fields in
    declaration order: _nbItemsToDisplay, _rewardItemIndex, _interpolationCurves, _spinDurationSeconds,
    _recenterDurationSeconds, _tickerPinOffset, _maxTickerAngle, _tickerDownDistance, _tickerUpSpeed."""
    import struct
    env = UnityPy.load(os.path.join(REF, 'apk/assets/bin/Data/data.unity3d'))
    for o in env.objects:
        if o.type.name != 'MonoBehaviour' or o.assets_file.name != 'resources.assets': continue
        raw = o.get_raw_data()
        nl, = struct.unpack_from('<i', raw, 28)
        if not 0 < nl < 64 or raw[32:32 + nl] != b'LuckyWheelConfig': continue
        p = (32 + nl + 3) & ~3
        items, at = struct.unpack_from('<ii', raw, p); p += 8
        n, = struct.unpack_from('<i', raw, p); p += 4
        curves = []
        for _ in range(n):
            nk, = struct.unpack_from('<i', raw, p); p += 4
            keys = []
            for _ in range(nk):  # Keyframe: time, value, inSlope, outSlope, weightedMode, inWeight, outWeight
                t, v, i, s, _w, _a, _b = struct.unpack_from('<ffffiff', raw, p); p += 28
                keys.append([round(t, 5), round(v, 5), round(i, 5), round(s, 5)])
            p += 12  # pre/post wrap mode, rotation order
            curves.append(keys)
        spin, recenter, pin, angle, down, up = struct.unpack_from('<6f', raw, p)
        return {'items': items, 'at': at, 'curve': curves[0], 'spin': round(spin, 3), 'recenter': round(recenter, 3),
                'ticker': [round(pin, 3), round(angle, 3), round(down, 3), round(up, 3)]}
    raise SystemExit('LuckyWheelConfig not found in data.unity3d')


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
# nbLevelsPerTheme: the APK default is 5, but the live game changes theme every 4 levels in all three clips (2019 levels
# 1-4 / 5-8 / 9.., 2023 89-92 / 93-96 / 97-100, 2026 43-46 / 47-50 / 51-54; docs/PARITY.md). Remote config overrides
# it, and SetGameModeTheme divides by it [asm 0x118fb64..0x118fc00], so the server value is used here.
NB_LEVELS_PER_THEME = 4
theme = {'levels': [[t[k] for k in COLS] for t in th['levelColors']], 'perTheme': NB_LEVELS_PER_THEME,
         'modes': {t['gameModeId']: [t[k] for k in COLS] for t in th['gameModes']}}
boosters = {b['id']: [b['displayName'], b['rarityId']] for b in rs['booster']['boosters']}

# ---- menu icons ------------------------------------------------------------------------------------------------
ICONS = {'coin': 'Sprites/Currencies/SkinCoins', 'xp': 'Sprites/Currencies/Xp'}
for m in rs['game_modes']['modes']:
    if m.get('iconAddress'): ICONS[m['id']] = m['iconAddress']
for r in ('Common', 'Epic', 'Legendary'):
    ICONS['booster.' + r.lower()] = 'Boosters/%s/NoOutline' % r
ICONS.update({'ticket': 'Sprites/Currencies/SkipTickets', 'coinpile': 'Sprites/Currencies/SkinCoinsPile'})
ICON_PX = {'coin': 64, 'xp': 64, 'ticket': 64, 'coinpile': 64, 'wheel': 80}
# sprites that are not addressable on their own: (prefab address whose dependencies hold it, sprite name)
NAMED_ICONS = {'wheel': ('UI/Pages/Home', 'Icon_LuckyWheel')}
menu = {}
if UnityPy:
    ims = []
    for key, addr in list(ICONS.items()) + list(NAMED_ICONS.items()):
        if isinstance(addr, tuple):
            sp = named_sprites(addr[0], [addr[1]]).get(addr[1])
            if not sp: print('NO ICON', addr); continue
        else:
            b = bundle_for(addr)
            if not b: print('NO ICON BUNDLE', addr); continue
            env = UnityPy.load(b)
            sp = next((o.read() for o in env.objects if o.type.name == 'Sprite'), None)
        im = sp.image.convert('RGBA')
        im = im.crop(im.getbbox() or (0, 0, 1, 1))
        n = ICON_PX.get(key, 96)
        im.thumbnail((n, n), Image.LANCZOS)
        # centred on a square: main.js icon() fits the rect into a square box, a narrow rect would show its neighbours
        sq = Image.new('RGBA', (max(im.size),) * 2)
        sq.paste(im, ((sq.width - im.width) // 2, (sq.height - im.height) // 2))
        ims.append((key, sq))
    x = y = shelf = 0; W = 512
    for key, im in sorted(ims, key=lambda t: -t[1].height):
        if x + im.width > W: x = 0; y += shelf + 2; shelf = 0
        menu[key] = [x, y, im.width, im.height]; x += im.width + 2; shelf = max(shelf, im.height)
    sheet = Image.new('RGBA', (W, y + shelf))
    menu['_size'] = [W, y + shelf]
    for key, im in ims: sheet.paste(im, tuple(menu[key][:2]))
    sheet.save(os.path.join(GAME, 'art/menu.webp'), quality=82, method=6)

# ---- Lucky Wheel, piggy bank, market offers, skip level ------------------------------------------------------
lw = rs['lucky_wheel']
wheel = {
    'prices': [[p['resourceId'], p['quantity']] for p in lw['prices']],
    # [poolId, rarity, weight, [[resourceId, qty]...]]; the last config entry is a stray {"poolId": 0}
    'pools': [[p['poolId'], p['rarityId'], p['weight'], [[i['resourceId'], i['quantity']] for i in p.get('items', [])]]
              for p in lw['rewardPools'] if isinstance(p.get('poolId'), str)],
    'forced': [[r['resourceId'], r['quantity']] for r in lw.get('forcedRewards', [])],
}
pb = rs['piggy_bank']
piggy = {'fill': [[c['threshold'], c['levelComplete'], c['rewarded'], c['iap']] for c in pb['fillConfigs']],
         'rewards': pb['rewardIds'], 'max': 100}  # PiggyBankService.AddProgress clamps to 100 [asm 0x1175c48]
content = rs['market']['offerContent']
offer_qty = lambda oid, res: next(c['reward']['quantity'] for c in content
                                  if c['sourceId'] == oid and c['reward']['resourceId'] == res)
skip_price = next(p['skipPrice'] for p in rs['ads']['placements'] if p['placementId'] == 'rewarded.default')
TICKET_COINS = 50  # [ĐỀ XUẤT] IAP packs paid in coins: 20 tickets = 1000 coins, the cheapest coin pack (offer.coins_1)
offers = {
    'freeCoins': offer_qty('offer.free_coins', 'currency.skin_coins'),
    'skipPrice': [skip_price['resourceId'], skip_price['quantity']],
    'tickets': [[q, q * TICKET_COINS] for q in (offer_qty('offer.skip_tickets_%d' % i, 'currency.skip_tickets') for i in (1, 2, 3))],
}
card = next(c for c in rs['cards']['cards'] if c['id'] == 'card.skip_level')
skip_card = [card['minEffect'], card['maxEffect'], card['effectGraduation'], card['cardMaxLevel']]
wheel_art = piggy_art = {}
if UnityPy:
    wheel.update(lucky_wheel_settings())
    POPUP = ['FortuneWheel_Background', 'BG_CenterSpin', 'Shadow', 'Reflect', 'Arrow', 'BoltBig_Off', 'BoltBig_On', 'BoltSmallOff',
             'BoltSmallOn', 'StarsOff', 'StarsOn', 'Title', 'Dice', 'Nail', 'OutlinedButtonGold', 'InfoButton', 'ShinySun']
    sp = named_sprites('UI/Popups/LuckyWheel', POPUP)
    # Image colours of the prefab: Shadow (0.2, 0.2, 0.2, 0.6), Sun (0.1, 0.5, 1, 0.7); Sun is drawn 800 wide, halve it
    TINT = {'Shadow': (0.2, 0.2, 0.2, 0.6), 'ShinySun': (0.1, 0.5, 1.0, 0.7)}
    # [ĐỀ XUẤT] smaller sheet: stretched / sliced sprites are stored at a lower scale (borders scale with them)
    SCALE = {'ShinySun': 0.4, 'Dice': 0.5, 'StarsOn': 0.6, 'StarsOff': 0.6, 'FortuneWheel_Background': 0.5, 'BG_CenterSpin': 0.4, 'Shadow': 0.3, 'Reflect': 0.5,
             'OutlinedButtonGold': 0.6}
    entries = []
    for n in POPUP:
        s = sp[n]; b = s.m_Border
        entries.append((n, sprite_im(s, SCALE.get(n, 1), TINT.get(n)), [b.x, b.y, b.z, b.w, SCALE.get(n, 1)]))
    for r in ('Common', 'Epic', 'Legendary'):
        s = first_sprite('Rarities/%s/LuckyWheelHolder' % r); b = s.m_Border
        entries.append(('holder.' + r.lower(), sprite_im(s, 0.5), [b.x, b.y, b.z, b.w, 0.5]))
        entries.append(('booster.' + r.lower(), fit(sprite_im(first_sprite('Boosters/%s/NoOutline' % r)), 96), None))
    entries.append(('card', fit(sprite_im(named_sprites('UI/Popups/LuckyWheel/Info', ['Icon_Card'])['Icon_Card']), 96), None))
    entries.append(('coin', fit(sprite_im(first_sprite('Sprites/Currencies/SkinCoins')), 40), None))
    by_id = {i['itemId']: i for i in cz['items']}
    for pool in wheel['pools']:
        for res, _ in pool[3]:
            if res in by_id: entries.append((res, fit(sprite_im(first_sprite(by_id[res]['uiAssetAddress'])), 96), None))
    wheel_art = pack(entries, 'art/wheel.webp')
    # piggy bank: the next skin's UI sprite, filled from the bottom; the in-game skip button (ticket variant)
    entries = [(res, fit(sprite_im(first_sprite(by_id[res]['uiAssetAddress'])), 128), None) for res in piggy['rewards']]
    piggy_art = pack(entries, 'art/piggy.webp', 512, 75)
    skip = named_sprites('UI/Pages/InGame/Default', ['SkipButtonTicket_01'])['SkipButtonTicket_01']
    sprite_im(skip, 0.5).save(os.path.join(GAME, 'art/skip.webp'), quality=82, method=6)

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
# loaded with js/bonus.js only (home screen, first death or finish of a Normal level), never by the first level
bonus = {
    'v': 1, 'wheel': wheel, 'piggy': piggy, 'offers': offers, 'skipCard': skip_card,
    'periodic': {r['resourceId']: [r['frequency']['quantity'], r['frequency']['unit'], r['isUtc']]
                 for r in rs['periodic_resources']['resources'] if r['resourceId'] == 'daily.free_coins'},
    'wheelArt': wheel_art, 'piggyArt': piggy_art,
}
open(os.path.join(GAME, 'data/bonus.json'), 'w', encoding='utf-8').write(json.dumps(bonus, separators=(',', ':'), ensure_ascii=False))
print('items', len(items), 'collections', len(collections), 'fx', len(fx), 'xp road', len(roads['progression.xp']),
      'meta.json', len(txt.encode()) // 1024, 'KB', 'menu.webp',
      os.path.getsize(os.path.join(GAME, 'art/menu.webp')) // 1024 if menu else '-', 'KB')
