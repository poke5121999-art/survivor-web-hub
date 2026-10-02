/*
 * BIỆT ĐỘI LẶN — bộ kiểm quỹ tiền, cỡ đồ cổ, vai cá.
 *
 * Chạy:  node test/biet-doi-lan-economy.js       (MAPS=0,2 để chạy bớt)
 * Kiểm trên cả 5 map, 1280×720:
 *  - tổng tiền kiếm được (đồ cổ + cá bán được + xác quái tối đa 3 lần mỗi loài) không quá 3 × chỉ tiêu, và không hụt dưới 2,7 ×;
 *  - không còn cá ngựa / tôm; map nào cũng có cá lớn hoặc sứa để săn; cá cảnh không trúng xiên;
 *  - đồ cổ vẽ to 1,5–2 lần thân Dave (1,2 m), xác thuyền ít nhất 2 lần; món nào cũng có viền sáng.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const MAPS = (process.env.MAPS || '0,1,2,3,4').split(',').map(Number);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve(), base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle'] });
  for (const m of MAPS) {
    const tag = 'map ' + m;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', q => { if (q.type() === 'error') errors.push('console: ' + q.text()); });
    await page.goto(base + '/games/biet-doi-lan/index.html?map=' + m);
    await page.waitForFunction(() => window.HX && HX.game && HX.game.phase === 'dive' && HX.game.loot && BDL.run.dive && BDL.run.dive.rate, null, { timeout: 90000 });
    await sleep(500);
    const r = await page.evaluate(() => {
      const G = HX.game, d = BDL.run.dive;
      let fish = 0;
      const species = [], hunt = [];
      G.fishes.allocs.forEach(a => {
        species.push(a.sp.id);
        const role = BDL.fishRole(a.sp);
        if (role === 'decor') return;
        fish += a.left * BDL.run.price('fish', BDL.fishRaw(a.sp));
        if (role === 'drag' || /Jelly/i.test(a.sp.id)) hunt.push(a.sp.id);
      });
      const loot = G.loot.reduce((s, l) => s + l.value, 0);
      const R = BDL.foeRoster(G.map);
      const foe = R.kinds.filter(k => !k.noCorpse && !k.pack)
        .reduce((s, k) => s + BDL.SELL_CAP * BDL.run.price('foe', BDL.foeValue(Math.max(1, Math.round(k.hp * R.hpMul)), Math.round(k.dmg * R.dmgMul * 10) / 10)), 0);
      const sizes = G.loot.map(l => ({ key: l.key, wreck: !!l.row.wreck, len: Math.max(l.w, l.h), glow: !!l.glow && l.mesh.children.indexOf(l.glow) >= 0 }));
      // cá cảnh thật từ allocator: đánh không mất máu, không trúng
      const free = q => BDL.fishRole(q.sp) === 'decor' && q.left > 0 && !q.fish.length;
      const a = G.fishes.allocs.find(q => free(q) && q.sp.aggressive) || G.fishes.allocs.find(free);
      let decor = null;
      if (a) {
        G.fishes.wake(a);
        const f = a.fish[0], hp = f.hp, c = f.center();
        decor = { id: f.id, sp: f.sp.id, aggressive: !!f.sp.aggressive, flag: f.decor, hit: f.hitTest(c.x, c.y, 0.2), res: f.damage(999, c.x, c.y, true), hpSame: f.hp === hp };
        f.pos.x = G.diver.pos.x + 1; f.pos.y = G.diver.pos.y;
      }
      return { quota: d.quota, pool: d.pool, loot, fish, foe, species, hunt, sizes, decor };
    });
    await sleep(1500);
    const near = r.decor && await page.evaluate(fid => { const f = HX.game.fishes.list.find(q => q.id === fid); return f ? f.state : 'mất'; }, r.decor.id);
    const total = r.loot + r.fish + r.foe, x = total / r.quota;
    check(tag + ': tổng tiền kiếm được ≤ 3 × chỉ tiêu', total <= 3 * r.quota,
      `đồ cổ ${r.loot} + cá ${r.fish} + xác quái ${r.foe} = ${total}, chỉ tiêu ${r.quota}, gấp ${x.toFixed(3)}`);
    check(tag + ': tổng tiền không hụt dưới 2,7 × chỉ tiêu', x >= 2.7, x.toFixed(3));
    const gone = r.species.filter(s => s === 'Seahorse' || s === 'Whiteleg_Shrimp');
    check(tag + ': không còn cá ngựa, tôm', gone.length === 0, gone.join(','));
    check(tag + ': có ít nhất 3 ổ cá lớn hoặc sứa để săn', r.hunt.length >= 3, r.hunt.length + ' ổ: ' + [...new Set(r.hunt)].join(','));
    check(tag + ': cá cảnh không trúng, đánh không mất máu', !!r.decor && r.decor.flag === true && r.decor.hit === false && r.decor.res === 'alive' && r.decor.hpSame,
      JSON.stringify(r.decor));
    check(tag + ': cá cảnh cạnh Dave không đuổi cắn', !!r.decor && near !== 'chase', (r.decor && r.decor.sp) + (r.decor && r.decor.aggressive ? ' (loài hung dữ)' : '') + ' → ' + near);
    const body = 1.2, bad = r.sizes.filter(s => s.wreck ? s.len < 2 * body - 0.01 : s.len < 1.5 * body - 0.01 || s.len > 2 * body + 0.01);
    check(tag + ': đồ cổ vẽ to 1,5–2 lần thân Dave', r.sizes.length > 0 && bad.length === 0,
      r.sizes.length + ' món, cạnh dài ' + Math.min(...r.sizes.map(s => s.len)).toFixed(2) + '–' + Math.max(...r.sizes.map(s => s.len)).toFixed(2) + ' m' + (bad.length ? ', sai: ' + JSON.stringify(bad.slice(0, 3)) : ''));
    check(tag + ': món nào cũng có viền sáng', r.sizes.every(s => s.glow));
    check(tag + ': không lỗi trang', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }
  await browser.close();
  srv.close();
  console.log(`\n${pass} đạt / ${fail} hỏng`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
