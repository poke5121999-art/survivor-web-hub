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
AFFIX_MAX_LVL = 99
UNIQUE_MAX_LVL = 99        # uniqueitems/setitems 'lvl' cap for emitted rows
ITEM_TIERS = ('normal', 'exceptional', 'elite')   # base item tiers emitted ('exceptional', 'elite' for later acts)

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
# Monsters not listed here get 'ranged' when monstats has a rangedtype, else 'melee'.
HAND_AI_KIND = {
    'Zombie': 'melee_slow', 'Fallen': 'melee_flee', 'FallenShaman': 'shaman', 'QuillRat': 'ranged',
    'Brute': 'melee', 'CorruptRogue': 'melee', 'CorruptLancer': 'melee', 'CorruptArcher': 'ranged',
    'Skeleton': 'melee', 'BloodRaven': 'boss_ranged_summoner',
}

# Superunique placement. superuniques.txt has no level column: D2 places them from DS1 presets
# ('monpreset.txt' Place names found in the DS1 files, scanned from tiles/**.ds1) or by theme rooms.
# Values are area ids (first one is `area`, all are `areas`). Sources: DS1 scan for the file evidence
# (e.g. jailpitspawn.ds1 = Jail Level 1, ruindarkelder.ds1 = desert ruins, mephcomp.ds1 = Durance 3),
# Arreat Summit / community wiki act pages for the rest. [ĐỀ XUẤT] where several levels fit.
_TAL = ['tal_rashas_tomb', 'tal_rashas_tomb_2', 'tal_rashas_tomb_3', 'tal_rashas_tomb_4',
        'tal_rashas_tomb_5', 'tal_rashas_tomb_6', 'tal_rashas_tomb_7']
HAND_SUPER = {
    'Corpsefire': ['den_of_evil'], 'Bishibosh': ['cold_plains'], 'Bonebreak': ['crypt'],
    'Coldcrow': ['cave_level_1'], 'Rakanishu': ['stony_field'], 'Treehead WoodFist': ['dark_wood'],
    'Griswold': ['tristram'], 'The Countess': ['tower_cellar_level_5'],
    'Pitspawn Fouldog': ['jail_level_1'], 'Flamespike the Crawler': ['outer_cloister'],
    'Boneash': ['cathedral'], 'The Smith': ['barracks'], 'The Cow King': ['the_secret_cow_level'],
    'Radament': ['sewers_level_3'], 'Bloodwitch the Wild': ['halls_of_the_dead_level_3'],
    'Fangskin': ['claw_viper_temple_level_2'], 'Beetleburst': ['far_oasis'],
    'Leatherarm': ['halls_of_the_dead_level_2'], 'Coldworm the Burrower': ['maggot_lair_level_3'],
    'Fire Eye': ['palace_cellar_level_3'], 'Dark Elder': ['lost_city'],
    'The Summoner': ['arcane_sanctuary'], 'Ancient Kaa the Soulless': _TAL,
    'Web Mage the Burning': ['spider_cavern'], 'Witch Doctor Endugu': ['flayer_dungeon_level_3'],
    'Stormtree': ['flayer_jungle'], 'Sarina the Battlemaid': ['ruined_temple'],
    'Icehawk Riftwing': ['sewers_level_2_a3'], 'Ismail Vilehand': ['travincal'],
    'Geleb Flamefinger': ['travincal'], 'Toorc Icefist': ['travincal'],
    'Bremm Sparkfist': ['durance_of_hate_level_3'], 'Wyand Voidfinger': ['durance_of_hate_level_3'],
    'Maffer Dragonhand': ['durance_of_hate_level_3'],
    'Winged Death': ['river_of_flame'], 'The Tormentor': ['plains_of_despair'],
    'Taintbreeder': ['city_of_the_damned'], 'Riftwraith the Cannibal': ['city_of_the_damned'],
    'Infector of Souls': ['the_chaos_sanctuary'], 'Lord De Seis': ['the_chaos_sanctuary'],
    'Grand Vizier of Chaos': ['the_chaos_sanctuary'], 'The Feature Creep': ['river_of_flame'],
    'Siege Boss': ['bloody_foothills'], 'Ancient Barbarian 1': ['arreat_summit'],
    'Ancient Barbarian 2': ['arreat_summit'], 'Ancient Barbarian 3': ['arreat_summit'],
    'Axe Dweller': ['crystalline_passage'], 'Bonesaw Breaker': ['glacial_trail'],
    'Dac Farren': ['bloody_foothills'], 'Megaflow Rectifier': ['bloody_foothills'],
    'Eyeback Unleashed': ['frigid_highlands'], 'Threash Socket': ['arreat_plateau'],
    'Pindleskin': ['nihlathaks_temple'], 'Snapchip Shatter': ['crystalline_passage'],
    'Anodized Elite': ['icy_cellar'], 'Vinvear Molech': ['worldstone_keep_level_1'],
    'Sharp Tooth Sayer': ['frigid_highlands'], 'Magma Torquer': ['worldstone_keep_level_3'],
    'Blaze Ripper': ['frozen_tundra'], 'Frozenstein': ['frozen_river'],
    'Nihlathak Boss': ['halls_of_vaught'], 'Baal Subject 1': ['throne_of_destruction'],
    'Baal Subject 2': ['throne_of_destruction'], 'Baal Subject 3': ['throne_of_destruction'],
    'Baal Subject 4': ['throne_of_destruction'], 'Baal Subject 5': ['throne_of_destruction'],
}
# Bosses kept as monsters (monstats boss=1), with fixed placement and the quest they end.
HAND_BOSS = {
    'bloodraven': {'area': 'burial_grounds', 'quest': 'sisters_burial_grounds'},
    'andariel': {'area': 'catacombs_level_4', 'quest': 'sisters_to_the_slaughter'},
    'duriel': {'area': 'tal_rashas_chamber', 'quest': 'the_seven_tombs'},
    'mephisto': {'area': 'durance_of_hate_level_3', 'quest': 'the_guardian'},
    'izual': {'area': 'plains_of_despair', 'quest': 'the_fallen_angel'},
    'diablo': {'area': 'the_chaos_sanctuary', 'quest': 'terrors_end'},
    'nihlathakboss': {'area': 'halls_of_vaught', 'quest': 'betrayal_of_harrogath'},
    'baalcrab': {'area': 'the_worldstone_chamber', 'quest': 'eve_of_destruction'},
}

# Outdoor-to-outdoor links (and portal links) are hard-coded in the D2 DRLG / quest scripts, so they are
# typed per act from the Arreat Summit act maps (classic.battle.net/diablo2exp/maps/actN.shtml: Act I
# Rogue Encampment-Blood Moor-Cold Plains-Stony Field-Dark Wood-Black Marsh-Tamoe Highland-Monastery
# Gate; Act II Lut Gholein-Rocky Waste-Dry Hills-Far Oasis-Lost City-Valley of Snakes-Canyon of the Magi;
# Act III Kurast Docks-Spider Forest-Great Marsh-Flayer Jungle-Lower Kurast-Kurast Bazaar-Upper Kurast-
# Kurast Causeway-Travincal; Act IV Fortress-Outer Steppes-Plains of Despair-City of the Damned-River of
# Flame; Act V Harrogath-Bloody Foothills-Frigid Highlands-Arreat Plateau). Links between levels that
# Levels.txt Vis0-7 already lists (caves, tombs, temples, towers) are derived, not typed.
# [ĐỀ XUẤT] pairs marked 'portal' are quest/key portals, not walkable edges.
HAND_LINKS = [
    # Act I
    ('rogue_encampment', 'blood_moor'), ('blood_moor', 'cold_plains'), ('cold_plains', 'stony_field'),
    ('cold_plains', 'burial_grounds'), ('stony_field', 'dark_wood'), ('dark_wood', 'black_marsh'),
    ('black_marsh', 'tamoe_highland'), ('tamoe_highland', 'monastery_gate'),
    ('stony_field', 'tristram', 'portal'), ('rogue_encampment', 'the_secret_cow_level', 'portal'),
    # Act II
    ('lut_gholein', 'rocky_waste'), ('rocky_waste', 'dry_hills'), ('dry_hills', 'far_oasis'),
    ('far_oasis', 'lost_city'), ('lost_city', 'valley_of_snakes'),
    ('valley_of_snakes', 'canyon_of_the_magi'), ('palace_cellar_level_3', 'arcane_sanctuary', 'portal'),
    ('arcane_sanctuary', 'canyon_of_the_magi', 'portal'),
    ('tal_rashas_tomb', 'tal_rashas_chamber', 'portal'), ('tal_rashas_tomb_2', 'tal_rashas_chamber', 'portal'),
    ('tal_rashas_tomb_3', 'tal_rashas_chamber', 'portal'), ('tal_rashas_tomb_4', 'tal_rashas_chamber', 'portal'),
    ('tal_rashas_tomb_5', 'tal_rashas_chamber', 'portal'), ('tal_rashas_tomb_6', 'tal_rashas_chamber', 'portal'),
    ('tal_rashas_tomb_7', 'tal_rashas_chamber', 'portal'),
    # Act III
    ('kurast_docks', 'spider_forest'), ('spider_forest', 'great_marsh'), ('great_marsh', 'flayer_jungle'),
    ('flayer_jungle', 'lower_kurast'), ('lower_kurast', 'kurast_bazaar'), ('kurast_bazaar', 'upper_kurast'),
    ('upper_kurast', 'kurast_causeway'), ('kurast_causeway', 'travincal'),
    # Act IV
    ('the_pandemonium_fortress', 'outer_steppes'), ('outer_steppes', 'plains_of_despair'),
    ('plains_of_despair', 'city_of_the_damned'), ('durance_of_hate_level_3', 'the_pandemonium_fortress', 'portal'),
    # Act V
    ('harrogath', 'bloody_foothills'), ('bloody_foothills', 'frigid_highlands'),
    ('frigid_highlands', 'arreat_plateau'), ('harrogath', 'nihlathaks_temple', 'portal'),
    ('frigid_highlands', 'abaddon', 'portal'), ('arreat_plateau', 'pit_of_acheron', 'portal'),
    ('frozen_tundra', 'infernal_pit', 'portal'), ('harrogath', 'matrons_den', 'portal'),
    ('harrogath', 'forgotten_sands', 'portal'), ('harrogath', 'furnace_of_pain', 'portal'),
    ('harrogath', 'tristram_a5', 'portal'),
]
# the camp door is drawn as two exits in Act I (west and south gates of towne1.ds1)
HAND_EXIT_SIDES = {('rogue_encampment', 'blood_moor'): ['west', 'south']}
# Act transitions (Warriv/Meshif by boat or caravan, Tyrael/Mephisto portals), Arreat Summit act pages.
HAND_ACT_TRAVEL = {
    '1': {'to': 'lut_gholein', 'npc': 'warriv1', 'needs': 'sisters_to_the_slaughter'},
    '2': {'to': 'kurast_docks', 'npc': 'meshif1', 'needs': 'the_seven_tombs'},
    '3': {'to': 'the_pandemonium_fortress', 'npc': None, 'needs': 'the_guardian',
          'via': 'durance_of_hate_level_3'},
    '4': {'to': 'harrogath', 'npc': 'tyrael2', 'needs': 'terrors_end'},
}

TOWN_AREAS = {1: 'rogue_encampment', 2: 'lut_gholein', 3: 'kurast_docks', 4: 'the_pandemonium_fortress',
              5: 'harrogath'}
AMBIENT_NPCS = ['chicken', 'rat', 'bird1', 'bird2', 'bat']   # monstats rows the town DS1s scatter around
# Town NPC roles, typed from the Arreat Summit NPC pages (classic.battle.net/diablo2exp/npcs/). Shop
# multipliers come from npc.txt, not here. The categories are coarse stock labels, not item lists.
HAND_NPCS = {
    'akara': {'name': 'Akara', 'title': 'High Priestess of the Sisters of the Sightless Eye',
              'roles': ['trade', 'heal', 'quest'], 'sells': ['potions', 'scrolls', 'staves', 'wands', 'orbs'],
              'quests': ['den_of_evil'], 'spot': 'A', 'act': 1},
    'charsi': {'name': 'Charsi', 'title': 'Blacksmith', 'roles': ['trade', 'repair', 'imbue'],
               'sells': ['weapons', 'armor'], 'quests': ['tools_of_the_trade'], 'spot': 'C', 'act': 1},
    'gheed': {'name': 'Gheed', 'title': 'Merchant', 'roles': ['trade', 'gamble'],
              'sells': ['weapons', 'armor', 'misc'], 'spot': 'g', 'act': 1},
    'kashya': {'name': 'Kashya', 'title': 'Captain of the Rogues', 'roles': ['hire'],
               'quests': ['sisters_burial_grounds'], 'spot': 'k', 'act': 1, 'hires': 1},
    'warriv1': {'name': 'Warriv', 'title': 'Caravan leader', 'roles': ['travel'], 'spot': 'r', 'act': 1,
                'travelTo': 'lut_gholein', 'travelNeeds': 'sisters_to_the_slaughter'},
    'warriv2': {'title': 'Caravan leader', 'roles': ['travel'], 'act': 2, 'travelTo': 'rogue_encampment'},
    'cain1': {'title': 'Horadrim scholar', 'roles': ['identify'], 'act': 1,
              'quests': ['the_forgotten_tower'], 'appearsAfter': 'the_search_for_cain'},
    'atma': {'title': 'Tavern keeper', 'roles': ['quest'], 'quests': ['radaments_lair'], 'act': 2},
    'drognan': {'title': 'Sorcerer', 'roles': ['trade', 'quest'],
                'sells': ['scrolls', 'staves', 'wands', 'orbs'],
                'quests': ['tainted_sun', 'arcane_sanctuary', 'the_summoner'], 'act': 2},
    'fara': {'title': 'Priestess and blacksmith', 'roles': ['trade', 'repair', 'heal'],
             'sells': ['weapons', 'armor'], 'act': 2},
    'lysander': {'title': 'Alchemist', 'roles': ['trade'], 'sells': ['potions', 'scrolls'], 'act': 2},
    'elzix': {'title': 'Tavern merchant', 'roles': ['trade', 'gamble'], 'sells': ['misc'], 'act': 2},
    'greiz': {'title': 'Desert mercenary captain', 'roles': ['hire'], 'act': 2, 'hires': 2},
    'jerhyn': {'title': 'Palace ruler', 'roles': ['quest'], 'quests': ['the_seven_tombs'], 'act': 2},
    'meshif1': {'title': 'Sailor', 'roles': ['travel'], 'act': 2, 'travelTo': 'kurast_docks',
                'travelNeeds': 'the_seven_tombs'},
    'cain2': {'title': 'Horadrim scholar', 'roles': ['identify'], 'act': 2,
              'quests': ['the_horadric_staff'], 'appearsAfter': 'the_search_for_cain'},
    'alkor': {'title': 'Alchemist', 'roles': ['trade', 'gamble', 'quest'], 'sells': ['potions', 'scrolls'],
              'quests': ['lam_esens_tome', 'the_golden_bird'], 'act': 3},
    'hratli': {'title': 'Blacksmith', 'roles': ['trade', 'repair'], 'sells': ['weapons', 'armor'], 'act': 3},
    'ormus': {'title': 'Sorcerer', 'roles': ['trade', 'heal', 'quest'],
              'sells': ['potions', 'scrolls', 'staves', 'wands', 'orbs'],
              'quests': ['the_blackened_temple', 'the_guardian'], 'act': 3},
    'asheara': {'title': 'Iron Wolves captain', 'roles': ['trade', 'hire', 'quest'],
                'sells': ['weapons', 'armor'], 'quests': ['blade_of_the_old_religion'], 'act': 3, 'hires': 3},
    'meshif2': {'title': 'Sailor', 'roles': ['travel'], 'act': 3, 'travelTo': 'lut_gholein'},
    'cain3': {'title': 'Horadrim scholar', 'roles': ['identify'], 'act': 3,
              'quests': ['khalims_will'], 'appearsAfter': 'the_search_for_cain'},
    'tyrael2': {'title': 'Archangel of Justice', 'roles': ['quest', 'travel'],
                'quests': ['the_fallen_angel', 'terrors_end'], 'act': 4, 'travelTo': 'harrogath',
                'travelNeeds': 'terrors_end'},
    'jamella': {'title': 'Alchemist', 'roles': ['trade', 'gamble', 'heal'], 'sells': ['potions', 'scrolls'],
                'act': 4},
    'halbu': {'title': 'Blacksmith', 'roles': ['trade', 'repair'], 'sells': ['weapons', 'armor'], 'act': 4},
    'cain4': {'title': 'Horadrim scholar', 'roles': ['identify'], 'act': 4, 'quests': ['hells_forge'],
              'appearsAfter': 'the_search_for_cain'},
    'larzuk': {'title': 'Blacksmith', 'roles': ['trade', 'repair', 'socket', 'quest'],
               'sells': ['weapons', 'armor'], 'quests': ['siege_on_harrogath'], 'act': 5},
    'drehya': {'title': 'Anya, alchemist', 'roles': ['trade', 'gamble', 'quest', 'personalize'],
               'sells': ['potions', 'scrolls'], 'quests': ['betrayal_of_harrogath'], 'act': 5},
    'malah': {'title': 'Healer', 'roles': ['trade', 'heal', 'quest'], 'sells': ['potions', 'scrolls'],
              'quests': ['prison_of_ice'], 'act': 5},
    'nihlathak': {'title': 'Elder of Harrogath', 'roles': ['trade'], 'sells': ['misc'], 'act': 5},
    'qual-kehk': {'title': 'Barbarian commander', 'roles': ['hire', 'quest'],
                  'quests': ['rescue_on_mount_arreat', 'rite_of_passage'], 'act': 5, 'hires': 5},
    'tyrael3': {'title': 'Archangel of Justice', 'roles': ['quest'], 'quests': ['eve_of_destruction'],
                'act': 5},
    'cain6': {'title': 'Horadrim scholar', 'roles': ['identify'], 'act': 5,
              'appearsAfter': 'the_search_for_cain'},
}

# Quests: names from quests.json (qstsa<act>q<n>); rewards per Arreat Summit quest pages. Each act's
# quests are listed in log order. Keys of `reward`: skillPts, statPts, resistPct (all resists),
# lifeBonus (permanent max life), imbue, socket (Larzuk), personalize, mercenary, actAccess,
# respec (1.13+ Den of Evil also grants one free respec per difficulty).
# Giver of the_forgotten_tower and the_golden_bird is the NPC the strings name first; [ĐỀ XUẤT].
HAND_QUESTS = {
    'den_of_evil': {'act': 1, 'n': 1, 'giver': 'akara', 'area': 'den_of_evil',
                    'goal': {'type': 'clear_area', 'area': 'den_of_evil'},
                    'reward': {'skillPts': 1, 'respec': True}, 'turnIn': 'akara'},
    'sisters_burial_grounds': {'act': 1, 'n': 2, 'giver': 'kashya', 'area': 'burial_grounds',
                               'goal': {'type': 'kill', 'monster': 'bloodraven'},
                               'reward': {'mercenary': 'free'}, 'turnIn': 'kashya'},
    'tools_of_the_trade': {'act': 1, 'n': 3, 'giver': 'charsi', 'area': 'barracks',
                           'goal': {'type': 'kill', 'superunique': 'the_smith', 'item': 'Horadric Malus'},
                           'reward': {'imbue': 1}, 'turnIn': 'charsi'},
    'the_search_for_cain': {'act': 1, 'n': 4, 'giver': 'akara', 'area': 'tristram',
                            'goal': {'type': 'rescue', 'npc': 'cain1', 'area': 'tristram'},
                            'reward': {}, 'turnIn': 'akara'},
    'the_forgotten_tower': {'act': 1, 'n': 5, 'giver': 'cain1', 'area': 'tower_cellar_level_5',
                            'goal': {'type': 'kill', 'superunique': 'the_countess'},
                            'reward': {}, 'turnIn': None},
    'sisters_to_the_slaughter': {'act': 1, 'n': 6, 'giver': 'kashya', 'area': 'catacombs_level_4',
                                 'goal': {'type': 'kill', 'monster': 'andariel'},
                                 'reward': {'actAccess': 2}, 'turnIn': 'warriv1'},
    'radaments_lair': {'act': 2, 'n': 1, 'giver': 'atma', 'area': 'sewers_level_3',
                       'goal': {'type': 'kill', 'superunique': 'radament'},
                       'reward': {'skillPts': 1}, 'turnIn': 'atma'},
    'the_horadric_staff': {'act': 2, 'n': 2, 'giver': 'cain2', 'area': 'halls_of_the_dead_level_3',
                           'goal': {'type': 'collect', 'items': ['Horadric Cube', 'Shaft of the Horadric Staff',
                                                                'Top of the Horadric Staff']},
                           'reward': {}, 'turnIn': 'cain2'},
    'tainted_sun': {'act': 2, 'n': 3, 'giver': 'drognan', 'area': 'claw_viper_temple_level_2',
                    'goal': {'type': 'destroy', 'object': 'Serpent Altar'},
                    'reward': {}, 'turnIn': None},
    'arcane_sanctuary': {'act': 2, 'n': 4, 'giver': 'drognan', 'area': 'arcane_sanctuary',
                         'goal': {'type': 'reach', 'area': 'arcane_sanctuary'},
                         'reward': {}, 'turnIn': None},
    'the_summoner': {'act': 2, 'n': 5, 'giver': 'drognan', 'area': 'arcane_sanctuary',
                     'goal': {'type': 'kill', 'superunique': 'the_summoner'},
                     'reward': {}, 'turnIn': None},
    'the_seven_tombs': {'act': 2, 'n': 6, 'giver': 'cain2', 'area': 'tal_rashas_chamber',
                        'goal': {'type': 'kill', 'monster': 'duriel'},
                        'reward': {'actAccess': 3}, 'turnIn': 'jerhyn'},
    'lam_esens_tome': {'act': 3, 'n': 1, 'giver': 'alkor', 'area': 'ruined_temple',
                       'goal': {'type': 'collect', 'items': ["Lam Esen's Tome"]},
                       'reward': {'statPts': 5}, 'turnIn': 'alkor'},
    'khalims_will': {'act': 3, 'n': 2, 'giver': 'cain3', 'area': 'travincal',
                     'goal': {'type': 'collect', 'items': ["Khalim's Eye", "Khalim's Brain", "Khalim's Heart",
                                                          "Khalim's Flail"]},
                     'reward': {}, 'turnIn': None},
    'blade_of_the_old_religion': {'act': 3, 'n': 3, 'giver': 'asheara', 'area': 'flayer_jungle',
                                  'goal': {'type': 'collect', 'items': ['The Gidbinn']},
                                  'reward': {'mercenary': 'act3'}, 'turnIn': 'ormus'},
    'the_golden_bird': {'act': 3, 'n': 4, 'giver': 'cain3', 'area': 'flayer_dungeon_level_3',
                        'goal': {'type': 'collect', 'items': ['A Jade Figurine', 'The Golden Bird']},
                        'reward': {'lifeBonus': 20}, 'turnIn': 'alkor'},
    'the_blackened_temple': {'act': 3, 'n': 5, 'giver': 'ormus', 'area': 'travincal',
                             'goal': {'type': 'kill', 'superuniques': ['ismail_vilehand', 'geleb_flamefinger',
                                                                      'toorc_icefist']},
                             'reward': {}, 'turnIn': None},
    'the_guardian': {'act': 3, 'n': 6, 'giver': 'ormus', 'area': 'durance_of_hate_level_3',
                     'goal': {'type': 'kill', 'monster': 'mephisto'},
                     'reward': {'actAccess': 4}, 'turnIn': None},
    'the_fallen_angel': {'act': 4, 'n': 1, 'giver': 'tyrael2', 'area': 'plains_of_despair',
                         'goal': {'type': 'kill', 'monster': 'izual'},
                         'reward': {'skillPts': 2}, 'turnIn': 'tyrael2'},
    'terrors_end': {'act': 4, 'n': 2, 'giver': 'tyrael2', 'area': 'the_chaos_sanctuary',
                    'goal': {'type': 'kill', 'monster': 'diablo'},
                    'reward': {'actAccess': 5}, 'turnIn': 'tyrael2'},
    'hells_forge': {'act': 4, 'n': 3, 'giver': 'cain4', 'area': 'river_of_flame',
                    'goal': {'type': 'destroy', 'object': "Mephisto's Soulstone"},
                    'reward': {}, 'turnIn': None},
    'siege_on_harrogath': {'act': 5, 'n': 1, 'giver': 'larzuk', 'area': 'bloody_foothills',
                           'goal': {'type': 'kill', 'superunique': 'siege_boss'},
                           'reward': {'socket': 1}, 'turnIn': 'larzuk'},
    'rescue_on_mount_arreat': {'act': 5, 'n': 2, 'giver': 'qual-kehk', 'area': 'frigid_highlands',
                               'goal': {'type': 'rescue', 'count': 6},
                               'reward': {'mercenary': 'act5'}, 'turnIn': 'qual-kehk'},
    'prison_of_ice': {'act': 5, 'n': 3, 'giver': 'malah', 'area': 'frozen_river',
                      'goal': {'type': 'rescue', 'npc': 'drehya', 'area': 'frozen_river'},
                      'reward': {'resistPct': 10}, 'turnIn': 'malah'},
    'betrayal_of_harrogath': {'act': 5, 'n': 4, 'giver': 'drehya', 'area': 'halls_of_vaught',
                              'goal': {'type': 'kill', 'monster': 'nihlathakboss'},
                              'reward': {'personalize': 1}, 'turnIn': 'drehya'},
    'rite_of_passage': {'act': 5, 'n': 5, 'giver': 'qual-kehk', 'area': 'arreat_summit',
                        'goal': {'type': 'kill', 'superuniques': ['ancient_barbarian_1', 'ancient_barbarian_2',
                                                                 'ancient_barbarian_3']},
                        'reward': {'actAccess': 'worldstone_keep_level_1'}, 'turnIn': 'qual-kehk'},
    'eve_of_destruction': {'act': 5, 'n': 6, 'giver': 'tyrael3', 'area': 'the_worldstone_chamber',
                           'goal': {'type': 'kill', 'monster': 'baalcrab'},
                           'reward': {'unlockDifficulty': True}, 'turnIn': None},
}

# ---------------------------------------------------------------------------------------------
FILES = {  # table -> row key column (None = row index); see load()
    'charstats': 'class', 'skills': None, 'skilldesc': None, 'monstats': None, 'MonLvl': None, 'Levels': None,
    'experience': 'Level', 'TreasureClassEx': 'Treasure Class', 'weapons': 'code', 'armor': 'code', 'misc': 'code',
    'MagicPrefix': None, 'MagicSuffix': None, 'RarePrefix': None, 'RareSuffix': None, 'UniqueItems': None,
    'SetItems': None, 'ItemTypes': 'Code', 'SuperUniques': None, 'Missiles': None, 'itemratio': None,
    'monumod': None, 'qualityitems': None, 'lowqualityitems': None, 'difficultylevels': 'Name',
    'monstats2': 'Id', 'monsounds': 'Id', 'monpreset': None, 'playerclass': 'Player Class', 'plrtype': 'Name', 'soundenviron': 'Index',
    'lvltypes': 'Id', 'hireling': None, 'npc': 'npc', 'gems': None, 'sets': None, 'automagic': None,
    'gamble': None, 'runes': None,
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
    # ---------------- area ids (Levels.txt, every row) ----------------
    lv = {r['Id']: r for r in T['Levels'].values() if 'Id' in r}   # row 0 'Null' has no Id
    aid_of, aid_ids, seen_acts = {}, set(), {}
    for lid in sorted(lv):
        r = lv[lid]
        act = r.get('Act', 0) + 1                       # Act column: 0 (omitted) .. 4
        base = snake(s(r['LevelName']))
        per = seen_acts.setdefault(base, {})
        if not per:
            cand = base
        elif act not in per:
            cand = '%s_a%d' % (base, act)
        else:
            if act == min(per):
                cand = '%s_%d' % (base, per[act] + 1)
            else:
                cand = '%s_a%d_%d' % (base, act, per[act] + 1)
        per[act] = per.get(act, 0) + 1
        assert cand not in aid_ids, cand
        aid_ids.add(cand)
        aid_of[lid] = cand
    A = aid_ids

    def need_area(a, what):
        assert a in A, '%s names unknown area %s' % (what, a)
        return a
    for k, v in HAND_SUPER.items():
        for a in v:
            need_area(a, 'HAND_SUPER ' + k)
    for k, v in HAND_BOSS.items():
        need_area(v['area'], 'HAND_BOSS ' + k)
    for k, v in HAND_QUESTS.items():
        need_area(v['area'], 'HAND_QUESTS ' + k)
    for ln in HAND_LINKS:
        need_area(ln[0], 'HAND_LINKS')
        need_area(ln[1], 'HAND_LINKS')

    # ---------------- monsters ----------------
    ms = {r['Id']: r for r in T['monstats'].values()}
    mon_ids = set()
    missing_mon = set()
    for r in lv.values():
        for i in range(1, 26):
            for pre in ('mon', 'nmon', 'umon'):
                m = r.get('%s%d' % (pre, i))
                if m:
                    (mon_ids if m in ms else missing_mon).add(m)
    for bid in HAND_BOSS:
        mon_ids.add(bid)
    sup_rows = {}
    for r in T['SuperUniques'].values():
        if r.get('Superunique') in HAND_SUPER:
            sup_rows[r['Superunique']] = r
            mon_ids.add(r['Class'])
    unplaced_su = [r.get('Superunique') for r in T['SuperUniques'].values()
                   if r.get('Superunique') and r.get('Superunique') not in HAND_SUPER]
    # minions / spawns
    for mid in list(mon_ids):
        for k in ('minion1', 'minion2', 'spawn'):
            if ms[mid].get(k) and ms[mid][k] in ms:
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
        m2 = T['monstats2'].get(mid, {})
        ai = r.get('AI')
        monsters[mid] = {
            'id': mid, 'name': s(r.get('NameStr', mid)), 'base': r.get('BaseId'), 'type': r.get('MonType'),
            'ai': ai, 'aiKind': HAND_AI_KIND.get(ai, 'ranged' if r.get('rangedtype') else 'melee'),
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
            'd': per, 'code': str(r['Code']), 'art': 'mon.' + str(r['Code']).upper(), 'baseW': m2.get('BaseW'),
            'Velocity': r.get('Velocity', 0), 'Run': r.get('Run', 0),
        }
        if mid in HAND_BOSS:
            monsters[mid].update(HAND_BOSS[mid])
        for k in ('MissA1', 'MissA2', 'MissS1', 'MissSQ'):
            if r.get(k):
                missiles_needed.add(r[k])

    # monster skills (skills.txt rows named by monstats Skill1-8); missile/elemental numbers live in missiles.txt
    mon_skill_names = {'ShamanFire', 'Resurrect', 'Nest', 'Quick Strike', 'SkeletonRaise'}
    for mid in mon_ids:
        for i in range(1, 9):
            if ms[mid].get('Skill%d' % i):
                mon_skill_names.add(ms[mid]['Skill%d' % i])
    monskills = {}
    for n in sorted(mon_skill_names):
        r = by_name.get(n)
        if r:
            monskills[snake(n)] = {'d2id': r['*Id'], 'd2name': n, 't': pick(r, SKILL_KEYS)}
            for k in ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec'):
                if r.get(k):
                    missiles_needed.add(r[k])

    mu = T['monumod']
    umods = {int(k): v.get('uniquemod') for k, v in mu.items() if v.get('uniquemod')}
    umod_const = [mu[str(i)].get('constants', 0) if str(i) in mu else 0 for i in range(0, max(int(k) for k in mu) + 1)]
    superuniques = {}
    for name, r in sup_rows.items():
        sid = snake(name)
        superuniques[sid] = {
            'id': sid, 'name': s(r['Name'], name), 'cls': r['Class'], 'area': HAND_SUPER[name][0],
            'areas': HAND_SUPER[name], 'hcIdx': r.get('hcIdx', 0),
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
            # 3.1 renamed MaxSock1/25/40 to MaxSockets1-3 + MaxSocketsLevelThreshold1-2 (item level cut-offs)
            'maxSock': [r.get('MaxSockets1', 0), r.get('MaxSockets2', 0), r.get('MaxSockets3', 0)],
            'sockLvl': [r.get('MaxSocketsLevelThreshold1', 0), r.get('MaxSocketsLevelThreshold2', 0)],
            'tc': r.get('TreasureClass', 0),
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
            'spawnable': r.get('spawnable', 0), 'rarity': r.get('rarity', 0), 'quest': r.get('quest', 0),
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

    # every weapon/armor row (all three tiers, quest items included; 'spawnable' and 'quest' tell them apart)
    for r in T['weapons'].values():
        if r.get('code') and tier_of(r) in ITEM_TIERS:
            add_base(r, 'weapon')
    for r in T['armor'].values():
        if r.get('code') and tier_of(r) in ITEM_TIERS:
            add_base(r, 'armor')

    # every treasure class of the table (all acts and difficulties: monster, champion, unique, quest, chest)
    tcx = T['TreasureClassEx']
    tc_order = {name: i for i, name in enumerate(tcx.keys())}
    roots = set(tcx.keys())
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
        if r.get('code'):   # potions, scrolls, keys, gems, runes, charms, jewels, quest items: every misc row
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

    def mods_of(r, fmt, n):
        out = []
        for i in range(1, n + 1):
            c = r.get(fmt % ('Code', i))
            if c:
                out.append({k: v for k, v in {'code': c, 'param': r.get(fmt % ('Param', i)),
                                              'min': r.get(fmt % ('Min', i), 0), 'max': r.get(fmt % ('Max', i), 0)}.items()
                            if v is not None})
        return out

    runewords = []
    for r in T['runes'].values():
        if not r.get('Name') or not r.get('Rune1'):
            continue
        rname = r.get('*Rune Name') or s(r['Name'])
        runewords.append({k: v for k, v in {
            'id': snake(rname), 'key': r['Name'], 'name': rname, 'complete': r.get('complete', 0),
            'runes': [r['Rune%d' % i] for i in range(1, 7) if r.get('Rune%d' % i)],
            'itype': [r['itype%d' % i] for i in range(1, 7) if r.get('itype%d' % i)],
            'etype': [r['etype%d' % i] for i in range(1, 4) if r.get('etype%d' % i)],
            'mods': mods_of(r, 'T1%s%d', 7), 'patch': r.get('*Patch Release'),
            'ladderFrom': r.get('firstLadderSeason'), 'ladderTo': r.get('lastLadderSeason'),
        }.items() if v not in (None, [], '')})
    gem_rows = {}
    for r in T['gems'].values():
        if not r.get('code'):
            continue
        gem_rows[r['code']] = {k: v for k, v in {
            'code': r['code'], 'name': r.get('name'), 'letter': r.get('letter'), 'transform': r.get('transform', 0),
            'weapon': [{k2: v2 for k2, v2 in {'code': r['weaponMod%dCode' % i], 'param': r.get('weaponMod%dParam' % i),
                                              'min': r.get('weaponMod%dMin' % i, 0), 'max': r.get('weaponMod%dMax' % i, 0)}.items()
                        if v2 is not None} for i in (1, 2, 3) if r.get('weaponMod%dCode' % i)],
            'helm': [{k2: v2 for k2, v2 in {'code': r['helmMod%dCode' % i], 'param': r.get('helmMod%dParam' % i),
                                            'min': r.get('helmMod%dMin' % i, 0), 'max': r.get('helmMod%dMax' % i, 0)}.items()
                      if v2 is not None} for i in (1, 2, 3) if r.get('helmMod%dCode' % i)],
            'shield': [{k2: v2 for k2, v2 in {'code': r['shieldMod%dCode' % i], 'param': r.get('shieldMod%dParam' % i),
                                              'min': r.get('shieldMod%dMin' % i, 0), 'max': r.get('shieldMod%dMax' % i, 0)}.items()
                        if v2 is not None} for i in (1, 2, 3) if r.get('shieldMod%dCode' % i)],
        }.items() if v not in (None, [], 0, '') or k == 'code'}
    set_bonuses = {}
    for r in T['sets'].values():
        if not r.get('index'):
            continue
        partial = []
        for n in (2, 3, 4, 5):
            for ab in ('a', 'b'):
                c = r.get('PCode%d%s' % (n, ab))
                if c:
                    partial.append({k: v for k, v in {'pieces': n, 'code': c, 'param': r.get('PParam%d%s' % (n, ab)),
                                                      'min': r.get('PMin%d%s' % (n, ab), 0),
                                                      'max': r.get('PMax%d%s' % (n, ab), 0)}.items() if v is not None})
        full = [{k: v for k, v in {'code': r['FCode%d' % i], 'param': r.get('FParam%d' % i),
                                   'min': r.get('FMin%d' % i, 0), 'max': r.get('FMax%d' % i, 0)}.items() if v is not None}
                for i in range(1, 9) if r.get('FCode%d' % i)]
        set_bonuses[s(r['name'])] = {'name': s(r['name']), 'partial': partial, 'full': full}

    items = {
        'runewords': runewords, 'gems': gem_rows, 'setBonuses': set_bonuses,
        'automagic': affixes('automagic', True), 'gamble': [r['code'] for r in T['gamble'].values() if r.get('code')],
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
    songs = {r['Index']: r.get('Song') for r in T['soundenviron'].values()}
    mazes = {r['Level']: r for r in load('lvlmaze').values() if r.get('Level')}
    ltype = {k: v.get('Name') for k, v in T['lvltypes'].items()}
    LAYOUT = {1: 'cave', 2: 'preset', 3: 'outdoor'}   # DrlgType: 1 maze, 2 preset, 3 outdoor
    town_ids = set(TOWN_AREAS.values())
    act_of = {aid_of[lid]: r.get('Act', 0) + 1 for lid, r in lv.items()}

    def mlist(r, pre):
        return [r['%s%d' % (pre, i)] for i in range(1, 26) if r.get('%s%d' % (pre, i)) and r['%s%d' % (pre, i)] in ms]
    for lid in sorted(lv):
        r = lv[lid]
        aid = aid_of[lid]
        act = act_of[aid]
        nm = mlist(r, 'nmon')
        wp_raw = r.get('Waypoint', 0)   # 0 cells are dropped, and 0 is the first waypoint index (the camp)
        slots = [r.get('Vis%d' % i) for i in range(8)]
        vis = []
        warp = []
        for i, v in enumerate(slots):
            if v and v in aid_of and act_of[aid_of[v]] == act:   # a few rows copy a Vis from another act (Matron's Den)
                if aid_of[v] not in vis:
                    vis.append(aid_of[v])
                w = r.get('Warp%d' % i, 0)
                warp.append({'slot': i, 'to': aid_of[v], 'warp': w})
        a = {
            'id': aid, 'd2id': lid, 'name': s(r.get('LevelName')), 'act': act,
            'drlg': r.get('DrlgType', 0), 'levelType': ltype.get(r.get('LevelType')), 'levelTypeId': r.get('LevelType', 0),
            'lvl': r.get('MonLvlEx', 0), 'lvlByDiff': {'n': r.get('MonLvlEx', 0), 'nm': r.get('MonLvlEx(N)', 0), 'h': r.get('MonLvlEx(H)', 0)},
            'size': [r.get('SizeX', 0), r.get('SizeY', 0)], 'sizeUnit': 'D2 tiles (5x5 subtiles each)',
            'sizeByDiff': {'n': [r.get('SizeX', 0), r.get('SizeY', 0)], 'nm': [r.get('SizeX(N)', 0), r.get('SizeY(N)', 0)],
                           'h': [r.get('SizeX(H)', 0), r.get('SizeY(H)', 0)]},
            'layout': LAYOUT.get(r.get('DrlgType', 0), 'preset'), 'music': songs.get(r.get('SoundEnv', 0)),
            'soundEnv': r.get('SoundEnv', 0),
            # Normal uses mon1-25, Nightmare and Hell use nmon1-25 (Levels.txt); umon applies to every difficulty
            'monsters': mlist(r, 'mon'), 'monstersByDiff': {'n': mlist(r, 'mon'), 'nm': nm, 'h': nm},
            'uniqueMonsters': mlist(r, 'umon'),
            'numMon': r.get('NumMon', 0), 'density': r.get('MonDen', 0),
            'densityByDiff': {'n': r.get('MonDen', 0), 'nm': r.get('MonDen(N)', 0), 'h': r.get('MonDen(H)', 0)},
            'uniquePacks': [r.get('MonUMin', 0), r.get('MonUMax', 0)],
            'uniquePacksByDiff': {'n': [r.get('MonUMin', 0), r.get('MonUMax', 0)],
                                  'nm': [r.get('MonUMin(N)', 0), r.get('MonUMax(N)', 0)],
                                  'h': [r.get('MonUMin(H)', 0), r.get('MonUMax(H)', 0)]},
            'critters': [[r['cmon%d' % i], r.get('cpct%d' % i, 0)] for i in range(1, 5) if r.get('cmon%d' % i)],
            'town': aid in town_ids, 'waypoint': wp_raw != 255, 'waypointId': wp_raw if wp_raw != 255 else None,
            'quest': None, 'quests': [], 'rain': bool(r.get('Rain')), 'noTownPortal': bool(r.get('PreventTownPortal')),
            'inside': bool(r.get('*IsInside')), 'exits': [],
            'vis': vis, 'visSlots': [aid_of.get(v) if v in aid_of else None for v in slots], 'warp': warp,
            'links': [],
            'superuniques': [k for k, v in superuniques.items() if aid in v['areas']],
            'bosses': [k for k, v in HAND_BOSS.items() if v['area'] == aid],
        }
        # A DrlgType 1 (maze) level has no size of its own: Levels.txt SizeX/SizeY (200x200) is a bounding box and
        # the playable cave is Rooms (lvlmaze.txt) rooms of SizeX x SizeY tiles each, laid out on a square grid.
        # Den of Evil: 1 room of 24x24 tiles.
        mz = mazes.get(lid)
        if r.get('DrlgType') == 1 and mz:
            side = int(math.ceil(math.sqrt(mz.get('Rooms', 1))))
            a['playSize'] = [mz['SizeX'] * side, mz['SizeY'] * side]
            a['playSizeNote'] = ('maze: lvlmaze.txt Rooms %d of %dx%d tiles on a %dx%d grid; Levels.txt %dx%d is the DRLG bounding box'
                                 % (mz.get('Rooms', 1), mz['SizeX'], mz['SizeY'], side, side, a['size'][0], a['size'][1]))
        areas[aid] = a
    # links: Levels.txt Vis (same act), made symmetric, plus the typed outdoor/portal links
    edges = {}
    for aid, a in areas.items():
        for t in a['vis']:
            edges.setdefault(tuple(sorted((aid, t))), 'vis')
    for ln in HAND_LINKS:
        edges[tuple(sorted(ln[:2]))] = ln[2] if len(ln) > 2 else 'walk'
    for (x, y), kind in edges.items():
        areas[x]['links'].append(y)
        areas[y]['links'].append(x)
    for a in areas.values():
        a['links'] = sorted(set(a['links']), key=lambda k: areas[k]['d2id'])
        if not a['links']:
            a['unused'] = True   # Levels.txt row that no level, vis or portal reaches (Colossal Summit)

    def exit_side(frm, to, kind):
        if kind == 'portal':
            return 'portal'
        f, t = areas[frm], areas[to]
        if f['drlg'] == 3 and t['drlg'] != 3 or f['town'] and not t['town'] and t['drlg'] != 3:
            return 'cave_entrance' if t['inside'] else 'edge'
        if f['inside']:
            return 'stairs'
        return 'edge'
    for aid, a in areas.items():
        for t in a['links']:
            kind = edges[tuple(sorted((aid, t)))]
            for side in HAND_EXIT_SIDES.get((aid, t), HAND_EXIT_SIDES.get((t, aid), [exit_side(aid, t, kind)])):
                a['exits'].append({'to': t, 'side': side})
    # quests per area; `quest` keeps the first (old single-quest field)
    for qid, q in HAND_QUESTS.items():
        areas[q['area']]['quests'].append(qid)
    for a in areas.values():
        a['quest'] = a['quests'][0] if a['quests'] else None
    for aid, a in areas.items():
        if a['town']:
            a['npcs'] = [k for k, v in HAND_NPCS.items() if v.get('act') == a['act'] and not v.get('appearsAfter')]
            a['npcsLater'] = [k for k, v in HAND_NPCS.items() if v.get('act') == a['act'] and v.get('appearsAfter')]

    # Town NPCs and ambient town animals (monstats Id); roles/shop/quests come from HAND_NPCS, shop
    # multipliers from npc.txt (buy/sell/rep mult are /1024 style fixed-point per npc.txt)
    mon_preset = {}
    for r in T['monpreset'].values():
        mon_preset.setdefault(r.get('Act'), []).append(r.get('Place'))
    npc_ids = []
    for act in range(1, 6):
        for place in mon_preset.get(act, []):
            if place in ms and ms[place].get('npc') and place not in npc_ids and not place.startswith('ancientstatue'):
                npc_ids.append(place)
    for nid in AMBIENT_NPCS:
        if nid not in npc_ids:
            npc_ids.append(nid)
    for nid in HAND_NPCS:
        assert nid in npc_ids, nid + ' is not a town npc of monpreset.txt'
    shops = T['npc']
    npcs = {}
    for nid in npc_ids:
        r = ms[nid]
        npcs[nid] = {'id': nid, 'name': s(r.get('NameStr', nid)), 'code': str(r['Code']), 'velocity': r.get('Velocity', 0),
                     'art': 'npc.' + str(r['Code']), 'monSound': r.get('MonSound')}
        sh = shops.get(nid)
        if sh:
            npcs[nid]['shop'] = {'buyMult': sh.get('buy mult', 0), 'sellMult': sh.get('sell mult', 0),
                                 'repMult': sh.get('rep mult', 0),
                                 'maxBuy': {'n': sh.get('max buy', 0), 'nm': sh.get('max buy (N)', 0),
                                            'h': sh.get('max buy (H)', 0)}}
        npcs[nid].update(HAND_NPCS.get(nid, {}))
        if 'act' not in npcs[nid]:
            npcs[nid]['act'] = next((a for a in range(1, 6) if nid in mon_preset.get(a, [])), 1)
    # monpreset.txt: DS1 type-1 object ids index into this list, per Act
    monpreset = {str(a): list(mon_preset.get(a, [])) for a in range(1, 6)}

    # ---------------- mercenaries (hireling.txt: one row per type, difficulty and level) ----------------
    HIRE_KEYS = {
        'Hireling': 'name', '*SubType': 'sub', 'Version': 'version', 'Id': 'id', 'Class': 'cls', 'Act': 'act', 'Difficulty': 'diff',
        'Level': 'level', 'Seller': 'seller', 'Gold': 'gold', 'Exp/Lvl': 'expPerLvl', 'HP': 'hp', 'HP/Lvl': 'hpPerLvl',
        'Defense': 'def', 'Def/Lvl': 'defPerLvl', 'Str': 'str', 'Str/Lvl': 'strPerLvl', 'Dex': 'dex',
        'Dex/Lvl': 'dexPerLvl', 'AR': 'ar', 'AR/Lvl': 'arPerLvl', 'Dmg-Min': 'dmgMin', 'Dmg-Max': 'dmgMax',
        'Dmg/Lvl': 'dmgPerLvl', 'ResistFire': 'resFire', 'ResistFire/Lvl': 'resFirePerLvl', 'ResistCold': 'resCold',
        'ResistCold/Lvl': 'resColdPerLvl', 'ResistLightning': 'resLight', 'ResistLightning/Lvl': 'resLightPerLvl',
        'ResistPoison': 'resPoison', 'ResistPoison/Lvl': 'resPoisonPerLvl', 'DefaultChance': 'defaultChance',
        'HiringMaxLevelDifference': 'maxLvlDiff', 'resurrectcostmultiplier': 'resMult',
        'resurrectcostdivisor': 'resDiv', 'resurrectcostmax': 'resMax', 'equivalentcharclass': 'equivClass',
    }
    DIFF_NAME = {1: 'n', 2: 'nm', 3: 'h'}   # hireling.txt Difficulty is 1-based
    hirelings = []
    for r in T['hireling'].values():
        if not r.get('Hireling'):
            continue
        h = {HIRE_KEYS[k]: v for k, v in r.items() if k in HIRE_KEYS}
        h['diff'] = DIFF_NAME.get(r.get('Difficulty', 0), 'n')
        h['monster'] = T['monstats'].get(str(r.get('Class')), {}).get('Id')   # Class is monstats *hcIdx = row index
        h['skills'] = [{k: v for k, v in {
            'skill': r['Skill%d' % i], 'mode': r.get('Mode%d' % i), 'chance': r.get('Chance%d' % i, 0),
            'chancePerLvl': r.get('ChancePerLvl%d' % i, 0), 'level': r.get('Level%d' % i, 0),
            'lvlPerLvl': r.get('LvlPerLvl%d' % i, 0)}.items() if v is not None} for i in range(1, 7) if r.get('Skill%d' % i)]
        hirelings.append(h)

    # ---------------- quests ----------------
    quests = {}
    for qid, q in HAND_QUESTS.items():
        for who in ('giver', 'turnIn'):
            assert q[who] is None or q[who] in npcs, '%s %s %s' % (qid, who, q[who])
        key = 'qstsa%dq%d' % (q['act'], q['n'])
        quests[qid] = dict(q, name=s(key), strKey=key, id=qid)
        del quests[qid]['n']
    assert len(quests) == 27, len(quests)
    for nid, n in npcs.items():
        for qid in n.get('quests', []):
            assert qid in quests, '%s lists unknown quest %s' % (nid, qid)

    data.update({
        'classes': classes, 'skills': skills, 'monSkills': monskills, 'missiles': missiles,
        'monsters': monsters, 'superuniques': superuniques, 'monlvl': monlvl,
        'umod': {'names': umods, 'constants': umod_const},
        'difficulty': {k: v for k, v in list(T['difficultylevels'].values())[0].items()},
        'items': items, 'experience': experience, 'areas': areas, 'npcs': npcs, 'monpreset': monpreset,
        'quests': quests, 'hirelings': hirelings, 'actTravel': HAND_ACT_TRAVEL,
        'areaAlias': {'cave_1': 'cave_level_1', 'cave_2': 'cave_level_2'},
        'townOfAct': {str(k): v for k, v in TOWN_AREAS.items()},
    })
    return data


HEADER = """// GENERATED by games/diablo2/_tools/build_data.py — do not edit; edit the lever and rerun:
//   PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
// Diablo II Resurrected 3.1 game data: all 5 acts, 3 difficulties.
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
        'monsters[*].aiKind': 'behaviour class chosen by hand (ranged flag for the rest)',
        'superuniques[*].area/areas': 'placement: DS1 scan of tiles/**.ds1 + Arreat Summit act pages; see HAND_SUPER',
        'areas[*].links/exits': 'outdoor and portal links are hard-coded in the D2 DRLG; typed per act from the Arreat Summit act maps (HAND_LINKS), cave/tomb links derived from Levels.txt Vis0-7',
        'npcs[*].roles/sells/quests': 'Arreat Summit NPC pages (HAND_NPCS)',
        'quests': 'Arreat Summit quest pages; names from quests.json (HAND_QUESTS)',
        'actTravel': 'Arreat Summit act pages',
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
    per_act = {}
    for a in data['areas'].values():
        per_act[a['act']] = per_act.get(a['act'], 0) + 1
    print('areas per act', sorted(per_act.items()), 'total', len(data['areas']))
    print('npcs %d, quests %d, hirelings %d, runewords %d, gems %d, setBonuses %d, automagic %d' % (
        len(data['npcs']), len(data['quests']), len(data['hirelings']), len(it['runewords']), len(it['gems']),
        len(it['setBonuses']), len(it['automagic'])))
    print('property codes used:', ' '.join(sorted(codes)))


if __name__ == '__main__':
    main()
