"""Build the Lucky Drop (Pachinko) mode data: ../data/pachinko.json, ../art/pachinko.webp, ../art/pachinko-bg.webp.

    py -3 -I build_pachinko.py [REF=D:/stickman-hook-ref]

Reads  REF/dump/full/pachinko_raw.json        PachinkoGamePlayConfig + its 11 prefabs (tools/extract_mode.py)
       REF/dump/full/mode_pachinko_remote.json  pachinko rewards of the bundled remote settings
       REF/sprites/pachinko/*.png + sprites.json (tools/export_sprites.py on the pachinko config bundle, with deps)
       REF/sprites/pachinko_tex/{BG2,Bumper}.png (tools/pachinko_textures.py: textures that are not sprites)
Writes ../data/pachinko.json   {v, settings, boards, pegs, parts, rewards, atlas}
       ../art/pachinko.webp    sprite atlas (lossy q85 + alpha), rect = [x, y, w, h, pivotX, pivotY, ppu, ppuY] like atlas.webp
       ../art/pachinko-bg.webp BGGlow texture (lossy: a soft gradient, 10x smaller than lossless)

Board recipes (`boards`) are PachinkoLevelSpawner.BuildLevel [asm 0x121335c] written as data, see docs/PACHINKO.md.
A point is [xBase, dx, yBase, dy]: base 'L'/'R' = left/right edge of the camera view, 'B'/'T' = bottom/top.
"""
import io
import json
import os
import sys
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
raw = json.load(io.open(os.path.join(REF, 'dump/full/pachinko_raw.json'), encoding='utf-8'))
remote = json.load(io.open(os.path.join(REF, 'dump/full/mode_pachinko_remote.json'), encoding='utf-8'))['pachinko']
SPR = os.path.join(REF, 'sprites/pachinko')
smeta = json.load(io.open(os.path.join(SPR, 'sprites.json'), encoding='utf-8'))
cfg = raw['config']
pf = raw['prefabs']


def r4(v):
    return round(v, 4)


# ---- settings (PachinkoGamePlaySettings) ----
settings = {k: (r4(cfg[k]) if isinstance(cfg[k], float) else cfg[k]) for k in (
    'TargetRandomness', 'TargetDistance', 'Disappearing', 'DisappearingTimer', 'Bounce', 'GravityMultiplier', 'AlwaysCoin',
    'CameraSize', 'NumberOfBuckets', 'minBonusPercentage', 'maxBonusPercentage')}


def comp(node, name):
    return (node.get('c') or {}).get(name, [None])[0]


def child(node, name):
    for c in node.get('ch') or []:
        if c.get('name') == name:
            return c
    return None


# ---- pegs: collider, physics material bounciness (PhysicsMaterial2D dump, combine Maximum), _minBumpForce, sprites ----
BOUNCE = {'PachinkoPegBallBounciness': 0.8, 'PachinkoPegRectBounciness': 0.6, 'PachinkoPegTriBounciness': 1.0,
          'PachinkoWallBounciness': 0.5, 'BumperSameBounce': 1.0, 'NoFriction': 0.0}
pegs = {}
for kind, prefab, conf in (('dot', 'PachinkoPeg', '_circlePegConfig'), ('rect', 'PachinkoPegRect', '_rectanglePegConfig'),
                           ('tri', 'PachinkoPegTri', '_trianglePegConfig')):
    p = pf[prefab]
    mono = comp(p, prefab)
    sc = p['s'][0]
    pc = cfg[conf]
    spr = {k[1:-6]: pc[k].split(':')[1] for k in ('_specialSprite', '_neutralSprite', '_litSprite', '_extraSprite')}
    inner = child(child(p, 'Visual'), 'Inner')
    d = {'minBump': r4(mono['_minBumpForce']), 'sprites': spr, 'visual': r4(inner['s'][0] * sc)}
    if kind == 'dot':
        c = comp(p, 'CapsuleCollider2D')
        d['circle'] = r4(c['m_Size']['x'] / 2 * sc)
        d['bounce'] = BOUNCE[c['pmat']]
    elif kind == 'rect':
        c = comp(p, 'BoxCollider2D')
        d['box'] = [r4(c['m_Size']['x'] * sc), r4(c['m_Size']['y'] * sc)]
        d['bounce'] = BOUNCE[c['pmat']]
    else:
        c = comp(p, 'PolygonCollider2D')
        d['poly'] = [r4(v * sc) for pt in c['m_Points']['m_Paths'][0] for v in (pt['x'], pt['y'])]
        d['bounce'] = BOUNCE[c['pmat']]
    pegs[kind] = d

# ---- bucket parts and walls (prefab colliders, local units; bucket wall/corner/floor sit on the view's bottom edge) ----
def boxes(node):
    return [[r4(b['m_Offset']['x']), r4(b['m_Offset']['y']), r4(b['m_Size']['x']), r4(b['m_Size']['y']), BOUNCE.get(b.get('pmat'), 0)]
            for b in (node.get('c') or {}).get('BoxCollider2D', [])]


bw = pf['PachinkoBucketWall']
parts = {
    'bucketWall': {'boxes': boxes(bw), 'circle': [0, r4(comp(bw, 'CircleCollider2D')['m_Offset']['y']),
                                                  r4(comp(bw, 'CircleCollider2D')['m_Radius']), BOUNCE['PachinkoWallBounciness']]},
    'bucketCorner': {'boxes': boxes(pf['PachinkoBucketCorner'])},
    'bucketFloor': {'boxes': boxes(pf['PachinkoBucketFloor'])[:1]},
    'wall': {'bounce': BOUNCE['BumperSameBounce'], 'bumpLength': comp(pf['PachinkoWall'], 'PachinkoWall')['BumpLength']},
}
sp = pf['PachinkoLevelSpawner']
bump = child(sp, 'PachinkoBumperStart')
cap = comp(bump, 'CapsuleCollider2D')
parts['bumper'] = {'size': [r4(cap['m_Size']['x'] * bump['s'][0]), r4(cap['m_Size']['y'] * bump['s'][1])], 'bounce': BOUNCE[cap['pmat']]}
tg = child(sp, 'Target')
parts['target'] = {'scale': tg['s'][0]}
rw = comp(pf['PachinkoCurrencyReward'], 'BoxCollider2D')
parts['rewardTrigger'] = [r4(rw['m_Offset']['x']), r4(rw['m_Offset']['y']), r4(rw['m_Size']['x']), r4(rw['m_Size']['y'])]
pl = pf['PlayerPachinko']
plc = comp(pl, 'PlayerControllerPachinko')
parts['player'] = {'gravityScale': r4(comp(pl, 'Rigidbody2D')['m_GravityScale']), 'timeToSpawn': plc['timeToSpawn'],
                   'growth': plc['growthDuration']}
# bucket i shows BucketGlowSprites[|i - n/2| % 3] [asm 0x12129ec..0x1212b04]
parts['glows'] = [s.split(':')[1] for s in cfg['BucketGlowSprites']]

# ---- board recipes: PachinkoLevelSpawner.BuildLevel per PachinkoLevelType ----
# Shared by every type [asm 0x12133f4..0x12134b0]: R = min(halfWidth - 0.5, halfHeight - 3.75), C = view centre + down * 0.5.
# FillRectangleWithPegs is always called with randomness 0, so TargetRandomness never jitters a peg in this build.
boards = [
    # 0 FULL_PEGS [asm 0x12134d4..0x1213570]
    {'name': 'FULL_PEGS', 'ops': [['fill', ['L', 0, 'B', 3], ['R', 0, 'T', -3.5], 0]]},
    # 1 HEXAGON [asm 0x1213a08..0x1213ab8, body 0x12141a4..0x121436c, then 0x12147c8..0x1214854]
    {'name': 'HEXAGON', 'ops': [
        ['hexRect', ['L', 0, 'B', 6], ['R', 0, 'T', -2.5], 4, False, [['cup', 1.5, 0.65, 0, 1.25], ['flower', 2, 0.5]]],
        ['fill', ['L', 0, 'B', 3], ['R', 0, 'B', 6.5], 0]]},
    # 2 BIG_CIRCLE [asm 0x121360c..0x12137c0]: two open rings of rect pegs around C + up
    {'name': 'BIG_CIRCLE', 'ops': [['bigCircle'], ['fill', ['L', 0, 'B', 3], ['R', 0, 'B', 4.5], 0]]},
    # 3 PEGS_AND_CUPS [asm 0x12137c8..0x1213934, body 0x1213fd4..0x1213ff0, then 0x1214704..0x1214788]
    {'name': 'PEGS_AND_CUPS', 'ops': [
        ['fill', ['L', 0, 'B', 8.25], ['R', 0, 'T', -3.5], 0],
        ['line', ['L', 0, 'B', 7.75], ['R', 0, 'B', 7.75], 3, True, [['cup', 1, 0.65, 0, 2]]],
        ['fill', ['L', 0, 'B', 3], ['R', 0, 'B', 6.25], 0]]},
    # 4 CONCENTRIC_PEG_CIRCLES [asm 0x1213574..0x1213608]
    {'name': 'CONCENTRIC_PEG_CIRCLES', 'ops': [['concentric', 3, 0.75]]},
    # 5 PEGS_AND_SLOPES [asm 0x1213b1c..0x1213d04]: both shelves at the same height (FillWithSlopesSameHeight)
    {'name': 'PEGS_AND_SLOPES', 'ops': [
        ['fill', ['L', 0, 'B', 8.25], ['R', 0, 'T', -3.5], 0],
        ['slopes', ['L', 0, 'B', 6.75], ['R', 0, 'B', 6.75], 0.4],
        ['fill', ['L', 0, 'B', 3], ['R', 0, 'B', 5.25], 0]]},
    # 6 CUPS [asm 0x1213d08..0x1213e30, body 0x121462c..0x121464c, then 0x12148dc..0x1214980]
    {'name': 'CUPS', 'ops': [
        ['hexRect', ['L', 0.25, 'B', 4.5], ['R', -0.25, 'T', -2], 3, False, [['cup', 1, 0.65, 0, 2]]],
        ['fill', ['L', 0, 'B', 3], ['R', 0, 'B', 4.5], 0]]},
    # 7 LOOP: no case in BuildLevel; the default logs 'Invalid level type {0}' and builds Random.Range(0, 7) [asm 0x1213994..0x1213a00]
    {'name': 'LOOP', 'ops': [['random', 7]]},
]

rewards = {
    'main': [[o['reward']['resourceId'], o['weight']] for o in remote['mainRewardOptions']],
    'secondary': [[o['reward']['resourceId'], o['reward']['quantity'], o['weight']] for o in remote['secondaryRewardOptions']],
}

# ---- atlas ----
SCALE = {'Peg': 0.4, 'HitRing': 0.4, 'Hook': 0.4}  # ~70 px per peg: 2x the on-screen size of a 0.5-unit peg on a phone
names = ['PegIdleDot', 'PegIdleRect', 'PegIdleTri', 'PegTouchedDot', 'PegTouchedRect', 'PegTouchedTri', 'PegSpecialDot',
         'PegSpecialRect', 'PegSpecialTri', 'PegExtraDot', 'PegExtraRect', 'PegExtraTri', 'BucketCorner', 'BucketCornerFront',
         'BucketFloor', 'BucketFloorFront', 'BucketGlowGreen', 'BucketGlowPurple', 'BucketGlowYellow', 'BucketWall',
         'BucketWallFront', 'HitRing', 'Hook']
items = []
for name in names:
    md = smeta[name]
    im = Image.open(os.path.join(SPR, name + '.png')).convert('RGBA')
    s = next((v for k, v in SCALE.items() if name.startswith(k)), 1.0)
    if s != 1.0:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    sx, sy = im.width / md['w'], im.height / md['h']
    bbox = im.getbbox() or (0, 0, 1, 1)
    im = im.crop(bbox)
    items.append((name, im, md['px'] * sx - bbox[0], md['py'] * sy - bbox[1], md['ppu'] * sx, md['ppu'] * sy))
# Bumper: texture of the DeformableMesh2D, stretched over the capsule size; pivot centre, ppu so it spans `size`.
bim = Image.open(os.path.join(REF, 'sprites/pachinko_tex/Bumper.png')).convert('RGBA')
bim = bim.resize((bim.width // 2, bim.height // 2), Image.LANCZOS)
items.append(('Bumper', bim, bim.width / 2, bim.height / 2, bim.width / parts['bumper']['size'][0], bim.height / parts['bumper']['size'][1]))

items.sort(key=lambda t: -t[1].height)
W = 512
x = y = shelf = 0
rects = {}
PAD = 2
for name, im, px, py, ppu, ppuy in items:
    if x + im.width + PAD > W:
        x = 0
        y += shelf + PAD
        shelf = 0
    rects[name] = [x, y, im.width, im.height, round(px, 2), round(py, 2), round(ppu, 3), round(ppuy, 3)]
    x += im.width + PAD
    shelf = max(shelf, im.height)
H = y + shelf
atlas = Image.new('RGBA', (W, H))
for name, im, *_ in items:
    r = rects[name]
    atlas.paste(im, (r[0], r[1]))
# lossy with alpha: the glossy gradients survive q85 and the file is 3x smaller than lossless
atlas.save(os.path.join(GAME, 'art/pachinko.webp'), quality=85, alpha_quality=90, method=6)
bg = Image.open(os.path.join(REF, 'sprites/pachinko_tex/BG2.png')).convert('RGB').resize((256, 512), Image.LANCZOS)
bg.save(os.path.join(GAME, 'art/pachinko-bg.webp'), quality=72, method=6)

data = {'v': 1, 'settings': settings, 'boards': boards, 'pegs': pegs, 'parts': parts, 'rewards': rewards,
        'atlas': {'w': W, 'h': H, 'rects': rects}}
txt = json.dumps(data, separators=(',', ':'))
io.open(os.path.join(GAME, 'data/pachinko.json'), 'w', encoding='utf-8').write(txt)
for f in ('data/pachinko.json', 'art/pachinko.webp', 'art/pachinko-bg.webp'):
    print(f, os.path.getsize(os.path.join(GAME, f)), 'bytes')
print('atlas', W, H, len(rects), 'sprites')
