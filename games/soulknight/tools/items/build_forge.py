# -*- coding: utf-8 -*-
"""Công thức rèn + giá nghiên cứu bản vẽ -> data/sk-forge.js.

Chạy (từ gốc repo): ~/sk86-ref/venv/bin/python games/soulknight/tools/items/build_forge.py

Nguồn: ~/sk86-ref/decoded/config/weapons.json (Materials), items.json (BluePrint: DataStr.BlueprintType/ItemName/ResearchMaterials),
data/sk-weapons86.js (grade 0..6: trắng..đỏ, 6 = thần thoại).
Hình ra: window.SK_FORGE = {v, forge: {weaponId: {mats: [[item, n]], grade, bp?}}, blueprints: {key: {type, target, mats: [[item, n]]}}}
  forge chỉ giữ vũ khí có mặt ở web (sk-weapons86.js); bp = khoá bản vẽ phải nghiên cứu trước khi rèn (BlueprintType 7 trỏ tới vũ khí đó).
  blueprints: mọi 259 bản vẽ; type theo BlueprintType (7 vũ khí, 8 tiến hóa, 5 skin, 4 kỹ năng, 6 biến thân, 3 nội thất, 0 khung vườn,
  1 phòng nối máy, 2 cơ giáp).
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
REF = os.path.expanduser('~/sk86-ref')
CFG = os.path.join(REF, 'decoded', 'config')
OUT = os.path.join(GAME, 'data', 'sk-forge.js')


def jl(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    weapons, items = jl(os.path.join(CFG, 'weapons.json')), jl(os.path.join(CFG, 'items.json'))
    src = io.open(os.path.join(GAME, 'data', 'sk-weapons86.js'), encoding='utf-8').read()
    w86 = json.loads(src[src.index('=') + 1:].rstrip().rstrip(';'))['weapons']
    blueprints, by_target = {}, {}
    for k, v in items.items():
        if v['Type'] != 'BluePrint':
            continue
        d = json.loads(v['DataStr'])
        mats = [[m['item'], m['num']] for m in d.get('ResearchMaterials') or []]
        blueprints[k] = {'type': d['BlueprintType'], 'target': d.get('ItemName', ''), 'mats': mats}
        if d['BlueprintType'] == 7:
            by_target[d['ItemName']] = k
    forge = {}
    for wid, e in sorted(weapons.items()):
        mats = e.get('Materials') or []
        if not mats or wid not in w86:
            continue
        row = {'mats': [[m['item'], m['num']] for m in mats], 'grade': w86[wid]['grade']}
        if wid in by_target:
            row['bp'] = by_target[wid]
        forge[wid] = row
    out = {'v': 1, 'forge': forge, 'blueprints': blueprints}
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/items/build_forge.py từ Soul Knight 8.6 — không sửa tay.\n')
        f.write('window.SK_FORGE = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('forge', len(forge), 'cần bản vẽ', sum(1 for r in forge.values() if 'bp' in r), 'bản vẽ', len(blueprints))


if __name__ == '__main__':
    main()
