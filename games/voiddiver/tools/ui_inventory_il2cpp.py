# -*- coding: utf-8 -*-
"""Đo lại các số của lục rương / túi đồ nằm trong MÃ gốc (không có trong bảng, không có trong prefab):
EnumExtensions.GetRevealTime / GetRevealSfx (theo EGoodsGradeType) và màu bậc trong EnumExtensions..cctor.

    python -m pip install capstone pefile
    set PYTHONIOENCODING=utf-8
    python ui_inventory_il2cpp.py

Cách làm (global-metadata.dat phiên bản 39, Il2CppDumper 6.x chưa đọc được):
  - header metadata là các bộ ba (offset, size, count) từ byte 8; bảng method 32 byte/dòng (nameIndex @0, token @20),
    bảng image 36 byte/dòng (nameIndex @0); method của các image nằm liền nhau theo thứ tự image.
  - GameAssembly.dll: tìm chuỗi "<Image>.dll" → con trỏ tới nó là Il2CppCodeGenModule {name, count(u32), methodPointers}
    → methodPointers[rid − 1] (rid = token & 0xFFFFFF) là địa chỉ hàm.
  - string literal: q = 0xA0000000 | (chỉ số << 1) | 1 trong .data; bảng literal 4 byte/dòng là offset vào khối dữ liệu.
In ra để so với REVEAL_TIME / REVEAL_SFX / GRADE_COLOR trong js/inventory.js.
"""
import os, re, struct, sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64

GAME = os.environ.get('VD_GAME', r'D:/Steam/steamapps/common/VOID DIVER Escape from the Abyss Demo')
META = os.path.join(GAME, 'VOID DIVER_Data', 'il2cpp_data', 'Metadata', 'global-metadata.dat')
DLL = os.path.join(GAME, 'GameAssembly.dll')
GRADES = ['None', 'Normal', 'Rare', 'Elite', 'Epic', 'Legend', 'Unique']   # thứ tự cột *Weight của DropReward.csv

mb = open(META, 'rb').read()
data = open(DLL, 'rb').read()
pe = pefile.PE(DLL, fast_load=True)
base = pe.OPTIONAL_HEADER.ImageBase


def sec(i):
    return struct.unpack_from('<3I', mb, 8 + 12 * i)


LIT, LITDATA, STR = sec(0), sec(1), sec(2)
METHODS = next(s for s in (sec(i) for i in range(3, 12)) if s[2] and s[1] == 32 * s[2])
IMAGES = next(s for s in (sec(i) for i in range(12, 30)) if s[2] and s[1] == 36 * s[2])


def s_at(i):
    e = mb.index(b'\0', STR[0] + i)
    return mb[STR[0] + i:e].decode('utf8', 'replace')


def lit(i):
    a = struct.unpack_from('<I', mb, LIT[0] + 4 * i)[0]
    b = struct.unpack_from('<I', mb, LIT[0] + 4 * (i + 1))[0] if i + 1 < LIT[2] else LITDATA[1]
    return mb[LITDATA[0] + a:LITDATA[0] + b].decode('utf8', 'replace')


def va2off(v):
    r = v - base
    for s in pe.sections:
        if s.VirtualAddress <= r < s.VirtualAddress + s.SizeOfRawData:
            return s.PointerToRawData + (r - s.VirtualAddress)


def off2va(o):
    for s in pe.sections:
        if s.PointerToRawData <= o < s.PointerToRawData + s.SizeOfRawData:
            return base + s.VirtualAddress + (o - s.PointerToRawData)


def image_methods(name):
    """(chỉ số method toàn cục đầu tiên, con trỏ mảng methodPointers, số method) của một image."""
    gi = 0
    for i in range(IMAGES[2]):
        nm = s_at(struct.unpack_from('<I', mb, IMAGES[0] + 36 * i)[0])
        k = data.find(b'\0' + nm.encode() + b'\0')
        j = data.find(struct.pack('<Q', off2va(k + 1)))
        cnt = struct.unpack_from('<I', data, j + 8)[0]
        mp = struct.unpack_from('<Q', data, j + 16)[0]
        if nm == name:
            return gi, mp, cnt
        gi += cnt
    raise KeyError(name)


def find_method(image, name):
    gi, mp, cnt = image_methods(image)
    out = []
    for rid in range(1, cnt + 1):
        r = struct.unpack_from('<8I', mb, METHODS[0] + 32 * (gi + rid - 1))
        if s_at(r[0]) == name:
            out.append(struct.unpack_from('<Q', data, va2off(mp + 8 * (rid - 1)))[0])
    return out


md = Cs(CS_ARCH_X86, CS_MODE_64)


def insns(va, n=200):
    o = va2off(va)
    for k, ins in enumerate(md.disasm(data[o:o + n * 8], va)):
        yield ins
        if ins.mnemonic == 'int3' or k > n:
            return


def rip_target(ins):
    m = re.search(r'rip ([+-]) (0x[0-9a-f]+)', ins.op_str)
    if not m:
        return None
    d = int(m.group(2), 16)
    return ins.address + ins.size + (d if m.group(1) == '+' else -d)


def jump_table(fn):
    """switch trên ecx (0..6): trả {case: địa chỉ khối}."""
    for ins in insns(fn, 40):
        m = re.search(r'\[r\w+ \+ r\w+\*4 \+ (0x[0-9a-f]+)\]', ins.op_str)
        if m:
            t = base + int(m.group(1), 16)
            return {c: base + struct.unpack_from('<i', data, va2off(t) + 4 * c)[0] for c in range(7)}
    return {}


def block_value(va, kind):
    for ins in insns(va, 8):
        t = rip_target(ins)
        if t is None:
            continue
        o = va2off(t)
        if kind == 'float' and ins.mnemonic == 'movss':
            return round(struct.unpack_from('<f', data, o)[0], 3)
        if kind == 'lit' and ins.mnemonic == 'mov':
            q = struct.unpack_from('<Q', data, o)[0]
            return lit((q & 0x1FFFFFFF) >> 1)
    return None


def main():
    t = find_method('De.Base.dll', 'GetRevealTime')[0]
    s = find_method('De.Base.dll', 'GetRevealSfx')[0]
    jt, js = jump_table(t), jump_table(s)
    print('GetRevealTime', {GRADES[c]: block_value(v, 'float') for c, v in jt.items()})
    print('GetRevealSfx ', {GRADES[c]: block_value(v, 'lit') for c, v in js.items()})
    # Màu bậc: .cctor của lớp EnumExtensions (ngay sau ToWidth) dựng Color32 bằng hằng 0xAABBGGRR, lưu 6 trường tĩnh
    # theo thứ tự ToColor(grade) đọc: +0x00 Normal/None, +0x10 Rare, +0x20 Elite, +0x30 Epic, +0x40 Legend, +0x50 Unique.
    cands = [p for p in find_method('De.Base.dll', '.cctor') if abs(p - t) < 0x10000]
    cctor = min(cands, key=lambda p: p if p > t else 1 << 62)
    cols = [int(m.group(1), 16) for ins in insns(cctor, 400)
            for m in [re.search(r'dword ptr \[rbp \+ 0x18\], (0x[0-9a-f]{8})$', ins.op_str)] if m]
    names = ['Normal', 'Rare', 'Elite', 'Epic', 'Legend', 'Unique']
    print('ToColor      ', {n: '#%02X%02X%02X' % (c & 255, (c >> 8) & 255, (c >> 16) & 255) for n, c in zip(names, cols)})


if __name__ == '__main__':
    main()
