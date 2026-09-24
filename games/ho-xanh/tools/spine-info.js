// Đọc từng .skel trong data/assets.js bằng chính runtime Spine của game, ghi thêm
// tên animation + thời lượng + khung bao vào manifest. rip.py gọi tệp này ở cuối.
//   node games/ho-xanh/tools/spine-info.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.dirname(__dirname);
// Runtime là bản spine-threejs nên nạp kèm three thật (bản UMD chạy được trong Node).
const THREE = require(path.join(__dirname, '../vendor/three-r140.min.js'));
const ctx = { console, Float32Array, Int16Array, Uint16Array, Uint8Array, Math, Map, Set, window: { THREE }, require: n => (n === 'three' ? THREE : undefined) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAME, 'vendor/spine-threejs-4.0.31.min.js'), 'utf8') + ';this.spine=spine;', ctx);
const spine = ctx.spine;
const manPath = path.join(GAME, 'data/assets.js');
const src = fs.readFileSync(manPath, 'utf8');
const head = src.slice(0, src.indexOf('=') + 1);
const man = JSON.parse(src.slice(src.indexOf('=') + 1).trim().replace(/;$/, ''));

function info(entry) {
  const atlas = new spine.TextureAtlas(fs.readFileSync(path.join(GAME, 'art', entry.atlas), 'utf8'));
  for (const page of atlas.pages) page.setTexture({ setFilters() {}, setWraps() {}, getImage: () => ({ width: page.width, height: page.height }) });
  const bin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
  const data = bin.readSkeletonData(new Uint8Array(fs.readFileSync(path.join(GAME, 'art', entry.skel))));
  const sk = new spine.Skeleton(data);
  sk.setToSetupPose(); sk.updateWorldTransform();
  const off = new spine.Vector2(), size = new spine.Vector2();
  sk.getBounds(off, size, []);
  entry.anims = Object.fromEntries(data.animations.map(a => [a.name, +a.duration.toFixed(3)]));
  entry.skins = data.skins.map(s => s.name);
  entry.bounds = [Math.round(off.x), Math.round(off.y), Math.round(size.x), Math.round(size.y)];
}
let n = 0;
for (const f of man.fish || []) { info(f); n++; }
for (const k of Object.keys(man.spineEnv || {})) { info(man.spineEnv[k]); n++; }
fs.writeFileSync(manPath, head + ' ' + JSON.stringify(man, null, 1) + ';\n');
console.log('spine-info: ' + n + ' bộ skel');
