#!/usr/bin/env python3
"""Regenerate art/ and data/art.json from the original Dragon Storm APK extraction.

usage: python3 -I tools/export.py <assets dir of the extracted base APK> <game dir>
  e.g. python3 -I tools/export.py ~/dragon-storm-ref/base/assets ~/dragon-storm-work/games/dragon-storm

Only original files are copied, byte for byte. The original names carry a size in parentheses,
"armor_cha_01_01(128x128).png"; that is the frame (or display) size, not the image size, so each
entry below states its frame grid explicitly (measured from the sheets, see STATUS).
"""
import json
import os
import re
import shutil
import sys

from PIL import Image

# key: (source file, frame w, frame h, frame count)  - frame w/h None = single image
IMAGES = {
    # title
    'bg_title': ('bg_dstitle.png', None, None, 1),
    'logo': ('logo(380x256).png', 380, 256, 2),  # 0 = logo, 1 = glow
    # stage backgrounds (stored at half resolution, shown at 480x460) and the control-pad rock wall
    'bg_d_16': ('bg_d_16(480x460).jpg', None, None, 1),  # stage 1 village gate (matches clip c2 0:110)
    'bg_d_01': ('bg_d_01(480x460).jpg', None, None, 1),  # stage 2 grassland (matches clip c1 2:21)
    'bg_t_01': ('bg_t_01(480x424).png', None, None, 1),  # rock wall behind the touch pad
    'bg_top': ('bg_top(480x180).png', None, None, 1),  # top wood bar, 128-wide tile with a fade
    'bg_bottom': ('bg_bottom(480x140).png', None, None, 1),  # bottom wood bar, 128-wide tile
    # knight hero: body sheet armor_cha_01_<tier> + weapon sheet sword_cha_01_<tier> (added below for every tier)
    # monsters: 2 columns; 0-3 walk, 4 severed head, 5 headless body, 6-9 attack
    'm_goblin_swordman': ('M_goblin_swordman_01(110x74).png', 110, 74, 10),
    'm_wolf': ('M_wolf_01(110x85).png', 110, 85, 10),
    'gauge_monster': ('gauge_monster(44x6).png', 44, 6, 2),  # 0 = back, 1 = red fill
    # HUD
    'board_target': ('in_board_target(186x102).png', None, None, 1),  # book + coin counters (top right)
    'board_score': ('in_board_score(282x86).png', None, None, 1),  # SCORE board with 3 star marks (bottom right)
    'gauge_score': ('gauge_score(256x12).png', None, None, 1),
    'star_small': ('icon_star_small(46x24).png', 46, 24, 3),  # lit 1/2/3-star marks
    'board_hp': ('in_board_hp(96x22).png', None, None, 1),
    'gauge_hp': ('gauge_hp(80x6).png', None, None, 1),
    'btn_left': ('btn_left(140x200).png', None, None, 1),
    'btn_right': ('btn_right(140x200).png', None, None, 1),
    'btn_ring': ('btn_skill(128x128).png', None, None, 1),  # round socket of the red / blue buttons
    'icon_skill': ('icon_skill(64x64).png', 64, 64, 6),  # 0 = red slash button face
    'icon_skill_all': ('icon_skill_all(64x64).png', 64, 64, 2),  # 0 = blue skill button face
    'item_slot': ('btn_item_bg(112x102).png', 112, 102, 2),  # 0 = top-left corner slot, 1 = top-right
    'icons': ('icon_main_menu(64x64).png', 64, 64, 64),  # 42 winged shield, 55 potion, 46 book, 31 coin
    'icon_bag': ('icon_bag(32x32).png', 32, 32, 3),  # 1 coin, 2 book
    'btn_option': ('btn_option(50x50).png', 50, 50, 10),  # 8 = pause
    'btn_r': ('btn_r(214x64).png', None, None, 1),
    'btn_long': ('btn_long(474x60).png', None, None, 1),
    'no_score': ('no_score(26x36).png', 26, 36, 10),
    'no_combo': ('no_combo(24x32).png', 24, 32, 10),
    'no_r': ('no_r(16x20).png', 16, 20, 10),  # white damage digits
    'eff_combo': ('in_eff_combo(70x24).png', None, None, 1),
    'eff_critical': ('in_eff_perfect(170x54).png', None, None, 1),
    'text_round': ('text_round(220x48).png', 220, 48, 4),  # READY, ROUND 2, ROUND 3, FIGHT
    'text_result': ('in_text_result(340x60).png', 340, 60, 3),  # STAGE CLEAR, YOU FAILED!, FINISH
    'popup_result': ('popup_00_result(480x512).png', None, None, 1),
    'result_star': ('in_result_star(75x75).png', 75, 75, 2),  # 0 grey, 1 gold
    # effects (black background -> drawn additive)
    'eff_hit': ('in_eff_hit(128x128).png', 64, 64, 12),
    'eff_die': ('in_eff_die(128x128).png', 64, 64, 12),
    'eff_pang': ('in_eff_pang(128x128).png', 64, 64, 13),
}

# Knight upgrade tiers. The suffix is the upgrade tier (01 bare starter with a wooden sword ... 06 full plate +
# metal sword ... 20/30/40/50 colour variants); every tier file is a 4x4 sheet of 128x128 animation frames:
# 0-5 idle, 6-9 slash, 10 dash, 11 down. armor_cha_02..07 are other classes and are not exported.
KNIGHT_TIERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '20', '30', '40', '50']
for _t in KNIGHT_TIERS:
    IMAGES[f'hero_armor_{_t}'] = (f'armor_cha_01_{_t}(128x128).png', 128, 128, 12)
    IMAGES[f'hero_sword_{_t}'] = (f'sword_cha_01_{_t}(128x128).png', 128, 128, 12)

AUDIO = {
    'bgm_title': 'BG_TITLE.mp3',
    'bgm_stage': 'S_BG_D00.mp3',
    'result_win': 'S_RESULT01.mp3',
    'result_fail': 'S_RESULT_FAIL.mp3',
    'sword_hit': 'S_woodsword_hit.wav',
    'sword_miss': 'S_woodsword_miss.wav',
    'sword_kill': 'S_woodsword_kill.wav',
    'wolf_attack': 'S_WOLF_ATTACK.wav',
    'goblin_attack': 'swing.wav',
    'hero_die': 'herodie.wav',
    'skill': 'S_START_SWORD_STORM.wav',
    'start': 'S_LANDING.wav',
    'coin': 'S_GET_GOLD.wav',
    'potion': 'S_POTION.wav',
}


def main(src, game):
    art = os.path.join(game, 'art')
    snd = os.path.join(art, 'sfx')
    os.makedirs(snd, exist_ok=True)
    out = {'images': {}, 'audio': {}}
    for key, (name, fw, fh, n) in IMAGES.items():
        p = os.path.join(src, name)
        ext = os.path.splitext(name)[1]
        dst = f'{key}{ext}'
        shutil.copyfile(p, os.path.join(art, dst))
        w, h = Image.open(p).size
        e = {'file': f'art/{dst}', 'w': w, 'h': h, 'src': name}
        m = re.search(r'\((\d+)x(\d+)\)', name)
        if m and not fw:
            # display size in the original layout; full-screen backgrounds are stored at half resolution
            e.update(dw=int(m[1]), dh=int(m[2]))
        if fw:
            cols = w // fw
            if cols == 0 or (n + cols - 1) // cols * fh > h:
                raise SystemExit(f'{name}: {n} frames of {fw}x{fh} do not fit in {w}x{h}')
            e.update(fw=fw, fh=fh, cols=cols, frames=n)
        out['images'][key] = e
    for key, name in AUDIO.items():
        shutil.copyfile(os.path.join(src, name), os.path.join(snd, name))
        out['audio'][key] = {'file': f'art/sfx/{name}', 'src': name}
    os.makedirs(os.path.join(game, 'data'), exist_ok=True)
    with open(os.path.join(game, 'data', 'art.json'), 'w') as f:
        json.dump(out, f, indent=1)
        f.write('\n')
    print(f"{len(out['images'])} images, {len(out['audio'])} sounds -> {art}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]))
