# -*- coding: utf-8 -*-
"""Đọc mã gốc Soul Knight 8.6 (IL2CPP, libil2cpp.so ARMv7 armeabi-v7a, dump từ bộ nhớ — xem config86/README.md mục 8).

Cách dùng (Python 3.8, cần capstone 5 + numpy; đặt PYTHONIOENCODING=utf-8):

    python sk_method.py C28Controller.RoleSkill                    # dịch ngược mọi overload
    python sk_method.py 'SwordMasterFlySword.<BulletMove>d__21.MoveNext'   # method của lớp lồng (coroutine, lambda)
    python sk_method.py --find 'C28Controller\\.Skill2'            # tìm method theo regex trên "Kiểu.Method"
    python sk_method.py --type 'SwordMaster'                       # tìm kiểu theo regex
    python sk_method.py --fields C28Controller                     # trường + offset + const + chuỗi lớp cha
    python sk_method.py --xref C28Controller.StopSkill              # ai gọi (BL/BLX/B), và ai nạp Method(...) của nó
    python sk_method.py --strref 'C28QuantumPulse'                 # method nào dùng string literal khớp regex
    python sk_method.py --addr 0xA72B6938                          # địa chỉ (VA hoặc RVA) thuộc method nào
    Tuỳ chọn: -n 2000 (số lệnh tối đa mỗi hàm), --raw (không chú thích), --rebuild (dựng lại cache).

Nguồn (ngoài git, đặt khác bằng SK86_REF=<thư mục>):
  runtime/libil2cpp_mem.so  — ba vùng của libil2cpp.so ghép theo địa chỉ ảo, gốc VA 0xA170A000; offset tệp = RVA.
  runtime/dump/dump.cs, script.json — Il2CppDumper 6.7.46. runtime/global-metadata.dat — metadata đã giải.
  config.armeabi_v7a/lib/armeabi-v7a/libil2cpp.so — .so gốc của APK, để giải ~26k ô metadata mà script.json thiếu tên.
  Cache ở work/sk_method/index.pkl. Trên Windows gọi thẳng python.exe của pyenv (shim .bat nuốt dấu < > trong tên).

Chú thích:
  - `bl/blx/b` tới hàm đã biết → tên method; hàm runtime il2cpp hay gặp → tên đoán (xem RUNTIME).
  - Nạp literal pool `ldr rX,[pc,#]`, `vldr s/d,[pc,#]`, `movw/movt` → giá trị; in float khi trông giống float.
  - Idiom PIC `ldr rX,[pc,#lit]` + `ldr rX,[pc,rX]` / `add rX,pc,rX` → ô metadata usage:
    `TypeInfo(X)`, `Il2CppType(X)`, `Method(X.M())`, `Field(X.f)`, `"literal"` (tên theo script.json).
  - `[rN,#off]` khi rN là this / đối tượng đã biết kiểu → `this.<trường>?` (đoán theo offset, gồm lớp cha).
    TypeInfo(X) rồi `[r,#0x5c]` → static_fields của X; `[klass,#0xc0+8k]` → gọi ảo slot k (tên theo Slot của dump.cs).
Giới hạn: đọc tuyến tính, không theo nhánh — trạng thái thanh ghi có thể sai sau điểm hợp nhánh; offset trường
của struct trong dump.cs tính cả header 8 byte (truy cập qua con trỏ struct thì trừ 8, tool không tự trừ).
"""
import os, re, sys, struct, pickle, bisect, argparse, json, time

REF = os.environ.get('SK86_REF', r'D:/sk86-ref')
MEM = os.path.join(REF, 'runtime', 'libil2cpp_mem.so')
META_RT = os.path.join(REF, 'runtime', 'global-metadata.dat')   # metadata đã giải mã (từ bộ nhớ)
SO_DISK = os.path.join(REF, 'config.armeabi_v7a', 'lib', 'armeabi-v7a', 'libil2cpp.so')   # .so gốc trong APK
META_REG = 0xDFE1B3C   # Il2CppMetadataRegistration (config86/README mục 5)
DUMP = os.path.join(REF, 'runtime', 'dump')
CACHE_DIR = os.path.join(REF, 'work', 'sk_method')
CACHE = os.path.join(CACHE_DIR, 'index.pkl')
BASE = 0xA170A000
CACHE_VER = 10

# Hàm runtime il2cpp không có tên trong script.json (RVA sau khi đi qua thunk). [ĐO] đặt tên theo ngữ cảnh gọi
# trên bản 8.6 này; tên có '?' là đoán yếu hơn.
RUNTIME = {
    0xA45FAC0C - 0xA170A000: 'il2cpp_codegen_initialize_runtime_metadata',   # đầu hàm: nạp ô metadata rồi đặt cờ
    0xA45C6640 - 0xA170A000: 'ThrowNullReferenceException',                  # sau cmp rX,#0
    0xA4582984 - 0xA170A000: 'il2cpp_runtime_class_init',                    # khi klass->cctor_finished (@0x74) = 0
    0xA4554500 - 0xA170A000: 'WriteBarrier(&field, value)',                  # sau str rX,[rY,#off]!
    0xA45C66A4 - 0xA170A000: 'ThrowIndexOutOfRangeException',               # sau cmp với độ dài mảng
    0xA45B3854 - 0xA170A000: 'il2cpp_codegen_object_new(klass)',
    0xA45B3478 - 0xA170A000: 'Box(klass, &value)',
    0xA45B2DF4 - 0xA170A000: 'SZArrayNew(klass, length)',
    0xA45B3740 - 0xA170A000: 'IsInst(obj, klass)',
    0xA45FAD78 - 0xA170A000: 'il2cpp_codegen_raise_exception',
    0xA45C65B4 - 0xA170A000: 'rethrow?',
    0xA45FBD94 - 0xA170A000: 'Class::Init?',                                 # khi bit 0 của klass+0xbd = 0
    0xA45FBDF0 - 0xA170A000: 'InitMethodRgctx?',                             # khi MethodInfo+0x1c = 0
    0xA45FBE80 - 0xA170A000: 'GetInterfaceInvokeData?',                      # sau vòng dò interfaceOffsets
    0xA45C7A38 - 0xA170A000: 'ArrayTypeMismatchException?',
}

# 32-bit Il2CppClass: static_fields @0x5c, cctor_finished @0x74, vtable @0xc0, mỗi VirtualInvokeData 8 byte (methodPtr, method).
KLASS_STATIC = 0x5C
KLASS_VTABLE = 0xC0   # [ĐO] il2cpp.h cộng ra 0xBC nhưng RoleSkill gọi slot 127 (RoleSkillEnd) qua [klass,#0x4b8]


def log(*a):
    print(*a, file=sys.stderr)


# ---------------------------------------------------------------- dựng cache

TYPE_RX = re.compile(r'^(?:\[.*?\] )?((?:[a-z]+ )*)(class|struct|enum|interface) (.+?)(?: : (.+?))? // TypeDefIndex: (\d+)$')
FIELD_RX = re.compile(r'^\t((?:(?:public|private|protected|internal|static|readonly|const|volatile|new|fixed) )*)(.+?) ([^ ]+?)(?: = (.*?))?; ?(?:// (0x[0-9A-F]+))?$')
RVA_RX = re.compile(r'^\t// RVA: (0x[0-9A-F]+|-1) Offset: \S+(?: VA: \S+)?(?: Slot: (\d+))?')
METH_RX = re.compile(r'^\t(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|extern|new|unsafe) )*(.+?) ([^ (]+(?:<[^(]*>)?)\((.*)\) \{ \}$')
GINST_RX = re.compile(r'^\t\|-RVA: (0x[0-9A-F]+)')
GINST_NAME_RX = re.compile(r'^\t\|-(.+)$')


def parse_dump():
    types = []   # dict(name, ns, kind, parent, tdi, fields[(name,type,off,static,const,val)], methods[(name,sig,rva,slot)])
    ginst = []   # (rva, 'Kiểu<..>.Method')
    ns = ''
    cur = None
    pend = None   # (rva, slot) của method sắp tới
    in_ginst = False
    last_ginst_rva = None
    t0 = time.time()
    with open(os.path.join(DUMP, 'dump.cs'), encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('\n')
            if in_ginst:
                if line.startswith('\t*/'):
                    in_ginst = False
                    continue
                m = GINST_RX.match(line)
                if m:
                    last_ginst_rva = int(m.group(1), 16)
                    continue
                m = GINST_NAME_RX.match(line)
                if m and last_ginst_rva is not None:
                    ginst.append((last_ginst_rva, m.group(1)))
                    last_ginst_rva = None
                continue
            if not line:
                continue
            c0 = line[0]
            if c0 == '/':
                if line.startswith('// Namespace: '):
                    ns = line[14:].strip()
                continue
            if c0 != '\t':
                if c0 in '{}':
                    if c0 == '}':
                        cur = None
                    continue
                m = TYPE_RX.match(line)
                if m:
                    mods, kind, name, bases, tdi = m.groups()
                    parent = None
                    if bases and kind == 'class':
                        b0 = split_top(bases)[0]
                        if not b0.startswith('I') or not (len(b0) > 1 and b0[1].isupper()):
                            parent = b0
                    elif kind == 'struct':
                        parent = 'ValueType'
                    cur = dict(name=name, ns=ns, kind=kind, parent=parent, tdi=int(tdi), fields=[], methods=[],
                               static=('static' in mods))
                    types.append(cur)
                continue
            if cur is None:
                continue
            if line.startswith('\t// RVA:'):
                m = RVA_RX.match(line)
                if m:
                    pend = (None if m.group(1) == '-1' else int(m.group(1), 16), int(m.group(2)) if m.group(2) else None)
                continue
            if line.startswith('\t/* GenericInstMethod'):
                in_ginst = True
                continue
            if line.startswith('\t//') or line.startswith('\t['):
                continue
            if pend is not None and line.endswith('{ }'):
                m = METH_RX.match(line)
                if m:
                    ret, mn, args = m.groups()
                    cur['methods'].append((mn, line.strip()[:-4], pend[0], pend[1]))
                pend = None
                continue
            if '{ get' in line or '{ set' in line:
                continue   # property
            m = FIELD_RX.match(re.sub(r' /\*Metadata offset 0x[0-9A-F]+\*/', '', line))
            if m and '(' not in m.group(2):
                mods, ft, fn, val, off = m.groups()
                cur['fields'].append((fn, ft, int(off, 16) if off else None, 'static' in mods, 'const' in mods, val))
    log('  dump.cs: %d kiểu, %d method generic, %.1fs' % (len(types), len(ginst), time.time() - t0))
    return types, ginst


def split_top(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '<':
            depth += 1
        elif ch == '>':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur.strip())
            cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def parse_script():
    t0 = time.time()
    d = json.load(open(os.path.join(DUMP, 'script.json'), encoding='utf-8'))
    smeth = {}
    for e in d['ScriptMethod']:
        smeth.setdefault(e['Address'], []).append(e['Name'].replace('$$', '.'))
    slots = {}
    for e in d['ScriptMetadata']:
        n, sig = e['Name'], e['Signature']
        if n.startswith('Field$'):
            lab = 'Field(%s)' % n[6:]
        elif n.endswith('_TypeInfo'):
            lab = 'TypeInfo(%s)' % n[:-9]
        elif n.endswith('_var'):
            lab = 'Il2CppType(%s)' % n[:-4]
        else:
            lab = n
        slots[e['Address']] = lab
    for e in d['ScriptMetadataMethod']:
        n = e['Name']
        slots[e['Address']] = 'Method(%s)' % (n[7:] if n.startswith('Method$') else n)
    strs = {}
    for e in d['ScriptString']:
        strs[e['Address']] = e['Value']
    starts = set(d['Addresses']) | set(smeth)
    log('  script.json: %d method, %d ô metadata, %d chuỗi, %.1fs' % (len(smeth), len(slots), len(strs), time.time() - t0))
    return smeth, slots, strs, starts


def strip_gen(n):
    """'Action<T1, T2>' → 'Action'; giữ nguyên tên sinh tự động kiểu 'A.<Foo>d__3', 'A.<>c'."""
    if not n.endswith('>'):
        return n
    depth = 0
    for i in range(len(n) - 1, -1, -1):
        depth += {'>': 1, '<': -1}.get(n[i], 0)
        if depth == 0:
            return n[:i] if i > 0 and n[i - 1] not in '.' else n
    return n


def fix_nested_ns(types):
    """dump.cs ghi lớp lồng với '// Namespace: ' rỗng; lấy namespace của lớp ngoài (cùng tên, TypeDefIndex gần nhất)."""
    by = {}
    for t in types:
        by.setdefault(strip_gen(t['name']), []).append(t)
    for t in types:
        if t['ns'] or '.' not in t['name']:
            continue
        outer = strip_gen(t['name'].split('.')[0])
        c = [o for o in by.get(outer, []) if o['ns'] or '.' not in o['name']]
        if c:
            o = min(c, key=lambda o: abs(o['tdi'] - t['tdi']))
            t['ns'] = o['ns']


PRIM = {1: 'void', 2: 'bool', 3: 'char', 4: 'sbyte', 5: 'byte', 6: 'short', 7: 'ushort', 8: 'int', 9: 'uint',
        0xA: 'long', 0xB: 'ulong', 0xC: 'float', 0xD: 'double', 0xE: 'string', 0x16: 'TypedReference',
        0x18: 'IntPtr', 0x19: 'UIntPtr', 0x1C: 'object'}


def decode_resolved_slots(types, slots, strs):
    """[ĐO] Ô metadata usage mà game đã dùng trước lúc dump chứa con trỏ heap, Il2CppDumper bỏ qua.
    Giá trị mã hoá gốc (loại<<29 | chỉ số<<1 | 1) vẫn nằm ở cùng RVA trong .so gốc của APK → tự giải:
    1 TypeInfo, 2 Il2CppType (chỉ số kiểu), 3 MethodDef, 4 FieldInfo / 7 FieldRva (fieldRef), 5 literal, 6 MethodSpec."""
    mm = open(MEM, 'rb').read()
    dk = open(SO_DISK, 'rb').read()
    me = open(META_RT, 'rb').read()
    ph, pn = struct.unpack_from('<I', dk, 0x1C)[0], struct.unpack_from('<H', dk, 0x2C)[0]
    segs = []
    for i in range(pn):
        p = struct.unpack_from('<8I', dk, ph + 32 * i)
        if p[0] == 1:
            segs.append((p[2], p[1], p[4]))

    def du(r):   # word ở RVA r trong .so gốc (con trỏ ở đây là RVA, chưa relocate)
        if r is None:
            return None
        for va, o, n in segs:
            if va <= r < va + n:
                return struct.unpack_from('<I', dk, o + r - va)[0]
        return None

    def mu(r):
        return struct.unpack_from('<I', mm, r)[0] if r is not None and 0 <= r <= len(mm) - 4 else None

    def pm(r):   # con trỏ đọc từ ảnh bộ nhớ (VA) → RVA. Bảng ở .rodata của .so gốc bị che một phần, bộ nhớ thì sạch.
        v = mu(r)
        return v - BASE if v and v >= BASE else None

    H = struct.unpack_from('<64I', me, 0)

    def sec(i):
        return H[2 + 2 * i], H[3 + 2 * i]

    def mstr(i):
        o = sec(2)[0] + i
        return me[o:me.index(b'\0', o)].decode('utf-8', 'replace')

    def lit(i):
        o, n = sec(0)
        if not 0 <= i < n // 8:
            return None
        L, di = struct.unpack_from('<Ii', me, o + 8 * i)
        return me[sec(1)[0] + di:sec(1)[0] + di + L].decode('utf-8', 'replace')

    def mdef(i):
        o, n = sec(5)
        if i is None or not 0 <= i < n // 36:
            return None
        r = struct.unpack_from('<7i4H', me, o + 36 * i)
        return r[1], mstr(r[0])   # (TypeDefIndex lớp chứa, tên)

    def fref(i):
        o, n = sec(22)
        return struct.unpack_from('<ii', me, o + 8 * i) if 0 <= i < n // 8 else None

    def gparam(i):
        o, n = sec(12)
        return mstr(struct.unpack_from('<iiHHHH', me, o + 16 * i)[1]) if 0 <= i < n // 16 else 'T?'

    tdi2t = {t['tdi']: t for t in types}

    def tdfull(tdi):
        t = tdi2t.get(tdi)
        if not t:
            return 'TypeDef#%s' % tdi
        return (t['ns'] + '.' if t['ns'] else '') + strip_gen(t['name'])

    types_arr = pm(META_REG + 0x1C)
    specs_arr = pm(META_REG + 0x24)
    insts_arr = pm(META_REG + 0x0C)

    def tname(ptr, short=False, depth=0):
        """Il2CppType* (RVA trong .so gốc) → tên C#."""
        if not ptr or depth > 12:
            return '?'
        bits = mu(ptr + 4)
        if not bits or not (bits >> 16) & 0xFF:   # vài Il2CppType trong ảnh bộ nhớ bằng 0 → lấy bản .so gốc
            bits = du(ptr + 4)
        if bits is None:
            return '?'
        k = (bits >> 16) & 0xFF
        # lớp/struct: bộ nhớ đã thay chỉ số TypeDef bằng con trỏ vào metadata → lấy chỉ số từ .so gốc
        data = du(ptr) if k in (0x11, 0x12, 0x13, 0x1E) else (pm(ptr) or du(ptr))
        if k in PRIM:
            return PRIM[k]
        if k in (0x11, 0x12):
            if short:
                t = tdi2t.get(data)
                return strip_gen(t['name']) if t else '?'
            return tdfull(data)
        if k == 0x1D:
            return tname(data, short, depth + 1) + '[]'
        if k == 0x14:
            return tname(pm(data), True, depth + 1) + '[,]'
        if k == 0x0F:
            return tname(data, True, depth + 1) + '*'
        if k in (0x13, 0x1E):
            return gparam(data)
        if k == 0x15:   # Il2CppGenericClass {type, class_inst, method_inst, cached_class}
            return tname(pm(data), short, depth + 1) + '<' + ginst(pm(data + 4), depth + 1) + '>'
        return 'Type(0x%x)' % k

    def ginst(p, depth=0):
        if not p:
            return ''
        n, argv = mu(p), pm(p + 4)
        if n is None or n > 32 or argv is None:
            return '?'
        return ', '.join(tname(pm(argv + 4 * j), True, depth + 1) for j in range(n))

    def typeidx(i):
        return tname(pm(types_arr + 4 * i))

    lo, hi = min(slots), max(slots)
    for a in range(lo, hi + 4, 4):
        if a in slots or a in strs:
            continue
        mv = mu(a)
        v = du(a)
        if v is None or mv == v or not (v & 1):
            continue
        kind, idx = v >> 29, (v & 0x1FFFFFFF) >> 1
        try:
            if kind == 1:
                slots[a] = 'TypeInfo(%s)' % typeidx(idx)
            elif kind == 2:
                slots[a] = 'Il2CppType(%s)' % typeidx(idx)
            elif kind == 3:
                r = mdef(idx)
                if r:
                    slots[a] = 'Method(%s.%s())' % (tdfull(r[0]), r[1])
            elif kind in (4, 7):
                fr = fref(idx)
                if fr:
                    p = pm(types_arr + 4 * fr[0])
                    tdi = du(p) if p else None
                    t = tdi2t.get(tdi)
                    fn = t['fields'][fr[1]][0] if t and fr[1] < len(t['fields']) else '#%d' % fr[1]
                    slots[a] = '%s(%s.%s)' % ('Field' if kind == 4 else 'FieldRva', tdfull(tdi) if t else '?', fn)
            elif kind == 5:
                s_ = lit(idx)
                if s_ is not None:
                    strs[a] = s_
            elif kind == 6:
                md_, ci, mi = mu(specs_arr + 12 * idx), mu(specs_arr + 12 * idx + 4), mu(specs_arr + 12 * idx + 8)
                r = mdef(md_)
                if r:
                    cls = tdfull(r[0])
                    if ci is not None and ci != 0xFFFFFFFF:
                        cls += '<' + ginst(pm(insts_arr + 4 * ci)) + '>'
                    mname = r[1]
                    if mi is not None and mi != 0xFFFFFFFF:
                        mname += '<' + ginst(pm(insts_arr + 4 * mi)) + '>'
                    slots[a] = 'Method(%s.%s())' % (cls, mname)
        except Exception:
            continue


def build():
    log('dựng cache (chỉ lần đầu, ~1 phút)...')
    types, ginst = parse_dump()
    fix_nested_ns(types)
    smeth, slots, strs, starts = parse_script()
    try:
        n0 = len(slots) + len(strs)
        decode_resolved_slots(types, slots, strs)
        log('  ô metadata đã resolve lúc dump, giải lại từ .so gốc: +%d' % (len(slots) + len(strs) - n0))
    except Exception as e:   # thiếu .so gốc thì chỉ còn tên từ script.json
        log('  ! không giải được ô đã resolve (%s: %s)' % (type(e).__name__, e))
    rva2m = {}
    for ti, t in enumerate(types):
        for k, (mn, sig, rva, slot) in enumerate(t['methods']):
            if rva:
                rva2m.setdefault(rva, []).append((ti, k))
                starts.add(rva)
    for rva, n in ginst:
        starts.add(rva)
    idx = dict(types=types, ginst=ginst, smeth=smeth, slots=slots, strs=strs, starts=sorted(starts), rva2m=rva2m,
               plt=parse_plt(), ver=CACHE_VER)
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(CACHE, 'wb') as f:
        pickle.dump(idx, f, protocol=pickle.HIGHEST_PROTOCOL)
    return idx


def load(rebuild=False):
    if not rebuild and os.path.exists(CACHE):
        try:
            with open(CACHE, 'rb') as f:
                idx = pickle.load(f)
            if idx.get('ver') == CACHE_VER:
                return idx
        except Exception:
            pass
    return build()


IDX = None
MEMB = None


def mem():
    global MEMB
    if MEMB is None:
        with open(MEM, 'rb') as f:
            MEMB = f.read()
    return MEMB


def u32(rva):
    b = mem()
    if 0 <= rva <= len(b) - 4:
        return struct.unpack_from('<I', b, rva)[0]
    return None


def to_rva(a):
    return a - BASE if a >= BASE else a


# ---------------------------------------------------------------- tra tên

_tcache = {}


def tfull(ti):
    t = IDX['types'][ti]
    return (t['ns'] + '.' if t['ns'] else '') + t['name']


def type_by_short():
    if 'short' not in _tcache:
        m = {}
        for ti, t in enumerate(IDX['types']):
            n = t['name']
            m.setdefault(n, []).append(ti)
            b = re.sub(r'<.*', '', n)   # List<T> → List
            if b != n:
                m.setdefault(b, []).append(ti)
            if '.' in n:   # lớp lồng: cho cả tên cuối
                m.setdefault(n.rsplit('.', 1)[1], []).append(ti)
        _tcache['short'] = m
    return _tcache['short']


def match_types(name):
    """Kiểu khớp name: tên đủ (ns.name), tên dump.cs, hoặc tên cuối."""
    sh = type_by_short()
    out = [ti for ti in sh.get(name, []) if IDX['types'][ti]['name'] == name]
    if not out:
        out = [ti for ti in range(len(IDX['types'])) if tfull(ti) == name]
    if not out:
        out = sh.get(name, [])
    return sorted(set(out))


def resolve_type_ref(tname, ctx_ti=None):
    """Tên kiểu như viết trong dump.cs (trường/cha) → typeDef index, ưu tiên cùng namespace."""
    if not tname:
        return None
    base = re.sub(r'<.*', '', tname).rstrip('[]')
    if tname.endswith(']'):
        return None
    cands = type_by_short().get(tname) or type_by_short().get(base) or []
    if not cands:
        return None
    if ctx_ti is not None and len(cands) > 1:
        ns = IDX['types'][ctx_ti]['ns']
        same = [c for c in cands if IDX['types'][c]['ns'] == ns]
        if same:
            return same[0]
        cls = [c for c in cands if IDX['types'][c]['kind'] == 'class']
        if cls:
            return cls[0]
    return cands[0]


def parent_of(ti):
    t = IDX['types'][ti]
    if not t['parent']:
        return None
    p = resolve_type_ref(t['parent'], ti)
    return p if p != ti else None


def chain(ti):
    out, seen = [], set()
    while ti is not None and ti not in seen and len(out) < 16:
        seen.add(ti)
        out.append(ti)
        ti = parent_of(ti)
    return out


def inst_fields(ti):
    key = ('if', ti)
    if key not in _tcache:
        m = {}
        for t in chain(ti):
            for fn, ft, off, st, cst, val in IDX['types'][t]['fields']:
                if off is not None and not st and not cst:
                    m.setdefault(off, (fn, ft, t))
        _tcache[key] = m
    return _tcache[key]


def static_fields(ti):
    key = ('sf', ti)
    if key not in _tcache:
        m = {}
        for fn, ft, off, st, cst, val in IDX['types'][ti]['fields']:
            if off is not None and st:
                m.setdefault(off, (fn, ft, ti))
        _tcache[key] = m
    return _tcache[key]


def vslot_name(ti, slot):
    for t in chain(ti):
        for mn, sig, rva, s in IDX['types'][t]['methods']:
            if s == slot:
                return '%s.%s' % (IDX['types'][t]['name'], mn)
    return None


def mdisp(ti, k):
    return '%s.%s' % (IDX['types'][ti]['name'], IDX['types'][ti]['methods'][k][0])


def name_at(rva, maxn=3):
    ms = IDX['rva2m'].get(rva)
    if ms:
        s = ' / '.join(mdisp(ti, k) for ti, k in ms[:maxn])
        return s + (' (+%d)' % (len(ms) - maxn) if len(ms) > maxn else '')
    sm = IDX['smeth'].get(rva)
    if sm:
        return ' / '.join(sm[:maxn]) + (' (+%d)' % (len(sm) - maxn) if len(sm) > maxn else '')
    if rva in RUNTIME:
        return RUNTIME[rva]
    pl = plt_name(rva)
    if pl:
        return pl + '@plt'
    return None


def plt_name(rva):
    """Stub PLT ARM: add ip,pc,#a ; add ip,ip,#b ; ldr pc,[ip,#c]! → ô GOT → tên hàm nhập (memcpy, sinf, __cxa_throw...)."""
    w = [u32(rva + 4 * k) or 0 for k in range(3)]
    if (w[0] & 0xFFFFF000) != 0xE28FC000 or (w[1] & 0xFFFFF000) != 0xE28CC000 or (w[2] & 0xFFFFF000) != 0xE5BCF000:
        return None

    def imm(x):
        r = 2 * ((x >> 8) & 0xF)
        v = x & 0xFF
        return ((v >> r) | (v << (32 - r))) & 0xFFFFFFFF if r else v
    got = (rva + 8 + imm(w[0]) + imm(w[1]) + (w[2] & 0xFFF)) & 0xFFFFFFFF
    return IDX.get('plt', {}).get(got)


def parse_plt():
    """Bảng JMPREL của ELF (đọc từ ảnh bộ nhớ): ô GOT → tên ký hiệu nhập."""
    b = mem()
    ph, pn = struct.unpack_from('<I', b, 0x1C)[0], struct.unpack_from('<H', b, 0x2C)[0]
    dyn = None
    for i in range(pn):
        p = struct.unpack_from('<8I', b, ph + 32 * i)
        if p[0] == 2:
            dyn = p[2]
    d, o = {}, dyn
    while dyn is not None:
        tag, val = struct.unpack_from('<iI', b, o)
        o += 8
        if tag == 0:
            break
        d.setdefault(tag, val)
    out = {}
    if not all(k in d for k in (23, 2, 6, 5)):
        return out
    for k in range(d[2] // 8):
        off, info = struct.unpack_from('<II', b, d[23] + 8 * k)
        nm = struct.unpack_from('<I', b, d[6] + 16 * (info >> 8))[0]
        out[off] = b[d[5] + nm:b.index(b'\0', d[5] + nm)].decode('ascii', 'replace')
    return out


def data_label(rva):
    s = IDX['slots'].get(rva)
    if s:
        return s
    if rva in IDX['strs']:
        return json.dumps(IDX['strs'][rva], ensure_ascii=False)[:120]
    return None


def containing(rva):
    st = IDX['starts']
    j = bisect.bisect_right(st, rva) - 1
    return st[j] if j >= 0 else None


def next_start(rva):
    st = IDX['starts']
    j = bisect.bisect_right(st, rva)
    return st[j] if j < len(st) else rva + 4 * 4000


def all_methods():
    for ti, t in enumerate(IDX['types']):
        for k, m in enumerate(t['methods']):
            yield ti, k, '%s.%s' % (t['name'], m[0])


def resolve(spec):
    """'Kiểu.Method' (Kiểu có thể là tên lồng 'A.<B>d__1', có/không namespace) → [(ti, k)]."""
    out = []
    for i in range(len(spec)):
        if spec[i] != '.' or i == 0:
            continue
        tn, mn = spec[:i], spec[i + 1:]
        for ti in match_types(tn):
            for k, m in enumerate(IDX['types'][ti]['methods']):
                if m[0] == mn or re.sub(r'<.*', '', m[0]) == mn:
                    out.append((ti, k))
        if out:
            break
    return out


# ---------------------------------------------------------------- dịch ngược

def looks_float(x):
    if x is None or x == 0:
        return None
    e = (x >> 23) & 0xFF
    if not (0x70 <= e <= 0x90):   # |f| khoảng 2^-15 .. 2^17
        return None
    f = struct.unpack('<f', struct.pack('<I', x))[0]
    r = round(f, 4)
    return f if abs(f - r) < 1e-6 * max(1, abs(f)) else None


def fmtf(f):
    return ('%.6g' % f)


CONDS = ('eq', 'ne', 'cs', 'hs', 'cc', 'lo', 'mi', 'pl', 'vs', 'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le', 'al')


def strip_cond(m):
    m = m.split('.')[0]
    if len(m) > 2 and m[-2:] in CONDS and m[:-2] in ('b', 'bl', 'blx', 'bx', 'ldr', 'str', 'mov', 'movw', 'movt', 'add',
                                                      'sub', 'pop', 'push', 'ldrb', 'strb', 'ldrh', 'strh', 'vldr',
                                                      'vstr', 'vmov', 'mvn', 'cmp', 'ldrd', 'strd', 'orr', 'and', 'eor'):
        return m[:-2]
    return m


def follow_thunk(rva, depth=0):
    """Veneer của linker: `b X` hoặc `movw ip; movt ip; add ip, ip, pc; bx ip` → đích thật (RVA)."""
    if depth > 4 or rva in IDX['rva2m'] or rva in IDX['smeth']:
        return rva
    w = [u32(rva + 4 * k) or 0 for k in range(4)]
    if w[0] >> 24 == 0xEA:   # b (AL)
        off = w[0] & 0xFFFFFF
        off = off - (1 << 24) if off >= 1 << 23 else off
        return follow_thunk(rva + 8 + 4 * off, depth + 1)
    # movw ip,#lo (e30cXXXX) ; movt ip,#hi (e34cXXXX) ; add ip,ip,pc (e08cc00f) ; bx ip (e12fff1c)
    if (w[0] & 0xFFF0F000) == 0xE300C000 and (w[1] & 0xFFF0F000) == 0xE340C000 and w[2] == 0xE08CC00F and w[3] == 0xE12FFF1C:
        lo = ((w[0] >> 4) & 0xF000) | (w[0] & 0xFFF)
        hi = ((w[1] >> 4) & 0xF000) | (w[1] & 0xFFF)
        return follow_thunk((rva + 8 + 8 + ((hi << 16) | lo)) & 0xFFFFFFFF, depth + 1)
    return rva


def is_arm(rva):
    """ARM hay Thumb. [ĐO] word đầu mang điều kiện AL (0xE hoặc 0xF của NEON) và giải được ở chế độ ARM → ARM; hàm ngắn có lệnh
    điều kiện/literal pool ngay sau thì luật "3/4 word đầu là AL" trượt (1765 hàm), nên chỉ xét word đầu + 2/4."""
    if rva & 1:
        return False
    ws = [(u32(rva + 4 * k) or 0) for k in range(4)]
    if ws[0] >> 28 in (0xE, 0xF):   # 0xF = lệnh NEON không điều kiện (vmov.i32, vst1...)
        from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM
        if next(Cs(CS_ARCH_ARM, CS_MODE_ARM).disasm(mem()[rva:rva + 4], rva, 1), None) is not None:
            return True
    return sum(1 for w in ws if w >> 28 == 0xE) >= 2


REG_RX = re.compile(r'^(r\d+|sb|sl|fp|ip|lr|sp|s\d+|d\d+)$')
ALIAS = {'sb': 'r9', 'sl': 'r10', 'fp': 'r11', 'ip': 'r12'}
MEM_RX = re.compile(r'\[(\w+)(?:, #(-?0x[0-9a-f]+|-?\d+))?\]')


def rn(r):
    return ALIAS.get(r, r)


def parse_imm(s):
    s = s.strip().lstrip('#')
    return int(s, 16) if s.lstrip('-').startswith('0x') else int(s)


def disasm(ti, k, n=600, raw=False, out=print):
    from capstone import Cs, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_THUMB
    t = IDX['types'][ti]
    mn, sig, rva, slot = t['methods'][k]
    out('=' * 100)
    out('%s  ::  %s' % (tfull(ti), sig))
    if not rva:
        out('  (không có thân: abstract/extern/generic chưa gắn)')
        return
    end = next_start(rva)
    arm = is_arm(rva)
    others = [x for x in IDX['rva2m'].get(rva, []) if x != (ti, k)]
    out('  RVA 0x%X  VA 0x%X  %s  %d byte%s%s' % (rva, rva + BASE, 'ARM' if arm else 'THUMB', end - rva,
                                               ('  slot %d' % slot) if slot is not None else '',
                                               ('  (cùng thân: %s)' % ', '.join(mdisp(*x) for x in others[:3])) if others else ''))
    md = Cs(CS_ARCH_ARM, CS_MODE_ARM if arm else CS_MODE_THUMB)
    b = mem()
    regs = {} if 'static ' in sig.split('(')[0] else {'r0': ('this', ti)}
    lits = set()
    last_cmp = None
    addr = rva
    cnt = 0
    while addr < end and cnt < n:
        cnt += 1
        if addr in lits:
            w = u32(addr)
            note = ''
            f = looks_float(w)
            if f is not None:
                note = 'float %s' % fmtf(f)
            out('  %08x:  .word    0x%08x%s' % (addr + BASE, w, ('   ; ' + note) if note else ''))
            addr += 4
            continue
        ins = next(md.disasm(b[addr:addr + 4], addr + BASE, 1), None)
        if ins is None:
            out('  %08x:  .word    0x%08x' % (addr + BASE, u32(addr)))
            addr += 4 if arm else 2
            continue
        note = ''
        if not raw:
            note = annotate(ins, arm, regs, lits, ti)
        out('  %08x:  %-8s %-40s%s' % (ins.address, ins.mnemonic, ins.op_str, ('; ' + note) if note else ''))
        addr += ins.size
        mc = re.match(r'cmp (\w+), #(0x[0-9a-f]+|\d+)$', ins.mnemonic + ' ' + ins.op_str)
        if mc:
            last_cmp = parse_imm(mc.group(2))
        elif arm and ins.mnemonic == 'add' and ins.op_str.startswith('pc, ') and last_cmp is not None and last_cmp < 512:
            # switch của clang: add rT, pc, #8 ; ldr rI, [rT, rI, lsl #2] ; add pc, rT, rI ; <bảng offset tương đối>
            tb = addr
            for k in range(last_cmp + 1):
                w = u32(tb + 4 * k)
                out('  %08x:  .word    0x%08x   ; case %d → %08x' % (tb + 4 * k + BASE, w, k, (tb + w + BASE) & 0xFFFFFFFF))
            addr = tb + 4 * (last_cmp + 1)
            last_cmp = None
    if cnt >= n:
        out('  ... (dừng ở -n %d)' % n)


def annotate(ins, arm, regs, lits, cur_ti):
    """Chú thích một lệnh; cập nhật trạng thái thanh ghi (tuyến tính)."""
    mnem = ins.mnemonic
    ops = [o.strip() for o in split_ops(ins.op_str)]
    va = ins.address
    pc = (va + 8) if arm else ((va + 4) & ~3)
    note = ''
    dst = rn(ops[0]) if ops and REG_RX.match(ops[0]) else None
    newval = None
    base_mn = strip_cond(mnem)
    writes = dst is not None and not base_mn.startswith(('str', 'cmp', 'cmn', 'tst', 'teq', 'push', 'vstr', 'vcmp', 'b', 'stm', 'vpush', 'vst', 'vcmp'))

    # --- nhánh / gọi
    if base_mn in ('bl', 'blx', 'b') and ops and ops[0].startswith('#'):
        tgt = to_rva(parse_imm(ops[0]))
        fin = follow_thunk(tgt)
        nm = name_at(fin)
        own = containing(tgt) == containing(va - BASE) and fin == tgt
        if nm:
            note = nm + (' (nhảy đuôi)' if base_mn == 'b' else '')
        elif base_mn != 'b' or not own:
            note = 'sub_%X' % (fin + BASE)
        if note and fin != tgt:
            note += ' [qua thunk]'
    if base_mn in ('bl', 'blx', 'bx') and ops and not ops[0].startswith('#'):
        v = regs.get(rn(ops[0]))
        if v and v[0] == 'vfn':
            note = 'gọi ảo ' + v[1] + (' (nhảy đuôi)' if base_mn == 'bx' else '')
    if base_mn in ('bl', 'blx'):
        for r in ('r0', 'r1', 'r2', 'r3', 'r12', 'lr', 's0', 's1', 's2', 's3', 'd0', 'd1'):
            regs.pop(r, None)
        return note

    # --- literal pool
    mm = re.match(r'\[pc, #(-?0x[0-9a-f]+|-?\d+)\]$', ops[1]) if len(ops) >= 2 else None
    if mm and (base_mn.startswith('ldr') or base_mn.startswith('vldr')):
        la = pc + parse_imm(mm.group(1)) - BASE
        lits.add(la)
        w = u32(la)
        if base_mn.startswith('vldr'):
            if dst and dst.startswith('d'):
                lits.add(la + 4)
                dv = struct.unpack_from('<d', mem(), la)[0]
                note = 'double %s' % fmtf(dv)
            else:
                note = 'float %s' % fmtf(struct.unpack('<f', struct.pack('<I', w))[0])
        else:
            newval = ('const', w)
            f = looks_float(w)
            lab = data_label(w - BASE) if w and w >= BASE else None
            note = '=0x%x' % w + ((' (float %s)' % fmtf(f)) if f is not None else '') + (' &' + lab if lab else '')
    # --- movw/movt/mov #
    elif base_mn in ('movw', 'mov', 'mvn') and len(ops) == 2 and ops[1].startswith('#'):
        v = parse_imm(ops[1]) & 0xFFFFFFFF
        if base_mn == 'mvn':
            v = (~v) & 0xFFFFFFFF
        newval = ('const', v)
    elif base_mn == 'movt' and len(ops) == 2 and dst in regs and regs[dst][0] == 'const':
        v = (regs[dst][1] & 0xFFFF) | ((parse_imm(ops[1]) & 0xFFFF) << 16)
        newval = ('const', v)
        f = looks_float(v)
        note = '=0x%x' % v + ((' (float %s)' % fmtf(f)) if f is not None else '')
    # --- add rX, pc, #imm → địa chỉ hằng trong hàm (vd. bảng float cho vld1)
    elif base_mn == 'add' and len(ops) == 3 and ops[1] == 'pc' and ops[2].startswith('#'):
        a = (pc + parse_imm(ops[2])) & 0xFFFFFFFF
        newval = ('pool', a - BASE)
    # --- add rX, rThis, #off → &this.trường
    elif base_mn == 'add' and len(ops) == 3 and ops[2].startswith('#') and rn(ops[1]) in regs             and regs[rn(ops[1])][0] in ('this', 'obj'):
        st = regs[rn(ops[1])]
        fe = inst_fields(st[1]).get(parse_imm(ops[2]))
        if fe:
            note = '&%s%s?' % ('this.' if st[0] == 'this' else '(%s).' % IDX['types'][st[1]]['name'], fe[0])
            newval = ('faddr', st, parse_imm(ops[2]))
    # --- add rX, rThis, rConst (offset > 0xfff không vừa lệnh) → &this.trường
    elif base_mn == 'add' and len(ops) == 3 and REG_RX.match(ops[2]) and ops[1] != 'pc' and ops[2] != 'pc'             and any(regs.get(rn(x), ('',))[0] in ('this', 'obj') for x in ops[1:])             and any(regs.get(rn(x), ('',))[0] == 'const' for x in ops[1:]):
        st = next(regs[rn(x)] for x in ops[1:] if regs.get(rn(x), ('',))[0] in ('this', 'obj'))
        off = next(regs[rn(x)][1] for x in ops[1:] if regs.get(rn(x), ('',))[0] == 'const')
        fe = inst_fields(st[1]).get(off)
        if fe:
            note = '&%s%s?' % ('this.' if st[0] == 'this' else '(%s).' % IDX['types'][st[1]]['name'], fe[0])
        newval = ('faddr', st, off)
    # --- vld1 {dA, dB}, [rX] từ bảng hằng
    elif base_mn.startswith('vld1') and ops and ops[-1].startswith('[') and rn(ops[-1].strip('[]!')) in regs             and regs[rn(ops[-1].strip('[]!'))][0] == 'pool':
        a = regs[rn(ops[-1].strip('[]!'))][1]
        nd = len(re.findall(r'd\d+', ins.op_str.split('[')[0]))
        vals = []
        for k in range(nd * 2):
            lits.add(a + 4 * k)
            vals.append(fmtf(struct.unpack('<f', struct.pack('<I', u32(a + 4 * k)))[0]))
        note = 'float [%s]' % ', '.join(vals)
    # --- vst1 {dA, dB}, [rX] vào trường
    elif base_mn.startswith('vst1') and ops and rn(ops[-1].strip('[]!')) in regs             and regs[rn(ops[-1].strip('[]!'))][0] == 'faddr':
        _, st, off = regs[rn(ops[-1].strip('[]!'))]
        nd = len(re.findall(r'd\d+', ins.op_str.split('[')[0]))
        fs = inst_fields(st[1])
        names = [fs[off + 4 * k][0] for k in range(nd * 2) if off + 4 * k in fs]   # trường struct (Color, Vector3) chiếm nhiều word
        note = 'ghi %d byte: %s' % (nd * 8, ', '.join('this.' + n for n in names))
    # --- add rX, pc, rY  → địa chỉ
    elif base_mn == 'add' and len(ops) == 3 and 'pc' in (ops[1], ops[2]):
        other = rn(ops[2] if ops[1] == 'pc' else ops[1])
        v = regs.get(other)
        if v and v[0] == 'const':
            a = (pc + v[1]) & 0xFFFFFFFF
            newval = ('addr', a - BASE)
            lab = data_label(a - BASE)
            note = '&' + lab if lab else '&0x%x' % a
    # --- ldr rX, [pc, rY]  → nạp ô
    elif base_mn.startswith('ldr') and len(ops) == 3 and ops[1] == '[pc' and ops[2].endswith(']'):
        other = rn(ops[2].rstrip(']'))
        v = regs.get(other)
        if v and v[0] == 'const':
            a = ((pc + v[1]) & 0xFFFFFFFF) - BASE
            newval, note = load_from(a, dst)
    # --- mov rX, rY
    elif base_mn == 'mov' and len(ops) == 2 and REG_RX.match(ops[1]):
        newval = regs.get(rn(ops[1]))
    # --- vmov sN, rX
    elif base_mn == 'vmov' and len(ops) == 2 and ops[0].startswith('s') and rn(ops[1]) in regs:
        v = regs[rn(ops[1])]
        if v[0] == 'const':
            f = struct.unpack('<f', struct.pack('<I', v[1]))[0]
            note = 'float %s' % fmtf(f)
    # --- truy cập bộ nhớ [rN, #off]
    if not note or newval is None:
        m2 = MEM_RX.search(ins.op_str)
        if m2 and m2.group(1) != 'pc':
            br = rn(m2.group(1))
            off = parse_imm(m2.group(2)) if m2.group(2) else 0
            st = regs.get(br)
            if st:
                n2, nv = mem_note(st, off, base_mn, cur_ti)
                if n2 and not note:
                    note = n2
                if nv is not None and base_mn.startswith(('ldr', 'vldr')):
                    newval = nv
    if writes and dst:
        if newval is not None:
            regs[dst] = newval
        else:
            regs.pop(dst, None)
        if base_mn == 'ldrd' and len(ops) > 1:
            regs.pop(rn(ops[1]), None)
    # ghi ngược (pre/post-index "!" hoặc "], #")
    if '!' in ins.op_str or re.search(r'\], #', ins.op_str):
        m2 = MEM_RX.search(ins.op_str)
        if m2:
            regs.pop(rn(m2.group(1)), None)
    return note


def split_ops(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '[{':
            depth += 1
        elif ch in ']}':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    if cur:
        out.append(cur)
    # ldr r0, [pc, r0] → giữ dạng ['r0', '[pc', 'r0]'] cho dễ khớp
    res = []
    for o in out:
        o = o.strip()
        if o.startswith('[') and ',' in o and o.endswith(']') and not re.search(r'#', o):
            a, b = o.split(',', 1)
            res += [a.strip(), b.strip()]
        else:
            res.append(o)
    return res


def load_from(a, dst):
    """Nạp word ở RVA a (ô dữ liệu). Trả (trạng thái thanh ghi mới, chú thích)."""
    lab = data_label(a)
    if lab:
        nv = None
        mt = re.match(r'TypeInfo\((.+)\)$', lab)
        if mt:
            tt = resolve_full(mt.group(1))
            if tt is not None:
                nv = ('klass', tt)
        return nv, lab
    w = u32(a)
    if w is not None and w >= BASE and w - BASE < len(mem()):
        lab2 = data_label(w - BASE)   # ô GOT trỏ tới ô metadata
        if lab2:
            return ('addr', w - BASE), '&' + lab2
        nm = name_at(w - BASE)
        if nm:
            return ('const', w), '&' + nm
    f = looks_float(w)
    return (('const', w) if w is not None else None), ('[0x%x]=0x%x' % (a + BASE, w or 0)) + ((' (float %s)' % fmtf(f)) if f is not None else '')


def resolve_full(name):
    """'RGScript.Character.Player.C28Controller' hoặc tên lồng → typeDef index."""
    if 'full' not in _tcache:
        _tcache['full'] = {tfull(ti): ti for ti in range(len(IDX['types']))}
    ti = _tcache['full'].get(name)
    if ti is None:
        c = match_types(name.rsplit('.', 1)[-1]) if '<' not in name else []
        ti = c[0] if len(c) == 1 else None
    return ti


def mem_note(st, off, mnem, cur_ti):
    kind = st[0]
    if kind == 'faddr':
        return mem_note(st[1], st[2] + off, mnem, cur_ti)
    if kind == 'addr':
        lab = data_label(st[1] + off)
        if lab and mnem.startswith('ldr'):
            nv, _ = load_from(st[1] + off, None)
            return lab, nv
        return (lab, None) if lab else (None, None)
    if kind in ('this', 'obj'):
        ti = st[1]
        if off == 0 and mnem == 'ldr':
            return None, ('vt', ti)
        fe = inst_fields(ti).get(off)
        if fe:
            pre = 'this.' if kind == 'this' else '(%s).' % IDX['types'][ti]['name']
            nv = None
            ft = resolve_type_ref(fe[1], fe[2])
            if ft is not None and IDX['types'][ft]['kind'] == 'class':
                nv = ('obj', ft)
            return pre + fe[0] + '?', nv
        return None, None
    if kind == 'klass':
        ti = st[1]
        if off == KLASS_STATIC:
            return 'static_fields(%s)' % IDX['types'][ti]['name'], ('st', ti)
        return None, None
    if kind == 'st':
        fe = static_fields(st[1]).get(off)
        if fe:
            nv = None
            ft = resolve_type_ref(fe[1], fe[2])
            if ft is not None and IDX['types'][ft]['kind'] == 'class':
                nv = ('obj', ft)
            return '%s.%s (static)' % (IDX['types'][st[1]]['name'], fe[0]), nv
        return None, None
    if kind == 'vt':
        if off >= KLASS_VTABLE and (off - KLASS_VTABLE) % 4 == 0:
            s, part = divmod(off - KLASS_VTABLE, 8)
            nm = vslot_name(st[1], s) or 'slot %d' % s
            if part == 0:
                return 'vtable[%d] %s' % (s, nm), ('vfn', nm)
            return 'vtable[%d].method %s' % (s, nm), None
        if off == KLASS_STATIC:
            return 'static_fields(%s)' % IDX['types'][st[1]]['name'], ('st', st[1])
    return None, None


# ---------------------------------------------------------------- quét tham chiếu

def code_range():
    st = IDX['starts']
    return st[0] & ~3, min(st[-1] + 0x10000, len(mem()))


def scan_branches(targets):
    """BL/BLX/B (ARM) tới targets. Trả [(rva lệnh, rva đích, loại)]."""
    import numpy as np
    lo, hi = code_range()
    arr = np.frombuffer(mem(), dtype=np.uint32, count=(hi - lo) // 4, offset=lo)
    top = arr >> 24
    cond = top >> 4
    op = top & 0xF
    imm = (arr & 0xFFFFFF).astype(np.int64)
    imm = np.where(imm >= 1 << 23, imm - (1 << 24), imm)
    pos = np.arange(len(arr), dtype=np.int64) * 4 + lo
    dst = pos + 8 + imm * 4
    isbl = (op == 0xB) & (cond != 0xF)
    isb = (op == 0xA) & (cond != 0xF)
    isblx = (cond == 0xF) & ((op == 0xA) | (op == 0xB))
    dst = np.where(isblx, dst + ((op == 0xB).astype(np.int64) << 1), dst)
    tset = np.array(sorted(targets), dtype=np.int64)
    hit = np.isin(dst, tset) & (isbl | isb | isblx)
    out = []
    for i in np.nonzero(hit)[0]:
        out.append((int(pos[i]), int(dst[i]), 'bl' if isbl[i] else ('blx' if isblx[i] else 'b')))
    return out


def scan_pcrel(targets):
    """Idiom `ldr Rm,[pc,#lit]` … `ldr Rd,[pc,Rm]` / `add Rd,pc,Rm` trỏ tới targets (RVA). Trả [(rva lệnh, rva đích)]."""
    import numpy as np
    lo, hi = code_range()
    arr = np.frombuffer(mem(), dtype=np.uint32, count=(hi - lo) // 4, offset=lo)
    # ldr Rd,[pc,Rm] (U=1): cond 0111 1001 1111 Rd 0000 0000 Rm ; add Rd,pc,Rm: cond 0000 1000 1111 Rd 0000 0000 Rm
    m1 = (arr & np.uint32(0x0FFF0FF0)) == np.uint32(0x079F0000)
    m2 = (arr & np.uint32(0x0FFF0FF0)) == np.uint32(0x008F0000)
    cand = np.nonzero(m1 | m2)[0]
    rm = (arr[cand] & 0xF).astype(np.int64)
    found = np.zeros(len(cand), dtype=bool)
    litv = np.zeros(len(cand), dtype=np.int64)
    for back in range(1, 13):
        j = cand - back
        ok = (j >= 0) & ~found
        w = arr[np.clip(j, 0, None)]
        isl = ((w & np.uint32(0x0F7F0000)) == np.uint32(0x051F0000)) & (((w >> 12) & 0xF).astype(np.int64) == rm) & ok
        up = (w >> 23) & 1
        off = (w & 0xFFF).astype(np.int64)
        off = np.where(up == 1, off, -off)
        la = (np.clip(j, 0, None).astype(np.int64) * 4 + lo) + 8 + off
        la = np.clip(la, lo, hi - 4)
        v = arr[(la - lo) // 4].astype(np.int64)
        litv = np.where(isl, v, litv)
        found |= isl
    pos = cand.astype(np.int64) * 4 + lo
    dst = (pos + 8 + BASE + litv) & 0xFFFFFFFF
    dst = dst - BASE
    tset = np.array(sorted(targets), dtype=np.int64)
    # thường là qua ô GOT: [pc+lit] chứa VA của ô metadata → so cả giá trị ô đó
    whole = np.frombuffer(mem(), dtype=np.uint32, count=len(mem()) // 4)
    okd = found & (dst >= 0) & (dst < len(mem()) - 4) & (dst % 4 == 0)
    gv = np.where(okd, whole[np.clip(dst, 0, len(mem()) - 4) // 4].astype(np.int64) - BASE, -1)
    hit1 = found & np.isin(dst, tset)
    hit2 = okd & ~hit1 & np.isin(gv, tset)
    out = [(int(p), int(d)) for p, d in zip(pos[hit1], dst[hit1])]
    out += [(int(p), int(d)) for p, d in zip(pos[hit2], gv[hit2])]
    return sorted(out)


def who(site):
    s = containing(site)
    return (name_at(s) or 'sub_%X' % (s + BASE)) if s is not None else '?'


# ---------------------------------------------------------------- in trường

def print_fields(ti, out=print):
    t = IDX['types'][ti]
    ch = chain(ti)
    out('%s %s  (TypeDefIndex %d, %d trường, %d method)' % (t['kind'], tfull(ti), t['tdi'], len(t['fields']), len(t['methods'])))
    out('  cha: ' + ' → '.join(tfull(x) for x in ch[1:]) + ((' → ' + IDX['types'][ch[-1]]['parent']) if IDX['types'][ch[-1]]['parent'] else '')
        if len(ch) > 1 else '  cha: ' + (t['parent'] or '-'))
    for fn, ft, off, st, cst, val in t['fields']:
        out('  %-7s %-7s %-40s %s%s' % ('0x%X' % off if off is not None else '-',
                                        'const' if cst else ('static' if st else ''), ft, fn,
                                        (' = ' + val) if val is not None else ''))
    for x in ch[1:]:
        fs = [f for f in IDX['types'][x]['fields'] if f[2] is not None and not f[3] and not f[4]]
        if fs:
            out('  -- kế thừa từ %s: %s' % (IDX['types'][x]['name'],
                                          ', '.join('%s@0x%X' % (f[0], f[2]) for f in fs[:40]) + (' …' if len(fs) > 40 else '')))
    for mn, sig, rva, slot in t['methods']:
        out('  method %-80s %s%s' % (sig, ('RVA 0x%X' % rva) if rva else '-', (' slot %d' % slot) if slot is not None else ''))


# ---------------------------------------------------------------- main

def main():
    global IDX
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('spec', nargs='?')
    ap.add_argument('--find')
    ap.add_argument('--type')
    ap.add_argument('--fields')
    ap.add_argument('--xref')
    ap.add_argument('--strref')
    ap.add_argument('--addr')
    ap.add_argument('-n', type=int, default=2000)
    ap.add_argument('--raw', action='store_true')
    ap.add_argument('--rebuild', action='store_true')
    a = ap.parse_args()
    IDX = load(a.rebuild)
    load_runtime_names()
    if a.find:
        rx = re.compile(a.find)
        for ti, k, n in all_methods():
            if rx.search(n):
                m = IDX['types'][ti]['methods'][k]
                print('%-60s %-70s %s' % (n, m[1][:70], ('RVA 0x%X' % m[2]) if m[2] else '-'))
    elif a.type:
        rx = re.compile(a.type)
        for ti in range(len(IDX['types'])):
            if rx.search(tfull(ti)):
                t = IDX['types'][ti]
                print('%-80s %-6s : %-24s %d trường, %d method' % (tfull(ti), t['kind'], t['parent'] or '-',
                                                                   len(t['fields']), len(t['methods'])))
    elif a.fields:
        ts = match_types(a.fields)
        if not ts:
            print('không thấy kiểu "%s" (thử --type)' % a.fields)
        for ti in ts:
            print_fields(ti)
    elif a.xref:
        ms = resolve(a.xref)
        if not ms:
            print('không thấy method "%s" (thử --find)' % a.xref)
            return
        tg = {IDX['types'][ti]['methods'][k][2]: (ti, k) for ti, k in ms if IDX['types'][ti]['methods'][k][2]}
        for site, d, kind in scan_branches(tg.keys()):
            print('%08x  %-4s → %-40s ← %s' % (site + BASE, kind, mdisp(*tg[d]), who(site)))
        # qua ô Method(...) (delegate, coroutine, gọi qua MethodInfo)
        want = set()
        for ti, k in ms:
            mn = IDX['types'][ti]['methods'][k][0]
            tn = tfull(ti)
            for sa, lab in IDX['slots'].items():
                if lab.startswith('Method(') and (lab.startswith('Method(%s.%s(' % (tn, mn))):
                    want.add(sa)
        for site, d in scan_pcrel(want):
            print('%08x  [ô %s] ← %s' % (site + BASE, IDX['slots'][d][:60], who(site)))
    elif a.strref:
        rx = re.compile(a.strref)
        want = {sa: v for sa, v in IDX['strs'].items() if rx.search(v)}
        for site, d in scan_pcrel(want.keys()):
            print('%08x  %-50s ← %s' % (site + BASE, json.dumps(want[d], ensure_ascii=False)[:50], who(site)))
    elif a.addr:
        v = to_rva(int(a.addr, 16))
        s = containing(v)
        print('RVA 0x%X (VA 0x%X) trong hàm bắt đầu RVA 0x%X: %s' % (v, v + BASE, s or 0, name_at(s, 10) if s is not None else '?'))
    elif a.spec:
        ms = resolve(a.spec)
        if not ms:
            print('không thấy method "%s" (thử --find)' % a.spec)
        for ti, k in ms:
            disasm(ti, k, a.n, a.raw)
    else:
        ap.print_help()


def load_runtime_names():
    pass


if __name__ == '__main__':
    try:
        main()
    except (BrokenPipeError, OSError) as e:   # `| head` trên Windows đóng ống → EINVAL
        if isinstance(e, BrokenPipeError) or getattr(e, 'errno', None) == 22:
            try:
                sys.stdout = open(os.devnull, 'w')
            except Exception:
                pass
        else:
            raise
