/*
 * Kiểm thú cưỡi sinh vật (Bước C của games/soulknight/tools/polish/MOUNTS.md): js/mounts.js, js/rooms.js fillMount, data/sk-mounts.js.
 * Chạy: SK_URL=http://localhost:8811/games/soulknight/index.html PLAYWRIGHT_PATH=... node test/soulknight-mounts.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-mounts/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-mounts');
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
  const hit = dmg => ev(d => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, d); }, dmg);

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(false); SK_GAME.debug.pet(false); });

    // ---- dữ liệu
    const D = await ev(() => { const d = window.SK_MOUNTS; return { n: d.sellers.creature.length, boar: d.mounts.mboar.hp, pf: ['mboar', 'mboar2', 'mcristal', 'mspider', 'mvaken', 'mhorse', 'm_morph', 'mIceMonkey', 'mDungBeetle'].filter(n => !!SK.prefab(n)).length }; });
    check('dữ liệu: 9 sinh vật bán được, Heo Rừng 10 HP, đủ 9 prefab để vẽ', D.n === 9 && D.boar === 10 && D.pf === 9, JSON.stringify(D));

    // ---- thương nhân + mua
    await stage('1-3', { special: 'mount', mounts: ['mboar', 'mhorse', 'm_morph'] }, 'special');
    const room = await ev(() => ({ fill: (SK.G.rooms || []).map(r => r.fill).filter(f => f === 'mount').length, labels: SK.G.interactables.map(o => o.label).filter(l => /vàng/.test(l || '')) }));
    check('phòng đặc biệt có thương nhân thú cưỡi bày 3 con', room.labels.length >= 3, JSON.stringify(room.labels));
    await ev(() => { SK.G.player.gold = 100; });
    const price = await ev(() => SK_ROOMS.mountPrice('mboar'));
    const g0 = await ev(() => SK.G.player.gold);
    const hp0 = await ev(() => SK.G.player.hp);
    await useLabel('^Heo Rừng');
    const g1 = await ev(() => SK.G.player.gold), m0 = await M();
    check('mua Heo Rừng: trừ đúng giá và có thú 10/10', g0 - g1 === price && price >= 15 && m0 && m0.id === 'mboar' && m0.hp === 10 && m0.hpMax === 10, `giá ${price}, vàng ${g0} → ${g1}, ${JSON.stringify(m0)}`);
    // thiếu tiền: vàng không đổi
    await ev(() => { SK.G.player.gold = 5; });
    await useLabel('^Bạch Long Mã');
    const g2 = await ev(() => SK.G.player.gold), m1 = await M();
    check('thiếu vàng: không mua, vàng giữ nguyên, thú cũ giữ', g2 === 5 && m1 && m1.id === 'mboar', `vàng ${g2}, ${JSON.stringify(m1)}`);
    await ev(() => { SK.G.player.gold = 100; });

    // ---- Điều kiểm 1: nhận 3 → thú 7, người nguyên
    const pl0 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; });
    await hit(3);
    const m2 = await M(), pl1 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; });
    check('1) Heo Rừng 10 HP nhận 3 sát thương → thú 7, người nguyên (máu và giáp)', m2.hp === 7 && pl1.hp === pl0.hp && pl1.armor === pl0.armor, JSON.stringify([m2, pl0, pl1]));

    // ---- Điều kiểm 3 (trước 2 vì cần thú còn máu): thú 3 HP sang tầng 3 → 8
    await ev(() => { SK.G.player.mount.hp = 3; });
    await stage('3-1', {});
    const m3 = await M();
    check('3) sang tầng 3: thú 3 HP hồi floor(10/2) → 8', m3 && m3.hp === 8, JSON.stringify(m3));
    await ev(() => { SK.G.player.mount.hp = 8; });
    await ev(() => SK.emit('stageEnter', SK.G, SK.G.stage));
    const m3b = await M();
    check('3b) hồi bị kẹp ở máu tối đa (8 + 5 → 10)', m3b.hp === 10, JSON.stringify(m3b));

    // ---- Điều kiểm 4: cưỡi thì skill() không chạy
    const sk = await ev(() => { const q = SK.G.player; window.__sk = 0; SK.on('skill', () => { window.__sk++; }); q.skillCd = 0; q.skillT = 0; return { cd: q.skillCd }; });
    await p.keyboard.press('KeyK'); await sleep(250);
    const sk1 = await ev(() => ({ n: window.__sk, cd: SK.G.player.skillCd, t: SK.G.player.skillT, mounted: !!SK.G.player.mount }));
    check('4) đang cưỡi: bấm kỹ năng không chạy (không phát sự kiện skill, hồi chiêu không đổi)', sk1.n === 0 && sk1.cd === 0 && sk1.t === 0 && sk1.mounted, JSON.stringify(sk1));

    // ---- xuống thú bằng phím tương tác → kỹ năng dùng được lại; cưỡi lại
    await ev(() => { const q = SK.G.player; SK.G.interactTarget = null; q.x += 0; });
    await ev(() => { SK.G.interactables.length = 0; });
    await p.keyboard.press('KeyE'); await sleep(200);
    const off = await M();
    await p.keyboard.press('KeyK'); await sleep(250);
    const sk2 = await ev(() => window.__sk);
    check('xuống thú bằng phím tương tác (E): hết thú, kỹ năng dùng được lại', off === null && sk2 === 1, JSON.stringify({ off, sk2 }));
    await sleep(500);
    await ev(() => { SK.G.player.skillT > 0 && SK.endSkill(SK.G, SK.G.player); });
    await useLabel('^Cưỡi Heo Rừng');
    const back = await M();
    check('cưỡi lại con bỏ trên đất: giữ máu cũ (10)', back && back.id === 'mboar' && back.hp === 10, JSON.stringify(back));

    // ---- Điều kiểm 2: đòn 12 khi thú 10 → vỡ, người không nhận dư
    const q0 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; });
    await hit(12);
    const m4 = await M(), q1 = await ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor, st: q.st }; });
    check('2) đòn 12 khi thú 10 HP → thú vỡ (gỡ), người không nhận 2 sát thương dư', m4 === null && q1.hp === q0.hp && q1.armor === q0.armor && q1.st !== 'dead', JSON.stringify([q0, q1]));
    const q2 = await (async () => { await hit(2); return ev(() => { const q = SK.G.player; return { hp: q.hp, armor: q.armor }; }); })();
    check('hết thú: sát thương lại trúng người', q2.hp + q2.armor < q0.hp + q0.armor, JSON.stringify(q2));

    // ---- tốc độ + ảnh người cưỡi thú
    await stage('1-3', { special: 'mount', mounts: ['mboar', 'mhorse', 'm_morph'] }, 'special');
    await ev(() => { SK.G.player.gold = 100; SK_GAME.debug.god(true); });
    await useLabel('^Heo Rừng');
    await ev(() => { SK.G.enemies.length = 0; });
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, 'mount-ride.png') });
    const spd = await ev(() => SK.G.player.mount.speedRate);
    check('Heo Rừng tăng tốc +20%', Math.abs(spd - 0.2) < 1e-9, String(spd));

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
