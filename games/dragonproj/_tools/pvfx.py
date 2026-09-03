# -*- coding: utf-8 -*-
"""Nhập bộ hiệu ứng PVFX Foundry vào kho asset của game.

    python _tools/pvfx.py --src "C:\\...\\pvfx-foundry-thirteen-spritesheets"

Bộ này (CC0, xem LICENSE.txt của bộ) tới dưới dạng mỗi hiệu ứng một thư mục:

    effects/<id>/grid/sprite-sheet.png     lưới khung, ô nào cũng 96x96
    effects/<id>/grid/manifest.json        số khung, nhịp, và PIVOT

Tool này làm đúng ba việc:

  1. Cắt lưới thành một DẢI NGANG rồi ghi vào `_assets_src/fx/<key>.png`.
     Ghi vào repo chứ không đọc thẳng từ thư mục Downloads: máy khác không có
     thư mục đó, và một pipeline chỉ chạy được trên một máy thì không phải
     pipeline.

  2. Dùng lưới `grid` chứ KHÔNG dùng `packed`. Bản packed cắt sát viền từng
     khung nên mỗi khung có một offset riêng; bản grid giữ nguyên ô 96x96 nên
     mọi khung dùng chung MỘT điểm neo. Đổi lấy vài KB để không phải mang theo
     một bảng offset mà chỗ nào quên đọc là hiệu ứng nhảy lung tung.

  3. Ghi `ox`/`oy` lấy nguyên PIVOT của manifest, kèm `anchor: "fixed"` để
     pack.py không đoán lại. Pivot là thứ phân biệt "vòng nổ nở ra từ tâm" với
     "cột khói mọc lên từ chân" — đoán bằng tâm ảnh thì cột khói lơ lửng.

Chạy lại được nhiều lần. Sau khi chạy thì chạy tiếp `_tools/pack.py`.
"""
import argparse, io, json, os, sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Cần Pillow:  pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
MAP_PATH = os.path.join(GAME, 'assets', 'asset-map.json')
DST_DIR = os.path.join(GAME, '_assets_src', 'fx')

# id trong bộ nguồn  ->  khoá trong asset-map (fx.<khoá>)
# Tên khoá đặt theo VIỆC nó làm trong game này, không theo tên của bộ nguồn:
# "lattice-beam" không nói gì, "beam" thì nói.
PICKS = {
    'lattice-beam':      'beam',        # tia nhiệt — loop
    'beam-cutoff-burst': 'beam_hit',    # đầu tia chạm mục tiêu
    'crescent-slash':    'crescent',    # kiếm khí, Trảm Thiên, lưỡi hái
    'warm-explosion':    'boom',        # súng phóng, cầu lửa
    'earth-rupture':     'quake',       # thiên thạch chạm đất
    'frost-nova':        'frost',       # hệ Thủy
    'electric-impact':   'zap',         # hệ Lôi
    'ember-jet':         'ember',       # hệ Hỏa
    'acid-splash':       'acid',        # hệ Độc
    'spectral-bloom':    'bloom',       # hệ Ám
    'leaf-gust':         'leaf',        # hệ Thổ
    'splash-crown':      'splash',      # nước bắn
    'radiant-heal':      'heal',        # hệ Quang / hồi máu
    'focus-charge':      'charge',      # vòng ngắm kỹ năng
    'magical-projectile': 'orb',        # cầu lửa / đạn gậy phép
    'void-implosion':    'implode',     # Điểm Hút
    'arcane-parry':      'ward',        # Khiên Ảo
    'rift-portal':       'portal',      # Bóng Tử Thần (blink)
    'solar-shrapnel':    'shrapnel',    # Vòng Mảnh / Bom Chùm
    'venom-ward':        'venom',       # vùng độc
    'rain-field':        'rainzone',    # vùng Vũ Tiễn
    'smoke-puff':        'puff2',       # quái chết
    'landing-dust':      'landing',     # tiếp đất
    'dripping-runoff':   'drip',        # vệt Thủy
    'shoreline-foam':    'foam'         # vũng trơn
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=r'C:\Users\tamph\Downloads\pvfx-foundry-thirteen-spritesheets')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    root = os.path.join(a.src, 'effects')
    if not os.path.isdir(root):
        sys.exit('Không thấy %s' % root)
    if not a.dry_run:
        os.makedirs(DST_DIR, exist_ok=True)

    amap = json.load(io.open(MAP_PATH, encoding='utf-8'))
    amap.setdefault('fx', {})
    n = 0
    for eid, key in sorted(PICKS.items()):
        mp = os.path.join(root, eid, 'grid', 'manifest.json')
        sp = os.path.join(root, eid, 'grid', 'sprite-sheet.png')
        if not os.path.isfile(mp):
            print('  THIẾU  %s' % eid)
            continue
        m = json.load(io.open(mp, encoding='utf-8'))
        sheet = Image.open(sp).convert('RGBA')
        frames = m['frames']
        w, h = frames[0]['source_size']
        strip = Image.new('RGBA', (w * len(frames), h))
        for i, f in enumerate(frames):
            c = f['sheet']
            strip.alpha_composite(sheet.crop((c['x'], c['y'], c['x'] + w, c['y'] + h)), (i * w, 0))
        name = 'pvfx_' + key
        if not a.dry_run:
            strip.save(os.path.join(DST_DIR, name + '.png'), optimize=True)
        px, py = m['pivot']
        amap['fx'][key] = {
            'spr': name, 'strip': len(frames), 'anchor': 'fixed',
            'ox': int(px), 'oy': int(py),
            # Nhịp gốc của cả bộ là 50ms/khung. Game đọc `ms` này khi nó muốn
            # chạy hiệu ứng ở đúng tốc độ mà người vẽ đã định.
            'ms': int(round(frames[0]['duration']['numerator_ms'] /
                            frames[0]['duration']['denominator'])) * len(frames),
            'loop': m.get('loop_mode') == 'loop',
            'src': 'PVFX Foundry (CC0) — effect ' + eid
        }
        n += 1
        print('  %-10s <- %-20s %2d khung %dx%d pivot %d,%d' %
              (key, eid, len(frames), w, h, px, py))

    if not a.dry_run:
        json.dump(amap, io.open(MAP_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n%d hiệu ứng nhập xong. Chạy tiếp _tools/pack.py.' % n)


if __name__ == '__main__':
    main()
