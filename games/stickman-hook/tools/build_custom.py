"""Pack the exported skins, ropes and trails (tools/extract/export_skins.py) for the web game.

    py -3 -I build_custom.py [REF=D:/stickman-hook-ref]
Writes ../art/skins/<name>.webp (one sheet per skin, loaded when picked), ../art/custom-ui.webp (every shop icon),
../art/ropes.webp (rope textures) and ../data/custom.json.

custom.json:
  skins:  {name: {sheet: {sprite: [x,y,w,h,px,py,ppu]}, states: [7 frame lists by PlayerState], dance: {fps, frames}}}
  ropes:  {name: {rect: [x,y,w,h], ppu}}            texture tiled along the rope
  trails: {name: {time, width: [[t, w]...], colors: [[t, r,g,b,a]...]}}   TrailRenderer
  icons:  {"skins/name": [x,y,w,h], ...}
"""
import sys, os, re, json
from PIL import Image

REF = sys.argv[1] if len(sys.argv) > 1 else r'D:/stickman-hook-ref'
HERE = os.path.dirname(os.path.abspath(__file__)); GAME = os.path.dirname(HERE)
src = json.load(open(os.path.join(REF, 'custom/custom.json')))
SCALE = 0.5
ICON = 72
# PlayerState order: ROLL, FALL, HOOK, HOOK_FAST, HOOK_SLOW, HOOK_STOPPED, FINISHED; matched on the clip name's suffix.
STATE_SUFFIX = [('Rolling',), ('Falling',), ('Hooking',), ('HookedFast',), ('HookedSlow',), ('HookStopped', 'HookedStopped'),
                ('Finished',)]


def shelf_pack(items, width):
    x = y = shelf = 0; rects = {}
    for name, im in sorted(items, key=lambda t: -t[1].height):
        if x + im.width + 2 > width: x = 0; y += shelf + 2; shelf = 0
        rects[name] = (x, y); x += im.width + 2; shelf = max(shelf, im.height)
    return rects, y + shelf


def load_trim(path, scale, md):
    im = Image.open(path).convert('RGBA')
    if scale != 1:
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    bb = im.getbbox() or (0, 0, 1, 1)
    return im.crop(bb), md['px'] * scale - bb[0], md['py'] * scale - bb[1], md['ppu'] * scale


out = {'skins': {}, 'ropes': {}, 'trails': {}, 'icons': {}}
os.makedirs(os.path.join(GAME, 'art/skins'), exist_ok=True)
icons = []
total = 0
for name, sk in sorted(src['skins'].items()):
    d = os.path.join(REF, 'custom/skins', name)
    clips = sk.get('game', {})
    states = []
    for suffixes in STATE_SUFFIX:
        clip = next((c for n, c in clips.items() if n.endswith(suffixes) and 'Dance' not in n), None)
        states.append([f for f in clip['frames'] if f] if clip else [])
    if not any(states):
        print('NO GAME CLIPS', name); continue
    for i, s in enumerate(states):
        if not s: states[i] = states[1] or next(x for x in states if x)
    dance = next(iter(sk.get('dance', {}).values()), None)
    dframes = [f for f in dance['frames'] if f] if dance else []
    need = sorted(set(sum(states, []) + dframes))
    items, piv = [], {}
    for s in need:
        im, px, py, ppu = load_trim(os.path.join(d, s + '.png'), SCALE, sk['sprites'][s])
        items.append((s, im)); piv[s] = (px, py, ppu)
    rects, h = shelf_pack(items, 1024)
    sheet = Image.new('RGBA', (1024, h))
    for s, im in items:
        sheet.paste(im, rects[s])
    path = os.path.join(GAME, 'art/skins', name + '.webp')
    sheet.save(path, quality=80, method=6)
    total += os.path.getsize(path)
    out['skins'][name] = {
        'sheet': {s: [rects[s][0], rects[s][1], im.width, im.height, round(piv[s][0], 2), round(piv[s][1], 2), piv[s][2]]
                  for s, im in items},
        'states': states,
        'dance': {'fps': round(len(dframes) / dance['stop'], 2) if dance and dance['stop'] else 8, 'frames': dframes},
    }
    if sk.get('ui'):
        icons.append(('skins/' + name, os.path.join(d, sk['ui'] + '.png')))

for kind in ('ropes', 'trails'):
    for name, it in sorted(src[kind].items()):
        d = os.path.join(REF, 'custom', kind, name)
        if it.get('ui'):
            icons.append((kind + '/' + name, os.path.join(d, it['ui'] + '.png')))

rope_items = []
for name, it in sorted(src['ropes'].items()):
    key = next((k for k in it['sprites'] if k.lower().replace('_', '') == 'ingame'), None)
    if not key: print('NO ROPE SPRITE', name); continue
    sp = it['sprites'][key]
    im = Image.open(os.path.join(REF, 'custom/ropes', name, key + '.png')).convert('RGBA')
    rope_items.append((name, im)); out['ropes'][name] = {'ppu': sp['ppu']}
rects, h = shelf_pack(rope_items, 512)
sheet = Image.new('RGBA', (512, h))
for n, im in rope_items:
    sheet.paste(im, rects[n]); out['ropes'][n]['rect'] = [rects[n][0], rects[n][1], im.width, im.height]
sheet.save(os.path.join(GAME, 'art/ropes.webp'), lossless=True, method=6)

for name, it in sorted(src['trails'].items()):
    tr = [c['v'] for b in it.get('bundles', {}).values() for c in b if c['type'] == 'TrailRenderer']
    if not tr: continue
    p = tr[0]['m_Parameters']
    width = [[round(k['time'], 3), round(k['value'] * p['widthMultiplier'], 4)] for k in p['widthCurve']['m_Curve']]
    g = p['colorGradient']
    cols = []
    n = max(g.get('m_NumColorKeys', 2), g.get('m_NumAlphaKeys', 2))
    for i in range(g.get('m_NumColorKeys', 2)):
        c = g['key%d' % i]; t = g['ctime%d' % i] / 65535
        cols.append([round(t, 3), round(c['r'], 3), round(c['g'], 3), round(c['b'], 3)])
    alphas = [[round(g['atime%d' % i] / 65535, 3), round(g['key%d' % i]['a'], 3)] for i in range(g.get('m_NumAlphaKeys', 2))]
    out['trails'][name] = {'time': round(tr[0]['m_Time'], 3), 'width': width, 'colors': cols, 'alphas': alphas,
                           'particles': sum(1 for b in it['bundles'].values() for c in b if c['type'] == 'ParticleSystem')}

items = []
for key, path in icons:
    im = Image.open(path).convert('RGBA'); bb = im.getbbox() or (0, 0, 1, 1); im = im.crop(bb)
    im.thumbnail((ICON, ICON), Image.LANCZOS)
    items.append((key, im))
rects, h = shelf_pack(items, 1024)
sheet = Image.new('RGBA', (1024, h))
for k, im in items:
    sheet.paste(im, rects[k]); out['icons'][k] = [rects[k][0], rects[k][1], im.width, im.height]
sheet.save(os.path.join(GAME, 'art/custom-ui.webp'), quality=80, method=6)

json.dump(out, open(os.path.join(GAME, 'data/custom.json'), 'w'), separators=(',', ':'))
print('skins', len(out['skins']), 'sheets', total // 1024, 'KB; ropes', len(out['ropes']), '; trails', len(out['trails']),
      '; icons', len(out['icons']), os.path.getsize(os.path.join(GAME, 'art/custom-ui.webp')) // 1024, 'KB')
