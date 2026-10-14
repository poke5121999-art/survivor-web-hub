# Tìm tên Texture2D/Sprite/GameObject khớp mẫu trong mọi bundle. Dùng: py -3.12 -I find.py <thư mục AssetBundles> <mẫu regex>
import sys, os, re, UnityPy
root, pat = sys.argv[1], re.compile(sys.argv[2], re.I)
for dp, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith('.ab'): continue
        p = os.path.join(dp, f)
        try: env = UnityPy.load(p)
        except Exception: continue
        for o in env.objects:
            if o.type.name in ('Texture2D', 'GameObject', 'TextAsset', 'Sprite'):
                try: n = o.read().m_Name
                except Exception: continue
                if pat.search(n): print(os.path.relpath(p, root), o.type.name, n, flush=True)
