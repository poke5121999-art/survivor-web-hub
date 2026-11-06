"""Inventory all objects. Usage: inventory.py DATA_DIR OUT_TSV"""
import sys, os, collections, UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION = '2018.3.7f1'
env = UnityPy.load(sys.argv[1])
cnt = collections.Counter()
with open(sys.argv[2], 'w') as out:
    for obj in env.objects:
        t = obj.type.name
        cnt[t] += 1
        name = ''
        try:
            if t in ('MonoBehaviour',):
                d = obj.read(check_read=False)
                name = getattr(d, 'm_Name', '') or ''
                try:
                    sc = d.m_Script.read()
                    name += ' <' + sc.m_ClassName + '>'
                except Exception:
                    pass
            elif t not in ('Transform', 'RectTransform', 'CanvasRenderer'):
                d = obj.read(check_read=False)
                name = getattr(d, 'm_Name', '') or getattr(d, 'name', '') or ''
        except Exception as e:
            name = '!ERR ' + str(e)[:60]
        out.write(f"{os.path.basename(obj.assets_file.name)}\t{obj.path_id}\t{t}\t{name}\n")
for k, v in cnt.most_common():
    print(v, k)
