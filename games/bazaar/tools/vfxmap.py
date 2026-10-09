# -*- coding: utf-8 -*-
"""Dựng bản đồ VFX/âm thanh theo từng hành động và từng thẻ của The Bazaar: games/bazaar/data/vfxmap.js
+ các texture phụ trong games/bazaar/art/vfx/ + ghi chú D:\\bazaar-ref\\notes\\VFXMAP.md.

Chạy (Python 3.8, Pillow + numpy; cần node trong PATH để đọc data/cards.js và data/audio.js):
  python -I vfxmap.py            # chỉ dựng vfxmap.js + texture phụ (không xoá art/vfx)
(`python -I vfx.py` chạy trước để dựng bộ texture gốc rồi gọi tiếp tệp này.)

Chuỗi gốc của game (đã đọc từ mã, xem VFXMAP.md):
  ability.VFXConfig.VFXOverrideKey  (đường dẫn prefab, vd "Assets/TheBazaar/Projectiles/Pierce/Projectile_Pierce_PV.prefab")
    -> VFXManager.GenerateCombatVFX: BazaarVFXManagerSO.GetActionOverrideVFX (_actionOverrides, theo size thẻ đích)
       hoặc InstantiateVFX(key) có thay "/Projectiles/" -> "/Emitters/" nếu địa chỉ đó tồn tại
  không có key -> BazaarVFXManagerSO._projectilesByCardAttributeMap[action][size] hoặc _projectilesByActionMap[action]
  prefab -> Projectile (travelTime, throwSpeedCurve, impact.lifeTime), SoundProjectile (buildup/shot/impact), các ParticleSystem.
  thời gian đi của mô phỏng chiến đấu = ProjectileTimingsAsset (sharedassets0.assets) theo key/GUID.
GUID Addressables -> prefab: giải catalog.bin (decode_locations bên dưới).
"""
import os, sys, re, json, struct, glob, math, subprocess, collections, time
import numpy as np
from PIL import Image
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
GAME = os.path.join(REPO, "games", "bazaar")
REF = r"D:\bazaar-ref"
CACHE = os.path.join(REF, "cache")
OUT_PREFABS = os.path.join(REF, "ripped", "out")
VFXSRC = os.path.join(REF, "vfx")
OUTJS = os.path.join(GAME, "data", "vfxmap.js")
OUTART = os.path.join(GAME, "art", "vfx")
NOTE = os.path.join(REF, "notes", "VFXMAP.md")
BUDGET = 15 * 1024 * 1024
UNITY = r"D:\Steam\steamapps\common\The Bazaar Demo\TheBazaar_Data"

ACTION = {}  # tên -> số, đọc từ ActionType.cs
SIZE = {1: "S", 2: "M", 3: "L"}


# ------------------------------------------------------------------ catalog.bin
def decode_locations():
    """Trả {khoá chuỗi: [offset location]} và hàm đọc internalId của location.

    Bố cục đo trên catalog_2026.10.07 (Addressables 2.x, BinaryStorageBuffer không padding):
      header u32: magic, version=2, keysOffset=0x24, ... ; u32 tại 0x20 = số byte của mảng khoá.
      mảng khoá = cặp (đối tượng khoá, danh sách location) xen kẽ.
      đối tượng khoá = [type 0x22d971][ptr tới ô chứa ptr chuỗi]; danh sách location = [len][offset...].
      location: trường đầu (offset - 8) là con trỏ chuỗi internalId (đo: 2159/2160 ArtKey khớp art.py).
    """
    b = open(os.path.join(CACHE, "catalog.bin"), "rb").read()
    n = len(b)
    U = lambda o: struct.unpack_from("<I", b, o)[0]

    def S(off):
        off &= 0x3fffffff
        if off < 8 or off > n - 8:
            return None
        ln = U(off - 4)
        if ln < 1 or ln > 1000 or off + ln > n:
            return None
        try:
            return b[off:off + ln].decode("ascii")
        except Exception:
            return None
    nk = U(0x20) // 4
    keys = [U(0x24 + 4 * i) for i in range(nk)]
    tab = {}
    for i in range(0, nk, 2):
        o, lo = keys[i], keys[i + 1]
        try:
            k = S(U(U(o + 4)))
        except Exception:
            k = None
        if not k:
            continue
        c = U(lo - 4) // 4
        tab[k] = [U(lo + 4 * j) & 0x3fffffff for j in range(c)]

    def internal_id(loc):
        return S(U(loc - 8))
    return tab, internal_id


# ------------------------------------------------------------------ chỉ mục tài nguyên
def load_container():
    d = json.load(open(os.path.join(CACHE, "bundle_index.json"), encoding="utf-8"))["container"]
    by_base = collections.defaultdict(list)
    for p in d:
        if p.endswith(".prefab"):
            by_base[os.path.basename(p).lower()].append(p)
    return d, by_base


def build_resolver(container, by_base, t_key):
    by_norm = collections.defaultdict(list)
    for p in container:
        if p.endswith(".prefab"):
            by_norm[norm(os.path.basename(p)[:-len(".prefab")])].append(p)

    def resolve(K):
        """VFXOverrideKey (địa chỉ Addressables, hay lệch đường dẫn thật) -> (đường dẫn prefab, cách khớp).
        Quy tắc game: địa chỉ '/Projectiles/' -> '/Emitters/' nếu địa chỉ đó tồn tại (VFXManager.cs:437)."""
        k2 = K.replace("/Projectiles/", "/Emitters/")
        want_emit = k2 != K and (k2 in container or k2 in t_key)
        if want_emit and k2 in container:
            return k2, "emitter-path"
        if not want_emit and K in container:
            return K, "path"
        base = os.path.basename(K)
        if base.endswith(".prefab"):
            base = base[:-len(".prefab")]
        n0 = norm(base)
        cands = []
        for n in (n0, n0.replace("variant", ""), n0 + "pv", n0.replace("variant", "") + "pv"):
            cands += by_norm.get(n, [])
            if cands:
                break
        if want_emit:
            em = [c for c in cands if "/Emitters/" in c]
            if em:
                return em[0], "emitter-name"
        if K in container:
            return K, "path"
        if cands:
            pr = [c for c in cands if "/Projectiles/" in c] or cands
            return pr[0], "name"
        return None, None
    return resolve


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def dump_index():
    """Tên dump (khoảng trắng đã thành '_') -> tệp. Khoá = chữ-số thường của tên, bỏ '.prefab.json'."""
    idx = {}
    for f in glob.glob(os.path.join(OUT_PREFABS, "*", "prefabs", "*.prefab.json")):
        idx[norm(os.path.basename(f)[:-len(".prefab.json")])] = f
    return idx


def flat(path):
    p = path[len("Assets/"):] if path.startswith("Assets/") else path
    if p.endswith(".prefab"):
        p = p[:-len(".prefab")]
    return norm(p)


def pick_path(cands):
    """Nhiều prefab trùng tên: ưu tiên Projectiles, rồi Emitters, rồi Art/FX."""
    for pref in ("/Projectiles/", "/Emitters/", "/Art/FX/", "/"):
        for c in cands:
            if pref in c:
                return c
    return cands[0]


def read_timings():
    """ProjectileTimingsAsset: MonoBehaviour thô trong sharedassets0.assets (typetree bị lược nên parse tay)."""
    p = os.path.join(CACHE, "projectile_timings.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    import UnityPy
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
    env = UnityPy.load(os.path.join(UNITY, "sharedassets0.assets"))
    for o in env.objects:
        if o.type.name == "MonoBehaviour" and o.peek_name() == "ProjectileTimings":
            raw = bytes(o.get_raw_data())

            def rs(q):
                m = struct.unpack_from("<i", raw, q)[0]
                s = raw[q + 4:q + 4 + m].decode("utf-8", "replace")
                q += 4 + m
                return s, (q + 3) & ~3
            q = 28
            _, q = rs(q)
            cnt = struct.unpack_from("<i", raw, q)[0]
            q += 4
            out = []
            for _ in range(cnt):
                g, q = rs(q)
                k, q = rs(q)
                t = struct.unpack_from("<f", raw, q)[0]
                q += 4
                out.append({"guid": g, "key": k, "t": t})
            assert q == len(raw), "timings: lệch byte"
            json.dump(out, open(p, "w", encoding="utf-8"))
            return out
    raise SystemExit("không thấy ProjectileTimings trong sharedassets0.assets")


# ------------------------------------------------------------------ phân tích prefab
MATDB = None
MANIFEST = None


def hexcol(c):
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(c[k] * 255)))) for k in "rgb")


def norm_col(c):
    m = max(c["r"], c["g"], c["b"], 1e-6)
    s = 1.0 / m if m < 1 else 1.0
    return {"r": c["r"] * s, "g": c["g"] * s, "b": c["b"] * s}


def sat(c):
    m, n = max(c["r"], c["g"], c["b"]), min(c["r"], c["g"], c["b"])
    return 0 if m <= 0 else (m - n) / m


def start_color(init):
    sc = init["startColor"]
    st = sc["minMaxState"]
    if st in (0, 3):
        return dict(sc["maxColor"])
    g = sc.get("maxGradient") or {}
    k = g.get("key0")
    return dict(k) if k else {"r": 1, "g": 1, "b": 1, "a": 1}


def grad_colors(cm):
    out = []
    if not cm or not cm.get("enabled"):
        return out
    g = cm["gradient"]
    g = g.get("maxGradient", g)
    for i in range(int(g.get("m_NumColorKeys", 0))):
        k = g["key%d" % i]
        out.append({"r": k["r"], "g": k["g"], "b": k["b"], "a": 1})
    return out


def mat_of(renderer):
    ms = renderer.get("m_Materials") or []
    if not ms or not ms[0]:
        return None, None
    name = ms[0].split(":", 1)[-1]
    lst = MATDB.get(name)
    return name, (lst[0] if lst else None)


def mat_tex(m):
    if not m:
        return None
    t = m.get("tex") or {}
    for k in ("_MainTex", "_BaseMap"):
        if k in t and t[k].get("tex"):
            return t[k]["tex"]
    for k, v in t.items():
        if "Distortion" in k or "Overlay" in k:
            continue
        if v.get("tex"):
            return v["tex"]
    return None


def mat_blend(m):
    if not m:
        return "alpha"
    f = m.get("floats", {})
    if f.get("_SourceBlendRGB") is not None:
        sb, db = f.get("_SourceBlendRGB"), f.get("_DestinationBlendRGB")
    else:
        sb, db = f.get("_SrcBlend"), f.get("_DstBlend")
    if sb is None or db is None:
        return "alpha"
    return {(5, 10): "alpha", (1, 1): "add", (5, 1): "add", (1, 10): "premul", (3, 10): "alpha", (1, 0): "alpha"}.get((int(sb), int(db)), "alpha")


def mm(v):
    return v.get("scalar", 0)


def eval_curve(keys, t):
    """Hermite của Unity AnimationCurve (khoá: time, value, inSlope, outSlope)."""
    if not keys:
        return t
    if t <= keys[0]["time"]:
        return keys[0]["value"]
    if t >= keys[-1]["time"]:
        return keys[-1]["value"]
    for a, c in zip(keys, keys[1:]):
        if a["time"] <= t <= c["time"]:
            dt = c["time"] - a["time"]
            s = (t - a["time"]) / dt
            m0, m1 = a["outSlope"] * dt, c["inSlope"] * dt
            if math.isinf(m0) or math.isinf(m1):
                return a["value"]
            s2, s3 = s * s, s * s * s
            return (2 * s3 - 3 * s2 + 1) * a["value"] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * c["value"] + (s3 - s2) * m1
    return 1.0


def slot_of(path):
    p = path.lower()
    if "buildup" in p or "build_up" in p:
        return "build"
    if "slot_impact" in p or "/impact" in p:
        return "impact"
    if "slot_projectile" in p or "/projectile" in p:
        return "proj"
    return "other"


def collect_ps(tree):
    out = []

    def walk(n, path, active):
        p = path + "/" + n["name"]
        act = active and n.get("active", True)
        pss = [c for c in n["comps"] if c["_t"] == "ParticleSystem"]
        rs = [c for c in n["comps"] if c["_t"] == "ParticleSystemRenderer"]
        if pss and rs:
            ps, r = pss[0], rs[0]
            ini = ps["InitialModule"]
            mname, m = mat_of(r)
            tex = mat_tex(m)
            uv = ps["UVModule"]
            em = ps["EmissionModule"]
            cnt = 0
            for bu in em.get("m_Bursts") or []:
                cnt += bu.get("maxCount", bu.get("minCount", 1)) if "countCurve" not in bu else max(1, mm(bu["countCurve"]))
            if em["enabled"] and mm(em["rateOverTime"]):
                cnt += mm(em["rateOverTime"]) * min(ps["lengthInSec"], 1.0)
            c0 = start_color(ini)
            lt = mm(ini["startLifetime"])
            size = mm(ini["startSize"])
            out.append({
                "path": p, "slot": slot_of(p), "active": act, "tex": tex, "mat": mname,
                "blend": mat_blend(m), "mode": r["m_RenderMode"], "size": size, "life": lt,
                "count": cnt, "color": c0, "grad": grad_colors(ps["ColorModule"]),
                "matcolor": (m or {}).get("colors", {}), "name": n["name"],
                "sheet": ({"cols": uv["tilesX"], "rows": uv["tilesY"], "fps": uv["fps"], "type": uv["animationType"],
                           "life": uv["frameOverTime"].get("minMaxState", 0) != 0 or uv["frameOverTime"].get("scalar", 0) != 0,
                           "random": uv["startFrame"].get("scalar", 0) > 0 or uv["frameOverTime"].get("minMaxState") == 3}
                          if uv["enabled"] and uv["tilesX"] * uv["tilesY"] > 1 else None),
                "trail": ps["TrailModule"]["enabled"], "shader": (m or {}).get("shader", ""),
            })
        for tr in [c for c in n["comps"] if c["_t"] == "TrailRenderer"]:
            mname, m = mat_of(tr)
            prm = tr.get("m_Parameters") or {}
            gr = prm.get("colorGradient") or {}
            k0 = (gr.get("key0") if isinstance(gr, dict) else None) or {"r": 1, "g": 1, "b": 1, "a": 1}
            out.append({
                "path": p, "slot": slot_of(p), "active": act, "tex": mat_tex(m), "mat": mname, "blend": mat_blend(m), "mode": 5,
                "size": prm.get("widthMultiplier", 1.0), "life": tr.get("m_Time", 0.3), "count": 1, "color": dict(k0), "grad": [],
                "matcolor": (m or {}).get("colors", {}), "name": n["name"], "sheet": None, "trail": True, "shader": (m or {}).get("shader", ""),
                "trailRenderer": True,
            })
        for ch in n["children"]:
            walk(ch, p, act)
    walk(tree, "", True)
    return out


def find_comp(n, script):
    for c in n["comps"]:
        if c.get("_script") == "@MonoScript:" + script:
            return c
    for ch in n["children"]:
        r = find_comp(ch, script)
        if r:
            return r
    return None


BAD_CAT = {"noise", "mask", "gradient"}
PREF = {"glow": 1.0, "spark": 1.0, "flipbook": 1.0, "misc": 1.0, "fire": 1.0, "ice": 1.0, "coin": 1.0, "bubble": 1.0, "slash": 0.9,
        "ray": 0.8, "ring": 0.9, "frame": 0.8, "smoke": 0.6, "variants": 0.8, "line": 0.5}


def score(p, want):
    if not p["active"] or not p["tex"] or p["tex"] not in MANIFEST:
        return 0
    cat = MANIFEST[p["tex"]]["category"]
    if cat in BAD_CAT:
        return 0
    s = max(p["size"], 0.05) * PREF.get(cat, 0.7) * max(0.2, min(p["color"].get("a", 1), 1))
    s *= min(1.0, 0.3 + p["life"])
    s *= 1 + min(p["count"], 6) * 0.05
    nm = p["name"].lower()
    if want == "proj":
        if "trail" in nm or p["mode"] == 5:
            return 0
        if any(w in nm for w in ("core", "tip", "head", "projectile", "bullet", "main")):
            s *= 1.6
        if p["size"] > 6:
            s *= 0.3
    if want == "trail":
        if not ("trail" in nm or p["trail"] or p["mode"] == 5):
            return 0
    if want == "impact":
        if any(w in nm for w in ("core", "burst", "flash", "impact", "hit", "swoosh", "shock")):
            s *= 1.3
    if p["mode"] == 4:
        s *= 0.4
    return s


def pick(pss, slot, want=None):
    cand = [p for p in pss if p["slot"] == slot and score(p, want or slot) > 0]
    if not cand and slot == "proj":
        cand = [p for p in pss if p["slot"] == "other" and score(p, "proj") > 0]
    if not cand:
        return None
    return max(cand, key=lambda p: score(p, want or slot))


def color_of(p):
    if not p:
        return None
    c = p["color"]
    if sat(c) < 0.15:
        for g in p["grad"]:
            if sat(g) >= 0.3:
                c = g
                break
        else:
            oc = p["matcolor"].get("_OverlayColor1") or p["matcolor"].get("_BaseColor")
            if oc and p["shader"].endswith("Layered Master"):
                cc = {"r": oc[0], "g": oc[1], "b": oc[2]}
                if sat(cc) >= 0.3:
                    c = cc
    c = norm_col(c)
    return hexcol(c)


class Ctx:
    pass


def analyse(path, X):
    """path = đường dẫn prefab trong container. Trả entry (dict) hoặc None."""
    if path in X.cache:
        return X.cache[path]
    f = X.dumps.get(flat(path))
    res = None
    if f:
        tree = json.load(open(f, encoding="utf-8"))
        pr = find_comp(tree, "Projectile")
        pss = collect_ps(tree)
        res = {"prefab": path, "dump": os.path.basename(f)}
        if pr and "travelTime" in pr:
            cv = (pr.get("throwSpeedCurve") or {}).get("m_Curve") or []
            res["visualTravelMs"] = round(pr["travelTime"] * 1000)
            res["delayMs"] = round(pr.get("startEventDelay", 0) * 1000)
            res["impactMs"] = round(pr["impact"]["lifeTime"] * 1000) if pr.get("impact") else 0
            res["curve"] = [[round(i / 8.0, 3), round(eval_curve(cv, i / 8.0), 3)] for i in range(9)] if cv else [[0, 0], [1, 1]]
            res["yOffset"] = round(pr.get("yAxisOffset", 0), 3)
            res["arc"] = bool(pr.get("useCustomPathPoints")) or bool(pr.get("complexPath"))
        hp = pick(pss, "proj")
        tp = pick(pss, "proj", "trail") if hp else pick(pss, "proj", "trail")
        bp = pick(pss, "build")
        ip = pick(pss, "impact")
        res["_ps"] = {"projectile": hp, "trail": tp, "buildup": bp, "impact": ip}
        res["beam"] = bool(tp and tp.get("trailRenderer") and not hp)
        res["psCount"] = len(pss)
        res["emitter"] = find_comp(tree, "Emitter") is not None
        res["slots"] = sorted(set(p["slot"] for p in pss))
        res["color"] = color_of(hp) or color_of(ip) or color_of(bp)
        res["impactColor"] = color_of(ip) or res["color"]
        res["size"] = {"p": round(hp["size"], 2) if hp else None, "i": round(ip["size"], 2) if ip else None}
    X.cache[path] = res
    return res


# ------------------------------------------------------------------ âm thanh
def load_audio():
    js = ("global.window=global;require(%s);const o={};for(const k of Object.keys(BZ_AUDIO))o[k]=BZ_AUDIO[k].event||null;"
          "console.log(JSON.stringify(o))" % json.dumps(os.path.join(GAME, "data", "audio.js")))
    r = subprocess.run(["node", "-e", js], capture_output=True, check=True)
    ev2key = {}
    keys = json.loads(r.stdout.decode("utf-8"))
    for k, e in keys.items():
        if e:
            ev2key.setdefault(e, []).append(k)
    return keys, ev2key


def best_key(ev, ev2key):
    ks = ev2key.get(ev)
    if not ks:
        return None
    ks = sorted(ks, key=lambda k: (not k.startswith("combat."), len(k)))
    return ks[0]


def sounds_for(path, X):
    ev = X.chain.get(path) or {}
    out = {"buildup": None, "fire": None, "travel": None, "impact": None}
    miss = []
    for src, dst in (("buildup", "buildup"), ("shot", "fire"), ("impact", "impact")):
        e = ev.get(src)
        if not e:
            continue
        k = best_key(e, X.ev2key)
        if k:
            out[dst] = k
        else:
            miss.append(e)
            X.missing_events.setdefault(e, set()).add(path)
    return out


# ------------------------------------------------------------------ texture phụ
def tex_kind_and_img(name):
    info = MANIFEST[name]
    im = Image.open(os.path.join(VFXSRC, info["file"].replace("/", os.sep)))
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255.0
    w = a[..., 3] * a[..., :3].max(axis=2)
    if w.sum() < 1e-3:
        return "mask", im
    rgb = a[..., :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    s = ((mx - mn) / np.maximum(mx, 1e-4) * w).sum() / w.sum()
    return ("color" if s > 0.35 else "mask"), im


def export_textures(X, wanted):
    """wanted: {tên texture: {cols,rows,fps,anim,blends}} -> art/vfx/<khoá>.webp. Trả {khoá: sprite}."""
    sys.path.insert(0, HERE)
    import vfx as V
    os.makedirs(OUTART, exist_ok=True)
    base_by_from = {os.path.splitext(os.path.basename(v[0]))[0]: k for k, v in V.TEX.items()}
    sprites = {}
    total = 0
    for name, w in sorted(wanted.items()):
        key = base_by_from.get(name) or name
        info = MANIFEST[name]
        cols, rows = w["cols"], w["rows"]
        kind, im = tex_kind_and_img(name)
        if key in V.TEX:
            kind = V.TEX[key][1]
            cols, rows = V.TEX[key][3], V.TEX[key][4]
        dst = os.path.join(OUTART, key + ".webp")
        if key not in V.TEX:
            if kind == "mask":
                ch = None
                if re.search(r"Packed", name):
                    ch = 0
                im2 = V.to_mask(im, ch)
            else:
                im2 = im.convert("RGBA")
            cell = 96
            mx = max(128, min(512, max(cols, rows) * cell))
            if max(cols, rows) == 1:
                mx = 192
            im2 = V.fit(im2, mx)
            im2.save(dst, "WEBP", quality=84, method=6)
            wpx, hpx = im2.size
        else:
            im2 = Image.open(dst)
            wpx, hpx = im2.size
        total += os.path.getsize(dst)
        sprites[key] = {"src": "art/vfx/%s.webp" % key, "w": wpx, "h": hpx, "cols": cols, "rows": rows,
                        "fps": int(w.get("fps") or 30), "anim": w.get("anim") or "", "kind": kind,
                        "blend": w["blend"], "scale": w["scale"], "from": info["file"]}
    return sprites, total


# ------------------------------------------------------------------ chính
def card_actions():
    js = ("global.window=global;require(%s);const C=BZ_CARDS,o={};"
          "for(const id of Object.keys(C)){const c=C[id],ab=[];"
          "for(const [k,a] of Object.entries(c.Abilities||{})){const t=a.Action&&a.Action['$type'];"
          "ab.push({id:k,type:t,key:(a.VFXConfig&&a.VFXConfig.VFXOverrideKey)||null,play:a.VFXConfig?a.VFXConfig.VFXShouldPlay:true});}"
          "o[id]={n:c.InternalName,size:c.Size,t:c.Type,ab};}console.log(JSON.stringify(o))" % json.dumps(os.path.join(GAME, "data", "cards.js")))
    r = subprocess.run(["node", "-e", js], capture_output=True, check=True)
    return json.loads(r.stdout.decode("utf-8"))


def load_actions():
    s = open(os.path.join(REF, "src", "TheBazaarRuntime", "TheBazaar", "ActionType.cs"), encoding="utf-8").read()
    for m in re.finditer(r"(\w+) = (-?\d+)", s):
        ACTION[m.group(1)] = int(m.group(2))
    return {v: k for k, v in ACTION.items()}


IGNORED = {"CardForceUse", "CardModifyAttribute", "CardReload", "PlayerModifyAttribute", "PlayerTempoApply", "PlayerTempoRemove", "Unknown"}


T0 = time.time()


def tick(msg):
    print("[%5.1fs] %s" % (time.time() - T0, msg), flush=True)


def main():
    global MATDB, MANIFEST
    MATDB = json.load(open(os.path.join(REF, "ripped", "matdb.json"), encoding="utf-8"))
    MANIFEST = json.load(open(os.path.join(VFXSRC, "manifest.json"), encoding="utf-8"))
    tick("matdb+manifest")
    id2name = load_actions()
    X = Ctx()
    X.cache = {}
    X.dumps = dump_index()
    X.missing_events = {}
    tab, internal_id = decode_locations()
    container, by_base = load_container()
    X.container = container
    X.keys_audio, X.ev2key = load_audio()
    chain = json.load(open(os.path.join(REF, "audio", "meta", "chain.json"), encoding="utf-8"))
    X.chain = chain["projectiles"]
    tick("catalog+audio")
    timings = read_timings()
    t_guid = {e["guid"]: e["t"] for e in timings}
    t_key = {e["key"]: e["t"] for e in timings}
    so = json.load(open(glob.glob(os.path.join(OUT_PREFABS, "dl_assets_scriptableobjects_bazaarvfxmanagerso.asset", "assets", "MonoBehaviour", "*.json"))[0], encoding="utf-8"))

    resolve = build_resolver(container, by_base, t_key)
    how_count = collections.Counter()

    def guid_path(g):
        locs = tab.get(g)
        if not locs:
            return None
        base = internal_id(locs[0])
        if not base:
            return None
        c = by_base.get(base.lower())
        return pick_path(c) if c else None

    def entry_for(path, guid=None, override_key=None):
        e = analyse(path, X)
        if not e:
            return None
        out = {k: v for k, v in e.items() if k not in ("_ps", "dump")}
        out["sounds"] = sounds_for(path, X)
        if guid:
            out["guid"] = guid
        out["_ps"] = e["_ps"]
        tv = None
        if guid and guid in t_guid:
            tv = t_guid[guid]
        if override_key and override_key in t_key:
            tv = t_key[override_key]
        out["travelMs"] = round(tv * 1000) if tv is not None else out.get("visualTravelMs", 250)
        out["travelSrc"] = "timings" if tv is not None else ("prefab" if "visualTravelMs" in out else "default 250")
        return out

    # ---- defaults
    defaults = {}
    for e in so["_projectilesByActionMap"]:
        a = id2name.get(e["ActionType"], str(e["ActionType"]))
        g = e["Projectile"]["m_AssetGUID"]
        p = guid_path(g)
        ent = entry_for(p, g) if p else None
        if ent:
            ent["via"] = "_projectilesByActionMap"
            defaults[a] = ent
        else:
            defaults.setdefault(a, {"unresolved": g, "via": "_projectilesByActionMap"})
    for e in so["_projectilesByCardAttributeMap"]:
        a = id2name.get(e["ActionType"], str(e["ActionType"]))
        d = defaults.setdefault(a, {})
        sizes = {}
        variants = []
        for it in e["Items"]:
            g = it["Projectile"]["m_AssetGUID"]
            p = guid_path(g)
            ent = entry_for(p, g) if p else None
            if not ent:
                continue
            ent["via"] = "_projectilesByCardAttributeMap"
            variants.append((it["Size"], it["Tier"], ent))
        if variants:
            first = variants[0][2]
            d.update({k: v for k, v in first.items()})
            d["via"] = "_projectilesByCardAttributeMap (Items[0]; GetVFX(size, action) ưu tiên hơn _projectilesByActionMap)"
            if any(t == 0 for _, t, _ in variants):
                d["sizes"] = {SIZE[s]: ent for s, t, ent in variants if t == 0}
            else:
                d["sizeTier"] = {"%s%d" % (SIZE[s], t): ent for s, t, ent in variants}
            d["attrMapped"] = True
    for e in so["_projectileTiersByActionMap"]:
        a = id2name.get(e["ActionType"], str(e["ActionType"]))
        d = defaults.setdefault(a, {})
        d["tiers"] = {}
        for it in e["Items"]:
            g = it["Projectile"]["m_AssetGUID"]
            p = guid_path(g)
            ent = entry_for(p, g) if p else None
            if ent:
                d["tiers"][str(it["TierValue"])] = ent
    for a, d in defaults.items():
        if a in ACTION:
            d["actionId"] = ACTION[a]
    # ---- actionOverrides (khoá override -> theo size)
    overrides = []
    for e in so["_actionOverrides"]:
        a = id2name.get(e["ActionType"], str(e["ActionType"]))
        g = e["Projectile"]["m_AssetGUID"]
        p = guid_path(g)
        items = {}
        for it in e["Items"]:
            gg = it["Projectile"]["m_AssetGUID"]
            pp = guid_path(gg)
            if pp:
                items[SIZE.get(it["Size"], str(it["Size"]))] = pp
        overrides.append({"action": a, "key": p, "guid": g, "items": items})

    tick("defaults")
    # ---- thẻ
    cards_in = card_actions()
    cards = {}
    stats = collections.Counter()
    miss_override = collections.Counter()
    action_cov = collections.defaultdict(lambda: collections.Counter())
    key_usage = collections.Counter()
    for cid, c in cards_in.items():
        res = {}
        kinds = set()
        for ab in c["ab"]:
            t = ab["type"] or ""
            aname = t[len("TAction"):] if t.startswith("TAction") else t
            aname = {"CardFlyingStart": "FlyingStart", "CardFlyingStop": "FlyingStop", "CardFlyingToggle": "FlyingToggle"}.get(aname, aname)
            key = ab["key"]
            ent = None
            if key:
                key_usage[key] += 1
                path, how = resolve(key)
                ov = [o for o in overrides if o["action"] == aname and o["key"] and path and o["key"] == path]
                if ov:
                    ent = entry_for(ov[0]["items"].get("M") or list(ov[0]["items"].values())[0], None, key)
                    if ent:
                        ent["sizes"] = {s: analyse(pp, X) and entry_for(pp, None, key) for s, pp in ov[0]["items"].items()}
                        ent["via"] = "_actionOverrides"
                elif path:
                    ent = entry_for(path, None, key)
                    if ent:
                        ent["via"] = "VFXOverrideKey -> " + how
                        how_count[how] += 1
                if not ent:
                    miss_override[key] += 1
                    kinds.add("override-missing")
                else:
                    ent["exact"] = True
                    ent["overrideKey"] = key
                    kinds.add("exact")
            else:
                d = defaults.get(aname)
                if aname in ACTION and d and ("prefab" in d or "sizes" in d or "tiers" in d or "sizeTier" in d):
                    kinds.add("default")
                    action_cov[aname]["default"] += 1
                elif aname in ACTION and aname not in IGNORED:
                    kinds.add("nodefault")
                    action_cov[aname]["none"] += 1
                else:
                    kinds.add("novfx")
                    action_cov[aname]["ignored" if aname in IGNORED else "unmapped"] += 1
            if ent:
                ent["action"] = aname
                res[ab["id"]] = ent
            else:
                res.setdefault("_defaults", {})[ab["id"]] = aname
        # phân loại cho thống kê
        if "exact" in kinds:
            stats["exact"] += 1
        elif "override-missing" in kinds:
            stats["override-missing"] += 1
        elif "default" in kinds:
            stats["default"] += 1
        elif "nodefault" in kinds:
            stats["nodefault"] += 1
        else:
            stats["novfx"] += 1
        if res.get("_defaults") is not None and not [k for k in res if k != "_defaults"]:
            res.pop("_defaults")
            if kinds & {"default"}:
                cards[cid] = {"default": True}
            continue
        ab_entries = {k: v for k, v in res.items() if k != "_defaults"}
        if ab_entries:
            first = next(iter(ab_entries.values()))
            cards[cid] = {"abilities": ab_entries}

    tick("cards")
    # ---- gom texture cần xuất, đặt khoá sprite
    wanted = {}

    def want(ps_p, role, ent_blend):
        if not ps_p or not ps_p["tex"]:
            return
        n = ps_p["tex"]
        sh = ps_p["sheet"] or {}
        info = MANIFEST[n]
        cols = sh.get("cols") or (info["flipbook"]["cols"] if info.get("flipbook") and info["category"] in ("flipbook", "variants") else 1)
        rows = sh.get("rows") or (info["flipbook"]["rows"] if info.get("flipbook") and info["category"] in ("flipbook", "variants") else 1)
        w = wanted.setdefault(n, {"cols": cols, "rows": rows, "fps": sh.get("fps", 30), "anim": "", "blends": collections.Counter(), "sizes": []})
        if sh and (sh.get("random")):
            w["anim"] = "random"
        elif sh and sh.get("life"):
            w["anim"] = "life"
        elif sh:
            w["anim"] = "fps"
        w["blends"][ps_p["blend"]] += 1
        w["sizes"].append(ps_p["size"])

    def all_entries():
        for d in defaults.values():
            if "_ps" in d:
                yield d
            for sub in (d.get("sizes") or {}).values():
                yield sub
            for sub in (d.get("sizeTier") or {}).values():
                yield sub
            for sub in (d.get("tiers") or {}).values():
                yield sub
        for c in cards.values():
            for a in (c.get("abilities") or {}).values():
                yield a
                for sub in (a.get("sizes") or {}).values():
                    if sub:
                        yield sub

    ents = list(all_entries())
    for e in ents:
        for role, p in e["_ps"].items():
            want(p, role, None)
    for n, w in wanted.items():
        w["blend"] = w["blends"].most_common(1)[0][0]
        w["scale"] = round(float(np.median(w["sizes"])), 2)

    tick("wanted")
    # hạn mức: bỏ texture ít dùng nhất nếu vượt
    sprites, total = export_textures(X, wanted)
    while total > BUDGET:
        raise SystemExit("art/vfx vượt hạn mức %d" % total)
    keyof = {}
    for n in wanted:
        pass
    base_by_from = {}
    sys.path.insert(0, HERE)
    import vfx as V
    base_by_from = {os.path.splitext(os.path.basename(v[0]))[0]: k for k, v in V.TEX.items()}
    key_for = lambda n: base_by_from.get(n) or n

    def finish(e):
        ps = e.pop("_ps", None)
        if ps is None:
            return
        for role in ("projectile", "trail", "buildup", "impact"):
            p = ps.get(role)
            e[role] = key_for(p["tex"]) if p and p["tex"] in wanted else None
        bl = {}
        for role in ("projectile", "impact"):
            p = ps.get(role)
            if p:
                bl[role] = p["blend"]
        e["blend"] = bl
        for role, k in (("trail", "trailSize"),):
            pass
        e["size"] = e.get("size") or {}
        # bỏ trường phụ
        for k in ("emitter", "psCount", "slots"):
            e.pop(k, None)

    seen = set()
    for e in ents:
        if id(e) in seen:
            continue
        seen.add(id(e))
        finish(e)

    prefabs = {}
    for cid, c in cards.items():
        if "abilities" in c:
            c.update({k: v for k, v in next(iter(c["abilities"].values())).items()})
        abil = c.pop("abilities", None)
        sz = c.pop("sizes", None)
        if sz:
            c["sizeFx"] = {k: e["prefab"] for k, e in sz.items() if e}
            for e in sz.values():
                if e:
                    prefabs[e["prefab"]] = {k: v for k, v in e.items() if k not in ("guid", "overrideKey", "exact", "action", "sizes", "via")}
        if abil and len(abil) > 1:
            c["abilities"] = {k: {"action": v.get("action"), "prefab": v.get("prefab"), "key": v.get("overrideKey")} for k, v in abil.items()}
        c.pop("guid", None)

    out = {"defaults": {}, "cards": {}, "sprites": {}, "prefabs": prefabs, "rev": "vfxmap-1"}
    for a, d in sorted(defaults.items()):
        out["defaults"][a] = d
    out["cards"] = cards
    out["sprites"] = sprites
    out["overrides"] = [{"action": o["action"], "key": o["key"], "items": o["items"]} for o in overrides]
    out["timings"] = {"count": len(timings)}

    def cleanup(o):
        if isinstance(o, dict):
            return {k: cleanup(v) for k, v in o.items() if v is not None and not (k in ("guid",) and False)}
        if isinstance(o, list):
            return [cleanup(v) for v in o]
        return o
    out = cleanup(out)

    hdr = ("// Sinh bởi tools/vfxmap.py, đừng sửa tay. Bản đồ VFX + âm thanh theo ActionType (defaults) và theo thẻ (cards, từ VFXOverrideKey).\n"
           "// Nguồn từng mục: D:\\bazaar-ref\\notes\\VFXMAP.md. Khoá âm thanh là khoá của window.BZ_AUDIO; sprites[key] ghi blend/size/ô lưới.\n")
    os.makedirs(os.path.dirname(OUTJS), exist_ok=True)
    with open(OUTJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(hdr + "window.BZ_VFXMAP = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")

    # ---- thống kê + ghi chú
    ncard = len(cards_in)
    rep = {
        "cards": ncard, "stats": dict(stats), "sprites": len(sprites), "artKB": round(total / 1024.0),
        "jsKB": round(os.path.getsize(OUTJS) / 1024.0),
        "missingOverride": dict(miss_override), "howOverride": dict(how_count), "actionCov": {k: dict(v) for k, v in action_cov.items()},
        "missingEvents": {k: sorted(v)[:3] for k, v in X.missing_events.items()},
        "defaults": {k: {"prefab": v.get("prefab"), "sizes": list((v.get("sizes") or {}).keys()), "tiers": list((v.get("tiers") or {}).keys()), "travelMs": v.get("travelMs"),
                          "projectile": v.get("projectile"), "impact": v.get("impact"), "sounds": v.get("sounds")} for k, v in out["defaults"].items()},
        "keys": len(key_usage),
    }
    json.dump(rep, open(os.path.join(CACHE, "vfxmap_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_note(out, rep, overrides, key_usage, X)
    print(json.dumps({k: rep[k] for k in ("cards", "stats", "sprites", "artKB", "jsKB", "keys")}, ensure_ascii=False))
    print("cách khớp override:", rep["howOverride"])
    print("override thiếu:", rep["missingOverride"])
    print("action không default:", {k: v for k, v in rep["actionCov"].items() if v.get("none")})
    print("event thiếu trong BZ_AUDIO:", rep["missingEvents"])


def write_note(out, rep, overrides, key_usage, X):
    L = []
    A = L.append
    A("# VFXMAP.md - VFX + âm thanh theo hành động và theo thẻ (The Bazaar demo)\n")
    A("Owner: vfxmap. Tool: `games/bazaar/tools/vfxmap.py` (chạy sau `vfx.py`). Ra: `games/bazaar/data/vfxmap.js` (`window.BZ_VFXMAP`), texture phụ `games/bazaar/art/vfx/*.webp`.\n")
    A("Rerun: `cd games/bazaar/tools && python -I vfx.py && python -I vfxmap.py` (cần node trong PATH, `D:\\bazaar-ref\\cache\\catalog.bin`, `ripped\\out`, `vfx\\manifest.json`, `audio\\meta\\chain.json`).\n")
    A("## 1. Chuỗi gốc (đọc từ mã)\n")
    A("```")
    A("ability.VFXConfig.VFXOverrideKey (đường dẫn prefab, 93 khoá riêng biệt trong data/cards.js)")
    A("  -> VFXManager.GenerateCombatVFX  (TheBazaarRuntime/TheBazaar/VFXManager.cs:147-207)")
    A("       1. có key và thẻ đích: BazaarVFXManagerSO.GetActionOverrideVFX(action, size, key)  (BazaarVFXManagerSO.cs:253-269)")
    A("          so key với PrimaryKey của _actionOverrides[].Projectile cùng ActionType, chọn Items theo ECardSize (không có -> Items[0])")
    A("       2. không khớp: IsActionAttributeMapped(action) ? GetVFX(size, action) (_projectilesByCardAttributeMap) : GetVFX(action) (_projectilesByActionMap)")
    A("       3. có key mà bước 1 trượt: InstantiateVFX(key) (VFXManager.cs:388-396): TryInstantiateVFXByAddress đổi '/Projectiles/' -> '/Emitters/'")
    A("          và dùng bản Emitter nếu địa chỉ đó tồn tại (VFXManager.cs:431-454), nếu không thì nạp đúng prefab ở key")
    A("       4. không key và không default -> không có VFX (chỉ log), ngoại trừ IgnoredActions (BazaarVFXManagerSO.cs:166-174)")
    A("  -> AbilityVFXController.Init(go, data).Play() -> Projectile.Play(start,end) (Projectile.cs:262-335):")
    A("       buildup (OnProjectileBuildup, SoundProjectile.AudioProjectileBuildup) -> chờ startEventDelay -> FollowPathAnimation (OnProjectileStart = 'Shot')")
    A("       -> chạm (OnProjectileImpact = 'Impact', lifeTime của Slot_Impact)")
    A("Âm thanh: SoundProjectile.cs:1-60: 3 EventReference/prefab: Buildup, Shot, Impact -> SFXPlayer.PlayOneShotSfx.")
    A("  Game KHÔNG có sự kiện 'travel' nào: khoá `sounds.travel` luôn null. `sounds.fire` = AudioProjectileShot, `sounds.buildup` = AudioProjectileBuildup.")
    A("Thời gian bay dùng cho MÔ PHỎNG chiến đấu (CombatSimHandler.cs:557): `ProjectileTimingsAsset` (sharedassets0.assets, MonoBehaviour 'ProjectileTimings', 196 mục guid/addressableKey/giây);")
    A("  có override key -> GetTimingByAddressableKey(key), không -> GetTimingByGuid(prefab mặc định); mặc định 0,25 s (ProjectileTimingsAsset.cs:10-20).")
    A("  `travelMs` trong vfxmap.js lấy từ đó (travelSrc='timings'); `visualTravelMs` là Projectile.travelTime trong prefab. Hai số có thể khác nhau.\n")
    A("## 2. GUID Addressables -> prefab\n")
    A("`BazaarVFXManagerSO` (dump `ripped\\out\\dl_assets_scriptableobjects_bazaarvfxmanagerso.asset`) lưu AssetReference bằng GUID. `catalog.bin` (Addressables 2.x nhị phân): cặp (khoá, danh sách location) xen kẽ từ offset 0x24;")
    A("đối tượng khoá = [type][ptr -> ô chứa ptr chuỗi]; location: trường đầu (offset-8) = chuỗi internalId = TÊN FILE prefab (`Projectile_Burn_PV.prefab`, không có thư mục). Đo: 2159/2160 ArtKey khớp bộ giải của `art.py`, 163/163 GUID của VFX manager giải ra.")
    A("Tên file -> đường dẫn đầy đủ qua `cache/bundle_index.json` (container), trùng tên thì ưu tiên `/Projectiles/`, rồi `/Emitters/`, rồi `/Art/FX/`.")
    A("[BẪY 2] Địa chỉ Addressables (chuỗi trong VFXOverrideKey) KHÔNG nằm trong catalog.bin ở dạng chữ (chuỗi lưu kiểu 'dynamic string' đã nén) và CŨNG không trùng đường dẫn asset thật (prefab đã bị dời thư mục): 'Projectiles/ProjectilesForDerek/Projectile_Shoot_PV' (thật: Projectiles/Shoot), 'PrivateHotSprings/Variants/' (thật: .../Projectiles/), 'VFX_Bite_Tier1' (thật: VFX_Bite_Tier1_PV), 'Projectile_GiantIceCLub_PV Variant' (thật: GiantIceClub), 7 khoá chỉ là tên trần ('Projectile_Blunt_PV').")
    A("Cách giải trong `build_resolver`: (1) áp quy tắc '/Projectiles/'->'/Emitters/' của VFXManager.cs:437 (địa chỉ Emitter được nhận diện qua container HOẶC qua khoá của ProjectileTimingsAsset, vốn lưu đúng địa chỉ); (2) đường dẫn khớp container; (3) khớp theo TÊN FILE (bỏ ký tự lạ, thử thêm '_PV', bỏ ' Variant'). Nhãn: `path`, `emitter-path`, `name`, `emitter-name` (cột `via` của từng entry). Hai nhãn `name` là suy đoán theo tên: [ĐỀ XUẤT], độ tin cao vì tên gần như trùng và timings asset xác nhận địa chỉ Emitter.")
    A("Bốn thẻ trỏ tới prefab không còn trong bundle (`RedEnvelope_AcquireVFX`, `FX_Projectile_Experience_Smoother`): game cũng không phát VFX ở đó (InstantiateVFX trả null).")
    A("[BẪY] Bản thử đầu lấy ô con trỏ đứng ngay sau chuỗi GUID và lệch một bản ghi: Damage ra 'Destroy_L', Burn ra 'BurnMusic'. Phải đi theo mảng khoá -> danh sách location.\n")
    A("## 3. Mặc định theo ActionType (`defaults`)\n")
    A("| ActionType | id | prefab (nguồn) | travelMs (nguồn) | projectile | impact | sounds fire/impact | size/tier |")
    A("|---|---|---|---|---|---|---|---|")
    for a, d in sorted(out["defaults"].items(), key=lambda kv: kv[1].get("actionId", 0)):
        def row(label, e):
            s = e.get("sounds") or {}
            return "| %s | %s | `%s` (`%s`) | %s (%s) | %s | %s | %s / %s | %s |" % (a, d.get("actionId", ""), e.get("prefab", "?").replace("Assets/TheBazaar/", ""), e.get("via", ""), e.get("travelMs"), e.get("travelSrc"),
                                                                                  e.get("projectile"), e.get("impact"), s.get("fire"), s.get("impact"), label)
        if "prefab" in d and not d.get("sizes") and not d.get("sizeTier"):
            A(row("-", d))
        for k, e in (d.get("sizes") or {}).items():
            A(row("size " + k, e))
        for k, e in (d.get("sizeTier") or {}).items():
            A(row("size/tier " + k, e))
        for k, e in (d.get("tiers") or {}).items():
            A(row("tier " + k, e))
        if "prefab" not in d and not d.get("sizes") and not d.get("sizeTier") and not d.get("tiers"):
            A("| %s | %s | (không có entry mặc định) | | | | | |" % (a, d.get("actionId", "")))
    A("")
    A("ActionType không có entry trong `_projectilesByActionMap` / `_projectilesByCardAttributeMap` / `_projectileTiersByActionMap` hoặc thuộc IgnoredActions nên không có VFX mặc định: xem mục 6.\n")
    A("## 4. Khoá override của thẻ (`cards`)\n")
    A("`cards[cardId]` = entry của ability đầu tiên có override + `abilities[abilityId]` cho từng ability. `exact:true` khi VFXOverrideKey giải ra prefab có dump. `sizes` có khi `_actionOverrides` khớp key + ActionType.")
    A("`overrides` trong vfxmap.js = bảng `_actionOverrides` đã giải (key -> prefab theo S/M/L).\n")
    A("| số ability | VFXOverrideKey | prefab thực dùng | travelMs (nguồn) | projectile | impact | sounds |")
    A("|---|---|---|---|---|---|---|")
    seen = {}
    for cid, c in out["cards"].items():
        for abid, e in (c.get("abilities") or {}).items():
            k = e.get("overrideKey")
            if k and k not in seen:
                seen[k] = e
    for k, e in sorted(seen.items()):
        s = e.get("sounds") or {}
        A("| %d | `%s` | `%s` (%s) | %s (%s) | %s | %s | %s/%s/%s |" % (key_usage[k], k.replace("Assets/TheBazaar/", ""), e.get("prefab", "?").replace("Assets/TheBazaar/", ""), e.get("via", ""), e.get("travelMs"), e.get("travelSrc"),
                                                                       e.get("projectile"), e.get("impact"), s.get("buildup"), s.get("fire"), s.get("impact")))
    A("")
    A("## 5. Cách chọn sprite (HEURISTIC, [ĐỀ XUẤT])\n")
    A("Game vẽ bằng hệ hạt (Unity ParticleSystem + shader Layered Master), web chỉ vẽ sprite 2D. Từ cây prefab: mỗi ParticleSystem active có renderer có MainTex (matdb) -> chấm điểm theo kích thước x độ đục x thời gian sống x số hạt,")
    A("lọc texture thuộc nhóm noise/mask/gradient; nhóm `Slot_Projectile` cho `projectile`/`trail`, `Slot_BuildUp` cho `buildup`, `Slot_Impact` cho `impact`. `color` = startColor của hạt đó (nếu gần trắng: màu gradient/`_OverlayColor1` của material).")
    A("Chỉ phần 'texture nào + màu + blend + kích thước + thời gian + đường cong' đo từ prefab; việc CHỌN một sprite đại diện cho cả hệ hạt là xấp xỉ. Blend: add = (1,1)/(5,1), premul = (1,10), alpha = (5,10) (VISUAL.md §18).")
    A("Texture mới xuất sang `art/vfx/<khoá>.webp` (mask trắng+alpha, hoặc giữ màu nếu độ bão hoà > 0,35); khoá trùng tên bộ cũ (`glow`, `flash`, ...) giữ nguyên.\n")
    A("## 6. Độ phủ (đo bằng script)\n")
    st = rep["stats"]
    A("- data/cards.js có %d thẻ/kỹ năng. Phân loại từng thẻ (một thẻ thuộc đúng một nhóm, ưu tiên exact):" % rep["cards"])
    A("  - exact (VFXOverrideKey giải ra prefab có dump): **%d**" % st.get("exact", 0))
    A("  - có key nhưng không giải được prefab: %d" % st.get("override-missing", 0))
    A("  - không key, ability có ActionType có VFX mặc định: **%d**" % st.get("default", 0))
    A("  - không key, ActionType có VFX trong game nhưng KHÔNG có entry mặc định: %d" % st.get("nodefault", 0))
    A("  - không có ability sinh VFX chiến đấu (thụ động, ModifyAttribute, tăng sức mạnh, Aura...): %d" % st.get("novfx", 0))
    A("- Key override còn thiếu: %s" % (rep["missingOverride"] or "không"))
    A("- Số ability KHÔNG có key, theo ActionType của thẻ (default = có prefab mặc định; none = game có VFX cho loại này nhưng không có entry mặc định; ignored/unmapped = game không phát VFX: ActionType trong IgnoredActions hoặc không có trong DTOUtils.GetActionType nên thành Unknown):")
    for k, v in sorted(rep["actionCov"].items()):
        A("  - %s: %s" % (k, ", ".join("%s %d" % (a, n) for a, n in sorted(v.items()))))
    A("- **ActionType không có default chính xác**: " + ", ".join("%s (%d ability)" % (k, v["none"]) for k, v in sorted(rep["actionCov"].items()) if v.get("none")) + ". Ngoài ra không có entry trong cả 3 bảng: PlayerBurnRemove/PlayerPoisonRemove/PlayerRegenRemove/PlayerShieldRemove/PlayerJoyRemove/PlayerMaxHealthIncrease/Decrease/CardForceUse/GameStartCombat... (game không vẽ gì; chỉ có số nổi, VISUAL.md §6).")
    A("- Cách khớp VFXOverrideKey -> prefab (đếm theo ability có key, tổng %d): %s" % (sum(rep["howOverride"].values()), rep["howOverride"]))
    A("- Sự kiện FMOD có trong game nhưng chưa có khoá trong BZ_AUDIO (không thêm âm thanh, chỉ liệt kê): %s" % (json.dumps(rep["missingEvents"], ensure_ascii=False) if rep["missingEvents"] else "không"))
    A("- Sprite xuất: %d, art/vfx tổng %d KB, vfxmap.js %d KB.\n" % (rep["sprites"], rep["artKB"], rep["jsKB"]))
    A("## 7. Âm thanh khác theo hành động (không qua SoundProjectile)\n")
    A("`board.crit` = `SFX/Board/LifeBar/Crit` (SoundEventListener), `board.tickBurn/tickPoison/tickRegen` = `Burn_Tick/Poison_Tick/Regenerate_Tick`, `card.destroy` = `Card_Destroy`, `combat.fly_*` = `SFX/Combat/Fly/Fly_Start|Loop` (chain.json `named`). Chi tiết ở AUDIO.md §2.\n")
    open(NOTE, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")


def resync_sounds():
    """Chỉ giải lại `sounds` của data/vfxmap.js theo data/audio.js hiện tại (không đụng art/vfx, không dựng lại mọi thứ).
    Dùng sau khi audio.py xuất thêm khoá: `python -I vfxmap.py sounds`. Mỗi mục có `prefab` được tra lại trong chain.json."""
    txt = open(OUTJS, encoding="utf-8").read()
    i = txt.index("window.BZ_VFXMAP = ") + len("window.BZ_VFXMAP = ")
    head, body = txt[:i], txt[i:].rstrip().rstrip(";")
    data = json.loads(body)
    X = Ctx()
    X.missing_events = {}
    X.keys_audio, X.ev2key = load_audio()
    X.chain = json.load(open(os.path.join(REF, "audio", "meta", "chain.json"), encoding="utf-8"))["projectiles"]
    st = {"entries": 0, "changed": 0}

    def walk(o):
        if isinstance(o, dict):
            if "prefab" in o and "sounds" in o and isinstance(o["prefab"], str):
                new = {k: v for k, v in sounds_for(o["prefab"], X).items() if v is not None}
                st["entries"] += 1
                if new != o["sounds"]:
                    st["changed"] += 1
                    o["sounds"] = new
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    with open(OUTJS, "w", encoding="utf-8", newline="\n") as f:
        f.write(head + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("sounds:", st, "event còn thiếu trong BZ_AUDIO:", {k: sorted(v)[:2] for k, v in X.missing_events.items()} or "không")


if __name__ == "__main__":
    if sys.argv[1:] == ["sounds"]:
        resync_sounds()
    else:
        main()
