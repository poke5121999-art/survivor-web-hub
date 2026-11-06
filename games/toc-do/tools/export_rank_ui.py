# Xuất huy hiệu bậc xếp hạng từ APK: uitextures/id_rank/id_rank_*_splited.png -> art/rank/<mã>.webp (cạnh dài 256).
# Chạy: ~/zingspeed-ref/venv/bin/python -I tools/export_rank_ui.py [--sheet đường_dẫn.png]
# --sheet ghi thêm một ảnh lưới có nhãn để xem bằng mắt khi đối chiếu mã -> bậc.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zs
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'rank')
# id_rank_* là 10 huy hiệu bậc; id_divinity* là bộ huy hiệu "thần" theo mùa, chỉ xuất khi --sheet để tra (không dùng trong game).
WANT = ['id_rank_']
MAXD = 256

def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    want = WANT + (['id_divinity'] if sheet else [])
    files = []
    for r in zs.index():
        if any('uitextures/id_rank/' in c and any(w in c.rsplit('/', 1)[-1] for w in want) for c in r['cont']):
            files.append(r['f'])
    env = zs.load_with_deps(sorted(set(files)), depth=0)[0]
    os.makedirs(OUT, exist_ok=True)
    got = {}
    for o in env.objects:
        if o.type.name != 'Texture2D': continue
        d = o.read()
        n = d.m_Name.lower()
        if not (n.startswith('id_rank_') or (sheet and n.startswith('id_divinity'))): continue
        img = d.image.convert('RGBA')
        bb = img.getchannel('A').getbbox()
        if bb: img = img.crop(bb)
        s = MAXD / max(img.size)
        if s < 1: img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
        code = n.replace('_splited', '').replace('id_', '')
        got[code] = img
        if n.startswith('id_rank_'):
            img.save(os.path.join(OUT, code + '.webp'), 'WEBP', quality=90, method=6)
    print(len(got), 'ảnh:', ', '.join(sorted(got)))
    if sheet:
        keys = sorted(got); W = 128; cols = 8; rows = (len(keys) + cols - 1) // cols
        im = Image.new('RGBA', (cols * W, rows * (W + 16)), (40, 30, 50, 255)); dr = ImageDraw.Draw(im)
        for i, k in enumerate(keys):
            t = got[k].copy(); t.thumbnail((W - 8, W - 8))
            x, y = (i % cols) * W, (i // cols) * (W + 16)
            im.alpha_composite(t, (x + 4, y + 4)); dr.text((x + 4, y + W), k, fill=(255, 255, 255, 255))
        im.save(sheet)

main()
