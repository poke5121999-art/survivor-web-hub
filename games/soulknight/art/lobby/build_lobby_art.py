# -*- coding: utf-8 -*-
"""Dựng art cho sảnh chọn nhân vật (js/lobby.js) từ kho bóc ~/Downloads/sk-ref/all.

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/art/lobby/build_lobby_art.py
Ra (cùng thư mục này):
  portrait/<folder>.png  tranh chân dung skin_0 (character_drawing), cao tối đa 520 px
  skills.png             bảng biểu tượng kỹ năng 32x32, 16 cột
  ui/*.png               vài biểu tượng giao diện thật (đá quý, sao, tim, khiên...)
  hall.png, mode_*.png   nền sảnh (cắt từ _room/world.png) và ảnh chế độ chơi
  lobby-art.js           window.SK_LOBBY_ART = {skills, skillUnlock, tr, portraits}
Chữ tiếng Việt sửa tay ở lobby_vi.json (tên, nội tại, vũ khí, kỹ năng) rồi chạy lại.
"""
import io, json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
RIP = os.path.join(os.path.expanduser('~'), 'Downloads', 'sk-ref', 'all')
WIKI = os.path.join(GAME, 'tools', 'wiki', 'heroes.json')

# Thứ tự = SK_DATA.heroes[x].s0.index (chỉ số nhân vật trong game).
ORDER = ('knight ranger mage assassin alchemist engineer vampire paladin elves werewolf priest druid robot viking '
         'necromancer officer taoist transcendent envoy beheaded ninja specialforces airbender warlock miner trapmaster '
         'costumeprince doctor swordmaster lancer warliege arcaneknight astrologist fighter joker bard shooter aigirl '
         'captain yinyang gunsexpert ladychef').split()

# Tranh chân dung: thư mục có nhiều tấm thì chọn tấm chính.
PORTRAIT_PICK = {'shooter': 'shooter_s0.png', 'officer': 'Officer_0.png', 'werewolf': 'werewolf_s0_0.png',
                 'yinyang': 'YinYangWhite.png'}

# Biểu tượng kỹ năng [ĐO]: nhân vật 0..17 dùng ui_skillNN (kỹ năng 1) + skill_<i>_1/_2 (kỹ năng 2/3);
# từ nhân vật 18 trở đi mỗi người một kiểu tên riêng.
SKILL_NAMED = {
    'envoy': ['envoy_skillicon_0'], 'beheaded': ['skill_19_0'], 'ninja': ['skill_20_0', 'ninja_skill_1_icon'],
    'specialforces': ['specialForces_skill_icon_0'], 'airbender': [None, 'airbender_skill2_icon'],
    'warlock': ['warlock_skill_0_icon_1', 'warlock_skill_1_icon', 'warlock_skill_2_icon'],
    'miner': ['miner_skill_0_icon_0', 'miner_skill_1_icon_0', 'miner_skill_2_icon_0'],
    'trapmaster': ['trapMaster_skillIcon_1_0', 'trapMaster_skillIcon_2_0', 'tarpMaster_skillIcon_3_0'],
    'costumeprince': ['costumePrince_skillIcon_1_0', 'costumePrince_skillIcon_2_0', 'costumePrince_skillIcon_3_0'],
    'doctor': [None, 'doctor_skillIcon_1', 'doctor_skillIcon_2'],
    'swordmaster': ['sword_master_skillIcon_1', 'sword_master_skillIcon_2_0', 'sword_master_skillIcon_3_0'],
    'lancer': ['lancer_skillIcon_0', 'lancer_skillIcon_1', 'lancer_skillIcon_2'],
    'warliege': ['warliege_skillIcon_0', 'warliege_skillIcon_1', 'warliege_skillIcon_2'],
    'arcaneknight': ['arcaneknight_skillIcon_0', 'arcaneknight_skillIcon_1'],
    'astrologist': ['astrologist_skillIcon_0', 'astrologist_skillIcon_1'],
    'fighter': ['fighter_skillIcon_0', 'fighter_skill2Icon_0'], 'joker': ['joker_skill0Icon', 'joker_skill1Icon'],
    'bard': ['bard_skill_0_icon', 'bard_skill_1_icon'], 'aigirl': ['aigirl_skill_0_icon'],
    'captain': ['captain_skillIcon_0_1'], 'yinyang': ['yinyang_skill_0_icon_0'],
    'gunsexpert': ['gunsexpert_skillIcon_0'], 'ladychef': ['ladychef_skill_icon_0'],
}

UI = {  # tên ra : (bundle, sprite)
    'gem': ('ui', 'gem_with_light'), 'star_on': ('ui', 'star_0'), 'star_off': ('ui', 'ui_star_2_1'),
    'hp': ('common', 'ui_icon_00_2'), 'armor': ('common', 'ui_icon_00_5'), 'crit': ('common', 'ui_icon_00_0'),
    'demo_on': ('ui', 'skill_demo_on'), 'demo_off': ('ui', 'skill_demo_off'), 'swap': ('ui', 'ui_icon_change'),
    'back': ('common', 'btn_back'), 'passive': ('common', 'passive_07'),
}
MODES = {'mode_level': 'ui_game_entry_new_icon_level', 'mode_season': 'ui_game_entry_new_icon_season',
         'mode_warfront': 'ui_game_entry_new_icon_guji', 'mode_bg': 'game_entry'}


def rip(bundle, name):
    p = os.path.join(RIP, bundle, name + '.png')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None


def save(im, rel, **kw):
    out = os.path.join(HERE, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=True, **kw)
    return os.path.getsize(out)


def main():
    total = 0
    heroes = json.load(io.open(WIKI, encoding='utf-8'))
    tr = json.load(io.open(os.path.join(HERE, 'lobby_vi.json'), encoding='utf-8'))

    # chân dung
    portraits = {}
    for f in ORDER:
        d = os.path.join(RIP, 'character_drawing', f, 'skin_0')
        files = sorted(x for x in os.listdir(d) if x.endswith('.png')) if os.path.isdir(d) else []
        pick = PORTRAIT_PICK.get(f) or (files[0] if files else None)
        if not pick:
            continue
        im = Image.open(os.path.join(d, pick)).convert('RGBA')
        im = im.crop(im.getbbox())
        if im.height > 520:
            k = 520 / im.height
            im = im.resize((round(im.width * k), 520), Image.LANCZOS)
        total += save(im, 'portrait/%s.png' % f)
        portraits[f] = [im.width, im.height]

    # biểu tượng kỹ năng
    icons, skills = [], {}
    for i, f in enumerate(ORDER):
        names = SKILL_NAMED.get(f) or ['ui_skill%02d' % (i + 1), 'skill_%d_1' % i, 'skill_%d_2' % i]
        row = []
        for nm in names:
            im = rip('ui', nm) if nm else None
            if im is None:
                row.append(-1)
                continue
            if im.size != (32, 32):
                c = Image.new('RGBA', (32, 32))
                im.thumbnail((32, 32))
                c.paste(im, ((32 - im.width) // 2, (32 - im.height) // 2))
                im = c
            row.append(len(icons))
            icons.append(im)
        skills[f] = row
    cols = 16
    sheet = Image.new('RGBA', (cols * 32, ((len(icons) + cols - 1) // cols) * 32))
    for n, im in enumerate(icons):
        sheet.paste(im, ((n % cols) * 32, (n // cols) * 32))
    total += save(sheet, 'skills.png')

    for out, (b, nm) in UI.items():
        im = rip(b, nm)
        if im is None:
            print('thiếu', b, nm)
            continue
        total += save(im, 'ui/%s.png' % out)
    for out, nm in MODES.items():
        im = rip('ui', nm)
        if out == 'mode_bg':
            im = im.convert('RGB')
            total += save(im, out + '.jpg', quality=78)
        else:
            total += save(im, out + '.png')

    # nền sảnh: phòng giữa của _room/world.png (sảnh Hiệp Sĩ dựng lại từ scene thật)
    world = Image.open(os.path.join(RIP, '_room', 'world.png')).convert('RGB')
    total += save(world.crop((815, 135, 1430, 480)), 'hall.png')

    # mở khoá kỹ năng 2/3 [WIKI]
    def amount(t):
        m = re.search(r'(\d[\d.,]*)', t or '')
        return float(m.group(1).replace(',', '')) if m else None
    unlock = {}
    for h in heroes:
        unlock[h['name']] = [{'kind': s['unlock'].get('kind'), 'amount': amount(s['unlock'].get('text'))}
                             if s.get('unlock') else None for s in h.get('skills') or []]
    data = {'skills': skills, 'skillUnlockByName': unlock, 'tr': tr, 'portraits': portraits}
    js = '// Sinh bởi art/lobby/build_lobby_art.py — đừng sửa tay (chữ Việt: lobby_vi.json).\n' \
         'window.SK_LOBBY_ART = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    io.open(os.path.join(HERE, 'lobby-art.js'), 'w', encoding='utf-8', newline='\n').write(js)
    total += len(js.encode('utf-8'))
    print('xong: %d chân dung, %d biểu tượng kỹ năng, %.2f MB' % (len(portraits), len(icons), total / 1e6))


if __name__ == '__main__':
    main()
