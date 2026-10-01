/*
 * BIỆT ĐỘI LẶN — bộ kiểm đồ cổ + móc dây.
 *
 * Chạy:  node test/biet-doi-lan-tether.js
 * 1280×720, map 0 và map 3. Ảnh chụp ra %TEMP%/bdl-tether-shots (đổi bằng SHOTS=...).
 * Kiểm: rải đồ cổ mỗi tầng và chỉ tiêu; móc món vừa → kéo lên; thả → chìm; đập món gốm → mất tiền;
 * xác thuyền kéo gắt → đứt dây rồi chìm; cá to chết thành xác nằm lại, không xả thịt, móc được; cá nhỏ vẫn vào túi.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-tether-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const MAPS = (process.env.MAPS || '0,3').split(',').map(Number);

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
const fx = n => (Math.round(n * 100) / 100).toString();

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

// Hàm dựng sẵn trong trang: tìm cột nước trống (rộng, thoáng 9 m phía trên), có đá ở dưới, trên vùng áp suất.
async function installHelpers(page) {
  await page.evaluate(() => {
    window.__t = {
      openColumn: function (floorMin, avoid) {
        const G = HX.game, W = G.world, F = G.floors, lastY1 = F[F.length - 1].y1;
        for (let fi = floorMin; fi < F.length; fi++) {
          for (let x = -44; x <= 44; x += 1.5) {
            if (avoid && avoid.some(a => Math.abs(a - x) < 6)) continue;
            for (let y = F[fi].y0 - 3; y > F[fi].y1; y -= 1) {
              if (y - 3 < lastY1 + 1) break;
              if (!W.open(x, y, 1.3) || W.raycast(x, y, x, y + 9) || !W.open(x, y + 9, 0.8)) continue;
              const down = W.raycast(x, y, x, y - 7);
              if (!down || down.y < lastY1 + 0.5) continue;
              if (W.raycast(x - 3, y, x + 3, y) || W.raycast(x - 3, y + 4, x + 3, y + 4)) continue;
              return { x: x, y: y, floor: down.y };
            }
          }
        }
        return null;
      },
      loot: function (id) { const l = BDL_DEBUG.loot.get(id); return l ? { x: l.pos.x, y: l.pos.y, state: l.state, value: l.value, value0: l.value0, asleep: l.asleep } : null; },
      fish: function (fid) { const f = HX.game.fishes.list.find(q => q.id === fid); if (!f) return null; const c = f.center(); return { state: f.state, x: c.x, y: c.y, tethered: !!f.tethered, size: f.sp.size }; },
      dave: function () { const d = HX.game.diver; return { x: d.pos.x, y: d.pos.y, state: d.state, tow: d.tow }; },
    };
  });
}

async function intoWater(page) {
  await page.evaluate(() => { if (BDL_DEBUG.ship && HX.game.deck && HX.game.deck.on) BDL_DEBUG.ship.jump(); });
  const ok = await page.waitForFunction(() => !(HX.game.deck && HX.game.deck.on) && HX.game.diver.state === 'swim', null, { timeout: 15000 }).then(() => true, () => false);
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return false; }; });   // quái của hệ khác không làm hỏng phép đo
  return ok;
}

async function placeDave(page, x, y) {
  await page.evaluate(([x, y]) => { BDL_DEBUG.teleport(x, y); HX.game.diver.vulnerable = function () { return false; }; }, [x, y]);
  await sleep(350);
}

// Bắn súng xiên bằng chuột thật: rê tới điểm thế giới (x, y), giữ chuột trái để ngắm, thả để bắn. Trúng đồ cổ / xác thì móc dây.
async function hookAt(page, x, y) {
  const s = await page.evaluate(([x, y]) => BDL_DEBUG.items.screen(x, y), [x, y]);
  await page.mouse.move(s.x, s.y);
  await sleep(150);
  await page.mouse.down();
  await sleep(450);
  await page.mouse.up();
}
// bấm chuột trái lần nữa (không cần ngắm) để thả dây đang buộc: nhấp chỗ trống của màn hình
async function releaseClick(page) {
  await page.mouse.move(980, 200);
  await sleep(100);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
}

async function waitState(page, want, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => BDL_DEBUG.tether.state());
    if (want.indexOf(s) >= 0) return s;
    await sleep(50);
  }
  return page.evaluate(() => BDL_DEBUG.tether.state());
}

async function oneMap(browser, base, m) {
  const W = 1280, H = 720, tag = 'map ' + m;
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=' + m);
  const reached = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.loot, null, { timeout: 120000 }).then(() => true, () => false);
  check(tag + ': vào pha dive', reached);
  if (!reached) { check(tag + ': không lỗi trang', false, errors.slice(0, 3).join(' | ')); await page.close(); return; }
  await sleep(2500);
  await installHelpers(page);

  // ---- rải đồ cổ + chỉ tiêu ----
  const li = await page.evaluate(() => ({ info: BDL_DEBUG.loot.info(), list: BDL_DEBUG.loot.list() }));
  const per = li.info.perFloor;
  check(tag + ': mỗi tầng có đồ cổ', per.length > 0 && per.every(n => n > 0), per.join('/') + ' (' + li.info.count + ' món)');
  const sum = li.list.reduce((a, l) => a + l.value0, 0);
  const want = Math.round(sum * 0.7 * li.info.curve * 0.55 * li.info.quotaMul / 100) * 100;
  check(tag + ': chỉ tiêu = round(Σ×0,7×curve×0,55×quotaMul/100)×100', li.info.quota === want && li.info.lootTotal === sum,
    'Σ ' + sum + ' × curve ' + fx(li.info.curve) + ' × quotaMul ' + li.info.quotaMul + ' → ' + li.info.quota + ' (tính lại ' + want + ')');
  check(tag + ': tầng sâu không ít hơn tầng nông', per[per.length - 1] + per[per.length - 2] >= per[0] - 1, per.join('/'));
  const kinds = {};
  li.list.forEach(l => { kinds[l.size] = (kinds[l.size] || 0) + 1; });
  console.log('     cỡ nhỏ/vừa/to: ' + [0, 1, 2].map(k => kinds[k] || 0).join('/') + ', xác thuyền ' + li.list.filter(l => l.wreck).length + ', dựng ' + li.info.built.ms + ' ms');

  const water = await intoWater(page);
  check(tag + ': Dave xuống nước', water);

  // ---- móc món vừa, bơi lên 6 s ----
  const col = await page.evaluate(() => __t.openColumn(1));
  check(tag + ': tìm được cột nước trống', !!col, col ? fx(col.x) + ',' + fx(col.y) : '');
  if (!col) { await page.close(); return; }
  const mid = await page.evaluate(c => BDL_DEBUG.loot.spawn('goldfish', c.x, c.floor + 0.5), col);
  await sleep(1200);   // món mới thả chìm xuống đá
  let L0 = await page.evaluate(id => __t.loot(id), mid);
  await placeDave(page, L0.x - 2.2, L0.y + 2.4);
  await hookAt(page, L0.x, L0.y);
  let st = await waitState(page, ['attached'], 1500);
  check(tag + ': súng xiên (chuột trái giữ-thả) trúng món vừa → móc dây, attached', st === 'attached', st);
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, 'map' + m + '-attached.png') });
  L0 = await page.evaluate(id => __t.loot(id), mid);
  await page.keyboard.down('KeyW');
  let mulMin = 1;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    const d = await page.evaluate(() => __t.dave());
    if (d.tow) mulMin = Math.min(mulMin, d.tow.mul);
  }
  await page.keyboard.up('KeyW');
  let L1 = await page.evaluate(id => __t.loot(id), mid);
  let ti = await page.evaluate(() => BDL_DEBUG.tether.info());
  check(tag + ': bơi lên 6 s kéo món lên ≥ 3 m', L1.y - L0.y >= 3, 'lên ' + fx(L1.y - L0.y) + ' m');
  check(tag + ': món vẫn trong tầm dây', ti.state === 'attached' && ti.len <= 9, ti.state + ', dây ' + fx(ti.len) + ' m, nghỉ ' + fx(ti.rest) + ' m');
  check(tag + ': Dave chậm lại khi kéo (REPO speed/(1+m/str))', mulMin < 0.7 && mulMin >= 0.35, 'hệ số ' + fx(mulMin));
  await page.screenshot({ path: path.join(SHOTS, 'map' + m + '-hauling.png') });
  // bơi ngược về phía món: dây chùng, võng xuống
  await page.keyboard.down('KeyS'); await sleep(380); await page.keyboard.up('KeyS');
  await sleep(150);
  ti = await page.evaluate(() => BDL_DEBUG.tether.info());
  check(tag + ': bơi lại gần thì dây chùng', ti.state === 'attached' && ti.len < ti.rest - 0.2, 'dây ' + fx(ti.len) + ' m < nghỉ ' + fx(ti.rest) + ' m');
  await page.screenshot({ path: path.join(SHOTS, 'map' + m + '-slack.png') });

  // ---- bấm chuột trái lần nữa: thả, món chìm ----
  await releaseClick(page);
  st = await waitState(page, ['retracting', 'idle'], 600);
  check(tag + ': bấm chuột trái lần nữa là thả móc (không cần ngắm)', st === 'retracting' || st === 'idle', st);
  L1 = await page.evaluate(id => __t.loot(id), mid);
  await sleep(2000);
  const L2 = await page.evaluate(id => __t.loot(id), mid);
  check(tag + ': thả ra thì món chìm', L2.y < L1.y - 0.4, fx(L1.y) + ' → ' + fx(L2.y) + ' (' + L2.state + ')');
  await waitState(page, ['idle'], 2000);

  // ---- đập món gốm xuống đá ----
  const jade = await page.evaluate(c => { const id = BDL_DEBUG.loot.spawn('jadefish', c.x, c.floor + 2.5); const l = BDL_DEBUG.loot.get(id); l.vel.y = -7; return id; }, col);
  await sleep(1200);
  const J = await page.evaluate(id => { const l = BDL_DEBUG.loot.get(id); return l ? { v: l.value, v0: l.value0, st: l.state } : { gone: true }; }, jade);
  const pops = await page.evaluate(() => document.querySelectorAll('.loot-pop').length);
  check(tag + ': món gốm đập đá mất tiền hoặc vỡ', J.gone || J.v < J.v0, J.gone ? 'vỡ' : BDL_DEBUGfmt(J.v0) + ' → ' + BDL_DEBUGfmt(J.v));
  check(tag + ': hiện chữ "−$X"', pops > 0, pops + ' chữ');
  // món kim loại đập cùng tốc độ thì không sao (ngưỡng 5,9 m/s)
  const cup = await page.evaluate(c => { const id = BDL_DEBUG.loot.spawn('goldcup', c.x, c.floor + 2.5); BDL_DEBUG.loot.get(id).vel.y = -5; return id; }, col);
  await sleep(1200);
  const Cu = await page.evaluate(id => { const l = BDL_DEBUG.loot.get(id); return { v: l.value, v0: l.value0 }; }, cup);
  check(tag + ': món kim loại cùng cú đập giữ giá', Cu.v === Cu.v0, Cu.v0 + ' → ' + Math.round(Cu.v));

  // ---- xác thuyền: kéo gắt thì dây mỏi rồi đứt, xác chìm ----
  const col2 = await page.evaluate(c => __t.openColumn(1, [c.x]), col) || col;
  const wr = await page.evaluate(c => BDL_DEBUG.loot.spawn('bow', c.x, c.floor + 1.2), col2);
  await sleep(1500);
  const Wr0 = await page.evaluate(id => __t.loot(id), wr);
  await placeDave(page, Wr0.x - 1.5, Wr0.y + 2.6);
  await hookAt(page, Wr0.x, Wr0.y);
  st = await waitState(page, ['attached'], 1500);
  check(tag + ': móc vào xác thuyền bằng súng xiên', st === 'attached', st);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
  let strainMax = 0, snapAt = -1, shot = false, t0 = Date.now(), struggled = false;
  while (Date.now() - t0 < 6000) {
    const s = await page.evaluate(() => ({ st: BDL_DEBUG.tether.state(), strain: BDL_DEBUG.tether.strain(), d: __t.dave() }));
    strainMax = Math.max(strainMax, s.strain);
    if (s.d.tow && s.d.tow.k > 0.45) struggled = true;
    if (!shot && s.strain > 0.6) { await page.screenshot({ path: path.join(SHOTS, 'map' + m + '-strain.png') }); shot = true; }
    if (s.st === 'snapped') { snapAt = (Date.now() - t0) / 1000; await page.screenshot({ path: path.join(SHOTS, 'map' + m + '-snapped.png') }); break; }
    await sleep(60);
  }
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
  check(tag + ': dây mỏi dần khi kéo xác thuyền', strainMax > 0.3, 'mỏi tối đa ' + fx(strainMax));
  check(tag + ': Dave giãy khi kéo nặng', struggled);
  check(tag + ': dây đứt trong 6 s', snapAt > 0, snapAt > 0 ? fx(snapAt) + ' s' : 'không đứt');
  const Wr1 = await page.evaluate(id => __t.loot(id), wr);
  await sleep(1500);
  const Wr2 = await page.evaluate(id => __t.loot(id), wr);
  check(tag + ': đứt dây thì xác thuyền chìm lại', Wr2.y < Wr1.y - 0.2 || Wr2.state === 'rest', fx(Wr1.y) + ' → ' + fx(Wr2.y) + ' (' + Wr2.state + ')');
  await waitState(page, ['idle'], 2000);

  // ---- cá to: chết là xác nằm lại, không xả thịt, móc được ----
  const big = await page.evaluate(c => {
    const G = HX.game, d = G.diver, x = c.x, y = c.y + 4;
    BDL_DEBUG.teleport(x - 2.6, y);
    const f = G.fishes.spawnAt(HX.fish.BY_ID.Dusky_Grouper, x, y);
    // cá hoang và quái quanh đó không được chắn đường xiên
    G.fishes.frozen = true;
    G.fishes.drop(G.fishes.list.filter(q => q !== f && Math.hypot(q.pos.x - x, q.pos.y - y) < 14));

    f.frozen = true; f.hp = 1; f.facing = -1; f.flip = -1;
    d.vulnerable = function () { return false; };
    return f.id;
  }, col);
  await sleep(300);
  await page.evaluate(fid => {
    const G = HX.game, d = G.diver, f = G.fishes.list.find(q => q.id === fid), c = f.center(), tip = d.gunTip();
    G.harpoon.fire(tip.x, tip.y, Math.atan2(c.y - tip.y, c.x - tip.x));
  }, big);
  await sleep(2500);
  let B = await page.evaluate(fid => __t.fish(fid), big);
  const caught = await page.evaluate(() => HX.game.catches.slice());
  check(tag + ': cá to trúng xiên chết thành xác nằm lại, không vào túi', !!B && (B.state === 'dying' || B.state === 'dead') && caught.indexOf('Dusky_Grouper') < 0,
    B ? B.state + ', túi [' + caught.join(',') + ']' : 'mất xác');
  st = await page.evaluate(() => BDL_DEBUG.tether.state());
  const autoHook = await page.evaluate(fid => { const t = BDL.tether.target(); return !!t && t.id === fid && !t.isLoot; }, big);
  check(tag + ': cá to chết trên xiên thì xác buộc luôn vào dây móc', st === 'attached' && autoHook, st);
  if (B) {
    await releaseClick(page);
    await waitState(page, ['idle'], 2500);
    B = await page.evaluate(fid => __t.fish(fid), big);
    await placeDave(page, B.x - 0.4, B.y);
    const hp = await page.evaluate(() => { const p = HX.game.diver.harvestPrompt(); return p ? { carve: p.carve, drone: !!p.drone } : null; });
    check(tag + ': cạnh xác cá to không có lời nhắc xả thịt', !hp || (!hp.carve && hp.drone), JSON.stringify(hp));
    await placeDave(page, B.x - 2.2, B.y + 1.8);
    B = await page.evaluate(fid => __t.fish(fid), big);
    await hookAt(page, B.x, B.y);
    st = await waitState(page, ['attached'], 1500);
    const tgtFish = await page.evaluate(fid => { const t = BDL.tether.target(); return !!t && t.id === fid && !t.isLoot; }, big);
    check(tag + ': thả rồi bắn xiên lại vào xác cá to → móc dây', st === 'attached' && tgtFish, st);
    const Bt0 = await page.evaluate(fid => __t.fish(fid), big);
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
    const Bt1 = await page.evaluate(fid => __t.fish(fid), big);
    check(tag + ': xác cá to theo dây lên', Bt1 && Bt1.y - Bt0.y > 1 && Bt1.tethered, Bt1 ? 'lên ' + fx(Bt1.y - Bt0.y) + ' m, ' + Bt1.state : 'mất xác');
    const item = await page.evaluate(() => BDL.tether.consume());
    check(tag + ': lên boong thành món cá giá × (1 + cỡ)', !!item && item.kind === 'fish' && item.key === 'Dusky_Grouper' && item.value === await page.evaluate(() => BDL.fishValue(HX.fish.BY_ID.Dusky_Grouper) * 2),
      JSON.stringify(item && { kind: item.kind, key: item.key, value: item.value }));
  }

  // ---- cá nhỏ: xiên vẫn kéo vào túi ----
  const small = await page.evaluate(c => {
    const G = HX.game, d = G.diver, x = c.x, y = c.y + 2;
    BDL_DEBUG.teleport(x - 2.2, y);
    const f = G.fishes.spawnAt(HX.fish.BY_ID.ClownFish, x, y);
    // cá hoang và quái quanh đó không được chắn đường xiên
    G.fishes.frozen = true;
    G.fishes.drop(G.fishes.list.filter(q => q !== f && Math.hypot(q.pos.x - x, q.pos.y - y) < 14));

    f.frozen = true; f.hp = 1;
    d.vulnerable = function () { return false; };
    return f.id;
  }, col);
  await sleep(300);
  await page.evaluate(fid => {
    const G = HX.game, d = G.diver, f = G.fishes.list.find(q => q.id === fid), c = f.center(), tip = d.gunTip();
    G.harpoon.fire(tip.x, tip.y, Math.atan2(c.y - tip.y, c.x - tip.x));
  }, small);
  await sleep(3000);
  const bag = await page.evaluate(() => HX.game.catches.slice());
  check(tag + ': cá nhỏ trúng xiên vẫn vào túi', bag.indexOf('ClownFish') >= 0, '[' + bag.join(',') + ']');

  const pageErr = await page.evaluate(() => BDL_DEBUG.info().errors);
  check(tag + ': không lỗi trang', errors.length === 0 && pageErr.length === 0, errors.concat(pageErr).slice(0, 4).join(' | '));
  await page.close();
}

function BDL_DEBUGfmt(n) { return '$' + Math.round(n); }

(async () => {
  const srv = await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const m of MAPS) { console.log('— map ' + m); await oneMap(browser, base, m); }
  } catch (e) { fail++; console.log('  ✘ lỗi bộ kiểm: ' + (e.stack || e)); }
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
