import os, sys, urllib.request, time
out = sys.argv[1]
BASE='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen'
sets = {'front':'', 'back':'back/', 'sfront':'shiny/', 'sback':'back/shiny/'}
for k, sub in sets.items():
    d = os.path.join(out, k); os.makedirs(d, exist_ok=True)
    for i in range(1, 152):
        p = os.path.join(d, '%d.png' % i)
        if os.path.exists(p) and os.path.getsize(p) > 100: continue
        url = '%s/%s%d.png' % (BASE, sub, i)
        for a in range(3):
            try:
                with urllib.request.urlopen(url, timeout=20) as r: b = r.read()
                open(p,'wb').write(b); break
            except Exception:
                if a == 2: print('FAIL', k, i, flush=True)
                time.sleep(1)
    print('set done', k, flush=True)
print('ALLDONE')
