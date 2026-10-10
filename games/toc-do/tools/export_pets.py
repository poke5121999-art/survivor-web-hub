"""Xuất PET của bản gốc -> art/pets/pet_<id>.glb (mô hình tĩnh) + icon_<id>.webp + meta.json.

Dùng: ~/zingspeed-ref/venv/bin/python -I export_pets.py [id ...]   (mặc định mọi pet có mô hình trong APK)

APK chỉ chứa mô hình của 21 pet (assets/artwork/pet/main/pet_000NN/model/hpet_*.fbx), phần còn lại tải sau qua Puffer;
icon `uitextures/id_thing/id_petshape/icon/pet_N/001_splited.png` thì có cho ~200 pet.
Mô hình là mesh bám xương nhưng bản gốc không kèm hoạt ảnh (clip pet tải sau) -> xuất dáng gốc, JS tự nhấp nhô.
Mesh h<id>_<biến thể> có N submesh, vật liệu h<id>_<biến thể>_0k lấy _MainTex làm màu (shader gốc là QF Character Rim).
Mô hình chuẩn hoá: đáy y = 0, tâm x/z = 0, cao `H` m (meta.json ghi kích thước gốc), toạ độ đổi như README (z đảo).
Tái dùng Mat/Textures/MeshCache/GLB của export_track.py; cabmap lấy từ work/driver/cabmap.json (bản quét 13k bundle).
"""
import io, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import zs  # noqa: E402
import export_track as T  # noqa: E402

OUT = os.path.join(T.GAME, 'art', 'pets')
H = 1.0           # cạnh dài nhất của khối bao (JS nhân thêm theo từng pet)
# Pet có đạo cụ rời đi kèm (nĩa, bản đồ, xe đẩy): bỏ các mảnh rời để thân pet không bị co lại khi chuẩn hoá.
DROP_SMALL = {'00015', '00027', '00039', '00098'}
TEX_CAP = 256
ICON_CAP = 128


def use_cached_cabmap():
    p = os.path.join(zs.REF, 'work', 'driver', 'cabmap.json')
    if os.path.exists(p):
        cm = json.load(open(p))
        T.cab_map = lambda: {k: os.path.join(zs.IFS, v) for k, v in cm.items()}


def pets_in_apk():
    ids = set()
    for r in zs.index():
        for c in r['cont']:
            m = re.match(r'assets/artwork/pet/main/pet_(\d+)/model/', c)
            if m:
                ids.add(m[1])
    return sorted(ids)


def export_icon(pid):
    n = int(pid)
    rows = zs.find(f'id_petshape/icon/pet_{n:05d}/001_splited.png') or zs.find(f'id_petshape/icon/pet_{n}/001_splited.png')
    if not rows:
        return False
    env = T.load_with_deps([rows[0]['f']], 0)
    for k, o in env.container.items():
        if k.endswith(f'/pet_{n:05d}/001_splited.png') or k.endswith(f'/pet_{n}/001_splited.png'):
            im = o.read().image.convert('RGBA')
            im.thumbnail((ICON_CAP, ICON_CAP), Image.LANCZOS)
            im.save(os.path.join(OUT, f'icon_{pid}.webp'), 'WEBP', quality=85)
            return True
    return False


def keep_main(pos, subs):
    """Giữ mảnh liên thông lớn nhất và các mảnh có khối bao chạm khối bao của nó (nở 15%): mắt, tay, tai ở sát thân;
    nĩa, bản đồ, bánh, xe đẩy nằm rời ra ngoài."""
    par = list(range(len(pos)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for tri in subs:
        for a, b, c in tri:
            par[find(a)] = find(b)
            par[find(b)] = find(c)
    roots = np.array([find(i) for i in range(len(pos))])
    cnt = {}
    for tri in subs:
        for a in tri[:, 0]:
            cnt[roots[a]] = cnt.get(roots[a], 0) + 1
    main = max(cnt, key=cnt.get)
    lo, hi = pos[roots == main].min(0), pos[roots == main].max(0)
    pad = (hi - lo) * 0.15
    keep = {r for r in cnt if (pos[roots == r].max(0) >= lo - pad).all() and (pos[roots == r].min(0) <= hi + pad).all()}
    return [tri[[roots[t[0]] in keep for t in tri]] if len(tri) else tri for tri in subs]


def export_pet(pid, cache):
    rows = [r for r in zs.index() if any(f'artwork/pet/main/pet_{pid}/' in c for c in r['cont'])]
    env = T.load_with_deps(sorted({r['f'] for r in rows}), 2)
    meshes = {k.rsplit('/', 1)[1][:-4].lower(): o for k, o in env.container.items() if f'/pet_{pid}/model/' in k}
    mats = {k.rsplit('/', 1)[1][:-4].lower(): o for k, o in env.container.items() if f'/pet_{pid}/material/' in k}
    name = next((n for n in sorted(meshes) if n.startswith('hpet_')), None) or next(iter(sorted(meshes)), None)
    if not name:
        return None
    mc = cache['mesh']
    m = mc.get(meshes[name].read())
    subs = m['subs']
    if pid in DROP_SMALL:
        subs = keep_main(m['pos'], subs)
    used = np.unique(np.concatenate([t.reshape(-1) for t in subs]))
    # Mô hình gốc nhìn về -z sau khi đổi toạ độ; xoay nửa vòng quanh y để mặt về +z như xe (JS khỏi xoay).
    pos = m['pos'] * np.array([-1, 1, 1])
    lo, hi = pos[used].min(0), pos[used].max(0)
    sc = H / max(hi - lo)
    pos = (pos - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])) * sc
    nrm = m['nrm'] * np.array([-1, 1, 1]) if m['nrm'] is not None else None
    g = T.GLB()
    prims = []
    for i, tri in enumerate(subs):
        if not len(tri):
            continue
        mat = mats.get(f'{name}_{i + 1:02d}')
        mj = {'pbrMetallicRoughness': {'metallicFactor': 0.05, 'roughnessFactor': 0.7}, 'doubleSided': True}
        if mat:
            mt = T.Mat(mat.read())
            slot = '_MainTex' if '_MainTex' in mt.tex else mt.albedo_slot
            if slot:
                ti = cache['tex'].get(mt, slot, TEX_CAP, False)
                if ti is not None:
                    gi = cache['glb_tex'].setdefault((id(g), ti), g.image(cache['tex'].images[ti]['data']))
                    mj['pbrMetallicRoughness']['baseColorTexture'] = {'index': gi}
        g.j['materials'].append(mj)
        t = tri.astype(np.uint32).reshape(-1)   # x và z cùng đảo (xoay) nên thứ tự đỉnh giữ nguyên, khác README
        a = {'POSITION': g.acc(pos.astype(np.float32), 'VEC3', 34962, True)}
        if nrm is not None:
            a['NORMAL'] = g.acc(nrm.astype(np.float32), 'VEC3', 34962)
        if m['uv0'] is not None:
            uv = m['uv0'].astype(np.float32).copy()
            uv[:, 1] = 1 - uv[:, 1]
            a['TEXCOORD_0'] = g.acc(uv, 'VEC2', 34962)
        prims.append({'attributes': a, 'indices': g.acc(t.reshape(-1, 1), 'SCALAR', 34963), 'material': len(g.j['materials']) - 1})
    g.j['meshes'].append({'primitives': prims})
    g.j['nodes'].append({'mesh': 0})
    g.j['scenes'][0]['nodes'] = [0]
    g.write(os.path.join(OUT, f'pet_{pid}.glb'))
    return {'src': name, 'size': [round(float(v), 3) for v in (hi - lo)], 'tris': int(sum(len(t) for t in subs))}


def main():
    os.makedirs(OUT, exist_ok=True)
    use_cached_cabmap()
    ids = sys.argv[1:] or pets_in_apk()
    meta = json.load(open(os.path.join(OUT, 'meta.json'))) if os.path.exists(os.path.join(OUT, 'meta.json')) else {}
    for pid in ids:
        cache = {'mesh': T.MeshCache(), 'tex': T.Textures(), 'glb_tex': {}}
        try:
            r = export_pet(pid, cache)
        except Exception as e:
            T.log(f'pet_{pid}: lỗi {e!r}')
            continue
        if r:
            r['icon'] = export_icon(pid)
            meta[pid] = r
            T.log(f'pet_{pid}', r)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
