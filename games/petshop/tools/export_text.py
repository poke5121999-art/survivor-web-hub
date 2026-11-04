"""I2 Localization terms of Pet Shop Simulator -> data/text.json {term: {"en": ..., "vi": ...}}.

Usage: python -I tools/export_text.py
The LanguageSourceAsset (resources.assets) does not read through the generated type tree, so its TermData list is
walked by hand: Term (string), TermType (int), Languages (string[17]), Flags (byte[17]). Language order (17 columns)
measured on Alert_CabinetFull: en, pt, id, ar, ru, es, th, it, fr, nl, zh, ko, vi, ja, tr, de, uk."""
import json, os, re, struct, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm

LANGS = ["en", "pt", "id", "ar", "ru", "es", "th", "it", "fr", "nl", "zh", "ko", "vi", "ja", "tr", "de", "uk"]
env = mm.load()
o = next(o for o in env.objects if o.type.name == "MonoBehaviour" and o.assets_file.name == "resources.assets"
         and mm.script(o)[1] == "I2.Loc.LanguageSourceAsset")
b = o.get_raw_data()
NAME = re.compile(rb"^[A-Za-z0-9_ ./&()'-]{1,80}$")


def s_at(p):
    n = struct.unpack_from("<i", b, p)[0]
    if n < 0 or n > 4000 or p + 4 + n > len(b):
        return None, p
    return b[p + 4:p + 4 + n].decode("utf-8", "replace"), (p + 4 + n + 3) & ~3


def term_at(p):
    name, q = s_at(p)
    if not name or not NAME.match(name.encode()):
        return None
    typ = struct.unpack_from("<i", b, q)[0]
    if not 0 <= typ <= 20:
        return None
    q += 4
    if struct.unpack_from("<i", b, q)[0] != len(LANGS):
        return None
    q += 4
    vals = []
    for _ in LANGS:
        v, q = s_at(q)
        if v is None:
            return None
        vals.append(v)
    nf = struct.unpack_from("<i", b, q)[0]
    if nf != len(LANGS):
        return None
    q = (q + 4 + nf + 3) & ~3
    return name, vals, q


out, p = {}, 0
while p < len(b) - 8:
    t = term_at(p)
    if t:
        name, vals, p = t
        out[name] = {"en": vals[0], "vi": vals[12]}
    else:
        p += 4
json.dump(out, open(os.path.join(os.path.dirname(HERE), "data", "text.json"), "w"), ensure_ascii=False, indent=0)
print(len(out), "terms")
