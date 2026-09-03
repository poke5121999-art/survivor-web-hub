# -*- coding: utf-8 -*-
"""
Đóng gói sprite từ kho HoloCure vào game.

    python _tools/pack.py [--src D:\\HoloCureAssets\\GameSprites] [--dry-run]

Đọc `assets/asset-map.json` (do agent soạn, hoặc sửa tay), rồi với mỗi sprite
được nhắc tới:
  - gom các file khung rời `<Tên>_0.png`, `_1.png`, ... trong thư mục nguồn
  - dán liền nhau thành MỘT dải ngang  ->  assets/spr/<Tên>.png
  - lấy width/height/origin từ sprites.csv ghi ngược lại vào manifest

Vì sao dải ngang, không phải một atlas to:
  một file cho một hành động thì vẽ đè lại dễ — mở ra thấy đúng 8 khung của cú
  chém đó, vẽ lên, lưu, xong. Atlas to bắt phải căn lại toạ độ mọi thứ.

Chạy lại được nhiều lần, ghi đè, không hỏng gì.
"""
import argparse, csv, json, os, sys, re

try:
    from PIL import Image
except ImportError:
    sys.exit('Cần Pillow:  pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
MAP_PATH = os.path.join(GAME, 'assets', 'asset-map.json')
OUT_DIR = os.path.join(GAME, 'assets', 'spr')


def load_meta(src):
    """sprites.csv -> { tên: {w,h,ox,oy,frames} }"""
    meta = {}
    p = os.path.join(src, 'sprites.csv')
    if not os.path.isfile(p):
        return meta
    with open(p, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            try:
                meta[row['name']] = {
                    'w': int(row['width']), 'h': int(row['height']),
                    'ox': int(row['origin_x']), 'oy': int(row['origin_y']),
                    'frames': int(row['frames'])
                }
            except (ValueError, KeyError):
                pass
    return meta


def walk(node, prefix, out):
    """Đi khắp manifest, nhặt mọi nút có khoá `spr`."""
    if not isinstance(node, dict):
        return
    if isinstance(node.get('spr'), str):
        out.append((prefix, node))
        return
    for k, v in node.items():
        if k == 'note':
            continue
        walk(v, (prefix + '.' + k) if prefix else k, out)


def variant(node):
    """Hậu tố phân biệt các biến thể sinh ra từ cùng một sprite gốc."""
    bits = []
    if node.get('crop'):
        bits.append('c%d_%d' % (node['crop'][0], node['crop'][1]))
    if node.get('resize'):
        bits.append('r%dx%d' % tuple(node['resize']))
    if node.get('seamless'):
        bits.append('s')
    if node.get('ramp'):
        bits.append('p' + ''.join(node['ramp']).replace('#', ''))
    return ('__' + '_'.join(bits)) if bits else ''


def frame_files(folder):
    """Các file khung, xếp theo SỐ chứ không theo thứ tự chữ (_10 phải sau _9)."""
    got = []
    for fn in os.listdir(folder):
        m = re.match(r'^(.*)_(\d+)\.png$', fn, re.I)
        if m:
            got.append((int(m.group(2)), fn))
    got.sort()
    return [os.path.join(folder, fn) for _, fn in got]


def seamless_img(im, f=None):
    """Biến một mảnh cắt bất kỳ thành ô lát KHÔNG THẤY ĐƯỜNG NỐI.

    Vì sao cần: sân 820x1080 mà ô lát 256 thì chỉ lặp 4x5 lần — mắt bắt được
    cái lưới ngay lập tức. Lật ô cho khác đi cũng không cứu được: lật xong thì
    mép nối thành ảnh soi gương, còn lộ hơn.

    Cách làm (thủ thuật cũ của dân làm texture):
      1. Dời ảnh đi nửa vòng. Bốn mép ngoài giờ là ruột của ảnh cũ -> nối liền.
         Đổi lại, xuất hiện một vết nối hình CHỮ THẬP ở chính giữa.
      2. Đắp ảnh gốc lên đúng vết chữ thập đó, với mặt nạ vuốt mờ dần.
    Chỗ vuốt mờ là hai mảng cỏ khác nhau hoà vào nhau — với vân dày và vụn như
    cỏ thì không ai thấy; với ảnh có đường nét lớn thì đừng dùng.
    """
    from PIL import ImageChops
    w, h = im.size
    f = f or max(16, min(w, h) // 5)
    base = ImageChops.offset(im, w // 2, h // 2)

    def ramp_mask(n, size, horiz):
        g = Image.new('L', (n, 1))
        c, half = n // 2, f // 2
        row = []
        for i in range(n):
            d = abs(i - c)
            if d <= half:
                row.append(255)
            elif d >= f:
                row.append(0)
            else:
                row.append(int(255 * (1.0 - float(d - half) / (f - half))))
        g.putdata(row)
        g = g.resize((n, size)) if horiz else g.transpose(Image.ROTATE_90).resize((size, n))
        return g

    base.paste(im, (0, 0), ramp_mask(w, h, True))
    base.paste(im, (0, 0), ramp_mask(h, w, False))
    return base


def ramp_img(im, dark, light):
    """Đổi màu ảnh theo ĐỘ SÁNG: chỗ tối -> `dark`, chỗ sáng -> `light`.

    Dùng để một tấm nền cỏ đẻ ra nền cát và nền tuyết: vân cỏ (từng ngọn, từng
    mảng) vẫn còn nguyên, chỉ bảng màu là khác. Rẻ hơn nhiều so với đi tìm cho
    đủ năm tấm texture rời, và năm sa mạc/tuyết đó ăn khớp nhau về mật độ vân.
    """
    d = tuple(int(dark[i:i + 2], 16) for i in (1, 3, 5))
    l = tuple(int(light[i:i + 2], 16) for i in (1, 3, 5))
    lut = []
    for ch in range(3):
        lut += [int(d[ch] + (l[ch] - d[ch]) * (v / 255.0)) for v in range(256)]
    a = im.getchannel('A')
    g = im.convert('L').convert('RGB').point(lut)
    g.putalpha(a)
    return g


def pack_one(src, name, node=None, src2=None):
    """Ghép khung rời thành một dải ngang. Trả về (Image, số khung, w, h)."""
    node = node or {}
    folder = os.path.join(src, name)
    files = None
    if not os.path.isdir(folder):
        # Nguồn thứ hai: thư mục ảnh PHẲNG nằm ngay trong repo (_assets_src/**).
        # Dùng cho những ảnh không lấy từ kho HoloCure — chúng phải đi kèm repo,
        # nếu không thì máy nào không có ổ D: là chạy pack.py ra thiếu.
        if src2:
            for sub in ('', 'weapons', 'fx'):
                one = os.path.join(src2, sub, name + '.png')
                if os.path.isfile(one):
                    files = [one]
                    break
        if files is None:
            return None
    if files is None:
        files = frame_files(folder)
    if not files:
        # vài sprite chỉ có đúng một file không đánh số
        one = os.path.join(folder, name + '.png')
        if os.path.isfile(one):
            files = [one]
        else:
            return None
    imgs = [Image.open(f).convert('RGBA') for f in files]
    # Nguồn đã là một DẢI NGANG sẵn: cắt lại thành từng khung. Dùng cho bộ VFX
    # nhập từ ngoài, nơi mỗi hiệu ứng tới dưới dạng một tấm duy nhất — chép ra
    # mười lăm file rời chỉ để pack.py ghép lại thì thừa một vòng.
    ns = node.get('strip')
    if ns and len(imgs) == 1:
        w0 = imgs[0].width // ns
        imgs = [imgs[0].crop((i * w0, 0, (i + 1) * w0, imgs[0].height)) for i in range(ns)]
    crop = node.get('crop')
    if crop:
        imgs = [i.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3])) for i in imgs]
    rz = node.get('resize')
    if rz:
        imgs = [i.resize((rz[0], rz[1]), Image.NEAREST) for i in imgs]
    if node.get('seamless'):
        imgs = [seamless_img(i) for i in imgs]
    rp = node.get('ramp')
    if rp:
        imgs = [ramp_img(i, rp[0], rp[1]) for i in imgs]
    w = max(i.width for i in imgs)
    h = max(i.height for i in imgs)
    strip = Image.new('RGBA', (w * len(imgs), h), (0, 0, 0, 0))
    for i, im in enumerate(imgs):
        strip.paste(im, (i * w, 0))
    return strip, len(imgs), w, h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=r'D:\HoloCureAssets\GameSprites')
    ap.add_argument('--src2', default=os.path.join(GAME, '_assets_src'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    if not os.path.isfile(MAP_PATH):
        sys.exit('Chưa có %s — soạn manifest trước đã.' % MAP_PATH)

    with open(MAP_PATH, encoding='utf-8') as f:
        amap = json.load(f)

    meta = load_meta(a.src)
    items = []
    walk(amap, '', items)
    if not items:
        sys.exit('Manifest không có mục nào có khoá "spr".')

    if not a.dry_run:
        os.makedirs(OUT_DIR, exist_ok=True)

    ok = miss = 0
    total_bytes = 0
    seen = {}
    for key, node in items:
        name = node['spr']
        # Một sprite gốc có thể đẻ ra nhiều biến thể (cắt khác chỗ, đổi bảng màu),
        # nên khoá bộ nhớ đệm VÀ tên file đích phải kèm chữ ký của biến thể —
        # không thì năm biome cùng ghi đè lên một BG_newgrass.png.
        var = variant(node)
        out_name = name + var
        if out_name in seen:                  # nhiều khoá dùng chung một sprite
            node.update(seen[out_name])
            ok += 1
            continue
        r = pack_one(a.src, name, node, a.src2)
        if not r:
            print('  THIẾU  %-34s <- %s' % (key, name))
            miss += 1
            continue
        strip, n, w, h = r
        m = meta.get(name, {})
        node['frames'] = n
        node['w'] = w
        node['h'] = h

        # --- NEO: chỗ sai kín đáo nhất của cả pipeline ---
        # sprites.csv ghi origin theo KHUNG GỐC của sprite (ví dụ 64x64), nhưng file
        # PNG trên đĩa đã bị CẮT SÁT VIỀN (takodachi còn 21x21). Bê nguyên origin của
        # khung gốc vào ảnh đã cắt là mọi thứ trôi lên khỏi cái bóng của nó —
        # 40 pixel với con takodachi.
        #
        # Nên: chỉ tin origin của csv khi kích thước còn KHỚP (tức chưa bị cắt).
        # Cắt rồi thì tự chọn neo theo vai trò:
        #   nhân vật / quái / boss -> ĐÁY-GIỮA, neo vào chân, để bóng nằm đúng dưới
        #   hiệu ứng / vật phẩm    -> TÂM, vì chúng nở ra quanh điểm va chạm
        cat = key.split('.')[0]
        anchor = node.get('anchor') or ('foot' if cat in ('player', 'mobs', 'bosses') else 'center')
        untrimmed = m and m.get('w') == w and m.get('h') == h
        if node.get('anchor') == 'fixed':
            # Neo do MANIFEST NGUỒN quy định, không đoán lại. Bộ VFX ngoài ghi
            # sẵn pivot của từng hiệu ứng (tâm nổ, chân cột khói, gốc tia), và
            # đoán lại bằng "tâm ảnh" sẽ làm cột khói mọc từ giữa không khí.
            pass
        elif node.get('anchor') == 'tl':
            # ô lát nền: neo góc trên-trái, vì nó được xếp thành lưới chứ không
            # đứng tại một điểm.
            node['ox'], node['oy'] = 0, 0
        elif node.get('anchor') == 'csv' and m:
            node['ox'], node['oy'] = m['ox'], m['oy']
        elif untrimmed:
            node['ox'], node['oy'] = m['ox'], m['oy']
        elif anchor == 'foot':
            node['ox'], node['oy'] = w // 2, h
        else:
            node['ox'], node['oy'] = w // 2, h // 2
        dst = os.path.join(OUT_DIR, out_name + '.png')
        if not a.dry_run:
            strip.save(dst, optimize=True)
            total_bytes += os.path.getsize(dst)
        node['file'] = out_name + '.png'
        seen[out_name] = {'frames': n, 'w': w, 'h': h,
                          'ox': node['ox'], 'oy': node['oy'], 'file': node['file']}
        ok += 1

    # Dọn file mồ côi: đổi một `ramp` hay bỏ một món trang trí là tên file đích
    # đổi theo, bản cũ nằm lại trong spr/ không ai gọi tới nữa. Thư mục này do
    # pack.py sinh ra hoàn toàn, nên xoá là đúng — art vẽ tay thì vẽ đè lên file
    # ĐANG ĐƯỢC manifest trỏ tới, file đó không bao giờ mồ côi.
    if not a.dry_run and os.path.isdir(OUT_DIR):
        keep = set(v['file'] for v in seen.values())
        for fn in sorted(os.listdir(OUT_DIR)):
            if fn.lower().endswith('.png') and fn not in keep:
                os.remove(os.path.join(OUT_DIR, fn))
                print('  dọn    %s' % fn)

    if not a.dry_run:
        with open(MAP_PATH, 'w', encoding='utf-8') as f:
            json.dump(amap, f, ensure_ascii=False, indent=1)
        # Bản .js kèm theo: mở game bằng file:// thì fetch() bị chặn, thẻ script thì không.
        with open(os.path.join(GAME, 'assets', 'asset-map.js'), 'w', encoding='utf-8') as f:
            f.write('window.DP = window.DP || {};\nwindow.DP.ASSET_MAP = ')
            json.dump(amap, f, ensure_ascii=False, indent=1)
            f.write(';\n')

    print('\n%d sprite đóng gói xong, %d thiếu.  %.1f MB' % (ok, miss, total_bytes / 1048576.0))
    if a.dry_run:
        print('(--dry-run: chưa ghi gì)')


if __name__ == '__main__':
    main()
