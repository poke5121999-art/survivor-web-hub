"""Tile và sprite NPC của PRO cho bản đồ 2D (đọc data/maps.js do tools/build_maps.js sinh ra).

  python tools/pro/rip_tiles.py                 chép art/pro/tiles/<tấm>.png và art/pro/npc/sprite<N>.png mà bản đồ
                                                dùng, xoá tấm/sprite không còn dùng, báo ô tham chiếu trống
  python tools/pro/rip_tiles.py --preview DIR   vẽ mỗi bản đồ ra DIR/<id>.png (nền, NPC mặt trước, lớp trên) để soát
                                                khi viết tools/maps/*.txt, không cần mở trình duyệt; thêm --grid kẻ ô
  python tools/pro/rip_tiles.py --npc-sheet F   tờ mục lục khung mặt trước của mọi sprite NPC PRO (chọn sprite=)

Nạp gói PRO mất ~2 phút, nên ảnh gốc được đệm ở D:\\pro-ref\\cache (PRO_CACHE); chạy lại chỉ đọc đệm.
Chạy lại ra cùng kết quả."""
import json, os, re, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
PRO = os.environ.get('PRO_REF', r'D:\pro-ref')
CACHE = os.environ.get('PRO_CACHE', os.path.join(PRO, 'cache'))
TILE = 32

_env = None


def env():
    global _env
    if _env is None:
        sys.path.insert(0, HERE)
        from pro_env import ProEnv
        _env = ProEnv()
    return _env


def cached(kind, name):
    """Ảnh Resources '<kind>/<name>' (tiles/12, npc/sprite5) qua đệm đĩa."""
    p = os.path.join(CACHE, kind, name + '.png')
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        env().image(kind + '/' + name).convert('RGBA').save(p)
    return p


def npc_names():
    p = os.path.join(CACHE, 'npc_names.json')
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        names = [n for n in env().listdir('npc') if re.fullmatch(r'sprite\d+', n)]
        names.sort(key=lambda n: int(n[6:]))
        json.dump(names, open(p, 'w'))
    return json.load(open(p))


def load_maps():
    src = open(os.path.join(ROOT, 'data', 'maps.js'), encoding='utf-8').read()
    m = re.search(r'^P1\.MAPS = (.*);$', src, re.M)
    if not m:
        sys.exit('data/maps.js: P1.MAPS not found (run tools/build_maps.js first)')
    return json.loads(m.group(1))


def decode(t):
    return t // 1024, (t % 1024) % 32, (t % 1024) // 32


def sync():
    maps = load_maps()
    sheets = sorted({s for M in maps.values() for s in M['sheets']})
    # Cộng tấm dự phòng của người chơi (js/world-actor.js FALLBACK_PLAYER) để không bị xoá như tấm thừa.
    fb = re.search(r"FALLBACK_PLAYER = '(sprite\d+)'", open(os.path.join(ROOT, 'js', 'world-actor.js'), encoding='utf-8').read())
    sprites = sorted({a['sprite'] for M in maps.values() for a in M['npcs'] if a.get('sprite')} | ({fb.group(1)} if fb else set()),
                     key=lambda n: int(n[6:]))
    known = set(npc_names())
    bad = [s for s in sprites if s not in known]
    if bad:
        sys.exit('sprite not in PRO npc/: ' + ', '.join(bad))
    out_t = os.path.join(ROOT, 'art', 'pro', 'tiles')
    out_n = os.path.join(ROOT, 'art', 'pro', 'npc')
    for d in (out_t, out_n):
        os.makedirs(d, exist_ok=True)
    imgs = {}
    for s in sheets:
        im = Image.open(cached('tiles', str(s)))
        imgs[s] = im
        dst = os.path.join(out_t, f'{s}.png')
        if not os.path.exists(dst) or open(dst, 'rb').read() != open(cached('tiles', str(s)), 'rb').read():
            im.save(dst, optimize=True)
    for s in sprites:
        Image.open(cached('npc', s)).save(os.path.join(out_n, s + '.png'), optimize=True)
    stale = [f for f in os.listdir(out_t) if f.endswith('.png') and int(f[:-4]) not in sheets] + \
            [f for f in os.listdir(out_n) if f.endswith('.png') and f[:-4] not in sprites]
    for f in stale:
        os.remove(os.path.join(out_t if f[0].isdigit() else out_n, f))
    # Ô nền (lớp 0) trong suốt hoàn toàn = gõ nhầm toạ độ trong brushes.txt (lộ nền đen). Ô trống bên trong một tem
    # nhiều ô là bình thường nên không báo.
    empty = {}
    for mid, M in maps.items():
        for layer in M['ground'][:1]:
            for t in layer:
                if t < 0:
                    continue
                s, c, r = decode(t)
                if imgs[s].crop((c * TILE, r * TILE, c * TILE + TILE, r * TILE + TILE)).getextrema()[3][1] == 0:
                    empty.setdefault(f'{s}:{c},{r}', set()).add(mid)
    size = sum(os.path.getsize(os.path.join(out_t, f)) for f in os.listdir(out_t))
    print(f'{len(sheets)} tấm tile ({size // 1024} KB): {sheets}')
    print(f'{len(sprites)} sprite NPC: {sprites}')
    if stale:
        print('xoá không còn dùng:', stale)
    for k, v in sorted(empty.items()):
        print(f'CẢNH BÁO ô trống {k} dùng ở {sorted(v)}')


def preview(out, grid):
    maps = load_maps()
    os.makedirs(out, exist_ok=True)
    tiles = {}

    def tile(t):
        s, c, r = decode(t)
        if s not in tiles:
            tiles[s] = Image.open(cached('tiles', str(s))).convert('RGBA')
        return tiles[s].crop((c * TILE, r * TILE, c * TILE + TILE, r * TILE + TILE))

    for mid, M in maps.items():
        w, h = M['w'], M['h']
        im = Image.new('RGBA', (w * TILE, h * TILE), (0, 0, 0, 255))

        def paint(layers):
            for layer in layers:
                for i, t in enumerate(layer):
                    if t >= 0:
                        im.alpha_composite(tile(t), ((i % w) * TILE, (i // w) * TILE))
        paint(M['ground'])
        for a in sorted(M['npcs'], key=lambda a: a['y']):
            if not a.get('sprite'):
                continue
            sh = Image.open(cached('npc', a['sprite'])).convert('RGBA')
            row = {'up': 0, 'right': 1, 'down': 2, 'left': 3}  # hàng 1 quay phải, 3 quay trái (đo trên npc/sprite1)
            row = row.get(a.get('face'), 2)
            fr = sh.crop((64, row * 64, 128, row * 64 + 64))
            im.alpha_composite(fr, (a['x'] * TILE - 16, a['y'] * TILE - 32 + 0))
        paint(M['over'])
        if grid:
            d = ImageDraw.Draw(im, 'RGBA')
            col = {1: (255, 0, 0, 70), 2: (255, 220, 0, 110), 3: (255, 220, 0, 110), 4: (255, 220, 0, 110),
                   5: (255, 220, 0, 110), 6: (160, 0, 255, 90)}
            for i, c in enumerate(M['colliders']):
                x, y = (i % w) * TILE, (i // w) * TILE
                if c in col:
                    d.rectangle([x, y, x + TILE - 1, y + TILE - 1], fill=col[c])
                if M['zones']['grid'][i]:
                    d.rectangle([x + 4, y + 4, x + TILE - 5, y + TILE - 5], outline=(0, 255, 0, 200))
            for L in M['links']:
                x, y = min(max(L['x'], 0), w - 1) * TILE, min(max(L['y'], 0), h - 1) * TILE
                d.rectangle([x + 2, y + 2, x + TILE - 3, y + TILE - 3], outline=(0, 120, 255, 255), width=3)
            for x in range(0, w * TILE, TILE):
                d.line([(x, 0), (x, h * TILE)], fill=(0, 0, 0, 60))
            for y in range(0, h * TILE, TILE):
                d.line([(0, y), (w * TILE, y)], fill=(0, 0, 0, 60))
            for x in range(0, w, 5):
                for y in range(0, h, 5):
                    d.text((x * TILE + 1, y * TILE), f'{x},{y}', fill=(255, 255, 255, 255))
        im.convert('RGB').save(os.path.join(out, mid + '.png'))
        print(os.path.join(out, mid + '.png'))


def npc_sheet(out):
    names = npc_names()
    cols, cw, ch = 20, 64, 78
    sheet = Image.new('RGB', (cols * cw, ((len(names) + cols - 1) // cols) * ch), (60, 90, 60))
    d = ImageDraw.Draw(sheet)
    for i, n in enumerate(names):
        fr = Image.open(cached('npc', n)).convert('RGBA').crop((64, 128, 128, 192))
        x, y = (i % cols) * cw, (i // cols) * ch
        sheet.paste(fr, (x, y + 12), fr)
        d.text((x + 2, y), n[6:], fill=(255, 255, 0))
    sheet.save(out)
    print(out, len(names), 'sprite')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--preview':
        preview(a[1], '--grid' in a)
    elif a and a[0] == '--npc-sheet':
        npc_sheet(a[1])
    else:
        sync()
