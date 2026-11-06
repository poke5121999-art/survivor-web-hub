"""Write the game tables and strings the web build reads.

usage: py -3.12 -I export_data.py
  data/tables.json   selected Entity_* tables from D:/catsoup-ref/flat (ObscuredTypes already reduced to fakeValue),
                     each as a list of rows with the original field names
  data/lang-vi.json  {key: text} from the official Vietnamese table; English fills keys Vietnamese lacks
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref"
TABLES = ["Work", "Food", "CatType", "CatUnlock", "Init", "MapSize_Main", "LFactor", "Quest", "Mission", "Ability",
          "UnitHeart", "Lamp", "Fish", "Furniture", "Equip", "AcceType", "Collection", "PictureBook", "Guest",
          "DailyReward", "KittyAbility", "WorkSkin", "SignSkin", "TimerSkin", "BalloonSkin", "ItemTag", "CatGift",
          "ChapterInfo", "ChapterMission", "Theme", "MiniGame", "MiniGameReward", "AdsFactor", "PlayPoint",
          "DailyPlayPoint", "Storage_item", "BGM", "Ball"]


def lang(name):
    out = {}
    for line in open(f"{REF}/lang/{name}.txt", encoding="utf-8-sig"):
        line = line.rstrip("\r\n")
        if " = " in line:
            k, v = line.split(" = ", 1)
            out[k.strip()] = v.replace("\\n", "\n")
    return out


def main():
    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    tables = {}
    for t in TABLES:
        rows = json.load(open(f"{REF}/flat/{t}.json", encoding="utf-8"))
        tables[t] = rows
    with open(os.path.join(GAME, "data", "tables.json"), "w", encoding="utf-8") as fh:
        json.dump(tables, fh, ensure_ascii=False, separators=(",", ":"))
    vi, en = lang("Vietnamese"), lang("English")
    merged = dict(en)
    merged.update(vi)
    with open(os.path.join(GAME, "data", "lang-vi.json"), "w", encoding="utf-8") as fh:
        json.dump(merged, fh, ensure_ascii=False, separators=(",", ":"))
    for f in ("tables.json", "lang-vi.json"):
        print(f, os.path.getsize(os.path.join(GAME, "data", f)) // 1024, "KB")
    print({t: len(r) for t, r in tables.items()})


if __name__ == "__main__":
    main()
