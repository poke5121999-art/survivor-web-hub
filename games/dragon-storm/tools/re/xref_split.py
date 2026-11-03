#!/usr/bin/env python3
"""Find functions that build base+0xHLLL as `add x, y, #0xH, lsl #12` followed (within 6 insns) by an add/ldr/str
with low 12 bits 0xLLL. usage: .venv/bin/python -I tools/xref_split.py <lib> <offset hex>"""
import os, struct, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_dis import Lib  # tools/ds_dis.py
lib = Lib(sys.argv[1]); off = int(sys.argv[2], 16); hi, lo = off >> 12, off & 0xFFF
text = lib.sec['.text']; code = lib.read(text['sh_addr'], text['sh_size']); base = text['sh_addr']
hits = collections.Counter()
for i in range(0, len(code) - 3, 4):
    w = struct.unpack_from('<I', code, i)[0]
    if (w & 0xFFC00000) == 0x91400000 and ((w >> 10) & 0xFFF) == hi:  # add x, x, #hi, lsl #12
        rd = w & 31
        for k in range(1, 7):
            p = struct.unpack_from('<I', code, i + 4 * k)[0]
            if (p >> 5) & 31 != rd: continue
            if (p & 0xFFC00000) == 0x91000000 and ((p >> 10) & 0xFFF) == lo:  # add
                hits[lib.func_at(base + i)[0]] += 1; break
            if (p & 0xFFC00000) in (0xF9400000, 0xF9000000) and ((p >> 10) & 0xFFF) * 8 == lo:  # ldr/str x, [x, #lo]
                hits[lib.func_at(base + i)[0]] += 1; break
print(f'0x{off:x}:', '; '.join(f'{n} x{c}' for n, c in hits.most_common(20)))
