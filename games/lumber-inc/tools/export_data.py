"""Config tables of Lumber Inc (apk assets/config/*.txt, tab separated) -> games/lumber-inc/data/config.json.

{table: [row, ...]} with typed cells (lm.config). Ads, analytics and other-language tables are left out; English text
goes to data/lang-en.json.
"""
import json, os
import lm

SKIP = ("ad_", "adjust_", "app_config", "language", "FakeInter", "GameDropAd", "ActivityEasterEggConfIap")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def main():
    os.makedirs(OUT, exist_ok=True)
    tables = {}
    for f in sorted(os.listdir(lm.CONFIG)):
        name = f[:-4]
        if not f.endswith(".txt") or name.startswith(SKIP):
            continue
        tables[name] = lm.config(name)
    with open(os.path.join(OUT, "config.json"), "w", encoding="utf-8") as fh:
        json.dump(tables, fh, ensure_ascii=False, separators=(",", ":"))
    lang = {r["Id"]: r["Key"] for r in lm.config("language_en")}
    with open(os.path.join(OUT, "lang-en.json"), "w", encoding="utf-8") as fh:
        json.dump(lang, fh, ensure_ascii=False, separators=(",", ":"))
    print(len(tables), "tables,", sum(len(v) for v in tables.values()), "rows,",
          os.path.getsize(os.path.join(OUT, "config.json")) // 1024, "KB;", len(lang), "strings")


if __name__ == "__main__":
    main()
