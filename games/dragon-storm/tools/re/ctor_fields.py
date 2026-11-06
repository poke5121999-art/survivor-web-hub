#!/usr/bin/env python3
"""Recover `secureSet` initial values written by an initialiser function of libMyGame.so.

usage: .venv/bin/python -I tools/ctor_fields.py <lib> '<function name substring>' <out.json>

The game keeps its numbers in `secureSet` objects (obfuscated ints). Initialisers do, per value:
    x0 = operator new(8); str x0, [g_Data + off]; mov w1, #value; bl secureSet::setInt
(or `ldr x0, [base + off]` for an existing object). This walks the function linearly with a tiny register tracker:
pointer bases are `this` (x0 on entry) and `g_Data` (loaded through its GOT slot), `add`/`mov`/stack spills and
pre-index writeback are followed, and the literal in w1 is taken from movz/movk/movn/mov. Branches are ignored
(straight-line approximation, which is what these generated initialisers look like).
Output JSON: {"function", "address", "writes": [[base, offset, value, insn_address], ...]} in program order.
"""
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_dis import Lib  # noqa: E402  tools/ds_dis.py
from capstone.arm64 import ARM64_OP_FP, ARM64_OP_IMM, ARM64_OP_MEM, ARM64_OP_REG  # noqa: E402

G_DATA_GOT = 0xc6f7b8  # GOT slot holding &g_Data (R_AARCH64_GLOB_DAT g_Data)
PTR = ('this', 'g')
TRACE = {int(a, 16) for a in os.environ.get('DS_TRACE', '').split(',') if a}


def main():
    lib = Lib(sys.argv[1])
    pat, out = sys.argv[2], sys.argv[3]
    addr, size, name = next(f for f in lib.funcs if pat in f[2])
    setters = {a: n for a, n in lib.plt.items() if n.startswith('secureSet::set')}
    news = {a for a, n in lib.plt.items() if n.startswith('operator new')}
    rn = lib.md.reg_name
    regs = {'x0': ('this', 0)}
    stack = {}
    fp = [0]
    writes = []
    newid = [0]

    def rname(r):
        n = rn(r)
        return {'fp': 'x29', 'lr': 'x30'}.get(n, n)

    def x(r):
        n = rname(r)
        return 'x' + n[1:] if n[0] in 'wx' and n[1:].isdigit() else n

    def slot(base, disp):
        return disp + fp[0] if base == 'x29' else disp

    def kill(r):
        regs.pop(r, None)

    code = lib.read(addr, size)
    for ins in lib.md.disasm(code, addr):
        m, ops = ins.mnemonic, ins.operands
        if TRACE and ins.address in TRACE:
            print(f'TRACE {ins.address:x} {m} {ins.op_str} | x8={regs.get("x8")} x9={regs.get("x9")} x26={regs.get("x26")} x0={regs.get("x0")} slot150={stack.get(0x150)} fp={fp[0]}')
        if m == 'sub' and ins.op_str.startswith('sp, sp, #'):
            fp[0] += int(ins.op_str.split('#')[1], 16)
            continue
        try:
            if getattr(ins, 'writeback', False) and ops and ops[-1].type == ARM64_OP_MEM:
                bx = x(ops[-1].mem.base)
                if bx in regs and regs[bx][0] in PTR:
                    regs[bx] = (regs[bx][0], regs[bx][1] + ops[-1].mem.disp)
            if m == 'fmov' and len(ops) == 2 and rname(ops[0].reg).startswith('s'):
                d = rname(ops[0].reg)
                if ops[1].type == ARM64_OP_FP:
                    regs[d] = ('f', ops[1].fp)
                elif ops[1].type == ARM64_OP_REG and regs.get(x(ops[1].reg), (None,))[0] == 'const':
                    regs[d] = ('f', struct.unpack('<f', struct.pack('<I', regs[x(ops[1].reg)][1] & 0xFFFFFFFF))[0])
                else:
                    kill(d)
                continue
            if m == 'scvtf' and len(ops) == 2 and rname(ops[0].reg).startswith('s'):
                v = regs.get(x(ops[1].reg))
                regs[rname(ops[0].reg)] = ('f', float(v[1])) if v and v[0] == 'const' else None
                continue
            if m == 'ldr' and len(ops) == 2 and rname(ops[0].reg).startswith('s') and ops[1].type == ARM64_OP_MEM:
                b = regs.get(x(ops[1].mem.base))
                if b and b[0] == 'page':
                    raw = lib.read(b[1] + ops[1].mem.disp, 4)
                    regs[rname(ops[0].reg)] = ('f', struct.unpack('<f', raw)[0]) if len(raw) == 4 else None
                else:
                    kill(rname(ops[0].reg))
                continue
            if m == 'adrp':
                regs[x(ops[0].reg)] = ('page', ops[1].imm)
            elif m in ('add', 'sub') and len(ops) == 3 and ops[1].type == ARM64_OP_REG and ops[2].type == ARM64_OP_IMM:
                src = regs.get(x(ops[1].reg))
                imm = ops[2].imm << (ops[2].shift.value or 0)
                imm = imm if m == 'add' else -imm
                if src and src[0] in PTR + ('page',):
                    regs[x(ops[0].reg)] = (src[0], src[1] + imm)
                else:
                    kill(x(ops[0].reg))
            elif m == 'add' and len(ops) == 3 and ops[2].type == ARM64_OP_REG:
                a, b = regs.get(x(ops[1].reg)), regs.get(x(ops[2].reg))
                if b and b[0] == 'const' and ops[2].shift.value:
                    b = ('const', b[1] << ops[2].shift.value)
                if a and b and a[0] in PTR and b[0] == 'const':
                    regs[x(ops[0].reg)] = (a[0], a[1] + b[1])
                elif a and b and b[0] in PTR and a[0] == 'const':
                    regs[x(ops[0].reg)] = (b[0], b[1] + a[1])
                else:
                    kill(x(ops[0].reg))
            elif m in ('mov', 'movz') and len(ops) == 2:
                d = x(ops[0].reg)
                if ops[1].type == ARM64_OP_IMM:
                    regs[d] = ('const', ops[1].imm << (ops[1].shift.value or 0))
                elif ops[1].type == ARM64_OP_REG:
                    s = rn(ops[1].reg)
                    if s in ('wzr', 'xzr'):
                        regs[d] = ('const', 0)
                    elif x(ops[1].reg) in regs:
                        regs[d] = regs[x(ops[1].reg)]
                    else:
                        kill(d)
            elif m == 'movk':
                d = x(ops[0].reg)
                cur = regs.get(d)
                sh = ops[1].shift.value or 0
                if cur and cur[0] == 'const':
                    regs[d] = ('const', (cur[1] & ~(0xFFFF << sh)) | (ops[1].imm << sh))
                else:
                    kill(d)
            elif m == 'movn':
                regs[x(ops[0].reg)] = ('const', ~(ops[1].imm << (ops[1].shift.value or 0)))
            elif m in ('str', 'stur') and len(ops) == 2 and ops[1].type == ARM64_OP_MEM:
                base = rname(ops[1].mem.base)
                v = regs.get(x(ops[0].reg))
                if base in ('sp', 'x29'):
                    k = slot(base, ops[1].mem.disp)
                    if v:
                        stack[k] = v
                    else:
                        stack.pop(k, None)
                else:
                    b = regs.get(x(ops[1].mem.base))
                    disp = ops[1].mem.disp
                    if ops[1].mem.index:
                        iv = regs.get(x(ops[1].mem.index))
                        disp = disp + iv[1] if iv and iv[0] == 'const' else None
                    if v and v[0] == 'new' and b and b[0] in PTR and disp is not None:
                        # the new secureSet now lives in field b+disp; remember it by object id
                        for r, val in list(regs.items()):
                            if val == v:
                                regs[r] = ('obj', (b[0], b[1] + disp))
            elif m in ('ldr', 'ldur') and len(ops) == 2 and ops[1].type == ARM64_OP_MEM:
                d = x(ops[0].reg)
                base = rname(ops[1].mem.base)
                b = regs.get(x(ops[1].mem.base))
                if base in ('sp', 'x29') and slot(base, ops[1].mem.disp) in stack:
                    regs[d] = stack[slot(base, ops[1].mem.disp)]
                elif b and b[0] == 'page' and b[1] + ops[1].mem.disp == G_DATA_GOT:
                    regs[d] = ('this', 0)  # g_Data is the GameData instance itself
                elif b and b[0] in PTR:
                    disp = ops[1].mem.disp
                    if ops[1].mem.index:
                        iv = regs.get(x(ops[1].mem.index))
                        disp = disp + iv[1] if iv and iv[0] == 'const' else None
                    if disp is None:
                        kill(d)
                    else:
                        regs[d] = ('obj', (b[0], b[1] + disp))
                else:
                    kill(d)
            elif m == 'bl' and ops and ops[0].type == ARM64_OP_IMM:
                t = ops[0].imm
                if t in setters:
                    o = regs.get('x0')
                    v = regs.get('x1')
                    val = v[1] if v and v[0] == 'const' else None
                    if val is not None:
                        val &= 0xFFFFFFFF
                        if val >= 1 << 31:
                            val -= 1 << 32
                    if setters[t].endswith('(float)'):
                        f0 = regs.get('s0')
                        val = round(f0[1], 4) if f0 and f0[0] == 'f' else None
                    field = o[1] if o and o[0] == 'obj' else (None, None)
                    writes.append([field[0], field[1], val, ins.address, setters[t]])
                for i in range(19):
                    kill(f'x{i}')
                for i in list(range(8)) + list(range(16, 32)):
                    kill(f's{i}')
                if t in news:
                    newid[0] += 1
                    regs['x0'] = ('new', newid[0])
            elif m == 'blr':
                for i in range(19):
                    kill(f'x{i}')
            elif ops and ops[0].type == ARM64_OP_REG and m not in ('cmp', 'cmn', 'tst', 'b', 'cbz', 'cbnz', 'tbz', 'tbnz', 'ret', 'stp', 'str', 'strb', 'strh', 'stur', 'sturb', 'sturh'):
                kill(x(ops[0].reg))
        except Exception:  # unusual operand forms: forget the destination, keep going
            if ops and ops[0].type == ARM64_OP_REG:
                kill(x(ops[0].reg))
    json.dump({'function': name, 'address': hex(addr), 'writes': writes}, open(out, 'w'))
    known = [w for w in writes if w[1] is not None and w[2] is not None]
    print(f'{name}: {len(writes)} setter calls, {len(known)} with field+value resolved -> {out}')


if __name__ == '__main__':
    main()
