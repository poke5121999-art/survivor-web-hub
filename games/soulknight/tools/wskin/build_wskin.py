#!/usr/bin/env python
"""Skin vũ khí khởi đầu của Soul Knight 8.6 -> data/sk-wskin.js + tools/extra/wskin.json.

Nguồn [CFG weapons.json]: prefab `weapon_init_<hero>xx[N]` (369 prefab, OriginalWeapon = `weapon_init_<hero>x`); tên [LOC weapon/<khoá>].
Mỗi skin giữ cây hình của prefab skin; so với cây hình vũ khí khởi đầu của web (data/sk-weapons86.js) theo (tên nút, thứ tự lần xuất hiện):
  ov  = [[chỉ số nút gốc, {f, c, o, fx, fy}]]   chỉ các trường khác bản gốc (chỉ đổi hình: không đổi T, gun_point, dis, off)
  add = nút thêm của skin không có ở bản gốc (img, ui, l, r...) gắn vào nút gốc tương ứng
Skin trùng tên với vũ khí gốc (ngoại hình gốc của bản x) bỏ đi: game gốc ghi "Ngoại Hình Gốc" [LOC ui/weapon_skin_original].
Chạy:  cd games/soulknight/tools && ~/sk86-ref/venv/bin/python wskin/build_wskin.py
Rồi dựng atlas:  flock <khoá> ~/sk86-ref/venv/bin/python build_sk.py
Chạy lần đầu với WSKIN_NOPRUNE=1 (chưa có hình trong atlas), dựng atlas, rồi chạy lại không biến để bỏ skin thiếu hình.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'weapons86'))
sys.path.insert(0, os.path.join(TOOLS, 'vfx'))
import build_w86 as M  # noqa: E402

OUT_JS = os.path.join(GAME, 'data', 'sk-wskin.js')
OUT_EXTRA = os.path.join(TOOLS, 'extra', 'wskin.json')
SKIP_NODES = {'gun_point'}


def load_w86():
    s = io.open(os.path.join(GAME, 'data', 'sk-weapons86.js'), encoding='utf-8').read()
    return json.loads(s[s.index('window.SK_W86=') + len('window.SK_W86='):].rstrip().rstrip(';'))


def occ_index(rig):
    """[(tên, lần thứ k)] của từng nút (bỏ gốc)."""
    seen, out = {}, {}
    for i, n in enumerate(rig):
        if i == 0:
            continue
        k = seen.get(n['n'], 0)
        seen[n['n']] = k + 1
        out[(n['n'], k)] = i
    return out


def diff_rig(base, skin):
    bi, si = occ_index(base), occ_index(skin)
    s2b = {}
    ov = []
    for key, j in si.items():
        i = bi.get(key)
        if i is None:
            continue
        s2b[j] = i
        if key[0] in SKIP_NODES:
            continue
        b, s = base[i], skin[j]
        d = {}
        if s.get('f') and s['f'] != 'nothing' and s['f'] != b.get('f') and b.get('f') not in (None, 'nothing'):
            d['f'] = s['f']
        for k in ('c', 'o', 'fx', 'fy'):
            if 'f' in d and s.get(k) != b.get(k):
                d[k] = s.get(k, 0 if k != 'c' else [1, 1, 1, 1])
        if d:
            ov.append([i, d])
    # nút thêm: có sprite (hoặc là tổ tiên của nút có sprite) mà bản gốc không có
    need = set()
    for j, n in enumerate(skin):
        if j and j not in s2b and n.get('f') and n['f'] != 'nothing' and n['n'] not in SKIP_NODES:
            while j > 0 and j not in need and j not in s2b:
                need.add(j)
                j = skin[j]['p']
    add, new_idx = [], {}
    for j in sorted(need):
        n = skin[j]
        p = skin[j]['p']
        par = s2b.get(p, new_idx.get(p, 0))
        e = {'n': n['n'], 'p': par}
        for k in ('T', 'f', 'o', 'c', 'fx', 'fy', 'dis', 'off'):
            if k in n:
                e[k] = n[k]
        new_idx[j] = len(base) + len(add)
        add.append(e)
    return ov, add, {**s2b, **new_idx}


def clip_remap(base_ctl, skin_ctl, node_map, skin_rig):
    """Đường sprite (k='spr') của clip skin -> [[chỉ số clip, nút gốc, [[t, hình]]]] đè đường cùng nút của clip gốc cùng thứ tự.
    Thời gian co giãn theo độ dài clip gốc / clip skin. Clip gốc có đường sprite ở nút mà clip skin không có thì nút giữ hình tĩnh của skin
    (không có thì ẩn), không để hình gốc lọt qua."""
    out = []
    if not base_ctl or not skin_ctl or len(base_ctl['clips']) != len(skin_ctl['clips']):
        return out, ['số clip khác nhau' if base_ctl and skin_ctl else 'thiếu bộ điều khiển']
    b2s = {b: sj for sj, b in node_map.items()}
    for k, (bc, sc) in enumerate(zip(base_ctl['clips'], skin_ctl['clips'])):
        k_t = (bc['len'] / sc['len']) if sc['len'] and bc['len'] else 1
        done = set()
        for cv in sc['curves']:
            if cv['k'] != 'spr':
                continue
            i = node_map.get(cv['n'])
            if i is None:
                continue
            out.append([k, i, [[round(t * k_t, 4), f or 'nothing'] for t, f in cv['s']]])
            done.add(i)
        for cv in bc['curves']:
            if cv['k'] == 'spr' and cv['n'] not in done:
                sj = b2s.get(cv['n'])
                f = skin_rig[sj].get('f') if sj is not None else None
                out.append([k, cv['n'], [[0, f or 'nothing']]])
    return out, []


def main():
    W = M.J('config', 'weapons.json')
    LOC = M.J('localization_en_vi.json')
    X = load_w86()
    heroes = X['heroes']
    B = M.B86()
    skins, sprites, notes = [], set(), []
    bcache = {}

    def base_ctl(B, pf):
        if pf not in bcache:
            bcache[pf] = M.weapon_rig(B, *B.root(pf, 'weapon'))[1]
        return bcache[pf]
    nm_en = lambda k: (LOC.get('weapon/' + k) or ['', ''])
    for h, pf in heroes.items():
        base = X['weapons'].get(pf)
        if not base:
            continue
        keys = [k for k in W if re.match(r'weapon_init_%sxx\d*$' % re.escape(h), k)]
        keys.sort(key=lambda k: int(re.search(r'xx(\d*)$', k).group(1) or 1))
        for k in keys:
            en, vi = nm_en(k)
            if en and en == nm_en(pf)[0]:
                continue
            if not en:   # 15 prefab không có tên trong LOC: đặt "<tên vũ khí gốc> <số>" [ƯỚC LƯỢNG tên]
                n = re.search(r'xx(\d*)$', k).group(1) or '1'
                en, vi = '%s #%s' % (nm_en(pf)[0], n), '%s #%s' % (nm_en(pf)[1], n)
            rg = B.root(k, 'weapon')
            if not rg:
                print('thiếu prefab', k)
                continue
            rig, sctl = M.weapon_rig(B, *rg)
            ov, add, nmap = diff_rig(base['rig'], rig)
            bctl = base_ctl(B, pf)
            cvs, why = clip_remap(bctl, sctl, nmap, rig)
            if why:
                notes.append(k + ': ' + why[0])
            fs = {d['f'] for _, d in ov if 'f' in d} | {a['f'] for a in add if a.get('f')} | {f for _, _, sq in cvs for _, f in sq if f}
            fs -= {'nothing'}
            if not fs:
                print('không có hình khác bản gốc', k)
                continue
            sprites |= fs
            e = {'id': k, 'hero': h, 'base': pf, 'en': en, 'vi': vi or en, 'ov': ov}
            if cvs:
                e['cv'] = cvs
            if add:
                e['add'] = add
            skins.append(e)
    # Lần chạy sau khi atlas đã dựng: bỏ skin có hình không nằm trong atlas (paladinxx3 cần weapons5_38 ở bundle không có trong bản cài).
    atlas = io.open(os.path.join(GAME, 'data', 'sk-data.js'), encoding='utf-8').read() if os.path.exists(os.path.join(GAME, 'data', 'sk-data.js')) else ''
    if atlas and not os.environ.get('WSKIN_NOPRUNE'):
        keep = []
        for e in skins:
            names = {d['f'] for _, d in e['ov'] if 'f' in d} | {a['f'] for a in e.get('add', []) if a.get('f') and a['f'] != 'nothing'} | {f for _, _, sq in e.get('cv', []) for _, f in sq if f and f != 'nothing'}
            miss = [n for n in names if '"%s":' % n not in atlas]
            if miss:
                print('bỏ skin thiếu hình trong atlas', e['id'], miss)
            else:
                keep.append(e)
        skins = keep
    out = {'v': 1, 'skins': skins}
    with io.open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// SINH TỰ ĐỘNG bởi tools/wskin/build_wskin.py từ Soul Knight 8.6 [CFG weapons.json weapon_init_*xx*, LOC weapon/*] — không sửa tay.\n')
        f.write('window.SK_WSKIN=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    pat = '^(' + '|'.join(sorted(re.escape(s) for s in sprites)) + ')$'
    with io.open(OUT_EXTRA, 'w', encoding='utf-8') as f:
        json.dump({'bundles': ['weapon', 'sprite_atlas', 'common'], 'sprites': [pat]}, f, ensure_ascii=False, indent=1)
    import collections
    cnt = collections.Counter((re.match(r'weapon_init_(.+?)xx', n).group(1), n.split(': ', 1)[1]) for n in notes)
    for (h, why), c in sorted(cnt.items()):
        print('ghi chú clip: %s %d skin: %s' % (h, c, why))
    print('skin: %d (%d hero), sprite: %d' % (len(skins), len({s['hero'] for s in skins}), len(sprites)))


if __name__ == '__main__':
    main()
