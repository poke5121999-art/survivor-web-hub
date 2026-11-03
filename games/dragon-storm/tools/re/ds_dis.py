#!/usr/bin/env python3
"""Disassemble named functions of libMyGame.so (aarch64) with call targets and data refs resolved.

usage: .venv/bin/python -I tools/ds_dis.py <libMyGame.so> <C++ symbol substring> [max insns] [--all]
  - bl/b targets are shown as the C++ name of the function (internal) or the imported symbol (PLT stub)
  - adrp+add / adrp+ldr pairs that land in .rodata show the C string there (if printable) or the address
Matching is a substring of the demangled name; the first 4 matches are printed (all with --all).
"""
import bisect
import struct
import subprocess
import sys

from capstone import CS_ARCH_ARM64, CS_MODE_ARM, Cs
from capstone.arm64 import ARM64_OP_IMM, ARM64_OP_MEM, ARM64_OP_REG
from elftools.elf.elffile import ELFFile
from elftools.elf.relocation import RelocationSection


class Lib:
    def __init__(self, path):
        self.f = open(path, 'rb')
        self.elf = ELFFile(self.f)
        self.sec = {s.name: s for s in self.elf.iter_sections()}
        dynsym = self.sec['.dynsym']
        syms = [s for s in dynsym.iter_symbols()]
        raw = [s.name for s in syms]
        dem = subprocess.run(['c++filt'], input='\n'.join(raw), capture_output=True, text=True).stdout.split('\n')
        self.funcs = sorted((s['st_value'], s['st_size'], d) for s, d in zip(syms, dem)
                            if s['st_value'] and s['st_info']['type'] == 'STT_FUNC')
        self.objs = sorted((s['st_value'], s['st_size'], d) for s, d in zip(syms, dem)
                           if s['st_value'] and s['st_info']['type'] == 'STT_OBJECT')
        self.faddr = [a for a, _, _ in self.funcs]
        self.oaddr = [a for a, _, _ in self.objs]
        # .got.plt slot -> imported symbol name
        got2sym = {}
        rp = self.sec['.rela.plt']
        for r in rp.iter_relocations():
            got2sym[r['r_offset']] = dem[r['r_info_sym']] if r['r_info_sym'] < len(dem) else '?'
        self.plt = {}
        md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
        md.detail = True
        plt = self.sec['.plt']
        code = self.read(plt['sh_addr'], plt['sh_size'])
        insns = list(md.disasm(code, plt['sh_addr']))
        for i in range(len(insns) - 1):
            a, b = insns[i], insns[i + 1]
            if a.mnemonic == 'adrp' and b.mnemonic == 'ldr':
                page = a.operands[1].imm
                got = page + b.operands[1].mem.disp
                if got in got2sym:
                    self.plt[a.address] = got2sym[got]
        self.md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
        self.md.detail = True

    def off(self, addr):
        for s in self.elf.iter_segments():
            if s['p_type'] == 'PT_LOAD' and s['p_vaddr'] <= addr < s['p_vaddr'] + s['p_filesz']:
                return addr - s['p_vaddr'] + s['p_offset']
        return None

    def read(self, addr, n):
        o = self.off(addr)
        if o is None:
            return b''
        self.f.seek(o)
        return self.f.read(n)

    def func_at(self, addr):
        i = bisect.bisect_right(self.faddr, addr) - 1
        if i >= 0:
            a, sz, n = self.funcs[i]
            if a <= addr < a + max(sz, 4):
                return n, addr - a
        return None, 0

    def obj_at(self, addr):
        i = bisect.bisect_right(self.oaddr, addr) - 1
        if i >= 0:
            a, sz, n = self.objs[i]
            if a <= addr < a + max(sz, 1):
                return n, addr - a
        return None, 0

    def cstr(self, addr):
        b = self.read(addr, 120)
        end = b.find(b'\0')
        if end <= 0:
            return None
        s = b[:end]
        if all(32 <= c < 127 for c in s):
            return s.decode()
        return None

    def name_target(self, t):
        if t in self.plt:
            return f'<PLT {self.plt[t]}>'
        n, o = self.func_at(t)
        if n:
            return f'<{n}{"+0x%x" % o if o else ""}>'
        return ''

    def describe_data(self, addr):
        s = self.cstr(addr)
        sec = next((x.name for x in self.elf.iter_sections() if x['sh_addr'] <= addr < x['sh_addr'] + x['sh_size']), '?')
        o, oo = self.obj_at(addr)
        bits = [f'{sec}:0x{addr:x}']
        if o:
            bits.append(f'obj {o}+0x{oo:x}')
        if s:
            bits.append(repr(s))
        return ' '.join(bits)

    def dis(self, start, size, maxn=100000):
        code = self.read(start, min(size, maxn * 4))
        pages = {}
        out = []
        for ins in self.md.disasm(code, start):
            note = ''
            ops = ins.operands
            if ins.mnemonic == 'adrp':
                pages[ops[0].reg] = ops[1].imm
            elif ins.mnemonic in ('add',) and len(ops) == 3 and ops[1].type == ARM64_OP_REG and ops[1].reg in pages and ops[2].type == ARM64_OP_IMM:
                note = self.describe_data(pages[ops[1].reg] + ops[2].imm)
            elif ins.mnemonic.startswith('ldr') or ins.mnemonic.startswith('str'):
                for op in ops:
                    if op.type == ARM64_OP_MEM and op.mem.base in pages:
                        note = self.describe_data(pages[op.mem.base] + op.mem.disp)
            if ins.mnemonic in ('bl', 'b') and ops and ops[0].type == ARM64_OP_IMM:
                note = self.name_target(ops[0].imm)
            out.append(f'  {ins.address:x}: {ins.mnemonic:6} {ins.op_str}{"   ; " + note if note else ""}')
        return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    lib = Lib(args[0])
    pat = args[1]
    maxn = int(args[2]) if len(args) > 2 else 100000
    hits = [x for x in lib.funcs if pat in x[2]]
    show = hits if '--all' in sys.argv else hits[:4]
    for a, sz, n in show:
        print(f'== {n} @0x{a:x} size {sz}')
        print('\n'.join(lib.dis(a, sz, maxn)))
    print(f'{len(hits)} matching symbols')


if __name__ == '__main__':
    main()
