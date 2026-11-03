#!/usr/bin/env python3
"""Find functions in libMyGame.so whose code materialises a given immediate with MOVZ (mov wN/xN, #imm) or uses it
as an ADD/SUB immediate. usage: .venv/bin/python -I tools/xref_imm.py <lib> <imm hex> [...]"""
import struct, sys, collections
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from ds_dis import Lib  # tools/ds_dis.py
lib = Lib(sys.argv[1])
text = lib.sec['.text']
code = lib.read(text['sh_addr'], text['sh_size'])
base = text['sh_addr']
for h in sys.argv[2:]:
    imm = int(h, 16)
    hits = collections.Counter()
    for i in range(0, len(code) - 3, 4):
        w = struct.unpack_from('<I', code, i)[0]
        # MOVZ (32/64-bit), hw=0: sf 10100101 00 imm16 rd
        if (w & 0x7FE00000) == 0x52800000 and ((w >> 5) & 0xFFFF) == imm:
            hits[lib.func_at(base + i)[0]] += 1
        # ADD/SUB immediate 12-bit (shift 0)
        elif (w & 0x7F800000) in (0x11000000, 0x51000000) and ((w >> 10) & 0xFFF) == imm and not (w >> 22) & 1:
            hits[lib.func_at(base + i)[0]] += 1
    print(f'0x{imm:x}:', '; '.join(f'{n} x{c}' for n, c in hits.most_common(25)))
