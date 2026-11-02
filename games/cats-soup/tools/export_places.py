"""Export the place prefab of every main-forest work (Entity_Work eventType 0, prefab places/place<index>) in chunks of
12, in table order, to art/places<k>/ via export_prefabs.py. Writes data/places.json: work index -> chunk.

usage: py -3.12 -I export_places.py [first-chunk]
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REF = "D:/catsoup-ref"
res = {k for k, f, p in json.load(open(f"{REF}/resources.json"))}
works = [w for w in json.load(open(f"{REF}/flat/Work.json", encoding="utf-8"))
         if w["eventType"] == 0 and f"places/place{w['index']}" in res]
chunks = [works[i:i + 12] for i in range(0, len(works), 12)]
first = int(sys.argv[1]) if len(sys.argv) > 1 else 0
for k, ch in enumerate(chunks):
    if k < first:
        continue
    keys = [f"places/place{w['index']}" for w in ch]
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "export_prefabs.py"), f"places{k}"] + keys,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(k, (r.stdout.strip().splitlines() or ["?"])[-1], r.stderr[-300:] if r.returncode else "", flush=True)
os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
json.dump({w["index"]: k for k, ch in enumerate(chunks) for w in ch},
          open(os.path.join(GAME, "data", "places.json"), "w"), separators=(",", ":"))
