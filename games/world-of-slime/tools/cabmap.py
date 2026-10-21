"""Build <WOS_REF>/cache/cabmap.json: CAB name (lower) -> bundle file, by reading only bundle headers."""
import os, struct, json, lz4.block, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import wos
D = wos.D
OUT = wos.CABMAP
def nodes(path):
    with open(path, 'rb') as f:
        if f.read(8) != b'UnityFS\0': return []
        ver = struct.unpack('>I', f.read(4))[0]
        for _ in range(2):
            while f.read(1) != b'\0': pass
        _size, csz, usz, flags = struct.unpack('>qIII', f.read(20))
        if ver >= 7: f.seek((f.tell() + 15) & ~15)
        if flags & 0x80: f.seek(-csz, 2)
        raw = f.read(csz)
    comp = flags & 0x3F
    if comp in (2, 3): raw = lz4.block.decompress(raw, uncompressed_size=usz)
    elif comp == 1:
        import lzma
        props, dsz = raw[0], struct.unpack('<I', raw[1:5])[0]
        filt = {'id': lzma.FILTER_LZMA1, 'dict_size': dsz, 'lc': props % 9, 'lp': (props // 9) % 5, 'pb': props // 45}
        raw = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[filt]).decompress(raw[5:])
    p = 16
    nb = struct.unpack('>i', raw[p:p + 4])[0]; p += 4 + nb * 10
    nn = struct.unpack('>i', raw[p:p + 4])[0]; p += 4
    out = []
    for _ in range(nn):
        p += 20
        e = raw.index(b'\0', p); out.append(raw[p:e].decode()); p = e + 1
    return out
m, bad = {}, []
for fn in os.listdir(D):
    if not fn.endswith('.bundle'): continue
    try:
        for n in nodes(os.path.join(D, fn)): m[n.lower()] = fn
    except Exception as e: bad.append((fn, str(e)))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(m, open(OUT, 'w'), indent=0)
print(len(m), 'nodes; bad', len(bad), bad[:3])
