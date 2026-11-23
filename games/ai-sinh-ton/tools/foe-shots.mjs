// Pictures of every zombie kind and boss, for a before/after sheet: each at the battle camera (a crop around it, the size a
// player sees on the phone) and in a close three-quarter view (the fight camera overridden after it runs each frame).
// Zombies: a pack of 6 through horde.showcase. Bosses: a custom one-group stage with the boss unkillable and harmless.
// Writes .chk/a10/foe/<tag>/<phone>-<kind>-{battle,close}.png and sheets <tag>-<phone>-{zombies,bosses}.png.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/foe-shots.mjs [--tag=after] [--phones=s22,xiaomi]
//        [--only=walker,giant] [--zombies=0] [--bosses=0] [--hurt] (bosses: also a shot at 40% hp, the second phase)
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TAG = arg('tag', 'after');
const PHONES = arg('phones', 's22,xiaomi').split(',');
const ONLY = arg('only', '').split(',').filter(Boolean);
const HURT = argv.includes('--hurt');
const OUT = path.join(ROOT, '.chk', 'a10', 'foe', TAG);
fs.mkdirSync(OUT, { recursive: true });
const ZOMBIES = ['walker', 'runner', 'spider', 'flyer', 'hound', 'spitter', 'bloater', 'shielder', 'brute', 'shrieker', 'armored', 'burner', 'frost'].filter((k) => !ONLY.length || ONLY.includes(k));
const BOSSES = ['giant', 'thrower', 'phantom', 'queen', 'brood', 'vampire', 'alien', 'pharaoh', 'ufo', 'guardian', 'dragon'].filter((k) => !ONLY.length || ONLY.includes(k));
const { check, done } = checker();

// the fight camera runs, then this puts the camera where window.__foeCam says (the boss intro's slot in the frame)
const HOOK = () => {
  const G = window.__G; if (G.__foeHook) return; G.__foeHook = true;
  const I = G.intro; const orig = I.update.bind(I); const H = G.host;
  I.update = (dt) => { orig(dt); const c = window.__foeCam; if (c) { H.camera.position.set(c[0], c[1], c[2]); H.camera.lookAt(c[3], c[4], c[5]); H.camera.updateMatrixWorld(); } };
};
// screen box around world point (x, y0..y1, z) through the current camera, padded and clamped to the frame
const CLIP = ([x, y0, y1, z, pad]) => {
  const H = window.__G.host; const fr = document.getElementById('frame').getBoundingClientRect(); const v = new H.THREE.Vector3();
  const px = (y) => { v.set(x, y, z).project(H.camera); return [fr.left + (v.x + 1) / 2 * fr.width, fr.top + (1 - v.y) / 2 * fr.height]; };
  const a = px(y0); const b = px(y1); const h = Math.min(fr.height, Math.max(110, Math.abs(a[1] - b[1]) * pad)); const w = Math.min(fr.width, h * 1.3);
  const cx = (a[0] + b[0]) / 2; const cy = (a[1] + b[1]) / 2;
  return { x: Math.max(fr.left, Math.min(fr.right - w, cx - w / 2)), y: Math.max(fr.top, Math.min(fr.bottom - h, cy - h / 2)), width: w, height: h };
};

async function zombies(br, base, phone) {
  const r = await open(br, base, phone, 'autostart=1&stage=3&noaudio=1&seed=3&q=low');
  await r.page.evaluate(HOOK);
  await r.page.evaluate(() => { const G = window.__G; G.start(3, { seed: 3 }); G.paused = true; window.__step(4); });
  const files = [];
  for (const k of ZOMBIES) {
    const at = await r.page.evaluate((kk) => {
      const G = window.__G; window.__foeCam = null; const h = G.actors.horde; h.showcase(kk, 6, 0, -1.5, 3); window.__step(20);
      const F = h.meshes[0].position; const y = kk === 'flyer' ? 3 : 0; return [F.x, F.y + y, F.z - 1.5, y];
    }, k);
    const clip = await r.page.evaluate(CLIP, [at[0], at[1], at[1] + 2.2, at[2], 2.2]);
    const fb = path.join(OUT, `${phone}-${k}-battle.png`); await r.page.screenshot({ path: fb, clip }); files.push(fb);
    await r.page.evaluate((a) => { window.__foeCam = [a[0] + 2.4, a[1] + 3.4, a[2] + 4.6, a[0], a[1] + 0.8, a[2] - 0.3]; window.__step(12); }, at);
    const fc = path.join(OUT, `${phone}-${k}-close.png`); await r.page.locator('#frame').screenshot({ path: fc }); files.push(fc);
  }
  await r.page.evaluate(() => { window.__foeCam = null; window.__G.actors.horde.showcase(null); });
  const errs = r.problems;
  await r.ctx.close();
  if (files.length) sheet(files, path.join(OUT, `${TAG}-${phone}-zombies.png`), 6, 300);
  check(!errs.length, `${phone} zombies: no console problems ${errs.slice(0, 3).join(' | ')}`);
}

// one boss alone on a custom stage, unkillable and harmless, after its entrance
const BOSS = async ([kind, hurt]) => {
  const G = window.__G; const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  window.__SIM = window.__SIM || await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sc = G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide();
  if (G.juice) G.juice.enabled = false;
  window.__foeCam = null;
  const base = G.stageDef(5);
  const def = { ...base, hpMul: 1e6, atkMul: 1e-4, bossTier: 3, waves: [{ groups: [{ kind, n: 1, at: 0, ang: 1.6, spread: 0.1 }], boss: null }] };
  const B = G.start({ custom: def }, { seed: 7, wave: 1 }); G.paused = true;
  const SIM = window.__SIM; let k = 0; const boss = () => B.enemies.find((e) => e.boss && e.alive);
  while (k++ < 30 * 30 && !(boss() && boss().spawnT <= 0)) SIM.step(B);
  const u = boss(); if (!u) return { err: 'no boss ' + kind };
  for (const s of u.skills) s.cd = 999;
  if (G.intro && G.intro.skip) G.intro.skip();
  for (let i = 0; i < 20; i++) { SIM.step(B); window.__step(2); }
  if (hurt) { u.hp = u.maxHp * 0.4; for (let i = 0; i < 30; i++) { SIM.step(B); window.__step(2); } }
  G.cam.spectate(u.fly ? u.uid : 0); window.__step(60);
  const n = G.actors.nodeOf(u.uid); n.updateMatrixWorld(true); const p = new G.host.THREE.Vector3(); n.getWorldPosition(p);
  return { x: p.x, y: p.y, z: p.z, h: G.actors.heightOf(u.uid), yaw: n.rotation.y };
};

async function bosses(br, base, phone) {
  const r = await open(br, base, phone, 'noaudio=1&q=low');
  await r.page.evaluate(HOOK);
  const files = [];
  for (const k of BOSSES) {
    for (const hurt of HURT ? [false, true] : [false]) {
      const b = await r.page.evaluate(BOSS, [k, hurt]);
      if (b.err) { check(false, `${phone} ${k}: boss on screen: ${b.err}`); continue; }
      const sfx = hurt ? '-p2' : '';
      const clip = await r.page.evaluate(CLIP, [b.x, b.y, b.y + b.h, b.z, 2.0]);
      const fb = path.join(OUT, `${phone}-${k}${sfx}-battle.png`); await r.page.screenshot({ path: fb, clip }); files.push(fb);
      await r.page.evaluate((a) => { const d = Math.max(5, a.h * 2.2); const fx = Math.sin(a.yaw); const fz = Math.cos(a.yaw); window.__foeCam = [a.x + (fx * 0.85 + fz * 0.5) * d, a.y + a.h * 0.9, a.z + (fz * 0.85 - fx * 0.5) * d, a.x, a.y + a.h * 0.5, a.z]; window.__step(12); }, b);
      const fc = path.join(OUT, `${phone}-${k}${sfx}-close.png`); await r.page.locator('#frame').screenshot({ path: fc }); files.push(fc);
    }
  }
  const errs = r.problems;
  await r.ctx.close();
  if (files.length) sheet(files, path.join(OUT, `${TAG}-${phone}-bosses.png`), HURT ? 4 : 6, 300);
  check(!errs.length, `${phone} bosses: no console problems ${errs.slice(0, 3).join(' | ')}`);
}

// a live fight (stage 3, the real loop path): eight frames 0.1 s apart from the first deaths on, hits, throws, falls and dissolves as they happen
async function fight(br, base, phone) {
  const r = await open(br, base, phone, 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&seed=3&q=medium');
  // play on until bodies are falling in view: corpses dissolving, shards in the air
  const ok = await r.page.evaluate(() => { window.__sim(8); const h = window.__G.actors.horde; for (let i = 0; i < 1200; i++) { window.__frame(1 / 30); if (h.stats.corpses >= 2 && h.stats.units >= 3) return true; } return false; });
  check(ok, `${phone} fight: bodies dying in view`);
  const files = [];
  for (let i = 0; i < 8; i++) {
    await r.page.evaluate(() => { for (let k = 0; k < 3; k++) window.__frame(1 / 30); });
    const f = path.join(OUT, `${phone}-fight-${i}.png`); await r.page.locator('#frame').screenshot({ path: f }); files.push(f);
  }
  const errs = r.problems; await r.ctx.close();
  sheet(files, path.join(OUT, `${TAG}-${phone}-fight.png`), 2, 900);
  check(!errs.length, `${phone} fight: no console problems ${errs.slice(0, 3).join(' | ')}`);
}

const srv = await serve(); const br = await launch();
try {
  for (const ph of PHONES) {
    if (arg('zombies', '1') !== '0' && ZOMBIES.length) await zombies(br, srv.base, ph);
    if (arg('bosses', '1') !== '0' && BOSSES.length) await bosses(br, srv.base, ph);
    if (argv.includes('--fight')) await fight(br, srv.base, ph);
  }
} finally { await br.close(); srv.close(); }
done();
