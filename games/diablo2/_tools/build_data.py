# -*- coding: utf-8 -*-
"""
Lever: read the Diablo II Resurrected 3.1 data tables and emit games/diablo2/js/data.js (window.D2DATA).

Rerunnable:  PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
  D2_EXCEL=<dir>  overrides the folder of the .txt tables (default D:/d2r-ref/fs/data/data/global/excel)

Sources (all local, extracted from the D2R 3.1.91636 CASC, see brain/plans/diablo2-d2r.md):
  * <D2_EXCEL>/*.txt  tab-separated, latin-1, one header row. 'Expansion' separator rows are dropped.
    Like the community 1.14d JSON this lever used before, empty and 0 cells are omitted, so a missing
    key means 0 (or "none"). Integer cells become int.
  * <D2_EXCEL>/../../local/lng/strings/*.json  D2R string tables ({id, Key, enUS, ...}); names only.
  * Formulas: Arreat Summit (classic.battle.net/diablo2exp) and D2MOO, the reverse-engineered
    1.10 game code (github.com/ThePhrozenKeep/D2MOO). Each formula in rules.js cites which.

Art keys follow the sprite contract of the plan: monsters 'mon.<monstats Code>', NPCs 'npc.<Code>',
missiles 'mis.<missiles.txt Missile>'. Anything typed by hand (area exits that D2 hard-codes in the DRLG,
NPC roles, quest wiring) lives in the HAND_* constants below and is marked in the output.
"""
import glob
import io
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'js', 'data.js'))
EXCEL = os.environ.get('D2_EXCEL') or 'D:/d2r-ref/fs/data/data/global/excel'
STRINGS = os.path.normpath(os.path.join(EXCEL, '..', '..', 'local', 'lng', 'strings'))

# Affixes up to this level are emitted. Act I normal drops never exceed alvl ~13 (Blood Raven mlvl 10,
# items with magic lvl add a few). Raise and rerun when later acts are added.
AFFIX_MAX_LVL = 15
UNIQUE_MAX_LVL = 30        # uniqueitems/setitems 'lvl' cap for emitted rows
ITEM_TIERS = ('normal',)   # base item tiers emitted ('exceptional', 'elite' for later acts)

_INT = re.compile(r'^-?\d+$')
_FLOAT = re.compile(r'^-?\d+\.\d+$')


def _cell(v):
    if _INT.match(v):
        return int(v)
    if _FLOAT.match(v):
        return float(v)
    return v


def load(name, key=None):
    """
    One excel table as {key: {column: value}}. key=None keys rows by their 0-based data-row index (as the
    1.14d JSON did); key='Col' keys by that column (rows without it, e.g. 'Expansion' separators, are
    dropped). Empty and 0 cells are omitted. Tables in D2R are latin-1; file name case varies by table.
    """
    want = name.lower() + '.txt'
    path = next((p for p in glob.glob(os.path.join(EXCEL, '*.txt')) if os.path.basename(p).lower() == want), None)
    if path is None:
        raise IOError('table %s not found in %s' % (want, EXCEL))
    with io.open(path, encoding='latin-1', newline='') as f:
        lines = f.read().split(chr(10))
    head = lines[0].rstrip(chr(13)).split(chr(9))
    out = {}
    for i, line in enumerate(lines[1:]):
        line = line.rstrip(chr(13))
        if not line.strip():
            continue
        cells = line.split(chr(9))
        if cells[0] == 'Expansion':
            continue
        row = {}
        for k, v in zip(head, cells):
            if v != '' and v != '0' and k:
                row[k] = _cell(v)
        if not row:
            continue
        if key is None:
            out[str(i)] = row
        elif key in row:
            out[row[key]] = row
    return out


def load_strings():
    """Key -> enUS over every D2R string table (Key is unique across files in practice; first wins)."""
    out = {}
    for p in sorted(glob.glob(os.path.join(STRINGS, '*.json'))):
        if 'overlay' in os.path.basename(p):   # chinese-overlay.json reuses skillname keys with other text
            continue
        with io.open(p, encoding='utf-8-sig') as f:
            for e in json.load(f):
                if isinstance(e, dict) and e.get('Key') and e.get('enUS') is not None:
                    out.setdefault(e['Key'], e['enUS'])
    return out


def snake(s):
    s = re.sub(r"[’']", '', s)
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def unq(s):
    """d2data keeps the CSV quoting of calc cells: '"min(24,ln12)"' -> 'min(24,ln12)'."""
    if isinstance(s, str) and len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        return s[1:-1]
    return s


def pick(row, keys):
    out = {}
    for k in keys:
        v = row.get(k)
        if v is not None and v != '' and v != 0:
            out[k] = unq(v)
    return out


# ---------------------------------------------------------------------------------------------
# HAND: data D2 does not keep in its .txt files.
# ---------------------------------------------------------------------------------------------
CLASS_IDS = [('amazon', 'ama', 'Amazon'), ('sorceress', 'sor', 'Sorceress'), ('necromancer', 'nec', 'Necromancer'),
             ('paladin', 'pal', 'Paladin'), ('barbarian', 'bar', 'Barbarian'), ('druid', 'dru', 'Druid'),
             ('assassin', 'ass', 'Assassin')]

# AI behaviour class for the engine, derived from monstats AI + skills (Arreat Summit monster pages).
HAND_AI_KIND = {
    'Zombie': 'melee_slow', 'Fallen': 'melee_flee', 'FallenShaman': 'shaman', 'QuillRat': 'ranged',
    'Brute': 'melee', 'CorruptRogue': 'melee', 'CorruptLancer': 'melee', 'CorruptArcher': 'ranged',
    'Skeleton': 'melee', 'BloodRaven': 'boss_ranged_summoner',
}
# Superunique placement (Arreat Summit). The colour is the Utrans palette shift in superuniques.txt.
HAND_SUPER = {
    'Corpsefire': {'id': 'corpsefire', 'area': 'den_of_evil'},
    'Bishibosh': {'id': 'bishibosh', 'area': 'cold_plains'},
    'Rakanishu': {'id': 'rakanishu', 'area': 'stony_field'},
    'Coldcrow': {'id': 'coldcrow', 'area': 'cave_1'},
}
# Bosses kept as monsters (monstats boss=1), with fixed placement.
HAND_BOSS = {'bloodraven': {'area': 'burial_grounds', 'quest': 'sisters_burial_grounds'}}

# Area table: (Levels.txt Id, our id, layout). exits: Levels.txt Vis0-7 covers cave/crypt entrances; the
# outdoor-to-outdoor links (Town-Blood Moor-Cold Plains-Burial Grounds/Stony Field) are hard-coded in
# the Act I outdoor DRLG (D2Common DrlgOutdoors), so they are typed here from the Arreat Summit Act I map.
HAND_AREAS = [
    (1, 'rogue_encampment', 'preset'),
    (2, 'blood_moor', 'outdoor'),
    (8, 'den_of_evil', 'cave'),
    (3, 'cold_plains', 'outdoor'),
    (4, 'stony_field', 'outdoor'),
    (9, 'cave_1', 'cave'),
    (13, 'cave_2', 'cave'),
    (17, 'burial_grounds', 'outdoor'),
    (18, 'crypt', 'cave'),
    (19, 'mausoleum', 'cave'),
]
HAND_EXITS = {
    'rogue_encampment': [{'to': 'blood_moor', 'side': 'west'}, {'to': 'blood_moor', 'side': 'south'}],
    'blood_moor': [{'to': 'rogue_encampment', 'side': 'edge'}, {'to': 'cold_plains', 'side': 'edge'},
                   {'to': 'den_of_evil', 'side': 'cave_entrance'}],
    'den_of_evil': [{'to': 'blood_moor', 'side': 'stairs'}],
    'cold_plains': [{'to': 'blood_moor', 'side': 'edge'}, {'to': 'stony_field', 'side': 'edge'},
                    {'to': 'burial_grounds', 'side': 'edge'}, {'to': 'cave_1', 'side': 'cave_entrance'}],
    'stony_field': [{'to': 'cold_plains', 'side': 'edge'}],
    'cave_1': [{'to': 'cold_plains', 'side': 'stairs'}, {'to': 'cave_2', 'side': 'stairs'}],
    'cave_2': [{'to': 'cave_1', 'side': 'stairs'}],
    'burial_grounds': [{'to': 'cold_plains', 'side': 'edge'}, {'to': 'crypt', 'side': 'stairs'},
                       {'to': 'mausoleum', 'side': 'stairs'}],
    'crypt': [{'to': 'burial_grounds', 'side': 'stairs'}],
    'mausoleum': [{'to': 'burial_grounds', 'side': 'stairs'}],
}
LEVEL_ID_TO_AREA = {1: 'rogue_encampment', 2: 'blood_moor', 3: 'cold_plains', 4: 'stony_field', 8: 'den_of_evil',
                    9: 'cave_1', 13: 'cave_2', 17: 'burial_grounds', 18: 'crypt', 19: 'mausoleum'}

ACT1_TOWN_NPCS = ['akara', 'charsi', 'gheed', 'kashya', 'warriv1', 'warriv2', 'cain1', 'rogue1', 'navi', 'chicken', 'rat',
                  'bird1', 'bird2', 'bat']
HAND_NPCS = {
    'akara': {'name': 'Akara', 'title': 'High Priestess of the Sisters of the Sightless Eye',
              'roles': ['trade', 'heal', 'quest'], 'sells': ['potions', 'scrolls', 'staves', 'wands', 'orbs'],
              'quests': ['den_of_evil'], 'spot': 'A'},
    'charsi': {'name': 'Charsi', 'title': 'Blacksmith', 'roles': ['trade', 'repair', 'imbue'],
               'sells': ['weapons', 'armor'], 'quests': ['tools_of_the_trade'], 'spot': 'C'},
    'gheed': {'name': 'Gheed', 'title': 'Merchant', 'roles': ['trade', 'gamble'],
              'sells': ['weapons', 'armor', 'misc'], 'spot': 'g'},
    'kashya': {'name': 'Kashya', 'title': 'Captain of the Rogues', 'roles': ['hire'],
               'quests': ['sisters_burial_grounds'], 'spot': 'k'},
    'warriv1': {'name': 'Warriv', 'title': 'Caravan leader', 'roles': ['travel'], 'spot': 'r',
               'travelTo': 'lut_gholein', 'travelNeeds': 'sisters_to_the_slaughter'},
}
# Arreat Summit, Act I quests (classic.battle.net/diablo2exp/quests/act1.shtml): Den of Evil is given by
# Akara; kill every monster in the Den; reward is one skill point. Since 1.13 completing it also lets
# Akara reset stats/skills once per difficulty.
HAND_QUESTS = {
    'den_of_evil': {'name': 'Den of Evil', 'act': 1, 'giver': 'akara', 'area': 'den_of_evil',
                    'goal': {'type': 'clear_area', 'area': 'den_of_evil'},
                    'reward': {'skillPts': 1, 'respec': True}, 'turnIn': 'akara', 'strKey': 'qstsa1q1'},
    'sisters_burial_grounds': {'name': 'Sisters\' Burial Grounds', 'act': 1, 'giver': 'kashya',
                               'area': 'burial_grounds', 'goal': {'type': 'kill', 'monster': 'bloodraven'},
                               'reward': {'mercenary': 'free'}, 'turnIn': 'kashya', 'strKey': 'qstsa1q2'},
}

# ---------------------------------------------------------------------------------------------
FILES = {  # table -> row key column (None = row index); see load()
    'charstats': 'class', 'skills': None, 'skilldesc': None, 'monstats': None, 'MonLvl': None, 'Levels': None,
    'experience': 'Level', 'TreasureClassEx': 'Treasure Class', 'weapons': 'code', 'armor': 'code', 'misc': 'code',
    'MagicPrefix': None, 'MagicSuffix': None, 'RarePrefix': None, 'RareSuffix': None, 'UniqueItems': None,
    'SetItems': None, 'ItemTypes': 'Code', 'SuperUniques': None, 'Missiles': None, 'itemratio': None,
    'monumod': None, 'qualityitems': None, 'lowqualityitems': None, 'difficultylevels': 'Name',
    'monstats2': 'Id', 'monsounds': 'Id', 'monpreset': None, 'playerclass': 'Player Class', 'plrtype': 'Name', 'soundenviron': 'Index',
}


def build():
    T = {n: load(n, k) for n, k in FILES.items()}
    S = load_strings()
    s = lambda k, d=None: S.get(k, d if d is not None else k)

    data = {'meta': {
        'game': 'Diablo II Resurrected 3.1 (normal difficulty first)',
        'source': 'D2R 3.1.91636 data/global/excel/*.txt',
        'strings': 'D2R 3.1.91636 data/local/lng/strings/*.json (enUS)',
        'formulas': ['http://classic.battle.net/diablo2exp/', 'https://github.com/ThePhrozenKeep/D2MOO'],
        'note': 'Generated by games/diablo2/_tools/build_data.py. Do not edit by hand; edit the lever.',
    }}

    # ---------------- classes (charstats.txt) ----------------
    cs = T['charstats']
    skills_rows = T['skills']
    sdesc = {v['skilldesc']: v for v in T['skilldesc'].values() if v.get('skilldesc')}
    by_name = {r['skill']: r for r in skills_rows.values()}
    tokens = {r['Name']: r['Token'] for r in T['plrtype'].values()}   # plrtype.txt: sprite token AM, SO, NE, PA, BA, DZ, AI
    classes = {}
    for cid, code, cname in CLASS_IDS:
        r = cs[cname]
        tabs = []
        for i in (1, 2, 3):
            t = s(r['StrSkillTab%d' % i])
            t = re.sub(r'^%?\+%?d to ', '', t)
            t = re.sub(r' Skills.*$', '', t)
            tabs.append(t)
        start_items = []
        for i in range(1, 11):
            c = r.get('item%d' % i)
            if c:
                start_items.append({'code': c, 'loc': r.get('item%dloc' % i) or None, 'count': r.get('item%dcount' % i, 0),
                                    'quality': r.get('item%dquality' % i, 0)})
        start_skills = [snake(r['Skill %d' % i]) for i in range(1, 11) if r.get('Skill %d' % i)]
        classes[cid] = {
            'id': cid, 'code': tokens[cname], 'cc': code, 'name': cname,
            'str': r['str'], 'dex': r['dex'], 'vit': r['vit'], 'ene': r['int'],
            'stamina': r['stamina'], 'hpadd': r['hpadd'],
            # the *Per* columns are in fourths (charstats.txt comment "The following are in fourths")
            'lifePerLvl4': r['LifePerLevel'], 'manaPerLvl4': r['ManaPerLevel'], 'stamPerLvl4': r['StaminaPerLevel'],
            'lifePerVit4': r['LifePerVitality'], 'manaPerEne4': r['ManaPerMagic'], 'stamPerVit4': r['StaminaPerVitality'],
            'statPerLvl': r['StatPerLevel'], 'manaRegenSec': r['ManaRegen'], 'toHitFactor': r['ToHitFactor'],
            # subtiles/second; the same two numbers under the table's own column names
            'walkVel': r['WalkVelocity'], 'runVel': r['RunVelocity'],
            'WalkVelocity': r['WalkVelocity'], 'RunVelocity': r['RunVelocity'], 'runDrain': r['RunDrain'],
            'blockFactor': r['BlockFactor'],
            # charstats.txt lost the 1.14 '#walk/#swing/...' frame columns; frame counts now come from animdata/COF
            'frames': {},
            'tabs': tabs, 'startSkills': start_skills, 'startItems': start_items,
            'startSkill': r.get('StartSkill') or None,
            'potionPct': {'hp': r['HealthPotionPercent'], 'mp': r['ManaPotionPercent']},
            'skills': [],
        }

    # ---------------- skills (skills.txt + skilldesc.txt) ----------------
    code2cls = {code: cid for cid, code, _ in CLASS_IDS}
    SKILL_KEYS = ['reqlevel', 'maxlvl', 'passive', 'aura', 'range', 'itypea1', 'itypea2', 'itypea3', 'itypeb1',
                  'etypea1', 'decquant', 'mana', 'lvlmana', 'manashift', 'minmana', 'startmana', 'ToHit', 'LevToHit',
                  'ToHitCalc', 'HitShift', 'SrcDam', 'MinDam', 'MinLevDam1', 'MinLevDam2', 'MinLevDam3', 'MinLevDam4',
                  'MinLevDam5', 'MaxDam', 'MaxLevDam1', 'MaxLevDam2', 'MaxLevDam3', 'MaxLevDam4', 'MaxLevDam5',
                  'DmgSymPerCalc', 'EType', 'EMin', 'EMinLev1', 'EMinLev2', 'EMinLev3', 'EMinLev4', 'EMinLev5',
                  'EMax', 'EMaxLev1', 'EMaxLev2', 'EMaxLev3', 'EMaxLev4', 'EMaxLev5', 'EDmgSymPerCalc', 'ELen',
                  'ELevLen1', 'ELevLen2', 'ELevLen3', 'ELenSymPerCalc', 'calc1', 'calc2', 'calc3', 'calc4',
                  'Param1', 'Param2', 'Param3', 'Param4', 'Param5', 'Param6', 'Param7', 'Param8',
                  'auralencalc', 'aurarangecalc', 'aurastat1', 'aurastatcalc1', 'aurastat2', 'aurastatcalc2',
                  'aurastat3', 'aurastatcalc3', 'aurastat4', 'aurastatcalc4', 'aurastat5', 'aurastatcalc5',
                  'passivestat1', 'passivecalc1', 'passivestat2', 'passivecalc2', 'passivestat3', 'passivecalc3',
                  'passivestat4', 'passivecalc4', 'passivestat5', 'passivecalc5', 'passiveitype',
                  'srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec', 'summon', 'pettype', 'petmax',
                  'InTown', 'localdelay', 'globaldelay', 'repeat', 'weapsel', 'noammo',
                  'cltmissile', 'cltmissilea', 'cltmissileb', 'cltmissilec', 'cltmissiled', 'anim', 'stsound', 'dosound']
    skills = {}
    internal_to_id = {}
    missiles_needed = set()
    calc_keys = [k for k in SKILL_KEYS if 'calc' in k.lower() or k.endswith('SymPerCalc') or k == 'ToHitCalc']
    for r in skills_rows.values():
        cls = code2cls.get(r.get('charclass'))
        d = sdesc.get(r.get('skilldesc'))
        if not cls or not d or not d.get('SkillPage'):
            continue
        disp = s(d.get('str name'), r['skill'])
        sid = snake(disp)   # id from the display name ('Decoy', not the internal 'Dopplezon')
        assert sid not in skills, sid
        internal_to_id[r['skill']] = sid
        t = pick(r, SKILL_KEYS)
        if 'HitShift' not in t:
            t['HitShift'] = 0
        prereq = [r[k] for k in ('reqskill1', 'reqskill2', 'reqskill3') if r.get(k)]
        syn = set()
        for k in calc_keys:
            v = t.get(k)
            if isinstance(v, str):
                for m in re.finditer(r"skill\('([^']+)'\.", v):
                    if m.group(1) != r['skill']:
                        syn.add(m.group(1))
        for k in ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec'):
            if r.get(k):
                missiles_needed.add(r[k])
        skills[sid] = {
            'id': sid, 'd2id': r['*Id'], 'name': disp, 'd2name': r['skill'], 'cls': cls,
            'tab': d['SkillPage'], 'row': d['SkillRow'], 'col': d['SkillColumn'], 'icon': d.get('IconCel', 0),
            'reqlvl': r.get('reqlevel', 1), 'maxlvl': r.get('maxlvl', 20), 'prereq': prereq,
            'synergies': sorted(syn), 't': t,
        }
        classes[cls]['skills'].append(sid)
    # prerequisites/synergies name skills by their internal skills.txt name; map to our ids
    for sk in skills.values():
        sk['prereq'] = [internal_to_id[x] for x in sk['prereq']]
        sk['synergies'] = sorted(internal_to_id[x] for x in sk['synergies'] if x in internal_to_id)
    for c in classes.values():
        c['skills'].sort(key=lambda k: (skills[k]['tab'], skills[k]['row'], skills[k]['col']))
    # monster skills referenced by the Act I monsters (missile/elemental numbers live in missiles.txt)
    mon_skill_names = ['ShamanFire', 'Resurrect', 'Nest', 'Quick Strike', 'SkeletonRaise']
    monskills = {}
    for n in mon_skill_names:
        r = by_name.get(n)
        if r:
            monskills[snake(n)] = {'d2id': r['*Id'], 'd2name': n, 't': pick(r, SKILL_KEYS)}
            for k in ('srvmissile', 'srvmissilea'):
                if r.get(k):
                    missiles_needed.add(r[k])

    # ---------------- monsters ----------------
    ms = {r['Id']: r for r in T['monstats'].values()}
    lv = {r['Id']: r for r in T['Levels'].values() if 'Id' in r}
    area_rows = {aid: lv[lid] for lid, aid, *_ in HAND_AREAS}
    mon_ids = set()
    for r in area_rows.values():
        for i in range(1, 11):
            for pre in ('mon', 'umon'):
                if r.get('%s%d' % (pre, i)):
                    mon_ids.add(r['%s%d' % (pre, i)])
    for bid in HAND_BOSS:
        mon_ids.add(bid)
    sup_rows = {}
    for r in T['SuperUniques'].values():
        if r.get('Superunique') in HAND_SUPER:
            sup_rows[r['Superunique']] = r
            mon_ids.add(r['Class'])
    # minions / spawns
    for mid in list(mon_ids):
        for k in ('minion1', 'minion2', 'spawn'):
            if ms[mid].get(k):
                mon_ids.add(ms[mid][k])
    DIFFS = [('', 'n'), ('(N)', 'nm'), ('(H)', 'h')]
    monsters = {}
    for mid in sorted(mon_ids):
        r = ms[mid]
        per = {}
        for suf, dk in DIFFS:
            per[dk] = {
                'level': r.get('Level' + suf, 0), 'minHP': r.get('minHP' if not suf else 'MinHP' + suf, 0),
                'maxHP': r.get('maxHP' if not suf else 'MaxHP' + suf, 0), 'ac': r.get('AC' + suf, 0),
                'exp': r.get('Exp' + suf, 0), 'a1min': r.get('A1MinD' + suf, 0), 'a1max': r.get('A1MaxD' + suf, 0),
                'a1th': r.get('A1TH' + suf, 0), 'a2min': r.get('A2MinD' + suf, 0), 'a2max': r.get('A2MaxD' + suf, 0),
                'a2th': r.get('A2TH' + suf, 0), 's1min': r.get('S1MinD' + suf, 0), 's1max': r.get('S1MaxD' + suf, 0),
                's1th': r.get('S1TH' + suf, 0),
                'res': {'phys': r.get('ResDm' + suf, 0), 'magic': r.get('ResMa' + suf, 0), 'fire': r.get('ResFi' + suf, 0),
                        'light': r.get('ResLi' + suf, 0), 'cold': r.get('ResCo' + suf, 0), 'poison': r.get('ResPo' + suf, 0)},
                'block': r.get('ToBlock' + suf, 0), 'drain': r.get('Drain' + suf, 0),
                'coldEffect': r.get('coldeffect' + suf, 0),
                'aip': [r.get('aip%d%s' % (i, suf), 0) for i in range(1, 9)],
                'aidel': r.get('aidel' + suf, 0),
                'el': [{'mode': r.get('El%dMode' % i), 'type': r.get('El%dType' % i), 'pct': r.get('El%dPct%s' % (i, suf), 0),
                        'min': r.get('El%dMinD%s' % (i, suf), 0), 'max': r.get('El%dMaxD%s' % (i, suf), 0),
                        'dur': r.get('El%dDur%s' % (i, suf), 0)} for i in (1, 2, 3) if r.get('El%dType' % i)],
                # 1.14 TreasureClass1-4 = normal, champion, unique, quest
                'tc': [r.get(c + suf) for c in ('TreasureClass', 'TreasureClassChamp', 'TreasureClassUnique', 'TreasureClassQuest')],
            }
        for k in ('MissA1', 'MissA2', 'MissS1', 'MissSQ'):
            if r.get(k):
                missiles_needed.add(r[k])
        m2 = T['monstats2'].get(mid, {})
        monsters[mid] = {
            'id': mid, 'name': s(r.get('NameStr', mid)), 'base': r.get('BaseId'), 'type': r.get('MonType'),
            'ai': r.get('AI'), 'aiKind': HAND_AI_KIND.get(r.get('AI'), 'melee'),
            'walkVel': r.get('Velocity', 0), 'runVel': r.get('Run', 0), 'grp': [r.get('MinGrp', 1), r.get('MaxGrp', 1)],
            'party': [r.get('PartyMin', 0), r.get('PartyMax', 0)] if r.get('minion1') else None,
            'minion': r.get('minion1'), 'spawn': r.get('spawn'), 'rarity': r.get('Rarity', 0),
            'ranged': bool(r.get('rangedtype')), 'melee': bool(r.get('isMelee')),
            'undead': 'low' if r.get('lUndead') else ('high' if r.get('hUndead') else None), 'demon': bool(r.get('demon')),
            'boss': bool(r.get('boss')), 'noRatio': bool(r.get('noRatio')), 'damageRegen': r.get('DamageRegen', 0),
            'crit': r.get('Crit', 0), 'threat': r.get('threat', 0),
            'miss': pick(r, ['MissA1', 'MissA2', 'MissS1', 'MissSQ']),
            'skills': [{'id': snake(r['Skill%d' % i]), 'lvl': r.get('Sk%dlvl' % i, 1), 'mode': r.get('Sk%dmode' % i)}
                       for i in range(1, 9) if r.get('Skill%d' % i)],
            'monSound': r.get('MonSound'), 'snd': {k: v for k, v in T['monsounds'].get(r.get('MonSound'), {}).items() if k not in ('Id', 'EOL')},
            'd': per, 'code': r['Code'], 'art': 'mon.' + r['Code'].upper(), 'baseW': m2.get('BaseW'),
            'Velocity': r.get('Velocity', 0), 'Run': r.get('Run', 0),
        }
        if mid in HAND_BOSS:
            monsters[mid].update(HAND_BOSS[mid])

    mu = T['monumod']
    umods = {int(k): v.get('uniquemod') for k, v in mu.items() if v.get('uniquemod')}
    umod_const = [mu[str(i)].get('constants', 0) if str(i) in mu else 0 for i in range(0, max(int(k) for k in mu) + 1)]
    superuniques = {}
    for name, r in sup_rows.items():
        h = HAND_SUPER[name]
        superuniques[h['id']] = {
            'id': h['id'], 'name': s(r['Name'], name), 'cls': r['Class'], 'area': h['area'],
            'mods': [umods.get(r['Mod%d' % i]) for i in (1, 2, 3) if r.get('Mod%d' % i)],
            'minions': [r.get('MinGrp', 0), r.get('MaxGrp', 0)], 'tc': {'n': r.get('TC'), 'nm': r.get('TC(N)'), 'h': r.get('TC(H)')},
            'utrans': r.get('Utrans', 0),
        }

    # monlvl.txt: LoD columns (L-*) per difficulty; index = monster level
    monlvl = {'n': [], 'nm': [], 'h': []}
    rows = sorted(T['MonLvl'].values(), key=lambda r: r.get('Level', 0))
    for r in rows:
        for suf, dk in DIFFS:
            monlvl[dk].append([r.get('L-AC' + suf, 0), r.get('L-TH' + suf, 0), r.get('L-HP' + suf, 0),
                               r.get('L-DM' + suf, 0), r.get('L-XP' + suf, 0)])

    # ---------------- missiles ----------------
    MISS_KEYS = ['Vel', 'MaxVel', 'VelLev', 'Accel', 'Range', 'Size', 'Light', 'Pierce', 'CanSlow', 'HitShift',
                 'SrcDamage', 'MinDamage', 'MaxDamage', 'MinLevDam1', 'MinLevDam2', 'MinLevDam3', 'MinLevDam4',
                 'MinLevDam5', 'MaxLevDam1', 'MaxLevDam2', 'MaxLevDam3', 'MaxLevDam4', 'MaxLevDam5', 'EType', 'EMin',
                 'MinELev1', 'MinELev2', 'MinELev3', 'MinELev4', 'MinELev5', 'EMax', 'MaxELev1', 'MaxELev2',
                 'MaxELev3', 'MaxELev4', 'MaxELev5', 'ELen', 'ELevLen1', 'ELevLen2', 'ELevLen3',
                 'SubMissile1', 'ExplosionMissile', 'CelFile']
    mrows = {r['Missile']: r for r in T['Missiles'].values() if r.get('Missile')}
    missiles = {}
    queue = list(missiles_needed)
    while queue:
        m = queue.pop()
        if m in missiles or m not in mrows:
            continue
        t = pick(mrows[m], MISS_KEYS)
        if 'EMax' in t:
            t['Emax'] = t.pop('EMax')   # rules.js reads the 1.14 spelling
        t['art'] = 'mis.' + m
        missiles[m] = t
        for k in ('SubMissile1', 'ExplosionMissile'):
            if t.get(k):
                queue.append(t[k])

    # ---------------- items ----------------
    itypes = {}
    for code, r in T['ItemTypes'].items():
        if not isinstance(r, dict) or not r.get('Code'):
            continue
        itypes[r['Code']] = {k: v for k, v in {
            'name': r.get('ItemType'), 'equiv': [e for e in (r.get('Equiv1'), r.get('Equiv2')) if e],
            'normal': r.get('Normal', 0), 'magic': r.get('Magic', 0), 'rare': r.get('Rare', 0),
            'throwable': r.get('Throwable', 0), 'beltable': r.get('Beltable', 0), 'class': r.get('Class'),
            'bodyLoc': [x for x in (r.get('BodyLoc1'), r.get('BodyLoc2')) if x], 'rarity': r.get('Rarity', 0),
            'maxSock': [r.get('MaxSock1', 0), r.get('MaxSock25', 0), r.get('MaxSock40', 0)], 'tc': r.get('TreasureClass', 0),
            'staffMods': r.get('StaffMods'),
        }.items() if v not in (None, 0, [], '')}

    def type_chain(t, acc=None):
        acc = acc if acc is not None else []
        if t and t not in acc:
            acc.append(t)
            for e in itypes.get(t, {}).get('equiv', []):
                type_chain(e, acc)
        return acc

    bases = {}

    def tier_of(r):
        c = r.get('code')
        if c == r.get('ubercode'):
            return 'exceptional'
        if c == r.get('ultracode'):
            return 'elite'
        return 'normal'

    def add_base(r, kind):
        code = r['code']
        b = {
            'code': code, 'name': s(r.get('namestr', code), r.get('name')), 'kind': kind, 'type': r.get('type'),
            'types': type_chain(r.get('type')) + [t for t in type_chain(r.get('type2')) if t],
            'level': r.get('level', 0), 'reqlvl': r.get('levelreq', 0), 'reqstr': r.get('reqstr', 0),
            'reqdex': r.get('reqdex', 0), 'w': r.get('invwidth', 1), 'h': r.get('invheight', 1),
            'cost': r.get('cost', 0), 'tier': tier_of(r) if kind != 'misc' else 'normal',
            'spawnable': r.get('spawnable', 0), 'rarity': r.get('rarity', 0),
            # art columns copied verbatim from the table (empty omitted)
            'invfile': r.get('invfile'), 'uniqueinvfile': r.get('uniqueinvfile'), 'setinvfile': r.get('setinvfile'),
            'flippyfile': r.get('flippyfile'), 'invwidth': r.get('invwidth', 1), 'invheight': r.get('invheight', 1),
            'alternategfx': r.get('alternategfx'), 'dropsound': r.get('dropsound'), 'usesound': r.get('usesound'),
        }
        b = {k: v for k, v in b.items() if v is not None}
        if kind == 'weapon':
            b.update({k: v for k, v in {
                'mindam': r.get('mindam', 0), 'maxdam': r.get('maxdam', 0), 'mindam2h': r.get('2handmindam', 0),
                'maxdam2h': r.get('2handmaxdam', 0), 'minmis': r.get('minmisdam', 0), 'maxmis': r.get('maxmisdam', 0),
                'twoHanded': r.get('2handed', 0), 'oneOrTwo': r.get('1or2handed', 0), 'speed': r.get('speed', 0),
                'strBonus': r.get('StrBonus', 0), 'dexBonus': r.get('DexBonus', 0), 'range': r.get('rangeadder', 0),
                'wclass': r.get('wclass'), 'wclass2': r.get('2handedwclass'), 'wclass2h': r.get('2handedwclass'), 'dur': r.get('durability', 0),
                'sockets': r.get('gemsockets', 0), 'stack': r.get('maxstack', 0), 'throwable': 1 if 'thro' in b['types'] else 0,
                'quiver': r.get('quivered'), 'magicLvl': r.get('magic lvl', 0),
            }.items() if v not in (0, None)})
        elif kind == 'armor':
            b.update({k: v for k, v in {
                'minac': r.get('minac', 0), 'maxac': r.get('maxac', 0), 'block': r.get('block', 0),
                'speed': r.get('speed', 0), 'dur': r.get('durability', 0), 'sockets': r.get('gemsockets', 0),
                'mindam': r.get('mindam', 0), 'maxdam': r.get('maxdam', 0), 'belt': r.get('belt'),
                'magicLvl': r.get('magic lvl', 0),
                # appearance variant 0/1/2 = lit/med/hvy per body part: torso, legs, right/left arm, right/left shoulder pad
                'torso': r.get('Torso', 0), 'legs': r.get('Legs', 0), 'rarm': r.get('rArm', 0), 'larm': r.get('lArm', 0),
                'rspad': r.get('rSPad', 0), 'lspad': r.get('lSPad', 0), 'component': r.get('component', 0),
            }.items() if v not in (0, None)})
        else:
            b.update({k: v for k, v in {
                'stat': r.get('stat1'), 'calc': r.get('calc1'), 'stat2': r.get('stat2'), 'calc2': r.get('calc2'),
                'lenFrames': r.get('len', 0), 'stack': r.get('maxstack', 0), 'spawnStack': r.get('spawnstack', 0),
                'useable': r.get('useable', 0), 'belt': r.get('belt', 0), 'magicLvl': r.get('magic lvl', 0),
                'autoPrefix': r.get('auto prefix'),
            }.items() if v not in (0, None)})
        bases[code] = b

    for r in T['weapons'].values():
        if r.get('code') and (r.get('spawnable') or r.get('code') in ('hax', 'jav', 'sst', 'wnd', 'ssd', 'clb', 'ktr')) and tier_of(r) in ITEM_TIERS and not r.get('quest'):
            add_base(r, 'weapon')
    for r in T['armor'].values():
        if r.get('code') and (r.get('spawnable') or r.get('code') == 'buc') and tier_of(r) in ITEM_TIERS and not r.get('quest'):
            add_base(r, 'armor')

    # treasure classes reachable from the emitted monsters/superuniques
    tcx = T['TreasureClassEx']
    tc_order = {name: i for i, name in enumerate(tcx.keys())}
    roots = set()
    for m in monsters.values():
        for x in m['d']['n']['tc']:
            if x:
                roots.add(x)
    for su in superuniques.values():
        if su['tc']['n']:
            roots.add(su['tc']['n'])
    tcs, auto_needed, misc_needed = {}, set(), set()
    AUTO = re.compile(r'^(weap|armo|mele|bow|abow)(\d+)$')
    queue = list(roots)
    while queue:
        n = queue.pop()
        if n in tcs or AUTO.match(n):
            continue
        r = tcx.get(n)
        if r is None:
            misc_needed.add(n)
            continue
        items = []
        for i in range(1, 11):
            it = r.get('Item%d' % i)
            if not it:
                continue
            it = unq(it)
            mul = None
            if ',' in it:
                it, opt = it.split(',', 1)
                mm = re.match(r'mul=(\d+)', opt)
                mul = int(mm.group(1)) if mm else None
            items.append([it, r.get('Prob%d' % i, 0)] + ([mul] if mul else []))
            if AUTO.match(it):
                auto_needed.add(it)
            elif it in tcx:
                queue.append(it)
            else:
                misc_needed.add(it)
        tcs[n] = {k: v for k, v in {
            'picks': r.get('Picks', 1) or 1, 'nodrop': r.get('NoDrop', 0), 'group': r.get('group', 0),
            'level': r.get('level', 0), 'unique': r.get('Unique', 0), 'set': r.get('Set', 0), 'rare': r.get('Rare', 0),
            'magic': r.get('Magic', 0), 'items': items, 'order': tc_order[n],
        }.items() if v not in (0, None) or k in ('picks', 'items')}

    for r in T['misc'].values():
        if r.get('code') in misc_needed or r.get('code') in ('hp1', 'hp2', 'hp3', 'hp4', 'hp5', 'mp1', 'mp2', 'mp3', 'mp4', 'mp5',
                                                             'rvs', 'rvl', 'tsc', 'isc', 'tbk', 'ibk', 'gld', 'key', 'aqv', 'cqv',
                                                             'vps', 'yps', 'wms'):
            add_base(r, 'misc')
    for cid in classes:
        for it in classes[cid]['startItems']:
            if it['code'] not in bases:
                for tb in ('weapons', 'armor', 'misc'):
                    rr = T[tb].get(it['code'])
                    if rr:
                        add_base(rr, {'weapons': 'weapon', 'armor': 'armor', 'misc': 'misc'}[tb])
    # D2Common DATATBLS_CreateItemTypeTreasureClasses: "<type><N>" holds every spawnable non-quest item of
    # that type with N-3 < level <= N; weight = ItemTypes.Rarity of the item's own type.
    for at in sorted(auto_needed):
        m = AUTO.match(at)
        t, N = m.group(1), int(m.group(2))
        items = []
        for b in bases.values():
            if b['kind'] == 'misc' or not b['spawnable']:
                continue
            if t in b['types'] and N - 3 < b['level'] <= N:
                items.append([b['code'], max(itypes.get(b['type'], {}).get('rarity', 1), 1)])
        tcs[at] = {'picks': 1, 'items': items, 'auto': True}
    missing_misc = sorted(x for x in misc_needed if x not in bases)

    # itemratio.txt rows: LoD normal, LoD uber, LoD class-specific
    ir = {}
    for r in T['itemratio'].values():
        if r.get('Version') == 1:
            key = ('class_' if r.get('Class Specific') else '') + ('uber' if r.get('Uber') else 'normal')
            ir[key] = {k: r.get(k, 0) for k in ('Unique', 'UniqueDivisor', 'UniqueMin', 'Rare', 'RareDivisor', 'RareMin',
                                                  'Set', 'SetDivisor', 'SetMin', 'Magic', 'MagicDivisor', 'MagicMin',
                                                  'HiQuality', 'HiQualityDivisor', 'Normal', 'NormalDivisor')}

    def affixes(tbl, is_prefix):
        out = []
        for idx, r in T[tbl].items():
            if not r.get('Name') or not r.get('frequency') or not r.get('spawnable'):
                continue
            if r.get('level', 0) > AFFIX_MAX_LVL:
                continue
            mods = []
            for i in (1, 2, 3):
                if r.get('mod%dcode' % i):
                    mods.append({k: v for k, v in {'code': r['mod%dcode' % i], 'param': r.get('mod%dparam' % i),
                                                   'min': r.get('mod%dmin' % i, 0), 'max': r.get('mod%dmax' % i, 0)}.items()
                                 if v is not None})
            out.append({k: v for k, v in {
                'id': int(idx), 'name': s(r['Name']), 'level': r.get('level', 0), 'maxlevel': r.get('maxlevel', 0),
                'reqlvl': r.get('levelreq', 0), 'group': r.get('group', 0), 'freq': r['frequency'], 'rare': r.get('rare', 0),
                'itype': [r.get('itype%d' % i) for i in range(1, 8) if r.get('itype%d' % i)],
                'etype': [r.get('etype%d' % i) for i in range(1, 6) if r.get('etype%d' % i)],
                'cls': r.get('classspecific') or r.get('class'), 'mods': mods,
            }.items() if v not in (None, 0, []) or k in ('level', 'freq')})
        return out

    def unique_rows(tbl, codekey):
        out = []
        for r in T[tbl].values():
            code = r.get(codekey)
            if not code or code not in bases or r.get('lvl', 0) > UNIQUE_MAX_LVL:
                continue
            if tbl == 'UniqueItems' and r.get('disabled'):   # 1.14 had an 'enabled' flag
                continue
            props = []
            for i in range(1, 13):
                if r.get('prop%d' % i):
                    props.append({k: v for k, v in {'code': r['prop%d' % i], 'param': r.get('par%d' % i),
                                                    'min': r.get('min%d' % i, 0), 'max': r.get('max%d' % i, 0)}.items() if v is not None})
            row = {'name': s(r['index']), 'code': code, 'lvl': r.get('lvl', 0), 'reqlvl': r.get('lvl req', 0),
                   'rarity': r.get('rarity', 1), 'props': props}
            if tbl == 'SetItems':
                row['set'] = s(r.get('set'))
            out.append(row)
        return out

    rare_names = {
        'prefix': [{'name': s(r['name']), 'itype': [r.get('itype%d' % i) for i in range(1, 8) if r.get('itype%d' % i)],
                    'etype': [r.get('etype%d' % i) for i in range(1, 5) if r.get('etype%d' % i)]}
                   for r in T['RarePrefix'].values() if r.get('name')],
        'suffix': [{'name': s(r['name']), 'itype': [r.get('itype%d' % i) for i in range(1, 8) if r.get('itype%d' % i)],
                    'etype': [r.get('etype%d' % i) for i in range(1, 5) if r.get('etype%d' % i)]}
                   for r in T['RareSuffix'].values() if r.get('name')],
    }
    superior = [{'mods': [{'code': q['mod%dcode' % i], 'min': q.get('mod%dmin' % i, 0), 'max': q.get('mod%dmax' % i, 0)}
                          for i in (1, 2) if q.get('mod%dcode' % i)],
                 'for': [k for k in ('armor', 'weapon', 'shield', 'thrown', 'scepter', 'wand', 'staff', 'bow', 'boots', 'gloves', 'belt') if q.get(k)],
                 'level': q.get('level', 0)}
                for q in T['qualityitems'].values()]

    items = {
        'bases': bases, 'types': itypes, 'tcs': tcs, 'ratio': ir,
        'prefixes': affixes('MagicPrefix', True), 'suffixes': affixes('MagicSuffix', False),
        'uniques': unique_rows('UniqueItems', 'code'), 'sets': unique_rows('SetItems', 'item'),
        'rareNames': rare_names, 'superior': superior, 'lowQuality': [s(r['Name']) for r in T['lowqualityitems'].values() if r.get('Name')],
        'missingFromTables': missing_misc,
    }

    # ---------------- experience ----------------
    maxrow = T['experience'].get('MaxLvl', {})
    exp_rows = sorted((r for r in T['experience'].values() if isinstance(r.get('Level'), int)), key=lambda r: r['Level'])
    xp = [0] * 100
    ratio = [1024] * 100
    for r in exp_rows:
        L = r.get('Level', 0)
        if 0 <= L <= 99:
            xp[L] = r.get('Amazon', 0)   # identical across classes in 1.14d experience.txt
            ratio[L] = r.get('ExpRatio', 1024)
    experience = {'toNext': xp, 'ratio': ratio, 'ratioShift': maxrow.get('ExpRatio', 10),
                  'maxLevel': maxrow.get('Amazon', 99),
                  'note': 'toNext[L] = total XP to reach level L+1 (experience.txt row L). '
                          'gain = gain * ratio[clvl] >> ratioShift (D2MOO SUNITDMG_ComputeExperienceGain)'}

    # ---------------- areas ----------------
    areas = {}
    lv_by_aid = {aid: lv[lid] for lid, aid, *_ in HAND_AREAS}
    songs = {r['Index']: r.get('Song') for r in T['soundenviron'].values()}
    mazes = {r['Level']: r for r in load('lvlmaze').values() if r.get('Level')}
    for lid, aid, layout in HAND_AREAS:
        r = lv[lid]
        a = {
            'id': aid, 'd2id': lid, 'name': s(r.get('LevelName')), 'act': 1,
            'lvl': r.get('MonLvlEx', 0), 'lvlByDiff': {'n': r.get('MonLvlEx', 0), 'nm': r.get('MonLvlEx(N)', 0), 'h': r.get('MonLvlEx(H)', 0)},
            'size': [r.get('SizeX', 0), r.get('SizeY', 0)], 'sizeUnit': 'D2 tiles (5x5 subtiles each)',
            'layout': layout, 'music': songs.get(r.get('SoundEnv', 0)), 'soundEnv': r.get('SoundEnv', 0),
            'monsters': [r['mon%d' % i] for i in range(1, 26) if r.get('mon%d' % i)],
            'uniqueMonsters': [r['umon%d' % i] for i in range(1, 26) if r.get('umon%d' % i)],
            'numMon': r.get('NumMon', 0), 'density': r.get('MonDen', 0),
            'uniquePacks': [r.get('MonUMin', 0), r.get('MonUMax', 0)],
            'critters': [[r['cmon%d' % i], r.get('cpct%d' % i, 0)] for i in range(1, 5) if r.get('cmon%d' % i)],
            'town': lid == 1, 'waypoint': r.get('Waypoint', 0) != 255,   # 0 cells are dropped, and 0 is the first waypoint index
            'quest': None, 'rain': bool(r.get('Rain')),
            'inside': bool(r.get('*IsInside')), 'exits': HAND_EXITS.get(aid, []),
            'vis': [LEVEL_ID_TO_AREA.get(r['Vis%d' % i], r['Vis%d' % i]) for i in range(8) if r.get('Vis%d' % i)],
            'superuniques': [k for k, v in superuniques.items() if v['area'] == aid],
            'bosses': [k for k, v in HAND_BOSS.items() if v['area'] == aid],
        }
        areas[aid] = a
    areas['den_of_evil']['quest'] = 'den_of_evil'
    # A DrlgType 1 (maze) level has no size of its own: Levels.txt SizeX/SizeY (200x200) is a bounding box and
    # the playable cave is Rooms (lvlmaze.txt) rooms of SizeX x SizeY tiles each, laid out on a square grid.
    # Den of Evil: 1 room of 24x24 tiles.
    for a in areas.values():
        if lv_by_aid[a['id']].get('DrlgType') == 1:
            mz = mazes[a['d2id']]
            side = int(math.ceil(math.sqrt(mz.get('Rooms', 1))))
            a['playSize'] = [mz['SizeX'] * side, mz['SizeY'] * side]
            a['playSizeNote'] = ('maze: lvlmaze.txt Rooms %d of %dx%d tiles on a %dx%d grid; Levels.txt %dx%d is the DRLG bounding box'
                                 % (mz.get('Rooms', 1), mz['SizeX'], mz['SizeY'], side, side, a['size'][0], a['size'][1]))
    areas['burial_grounds']['quest'] = 'sisters_burial_grounds'
    areas['rogue_encampment']['npcs'] = list(HAND_NPCS)

    # Act 1 town NPCs and ambient town animals (monstats Id); roles/shop/quests come from HAND_NPCS
    npcs = {}
    for nid in ACT1_TOWN_NPCS:
        r = ms[nid]
        npcs[nid] = {'id': nid, 'name': s(r.get('NameStr', nid)), 'code': r['Code'], 'velocity': r.get('Velocity', 0),
                     'art': 'npc.' + r['Code'], 'monSound': r.get('MonSound')}
        npcs[nid].update(HAND_NPCS.get(nid, {}))
    # monpreset.txt: DS1 type-1 object ids index into this list, per Act
    monpreset = {'1': [r.get('Place') for r in T['monpreset'].values() if r.get('Act') == 1]}

    data.update({
        'classes': classes, 'skills': skills, 'monSkills': monskills, 'missiles': missiles,
        'monsters': monsters, 'superuniques': superuniques, 'monlvl': monlvl,
        'umod': {'names': umods, 'constants': umod_const},
        'difficulty': {k: v for k, v in list(T['difficultylevels'].values())[0].items()},
        'items': items, 'experience': experience, 'areas': areas, 'npcs': npcs, 'monpreset': monpreset, 'quests': HAND_QUESTS,
    })
    return data


HEADER = """// GENERATED by games/diablo2/_tools/build_data.py — do not edit; edit the lever and rerun:
//   PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
// Diablo II Resurrected 3.1 game data for the Act I remake.
// Sources:
//   tables  : D2R 3.1.91636 data/global/excel/*.txt (missing key = 0). Per section below: charstats,
//             skills+skilldesc, monstats+monstats2+monsounds, monlvl, superuniques, monumod, missiles,
//             levels+lvlmaze+soundenviron, monpreset, experience, treasureclassex, weapons/armor/misc, itemtypes,
//             magicprefix/suffix, rareprefix/suffix, uniqueitems, setitems, itemratio, qualityitems.
//   strings : D2R 3.1.91636 data/local/lng/strings/*.json (enUS; names only)
//   formulas: Arreat Summit http://classic.battle.net/diablo2exp/ and D2MOO https://github.com/ThePhrozenKeep/D2MOO
// Hand-entered values (outdoor exits, NPC roles, quest wiring) come from HAND_* constants in the lever and are
// listed in D2DATA.meta.hand.
"""


def main():
    data = build()
    data['meta']['hand'] = {
        'monsters[*].aiKind': 'behaviour class chosen by hand',
        'superuniques[*].area': 'placement from Arreat Summit',
        'areas[*].exits': 'outdoor links are hard-coded in the D2 outdoor DRLG; typed from the Arreat Summit Act I map',
        'npcs[*].roles/sells/quests': 'Arreat Summit Act I NPC/quest pages',
        'quests': 'Arreat Summit Act I quest pages',
    }
    js = HEADER
    # window.D2DATA in the browser; the same object on globalThis + module.exports under node
    js += ('(function (g) {\n'
           'g.D2DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + ';\n'
           "if (typeof module !== 'undefined' && module.exports) module.exports = g.D2DATA;\n"
           "})(typeof window !== 'undefined' ? window : globalThis);\n")
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    it = data['items']
    print('wrote %s (%d KB)' % (OUT, len(js.encode('utf-8')) // 1024))
    print('classes %d, skills %d, monsters %d, superuniques %d, missiles %d' % (
        len(data['classes']), len(data['skills']), len(data['monsters']), len(data['superuniques']), len(data['missiles'])))
    print('bases %d, tcs %d, prefixes %d, suffixes %d, uniques %d, sets %d' % (
        len(it['bases']), len(it['tcs']), len(it['prefixes']), len(it['suffixes']), len(it['uniques']), len(it['sets'])))
    if it['missingFromTables']:
        print('TC entries with no base row emitted:', it['missingFromTables'])
    codes = set()
    for a in it['prefixes'] + it['suffixes']:
        for m in a['mods']:
            codes.add(m['code'])
    for u in it['uniques'] + it['sets']:
        for p in u['props']:
            codes.add(p['code'])
    print('property codes used:', ' '.join(sorted(codes)))


if __name__ == '__main__':
    main()
