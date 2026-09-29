"""Lever Season Mode (thế giới): ảnh tổng quan escape_map/Init + Scene1 -> lưới chơi được + atlas art thật.

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/season/build_season.py
Ra:    data/season-data.js (window.SK_SEASON.world), art/season/world/world0.png
Số đo tỉ lệ và lý do: tools/season/README.md.
"""
import io
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ALL = os.path.expanduser('~/Downloads/sk-ref/all')
ESC = os.path.join(ALL, 'escape')
MAPS = os.path.join(ALL, 'escape_map')
OUT_JS = os.path.join(GAME, 'data', 'season-data.js')
OUT_ART = os.path.join(GAME, 'art', 'season', 'world')

T = 16          # ô va chạm của engine (px thế giới)
M = 32          # ô nền = cỡ tile thật của bộ escape
# [ĐO] khớp mẫu Building_4 (sai số 724) và Tree_2 (417) trên Init.png: 1 px ảnh = 0.825 px sprite.
# [ĐO] khớp mẫu Tent_1 (1498) và ApeArea_2 (1337) trên Scene1.png: 1 px ảnh = 0.185 px sprite.
SCALE = {'base': 1 / 0.825, 's1': 1 / 0.185}
IMG = {'base': 'Init', 's1': 'Scene1'}

rng = np.random.RandomState(20260929)


# ---------------------------------------------------------------- phân loại màu
GRASS, DIRT, DEEP, OTHER, SHALLOW = 0, 1, 2, 3, 4


def pixclass(a):
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    c = np.full(r.shape, OTHER, np.uint8)
    grass = (abs(r - 140) <= 14) & (abs(g - 156) <= 14) & (abs(b - 60) <= 16)
    dirt = (r >= 145) & (r - g >= 18) & (g - b >= 40) & (r < 235)
    deep = (b > r + 30) & (b >= 80) & (g < 110)
    shal = (g >= 140) & (b >= 150) & (b > r)
    c[grass] = GRASS
    c[dirt] = DIRT
    c[deep] = DEEP
    c[shal] = SHALLOW
    return c


def cell_hist(c, k, gw, gh):
    """Tỉ lệ từng lớp trong mỗi ô (k = px ảnh mỗi ô) -> mảng [gh, gw, 5]."""
    out = np.zeros((gh, gw, 5), np.float32)
    H, W = c.shape
    for y in range(gh):
        y0, y1 = int(y * k), min(H, max(int(y * k) + 1, int((y + 1) * k)))
        for x in range(gw):
            x0, x1 = int(x * k), min(W, max(int(x * k) + 1, int((x + 1) * k)))
            blk = c[y0:y1, x0:x1]
            if blk.size:
                out[y, x] = np.bincount(blk.ravel(), minlength=5) / blk.size
    return out


def components(mask):
    """Nhãn thành phần liên thông 4 hướng (không có scipy trên máy)."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    sizes = [0]
    n = 0
    for y in range(H):
        for x in range(W):
            if not mask[y, x] or lab[y, x]:
                continue
            n += 1
            st = [(y, x)]
            lab[y, x] = n
            cnt = 0
            while st:
                cy, cx = st.pop()
                cnt += 1
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        st.append((ny, nx))
            sizes.append(cnt)
    return lab, sizes


def drop_small(mask, minsize):
    lab, sizes = components(mask)
    keep = np.array([s >= minsize for s in sizes])
    return keep[lab] & mask


def rle(s):
    out, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        out.append(s[i] + (str(j - i) if j - i > 1 else ''))
        i = j
    return ''.join(out)


def grid_str(g):
    return rle(''.join(''.join(row) for row in g))


# ---------------------------------------------------------------- vật thể đặt tay (toạ độ ảnh, đo bằng khớp mẫu)
# (sprite, x, y) = chân giữa sprite trên ảnh tổng quan.
BASE_BUILDINGS = [
    # sprite, x, y, loại, tên, lật ngang — [ĐO] khớp mẫu cả hai chiều; Building_5/6/7 trên Init là bản lật gương
    ('Building_6', 238, 328, 'design', 'Bàn thiết kế', True),     # sai số 1234 (thẳng 3429)
    ('Building_5', 304, 331, 'training', 'Khu huấn luyện', True),  # sai số 1180 (thẳng 9355)
    ('Building_4', 410, 356, 'store', 'Cửa hàng', False),          # sai số 724 (lật 7904)
    ('Building_7', 595, 517, 'warehouse', 'Nhà kho', True),        # sai số 552 (thẳng 10164)
]
BASE_POINTS = {
    'portal': (570, 196),      # [ĐO] tâm xoáy xanh (570,170), chân lấy dưới 26 px
    'spawn': (410, 408),       # [ĐO] ngã ba dưới quầy mái tím, như ảnh e_0929_101229
    'npc': (632, 336),         # [ĐO] suy từ ảnh e: NPC cách hiệp sĩ (+269,-84) px màn hình / 2.14
}
S1_CAMPS = [
    # sprite, x, y, loại quái chính  — [ĐO] vị trí + sprite khớp mẫu trên Scene1.png
    ('ApeArea_2', 73, 271, 'ape'),
    ('Tent_1', 137, 356, 'macaque'),
    ('Tent_2', 161, 617, 'macaque'),
    ('Tent_1', 284, 666, 'ape'),
    ('Tent_2', 436, 672, 'macaque'),
    ('Tent_2', 722, 565, 'ape'),
    ('Tent_2', 845, 607, 'mixed'),
]
S1_POINTS = {
    'entry': (515, 44),        # [ĐO] sàn gỗ đầu phía bắc, lối vào từ căn cứ
    'exits': [(104, 160), (918, 402), (641, 928)],   # [ĐOÁN] ba đầu đường cụt ở rìa bản đồ
}
S1_DECKS = [(486, 0, 545, 34)]   # [ĐO] sàn gỗ phía bắc (x0,y0,x1,y1 trên ảnh)
S1_BRIDGES = [(203, 446, 213, 502)]   # [ĐO] cầu gỗ dọc qua sông (rộng ~11 px ảnh = 2 ô 32 px)


def build_map(key):
    s = SCALE[key]
    img = Image.open(os.path.join(MAPS, IMG[key] + '.png')).convert('RGB')
    a = np.asarray(img)
    H, W = a.shape[:2]
    c = pixclass(a)
    if key == 'base':
        c[(c == DEEP) | (c == SHALLOW)] = DIRT      # xoáy cổng không phải nước
        for sp, x, y, _, _, _ in BASE_BUILDINGS:        # nhà trên ảnh là lớp OTHER, xoá về cỏ trước khi đếm
            im = Image.open(os.path.join(ESC, sp + '.png'))
            w, h = im.width / s, im.height / s
            c[int(y - h):int(y + 2), int(x - w / 2 - 2):int(x + w / 2 + 2)] = GRASS
    else:
        for sp, x, y, _ in S1_CAMPS:
            im = Image.open(os.path.join(ESC, sp + '.png'))
            w, h = im.width / s, im.height / s
            c[int(y - h * 0.8):int(y + 1), int(x - w / 2):int(x + w / 2)] = GRASS
    gw, gh = int(np.ceil(W * s / T)), int(np.ceil(H * s / T))
    mw, mh = (gw + 1) // 2, (gh + 1) // 2
    hs = cell_hist(c, T / s, gw, gh)
    hm = cell_hist(c, M / s, mw, mh)

    # rừng ở ô 16 px: phần lớn điểm ảnh không phải cỏ/đất/nước
    forest = hs[..., OTHER] >= 0.5
    forest = ~drop_small(~forest, 10)           # khoảng hở lác đác giữa rừng -> rừng
    forest = drop_small(forest, 6)              # bụi lẻ trên bãi cỏ -> cỏ
    # Ảnh chụp từ trên nên tán cây che lên phía bắc ~40 px: gốc cây (ô chắn) chỉ ở nơi rừng kéo dài lên trên.
    lift = 3   # [ĐO] tán Tree_* cao 63 px, gốc nằm ~48 px dưới mép trên của khối rừng trên ảnh
    trunk = forest.copy()
    for k in range(1, lift + 1):
        trunk[k:] &= forest[:-k]

    # nền ô 32 px
    water = (hm[..., DEEP] + hm[..., SHALLOW]) >= 0.4
    water = drop_small(water, 4)
    dirt = (hm[..., DIRT] >= 0.3) & ~water
    dirt = drop_small(dirt, 3)
    # đường tối thiểu 2 ô (bộ tile viền cần 2 ô), chọn bên có nhiều đất hơn
    for _ in range(2):
        add = np.zeros_like(dirt)
        for y in range(mh):
            for x in range(mw):
                if not dirt[y, x]:
                    continue
                n = y > 0 and dirt[y - 1, x]
                so = y < mh - 1 and dirt[y + 1, x]
                if not n and not so:
                    up = hm[y - 1, x, DIRT] if y > 0 else -1
                    dn = hm[y + 1, x, DIRT] if y < mh - 1 else -1
                    if up >= dn and y > 0:
                        add[y - 1, x] = True
                    elif y < mh - 1:
                        add[y + 1, x] = True
                w_ = x > 0 and dirt[y, x - 1]
                e_ = x < mw - 1 and dirt[y, x + 1]
                if not w_ and not e_:
                    lf = hm[y, x - 1, DIRT] if x > 0 else -1
                    rt = hm[y, x + 1, DIRT] if x < mw - 1 else -1
                    if lf >= rt and x > 0:
                        add[y, x - 1] = True
                    elif x < mw - 1:
                        add[y, x + 1] = True
        dirt |= add & ~water
    ground = np.full((mh, mw), 'g')
    ground[dirt] = 'd'
    ground[water] = 'w'
    decks = []
    # 'k' sàn gỗ trên đất, 'b' cầu trên nước
    for ch, rects in (('k', S1_DECKS), ('b', S1_BRIDGES)) if key == 's1' else ():
        for (x0, y0, x1, y1) in rects:
            mx0, my0 = int(x0 * s / M), int(y0 * s / M)
            mx1, my1 = int(np.ceil(x1 * s / M)), int(np.ceil(y1 * s / M))
            ground[my0:my1, mx0:mx1] = ch
            decks.append([ch, mx0, my0, mx1, my1])

    # lưới ô 16 px: '.' đi được, 'w' nước, 'f' tán rừng, t/g/y = gốc cây (màu tán lấy từ ảnh phía trên gốc)
    solid = np.full((gh, gw), '.')
    for y in range(gh):
        for x in range(gw):
            if ground[y // 2, x // 2] == 'w':
                solid[y, x] = 'w'
            elif ground[y // 2, x // 2] in 'bk':
                solid[y, x] = '.'
            elif trunk[y, x]:
                cx, cy = int((x + 0.5) * T / s), int(((y + 0.5) * T - 30) / s)
                cx, cy = min(W - 1, max(0, cx)), min(H - 1, max(0, cy))
                win = a[max(0, cy - 3):cy + 4, max(0, cx - 3):cx + 4].reshape(-1, 3).astype(int)
                yel = ((win[:, 0] > 110) & (win[:, 2] < 30)).mean()
                teal = ((win[:, 2] > win[:, 0] + 10) & (win[:, 1] > 90)).mean()
                solid[y, x] = 'y' if yel > 0.25 else 't' if teal > 0.3 else 'g'
            elif forest[y, x]:
                # dải tán phía bắc khối rừng: chắn đi lại (đứng ngoài mép tán như game gốc) nhưng không mọc gốc cây
                solid[y, x] = 'f'
    # biên bản đồ luôn là rừng để không ai đi ra mép
    for y in range(gh):
        for x in range(gw):
            if (x < 1 or y < 1 or x >= gw - 1 or y >= gh - 1) and solid[y, x] == '.' and ground[min(mh - 1, y // 2), min(mw - 1, x // 2)] not in 'bk':
                solid[y, x] = 't'

    def w(px, py):
        return [round(px * s, 1), round(py * s, 1)]
    out = {'img': IMG[key], 'scale': round(s, 4), 'imgW': W, 'imgH': H, 'W': gw, 'H': gh, 'MW': mw, 'MH': mh,
           'ground': grid_str(ground), 'solid': grid_str(solid), 'decks': decks}
    if key == 'base':
        out['buildings'] = [{'sprite': sp, 'x': w(x, y)[0], 'y': w(x, y)[1], 'kind': kind, 'name': nm, 'flip': fl}
                            for sp, x, y, kind, nm, fl in BASE_BUILDINGS]
        out['points'] = {k: w(*v) for k, v in BASE_POINTS.items()}
    else:
        out['camps'] = [{'sprite': sp, 'x': w(x, y)[0], 'y': w(x, y)[1], 'kind': kind} for sp, x, y, kind in S1_CAMPS]
        out['points'] = {'entry': w(*S1_POINTS['entry']), 'exits': [w(*p) for p in S1_POINTS['exits']]}
        out['crates'] = crate_spots(out, solid, ground, s)
    return out


CRATE_TYPES = ['resource', 'food', 'medical', 'supply', 'misc']


def crate_spots(mp, solid, ground, s):
    """[ƯỚC LƯỢNG] ảnh map không có dữ liệu thùng: 3-4 thùng quanh mỗi trại + rải dọc mép đường, sát bìa rừng."""
    gh, gw = solid.shape
    walk = solid == '.'

    def free(x, y):
        tx, ty = int(x // T), int(y // T)
        if tx < 2 or ty < 2 or tx >= gw - 2 or ty >= gh - 2:
            return False
        return walk[ty - 1:ty + 2, tx - 1:tx + 2].all()
    spots = []
    for cp in mp['camps']:
        n = 0
        for _ in range(200):
            if n >= 4:
                break
            a = rng.uniform(0, 2 * np.pi)
            d = rng.uniform(70, 150)
            x, y = cp['x'] + np.cos(a) * d, cp['y'] + np.sin(a) * d * 0.7
            if free(x, y) and all(np.hypot(x - q[0], y - q[1]) > 40 for q in spots):
                spots.append([round(x), round(y), CRATE_TYPES[len(spots) % 5]])
                n += 1
    # rải thêm: ô cỏ/đất cạnh rừng, cách nhau >= 260 px
    cand = []
    for ty in range(3, gh - 3, 2):
        for tx in range(3, gw - 3, 2):
            if walk[ty, tx] and not walk[ty - 2:ty + 3, tx - 2:tx + 3].all() and walk[ty - 1:ty + 2, tx - 1:tx + 2].all():
                cand.append((tx * T + 8, ty * T + 12))
    rng.shuffle(cand)
    for x, y in cand:
        if len(spots) >= 60:
            break
        if all(np.hypot(x - q[0], y - q[1]) > 260 for q in spots):
            spots.append([x, y, CRATE_TYPES[int(rng.randint(0, 5))]])
    return spots


# ---------------------------------------------------------------- atlas
def trimmed_offset(im):
    """Tile 32x32 bị cắt viền trong suốt khi rip: đoán góc neo theo phía nào có nhiều điểm đặc."""
    w, h = im.size
    if w == M and h == M:
        return 0, 0
    A = np.asarray(im)[..., 3] > 100
    ox = 0 if (w >= M or A[:, 0].sum() >= A[:, -1].sum()) else M - w
    oy = 0 if (h >= M or A[0].sum() >= A[-1].sum()) else M - h
    return ox, oy


def tile_role(im, ox, oy):
    """Vai trò tile blob 3x3 (+ khuyết góc) từ ảnh 32x32 dựng lại: cạnh trống N/E/S/W, góc khuyết."""
    A = np.zeros((M, M), bool)
    A[oy:oy + im.height, ox:ox + im.width] = np.asarray(im)[..., 3] > 100
    if A.sum() == 0:
        return 'empty'
    band = lambda sl: A[sl].mean()
    N = band((slice(0, 2), slice(12, 20))) < 0.5
    S = band((slice(30, 32), slice(12, 20))) < 0.5
    Wd = band((slice(12, 20), slice(0, 2))) < 0.5
    E = band((slice(12, 20), slice(30, 32))) < 0.5
    if N or S or Wd or E:
        return ''.join(k for k, v in (('N', N), ('E', E), ('S', S), ('W', Wd)) if v)
    notch = ''.join(k for k, sl in (('a', (slice(0, 3), slice(0, 3))), ('b', (slice(0, 3), slice(29, 32))),
                                     ('c', (slice(29, 32), slice(0, 3))), ('d', (slice(29, 32), slice(29, 32))))
                    if A[sl].mean() < 0.5)
    return 'full' if not notch else 'x' + notch    # a=TL b=TR c=BL d=BR


def yellow_pine(im):
    """Tree_1 (thông xanh lá) đổi bảng màu sang thông vàng của rừng Init.
    Tree_0/1/2 là cùng hình khác bảng màu; [ĐO] 5 màu lá vàng trên Init.png xếp theo độ sáng thay 5 màu lá xanh."""
    green = [(45, 62, 36), (59, 82, 40), (71, 104, 45), (80, 122, 46), (105, 151, 53)]
    yellow = [(55, 80, 0), (81, 102, 0), (99, 121, 0), (123, 150, 0), (161, 185, 5)]
    a = np.asarray(im).copy()
    for g, y in zip(green, yellow):
        m = (a[..., 0] == g[0]) & (a[..., 1] == g[1]) & (a[..., 2] == g[2])
        a[m, :3] = y
    return Image.fromarray(a)


class Packer:
    def __init__(self, width=2048):
        self.W = width
        self.items = []

    def add(self, name, im, ax, ay):
        self.items.append((name, im, ax, ay))

    def pack(self):
        items = sorted(self.items, key=lambda t: -t[1].height)
        x = y = rowh = 0
        pos = {}
        for name, im, ax, ay in items:
            if x + im.width + 1 > self.W:
                x, y, rowh = 0, y + rowh + 1, 0
            pos[name] = (x, y)
            x += im.width + 1
            rowh = max(rowh, im.height)
        H = y + rowh + 1
        page = Image.new('RGBA', (self.W, H), (0, 0, 0, 0))
        table = {}
        for name, im, ax, ay in self.items:
            px, py = pos[name]
            page.paste(im, (px, py))
            table[name] = [px, py, im.width, im.height, round(ax, 1), round(ay, 1)]
        return page, table


def load(bundle, name):
    p = os.path.join(ALL, bundle, name + '.png')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None


ENEMIES = ['macaque_1', 'macaque_2', 'macaque_3', 'macaque_4', 'macaque_elite', 'ape_1', 'ape_2', 'ape_3', 'ape_elite']


def build_atlas():
    pk = Packer()
    roles = {}
    for ts in ('dirt', 'grass', 'water_shallow', 'water_deep'):
        roles[ts] = {}
        for i in range(16):
            im = load('escape', '%s_%d' % (ts, i))
            if im is None:
                continue
            ox, oy = trimmed_offset(im)
            r = tile_role(im, ox, oy)
            if r == 'empty':
                continue
            pk.add('%s_%d' % (ts, i), im, -ox, -oy)
            roles[ts].setdefault(r, []).append('%s_%d' % (ts, i))
    for nm in ('WoodBridgeDark_2', 'connect_1'):
        im = load('escape', nm)
        pk.add(nm, im, im.width / 2 if nm == 'connect_1' else 0, im.height if nm == 'connect_1' else 0)
    # cây: gốc ở giữa đáy
    for nm in ('Tree_0', 'Tree_1', 'Tree_2'):
        im = load('escape', nm)
        pk.add(nm, im, im.width / 2, im.height - 2)
    t1 = load('escape', 'Tree_1')
    pk.add('Tree_Y', yellow_pine(t1), t1.width / 2, t1.height - 2)
    for nm in ('Building_4', 'Building_5', 'Building_6', 'Building_7', 'Tent_1', 'Tent_2', 'ApeArea_2', 'Teleporter_0'):
        im = load('escape', nm)
        pk.add(nm, im, im.width / 2, im.height)
    for i in list(range(0, 8)) + list(range(16, 24)):
        im = load('escape', 'npc_trainer_%d' % i)
        if im is not None:
            pk.add('npc_trainer_%d' % i, im, im.width / 2, im.height)
    anims = {}
    for en in ENEMIES:
        fr = []
        for i in range(17):
            nm = 'e_escape_%s_%d' % (en, i)
            im = load('escape', nm)
            if im is None:
                continue
            pk.add(nm, im, im.width / 2, im.height)
            fr.append(nm)
        # [ĐO] sheet 17 khung: 0-7 đứng, 8-15 chạy, 16 nằm chết (cùng bố cục mọi con khỉ)
        anims[en] = {'idle': fr[0:8], 'run': fr[8:16], 'dead': fr[16:17]}
    dodge = []
    for i in range(4):
        nm = 'e_escape_macaque_1_dodge_%d' % i
        im = load('escape', nm)
        if im is not None:
            pk.add(nm, im, im.width / 2, im.height)
            dodge.append(nm)
    anims['macaque_1']['dodge'] = dodge
    anims['npc_trainer'] = {'idle': ['npc_trainer_%d' % i for i in range(8)],
                            'talk': ['npc_trainer_%d' % i for i in range(16, 24)]}
    for i in range(10, 28):
        im = load('escape', 'Chest_%d' % i)
        pk.add('Chest_%d' % i, im, im.width / 2, im.height)
    for nm in ('point_self', 'point_gate', 'point_escape', 'point_chestbox', 'point_task'):
        im = load('escape_ui_texture', nm)
        pk.add(nm, im, im.width / 2, im.height / 2)
    # 'full' chỉ giữ biến thể trơn nhất: vài tile "full" của nước sâu còn vệt sóng ở góc, lát lặp lại thành hoa văn
    for ts, R in roles.items():
        if len(R.get('full', [])) > 1:
            dom = {}
            for n in R['full']:
                a = np.asarray(load('escape', n)).reshape(-1, 4)
                a = a[a[:, 3] > 200][:, :3]
                _, c = np.unique(a, axis=0, return_counts=True)
                dom[n] = c.max() / len(a)
            best = max(dom.values())
            R['full'] = [n for n in R['full'] if dom[n] >= best - 0.08]
    page, table = pk.pack()
    os.makedirs(OUT_ART, exist_ok=True)
    page.save(os.path.join(OUT_ART, 'world0.png'), optimize=True)
    return table, roles, anims, page.size


def main():
    table, roles, anims, size = build_atlas()
    maps = {k: build_map(k) for k in ('base', 's1')}
    import hashlib
    v = hashlib.md5(open(os.path.join(OUT_ART, 'world0.png'), 'rb').read()).hexdigest()[:8]
    data = {'atlas': {'src': 'art/season/world/world0.png', 'v': v, 'size': list(size), 'f': table},
            'roles': roles, 'anims': anims, 'maps': maps}
    js = ('// SINH TỰ ĐỘNG bởi tools/season/build_season.py — không sửa tay.\n'
          'window.SK_SEASON = window.SK_SEASON || {};\n'
          'window.SK_SEASON.world = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    for k, m in maps.items():
        print(k, 'cells', m['W'], 'x', m['H'], 'ground', len(m['ground']), 'solid', len(m['solid']),
              'crates', len(m.get('crates', [])))
    print('atlas', size, 'frames', len(table), 'js', len(js))
    for ts, r in roles.items():
        print(ts, {k: len(v) for k, v in r.items()})


if __name__ == '__main__':
    main()
