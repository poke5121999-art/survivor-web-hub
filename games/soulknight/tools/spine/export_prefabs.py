# Bóc rig + Animator của các prefab phụ của một trùm Spine (vd Giáo Chủ Rồng, tường di động) ra JSON riêng:
#   python export_prefabs.py boss_stone_dragon dragon_priests 4A_boss3_movingWall_H 4A_boss3_movingWall_V
# Dùng lại bộ xuất rig của tools/bosses/build_bosses86.py nhưng KHÔNG đụng data/sk-bosses86.js; kết quả ở
# art/spine/<trùm>/prefabs.json: {tên prefab: {rig, mbs}}. Sprite của prefab phải có trong atlas (tools/extra/<tên>.json).
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'bosses')); sys.path.insert(0, os.path.join(HERE, '..'))
import build_bosses86 as B
boss, names = sys.argv[1], sys.argv[2:]
out = {}
for nm in names:
    root, rel = B.find_root(nm, ['boss/%s.ab' % boss])
    if root is None: print('thiếu', nm); continue
    out[nm] = {'rig': B.rig_export(root)}
    print('ghi', nm, len(out[nm]['rig']['nodes']), 'nút', len(out[nm]['rig']['anims']), 'animator')
d = os.path.join(HERE, '..', '..', 'art', 'spine', boss)
os.makedirs(d, exist_ok=True)
json.dump(out, open(os.path.join(d, 'prefabs.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('sprite dùng:', sorted(B.sprites_used))
