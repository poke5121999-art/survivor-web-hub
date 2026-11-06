# -*- coding: utf-8 -*-
"""Lập chỉ mục 931 bundle Addressables của The Bazaar Demo.

Ra: D:\bazaar-ref\cache\bundle_index.json
  bundles[tên_file] = {size, objects:{Kiểu:số}, container_n, error?}
  container[đường_dẫn_asset] = [tên_file, kiểu, path_id]
Chạy: python -I index_bundles.py  (~vài phút, 4 tiến trình)
"""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art import *
import UnityPy
from collections import Counter
from multiprocessing import Pool


def one(fn):
    p = os.path.join(AAW, fn)
    r = {"size": os.path.getsize(p)}
    cont = {}
    try:
        env = UnityPy.load(p)
        r["objects"] = dict(Counter(o.type.name for o in env.objects))
        for k, v in env.container.items():
            try:
                tn = v.type.name
            except Exception:
                tn = "?"
            cont[k] = [fn, tn, v.path_id]
        r["container_n"] = len(cont)
        r["cab"] = [k for k in env.file.files if k.startswith("CAB-") and not k.endswith(".resS")]   # tên SerializedFile, để giải PPtr ngoài bundle
    except Exception as e:
        r["error"] = "%s: %s" % (type(e).__name__, str(e)[:200])
    return fn, r, cont


def main():
    files = sorted(f for f in os.listdir(AAW) if f.endswith(".bundle"))
    t = time.time()
    bundles, container, dup = {}, {}, 0
    with Pool(4) as pool:
        for i, (fn, r, cont) in enumerate(pool.imap_unordered(one, files, chunksize=4)):
            bundles[fn] = r
            for k, v in cont.items():
                if k in container:
                    dup += 1
                container[k] = v
            if i % 100 == 0:
                print(i, len(files), "%.0fs" % (time.time() - t), flush=True)
    bundles = dict(sorted(bundles.items()))
    container = dict(sorted(container.items()))
    errs = {k: v["error"] for k, v in bundles.items() if "error" in v}
    out = {"engine": "6000.3.11f1", "bundles": bundles, "container": container}
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "bundle_index.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("bundle", len(bundles), "container", len(container), "trùng khoá", dup, "lỗi", len(errs), "%.0fs" % (time.time() - t))
    for k, v in errs.items():
        print("  LỖI", k, v)


if __name__ == "__main__":
    main()
