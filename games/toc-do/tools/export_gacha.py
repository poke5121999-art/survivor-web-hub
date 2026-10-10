"""Xuất ảnh hiệu ứng quay Xưởng (gacha) vào art/gacha/.

Run:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_gacha.py

Nguồn: effects/fx_ui/og_unrealgaragedlg_v36 (chouzhong = lúc quay, get = lúc nhận, bg = nền) của APK, đọc bằng export_fx_ui.describe.
Ảnh xuất riêng vào art/gacha (export_fx_ui.build_fx xoá *.webp trong art/fx mỗi lần chạy nên không dùng chung thư mục).
"""
import math, os, shutil, sys, tempfile
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_fx_ui as X

OUT = os.path.normpath(os.path.join(HERE, '..', 'art', 'gacha'))
P = 'fx_ui/og_unrealgaragedlg_v36/uifx_unrealgaragedlg_v36_'
# Chỉ giữ ảnh js/ui/gacha.js dùng (glow tròn, cột sáng, sao tia, đốm sáng).
KEEP = {'fx_glow_00011_12.webp', 'fx_glow_09604_1_clamp.webp', 'fx_light_00003_2.webp', 'fx_light_00003_3.webp', 'fx_light_00003_6.webp', 'fx_noise_00023_1.webp'}
PREFABS = ['chouzhong_01_lod1', 'chouzhong_07_lod1', 'chouzhong_11_lod2', 'get_01_lod1', 'bg_01_lod2']


def bar_icon():
    """Biểu tượng Xưởng trên thanh dưới: bánh răng trắng như các biểu tượng bar_*.webp. APK không có ảnh "Xưởng" của bản VN
    (nhãn tải từ máy chủ), nên đây là hình tự vẽ."""
    S = 4
    im = Image.new('RGBA', (64 * S, 64 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, R, r = 32 * S, 24 * S, 18 * S
    d.ellipse((c - r, c - r, c + r, c + r), fill='white')
    for i in range(8):
        a = i * math.pi / 4
        ux, uy, vx, vy = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
        w = 5.5 * S
        d.polygon([(c + ux * (r - 2 * S) + vx * w, c + uy * (r - 2 * S) + vy * w), (c + ux * R + vx * w * 0.75, c + uy * R + vy * w * 0.75),
                   (c + ux * R - vx * w * 0.75, c + uy * R - vy * w * 0.75), (c + ux * (r - 2 * S) - vx * w, c + uy * (r - 2 * S) - vy * w)], fill='white')
    h = 8 * S
    d.ellipse((c - h, c - h, c + h, c + h), fill=(0, 0, 0, 0))
    im = im.resize((64, 64), Image.LANCZOS)
    im.save(os.path.join(OUT, 'icon.webp'), 'WEBP', quality=90)


def main():
    tmp = tempfile.mkdtemp(prefix='gacha_fx_')
    X.GAME = tmp
    os.makedirs(os.path.join(tmp, 'art', 'fx'))
    got = {}
    for n in PREFABS:
        _full, layers = X.describe(X.FX_PRE + P + n + '.prefab')
        for L in layers:
            if L.get('tex'):
                got[L['tex']] = L['blend']
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.endswith('.webp'):
            os.remove(os.path.join(OUT, fn))
    for rel, blend in sorted(got.items()):
        if os.path.basename(rel) not in KEEP:
            continue
        # Ảnh gốc là cộng sáng trên nền đen; làm mặt nạ CSS thì cần alpha = độ sáng (màu do CSS tô theo độ hiếm).
        L = Image.open(os.path.join(tmp, rel)).convert('L')
        im = Image.new('RGBA', L.size, (255, 255, 255, 0))
        im.putalpha(L)
        im.save(os.path.join(OUT, os.path.basename(rel)), 'WEBP', quality=88, method=5)
        print(os.path.basename(rel), blend)
    shutil.rmtree(tmp)
    bar_icon()


if __name__ == '__main__':
    main()
