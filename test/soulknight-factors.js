/*
 * Nhân Tố Thử Thách của Hiệp Sĩ Linh Hồn (games/soulknight/js/factors.js): mỗi nhân tố đã làm được bật riêng, vào trận thật
 * (SK.lobby.launch('knight', 'level', [khoá])), rồi đọc con số từ trò chơi và so với một lượt đối chứng không nhân tố.
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
    await ev(() => { window.__ratios = []; window.__tap = setInterval(() => { for (const bl of SK.G.bullets) if (bl.side === 'e' && bl.t < 0.05 && !bl.__r && bl.owner && bl.owner.w && bl.owner.w.p && bl.owner.w.p.bullet_speed) { bl.__r = 1; window.__ratios.push(Math.hypot(bl.vx, bl.vy) / SK.PPU / bl.owner.w.p.bullet_speed); } }, 16); });
    await until(() => window.__ratios.length >= 4, null, 25000);
    const r = await ev(() => { clearInterval(window.__tap); return window.__ratios.slice().sort((a, c) => a - c); });
    return r.length ? r[Math.floor(r.length / 2)] : null;
  }
  const rc = await bulletRatio([]), rf = await bulletRatio(['FastEnemyBullet']);
  check('FastEnemyBullet: tốc độ đạn quái ×1,3 so với đối chứng', rc && rf && near(rf / rc, 1.3, 0.04), 'đối chứng ' + (rc && rc.toFixed(3)) + ' · nhân tố ' + (rf && rf.toFixed(3)));

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

  check('không lỗi trang / console', !errs.length, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(results.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail + '   Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
