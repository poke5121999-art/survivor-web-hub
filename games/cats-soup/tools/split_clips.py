"""Split art/anim/clips.json (export_anim.py) into art/anim/clips/<n>.json, one per clip, loaded when a state first
plays; writes art/anim/clip-index.json {clip key: n}. The full file is 8 MB, a cat on screen uses a handful of clips.

usage: py -3.12 -I split_clips.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(os.path.dirname(HERE), "art", "anim")
clips = json.load(open(os.path.join(A, "clips.json")))["clips"]
os.makedirs(os.path.join(A, "clips"), exist_ok=True)
index = {}
for n, (k, c) in enumerate(sorted(clips.items())):
    index[k] = n
    with open(os.path.join(A, "clips", f"{n}.json"), "w") as fh:
        json.dump(c, fh, separators=(",", ":"))
json.dump(index, open(os.path.join(A, "clip-index.json"), "w"), separators=(",", ":"))
os.remove(os.path.join(A, "clips.json"))
print(len(index), "clips")
