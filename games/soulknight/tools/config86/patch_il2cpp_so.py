# Chuẩn bị libil2cpp.so (ARMv7) của Soul Knight 8.6.0 cho Il2CppDumper chế độ tay.
# [ĐO] 51/195 tên Il2CppCodeGenModule bị XOR 0x34 (NUL cũng thành 0x34), 136 để nguyên, 8 ở bảng mã hoá khác; nên Il2CppDumper không tự dò được;
#      bản này ghi ra một bản sao đã gỡ XOR tên module. Địa chỉ tìm bằng mẫu cấu trúc:
#        MetadataRegistration = VA 0xdfe1b3c  (fieldOffsetsCount = typeDefinitionsSizesCount = 46224 = số typeDef)
#        CodeRegistration     = VA 0xdd47268  (codeGenModulesCount = 195 = số image, mảng 195 con trỏ hợp lệ)
# Chạy: python patch_il2cpp_so.py  → D:\sk86-ref\decoded\il2cpp\libil2cpp.patched.so
#   rồi: Il2CppDumper.exe <patched.so> <global-metadata.dat> <outdir>  (nhập 0xdd47268 rồi 0xdfe1b3c)
import struct
from elftools.elf.elffile import ELFFile

SRC = r'D:\sk86-ref\config.armeabi_v7a\lib\armeabi-v7a\libil2cpp.so'
DST = r'D:\sk86-ref\decoded\il2cpp\libil2cpp.patched.so'
CODE_REG = 0xdd47268

d = bytearray(open(SRC, 'rb').read())
secs = [(s['sh_addr'], s['sh_offset'], s['sh_size']) for s in ELFFile(open(SRC, 'rb')).iter_sections()
        if s['sh_type'] != 'SHT_NOBITS' and s['sh_addr']]


def off(va):
    for a, o, n in secs:
        if a <= va < a + n:
            return o + va - a
    raise ValueError(hex(va))


cr = off(CODE_REG)
count, mods = struct.unpack_from('<2I', d, cr + 15 * 4)
names = []
for k in range(count):
    m = off(struct.unpack_from('<I', d, off(mods) + 4 * k)[0])
    p = off(struct.unpack_from('<I', d, m)[0])
    plain = bytes(d[p:p + 64]).split(bytes(1))[0]
    if plain.endswith(b'.dll'):  # [ĐO] một số tên để nguyên, số khác bị XOR
        names.append(plain.decode()); continue
    i = p
    while d[i] ^ 0x34:
        d[i] ^= 0x34
        i += 1
    d[i] = 0
    names.append(bytes(d[p:i]).decode('ascii', 'replace'))
open(DST, 'wb').write(d)
print(count, 'modules; bad names:', [n for n in names if not n.endswith('.dll')][:5], '->', DST)
