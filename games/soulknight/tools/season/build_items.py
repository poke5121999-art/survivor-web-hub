# -*- coding: utf-8 -*-
"""Bảng vật phẩm Season (Escape from Monkia) -> data/season-items.js (window.SK_SEASON_ITEMS).

Nguồn:
  - wiki: ~/Downloads/sk-ref/wiki-cache/page_Escape_from_Monkia_Items.json (giá, cân, chồng, hiệu ứng)
  - icon wiki: <Tên>_Icon.png tải về ~/Downloads/sk-ref/wiki-cache/season-items/ (lần đầu cần mạng)
  - sprite game: ~/Downloads/sk-ref/all/escape/Item_0..105.png (25x25, không có tên)
Ghép icon wiki với Item_N bằng so điểm ảnh (sai khác RGBA trung bình trên vùng có hình); cách ghép
ghi vào trường `iconBy` từng món. Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/season/build_items.py
Tuỳ chọn --sheet <out.png>: vẽ bảng đối chiếu icon wiki | Item_N để kiểm bằng mắt.
"""
import io
import json
import os
import re
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
REF = os.path.expanduser('~/Downloads/sk-ref')
WIKI_PAGE = os.path.join(REF, 'wiki-cache', 'page_Escape_from_Monkia_Items.json')
ICON_DIR = os.path.join(REF, 'wiki-cache', 'season-items')
ITEM_DIR = os.path.join(REF, 'all', 'escape')
OUT_JS = os.path.join(GAME, 'data', 'season-items.js')
API = 'https://soul-knight.fandom.com/api.php'
N_SPRITES = 106

# Mục wiki -> loại vật phẩm trong game.
SECTION_TYPE = {
    'Fabric': 'material', 'Metal': 'material', 'Wood': 'material', 'Stone': 'material',
    'Ingredients': 'material', 'Violet Energy': 'material', 'Faded Buff Sigil': 'material',
    'Crates': 'material', 'Misc': 'material', 'Treasure': 'valuable', 'Ingots': 'valuable',
    'Amulets': 'amulet', 'Backpacks': 'backpack', 'Armors': 'armor', 'Potions': 'potion', 'Foods': 'food',
}

VI = {
    'Tattered Fabric': 'Vải rách', 'Intact Fabric': 'Vải lành', 'Exquisite Fabric': 'Vải tinh xảo',
    'Durable Fabric': 'Vải bền', 'Tech-Weave Fabric': 'Vải dệt công nghệ',
    'Rusty Metal': 'Kim loại gỉ', 'Impure Metal': 'Kim loại tạp', 'Refined Metal': 'Kim loại tinh luyện',
    'Alloy Metal': 'Hợp kim', 'Reinforced Metal': 'Kim loại gia cường',
    'Scrap Wood': 'Gỗ vụn', 'Brittle Wood': 'Gỗ giòn', 'Sturdy Wood': 'Gỗ chắc',
    'Refined Wood': 'Gỗ tinh chế', 'Precious Wood': 'Gỗ quý',
    'Scrap Stone': 'Đá vụn', 'Large Stone': 'Đá tảng', 'Solid Stone': 'Đá rắn',
    'Refined Stone': 'Đá đẽo', 'Polished Stone': 'Đá mài bóng',
    'Whole Grains': 'Ngũ cốc', 'Flour': 'Bột mì', 'Honey': 'Mật ong', 'Mushroom': 'Nấm',
    'Seaweed': 'Rong biển', 'Meat': 'Thịt sống', 'Clam': 'Nghêu',
    'Violet Energy Trace': 'Vết năng lượng tím', 'Violet Energy Shard': 'Mảnh năng lượng tím',
    'Violet Energy Crystal': 'Tinh thể năng lượng tím', 'Faded Buff Sigil': 'Ấn buff phai màu',
    'Wooden Crate (S)': 'Thùng gỗ (S)', 'Wooden Crate (M)': 'Thùng gỗ (M)', 'Wooden Crate (L)': 'Thùng gỗ (L)',
    'Reverse Pocket Watch': 'Đồng hồ quay ngược', 'Cracked Gold Mask': 'Mặt nạ vàng nứt',
    'Evacuation Roster': 'Danh sách sơ tán', 'Treasure Map': 'Bản đồ kho báu',
    'Secret Treasure Map': 'Bản đồ kho báu bí mật', 'Meteorite Shard': 'Mảnh thiên thạch',
    'Prophecy Tablet': 'Bia tiên tri', "Farseer's Staff": 'Gậy nhà tiên tri',
    'Contaminated Sample Vial': 'Lọ mẫu nhiễm độc', 'Tide Calculator': 'Máy tính thuỷ triều',
    'Tidal Star Chart': 'Tinh đồ thuỷ triều',
    'Bone Needle': 'Kim xương', 'Hemp Rope Coil': 'Cuộn dây gai', 'Charcoal Stick': 'Que than',
    'Old Gear': 'Bánh răng cũ', 'Clay Bottle': 'Chai đất nung', 'Rocksalt': 'Muối mỏ',
    'Flint Tinder Box': 'Hộp đá lửa', 'Rusty Iron Nail': 'Đinh sắt gỉ', 'Seashell': 'Vỏ sò',
    'Pure Gold Coin': 'Xu vàng ròng', 'Moonwhite Pearl': 'Ngọc trai trắng trăng',
    'Copper Nugget': 'Cục đồng', 'Copper Bar': 'Thỏi đồng', 'Copper Brick': 'Gạch đồng',
    'Silver Nugget': 'Cục bạc', 'Silver Bar': 'Thỏi bạc', 'Silver Brick': 'Gạch bạc',
    'Gold Nugget': 'Cục vàng', 'Gold Bar': 'Thỏi vàng', 'Gold Brick': 'Gạch vàng',
    'Buff Amulet': 'Bùa buff',
    'Plastic Bag': 'Túi ni lông', 'Canvas Bag': 'Túi vải bố', 'Old Schoolbag': 'Cặp sách cũ',
    'Hiking Backpack': 'Balô leo núi', 'Tactical Backpack': 'Balô chiến thuật', 'Backpack of Legend': 'Balô huyền thoại',
    'Roughspun Garb': 'Áo vải thô', 'Worn Sweater': 'Áo len sờn', 'Leather Waistcoat': 'Áo gi-lê da',
    'Bodysuit': 'Bộ đồ bó', 'Shell Jacket': 'Áo khoác vỏ', 'Bullet-Proof Vest': 'Áo chống đạn',
    'Heavy Armor': 'Giáp nặng', 'Armor of Legend': 'Giáp huyền thoại',
    'Healing Potion (S)': 'Thuốc hồi máu (S)', 'Healing Potion (M)': 'Thuốc hồi máu (M)',
    'Healing Potion (L)': 'Thuốc hồi máu (L)', 'Healing Potion (XL)': 'Thuốc hồi máu (XL)',
    'Energy Potion (S)': 'Thuốc năng lượng (S)', 'Energy Potion (M)': 'Thuốc năng lượng (M)',
    'Energy Potion (L)': 'Thuốc năng lượng (L)', 'Energy Potion (XL)': 'Thuốc năng lượng (XL)',
    'Weightlifting Potion': 'Thuốc lực sĩ', 'Speed Potion': 'Thuốc tốc độ', 'Venomproof Potion': 'Thuốc kháng độc',
    'Flameproof Potion': 'Thuốc kháng lửa', 'Frostproof Potion': 'Thuốc kháng băng', 'Omni Potion': 'Thuốc vạn năng',
    'Seaweed Cracker': 'Bánh quy rong biển', 'Energy Jelly': 'Thạch năng lượng', 'Roasted Rockshroom': 'Nấm đá nướng',
    'Smoked Ham': 'Giăm bông xông khói', "Clam 'N' Rice": 'Cơm nghêu', 'Rockhoney Grilled Ribs': 'Sườn nướng mật đá',
    'Spicy Strip': 'Que cay', 'Salted Dried Fish': 'Cá khô muối', 'Canned Beans': 'Đậu đóng hộp', 'Cola': 'Cola',
    'Potato Chip': 'Khoai tây chiên', 'Stale Bread': 'Bánh mì cũ', 'Hardtack Rations': 'Lương khô',
    'Iron Coins': 'Xu sắt',
}

RARITY = ['white', 'green', 'blue', 'purple', 'orange', 'red']


def slug(name):
    s = name.replace('‑', '-').lower()
    s = re.sub(r"[^a-z0-9]+", '_', s)
    return s.strip('_')


def wikitext():
    d = json.load(io.open(WIKI_PAGE, encoding='utf-8'))
    w = d['parse']['wikitext']
    return w['*'] if isinstance(w, dict) else w


def parse_items(w):
    """Mỗi hàng bảng wiki -> dict. Cột số thay đổi theo mục (Backpacks: space/capacity, Armors: armor/durability)."""
    items = []
    for sec in re.split(r'\n==', '\n' + w)[1:]:
        title = sec.split('==', 1)[0].strip()
        typ = SECTION_TYPE[title]
        for row in re.split(r'\n\|-id=', sec)[1:]:
            name = row.split('\n', 1)[0].strip().strip('"').replace('‑', '-')
            m = re.search(r'\{\{R\|(\w+)\|', row)
            rarity = m.group(1) if m else 'white'
            desc = re.search(r"<br/>''(.*?)''", row)
            bullets = re.findall(r'^\*(.*)$', row, re.M)
            nums = re.search(r'^\|([-+\d.]+)\|\|([-+\d.]+)\|\|([-+\d.]+)(?:\|\|([-+\d.]+))?\s*$', row, re.M)
            vals = [float(x) for x in nums.groups() if x is not None]
            it = {'nameEn': name, 'section': title, 'type': typ, 'rarity': rarity,
                  'rarityIdx': RARITY.index(rarity), 'value': int(vals[0]), 'weight': vals[1],
                  'descEn': desc.group(1) if desc else '', 'notesEn': [clean(b) for b in bullets]}
            if typ == 'backpack':
                it['stack'] = 1
                it['slots'] = int(vals[2])
                it['kg'] = int(vals[3])
            elif typ == 'armor':
                it['stack'] = 1
                it['armor'] = int(vals[2])
                it['durability'] = int(vals[3])
            else:
                it['stack'] = int(vals[2])
            eff = effect_of(bullets)
            if eff:
                it['effect'] = eff
            rec = recipe_of(bullets)
            if rec:
                it['recipe'] = rec
            items.append(it)
    return items


def clean(s):
    s = re.sub(r'\{\{I\|([^}|]+)[^}]*\}\}', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


def effect_of(bullets):
    e = {}
    for b in bullets:
        b = clean(b)
        for k, rx in (('hp', r'Restores (\d+) Health'), ('energy', r'(\d+) Energy'), ('satiety', r'(\d+) Satiety'),
                      ('damage', r'Causes (\d+) Damage'), ('kg', r'weight limit by (\d+) kg'),
                      ('speed', r'Movement speed by (\d+)%')):
            m = re.search(rx, b)
            if m and ('restores' in b.lower() or k in ('damage', 'kg', 'speed')):
                e[k] = int(m.group(1))
        m = re.search(r'Immune to (\w+)', b)
        if m:
            e['immune'] = m.group(1).lower()
    return e


def recipe_of(bullets):
    for b in bullets:
        if 'recipe:' in b:
            parts = re.findall(r'(\d+)\s*\{\{I\|([^}|]+)', b)
            m = re.search(r'Requires level (\d+) (.+?)\.?$', ' '.join(clean(x) for x in bullets if 'Requires' in x))
            return {'in': [[slug(n.replace('‑', '-')), int(q)] for q, n in parts],
                    'station': m.group(2).strip().rstrip('.') if m else None, 'level': int(m.group(1)) if m else None}
    return None


# ---------------------------------------------------------------- icon wiki
# Tên tệp trên wiki khác tên hàng (gạch nối không ngắt U+2011).
WIKI_FILE = {'Bullet-Proof Vest': 'Bullet‑Proof Vest'}
WIKI_SCALE = 6  # icon wiki = sprite game phóng NEAREST x6 (Tattered Fabric 114x90 = 19x15 x6) [ĐO]


def fetch_icons(names):
    """Tải <Tên>_Icon.png (cache). Trả {tên: đường dẫn}."""
    import urllib.request
    from urllib.parse import urlencode
    os.makedirs(ICON_DIR, exist_ok=True)
    out, need = {}, []
    for n in names:
        p = os.path.join(ICON_DIR, slug(n) + '.png')
        if os.path.exists(p):
            out[n] = p
        else:
            need.append(n)
    hdr = {'User-Agent': 'survivor-web-hub item builder (personal remake)'}
    for i in range(0, len(need), 40):
        chunk = need[i:i + 40]
        by_title = {('File:%s Icon.png' % WIKI_FILE.get(n, n)): n for n in chunk}
        q = urlencode({'action': 'query', 'titles': '|'.join(by_title), 'prop': 'imageinfo', 'iiprop': 'url',
                       'format': 'json'})
        data = json.loads(urllib.request.urlopen(urllib.request.Request(API + '?' + q, headers=hdr),
                                                 timeout=40).read().decode('utf-8'))
        norm = {x['to']: x['from'] for x in data['query'].get('normalized', [])}
        for pg in data['query']['pages'].values():
            ii = pg.get('imageinfo')
            n = by_title.get(norm.get(pg['title'], pg['title'])) or by_title.get(pg['title'])
            if not ii or not n:
                continue
            raw = urllib.request.urlopen(urllib.request.Request(ii[0]['url'], headers=hdr), timeout=40).read()
            p = os.path.join(ICON_DIR, slug(n) + '.png')
            open(p, 'wb').write(raw)
            out[n] = p
            time.sleep(0.2)
    return out


def crop(img):
    img = img.convert('RGBA')
    bb = img.getbbox()
    return img.crop(bb) if bb else img


def native(img):
    """Icon wiki -> cỡ sprite gốc: lấy điểm giữa mỗi khối WIKI_SCALE."""
    img = img.convert('RGBA')
    w, h = img.width // WIKI_SCALE, img.height // WIKI_SCALE
    out = Image.new('RGBA', (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            out.putpixel((x, y), px[x * WIKI_SCALE + WIKI_SCALE // 2, y * WIKI_SCALE + WIKI_SCALE // 2])
    return out


def arr(img):
    return np.asarray(img.convert('RGBA'), dtype=np.float32)


def match_score(a, b):
    """a, b: ảnh đã cắt theo alpha. Đưa b về cỡ a; sai khác RGBA trung bình trên hợp vùng có hình (0 = trùng)."""
    if b.size != a.size:
        b = b.resize(a.size, Image.NEAREST)
    A, B = arr(a), arr(b)
    m = (A[:, :, 3] > 40) | (B[:, :, 3] > 40)
    if not m.any():
        return 999.0
    d = np.abs(A - B)[m]
    return float(d[:, :3].mean() + 0.5 * d[:, 3].mean())


def load_sprites():
    sp = {}
    for i in range(N_SPRITES):
        p = os.path.join(ITEM_DIR, 'Item_%d.png' % i)
        if os.path.exists(p):
            sp['Item_%d' % i] = Image.open(p).convert('RGBA')
    # xu sắt không có Item_N; icon HUD của nó nằm trong escape_ui_texture
    p = os.path.join(UI_DIR, 'icon_coin.png')
    if os.path.exists(p):
        sp['icon_coin'] = Image.open(p).convert('RGBA')
    return sp


MATCH_OK = 5.0  # dưới ngưỡng này coi là cùng một hình (các cặp đúng đo được 0.0-1.6, cặp sai >= 16) [ĐO]


def match_all(items, icons, sprites):
    """Ghép tham lam theo điểm tốt nhất, mỗi sprite chỉ gán cho một món. -> {tên: (sprite, điểm, điểm nhì)}"""
    pairs, wiki = [], {}
    cropped = {k: crop(v) for k, v in sprites.items()}
    for it in items:
        p = icons.get(it['nameEn'])
        if not p:
            continue
        w = crop(Image.open(p))
        wiki[it['nameEn']] = w
        for k, s in cropped.items():
            pairs.append((match_score(s, w), it['nameEn'], k))
    pairs.sort()
    got, used = {}, set()
    for sc, n, k in pairs:
        if n in got or k in used or sc > MATCH_OK:
            continue
        second = min(s2 for s2, nn, kk in pairs if nn == n and kk != k)
        got[n] = (k, sc, second)
        used.add(k)
    return got, wiki


def sheet(path, items, got, wiki, sprites):
    cell, cols = 64, 6
    rows = (len(items) + cols - 1) // cols
    im = Image.new('RGB', (cols * cell * 2, rows * (cell + 12)), (40, 44, 60))
    d = ImageDraw.Draw(im)
    for k, it in enumerate(items):
        x = (k % cols) * cell * 2
        y = (k // cols) * (cell + 12)
        w = wiki.get(it['nameEn'])
        if w is not None:
            ww = w.resize((50, max(1, int(50 * w.height / w.width))), Image.NEAREST)
            im.paste(ww, (x + 4, y + 4), ww)
        g = got.get(it['nameEn'])
        if g:
            s = sprites[g[0]]
            s = s.resize((s.width * 2, s.height * 2), Image.NEAREST)
            im.paste(s, (x + cell + 4, y + 4), s)
        d.text((x + 2, y + cell), '%s %s' % (it['nameEn'][:14], g[0] if g else '-'), fill=(255, 255, 0))
    im.save(path)
    print('sheet', path)


# ---------------------------------------------------------------- trang atlas riêng của Season
UI_DIR = os.path.join(REF, 'all', 'escape_ui_texture')
MAP_DIR = os.path.join(REF, 'all', 'escape_map')
ART_DIR = os.path.join(GAME, 'art', 'season', 'ui')
PAGE_W = 1024


def pack(frames):
    """frames: [(tên, ảnh)] -> (ảnh trang, {tên: [x, y, w, h, ax, ay]}), xếp kệ từ cao xuống thấp."""
    frames = sorted(frames, key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    x = y = shelf = 0
    pos = {}
    for nm, im in frames:
        if x + im.width + 1 > PAGE_W:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[nm] = (x, y)
        x += im.width + 1
        shelf = max(shelf, im.height)
    page = Image.new('RGBA', (PAGE_W, y + shelf + 1), (0, 0, 0, 0))
    table = {}
    for nm, im in frames:
        px, py = pos[nm]
        page.paste(im, (px, py))
        table[nm] = [px, py, im.width, im.height, im.width / 2.0, im.height / 2.0]
    return page, table


def build_page(items_icon_imgs):
    frames = list(items_icon_imgs)
    for fn in sorted(os.listdir(UI_DIR)):
        if fn.endswith('.png'):
            frames.append(('sui/' + fn[:-4], Image.open(os.path.join(UI_DIR, fn)).convert('RGBA')))
    page, table = pack(frames)
    os.makedirs(ART_DIR, exist_ok=True)
    page.save(os.path.join(ART_DIR, 'season-ui.png'), optimize=True)
    # Ảnh bản đồ cho bảng Map: nửa cỡ là đủ nét ở mức phóng mặc định của bảng.
    maps = {}
    for nm, out in (('Init', 'map_base.png'), ('Scene1', 'map_scene1.png')):
        im = Image.open(os.path.join(MAP_DIR, nm + '.png')).convert('RGB')
        im = im.resize((im.width // 2, im.height // 2), Image.BOX)
        im.save(os.path.join(ART_DIR, out), optimize=True)
        maps[nm] = {'src': 'art/season/ui/' + out, 'w': im.width, 'h': im.height, 'scale': 0.5}
    return table, page.size, maps


def vi_line(it):
    """Mô tả ngắn tiếng Việt sinh từ số liệu (bảng wiki chỉ có chữ Anh)."""
    e = it.get('effect') or {}
    t = it['type']
    parts = []
    if e.get('hp'):
        parts.append('Hồi %d máu' % e['hp'])
    if e.get('damage'):
        parts.append('Mất %d máu' % e['damage'])
    if e.get('energy'):
        parts.append('hồi %d năng lượng' % e['energy'])
    if e.get('satiety'):
        parts.append('hồi %d độ no' % e['satiety'])
    if e.get('kg'):
        parts.append('Tải trọng +%d kg' % e['kg'])
    if e.get('speed'):
        parts.append('Tốc độ chạy +%d%%' % e['speed'])
    if e.get('immune'):
        parts.append('Miễn nhiễm %s' % {'poison': 'độc', 'fire': 'lửa', 'ice': 'băng'}.get(e['immune'], e['immune']))
    if parts:
        s = ', '.join(parts)
        return s[0].upper() + s[1:] + '.'
    if t == 'backpack':
        return 'Balô: +%d ô, +%d kg tải trọng.' % (it['slots'], it['kg'])
    if t == 'armor':
        return 'Giáp %d, độ bền %d (mỗi điểm giáp hồi lại tốn 1 độ bền).' % (it['armor'], it['durability'])
    if t == 'valuable':
        return 'Đồ quý: mang về căn cứ bán lấy xu sắt.'
    if t == 'amulet':
        return 'Bùa mang một buff ngẫu nhiên.'
    if t == 'currency':
        return 'Tiền của Monkia: mua bán, nhiệm vụ, nâng cấp.'
    if it['section'] == 'Ingredients':
        return 'Nguyên liệu nấu ăn.'
    if it['section'] == 'Crates':
        return 'Dùng để mở rộng kho.'
    return 'Nguyên liệu chế tạo.'


def main():
    items = parse_items(wikitext())
    items.append({'nameEn': 'Iron Coins', 'section': 'Currency', 'type': 'currency', 'rarity': 'white', 'rarityIdx': 0,
                  'value': 1, 'weight': 0, 'stack': 999999, 'descEn': 'Currency of Monkia.', 'notesEn': []})
    names = [it['nameEn'] for it in items]
    try:
        icons = fetch_icons(names)
    except Exception as e:  # không có mạng: dùng cache đã có
        print('tải icon wiki lỗi (%s); dùng cache' % e)
        icons = {n: os.path.join(ICON_DIR, slug(n) + '.png') for n in names
                 if os.path.exists(os.path.join(ICON_DIR, slug(n) + '.png'))}
    sprites = load_sprites()
    got, wiki = match_all(items, icons, sprites)
    if '--sheet' in sys.argv:
        sheet(sys.argv[sys.argv.index('--sheet') + 1], items, got, wiki, sprites)

    frame_imgs, out, order = [], {}, []
    for it in items:
        n = it['nameEn']
        iid = 'iron_coin' if it['type'] == 'currency' else slug(n)
        g = got.get(n)
        if g:
            src = g[0]
            fr = 'sui/icon_coin' if src == 'icon_coin' else 'sitem/' + src
            if src != 'icon_coin':
                frame_imgs.append((fr, sprites[src]))
            it['iconBy'] = 'pixel: icon wiki %s_Icon.png trùng %s (sai khác %.1f, món kế %.1f)' % (
                n.replace(' ', '_'), src if src == 'icon_coin' else 'escape/' + src, g[1], g[2])
            it['sprite'] = src
        elif n in icons:
            fr = 'sitem/wiki_' + iid
            frame_imgs.append((fr, native(Image.open(icons[n]))))
            it['iconBy'] = 'wiki: không có Item_N nào trùng (bản rip 8.5.1 cũ hơn), dùng icon wiki thu về x1/%d' % WIKI_SCALE
        else:
            fr = None
            it['iconBy'] = 'none'
        it['icon'] = fr
        it['name'] = VI.get(n, n)
        it['desc'] = vi_line(it)
        out[iid] = it
        order.append(iid)
    used = {it.get('sprite') for it in items}
    spare = ['Item_%d' % i for i in range(N_SPRITES) if 'Item_%d' % i not in used]
    for k in spare:  # chìa khoá... chưa có trên wiki: vẫn đưa vào trang để sau này dùng
        frame_imgs.append(('sitem/' + k, sprites[k]))
    table, size, maps = build_page(frame_imgs)
    data = {
        'source': 'wiki Escape_from_Monkia/Items (8.5.x) + sprite escape/Item_N; tools/season/build_items.py',
        'order': order, 'items': out, 'unmapped': spare,
        'atlas': {'src': 'art/season/ui/season-ui.png', 'w': size[0], 'h': size[1], 'f': table},
        'maps': maps,
    }
    js = ('// SINH TỰ ĐỘNG bởi tools/season/build_items.py — không sửa tay.\n'
          'window.SK_SEASON_ITEMS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    io.open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
    bad = [it['nameEn'] for it in items if it['iconBy'] == 'none']
    by = {}
    for it in items:
        by[it['iconBy'].split(':')[0]] = by.get(it['iconBy'].split(':')[0], 0) + 1
    print('items', len(out), 'icon by', by, 'no icon', bad, 'spare sprites', spare)
    print('page', size, 'frames', len(table), '->', OUT_JS)


if __name__ == '__main__':
    main()
