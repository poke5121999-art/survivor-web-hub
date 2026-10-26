"""Dump RC_MartProgression ScriptableObjects (the generated type tree misreads them) by reading the raw layout.

read_progression() -> list of RC_MartProgression defaults (used by export_data.py).
Layout from il2cpp-dump/dump.cs: BaseScriptableRemoteConfig<T> {bool isOverrideTestConfig; string remoteKey;
bool useDefaultIfKeyNotPresent; bool useCachedValueIfPossible} then RC_MartProgressionMap defaultValues
{RC_MatActivateController[] {string matName; int objectType; int objectTypeReq; string[] objectToActivateList;
float[] objectToActivateDelays; string objectToHighlight; string secondObjectToHighlight}; int startingCashAmount}
and string martSceneName.
"""
import struct
import mm


class R:
    def __init__(self, b):
        self.b, self.p = b, 0

    def align(self):
        self.p = (self.p + 3) & ~3

    def i32(self):
        v = struct.unpack_from("<i", self.b, self.p)[0]
        self.p += 4
        return v

    def f32(self):
        v = struct.unpack_from("<f", self.b, self.p)[0]
        self.p += 4
        return v

    def u8(self):
        v = self.b[self.p]
        self.p += 1
        self.align()
        return v

    def s(self):
        n = self.i32()
        v = self.b[self.p:self.p + n].decode("utf-8")
        self.p += n
        self.align()
        return v

    def arr(self, f):
        return [f() for _ in range(self.i32())]


def read_progression():
    out = []

    for o in mm.load().objects:
        if o.type.name != "MonoBehaviour" or mm.script(o)[1] != "__Funflare.Scripts.RemoteConfigsSO.RC_MartProgression":
            continue
        r = R(o.get_raw_data())
        r.p = 12
        r.u8()
        r.p += 12
        name = r.s()
        head = {"isOverrideTestConfig": r.u8(), "remoteKey": r.s(), "useDefaultIfKeyNotPresent": r.u8(), "useCachedValueIfPossible": r.u8()}
        mats = r.arr(lambda: {"matName": r.s(), "objectType": r.i32(), "objectTypeReq": r.i32(),
                              "objectToActivateList": r.arr(r.s), "objectToActivateDelays": r.arr(lambda: round(r.f32(), 3)),
                              "objectToHighlight": r.s(), "secondObjectToHighlight": r.s()})
        cash = r.i32()
        scene = r.s()
        assert r.p == len(r.b), (name, r.p, len(r.b))
        out.append({"id": o.path_id, "name": name, **head, "martSceneName": scene, "startingCashAmount": cash, "mats": mats})
    return out
