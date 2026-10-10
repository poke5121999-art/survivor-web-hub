/*
 * Kiểm thử bộ vẽ Spine + Golem - Tổ Tiên (games/soulknight/js/spine.js, js/bosses/boss_stone_man.js, art/spine/boss_stone_man/*).
 * Chạy: PLAYWRIGHT_PATH=... node test/soulknight-spine.js   (tự mở máy chủ tĩnh ở gốc repo; cần mạng tới cdn.jsdelivr.net cho spine-canvas)
 * Ảnh: $SK_SHOTS hoặc <tmp>/soulknight-spine/.
 *
 * 1. Tệp Spine nạp được: phiên bản 4.2.40, 24 xương, 31 slot, 20 animation [ĐO tệp .skel]; thư viện spine-canvas@4.2.40.
 * 2. Vẽ ra canvas: có điểm ảnh khác nền ở chỗ trùm; hai animation khác nhau cho hai ảnh khác nhau.
 * 3. Trong game (ép 4A, tới 4-5, SK.bossDebug.force): máu 1440 theo wiki; trùm vẽ lên canvas game (so khung ẩn/hiện trùm);
 *    đổi animation khi tấn công (idle → tiền laser / nổ đất ... ); mỗi đòn chạy trọn rồi trở lại idle;
 *    dưới 50% máu sang pha 2 (变身 → 地形摧毁 → 二阶段-待机); hạ được: phòng mở, qua cổng thắng.
 * Số trong bảng chép tay từ dữ liệu gốc (wiki 1440 máu, tệp skel 4.2.40) nên kiểm thử không dùng chung giả định với mã.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const REPO = path.join(__dirname, '..');
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-spine');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.css': 'text/css' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(REPO)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); } });
    }).listen(0, () => res(srv));
  });
}

// Chụp canvas game ra mảng điểm ảnh (so sánh hai khung)
const snap = p => p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = document.querySelector('canvas'), t = document.createElement('canvas');
  t.width = c.width; t.height = c.height;
  const x = t.getContext('2d'); x.drawImage(c, 0, 0);
  res(Array.from(x.getImageData(0, 0, t.width, t.height).data));
}))));
const diffPx = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n; };

(async () => {
  const srv = await serve();
  const URL = 'http://localhost:' + srv.address().port + '/games/soulknight/index.html?quick=1';
  const b = await chromium.launch();
  const errs = [];
  try {
    // ---- 1 + 2: tệp Spine và bộ vẽ
    const p0 = await b.newPage({ viewport: { width: 800, height: 600 } });
    p0.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p0.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p0.goto(URL);
    await p0.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
    const lazyBefore = await p0.evaluate(() => !window.spine && !SK.stoneMan.ready);
    await p0.evaluate(() => SK.stoneMan.load());
    const ready = await until(p0, () => SK.stoneMan.ready || SK.stoneMan.error, null, 15000);
    const st = await p0.evaluate(() => ({ ok: SK.spine.ok, ready: !!SK.stoneMan.ready, err: SK.stoneMan.error || SK.spine.error || null, lib: !!window.spine, reg: !!SK.BOSS_AIS.boss_stone_man }));
    check('nạp lười: mở trang chưa tải spine-canvas/rig', lazyBefore);
    check('nạp spine-canvas 4.2.40 từ CDN và đăng ký trùm', ready && st.ok && st.ready && st.reg, JSON.stringify(st));
    const info = await p0.evaluate(() => { const r = SK.stoneMan.rig; return { ver: r.data.version, c: r.counts, anims: Object.keys(r.anims).length }; });
    check('tệp .skel đọc được: Spine 4.2.40, 24 xương, 31 slot, 20 animation, 8 sự kiện',
      info.ver === '4.2.40' && info.c.bones === 24 && info.c.slots === 31 && info.anims === 20 && info.c.events === 8, JSON.stringify(info));

    const draw = await p0.evaluate(() => {
      const rig = SK.stoneMan.rig, PX = SK.stoneMan.PX;
      const hashes = {}, out = {};
      for (const [k, name, t] of [['idle', '一阶段-待机', 0.5], ['laser', '一阶段-磁力激光前摇', 1.5], ['quake', '一阶段-铁山崩裂', 2.2], ['p2', '二阶段-待机', 0.5]]) {
        const c = document.createElement('canvas'); c.width = 500; c.height = 400;
        const x = c.getContext('2d'); x.fillStyle = '#68d7de'; x.fillRect(0, 0, 500, 400);
        const I = rig.make(PX); I.play(name, false); I.update(0); I.update(t);
        I.draw(x, 250, 380, {});
        const d = x.getImageData(0, 0, 500, 400).data;
        let n = 0, s = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] !== 0x68 || d[i + 1] !== 0xd7 || d[i + 2] !== 0xde) { n++; s = (s * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13 + (i >> 2)) >>> 0; }
        // điểm ngay giữa thân (cao 6 đơn vị trên chân) phải khác nền
        const mid = x.getImageData(250, 380 - 6 * 16, 1, 1).data;
        out[k] = { n, mid: [mid[0], mid[1], mid[2]], s };
      }
      return out;
    });
    check('vẽ Spine ra canvas: có điểm ảnh khác nền, giữa thân khác màu nền', Object.values(draw).every(v => v.n > 5000 && !(v.mid[0] === 0x68 && v.mid[1] === 0xd7 && v.mid[2] === 0xde)), Object.entries(draw).map(([k, v]) => k + ' ' + v.n + 'px').join(' '));
    check('animation khác nhau cho ảnh khác nhau', new Set(Object.values(draw).map(v => v.s)).size === 4);
    await p0.close();

    // ---- 3: trong game
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' || (m.type() === 'warning' && /\[SK\].*(boss|spine|AI class)/i.test(t))) errs.push(m.type() + ': ' + t);
    });
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
    await p.evaluate(() => { SK_GAME.debug.seed(20261010); SK.on('playerHurt', () => { window.__hurt = (window.__hurt || 0) + 1; }); });
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 5000);
    await p.evaluate(() => {
      SK_GAME.debug.god(true); SK_GAME.debug.pet(false);
      SK.floor4.force = 'monolith'; SK.floor4.extend(SK.STAGES);
      SK.bossDebug.force = 'boss_stone_man'; SK.bossDebug.hold = true;
    });
    const staged = await p.evaluate(() => SK_GAME.debug.stage('4-5'));
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    check('ép 4A: vào 4-5', staged && (await p.evaluate(() => SK.G.stage.theme)) === 'monolith');
    await p.evaluate(() => SK_GAME.debug.teleportTo('boss'));
    const spawned = await until(p, () => SK.G.enemies.some(e => e.bossKey === 'boss_stone_man'), null, 8000);
    check('4-5 gặp Golem - Tổ Tiên', spawned);
    await sleep(1200);
    await p.screenshot({ path: path.join(SHOTS, 'intro.png') });
    await until(p, () => SK.bossHud.visible, null, 9000);
    const hp = await p.evaluate(() => Math.round(SK.G.enemies.find(e => e.bossKey).hpMax));
    check('máu trùm theo wiki: 1440', hp === 1440, String(hp));

    // trùm vẽ lên canvas game: so khung ẩn trùm với khung hiện trùm
    await sleep(1500);
    const hidden = await p.evaluate(() => { SK.G.enemies.find(e => e.bossKey).hidden = true; return true; });
    const A = await snap(p);
    await p.evaluate(() => { SK.G.enemies.find(e => e.bossKey).hidden = false; });
    const B = await snap(p);
    const dpx = diffPx(A, B);
    check('trùm vẽ lên canvas game (khung hiện khác khung ẩn)', hidden && dpx > 8000, dpx + ' điểm ảnh khác');
    await p.screenshot({ path: path.join(SHOTS, 'idle.png') });

    // mỗi đòn: đổi animation, chạy trọn, trở lại idle. Đưa người chơi sang bên cạnh để đo, rồi theo dõi.
    const probe = (atk, ms) => p.evaluate(([atk, ms]) => new Promise(res => {
      const G = SK.G, e = G.enemies.find(x => x.bossKey), P = G.player, seen = new Set(), t0 = performance.now();
      const [x, y] = SK.freeNear([e.x + 70, e.y + 60]); P.x = x; P.y = y;
      for (const b of G.bullets) if (b.side === 'e') b.dead = true;
      const anims = [], h0 = window.__hurt || 0, o0 = e.arena.objs.length;
      let stones = 0, objMax = o0;
      SK.bossDebug.next = atk; SK.bossDebug.hold = false; e.cd = 0; e.busy = 0;
      (function tick() {
        const c = e.sp.cur; if (c && anims[anims.length - 1] !== c) anims.push(c);
        for (const b of G.bullets) if (b.pname === 'stone_man_bullet' && !seen.has(b)) { seen.add(b); stones++; }
        objMax = Math.max(objMax, e.arena.objs.length);
        if (performance.now() - t0 < ms && !(e.lastAtk === atk && !e.atk && !e.sa && anims.length > 1 && performance.now() - t0 > 800)) requestAnimationFrame(tick);
        else { SK.bossDebug.hold = true; res({ anims, stones, objMax, o0, hurt: (window.__hurt || 0) - h0, ended: !e.atk, used: e.lastAtk, last: e.sp.cur }); }
      })();
    }), [atk, ms]);

    const expectAnim = { laser: '一阶段-磁力激光前摇', quake: '一阶段-铁山崩裂', stones: '一阶段大范围攻击', jab: '一阶段-刺拳出击' };
    for (const atk of ['laser', 'quake', 'stones', 'jab']) {
      await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey); return !e.atk && !e.xf && e.sp.cur === '一阶段-待机' && e.arena.introT >= 3; }, null, 12000);
      const r = await probe(atk, 9000);
      check('đòn ' + atk + ': animation đổi ' + expectAnim[atk] + ' rồi về idle', r.used === atk && r.anims.includes(expectAnim[atk]) && r.ended && r.last === '一阶段-待机', JSON.stringify(r.anims) + ' cuối ' + r.last);
      if (atk === 'stones') check('đòn stones: sinh đá lăn (>= 20 viên, 8 hàng × 8 viên)', r.stones >= 20, r.stones + ' viên');
      if (atk === 'quake' || atk === 'jab') check('đòn ' + atk + ': có vùng báo trước/nổ', r.objMax > r.o0, 'vật sàn đấu ' + r.o0 + '→' + r.objMax);
      if (atk === 'laser') {
        await p.screenshot({ path: path.join(SHOTS, 'laser-end.png') });
      }
    }
    // chụp lúc laser đang quét và lúc nổ đất
    await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey); return !e.atk && e.sp.cur === '一阶段-待机'; }, null, 12000);
    await p.evaluate(() => { SK.bossDebug.next = 'laser'; SK.bossDebug.hold = false; const e = SK.G.enemies.find(x => x.bossKey); e.cd = 0; e.busy = 0; });
    await until(p, () => SK.G.enemies.find(x => x.bossKey).sp.cur === '一阶段-磁力激光发射状态', null, 6000);
    await sleep(900);
    await p.evaluate(() => { SK.bossDebug.hold = true; });
    await p.screenshot({ path: path.join(SHOTS, 'laser.png') });
    await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey); return !e.atk && e.sp.cur === '一阶段-待机'; }, null, 8000);

    // pha 2
    await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); e.hp = Math.floor(e.hpMax * 0.49); });
    const seq = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const s = await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); return { c: e.sp.cur, p2: e.p2, xf: !!e.xf }; });
      if (seq[seq.length - 1] !== s.c) seq.push(s.c);
      if (s.p2 && !s.xf && s.c === '二阶段-待机') break;
      if (seq.includes('变身') && !seq.includes('地形摧毁')) await p.screenshot({ path: path.join(SHOTS, 'transform.png') });
      await sleep(80);
    }
    check('dưới 50% máu: 变身 → 地形摧毁 → 二阶段-待机', seq.join('>').includes('变身>地形摧毁>二阶段-待机'), seq.join(' > '));
    await p.screenshot({ path: path.join(SHOTS, 'phase2.png') });
    const expect2 = { laser: '二阶段-磁力激光前摇', quake: '二阶段-铁山崩裂', slam: '二阶段-重拳出击x2', pound: '二阶段大范围攻击', jab: '二阶段-刺拳出击x2' };
    for (const atk of ['laser', 'quake', 'slam', 'pound', 'jab']) {
      await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey); return !e.atk && !e.xf && e.sp.cur === '二阶段-待机'; }, null, 12000);
      const r = await probe(atk, 12000);
      check('pha 2 đòn ' + atk + ': ' + expect2[atk] + ' rồi về 二阶段-待机', r.used === atk && r.anims.includes(expect2[atk]) && r.ended && r.last === '二阶段-待机', JSON.stringify(r.anims));
    }

    // hạ trùm bằng đường thật: hurtEnemy → enemyKill → phòng mở
    await p.evaluate(() => { SK.bossDebug.hold = false; for (const e of SK.G.enemies) if (e.bossKey) SK.hurtEnemy(SK.G, e, 1e6, false, 0, 0); });
    await sleep(500);
    const dead = await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); return { st: e.st, cur: e.sp.cur }; });
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, 'death.png') });
    check('hạ được trùm: chạy clip 死亡', dead.st === 'dead' && dead.cur === '死亡', JSON.stringify(dead));
    const cleared = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 15000);
    check('hạ trùm → phòng trùm mở', cleared);
    await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
    await sleep(300);
    await p.keyboard.down('KeyW');
    let won = false; const t1 = Date.now();
    while (Date.now() - t1 < 12000) {
      const s = await p.evaluate(() => ({ state: SK_GAME.state, buffs: SK.ROOMS.choice.open }));
      if (s.state === 'victory') { won = true; break; }
      if (s.buffs) await p.keyboard.press('Digit1');
      await sleep(150);
    }
    await p.keyboard.up('KeyW');
    check('qua cổng sau 4-5 → chiến thắng', won);
    await p.close();
  } catch (e) { check('chạy trọn', false, String(e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close(); srv.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
