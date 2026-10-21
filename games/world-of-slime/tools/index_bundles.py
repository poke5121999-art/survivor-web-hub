r"""Index every addressable bundle + non-addressable Unity files of World of Slime Demo.
Usage: py -3.12 -I index_bundles.py [--workers 4] [--timeout 120] [--limit N]
Output: D:\wos-ref\cache\bundle_index.json  (bundles, cab_map, scripts, nonaddr)
Each bundle is read in a worker process (maxtasksperchild=20 frees memory); one slow bundle
only costs its timeout (the pool is rebuilt around it)."""
import os, sys, json, glob, time, gc, collections, multiprocessing as mp
import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); import wos
GAME = wos.DATA
BD = GAME + r"\StreamingAssets\StandaloneWindows64"
OUT = _o.path.join(wos.REF, 'cache', 'bundle_index.json')
CAP = 300

def scan_env(env, label):
    import UnityPy
    r = {"objects": collections.Counter(), "cabs": [], "deps": [], "names": collections.defaultdict(list),
         "container": [], "roots": [], "scripts_defined": {}, "errors": 0}
    seen_cabs = {}
    for o in env.objects:
        seen_cabs[o.assets_file.name] = o.assets_file
        r["objects"][o.type.name] += 1
    for name, sf in seen_cabs.items():
        r["cabs"].append(name)
        for e in getattr(sf, "externals", []):
            r["deps"].append(os.path.basename(e.path.replace("\\", "/")))
    names = r["names"]
    father = {}
    go_name = {}
    for o in env.objects:
        t = o.type.name
        cab = o.assets_file.name
        try:
            if t == "AssetBundle":
                d = o.read_typetree()
                r["bundle_name"] = d.get("m_AssetBundleName")
                for k, v in d.get("m_Container", []):
                    if len(r["container"]) < CAP: r["container"].append(k)
                r["container_total"] = len(d.get("m_Container", []))
            elif t == "GameObject":
                go_name[(cab, o.path_id)] = o.read_typetree().get("m_Name", "")
            elif t == "Transform" or t == "RectTransform":
                d = o.read_typetree()
                f = d["m_Father"]
                father[(cab, d["m_GameObject"]["m_PathID"])] = f["m_PathID"]
            elif t == "Texture2D":
                x = o.read()
                names[t].append("%s|%dx%d|%s" % (x.m_Name, x.m_Width, x.m_Height, getattr(x.m_TextureFormat, "name", x.m_TextureFormat)))
            elif t == "MonoScript":
                d = o.read_typetree()
                r["scripts_defined"]["%s:%d" % (cab, o.path_id)] = (d.get("m_Namespace", "") + "." if d.get("m_Namespace") else "") + d.get("m_ClassName", "")
            elif t == "MonoBehaviour":
                d = o.read_typetree()
                s = d.get("m_Script", {})
                ref = None
                fid = s.get("m_FileID", 0)
                if s.get("m_PathID"):
                    if fid == 0: ref = "%s:%d" % (cab, s["m_PathID"])
                    else:
                        ex = o.assets_file.externals[fid - 1].path.replace("\\", "/").split("/")[-1]
                        ref = "%s:%d" % (ex, s["m_PathID"])
                names[t].append("%s|%s" % (d.get("m_Name", ""), ref))
            elif t in ("Mesh", "Sprite", "AnimationClip", "TextAsset", "AudioClip", "Material", "Shader", "AnimatorController", "Font", "VideoClip", "ScriptableObject"):
                n = o.read_typetree().get("m_Name", "") if t != "TextAsset" else None
                if t == "TextAsset":
                    x = o.read(); n = "%s|%d" % (x.m_Name, len(x.m_Script) if hasattr(x, "m_Script") else -1)
                names[t].append(n)
        except Exception as e:
            r["errors"] += 1
            names["_err"].append("%s %d %s" % (t, o.path_id, str(e)[:80]))
    roots = []
    for (cab, pid), fa in father.items():
        pass
    # GameObject roots: Transform whose father is 0
    for (cab, gopid), fa in father.items():
        if fa == 0:
            roots.append(go_name.get((cab, gopid), "?"))
    r["roots"] = roots[:CAP]; r["roots_total"] = len(roots)
    r["names"] = {k: (v[:CAP], len(v)) for k, v in names.items()}
    r["objects"] = dict(r["objects"])
    r["deps"] = sorted(set(r["deps"]))
    return r

def work(path):
    import UnityPy
    t0 = time.time()
    try:
        env = UnityPy.load(path)
        r = scan_env(env, path)
        r["error"] = None
    except Exception as e:
        r = {"error": "%s: %s" % (type(e).__name__, str(e)[:200])}
    r["file"] = os.path.basename(path); r["size"] = os.path.getsize(path); r["sec"] = round(time.time() - t0, 2)
    gc.collect()
    return r

def nonaddr():
    files = [GAME + "\\" + f for f in ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets"] +
             ["sharedassets%d.assets" % i for i in range(5)] + ["level%d" % i for i in range(5)]]
    return [f for f in files if os.path.exists(f)]

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4); ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--only", default="")
    a = ap.parse_args()
    fs = sorted(glob.glob(BD + "\\*"))
    fs = [f for f in fs if os.path.isfile(f)]
    if a.only: fs = [f for f in fs if a.only in os.path.basename(f)]
    if a.limit: fs = fs[:a.limit]
    todo = nonaddr() + fs
    res = []
    t0 = time.time()
    pool = mp.Pool(a.workers, maxtasksperchild=20)
    pending = [(f, pool.apply_async(work, (f,))) for f in todo]
    for i, (f, ar) in enumerate(pending):
        try:
            res.append(ar.get(timeout=a.timeout * 4 if i < 12 else a.timeout))
        except mp.TimeoutError:
            res.append({"file": os.path.basename(f), "size": os.path.getsize(f), "error": "TIMEOUT"})
            print("TIMEOUT", f, flush=True)
        except Exception as e:
            res.append({"file": os.path.basename(f), "error": "WORKER " + str(e)[:100]})
        if i % 100 == 0: print("%d/%d %.0fs %s" % (i, len(pending), time.time() - t0, os.path.basename(f)), flush=True)
    pool.terminate()
    na = {x["file"]: x for x in res if x["file"] in {os.path.basename(p) for p in nonaddr()}}
    bundles = {x["file"]: x for x in res if x["file"] not in na}
    cab_map = {}
    scripts = {}
    for n, x in bundles.items():
        for c in x.get("cabs", []): cab_map[c] = n
    scripts = {}
    for x in list(bundles.values()) + list(na.values()):
        for k, v in x.get("scripts_defined", {}).items(): scripts[k] = v
    for x in bundles.values():
        mb = x.get("names", {}).get("MonoBehaviour")
        if mb:
            mb[0][:] = [e.split("|")[0] + "|" + scripts.get(e.split("|", 1)[1], e.split("|", 1)[1]) for e in mb[0]]
    for x in list(bundles.values()) + list(na.values()):
        x.pop("scripts_defined", None)
    json.dump({"bundles": bundles, "nonaddr": na, "cab_map": cab_map, "scripts": scripts}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print("done", len(bundles), "errors", sum(1 for x in res if x.get("error")), "->", OUT)
if __name__ == "__main__":
    main()
