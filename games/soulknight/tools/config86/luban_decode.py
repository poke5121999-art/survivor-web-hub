# Giải luban_config.ab (Soul Knight 8.6.0) thành JSON đọc được, 334 bảng.
# [ĐO] Chuỗi gỡ (đọc ngược từ mã ARM, xem README):
#   luban.bytes --AES-256-CBC (Rijndael, đệm PKCS7)--> ByteBuf
#   khoá/IV = PBKDF2-HMAC-SHA1(mật khẩu, muối, 1000 vòng) → 32 byte khoá + 16 byte IV   (Rfc2898DeriveBytes mặc định)
#   mật khẩu = ConfigData.Key = "AZhenSoulKnightd@orz"  (ConfigData..cctor)
#   muối     = ConfigData.keySalt = 14 byte "Ivvan Medve!ev" (mảng tĩnh <PrivateImplementationDetails>, Field#137)
#   gỡ bằng CryptHelper.DecryptBytesToBytes (mã hàm này bị XOR 0x34 trong .so)
#   ByteBuf = compactUint số bảng, rồi mỗi bảng (string tên "module_tbxxx", bytes dữ liệu)
# Lược đồ bảng: lớp cfg.<Module>.<TbName> trong metadata; kiểu phần tử lấy từ Il2CppType trong libil2cpp.so
#   (MetadataRegistration VA 0xdfe1b3c → types[151486]). Trường đọc theo thứ tự khai báo, bỏ static/const/*_Ref.
# Chạy: PYTHONIOENCODING=utf-8 python luban_decode.py [lọc regex tên bảng]
# Ra: D:\sk86-ref\decoded\luban\<tên bảng>.json (+ _index.json: số hàng, lỗi nếu có, bytes thô ở raw/)
import hashlib, json, os, re, struct, sys

import UnityPy
from Crypto.Cipher import AES

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arm_method as A  # noqa: E402  (đọc metadata + .so)

AB = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles\luban_config.ab'
OUT = r'D:\sk86-ref\decoded\luban'
PASSWORD = b'AZhenSoulKnightd@orz'
SALT = bytes.fromhex('497676616e204d65647665216576')
MR = 0xdfe1b3c


def decrypt():
    env = UnityPy.load(AB)
    o = next(x for x in env.objects if x.type.name == 'TextAsset').read()
    s = o.m_Script
    raw = s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s)
    kv = hashlib.pbkdf2_hmac('sha1', PASSWORD, SALT, 1000, 48)
    p = AES.new(kv[:32], AES.MODE_CBC, kv[32:]).decrypt(raw)
    pad = p[-1]
    return p[:-pad] if 0 < pad <= 16 and p.endswith(bytes([pad]) * pad) else p


# ---------- ByteBuf của Luban
class Buf:
    def __init__(self, b):
        self.b, self.o = b, 0

    def byte(self):
        v = self.b[self.o]; self.o += 1; return v

    def cuint(self):
        b, o = self.b, self.o
        h = b[o]
        if h < 0x80:
            self.o += 1; return h
        if h < 0xC0:
            self.o += 2; return ((h & 0x3F) << 8) | b[o + 1]
        if h < 0xE0:
            self.o += 3; return ((h & 0x1F) << 16) | (b[o + 1] << 8) | b[o + 2]
        if h < 0xF0:
            self.o += 4; return ((h & 0x0F) << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]
        self.o += 5; return int.from_bytes(b[o + 1:o + 5], 'big')

    def int(self):
        v = self.cuint()
        return v - (1 << 32) if v >= 1 << 31 else v

    def long(self):
        b, o = self.b, self.o
        h = b[o]
        for lim, n, mask in ((0x80, 0, 0x7F), (0xC0, 1, 0x3F), (0xE0, 2, 0x1F), (0xF0, 3, 0x0F), (0xF8, 4, 0x07),
                             (0xFC, 5, 0x03), (0xFE, 6, 0x01), (0xFF, 7, 0x00)):
            if h < lim:
                v = h & mask
                for k in range(n):
                    v = (v << 8) | b[o + 1 + k]
                self.o += n + 1
                return v
        v = int.from_bytes(b[o + 1:o + 9], 'big'); self.o += 9
        return v - (1 << 64) if v >= 1 << 63 else v

    def float(self):
        v = struct.unpack_from('<f', self.b, self.o)[0]; self.o += 4; return round(v, 6)

    def double(self):
        v = struct.unpack_from('<d', self.b, self.o)[0]; self.o += 8; return v

    def string(self):
        n = self.cuint(); s = self.b[self.o:self.o + n]; self.o += n
        return s.decode('utf-8', 'replace')

    def bytes_(self):
        n = self.cuint(); s = self.b[self.o:self.o + n]; self.o += n; return s


# ---------- kiểu từ .so
FIELD = A.rows(11, 12, '<3i')
FDV = {r[0]: r for r in A.rows(7, 12, '<3i')}
TYPES_PTR = A.u32(MR + 28)
TD = A.TD
NAME = {}
for i, t in enumerate(TD):
    ns = A.s(t[1])
    NAME[(ns + '.' if ns else '') + A.s(t[0])] = i
LOWER = {k.lower(): v for k, v in NAME.items()}


def itype(va):
    data, bits = A.u32(va), A.u32(va + 4)
    return {'data': data, 'type': (bits >> 16) & 0xFF, 'attrs': bits & 0xFFFF}


def type_at(index):
    return itype(A.u32(TYPES_PTR + 4 * index))


def tdname(ti):
    t = TD[ti]
    ns = A.s(t[1])
    return (ns + '.' if ns else '') + A.s(t[0])


def parent_td(ti):
    p = TD[ti][4]
    if p < 0:
        return None
    t = type_at(p)
    return t['data'] if t['type'] in (0x11, 0x12) else None


def is_enum(ti):
    p = parent_td(ti)
    return p is not None and tdname(p) == 'System.Enum'


def fields_of(ti):
    t = TD[ti]
    out = []
    for fi in range(t[8], t[8] + t[18]):
        f = FIELD[fi]
        ty = type_at(f[1])
        if ty['attrs'] & 0x10 or ty['attrs'] & 0x40:  # static / literal
            continue
        name = A.s(f[0])
        m = re.match(r'<(.+)>k__BackingField', name)
        name = m.group(1) if m else name
        if name.endswith('_Ref') or name.startswith('__'):
            continue
        out.append((name, ty))
    return out


def const_int(ti, fname):
    t = TD[ti]
    for fi in range(t[8], t[8] + t[18]):
        if A.s(FIELD[fi][0]) == fname and fi in FDV:
            o = A.sec(8)[0] + FDV[fi][2]
            b = Buf(A.m[o:o + 8])
            return b.int()
    return None


SUBS = {}


def subclasses(ti):
    if ti not in SUBS:
        SUBS[ti] = {}
        for k in range(len(TD)):
            if parent_td(k) == ti:
                cid = const_int(k, '__ID__')
                if cid is not None:
                    SUBS[ti][cid] = k
                SUBS[ti].update({kk: vv for kk, vv in subclasses(k).items()})
    return SUBS[ti]


def generic(ty):
    gc = ty['data']
    base = itype(A.u32(gc))
    inst = A.u32(gc + 4)
    argc, argv = A.u32(inst), A.u32(inst + 4)
    args = [itype(A.u32(argv + 4 * k)) for k in range(argc)]
    return tdname(base['data']), args


def read(buf, ty):
    k = ty['type']
    if k == 0x02:
        return buf.byte() != 0
    if k in (0x04, 0x05):
        return buf.byte()
    if k in (0x06, 0x07, 0x08, 0x09):
        return buf.int()
    if k in (0x0A, 0x0B):
        return buf.long()
    if k == 0x0C:
        return buf.float()
    if k == 0x0D:
        return buf.double()
    if k == 0x0E:
        return buf.string()
    if k == 0x1D:  # T[]
        el = itype(ty['data'])
        if el['type'] == 0x05:
            return buf.bytes_().hex()
        return [read(buf, el) for _ in range(buf.cuint())]
    if k == 0x15:
        g, args = generic(ty)
        if g.startswith('System.Nullable'):
            return read(buf, args[0]) if buf.byte() else None
        if g.startswith('System.Collections.Generic.Dictionary'):
            n = buf.cuint()
            return {str(read(buf, args[0])): read(buf, args[1]) for _ in range(n)}
        if g.startswith(('System.Collections.Generic.List', 'System.Collections.Generic.HashSet')):
            return [read(buf, args[0]) for _ in range(buf.cuint())]
        raise ValueError('generic ' + g)
    if k == 0x11:
        ti = ty['data']
        if is_enum(ti):
            return buf.int()
        n = tdname(ti)
        if n in ('UnityEngine.Vector2', 'System.Numerics.Vector2'):
            return [buf.float(), buf.float()]
        if n in ('UnityEngine.Vector3', 'System.Numerics.Vector3'):
            return [buf.float(), buf.float(), buf.float()]
        if n in ('UnityEngine.Vector4', 'System.Numerics.Vector4'):
            return [buf.float() for _ in range(4)]
        return bean(buf, ti)
    if k == 0x12:
        return bean(buf, ty['data'])
    raise ValueError(f'kiểu 0x{k:x}')


def bean(buf, ti):
    flags = TD[ti][7]
    if flags & 0x80:  # abstract → id kiểu con trước
        cid = buf.int()
        sub = subclasses(ti).get(cid)
        if sub is None:
            raise ValueError(f'không có lớp con id {cid} của {tdname(ti)}')
        d = bean_fields(buf, sub)
        d['$type'] = A.s(TD[sub][0])
        return d
    return bean_fields(buf, ti)


def bean_fields(buf, ti):
    chain = []
    t = ti
    while t is not None and tdname(t) not in ('System.Object', 'Luban.BeanBase'):
        chain.append(t)
        t = parent_td(t)
    out = {}
    for c in reversed(chain):
        for name, ty in fields_of(c):
            out[name] = read(buf, ty)
    return out


def table_class(tname):
    mod, tb = tname.split('_', 1)
    for k, v in LOWER.items():
        if k.startswith('cfg.') and k.endswith('.' + tb) and k.split('.')[-2] == mod:
            return v
    for k, v in LOWER.items():
        if k.startswith('cfg.') and k.endswith('.' + tb):
            return v
    return None


def decode_table(tname, data):
    ti = table_class(tname)
    if ti is None:
        raise ValueError('không thấy lớp cfg cho ' + tname)
    fs = dict(fields_of(ti))
    buf = Buf(data)
    if '_dataList' in fs:
        el = generic(fs['_dataList'])[1][0]
        rows = [read(buf, el) for _ in range(buf.cuint())]
    elif '_data' in fs:
        n = buf.cuint()
        rows = read(buf, fs['_data']) if n == 1 else [read(buf, fs['_data']) for _ in range(n)]
    else:
        raise ValueError('bảng lạ ' + tdname(ti) + ' ' + ','.join(fs))
    if buf.o != len(data):
        raise ValueError(f'đọc dư/thiếu {len(data) - buf.o} byte')
    return tdname(ti), rows


def main():
    pat = re.compile(sys.argv[1]) if len(sys.argv) > 1 else None
    plain = decrypt()
    os.makedirs(os.path.join(OUT, 'raw'), exist_ok=True)
    buf = Buf(plain)
    index = {}
    ok = bad = 0
    for _ in range(buf.cuint()):
        name, data = buf.string(), buf.bytes_()
        if pat and not pat.search(name):
            continue
        open(os.path.join(OUT, 'raw', name + '.bytes'), 'wb').write(data)
        try:
            cls, rows = decode_table(name, data)
            json.dump(rows, open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            index[name] = {'class': cls, 'rows': len(rows) if isinstance(rows, list) else 1, 'bytes': len(data)}
            ok += 1
        except Exception as e:  # noqa
            index[name] = {'error': str(e)[:200], 'bytes': len(data)}
            bad += 1
    json.dump(index, open(os.path.join(OUT, '_index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ok', ok, 'lỗi', bad)


if __name__ == '__main__':
    main()
