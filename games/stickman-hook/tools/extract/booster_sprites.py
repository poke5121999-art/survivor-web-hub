"""Booster art: every boosters_<kind>_<variant> bundle holds one sprite named only Market / NoOutline / MultipleMarket,
so page_sprites.py (deduplicated by name) keeps just the first. This saves each as <kind>_<variant>.png.
    py -3 -I booster_sprites.py <outdir>
"""
import sys, os, re
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for b in sorted(os.listdir(AND)):
    m = re.match(r'defaultlocalgroup_assets_boosters_(\w+?)_(market|nooutline|multiplemarket)_', b)
    if not m:
        continue
    env = load_with_deps(b)
    for sf in sfs(env):
        for pid, o in sf.objects.items():
            if o.type.name != 'Sprite':
                continue
            d = o.read()
            if d.m_Name.lower() != m.group(2).lower():
                continue
            name = m.group(1) + '_' + m.group(2)
            d.image.save(os.path.join(out, name + '.png'))
            print(name, d.image.size)
            break
