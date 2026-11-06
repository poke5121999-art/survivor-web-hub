# Emulate one switch case of a function that writes constants into [x0 + off]. Usage: lib func_addr jt_addr ncases base_label case_index...
import sys,struct,json
from elftools.elf.elffile import ELFFile
from capstone import *
from capstone.arm64 import *
lib=sys.argv[1]; f=open(lib,'rb'); e=ELFFile(f)
segs=[(s['p_vaddr'],s['p_offset'],s['p_filesz']) for s in e.iter_segments() if s['p_type']=='PT_LOAD']
def rd(va,n):
    for v,o,sz in segs:
        if v<=va<v+sz: f.seek(o+va-v); return f.read(n)
    return None
GOT_GDATA=0xc6f7b8
md=Cs(CS_ARCH_ARM64,CS_MODE_ARM); md.detail=True
def run(start,stop_at,maxn=20000,init=None,through_bl=False,end=None):
    R={}
    R['x0']=('T',0)
    if init: R=dict(init)
    writes=[]
    pc=start; n=0
    def name(r): 
        s=md.reg_name(r); 
        if s.startswith('w'): s='x'+s[1:]
        if s=='fp': s='x29'
        if s=='lr': s='x30'
        return s
    def val(op):
        if op.type==ARM64_OP_IMM: return ('C',op.imm)
        if op.type==ARM64_OP_REG:
            s=name(op.reg)
            if s in('xzr','wzr'): return ('C',0)
            v=R.get(s)
            if v and v[0]=='C' and md.reg_name(op.reg).startswith('w'): return ('C',v[1]&0xffffffff)
            return v
        return None
    while n<maxn:
        code=rd(pc,4); ins=next(md.disasm(code,pc)); n+=1
        m=ins.mnemonic; ops=ins.operands
        if m=='b' : 
            pc=ops[0].imm
            if pc==stop_at:
                writes.append(('END',R.get('x8')))
                break
            continue
        if end and pc>=end: break
        if m=='bl' and through_bl:
            for r in range(0,19): R.pop('x%d'%r,None)
            pc+=4; continue
        if m in('ret','br','blr') or m.startswith('b.') or m in('cbz','cbnz','tbz','tbnz','bl'):
            writes.append(('STOP',hex(pc),m+' '+ins.op_str)); break
        try:
            if m in('mov','movz') and len(ops)==2:
                v=val(ops[1]); d=name(ops[0].reg)
                if v: R[d]=v
                else: R.pop(d,None)
                if ops[0].type==ARM64_OP_REG and md.reg_name(ops[0].reg).startswith(('d','s','q','v')): R[md.reg_name(ops[0].reg)]=v
            elif m=='movk':
                d=name(ops[0].reg); v=R.get(d,('C',0)); sh=ops[1].shift.value if ops[1].shift.type else 0
                R[d]=('C',(v[1]&~(0xffff<<sh))|(ops[1].imm<<sh))
            elif m=='movn':
                d=name(ops[0].reg); sh=ops[1].shift.value if ops[1].shift.type else 0
                R[d]=('C',(~(ops[1].imm<<sh))&(0xffffffff if md.reg_name(ops[0].reg).startswith('w') else 0xffffffffffffffff))
            elif m=='adrp':
                R[name(ops[0].reg)]=('C',ops[1].imm)
            elif m=='adr':
                R[name(ops[0].reg)]=('C',ops[1].imm)
            elif m in('add','sub','orr'):
                d=name(ops[0].reg); a=val(ops[1]); b=val(ops[2]) if len(ops)>2 else None
                if b and ops[2].shift.type: b=('C',b[1]<<ops[2].shift.value) if b[0]=='C' else None
                if a and b and b[0]=='C':
                    if m=='add': R[d]=(a[0],a[1]+b[1])
                    elif m=='sub': R[d]=(a[0],a[1]-b[1])
                    elif m=='orr' and a[0]=='C': R[d]=('C',a[1]|b[1])
                    else: R.pop(d,None)
                else: R.pop(d,None)
            elif m in('ldr','ldur','ldp','ldrsw','ldrh','ldrb'):
                mem=ops[-1].mem; base=name(mem.base) if mem.base else None; bv=R.get(base)
                off=mem.disp
                if mem.index: 
                    iv=R.get(name(mem.index)); off+= iv[1] if iv and iv[0]=='C' else 0
                regs=[md.reg_name(o.reg) for o in ops[:-1]]
                for k,r in enumerate(regs):
                    sz={'x':8,'w':4,'d':8,'s':4,'q':16}[r[0]] if m not in('ldrh','ldrb','ldrsw') else {'ldrh':2,'ldrb':1,'ldrsw':4}[m]
                    addr=None
                    if bv and bv[0]=='C':
                        a=bv[1]+off+k*sz
                        if a==GOT_GDATA: R[name(ops[k].reg) if r[0] in'xw' else r]=('G',0); continue
                        b=rd(a,sz)
                        if b is None: R.pop(r,None); continue
                        v=int.from_bytes(b,'little',signed=(m=='ldrsw'))
                        key=name(ops[k].reg) if r[0] in 'xw' else r
                        R[key]=('C',v)
                    elif bv and bv[0]=='G':
                        key=name(ops[k].reg) if r[0] in 'xw' else r
                        R[key]=('GV',bv[1]+off+k*sz)
                    else:
                        key=name(ops[k].reg) if r[0] in 'xw' else r
                        R.pop(key,None)
            elif m in('str','stur','stp','strb','strh'):
                mem=ops[-1].mem; base=name(mem.base); bv=R.get(base); off=mem.disp
                if mem.index:
                    iv=R.get(name(mem.index)); off+= iv[1] if iv and iv[0]=='C' else 0
                for k,o in enumerate(ops[:-1]):
                    r=md.reg_name(o.reg)
                    sz={'x':8,'w':4,'d':8,'s':4,'q':16}.get(r[0],8)
                    if m=='strb': sz=1
                    if m=='strh': sz=2
                    if r in('wzr','xzr'): v=('C',0)
                    else: v=R.get(name(o.reg) if r[0] in 'xw' else r)
                    if bv and bv[0]=='T':
                        writes.append((bv[1]+off+k*sz,sz,r[0],v))
            elif m=='fmov':
                d=md.reg_name(ops[0].reg)
                if ops[1].type==ARM64_OP_FP:
                    R[d]=('F',ops[1].fp)
                elif ops[1].type==ARM64_OP_REG:
                    v=R.get(name(ops[1].reg) if md.reg_name(ops[1].reg)[0] in 'xw' else md.reg_name(ops[1].reg)); R[d if d[0] not in 'xw' else name(ops[0].reg)]=v
            elif m in('movi',):
                im=ops[1].imm if len(ops)>1 and ops[1].type==ARM64_OP_IMM else 0
                rn=md.reg_name(ops[0].reg); rn='d'+rn[1:] if rn[0]=='v' else rn
                if '.2s' in ins.op_str: v=(im&0xffffffff)|((im&0xffffffff)<<32)
                elif '.2d' in ins.op_str: v=0xffffffffffffffff if im else 0
                else: v=im
                R[rn]=('C',v); R['q'+rn[1:]]=('C',v|(v<<64))
            else:
                if ops and ops[0].type==ARM64_OP_REG:
                    r=md.reg_name(ops[0].reg); R.pop(name(ops[0].reg) if r[0] in 'xw' else r,None)
        except Exception as ex:
            writes.append(('ERR',hex(pc),ins.mnemonic+' '+ins.op_str,str(ex)))
        pc+=4
    return writes
if __name__=='__main__':
    fa=int(sys.argv[2],16); jt=int(sys.argv[3],16); nc=int(sys.argv[4]); anchor=int(sys.argv[5],16); stop=int(sys.argv[6],16)
    out={}
    for c in range(nc):
        h=struct.unpack('<H',rd(jt+2*c,2))[0]; tgt=anchor+h*4
        out[c]={'target':hex(tgt),'writes':run(tgt,stop)}
    json.dump(out,open(sys.argv[7],'w'),default=str)
    for c in range(nc): print(c,out[c]['target'],len(out[c]['writes']),out[c]['writes'][-1] if out[c]['writes'] else None)
