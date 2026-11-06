"""Dump every pattern prefab referenced by a *GamePlayConfig bundle as raw JSON nodes."""
import sys, json, math
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *
bundle, out = sys.argv[1], sys.argv[2]
env=load_with_deps(bundle)
cfg=[v for k,v in env.container.items() if k.endswith('GamePlayConfig.asset')][0].deref()
ct=cfg.read_typetree(); sf=cfg.assets_file
KEEP={'SpriteRenderer':('m_Sprite','m_Color','m_SortingOrder','m_FlipX','m_FlipY','m_DrawMode','m_Size','m_SortingLayerID'),
 'CapsuleCollider2D':('m_Offset','m_Size','m_Direction','m_IsTrigger'),
 'BoxCollider2D':('m_Offset','m_Size','m_IsTrigger'),
 'CircleCollider2D':('m_Offset','m_Radius','m_IsTrigger'),
 'PolygonCollider2D':('m_Offset','m_Points','m_IsTrigger'),
 'EdgeCollider2D':('m_Offset','m_Points','m_IsTrigger'),
 'Rigidbody2D':('m_BodyType','m_Mass','m_GravityScale','m_Constraints','m_LinearDrag','m_AngularDrag'),
 'Animator':('m_Controller',)}
spr_cache={}
def sprite_name(ptr,fsf):
    o=resolve(fsf,ptr)
    if not o: return None
    k=(o.assets_file.name,o.path_id)
    if k not in spr_cache: spr_cache[k]=o.read_typetree()['m_Name']
    return spr_cache[k]
def comp(co):
    t=co.read_typetree(); nm=co.type.name
    if nm=='MonoBehaviour':
        nm=script_name(t); d={k:v for k,v in t.items() if k not in('m_GameObject','m_Enabled','m_Script','m_Name','ShadowMaterial')}
        return nm,d
    if nm in KEEP:
        d={k:t[k] for k in KEEP[nm] if k in t}
        if nm=='SpriteRenderer':
            d['m_Sprite']=sprite_name(t['m_Sprite'],co.assets_file)
            d['mat']=[sprite_name(m,co.assets_file) for m in t.get('m_Materials',[])]
        if nm in ('CapsuleCollider2D','PolygonCollider2D','BoxCollider2D','CircleCollider2D') and t.get('m_Material',{}).get('m_PathID'):
            d['pmat']=sprite_name(t['m_Material'],co.assets_file)
        if nm=='Animator':
            a=resolve(co.assets_file,t['m_Controller']); d={'controller':a.read_typetree().get('m_Name') if a else None}
        return nm,d
    return nm,None
def node(go):
    g=go.read_typetree(); comps={}; tr=None
    for c in g['m_Component']:
        co=resolve(go.assets_file,c['component'])
        if co is None: continue
        nm,d=comp(co)
        if nm=='Transform': tr=co.read_typetree(); continue
        comps.setdefault(nm,[]).append(d)
    q=tr['m_LocalRotation']; rz=math.degrees(2*math.atan2(q['z'],q['w']))
    n={'name':g['m_Name'],'active':g['m_IsActive'],'p':[tr['m_LocalPosition']['x'],tr['m_LocalPosition']['y']],
       's':[tr['m_LocalScale']['x'],tr['m_LocalScale']['y']],'r':rz,'c':comps,'ch':[]}
    for ch in tr['m_Children']:
        cto=resolve(go.assets_file,ch); n['ch'].append(node(resolve(cto.assets_file,cto.read_typetree()['m_GameObject'])))
    return n
patterns={}
def pattern(ptr):
    o=resolve(sf,ptr); key=f"{o.assets_file.name}:{o.path_id}"
    if key not in patterns:
        pc=o.read_typetree(); go=resolve(o.assets_file,pc['m_GameObject'])
        n=node(go); patterns[key]=n
    return patterns[key]['name']
res={'deterministic':[[pattern(p) for p in L['patternPrefabs']] for L in ct.get('_deterministicLevelDefinitions',[])],
     'random':[[pattern(p) for p in R['_possiblePatterns']] for R in ct.get('_randomLevelDefinition',[])],
     'patterns':{v['name']:v for v in patterns.values()},
     'configKeys':[k for k in ct.keys()]}
json.dump(res,open(out,'w'),indent=0); print(len(res['patterns']),'patterns')
