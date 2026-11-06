# -*- coding: utf-8 -*-
"""Rip loot/salvage/consumable/boat candidates from Dave the Diver into this folder.
Needs (built beforehand in this folder): allsprites.json (scan.py), item_tabs.json/eq_tabs.json/loc_en.json (j*.py),
and ho-xanh rip.py's bundle_index.json cache.   PYTHONIOENCODING=utf-8 python rip_loot.py [--dry]
"""
import io, json, os, re, sys
from collections import Counter
sys.path.insert(0, r'D:\survivor-web-hub\games\ho-xanh\tools')
import rip   # import only: no writes
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
def J(n): return json.load(io.open(os.path.join(HERE, n), encoding='utf-8'))
ix = json.load(io.open(os.path.join(rip.CACHE, 'bundle_index.json'), encoding='utf-8'))
rip.IDX, rip.CABS = ix['path'], ix['cab']
SP, IT, EQ, EN = J('allsprites.json'), J('item_tabs.json'), J('eq_tabs.json'), J('loc_en.json')
def en(k): return EN.get(k, k) if k else ''

cands = {}   # sprite -> (cat, ingame name, note)
def add(cat, sprite, name='', note=''):
    if sprite and sprite in SP and sprite not in cands:
        cands[sprite] = (cat, name, note)

def rows():
    for r in IT['Items']:
        yield r, en(r['ItemTextID']), 'Items/type%s' % r['ItemType']
    for r in IT['BuffPotionItem']:
        yield r, en(r['ItemTextID']), 'BuffPotion'
    for r in IT['MVBlackSmithItem']:
        yield r, en(r['ItemTextID']), 'MVBlackSmith'
    for r in EQ['EquipmentItem']:
        yield r, en(r['ItemTextID']), 'Equip/type%s' % r['ItemType']
    for r in EQ['SubEquipment']:
        yield {'ItemIcon': None, 'ItemUIIcon': r['UIIcon'], 'ItemType': 'sub%s' % r['SubEquipmentType']}, en(r['NameTextID']), 'SubEquip/type%s' % r['SubEquipmentType']

def both(r, nm, note, cat):
    for f in ('ItemUIIcon', 'ItemIcon'):
        add(cat, r.get(f), nm, note + ' ' + f)

SKIP = re.compile(r'Dredge|Godzilla|Furniture|Jungle|JDLC|Seed|Fertili|Mandoo|Insect|Butterfly|Beetle|Figure_|Balatro|Seahorse|Keyring|Wuthering|Earphone|Tumbler|Timber|Rubber|Mahogany|Teak|Snail|Clam|Scorpion|Trigonia|BlackIron|CrabTrap|PotionCraft|Empowered|Bait', re.I)
TREAS = re.compile(r'Bacon_Relic|Jose_Soccer|Drone_(Chip|Motor|Lens)|Pinkbox|Item_Mike|StoneArtifacts|StonePlate|MermanCuju|Maki_Tablet|JadeFish|Rebreather|Unidentified|gold|Mat_(Amethyst|Copper|Diamond|Iron|Opal|Topaz|Ttorbernite|Aquamarine|Ruby)|Pearl|PotteryFragment|CoralGem|OldMask|SpiderMarble|SteelWire|BelugaWhistle|Glacial_Passage_Key|JW2|Enhanced_|Mat_(Bone|Foot|Skull|Flask|Glass|Rope|ScrapIron|Wood)|Item_(Bone|Foot|Skull|Flask|Glass|Rope|ScrapIron|Wood)|HeadBone|Jawbone', re.I)
BOATSP = re.compile(r'^(Wreck_Boat0\d|Crates0\d|Boat|Boat_001|Boat_001_Preview|Boat_00[2-9]_Preview|Boat_01[0-3]_Preview|Boat_001_Window|01_Boat0\d|02_Lobby_Boat|04_Boat|06_Lobby_Boat|12_Boat|13_Boat|14_Boat|15_Boat|17_Boat|19_Boat|20_Boat|BoatAcc_\w+|Anchor_Melee|Boat_Pirate[ABC]_Water_Idle0?|LobbyBoat_CargoshipBox_Pink)$', re.I)
SHOPSP = re.compile(r'^(CobraShop_Main01|Boat_Cobrashop_Add0?\d?|MarketTentBg|MV_SeedShop|Jango_Shop_Idle00|Jango_Shop_Sell01|Mushroomer_shop_Idle|Mission_TravellingMerchant|IdolGoods_Thumbnail|ContentsGuide_(CobraShop|Merchant_Jango))$', re.I)
CONS = re.compile(r'bomb|grenade|mine|medkit|first.?aid|heal|oxygen|o2|tank|drone|flare|booster|scooter|trap|capsule|bandage|pill|medic|antidote|ointment|hemostatic|tranquil', re.I)
for r, nm, note in rows():
    t = r.get('ItemType'); ic = '%s %s' % (r.get('ItemIcon'), r.get('ItemUIIcon'))
    if SKIP.search(ic) or SKIP.search(nm or ''): continue
    ui = r.get('ItemUIIcon'); wi = r.get('ItemIcon')
    if note.startswith('Items/type') and t in (1, 7, 10, 19, 0, 2, 6, 40) and TREAS.search(ic):
        both(r, nm, note, 'treasure')
    if note.startswith('Equip/type3'):
        add('melee', ui, nm, note)
    elif CONS.search(ic + nm) and not note.startswith('Equip/type0') and not re.search(r'Launcher|Gun', ic + nm):
        add('consumable', ui, nm, note); add('consumable', wi, nm, note + ' world')
    if re.search(r'shell|urchin|pearl|coral|kelp|seaweed|sea.?grape|starfish', ic + nm, re.I) and t in (4, 6, 17, 2, 10, 11):
        add('ingredient', ui, nm, note)
# explicit extras: bombs/grenade-like weapons give nothing portable, so keep their thumbnails in consumable too
for r, nm, note in rows():
    ic = '%s' % r.get('ItemUIIcon')
    if re.search(r'^(GrenadeLauncher_Thumbnail|StickyBombGun_Thumbnail|Mine_Thumbnail|Item_Mine$)', ic): add('consumable', ic, nm, note)

for n in sorted(SP):
    if BOATSP.search(n): add('boat', n, n, 'name')
    if SHOPSP.search(n): add('shop', n, n, 'name')
    if re.search(r'^(Chest|Treasure|Vase|Amphora|Urn|Jar|Relic|Statue|Sunken)', n, re.I) and not re.search(r'Dredge|Godzilla|JDLC|Jungle|Bacon|Mini|LAD|UI_|Beat', n, re.I):
        add('treasure', n, n, 'name')

# SpriteRenderer sprites of world prefabs (chests, wrecks, boats)
BASE = 'Assets/Contents/PlayContents/Ingame/00_InGame_Common/Prefabs/'
def prefab_sprites(path):
    b = ix['path'].get(path)
    if not b: return []
    def go(env):
        out = []
        for o in env.objects:
            if o.type.name == 'SpriteRenderer':
                try:
                    s = o.read().m_Sprite
                    if s and s.path_id: out.append(s.deref_parse_as_object().m_Name)
                except Exception: pass
        return out
    try: return rip.with_deps(b, go)
    except Exception as e:
        print('prefab fail', path, e); return []
if '--noprefab' not in sys.argv:
    for pf in ['Chest_Item', 'Chest_Weapon', 'Chest_O2', 'Chest_IngredientPot_A', 'Chest_IngredientPot_B', 'Boss/Chest_O2_Boss',
               'Loot/Mission/Quest_Item_StoneArtifacts', 'Loot/Mission/Toggle_CargoShip', 'Loot/Bio/Bone/Chest_BonePile_A']:
        for n in prefab_sprites(BASE + 'Interaction/' + pf + '.prefab'): add('prefab', n, os.path.basename(pf), 'prefab ' + pf)
    for pf in ('PirateBoat', 'Prop/WreckBoat', 'Prop/WreckBoat01', 'Prop/WreckBoat03'):
        for n in prefab_sprites(BASE + pf + '.prefab'): add('boat', n, os.path.basename(pf), 'prefab ' + pf)

def grab(name):
    f, pid, t = sorted(SP[name], key=lambda e: e[2] != 'Sprite')[0]
    def go(env):
        for o in env.objects:
            if o.path_id == pid:
                return o.read().image.convert('RGBA')
    return f, rip.with_deps(f, go)

if __name__ == '__main__':
    quota = {'treasure': 80, 'prefab': 20, 'ingredient': 14, 'consumable': 40, 'melee': 25, 'boat': 47, 'shop': 20}
    print(Counter(v[0] for v in cands.values()))
    if '--dry' in sys.argv:
        for k, v in cands.items(): print(v[0], k, '|', v[1], '|', v[2])
        sys.exit()
    used = Counter(); lines = []; sheets = {}
    for n, (cat, nm, note) in cands.items():
        if used[cat] >= quota[cat]: continue
        try: f, im = grab(n)
        except Exception as e:
            print('fail', n, e); continue
        if im is None or im.getbbox() is None: continue
        used[cat] += 1
        d = os.path.join(HERE, cat); os.makedirs(d, exist_ok=True)
        im.save(os.path.join(d, n + '.png'))
        sheets.setdefault(cat, []).append((n, im))
        lines.append('| %s | %s | %dx%d | %s | %s | %s |' % (n, f[:8], im.width, im.height, nm, cat, note))
    for cat, L in sheets.items():
        C = 112; cols = 8; nr = (len(L) + cols - 1) // cols
        S = Image.new('RGBA', (cols * C, nr * (C + 14)), (40, 70, 90, 255)); dr = ImageDraw.Draw(S)
        for i, (n, im) in enumerate(L):
            sc = min((C - 8) / im.width, (C - 8) / im.height, 3)
            t = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.NEAREST if sc >= 1 else Image.LANCZOS)
            x, y = (i % cols) * C, (i // cols) * (C + 14)
            S.alpha_composite(t, (x + (C - t.width) // 2, y + (C - t.height) // 2))
            dr.text((x + 2, y + C), n[:19], fill=(255, 255, 255, 255))
        S.save(os.path.join(HERE, 'sheet_%s.png' % cat))
    io.open(os.path.join(HERE, 'index.md'), 'w', encoding='utf-8').write(
        '# Dave the Diver loot candidates\n\n| sprite | bundle | size | in-game name | category | source |\n|---|---|---|---|---|---|\n' + '\n'.join(lines) + '\n')
    print(used)
