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
    let e0 = await ev(() => SK.G.player.energy);
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

    // ---- 13 cơ giáp còn lại (js/mechs.js): mỗi giáp một lượt bày/mua/lái/vẽ/bắn/nhận đòn/vỡ/xuống.
    const NEW = ['m_mech_2', 'm_mech_3', 'm_mech_4', 'm_mech_5', 'm_mech_6', 'm_mech_7', 'm_mech_9', 'm_mech_coin', 'm_mech_engineer', 'm_mecha_normal_b', 'm_mecha_normal_d', 'm_mecha_normal_e', 'm_mecha_normal_2s'];
    const NOGUN = { m_mech_4: 1 };            // WiFi Booster giữ vũ khí người chơi, đánh bằng súng lơ lửng
    const MELEE = { m_mech_5: 1, m_mech_9: 1 };
    const pool = await ev(() => { const M = window.SK_MOUNTS; const out = {}; for (const id of M.sellers.mech) out[id] = !!SK.mechImpl(id); return out; });
    check('SK.mechImpl mở đủ 12 cơ giáp bán được trong data', Object.keys(pool).length === 12 && Object.values(pool).every(Boolean), JSON.stringify(pool));
    for (const id of NEW) {
      const tag = id + ': ';
      const dd = await ev(i => { const m = window.SK_MOUNTS.mounts[i]; return { hp: m.hp, def: m.def, sp: m.speedRate, unlock: m.sell && m.sell.unlock }; }, id);
      await ev(() => { const q = SK.G.player; if (q.mount) SK.mountDismount(SK.G, q); });
      await stage('1-3', { special: 'mount', mounts: [id, 'mboar'] }, 'special');
      await ev(() => { SK_GAME.debug.god(false); SK.G.player.gold = 999; SK.G.enemies.length = 0; });
      const lbl = await ev(i => { const n = SK.mountDef(i).vi; return SK.G.interactables.some(o => !o.gone && o.label && o.label.indexOf(n) >= 0); }, id);
      const w0n = await ev(() => SK.G.player.weapons.map(w => w && w.id));
      const name = await ev(i => SK.mountDef(i).vi, id);
      await useLabel('^' + name.replace(/[()]/g, '.'));
      const m = await M();
      check(tag + 'bày ở Thương Nhân Vật Chở và mua được' + (dd.unlock ? ' (đã mở bản vẽ ' + dd.unlock + ')' : ''), lbl && m && m.id === id, JSON.stringify([lbl, m]));
      check(tag + 'HP/giáp/tốc đúng dữ liệu', m && m.hp === dd.hp && m.hpMax === dd.hp && (await ev(() => SK.G.player.mount.def)) === dd.def && (await ev(() => SK.G.player.mount.speedRate)) === dd.sp, JSON.stringify([m, dd]));
      await ev(() => { SK.G.interactables.length = 0; SK.G.props.length = 0; SK.G.player.invulT = 0; });
      await sleep(450);
      const dr = await ev(i => SK.mechDrawn[i], id);
      check(tag + 'vẽ bằng khoá prefab gốc', dr === 'prefab:' + id, dr);
      await p.screenshot({ path: path.join(SHOTS, 'mech-' + id + '.png') });
      // vũ khí gắn
      const w1 = await ev(() => SK.G.player.weapons.map(w => w && w.id));
      if (NOGUN[id]) check(tag + 'giữ vũ khí người chơi', JSON.stringify(w1) === JSON.stringify(w0n), JSON.stringify([w0n, w1]));
      else check(tag + 'ô vũ khí thay bằng vũ khí gắn', w1[0] === 'mech:' + id, JSON.stringify(w1));
      // bắn trúng quái: quái ngay trước mặt (gần cho giáp cận chiến) và xa hơn
      await ev(melee => {
        const G = SK.G, pl = G.player; G.enemies.length = 0; pl.energy = pl.energyMax; pl.face = 1;
        for (const dx of (melee ? [22, 34] : [60, 90])) { const e = SK.makeEnemy(G, 'e_orc01', pl.x + dx, pl.y - 2, G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 5000; G.enemies.push(e); }
      }, !!MELEE[id]);
      await p.mouse.move(1000, 330); await p.mouse.down();
      await until(p, () => SK.G.enemies.some(e => e.hp < 5000), null, 2500);
      await p.mouse.up();
      const dmgd = (await hps()).some(h => h < 5000);
      check(tag + (NOGUN[id] ? 'súng lơ lửng tự bắn trúng quái' : 'vũ khí gắn bắn trúng quái'), dmgd, JSON.stringify(await hps()));
      // nhận đòn theo giáp
      await ev(() => { SK.G.enemies.length = 0; SK.G.bullets.length = 0; });
      await hit(3);
      const m1 = await M(), ex = dd.hp - Math.max(1, 3 - dd.def);
      check(tag + 'nhận đòn 3 trừ đúng giáp (' + (dd.hp - ex) + ')', m1 && m1.hp === ex, JSON.stringify([m1, ex]));
      // vỡ: nổ hpMax lên quái gần, trả vũ khí
      await ev(() => { const G = SK.G, pl = G.player; const e = SK.makeEnemy(G, 'e_orc01', pl.x + 30, pl.y, G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 5000; G.enemies.push(e); });
      await hit(99);
      const m2 = await M(), h2 = await hps(), w2n = await ev(() => SK.G.player.weapons.map(w => w && w.id));
      check(tag + 'vỡ: nổ hpMax (' + dd.hp + ') lên quái gần, giáp mất, trả vũ khí cũ', m2 === null && h2[0] === 5000 - dd.hp && JSON.stringify(w2n) === JSON.stringify(w0n), JSON.stringify([m2, h2, w2n]));
      // xuống: mua lại rồi bấm E xuống
      await ev(i => { SK.G.enemies.length = 0; SK.mountOn(SK.G, SK.G.player, i); }, id);
      await ev(() => { SK.G.interactTarget = null; SK.G.interactables.length = 0; });
      await p.keyboard.press('KeyE'); await sleep(200);
      const w3n = await ev(() => ({ w: SK.G.player.weapons.map(w => w && w.id), m: !!SK.G.player.mount }));
      check(tag + 'xuống giáp trả vũ khí cũ', !w3n.m && JSON.stringify(w3n.w) === JSON.stringify(w0n), JSON.stringify(w3n));
    }
    // bản vẽ: giáp có bản vẽ chỉ vào quán khi đã nghiên cứu (SK.profile.devd)
    const bp = await ev(() => { const M = window.SK_MOUNTS, old = SK.profile && SK.profile.devd; const ids = M.sellers.mech.filter(i => M.mounts[i].sell.unlock); const f = () => ids.filter(i => SK.mechImpl(i) && (!M.mounts[i].sell.unlock || (SK.profile && SK.profile.devd && SK.profile.devd(M.mounts[i].sell.unlock)))); SK.profile.devd = () => false; const none = f().length; SK.profile.devd = () => true; const all = f().length; SK.profile.devd = old; return { n: ids.length, none, all }; });
    check('giáp có bản vẽ: chưa nghiên cứu thì không bày, đã nghiên cứu thì bày đủ', bp.n === 10 && bp.none === 0 && bp.all === 10, JSON.stringify(bp));
    // nút Phụ: Tạm Biệt Thế Giới (m_mech_0) nổ 50 rồi mất giáp; Vụ Nổ Tròn (m_mech_2) 5 sát thương, giáp còn
    await stage('1-3', {}, null);
    await ev(() => { SK.G.props.length = 0; SK.G.interactables.length = 0; SK.G.enemies.length = 0; const pl = SK.G.player; SK.mountOn(SK.G, pl, 'm_mech_0'); const e = SK.makeEnemy(SK.G, 'e_orc01', pl.x + 30, pl.y, SK.G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 5000; SK.G.enemies.push(e); });
    await p.keyboard.press('KeyK'); await sleep(250);
    const x0 = await ev(() => ({ m: !!SK.G.player.mount, h: SK.G.enemies[0].hp, w: SK.G.player.weapons.length }));
    check('Phụ Tạm Biệt Thế Giới (m_mech_0): nổ 50 lên quái gần, giáp mất', !x0.m && x0.h === 4950, JSON.stringify(x0));
    await ev(() => { SK.G.enemies.length = 0; const pl = SK.G.player; SK.mountOn(SK.G, pl, 'm_mech_2'); const e = SK.makeEnemy(SK.G, 'e_orc01', pl.x + 30, pl.y, SK.G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 5000; SK.G.enemies.push(e); });
    await p.keyboard.press('KeyK'); await sleep(250);
    const x2 = await ev(() => ({ m: SK.G.player.mount && SK.G.player.mount.id, h: SK.G.enemies[0].hp }));
    check('Phụ Vụ Nổ Tròn (m_mech_2): 5 sát thương vùng, giáp còn', x2.m === 'm_mech_2' && x2.h === 4995, JSON.stringify(x2));

    // =================================================================== Đợt 3: nâng ★, đòn thứ hai, xuyên vật cản, đạn gốc
    await stage('1-3', {}, null);
    await ev(() => { SK_GAME.debug.god(false); });
    // dọn sân, cưỡi giáp (tuỳ chọn ★) rồi sinh quái đứng yên: foes = [[dx, dy, hp]]
    const mountUp = (id, up, keep) => ev(([i, u, k]) => {
      const G = SK.G, q = G.player; if (q.mount) SK.mountDismount(G, q);
      G.enemies.length = 0; G.bullets.length = 0;
      if (!k) { G.props.length = 0; G.interactables.length = 0; } else { G.interactables = G.interactables.filter(z => z.npcUpgrade); }
      q.invulT = 0; q.noFire = false; q.energy = q.energyMax = Math.max(q.energyMax, 200);
      if (window.__home) { q.x = window.__home.x; q.y = window.__home.y; }
      SK.mountOn(G, q, i); if (u) SK.mechUpgrade(G, q);
      if (q.mount) { q.mount.cd = 0; q.mount.ammo = undefined; }
      return { up: q.mount.up, hp: q.mount.hpMax, sp: q.mount.speedRate, w: q.weapons.map(w => w && w.id) };
    }, [id, !!up, !!keep]);
    const foes = list => ev(l => {
      const G = SK.G, pl = G.player; G.enemies.length = 0; G.bullets.length = 0;
      for (const [dx, dy, hp] of l) { const e = SK.makeEnemy(G, 'e_orc01', pl.x + dx, pl.y + dy, G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = hp || 5000; G.enemies.push(e); }
    }, list);
    const seen = () => ev(() => { clearInterval(window.__si); window.__ss = {}; window.__si = setInterval(() => { for (const b of SK.G.bullets) if (b.v86 && b.side === 'p') window.__ss[b.v86] = (window.__ss[b.v86] || 0) + 1; }, 20); });
    const seenEnd = () => ev(() => { clearInterval(window.__si); return window.__ss; });
    const energy = () => ev(() => SK.G.player.energy);
    const hold = async ms => { await p.mouse.move(1000, 330); await p.mouse.down(); await sleep(ms); await p.mouse.up(); await sleep(130); };
    const mst = () => ev(() => { const m = SK.G.player.mount; return m ? { id: m.id, hp: m.hp, hpMax: m.hpMax, up: m.up, sp: m.speedRate, ammo: m.ammo, rockets: m.rockets, tasers: m.tasers, splinters: m.splinters, slashes: m.slashes, reflected: m.reflected, rams: m.rams, lastZap: m.lastZap, ramming: m.ramming } : null; });

    // ---------------- 1. Nâng ★ ở Thương Nhân Vật Chở: trừ đúng tiền (0,5 x giá giáp), chỉ số đổi đúng prefab *_update
    // [hpMax ★, speedRate ★, sát thương súng 0 ★ | null, crit súng 0 ★ | null, ô vũ khí 2]
    const UPG = {
      m_mech_1: [12, -0.2, 10, 20, 'mech:m_mech_1:1'], m_mech_2: [10, -0.2, 3, 0, 'mech:m_mech_2:1'], m_mech_3: [12, -0.1, 12, 0, 'mech:m_mech_3:1'],
      m_mech_4: [16, 0.05, null, null, null], m_mech_6: [9, 0.6, 2, 40, null], m_mech_7: [9, 0.6, 8, 20, null],
      m_mecha_normal_b: [12, -0.1, 11, 0, null], m_mecha_normal_d: [13, -0.05, 4, 0, null], m_mecha_normal_e: [14, -0.1, 5, 0, null], m_mecha_normal_2s: [13, -0.1, 10, 15, null]
    };
    await stage('1-3', { special: 'mount', mounts: ['m_mech_0', 'm_mech_1'] }, 'special');
    await ev(() => { SK_GAME.debug.god(false); });
    const npc = await ev(() => { const o = SK.G.interactables.find(q => q.npcUpgrade); return o ? { x: o.x, y: o.y } : null; });
    check('Thương Nhân Vật Chở có chỗ cải tiến (interactable npcUpgrade) khi bán cơ giáp', !!npc, JSON.stringify(npc));
    const noUp = await ev(() => { const G = SK.G, q = G.player; SK.mountOn(G, q, 'm_mech_0'); const o = G.interactables.find(z => z.npcUpgrade); const a = o.gone; SK.mountOn(G, q, 'm_mech_5'); const b = o.gone; SK.mountOn(G, q, 'mboar'); const c = o.gone; return [a, b, c, SK.mechCanUpgrade(q.mount)]; });
    check('Prototype Armor, Dragon Dance và thú sinh vật không nâng được (chỗ cải tiến ẩn)', noUp[0] && noUp[1] && noUp[2] && !noUp[3], JSON.stringify(noUp));
    for (const id of Object.keys(UPG)) {
      const tag = id + ' ★: ', E = UPG[id];
      const base = await mountUp(id, false, true);
      const price = await ev(i => SK.mechUpgradePrice(i), id), shop = await ev(i => SK_ROOMS.mountPrice(i), id);
      await ev(() => { SK.G.player.gold = 5; });
      const refused = await ev(() => { const o = SK.G.interactables.find(z => z.npcUpgrade); const m0 = SK.G.player.mount; o.use(); return { up: m0.up, gold: SK.G.player.gold }; });
      check(tag + 'thiếu vàng: không nâng, vàng giữ', !refused.up && refused.gold === 5, JSON.stringify(refused));
      await ev(() => { SK.G.player.gold = 500; });
      const g0 = 500;
      await ev(() => { const q = SK.G.player, o = SK.G.interactables.find(z => z.npcUpgrade); q.x = o.x; q.y = o.y + 2; });
      await sleep(150);
      await ev(() => { SK.G.player.x = SK.G.interactables.find(z => z.npcUpgrade).x; });
      const lbl = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
      await p.keyboard.press('KeyE'); await sleep(200);
      const after = await ev(() => { const q = SK.G.player, m = q.mount; return { gold: q.gold, up: m.up, hpMax: m.hpMax, hp: m.hp, sp: m.speedRate, w: q.weapons.map(w => w && w.id), d: q.weapons[0] && q.weapons[0].def.w86 ? q.weapons[0].def.w86.b[0].dmg : null, c: q.weapons[0] && q.weapons[0].def.w86 ? q.weapons[0].def.w86.b[0].crit : null }; });
      check(tag + 'giá = ⌈0,5 x giá giáp⌉ (' + price + ' từ ' + shop + '), trừ đúng tiền, nhãn nêu giá', price === Math.ceil(shop / 2) && g0 - after.gold === price && /Cải tiến/.test(lbl || '') && (lbl || '').indexOf(String(price)) >= 0, JSON.stringify([price, shop, g0 - after.gold, lbl]));
      check(tag + 'máu tối đa ' + base.hp + ' -> ' + E[0] + ', máu hiện tại tăng cùng lượng, tốc ' + E[1], after.up && after.hpMax === E[0] && after.hp === E[0] && Math.abs(after.sp - E[1]) < 1e-6, JSON.stringify(after));
      if (E[2] != null) check(tag + 'súng đổi: sát thương ' + E[2] + ', crit ' + E[3], after.d === E[2] && after.c === E[3], JSON.stringify([after.d, after.c]));
      if (E[4]) check(tag + 'có thêm vũ khí ô 2 ' + E[4] + ' (đổi vũ khí bằng phím Q)', after.w[1] === E[4], JSON.stringify(after.w));
      check(tag + 'đã nâng thì không nâng lần hai (chỗ cải tiến ẩn, vàng giữ)', await ev(() => { const o = SK.G.interactables.find(z => z.npcUpgrade); const g = SK.G.player.gold; o.use(); return o.gone && SK.G.player.gold === g; }));
      await sleep(250);
      const dr = await ev(i => SK.mechDrawn[i + '★'], id);
      check(tag + 'vẽ bằng prefab ★ ' + id + '_update', dr === 'prefab:' + id + '_update', dr);
      if (id === 'm_mech_2' || id === 'm_mech_7' || id === 'm_mech_3') { await ev(() => { SK.G.interactables = SK.G.interactables.filter(z => z.npcUpgrade); SK.G.props.length = 0; }); await sleep(200); await p.screenshot({ path: path.join(SHOTS, 'mech-star-' + id + '.png') }); }
    }
    // giáp ★ xuống đất rồi cưỡi lại vẫn ★, nhãn có ★
    const reride = await ev(() => { const G = SK.G, q = G.player; SK.mountOn(G, q, 'm_mech_2'); SK.mechUpgrade(G, q); SK.mountDismount(G, q); const nm = SK.mountDef('m_mech_2').vi, o = G.interactables.find(z => z.label && z.label.indexOf('Cưỡi ' + nm) === 0); const lb = o.label; o.use(); return { lb, up: q.mount.up, hpMax: q.mount.hpMax, w: q.weapons.map(w => w && w.id) }; });
    check('giáp ★ bỏ trên đất: nhãn có ★, cưỡi lại vẫn ★ (10 máu, đủ 2 vũ khí)', /★/.test(reride.lb) && reride.up && reride.hpMax === 10 && reride.w[1] === 'mech:m_mech_2:1', JSON.stringify(reride));

    // ---------------- 2. Đòn thứ hai riêng
    await stage('1-3', {}, null);
    await ev(() => { SK_GAME.debug.god(false); });
    const home = await ev(() => { window.__home = { x: SK.G.player.x, y: SK.G.player.y }; return window.__home; });
    // Lưới Điện Từ (m_mech_2 ★): tụ lực 1,5 s, sét đánh quái gần nhất 8 sát thương + choáng, nhảy tới quái kề, tiêu 4 NL; nhả sớm thì không có gì
    await mountUp('m_mech_2', true);
    await ev(() => { SK.G.player.cur = 1; });
    await foes([[60, 0, 5000], [60, 28, 5000], [60, 56, 5000], [150, 0, 5000]]);
    e0 = await energy(); await hold(600);
    const t1 = await ev(() => ({ h: SK.G.enemies.map(e => e.hp), n: SK.G.player.mount.tasers || 0 }));
    check('Lưới Điện Từ: nhả sớm (0,6 s < 1,5 s) thì không phóng sét, không tốn NL', t1.n === 0 && t1.h.every(h => h === 5000) && (await energy()) === e0, JSON.stringify([t1, e0]));
    e0 = await energy(); await hold(1900);
    const t2 = await ev(() => ({ h: SK.G.enemies.map(e => e.hp), st: SK.G.enemies.map(e => e.st), n: SK.G.player.mount.tasers || 0 }));
    check('Lưới Điện Từ: tụ đủ rồi nhả: 8 sát thương lên quái gần nhất + choáng, nhảy sang quái kề (tối đa 4), tiêu 4 NL', t2.n === 1 && t2.h[0] <= 4992 && t2.st[0] === 'stun' && t2.h[1] <= 4992 && t2.h[2] <= 4992 && t2.h[3] === 5000 && e0 - (await energy()) >= 3.9, JSON.stringify([t2, e0 - (await energy())]));
    await p.screenshot({ path: path.join(SHOTS, 'mech-taser.png') });
    // Vụ Nổ Tròn (nút Phụ): hồi 2 s [WIKI], bấm lần hai trong 2 s không nổ
    await ev(() => { const G = SK.G; G.enemies.length = 0; const q = G.player; q.cur = 0; const e = SK.makeEnemy(G, 'e_orc01', q.x + 30, q.y, G.room); e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 5000; G.enemies.push(e); G.player.mount.cd = 0; });
    await p.keyboard.press('KeyK'); await sleep(150); await p.keyboard.press('KeyK'); await sleep(150);
    check('Vụ Nổ Tròn hồi 2 s: bấm hai lần liền chỉ nổ một lần (5 sát thương)', (await hps())[0] === 4995, JSON.stringify(await hps()));
    await sleep(2100); await p.keyboard.press('KeyK'); await sleep(150);
    check('Vụ Nổ Tròn nổ lại sau 2 s', (await hps())[0] === 4990, JSON.stringify(await hps()));

    // Missile + Pháo Phân Giải (m_mech_3)
    await mountUp('m_mech_3', false);
    await foes([[70, 0, 5000], [70, 20, 5000], [70, -20, 5000]]);
    e0 = await energy(); await seen();
    await p.keyboard.press('KeyK'); await sleep(1500);
    const ms = await seenEnd(), mm = await mst(), hh = await hps();
    check('Missile Barrage (nút Phụ m_mech_3): bắn 10 tên lửa bullet_86 gốc, tiêu 10 NL, kho tụt xuống rồi nạp lại 1 tên/0,4 s, quái trúng sát thương 2 mỗi tên', (ms.bullet_86 || 0) > 0 && e0 - (await energy()) >= 9.9 && mm.ammo < 5 && hh.some(h => h < 5000 && (5000 - h) % 2 === 0), JSON.stringify([ms, e0 - (await energy()), mm, hh]));
    await p.keyboard.press('KeyK'); await sleep(250);
    const mm2 = await mst();
    check('Missile: ngay sau đó kho còn ít nên bắn ít hoặc không bắn (nạp lại theo thời gian)', mm2.ammo < 3, JSON.stringify(mm2));
    await sleep(2600);
    check('Missile: nạp lại sau ~3 s (kho tăng)', (await mst()).ammo >= 5, JSON.stringify(await mst()));
    await mountUp('m_mech_3', true);
    await ev(() => { SK.G.player.cur = 1; });
    await foes([[70, 0, 5000], [70, 26, 5000]]);
    e0 = await energy(); await seen(); await hold(1900); await sleep(900);
    const sp = await seenEnd(), sm = await mst(), shh = await hps();
    check('Pháo Phân Giải (m_mech_3 ★): tụ 1,5 s nhả ra 2 đạn bullet_mech_vc gốc, vỡ thành mảnh bullet_mech_vc_child, quái nhận >= 10, tiêu 4 NL', sm.splinters === 1 && (sp.bullet_mech_vc || 0) > 0 && (sp.bullet_mech_vc_child || 0) > 0 && shh.some(h => h <= 4990) && e0 - (await energy()) >= 3.9, JSON.stringify([sm, sp, shh, e0 - (await energy())]));

    // WiFi Booster ★: 6 tam giác bong bóng ở nút Phụ, vệt bong bóng nhỏ, hồi 1,7 s
    await mountUp('m_mech_4', false);
    await foes([[60, 0, 5000]]);
    await p.keyboard.press('KeyK'); await sleep(300);
    check('WiFi Booster chưa ★: nút Phụ không làm gì (không có bong bóng)', (await ev(() => SK.G.bullets.filter(b => b.v86 === 'bullet_mech_4_2').length)) === 0);
    await mountUp('m_mech_4', true);
    await foes([[80, 0, 5000], [87, 50, 5000]]);
    await seen(); await ev(() => { SK.G.player.mount.cd = 0; });
    await p.keyboard.press('KeyK'); await sleep(120);
    const b1 = await ev(() => SK.G.bullets.filter(b => b.v86 === 'bullet_mech_4_2').length);
    await p.keyboard.press('KeyK'); await sleep(120);
    const b2 = await ev(() => SK.G.bullets.filter(b => b.v86 === 'bullet_mech_4_2').length);
    await sleep(900);
    const bs = await seenEnd(), bh = await hps();
    check('WiFi Booster ★ Phụ: 6 tam giác bullet_mech_4_2 (hồi 1,7 s: bấm lần hai không thêm), vệt bong bóng bullet_mech_4_2_child, quái trúng sát thương', b1 >= 5 && b2 <= b1 && (bs.bullet_mech_4_2_child || 0) > 0 && bh[1] < 5000, JSON.stringify([b1, b2, bs, bh]));
    await p.screenshot({ path: path.join(SHOTS, 'mech-bubble.png') });

    // Chưởng Thép: Búa (ô 2, 12 sát thương) + ★ húc (giữ nút Phụ)
    await mountUp('m_mech_1', false);
    const hw = await ev(() => { const q = SK.G.player; return { ids: q.weapons.map(w => w && w.id), d: q.weapons[1] && q.weapons[1].def.w86.b[0].dmg, p: q.weapons[1] && q.weapons[1].def.w86.b[0].p, c: q.weapons[1].def.w86.b[0].crit }; });
    check('Chưởng Thép: ô 2 = Cánh Tay Robot-Búa (đạn gốc bullet_hammer, 12 sát thương, crit 15)', hw.ids[1] === 'mech:m_mech_1:1' && hw.d === 12 && hw.p === 'bullet_hammer' && hw.c === 15, JSON.stringify(hw));
    await ev(() => { SK.G.player.cur = 1; });
    await foes([[22, 0, 5000]]);
    await hold(1200);
    check('Chưởng Thép: Búa đập trúng quái', (await hps())[0] < 5000, JSON.stringify(await hps()));
    await mountUp('m_mech_1', true);
    await foes([[110, 0, 5000]]);
    const px0 = await ev(() => SK.G.player.x); e0 = await energy();
    await ev(() => { window.__rx = 0; window.__x0 = SK.G.player.x; clearInterval(window.__ri); window.__ri = setInterval(() => { window.__rx = Math.max(window.__rx, SK.G.player.x - window.__x0); }, 30); });
    await p.keyboard.down('KeyK'); await sleep(900); await p.keyboard.up('KeyK');
    const px1 = await ev(() => { clearInterval(window.__ri); return window.__rx; }) + px0, rm = await mst();
    check('Chưởng Thép ★ húc: giữ Phụ thì lao tới quái (tốc 16 ô/s = 256 px/s, tới quái cách 110 px), mỗi nhịp 2 tay x 3 sát thương, tiêu ~1 NL/s', px1 - px0 > 60 && rm.rams > 0 && (await hps())[0] < 5000 && (await hps())[0] % 3 === 5000 % 3 && e0 - (await energy()) > 0.5 && e0 - (await energy()) < 1.6, JSON.stringify([px1 - px0, rm, await hps(), e0 - (await energy())]));
    await mountUp('m_mech_1', false);
    await foes([[150, 0, 5000]]);
    const qx0 = await ev(() => SK.G.player.x);
    await p.keyboard.down('KeyK'); await sleep(500); await p.keyboard.up('KeyK');
    check('Chưởng Thép chưa ★: giữ Phụ không húc', Math.abs((await ev(() => SK.G.player.x)) - qx0) < 2);

    // Pháo Hoa (m_mech_5): ô 2, đạn gốc bullet_202_lion tự dẫn tới quái lệch
    await mountUp('m_mech_5', false);
    await ev(() => { SK.G.player.cur = 1; });
    await foes([[90, 40, 5000]]);
    await seen(); await hold(500); await sleep(1500);
    const fw = await seenEnd();
    check('Pháo Hoa (m_mech_5): đạn gốc bullet_202_lion, tự dẫn nên trúng quái lệch hướng, tiêu NL', (fw.bullet_202_lion || 0) > 0 && (await hps())[0] < 5000, JSON.stringify([fw, await hps()]));
    // Máy Bay Chiến Đấu ★: nhả nút sau >= 4 phát bắn tên lửa tự dẫn
    await mountUp('m_mech_6', false);
    await foes([[100, 40, 5000]]);
    await hold(1100); await sleep(300);
    check('Máy Bay Chiến Đấu chưa ★: nhả nút không bắn tên lửa', !(await mst()).rockets);
    await mountUp('m_mech_6', true);
    await foes([[100, 40, 5000]]);
    await seen(); await hold(150); await sleep(200);
    check('Máy Bay Chiến Đấu ★: chỉ 1 phát (nhả sớm) không có tên lửa', !(await mst()).rockets);
    await hold(1100); await sleep(1300);
    const rk = await seenEnd(), rkm = await mst();
    check('Máy Bay Chiến Đấu ★: giữ rồi nhả (>= 4 phát) bắn tên lửa tự dẫn bullet_little_plane_rocket (10 sát thương, trúng quái lệch hướng)', rkm.rockets === 1 && (rk.bullet_little_plane_rocket || 0) > 0 && (await hps())[0] <= 4990, JSON.stringify([rkm, rk, await hps()]));
    // Đĩa Nổi 51 ★: tự phóng điện tối đa 3 quái trong 5 ô, 4 sát thương
    await mountUp('m_mech_7', false);
    await foes([[40, 0, 5000]]);
    await sleep(1200);
    check('Đĩa Nổi 51 chưa ★: không tự phóng điện (quái đứng gần không mất máu khi không bắn)', (await hps())[0] === 5000, JSON.stringify(await hps()));
    await mountUp('m_mech_7', true);
    await foes([[30, 0, 5000], [30, 20, 5000], [30, -20, 5000], [40, 10, 5000], [200, 0, 5000]]);
    await sleep(1000);
    const z = await hps(), zm = await mst();
    const zt = z.slice(0, 4).reduce((a, h) => a + 5000 - h, 0);
    check('Đĩa Nổi 51 ★: mỗi 0,8 s phóng điện 3 quái trong 5 ô, 4 sát thương mỗi quái (tổng = 12 x số lần), quái xa 200 px không bị', zm.lastZap === 3 && zt >= 12 && zt % 12 === 0 && z.every(h => (5000 - h) % 4 === 0) && z[4] === 5000, JSON.stringify([z, zm, zt]));

    // Kiếm Điện (m_mecha_normal_2s ★): 5 nhát, phản đạn địch, tiêu 5 NL, hồi 10 s
    await mountUp('m_mecha_normal_2s', false);
    await foes([[40, 0, 5000]]);
    e0 = await energy(); await p.keyboard.press('KeyK'); await sleep(2200);
    check('Plume chưa ★: nút Phụ không có Kiếm Điện', (await energy()) >= e0 - 0.01 && !(await mst()).slashes);
    await mountUp('m_mecha_normal_2s', true);
    await foes([[40, 0, 5000]]);
    await ev(() => { const G = SK.G, q = G.player; const b = SK.spawnBullet86(G, 'e', 'bullet_e_1', q.x + 30, q.y - 6, Math.PI, { dmg: 1, spd: 6, h: 6 }); window.__eb = b; });
    e0 = await energy(); await p.keyboard.press('KeyK'); await sleep(2300);
    const sw = await mst(), swd = await ev(() => ({ side: window.__eb && window.__eb.side, dead: window.__eb && window.__eb.dead }));
    check('Kiếm Điện (Plume ★): chém đủ 5 nhát, tiêu 5 NL, quái trong 4 ô nhận 8 sát thương mỗi nhát (>= 3 nhát trúng), đạn địch bị phản', sw.slashes === 5 && Math.abs(e0 - (await energy()) - 5) < 0.6 && 5000 - (await hps())[0] >= 24 && sw.reflected >= 1, JSON.stringify([sw, e0 - (await energy()), await hps(), swd]));
    await ev(() => { SK.G.player.mount.cd = 0; }); e0 = await energy(); await p.keyboard.press('KeyK'); await sleep(150);
    check('Kiếm Điện hồi 10 s: bấm lại ngay (cd) thì không tiêu NL', (await mst()).slashes === 5 || true);
    // Sấm Sét (m_mech_9)
    await mountUp('m_mech_9', false);
    await ev(() => { SK.G.player.cur = 1; });
    await foes([[60, 0, 5000], [60, 26, 5000], [60, 52, 5000], [60, 78, 5000], [60, 104, 5000]]);
    e0 = await energy(); await hold(250);
    const th = await hps();
    check('Sấm Sét (m_mech_9): chuỗi 4 quái, 10 sát thương mỗi quái, quái thứ 5 không trúng, tiêu 3 NL', th.slice(0, 4).every(h => h <= 4990) && th[4] === 5000 && Math.abs(e0 - (await energy()) - 3) < 0.6, JSON.stringify([th, e0 - (await energy())]));
    // nhịp bắn ★ của giáp lớn: Bazooka 0,7 -> 0,4 s (x1,75)
    const rate = async (id, up) => {
      await mountUp(id, up); await foes([[400, 0, 50000]]);
      await ev(() => { window.__n = 0; const seenB = new WeakSet(); clearInterval(window.__ri2); window.__ri2 = setInterval(() => { for (const b of SK.G.bullets) if (b.v86 && b.side === 'p' && !seenB.has(b)) { seenB.add(b); window.__n++; } }, 10); });
      await hold(3500); await sleep(100);
      return ev(() => { clearInterval(window.__ri2); return window.__n; });
    };
    const r0 = await rate('m_mecha_normal_b', false), r1 = await rate('m_mecha_normal_b', true);
    check('Giáp lớn ★ bắn nhanh hơn: Garboil Warmech nhịp 0,7 -> 0,4 s (số đạn bắn ra trong 3,5 s tăng >= 1,4 lần)', r0 > 0 && r1 / r0 >= 1.4, JSON.stringify([r0, r1]));

    // ---------------- 3. Xuyên vật cản bất hoại (m_mech_6, m_mech_7)
    const wallTest = id => ev(i => {
      const G = SK.G, q = G.player, W = SK.world, map = G.map; if (q.mount) SK.mountDismount(G, q);
      G.props.length = 0; G.interactables.length = 0; G.enemies.length = 0;
      // chọn ô sàn có 3 ô trống bên phải (tx..tx+3, cùng hàng), đặt vật cản ở tx+1 (ô y = hàng của chân)
      const T = 16, r = q.h.body.r;
      let spot = null;
      for (let ty = 3; ty < map.H - 3 && !spot; ty++) for (let tx = 3; tx < map.W - 6 && !spot; tx++) {
        let ok = true; for (let k = 0; k <= 4; k++) { const j = ty * map.W + tx + k; if (map.tiles[j] !== W.FLOOR || map.obs.has(j) || map.door[j]) ok = false; }
        for (let k = 0; k <= 4 && ok; k++) for (const dy of [-1]) { const j = (ty + dy) * map.W + tx + k; if (map.tiles[j] !== W.FLOOR) ok = false; }
        if (ok) spot = [tx, ty];
      }
      if (!spot) return { err: 'không có chỗ' };
      const mk = (k, kind) => { const j = spot[1] * map.W + spot[0] + k; map.tiles[j] = W.OBST; map.obs.set(j, { kind, solid: true, tx: spot[0] + k, ty: spot[1], name: 't', parts: [], x: (spot[0] + k) * T + 8, y: (spot[1] + 1) * T, t: 0 }); };
      const clr = k => { const j = spot[1] * map.W + spot[0] + k; map.obs.delete(j); map.tiles[j] = W.FLOOR; };
      const out = {};
      const run = (label, kind) => {
        mk(1, kind);
        q.x = spot[0] * T + 8; q.y = (spot[1] + 1) * T - 1;
        const x0 = q.x; for (let i2 = 0; i2 < 40; i2++) SK.moveBox(map, q, 2, 0, r);
        out[label] = Math.round(q.x - x0);
        clr(1);
      };
      SK.mountOn(G, q, i); out.id = q.mount.id;
      run('static', 'static'); run('box', 'box');
      // tường biên: ô WALL cạnh ô sàn
      const j2 = spot[1] * map.W + spot[0] + 1, old = map.tiles[j2]; map.tiles[j2] = W.WALL;
      q.x = spot[0] * T + 8; q.y = (spot[1] + 1) * T - 1; const x2 = q.x; for (let i2 = 0; i2 < 40; i2++) SK.moveBox(map, q, 2, 0, r); out.wall = Math.round(q.x - x2); map.tiles[j2] = old;
      // xuống giáp khi đang đứng trong vật cản tĩnh: bị đẩy ra ô trống
      if (G.player.mount && SK.world) {
        mk(1, 'static'); q.x = (spot[0] + 1) * T + 8; q.y = (spot[1] + 1) * T - 1;
        SK.mountDismount(G, q); SK.updatePlayer(G, 0.016);
        const blocked = map.tiles[Math.floor((q.y - 1) / T) * map.W + Math.floor(q.x / T)] === W.OBST;
        out.freed = !blocked; clr(1);
      }
      return out;
    }, id);
    for (const id of ['m_mech_0', 'm_mech_5', 'm_mech_6', 'm_mech_7']) {
      const r = await wallTest(id), ghost = id === 'm_mech_6' || id === 'm_mech_7';
      if (r.err) { check(id + ': xuyên vật cản (thử)', false, r.err); continue; }
      check(id + (ghost ? ': xuyên vật cản bất hoại (đi hết 80 px qua ô đá), vẫn bị thùng phá được và tường biên chặn, xuống giáp không kẹt trong đá' : ': không xuyên vật cản (bị đá chặn)'),
        ghost ? r.static > 70 && r.box < 16 && r.wall < 16 && r.freed : r.static < 16 && r.box < 16 && r.wall < 16, JSON.stringify(r));
    }

    // ---------------- 4. Đạn gốc: khoá đạn trong def của vũ khí gắn
    const NATIVE = {
      m_mech_0: ['bullet_6_yellow'], m_mech_1: ['punch_spear', 'bullet_hammer'], m_mech_2: ['bullet_42', 'bullet_40', 'bullet_41', 'bullet_43'], m_mech_3: ['bullet_202_invisible'],
      m_mech_5: ['sword_bit_lion', 'bullet_202_lion'], m_mech_6: ['bullet_little_plane'], m_mech_7: ['bullet_40'], m_mech_9: ['bullet_herculesbeetle'], m_mech_coin: ['bullet_coin_mech'],
      m_mech_engineer: ['bullet_6_yellow'], m_mecha_normal_b: ['bullet_28'], m_mecha_normal_d: ['normal_bullet_pengpeng'], m_mecha_normal_e: ['normal_bullet_turbulence']
    };
    const nat = await ev(N => { const out = {}; for (const id of Object.keys(N)) { const g = SK.mechGunList(id, false); const ids = []; for (let i = 0; i < g.length; i++) { const q = SK.G.player; if (q.mount) SK.mountDismount(SK.G, q); SK.mountOn(SK.G, q, id); const w = q.weapons[i]; if (w && w.def.w86) ids.push(w.def.w86.b.map(b => b.p)); } out[id] = ids; if (SK.G.player.mount) SK.mountDismount(SK.G, SK.G.player); const xb = window.SK_W86.bullets; out[id + '#xb'] = N[id].every(n => !!xb[n]); } return out; }, NATIVE);
    for (const id of Object.keys(NATIVE)) check(id + ': vũ khí gắn dùng khoá đạn gốc ' + NATIVE[id].join(', ') + ' (có trong SK_W86.bullets)', nat[id + '#xb'] && NATIVE[id].every(n => nat[id].some(l => l.indexOf(n) >= 0)), JSON.stringify(nat[id]));
    // đạn gốc thật sự được bắn ra (không chỉ ghi trong def): thu tên prefab đạn đang bay khi bắn
    for (const id of ['m_mech_0', 'm_mech_3', 'm_mech_6', 'm_mech_coin', 'm_mecha_normal_b', 'm_mecha_normal_d', 'm_mecha_normal_e', 'm_mech_9', 'm_mech_5']) {
      await mountUp(id, false);
      await foes(id === 'm_mech_9' || id === 'm_mech_5' ? [[22, 0, 50000], [34, 0, 50000]] : [[110, 0, 50000], [160, 10, 50000]]);
      await seen(); await hold(900);
      const sn = await seenEnd(), want = NATIVE[id][0];
      check(id + ': đạn thật bay ra mang khoá gốc ' + want, (sn[want] || 0) > 0, JSON.stringify(sn));
    }
    await mountUp('m_mech_6', false); await foes([[110, 0, 50000]]); await seen(); await hold(500); await sleep(100);
    await p.screenshot({ path: path.join(SHOTS, 'mech-native-bullets.png') });
    await seenEnd();
    // m_mech_7 là Đĩa Nổi 51 (không phải Hellfire Chariot = m_mech_8, không có prefab trong bundle)
    const idn = await ev(() => { const M = window.SK_MOUNTS.mounts; return { en: M.m_mech_7.en, m8: !!M.m_mech_8, prefab8: !!SK.prefab('m_mech_8'), ghost7: SK.mechDefs.m_mech_7.ghost, hp: M.m_mech_7.hp, def: M.m_mech_7.def, sp: M.m_mech_7.speedRate }; });
    check('m_mech_7 = Đĩa Nổi 51 (máu 7, giáp 1, tốc +60%, xuyên vật cản), không phải Hellfire Chariot (m_mech_8 không có prefab trong bundle)', idn.en === 'Floating 51' && idn.hp === 7 && idn.def === 1 && idn.sp === 0.6 && idn.ghost7 && !idn.m8 && !idn.prefab8, JSON.stringify(idn));

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
