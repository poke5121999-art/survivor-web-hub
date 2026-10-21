"""Server meta cache (meta_<type>_en.json.gz, written by MetaSyncManager) -> data/meta/<type>.json (minified).

Rows are copied as the server sent them (same keys, same order, same values). Text fields are TextIds only
(e.g. "ItemType.1.name"); the strings themselves are not in the cache. Rerunnable.
    py -3.12 -I games/world-of-slime/tools/import_meta.py
"""
import os, sys, json, gzip

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'data', 'meta')
CACHE = os.environ.get('WOS_CACHE', r'D:\wos-ref\server-cache\live\StandaloneWindows64')

os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(CACHE)):
    if not (f.startswith('meta_') and f.endswith('_en.json.gz')):
        continue
    typ = f[len('meta_'):-len('_en.json.gz')]
    rows = json.loads(gzip.open(os.path.join(CACHE, f)).read().decode('utf-8'))
    ver = open(os.path.join(CACHE, f.replace('.json.gz', '_ver.txt'))).read().strip()
    p = os.path.join(OUT, typ + '.json')
    with open(p, 'w', encoding='utf-8', newline='\n') as o:
        json.dump(rows, o, ensure_ascii=False, separators=(',', ':'))
    print('%-22s %4d rows  ver %s  -> %s (%d KB)' % (typ, len(rows), ver, p, os.path.getsize(p) // 1024))
