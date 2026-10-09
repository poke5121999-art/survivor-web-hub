import sys, os, json, UnityPy
from concurrent.futures import ProcessPoolExecutor
ROOT = os.environ.get("ZS_ROOT", "")
def scan(path):
    rec = {"f": os.path.relpath(path, ROOT), "size": os.path.getsize(path), "cab": [], "cont": [], "types": {}, "names": []}
    try:
        env = UnityPy.load(path)
        for f in env.files.values():
            rec["cab"].append(getattr(f, "name", ""))
        for k in env.container.keys():
            rec["cont"].append(k)
        for o in env.objects:
            t = o.type.name
            rec["types"][t] = rec["types"].get(t, 0) + 1
            if t in ("Mesh", "Texture2D", "AnimationClip", "GameObject", "TextAsset", "AudioClip", "Material", "Sprite", "Shader", "MonoScript", "Font"):
                try:
                    n = o.peek_name()
                except Exception:
                    n = None
                if n and len(rec["names"]) < 400:
                    rec["names"].append(t[:3] + ":" + n)
    except Exception as e:
        rec["err"] = str(e)[:200]
    return rec
if __name__ == "__main__":
  ROOT = sys.argv[1]; OUT = sys.argv[2]; os.environ["ZS_ROOT"] = ROOT
  files = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(ROOT, "AssetBundles")) for f in fs]
  with ProcessPoolExecutor(max_workers=os.cpu_count()) as ex, open(OUT, "w") as out:
      for i, r in enumerate(ex.map(scan, files, chunksize=16)):
          out.write(json.dumps(r, ensure_ascii=False) + "\n")
          if i % 1000 == 0: print(i, file=sys.stderr, flush=True)
