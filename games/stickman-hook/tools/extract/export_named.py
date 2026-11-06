"""Export Sprites/Texture2Ds by exact name from a bundle (+deps) to an output dir, with sprite meta.
    py -3 -I export_named.py <outdir> <bundle-prefix> name1 name2 ...
"""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

out, pre, names = sys.argv[1], sys.argv[2], set(sys.argv[3:])
os.makedirs(out, exist_ok=True)
b = [f for f in os.listdir(AND) if f.startswith(pre)][0]
env = load_with_deps(b)
meta_path = os.path.join(out, 'meta.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
done = set()
for o in env.objects:
    if o.type.name not in ('Sprite', 'Texture2D'): continue
    try: n = o.peek_name()
    except Exception: n = o.read().m_Name
    if n not in names: continue
    key = n if o.type.name == 'Sprite' else n + '.tex'
    if key in done: continue
    d = o.read(); done.add(key)
    img = d.image
    img.save(os.path.join(out, key + '.png'))
    m = {'w': img.width, 'h': img.height, 'type': o.type.name}
    if o.type.name == 'Sprite':
        m['ppu'] = d.m_PixelsToUnits
        m['border'] = [d.m_Border.x, d.m_Border.y, d.m_Border.z, d.m_Border.w]
        r = d.m_Rect; m['rect'] = [r.x, r.y, r.width, r.height]
    meta[key] = m
    print(key, m)
json.dump(meta, open(meta_path, 'w'), indent=1)
print('missing', names - {k.replace('.tex', '') for k in done})
