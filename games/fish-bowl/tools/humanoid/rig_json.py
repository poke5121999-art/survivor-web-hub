"""rig.json for HumanoidBake.cs: Timmy's bone tree (TeenBoyRigged subtree of art/env/scene.json) back in Unity coordinates.

Usage: py -3.12 rig_json.py <out rig.json> "<clip|clip|...>"
The scene.json transforms are three.js (x, y, -z) / (-x, -y, z, w); the mapping is its own inverse. The root is written at
identity so the baked root track is the clip's own root motion. Nodes below the rig that are not bones (the fish bowl
Timmy carries in level 5) are dropped: they carry no animation.
"""
import json, os, sys

GAME = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RIG = "ActivityManager/Activities/Level 1/Timeline - Intro/TimelineAssets/TeenBoyRigged"


def main():
    out, clips = sys.argv[1], sys.argv[2].split("|")
    nodes = json.load(open(os.path.join(GAME, "art", "env", "scene.json"), encoding="utf-8"))["nodes"]

    def path(i):
        parts = []
        while i >= 0:
            parts.append(nodes[i]["n"])
            i = nodes[i]["p"]
        return "/".join(reversed(parts))

    root = next(i for i in range(len(nodes)) if path(i) == RIG)
    keep, index = [], {}
    for i, n in enumerate(nodes):
        j, inside = i, False
        while j >= 0:
            if j == root:
                inside = True
                break
            j = nodes[j]["p"]
        if inside and (i == root or n["n"].startswith("mixamorig") or nodes[n["p"]]["n"] == "TeenBoyRigged"):
            if i != root and n["p"] not in index:
                continue
            index[i] = len(keep)
            t, r, s = n.get("t", [0, 0, 0]), n.get("r", [0, 0, 0, 1]), n.get("s", [1, 1, 1])
            if i == root:
                t, r, s = [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]
            keep.append({"n": n["n"], "p": index.get(n["p"], -1) if i != root else -1,
                         "t": [t[0], t[1], -t[2]], "r": [-r[0], -r[1], r[2], r[3]], "s": s})
    json.dump({"avatar": "TeenBoyRiggedAvatar.asset", "nodes": keep, "clips": clips}, open(out, "w"), indent=0)
    print(f"rig.json: {len(keep)} nodes under {RIG.split('/')[-1]}, {len(clips)} clips")


if __name__ == "__main__":
    main()
