# Upscaled strips of the crops (10 per image) for reading details: ref/cells/_strips/rR_a.png / rR_b.png
import os, json
from PIL import Image, ImageDraw
here = os.path.dirname(os.path.abspath(__file__)); cd = os.path.join(here, '..', 'ref', 'cells')
idx = json.load(open(os.path.join(cd, 'index.json')))['cells']
for r in range(1, 7):
    row = [c for c in idx if c['row'] == r]
    for half, part in (('a', row[:10]), ('b', row[10:])):
        S = Image.new('RGB', (10 * 200, 360), (30, 30, 36)); dr = ImageDraw.Draw(S)
        for i, c in enumerate(part):
            t = Image.open(os.path.join(cd, c['id'] + '.png')); k = min(196 / t.width, 330 / t.height)
            t = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS); S.paste(t, (i * 200 + (200 - t.width) // 2, 0)); dr.text((i * 200 + 4, 342), c['id'], fill=(255, 255, 0))
        S.save(os.path.join(cd, '_strips', 'r%d_%s.png' % (r, half)))
