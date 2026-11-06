#!/usr/bin/env python3
"""Find code locations (adrp+add) that load the address of given C strings in .rodata.
usage: .venv/bin/python -I tools/xref_str.py <lib> <string> [...]"""
import os, struct, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ds_dis import Lib  # tools/ds_dis.py
lib = Lib(sys.argv[1])
ro = lib.sec['.rodata']; rod = lib.read(ro['sh_addr'], ro['sh_size'])
want = {}
for s in sys.argv[2:]:
    i = rod.find(s.encode() + b'\0')
    if i >= 0: want[ro['sh_addr'] + i] = s
text = lib.sec['.text']; code = lib.read(text['sh_addr'], text['sh_size']); base = text['sh_addr']
res = collections.defaultdict(list)
for i in range(0, len(code) - 3, 4):
    w = struct.unpack_from('<I', code, i)[0]
    if (w & 0x9F000000) != 0x90000000: continue
    rd = w & 31
    imm = ((((w >> 5) & 0x7FFFF) << 2) | ((w >> 29) & 3)) << 12
    if imm & (1 << 32): imm -= 1 << 33
    page = ((base + i) & ~0xFFF) + imm
    for k in range(1, 5):
        p = struct.unpack_from('<I', code, i + 4 * k)[0]
        if (p & 0xFF800000) == 0x91000000 and (p >> 5) & 31 == rd:
            t = page + ((p >> 10) & 0xFFF)
            if t in want: res[want[t]].append((hex(base + i), lib.func_at(base + i)[0]))
            break
for s in sys.argv[2:]:
    print(s, '->', res.get(s, [])[:8])
