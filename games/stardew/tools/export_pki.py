import os, sys, re, UnityPy
src = sys.argv[1]; out = sys.argv[2]
os.makedirs(out, exist_ok=True)
os.makedirs(out+'/sprites', exist_ok=True)
os.makedirs(out+'/atlas', exist_ok=True)
env = UnityPy.load(src)
SKIP = re.compile(r'SDF Atlas|Font Texture|EmojiOne|Splash Screen|LiberationSans|ARIAL', re.I)
seen = {}
ok=0; fail=0
for obj in env.objects:
    if obj.type.name not in ("Texture2D","Sprite"): continue
    try:
        d = obj.read()
    except Exception:
        fail+=1; continue
    name = getattr(d,'m_Name','') or ''
    if not name or SKIP.search(name): continue
    try:
        img = d.image
    except Exception:
        fail+=1; continue
    if img is None: continue
    sub = 'sprites' if obj.type.name=='Sprite' else 'atlas'
    key = sub+'/'+name
    seen[key] = seen.get(key,0)+1
    suffix = '' if seen[key]==1 else '__%d'%seen[key]
    safe = re.sub(r'[^\w\-. ]','_',name)
    try:
        img.save(os.path.join(out, sub, safe+suffix+'.png'))
        ok+=1
    except Exception:
        fail+=1
print('exported',ok,'failed',fail)
