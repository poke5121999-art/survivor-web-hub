"""Compile Adventure mode (AdventureGamePlayConfig) into data/mode-adventure.json + art/adventure.webp.

    py -3 -I build_adventure.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/full/adventure_raw.json        (tools/extract_mode.py on the adventure config bundle: 189 patterns)
       REF/dump/full/adventure_curves.json     (tools/adventure_curves.py: AdventureConfig curves, raw from data.unity3d)
       REF/dump/full/remote_settings_default.json (skills, skill cost, best-score road, weekly board, AI names)
       REF/sprites_adv/*.png + sprites.json, REF/sprites_adv/tex/*.png
                                               (tools/export_sprites.py / export_textures.py on the adventure bundle)
Writes ../data/mode-adventure.json  {v, cfg, skills, cost, road, board, tiers, patterns, atlas}
       ../art/adventure.webp       the Adventure-only sprites and particle textures (the first-level atlas is untouched)

Patterns compile through build_data.compile_pattern(adv=True). Their names clash with Normal's (FINISH00, ...) but the
prefabs differ, so they live in this file only and never merge with levels.json.
"""
import json
import math
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_data as B  # noqa: E402

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
GAME = os.path.dirname(HERE)
raw = json.load(open(os.path.join(REF, 'dump/full/adventure_raw.json'), encoding='utf-8'))
curves = json.load(open(os.path.join(REF, 'dump/full/adventure_curves.json'), encoding='utf-8'))
rs = json.load(open(os.path.join(REF, 'dump/full/remote_settings_default.json'), encoding='utf-8'))
C = raw['config']
P = raw['prefabs']
r4 = B.r4


def comp(prefab, name):
    return P[prefab]['c'][name][0]


tiers = [[B.ref(p) for p in d['_possiblePatterns']] for d in C['_difficulties']]
names = sorted({n for t in tiers for n in t})
patterns = {n: B.compile_pattern(P[n], adv=True) for n in names}

# BumperAdventure prefab: root scale 0.5, horizontal capsule; Instantiate(prefab, parent, true) keeps that world scale,
# then position and rotation are copied from the replaced bumper [asm 0x11ffb14..0x11ffbe4].
bp = P['BumperAdventure']
cap = bp['c']['CapsuleCollider2D'][0]
BS = bp['s'][0]
W, H = cap['m_Size']['x'] * BS, cap['m_Size']['y'] * BS
RAD = H / 2
HALF = max(0.0, W / 2 - RAD)
OX, OY = cap['m_Offset']['x'] * BS, cap['m_Offset']['y'] * BS
for p in patterns.values():
    for b in p['bumpers']:
        a = math.radians(b['r'])
        cs, sn = math.cos(a), math.sin(a)
        x, y = b['p']
        cx, cy = x + cs * OX - sn * OY, y + sn * OX + cs * OY
        b['cap'] = [r4(cx - cs * HALF), r4(cy - sn * HALF), r4(cx + cs * HALF), r4(cy + sn * HALF), r4(RAD)]
        b['m'] = [r4(cs * BS), r4(sn * BS), r4(-sn * BS), r4(cs * BS), x, y]
        del b['p'], b['r']
    if not p['sp']:
        del p['sp']
    for k in ('finish', 'spawns'):
        p.pop(k, None)

fw = comp('Firewall', 'Firewall')
fw_trig = next(ch for ch in P['Firewall']['ch'] if ch['name'] == 'Trigger')['c']['BoxCollider2D'][0]
gz = comp('GravityZone', 'GravityZone')
ta = comp('TargetAdventure', 'TargetAdventure')
ba = comp('BumperAdventure', 'BumperAdventure')


def trig(prefab):
    t = next(ch for ch in prefab['ch'] if ch['name'] == 'Trigger')
    return t['c']['PolygonCollider2D'][0]


def keys(c):
    return [[r4(k['t']), r4(k['v']), r4(k['in']), r4(k['out'])] for k in c['curve']['keys']]


cfg = {
    'gzChance': r4(C['_gravityZoneSpawnChance']), 'portalChance': r4(C['_portalSpawnChance']),
    'portalBonusDist': C['_maxPortalBonusDistance'], 'maxPatterns': C['_maxSpawnedPatterns'],
    'initialPatterns': C['_initialSpawnedPatterns'], 'maxVel': C['_playerMaxVelocity'], 'grabOnHold': C['_grabOnHold'],
    'inc': B.lit(C['_increaseDifficultyEveryXPatterns']),
    'firewall': {'delay': fw['startDelay'], 'mode': fw['firewallMode'], 'minSpeed': r4(fw['minSpeed']),
                 'maxSpeed': r4(fw['maxSpeed']), 'gain': r4(fw['speedGainPerSecond']), 'minDist': fw['minDistance'],
                 'maxDist': fw['maxDistance'],
                 # trigger box [offset x, offset y, w, h]
                 'box': [fw_trig['m_Offset']['x'], fw_trig['m_Offset']['y'], fw_trig['m_Size']['x'], fw_trig['m_Size']['y']]},
    'gz': {'size': [gz['size']['x'], gz['size']['y']], 'up': [gz['extraGravityUp']['x'], gz['extraGravityUp']['y']],
           'down': [gz['extraGravityDown']['x'], gz['extraGravityDown']['y']],
           # Trigger PolygonCollider2D (unit points; the Trigger child is scaled by `size`)
           'poly': [r4(v) for p in trig(P['GravityZone'])['m_Points']['m_Paths'][0] for v in (p['x'], p['y'])]},
    # Portal Trigger PolygonCollider2D, child scale 1.5 applied
    'portalPoly': [r4(v * 1.5) for p in trig(P['Portal'])['m_Points']['m_Paths'][0] for v in (p['x'], p['y'])],
    'target': {'timer': ta['timerDuration'], 'easing': ta['movingEasing'], 'speed': ta['speed'], 'distance': ta['distance'],
               'minMag': ta['minMagnitude']},
    'bounce': [r4(ba['defaultBounciness']), r4(ba['lowBounciness']), r4(ba['highBounciness'])],
    # AdventureConfig (AdventureSettings): curveProgression, curveBonus; the portal bonus curve is the same asset
    # (_portalBonusCurve = AdventureSkillProgressionBonus). Keys [time, value, inSlope, outSlope], weightedMode 0.
    'curves': {'prog': keys(curves['1721:AdventureSkillProgression']), 'bonus': keys(curves['1722:AdventureSkillProgressionBonus'])},
}

adv = rs['adventure']
skills = [[s['id'], s['maxLevel'], s['minValue'], s['maxValue'], s['badValue'], s['neutralValue'], s['goodValue'],
           s['minSize'], s['maxSize'], s['maxBonusMultiplier'], s['maxBonusDistance'], s['displayName'], s['bonusLevelCardId']]
          for s in adv['skills']]
cards = {c['id']: c for c in rs['cards']['cards']}
# GetSkillLevelMax = maxLevel + (int)CardEffectForLevel(bonusLevelCardId, cardMaxLevel) [asm 0x1269e30..0x1269e80]
for s in skills:
    c = cards[s[12]]
    s[12] = int(c['minEffect'] + c['effectGraduation'] * (c['cardMaxLevel'] - 1))
cost = [adv['global']['skillLevelUpCostStart']['quantity'], adv['global']['skillLevelUpCostIncrement']]

road = [[t['value'], [[r['item']['resourceId'], r['item']['quantity']] for r in t['rewards']]]
        for t in rs['progression_road']['thresholds'] if t['progressionRoadResourceId'] == 'progression.adventure_best_score']

lb = rs['leaderboard']
comp_ = next(x for x in lb['competitions'] if x['id'] == 'adventure')
ai = {a['id']: a for a in lb['aiDifficulties']}
rewards = next(x for x in lb['rewards'] if x['id'] == comp_['rewardsListId'])
pools = {p['id']: p['resourceIds'] for p in lb['rewardPools']}
sp = rs['social_profile']
board = {
    'board': {
        'participants': comp_['nbParticipants'], 'maxRankToWin': comp_['maxRankToWin'],
        'ai': [[[s['highPosition'], s['lowPosition'], s['startScore'], s['minOverallScore'], s['maxOverallScore']]
                for s in ai[d['id']]['segments']] for d in comp_['difficulties']],
        'rewards': [[r['position'], [[i['resourceId'], i['quantity']] for i in r['rewards']]] for r in rewards['positionRewards']],
        'pools': {k: v for k, v in pools.items() if k == 'reward_pool.adventure_skin'},
        'duration': comp_['duration'],
    },
    'names': sp['playerNames'], 'skins': sp['playerSkinIds'],
    'namePrefix': sp['global']['defaultNamePrefix'], 'nameChance': sp['global']['defaultNameChancePercent'],
    'nameMax': sp['global']['nameMaxLength'],
}

# ---- atlas: Adventure sprites + particle textures (downscaled) ----
SPR = os.path.join(REF, 'sprites_adv')
smeta = json.load(open(os.path.join(SPR, 'sprites.json')))
want = ['Target_Default', 'Target_Default_Hooked', 'Target_OneTime', 'Target_OneTime_Hooked', 'Chrono_Base', 'Chrono_Spire',
        'Chrono_Top', 'Target_Mooving_Hook', 'Target_Mooving_Hooked', 'Target_MoovingUp_Hook', 'Target_MoovingUp_Hooked',
        'HookRotate', 'HookedRotate', 'CircleGlow'] + \
       ['AN_Grap1_%sBumperLarge000%d' % (c, i) for c in ('Red', 'Golden') for i in range(1, 6)]
# particle textures: name -> px side in the atlas (ppu = side, so 1 world unit = the whole texture)
TEX = {'Texture': 256, 'glow': 64, 'fx_glow': 128, 'glow_1': 64, 'ring': 128, 'glow2': 128}
items = []
for name in want:
    im = Image.open(os.path.join(SPR, name + '.png')).convert('RGBA')
    md = smeta[name]
    sc = 0.5 if name == 'CircleGlow' else 1.0
    if sc != 1:
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    bbox = im.getbbox() or (0, 0, 1, 1)
    im = im.crop(bbox)
    items.append((name, im, md['px'] * sc - bbox[0], md['py'] * sc - bbox[1], md['ppu'] * sc))

def hsv_bake(im, shift, sat, bright):
    """MAT_LowBump (AllIn1SpriteShader HSV_ON: shift 340, saturation 1.06, brightness 1.24) baked like js/fx.js hsvShift"""
    import colorsys
    px = im.load()
    for yy in range(im.height):
        for xx in range(im.width):
            r, g, b, a = px[xx, yy]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h = ((h * 360 + shift) % 360) / 360
            r2, g2, b2 = colorsys.hsv_to_rgb(h, min(1, s * sat), min(1, v * bright))
            px[xx, yy] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im


LOW =(340.0, 1.06, 1.24)  # MAT_LowBump _HsvShift, _HsvSaturation, _HsvBright (dump/full/adventure_assets.json)
for i in range(1, 6):
    name = 'AN_Grap1_RedBumperLarge000%d' % i
    src = next(t for t in items if t[0] == name)
    items.append((name + '_Low', hsv_bake(src[1].copy(), *LOW), src[2], src[3], src[4]))
for name, side in TEX.items():
    im = Image.open(os.path.join(SPR, 'tex', name + '.png')).convert('RGBA').resize((side, side), Image.LANCZOS)
    items.append(('tex:' + name, im, side / 2, side / 2, side))
items.sort(key=lambda t: -t[1].height)
AW = 1024
x = y = shelf = 0
rects = {}
for name, im, px, py, ppu in items:
    if x + im.width + 2 > AW:
        x = 0; y += shelf + 2; shelf = 0
    rects[name] = [x, y, im.width, im.height, round(px, 2), round(py, 2), round(ppu, 3)]
    x += im.width + 2; shelf = max(shelf, im.height)
AH = y + shelf
atlas = Image.new('RGBA', (AW, AH))
for name, im, *_ in items:
    r = rects[name]; atlas.paste(im, (r[0], r[1]))
atlas.save(os.path.join(GAME, 'art/adventure.webp'), quality=90, method=6)

out = {'v': 1, 'cfg': cfg, 'skills': skills, 'cost': cost, 'road': road, 'board': board, 'tiers': tiers,
       'patterns': patterns, 'atlas': {'w': AW, 'h': AH, 'rects': rects}}
txt = json.dumps(B.ints(out), separators=(',', ':'))
open(os.path.join(GAME, 'data/mode-adventure.json'), 'w').write(txt)
print('tiers', [len(t) for t in tiers], 'patterns', len(patterns), 'targets', sum(len(p['targets']) for p in patterns.values()),
      'bumpers', sum(len(p['bumpers']) for p in patterns.values()), 'json', len(txt) // 1024, 'KB', 'atlas', AW, 'x', AH,
      os.path.getsize(os.path.join(GAME, 'art/adventure.webp')) // 1024, 'KB')
