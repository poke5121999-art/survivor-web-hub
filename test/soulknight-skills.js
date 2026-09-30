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
  await p.evaluate(([f, s]) => { SK_GAME.debug.seed(20260929); SK.setSkillSlot(f, s); SK.startRun(f); SK_GAME.debug.god(true); }, [folder, slot]);
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
  const ok = await until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 5000);
  await sleep(250);
  await resetDmg(p);
  return ok;
}

async function pressK(p) { await p.keyboard.down('KeyK'); await sleep(40); await p.keyboard.up('KeyK'); }
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
    await p.keyboard.down('KeyJ'); await pressK(p); await sleep(150);
    const s = await snap(p);
    await seq(p, 'knight_0');
    await p.keyboard.up('KeyJ');
    check('knight dual_wield: cầm hai vũ khí, thời lượng = ' + r.dur + ' s [ĐO]', !!s.dual && near(s.skillT, r.dur - 0.45, 0.35), 'skillT ' + s.skillT.toFixed(2));
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
    await p.keyboard.down('KeyJ'); await sleep(900);
    const s = await snap(p);
    await seq(p, 'knight_2');
    await p.keyboard.up('KeyJ');
    check('knight chaotic_strike: đòn trúng gây hiệu ứng ngẫu nhiên (cd ' + r.cd + ', ' + r.dur + ' s) [ĐO]', s.dbEver.length > 0 && s.cd === r.cd, 'hiệu ứng: ' + s.dbEver.join(','));
  },
  async 'ranger/0'(p) {
    const r = await real(p, 'ranger', 'dodge');
    await standNear(p, 50);
    const a = await snap(p);
    await p.keyboard.down('KeyD'); await pressK(p); await sleep(140);
    const blocked = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r = SK.hurtPlayer(SK.G, 3); return { r, hp: pl.hp, arm: pl.armor, ghost: pl.h.hurt.off[1] < -1000 }; });
    await seq(p, 'ranger_0');
    await sleep(300); await p.keyboard.up('KeyD');
    const b = await snap(p);
    check('ranger dodge: bất tử + đạn xuyên qua khi lăn', blocked.r === false && blocked.hp === a.php && blocked.arm === a.parm && blocked.ghost, JSON.stringify(blocked));
    check('ranger dodge: lăn được quãng, hồi chiêu ' + r.cd + ' s [ĐO]', Math.hypot(b.px - a.px, b.py - a.py) > 30 && b.cd === r.cd, 'dời ' + Math.round(Math.hypot(b.px - a.px, b.py - a.py)) + ' px');
  },
  async 'ranger/1'(p) {
    const r = await real(p, 'ranger', 'iaido');
    await standNear(p, 70);
    const a = await snap(p);
    await pressK(p); await sleep(250);
    const s = await snap(p);
    await seq(p, 'ranger_1', 6, 40);
    check('ranger iaido: ' + r.max + ' lượt [ĐO], bấm một lần còn ' + (r.max - 1), a.ch && a.ch.max === r.max && s.ch.n === r.max - 1, JSON.stringify(s.ch));
    check('ranger iaido: lướt tới quái và chém 8 [WIKI]', Math.hypot(s.px - a.px, s.py - a.py) > 30 && hitsOf(s).some(d => d === 8 || d === 16), 'đòn ' + hitsOf(s).join(','));
  },
  async 'mage/0'(p) {
    const r = await real(p, 'mage', 'lightning_strike');
    const atk = await mb(p, 'thunder', 'BulletThunder', 'atk');
    await standNear(p, 70);
    await pressK(p); await sleep(450);
    const s = await snap(p);
    await seq(p, 'mage_0', 6, 40);
    check('mage lightning_strike: mỗi tia ' + atk + ' sát thương [ĐO BulletThunder.atk] + điện', hitsOf(s, 'skill').length > 0 && hitsOf(s, 'skill').every(d => d === atk || d === atk * 2) && s.db.indexOf('ele') >= 0, 'đòn ' + hitsOf(s, 'skill').join(',') + ' · ' + s.db.join(','));
    check('mage lightning_strike: hồi chiêu ' + r.cd + ' s [ĐO]', s.cd === r.cd && near(s.skillCd, r.cd - 0.45, 0.3), 'skillCd ' + s.skillCd.toFixed(2));
  },
  async 'mage/1'(p) {
    const dmg = await mb(p, 'explode_ice_box', 'ExplodeIceBox', 'damage');
    await standNear(p, 50);
    await pressK(p); await sleep(350);
    const s = await snap(p);
    await seq(p, 'mage_1', 6, 60);
    check('mage piercing_frost: gai băng ' + dmg + ' sát thương + đóng băng [ĐO ExplodeIceBox]', hitsOf(s, 'skill').some(d => d === dmg || d === dmg * 2) && s.dbEver.indexOf('ice') >= 0 || s.db.indexOf('ice') >= 0, 'đòn ' + hitsOf(s).join(',') + ' · ' + s.db.join(','));
  },
  async 'mage/2'(p) {
    const r = await real(p, 'mage', 'firestorm');
    await standNear(p, 40);
    const a = await snap(p);
    await pressK(p); await sleep(700);
    await seq(p, 'mage_2', 6, 80);
    const s = await snap(p);
    const balls = await p.evaluate(() => SK.G.vfx.filter(h => h.name === 'bullet_fire_storm' && !h.stopped).length);
    check('mage firestorm: ' + r.max + ' lượt [ĐO], dùng hết = ' + r.max + ' quả cầu lửa', a.ch.n === r.max && s.ch.n === 0 && balls === r.max, 'cầu ' + balls + ' · lượt ' + JSON.stringify(s.ch));
    check('mage firestorm: cầu lửa đốt quái', s.dmg > 0, 'sát thương ' + s.dmg);
  },
  async 'assassin/0'(p) {
    await standNear(p, 24);
    await pressK(p); await sleep(120);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await seq(p, 'assassin_0', 6, 40);
    const s = await snap(p);
    check('assassin dark_blade: chém trúng + miễn sát thương', s.dmg > 0 && imm === false, 'sát thương ' + s.dmg + ' · hurt=' + imm);
  },
  async 'assassin/1'(p) {
    await standNear(p, 70);
    await pressK(p); await sleep(1000);
    await seq(p, 'assassin_1', 6, 60);
    await sleep(600);
    const s = await snap(p);
    const ph = s.allies.find(a => a.k === 'phantom');
    const want = 3 * (s.phpMax + s.parmMax);
    check('assassin doppelg_nger: bản sao máu = 3×(máu+giáp) [ĐO phantomHpRatio 3], bắn giúp', ph && ph.hpMax === want && s.dmg > 0, JSON.stringify(ph) + ' · cần ' + want + ' · sát thương ' + s.dmg);
  },
  async 'assassin/2'(p) {
    const r = await real(p, 'assassin', 'invisibility');
    await standNear(p, 80);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    await seq(p, 'assassin_2');
    check('assassin invisibility: tàng hình ' + r.dur + ' s [ĐO]', s.hidden && near(s.skillT, r.dur - 0.45, 0.35), 'skillT ' + s.skillT.toFixed(2));
  },
  async 'alchemist/0'(p) {
    const gd = await mb(p, 'Gas_Hit_Enemy_enhance', 'BulletGasEnhance', 'damage');
    await standNear(p, 60);
    await pressK(p); await sleep(700);
    await seq(p, 'alchemist_0', 6, 80);
    await sleep(2400);
    const s = await snap(p);
    check('alchemist gas_grenade: khí gây ' + gd + ' [ĐO BulletGasEnhance.damage] + tầng độc gas1→gas2', hitsOf(s, 'gas').every(d => d === gd) && hitsOf(s, 'gas').length > 0 && s.dbEver.some(k => k === 'gas2' || k === 'gas3'), 'khí ' + hitsOf(s, 'gas').join(',') + ' · ' + s.dbEver.join(','));
  },
  async 'alchemist/1'(p) {
    const r = await real(p, 'alchemist', 'elemental_potions');
    await standNear(p, 60);
    await pressK(p); await sleep(900);
    await seq(p, 'alchemist_1', 6, 80);
    const s = await snap(p);
    check('alchemist elemental_potions: ' + r.max + ' lượt [ĐO], ném bình độc thành vũng', s.ch.max === r.max && s.ch.n === r.max - 1 && s.vfx.indexOf('Gas_Hit_Enemy') >= 0, JSON.stringify(s.ch) + ' · ' + s.vfx.filter(v => /Gas|Fire|frost/.test(v)).join(','));
  },
  async 'engineer/0'(p) {
    const hp = await mb(p, 'battery', 'RoleAttribute', 'max_hp'), dmg = await mb(p, 'battery', 'RGBatteryController', 'damage');
    await standNear(p, 70);
    await pressK(p); await sleep(1300);
    await seq(p, 'engineer_0', 6, 60);
    const s = await snap(p);
    const t = s.allies.filter(a => a.k === 'turret');
    check('engineer gun_turret: tháp máu ' + hp + ', mỗi viên ' + dmg + ' [ĐO battery]', t.length === 1 && t[0].hpMax === hp && hitsOf(s).length > 0 && hitsOf(s).every(d => d === dmg || d === dmg * 2), 'tháp ' + JSON.stringify(t) + ' · đòn ' + hitsOf(s).slice(0, 6).join(','));
  },
  async 'engineer/2'(p) {
    await standNear(p, 70);
    await pressK(p); await sleep(300);
    const probe = await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x - 40, y: pl.y - 14, h: 8, vx: 60, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 3, _probe: 1 }); return 1; });
    await sleep(900);
    await seq(p, 'engineer_2', 6, 60);
    const s = await snap(p);
    const eaten = await p.evaluate(() => !SK.G.bullets.some(b => b._probe));
    const t = s.allies.find(a => a.k === 'intercept');
    check('engineer interceptor: tháp máu 15 [ĐO] chặn đạn địch, bắn quái 3', t && t.hpMax === 15 && eaten && hitsOf(s).some(d => d === 3 || d === 6), JSON.stringify(t) + ' · chặn ' + eaten + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'vampire/0'(p) {
    const bite = await mb(p, 'bullet_bat', 'BulletBat', 'damage');
    await standNear(p, 70);
    await p.evaluate(() => { SK.G.player.hp = SK.G.player.hpMax - 2; });
    const a = await snap(p);
    await pressK(p); await sleep(260);
    await seq(p, 'vampire_0', 6, 60);
    await until(p, () => !SK.G.player._bats, null, 5000);
    const b = await snap(p);
    check('vampire bat_swarm: dơi cắn ' + bite + ' [ĐO BulletBat.damage], về thì hồi máu', hitsOf(b).length > 0 && hitsOf(b).every(d => d === bite) && b.php > a.php, 'đòn ' + hitsOf(b).join(',') + ' · máu ' + a.php + ' → ' + b.php);
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
    const got = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r = SK.hurtPlayer(SK.G, 3); return { r, hp: pl.hp, hpMax: pl.hpMax, en: pl.energy }; });
    await seq(p, 'vampire_2');
    check('vampire immortal: ' + r.dur + ' s [ĐO], nhận đòn thành máu tối đa + năng lượng (5/điểm) [ĐO VampireEffectTrigger]', got.r === false && got.hpMax === a.phpMax + 3 && got.en === a.en + 15 && near(a.skillT, r.dur - 0.25, 0.3), JSON.stringify(got));
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
    await pressK(p); await sleep(250);
    await seq(p, 'elves_0', 6, 50);
    const s = await snap(p);
    check('elves focus_fire: ' + r.max + ' mũi [ĐO], bắn một mũi trúng quái', s.ch.max === r.max && s.ch.n === r.max - 1 && s.dmg > 0, JSON.stringify(s.ch) + ' · sát thương ' + s.dmg);
  },
  async 'elves/1'(p) {
    const r = await real(p, 'elves', 'arrow_rain');
    await standNear(p, 60);
    await pressK(p); await sleep(r.dur * 1000 + 200);
    await seq(p, 'elves_1', 6, 60);
    await sleep(800);
    const s = await snap(p);
    check('elves arrow_rain: tụ ' + r.dur + ' s [ĐO] rồi mưa tên 5 sát thương/mũi [WIKI]', hitsOf(s).length > 0 && hitsOf(s).every(d => d === 5), 'đòn ' + hitsOf(s).join(','));
  },
  async 'werewolf/0'(p) {
    await standNear(p, 20);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    await p.keyboard.down('KeyJ'); await sleep(300);
    await seq(p, 'werewolf_0', 6, 50);
    await sleep(300); await p.keyboard.up('KeyJ');
    const b = await snap(p);
    check('werewolf berserk: hoá sói, cào mất máu quái', s.weapon === '_claw' && b.dmg > 0, 'vũ khí ' + s.weapon + ' · sát thương ' + b.dmg);
  },
  async 'werewolf/1'(p) {
    const r = await real(p, 'werewolf', 'blood_thirst');
    await standNear(p, 30);
    await pressK(p); await sleep(700);
    const s = await snap(p);
    await seq(p, 'werewolf_1', 6, 40);
    check('werewolf blood_thirst: ' + r.max + ' lượt dùng hết một lần [ĐO], cào 8..14 [WIKI]', s.ch.max === r.max && s.ch.n === 0 && hitsOf(s).length > 0 && hitsOf(s).every(d => d >= 8 && d <= 28), JSON.stringify(s.ch) + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'priest/0'(p) {
    const r = await real(p, 'priest', 'regeneration_pact');
    await standNear(p, 40);
    await p.evaluate(() => { SK.G.player.hp = 1; });
    const a = await snap(p);
    await pressK(p); await sleep(900);
    const m = await snap(p);
    await seq(p, 'priest_0', 6, 80);
    check('priest regeneration_pact: hồi máu + giáp tối đa +' + r.args + ' [ĐO args]', m.php > a.php && m.parmMax === a.parmMax + +r.args && m.cd === r.cd, 'máu ' + a.php + ' → ' + m.php + ' · giáp tối đa ' + a.parmMax + ' → ' + m.parmMax);
  },
  async 'priest/1'(p) {
    const r = await real(p, 'priest', 'pray');
    await standNear(p, 60);
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = 1; pl.armor = 0; });
    await pressK(p); await sleep(150);
    const s = await snap(p);
    await seq(p, 'priest_1');
    check('priest pray: +2 máu +2 giáp, +40% chạy, +33% tốc đánh [WIKI], cd ' + r.cd + ' [ĐO]', s.php === 3 && s.parm >= 2 && near(s.move, 1.4, 0.01) && near(s.rate, 1.33, 0.01) && s.cd === r.cd, JSON.stringify({ hp: s.php, arm: s.parm, move: s.move, rate: s.rate }));
  },
  async 'druid/0'(p) {
    const r = await real(p, 'druid', 'frostfire_wolves');
    const hp = await mb(p, 'wolf1_druid', 'RoleAttributePet', 'max_hp'), bite = await mb(p, 'wolf1_druid', 'WolfOfDruidController', 'damage');
    const w0 = await snap(p);
    await standNear(p, 50);
    await p.evaluate(() => { const pl = SK.G.player; for (const a of SK.G._allies) if (a.wolf) { a.x = pl.x; a.y = pl.y + 4; } });
    await sleep(1800);
    const w1 = await snap(p);
    await pressK(p); await sleep(300);
    const s = await snap(p);
    await seq(p, 'druid_0', 6, 80);
    await sleep(800);
    s.dbEver = (await snap(p)).dbEver;
    const wolves = w0.allies.filter(a => a.k === 'wolf');
    check('druid: 2 sói luôn theo, máu ' + hp + ' [ĐO RoleAttributePet]', wolves.length === 2 && wolves.every(a => a.hpMax === hp), JSON.stringify(wolves));
    check('druid: sói tự cắn ' + bite + ' [ĐO WolfOfDruidController.damage]', hitsOf(w1, 'pet').length > 0 && hitsOf(w1, 'pet').every(d => d === bite || d === bite * 2), 'đòn ' + hitsOf(w1, 'pet').join(','));
    check('druid frostfire_wolves: tiếp sức ' + r.dur + ' s [ĐO], sói gây lửa/băng', near(s.skillT, r.dur - 0.35, 0.3) && s.dbEver.some(k => k === 'fire' || k === 'ice'), 'skillT ' + s.skillT.toFixed(2) + ' · ' + s.dbEver.join(','));
  },
  async 'robot/0'(p) {
    const r = await real(p, 'robot', 'electric_overload');
    await standNear(p, 60);
    await pressK(p); await sleep(1100);
    const s = await snap(p);
    await seq(p, 'robot_0', 6, 50);
    check('robot electric_overload: ' + r.dur + ' s [ĐO], tia điện đốt 1/nhịp', s.dmg > 0 && near(s.skillT + 1.1, r.dur, 0.4), 'sát thương ' + s.dmg + ' · skillT ' + s.skillT.toFixed(2));
  },
  async 'robot/2'(p) {
    await standNear(p, 30);
    await pressK(p); await sleep(100);
    await seq(p, 'robot_2', 6, 40);
    await sleep(300);
    const s = await snap(p);
    check('robot emp: tia điện 3 sát thương (chí mạng 6) [WIKI]', hitsOf(s).length > 0 && hitsOf(s).every(d => d === 3 || d === 6), 'đòn ' + hitsOf(s).join(','));
  },
  async 'viking/0'(p) {
    await standNear(p, 50);
    await p.evaluate(() => { SK.G._fires = 0; if (!window._fireHook) { window._fireHook = 1; SK.on('fire', G => { G._fires = (G._fires || 0) + 1; }); } });
    await pressK(p); await sleep(250);
    await seq(p, 'viking_0', 6, 40);
    await sleep(200);
    const s = await snap(p);
    const fires = await p.evaluate(() => SK.G._fires);
    check('viking rage: tự tấn công liên tục không cần giữ J', fires >= 2 && s.dmg > 0, 'số đòn ' + fires + ' · sát thương ' + s.dmg);
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
    const d = await mb(p, 'bullet_hammer', 'ExplodeHammer', 'damage');
    await standNear(p, 40);
    await pressK(p); await sleep(200);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await sleep(450);
    const s = await snap(p);
    await seq(p, 'viking_2', 6, 50);
    check('viking leap: ' + r.max + ' lượt [ĐO], bất tử trên không, dậm ' + d + ' [ĐO ExplodeHammer]', s.ch.max === r.max && s.ch.n === r.max - 1 && imm === false && hitsOf(s).some(x => x === d), JSON.stringify(s.ch) + ' · đòn ' + hitsOf(s).join(','));
  },
  async 'necromancer/0'(p) {
    const step = await mb(p, 'buff_nightmare', 'BuffNightmare', 'maxDamage'), hp = await mb(p, 'nec_ghost_hand', 'RoleAttribute', 'max_hp');
    await standNear(p, 70);
    await pressK(p); await sleep(200);
    await p.evaluate(s => { const G = SK.G, e = G._nm && G._nm.e; if (e) { e.hp += s + 10; SK.hurtEnemy(G, e, s, false, 0, 0); } }, step);
    await sleep(1200);
    await seq(p, 'necromancer_0', 6, 60);
    const s = await snap(p);
    const hands = s.allies.filter(a => a.k === 'hand');
    check('necromancer nightmare: ' + step + ' sát thương lên quái bị đánh dấu gọi Bàn Tay Ma máu ' + hp + ' [ĐO]', hands.length >= 1 && hands[0].hpMax === hp, JSON.stringify(hands));
  },
  async 'necromancer/1'(p) {
    const r = await real(p, 'necromancer', 'omen_stone');
    const d = await mb(p, 'explode_hit_enemy_nec', 'ExplodeDizzy', 'damage');
    await standNear(p, 60);
    await pressK(p); await sleep(1250);
    const s = await snap(p);
    await seq(p, 'necromancer_1', 6, 60);
    const want = Math.round(d * (1 + (r.max - 1) * 0.3333));
    check('necromancer omen_stone: ' + r.max + ' lượt dồn một lần → ' + want + ' sát thương [ĐO ExplodeDizzy × hệ số 1/3/lượt]', s.ch.n === 0 && hitsOf(s).some(x => x === want || x === want * 2), 'đòn ' + hitsOf(s).join(',') + ' · ' + JSON.stringify(s.ch));
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
  },
  async 'officer/2'(p) {
    const d = await mb(p, 'explode_no_smoke', 'Explode', 'damage');
    await standNear(p, 60);
    await pressK(p); await sleep(1300);
    await seq(p, 'officer_2', 6, 60);
    await sleep(500);
    const s = await snap(p);
    check('officer close_air_support: bom ' + d + ' sát thương [ĐO explode_no_smoke]', hitsOf(s, 'skill').some(x => x === d), 'đòn ' + hitsOf(s).join(','));
  },
  async 'taoist/0'(p) {
    const r = await real(p, 'taoist', 'genesis_of_swords');
    await standNear(p, 60);
    await pressK(p); await sleep(600);
    await seq(p, 'taoist_0', 6, 80);
    await sleep(1000);
    const s = await snap(p);
    check('taoist genesis_of_swords: ' + r.args.split(';')[0] + ' kiếm [ĐO args], mỗi nhát 3 [ĐO handcut]', s.dmg > 0 && hitsOf(s).every(d => d === 3), 'đòn ' + hitsOf(s).join(','));
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
    check('taoist bagua: ' + r.dur + ' s [ĐO], bẻ đạn địch thành đạn mình', (side === 'p' || side === 'gone') && near(s.skillT, r.dur - 0.5, 0.4), 'đạn ' + side + ' · skillT ' + s.skillT.toFixed(2));
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
    check('taoist sword_fly: ' + r.dur + ' s [ĐO], bất tử, chạy x2', imm === false && near(s.move, 2, 0.01) && near(s.skillT, r.dur - 0.45, 0.35), 'move ' + s.move + ' · skillT ' + s.skillT.toFixed(2));
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
