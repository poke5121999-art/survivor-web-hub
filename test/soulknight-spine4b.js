/*
 * Kiểm thử 4 trùm 4B Chiến Trường Cổ: Lý Thôi, Hoa Hùng (4-3), Đổng Trác, Vũ Khí Cuối Cùng 01 (4-5).
 * (games/soulknight/js/bosses/boss_{lijue,huaxiong,dongzhuo,lvbu}.js, art/spine/<trùm>/data.js, js/floor4.js)
 * Chạy: PLAYWRIGHT_PATH=... node test/soulknight-spine4b.js   (tự mở máy chủ tĩnh ở gốc repo; không cần mạng: rig sprite, không phải Spine)
 * Ảnh: $SK_SHOTS hoặc <tmp>/soulknight-spine4b/.
 *
 * Mỗi trùm (ép vùng 4B bằng SK.floor4.force, tới đúng ải 4-3 / 4-5, ép trùm bằng SK.bossDebug.force):
 *  1. nạp được: AI đăng ký, rig đủ số nút (đếm tay từ bundle), khung hình của prefab gốc có trong atlas;
 *  2. vẽ ra canvas có điểm ảnh (rig vẽ riêng từng clip) và trong game (khung hiện khác khung ẩn trùm);
 *  3. máu theo wiki (Lý Thôi 1320, Hoa Hùng 1440, Đổng Trác 2160, Vũ Khí 01 1800);
 *  4. từng đòn (SK.bossDebug.next): đổi animation đúng các state của clip gốc, chạy trọn rồi trở lại idle, tạo đúng loại đạn/vật;
 *  5. hạ được: máu về 0, trùm chết, phòng mở; Đổng Trác sang pha 2 ở 50% máu (bất tử khi đổi);
 *  6. không ép trùm: 4-3 gặp Lý Thôi hoặc Hoa Hùng, 4-5 gặp Đổng Trác hoặc Vũ Khí 01 (đúng bể 4B).
 * Số chép tay từ bundle/wiki, không đọc lại từ mã trùm.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const REPO = path.join(__dirname, '..');
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-spine4b');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const results = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); } return false; }
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
const snap = p => p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = document.querySelector('canvas'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
  const x = t.getContext('2d'); x.drawImage(c, 0, 0); res(Array.from(x.getImageData(0, 0, t.width, t.height).data));
}))));
const diffPx = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) n++; return n; };

// [stage, hp wiki, số nút rig, khung gốc, clip vẽ thử, đòn: {tên: {states: các state clip bắt buộc, bul/obj/hurt: dấu hiệu}}]
const BOSSES = {
  boss_lijue: { stage: '4-3', hp: 1320, nodes: 10, frame: 'boss_1_0', clips: ['idle', 'run', 'skill_1_0', 'skill_2_0', 'skill_3_0', 'dead'], p2: false,
    atks: { slash: { st: ['skill_1_0', 'skill_1_1', 'skill_1_2'], near: true, hurt: true },
      red: { st: ['skill_2_0', 'skill_2_1', 'skill_2_2'], bul: { boss_lijue_qi: 3 } },
      trail: { st: ['skill_3_0', 'skill_3_1'], bul: { boss_lijue_bullet: 9, boss_lijue_bullet_child: 1 } } } },
  boss_huaxiong: { stage: '4-3', hp: 1440, nodes: 10, frame: 'boss_0_0', clips: ['idle', 'skill_1', 'skill_2', 'skill_3', 'dead'], p2: false,
    atks: { slash: { st: ['skill_1'], near: true, hurt: true },
      whirl: { st: ['skill_3_start', 'skill_3', 'skill_3_end'], bul: { bullet_e_1: 100 } },
      slam: { st: ['skill_2'], bul: { bullet_e_1: 18 }, ms: 7000 } } },
  boss_dongzhuo: { stage: '4-5', hp: 2160, nodes: 43, frame: 'boss_2_0', clips: ['idle', 'run', 'change_state', 'idle_1', 'skill_cannon', 'skill_laser_loop', 'dead'], p2: true,
    atks: { homing: { st: ['idle', 'atk'], bul: { bullet_e_1: 8 } }, surround: { st: ['idle', 'atk'], bul: { bullet_e_1: 200 } },
      beer: { st: ['idle', 'eat'], obj: true, ms: 9000 }, maid: { st: ['idle', 'atk'], obj: true }, statue: { st: ['idle', 'atk'], obj: true },
      laser: { st: ['skill_laser_start', 'skill_laser_loop', 'skill_laser_end'], p2: true, hurtOrObj: true },
      runestone: { st: ['skill_cannon'], p2: true, obj: true },
      rings: { st: ['idle_1', 'atk'], p2: true, bul: { bullet_e_1: 90 } }, trail: { st: ['idle_1', 'atk'], p2: true, bul: { bullet_e_1: 4 } } } },
  boss_lvbu: { stage: '4-5', hp: 1800, nodes: 13, frame: 'boss_3_0', clips: ['idle', 'skill_1_0', 'skill_2_1_idle', 'skill_4_0', 'skill_5_prepare', 'dead'], p2: false,
    atks: { combo: { st: ['skill_1_0', 'skill_1_1', 'skill_1_2'], near: true, hurt: true },
      bigslam: { st: ['skill_1_2'], bul: { bullet_e_1: 12 }, ms: 9000 },
      spin: { st: ['skill_2_0', 'skill_2_1_idle'], bul: { bullet_e_1: 90, boss_lvbu_blade: 3 } },
      mount: { st: ['skill_3_0', 'skill_3_1'], bul: { bullet_e_1: 2 }, ms: 25000 },
      mark: { st: ['skill_4_0'], obj: true, ms: 9000 },
      absorb: { st: ['skill_5_prepare', 'skill_5_1', 'skill_5_2_start', 'skill_5_2_end', 'skill_weak_5'], ms: 30000 },
      whirl: { st: ['skill_6_prepare', 'skill_6_0', 'skill_6_1_start', 'skill_6_1_end', 'skill_weak_6'], ms: 30000 } } }
};
const NATURAL43 = ['boss_huaxiong', 'boss_lijue'], NATURAL45 = ['boss_dongzhuo', 'boss_lvbu'];

async function openGame(b, URL, errs) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t) || (m.type() === 'warning' && /\[SK\].*(boss|AI class)/i.test(t))) errs.push(m.type() + ': ' + t); });
  p.on('response', r => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL); await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  await p.evaluate(() => { SK_GAME.debug.seed(20261010); SK.on('playerHurt', () => { window.__hurt = (window.__hurt || 0) + 1; }); });
  await p.click('#sk-start'); await until(p, () => SK_GAME.state === 'stage', null, 8000);
  await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); SK.floor4.force = 'battleground'; SK.floor4.extend(SK.STAGES); });
  return p;
}
// vào phòng có trùm; 4-3: phòng vuông (đợt trùm là đợt cuối), bỏ các đợt quái đứng trước
async function toBoss(p, stage, force) {
  await p.evaluate(([force]) => { SK.bossDebug.force = force; SK.bossDebug.hold = true; }, [force]);
  const ok = await p.evaluate(s => SK_GAME.debug.stage(s), stage);
  await until(p, () => SK_GAME.phase === 'play', null, 8000);
  const tp = await p.evaluate(() => { const rs = SK.G.map.rooms, bi = rs.some(r => r.type === 'boss'); return SK_GAME.debug.teleportTo(bi ? 'boss' : 'battle', bi ? 0 : 1); });
  if (stage === '4-3') {
    await until(p, () => SK.G.room && SK.G.room.state === 'locked', null, 8000);
    await p.evaluate(() => { const r = SK.G.room; r.waves.splice(0, r.waves.length - 1); r.wave = -1; r.waveDelay = 0.2; for (const e of SK.G.enemies) { e.st = 'dead'; e.hp = 0; e.stT = 9; } });
  }
  return ok && tp;
}

async function bossSuite(b, URL, id, errs) {
  const C = BOSSES[id], tag = s => id + ': ' + s;
  // ---- 1-2: nạp + vẽ rig riêng từng clip
  const p0 = await openGame(b, URL, errs);
  const ld = await p0.evaluate(([id, frame]) => {
    const ent = SK.bossRig.B86.bosses[id];
    return { reg: !!SK.BOSS_AIS[id], nodes: ent && ent.rig.nodes.length, fr: !!SK.bossRig.frameOf(frame), alias: SK.BOSS_KIT.frameOf(frame) };
  }, [id, C.frame]);
  check(tag('nạp được: AI đăng ký, ' + C.nodes + ' nút rig, khung gốc ' + C.frame + ' có trong atlas'), ld.reg && ld.nodes === C.nodes && ld.fr, JSON.stringify(ld));
  const draw = await p0.evaluate(([id, clips]) => {
    const RG = SK.bossRig, ent = RG.B86.bosses[id], out = {};
    for (const st of clips) {
      const c = document.createElement('canvas'); c.width = 300; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#4a5a3a'; x.fillRect(0, 0, 300, 300);
      const R = RG.rigNew(ent.rig); if (!RG.rigPlay(R, st)) { out[st] = { n: -1 }; continue; }
      RG.rigTick(R, 0.001); RG.rigTick(R, st === 'dead' ? 1.9 : 0.3); RG.rigDraw(x, R, 150, 200, {});
      const d = x.getImageData(0, 0, 300, 300).data; let n = 0, s = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== 0x4a || d[i + 1] !== 0x5a || d[i + 2] !== 0x3a) { n++; s = (s * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13 + (i >> 2)) >>> 0; }
      out[st] = { n, s };
    }
    return out;
  }, [id, C.clips]);
  check(tag('vẽ rig ra canvas: ' + C.clips.length + ' clip đều có điểm ảnh, ảnh khác nhau'), Object.values(draw).every(v => v.n > 400) && new Set(Object.values(draw).map(v => v.s)).size >= C.clips.length - 1,
    Object.entries(draw).map(([k, v]) => k + ' ' + v.n).join(' '));
  await p0.close();

  // ---- 3-5: trong game
  const p = await openGame(b, URL, errs);
  const staged = await toBoss(p, C.stage, id);
  check(tag('ép vùng 4B, vào ' + C.stage), staged && (await p.evaluate(() => SK.G.stage.theme)) === 'battleground');
  const spawned = await until(p, id => SK.G.enemies.some(e => e.bossKey === id), id, 20000);
  check(tag('ải ' + C.stage + ' gặp đúng trùm'), spawned);
  await until(p, () => SK.bossHud.visible, null, 12000);
  await until(p, () => SK.G.enemies.find(e => e.bossKey).arena.introT >= 3, null, 10000);
  const hp = await p.evaluate(() => Math.round(SK.G.enemies.find(e => e.bossKey).hpMax));
  check(tag('máu theo wiki: ' + C.hp), hp === C.hp, String(hp));
  await sleep(800);
  await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); const [x, y] = SK.freeNear([e.x + 60, e.y + 70]); SK.G.player.x = x; SK.G.player.y = y; e.hidden = true; });
  const A = await snap(p);
  await p.evaluate(() => { SK.G.enemies.find(e => e.bossKey).hidden = false; });
  const B = await snap(p);
  const dpx = diffPx(A, B);
  check(tag('trùm vẽ lên canvas game (khung hiện khác khung ẩn)'), dpx > 600, dpx + ' điểm ảnh khác');
  await p.screenshot({ path: path.join(SHOTS, id + '-idle.png') });

  const doP2 = async () => {
    const r = await p.evaluate(() => new Promise(res => {
      const e = SK.G.enemies.find(x => x.bossKey), seen = new Set(); e.hp = e.hpMax * 0.45;
      let hpDuring = null, hpBefore = null, t0 = performance.now();
      (function t() {
        seen.add(e.R.anims[0].layers[0].st);
        if (seen.has('change_state') && hpBefore == null) { hpBefore = e.hp; SK.hurtEnemy(SK.G, e, 500, false, 0, 0); hpDuring = e.hp; }
        if (e.p2 && seen.has('idle_1') || performance.now() - t0 > 9000) res({ p2: e.p2, seen: [...seen], hpBefore, hpDuring, inv: e.invuln });
        else requestAnimationFrame(t);
      })();
    }));
    check(tag('dưới 50% máu sang pha 2: change_state rồi idle_1; đổi thì bất tử (đạn không trừ máu)'), r.p2 && r.seen.includes('change_state') && r.seen.includes('idle_1') && r.hpDuring === r.hpBefore, JSON.stringify(r));
  };

  // từng đòn
  const probe = (atk, ms, near) => p.evaluate(([atk, ms, near]) => new Promise(res => {
    const G = SK.G, e = G.enemies.find(x => x.bossKey && x.st !== 'dead'), P = G.player, t0 = performance.now(), seen = {}, st = new Set(), h0 = window.__hurt || 0;
    const [x, y] = SK.freeNear([e.x + (near ? 28 : 80), e.y + (near ? 6 : 50)]); P.x = x; P.y = y;
    for (const b of G.bullets) if (b.side === 'e') b.dead = true;
    SK.bossDebug.next = atk; SK.bossDebug.hold = false; e.cd = 0; e.busy = 0;
    let started = false, objMax = 0, minHp = e.hp;
    (function t() {
      for (const b of G.bullets) if (b.side === 'e' && !b.__s) { b.__s = 1; seen[b.pname] = (seen[b.pname] || 0) + 1; }
      for (const a of e.R.anims) for (const L of a.layers) if (L.st) st.add(L.st);
      objMax = Math.max(objMax, e.arena.objs.length, G.enemies.filter(q => q.boss === e && q.st !== 'dead').length);
      if (e.atk) started = true;
      if ((started && !e.atk) || performance.now() - t0 > ms) { SK.bossDebug.hold = true; res({ ended: started && !e.atk, st: [...st], seen, hurt: (window.__hurt || 0) - h0, objMax, idle: e.R.anims[0].layers[0].st, last: e.lastAtk }); }
      else requestAnimationFrame(t);
    })();
  }), [atk, ms, near]);
  let p2done = false;
  for (const [atk, c] of Object.entries(C.atks)) {
    if (c.p2 && !p2done) { p2done = true; await doP2(); }
    await until(p, () => { const e = SK.G.enemies.find(x => x.bossKey && x.st !== 'dead'); return e && !e.atk; }, null, 15000);
    const r = await probe(atk, c.ms || 6000, !!c.near);
    const okSt = c.st.every(s => r.st.includes(s));
    const okBul = !c.bul || Object.entries(c.bul).every(([k, n]) => (r.seen[k] || 0) >= n);
    const okObj = !c.obj || r.objMax > 0;
    const okHurt = !c.hurt || r.hurt >= 1;
    const okOr = !c.hurtOrObj || r.hurt >= 1 || r.objMax > 0;
    check(tag('đòn ' + atk + ': đổi animation ' + c.st.join('>') + ', chạy trọn, về ' + (c.p2 ? 'idle_1' : 'idle')),
      r.ended && okSt && okBul && okObj && okHurt && okOr && r.last === atk, JSON.stringify(r));
    await sleep(300);
  }
  // hạ được
  const kill = await p.evaluate(() => new Promise(res => {
    const G = SK.G, e = G.enemies.find(x => x.bossKey); SK.bossDebug.hold = true;
    e.hp = 5; for (const q of G.enemies) if (q.boss === e) { q.st = 'dead'; q.hp = 0; }
    e.invuln = false; (e.guards || []).forEach(q => { q.st = 'dead'; q.hp = 0; });
    SK.hurtEnemy(G, e, 99999, false, 0, 0);
    let t0 = performance.now();
    (function t() { if ((e.deathDone && G.room.state === 'cleared') || performance.now() - t0 > 12000) res({ dead: e.st === 'dead', done: e.deathDone, room: G.room.state, st: e.R.anims[0].layers[0].st }); else requestAnimationFrame(t); })();
  }));
  check(tag('hạ được: trùm chết (clip dead), phòng mở'), kill.dead && kill.done && kill.room === 'cleared' && /dead/.test(kill.st), JSON.stringify(kill));
  await p.screenshot({ path: path.join(SHOTS, id + '-dead.png') });
  await p.close();
}

async function naturalSuite(b, URL, errs) {
  for (const [stage, pool] of [['4-3', NATURAL43], ['4-5', NATURAL45]]) {
    const seen = new Set();
    for (const seed of [1, 2, 3, 4]) {
      const p = await openGame(b, URL, errs);
      await p.evaluate(s => SK_GAME.debug.seed(s), seed * 7919);
      await toBoss(p, stage, null);
      await p.evaluate(() => { SK.bossDebug.force = null; });
      // bốc trùm ở bộ bốc thật (không ép) — gọi SK.bossWaves trên ải hiện tại
      const ids = await p.evaluate(() => { const o = []; for (let i = 0; i < 12; i++) o.push(SK.bossWaves(SK.G, SK.G.room)[0][0]); return o; });
      ids.forEach(i => seen.add(i));
      await p.close();
      if (seen.size === pool.length) break;
    }
    check('không ép: ' + stage + ' của 4B chỉ bốc ' + pool.join('/') + ', cả hai đều có thể ra', [...seen].every(i => pool.includes(i)) && seen.size === pool.length, [...seen].join());
  }
}

(async () => {
  const srv = await serve(); const URL = 'http://localhost:' + srv.address().port + '/games/soulknight/index.html?quick=1';
  const b = await chromium.launch(); const errs = [];
  try {
    const only = (process.env.SK_ONLY || '').split(',').filter(Boolean);
    for (const id of Object.keys(BOSSES)) if (!only.length || only.includes(id)) await bossSuite(b, URL, id, errs);
    if (!only.length) await naturalSuite(b, URL, errs);
    check('không lỗi trang / tài nguyên 404', !errs.length, errs.slice(0, 4).join(' | '));
  } catch (e) { check('chạy hết bộ kiểm', false, String(e && e.stack || e)); }
  await b.close(); srv.close();
  console.log(results.join('\n')); console.log('\nĐẠT ' + pass + '  HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
