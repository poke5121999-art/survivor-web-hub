// Phone and tablet screenshots of the touch UI for the owner: .chk/mobile-ui/<profile>-<state>.png plus sheet.png.
//   timeout 900 node tools/mobile-shots.js     DTT_BASE=<hub url> shoots the deployed build
// A state whose screen cannot be reached is reported and left out; the tool exits 1 then, never saves a wrong picture.
'use strict';
const { execFileSync } = require('child_process');
const { session, open, CHK, fs, path } = require('./lib.js');
const OUT = path.join(CHK, 'mobile-ui');
const PROFILES = [['iphone', 844, 390], ['android', 915, 412], ['small', 740, 360], ['tablet', 1180, 820]];
const STATES = ['fight', 'autoaim', 'ownhp', 'feel-settings', 'autoaim-settings', 'nha', 'minimap', 'pause', 'editor', 'garage', 'shop', 'lobby'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [], saved = [];

const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; }, sel);
async function need(page, sel, what, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await shown(page, sel)) return; await sleep(120); }
  throw new Error(`${what}: "${sel}" is not visible`);
}
async function tap(page, sel, what) {
  await need(page, sel, what);
  const b = await page.locator(sel).first().boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

// fn returns the page to shoot, or the path of a screenshot it took itself (the fight shot is taken while the touches are held).
async function state(prof, name, fn, stem = `${prof}-${name}`) {
  try {
    const r = await fn(); const file = path.join(OUT, stem + '.png');
    if (typeof r === 'string') fs.renameSync(r, file); else await r.screenshot({ path: file });
    saved.push(file); console.log('ok   ', stem);
  } catch (e) { failures.push(`${stem}: ${e.message}`); console.log('FAIL ', `${stem}: ${e.message}`); }
}

async function ctxFor(br, w, h) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  return ctx;
}
const Q = 'noaudio&q=low&seed=7';
async function openIn(br, base, query, w, h) { const ctx = await ctxFor(br, w, h); const g = await open(br, base, query, { ctx }); g.ctx = ctx; return g; }
async function waitMatch(page) { await page.waitForFunction('window.__G && window.__G.mode === "match"', null, { timeout: 15000 }).catch(() => { throw new Error('the match did not start'); }); await sleep(1500); }

// Real touch points through CDP: the left thumb on the joystick, the right thumb dragging a skill button.
async function fightShot(page, w, h) {
  const cdp = await page.context().newCDPSession(page);
  const skill = await skillButton(page);
  const jx = Math.round(w * 0.14), jy = Math.round(h * 0.68);
  const pts = (a, b) => [{ x: a[0], y: a[1], id: 1 }, ...(b ? [{ x: b[0], y: b[1], id: 2 }] : [])];
  const send = (type, tp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: tp });
  await send('touchStart', pts([jx, jy], [skill.x, skill.y]));
  for (let i = 1; i <= 6; i++) await send('touchMove', pts([jx + 6 * i, jy - 5 * i], [skill.x - 11 * i, skill.y - 7 * i]));
  await sleep(500);
  const file = path.join(OUT, 'tmp-fight.png');
  await page.screenshot({ path: file });
  await send('touchEnd', []);
  return file;
}
// The skill button the right thumb drags: the first skill button of the touch layer.
async function skillButton(page) {
  const r = await page.evaluate(() => {
    // Selectors in order of preference; the first visible one wins.
    for (const sel of ['#touch .tc-ctl[data-id="s2"]', '#touch [data-skill="q"]', '#touch [data-skill="s1"]', '#touch .tbtn.s1', '#touch .tbtn.q', '#touch .tbtn:not(.ult):not(.item):not(.fire)']) {
      const e = document.querySelector(sel); if (!e) continue;
      const b = e.getBoundingClientRect(); if (b.width > 8 && b.height > 8) return { x: b.x + b.width / 2, y: b.y + b.height / 2, sel };
    }
    return null;
  });
  if (!r) throw new Error('no skill button found in #touch (selector in fightShot/skillButton needs updating)');
  return r;
}

// Auto-aim: three frozen enemies in the clear around the mech, the right thumb holding fire without dragging; the shot is taken while held.
async function autoAimShot(page, w, h) {
  const spot = await page.evaluate(async () => {
    const M = await import('./js/maps.js'), m = __G.match, me = m.units[0], map = m.map;
    me.maxHp = me.hp = 1e6;
    const free = [];
    for (let k = 0; k < 24; k++) for (const d of [8, 6.5, 5]) {
      const a = k / 24 * 6.2832, x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
      if (!M.solidAt(map, x, z, 0.9) && M.losClear(map, me.x, me.z, x, z, 0.5)) free.push([x, z, a, d]);
    }
    const pick = [], used = [];
    for (const f of free) { if (used.every((a) => Math.abs(Math.atan2(Math.sin(a - f[2]), Math.cos(a - f[2]))) > 0.9)) { used.push(f[2]); pick.push(f); } if (pick.length === 3) break; }
    const foes = m.units.filter((u) => u.team !== me.team);
    foes.forEach((u, i) => { const f = pick[i]; u.stunT = 1e6; u.hp = u.maxHp; if (f) { u.x = u.px = f[0]; u.z = u.pz = f[1]; } else { u.x = u.px = 40; u.z = u.pz = -30 + i * 3; } });
    for (const u of m.units) if (u.id && u.team === me.team) { u.stunT = 1e6; }
    return pick.length;
  });
  if (spot < 2) throw new Error('no open ground around the mech for the auto-aim scene');
  const cdp = await page.context().newCDPSession(page);
  const f = await page.evaluate(() => { const b = document.querySelector('#touch [data-id="fire"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  const send = (type, tp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: tp });
  await send('touchStart', [{ x: f[0], y: f[1], id: 1 }]);
  await sleep(900);
  const lock = await page.evaluate(() => __G.input.lock);
  if (!lock) { await send('touchEnd', []); throw new Error('no target ring: G.input.lock is null while fire is held'); }
  const file = path.join(OUT, 'tmp-autoaim.png');
  await page.screenshot({ path: file });
  await send('touchEnd', []);
  return file;
}

async function contactSheet(files) {
  const list = JSON.stringify(files);
  execFileSync('python3', ['-I', '-c', `import sys, json, os
from PIL import Image, ImageDraw, ImageFont
files = json.loads(sys.argv[1]); out = sys.argv[2]
profiles = ${JSON.stringify(PROFILES.map((p) => p[0]))}; states = ${JSON.stringify(STATES)}
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
CW = 480; CH = 270; PAD = 10; HEAD = 34; LAB = 150
have = {os.path.basename(f)[:-4]: f for f in files}
W = LAB + len(states) * (CW + PAD) + PAD; H = HEAD + len(profiles) * (CH + PAD + 28) + PAD + 28 + 600
sheet = Image.new('RGB', (W, H), (14, 18, 22)); d = ImageDraw.Draw(sheet)
for i, s in enumerate(states): d.text((LAB + i * (CW + PAD) + 4, 6), s, fill=(242, 182, 50), font=font)
for r, p in enumerate(profiles):
    y = HEAD + r * (CH + PAD + 28)
    d.text((8, y + CH // 2 - 10), p, fill=(233, 238, 242), font=font)
    for i, s in enumerate(states):
        x = LAB + i * (CW + PAD); f = have.get(p + '-' + s)
        if f:
            im = Image.open(f).convert('RGB'); im.thumbnail((CW, CH + 28)); sheet.paste(im, (x, y))
        else: d.rectangle([x, y, x + CW, y + CH], outline=(160, 40, 40)); d.text((x + 10, y + 10), 'missing', fill=(220, 90, 90), font=font)
y = HEAD + len(profiles) * (CH + PAD + 28) + 6
d.text((8, y), 'portrait', fill=(233, 238, 242), font=font)
f = have.get('portrait')
if f:
    im = Image.open(f).convert('RGB'); im.thumbnail((CW, 560)); sheet.paste(im, (LAB, y))
sheet.save(out, optimize=True)`, list, path.join(OUT, 'sheet.png')]);
}

session(async (br, base) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  for (const [prof, w, h] of PROFILES) {
    // Menu screens
    let g = await openIn(br, base, Q + '&fakenet=1', w, h);
    const P = g.page;
    await state(prof, 'garage', async () => { await tap(P, '#ui .tabs button[data-tab="up"]', 'garage tab'); await need(P, '#ui .garage .up, #ui .garage .up-sum', 'garage upgrades'); await sleep(400); return P; });
    await state(prof, 'shop', async () => { await tap(P, '#ui .shopbtn', 'shop button'); await need(P, '#ui .shop.on', 'shop screen'); await sleep(500); return P; });
    try { await tap(P, '#ui .shop.on [data-r="back"]', 'shop back'); await sleep(300); } catch (e) { /* the lobby step reports a blocked menu */ }
    await state(prof, 'lobby', async () => {
      await tap(P, '#ui .netbtn', 'online button'); await need(P, '#ui .online.on', 'online entry');
      await tap(P, '#ui .online [data-r="create"]', 'create room'); await need(P, '#ui .lobby.on', 'lobby screen');
      await need(P, '#ui .lb-code b', 'room code'); await sleep(500); return P;
    });
    await g.ctx.close();
    g = await openIn(br, base, Q + '&fakenet=1', w, h);
    await state(prof, 'feel-settings', async () => {
      await tap(g.page, '#ui [data-r="bSet"]', 'settings button'); await need(g.page, '#ui .modal.on [data-r="vibeSeg"] button', 'Rung điện thoại entry', 4000);
      await g.page.evaluate(() => document.querySelector('#ui [data-r="shakeSeg"]').parentNode.scrollIntoView({ block: 'start' })); await sleep(400); return g.page;
    });
    await g.page.evaluate(() => document.querySelector('#ui .modal.on [data-r="close"]').click());
    await state(prof, 'autoaim-settings', async () => {
      await tap(g.page, '#ui [data-r="bSet"]', 'settings button'); await need(g.page, '#ui .modal.on [data-r="autoAim"]', 'Tự nhắm entry', 4000);
      await g.page.evaluate(() => document.querySelector('#ui [data-r="touchGrp"]').scrollIntoView({ block: 'center' })); await sleep(400); return g.page;
    });
    await g.ctx.close();
    // Thủ nhà
    g = await openIn(br, base, Q + '&mode=nha&autostart&mech=trau', w, h);
    await state(prof, 'nha', async () => { await waitMatch(g.page); await need(g.page, '#ui .hud.on', 'HUD'); return g.page; });
    await g.ctx.close();
    // Fight, minimap, pause, editor on one match
    g = await openIn(br, base, Q + '&autostart&mech=trau&bots=easy', w, h);
    const M = g.page;
    await state(prof, 'fight', async () => {
      await waitMatch(M); await need(M, '#touch.on', 'touch controls');
      return fightShot(M, w, h);
    });
    await state(prof, 'autoaim', async () => { await need(M, '#touch.on', 'touch controls'); return autoAimShot(M, w, h); });
    // The player's bar, an ally's and an enemy's, all in view and each at a different health.
    await state(prof, 'ownhp', async () => {
      await M.evaluate(() => {
        const m = __G.match, me = m.units[0], ally = m.units.find((u) => u.id && u.team === me.team), foe = m.units.find((u) => u.team !== me.team);
        for (const u of m.units) if (u.id) u.stunT = 1e6;
        ally.x = ally.px = me.x + 4; ally.z = ally.pz = me.z + 1.5; foe.x = foe.px = me.x - 4; foe.z = foe.pz = me.z + 1.5;
        me.hp = me.maxHp * 0.8; ally.hp = ally.maxHp * 0.7; foe.hp = foe.maxHp * 0.55;
      });
      await sleep(600); return M;
    });
    await state(prof, 'minimap', async () => { await tap(M, '#ui .mm', 'minimap'); await need(M, '#ui .mm.big', 'expanded minimap'); await sleep(500); return M; });
    await M.evaluate(() => document.querySelector('#ui .mm') && document.querySelector('#ui .mm').classList.remove('big'));
    await state(prof, 'pause', async () => { await tap(M, '#ui .pausebtn', 'pause button'); await need(M, '#ui .pause.on', 'pause menu'); await sleep(400); return M; });
    await state(prof, 'editor', async () => {
      await M.evaluate(() => window.__G.ui.hidePause());
      const has = await M.evaluate(() => !!(window.__G.input.layout && window.__G.input.layout.edit));
      if (!has) throw new Error('G.input.layout.edit() does not exist yet');
      await M.evaluate(() => window.__G.input.layout.edit());
      await need(M, '#touch.editing, #layout-editor, .layout-editor, #touch .editing', 'layout editor'); await sleep(500); return M;
    });
    await g.ctx.close();
  }
  // Portrait rotate prompt
  const g = await openIn(br, base, Q, 390, 844);
  await state('portrait', '', async () => { await need(g.page, '#ui', 'ui'); await sleep(800); return g.page; }, 'portrait');
  await g.ctx.close();
  await contactSheet(saved);
  console.log('\nfiles:'); for (const f of fs.readdirSync(OUT).sort()) console.log('  ' + path.join(OUT, f));
  if (failures.length) { console.log('\nUNREACHABLE STATES:\n  ' + failures.join('\n  ')); process.exit(1); }
});
