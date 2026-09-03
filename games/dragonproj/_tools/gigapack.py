# -*- coding: utf-8 -*-
"""
NHẬP HIỆU ỨNG TỪ "SUPER PIXEL EFFECTS GIGAPACK" (bản Free).

Vì sao cần bộ này khi đã có PVFX Foundry: PVFX mạnh ở hiệu ứng CHẠM (nổ, toé,
đâm) nhưng thiếu hẳn hai họ mà game này đang cần gấp.

  1. SÉT ĐÁNH TỪ TRÊN XUỐNG. Trận Sấm là "các tia sét đánh đùng đùng xuống vùng
     đã chỉ" — một vòng tròn xanh nhấp nháy không nói được điều đó. PVFX chỉ có
     `electric-impact`, tức là cú chạm, không có cái cột sét.
  2. HIỆU ỨNG BUFF. Ba đòn thuần buff (Cuồng Tốc, Khiên Ảo, Bão Chì) tự xả khi
     thanh đầy, nên chúng CÀNG cần một hình ảnh rõ — người chơi không bấm gì cả,
     nên nếu màn hình không đổi thì họ không biết đã có chuyện gì.

Định dạng nguồn rất hợp: mỗi hiệu ứng đã là một DẢI NGANG các khung vuông
(896x128 = 7 khung 128x128), đúng thứ mà _tools/pack.py đã biết cắt. Nên bộ nhập
này chỉ làm hai việc: chép dải vào _assets_src/fx/ và khai vào asset-map.json.

Chạy:  python _tools/gigapack.py
"""
import io, json, os, shutil, struct, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = (r"C:\Users\tamph\Downloads\VFX"
       r"\Super Pixel Effects Gigapack (Free Version) v2.9.0"
       r"\Super Pixel Effects Gigapack (Free Version)\spritesheet")

# key trong game -> (thư mục, tên hiệu ứng, cỡ, ms mỗi khung, neo)
#
# `anchor` = 'fixed' nghĩa là hiệu ứng vẽ đúng tâm điểm được truyền vào; 'ground'
# nghĩa là gốc nằm ở CHÂN khung (dùng cho sét, vì tia sét đánh XUỐNG đất chứ
# không nở ra từ giữa không trung).
WANT = collections.OrderedDict([
    # --- sét: Trận Sấm ---
    ('bolt',       ('Lightning', 'lightning_strike_001', 'large', 45, 'ground')),
    ('boltsmall',  ('Lightning', 'lightning_strike_001', 'small', 45, 'ground')),
    ('boltburst',  ('Lightning', 'lightning_burst_002',  'large', 45, 'fixed')),
    # --- buff tự xả: mỗi đòn một hình khác nhau ---
    ('buffhaste',  ('Fantasy Spells', 'spell_haste_001',      'large', 55, 'fixed')),
    ('buffguard',  ('Fantasy Spells', 'spell_defense_up_001', 'large', 55, 'fixed')),
    ('buffatk',    ('Fantasy Spells', 'spell_attack_up_001',  'large', 55, 'fixed')),
    # --- xả ulti: vòng sáng dùng chung ---
    ('ultiring',   ('Magic Bursts', 'round_light_burst_001', 'large', 45, 'fixed')),
    ('ultispark',  ('Magic Bursts', 'round_sparkle_burst_001', 'large', 45, 'fixed')),
    # --- nổ lớn ---
    ('bigboom',    ('Explosions', 'epic_explosion_001',       'large', 45, 'fixed')),
    ('midboom',    ('Explosions', 'symmetrical_explosion_001', 'large', 45, 'fixed')),
    # --- quái: báo trước và cú lao ---
    ('warn',       ('Symbols', 'symbol_alert_001',            'large', 60, 'fixed')),
    ('dashtrail',  ('Impacts', 'directional_impact_001',      'large', 40, 'fixed')),
    ('mobcast',    ('Sci-fi', 'scifi_charge_up_001',          'large', 55, 'fixed')),
    ('mobshotfx',  ('Sci-fi', 'scifi_muzzle_flash_001',       'small', 40, 'fixed')),
    # --- dịch chuyển ---
    ('warp',       ('Sci-fi', 'scifi_warp_003',               'large', 45, 'fixed')),
])


def png_size(path):
    with open(path, 'rb') as fh:
        fh.read(16)
        return struct.unpack('>II', fh.read(8))


def find_variant(eff_dir, size):
    for v in sorted(os.listdir(eff_dir)):
        if ('_' + size) in v:
            return os.path.join(eff_dir, v)
    return None


def main():
    if not os.path.isdir(SRC):
        print('KHONG THAY nguon:', SRC)
        return 1

    dst_dir = os.path.join(ROOT, '_assets_src', 'fx')
    if not os.path.isdir(dst_dir):
        os.makedirs(dst_dir)

    map_path = os.path.join(ROOT, 'assets', 'asset-map.json')
    amap = json.load(io.open(map_path, encoding='utf-8'),
                     object_pairs_hook=collections.OrderedDict)
    fx = amap.setdefault('fx', collections.OrderedDict())

    added, skipped = [], []
    for key, (cat, eff, size, ms, anchor) in WANT.items():
        eff_dir = os.path.join(SRC, cat, eff)
        if not os.path.isdir(eff_dir):
            skipped.append(key + ' (khong co thu muc)')
            continue
        var = find_variant(eff_dir, size)
        sheet = os.path.join(var, 'spritesheet.png') if var else None
        if not sheet or not os.path.isfile(sheet):
            skipped.append(key + ' (khong co spritesheet.png)')
            continue

        w, h = png_size(sheet)
        if w % h:
            # Dải phải chia hết cho chiều cao, không thì nó không phải một hàng
            # khung vuông và cắt ra sẽ lệch dần về cuối.
            skipped.append('%s (%dx%d khong chia het)' % (key, w, h))
            continue
        frames = w // h

        out_name = 'giga_%s.png' % key
        shutil.copyfile(sheet, os.path.join(dst_dir, out_name))
        fx[key] = collections.OrderedDict([
            ('strip', out_name),
            ('frames', frames),
            ('ms', ms),
            ('anchor', 'fixed'),
            # Sét đánh xuống: gốc ở CHÂN khung, nếu không thì cột sét mọc lên
            # trời từ giữa người thay vì cắm xuống đất.
            ('ox', h // 2),
            ('oy', h - 6 if anchor == 'ground' else h // 2),
        ])
        added.append('%s (%d khung %dx%d)' % (key, frames, h, h))

    io.open(map_path, 'w', encoding='utf-8').write(
        json.dumps(amap, ensure_ascii=False, indent=1))

    print('Da them %d hieu ung:' % len(added))
    for a in added:
        print('   ', a)
    if skipped:
        print('Bo qua:')
        for sk in skipped:
            print('   ', sk)
    print('\nChay tiep: python _tools/pack.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
