# -*- coding: utf-8 -*-
"""rip_sfx_refs.py -- boc nhung SFX ma bang/Lua goi toi nhung chua co trong audio/sfx/.

manifest.json (build_data.py) bo sot hai nhom, do duoc 2026-09-26:
  - HitBox co UseElementalHitSfx/UseElementalCritSfx: clip that mang duoi he nguyen to
    (Skill_100001_NormalAttack_Hit_None/_Fire/_Water/_Wind); ten tran trong bang khong co trong bundle.
    Nen tieng chem trung cua ca 4 nhan vat va Critical_* chua tung duoc boc.
  - LuaApi:PlaySfx("...") trong script campaign/sanh (ElaraWalk, DoorKey, QuestSuccess, ...).
Quet moi truong co ten chua 'sfx' trong data/tables.js + PlaySfx trong data/lua.js, bung duoi nguyen to,
giu ten co trong bundle ma audio/sfx/ chua co, them vao manifest.json roi boc bang rip.cmd_audio.

    set PYTHONIOENCODING=utf-8
    python rip_sfx_refs.py            # boc
    python rip_sfx_refs.py --dry      # chi in danh sach
Sau do chay build_assets.py de VD.ASSETS.sfx co ten moi.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rip
import vd_common as vd

ELEM = ['None', 'Fire', 'Water', 'Wind']


def load_js_obj(path, var):
    src = open(path, encoding='utf-8').read()
    i = src.index(var + ' = ') + len(var) + 3
    return json.JSONDecoder().raw_decode(src, i)[0]


def referenced():
    T = load_js_obj(os.path.join(rip.DATA, 'tables.js'), 'VD.T')
    L = load_js_obj(os.path.join(rip.DATA, 'lua.js'), 'VD.LUA')
    ref = set()

    def walk(o):
        if isinstance(o, list):
            for x in o:
                walk(x)
            return
        if not isinstance(o, dict):
            return
        for k, v in o.items():
            if 'sfx' in k.lower() and isinstance(v, str):
                if v and v != 'None':
                    ref.add(v)
                    if (k == 'hitSfx' and o.get('UseElementalHitSfx')) or (k == 'criticalHitSfx' and o.get('UseElementalCritSfx')):
                        ref.update(v + '_' + e for e in ELEM)
            elif 'sfx' in k.lower() and isinstance(v, list):
                ref.update(x for x in v if isinstance(x, str) and x)
            else:
                walk(v)
    walk(T)
    for src in L.values():
        ref.update(re.findall(r'PlaySfx\(\s*"([^"]+)"', src))
    return ref


def bundle_names():
    env = vd.env_of([vd.bfile('remote_sound_assets_sfx')])
    return {o.read().m_Name for o in env.objects if o.type.name == 'AudioClip'}


def main():
    have = {f[:-4] for f in os.listdir(os.path.join(rip.AUDIO, 'sfx')) if f.endswith('.mp3')}
    want = sorted(n for n in referenced() - have if n in bundle_names())
    print('can boc', len(want))
    if '--dry' in sys.argv:
        print('\n'.join(want))
        return
    m = rip.load_manifest()
    m['sfx'] = sorted(set(m.get('sfx', [])) | set(want))
    rip.save_manifest(m)
    rip.load_manifest = lambda: {'sfx': want, 'bgm': []}
    done = rip.cmd_audio(['sfx'])
    print('da boc', len(done['sfx']))


if __name__ == '__main__':
    main()
