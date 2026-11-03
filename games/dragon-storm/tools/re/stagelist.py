import sys,json
sys.path.insert(0,sys.argv[1])
import scen_emu as E
w=E.run(0x635850,None,maxn=40000,init={"x11":("T",0),"x8":("C",0x2d0000),"x9":("C",0x356000)},through_bl=True)
rows={}
for x in w:
    if x[0] in('STOP','ERR'): print(x); continue
    off,sz,k,v=x
    if v is None or v[0]!='C': 
        print('nonconst',off,sz,v); continue
    for i in range(sz//4):
        o=off+4*i; val=(v[1]>>(32*i))&0xffffffff
        if val>=2**31: val-=2**32
        rows[o]=val
st={}
for o,val in rows.items(): st.setdefault(o//0x50,{})[ (o%0x50)//4 ]=val
for s in sorted(st)[:12]:
    print(s, [st[s].get(i,'.') for i in range(20)])
json.dump({str(k):v for k,v in st.items()},open(sys.argv[2],'w'))
