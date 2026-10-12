# Gỡ lớp che global-metadata.dat của Soul Knight 8.6.0 (IL2CPP, ARMv7).
# [ĐO] Lớp che: XOR 0x66 trên khối 4 KB có chỉ số (offset >> 12) & 15 ∈ {1,2,3,4}, cộng khối 4 KB đầu tiên;
#      8 byte đầu (sanity + version) bị thay: 94 43 72 12 | 18 4b 9e ec. Các khối còn lại để nguyên.
#      Tìm bằng cách đếm byte 0x00 / 0x66 theo khối 4 KB (khối che có 0x66 thay cho 0x00) → chu kỳ 64 KB.
# Chạy: python decrypt_metadata.py [vào] [ra] [version=31, Unity 2022.3.57f1]
# Ra mặc định: D:\sk86-ref\decoded\il2cpp\global-metadata.dat (sanity AF1BB1FA chuẩn, đọc được bằng Il2CppDumper).
import os, struct, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    r'D:\sk86-ref\com.ChillyRoom.DungeonShooter\assets\bin\Data\Managed\Metadata\global-metadata.dat'
DST = sys.argv[2] if len(sys.argv) > 2 else r'D:\sk86-ref\decoded\il2cpp\global-metadata.dat'
VER = int(sys.argv[3]) if len(sys.argv) > 3 else 31


def masked(block):
    return block == 0 or (block & 15) in (1, 2, 3, 4)


def main():
    b = bytearray(open(SRC, 'rb').read())
    for off in range(0, len(b), 0x1000):
        if masked(off >> 12):
            end = min(off + 0x1000, len(b))
            b[off:end] = bytes(x ^ 0x66 for x in b[off:end])
    struct.pack_into('<Ii', b, 0, 0xFAB11BAF, VER)
    # [ĐO] 0x1000..0x5000 (= mục 480..2527 của bảng string literal) là khối mã hoá thật (entropy 7.96),
    # không phải XOR 0x66. Chưa gỡ được: ghi (len 0, idx của mục kề trước) để trình đọc không vỡ.
    lo = struct.unpack_from('<I', b, 8)[0]
    first, last = (0x1000 - lo) // 8, (0x5000 - lo) // 8
    L, idx = struct.unpack_from('<Ii', b, lo + 8 * (first - 1))
    for i in range(first, last):
        struct.pack_into('<Ii', b, lo + 8 * i, 0, idx + L)
    # kiểm: các cặp (offset,size) nối tiếp nhau
    pairs = struct.unpack_from('<62I', b, 8)
    ok = all(pairs[i] + pairs[i + 1] <= pairs[i + 2] + 4 for i in range(0, 58, 2))
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    open(DST, 'wb').write(b)
    print('wrote', DST, len(b), 'bytes; header chain ok:', ok)


if __name__ == '__main__':
    main()
