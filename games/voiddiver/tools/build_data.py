# -*- coding: utf-8 -*-
"""build_data.py — VOID DIVER: giải mã bảng + Lua thẳng từ bản Steam, lọc theo Pham vi (ARCH.md),
sinh data/tables.js (VD.T), data/text.js (VD.TEXT/VD.TEXT_EN), data/lua.js (VD.LUA) và
tools/manifest.json (tên asset để tools/rip.py bóc).

Tự chứa: chỉ cần đường dẫn cài Steam của game (đọc trực tiếp, không phụ thuộc vd-ref/).

    set VD_DATA=D:\\Steam\\steamapps\\common\\VOID DIVER Escape from the Abyss Demo\\VOID DIVER_Data
    set PYTHONIOENCODING=utf-8
    python build_data.py

Giải mã: TableEncrypted/<Tên>.bytes = CSV XOR 0xCC. LuaEncrypted/**/<tên>.bytes = script Lua XOR 0xF4.
(BannedWord.bytes trong TableEncrypted lại là .csv, không mã hoá — không dùng tới nên bỏ qua.)
"""
import csv
import io
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # games/voiddiver
DATA_OUT = os.path.join(ROOT, 'data')
TOOLS_OUT = os.path.dirname(os.path.abspath(__file__))

VD_DATA = os.environ.get(
    'VD_DATA',
    r'D:/Steam/steamapps/common/VOID DIVER Escape from the Abyss Demo/VOID DIVER_Data')
SA = os.path.join(VD_DATA, 'StreamingAssets')
TABLE_DIR = os.path.join(SA, 'TableEncrypted')
LUA_DIR = os.path.join(SA, 'LuaEncrypted')

XOR_TABLE = 0xCC
XOR_LUA = 0xF4


def xor_bytes(b, key):
    return bytes(x ^ key for x in b)


def atomic_write_text(path, text):
    """Ghi ra file tam roi os.replace() - khong bao gio de commit/push bat gap file dang ghi
    do (yeu cau khi dang commit song song voi luc build_data.py chay)."""
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.tmp-', suffix='.js')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- decrypt --

def decrypt_table_csv(name):
    """Da so bang la TableEncrypted/<Ten>.bytes (CSV XOR 0xCC). Rieng LocalizedText.csv va
    BannedWord.csv nam san o dang .csv thuong, khong ma hoa - doc thang."""
    p_bytes = os.path.join(TABLE_DIR, name + '.bytes')
    if os.path.exists(p_bytes):
        raw = open(p_bytes, 'rb').read()
        return xor_bytes(raw, XOR_TABLE).decode('utf-8-sig')
    p_csv = os.path.join(TABLE_DIR, name + '.csv')
    if os.path.exists(p_csv):
        return io.open(p_csv, encoding='utf-8-sig').read()
    raise FileNotFoundError(name)


def decrypt_lua(relpath):
    path = os.path.join(LUA_DIR, relpath + '.bytes')
    raw = open(path, 'rb').read()
    return xor_bytes(raw, XOR_LUA).decode('utf-8', 'replace')


# ------------------------------------------------------- tables_to_json ----
# (quy tac giong tools/tables_to_json.py cua vd-ref, doc thang tu chuoi CSV
#  da giai ma thay vi tu file, va giu moi cot ke ca Memo/~ o day - loc sau)

SCALAR_NUM_INT = {'int', 'long', 'byte'}


def try_num(s):
    if s == '':
        return None
    try:
        if '.' not in s and 'e' not in s.lower():
            return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        return s


def parse_scalar(cell, typ):
    if cell == '':
        return None
    if typ in SCALAR_NUM_INT:
        try:
            return int(cell)
        except ValueError:
            try:
                return int(float(cell))
            except ValueError:
                return cell
    if typ == 'float':
        try:
            return float(cell)
        except ValueError:
            return cell
    if typ == 'bool':
        return cell.strip().upper() == 'TRUE'
    stripped = cell.strip()
    if stripped[:1] in '{[':
        try:
            return json.loads(cell)
        except (ValueError, json.JSONDecodeError):
            return cell
    return cell


def parse_array_item(item, base_type):
    if base_type in SCALAR_NUM_INT or base_type == 'float':
        return parse_scalar(item, base_type)
    if base_type == 'bool':
        return item.strip().upper() == 'TRUE'
    if ':' in item:
        return [try_num(p) for p in item.split(':')]
    return item


def parse_cell(cell, typ):
    if cell is None:
        cell = ''
    cell = cell.strip()
    if typ.endswith('[]'):
        base_type = typ[:-2]
        if cell == '':
            return []
        if cell[:1] in '{[':
            try:
                return json.loads(cell)
            except (ValueError, json.JSONDecodeError):
                return cell
        return [parse_array_item(p, base_type) for p in cell.split('|')]
    return parse_scalar(cell, typ)


def parse_table_text(text, drop_prefixes=('~',), drop_names=('Memo',)):
    """Tra ve (rows, dropped_cols). Bo cot bat dau bang drop_prefixes hoac ten
    trung drop_names (Memo) - giu du lieu, chi bo cot ghi chu cho nguoi."""
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        return [], []
    header, types = rows[0], rows[1]
    ncols = len(header)
    keep_idx = []
    dropped = []
    for i in range(ncols):
        h = header[i]
        if any(h.startswith(p) for p in drop_prefixes) or h in drop_names:
            dropped.append(h)
            continue
        keep_idx.append(i)
    out = []
    for r in rows[2:]:
        if len(r) == 0 or (len(r) == 1 and r[0].strip() == ''):
            continue
        if len(r) < ncols:
            r = r + [''] * (ncols - len(r))
        obj = {}
        for i in keep_idx:
            name = header[i]
            typ = types[i] if i < len(types) else 'string'
            try:
                obj[name] = parse_cell(r[i], typ)
            except Exception:
                obj[name] = r[i]
        out.append(obj)
    return out, dropped


# ------------------------------------------------------------ scope -------

CHAR_IDS = {100001, 100003, 100004, 100005}
CAMPAIGN_IDS = {1100, 1101, 1102, 101, 102, 103, 104, 105, 106, 107, 108}
LOUNGE_SECTOR_IDS = {9001, 9002, 9003}

# Bang nho, dua thang toan bo (khong loc theo scope) - ten khop tools/ARCH.md.
FULL_TABLES = [
    'Const', 'Corruption', 'Stress', 'Difficulty', 'VariantDifficulty', 'Level',
    'Exit', 'ExitCost', 'Entrance', 'Trap', 'SpecialField', 'Anomaly', 'Bag', 'Area',
    'Faction', 'Campaign', 'CampaignTask', 'Mission', 'ZoneSpawn', 'Wave', 'WaveExecutor',
    'MonsterSpawn', 'ShadowMonsterSpawn', 'Mimic', 'MimicSpawn', 'BreakableProp',
    'DisposableObject', 'RewardBox', 'DropReward', 'DropRewardArtifactProbability',
    'Npc', 'NpcFunction', 'NpcTalk', 'LoungeQuest', 'LoungeQuestTask', 'Talent',
    'Crafting', 'Item', 'Scrap', 'Equipment', 'EquipmentEffect', 'EquipmentSet',
    'ShopProduct', 'InteriorShop', 'ArtifactDeal', 'ArtifactDealCard', 'ArtifactPrefix',
    'Paradox', 'ParadoxLevel', 'StatusEffectTag', 'BuffVfx', 'CharacterSkin',
    'CharacterSkinPreset', 'InputAction', 'LoungeBgm', 'LoadingText', 'Glossary',
    'Expression', 'DialogReplay', 'Shield', 'ExtraUnit',
    # Round 2: bang lounge/tycoon con thieu (NpcFunction.Type co Tycoon*/EmployeeXXX).
    'Employee', 'EmployeeLevel', 'EmployeeSkill', 'TycoonSalesSlot', 'AreaDecoration',
    'FeatureUnlock',
    # tieng buoc chan/chay theo mat dat - nho, ten sfx la chuoi truc tiep trong cot.
    'CharacterGroundMoveSfx', 'SkillGroundMoveSfx',
    # cay Thanh dia trong ZoneSpawn 3001-3005 (sanctuary) dung SkillExecutor.
    'SkillExecutor',
]

# Bang scoped rieng: Character, Skill, HitBox, Buff, Monster, Sector, DropRewardProbability.
# Bang bo hoan toan: phan con lai trong 83 bang (Employee*, Achievement, AccountRecord,
# FeatureUnlock, Pet, Shield, SkillExecutor, *GroundMoveSfx, StatusEffectSuppression,
# TycoonSalesSlot, BannedWord, ExtraUnit) - khong nam trong Pham vi ban web.

# --------------------------------------------------- minify Skill/HitBox/Buff ----
# Cac field "text"/"Text"/"TypeAndText"/"UniqueId" trong RootActionNode/HitBoxInfo/BuffEffects la
# ghi chu tieng Han cho nguoi thiet ke xem trong Unity Inspector (vd "text":"설명 없음" = "khong co
# mo ta") - khong phai khoa dich, runtime khong doc. Gia tri mac dinh (0/false/""/[]／"None") cung
# bo duoc vi VD.num()/vec3() trong js/stats.js da coi thieu field = 0 (xem js/stats.js:8).
_NUMSTR_RE = re.compile(r'^-?\d+\.\d+$|^-?\d+$')
_DROP_KEYS = {'text', 'Text', 'TypeAndText', 'UniqueId'}
_DEFAULTS = (0, 0.0, False, '', [], None, 'None')


def minify_tree(o):
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if k in _DROP_KEYS:
                continue
            v2 = minify_tree(v)
            if isinstance(v2, (int, float, str, list)) and not isinstance(v2, bool) and v2 in _DEFAULTS:
                continue
            if v2 is False or v2 is None:
                continue
            out[k] = v2
        return out
    if isinstance(o, list):
        return [minify_tree(x) for x in o]
    if isinstance(o, str) and _NUMSTR_RE.match(o):
        return float(o) if '.' in o else int(o)
    return o


ID_KEY_RE = {
    'hitbox': re.compile(r'HitBoxId', re.I),
    'buff': re.compile(r'BuffId', re.I),
    'monster': re.compile(r'MonsterId', re.I),  # khop ca MonsterId va MonsterIds
}


def walk_collect(obj, key_re, acc):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if key_re.search(k):
                vals = v if isinstance(v, list) else [v]
                for x in vals:
                    if isinstance(x, int) and x:
                        acc.add(x)
                    elif isinstance(x, dict):
                        walk_collect(x, key_re, acc)
            walk_collect(v, key_re, acc)
    elif isinstance(obj, list):
        for x in obj:
            walk_collect(x, key_re, acc)


def collect_all(obj, kind):
    acc = set()
    walk_collect(obj, ID_KEY_RE[kind], acc)
    return acc


ASSET_KEY_RE = {
    'skeleton': re.compile(r'^skeleton$', re.I),
    'vfx': re.compile(r'(^|[A-Za-z])vfx$', re.I),
    'sfx': re.compile(r'sfx$', re.I),
    'bgm': re.compile(r'bgm$', re.I),
    'icon': re.compile(r'icon', re.I),
}


def walk_collect_strings(obj, key_re, acc):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if key_re.search(k) and isinstance(v, str) and v:
                acc.add(v)
            walk_collect_strings(v, key_re, acc)
    elif isinstance(obj, list):
        for x in obj:
            walk_collect_strings(x, key_re, acc)


def main():
    if not os.path.isdir(TABLE_DIR):
        sys.exit('khong thay TableEncrypted tai: ' + TABLE_DIR)

    report = []

    # ---- 1) giai ma + parse toan bo 83 bang -------------------------------
    table_names = sorted(
        {f[:-6] for f in os.listdir(TABLE_DIR) if f.endswith('.bytes')}
        | {f[:-4] for f in os.listdir(TABLE_DIR) if f.endswith('.csv')})
    RAW = {}
    for name in table_names:
        text = decrypt_table_csv(name)
        rows, dropped = parse_table_text(text)
        RAW[name] = rows

    def by_id(name):
        return {r['Id']: r for r in RAW.get(name, []) if r.get('Id') is not None}

    Campaign = by_id('Campaign')
    Sector = by_id('Sector')
    MonsterSpawnRows = RAW.get('MonsterSpawn', [])
    MonsterSpawnByGroup = {}
    for r in MonsterSpawnRows:
        MonsterSpawnByGroup.setdefault(r.get('GroupId'), []).append(r)
    Wave = by_id('Wave')
    WaveExecutorRows = RAW.get('WaveExecutor', [])
    ShadowMonsterSpawnRows = RAW.get('ShadowMonsterSpawn', [])
    Monster = by_id('Monster')
    Skill = by_id('Skill')
    HitBox = by_id('HitBox')
    Buff = by_id('Buff')
    Character = by_id('Character')
    DropReward = by_id('DropReward')
    DropRewardByGroup = {}
    for r in RAW.get('DropReward', []):
        DropRewardByGroup.setdefault(r.get('GroupId'), []).append(r)
    RewardBoxRows = RAW.get('RewardBox', [])

    # ---- 1b) Lua trong pham vi (giai ma som de dung SpawnMonster khi loc quai) ----
    lua_want = ['Common/Common']
    for cid in CAMPAIGN_IDS:
        lua_want.append('Campaign/%d' % cid)
    lua_want.append('Campaign/None')
    lua_want.append('Campaign/QuestCommon')
    for sub in ('LoungeQuest', 'NpcTalk', 'Mission'):
        d = os.path.join(LUA_DIR, sub)
        if os.path.isdir(d):
            for n in sorted(f[:-6] for f in os.listdir(d) if f.endswith('.bytes')):
                lua_want.append('%s/%s' % (sub, n))
    LUA = {}
    for rel in lua_want:
        path = os.path.join(LUA_DIR, rel + '.bytes')
        if os.path.exists(path):
            LUA[rel] = decrypt_lua(rel)
    lua_spawn_monster_ids = set()
    for txt in LUA.values():
        for mstr in re.findall(r'SpawnMonster\w*\(\s*(\d+)', txt):
            lua_spawn_monster_ids.add(int(mstr))

    # ---- 2) scope: sector --------------------------------------------------
    scoped_campaigns = {cid: Campaign[cid] for cid in CAMPAIGN_IDS if cid in Campaign}
    themes = {c['ThemeType'] for c in scoped_campaigns.values()}
    sector_ids = set(LOUNGE_SECTOR_IDS)
    for c in scoped_campaigns.values():
        for entry in c.get('FixedSectors') or []:
            # FixedSector "cx:cy:sectorId:rot" -> [cx,cy,sectorId,rot]; sectorId 0 = random theo theme
            if len(entry) >= 3 and entry[2]:
                sector_ids.add(entry[2])
        for sid in c.get('RandomPlacedSectorIds') or []:
            sector_ids.add(sid)
    for s in RAW.get('Sector', []):
        if s.get('AreaType') in ('Playable', 'TopBoundary', 'BottomBoundary') and s.get('ThemeType') in themes:
            sector_ids.add(s['Id'])
    scoped_sectors = {sid: Sector[sid] for sid in sector_ids if sid in Sector}

    # ---- 3) scope: monster --------------------------------------------------
    monster_ids = set()
    # 3a. tu sector: MonsterSpawnGroupId trong moi field embedded JSON cua sector
    for s in scoped_sectors.values():
        grp_ids = set()
        walk_collect_strings  # (khong dung, giu cho ro rang khong con sot import chet)
        def collect_group(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if re.search(r'MonsterSpawnGroupId', k, re.I) and isinstance(v, int):
                        grp_ids.add(v)
                    collect_group(v)
            elif isinstance(o, list):
                for x in o:
                    collect_group(x)
        collect_group(s)
        for gid in grp_ids:
            for row in MonsterSpawnByGroup.get(gid, []):
                if row.get('MonsterId'):
                    monster_ids.add(row['MonsterId'])
        # monster id truc tiep neu co (UseMonsterSpawnTable=false)
        monster_ids |= collect_all(s, 'monster')
    # 3b. Campaign.PatrolMonsterId
    for c in scoped_campaigns.values():
        if c.get('PatrolMonsterId'):
            monster_ids.add(c['PatrolMonsterId'])
    # 3c. Wave (bang full) - moi WaveSpawnDatas[].monsterId
    for w in Wave.values():
        monster_ids |= collect_all(w.get('WavePhases'), 'monster')
    # 3d. ShadowMonsterSpawn (bang full) -> MonsterSpawn.GroupId -> MonsterId
    shadow_groups = set()
    for r in ShadowMonsterSpawnRows:
        for k in ('ShadowMonsterGroupSpawnId', 'AnomalyGroupSpawnId'):
            if r.get(k):
                shadow_groups.add(r[k])
    for gid in shadow_groups:
        for row in MonsterSpawnByGroup.get(gid, []):
            if row.get('MonsterId'):
                monster_ids.add(row['MonsterId'])
    # 3e. dong bo voi tat ca MonsterSpawn (bang full) - moi GroupId da tham chieu deu tinh la "trong pham vi"
    #      (MonsterSpawn duoc dua nguyen bang nen tham chieu cheo cua no cung phai giai quyet duoc)
    for row in MonsterSpawnRows:
        if row.get('MonsterId'):
            monster_ids.add(row['MonsterId'])
    # 3f. Lua SpawnMonster(<id>, ...) trong Lua scoped
    monster_ids |= {mid for mid in lua_spawn_monster_ids if mid in Monster}

    scoped_characters = {cid: Character[cid] for cid in CHAR_IDS if cid in Character}

    # ---- 4+5) closure Skill/HitBox/Buff/Monster: gom MOI so nguyen xuat hien trong cac dong da
    # co (khong chi theo ten field "HitBoxId"/"BuffId" - vi HitBoxEvent tham chieu HitBox qua field
    # "Id" thuong, khong phai "HitBoxId"; SummonActionEvent, DamageActionEvent, ChangeSkill... deu
    # co the mang id o field ten khac nhau), roi nhan moi dong Skill/HitBox/Buff/Monster co Id
    # trung khop, lap toi diem dung. Rui ro trung so ngau nhien (vd mot chi so = 100 trung Id mot
    # Buff 100) chi lam PHINH THEM du lieu (vo hai), khong lam THIEU - uu tien dung hon gon.
    _INT_STR_RE = re.compile(r'^-?\d+$')

    def all_ints(o, acc):
        if isinstance(o, bool):
            return
        if isinstance(o, int):
            acc.add(o)
            return
        if isinstance(o, str):
            if _INT_STR_RE.match(o):
                acc.add(int(o))
            return
        if isinstance(o, dict):
            for v in o.values():
                all_ints(v, acc)
        elif isinstance(o, list):
            for x in o:
                all_ints(x, acc)

    skill_ids = set()
    for c in scoped_characters.values():
        for k in ('AttackSkillId', 'DashSkillId', 'PolymorphAttackSkillId', 'PolymorphDashSkillId'):
            if c.get(k):
                skill_ids.add(c[k])
        for k in ('ActiveSkillIds', 'PolymorphActiveSkillIds', 'PassiveSkillIds'):
            skill_ids |= {x for x in (c.get(k) or []) if x}
    hitbox_ids, buff_ids = set(), set()

    # hat giong mot lan tu MOI bang "day du" (FULL_TABLES - da dua nguyen vao T roi, vd Talent,
    # Equipment, ExtraUnit, Wave, WaveExecutor, MonsterSpawn, RewardBox, DropReward, Npc, ...) -
    # bat ky bang nao trong so nay co the tham chieu them Skill/HitBox/Buff/Monster (vd
    # ExtraUnit.ActiveSkillIds cho "bánh quy" cua Mio, Wave.WavePhases[].monsterId). Ca curate
    # mot tap con nho truoc day da sot ExtraUnit -> quai/skill/hitbox lien quan bi thieu; giờ quet
    # toan bo FULL_TABLES cho chac, khong doan tay bang nao "co lien quan".
    seed_ints = set()
    for tname in FULL_TABLES:
        for row in RAW.get(tname, []):
            all_ints(row, seed_ints)

    # nhom pha quai: BasePhaseMonsterId chi tro NGUOC ve quai pha goc (mot chieu) - tu than gia
    # tri do khong the tim ra CAC PHA ANH EM (cung BasePhaseMonsterId nhung khac Id) bang cach quet
    # so nguyen thuong, phai gom nhom rieng.
    phase_siblings = {}
    for m in Monster.values():
        b = m.get('BasePhaseMonsterId')
        if b and b > 0:
            phase_siblings.setdefault(b, set()).add(m['Id'])

    changed = True
    while changed:
        changed = False
        scan_ints = set(seed_ints)
        for mid in list(monster_ids):
            mo = Monster.get(mid)
            if mo:
                b = mo.get('BasePhaseMonsterId')
                for sib in phase_siblings.get(b, set()) | phase_siblings.get(mid, set()):
                    if sib not in monster_ids:
                        monster_ids.add(sib); changed = True
        for sid in list(skill_ids):
            sk = Skill.get(sid)
            if sk:
                all_ints(sk, scan_ints)
        for hid in list(hitbox_ids):
            hb = HitBox.get(hid)
            if hb:
                all_ints(hb, scan_ints)
        for bid in list(buff_ids):
            bf = Buff.get(bid)
            if bf:
                all_ints(bf, scan_ints)
        for mid in list(monster_ids):
            mo = Monster.get(mid)
            if mo:
                all_ints(mo, scan_ints)
        for cid in list(scoped_characters):
            crow = Character.get(cid)
            if crow:
                all_ints(crow, scan_ints)
        for i in scan_ints:
            if i in Skill and i not in skill_ids:
                skill_ids.add(i); changed = True
            if i in HitBox and i not in hitbox_ids:
                hitbox_ids.add(i); changed = True
            if i in Buff and i not in buff_ids:
                buff_ids.add(i); changed = True
            if i in Monster and i not in monster_ids:
                monster_ids.add(i); changed = True

    scoped_monsters = {mid: Monster[mid] for mid in monster_ids if mid in Monster}
    scoped_skills = {sid: Skill[sid] for sid in skill_ids if sid in Skill}
    scoped_hitboxes = {i: HitBox[i] for i in hitbox_ids if i in HitBox}
    scoped_buffs = {i: Buff[i] for i in buff_ids if i in Buff}

    # ---- 6) scope: DropRewardProbability (450KB -> chi giu row lien quan) ----
    dropreward_group_ids = set()
    for row in RewardBoxRows:
        if row.get('DropRewardGroupId'):
            dropreward_group_ids.add(row['DropRewardGroupId'])
    for row in MonsterSpawnRows:
        if row.get('DropRewardGroupId'):
            dropreward_group_ids.add(row['DropRewardGroupId'])
    for m in Monster.values():
        if m.get('DropRewardGroupId'):
            dropreward_group_ids.add(m['DropRewardGroupId'])
    dropreward_ids = set()
    for gid in dropreward_group_ids:
        for row in DropRewardByGroup.get(gid, []):
            dropreward_ids.add(row['Id'])
    scoped_drp = [r for r in RAW.get('DropRewardProbability', []) if r.get('DropRewardId') in dropreward_ids]

    # ---- 7) lap bang T cuoi cung ---------------------------------------------
    T = {}
    for name in FULL_TABLES:
        if name in RAW:
            T[name] = RAW[name]
    def minify_row(row, fields):
        row = dict(row)
        for f in fields:
            if f in row:
                row[f] = minify_tree(row[f])
        return row

    T['Character'] = list(scoped_characters.values())
    T['Skill'] = [minify_row(r, ('RootActionNode', 'AiSkillCondition', 'DeactivateBuffCondition'))
                  for r in scoped_skills.values()]
    T['HitBox'] = [minify_row(r, ('HitBoxInfo',)) for r in scoped_hitboxes.values()]
    T['Buff'] = [minify_row(r, ('BuffEffects', 'Triggers', 'DurationOverride')) for r in scoped_buffs.values()]
    T['Monster'] = list(scoped_monsters.values())
    T['Sector'] = list(scoped_sectors.values())
    T['DropRewardProbability'] = scoped_drp

    for name in sorted(T):
        report.append((name, len(T[name])))

    os.makedirs(DATA_OUT, exist_ok=True)
    atomic_write_text(os.path.join(DATA_OUT, 'tables.js'),
                       'window.VD = window.VD || {};\nVD.T = ' +
                       json.dumps(T, ensure_ascii=False, separators=(',', ':')) + ';\n')

    # ---- 8) Lua: ghi data/lua.js (da giai ma o buoc 1b) -----------------------
    atomic_write_text(os.path.join(DATA_OUT, 'lua.js'),
                       'window.VD = window.VD || {};\nVD.LUA = ' +
                       json.dumps(LUA, ensure_ascii=False, separators=(',', ':')) + ';\n')

    extra_monsters_from_lua = sorted(lua_spawn_monster_ids - monster_ids)

    # ---- 9) text: chi key duoc tham chieu ------------------------------------
    Localized = RAW.get('LocalizedText', [])
    included_ids_by_table = {}
    for tname, rows in T.items():
        ids = set()
        for r in rows:
            if isinstance(r.get('Id'), int):
                ids.add(r['Id'])
        included_ids_by_table[tname] = ids
    all_included_ids = set()
    for ids in included_ids_by_table.values():
        all_included_ids |= ids

    key_id_re = re.compile(r'^T[A-Za-z]+_.*_(\d+)$')
    lua_key_re = re.compile(r'<Key:([A-Za-z0-9_]+)>')
    lua_keys = set()
    for txt in LUA.values():
        lua_keys |= set(lua_key_re.findall(txt))

    TEXT, TEXT_EN = {}, {}
    ui_count = 0
    per_id_count = 0
    for row in Localized:
        key = row.get('Id')
        if not key:
            continue
        vi = row.get('Vi')
        en = row.get('En')
        include = False
        if key in lua_keys:
            include = True
        else:
            m = key_id_re.match(key)
            if m:
                if int(m.group(1)) in all_included_ids:
                    include = True
                    per_id_count += 1
            else:
                # khong co hau to id so -> coi la ho UI/system, dua het
                include = True
                ui_count += 1
        if include:
            if vi:
                TEXT[key] = vi
                if not vi and en:
                    pass
            elif en:
                TEXT_EN[key] = en
            if vi and not vi.strip() and en:
                TEXT_EN[key] = en

    atomic_write_text(os.path.join(DATA_OUT, 'text.js'),
                       'window.VD = window.VD || {};\n' +
                       'VD.TEXT = ' + json.dumps(TEXT, ensure_ascii=False, separators=(',', ':')) + ';\n' +
                       'VD.TEXT_EN = ' + json.dumps(TEXT_EN, ensure_ascii=False, separators=(',', ':')) + ';\n')

    # ---- 10) manifest.json: ten asset ma du lieu scoped tham chieu -----------
    manifest = {
        'spine': set(), 'sector': sorted(scoped_sectors.keys()), 'vfx': set(),
        'sfx': set(), 'bgm': set(), 'icon': set(), 'portrait': set(), 'dialogImage': set(),
    }
    # spine: ten nhan vat/quai/npc (dung Character.Id/Monster.Id lam khoa tra spine ten that
    # se can bang json khac trong ban goc - o day lay theo quy uoc ten field thuong gap)
    def collect_named(obj, key_re, bucket):
        acc = set()
        walk_collect_strings(obj, key_re, acc)
        manifest[bucket] |= acc

    for blob in (list(scoped_skills.values()) + list(scoped_hitboxes.values()) + list(scoped_buffs.values())):
        for field in ('RootActionNode', 'HitBoxInfo', 'BuffEffects'):
            if field in blob:
                collect_named(blob[field], ASSET_KEY_RE['vfx'], 'vfx')
                collect_named(blob[field], ASSET_KEY_RE['sfx'], 'sfx')
    for m in scoped_monsters.values():
        for k in ('DyingSfx', 'SpawnSfx', 'HitSfx', 'AggroSfx', 'RunLeftSfx', 'RunRightSfx',
                  'WalkLeftSfx', 'WalkRightSfx'):
            if m.get(k):
                manifest['sfx'].add(m[k])
        if m.get('SpawnVfx'):
            manifest['vfx'].add(m['SpawnVfx'])
    for s in scoped_sectors.values():
        if s.get('Bgm'):
            manifest['bgm'].add(s['Bgm'])
        if s.get('CombatBgm'):
            manifest['bgm'].add(s['CombatBgm'])
    for r in T.get('LoungeBgm', []):
        for k, v in r.items():
            if isinstance(v, str) and 'bgm' in k.lower():
                manifest['bgm'].add(v)
    for txt in LUA.values():
        for mstr in re.findall(r'PlayBgm\w*\(\s*["\']([^"\']+)', txt):
            manifest['bgm'].add(mstr)
        for mstr in re.findall(r'SetDialogCustomImageAsync\(\s*["\']([^"\']+)', txt):
            manifest['dialogImage'].add(mstr)

    # tieng buoc chan theo mat dat (CharacterGroundMoveSfx/SkillGroundMoveSfx - ten sfx la chuoi
    # truc tiep trong cot, khong can PPtr).
    for r in T.get('CharacterGroundMoveSfx', []):
        for k in ('RunLeft', 'RunRight', 'WalkLeft', 'WalkRight'):
            if r.get(k):
                manifest['sfx'].add(r[k])
    for r in T.get('SkillGroundMoveSfx', []):
        for n in (r.get('SfxNames') or []):
            manifest['sfx'].add(n)

    # SFX UI/tuong tac - khong tham chieu tu bang/Lua nao (nam trong MonoBehaviour cua prefab
    # popup/slot/toast, chua do duoc cach lien ket tu dong); danh sach + anh xa dat tay theo yeu
    # cau, doi chieu ten that trong remote_sound_assets_sfx (xem tools/README.md "SFX UI").
    UI_SFX_MAP = {
        'radio': 'Radio', 'interactionDoor': 'InteractionDoor', 'doorOpen': 'DoorOpen',
        'interactionPhoneBooth': 'InteractionPhoneBooth',
        'interactionAIPhoneBooth': 'InteractionAIPhoneBooth', 'enterPhoneBooth': 'EnterPhoneBooth',
        'boothEscapeStart': 'BoothEscape_Start', 'boothEscapeStartSafe': 'BoothEscape_Start_Safe',
        'statusEffectLight': 'StatusEffect_Light', 'statusEffectLight2': 'StatusEffect_Light2',
        'statusEffectBleed': 'StatusEffect_Bleed', 'statusEffectBleed2': 'StatusEffect_Bleed2',
        'statusEffectMadness': 'StatusEffect_Madness', 'sanFear': 'San_Fear',
        'interactionLootingDefault': 'InteractionLooting_Default',
    }
    UI_SFX_LOOTING_FAMILY = [
        'InteractionLooting_Briefcase', 'InteractionLooting_CursedBarrierChest',
        'InteractionLooting_CursedBox', 'InteractionLooting_CursedBoxMimic',
        'InteractionLooting_CursedBoxMimic2', 'InteractionLooting_Default',
        'InteractionLooting_Freezer', 'InteractionLooting_FuseSwitchBox',
        'InteractionLooting_HiddenStash', 'InteractionLooting_Locked', 'InteractionLooting_Locker',
        'InteractionLooting_MedicalBox', 'InteractionLooting_PaperBox',
        'InteractionLooting_PaperBox2', 'InteractionLooting_Toolbox', 'InteractionLooting_Vault',
        'InteractionLooting_Vault2', 'InteractionLooting_VendingMachine',
    ]
    manifest['sfx'] |= set(UI_SFX_MAP.values()) | set(UI_SFX_LOOTING_FAMILY)
    manifest['uiSfx'] = UI_SFX_MAP
    manifest['uiSfxLootingFamily'] = UI_SFX_LOOTING_FAMILY
    manifest['uiSfxNotFound'] = ['ItemPickUp', 'Aggro_RedMask']

    manifest = {k: (sorted(v) if isinstance(v, set) else v) for k, v in manifest.items()}
    manifest['characters'] = sorted(scoped_characters.keys())
    manifest['monsters'] = sorted(scoped_monsters.keys())
    manifest['extraMonstersFromLuaNotInT'] = extra_monsters_from_lua
    manifest['sectorThemes'] = sorted(themes)
    with io.open(os.path.join(TOOLS_OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    # ---- report ---------------------------------------------------------------
    print('=== tables.js: %d bang ===' % len(T))
    for name, n in report:
        print('  %-28s rows=%d' % (name, n))
    print('sectors scoped:', len(scoped_sectors), 'themes:', themes)
    print('monsters scoped:', len(scoped_monsters))
    print('skills scoped:', len(scoped_skills))
    print('hitboxes scoped:', len(scoped_hitboxes))
    print('buffs scoped:', len(scoped_buffs))
    print('DropRewardProbability: %d / %d dong (dong bo full)' % (
        len(scoped_drp), len(RAW.get('DropRewardProbability', []))))
    print('lua files:', len(LUA), sorted(LUA.keys()))
    print('extra monster ids seen in Lua SpawnMonster but not in T:', extra_monsters_from_lua)
    print('text.js: VD.TEXT=%d key (per-id=%d, UI/system=%d), VD.TEXT_EN=%d' % (
        len(TEXT), per_id_count, ui_count, len(TEXT_EN)))
    print('manifest.json:', {k: (len(v) if isinstance(v, list) else v) for k, v in manifest.items()})

    for path in (os.path.join(DATA_OUT, 'tables.js'), os.path.join(DATA_OUT, 'text.js'),
                 os.path.join(DATA_OUT, 'lua.js')):
        print(os.path.basename(path), os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
