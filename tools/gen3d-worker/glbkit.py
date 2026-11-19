"""Tiny pure-Python writers for GLB and PNG, used by the fake pipeline (no numpy, no trimesh)."""
import json
import math
import struct
import zlib


def png_bytes(w, h, pixel):
    """pixel(x, y) -> (r, g, b, a) ints 0..255."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixel(x, y))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b"")


def uv_sphere(segments, rings, radius=0.5):
    pos, nor, uv, idx = [], [], [], []
    for r in range(rings + 1):
        v = r / rings
        th = v * math.pi
        for s in range(segments + 1):
            u = s / segments
            ph = u * 2 * math.pi
            x, y, z = math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)
            pos.append((x * radius, y * radius + radius, z * radius))
            nor.append((x, y, z))
            uv.append((u, v))
    row = segments + 1
    for r in range(rings):
        for s in range(segments):
            a, b = r * row + s, r * row + s + 1
            c, d = a + row, b + row
            if r != 0:
                idx += [a, b, c]
            if r != rings - 1:
                idx += [b, d, c]
    return pos, nor, uv, idx


def cube(size=1.0):
    h = size / 2
    faces = [((1, 0, 0), (0, 0, -1), (0, 1, 0)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)),
             ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))]
    pos, nor, uv, idx = [], [], [], []
    for n, t, b in faces:
        base = len(pos)
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            pos.append(tuple(h * (n[i] + su * t[i] + sv * b[i]) + (h if i == 1 else 0) for i in range(3)))
            nor.append(n)
            uv.append(((su + 1) / 2, (1 - sv) / 2))
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    return pos, nor, uv, idx


def write_glb(path, pos, nor, uv, idx, color=(0.8, 0.8, 0.8, 1.0), texture_png=None, name="model"):
    blob = bytearray()
    views, accessors = [], []

    def add(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), **({"target": target} if target else {})})
        blob.extend(data)
        return len(views) - 1

    def acc(view, ctype, count, typ, extra=None):
        accessors.append({"bufferView": view, "componentType": ctype, "count": count, "type": typ, **(extra or {})})
        return len(accessors) - 1

    mins = [min(p[i] for p in pos) for i in range(3)]
    maxs = [max(p[i] for p in pos) for i in range(3)]
    a_pos = acc(add(b"".join(struct.pack("<3f", *p) for p in pos), 34962), 5126, len(pos), "VEC3", {"min": mins, "max": maxs})
    a_nor = acc(add(b"".join(struct.pack("<3f", *n) for n in nor), 34962), 5126, len(nor), "VEC3")
    a_uv = acc(add(b"".join(struct.pack("<2f", *t) for t in uv), 34962), 5126, len(uv), "VEC2")
    a_idx = acc(add(struct.pack("<%dI" % len(idx), *idx), 34963), 5125, len(idx), "SCALAR")
    mat = {"pbrMetallicRoughness": {"baseColorFactor": list(color), "metallicFactor": 0.0, "roughnessFactor": 0.8}, "name": "mat"}
    gltf = {
        "asset": {"version": "2.0", "generator": "gen3d fake pipeline"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{"attributes": {"POSITION": a_pos, "NORMAL": a_nor, "TEXCOORD_0": a_uv}, "indices": a_idx, "material": 0}]}],
        "materials": [mat],
    }
    if texture_png:
        iv = add(texture_png)
        gltf["images"] = [{"bufferView": iv, "mimeType": "image/png"}]
        gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987}]
        gltf["textures"] = [{"source": 0, "sampler": 0}]
        mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
        mat["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 1]
    while len(blob) % 4:
        blob.append(0)
    gltf["accessors"], gltf["bufferViews"], gltf["buffers"] = accessors, views, [{"byteLength": len(blob)}]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    with open(path, "wb") as f:
        f.write(out)
    return len(out)
