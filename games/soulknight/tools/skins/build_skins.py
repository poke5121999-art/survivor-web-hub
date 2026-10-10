# -*- coding: utf-8 -*-
"""Skin nhân vật (skin 1..n của 42 hero) -> art/skins/<hero><i>.png + data/skins/<hero>.js, nạp lười khi chọn hero.

Chạy (cần ~/sk86-ref, xem tools/README.md):
    PYTHONIOENCODING=utf-8 ~/sk86-ref/venv/bin/python games/soulknight/tools/skins/build_skins.py [knight ranger ...]

Dùng lại extract_heroes của build_sk.py (CharacterSprites của common.ab: idle/run/dead từng skin) với packer riêng.
Mỗi gói: window.SK_PACKS[hero] = {pages, v, f, anims, skins: {sN: entry}, names: {sN: tên Việt}}.
data/skins/index.js: window.SK_SKINS = {hero: {v: băm tệp gói, skins: [[sN, tên Việt], ...]}} (luôn đủ 42 hero, kể cả
khi chỉ dựng lại vài gói) để màn chọn nhân vật vẽ ô skin trước khi gói nạp xong.
Layer >= 1 (char_hit, tư thế kỹ năng) dùng lại của s0: khoá anim trùng tên với sk-data nên không tách riêng được.

Hình kỹ năng riêng của skin (skins2.js): bundle skin N chứa sprite `<tiền tố>_N_skill_<a>_effect_<b>_<c>` (dạng lăn của Du Hiệp, dạng
sói của Người Sói, khiên Hiệp Sĩ Thánh, thuốc Giả Kim...) mà mã kỹ năng vẽ bằng tên skin 0 (`<tiền tố>_0_skill_...`). Mỗi skin thêm
`fx: {tên skin 0 (và các bản ~k trong sk-data): tên khung trong gói}`; skins2.js đổi tên lúc vẽ khi người chơi dùng skin đó. Chỉ lấy tên
skin 0 có thật trong data/sk-data.js (game có vẽ); sprite cùng tên với skin 0 nhưng khác ảnh (swordmaster_dash) cũng đổi.
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
import build_sk as B  # noqa: E402
import skrip  # noqa: E402
from pack import Packer  # noqa: E402
import UnityPy  # noqa: E402

GAME = os.path.dirname(TOOLS)
ART = os.path.join(GAME, 'art', 'skins')
DATA = os.path.join(GAME, 'data', 'skins')
LOC = os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json')


def shipped_frames():
    """Tên khung đang có trong data/sk-data.js (SK_ATLAS.f) -> {tên gốc không '~k': [mọi tên]}."""
    js = ("global.window={};require(%s);process.stdout.write(JSON.stringify(Object.keys(window.SK_ATLAS.f)))"
          % json.dumps(os.path.join(GAME, 'data', 'sk-data.js')))
    names = json.loads(subprocess.check_output(['node', '-e', js]))
    out = {}
    for n in names:
        out.setdefault(re.sub(r'~\d+$', '', n), []).append(n)
    return out


BASE_FRAME = re.compile(r'^.+_\d+_\d+$')   # khung idle/run/dead: <tiền tố>_<skin>_<số>


def extract_fx(folder, sk, shipped):
    """Skin <sk> của <folder> -> {tên skin 0 mà game vẽ: tên khung B.packer của skin này}."""
    n = int(sk[1:])
    rel = 'skin/character/%s/skin_%d.ab' % (folder, n)
    rel0 = 'skin/character/%s/skin_0.ab' % folder
    if rel not in B.rip.index['bundles'] or rel0 not in B.rip.index['bundles']:
        return {}
    sp, sp0 = B.bundle_sprites(rel), B.bundle_sprites(rel0)
    fx = {}
    for nm, (cab, obj) in sorted(sp.items()):
        if nm == 'biaoqing_11':
            continue
        m = re.match(r'^(.+)_%d_(skill_.+)$' % n, nm)
        if m:
            base = m.group(1) + '_0_' + m.group(2)
        elif nm in sp0 and not BASE_FRAME.match(nm):
            base = nm
        else:
            continue
        if base not in shipped:
            continue
        fn = B.frame_of(cab, obj)
        if not fn:
            continue
        if base == nm:   # cùng tên với skin 0: chỉ đổi khi ảnh khác
            f0 = B.frame_of(*sp0[nm])
            if f0 == fn:
                continue
        for alias in shipped[base]:
            fx[alias] = fn
    return fx


def extract_drawings(only):
    """character_drawing/<hero>/skin_<n>.ab (một Sprite mỗi bundle, tranh ở màn chọn nhân vật) ->
    art/lobby/portrait/<hero>_s<n>.png. -> {hero: [n có tranh]} (n >= 1; tranh skin 0 đã có ở <hero>.png)."""
    out_dir = os.path.join(GAME, 'art', 'lobby', 'portrait')
    root = os.path.join(skrip.AB86, 'character_drawing')
    got = {}
    for folder in sorted(os.listdir(root)):
        d = os.path.join(root, folder)
        if not os.path.isdir(d) or folder not in B.heroes:
            continue
        for fn in os.listdir(d):
            m = re.match(r'skin_(\d+)\.ab$', fn)
            if not m or m.group(1) == '0':
                continue
            n = int(m.group(1))
            dst = os.path.join(out_dir, '%s_s%d.png' % (folder, n))
            if not (only and folder not in only and os.path.exists(dst)):
                env = UnityPy.load(os.path.join(d, fn))
                sp = next((o.read() for o in env.objects if o.type.name == 'Sprite'), None)
                if sp is None:   # tranh động (nhiều phần / Spine): chưa dựng, màn chọn dùng tranh skin 0
                    continue
                sp.image.save(dst, optimize=True)
            got.setdefault(folder, []).append(n)
    return got


def main(only):
    loc = json.load(io.open(LOC, encoding='utf-8'))
    B.extract_heroes(want_skins=range(1, 200))
    os.makedirs(ART, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    total = 0
    shipped = shipped_frames()
    for folder in sorted(B.heroes):
        if only and folder not in only:
            continue
        skins = B.heroes[folder]
        pk, anims, ren = Packer(), {}, {}
        for sk, e in skins.items():
            if sk != 's0':
                fx = extract_fx(folder, sk, shipped)
                if fx:
                    e['fx'] = {}
                    for k, fn in fx.items():
                        if fn not in ren:
                            img, ax, ay = B.packer.frames[fn]
                            ren[fn] = pk.add('%s/%s' % (folder, fn), img, ax, ay)
                        e['fx'][k] = ren[fn]
            for kind in ('idle', 'run', 'dead'):
                key = e.get(kind)
                if not key:
                    continue
                a = dict(B.anims[key])
                fr = []
                for nm in a['f']:
                    if nm not in ren:
                        img, ax, ay = B.packer.frames[nm]
                        ren[nm] = pk.add('%s/%s' % (folder, nm), img, ax, ay)
                    fr.append(ren[nm])
                a['f'] = fr
                anims[key] = a
            for k in ('layers', 'ctrl'):
                e.pop(k, None)
        table, pages = pk.write(ART, prefix=folder, tmp=True)
        hv = hashlib.md5(b''.join(open(os.path.join(ART, p + '.tmp.png'), 'rb').read() for p in pages)).hexdigest()[:10]
        for fn in os.listdir(ART):
            if fn.startswith(folder) and fn[len(folder):-4].isdigit() and fn.endswith('.png') and fn not in pages:
                os.remove(os.path.join(ART, fn))
        for p in pages:
            os.replace(os.path.join(ART, p + '.tmp.png'), os.path.join(ART, p))
        idx = next(iter(skins.values()))['index']
        names = {sk: (loc.get('Character%d_name_skin%s' % (idx, sk[1:])) or ['', ''])[1] for sk in skins}
        pack = {'pages': ['art/skins/' + p for p in pages], 'v': hv, 'f': table, 'anims': anims, 'skins': skins,
                'names': names}
        with io.open(os.path.join(DATA, folder + '.js'), 'w', encoding='utf-8', newline='\n') as f:
            f.write('// SINH TỰ ĐỘNG bởi tools/skins/build_skins.py — không sửa tay.\n')
            f.write('(window.SK_PACKS = window.SK_PACKS || {})[%s] = ' % json.dumps(folder))
            f.write(json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + ';\n')
        total += len(skins)
        print(folder, 'skins', len(skins), 'frames', len(table), 'pages', len(pages),
              'không tên', [s for s, n in names.items() if not n], flush=True)
    drawings = extract_drawings(only)
    index = {}
    for folder in sorted(B.heroes):
        fn = os.path.join(DATA, folder + '.js')
        if not os.path.exists(fn):
            continue
        idx = next(iter(B.heroes[folder].values()))['index']
        keys = sorted(B.heroes[folder], key=lambda k: int(k[1:]))
        index[folder] = {'v': hashlib.md5(open(fn, 'rb').read()).hexdigest()[:10],
                         'skins': [[k, (loc.get('Character%d_name_skin%s' % (idx, k[1:])) or ['', ''])[1]] for k in keys],
                         'd': sorted(drawings.get(folder, []))}
    with io.open(os.path.join(DATA, 'index.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/skins/build_skins.py — không sửa tay.\n')
        f.write('window.SK_SKINS = ' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('tổng skin', total, 'index', len(index), 'hero')
    for line in B.log:
        print('!', line)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
