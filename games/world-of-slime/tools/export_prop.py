"""Export prop prefabs (object_pr_*, object_har_*, object_obj*, object_common, object_t*, item_cube*) to GLB.

Run:  py -3.12 -I games/world-of-slime/tools/export_prop.py [bundle ...] [--workers 4]
Out:  <wos.ASSETS>/prop/<bundle>.glb     one node per prefab (root children); skinned props keep their skeleton and
                                         the clips of their Animator's controller (glTF animations, 30 fps, LINEAR)
      <wos.ASSETS>/prop/tex/<hash>.webp  shared textures (external URIs)
      <wos.ASSETS>/prop/index.json       per piece: bundle, bounds, materials (shader + params), colliders, clips

Same conventions as export_map.py (X negated, vertex colours in `_COLOR`). Particle systems are not exported; the
piece's `particles` count says how many the prefab had.
"""
import os, sys, re, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wos
import export_map as em

PROP_RX = re.compile(r'^(object_(pr|har|obj|common|t\d\d)([_.].*)?|item_cube[^.]*)\.bundle$')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    argv = sys.argv[1:]
    workers = 4
    if '--workers' in argv:
        i = argv.index('--workers'); workers = int(argv[i + 1]); del argv[i:i + 2]
    args = [a for a in argv if not a.startswith('--')]
    outdir = os.path.join(wos.ASSETS, 'prop')
    if args:
        bundles = [a if a.endswith('.bundle') else a + '.bundle' for a in args]
    else:
        bundles = sorted(b for b in em.bundle_index()['bundles'] if PROP_RX.match(b))
    print(len(bundles), 'bundles', flush=True)
    t0 = time.time()
    results = em.run_all(bundles, outdir, workers, anims=True, generator='export_prop.py', clear=not args)
    if args:      # partial run (debugging): index.json is left alone
        print('partial run: index.json not rewritten; run without bundle names for the full manifest')
        return
    idx = em.manifest(results, outdir, 'prop')
    print(json.dumps(idx['totals']), f'{time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
