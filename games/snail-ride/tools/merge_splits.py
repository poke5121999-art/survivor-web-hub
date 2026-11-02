"""Mirror apk Data dir with .splitN files concatenated. Usage: merge_splits.py SRC_DATA DST"""
import os, re, sys, shutil
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
groups = {}
for name in os.listdir(src):
    p = os.path.join(src, name)
    if os.path.isdir(p):
        continue
    m = re.match(r'(.*)\.split(\d+)$', name)
    if m:
        groups.setdefault(m.group(1), []).append((int(m.group(2)), p))
    else:
        shutil.copyfile(p, os.path.join(dst, name))
for base, parts in groups.items():
    with open(os.path.join(dst, base), 'wb') as out:
        for _, p in sorted(parts):
            with open(p, 'rb') as f:
                out.write(f.read())
    print(base, len(parts), os.path.getsize(os.path.join(dst, base)))
