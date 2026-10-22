"""Export the particle layers of a few FX prefabs (fx.bundle) as data + textures for the web (F5a).

The game's FX are Unity ParticleSystems (billboards). The web cannot run them, so this tool writes, per prefab, the
layers the web needs to rebuild an approximation with the ORIGINAL textures:

  fx/index.json  {prefab: {layers: [{name, path, scale (world, product of parent scales), active, life, size, speed,
                  color (startColor.maxColor), rate, bursts, shape, renderMode, alignment, uv: [tilesX, tilesY] | null,
                  colorOverLife, sizeOverLife, material: {name, shader, floats, colors, tex: {prop: uri}}}]}}
  fx/tex/<texture name>.webp

Only the start values are read (curves of colour/size over lifetime are flagged, not sampled). Mesh-mode layers keep
the mesh name only. Run:  py -3.12 -I export_fx.py [prefab ...]   (default: the 13 EnergyBall prefabs of attack_type
7..19 + their hit FX)
"""
import io, json, os, sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wos

# attack_type 7..19 rangedResource (data/meta/attack_type.json) = đòn thường của 13 hệ; trúng = FX_EN0_Hit_<Hệ>
ELEMS = ('Dark', 'Fire', 'Electric', 'Grass', 'Ground', 'Ice', 'Light', 'Magic', 'Poison', 'Power', 'Steel', 'Water', 'Wind')
DEFAULT = [f'FX_EN0_RangeAtk_{e}_EnergyBall' for e in ELEMS] + [f'FX_EN0_Hit_{e}' for e in ELEMS]
OUT = os.path.join(wos.ASSETS, 'fx')


def mm(x):
    st = x.get('minMaxState')
    if st == 0: return round(float(x.get('scalar', 0)), 4)
    if st == 3: return [round(float(x.get('minScalar', 0)), 4), round(float(x.get('scalar', 0)), 4)]
    return {'state': st, 'scalar': round(float(x.get('scalar', 0)), 4)}


def tex_out(t, done):
    if t.m_Name in done: return done[t.m_Name]
    img = t.image
    if max(img.size) > 256:
        img.thumbnail((256, 256))
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    uri = f'fx/tex/{t.m_Name}.webp'
    img.save(os.path.join(wos.ASSETS, *uri.split('/')), 'WEBP', quality=90, method=6)
    done[t.m_Name] = uri
    return uri


def material(mp, done):
    m = mp.read()
    mt = m.object_reader.read_typetree()
    _, floats, colors = wos.tt_props(mt)
    try:
        sh = m.m_Shader.read(); shader = sh.object_reader.peek_name() if hasattr(sh.object_reader, 'peek_name') else None
        shader = shader or sh.object_reader.read_typetree()['m_ParsedForm']['m_Name']
    except Exception:
        shader = '?'
    tex = {}
    for p, te in m.m_SavedProperties.m_TexEnvs:
        if te.m_Texture.path_id:
            try:
                t = te.m_Texture.read()
                if t.object_reader.type.name == 'Texture2D': tex[p] = tex_out(t, done)
            except Exception as e:
                tex[p] = f'({e})'
    return dict(name=m.m_Name, shader=shader, floats={k: round(float(v), 4) for k, v in sorted(floats.items())},
                colors={k: [round(float(c), 4) for c in v] for k, v in sorted(colors.items())}, tex=tex)


def prefab(env, name, done):
    root = None
    for f in env.files.values():
        for sf in getattr(f, 'files', {}).values():
            for k, v in (getattr(sf, 'container', None) or {}).items():
                if k.endswith('/' + name + '.prefab'):
                    root = v.read()
    if root is None:
        return None
    layers = []

    def walk(tr, path, sc, active):
        go = tr.m_GameObject.read()
        s = sc * tr.m_LocalScale.x
        act = active and bool(go.m_IsActive)
        comps = {c.component.type.name: c for c in go.m_Component}
        if 'ParticleSystem' in comps and 'ParticleSystemRenderer' in comps:
            pt = comps['ParticleSystem'].component.read_typetree()
            rt = comps['ParticleSystemRenderer'].component.read_typetree()
            r = comps['ParticleSystemRenderer'].component.read()
            im, em, uv = pt['InitialModule'], pt['EmissionModule'], pt['UVModule']
            mats = [material(mp, done) for mp in r.m_Materials if mp.path_id]
            mesh = None
            if rt.get('m_RenderMode') == 4 and rt.get('m_Mesh', {}).get('m_PathID'):
                try: mesh = r.m_Mesh.read().m_Name
                except Exception: mesh = '(external)'
            c = im['startColor']
            layers.append(dict(
                name=go.m_Name, path=path, scale=round(s, 4), active=act,
                pos=[round(-tr.m_LocalPosition.x, 4), round(tr.m_LocalPosition.y, 4), round(tr.m_LocalPosition.z, 4)],
                life=mm(im['startLifetime']), size=mm(im['startSize']), speed=mm(im['startSpeed']),
                color=[round(float(c['maxColor'][k]), 4) for k in 'rgba'] if c.get('minMaxState') in (0, None) else
                {'state': c.get('minMaxState'), 'min': [round(float(c['minColor'][k]), 4) for k in 'rgba'],
                 'max': [round(float(c['maxColor'][k]), 4) for k in 'rgba']},
                rate=mm(em['rateOverTime']), bursts=[mm(b['countCurve']) for b in em.get('m_Bursts', [])],
                maxParticles=im.get('maxNumParticles'), shape=dict(enabled=bool(pt['ShapeModule'].get('enabled')),
                                                                   type=pt['ShapeModule'].get('type'),
                                                                   radius=round(float(pt['ShapeModule'].get('radius', {}).get('value', 0)), 4)),
                renderMode=rt.get('m_RenderMode'), alignment=rt.get('m_RenderAlignment'), mesh=mesh,
                uv=[uv.get('tilesX'), uv.get('tilesY')] if uv.get('enabled') else None,
                colorOverLife=bool(pt['ColorModule'].get('enabled')), sizeOverLife=bool(pt['SizeModule'].get('enabled')),
                rotationOverLife=bool(pt['RotationModule'].get('enabled')),
                material=mats[0] if mats else None))
        for ch in tr.m_Children:
            cr = ch.read()
            walk(cr, path + '/' + cr.m_GameObject.read().m_Name, s, act)

    walk(wos.transform_of(root), name, 1.0, True)
    return dict(layers=layers)


def main():
    names = sys.argv[1:] or DEFAULT
    env, _ = wos.load(['fx.bundle'], depth=1)
    idx_path = os.path.join(OUT, 'index.json')
    idx = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) and sys.argv[1:] else {}
    done = {}
    for n in names:
        r = prefab(env, n, done)
        print(n, 'missing' if r is None else f'{len(r["layers"])} layers')
        if r: idx[n] = r
    os.makedirs(OUT, exist_ok=True)
    with open(idx_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(idx, f, ensure_ascii=False, indent=1, sort_keys=True)
    print('textures', len(done), '->', OUT)


if __name__ == '__main__':
    main()
