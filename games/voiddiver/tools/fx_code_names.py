# -*- coding: utf-8 -*-
"""fx_code_names.py - lấy tên VFX mà mã game (C# IL2CPP) gọi thẳng bằng chuỗi, không qua bảng.

    set PYTHONIOENCODING=utf-8
    python fx_code_names.py            # in ra, và ghi tools/fx_code_names.json (fx_export --all-referenced tự gọi literals())

Đọc bảng string literal của il2cpp_data/Metadata/global-metadata.dat (header: sanity 0xFAB11BAF, version,
rồi stringLiteralOffset/Size (mỗi mục 8 byte: length, dataIndex), stringLiteralDataOffset/Size), rồi giao với
tên prefab gốc của bundle remote_prefab_assets_vfx. Chuỗi có thư mục ("Common/Heal") cũng tính theo lá.
"""
import io, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vc  # noqa: E402

META = os.path.join(vc.VD, 'il2cpp_data', 'Metadata', 'global-metadata.dat')


def literals():
    b = open(META, 'rb').read()
    sanity, ver = struct.unpack_from('<Ii', b, 0)
    if sanity != 0xFAB11BAF:
        raise ValueError('global-metadata.dat: sanity sai %x' % sanity)
    out = []
    if ver >= 38:
        # v38+ (Unity 6): mỗi mục là bộ ba (offset, size, count). Mục 0: bảng string literal = count số uint32
        # (vị trí bắt đầu trong vùng dữ liệu); mục 1: vùng dữ liệu. Độ dài = vị trí kế tiếp − vị trí này.
        lo, ls, lc, do, ds, dc = struct.unpack_from('<6i', b, 8)
        offs = list(struct.unpack_from('<%dI' % lc, b, lo)) + [ds]
        for i in range(lc):
            s = b[do + offs[i]: do + offs[i + 1]]
            try:
                out.append(s.decode('utf-8'))
            except UnicodeDecodeError:
                pass
        return ver, out
    lo, ls, do, ds = struct.unpack_from('<4i', b, 8)
    for i in range(ls // 8):
        ln, di = struct.unpack_from('<II', b, lo + i * 8)
        s = b[do + di: do + di + ln]
        try:
            out.append(s.decode('utf-8'))
        except UnicodeDecodeError:
            pass
    return ver, out


def prefab_names():
    import fx_export
    bundle = vc.bfile(fx_export.VFX_BUNDLE)
    env = vc.env_of([bundle])
    return set(fx_export.build_prefab_map(env, bundle).keys())


def main():
    ver, lits = literals()
    names = prefab_names()
    hits = {}
    for s in lits:
        leaf = s.replace('\\', '/').split('/')[-1]
        if leaf in names:
            hits.setdefault(s, leaf)
    print('metadata v%d, %d literal, %d trùng tên prefab VFX' % (ver, len(lits), len(hits)))
    for s in sorted(hits):
        print('  ', s)
    with io.open(os.path.join(HERE, 'fx_code_names.json'), 'w', encoding='utf-8') as f:
        json.dump(sorted(hits), f, ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()
