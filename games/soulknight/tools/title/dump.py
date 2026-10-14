# Dò bundle title: in typetree của MonoBehaviour/GameObject khớp mẫu. Dùng: py -3.12 -I dump.py <bundle> [mẫu...]
import sys, UnityPy
env = UnityPy.load(sys.argv[1]); pat = sys.argv[2:]
for p, o in env.container.items():
    if o.type.name in ('MonoBehaviour', 'GameObject') and (not pat or any(x in p for x in pat)):
        print('=====', o.type.name, p)
        try: print(str(o.read_typetree())[:3000])
        except Exception as e: print('ERR', e)
