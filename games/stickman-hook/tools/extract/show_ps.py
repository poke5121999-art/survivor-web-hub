"""Print the enabled modules of a dump_confetti.py JSON:  py -3 -I show_ps.py confetti_dump.json"""
import json, io, sys
d = json.load(io.open(sys.argv[1], encoding='utf-8'))
for name, comps in d.items():
    print('==', name)
    tr = comps.get('Transform')
    if tr: print('Transform pos', tr['m_LocalPosition'], 'rot', tr['m_LocalRotation'], 'scale', tr['m_LocalScale'])
    ps = comps.get('ParticleSystem')
    if not ps: continue
    for k, v in ps.items():
        if isinstance(v, dict) and 'enabled' in v and not v['enabled']:
            print(' [off]', k); continue
        if k in ('InitialModule', 'ShapeModule', 'EmissionModule', 'VelocityModule', 'ClampVelocityModule', 'ColorModule',
                 'RotationModule', 'RotationBySpeedModule', 'SizeModule', 'NoiseModule', 'ForceModule', 'InheritVelocityModule',
                 'ExternalForcesModule', 'CollisionModule', 'UVModule', 'ColorBySpeedModule', 'SizeBySpeedModule', 'LifetimeByEmitterSpeedModule', 'TrailModule', 'CustomDataModule', 'SubModule', 'TriggerModule', 'LightsModule'):
            print(' ', k, json.dumps(v)[:3000])
        elif not isinstance(v, dict):
            print(' ', k, v)
    r = comps.get('ParticleSystemRenderer')
    if r:
        print(' renderer mode', r.get('m_RenderMode'), 'sort', r.get('m_SortingOrder'), 'mats', r.get('_mats'), 'minmax', r.get('m_MinParticleSize'), r.get('m_MaxParticleSize'), 'align', r.get('m_RenderAlignment'), 'flip', r.get('m_Flip'), 'pivot', r.get('m_Pivot'))
