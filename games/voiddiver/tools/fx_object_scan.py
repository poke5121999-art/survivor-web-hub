# -*- coding: utf-8 -*-
"""fx_object_scan.py - soi prefab "đồ vật" (remote_prefab_assets_object) xem có hệ hạt không.

    set PYTHONIOENCODING=utf-8
    python fx_object_scan.py SphereFieldExit PhoneBooth ...

In cây GameObject: số ParticleSystem/TrailRenderer/Light/MeshRenderer/SkinnedMeshRenderer/Spine, tên script,
và chuỗi trong script trùng tên prefab VFX (để biết đồ vật gọi VFX nào lúc chạy).
Prefab có ParticleSystem thì bóc bằng: python fx_export.py --bundle remote_prefab_assets_object <tên...>
"""
import collections, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vc  # noqa: E402
import fx_export  # noqa: E402

OBJ = 'remote_prefab_assets_object'


def strings_in(v, out):
    if isinstance(v, str):
        out.append(v)
    elif isinstance(v, dict):
        for x in v.values():
            strings_in(x, out)
    elif isinstance(v, list):
        for x in v:
            strings_in(x, out)


def scan(env, go, vfx_names, depth=0, acc=None):
    acc = acc if acc is not None else {'count': collections.Counter(), 'scripts': collections.Counter(), 'vfx': set(), 'ps_nodes': []}
    tf = None
    for cp in go.m_Component:
        try:
            c = cp.component.read()
        except FileNotFoundError:
            raise
        except Exception:
            continue
        tn = type(c).__name__
        acc['count'][tn] += 1
        if tn in ('Transform', 'RectTransform'):
            tf = c
        elif tn == 'ParticleSystem':
            acc['ps_nodes'].append(go.m_Name)
        elif tn == 'MonoBehaviour':
            try:
                cls = c.m_Script.read().m_ClassName
            except FileNotFoundError:
                raise
            except Exception:
                cls = '?'
            acc['scripts'][cls] += 1
            try:
                ss = []
                strings_in(cp.component.read_typetree(), ss)
                for s in ss:
                    leaf = s.replace('\\', '/').split('/')[-1]
                    if leaf in vfx_names:
                        acc['vfx'].add(s)
            except FileNotFoundError:
                raise
            except Exception:
                pass
    if tf is not None:
        for ch in tf.m_Children:
            scan(env, ch.read().m_GameObject.read(), vfx_names, depth + 1, acc)
    return acc


def main(names):
    ob = vc.bfile(OBJ)
    deps = {vc.bfile(p) for p in fx_export.PRELOAD}

    def run(env):
        pmap = fx_export.build_prefab_map(env, ob)
        vb = vc.bfile(fx_export.VFX_BUNDLE)
        venv = vc.env_of([vb])
        vfx_names = set(fx_export.build_prefab_map(venv, vb).keys())
        res = {}
        for n in names:
            if n not in pmap:
                res[n] = None
                continue
            res[n] = scan(env, pmap[n][0].read(), vfx_names)
        return res
    res = vc.with_deps(ob, run, deps)
    for n in names:
        a = res[n]
        if a is None:
            print('%-22s KHÔNG có trong %s' % (n, OBJ))
            continue
        c = a['count']
        print('%-22s PS %d  Trail %d  Light %d  Mesh %d  Skinned %d  Sprite %d | script %s | VFX gọi: %s' % (
            n, c['ParticleSystem'], c['TrailRenderer'], c['Light'], c['MeshRenderer'], c['SkinnedMeshRenderer'],
            c['SpriteRenderer'], dict(a['scripts'].most_common(6)), sorted(a['vfx']) or '-'))


if __name__ == '__main__':
    main(sys.argv[1:])
