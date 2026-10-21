# -*- coding: utf-8 -*-
"""Dựng data/shops.js từ cấu hình thật của bazaardb.gg (patch 19.2) thay cho việc đọc chữ mô tả thương nhân.

Chạy lại:

    py -3.12 -I games/bazaar/tools/bazaardb.py [--db D:\\bazaar-ref\\bazaardb]

Nguồn vào: merchants.json, trainers.json, events.json, tier_odds.json, shop_prices_sample.json ở thư mục --db (bóc bằng
D:\\bazaar-ref\\bazaardb\\*.js, xem SUMMARY.md) và dữ liệu thẻ của web (data/cards*.js, data/encounters.js, data/mode.js; nạp bằng
Node một lần để lấy tên thẻ). Bản bazaardb mới hơn DB demo (5.0.0): khớp theo TÊN (hạ chữ thường, bỏ dấu câu), thẻ web không có thì bỏ
và đếm. Mọi tên không khớp in ra theo nhóm kèm số lượng, ghi vào đầu data/shops.js.

Ra: data/shops.js  window.BZ_SHOPS = {patch, merchants, trainers, events, tierOdds, census}
  merchants[encounterId] = {name, pool:[cardId], enchantedPool?, reroll:{n,cost}, tiers?, hero?, sellMod?:{size|tag, plus}, discounted?, days}
  trainers[encounterId]  = {name, pool:[skillId], reroll:{n,cost}, tiers?, days, levelUp}
  events[encounterId]    = {name, days, choices:[{stepId, t, title, stamp?, cond?, heroes?, odds:{"1":pct,...,"all":pct}}]}
  tierOdds = [{day, bronze, silver, gold, diamond}] (ngày 1..16, phần trăm)
Trong tệp, pool là chỉ số vào bảng `ids` cho gọn (khoảng 1/10 dung lượng), đoạn cuối tệp bung lại thành id thẻ khi nạp.
"""
import collections
import json
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
DB = r"D:\bazaar-ref\bazaardb"
if "--db" in sys.argv:
    DB = sys.argv[sys.argv.index("--db") + 1]

DUMP_JS = r"""
global.window=global;const path=require('path'),D=process.argv[1];
['cards','encounters','mode'].forEach(f=>require(path.join(D,'data/'+f+'.js')));
const T=t=>(t.Localization&&t.Localization.Title&&t.Localization.Title.Text)||t.InternalName;
const out={cards:{},events:{},steps:{},prices:BZ_MODE.mode.StandardPrices};
for(const id in BZ_CARDS){const t=BZ_CARDS[id];out.cards[id]={n:T(t),s:t.StartingTier||'Bronze',z:t.Size||null,h:t.Heroes||[],
 k:(t.$type==='TCardSkill'||t.Type==='Skill')?1:0,t:Object.keys(t.Tiers||{}),hid:t.HiddenTags||[]};}
const E=BZ_ENCOUNTERS;
for(const id in E.events){const e=E.events[id];out.events[id]={n:e.Title||e.InternalName,i:e.InternalName,d:e.Desc,k:e.Kind,lu:!!e.LevelUp,
 h:e.Heroes||[],st:e.StartingTier,opts:e.Options||null,steps:e.Steps||null,par:e.Parents||null};}
for(const id in E.steps){const e=E.steps[id];out.steps[id]={n:e.Title||e.InternalName,i:e.InternalName};}
process.stdout.write(JSON.stringify(out));
"""

TIERS = ["Bronze", "Silver", "Gold", "Diamond"]


def nm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower().replace("\u2019", "'"))


def load(name):
    with open(os.path.join(DB, name), encoding="utf-8") as f:
        return json.load(f)


def web_dump():
    r = subprocess.run(["node", "-e", DUMP_JS, GAME], capture_output=True, check=True)
    return json.loads(r.stdout.decode("utf-8"))


def base_name(internal):
    """'Bjorn (Level Up)' -> 'Bjorn'; '[Karnok Unique] Hidden Lake' -> 'Hidden Lake'; 'Kelsa - X' giữ nguyên."""
    s = re.sub(r"^\[[^\]]*\]\s*", "", internal or "")
    return re.sub(r"\s*\([^)]*\)", "", s).strip()


def event_index(W):
    idx = collections.defaultdict(set)
    for i, e in W["events"].items():
        for n in (e["n"], base_name(e["i"])):
            idx[nm(n)].add(i)
        if " - " in e["n"]:
            idx[nm(e["n"].split(" - ", 1)[1])].add(i)
    return idx


def pick_web(W, idx, entry, kinds, level_up):
    """Thẻ web ứng với một mục bazaardb: cùng tên, đúng loại, cùng bậc nếu còn nhiều, đúng bản (Level Up hay ngày)."""
    c = [W["events"][i] | {"id": i} for i in idx.get(nm(entry["name"]), ())]
    c = [e for e in c if e["k"] in kinds]
    if len(c) > 1:
        t = [e for e in c if e["st"] == entry.get("rarity")]
        c = t or c
    return c


def parse_tiers(text):
    m = re.findall(r"\b(Bronze|Silver|Gold|Diamond)-tier", text or "")
    return sorted(set(m), key=TIERS.index)


def hero_mode(text):
    t = text or ""
    if re.search(r"any Hero", t, re.I):
        return "any"
    if re.search(r"other Heroes", t, re.I):
        return "other"
    if re.search(r"this Hero", t, re.I):
        return "this"
    if re.search(r"\bNeutral\b", t):
        return "common"
    return None


def pct(s):
    if s is None:
        return None
    s = str(s).strip()
    if s.startswith("<"):
        return 0.5
    m = re.match(r"([\d.]+)%", s)
    return float(m.group(1)) if m else None


def main():
    W = web_dump()
    M = load("merchants.json")["entries"]
    TR = load("trainers.json")["entries"]
    EV = load("events.json")["entries"]
    TO = load("tier_odds.json")
    PR = load("shop_prices_sample.json")["items"]
    patch = load("merchants.json").get("patch")

    cards = collections.defaultdict(list)
    for i, c in W["cards"].items():
        cards[(nm(c["n"]), c["k"])].append(i)
    idx = event_index(W)

    ids, id_pos = [], {}

    def pos(cid):
        if cid not in id_pos:
            id_pos[cid] = len(ids)
            ids.append(cid)
        return id_pos[cid]

    census = collections.OrderedDict()

    def cen(cat):
        return census.setdefault(cat, {"total": 0, "matched": 0, "unmatched": collections.Counter()})

    def map_pool(items, kind, cat):
        """Mục bazaardb -> danh sách chỉ số id thẻ web (mọi id cùng tên); đếm khớp / không khớp."""
        out, seen = [], set()
        c = cen(cat)
        for it in items:
            c["total"] += 1
            hit = cards.get((nm(it["name"]), kind))
            if not hit:
                c["unmatched"][it["name"]] += 1
                continue
            c["matched"] += 1
            for cid in hit:
                if cid not in seen:
                    seen.add(cid)
                    out.append(pos(cid))
        return out

    # ---------- thương nhân ----------
    merchants = {}
    byname = collections.OrderedDict()
    for a in M:
        byname.setdefault(nm(a["name"]), []).append(a)
    cm = cen("merchant (thẻ gặp gỡ)")
    for key, group in byname.items():
        a = group[0]
        cm["total"] += 1
        web = pick_web(W, idx, a, ("merchant",), False)
        if not web:
            cm["unmatched"][a["name"]] += 1
            continue
        cm["matched"] += 1
        pool, ench, days = [], [], set()
        for g in group:  # thẻ trùng tên (Kev's Armory, Pol): gộp bể và ngày
            for p in map_pool(g["item_pool_full"], 0, "đồ trong bể thương nhân"):
                if p not in pool:
                    pool.append(p)
            if re.search(r"enchanted", g.get("description") or "", re.I):
                for p in map_pool(g["enchanted_pool_full"], 0, "đồ trong bể yểm bùa"):
                    if p not in ench:
                        ench.append(p)
            days.update(g.get("days_active") or [])
        rec = {"pool": pool, "reroll": {"n": a["reroll_count"] if a["reroll_count"] is not None else 1, "cost": a["reroll_cost"]},
               "days": sorted(days)}
        t = parse_tiers(a.get("sells_filter_text") or a.get("description"))
        if t:
            rec["tiers"] = t
        hm = hero_mode(a.get("sells_filter_text"))
        if hm:
            rec["hero"] = hm
        if ench:
            rec["enchantedPool"] = ench
        sm = a.get("sell_price_modifier")
        if sm:
            what = sm["applies_to"]
            m = re.match(r"(Small|Medium|Large) items", what)
            rec["sellMod"] = {"size": m.group(1)} if m else {"tag": what.rstrip("s")}
            rec["sellMod"]["plus"] = sm["bonus_value"]
        if any(g.get("always_discounted") for g in group):
            rec["discounted"] = True
        for w in web:
            merchants[w["id"]] = dict(rec, name=a["name"])
        if not pool:
            cen("thương nhân không có bể (rơi về bộ đọc chữ)")["unmatched"][a["name"]] += 1

    # ---------- thầy kỹ năng ----------
    trainers = {}
    ct = cen("thầy kỹ năng (thẻ gặp gỡ)")
    tby = collections.OrderedDict()
    for a in TR:
        tby.setdefault(nm(a["name"]), []).append(a)
    for key, group in tby.items():
        a = group[0]
        ct["total"] += 1
        web = pick_web(W, idx, a, ("pile", "merchant"), None)
        web = [w for w in web if re.search(r"teach", w["d"] or "", re.I)] or web
        if not web:
            ct["unmatched"][a["name"]] += 1
            continue
        ct["matched"] += 1
        pool, days, lv = [], set(), set()
        for g in group:
            for p in map_pool(g["skill_pool_full"], 1, "kỹ năng trong bể thầy"):
                if p not in pool:
                    pool.append(p)
            days.update(g.get("days_active") or [])
            lv.update(g.get("level_up") or [])
        rec = {"pool": pool, "reroll": {"n": a["reroll_count"] if a["reroll_count"] is not None else 1, "cost": a["reroll_cost"]},
               "days": sorted(days), "levelUp": sorted(lv)}
        t = parse_tiers(a.get("description"))
        if t:
            rec["tiers"] = t
        for w in web:
            trainers[w["id"]] = dict(rec, name=a["name"])

    # ---------- sự kiện có bảng lựa chọn ----------
    events = {}
    ce = cen("sự kiện có bảng Options (thẻ)")
    cc = cen("lựa chọn của sự kiện đã khớp thẻ")
    eby = collections.OrderedDict()
    for a in EV:
        if a.get("has_options_table"):
            eby.setdefault((nm(a["name"]), a["rarity"]), []).append(a)
    for key, group in eby.items():
        a = group[0]
        ce["total"] += 1
        web = pick_web(W, idx, a, ("choice", "chain", "fight", "pile", "instant"), False)
        web = [w for w in web if not w["lu"]] or web
        if not web:
            ce["unmatched"][a["name"]] += 1
            continue
        ce["matched"] += 1
        days = sorted({d for g in group for d in (g.get("days_active") or [])})
        for w in web:
            opts = w["opts"] or [{"t": "step", "id": s} for s in (w["steps"] or [])]
            by_title = collections.defaultdict(list)
            for o in opts:
                rec = W["steps"].get(o["id"]) if o["t"] == "step" else W["events"].get(o["id"])
                if rec:
                    by_title[nm(rec["n"])].append(o)
            choices, seen = [], set()
            for g in group:
                for c in g["choices"]:
                    cc["total"] += 1
                    hit = by_title.get(nm(c["title"]))
                    if not hit or nm(c["title"]) in seen:
                        if not hit:
                            cc["unmatched"][a["name"] + " / " + c["title"]] += 1
                        else:
                            cc["matched"] += 0  # tên trùng trong bảng (Make a Wish x9): chỉ lấy lần đầu
                        continue
                    seen.add(nm(c["title"]))
                    cc["matched"] += 1
                    odds = {}
                    for k, v in (c.get("odds_by_day") or {}).items():
                        p = pct(v)
                        if p is not None:
                            odds[k.replace("10+", "10").replace("ALL", "all")] = p
                    ch = {"stepId": hit[0]["id"], "t": hit[0]["t"], "title": c["title"], "odds": odds}
                    if c.get("stack_count_guess") is not None:
                        ch["stamp"] = c["stack_count_guess"]  # số trên huy hiệu cam của quả cầu (giá vàng hay số lượng)
                    if c.get("condition"):
                        ch["cond"] = c["condition"]
                    if c.get("heroes"):
                        ch["heroes"] = c["heroes"]
                    choices.append(ch)
            events[w["id"]] = {"name": a["name"], "days": days, "choices": choices}

    # ---------- bậc theo ngày ----------
    tier_odds = [{"day": d["day"], "bronze": d["odds_percent_precise"]["bronze"], "silver": d["odds_percent_precise"]["silver"],
                  "gold": d["odds_percent_precise"]["gold"], "diamond": d["odds_percent_precise"]["diamond"]} for d in TO["days"]]

    # ---------- giá (S5) ----------
    sp = W["prices"]
    size_n = {"Small": 1, "Medium": 2, "Large": 3}
    price_rows, price_bad = 0, []
    for it in PR:
        buys = [int(x) for x in re.findall(r"\d+", it["cost_by_tier"])]
        sells = [int(x) for x in re.findall(r"\d+", it["value_by_tier"])]
        base = TIERS.index(it["tier_base"].capitalize())
        for k, b in enumerate(buys):
            t = TIERS[base + k]
            table = sp["ItemBuyPrices"][it["size"]][t]
            rule = 2 * size_n[it["size"]] * 2 ** (base + k)
            price_rows += 1
            if not (table == rule == b):
                price_bad.append((it["name"], it["size"], t, "site", b, "luật", rule, "bảng demo", table))
        for k, s in enumerate(sells):
            t = TIERS[base + k]
            table = sp["ItemSellPrices"][it["size"]][t]
            if s != table:
                price_bad.append((it["name"], it["size"], t, "bán site", s, "bảng demo", table))

    # ---------- ghi tệp ----------
    out = {"patch": patch, "merchants": merchants, "trainers": trainers, "events": events, "tierOdds": tier_odds,
           "ids": ids}
    lines = []
    lines.append("/* generated by games/bazaar/tools/bazaardb.py từ bazaardb.gg patch %s (nguồn ngoài, suy từ lượt chơi cộng đồng) - do not edit." % patch)
    lines.append("   %d thương nhân, %d thầy kỹ năng, %d sự kiện có bảng lựa chọn, %d thẻ web trong bể, bậc theo ngày 1..%d." %
                 (len(merchants), len(trainers), len(events), len(ids), len(tier_odds)))
    lines.append("   Không khớp (khớp theo tên với thẻ của bản demo 5.0.0):")
    for cat, c in census.items():
        top = ", ".join("%s x%d" % kv for kv in c["unmatched"].most_common(8))
        lines.append("   - %s: %d/%d khớp, %d không khớp%s" % (cat, c["matched"], c["total"], sum(c["unmatched"].values()),
                                                           (" (" + top + ")") if top else ""))
    lines.append("   Rerun: py -3.12 -I games/bazaar/tools/bazaardb.py */")
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    js = "\n".join(lines) + "\n(function(g){var S=" + body + ";var I=S.ids;delete S.ids;\n" \
        "function X(m){for(var k in m){var p=m[k].pool;if(p)m[k].pool=p.map(function(i){return I[i];});" \
        "var q=m[k].enchantedPool;if(q)m[k].enchantedPool=q.map(function(i){return I[i];});}}\n" \
        "X(S.merchants);X(S.trainers);g.BZ_SHOPS=S;})((typeof window!=='undefined'?window:globalThis));\n"
    with open(os.path.join(GAME, "data", "shops.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(js)

    # ---------- báo cáo ----------
    print("shops.js: %d byte, %d thương nhân, %d thầy, %d sự kiện, %d id thẻ" % (len(js.encode("utf-8")), len(merchants), len(trainers), len(events), len(ids)))
    for cat, c in census.items():
        print("%-48s %5d/%-5d khớp, không khớp %d" % (cat, c["matched"], c["total"], sum(c["unmatched"].values())))
        for n, k in c["unmatched"].most_common(12):
            print("      %s x%d" % (n, k))
    print("giá: %d dòng mua so với luật 2 x cỡ x 2^bậc và bảng demo, %d lệch" % (price_rows, len(price_bad)))
    for b in price_bad[:20]:
        print("   ", b)


if __name__ == "__main__":
    main()
