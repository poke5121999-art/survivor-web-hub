"""Stamp a rev into index.html: every ES module gets ?v=<rev> through the import map, plus css / data / main.
    python3 -I tools/stamp.py <rev>
"""
import os, re, sys
rev = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mods = sorted(os.path.relpath(os.path.join(d, f), root).replace(os.sep, '/')
              for d, _, fs in os.walk(os.path.join(root, 'js')) for f in fs if f.endswith('.js'))
lines = ['  "three": "./vendor/three.module.min.js?v=%s"' % rev, '  "./vendor/three.module.min.js": "./vendor/three.module.min.js?v=%s"' % rev]
lines += ['  "./%s": "./%s?v=%s"' % (m, m, rev) for m in mods]
imap = '<!-- IMPORTMAP:BEGIN (tools/stamp.py) -->\n<script type="importmap">\n{ "imports": {\n' + ',\n'.join(lines) + '\n} }\n</script>\n<!-- IMPORTMAP:END -->'
p = os.path.join(root, 'index.html')
s = open(p, encoding='utf-8').read()
s = re.sub(r'<!-- IMPORTMAP:BEGIN.*?IMPORTMAP:END -->', imap, s, flags=re.S)
s = re.sub(r'\?v=[A-Za-z0-9]+', '?v=' + rev, s)
s = re.sub(r"window\.SM_REV = '[^']*'", "window.SM_REV = '%s'" % rev, s)
open(p, 'w', encoding='utf-8').write(s)
print('stamped', rev, len(mods), 'modules')
