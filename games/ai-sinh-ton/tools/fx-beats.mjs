// The three beats of every skill, on the real game loop (juice, the ultimate close-up and the hit-stops all live) driven by
// a virtual clock: for each beast and form, skill 1, skill 2 and the ultimate are cast into a crowd and three frames are
// kept, the wind-up (gồng), the impact (bung) and the after-image (dư âm). One sheet per beast and form,
// .chk/a10/fx/<id>.<form>.png: rows skill 1, skill 2, ultimate; columns wind-up, impact, after-image.
// Checks per cast: each beat drew something of its own (the beats' particle and decal counters grow at the wind-up, peak
// at the impact, the after-image still holds marks), clipped white under 1% at every kept frame, no console problems.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/fx-beats.mjs [--only=tegiap,nhim] [--forms=1,2,3a,3b] [--phone=s22]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';
import { HEROES } from '../js/data/heroes.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const only = arg('only') ? arg('only').split(',') : null;
const PHONE = arg('phone', 's22');
const OUT = path.join(ROOT, '.chk', 'a10', 'fx'); const TMP = path.join(OUT, 'tmp'); fs.mkdirSync(TMP, { recursive: true });
const { check, done } = checker();
const T0 = Date.now();
const bad = (list) => list.filter((x) => !/Failed to load resource|favicon/.test(x));
const DT = 1 / 60;

// forms a beast has: '1', '2', '3' or '3a' / '3b' when form 3 branches (read from the data when it has forms)
function formsOf(h) {
  const want = arg('forms') ? arg('forms').split(',') : null;
  const out = ['1'];
  if (h.forms && h.forms[1]) out.push('2');
  if (h.forms && h.forms[2]) { if (h.forms[2].branches) out.push('3a', '3b'); else out.push('3'); }
  return want ? out.filter((f) => want.includes(f)) : out;
}

// ---------- page side ----------
const INSTALL = () => {
  let vt = performance.now(); performance.now = () => vt;
  window.__fr = (dt) => { vt += dt * 1000; window.__frame(dt); };
};
// a fresh fight with the beast alone (huge health, no attack bonus) standing in a crowd of stage 3 wave 3
const PREP = async ([id, form, branch]) => {
  const G = window.__G;
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = window.__SIM || await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  G.paused = true; G.speed = 1;
  const spec = { id, mul: 0.5, hpFlat: 90000, atkFlat: 0 }; if (form > 1) { spec.form = form; spec.branch = branch || null; }
  const B = G.start(3, { seed: 9, wave: 3, teamSpec: [spec], auto: { ult: false, pick: 'best' } });
  G.juice.reset();
  const hero = B.heroes[0]; const SIM = window.__SIM;
  for (let i = 0; i < 1500 && B.phase === 'fight'; i++) {
    SIM.step(B); if (i < 120) continue;
    if (B.enemies.filter((e) => e.alive && Math.hypot(e.x - hero.x, e.z - hero.z) < 5).length >= 3) break;
  }
  G.fx.clear(); G.actors.fx.clear(); for (const s of hero.skills) s.cd = 999;
  for (let i = 0; i < 30; i++) window.__fr(1 / 60);
  return { phase: B.phase, form: hero.def.form || 1, branch: hero.def.branch || null };
};
// cast one slot and run the frames; returns the per-frame beat counters and the frames to keep
const CAST = ([slot, frames]) => {
  const G = window.__G; const B = G.B; const SIM = window.__SIM; const u = B.heroes[0]; const fx = G.actors.fx; const bt = fx.beats;
  let castF = -1; let f = 0; const rows = [];
  G.paused = false;
  if (slot === 'ult') { u.ult = 1; u.ultReady = true; SIM.castUlt(B, 0); castF = 0; }
  else {
    const sk = u.skills.find((s) => s.slot === slot); if (!sk) return { ok: false, why: 'no skill ' + slot };
    sk.def = { ...sk.def, when: null }; sk.cd = 0; u.lockT = 0;
  }
  for (f = 0; f < frames; f++) {
    window.__fr(1 / 60);
    if (castF < 0 && u.casts > 0) castF = f;
    const s = bt.sparks.stats(); const d = bt.decals.stats(); const m = G.actors.marks.stats();
    rows.push({ f, sparks: s.live, decals: d.live, vert: m.pillars + m.walls + m.flashes, scale: G.juice.scale, ult: !!(G.juice.ult && G.juice.ult.active), phase: G.juice.ult && G.juice.ult.scene ? G.juice.ult.scene.phase : '' });
  }
  G.paused = true;
  return { ok: castF >= 0, castF, rows };
};

// ---------- node side ----------
function white(file) {
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size; px = im.load(); n = 0; wh = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        n += 1
        if min(px[x, y]) >= 250: wh += 1
print(wh / max(1, n))`;
  return +execFileSync('python3', ['-c', py, file]).toString();
}

// replay the cast frame by frame to a chosen frame and screenshot it (a fresh PREP each beat keeps the three frames of one run identical to the measured one)
// the hero's spot on screen (0..1), or null in the close-up (it already fills the frame)
const SPOT = () => { const G = window.__G; const u = G.B.heroes[0]; if (G.juice.ult && G.juice.ult.active) return null; const v = new G.host.THREE.Vector3(u.x, 1, u.z).project(G.host.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; };
function crop(file, spot) {
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]); W, H = im.size; cx = float(sys.argv[2]) * W; cy = float(sys.argv[3]) * H
w = int(W * 0.46); h = int(w * H / W); x0 = int(min(max(0, cx - w / 2), W - w)); y0 = int(min(max(0, cy - h * 0.55), H - h))
im.crop((x0, y0, x0 + w, y0 + h)).save(sys.argv[1])`;
  execFileSync('python3', ['-c', py, file, String(spot[0]), String(spot[1])]);
}
async function shoot(page, id, form, branch, slot, upto, file) {
  await page.evaluate(PREP, [id, form, branch]);
  await page.evaluate(CAST, [slot, upto]);
  await page.locator('#frame').screenshot({ path: file });
  const w = white(file);
  const spot = await page.evaluate(SPOT); if (spot) crop(file, spot);
  return w;
}

const srv = await serve();
const br = await launch();
const sheets = [];
try {
  for (const h of HEROES.filter((x) => !only || only.includes(x.id))) {
    for (const fk of formsOf(h)) {
      const form = +fk[0]; const branch = fk[1] || null;
      const r = await openPage(br, srv.base, PHONE, 'noaudio=1&seed=9', { freeze: true });
      const { page } = r; await page.evaluate(INSTALL);
      const tiles = [];
      try {
        for (const slot of ['s1', 's2', 'ult']) {
          const p = await page.evaluate(PREP, [h.id, form, branch]);
          if (form > 1 && p.form !== form) { check(false, `${h.id}.${fk}: the sim made form ${p.form}, not ${form} (forms not merged yet?)`); break; }
          const N = slot === 'ult' ? 150 : 90;
          const c = await page.evaluate(CAST, [slot, N]);
          if (!c.ok) { check(false, `${h.id}.${fk} ${slot}: no cast (${c.why || 'cast never seen'})`); continue; }
          const rows = c.rows.slice(c.castF);
          // the wind-up: the first frames after the cast; the impact: the frame where the beats peak; the after-image: 0.9 s after it
          const gongF = slot === 'ult' ? Math.max(1, rows.findIndex((x) => x.phase === 'gong' && x.f - c.castF >= 14)) : 2;
          let peak = gongF + 1; for (let i = gongF + 1; i < Math.min(rows.length, gongF + 60); i++) if (rows[i].sparks + rows[i].vert * 8 > rows[peak].sparks + rows[peak].vert * 8) peak = i;
          const after = Math.min(rows.length - 1, peak + 54);
          const g = rows[gongF] || rows[0]; const b = rows[peak]; const a = rows[after];
          check(g.sparks > 0 || g.decals > 0, `${h.id}.${fk} ${slot}: wind-up draws (${g.sparks} particles, ${g.decals} floor marks at frame ${gongF})`);
          check(b.sparks >= g.sparks && b.sparks + b.vert > 10, `${h.id}.${fk} ${slot}: impact peaks (${b.sparks} particles, ${b.vert} vertical, frame ${peak})`);
          check(a.decals > 0, `${h.id}.${fk} ${slot}: after-image holds ${a.decals} floor marks 0.9 s on (frame ${after})`);
          if (slot === 'ult') {
            const held = rows.filter((x) => x.phase === 'gong');
            check(held.length >= 20 && held.every((x) => x.scale === 0), `${h.id}.${fk} ult: the world holds through the wind-up (${held.length} frames at scale 0)`);
            const span = rows.filter((x) => x.ult).length * DT;
            check(span >= 0.8 && span <= 1.5, `${h.id}.${fk} ult: close-up lasts ${span.toFixed(2)} s (0.8 to 1.5)`);
          }
          const files = [];
          for (const [tag, fr] of [['gong', gongF], ['bung', peak], ['du', after]]) {
            const file = path.join(TMP, `${h.id}.${fk}-${slot}-${tag}.png`);
            const w = await shoot(page, h.id, form, branch, slot, c.castF + fr + 1, file);
            check(w < 0.01, `${h.id}.${fk} ${slot} ${tag}: clipped white ${(w * 100).toFixed(2)}% (< 1%)`);
            files.push(file);
          }
          tiles.push(...files);
        }
      } catch (e) { check(false, `${h.id}.${fk}: ${String(e && e.message).slice(0, 200)}`); }
      const probs = bad(r.problems); check(!probs.length, `${h.id}.${fk}: no console problems ${probs.slice(0, 2).join(' | ')}`);
      await r.ctx.close();
      if (tiles.length) { const out = path.join(OUT, `${h.id}.${fk}.png`); sheet(tiles, out, 3, 420); sheets.push(out); console.log('sheet: ' + out); }
    }
  }
} finally { await br.close(); srv.close(); }
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
