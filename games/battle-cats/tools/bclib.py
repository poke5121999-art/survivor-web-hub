"""Resolve Battle Cats assets from D:\\battlecats-ref, newest version wins.

Builds an index over server_out/ + local/ (en + non-localized only). For any
logical filename (e.g. 016_f.png) returns the path from the highest version
pack that contains it.
"""
import os, re, functools

REF = r"D:\battlecats-ref"
_VER = re.compile(r"_(\d{6})_(\d\d)_")
_LANG = re.compile(r"_(de|es|fr|it|th)($|_)")


def _ver_key(dirname):
    m = _VER.search(dirname)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


@functools.lru_cache(maxsize=1)
def index():
    """logical filename -> absolute path (newest version)."""
    idx = {}
    roots = []
    for base in ("server_out", "local"):
        b = os.path.join(REF, base)
        if not os.path.isdir(b):
            continue
        for d in os.listdir(b):
            p = os.path.join(b, d)
            if not os.path.isdir(p) or _LANG.search(d):
                continue
            roots.append((_ver_key(d), p))
    roots.sort(key=lambda x: x[0])  # oldest first; newer overwrites
    for _, p in roots:
        for f in os.listdir(p):
            fp = os.path.join(p, f)
            if os.path.isfile(fp):
                idx[f] = fp
    return idx


def find(name):
    return index().get(name)


@functools.lru_cache(maxsize=1)
def _all_index():
    """logical filename -> list of all paths across versions (oldest..newest)."""
    idx = {}
    roots = []
    for base in ("server_out", "local"):
        b = os.path.join(REF, base)
        if not os.path.isdir(b):
            continue
        for d in os.listdir(b):
            p = os.path.join(b, d)
            if not os.path.isdir(p) or _LANG.search(d):
                continue
            roots.append((_ver_key(d), p))
    roots.sort(key=lambda x: x[0])
    for _, p in roots:
        for f in os.listdir(p):
            fp = os.path.join(p, f)
            if os.path.isfile(fp):
                idx.setdefault(f, []).append(fp)
    return idx


def find_all(name):
    return _all_index().get(name, [])


def find_png(name):
    """Pick the NEWEST non-blank version of a PNG (skips 1x1/placeholder-size blanks)."""
    from PIL import Image
    best = None
    for p in find_all(name):  # oldest -> newest
        try:
            w, h = Image.open(p).size
        except Exception:
            continue
        if w * h > 16:
            best = p  # keep updating -> ends on newest non-blank
    return best


def data_csv(name):
    """Read a DataLocal csv/tsv as decoded text."""
    p = os.path.join(REF, "local", "DataLocal", name)
    return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else None


def has_unit(uid, form="f"):
    return find(f"{uid:03d}_{form}.png") is not None


if __name__ == "__main__":
    idx = index()
    pngs = [k for k in idx if re.fullmatch(r"\d{3}_[fcs]\.png", k)]
    units = sorted({k[:3] for k in pngs})
    print("indexed files:", len(idx))
    print("unit sheets:", len(pngs), "distinct unit ids:", len(units))
    print("sample 016_f.png ->", find("016_f.png"))
    print("has 000:", has_unit(0), "has 016:", has_unit(16))
