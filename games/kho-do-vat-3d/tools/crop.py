"""Crop sheets into ref/cells/NN.png using ref/boxes.json; write ref/props.md."""
import json, io, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(io.open(os.path.join(ROOT, 'ref', 'boxes.json'), encoding='utf-8'))
sheets = {}
lines = ['# Ô tham chiếu (cắt từ sheet của chủ dự án)', '',
         'Sinh bằng `python tools/crop.py`. Cột `prop` là id hàm build trong `props/` (xem `props/index.js`).', '',
         '| ô | sheet | prop | mô tả | khung (x0,y0,x1,y1) |', '|---|---|---|---|---|']
for c in data:
    sh = c['sheet']
    if sh not in sheets:
        sheets[sh] = Image.open(os.path.join(ROOT, 'ref', sh)).convert('RGB')
    im = sheets[sh]
    x0, y0, x1, y1 = c['box']
    p = 4
    box = (max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p))
    im.crop(box).save(os.path.join(ROOT, 'ref', 'cells', c['cell'] + '.png'))
    lines.append('| %s | %s | `%s` | %s | %d,%d,%d,%d |' % (c['cell'], sh, c['prop'], c['desc'], x0, y0, x1, y1))
io.open(os.path.join(ROOT, 'ref', 'props.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(len(data))
