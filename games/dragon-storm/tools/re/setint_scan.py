#!/usr/bin/env python3
"""List constant arguments passed to secureSet setters (and similar PLT calls) per function, to recover the game's
initial data tables. usage: .venv/bin/python -I tools/setint_scan.py <lib> <PLT name substring> [function substring]"""
import os, struct, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_dis import Lib  # tools/ds_dis.py
lib = Lib(sys.argv[1])
pat = sys.argv[2]
fpat = sys.argv[3] if len(sys.argv) > 3 else ''
targets = {a for a, n in lib.plt.items() if pat in n}
print('PLT targets:', [lib.plt[a] for a in targets])
text = lib.sec['.text']
code = lib.read(text['sh_addr'], text['sh_size'])
base = text['sh_addr']
per = collections.defaultdict(list)
for i in range(0, len(code) - 3, 4):
    w = struct.unpack_from('<I', code, i)[0]
    if (w & 0xFC000000) == 0x94000000:  # BL
        imm = w & 0x3FFFFFF
        if imm & 0x2000000: imm -= 0x4000000
        t = base + i + imm * 4
        if t not in targets: continue
        val = None
        for k in range(1, 7):  # look back for the w1 argument
            p = struct.unpack_from('<I', code, i - 4 * k)[0]
            rd = p & 31
            if rd != 1: continue
            if (p & 0x7FE00000) == 0x52800000:   # movz w1/x1, #imm
                val = ((p >> 5) & 0xFFFF) << (16 * ((p >> 21) & 3)); break
            if (p & 0x7FE00000) == 0x12800000:   # movn
                val = ~(((p >> 5) & 0xFFFF) << (16 * ((p >> 21) & 3))) & 0xFFFFFFFF
                val = val - (1 << 32) if val >= 1 << 31 else val; break
            if p == 0x2A1F03E1 or p == 0xAA1F03E1:  # mov w1, wzr
                val = 0; break
            break  # w1 set some other way
        fn = lib.func_at(base + i)[0]
        if fpat in (fn or ''):
            per[fn].append(val)
for fn, vals in sorted(per.items(), key=lambda kv: -len(kv[1])):
    known = [v for v in vals if v is not None]
    if known:
        print(f'{len(vals):4} calls, {len(known):4} const | {fn[:90]} | {known[:60]}')
