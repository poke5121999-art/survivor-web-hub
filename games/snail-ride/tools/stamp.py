"""Stamp ?v=<rev> on every relative ES import / script / css URL so a deploy busts caches consistently.
Usage: stamp.py GAME_DIR REV   (also writes version.json)"""
import sys, os, re, json
g, rev = sys.argv[1], sys.argv[2]
pat = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.{1,2}/[^'"?]+\.js)(?:\?v=[^'"]*)?(['"])""")
n = 0
for root, _, files in os.walk(os.path.join(g, 'js')):
    for f in files:
        if not f.endswith('.js'): continue
        p = os.path.join(root, f); s = open(p).read()
        s2 = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={rev}{m.group(3)}", s)
        s2 = re.sub(r"(const REV = ')[^']*(')", rf"\g<1>{rev}\g<2>", s2)
        if s2 != s: open(p, 'w').write(s2); n += 1
h = os.path.join(g, 'index.html'); s = open(h).read()
s = re.sub(r'(\.(?:js|css))\?v=[^"]*"', rf'\1?v={rev}"', s); open(h, 'w').write(s)
json.dump({'rev': rev}, open(os.path.join(g, 'version.json'), 'w'))
print('stamped', n, 'js files, rev', rev)
