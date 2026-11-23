// Regression checks for the UI bugs found in the Addendum 10 inventory (~/handoff/ast-ui-bugs.md), one named check each:
//   G1 guide-home-wait   a guide step offered at home never shows over a fight, and is not marked done there unseen
//   P1 pointer-clear     the FTUE pointer never lies on a text it does not point at, at every guided step
//   B1 bar-truth         every stats bar shows exactly its value, with no leftover ghost (a 0-damage row shows an empty bar)
//   C1 counter-short     a counter of 1.234.567 reads "1,23 Tr" and its text stays clear of the coin icon
//   T1 toast-clear       a toast raised on the chapter view (locked boss pip) and on the world map (locked region)
//                        covers no text and no live button in any frame of its life
//   W1 no-tuong          no text on the menu screens, the beast page or the evolution screen says "tướng"
//   S1 ultcam-switch     the settings offer "Cận cảnh tối thượng", on by default; a tap stores settings.ultCam = false,
//                        and the fight's ultimate then takes the short hold instead of the close-up
// Usage: timeout 900 node games/ai-sinh-ton/tools/ui-bugs-test.mjs   Env: PHONES=s22,xiaomi,desktop
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', 'uibug', process['env'].SHOTS || 'bugs'); fs.mkdirSync(OUT, { recursive: true });

const PHONES = (process['env'].PHONES || 's22,xiaomi,desktop').split(',');
const open = async (br, base, phone, q, o = {}) => { const g = await openPage(br, base, phone, q, { ...o, freeze: true }); await g.page.evaluate(`window.__TB = ${TEXT_BOXES.toString()}`); return g; };
const step = (page, n) => page.evaluate((k) => __step(k), n);
const tap = async (page, id, n = 20) => { const ok = await page.evaluate((i) => __ui.tapId(i), id); await step(page, n); return ok; };
const { check, done } = checker();
const Q = 'noaudio=1&q=low';

// design-unit boxes of every visible text mesh on screen, with the target id it belongs to (if any) and its screen
function TEXT_BOXES() {
  const ui = __ui, THREE = ui.THREE, scene = ui.scene, out = [], B = new THREE.Box3();
  scene.updateMatrixWorld(true);
  const ids = new Map(); for (const t of ui.targets()) { const n = ui.node(t.id); if (n) ids.set(n, t.id); }
  scene.traverse((o) => {
    const n = o.parent; if (!(o.isMesh && n && n.mesh === o && n.canvas) || !n.str) return;
    let vis = true, scr = null, own = null;
    for (let a = o; a && a !== scene; a = a.parent) { if (!a.visible) { vis = false; break; } if (!own && ids.has(a)) own = ids.get(a); if (a.isScreen && !scr) scr = a; }
    if (!vis || (scr && scr.hiding) || o.material.opacity <= 0.05) return;
    B.setFromObject(o); out.push({ str: n.str, own, screen: scr ? scr.screenName : '', x: B.min.x, y: -B.max.y, w: B.max.x - B.min.x, h: B.max.y - B.min.y });
  });
  return out;
}

async function pointerAndGuide(br, srv, phone) {
  const g = await open(br, srv.base, phone, Q, { fresh: true }); const { page, problems } = g;
  await step(page, 30);
  const toD = (r, fr) => ({ x: (r.x - fr.x) / fr.k, y: (r.y - fr.y) / fr.k, w: r.w / fr.k, h: r.h / fr.k });
  const safe = () => page.evaluate(() => { const r = document.getElementById('frame').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.07]; });
  let last = '', steps = 0; const bad = [];
  for (let it = 0; it < 1500; it++) {
    const st = await page.evaluate(() => ({ d: __G.guide.dbg(), screen: __G.screen, phase: __G.B && __G.B.phase, inB: !!__G.B, cleared: __G.meta.acc.cleared }));
    const d = st.d;
    if (st.cleared >= 1 && !st.inB && d.active && d.id === 'levelup') break;
    if (d.story && d.story.on) { await tap(page, 'story-skip', 10); continue; }
    if (d.reveal) { await tap(page, 'reveal-tap', 6); continue; }
    if (d.active) {
      const key = d.id + ':' + (d.target || 'free');
      if (key !== last && d.rect) {
        last = key; await step(page, 30);
        const r = await page.evaluate(() => { const d = __G.guide.dbg(), f = document.getElementById('frame').getBoundingClientRect(); return { d, fr: { x: f.left, y: f.top, k: f.width / 780 }, texts: __TB() }; });
        if (r.d.hand) {
          await page.screenshot({ path: path.join(OUT, `${phone}-pointer-${d.id}.png`) });
          steps++; const hb = toD(r.d.hand, r.fr);
          for (const t of r.texts) {
            if (t.screen === 'guide' || t.own === r.d.target) continue;
            const x = Math.min(hb.x + hb.w, t.x + t.w) - Math.max(hb.x, t.x), y = Math.min(hb.y + hb.h, t.y + t.h) - Math.max(hb.y, t.y);
            if (x > 1.5 && y > 1.5) bad.push(`${key} on "${t.str}" by ${x.toFixed(0)}x${y.toFixed(0)}`);
          }
        }
      }
      if (d.noTarget) { const [x, y] = await safe(); if (phone === 'desktop') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y); await step(page, 10); if (d.id === 'join') { await step(page, 200); await page.evaluate(() => __sim(0.1)); } continue; }
      if (!d.rect) { if (st.phase === 'fight' && !d.frozen) await page.evaluate(() => __sim(0.2)); await step(page, 8); continue; }
      await tap(page, d.target, 12); continue;
    }
    if (st.screen === 'home' && !st.inB && st.cleared === 0) { await tap(page, 'start', 12); continue; }
    if (st.inB && st.phase === 'fight') { await page.evaluate(() => __sim(0.4)); await step(page, 2); continue; }
    if (st.inB && st.phase === 'pick') { await page.evaluate(() => __G.autoPick()); await step(page, 10); continue; }
    await step(page, 20);
  }
  check(steps >= 3 && bad.length === 0, `${phone} P1 pointer-clear: ${steps} guided steps with a pointer, ${bad.length} times it lies on a text it does not point at${bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''}`);

  // G1: the levelup step is up at home; a fight starts before it is done (as a quick tap on BẮT ĐẦU would)
  const g0 = await page.evaluate(() => __G.guide.dbg());
  await page.evaluate(() => __G.startBattle(1)); await step(page, 30);
  let shown = 0, samples = 0;
  for (let k = 0; k < 60; k++) { await page.evaluate(() => { const B = __G.B; if (B && B.phase === 'pick') __G.autoPick(); __sim(1); __step(6); }); samples++; if (await page.evaluate(() => __ui.isShown('guide') && !!__G.guide.dbg().id && ['levelup', 'gacha', 'team', 'start2'].includes(__G.guide.dbg().id))) shown++; }
  const doneIn = await page.evaluate(() => ({ ...__G.meta.acc.ftue.done }));
  await page.evaluate(() => __G.leaveBattle()); await step(page, 60);
  const back = await page.evaluate(() => __G.guide.dbg());
  check(g0.active && g0.id === 'levelup' && shown === 0 && !doneIn.levelup && back.active && back.id === 'levelup',
    `${phone} G1 guide-home-wait: home step "${g0.id}" up, then ${samples} s of fight: shown over it ${shown} times, marked done in the fight ${!!doneIn.levelup}, back home it is up again as "${back.id}" (${back.active})`);
  check(problems.length === 0, `${phone} guide run: no page problems ${problems.slice(0, 2).join(' | ')}`);
  await g.ctx.close();
}

async function barsAndCounters(br, srv, phone) {
  // B1: a lost fight in which nobody dealt damage, on the stats tab, and a won one
  for (const [label, q, kill] of [['lose', '&autostart=1&stage=3&seed=7', true], ['win', '&autostart=1&stage=1&seed=7&autoult=1&autopick=1', false]]) {
    const g = await open(br, srv.base, phone, Q + q); const { page } = g;
    await page.evaluate((k) => { const B = __G.B; if (k) { for (const u of B.heroes) { u.alive = false; u.hp = 0; } __sim(1); } else { let n = 0; while ((B.phase === 'fight' || B.phase === 'pick') && n++ < 400) { if (B.phase === 'pick') __G.autoPick(); __sim(5); } } for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(80); }, kill);
    if (label === 'win') await tap(page, 'tab-stats', 40);
    await step(page, 120);
    const bars = await page.evaluate(() => { const out = []; __ui.scene.traverse((o) => { if (!o.dbg || !o.set) return; let v = true; for (let a = o; a; a = a.parent) if (!a.visible) v = false; if (v) out.push(o.dbg()); }); return out; });
    const off = bars.filter((b) => Math.abs(b.shown - b.value) > 0.02 || b.ghost > 0);
    check(bars.length >= 4 && off.length === 0, `${phone} B1 bar-truth (${label}): ${bars.length} bars on screen, ${off.length} show something other than their value (${bars.slice(0, 4).map((b) => `${b.value.toFixed(2)}/${b.shown.toFixed(2)}/ghost ${b.ghost.toFixed(2)}`).join(', ')})`);
    await g.ctx.close();
  }
  // C1: big counters
  const g = await open(br, srv.base, phone, Q); const { page } = g;
  await page.evaluate(() => { __G.meta.acc.gold = 1234567; __G.meta.acc.gems = 98765432; __G.meta.save(); }); await step(page, 120);
  const r = await page.evaluate(() => {
    const bt = __G.metaUi.barText, tb = __TB().filter((t) => t.screen === 'chrome');
    const ink = (s) => tb.find((t) => t.str === s);
    return { bt, gold: ink(bt.gold), gems: ink(bt.gems) };
  });
  const fits = r.gold && r.gems && r.gold.x >= 466 + 26 && r.gems.x >= 572 + 26;
  check(r.bt.gold === '1,23 Tr' && r.bt.gems === '98,8 Tr' && fits, `${phone} C1 counter-short: gold reads "${r.bt.gold}", gems "${r.bt.gems}", text starts at ${r.gold && r.gold.x.toFixed(1)} / ${r.gems && r.gems.x.toFixed(1)} (coin icons end at 492 / 598)`);
  await g.ctx.close();
}

// T1 and W1
async function toastAndWords(br, srv, phone) {
  const g = await open(br, srv.base, phone, Q); const { page } = g;
  await page.evaluate(() => {
    const M = __G.meta, A = M.acc; M.ftueSkip(); for (const id of ['spectate', 'speed', 'daily', 'chapter', 'equip', 'merge']) M.ftueDone(id);
    A.cleared = 12; A.level = 13; M.save(); for (const id of M.pendingReveals()) M.markSeen(id); __G.goto('heroes'); __G.goto('home');
  });
  await step(page, 40);
  const cross = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 - x > 1 && y2 - y > 1; };
  const life = async (label) => {
    let n = 0; const bad = new Set();
    for (let f = 0; f < 135; f += 3) {
      await step(page, 3);
      const r = await page.evaluate(() => {
        const t = __ui.toastRect(); if (!t) return null; const fr = document.getElementById('frame').getBoundingClientRect(), k = fr.width / 780;
        return { t, texts: __TB().filter((q) => q.screen), btn: __ui.targets().filter((q) => q.enabled).map((q) => ({ id: q.id, x: (q.vx - fr.left) / k, y: (q.vy - fr.top) / k, w: q.vw / k, h: q.vh / k })) };
      });
      if (!r) continue; n++;
      for (const q of r.texts) if (cross(r.t, q)) bad.add(`text "${q.str}"`);
      for (const q of r.btn) if (cross(r.t, q)) bad.add(`button ${q.id}`);
    }
    check(n >= 20 && bad.size === 0, `${phone} T1 toast-clear (${label}): ${n} frames with the toast up, it covers ${bad.size ? [...bad].slice(0, 4).join(', ') : 'nothing'}`);
  };
  await page.evaluate(() => __world.focus(2, true)); await step(page, 4); await tap(page, 'region-2');
  await tap(page, 'stage-pip-4', 1); await life('chapter view, locked boss pip');
  await page.screenshot({ path: path.join(OUT, `${phone}-t1-chapter.png`) });
  await tap(page, 'view-world'); await page.evaluate(() => __world.focus(5, true)); await step(page, 4);
  await tap(page, 'region-5', 1); await life('world map, locked region');
  const said = [];
  const look = async (where) => { await step(page, 30); for (const q of await page.evaluate(() => __TB())) if (/tướng/i.test(q.str.normalize('NFC'))) said.push(`${where}: "${q.str}"`); };
  for (const tab of ['tab-gacha', 'tab-equip', 'tab-heroes', 'tab-rewards', 'tab-battle']) { if (await tap(page, tab)) await look(tab); }
  await page.evaluate(async () => { const m = await import('/games/ai-sinh-ton/js/ui/evolve.js?v=20261122a'); __G.goto('heroes'); m.openEvolve(); }); await look('evolve');
  // S1
  await page.evaluate(() => { __G.goto('home'); __G.openSettings(); }); await step(page, 30);
  const lab = () => page.evaluate(() => { const t = __TB().find((q) => q.own === 'set-ultcam'); const n = __TB().find((q) => q.str === 'Cận cảnh tối thượng'); return { btn: t && t.str, label: !!n, v: __G.settings.ultCam, saved: JSON.parse(localStorage.getItem('aisinhton.settings.v1') || '{}').ultCam }; });
  const u0 = await lab();
  await page.screenshot({ path: path.join(OUT, `${phone}-s1-settings.png`) });
  await tap(page, 'set-ultcam', 10); const u1 = await lab();
  const decide = () => page.evaluate(() => { const J = __G.juice, B = __G.B, n = J.ult.count; const hold = J.ult.begin({ uid: B.heroes[0].uid, key: 'test' }); return { hold, scene: J.ult.count - n }; });
  await page.evaluate(() => { __G.startBattle(3); }); await step(page, 30);
  const off = await decide();
  await page.evaluate(() => { __G.leaveBattle(); __G.setSetting('ultCam', true); __G.startBattle(3); }); await step(page, 30);
  const on = await decide();
  await page.evaluate(() => __G.leaveBattle()); await step(page, 20);
  check(u0.label && u0.btn === 'BẬT' && u0.v !== false && u1.btn === 'TẮT' && u1.v === false && u1.saved === false && off.scene === 0 && off.hold < 0.2 && on.scene === 1 && on.hold > off.hold,
    `${phone} S1 ultcam-switch: shown ${u0.label}, "${u0.btn}" by default; after a tap "${u1.btn}", settings.ultCam ${u1.v}, saved ${u1.saved}; ultimate with it off holds ${off.hold} s and opens ${off.scene} close-up, with it on ${on.hold} s and ${on.scene}`);
  check(said.length === 0, `${phone} W1 no-tuong: menu tabs, beast page and evolution screen show no "tướng" (${said.slice(0, 3).join(' | ') || 'none'})`);
  await g.ctx.close();
}

const srv = await serve(); const br = await launch();
try {
  for (const phone of PHONES) {
    await pointerAndGuide(br, srv, phone);
    await barsAndCounters(br, srv, phone);
    await toastAndWords(br, srv, phone);
  }
} finally { await br.close(); srv.close(); }
done();
