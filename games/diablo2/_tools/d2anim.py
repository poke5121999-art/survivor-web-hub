# -*- coding: utf-8 -*-
"""animdata.d2 parser: 256 hash blocks, each = int32 count + count * 160-byte records
(name char[8], framesPerDir u32, animSpeed u32, frameData[144] u8; 1 = action frame).
fps = 25 * speed / 256."""
from __future__ import print_function
import struct

__all__ = ['load_animdata']


def load_animdata(path):
    """-> {NAME: {'frames': n, 'speed': s, 'fps': float, 'hit': first action frame or -1,
    'actions': [frame indices]}}.  Names are upper case COF names, e.g. 'AMWLHTH'."""
    with open(path, 'rb') as f:
        d = f.read()
    o = 0
    out = {}
    for _ in range(256):
        n = struct.unpack_from('<i', d, o)[0]
        o += 4
        for _ in range(n):
            name = d[o:o + 8].split(b'\x00')[0].decode('latin-1').upper()
            fpd, spd = struct.unpack_from('<II', d, o + 8)
            fd = d[o + 16:o + 160]
            acts = [i for i in range(min(fpd, 144)) if fd[i] == 1]
            out[name] = {'frames': fpd, 'speed': spd, 'fps': 25.0 * spd / 256.0,
                         'hit': acts[0] if acts else -1, 'actions': acts}
            o += 160
    if o != len(d):
        raise ValueError('animdata: %d trailing bytes (parsed %d of %d)' % (len(d) - o, o, len(d)))
    return out


if __name__ == '__main__':
    import sys
    a = load_animdata(sys.argv[1] if len(sys.argv) > 1 else
                      r'D:\d2r-ref\fs\data\data\global\animdata.d2')
    print(len(a), 'records')
    for k in ('AMWLHTH', 'AMA11HT', 'AMNU1HT', 'ZMWLHTH', 'ZMA1HTH', 'ZMNUHTH', 'AIWL1HT'):
        print(k, a.get(k))
