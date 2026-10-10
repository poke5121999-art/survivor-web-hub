# -*- coding: utf-8 -*-
"""154 thành tựu -> data/sk-ach.js + art/ach/ach.png (icon riêng, không đụng atlas chung / sk-data.js).

Chạy (từ gốc repo): ~/sk86-ref/venv/bin/python games/soulknight/tools/achievements/build_ach.py
Nguồn: ~/sk86-ref/decoded/config/achievements.json (DataStr JSON), localization_en_vi.json (ac/name_N, ac/desc_N),
Sprite achievement_* trong bundle sprite_atlas / common (cắt bằng tools/skrip.Rip.sprite).

Hình ra: window.SK_ACH = {v, cell, sheet, list:[{id, vi, en, desc, descEn, hide, type, target, str, hero, items?, awards, icon:[x,y]}]}
  type    achievementType của bản gốc (UnlockConditionList[0]); target = targetInt; str = targetStr; hero = targetHero (-1: mọi nhân vật,
          còn lại = chỉ số hero trong D.heroes[id].s0.index); items (chỉ id 47, loại 16) = danh sách targetStr của 30 điều kiện.
  awards  [{k, n}] vật phẩm kho (awardType 0, k = khoá SK_ITEMS hoặc material_gem = đá quý); [{t:'token', k:'token_weapon_weapon_347_3', n}]
          vé theo extraInfo (awardType 1); {t:'skin', hero, skin} (2); {t:'weapon', w:'weapon_094'} (3); {t:'pet', p:'pet_Owl'} (4).
  pets    {petId: id thành tựu} ghép thú cưng mở bằng thành tựu (data/sk-pets.js unlock.kind == 'achievement').

Bảng achievementType -> ý nghĩa (suy từ mô tả LOC của các mục cùng loại; "web" = js/ach.js tính được từ sự kiện ván / hồ sơ):
   0  mục đặc biệt theo targetStr (boss12 dùng vũ khí nước, eagle_lover gom vũ khí Chim Ưng, AdvToturial, Bug...)  - khoá
   1  tổng quái hạ (100/1000/10000)                                                                              - web
   2  số lần vượt ải (mọi lần vượt Chế độ Ải)                                                                     - web
   3  vượt Chế độ Ải-Thường; 4 vượt Ải-Lợi Hại                                                                    - web
   5  nhiệm vụ treo thưởng hoàn thành 1/10/100                                                                    - khoá (web chưa có treo thưởng)
   6  cắm 20/60 mũi tên lên một quái; 7 nhận 800 vàng trong một lần; 8 hạ 20 Thủ Lĩnh bằng một đòn
   10 dùng kỹ năng của nhân vật targetHero 233 lần                                                                - web
   11 hạ 40 quái bằng Rương Thuốc Nổ; 13 nhận vũ khí weapon_223 (nón xanh)                                         - web (13)
   14 đứng trước tivi 5 phút (sảnh)                                                                               - web
   16 hạ targetInt quái loại targetStr (30 dòng của id 47: mọi quái Tử Linh x1000)                                - web
   17-20 hạ 500 quái loại targetStr để mở thú cưỡi                                                                - web (tiến độ), thú cưỡi do js/mounts.js
   21/22 vượt Ải-Thường trong 20 phút / Ải-Lợi Hại trong 23 phút                                                  - web
   24-26,35 thí luyện nhân vật (đỡ 1000 đòn / thắng Thủ Lĩnh dưới 90 s / không mất HP / không chết) lấy skin       - khoá
   27/28 vượt Ải không vũ khí; 29-32 vượt Khu Thí Luyện (Thường/Lợi Hại, nhanh 10/15 phút)                      - 29,30 web (31,32 web: có giờ)
   33,36-38,40-47... chế độ nối máy, Thần Điện Thủ Hộ (36), hồ dâng hiến, câu đố, ải ẩn, Hư Không              - khoá (web chưa có)
   49 có tổng cộng 20 thiên phú khác nhau; 50 vượt Ải với 30 Nhân Tố Thử Thách khác nhau                           - web
   54/55 câu cá / vớt rác; 56-60 Thần Điện; 61 diệt Lãnh Chúa tàng hình                                          - khoá
   62 độ thân mật tối đa với 1 pet; 63 mèo; 64 chó; 65 10 pet                                                     - web (62, 65)
   66.. tuần, sự kiện, emoji, Mê Trận (71-73), Khu Thí Luyện không mất máu (78/79), Hư Không (123-129...)          - khoá trừ ghi rõ
   82 mở 8 vũ khí thần thoại (đếm vũ khí thần thoại đã nhặt)                                                      - web
   83 vào ải 4; 90 mua trong tiệm 30 lần; 96 vào phòng kế trong 2,5 giây x5 trong một ván                        - web
   102 dùng Máy Quay Trứng 40 lần; 117 trồng 5 loại cây; 121 rèn 50 vũ khí; 122 vượt Ải-Lợi Hại không dùng kỹ năng - web
   53 mở nhân vật targetHero                                                                                      - web
(Danh sách loại chạy được thật nằm ở js/ach.js, bảng IMPL; loại ngoài đó hiện nhưng khoá, liệt kê trong GAPS.md.)
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
REF = os.path.expanduser('~/sk86-ref')
OUT_JS = os.path.join(GAME, 'data', 'sk-ach.js')
OUT_PNG = os.path.join(GAME, 'art', 'ach', 'ach.png')
CELL = 36
COLS = 14

# Thú cưng mở bằng thành tựu -> id thành tựu (ghép theo tên LOC / đối tượng thưởng; xem data/sk-pets.js unlock.kind == 'achievement').
PETS = {'pet36': 106, 'pet28': 86, 'pet13': 37, 'pet11': 38}


def clean(s):
    s = re.sub(r'<[^>]+>', '', s or '').replace('\r', '').strip()
    return s


def icons(names):
    import skrip
    from PIL import Image
    rip = skrip.Rip(bundles=[])
    found = {}
    for pat in ('sprite_atlas', 'common', 'ui', 'title'):
        for cab, o in rip.objects([pat], types=['Sprite']):
            t = rip.tree(cab, o)
            n = t['m_Name']
            if n in names and n not in found:
                r = rip.sprite(cab, o)
                if r:
                    found[n] = r[1]
    order = sorted(found)
    rows = (len(order) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL, max(1, rows) * CELL), (0, 0, 0, 0))
    pos = {}
    for i, n in enumerate(order):
        im = found[n]
        x, y = (i % COLS) * CELL, (i // COLS) * CELL
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
        pos[n] = [x, y]
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)
    return pos


def main():
    cfg = json.load(io.open(os.path.join(REF, 'decoded', 'config', 'achievements.json'), encoding='utf-8'))
    loc = json.load(io.open(os.path.join(REF, 'decoded', 'localization_en_vi.json'), encoding='utf-8'))
    rows = []
    for key, v in cfg.items():
        d = json.loads(v['DataStr'])
        rows.append(d)
    rows.sort(key=lambda d: d['Id'])
    pos = icons({d['Icon']['sprite'] for d in rows})
    out = []
    gems = 0
    for d in rows:
        c = d['UnlockConditionList'][0]
        en, vi = (loc.get(d['NameKey']) or ['', ''])[:2]
        de, dv = (loc.get(d['DescKey']) or ['', ''])[:2]
        tgt = c['targetInt']
        fill = lambda s: re.sub(r'\{\d\}', str(tgt), clean(s))
        aw = []
        for w in d['AwardList']:
            t, item = w['awardType'], ((w.get('itemData') or {}).get('item') or '')
            if t == 0 and item:
                aw.append({'k': item, 'n': w['num']})
                if item == 'material_gem':
                    gems += w['num']
            elif t == 1:
                k = item or w.get('extraInfo') or ''
                aw.append({'t': 'token', 'k': k, 'n': w['num']})
            elif t == 2:
                aw.append({'t': 'skin', 'hero': w['hero'], 'skin': w['skinIndex']})
            elif t == 3:
                aw.append({'t': 'weapon', 'w': re.sub(r'.*/|\.prefab$', '', (w.get('objectData') or {}).get('gameObject', '')).replace('.prefab', '')})
            elif t == 4:
                aw.append({'t': 'pet', 'p': re.sub(r'.*/|\.prefab$', '', (w.get('objectData') or {}).get('gameObject', '')).replace('.prefab', '')})
        row = {'id': d['Id'], 'vi': clean(vi) or clean(en), 'en': clean(en), 'desc': fill(dv) or fill(de), 'descEn': fill(de),
               'hide': 1 if d['IsHide'] else 0, 'type': c['achievementType'], 'target': tgt, 'str': c['targetStr'],
               'hero': c['targetHero'], 'awards': aw, 'icon': pos.get(d['Icon']['sprite'], [0, 0])}
        if len(d['UnlockConditionList']) > 1:
            row['items'] = [u['targetStr'] for u in d['UnlockConditionList']]
        out.append(row)
    assert len(out) == 154, len(out)
    data = {'v': 1, 'cell': CELL, 'sheet': 'art/ach/ach.png', 'gems': gems, 'pets': PETS, 'list': out}
    with io.open(OUT_JS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/achievements/build_ach.py từ Soul Knight 8.6 — không sửa tay.\n')
        f.write('window.SK_ACH = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('thanh tuu', len(out), 'da thuong', gems, 'icon', len(pos), 'thieu icon', [d['Icon']['sprite'] for d in rows if d['Icon']['sprite'] not in pos])


if __name__ == '__main__':
    main()
