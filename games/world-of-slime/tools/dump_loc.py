r"""Dump Unity Localization string tables -> D:\wos-ref\data\loc\<lang>.json as {table: {key: text}}.
Also asset tables (font style) -> <lang>.assets.json. Usage: py -3.12 -I dump_loc.py [lang ...]  (default: all 17)
Joins StringTable.m_TableData[m_Id,m_Localized] with SharedTableData.m_Entries[m_Id,m_Key] (localization-assets-shared.bundle)."""
import os, sys, json, glob, re
import UnityPy
sys.stdout.reconfigure(encoding="utf-8")
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import wos
BD = wos.D
OUT = _o.path.join(wos.REF, 'data', 'loc'); os.makedirs(OUT, exist_ok=True)
shared = {}   # guid-or-name -> {id: key}
env = UnityPy.load(BD + r"\localization-assets-shared.bundle")
by_pid = {}
for o in env.objects:
    if o.type.name == "MonoBehaviour":
        d = o.read_typetree()
        if "m_Entries" in d:
            ent = {e["m_Id"]: e["m_Key"] for e in d["m_Entries"]}
            nm = d["m_TableCollectionName"] if "m_TableCollectionName" in d else d["m_Name"]
            shared[d["m_Name"].replace(" Shared Data", "")] = ent
            shared[(d.get("m_TableCollectionNameGuid") or "")] = ent
            shared["_name_" + d["m_Name"]] = ent
print("shared tables:", [k for k in shared if not k.startswith("_") and len(k) < 40])
langs = sys.argv[1:] or sorted(set(re.search(r"\(([^)]+)\)\.bundle$", os.path.basename(f)).group(1) for f in glob.glob(BD + r"\localization-string-tables-*")))
for lang in langs:
    res = {}
    for f in glob.glob(BD + r"\localization-string-tables-*(%s).bundle" % lang):
        e = UnityPy.load(f)
        for o in e.objects:
            if o.type.name != "MonoBehaviour": continue
            d = o.read_typetree()
            if "m_TableData" not in d: continue
            tname = d["m_Name"].rsplit("_", 1)[0]
            keys = shared.get(tname) or shared.get(d.get("m_SharedData", {}).get("guid", "")) or {}
            res[tname] = {keys.get(r["m_Id"], "id_%d" % r["m_Id"]): r["m_Localized"] for r in d["m_TableData"]}
    # asset tables (font styles etc.)
    for f in glob.glob(BD + r"\localization-asset-tables-*(%s).bundle" % lang):
        e = UnityPy.load(f)
        a = {}
        for o in e.objects:
            if o.type.name == "MonoBehaviour":
                d = o.read_typetree(); a[d["m_Name"]] = d.get("m_TableData")
        json.dump(a, open(os.path.join(OUT, lang + ".assets.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    json.dump(res, open(os.path.join(OUT, lang + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(lang, {t: len(v) for t, v in res.items()})
