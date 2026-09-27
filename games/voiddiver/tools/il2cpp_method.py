# -*- coding: utf-8 -*-
"""Đọc mã gốc VOID DIVER (IL2CPP, global-metadata.dat phiên bản 39 — Il2CppDumper 6.x chưa đọc được).

Cách dùng (chạy ở đâu cũng được; cần `pip install capstone pefile numpy`; đặt PYTHONIOENCODING=utf-8):

    python il2cpp_method.py CutscenePanelView.OnSkipStarted      # dịch ngược mọi overload của một method
    python il2cpp_method.py 'CutscenePanelView.<OnSkipStarted>d__12.MoveNext'  # method của lớp lồng (async, lambda)
    python il2cpp_method.py --find 'RunToggle|SkipHold'          # tìm method theo regex trên "Kiểu.Method"
    python il2cpp_method.py --type 'Tutorial'                    # tìm kiểu theo regex (tên đầy đủ)
    python il2cpp_method.py --fields CutscenePanelView           # trường + offset + hằng (const) của một kiểu
    python il2cpp_method.py --xref ActorController.SetRunToggleOn   # ai gọi method này (call/jmp rel32)
    python il2cpp_method.py --strref 'Tutorial'                  # method nào dùng string literal khớp regex
    python il2cpp_method.py --usage 'TypeInfo\(TutorialEvent\)'  # method nào dùng ô metadata khớp regex (TypeInfo/Method/Field/...)
    python il2cpp_method.py --addr 0x180123456                   # method nào nằm ở địa chỉ này
    Tuỳ chọn: -n 400 (số lệnh tối đa mỗi hàm), --raw (không chú thích), VD_GAME=<thư mục game>.

Chú thích trong bản dịch ngược:
  - `call`/`jmp` tới hàm đã biết → tên method (nhiều method trùng thân do gộp COMDAT thì in tối đa 3 tên).
  - `[rip+X]` trỏ tới ô metadata-usage → `"literal"`, `TypeInfo(Kiểu)`, `Method(Kiểu.M)`, `Field(Kiểu.f)`...
  - `movss/movsd [rip+X]` → giá trị float/double; `mov reg, 0x3f800000` → float nếu trông giống float.
  - `[reg+0x..]` khớp offset trường thực thể của lớp chứa method (hoặc lớp cha) → `; this.<tên>?` (chỉ là đoán theo offset).
Giới hạn: gọi ảo (`call [rax+0x..]`) chỉ in số slot; generic dùng chung thân (__Il2CppFullySharedGenericType) ra tên chung.

Bố cục metadata v39 đo được (khác v31 ở chỗ chỉ số nhỏ co lại 2 byte):
  - header: bộ ba (offset, size, count) từ byte 8; mục 0 literal (4 B), 2 string, 5 method (32 B), 7 fieldDefaultValue (12 B),
    8 dữ liệu mặc định, 10 parameter (12 B), 11 field (12 B), 15 nestedTypes, 19 typeDefinition (82 B), 20 image (36 B).
  - image: nameIndex@0, assembly@4, typeStart u16@8, typeCount u16@10.
  - method: nameIndex@0, declaringType u16@4, returnType@6, parameterStart@14, token@20, flags u16@24, slot u16@28, paramCount u16@30.
  - typeDef: name@0, namespace@4, byval@8, declaringType(Il2CppType)@12, parent@16, genericContainer u16@20, flags@22,
    fieldStart@26, methodStart@30, eventStart@34, propertyStart@38, nestedStart@42, …, method_count u16@58, property@60,
    field@62, event@64, nested@66, vtable@68, token@78.
  - GameAssembly.dll: "<Image>.dll" → Il2CppCodeGenModule {name, methodPointerCount u32, methodPointers} → methodPointers[rid−1].
    Il2CppMetadataRegistration tìm theo mẫu fieldOffsetsCount = typeDefinitionsSizesCount = số typeDef.
  - metadata usage trong .data là số mã hoá (loại << 29) | (chỉ số << 1) | 1: 1 TypeInfo, 2 Il2CppType, 3 MethodDef,
    4 FieldInfo (fieldRef), 5 StringLiteral, 6 MethodRef (methodSpec).
"""
import os, re, struct, sys, argparse
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_64

GAME = os.environ.get('VD_GAME', r'D:/Steam/steamapps/common/VOID DIVER Escape from the Abyss Demo')
META = os.path.join(GAME, 'VOID DIVER_Data', 'il2cpp_data', 'Metadata', 'global-metadata.dat')
DLL = os.path.join(GAME, 'GameAssembly.dll')

mb = open(META, 'rb').read()
data = open(DLL, 'rb').read()
pe = pefile.PE(DLL, fast_load=True)
BASE = pe.OPTIONAL_HEADER.ImageBase
SECS = [(s.Name.rstrip(b'\0').decode(), BASE + s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
        for s in pe.sections]


def sec(i):
    return struct.unpack_from('<3I', mb, 8 + 12 * i)


LIT, LITDATA, STR, METH, FDEF, FDATA, PARAM, FIELD, NEST, TDEF, IMG, FREF = (
    sec(0), sec(1), sec(2), sec(5), sec(7), sec(8), sec(10), sec(11), sec(15), sec(19), sec(20), sec(22))
assert TDEF[1] == 82 * TDEF[2] and METH[1] == 32 * METH[2] and IMG[1] == 36 * IMG[2], 'bố cục metadata không khớp v39'
NTD = TDEF[2]

_sc = {}


def s_at(i):
    v = _sc.get(i)
    if v is None:
        e = mb.index(b'\0', STR[0] + i)
        v = _sc[i] = mb[STR[0] + i:e].decode('utf8', 'replace')
    return v


def lit(i):
    a = struct.unpack_from('<I', mb, LIT[0] + 4 * i)[0]
    b = struct.unpack_from('<I', mb, LIT[0] + 4 * (i + 1))[0] if i + 1 < LIT[2] else LITDATA[1]
    return mb[LITDATA[0] + a:LITDATA[0] + b].decode('utf8', 'replace')


def va2off(v):
    for _, va, vs, raw, rs in SECS:
        if va <= v < va + min(vs, rs):
            return raw + (v - va)
    return None


def off2va(o):
    for _, va, vs, raw, rs in SECS:
        if raw <= o < raw + rs:
            return va + (o - raw)
    return None


def q(va):
    o = va2off(va)
    return None if o is None else struct.unpack_from('<Q', data, o)[0]


# ---------- typeDef / method / field ----------
def td(t):
    o = TDEF[0] + 82 * t
    r = {}
    r['name'], r['ns'], r['byval'], r['decl'], r['parent'] = struct.unpack_from('<5i', mb, o)
    r['flags'], r['fieldStart'], r['methodStart'], r['eventStart'], r['propertyStart'], r['nestedStart'] = \
        struct.unpack_from('<I5i', mb, o + 22)
    (r['nmeth'], r['nprop'], r['nfield'], r['nevent'], r['nnest'], r['nvt'], r['nif'], r['nio']) = \
        struct.unpack_from('<8H', mb, o + 58)
    r['token'] = struct.unpack_from('<I', mb, o + 78)[0]
    return r


def meth(i):
    o = METH[0] + 32 * i
    name, = struct.unpack_from('<I', mb, o)
    dt, = struct.unpack_from('<H', mb, o + 4)
    rt, _, pstart = struct.unpack_from('<3i', mb, o + 6)
    tok, = struct.unpack_from('<I', mb, o + 20)
    flags, iflags, slot, pc = struct.unpack_from('<4H', mb, o + 24)
    return {'name': s_at(name), 'type': dt, 'ret': rt, 'pstart': pstart, 'token': tok, 'flags': flags, 'slot': slot, 'pc': pc}


def field(i):
    n, ti, tok = struct.unpack_from('<iiI', mb, FIELD[0] + 12 * i)
    return s_at(n), ti, tok


def param(i):
    n, tok, ti = struct.unpack_from('<iIi', mb, PARAM[0] + 12 * i)
    return s_at(n), ti


# ---------- image → codegen module (dò một lần rồi lưu cache cạnh công cụ) ----------
import json
_st = os.stat(DLL)
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '__pycache__',
                     'il2cpp_method_%d_%d.json' % (_st.st_size, int(_st.st_mtime)))
_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def _scan_images():
    out = []
    for i in range(IMG[2]):
        nm_i, = struct.unpack_from('<I', mb, IMG[0] + 36 * i)
        ts, tc = struct.unpack_from('<2H', mb, IMG[0] + 36 * i + 8)   # typeStart, typeCount là u16 ở v39
        nm = s_at(nm_i)
        k = data.find(b'\0' + nm.encode() + b'\0')
        ptrs = None
        while k >= 0 and ptrs is None:
            j = data.find(struct.pack('<Q', off2va(k + 1)))
            while j >= 0:
                cnt = struct.unpack_from('<I', data, j + 8)[0]
                mp = struct.unpack_from('<Q', data, j + 16)[0]
                if va2off(mp) is not None and cnt < 200000:
                    ptrs = (mp, cnt)
                    break
                j = data.find(struct.pack('<Q', off2va(k + 1)), j + 8)
            k = data.find(b'\0' + nm.encode() + b'\0', k + 1)
        out.append([nm, ts, tc] + list(ptrs or (0, 0)))
    return out


IMAGES = _cache.get('images') or _scan_images()   # [tên, typeStart, typeCount, methodPointers, count]


def image_of_type(t):
    for im in IMAGES:
        if im[1] <= t < im[1] + im[2]:
            return im
    return None


def method_addr(i):
    m = meth(i)
    im = image_of_type(m['type'])
    rid = m['token'] & 0xFFFFFF
    if not im or not im[3] or rid < 1 or rid > im[4]:
        return 0
    return q(im[3] + 8 * (rid - 1)) or 0


# ---------- Il2CppMetadataRegistration (types, methodSpecs, fieldOffsets) ----------
def find_metareg():
    pat = struct.pack('<Q', NTD)
    for name, va, vs, raw, rs in SECS:
        if name not in ('.data', '.rdata'):
            continue
        blob = data[raw:raw + rs]
        j = blob.find(pat)
        while j >= 0:
            if j >= 96 and j % 8 == 0 and blob[j - 16:j - 8] == pat:   # fieldOffsetsCount @80, typeDefinitionsSizesCount @96
                st = j - 96
                vals = struct.unpack_from('<16Q', blob, st)
                if all(va2off(vals[k]) is not None for k in (1, 3, 7, 9, 11, 13)):
                    return dict(zip(['gcCount', 'gc', 'giCount', 'gi', 'gmtCount', 'gmt', 'typesCount', 'types',
                                     'msCount', 'ms', 'foCount', 'fo', 'tdsCount', 'tds', 'muCount', 'mu'], vals))
            j = blob.find(pat, j + 8)
    return None


MR = _cache.get('metareg') or find_metareg()
if not _cache and MR:
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump({'images': IMAGES, 'metareg': MR}, open(CACHE, 'w'))
    except OSError:
        pass


def il2type(ti):
    """(kiểu, data) của Il2CppType thứ ti."""
    if MR is None or ti < 0 or ti >= MR['typesCount']:
        return None
    p = q(MR['types'] + 8 * ti)
    o = va2off(p)
    d, bits = struct.unpack_from('<QI', data, o)
    return (bits >> 16) & 0xFF, d


PRIM = {1: 'void', 2: 'bool', 3: 'char', 4: 'sbyte', 5: 'byte', 6: 'short', 7: 'ushort', 8: 'int', 9: 'uint', 10: 'long',
        11: 'ulong', 12: 'float', 13: 'double', 14: 'string', 0x18: 'IntPtr', 0x19: 'UIntPtr', 0x1c: 'object'}


def type_ptr_name(p, depth=0):
    o = va2off(p)
    if o is None or depth > 6:
        return '?'
    d, bits = struct.unpack_from('<QI', data, o)
    k = (bits >> 16) & 0xFF
    if k in PRIM:
        return PRIM[k]
    if k in (0x11, 0x12):
        return tname(d, short=True)
    if k == 0x1d:
        return type_ptr_name(d, depth + 1) + '[]'
    if k == 0x0f:
        return type_ptr_name(d, depth + 1) + '*'
    if k == 0x15:   # GENERICINST: Il2CppGenericClass {type*, context{class_inst*, method_inst*}}
        gt, ci = struct.unpack_from('<QQ', data, va2off(d))
        base = type_ptr_name(gt, depth + 1)
        return base.split('`')[0] + '<' + ', '.join(ginst(ci, depth)) + '>'
    if k in (0x13, 0x1e):
        return ('!' if k == 0x13 else '!!') + str(d)
    return 'T%x' % k


def ginst(p, depth=0):
    o = va2off(p)
    if o is None:
        return []
    n, arr = struct.unpack_from('<QQ', data, o)
    return [type_ptr_name(q(arr + 8 * i), depth + 1) for i in range(min(n, 8))]


def type_name_idx(ti):
    if MR is None or ti < 0:
        return '?'
    return type_ptr_name(q(MR['types'] + 8 * ti))


_tn = {}


def tname(t, short=False):
    """Tên đầy đủ của typeDef t (Namespace.Ngoài.Trong)."""
    key = (t, short)
    if key in _tn:
        return _tn[key]
    r = td(t)
    n = s_at(r['name'])
    if r['decl'] >= 0:
        k = il2type(r['decl'])
        outer = tname(k[1], short) if k and k[0] in (0x11, 0x12) else type_name_idx(r['decl'])
        n = outer + '.' + n
    elif not short and s_at(r['ns']):
        n = s_at(r['ns']) + '.' + n
    _tn[key] = n
    return n


def mname(i, sig=False):
    m = meth(i)
    s = tname(m['type'], short=True) + '.' + m['name']
    if sig:
        ps = [param(m['pstart'] + k) for k in range(m['pc'])] if m['pstart'] >= 0 else []
        s = type_name_idx(m['ret']) + ' ' + s + '(' + ', '.join(type_name_idx(t) + ' ' + n for n, t in ps) + ')'
    return s


def method_spec(i):
    if MR is None or i >= MR['msCount']:
        return None
    mdi, ci, mi = struct.unpack_from('<3i', data, va2off(MR['ms'] + 12 * i))
    return mdi


def field_offsets(t):
    if MR is None or t >= MR['foCount']:
        return []
    p = q(MR['fo'] + 8 * t)
    if not p:
        return []
    o = va2off(p)
    return [struct.unpack_from('<i', data, o + 4 * k)[0] for k in range(td(t)['nfield'])]


# ---------- giá trị mặc định (const) ----------
def cuint(o):
    b = mb[o]
    if b & 0x80 == 0:
        return b, o + 1
    if b & 0xC0 == 0x80:
        return ((b & 0x3F) << 8) | mb[o + 1], o + 2
    if b & 0xE0 == 0xC0:
        return ((b & 0x1F) << 24) | (mb[o + 1] << 16) | (mb[o + 2] << 8) | mb[o + 3], o + 4
    if b == 0xF0:
        return struct.unpack_from('<I', mb, o + 1)[0], o + 5
    return (0xFFFFFFFE if b == 0xFE else 0xFFFFFFFF), o + 1


def cint(o):
    u, o2 = cuint(o)
    if u == 0xFFFFFFFF:
        return -2147483648, o2
    return (-(u >> 1) - 1 if u & 1 else u >> 1), o2


_fdv = None


def field_default(fi):
    global _fdv
    if _fdv is None:
        _fdv = {}
        for k in range(FDEF[2]):
            f, ti, di = struct.unpack_from('<3i', mb, FDEF[0] + 12 * k)
            _fdv[f] = (ti, di)
    if fi not in _fdv:
        return None
    ti, di = _fdv[fi]
    k = il2type(ti)
    if k is None or di < 0:
        return None
    kind, o = k[0], FDATA[0] + di
    try:
        if kind == 2 or kind == 5:
            return mb[o]
        if kind == 4:
            return struct.unpack_from('<b', mb, o)[0]
        if kind == 3 or kind == 7:
            return struct.unpack_from('<H', mb, o)[0]
        if kind == 6:
            return struct.unpack_from('<h', mb, o)[0]
        if kind == 8:
            return cint(o)[0]
        if kind == 9:
            return cuint(o)[0]
        if kind in (10, 11):
            return struct.unpack_from('<q' if kind == 10 else '<Q', mb, o)[0]
        if kind == 12:
            return round(struct.unpack_from('<f', mb, o)[0], 6)
        if kind == 13:
            return struct.unpack_from('<d', mb, o)[0]
        if kind == 14:
            n, o2 = cint(o)
            return None if n < 0 else repr(mb[o2:o2 + n].decode('utf8', 'replace'))
    except struct.error:
        return None
    return None


# ---------- chỉ mục ----------
_addr2m = None


def addr_index():
    global _addr2m
    if _addr2m is None:
        _addr2m = {}
        for i in range(METH[2]):
            a = method_addr(i)
            if a:
                _addr2m.setdefault(a, []).append(i)
    return _addr2m


def all_methods():
    for i in range(METH[2]):
        yield i, mname(i)


def resolve(spec):
    """'Kiểu.Method' → [chỉ số method]. Kiểu so ở ranh giới dấu chấm từ cuối tên đầy đủ."""
    mm = re.match(r'^(.*?)\.(\.c?ctor|[^.]+)$', spec)
    if not mm:
        return []
    tpart, mpart = mm.group(1), mm.group(2)
    for group in match_types(tpart, split=True):   # tên đầy đủ khớp hẳn trước, rồi mới tới khớp đuôi
        out = []
        for t in group:
            r = td(t)
            for k in range(r['nmeth']):
                i = r['methodStart'] + k
                if meth(i)['name'] == mpart:
                    out.append(i)
        if out:
            return out
    return []


def match_types(name, split=False):
    """typeDef có tên đầy đủ = name; nếu không có thì các typeDef có tên kết thúc bằng '.name'."""
    exact, tail = [], []
    for t in range(NTD):
        full = tname(t)
        if full == name:
            exact.append(t)
        elif full.endswith('.' + name):
            tail.append(t)
    if split:
        return [exact, tail]
    return exact or tail


# ---------- dịch ngược ----------
md = Cs(CS_ARCH_X86, CS_MODE_64)


def usage_note(v):
    if v is None or not (v & 1) or v >> 32:
        return None
    kind, idx = (v >> 29) & 7, (v & 0x1FFFFFFF) >> 1
    try:
        if kind == 5 and idx < LIT[2]:
            return repr(lit(idx))
        if kind == 1:
            return 'TypeInfo(%s)' % type_name_idx(idx)
        if kind == 2:
            return 'Il2CppType(%s)' % type_name_idx(idx)
        if kind == 3 and idx < METH[2]:
            return 'Method(%s)' % mname(idx)
        if kind == 4 and idx < FREF[2]:
            ti, fi = struct.unpack_from('<ii', mb, FREF[0] + 8 * idx)
            k = il2type(ti)
            if k and k[0] in (0x11, 0x12):
                r = td(k[1])
                return 'Field(%s.%s)' % (tname(k[1], True), field(r['fieldStart'] + fi)[0])
            return 'Field(%s#%d)' % (type_name_idx(ti), fi)
        if kind == 6:
            mdi = method_spec(idx)
            return 'MethodRef(%s)' % (mname(mdi) if mdi is not None and 0 <= mdi < METH[2] else idx)
    except Exception:
        return None
    return None


def rip_target(ins):
    m = re.search(r'\[rip ([+-]) (0x[0-9a-f]+)\]', ins.op_str)
    if not m:
        return None
    d = int(m.group(2), 16)
    return ins.address + ins.size + (d if m.group(1) == '+' else -d)


def looks_float(x):
    if x < 0x3a000000 or x > 0x4a000000 and x < 0xba000000 or x > 0xca000000:
        return None
    f = struct.unpack('<f', struct.pack('<I', x))[0]
    return round(f, 6) if abs(f - round(f, 3)) < 1e-6 else None


def class_fields(t):
    """{offset: tên} của trường thực thể lớp t và các lớp cha."""
    out, seen = {}, 0
    while t is not None and t >= 0 and seen < 12:
        seen += 1
        r = td(t)
        offs = field_offsets(t)
        for k in range(r['nfield']):
            n, ti, _ = field(r['fieldStart'] + k)
            k2 = il2type(ti)
            if k < len(offs) and offs[k] > 0 and k2 is not None:
                bits_static = False
                p = q(MR['types'] + 8 * ti) if MR else None
                if p:
                    attrs = struct.unpack_from('<I', data, va2off(p) + 8)[0] & 0xFFFF
                    bits_static = bool(attrs & 0x10)
                if not bits_static:
                    out.setdefault(offs[k], (n, ti))
        pk = il2type(r['parent']) if r['parent'] >= 0 else None
        t = pk[1] if pk and pk[0] in (0x11, 0x12) else None
    return out


def disasm(i, n=400, raw=False):
    a = method_addr(i)
    m = meth(i)
    print('=' * 100)
    print('%s   @0x%x   token 0x%08x slot %d' % (mname(i, sig=True), a, m['token'], m['slot']))
    if not a:
        print('  (không có thân: abstract/extern/generic chưa gắn)')
        return
    idx = addr_index()
    # theo dõi thanh ghi (tuyến tính, bỏ qua nhánh): 'this' = đối tượng lớp chứa method, ('klass', t) = TypeInfo, ('st', t) = static_fields
    regs = {} if (m['flags'] & 0x10) else {'rcx': ('this', m['type'])}
    fcache = {}

    def fields_of(t, static):
        key = (t, static)
        if key not in fcache:
            fcache[key] = class_fields(t) if not static else static_fields(t)
        return fcache[key]

    o = va2off(a)
    cnt = 0
    for ins in md.disasm(data[o:o + n * 12], a):
        note = ''
        ops = [x.strip() for x in ins.op_str.split(',')]
        dst = R64.get(ops[0]) if ops and ins.mnemonic not in ('cmp', 'test', 'push', 'call', 'jmp') else None
        newval = None
        if not raw:
            if ins.mnemonic in ('call', 'jmp') and ins.op_str.startswith('0x'):
                tgt = int(ins.op_str, 16)
                ms = idx.get(tgt)
                if ms:
                    note = ' / '.join(mname(x) for x in ms[:3]) + (' (+%d)' % (len(ms) - 3) if len(ms) > 3 else '')
            t = rip_target(ins)
            if t is not None:
                if ins.mnemonic in ('movss', 'addss', 'subss', 'mulss', 'divss', 'comiss', 'ucomiss', 'maxss', 'minss', 'cvtss2sd'):
                    o2 = va2off(t)
                    note = 'float %g' % round(struct.unpack_from('<f', data, o2)[0], 6) if o2 else ''
                elif ins.mnemonic in ('movsd', 'addsd', 'subsd', 'mulsd', 'divsd', 'comisd', 'ucomisd'):
                    o2 = va2off(t)
                    note = 'double %g' % struct.unpack_from('<d', data, o2)[0] if o2 else ''
                else:
                    v = q(t)
                    note = usage_note(v) or ''
                    if not note and t in idx:
                        note = '&' + mname(idx[t][0])
                    if ins.mnemonic == 'mov' and v and (v & 1) and not v >> 32 and (v >> 29) & 7 == 1:
                        k = il2type((v & 0x1FFFFFFF) >> 1)
                        if k and k[0] in (0x11, 0x12):
                            newval = ('klass', k[1])
            if not note:
                mm = re.search(r', (0x[0-9a-f]{8})$', ins.op_str)
                if mm and ins.mnemonic == 'mov':
                    f = looks_float(int(mm.group(1), 16))
                    if f is not None:
                        note = 'float %g' % f
            mm = re.search(r'\[(r\w+) \+ (0x[0-9a-f]+)\]', ins.op_str)
            if mm and R64.get(mm.group(1)) in regs:
                kind, t2 = regs[R64[mm.group(1)]]
                off = int(mm.group(2), 16)
                if kind == 'klass' and off == 0xb8 and ins.mnemonic == 'mov':
                    newval = ('st', t2)
                elif kind in ('this', 'st', 'obj'):
                    fe = fields_of(t2, kind == 'st').get(off)
                    if fe:
                        if not note:
                            note = {'this': 'this.', 'st': tname(t2, True) + '.', 'obj': '(%s).' % tname(t2, True)}[kind] + fe[0]
                        k3 = il2type(fe[1])
                        if ins.mnemonic == 'mov' and k3 and k3[0] in (0x12, 0x15):
                            if k3[0] == 0x15:   # generic: lấy typeDef gốc
                                gt = struct.unpack_from('<Q', data, va2off(k3[1]))[0]
                                k3 = struct.unpack_from('<QI', data, va2off(gt))
                                k3 = ((k3[1] >> 16) & 0xFF, k3[0])
                            if k3[0] in (0x11, 0x12):
                                newval = ('obj', k3[1])
            elif mm is None and ins.mnemonic == 'mov' and len(ops) == 2 and R64.get(ops[1]) in regs:
                newval = regs[R64[ops[1]]]
            if not note:
                mm = re.search(r'call qword ptr \[r\w+ \+ (0x[0-9a-f]+)\]', ins.mnemonic + ' ' + ins.op_str)
                if mm:
                    note = 'gọi ảo, offset 0x%x' % int(mm.group(1), 16)
        if dst and not (ins.mnemonic == 'mov' and ops[0].startswith(('byte', 'word', 'dword', 'qword'))):
            if newval:
                regs[dst] = newval
            else:
                regs.pop(dst, None)
        if ins.mnemonic == 'call':
            for r in ('rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11'):
                regs.pop(r, None)
        print('  %x: %-8s %-50s%s' % (ins.address, ins.mnemonic, ins.op_str, ('; ' + note) if note else ''))
        cnt += 1
        if ins.mnemonic == 'int3' or cnt >= n:
            break


R64 = {}
for _r in ('ax', 'bx', 'cx', 'dx', 'si', 'di', 'bp', 'sp'):
    for _v in ('r' + _r, 'e' + _r, _r):
        R64[_v] = 'r' + _r
for _k in range(8, 16):
    for _v in ('r%d' % _k, 'r%dd' % _k, 'r%dw' % _k, 'r%db' % _k):
        R64[_v] = 'r%d' % _k


def static_fields(t):
    """{offset trong static_fields: tên} của lớp t."""
    r = td(t)
    offs = field_offsets(t)
    out = {}
    for k in range(r['nfield']):
        n, ti, _ = field(r['fieldStart'] + k)
        p = q(MR['types'] + 8 * ti) if MR else None
        if p and k < len(offs) and offs[k] >= 0:
            attrs = struct.unpack_from('<I', data, va2off(p) + 8)[0] & 0xFFFF
            if attrs & 0x10 and not attrs & 0x40:
                out.setdefault(offs[k], (n, ti))
    return out


def print_fields(t):
    r = td(t)
    offs = field_offsets(t)
    pk = il2type(r['parent']) if r['parent'] >= 0 else None
    print('%s  : %s   (typeDef %d, %d trường, %d method)' % (tname(t), type_name_idx(r['parent']) if pk else '-', t,
                                                             r['nfield'], r['nmeth']))
    for k in range(r['nfield']):
        fi = r['fieldStart'] + k
        n, ti, _ = field(fi)
        p = q(MR['types'] + 8 * ti) if MR else None
        attrs = struct.unpack_from('<I', data, va2off(p) + 8)[0] & 0xFFFF if p else 0
        dv = field_default(fi)
        print('  %-6s %-6s %-40s %-45s%s' % (('0x%x' % offs[k]) if k < len(offs) and offs[k] >= 0 else '-',
                                             'const' if attrs & 0x40 else ('static' if attrs & 0x10 else ''),
                                             type_name_idx(ti), n, (' = %s' % (dv,)) if dv is not None else ''))
    for k in range(r['nmeth']):
        i = r['methodStart'] + k
        print('  method %-70s @0x%x' % (mname(i, sig=True), method_addr(i)))


def scan_rel32(targets, ops=(0xE8, 0xE9)):
    """Tìm call/jmp rel32 tới các địa chỉ trong targets. Trả [(địa chỉ lệnh, đích)]."""
    import numpy as np
    tset = np.array(sorted(targets), dtype=np.int64)
    out = []
    for text in (s for s in SECS if s[0] in CODE_SECS):
        out += _scan_rel32(text, tset, ops)
    return out


CODE_SECS = ('il2cpp', '.text')   # mã game nằm ở mục "il2cpp", thư viện C++ ở ".text"


def _scan_rel32(text, tset, ops):
    import numpy as np
    _, va, vs, raw, rs = text
    buf = np.frombuffer(data, dtype=np.uint8, count=rs, offset=raw)
    out = []
    CH = 1 << 24
    for st in range(0, rs - 5, CH):
        en = min(rs - 5, st + CH)
        seg = buf[st:en + 5]
        pos = np.nonzero(np.isin(seg[:en - st], ops))[0]
        rel = (seg[pos + 1].astype(np.int64) | (seg[pos + 2].astype(np.int64) << 8) |
               (seg[pos + 3].astype(np.int64) << 16) | (seg[pos + 4].astype(np.int64) << 24))
        rel = np.where(rel >= 1 << 31, rel - (1 << 32), rel)
        dst = va + st + pos + 5 + rel
        hit = np.isin(dst, tset)
        for p, d in zip(pos[hit], dst[hit]):
            out.append((va + st + int(p), int(d)))
    return out


def scan_riprefs(targets):
    """Tìm lệnh có [rip+disp32] trỏ tới các địa chỉ dữ liệu trong targets (đoán theo disp32 + độ dài lệnh 0..5)."""
    import numpy as np
    tset = np.array(sorted(targets), dtype=np.int64)
    out = []
    for text in (s for s in SECS if s[0] in CODE_SECS):
        out += _scan_rip(text, tset)
    return out


def _scan_rip(text, tset):
    import numpy as np
    _, va, vs, raw, rs = text
    buf = np.frombuffer(data, dtype=np.uint8, count=rs, offset=raw)
    out = []
    CH = 1 << 23
    for st in range(0, rs - 4, CH):
        en = min(rs - 4, st + CH)
        seg = buf[st:en + 4].astype(np.int64)
        n = en - st
        rel = seg[0:n] | (seg[1:n + 1] << 8) | (seg[2:n + 2] << 16) | (seg[3:n + 3] << 24)
        rel = np.where(rel >= 1 << 31, rel - (1 << 32), rel)
        base = va + st + np.arange(n, dtype=np.int64) + 4 + rel
        for extra in (0, 1, 4):
            hit = np.nonzero(np.isin(base + extra, tset))[0]
            for p in hit:
                out.append((va + st + int(p), int(base[p] + extra)))
        del seg, rel, base
    return out


def containing_method(addr):
    idx = addr_index()
    best = max((a for a in idx if a <= addr), default=None) if not hasattr(containing_method, 'keys') else None
    if not hasattr(containing_method, 'keys'):
        containing_method.keys = sorted(idx)
    import bisect
    ks = containing_method.keys
    j = bisect.bisect_right(ks, addr) - 1
    return (ks[j], idx[ks[j]]) if j >= 0 else (None, [])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('spec', nargs='?')
    ap.add_argument('--find')
    ap.add_argument('--type')
    ap.add_argument('--fields')
    ap.add_argument('--xref')
    ap.add_argument('--strref')
    ap.add_argument('--addr')
    ap.add_argument('--usage')
    ap.add_argument('-n', type=int, default=400)
    ap.add_argument('--raw', action='store_true')
    a = ap.parse_args()
    if MR is None:
        print('! không tìm thấy Il2CppMetadataRegistration — tên kiểu lồng/generic sẽ thiếu')
    if a.find:
        rx = re.compile(a.find)
        for i, n in all_methods():
            if rx.search(n):
                print('%-90s @0x%x' % (mname(i, sig=True), method_addr(i)))
    elif a.type:
        rx = re.compile(a.type)
        for t in range(NTD):
            if rx.search(tname(t)):
                r = td(t)
                print('%-80s typeDef %-6d %d trường, %d method' % (tname(t), t, r['nfield'], r['nmeth']))
    elif a.fields:
        for t in match_types(a.fields):
            print_fields(t)
    elif a.xref:
        ms = resolve(a.xref)
        tg = {method_addr(i): i for i in ms if method_addr(i)}
        for site, d in scan_rel32(tg.keys()):
            ca, cm = containing_method(site)
            print('%x  %-40s ← %s' % (site, mname(tg[d]), ' / '.join(mname(x) for x in cm[:3]) if cm else '?'))
        # và qua ô metadata usage Method(...) (gọi qua MethodInfo, ví dụ delegate/UniRx)
        want = set()
        for i in ms:
            want.add((3 << 29) | (i << 1) | 1)
        slots = find_usage_slots(want)
        for site, d in scan_riprefs(slots):
            ca, cm = containing_method(site)
            print('%x  [MethodInfo] ← %s' % (site, ' / '.join(mname(x) for x in cm[:3]) if cm else '?'))
    elif a.strref:
        rx = re.compile(a.strref)
        want = {(5 << 29) | (k << 1) | 1: lit(k) for k in range(LIT[2]) if rx.search(lit(k))}
        slots = find_usage_slots(want.keys())
        for site, slot in scan_riprefs(slots):
            ca, cm = containing_method(site)
            print('%x  %-50s ← %s' % (site, repr(want[q(slot)])[:50], ' / '.join(mname(x) for x in cm[:3]) if cm else '?'))
    elif a.usage:
        rx = re.compile(a.usage)
        slots = {}
        for va, v in usage_slots():
            n = usage_note(v)
            if n and rx.search(n):
                slots[va] = n
        seen = set()
        for site, slot in scan_riprefs(slots.keys()):
            ca, cm = containing_method(site)
            key = (ca, slots[slot])
            if key in seen:
                continue
            seen.add(key)
            print('%x  %-50s ← %s' % (site, slots[slot][:50], ' / '.join(mname(x) for x in cm[:3]) if cm else '?'))
    elif a.addr:
        ca, cm = containing_method(int(a.addr, 16))
        print('0x%x trong hàm bắt đầu 0x%x: %s' % (int(a.addr, 16), ca or 0, ', '.join(mname(x, True) for x in cm)))
    elif a.spec:
        ms = resolve(a.spec)
        if not ms:
            print('không thấy method "%s" (thử --find)' % a.spec)
        for i in ms:
            disasm(i, a.n, a.raw)
    else:
        ap.print_help()


def usage_slots():
    """Mọi ô metadata-usage (địa chỉ, giá trị mã hoá) trong .data."""
    import numpy as np
    for name, va, vsz, raw, rs in SECS:
        if name != '.data':
            continue
        arr = np.frombuffer(data, dtype=np.uint64, count=rs // 8, offset=raw)
        kind = (arr >> np.uint64(29)) & np.uint64(7)
        ok = ((arr & np.uint64(1)) == 1) & (arr < np.uint64(1 << 32)) & (kind >= 1) & (kind <= 6)
        for k in np.nonzero(ok)[0]:
            yield va + 8 * int(k), int(arr[k])


def find_usage_slots(values):
    """Địa chỉ các ô trong .data chứa một trong các giá trị metadata-usage mã hoá."""
    import numpy as np
    vs = np.array(sorted(values), dtype=np.uint64)
    out = []
    for name, va, vsz, raw, rs in SECS:
        if name != '.data':
            continue
        arr = np.frombuffer(data, dtype=np.uint64, count=rs // 8, offset=raw)
        for k in np.nonzero(np.isin(arr, vs))[0]:
            out.append(va + 8 * int(k))
    return out


if __name__ == '__main__':
    main()
