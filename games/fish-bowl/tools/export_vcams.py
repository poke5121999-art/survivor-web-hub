"""Export every Cinemachine virtual camera of level2 + level4 for the view's small Cinemachine.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_vcams.py

Writes games/fish-bowl/data/vcams.json {"<GameObject path>": {scene, priority, lookAt, follow (paths), fov, near, far,
dutch, body, aim, noise}}. body/aim are the pipeline components on the vcam's hidden "cm" child (CinemachineTransposer,
CinemachineComposer, CinemachineHardLookAt, Cinemachine3rdPersonFollow, CinemachineBasicMultiChannelPerlin ...) with
their serialized fields as read by the generated type tree, which reads them correctly.

CinemachineVirtualCamera itself misreads with the generated tree (out of bounds after m_Lens), so its head is parsed by
hand up to the lens: MonoBehaviour header, m_ExcludedPropertiesInInspector (string[]), m_LockStageInInspector (int[]),
m_StreamingVersion, m_Priority, m_StandbyUpdate, m_LookAt, m_Follow, then FieldOfView, OrthographicSize, NearClipPlane,
FarClipPlane, Dutch. Positions/rotations of the vcams are their Transforms (art/env, art/player scene.json).
"""
import json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fl  # noqa: E402
from export_timelines import Paths  # noqa: E402

GAME = os.path.dirname(HERE)
PIPE = ("Cinemachine.CinemachineTransposer", "Cinemachine.CinemachineComposer", "Cinemachine.CinemachineHardLookAt",
        "Cinemachine.Cinemachine3rdPersonFollow", "Cinemachine.CinemachineBasicMultiChannelPerlin",
        "Cinemachine.CinemachineOrbitalTransposer", "Cinemachine.CinemachineHardLockToTarget",
        "Cinemachine.CinemachineTrackedDolly", "Cinemachine.CinemachineSameAsFollowTarget", "Cinemachine.CinemachinePOV",
        "Cinemachine.CinemachineGroupComposer", "Cinemachine.CinemachineFramingTransposer")
AIM = ("Composer", "HardLookAt", "POV", "SameAsFollowTarget", "GroupComposer")


class R:
    def __init__(self, b):
        self.b, self.i = b, 0

    def align(self):
        self.i = (self.i + 3) & ~3

    def int(self):
        v = struct.unpack_from("<i", self.b, self.i)[0]
        self.i += 4
        return v

    def float(self):
        v = struct.unpack_from("<f", self.b, self.i)[0]
        self.i += 4
        return v

    def pptr(self):
        f = self.int()
        p = struct.unpack_from("<q", self.b, self.i)[0]
        self.i += 8
        return f, p

    def str(self):
        n = self.int()
        s = self.b[self.i:self.i + n].decode("utf-8", "replace")
        self.i += n
        self.align()
        return s


def head(raw):
    r = R(raw)
    r.pptr()                        # m_GameObject
    r.i += 1                        # m_Enabled
    r.align()
    r.pptr()                        # m_Script
    r.str()                         # m_Name
    [r.str() for _ in range(r.int())]
    [r.int() for _ in range(r.int())]
    streaming, priority, standby = r.int(), r.int(), r.int()
    look, follow = r.pptr(), r.pptr()
    fov, ortho, near, far, dutch = (r.float() for _ in range(5))
    return {"priority": priority, "standby": standby, "look": look, "follow": follow,
            "fov": round(fov, 3), "near": round(near, 4), "far": round(far, 2), "dutch": round(dutch, 3)}


def main():
    fl.load(["level2", "level4", "globalgamemanagers.assets", "sharedassets2.assets", "sharedassets4.assets"])
    out = {}
    for sname in ("level2", "level4"):
        P = Paths(sname)
        ext = fl.ext_names(next(iter(P.objs.values())).assets_file)
        # pipeline MonoBehaviours grouped by their GameObject's parent (the vcam)
        pipe = {}
        for pid, o in P.objs.items():
            if o.type.name != "MonoBehaviour":
                continue
            cls = fl.script(o)[1]
            if cls in PIPE:
                g = P.owner.get(pid)
                vcam_go = P.t2g.get(P.par.get(g))
                try:
                    d = fl.clean(fl.read(o), ext)
                except Exception as e:  # noqa: BLE001
                    d = {"err": str(e)[:80]}
                for k in ("m_Enabled", "m_Name", "m_GameObject", "m_Script"):
                    d.pop(k, None)
                pipe.setdefault(vcam_go, []).append((cls.split(".")[-1].replace("Cinemachine", ""), d))
        for pid, o in P.objs.items():
            if o.type.name != "MonoBehaviour" or fl.script(o)[1] != "Cinemachine.CinemachineVirtualCamera":
                continue
            h = head(o.get_raw_data())
            g = P.owner.get(pid)
            rec = {"scene": sname, "priority": h["priority"], "fov": h["fov"], "near": h["near"], "far": h["far"],
                   "dutch": h["dutch"]}
            for k in ("look", "follow"):
                f, p = h[k]
                rec[k] = (P.path(p) if f == 0 else f"{ext[f - 1]}:{p}") if p else None
            for kind, d in pipe.get(g, []):
                if kind == "BasicMultiChannelPerlin":
                    rec["noise"] = d
                elif kind in AIM:
                    rec["aim"] = dict(d, type=kind)
                else:
                    rec["body"] = dict(d, type=kind)
            out[P.path(g)] = rec
    with open(os.path.join(GAME, "data", "vcams.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    bad = [k for k, v in out.items() if not (1 <= v["fov"] <= 179)]
    print(f"{len(out)} vcams, {sum(1 for v in out.values() if v.get('body'))} with body, "
          f"{sum(1 for v in out.values() if v.get('aim'))} with aim; fov out of range: {bad}")


if __name__ == "__main__":
    main()
