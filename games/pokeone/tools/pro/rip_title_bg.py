"""Xuất nen man title 2D (Texture2D 'bg 1' trong sharedassets PRO) ra art/pro/ui/title_bg.png.
Chay mot lan: python tools/pro/rip_title_bg.py (tu thu muc games/pokeone)."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import UnityPy

PRO = os.environ.get('PRO_REF', r'D:\pro-ref')
BUNDLE = os.path.join(PRO, 'PROClient', 'PROClient_Data', 'data.unity3d')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'art', 'pro', 'ui', 'title_bg.png')

env = UnityPy.load(BUNDLE)
found = False
for o in env.objects:
    if o.type.name == 'Texture2D' and o.assets_file.name != 'resources.assets':
        d = o.read()
        if d.m_Name == 'bg 1':
            d.image.save(OUT)
            print('saved', OUT, d.image.size)
            found = True
            break
if not found:
    raise SystemExit("khong tim thay Texture2D 'bg 1'")
