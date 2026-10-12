# Dịch ngược một method C# của Soul Knight 8.6.0 (IL2CPP ARMv7 Thumb) — thay Il2CppDumper (bị hỏng vì .so có bảo vệ).
# Cần: decrypt_metadata.py đã chạy; pip install capstone pyelftools.
# Chạy: PYTHONIOENCODING=utf-8 python arm_method.py 'RuntimeLuaSourceLoader.DecryptSource' [-n 300]
#       python arm_method.py --find 'Decrypt'        (liệt kê "Kiểu.Method @địa chỉ")
# [ĐO] CodeRegistration VA 0xdd47268 → codeGenModules[195]; module = {name, methodPointerCount, methodPointers, ...};
#      địa chỉ method = methodPointers[(token & 0xFFFFFF) - 1] của module có tên "<image>.dll".
#      Chú thích: bl → tên method; nạp hằng qua literal pool → ô .data chứa số mã hoá (loại<<29 | chỉ số<<1 | 1),
#      loại 5 = string literal, 1/2 = kiểu, 3/6 = method.
import argparse, re, struct, sys
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB, CS_MODE_ARM
from elftools.elf.elffile import ELFFile

SO = r'D:\sk86-ref\config.armeabi_v7a\lib\armeabi-v7a\libil2cpp.so'
META = r'D:\sk86-ref\decoded\il2cpp\global-metadata.dat'
CODE_REG = 0xdd47268

d = open(SO, 'rb').read()
SECS = [(s['sh_addr'], s['sh_offset'], s['sh_size']) for s in ELFFile(open(SO, 'rb')).iter_sections()
        if s['sh_type'] != 'SHT_NOBITS' and s['sh_addr']]


def off(va):
    for a, o, n in SECS:
        if a <= va < a + n:
            return o + va - a
    return None


def u32(va):
    o = off(va)
    return struct.unpack_from('<I', d, o)[0] if o is not None else None


m = open(META, 'rb').read()
H = struct.unpack_from('<64I', m, 0)
sec = lambda i: (H[2 + 2 * i], H[3 + 2 * i])
STR = sec(2)[0]


def s(i):
    return m[STR + i:m.index(b'\0', STR + i)].decode('utf-8', 'replace')


def rows(i, size, fmt):
    o, n = sec(i)
    return [struct.unpack_from(fmt, m, o + k * size) for k in range(n // size)]


TD = rows(19, 88, '<8i8i8H2I')
METH = rows(5, 36, '<7i4H')
IMG = rows(20, 40, '<10i')
LIT = rows(0, 8, '<Ii')
LITD = sec(1)[0]


def lit(i):
    if not 0 <= i < len(LIT):
        return None
    L, idx = LIT[i]
    return m[LITD + idx:LITD + idx + L].decode('utf-8', 'replace') if L < 4096 else None


def modules():
    cnt, arr = u32(CODE_REG + 60), u32(CODE_REG + 64)
    out = {}
    for k in range(cnt):
        mod = u32(arr + 4 * k)
        p = off(u32(mod))
        raw = d[p:p + 80]
        name = raw.split(b'\0')[0]
        if not name.endswith(b'.dll'):
            name = bytes(c ^ 0x34 for c in raw).split(b'\0')[0]
        out[name.decode('ascii', 'replace')] = (u32(mod + 4), u32(mod + 8))
    return out


def build_index():
    mods = modules()
    addr, name_of = {}, {}
    for im in IMG:
        iname = s(im[0])
        if iname not in mods:
            continue
        cnt, mp = mods[iname]
        if not cnt or off(mp) is None:
            continue
        ptrs = struct.unpack_from(f'<{cnt}I', d, off(mp))
        for ti in range(im[2], im[2] + im[3]):
            t = TD[ti]
            tname = s(t[0])
            for mi in range(t[9], t[9] + t[16]):
                if mi < 0 or mi >= len(METH):
                    continue
                rid = METH[mi][6] & 0xFFFFFF
                if 0 < rid <= cnt and ptrs[rid - 1]:
                    full = f'{tname}.{s(METH[mi][0])}'
                    addr.setdefault(full, []).append(ptrs[rid - 1])
                    name_of.setdefault(ptrs[rid - 1] & ~1, full)
    return addr, name_of


def usage(v):
    if v is None or not (v & 1):
        return None
    kind, idx = v >> 29, (v & 0x1FFFFFFF) >> 1
    if kind == 5:
        t = lit(idx)
        return f'"{t}"' if t is not None else f'Literal#{idx}(mã hoá)'
    if kind in (1, 2):
        return f'Type#{idx}'
    if kind in (3, 6):
        return f'Method#{idx}'
    if kind == 4:
        return f'Field#{idx}'
    return None


def veneer(t):
    """[ĐO] bl tới đảo nhánh: movw ip,#lo; movt ip,#hi; add ip,ip,pc; bx ip → đích = (hi<<16|lo) + địa chỉ add + 8."""
    o = off(t & ~1)
    if o is None:
        return t
    w = struct.unpack_from('<4I', d, o)
    if (w[0] & 0x0FF0F000) == 0x0300C000 and (w[1] & 0x0FF0F000) == 0x0340C000 and w[3] & 0x0FFFFFFF == 0x012FFF1C:
        lo = ((w[0] >> 4) & 0xF000) | (w[0] & 0xFFF)
        hi = ((w[1] >> 4) & 0xF000) | (w[1] & 0xFFF)
        return (((hi << 16) | lo) + (t & ~1) + 8 + 8) & 0xFFFFFFFF
    return t


def disasm(va, name_of, n):
    thumb = va & 1
    va &= ~1
    md = Cs(CS_ARCH_ARM, CS_MODE_THUMB if thumb else CS_MODE_ARM)
    md.detail = False
    code = d[off(va):off(va) + n * 4 + 0x400]
    w0 = struct.unpack_from('<I', code, 0)[0]
    xored = (w0 >> 16) != 0xE92D and ((w0 ^ 0x34343434) >> 16) == 0xE92D
    if xored:  # [ĐO] hàm nhạy cảm (CryptHelper...) bị XOR 0x34 trong tệp, gỡ lúc chạy
        code = bytes(c ^ 0x34 for c in code)
        print('  (mã hàm bị XOR 0x34 — đã gỡ)')
    base_o = off(va)

    def word(a):
        if xored and va <= a < va + len(code) - 4:
            return struct.unpack_from('<I', code, a - va)[0]
        return u32(a)
    regs = {}
    count = 0
    pcadj = 4 if thumb else 8
    for ins in md.disasm(code[:n * 4], va):
        note = ''
        pc = ins.address + pcadj
        mm = re.match(r'(r\d+|ip|lr), \[pc, #(-?0x[0-9a-f]+|-?\d+)\]$', ins.op_str)
        mr = re.match(r'(r\d+|ip|lr), \[pc, (r\d+|ip)\]$', ins.op_str)
        ma = re.match(r'(r\d+|ip), pc, (r\d+|ip)$', ins.op_str) or re.match(r'(r\d+|ip), pc$', ins.op_str)
        if ins.mnemonic.startswith('ldr') and mm:
            val = word((pc & ~3 if thumb else pc) + int(mm.group(2), 0))
            regs[mm.group(1)] = val
            note = f'=0x{val:x}' if val is not None else ''
        elif ins.mnemonic == 'ldr' and mr and regs.get(mr.group(2)) is not None:
            tgt = (regs[mr.group(2)] + pc) & 0xFFFFFFFF
            v = u32(tgt)
            u = usage(v) or (usage(u32(v)) if v is not None and off(v) is not None else None)
            note = f'[0x{tgt:x}]=0x{(v or 0):x}' + (f' {u}' if u else '')
            regs[mr.group(1)] = None
        elif ins.mnemonic == 'add' and ma:
            src = ma.group(2) if ma.lastindex == 2 else ma.group(1)
            if regs.get(src) is not None:
                tgt = (regs[src] + pc) & 0xFFFFFFFF
                v = u32(tgt)
                u = usage(v)
                note = f'-> 0x{tgt:x}' + (f' {u}' if u else '')
            regs[ma.group(1)] = None
        if ins.mnemonic in ('bl', 'blx', 'b.w', 'b') and ins.op_str.startswith('#'):
            t = int(ins.op_str[1:], 0)
            v = veneer(t)
            if t & ~1 in name_of:
                note = name_of[t & ~1]
            elif v != t:
                note = f'veneer -> 0x{v:x} ' + name_of.get(v & ~1, '?')
        print(f'  {ins.address:08x}: {ins.mnemonic:8} {ins.op_str:28} {("; " + note) if note else ""}')
        count += 1
        if count >= n or (ins.mnemonic == 'pop' and 'pc' in ins.op_str and count > 8):
            break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name', nargs='?')
    ap.add_argument('--find')
    ap.add_argument('-n', type=int, default=300)
    a = ap.parse_args()
    addr, name_of = build_index()
    if a.find:
        for k, v in addr.items():
            if re.search(a.find, k):
                print(k, ' '.join(hex(x) for x in v))
        return
    for k, v in addr.items():
        if k == a.name or k.endswith('.' + a.name) or k == a.name.split('.')[-1] and False:
            for x in v:
                print(f'== {k} @ 0x{x:x}')
                disasm(x, name_of, a.n)


if __name__ == '__main__':
    main()
