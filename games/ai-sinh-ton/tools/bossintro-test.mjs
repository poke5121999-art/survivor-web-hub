// Boss entrance gate (js/view/bossintro.js): for every boss kind, on its own stage's boss wave, driven through the real frame loop
// (window.__frame on a frozen page, a virtual clock the tool advances):
//   I1 the entrance starts on the frame the sim spawns the boss, and the sim clock does not move while it plays
//   I2 close-up: after the landing the boss spans at least CLOSE_H of the frame (see Thresholds)
//   I3 in the close-up the boss is not under the letterbox bars nor cut by the frame (Addendum 9), allowance EDGE design px
//   I4 the name banner is shown, fits the frame and sits inside the lower bar; ends within END_MAX real seconds; afterwards
//      the fight camera is back (fov of the overview), game.cine is off and the sim clock moves again
//   I5 a tap on the frame ends it within one frame, takes no HUD action, and with "Rung màn hình" off it never shakes
//   I6 the same seed ends the stage the same way with and without the entrance (two kinds)
//   no console errors on any page. Strips (8 moments of the scene) go to .chk/bossintro/<phone>-<kind>.png.
// Usage: PLAYWRIGHT_PATH=... timeout 1500 node games/ai-sinh-ton/tools/bossintro-test.mjs [--only giant,ufo] [--phones xiaomi,s22]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', process['env'].CHK_SUB || '', 'bossintro');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY = arg('--only', '').split(',').filter(Boolean);
const PHONES = arg('--phones', 'xiaomi,s22').split(',');
const { check, done } = checker();

const STAGE = { giant: 1, thrower: 2, phantom: 3, queen: 4, brood: 5, vampire: 7, alien: 9, pharaoh: 10, ufo: 13, guardian: 15, dragon: 20 };
const KINDS = Object.keys(STAGE).filter((k) => !ONLY.length || ONLY.includes(k));
// Thresholds. CLOSE_H: the boss's larger extent (height or width share of the frame, from its projected vertices) is at least 0.38
// while the whole body stays inside the clear band between the boss bar and the lower bar (0.56 of the frame height), so it is a
// close-up that still leaves room for poses and wing beats. `fight` is printed for reference only: the fight camera's perspective
// makes a boss on the near rim large and cut by the frame edge (22 to 80% measured), so it is no yardstick for a close-up.
const CLOSE_H = 0.38;
const EDGE = 6;          // design px a pose (arms flung up, wings) may reach into a bar
const END_MAX = 4.0;     // real seconds
// The fight camera's lens is read from camera.js (game.cam.fovOver) at run time: it was a constant 19 here, written on the old
// camera; the owner-approved MCD camera (16236ae0) uses 27, and the check is that the intro hands back whatever the fight uses.
let FOV_OVER = 0;
const BAR = { top: 46, bot: 88 };
const CLEAR_TOP = 70;   // the HUD's boss bar hangs under the top bar down to 68 design px: the boss stays below it too
const DT = 1 / 60;

// page side: a virtual clock the tool owns, and a frame driver that records what each frame shows
const INSTALL = () => {
  let vt = performance.now();
  performance.now = () => vt;
  window.__fr = (dt) => { vt += dt * 1000; window.__frame(dt); };
  const G = window.__G; const S = { spawn: null, events: [] };
  G.on((e) => { if (e.e === 'boss' && !S.spawn) S.spawn = { uid: e.uid, kind: e.kind, simT: G.B.t }; });
  window.__bi = S;
};
// runs frames until `until` (source) holds or max frames; returns per-frame samples
const RUN = ([n, untilSrc, sample]) => {
  const G = window.__G; const I = G.intro; const until = new Function('G', 'I', 'return (' + untilSrc + ')'); const out = [];
  for (let i = 0; i < n; i++) {
    const wasActive = I.active; const simT = G.B ? G.B.t : -1;
    window.__fr(1 / 60);
    if (sample) {
      const sc = I.scene; const u = G.B && G.B.boss ? G.B.byUid.get(G.B.boss) : null;
      const box = u && u.alive ? I.boxOf(u.uid) : null;
      out.push({ i, active: I.active, wasActive, t: sc ? sc.t : -1, real: sc ? sc.real : -1, L: sc ? sc.def.L : 0, T: sc ? sc.def.T : 0, simT0: simT, simT: G.B ? G.B.t : -1, cine: !!G.cine, box, shake: G.juice.view.shake.px, fov: G.host.camera.fov, ui: I.uiDbg(), H: G.ui ? G.ui.H : 360, spawned: !!window.__bi.spawn });
    }
    if (until(G, I)) break;
  }
  return out;
};
const shot = async (page, file) => { await page.locator('#frame').screenshot({ path: path.join(OUT, file) }); return path.join(OUT, file); };
const bad = (list) => list.filter((x) => !/Failed to load resource/.test(x));

// the name banner's ink against the frame and the lower bar (design px), read from the text node the intro shows
const NAME = () => {
  const G = window.__G; const ui = G.ui; const scr = ui.scene.children.find((c) => c.isScreen && c.screenName === 'bossintro');
  if (!scr || !scr.visible) return null; ui.scene.updateMatrixWorld(true);
  const out = [];
  scr.traverse((o) => {
    const n = o.parent; if (!(o.isMesh && n && n.mesh === o && n.canvas) || !n.visible || o.material.opacity < 0.5) return;
    const V = new ui.THREE.Vector3(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [px, py] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { V.set(px, py, 0).applyMatrix4(o.matrixWorld); x0 = Math.min(x0, V.x); x1 = Math.max(x1, V.x); y0 = Math.min(y0, -V.y); y1 = Math.max(y1, -V.y); }
    const c = n.canvas; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let edge = false;
    for (let x = 0; x < c.width; x++) if (d[x * 4 + 3] > 40 || d[((c.height - 1) * c.width + x) * 4 + 3] > 40) edge = true;
    out.push({ x0, x1, y0, y1, edge, h: c.height });
  });
  return { list: out, H: ui.H };
};

const srv = await serve();
const br = await launch();
const strips = [];
const fightH = {};
try {
  for (const phone of PHONES) {
    for (const kind of KINDS) {
      const n = STAGE[kind]; const tag = `${phone} ${kind}`;
      const { ctx, page, problems } = await open(br, srv.base, phone, `autostart=1&stage=${n}&wave=5&noaudio=1&seed=${n}`, { freeze: true });
      await page.evaluate(INSTALL);
      FOV_OVER = await page.evaluate(() => window.__G.cam.fovOver);
      // up to the spawn frame
      const pre = await page.evaluate(RUN, [1500, 'window.__bi.spawn', true]);
      const last = pre[pre.length - 1];
      check(!!last && last.spawned && last.active && last.cine, `${tag}: entrance starts on the spawn frame (frame ${pre.length}, active ${last && last.active})`);
      const sp = await page.evaluate(() => window.__bi.spawn);
      check(sp && sp.kind === kind, `${tag}: stage ${n} boss is ${sp && sp.kind}`);
      // the scene, with 8 pictures on the way
      const frames = []; const pics = [];
      const def = await page.evaluate(() => { const s = window.__G.intro.scene; return s ? { L: s.def.L, T: s.def.T } : null; });
      if (!def) { await ctx.close(); continue; }
      const marks = [0.25, 0.7, def.L - 0.25, def.L + 0.02, def.L + 0.2, def.L + 0.6, def.T - 0.75, def.T - 0.25];
      let mi = 0;
      for (let g = 0; g < 400; g++) {
        const s = await page.evaluate(RUN, [1, 'false', true]); frames.push(s[0]);
        if (!s[0].active) break;
        if (mi < marks.length && s[0].t >= marks[mi]) { pics.push(await shot(page, `f-${phone}-${kind}-${mi}.png`)); mi++; }
      }
      const after = await page.evaluate(RUN, [30, 'false', true]);
      pics.push(await shot(page, `f-${phone}-${kind}-after.png`));
      const strip = path.join(OUT, `${phone}-${kind}.png`); sheet(pics, strip, 3, phone === 'xiaomi' ? 420 : 360); strips.push(strip);

      const act = frames.filter((f) => f.wasActive);
      check(act.every((f) => f.simT === f.simT0 && f.simT === sp.simT), `${tag}: sim clock held at ${sp.simT.toFixed(2)} s over ${act.length} frames`);
      const hold = act.filter((f) => f.active && f.t >= f.L + 0.25 && f.t <= f.T - 0.55 && f.box);
      const span = (b) => Math.max((b.y1 - b.y0) / 2, (b.x1 - b.x0) / 2); // the larger of its height and width shares
      const hMax = Math.max(0, ...hold.map((f) => span(f.box)));
      const fh = after.filter((f) => f.box).map((f) => span(f.box)); const fightMax = Math.max(0, ...fh);
      fightH[tag] = fightMax;
      check(hold.length > 10 && hMax >= CLOSE_H, `${tag}: close-up, boss spans ${(hMax * 100).toFixed(0)}% of the frame (>= ${CLOSE_H * 100}%; fight ${(fightMax * 100).toFixed(0)}%)`);
      // Addendum 9: in the close-up the boss stays between the bars and inside the frame
      let worst = { top: 1e9, bot: 1e9, side: 1e9 };
      for (const f of hold) {
        const Hd = f.H; const top = (1 - f.box.raw[3]) / 2 * Hd; const bot = (1 - f.box.raw[2]) / 2 * Hd;
        worst.top = Math.min(worst.top, top - CLEAR_TOP); worst.bot = Math.min(worst.bot, Hd - BAR.bot - bot);
        worst.side = Math.min(worst.side, (1 - Math.max(Math.abs(f.box.raw[0]), Math.abs(f.box.raw[1]))) / 2 * 780);
      }
      check(hold.length > 0 && worst.top >= -EDGE && worst.bot >= -EDGE && worst.side >= -EDGE, `${tag}: boss clear of the bars, the boss bar and the frame edge in the close-up (top ${worst.top.toFixed(1)}, bottom ${worst.bot.toFixed(1)}, side ${worst.side.toFixed(1)} px; >= -${EDGE})`);
      // the name: sampled at its full moment
      const named = act.find((f) => f.active && f.t >= f.L + 0.6);
      check(!!named && named.ui && named.ui.shown && named.ui.name && named.ui.name.vis, `${tag}: name banner shown after the landing`);
      const lastAct = frames.filter((f) => f.active).pop();
      const endReal = lastAct ? lastAct.real + DT : 0;
      check(!frames[frames.length - 1].active && endReal <= END_MAX, `${tag}: ends after ${endReal.toFixed(2)} s real (<= ${END_MAX})`);
      check(after.length && !after[after.length - 1].cine && Math.abs(after[after.length - 1].fov - FOV_OVER) < 0.05 && after[after.length - 1].simT > sp.simT, `${tag}: fight resumes (cine ${after[after.length - 1].cine}, fov ${after[after.length - 1].fov.toFixed(2)}, sim ${sp.simT.toFixed(2)} -> ${after[after.length - 1].simT.toFixed(2)})`);
      check(bad(problems).length === 0, `${tag}: no console errors ${problems.slice(0, 2).join(' | ')}`);
      await ctx.close();

      // the name banner against the frame: its own page, frozen at the banner's full moment
      {
        const w = await open(br, srv.base, phone, `autostart=1&stage=${n}&wave=5&noaudio=1&seed=${n}`, { freeze: true });
        await w.page.evaluate(INSTALL); await w.page.evaluate(RUN, [1500, 'window.__bi.spawn', false]);
        await w.page.evaluate(RUN, [400, 'I.scene && I.scene.t >= I.scene.def.L + 0.7', false]);
        const nm = await w.page.evaluate(NAME);
        const ok = nm && nm.list.length >= 3 && nm.list.every((b) => b.x0 >= 0 && b.x1 <= 780 && b.y0 >= 0 && b.y1 <= nm.H && !b.edge);
        const name = nm && nm.list.reduce((a, b) => (!a || b.h > a.h ? b : a), null);
        check(ok && name.y0 >= nm.H - BAR.bot - 1, `${tag}: banner texts inside the frame, no ink cut, name inside the lower bar (${nm ? nm.list.map((b) => `${b.x0.toFixed(0)}-${b.x1.toFixed(0)}x${b.y0.toFixed(0)}-${b.y1.toFixed(0)}`).join(' ') : 'none'})`);
        await w.ctx.close();
      }
    }
    // tap to skip, with screen shake switched off, on two kinds
    for (const kind of KINDS.slice(0, 2)) {
      const n = STAGE[kind]; const tag = `${phone} ${kind} skip`;
      const { ctx, page, problems } = await open(br, srv.base, phone, `autostart=1&stage=${n}&wave=5&noaudio=1&seed=${n}`, { freeze: true });
      await page.evaluate(() => { window.__G.settings.shake = false; });
      await page.evaluate(INSTALL); FOV_OVER = await page.evaluate(() => window.__G.cam.fovOver); await page.evaluate(RUN, [1500, 'window.__bi.spawn', false]);
      const mid = await page.evaluate(RUN, [400, 'I.scene && I.scene.t >= I.scene.def.L + 0.3', true]);
      check(mid.every((f) => f.shake === 0), `${tag}: no shake with the setting off (max ${Math.max(...mid.map((f) => f.shake)).toFixed(2)} px over ${mid.length} frames)`);
      const box = await page.locator('#frame').boundingBox();
      const st = await page.evaluate(() => ({ paused: window.__G.paused, watching: window.__G.watching || 0 }));
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
      const one = await page.evaluate(RUN, [1, 'false', true]);
      check(!one[0].active && !one[0].cine && Math.abs(one[0].fov - FOV_OVER) < 0.05, `${tag}: one frame after the tap the scene is over (active ${one[0].active}, fov ${one[0].fov.toFixed(2)})`);
      const more = await page.evaluate(RUN, [20, 'false', true]);
      const st2 = await page.evaluate(() => ({ paused: window.__G.paused, watching: window.__G.watching || 0, why: window.__G.intro.lastEnd && window.__G.intro.lastEnd.why }));
      check(st2.why === 'skip' && !st2.paused && st2.watching === st.watching && more[more.length - 1].simT > one[0].simT, `${tag}: ended by the tap, no pause or spectate, sim runs (${one[0].simT.toFixed(2)} -> ${more[more.length - 1].simT.toFixed(2)})`);
      check(bad(problems).length === 0, `${tag}: no console errors ${problems.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }
  }
  // the same seed, the same end, with and without the entrance
  for (const kind of KINDS.filter((k) => ['giant', 'dragon'].includes(k))) {
    const n = STAGE[kind]; const res = [];
    for (const on of [true, false]) {
      const { ctx, page } = await open(br, srv.base, 's22', `autostart=1&stage=${n}&wave=5&noaudio=1&seed=${n}`, { freeze: true });
      await page.evaluate((v) => { window.__G.intro.enabled = v; }, on);
      await page.evaluate(INSTALL); await page.evaluate(RUN, [1500, 'window.__bi.spawn', false]);
      await page.evaluate(RUN, [600, '!I.active', false]);
      res.push(await page.evaluate(() => { const G = window.__G; const B = G.B; for (let i = 0; i < 400 && B.phase === 'fight'; i++) window.__sim(0.5); return { phase: B.phase, t: +B.t.toFixed(3), kills: B.kills, hp: B.heroes.map((u) => Math.round(u.hp)).join(',') }; }));
      await ctx.close();
    }
    check(JSON.stringify(res[0]) === JSON.stringify(res[1]), `s22 ${kind}: same seed, same end with and without the entrance (${JSON.stringify(res[0])} / ${JSON.stringify(res[1])})`);
  }
} finally {
  await br.close(); srv.close();
}
console.log('strips:\n' + strips.join('\n'));
done();
