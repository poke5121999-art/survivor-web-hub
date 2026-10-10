# -*- coding: utf-8 -*-
"""Bóc Tàu Ngoài Hành Tinh (alien_carrier_root, bundle defence.ab) + đạn của nó -> data/sk-ship.js
và thêm regex sprite vào tools/extra/defence.json (để build_sk.py cắt vào atlas).
Dùng lại hàm của tools/bosses/build_bosses86.py (rig_export, find_root, plain) nên cùng định dạng với sk-bosses86.js.
Chạy: ~/sk86-ref/venv/bin/python -I games/soulknight/tools/defence/export_ship.py
"""
import collections, hashlib, io, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(TOOLS, 'bosses'))
sys.path.insert(0, TOOLS)
import build_bosses86 as B  # noqa: E402

PID = 'boss_alien_ship'
SRC = 'alien_carrier_root'
OUT_JS = os.path.join(TOOLS, '..', 'data', 'sk-ship.js')
OUT_EXTRA = os.path.join(TOOLS, 'extra', 'defence.json')

enemies = B.jload('config', 'enemies.json')
loc = B.jload('localization_en_vi.json')
root, rel = B.find_root(SRC, ['defence.ab'])
rig = B.rig_export(root)
cfg = enemies.get(SRC) or {}
ent = {'bundle': rel, 'rig': rig, 'hp': cfg.get('Hp'), 'speed': cfg.get('Speed'),
       'name': {'en': 'Alien Aircraft Carrier', 'vi': (loc.get(SRC) or loc.get('boss_alien_carrier') or ['', 'Tàu Ngoài Hành Tinh'])[1] or 'Tàu Ngoài Hành Tinh'},
       'ai': 'AlienCarrier', 'weapon': None, 'bgm': '', 'sub': None, 'level': cfg.get('LevelKey')}
B.MB_SPRITES[0] = True
want = []
for cls, mcab, mt in root.mbs():
    if cls and cls != 'RGNetBehaviour':
        ent.setdefault('mbs', {})[cls] = B.plain(mt, mcab)
for nd in rig['nodes']:
    want += B.refs_in(nd.get('mbs', {}), [])
B.MB_SPRITES[0] = False
bullets, seen = {}, set()
while want:
    nm = want.pop(0)
    if nm in seen:
        continue
    seen.add(nm)
    r, rl = B.find_root(nm, ['defence.ab'] + [x + '.ab' for x in B.BULLET_BUNDLES])
    if r is None:
        print('thiếu', nm); continue
    g = B.rig_export(r)
    mbs = {}
    for cls, mcab, mt in r.mbs():
        if cls and cls != 'RGNetBehaviour':
            mbs[cls] = B.plain(mt, mcab)
    for nd in g['nodes'][1:]:
        for cls, v in (nd.get('mbs') or {}).items():
            mbs.setdefault(cls, v)
    bullets[nm] = {'bundle': rl, 'rig': g, 'mbs': mbs}
    want += B.refs_in(mbs, [])
    print('bullet', nm, rl, len(g['nodes']))
by_b = collections.defaultdict(list)
for nm, rl in sorted(B.sprites_used.items()):
    by_b[(rl or '?').replace('.ab', '')].append(nm)
keys = ['^(%s)$' % '|'.join(re.escape(n) for n in sorted(v)) for b, v in sorted(by_b.items())]
bundles = sorted(b for b in by_b if b != '?')
groups = collections.defaultdict(list)
for nm in sorted(B.sprites_used):
    try:
        r = B.rip.sprite(*B.sprite_obj[nm])
    except Exception:
        r = None
    if r:
        _, img, ax, ay, ppu = r
        groups[(hashlib.md5(img.tobytes()).hexdigest(), img.size, round(ax), round(ay))].append(nm)
alias = {nm: g for g in groups.values() if len(g) > 1 for nm in g}
out = {'v': 1, 'bosses': {PID: ent}, 'bullets': bullets, 'alias': alias, 'spriteKeys': keys}
js = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Sinh bởi tools/defence/export_ship.py từ Soul Knight 8.6.0 (defence.ab alien_carrier_root) — đừng sửa tay.\n')
    f.write('(function () { var S = ' + js + ', B = window.SK_BOSSES86; if (!B) return;\n')
    f.write('  function add(to, from) { for (var k in from) if (!to[k]) to[k] = from[k]; }   // không đè đạn / alias có sẵn của trùm khác\n')
    f.write('  add(B.bosses, S.bosses); add(B.bullets, S.bullets); add(B.alias, S.alias);\n')
    f.write('  B.spriteKeys = (B.spriteKeys || []).concat(S.spriteKeys); window.SK_SHIP = S; })();\n')
ex = json.load(io.open(OUT_EXTRA, encoding='utf-8'))
ex['bundles'] = sorted(set(ex['bundles']) | set(bundles))
ex['sprites'] = [s for s in ex['sprites'] if s not in keys and not s.startswith('^(') or s == '^magic_stone$'] + keys
ex['sprites'] = list(dict.fromkeys(ex['sprites']))
with io.open(OUT_EXTRA, 'w', encoding='utf-8') as f:
    json.dump(ex, f, ensure_ascii=False, indent=1)
print('sprites', len(B.sprites_used), 'bundles', bundles, 'bullets', len(bullets), 'bytes', len(js))
