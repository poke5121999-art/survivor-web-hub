# -*- coding: utf-8 -*-
"""rip_npc.py - boc hinh NPC sanh (Npc.csv 600001..701026) cua VOID DIVER demo.

    set PYTHONIOENCODING=utf-8
    python tools/rip_npc.py            # prefab NPC + moi bo Spine NPC ma chung dung + data/npcs.js
    python tools/rip_npc.py --manifest # chi ghi lai data/npcs.js tu cache prefab

Nguon [DO]: NPC khong nam trong remote_prefab_assets_unit ma trong remote_prefab_assets_object, moi prefab ten = NpcId.
Goc prefab co MonoBehaviour NpcObject {_npcId, _holdingTime, _holdingSfx, _interactionSfx}, con Model/SkeletonAnimation_NW|SW
(hoac mot "Spine GameObject (X)") tro SkeletonDataAsset "X_SW_SkeletonData"; scale dat o transform cua SkeletonAnimation.
Vi tri, NpcId nao co mat o sanh lay tu Sector.csv NpcSpawnDatas (lounge.js doc VD.T.Sector), khong ghi o day.

Ra:
    art/spine/<Ten>/                 skel + atlas + png + meta.json (cung dinh dang tools/rip.py)
    data/npcs.js                     VD.NPCS = {npcId: {spine, skins, anim, loop, scale, flip, yaw, holdSfx, useSfx, radius, hud}}
Thu vien bundle: tools/vd_common.py; ham boc Spine dung lai tools/rip.py (rip_spine_names).
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vd
import rip

GAME = os.path.dirname(HERE)
MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'
CACHE_P = os.path.join(vd.CACHE, 'npc_prefabs_v1.json')
# Spine trang tri cua sanh (sector 9001 json 'spines'): cung dinh dang, cung thu muc art/spine/.
DECOR = ['World_Cat', 'World_Pendulum', 'World_Butterfly', 'World_LoungeBG']
NAME_RE = re.compile(r'^(6000\d\d|70\d{4}|710\d{3})$')


def class_map(env):
    out = {}
    for o in env.objects:
        if o.type.name == 'MonoScript':
            try:
                out[o.path_id] = o.read().m_ClassName
            except Exception:
                pass
    return out


def clsname(o, cmap):
    try:
        return cmap.get(o.parse_monobehaviour_head().m_Script.path_id, '?')
    except Exception:
        return '?'


def comps(go):
    out = []
    for c in go.m_Component:
        ob = c.component if hasattr(c, 'component') else c
        try:
            out.append(ob.deref())
        except FileNotFoundError as e:
            if any(b in str(e).lower() for b in vd.BUILTIN):
                continue
            raise
        except Exception:
            continue
    return out


def scan_prefabs():
    b = vd.bfile('remote_prefab_assets_object')

    def run(env):
        cmap = class_map(env)
        res = {}
        for sf in vd.serialized_files(env, b):
            for t in vd.roots_of(sf):
                name = t.m_GameObject.deref_parse_as_object().m_Name
                if not NAME_RE.match(name):
                    continue
                info = {'spines': [], 'npcObject': None, 'radius': None, 'hudY': None}

                def walk(tr, sc, active, rel):
                    go = tr.m_GameObject.deref_parse_as_object()
                    s = tr.m_LocalScale
                    sc = (sc[0] * s.x, sc[1] * s.y, sc[2] * s.z)
                    on = active and bool(go.m_IsActive)
                    for o in comps(go):
                        if o.type.name == 'CapsuleCollider' and rel == '':
                            tt = o.read_typetree()
                            info['radius'] = round(tt.get('m_Radius', 0), 3)
                        if o.type.name != 'MonoBehaviour':
                            continue
                        cn = clsname(o, cmap)
                        if cn == 'NpcObject':
                            tt = o.read_typetree()
                            info['npcObject'] = {k: tt.get(k) for k in ('_npcId', '_holdingTime', '_holdingSfx', '_interactionSfx')}
                        elif cn == 'SkeletonAnimation':
                            tt = o.read_typetree()
                            sda = vd.deref(o.read().skeletonDataAsset)
                            info['spines'].append({'path': rel, 'sda': sda.m_Name if sda is not None else None,
                                                   'skin': tt.get('initialSkinName'), 'anim': tt.get('_animationName'),
                                                   'loop': bool(tt.get('loop')), 'active': on,
                                                   'scale': [round(float(x), 3) for x in sc],
                                                   'pos': [round(tr.m_LocalPosition.x, 3), round(tr.m_LocalPosition.y, 3), round(-tr.m_LocalPosition.z, 3)]})
                        elif cn == 'NpcHudView' and info['hudY'] is None:
                            info['hudY'] = round(tr.m_LocalPosition.y, 3)
                    for ch in tr.m_Children:
                        c = ch.deref_parse_as_object()
                        n = c.m_GameObject.deref_parse_as_object().m_Name
                        walk(c, sc, on, (rel + '/' + n) if rel else n)
                walk(t, (1.0, 1.0, 1.0), True, '')
                res[name] = info
                sp = [(x['sda'], x['skin'], x['anim'], x['scale'][0]) for x in info['spines']]
                print(name, sp, flush=True)
        return res

    return vd.with_deps(b, run, deps=[vd.bfile(MONO), vd.bfile('dependencies_assets_spine')])


def base_of(sda):
    return re.sub(r'_(SW|NW)?_?SkeletonData$', '', sda or '').rstrip('_')


def manifest(pre):
    out = {}
    for name, info in sorted(pre.items()):
        sps = [s for s in info['spines'] if s['sda']]
        if not sps:
            continue
        # Uu tien SkeletonAnimation dang bat (SW), roi toi bat ky.
        main = next((s for s in sps if s['active'] and '_SW' in s['sda']), None) or next((s for s in sps if s['active']), None) or sps[0]
        base = base_of(main['sda'])
        d = os.path.join(GAME, 'art', 'spine', base)
        if not os.path.isdir(d):
            continue
        no = info['npcObject'] or {}
        sx = main['scale'][0]
        out[name] = {
            'spine': base,
            'skins': [main['skin']] if main['skin'] and main['skin'] != 'default' else [],
            'anim': main['anim'] or None, 'loop': main['loop'],
            'scale': round(abs(sx), 3), 'flip': sx < 0,
            'holdSfx': no.get('_holdingSfx') or None, 'useSfx': no.get('_interactionSfx') or None,
            'holdTime': round(no.get('_holdingTime') or 0, 3),
            'radius': info['radius'], 'hud': info['hudY'],
        }
    p = os.path.join(GAME, 'data', 'npcs.js')
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// SINH RA bởi tools/rip_npc.py — không sửa tay. Hình NPC sảnh theo prefab gốc (remote_prefab_assets_object/<NpcId>).\n')
        fh.write('window.VD = window.VD || {};\nVD.NPCS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('npcs.js', len(out), 'NPC ->', p)


def main():
    args = sys.argv[1:]
    if os.path.exists(CACHE_P) and '--rescan' not in args:
        pre = json.load(open(CACHE_P, encoding='utf-8'))
    else:
        pre = scan_prefabs()
        json.dump(pre, open(CACHE_P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if '--manifest' not in args:
        want = sorted({base_of(s['sda']) for i in pre.values() for s in i['spines'] if s['sda']} | set(DECOR))
        have = set(os.listdir(os.path.join(GAME, 'art', 'spine')))
        todo = [w for w in want if w not in have]
        print('spine can boc:', todo)
        if todo:
            rip.rip_spine_names(todo, os.path.join(GAME, 'art', 'spine'))
    manifest(pre)


if __name__ == '__main__':
    main()
