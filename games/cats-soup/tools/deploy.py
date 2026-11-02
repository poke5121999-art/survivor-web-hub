"""Commit games/cats-soup (+ thumbnail, tests, plan) on top of origin/main through a temporary index, with the hub card
in origin/main's data/games.js. The working tree (other agents' uncommitted changes) is not touched.

usage: py -3.12 -I games/cats-soup/tools/deploy.py <rev> "<message>" [--push] [--stub=a,b] [--desc=<vi>||<en>]
  --stub: features still being written: their module files go in as the registry stub, their other files stay out.
  --desc: new card description (Vietnamese || English).
"""
import json, os, re, subprocess, sys

REPO = "D:/survivor-web-hub"
rev, msg = sys.argv[1], sys.argv[2]
opts = sys.argv[3:]
push = "--push" in opts
STUB = [x for a in opts if a.startswith("--stub=") for x in a[7:].split(",") if x]
DESC = next((a[7:] for a in opts if a.startswith("--desc=")), None)
os.chdir(REPO)
env = dict(os.environ, GIT_INDEX_FILE=os.path.join(REPO, ".git", "index-cats-soup"))
G = "games/cats-soup"


def git(*a, inp=None):
    r = subprocess.run(["git", *a], cwd=REPO, env=env, input=inp, capture_output=True)
    if r.returncode:
        raise SystemExit(f"git {' '.join(a)} failed: {r.stderr.decode(errors='replace')}")
    return r.stdout.decode("utf-8", errors="replace").strip()


def blob(rel, text):
    sha = git("hash-object", "-w", "--stdin", "--path", rel, inp=text.encode("utf-8"))
    git("update-index", "--add", "--cacheinfo", f"100644,{sha},{rel}")


def stub_body(x, part):
    tail = "data: [] };" if part == "sim" else "mount() {} };"
    return f'// Feature "{x}" ({part} part). Contract: js/{part}/registry.js.\nexport default {{ id: \'{x}\', {tail}\n'


git("read-tree", "origin/main")
games = git("show", "origin/main:data/games.js") + "\n"
assert 'id: "cats-soup"' in games, "card missing on origin/main"
games = re.sub(r'(id: "cats-soup",[\s\S]*?rev: ")\d{8}[a-z]', lambda m: m.group(1) + rev, games, count=1)
if DESC:
    vi, en = DESC.split("||")
    i = games.index('id: "cats-soup"')
    j = games.index("    desc: ", i)
    k = games.index('",\n', j)
    games = games[:j] + "    desc: " + json.dumps(vi, ensure_ascii=False) + games[k + 1:]
    e = games.index("en: {", i)
    j = games.index("desc: ", e)
    k = games.index('" }', j)
    games = games[:j] + "desc: " + json.dumps(en, ensure_ascii=False) + games[k + 1:]
blob("data/games.js", games)

paths, stubs = [], []
tests = sorted("test/" + t for t in os.listdir("test")
               if t.startswith("cats-soup-") and t.endswith(".js") and not any(t.startswith(f"cats-soup-{x}") for x in STUB))
for top in [G, "assets/thumbnails/cats-soup.png", "brain/plans/cats-soup.md"] + tests:
    if os.path.isdir(top):
        for d, _, fs in os.walk(top):
            for f in fs:
                rel = os.path.join(d, f).replace("\\", "/")
                if f.endswith(".raw.glb") or "__pycache__" in rel or f == "export.log":
                    continue
                skip = False
                for x in STUB:
                    if rel in (f"{G}/css/{x}.css", f"{G}/data/{x}.json", f"{G}/tools/export_{x}.py") or rel.startswith(f"{G}/art/{x}/"):
                        skip = True
                    for part in ("sim", "view"):
                        if rel == f"{G}/js/{part}/features/{x}.js":
                            stubs.append((rel, stub_body(x, part)))
                            skip = True
                if not skip:
                    paths.append(rel)
    elif os.path.exists(top):
        paths.append(top)
for i in range(0, len(paths), 200):
    git("add", "-f", "--", *paths[i:i + 200])
for rel, body in stubs:
    blob(rel, body)
tree = git("write-tree")
commit = git("commit-tree", tree, "-p", "origin/main", "-m",
             msg + "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"
             "Claude-Session: https://claude.ai/code/session_01QZUyEXjZ96x5n2YTfGsD2t")
print("commit", commit, "files", len(paths), "stubs", len(stubs))
print(git("diff", "--stat", "origin/main", commit).splitlines()[-1])
if push:
    r = subprocess.run(["git", "push", "origin", f"{commit}:refs/heads/main"], cwd=REPO, capture_output=True, text=True)
    print(r.stdout, r.stderr)
