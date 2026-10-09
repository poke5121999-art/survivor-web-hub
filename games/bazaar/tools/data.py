# -*- coding: utf-8 -*-
"""Cần bóc dữ liệu thẻ / quái / chế độ chơi / hero của The Bazaar Demo ra JS cho web.

Chạy lại (Python 3.12 vì bảng SQLite dùng STRICT, Python 3.8 không mở được):

    py -3.12 -I games/bazaar/tools/data.py [--db D:\\bazaar-ref\\db\\GameData.db]

Nguồn: `GameData.db` (mỗi dòng là JSON). Nếu không truyền --db: dùng `D:\\bazaar-ref\\db\\GameData.db`,
không có thì giải nén `GameData.db.zip` từ thư mục Steam vào `D:\\bazaar-ref\\db\\` (không ghi gì vào Steam).

Ra (trong repo, cạnh thư mục tools):
- data/cards-common.js  window.BZ_CARDS += TCardItem + TCardSkill Heroes có Common (hoặc rỗng), mọi thẻ quái dùng,
                        mọi thẻ mà dữ liệu gặp gỡ/hero trỏ tới bằng Id, và thẻ dùng chung từ 2 hero trở lên
- data/cards-<hero>.js  window.BZ_CARDS += thẻ CHỈ của một hero (vanessa, pygmalien, dooley, mak, stelle, jules, karnok)
                        Mọi tệp ghi vào cùng một window.BZ_CARDS = {Id: template}; nạp tệp nào cũng được, theo thứ tự nào
                        cũng được (cards-common trước cho chắc). window.BZ_CARDS_PARTS ghi tệp nào đã nạp.
- data/cards.js         lớp tương thích: trong Node `require` cả 8 tệp trên; trong trình duyệt document.write 8 thẻ <script>.
                        Trang mới nên nạp thẳng các tệp cards-*.js (xem window.BZ_HEROES.cardFiles).
- data/monsters.js      window.BZ_MONSTERS = [monster...] + trường suy ra `Encounters` (thẻ TCardEncounterCombat trỏ tới quái)
- data/mode.js          window.BZ_MODE     = {mode, levelUps, tooltips}
- data/encounters.js    window.BZ_ENCOUNTERS = {events, steps, pedestals, combats, starts, expeditions}; chi tiết ở write_encounters()
- data/heroes.js        window.BZ_HEROES   = {order, cardFiles, heroes{...}, effects{...}}; chi tiết ở write_heroes()

DSL giữ nguyên tên `$type` và tên trường; chỉ bỏ những gì runtime không dùng:
InternalDescription, MigrationData, TranslationKey, Version, TemplateVersion, khoá dịch `Key`,
VFXConfig khi là mặc định (VFXOverrideKey null, VFXShouldPlay true, VFXIsTakeover false), HasAbilities/HasAuras.
mọi trường null (thiếu = null), InternalName của ability/aura (giữ ở cấp thẻ).
Giữ chuỗi `Text` của tooltip. Khối Enchantments trùng nhau được ghi một lần mỗi tệp rồi nối lại khi nạp.
JSON gọn (không thụt lề), khoá giữ thứ tự gốc, mọi danh sách sắp theo thứ tự bảng/Id nên chạy lại ra cùng tệp từng byte.
"""
import collections
import io
import json
import os
import re
import sqlite3
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "data")
DEFAULT_DB = r"D:\bazaar-ref\db\GameData.db"
STEAM_ZIP = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data\StreamingAssets\GameData.db.zip"
# EHero (BazaarGameShared.Domain.Core.Types\EHero.cs): Common, Pygmalien, Vanessa, Stelle, Jules, Dooley, Mak, Karnok, Hero8.
# Hero8 = "The Dragons" (LocalizableShared.cs:52,102; HeroColorSO playerColorTheDragons) — KHÔNG có thẻ nào trong GameData.db.
HEROES = ["Vanessa", "Pygmalien", "Dooley", "Mak", "Stelle", "Jules", "Karnok"]
HERO8 = "TheDragons"
DROP_KEYS = {"InternalDescription", "MigrationData", "TranslationKey", "Version", "TemplateVersion",
             "HasAbilities", "HasAuras"}
GLOBAL = "(typeof window!=='undefined'?window:globalThis)"
CARD_TYPES = ("TCardItem", "TCardSkill")


def open_db(path):
    if path is None:
        path = DEFAULT_DB
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with zipfile.ZipFile(STEAM_ZIP) as z:
                name = [n for n in z.namelist() if n.endswith(".db")][0]
                with z.open(name) as src, open(path, "wb") as dst:
                    dst.write(src.read())
    return sqlite3.connect("file:" + path + "?mode=ro", uri=True), path


def rows(con, table):
    return [json.loads(bytes(r[0]).decode("utf-8")) for r in con.execute(f"select Data from {table} order by Id")]


def is_default_vfx(v):
    return isinstance(v, dict) and v.get("VFXOverrideKey") is None and v.get("VFXShouldPlay", True) is True \
        and not v.get("VFXIsTakeover", False)


def strip(o, top=True):
    """Bỏ trường không cần cho runtime, giữ nguyên phần còn lại. Trường null bị bỏ (runtime coi thiếu = null);
    InternalName chỉ giữ ở cấp thẻ/quái (tên nội bộ của từng ability/aura chỉ để gỡ lỗi)."""
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if k in DROP_KEYS or v is None:
                continue
            if k == "InternalName" and not top:
                continue
            if k == "VFXConfig" and is_default_vfx(v):
                continue
            if k == "Key" and isinstance(v, str) and "Text" in o:
                continue  # khoá dịch của TLocalizableText, giữ Text
            out[k] = strip(v, False)
        return out
    if isinstance(o, list):
        return [strip(v, False) for v in o]
    if isinstance(o, float) and o.is_integer():
        return int(o)  # 3.0 -> 3: gọn hơn, giá trị như nhau trong JS
    return o


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def header(note):
    return (f"/* generated by games/bazaar/tools/data.py from GameData.db (The Bazaar Demo) - do not edit.\n"
            f"   {note}\n"
            f"   Rerun: py -3.12 -I games/bazaar/tools/data.py */\n")


def write_body(name, body):
    path = os.path.join(OUT, name)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    return path, len(body.encode("utf-8"))


def write_js(name, var, obj, note):
    return write_body(name, header(note) + f"{GLOBAL}.{var}={dump(obj)};\n")


def write_cards_part(name, part, cards_in_order, note):
    """Một tệp thẻ: khối enchantment trùng nhau (~5 lần mỗi khối) ghi một lần vào E, thẻ giữ chỉ số; vòng lặp nhỏ khi nạp
    trả lại đúng hình gốc Enchantments{tên: khối} rồi gộp vào window.BZ_CARDS (tạo nếu chưa có)."""
    ench, idx, out = [], {}, {}
    for cid, sc in cards_in_order:
        sc = dict(sc)
        if sc.get("Enchantments"):
            en = {}
            for k, block in sc["Enchantments"].items():
                key = dump(block)
                if key not in idx:
                    idx[key] = len(ench)
                    ench.append(block)
                en[k] = idx[key]
            sc["Enchantments"] = en
        out[cid] = sc
    body = header(note) + ("(function(g){var E=" + dump(ench) + ";\nvar C=" + dump(out) + ";\n"
                           "var B=g.BZ_CARDS||(g.BZ_CARDS={}),n=0;"
                           "for(var id in C){var c=C[id],en=c.Enchantments;if(en)for(var k in en)en[k]=E[en[k]];B[id]=c;n++;}"
                           "(g.BZ_CARDS_PARTS||(g.BZ_CARDS_PARTS={}))[" + dump(part) + "]=n;})(" + GLOBAL + ");\n")
    return write_body(name, body) + (len(ench),)


def write_cards_shim(parts):
    """data/cards.js: giữ cho người gọi cũ (test/bazaar-run.js, bazaar-play, bazaar-view, bazaar-capture, index.html hiện tại)."""
    note = ("Compatibility shim: loads " + ", ".join(p + ".js" for p in parts) + ". Node: require; browser: document.write "
            "(same folder, same ?v=). New pages should load data/cards-*.js directly (BZ_HEROES.cardFiles).")
    body = header(note) + (
        "(function(g){var P=" + dump(parts) + ",i;\n"
        "if(typeof module!=='undefined'&&module.exports&&typeof require==='function'){for(i=0;i<P.length;i++)require('./'+P[i]+'.js');return;}\n"
        "var s=typeof document!=='undefined'&&document.currentScript&&document.currentScript.src;if(!s)return;\n"
        "var q=s.indexOf('?'),qs=q<0?'':s.slice(q),u=q<0?s:s.slice(0,q),base=u.slice(0,u.lastIndexOf('/')+1);\n"
        "for(i=0;i<P.length;i++)document.write('<script src=\"'+base+P[i]+'.js'+qs+'\"><\\/script>');\n"
        "})(" + GLOBAL + ");\n")
    return write_body("cards.js", body)


# ------------------------------------------------------------------------------------------------------------------
# Thẻ gặp gỡ
# ------------------------------------------------------------------------------------------------------------------
ENC_DROP = re.compile(r"DEBUG|Debug|TEMPLATE|Tutorial|DEFUNCT|Internal Only")
START_RE = re.compile(r"\((Start Run|Start Run 2|Start Skill)\)\s*$")
EXPEDITION_RE = re.compile(r"Expedition")
DAYS_RE = re.compile(r"\(Day (\d+)(?:\s*(?:-|to|and Day)\s*(\d+))?(\+)?\)")
# Thẻ gặp gỡ còn sót lại không có nội dung chơi được: bỏ, kèm lý do in ra khi chạy
UNUSABLE = {
    "Dungeon chest": "nguyên mẫu hầm ngục: không có mô tả, bước duy nhất 'Dungeon Rare Dragon combat reward' không có ability",
    "Dungeon move forward 1": "nguyên mẫu hầm ngục: không có mô tả, không có bước con nào mang tên Dungeon",
    "Dungeon move forward 2": "nguyên mẫu hầm ngục: không có mô tả, không có bước con nào mang tên Dungeon",
}

# Nối bước con bằng tay. NextEncounterOnSelection bị máy chủ xoá ([BazaarObfuscate], CODE-RUN §0.2) và cards.json
# không có tham chiếu Id nào từ sự kiện tới bước con (đã quét mọi chuỗi bằng Id thẻ: chỉ có Id vật phẩm). Bảng dưới
# ghép theo tên/mô tả/ảnh của bước mồ côi; mỗi dòng ghi nguồn. Mục con: "Tên nội bộ" (bước → sự kiện → trận theo thứ tự
# tra), hoặc "id:xxxxxxxx" (8 ký tự đầu Id) khi tên trùng/rỗng. Bước con lọc theo hero ở js/run (Heroes của bước).
CURATED = {
    # [WIKI] thebazaar.wiki.gg "The Docks": làm công ở bến (6 việc, bày 4)
    "The Docks": ("[WIKI]", ["Work as Dockhand", "Work as Maintenace", "Work as Inspector", "Work as Security",
                             "Work as Navigator (Astrolabe)", "Work as Navigator (Star Chart)"]),
    # [WIKI] mobalytics day-guide: Tiny Furry Monster = +Max Health (Pet It) hoặc loot Bạc (Scare It); lựa chọn ẩn khi có
    # Food/Friend/Toy (Feed It / Play Hide and Seek / Play With It)
    "Tiny Furry Creature": ("[WIKI]", ["Pet It", "Scare It", "Feed It", "Play Hide and Seek", "Play With It"]),
    # tên bước mang tên sự kiện: "Gain 3 Strength Statia Free"
    "Statia": ("[TÊN]", ["Gain 100 Max Health Statia Free", "Gain 3 Strength Statia Free", "Gain 3 Toughness Statia Free"]),
    # "This is not the end" = Futura (Fates, CODE-RUN §1.5); 4 bước "Fate's ..." bày 3
    "Futura": ("[TÊN]", ["Fate's Bounty", "Fate's Crossroads", "Fate's Fortunes", "Fate's Legacy"]),
    # Rit "Claim your 3 Wishes": bước "(1st Wish)" có GameDealCards (mở lượt ước 2), "(3rd Wish)" thì không → chuỗi 1→2→3
    "Rit": ("[TÊN]", ["Wish for Wealth (1st Wish)", "Wish for Fame (1st Wish)", "Wish for Immortality (1st Wish)"]),
    "Rit (Return)": ("[TÊN]", ["Wish for Wealth (1st Wish)", "Wish for Fame (1st Wish)", "Wish for Immortality (1st Wish)"]),
    "Rit - Item Spawn": ("[TÊN]", ["Wish for Wealth (1st Wish)", "Wish for Fame (1st Wish)", "Wish for Immortality (1st Wish)"]),
    # "Give Types to your items": mọi bước "<Type> Training" có TActionCardAddTagsList
    "Advanced Training": ("[TÊN]", ["Apparel Training", "Aquatic Training", "Dinosaur Training", "Drone Training",
                                    "Food Training", "Friend Training", "Property Training", "Relic Training",
                                    "Tech Training", "id:5f614ed1", "Toy Training", "Vehicle Training", "id:a0f55739",
                                    "Ray Training"]),
    # "Get a starter skill": các bước "Choose a free <X> Skill" (cũng là lựa chọn của "(Start Skill)", xem START_LINKS)
    "Praeteria": ("[ĐỀ XUẤT]", ["Burn Training", "Crit Training", "Heal Training", "Poison Training", "Shield Training",
                               "Social Training", "id:a658553d", "id:9bf59a81"]),
    "Bounty Hunters": ("[ĐỀ XUẤT]", ["Rise to the Challenge", "Escape to the Sea"]),
    "Fierce Competition - Craft - Speed": ("[TÊN]", ["Gain 10 Speed", "Pile of Gold 5 - Fierce Competition"]),
    "Fierce Competition - Sales - Bronze-tier Value": ("[TÊN]", ["Pile of Gold 5 - Fierce Competition"]),
    "Fierce Competition - Sales - Left Value": ("[TÊN]", ["Pile of Gold 5 - Fierce Competition"]),
    "A Strange Mushroom": ("[TÊN]", ["Strange Mushroom (Trade It)", "Suprise Mushroom - Stronger"]),
    "Suprise Mushroom - Stronger": ("[ĐỀ XUẤT]", ["Eat it - speed"]),
    "Mandala": ("[TÊN]", ["Transform leftmost (Small)", "Transform Leftmost (Medium)", "Transform Leftmost (Large)"]),
    "Wink": ("[TÊN]", ["Pay Wink's Toll"]),
    "Ifrit": ("[ĐỀ XUẤT]", ["Ifrit's Endowment", "Vital Sacrifice"]),
    "Gumball Machine (Event)": ("[TÊN]", ["Get a Gumball (10)", "Get 5 Gumballs (10)"]),
    "Tok's Clocks (Charged Up More)": ("[ĐỀ XUẤT]", ["Charged Up"]),
    "Star Chart Treasure": ("[ĐỀ XUẤT]", ["Treasure Location"]),
    "Gulch's Dive": ("[ĐỀ XUẤT]", ["Lost Treasure"]),
    "Claw Game": ("[ĐỀ XUẤT]", ["Free Samples", "Regular Set", "Premium Set"]),
    "Chef Brolin": ("[ĐỀ XUẤT]", ["[EncounterStep] Add Stove", "[EncounterStep] Add Cooler"]),
    "Chef Brolin (Level Up)": ("[ĐỀ XUẤT]", ["[EncounterStep] Add Stove", "[EncounterStep] Add Cooler"]),
    "Dooley's Crib": ("[ĐỀ XUẤT]", ["Assault Protocol", "Barrier Protocol", "Escalation Protocol", "Firestorm Protocol",
                                   "Optimization Protocol", "Titan Protocol", "Firmware Upgrade", "Core Study",
                                   "Reinforce Firewall", "Heat Sync", "Friendship is Magic", "Call a Friend", "Pal Around"]),
    "Reflecting Pool": ("[ĐỀ XUẤT]", ["Transfiguration", "Introspection", "id:72f38f36", "Transform Reagents",
                                     "Hunt for Reagents"]),
    "Rebel Hideout Upgrade (Day 5+)": ("[ĐỀ XUẤT]", ["Force Amplifier", "Showcase Arsenal", "No Pain No Gain",
                                                    "Best Friend", "Just Keep Swimming", "Gunpowder"]),
    "Investment Pitch": ("[ĐỀ XUẤT]", ["Invest", "Investment Package", "Landlord", "Open House", "Hard Assets",
                                      "Appreciated Value", "Opportunity", "Setup Tourist Attraction"]),
    "The Financial District - Merchant Investment - B1&B2 - Small": (
        "[TÊN]", ["The Financial District - Merchant Investment - Small Investment Payout",
                  "The Financial District - Merchant Investment - Decline"]),
    # Rừng Greenheart: chuỗi nhiều tầng, tên nội bộ nối tầng ("... Help ...", "... Watch ...", "... Run ...")
    "Greenheart Help Jules Start": ("[TÊN]", ["Greenheart Ambush Run", "Greenheart Ambush Run Gold",
                                             "Greenheart Ambush Run Speed"]),
    "Greenheart Ambush Run Gold": ("[TÊN]", ["Greenheart Ambush Run Gold-tier Reward"]),
    "Greenheart Ambush Run Speed": ("[ĐỀ XUẤT]", ["Run With It"]),
    "Greenheart Help Merchant": ("[TÊN]", ["Greenheart Help Merchant Help Free Weapon",
                                          "Greenheart Help Merchant Help Thanks Upgrade Weapon",
                                          "Greenheart Help Merchant Watch Merchant Run item",
                                          "Greenheart Help Merchant Watch drop Gold"]),
    "Greenheart Help Merchant Help Thanks Upgrade Weapon": ("[TÊN]", ["Greenheart Help Merchant Help Thanks Upgrade item"]),
    "Greenheart Help Merchant Watch drop Gold": ("[ĐỀ XUẤT]", ["Collect Gold"]),
    "Greenheart Monster Lair Track Gold": ("[TÊN]", ["Greenheart Monster Lair Hide Track Help Return Gold"]),
    "Greenheart Monster Lair Hide Sniffed Out": ("[TÊN]", ["Greenheart Monster Lair Hide item"]),
    # Trận: lựa chọn duy nhất là thẻ TCardEncounterCombat
    "Treasure Chest (Mimic)": ("[TÊN]", ["Mimic"]),
    "Sparring Partner (Encounter)": ("[TÊN]", ["Sparring Partner (Monster)"]),
    # bổ sung cho sự kiện đã nối được một phần
    "Artisan Dunes": ("[TÊN]", ["Apprentice Banehand", "Apprentice Flamewright", "Apprentice Weaponsmith",
                               "Find Better Craftsman"]),
    "BazaarCON": ("[ĐỀ XUẤT]", ["Artist Alley", "Swag Collector", "Self Portrait"]),
}
# Sự kiện L1 không có bước con, mô tả là "Get/Gain <bộ lọc>" → chia thẻ theo mô tả như sự kiện "pile" [ĐỀ XUẤT]
DESC_PILE = {"Greenheart Help Merchant Help Free Weapon", "Greenheart Help Merchant Watch Merchant Run item",
             "Financial District - Seminar - Premium - Reward"}
# "Fight a Monster" (Epic Battle / Deadly Duel): thẻ trận cụ thể bị xoá; js/run chọn quái theo ngày ở bậc FightTier [ĐỀ XUẤT]
FIGHT_DESC = "Fight a Monster"
# Bước dẫn tiếp (GameDealCards của bước bày bộ chọn mới; SpawnContext bị xoá) — ghép theo tên
THEN = {
    "Rise to the Challenge": ["Bounty Hunter Fight"],
    "Find Better Craftsman": ["Banehand", "Flamewright", "Weaponsmith"],
    "Wish for Wealth (1st Wish)": ["Wish for Wealth (2nd Wish)", "Wish for Fame (2nd Wish)", "id:1f5ca306"],
    "Wish for Fame (1st Wish)": ["Wish for Wealth (2nd Wish)", "Wish for Fame (2nd Wish)", "id:1f5ca306"],
    "Wish for Immortality (1st Wish)": ["Wish for Wealth (2nd Wish)", "Wish for Fame (2nd Wish)", "id:1f5ca306"],
    "Wish for Wealth (2nd Wish)": ["Wish for Wealth (3rd Wish)", "Wish for Fame (3rd Wish)", "id:9fb3c997"],
    "Wish for Fame (2nd Wish)": ["Wish for Wealth (3rd Wish)", "Wish for Fame (3rd Wish)", "id:9fb3c997"],
    "id:1f5ca306": ["Wish for Wealth (3rd Wish)", "Wish for Fame (3rd Wish)", "id:9fb3c997"],
}
# Bước "Choose a free <X> Skill" = lựa chọn của sự kiện "(Start Skill)" [ĐỀ XUẤT]: Heroes của 8 bước khớp đúng 3 lựa chọn
# của Pygmalien (Weapon/Heal/Shield) và 5 của Vanessa; js/run lọc theo hero.
TRAININGS = ["Burn Training", "Crit Training", "Heal Training", "Poison Training", "Shield Training",
             "Social Training", "id:a658553d", "id:9bf59a81"]


def loc_text(c, key):
    return ((c.get("Localization") or {}).get(key) or {}).get("Text")


def enc_days(name):
    """"Cache of Riches (Day 1 to 2)" -> [1, 2]; "(Day 5+)" -> [5, 99]; "(Day 9)" -> [9, 9]; không có -> None."""
    m = DAYS_RE.search(name or "")
    if not m:
        return None
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else (99 if m.group(3) else lo)
    return [lo, hi]


def step_keys(name):
    """Khoá nối bước về sự kiện cha theo tên nội bộ: "[Bex] 1st Quarter" -> Bex, "Upgrade (Botul)" -> Botul,
    "Haddy - Bag of Gold" -> Haddy, "A Strange Mushroom (Sell It)" -> A Strange Mushroom (phần trước ngoặc cuối)."""
    keys = []
    m = re.match(r"^\[([^\]]+)\]", name)
    if m:
        keys.append(m.group(1))
    m = re.search(r"^(.*?)\s*\(([^()]+)\)\s*$", name)
    if m:
        keys.append(m.group(2))
        if m.group(1):
            keys.append(m.group(1))
    if not keys and " - " in name:
        keys.append(name.rsplit(" - ", 1)[0])
    return keys


def enc_limit(sc):
    lim = ((sc or {}).get("SpawnContext") or {}).get("Limit") or {}
    if lim.get("$type") == "TRangeValue":
        return [int(lim.get("MinValue") or 0), int(lim.get("MaxValue") or 0)]
    v = lim.get("Value")
    return int(v) if v is not None else None


def card_ids_in(o, ids, out):
    """Mọi chuỗi trong o trùng Id một thẻ trong `ids` → out (giữ thứ tự gặp). Tham chiếu nằm ở trường "Id" của
    điều kiện (TCardConditionalId.Id), nên bên gọi tự loại Id của chính bản ghi."""
    if isinstance(o, dict):
        for v in o.values():
            card_ids_in(v, ids, out)
    elif isinstance(o, list):
        for v in o:
            card_ids_in(v, ids, out)
    elif isinstance(o, str) and o in ids and o not in out:
        out.append(o)


def write_encounters(cards, byid, monster_ids):
    """data/encounters.js cho vòng chơi (games/bazaar/js/run). Mỗi bản ghi gọn: Id, InternalName, Title, Desc, StartingTier,
    Heroes, Tags, ArtKey, Xp (= ExperienceAwardUponSelection), Days (từ tên), LevelUp (tên có "(Level Up)"), Abilities (DSL).
    - events: Kind = merchant (Tags Merchant hoặc "Sells ..."), instant (không SelectionContext: ability chạy khi chọn),
      pile (chọn miễn phí: SelectionIsFree; hoặc DESC_PILE), choice (có bước con: Steps), fight ("Fight a Monster": FightTier,
      hoặc lựa chọn chỉ là trận), chain (lựa chọn chỉ là sự kiện con), unknown (không nối được gì).
      Rules = SelectionContext.Rules, Limit = số thẻ bày ra (TRangeValue -> [min, max]).
      Steps = Id bước con (TCardEncounterStep, trong `steps`), js/run bày `Limit` bước lọc theo hero.
      Options = mọi lựa chọn theo thứ tự [{t:'step'|'event'|'combat', id}] — chỉ ghi khi có lựa chọn không phải bước.
      Link = cách nối: 'id' (tham chiếu Id trong JSON), 'name' (tên nội bộ), 'curated' (bảng CURATED), 'desc'.
      LinkSrc = nguồn của dòng CURATED ([WIKI]/[TÊN]/[ĐỀ XUẤT]). Parents = Id sự kiện cha (sự kiện con trong chuỗi).
    - steps: bước được nối + mọi bước "(Level Up)" + bước dẫn tiếp; Then = [{t, id}] bộ chọn kế tiếp (THEN) khi biết.
    - pedestals: Criteria = SelectionCriteria (DSL TCardConditional*); Behavior bị xoá -> js/run suy ra từ Desc.
    - combats: thẻ quái (Monster = MonsterTemplateId, Level, Gold/XpReward) có template trong monsters.json.
    - starts: sự kiện mở màn của hero "(Start Run)", "(Start Run 2)", "(Start Skill)" — tách khỏi events để không lọt vào bể
      giờ tự do; Hero, Role ('run'|'run2'|'skill'), Steps khi biết (Start Skill → TRAININGS).
    - expeditions: {events, steps, combats} của chuyến thám hiểm cần vé (Crash Site, Temple), chưa vào vòng chơi.
    Bỏ bản DEBUG/Tutorial/DEFUNCT/Internal/TEMPLATE và UNUSABLE (in lý do)."""
    by_type = collections.defaultdict(list)
    for c in cards:
        by_type[c["$type"]].append(c)
    enc_ids = {c["Id"] for t in ("TCardEncounterEvent", "TCardEncounterStep", "TCardEncounterCombat",
                                 "TCardEncounterPedestal") for c in by_type[t]}
    dropped = []

    def base(c):
        o = {"Id": c["Id"], "InternalName": c.get("InternalName"), "Title": loc_text(c, "Title"),
             "Desc": loc_text(c, "Description"), "StartingTier": c.get("StartingTier"), "Heroes": c.get("Heroes") or [],
             "Tags": c.get("Tags") or [], "ArtKey": c.get("ArtKey"), "Xp": c.get("ExperienceAwardUponSelection") or 0}
        d = enc_days(c.get("InternalName"))
        if d:
            o["Days"] = d
        if "(Level Up)" in (c.get("InternalName") or ""):
            o["LevelUp"] = True
        if c.get("Abilities"):
            o["Abilities"] = strip(c["Abilities"], False)
        return o

    def event_rec(c):
        o = base(c)
        sc = c.get("SelectionContext")
        if sc:
            o["Rules"] = strip(sc.get("Rules") or {}, False)
            o["Limit"] = enc_limit(sc)
        return o

    def combat_rec(c):
        ct = c.get("CombatantType") or {}
        o = base(c)
        o.update({"Monster": ct.get("MonsterTemplateId"), "Level": ct.get("Level"),
                  "Gold": c.get("RewardCombatGold") or 0, "XpReward": c.get("RewardCombatXp") or 0})
        return o

    # tra tên → (loại, Id) cho bảng tay
    names = collections.defaultdict(list)
    for t, tag in (("TCardEncounterStep", "step"), ("TCardEncounterEvent", "event"), ("TCardEncounterCombat", "combat")):
        for c in by_type[t]:
            names[c.get("InternalName") or ""].append((tag, c["Id"]))
    id8 = {c["Id"][:8]: c["Id"] for c in cards}
    tag_of = {"TCardEncounterStep": "step", "TCardEncounterEvent": "event", "TCardEncounterCombat": "combat"}

    def resolve(spec, where):
        if spec.startswith("id:"):
            cid = id8.get(spec[3:])
            if not cid:
                raise SystemExit(f"CURATED {where}: không có thẻ id {spec}")
            return tag_of[byid[cid]["$type"]], cid
        hits = [h for h in names.get(spec, []) if not ENC_DROP.search(spec)]
        for pref in ("step", "event", "combat"):
            got = [h for h in hits if h[0] == pref]
            if len(got) == 1:
                return got[0]
            if len(got) > 1:
                raise SystemExit(f"CURATED {where}: tên '{spec}' trùng {len(got)} {pref}, dùng id:")
        raise SystemExit(f"CURATED {where}: không tìm thấy '{spec}'")

    events, steps, peds, combats, starts = {}, {}, {}, {}, {}
    exped = {"events": {}, "steps": {}, "combats": {}}
    raw_events = {}
    for c in by_type["TCardEncounterEvent"]:
        name = c.get("InternalName") or ""
        if ENC_DROP.search(name):
            continue
        if name in UNUSABLE:
            dropped.append((name, UNUSABLE[name]))
            continue
        o = event_rec(c)
        if EXPEDITION_RE.search(name):
            exped["events"][c["Id"]] = o
            continue
        m = START_RE.search(name)
        if m:
            o["Hero"] = [h for h in o["Heroes"] if h in HEROES][0]
            o["Role"] = {"Start Run": "run", "Start Run 2": "run2", "Start Skill": "skill"}[m.group(1)]
            starts[c["Id"]] = o
            continue
        sc = c.get("SelectionContext")
        desc = o["Desc"] or ""
        if "Merchant" in o["Tags"] or (sc and desc.startswith("Sells ")):
            o["Kind"] = "merchant"
        elif not sc:
            o["Kind"] = "instant"
        elif (sc.get("Rules") or {}).get("SelectionIsFree"):
            o["Kind"] = "pile"
        else:
            o["Kind"] = "unknown"
        events[c["Id"]] = o
        raw_events[c["Id"]] = c
    before_unknown = sorted(e["InternalName"] for e in events.values() if e["Kind"] == "unknown")

    opts = collections.defaultdict(list)  # event Id -> [(t, id)]
    how = {}

    def add_opt(eid, t, cid, mode):
        if (t, cid) not in opts[eid] and cid != eid:
            opts[eid].append((t, cid))
            how.setdefault(eid, mode)

    # 1) tham chiếu Id trong JSON của sự kiện (NextEncounterOnSelection bị xoá nên hiện ra 0; giữ để bản DB sau có thì dùng)
    n_id = 0
    for eid, c in raw_events.items():
        found = []
        card_ids_in(c, enc_ids, found)
        for cid in found:
            if cid == eid:
                continue
            add_opt(eid, tag_of.get(byid[cid]["$type"], "pedestal"), cid, "id")
            n_id += 1
    # 2) tên nội bộ của bước: [Ngoặc vuông], (ngoặc tròn cuối), "A - B", phần trước ngoặc tròn
    by_name = collections.defaultdict(list)
    for eid, e in events.items():
        if e["Kind"] in ("unknown",) or eid in opts:
            by_name[e["InternalName"]].append(eid)
            if e["Title"] and e["Title"] != e["InternalName"]:
                by_name[e["Title"]].append(eid)
            m = re.match(r"^\[([^\]]+)\]", e["InternalName"])
            if m:
                by_name[m.group(1)].append(eid)
    n_name = 0
    for s in by_type["TCardEncounterStep"]:
        name = s.get("InternalName") or ""
        if ENC_DROP.search(name) or EXPEDITION_RE.search(name):
            continue
        for key in step_keys(name):
            parents = by_name.get(key) or []
            for p in parents:
                add_opt(p, "step", s["Id"], "name")
                n_name += 1
            if parents:
                break
    # 3) bảng tay
    n_cur = 0
    ev_by_name = {e["InternalName"]: eid for eid, e in events.items()}
    for ename, (src, specs) in CURATED.items():
        eid = ev_by_name.get(ename)
        if not eid:
            raise SystemExit(f"CURATED: không có sự kiện '{ename}'")
        for spec in specs:
            t, cid = resolve(spec, ename)
            add_opt(eid, t, cid, "curated")
            n_cur += 1
        events[eid]["LinkSrc"] = src

    # gắn kết quả
    keep_steps = []
    for eid, e in events.items():
        o = opts.get(eid) or []
        if e["Kind"] == "unknown" and e["InternalName"] in DESC_PILE:
            e["Kind"], e["Link"] = "pile", "desc"
            continue
        if e["Kind"] == "unknown" and (e["Desc"] or "") == FIGHT_DESC and not o:
            e["Kind"], e["Link"], e["FightTier"] = "fight", "desc", e["StartingTier"]
            continue
        if not o or e["Kind"] in ("merchant", "instant"):
            continue
        if e["Kind"] == "pile" and how.get(eid) != "curated":
            continue
        st = [cid for t, cid in o if t == "step"]
        e["Link"] = how[eid]
        if st:
            e["Kind"] = "choice"
            e["Steps"] = st
            keep_steps += st
        elif any(t == "combat" for t, _ in o):
            e["Kind"] = "fight"
        else:
            e["Kind"] = "chain"
        if any(t != "step" for t, _ in o):
            e["Options"] = [{"t": t, "id": cid} for t, cid in o]
        for t, cid in o:
            if t == "event" and cid in events:
                events[cid].setdefault("Parents", []).append(eid)
    for eid, e in events.items():
        if e["Kind"] == "unknown":
            dropped.append((e["InternalName"], "không nối được lựa chọn nào: bước con và NextEncounterOnSelection bị máy chủ "
                                               "xoá, không có bước mồ côi nào khớp tên/mô tả"))
    for e in events.values():
        if "Parents" in e:
            e["Parents"] = sorted(set(e["Parents"]))

    # starts: "(Start Skill)" → bước luyện kỹ năng [ĐỀ XUẤT]
    train_ids = [resolve(s, "TRAININGS")[1] for s in TRAININGS]
    for e in starts.values():
        if e["Role"] == "skill":
            e["Steps"], e["Link"], e["LinkSrc"] = list(train_ids), "curated", "[ĐỀ XUẤT]"
            keep_steps += train_ids

    # steps: đã nối + (Level Up) + dẫn tiếp
    then = {}
    for sname, specs in THEN.items():
        _, sid = resolve(sname, "THEN")
        then[sid] = [resolve(x, "THEN " + sname) for x in specs]
    keep = set(keep_steps)
    changed = True
    while changed:  # bao đóng theo Then
        changed = False
        for sid in list(keep):
            for t, cid in then.get(sid, []):
                if t == "step" and cid not in keep:
                    keep.add(cid)
                    changed = True
    # Gumball: "Get a Gumball (n)" bày (n-1); "Get 5 Gumballs (n)" bày (n-5) — số "[Gumballs Remaining: n]" trong mô tả
    gum = {}
    for s in by_type["TCardEncounterStep"]:
        m = re.match(r"^Get (a Gumball|5 Gumballs) \((\d+)\)$", s.get("InternalName") or "")
        if m:
            gum[(m.group(1), int(m.group(2)))] = s["Id"]
    for (kind, n), sid in gum.items():
        if sid in keep:
            nxt = n - (1 if kind == "a Gumball" else 5)
            then[sid] = [("step", gum[k]) for k in (("a Gumball", nxt), ("5 Gumballs", nxt)) if k in gum]
    changed = True
    while changed:
        changed = False
        for sid in list(keep):
            for t, cid in then.get(sid, []):
                if t == "step" and cid not in keep:
                    keep.add(cid)
                    changed = True
    for s in by_type["TCardEncounterStep"]:
        name = s.get("InternalName") or ""
        if ENC_DROP.search(name):
            continue
        if EXPEDITION_RE.search(name):
            exped["steps"][s["Id"]] = base(s)
            continue
        if s["Id"] in keep or "(Level Up)" in name:
            o = base(s)
            if s["Id"] in then:
                o["Then"] = [{"t": t, "id": cid} for t, cid in then[s["Id"]]]
            steps[s["Id"]] = o

    for c in by_type["TCardEncounterPedestal"]:
        if not ENC_DROP.search(c.get("InternalName") or ""):
            o = base(c)
            o["Criteria"] = strip(c.get("SelectionCriteria"), False)
            peds[c["Id"]] = o
    no_mon = []
    for c in by_type["TCardEncounterCombat"]:
        name = c.get("InternalName") or ""
        if ENC_DROP.search(name):
            continue
        ct = c.get("CombatantType") or {}
        if ct.get("MonsterTemplateId") not in monster_ids:
            no_mon.append(name)
            continue
        if EXPEDITION_RE.search(name):
            exped["combats"][c["Id"]] = combat_rec(c)
        else:
            combats[c["Id"]] = combat_rec(c)
    # lựa chọn trỏ tới trận không có quái: bỏ khỏi Options
    for e in events.values():
        if "Options" in e:
            e["Options"] = [x for x in e["Options"] if x["t"] != "combat" or x["id"] in combats]
    for s in steps.values():
        if "Then" in s:
            s["Then"] = [x for x in s["Then"] if x["t"] != "combat" or x["id"] in combats]

    data = {"events": events, "steps": steps, "pedestals": peds, "combats": combats, "starts": starts,
            "expeditions": exped}
    kinds = collections.Counter(e["Kind"] for e in events.values())
    links = collections.Counter(e.get("Link") for e in events.values() if e.get("Link"))
    note = (f"{len(events)} events ({', '.join(f'{k} {v}' for k, v in sorted(kinds.items()))}; links "
            f"{', '.join(f'{k} {v}' for k, v in sorted(links.items()))}), {len(steps)} steps, {len(peds)} pedestals, "
            f"{len(combats)} combats, {len(starts)} hero starts, expeditions {len(exped['events'])}/"
            f"{len(exped['steps'])}/{len(exped['combats'])}.")
    p, n = write_js("encounters.js", "BZ_ENCOUNTERS", data, note)
    after_unknown = [e["InternalName"] for e in events.values() if e["Kind"] == "unknown"]
    print("encounters:", note)
    print(f"  links: by Id {n_id}, by name {n_name}, curated {n_cur}")
    print(f"  unknown before {len(before_unknown)} -> after {len(after_unknown)} "
          f"(recovered {len(before_unknown) - len(after_unknown)})")
    for name, why in dropped:
        print(f"  dropped: {name}: {why}")
    print(f"  combat cards without a monster template (dropped): {len(no_mon)}: {', '.join(sorted(no_mon))}")
    print(f"{p}: {n} bytes ({n / 1048576:.2f} MB)")
    return data


# ------------------------------------------------------------------------------------------------------------------
# Hero
# ------------------------------------------------------------------------------------------------------------------
def write_heroes(cards, byid, enc, card_files, pool_counts):
    """data/heroes.js: window.BZ_HEROES = {
      order: [7 hero + 'TheDragons'],
      cardFiles: {common: 'data/cards-common.js', Vanessa: 'data/cards-vanessa.js', ...}  (đường dẫn so với index.html)
      heroes: {<Hero>: {
        id, title, playable (false = không có dữ liệu), cardFile, reason (khi playable false),
        pool: {items, skills, bronzeItems}            số thẻ Heroes có hero này (không tính Common)
        start: {
          events: [Id trong BZ_ENCOUNTERS.starts theo thứ tự chơi: run → run2 → skill],
          skillSteps: [Id bước trong BZ_ENCOUNTERS.steps] lựa chọn kỹ năng mở màn đã lọc theo hero [ĐỀ XUẤT],
          options: [{key, ...}] ba lựa chọn mở màn [WIKI §1.1 start-of-run-guide]: income +12 Gold +2 Income /
                   enchanted Small Bronze item / skill; base 8 Gold + 5 Income,
          fixedSkills: [Id TCardSkill] kỹ năng có sẵn khi vào run,
          playerEffects / socketEffects: [Id trong BZ_HEROES.effects] hiệu ứng nền của hero,
          note }
        levelUp: {pile, teacher, step, pedestal}: [{id, tier}] bể thưởng lên cấp của hero: mọi thẻ "(Level Up)" có Heroes
                 chứa hero hoặc Common, chia như js/run/clock.js levelUpPool (teacher = Desc có "teaches"); id tra trong
                 BZ_ENCOUNTERS.events / steps / pedestals theo tên nhóm (step → steps, pedestal → pedestals, còn lại events).
        merchants: [Id event] thương nhân chỉ của hero này; events: [Id event] sự kiện chỉ của hero này (không Common).
      }},
      effects: {Id: TCardPlayerEffect | TCardSocketEffect đã strip}
    }"""
    E = enc
    heroes = {}
    eff_ids = []

    def find(name, t=None):
        hits = [c for c in cards if c.get("InternalName") == name and (t is None or c["$type"] == t)]
        if len(hits) != 1:
            raise SystemExit(f"heroes: '{name}' khớp {len(hits)} thẻ")
        return hits[0]["Id"]

    def ok(rec, h):
        hs = rec.get("Heroes") or []
        return not hs or "Common" in hs or h in hs

    lu_sorted = []
    for group, src in (("event", E["events"]), ("step", E["steps"]), ("pedestal", E["pedestals"])):
        for cid, r in src.items():
            if r.get("LevelUp"):
                lu_sorted.append((group, cid, r))
    rage = find("Karnok's Rage", "TCardSkill")
    base_rage, enrage_pic = find("Base Rage Effect"), find("Enrage portrait update")
    stove, cooler = find("[Stove] Socket Effect"), find("[Cooler] Socket Effect")
    eff_ids = [base_rage, enrage_pic, stove, cooler]
    fixed = {"Karnok": {"fixedSkills": [rage], "playerEffects": [base_rage, enrage_pic],
                        "note": "[WIKI keywords] Karnok vào run với kỹ năng Karnok's Rage (dùng đồ tích Rage, đủ 100 thì Enrage); "
                                "Base Rage Effect = hiệu ứng Enrage (xoá Slow/Freeze, giảm hồi chiêu) [ĐO TRONG REPO cards.json]. "
                                "Không có sự kiện (Start Run) trong DB: mở màn theo `options` chung."},
             "Jules": {"socketEffects": [stove, cooler],
                       "note": "Không có sự kiện (Start Run) trong DB ('Greenheart Help Jules Start' là sự kiện Common). "
                               "Bếp của Jules là ô Stove/Cooler (TCardSocketEffect) do bước 'Add Stove'/'Add Cooler' tạo; "
                               "vào run có sẵn ô nào không rõ [ĐỀ XUẤT: không, mở màn theo `options` chung]."},
             "Dooley": {"note": "(Start Run) rồi (Start Run 2) 'Starting Package'; nội dung gói bị xoá. Lõi (Core) chọn ở "
                                "sự kiện 'Core Initialization' (Choose a Core, 5 lựa chọn) [ĐO TRONG REPO]."}}
    for h in HEROES + [HERO8]:
        hid = h
        cnt = pool_counts.get(h, {"items": 0, "skills": 0, "bronzeItems": 0})
        if h == HERO8:
            heroes[h] = {"id": h, "title": "The Dragons", "playable": False, "cardFile": None, "pool": cnt,
                         "reason": "EHero.Hero8 chỉ có tên (LocalizableShared.cs:102), màu (HeroColorSO) và CardAudio; "
                                   "GameData.db không có thẻ, sự kiện hay bàn quái nào của hero này (bản demo chưa phát hành)."}
            continue
        st = sorted([s for s in E["starts"].values() if s["Hero"] == h],
                    key=lambda s: ("run", "run2", "skill").index(s["Role"]))
        skill_steps = []
        for s in st:
            for sid in s.get("Steps") or []:
                if ok(E["steps"][sid], h) and sid not in skill_steps:
                    skill_steps.append(sid)
        if not skill_steps:  # hero không có (Start Skill): vẫn đưa bể kỹ năng mở màn đã lọc theo hero [ĐỀ XUẤT]
            for sid in [x for s in E["starts"].values() if s["Role"] == "skill" for x in s["Steps"]]:
                r = E["steps"][sid]
                if h in (r.get("Heroes") or []) and sid not in skill_steps:
                    skill_steps.append(sid)
        f = fixed.get(h, {})
        lu = {"pile": [], "teacher": [], "step": [], "pedestal": []}
        for group, cid, r in lu_sorted:
            if not ok(r, h) or r.get("Kind") in ("unknown", "merchant"):
                continue
            if group == "event" and re.search(r"teaches", r.get("Desc") or "", re.I):
                lu["teacher"].append({"id": cid, "tier": r["StartingTier"]})
            elif group == "event" and r.get("Kind") == "pile":
                lu["pile"].append({"id": cid, "tier": r["StartingTier"]})
            elif group == "event":
                lu["step"].append({"id": cid, "tier": r["StartingTier"], "event": True})
            else:
                lu[group].append({"id": cid, "tier": r["StartingTier"]})
        heroes[h] = {
            "id": hid, "title": h, "playable": True, "cardFile": card_files[h], "pool": cnt,
            "start": {"events": [s["Id"] for s in st], "skillSteps": skill_steps,
                      "options": [{"key": "income", "gold": 12, "income": 2},
                                  {"key": "item", "size": "Small", "tier": "Bronze", "enchanted": True},
                                  {"key": "skill", "tier": "Bronze"}],
                      "baseGold": 8, "baseIncome": 5,
                      "fixedSkills": f.get("fixedSkills", []), "playerEffects": f.get("playerEffects", []),
                      "socketEffects": f.get("socketEffects", []),
                      "note": f.get("note", "Sự kiện (Start Run) có trong DB nhưng lựa chọn bên trong bị xoá; dùng `options` "
                                            "[WIKI §1.1].")},
            "levelUp": lu,
            "merchants": [eid for eid, e in E["events"].items() if e["Kind"] == "merchant" and e["Heroes"] == [h]],
            "events": [eid for eid, e in E["events"].items() if e["Kind"] != "merchant" and h in e["Heroes"]
                       and "Common" not in e["Heroes"] and not e.get("LevelUp")],
        }
    effects = {i: strip(byid[i]) for i in eff_ids}
    data = {"order": HEROES + [HERO8], "cardFiles": card_files, "heroes": heroes, "effects": effects}
    note = (f"{len(HEROES)} playable heroes + {HERO8} (no data); start events, start skill steps, level-up pools, "
            f"hero merchants/events, {len(effects)} hero effects.")
    p, n = write_js("heroes.js", "BZ_HEROES", data, note)
    print("heroes:", note)
    for h in HEROES:
        x = heroes[h]
        print(f"  {h}: start events {len(x['start']['events'])}, start skills {len(x['start']['skillSteps'])}, "
              f"fixed {len(x['start']['fixedSkills'])}, level-up pile {len(x['levelUp']['pile'])} teacher "
              f"{len(x['levelUp']['teacher'])} step {len(x['levelUp']['step'])} pedestal {len(x['levelUp']['pedestal'])}, "
              f"merchants {len(x['merchants'])}, own events {len(x['events'])}")
    print(f"{p}: {n} bytes ({n / 1048576:.2f} MB)")


def main():
    db = None
    if "--db" in sys.argv:
        db = sys.argv[sys.argv.index("--db") + 1]
    con, dbpath = open_db(db)
    cards = rows(con, "cards")
    monsters = rows(con, "monsters")
    modes = rows(con, "game_modes")
    levelups = sorted(rows(con, "level_ups"), key=lambda r: r["Level"])
    tooltips = rows(con, "tooltips")
    byid = {c["Id"]: c for c in cards}
    os.makedirs(OUT, exist_ok=True)

    enc = write_encounters(cards, byid, {m["Id"] for m in monsters})

    # ---- chia thẻ ----
    playable = [c for c in cards if c["$type"] in CARD_TYPES]
    item_ids = {c["Id"] for c in playable}
    mon_ref, missing = [], []
    for m in monsters:
        p = m["Player"]
        for it in list(p["Hand"].get("Items") or []) + list((p.get("Stash") or {}).get("Items") or []) \
                + list(p.get("Skills") or []):
            tid = it["TemplateId"]
            if tid in byid:
                mon_ref.append(tid)
            else:
                missing.append((m["InternalName"], tid))
    enc_ref = []
    card_ids_in(enc, item_ids, enc_ref)
    hero_ref = [c["Id"] for c in playable if c.get("InternalName") == "Karnok's Rage"]  # bước "Inspired by Karnok" (hero khác) trao nó
    common = set(mon_ref) | set(enc_ref) | set(hero_ref)
    per_hero = {h: [] for h in HEROES}
    for c in playable:
        hs = [h for h in (c.get("Heroes") or []) if h in HEROES]
        if c["Id"] in common or "Common" in (c.get("Heroes") or []) or len(hs) != 1:
            common.add(c["Id"])
        else:
            per_hero[hs[0]].append(c["Id"])
    stripped = {c["Id"]: strip(c) for c in playable}
    order = [c["Id"] for c in playable]  # thứ tự bảng (Id): ổn định giữa các lần chạy
    files = {"common": "cards-common.js"}
    for h in HEROES:
        files[h] = f"cards-{h.lower()}.js"
    results = []
    com_list = [(i, stripped[i]) for i in order if i in common]
    n_it = sum(1 for i, c in com_list if c["$type"] == "TCardItem")
    results.append(("common", write_cards_part(
        files["common"], "common", com_list,
        f"{len(com_list)} templates ({n_it} TCardItem, {len(com_list) - n_it} TCardSkill): Heroes Common, cards of 2+ heroes, "
        f"every card a monster uses ({len(set(mon_ref))}) or an encounter references by Id ({len(enc_ref)}), Karnok's Rage.")))
    for h in HEROES:
        lst = [(i, stripped[i]) for i in order if i in set(per_hero[h])]
        n_it = sum(1 for i, c in lst if c["$type"] == "TCardItem")
        results.append((h, write_cards_part(
            files[h], h.lower(), lst,
            f"{len(lst)} templates ({n_it} TCardItem, {len(lst) - n_it} TCardSkill) whose only hero is {h} and no monster/"
            f"encounter uses; the rest of {h}'s pool is in cards-common.js.")))
    shim = write_cards_shim([files[k][:-3] for k in ["common"] + HEROES])

    pool_counts = {}
    for h in HEROES:
        its = [c for c in playable if h in (c.get("Heroes") or [])]
        pool_counts[h] = {"items": sum(1 for c in its if c["$type"] == "TCardItem"),
                          "skills": sum(1 for c in its if c["$type"] == "TCardSkill"),
                          "bronzeItems": sum(1 for c in its if c["$type"] == "TCardItem" and c["StartingTier"] == "Bronze")}
    card_files = {k: "data/" + v for k, v in files.items()}
    write_heroes(cards, byid, enc, card_files, pool_counts)

    # ---- quái ----
    encm = {}
    for c in cards:
        if c["$type"] != "TCardEncounterCombat":
            continue
        ct = c.get("CombatantType") or {}
        mid = ct.get("MonsterTemplateId")
        if not mid:
            continue
        encm.setdefault(mid, []).append({
            "Id": c["Id"], "InternalName": c.get("InternalName"), "Title": loc_text(c, "Title"),
            "StartingTier": c.get("StartingTier"), "Level": ct.get("Level"),
            "RewardCombatGold": c.get("RewardCombatGold"), "RewardCombatXp": c.get("RewardCombatXp"),
            "SandstormEnabled": c.get("SandstormEnabled"), "ArtKey": c.get("ArtKey"),
        })
    out_mons = []
    for m in monsters:
        sm = strip(m)
        sm["Encounters"] = encm.get(m["Id"], [])
        out_mons.append(sm)
    mode = {"mode": strip(modes[0]), "levelUps": strip(levelups), "tooltips": strip(tooltips[0])}
    r2 = write_js("monsters.js", "BZ_MONSTERS", out_mons,
                  f"{len(out_mons)} monsters; Encounters = TCardEncounterCombat cards pointing at each (derived).")
    r3 = write_js("mode.js", "BZ_MODE", mode, "TGameMode + level_ups + tooltips keyword glossary.")

    print("db:", dbpath)
    total = 0
    for k, (p, n, ne) in results:
        total += n
        print(f"{p}: {n} bytes ({n / 1048576:.2f} MB), {ne} enchantment blocks")
    print(f"cards total {total} bytes ({total / 1048576:.2f} MB); playable templates {len(playable)} = common "
          f"{len(com_list)} + per-hero {sum(len(v) for v in per_hero.values())}; monster refs {len(set(mon_ref))}, "
          f"encounter refs {len(enc_ref)}, missing template ids {len(missing)}")
    for mn, tid in missing:
        print("  missing:", mn, tid)
    for h in HEROES:
        pc = pool_counts[h]
        print(f"  pool {h}: items {pc['items']}, skills {pc['skills']} (own file {len(per_hero[h])})")
    print(f"monsters: {len(out_mons)} (with encounter card: {sum(1 for m in out_mons if m['Encounters'])})")
    for p, n in (shim, r2, r3):
        print(f"{p}: {n} bytes ({n / 1048576:.2f} MB)")


if __name__ == "__main__":
    main()
