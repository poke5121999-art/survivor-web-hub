# -*- coding: utf-8 -*-
"""Bóc menu Options gốc của PokéOne từ mã máy IL2CPP -> data/settings.js.

    set PYTHONIOENCODING=utf-8 && python games/pokeone/tools/rip_ui_settings.py

GameAssembly.dll trên đĩa bị Themida nén/mã hoá (mọi section entropy ~7.98), nên phải nạp nó bằng
LoadLibrary trong một tiến trình 32 bit (PowerShell ở SysWOW64) rồi chép ảnh bộ nhớ ra — đúng cách
Il2CppDumper-x86 đã làm ("Use custom PE loader"). Sau đó dịch ngược bằng capstone và dò theo dòng:
  OptionsHandler.ClickCatagory -> thứ tự, nhãn, loại, lựa chọn từng dòng theo 4 tab;
  OptionsHandler.Load          -> mặc định PlayerPrefs.GetInt/GetFloat(key, mặc định);
  ControlActions.ctor / CreateWithDefaultBindings -> tên action và phím mặc định.
Mẫu mã đổi thì assert báo rõ chỗ hỏng, không đoán.
"""
import os, re, json, struct, shutil, subprocess, tempfile, bisect
import capstone
from capstone import x86

REF = 'D:/pokeone-ref'
DLL = REF + '/extract/app/files/GameAssembly.dll'
IL2 = REF + '/il2cpp'
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'data')
PS32 = r'C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe'

PS_DUMP = r'''param([string]$Dll, [string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class K {
  [DllImport("kernel32", SetLastError=true, CharSet=CharSet.Unicode)] public static extern IntPtr LoadLibraryW(string p);
  [StructLayout(LayoutKind.Sequential)] public struct MBI { public IntPtr Base, AllocBase; public uint AllocProt; public IntPtr Size; public uint State, Protect, Type; }
  [DllImport("kernel32")] public static extern IntPtr VirtualQuery(IntPtr a, out MBI m, IntPtr len);
}
"@
if ([IntPtr]::Size -ne 4) { throw "powershell is 64-bit" }
$h = [K]::LoadLibraryW($Dll)
if ($h -eq [IntPtr]::Zero) { throw "LoadLibrary failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$b = $h.ToInt32(); $Mar = [Runtime.InteropServices.Marshal]
$size = $Mar::ReadInt32([IntPtr]($b + $Mar::ReadInt32([IntPtr]($b + 0x3C)) + 0x50))
$buf = New-Object byte[] $size; $off = 0
while ($off -lt $size) {
  $m = New-Object K+MBI
  [void][K]::VirtualQuery([IntPtr]($b + $off), [ref]$m, [IntPtr]28)
  $n = [Math]::Min($m.Size.ToInt32() - (($b + $off) - $m.Base.ToInt32()), $size - $off)
  if (($m.State -eq 0x1000) -and (($m.Protect -band 0x101) -eq 0) -and ($m.Protect -ne 0)) { $Mar::Copy([IntPtr]($b + $off), $buf, $off, $n) }
  $off += $n
}
[IO.File]::WriteAllBytes($Out, $buf)
"{0:X8}" -f $b
'''

CAT_BUTTON_LABEL = 'Tabname'
TOGGLES = [{'Disabled', 'Enabled'}, {'Off', 'On'}]
# Dòng chỉ có nghĩa khi có người chơi khác / máy chủ; bản web chơi một mình thì ẩn.
OFFLINE = {
    'sFlyLimit': 'giới hạn số người chơi khác đang bay được vẽ',
    'sOverlay': 'lớp phủ trận PvP 1v1',
    'sChatFilter': 'lọc từ bậy trong chat nhiều người',
    'sTrade': 'nhận lời mời trao đổi', 'sBattle': 'nhận lời thách đấu', 'sFriend': 'nhận lời kết bạn',
    'sUsername': 'hiện tên người chơi trên đầu (suy luận từ nhãn, chưa lần tới chỗ đọc)',
    'key:Social': 'mở cửa sổ bạn bè/guild', 'key:PvP': 'mở cửa sổ PvP',
}


def s32(v):
    return v - (1 << 32) if v & 0x80000000 else v


def f32(bits):
    """float32 ra số ngắn nhất vẫn khớp đúng từng bit (0x3eb33333 -> 0.35)."""
    raw = struct.pack('<I', bits & 0xFFFFFFFF)
    x = struct.unpack('<f', raw)[0]
    for d in range(1, 10):
        if struct.pack('<f', round(x, d)) == raw:
            return round(x, d)
    return x


class Image:
    def __init__(self):
        tmp = tempfile.mkdtemp(prefix='p1opt')
        ps1, out = os.path.join(tmp, 'dump.ps1'), os.path.join(tmp, 'ga.mem')
        with open(ps1, 'w', encoding='utf-8') as f:
            f.write(PS_DUMP)
        r = subprocess.run([PS32, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, os.path.abspath(DLL), out],
                           capture_output=True, text=True)
        assert r.returncode == 0 and re.fullmatch(r'[0-9A-F]{8}', r.stdout.strip()), \
            'memory dump of GameAssembly.dll failed: ' + r.stdout + r.stderr
        self.base = int(r.stdout.strip(), 16)
        with open(out, 'rb') as f:
            self.mem = f.read()
        shutil.rmtree(tmp)
        assert self.mem[:2] == b'MZ', 'memory image has no MZ header at %08x' % self.base

        sj = json.load(open(IL2 + '/script.json', encoding='utf-8'))
        # Gộp mã giống hệt (generic dùng chung, hàm rỗng) khiến một địa chỉ mang nhiều tên.
        self.fn, self.by_name = {}, {}
        for m in sj['ScriptMethod']:
            self.fn.setdefault(self.base + m['Address'], set()).add(m['Name'])
            self.by_name.setdefault(m['Name'], []).append(m['Address'])
        self.md = {self.base + m['Address']: m['Name'] for m in sj['ScriptMetadata']}
        self.mm = {self.base + m['Address']: m['Name'] for m in sj['ScriptMetadataMethod']}
        self.starts = sorted(set(sj['Addresses']))
        self.lit = {self.base + int(x['address'], 16): x['value']
                    for x in json.load(open(IL2 + '/stringliteral.json', encoding='utf-8'))}
        self.cs = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
        self.cs.detail = True

    def rva(self, name):
        a = set(self.by_name.get(name, []))
        assert len(a) == 1, 'method %s resolves to %d addresses in script.json' % (name, len(a))
        return a.pop()

    def code(self, rva):
        end = self.starts[bisect.bisect_right(self.starts, rva)]
        return list(self.cs.disasm(self.mem[rva:end], self.base + rva))

    def cstr(self, va):
        o = va - self.base
        if not 0 <= o < len(self.mem):
            return None
        e = self.mem.find(b'\0', o, o + 256)
        s = self.mem[o:e] if e > o else b''
        return s.decode('ascii') if s and all(32 <= c < 127 for c in s) else None


def trace(img, ins_list, on_call, follow_jmp=()):
    """Dò tuyến tính một hàm, giữ giá trị ký hiệu cho thanh ghi / ngăn xếp đối số.
    Giá trị: ('str',s) ('imm',n) ('md',tên) ('mm',tên) ('arg',off) ('load',gốc,off) ('icall',tên) ('?',);
    mảng/đối tượng mới cấp là dict (dùng chung tham chiếu nên ghi sau khi push vẫn thấy)."""
    by_addr = {i.address: k for k, i in enumerate(ins_list)}
    regs, stack, mem = {}, [], {}
    unknown = ('?',)

    def reg(op, i):
        return i.reg_name(op.reg)

    def absval(va):
        if va in mem:
            return mem[va]
        for tab, tag in ((img.lit, 'str'), (img.md, 'md'), (img.mm, 'mm')):
            if va in tab:
                return (tag, tab[va])
        return ('abs', va)

    def load(op, i):
        m = op.mem
        if m.index:
            return unknown
        if not m.base:
            return absval(m.disp & 0xFFFFFFFF)
        b = i.reg_name(m.base)
        if b == 'ebp':
            return ('arg', s32(m.disp))
        if b == 'esp':
            return unknown
        base = regs.get(b, unknown)
        if isinstance(base, dict):
            got = (base['items'] if base['k'] == 'arr' else base['f']).get(m.disp - (0x10 if base['k'] == 'arr' else 0))
            if got is not None:
                return got
        return ('load', base, m.disp)

    def value(op, i):
        if op.type == x86.X86_OP_IMM:
            return ('imm', op.imm & 0xFFFFFFFF)
        if op.type == x86.X86_OP_REG:
            return regs.get(reg(op, i), unknown)
        return load(op, i)

    def store(op, v, i):
        m = op.mem
        if m.index:
            return
        if not m.base:
            mem[m.disp & 0xFFFFFFFF] = v
            return
        b = i.reg_name(m.base)
        if b == 'esp':
            if m.disp == 0 and stack:
                stack[-1] = v
            return
        tgt = regs.get(b)
        if isinstance(tgt, dict):
            if tgt['k'] == 'arr':
                tgt['items'][m.disp - 0x10] = v
            else:
                tgt['f'][m.disp] = v
        elif tgt is not None:
            on_call({'store'}, [tgt, m.disp, v], i)

    def do_call(i, target):
        args = stack[::-1]
        ecx, edx = regs.get('ecx', unknown), regs.get('edx', unknown)
        ecx, edx = [v if isinstance(v, tuple) else unknown for v in (ecx, edx)]
        ret = unknown
        names = img.fn.get(target) if isinstance(target, int) else None
        if isinstance(target, tuple) and target[0] == 'icall':
            names = {target[1]}
        if names and len(args) >= 3 and args[-1] == ('mm', 'Method$System.Collections.Generic.List<string>..ctor()') \
                and isinstance(args[0], dict) and isinstance(args[1], dict) and args[1]['k'] == 'arr':
            args[0]['items'] = args[1]['items']
        if names:
            on_call(names, args, i)
        elif ecx[0] == 'md' and ecx[1].endswith('[]_TypeInfo') and edx[0] == 'imm':
            ret = {'k': 'arr', 'cls': ecx[1], 'n': edx[1], 'items': {}}
        elif ecx[0] == 'md':
            ret = {'k': 'obj', 'cls': ecx[1], 'f': {}}
        elif ecx[0] == 'imm' and img.cstr(ecx[1]) and '::' in img.cstr(ecx[1]):
            ret = ('icall', img.cstr(ecx[1]))
        for r in ('eax', 'ecx', 'edx'):
            regs[r] = unknown
        regs['eax'] = ret
        stack.clear()

    k = 0
    while k < len(ins_list):
        i = ins_list[k]
        k += 1
        mn, ops = i.mnemonic, i.operands
        if mn == 'push':
            stack.append(value(ops[0], i))
        elif mn in ('mov', 'movss', 'movd') and ops[0].type == x86.X86_OP_MEM:
            store(ops[0], value(ops[1], i), i)
        elif mn in ('mov', 'movss') and ops[0].type == x86.X86_OP_REG:
            regs[reg(ops[0], i)] = value(ops[1], i)
        elif mn == 'xorps' and ops[0].reg == ops[1].reg:
            regs[reg(ops[0], i)] = ('imm', 0)
        elif mn == 'call':
            op = ops[0]
            if op.type == x86.X86_OP_IMM:
                do_call(i, op.imm & 0xFFFFFFFF)
            else:
                do_call(i, value(op, i))
        elif mn == 'jmp' and ops[0].type == x86.X86_OP_IMM and (ops[0].imm & 0xFFFFFFFF) in by_addr:
            # Nhánh gộp đuôi: mã dựng đối số rồi nhảy tới "push edi; call AddSetting" dùng chung.
            j = by_addr[ops[0].imm & 0xFFFFFFFF]
            tail = ins_list[j:j + 3]
            hit = [t for t in tail if t.mnemonic == 'call' and t.operands[0].type == x86.X86_OP_IMM
                   and img.fn.get(t.operands[0].imm & 0xFFFFFFFF, set()) & set(follow_jmp)]
            if hit:
                for t in tail[:tail.index(hit[0])]:
                    assert t.mnemonic == 'push', 'unexpected %s before tail call at %x' % (t.mnemonic, t.address)
                    stack.append(value(t.operands[0], t))
                do_call(i, hit[0].operands[0].imm & 0xFFFFFFFF)
            stack.clear()
        elif mn == 'ret':
            stack.clear()
        else:
            for r in i.regs_access()[1]:
                regs[i.reg_name(r)] = unknown
            if mn == 'cmp' and ops[1].type == x86.X86_OP_IMM:
                on_call({'cmp'}, [ops[1].imm], i)


def dump_class(src, kind, name):
    hits = [m.start() for m in re.finditer(r'^public (?:sealed )?%s %s\b[^\n]*\n\{' % (kind, re.escape(name)), src, re.M)]
    assert len(hits) == 1, '%s %s found %d times in dump.cs' % (kind, name, len(hits))
    return src[hits[0]:src.index('\n}', hits[0])]


def instance_fields(block):
    return {int(o, 16): (t, n) for t, n, o in
            re.findall(r'^\t(?:public|private|internal|protected) (?!static |const )(?:readonly )?([\w<>\[\], .]+?) (\w+); // 0x([0-9A-F]+)$',
                       block, re.M)}


def enum_values(block, name):
    return {int(v): k for k, v in re.findall(r'public const %s (\w+) = (-?\d+);' % name, block)}


def ui_entry(ui_js, block, key):
    """ui.js ghi mỗi mục một dòng `"khoá":{...},` trong khối P1.<block> = {...};"""
    start = ui_js.index('\nP1.%s = {\n' % block)
    prefix = '\n%s:' % json.dumps(key, ensure_ascii=False)
    at = ui_js.index(prefix, start)
    line = ui_js[at + 1:ui_js.index('\n', at + 1)].rstrip(',')
    return json.loads('{' + line + '}')[key]


def node_at(root, path):
    parts = path.split('/')
    assert parts[0] == root['n'], 'path %s does not start at %s' % (path, root['n'])
    n = root
    for p in parts[1:]:
        n = next((c for c in n.get('c', []) if c['n'] == p), None)
        assert n is not None, 'node %s missing in ui.js' % path
    return n


def find_label(n, name):
    if n['n'] == name and n.get('w', {}).get('kind') == 'label':
        return n['w'].get('text')
    for c in n.get('c', []):
        t = find_label(c, name)
        if t is not None:
            return t
    return None


def categories():
    ui_js = open(os.path.join(DATA, 'ui.js'), encoding='utf-8').read()
    root = ui_entry(ui_js, 'UI', 'Panel - Options')
    drv = ui_entry(ui_js, 'UI_DRIVERS', 'OptionsHandler')
    labels = [find_label(node_at(root, p), CAT_BUTTON_LABEL) for p in drv['Buttons']]
    assert len(labels) == 4 and all(labels), 'category button labels missing in ui.js: %r' % labels
    reset = ui_entry(ui_js, 'UI_PREFABS', drv['SettingPrefabs'][3])
    return labels, find_label(reset, 'Label')


def rip_bindings(img, src):
    ca = dump_class(src, 'class', 'ControlActions')
    fields = instance_fields(ca)
    act_name = {}

    def ctor_ev(names, args, i):
        if 'InControl.PlayerAction$$.ctor' in names:
            assert args[1][0] == 'str', 'PlayerAction ctor at %x has no literal name' % i.address
            args[0]['name'] = args[1][1]
        elif 'store' in names and args[0] == ('arg', 8) and isinstance(args[2], dict) and 'name' in args[2]:
            act_name[args[1]] = args[2]['name']
    trace(img, img.code(img.rva('ControlActions$$.ctor')), ctor_ev)
    for off, (t, n) in fields.items():
        assert t != 'PlayerAction' or off in act_name, 'ControlActions.%s has no CreatePlayerAction name' % n

    keys = enum_values(dump_class(src, 'enum', 'Key'), 'Key')
    pads = enum_values(dump_class(src, 'enum', 'InputControlType'), 'InputControlType')
    binds = {off: [] for off in act_name}

    def bind_ev(names, args, i):
        if 'InControl.PlayerAction$$AddDefaultBinding' not in names:
            return
        act, srcb = args[0], args[1]
        assert act[0] == 'load' and act[2] in act_name, 'AddDefaultBinding at %x: target is not a ControlActions field' % i.address
        if isinstance(srcb, dict) and srcb['cls'] == 'InControl.Key[]_TypeInfo':
            ks = [srcb['items'][4 * n] for n in range(srcb['n'])]
            assert all(v[0] == 'imm' for v in ks), 'key array at %x has non-constant keys' % i.address
            got = '+'.join(keys[v[1]] for v in ks)
        elif isinstance(srcb, dict) and srcb['cls'] == 'InControl.DeviceBindingSource_TypeInfo':
            v = srcb['f'].get(0xc)
            assert v and v[0] == 'imm', 'DeviceBindingSource at %x has no constant control' % i.address
            got = 'pad:' + pads[v[1]]
        else:
            raise AssertionError('AddDefaultBinding at %x: unknown binding source %r' % (i.address, srcb))
        # Mã gốc gắn Mount hai lần (Shift, Action4); InControl bỏ bản trùng nên ở đây cũng bỏ.
        if got not in binds[act[2]]:
            binds[act[2]].append(got)
    trace(img, img.code(img.rva('ControlActions$$CreateWithDefaultBindings')), bind_ev)
    return act_name, binds


def rip_defaults(img):
    got = {}

    def ev(names, args, i):
        m = re.match(r'UnityEngine\.PlayerPrefs::Get(Int|Float)\(', min(names))
        if not m:
            return
        key, dv = args[0], args[1]
        assert key[0] == 'str' and dv[0] == 'imm', 'PlayerPrefs.Get%s at %x has non-literal args' % (m.group(1), i.address)
        got.setdefault(key[1], dv[1] if m.group(1) == 'Int' else f32(dv[1]))
    trace(img, img.code(img.rva('OptionsHandler$$Load')), ev)
    assert 'sLimitFPS' in got, 'literal sLimitFPS not read by PlayerPrefs in OptionsHandler.Load'
    return got


def category_ranges(code):
    """Nhảy theo tham số id (ClickCatagory(int id) = [ebp+0xc]) -> địa chỉ đầu mỗi tab."""
    ids = [i.reg_name(i.operands[0].reg) for i in code if i.mnemonic == 'mov' and i.operands[1].type == x86.X86_OP_MEM
           and i.reg_name(i.operands[1].mem.base) == 'ebp' and i.operands[1].mem.disp == 0xc]
    assert len(ids) == 1, 'ClickCatagory loads its id argument %d times' % len(ids)
    cases = {}
    for k, (a, b) in enumerate(zip(code, code[1:])):
        o = a.operands
        if not (o and o[0].type == x86.X86_OP_REG and a.reg_name(o[0].reg) == ids[0] and b.mnemonic in ('je', 'jne')):
            continue
        if a.mnemonic == 'test' and o[1].type == x86.X86_OP_REG and o[1].reg == o[0].reg:
            v = 0
        elif a.mnemonic == 'cmp' and o[1].type == x86.X86_OP_IMM:
            v = o[1].imm
        else:
            continue
        cases.setdefault(v, (b.operands[0].imm & 0xFFFFFFFF) if b.mnemonic == 'je' else code[k + 2].address)
    assert sorted(cases) == [0, 1, 2, 3], 'ClickCatagory dispatch on category id not found: %r' % cases
    return cases


def rip_rows(img, src):
    code = img.code(img.rva('OptionsHandler$$ClickCatagory'))
    cases = category_ranges(code)
    bounds = sorted(cases.values()) + [code[-1].address + 1]
    cat_of = lambda va: next((c for c, s in cases.items() if s <= va < bounds[bounds.index(s) + 1]), None)
    ih = instance_fields(dump_class(src, 'class', 'InputHandler'))
    ctl_off = next(o for o, (t, n) in ih.items() if t == 'ControlActions')
    ctl_chain = ('load', ('load', ('load', ('md', 'InputHandler_TypeInfo'), 0x5c), 0), ctl_off)
    rows, cmps = [], []

    def ev(names, args, i):
        if 'cmp' in names:
            cmps.append(args[0])
            return
        cat = cat_of(i.address)
        if 'OptionsHandler$$AddSetting' in names:
            this, title, key, opts, slider = args[:5]
            assert title[0] == 'str' and key[0] == 'str', 'AddSetting at %x has non-literal title/key' % i.address
            assert slider[0] == 'imm', 'AddSetting %r: slider flag not constant' % title[1]
            items = None
            if isinstance(opts, dict) and 'items' in opts:
                items = [opts['items'][4 * n] for n in range(len(opts['items']))]
                assert all(v[0] == 'str' for v in items), 'AddSetting %r: non-literal option' % title[1]
                items = [v[1] for v in items]
            rows.append(dict(cat=cat, label=title[1], key=key[1], slider=bool(slider[1]), options=items,
                             dyn=[c for c in cmps if c >= 100], va=i.address))
        elif 'OptionsHandler$$AddKey' in names:
            this, title, act = args[:3]
            assert title[0] == 'str', 'AddKey at %x has non-literal title' % i.address
            assert act[0] == 'load' and act[1] == ctl_chain, 'AddKey %r: action is not InputHandler.instance.%s.<field>' % (
                title[1], ih[ctl_off][1])
            rows.append(dict(cat=cat, label=title[1], action_off=act[2], va=i.address))
        elif ('mm', 'Method$UnityEngine.GameObject.GetComponent<ButtonSetting>()') in args:
            # AddButton được nội tuyến (tiêu đề là literal rỗng); chữ thấy được nằm trên nút của prefab.
            rows.append(dict(cat=cat, button=True, va=i.address))
        if any(n.startswith('OptionsHandler$$Add') for n in names):
            cmps.clear()

    trace(img, code, ev, follow_jmp=('OptionsHandler$$AddSetting', 'OptionsHandler$$AddKey'))
    stray = [r.get('label') for r in rows if r['cat'] is None]
    assert not stray, 'rows added outside any category branch: %r' % stray
    return sorted(rows, key=lambda r: r['cat'])


def build(img):
    src = open(IL2 + '/dump.cs', encoding='utf-8').read()
    labels, reset_text = categories()
    cats = [{'id': l.lower(), 'label': l} for l in labels]
    defaults = rip_defaults(img)
    act_names, binds = rip_bindings(img, src)
    rows = rip_rows(img, src)
    out = []
    for r in rows:
        cat = cats[r['cat']]['id']
        if r.get('button'):
            out.append(dict(key='button:reset-keys', label=reset_text, cat=cat, kind='button',
                            options=[], def_=None))
        elif 'action_off' in r:
            name = act_names[r['action_off']]
            out.append(dict(key='key:' + name, label=r['label'], cat=cat, kind='key', options=binds[r['action_off']], def_=None))
        elif r['slider']:
            assert r['key'] in defaults, 'slider %s has no PlayerPrefs.GetFloat default in Load' % r['key']
            out.append(dict(key=r['key'], label=r['label'], cat=cat, kind='slider', options={'min': 0, 'max': 1},
                            def_=defaults[r['key']]))
        elif r['options'] is None:
            assert r['key'] == 'sResolution' and len(r['dyn']) == 2, \
                'setting %s has runtime options but is not the Resolution list (cmp %r)' % (r['key'], r['dyn'])
            out.append(dict(key=r['key'], label=r['label'], cat=cat, kind='choice',
                            options={'from': 'Screen.resolutions', 'minW': r['dyn'][0], 'minH': r['dyn'][1], 'fmt': 'W x H'},
                            def_={'sResolutionX': defaults['sResolutionX'], 'sResolutionY': defaults['sResolutionY']}))
        else:
            assert r['key'] in defaults, 'choice %s has no PlayerPrefs.GetInt default in Load' % r['key']
            kind = 'toggle' if set(r['options']) in TOGGLES and len(r['options']) == 2 else 'choice'
            out.append(dict(key=r['key'], label=r['label'], cat=cat, kind=kind, options=r['options'], def_=defaults[r['key']]))
    for o in out:
        o['offline'] = o['key'] in OFFLINE
    missing = set(OFFLINE) - {o['key'] for o in out}
    assert not missing, 'OFFLINE names settings that ClickCatagory never adds: %r' % sorted(missing)
    return cats, out


def js(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def main(E=None):
    img = Image()
    cats, rows = build(img)
    lines = ['{' + ','.join('%s:%s' % (k.rstrip('_'), js(r[k])) for k in ('key', 'label', 'cat', 'kind', 'options', 'def_', 'offline'))
             + '}' for r in rows]
    path = os.path.join(DATA, 'settings.js')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Sinh bởi tools/rip_ui_settings.py — đừng sửa tay.\nwindow.P1 = window.P1 || {};\n')
        f.write('P1.SETTINGS_CATS = ' + js(cats) + ';\n')
        f.write('P1.SETTINGS_DEF = [\n' + ',\n'.join(lines) + '\n];\n')
    print('settings.js: %d dòng, %d tab, ảnh bộ nhớ ở %08X' % (len(rows), len(cats), img.base))


if __name__ == '__main__':
    main()
