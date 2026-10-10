/*
 * Nhân Tố Thử Thách của Hiệp Sĩ Linh Hồn (games/soulknight/js/factors.js): mỗi nhân tố đã làm được bật riêng, vào trận thật
 * (SK.lobby.launch('knight', 'level', [khoá])), rồi đọc con số từ trò chơi và so với một lượt đối chứng không nhân tố.
 * Đợt 2 (js/factors2.js): 29 nhân tố còn lại, mỗi cái một ca đo hiệu ứng trước/sau (seed cố định, quái mẫu); bật nhân tố rồi đọc số từ game.
 * Cộng ca giao diện: chọn ba nhân tố trên thẻ "Nhân Tố Thử Thách", bấm Bắt đầu, G.factors đúng ba khoá.
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-factors.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-factors/.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-factors');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? 'ĐẠT ' : 'HỎNG ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (fn, arg) => p.evaluate(fn, arg);
  async function until(fn, arg, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(fn, arg)) return true; await sleep(60); }
    return false;
  }

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  // Hồ sơ đã thắng một lượt cho khỏi vướng khoá; không quan trọng với nhân tố.
  const KEYS = await ev(() => SK.FACTOR_KEYS.slice());
  const shapeOk = await ev(() => SK.FACTOR_KEYS.every(k => { const f = SK.FACTORS[k]; return f.vi && f.desc && ['dễ', 'vừa', 'khó'].includes(f.tier) && typeof f.on === 'function'; }));
  check('SK.FACTORS có ≥ 30 nhân tố, mỗi cái có tên Việt, mô tả, bậc và on(G)', KEYS.length >= 30 && shapeOk, KEYS.length + ' nhân tố');

  // Vào trận với đúng các nhân tố `keys`, đứng yên ở phòng khởi đầu.
  async function start(keys, seed) {
    await ev(([k, s]) => { SK.lobby.enter(); SK_GAME.debug.seed(s); SK_GAME.debug.pet(true); SK.lobby.launch('knight', 'level', k); }, [keys || [], seed || 5]);
    const ok = await until(() => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
    if (!ok) throw new Error('không vào được trận với ' + JSON.stringify(keys));
  }
  const stats = () => ev(() => {
    const G = SK.G, q = G.player;
    return { hpMax: q.hpMax, hp: q.hp, armorMax: q.armorMax, armor: q.armor, energyMax: q.energyMax, energy: q.energy, rateMul: q.rateMul || 1,
      dmgMul: q.dmgMul || 1, crit: q.crit || 0, sizeMul: q.sizeMul || 1, mods: G.mods, factors: G.factors,
      wKind: q.weapons[0].def.kind, wId: q.weapons[0].id, skillCd: q.h.skill.cd, pet: !!G.pet };
  });
  // Vào phòng quái đầu tiên, chờ quái hiện, trả số của quái.
  async function battle(keys, seed) {
    await start(keys, seed);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('battle'); });
    await until(() => SK.G.enemies.some(e => e.st !== 'dead'), null, 8000);
    return ev(() => SK.G.enemies.filter(e => e.st !== 'dead').map(e => ({ id: e.id, hp0: e.d && e.d.hp, hpMax: e.hpMax, hp: e.hp, moveMul: e.moveMul || 1, boss: !!e.bossKey })));
  }

  // ---------------------------------------------------------------- đối chứng
  await start([]);
  const ctl = await stats();
  check('đối chứng: G.factors rỗng, G.mods trung tính', ctl.factors.length === 0 && ctl.mods.enemyHpMul === 1 && ctl.mods.priceMul === 1 && ctl.mods.skillCdMul === 1, JSON.stringify(ctl.factors));
  const ctlBattle = await battle([]);
  check('đối chứng: máu quái = máu gốc', ctlBattle.length > 0 && ctlBattle.every(e => e.hpMax === e.hp0), ctlBattle.map(e => e.id + ':' + e.hpMax + '/' + e.hp0).join(' '));

  // ---------------------------------------------------------------- kẻ địch
  let bt = await battle(['EnemyDoubleHp']);
  check('EnemyDoubleHp: máu quái phòng đầu = 2 × máu gốc', bt.length > 0 && bt.every(e => e.hpMax === 2 * e.hp0 && e.hp === e.hpMax), bt.map(e => e.id + ':' + e.hpMax + '/' + e.hp0).join(' '));

  bt = await battle(['EnemyDefence']);
  const df = await ev(() => {
    const G = SK.G, e = G.enemies.find(x => x.st !== 'dead'); e.st = 'idle'; e.hp = 50;
    SK.hurtEnemy(G, e, 5, false, 0, 0); const a = 50 - e.hp;
    e.hp = 50; SK.hurtEnemy(G, e, 1, false, 0, 0); const c = 50 - e.hp;
    return { a, c };
  });
  check('EnemyDefence: đòn 5 mất 4 máu, đòn 1 vẫn mất 1', df.a === 4 && df.c === 1, JSON.stringify(df));

  bt = await battle(['AggressiveEnemy']);
  const ag = await ev(() => {
    const G = SK.G, e = G.enemies.find(x => x.st !== 'dead'); e.st = 'idle'; e.cd = 5;
    SK.factorsEnemyTick(G, e, 1); const a = e.cd;
    return a;
  });
  check('AggressiveEnemy: hồi chiêu địch chạy ×1,5 (1 s thực = 1,5 s hồi chiêu)', near(ag, 5 - 0.5, 1e-9), 'cd ' + ag);

  bt = await battle(['FastEnemy']);
  const fe = await ev(() => {
    const G = SK.G, e = G.enemies.find(x => x.st !== 'dead' && !x.bossKey); e.st = 'idle';
    let t = 0, stunned = false;
    for (let i = 0; i < 400 && !stunned; i++) { SK.factorsEnemyTick(G, e, 0.1); t += 0.1; if (e.st === 'stun') stunned = true; }
    return { stunned, t, stT: e.stT };
  });
  check('FastEnemy: quái chạy ×1,3', bt.length > 0 && bt.every(e => near(e.moveMul, 1.3)), bt.map(e => e.moveMul).join(','));
  check('FastEnemy: thỉnh thoảng choáng 0,8 s', fe.stunned && fe.t < 12 && near(fe.stT, 0.8), JSON.stringify(fe));

  // đạn quái: tốc độ lúc sinh / tốc độ gốc của súng
  async function bulletRatio(keys) {
    await battle(keys, 11);
    await ev(() => { SK.G.player.invulT = 1e9; });
    // mỗi viên chia cho kỳ vọng min(hệ số, trần tốc đạn / tốc gốc): súng nhanh sát trần (design.js enemyBulletMaxSpeed 30) bị cắt, đó là luật đúng
    await ev(m => { window.__mul = m; }, keys.length ? 1.3 : 1);
    await ev(() => { window.__ratios = []; window.__tap = setInterval(() => { for (const bl of SK.G.bullets) if (bl.side === 'e' && bl.t < 0.05 && !bl.__r && bl.owner && bl.owner.w && bl.owner.w.p && bl.owner.w.p.bullet_speed) { bl.__r = 1; const base = bl.owner.w.p.bullet_speed, cap = SK.DS.rules.enemyBulletMaxSpeed; window.__ratios.push(Math.hypot(bl.vx, bl.vy) / SK.PPU / base / Math.min(window.__mul, cap / base)); } }, 16); });
    await until(() => window.__ratios.length >= 4, null, 25000);
    const r = await ev(() => { clearInterval(window.__tap); return window.__ratios.slice().sort((a, c) => a - c); });
    return r.length ? r[Math.floor(r.length / 2)] : null;
  }
  const rc = await bulletRatio([]), rf = await bulletRatio(['FastEnemyBullet']);
  check('FastEnemyBullet: tốc độ đạn quái ×1,3 (kẹp ở trần tốc đạn) — tỉ lệ đo / kỳ vọng ≈ 1 ở cả đối chứng và nhân tố', rc && rf && near(rc, 1, 0.04) && near(rf, 1, 0.04), 'đối chứng ' + (rc && rc.toFixed(3)) + ' · nhân tố ' + (rf && rf.toFixed(3)));

  // mật độ + tinh anh: lấy mẫu buildWaves của một phòng quái
  async function waves(keys) {
    await start(keys, 7);
    return ev(() => {
      const G = SK.G, room = G.map.rooms.find(r => r.type === 'battle'); let n = 0, ex = 0, tot = 0;
      for (let i = 0; i < 60; i++) for (const w of G.buildWaves(room)) for (const id of w) { n++; if (id.startsWith('ex_')) ex++; }
      return { n: n / 60, ex: ex / Math.max(1, n) };
    });
  }
  const wc = await waves([]), wi = await waves(['Intensive']), we = await waves(['ExEnemy']);
  check('Intensive: đợt quái đông hơn (≥ 1,25 × đối chứng)', wi.n >= wc.n * 1.25, 'đối chứng ' + wc.n.toFixed(1) + ' · nhân tố ' + wi.n.toFixed(1));
  check('ExEnemy: tỉ lệ tinh anh ≥ 35% (đối chứng thấp hơn)', we.ex >= 0.35 && wc.ex < 0.3, 'đối chứng ' + (wc.ex * 100).toFixed(0) + '% · nhân tố ' + (we.ex * 100).toFixed(0) + '%');

  // ---------------------------------------------------------------- máu / giáp / năng lượng
  await start(['LackHp']); let s = await stats();
  check('LackHp: máu tối đa cố định 1, đầy máu', s.hpMax === 1 && s.hp === 1, 'hpMax ' + s.hpMax + ' hp ' + s.hp);

  await start(['LackEnergy']); s = await stats();
  check('LackEnergy: năng lượng tối đa giảm nửa', s.energyMax === Math.round(ctl.energyMax / 2) && s.energy === s.energyMax, ctl.energyMax + ' → ' + s.energyMax);

  await start(['InfiniteEnergy']);
  await ev(() => { SK.G.player.energy = 0; });
  await sleep(200);
  s = await stats();
  check('InfiniteEnergy: hết năng lượng thì được nạp đầy lại', s.energy === s.energyMax && s.energyMax === ctl.energyMax, 'energy ' + s.energy + '/' + s.energyMax);

  await start(['MeridianDisorder']); s = await stats();
  check('MeridianDisorder: HP 1, giáp 1, năng lượng 999', s.hpMax === 1 && s.armorMax === 1 && s.energyMax === 999 && s.energy === 999, [s.hpMax, s.armorMax, s.energyMax].join('/'));

  await start(['Huge']); s = await stats();
  check('Huge: to ×1,3, HP +2, giáp +1', s.sizeMul === 1.3 && s.hpMax === ctl.hpMax + 2 && s.armorMax === ctl.armorMax + 1, 'size ' + s.sizeMul + ' hp ' + ctl.hpMax + '→' + s.hpMax + ' giáp ' + ctl.armorMax + '→' + s.armorMax);
  await start(['Tiny']); s = await stats();
  check('Tiny: nhỏ ×0,75, HP -1, giáp -1', s.sizeMul === 0.75 && s.hpMax === Math.max(1, ctl.hpMax - 1) && s.armorMax === Math.max(0, ctl.armorMax - 1), 'size ' + s.sizeMul + ' hp ' + s.hpMax + ' giáp ' + s.armorMax);

  // tốc chạy: quãng đường đi trong 0,6 s trò chơi khi giữ phím sang phải
  async function speedOf(keys) {
    await start(keys, 5);
    await ev(() => { const q = SK.G.player; q.invulT = 1e9; window.__x0 = q.x; window.__t0 = SK.G.t; });
    await p.keyboard.down('KeyD'); await sleep(600); await p.keyboard.up('KeyD');
    return ev(() => (SK.G.player.x - window.__x0) / (SK.G.t - window.__t0));
  }
  const v0 = await speedOf([]), vH = await speedOf(['Huge']), vT = await speedOf(['Tiny']), vR = await speedOf(['RenduErmai']);
  check('Huge: chạy chậm ×0,85', near(vH / v0, 0.85, 0.08), (vH / v0).toFixed(3));
  check('Tiny: chạy nhanh ×1,2', near(vT / v0, 1.2, 0.08), (vT / v0).toFixed(3));
  check('RenduErmai: chạy nhanh ×1,1', near(vR / v0, 1.1, 0.07), (vR / v0).toFixed(3));
  await start(['RenduErmai']); s = await stats();
  check('RenduErmai: tốc bắn ×1,1, HP +1, bạo kích +5', near(s.rateMul, ctl.rateMul * 1.1, 1e-9) && s.hpMax === ctl.hpMax + 1 && s.crit === ctl.crit + 5, 'rate ' + s.rateMul + ' hp ' + s.hpMax + ' crit ' + s.crit);

  await start(['Tenacious']);
  await ev(() => { const q = SK.G.player; q.hp = 1; });
  await sleep(3600);
  s = await stats();
  check('Tenacious: HP dưới nửa tự hồi 1 điểm sau ~3 s', s.hp >= 2, 'hp ' + s.hp + '/' + s.hpMax);

  async function armorInCombat(keys) {
    await start(keys);
    await ev(() => { SK_GAME.debug.teleportTo('battle'); });
    await until(() => SK.G.room && SK.G.room.state === 'locked', null, 6000);
    await ev(() => { const q = SK.G.player; q.invulT = 1e9; q.armor = 0; q.armorT = 0; q.armorTick = 0; });
    await sleep(1800);
    return ev(() => ({ armor: SK.G.player.armor, locked: SK.G.room && SK.G.room.state === 'locked' }));
  }
  const ac = await armorInCombat([]), ah = await armorInCombat(['HardShield']);
  check('HardShield: giáp không hồi khi đang đánh (đối chứng có hồi)', ac.locked && ah.locked && ac.armor >= 1 && ah.armor === 0, 'đối chứng ' + ac.armor + ' · nhân tố ' + ah.armor);
  await start(['HardShield']); s = await stats();
  check('HardShield: giáp tối đa +3', s.armorMax === ctl.armorMax + 3, ctl.armorMax + ' → ' + s.armorMax);

  // Thuốc chất lượng kém: nhặt bình máu / năng lượng
  async function potion(keys) {
    await start(keys);
    await ev(() => { const q = SK.G.player; q.hp = 1; q.energy = 0; q.invulT = 1e9; for (const kind of ['hp_pot', 'en_pot']) SK.G.pickups.push({ kind, x: q.x, y: q.y - 4, vx: 0, vy: 0, t: 1, z: 0, vz: 0 }); });
    await until(() => !SK.G.pickups.some(k => k.kind === 'hp_pot' || k.kind === 'en_pot'), null, 5000);
    await sleep(150);
    return ev(() => ({ hp: SK.G.player.hp, en: SK.G.player.energy }));
  }
  const pc = await potion([]), pi = await potion(['InferiorMedicine']);
  check('InferiorMedicine: HP và năng lượng hồi nhận được giảm nửa', pc.hp - 1 >= 2 && pi.hp - 1 === Math.round((pc.hp - 1) / 2) && pi.en === Math.round(pc.en / 2) && pc.en > 0,
    'HP +' + (pc.hp - 1) + '→+' + (pi.hp - 1) + ' · năng lượng +' + pc.en + '→+' + pi.en);

  await start(['MoreBrave']);
  const br = await ev(() => {
    const G = SK.G, q = G.player, out = {}; for (let i = 0; i < 5; i++) SK.emit('enemyKill', G, { noReward: false });
    SK.factorsTick(G, q, 0.016); out.after5 = q.dmgMul;
    for (let i = 0; i < 20; i++) SK.emit('enemyKill', G, {});
    SK.factorsTick(G, q, 0.016); out.cap = q.dmgMul;
    for (let i = 0; i < 6; i++) SK.factorsTick(G, q, 1);
    out.reset = q.dmgMul; return out;
  });
  check('MoreBrave: +4% sát thương mỗi quái liên tiếp, tối đa 10 tầng, mất sau 4 s', near(br.after5, 1.2, 1e-9) && near(br.cap, 1.4, 1e-9) && near(br.reset, 1, 1e-9), JSON.stringify(br));

  // ---------------------------------------------------------------- vũ khí, kỹ năng
  await start(['DoubleCd']); let cd = await ev(() => { const G = SK.G, q = G.player; SK.endSkill(G, q); return [q.skillCd, q.h.skill.cd]; });
  check('DoubleCd: hồi chiêu kỹ năng gấp đôi', near(cd[0], cd[1] * 2), cd.join(' vs '));
  await start(['HalfCd']); cd = await ev(() => { const G = SK.G, q = G.player; SK.endSkill(G, q); return [q.skillCd, q.h.skill.cd]; });
  check('HalfCd: hồi chiêu kỹ năng giảm nửa', near(cd[0], cd[1] / 2), cd.join(' vs '));

  // bắn thử bằng vũ khí tự định nghĩa: đọc dmg/crit của viên đạn
  async function shots(keys, crit, n) {
    await start(keys);
    return ev(([c, n]) => {
      const G = SK.G, q = G.player; q.crit = (q.crit || 0) + c;
      const w = { def: { kind: 'gun', dmg: 4, crit: 0, spread: 0, pellets: 1, bulletSpeed: 20, repel: 1 }, cd: 0, kick: 0, q: [] };
      let crits = 0, dmgs = {};
      for (let i = 0; i < n; i++) {
        G.bullets.length = 0;
        SK.WEAPON_KINDS.gun.fire(G, q, w, { x: q.x, y: q.y - 6, ang: 0, side: 1, charge: 1 });
        const bl = G.bullets[G.bullets.length - 1]; if (!bl) continue;
        if (bl.crit) crits++; dmgs[bl.dmg] = (dmgs[bl.dmg] || 0) + 1;
      }
      G.bullets.length = 0;
      return { crits: crits / n, dmgs, ctlCrit: ctlCrit(q) };
      function ctlCrit(pp) { return pp.crit; }
    }, [crit, n]);
  }
  const base100 = await shots([], 100, 20), dc100 = await shots(['DoubleCritic'], 100, 20), cr100 = await shots(['Cruel'], 100, 20);
  const topDmg = o => Number(Object.keys(o.dmgs)[0]);
  check('bạo kích gốc: sát thương 4 × 2 = 8', topDmg(base100) === 8, JSON.stringify(base100.dmgs));
  check('DoubleCritic: sát thương bạo kích 4 × 1,5 = 6', topDmg(dc100) === 6, JSON.stringify(dc100.dmgs));
  check('Cruel: sát thương bạo kích 4 × 2,5 = 10', topDmg(cr100) === 10, JSON.stringify(cr100.dmgs));
  const rate0 = await shots([], 0, 3000), rateD = await shots(['DoubleCritic'], 0, 3000);
  const c0 = ctl.crit;   // tỉ lệ nền của Hiệp Sĩ
  check('DoubleCritic: tỉ lệ bạo kích gấp đôi', near(rate0.crits, c0 / 100, 0.02) && near(rateD.crits, Math.min(1, 2 * c0 / 100), 0.03), 'gốc ' + (rate0.crits * 100).toFixed(1) + '% · nhân tố ' + (rateD.crits * 100).toFixed(1) + '% (nền ' + c0 + '%)');
  // đo ở mức crit +20 để tỉ lệ đủ lớn
  const r20 = await shots([], 20, 3000), r20d = await shots(['DoubleCritic'], 20, 3000);
  check('DoubleCritic: tỉ lệ bạo kích ×2 ở mức +20', near(r20d.crits / r20.crits, 2, 0.25), 'gốc ' + (r20.crits * 100).toFixed(1) + '% · nhân tố ' + (r20d.crits * 100).toFixed(1) + '%');

  await start(['FastShooter']); s = await stats();
  check('FastShooter: tốc bắn ×2, sát thương ×0,5', near(s.rateMul, ctl.rateMul * 2) && near(s.dmgMul, ctl.dmgMul * 0.5), 'rate ' + s.rateMul + ' dmg ' + s.dmgMul);
  await start(['SlowShooter']); s = await stats();
  check('SlowShooter: sát thương ×2, tốc bắn ×0,5', near(s.dmgMul, ctl.dmgMul * 2) && near(s.rateMul, ctl.rateMul * 0.5), 'dmg ' + s.dmgMul + ' rate ' + s.rateMul);
  const fsDmg = await ev(() => {
    const G = SK.G, q = G.player, w = { def: { kind: 'gun', dmg: 4, crit: 0, spread: 0, pellets: 1, bulletSpeed: 20, repel: 1 }, cd: 0, kick: 0, q: [] };
    q.crit = 0; G.bullets.length = 0; SK.WEAPON_KINDS.gun.fire(G, q, w, { x: q.x, y: q.y - 6, ang: 0, side: 1, charge: 1 }); return G.bullets.length ? G.bullets[G.bullets.length - 1].dmg : null;
  });
  check('SlowShooter: viên đạn thử 4 sát thương ra 8', fsDmg === 8, 'dmg ' + fsDmg);

  await start(['OneWeapon']);
  async function pickup(id) {
    await ev(i => { const G = SK.G, q = G.player; G.items.push({ id: i, x: q.x, y: q.y + 2, t: 0 }); }, id);
    await sleep(150); await p.keyboard.press('KeyE'); await sleep(250);
    return ev(() => { const q = SK.G.player; return { w: q.weapons.map(x => x && x.id), cur: q.cur, items: SK.G.items.length }; });
  }
  const wid = await ev(() => SK.weaponPool(1, 'chest')[0]);
  const ow = await pickup(wid);
  await start([]);
  const nw = await pickup(wid);
  check('OneWeapon: nhặt vũ khí thay vũ khí đang cầm (không có ô thứ hai)', ow.w[1] == null && ow.w[0] === wid && ow.items === 1, JSON.stringify(ow));
  check('đối chứng: nhặt vũ khí vào ô thứ hai', nw.w[1] === wid, JSON.stringify(nw));

  await start(['MelleOnly']); s = await stats();
  const pool = await ev(() => { const bad = []; for (let i = 0; i < 40; i++) for (const id of SK.weaponPool(1 + i % 3, i % 2 ? 'shop' : 'chest')) if (SK.DS.weapons[id].kind !== 'melee') bad.push(id); return bad.length; });
  check('MelleOnly: vũ khí khởi đầu và mọi bể rương/lái buôn đều cận chiến', s.wKind === 'melee' && pool === 0, 'khởi đầu ' + s.wId + ' (' + s.wKind + '), ngoài cận chiến trong bể: ' + pool);

  // ---------------------------------------------------------------- cửa hàng, thiên phú, thú cưng, tầm nhìn
  async function price(keys) { await start(keys); return ev(() => [SK.ROOMS.priced(40), SK.ROOMS.priced(1)]); }
  const p0 = await price([]), pInf = await price(['Inflation']), pSale = await price(['SaleDay']);
  check('Inflation: giá lái buôn ×2', pInf[0] === p0[0] * 2, p0[0] + ' → ' + pInf[0]);
  check('SaleDay: giá lái buôn giảm nửa', pSale[0] === Math.round(p0[0] / 2), p0[0] + ' → ' + pSale[0]);
  await start(['BigSale']);
  const bs = await ev(() => { const q = SK.G.player; q.gold = 0; const r = []; for (let i = 0; i < 4; i++) r.push(SK.ROOMS.pay(50)); return { r, gold: q.gold, left: SK.G.mods.freeBuys }; });
  check('BigSale: 3 lần tiêu phí đầu không tốn vàng, lần thứ tư thì tốn', bs.r.join() === 'true,true,true,false' && bs.gold === 0 && bs.left === 0, JSON.stringify(bs));

  async function choice(keys) {
    await start(keys);
    return ev(() => { const R = SK.ROOMS; R.choice.open = false; const ok = R.openChoice(); return { ok, n: R.choice.cards.length, uniq: new Set(R.choice.cards).size, slots: R.buffSlots(), choices: R.buffChoices() }; });
  }
  const c3 = await choice([]), cMore = await choice(['MoreChoice']), cLess = await choice(['LessChoice']), cLB = await choice(['LessBuff']), cMB = await choice(['MoreBuff']);
  check('đối chứng: 3 thẻ thiên phú, 7 ô', c3.n === 3 && c3.slots === 7, JSON.stringify(c3));
  check('MoreChoice: 5 thẻ thiên phú, không trùng', cMore.n === 5 && cMore.uniq === 5 && cMore.slots === 7, JSON.stringify(cMore));
  check('LessChoice: 2 thẻ, 8 ô', cLess.n === 2 && cLess.slots === 8, JSON.stringify(cLess));
  check('LessBuff: 4 thẻ, 6 ô', cLB.n === 4 && cLB.slots === 6, JSON.stringify(cLB));
  check('MoreBuff: 10 ô thiên phú', cMB.slots === 10 && cMB.n === 3, JSON.stringify(cMB));

  // thẻ thứ 5 hiện trên màn chọn thật
  await start(['MoreChoice']);
  await ev(() => { SK.G.phase = 'play'; SK.emit('portalEnter', SK.G, { label: '1-1' }); });
  await sleep(900);
  const ui = await ev(() => ({ open: SK.ROOMS.choice.open, n: SK.ROOMS.choice.cards.length, rects: [0, 1, 2, 3, 4].map(i => SK.loading.cardRect(i)) }));
  await p.screenshot({ path: path.join(SHOTS, 'more-choice.png') });
  check('MoreChoice: màn chọn thiên phú vẽ đủ 5 thẻ cạnh nhau, không đè nhau, chừa chỗ nút Đổi', ui.open && ui.n === 5 && ui.rects.every((r, i) => r && r.w > 20 && r.x >= 0 && r.x + r.w <= 1130 && (!i || r.x >= ui.rects[i - 1].x + ui.rects[i - 1].w - 1)), JSON.stringify(ui.rects.map(r => r && [Math.round(r.x), Math.round(r.w)])));
  await ev(() => { SK.ROOMS.pick(4); });
  const picked = await ev(() => ({ open: SK.ROOMS.choice.open, buffs: SK.G.player.buffs.length }));
  check('MoreChoice: chọn được thẻ thứ 5', !picked.open && picked.buffs === 1, JSON.stringify(picked));

  await start(['AllAlone']); s = await stats();
  check('AllAlone: không có thú cưng (đối chứng có)', !s.pet && ctl.pet, 'nhân tố ' + s.pet + ' · đối chứng ' + ctl.pet);

  async function pixel(keys) {
    await start(keys);
    await ev(() => { SK_GAME.debug.god(true); });
    await sleep(400);
    return ev(() => { const c = SK.hudCtx.canvas, d = SK.hudCtx.getImageData(8, c.height - 8, 1, 1).data; return d[3]; });
  }
  const a0 = await pixel([]), aD = await pixel(['Dark']);
  await p.screenshot({ path: path.join(SHOTS, 'dark.png') });
  check('Dark: góc màn hình tối đặc (alpha ≥ 200), đối chứng trong', aD >= 200 && a0 < 50, 'đối chứng ' + a0 + ' · nhân tố ' + aD);

  // ---------------------------------------------------------------- Hai Lãnh Chúa
  async function bosses(keys) {
    await start(keys, 9);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.stage('1-5'); });
    await until(() => SK_GAME.phase === 'play', null, 6000);
    await ev(() => { SK_GAME.debug.teleportTo('boss'); SK.G.player.y += 5 * 16; });
    await until(() => SK.G.enemies.some(e => e.bossKey), null, 8000);
    await sleep(3500);
    return ev(() => SK.G.enemies.filter(e => e.bossKey && e.st !== 'dead').map(e => ({ k: e.bossKey, hpMax: e.hpMax })));
  }
  const b1 = await bosses([]), b2 = await bosses(['DoubleBoss']);
  check('DoubleBoss: phòng trùm có 2 trùm, mỗi trùm máu 70%', b1.length === 1 && b2.length === 2 && near(b2[0].hpMax / b1[0].hpMax, 0.7, 0.02), JSON.stringify([b1, b2]));
  await p.screenshot({ path: path.join(SHOTS, 'double-boss.png') });

  // ---------------------------------------------------------------- giao diện chọn
  await ev(() => { localStorage.removeItem('sk.profile.v1'); });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="challenge"]');
  await sleep(200);
  const listed = await ev(() => ({ n: document.querySelectorAll('#hs-mode-factors button').length, count: document.querySelector('.hs-fcount').textContent, pic: getComputedStyle(document.querySelector('.hs-mode-pic')).display,
    first: document.querySelector('#hs-mode-factors button b').textContent + ' — ' + document.querySelector('#hs-mode-factors button small').textContent }));
  check('thẻ "Nhân Tố Thử Thách" liệt kê mọi nhân tố với tên + mô tả Việt', listed.n === KEYS.length && /0\/3/.test(listed.count) && listed.pic === 'none', JSON.stringify(listed));
  const PICK = ['Inflation', 'LackEnergy', 'DoubleCd', 'HalfCd'];
  for (const k of PICK) { await p.click('#hs-mode-factors button[data-f="' + k + '"]'); await sleep(60); }
  await p.screenshot({ path: path.join(SHOTS, 'challenge-pick.png') });
  const sel = await ev(() => ({ sel: [...document.querySelectorAll('#hs-mode-factors button.sel')].map(x => x.dataset.f), prof: SK.profile.factors, saved: JSON.parse(localStorage.getItem('sk.profile.v1')).factors, msg: document.querySelector('.hs-fcount').textContent }));
  check('chọn 4 nhân tố: chỉ nhận 3 (tối đa 3), báo đã đủ', [...sel.sel].sort().join() === PICK.slice(0, 3).sort().join() && [...sel.prof].sort().join() === [...sel.sel].sort().join() && /Tối đa/.test(sel.msg), JSON.stringify(sel));
  check('nhân tố đã chọn lưu trong hồ sơ sk.profile.v1 (khoá factors)', [...sel.saved].sort().join() === [...sel.sel].sort().join(), sel.saved.join());
  await p.click('#hs-mode-factors button[data-f="LackEnergy"]'); await sleep(60);   // bỏ chọn rồi chọn lại
  await p.click('#hs-mode-factors button[data-f="LackEnergy"]'); await sleep(60);
  await p.click('#hs-mode-go');
  await sleep(150);
  await p.click('#sk-start');
  const ok2 = await until(() => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
  const run = await ev(() => ({ f: SK.G.factors, mods: { price: SK.G.mods.priceMul, en: SK.G.mods.energyMul, cd: SK.G.mods.skillCdMul } }));
  check('Bắt đầu từ thẻ: G.factors đúng 3 khoá và G.mods dựng từ chúng', ok2 && run.f.length === 3 && ['Inflation', 'LackEnergy', 'DoubleCd'].every(k => run.f.includes(k)) && run.mods.price === 2 && run.mods.en === 0.5 && run.mods.cd === 2, JSON.stringify(run));

  // kết quả cuối lượt liệt kê nhân tố
  await ev(() => { SK.emit('runEnd', SK.G, { won: false, stage: '1-2', kills: 3, gold: 7 }); SK.lobby.enter(); });
  await sleep(300);
  const sum = await ev(() => document.getElementById('hs-modal') ? document.getElementById('hs-modal').textContent : '');
  await p.screenshot({ path: path.join(SHOTS, 'summary.png') });
  check('bảng kết quả liệt kê "Nhân Tố Thử Thách: ..."', /Nhân Tố Thử Thách: .*Tăng Giá/.test(sum) && /Năng Lượng Suy Yếu/.test(sum) && /CD Gấp Bội/.test(sum), sum.slice(0, 160));
  await ev(() => { const b = [...document.querySelectorAll('#hs-modal button')].find(x => x.id === 'hs-claim'); b && b.click(); });

  // Chế độ Ải thường và Khu Thí Luyện: không nhân tố
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="level"]'); await sleep(100);
  await ev(() => { document.getElementById('hs-modes').hidden = true; });
  await p.click('#sk-start');
  await until(() => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
  const lv = await ev(() => ({ f: SK.G.factors, priceMul: SK.G.mods.priceMul }));
  check('Chế độ Ải thường: G.factors rỗng dù hồ sơ còn nhân tố đã chọn', lv.f.length === 0 && lv.priceMul === 1, JSON.stringify(lv));
  await ev(() => { SK.lobby.enter(); SK.lobby.launch('knight', 'bossrush'); });
  await until(() => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
  const brr = await ev(() => ({ f: SK.G.factors, mode: SK_GAME.mode }));
  check('Khu Thí Luyện: G.factors rỗng', brr.mode === 'bossrush' && brr.f.length === 0, JSON.stringify(brr));

  // ================================================================ đợt 2: 29 nhân tố còn thiếu (js/factors2.js)
  // Mỗi nhân tố một ca: dựng hiện trường cố định (seed cố định, quái mẫu), so con số trước/sau khi bật. Hành vi đi qua hàm/sự kiện thật của game
  // (hurtEnemy, hurtPlayer, phím E, phím J, debug.stage...); không tự SK.emit sự kiện game lẽ ra phải phát.
  const NEW29 = ['BadLuck', 'BlackFog', 'BombGift', 'BoxMutation', 'Dejavu', 'EnemyBuffImmune', 'EnemyFlash', 'EnemyReborn', 'EnemySplit', 'Exception', 'FullHouse',
    'GainMount', 'GainWeapon', 'GoodLuck', 'HugePet', 'LongMap', 'MelleWeaken', 'MultiStatue', 'Painless', 'RandomCharactor', 'RebornTwice', 'ReforgeWeapon',
    'SleepWalking', 'SuperFactor', 'TimeDistortion', 'TrackingLaser', 'WeaponEquip', 'WeaponOverheating', 'WrongConfig'];
  const safe = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, 'lỗi: ' + (e && e.message)); } };
  const keys65 = await ev(() => SK.FACTOR_KEYS.slice());
  check('đợt 2: đủ 29 khoá mới trong SK.FACTORS (tổng 65 nhân tố chọn được), có tên Việt + mô tả + bậc + on(G)',
    NEW29.length === 29 && NEW29.every(k => keys65.includes(k)) && keys65.length === 65, keys65.length + ' nhân tố');
  const shape2 = await ev(ks => ks.every(k => { const f = SK.FACTORS[k]; return f && f.vi && f.desc && ['dễ', 'vừa', 'khó'].includes(f.tier) && typeof f.on === 'function' && !/\[(LOC|WIKI|ĐO|ƯỚC LƯỢNG)/.test(f.vi + f.desc); }), NEW29);
  check('đợt 2: chữ hiện cho người chơi không chứa nhãn nguồn', shape2);

  // ---- May mắn / Vận xui: bể vũ khí lệch một bậc
  await safe('GoodLuck/BadLuck', async () => {
    const pools = async ks => { await start(ks, 5); return ev(() => [1, 2, 3].map(l => SK.weaponPool(l, 'chest').slice().sort().join())); };
    const c = await pools([]), g = await pools(['GoodLuck']), bd = await pools(['BadLuck']);
    check('GoodLuck: bể vũ khí cấp l = bể đối chứng cấp l+1 (đối chứng 3 cấp khác nhau)', c[0] !== c[1] && c[1] !== c[2] && g[0] === c[1] && g[1] === c[2] && g[2] === c[2], c.map(x => x.length).join('/'));
    check('BadLuck: bể vũ khí cấp l = bể đối chứng cấp l-1', bd[0] === c[0] && bd[1] === c[0] && bd[2] === c[1]);
  });

  // ---- Hiệu quả tăng cường
  await safe('SuperFactor', async () => {
    await start(['EnemyDoubleHp', 'DoubleCd', 'Inflation', 'SuperFactor']);
    const m = await ev(() => { const M = SK.G.mods; return [M.enemyHpMul, M.skillCdMul, M.priceMul]; });
    check('SuperFactor: độ lệch của nhân tố khác ×1,5 (HP quái 2 → 2,5; hồi chiêu 2 → 2,5; giá 2 → 2,5)', m.join() === '2.5,2.5,2.5', m.join());
    await start(['SuperFactor']);
    const n = await ev(() => { const M = SK.G.mods; return [M.enemyHpMul, M.skillCdMul, M.priceMul, M.hpAdd]; });
    check('SuperFactor một mình: không đổi gì', n.join() === '1,1,1,0', n.join());
    const bt2 = await battle(['EnemyDoubleHp', 'SuperFactor']);
    check('SuperFactor: máu quái trong trận = 2,5 × máu gốc', bt2.length > 0 && bt2.every(e => e.hpMax === Math.round(e.hp0 * 2.5)), bt2.map(e => e.hpMax + '/' + e.hp0).join(' '));
  });

  // ---- Không Có Tri Giác: bốn con số hiện "???"
  await safe('Painless', async () => {
    const spy = () => ev(() => new Promise(res => { const o = SK.text, seen = []; SK.text = function (c, s) { seen.push(String(s)); return o.apply(this, arguments); }; setTimeout(() => { SK.text = o; res(seen.filter(x => x === '???').length); }, 500); }));
    await start([]); const a = await spy();
    await start(['Painless']); const b2 = await spy();
    await p.screenshot({ path: path.join(SHOTS, 'painless.png') });
    check('Painless: HUD vẽ 4 chỗ "???" (máu, giáp, năng lượng, vàng), đối chứng không có', a === 0 && b2 >= 4, 'đối chứng ' + a + ' · nhân tố ' + b2);
  });

  // ---- Khí độc lan tràn
  await safe('BlackFog', async () => {
    await start([], 5); const z0 = await ev(() => SK.G._fog.length);
    await start(['BlackFog'], 5);
    const z1 = await ev(() => { const G = SK.G, z = G._fog[0], q = G.player; z.x = q.x; z.y = q.y - 4; q.invulT = 0; window.__hp0 = q.hp + q.armor; return G._fog.length; });
    await sleep(1300);
    const a = await ev(() => ({ st: SK.G.player._fog, hid: !!SK.G.player.hidden }));
    await p.screenshot({ path: path.join(SHOTS, 'fog.png') });
    await sleep(5600);
    const b2 = await ev(() => ({ st: SK.G.player._fog, lost: window.__hp0 - (SK.G.player.hp + SK.G.player.armor) }));
    await ev(() => { SK.G._fog[0].x += 900; });
    await sleep(2200);
    const c = await ev(() => ({ st: SK.G.player._fog, hid: !!SK.G.player.hidden }));
    check('BlackFog: 2 vùng sương độc mỗi ải (đối chứng không có)', z0 === 0 && z1 === 2, z0 + ' / ' + z1);
    check('BlackFog: trong sương tàng hình và cộng 2 tầng/giây', a.hid && a.st >= 1.5 && a.st <= 3.2, JSON.stringify(a));
    check('BlackFog: đủ 10 tầng thì mất HP (≥ 2 điểm)', b2.st >= 10 && b2.lost >= 2, JSON.stringify(b2));
    check('BlackFog: ra khỏi sương tầng giảm 6/giây về 0, hết tàng hình', c.st === 0 && !c.hid, JSON.stringify(c));
  });

  // ---- Rương Bom
  await safe('BombGift', async () => {
    async function chestRun(keys) {
      await start(keys, 9);
      const out = [];
      for (const want of [true, false]) {
        const info = await ev(w => {
          const G = SK.G, room = G.map.rooms.find(r => r.type === 'battle'); let c = null;
          for (let i = 0; i < 300 && !c; i++) {
            G.chests.length = 0; G.onRoomCleared(room);
            const k = G.chests.find(x => x.kind === 'reward');
            if (k && (!G.mods.bombGift || !!k.bomb === w)) c = k;
          }
          if (!c) return null;
          G.chests.length = 0; G.chests.push(c); G.items.length = 0; G.pickups.length = 0;
          const q = G.player; q.x = c.x; q.y = c.y + 6; q.invulT = 0; q.hp = q.hpMax; q.armor = q.armorMax; window.__hp0 = q.hp + q.armor;
          return { bomb: !!c.bomb };
        }, want);
        if (!info) { out.push(null); continue; }
        await ev(() => { const q = SK.G.player; q.gold = 0; q.energy = 0; window.__g0 = 0; });
        await sleep(100); await p.keyboard.press('KeyE'); await sleep(1500);
        out.push(await ev(() => { const q = SK.G.player, k = {}; for (const x of SK.G.pickups) k[x.kind] = (k[x.kind] || 0) + 1; return { bomb: !!SK.G.chests[0].bomb, open: SK.G.chests[0].open, lost: window.__hp0 - (q.hp + q.armor), coins: q.gold + (k.coin || 0), energy: q.energy + (k.energy || 0), pots: (k.hp_pot || 0) + (k.en_pot || 0) }; }));
      }
      return out;
    }
    const ctlC = await chestRun([]), bg = await chestRun(['BombGift']);
    check('đối chứng: mở rương thưởng ra vàng + cầu năng lượng, không mất máu', ctlC[1] && ctlC[1].open && ctlC[1].coins >= 4 && ctlC[1].energy > 0 && ctlC[1].lost === 0, JSON.stringify(ctlC[1]));
    check('BombGift: rương bom mở là nổ, mất 2 điểm máu/giáp, không rơi gì', bg[0] && bg[0].bomb && bg[0].open && bg[0].lost === 2 && bg[0].coins === 0 && bg[0].energy === 0, JSON.stringify(bg[0]));
    check('BombGift: rương không phải bom chỉ rơi vàng (≥ 4), không năng lượng/bình, không mất máu', bg[1] && !bg[1].bomb && bg[1].open && bg[1].coins >= 4 && bg[1].energy === 0 && bg[1].pots === 0 && bg[1].lost === 0, JSON.stringify(bg[1]));
  });

  // ---- Rương Đột Biến
  await safe('BoxMutation', async () => {
    async function boxes(keys) {
      await start(keys, 5);
      return ev(() => {
        const G = SK.G, list = [...G.map.obs.values()].filter(o => o.kind === 'box'), mut = list.filter(o => o.mutated);
        G.pickups.length = 0; const hp0 = G.player.hp + G.player.armor;
        for (const o of list) SK.hitObstacle(G, o, 999);
        const k = {}; for (const x of G.pickups) k[x.kind] = (k[x.kind] || 0) + 1;
        const log = G._boxLog.slice(), exp = { coin: 0, energy: 0, hp_pot: 0 };
        for (const l of log) if (l === 'coin') exp.coin += 5; else if (l === 'energy') exp.energy += 3; else if (l === 'hp_pot') exp.hp_pot += 1;
        return { n: list.length, mut: mut.length, log, k, exp };
      });
    }
    const c = await boxes([]), m = await boxes(['BoxMutation']);
    check('BoxMutation: một phần thùng đột biến (đối chứng không có)', c.mut === 0 && m.mut >= 2 && m.mut < m.n, 'đối chứng ' + c.mut + '/' + c.n + ' · nhân tố ' + m.mut + '/' + m.n);
    check('BoxMutation: phá mỗi thùng đột biến cho đúng một phần thưởng, đồ rơi khớp bảng', m.log.length === m.mut && (m.k.coin || 0) >= m.exp.coin && (m.k.energy || 0) >= m.exp.energy && (m.k.hp_pot || 0) >= m.exp.hp_pot && m.log.every(l => ['coin', 'energy', 'hp_pot', 'bomb', 'poison', 'ice'].includes(l)), JSON.stringify({ log: m.log, k: m.k }));
  });

  // ---- Giác quan, Mở Rộng Nhà Ngục, Đèn Thần: dựng màn
  await safe('map', async () => {
    const sigs = seed => ev(sd => {
      const G = SK.G; SK_GAME.debug.seed(sd);
      const out = [];
      for (const lb of ['1-1', '1-2', '1-3', '1-4']) { SK_GAME.debug.stage(lb); out.push({ sig: G.map.rooms.map(r => r.type + r.gx + r.gy + r.patternId).join('|'), dv: G.dejavuOf || null, lb }); }
      return out;
    }, seed);
    const dup = a => a.length - new Set(a.map(x => x.sig)).size;
    let cDup = 0, dDup = 0, dOk = true, shown = '';
    for (const sd of [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]) {
      await start([], 5); const c = await sigs(sd);
      await start(['Dejavu'], 5); const d = await sigs(sd);
      cDup += dup(c); dDup += dup(d);
      for (const x of d) if (x.dv) dOk = dOk && d.some(y => y.lb === x.dv && y.sig === x.sig);
      if (!shown && dup(d)) shown = 'seed ' + sd + ': ' + d.map(x => x.lb + (x.dv ? '←' + x.dv : '')).join(' ');
    }
    check('Dejavu: 10 seed × 4 ải: đối chứng không bao giờ lặp bố cục; có Giác quan thì có ải lặp đúng bố cục ải đã qua (cùng nhãn nguồn)', cDup === 0 && dDup >= 3 && dOk, 'đối chứng lặp ' + cDup + ' · nhân tố lặp ' + dDup + ' · ' + shown);
    const rooms = ks => ev(() => {
      const G = SK.G, out = []; SK_GAME.debug.seed(31);
      for (const s of SK.STAGES) { if (s.br) continue; SK_GAME.debug.stage(s.label); out.push({ b: G.map.rooms.filter(r => r.type === 'battle').length, sp: G.map.rooms.filter(r => r.type === 'special').length, boss: s.boss }); }
      return out;
    });
    await start([], 5); const rc = await rooms();
    await start(['LongMap'], 5); const rl = await rooms();
    await start(['FullHouse'], 5); const rf = await rooms();
    check('đối chứng: mỗi ải 1 phòng đặc biệt, phòng đánh 3 (ải trùm 4)', rc.every((x, i) => x.sp === 1 && x.b === (x.boss ? 4 : 3)), JSON.stringify(rc.map(x => x.b + '/' + x.sp)));
    check('LongMap: một số ải có thêm đúng 1 phòng đánh so với đối chứng, ải khác giữ nguyên, không ải nào bớt', rl.some((x, i) => x.b === rc[i].b + 1) && rl.some((x, i) => x.b === rc[i].b) && rl.every((x, i) => x.b - rc[i].b === 0 || x.b - rc[i].b === 1), rc.map(x => x.b).join() + ' → ' + rl.map(x => x.b).join());
    check('FullHouse: mọi ải có 2 phòng đặc biệt (đối chứng 1)', rf.every(x => x.sp === 2), rf.map(x => x.sp).join());
    // bố cục mới đi được: vào phòng đánh thêm khoá được và dọn được
    await start(['LongMap', 'FullHouse'], 31);
    const walk = await ev(() => {
      const G = SK.G; SK_GAME.debug.seed(31);
      for (const s of SK.STAGES) { SK_GAME.debug.stage(s.label); if (G.map.rooms.filter(r => r.type === 'battle').length === 4) break; }
      return { ok: G.map.rooms.length, linked: G.map.rooms.every(r => r.links.length >= 1), battle: G.map.rooms.filter(r => r.type === 'battle').length };
    });
    await p.screenshot({ path: path.join(SHOTS, 'longmap.png') });
    check('LongMap + FullHouse: mọi phòng đều có lối nối', walk.linked && walk.ok >= 9, JSON.stringify(walk));
  });

  // ---- Thiết lập lỗi
  await safe('WrongConfig', async () => {
    const kinds = ks => ev(() => {
      const G = SK.G, room = G.map.rooms.find(r => r.type === 'battle'); let mx = 0, units = 1e9;
      for (let i = 0; i < 40; i++) { const w = G.buildWaves(room), ids = new Set(); for (const wv of w) { units = Math.min(units, wv.length); for (const id of wv) ids.add(id); } mx = Math.max(mx, ids.size); }
      return { mx, units };
    });
    await start([], 7); const c = await kinds(); await start(['WrongConfig'], 7); const w = await kinds();
    check('WrongConfig: mỗi phòng chỉ một loại quái (đối chứng có phòng ≥ 2 loại), mỗi đợt ≥ 1 con', c.mx >= 2 && w.mx === 1 && w.units >= 1, 'đối chứng tối đa ' + c.mx + ' loại · nhân tố ' + w.mx);
  });

  // ---- Mộng Du
  await safe('SleepWalking', async () => {
    await start([], 5); const a = await ev(() => SK.STAGES.map(s => s.label));
    await start(['SleepWalking'], 5); const b2 = await ev(() => SK.STAGES.map(s => s.label));
    check('SleepWalking: 1-1 giữ đầu, 14 ải sau xáo lẫn lộn, đủ 15 ải mỗi ải một lần', b2[0] === '1-1' && b2.join() !== a.join() && [...b2].sort().join() === [...a].sort().join(), b2.join(' '));
    await ev(() => { SK.G.stageIdx = 0; });
    const walk = await ev(() => { const G = SK.G, seen = []; for (let i = 1; i < SK.STAGES.length; i++) { SK_GAME.debug.stage(SK.STAGES[i].label); seen.push(G.stage.label + ':' + G.map.rooms.length); } return seen.length; });
    check('SleepWalking: vào được cả 14 ải theo thứ tự mới', walk === 14, String(walk));
  });

  // ---- Thuần Thú Sư, Thiên Giáng Thần Binh
  await safe('GainMount/GainWeapon', async () => {
    await ev(() => { window.__mo = []; if (!window.__moHook) { window.__moHook = 1; SK.on('mountOn', (G, m) => window.__mo.push(m.id)); } });
    await start([], 5); const c = await ev(() => ({ m: !!SK.G.player.mount, n: window.__mo.length, items: SK.G.items.length }));
    await start(['GainMount'], 5);
    const g1 = await ev(() => ({ m: SK.G.player.mount && SK.G.player.mount.id, n: window.__mo.length }));
    const ids = await ev(() => { const M = SK_MOUNTS; return (M.sellers.creature || []).concat((M.sellers.mech || []).filter(id => SK.mechImpl && SK.mechImpl(id))); });
    const g2 = await ev(() => { SK_GAME.debug.stage('1-2'); const a = window.__mo.length; SK_GAME.debug.stage('2-1'); return { same: a, after: window.__mo.length }; });
    check('GainMount: vào 1-1 nhận một thú cưỡi trong bể bán; 1-2 không nhận; 2-1 (cảnh mới) nhận thêm', !c.m && c.n === 0 && ids.includes(g1.m) && g1.n === 1 && g2.same === 1 && g2.after === 2, JSON.stringify({ c, g1, g2 }));
    await start(['GainWeapon'], 5);
    const w1 = await ev(() => { const G = SK.G, it = G.items[0]; return { n: G.items.length, ok: it && !!SK.DS.weapons[it.id], below: it && it.y > G.player.y, id: it && it.id }; });
    const w2 = await ev(() => { SK_GAME.debug.stage('1-2'); const a = SK.G.items.length; SK_GAME.debug.stage('2-1'); return { a, b: SK.G.items.length }; });
    check('GainWeapon: vào cảnh mới có 1 vũ khí nằm dưới chân (đối chứng 0); ải giữa tầng không', c.items === 0 && w1.n === 1 && w1.ok && w1.below && w2.a === 0 && w2.b === 1, JSON.stringify({ w1, w2 }));
    await p.keyboard.press('KeyE'); await sleep(200);
    const pk = await ev(() => SK.G.player.weapons.filter(Boolean).length);
    check('GainWeapon: nhặt được bằng phím E vào ô vũ khí', pk >= 1, 'ô vũ khí ' + pk);
  });

  // ---- Đúc Lại Vũ Khí
  await safe('ReforgeWeapon', async () => {
    async function ids(keys) {
      await start(keys, 5);
      return ev(() => {
        const G = SK.G, q = G.player, N = SK.ROOMS.dnpc, out = [], seq = ['1-2', '1-3', '1-4', '2-1', '2-2', '2-3'];
        let prev = q.weapons[0].id;
        for (const lb of seq) {
          SK_GAME.debug.stage(lb); const now = q.weapons[0].id;
          out.push({ prev, now, inPool: N.reforgePool(SK.DS.weapons[prev]).includes(now) }); prev = now;
        }
        return out;
      });
    }
    const c = await ids([]), r = await ids(['ReforgeWeapon']);
    check('ReforgeWeapon: đối chứng giữ nguyên vũ khí qua 6 ải; có nhân tố thì đổi, vũ khí mới luôn cùng nhóm đúc lại', c.every(x => x.prev === x.now) && r.filter(x => x.prev !== x.now).length >= 3 && r.every(x => x.inPool), r.map(x => x.prev + '→' + x.now).join(' '));
  });

  // ---- Bậc Thầy Phụ Kiện
  await safe('WeaponEquip', async () => {
    await start([], 5); const c = await ev(() => { const w = SK.G.player.weapons[0]; return { att: !!w.att, dmg: w.def.dmg, crit: w.def.crit, cost: w.def.cost, name: w.def.name }; });
    await start(['WeaponEquip'], 5); const a = await ev(() => { const w = SK.G.player.weapons[0]; return { att: w.att && w.att.key, dmg: w.def.dmg, crit: w.def.crit, cost: w.def.cost, name: w.def.name }; });
    check('WeaponEquip: vũ khí khởi đầu tự có phụ kiện (chỉ số đổi, tên có ★); đối chứng không', !c.att && a.att && /★/.test(a.name) && (a.dmg !== c.dmg || a.crit !== c.crit || a.cost !== c.cost), JSON.stringify({ c, a }));
    const id2 = await ev(() => SK.weaponPool(1, 'chest').find(id => SK.DS.weapons[id].kind === 'gun'));
    await ev(i => { const G = SK.G, q = G.player; G.items.push({ id: i, x: q.x, y: q.y + 2, t: 0 }); }, id2);
    await sleep(150); await p.keyboard.press('KeyE'); await sleep(250);
    const w2 = await ev(() => { const w = SK.G.player.weapons[1]; return w && { id: w.id, att: w.att && w.att.key }; });
    check('WeaponEquip: vũ khí nhặt trong trận cũng tự có phụ kiện', w2 && w2.id === id2 && !!w2.att, JSON.stringify(w2));
  });

  // ---- Đa Nhân Cách
  await safe('RandomCharactor', async () => {
    await start(['RandomCharactor'], 5);
    const r = await ev(() => {
      const G = SK.G, q = G.player, out = [];
      for (const lb of ['1-2', '1-3', '2-1']) {
        q.hp = Math.max(1, Math.ceil(q.hpMax * 0.6)); const ratio = q.hp / q.hpMax, before = q.hero; SK_GAME.debug.stage(lb);
        out.push({ before, now: q.hero, hpOk: q.hp === Math.min(q.hpMax, Math.max(1, Math.ceil(ratio * q.hpMax))) || Math.abs(q.hp / q.hpMax - ratio) < 0.5, skill: !!(q.h && q.h.skill), hpMax: q.hpMax, h: q.h === SK.DS.heroes[q.hero] || !!q.h.hp });
      }
      return out;
    });
    await start([], 5);
    const c = await ev(() => { const q = SK.G.player, h0 = q.hero; SK_GAME.debug.stage('1-2'); SK_GAME.debug.stage('1-3'); return h0 === q.hero; });
    check('RandomCharactor: mỗi tầng kế đổi sang nhân vật khác, giữ tỉ lệ máu, có kỹ năng (đối chứng không đổi)', c && r.every(x => x.now !== x.before && x.hpOk && x.skill), r.map(x => x.before + '→' + x.now + '(' + x.hpMax + ')').join(' '));
    // vào trận lại và bắn được: không lỗi ở khung hình tiếp theo
    await sleep(300);
    const alive = await ev(() => SK.G.player.st === 'alive' && SK_GAME.state === 'stage');
    check('RandomCharactor: sau khi đổi nhân vật trận vẫn chạy', alive);
  });

  // ---- Hồi Sinh Thức Tỉnh
  await safe('RebornTwice', async () => {
    const die = ks => start(ks, 5).then(() => ev(() => {
      const G = SK.G, q = G.player, o = { revived: 0, hits: 0, maxHp: q.hpMax };
      for (let i = 0; i < 30 && q.st !== 'dead'; i++) {   // đòn nặng bị giới hạn theo từng nhát (onHurt), nên đánh liên tục tới khi chết
        const left = G.revivesLeft; q.invulT = 0; SK.hurtPlayer(G, 999); o.hits++;
        if (G.revivesLeft < left) { o.revived++; o.hpAfter = q.hp; o.stAfter = q.st; }
      }
      o.st = q.st; return o;
    }));
    const c = await die([]), r = await die(['RebornTwice']);
    check('đối chứng: bị hạ là chết, không hồi sinh', c.st === 'dead' && c.revived === 0, JSON.stringify(c));
    check('RebornTwice: bị hạ lần 1 hồi sinh đầy máu và sống, lần 2 mới chết (đúng 1 lần hồi sinh)', r.revived === 1 && r.stAfter === 'alive' && r.hpAfter === r.maxHp && r.st === 'dead' && r.hits > c.hits, JSON.stringify(r));
  });

  // ---- Đa Tượng Điêu Khắc
  await safe('MultiStatue', async () => {
    async function buy(keys) {
      await start(keys, 5);
      return ev(() => {
        const G = SK.G, R = SK.ROOMS, q = G.player, room = G.map.rooms.find(r => r.type === 'special');
        R.force.special = 'statue';
        const got = [];
        for (const id of [1, 2, 3]) {
          R.force.statue = id; const n = G.interactables.length;
          SK.ROOM_FILL.special(G, room, SK.world.roomCenter(room));
          const it = G.interactables[G.interactables.length - 1]; if (G.interactables.length === n) continue;
          q.gold = 9999; it.use(); got.push(id);
        }
        R.force.special = null; R.force.statue = null;
        return { statues: q.statues.slice(), got };
      });
    }
    const c = await buy([]), m = await buy(['MultiStatue']);
    check('MultiStatue: dâng 3 tượng khác nhau giữ cả 3 hiệu quả (đối chứng chỉ giữ 1)', c.statues.length === 1 && m.statues.length === 3 && m.got.length === 3, JSON.stringify({ c, m }));
  });

  // ---- Biến To Pet
  await safe('HugePet', async () => {
    async function pet(keys) {
      await ev(() => { SK.petForce = 'pet0'; });
      await battle(keys, 5);
      const o = await ev(() => { const G = SK.G, a = G.pet; return a && { scale: a.scale || 1, dmg: a.k.dmg, cd: a.k.cd }; });
      await ev(() => {
        const G = SK.G, a = G.pet, e = G.enemies.find(x => x.st !== 'dead');
        for (const q of G.enemies) if (q !== e) { q.st = 'dead'; q.hp = 0; }
        e.st = 'idle'; e.hp = e.hpMax = 9999; e.cd = 99; e.stT = 99; G.player.x = e.x - 8; G.player.y = e.y; a.x = e.x - 4; a.y = e.y; a.cd = 0; a.rest = 0; a.scan = 0; a.target = null; window.__pe = e; window.__pe0 = e.hp;
      });
      await until(() => window.__pe.hp < window.__pe0, null, 4000);
      o.bite = await ev(() => window.__pe0 - window.__pe.hp);
      return o;
    }
    const c = await pet([]), h = await pet(['HugePet']);
    await ev(() => { SK.petForce = null; });
    check('HugePet: cỡ ×2, sát thương ×5, hồi chiêu ngắn hơn', c && h && c.scale === 1 && h.scale === 2 && near(h.dmg, c.dmg * 5, 1e-9) && h.cd < c.cd, JSON.stringify({ c, h }));
    check('HugePet: nhát cắn thật gây gấp 5 (đo trên quái mẫu)', c.bite > 0 && h.bite === c.bite * 5, 'đối chứng ' + c.bite + ' · nhân tố ' + h.bite);
  });

  // ---- Kẻ Địch Chớp Nhoáng / Tế Bào Phân Liệt / hồi sinh / Tinh Thần
  await safe('enemy2', async () => {
    async function flash(keys) {
      await battle(keys, 5);
      return ev(() => {
        const G = SK.G, e = G.enemies.find(x => x.st !== 'dead' && !x.bossKey); e.st = 'idle'; e.hp = e.hpMax = 99999; e.kx = e.ky = 0;
        let moved = 0, bad = 0; const r = e.room, T = SK.TILE;
        for (let i = 0; i < 40; i++) {
          const x0 = e.x, y0 = e.y; SK.hurtEnemy(G, e, 1, false, 0, 0);
          if (e.x !== x0 || e.y !== y0) { moved++; const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T); if (tx < r.x0 || tx > r.x1 || ty < r.y0 || ty > r.y1 || SK.world.solidAt(G.map, e.x, e.y)) bad++; }
        }
        return { moved, bad };
      });
    }
    const fc = await flash([]), ff = await flash(['EnemyFlash']);
    check('EnemyFlash: bị đánh thì dịch chuyển ~50% số đòn, luôn đáp trong phòng, ngoài tường (đối chứng 0)', fc.moved === 0 && ff.moved >= 8 && ff.moved <= 32 && ff.bad === 0, 'đối chứng ' + fc.moved + '/40 · nhân tố ' + ff.moved + '/40');

    async function split(keys) {
      await battle(keys, 5);
      return ev(() => {
        const G = SK.G, e = G.enemies.find(x => x.st !== 'dead' && !x.bossKey); e.st = 'idle'; e.hp = e.hpMax = 40; const kills0 = G.kills, alive0 = G.enemies.filter(x => x.st !== 'dead').length;
        SK.hurtEnemy(G, e, 10, false, 0, 0);   // 30/40: chưa dưới nửa
        const mid = G.enemies.length;
        SK.hurtEnemy(G, e, 15, false, 0, 0);   // 15/40: dưới nửa
        const kids = G.enemies.filter(x => x._split && x !== e);
        return { alive0, mid: mid, n: G.enemies.length, alive: G.enemies.filter(x => x.st !== 'dead').length, hp: kids.map(k => k.hp + '/' + k.hpMax), orig: e.st, kills: G.kills - kills0, id: kids.map(k => k.id === e.id) };
      });
    }
    const sc = await split([]), sp = await split(['EnemySplit']);
    check('đối chứng: đánh dưới nửa máu không phân liệt', sc.alive === sc.alive0 && sc.kills === 0, JSON.stringify(sc));
    check('EnemySplit: dưới 50% máu thì biến mất, thành 2 con cùng loại mỗi con 50% máu gốc (20/20 từ 40), không tính hạ quái', sp.n === sp.mid + 2 && sp.alive === sp.alive0 + 1 && sp.hp.join() === '20/20,20/20' && sp.orig === 'dead' && sp.kills === 0 && sp.id.every(Boolean), JSON.stringify(sp));

    async function reborn(keys) {
      await battle(keys, 5);
      return ev(() => {
        const G = SK.G, base = G.enemies.find(x => x.st !== 'dead' && !x.bossKey), room = base.room; let rev = 0, hpOk = 0, rs = 0; const kills0 = G.kills;
        for (let i = 0; i < 80; i++) {
          const e = SK.makeEnemy(G, base.id, base.x, base.y, room); e.st = 'idle'; G.enemies.push(e);
          const hm = e.hpMax; SK.hurtEnemy(G, e, 99999, false, 0, 0);
          if (e.st === 'spawn' && e._reborn) { rev++; if (e.hpMax === Math.max(1, Math.round(hm * 0.5)) && e.hp === e.hpMax) hpOk++; SK.hurtEnemy(G, Object.assign(e, { st: 'idle' }), 99999, false, 0, 0); if (e.st === 'dead') rs++; }
        }
        return { rev, hpOk, rs, kills: G.kills - kills0 };
      });
    }
    const rc = await reborn([]), rb = await reborn(['EnemyReborn']);
    check('EnemyReborn: ~20% quái chết hồi sinh với nửa máu, chỉ một lần (đối chứng 0)', rc.rev === 0 && rb.rev >= 4 && rb.rev <= 32 && rb.hpOk === rb.rev && rb.rs === rb.rev, 'đối chứng ' + rc.rev + '/80 · nhân tố ' + rb.rev + '/80 · ' + JSON.stringify(rb));

    async function immune(keys) {
      await battle(keys, 5);
      await ev(() => { const G = SK.G, e = G.enemies.find(x => x.st !== 'dead' && !x.bossKey); e.st = 'idle'; e.hp = e.hpMax = 99999; e.cd = 99; window.__ie = e; SK.skillKit.debuff(G, e, 'poison'); SK.skillKit.debuff(G, e, 'ice'); });
      await sleep(250);
      return ev(() => ({ poison: window.__ie._db.poison.t, ice: window.__ie._db.ice.t, stun: window.__ie.stT }));
    }
    const ic = await immune([]), ii = await immune(['EnemyBuffImmune']);
    check('EnemyBuffImmune: thời gian chịu độc (5 s) và băng (2,75 s) giảm nửa (đối chứng nguyên)', ic.poison > 4.4 && ic.ice > 2.2 && ii.poison < 2.6 && ii.ice < 1.4 && ii.poison > 1.8 && ii.stun <= ii.ice + 0.01, JSON.stringify({ ic, ii }));
  });

  // ---- Nguyên Tố Bất Thường
  await safe('Exception', async () => {
    await start(['Exception'], 5);
    const a = await ev(() => { const G = SK.G, q = G.player; q.invulT = 0; q.hp = q.hpMax; q.armor = q.armorMax; SK.hurtPlayer(G, 1); const ail = q._ail && q._ail.k, at = q._ailAt; q.invulT = 0; SK.hurtPlayer(G, 1); return { ail, same: q._ailAt === at && q._ail && q._ail.k === ail, hp0: q.hp + q.armor }; });
    await sleep(1500);
    const b2 = await ev(() => { const q = SK.G.player; return { hp: q.hp + q.armor, mv: q.moveMul == null ? 1 : q.moveMul, ail: q._ail && q._ail.k }; });
    await sleep(4200);
    const c = await ev(() => { const q = SK.G.player; return { ail: q._ail, mv: q.moveMul == null ? 1 : q.moveMul }; });
    check('Exception: bị đánh thì dính một trạng thái bất thường; đòn thứ hai trong 5 s không đổi trạng thái', ['burn', 'poison', 'ice', 'shock'].includes(a.ail) && a.same, JSON.stringify(a));
    check('Exception: trạng thái có tác dụng (cháy/độc mất máu, băng/tê liệt chậm chạy) rồi hết', ((a.ail === 'burn' || a.ail === 'poison') ? b2.hp < a.hp0 : b2.mv < 1) && c.ail === null && c.mv === 1, JSON.stringify({ a, b2, c }));
  });

  // ---- Vũ khí quá nóng
  await safe('WeaponOverheating', async () => {
    async function rate(keys) {
      await start(keys, 5);
      await ev(() => {
        const G = SK.G, q = G.player, id = Object.entries(SK.DS.weapons).filter(([k, d]) => d.kind === 'gun' && d.rps >= 6 && (d.cost || 0) <= 1 && SK.frame(d.sprite)).map(x => x[0])[0];
        SK_GAME.debug.give(id); window.__fires = []; if (!window.__fh) { window.__fh = 1; SK.on('fire', (G2, q2, w) => window.__fires.push([G2.t, w.def.kind])); }
        window.__fires.length = 0; q.energy = q.energyMax = 9999; q.invulT = 1e9;
      });
      await p.keyboard.down('KeyJ'); await sleep(5000); await p.keyboard.up('KeyJ');
      return ev(() => {
        const t = window.__fires.map(f => f[0]), iv = []; for (let i = 1; i < t.length; i++) iv.push(t[i] - t[i - 1]);
        const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
        return { n: t.length, first: med(iv.slice(0, 6)), last: med(iv.slice(-6)) };
      });
    }
    const c = await rate([]), h = await rate(['WeaponOverheating']);
    check('WeaponOverheating: bắn liên tục ≥ 12 phát thì chu kỳ giữa hai phát giãn ra ~2 lần (đối chứng không đổi)', c.n >= 20 && h.n >= 20 && near(c.last / c.first, 1, 0.3) && h.last / h.first >= 1.7, 'đối chứng ' + (c.last / c.first).toFixed(2) + ' (' + c.n + ' phát) · nhân tố ' + (h.last / h.first).toFixed(2) + ' (' + h.n + ' phát)');
    await sleep(900);
    const cool = await ev(() => ({ heat: SK.G.player._heat, rm: SK.G.player.rateMul }));
    check('WeaponOverheating: nghỉ 0,7 s thì nguội, tốc đánh về như cũ', cool.heat === 0, JSON.stringify(cool));
  });

  // ---- Vũ khí cận chiến không tiêu hủy đạn
  await safe('MelleWeaken', async () => {
    async function slash(keys, withW86) {
      await start(keys, 5);
      const ok = await ev(w86 => {
        const G = SK.G, q = G.player, id = Object.entries(SK.DS.weapons).filter(([k, d]) => d.kind === 'melee' && !!d.w86 === w86 && SK.frame(d.sprite) && (d.cost || 0) === 0).map(x => x[0])[0];
        if (!id) return false;
        SK_GAME.debug.give(id); q.invulT = 1e9; q.aim = 0; q.face = 1; G.bullets.length = 0;
        window.__eb = []; for (const dy of [-3, 0, 3]) window.__eb.push(SK.spawnBullet86(G, 'e', 'bullet_0', q.x + 14, q.y - 7 + dy, 0, { spd: 1, dmg: 1, h: 7, life: 6 }));
        return true;
      }, withW86);
      if (!ok) return null;
      await p.keyboard.down('KeyJ'); await sleep(350); await p.keyboard.up('KeyJ');
      return ev(() => ({ dead: window.__eb.filter(b => b.dead).length, n: window.__eb.length, melee: SK.G.player.weapons[SK.G.player.cur].def.name }));
    }
    for (const w86 of [true, false]) {
      const c = await slash([], w86), m = await slash(['MelleWeaken'], w86);
      if (!c || !m) { check('MelleWeaken ' + (w86 ? '(vệt chém 8.6)' : '(quạt cũ)') + ': có vũ khí mẫu', false, 'không có vũ khí cận chiến mẫu'); continue; }
      check('MelleWeaken ' + (w86 ? '(vệt chém 8.6)' : '(quạt cũ)') + ': đối chứng chém tan đạn địch, có nhân tố thì đạn còn nguyên', c.dead >= 1 && m.dead === 0, 'đối chứng tan ' + c.dead + '/' + c.n + ' · nhân tố tan ' + m.dead + '/' + m.n + ' (' + m.melee + ')');
    }
  });

  // ---- Tốc độ dòng chảy thời gian
  await safe('TimeDistortion', async () => {
    await start(['TimeDistortion'], 5);
    const t = await ev(() => {
      const G = SK.G, q = G.player, ms = []; q.invulT = 0;
      for (let i = 0; i < 40; i++) { SK.factorsTick(G, q, 1); ms.push(q._tdM); }
      return { min: Math.min(...ms), max: Math.max(...ms), track: Math.abs(q.moveMul - q._tdM) < 1e-9 };
    });
    check('TimeDistortion: tốc độ người chơi lúc nhanh (>1) lúc chậm (<1) trong 0,6..1,5', t.min < 0.9 && t.max > 1.1 && t.min >= 0.6 && t.max <= 1.5 && t.track, JSON.stringify(t));
    const px = async m => { await ev(mm => { const G = SK.G; G.player._tdM = mm; G.player._tdT = 1e9; SK.hud.render(G); }, m); return ev(() => { const c = SK.hudCtx.canvas, d = SK.hudCtx.getImageData(3, Math.floor(c.height / 2), 1, 1).data; return [d[0], d[1], d[2], d[3]]; }); };
    const fast = await px(1.4), slow = await px(0.7);
    await p.screenshot({ path: path.join(SHOTS, 'time.png') });
    check('TimeDistortion: viền màn hình xanh khi nhanh, đỏ khi chậm', fast[3] > 50 && fast[1] > fast[0] + 40 && slow[3] > 50 && slow[0] > slow[1] + 40, 'nhanh ' + fast + ' · chậm ' + slow);
    await battle(['TimeDistortion'], 5);
    await sleep(1800);
    const es = await ev(() => SK.G.enemies.filter(e => e.st !== 'dead' && !e.bossKey).map(e => e._tdM || 1));
    check('TimeDistortion: quái cũng đổi tốc độ riêng', es.length > 0 && es.some(x => x !== 1) && es.every(x => x >= 0.6 && x <= 1.5), es.map(x => x.toFixed(2)).join(','));
  });

  // ---- Laser theo vết
  await safe('TrackingLaser', async () => {
    await ev(() => { SK.factorsCfg.laser.first = 0.3; });
    await start(['TrackingLaser'], 5);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('battle'); });
    await until(() => SK.G.room && SK.G.room.state === 'locked', null, 6000);
    await ev(() => {
      const G = SK.G, q = G.player; q.invulT = 1e9;
      for (const e of G.enemies) if (e.st !== 'dead') { e.hp = 0; e.st = 'dead'; }
      const d = SK.makeEnemy(G, G.map.th.enemies.find(id => SK.D.enemies[id]), q.x + 6, q.y, G.room); d.st = 'stun'; d.stT = 99; d.hp = d.hpMax = 999; d.cd = 99; G.enemies.push(d); window.__dummy = d; G.room.waveDelay = 999;
    });
    const aim = await until(() => SK.G._laser && SK.G._laser.t > 0.5, null, 6000);
    const a = await ev(() => { const G = SK.G, z = G._laser, q = G.player, want = Math.atan2(q.y - 6 - z.O[1], q.x - z.O[0]); return { d: Math.abs(z.ang - want), t: z.t }; });
    await p.screenshot({ path: path.join(SHOTS, 'laser-aim.png') });
    const beam = await until(() => SK.G._laser && SK.G._laser.t > 2.4, null, 6000);
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, 'laser-beam.png') });
    const b2 = await ev(() => { const z = SK.G._laser; return { dummy: 999 - window.__dummy.hp, hits: z && z.hits, pHits: z && z.pHits }; });
    await until(() => !SK.G._laser, null, 4000);
    await ev(() => { SK.factorsCfg.laser.first = 6; });
    check('TrackingLaser: giai đoạn đầu tia bám sát người chơi', aim && a.d < 0.01, JSON.stringify(a));
    check('TrackingLaser: tia đỏ gây 2 sát thương mỗi nhịp lên cả quái mẫu lẫn người chơi', beam && b2.dummy >= 2 && b2.dummy % 2 === 0 && b2.pHits >= 1, JSON.stringify(b2));
  });

  // ---- Đối chứng cuối: nhân tố mới hiện trên thẻ chọn và nhận được
  await safe('card', async () => {
    await ev(() => { localStorage.removeItem('sk.profile.v1'); });
    await p.reload(); await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
    await ev(() => SK.lobby.openModes());
    await p.click('.hs-mode[data-mode="challenge"]'); await sleep(200);
    const n = await ev(() => ({ n: document.querySelectorAll('#hs-mode-factors button').length, has: !!document.querySelector('#hs-mode-factors button[data-f="Dejavu"]') }));
    await p.screenshot({ path: path.join(SHOTS, 'cards65.png') });
    check('thẻ "Nhân Tố Thử Thách" liệt kê cả 65 nhân tố, có nhân tố mới', n.n === 65 && n.has, JSON.stringify(n));
  });

  check('không lỗi trang / console', !errs.length, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail + '   Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
