# Đọc tên kiểu / method / trường + giá trị hằng từ global-metadata.dat v31 đã gỡ che (decrypt_metadata.py).
# Không cần libil2cpp.so (bản .so bị bảo vệ: Il2CppDumper không tìm được CodeRegistration).
# Chạy: PYTHONIOENCODING=utf-8 python meta_names.py
# Ra: D:\sk86-ref\decoded\il2cpp\types.txt   — mỗi kiểu: "ns.Tên : cha" + trường (+ = hằng) + method(số tham số)
# Bố cục v31 [ĐO bằng chia kích thước mục]: typeDef 88 B (46224 kiểu), method 36 B, field 12 B, fieldDefaultValue 12 B,
# image 40 B. Kiểu của trường nằm trong .so nên hằng chỉ được đoán: thử đọc chuỗi (độ dài nén + UTF-8), không được thì in hex.
import io, struct

META = r'D:\sk86-ref\decoded\il2cpp\global-metadata.dat'
OUT = r'D:\sk86-ref\decoded\il2cpp\types.txt'
m = open(META, 'rb').read()
H = struct.unpack_from('<64I', m, 0)


def sec(i):
    return H[2 + 2 * i], H[3 + 2 * i]


STR = sec(2)[0]


def s(idx):
    e = m.index(b'\0', STR + idx)
    return m[STR + idx:e].decode('utf-8', 'replace')


def rows(i, size, fmt):
    o, n = sec(i)
    return [struct.unpack_from(fmt, m, o + k * size) for k in range(n // size)]


TD = rows(19, 88, '<8i8i8H2I')
METH = rows(5, 36, '<7i4H')
FIELD = rows(11, 12, '<3i')
FDV = {r[0]: r for r in rows(7, 12, '<3i')}
DATA = sec(8)[0]
PAR = rows(10, 12, '<3i') if sec(10)[1] % 12 == 0 else []
PAR_SZ = 12


def comp_int(o):
    b = m[o]
    if b & 0x80 == 0:
        return b, 1
    if b & 0xC0 == 0x80:
        return ((b & 0x3F) << 8) | m[o + 1], 2
    if b & 0xE0 == 0xC0:
        return ((b & 0x1F) << 24) | (m[o + 1] << 16) | (m[o + 2] << 8) | m[o + 3], 4
    return struct.unpack_from('<I', m, o + 1)[0], 5


def default(fi):
    r = FDV.get(fi)
    if not r or r[2] < 0:
        return None
    o = DATA + r[2]
    n, k = comp_int(o)
    if 0 < n < 512:
        raw = m[o + k:o + k + n]
        try:
            t = raw.decode('utf-8')
            if all(c.isprintable() for c in t):
                return repr(t)
        except UnicodeDecodeError:
            pass
    return 'hex:' + m[o:o + 16].hex()


def main():
    out = io.open(OUT, 'w', encoding='utf-8')
    for ti, t in enumerate(TD):
        name, ns = s(t[0]), s(t[1])
        fstart, mstart = t[8], t[9]
        mcount, fcount = t[16], t[18]
        out.write(f'\n[{ti}] {ns + "." if ns else ""}{name}\n')
        for fi in range(fstart, fstart + fcount):
            if 0 <= fi < len(FIELD):
                d = default(fi)
                out.write(f'  f {s(FIELD[fi][0])}' + (f' = {d}' if d else '') + '\n')
        for mi in range(mstart, mstart + mcount):
            if 0 <= mi < len(METH):
                mr = METH[mi]
                out.write(f'  m {s(mr[0])}({mr[10]})\n')
    out.close()
    print('types', len(TD), 'methods', len(METH), 'fields', len(FIELD), '->', OUT)


if __name__ == '__main__':
    main()
