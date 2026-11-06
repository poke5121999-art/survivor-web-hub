#!/usr/bin/env python3
"""Xuất art cho Khu Giải Trí (js/sim/events.js, js/ui/events.js) từ APK Zing Speed Mobile.

Chạy:  ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_events.py

Ra (art/events/):
  coin_small.glb, coin_big.glb  mô hình props_item_goldcoin (kiểu Tranh Vàng; Vàng Lớn tính nhiều điểm hơn).
  eliminate/cops/clock.png      icon cắt từ atlas ui/gamemode: Icon_BtnFall (đua loại), Icon_BlueOther (cảnh sát), Icon_Clock (đua giới hạn).
                                Không có icon riêng cho Săn Xu: dùng art/ui/coin.png.
Không có trong APK: bản đồ riêng của từng chế độ (luật chạy trên đường đua thường) và icon Săn Xu; nguồn tên/luật nêu ở TD.Events.DEFS[*].src.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_items as I  # noqa: E402  export_glb, OUT, log

OUT = os.path.join(I.GAME, 'art', 'events')
GLBS = [
    ('coin_small', 'props_item_goldcoin/props_item_goldcoin_small.prefab'),
    ('coin_big', 'props_item_goldcoin/props_item_goldcoin_big.prefab'),
]
ATLAS = 'ui/gamemode/#blackcatsheriff/artwork/atlas/{0}/{0}.prefab'
ICONS = [
    ('eliminate', None, 'Icon_BtnFall', 'ui/race/#elimination/artwork/atlas/ig_elimination_ui3/ig_elimination_ui3.prefab'),   # Tag_Eliminate có chữ Hán nên không dùng
    ('cops', 'ig_blackcatsheriff_ui3', 'Icon_BlueOther'),   # avatar đội xanh đội mũ cảnh sát; Icon_PoliceCap / Icon_Handcuffs trong atlas là sprite rỗng (alpha 0)
    ('clock', 'ig_blackcatsheriff_ui3', 'Icon_Clock'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    I.OUT = OUT
    for name, suffix in GLBS:
        I.export_glb(name, suffix, None, 256)
    # export_fx_ui nạp sau cùng: import nó trước làm UnityPy không parse được Mesh (UnknownObject).
    import export_fx_ui as E
    cat = E.atlas_catalog()
    for ic in ICONS:
        fn, atlas, sp = ic[0], ic[1], ic[2]
        path = ic[3] if len(ic) > 3 else ATLAS.format(atlas)
        key = next(k for k in cat if k.endswith(path))
        sprites = {s[0]: s for s in cat[key]['sprites']}
        if sp not in sprites:
            I.log('  thiếu sprite', sp)
            continue
        _, x, y, w, h = sprites[sp][:5]
        E.atlas_image(key).crop((x, y, x + w, y + h)).save(os.path.join(OUT, fn + '.png'), optimize=True)
        I.log('  %-12s %dx%d' % (fn, w, h))


if __name__ == '__main__':
    main()
