"""Humanoid (Mecanim muscle) clips -> bone tracks, one variant per Avatar that plays them.

Usage (from games/petshop): ~/burger-work/.venv/bin/python -I tools/export_humanoid.py
Run after export_anim.py. Reads art/anim/clips.json + controllers.json and the Animators of art/pool + art/store
scene.json, adds clips["<clip key>|<avatar path id>"] = {name, duration, loop, tracks} and rewrites clips.json.

export_anim.py exports Transform bindings only, so every customer / cashier clip (all humanoid) came out with 0 tracks
and the people slid around frozen in their bind pose. The muscle -> rotation math is in humanoid.py.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
import export_anim as ea  # noqa: E402
import humanoid as hu  # noqa: E402

GAME = os.path.dirname(HERE)
ANIM = os.path.join(GAME, "art", "anim")


def unwrap(x):
    if isinstance(x, dict):
        if set(x.keys()) == {"data"}:
            return unwrap(x["data"])
        return {k: unwrap(v) for k, v in x.items()}
    if isinstance(x, list):
        return [unwrap(v) for v in x]
    return x


def human_frames(clip):
    """Sample the clip at its rate; returns (times from 0, [dict attribute -> value]) or None if not humanoid."""
    b = clip["m_ClipBindingConstant"]["genericBindings"]
    if not any(x["typeID"] == 95 and x.get("customType") == 8 for x in b):
        return None
    at, t0, t1, loop = ea.decode_clip(clip)
    sr = clip["m_SampleRate"] or 30.0
    n = max(2, int(round((t1 - t0) * sr)) + 1)
    times = np.linspace(t0, t1, n)
    out = []
    for t in times:
        v = at(t)
        ci, val = 0, {}
        for x in b:
            w = (4 if x["attribute"] == 2 else 3) if x["typeID"] == 4 else 1
            if x["typeID"] == 95:
                val[x["attribute"]] = float(v[ci])
            ci += w
        out.append(val)
    return times - t0, out, t1 - t0, bool(loop)


def tracks_for(av, times, frames):
    nodes = len(av.parent)
    Q = np.zeros((len(frames), nodes, 4))
    hipsT = np.zeros((len(frames), 3))
    for k, val in enumerate(frames):
        locq, (hq, ht) = av.pose(val)
        for i in range(nodes):
            Q[k, i] = locq[i]
        Q[k, av.bone[0]] = hq
        hipsT[k] = ht
    tracks = []
    for i in range(1, nodes):
        path = av.names[i]
        if not path:
            continue
        q = Q[:, i]
        q = np.stack([-q[:, 0], -q[:, 1], q[:, 2], q[:, 3]], 1)   # Unity -> three.js
        q = q / np.linalg.norm(q, axis=1, keepdims=True)
        for j in range(1, len(q)):
            if np.dot(q[j], q[j - 1]) < 0:
                q[j] = -q[j]
        tracks.append(track(path, "quaternion", times, q))
    p = np.stack([hipsT[:, 0], hipsT[:, 1], -hipsT[:, 2]], 1)
    tracks.append(track(av.names[av.bone[0]], "position", times, p))
    return tracks


def track(path, prop, times, v):
    tt = times
    if np.abs(v - v[0]).max() < 1e-5:
        tt, v = tt[:1], v[:1]
    else:
        keep = ea.reduce_keys(tt, v, EPS[prop], prop == "quaternion")
        tt, v = tt[keep], v[keep]
    return {"path": path, "bone": path.split("/")[-1], "prop": prop, "times": ea.rnd(tt, 3), "values": ea.rnd(v, 4)}


# looser than the generic clips' 5e-4: 123 variants of ~50 bones made clips.json 12.5 MB; 3e-3 on a unit quaternion is
# ~0.3 degrees, 2 mm on the hips
EPS = {"quaternion": 3e-3, "position": 2e-3}


def main():
    env = mm.load()
    objs = {(o.assets_file.name, o.path_id): o for o in env.objects}
    clips = json.load(open(os.path.join(ANIM, "clips.json")))
    ctrls = json.load(open(os.path.join(ANIM, "controllers.json")))
    by_ref = {c["ref"]: c for c in ctrls.values()}
    # (controller ref, avatar (file, id)) pairs from the Animators the game spawns
    pairs = set()
    for sub in ("pool", "store"):
        for n in json.load(open(os.path.join(GAME, "art", sub, "scene.json")))["nodes"]:
            a = (n.get("k") or {}).get("Animator")
            if a and a.get("m_Avatar") and a.get("m_Controller"):
                pairs.add((f"{a['m_Controller']['f']}:{a['m_Controller']['id']}", (a["m_Avatar"]["f"], a["m_Avatar"]["id"])))
    avatars, cache, made = {}, {}, 0
    for ref, avk in sorted(pairs):
        c = by_ref.get(ref)
        if not c:
            continue
        keys = {st["clip"] for ly in c["layers"] for st in ly["states"].values() if st.get("clip")}
        for key in sorted(keys):
            name, rest = key.rsplit("@", 1)
            stem, pid = rest.rsplit(":", 1)
            fn = next((f for f, p in objs if p == int(pid) and f.split(".")[0] == stem), None)
            if fn is None:
                continue
            if key not in cache:
                cache[key] = human_frames(objs[(fn, int(pid))].read_typetree())
            hf = cache[key]
            if hf is None:
                continue
            if avk not in avatars:
                avatars[avk] = hu.Avatar(unwrap(objs[avk].read_typetree()))
                if not avatars[avk].parent:
                    print("not a human avatar:", avk)
            av = avatars[avk]
            if not av.parent:
                continue
            times, frames, dur, loop = hf
            clips["clips"][f"{key}|{avk[1]}"] = {"name": name, "duration": round(dur, 4), "loop": loop,
                                                 "tracks": tracks_for(av, times, frames)}
            made += 1
    with open(os.path.join(ANIM, "clips.json"), "w") as f:
        json.dump(clips, f, separators=(",", ":"))
    print(f"humanoid variants: {made} (clips {len([k for k, v in cache.items() if v])}, avatars {len(avatars)});",
          "clips.json KB:", os.path.getsize(os.path.join(ANIM, "clips.json")) // 1024)


if __name__ == "__main__":
    main()
