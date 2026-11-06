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
    'm_goblin_archer': ('M_goblin_archer_01(110x74).png', 110, 74, 10),  # 6-9 = draw and shoot
    'm_goblin_flag': ('M_goblin_flag_01(110x74).png', 110, 74, 10),
    'm_goblin_shaman': ('M_goblin_shaman_01(110x85).png', 110, 85, 12),  # Shamanking (stage 5 boss), 10-11 cast
    'm_archer_arrow': ('M_archer_arrow(56x16).png', None, None, 1),
    # Drop 6: stages 6-15 monsters (Scene_Stage::Init_Image texture switch, meta/re_notes/monsters_6_15.md); 2-column
    # grids: 0-3 walk, 4 head, 5 dead, 6-8 attack, 9 hurt (10-12 bone pile on the skeleton sheets)
    'm_grimlock_warrior': ('M_grimlock_warrior_01(124x85).png', 124, 85, 12),
    'm_grimlock_spear': ('M_grimlock_spear_01(124x85).png', 124, 85, 12),
    'm_ogre': ('M_ogre_01(180x94).png', 180, 94, 10),
    'm_mandrake': ('M_mandrake_01(180x94).png', 180, 94, 10),
    'm_mandrake_arrow': ('M_mandrake_arrow(147x98).png', 147, 98, 6),
    'm_darktree': ('M_darktree_01(435x271).png', None, None, 1),
    'm_darktree_arm': ('M_darktree_01_arrow(256x100).png', None, None, 1),
    'm_bat_01': ('M_bat_01(90x54).png', 90, 54, 10),
    'm_bat_02': ('M_bat_02(90x54).png', 90, 54, 10),
    'm_skell_warrior': ('M_skell_warrior_01(110x74).png', 110, 74, 14),
    'm_skell_archer': ('M_skell_archer_01(110x74).png', 110, 74, 14),
    'm_mummy': ('M_mummy(128x94).png', 128, 94, 10),
    'm_mummy_arrow': ('M_mummy_arrow(41x41).png', 41, 41, 2),
    'm_lich': ('M_lich(124x85).png', 124, 85, 12),
    'eff_dark': ('eff_dark(480x800).png', None, None, 1),  # ink blob hit (FUC_HIT_BY_MONSTER @0x5ba000)
    'bg_d_09': ('bg_d_09(480x460).jpg', None, None, 1),
    'bg_d_12': ('bg_d_12(480x460).jpg', None, None, 1),
    'bg_d_13': ('bg_d_13(480x460).jpg', None, None, 1),
    'bg_d_17': ('bg_d_17(480x460).jpg', None, None, 1),
    'bg_d_18': ('bg_d_18(480x460).jpg', None, None, 1),
    'bg_d_19': ('bg_d_19(480x460).jpg', None, None, 1),
    'bg_t_02': ('bg_t_02(480x424).png', None, None, 1),
    'bg_t_05': ('bg_t_05(480x424).png', None, None, 1),
    'bg_t_08': ('bg_t_08(480x424).png', None, None, 1),
    'map_00_02': ('map_00_02(480x1024).jpg', None, None, 1),
    # stage 3-5 (Scene_UI::FUC_SET_BACKGROUD_IMAGE @0x5f6560) and stage 1's real pad
    'bg_d_02': ('bg_d_02(480x460).jpg', None, None, 1),
    'bg_t_07': ('bg_t_07(480x424).png', None, None, 1),
    # boss HP bar under the stage title, boss-wave alert, wolf warning (Scene_UI::EFF_MARK_ALERT)
    'board_hp_boss': ('in_board_hp_boss(366x22).png', None, None, 1),
    'gauge_hp_boss': ('gauge_hp_boss(350x6).png', None, None, 1),
    'eff_alert': ('in_eff_alert(100x100).png', None, None, 1),
    'eff_warning_wolf': ('in_eff_warning_wolf(64x64).png', None, None, 1),
    'eff_warning': ('in_eff_warning(32x32).png', None, None, 1),
    'gauge_monster': ('gauge_monster(44x6).png', 44, 6, 2),  # 0 = back, 1 = red fill
    # world-map stage-5 slot: the reward chest over a spinning light (Scene_WorldMap::FUC_SET_REWARD_CHEST_POSITION)
    'eff_flash01': ('Eff_Flash_01(512x512).png', None, None, 1),
    'icon_clear_bonus': ('icon_clear_bonus(64x64).png', None, None, 1),
    # CLEAR BONUS picker on the map: closed / glowing / open chest (2x2 sheet), the bobbing arrow, blue rays on open
    'eff_itembox': ('eff_itembox.png', 256, 256, 4),
    'icon_select': ('icon_select(64x64).png', None, None, 1),
    'eff_flash03': ('Eff_Flash_03(512x512).png', None, None, 1),
    'icon_reward': ('icon_reward(128x128).png', 128, 128, 7),  # 1 gold sack, 2 jewel sack
    # Sword Storm sword (SCH_CREATE_STORM_SWORD @0x58c2cc, rect 35x58)
    'storm_sword': ('bullert_sword(35x58).png', None, None, 1),
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
    # world map (Scene_WorldMap): parchment page, numbered stage buttons, stars, chapter icon, tabs
    'map_00_01': ('map_00_01(480x1024).jpg', None, None, 1),
    'btn_stage': ('btn_stage_00(72x72).png', 73, 73, 56),  # frame k = stage k (0 = blank orb); every 5th is red
    'star_map': ('icon_star_map(70x30).png', 70, 30, 3),  # 1 / 2 / 3 stars under a cleared stage
    'chapter_tab': ('chapter_tab(80x64).png', 80, 64, 10),  # 0 = chapter 1 dragon (active)
    'icon_mode': ('icon_mode(64x32).png', 64, 32, 3),  # 1 / 2 / 3 skulls (NORMAL / HARD / HELL); 0 = top-bar skull
    'lock_tab': ('lock_bg_btn_r(96x74).png', None, None, 1),  # locked tab / slot with padlock
    # stage prep panel (part of Scene_WorldMap: Call_Back_Upgrade_Weapon / _Armor / Call_Back_Game_Start)
    'popup_prep': ('popup_00(480x512).png', None, None, 1),
    'bg_upgrade': ('bg_upgrade(448x228).png', None, None, 1),  # stage preview window + gold / gem bars
    'btn_upgrade': ('btn_upgrade(128x128).png', None, None, 1),  # red upgrade card with coin price bar
    'icon_sword': ('sword_cha_01(64x64).png', 64, 64, 14),  # card icon, frame = level + 1 (the level bought)
    'icon_armor': ('armor_cha_01(64x64).png', 64, 64, 14),
    'lock_items': ('lock_bg_booster(450x184).png', None, None, 1),  # item row, locked (91% black: the row shows through)
    'item_row': ('item_slot(450x90).png', None, None, 1),  # 5 booster slots under the lock
    'booster_red': ('btn_booster(88x86).png', None, None, 1),  # ABILITY tile / BUY tile
    'booster_select': ('btn_booster_select(90x88).png', None, None, 1),  # yellow frame of the selected booster
    'btn_mode': ('btn_mode(76x60).png', 76, 60, 4),  # NORMAL / HARD / HELL toggles, 3 = locked
    'icon_check': ('icon_check(32x32).png', None, None, 1),  # red tick on the selected mode
    'btn_menu': ('btn_menu(120x64).png', None, None, 1),  # red button with the yellow arrow (START)
    'btn_more': ('btn_more(64x42).png', None, None, 1),  # "+" next to gold / gems
    'btn_r180': ('btn_r(180x50).png', None, None, 1),  # CHARACTER
    'btn_long': ('btn_long(474x60).png', None, None, 1),
    # shop (Scene_Shop): frame only, products come from the store at runtime in the original
    'shop_bg': ('shop_bg(480x800).png', None, None, 1),
    'list_shop': ('bg_list_shop(444x68).png', None, None, 1),
    'board_money': ('board_money(222x52).png', 222, 52, 2),  # 0 = gold bar, 1 = gem bar
    'icon_gem': ('icon_gem(50x50).png', 50, 50, 3),
    # Drop 5: map shop / upgrade buttons, daily free gem, FTUE (Scene_UI / Scene_WorldMap FUC_TUTO*), ITEM tab (Scene_Bag)
    'btn_shop': ('btn_shop(110x74).png', 110, 74, 2),  # 0 = lit wood plate, 1 = dark
    'btn_free': ('btn_free.png', None, None, 1),  # "Ad FREE!" (daily gem)
    'tuto_bg_01': ('tuto_bg_01(480x800).png', None, None, 1),  # spotlight on stage 1 (hole centre 174,546 r80)
    'tuto_bg_03': ('tuto_bg_03(480x800).png', None, None, 1),  # spotlight on the hero (240,376 r90)
    'tuto_bg_08': ('tuto_bg_08(480x800).png', None, None, 1),  # inventory explainer dim
    'tuto_bg_13': ('tuto_bg_13(480x800).png', None, None, 1),  # gold pickup (109,393 r55) + gem ranking
    'tuto_chat': ('tuto_chat_bg(140x90).png', None, None, 1),  # red bubble pointer, tail down
    'tuto_chat_w': ('tuto_chat_bg(256x64).png', None, None, 1),  # wide red bubble
    'tuto_obj': ('tuto_obj(88x18).png', None, None, 1),  # red dotted line (attack range)
    'bag_bg': ('bag_bg(480x800).png', None, None, 1),
    'item_weapon': ('item_weapon(82x82).png', 82, 82, 10),
    'item_armor': ('item_armor(82x82).png', 82, 82, 10),
    'item_ring': ('item_ring(82x82).png', 82, 82, 14),
    'item_necklace': ('item_necklace(82x82).png', 82, 82, 14),
    'bag_slot': ('item_slot(450x90).png', 90, 90, 5),
    'slot_item': ('slot_item(180x180).png', 90, 90, 4),
    # Drop 6: WING (Scene_Pet), EXPLORE (Scene_Adventure), TOWER (Scene_Tower / Scene_Stage_Tower)
    'slot_guardian': ('slot_guardian(86x100).png', None, None, 1),
    'guardian_bullet_01': ('guardian_bullet_01(18x18).png', 18, 18, 5),  # straight, frame = element
    'guardian_bullet_02': ('guardian_bullet_02(20x20).png', 20, 20, 5),  # homing
    'guardian_bullet_03': ('guardian_bullet_03(36x36).png', 36, 36, 5),  # bomb
    'guardian_bullet_04': ('guardian_bullet_04(64x64).png', None, None, 1),  # item maker
    'explore_bg': ('explore_bg(480x800).png', None, None, 1),
    'list_bg_explore': ('list_bg_explore(448x82).png', None, None, 1),
    'icon_explore': ('icon_explore(68x68).png', 68, 68, 6),  # 0 lock, 1-5 areas
    'tower_00': ('tower_00(480x800).jpg', None, None, 1),  # lobby
    'bg_tower_01': ('bg_tower_01(480x800).jpg', None, None, 1),  # floor
    'btn_enter_tower': ('btn_enter_tower(180x180).png', None, None, 1),
    'btn_go': ('btn_go(234x64).png', 234, 64, 2),
    'slot_tower_level': ('slot_tower_level(66x66).png', None, None, 1),
    # Drop 7: pickups (Scene_UI::FUC_SELECT_ITEM02 / FUC_SELECT_GEM), revive, ability shop, clear bonus
    'in_item': ('in_item(50x50).png', 50, 50, 18),  # row = pickup type (0 SCORE, 1 ATK, 2 DEF, 3 -, 4 BERSERK, 5 attribute, 8 potion); col 1 = HUD/ability icon
    'eff_doublescore': ('in_eff_doublescore(128x128).png', None, None, 1),
    'eff_berserk_bg': ('in_eff_berserker_bg(480x460).png', None, None, 1),  # 64 px strip tiled over the lane
    'eff_shield': ('in_eff_shield(128x128).png', None, None, 1),  # x2 DEF bubble round the knight (clip n7SeP1LzYs8 t=5130)
    'eff_doubleattack': ('in_eff_doubleattack(157x181).png', 78, 90, 6),  # x2 ATK flame
    'eff_revival': ('in_eff_revival_01(128x128).png', 128, 128, 16),
    'tuto_bg_14': ('tuto_bg_14(480x800).png', None, None, 1),  # pickup explainer spotlight (240,270)
    'guardian_00': ('guardian_00(82x82).png', 82, 82, 4),
    'guardian_01': ('guardian_01(82x82).png', 82, 82, 4),
    'guardian_02': ('guardian_02(82x82).png', 82, 82, 4),
    'guardian_03': ('guardian_03(82x82).png', 82, 82, 4),
    'guardian_04': ('guardian_04(82x82).png', 82, 82, 4),
    'guardian_05': ('guardian_05(82x82).png', 82, 82, 4),
    'guardian_06': ('guardian_06(82x82).png', 82, 82, 4),
    'guardian_07': ('guardian_07(82x82).png', 82, 82, 4),
    'guardian_08': ('guardian_08(82x82).png', 82, 82, 4),
    'guardian_09': ('guardian_09(82x82).png', 82, 82, 4),
    'guardian_10': ('guardian_10(82x82).png', 82, 82, 4),
    'guardian_11': ('guardian_11(82x82).png', 82, 82, 4),
    'guardian_12': ('guardian_12(82x82).png', 82, 82, 4),
    'guardian_13': ('guardian_13(82x82).png', 82, 82, 4),
    'guardian_14': ('guardian_14(82x82).png', 82, 82, 4),
    'guardian_15': ('guardian_15(82x82).png', 82, 82, 4),
    'guardian_16': ('guardian_16(82x82).png', 82, 82, 4),
    'guardian_17': ('guardian_17(82x82).png', 82, 82, 4),
    'guardian_18': ('guardian_18(82x82).png', 82, 82, 4),
    'guardian_19': ('guardian_19(82x82).png', 82, 82, 4),
    'guardian_20': ('guardian_20(82x82).png', 82, 82, 4),
    'guardian_21': ('guardian_21(82x82).png', 82, 82, 4),
    'guardian_22': ('guardian_22(82x82).png', 82, 82, 4),
    'guardian_23': ('guardian_23(82x82).png', 82, 82, 4),
    'guardian_24': ('guardian_24(82x82).png', 82, 82, 4),
    'guardian_25': ('guardian_25(82x82).png', 82, 82, 4),
}

# Knight upgrade tiers. The suffix is the upgrade tier (01 bare starter with a wooden sword ... 06 full plate +
# metal sword ... 20/30/40/50 colour variants); every tier file is a 4x4 sheet of 128x128 animation frames:
# 0-5 idle, 6-9 slash, 10 dash, 11 down. armor_cha_02..07 are other classes and are not exported.
KNIGHT_TIERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '20', '30', '40', '50']
for _t in KNIGHT_TIERS:
    IMAGES[f'hero_armor_{_t}'] = (f'armor_cha_01_{_t}(128x128).png', 128, 128, 12)
    IMAGES[f'hero_sword_{_t}'] = (f'sword_cha_01_{_t}(128x128).png', 128, 128, 12)

# the other five heroes: roster idx 1..5 = armor_cha_02 Teresa, 03 Bombery, 04 Elizabeth, 05 Flashare, 07 Warrior Skeleton
# (06 is a witch that is in no roster text; the skeleton matches the clip portrait OtA5hxMT0rg t=432). Same 12-frame layout.
# 04 / 05 ship real art only for tiers 01 and 10+ (02-09 are 2x2 placeholders); 07 has tiers 01-10.
HERO_SETS = {'02': KNIGHT_TIERS[:10] + KNIGHT_TIERS[11:], '03': KNIGHT_TIERS[:10] + KNIGHT_TIERS[11:],
             '04': ['01', '10', '20', '30', '40', '50'], '05': ['01', '10', '20', '30', '40', '50'], '07': KNIGHT_TIERS[:10]}
for _c, _ts in HERO_SETS.items():
    IMAGES[f'icon_armor_c{_c}'] = (f'armor_cha_{_c}(64x64).png', 64, 64, 14)
    IMAGES[f'icon_sword_c{_c}'] = (f'sword_cha_{_c}(64x64).png', 64, 64, 14)
    for _t in _ts:
        IMAGES[f'hero_armor_c{_c}_{_t}'] = (f'armor_cha_{_c}_{_t}(128x128).png', 128, 128, 12)
        IMAGES[f'hero_sword_c{_c}_{_t}'] = (f'sword_cha_{_c}_{_t}(128x128).png', 128, 128, 12)

AUDIO = {
    'gem': 'S_GET_GEM.wav',
    'revival': 'S_REVIVAL.wav',
    'quake': 'S_EARTHQUAKE02.wav',
    'ghost': 'S_GHOST.wav',
    'bgm_tower': 'S_BG_TOWER.mp3',
    'recall': 'S_RECALL01.wav',
    'bgm_title': 'BG_TITLE.mp3',
    'bgm_stage': 'S_BG_D00.mp3',
    'bgm_ui': 'BG_UI.mp3',
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
    'gold': 'S_gold.wav',
    'arrow': 'S_ARROW.wav',
    'boss_alert': 'S_BOSS_ALERT.wav',
    'dash': 'S_START_SKILL.wav',  # Scene_Stage::onTouchesBegan @0x5c59d0 (red button)
    'shield': 'S_HOLLY_SHIELD.wav',  # Scene_Stage::EFF_HOLLY_SHIELD @0x5968c8
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
