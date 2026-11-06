/*
 * BIỆT ĐỘI LẶN — bộ kiểm tay cầm / đồ nghề / tủ đồ / chỉ số / drone.
 *
 * Chạy:  node test/biet-doi-lan-items.js
 * PC 1280×720 (map 0, chạy đủ) và cảm ứng 844×390 (tủ, ô tay cầm, nút đổi, nút bắn lớn dùng đồ). Ảnh ra %TEMP%/bdl-items-shots (SHOTS=...).
 * Kiểm: mở tủ bằng E ở boong và chuyển rifle/bomb/o2m lên tay; lăn chuột / phím 1-3 đổi tay; súng trừ đạn và trúng quái, hết đạn thì báo,
 * BDL.restock nạp lại; gậy trừ lượt khi trúng; bom nổ hại quái và làm đồ cổ mất giá; bình O₂ hồi; phao nổi làm đồ nặng hết kéo chậm;
 * chỉ số (O₂ tối đa ra đúng số); drone mang đồ buộc dây lên thuyền, 3 chuyến, hết thì từ chối.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-items-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

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

const st = page => page.evaluate(() => BDL_DEBUG.items.state());
const hand = page => page.evaluate(() => ({ slots: BDL.hand.slots.map(e => e ? e.key + ':' + e.uses : null), active: BDL.hand.active }));

async function install(page) {
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
              if (W.raycast(x - 5, y, x + 6, y) || W.raycast(x - 3, y + 4, x + 3, y + 4)) continue;
              return { x: x, y: y, floor: down.y };
            }
          }
        }
        return null;
      },
      dave: function () { const d = HX.game.diver; return { x: d.pos.x, y: d.pos.y, state: d.state, tow: d.tow, o2: d.o2, stamina: d.stamina }; },
      foe: function (id) { return BDL_DEBUG.foes.get(id); },
      loot: function (id) { const l = BDL_DEBUG.loot.get(id); return l ? { x: l.pos.x, y: l.pos.y, state: l.state, value: l.value, value0: l.value0 } : null; },
      toast: function () { return document.getElementById('toast').textContent; },
    };
  });
}

async function intoWater(page) {
  await page.evaluate(() => { if (BDL_DEBUG.ship && HX.game.deck && HX.game.deck.on) BDL_DEBUG.ship.jump(); });
  return page.waitForFunction(() => !(HX.game.deck && HX.game.deck.on) && HX.game.diver.state === 'swim', null, { timeout: 15000 }).then(() => true, () => false);
}
async function placeDave(page, x, y) {
  await page.evaluate(([x, y]) => BDL_DEBUG.teleport(x, y), [x, y]);
  await sleep(450);
}
async function openPage(browser, base, opt) {
  const ctx = await browser.newContext(opt);
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/biet-doi-lan/index.html?map=0');
  const ok = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive' && BDL_DEBUG.items && BDL_DEBUG.loot, null, { timeout: 120000 }).then(() => true, () => false);
  return { page, errors, ok, ctx };
}
// súng xiên-móc dây: giữ chuột trái để ngắm tại điểm thế giới (x, y), thả để bắn
async function hookAt(page, x, y) {
  const sc = await page.evaluate(([x, y]) => BDL_DEBUG.items.screen(x, y), [x, y]);
  await page.mouse.move(sc.x, sc.y);
  await sleep(150);
  await page.mouse.down();
  await sleep(450);
  await page.mouse.up();
}
// bấm chuột trái chỗ trống: thả dây đang buộc (không ngắm)
async function releaseClick(page) {
  await page.mouse.move(980, 200);
  await sleep(100);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
}
// bấm giữ chuột trái tại điểm thế giới (x, y) rồi thả: bắn súng / đánh / ném / dùng đồ
async function useAt(page, x, y, holdMs) {
  const s = await page.evaluate(([x, y]) => BDL_DEBUG.items.screen(x, y), [x, y]);
  await page.mouse.move(s.x, s.y);
  await sleep(120);
  await page.mouse.down();
  await sleep(holdMs || 90);
  await page.mouse.up();
}

// ============================================================================================================================
async function pcRun(browser, base) {
  const tag = 'PC';
  const { page, errors, ok } = await openPage(browser, base, { viewport: { width: 1280, height: 720 } });
  check(tag + ': vào pha dive, có hệ items + locker', ok && await page.evaluate(() => BDL_DEBUG.info().systems.indexOf('items') >= 0 && BDL_DEBUG.info().systems.indexOf('locker') >= 0));
  if (!ok) { check(tag + ': không lỗi trang', false, errors.slice(0, 3).join(' | ')); return; }
  await sleep(2500);
  await install(page);
  await page.mouse.move(640, 300);

  // ---- tủ ----
  await page.evaluate(() => {
    const g = BDL_DEBUG.items.give;
    g('rifle'); g('bat'); g('bomb'); g('o2m'); g('float'); g('shield');
  });
  let s = await st(page);
  check(tag + ': tủ có 6 món (rifle, bat, bomb, o2m, float, shield), tay trống', s.stash.length === 6 && s.slots.every(x => !x), s.stash.map(x => x.key + ':' + x.uses).join(' '));
  await page.evaluate(() => BDL_DEBUG.ship.stand('locker'));
  await sleep(400);
  const prompt = await page.evaluate(() => ({ kind: BDL_DEBUG.ship.info().prompt, txt: document.querySelector('#ship-prompt .txt').textContent, key: document.querySelector('#ship-prompt .key').textContent, keyShown: getComputedStyle(document.querySelector('#ship-prompt .key')).display !== 'none' }));
  check(tag + ': đứng ở tủ hiện "Mở tủ đồ" kèm phím E', prompt.kind === 'locker' && prompt.key === 'E' && prompt.keyShown, JSON.stringify(prompt));
  await page.keyboard.press('KeyE');
  await sleep(500);
  let lk = await page.evaluate(() => { const r = document.getElementById('locker'); const b = r.getBoundingClientRect(); return { open: BDL.locker.isOpen(), vis: !r.hidden && getComputedStyle(r).display !== 'none', cells: r.querySelectorAll('.bcell[data-stash]').length, hcells: r.querySelectorAll('.hcell').length, panel: (() => { const p = document.getElementById('veilExtra').getBoundingClientRect(); return { l: p.left, t: p.top, r: p.right, b: p.bottom }; })(), border: getComputedStyle(document.getElementById('veilExtra')).borderImageSource }; });
  check(tag + ': E ở tủ mở bảng gỗ (6 ô đồ, 3 ô tay)', lk.open && lk.vis && lk.cells === 6 && lk.hcells === 3, JSON.stringify({ open: lk.open, cells: lk.cells, hcells: lk.hcells }));
  check(tag + ': khung gỗ của tu-do.css áp vào (border-image)', /repo2d\/art\/ui\/inv-panel\.png/.test(lk.border), lk.border.slice(-50));
  check(tag + ': bảng nằm trọn trong màn hình', lk.panel.l >= 0 && lk.panel.t >= 0 && lk.panel.r <= 1280 && lk.panel.b <= 720, JSON.stringify(lk.panel));
  await page.screenshot({ path: path.join(SHOTS, 'pc-locker.png') });
  // Dave đứng yên khi tủ mở
  const lx0 = await page.evaluate(() => HX.game.deck.lx);
  await page.keyboard.down('KeyA'); await sleep(600); await page.keyboard.up('KeyA');
  const lx1 = await page.evaluate(() => HX.game.deck.lx);
  check(tag + ': tủ mở thì Dave không bước', Math.abs(lx1 - lx0) < 0.001, fx(lx0) + ' → ' + fx(lx1));
  // rifle (ô tủ 0), bomb (sau khi rifle ra, bomb ở ô 1), o2m (sau đó ở ô 1)
  await page.click('#locker [data-stash="0"]');
  await page.click('#locker [data-stash="1"]');
  await page.click('#locker [data-stash="1"]');
  s = await st(page);
  check(tag + ': bấm 3 món → lên tay rifle / bomb / o2m, không còn trong tủ', s.slots.map(x => x && x.key).join() === 'rifle,bomb,o2m' && s.stash.map(x => x.key).join() === 'bat,float,shield', s.slots.map(x => x && x.key).join() + ' | tủ ' + s.stash.map(x => x.key).join());
  // tay đầy: bấm thêm không lên được
  await page.click('#locker [data-stash="0"]');
  s = await st(page);
  check(tag + ': tay đầy thì bấm thêm không đổi gì', s.slots.map(x => x && x.key).join() === 'rifle,bomb,o2m' && s.stash.length === 3, s.stash.length + ' món trong tủ');
  await page.screenshot({ path: path.join(SHOTS, 'pc-locker-hand.png') });
  // bấm ô tay (hoặc ×) trả về tủ
  await page.click('#locker [data-back="2"]');
  s = await st(page);
  check(tag + ': bấm × ở ô tay trả món về tủ', !s.slots[2] && s.stash.some(x => x.key === 'o2m'), s.stash.map(x => x.key).join());
  const oi = s.stash.findIndex(x => x.key === 'o2m');
  await page.click('#locker [data-stash="' + oi + '"]');
  s = await st(page);
  check(tag + ': và cầm lại được', s.slots[2] && s.slots[2].key === 'o2m');
  // Esc đóng tủ, không bật màn tạm dừng; E mở lại rồi E đóng
  await page.keyboard.press('Escape');
  await sleep(250);
  let st2 = await page.evaluate(() => ({ open: BDL.locker.isOpen(), pause: !document.getElementById('pause-note').hidden }));
  check(tag + ': Esc đóng tủ, không bật tạm dừng', !st2.open && !st2.pause, JSON.stringify(st2));
  await page.keyboard.press('KeyE'); await sleep(300);
  const reopened = await page.evaluate(() => BDL.locker.isOpen());
  await page.keyboard.press('KeyE'); await sleep(300);
  st2 = await page.evaluate(() => BDL.locker.isOpen());
  check(tag + ': E mở lại, E đóng (không mở lại ngay)', reopened && !st2);
  // ✕ đóng
  await page.keyboard.press('KeyE'); await sleep(300);
  await page.click('#locker .lk-x'); await sleep(200);
  check(tag + ': nút ✕ đóng tủ', !(await page.evaluate(() => BDL.locker.isOpen())));

  // ---- xuống nước ----
  check(tag + ': Dave xuống nước', await intoWater(page));
  const col = await page.evaluate(() => __t.openColumn(1));
  check(tag + ': tìm được cột nước trống', !!col, col ? fx(col.x) + ',' + fx(col.y) : '');
  if (!col) return;
  await placeDave(page, col.x, col.y);
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return false; }; });   // quái của hệ khác không làm hỏng phép đo
  await page.screenshot({ path: path.join(SHOTS, 'pc-hand-bar.png') });
  const bar = await page.evaluate(() => Array.from(document.querySelectorAll('#hand .cell')).map(c => ({ empty: c.classList.contains('empty'), n: c.querySelector('.n').textContent, src: (c.querySelector('img.ic') || {}).src || '', on: c.classList.contains('on') })));
  check(tag + ': ô 0 của thanh tay cầm ghi "Súng móc"', (await page.evaluate(() => document.querySelector('#hand .cell[data-i="0"] .k').textContent)) === 'Súng móc');
  check(tag + ': thanh tay cầm hiện 3 món với số lượt (×20, ×2, ×1)', bar[1].n === '×20' && bar[2].n === '×2' && bar[3].n === '×1' && !bar[1].empty && /\.png/.test(bar[1].src), bar.map(c => c.n).join(' '));

  // ---- đổi tay: lăn chuột ±1, phím 1-3 ----
  await page.mouse.move(640, 300);
  const seq = [];
  for (const act of [['wheel', 100], ['wheel', 100], ['wheel', 100], ['wheel', 100], ['wheel', -100], ['key', 'Digit3'], ['key', 'Digit3'], ['key', 'Digit1']]) {
    if (act[0] === 'wheel') await page.mouse.wheel(0, act[1]); else await page.keyboard.press(act[1]);
    await sleep(160);
    seq.push((await hand(page)).active);
  }
  check(tag + ': lăn xuôi 0→1→2→3→0, ngược →3, phím 3 (đang 3) về 0, phím 3 lại chọn 3, phím 1 chọn 1', seq.join() === '1,2,3,0,3,0,3,1', seq.join());

  // ---- súng trường ----
  const rook = await page.evaluate(c => BDL_DEBUG.foes.spawn('rook', c.x + 4, c.y, { asleep: true })[0], col);
  await sleep(300);
  const hp0 = (await page.evaluate(id => __t.foe(id), rook)).hp;
  await useAt(page, col.x + 4, col.y, 650);
  await sleep(1000);
  s = await st(page);
  const f1 = await page.evaluate(id => __t.foe(id), rook);
  check(tag + ': bắn rifle trừ 1 đạn (20 → 19)', s.slots[0].uses === 19 && s.gunFired === 1, 'uses ' + s.slots[0].uses + ', súng bắn ' + s.gunFired);
  check(tag + ': viên đạn trúng quái, máu tụt', f1.hp < hp0 && s.gunHits >= 1, hp0 + ' → ' + f1.hp);
  // hết đạn
  await page.evaluate(() => { BDL.hand.slots[0].uses = 0; });
  await sleep(150);
  await useAt(page, col.x + 4, col.y, 600);
  await sleep(300);
  const msg = await page.evaluate(() => __t.toast());
  s = await st(page);
  check(tag + ': uses 0 thì báo "Hết đạn · chuyến sau nạp lại", súng ở lại tay', /Hết đạn · chuyến sau nạp lại/.test(msg) && s.slots[0] && s.slots[0].uses === 0, msg);
  const back = await page.evaluate(() => { const n = BDL.restock(BDL.run.ca); return { n, uses: BDL.hand.slots[0].uses }; });
  check(tag + ': BDL.restock nạp lại súng đang cầm trên tay (0 → 20)', back.uses === 20, JSON.stringify(back));
  await page.evaluate(id => BDL_DEBUG.foes.clearAll(), rook);

  // ---- bom: ném về phía quái + đồ cổ gốm; nổ sau 1,4 s ----
  const loot = await page.evaluate(c => BDL_DEBUG.loot.spawn('jadefish', c.x + 4.6, c.y - 0.8), col);
  const rook2 = await page.evaluate(c => BDL_DEBUG.foes.spawn('rook', c.x + 4.2, c.y - 0.4, { asleep: true })[0], col);
  await sleep(100);
  const L0 = await page.evaluate(id => __t.loot(id), loot);
  const hpB = (await page.evaluate(id => __t.foe(id), rook2)).hp;
  await page.keyboard.press('Digit2'); await sleep(200);
  check(tag + ': phím 2 cầm bom', (await hand(page)).active === 2);
  await page.mouse.move(640, 300);
  await useAt(page, col.x + 4.4, col.y - 0.6, 90);
  await sleep(300);
  s = await st(page);
  check(tag + ': ném bom: trừ 1 lượt (2 → 1), quả bom đang bay', s.slots[1].uses === 1 && s.thrown === 1, 'uses ' + s.slots[1].uses + ', đang bay ' + s.thrown);
  await sleep(1100);   // ~1,4 s sau lúc ném
  await page.screenshot({ path: path.join(SHOTS, 'pc-bomb-blast.png') });
  await sleep(700);
  s = await st(page);
  const f2 = await page.evaluate(id => __t.foe(id), rook2);
  const L1 = await page.evaluate(id => __t.loot(id), loot);
  const b = s.blasts[0];
  check(tag + ': bom nổ một lần (sau ~1,4 s), hết quả bom bay', s.blasts.length === 1 && s.thrown === 0, JSON.stringify(b));
  check(tag + ': vụ nổ hại quái trong bán kính 3,4 m', f2.hp < hpB, hpB + ' → ' + f2.hp + (f2.dead ? ' (chết)' : ''));
  check(tag + ': đồ cổ gốm gần đó mất giá hoặc vỡ', !L1 || L1.value < L0.value, L0.value + ' → ' + (L1 ? Math.round(L1.value) : 'vỡ'));
  await page.evaluate(() => BDL_DEBUG.foes.clearAll());

  // ---- bình O₂ ----
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return true; }; BDL_DEBUG.foes.clearAll(); });
  await sleep(1300);
  await page.evaluate(() => BDL_DEBUG.hurt(60));
  const o2a = (await page.evaluate(() => __t.dave())).o2;
  await sleep(700);   // trạng thái "bị đau" 0,45 s nuốt cú bấm
  await page.keyboard.press('Digit3'); await sleep(250);
  await useAt(page, col.x + 3, col.y, 90);
  await sleep(500);
  const o2b = (await page.evaluate(() => __t.dave())).o2;
  s = await st(page);
  check(tag + ': hurt(60) rồi dùng bình O₂ vừa: +50 O₂', Math.abs((o2b - o2a) - 50) < 1, fx(o2a) + ' → ' + fx(o2b));
  check(tag + ': bình dùng hết thì mất khỏi tay, về tay xiên', s.slots[2] === null && (await hand(page)).active === 0, JSON.stringify(s.slots));
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return false; }; });

  // ---- gậy: tủ → tay (qua API), đánh quái đứng sát ----
  await page.evaluate(() => { const i = BDL_DEBUG.items.state().stash.findIndex(x => x.key === 'bat'); BDL_DEBUG.items.equip(i); });
  await page.keyboard.press('Digit3'); await sleep(250);
  const rook3 = await page.evaluate(c => BDL_DEBUG.foes.spawn('rook', c.x + 1.0, c.y, { asleep: true })[0], col);
  await sleep(200);
  const hpC = (await page.evaluate(id => __t.foe(id), rook3)).hp;
  const stam0 = (await page.evaluate(() => __t.dave())).stamina;
  await useAt(page, col.x + 1.3, col.y, 90);
  const stam1 = (await page.evaluate(() => __t.dave())).stamina;
  await sleep(900);
  s = await st(page);
  const f3 = await page.evaluate(id => __t.foe(id), rook3);
  check(tag + ': đánh gậy trúng quái: trừ 1 lượt (12 → 11), máu tụt', s.slots[2] && s.slots[2].uses === 11 && f3.hp < hpC, 'uses ' + (s.slots[2] && s.slots[2].uses) + ', ' + hpC + ' → ' + f3.hp);
  check(tag + ': vung gậy tốn thể lực (12)', stam1 < stam0 - 6, fx(stam0) + ' → ' + fx(stam1));
  // vung hụt không trừ lượt
  await page.evaluate(id => {
    BDL_DEBUG.foes.clearAll();
    const d = HX.game.diver.pos;   // cá thường lạc tới trong tầm vung cũng bị đánh trúng: dọn sạch quanh Dave
    HX.game.fishes.drop(HX.game.fishes.list.filter(f => Math.hypot(f.pos.x - d.x, f.pos.y - d.y) < 6));
  }, rook3);
  await sleep(400);
  await useAt(page, col.x + 1.3, col.y, 90);
  await sleep(900);
  check(tag + ': vung hụt thì không trừ lượt', (await st(page)).slots[2].uses === 11);

  // ---- phao nổi: móc xác thuyền nặng, đo hệ số chậm ----
  await page.evaluate(() => { BDL_DEBUG.items.unequip(0); const i = BDL_DEBUG.items.state().stash.findIndex(x => x.key === 'float'); BDL_DEBUG.items.equip(i); });
  await page.evaluate(() => BDL_DEBUG.items.select(0));
  await sleep(200);
  const col2 = await page.evaluate(c => __t.openColumn(1, [c.x]), col) || col;
  const wr = await page.evaluate(c => BDL_DEBUG.loot.spawn('bow', c.x, c.floor + 1.2), col2);
  await sleep(1500);
  const W0 = await page.evaluate(id => __t.loot(id), wr);
  await placeDave(page, W0.x - 1.5, W0.y + 2.6);
  await hookAt(page, W0.x, W0.y);
  await sleep(500);
  check(tag + ': súng xiên (chuột trái) móc dây vào xác thuyền', (await page.evaluate(() => BDL_DEBUG.tether.state())) === 'attached');
  await page.keyboard.down('KeyW');
  let mulNo = 1;
  // xác thuyền kéo gắt đứt dây sau ~2,75 s (đúng luật): đo chậm trong 0,9 s rồi dùng phao ngay, kẻo dây đứt trước
  for (let i = 0; i < 3; i++) { await sleep(300); const d = await page.evaluate(() => __t.dave()); if (d.tow) mulNo = Math.min(mulNo, d.tow.mul); }
  // cầm phao (ô 1) và dùng
  await page.keyboard.press('Digit1'); await sleep(200);
  check(tag + ': ô 1 là phao nổi', (await page.evaluate(() => BDL.hand.slots[0].key)) === 'float' && (await hand(page)).active === 1);
  await useAt(page, W0.x + 6, W0.y + 6, 90);
  await sleep(400);
  s = await st(page);
  let mulFloat = 0, n = 0;
  for (let i = 0; i < 6; i++) { await sleep(350); const d = await page.evaluate(() => __t.dave()); if (d.tow) { mulFloat += d.tow.mul; n++; } }
  await page.keyboard.up('KeyW');
  mulFloat = n ? mulFloat / n : 0;
  const lootAlive = await page.evaluate(id => __t.loot(id), wr);
  check(tag + ': dùng phao: timers.float ≈ 20 s, trừ 1 lượt (2 → 1)', s.timers.float > 17 && s.slots[0].uses === 1, fx(s.timers.float) + ' s, uses ' + s.slots[0].uses);
  check(tag + ': có phao thì đồ nặng hết làm Dave chậm (hệ số ≈ 1, trước đó < 0,7)', mulNo < 0.7 && mulFloat > 0.95, 'trước ' + fx(mulNo) + ' → sau ' + fx(mulFloat) + ' (món ' + (lootAlive ? lootAlive.state : '?') + ')');
  await page.screenshot({ path: path.join(SHOTS, 'pc-float.png') });
  // chuột trái lần nữa thả dây (đang cầm xiên, ô 0): bỏ phao ra khỏi tay trước
  await page.evaluate(() => BDL_DEBUG.items.select(0));
  await sleep(200);
  await releaseClick(page);
  await sleep(400);
  check(tag + ': cầm xiên, bấm chuột trái lần nữa thả dây đang buộc', (await page.evaluate(() => BDL_DEBUG.tether.state())) !== 'attached');
  await sleep(300);

  // ---- drone: buộc dây món, gọi drone, 3 → 2, lên thuyền ----
  await page.evaluate(() => { BDL_DEBUG.items.setTimer('float', 0); BDL_DEBUG.foes.clearAll(); });
  const col3 = await page.evaluate(c => __t.openColumn(1, [c.x]), col) || col;
  const gf = await page.evaluate(c => BDL_DEBUG.loot.spawn('goldfish', c.x, c.floor + 0.5), col3);
  await sleep(1300);
  const G0 = await page.evaluate(id => __t.loot(id), gf);
  await placeDave(page, G0.x - 1.8, G0.y + 1.8);
  await hookAt(page, G0.x, G0.y);
  await sleep(500);
  check(tag + ': móc đồ cổ để gọi drone', (await page.evaluate(() => BDL_DEBUG.tether.state())) === 'attached');
  const dv0 = await page.evaluate(() => ({ onDeck: BDL.run.dive.onDeck, pile: BDL.run.dive.pile.length, left: BDL.run.dive.droneLeft }));
  await page.keyboard.press('ControlLeft');
  await sleep(1000);
  const calling = await page.evaluate(() => HX.game.diver.state);
  check(tag + ': Ctrl gần đồ buộc dây → Dave đứng gọi drone (callDrone)', calling === 'callDrone', calling);
  await sleep(1400);
  const left1 = await page.evaluate(() => ({ left: BDL.run.dive.droneLeft, drone: HX.game.drone.left, flights: HX.game.drone.flights.length, chip: document.getElementById('hud-drone-n').textContent }));
  check(tag + ': sau 2 s drone xuất phát: droneLeft 3 → 2, HUD hiện 2', dv0.left === 3 && left1.left === 2 && left1.drone === 2 && left1.flights === 1 && left1.chip === '2', JSON.stringify(left1));
  const val = await page.evaluate(id => { const l = BDL_DEBUG.loot.get(id); return l ? Math.round(l.value) : null; }, gf);
  let delivered = false, t0 = Date.now(), shotDrone = false;
  while (Date.now() - t0 < 45000) {
    const p = await page.evaluate(() => ({ onDeck: BDL.run.dive.onDeck, pile: BDL.run.dive.pile.length }));
    if (!shotDrone && Date.now() - t0 > 4000) { shotDrone = true; await page.screenshot({ path: path.join(SHOTS, 'pc-drone.png') }); }
    if (p.pile > dv0.pile) { delivered = true; break; }
    await sleep(500);
  }
  const dv1 = await page.evaluate(id => ({ onDeck: BDL.run.dive.onDeck, pile: BDL.run.dive.pile.length, last: BDL.run.dive.pile[BDL.run.dive.pile.length - 1], inWorld: HX.game.loot.some(l => l.id === id) }), gf);
  check(tag + ': drone mang đồ lên thuyền: onDeck tăng đúng giá món, vào đống đồ', delivered && dv1.onDeck - dv0.onDeck === val && dv1.last && dv1.last.kind === 'loot' && val > 0, 'tăng ' + (dv1.onDeck - dv0.onDeck) + ', giá món ' + val);
  check(tag + ': món đã rời thế giới', !dv1.inWorld);
  // hết chuyến thì từ chối
  const gf2 = await page.evaluate(c => BDL_DEBUG.loot.spawn('goldfish', c.x, c.floor + 0.5), col3);
  await sleep(1300);
  const G2 = await page.evaluate(id => __t.loot(id), gf2);
  await placeDave(page, G2.x - 1.8, G2.y + 1.8);
  await page.evaluate(() => { BDL.run.dive.droneLeft = 0; HX.game.drone.left = 0; });
  await hookAt(page, G2.x, G2.y);
  await sleep(500);
  await page.keyboard.press('ControlLeft');
  await sleep(1200);
  const refused = await page.evaluate(id => ({ left: BDL.run.dive.droneLeft, flights: HX.game.drone.flights.length, toast: __t.toast(), loot: !!BDL_DEBUG.loot.get(id), state: HX.game.diver.state, off: document.getElementById('hud-drone').classList.contains('off') }), gf2);
  check(tag + ': droneLeft = 0 thì từ chối (không bay, báo hết drone, chip xám)', refused.left === 0 && refused.flights === 0 && /Hết drone/.test(refused.toast) && refused.loot && refused.off, JSON.stringify(refused));

  // ---- chỉ số ----
  await page.evaluate(() => {
    const ca = BDL.run.ca;
    ca.upg = { hp: 2, stam: 3, str: 1, range: 2, sprint: 1, grip: 1, regen: 2, light: 1, cargo: 2 };
    ca.crew = { lead: { id: 'bao', stats: { hpMul: 1.2, atkMul: 1.5, spd: 1.1, carry: 40, grit: 0.1, luck: 0.05, eye: 0, cdMul: 1 } }, mates: [], teamBonus: { atk: 0.1, grit: 0.05, carry: 0, luck: 0, eye: 0, spd: 0, cd: 0 } };
    BDL_DEBUG.items.refreshStats();
  });
  await sleep(400);
  const sx = await page.evaluate(() => ({ s: BDL_DEBUG.items.stats(), o2: HX.game.loadout.o2, hud: document.getElementById('o2-max').textContent, cap: BDL.bagCap() }));
  const want = { o2Max: 160, staminaMax: 130, swimMul: 1.1 * 1.2, pull: 50, hookRange: 7.5, gripMul: 1.25, regenMul: 2, lampMul: 1.16, bagKg: 40, dmgMul: 1.65, dmgTaken: 0.85 };
  const bad = Object.keys(want).filter(k => Math.abs(sx.s[k] - want[k]) > 1e-9);
  check(tag + ': chỉ số: upg.hp=2 + hpMul 1,2 → O₂ tối đa = round(120) + 40 = 160', sx.s.o2Max === 160 && sx.o2 === 160 && sx.hud === '/160', 'o2Max ' + sx.s.o2Max + ', loadout ' + sx.o2 + ', HUD ' + sx.hud);
  check(tag + ': chỉ số: thể lực 130, tốc bơi ×1,32, sức kéo 50, tầm móc 5,5 + 2 = 7,5, dây bền ×1,25, hồi sức ×2, đèn ×1,16, túi 40 kg, sát thương ×1,65, nhận ×0,85', bad.length === 0 && sx.cap === 40, bad.length ? 'lệch: ' + bad.map(k => k + '=' + sx.s[k]).join(', ') : 'túi ' + sx.cap + ' kg');
  const lim = await page.evaluate(() => BDL_DEBUG.tether.info().limit);
  check(tag + ': dây dùng sức kéo mới (giới hạn = 7 N × 50)', lim === 350, String(lim));
  await page.evaluate(() => { const ca = BDL.run.ca; ca.upg = {}; ca.crew = null; BDL_DEBUG.items.refreshStats(); });

  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  check(tag + ': G.errors rỗng', (await page.evaluate(() => BDL_DEBUG.info().errors)).length === 0, (await page.evaluate(() => BDL_DEBUG.info().errors)).join(' | '));
}

// ============================================================================================================================
async function touchRun(browser, base) {
  const tag = 'cảm ứng';
  const { page, errors, ok } = await openPage(browser, base, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  check(tag + ': vào pha dive', ok);
  if (!ok) { check(tag + ': không lỗi trang', false, errors.slice(0, 3).join(' | ')); return; }
  await sleep(2500);
  await install(page);
  check(tag + ': body.touch', await page.evaluate(() => document.body.classList.contains('touch')));
  // gợi ý trên boong: chữ, không có ô phím
  const pr = await page.evaluate(() => { const p = document.getElementById('ship-prompt'), k = p.querySelector('.key'); return { on: p.classList.contains('on'), txt: p.querySelector('.txt').textContent, key: getComputedStyle(k).display, kind: BDL_DEBUG.ship.info().prompt }; });
  check(tag + ': boong hiện "Nhảy xuống nước" không kèm ô phím Space', pr.on && pr.kind === 'jump' && /Nhảy xuống nước/.test(pr.txt) && pr.key === 'none', JSON.stringify(pr));
  await page.screenshot({ path: path.join(SHOTS, 'touch-deck.png') });
  await page.evaluate(() => { const g = BDL_DEBUG.items.give; g('rifle'); g('bomb'); g('o2m'); g('float'); });
  await page.evaluate(() => BDL_DEBUG.ship.stand('locker'));
  await sleep(400);
  await page.evaluate(() => BDL.press('interact'));
  await sleep(500);
  const lk = await page.evaluate(() => { const p = document.getElementById('veilExtra').getBoundingClientRect(); return { open: BDL.locker.isOpen(), l: p.left, t: p.top, r: p.right, b: p.bottom, h: innerHeight, w: innerWidth, sh: document.getElementById('veilExtra').scrollHeight, ch: document.getElementById('veilExtra').clientHeight }; });
  check(tag + ': nút E ở tủ mở bảng, vừa khung 844×390', lk.open && lk.l >= 0 && lk.t >= 0 && lk.r <= lk.w && lk.b <= lk.h, JSON.stringify(lk));
  await page.screenshot({ path: path.join(SHOTS, 'touch-locker.png') });
  await page.tap('#locker [data-stash="0"]');
  await page.tap('#locker [data-stash="0"]');
  await page.tap('#locker [data-stash="0"]');
  const hs = await hand(page);
  check(tag + ': chạm 3 món → lên tay', hs.slots.join() === 'rifle:20,bomb:2,o2m:1', hs.slots.join());
  await page.screenshot({ path: path.join(SHOTS, 'touch-locker-hand.png') });
  await page.tap('#locker .lk-x');
  await sleep(300);
  check(tag + ': nút ✕ đóng tủ', !(await page.evaluate(() => BDL.locker.isOpen())));
  check(tag + ': Dave xuống nước', await (async () => { await page.evaluate(() => BDL_DEBUG.ship.jump()); return page.waitForFunction(() => !(HX.game.deck && HX.game.deck.on) && HX.game.diver.state === 'swim', null, { timeout: 15000 }).then(() => true, () => false); })());
  await sleep(500);
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return true; }; });
  // ô tay cầm chạm được
  const cell = n => page.tap('#hand .cell[data-i="' + n + '"]');
  await cell(2); await sleep(250);
  const a2 = (await hand(page)).active;
  await cell(2); await sleep(250);
  const a0 = (await hand(page)).active;
  check(tag + ': chạm ô 2 chọn bom, chạm lại về xiên', a2 === 2 && a0 === 0, a2 + ' → ' + a0);
  // nút đổi
  const seq = [];
  for (let i = 0; i < 4; i++) { await page.tap('#tb-swap'); await sleep(250); seq.push((await hand(page)).active); }
  check(tag + ': nút đổi chuyền 1 → 2 → 3 → xiên → 1', seq.join() === '1,2,3,0', seq.join());
  await cell(3); await sleep(250);
  await page.screenshot({ path: path.join(SHOTS, 'touch-hand-bar.png') });
  // dùng bình O₂ bằng nút bắn lớn
  await page.evaluate(() => BDL_DEBUG.hurt(60));
  const o2a = (await page.evaluate(() => __t.dave())).o2;
  await sleep(700);
  const fb = await page.evaluate(() => { const r = document.getElementById('tb-fire').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(fb.x, fb.y);
  await sleep(600);
  const o2b = (await page.evaluate(() => __t.dave())).o2;
  check(tag + ': nút bắn lớn dùng đồ đang cầm (bình O₂ +50)', Math.abs((o2b - o2a) - 50) < 1 && (await st(page)).slots[2] === null, fx(o2a) + ' → ' + fx(o2b));
  // ---- không có tự ngắm: chạm bắn không kéo = bắn thẳng mặt Dave, cá nằm phía trên không bị trúng ----
  await page.evaluate(() => { BDL_DEBUG.items.unequip(2); BDL_DEBUG.items.select(0); });
  await page.evaluate(() => { const i = BDL_DEBUG.items.state().stash.findIndex(x => x.key === 'rifle'); if (i >= 0) BDL_DEBUG.items.equip(i); });
  const col = await page.evaluate(() => __t.openColumn(1));
  await placeDave(page, col.x, col.y);
  await page.evaluate(() => { HX.game.diver.vulnerable = function () { return false; }; });
  const slotRifle = await page.evaluate(() => BDL.hand.slots.findIndex(e => e && e.key === 'rifle'));
  await cell(slotRifle + 1); await sleep(250);
  const above = await page.evaluate(c => {
    const G = HX.game, d = G.diver;
    G.fishes.drop(G.fishes.list.filter(q => Math.hypot(q.pos.x - d.pos.x, q.pos.y - d.pos.y) < 14));
    return BDL_DEBUG.foes.spawn('rook', d.pos.x, d.pos.y + 3, { asleep: true })[0];
  }, col);
  await sleep(300);
  const hpA = (await page.evaluate(id => __t.foe(id), above)).hp;
  const fb2 = await page.evaluate(() => { const r = document.getElementById('tb-fire').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(fb2.x, fb2.y);
  await sleep(1500);
  const sa = await st(page), fa = await page.evaluate(id => __t.foe(id), above);
  check(tag + ': chạm bắn súng trường không kéo cần: bắn thẳng, KHÔNG tự ngắm vào cá phía trên', sa.gunFired === 1 && fa.hp === hpA, 'bắn ' + sa.gunFired + ' phát, máu ' + hpA + ' → ' + fa.hp);
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    console.log('— PC 1280x720');
    await pcRun(browser, base);
    console.log('— cảm ứng 844x390');
    await touchRun(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
