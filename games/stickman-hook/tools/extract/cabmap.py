import glob, os, json, UnityPy
m={}
for f in glob.glob(r'D:/stickman-hook-ref/apk/assets/aa/Android/*.bundle'):
    env=UnityPy.load(f)
    for name in env.files: m[name.lower()]=os.path.basename(f)
    for bf in env.files.values():
        for n in getattr(bf,'files',{}): m[n.lower()]=os.path.basename(f)
json.dump(m,open(r'D:/stickman-hook-ref/dump/cabmap.json','w'),indent=0); print(len(m))
