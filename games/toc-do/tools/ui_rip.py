# -*- coding: utf-8 -*-
"""skrip.Rip chay tren AssetBundles cua Zing Speed: chi muc CAB lay tu index.jsonl, bundle khong co duoi .ab."""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'soulknight', 'tools'))
sys.path.insert(0, HERE)
import lz4.block  # noqa: E402
import UnityPy  # noqa: E402
import skrip  # noqa: E402
import zs  # noqa: E402


def cab_index():
    """{bundle: [ten CAB ben trong]}: doc phan dau UnityFS (khoi thong tin, LZ4), khong giai nen du lieu. Cache ~3 s."""
    cache = os.path.join(zs.REF, 'work', 'ugui', 'cab_index.json')
    if os.path.exists(cache):
        return json.load(open(cache))
    out = {}
    for dp, _, fs in os.walk(os.path.join(zs.IFS, 'AssetBundles')):
        for fn in fs:
            p = os.path.join(dp, fn)
            try:
                n = _names(p)
            except Exception:
                n = None
            if n:
                out[os.path.relpath(p, zs.IFS)] = n
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    json.dump(out, open(cache, 'w'))
    return out


def _cstr(b, o):
    e = b.index(b'\0', o)
    return b[o:e].decode(), e + 1


def _names(path):
    with open(path, 'rb') as f:
        h = f.read(512)
        if not h.startswith(b'UnityFS'):
            return None
        o = 8
        ver = struct.unpack_from('>I', h, o)[0]
        o += 4
        _, o = _cstr(h, o)
        _, o = _cstr(h, o)
        _, cs, us, fl = struct.unpack_from('>qIII', h, o)
        o += 20
        if ver >= 7:
            o = (o + 15) // 16 * 16
        f.seek(-cs, 2) if fl & 0x80 else f.seek(o)
        d = f.read(cs)
    c = fl & 0x3f
    if c in (2, 3):
        d = lz4.block.decompress(d, uncompressed_size=us)
    elif c:
        return None
    o = 16
    n = struct.unpack_from('>i', d, o)[0]
    o += 4 + n * 10
    k = struct.unpack_from('>i', d, o)[0]
    o += 4
    out = []
    for _ in range(k):
        o += 20
        p, o = _cstr(d, o)
        out.append(p)
    return [x for x in out if not x.endswith(('.resS', '.resource'))]


class Rip(skrip.Rip):
    def __init__(self, bundles=()):
        self.root = zs.IFS
        self.index = {'bundles': {rel: {'cabs': c} for rel, c in cab_index().items()}}
        self.cab_bundle = {}
        for rel, b in self.index['bundles'].items():
            for cab in b['cabs']:
                self.cab_bundle.setdefault(cab, rel)
        setattr(self, 'env', UnityPy.Environment())
        self.files, self.bundle_of, self.loaded, self.missing = {}, {}, {}, {}
        self._tree, self._script, self._atlas, self._tex = {}, {}, None, {}
        for rel in bundles:
            self.load(rel)

    def bundles(self, *patterns):
        return [p for p in patterns if p in self.index['bundles']]

    def load(self, rel):
        if rel in self.loaded:
            return self.loaded[rel]
        bf = getattr(self, 'env').load_file(os.path.join(self.root, *rel.split('/')))
        cabs = []
        for cab, sf in getattr(bf, 'files', {}).items():
            if hasattr(sf, 'objects'):
                self.files[cab] = sf
                self.bundle_of[cab] = rel
                cabs.append(cab)
        self.loaded[rel] = cabs
        return cabs
