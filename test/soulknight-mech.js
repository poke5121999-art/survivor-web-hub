/*
 * Kiểm cơ giáp (Bước D của games/soulknight/tools/polish/MOUNTS.md): js/mounts.js, js/rooms.js fillMount, data/sk-mounts.js.
 * Chạy: SK_URL=http://localhost:8811/games/soulknight/index.html PLAYWRIGHT_PATH=... node test/soulknight-mech.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-mech/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-mech');
fs.mkdirSync(SHOTS, { recursive: true });
const DATA = fs.readFileSync(path.join(ROOT, 'games/soulknight/data/sk-buffs86.js'), 'utf8');

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}
const IGNORE = /bosses86|theme|lib|colour/;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(DATA);
  const ev = (fn, arg) => p.evaluate(fn, arg);

  async function stage(label, force, type) {
    await ev(([l, f]) => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null, merc: null, mounts: null }, f); SK_GAME.debug.stage(l); }, [label, force || {}]);
    await until(p, () => SK_GAME.phase === 'play', null, 4000);
    if (type) { await ev(t => SK_GAME.debug.teleportTo(t), type); await sleep(350); }
  }
  async function useLabel(re) {
    const i = await ev(s => SK.G.interactables.findIndex(o => !o.gone && new RegExp(s).test(o.label)), re);
    if (i < 0) return null;
    await ev(k => { const o = SK.G.interactables[k], pl = SK.G.player; pl.x = o.x; pl.y = o.y + 2; }, i);
    await sleep(120);
    const label = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
    await p.keyboard.press('KeyE');
    await sleep(150);
    return label;
  }
  const M = () => ev(() => { const m = SK.G.player.mount; return m ? { id: m.id, hp: m.hp, hpMax: m.hpMax } : null; });
  const dummies = (n, hp) => ev(([n, hp]) => {
    const G = SK.G, pl = G.player; G.enemies.length = 0;
    for (let i = 0; i < n; i++) {
      const a = i * 6.28 / n + 0.4, e = SK.makeEnemy(G, 'e_orc01', pl.x + Math.cos(a) * 48, pl.y + Math.sin(a) * 36 - 8, G.room);
      e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = hp; G.enemies.push(e);
    }
  }, [n, hp]);
  const hps = () => ev(() => SK.G.enemies.map(e => e.hp));
  const hit = dmg => ev(d => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, d); }, dmg);

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(false); SK_GAME.debug.pet(false); });

    const D = await ev(() => { const d = window.SK_MOUNTS.mounts; return { hp: [d.m_mech_0.hp, d.m_mech_1.hp], def: [d.m_mech_0.def, d.m_mech_1.def], pf: !!SK.prefab('m_mech_0') && !!SK.prefab('m_mech_1'), fr: ['mech_0', 'mech_1', 'mech_2', 'mech_5', 'mech_6', 'mech_7', 'weapons3_90', 'shadow3'].filter(f => !SK.frame(f)) }; });
    check('dữ liệu: m_mech_0 7 HP, m_mech_1 10 HP, giáp 1, đủ prefab và khung vẽ', D.hp[0] === 7 && D.hp[1] === 10 && D.def[0] === 1 && D.def[1] === 1 && D.pf && !D.fr.length, JSON.stringify(D));

    await stage('1-3', { special: 'mount', mounts: ['m_mech_0', 'm_mech_1', 'mboar'] }, 'special');
    await ev(() => { SK.G.player.gold = 200; });
    const price = await ev(() => SK_ROOMS.mountPrice('m_mech_0'));
    const w0 = await ev(() => SK.G.player.weapons.map(w => w && w.id));
    const g0 = await ev(() => SK.G.player.gold);
    await useLabel('^Thiết Giáp Nguyên Mẫu');
    const g1 = await ev(() => SK.G.player.gold), m0 = await M();
    check('mua Thiết Giáp Nguyên Mẫu ở Thương Nhân Vật Chở: trừ đúng giá (>= 30), có giáp 7/7', g0 - g1 === price && price >= 30 && m0 && m0.id === 'm_mech_0' && m0.hp === 7, `giá ${price}, vàng ${g0} → ${g1}, ${JSON.stringify(m0)}`);
    await ev(() => { SK.G.player.gold = 3; });
    await useLabel('^Chưởng Thép');
    const g2 = await ev(() => SK.G.player.gold), m0b = await M();
    check('thiếu vàng: không mua Chưởng Thép, vàng giữ, vẫn trong giáp cũ', g2 === 3 && m0b && m0b.id === 'm_mech_0', `vàng ${g2}, ${JSON.stringify(m0b)}`);

    // vũ khí gắn
    const w1 = await ev(() => { const q = SK.G.player; return { ids: q.weapons.map(w => w && w.id), dmg: q.weapons[0].def.w86.b[0].dmg, thr: q.weapons[0].def.w86.b[0].thr }; });
    check('lái: ô vũ khí thay bằng vũ khí gắn (đạn 3, xuyên 10), ô 2 trống', w1.ids[0] === 'mech:m_mech_0' && w1.ids[1] === null && w1.dmg === 3 && w1.thr === 10, JSON.stringify(w1));
    await ev(() => { SK.G.enemies.length = 0; SK.G.bullets.length = 0; SK.G.player.energy = SK.G.player.energyMax; SK.G.player.noFire = false; });
    const e0 = await ev(() => SK.G.player.energy);
    await ev(() => { window.__mx = 0; window.__mi = setInterval(() => { window.__mx = Math.max(window.__mx, SK.G.bullets.filter(b => b.side === 'p').length); }, 30); });
    await p.mouse.move(900, 300); await p.mouse.down(); await sleep(700); await p.mouse.up();
    const sh = await ev(() => { clearInterval(window.__mi); return { n: window.__mx, en: SK.G.player.energy }; });
    check('vũ khí gắn bắn được khi cưỡi (có đạn người chơi, tiêu năng lượng)', sh.n > 0 && sh.en < e0, JSON.stringify([sh, e0]));

    // giáp 1 nhận đòn 3 → trừ 2
    const pl0 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; });
    await hit(3);
    const m1 = await M(), pl1 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; });
    check('cơ giáp giáp 1 nhận đòn 3 → trừ 2 (7 → 5), người nguyên', m1.hp === 5 && pl1.hp === pl0.hp && pl1.armor === pl0.armor, JSON.stringify([m1, pl0, pl1]));

    // xuống: trả vũ khí cũ
    await ev(() => { SK.G.interactTarget = null; SK.G.interactables.length = 0; });
    await p.keyboard.press('KeyE'); await sleep(200);
    const w2 = await ev(() => ({ ids: SK.G.player.weapons.map(w => w && w.id), mount: !!SK.G.player.mount }));
    check('xuống giáp: trả lại vũ khí cũ đúng ô', !w2.mount && JSON.stringify(w2.ids) === JSON.stringify(w0), JSON.stringify([w0, w2]));
    await sleep(500);
    await useLabel('^Cưỡi Thiết Giáp');
    const back = await M();
    check('cưỡi lại giáp bỏ trên đất: giữ máu 5', back && back.id === 'm_mech_0' && back.hp === 5, JSON.stringify(back));

    // vỡ nổ hpMax lên quái gần
    await dummies(2, 100);
    await ev(() => { const G = SK.G, pl = G.player; const far = SK.makeEnemy(G, 'e_orc01', pl.x + 200, pl.y, G.room); far.st = 'idle'; far.stT = 1e9; far.hp = far.hpMax = 100; G.enemies.push(far); });
    const before = await hps();
    await hit(50);
    const after = await hps(), m2 = await M(), w3 = await ev(() => SK.G.player.weapons.map(w => w && w.id));
    check('Prototype Armor vỡ: nổ đúng hpMax (7) sát thương vùng lên quái gần, quái xa không bị', m2 === null && before.slice(0, 2).every((h, i) => h - after[i] === 7) && after[2] === before[2], JSON.stringify([before, after, m2]));
    check('giáp vỡ cũng trả lại vũ khí cũ', JSON.stringify(w3) === JSON.stringify(w0), JSON.stringify(w3));

    // Chưởng Thép + ảnh
    await stage('1-3', { special: 'mount', mounts: ['m_mech_0', 'm_mech_1', 'mboar'] }, 'special');
    await ev(() => { SK.G.player.gold = 300; SK_GAME.debug.god(true); });
    await useLabel('^Chưởng Thép');
    const m3 = await M(), w4 = await ev(() => SK.G.player.weapons[0].def.w86.b[0].dmg);
    check('Chưởng Thép: 10 HP, đòn đấm 10', m3 && m3.id === 'm_mech_1' && m3.hp === 10 && w4 === 10, JSON.stringify([m3, w4]));
    await ev(() => { SK.G.enemies.length = 0; });
    await sleep(900);
    await ev(() => { SK.G.props.length = 0; });
    await p.screenshot({ path: path.join(SHOTS, 'mech-ride1.png') });
    await ev(() => { const q = SK.G.player; q.x -= 90; q.y += 30; SK.G.props.length = 0; SK.G.interactables.length = 0; SK.mountOn(SK.G, q, 'm_mech_0'); });
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, 'mech-ride0.png') });

    // thiên phú: x-2 / x-5 (việc thêm: tầng 4A và Mê Trận)
    const B = await ev(() => { const R = SK_ROOMS, lvl = { mode: 'level' }, mx = { mode: 'matrix' }; return { a: R.buffAfter(lvl, '4-2'), b: R.buffAfter(lvl, '1-3'), c: R.buffAfter(lvl, '4-3'), d: R.buffAfter(mx, '5-2'), e: R.buffAfter(mx, '5-3'), f: R.buffAfter(mx, '7-5'), g: R.buffAfter(mx, '6-1') }; });
    check('thẻ thiên phú: tầng 4A có sau 4-2 (4-3 không); Mê Trận 5-2 có, 5-3 không', B.a && !B.c && B.b && B.d && !B.e, JSON.stringify(B));
    check('Mê Trận: 7-5 có thẻ, 6-1 không', B.f && !B.g, JSON.stringify(B));

    const errsReal = errs.filter(e => !IGNORE.test(e));
    check('không lỗi trang/console', errsReal.length === 0, errsReal.slice(0, 3).join(' | '));
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail + '\nẢnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
