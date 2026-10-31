"""Addressables catalog of Lumber Inc: guid (or address) -> asset path, e.g. 'Assets/ResAddressable/.../Pre_Forest1_1.prefab'."""
import base64, json, os, struct
import lm

_map = None


def _keys(b):
    n, = struct.unpack_from("<i", b, 0)
    return n


def load():
    global _map
    if _map is not None:
        return _map
    c = json.load(open(os.path.join(lm.REF, "apk/base/assets/aa/catalog.json"), encoding="utf-8"))
    kd, bd, ed = (base64.b64decode(c[k]) for k in ("m_KeyDataString", "m_BucketDataString", "m_EntryDataString"))
    nb, = struct.unpack_from("<i", bd, 0)
    off = 4
    buckets = []
    for _ in range(nb):
        doff, ne = struct.unpack_from("<ii", bd, off)
        off += 8
        ents = struct.unpack_from(f"<{ne}i", bd, off)
        off += 4 * ne
        buckets.append((doff, ents))
    entries = [struct.unpack_from("<7i", ed, 4 + 28 * i) for i in range(struct.unpack_from("<i", ed, 0)[0])]
    _map = {}
    for doff, ents in buckets:
        t = kd[doff]
        if t in (0, 1):  # ascii / unicode string
            ln, = struct.unpack_from("<i", kd, doff + 1)
            key = kd[doff + 5:doff + 5 + ln].decode("ascii" if t == 0 else "utf-16-le")
        else:
            continue
        paths = [c["m_InternalIds"][entries[e][0]] for e in ents]
        _map[key] = [p for p in paths if not p.endswith(".bundle")] or paths
    return _map


def path(guid):
    p = load().get(guid)
    return p[0] if p else None


if __name__ == "__main__":
    import sys
    for g in sys.argv[1:]:
        print(g, load().get(g))
