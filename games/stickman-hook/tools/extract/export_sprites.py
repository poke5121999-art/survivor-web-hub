"""Export named sprites (with pivot/PPU) from the config bundles + their dependencies.

    py -3 -I export_sprites.py <outdir> <bundle> [<bundle>...] -- name1 name2 ... | --all-prefix CHAR_Classic
Writes <outdir>/<name>.png and <outdir>/sprites.json {name: {w,h,ppu,px,py}} where (px,py) is the pivot in image pixels
measured from the image's top-left (y down), so world placement is: draw at -px/ppu, -py/ppu in sprite units.
"""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

args = sys.argv[1:]
out = args[0]; sep = args.index('--')
bundles = args[1:sep]; want = args[sep + 1:]
prefixes = []
if want and want[0] == '--all-prefix':
    prefixes = want[1:]; want = []
os.makedirs(out, exist_ok=True)
meta_path = os.path.join(out, 'sprites.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
seen = set()
for b in bundles:
    env = load_with_deps(b)
    for o in env.objects:
        if o.type.name != 'Sprite': continue
        try: name = o.peek_name()
        except Exception: name = o.read().m_Name
        if name in seen: continue
        if not (name in want or any(name.startswith(p) for p in prefixes)): continue
        s = o.read(); seen.add(name)
        img = s.image
        rd = s.m_RD
        rect = s.m_Rect
        off = rd.textureRectOffset
        piv = s.m_Pivot
        # pivot in m_Rect pixels (y up from bottom) -> image pixels (y down from top)
        pxr = piv.x * rect.width - off.x
        pyr_up = piv.y * rect.height - off.y
        py = img.height - pyr_up
        img.save(os.path.join(out, name + '.png'))
        meta[name] = {'w': img.width, 'h': img.height, 'ppu': s.m_PixelsToUnits, 'px': round(pxr, 2), 'py': round(py, 2),
                      'border': [s.m_Border.x, s.m_Border.y, s.m_Border.z, s.m_Border.w]}
        print(name, img.size, meta[name])
json.dump(meta, open(meta_path, 'w'), indent=1)
missing = [w for w in want if w not in seen]
print('missing', missing)
