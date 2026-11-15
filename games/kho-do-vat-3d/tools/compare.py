"""Side-by-side compare sheets: reference cell | our render (cropped from shots/layout-<sheet>.png).
Writes shots/compare/<cell>-<prop>.png and shots/compare/_all-<sheet>.png (contact sheet)."""
import io, os, json, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET_OF = {'owner-props-sheet.webp': 'props', 'owner-vehicles-sheet.webp': 'vehicles',
            'owner-workshop-scene.webp': 'workshop', 'owner-campfire-scene.webp': 'campfire'}
args = sys.argv[1:]
def opt(k, d):
    return args[args.index(k) + 1] if k in args else d
sheets = opt('--sheets', 'props,vehicles,workshop,campfire').split(',')
only = set(x for x in opt('--only', '').split(',') if x)
SHOTS = os.path.join(ROOT, 'shots', opt('--out', ''))
boxes = json.load(io.open(os.path.join(ROOT, 'ref', 'boxes.json'), encoding='utf-8'))
stats = {}
sp = os.path.join(SHOTS, 'stats.json')
if os.path.exists(sp):
    st = json.load(io.open(sp, encoding='utf-8'))
    for sh in st:
        if isinstance(st[sh], dict):
            for e in st[sh].get('perProp', []):
                stats[e['cell']] = e
out_dir = os.path.join(SHOTS, 'compare')
os.makedirs(out_dir, exist_ok=True)
H = 260
made = 0
for sh in sheets:
    lay = os.path.join(SHOTS, 'layout-%s.png' % sh)
    if not os.path.exists(lay):
        continue
    ours_full = Image.open(lay).convert('RGB')
    tiles = []
    for c in boxes:
        if SHEET_OF[c['sheet']] != sh:
            continue
        if only and c['prop'] not in only:
            continue
        ref = Image.open(os.path.join(ROOT, 'ref', 'cells', c['cell'] + '.png')).convert('RGB')
        x0, y0, x1, y1 = c['box']; p = 4
        iso = os.path.join(SHOTS, 'layout-%s-%s.png' % (sh, c['cell']))
        src = Image.open(iso).convert('RGB') if os.path.exists(iso) else ours_full
        ours = src.crop((max(0, x0 - p), max(0, y0 - p), min(src.width, x1 + p), min(src.height, y1 + p)))
        s = H / ref.height
        if ref.width * s > 420:
            s = 420 / ref.width
        rw, rh = max(1, int(ref.width * s)), max(1, int(ref.height * s))
        ref = ref.resize((rw, rh), Image.LANCZOS); ours = ours.resize((rw, rh), Image.LANCZOS)
        im = Image.new('RGB', (rw * 2 + 12, rh + 24), (12, 12, 14))
        im.paste(ref, (0, 24)); im.paste(ours, (rw + 12, 24))
        d = ImageDraw.Draw(im)
        e = stats.get(c['cell'])
        tri = ('%d tris' % e['tris']) if e else 'MISSING'
        d.text((4, 5), '%s %s%s' % (c['cell'], c['prop'], (' (' + c['view'] + ')') if c.get('view') else ''), fill=(230, 230, 230))
        d.text((rw + 16, 5), 'ours: ' + tri, fill=(255, 190, 90))
        name = '%s-%s%s.png' % (c['cell'], c['prop'], ('-' + c['view']) if c.get('view') else '')
        im.save(os.path.join(out_dir, name))
        tiles.append(im); made += 1
    if tiles and not only:
        W = 1800; x = y = rowh = 0; pos = []
        for t in tiles:
            if x + t.width > W:
                x = 0; y += rowh + 6; rowh = 0
            pos.append((x, y)); x += t.width + 6; rowh = max(rowh, t.height)
        sheet = Image.new('RGB', (W, y + rowh), (30, 30, 34))
        for t, (px, py) in zip(tiles, pos):
            sheet.paste(t, (px, py))
        sheet.save(os.path.join(out_dir, '_all-%s.png' % sh))
print('compare tiles:', made)
