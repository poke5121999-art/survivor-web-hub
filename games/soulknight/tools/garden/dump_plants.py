# -*- coding: utf-8 -*-
"""Đọc luật cây trồng từ prefab gốc (common.ab › rgprefab/item/plant/plant_*.prefab) ra tools/garden/plants_prefab.json.

Mỗi prefab có một MonoBehaviour Plant* ở gốc (PlantMaterial / PlantBuff / PlantWeapon / PlantPet / ...) mang sản phẩm, cờ permanent
(cây còn sau khi thu), restartState (giai đoạn quay về sau khi thu) và usableState; các giai đoạn lớn là các nút con state_0..state_N.
Chạy từ gốc repo:  ~/sk86-ref/venv/bin/python games/soulknight/tools/garden/dump_plants.py   (cần SK86 = ~/sk86-ref)
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
from skrip import Rip  # noqa: E402

KEEP_CLS = re.compile(r'^Plant\w*$')


def main():
    rip = Rip(bundles=[])
    out = {}
    for cab in rip.cabs('common'):
        for r in rip.roots(cab):
            if not r.name.startswith('plant_') or r.name in out:
                continue
            ent = {'states': 0, 'stateSprites': {}}
            for nd, path, off in r.walk():
                m = re.match(r'^/state_root/state_(\d+)$', path)
                if m:
                    ent['states'] = max(ent['states'], int(m.group(1)) + 1)
                if nd is r:
                    for cls, ccab, t in nd.mbs():
                        if cls and KEEP_CLS.match(cls):
                            ent['cls'] = cls
                            ent['f'] = {k: v for k, v in t.items() if not isinstance(v, (dict, list)) and k not in ('m_Enabled', 'm_Name', 'showArrowOnlyIfTriggerable', 'statisticKey', 'label_left_right_offset')}
                m = re.match(r'^/state_root/state_(\d+)/', path)
                if m:
                    s = nd.comp('SpriteRenderer')
                    if s:
                        rr = rip.resolve(s[2].get('m_Sprite'), s[0])
                        if rr:
                            ent['stateSprites'].setdefault(m.group(1), []).append(rip.tree(*rr)['m_Name'])
            out[r.name] = ent
    dst = os.path.join(HERE, 'plants_prefab.json')
    with io.open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print(len(out), 'cây ->', dst)


if __name__ == '__main__':
    main()
