"""Print MonoBehaviours as JSON. Usage: read_mb.py <file>:<pathid> ...  |  read_mb.py --class <ClassName> [--file f]"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mm
env = mm.load()
a = sys.argv[1:]
if a and a[0] == "--class":
    want = a[1]
    for o in env.objects:
        if o.type.name == "MonoBehaviour" and mm.script(o)[1] == want:
            print(o.assets_file.name, o.path_id, json.dumps(mm.clean(mm.read(o), mm.ext_names(o.assets_file)))[:4000])
else:
    for spec in a:
        f, pid = spec.split(":")
        o = mm.by_file(f)[int(pid)]
        print(spec, mm.script(o), json.dumps(mm.clean(mm.read(o), mm.ext_names(o.assets_file)))[:6000])
