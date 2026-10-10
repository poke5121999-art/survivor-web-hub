"""Thời Trang: bộ đồ tay đua từ APK -> art/outfits/<id>.glb, <id>_hair.glb, <id>.webp, <id>_hair.webp.

Run: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_outfits.py [--no-thumbs] [--thumbs-only] [id ...]

Một bộ trong APK = các phần cùng mã ở avatar/character/<g>/{01hair,03top,04bottom,05shoe}/h<phần>_<mã>.prefab, ráp trên
khung hm/hfcharacterroot như tay đua mặc định. Dựng glb bằng chính hàm của tools/export_driver.py (chỉ gọi, không sửa) nên
tên xương và hoạt ảnh F_AvatarAnimator giống hệt art/drivers/<nam|nu>.glb: js/view/karts.js trộn hoạt ảnh lái như cũ.
- <id>.glb: tóc + mặt 00001 + áo + quần + giày + 40 clip lái; ảnh PNG đổi sang WebP (EXT_texture_webp), nén meshopt.
- <id>_hair.glb: chỉ tóc, không hoạt ảnh (thay tóc trên tay đua đang mặc bộ khác, js/ui/fashion.js).
- <id>.webp / <id>_hair.webp: ảnh thẻ cửa hàng, chụp glb bằng Chromium (swiftshader) ở tư thế bục ranking_05.
  APK chỉ có biểu tượng thẻ (uitextures/id_thing/id_avatar) cho vài mã, không khớp mã mô hình, nên tự chụp.
Không có bảng tên món đồ trong APK (tên nằm trên máy chủ): tên trong TD.OUTFITS (js/ui/fashion.js) là tên chọn.
"""
import sys, os, io, json, struct, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import export_driver as ed
from PIL import Image

GAME = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(GAME))
OUT = os.path.join(GAME, 'art', 'outfits')
WORK = os.path.join(ed.zs.REF, 'work', 'outfits')
PW = os.environ.get('PLAYWRIGHT_PATH', os.path.expanduser('~/.cache/pw-node/node_modules/playwright-core'))

# id -> (giới tính, mã bộ). Chọn 8 bộ mỗi giới trong 22 bộ đủ bốn phần, khác màu/dáng nhau. Bỏ: 00934 nam (mesh không có
# trọng số xương, export_driver.py không đọc được), 02571 (shader mới để màu ở _MainMap, export_driver chỉ đọc _MainTex
# nên ra trắng), 00779 nữ (áo/quần không có ảnh màu).
SETS = {
    'm00013': ('male', '00013'), 'm00166': ('male', '00166'), 'm00617': ('male', '00617'), 'm00618': ('male', '00618'),
    'm00775': ('male', '00775'), 'm01155': ('male', '01155'), 'm01889': ('male', '01889'), 'm00032': ('male', '00032'),
    'f00013': ('female', '00013'), 'f00166': ('female', '00166'), 'f00617': ('female', '00617'), 'f00618': ('female', '00618'),
    'f00775': ('female', '00775'), 'f01155': ('female', '01155'), 'f01889': ('female', '01889'), 'f00032': ('female', '00032'),
}
# Bộ Tân Thủ 00500 = tay đua mặc định (art/drivers): chỉ xuất tóc (đổi tóc về như cũ) và ảnh thẻ chụp từ glb tay đua.
BASE = {'m00500': ('male', '00500'), 'f00500': ('female', '00500')}
ROOT = {'male': 'hmcharacterroot', 'female': 'hfcharacterroot'}
SEX = {'male': 'nam', 'female': 'nu'}
WEBP_Q = 86


def parts_of(sid, hair_only=False):
    if hair_only:
        return ['01hair/hhair_' + sid]
    return ['01hair/hhair_' + sid, '02face/hface_00001', '03top/htop_' + sid, '04bottom/hbottom_' + sid, '05shoe/hshoe_' + sid]


# ---------- glb: đọc, đổi ảnh sang WebP, bỏ hoạt ảnh, gom lại buffer ----------
def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    p = 20 + jl
    bl = struct.unpack_from('<I', b, p)[0]
    return j, b[p + 8:p + 8 + bl]


def repack(path, strip_anims):
    j, bin_ = read_glb(path)
    if strip_anims:
        j.pop('animations', None)
    views = {}   # bufferView cũ -> bytes mới

    def view_bytes(i):
        v = j['bufferViews'][i]
        o = v.get('byteOffset', 0)
        return bin_[o:o + v['byteLength']]
    for im in j.get('images', []):
        pil = Image.open(io.BytesIO(view_bytes(im['bufferView'])))
        out = io.BytesIO()
        pil.save(out, 'WEBP', quality=WEBP_Q, method=6)
        views[im['bufferView']] = out.getvalue()
        im['mimeType'] = 'image/webp'
    for t in j.get('textures', []):
        t['extensions'] = {'EXT_texture_webp': {'source': t.pop('source')}}
    for k in ('extensionsUsed', 'extensionsRequired'):
        j[k] = sorted(set(j.get(k, [])) | {'EXT_texture_webp'})
    # bufferView còn dùng: accessor của mesh/skin/hoạt ảnh + ảnh
    acc = set()
    for m in j.get('meshes', []):
        for pr in m['primitives']:
            acc |= set(pr['attributes'].values())
            if 'indices' in pr:
                acc.add(pr['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            acc.add(s['inverseBindMatrices'])
    for a in j.get('animations', []):
        for s in a['samplers']:
            acc |= {s['input'], s['output']}
    acc = sorted(acc)
    used = sorted({j['accessors'][i]['bufferView'] for i in acc} | {im['bufferView'] for im in j.get('images', [])})
    vmap, out_bin, out_views = {}, bytearray(), []
    for i in used:
        data = views.get(i, view_bytes(i))
        out_bin += b'\0' * (-len(out_bin) % 4)
        v = dict(j['bufferViews'][i])
        v['byteOffset'] = len(out_bin)
        v['byteLength'] = len(data)
        out_bin += data
        vmap[i] = len(out_views)
        out_views.append(v)
    amap = {a: n for n, a in enumerate(acc)}
    accessors = []
    for a in acc:
        x = dict(j['accessors'][a])
        x['bufferView'] = vmap[x['bufferView']]
        accessors.append(x)
    for m in j.get('meshes', []):
        for pr in m['primitives']:
            pr['attributes'] = {k: amap[v] for k, v in pr['attributes'].items()}
            if 'indices' in pr:
                pr['indices'] = amap[pr['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
    for a in j.get('animations', []):
        for s in a['samplers']:
            s['input'], s['output'] = amap[s['input']], amap[s['output']]
    for im in j.get('images', []):
        im['bufferView'] = vmap[im['bufferView']]
    j['accessors'], j['bufferViews'] = accessors, out_views
    out_bin += b'\0' * (-len(out_bin) % 4)
    j['buffers'] = [dict(byteLength=len(out_bin))]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_bin)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out_bin), 0x004E4942)); f.write(out_bin)


def meshopt(path):
    """Nén hình + hoạt ảnh (gltf-transform, như export_cars.py). Lỗi thì giữ glb chưa nén."""
    tmp = path[:-4] + '.mo.glb'
    r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'meshopt', path, tmp], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(tmp):
        os.replace(tmp, path)
    else:
        print('  meshopt lỗi, giữ glb thường:', r.stderr[-300:])


def export_one(oid, cm, root_env, ctrl):
    g, sid = ALL[oid]
    os.makedirs(WORK, exist_ok=True)
    ed.OUT_ART = WORK   # export_driver ghi <id>.glb vào OUT_ART
    for suffix, hair in (('', False), ('_hair', True)):
        if oid in BASE and not hair:
            continue
        d = dict(id=oid + suffix, g=g, root=ROOT[g], parts=parts_of(sid, hair))
        ed.export_driver(d, cm, root_env, ctrl)
        dst = os.path.join(OUT, oid + suffix + '.glb')
        shutil.copyfile(os.path.join(WORK, oid + suffix + '.glb'), dst)
        repack(dst, strip_anims=hair)
        meshopt(dst)
        print(f'{dst}: {os.path.getsize(dst) / 1e6:.2f} MB')


# ---------- ảnh thẻ: Chromium chụp glb ở tư thế ranking_05 (art/podium/rank_<g>.glb), nền trong ----------
THUMB_HTML = r'''<!doctype html><html><body style="margin:0;background:transparent">
<script src="/games/toc-do/vendor/three-r140.min.js"></script>
<script src="/games/toc-do/vendor/GLTFLoader-r140.js"></script>
<script src="/games/toc-do/vendor/meshopt_decoder.js"></script>
<script>
// Thẻ bộ 200×300 (cả người), thẻ tóc 200×200 (đầu). Kết quả: dataURL PNG trong window.OUT[id].
const LIST = JSON.parse(decodeURIComponent(location.hash.slice(1)));
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.outputEncoding = THREE.sRGBEncoding; r.setClearColor(0, 0);
document.body.appendChild(r.domElement);
const ld = new THREE.GLTFLoader(); ld.setMeshoptDecoder(window.MeshoptDecoder);
const load = (u) => new Promise((ok, no) => ld.load(u, ok, null, no));
window.OUT = {};
(async () => {
  const anim = {};
  for (const g of ['nam', 'nu']) anim[g] = (await load('/games/toc-do/art/podium/rank_' + g + '.glb')).animations.find((a) => a.name === 'ranking_05');
  for (const it of LIST) {
    const gl = await load(it.glb + '?' + Date.now());
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(1, 3, -3); sc.add(sun);
    sc.add(gl.scene);
    // Hình nén lượng tử (KHR_mesh_quantization) có hình cầu bao quanh gốc toạ độ: chụp cận đầu thì bị loại khỏi khung nhìn.
    gl.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const mx = new THREE.AnimationMixer(gl.scene);
    mx.clipAction(anim[it.g]).play(); mx.setTime(0.5);
    gl.scene.updateMatrixWorld(true);
    // Khung theo xương (Box3 của three không tính skin): cả người cao h, tóc lấy quanh xương đầu.
    const bb = new THREE.Box3(), p = new THREE.Vector3(), head = new THREE.Vector3();
    gl.scene.traverse((o) => { if (o.isBone) bb.expandByPoint(o.getWorldPosition(p)); });
    gl.scene.getObjectByName('Bip_Head').getWorldPosition(head);
    const c = bb.getCenter(new THREE.Vector3()), h = bb.max.y - bb.min.y + 0.25;
    const k = 2 * Math.tan(11 * Math.PI / 180);
    for (const [key, w, ht, at, span] of [[it.id, 200, 300, new THREE.Vector3(c.x, c.y + 0.06, c.z), h * 1.12], [it.id + '_hair', 200, 200, new THREE.Vector3(head.x, head.y + 0.1, head.z), 0.5]]) {
      r.setSize(w, ht);
      const cam = new THREE.PerspectiveCamera(22, w / ht, 0.05, 500);
      cam.position.set(at.x, at.y + span * 0.04, at.z - span / k); cam.lookAt(at);
      r.render(sc, cam);
      window.OUT[key] = r.domElement.toDataURL('image/png');
    }
  }
  document.title = 'done';
})().catch((e) => { document.title = 'err ' + e; });
</script></body></html>'''

THUMB_JS = r'''
const http = require('http'), fs = require('fs'), path = require('path');
const [PW, REPO, HTML, LIST, OUTDIR] = process.argv.slice(2);
const { chromium } = require(PW);
const html = fs.readFileSync(HTML);
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/thumbs.html') { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end(html); }
  const f = path.join(REPO, u);
  if (!f.startsWith(REPO)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(b); });
}).listen(0, '127.0.0.1', async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const p = await br.newPage();
    await p.goto('http://127.0.0.1:' + srv.address().port + '/thumbs.html#' + encodeURIComponent(LIST));
    await p.waitForFunction(() => document.title, null, { timeout: 600000 });
    const t = await p.title();
    if (t !== 'done') throw new Error(t);
    const out = await p.evaluate(() => window.OUT);
    for (const k of Object.keys(out)) fs.writeFileSync(path.join(OUTDIR, k + '.png'), Buffer.from(out[k].split(',')[1], 'base64'));
  } finally { await br.close(); srv.close(); }
});
'''


def thumbs(ids):
    os.makedirs(WORK, exist_ok=True)
    html, js = os.path.join(WORK, 'thumbs.html'), os.path.join(WORK, 'thumbs.js')
    open(html, 'w').write(THUMB_HTML)
    open(js, 'w').write(THUMB_JS)
    glb = lambda i: '/games/toc-do/art/' + ('drivers/' + SEX[ALL[i][0]] if i in BASE else 'outfits/' + i) + '.glb'
    lst = json.dumps([dict(id=i, g=SEX[ALL[i][0]], glb=glb(i)) for i in ids])
    subprocess.run(['node', js, PW, REPO, html, lst, WORK], check=True)
    for i in ids:
        for k in (i, i + '_hair'):
            im = Image.open(os.path.join(WORK, k + '.png')).convert('RGBA')
            box = im.getbbox()
            if box and k == i:   # cả người: cắt sát theo chiều cao, giữ khung 2:3
                im = im.crop((0, max(0, box[1] - 6), im.width, min(im.height, box[3] + 6)))
            im.save(os.path.join(OUT, k + '.webp'), 'WEBP', quality=88, method=6)
        print('ảnh thẻ', i)


def bar_icon():
    """Biểu tượng thanh dưới: sprite Icon_Cloth trong atlas og_lobby (đọc UIAtlas như export_lobby_ui.load_sprites)."""
    import ui_rip
    rip = ui_rip.Rip()
    atlas = 'assets/resforassetbundles/ui/#lobbyhome/artwork/atlas/og_lobby/og_lobby.prefab'
    for rel in sorted({r['f'] for r in ed.zs.index() if atlas in r['cont']}):
        for cab in rip.load(rel):
            for o in list(rip.files[cab].objects.values()):
                if o.type.name != 'MonoBehaviour':
                    continue
                try:
                    t = rip.tree(cab, o)
                except Exception:
                    continue
                sp = {s['name']: s for s in t.get('mSprites') or []}.get('Icon_Cloth')
                if not sp:
                    continue
                mat = rip.resolve(t.get('material'), cab)
                for name, envt in rip.tree(*mat)['m_SavedProperties']['m_TexEnvs']:
                    if name == '_MainTex':
                        img = rip._texture(envt['m_Texture'], mat[0]).convert('RGBA')
                        img = img.crop((sp['x'], sp['y'], sp['x'] + sp['width'], sp['y'] + sp['height']))
                        img.save(os.path.join(OUT, 'icon.webp'), 'WEBP', lossless=True)
                        print('icon.webp', img.size)
                        return
    raise SystemExit('sprite not found: Icon_Cloth')


ALL = dict(BASE, **SETS)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    ids = args or list(ALL)
    bad = [i for i in ids if i not in ALL]
    if bad:
        raise SystemExit('outfit id not in SETS/BASE: ' + ', '.join(bad))
    os.makedirs(OUT, exist_ok=True)
    if '--thumbs-only' not in sys.argv:
        cm = ed.cab_map()
        root_cont = 'assets/resforassetbundles/avatar/character/female/00root/f_avataranimator.controller'
        root_env = ed.load([ed.bundle_of(root_cont)], cm, depth=1)
        ctrl = ed.container_obj(root_env, root_cont)
        for oid in ids:
            export_one(oid, cm, root_env, ctrl)
        bar_icon()
    if '--no-thumbs' not in sys.argv:
        thumbs(ids)


if __name__ == '__main__':
    main()
