# -*- coding: utf-8 -*-
"""
Export 2D art (atlas sprites/textures, backgrounds, character portraits,
career/single-mode UI) from the locally installed Uma Musume Pretty Derby
(Steam) client as PNGs for the "Ghe Nong" web game to reference.

Data source: C:\\Users\\tamph\\AppData\\LocalLow\\Cygames\\Umamusume\\meta
(sqlite db, table a: n=logical name, h=hash/filename, m=category, k=kind
(0=UnityFS AssetBundle), s=1 means downloaded). File on disk =
dat/<h[:2]>/<h>. Bundles are unencrypted UnityFS, read with UnityPy.

MEASURED bundle shapes (see test_img*.py probes run while building this):
  - atlas/<name>/<name>        bundle: MonoScript+MonoBehaviour+many Sprite
                                 objects (no pixel data of their own)
  - atlas/<name>/<name>_tex    bundle: one big Texture2D (the actual atlas
                                 sheet the sprites above crop into)
    -> must UnityPy.load(base_path, tex_path) TOGETHER so Sprite.image
       resolves against the texture bundle's pixels.
  - chara/chrNNNN/chara_stand_*, chr_icon_*, petit/*  and single/*, bg/*:
    each is its own bundle with exactly one Texture2D (no Sprite layer) ->
    export the Texture2D directly.

Run: python rip_uma_img.py
Output root: D:\\uma-ref\\img\\
  atlas/<atlasname>/<SpriteName>.png       (every sprite in the 10 target atlases)
  atlas/<atlasname>/_TEXTURE_<TexName>.png (the full atlas sheet)
  bg/<bundle_name>.png                     (<=40 background samples)
  chara/chrNNNN/<asset_name>.png           (stand/icon/icon_training/petit x2)
  single/<bundle_name>.png                 (every single/career-mode bundle)
Also writes D:/uma-ref/img_catalog.tsv (bundle, asset_name, type, w, h, out_path)
and D:/uma-ref/img_fail.log.
"""
import io
import os
import re
import sqlite3
import sys

import UnityPy

UMA_DIR = r"C:\Users\tamph\AppData\LocalLow\Cygames\Umamusume"
META = os.path.join(UMA_DIR, "meta")
DAT = os.path.join(UMA_DIR, "dat")

SCRATCH = os.environ.get("UMAREF", r"D:/uma-ref")  # danh mục .tsv và thư mục tạm nằm cạnh bản bóc, ngoài git
OUT_IMG = r"D:\uma-ref\img"
CATALOG_TSV = os.path.join(SCRATCH, "img_catalog.tsv")
FAIL_LOG = os.path.join(SCRATCH, "img_fail.log")

con = sqlite3.connect(META)
cur = con.cursor()
cur.execute("select n, h from a where s=1 and k=0")
name_to_hash = dict(cur.fetchall())
con.close()
print("loaded", len(name_to_hash), "downloaded UnityFS bundle rows")


def disk_path(name):
    h = name_to_hash.get(name)
    if not h:
        return None
    p = os.path.join(DAT, h[:2], h)
    return p if os.path.isfile(p) else None


def safe(s):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", s)[:120]


catalog_rows = []
fail_lines = []


def log_fail(msg):
    fail_lines.append(msg)
    print("  FAIL:", msg)


def save_image(img, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path)


# ---------------------------------------------------------------------------
# 1. Atlases: common, home, gacha, race, racecommon, single, singlecommon,
#    singlestart, singleresult, statusrank (training/single-mode relevant
#    atlases, chosen from the full atlas/ + single/ name listing).
# ---------------------------------------------------------------------------
ATLASES = [
    "common", "home", "gacha", "race", "racecommon",
    "single", "singlecommon", "singlestart", "singleresult", "statusrank",
]
# UMA_ATLAS=all: mọi atlas có trong meta (30 cái), để chép giao diện Uma y hệt
if os.environ.get("UMA_ATLAS") == "all":
    ATLASES = sorted(set(n.split("/")[1] for n in name_to_hash if n.startswith("atlas/")))

print("Exporting atlases:", ATLASES)
for atlas in ATLASES:
    base_n = "atlas/%s/%s" % (atlas, atlas)
    tex_n = "atlas/%s/%s_tex" % (atlas, atlas)
    base_p = disk_path(base_n)
    tex_p = disk_path(tex_n)
    if not base_p or not tex_p:
        log_fail("ATLAS MISSING %s (base=%s tex=%s)" % (atlas, bool(base_p), bool(tex_p)))
        continue
    try:
        env = UnityPy.load(base_p, tex_p)
    except Exception as e:
        log_fail("ATLAS LOAD FAIL %s :: %s" % (atlas, e))
        continue
    n_sprites = 0
    n_tex = 0
    for obj in env.objects:
        try:
            if obj.type.name == "Sprite":
                data = obj.read()
                img = data.image
                out = os.path.join(OUT_IMG, "atlas", atlas, safe(data.m_Name) + ".png")
                save_image(img, out)
                catalog_rows.append((base_n, data.m_Name, "Sprite", img.size[0], img.size[1], out))
                n_sprites += 1
            elif obj.type.name == "Texture2D":
                data = obj.read()
                img = data.image
                out = os.path.join(OUT_IMG, "atlas", atlas, "_TEXTURE_" + safe(data.m_Name) + ".png")
                save_image(img, out)
                catalog_rows.append((tex_n, data.m_Name, "Texture2D", img.size[0], img.size[1], out))
                n_tex += 1
        except Exception as e:
            log_fail("ATLAS OBJ FAIL %s :: %s" % (atlas, e))
    print("  atlas", atlas, "-> sprites:", n_sprites, "textures:", n_tex)

# ---------------------------------------------------------------------------
# 2. bg/: list every name (full catalog), export up to 40 samples.
#    MEASURED: bg/ names are opaque numeric codes (bg_NNNN_LLPPP,
#    vertical_bg_race_goal_*, vertical_bg_team_*) with NO descriptive
#    facility/school/gym/home tokens anywhere -- these are race-track camera
#    layer backgrounds, not 2D training-ground art (that's rendered in 3D,
#    see CATALOG.md). We still export a spread of distinct bg_NNNN ids (one
#    frame per id) plus the vertical_bg_race_goal/team samples, up to 40,
#    as generic "stadium/outdoor" background stand-ins.
# ---------------------------------------------------------------------------
bg_all_names = sorted(n for n in name_to_hash if n.startswith("bg/"))
with io.open(os.path.join(SCRATCH, "bg_all_names.txt"), "w", encoding="utf-8") as f:
    for n in bg_all_names:
        f.write(n + "\n")
print("bg/ total names:", len(bg_all_names))

# one representative file per distinct numeric bg_XXXX id, then fill with
# vertical_bg_* variety, capped at 40
seen_ids = set()
bg_picks = []
for n in bg_all_names:
    m = re.match(r"bg/bg_(\d{4})_", n)
    if m and m.group(1) not in seen_ids:
        seen_ids.add(m.group(1))
        bg_picks.append(n)
    if len(bg_picks) >= 30:
        break
for n in bg_all_names:
    if len(bg_picks) >= 40:
        break
    if n.startswith("bg/vertical_bg_") and n not in bg_picks:
        bg_picks.append(n)

print("Exporting", len(bg_picks), "bg/ samples...")
for n in bg_picks:
    p = disk_path(n)
    if not p:
        log_fail("BG MISSING %s" % n)
        continue
    try:
        env = UnityPy.load(p)
        for obj in env.objects:
            if obj.type.name == "Texture2D":
                data = obj.read()
                img = data.image
                out = os.path.join(OUT_IMG, "bg", safe(os.path.basename(n)) + ".png")
                save_image(img, out)
                catalog_rows.append((n, data.m_Name, "Texture2D", img.size[0], img.size[1], out))
    except Exception as e:
        log_fail("BG LOAD FAIL %s :: %s" % (n, e))

# ---------------------------------------------------------------------------
# 3. Characters chr1001..chr1012: stand (000001), chr_icon, chr_icon_training,
#    2 petit images.
# ---------------------------------------------------------------------------
chr_ids = ["10%02d" % i for i in range(1, 13)]  # 1001..1012
print("Exporting characters:", chr_ids)
for cid in chr_ids:
    base = "chara/chr%s" % cid
    targets = []

    stand_n = "%s/chara_stand_%s_000001" % (base, cid)
    if disk_path(stand_n):
        targets.append(stand_n)
    else:
        cands = sorted(n for n in name_to_hash if n.startswith(base + "/chara_stand_"))
        if cands:
            targets.append(cands[0])
        else:
            log_fail("CHR no chara_stand for %s" % cid)

    icon_n = "%s/chr_icon_%s" % (base, cid)
    if disk_path(icon_n):
        targets.append(icon_n)
    else:
        log_fail("CHR no chr_icon for %s" % cid)

    icon_tr_n = "%s/chr_icon_training_%s" % (base, cid)
    if disk_path(icon_tr_n):
        targets.append(icon_tr_n)
    else:
        log_fail("CHR no chr_icon_training for %s" % cid)

    petit_names = sorted(n for n in name_to_hash if n.startswith(base + "/petit/"))[:2]
    if not petit_names:
        log_fail("CHR no petit images for %s" % cid)
    targets.extend(petit_names)

    for n in targets:
        p = disk_path(n)
        if not p:
            log_fail("CHR MISSING %s" % n)
            continue
        try:
            env = UnityPy.load(p)
            for obj in env.objects:
                if obj.type.name == "Texture2D":
                    data = obj.read()
                    img = data.image
                    out = os.path.join(OUT_IMG, "chara", "chr" + cid, safe(os.path.basename(n)) + ".png")
                    save_image(img, out)
                    catalog_rows.append((n, data.m_Name, "Texture2D", img.size[0], img.size[1], out))
        except Exception as e:
            log_fail("CHR LOAD FAIL %s :: %s" % (n, e))
    print("  chr%s -> %d assets" % (cid, len(targets)))

# ---------------------------------------------------------------------------
# 4. single/ (career mode): list + export every bundle.
# ---------------------------------------------------------------------------
single_names = sorted(n for n in name_to_hash if n.startswith("single/"))
with io.open(os.path.join(SCRATCH, "single_all_names.txt"), "w", encoding="utf-8") as f:
    for n in single_names:
        f.write(n + "\n")
print("Exporting single/ bundles:", len(single_names))
for n in single_names:
    p = disk_path(n)
    if not p:
        log_fail("SINGLE MISSING %s" % n)
        continue
    try:
        env = UnityPy.load(p)
        for obj in env.objects:
            if obj.type.name in ("Texture2D", "Sprite"):
                data = obj.read()
                img = data.image
                out = os.path.join(OUT_IMG, "single", safe(os.path.basename(n)) + "__" + safe(data.m_Name) + ".png")
                save_image(img, out)
                catalog_rows.append((n, data.m_Name, obj.type.name, img.size[0], img.size[1], out))
    except Exception as e:
        log_fail("SINGLE LOAD FAIL %s :: %s" % (n, e))

# ---------------------------------------------------------------------------
# Write catalog + fail log
# ---------------------------------------------------------------------------
with io.open(CATALOG_TSV, "w", encoding="utf-8") as f:
    f.write("bundle\tasset_name\ttype\twidth\theight\tout_path\n")
    for row in catalog_rows:
        f.write("%s\t%s\t%s\t%s\t%s\t%s\n" % row)
print("wrote", CATALOG_TSV, "rows:", len(catalog_rows))

with io.open(FAIL_LOG, "w", encoding="utf-8") as f:
    for line in fail_lines:
        f.write(line + "\n")
print("wrote", FAIL_LOG, "failures:", len(fail_lines))
print("DONE")
