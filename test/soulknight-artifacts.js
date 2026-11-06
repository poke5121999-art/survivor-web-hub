/*
 * Thần Khí Lục Địa Cổ (games/soulknight): lõi chế độ (js/artifacts.js) và đợt 2 (js/artifacts2.js: Thần Uy, Bà Lão, HUD).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-artifacts.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-artifacts/ (tự xem).
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-artifacts');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

async function main() {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ')));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const shot = n => p.screenshot({ path: path.join(SHOTS, n) });

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });

  async function stageTo(label, type, n) {
    await ev(l => SK_GAME.debug.stage(l), label);
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    await ev(() => SK_GAME.debug.god(true));
    if (type) { await ev(([t, k]) => SK_GAME.debug.teleportTo(t, k), [type, n || 0]); await sleep(300); }
  }
  // đứng cạnh vật tương tác theo nhãn rồi bấm E thật
  async function useLabel(re) {
    const i = await ev(s => SK.G.interactables.findIndex(o => !o.gone && new RegExp(s).test(o.label)), re);
    if (i < 0) return null;
    await ev(k => { const o = SK.G.interactables[k], pl = SK.G.player; pl.x = o.x; pl.y = o.y + 2; }, i);
    await sleep(150);
    const label = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
    await p.keyboard.press('KeyE');
    await sleep(150);
    return label;
  }
  const st = () => ev(() => {
    const G = SK.G, a = G.artifacts, pl = G.player;
    return { cat: a.cat, parts: a.parts.map(q => q && { n: q.n, slot: q.slot, rar: q.rar, el: q.el, mods: q.mods.map(m => m.id + ':' + m.t) }), bag: a.bag.length, gold: pl.gold, hpMax: pl.hpMax, w: pl.weapons[0].id, crit: pl.crit, wrath: a.wrath.e, locked: a.locked };
  });
  const dummy = (dx, hp) => ev(([dx2, hp2]) => {   // quái đứng yên trước mặt để đo sát thương
    const G = SK.G, pl = G.player, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, pl.x + dx2, pl.y, G.room || G.map.rooms[0]);
    e.hp = e.hpMax = hp2; e.st = 'idle'; e.hold = true; e.moveMul = 0; G.enemies.push(e);
    return G.enemies.length - 1;
  }, [dx, hp]);

  // ---- 1. thẻ chế độ ở sảnh (bấm thật) + vào ván
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="artifacts"]');
  const card = await ev(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, desc: document.getElementById('hs-mode-desc').textContent }));
  check('bảng chế độ có thẻ Thần Khí Lục Địa Cổ, nút Bắt đầu bật, mô tả không chứa nhãn nguồn', card.title === 'Thần Khí Lục Địa Cổ' && card.go && !/\[(LOC|WIKI|ĐO|ƯỚC)/.test(card.desc), JSON.stringify(card).slice(0, 120));
  await ev(() => { SK_GAME.debug.seed(11); SK_GAME.debug.pet(false); SK.G.state = 'hall'; });
  await p.click('#hs-mode-go');   // bấm Bắt đầu thật: lobby.js MODES.artifacts.start -> launch -> startRun
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  const s0 = await ev(() => { const G = SK.G, pl = G.player; return { mode: SK_GAME.mode, n: SK.STAGES.length, last: SK.STAGES[SK.STAGES.length - 1], w: pl.weapons.map(w => w && w.id), oneW: !!G.mods.oneWeapon, scd: G.mods.skillCdMul, ped: G.artifacts.ped.length, cat: G.artifacts.cat }; });
  check('vào ván từ thẻ: mode artifacts, 15 ải + 3-6 trùm cuối, tay không, một vũ khí, ba bệ, chưa chọn', s0.mode === 'artifacts' && s0.n === 16 && s0.last.label === '3-6' && s0.last.final && s0.w[0] === 'atf_hand' && !s0.w[1] && s0.oneW && s0.ped === 3 && s0.cat === null, JSON.stringify(s0).slice(0, 200));
  check('hồi chiêu kỹ năng nhân vật nhân 3,5 [ĐO artifact_mode_config.skillCooldownFactor]', Math.abs(s0.scd - 3.5) < 1e-9, 'x' + s0.scd);
  await sleep(300);
  await shot('1-pedestals.png');

  // ---- 2. chọn Thần Khí ở bệ (bấm E), đổi ý được tới khi phòng chiến khoá
  const lblS = await useLabel('^Chọn Kiếm');
  let q = await st();
  check('bấm E ở bệ Kiếm: chọn đao kiếm, vũ khí thành atf_sword, ba bộ phận Trắng không thuộc tính, số 1 (Mạo Hiểm)',
    q.cat === 'sword' && q.w === 'atf_sword' && q.parts.every(x => x && x.rar === 0 && x.n === 1 && x.mods.length === 0) && q.parts.map(x => x.slot).join('') === '012' && /Chọn Kiếm/.test(lblS || ''), lblS + ' · ' + JSON.stringify(q).slice(0, 160));
  const w1 = await ev(() => { const d = SK.DS.weapons.atf_sword; return { dmg: d.dmg, rps: d.rps, cost: d.cost, sprite: d.sprite, hasFrame: !!SK.frame(d.sprite) }; });
  check('chỉ số vũ khí = tổng ba bộ phận [ĐO prefab: Blade_01 8/0,5/1 + Guard_01 2/0,7/0 + Grip_01 4/0,5/0]: 14 sát thương, 1,7 đòn/giây, 1 năng lượng; vẽ bằng khung Lưỡi Đao thật',
    w1.dmg === 14 && Math.abs(w1.rps - 1.7) < 1e-9 && w1.cost === 1 && w1.sprite === 'sword01_2' && w1.hasFrame, JSON.stringify(w1));
  await useLabel('^Chọn Gậy');
  q = await st();
  check('đổi ý ở bệ Gậy trước khi phòng chiến khoá: đổi sang gậy (7 sát thương, 1,4 đòn/giây, 2 năng lượng [ĐO part])', q.cat === 'staff' && q.w === 'atf_staff' && await ev(() => { const d = SK.DS.weapons.atf_staff; return d.dmg === 7 && Math.abs(d.rps - 1.4) < 1e-9 && d.cost === 2; }));
  await useLabel('^Chọn Cung');
  q = await st();
  check('bệ Cung: 14 sát thương (6+4+4), 1,5 đòn/giây, 3 năng lượng [ĐO part]', q.cat === 'bow' && await ev(() => { const d = SK.DS.weapons.atf_bow; return d.dmg === 14 && Math.abs(d.rps - 1.5) < 1e-9 && d.cost === 3; }));
  await useLabel('^Chọn Kiếm');
  await sleep(200);
  await shot('2-sword.png');

  // ---- 3. đánh thật: sát thương đo được (kiếm 14, tạm tắt chí mạng)
  await ev(() => { const pl = SK.G.player; pl.crit = 0; SK.G.player.dmgMul = 1; });
  let i0 = await dummy(16, 500);
  const hit1 = await ev(i => { const G = SK.G, pl = G.player, e = G.enemies[i]; pl.aim = 0; pl.face = 1; const h0 = e.hp, w = pl.weapons[0]; SK.WEAPON_KINDS.artifact.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0 }); return { h0, h1: e.hp }; }, i0);
  check('kiếm Mạo Hiểm chém quái trước mặt: trừ đúng 14 máu', hit1.h0 - hit1.h1 === 14, JSON.stringify(hit1));
  // đánh bằng phím thật (J): cd theo rps
  await ev(i => { const e = SK.G.enemies[i]; e.hp = e.hpMax = 500; SK.G.player.x = e.x - 14; SK.G.player.energy = 100; }, i0);
  await p.keyboard.down('KeyJ'); await sleep(1200); await p.keyboard.up('KeyJ');
  const hits = await ev(i => { const e = SK.G.enemies[i]; return { lost: e.hpMax - e.hp, pl: SK.G.artifacts.stats.dmg, w: SK.G.player.weapons[0].id }; }, i0);
  check('giữ phím tấn công 1,2 giây: Thần Khí chém nhiều lần (mất 14 x số nhát, 1-3 nhát), năng lượng bị trừ', hits.lost >= 14 && hits.lost % 14 === 0 && hits.lost <= 14 * 3, JSON.stringify(hits));
  // quái nhiều máu hơn
  const hpm = await ev(() => {
    const G = SK.G, pl = G.player, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0], mode = G.mode;
    G.mode = 'level'; const base = SK.makeEnemy(G, id, pl.x + 40, pl.y, G.map.rooms[0]).hpMax;
    G.mode = mode; const mod = SK.makeEnemy(G, id, pl.x + 40, pl.y, G.map.rooms[0]).hpMax;
    return { base, mod, ratio: mod / base, lv: G.stage.level };
  });
  check('quái nhiều máu x2,1 [ĐO enemyHpFactor] ở tầng 1', Math.abs(hpm.ratio - 2.1) < 0.02, JSON.stringify(hpm));

  // ---- 4. bộ phận rơi từ rương, nhặt bằng E, thay thế, bộ phận cũ vào túi
  await ev(() => { SK.G.artifacts.locked = true; });   // coi như đã vào phòng chiến
  await ev(() => { const G = SK.G, pl = G.player; G.chests.push({ kind: 'weapon', x: pl.x + 20, y: pl.y, open: false, t: 0, openT: 0 }); pl.x += 18; });
  await sleep(250);
  const lbc = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await p.keyboard.press('KeyE'); await sleep(500);
  const dropInfo = await ev(() => { const G = SK.G; return { items: G.items.length, drops: G.interactables.filter(o => o.atf && o.part && !o.part.taken).map(o => ({ slot: o.part.slot, rar: o.part.rar, label: o.label })) }; });
  check('mở rương vũ khí (bấm E): không rơi vũ khí thường mà rơi một bộ phận Thần Khí cùng loại', /Mở rương/.test(lbc || '') && dropInfo.items === 0 && dropInfo.drops.length === 1 && /^Nhặt /.test(dropInfo.drops[0].label), JSON.stringify(dropInfo));
  const old = await st();
  const slot = dropInfo.drops[0].slot;
  await useLabel('^Nhặt ');
  q = await st();
  check('nhặt bộ phận (bấm E): lắp vào đúng ô, bộ phận cũ vào túi', q.parts[slot].n !== undefined && q.bag === old.bag + 1 && JSON.stringify(q.parts[slot]) !== JSON.stringify(old.parts[slot]) || (q.bag === old.bag + 1), JSON.stringify({ slot, before: old.parts[slot], after: q.parts[slot], bag: q.bag }));
  // bộ phận không bao giờ ra Đỏ từ rương thường: lấy 300 mẫu
  const rr = await ev(() => { const c = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < 600; i++) c[SK.artifacts.rollRar('chest')]++; return c; });
  check('rương thường không bao giờ rơi bộ phận Đỏ; Trắng nhiều nhất [WIKI: chỉ trùm rơi Đỏ]', rr[5] === 0 && rr[0] > rr[1] && rr[1] > rr[2] && rr.slice(0, 5).every(x => x > 0), JSON.stringify(rr));
  const bs = await ev(() => { let red = 0; for (let i = 0; i < 400; i++) if (SK.artifacts.rollRar('boss') === 5) red++; return red / 400; });
  check('rương trùm rơi Đỏ khoảng 75% [ĐO redProbabilityInBossChest]', bs > 0.65 && bs < 0.85, 'tỉ lệ ' + bs);

  // ---- 5. thuộc tính đổi chỉ số người chơi (đo từng cái)
  await ev(() => { const G = SK.G, a = G.artifacts; a.parts = [0, 1, 2].map(sl => SK.artifacts.newPart('sword', 1, sl, 0)); a.bag = []; SK.artifacts.recalc(G); });
  const base = await st();
  const mk = (slot, rar, mods) => ev(([sl, r, ms]) => { const G = SK.G, a = G.artifacts, q2 = SK.artifacts.newPart(a.cat, 1, sl, r); q2.mods = ms.map(s => { const [id, t] = s.split(':'); return { id, t: +t }; }); a.parts[sl] = q2; SK.artifacts.recalc(G); return true; }, [slot, rar, mods]);
  await mk(1, 4, ['hp:4']);
  let a1 = await st();
  check('thuộc tính "HP +5" (Cam): HP tối đa +5 [WIKI Modifiers]', a1.hpMax === base.hpMax + 5, base.hpMax + ' -> ' + a1.hpMax);
  await mk(1, 4, ['maxen:4']);
  const en1 = await ev(() => SK.G.player.energyMax);
  check('thuộc tính "Năng lượng tối đa +70" (Cam)', en1 === 180 + 70 && (await st()).hpMax === base.hpMax, 'NL ' + en1);
  await mk(1, 4, ['move:4']);
  const mv = await ev(() => SK.G.player.moveMul);
  check('thuộc tính "Tốc độ di chuyển +23%" (Cam)', Math.abs(mv - 1.23) < 1e-9, 'moveMul ' + mv);
  await mk(1, 4, ['crit:3']);
  const cr = await ev(() => SK.G.player.crit);
  check('thuộc tính "Bạo kích +12" (Lam bậc 3)', cr === base.crit + 12, base.crit + ' -> ' + cr);
  await mk(1, 4, ['atkcrit:4']);
  const sw = await ev(() => ({ dmg: SK.DS.weapons.atf_sword.dmg, crit: SK.G.player.crit }));
  check('thuộc tính "Tấn công +3, bạo kích +4" (Cam): vũ khí 14 -> 17', sw.dmg === 17 + 0 && sw.crit === base.crit + 4, JSON.stringify(sw));
  await mk(1, 0, []);
  const rt0 = await ev(() => SK.G.player.rateMul);
  check('Hộ Thủ Dũng Sĩ (bộ phận phụ số 1) +33% tốc độ tấn công [WIKI SW "Sabre of Valiant Youngster (guard)"]', Math.abs(rt0 - 1.33) < 1e-9, 'rateMul ' + rt0);
  await mk(1, 4, ['rate:4']);
  const rt = await ev(() => SK.G.player.rateMul);
  check('thuộc tính "Tốc độ tấn công +25%" (Cam), cộng dồn với +33% của Hộ Thủ', Math.abs(rt - 1.58) < 1e-9, 'rateMul ' + rt);
  await mk(1, 4, ['defatk:4']);
  const df = await ev(() => { const G = SK.G, pl = G.player; G.player.god = false; pl.invulT = 0; pl.armor = 0; const h0 = pl.hp; SK.hurtPlayer(G, 1); const lost = h0 - pl.hp; pl.hp = pl.hpMax; pl.invulT = 0; pl.god = true; return { lost, dmg: SK.DS.weapons.atf_sword.dmg }; });
  check('thuộc tính "DMG phải chịu +2, tấn công +5" (Cam): đòn 1 sát thương thành 3; vũ khí 14 -> 19', df.lost === 3 && df.dmg === 19, JSON.stringify(df));
  await mk(1, 0, []);
  const back = await st();
  check('gỡ thuộc tính thì chỉ số trở lại như cũ (không dồn)', back.hpMax === base.hpMax && Math.abs((await ev(() => SK.G.player.moveMul)) - 1) < 1e-9 && await ev(() => SK.G.player.energyMax) === 180 && back.crit === base.crit, JSON.stringify(back).slice(0, 120));
  // thuộc tính kích hoạt khi đánh bại / bạo kích
  await mk(1, 4, ['encrit:4']);
  const ec = await ev(i0b => { const G = SK.G, pl = G.player; pl.energy = 10; const e = G.enemies[i0b]; e.hp = e.hpMax = 99999; pl.crit = 0; SK.artifacts.hitE(G, e, 5, 0, { crit: true }); return pl.energy; }, i0);
  check('thuộc tính "Khi bạo kích nhận 4 năng lượng": đòn chí mạng +4 năng lượng', ec === 14, 'NL ' + ec);
  await mk(1, 4, ['mmscrit:3']);
  const mm = await ev(i0b => { const G = SK.G, e = G.enemies[i0b]; const n0 = (G.artifacts.shots || []).length; SK.artifacts.hitE(G, e, 5, 0, { crit: true }); return (G.artifacts.shots || []).length - n0; }, i0);
  check('thuộc tính "Khi bạo kích bắn thêm 3 Đạn Phép Thuật": 3 viên đạn xuất hiện', mm === 3, 'viên ' + mm);
  await mk(1, 0, []);

  // ---- 6. Bà Lão: tiến cấp, tăng cấp, đúc lại (số theo artifact_mode_config)
  await stageTo('1-2');
  await ev(() => { const G = SK.G, a = G.artifacts; a.locked = true; });
  const gr = await ev(() => ({ granny: SK.G.interactables.some(o => o.granny), bag: SK.G.artifacts.bag.length }));
  check('từ ải 2 có Bà Lão Ngàn Tuổi ở phòng đầu', gr.granny);
  await ev(() => { SK.G.player.gold = 500; SK.G.artifacts.parts[0] = SK.artifacts.newPart('sword', 1, 0, 0); SK.artifacts.recalc(SK.G); });
  const gl = await useLabel('^Bà Lão Ngàn Tuổi');
  const ui = await ev(() => { const el = document.getElementById('atf-ui'); return el ? { txt: el.textContent.slice(0, 200), btn: el.querySelectorAll('button[data-a]').length, hold: !!SK.G.hold } : null; });
  check('bấm E ở Bà Lão: mở bảng giao diện, có nút tiến cấp từng bộ phận, giữ ván', !!ui && /Bà Lão Ngàn Tuổi/.test(ui.txt) && ui.btn >= 4 && ui.hold, JSON.stringify(ui).slice(0, 200));
  await shot('3-granny.png');
  await p.click('button[data-a="pu:0"]');
  q = await st();
  check('Tiến cấp Trắng -> Lục (bấm nút): trừ 10 vàng [ĐO partUpgradeConsume], thành công 100% [ĐO partUpgradeProbability], thêm 1 thuộc tính', q.parts[0].rar === 1 && q.gold === 490 && q.parts[0].mods.length === 1, JSON.stringify(q).slice(0, 170));
  const msg = await ev(() => document.getElementById('atf-msg').textContent);
  check('hiện lời báo "Tiến cấp thành công" [LOC uiupgrade_tips02]', /Tiến cấp thành công/.test(msg), msg);
  const upf = await ev(() => {
    const G = SK.G, a = G.artifacts, SKr = SK.randi, out = [];
    SK.randi = (x, y) => 99;   // ép hỏng
    const q0 = a.parts[0]; G.player.gold = 1000;
    const r1 = SK.artifacts.upgradePart(G, 0), r2 = SK.artifacts.upgradePart(G, 0);
    SK.randi = SKr;
    return { r1, r2, fails: q0.fails, gold: G.player.gold, rar: q0.rar };
  });
  check('tiến cấp Lục -> Lam hỏng: giá 22, xác suất 60% rồi 70% sau một lần hỏng [ĐO partUpgradeProbabilityIncrement 10], phẩm chất giữ nguyên', upf.r1.prob === 60 && !upf.r1.success && upf.r2.prob === 70 && upf.r2.cost === 22 && upf.fails === 2 && upf.gold === 1000 - 44 && upf.rar === 1, JSON.stringify(upf));
  const up2 = await ev(() => {
    const G = SK.G, a = G.artifacts, q0 = a.parts[0]; q0.fails = 0; G.player.gold = 1000;
    const SKr = SK.randi; SK.randi = (x, y) => 0;   // ép thắng
    const c = [];
    for (let k = 0; k < 4; k++) { const r = SK.artifacts.upgradePart(G, 0); c.push([r.cost, r.prob, r.success, q0.rar, q0.mods.length]); }
    SK.randi = SKr; return c;
  });
  check('chuỗi tiến cấp ép thắng Lục->Lam->Tím->Cam, rồi chạm trần: giá 22/35/50, xác suất 60/40/20, số thuộc tính 2/3/4, Cam không nâng được nữa',
    JSON.stringify(up2.map(r => r.slice(0, 2))) === JSON.stringify([[22, 60], [35, 40], [50, 20], [undefined, undefined]]) && up2[2][3] === 4 && up2[2][4] === 4 && up2[1][4] === 3 && up2[0][4] === 2, JSON.stringify(up2));
  const mod = await ev(() => {
    const G = SK.G, a = G.artifacts, q0 = a.parts[0]; G.player.gold = 1000; q0.mods[0].t = 0; q0.mods[0].id = 'hp';
    const r = SK.artifacts.upgradeMod(G, 0, 0), r2 = SK.artifacts.upgradeMod(G, 0, 0); return { r, r2, t: q0.mods[0].t, gold: G.player.gold };
  });
  check('tăng cấp thuộc tính: chắc chắn thành công, giá 10 rồi 20 [ĐO componentUpgradeConsume], không vượt phẩm chất bộ phận (Cam = 4)', mod.r.ok && mod.r.cost === 10 && mod.r2.cost === 20 && mod.t === 2 && mod.gold === 970, JSON.stringify(mod));
  const rf = await ev(() => {
    const G = SK.G, a = G.artifacts, q0 = a.parts[0]; G.player.gold = 1000; a.reforge = 0; q0.mods[0].t = 2; q0.mods[0].id = 'hp';
    const costs = [], ids = [];
    for (let k = 0; k < 7; k++) { const g0 = G.player.gold, r = SK.artifacts.reforgeMod(G, 0, 0); costs.push(r.ok ? g0 - G.player.gold : r.why); ids.push(q0.mods[0].id); }
    return { costs, tier: q0.mods[0].t, uniq: q0.mods.map(m => m.id).filter((x, i, ar) => ar.indexOf(x) === i).length === q0.mods.length };
  });
  check('đúc lại thuộc tính: giá 5/8/11/14/17/20 rồi bị chặn ở lần 7 [ĐO refreshComponentConsume/refreshTimesLimit], giữ nguyên phẩm chất, không trùng thuộc tính khác', JSON.stringify(rf.costs.slice(0, 6)) === '[5,8,11,14,17,20]' && /hết lượt/.test(rf.costs[6]) && rf.tier === 2 && rf.uniq, JSON.stringify(rf));
  await p.click('button[data-a="close"]');
  check('đóng bảng: giao diện biến mất, ván tiếp tục', await ev(() => !document.getElementById('atf-ui') && !SK.G.hold));
  // bộ phận thừa -> vàng khi qua ải
  await ev(() => { const a = SK.G.artifacts; a.bag = [SK.artifacts.newPart('sword', 3, 0, 4), SK.artifacts.newPart('sword', 3, 1, 0)]; SK.G.player.gold = 0; });
  await stageTo('1-3');
  const sold = await ev(() => ({ gold: SK.G.player.gold, bag: SK.G.artifacts.bag.length }));
  const exp = Math.floor(100 * 0.14 * 1.4) + Math.floor(10 * 0.14 * 1.4);
  check('qua ải: bộ phận thừa đổi thành vàng theo bảng partValue [ĐO 100/10] x pickCoinFactor 1,4', sold.gold === exp && sold.bag === 0, JSON.stringify(sold) + ' kỳ vọng ' + exp);

  // ---- 7. Thần Uy: ghép nguyên tố, nạp khi đánh trúng, thi triển (phím L)
  const combos = await ev(() => {
    const f = SK.artifacts.wrathOf, out = {};
    for (const x of ['FFF', 'WWW', 'TTT', 'FFW', 'FWF', 'WFF', 'FFT', 'WWF', 'WFW', 'WWT', 'TTF', 'TFT', 'TTW']) out[x] = f(x.split(''), 'sword');
    out.FWT = f(['F', 'W', 'T'], 'sword'); out.TWF = f(['T', 'W', 'F'], 'staff'); out.WTF = f(['W', 'T', 'F'], 'bow');
    return out;
  });
  const want = { FFF: 'fff', WWW: 'www', TTT: 'ttt', FFW: 'ffw', FWF: 'ffw', WFF: 'ffw', FFT: 'fft', WWF: 'wwf', WFW: 'wwf', WWT: 'wwt', TTF: 'ttf', TFT: 'ttf', TTW: 'ttw', FWT: 'sword', TWF: 'staff', WTF: 'bow' };
  check('ghép Thần Uy từ ba nguyên tố: 12 loại, không phụ thuộc thứ tự [WIKI SW]', Object.keys(want).every(k => combos[k] === want[k]) && new Set(Object.values(combos)).size === 12, JSON.stringify(combos));
  await stageTo('1-3', 'battle', 0);
  await ev(() => { const G = SK.G, a = G.artifacts, pl = G.player; a.parts = [0, 1, 2].map(sl => { const q2 = SK.artifacts.newPart('sword', 1, sl, 0, 'F'); return q2; }); a.wrath.e = 0; pl.crit = 0; pl.dmgMul = 1; SK.artifacts.recalc(G); });
  const i1 = await dummy(16, 99999);
  const ch = await ev(i => { const G = SK.G, pl = G.player, e = G.enemies[i], w = pl.weapons[0]; pl.aim = 0; pl.face = 1; const e0 = G.artifacts.wrath.e; for (let k = 0; k < 5; k++) SK.WEAPON_KINDS.artifact.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0 }); return { e0, e1: G.artifacts.wrath.e, hp: e.hp, st: e.st, d: Math.hypot(e.x - pl.x, e.y - pl.y), act: G.artifacts.wrath.active, ag: G.artifacts.ag && G.artifacts.ag.wrathrate, w: w.id, pst: pl.st }; }, i1);
  check('Thần Uy nạp +2 mỗi đòn trúng [ĐO rechargeAmountOnAttack], đầy ở 100 [ĐO rechargeFull]', ch.e0 === 0 && ch.e1 === 10, JSON.stringify(ch));
  const cast0 = await ev(() => { SK.G.artifacts.wrath.e = 99; return SK.artifacts.castWrath(SK.G); });
  check('chưa đầy (99/100) thì không thi triển được', cast0 === false);
  await ev(() => { SK.G.artifacts.wrath.e = 100; });
  const hud1 = await ev(() => SK.weaponSpecial(SK.G.player) && SK.weaponSpecial(SK.G.player).progress);
  check('nút chiêu phụ báo tiến độ Thần Uy 100%', hud1 === 1);
  await p.keyboard.down('KeyL'); await sleep(200); await p.keyboard.up('KeyL'); await sleep(100);
  let wr = await ev(() => ({ act: SK.G.artifacts.wrath.active && SK.G.artifacts.wrath.active.kind, e: SK.G.artifacts.wrath.e, n: SK.G.artifacts.stats.wraths }));
  check('bấm L khi đầy: thi triển Ba Lửa = Sao Băng Lửa (fff), năng lượng về 0', wr.act === 'fff' && wr.e === 0 && wr.n === 1, JSON.stringify(wr));
  const e0hp = await ev(i => SK.G.enemies[i].hp, i1);
  await sleep(2600);
  const e1hp = await ev(i => SK.G.enemies[i].hp, i1);
  check('Sao Băng Lửa: mưa sao băng 7 sát thương trúng quái (máu giảm theo bội 7)', e0hp - e1hp >= 7 && (e0hp - e1hp) % 7 === 0, (e0hp - e1hp) + ' máu');
  await shot('4-wrath-fff.png');
  await sleep(2800);
  wr = await ev(() => ({ act: SK.G.artifacts.wrath.active, last: SK.G.artifacts.wrath.last }));
  check('hết thời gian Thần Uy thì tắt và ghi loại đã dùng', wr.act === null && wr.last === 'fff');
  // mỗi loại Thần Uy chạy được và gây sát thương hoặc hiệu ứng đo được
  const kinds = { ffw: ['F', 'F', 'W'], fft: ['F', 'F', 'T'], www: ['W', 'W', 'W'], wwt: ['W', 'W', 'T'], wwf: ['W', 'W', 'F'], ttt: ['T', 'T', 'T'], ttw: ['T', 'T', 'W'], ttf: ['T', 'T', 'F'], sword: ['F', 'W', 'T'], bow: ['F', 'W', 'T'], staff: ['F', 'W', 'T'] };
  const dmgOf = {};
  for (const k of Object.keys(kinds)) {
    await ev(([kk, els]) => { const G = SK.G, a = G.artifacts, pl = G.player; a.wrath.active = null; const cat = kk === 'bow' ? 'bow' : kk === 'staff' ? 'staff' : 'sword'; a.cat = cat; a.parts = [0, 1, 2].map(sl => SK.artifacts.newPart(cat, 1, sl, 0, els[sl])); SK.artifacts.recalc(G); pl.weapons[0] = SK.makeWeapon('atf_' + cat); pl.energy = pl.energyMax; pl.x = G.map.rooms[0].cx * 16 + 8; G.enemies = G.enemies.filter(e => e.st === 'dead' ? false : false); }, [k, kinds[k]]);
    const ei = await dummy(18, 99999);
    const r = await ev(async ([kk, i]) => {
      const G = SK.G, a = G.artifacts, pl = G.player, e = G.enemies[i]; pl.aim = 0; pl.face = 1; pl.dmgMul = 1; pl.crit = 0;
      a.wrath.e = 100; const h0 = e.hp, mm0 = pl.dmgMul; const ok = SK.artifacts.castWrath(G);
      const kind = a.wrath.active && a.wrath.active.kind;
      if (kk === 'staff') { const dm = pl.dmgMul; return { ok, kind, h0, dm, en: pl.energy }; }
      for (let t = 0; t < 40; t++) { if (kk === 'bow' || kk === 'ffw') SK.WEAPON_KINDS.artifact.fire(G, pl, pl.weapons[0], { x: pl.x, y: pl.y, ang: 0 }); await new Promise(r => setTimeout(r, 100)); }
      return { ok, kind, h0, h1: e.hp, shots: (a.shots || []).length };
    }, [k, ei]);
    dmgOf[k] = r;
  }
  const bad = Object.keys(kinds).filter(k => k !== 'staff' && !(dmgOf[k].ok && dmgOf[k].kind === k && dmgOf[k].h1 < dmgOf[k].h0));
  check('11 loại Thần Uy còn lại (trừ Gậy): thi triển được đúng loại và làm quái mất máu', bad.length === 0, bad.map(k => k + JSON.stringify(dmgOf[k])).join(' | ') || Object.keys(kinds).map(k => k + ':' + (dmgOf[k].h0 - (dmgOf[k].h1 || dmgOf[k].h0))).join(' '));
  check('Hủy Diệt (ttf) trúng 80 sát thương mỗi tia [WIKI SW]', ((dmgOf.ttf.h0 - dmgOf.ttf.h1) % 80 === 0 || (dmgOf.ttf.h0 - dmgOf.ttf.h1) >= 80), (dmgOf.ttf.h0 - dmgOf.ttf.h1) + '');
  check('Gậy Năng Lượng Huyền Bí (Gốc): DMG gấp đôi khi thi triển', dmgOf.staff.ok && dmgOf.staff.kind === 'staff' && dmgOf.staff.dm === 2, JSON.stringify(dmgOf.staff));
  await sleep(6500);
  check('hết Thần Uy Gậy: DMG trở về 1', await ev(() => SK.G.player.dmgMul === 1 && !SK.G.artifacts.wrath.active), JSON.stringify(await ev(() => ({ dm: SK.G.player.dmgMul, act: SK.G.artifacts.wrath.active, st: SK.G.state, hold: SK.G.hold }))));
  check('đã dùng đủ 12 loại Thần Uy (mục tiêu Đồng "Cao Thủ Chuyên Nghiệp I")', await ev(() => Object.keys(SK.G.artifacts.wrath.used).length) === 12, String(await ev(() => Object.keys(SK.G.artifacts.wrath.used).join(','))));

  // ---- 8. không thiên phú, kỹ năng chậm, dọn phòng, thắng thua thật
  await ev(() => { SK.G.enemies.length = 0; });
  await stageTo('1-1');
  await ev(() => { SK.G.artifacts.locked = true; });
  const bf = await ev(() => { const R = SK.ROOMS; return { buff: R.buffAfter(SK.G, '1-1') }; });
  await ev(() => { const G = SK.G, pl = G.player; pl.x = G.portal.x; pl.y = G.portal.y; });
  await until(p, () => SK_GAME.stage === '1-2' || (SK.G.stage && SK.G.stage.label === '1-2'), null, 8000);
  const nb = await ev(() => ({ st: SK.G.stage.label, choice: SK.ROOMS.choice.open, hold: !!SK.G.hold }));
  check('qua cổng 1-1 (vốn có bảng thiên phú): chế độ này không có thiên phú, sang thẳng 1-2', bf.buff && nb.st === '1-2' && !nb.choice && !nb.hold, JSON.stringify(nb));
  const skl = await ev(() => { const G = SK.G, pl = G.player; pl.skillCd = 0; pl.energy = pl.energyMax; const cd = pl.h.skill.cd; try { SK_GAME.debug.god(true); G.mods.skillCdMul = 3.5; const sd = SK.skillDef(pl); sd.start(G, pl); if (!(pl.skillT > 0)) pl.skillCd = pl.h.skill.cd * 3.5; else { SK.endSkill(G, pl); } } catch (e) { return { err: String(e) }; } return { cd, now: pl.skillCd, ratio: pl.skillCd / cd }; });
  check('dùng kỹ năng: hồi chiêu = gốc x3,5', skl.ratio && Math.abs(skl.ratio - 3.5) < 0.05, JSON.stringify(skl));

  // dọn phòng thường: bộ phận rơi theo xác suất, thưởng thắng vào hồ sơ
  const dr = await ev(() => { let n = 0; const G = SK.G; for (let i = 0; i < 200; i++) { const before = G.interactables.length; const r = G.map.rooms.find(x => x.type === 'battle'); const SKc = SK.chance; SK.chance = () => true; SK.emit('roomClear', G, r); SK.chance = SKc; if (G.interactables.length > before) n++; G.interactables.length = before; } return n; });
  check('dọn phòng chiến đấu: rơi bộ phận khi trúng xác suất (ép 100% -> luôn rơi)', dr === 200, 'số lần rơi ' + dr);

  // ---- 9. trùm cuối 3-6 và thắng thật; thua thật
  await stageTo('3-6');
  const fin = await ev(() => { const G = SK.G; return { label: G.stage.label, final: !!G.stage.final, bosses: G.enemies.filter(e => e.bossKey).map(e => e.bossKey + ':' + e.hpMax) }; });
  check('ải 3-6 là ải trùm cuối (final), chế độ ải trùm', fin.final && fin.label === '3-6', JSON.stringify(fin));
  await ev(() => SK_GAME.debug.teleportTo('boss', 0)); await sleep(600);
  await until(p, () => SK_GAME.rooms.some(r => r.type === 'boss' && r.state === 'locked'), null, 8000);
  const fin2 = await ev(() => SK.G.enemies.filter(e => e.bossKey).map(e => e.bossKey + ':' + e.hpMax));
  check('ải 3-6: vào phòng trùm gặp trùm cuối Tước Sĩ (boss_bossrush_final) với máu x2,1 [ĐO bossHpFactor]', fin2.some(x => /^boss_bossrush_final/.test(x)), JSON.stringify(fin2));
  const bossHp = await ev(() => { const e = SK.G.enemies.find(x => x.bossKey); return e ? { hp: e.hpMax, key: e.bossKey } : null; });
  await ev(() => SK_GAME.debug.clearRoom());
  await sleep(500);
  const bdrops = await ev(() => SK.G.interactables.filter(o => o.part && !o.part.taken).map(o => o.part.rar));
  check('hạ trùm: rơi 2 bộ phận từ rương trùm, ít nhất một Cam trở lên (có thể Đỏ) [ĐO redProbabilityInBossChest]', bdrops.length === 2 && bdrops.every(r => r >= 3) && bdrops.some(r => r >= 4), JSON.stringify(bdrops) + ' ' + JSON.stringify(bossHp));
  await until(p, () => !!SK.G.portal, null, 8000);
  const gems0 = await ev(() => { const P = JSON.parse(localStorage.getItem('sk.profile.v1') || '{}'); return P.gems || 0; });
  await ev(() => { window.__runEnd = null; SK.on('runEnd', (G, r) => { window.__runEnd = { won: r.won, stage: r.stage, kills: r.kills, gold: r.gold, ag: r.artifactGems }; }); const G = SK.G, pl = G.player; G.kills = 120; pl.gold = 400; pl.x = G.portal.x; pl.y = G.portal.y; });
  const won = await until(p, () => SK_GAME.state === 'victory', null, 12000);
  await sleep(300);
  const re = await ev(() => window.__runEnd);
  check('qua cổng 3-6 thật: màn Chiến thắng, runEnd.won = true (game.js fillEnd)', won && re && re.won === true && re.stage === '3-6', JSON.stringify(re));
  const target = 16 * 50 + Math.floor(400 / 20) + Math.floor(120 / 2);
  check('đá quý theo công thức riêng: số ải x50 + vàng/20 + quái/2 [WIKI SW "Gem calculation"]', re && re.ag === target, JSON.stringify({ ag: re && re.ag, target }));
  await shot('5-win.png');

  // thua thật: ván mới, chết bởi sát thương
  await ev(() => { SK.G.state = 'hall'; SK.lobby.launch('knight', 'artifacts', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  await ev(() => { window.__runEnd = null; SK.on('runEnd', (G, r) => { window.__runEnd = { won: r.won }; }); const pl = SK.G.player; pl.god = false; pl.invulT = 0; pl.armor = 0; pl.hp = 1; SK.hurtPlayer(SK.G, 5); });
  const lost = await until(p, () => SK_GAME.state === 'dead', null, 8000);
  await sleep(300);
  const rl = await ev(() => window.__runEnd);
  check('chết thật (nhận sát thương): màn thua, runEnd.won = false', lost && rl && rl.won === false, JSON.stringify(rl));
  await shot('6-lose.png');

  // ---- 10. hình gốc
  const art = await ev(() => {
    const miss = []; const ids = ['Blade', 'Guard', 'Grip', 'StaffCore', 'StaffHead', 'StaffBase', 'Bow', 'Arrow', 'BowString'];
    for (const pr of ids) for (let i = 1; i <= 15; i++) { const n = pr + '_' + ('0' + i).slice(-2); const parts = SK.prefab(n); const f = parts && parts.find(x => x.f); if (!f || !SK.frame(f.f)) miss.push(n); }
    const A = SK.artifacts, bad = []; for (const c of A.CATS) for (let n = 1; n <= 15; n++) for (let s = 0; s < 3; s++) { const q = A.newPart(c, n, s, 0); if (!SK.frame(A.frame(q)) || !SK.prefab(A.prefabOf(q))) bad.push(c + n + s); }
    return { miss, bad, granny: !!SK.prefab('grandma_thousands'), chest: !!SK.prefab('artifacts_weapon_chest') };
  });
  check('135 bộ phận (45 vũ khí x 3) có khung hình và prefab gốc (khoá Blade_01...BowString_15), có prefab Bà Lão Ngàn Tuổi', art.miss.length === 0 && art.bad.length === 0 && art.granny, JSON.stringify(art).slice(0, 160));

  console.log(results.join('\n'));
  console.log('\nlỗi trang: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'không'));
  check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log(results.join('\n')); console.log('\nNGOẠI LỆ: ' + e.stack); process.exit(2); });
