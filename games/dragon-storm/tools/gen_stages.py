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

# Knight attack area: Scene_Stage::Init_Player @0x57a1b8 places the two collision sprites (tags 6 / 7) at
# W/2 +- 0.08*W (.rodata 0x2d02c0), anchored on their inner edge; Scene_UI::FUC_SET_PLAYER_ATTAKING_COLLISION @0x5e4dd0
# sizes them W*0.11 (.rodata 0x2d0a50) + W*0.005 (.rodata 0x2d0dc0) * weapon level (capped at 9). A slash hits a monster
# whose hit box (GameData+0xd9b8[type] wide, a sprite kept on the monster's position) overlaps that area.
ATTACK_AREA = {'gap': 0.08, 'width': 0.11, 'perLevel': 0.005, 'maxLevel': 9}
# Scene_Stage::FUC_MONSTER_ATTACK @0x597cd8: normal monsters run Sequence(Delay(atkDelay), Animate(2 frames x 0.06 s),
# CallFuncN(FUC_HIT_BY_MONSTER), Animate(1 frame x 0.06 s), CallFuncN(FUC_MONSTER_ATTACK)) and loop (@0x598148; frame
# time 0.06 = 0x3d75c28f stored at Animation+0x34 @0x597ef0). Monsters whose GameData+0x16660 class is 6 (archers) use
# 0.1 s frames (@0x597dac) and an extra 1.0 s DelayTime (@0x5980e4).
ATTACK = {'normal': {'frame': 0.06, 'hitAt': 2, 'frames': 3, 'pause': 0.0},
          'class6': {'frame': 0.1, 'hitAt': 2, 'frames': 3, 'pause': 1.0}}
# Info_MissionTarget::Info_MissionTarget() @0x573060: target score per stage (+0x5dc0 + stage*8, setInt call sites
# 0x5731bc 0x573258 0x5732f4 0x573390 0x57342c); stars at T/3, T/2, T (Scene_UI::FUC_GET_SCORE @0x603100 / @0x6031b0 /
# @0x603240).
STAR_TARGET = [80, 80, 290, 500, 840]
# GameData+0x7698[stage] (setInt @0x622f70..0x623010) = 5000: Scene_UI::FUC_SELECT_ITEM @0x5ed40c drops a coin when
# rand() % 10001 < chance; a boss (AI 4) always drops 5 (@0x5ed440). Coin value 1 (x2 with the 2x-gold booster / HARD).
COIN_CHANCE = 5000


def monster_def(row, key, sheet, sfx):
    hp = row['hp2'] // 2 if row['hp2'] > 0 else 0
    scale = row['scale']
    contact = round(row['fw'] * scale / 2)
    a = row['_addr']
    cls = row['ai'][1] if 'ai' in row else 100
    atk = ATTACK['class6' if cls == 6 else 'normal']
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
        'box': row['box_w'],
        'score': row['score'],
        'ai': row['ai'][0] if 'ai' in row else 0,
        'atkDelay': row['atkDelay'],
        'atkFrame': atk['frame'],
        'atkHitAt': atk['hitAt'],
        'atkFrames': atk['frames'],
        'atkPause': atk['pause'],
        'attackSfx': sfx,
        '_src': {
            'hp': f"GameData+0xa178[type] = {row['hp2']} ({a.get('hp2')}), halved in Monster::Init_Monster001 @0x5721c0",
            'def': f"GameData+0xbd98[type] = {row['def2']} ({a.get('def2')}), halved @0x5721f0; used as def in Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0",
            'atk': f"GameData+0xb438[type] = {row['atk2']} ({a.get('atk2')}), halved @0x5721e0; atk in FUC_CALCULATE_DAMAGE from Scene_Stage::FUC_HIT_BY_MONSTER @0x5b9dc0",
            'walkTime': f"GameData+0xf5d8[type] = {row['walkTime']} ({a.get('walkTime')}): MoveTo duration to the stop point (FUC_START_MONSTER_AI @0x59a898); divided by fastDiv (0xff38) when the wave's +12 field != -1 (Init_Monster001 @0x5722d0)",
            'scale': f"GameData+0x12e18[type] = {scale} ({a.get('scale')}): sprite scale (SCH_CREATE_MONSTER01 @0x598dc4)",
            'contact': 'stop point = W/2 +- frameW*scale/2 (FUC_START_MONSTER_AI @0x59a868 / @0x59a994)',
            'box': f"GameData+0xd9b8[type] = {row['box_w']}: hit box sprite size (SCH_CREATE_MONSTER01 @0x598e1c)",
            'score': f"GameData+0xec78[type] = {row['score']} ({a.get('score')}); kill score = this + current combo (Scene_UI::FUC_GET_SCORE @0x602c30)",
            'ai': 'GameData+0x16658[type*0x18] -> Monster+0x5b0 (2 = ranged, 4 = boss)',
            'attack': f"FUC_MONSTER_ATTACK loop: Delay(GameData+0x11b58 = {row['atkDelay']}) + {atk['frames']} frames x {atk['frame']} s, hit after frame {atk['hitAt']}, + {atk['pause']} s",
        },
    }
    if d['ai'] == 2:
        d['ranged'] = {'projectile': 'arrow', 'stopFrac': 0.3, 'shots': 1,
                       'aimFrames': 2, 'aimFrame': 0.06, 'shootDelay': 0.66,
                       'retreat': 0.5, 'retreatTimeMul': 3, 'removeDelay': 0.2,
                       '_src': 'AI 2 (FUC_START_MONSTER_AI @0x59b7a0): MoveTo(walkTime) to x = W - 0.3*frameW*k (right) / '
                               '0.3*frameW*k (left), then FUC_MONSTER_SHOOTHING -> FUC_MONSTER_ATTACK @0x598180 (Monster+0x5b0 == 2): '
                               'Sequence(Spawn(EFF_ALERT02 "!", Animate 2 frames x 0.06), DelayTime(0.66), '
                               'Spawn(Animate 1 frame, CREATE_SHOOTING_OBJECT = one arrow, '
                               'EaseExponentialOut(MoveBy(walkTime*3, +-W/2 away from the knight))), DelayTime(0.2), '
                               'FUC_REMOVE_MONSTER): one arrow, then the archer backs off screen and is removed (no kill, no score)'}
    if key == 'arrow':
        d['projectileOf'] = 'goblin_archer'
    return d


def waves_for(rows, keys):
    """Init_Scenario entry: +0 type, +4 side (0 left / 1 right), +8 mode, +12 fast.
    SCH_PLAY_BY_SCENARIO @0x59f3f8 passes (type, side, mode, fast) to SCH_CREATE_MONSTER01, which hands mode to
    Init_Monster001's last argument (mode != -1 -> Monster+0x584 = 1, a 'required' monster @0x57243c) and fast to its
    4th (fast != -1 -> walkTime / fastDiv @0x5722d0). mode 1 = S_BOSS_ALERT + 1.2 s alert, then FUC_CREAT_LAST_MONSTER
    spawns it (@0x59f478); mode 3 = 0.5 s + FUC_ANI_INTRO_BOSS (1.8 s) then FUC_CREAT_BOSS (@0x59f408, @0x5a01b4)."""
    out = []
    for r in rows:
        t, typ, side, mode, fast = r['t'], r['type'], r['side'], r['mode'], r['extra']
        if typ not in keys or side not in (0, 1):
            continue  # 7777x tutorial markers, -1 gaps
        w = {'t': t, 'side': 'L' if side == 0 else 'R', 'type': keys[typ]}
        if fast != -1:
            w['fast'] = True
        if mode != -1:
            w['required'] = True
        if mode == 1:
            w['delay'] = 1.2
            w['alert'] = True
        if mode == 3:
            w['delay'] = 2.3
            w['alert'] = True
        out.append(w)
    return out


def main(src, game):
    re_ = json.load(open(src))
    mons = {int(k): v for k, v in re_['monsters'].items()}
    old = json.load(open(os.path.join(game, 'data', 'stage01.json')))
    hero = dict(old['hero'])
    for k in ('damage', 'range', 'hp', 'reach', 'skillDamage', 'skillEvery', 'skillStart'):
        hero.pop(k, None)
    hero['attackArea'] = ATTACK_AREA
    hero['critChance'] = 1
    hero['potionHeal'] = 0.3
    hero['_potion_src'] = 'heal = percent table * 0.01 * max HP (Scene_UI::FUC_USE_POTION @0x60812c); the game text says "Restores 30% of HP immediately" (libMyGame.so string)'
    hero['dash'] = {'cooldown': 10.0,
                    '_src': 'red button = the knight class skill (Scene_Stage::Call_Back_Ready_To_Skill -> FUC_SKILL_START @0x5be038, EFF_DASH): '
                            'the knight dashes along the facing side and every monster his collision box meets takes '
                            'FUC_CALCULATE_DAMAGE(skill power = player+0x540 = knightStats.skillByWeaponLevel, monster DEF) '
                            '(Scene_Stage::update @0x591a28: while dashing, each frame the knight sprite box is tested against every monster hit box; a monster is hit once (Monster+0x5cc set, cleared again in FUC_MONSTER_ATTACK); the web hits every monster on the facing side, the dash path itself is a web value). Re-armed by SCH_CHECK_MISSION_TARGET_TIME @0x58c018 counting a '
                            'timer down 0.1 per 0.1 s tick; the timer max (+0xcb4) is written by a store this pass could not find, '
                            'so cooldown 10.0 s is CLIP-MEASURED (ring refill c1 7:30.5 -> 7:40, 2 fps).'}
    hero['swordStorm'] = {
        'timer': 5.0, 'timerStep': 0.24, 'tick': 0.08, 'angles': 13, 'angleStep': 15, 'chance': 0.5,
        'flight': 0.6, 'startX': 240, 'startY': 400, 'w': 35, 'h': 58, 'monsterY': 416,
        '_src': ('blue button = Sword Storm, one Spirit of the Sword booster per use (stage cap 2). '
                 'Call_Back_Ready_To_Sword_Storm @0x5c3844: timer = 5 + GameData+0x9460 + GameData+0x9478 (both 0). '
                 'SCH_CREATE_STORM_SWORD @0x58c158, scheduled every 0.08 s (Scene_Stage::init @0x575b10): while timer > 0 it adds '
                 '-0.24 and, for k = 0..12, on rand()&1 makes a Guardian_Bullet type 4 (bullert_sword 35x58) at the screen centre '
                 '(W/2, H/2 = cocos y 400 -> screen y 400), rotated 90-15k deg, MoveTo(0.6 s) to centre + W*(cos 15k, sin 15k). '
                 'Its ATK = ceil(ATK/2) + trunc(ceil(ATK/2) * GameData+0x9480 * 0.01) (+0x9480 = 0) (@0x58c398); on the first '
                 'monster hit box it touches: FUC_CALCULATE_DAMAGE(ATK, DEF, 0, 0) (Scene_Stage::update @0x590fe8), then the sword '
                 'is removed (@0x591150). monsterY 416 = monster position GameData+0x124b8 = 0.48*H from the bottom; hit box '
                 'centred on it (assumed).')}
    hero['shieldInvuln'] = 0.7
    hero['_shield_src'] = ('Divine Shield fires by itself: FUC_HIT_BY_MONSTER @0x5b9de4 -> EFF_HOLLY_SHIELD: one shield used, no damage, '
                           'combo kept, FUC_ANI_UNDEADMODE + DelayTime(0.7) (@0x5b9e9c). Counts come from the boosters (data/meta.json).')
    hero.pop('shieldTime', None)
    hero['_damage_note'] = ('slash damage = max(1, 4*ATK - 2*DEF + (ATK >= 3 ? (rand() % ATK) / 4 : 1)) (Scene_UI::FUC_CALCULATE_DAMAGE @0x607ee0, '
                            'from Scene_Stage::update @0x59273c with player ATK +0x53c); x2 "PERFECT" when rand()%100 < player+0x560 = '
                            'GameData+0x9618[knight] = 1 (@0x592744; FUC_INIT_PLAYER @0x5f1cdc). Monster -> knight uses the same formula '
                            'with monster ATK vs knight DEF (FUC_HIT_BY_MONSTER @0x5b9dd4).')
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
            '_note': ('REAL NUMBERS from libMyGame.so unless a key says PLACEHOLDER or CLIP-MEASURED. Generated by tools/gen_stages.py from '
                      '~/dragon-storm-work/meta/re_stage_data.json; do not hand-edit. Waves: Scene_Stage::Init_Scenario() @0x58391c '
                      f'case {idx}, entry k at k*0.1 s (SCH_PLAY_BY_SCENARIO @0x59f2c8, scheduled every 0.1 s by FUC_START_GAME @0x5bab98), '
                      f'monster list GameData+0x19538+{idx}*0x50 = {[sl.get(i, -1) for i in range(8)]}.'),
            'id': f'stage{idx + 1:02d}',
            'number': idx + 1,
            'title': TITLES[idx],
            '_title_src': 'GAME_INFO_TEXT::textsetting() @0x4d9a80',
            'background': bg,
            'pad': pad,
            '_bg_src': 'Scene_UI::FUC_SET_BACKGROUD_IMAGE @0x5f6560 (stage index switch, table .rodata 0x359892)',
            'padOffset': old.get('padOffset', -48),
            'next': f'stage{idx + 2:02d}' if idx < 4 else None,
            'hero': hero,
            'monsters': monsters,
            'scriptEnd': re_['scriptEnd'][str(idx)],
            '_clear_src': ('Clear = Scene_Stage::FUC_CLEAR_PROCCESS (kills what is left) called from FUC_HIT_MONSTER_FROM_LEFT/RIGHT @0x595248: '
                           'when a required monster (wave mode != -1) dies after the 9999 end marker (+0x4b, SCH_PLAY_BY_SCENARIO @0x59ffbc) '
                           'or the 7777 marker (+0x4a, @0x59ffcc) and no other required monster is alive; or a boss dies after 7777.'),
            'coinChance': COIN_CHANCE / 10001,
            'bossCoins': 5,
            '_coin_src': 'GameData+0x7698[stage] = 5000, rand()%10001 < chance -> 1 coin; boss 5 (Scene_UI::FUC_SELECT_ITEM @0x5ed40c)',
            'scoreBar': STAR_TARGET[idx],
            'starMarks': [1 / 3, 1 / 2, 1],
            '_score_src': f'target T = {STAR_TARGET[idx]} (Info_MissionTarget @0x573060 +0x5dc0); stars at T/3, T/2, T (Scene_UI::FUC_GET_SCORE @0x603100); the gauge fills to T',
            'waves': waves_for(rows, keys),
        }
        fm = [r['t'] for r in rows if r['type'] == 7777]
        if fm:
            st['finalMarker'] = fm[0]
        if idx == 4:
            st['zzol'] = {
                '_src': ('Scene_Stage::Init_ZZoL_Scenario() @0x58bd8c (4 scripts), played one entry per 0.1 s by SCH_CREATE_ZZOL_BY_SCENARIO @0x5a0468 '
                         '(scheduled 0.1 s, FUC_START_GAME @0x5babc4). Called from the boss-hit branch of FUC_HIT_MONSTER_FROM_LEFT/RIGHT '
                         '@0x594fa0: compare current HP with the raw GameData HP (x2): summon 1 when raw*0.35 < hp <= raw*0.7, summon 2 when '
                         'raw*0.15 < hp <= raw*0.5, summon 3 when hp <= raw*0.3, each once and only while no script runs; 1 and 2 pick '
                         'rand()%3, 3 is pattern 3; each starts after DelayTime(boss walkTime) (@0x5953a0).'),
                'tick': 0.1,
                'phases': [{'hpLo': 0.35, 'hpHi': 0.7, 'pattern': 'rand3'}, {'hpLo': 0.15, 'hpHi': 0.5, 'pattern': 'rand3'},
                           {'hpLo': 0.0, 'hpHi': 0.3, 'pattern': 3}],
                'patterns': [[{'k': k, 'type': MONSTERS[t][0], 'side': 'L' if s == 0 else 'R'} for k, t, s in pat] for pat in ZZOL],
                'end': ZZOL_END,
            }
        path = os.path.join(game, 'data', f"stage{idx + 1:02d}.json")
        json.dump(st, open(path, 'w'), indent=1)
        print(path, len(st['waves']), 'waves', 'required', sum(1 for w in st['waves'] if w.get('required')), 'monsters', list(monsters), 'T', st['scoreBar'], 'end', st['scriptEnd'])


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]))
