#!/usr/bin/env python3
"""Find functions that load a 32-bit field at [xN, #off] (ldr w / ldr s) for given offsets.
usage: .venv/bin/python -I tools/xref_field.py <lib> <off hex> [...]"""
import os, struct, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_dis import Lib  # tools/ds_dis.py
lib = Lib(sys.argv[1])
text = lib.sec['.text']; code = lib.read(text['sh_addr'], text['sh_size']); base = text['sh_addr']
offs = [int(h, 16) for h in sys.argv[2:]]
hits = {o: collections.Counter() for o in offs}
for i in range(0, len(code) - 3, 4):
    w = struct.unpack_from('<I', code, i)[0]
    if (w & 0xFFC00000) in (0xB9400000, 0xBD400000):  # ldr w, [x, #imm*4] / ldr s, [x, #imm*4]
        o = ((w >> 10) & 0xFFF) * 4
        if o in hits: hits[o][lib.func_at(base + i)[0]] += 1
for o in offs:
    print(hex(o), '; '.join(f'{n[:70]} x{c}' for n, c in hits[o].most_common(8)))
