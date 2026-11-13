// Review shots for Sói and Nhện Đồng: the pick screen, every skill mid-cast in first and third person (from behind and
// from the front right), the beast form, the web swing line, the net in flight, caught and bursting, and both weapons.
// Writes PNGs and contact sheets (sheet-soi.png, sheet-nhen.png, sheet-weapons.png) into <outDir>.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/heroshots.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.chk-newheroes'); fs.mkdirSync(OUT, { recursive: true });

const { FIND_ROOF } = require('./roofspot.js');

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  const shots = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'heroshots@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?fp=1&select=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const clearHud = () => page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }");
    const snap = async (name, clip) => { await clearHud(); await page.waitForTimeout(160); const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, clip }); shots.push(f); };

    // pick screen
    for (const id of ['soi', 'nhen']) {
      await page.evaluate(`(() => { __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); })()`);
      await page.waitForTimeout(1300); await snap('sel-' + id);
    }
    const roof = await page.evaluate(FIND_ROOF);
    console.log('roof spot', JSON.stringify(roof));

    // stage: the hero in the plaza with a crowd ahead; prep runs before the cast, then the game runs `t` seconds and freezes
    const stage = (id, tp, prep, slot, t, opts = {}) => page.evaluate(`(() => { const G = __G; const P = G.player; G.god = true;
      __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); __select.go(); __sim(0.2); G.state = 'playing'; G.tps.on = ${!!tp};
      G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
      P.pos.set(0, 0, 12); P.yaw = 0; P.pitch = -0.1; P.vel.set(0, 0, 0); P.input.fire = false; __sim(0.3);
      const zs = []; for (const [x, zz] of ${JSON.stringify(opts.zs || [[-1.6, 6], [0, 5.4], [1.6, 6], [-0.8, 3.8], [0.9, 3.6], [-2.2, 3], [2.4, 4]])}) { const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); z.pos.set(x, 0, zz); z.yaw = 0; z.speed = ${opts.speed || 0}; z.hp = z.maxHp = 99999; z.attackT = 99; zs.push(z); }
      __sim(0.2); ${prep || ''}
      ${slot ? `G.hero.ult = 1; G.hero.t.ultOn = 0; for (const k of ['s1', 's2']) { G.hero.slots[k].n = 2; G.hero.slots[k].cd = 0; } G.hero.use('${slot}');` : ''}
      __sim(${t}); G.state = 'paused'; __sim(0); return { w: G.weapons.cur(), y: +P.pos.y.toFixed(2) }; })()`);
    // a three-quarter camera from the front right of the hero (body readable), frozen
    const side = (d = 3.4, h = 1.2, look = 1.0) => page.evaluate(`(() => { const G = __G; const P = G.player; const c = G.camera; const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw); const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      c.fov = 55; c.updateProjectionMatrix(); c.position.set(P.pos.x + rx * ${d} * 0.75 + fx * ${d} * 0.75, P.pos.y + ${h}, P.pos.z + rz * ${d} * 0.75 + fz * ${d} * 0.75); c.lookAt(P.pos.x, P.pos.y + ${look}, P.pos.z); c.updateMatrixWorld(); __sim(0); })()`);
    const over = (x, y, z, lx, ly, lz) => page.evaluate(`(() => { const c = __G.camera; c.fov = 55; c.updateProjectionMatrix(); c.position.set(${x}, ${y}, ${z}); c.lookAt(${lx}, ${ly}, ${lz}); c.updateMatrixWorld(); __sim(0); })()`);
    const hold = () => page.evaluate('__G.fx.__u = __G.fx.__u || __G.fx.update; __G.fx.update = () => {}');
    const release = () => page.evaluate('__G.fx.update = __G.fx.__u || __G.fx.update');

    const CASTS = {
      soi: [['lunge', 's1', 0.18, 'P.pitch = 0.15;'], ['howl', 's2', 0.7, ''], ['werewolf', 'ult', 0.45, ''], ['wolf-form', 'ult', 2.2, '']],
      nhen: [['swing', 's1', 0.35, ''], ['yank', 's2', 0.16, ''], ['webnet-fly', 'ult', 0.32, ''], ['webnet-caught', 'ult', 1.6, ''], ['webnet-tight', 'ult', 3.17, ''], ['webnet-burst', 'ult', 3.34, '']],
    };
    for (const id of ['soi', 'nhen']) {
      for (const [name, slot, t, prep] of CASTS[id]) {
        let pre = prep;
        if (name === 'swing' && roof) pre = `P.pos.set(${roof.x}, 0, ${roof.z}); P.vel.set(0, 0, 0); __sim(0.05); const h = new G.THREE.Vector3(${roof.hook.join(',')}); const dx = h.x - P.pos.x, dz = h.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(h.y - (P.pos.y + 1.6), Math.hypot(dx, dz)); __sim(1 / 60);`;
        if (name === 'yank') pre = 'const z = zs[1]; z.pos.set(0, 0, 1); P.pitch = -0.02;';
        for (const tp of [false, true]) {
          await stage(id, tp, pre, slot, t); await hold();
          await snap(`${id}-${name}-${tp ? 'tp' : 'fp'}`);
          if (tp) { await side(name.startsWith('webnet') ? 7 : /wolf/.test(name) ? 4.8 : 3.6, name.startsWith('webnet') ? 3.2 : /wolf/.test(name) ? 1.9 : 1.3, name.startsWith('webnet') ? 0.4 : /wolf/.test(name) ? 1.5 : 1.0); await snap(`${id}-${name}-side`); }
          await release();
        }
      }
    }
    // the beast close up, a claw swipe from the side, first-person claws; the net from above
    await stage('soi', true, '', 'ult', 2.0); await side(4.6, 1.9, 1.5); await snap('soi-beast-side');
    await stage('soi', true, '', 'ult', 2.0); await page.evaluate("(() => { const G = __G; G.state = 'playing'; G.player.input.fire = true; __sim(0.06); G.player.input.fire = false; G.state = 'paused'; __sim(0); })()"); await hold(); await side(4.6, 1.9, 1.5); await snap('soi-beast-swipe'); await release();
    await stage('soi', false, '', 'ult', 2.0); await snap('soi-claws-fp');
    await stage('soi', false, '', 'ult', 2.0); await page.evaluate("(() => { const G = __G; G.state = 'playing'; G.player.input.fire = true; __sim(0.07); G.player.input.fire = false; G.state = 'paused'; __sim(0); })()"); await hold(); await snap('soi-claws-fp-swipe'); await release();
    await stage('nhen', true, '', 'ult', 1.6); await hold(); await over(9, 12, 14, 0, 0, 3); await snap('nhen-webnet-top'); await release();
    if (roof) {
      // the swing seen from the side, mid-arc toward the roof
      const pre = `P.pos.set(${roof.x}, 0, ${roof.z}); P.vel.set(0, 0, 0); __sim(0.05); const h = new G.THREE.Vector3(${roof.hook.join(',')}); const dx = h.x - P.pos.x, dz = h.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(h.y - (P.pos.y + 1.6), Math.hypot(dx, dz)); __sim(1 / 60);`;
      await stage('nhen', true, pre, 's1', 0.45); await hold(); await side(7, 2.5, 2.2); await snap('nhen-swing-arc'); await release();
      const top = await stage('nhen', true, pre, 's1', 2.0); console.log('swing end', JSON.stringify(top)); await snap('nhen-swing-roof');
    }
    // weapons: first person idle and mid action, third person from the side
    for (const [id, hero, act] of [['hatchet', 'soi', 0.12], ['webbow', 'nhen', 0.03]]) {
      await stage(hero, false, '', null, 0.4, { zs: [[0, 9.4], [1.2, 8.6]] }); await snap(`w-${id}-fp-idle`);
      await stage(hero, false, `P.input.fire = true; __sim(${act}); P.input.fire = false;`, null, 0, { zs: [[0, 9.4], [1.2, 8.6]] }); await hold(); await snap(`w-${id}-fp-act`); await release();
      await stage(hero, true, '', null, 0.4, { zs: [[0, 9.4], [1.2, 8.6]] }); await side(2.8, 1.4, 1.1); await snap(`w-${id}-tp-idle`);
      await stage(hero, true, `P.input.fire = true; __sim(${act}); P.input.fire = false;`, null, 0, { zs: [[0, 9.4], [1.2, 8.6]] }); await hold(); await side(2.8, 1.4, 1.1); await snap(`w-${id}-tp-act`); await release();
    }
    // the hatchet's bleed and the web stacks: third swing / three bolts on one zombie
    await stage('soi', false, 'for (let i = 0; i < 3; i++) { G.weapons.S.swing = null; G.weapons.S.cool = 0; P.input.fire = true; __sim(0.05); P.input.fire = false; __sim(0.4); }', null, 0.15, { zs: [[0, 10]] }); await snap('w-hatchet-bleed');
    await stage('nhen', true, 'for (let i = 0; i < 3; i++) { G.weapons.S.cool = 0; P.input.fire = true; __sim(1 / 60); P.input.fire = false; __sim(0.25); }', null, 0.1, { zs: [[0, 6]] }); await side(3.5, 1.5, 1.0); await snap('w-webbow-root');
    console.log(problems.length ? 'problems: ' + problems.slice(0, 5).join(' | ') : 'no console errors');
  } finally { await br.close(); srv.close(); }
  const py = `
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]
def sheet(name, keys, cols, cw=480, ch=270):
    rows = (len(keys) + cols - 1) // cols
    im = Image.new('RGB', (cw * cols, ch * rows), (20, 20, 24)); d = ImageDraw.Draw(im)
    for i, k in enumerate(keys):
        f = os.path.join(out, k + '.png')
        if not os.path.exists(f): continue
        t = Image.open(f).convert('RGB'); t.thumbnail((cw, ch)); x = (i % cols) * cw; y = (i // cols) * ch; im.paste(t, (x, y)); d.text((x + 6, y + 4), k, fill=(255, 255, 0))
    im.save(os.path.join(out, name))
soi = ['sel-soi'] + [f'soi-{n}-{v}' for n in ['lunge', 'howl', 'werewolf', 'wolf-form'] for v in ['fp', 'tp', 'side']] + ['soi-beast-side', 'soi-beast-swipe', 'soi-claws-fp', 'soi-claws-fp-swipe']
nhen = ['sel-nhen'] + [f'nhen-{n}-{v}' for n in ['swing', 'yank', 'webnet-fly', 'webnet-caught', 'webnet-tight', 'webnet-burst'] for v in ['fp', 'tp', 'side']] + ['nhen-webnet-top', 'nhen-swing-arc', 'nhen-swing-roof']
w = [f'w-{i}-{v}' for i in ['hatchet', 'webbow'] for v in ['fp-idle', 'fp-act', 'tp-idle', 'tp-act']] + ['w-hatchet-bleed', 'w-webbow-root']
sheet('sheet-soi.png', soi, 4); sheet('sheet-nhen.png', nhen, 4); sheet('sheet-weapons.png', w, 4)
`;
  fs.writeFileSync(path.join(OUT, '_sheet.py'), py);
  try { execFileSync('python', [path.join(OUT, '_sheet.py'), OUT]); console.log('sheets: ' + ['sheet-soi', 'sheet-nhen', 'sheet-weapons'].map((n) => path.join(OUT, n + '.png')).join(', ')); } catch (e) { console.log('sheet failed: ' + e.message); }
})().catch((e) => { console.error(e); process.exit(2); });
