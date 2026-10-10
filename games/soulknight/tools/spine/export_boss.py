# Bóc dữ liệu trùm Spine NGOÀI bể của build_bosses86.py (4B/4C) thành tệp riêng, không đụng data/sk-bosses86.js:
#   python export_boss.py boss_abyssal_submariner [boss_x ...]
# Ghi: art/spine/<trùm>/data.js (gộp vào window.SK_BOSSES86.bosses/bullets/info/spriteKeys/alias lúc nạp trang),
#      tools/extra/spine2.json (bundle + sprite + png cho bộ dựng atlas build_sk.py; chạy build_sk qua khoá).
# Dùng lại các hàm bóc của tools/bosses/build_bosses86.py (rig, MonoBehaviour, đạn đệ quy).
import collections, hashlib, io, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'bosses')); sys.path.insert(0, os.path.join(HERE, '..'))
import build_bosses86 as B
OUT_EXTRA = os.environ.get('SK_EXTRA') or os.path.join(HERE, '..', 'extra', 'spine2.json')   # SK_EXTRA: tệp extra riêng (vd tools/extra/spine4b.json)
enemies = B.jload('config', 'enemies.json'); loc = B.jload('localization_en_vi.json')
out = {'bosses': {}, 'bullets': {}, 'info': {}}
want = []
extra_bul = {}   # tên tay khi đạn nằm trong PlayMakerFSM/clip: --bul=<pid>:a,b
ids = []
for a in sys.argv[1:]:
    if a.startswith('--bul='):
        k, v = a[6:].split(':'); extra_bul[k] = v.split(',')
    else: ids.append(a)
for pid in ids:
    row = enemies[pid]
    m = re.match(r'.*/Boss/([^/]+)/', row['Path'], re.I)
    bundle = 'boss/' + m.group(1).lower()
    root, rel = B.find_root(pid, [bundle + '.ab'])
    rig = B.rig_export(root)
    ent = {'bundle': rel, 'rig': rig, 'hp': row.get('Hp'), 'speed': row.get('Speed'),
           'name': ({'en': loc[pid][0], 'vi': loc[pid][1]} if pid in loc else {}), 'ai': None, 'weapon': row.get('BossWeapon'),
           'bgm': (row.get('BossBgm') or '').split('/')[-1].replace('.mp3', ''), 'sub': row.get('SubspeciesBoss') or None, 'level': row.get('LevelKey')}
    B.MB_SPRITES[0] = True
    for cls, mcab, mt in root.mbs():
        if cls and cls != 'RGNetBehaviour': ent.setdefault('mbs', {})[cls] = B.plain(mt, mcab)
    B.MB_SPRITES[0] = False
    ent['ai'] = next((c for c in ent.get('mbs', {}) if re.match(r'Boss|AI', c)), None)
    out['bosses'][pid] = ent
    want += B.refs_in(ent.get('mbs', {}), []) + extra_bul.get(pid, [])
    for nd in rig['nodes']: want += B.refs_in(nd.get('mbs', {}), [])
    inf, _ = B.find_root(pid + '_info', [bundle + '.ab'])
    if inf is not None: out['info'][pid] = B.rig_export(inf, ui=True)
    print('boss', pid, len(rig['nodes']), 'nút')
seen = set(); rels = sorted({b['bundle'] for b in out['bosses'].values()})
while want:
    nm = want.pop(0)
    if nm in seen or nm in out['bosses']: continue
    seen.add(nm)
    root, rel = B.find_root(nm, rels + [r + '.ab' for r in B.BULLET_BUNDLES])
    if root is None: print(' ! thiếu', nm); continue
    rig = B.rig_export(root); mbs = {}
    for cls, mcab, mt in root.mbs():
        if cls and cls != 'RGNetBehaviour': mbs[cls] = B.plain(mt, mcab)
    for nd in rig['nodes'][1:]:
        for cls, v in (nd.get('mbs') or {}).items(): mbs.setdefault(cls, v)
    out['bullets'][nm] = {'bundle': rel, 'rig': rig, 'mbs': mbs}
    want += B.refs_in(mbs, [])
    print('bullet', nm, len(rig['nodes']))
by_b = collections.defaultdict(list)
for nm, rel in sorted(B.sprites_used.items()): by_b[(rel or '?').replace('.ab', '')].append(nm)
extra = {'bundles': sorted(b for b in by_b if b != '?'), 'sprites': ['^(%s)$' % '|'.join(re.escape(n) for n in sorted(v)) for b, v in sorted(by_b.items())], 'png_anims': {}}
for nm, rel in sorted(B.ui_sprites.items()):
    extra['png_anims']['bossui_' + nm] = {'dir': (rel or 'ui').replace('.ab', ''), 'frames': [nm], 'fps': 1, 'loop': False, 'anchor': 'center', 'register': False}
groups = collections.defaultdict(list)
for nm in sorted(B.sprites_used):
    try: r = B.rip.sprite(*B.sprite_obj[nm])
    except Exception: r = None
    if r:
        _, img, ax, ay, ppu = r
        groups[(hashlib.md5(img.tobytes()).hexdigest(), img.size, round(ax), round(ay))].append(nm)
out['alias'] = {nm: g for g in groups.values() if len(g) > 1 for nm in g}
out['spriteKeys'] = extra['sprites']
# tệp extra: gộp với bản cũ (nhiều lần chạy cho nhiều trùm)
old = json.load(io.open(OUT_EXTRA, encoding='utf-8')) if os.path.exists(OUT_EXTRA) else {'bundles': [], 'sprites': [], 'png_anims': {}}
for k in ('bundles', 'sprites'): extra[k] = sorted(set(old.get(k, [])) | set(extra[k]))
extra['png_anims'] = dict(old.get('png_anims', {}), **extra['png_anims'])
with io.open(OUT_EXTRA, 'w', encoding='utf-8') as f: json.dump(extra, f, ensure_ascii=False, indent=1)
for pid in ids:
    d = os.path.join(HERE, '..', '..', 'art', 'spine', pid); os.makedirs(d, exist_ok=True)
    mine = {'bosses': {pid: out['bosses'][pid]}, 'bullets': out['bullets'], 'info': ({pid: out['info'][pid]} if pid in out['info'] else {}), 'alias': out['alias'], 'spriteKeys': out['spriteKeys']}
    with io.open(os.path.join(d, 'data.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi tools/spine/export_boss.py — đừng sửa tay. Gộp dữ liệu trùm ngoài bể build_bosses86 vào window.SK_BOSSES86.\n')
        f.write('(function () { var B = window.SK_BOSSES86; if (!B) return; var D = ' + json.dumps(mine, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('  Object.assign(B.bosses, D.bosses); Object.assign(B.bullets, D.bullets); Object.assign(B.info, D.info); Object.assign(B.alias, D.alias);\n  B.spriteKeys = (B.spriteKeys || []).concat(D.spriteKeys); })();\n')
    print('ghi data.js', pid, os.path.getsize(os.path.join(d, 'data.js')), 'byte')
print('sprite', len(B.sprites_used), 'ui', len(B.ui_sprites))
