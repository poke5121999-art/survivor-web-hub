"""Export the Cats&Soup shop feature: data/shop.json (tables) and art/shop/notice/*.webp (notice banners).

usage: py -3.12 -I tools/export_shop.py [--tables]   (--tables: data/shop.json only, no banners)

data/shop.json
  items   Shop.json rows the shop lists (shopType 2 = "Vat pham" goods, 0/1 = real-money specials and subscriptions,
          which the page shows disabled); fields: index, res, cost, costType, shopType, rewardType, rewardValue,
          duration, limit, slot, needWork, bonus, iap (real money)
  ads     ShopAds.json rows (stamp rally): index, category, require, rewardType, rewardValue, slot
  init    Init rows 16 (OfflineAdsFactor), 17 (DoubleSpeedFactor), 39 (PerView_AdsStamp), 40 (MaxStamp_PerDay)
  notices Notice_Group/Notice_Page rows kept: pages that are plain information (no real money, no event link)
Nothing is read with the whole data folder loaded: each notice banner is one serialized file (resources.json).
"""
import json, os, sys
sys.path.insert(0, "D:/catsoup-ref/tools")
sys.stdout.reconfigure(encoding="utf-8")

FLAT = "D:/catsoup-ref/flat"
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP_PAGES = [152, 156, 169, 179, 192, 193, 182]   # Notice_Page rows: update notes, no reward, no link


def table(name):
    with open(f"{FLAT}/{name}.json", encoding="utf-8") as f:
        return json.load(f)


def item(r):
    iap = r["costType"] == 5
    return {"index": r["index"], "res": r["resName"], "cost": r["cost"], "costType": r["costType"], "shopType": r["shopType"],
            "rewardType": r["rewardType"], "rewardValue": r["rewardIndex"], "duration": r["duration"], "limit": r["limitCount"],
            "slot": r["slotIndex"], "needWork": r["needWork"], "bonus": r["bonus"], "iap": iap}


def main():
    items = []
    for r in table("Shop"):
        st = r["shopType"]
        if st == 2 or (st in (0, 1) and r["costType"] == 5 and r["eventType"] == 0):
            items.append(item(r))
    # gem packages (Shop rewardType 9, costType 3, subIndex = Package rows): costumes, furniture, skins and gems. Listed in the goods
    # tab as one row with `pack` = [[rewardType, rewardValue], ...]; the shop lists the ones every part of which a feature can pay.
    pk = {r["index"]: r for r in table("Package")}
    slot = 100
    for r in table("Shop"):
        if r["costType"] == 3 and r["rewardType"] == 9 and r["cost"] > 0 and r["eventType"] == 0:
            it = item(r)
            it["shopType"] = 2
            it["slot"] = slot
            slot += 1
            it["pack"] = [[pk[int(i)]["rewardType"], pk[int(i)]["rewardValue"]] for i in r["subIndex"].split(",")]
            items.append(it)
    init = {r["index"]: r["value"] for r in table("Init")}
    ads = [{"index": r["index"], "category": r["category"], "require": r["requireValue"], "rewardType": r["rewardType"],
            "rewardValue": r["rewardValue"], "slot": r["slotIndex"]} for r in table("ShopAds")]
    pages = {p["index"]: p for p in table("Notice_Page")}
    notices = []
    for g in table("Notice_Group"):
        keep = [i for i in g["pages"] if i in KEEP_PAGES]
        if not keep:
            continue
        notices.append({"group": g["group"], "pages": [
            {"index": i, "title": pages[i]["title_text"], "body": pages[i]["body_text"], "image": pages[i]["main_image"]} for i in keep]})
    out = {"items": items, "ads": ads, "init": {"offlineAdsFactor": init[16], "doubleSpeedFactor": init[17], "perViewStamp": init[39], "maxStampPerDay": init[40]},
           "notices": notices}
    with open(os.path.join(GAME, "data", "shop.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("items", len(items), "ads", len(ads), "notice groups", len(notices))
    if "--tables" in sys.argv:
        return  # data only, no banner extraction

    # notice banners: Resources "notice/<name>" is one file holding a Texture2D
    import cns
    res = {e[0]: e[1] for e in json.load(open("D:/catsoup-ref/resources.json", encoding="utf-8"))}
    d = os.path.join(GAME, "art", "shop", "notice")
    os.makedirs(d, exist_ok=True)
    for n in notices:
        for p in n["pages"]:
            name = p["image"]
            f = res.get(f"notice/{name}")
            if not f:
                print("missing banner", name)
                continue
            e = getattr(cns, "env")(f)
            for o in e.objects:
                if o.type.name == "Texture2D":
                    im = o.read().image.convert("RGB")
                    if im.width > 740:
                        im = im.resize((740, round(im.height * 740 / im.width)))
                    im.save(os.path.join(d, name + ".webp"), "WEBP", quality=85)
                    print("banner", name, im.size)
                    break


main()
