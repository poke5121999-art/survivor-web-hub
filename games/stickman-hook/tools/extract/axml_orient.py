import struct, sys
d = open(sys.argv[1], 'rb').read()
pos = 8
strings = []; resmap = []
while pos < len(d):
    typ, hsz, size = struct.unpack_from('<HHI', d, pos)
    if typ == 0x0001:  # string pool
        cnt, scnt, flags, sstart, _ = struct.unpack_from('<IIIII', d, pos + 8)
        utf8 = flags & 0x100
        offs = struct.unpack_from('<%dI' % cnt, d, pos + 28)
        for o in offs:
            p = pos + sstart + o
            if utf8:
                n = d[p + 1]; p += 2
                if d[p - 1] & 0x80: p += 1
                strings.append(d[p:p + n].decode('utf8', 'replace'))
            else:
                n = struct.unpack_from('<H', d, p)[0]
                strings.append(d[p + 2:p + 2 + n * 2].decode('utf-16le', 'replace'))
    elif typ == 0x0180:
        resmap = list(struct.unpack_from('<%dI' % ((size - 8) // 4), d, pos + 8))
    elif typ == 0x0102:  # start element
        name = strings[struct.unpack_from('<I', d, pos + 20)[0]]
        ac = struct.unpack_from('<H', d, pos + 28)[0]
        nm_attr = ''
        for i in range(ac):
            a = pos + 36 + i * 20
            ns, nm, raw, _, _, vt, data = struct.unpack_from('<IIIHBBI', d, a)
            if nm < len(resmap) and resmap[nm] == 0x01010003 and raw != 0xffffffff: nm_attr = strings[raw]
        for i in range(ac):
            a = pos + 36 + i * 20
            ns, nm, raw, _, _, vt, data = struct.unpack_from('<IIIHBBI', d, a)
            rid = resmap[nm] if nm < len(resmap) else 0
            if rid in (0x0101001e,):
                print(name, nm_attr, 'orientation', data)
    pos += size
