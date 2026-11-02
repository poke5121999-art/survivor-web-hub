"""Merge anim/clips.json + animctl.json -> GAME/data/clips.json keyed by runtime keys. Usage: combine_anim.py CLIPS ANIMCTL OUT"""
import sys, json, re
clips = json.load(open(sys.argv[1])); ctl = json.load(open(sys.argv[2]))
CODES = {'sharedassets0.assets': 'a0', 'sharedassets1.assets': 'a1', 'sharedassets2.assets': 'a2'}
out = {'clips': {}, 'controllers': ctl}
for k, c in clips.items():
    m = re.match(r'(.*)@(.*):(\d+)$', k)
    out['clips'][f'{CODES[m.group(2)]}_{m.group(3)}'] = c
json.dump(out, open(sys.argv[3], 'w'), separators=(',', ':'))
print(len(out['clips']), 'clips', len(ctl), 'controllers')
