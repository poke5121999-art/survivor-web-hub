"""Dò ô tile PRO cho từng ô của một ảnh bản đồ PRO tham chiếu (ảnh chụp/ảnh ghép bị mờ vì co giãn).

  python tools/pro/match_ref.py <ảnh> <thư_mục_ra> [--scale 0.5] [--base 60:23,8] [--sheets 1,60,61]

Mỗi ô 32 px (ảnh nửa cỡ thì --scale 0.5) được so với mọi ô tile của 144 tấm, ô trong suốt được phủ lên ô nền --base
trước khi so. Lọc thô ở 8×8 (trung bình 4×4 xoá được độ mờ), rồi xếp lại 40 ứng viên tốt nhất ở 32×32 sau khi làm mờ
ứng viên giống ảnh tham chiếu. Ra:
  <ra>/cells.json   [[hàng, cột, [[S,c,r,rmse] ×5]], ...]
  <ra>/rebuild.png  dựng lại bằng ô tốt nhất, cạnh ảnh gốc có lưới (để soát bằng mắt)
  <ra>/sheets.txt   tấm nào hay xuất hiện
Ô tốt nhất chỉ là gợi ý tìm tấm/tranh; bản đồ vẫn viết tay trong tools/maps/*.txt."""
import json, os, sys, collections
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CAT = os.environ.get('PRO_CATALOG', r'D:\pro-ref\catalog')
T = 32


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def cell(im, s, c, r):
    return im.crop((c * T, r * T, c * T + T, r * T + T))


def main():
    src, out = sys.argv[1], sys.argv[2]
    scale = float(arg('--scale', '1'))
    bs, bc, br = map(int, arg('--base', '60:23,8').replace(':', ',').split(','))
    only = set(map(int, arg('--sheets', '').split(','))) if '--sheets' in sys.argv else None
    os.makedirs(out, exist_ok=True)
    ref = Image.open(src).convert('RGB')
    if scale != 1:
        ref = ref.resize((round(ref.width / scale), round(ref.height / scale)), Image.BICUBIC)
    H, W = ref.height // T, ref.width // T
    base = cell(Image.open(os.path.join(CAT, f'raw_{bs}.png')).convert('RGBA'), bs, bc, br)

    ids, fine = [], []
    for s in range(1, 145):
        if only and s not in only:
            continue
        im = Image.open(os.path.join(CAT, f'raw_{s}.png')).convert('RGBA')
        a = np.asarray(im)
        for r in range(32):
            for c in range(32):
                t = a[r * T:r * T + T, c * T:c * T + T]
                if (t[..., 3] > 0).mean() < 0.15:
                    continue
                comp = base.copy()
                comp.alpha_composite(Image.fromarray(t))
                ids.append((s, c, r))
                fine.append(np.asarray(comp.convert('RGB')))
    F = np.stack(fine).astype(np.float32)                      # N,32,32,3
    C8 = F.reshape(len(F), 8, 4, 8, 4, 3).mean((2, 4)).reshape(len(F), -1)
    c2 = (C8 * C8).sum(1)
    blur = np.stack([np.asarray(Image.fromarray(f.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))
                     for f in F]).astype(np.float32).reshape(len(F), -1)

    R = np.asarray(ref).astype(np.float32)
    res, hist = [], collections.Counter()
    rebuild = Image.new('RGB', (W * T, H * T))
    for y in range(H):
        for x in range(W):
            q = R[y * T:y * T + T, x * T:x * T + T]
            q8 = q.reshape(8, 4, 8, 4, 3).mean((1, 3)).reshape(-1)
            d = c2 - 2 * C8 @ q8
            top = np.argpartition(d, 40)[:40]
            e = np.sqrt(((blur[top] - q.reshape(-1)) ** 2).mean(1))
            order = top[np.argsort(e)][:5]
            best = [[*ids[i], round(float(np.sqrt(((blur[i] - q.reshape(-1)) ** 2).mean())), 1)] for i in order]
            res.append([y, x, best])
            hist[best[0][0]] += 1
            rebuild.paste(Image.fromarray(F[order[0]].astype(np.uint8)), (x * T, y * T))
    json.dump(res, open(os.path.join(out, 'cells.json'), 'w'))
    with open(os.path.join(out, 'sheets.txt'), 'w') as f:
        for s, n in hist.most_common():
            f.write(f'{s}\t{n}\n')
    side = Image.new('RGB', (W * T * 2 + 8, H * T), (0, 0, 0))
    g = ref.copy()
    d = ImageDraw.Draw(g)
    for x in range(W + 1):
        d.line([(x * T, 0), (x * T, H * T)], fill=(0, 0, 0))
    for y in range(H + 1):
        d.line([(0, y * T), (W * T, y * T)], fill=(0, 0, 0))
    for x in range(0, W, 5):
        for y in range(0, H, 5):
            d.text((x * T + 2, y * T + 1), f'{x},{y}', fill=(255, 255, 255))
    g.save(os.path.join(out, 'grid.png'))
    side.paste(g, (0, 0))
    side.paste(rebuild, (W * T + 8, 0))
    side.save(os.path.join(out, 'rebuild.png'))
    print(f'{W}x{H} ô, {len(ids)} ứng viên; tấm hay gặp:', hist.most_common(12))


if __name__ == '__main__':
    main()
