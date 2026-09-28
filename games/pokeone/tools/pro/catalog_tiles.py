"""Tờ mục lục tile PRO cho người dựng bản đồ (không vào repo).
  index_NN.png : 12 tấm/ảnh, thu nhỏ 1/4, ghi số tấm.
  sheet_<n>.png: tấm gốc 1024 phóng 1x, kẻ lưới 32px, ghi số cột/hàng mỗi 4 ô.
Chạy: python catalog_tiles.py [thư_mục_ra]"""
import os, sys
from PIL import Image, ImageDraw
from pro_env import ProEnv

out = sys.argv[1] if len(sys.argv) > 1 else r'D:\pro-ref\catalog'
os.makedirs(out, exist_ok=True)
pe = ProEnv()
names = sorted(pe.listdir('tiles'), key=int)
thumbs = []
for n in names:
    im = pe.image('tiles/' + n).convert('RGBA')
    im.save(os.path.join(out, f'raw_{n}.png'))
    bg = Image.new('RGBA', im.size, (255, 0, 255, 255))
    bg.alpha_composite(im)
    g = bg.convert('RGB')
    d = ImageDraw.Draw(g)
    for i in range(0, 1024, 32):
        c = (0, 0, 0) if i % 128 else (255, 255, 0)
        d.line([(i, 0), (i, 1023)], fill=c)
        d.line([(0, i), (1023, i)], fill=c)
    for cx in range(0, 32, 4):
        for cy in range(0, 32, 4):
            d.text((cx * 32 + 2, cy * 32 + 1), f'{cx},{cy}', fill=(255, 255, 255))
    g.save(os.path.join(out, f'sheet_{n}.png'))
    t = bg.resize((256, 256), Image.NEAREST).convert('RGB')
    ImageDraw.Draw(t).text((4, 4), n, fill=(255, 255, 0))
    thumbs.append(t)
for i in range(0, len(thumbs), 12):
    sheet = Image.new('RGB', (256 * 4, 256 * 3))
    for j, t in enumerate(thumbs[i:i + 12]):
        sheet.paste(t, ((j % 4) * 256, (j // 4) * 256))
    sheet.save(os.path.join(out, f'index_{i // 12:02d}.png'))
print(len(names), 'tấm ->', out)
