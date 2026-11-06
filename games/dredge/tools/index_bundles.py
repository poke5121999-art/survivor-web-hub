"""Index every Addressables bundle of DREDGE: container path -> bundle, type, path_id.

Writes <out>/bundle_index.json. Rerunnable; later tools read this instead of rescanning.
Usage: python -I index_bundles.py [DREDGE_Data dir] [out dir]
"""
import json, os, sys, collections
import UnityPy

DATA = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
    "DREDGE_DATA", r"D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\DREDGE_Data")
OUT = sys.argv[2] if len(sys.argv) > 2 else r"D:\dredge-ref\cache"
AA = os.path.join(DATA, "StreamingAssets", "aa", "StandaloneWindows")

index = {"bundles": {}, "containers": {}}
for name in sorted(os.listdir(AA)):
    if not name.endswith(".bundle"):
        continue
    env = UnityPy.load(os.path.join(AA, name))
    types = collections.Counter()
    cabs = []
    for fname, f in env.files.items():
        cabs.append(fname)
    for obj in env.objects:
        types[obj.type.name] += 1
    for path, obj in env.container.items():
        try:
            tname = obj.type.name
        except ValueError:  # scene bundles list their .unity scenes with m_PathID == 0
            tname = "Scene"
        index["containers"][path] = {"bundle": name, "type": tname, "path_id": obj.path_id}
    index["bundles"][name] = {"types": dict(types.most_common()), "cabs": cabs,
                              "size": os.path.getsize(os.path.join(AA, name))}
    print(name, sum(types.values()), dict(types.most_common(6)), flush=True)

with open(os.path.join(OUT, "bundle_index.json"), "w", encoding="utf-8") as fh:
    json.dump(index, fh, indent=1)
print("containers", len(index["containers"]))
