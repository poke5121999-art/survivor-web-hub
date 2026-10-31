"""Export the gameplay MonoBehaviours of level2 + level4 with every reference resolved to a GameObject path.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_components.py

Writes games/fish-bowl/data/components.json:
  {"<GameObject path>": {"<class>": {field: value, ...}, ...}, ...}
A PPtr to an object of the same scene becomes "@<GameObject path>" (+ "#<Type>" when it points at a component, e.g.
"@Player#AudioSource"); a PPtr into another file stays {"f", "id"} plus "name" when that object has one (AudioClip,
Material, prefab). UnityEvents become [{target, method, mode, arg}] where mode is Unity's PersistentListenerMode
(1 Void, 2 Object, 3 Int, 4 Float, 5 String, 6 Bool) and arg the matching argument.
Only classes from Assembly-CSharp outside the third-party namespaces are kept (see SKIP), the ones gameplay reads.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fl  # noqa: E402
from export_timelines import Paths  # noqa: E402
from export_vcams import R  # noqa: E402

GAME = os.path.dirname(HERE)
SKIP = ("UnityEngine.", "TMPro.", "Cinemachine.", "DG.", "ControlFreak2.", "Coffee.", "FIMSpace.", "Bakery", "ft",
        "EpicToonFX.", "SickscoreGames.", "MagicLightProbes.", "UnityStandardAssets.", "GestureRecognizer.UILineRenderer",
        "DynamicBone", "NativeAdsController")


def trigger_events(raw):
    """AS.TriggerEvents by hand: the generated tree reads it out of bounds, the bytes are TriggerTags (string[]),
    OnTriggerEnterEvent, OnTriggerExitEvent (UnityEvent), OnEnter/OnExitConditionalEvents (PPtr)."""
    r = R(raw)
    r.pptr()
    r.i += 1
    r.align()
    r.pptr()
    r.str()
    pp = lambda: dict(zip(("m_FileID", "m_PathID"), r.pptr()))  # noqa: E731

    def event():
        calls = []
        for _ in range(r.int()):
            c = {"m_Target": pp(), "m_TargetAssemblyTypeName": r.str(), "m_MethodName": r.str(), "m_Mode": r.int()}
            a = {"m_ObjectArgument": pp(), "m_ObjectArgumentAssemblyTypeName": r.str(), "m_IntArgument": r.int(),
                 "m_FloatArgument": r.float(), "m_StringArgument": r.str(), "m_BoolArgument": raw[r.i]}
            r.i += 1
            r.align()
            c["m_Arguments"] = a
            c["m_CallState"] = r.int()
            calls.append(c)
        return {"m_PersistentCalls": {"m_Calls": calls}}
    d = {"TriggerTags": [r.str() for _ in range(r.int())]}
    d["OnTriggerEnterEvent"] = event()
    d["OnTriggerExitEvent"] = event()
    d["OnEnterConditionalEvents"] = pp()
    d["OnExitConditionalEvents"] = pp()
    assert r.i == len(raw), f"AS.TriggerEvents: read {r.i} of {len(raw)} bytes"
    return d


def main():
    fl.load(["level2", "level4", "globalgamemanagers.assets", "sharedassets0.assets", "sharedassets1.assets",
             "sharedassets2.assets", "sharedassets4.assets"])
    names = {}
    for f in ("sharedassets0.assets", "sharedassets1.assets", "sharedassets2.assets", "sharedassets4.assets"):
        for pid, o in fl.by_file(f).items():
            if o.type.name in ("AudioClip", "Material", "GameObject", "Texture2D", "Sprite", "AnimationClip"):
                try:
                    names[(f, pid)] = o.read_typetree().get("m_Name")
                except Exception:  # noqa: BLE001
                    pass
    out, errors = {}, []
    for sname in ("level2", "level4"):
        P = Paths(sname)
        ext = fl.ext_names(next(iter(P.objs.values())).assets_file)

        def ref(v):
            if isinstance(v, dict):
                if set(v) == {"m_FileID", "m_PathID"}:
                    if not v["m_PathID"]:
                        return None
                    if v["m_FileID"] == 0:
                        p = P.path(v["m_PathID"])
                        k = P.kind(v["m_PathID"])
                        if k == "MonoBehaviour":
                            k = fl.script(P.objs[v["m_PathID"]])[1]
                        return f"@{p}" + ("" if k == "GameObject" else f"#{k}") if p else {"id": v["m_PathID"]}
                    f = ext[v["m_FileID"] - 1]
                    r = {"f": f, "id": v["m_PathID"]}
                    if (f, v["m_PathID"]) in names:
                        r["name"] = names[(f, v["m_PathID"])]
                    return r
                if "m_PersistentCalls" in v:
                    calls = []
                    for c in v["m_PersistentCalls"]["m_Calls"]:
                        a = c["m_Arguments"]
                        mode = c["m_Mode"]
                        arg = {2: ref(a["m_ObjectArgument"]), 3: a["m_IntArgument"], 4: round(a["m_FloatArgument"], 4),
                               5: a["m_StringArgument"], 6: bool(a["m_BoolArgument"])}.get(mode)
                        calls.append({"target": ref(c["m_Target"]), "type": c["m_TargetAssemblyTypeName"].split(",")[0],
                                      "method": c["m_MethodName"], "mode": mode, "arg": arg,
                                      "state": c.get("m_CallState", 2)})
                    return calls
                return {k: ref(x) for k, x in v.items()}
            if isinstance(v, list):
                return [ref(x) for x in v]
            if isinstance(v, float):
                return round(v, 5)
            if isinstance(v, (bytes, bytearray)):
                return None
            return v

        for pid, o in P.objs.items():
            if o.type.name != "MonoBehaviour":
                continue
            asm, cls = fl.script(o)
            if not asm or asm.startswith("Unity") or cls.startswith(SKIP):
                continue
            try:
                d = trigger_events(o.get_raw_data()) if cls == "AS.TriggerEvents" else fl.read(o)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{sname} {P.path(pid)} {cls}: {str(e)[:60]}")
                continue
            body = {k: ref(v) for k, v in d.items() if k not in ("m_GameObject", "m_Script", "m_Name", "m_ObjectHideFlags",
                                                                   "m_CorrespondingSourceObject", "m_PrefabInstance",
                                                                   "m_PrefabAsset")}
            path = P.path(pid)
            slot = out.setdefault(path, {})
            if cls in slot:
                n = 2
                while f"{cls}#{n}" in slot:
                    n += 1
                cls = f"{cls}#{n}"
            slot[cls] = body
    with open(os.path.join(GAME, "data", "components.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"{sum(len(v) for v in out.values())} components on {len(out)} objects; {len(errors)} unreadable:")
    for e in errors:
        print("  ", e)


if __name__ == "__main__":
    main()
