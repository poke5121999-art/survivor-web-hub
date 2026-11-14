// The interface: English on a first visit, the Settings popup and what each group of it really does, the language switch,
// and no Vietnamese left on an English screen. Screenshots of the popup's five tabs in both languages go to <outDir>.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/ui.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'playwright-core';
const OUT = process.argv[2] || '.chk-ui'; fs.mkdirSync(OUT, { recursive: true });
const fails = []; let passed = 0;
const check = (ok, name) => { if (ok) passed++; else fails.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
const VI = '/[ăâêôơưđĂÂÊÔƠƯĐàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/';

(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: process.env.BZ_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('hub.session.v1')) localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'ui@test' })); } catch (e) {} });
    const page = await ctx.newPage(); const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) problems.push(m.text().slice(0, 200)); });
    const base = (process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html';
    const load = async (q) => { await page.goto(base + '?' + q); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 }); };
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
    // what a screen shows that is still Vietnamese (the language's own name on the switch aside)
    const stray = () => page.evaluate(`(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest('script,style,[data-lang],#langbtn')) continue; const r = el.getClientRects(); if (!r.length) continue; const t = n.textContent.trim(); if (t && ${VI}.test(t)) out.push(t.slice(0, 40)); } return out; })()`);

    // ---- a first visit ----
    await load('nolock=1&noaudio=1&seed=5');
    const first = await page.evaluate(`({ lang: BZ.lang, html: document.documentElement.lang, play: document.querySelector('[data-act=play], #title .btn').textContent.trim(), def: JSON.stringify(BZ.SETTINGS_DEF) === JSON.stringify((({ hero, coopName, ...r }) => r)(__G.settings)) })`);
    check(first.lang === 'en' && first.html === 'en', `a first visit is in English (${first.lang}; the first button reads "${first.play}")`);
    check(first.def, 'a first visit starts from the default settings');
    const s0 = await stray(); check(s0.length === 0, `no Vietnamese on the English title screen${s0.length ? ': ' + s0.slice(0, 5).join(' | ') : ''}`);
    await shot('en-title');

    // ---- the popup ----
    await page.click('#title [data-act=settings]'); await page.waitForTimeout(250);
    const pop = await page.evaluate(`({ on: __G.cfg.isOpen(), tabs: [...document.querySelectorAll('#settings nav button')].map((b) => b.textContent), rows: document.querySelectorAll('#settings .set-row').length })`);
    check(pop.on && pop.tabs.length === 5 && pop.rows >= 4, `Settings opens from the title with five tabs (${pop.tabs.join(', ')})`);
    for (const t of ['general', 'graphics', 'audio', 'controls', 'interface']) { await page.click(`#settings [data-tab=${t}]`); await page.waitForTimeout(120); await shot('en-set-' + t); const sv = await stray(); check(sv.length === 0, `no Vietnamese on the English ${t} tab${sv.length ? ': ' + sv.slice(0, 4).join(' | ') : ''}`); }
    const range = (id, v) => page.evaluate(`(() => { const i = document.querySelector('#settings [data-set=${id}]'); i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); return +i.value; })()`);
    // graphics
    await page.click('#settings [data-tab=graphics]');
    const g0 = await page.evaluate('({ fov: __G.camera.fov, pr: __G.renderer.getPixelRatio(), shadow: __G.sun.castShadow, bloom: __G.post && __G.post.on, particles: __G.quality.particles })');
    await range('fov', 95); await range('resScale', 0.5); await range('fxDensity', 0.3); await range('shake', 0);
    await page.click('#settings [data-tog=shadows]'); await page.click('#settings [data-tog=bloom]'); await page.click('#settings [data-pick=fpsCap][data-val="30"]');
    const g1 = await page.evaluate('({ fov: __G.camera.fov, pr: __G.renderer.getPixelRatio(), shadow: __G.sun.castShadow, bloom: __G.post && __G.post.on, particles: __G.quality.particles, cap: __G.settings.fpsCap, shake: __G.settings.shake })');
    check(g1.fov === 95 && g0.fov === 78, `the field of view slider turns the camera's (${g0.fov} -> ${g1.fov})`);
    check(g1.pr < g0.pr * 0.6, `the resolution scale lowers the renderer's pixel ratio (${g0.pr} -> ${g1.pr})`);
    check(g1.shadow === false && (!g0.bloom || g1.bloom === false) && g1.particles < g0.particles * 0.5 && g1.cap === 30 && g1.shake === 0, `shadows, bloom, effects amount, frame cap and shake follow their controls (particles ${g0.particles} -> ${g1.particles}, cap ${g1.cap})`);
    // general: damage numbers
    await page.click('#settings [data-tab=general]'); await page.click('#settings [data-tog=showDmg]');
    // controls: jump moves to K; sprint on K too is flagged
    await page.click('#settings [data-tab=controls]'); await page.click('#settings [data-bind=jump]'); await page.keyboard.press('KeyK'); await page.waitForTimeout(80);
    await page.click('#settings [data-bind=sprint]'); await page.keyboard.press('KeyK'); await page.waitForTimeout(80);
    const k1 = await page.evaluate(`({ jump: __G.cfg.bound('jump'), clash: document.querySelectorAll('#settings .set-key.clash').length, label: document.querySelector('#settings [data-bind=jump]').textContent })`);
    check(k1.jump === 'KeyK' && k1.label === 'K', `a key is rebound by clicking the action and pressing the key (jump: ${k1.jump})`);
    check(k1.clash === 2, `two actions on one key are flagged (${k1.clash} rows marked)`);
    await page.click('#settings [data-bind=sprint]'); await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(80);
    // interface
    await page.click('#settings [data-tab=interface]'); await range('hudScale', 1.2); await page.click('#settings [data-pick=xhair][data-val=dot]'); await page.click('#settings [data-pick=xhairColor][data-val=green]'); await page.click('#settings [data-tog=colorBlind]');
    const i1 = await page.evaluate(`({ hud: getComputedStyle(document.documentElement).getPropertyValue('--hud-scale').trim(), dot: document.body.classList.contains('xh-dot'), col: getComputedStyle(document.documentElement).getPropertyValue('--xhair').trim(), cb: document.body.classList.contains('cb') })`);
    check(i1.hud === '1.2' && i1.dot && i1.col === '#5cff6a' && i1.cb, `HUD size, crosshair shape and colour and the colour-blind palette apply (${JSON.stringify(i1)})`);
    // audio
    await page.click('#settings [data-tab=audio]'); await range('volume', 0.3); await range('music', 0.2);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(await page.evaluate('!__G.cfg.isOpen()'), 'Esc closes the popup');

    // ---- it is kept across a reload, and it works in play ----
    await load('nolock=1&noaudio=1&seed=5&autostart=1&god=1');
    const kept = await page.evaluate('(({ fov, resScale, fpsCap, shadows, showDmg, volume, music, hudScale, xhair, colorBlind, keys }) => ({ fov, resScale, fpsCap, shadows, showDmg, volume, music, hudScale, xhair, colorBlind, keys }))(__G.settings)');
    check(kept.fov === 95 && kept.resScale === 0.5 && kept.fpsCap === 30 && kept.shadows === false && kept.showDmg === false && kept.volume === 0.3 && kept.music === 0.2 && kept.hudScale === 1.2 && kept.xhair === 'dot' && kept.colorBlind === true && kept.keys.jump === 'KeyK', `a reload keeps every change (${JSON.stringify(kept).slice(0, 150)})`);
    const play = await page.evaluate(`(() => { const G = __G; const P = G.player; G.wave.toSpawn = 0; G.zombies.clear(); P.pos.set(0, 0, 12); P.vel.set(0, 0, 0); __sim(0.4); const r = { fov: G.camera.fov };
      const key = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c, bubbles: true }));
      key('Space', 1); __sim(0.12); key('Space', 0); r.space = +P.vel.y.toFixed(1); __sim(1); key('KeyK', 1); __sim(0.12); key('KeyK', 0); r.k = +P.vel.y.toFixed(1); __sim(1);
      const n0 = document.querySelectorAll('.pop').length; G.ui.pop('77', 'dmg', new G.THREE.Vector3(0, 1, 9)); G.ui.pop('WAVE', 'word', new G.THREE.Vector3(0, 1, 9)); __sim(0.05); r.pops = document.querySelectorAll('.pop').length - n0; r.dmgShown = [...document.querySelectorAll('.pop')].some((e) => e.textContent === '77'); return r; })()`);
    check(play.k > 2 && Math.abs(play.space) < 0.5, `in play the new key jumps and the old one no longer does (K: ${play.k} m/s up, Space: ${play.space})`);
    check(!play.dmgShown, 'with damage numbers off, none is shown');
    // Pause: resume, settings, restart, hub; no sliders left on it
    const pz = await page.evaluate(`(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true })); __sim(0.05); const c = document.querySelector('#pause'); return { on: c.classList.contains('on'), inputs: c.querySelectorAll('input, select').length, acts: [...c.querySelectorAll('[data-act]')].map((b) => b.dataset.act) }; })()`);
    check(pz.on && pz.inputs === 0 && pz.acts.includes('resume') && pz.acts.includes('settings') && pz.acts.includes('restart'), `Pause is down to its buttons (${pz.acts.join(', ')})`);
    await page.click('#pause [data-act=settings]'); await page.waitForTimeout(200); await shot('en-pause-settings');
    check(await page.evaluate('__G.cfg.isOpen()'), 'Settings opens from Pause');
    // back to the defaults
    await page.click('#settings [data-reset=all]'); await page.waitForTimeout(120);
    const back = await page.evaluate('({ same: JSON.stringify(BZ.SETTINGS_DEF) === JSON.stringify((({ hero, coopName, ...r }) => r)(__G.settings)), fov: __G.camera.fov, dot: document.body.classList.contains("xh-dot") })');
    check(back.same && back.fov === 78 && !back.dot, `"Reset everything" returns every option to its default (fov ${back.fov})`);
    await page.click('#settings [data-tab=graphics]'); await range('fov', 70); await page.click('#settings [data-def=fov]'); await page.waitForTimeout(80);
    check(await page.evaluate('__G.settings.fov === 78'), 'one option goes back to its default with its own button');

    // ---- language ----
    await page.click('#settings [data-tab=general]');
    await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('#settings [data-lang=vi]')]); await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const langNow = await page.evaluate('BZ.lang'); await load('nolock=1&noaudio=1&seed=5'); // (the switch reloaded the fight; the title is where the rest is checked)
    const v1 = await page.evaluate(`({ lang: BZ.lang, play: document.querySelector('[data-act=play], #title .btn').textContent.trim(), hero: BZ.HEROES[0].name })`); v1.lang = langNow === 'vi' ? v1.lang : langNow;
    check(v1.lang === 'vi' && v1.play !== first.play, `choosing Tiếng Việt reloads into Vietnamese ("${first.play}" -> "${v1.play}")`);
    await page.click('#title [data-act=settings]'); await page.waitForTimeout(200);
    for (const t of ['general', 'graphics', 'audio', 'controls', 'interface']) { await page.click(`#settings [data-tab=${t}]`); await page.waitForTimeout(100); await shot('vi-set-' + t); }
    await page.keyboard.press('Escape'); await shot('vi-title');
    await load('nolock=1&noaudio=1&seed=5'); check(await page.evaluate('BZ.lang === "vi"'), 'the language is remembered on the next visit');
    await load('nolock=1&noaudio=1&seed=5&lang=en'); check(await page.evaluate('BZ.lang === "en"'), '?lang=en overrides it for one visit');
    // the English screens a player walks through: hero select, the home tabs, a fight, the upgrade pick, death
    const walk = await page.evaluate(`(async () => { const G = __G; const out = {}; const VIre = ${VI}; const scan = () => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest('script,style,[data-lang],#langbtn')) continue; if (!el.getClientRects().length) continue; const t = n.textContent.trim(); if (t && VIre.test(t)) o.push(t.slice(0, 40)); } return o; };
      for (const s of ['select', 'pick', 'dead', 'coop']) { try { G.ui.show(s); if (s === 'select') G.ui.selectRender && G.events.emit('ui:play'); if (s === 'pick' && G.build.offer) G.ui.pickRender(G.build.offer()); } catch (e) { out[s + 'Err'] = e.message; } out[s] = scan(); }
      for (const t of ['gacha', 'heroes', 'shop']) { try { G.events.emit('ui:meta', t); G.meta.open && G.meta.open(t); } catch (e) {} out['home-' + t] = scan(); }
      return out; })()`);
    const leaks = Object.entries(walk).filter(([k, v]) => Array.isArray(v) && v.length);
    check(leaks.length === 0, `no Vietnamese on the English hero select, upgrade pick, death, co-op and home screens${leaks.length ? ': ' + leaks.map(([k, v]) => k + ' [' + v.slice(0, 3).join(' | ') + ']').join('; ') : ''}`);
    await load('nolock=1&noaudio=1&seed=5&lang=en&autostart=1&god=1'); await page.evaluate('__sim(3)'); const sp = await stray(); await shot('en-play');
    check(sp.length === 0, `no Vietnamese on the English HUD in play${sp.length ? ': ' + sp.slice(0, 5).join(' | ') : ''}`);
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? `${fails.length} FAIL of ${fails.length + passed}` : `ALL PASS (${passed} checks)`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
