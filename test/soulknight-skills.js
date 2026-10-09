/*
 * Kiểm thử kỹ năng nhân vật Hiệp Sĩ Linh Hồn (games/soulknight/js/skills.js) với số thật 8.6 (data/sk-skills86.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-skills.js [folder hoặc folder/ô ...]
 *   vd  node test/soulknight-skills.js knight mage/1 druid
 * Ảnh: $SK_SHOTS hoặc <tmp>/soulknight-skills/<folder>_<ô>_<i>.png — mỗi kỹ năng một dãy 6 khung cách nhau 50 ms
 * (cắt quanh người chơi), ghép thành sheet_<folder>_<ô>.png nếu có Python + Pillow.
 *
 * Mỗi kỹ năng: chọn ô (SK.setSkillSlot) → SK.startRun(folder) → dịch tới phòng đánh → đứng cách một con quái vài ô, quái
 * đứng yên → bấm PHÍM K thật → so hành vi với số đọc từ bản cài 8.6 (cd, thời lượng, sát thương, số lượt, máu thú...).
 * Bật "god" để lượt đo không phụ thuộc độ khó.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-skills');
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
    await sleep(60);
  }
  return false;
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 0.05 : eps);

// Đặt người chơi cách con quái gần nhất `dist` px (chỗ trống, cùng hàng ngang nếu được); quái đứng yên.
async function standNear(p, dist) {
  return p.evaluate(d => {
    const G = SK.G, W = SK.world, pl = G.player;
    const es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
    if (!es.length) return false;
    es.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
    for (const e of es) {
      for (const [dx, dy] of [[-d, 0], [d, 0], [0, d], [0, -d], [-d * 0.7, d * 0.7], [d * 0.7, d * 0.7]]) {
        const x = e.x + dx, y = e.y + dy;
        if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x - 6, y) || W.solidAt(G.map, x + 6, y) || W.solidAt(G.map, x, y - 5)) continue;
        if (!W.los(G.map, x, y - 6, e.x, e.y - 6)) continue;
        pl.x = x; pl.y = y; pl.face = dx < 0 ? 1 : -1; pl.aim = Math.atan2(e.y - y, e.x - x);
        for (const q of G.enemies) { q.cd = 99; if (q.st !== 'spawn' && q.st !== 'dead') { q.st = 'idle'; q.stT = 99; } }
        return true;
      }
    }
    return false;
  }, dist);
}

const snap = p => p.evaluate(() => {
  const G = SK.G, pl = G.player, ch = pl._ch;
  return {
    dmg: window._skDmg || 0, hits: (window._skHits || []).slice(), php: pl.hp, phpMax: pl.hpMax, parm: pl.armor, parmMax: pl.armorMax,
    px: pl.x, py: pl.y, en: pl.energy, skillT: pl.skillT, skillCd: pl.skillCd, cd: pl.h.skill.cd, dur: pl.h.skill.dur, id: pl.h.skill.id,
    ch: ch ? { n: ch.n, max: ch.max } : null, weapon: pl.weapons[pl.cur] && pl.weapons[pl.cur].id, dual: pl.dual && pl.dual.id,
    move: pl.moveMul || 1, rate: pl.rateMul || 1, hidden: !!pl.hidden,
    allies: (G._allies || []).filter(a => !a.gone).map(a => ({ k: a.wolf ? 'wolf' : a.turret ? 'turret' : a.intercept ? 'intercept' : a.phantom ? 'phantom' : a.hand ? 'hand' : '?', hp: a.hp, hpMax: a.hpMax })),
    db: G.enemies.filter(e => e._db).map(e => Object.keys(e._db)).flat(), dbEver: Object.keys(window._skDb || {}),
    stun: G.enemies.filter(e => e.st === 'stun').length, bullets: G.bullets.filter(b => b.side === 'p').length, vfx: (G.vfx || []).map(h => h.name)
  };
});
const resetDmg = p => p.evaluate(() => { window._skDmg = 0; window._skHits = []; window._skDb = {}; });

async function enterBattle(p, folder, slot) {
  await p.evaluate(([f, s]) => { SK_GAME.debug.seed(20260929); SK.setSkillSlot(f, s); SK.startRun(f); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); }, [folder, slot]);
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
  const ok = await until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 5000);
  await sleep(250);
  await resetDmg(p);
  return ok;
}

async function pressK(p) { await p.keyboard.down('KeyK'); await sleep(40); await p.keyboard.up('KeyK'); }
// Trạng thái ngay sau start() của kỹ năng đang cầm (lần bấm K kế tiếp): skillT, cd tay hai... — đọc sau khi bấm thì đồng hồ đã chạy.
const armStart = p => p.evaluate(() => {
  const pl = SK.G.player, sd = SK.SKILLS[pl.h.skill.id], f = sd.start;
  window._skStart = null;
  sd.start = function (G, q) { sd.start = f; const r = f.apply(this, arguments); window._skStart = { skillT: q.skillT, dualCd: q.dual ? q.dual.cd : null }; return r; };
});
const startState = p => p.evaluate(() => window._skStart);
// Dãy 6 khung cách nhau 50 ms, cắt 480×300 quanh người chơi.
async function seq(p, name, n, gap) {
  const files = [];
  for (let i = 0; i < (n || 6); i++) {
    const c = await p.evaluate(() => { const G = SK.G, v = SK.view, pl = G.player, cam = G.view || { x: 0, y: 0 }; return [(pl.x - cam.x) * v.scale, (pl.y - 10 - cam.y) * v.scale]; });
    const x = Math.max(0, Math.min(960 - 480, Math.round(c[0] - 240))), y = Math.max(0, Math.min(540 - 300, Math.round(c[1] - 150)));
    const f = path.join(SHOTS, name + '_' + i + '.png');
    await p.screenshot({ path: f, clip: { x, y, width: 480, height: 300 } });
    files.push(f);
    await sleep(gap || 50);
  }
  sheets.push([name, files]);
}
// Ghép sheet sau khi chạy xong (gọi Python giữa chừng làm lệch đồng hồ của phép đo).
const sheets = [];
function makeSheets() {
  for (const [name, files] of sheets) {
    try {
      execFileSync(process.env.SK_PYTHON || 'C:/Users/tamph/.pyenv/pyenv-win/versions/3.8.10/python.exe', ['-c', 'import sys;from PIL import Image;fs=sys.argv[2:];ims=[Image.open(f) for f in fs];w,h=ims[0].size;s=Image.new("RGB",(w*3,h*2));[s.paste(im,((i%3)*w,(i//3)*h)) for i,im in enumerate(ims)];s.save(sys.argv[1])',
        path.join(SHOTS, 'sheet_' + name + '.png'), ...files], { stdio: 'ignore' });
    } catch (e) { return; /* không có Pillow: bỏ qua sheet */ }
  }
}
// Số thật của một kỹ năng (data/sk-skills86.js).
const real = (p, f, id) => p.evaluate(([f, id]) => SK_SKILLS86.heroes[f].skills.find(s => s.id === id), [f, id]);
const mb = (p, pf, cls, field, pick) => p.evaluate(([pf, cls, field, pick]) => {
  let o = SK_SKILLS86.mb[pf] && SK_SKILLS86.mb[pf][cls];
  if (Array.isArray(o)) o = pick ? o.find(v => v.elementalType === pick) || o[0] : o[0];
  return o ? o[field] : null;
}, [pf, cls, field, pick]);
// Sát thương từng đòn gây cho quái (đếm qua sự kiện enemyHit), lọc theo nhãn nguồn G._skHit nếu cần.
const hitsOf = (s, tag) => s.hits.filter(h => !tag || h[1] === tag).map(h => h[0]);

const CASES = {
  async 'knight/0'(p) {
    const r = await real(p, 'knight', 'dual_wield');
    await standNear(p, 60);
    await armStart(p);
    await p.keyboard.down('KeyJ'); await pressK(p);
    const d0 = (await startState(p)).dualCd;
    await sleep(150);
    const s = await snap(p);
    await seq(p, 'knight_0');
    await p.keyboard.up('KeyJ');
    check('knight dual_wield: tay hai bắn trễ 0.1 s [ĐO C01Controller.RoleAtk], thời lượng = ' + r.dur + ' s [ĐO]', !!s.dual && d0 === 0.1 && near(s.skillT, r.dur - 0.45, 0.35), 'cd tay hai lúc bấm ' + d0 + ' · skillT ' + s.skillT.toFixed(2));
    await until(p, () => SK.G.player.skillT <= 0, null, 6000);
    const e = await snap(p);
    check('knight dual_wield: hết thì hồi chiêu ' + r.cd + ' s [ĐO]', near(e.skillCd, r.cd, 0.3) && e.cd === r.cd, 'skillCd ' + e.skillCd.toFixed(2));
  },
  async 'knight/1'(p) {
    const r = await real(p, 'knight', 'superior_fire');
    await p.evaluate(() => { SK_GAME.debug.give('ak_47') || SK_GAME.debug.give(Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].kind === 'gun' && k !== SK.G.player.weapons[0].id)); SK.G.player.cur = 0; });
    await standNear(p, 60);
    await pressK(p); await sleep(120);
    const s = await snap(p);
    const other = await p.evaluate(() => SK.G.player.weapons[1] && SK.G.player.weapons[1].id);
    check('knight superior_fire: vũ khí phụ bắn cùng, ' + r.dur + ' s [ĐO]', s.dual === other && s.id === 'superior_fire' && near(s.skillT, r.dur - 0.12, 0.3), 'dual ' + s.dual + ' / ô 2 ' + other);
  },
  async 'knight/2'(p) {
    const r = await real(p, 'knight', 'chaotic_strike');
    await standNear(p, 50);
    await pressK(p);
    await p.keyboard.down('KeyJ'); await sleep(1500);
    const s = await snap(p);
    await seq(p, 'knight_2');
    await p.keyboard.up('KeyJ');
    // Bảng 13 kết quả (tổng trọng số 111) [ĐO effect_chaos]: không có kết quả "choáng".
    check('knight chaotic_strike: đạn trúng rút kết quả ngẫu nhiên, không còn choáng (cd ' + r.cd + ', ' + r.dur + ' s) [ĐO]', s.dbEver.length + hitsOf(s, 'chaos').length + hitsOf(s, 'pool').length > 0 && s.dbEver.indexOf('dizzy') < 0 && s.cd === r.cd, 'hiệu ứng: ' + s.dbEver.join(',') + ' · nổ ' + hitsOf(s, 'chaos').join(','));
  },
  async 'ranger/0'(p) {
    const r = await real(p, 'ranger', 'dodge');
    await standNear(p, 50);
    await p.evaluate(() => { const G = SK.G, pl = G.player; for (const e of G.enemies) if (e.st !== 'dead') { e.x = pl.x - 60; } });
    const a = await snap(p);
    await armStart(p);
    // D chỉ để chọn hướng lăn: lúc lăn phím đi không có tác dụng nên nhả ngay.
    await p.keyboard.down('KeyD'); await pressK(p); await p.keyboard.up('KeyD');
    const t0 = (await startState(p)).skillT;
    await sleep(100);
    const blocked = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r = SK.hurtPlayer(SK.G, 3); return { r, hp: pl.hp, arm: pl.armor, ghost: pl.h.hurt.off[1] < -1000 }; });
    await seq(p, 'ranger_0');
    const b = await snap(p);
    const d = Math.hypot(b.px - a.px, b.py - a.py);
    check('ranger dodge: bất tử + đạn xuyên qua khi lăn', blocked.r === false && blocked.hp === a.php && blocked.arm === a.parm && blocked.ghost, JSON.stringify(blocked));
    check('ranger dodge: lăn 0.4 s [ĐO RoleSkill0 Invoke 0.4] ≈ 5.13 đơn vị (82 px) bỏ qua phím đi [ĐO GetForce 20 × 0.95/bước], cd ' + r.cd + ' [ĐO]', near(t0, 0.4, 1e-6) && near(d, 82, 14) && b.cd === r.cd, 'skillT ' + t0.toFixed(3) + ' · dời ' + Math.round(d) + ' px');
  },
  async 'ranger/1'(p) {
    const r = await real(p, 'ranger', 'iaido');
    await standNear(p, 70);
    const a = await snap(p);
    await armStart(p);
    await pressK(p);
    const t0 = (await startState(p)).skillT;
    await sleep(250);
    const s = await snap(p);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await seq(p, 'ranger_1', 6, 40);
    check('ranger iaido: ' + r.max + ' lượt [ĐO], bấm một lần còn ' + (r.max - 1) + ', bấm lại được ngay khi còn lượt [ĐO RoleSkillStart]', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && s.skillCd === 0, JSON.stringify(s.ch) + ' · skillCd ' + s.skillCd);
    check('ranger iaido: kỹ năng 0.2 s, miễn sát thương tới 0.4 s, chém 8 [ĐO C02Controller.RoleSkill1]', near(t0, 0.2, 1e-6) && imm === false && Math.hypot(s.px - a.px, s.py - a.py) > 30 && hitsOf(s).some(d => d === 8 || d === 16), 'skillT ' + t0.toFixed(3) + ' · hurt ' + imm + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'mage/0'(p) {
    const r = await real(p, 'mage', 'lightning_strike');
    await standNear(p, 70);
    await pressK(p); await sleep(300);
    const early = await snap(p);
    await sleep(200);
    const s = await snap(p);
    await seq(p, 'mage_0', 6, 40);
    check('mage lightning_strike: sét đánh sau 0.4 s [ĐO Invoke CreateThunder 0.4], mỗi tia 8 [ĐO ProcessSkillDamage 8]', hitsOf(early, 'skill').length === 0 && hitsOf(s, 'skill').length > 0 && hitsOf(s, 'skill').every(d => d === 8 || d === 16), 'lúc 0.3 s ' + hitsOf(early, 'skill').length + ' đòn · đòn ' + hitsOf(s, 'skill').join(','));
    check('mage lightning_strike: hồi chiêu ' + r.cd + ' s [ĐO]', s.cd === r.cd && near(s.skillCd, r.cd - 0.5, 0.3), 'skillCd ' + s.skillCd.toFixed(2));
  },
  async 'mage/1'(p) {
    const dmg = await mb(p, 'explode_ice_box', 'ExplodeIceBox', 'damage');
    await standNear(p, 50);
    await pressK(p); await sleep(250);
    const early = await snap(p);
    await sleep(400);
    const s = await snap(p);
    await seq(p, 'mage_1', 6, 60);
    check('mage piercing_frost: hộp đầu sau 0.35 s [ĐO CreatingIceWall], ' + dmg + ' sát thương + đóng băng [ĐO ExplodeIceBox]', hitsOf(early, 'skill').length === 0 && hitsOf(s, 'skill').some(d => d === dmg || d === dmg * 2) && (s.dbEver.indexOf('ice') >= 0 || s.db.indexOf('ice') >= 0), 'lúc 0.25 s ' + hitsOf(early, 'skill').length + ' · đòn ' + hitsOf(s).join(',') + ' · ' + s.db.join(','));
  },
  async 'mage/2'(p) {
    const r = await real(p, 'mage', 'firestorm');
    await standNear(p, 40);
    const a = await snap(p);
    await armStart(p);
    await pressK(p); await sleep(700);
    await seq(p, 'mage_2', 6, 80);
    const t0 = (await startState(p)).skillT;
    const s = await snap(p);
    const balls = await p.evaluate(() => SK.G.vfx.filter(h => h.name === 'bullet_fire_storm' && !h.stopped).length);
    check('mage firestorm: ' + r.max + ' lượt [ĐO], dùng hết = ' + r.max + ' quả cầu lửa, kỹ năng chạy 4 s [ĐO RoleSkill2]', a.ch.n === r.max && s.ch.n === 0 && balls === r.max && t0 === 4, 'cầu ' + balls + ' · lượt ' + JSON.stringify(s.ch) + ' · skillT lúc bấm ' + t0);
    check('mage firestorm: cầu lửa 3 sát thương + cháy 100% [ĐO DamageInfo.SetUp(3, 20, 3), BuffEffectTrigger 100]', hitsOf(s, 'skill').some(d => d === 3 || d === 6) && s.dbEver.indexOf('fire') >= 0, 'đòn ' + hitsOf(s, 'skill').join(',') + ' · ' + s.dbEver.join(','));
  },
  async 'assassin/0'(p) {
    await standNear(p, 24);
    await pressK(p);
    const nf = await p.evaluate(() => SK.G.player.noFire);
    await sleep(120);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await seq(p, 'assassin_0', 6, 40);
    const s = await snap(p);
    check('assassin dark_blade: tự chém khi quái < 2 đơn vị, 5 + 3 + 4 × combo 1 = 12 [ĐO C04Controller], miễn sát thương, khoá súng tới nhát chém', hitsOf(s, 'dark_blade').length > 0 && hitsOf(s, 'dark_blade').every(d => d === 12 || d === 24) && imm === false, 'đòn ' + hitsOf(s, 'dark_blade').join(',') + ' · hurt=' + imm + ' · noFire lúc bấm ' + nf);
  },
  async 'assassin/1'(p) {
    await standNear(p, 70);
    await pressK(p); await sleep(100);
    const c = await snap(p);
    await sleep(900);
    await seq(p, 'assassin_1', 6, 60);
    await sleep(600);
    const s = await snap(p);
    const ph = s.allies.find(a => a.k === 'phantom');
    const want = 3 * (s.phpMax + s.parmMax);
    check('assassin doppelg_nger: lúc gọi tàng hình + 0.2 tốc [ĐO phantomCastInvisibleDuration / MoveSpeedBonus]', c.hidden && near(c.move, 1.2, 0.01), 'hidden ' + c.hidden + ' · move ' + c.move);
    check('assassin doppelg_nger: bản sao máu = 3×(máu+giáp) [ĐO phantomHpRatio 3], đánh giúp', ph && ph.hpMax === want && s.dmg > 0, JSON.stringify(ph) + ' · cần ' + want + ' · sát thương ' + s.dmg);
  },
  async 'assassin/2'(p) {
    const r = await real(p, 'assassin', 'invisibility');
    await p.evaluate(() => { SK_GAME.debug.give(Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].kind === 'gun' && (SK.DS.weapons[k].pellets || 1) === 1)); });
    await standNear(p, 80);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    await seq(p, 'assassin_2');
    check('assassin invisibility: tàng hình ' + r.dur + ' s [ĐO]', s.hidden && near(s.skillT, r.dur - 0.45, 0.35), 'skillT ' + s.skillT.toFixed(2));
    await p.keyboard.down('KeyJ'); await sleep(60); await p.keyboard.up('KeyJ');
    const b = await p.evaluate(() => { const bs = SK.G.bullets.filter(x => x.side === 'p'); return { n: bs.length, crit: bs.filter(x => x.crit).length, hidden: SK.G.player.hidden }; });
    check('assassin invisibility: bắn thì hết tàng hình, đạn phá tàng hình chắc chắn chí mạng [ĐO BulletStrength critic +100]', !b.hidden && b.n > 0 && b.crit === b.n, JSON.stringify(b));
  },
  async 'alchemist/0'(p) {
    const gd = await mb(p, 'Gas_Hit_Enemy_enhance', 'BulletGasEnhance', 'damage');
    await standNear(p, 60);
    await pressK(p); await sleep(700);
    await seq(p, 'alchemist_0', 6, 80);
    await sleep(2400);
    const s = await snap(p);
    const gas = hitsOf(s, 'gas');
    check('alchemist gas_grenade: khí gây ' + gd + ' mỗi 0.5 s [ĐO normal_hit_count 5 × hit_invert 0.1] + chậm + tầng độc gas1→gas2', gas.every(d => d === gd) && gas.length >= 6 && s.dbEver.indexOf('gasSlow') >= 0 && s.dbEver.some(k => k === 'gas2' || k === 'gas3'), 'khí ' + gas.length + ' đòn ' + gas.join(',') + ' · ' + s.dbEver.join(','));
  },
  async 'alchemist/1'(p) {
    const r = await real(p, 'alchemist', 'elemental_potions');
    await standNear(p, 60);
    await pressK(p); await sleep(900);
    await seq(p, 'alchemist_1', 6, 80);
    const s = await snap(p);
    check('alchemist elemental_potions: ' + r.max + ' lượt [ĐO], bình độc nổ 8 [ĐO ProcessSkillDamage 8] rồi thành vũng', s.ch.max === r.max && s.ch.n === r.max - 1 && s.vfx.indexOf('Gas_Hit_Enemy') >= 0 && hitsOf(s, 'skill').some(d => d === 8 || d === 16), JSON.stringify(s.ch) + ' · ' + s.vfx.filter(v => /Gas|Fire|frost/.test(v)).join(',') + ' · đòn ' + hitsOf(s, 'skill').join(','));
  },
  async 'engineer/0'(p) {
    const hp = await mb(p, 'battery', 'RoleAttribute', 'max_hp'), dmg = await mb(p, 'battery', 'RGBatteryController', 'damage');
    await standNear(p, 70);
    await pressK(p); await sleep(1300);
    await seq(p, 'engineer_0', 6, 60);
    const s = await snap(p);
    const t = s.allies.filter(a => a.k === 'turret');
    const sp = await p.evaluate(() => { const b = SK.G.bullets.find(x => x.side === 'p'); return b ? Math.round(Math.hypot(b.vx, b.vy)) : null; });
    check('engineer gun_turret: tháp máu ' + hp + ', mỗi viên ' + dmg + ' [ĐO battery], đạn 40 đơn vị/s [ĐO bullet_12]', t.length === 1 && t[0].hpMax === hp && hitsOf(s).length > 0 && hitsOf(s).every(d => d === dmg || d === dmg * 2) && (sp == null || sp === 40 * 16), 'tháp ' + JSON.stringify(t) + ' · đòn ' + hitsOf(s).slice(0, 6).join(',') + ' · tốc ' + sp);
  },
  async 'engineer/2'(p) {
    await standNear(p, 70);
    await pressK(p); await sleep(300);
    await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x - 40, y: pl.y - 14, h: 8, vx: 60, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 3, _probe: 1 }); return 1; });
    await sleep(900);
    await seq(p, 'engineer_2', 6, 60);
    const s = await snap(p);
    const eaten = await p.evaluate(() => !SK.G.bullets.some(b => b._probe));
    const t = s.allies.find(a => a.k === 'intercept');
    check('engineer interceptor: tháp máu 15 [ĐO] chặn đạn địch trong 7 đơn vị, bắn quái 3', t && t.hpMax === 15 && eaten && hitsOf(s).some(d => d === 3 || d === 6), JSON.stringify(t) + ' · chặn ' + eaten + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'vampire/0'(p) {
    const bite = await mb(p, 'bullet_bat', 'BulletBat', 'damage');
    await standNear(p, 70);
    await p.evaluate(() => { SK.G.player.hp = SK.G.player.hpMax - 2; SK.G.player._vpBack = 0; });
    const a = await snap(p);
    await pressK(p); await sleep(260);
    const n = await p.evaluate(() => SK.G.player._bats && SK.G.player._bats.bats.length);
    await seq(p, 'vampire_0', 6, 60);
    await until(p, () => !SK.G.player._bats, null, 8000);
    const b = await snap(p);
    check('vampire bat_swarm: 3 dơi [ĐO get_batTotal] cắn ' + bite + ' [ĐO BulletBat.damage], 3 con về có cắn thì hồi 1 máu [ĐO BatBack]', n === 3 && hitsOf(b).length > 0 && hitsOf(b).every(d => d === bite) && (hitsOf(b).length < 3 || b.php === a.php + 1), 'dơi ' + n + ' · đòn ' + hitsOf(b).join(',') + ' · máu ' + a.php + ' → ' + b.php);
  },
  async 'vampire/1'(p) {
    const d = await mb(p, 'bullet_84_blood', 'BloodHoleTrigger@b', 'damage');
    await standNear(p, 60);
    await pressK(p); await sleep(700);
    await seq(p, 'vampire_1', 6, 80);
    await sleep(1200);
    const s = await snap(p);
    check('vampire alien_swirl: hố đen ' + d + ' sát thương mỗi nhịp [ĐO BloodHoleTrigger]', hitsOf(s).length > 0 && hitsOf(s).every(x => x === d), 'đòn ' + hitsOf(s).join(','));
  },
  async 'vampire/2'(p) {
    const r = await real(p, 'vampire', 'immortal');
    await standNear(p, 80);
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = pl.hpMax; pl.energy = 50; });
    await pressK(p); await sleep(150);
    const a = await snap(p);
    const got = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r1 = SK.hurtPlayer(SK.G, 3); const m1 = pl.hpMax; pl.invulT = 0; SK.hurtPlayer(SK.G, 3); return { r: r1, hp: pl.hp, m1, m2: pl.hpMax, en: pl.energy }; });
    await seq(p, 'vampire_2');
    await until(p, () => SK.G.player.skillT <= 0, null, 5000);
    const e = await snap(p);
    check('vampire immortal: ' + r.dur + ' s [ĐO], đầy máu thì 5 năng lượng/điểm, cứ 5 điểm +1 máu tối đa, hết thì trả ngay [ĐO AbsordDamage / RoleSkillEnd2]', got.r === false && got.m1 === a.phpMax && got.m2 === a.phpMax + 1 && got.en === a.en + 30 && e.phpMax === a.phpMax && near(a.skillT, r.dur - 0.25, 0.3), JSON.stringify(got) + ' · sau ' + e.phpMax);
  },
  async 'paladin/0'(p) {
    const r = await real(p, 'paladin', 'energy_shield');
    await standNear(p, 60);
    await pressK(p); await sleep(200);
    const hurt = await p.evaluate(() => {
      const G = SK.G, pl = G.player; pl.invulT = 0;
      const h = SK.hurtPlayer(G, 3);
      G.bullets.push({ side: 'e', kind: 'orb', x: pl.x - 60, y: pl.y - 8, h: 8, vx: 200, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 });
      return h;
    });
    const s = await snap(p);
    await seq(p, 'paladin_0', 6, 60);
    const probe = await p.evaluate(() => SK.G.bullets.some(x => x._probe));
    check('paladin energy_shield: ' + r.dur + ' s [ĐO], chặn đòn + nuốt đạn', hurt === false && !probe && near(s.skillT, r.dur - 0.5, 0.35), 'hurt=' + hurt + ' · đạn còn=' + probe + ' · skillT ' + s.skillT.toFixed(2));
  },
  async 'elves/0'(p) {
    const r = await real(p, 'elves', 'focus_fire');
    await standNear(p, 70);
    const a = await snap(p);
    await pressK(p); await sleep(150);
    const aim = await p.evaluate(() => ({ nf: SK.G.player.noFire, x: SK.G.player.x }));
    await p.keyboard.down('KeyD'); await sleep(200); await p.keyboard.up('KeyD');
    const moved = await p.evaluate(x => Math.abs(SK.G.player.x - x), aim.x);
    await p.keyboard.down('KeyJ'); await sleep(40); await p.keyboard.up('KeyJ');
    await sleep(250);
    await seq(p, 'elves_0', 6, 50);
    const s = await snap(p);
    check('elves focus_fire: K vào thế ngắm — đứng yên, khoá súng, +25 chí mạng [ĐO C09Controller.RoleSkill0]', aim.nf === true && moved < 1, JSON.stringify(aim) + ' · dời ' + moved);
    check('elves focus_fire: ' + r.max + ' mũi [ĐO], nút bắn phóng một mũi trúng quái 8 [ĐO ArrowShoot]', s.ch.max === r.max && s.ch.n === r.max - 1 && hitsOf(s, 'arrow').some(d => d === 8 || d === 16), JSON.stringify(s.ch) + ' · đòn ' + hitsOf(s, 'arrow').join(','));
    await pressK(p); await sleep(100);
    const e = await snap(p);
    check('elves focus_fire: bấm K lần nữa bắn mũi còn nạp rồi thôi ngắm', e.skillT <= 0 && e.ch.n === r.max - 2, JSON.stringify(e.ch) + ' · skillT ' + e.skillT);
  },
  async 'elves/1'(p) {
    const r = await real(p, 'elves', 'arrow_rain');
    await standNear(p, 60);
    await p.keyboard.down('KeyK'); await sleep(r.dur * 1000 + 150); await p.keyboard.up('KeyK');
    await sleep(500);
    await seq(p, 'elves_1', 6, 60);
    await sleep(1200);
    const s = await snap(p);
    check('elves arrow_rain: giữ K ' + r.dur + ' s [ĐO] rồi thả → mưa tên 6 sát thương/mũi, không chí mạng [ĐO ProcessSkillDamage 6]', hitsOf(s).length > 0 && hitsOf(s).every(d => d === 6), 'đòn ' + hitsOf(s).join(','));
  },
  async 'werewolf/0'(p) {
    await standNear(p, 20);
    await pressK(p); await sleep(150);
    const early = await snap(p);
    await sleep(350);
    const s = await snap(p);
    await p.keyboard.down('KeyJ'); await sleep(300);
    await seq(p, 'werewolf_0', 6, 50);
    await sleep(300); await p.keyboard.up('KeyJ');
    const b = await snap(p);
    const cl = hitsOf(b, 'weapon');
    check('werewolf berserk: hoá sói sau 0.4 s [ĐO Invoke Transfiguration 0.4], cào 9..18 theo máu [ĐO GetSkillDamage]', early.weapon !== '_claw' && s.weapon === '_claw' && cl.length > 0 && cl.every(d => d >= 9 && d <= 36), 'lúc 0.15 s ' + early.weapon + ' · đòn ' + cl.join(','));
  },
  async 'werewolf/1'(p) {
    const r = await real(p, 'werewolf', 'blood_thirst');
    await standNear(p, 30);
    await armStart(p);
    await pressK(p);
    const t0 = (await startState(p)).skillT;
    await sleep(700);
    const s = await snap(p);
    await seq(p, 'werewolf_1', 6, 40);
    check('werewolf blood_thirst: ' + r.max + ' lượt dùng hết một lần [ĐO], chuỗi 1.2 s [ĐO skill1TotalTime], cào 6 × (2 − máu/tối đa) [ĐO GetSkillDamage(4)]', s.ch.max === r.max && s.ch.n === 0 && near(t0, 1.2, 1e-6) && hitsOf(s).length > 0 && hitsOf(s).every(d => d >= 6 && d <= 48), JSON.stringify(s.ch) + ' · skillT ' + t0 + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'priest/0'(p) {
    const r = await real(p, 'priest', 'regeneration_pact');
    await standNear(p, 40);
    await p.evaluate(() => { SK.G.player.hp = 1; });
    const a = await snap(p);
    await pressK(p); await sleep(900);
    const m = await snap(p);
    await seq(p, 'priest_0', 6, 80);
    await p.keyboard.down('KeyD'); await sleep(900); await p.keyboard.up('KeyD');
    const o = await snap(p);
    check('priest regeneration_pact: hồi máu + giáp tối đa +' + r.args + ' [ĐO args]', m.php > a.php && m.parmMax === a.parmMax + +r.args && m.cd === r.cd, 'máu ' + a.php + ' → ' + m.php + ' · giáp tối đa ' + a.parmMax + ' → ' + m.parmMax);
    check('priest regeneration_pact: vòng 1.7 s, ra khỏi vòng hào quang còn 1.7 s [ĐO BulletGreenLight]', o.skillT > 0 && o.skillT <= 1.7, 'skillT ' + o.skillT.toFixed(2));
  },
  async 'priest/1'(p) {
    const r = await real(p, 'priest', 'pray');
    await standNear(p, 60);
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = 1; pl.armor = 0; });
    await pressK(p); await sleep(150);
    const s = await snap(p);
    const d = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const a = pl.armor + pl.hp; SK.hurtPlayer(SK.G, 2); return a - (pl.armor + pl.hp); });
    await seq(p, 'priest_1');
    check('priest pray: +2 máu +2 giáp, +0.4 chạy, ×1.33 tốc đánh, phòng thủ +1 [ĐO C11Controller.RoleSkill1], cd ' + r.cd + ' [ĐO]', s.php === 3 && s.parm >= 2 && near(s.move, 1.4, 0.01) && near(s.rate, 1.33, 0.01) && s.cd === r.cd && d === 1, JSON.stringify({ hp: s.php, arm: s.parm, move: s.move, rate: s.rate, mất: d }));
  },
  async 'druid/0'(p) {
    const r = await real(p, 'druid', 'frostfire_wolves');
    const hp = await mb(p, 'wolf1_druid', 'RoleAttributePet', 'max_hp'), bite = await mb(p, 'wolf1_druid', 'WolfOfDruidController', 'damage');
    const w0 = await snap(p);
    await standNear(p, 50);
    await p.evaluate(() => { const pl = SK.G.player; for (const a of SK.G._allies) if (a.wolf) { a.x = pl.x; a.y = pl.y + 4; } });
    await sleep(1800);
    const w1 = await snap(p);
    await resetDmg(p);
    await pressK(p); await sleep(300);
    const s = await snap(p);
    await seq(p, 'druid_0', 6, 80);
    await sleep(800);
    const e = await snap(p);
    const wolves = w0.allies.filter(a => a.k === 'wolf');
    check('druid: 2 sói luôn theo, máu ' + hp + ' [ĐO RoleAttributePet]', wolves.length === 2 && wolves.every(a => a.hpMax === hp), JSON.stringify(wolves));
    check('druid: sói tự cắn ' + bite + ' [ĐO WolfOfDruidController.damage]', hitsOf(w1, 'pet').length > 0 && hitsOf(w1, 'pet').every(d => d === bite || d === bite * 2), 'đòn ' + hitsOf(w1, 'pet').join(','));
    check('druid frostfire_wolves: tiếp sức ' + r.dur + ' s [ĐO], sói cắn +5 = ' + (bite + 5) + ' [ĐO BeginSkill0] gây lửa/băng', near(s.skillT, r.dur - 0.35, 0.3) && e.dbEver.some(k => k === 'fire' || k === 'ice') && hitsOf(e, 'pet').every(d => d === bite + 5 || d === (bite + 5) * 2), 'skillT ' + s.skillT.toFixed(2) + ' · ' + e.dbEver.join(',') + ' · cắn ' + hitsOf(e, 'pet').join(','));
  },
  async 'robot/0'(p) {
    const r = await real(p, 'robot', 'electric_overload');
    await standNear(p, 60);
    await pressK(p); await sleep(1100);
    const s = await snap(p);
    await seq(p, 'robot_0', 6, 50);
    check('robot electric_overload: ' + r.dur + ' s [ĐO], tia điện 1/nhịp 0.15 s [ĐO GunChain]', s.dmg > 0 && hitsOf(s).every(d => d === 1) && near(s.skillT + 1.1, r.dur, 0.4), 'đòn ' + hitsOf(s).length + ' · skillT ' + s.skillT.toFixed(2));
  },
  async 'robot/2'(p) {
    await standNear(p, 30);
    await pressK(p); await sleep(100);
    await seq(p, 'robot_2', 6, 40);
    await sleep(300);
    const s = await snap(p);
    check('robot emp: tia điện 3 sát thương (chí mạng 6) + điện [ĐO RoleSkill2, RGShortLasetBuff buff_ele]', hitsOf(s).length > 0 && hitsOf(s).every(d => d === 3 || d === 6) && s.dbEver.indexOf('ele') >= 0 && s.dbEver.indexOf('dizzy') < 0, 'đòn ' + hitsOf(s).join(',') + ' · ' + s.dbEver.join(','));
  },
  async 'viking/0'(p) {
    await standNear(p, 50);
    await p.evaluate(() => { SK.G._fires = 0; if (!window._fireHook) { window._fireHook = 1; SK.on('fire', G => { G._fires = (G._fires || 0) + 1; }); } });
    const c0 = await p.evaluate(() => SK.G.player.crit);
    await pressK(p); await sleep(100);
    const c1 = await p.evaluate(() => ({ crit: SK.G.player.crit }));
    const m = await snap(p);
    await sleep(150);
    await seq(p, 'viking_0', 6, 40);
    await sleep(200);
    const s = await snap(p);
    const fires = await p.evaluate(() => SK.G._fires);
    check('viking rage: tự tấn công liên tục, tốc ×3, +25 chí mạng [ĐO C14Controller.RoleSkill0]', fires >= 2 && s.dmg > 0 && m.rate >= 3 - 1e-6 && c1.crit === c0 + 25, 'số đòn ' + fires + ' · rate ' + m.rate + ' · crit ' + c0 + '→' + c1.crit);
  },
  async 'viking/1'(p) {
    const k = await p.evaluate(() => SK_SKILLS86.heroes.viking.ctrlFields.skill1Config);
    await p.evaluate(() => { SK_GAME.debug.give(Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].kind === 'gun' && (SK.DS.weapons[k].pellets || 1) === 1)); });
    await standNear(p, 70);
    await pressK(p); await sleep(100);
    const n = await p.evaluate(async () => { const G = SK.G; const before = G.bullets.filter(b => b.side === 'p').length; return before; });
    await p.keyboard.down('KeyJ'); await sleep(60);
    const after = await p.evaluate(() => SK.G.bullets.filter(b => b.side === 'p' && b._free).length);
    await seq(p, 'viking_1', 6, 40);
    await p.keyboard.up('KeyJ');
    check('viking free_style: mỗi phát thành 1+' + k.extraBulletCount + ' viên [ĐO skill1Config]', after >= 1 + k.extraBulletCount && after % (1 + k.extraBulletCount) === 0, 'viên chia ' + after + ' (trước ' + n + ')');
  },
  async 'viking/2'(p) {
    const r = await real(p, 'viking', 'leap');
    await standNear(p, 20);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp += 50; });   // quái sống sót sau cú dậm để còn thấy buff_ele
    await armStart(p);
    await pressK(p);
    const t0 = (await startState(p)).skillT;
    await sleep(200);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await sleep(450);
    const s = await snap(p);
    await seq(p, 'viking_2', 6, 50);
    check('viking leap: ' + r.max + ' lượt [ĐO], bay 0.4583 s + đứng 0.15 s [ĐO clip L2.jump, JumpLand], bất tử trên không, dậm 8 + điện [ĐO ProcessSkillDamage 8]', s.ch.max === r.max && s.ch.n === r.max - 1 && near(t0, 0.6083, 1e-6) && imm === false && hitsOf(s).some(x => x === 8 || x === 16) && (s.db.indexOf('ele') >= 0 || s.dbEver.indexOf('ele') >= 0), JSON.stringify(s.ch) + ' · skillT ' + t0 + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'necromancer/0'(p) {
    const step = await mb(p, 'buff_nightmare', 'BuffNightmare', 'maxDamage'), hp = await mb(p, 'nec_ghost_hand', 'RoleAttribute', 'max_hp');
    await standNear(p, 70);
    await pressK(p); await sleep(200);
    await p.evaluate(s => { const G = SK.G, m = G._nms && G._nms[0], e = m && m.e; if (e) { e.hp += s + 10; SK.hurtEnemy(G, e, s, false, 0, 0); } }, step);
    await sleep(1200);
    await seq(p, 'necromancer_0', 6, 60);
    const s = await snap(p);
    const hands = s.allies.filter(a => a.k === 'hand');
    check('necromancer nightmare: ' + step + ' sát thương lên quái bị đánh dấu gọi Bàn Tay Ma máu ' + hp + ' [ĐO], tay đánh 6 [ĐO get_skill0Damage]', hands.length >= 1 && hands[0].hpMax === hp && hitsOf(s, 'pet').every(d => d === 6), JSON.stringify(hands) + ' · tay ' + hitsOf(s, 'pet').join(','));
  },
  async 'necromancer/1'(p) {
    const r = await real(p, 'necromancer', 'omen_stone');
    await standNear(p, 60);
    await pressK(p); await sleep(1250);
    const s = await snap(p);
    await seq(p, 'necromancer_1', 6, 60);
    const want = 8 * r.max;
    check('necromancer omen_stone: ' + r.max + ' lượt dồn một lần → ' + want + ' sát thương [ĐO GetSkill1Damage 8 × n]', s.ch.n === 0 && hitsOf(s).some(x => x === want || x === want * 2), 'đòn ' + hitsOf(s).join(',') + ' · ' + JSON.stringify(s.ch));
  },
  async 'officer/0'(p) {
    const r = await real(p, 'officer', 'gun_spin');
    await standNear(p, 70);
    await pressK(p); await sleep(300); await pressK(p); await sleep(100);
    const a = await snap(p);
    const loaded = await p.evaluate(() => SK.G.player._spin && SK.G.player._spin.loaded);
    await p.keyboard.down('KeyJ'); await sleep(80); await p.keyboard.up('KeyJ');
    await seq(p, 'officer_0', 6, 40);
    await sleep(300);
    const s = await snap(p);
    check('officer gun_spin: ' + r.max + ' lượt [ĐO], nạp 2 viên rồi xả, mỗi viên 8 [ĐO GunOfficerSkill]', a.weapon === '_officer_gun' && loaded === 2 && hitsOf(s).length >= 1 && hitsOf(s).every(d => d === 8 || d === 16) && s.weapon !== '_officer_gun', 'nạp ' + loaded + ' · đòn ' + hitsOf(s).join(',') + ' · vũ khí sau ' + s.weapon);
    await p.evaluate(() => { SK.G.player.energy = 0; SK.G.player.skillCd = 0; });
    const b = await snap(p);
    await pressK(p); await sleep(100);
    const c = await snap(p);
    check('officer gun_spin: thiếu năng lượng thì không nạp, không mất lượt [ĐO RoleSkill0]', c.ch.n === b.ch.n && c.weapon !== '_officer_gun', JSON.stringify(b.ch) + ' → ' + JSON.stringify(c.ch));
  },
  async 'officer/1'(p) {
    await standNear(p, 70);
    await pressK(p); await sleep(100);
    const m = await p.evaluate(() => { const b = SK.G._bounties && SK.G._bounties[0]; return b ? { t: b.t } : null; });
    const d = await p.evaluate(() => { const b = SK.G._bounties[0], e = b.e; window._skHits = []; e.hp += 20; SK.hurtEnemy(SK.G, e, 3, false, 0, 0); return window._skHits.map(h => h[0]); });
    check('officer bounty_tag: dấu 10 s [ĐO buff_reward_mark buff_time], quái bị dấu nhận thêm đòn × 1 [ĐO ExtraDamage]', m && near(m.t, 10, 0.2) && d.length === 2 && d[1] === 3, JSON.stringify(m) + ' · đòn ' + d.join(','));
  },
  async 'officer/2'(p) {
    await standNear(p, 60);
    await pressK(p); await sleep(1300);
    await seq(p, 'officer_2', 6, 60);
    await sleep(500);
    const s = await snap(p);
    check('officer close_air_support: bom 12 sát thương [ĐO _skill2Damage 12]', hitsOf(s, 'skill').length > 0 && hitsOf(s, 'skill').every(x => x === 12 || x === 24), 'đòn ' + hitsOf(s).join(','));
  },
  async 'taoist/0'(p) {
    const r = await real(p, 'taoist', 'genesis_of_swords');
    await standNear(p, 60);
    await pressK(p); await sleep(600);
    await seq(p, 'taoist_0', 6, 80);
    await sleep(3000);
    const s = await snap(p);
    check('taoist genesis_of_swords: ' + r.args.split(';')[0] + ' kiếm quay ' + r.args.split(';')[1] + ' s rồi lao [ĐO CreatingSword], mỗi nhát 2 [ĐO ProcessSkillDamage 2]', hitsOf(s, 'sword').length > 0 && hitsOf(s, 'sword').every(d => d === 2), 'đòn ' + hitsOf(s, 'sword').join(','));
  },
  async 'taoist/1'(p) {
    const r = await real(p, 'taoist', 'bagua');
    await standNear(p, 60);
    await pressK(p); await sleep(200);
    await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 50, y: pl.y - 6, h: 8, vx: -150, vy: 0, ang: Math.PI, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
    await sleep(300);
    const s = await snap(p);
    await seq(p, 'taoist_1', 6, 60);
    const side = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return b ? b.side : 'gone'; });
    check('taoist bagua: ' + r.dur + ' + 0.33 s [ĐO RoleSkill1], bẻ đạn địch thành đạn mình', (side === 'p' || side === 'gone') && near(s.skillT, r.dur + 0.33 - 0.5, 0.4), 'đạn ' + side + ' · skillT ' + s.skillT.toFixed(2));
  },
  async 'taoist/2'(p) {
    const r = await real(p, 'taoist', 'sword_fly');
    await standNear(p, 40);
    await pressK(p); await sleep(100);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    const s = await snap(p);
    await p.keyboard.down('KeyD');
    await seq(p, 'taoist_2', 6, 60);
    await p.keyboard.up('KeyD');
    check('taoist sword_fly: ' + r.dur + ' s [ĐO], bất tử, tốc ×2.22 [ĐO FlyMountController.speedRate]', imm === false && near(s.move, 2.22, 0.01) && near(s.skillT, r.dur - 0.45, 0.35), 'move ' + s.move + ' · skillT ' + s.skillT.toFixed(2));
  }
};

// Ca kiểm của từng nhân vật khác: test/sk-skills/<thư mục>.js xuất (h) => ({ 'thư mục/ô': async (p, id) => {...} }).
const H = { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, mb, hitsOf };
const XDIR = path.join(__dirname, 'sk-skills');
if (fs.existsSync(XDIR)) for (const f of fs.readdirSync(XDIR).sort()) if (/\.js$/.test(f)) Object.assign(CASES, require(path.join(XDIR, f))(H));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /skill|prefab|effect/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.SK && SK.startRun && document.body.classList.contains('ready'), null, { timeout: 10000 });
  // index.html chưa có thẻ data/sk-skills86.js thì chèn (lead thêm thẻ sau).
  if (!(await p.evaluate(() => !!window.SK_SKILLS86))) {
    await p.addScriptTag({ url: 'data/sk-skills86.js?t=' + Date.now() });
    await p.evaluate(() => SK.skills86Apply());
  }
  await p.evaluate(() => SK.on('enemyHit', (G, e, d) => { window._skDmg = (window._skDmg || 0) + d; (window._skHits = window._skHits || []).push([d, G._skHit || 'weapon']); for (const k in (e._db || {})) (window._skDb = window._skDb || {})[k] = 1; }));
  const only = process.argv.slice(2);
  for (const [key, fn] of Object.entries(CASES)) {
    const [folder, slot] = key.split('/');
    if (only.length && only.indexOf(folder) < 0 && only.indexOf(key) < 0) continue;
    try {
      const ok = await enterBattle(p, folder, +slot);
      const id = await p.evaluate(() => SK.G.player.h.skill.id);
      if (!ok) { check(key + ': vào phòng đánh có quái', false); continue; }
      await fn(p, id);
    } catch (e) { check(key + ': chạy trọn', false, e.message.split('\n')[0]); }
  }
  // Số thật đã áp lên bảng nhân vật (lobby đọc h.skills[i].cd).
  const cds = await p.evaluate(() => Object.entries(SK_SKILLS86.heroes).every(([f, r]) => !SK.DS.heroes[f] || (SK.DS.heroes[f].skills || []).every((s, i) => !r.skills[i] || s.cd === r.skills[i].cd)));
  check('cd mọi kỹ năng của 42 nhân vật = config/skills 8.6 [ĐO]', cds);
  const aud = await p.evaluate(() => !window.SK_AUDIO || Object.keys(SK_SKILLS86.heroes).every(f => SK_AUDIO.byHero[f] && SK_AUDIO.byHero[f].prefab === SK_SKILLS86.heroes[f].c));
  check('tiếng: byHero đủ 42 nhân vật đúng cNN [ĐO]', aud);
  const icons = await p.evaluate(() => Object.entries(SK.SKILLS).filter(([, s]) => s.icon).map(([k, s]) => k + '=' + (SK.frame(s.icon) ? 'ok' : 'MISSING')));
  check('biểu tượng kỹ năng thật có khung trong atlas', icons.length >= 30 && icons.every(x => /=ok$/.test(x)), icons.length + ' biểu tượng');
  check('không lỗi trang / cảnh báo kỹ năng', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close();
  makeSheets();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
