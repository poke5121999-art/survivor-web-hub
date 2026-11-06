"""Dump every object's typetree to JSON + export textures/sprites/audio/fonts/text.
Usage: python -I dump_all.py DATA_DIR MANAGED_DIR OUT_DIR"""
import sys, os, json, re, UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
data, managed, out = sys.argv[1:4]
g = TypeTreeGenerator("2018.3.7f1"); g.load_local_dll_folder(managed)
env = UnityPy.load(data); env.typetree_generator = g
def safe(s): return re.sub(r'[^A-Za-z0-9_.-]+', '_', s or '')[:60]
os.makedirs(out, exist_ok=True)
for sub in ('json', 'tex', 'sprite', 'audio', 'font', 'text'):
    os.makedirs(os.path.join(out, sub), exist_ok=True)
files = {}
# map file index -> external names for references
ext = {}
for fname, f in env.files.items():
    pass
for obj in env.objects:
    af = os.path.basename(obj.assets_file.name)
    t = obj.type.name
    rec = {'file': af, 'path_id': obj.path_id, 'type': t}
    try:
        tt = obj.read_typetree()
        rec['data'] = tt
    except Exception as e:
        rec['error'] = str(e)[:200]
    if t == 'MonoBehaviour' and 'data' in rec:
        try:
            sc = obj.read(check_read=False).m_Script.read()
            rec['script'] = sc.m_ClassName
        except Exception:
            pass
    files.setdefault(af, []).append(rec)
    name = (rec.get('data') or {}).get('m_Name', '') if isinstance(rec.get('data'), dict) else ''
    try:
        if t == 'Texture2D':
            d = obj.read(); d.image.save(os.path.join(out, 'tex', f"{safe(d.m_Name)}__{af[:8]}_{obj.path_id}.png"))
        elif t == 'Sprite':
            d = obj.read(); d.image.save(os.path.join(out, 'sprite', f"{safe(d.m_Name)}__{af[:8]}_{obj.path_id}.png"))
        elif t == 'AudioClip':
            d = obj.read()
            for n, b in d.samples.items():
                open(os.path.join(out, 'audio', f"{safe(d.m_Name)}__{obj.path_id}_{safe(n)}"), 'wb').write(b)
        elif t == 'Font':
            d = obj.read()
            if d.m_FontData:
                open(os.path.join(out, 'font', f"{safe(d.m_Name)}__{obj.path_id}.ttf"), 'wb').write(bytes(d.m_FontData))
        elif t == 'TextAsset':
            d = obj.read()
            s = d.m_Script
            open(os.path.join(out, 'text', f"{safe(d.m_Name)}__{obj.path_id}.txt"), 'wb').write(s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s))
    except Exception as e:
        print('export fail', af, obj.path_id, t, name, e)
ext = {}
for af_name, sf in env.files.items():
    try:
        ext[os.path.basename(af_name)] = [os.path.basename(x.path) for x in sf.externals]
    except Exception:
        pass
json.dump(ext, open(os.path.join(out, 'externals.json'), 'w'), indent=1)
for af, recs in files.items():
    with open(os.path.join(out, 'json', af + '.json'), 'w') as f:
        json.dump(recs, f, default=lambda o: o.hex() if isinstance(o, (bytes, bytearray)) else str(o))
    print(af, len(recs))
