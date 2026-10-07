# -*- coding: utf-8 -*-
"""Export the DREDGE UI fonts from the game bundle and subset them to Latin + Vietnamese.

Run:    python -I tools/fonts.py [game_assets_all bundle] [out dir]
Writes: art/fonts/<Name>.woff2 (subset) and art/fonts/coverage.json (which Vietnamese letters each font lacks).
The source Hahmlet is 2.5 MB because of Hangul; subsetting keeps each file around 20-40 KB.
"""
import glob, io, json, os, sys
import UnityPy
from fontTools import subset
from fontTools.ttLib import TTFont

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = sys.argv[1] if len(sys.argv) > 1 else glob.glob(
    r"D:\dredge-ref\game\*\DREDGE_Data\StreamingAssets\aa\StandaloneWindows\game_assets_all_*.bundle")[0]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(HERE), "art", "fonts")
WANT = ["Hahmlet-ExtraBold", "Hahmlet-SemiBold", "PoltawskiNowy-Regular", "Signika-Regular", "Oswald-Regular"]

# U+0020-007E ASCII, Latin-1, Latin Extended-A/B bits, Vietnamese block U+1EA0-1EF9, combining marks, punctuation.
UNICODES = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x1A0, 0x1A1, 0x1AF, 0x1B0, 0x1CD, 0x1CE]
            + list(range(0x300, 0x370)) + list(range(0x1EA0, 0x1EFA))
            + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AB, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212])
VIET = [chr(c) for c in list(range(0xC0, 0x100)) + [0x102, 0x103, 0x110, 0x111, 0x128, 0x129, 0x168, 0x169, 0x1A0, 0x1A1, 0x1AF, 0x1B0]
        + list(range(0x1EA0, 0x1EFA))]

os.makedirs(OUT, exist_ok=True)
env = UnityPy.load(BUNDLE)
cov = {}
for o in env.objects:
    if o.type.name != "Font":
        continue
    f = o.read()
    if f.m_Name not in WANT:
        continue
    raw = bytes(f.m_FontData)
    font = TTFont(io.BytesIO(raw))
    cmap = font.getBestCmap()
    cov[f.m_Name] = "".join(ch for ch in VIET if ord(ch) not in cmap)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "mark", "mkmk", "ccmp", "locl"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    p = os.path.join(OUT, f.m_Name + ".woff2")
    opts_out = open(p, "wb")
    font.flavor = "woff2"
    font.save(opts_out)
    opts_out.close()
    print(f.m_Name, os.path.getsize(p), "missing Vietnamese:", repr(cov[f.m_Name]) if cov[f.m_Name] else "none")
json.dump(cov, open(os.path.join(OUT, "coverage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
