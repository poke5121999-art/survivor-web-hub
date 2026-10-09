# -*- coding: utf-8 -*-
"""Bảng vật phẩm sảnh + bảng rơi -> data/sk-items.js + art/items/items0.png.

Chạy (từ gốc repo): ~/sk86-ref/venv/bin/python games/soulknight/tools/items/build_items.py

Nguồn: ~/sk86-ref/decoded/config/items.json (Key/Type/DataStr: ItemLevel, Icon.sprite), enemies.json (Drops, DropGroups),
localization_en_vi.json (tên Việt chính thức). Icon: sprite theo tên trong bundle common/sprite_atlas/weapon/levelobjects.

Hình ra: window.SK_ITEMS = {v, sheet, items: {key: {vi, en, t, level, icon?: [x,y,w,h,ax,ay]}}, drops: {enemyId: [[key, p, g?], ...]}}
  t: mat (vật liệu) | seed (hạt giống) | token (vé đổi) | bp (bản vẽ); p: phần trăm (có thể > 100: 1 chắc chắn + (p-100)% thêm).
  g: nhóm loại trừ (DropGroups): các mục cùng g chỉ rơi một món trong lần tung; p đã nhân xác suất nhóm.
Bỏ: mục rơi có `conditions` (14 mục: vật liệu kỹ năng cần bản vẽ/số mảnh) vì nghĩa điều kiện chưa đo được.
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
import skrip  # noqa: E402
from PIL import Image  # noqa: E402

CFG = os.path.join(skrip.REF, 'decoded', 'config')
LOC = os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json')
OUT_PNG = os.path.join(GAME, 'art', 'items', 'items0.png')
OUT_JS = os.path.join(GAME, 'data', 'sk-items.js')
BUNDLES = ['common', 'sprite_atlas', 'weapon', 'levelobjects']
SHEET_W = 256


def jl(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    items, enemies, loc = jl(os.path.join(CFG, 'items.json')), jl(os.path.join(CFG, 'enemies.json')), jl(LOC)
    vi = lambda k: (loc.get(k) or [None, None])[1]
    en = lambda k: (loc.get(k) or [None, None])[0]
    W_SEED, W_BP, W_TOKEN, W_SKINF = vi('items/seed'), vi('items/blueprint'), vi('mall/itemtype_token'), vi('item/skin_fragment')
    E_SEED, E_BP, E_TOKEN, E_SKINF = en('items/seed'), en('items/blueprint'), en('mall/itemtype_token'), en('item/skin_fragment')

    # ---- bảng rơi
    drops, used = {}, set()
    for eid, e in enemies.items():
        rows = []
        for d in e.get('Drops') or []:
            if d['conditions']:
                continue
            k = d['item']['item']
            rows.append([k, round(d['probability'], 4)])
            used.add(k)
        for gi, g in enumerate(e.get('DropGroups') or []):
            for d in g['Drops']:
                if d['conditions']:
                    continue
                k = d['item']['item']
                rows.append([k, round(d['probability'] * g['probability'] / 100.0, 4), gi + 1])
                used.add(k)
        if rows:
            drops[eid] = rows
    # Chắc chắn rơi (guaranteeDrop, 2 mục): p giữ nguyên, số lượng chắc chắn = guaranteeDropCount ở trùm đó [ƯỚC LƯỢNG: 1 viên + p%].
    keys = set(used)
    for k, v in items.items():
        if v['Type'] in ('Seed', 'TokenTicket'):
            keys.add(k)

    def name_of(k, t, d):
        v, e = vi(k), en(k)
        if v:
            return v, e or k
        if t == 'seed':
            base = k[:-5] if k.endswith('_seed') else k
            return (W_SEED + ' ' + vi(base) if vi(base) else W_SEED + ' ' + base), ((E_SEED + ' ' + en(base)) if en(base) else k)
        if t == 'bp':
            m = re.match(r'blueprint_(weapon_\d+)$', k)
            if m and vi('weapon/' + m.group(1)):
                return W_BP + ' ' + vi('weapon/' + m.group(1)), E_BP + ' ' + (en('weapon/' + m.group(1)) or '')
            m = re.match(r'blueprint_(m_mech_\d+)$', k)
            if m and vi(m.group(1)):
                return W_BP + ' ' + vi(m.group(1)), E_BP + ' ' + (en(m.group(1)) or '')
            return W_BP + ' ' + k[10:], k   # [ƯỚC LƯỢNG] không có tên chính thức
        if t == 'token':
            m = re.match(r'token_(\w+?)_none_(\d+)$', k)
            kind = {'weapon': 'Vũ Khí', 'seed': W_SEED, 'blueprint': W_BP, 'skin': 'Skin', 'equipment': 'Phụ Kiện', 'none': ''}.get(m.group(1) if m else '', '')
            return (W_TOKEN + ' ' + kind + (' hạng ' + str(d['ItemLevel']) if m else '')).replace('  ', ' ').strip(), k   # [ƯỚC LƯỢNG] ghép từ LOC
        if 'skin_fragment' in k:
            return W_SKINF + ' ' + k.replace('material_skin_fragment_', ''), E_SKINF + ' ' + k   # [ƯỚC LƯỢNG]
        return k, k

    TYPE = {'Material': 'mat', 'Seed': 'seed', 'BluePrint': 'bp', 'TokenTicket': 'token'}
    out, icons = {}, {}
    for k in sorted(keys):
        it = items.get(k)
        if not it:
            continue
        d = json.loads(it['DataStr'])
        t = TYPE.get(it['Type'], 'mat')
        v, e = name_of(k, t, d)
        out[k] = {'vi': v, 'en': e, 't': t, 'level': d.get('ItemLevel', 0)}
        sp = (d.get('Icon') or {}).get('sprite')
        if sp:
            icons[k] = sp

    # ---- icon
    want = set(icons.values())
    rip, found = skrip.Rip(), {}
    for b in BUNDLES:   # nạp hết trước: texture của sprite nằm ở bundle khác (sprite_atlas)
        rip.load(b + '.ab')
    for b in BUNDLES:
        for cab, o in rip.objects([b], types=('Sprite',)):
            try:
                nm = rip.tree(cab, o)['m_Name']
            except Exception:
                continue
            if nm in want and nm not in found:
                r = rip.sprite(cab, o)
                if r:
                    found[nm] = r
    # xếp kệ
    x = y = rowh = 0
    sheet = Image.new('RGBA', (SHEET_W, 1024), (0, 0, 0, 0))
    place = {}
    for nm, (_, img, ax, ay, ppu) in sorted(found.items(), key=lambda kv: -kv[1][1].height):
        w, h = img.size
        if x + w + 1 > SHEET_W:
            x, y, rowh = 0, y + rowh + 1, 0
        sheet.paste(img, (x, y))
        place[nm] = [x, y, w, h, round(ax, 2), round(ay, 2)]
        x += w + 1
        rowh = max(rowh, h)
    sheet = sheet.crop((0, 0, SHEET_W, y + rowh + 1))
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)
    for k, sp in icons.items():
        if sp in place:
            out[k]['icon'] = place[sp]
    miss = sorted(k for k in out if 'icon' not in out[k])
    # chỉ giữ mục rơi có trong bảng
    drops = {e: [r for r in rows if r[0] in out] for e, rows in drops.items()}
    drops = {e: r for e, r in drops.items() if r}
    data = {'v': 1, 'sheet': 'art/items/items0.png', 'items': out, 'drops': drops}
    with io.open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/items/build_items.py từ Soul Knight 8.6 — không sửa tay.\n')
        f.write('window.SK_ITEMS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('vật phẩm', len(out), '· có icon', len(out) - len(miss), '· kẻ rơi', len(drops), '· sheet', sheet.size)
    print('thiếu icon:', miss)


if __name__ == '__main__':
    main()
