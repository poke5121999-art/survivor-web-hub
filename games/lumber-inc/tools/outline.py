"""Print the GameObject outline of bundles: py -3.12 outline.py <bundle-prefix> [maxdepth] [rootname-filter]"""
import sys, collections
import lm

prefix = sys.argv[1]
maxd = int(sys.argv[2]) if len(sys.argv) > 2 else 3
filt = sys.argv[3] if len(sys.argv) > 3 else None
env = lm.load()
for fname in lm.bundle_files(prefix):
    objs = lm.by_file(fname)
    tt = {}
    def T(p):
        if p not in tt: tt[p] = objs[p].read_typetree()
        return tt[p]
    gos = [p for p, o in objs.items() if o.type.name == "GameObject"]
    owner, trans = {}, {}
    for g in gos:
        for c in T(g)["m_Component"]:
            cid = c["component"]["m_PathID"]; owner[cid] = g
            if cid in objs and objs[cid].type.name in ("Transform", "RectTransform"): trans[g] = cid
    kids, parent = collections.defaultdict(list), {}
    for g, t in trans.items():
        d = T(t)
        parent[g] = owner.get(d["m_Father"]["m_PathID"])
        kids[g] = [owner[x["m_PathID"]] for x in d["m_Children"] if x["m_PathID"] in owner]
    def comps(g):
        out = []
        for c in T(g)["m_Component"]:
            o = objs.get(c["component"]["m_PathID"])
            if o is None: continue
            n = o.type.name
            if n == "MonoBehaviour": n = lm.script(o)[1].split(".")[-1]
            if n not in ("Transform", "MeshFilter"): out.append(n)
        return out
    def size(g): return 1 + sum(size(k) for k in kids[g])
    def walk(g, d):
        G = T(g)
        print("  " * d + f"{G['m_Name']} [{size(g)}] {'' if G['m_IsActive'] else '(off) '}{','.join(comps(g))}")
        if d < maxd:
            seen = collections.Counter()
            for k in kids[g]:
                nm = T(k)["m_Name"]; seen[nm] += 1
                if seen[nm] <= 3: walk(k, d + 1)
            for nm, c in seen.items():
                if c > 3: print("  " * (d + 1) + f"... {nm} x{c}")
    print("##", fname, lm._bundle_of.get(fname))
    for g in gos:
        if g in trans and parent.get(g) is None and (not filt or filt in T(g)["m_Name"]):
            walk(g, 0)
