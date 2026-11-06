import json, os, UnityPy
from UnityPy.files import SerializedFile
AND=r'D:/stickman-hook-ref/apk/assets/aa/Android/'
CAB=json.load(open(r'D:/stickman-hook-ref/dump/cabmap.json'))
MS=json.load(open(r'D:/stickman-hook-ref/dump/monoscripts.json'))
def load_with_deps(bundle):
    env=UnityPy.Environment(); seen=set(); todo=[bundle]
    while todo:
        b=todo.pop()
        if b in seen: continue
        seen.add(b); env.load_file(AND+b)
        for f in list(env.files.values()):
            for sf in _sfs(f):
                for ext in sf.externals:
                    nb=CAB.get(os.path.basename(ext.path).lower())
                    if nb and nb not in seen: todo.append(nb)
    return env
def _sfs(f):
    if isinstance(f,SerializedFile): yield f
    else:
        for c in getattr(f,'files',{}).values(): yield from _sfs(c)
def sfs(env):
    for f in env.files.values(): yield from _sfs(f)
def resolve(sf, ptr):
    """ptr={'m_FileID','m_PathID'} relative to serialized file sf -> ObjectReader"""
    fid,pid=ptr['m_FileID'],ptr['m_PathID']
    if pid==0: return None
    if fid==0: return sf.objects.get(pid)
    ext=sf.externals[fid-1]; name=os.path.basename(ext.path).lower()
    tgt=sf.environment.cabs.get(name) if hasattr(sf.environment,'cabs') else None
    if tgt is None:
        for s in sfs(sf.environment):
            if s.name.lower()==name: tgt=s; break
    return tgt.objects.get(pid) if tgt else None
def script_name(t): return MS.get(str(t['m_Script']['m_PathID']),'?')
