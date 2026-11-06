"""Dump an AnimatorController: states -> clip -> sprite frames (pptrCurveMapping order) + timing."""
import sys, json
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
from shenv import *

env = load_with_deps(sys.argv[1])
res = {}
for o in env.objects:
    if o.type.name == 'AnimationClip':
        t = o.read_typetree()
        cb = t['m_ClipBindingConstant']
        frames = []
        for p in cb['pptrCurveMapping']:
            s = resolve(o.assets_file, p)
            frames.append(s.read_typetree()['m_Name'] if s else None)
        mc = t['m_MuscleClip']
        res[t['m_Name']] = {'stop': round(mc['m_StopTime'], 4), 'loop': mc['m_LoopTime'], 'rate': t['m_SampleRate'],
                            'frames': frames,
                            'bindings': [(b['path'], b['attribute'], b['typeID'], b['customType']) for b in cb['genericBindings']][:12]}
    if o.type.name == 'AnimatorController':
        t = o.read_typetree()
        print('CONTROLLER', t['m_Name'], 'params', [ (v) for v in t['m_TOS'] ][:0])
        clips = [resolve(o.assets_file, c) for c in t['m_AnimationClips']]
        print('  clips', [c.read_typetree()['m_Name'] for c in clips if c])
json.dump(res, open(sys.argv[2], 'w'), indent=1)
for k, v in res.items():
    print(k, v['stop'], 'loop', v['loop'], v['rate'], len(v['frames']), v['frames'][:4], v['bindings'][:3])
