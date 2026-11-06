import sys,re,struct,json
lines=open(sys.argv[1]).read().splitlines()
ins=[]
for l in lines:
    m=re.match(r'\s+([0-9a-f]+):\s+(\S+)\s*(.*?)(\s+;.*)?$',l)
    if m: ins.append((int(m.group(1),16),m.group(2),m.group(3)+(m.group(4) or "")))
def imm(s):
    s=s.strip().lstrip('#')
    return int(s,16) if s.startswith('0x') or s.startswith('-0x') else int(s)
reg={'x26':('G',0)}; stack={}; wv={}
blocks=[];cur=None
def gval(r):
    return reg.get(r)
for a,op,args in ins:
    A=[x.strip() for x in re.split(r',(?![^\[]*\])',args.split(';')[0])]
    try:
        if op=='mov' and A[0].startswith('w') and A[1].startswith('#'):
            wv[A[0][1:]]=imm(A[1])&0xffffffff; reg.pop('x'+A[0][1:],None)
        elif op=='mov' and A[0].startswith('w') and A[1]=='wzr':
            wv[A[0][1:]]=0
        elif op=='movk':
            sh=int(A[2].split('#')[1]) if len(A)>2 else 0
            n=A[0][1:]; wv[n]=(wv.get(n,0)&~(0xffff<<sh))|(imm(A[1])<<sh)
        elif op=='add' and A[0].startswith('x'):
            b=reg.get(A[1])
            if b and b[0]=='G':
                if A[2].startswith('#'):
                    v=imm(A[2]); 
                    if len(A)>3 and 'lsl' in A[3]: v<<=int(A[3].split('#')[1])
                    reg[A[0]]=('G',b[1]+v)
                elif A[2].startswith('x') and A[2][1:] in wv:
                    reg[A[0]]=('G',b[1]+wv[A[2][1:]])
                else: reg.pop(A[0],None)
            else: reg.pop(A[0],None)
        elif op in('stur','str') and A[0].startswith('x'):
            m=re.match(r'\[(x29|sp), #(-?0x[0-9a-f]+|\d+)\]',A[1])
            if m and A[0] in reg: stack[(m.group(1),imm(m.group(2)))]=reg[A[0]]
        elif op=='stp' and A[0].startswith('x'):
            m=re.match(r'\[(x29|sp), #(-?0x[0-9a-f]+|\d+)\]',A[2])
            if m:
                o=imm(m.group(2))
                if A[0] in reg: stack[(m.group(1),o)]=reg[A[0]]
                if A[1] in reg: stack[(m.group(1),o+8)]=reg[A[1]]
        elif op in('ldur','ldr') and A[0].startswith('x'):
            m=re.match(r'\[(x29|sp), #(-?0x[0-9a-f]+|\d+)\]',A[1])
            m2=re.match(r'\[(x\d+)(?:, #(-?0x[0-9a-f]+|\d+))?\]$',A[1])
            if m:
                v=stack.get((m.group(1),imm(m.group(2))))
                if v: reg[A[0]]=('G',v[1])
                else: reg.pop(A[0],None)
            elif m2 and m2.group(1) in reg:
                off=imm(m2.group(2)) if m2.group(2) else 0
                reg[A[0]]=('P',reg[m2.group(1)][1]+off) if reg[m2.group(1)][0]=='G' else None
                if reg[A[0]] is None: reg.pop(A[0])
            else: reg.pop(A[0],None)
        elif op=='ldp' and A[0].startswith('x'):
            m=re.match(r'\[(x29|sp), #(-?0x[0-9a-f]+|\d+)\]$',A[2])
            for k,r in enumerate(A[:2]):
                v=stack.get((m.group(1),imm(m.group(2))+8*k)) if m else None
                if v: reg[r]=v
                else: reg.pop(r,None)
        elif op=='fmov' and A[0]=='s0':
            if A[1].startswith('#'): wv['s0']=float(A[1][1:])
            elif A[1].startswith('w'): wv['s0']=struct.unpack('<f',struct.pack('<I',wv.get(A[1][1:],0)))[0]
        elif op=='bl' and 'setInt' in args:
            p=reg.get('x0'); 
            blocks.append((a,p[1] if p and p[0]=='P' else None,'i',wv.get('1')))
        elif op=='bl' and 'setFloat' in args:
            p=reg.get('x0')
            blocks.append((a,p[1] if p and p[0]=='P' else None,'f',round(wv.get('s0',0),4)))
        elif op=='bl':
            for r in ['x0','x1','x2','x3','x4','x5','x6','x7','x8','x9','x10','x11','x12','x13','x14','x15','x16','x17']: reg.pop(r,None)
        elif op in('mov',) and A[0].startswith('x') and A[1].startswith('x'):
            if A[1] in reg: reg[A[0]]=reg[A[1]]
            else: reg.pop(A[0],None)
        elif A and A[0].startswith('x') and op not in('cmp','cmn','tst','b','cbz','cbnz','tbz','tbnz'):
            reg.pop(A[0],None)
    except Exception as e:
        pass
    reg['x26']=('G',0)
json.dump(blocks,open(sys.argv[2],'w'))
print(len(blocks), sum(1 for b in blocks if b[1] is None))
