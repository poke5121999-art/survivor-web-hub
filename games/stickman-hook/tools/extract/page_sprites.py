"""Every Sprite reachable from a UI page bundle (the bundle and its dependencies), saved for picking menu art.
    py -3 -I page_sprites.py <outdir> <bundle-prefix> [...]
Writes <outdir>/<name>.png, <outdir>/meta.json {name: {w, h, border [l, b, r, t], bundle}} and <outdir>/_sheet.png (labelled
contact sheet). Sprites of the skins / ropes / trails sheets and level art are skipped (names in SKIP_PREFIX).
"""
import sys, os, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *
from PIL import Image, ImageDraw

SKIP_PREFIX = ('CHAR_', 'v0', 'AN_', 'AAA_', 'A_Grap', 'FX_Grap')
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
meta_path = os.path.join(out, 'meta.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
for pre in sys.argv[2:]:
    b = [f for f in os.listdir(AND) if f.startswith(pre)][0]
    env = load_with_deps(b)
    for sf in sfs(env):
        for pid, o in sf.objects.items():
            if o.type.name != 'Sprite': continue
            try: d = o.read()
            except Exception: continue
            n = d.m_Name
            if n in meta or n.startswith(SKIP_PREFIX): continue
            try: img = d.image
            except Exception: continue
            if img.width * img.height > 2048 * 2048: continue
            img.save(os.path.join(out, n + '.png'))
            meta[n] = {'w': img.width, 'h': img.height, 'border': [round(d.m_Border.x), round(d.m_Border.y), round(d.m_Border.z), round(d.m_Border.w)],
                       'bundle': pre.replace('defaultlocalgroup_assets_', ''), 'cab': sf.name}
json.dump(meta, open(meta_path, 'w'), indent=0)
# contact sheet: cells of 120 px with the name under each
names = sorted(meta)
C, cols = 120, 12
rows = (len(names) + cols - 1) // cols
sheet = Image.new('RGB', (cols * C, rows * (C + 14)), (40, 40, 60))
dr = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    p = os.path.join(out, n + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGBA')
    k = min(1, (C - 6) / max(im.width, im.height)); im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
    x, y = (i % cols) * C, (i // cols) * (C + 14)
    sheet.paste(im, (x + (C - im.width) // 2, y + (C - im.height) // 2), im)
    dr.text((x + 2, y + C), n[:19], fill=(255, 255, 0))
sheet.save(os.path.join(out, '_sheet.png'))
print(len(meta), 'sprites')
