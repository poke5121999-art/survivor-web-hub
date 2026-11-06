# -*- coding: utf-8 -*-
"""rip_groundnav.py - boc dai dan duong duoi dat (GroundNavigation) cua NPC sanh.

    set PYTHONIOENCODING=utf-8
    python tools/rip_groundnav.py

Nguon [DO]: moi prefab NPC trong remote_prefab_assets_object co con "GroundNavigationPrefab" mang MonoBehaviour
GroundNavigation (NpcObject._navigation; LuaApi.SetNpcNavigationActive -> NpcObject.SetNavigationActive bat/tat no, dat
StartPoint = nhan vat, EndPoint = NPC). Luoi la dai (ribbon) sinh luc chay theo NavMeshPath; vat lieu Mtl_DE_GroundNavigation
(URP trong suot, alpha clip 0.5, _Speed cuon UV) voi texture Img_DE_GroundNavigationPattern.

Ra:
    art/object/GroundNavigation.webp   texture hoa van (Img_DE_GroundNavigationPattern)
    art/object/GroundNavigation.json   tham so GroundNavigation + vat lieu (ribbonWidth, uvTiling, fixedHeight, cutoff..., speed, cutoff alpha)
"""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vd

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'art', 'object')
MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'
KEEP = ['_ribbonWidth', '_uvTiling', '_fixedHeight', '_segmentCount', '_smoothCorners', '_cutoffStartDistance',
        '_cutoffEndDistance', '_cameraDirection', '_uvPerspectiveScale', '_widthPerspectiveScale', '_navUpdateInterval']


def run(env):
    b = vd.bfile('remote_prefab_assets_object')
    for sf in vd.serialized_files(env, b):
        for o in sf.objects.values():
            if o.type.name != 'MonoBehaviour':
                continue
            mb = o.read()
            try:
                if mb.m_Script.deref_parse_as_object().m_ClassName != 'GroundNavigation':
                    continue
            except Exception:
                continue
            tt = o.read_typetree()
            go = vd.deref(mb.m_GameObject)
            out = {'source': 'remote_prefab_assets_object/<NpcId>/' + go.m_Name + ' (GroundNavigation)'}
            for k in KEEP:
                out[k.lstrip('_')] = tt[k]
            for c in go.m_Components:
                co = c.component.deref() if hasattr(c, 'component') else c.deref()
                if co.type.name != 'MeshRenderer':
                    continue
                for m in co.read().m_Materials:
                    mat = vd.deref(m)
                    if not mat:
                        continue
                    sp = mat.m_SavedProperties
                    fl = dict(sp.m_Floats)
                    col = dict(sp.m_Colors).get('_BaseColor')
                    out['material'] = {'name': mat.m_Name, 'speed': fl.get('_Speed'), 'alphaClip': fl.get('_AlphaClip'),
                                       'cutoff': fl.get('_Cutoff'), 'surface': fl.get('_Surface'), 'cull': fl.get('_Cull'),
                                       'baseColor': [round(col.r, 3), round(col.g, 3), round(col.b, 3), round(col.a, 3)] if col else None}
                    for k, v in sp.m_TexEnvs:
                        tex = vd.deref(v.m_Texture)
                        if k == '_MainTex' and tex:
                            os.makedirs(OUT, exist_ok=True)
                            tex.image.convert('RGBA').save(os.path.join(OUT, 'GroundNavigation.webp'), 'WEBP', lossless=True)
                            out['material']['texture'] = {'name': tex.m_Name, 'size': [tex.m_Width, tex.m_Height],
                                                          'wrap': [tex.m_TextureSettings.m_WrapU, tex.m_TextureSettings.m_WrapV],
                                                          'filter': tex.m_TextureSettings.m_FilterMode}
            if 'material' not in out:
                continue
            with io.open(os.path.join(OUT, 'GroundNavigation.json'), 'w', encoding='utf-8') as fh:
                json.dump(out, fh, ensure_ascii=False, indent=1)
            print(json.dumps(out, ensure_ascii=False))
            return True
    raise SystemExit('KHÔNG THẤY GroundNavigation')


if __name__ == '__main__':
    vd.with_deps(vd.bfile('remote_prefab_assets_object'), run,
                 deps=[vd.bfile(MONO), vd.bfile('dependencies_assets_material'), vd.bfile('dependencies_assets_shader'),
                       vd.bfile('dependencies_assets_texture')])
