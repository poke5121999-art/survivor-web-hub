# -*- coding: utf-8 -*-
"""Số wiki (tools/wiki/*.json) -> data/sk-wiki.js  (window.SK_WIKI)

    PYTHONIOENCODING=utf-8 python games/soulknight/tools/build_design.py

Chạy SAU build_sk.py: cần atlas đã có khung vũ khí (build_sk.py tự bóc các sprite vũ khí mà
tools/wiki/weapons.json khớp được). Vũ khí không có khung trong atlas thì bị bỏ.
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
WIKI = os.path.join(HERE, 'wiki')

# Tên wiki -> thư mục skin trong CharacterSprites. Đối chiếu bằng mắt ở viewer.html?g=heroes.
HERO_FOLDER = {
    'Knight': 'knight', 'Rogue': 'ranger', 'Witch': 'mage', 'Assassin': 'assassin', 'Alchemist': 'alchemist',
    'Engineer': 'engineer', 'Vampire': 'vampire', 'Paladin': 'paladin', 'Elf': 'elves', 'Werewolf': 'werewolf',
    'Priestess': 'priest', 'Druid': 'druid', 'Robot': 'robot', 'Berserker': 'viking', 'Necromancer': 'necromancer',
    'Taoist': 'taoist', 'Officer': 'officer', 'Airbender': 'airbender', 'Demonmancer': 'warlock',
    'Time Traveling Ninja': 'ninja', 'Inter-dimension Traveler': 'transcendent', 'Physicist': 'doctor',
    'Arms Expert': 'gunsexpert', 'Gunner': 'shooter', 'Element Envoy': 'envoy', 'Trap Master': 'trapmaster',
    'Lancer': 'lancer', 'Sword Master': 'swordmaster', 'Warliege': 'warliege', 'Arcane Knight': 'arcaneknight',
    'Miner': 'miner', 'Special Forces': 'specialforces', 'Bard': 'bard', 'Captain': 'captain',
    'Costume Prince': 'costumeprince', 'Astromancer': 'astrologist', 'The Beheaded': 'beheaded',
    'Fighter': 'fighter', 'Lady Chef': 'ladychef', 'Machina': 'aigirl', 'Trickster': 'joker', 'Yin-Yang Adept': 'yinyang',
}

# Loại vũ khí wiki -> kind của runtime (SK.WEAPON_KINDS). Loại không có ở đây chưa dùng.
KIND = {
    'Handgun': 'gun', 'Rifle': 'gun', 'Sniper Rifle': 'gun', 'Shotgun': 'gun', 'Staff': 'staff',
    'Melee': 'melee', 'Bow': 'bow', 'Crossbow': 'bow', 'Laser Gun': 'laser', 'Launcher': 'launcher',
}


def num(f):
    if isinstance(f, dict):
        return f.get('number')
    try:
        return float(f)
    except (TypeError, ValueError):
        return None


def slug(name):
    s = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
    return s or 'w'


def pellets(w):
    n = num(w.get('number_of_projectiles'))
    if n:
        return int(n)
    raw = (w.get('damage') or {}).get('raw') or ''
    m = re.match(r'\s*\d+\s*[x×]\s*(\d+)', raw)
    return int(m.group(1)) if m else 1


def load_atlas_frames():
    s = io.open(os.path.join(GAME, 'data', 'sk-data.js'), encoding='utf-8').read()
    m = re.search(r'window\.SK_ATLAS = (.*?);\n', s)
    return set(json.loads(m.group(1))['f'])


def main():
    frames = load_atlas_frames()
    heroes_raw = json.load(io.open(os.path.join(WIKI, 'heroes.json'), encoding='utf-8'))
    weapons_raw = json.load(io.open(os.path.join(WIKI, 'weapons.json'), encoding='utf-8'))
    bosses_raw = json.load(io.open(os.path.join(WIKI, 'bosses.json'), encoding='utf-8'))

    starters = {h.get('starting_weapon') for h in heroes_raw}
    weapons, by_name, skipped = {}, {}, []
    for w in weapons_raw:
        kind = KIND.get(w.get('type'))
        # Súng khởi đầu kiểu lạ (ném, găng, ly rượu...) vẫn phải cầm được: tạm bắn như súng.
        if not kind and w['name'] in starters:
            kind = 'gun'
        sp = w.get('sprite') or {}
        fr = sp.get('name') if sp.get('bundle') == 'sprite_atlas' else None
        if not kind or not fr or fr not in frames:
            skipped.append(w['name'])
            continue
        wid = slug(w['name'])
        rec = {
            'name': w['name'], 'kind': kind, 'type': w.get('type'),
            'rarity': (w.get('rarity') or {}).get('color'), 'grade': num(w.get('grade')),
            'dmg': num(w.get('damage')), 'pellets': pellets(w), 'cost': num(w.get('ammo_cost')) or 0,
            'crit': num(w.get('critical_chance')) or 0, 'spread': num(w.get('accuracy')) or 0,
            'rps': num(w.get('rounds_per_second')), 'moveMod': num(w.get('speed')),
            'charge': num(w.get('charge_time')), 'sprite': fr,
            'usage': (w.get('usage') or '')[:400], 'page': w.get('page'),
        }
        if w['name'] in starters:
            rec['starter'] = True
            rec['dmg'] = rec['dmg'] if rec['dmg'] is not None else 3
            rec['rps'] = rec['rps'] or 3
        if rec['dmg'] is None or not rec['rps']:
            skipped.append(w['name'])
            continue
        weapons[wid] = rec
        by_name[w['name']] = wid

    heroes = {}
    for h in heroes_raw:
        folder = HERO_FOLDER.get(h['name'])
        if not folder:
            continue
        u = h.get('unlock') or {}
        heroes[folder] = {
            'name': h['name'], 'folder': folder,
            'hp': num(h.get('hp')), 'armor': num(h.get('armor')), 'energy': num(h.get('energy')),
            'crit': num(h.get('crit')) or 0, 'melee': num(h.get('melee_damage')),
            'passive': h.get('passive'), 'weaponName': h.get('starting_weapon'),
            'weapon': by_name.get(h.get('starting_weapon')),
            'unlock': {'kind': u.get('kind') or ('free' if h['name'] == 'Knight' else 'unknown'),
                       'amount': u.get('amount'), 'text': u.get('text')},
            'upgrades': h.get('upgrades') or [],
            'skills': [{'name': s.get('name'), 'cd': (s.get('cooldown') or {}).get('base'),
                        'desc': (s.get('description') or s.get('desc') or '')[:500]} for s in h.get('skills', [])],
            'page': h.get('page'),
        }

    bosses = {}
    for b in bosses_raw:
        fi = b.get('found_in') or {}
        bosses[slug(b['name'])] = {
            'name': b['name'], 'hp': num(b.get('health')), 'hpChampion': num(b.get('health_champion')),
            'levels': fi.get('normal_levels') or fi.get('levels') or [], 'biomes': fi.get('normal_biomes') or fi.get('biomes') or [],
            'attacks': b.get('attacks') or [], 'page': b.get('page'),
        }

    out = {'heroes': heroes, 'weapons': weapons, 'bosses': bosses}
    p = os.path.join(GAME, 'data', 'sk-wiki.js')
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/build_design.py từ tools/wiki/*.json — không sửa tay.\n')
        f.write('window.SK_WIKI = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('heroes', len(heroes), 'weapons', len(weapons), 'skipped', len(skipped), 'bosses', len(bosses))
    missing = [h['name'] for h in heroes_raw if h['name'] not in HERO_FOLDER]
    if missing:
        print('! hero chưa gán thư mục:', missing)
    nohw = [h['name'] for h in heroes.values() if not h['weapon']]
    print('hero thiếu súng khởi đầu trong bảng:', nohw)


if __name__ == '__main__':
    main()
