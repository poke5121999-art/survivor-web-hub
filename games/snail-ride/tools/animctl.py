"""Summarize AnimatorControllers -> JSON. Usage: animctl.py DUMP_DIR OUT_JSON"""
import sys, json, os
dump, outp = sys.argv[1], sys.argv[2]
ext = json.load(open(os.path.join(dump, 'externals.json')))
recs = {}
for fn in ('sharedassets0.assets', 'sharedassets1.assets', 'sharedassets2.assets'):
    for r in json.load(open(os.path.join(dump, 'json', fn + '.json'))):
        recs[(fn, r['path_id'])] = r
def deref(fn, p):
    f = fn if p['m_FileID'] == 0 else ext[fn][p['m_FileID'] - 1]
    return f, recs.get((f, p['m_PathID']))
out = {}
for (fn, pid), r in recs.items():
    if r['type'] != 'AnimatorController': continue
    d = r['data']; tos = {int(k if not isinstance(k, list) else k[0]): v for k, v in (d['m_TOS'].items() if isinstance(d['m_TOS'], dict) else [(x[0], x[1]) for x in d['m_TOS']])}
    nm = lambda h: tos.get(h, h)
    clips = []; clipKeys = []
    CODES = {'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2'}
    for c in d['m_AnimationClips']:
        f, cr = deref(fn, c); clips.append(cr['data']['m_Name'] if cr else None)
        clipKeys.append(f'{CODES.get(f, f)}_{c["m_PathID"]}')
    ctl = d['m_Controller']
    params = [(nm(v['m_ID']), v['m_Type'], v.get('m_DefaultFloat'), v.get('m_DefaultBool')) for v in ctl['m_Values']['data']['m_ValueArray']] if 'data' in ctl['m_Values'] else [(nm(v['m_ID']), v['m_Type']) for v in ctl['m_Values']['m_ValueArray']]
    layers = []
    sms = ctl['m_StateMachineArray']
    # behaviours
    beh = d.get('m_StateMachineBehaviours', [])
    bdesc = d.get('m_StateMachineBehaviourVectorDescription', {})
    rng = {}
    for item in bdesc.get('m_StateMachineBehaviourRanges', []):
        k, v = (item[0], item[1]) if isinstance(item, list) else (item['first'], item['second'])
        rng[(k['m_LayerIndex'], k['m_StateID'])] = (v['m_StartIndex'], v['m_Count'])
    idxs = bdesc.get('m_StateMachineBehaviourIndices', [])
    for li, L in enumerate(ctl['m_LayerArray']):
        L = L.get('data', L)
        sm = sms[L['m_StateMachineIndex']]; sm = sm.get('data', sm)
        states = []
        for s in sm['m_StateConstantArray']:
            s = s.get('data', s)
            bt = s['m_BlendTreeConstantArray']
            cl = []
            for b in bt:
                b = b.get('data', b)
                for n in b['m_NodeArray']:
                    n = n.get('data', n)
                    if n['m_ClipID'] != 4294967295 and n['m_ClipID'] < len(clips): cl.append(clipKeys[n['m_ClipID']])
            trs = []
            for t in s['m_TransitionConstantArray']:
                t = t.get('data', t)
                conds = [(c.get('data', c)['m_ConditionMode'], nm(c.get('data', c)['m_EventID']), c.get('data', c)['m_EventThreshold']) for c in t['m_ConditionConstantArray']]
                trs.append({'dst': t['m_DestinationState'], 'dur': t['m_TransitionDuration'], 'exit': t['m_ExitTime'] if t.get('m_HasExitTime') else None, 'conds': conds})
            b = []
            key = (li, s['m_FullPathID'])
            for k2, (st, cnt) in rng.items():
                if k2[0] == li and (k2[1] == s['m_FullPathID'] or k2[1] == s['m_NameID'] or k2[1] == s.get('m_PathID')):
                    for i in range(st, st + cnt):
                        f, br = deref(fn, beh[idxs[i]])
                        if br: b.append({k: v for k, v in br['data'].items() if k.startswith('m_') and k not in ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')})
            states.append({'name': nm(s['m_NameID']), 'speed': s['m_Speed'], 'speedParam': nm(s['m_SpeedParamID']) if s.get('m_SpeedParamID') else None, 'loop': s['m_Loop'], 'clips': cl, 'trans': trs, 'beh': b})
        anyt = [{'dst': t.get('data', t)['m_DestinationState'], 'conds': [(c.get('data', c)['m_ConditionMode'], nm(c.get('data', c)['m_EventID']), c.get('data', c)['m_EventThreshold']) for c in t.get('data', t)['m_ConditionConstantArray']], 'dur': t.get('data', t)['m_TransitionDuration']} for t in sm['m_AnyStateTransitionConstantArray']]
        layers.append({'default': sm['m_DefaultState'], 'states': states, 'any': anyt, 'blend': L.get('m_LayerBlendingMode'), 'weight': L.get('m_DefaultWeight')})
    out[{'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2'}[fn] + f'_{pid}'] = {'name': d['m_Name'], 'file': fn, 'id': pid, 'clips': clips, 'params': params, 'layers': layers}
json.dump(out, open(outp, 'w'), indent=1)
print(list(out))
