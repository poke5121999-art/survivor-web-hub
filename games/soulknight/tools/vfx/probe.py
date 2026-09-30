# -*- coding: utf-8 -*-
"""Soi thông số gốc Unity của một prefab hiệu ứng (để so với data/sk-vfx.js).

Chạy:  PYTHONIOENCODING=utf-8 python games/soulknight/tools/vfx/probe.py hit_orange [bundle ...] [--full]
In cây nút, renderer (vật liệu, shader, texture, sorting), trường chính của ParticleSystem và module đang bật.
Mặc định tìm trong common.ab rồi bullet.ab; --full in nguyên typetree của ParticleSystem/renderer.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from abx import Env  # noqa: E402

PS_MODS = ['EmissionModule', 'ShapeModule', 'VelocityModule', 'ClampVelocityModule', 'ForceModule', 'ColorModule',
           'SizeModule', 'RotationModule', 'UVModule', 'NoiseModule', 'CollisionModule', 'SubModule', 'TrailModule',
           'InheritVelocityModule', 'LightsModule', 'ExternalForcesModule', 'SizeBySpeedModule', 'RotationBySpeedModule',
           'ColorBySpeedModule', 'CustomDataModule', 'TriggerModule', 'LifetimeByEmitterSpeedModule']


def mat_info(E, ptr, cab):
    r = E.resolve(ptr, cab)
    if not r:
        return None
    t = E.tree(*r)
    sh = E.resolve(t.get('m_Shader'), r[0])
    shn = ''
    if sh:
        st = E.tree(*sh)
        shn = (st.get('m_ParsedForm') or {}).get('m_Name') or st.get('m_Name', '')
    props = t.get('m_SavedProperties', {})
    texs = {}
    for a, b in props.get('m_TexEnvs', []):
        tr = E.resolve(b['m_Texture'], r[0])
        if tr:
            tt = E.tree(*tr)
            texs[a] = '%s %dx%d filter=%s' % (tt.get('m_Name'), tt.get('m_Width', 0), tt.get('m_Height', 0),
                                            tt.get('m_TextureSettings', {}).get('m_FilterMode'))
    return {'mat': t.get('m_Name'), 'shader': shn, 'tex': texs,
            'floats': {a: b for a, b in props.get('m_Floats', []) if a in ('_DstBlend', '_SrcBlend', '_Mode', '_BlendOp', '_InvFade')},
            'colors': {a: b for a, b in props.get('m_Colors', []) if a in ('_Color', '_TintColor')}}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    full = '--full' in sys.argv
    name, rels = args[0], args[1:] or ['common.ab', 'bullet.ab']
    E = Env(rels, dep_depth=1)
    for rel in rels:
        for cab in E.cabs_of(rel):
            for rc, rg in E.roots(cab):
                if E.tree(rc, rg).get('m_Name') != name:
                    continue
                print('==', rel, cab)
                for c, g, dep in E.walk(rc, rg):
                    gt = E.tree(c, g)
                    tr = E.tree(*E.transform(c, g))
                    print('  ' * dep + '- %s active=%s pos=%s rot=%s scl=%s' % (
                        gt['m_Name'], gt.get('m_IsActive'), tuple(round(tr['m_LocalPosition'][k], 3) for k in 'xyz'),
                        tuple(round(tr['m_LocalRotation'][k], 3) for k in 'xyzw'), tuple(round(tr['m_LocalScale'][k], 3) for k in 'xyz')))
                    for tn, cc, co in E.components(c, g):
                        ct = E.tree(cc, co)
                        pad = '  ' * dep + '    '
                        if tn in ('SpriteRenderer', 'ParticleSystemRenderer', 'TrailRenderer', 'LineRenderer'):
                            mats = [mat_info(E, m, cc) for m in ct.get('m_Materials', [])]
                            keep = {k: ct.get(k) for k in ('m_Enabled', 'm_SortingLayer', 'm_SortingOrder', 'm_RenderMode', 'm_SortMode',
                                                           'm_Color', 'm_LengthScale', 'm_VelocityScale', 'm_MaxParticleSize',
                                                           'm_MinParticleSize', 'm_RenderAlignment', 'm_Flip', 'm_Pivot', 'm_DrawMode',
                                                           'm_MaskInteraction') if k in ct}
                            if tn == 'SpriteRenderer':
                                sp = E.resolve(ct.get('m_Sprite'), cc)
                                keep['sprite'] = E.tree(*sp).get('m_Name') if sp else None
                            print(pad + tn, json.dumps(keep), json.dumps(mats, ensure_ascii=False))
                            if full:
                                print(pad + json.dumps(ct, default=str)[:6000])
                        elif tn == 'ParticleSystem':
                            im = ct['InitialModule']
                            main_ = {k: ct.get(k) for k in ('lengthInSec', 'looping', 'prewarm', 'simulationSpeed', 'moveWithTransform',
                                                            'scalingMode', 'playOnAwake', 'useUnscaledTime', 'autoRandomSeed')}
                            print(pad + 'ParticleSystem', json.dumps(main_))
                            for k in ('startLifetime', 'startSpeed', 'startSize', 'startRotation', 'gravityModifier'):
                                v = im[k]
                                print(pad + '  %s state=%s scalar=%s min=%s' % (k, v.get('minMaxState'), v.get('scalar'), v.get('minScalar')))
                            print(pad + '  startColor', json.dumps(im['startColor'])[:400])
                            print(pad + '  maxNumParticles', im.get('maxNumParticles'), 'size3D', im.get('size3D'), 'rotation3D', im.get('rotation3D'))
                            on = [m for m in PS_MODS if ct.get(m, {}).get('enabled')]
                            print(pad + '  modules on:', on)
                            if full:
                                for m in on:
                                    print(pad + '  ' + m, json.dumps(ct[m], default=str)[:3000])
                        elif tn == 'MonoBehaviour':
                            print(pad + 'MB', E.script_name(cc, ct), json.dumps({k: v for k, v in ct.items() if not k.startswith('m_')}, default=str)[:600])
                        elif tn not in ('Transform', 'RectTransform'):
                            print(pad + tn)
                return


if __name__ == '__main__':
    main()
