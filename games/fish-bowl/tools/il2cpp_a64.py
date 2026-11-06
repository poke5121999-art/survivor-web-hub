# -*- coding: utf-8 -*-
"""Read FISHLIFE's game code: disassemble one IL2CPP method of libil2cpp.so (arm64) with annotations.

  py -3 -I il2cpp_a64.py FloppingFish.CalculateFishHP        # one method (all overloads)
  py -3 -I il2cpp_a64.py FloppingFish                        # every method of a class, fields first
  py -3 -I il2cpp_a64.py --fields FloppingFish               # field offsets only
  py -3 -I il2cpp_a64.py --find 'Moss|Pull'                  # method names matching a regex
  Env FL_REF (default D:/fishlife-ref). Needs `pip install capstone`.

Annotations:
  - `bl X` -> method name from Il2CppDumper's script.json (several names = COMDAT-folded bodies).
  - adrp+ldr/add -> metadata slot name (TypeInfo, Method$, string literal) or the float/double the load reads.
  - `mov wN,#imm` + `fmov sM,wN` -> the float.
  - `[xN, #off]` -> `this.<field>?` when off matches a field of the method's class (offset guess, not proof).
"""
import json, os, re, struct, sys, bisect
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM

REF = os.environ.get('FL_REF', 'D:/fishlife-ref')
SO = f'{REF}/apk/lib/arm64-v8a/libil2cpp.so'
DUMP = f'{REF}/il2cpp-dump'


def load_elf(path):
    b = open(path, 'rb').read()
    phoff, = struct.unpack_from('<Q', b, 0x20)
    phentsize, phnum = struct.unpack_from('<HH', b, 0x36)
    segs, dyn = [], None
    for i in range(phnum):
        p_type, _, p_offset, p_vaddr, _, p_filesz = struct.unpack_from('<IIQQQQ', b, phoff + i * phentsize)
        if p_type == 1:
            segs.append((p_vaddr, p_filesz, p_offset))
        elif p_type == 2:
            dyn = (p_offset, p_filesz)
    return b, segs, dyn


BIN, SEGS, DYN = load_elf(SO)


def va2off(va):
    for v, sz, off in SEGS:
        if v <= va < v + sz:
            return off + va - v
    return None


def read(va, n):
    o = va2off(va)
    return None if o is None else BIN[o:o + n]


def relocs():
    # Metadata slots in .data.rel.ro are zero on disk; R_AARCH64_RELATIVE / ABS64 entries hold their values.
    tags = {}
    for i in range(0, DYN[1], 16):
        t, v = struct.unpack_from('<qQ', BIN, DYN[0] + i)
        tags[t] = v
    rel, out = va2off(tags[7]), {}
    for i in range(0, tags[8], 24):
        off, info, add = struct.unpack_from('<QQq', BIN, rel + i)
        if info & 0xffffffff in (1027, 257):
            out[off] = add
    return out


RELOC = relocs()


def ptr(va):
    if va in RELOC:
        return RELOC[va]
    raw = read(va, 8)
    return struct.unpack('<Q', raw)[0] if raw else 0


J = json.load(open(f'{DUMP}/script.json', encoding='utf-8'))
BY_ADDR = {}
for m in J['ScriptMethod']:
    BY_ADDR.setdefault(m['Address'], []).append(m['Name'])
SLOTS = {m['Address']: m['Name'] for m in J['ScriptMetadata']}
SLOTS.update({m['Address']: m['Name'] for m in J['ScriptMetadataMethod']})
SLOTS.update({s['Address']: repr(s['Value']) for s in J['ScriptString']})
STARTS = sorted(set(J['Addresses']) | set(BY_ADDR))


def class_fields(cls):
    txt = open(f'{DUMP}/dump.cs', encoding='utf-8').read()
    out, parent = {}, None
    m = re.search(r'^(?:public |internal |private )?(?:sealed |abstract )*class ' + re.escape(cls) + r'\b(?: : (\w+))?.*?\n\{(.*?)\n\}', txt, re.M | re.S)
    if not m:
        return out
    parent = m.group(1)
    for f in re.finditer(r'^\t(?:\[.*\]\n\t)*(?:public |private |protected |internal )?(?:static |readonly |const )*([\w<>\[\], .]+?) (\w+);(?: = (.*?);)? // 0x([0-9A-F]+)', m.group(2), re.M):
        if 'static' in f.group(0).split('//')[0]:
            continue
        out[int(f.group(4), 16)] = f.group(2)
    if parent and parent not in ('MonoBehaviour', 'Object', 'Behaviour', 'Component', 'ScriptableObject'):
        for k, v in class_fields(parent).items():
            out.setdefault(k, v)
    return out


def fields_text(cls):
    txt = open(f'{DUMP}/dump.cs', encoding='utf-8').read()
    m = re.search(r'^(?:public |internal |private )?(?:sealed |abstract )*class ' + re.escape(cls) + r'\b.*?\n\{(.*?)// Methods', txt, re.M | re.S)
    return m.group(1).strip() if m else '(class not found)'


def as_float(u):
    f = struct.unpack('<f', struct.pack('<I', u & 0xffffffff))[0]
    return f if f == f and (f == 0 or 1e-4 < abs(f) < 1e7) else None


def disasm(name, fields):
    addr = [a for a, ns in BY_ADDR.items() if name in ns]
    md = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
    md.detail = True
    for a in addr:
        end = STARTS[bisect.bisect_right(STARTS, a)]
        code = read(a, min(end - a, 0x4000))
        print(f'\n=== {name} @0x{a:x} ({(end - a) // 4} ins)')
        page = {}
        wimm = {}
        this_regs = {'x0'}
        for ins in md.disasm(code, a):
            note = ''
            ops = ins.op_str
            if ins.mnemonic in ('bl', 'b') and ops.startswith('#'):
                t = int(ops[1:], 16)
                if t in BY_ADDR:
                    note = ' / '.join(BY_ADDR[t][:3])
            elif ins.mnemonic == 'adrp':
                r, imm = ops.split(', #')
                page[r] = int(imm, 16)
            elif ins.mnemonic in ('ldr', 'add', 'ldrsw', 'ldp') and '[' in ops or ins.mnemonic == 'add':
                mm = re.match(r'(\w+), \[?(\w+), #(0x[0-9a-f]+|\d+)\]?', ops)
                if mm and mm.group(2) in page:
                    va = page[mm.group(2)] + int(mm.group(3), 0)
                    if va in SLOTS:
                        note = SLOTS[va]
                    elif ptr(va) in SLOTS:
                        note = SLOTS[ptr(va)]
                    elif mm.group(1)[0] in 'sd':
                        raw = read(va, 8)
                        if raw:
                            note = '= %r' % (struct.unpack('<f', raw[:4])[0] if mm.group(1)[0] == 's' else struct.unpack('<d', raw)[0])
                    elif mm.group(1)[0] == 'q':
                        raw = read(va, 16)
                        if raw:
                            note = '= %s' % [round(x, 5) for x in struct.unpack('<4f', raw)]
                    else:
                        note = f'-> 0x{va:x}'
            if ins.mnemonic in ('mov', 'movz', 'movk') and ops.startswith('w'):
                r, _, imm = ops.partition(', #')
                try:
                    v = int(imm, 0)
                except ValueError:
                    v = None
                if v is not None:
                    if ins.mnemonic == 'movk':
                        sh = re.search(r'lsl #(\d+)', ops)
                        v = (wimm.get(r, 0) & ~(0xffff << int(sh.group(1)) if sh else 0xffff)) | (int(imm.split(',')[0], 0) << (int(sh.group(1)) if sh else 0))
                    wimm[r] = v
                    f = as_float(v)
                    if f is not None and v > 0x10000:
                        note = f'float {f!r}'
            if ins.mnemonic == 'fmov' and re.match(r's\d+, w\d+', ops):
                w = ops.split(', ')[1]
                if w in wimm:
                    note = f'= {as_float(wimm[w])!r}'
            mf = re.search(r'\[(x\d+), #(0x[0-9a-f]+)\]', ops)
            if not note and mf and mf.group(1) in this_regs and int(mf.group(2), 16) in fields:
                note = f'this.{fields[int(mf.group(2), 16)]}'
            # Track which registers still hold `this` (x0 on entry, copied by `mov xN, x0`).
            dst = ops.split(',')[0].strip()
            mv = re.fullmatch(r'(x\d+), (x\d+)', ops) if ins.mnemonic == 'mov' else None
            if ins.mnemonic in ('bl', 'blr'):
                this_regs -= {f'x{i}' for i in range(19)}
            elif mv:
                (this_regs.add if mv.group(2) in this_regs else this_regs.discard)(mv.group(1))
            elif ins.mnemonic not in ('str', 'strb', 'strh', 'stp', 'stur', 'cmp', 'cmn', 'tst', 'fcmp', 'cbz', 'cbnz', 'tbz', 'tbnz', 'b', 'ret', 'br') \
                    and not ins.mnemonic.startswith('b.'):
                this_regs.discard(dst)
                if ins.mnemonic == 'ldp':
                    this_regs.discard(ops.split(',')[1].strip())
            if ops.endswith('!') and mf:
                this_regs.discard(mf.group(1))
            if ins.mnemonic in ('bl', 'blr'):
                page = {}
            elif ins.mnemonic != 'adrp' and not ins.mnemonic.startswith(('st', 'cb', 'tb', 'cmp', 'b')):
                page.pop(dst, None)
            print(f'  {ins.address:x}: {ins.mnemonic:6} {ops}' + (f'   ; {note}' if note else ''))


def main(argv):
    if argv[:1] == ['--find']:
        rx = re.compile(argv[1])
        for ns in BY_ADDR.values():
            for n in ns:
                if rx.search(n):
                    print(n)
        return
    if argv[:1] == ['--fields']:
        print(fields_text(argv[1]))
        return
    q = argv[0]
    is_class = any(n.startswith(q + '$$') for ns in BY_ADDR.values() for n in ns)
    if not is_class:
        cls, meth = q.rsplit('.', 1)
        disasm(f'{cls}$${meth}', class_fields(cls.split('.')[-1]))
    else:
        print(fields_text(q.split('.')[-1]))
        names = sorted({n for ns in BY_ADDR.values() for n in ns if n.startswith(q + '$$')},
                       key=lambda n: min(a for a, ns in BY_ADDR.items() if n in ns))
        fl = class_fields(q.split('.')[-1])
        for n in names:
            disasm(n, fl)


if __name__ == '__main__':
    main(sys.argv[1:])
