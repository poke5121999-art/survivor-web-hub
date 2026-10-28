"""Export every customization skin, trail and rope: animation clips with their sprite frames, plus UI icons.

    py -3 -I export_skins.py [only-name ...]
Writes D:/stickman-hook-ref/custom/<kind>/<name>/*.png and D:/stickman-hook-ref/custom/custom.json:
  skins:  {name: {game: {clip: {stop, loop, rate, frames:[sprite...]}}, dance: {...}, ui: sprite, sprites: {sprite: meta}}}
  trails / ropes: {name: {bundles: {...component dumps...}, ui: sprite, sprites: {...}}}
Sprite meta = {w, h, ppu, px, py} with the pivot in image pixels from the top-left.
"""
import sys, os, re, json, glob
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

OUT = r'D:/stickman-hook-ref/custom'
only = set(a.lower() for a in sys.argv[1:])
files = sorted(os.path.basename(f) for f in glob.glob(AND + 'defaultlocalgroup_assets_customization_*.bundle'))
groups = {}
for f in files:
    m = re.match(r'defaultlocalgroup_assets_customization_(skins|trails|ropes)_([a-z0-9]+)_(.+)_[0-9a-f]{32}\.bundle$', f)
    if not m: continue
    kind, name, part = m.groups()
    if only and name not in only: continue
    groups.setdefault((kind, name), {})[part] = f

meta_path = os.path.join(OUT, 'custom.json')
res = json.load(open(meta_path)) if os.path.exists(meta_path) else {'skins': {}, 'trails': {}, 'ropes': {}}


def save_sprite(o, d):
    s = o.read()
    img = s.image
    rect, off, piv = s.m_Rect, s.m_RD.textureRectOffset, s.m_Pivot
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, s.m_Name + '.png'))
    return s.m_Name, {'w': img.width, 'h': img.height, 'ppu': s.m_PixelsToUnits,
                      'px': round(piv.x * rect.width - off.x, 2), 'py': round(img.height - (piv.y * rect.height - off.y), 2)}


def clips_of(env, own_cabs, d, sprites):
    out = {}
    for o in env.objects:
        if o.type.name != 'AnimationClip': continue
        t = o.read_typetree()
        frames = []
        for p in t['m_ClipBindingConstant']['pptrCurveMapping']:
            so = resolve(o.assets_file, p)
            if so is None: frames.append(None); continue
            n, md = save_sprite(so, d) if so.read_typetree()['m_Name'] not in sprites else (so.read_typetree()['m_Name'], None)
            if md: sprites[n] = md
            frames.append(n)
        mc = t['m_MuscleClip']
        out[t['m_Name']] = {'stop': round(mc['m_StopTime'], 4), 'loop': mc['m_LoopTime'], 'rate': t['m_SampleRate'], 'frames': frames}
    return out


def ui_sprite(bundle, d, sprites):
    env = UnityPy.load(AND + bundle)
    for o in env.objects:
        if o.type.name == 'Sprite':
            n, md = save_sprite(o, d); sprites[n] = md
            return n
    return None


def components(bundle):
    env = load_with_deps(bundle)
    own = {sf.name.lower() for sf in sfs(UnityPy.load(AND + bundle))}
    dump = []
    for o in env.objects:
        if o.assets_file.name.lower() not in own: continue
        if o.type.name in ('MonoBehaviour', 'TrailRenderer', 'LineRenderer', 'SpriteRenderer', 'Material', 'ParticleSystem'):
            t = o.read_typetree()
            if o.type.name == 'MonoBehaviour': t = {'_script': script_name(t), **t}
            for k in ('m_GameObject', 'm_Script', 'm_StaticBatchInfo', 'm_LightmapTilingOffset', 'm_LightmapTilingOffsetDynamic'):
                t.pop(k, None)
            dump.append({'type': o.type.name, 'v': t})
    return dump


for (kind, name), parts in sorted(groups.items()):
    d = os.path.join(OUT, kind, name)
    sprites = {}
    entry = {'sprites': sprites}
    if kind == 'skins':
        for part, key in (('animationcontroller', 'game'), ('danceanimationcontroller', 'dance')):
            if part in parts:
                env = load_with_deps(parts[part])
                entry[key] = clips_of(env, None, d, sprites)
    else:
        for part, f in parts.items():
            if part != 'ui':
                entry.setdefault('bundles', {})[part] = components(f)
                env = UnityPy.load(AND + f)
                for o in env.objects:
                    if o.type.name == 'Sprite':
                        n, md = save_sprite(o, d); sprites[n] = md
                    if o.type.name == 'Texture2D':
                        tx = o.read(); os.makedirs(d, exist_ok=True)
                        tx.image.save(os.path.join(d, 'tex_' + tx.m_Name + '.png'))
                        entry.setdefault('textures', []).append(tx.m_Name)
    if 'ui' in parts:
        entry['ui'] = ui_sprite(parts['ui'], d, sprites)
    entry['effects'] = sorted(p for p in parts if p.startswith('effects_'))
    res[kind][name] = entry
    print(kind, name, len(sprites), 'sprites', {k: len(v) for k, v in entry.items() if isinstance(v, dict) and k in ('game', 'dance')})
    json.dump(res, open(meta_path, 'w'), indent=0, default=str)
