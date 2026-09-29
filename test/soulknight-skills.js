/*
 * Kiểm thử kỹ năng nhân vật Hiệp Sĩ Linh Hồn (games/soulknight/js/skills.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-skills.js [folder...]
 * Ảnh chụp giữa lúc dùng kỹ năng: $SK_SHOTS hoặc <tmp>/soulknight-skills/<folder>.png
 *
 * Mỗi nhân vật: SK.startRun(folder) → dịch tới phòng đánh → chờ quái hiện → đặt người chơi cách một con quái
 * vài ô → bấm PHÍM K thật → kiểm đúng tác dụng của kỹ năng (máu quái giảm, bất tử khi lăn, khiên chặn đòn...).
 * Bật "god" để lượt đo không phụ thuộc độ khó.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

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

// Đặt người chơi cách con quái gần nhất `dist` px (chỗ trống, cùng hàng ngang nếu được).
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
        pl.x = x; pl.y = y;
        // Quái đứng yên trong lúc đo để lượt đo không lệ thuộc AI.
        for (const q of G.enemies) { q.cd = 99; if (q.st !== 'spawn' && q.st !== 'dead') { q.st = 'idle'; q.stT = 99; } }
        return true;
      }
    }
    return false;
  }, dist);
}

const snap = p => p.evaluate(() => {
  const G = SK.G, pl = G.player;
  return {
    hp: SK_GAME.enemyHp, dmg: window._skDmg || 0, n: SK_GAME.enemyCount, php: pl.hp, parm: pl.armor, parmMax: pl.armorMax, px: pl.x, py: pl.y,
    skillT: pl.skillT, skillCd: pl.skillCd, props: G.props.length, stun: G.enemies.filter(e => e.st === 'stun' && e._stunT > 0).length,
    weapon: pl.weapons[pl.cur] && pl.weapons[pl.cur].id, dual: !!pl.dual
  };
});

async function enterBattle(p, folder) {
  await p.evaluate(f => { SK_GAME.debug.seed(20260929); SK.startRun(f); SK_GAME.debug.god(true); }, folder);
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
  const ok = await until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 5000);
  await sleep(250);
  return ok;
}

async function pressK(p) { await p.keyboard.down('KeyK'); await sleep(40); await p.keyboard.up('KeyK'); }

const HEROES = {
  async knight(p) {
    await standNear(p, 60);
    await p.keyboard.down('KeyJ');
    await pressK(p);
    await sleep(200);
    await shot(p, 'knight');
    const s = await snap(p);
    await p.keyboard.up('KeyJ');
    check('knight dual_wield: cầm hai vũ khí', s.dual && s.skillT > 4, 'skillT ' + s.skillT.toFixed(2));
  },
  async ranger(p) {
    await standNear(p, 50);
    const a = await snap(p);
    await p.keyboard.down('KeyD');
    await pressK(p);
    await sleep(160);
    const blocked = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r = SK.hurtPlayer(SK.G, 3); return { r, hp: pl.hp, arm: pl.armor, ghost: pl.h.hurt.off[1] < -1000, roll: pl.anims.idle }; });
    await shot(p, 'ranger');
    await sleep(500);
    await p.keyboard.up('KeyD');
    const b = await snap(p);
    check('ranger dodge: bất tử + đạn xuyên qua khi lăn', blocked.r === false && blocked.hp === a.php && blocked.arm === a.parm && blocked.ghost, JSON.stringify(blocked));
    check('ranger dodge: lăn đi được quãng đường', Math.hypot(b.px - a.px, b.py - a.py) > 30, 'dời ' + Math.round(Math.hypot(b.px - a.px, b.py - a.py)) + ' px');
    check('ranger dodge: xong thì trả hộp trúng đòn', await p.evaluate(() => SK.G.player.h.hurt.off[1] > -1000));
  },
  async mage(p) {
    await standNear(p, 70);
    const a = await snap(p);
    await pressK(p);
    await sleep(420);
    await shot(p, 'mage');
    await sleep(200);
    const b = await snap(p);
    check('mage lightning_strike: máu quái giảm + choáng', b.dmg > a.dmg && b.stun > 0, 'sát thương ' + (b.dmg - a.dmg) + ' · choáng ' + b.stun);
  },
  async assassin(p) {
    await standNear(p, 24);
    const a = await snap(p);
    await pressK(p);
    await sleep(120);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await shot(p, 'assassin');
    await sleep(300);
    const b = await snap(p);
    check('assassin dark_blade: chém trúng + miễn sát thương', b.dmg > a.dmg && imm === false, 'sát thương ' + (b.dmg - a.dmg) + ' · hurt=' + imm);
  },
  async alchemist(p) {
    await standNear(p, 60);
    const a = await snap(p);
    const psn0 = await p.evaluate(() => window._skPsn || 0);
    await pressK(p);
    await sleep(700);
    await shot(p, 'alchemist');
    await sleep(900);
    const b = await snap(p);
    const psn = (await p.evaluate(() => window._skPsn || 0)) - psn0;
    check('alchemist gas_grenade: vũng độc làm mất máu + trúng độc', b.dmg > a.dmg && psn > 0, 'sát thương ' + (b.dmg - a.dmg) + ' · đòn trúng lúc đang nhiễm độc ' + psn);
  },
  async engineer(p) {
    await standNear(p, 70);
    const a = await snap(p);
    await pressK(p);
    await sleep(1300);
    const t = await p.evaluate(() => SK.G.props.filter(q => q.turret).length);
    await shot(p, 'engineer');
    const b = await snap(p);
    check('engineer gun_turret: tháp nằm trong G.props và bắn trúng', t === 1 && b.dmg > a.dmg, 'tháp ' + t + ' · sát thương ' + (b.dmg - a.dmg));
  },
  async vampire(p) {
    await standNear(p, 70);
    await p.evaluate(() => { SK.G.player.hp = SK.G.player.hpMax - 2; });
    const a = await snap(p);
    await pressK(p);
    await sleep(260);
    await shot(p, 'vampire');
    await until(p, () => !SK.G.player._bats, null, 5000);
    const b = await snap(p);
    check('vampire bat_swarm: dơi cắn mất máu, về thì hồi máu', b.dmg > a.dmg && b.php > a.php, 'sát thương ' + (b.dmg - a.dmg) + ' · máu mình ' + a.php + ' → ' + b.php + ' · hồi chiêu ' + b.skillCd.toFixed(1));
  },
  async paladin(p) {
    await standNear(p, 60);
    const a = await snap(p);
    await pressK(p);
    await sleep(200);
    const r = await p.evaluate(() => {
      const G = SK.G, pl = G.player; pl.invulT = 0;
      const hurt = SK.hurtPlayer(G, 3);
      // Một viên đạn địch bay thẳng vào người: bong bóng phải nuốt mất.
      G.bullets.push({ side: 'e', kind: 'orb', x: pl.x - 60, y: pl.y - 8, h: 8, vx: 200, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 });
      return { hurt };
    });
    await sleep(400);
    await shot(p, 'paladin');
    const b = await snap(p);
    const probe = await p.evaluate(() => SK.G.bullets.some(x => x._probe));
    check('paladin energy_shield: khiên chặn đòn + nuốt đạn', r.hurt === false && !probe && b.php === a.php && b.parm === a.parm, 'hurt=' + r.hurt + ' · đạn còn=' + probe + ' · máu ' + b.php + ' giáp ' + b.parm);
  },
  async viking(p) {
    await standNear(p, 50);
    const a = await snap(p);
    await p.evaluate(() => { SK.G._fires = 0; SK.on('fire', G => { G._fires = (G._fires || 0) + 1; }); });
    await pressK(p);
    await sleep(250);
    await shot(p, 'viking');
    await sleep(400);
    const b = await snap(p);
    const fires = await p.evaluate(() => SK.G._fires);
    check('viking rage: tự tấn công liên tục không cần giữ J', fires >= 2 && b.dmg > a.dmg, 'số đòn ' + fires + ' · sát thương ' + (b.dmg - a.dmg));
  },
  async werewolf(p) {
    await standNear(p, 20);
    const a = await snap(p);
    await pressK(p);
    await sleep(150);
    const s = await snap(p);
    await p.keyboard.down('KeyJ'); await sleep(500);
    await shot(p, 'werewolf');
    await sleep(400); await p.keyboard.up('KeyJ');
    const b = await snap(p);
    check('werewolf berserk: hoá sói, cào mất máu quái', s.weapon === '_claw' && b.dmg > a.dmg, 'vũ khí ' + s.weapon + ' · sát thương ' + (b.dmg - a.dmg));
  },
  async priest(p) {
    await standNear(p, 40);
    await p.evaluate(() => { SK.G.player.hp = 1; });
    const a = await snap(p);
    await pressK(p);
    await sleep(900);
    await shot(p, 'priest');
    const m = await snap(p);
    await sleep(1400);
    const b = await snap(p);
    check('priest regeneration_pact: hồi máu + giáp tối đa +2 + nổ 20 khi tan', m.php > a.php && m.parmMax === a.parmMax + 2 && b.dmg > a.dmg, 'máu ' + a.php + ' → ' + m.php + ' · giáp tối đa ' + a.parmMax + ' → ' + m.parmMax + ' · sát thương ' + (b.dmg - a.dmg));
  },
  async robot(p) {
    await standNear(p, 60);
    const a = await snap(p);
    await pressK(p);
    await sleep(1100);
    await shot(p, 'robot');
    const b = await snap(p);
    check('robot electric_overload: tia điện đốt máu quái', b.dmg > a.dmg, 'sát thương ' + (b.dmg - a.dmg));
  },
  async taoist(p) {
    await standNear(p, 60);
    const a = await snap(p);
    await pressK(p);
    await sleep(600);
    await shot(p, 'taoist');
    await sleep(1200);
    const b = await snap(p);
    check('taoist genesis_of_swords: kiếm bay chém quái', b.dmg > a.dmg, 'sát thương ' + (b.dmg - a.dmg));
  }
};

async function shot(p, name) {
  await p.screenshot({ path: path.join(SHOTS, name + '.png') });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /skill|prefab/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.SK && SK.startRun && document.body.classList.contains('ready'), null, { timeout: 10000 });
  // Cộng dồn sát thương gây cho quái: máu tổng không dùng được vì hạ hết đợt thì đợt sau hiện ra.
  await p.evaluate(() => SK.on('enemyHit', (G, e, d) => { window._skDmg = (window._skDmg || 0) + d; if (e._psn) window._skPsn = (window._skPsn || 0) + 1; }));
  const only = process.argv.slice(2);
  for (const [folder, fn] of Object.entries(HEROES)) {
    if (only.length && only.indexOf(folder) < 0) continue;
    try {
      const ok = await enterBattle(p, folder);
      if (!ok) { check(folder + ': vào phòng đánh có quái', false); continue; }
      await fn(p);
    } catch (e) { check(folder + ': chạy trọn', false, e.message.split('\n')[0]); }
  }
  const icons = await p.evaluate(() => Object.entries(SK.SKILLS).filter(([, s]) => s.icon).map(([k, s]) => k + '=' + (SK.frame(s.icon) ? 'ok' : 'MISSING')));
  check('biểu tượng kỹ năng có khung trong atlas', icons.every(x => /=ok$/.test(x)), icons.length + ' biểu tượng');
  check('không lỗi trang / cảnh báo kỹ năng', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
