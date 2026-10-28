import sys, json, glob, UnityPy
f=glob.glob(r'D:/stickman-hook-ref/apk/assets/aa/Android/*monoscripts*.bundle')[0]
env=UnityPy.load(f); m={}
for o in env.objects:
    if o.type.name=='MonoScript':
        d=o.read(); m[str(o.path_id)]=f"{d.m_Namespace}.{d.m_ClassName}".lstrip('.')
json.dump(m,open(r'D:/stickman-hook-ref/dump/monoscripts.json','w'),indent=0)
print(len(m))
