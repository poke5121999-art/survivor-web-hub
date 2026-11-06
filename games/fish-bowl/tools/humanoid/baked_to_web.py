"""baked.json (HumanoidBake.cs, Unity coordinates, every frame) -> games/fish-bowl/art/anim/humanoid.json.

Usage: py -3.12 baked_to_web.py <baked.json>
Same clip shape as art/anim/clips.json: {"clips": {"<name>@humanoid": {name, duration, loop, tracks: [{path, prop, times,
values}]}}} with path relative to the TeenBoyRigged Animator ("" = root motion), three.js coordinates
(position (x, y, -z), quaternion (-x, -y, z, w)). Quaternion tracks for every bone, position tracks only where the
position moves (root, hips). Keys that linear interpolation reproduces within EPS are dropped.
The AssetRipper file names Idle_1 is the clip Timeline calls "Idle"; it is renamed back.
"""
import json, math, os, sys

GAME = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EPS = 5e-4
RENAME = {"Idle_1": "Idle"}


def reduce(times, vals):
    keep = [0]
    for i in range(1, len(times) - 1):
        a, b = keep[-1], i + 1
        t = (times[i] - times[a]) / (times[b] - times[a])
        if any(abs(vals[a][k] + (vals[b][k] - vals[a][k]) * t - vals[i][k]) > EPS for k in range(len(vals[i]))):
            keep.append(i)
    if len(times) > 1:
        keep.append(len(times) - 1)
    return [round(times[i], 4) for i in keep], [round(x, 5) for i in keep for x in vals[i]]


def main():
    baked = json.load(open(sys.argv[1], encoding="utf-8"))
    clips = {}
    for name, c in baked.items():
        fps = c["fps"]
        series = {"": c["root"], **c["bones"]}
        tracks = []
        for path, frames in series.items():
            times = [f / fps for f in range(len(frames))]
            pos = [[f[0], f[1], -f[2]] for f in frames]
            quat = []
            for f in frames:
                q = [-f[3], -f[4], f[5], f[6]]
                if quat and sum(a * b for a, b in zip(q, quat[-1])) < 0:
                    q = [-x for x in q]
                quat.append(q)
            if max(math.dist(p, pos[0]) for p in pos) > 1e-4:
                t, v = reduce(times, pos)
                tracks.append({"path": path, "prop": "position", "times": t, "values": v})
            t, v = reduce(times, quat)
            tracks.append({"path": path, "prop": "quaternion", "times": t, "values": v})
        nm = RENAME.get(name, name)
        clips[f"{nm}@humanoid"] = {"name": nm, "duration": c["length"], "loop": False, "tracks": tracks}
        print(f"{nm}: {len(tracks)} tracks, {sum(len(t['times']) for t in tracks)} keys")
    out = os.path.join(GAME, "art", "anim", "humanoid.json")
    json.dump({"clips": clips}, open(out, "w"), separators=(",", ":"))
    print("humanoid.json KB:", os.path.getsize(out) // 1024)


if __name__ == "__main__":
    main()
