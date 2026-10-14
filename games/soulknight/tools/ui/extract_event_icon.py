# -*- coding: utf-8 -*-
"""Cắt biểu tượng "!!" của nút bắn khi đứng cạnh vật tương tác -> art/ui/event_normal.png.

Chạy: PYTHONIOENCODING=utf-8 python tools/ui/extract_event_icon.py   (từ games/soulknight)

[ĐO] UICanvas.get_ButtonEventImageNormal = SpriteMap.commonSprite.GetSprite("event_normal"); UICanvas.SwitchAtkBtn(is_atk)
đổi ảnh của control/btn_atk/Image giữa ButtonAtkImageNormal (ui_joy_1, tâm ngắm) và ảnh này. SpriteMap là Odin
SerializedScriptableObject nên khoá "event_normal" không đọc được qua cây UnityPy; sprite ứng viên là ui_joy_6
(160x140, ppu 128) trong sprite_atlas.ab/ui.ab, đối chiếu bằng mắt với ảnh chụp 8.6 (dấu "!!" trắng viền sáng). ui_joy_6 không
nằm trong trang ui0.png (prefab không dùng) nên cắt riêng ra tệp này thay vì xếp lại cả trang.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
import skrip  # noqa: E402

rip = skrip.Rip(bundles=['common', 'ui', 'sprite_atlas'])
for cab, o in rip.objects(['common', 'ui', 'sprite_atlas'], ('Sprite',)):
    if rip.tree(cab, o)['m_Name'] == 'ui_joy_6':
        name, img, ax, ay, ppu = rip.sprite(cab, o)
        out = os.path.join(GAME, 'art', 'ui', 'event_normal.png')
        img.save(out, optimize=True)
        print(name, img.size, ppu, '->', out)
        break
else:
    raise SystemExit('sprite ui_joy_6 not found')
