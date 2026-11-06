"""Disassemble an IL2CPP method from the ARMv7 libil2cpp.so of Stickman Hook, annotated.

    py -3 -I arm_method.py PlayerHookController$$Grab
    py -3 -I arm_method.py --find 'PlayerHookController[$][$]'

Annotations: bl targets -> method names, PIC literal loads -> metadata/string names, vldr -> float values.
"""
import sys, json, re, struct, bisect, pickle, os
from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM

ROOT = r'D:/stickman-hook-ref/'
SO = open(ROOT + 'lib/libil2cpp.so', 'rb').read()
CACHE = ROOT + 'il2cpp/script.pickle'
if os.path.exists(CACHE):
    M, META = pickle.load(open(CACHE, 'rb'))
else:
    d = json.load(open(ROOT + 'il2cpp/script.json', encoding='utf-8'))
    M = sorted((m['Address'], m['Name']) for m in d['ScriptMethod'])
    META = {m['Address']: m['Name'] for m in d['ScriptMetadata']}
    META.update({m['Address']: 'Method:' + m['Name'] for m in d['ScriptMetadataMethod']})
    META.update({s['Address']: 'str:' + repr(s['Value'])[:80] for s in d['ScriptString']})
    pickle.dump((M, META), open(CACHE, 'wb'))
ADDRS = [a for a, _ in M]
BYADDR = {}
for a, n in M:
    BYADDR.setdefault(a, []).append(n)


def name_at(a):
    n = BYADDR.get(a)
    return ' | '.join(n[:2]) if n else None


def va_to_off(va):
    if va < 0x403ec30: return va
    if va < 0x4042c30 + 0x1bac88: return va - 0x4000
    return va - 0x8000


def u32(va):
    return struct.unpack_from('<I', SO, va_to_off(va))[0]


def follow(t):
    for _ in range(3):
        if name_at(t): return t
        w = u32(t)
        if (w & 0x0f000000) == 0x0a000000 and (w >> 28) == 0xe:
            off = w & 0xffffff
            if off & 0x800000: off -= 0x1000000
            t = t + 8 + off * 4
        else:
            return t
    return t


def disasm(addr, maxn=600):
    i = bisect.bisect_right(ADDRS, addr)
    end = ADDRS[i] if i < len(ADDRS) else addr + 0x400
    end = min(end, addr + maxn * 4)
    md = Cs(CS_ARCH_ARM, CS_MODE_ARM); md.detail = False
    lit = {}
    for ins in md.disasm(SO[addr:end], addr):
        note = ''
        ops = ins.op_str
        m = re.match(r'(r\d+|sb|sl|fp|ip), \[pc, #(-?0x[0-9a-f]+|-?\d+)\]$', ops)
        if ins.mnemonic == 'ldr' and m:
            lit[m.group(1)] = u32(ins.address + 8 + int(m.group(2), 0))
            note = f'=0x{lit[m.group(1)]:x}'
        m2 = re.match(r'(r\d+|sb|sl|fp|ip), \[pc, (r\d+|sb|sl|fp|ip)\]$', ops)
        if ins.mnemonic == 'ldr' and m2 and m2.group(2) in lit:
            tgt = (ins.address + 8 + lit[m2.group(2)]) & 0xffffffff
            note = META.get(tgt) or META.get(u32(tgt)) or f'@0x{tgt:x}->0x{u32(tgt):x}'
        m3 = re.match(r'(r\d+|sb|sl|fp|ip), pc, (r\d+|sb|sl|fp|ip)$', ops)
        if ins.mnemonic == 'add' and m3 and m3.group(2) in lit:
            tgt = (ins.address + 8 + lit[m3.group(2)]) & 0xffffffff
            note = META.get(tgt, f'@0x{tgt:x}')
        m4 = re.match(r'([sd]\d+), \[pc, #(-?0x[0-9a-f]+|-?\d+)\]$', ops)
        if ins.mnemonic == 'vldr' and m4:
            a = ins.address + 8 + int(m4.group(2), 0)
            if m4.group(1)[0] == 's':
                note = '%g' % struct.unpack_from('<f', SO, va_to_off(a))[0]
            else:
                note = '%g' % struct.unpack_from('<d', SO, va_to_off(a))[0]
        if ins.mnemonic in ('bl', 'blx', 'b') and ops.startswith('#'):
            t = follow(int(ops[1:], 0))
            n = name_at(t)
            if not n:
                j = bisect.bisect_right(ADDRS, t) - 1
                n = f'~{BYADDR[ADDRS[j]][0]}+0x{t-ADDRS[j]:x}' if j >= 0 else None
            if n: note = n
        m5 = re.match(r'(r\d+), #(0x[0-9a-f]+|\d+)$', ops)
        if ins.mnemonic in ('mov', 'movw') and m5:
            v = int(m5.group(2), 0)
            if v > 0x1000000:
                note = 'f=%g' % struct.unpack('<f', struct.pack('<I', v))[0]
        if ins.mnemonic == 'movt':
            pass
        print(f'{ins.address:08x}  {ins.mnemonic:8s} {ops:40s} {(";  " + note) if note else ""}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == '--find':
        for ad, n in M:
            if re.search(a[1], n): print(hex(ad), n)
    else:
        for ad, n in M:
            if n == a[0] or re.fullmatch(a[0], n):
                print('====', n, hex(ad)); disasm(ad)
