/*
 * HỐ XANH — cá mập 3D (js/shark.js, art/shark/*.glb, data/shark_assets.js).
 *
 * Chạy:  node test/ho-xanh-shark.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-shark-shots): cá mập bơi, quay đầu, lao cắn, mắc xiên, đang chết, xác,
 * đủ 12 loài xếp hàng. Mở ra xem.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-shark-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
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

async function run(browser, base, W, H, full) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const gameWait = (sec) => page.evaluate(s => new Promise(res => { const t0 = HX.game.t; (function w() { if (HX.game.t - t0 >= s) res(); else requestAnimationFrame(w); })(); }), sec);

  await page.goto(base + '/games/ho-xanh/index.html?route=A01,B01,C03&theme=day&fresh=1');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'title');
  await page.click('#start');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'prep');
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 30000 });
  await page.evaluate(() => { HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish(); });

  // Chỗ nước trống, thoáng 9 m bên phải Dave.
  const spot = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 10; y > -30; y -= 0.7) for (let x = -40; x < 30; x += 0.9) {
      if (!W.open(x, y, 1.6)) continue;
      let ok = true;
      for (let k = 1; k <= 9 && ok; k++) ok = W.open(x + k, y, 1.6);
      if (ok && !W.raycast(x, y, x + 9, y) && !W.raycast(x, y + 1.2, x + 9, y + 1.2) && !W.raycast(x, y - 1.2, x + 9, y - 1.2)) return { x, y };
    }
    return null;
  });
  check('tìm được chỗ nước trống thoáng 9 m', !!spot, JSON.stringify(spot));
  if (!spot) { await page.close(); return; }
  // Đặt Dave ở chỗ trống, thả một con cá mập cách dx m. calm: chưa được cắn (biteCd lớn), không đuổi.
  const home = async () => {
    await page.waitForFunction(() => ['swim', 'hurt'].includes(HX_DEBUG.info().dave.state), null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(s => {
      HX.game.harpoon.drop();
      HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0;
      HX_DEBUG.setO2(100); HX.game.diver.invuln = 0; if (HX.game.diver.state !== 'swim') HX.game.diver.go('swim');
    }, spot);
  };
  const spawn = (id, dx, face, calm, opts) => page.evaluate(a => {
    const G = HX.game, f = HX.Shark.create(G, a.id, a.s.x + a.dx, a.s.y, a.opts);
    f.facing = f.flip = a.face;
    if (a.calm) { f.biteCd = 1e9; f.frozen = true; }
    G.fishes.list.push(f);
    window.__shark = f;
    return f.id;
  }, { id, dx, face, calm, s: spot, opts: opts || null });
  const loaded = () => page.waitForFunction(() => window.__shark && window.__shark.mixer && window.__shark.cur, null, { timeout: 20000 }).then(() => true, () => false);
  // Hướng mô hình thật trong cảnh: vị trí thế giới của xương đầu so với xương đuôi (GLTFLoader đổi dấu cách thành "_").
  const headDir = () => page.evaluate(() => {
    const f = window.__shark, v = new THREE.Vector3();
    const h = f.root.getObjectByName('Bip001_Head'), t = f.root.getObjectByName('Bip001_Tail');
    f.root.updateMatrixWorld(true);
    const hx = h.getWorldPosition(v).x, tx = t.getWorldPosition(v).x;
    return Math.sign(hx - tx);
  });
  const S = () => page.evaluate(() => {
    const f = window.__shark;
    return { state: f.state, hp: f.hp, facing: f.facing, clip: f.clipName, t: f.cur ? +f.cur.time.toFixed(3) : null, x: +f.pos.x.toFixed(2), y: +f.pos.y.toFixed(2) };
  });

  // ---- số liệu gốc ----
  const data = await page.evaluate(() => {
    const W = HX.Shark.BY_ID.Whitetip_Reefshark, T = HX.Shark.BY_ID.Tiger_Shark;
    return { n: HX.Shark.ids.length, wHp: W.hp, wDmg: W.damage, tHp: T.hp, tDmg: T.damage, inFish: !!HX.fish.BY_ID.Whitetip_Reefshark,
      notSpawner: !HX.fish.SPECIES.some(s => s.shark), vi: HX.fish.displayName(W), harpoon: HX.game.loadout.harpoon,
      tid55: (k => k && k.id + ':' + k.night)(HX.Shark.forTid(2010055)), tid224: (k => k && k.id + ':' + k.night)(HX.Shark.forTid(2010224)), tid61: HX.Shark.forTid(2010061) };
  });
  check('12 loài cá mập Hố Xanh có trong HX.Shark', data.n === 12, data.n);
  check('tra TID của bộ sinh cá: 2010055 = vây trắng bản đêm, 2010224 (nhiệm vụ) = cá mập miệng to, 2010061 không phải cá mập', data.tid55 === 'Whitetip_Reefshark:true' && data.tid224 === 'Megamouth_Shark:false' && data.tid61 === null, JSON.stringify([data.tid55, data.tid224, data.tid61]));
  check('cá mập rạn vây trắng: HP 95, cắn 25 (FishInfoData 2010025)', data.wHp === 95 && data.wDmg === 25, data.wHp + '/' + data.wDmg);
  check('cá mập hổ: HP 175, cắn 40 (FishInfoData 2010119)', data.tHp === 175 && data.tDmg === 40, data.tHp + '/' + data.tDmg);
  check('cá mập có trong HX.fish.BY_ID nhưng không vào danh sách bộ sinh cá Spine', data.inFish && data.notSpawner);
  check('tên hiển thị tiếng Việt', data.vi === 'Cá mập rạn vây trắng', data.vi);
  check('súng xiên sổ mới: 3 sát thương mỗi phát', data.harpoon === 3, data.harpoon);

  // ---- bơi ----
  await home();
  await spawn('Whitetip_Reefshark', 6, -1, true);
  check('glb cá mập rạn vây trắng nạp xong, mixer chạy', await loaded());
  await gameWait(1.2);
  let s0 = await S();
  await gameWait(0.4);
  let s1 = await S();
  check('đang bơi: clip Swim gốc chạy, thời gian clip tăng', s0.state === 'wander' && /_Swim_[ABC]_01$/.test(s1.clip) && s1.t !== s0.t, JSON.stringify([s0, s1]));
  check('mô hình quay đầu đúng hướng facing -1 (xương đầu bên trái xương đuôi)', await headDir() === -1);
  await shot('1-swim');

  // ---- quay đầu bằng clip SwimTurn ----
  const turn = await page.evaluate(() => {
    const f = window.__shark;
    f.face(1);
    return { clip: f.clipName, len: f.turnLen, facing: f.facing };
  });
  check('đổi hướng: chạy clip SwimTurn gốc, hướng chưa lật ngay', /_SwimTurn_A_01$/.test(turn.clip) && turn.facing === -1 && Math.abs(turn.len - 1.3333) < 0.01, JSON.stringify(turn));
  await gameWait(0.6);
  if (full) await shot('2-turn');
  await gameWait(0.9);
  const after = await S();
  check('hết 1,33 giây clip quay: facing +1, mô hình quay đầu sang phải', after.facing === 1 && await headDir() === 1, JSON.stringify(after));

  // ---- lao tới cắn: Dave mất đúng Damage gốc ----
  await home();
  await spawn('Whitetip_Reefshark', 5.5, -1, true);   // chưa cho cắn tới khi gắn xong bộ ghi
  await loaded();
  await page.evaluate(() => {
    const d = HX.game.diver, orig = d.hurt;
    window.__hurt = []; window.__fx = {};
    const f = window.__shark, play = f.playFx;
    f.playFx = function (key, bone) { window.__fx[key + '@' + bone] = f.clipName; return play.call(this, key, bone); };
    d.hurt = function (dmg, x, y) { const o2 = this.o2, ok = orig.call(this, dmg, x, y); if (ok) window.__hurt.push({ dmg, o2: o2, after: this.o2, state: window.__shark.state, clip: window.__shark.clipName }); return ok; };
    f.biteCd = 0; f.frozen = false;
  });
  await page.waitForFunction(() => window.__shark.state === 'charge', null, { timeout: 15000 }).catch(() => {});
  await gameWait(0.3);
  if (full) await shot('3-charge');
  const bitten = await page.waitForFunction(() => window.__hurt.length > 0, null, { timeout: 15000 }).then(() => true, () => false);
  if (full) await shot('3-attack');
  const hurt = await page.evaluate(() => window.__hurt[0] || null);
  check('cá mập đuổi, lao tới và cắn Dave', bitten, JSON.stringify(await S()));
  check('một cú cắn trừ đúng 25 dưỡng khí (Damage gốc)', hurt && hurt.dmg === 25 && Math.abs(hurt.o2 - hurt.after - 25) < 1e-6, JSON.stringify(hurt));
  check('cú cắn là clip QTE_Ready gốc (lao có root motion)', hurt && hurt.state === 'attack' && /_QTE_Ready_A_01$/.test(hurt.clip), hurt && hurt.clip);
  const fx = await page.evaluate(() => ({ played: window.__fx, live: HX_DEBUG.info().fx.filter(n => /^shark:/.test(n)) }));
  check('lúc lao (Sprint) bật hạt gốc gắn xương: vệt vây hai bên, vệt đuôi, bọt thân (Whitetip_Reefshark01_Renew_AnimationEvent)',
    fx.played['VFX_Whitetip_Reefshark01_Fin_A_01@Bip001 fin_L02'] === 'Ani3D_Whitetipshark_Normal_Sprint_A_01' &&
    fx.played['VFX_Whitetip_Reefshark01_Fin_A_01@Bip001 fin_R02'] && fx.played['VFX_Whitetip_Reefshark01_Attack_01@Bip001 Tail_Top'] &&
    fx.played['VFX_Whitetip_Reefshark01_Body_A_01_StrongSprint@Bip001'], JSON.stringify(fx));
  check('cú lao QTE_Ready bật bộ hạt riêng của clip (Fin_A_02)', fx.played['VFX_Whitetip_Reefshark01_Fin_A_02@Bip001 fin_L02'] === 'Ani3D_Whitetipshark_QTE_Ready_A_01');
  await gameWait(2.2);
  const rec = await S();
  check('sau cú cắn cá mập bơi bỏ đi (recover) hoặc lượn tiếp, không cắn liền', ['recover', 'wander'].includes(rec.state) && (await page.evaluate(() => window.__hurt.length)) === 1, rec.state);
  await page.evaluate(() => { delete HX.game.diver.hurt; });

  // ---- xiên: 12 phát còn sống, phát thứ 13 (HP 56 ≤ 60%) thì giằng co ----
  await home();
  await spawn('Whitetip_Reefshark', 4, -1, true);
  await loaded();
  await gameWait(0.3);
  const hps = [];
  for (let i = 0; i < 13; i++) {
    const c = await page.evaluate(() => { const c = window.__shark.center(); return HX_DEBUG.worldToScreen(c.x, c.y); });
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await gameWait(0.45);   // RangeWeaponDraw gốc 0,3 giây (giờ trong game): thả sớm hơn là súng chưa rút xong
    await page.mouse.up();
    await page.waitForFunction(() => ['returning', 'stuck'].includes(HX.game.harpoon.state), null, { timeout: 3000 }).catch(() => {});
    hps.push(await page.evaluate(() => window.__shark.hp));
    if (i < 12) {
      await page.waitForFunction(() => HX.game.harpoon.state === 'ready', null, { timeout: 4000 }).catch(() => {});
      await page.evaluate(s => { const f = window.__shark; f.pos.x = s.x + 4; f.pos.y = s.y; f.vel.x = f.vel.y = 0; if (f.state !== 'wander') f.go('wander'); f.biteCd = 1e9; f.angry = 0; HX_DEBUG.teleport(s.x, s.y); }, spot);
    }
  }
  const expect = [92, 89, 86, 83, 80, 77, 74, 71, 68, 65, 62, 59, 56];
  check('mỗi phát xiên trừ 3 HP: 95 → 56 sau 13 phát', JSON.stringify(hps) === JSON.stringify(expect), JSON.stringify(hps));
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'tug', null, { timeout: 2000 }).catch(() => {});
  let st = await S();
  const dstate = (await page.evaluate(() => HX_DEBUG.info())).dave.state;
  check('phát 13 (HP 56 ≤ 57): cá mập mắc xiên, Dave giằng co', st.state === 'hooked' && dstate === 'tug', st.state + ' / ' + dstate);
  // cá mập đang quay mặt về Dave: quay đầu (SwimTurn 1,33 giây) rồi vùng vẫy chạy ra xa.
  // Thanh giằng co tụt 0,16/giây từ 0,35: nâng lên để quan sát được 1,8 giây mà chưa thua.
  await page.evaluate(() => { HX.game.diver.data.gauge = 0.9; HX.game.diver.data.time = 4; });
  await gameWait(1.8);
  st = await S();
  check('mắc xiên: quay đầu rồi vùng vẫy bằng clip Sprint gốc, không chạy quá tầm dây 5,5 m', /_Sprint_A_01$/.test(st.clip) &&
    (await page.evaluate(() => Math.hypot(window.__shark.pos.x - HX.game.diver.pos.x, window.__shark.pos.y - HX.game.diver.pos.y))) <= 5.5 + 1e-6, st.clip);
  if (full) await shot('4-hooked');
  // thắng giằng co: mỗi lần bấm chỉ đẩy 0,075 × max(0,2; 12/HP) = 0,016 với cá mập còn 56 HP, nên đặt thanh sát đầy rồi bấm Space thật
  for (let k = 0; k < 12 && (await S()).state === 'hooked'; k++) {
    await page.evaluate(() => { const d = HX.game.diver; d.data.gauge = 0.998; d.data.time = 3; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); }); await gameWait(0.12);
  }
  await page.waitForFunction(() => window.__shark.state === 'dying', null, { timeout: 3000 }).catch(() => {});
  st = await S();
  check('thắng giằng co: cá mập cỡ 2 chết thành xác (dying), không theo dây về', st.state === 'dying' && st.hp === 0 && /_Die_A_01$/.test(st.clip), JSON.stringify(st) + ' dave ' + JSON.stringify(await page.evaluate(() => ({ s: HX.game.diver.state, g: HX.game.diver.data.gauge, t: HX.game.diver.data.time, hf: !!HX.game.harpoon.fish, hs: HX.game.harpoon.state }))));
  await gameWait(1.2);
  if (full) await shot('5-dying');
  await gameWait(2.5);
  st = await S();
  check('hết clip Die 3,5 giây: thành xác (dead), nhặt được', st.state === 'dead' && (await page.evaluate(() => window.__shark.corpse() && window.__shark.carvable())), st.state);
  if (full) await shot('6-dead');

  // ---- xả thịt xác: giữ E 2,2 giây, vào túi ----
  await page.evaluate(() => { const f = window.__shark, c = f.center(); HX_DEBUG.teleport(c.x - 0.3, c.y); HX.game.catches.length = 0; });
  await sleep(200);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => HX.game.catches.length > 0, null, { timeout: 12000 }).catch(() => {});
  await page.keyboard.up('KeyE');
  const got = await page.evaluate(() => ({ catches: HX.game.catches.slice(), card: (document.getElementById('cc-name') || {}).textContent, dave: HX.game.diver.state, anim: HX.game.diver.animName, reach: !!HX.game.diver.corpseInReach(), shark: window.__shark.state, inList: HX.game.fishes.list.includes(window.__shark) }));
  check('xả thịt xác cá mập: túi có Whitetip_Reefshark, thẻ tên tiếng Việt', got.catches[0] === 'Whitetip_Reefshark' && got.card === 'Cá mập rạn vây trắng', JSON.stringify(got));
  if (full) await shot('7-carved');

  // ---- dao: trúng thân cá mập, trừ đúng sát thương dao ----
  await home();
  await spawn('Tiger_Shark', 1.6, -1, true);
  await loaded();
  const knife = await page.evaluate(async () => {
    const G = HX.game, f = window.__shark, hp0 = f.hp;
    G.fishes.knife(f.center().x, f.center().y, 0.75, G.loadout.knife);
    return { hp0, hp: f.hp, dmg: G.loadout.knife, state: f.state };
  });
  check('dao trúng cá mập hổ: HP 175 − sát thương dao, cá mập quay sang đuổi', knife.hp0 === 175 && knife.hp === 175 - knife.dmg && knife.state === 'chase', JSON.stringify(knife));

  // ---- bản đêm: số của TID đêm ----
  await home();
  const night = await page.evaluate(s => {
    const f = HX.Shark.create(HX.game, 'Tiger_Shark', s.x + 6, s.y, { night: true }), r = { hp: f.hp, dmg: f.sp.damage };
    f.remove();
    return r;
  }, spot);
  check('cá mập hổ đêm (2010128): HP 350, cắn 60', night.hp === 350 && night.dmg === 60, JSON.stringify(night));

  // ---- đủ 11 loài nạp và bơi, không lỗi ----
  if (full) {
    const ids = await page.evaluate(() => HX.Shark.ids);
    const res = [];
    for (let i = 0; i < ids.length; i += 3) {
      await home();
      await page.evaluate(a => {
        const G = HX.game;
        a.ids.forEach((id, k) => {
          const f = HX.Shark.create(G, id, a.s.x + 1 + k * 0.2, a.s.y + 3.2 - k * 3.2);
          f.facing = f.flip = 1; f.biteCd = 1e9; f.frozen = true;
          G.fishes.list.push(f);
        });
      }, { ids: ids.slice(i, i + 3), s: spot });
      await page.waitForFunction(() => HX.game.fishes.list.every(f => f.mixer && f.cur), null, { timeout: 20000 }).catch(() => {});
      await gameWait(0.8);
      res.push(...await page.evaluate(() => HX.game.fishes.list.map(f => ({ id: f.sp.id, ok: !!(f.mixer && f.cur), clip: f.clipName }))));
      await shot('8-lineup-' + (i / 3 + 1));
    }
    const okAll = res.filter(r => r.ok && /Swim/.test(r.clip)).map(r => r.id);
    check('đủ 12 loài nạp glb và chạy clip bơi', okAll.length === 12, okAll.length + ' ' + JSON.stringify(res.filter(r => !r.ok)));
    const icons = await page.evaluate(() => Promise.all(HX.Shark.ids.map(id => new Promise(res => {
      const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0);
      im.src = HX.fish.iconFor(HX.game.gfx, HX.fish.BY_ID[id]);
    }))));
    check('ảnh nhỏ ItemIcon gốc của cả 12 loài (64 px × 3)', icons.every(n => n === 192), JSON.stringify(icons));
  }

  const info = await page.evaluate(() => HX_DEBUG.info());
  check('không lỗi trang, không 404', errors.length === 0 && info.errors.length === 0, errors.concat(info.errors).slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    await run(browser, base, 1280, 720, true);
    await run(browser, base, 844, 390, false);   // điện thoại ngang: cùng hành vi, chỉ chụp lúc bơi
  } catch (e) {
    fail++; out.push('  ✘ lỗi chạy bài kiểm: ' + (e && e.stack || e));
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
