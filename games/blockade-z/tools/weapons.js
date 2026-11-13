// The eight newer weapons (spear, longsword, glaive, fists, minigun, dual pistols, javelin, shuriken): screenshots in first and
// third person for review, a contact sheet, and checks that each one does what its design says.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/weapons.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.weapons-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const NEW = [['spear', 'bang', 'fp'], ['longsword', 'thep', 'fp'], ['glaive', 'doc', 'fp'], ['fists', 'hoa', 'fp'], ['minigun', 'mua', 'rg'], ['dualpistol', 'yta', 'rg'], ['javelin', 'sam', 'rg'], ['shuriken', 'bong', 'rg']];

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'weapons@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?fp=1&autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const clearHud = () => page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }");
    // hand the hero its weapon and stand in the plaza; zs = [[x, z], ...] standing, unkillable zombies
    const stage = (hero, zs, tp) => page.evaluate(`(() => { const G = __G; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${hero}')); __select.go(); __sim(0.2); G.state = 'playing'; G.tps.on = ${!!tp};
      G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); const P = G.player; P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.04; P.vel.set(0, 0, 0); P.input.fire = false;
      const out = []; for (const [x, zz] of ${JSON.stringify(zs)}) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.yaw = 0; z.speed = 0; z.hp = z.maxHp = 99999; z.attackT = 99; out.push(z); }
      G.weapons.S.combo = 0; __sim(0.45); return { w: G.weapons.cur() }; })()`);
    // tp: also a second frame from the front right, where the held weapon and both arms can be seen
    const freeze = async (name, tp) => {
      await page.evaluate("__G.state = 'paused'"); await clearHud(); await page.waitForTimeout(180); await page.screenshot({ path: path.join(OUT, name + '.png') });
      if (tp) {
        await page.evaluate(`(() => { const G = __G; const P = G.player; const c = G.camera; c.position.set(P.pos.x + 1.9, P.pos.y + 1.5, P.pos.z - 2.4); c.lookAt(P.pos.x - 0.1, P.pos.y + 1.25, P.pos.z - 0.6); c.updateMatrixWorld(); })()`);
        await page.waitForTimeout(180); await page.screenshot({ path: path.join(OUT, name + '-side.png') });
      }
      await page.evaluate("__G.state = 'playing'");
    };

    // ---------- looks ----------
    for (const [id, hero, kind] of NEW) {
      const zs = kind === 'fp' ? [[0, 8.6], [1.4, 7.4]] : [[0, 4], [-1.3, 6], [1.4, 7]];
      for (const tp of [false, true]) {
        const tag = (tp ? 'tp-' : 'fp-') + id;
        const r = await stage(hero, zs, tp);
        check(r.w === id, `${hero} holds ${id} (${r.w})`);
        await freeze(tag + '-idle', tp);
        // mid action: a swing / a burst / a throw, frozen part-way
        const hold = { spear: 0.1, longsword: 0.2, glaive: 0.17, fists: 0.07, minigun: 0.62, dualpistol: 0.22, javelin: 0.13, shuriken: 0.09 }[id];
        await page.evaluate(`(() => { const G = __G; G.player.input.fire = true; __sim(${hold}); G.player.input.fire = false; })()`);
        await freeze(tag + '-act', tp);
        if (id === 'glaive' || id === 'fists' || id === 'spear') {
          // the third pattern: spin / uppercut / thrust
          await page.evaluate(`(() => { const G = __G; G.player.input.fire = false; __sim(0.9); G.weapons.S.combo = 2; G.player.input.fire = true; __sim(${id === 'glaive' ? 0.2 : id === 'fists' ? 0.09 : 0.1}); G.player.input.fire = false; })()`);
          await freeze(tag + '-third', tp);
        }
      }
    }

    // ---------- behaviour ----------
    const run = async (hero, zs, body) => {
      await stage(hero, zs, false);
      return page.evaluate(`(() => { const G = __G; const P = G.player; const S = G.weapons.S; const Z = G.zombies.list.filter((z) => z.alive); const lost = () => Z.map((z) => Math.round(z.maxHp - z.hp)); ${body} })()`);
    };

    // spear: a thrust goes through two zombies in a line, reaches 3.6 m+
    let r = await run('bang', [[0, 9.2], [0, 8.0], [0, 6.3]], 'P.input.fire = true; __sim(0.25); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] > 0 && r.lost[1] > 0, `spear pierces 2 in a line at 2.8 m and 4 m (${r.lost.join('/')} dmg)`);
    check(r.lost[2] === 0, `spear does not reach 5.7 m (${r.lost[2]} dmg)`);
    r = await run('bang', [[0, 9.2], [2.6, 9.2]], 'P.input.fire = true; __sim(0.25); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] > 0 && r.lost[1] === 0, `spear thrust is narrow: the zombie ahead is hit (${r.lost[0]}), the one 2.6 m to the side is not (${r.lost[1]})`);

    // longsword: wide arc, high damage; combo ends in an overhead that hits harder
    r = await run('thep', [[0, 9.6], [-1.6, 10.2], [1.6, 10.2]], 'P.input.fire = true; __sim(0.45); P.input.fire = false; return { lost: lost() };');
    check(r.lost.every((v) => v > 0), `longsword's first arc hits three zombies side by side (${r.lost.join('/')})`);
    const trial = (combo) => run('thep', [[0, 9.6]], `let sum = 0; for (let i = 0; i < 6; i++) { Z[0].hp = Z[0].maxHp; S.combo = ${combo}; S.comboT = 5; S.swing = null; S.cool = 0; P.input.fire = true; __sim(0.1); P.input.fire = false; __sim(0.8); sum += lost()[0]; } return { sum, pat: S.lastPat };`);
    const one = await trial(0); const over = await trial(2);
    check(over.pat === 'over' && over.sum > one.sum * 1.2, `longsword's third swing is the overhead and hits harder (6 swings: ${one.sum} -> ${over.sum})`);

    // glaive: the third swing is a spin that hits behind; the first two do not
    r = await run('doc', [[0, 13.2], [0, 9.7]], 'S.combo = 0; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; return { lost: lost() };');
    check(r.lost[0] === 0, `glaive's side sweep does not hit a zombie behind (${r.lost[0]})`);
    r = await run('doc', [[0, 13.2], [0, 9.7]], 'S.combo = 2; S.comboT = 5; P.input.fire = true; __sim(0.3); P.input.fire = false; return { lost: lost(), pat: S.lastPat };');
    check(r.pat === 'spin360' && r.lost[0] > 0 && r.lost[1] > 0, `glaive's spin hits the zombie behind (${r.lost[0]}) and the one in front (${r.lost[1]})`);

    // fists: quick weak jabs, the uppercut hits hard and throws the zombie back
    r = await run('hoa', [[0, 10.4]], 'P.input.fire = true; let n = 0; const dm = []; let prev = 0; for (let i = 0; i < 90 && dm.length < 3; i++) { __sim(1 / 60); const l = Z[0].maxHp - Z[0].hp; if (l > prev + 0.5) { dm.push(Math.round(l - prev)); prev = l; if (dm.length === 2) Z[0].vel.set(0, 0, 0); } } P.input.fire = false; return { dm, t: S.shots };');
    const jab = Math.min(r.dm[0], r.dm[1]); check(r.dm.length >= 3 && r.dm[2] > jab * 1.8 && jab < 40, `fists: two light jabs then a heavy uppercut (${r.dm.join(' / ')})`);
    r = await run('hoa', [[0, 10.4]], 'S.combo = 2; S.comboT = 5; const z = Z[0]; const z0 = z.pos.z; P.input.fire = true; __sim(0.12); P.input.fire = false; __sim(0.4); return { moved: +(z0 - z.pos.z).toFixed(2), vy: +z.pos.y.toFixed(2) };');
    check(r.moved > 0.4 || r.vy > 0.05, `the uppercut knocks the zombie back or up (${r.moved} m back, ${r.vy} m up)`);
    r = await run('hoa', [[0, 10.4]], 'S.combo = 0; S.comboT = 5; const z = Z[0]; const z0 = z.pos.z; P.input.fire = true; __sim(0.12); P.input.fire = false; __sim(0.4); return { moved: +(z0 - z.pos.z).toFixed(2) };');
    check(true, `(a jab pushes it ${r.moved} m)`);

    // minigun: spins up for 0.4 s before the first round, then a very high rate, with the build's slow
    r = await run('mua', [[0, 2]], `const out = {}; const s0 = S.shots; P.input.fire = true; __sim(0.2); out.early = S.shots - s0; out.spin = +S.spin.toFixed(2); out.ang = S.spinAng; __sim(0.28); out.late = S.shots - s0; const t1 = S.shots; __sim(1); out.rate = S.shots - t1; P.input.fire = false; out.mag = G.weapons.ammo().mag; return out;`);
    check(r.early === 0 && r.spin > 0.3 && r.spin < 0.7, `minigun fires nothing in the first 0.2 s of spin-up (${r.early} shots, spin ${r.spin})`);
    check(r.late > 0 && r.rate >= 15, `minigun fires after 0.4 s and keeps a high rate (${r.late} shots by 0.48 s, ${r.rate}/s)`);
    r = await run('mua', [], `const v = []; const W = BZ.WEAPONS.minigun; const slow = W.slow; for (const on of [false, true]) { W.slow = on ? slow : 0; P.pos.set(0, 0, 14); P.vel.set(0, 0, 0); P.yaw = 0; P.input.fire = true; P.touch.y = -1; __sim(1.2); v.push(Math.hypot(P.vel.x, P.vel.z)); P.input.fire = false; __sim(0.3); } W.slow = slow; P.touch.y = 0; return { v };`);
    check(r.v[1] < r.v[0] * 0.97 && r.v[1] > r.v[0] * 0.7, `the minigun slows its owner a little while firing (${r.v[0].toFixed(2)} -> ${r.v[1].toFixed(2)} m/s)`);

    // dual pistols: left and right muzzles take turns
    r = await run('yta', [[0, 4]], `const sides = []; let last = S.shots; P.input.fire = true; for (let i = 0; i < 120 && sides.length < 6; i++) { __sim(1 / 60); if (S.shots !== last) { last = S.shots; sides.push(S.side); } } P.input.fire = false; return { sides, lost: lost() };`);
    check(r.sides.length >= 6 && r.sides.every((v, i) => i === 0 || v !== r.sides[i - 1]), `dual pistols alternate muzzles (${r.sides.join('')}) and hit (${r.lost[0]} dmg)`);

    // javelin: a thrown arc that goes through three zombies
    r = await run('sam', [[0, 9], [0, 6.5], [0, 4]], `P.input.fire = true; __sim(0.2); P.input.fire = false; __sim(1.2); return { lost: lost(), mag: G.weapons.ammo().mag };`);
    check(r.lost.every((v) => v > 0) && r.mag === 2, `javelin pierces three zombies in a line (${r.lost.join('/')} dmg, ${r.mag} left in hand)`);
    r = await run('sam', [[0, 9.5], [0, 7.5], [0, 5.5], [0, 3.5]], `const hits = []; G.events.on('hit', (e) => hits.push(Z.indexOf(e.z))); P.input.fire = true; __sim(0.2); P.input.fire = false; __sim(1.5); return { hits };`);
    check(r.hits.length === 3 && !r.hits.includes(3), `javelin stops after three (bodies hit: ${r.hits.join(',')} of 0-3)`);

    // shuriken: a fan of three, one star per zombie
    r = await run('bong', [[-0.62, 4], [0, 4], [0.62, 4]], `P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.6); return { lost: lost() };`);
    check(r.lost.every((v) => v > 0), `shuriken throws a three-way fan (${r.lost.join('/')} dmg to left, centre, right)`);
    r = await run('bong', [[0, 4], [0, -2]], `P.input.fire = true; __sim(0.15); P.input.fire = false; __sim(0.6); return { lost: lost() };`);
    check(r.lost[0] > 0 && r.lost[1] === 0, `a star pierces one (${r.lost[0]}), not two (${r.lost[1]})`);

    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 4).join(' | ') : ''));

    // ---------- contact sheets (PIL) ----------
    const py = `
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]
FP = (300, 120, 1280, 720)   # the viewmodel area
TP = (230, 190, 850, 570)    # the hero from behind
SD = (160, 60, 1120, 660)    # the hero from the front right
CW, CH = 480, 300
def sheet(name, ids, cells):
    im = Image.new('RGB', (CW * len(cells), CH * len(ids)), (20, 20, 24))
    d = ImageDraw.Draw(im)
    for r, wid in enumerate(ids):
        for c, (key, box) in enumerate(cells):
            f = os.path.join(out, key.replace('{w}', wid) + '.png')
            if os.path.exists(f):
                t = Image.open(f).convert('RGB').crop(box); t.thumbnail((CW, CH)); im.paste(t, (c * CW, r * CH))
            d.text((c * CW + 6, r * CH + 4), key.replace('{w}', wid), fill=(255, 255, 0))
    im.save(os.path.join(out, name))
main = [('fp-{w}-idle', FP), ('fp-{w}-act', FP), ('tp-{w}-idle-side', SD), ('tp-{w}-act-side', SD)]
sheet('sheet-1.png', ['spear', 'longsword', 'glaive', 'fists'], main)
sheet('sheet-2.png', ['minigun', 'dualpistol', 'javelin', 'shuriken'], main)
sheet('sheet-third.png', ['spear', 'glaive', 'fists'], [('fp-{w}-third', FP), ('tp-{w}-third-side', SD), ('tp-{w}-third', TP)])
`;
    fs.writeFileSync(path.join(OUT, 'sheet.py'), py);
    try { execFileSync('python', [path.join(OUT, 'sheet.py'), OUT]); console.log('sheets: ' + path.join(OUT, 'sheet-1.png') + ', ' + path.join(OUT, 'sheet-2.png') + ', ' + path.join(OUT, 'sheet-third.png')); } catch (e) { console.log('sheet failed: ' + e.message); }
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
