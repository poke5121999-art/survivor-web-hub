import json,sys
d=json.load(open(sys.argv[1])); sl=json.load(open(sys.argv[2]))
out={}
for st in range(int(sys.argv[3])):
    mem={}
    for w in d[str(st)]['writes']:
        if w[0] in('STOP','ERR','END'): continue
        off,sz,k,v=w
        for i in range(sz//4):
            o=off+4*i
            if v is None: mem[o]=('?',); continue
            if v[0]=='C': x=(v[1]>>(32*i))&0xffffffff; mem[o]=('C', x-2**32 if x>=2**31 else x)
            elif v[0]=='GV': mem[o]=('L',(v[1]-0x19538-st*0x50)//4)
            elif v[0]=='F': mem[o]=('F',v[1])
            else: mem[o]=('?',v)
    base=st*80000+1220
    ents={}
    for o,val in mem.items():
        r=o-base; k,f=divmod(r,40)
        ents.setdefault(k,{})[f]=val
    rows=[]
    row=sl.get(str(st),{})
    for k in sorted(ents):
        e=ents[k]
        t=e.get(0,('C',-1)); side=e.get(4,('C',-1)); mode=e.get(8,('C',-1)); ex=e.get(12,('C',-1))
        if t[0]=='L': typ=row.get(str(t[1]),-1); tl=f'list[{t[1]}]={typ}'
        else: typ=t[1]; tl=str(t)
        rows.append(dict(k=k,t=round(k*0.1,1),type=typ,src=tl,side=side[1] if side[0]=='C' else str(side),mode=mode[1] if mode[0]=='C' else str(mode),extra=ex[1] if ex[0]=='C' else str(ex),other={f:v for f,v in e.items() if f not in(0,4,8,12)}))
    out[st]=rows
    print('== stage index',st,'(Stage',st+1,') list',[row.get(str(i)) for i in range(8)])
    for r in rows: print('  t=%5.1f type=%-4s side=%-3s mode=%-3s extra=%-3s %s %s'%(r['t'],r['type'],r['side'],r['mode'],r['extra'],r['src'],r['other'] or ''))
json.dump(out,open(sys.argv[4],'w'),indent=0)
