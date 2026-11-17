// Play test through real input only: keyboard (WASD relative to the camera, F = bat) and CDP touch taps on HUD buttons.
//   node test/play.js          (from any copy of the repo; screenshots -> $SHOTS or ~/stealegg-ref/shots/play-*.png)
// The page is stepped with window.__step (fixed 1/30 s ticks) while keys are held, so a run takes about a minute.
// Reads of game state (positions, routes, HUD rects) steer the keys and check results; the only writes outside the
// input path are test setup: a seeded save (addInitScript) and the player's health set to 1 before the death check.
'use strict';
const { run, openPage, hudCenter } = require('./harness');

const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

// Hold the WASD keys that point closest to the wanted world direction for the current camera yaw.
async function setKeys(page, held, want) {
  const next = new Set();
  if (want) {
    const yaw = await page.evaluate(() => window.__game.view.follow.x * Math.PI / 180);
    // input.worldDir: t = atan2(x, y) + yaw, world = (sin t, -cos t)  =>  t_want = atan2(dx, -dz); stick angle = t_want - yaw
    const a = Math.atan2(want[0], -want[1]) - yaw;
    const sx = Math.sin(a), sy = Math.cos(a);
    if (sy > 0.38) next.add(KEYS.up);
    if (sy < -0.38) next.add(KEYS.down);
    if (sx > 0.38) next.add(KEYS.right);
    if (sx < -0.38) next.add(KEYS.left);
  }
  for (const k of held) if (!next.has(k)) await page.keyboard.up(k);
  for (const k of next) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  next.forEach(k => held.add(k));
}

// Walk along the sim's own fence-aware route to `target` (a point or a function of the state returning one).
async function walkTo(page, target, { reach = 0.6, maxSec = 60, until = null, stepTicks = 3 } = {}) {
  const held = new Set();
  let t = 0, path = null, replan = 0;
  try {
    while (t < maxSec) {
      const st = await page.evaluate(async ({ target, until, needPath }) => {
        const g = window.__game, s = g.sim.state, p = s.actors[0].pos;
        const tgt = typeof target === 'string' ? (0, eval)(target)(s, g) : target;
        const done = until ? (0, eval)(until)(s, g) : false;
        let path = null;
        if (needPath && tgt) {
          const { route } = await import('./js/sim/agent.js');
          path = route(g.sim, p, tgt) || [tgt];
        }
        return { p, tgt, done, path, ok: s.actors[0].combat.state === 'ok' };
      }, { target: typeof target === 'function' ? `(${target})` : target, until: until ? `(${until})` : null, needPath: !path || replan <= 0 });
      if (st.path) { path = st.path; replan = 1; }
      if (st.done) return { ok: true, t, pos: st.p };
      if (!st.tgt) return { ok: false, t, pos: st.p, why: 'no target' };
      const d = Math.hypot(st.p[0] - st.tgt[0], st.p[2] - st.tgt[2]);
      if (!until && d <= reach) return { ok: true, t, pos: st.p };
      while (path.length > 1 && Math.hypot(st.p[0] - path[0][0], st.p[2] - path[0][2]) < 0.45) path.shift();
      const w = path[0] || st.tgt;
      const dx = w[0] - st.p[0], dz = w[2] - st.p[2];
      await setKeys(page, held, st.ok && Math.hypot(dx, dz) > 0.05 ? [dx, dz] : null);
      await page.evaluate(n => window.__step(n, false), stepTicks);
      t += stepTicks / 30;
      replan -= stepTicks / 30;
    }
    return { ok: false, t, why: 'timeout' };
  } finally {
    await setKeys(page, held, null);
  }
}

async function touchAt(cdp, page, [x, y]) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7, radiusX: 3, radiusY: 3, force: 1 }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
}

// The ads break (every 60 s of play) puts its modal panel up: take the reward first, like a player would.
async function dismissAdsBreak(cdp, page) {
  for (const p of ['ads panel', 'ads panel (1)']) {
    const up = await page.evaluate(p => { const el = window.__game.view.hud.node(p); return !!el && el.checkVisibility(); }, p);
    if (up) { await touchAt(cdp, page, await hudCenter(page, `${p}/Panel/bottem/Ads`)); await page.evaluate(() => window.__step(1, true)); }
  }
}

async function tap(cdp, page, hudPath) {
  await dismissAdsBreak(cdp, page);
  const [x, y] = await hudCenter(page, hudPath);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7, radiusX: 3, radiusY: 3, force: 1 }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(60);
  return [x, y];
}

const S = (page, f, arg) => page.evaluate(f, arg);
const step = (page, n, draw = false) => page.evaluate(([n, d]) => window.__step(n, d), [n, draw]);
const draw = page => step(page, 1, true);

run('play', async ({ browser, base, shot, check }) => {
  // ---- A: fresh game: steal, carry, place, hatch, income, sell ----------------------------------------------------
  const A = await openPage(browser, `${base}/index.html?fresh&mute&seed=7`);
  let page = A.page, cdp = await A.ctx.newCDPSession(page);
  const duck = await S(page, () => window.__game.sim.D.animals.findIndex(a => a.name === 'White Duck'));
  check('White Duck exists', duck >= 0);
  // A rival may have reserved the duck's eggs (EggItem.reservedByAI blocks the player's steal): wait near the nest for a
  // free one (the next batch comes 30 s after the last one was secured).
  const eggOf = `(s) => { const id = Object.keys(s.items).find(k => s.items[k].kind === 'egg' && s.items[k].at.nest === ${duck} && s.items[k].reservedBy == null); return id ? s.animals[${duck}].nests[s.items[id].at.slot] : null; }`;
  const wait = await S(page, d => { const c = window.__game.sim.D.animals[d].eggCenter; return [c[0] - 4, c[1], c[2] + 3]; }, duck);
  let r = await walkTo(page, wait, { reach: 0.5, maxSec: 90 });
  check('walked to the White Duck nest with the keyboard', r.ok, `${r.t.toFixed(1)} s ${r.why || ''}`);
  let waited = 0;
  while (waited < 150 && !(await S(page, f => !!(0, eval)(f)(window.__game.sim.state), eggOf))) { await step(page, 30); waited++; }
  r = await walkTo(page, eggOf, { maxSec: 20, until: `(s) => !!s.ui.stealFill` });
  check('stood at a free White Duck egg', r.ok, `waited ${waited} s for a free egg, ${r.why || ''}`);
  // stand still in the egg trigger: the steal fill runs 2.0 s
  await step(page, 24);
  const fill = await S(page, () => {
    const g = window.__game, f = g.sim.state.ui.stealFill, el = g.view.hud.node('InGame/Image');
    return { f, shown: !!el && getComputedStyle(el).display !== 'none', mask: el && el.querySelector('.ugui-img').style.maskImage };
  });
  check('steal fill visible while standing at the egg', fill.f && fill.shown && fill.f.progress > 0.2, JSON.stringify(fill.f));
  await draw(page);
  await shot(page, 'play-steal-fill.png');
  for (let i = 0; i < 40 && !(await S(page, () => !!window.__game.sim.state.actors[0].carry)); i++) await step(page, 2);
  const stolen = await S(page, d => {
    const s = window.__game.sim.state, id = s.actors[0].carry && s.actors[0].carry.item;
    return { id, kind: id && s.items[id].kind, duck: s.animals[d].state };
  }, duck);
  check('egg in hand after the fill', stolen.kind === 'egg', JSON.stringify(stolen));
  check('the duck wakes and chases', stolen.duck === 'chase', stolen.duck);

  await S(page, () => { window.__carryId = window.__game.sim.state.actors[0].carry.item; window.__ev = []; window.__game.sim.listeners.push(e => { if (e.actor === 0 || e.target === 0 || e.item === window.__carryId) { const s = window.__game.sim.state; window.__ev.push(`${e.type}:${e.actor ?? e.target}@${e.t.toFixed(1)} p=${s.actors[0].pos.map(v => v.toFixed(1))} duck=${s.animals[0].pos.map(v => v.toFixed(1))}`); } }); });
  // carry home: the duck stands between the nest and the farm, so go round it on the far side of its strip (a slower
  // pursuer does not catch a target that runs away from it), then to the farm interior.
  const egc = await S(page, d => window.__game.sim.D.animals[d].eggCenter, duck);
  const duckZ = await S(page, d => window.__game.sim.state.animals[d].pos[2], duck);
  const side = duckZ > egc[2] ? -1 : 1;                // away from the duck across the strip
  for (const wp of [[egc[0] + 1, egc[1], egc[2] + side * 5], [egc[0] - 10, egc[1], egc[2] + side * 6], [egc[0] - 26, egc[1], egc[2] + side * 6]]) {
    r = await walkTo(page, wp, { reach: 1.2, maxSec: 20, stepTicks: 2 });
    if (wp === undefined) break;
    if (!(await S(page, () => window.__game.shotDone))) { await draw(page); await shot(page, 'play-carry-chase.png'); await S(page, () => { window.__game.shotDone = true; }); }
  }
  const farmSpot = await S(page, () => { const F = window.__game.sim.D.farm.area; return [F.c[0] + 2, F.c[1], F.c[2] - 2]; });
  r = await walkTo(page, farmSpot, { reach: 0.8, maxSec: 90 });
  const home = await S(page, () => { const s = window.__game.sim.state; return { ui: s.ui.placeButton, carry: s.actors[0].carry && s.items[s.actors[0].carry.item].kind }; });
  check('carried the egg home', r.ok && home.carry === 'egg', `${r.t.toFixed(1)} s ${JSON.stringify(home)} ${await S(page, () => window.__ev.join(' '))}`);
  check('PLACE EGG button shown', home.ui === 'PLACE EGG');
  await draw(page);
  const placeText = await S(page, () => window.__game.view.hud.node('PanelsAndButtons/place btn/Text (TMP)').textContent);
  check('place button text in Vietnamese', placeText === 'ĐẶT TRỨNG', placeText);
  await shot(page, 'play-place-button.png');
  await tap(cdp, page, 'PanelsAndButtons/place btn');
  await step(page, 2);
  const placed = await S(page, () => { const s = window.__game.sim.state; const id = Object.keys(s.items).find(k => s.items[k].kind === 'egg' && s.items[k].at.farm === 0); return id ? { id, readyAt: s.items[id].readyAt, pos: s.items[id].at.pos } : null; });
  check('PLACE EGG puts the egg on the farm', !!placed, JSON.stringify(placed));
  await draw(page);
  await shot(page, 'play-egg-placed.png');

  // fast-forward 30 s, then walk to the egg: auto hatch + place
  await step(page, 31 * 30);
  const ready = await S(page, id => window.__game.sim.state.items[id] && window.__game.sim.state.items[id].ready, placed.id);
  check('egg ready after 30 s', ready === true);
  await draw(page);
  await shot(page, 'play-egg-ready.png');
  r = await walkTo(page, placed.pos, { maxSec: 20, until: `(s) => Object.keys(s.items).some(k => s.items[k].kind === 'brainrot' && s.items[k].at.farm === 0)` });
  check('egg hatches into a brainrot placed on the farm', r.ok, `${r.t.toFixed(1)} s`);
  const br = await S(page, () => { const s = window.__game.sim.state; const id = Object.keys(s.items).find(k => s.items[k].kind === 'brainrot' && s.items[k].at.farm === 0); const b = window.__game.sim.D.seedIndex.get(s.items[id].seed); return { id, rate: b.rate, price: b.price, name: b.name, pos: s.items[id].at.pos }; });
  // income: coins rise every second by the rate
  const c0 = await S(page, () => window.__game.sim.state.coins);
  const series = [];
  for (let i = 0; i < 4; i++) { await step(page, 30); series.push(await S(page, () => window.__game.sim.state.coins)); }
  const diffs = series.map((c, i) => c - (i ? series[i - 1] : c0));
  check('coins rise every second by the brainrot rate', diffs.every(d => d === br.rate), `${br.name} rate ${br.rate}: ${diffs.join(',')}`);
  await draw(page);
  await step(page, 20, true);
  await shot(page, 'play-brainrot-farm.png');
  const coinLabel = await S(page, () => window.__game.view.hud.node('InGame/TopPanel/Coins/Text (TMP)').textContent);
  check('coin counter shows the balance (k format)', /^\d+(\.\d)?k$|^\d+$/.test(coinLabel), coinLabel);
  const save1 = await S(page, () => window.__game.sim.save());

  const playedA = await S(page, () => [...window.__game.gv.sound.names]);
  check('footsteps and hatch sounds fired', playedA.some(n => /player_footstep/.test(n)) && playedA.includes('sweet_game_over_sound_effect_230470'), playedA.join(','));
  // sell: stand at the brainrot, the sell panel opens, tap Sell
  r = await walkTo(page, br.pos, { maxSec: 15, until: `(s) => s.ui.sellTarget === '${br.id}'` });
  await step(page, 1);
  await draw(page);
  check('sell panel shown at the brainrot', r.ok && await S(page, () => getComputedStyle(window.__game.view.hud.node('PanelsAndButtons/SellPanle')).display !== 'none'));
  await shot(page, 'play-sell-panel.png');
  const before = await S(page, () => window.__game.sim.state.coins);
  await tap(cdp, page, 'PanelsAndButtons/SellPanle/Sell');
  await step(page, 1);
  const after = await S(page, () => window.__game.sim.state.coins);
  const goneBr = await S(page, id => !window.__game.sim.state.items[id], br.id);
  check('Sell pays the brainrot price', goneBr && after - before >= br.price && after - before <= br.price + br.rate, `+${after - before} (price ${br.price})`);
  await step(page, 8, true);
  await shot(page, 'play-sold-coins-fly.png');
  const orphans = await S(page, () => { const st = window.__game.gv.stats(); return { roots: st.roots, items: Object.keys(window.__game.sim.state.items).length }; });
  check('no orphan item meshes after sell', orphans.roots === orphans.items, JSON.stringify(orphans));
  check('no console errors (A)', !A.errors.length, A.errors.slice(0, 3).join(' | '));
  await A.ctx.close();

  // ---- B: seeded save (coins 5000, the brainrot on the farm): upgrade, lock gate, reload, bat hit, death, revive ----
  const seeded = JSON.parse(save1);
  seeded.coins = 5000;
  const B = await openPage(browser, `${base}/index.html?mute&play`, { init: { fn: s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('steal-egg-v1', s); sessionStorage.setItem('seeded', '1'); } }, arg: JSON.stringify(seeded) } });
  page = B.page; cdp = await B.ctx.newCDPSession(page);
  check('seeded save loads (coins 5000, 1 brainrot)', await S(page, () => { const s = window.__game.sim.state; return s.coins === 5000 && Object.values(s.items).filter(i => i.kind === 'brainrot' && i.at.farm === 0).length === 1; }));
  const pad = await S(page, () => window.__game.sim.D.farm.upgradeZone.c);
  r = await walkTo(page, pad, { maxSec: 30, until: `(s) => s.ui.upgradePanel` });
  await step(page, 3);
  await draw(page);
  const upText = await S(page, () => window.__game.view.hud.node('PanelsAndButtons/UPGRADE BUTTON/Text (TMP)').textContent);
  check('farm upgrade panel at the pad', r.ok && /NÂNG CẤP \$4000/.test(upText), upText);
  await shot(page, 'play-upgrade-panel.png');
  await tap(cdp, page, 'PanelsAndButtons/UPGRADE BUTTON');
  await step(page, 2);
  const up = await S(page, () => ({ level: window.__game.sim.state.farms[0].level, coins: window.__game.sim.state.coins, cap: window.__game.sim.state.ui.capacity }));
  check('upgrade buys level 1 for 4000', up.level === 1 && up.coins >= 1000 && up.coins < 1100, JSON.stringify(up));
  await step(page, 20, true);
  await shot(page, 'play-upgraded.png');

  // gate lock 60 s
  const gate = await S(page, () => window.__game.sim.D.gates.player.trigger.c);
  r = await walkTo(page, gate, { maxSec: 30, until: `(s) => s.ui.gateLock` });
  await step(page, 2);
  await draw(page);
  check('gate lock panel at the open gate', r.ok);
  await shot(page, 'play-gate-lock-panel.png');
  await tap(cdp, page, 'PanelsAndButtons/lockUnlockPlayerHouse/lockfor1mint');
  await step(page, 30);
  const g1 = await S(page, () => window.__game.sim.state.farms[0].gate);
  check('lock 60 s closes the gate', !g1.open && g1.remaining > 55 && g1.remaining <= 60 && g1.slide < 0.05, JSON.stringify(g1));
  await page.evaluate(() => { const v = window.__game.view; v.follow.x += 120; });
  await step(page, 5, true);
  await shot(page, 'play-gate-closed.png');
  await page.evaluate(() => { const v = window.__game.view; v.follow.x -= 120; });

  // reload keeps coins, farm level and brainrots
  const keep = await S(page, () => { window.__game.writeSave(); const s = window.__game.sim.state; return { coins: s.coins, level: s.farms[0].level, br: Object.values(s.items).filter(i => i.kind === 'brainrot' && i.at.farm === 0).length }; });
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.ready && window.__game.blur === 0, null, { timeout: 180000 });
  const kept = await S(page, () => { const s = window.__game.sim.state; return { coins: s.coins, level: s.farms[0].level, br: Object.values(s.items).filter(i => i.kind === 'brainrot' && i.at.farm === 0).length }; });
  check('reload keeps coins, farm level and brainrots', kept.coins >= keep.coins && kept.coins <= keep.coins + 50 && kept.level === keep.level && kept.br === keep.br,
    `${JSON.stringify(keep)} -> ${JSON.stringify(kept)}`);

  // bat hit on a rival: +100
  const rival = await S(page, () => {
    const s = window.__game.sim.state, p = s.actors[0].pos;
    let best = 1, bd = 1e9;
    for (let a = 1; a < s.actors.length; a++) { const d = Math.hypot(s.actors[a].pos[0] - p[0], s.actors[a].pos[2] - p[2]); if (d < bd) { bd = d; best = a; } }
    return best;
  });
  let hitOk = false, gain = 0;
  for (let attempt = 0; attempt < 6 && !hitOk; attempt++) {
    r = await walkTo(page, `(s) => s.actors[${rival}].brain.stun ? null : s.actors[${rival}].pos`, { reach: 0.9, maxSec: 60, stepTicks: 2 });
    if (!r.ok) continue;
    const c0 = await S(page, () => window.__game.sim.state.coins);
    // keep walking at the rival while the swing runs (the bat connects from 0.3 s on, in front of the player)
    const held = new Set();
    for (let i = 0; i < 14; i++) {
      const d = await S(page, a => { const s = window.__game.sim.state, p = s.actors[0].pos, q = s.actors[a].pos; return [q[0] - p[0], q[2] - p[2]]; }, rival);
      await setKeys(page, held, Math.hypot(d[0], d[1]) > 0.5 ? d : null);
      if (i === 1) await page.keyboard.press('KeyF');
      await step(page, 2);
    }
    await setKeys(page, held, null);
    const c1 = await S(page, () => window.__game.sim.state.coins);
    const stunned = await S(page, a => !!window.__game.sim.state.actors[a].brain.stun, rival);
    gain = c1 - c0;
    hitOk = stunned && gain >= 100;
    if (attempt === 0 || hitOk) { await step(page, 1, true); await shot(page, 'play-bat-hit.png'); }
  }
  check('bat hit (F key) knocks a rival out for +100', hitOk, `+${gain}`);

  // death -> revive (setup: health 1; a chasing rival hits)
  await S(page, () => { window.__game.sim.state.actors[0].hp = 1; });
  const chaser = await S(page, () => window.__game.sim.D.rivals.findIndex(r => r.hasPlayer) + 1);
  r = await walkTo(page, `(s) => s.actors[${chaser}].brain.stun ? null : s.actors[${chaser}].pos`, { reach: 1.2, maxSec: 90, until: `(s) => s.actors[0].combat.state !== 'ok'` });
  await step(page, 30 * 5);
  const dead = await S(page, () => window.__game.sim.state.ui.deathPanel);
  await draw(page);
  check('a rival hit at 1 HP kills the player and shows the revive panel', dead === true, `${r.t.toFixed(1)} s`);
  await shot(page, 'play-revive-panel.png');
  if (dead) {
    await tap(cdp, page, 'InGame/Fadepanel/Panel/Panel/Button');
    await step(page, 3);
    const rv = await S(page, () => ({ hp: window.__game.sim.state.actors[0].hp, st: window.__game.sim.state.actors[0].combat.state, panel: window.__game.sim.state.ui.deathPanel }));
    check('Revive (ad, granted at once) restores 5 HP in place', rv.hp === 5 && rv.st === 'ok' && !rv.panel, JSON.stringify(rv));
    await step(page, 10, true);
    await shot(page, 'play-revived.png');
  }
  const played = await S(page, () => [...window.__game.gv.sound.names]);
  check('sounds fired by events (bat swing, slap, coin, scream)', ['sfx_attack_mp3cut_net', 'hard_slap_46388', 'coin_collision_sound_342335', 'scriming_1'].every(n => played.includes(n)), played.join(','));
  check('no console errors (B)', !B.errors.length, B.errors.slice(0, 3).join(' | '));
  await B.ctx.close();

  // ---- C: sound on: the first touch starts WebAudio and the music loop ("sonami music") ---------------------------
  const C = await openPage(browser, `${base}/index.html?fresh&seed=7`);
  const cc = await C.ctx.newCDPSession(C.page);
  await tap(cc, C.page, 'InGame/Drag');
  await C.page.waitForFunction(() => { const s = window.__game.gv.sound; return s.ctx && s.ctx.state === 'running' && s.loops.get('sonami_music') && s.loops.get('sonami_music').src; }, null, { timeout: 20000 }).catch(() => {});
  const snd = await S(C.page, () => { const s = window.__game.gv.sound; return { state: s.ctx && s.ctx.state, music: !!(s.loops.get('sonami_music') && s.loops.get('sonami_music').src), decoded: s.buffers.size }; });
  check('first touch starts audio and the music loop', snd.state === 'running' && snd.music && snd.decoded > 10, JSON.stringify(snd));
  check('no console errors (C)', !C.errors.length, C.errors.slice(0, 3).join(' | '));
  await C.ctx.close();
});
