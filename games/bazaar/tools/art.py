# -*- coding: utf-8 -*-
"""Bóc art The Bazaar Demo -> D:\\bazaar-ref\\art (PNG đủ độ phân giải) và games/bazaar/art (webp, --web).

Chạy (Python 3.8, UnityPy 1.25):
  python -I index_bundles.py          # 1) lập chỉ mục bundle (~30 s), cần cho mọi bước sau
  python -I art.py                    # 2) bóc PNG đủ độ phân giải (chạy lại thì bỏ qua file đã có)
  python -I art.py --only cards,skills   # chỉ vài nhóm: cards skills steps encounters frames ui heroes board fonts
  python -I art.py --web              # 3) webp cho web + data/art.js (đọc PNG ở bước 2)
Chuỗi ArtKey -> ảnh: xem D:\\bazaar-ref\\notes\\ASSETS.md.
"""
import os, sys, re, json, struct, time, argparse, collections, warnings
warnings.filterwarnings("ignore")
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import UnityPy
# Bundle bị xoá chuỗi phiên bản (ghi "5.x.x"/"0.0.0"); engine thật 6000.3.11f1 (đo từ globalgamemanagers).
UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
warnings.simplefilter("ignore")

AA = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data\StreamingAssets\aa"
AAW = os.path.join(AA, "StandaloneWindows64")
REF = r"D:\bazaar-ref"
CACHE = os.path.join(REF, "cache")
ART = os.path.join(REF, "art")
DBJSON = os.path.join(REF, "db", "json")
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
WEB_ART = os.path.join(REPO, "games", "bazaar", "art")
WEB_DATA = os.path.join(REPO, "games", "bazaar", "data")
WEB_BUDGET = 60 * 1024 * 1024


def bundle_path(name):
    return os.path.join(AAW, name if name.endswith(".bundle") else name + ".bundle")


def load(name):
    return UnityPy.load(bundle_path(name))


def short(bundle):
    return bundle.replace("_assets_all.bundle", "").replace(".bundle", "")


def safe(s):
    return re.sub(r"[^A-Za-z0-9_.\-]+", "_", s).strip("_")


# ---------------------------------------------------------------- catalog.bin (Addressables 2.x nhị phân)
def decode_catalog():
    """ArtKey hex (32 ký tự) -> internalId (vd 'Narwhal_CardData.asset').

    Đảo ngược định dạng BinaryStorageBuffer (không có padding): chuỗi = [u32 độ dài][byte ASCII];
    mỗi location là một mảng u32 offset; với khoá hex thì internalId nằm ở u32 đứng trước 8 byte
    so với ô con trỏ tới khoá (đo trên catalog_2026.10.07: 2005/2017 ArtKey giải ra).
    """
    out = os.path.join(CACHE, "artkey_map.json")
    if os.path.exists(out):
        return json.load(open(out, encoding="utf-8"))
    b = open(os.path.join(AA, "catalog.bin"), "rb").read()
    n = len(b)
    U = lambda o: struct.unpack_from("<I", b, o)[0]

    def S(off):
        off &= 0x3fffffff
        if off < 8 or off > n - 8:
            return None
        ln = U(off - 4)
        if ln < 1 or ln > 400 or off + ln > n:
            return None
        try:
            return b[off:off + ln].decode("ascii")
        except Exception:
            return None
    refs = collections.defaultdict(list)
    for i in range(0x2f800, n - 3):
        w = U(i)
        if 0x30 < w < n:
            refs[w].append(i)
    m = {}
    for mt in re.finditer(rb"[0-9a-f]{32}", b):
        p = mt.start()
        if p < 4 or U(p - 4) != 32:
            continue
        for r in refs.get(p, []):
            if r >= 8:
                s = S(U(r - 8))
                if s:
                    m[mt.group().decode()] = s
                    break
    os.makedirs(CACHE, exist_ok=True)
    json.dump(m, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    return m


def load_index():
    p = os.path.join(CACHE, "bundle_index.json")
    if not os.path.exists(p):
        sys.exit("thiếu bundle_index.json: chạy index_bundles.py trước")
    return json.load(open(p, encoding="utf-8"))


# ---------------------------------------------------------------- xuất ảnh
def save_png(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=False, compress_level=3)


def tex_of(objs, ptr):
    """PPtr dict cục bộ -> object (hoặc None nếu trỏ sang bundle khác / rỗng)."""
    if not ptr or ptr.get("m_PathID", 0) == 0 or ptr.get("m_FileID", 0) != 0:
        return None
    return objs.get(ptr["m_PathID"])


_EXT = {}


def tex_ext(owner, ptr):
    """PPtr sang bundle khác: externals[file_id-1] -> 'CAB-…' -> bundle (theo bundle_index.json 'cab') -> object."""
    try:
        if not ptr or ptr.get("m_PathID", 0) == 0 or ptr.get("m_FileID", 0) == 0:
            return None
        cab = owner.assets_file.externals[ptr["m_FileID"] - 1].path.split("/")[-1]
        if "cabmap" not in _EXT:
            idx = load_index()
            _EXT["cabmap"] = {c: b for b, r in idx["bundles"].items() for c in r.get("cab", [])}
        b = _EXT["cabmap"].get(cab)
        if b is None:
            return None
        if b not in _EXT:
            e = load(b)
            _EXT[b] = {o.path_id: o for o in e.objects}
            _EXT[b + "#env"] = e      # giữ env sống: object chỉ đọc được khi env còn
        return _EXT[b].get(ptr["m_PathID"])
    except Exception:
        return None


def export_one(o, out):
    if os.path.exists(out):
        return "skip", 0, 0
    try:
        img = o.read().image
        save_png(img, out)
        return "ok", img.width, img.height
    except Exception as e:
        return "ERR:%s:%s" % (type(e).__name__, str(e)[:60]), 0, 0


def worker(task):
    kind, bundle, items = task
    res = []
    try:
        env = load(bundle)
    except Exception as e:
        return [(bundle, "", "ERR-LOAD:%s" % e, 0, 0)]
    objs = {o.path_id: o for o in env.objects}
    if kind == "card":      # items: (out_rel, cardData path_id)
        for out_rel, pid in items:
            out = os.path.join(ART, out_rel)
            try:
                cd = objs[pid].read_typetree()
                mo = tex_of(objs, cd.get("cardMaterial"))
                if mo is None:
                    res.append((out_rel, "", "ERR:cardMaterial ngoài bundle", 0, 0)); continue
                mt = mo.read_typetree()
                te = dict((k, v) for k, v in mt["m_SavedProperties"]["m_TexEnvs"])
                mtp = te.get("_MainTex", {}).get("m_Texture")
                to = tex_of(objs, mtp) or tex_ext(mo, mtp)      # vd Vanessa_Octopus: _MainTex nằm ở bundle khác
                if to is None:
                    res.append((out_rel, "", "ERR:_MainTex ngoài bundle/trống", 0, 0)); continue
                st, w, h = export_one(to, out)
                res.append((out_rel, to.read().m_Name, st, w, h))
            except Exception as e:
                res.append((out_rel, "", "ERR:%s:%s" % (type(e).__name__, str(e)[:60]), 0, 0))
    elif kind == "enc":     # items: (out_prefix, asset pid) -> _char.png, _bg.png
        for pre, pid in items:
            try:
                cd = objs[pid].read_typetree()
                for suffix, key in (("char", "portraitTextureReference"), ("bg", "backgroundTextureReference")):
                    to = tex_of(objs, cd.get(key)) or tex_ext(objs[pid], cd.get(key))
                    if to is None:
                        empty = (cd.get(key) or {}).get("m_PathID", 0) == 0     # không khai báo thì không phải lỗi
                        res.append((pre + "_" + suffix, "", "empty" if empty else "ERR:%s ngoài bundle" % key, 0, 0)); continue
                    st, w, h = export_one(to, os.path.join(ART, "%s_%s.png" % (pre, suffix)))
                    res.append(("%s_%s" % (pre, suffix), to.read().m_Name, st, w, h))
            except Exception as e:
                res.append((pre, "", "ERR:%s:%s" % (type(e).__name__, str(e)[:60]), 0, 0))
    elif kind == "obj":     # items: (out_rel, pid)
        for out_rel, pid in items:
            st, w, h = export_one(objs[pid], os.path.join(ART, out_rel))
            res.append((out_rel, "", st, w, h))
    elif kind == "bulk":    # items: nhóm ; mọi Sprite + Texture2D chưa có Sprite cùng tên
        cat = items
        sprites, texs = {}, {}
        for o in env.objects:
            t = o.type.name
            if t not in ("Sprite", "Texture2D"):
                continue
            try:
                nm = o.peek_name() if hasattr(o, "peek_name") else o.read().m_Name
            except Exception:
                nm = "obj%d" % o.path_id
            (sprites if t == "Sprite" else texs).setdefault(nm, []).append(o)
        base = os.path.join(ART, cat, short(bundle))
        retry = []
        for nm, lst in list(sprites.items()) + [(n, l) for n, l in texs.items() if n not in sprites]:
            if nm.startswith("sactx-"):      # atlas gộp của Unity: sprite đã được cắt riêng
                continue
            for i, o in enumerate(lst):
                fn = safe(nm) + ("" if i == 0 else "_%d" % i) + ".png"
                st, w, h = export_one(o, os.path.join(base, fn))
                if st.startswith("ERR:FileNotFoundError"):
                    retry.append((o.path_id, fn)); continue
                res.append((cat + "/" + short(bundle) + "/" + fn, o.type.name, st, w, h))
        if cat == "heroes":     # Spine của skin mặc định: .skel.bytes + .atlas.txt (cùng PNG atlas ở trên)
            for o in env.objects:
                if o.type.name == "TextAsset":
                    d = o.read()
                    fn = os.path.join(base, "spine", safe(d.m_Name))
                    if not os.path.exists(fn):
                        os.makedirs(os.path.dirname(fn), exist_ok=True)
                        raw = d.m_Script
                        open(fn, "wb").write(raw if isinstance(raw, bytes) else raw.encode("utf-8", "surrogateescape"))
                    res.append(("heroes/%s/spine/%s" % (short(bundle), safe(d.m_Name)), "TextAsset", "ok", 0, 0))
        if retry:   # sprite nằm trong SpriteAtlas ở bundle khác: nạp chung bundle atlas để UnityPy giải PPtr
            cabs = {o.assets_file.name for o in env.objects}
            env2 = UnityPy.load(bundle_path(bundle), bundle_path("ui_sprite_atlas_assets_all"))
            o2 = {o.path_id: o for o in env2.objects if o.assets_file.name in cabs}
            for pid, fn in retry:
                st, w, h = export_one(o2[pid], os.path.join(base, fn))
                res.append((cat + "/" + short(bundle) + "/" + fn, "Sprite", st, w, h))
    elif kind == "fonts":
        base = os.path.join(ART, "fonts")
        for o in env.objects:
            t = o.type.name
            if t == "Texture2D":
                nm = o.peek_name()      # không o.read(): Font_Texture rỗng làm UnityPy mở đường dẫn thư mục -> PermissionError
                if nm == "Font Texture":      # texture rỗng của font động (Dynamic): không có dữ liệu để bóc
                    continue
                st, w, h = export_one(o, os.path.join(base, short(bundle), safe(nm) + ".png"))
                res.append(("fonts/" + short(bundle) + "/" + safe(nm) + ".png", "Texture2D", st, w, h))
            elif t == "MonoBehaviour":
                try:
                    tt = o.read_typetree()
                    if tt.get("m_SpriteCharacterTable") and tt.get("spriteSheet"):   # TMP SpriteAsset: icon chữ <sprite name=Burn>
                        to = tex_of(objs, tt["spriteSheet"])
                        if to is not None:
                            sheet = to.read().image
                            gl = {g["m_Index"]: g["m_GlyphRect"] for g in tt["m_GlyphTable"]}
                            for ch in tt["m_SpriteCharacterTable"]:
                                r = gl[ch["m_GlyphIndex"]]
                                top = sheet.height - r["m_Y"] - r["m_Height"]      # TMP tính y từ đáy ảnh
                                fn = os.path.join(ART, "icons", safe(ch["m_Name"]) + ".png")
                                if not os.path.exists(fn):
                                    save_png(sheet.crop((r["m_X"], top, r["m_X"] + r["m_Width"], top + r["m_Height"])), fn)
                                res.append(("icons/" + safe(ch["m_Name"]) + ".png", "TMPSprite", "ok", r["m_Width"], r["m_Height"]))
                    if "m_GlyphTable" in tt or "m_CharacterTable" in tt:
                        nm = safe(tt.get("m_Name", "font%d" % o.path_id))
                        fn = os.path.join(base, short(bundle), nm + ".json")
                        if not os.path.exists(fn):
                            os.makedirs(os.path.dirname(fn), exist_ok=True)
                            json.dump(tt, open(fn, "w", encoding="utf-8"), default=str)
                        res.append(("fonts/" + short(bundle) + "/" + nm + ".json", "TMP_FontAsset", "ok", len(tt.get("m_GlyphTable", [])), len(tt.get("m_CharacterTable", []))))
                except Exception:
                    pass
    return res


# ---------------------------------------------------------------- phân loại bundle
BULK = [  # tên bundle -> nhóm
    ("skills_assets_all", "skills"),
    ("encounter_assets_all", "encounters"), ("combat_assets_all", "encounters"),
    ("merchant_assets_all", "encounters"), ("quest_assets_all", "encounters"),
    ("cardframes_assets_all", "frames"), ("cardui_assets_all", "frames"), ("encounterframes_assets_all", "frames"),
    ("ui_gameplay_assets_all", "ui"), ("ui_sprite_atlas_assets_all", "ui"), ("tooltips_assets_all", "ui"),
    ("clock_assets_all", "ui"), ("board_ui_assets_all", "ui"), ("ui_cursor_assets_all", "ui"),
    ("achievements_assets_all", "ui"), ("prizepass_assets_all", "ui"), ("purchases_assets_all", "ui"),
    ("ranks_assets_all", "ui"), ("rewards_assets_all", "ui"), ("scenes_marketplace_assets_all", "ui"),
    ("heroobjects_assets_all", "heroes"), ("scenes_heroselect_assets_all", "heroes"),
    ("skin_van_01_assets_all", "heroes"), ("skin_doo_01_assets_all", "heroes"), ("skin_jul_01_assets_all", "heroes"),
    ("skin_kar_01_assets_all", "heroes"), ("skin_kar_01_creature_assets_all", "heroes"), ("skin_mak_01_assets_all", "heroes"),
    ("skin_pyg_01_assets_all", "heroes"), ("skin_ste_01_assets_all", "heroes"), ("skin_dra_01_assets_all", "heroes"),
    ("skin_vanessa_assets_all", "heroes"), ("skin_dooley_assets_all", "heroes"), ("skin_pygmalien_assets_all", "heroes"),
    ("skin_stelle_assets_all", "heroes"), ("skin_karnok_assets_all", "heroes"),
    ("board_common_assets_all", "board"), ("carpet_common_assets_all", "board"),
]


def plan(index, only):
    C = index["container"]
    amap = decode_catalog()
    cards = json.load(open(os.path.join(DBJSON, "cards.json"), encoding="utf-8"))
    byname = collections.defaultdict(list)
    for p, v in C.items():
        byname[p.rsplit("/", 1)[-1].lower()].append((p, v))
    bystem = collections.defaultdict(list)    # ArtKey trần không đuôi ('Icon_Skill_X') -> ảnh cùng tên
    for p, v in C.items():
        if v[1] in ("Sprite", "Texture2D") and "." in p.rsplit("/", 1)[-1]:
            bystem[p.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()].append((p, v))
    tasks = collections.defaultdict(list)   # (kind,bundle) -> items
    manifest = {}                           # card Id -> {...}
    unresolved = []
    want = lambda g: not only or g in only

    def pick(cands, heroes):
        if len(cands) == 1:
            return cands[0]
        hs = [h.lower() for h in (heroes or [])]
        for p, v in cands:
            if any("/heroes/%s/" % h in p.lower() for h in hs):
                return p, v
        return cands[0]

    for c in cards:
        key = c.get("ArtKey") or ""
        cid, tp = c["Id"], c["$type"]
        if not key or key == "Invalid":
            continue
        iid = amap.get(key, key)
        base = iid.rsplit("/", 1)[-1]
        cands = byname.get(base.lower(), [])
        if not cands and "." not in base:   # tên trần kiểu 'Event_X' -> Event_X_QuestData.asset
            for suf in ("_QuestData.asset", "_CombatData.asset", "_MerchantData.asset", "_CardData.asset"):
                cands = byname.get((base + suf).lower(), [])
                if cands:
                    break
        if not cands and "." not in base:
            cands = bystem.get(base.lower(), [])
        if not cands:
            unresolved.append((cid, c["InternalName"], tp, key, iid)); continue
        p, v = pick(cands, c.get("Heroes"))
        bundle, otype, pid = v
        if p.endswith("_CardData.asset"):
            m = re.search(r"/Heroes/([^/]+)/Cards/([^/]+)/", p)
            stem = "%s_%s" % (m.group(1), m.group(2)) if m else safe(base)
            out_rel = "cards/%s.png" % stem
            if want("cards"):
                tasks[("card", bundle)].append((out_rel, pid))
            manifest[cid] = {"cat": "cards", "name": c["InternalName"], "key": key, "src": p, "out": out_rel}
        elif p.endswith((".asset",)) and tp.startswith("TCardEncounter"):
            pre = "encounters/%s" % safe(base.rsplit(".", 1)[0])
            if want("encounters"):
                tasks[("enc", bundle)].append((pre, pid))
            manifest[cid] = {"cat": "encounters", "name": c["InternalName"], "key": key, "src": p, "out": pre}
        elif otype in ("Sprite", "Texture2D"):
            cat = "skills" if tp == "TCardSkill" else "steps"
            out_rel = "%s/%s.png" % (cat, safe(base.rsplit(".", 1)[0]))
            if want(cat):
                tasks[("obj", bundle)].append((out_rel, pid))
            manifest[cid] = {"cat": cat, "name": c["InternalName"], "key": key, "src": p, "out": out_rel}
        else:
            unresolved.append((cid, c["InternalName"], tp, key, "%s -> %s %s" % (iid, otype, p)))
    for name, cat in BULK:
        if want(cat):
            tasks[("bulk", name + ".bundle")].append(cat)
    if want("ui"):
        for f in sorted(os.listdir(AAW)):
            if f.startswith("ui_buttons") and f.endswith(".bundle"):
                tasks[("bulk", f)].append("ui")
    if want("fonts"):
        for f in sorted(os.listdir(AAW)):
            if f.startswith("fonts") and f.endswith(".bundle"):
                tasks[("fonts", f)].append("fonts")
    # tránh trùng: cùng (kind,bundle,out) xuất hiện nhiều lần
    for k, v in list(tasks.items()):
        if k[0] in ("card", "enc", "obj"):
            tasks[k] = sorted(set(v))
    return tasks, manifest, unresolved


def run_export(only):
    from multiprocessing import Pool
    index = load_index()
    tasks, manifest, unresolved = plan(index, only)
    jobs = []
    for (kind, bundle), items in tasks.items():
        jobs.append((kind, bundle, items[0] if kind in ("bulk", "fonts") else items))
    jobs.sort(key=lambda j: -(len(j[2]) if isinstance(j[2], list) else 50))
    t = time.time()
    stats = collections.Counter(); errs = []; counts = collections.Counter()
    with Pool(4) as pool:
        for i, res in enumerate(pool.imap_unordered(worker, jobs, chunksize=1)):
            for r in res:
                if r[2].startswith("ERR"):
                    errs.append(r)
                stats[r[2][:3]] += 1
                counts[r[0].split("/")[0]] += 1
            if i % 10 == 0:
                print("[%d/%d] %.0fs" % (i + 1, len(jobs), time.time() - t), flush=True)
    os.makedirs(CACHE, exist_ok=True)
    mp = os.path.join(CACHE, "art_manifest.json")
    old = json.load(open(mp, encoding="utf-8")) if (only and os.path.exists(mp)) else {}
    old.update(manifest)
    json.dump(old, open(mp, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({"unresolved": unresolved, "errors": errs}, open(os.path.join(CACHE, "art_problems.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("kết quả", dict(stats), "nhóm", dict(counts), "%.0fs" % (time.time() - t))
    print("ArtKey không giải được:", len(unresolved), "| lỗi xuất:", len(errs))
    for e in errs[:15]:
        print("  ", e)


# ---------------------------------------------------------------- --web
HERO_KEEP = re.compile(r"(Portrait|UI_Profile_Hero|Skin_[A-Z]{3}_01a\.png|StoreImage)", re.I)


def run_web():
    from PIL import Image
    import shutil
    man_p = os.path.join(CACHE, "art_manifest.json")
    if not os.path.exists(man_p):
        sys.exit("thiếu art_manifest.json: chạy art.py (không cờ) trước")
    manifest = json.load(open(man_p, encoding="utf-8"))
    PRIORITY = ["Vanessa", "Pygmalien", "Dooley", "Common", "Neutral", "Adventure"]
    hero_of = lambda out: (re.match(r"cards/([^_]+)_", out) or [None, "?"])[1]
    jobs = {}      # dest_rel -> (prio, src_rel, maxdim, quality, mode, cat)
    amap = {}
    def add(key, prio, src, dest, maxdim, q, mode, cat):
        if not os.path.exists(os.path.join(ART, src.replace("/", os.sep))):
            return
        jobs.setdefault(dest, (prio, src, maxdim, q, mode, cat))
        amap[key] = "art/" + dest
    for cid, m in manifest.items():
        out = m["out"]
        if m["cat"] == "cards":     # RGB: alpha của art thẻ là mặt nạ FX của shader
            add(cid, 0 if hero_of(out) in PRIORITY else 2, out, out[:-4] + ".webp", 256, 80, "RGB", "cards:" + hero_of(out))
        elif m["cat"] in ("skills", "steps"):
            add(cid, 1, out, out[:-4] + ".webp", 256, 82, "RGBA", m["cat"])
        elif m["cat"] == "encounters":
            add(cid + "_char", 1, out + "_char.png", out + "_char.webp", 384, 80, "RGBA", "encounters")
            add(cid + "_bg", 1, out + "_bg.png", out + "_bg.webp", 384, 76, "RGB", "encounters")
    rank = {"icons": 0, "frames": 1, "board": 1, "heroes": 1, "ui": 3}
    for cat in ("icons", "frames", "board", "heroes", "ui"):
        for root, _, fs in os.walk(os.path.join(ART, cat)):
            for f in sorted(fs):
                rel = os.path.relpath(os.path.join(root, f), ART).replace("\\", "/")
                if cat == "heroes" and "/spine/" in rel and f.endswith((".skel", ".atlas")) and re.search(r"_01a\.", f):
                    jobs[rel] = (1, rel, 0, 0, "COPY", cat)      # Spine skin mặc định chép nguyên
                    continue
                if not f.endswith(".png"):
                    continue
                if cat == "heroes" and not HERO_KEEP.search(f):
                    continue
                add("ui:" + rel[:-4], rank[cat], rel, rel[:-4] + ".webp", 768, 85, "RGBA", cat)
    # Xoá art webp cũ để lần chạy sau luôn cho cùng kết quả. Chỉ xoá thư mục con do tool này ghi:
    # frames2d/ (frames.py) và vfx/ (vfx.py) cũng nằm trong art/, xoá cả cây là mất đầu ra của chúng.
    for top in sorted({d.split("/")[0] for d in jobs}):
        if os.path.isdir(os.path.join(WEB_ART, top)):
            shutil.rmtree(os.path.join(WEB_ART, top))
    total = 0; excluded = collections.Counter(); done = {}; t = time.time()
    order = sorted(jobs.items(), key=lambda kv: (kv[1][0], os.path.getsize(os.path.join(ART, kv[1][1].replace("/", os.sep)))))
    for dest, (prio, src, maxdim, q, mode, cat) in order:
        sp = os.path.join(ART, src.replace("/", os.sep)); dp = os.path.join(WEB_ART, dest.replace("/", os.sep))
        if total > WEB_BUDGET:
            excluded[cat] += 1
            continue
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        if mode == "COPY":
            shutil.copyfile(sp, dp)
        else:
            im = Image.open(sp).convert(mode)
            k = float(maxdim) / (im.height if prio in (0, 1, 2) and cat.startswith(("cards", "skills", "steps", "encounters")) else max(im.size))
            if k < 1:
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            im.save(dp, "WEBP", quality=q, method=4)
        done[dest] = os.path.getsize(dp); total += done[dest]
    amap = {k: v for k, v in amap.items() if v[4:] in done}
    os.makedirs(WEB_DATA, exist_ok=True)
    with open(os.path.join(WEB_DATA, "art.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("/* generated by games/bazaar/tools/art.py --web từ D:\\bazaar-ref\\art (The Bazaar Demo) — do not edit */\n")
        f.write("window.BZ_ART=" + json.dumps({"v": 1, "map": amap, "excluded": dict(excluded)}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    bycat = collections.Counter()
    for dest, (prio, src, maxdim, q, mode, cat) in jobs.items():
        if dest in done:
            bycat[cat.split(":")[0]] += done[dest]
    print("webp:", len(done), "file,", round(total / 1048576, 1), "MB; map", len(amap), "mục; loại vì ngân sách:", dict(excluded), "%.0fs" % (time.time() - t))
    print("MB theo nhóm:", {k: round(v / 1048576, 1) for k, v in bycat.items()})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--web", action="store_true")
    a = ap.parse_args()
    if a.web:
        run_web()
    else:
        run_export(set(x for x in a.only.split(",") if x))
