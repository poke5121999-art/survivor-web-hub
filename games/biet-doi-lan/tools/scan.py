# scan all bundles: Sprite + Texture2D names -> (bundle, path_id, type)
import json,io,os,sys,UnityPy
from multiprocessing import Pool
B=r'D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data\StreamingAssets\aa\StandaloneWindows64'
def work(f):
    out=[]
    try:
        env=UnityPy.load(os.path.join(B,f))
        for o in env.objects:
            if o.type.name in ('Sprite','Texture2D'):
                try: n=o.peek_name()
                except Exception: n=o.read().m_Name
                out.append((n,f,o.path_id,o.type.name))
    except Exception as e: pass
    return out
if __name__=='__main__':
    fs=sorted(os.listdir(B)); res={}
    with Pool(6) as p:
        for i,r in enumerate(p.imap_unordered(work,fs,chunksize=8)):
            for n,f,pid,t in r: res.setdefault(n,[]).append((f,pid,t))
            if i%400==0: print(i,len(res),flush=True)
    json.dump(res,io.open('allsprites.json','w',encoding='utf-8'))
    print('done',len(res))
