# -*- coding: utf-8 -*-
"""
Lever: pull Diablo II 1.14d data tables and emit games/diablo2/js/data.js (window.D2DATA).

Rerunnable:  PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
  --refresh   re-download every cached source file in _tools/src/

Sources (cached in _tools/src/):
  * blizzhackers/d2data @ e35dcd6c014b (2021-03-01, last commit before the D2R data swap; these are
    the 1.14d .txt files converted to JSON). Zero-valued cells are omitted by that converter, so a
    missing key means 0.
    https://github.com/blizzhackers/d2data/tree/e35dcd6c014b134b60f0473e3fdb212863c17f2f/json
  * English strings: d2data master localestrings-eng.json (D2R string table; names of 1.14 rows are
    identical). Used for display names only, never numbers.
  * Formulas: Arreat Summit (classic.battle.net/diablo2exp) and D2MOO, the reverse-engineered
    1.10 game code (github.com/ThePhrozenKeep/D2MOO). Each formula in rules.js cites which.

Anything typed by hand (camp layout, Flare art keys, area exits that D2 hard-codes in the DRLG,
NPC roles) lives in the HAND_* constants below and is marked in the output.
"""
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
OUT = os.path.normpath(os.path.join(HERE, '..', 'js', 'data.js'))

REF = 'e35dcd6c014b134b60f0473e3fdb212863c17f2f'
BASE_URL = 'https://raw.githubusercontent.com/blizzhackers/d2data/%s/json/' % REF
STR_URL = 'https://raw.githubusercontent.com/blizzhackers/d2data/master/json/localestrings-eng.json'

FILES = ['charstats', 'skills', 'skilldesc', 'monstats', 'monstats2', 'MonLvl', 'Levels', 'experience',
         'TreasureClassEx', 'weapons', 'armor', 'misc', 'MagicPrefix', 'MagicSuffix', 'RarePrefix',
         'RareSuffix', 'UniqueItems', 'SetItems', 'ItemTypes', 'SuperUniques', 'Missiles', 'itemratio',
         'ItemStatCost', 'Properties', 'monai', 'MonType', 'difficultylevels', 'monumod', 'npc',
         'qualityitems', 'lowqualityitems']

# Affixes up to this level are emitted. Act I normal drops never exceed alvl ~13 (Blood Raven mlvl 10,
# items with magic lvl add a few). Raise and rerun when later acts are added.
AFFIX_MAX_LVL = 15
UNIQUE_MAX_LVL = 30        # uniqueitems/setitems 'lvl' cap for emitted rows
ITEM_TIERS = ('normal',)   # base item tiers emitted ('exceptional', 'elite' for later acts)


def fetch(url, path):
    sys.stderr.write('download %s\n' % url)
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read()
    with open(path, 'wb') as f:
        f.write(data)


def load(name, refresh=False):
    path = os.path.join(SRC, name + '.json')
    if refresh or not os.path.exists(path):
        fetch(BASE_URL + name + '.json', path)
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def load_strings(refresh=False):
    path = os.path.join(SRC, 'strings-eng.json')
    if refresh or not os.path.exists(path):
        fetch(STR_URL, path)
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


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
# HAND: data D2 does not keep in its .txt files, or Flare art bindings.
# ---------------------------------------------------------------------------------------------
CLASS_IDS = [('amazon', 'ama', 'Amazon'), ('sorceress', 'sor', 'Sorceress'), ('necromancer', 'nec', 'Necromancer'),
             ('paladin', 'pal', 'Paladin'), ('barbarian', 'bar', 'Barbarian'), ('druid', 'dru', 'Druid'),
             ('assassin', 'ass', 'Assassin')]

# The D2R string table (our only English source) has two rows that differ from 1.14:
# Skillname223 reads "Werewolf" for Plague Poppy (1.14 shows "Poison Creeper"), and StrSklTabItem6
# reads "Summoning Skills" for the Paladin's first tab (1.14 shows "Combat Skills").
HAND_SKILL_NAME_FIX = {'Plague Poppy': 'Poison Creeper'}
HAND_TAB_FIX = {'StrSklTabItem6': 'Combat'}

# Potion effectiveness per class: Arreat Summit, items/potions.shtml (Minor Healing 30/45/60, Minor Mana
# 20/30/40). Hard-coded in the game, not in charstats.txt for 1.14.
HAND_POTION_PCT = {
    'amazon': (150, 150), 'sorceress': (100, 200), 'necromancer': (100, 200), 'paladin': (150, 150),
    'barbarian': (200, 100), 'druid': (100, 200), 'assassin': (150, 150)}

# Flare art for monsters (sheet keys in assets/manifest.js). artAlt = closer silhouette if the art agent
# exported it; art is always one of the keys the plan asked for.
HAND_MON_ART = {
    'zombie1': ('enemy.zombie', None, None), 'zombie2': ('enemy.zombie', 'enemy.zombie_dark', '#9db08a'),
    'fallen1': ('enemy.goblin', None, None), 'fallen2': ('enemy.goblin', None, '#c06a3a'),
    'fallenshaman1': ('enemy.goblin_elite', None, None),
    'quillrat1': ('enemy.antlion_small', None, None),
    'brute1': ('enemy.minotaur', None, None),
    'corruptrogue1': ('enemy.skeleton_archer', 'enemy.hobgoblin', None),
    'cr_lancer1': ('enemy.skeleton_archer', 'enemy.hobgoblin', '#8c7aa8'),
    'cr_archer1': ('enemy.skeleton_archer', 'enemy.hobgoblin_archer', None),
    'skeleton1': ('enemy.skeleton', None, None),
    'bloodraven': ('enemy.skeleton_archer', 'enemy.hobgoblin_archer', '#b0202a'),
}
# AI behaviour class for the engine, derived from monstats AI + skills (Arreat Summit monster pages).
HAND_AI_KIND = {
    'Zombie': 'melee_slow', 'Fallen': 'melee_flee', 'FallenShaman': 'shaman', 'QuillRat': 'ranged',
    'Brute': 'melee', 'CorruptRogue': 'melee', 'CorruptLancer': 'melee', 'CorruptArcher': 'ranged',
    'Skeleton': 'melee', 'BloodRaven': 'boss_ranged_summoner',
}
# Superunique placement and colour hint. tint is a CSS colour approximating the Utrans palette shift
# (approx: D2 colours uniques through palette index tables we do not ship).
HAND_SUPER = {
    'Corpsefire': {'id': 'corpsefire', 'area': 'den_of_evil', 'tint': '#6fb06a'},
    'Bishibosh': {'id': 'bishibosh', 'area': 'cold_plains', 'tint': '#d0a040'},
    'Rakanishu': {'id': 'rakanishu', 'area': 'stony_field', 'tint': '#5080d0'},
    'Coldcrow': {'id': 'coldcrow', 'area': 'cave_1', 'tint': '#80c0f0'},
}
# Bosses kept as monsters (monstats boss=1), with fixed placement.
HAND_BOSS = {'bloodraven': {'area': 'burial_grounds', 'quest': 'sisters_burial_grounds'}}

# Area table. Levels.txt row id -> our id. exits: Levels.txt Vis0-7 covers cave/crypt entrances; the
# outdoor-to-outdoor links (Town-Blood Moor-Cold Plains-Burial Grounds/Stony Field) are hard-coded in
# the Act I outdoor DRLG (D2Common DrlgOutdoors), so they are typed here from the Arreat Summit Act I map.
HAND_AREAS = [
    (1, 'rogue_encampment', 'preset', 'grassland', 'town'),
    (2, 'blood_moor', 'outdoor', 'grassland', 'overworld'),
    (8, 'den_of_evil', 'cave', 'cave', 'cave'),
    (3, 'cold_plains', 'outdoor', 'grassland', 'overworld'),
    (17, 'burial_grounds', 'outdoor', 'grassland', 'overworld'),
]
HAND_EXITS = {
    'rogue_encampment': [{'to': 'blood_moor', 'side': 'west'}, {'to': 'blood_moor', 'side': 'south'}],
    'blood_moor': [{'to': 'rogue_encampment', 'side': 'edge'}, {'to': 'cold_plains', 'side': 'edge'},
                   {'to': 'den_of_evil', 'side': 'cave_entrance'}],
    'den_of_evil': [{'to': 'blood_moor', 'side': 'stairs'}],
    'cold_plains': [{'to': 'blood_moor', 'side': 'edge'}, {'to': 'stony_field', 'side': 'edge', 'stub': True},
                    {'to': 'burial_grounds', 'side': 'edge'}, {'to': 'cave_1', 'side': 'cave_entrance', 'stub': True}],
    'burial_grounds': [{'to': 'cold_plains', 'side': 'edge'}, {'to': 'crypt', 'side': 'stairs', 'stub': True},
                       {'to': 'mausoleum', 'side': 'stairs', 'stub': True}],
}
LEVEL_ID_TO_AREA = {1: 'rogue_encampment', 2: 'blood_moor', 3: 'cold_plains', 4: 'stony_field', 8: 'den_of_evil',
                    9: 'cave_1', 17: 'burial_grounds', 18: 'crypt', 19: 'mausoleum'}

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
    'warriv': {'name': 'Warriv', 'title': 'Caravan leader', 'roles': ['travel'], 'spot': 'r',
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

# Flare icon hints per D2 item type (the art agent maps these to Flare loot icons).
HAND_ICON_BY_TYPE = {
    'axe': 'axe', 'taxe': 'throwing_axe', 'swor': 'sword', 'knif': 'dagger', 'tkni': 'throwing_knife',
    'mace': 'mace', 'club': 'club', 'hamm': 'hammer', 'scep': 'scepter', 'wand': 'wand', 'staf': 'staff',
    'spea': 'spear', 'pole': 'polearm', 'jave': 'javelin', 'bow': 'bow', 'xbow': 'crossbow',
    'abow': 'bow', 'aspe': 'spear', 'ajav': 'javelin', 'orb': 'orb', 'h2h': 'claw', 'h2h2': 'claw',
    'tors': 'body_armor', 'helm': 'helm', 'shie': 'shield', 'glov': 'gloves', 'boot': 'boots', 'belt': 'belt',
    'circ': 'circlet', 'pelt': 'helm', 'phlm': 'helm', 'ashd': 'shield', 'head': 'shield',
    'hpot': 'potion_red', 'mpot': 'potion_blue', 'rpot': 'potion_purple', 'spot': 'potion_white',
    'apot': 'potion_green', 'wpot': 'potion_cyan', 'scro': 'scroll', 'book': 'book', 'gold': 'gold',
    'key': 'key', 'ring': 'ring', 'amul': 'amulet', 'jewl': 'jewel', 'scha': 'charm', 'mcha': 'charm',
    'lcha': 'charm', 'gema': 'gem', 'gemt': 'gem', 'gems': 'gem', 'geme': 'gem', 'gemr': 'gem',
    'gemd': 'gem', 'gemz': 'gem', 'bowq': 'arrows', 'xboq': 'bolts', 'tpot': 'potion_throw',
}


def camp_preset():
    """
    HAND: Rogue Encampment, approximated from the Arreat Summit Act I town description and public
    maps (diablo2.diablowiki.net/Rogue_Encampment: "The waypoint ... is always located on the
    northeastern wall, straight east of the camp fire where Warriv and Kashya are, and relatively
    close northwest of Akara"). D2 has several town variants; this is one plausible arrangement, not
    a copy of the A1L1 .ds1 tiles. 56 x 40 cells to match Levels.txt SizeX/SizeY of the town.
    """
    W, H = 56, 40
    g = [['.' for _ in range(W)] for _ in range(H)]

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            g[y][x] = c

    def rect(x0, y0, x1, y1, c, fill=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if fill or x in (x0, x1) or y in (y0, y1):
                    put(x, y, c)

    # stream around the camp (outside the fence), a few trees beyond it
    rect(3, 2, 52, 37, '~')
    for (x, y) in [(1, 1), (54, 1), (1, 38), (54, 38), (0, 12), (55, 25), (20, 0), (40, 39), (2, 30), (53, 8)]:
        put(x, y, 't')
    # palisade
    rect(6, 5, 49, 34, '#')
    # west gate + bridge + exit
    for y in range(18, 22):
        put(6, y, 'G'); put(3, y, '='); put(4, y, ','); put(5, y, ',')
        put(0, y, 'E'); put(1, y, ','); put(2, y, ',')
    # south gate + bridge + exit
    for x in range(26, 30):
        put(x, 34, 'G'); put(x, 37, '='); put(x, 35, ','); put(x, 36, ',')
        put(x, 39, 'E'); put(x, 38, ',')
    # dirt paths gate -> campfire
    for x in range(7, 27):
        for y in range(19, 21):
            put(x, y, ',')
    for y in range(21, 34):
        for x in range(27, 29):
            put(x, y, ',')
    # campfire (2x2) in the middle, stash beside it
    rect(27, 18, 28, 19, 'F', True)
    put(25, 17, 'S')
    # waypoint on the north-east wall, east of the campfire
    rect(38, 9, 39, 10, 'W', True)
    # Akara's tent south-east of the waypoint, Akara at its mouth
    rect(41, 14, 43, 16, 'T', True)
    put(41, 17, 'A')
    # Charsi's forge, north-west corner
    rect(11, 8, 12, 9, 'K', True)
    put(13, 10, 'C')
    # Gheed's wagon, south-west
    rect(12, 27, 14, 28, 'w', True)
    put(16, 26, 'g')
    # Kashya near the fire (north side), Warriv by his caravan (west side)
    put(29, 15, 'k')
    rect(17, 22, 19, 23, 'v', True)
    put(21, 21, 'r')
    # crates / barrels / rogue tents as blocking deco
    for (x, y) in [(8, 6), (9, 6), (47, 6), (48, 7), (8, 33), (48, 33), (33, 30), (34, 30), (22, 12), (23, 12)]:
        put(x, y, 'x')
    rect(31, 25, 33, 27, 'T', True)   # rogue tent
    rect(20, 6, 22, 8, 'T', True)     # rogue tent
    # hero start, between fire and south gate
    put(27, 23, 'h')
    return [''.join(r) for r in g]


CAMP_LEGEND = {
    '.': 'grass (walk)', ',': 'dirt path (walk)', '~': 'stream (blocks)', '=': 'bridge (walk)',
    '#': 'wooden palisade (blocks)', 'G': 'gate opening (walk)', 'E': 'exit to Blood Moor (walk, triggers area change)',
    'F': 'campfire (blocks)', 'S': 'stash (blocks, interact)', 'W': 'waypoint (walk-on, interact)',
    'T': 'tent (blocks)', 'K': "Charsi's forge/anvil (blocks)", 'w': "Gheed's wagon (blocks)",
    'v': "Warriv's caravan (blocks)", 'x': 'crates/barrels (blocks)', 't': 'tree (blocks)',
    'A': 'Akara stands here', 'C': 'Charsi stands here', 'g': 'Gheed stands here', 'k': 'Kashya stands here',
    'r': 'Warriv stands here', 'h': 'hero spawn',
}


# Machine legend, read by js/drlg.js (the data side owns what each preset char means).
#   t: wall (blocks; fence=True -> drawn with the palisade table), tree (blocks), water (col 2),
#      floor (walkable; bg='path' = cobble tiles, bridge=True = planks over the stream), hero,
#      exit (to = area id), npc (id), object (type; block = footprint blocks; merge = every 4-connected
#      run of this char is ONE object {type,x,y,w,h} = bounding box, else one object per cell).
CAMP_LEGEND_MACHINE = {
    '.': {'t': 'floor'},
    ',': {'t': 'floor', 'bg': 'path'},
    '=': {'t': 'floor', 'bridge': True},
    'G': {'t': 'floor', 'bg': 'path'},
    '~': {'t': 'water'},
    '#': {'t': 'wall', 'fence': True},
    't': {'t': 'tree'},
    'E': {'t': 'exit', 'to': 'blood_moor'},
    'h': {'t': 'hero'},
    'T': {'t': 'object', 'type': 'tent', 'block': True, 'merge': True},
    'K': {'t': 'object', 'type': 'forge', 'block': True, 'merge': True},
    'w': {'t': 'object', 'type': 'wagon', 'block': True, 'merge': True},
    'v': {'t': 'object', 'type': 'caravan', 'block': True, 'merge': True},
    'x': {'t': 'object', 'type': 'crates', 'block': True},
    'F': {'t': 'object', 'type': 'campfire', 'block': True, 'merge': True},
    'S': {'t': 'object', 'type': 'stash', 'block': True},
    'W': {'t': 'object', 'type': 'waypoint', 'block': False, 'merge': True},
    'A': {'t': 'npc', 'id': 'akara'},
    'C': {'t': 'npc', 'id': 'charsi'},
    'g': {'t': 'npc', 'id': 'gheed'},
    'k': {'t': 'npc', 'id': 'kashya'},
    'r': {'t': 'npc', 'id': 'warriv'},
}


# ---------------------------------------------------------------------------------------------
def build(refresh=False):
    T = {n: load(n, refresh) for n in FILES}
    S = load_strings(refresh)
    s = lambda k, d=None: S.get(k, d if d is not None else k)

    data = {'meta': {
        'game': 'Diablo II: Lord of Destruction 1.14d (normal difficulty first)',
        'source': 'https://github.com/blizzhackers/d2data/tree/%s/json' % REF,
        'strings': STR_URL,
        'formulas': ['http://classic.battle.net/diablo2exp/', 'https://github.com/ThePhrozenKeep/D2MOO'],
        'note': 'Generated by games/diablo2/_tools/build_data.py. Do not edit by hand; edit the lever.',
    }}

    # ---------------- classes (charstats.txt) ----------------
    cs = T['charstats']
    skills_rows = T['skills']
    sdesc = {v['skilldesc']: v for v in T['skilldesc'].values() if v.get('skilldesc')}
    by_name = {r['skill']: r for r in skills_rows.values()}
    classes = {}
    for cid, code, cname in CLASS_IDS:
        r = cs[cname]
        tabs = []
        for i in (1, 2, 3):
            t = HAND_TAB_FIX.get(r['StrSkillTab%d' % i]) or s(r['StrSkillTab%d' % i])
            t = re.sub(r'^\+%d to ', '', t)
            t = re.sub(r' Skills.*$', '', t)
            tabs.append(t)
        start_items = []
        for i in range(1, 11):
            c = r.get('item%d' % i)
            if c and c != '0':
                start_items.append({'code': c, 'loc': r.get('item%dloc' % i) or None, 'count': r.get('item%dcount' % i, 0)})
        start_skills = [snake(r['Skill %d' % i]) for i in range(1, 11) if r.get('Skill %d' % i)]
        classes[cid] = {
            'id': cid, 'code': code, 'name': cname,
            'str': r['str'], 'dex': r['dex'], 'vit': r['vit'], 'ene': r['int'],
            'stamina': r['stamina'], 'hpadd': r['hpadd'],
            # the *Per* columns are in fourths (charstats.txt comment "The following are in fourths")
            'lifePerLvl4': r['LifePerLevel'], 'manaPerLvl4': r['ManaPerLevel'], 'stamPerLvl4': r['StaminaPerLevel'],
            'lifePerVit4': r['LifePerVitality'], 'manaPerEne4': r['ManaPerMagic'], 'stamPerVit4': r['StaminaPerVitality'],
            'statPerLvl': r['StatPerLevel'], 'manaRegenSec': r['ManaRegen'], 'toHitFactor': r['ToHitFactor'],
            'walkVel': r['WalkVelocity'], 'runVel': r['RunVelocity'], 'runDrain': r['RunDrain'],
            'blockFactor': r['BlockFactor'],
            'frames': {'walk': r.get('#walk'), 'run': r.get('#run'), 'swing': r.get('#swing'),
                       'spell': r.get('#spell'), 'gethit': r.get('#gethit'), 'bow': r.get('#bow')},
            'tabs': tabs, 'startSkills': start_skills, 'startItems': start_items,
            'startSkill': r.get('StartSkill') or None,
            'potionPct': {'hp': HAND_POTION_PCT[cid][0], 'mp': HAND_POTION_PCT[cid][1]},  # HAND (Arreat potions page)
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
                  'InTown', 'delay', 'repeat', 'weapsel', 'noammo']
    skills = {}
    internal_to_id = {}
    missiles_needed = set()
    calc_keys = [k for k in SKILL_KEYS if 'calc' in k.lower() or k.endswith('SymPerCalc') or k == 'ToHitCalc']
    for r in skills_rows.values():
        cls = code2cls.get(r.get('charclass'))
        d = sdesc.get(r.get('skilldesc'))
        if not cls or not d or not d.get('SkillPage'):
            continue
        disp = HAND_SKILL_NAME_FIX.get(r['skill']) or s(d.get('str name'), r['skill'])
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
            'id': sid, 'd2id': r['Id'], 'name': disp, 'd2name': r['skill'], 'cls': cls,
            'tab': d['SkillPage'], 'row': d['SkillRow'], 'col': d['SkillColumn'],
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
            monskills[snake(n)] = {'d2id': r['Id'], 'd2name': n, 't': pick(r, SKILL_KEYS)}
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
                'tc': [r.get('TreasureClass%d%s' % (i, suf)) for i in (1, 2, 3, 4)],
            }
        for k in ('MissA1', 'MissA2', 'MissS1', 'MissSQ'):
            if r.get(k):
                missiles_needed.add(r[k])
        art, art_alt, tint = HAND_MON_ART.get(mid, ('enemy.zombie', None, None))
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
            'd': per, 'art': art, 'artAlt': art_alt, 'tint': tint,
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
            'utrans': r.get('Utrans', 0), 'tint': h['tint'],
        }

    # monlvl.txt: LoD columns (L-*) per difficulty; index = monster level
    monlvl = {'n': [], 'nm': [], 'h': []}
    rows = sorted(T['MonLvl'].values(), key=lambda r: r.get('Level', 0))
    for r in rows:
        for suf, dk in DIFFS:
            monlvl[dk].append([r.get('L-AC' + suf, 0), r.get('L-TH' + suf, 0), r.get('L-HP' + suf, 0),
                               r.get('L-DM' + suf, 0), r.get('L-XP' + suf, 0)])

    # ---------------- missiles ----------------
    MISS_KEYS = ['Vel', 'MaxVel', 'Accel', 'Range', 'LevRange', 'Size', 'Light', 'Pierce', 'CanSlow', 'HitShift',
                 'SrcDamage', 'MinDamage', 'MaxDamage', 'MinLevDam1', 'MinLevDam2', 'MinLevDam3', 'MinLevDam4',
                 'MinLevDam5', 'MaxLevDam1', 'MaxLevDam2', 'MaxLevDam3', 'MaxLevDam4', 'MaxLevDam5', 'EType', 'EMin',
                 'MinELev1', 'MinELev2', 'MinELev3', 'MinELev4', 'MinELev5', 'Emax', 'MaxELev1', 'MaxELev2',
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
            'icon': HAND_ICON_BY_TYPE.get(r.get('type'), r.get('type')), 'iconName': snake(r.get('name', code)),
        }
        if kind == 'weapon':
            b.update({k: v for k, v in {
                'mindam': r.get('mindam', 0), 'maxdam': r.get('maxdam', 0), 'mindam2h': r.get('2handmindam', 0),
                'maxdam2h': r.get('2handmaxdam', 0), 'minmis': r.get('minmisdam', 0), 'maxmis': r.get('maxmisdam', 0),
                'twoHanded': r.get('2handed', 0), 'oneOrTwo': r.get('1or2handed', 0), 'speed': r.get('speed', 0),
                'strBonus': r.get('StrBonus', 0), 'dexBonus': r.get('DexBonus', 0), 'range': r.get('rangeadder', 0),
                'wclass': r.get('wclass'), 'wclass2h': r.get('2handedwclass'), 'dur': r.get('durability', 0),
                'sockets': r.get('gemsockets', 0), 'stack': r.get('maxstack', 0), 'throwable': 1 if 'thro' in b['types'] else 0,
                'quiver': r.get('quivered'), 'magicLvl': r.get('magic lvl', 0),
            }.items() if v not in (0, None)})
        elif kind == 'armor':
            b.update({k: v for k, v in {
                'minac': r.get('minac', 0), 'maxac': r.get('maxac', 0), 'block': r.get('block', 0),
                'speed': r.get('speed', 0), 'dur': r.get('durability', 0), 'sockets': r.get('gemsockets', 0),
                'mindam': r.get('mindam', 0), 'maxdam': r.get('maxdam', 0), 'belt': r.get('belt'),
                'magicLvl': r.get('magic lvl', 0),
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
            if tbl == 'UniqueItems' and not r.get('enabled'):
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
        'rareNames': rare_names, 'superior': superior, 'lowQuality': [x for x in T['lowqualityitems'].values()] if isinstance(T['lowqualityitems'], dict) else T['lowqualityitems'],
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
    for lid, aid, layout, tileset, music in HAND_AREAS:
        r = lv[lid]
        a = {
            'id': aid, 'd2id': lid, 'name': s(r.get('LevelName')), 'act': 1,
            'lvl': r.get('MonLvl1Ex', 0), 'lvlByDiff': {'n': r.get('MonLvl1Ex', 0), 'nm': r.get('MonLvl2Ex', 0), 'h': r.get('MonLvl3Ex', 0)},
            'size': [r.get('SizeX', 0), r.get('SizeY', 0)], 'sizeUnit': 'D2 tiles (5x5 subtiles each)',
            'layout': layout, 'tileset': tileset, 'music': music,
            'monsters': [r['mon%d' % i] for i in range(1, 11) if r.get('mon%d' % i)],
            'uniqueMonsters': [r['umon%d' % i] for i in range(1, 11) if r.get('umon%d' % i)],
            'numMon': r.get('NumMon', 0), 'density': r.get('MonDen', 0),
            'uniquePacks': [r.get('MonUMin', 0), r.get('MonUMax', 0)],
            'critters': [[r['cmon%d' % i], r.get('cpct%d' % i, 0)] for i in range(1, 5) if r.get('cmon%d' % i)],
            'town': lid == 1, 'waypoint': r.get('Waypoint', 0) != 255, 'quest': None, 'rain': bool(r.get('Rain')),
            'inside': bool(r.get('IsInside')), 'exits': HAND_EXITS.get(aid, []),
            'vis': [LEVEL_ID_TO_AREA.get(r['Vis%d' % i], r['Vis%d' % i]) for i in range(8) if r.get('Vis%d' % i)],
            'superuniques': [k for k, v in superuniques.items() if v['area'] == aid],
            'bosses': [k for k, v in HAND_BOSS.items() if v['area'] == aid],
        }
        areas[aid] = a
    areas['den_of_evil']['quest'] = 'den_of_evil'
    # approx: Levels.txt SizeX/SizeY (200x200) of a DrlgType 1 (maze) level is the DRLG bounding box, not the
    # playable cave. LvlMaze.txt row for level 8 gives Rooms 1, SizeX/SizeY 24 (per the project owner; LvlMaze is not
    # in _tools/src). We take the playable footprint as ~48x48 D2 tiles (two 24-tile maze rooms across) = 120x120 cells.
    for a in areas.values():
        if lv_by_aid[a['id']].get('DrlgType') == 1:
            a['playSize'] = [48, 48]
            a['playSizeNote'] = ('approx: Levels.txt size %dx%d is the maze DRLG bounding box, not the playable area; '
                                 'playSize is a guess from LvlMaze.txt (Rooms 1, SizeX/Y 24)' % tuple(a['size']))
    areas['burial_grounds']['quest'] = 'sisters_burial_grounds'
    areas['rogue_encampment']['preset'] = camp_preset()
    areas['rogue_encampment']['presetLegend'] = CAMP_LEGEND
    areas['rogue_encampment']['legend'] = CAMP_LEGEND_MACHINE
    areas['rogue_encampment']['presetNote'] = ('approx: hand-drawn from the Arreat Summit Act I description and public '
                                               'Rogue Encampment maps; not the original A1L1 .ds1 layout')
    areas['rogue_encampment']['npcs'] = list(HAND_NPCS.keys())

    data.update({
        'classes': classes, 'skills': skills, 'monSkills': monskills, 'missiles': missiles,
        'monsters': monsters, 'superuniques': superuniques, 'monlvl': monlvl,
        'umod': {'names': umods, 'constants': umod_const},
        'difficulty': {k: v for k, v in list(T['difficultylevels'].values())[0].items()},
        'items': items, 'experience': experience, 'areas': areas, 'npcs': HAND_NPCS, 'quests': HAND_QUESTS,
    })
    return data


HEADER = """// GENERATED by games/diablo2/_tools/build_data.py — do not edit; edit the lever and rerun:
//   PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
// Diablo II: LoD 1.14d game data for the Act I remake.
// Sources:
//   tables  : https://github.com/blizzhackers/d2data/tree/%s/json
//             (1.14d .txt files as JSON; missing key = 0). Per section below: charstats, skills+skilldesc,
//             monstats, monlvl, superuniques, monumod, missiles, levels, experience, treasureclassex,
//             weapons/armor/misc, itemtypes, magicprefix/suffix, rareprefix/suffix, uniqueitems, setitems,
//             itemratio, qualityitems.
//   strings : %s (names only)
//   formulas: Arreat Summit http://classic.battle.net/diablo2exp/ and D2MOO https://github.com/ThePhrozenKeep/D2MOO
// Hand-entered values (camp layout, Flare art keys, outdoor exits, NPC roles, quest wiring, potion class
// multipliers) come from HAND_* constants in the lever and are listed in D2DATA.meta.hand.
"""


def main():
    refresh = '--refresh' in sys.argv
    data = build(refresh)
    u = lambda *names: [BASE_URL + n + '.json' for n in names]
    data['meta']['sections'] = {
        'classes': u('charstats'), 'skills': u('skills', 'skilldesc'), 'monSkills': u('skills'), 'missiles': u('Missiles'),
        'monsters': u('monstats', 'monai'), 'superuniques': u('SuperUniques', 'monumod'), 'monlvl': u('MonLvl'),
        'umod': u('monumod'), 'difficulty': u('difficultylevels'), 'experience': u('experience'), 'areas': u('Levels'),
        'items.bases': u('weapons', 'armor', 'misc'), 'items.types': u('ItemTypes'), 'items.tcs': u('TreasureClassEx'),
        'items.ratio': u('itemratio'), 'items.prefixes': u('MagicPrefix'), 'items.suffixes': u('MagicSuffix'),
        'items.uniques': u('UniqueItems'), 'items.sets': u('SetItems'), 'items.rareNames': u('RarePrefix', 'RareSuffix'),
        'items.superior': u('qualityitems'), 'items.lowQuality': u('lowqualityitems'),
        'npcs': ['http://classic.battle.net/diablo2exp/npcs/act1.shtml'], 'quests': ['http://classic.battle.net/diablo2exp/quests/act1.shtml'],
    }
    data['meta']['hand'] = {
        'classes[*].potionPct': 'Arreat Summit items/potions.shtml (class potion multipliers are hard-coded in the game)',
        'monsters[*].art/artAlt/tint, aiKind': 'Flare sheet binding + behaviour class chosen by hand',
        'superuniques[*].area/tint': 'placement from Arreat Summit; tint approx (D2 uses palette shifts)',
        'areas[*].exits': 'outdoor links are hard-coded in the D2 outdoor DRLG; typed from the Arreat Summit Act I map',
        'areas.rogue_encampment.preset': 'approx: hand-drawn camp, see presetNote',
        'areas.rogue_encampment.legend': 'machine legend for the preset chars (drlg.js); presetLegend is the prose version',
        'npcs, quests': 'Arreat Summit Act I NPC/quest pages',
        'items.bases[*].icon': 'Flare icon hint by D2 item type',
    }
    js = HEADER % (REF, STR_URL)
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
