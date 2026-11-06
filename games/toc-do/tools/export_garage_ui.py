# Xuất biểu tượng kỹ năng bằng lái từ APK: uitextures/id_thing/id_talent/talent_icon<N>_splited.png -> art/garage/talent<N>.webp (cạnh dài 128).
# Chạy: ~/zingspeed-ref/venv/bin/python -I tools/export_garage_ui.py [--sheet đường_dẫn.png]
# --sheet ghi ảnh lưới có nhãn để đối chiếu số biểu tượng -> kỹ năng bằng mắt.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zs
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'garage')
MAXD = 128

def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    files = [r['f'] for r in zs.index() if any('uitextures/id_thing/id_talent/talent_icon' in c for c in r['cont'])]
    env = zs.load_with_deps(sorted(set(files)), depth=0)[0]
    os.makedirs(OUT, exist_ok=True)
    got = {}
    for o in env.objects:
        if o.type.name != 'Texture2D': continue
        d = o.read()
        n = d.m_Name.lower()
        if not n.startswith('talent_icon') or 'alpha' in n: continue
        img = d.image.convert('RGBA')
        bb = img.getchannel('A').getbbox()
        if bb: img = img.crop(bb)
        s = MAXD / max(img.size)
        if s < 1: img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
        code = n.replace('_splited', '').replace('talent_icon', 'talent')
        got[code] = img
        img.save(os.path.join(OUT, code + '.webp'), 'WEBP', quality=90, method=6)
    print(len(got), 'ảnh:', ', '.join(sorted(got)))
    if sheet:
        keys = sorted(got, key=lambda k: int(k[6:])); W = 128; cols = 6; rows = (len(keys) + cols - 1) // cols
        im = Image.new('RGBA', (cols * W, rows * (W + 16)), (40, 30, 50, 255)); dr = ImageDraw.Draw(im)
        for i, k in enumerate(keys):
            t = got[k].copy(); t.thumbnail((W - 8, W - 8))
            x, y = (i % cols) * W, (i // cols) * (W + 16)
            im.alpha_composite(t, (x + 4, y + 4)); dr.text((x + 4, y + W), k, fill=(255, 255, 255, 255))
        im.save(sheet)

main()
