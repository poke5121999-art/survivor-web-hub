"""Minimal reader for Sirenix Odin Serializer's binary format (BinaryDataReader).

decode(data: bytes) -> dict
  Top-level entries become {name: value}. Nodes (reference/struct) become
  {"$type": str|None, "$id": int|None, ...named fields, "$items": [...]} where
  "$items" holds unnamed entries and array elements. Unity object references come
  back as {"$unity": index} (index into SerializedData.ReferencedUnityObjects),
  internal references as {"$ref": id}. decimal -> float, guid -> hex string.
Raises OdinError on anything it cannot parse; it never guesses.

Entry ids follow Odin's BinaryEntryType. Primitive entries come in pairs
(named = odd id, unnamed = even id) starting at 15.
"""
import struct
from decimal import Decimal


class OdinError(Exception):
    pass


# BinaryEntryType
REF_NODE_N, REF_NODE_U, STRUCT_NODE_N, STRUCT_NODE_U = 1, 2, 3, 4
END_NODE, START_ARRAY, END_ARRAY, PRIM_ARRAY = 5, 6, 7, 8
INTREF_N, INTREF_U, EXTIDX_N, EXTIDX_U, EXTGUID_N, EXTGUID_U = 9, 10, 11, 12, 13, 14
TYPE_NAME, TYPE_ID, END_STREAM = 47, 48, 49
EXTSTR_N, EXTSTR_U = 50, 51
# base id of each primitive pair (named id), 15..45
PRIMS = {15: "sbyte", 17: "byte", 19: "short", 21: "ushort", 23: "int", 25: "uint",
         27: "long", 29: "ulong", 31: "float", 33: "double", 35: "decimal",
         37: "char", 39: "string", 41: "guid", 43: "bool", 45: "null"}
_FMT = {"sbyte": "<b", "byte": "<B", "short": "<h", "ushort": "<H", "int": "<i", "uint": "<I",
        "long": "<q", "ulong": "<Q", "float": "<f", "double": "<d"}


class _R:
    def __init__(self, b):
        self.b, self.p, self.types = b, 0, {}

    def take(self, n):
        if self.p + n > len(self.b):
            raise OdinError("unexpected end of data at %d" % self.p)
        s = self.b[self.p:self.p + n]
        self.p += n
        return s

    def u8(self):
        return self.take(1)[0]

    def i32(self):
        return struct.unpack("<i", self.take(4))[0]

    def string(self):
        flag = self.u8()
        n = self.i32()
        if n < 0 or n > 1 << 24:
            raise OdinError("bad string length %d" % n)
        if flag == 0:
            return self.take(n).decode("latin-1")
        if flag == 1:
            return self.take(n * 2).decode("utf-16-le")
        raise OdinError("bad string flag %d" % flag)

    def primitive(self, kind):
        if kind == "null":
            return None
        if kind == "string":
            return self.string()
        if kind == "bool":
            return self.u8() != 0
        if kind == "char":
            return self.take(2).decode("utf-16-le")
        if kind == "guid":
            return self.take(16).hex()
        if kind == "decimal":
            flags, hi, lo, mid = struct.unpack("<IIII", self.take(16))
            v = Decimal((hi << 64) | (mid << 32) | lo).scaleb(-((flags >> 16) & 0xFF))
            return float(-v if flags & 0x80000000 else v)
        f = _FMT[kind]
        return struct.unpack(f, self.take(struct.calcsize(f)))[0]

    def type_entry(self):
        # type info precedes the id of a node; 46 (unnamed null) means "no type"
        t = self.u8()
        if t == 46:
            return None
        if t == TYPE_NAME:
            i = self.i32()
            name = self.string()
            self.types[i] = name
            return name
        if t == TYPE_ID:
            i = self.i32()
            if i not in self.types:
                raise OdinError("unknown type id %d" % i)
            return self.types[i]
        raise OdinError("expected type entry, got %d at %d" % (t, self.p - 1))

    def node(self, entry):
        named = entry in (REF_NODE_N, STRUCT_NODE_N)
        name = self.string() if named else None
        typ = self.type_entry()
        nid = self.i32() if entry in (REF_NODE_N, REF_NODE_U) else None
        d = {"$type": typ, "$id": nid}
        self.body(d, END_NODE)
        return name, d

    def body(self, d, end):
        items = d.setdefault("$items", [])
        while True:
            e = self.u8()
            if e == end:
                if end == END_NODE and not items:
                    del d["$items"]
                return
            if e == END_STREAM:
                raise OdinError("stream ended inside node")
            name, val = self.entry(e, d)
            if name is None:
                items.append(val)
            else:
                d[name] = val

    def entry(self, e, parent):
        if e in (REF_NODE_N, REF_NODE_U, STRUCT_NODE_N, STRUCT_NODE_U):
            return self.node(e)
        if e == START_ARRAY:
            n = struct.unpack("<q", self.take(8))[0]
            arr = {"$items": []}
            self.body(arr, END_ARRAY)
            if len(arr["$items"]) != n:
                raise OdinError("array length %d != declared %d" % (len(arr["$items"]), n))
            parent.setdefault("$items", [])
            parent["$items"].extend(arr["$items"])
            return "$count", n
        if e == PRIM_ARRAY:
            cnt, size = self.i32(), self.i32()
            raw = self.take(cnt * size)
            return None, {"$bytes": raw.hex(), "$count": cnt, "$size": size}
        named = e % 2 == 1 if e >= 9 else None
        if e in (INTREF_N, INTREF_U):
            nm = self.string() if e == INTREF_N else None
            return nm, {"$ref": self.i32()}
        if e in (EXTIDX_N, EXTIDX_U):
            nm = self.string() if e == EXTIDX_N else None
            return nm, {"$unity": self.i32()}
        if e in (EXTGUID_N, EXTGUID_U):
            nm = self.string() if e == EXTGUID_N else None
            return nm, {"$guid": self.take(16).hex()}
        if e in (EXTSTR_N, EXTSTR_U):
            nm = self.string() if e == EXTSTR_N else None
            return nm, {"$extstr": self.string()}
        base = e if e % 2 == 1 else e - 1
        if base in PRIMS and 15 <= e <= 46:
            nm = self.string() if e % 2 == 1 else None
            return nm, self.primitive(PRIMS[base])
        raise OdinError("unknown entry %d at %d" % (e, self.p - 1))


def decode(data):
    data = bytes(data)
    r = _R(data)
    top = {"$items": []}
    while r.p < len(data):
        e = r.u8()
        if e == END_STREAM:
            break
        name, val = r.entry(e, top)
        if name is None:
            top["$items"].append(val)
        else:
            top[name] = val
    if not top["$items"]:
        del top["$items"]
    return top
