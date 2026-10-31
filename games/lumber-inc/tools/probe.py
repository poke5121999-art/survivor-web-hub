"""py -3.12 probe.py <bundle-prefix> <ScriptClass> [n]: print MonoBehaviour fields of the first n instances."""
import sys, json
import lm
pref, cls = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 1
lm.load()
k = 0
for f in lm.bundle_files(pref):
    for o in lm.by_file(f).values():
        if o.type.name == "MonoBehaviour" and lm.script(o)[1].split(".")[-1] == cls:
            try: d = lm.read(o)
            except Exception as e: print("ERR", e); continue
            d.pop("m_GameObject", None); d.pop("m_Script", None)
            s = json.dumps(d, ensure_ascii=False, default=str)
            print(o.path_id, s[:3000]); k += 1
            if k >= n: sys.exit()
