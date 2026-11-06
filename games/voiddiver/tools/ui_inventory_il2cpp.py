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
Phần 2 (cần thêm numpy để quét chỗ gọi): thời gian giữ E (DropGoods/RewardBox/MonsterBody), khoá sắp xếp của nút
Sắp xếp, trang Menu mở bằng Esc/Tab, viền sáng ô, bảng túi.
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


# ---------------------------------------------------------------------------------------------------------------
# Phần 2: đọc thêm kiểu/trường để trả lời "hàm này đọc trường nào" (giữ đồ / nút Sắp xếp / Menu trong lặn / viền sáng ô).
#   typedef v39 = 82 byte: nameIndex @0, namespace @4, fieldStart @26, methodStart @30, method_count @58, field_count @62.
#   method: declaringType là u16 @4, vtable slot u16 @28.  field 12 byte {name, typeIndex, token};
#   fieldDefaultValue 12 byte {fieldIndex, typeIndex, dataIndex} → số nguyên nén kiểu il2cpp (enum).
#   Il2CppMetadataRegistration: tìm bằng 2 bộ đếm (fieldOffsets, typeDefinitionsSizes) cùng = số typedef.
#   metadata usage trong .data: q = (loại << 29) | (chỉ số << 1) | 1; loại 1 TypeInfo, 3 MethodDef, 5 literal, 6 MethodRef.
#   vtable của Il2CppClass bắt đầu ở +0x138, mỗi ô 16 byte → [klass + 0x138 + 16*slot].
FIELDS, FDV, DVDATA, TYPES = sec(11), sec(7), sec(8), sec(19)
_cache = {}


def td(i):
    o = TYPES[0] + 82 * i
    fs, ms = struct.unpack_from('<2i', mb, o + 26)
    mc, _pc, fc = struct.unpack_from('<3H', mb, o + 58)
    return dict(i=i, name=s_at(struct.unpack_from('<I', mb, o)[0]), fs=fs, ms=ms, mc=mc, fc=fc)


def find_type(name):
    if 'names' not in _cache:
        _cache['names'] = [s_at(struct.unpack_from('<I', mb, TYPES[0] + 82 * i)[0]) for i in range(TYPES[2])]
    return [td(i) for i, n in enumerate(_cache['names']) if n == name]


def _images():
    if 'img' not in _cache:
        out, gi = [], 0
        for i in range(IMAGES[2]):
            nm = s_at(struct.unpack_from('<I', mb, IMAGES[0] + 36 * i)[0])
            k = data.find(b'\0' + nm.encode() + b'\0')
            j = data.find(struct.pack('<Q', off2va(k + 1)))
            cnt = struct.unpack_from('<I', data, j + 8)[0]
            mp = struct.unpack_from('<Q', data, j + 16)[0]
            out.append((gi, mp, cnt))
            gi += cnt
        _cache['img'] = out
    return _cache['img']


def mname(g):
    return s_at(struct.unpack_from('<I', mb, METHODS[0] + 32 * g)[0])


def maddr(g):
    for gi, mp, cnt in _images():
        if gi <= g < gi + cnt:
            return struct.unpack_from('<Q', data, va2off(mp + 8 * (g - gi)))[0]


def mslot(g):
    return struct.unpack_from('<H', mb, METHODS[0] + 32 * g + 28)[0]


def methods(t):
    return [(g, mname(g)) for g in range(t['ms'], t['ms'] + t['mc'])] if t['ms'] >= 0 else []


def method(cls, name):
    for t in find_type(cls):
        for g, n in methods(t):
            if n == name:
                return maddr(g)
    raise KeyError(cls + '::' + name)


def q64(va):
    return struct.unpack_from('<Q', data, va2off(va))[0]


def _mreg():
    if 'mreg' not in _cache:
        pat = struct.pack('<Q', TYPES[2])
        i = data.find(pat)
        while not (i % 8 == 0 and data[i + 16:i + 24] == pat):
            i = data.find(pat, i + 1)
        _cache['mreg'] = struct.unpack_from('<14Q', data, i - 80)
    return _cache['mreg']


PRIM = {1: 'void', 2: 'bool', 8: 'int', 10: 'long', 12: 'float', 14: 'string', 0x1c: 'object'}


def type_name(tp, depth=0):
    d, bits = q64(tp), struct.unpack_from('<I', data, va2off(tp + 8))[0]
    k = (bits >> 16) & 0xFF
    if k in PRIM:
        return PRIM[k]
    if k in (0x11, 0x12):
        return td(d)['name']
    if k == 0x15 and depth < 4:
        return type_name(q64(d), depth + 1) + ginst(q64(d + 8), depth)
    if k == 0x1d and depth < 4:
        return type_name(d, depth + 1) + '[]'
    return '?'


def ginst(gi, depth=0):
    if not gi:
        return ''
    argv = q64(gi + 8)
    return '<' + ','.join(type_name(q64(argv + 8 * j), depth + 1) for j in range(q64(gi))) + '>'


def fields(t):
    """[(offset, tên, kiểu)] — offset lấy từ fieldOffsets của Il2CppMetadataRegistration."""
    r = _mreg()
    p = q64(r[11] + 8 * t['i'])
    out = []
    for k in range(t['fc']):
        n, ty, _tok = struct.unpack_from('<3I', mb, FIELDS[0] + 12 * (t['fs'] + k))
        out.append((struct.unpack_from('<i', data, va2off(p + 4 * k))[0] if p else None, s_at(n), type_name(q64(r[7] + 8 * ty))))
    return out


def field_at(cls, off):
    for o, n, ty in fields(find_type(cls)[0]):
        if o == off:
            return n, ty
    return '?+%#x' % off, '?'


def enum_values(name):
    if 'fdv' not in _cache:
        _cache['fdv'] = {struct.unpack_from('<i', mb, FDV[0] + 12 * k)[0]: struct.unpack_from('<i', mb, FDV[0] + 12 * k + 8)[0]
                         for k in range(FDV[2])}
    t = find_type(name)[0]
    out = []
    for k in range(t['fc']):
        f = t['fs'] + k
        if f in _cache['fdv']:
            o = DVDATA[0] + _cache['fdv'][f]
            b = mb[o]   # số nguyên nén: 1 byte (<0x80) hoặc 2 byte (10xxxxxx); enum ở đây đều nhỏ
            v = b if b < 0x80 else ((b & 0x3F) << 8) | mb[o + 1]
            out.append((s_at(struct.unpack_from('<I', mb, FIELDS[0] + 12 * f)[0]), -(v >> 1) - 1 if v & 1 else v >> 1))
    return out


def usage(q):
    kind, idx = q >> 29, (q & 0x1FFFFFFF) >> 1
    r = _mreg()
    if kind == 1:
        return type_name(q64(r[7] + 8 * idx))
    if kind == 3:
        return mname(idx)
    if kind == 5:
        return lit(idx)
    if kind == 6:
        md_, ci, mi = struct.unpack_from('<3i', data, va2off(r[9] + 12 * idx))
        return mname(md_) + (ginst(q64(r[3] + 8 * mi)) if mi >= 0 else '')
    return None


def slot_usage(ins):
    """lệnh `mov/lea reg, [rip + x]` trỏ tới một ô metadata usage → chuỗi mô tả (hoặc None)."""
    t = rip_target(ins)
    if t is None or va2off(t) is None:
        return None
    q = q64(t)
    return usage(q) if q & 1 and 1 <= q >> 29 <= 6 and q < 1 << 32 else None


def body(va, n=600):
    out = []
    for ins in insns(va, n):
        if ins.mnemonic == 'int3':
            break
        out.append(ins)
    return out


def call_target(ins):
    m = re.match(r'(0x[0-9a-f]+)$', ins.op_str)
    return int(m.group(1), 16) if ins.mnemonic in ('call', 'jmp') and m else None


def callers(target):
    """chỗ gọi `call/jmp rel32` tới target trong il2cpp + .text (cần numpy)."""
    import numpy as np
    s0, s1 = pe.sections[0], pe.sections[1]
    t0, tn, tva = s0.PointerToRawData, s1.PointerToRawData + s1.SizeOfRawData - s0.PointerToRawData, base + s0.VirtualAddress
    a = np.frombuffer(data, dtype=np.uint8, count=tn, offset=t0)
    out = []
    for s in range(1, tn - 8, 1 << 23):
        e = min(tn - 8, s + (1 << 23))
        rel = a[s:e].astype(np.int64) | a[s + 1:e + 1].astype(np.int64) << 8 | a[s + 2:e + 2].astype(np.int64) << 16 | a[s + 3:e + 3].astype(np.int64) << 24
        rel = np.where(rel >= 1 << 31, rel - (1 << 32), rel)
        idx = np.arange(s, e)
        out += [int(tva + h - 1) for h in idx[tva + idx + 4 + rel == target] if a[h - 1] in (0xE8, 0xE9)]
    return out


def owner_name(va, classes):
    """tên Lớp::hàm có địa chỉ gần nhất ≤ va trong các lớp cho trước."""
    best = None
    for c in classes:
        for t in find_type(c):
            for g, n in methods(t):
                a = maddr(g)
                if a and a <= va and (best is None or a > best[0]):
                    best = (a, c + '::' + n)
    return best[1] if best else hex(va)


def getter_field(va):
    """getter kiểu `movss xmm0, [rcx|rax + off]` → (hàm gọi trước đó, off)."""
    callee = None
    for ins in body(va, 40):
        c = call_target(ins)
        if c and ins.mnemonic == 'call':
            callee = c
        m = re.match(r'xmm0, dword ptr \[r(?:cx|ax) \+ (0x[0-9a-f]+)\]', ins.op_str)
        if ins.mnemonic == 'movss' and m:
            return callee, int(m.group(1), 16)
    return callee, None


def holding_time():
    print('\n[1] Thời gian giữ phím E')
    _, off = getter_field(method('DropGoods', 'get_HoldingTime'))
    fld = field_at('DropGoods', off)
    ctor = [ins for ins in body(method('DropGoods', '.ctor'), 80)
            if ins.mnemonic == 'mov' and ('[rdi + %#x]' % off) in ins.op_str]
    dflt = struct.unpack('<f', struct.pack('<I', int(ctor[0].op_str.split(', ')[-1], 16)))[0] if ctor else None
    print('  DropGoods.get_HoldingTime   = this.%s (@%#x, %s); .ctor mặc định %s, prefab ghi đè (0.25)' % (fld[0], off, fld[1], dflt))
    callee, off = getter_field(method('RewardBox', 'get_HoldingTime'))
    print('  RewardBox.get_HoldingTime   = get_TableData().%s  (bảng RewardBox.HoldingTime)' % field_at('TRewardBox', off)[0])
    callee, off = getter_field(method('MonsterBody', 'get_HoldingTime'))
    lt = method('TConst', 'get_LootingInteractionTime')
    print('  MonsterBody.get_HoldingTime = %s().%s' % ('TConst.get_LootingInteractionTime' if callee == lt else hex(callee or 0), field_at('TConst', off)[0]))
    try:
        who = sorted(set(owner_name(c, ['MonsterBody', 'DropGoods', 'RewardBox', 'InteractiveTrigger', 'CharacterInteractState']) for c in callers(lt)))
        print('  ai gọi TConst.get_LootingInteractionTime:', who)
    except ImportError:
        print('  (cài numpy để quét chỗ gọi TConst.get_LootingInteractionTime)')
    # CharacterInteractState.OnEnter: _holdingRemainTime = target.(IInteractiveObject slot r8d)() — không nhân hệ số nào
    last_r8, slot, dst = None, None, None
    for ins in body(method('CharacterInteractState', 'OnEnter'), 400):
        m = re.match(r'r8d, (\d+|0x[0-9a-f]+)$', ins.op_str)
        if ins.mnemonic == 'mov' and m:
            last_r8 = int(m.group(1), 0)
        if ins.mnemonic == 'call' and ins.op_str == 'r8':
            slot = last_r8
        m = re.match(r'dword ptr \[rdi \+ (0x[0-9a-f]+)\], xmm0$', ins.op_str)
        if ins.mnemonic == 'movss' and m and slot is not None:
            dst = int(m.group(1), 16)
            break
    iface = [n for g, n in methods(find_type('IInteractiveObject')[0])]
    print('  CharacterInteractState.OnEnter: this.%s = target.IInteractiveObject.%s()  (không nhân hệ số)'
          % (field_at('CharacterInteractState', dst)[0], iface[slot] if slot is not None else '?'))


def organize():
    print('\n[2] Nút Sắp xếp (SlotSort, phím R) = InventoryExtensions.Organize')
    goods = find_type('Goods')[0]
    vslot = {mslot(g): n for g, n in methods(goods)}
    chain, pending = [], None
    for ins in body(method('InventoryExtensions', 'Organize'), 500):
        u = slot_usage(ins) if ins.mnemonic == 'mov' else None
        if not u:
            continue
        if u.startswith('<Organize>b__'):
            pending = u
        elif re.match(r'(OrderBy|OrderByDescending|ThenBy|ThenByDescending)<', u) and pending:
            chain.append((u.split('<')[0], pending))
            pending = None
    lam_addr = {}
    for t in find_type('<>c'):
        for g, n in methods(t):
            if n.startswith('<Organize>b__'):
                lam_addr[n] = maddr(g)
    for op, ln in chain:
        key = '?'
        ins_l = body(lam_addr[ln], 30)
        txt = ' ; '.join(i.mnemonic + ' ' + i.op_str for i in ins_l)
        m1 = re.search(r'cmp qword ptr \[rdx \+ (0x[0-9a-f]+)\], 0 ; sete', txt)
        m2 = re.search(r'mov rax, qword ptr \[rdx \+ (0x[0-9a-f]+)\] ; mov rdx, qword ptr \[rdx \+ 0x', txt)
        m3 = re.search(r'mov eax, dword ptr \[rax \+ (0x[0-9a-f]+)\]', txt)
        if m1:
            key = 'slot.%s == null' % field_at('GoodsSlot', int(m1.group(1), 16))[0]
        elif m2:
            key = 'slot.Goods?.%s() (vtable slot %d, null → 0)' % (vslot.get((int(m2.group(1), 16) - 0x138) // 16), (int(m2.group(1), 16) - 0x138) // 16)
        elif m3:
            key = 'slot.Goods?.%s (null → 0)' % field_at('Goods', int(m3.group(1), 16))[0]
        print('  .%-17s %-15s %s' % (op, ln, key))
    print('  → ToList(); gán lại SlotIndex = 0..n-1 cho MỌI ô của từ điển (cả ô trống); không gộp chồng.')
    print('  EGoodsType     ', enum_values('EGoodsType'))
    print('  EGoodsGradeType', enum_values('EGoodsGradeType'))
    # OnOrganizeButtonClick: xét _selectedSlotModel.SlotCategory → gửi yêu cầu nào
    cats = dict((v, n) for n, v in enum_values('EGoodsSlotCategory'))
    last, act = None, []
    for ins in body(method('InventoryManagementPagePresenter', 'OnOrganizeButtonClick'), 200):
        m = re.match(r'eax, (\d+)$', ins.op_str)
        if ins.mnemonic == 'cmp' and m:
            last = int(m.group(1))
        u = slot_usage(ins) if ins.mnemonic == 'mov' else None
        if u and u.startswith('ReqOrganize'):
            act.append((last, u))
        c = call_target(ins)
        if c and c == method('PlayerManager', 'get_StashSlots'):
            act.append((last, 'PlayerManager.StashSlots.Organize() (tại chỗ)'))
    sel = field_at('InventoryManagementPagePresenter', 0x108)[0]
    print('  OnOrganizeButtonClick (bỏ qua khi _isDragging) theo %s.SlotCategory:' % sel)
    for c, a in act:
        print('     %s(%s) → %s' % (cats.get(c), c, a))
    for r in ('OnOrganizeInventorySlots', 'OnOrganizeInventorySafeSlots'):
        src = [n for ins in body(method('CharacterController', r), 20) for n in [call_target(ins)] if n]
        print('  host CharacterController.%s → Organize(%s)' % (r, 'PlayerInventory.SafeSlots' if 'Safe' in r else 'Inventory.Slots'))


def menu():
    print('\n[3] InGame/Menu (Esc) và InGame/Inventory (Tab)')
    pages = enum_values('EPageCategory')
    off = [o for o, n, t in fields(find_type('MenuPopupModel')[0]) if n.startswith('<PageCategory>')][0]
    for h in ('OnMenuClick', 'OnInventoryClick'):
        pg = 0
        for ins in body(method('InGameScene', h), 200):
            m = re.match(r'dword ptr \[rdi \+ (0x[0-9a-f]+)\], (\d+)$', ins.op_str)
            if ins.mnemonic == 'mov' and m and int(m.group(1), 16) == off:
                pg = int(m.group(2))
        print('  InGameScene.%-16s → Open<MenuPopupPresenter>(PageCategory=%d %s; layout = IsInLounge ? InventoryStash : InventoryOnly)'
              % (h, pg, pages[pg][0]))
    print('  EPageCategory = thứ tự tab', pages)
    npc = None
    for ins in body(method('MenuPopupPresenter', 'get_IsSquadTabLocked'), 80):
        m = re.match(r'edx, (0x[0-9a-f]+)$', ins.op_str)
        if ins.mnemonic == 'mov' and m:
            npc = int(m.group(1), 16)
    print('  IsSquadTabLocked = !CheckStateConditions(Npc[%s].UnlockConditions) || GameManager.IsTutorial; chỉ tab Squad(4) bị khoá,'
          ' bấm vào → toast SquadTabLockedMessage + sfx Fail; OnTabLeft/Right nhảy qua tab 4 khi khoá, không vòng.' % npc)


def _mem_offsets(ins_list, pat):
    return [int(m.group(1), 16) for i in ins_list for m in [re.search(pat, i.op_str)] if m]


def highlight():
    print('\n[4] Viền sáng ô (InventoryGoodsSlotView.highlight)')
    # InventoryGoodsSlotPresenter.<OnInject>b__35_1: view.<+off>.SetActive(bool) — là handler Subscribe của model.RxHighlightOn
    vo = _mem_offsets(body(method('InventoryGoodsSlotPresenter', '<OnInject>b__35_1'), 20), r'^rcx, qword ptr \[rcx \+ (0x[0-9a-f]+)\]$')
    print('  InventoryGoodsSlotPresenter.<OnInject>b__35_1: view.%s.SetActive(RxHighlightOn)' % field_at('InventoryGoodsSlotView', vo[-1])[0])
    lam = [maddr(g) for t in find_type('<>c__DisplayClass20_0') for g, n in methods(t) if n == '<OnHighlightCategoryChanged>b__0']
    ins_l = body(lam[0], 30)
    c = _mem_offsets(ins_l, r'^dword ptr \[rbx \+ (0x[0-9a-f]+)\], eax$')
    r = _mem_offsets(ins_l, r'^rcx, qword ptr \[rbx \+ (0x[0-9a-f]+)\]$')
    print('  ô trang bị (EquipmentInventoryPanelPresenter.OnHighlightCategoryChanged, cho vũ khí/phụ kiện/artifact):'
          ' slot.%s = (slot.%s == cat)' % (field_at('InventoryGoodsSlotModel', r[0])[0], field_at('InventoryGoodsSlotModel', c[0])[0]))
    r = _mem_offsets(body(method('BagPanelPresenter', 'OnDragAcceptableChanged'), 80), r'^rcx, qword ptr \[rax \+ (0x[0-9a-f]+)\]$')
    print('  ô túi (BagPanelPresenter.OnDragAcceptableChanged): mọi ô túi .%s = RxIsDragAcceptable' % field_at('InventoryGoodsSlotModel', r[0])[0])
    drag = body(method('InventoryManagementPagePresenter', 'OnSlotDrag'), 400)
    names = {call_target(i) for i in drag}
    vs = [(o - 0x138) // 16 for o in _mem_offsets(drag, r'^rax, qword ptr \[rdx \+ (0x[0-9a-f]+)\]$')]
    vslot = {mslot(g): n for g, n in methods(find_type('Goods')[0])}
    print('  InventoryManagementPagePresenter.OnSlotDrag: nếu Category==Equipment và CheckEquipable%s → RxHighlightCategory = GetSlotCategory(Type);'
          ' nếu túi đang mở và đồ kéo không phải Bag → RxIsDragAcceptable = (Goods.%s() == TBag[túi].Type); OnSlotEndDrag trả về None/false'
          % ('' if method('InventoryManagementPagePresenter', 'CheckEquipable') in names else '(?)', vslot.get(vs[0]) if vs else '?'))


def _calls(va, n=900):
    return [c for i in body(va, n) for c in [call_target(i)] if c]


def _name_of(va, classes):
    for c in classes:
        for t in find_type(c):
            for g, n in methods(t):
                if maddr(g) == va:
                    return c + '::' + n
    return None


def bag_panel():
    print('\n[5] Bảng túi (BagPanel)')
    P = 'InventoryManagementPagePresenter'
    try:
        for m in ('UseBag', 'CloseBagPanel', 'OpenBagPanel'):
            who = sorted(set(owner_name(c, [P]) for c in callers(method(P, m))))
            print('  ai gọi %s.%s: %s' % (P, m, who or '(không ai gọi trực tiếp)'))
    except ImportError:
        pass
    print('  (<InitBagPanel>b__51_0 = handler BagPanelModel.OnBack → CloseBagPanel; OnUseButtonClick: đồ Category=Bag → UseBag)')
    ub = body(method(P, 'UseBag'), 300)
    offs, hide = [], None
    for k, ins in enumerate(ub):
        m = re.match(r'rcx, qword ptr \[rcx \+ (0x[0-9a-f]+)\]$', ins.op_str)
        if ins.mnemonic == 'mov' and m:
            offs.append(int(m.group(1), 16))
        if call_target(ins) == method('BagPanelPresenter', 'Open'):
            hide = 'after'
        if hide == 'after' and offs and call_target(ins) and 'SetActive' in (_name_of(call_target(ins), ['GameObject']) or ''):
            print('  UseBag: BagPanelPresenter.Open(), rồi view.%s.SetActive(false) — CloseBagPanel bật lại' % field_at('InventoryManagementPageView', offs[-1])[0])
            break
    adds = [maddr(g) for t in find_type('PlayerInventory') for g, n in methods(t) if n == 'CanAddGoods']   # 2 overload
    seen = set()
    for a in adds:
        seen |= set(_name_of(c, ['PlayerInventory', 'TLocalizedText', 'InventoryExtensions']) for c in _calls(a))
    print('  PlayerInventory.CanAddGoods dùng:', sorted(x for x in seen if x and ('Bag' in x or 'SameBag' in x)))
    pg = [_name_of(c, ['PlayerInventory', 'InventoryExtensions']) for c in _calls(method('PlayerInventory', 'PushGoods'))]
    print('  PlayerInventory.PushGoods thứ tự gọi:', [x for x in pg if x])
    sb = [_name_of(c, ['BagSlotExtensions', 'GamePlayer']) for c in _calls(method('PlayerInventory', 'StackIntoExistingBags'))]
    print('  PlayerInventory.StackIntoExistingBags (chỉ Category=Item) gọi:', [x for x in sb if x])


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
    holding_time()
    organize()
    menu()
    highlight()
    bag_panel()


if __name__ == '__main__':
    main()
