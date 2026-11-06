"""Export the six Timeline cutscenes of Aquarium Land with their scene bindings resolved.

Usage: PYTHONIOENCODING=utf-8 py -3.12 export_timelines.py

Writes games/fish-bowl/data/timelines.json:
  {"<director GameObject path>": {"asset": name, "duration", "wrap", "bindings": {track id: path},
     "tracks": [{id, type, name, muted, parent, clips: [...], extra}]}}
Paths are GameObject paths in level2 ("ActivityManager/Activities/Level 1/...") or level4; the view resolves them
against art/env and art/player scene.json. An exposed reference (CinemachineShot.VirtualCamera, ControlPlayableAsset
.sourceGameObject, TransformTweenClip locations) resolves through the director's m_ExposedReferences.
AnimationTracks bound to the player fish ("SetPlayer" on AS.TimelineController) are left unbound here; the view binds them.
Clip fields: start, dur, clipIn, scale, easeIn, easeOut, blendIn, blendOut (seconds) plus the asset's own data.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fl  # noqa: E402

GAME = os.path.dirname(HERE)
FILES = ["level2", "level4", "sharedassets2.assets", "globalgamemanagers.assets"]


class Paths:
    def __init__(self, name):
        self.objs = fl.by_file(name)
        self.name = name
        self.go, self.par, self.owner = {}, {}, {}
        for pid, o in self.objs.items():
            if o.type.name == "GameObject":
                d = o.read_typetree()
                self.go[pid] = d["m_Name"]
                for c in d["m_Component"]:
                    self.owner[c["component"]["m_PathID"]] = pid
        t2g = {}
        for pid, o in self.objs.items():
            if o.type.name in ("Transform", "RectTransform"):
                d = o.read_typetree()
                t2g[pid] = d["m_GameObject"]["m_PathID"]
                self.par[d["m_GameObject"]["m_PathID"]] = d["m_Father"]["m_PathID"]
        self.t2g = t2g

    def path(self, pid):
        g = pid if pid in self.go else self.owner.get(pid)
        if g is None:
            return None
        out = []
        while g in self.go:
            out.append(self.go[g])
            g = self.t2g.get(self.par.get(g))
        return "/".join(reversed(out))

    def kind(self, pid):
        o = self.objs.get(pid)
        return o.type.name if o else None


def clip_data(asset_obj, asset_cls, d, exposed):
    def ex(ref):
        if not ref:
            return None
        key = ref.get("exposedName")
        key = key.get("id") if isinstance(key, dict) else key
        return exposed.get(str(key)) or (ref.get("defaultValue") and "?default")

    if asset_cls == "UnityEngine.Timeline.AnimationPlayableAsset":
        c = d.get("m_Clip")
        return {"clip": c["id"] if c else None, "pos": d.get("m_Position"), "rot": d.get("m_Rotation"),
                "applyOffsets": d.get("m_ApplyFootIK")}
    if asset_cls == "CinemachineShot":
        return {"vcam": ex(d.get("VirtualCamera"))}
    if asset_cls == "TextSwitcherClip":
        return {"text": d["template"]["text"], "size": d["template"]["fontSize"], "color": d["template"]["color"]}
    if asset_cls == "UnityEngine.Timeline.ControlPlayableAsset":
        return {"source": ex(d.get("sourceGameObject")), "prefab": d.get("prefabGameObject"),
                "particles": d.get("updateParticle"), "active": d.get("active"), "postPlayback": d.get("postPlayback")}
    if asset_cls == "UnityEngine.Timeline.AudioPlayableAsset":
        c = d.get("m_Clip")
        return {"audio": c["id"] if c else None, "loop": d.get("m_Loop")}
    if asset_cls == "TransformTweenClip":
        t = d.get("template", {})
        return {"from": ex(d.get("startLocation")), "to": ex(d.get("endLocation")), "template": t}
    return {k: v for k, v in d.items() if k not in ("m_Enabled", "m_Name")}


def main():
    fl.load(FILES)
    shared = fl.by_file("sharedassets2.assets")
    mbs = {}
    for pid, o in shared.items():
        if o.type.name == "MonoBehaviour":
            cls = fl.script(o)[1]
            try:
                mbs[pid] = (cls, fl.clean(fl.read(o), fl.ext_names(o.assets_file)))
            except Exception as e:
                mbs[pid] = (cls, {"err": str(e)[:80]})
    clipname = {pid: o.read().m_Name for pid, o in shared.items() if o.type.name in ("AnimationClip", "AudioClip")}

    scenes = {n: Paths(n) for n in ("level2", "level4")}
    out = {}
    for sname, P in scenes.items():
        for pid, o in P.objs.items():
            if o.type.name != "PlayableDirector":
                continue
            d = o.read_typetree()
            asset = d["m_PlayableAsset"]["m_PathID"]
            if asset not in mbs:
                continue
            exposed = {}
            for k, v in d.get("m_ExposedReferences", {}).get("m_References", []):
                key = k if isinstance(k, str) else (k.get("id") if isinstance(k, dict) else k)
                if v["m_PathID"] and v["m_FileID"] == 0:
                    exposed[str(key)] = P.path(v["m_PathID"])
            bindings = {}
            for b in d.get("m_SceneBindings", []):
                if b["value"]["m_PathID"] and b["value"]["m_FileID"] == 0:
                    bindings[b["key"]["m_PathID"]] = {"path": P.path(b["value"]["m_PathID"]),
                                                     "type": P.kind(b["value"]["m_PathID"])}
            cls, td = mbs[asset]
            tracks = []

            def walk(ref, parent):
                tid = ref["id"]
                tcls, t = mbs.get(tid, ("?", {}))
                rec = {"id": tid, "type": tcls.split(".")[-1], "name": t.get("m_Name"), "parent": parent,
                       "muted": t.get("m_Muted", 0), "bind": bindings.get(tid), "clips": []}
                if rec["type"] == "AnimationTrack":
                    rec["infinite"] = t.get("m_InfiniteClip", {}) and t["m_InfiniteClip"]["id"]
                    rec["offset"] = {k: t.get(k) for k in ("m_TrackOffset", "m_Position", "m_EulerAngles", "m_ApplyOffsets")}
                if rec["type"] == "ActivationTrack":
                    rec["post"] = t.get("m_PostPlaybackState")
                for c in t.get("m_Clips", []) or []:
                    a = (c.get("m_Asset") or {}).get("id")
                    acls, ad = mbs.get(a, ("?", {}))
                    cd = {"start": c["m_Start"], "dur": c["m_Duration"], "clipIn": c.get("m_ClipIn", 0),
                          "scale": c.get("m_TimeScale", 1), "easeIn": c.get("m_EaseInDuration", 0),
                          "easeOut": c.get("m_EaseOutDuration", 0), "blendIn": c.get("m_BlendInDuration", -1),
                          "blendOut": c.get("m_BlendOutDuration", -1), "name": c.get("m_DisplayName"),
                          "extrapolation": [c.get("m_PreExtrapolationMode"), c.get("m_PostExtrapolationMode")],
                          "asset": acls.split(".")[-1]}
                    cd.update(clip_data(a, acls, ad, exposed))
                    if cd.get("clip"):
                        cd["clipName"] = clipname.get(cd["clip"])
                    if cd.get("audio"):
                        cd["audioName"] = clipname.get(cd["audio"])
                    rec["clips"].append(cd)
                if rec.get("infinite"):
                    rec["infiniteName"] = clipname.get(rec["infinite"])
                tracks.append(rec)
                for ch in t.get("m_Children", []) or []:
                    walk(ch, tid)

            for t in td.get("m_Tracks", []):
                walk(t, None)
            out[P.path(pid)] = {"scene": sname, "asset": td.get("m_Name"), "wrap": d.get("m_WrapMode"),
                                "playOnAwake": d.get("m_InitialState"), "fixedDuration": td.get("m_FixedDuration"),
                                "exposed": exposed, "tracks": tracks}
            print(f"{sname} {P.path(pid)} -> {td.get('m_Name')}: {len(tracks)} tracks, {len(bindings)} bindings, "
                  f"{len(exposed)} exposed", flush=True)
    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    with open(os.path.join(GAME, "data", "timelines.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
