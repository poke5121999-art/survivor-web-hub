"""Build data/stage01..05.json from the numbers recovered out of libMyGame.so.

Usage (run from anywhere, reads only JSON):
    python3 -I tools/gen_stages.py ~/dragon-storm-work/meta/re_stage_data.json ~/dragon-storm-work/games/dragon-storm

re_stage_data.json is written by ~/dragon-storm-work/tools/re2 (see its _note). Every number in the output carries
the C++ function + address it came from, or sits under a key that says PLACEHOLDER.
"""
import json
import os
import sys

# monster type id (GameData tables, Scene_Stage::Init_Image @0x57ef04 texture switch) -> web key / sheet
MONSTERS = {
    0: ('goblin_swordman', 'm_goblin_swordman', 'goblin_attack'),
    15: ('goblin_captain', 'm_goblin_swordman', 'goblin_attack'),  # same texture, scale 2 (Init_Image 0x57f154)
    1: ('wolf', 'm_wolf', 'wolf_attack'),
    2: ('goblin_archer', 'm_goblin_archer', 'arrow'),
    200: ('arrow', 'm_archer_arrow', None),
    14: ('goblin_flag', 'm_goblin_flag', 'goblin_attack'),
    5: ('shamanking', 'm_goblin_shaman', 'goblin_attack'),
}

# Scene_UI::FUC_SET_BACKGROUD_IMAGE @0x5f6560: switch on the stage index -> (bg_d, bg_t)
BACKGROUNDS = {0: ('bg_d_16', 'bg_t_07'), 1: ('bg_d_01', 'bg_t_01'), 2: ('bg_d_01', 'bg_t_01'),
               3: ('bg_d_02', 'bg_t_01'), 4: ('bg_d_02', 'bg_t_01')}

# GAME_INFO_TEXT::textsetting() @0x4d9a80: stage names in stage order
TITLES = ['GOBLIN ATTACKS VILLAGE!', 'BEGINNING OF A JOURNEY', 'ATTACK OF THE STARVING WOLVES',
          'THE BLITZ OF THE GOBLIN ARMY', 'SHAMANKING THE LEADER']

# Scene_Stage::Init_ZZoL_Scenario() @0x58bd8c (stage index 4 only): four minion scripts the boss calls, one entry per
# SCH_CREATE_ZZOL_BY_SCENARIO @0x5a0468 tick; type ids are direct, side 0 = left, 1 = right; 9999 ends the script.
ZZOL = [
    [(0, 1, 0), (6, 1, 0), (9, 1, 1), (15, 1, 1)],
    [(0, 1, 1), (6, 1, 1), (9, 1, 0), (15, 1, 0)],
    [(0, 1, 0), (3, 1, 1), (6, 1, 0), (9, 1, 1), (12, 1, 0), (15, 1, 1)],
    [(0, 0, 0), (1, 2, 0), (2, 14, 0), (10, 0, 0), (11, 0, 0), (44, 0, 1), (45, 2, 1), (46, 14, 1), (50, 0, 1),
     (51, 0, 1), (52, 2, 1), (70, 2, 0)],
]
ZZOL_END = [16, 16, 16, 71]

REACH = 46  # PLACEHOLDER: how far past a monster's contact distance the slash still lands (original: sword rect test)
ATTACK_ANIM = 0.45  # PLACEHOLDER: monster attack animation length (Animation delayPerUnit set through a vtable call)


def monster_def(row, key, sheet, sfx):
    hp = row['hp2'] // 2 if row['hp2'] > 0 else 0
    scale = row['scale']
    contact = round(row['fw'] * scale / 2)
    a = row['_addr']
    d = {
        'sheet': sheet,
        'typeId': row['kind'],
        'hp': hp,
        'def': row['def2'] // 2,
        'atk': row['atk2'] // 2,
        'walkTime': row['walkTime'],
        'fastDiv': row['fastDiv'],
        'scale': scale,
        'contact': contact,
        'score': row['score'],
        'ai': row['ai'][0] if 'ai' in row else 0,
        'atkEvery': round(1.0 + row['atkDelay'] + ATTACK_ANIM, 3),
        'gold': 1,
        'attackSfx': sfx,
        '_src': {
            'hp': f"GameData+0xa178[type] = {row['hp2']} ({a.get('hp2')}), halved in Monster::Init_Monster001 @0x5721c0",
            'def': f"GameData+0xbd98[type] = {row['def2']} ({a.get('def2')}), halved @0x5721f0; used as def in Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0",
            'atk': f"GameData+0xb438[type] = {row['atk2']} ({a.get('atk2')}), halved @0x5721e0; atk in FUC_CALCULATE_DAMAGE from Scene_Stage::FUC_HIT_BY_MONSTER @0x5b9dc0",
            'walkTime': f"GameData+0xf5d8[type] = {row['walkTime']} ({a.get('walkTime')}): MoveTo duration to the hero (FUC_START_MONSTER_AI @0x59a898); divided by fastDiv (0xff38) when the wave mode != -1 (Init_Monster001 @0x5722e0)",
            'scale': f"GameData+0x12e18[type] = {scale} ({a.get('scale')}): sprite scale (SCH_CREATE_MONSTER01 @0x598dc4)",
            'contact': 'stop point = W/2 +- frameW*scale/2 (FUC_START_MONSTER_AI @0x59a868 / @0x59a994)',
            'score': f"GameData+0xec78[type] = {row['score']} ({a.get('score')}); kill score = this + current combo (Scene_UI::FUC_GET_SCORE @0x602c30)",
            'ai': 'GameData+0x16658[type*0x18] -> Monster+0x5b0 (4 = boss: Scene_UI::FUC_SET_MONSTER_HP_BAR, Scene_Stage::update @0x590f3c)',
            'atkEvery': f"1.0 s DelayTime + GameData+0x11b58[type] = {row['atkDelay']} (FUC_MONSTER_ATTACK @0x5980d8) + PLACEHOLDER {ATTACK_ANIM} s animation",
            'gold': 'PLACEHOLDER: coin drops (Scene_UI::FUC_SELECT_GEM / FUC_SELECT_ITEM) not recovered',
        },
    }
    if key == 'goblin_archer':
        d['ranged'] = {'projectile': 'arrow', 'stopFromHero': 190, 'shots': 2,
                       '_note': 'AI 2 (ranged). stopFromHero and shots are PLACEHOLDER: the archer branch of FUC_START_MONSTER_AI was not decoded. Here the archer shoots `shots` arrows from stopFromHero, then walks in to melee. walkTime (0.75 s) is the recovered MoveTo duration, arrow stats are GameData type 200'}
    if key == 'arrow':
        d['projectileOf'] = 'goblin_archer'
    return d


def waves_for(rows, keys):
    out = []
    for r in rows:
        t, typ, side, mode, extra = r['t'], r['type'], r['side'], r['mode'], r['extra']
        if typ not in keys:
            continue  # 7777x tutorial markers, -1 gaps, intro triggers
        if side == 3:
            continue  # side 3 entry (stage 5, 0.3 s before the boss): meaning not traced, skipped
        if side not in (0, 1):
            side = 1  # PLACEHOLDER: the boss entry has side -1; it walks in from the right here (unverified)
        w = {'t': t, 'side': 'L' if side == 0 else 'R', 'type': keys[typ]}
        if mode != -1:
            w['fast'] = True
        if mode == 1:
            w['alert'] = True
        out.append(w)
    return out


def main(src, game):
    re_ = json.load(open(src))
    mons = {int(k): v for k, v in re_['monsters'].items()}
    old = json.load(open(os.path.join(game, 'data', 'stage01.json')))
    hero = dict(old['hero'])
    for k in ('damage', 'range', 'hp'):
        hero.pop(k, None)
    hero['reach'] = REACH
    hero['_damage_note'] = ('damage = max(1, 4*ATK - 2*DEF + (ATK >= 3 ? (rand() % ATK) / 4 : 1)), x2 on crit (rand()%100 < CRIT+15): '
                            'Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0 called from Scene_Stage::update @0x59273c with player ATK (+0x53c) vs monster DEF; '
                            'the same formula hurts the hero with monster ATK vs knight DEF (FUC_HIT_BY_MONSTER @0x5b9dd4). '
                            'skillDamage / skillEvery / potions / shields stay PLACEHOLDER (Sword Storm not decoded).')
    for idx in range(5):
        sl = {int(k): v for k, v in re_['stageLists'][str(idx)].items()}
        rows = re_['waves'][str(idx)]
        used = sorted({r['type'] for r in rows if r['type'] in MONSTERS})
        if idx == 4:
            used = sorted(set(used) | {t for pat in ZZOL for _, t, _ in pat})
        if 2 in used:
            used = sorted(set(used) | {200})
        keys = {t: MONSTERS[t][0] for t in used}
        monsters = {MONSTERS[t][0]: monster_def(mons[t], *MONSTERS[t]) for t in used}
        bg, pad = BACKGROUNDS[idx]
        st = {
            '_note': ('REAL NUMBERS from libMyGame.so unless a key says PLACEHOLDER. Generated by tools/gen_stages.py from '
                      '~/dragon-storm-work/meta/re_stage_data.json; do not hand-edit. Waves: Scene_Stage::Init_Scenario() @0x58391c '
                      f'case {idx}, entry k at k*0.1 s (SCH_PLAY_BY_SCENARIO @0x59f2c8), monster list GameData+0x19538+{idx}*0x50 = '
                      f'{[sl.get(i, -1) for i in range(8)]}. fast = wave mode != -1 (walk time / fastDiv); alert = mode 1 '
                      '(S_BOSS_ALERT + in_eff_alert, SCH_PLAY_BY_SCENARIO @0x59f4c4).'),
            'id': f'stage{idx + 1:02d}',
            'number': idx + 1,
            'title': TITLES[idx],
            '_title_src': 'GAME_INFO_TEXT::textsetting() @0x4d9a80',
            'background': bg,
            'pad': pad,
            '_bg_src': 'Scene_UI::FUC_SET_BACKGROUD_IMAGE @0x5f6560 (stage index switch, table .rodata 0x359892)',
            'padOffset': old.get('padOffset', -56),
            'next': f'stage{idx + 2:02d}' if idx < 4 else None,
            'hero': hero,
            'monsters': monsters,
            'scriptEnd': re_['scriptEnd'][str(idx)],
            '_scriptEnd_src': '9999 end marker written by the Init_Scenario tail @0x58a540; the stage clears once it has passed and no monster is left (PLACEHOLDER: FUC_CLEAR_PROCCESS trigger not traced)',
            '_score_note': 'PLACEHOLDER: scoreBar = score of a no-miss run (every kill + its combo); star marks at 27/54/82% measured on in_board_score. The real star rule (FUC_SHOW_RESULT reads saved stars, the award rule was not found) is not recovered.',
            'starMarks': [0.27, 0.54, 0.82],
            'waves': waves_for(rows, keys),
        }
        if idx == 4:
            st['zzol'] = {
                '_src': 'Scene_Stage::Init_ZZoL_Scenario() @0x58bd8c; played by SCH_CREATE_ZZOL_BY_SCENARIO @0x5a0468 after FUC_CALL_ZZOL_BY_PATTREN @0x5b8594',
                '_placeholder': 'PLACEHOLDER: tick 0.1 s (assumed same as SCH_PLAY_BY_SCENARIO), patterns called in order 0-3, the first `first` s after the boss appears (clip c1 8:14 shows wolves during the boss fight), then one every `every` s after the previous ends, while the boss lives (the boss AI that calls them was not decoded)',
                'tick': 0.1,
                'first': 1.0,
                'every': 7.0,
                'patterns': [[{'k': k, 'type': MONSTERS[t][0], 'side': 'L' if s == 0 else 'R'} for k, t, s in pat] for pat in ZZOL],
                'end': ZZOL_END,
            }
        # perfect-run score for the bar
        total, combo = 0, 0
        for w in st['waves']:
            total += monsters[w['type']]['score'] + combo
            combo += 1
        st['scoreBar'] = max(60, total)
        path = os.path.join(game, 'data', f"stage{idx + 1:02d}.json")
        json.dump(st, open(path, 'w'), indent=1)
        print(path, len(st['waves']), 'waves', 'monsters', list(monsters), 'scoreBar', st['scoreBar'], 'end', st['scriptEnd'])


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]))
