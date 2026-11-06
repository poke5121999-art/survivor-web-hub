"""Export a unit/enemy form to web JSON + trimmed PNG.

Usage: py export_unit.py <id> <form>   e.g. py export_unit.py 26 f
Writes games/battle-cats/assets/units/<id>_<form>.png and .json
JSON = { png, w, h, cuts:[[x,y,w,h]...], parts:[[parent,cut,z,x,y,px,py,unk,sx,sy,ang,op,glow]...],
         units:[scaleUnit,angleUnit,opacityUnit], anims:{ "00":anim, ... } }
anim = { parts:[ {part,mod,loop,kf:[[frame,val,ease,easeP]...]} ... ], end:int }
"""
import os, sys, json, re, shutil
sys.path.insert(0, os.path.dirname(__file__))
import bclib

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "units")


def _lines(path):
    txt = open(path, encoding="utf-8", errors="replace").read().lstrip("﻿")
    return [l.rstrip("\r") for l in txt.split("\n")]


def parse_imgcut(path):
    L = _lines(path)
    png = L[2].strip()
    n = int(L[3])
    cuts = []
    for i in range(n):
        parts = L[4 + i].split(",")
        cuts.append([int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])])
    return png, cuts


def parse_mamodel(path):
    L = [l for l in _lines(path) if l.strip() != ""]
    # L[0]=[modelanim:model], L[1]=ver, L[2]=partCount
    n = int(L[2])
    parts = []
    for i in range(n):
        row = L[3 + i].split(",")
        parts.append([int(x) for x in row[:13]])
    units = [int(x) for x in L[3 + n].split(",")[:3]]
    return parts, units


def parse_maanim(path):
    L = [l for l in _lines(path)]
    # L[0]=[modelanim:animation], L[1]=ver, L[2]=count
    i = 3
    count = int(L[2])
    anims = []
    end = 0
    for _ in range(count):
        head = L[i].split(","); i += 1
        part, mod, loop = int(head[0]), int(head[1]), int(head[2])
        kn = int(L[i]); i += 1
        kf = []
        for _k in range(kn):
            r = L[i].split(","); i += 1
            frame = int(r[0]); val = int(r[1])
            ease = int(r[2]) if len(r) > 2 and r[2] != "" else 0
            easep = int(r[3]) if len(r) > 3 and r[3] != "" else 0
            kf.append([frame, val, ease, easep])
            if frame > end:
                end = frame
        anims.append({"part": part, "mod": mod, "loop": loop, "kf": kf})
    return anims, end


def export(uid, form):
    base = f"{uid:03d}_{form}"
    sheet = bclib.find_png(base + ".png")
    imgcut = bclib.find(base + ".imgcut")
    mamodel = bclib.find(base + ".mamodel")
    if not (sheet and imgcut and mamodel):
        return None, {"png": bool(sheet), "imgcut": bool(imgcut), "mamodel": bool(mamodel)}
    os.makedirs(OUT, exist_ok=True)
    shutil.copy2(sheet, os.path.join(OUT, base + ".png"))
    from PIL import Image
    w, h = Image.open(sheet).size
    _, cuts = parse_imgcut(imgcut)
    parts, units = parse_mamodel(mamodel)
    anims = {}
    for mp in sorted(bclib.index()):
        m = re.fullmatch(re.escape(base) + r"(\d\d)\.maanim", mp)
        if m:
            a, end = parse_maanim(bclib.find(mp))
            anims[m.group(1)] = {"parts": a, "end": end}
    data = {"png": base + ".png", "w": w, "h": h, "cuts": cuts,
            "parts": parts, "units": units, "anims": anims}
    json.dump(data, open(os.path.join(OUT, base + ".json"), "w"), separators=(",", ":"))
    return data, None


if __name__ == "__main__":
    uid = int(sys.argv[1]); form = sys.argv[2]
    data, miss = export(uid, form)
    if data:
        print(f"OK {uid:03d}_{form}: {len(data['cuts'])} cuts, {len(data['parts'])} parts, anims {list(data['anims'])}, units {data['units']}, sheet {data['w']}x{data['h']}")
    else:
        print(f"MISSING {uid:03d}_{form}: {miss}")
