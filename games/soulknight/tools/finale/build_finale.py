# -*- coding: utf-8 -*-
"""Kết thúc Chế độ Ải (Đá Phép ở 3-6) -> data/sk-finale.js + art/finale/atlas0.png.

Chạy (từ gốc repo): PYTHONIOENCODING=utf-8 py -3.12 -X utf8 games/soulknight/tools/finale/build_finale.py

Dùng lại hàm của build_sk.py (extract_prefab, packer, anims) nhưng ghi RIÊNG ra gói nhỏ để không đụng sk-data.js.
Nguồn [ĐO 8.6]: levelcommon.ab › magic_stone_0..6 (ObjectMagicStone: gốc objects2_20, con magic_stone/line1..4 có Animator),
brazier02 và wall403/wall404 (tường của map_GameOver = "3月6日" trong config/map_levels, sàn floor401..406).
"""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
import build_sk as B  # noqa: E402

# Nút con magic_stone (khối đá) tắt sẵn trong prefab, ObjectMagicStone.Start bật lúc chạy: bật sẵn để prefab_parts giữ lại.
import skrip  # noqa: E402
_init = skrip.Node.__init__
def _init2(self, rip, cab, go):
    _init(self, rip, cab, go)
    if self.name == 'magic_stone':
        self.active = 1
skrip.Node.__init__ = _init2

NAMES = ['magic_stone_%d' % i for i in range(7)] + ['brazier02', 'wall403', 'wall404']
roots = dict(B.roots_by_name('levelobjects.ab'))
roots.update(B.roots_by_name('levelcommon.ab'))
out_prefabs = {}
for nm in NAMES:
    nd = roots.get(nm)
    if nd is None:
        print('! thiếu prefab', nm)
        continue
    B.extract_prefab(nd)
    out_prefabs[nm] = B.prefabs[nm]
# loại bỏ MonoBehaviour khỏi phần (chỉ giữ ObjectMagicStone.stone_type)
for nm, parts in out_prefabs.items():
    for p in parts:
        m = p.get('mbs')
        if m:
            keep = {k: v for k, v in m.items() if k in ('ObjectMagicStone', 'RGBox')}
            if keep:
                p['mbs'] = keep
            else:
                del p['mbs']
used = set()
for parts in out_prefabs.values():
    for p in parts:
        if p.get('f'):
            used.add(p['f'])
        for k in (p.get('a') or {}).values():
            used.add('@' + k)
anims = {}
for k in [u[1:] for u in used if u[0] == '@']:
    a = B.anims.get(k)
    if a:
        anims[k] = a
        for f in a.get('f') or []:
            used.add(f)
art = os.path.join(GAME, 'art', 'finale')
os.makedirs(art, exist_ok=True)
fr = {k: v for k, v in B.packer.frames.items() if k in used}
from pack import Packer  # noqa: E402
pk = Packer()
for k, (img, ax, ay) in fr.items():
    pk.frames[k] = (img, ax, ay)
table, pages = pk.write(art, prefix='atlas')
# Tên khung có tiền tố 'fin/' để không trùng khung của sk-data.js khi js/finale.js nối vào SK_ATLAS.f.
table = {'fin/' + k: v for k, v in table.items()}
for parts in out_prefabs.values():
    for p in parts:
        if p.get('f'):
            p['f'] = 'fin/' + p['f']
for a in anims.values():
    a['f'] = ['fin/' + f for f in a.get('f') or []]
import hashlib  # noqa: E402
hv = hashlib.md5(b''.join(open(os.path.join(art, p), 'rb').read() for p in pages)).hexdigest()[:10]
data = {'v': hv, 'pages': ['art/finale/' + p for p in pages], 'f': table, 'anims': anims, 'prefabs': out_prefabs}
with io.open(os.path.join(GAME, 'data', 'sk-finale.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// SINH TỰ ĐỘNG bởi tools/finale/build_finale.py — không sửa tay.\n')
    f.write('window.SK_FINALE = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('prefabs', list(out_prefabs), 'frames', len(table), 'anims', sorted(anims), 'pages', pages)
for line in B.log:
    print('!', line)
