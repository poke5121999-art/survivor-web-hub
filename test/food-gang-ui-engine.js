#!/usr/bin/env node
/* Food Gang uGUI engine features (scratch page served by this script; FG_URL=<url of a page exposing window.tui> to aim elsewhere): ScrollRect drag / wheel /
 * normalizedPosition / mask-aware raycast, TMP_InputField (real HTML <input>), 13-language tables and the Canvas2D
 * fallback glyphs for scripts the SDF font lacks. Screenshots go to shots/food-gang/ui-engine/.
 *   node test/food-gang-ui-engine.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.FG_SHOTS || path.join(ROOT, 'shots', 'food-gang', 'ui-engine');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

// scratch page, served virtually at /games/food-gang/test-ui.html (nothing is added to the game folder)
const PAGE = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>fg ui-engine test</title>\n<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#cv{position:absolute;inset:0;width:100%;height:100%;display:block}</style>\n</head><body><canvas id=\"cv\"></canvas>\n<script type=\"module\">\n// scratch page for test/food-gang-ui-engine.js (removed afterwards): ?scene=SceneShop|SceneSettings\nimport { Engine, stats } from './js/engine/engine.js';\nimport * as txt from './js/game/text.js';\nconst Q = new URLSearchParams(location.search);\n(async () => {\n  const engine = new Engine(document.getElementById('cv'), new URL('.', location.href).href);\n  window.tui = { engine, txt, clicks: [], ready: false };\n  await engine.init();\n  await txt.initText(engine.assets);\n  const inst = await engine.loadScene(Q.get('scene') || 'SceneShop');\n  window.tui.inst = inst;\n  txt.localize(inst.root);\n  engine.onClick((b) => window.tui.clicks.push(b.node.name + '#' + inst.nodes.indexOf(b.node)));\n  engine.start();\n  const wait = () => (stats.frames > 5 ? (window.tui.ready = true) : setTimeout(wait, 50));\n  wait();\n})().catch((e) => { stats.errors.push(String((e && e.stack) || e)); console.error(e); });\n</script></body></html>\n";

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (q.url.split('?')[0] === '/games/food-gang/test-ui.html') { s.writeHead(200, { 'content-type': 'text/html' }); s.end(PAGE); return; }
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.FG_URL ? null : await serve();
  const base = process.env.FG_URL || `http://localhost:${srv.address().port}/games/food-gang/test-ui.html`;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
  const killer = setTimeout(() => { console.log('  FAIL timeout (180 s)'); process.exit(2); }, 180000);
  const errors = [];
  const open = async (scene) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${base}?scene=${scene}`);
    const ok = await page.waitForFunction(() => window.tui && window.tui.ready, null, { timeout: 60000 }).then(() => true, () => false);
    check(`${scene} ready`, ok);
    await page.waitForTimeout(800);
    return page;
  };
  // canvas pixel (y up) -> page coordinates
  const toPage = (page, x, y) => page.evaluate(([x, y]) => { const c = document.getElementById('cv'), r = c.getBoundingClientRect(); return [r.left + x * r.width / c.width, r.top + (c.height - y) * r.height / c.height]; }, [x, y]);
  try {
    // ------------------------------------------------------------------------------------------------ ScrollRect
    console.log('ScrollRect (SceneShop)');
    let page = await open('SceneShop');
    const sc = await page.evaluate(() => {
      const { engine } = window.tui;
      const s = engine.ui.scrolls[0];
      const b = engine.ui.scrollBounds(s);
      const vp = engine.ui.screenRect(s.viewport);
      // a Button node inside the viewport, fully visible, to start the drag on
      let btn = null;
      for (const bt of engine.buttons) {
        if (!bt.node.activeInHierarchy || !bt.node.r) continue;
        const r = engine.ui.screenRect(bt.node);
        if (r[0] > vp[0] + 5 && r[0] + r[2] < vp[0] + vp[2] - 5 && r[2] > 20) { btn = { name: bt.node.name, c: [r[0] + r[2] / 2, r[1] + r[3] / 2] }; break; }
      }
      return { has: !!s, hor: s.horizontal, ver: s.vertical, mt: s.movementType, ctrW: b.cmax[0] - b.cmin[0], vwW: b.vmax[0] - b.vmin[0], vp, btn,
        x: s.content.rect.pos[0], norm: s.normalizedPosition };
    });
    check('ScrollRect parsed (horizontal, elastic)', sc.has && sc.hor && !sc.ver && sc.mt === 1, `content ${sc.ctrW.toFixed(0)} view ${sc.vwW.toFixed(0)}`);
    check('content wider than viewport', sc.ctrW > sc.vwW + 50);
    check('button found inside viewport', !!sc.btn, sc.btn && sc.btn.name);
    await page.screenshot({ path: path.join(SHOTS, 'shop-0-start.png') });
    // drag left from the button centre by 300 css px
    const from = await toPage(page, sc.btn.c[0], sc.btn.c[1]);
    await page.evaluate(() => { window.tui.clicks.length = 0; window.tui.vlog = []; window.tui.engine.ui.scrolls[0].onValueChanged = (v) => window.tui.vlog.push(v); });
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(from[0] - i * 25, from[1]); await page.waitForTimeout(16); }
    const mid = await page.evaluate(() => { const s = window.tui.engine.ui.scrolls[0]; return { x: s.content.rect.pos[0], dragging: s.dragging }; });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => { const { engine, clicks, vlog } = window.tui; const s = engine.ui.scrolls[0]; return { x: s.content.rect.pos[0], clicks: clicks.slice(), nv: vlog.length, norm: s.normalizedPosition }; });
    check('drag moved the content', after.x < sc.x - 100, `x ${sc.x.toFixed(0)} -> mid ${mid.x.toFixed(0)} -> ${after.x.toFixed(0)}`);
    check('was dragging mid-gesture', mid.dragging === true);
    check('drag that started on a Button did not click it', after.clicks.length === 0, after.clicks.join(','));
    check('onValueChanged fired + normalizedPosition moved right', after.nv > 0 && after.norm[0] > sc.norm[0] + 0.01, `norm ${sc.norm.map((v) => v.toFixed(2))} -> ${after.norm.map((v) => v.toFixed(2))}`);
    await page.screenshot({ path: path.join(SHOTS, 'shop-1-dragged.png') });
    // elastic: drag far past the end, content overshoots, then springs back inside the limits
    await page.evaluate(() => { window.tui.engine.ui.scrolls[0].normalizedPosition = [1, 0]; });
    await page.waitForTimeout(400);
    const end = await page.evaluate(() => window.tui.engine.ui.scrolls[0].normalizedPosition);
    check('normalizedPosition setter -> 1', Math.abs(end[0] - 1) < 0.01, end.map((v) => v.toFixed(3)).join(','));
    const f2 = await toPage(page, sc.vp[0] + sc.vp[2] / 2, sc.vp[1] + sc.vp[3] / 2);
    await page.mouse.move(f2[0], f2[1]); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(f2[0] - i * 40, f2[1]); await page.waitForTimeout(16); }
    const over = await page.evaluate(() => window.tui.engine.ui.scrolls[0].normalizedPosition[0]);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const back = await page.evaluate(() => window.tui.engine.ui.scrolls[0].normalizedPosition[0]);
    check('elastic overscroll then spring back to 1', over > 1.02 && Math.abs(back - 1) < 0.01, `over ${over.toFixed(3)} back ${back.toFixed(3)}`);
    // wheel scrolls (wheel down = content moves left in a horizontal rect)
    await page.evaluate(() => { window.tui.engine.ui.scrolls[0].normalizedPosition = [0, 0]; });
    await page.waitForTimeout(300);
    await page.mouse.move(f2[0], f2[1]);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    const wh = await page.evaluate(() => window.tui.engine.ui.scrolls[0].normalizedPosition[0]);
    check('mouse wheel scrolls', wh > 0.02, wh.toFixed(3));
    // scrollTo centres a child
    const st = await page.evaluate(() => {
      const { engine } = window.tui; const s = engine.ui.scrolls[0];
      const kids = s.content.children.filter((c) => c.activeSelf && c.r && c.r.w > 50);
      const k = kids[Math.min(kids.length - 1, 3)];
      s.scrollTo(k);
      engine.updateWorld();
      const r = engine.ui.screenRect(k), v = engine.ui.screenRect(s.viewport);
      return { dc: Math.abs((r[0] + r[2] / 2) - (v[0] + v[2] / 2)), n: kids.length, norm: s.normalizedPosition[0] };
    });
    check('scrollTo(child) centres it (or clamps at an end)', st.dc < 3 || st.norm < 0.001 || st.norm > 0.999, `off ${st.dc.toFixed(1)} px, norm ${st.norm.toFixed(2)}`);
    // a plain tap on a Button still clicks
    await page.evaluate(() => { window.tui.engine.ui.scrolls[0].normalizedPosition = [0, 0]; window.tui.clicks.length = 0; });
    await page.waitForTimeout(400);
    const bt = await page.evaluate(() => {
      const { engine } = window.tui; const vp = engine.ui.screenRect(engine.ui.scrolls[0].viewport);
      for (const b of engine.buttons) { if (!b.node.activeInHierarchy || !b.node.r) continue; const r = engine.ui.screenRect(b.node); if (r[0] > vp[0] + 5 && r[0] + r[2] < vp[0] + vp[2] - 5 && r[2] > 20) return [r[0] + r[2] / 2, r[1] + r[3] / 2]; }
      return null;
    });
    const tp = await toPage(page, bt[0], bt[1]);
    await page.mouse.click(tp[0], tp[1]);
    await page.waitForTimeout(200);
    const tapClicks = await page.evaluate(() => window.tui.clicks.length);
    check('tap (no drag) still clicks the Button', tapClicks === 1, `${tapClicks}`);
    // masks: narrow the viewport to the middle 20 % of the screen; buttons outside it are clipped away and must not be hit
    await page.evaluate(() => { const v = window.tui.engine.ui.scrolls[0].viewport.rect; v.amin = [0.4, 0]; v.amax = [0.6, 1]; v.size = [0, 0]; v.pos = [0, 0]; });
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => {
      const { engine } = window.tui; const s = engine.ui.scrolls[0]; const vp = engine.ui.screenRect(s.viewport);
      const under = (n) => { for (let p = n; p; p = p.parent) if (p === s.content) return true; return false; };
      let inside = null, outside = null;
      for (const b of engine.buttons) {
        if (!b.node.activeInHierarchy || !b.node.r || !under(b.node)) continue;
        const r = engine.ui.screenRect(b.node), cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
        if (cx > vp[0] + 5 && cx < vp[0] + vp[2] - 5) inside = inside || [cx, cy];
        else if (cx > 5 && cx < engine.canvas.width - 5 && r[2] > 20) outside = outside || [cx, cy, b.node.name];
      }
      const h = (pt) => { const n = pt && engine.ui.raycast(pt[0], pt[1]); return n && under(n) ? n.name : null; };
      return { vp: vp.map(Math.round), outside: outside && outside[2], hitOutside: h(outside), hitInside: h(inside) };
    });
    check('raycast: child clipped by the Mask is not hit, child inside is', !!clip.outside && clip.hitOutside === null && clip.hitInside !== null, `viewport ${clip.vp}; outside ${clip.outside} -> ${clip.hitOutside}; inside -> ${clip.hitInside}`);
    await page.screenshot({ path: path.join(SHOTS, 'shop-2-narrow-mask.png') });
    await page.close();

    // ------------------------------------------------------------------------------------------------ InputField + language
    console.log('TMP_InputField + languages (SceneSettings)');
    page = await open('SceneSettings');
    const fld = await page.evaluate(() => {
      const { engine } = window.tui;
      const f = engine.ui.inputOf(window.tui.inst.nodes[42]);
      window.tui.edits = [];
      f.onEndEdit = (v) => window.tui.edits.push(v);
      const r = engine.ui.screenRect(f.node);
      return { ok: !!f, c: [r[0] + r[2] / 2, r[1] + r[3] / 2], val: f.value, ph: f.placeholder.hidden };
    });
    check('TMP_InputField parsed', fld.ok && fld.val === '' && fld.ph === false);
    await page.screenshot({ path: path.join(SHOTS, 'settings-0-start.png') });
    const fp = await toPage(page, fld.c[0], fld.c[1]);
    await page.mouse.click(fp[0], fp[1]);
    await page.waitForTimeout(300);
    const foc = await page.evaluate(() => { const e = document.querySelector('input.fg-input'); return e ? { focused: document.activeElement === e, w: e.getBoundingClientRect().width, fs: e.style.fontSize, textHidden: window.tui.engine.ui.activeInput.textComp.hidden } : null; });
    check('click puts a real focused <input> over the field', !!foc && foc.focused && foc.w > 100 && foc.textHidden, foc && `${foc.w.toFixed(0)}px font ${foc.fs}`);
    await page.keyboard.type('Banh Mi 42');
    await page.screenshot({ path: path.join(SHOTS, 'settings-1-typing.png') });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const ed = await page.evaluate(() => { const { engine, edits } = window.tui; const f = engine.ui.inputOf(window.tui.inst.nodes[42]); return { edits, value: f.value, text: f.textComp.text, hidden: f.textComp.hidden, ph: f.placeholder.hidden, gone: !document.querySelector('input.fg-input') }; });
    check('Enter commits: onEndEdit got the value', ed.edits.length === 1 && ed.edits[0] === 'Banh Mi 42', JSON.stringify(ed.edits));
    check('value + TMP text updated, text shown, placeholder hidden, <input> removed', ed.value === 'Banh Mi 42' && ed.text === 'Banh Mi 42' && !ed.hidden && ed.ph && ed.gone);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'settings-2-committed.png') });
    const lim = await page.evaluate(() => {
      const f = window.tui.engine.ui.inputOf(window.tui.inst.nodes[42]);
      f.limit = 5; f.validation = 4; f.uppercase = true; f.setValue('ab-c d9876');
      return f.value;
    });
    check('setValue honours limit + alphanumeric + uppercase', lim === 'ABCD9', lim);
    await page.evaluate(() => { const f = window.tui.engine.ui.inputOf(window.tui.inst.nodes[42]); f.limit = 0; f.validation = 0; f.uppercase = false; f.setValue(''); });
    const ph2 = await page.evaluate(() => window.tui.engine.ui.inputOf(window.tui.inst.nodes[42]).placeholder.hidden);
    check('setValue("") shows the placeholder again', ph2 === false);

    // languages
    const title = () => page.evaluate(() => { const l = window.tui.inst.nodes.map((x) => x.script('Localize')).find((s) => s && s.fields.m_key === 'title.settings'); return window.tui.inst.ref(l.fields.m_text).text; });
    const seq = ['English', 'Japanese', 'Arabic', 'Russian', 'English'];
    const seen = [];
    let lastFb = await page.evaluate(() => window.fgEngineStats.fbQuads);
    for (const id of seq) {
      await page.evaluate((id) => window.tui.txt.setLanguage(id), id);
      await page.waitForTimeout(500);
      const t = await title();
      const info = await page.evaluate(() => ({ fb: window.fgEngineStats.fbQuads, lang: window.tui.txt.getLanguage(), g: window.fgEngineStats.fbGlyphs, pages: window.fgEngineStats.fbPages }));
      seen.push(t);
      const expectFb = id === 'Japanese' || id === 'Arabic';
      check(`${id}: 'title.settings' = ${JSON.stringify(t)}`, info.lang === id && (seen.length < 2 || t !== seen[seen.length - 2]) && !!t, `fallback quads +${info.fb - lastFb}`);
      if (expectFb) check(`${id}: missing-glyph quads were drawn`, info.fb > lastFb, `+${info.fb - lastFb} quads, ${info.g} glyphs, ${info.pages} page(s)`);
      lastFb = info.fb;
      await page.screenshot({ path: path.join(SHOTS, `settings-lang-${seen.length}-${id}.png`) });
    }
    const tbl = await page.evaluate(() => ({ unknown: window.tui.txt.T('no.such.key') }));
    check('unknown key falls back to the key itself', tbl.unknown === 'no.such.key');
    check('language persisted in localStorage', (await page.evaluate(() => localStorage.getItem('fg-lang'))) === 'English');
    // layout checks straight on buildText
    const wrap = await page.evaluate(async () => {
      const { engine } = window.tui;
      const mod = await import('./js/engine/text.js');
      const f = [...engine.assets.fontsReady.values()][0];
      const comp = { text: '週間ミッションを完了してトロフィーを獲得しよう。次のリーグへ進もう', size: 32, wrap: 1, align: 257, richText: 1 };
      const b = mod.buildText(f, comp, 300, 400);
      const ys = new Set(b.quads.map((q) => Math.round(q.y0)));
      const ar = mod.buildText(f, { text: 'المهمة [X] الأسبوعية', size: 32, wrap: 1, align: 257, richText: 1 }, 600, 100);
      const lat = mod.buildText(f, { text: 'ÀÉÎÕÜ çğış ЖМЯ', size: 32, wrap: 1, align: 257, richText: 1 }, 600, 100);
      const arx = ar.quads.map((q) => Math.round(q.x0));
      return { lines: ys.size, max: Math.max(...b.quads.map((q) => q.x1)), arQuads: ar.quads.length, arFb: ar.quads.filter((q) => q.page).length, latFb: lat.quads.filter((q) => q.page).length, latN: lat.quads.length, arx };
    });
    check('Japanese wraps per character inside the box', wrap.lines >= 3 && wrap.max <= 300.5, `${wrap.lines} lines, max x ${wrap.max.toFixed(0)}`);
    check('Arabic words are rasterized as runs (2 words -> 2 quads + [X])', wrap.arFb === 2 && wrap.arQuads === 5, `${wrap.arFb} run quads of ${wrap.arQuads}; x ${wrap.arx.join(',')}`);
    check('accents / Cyrillic quads built', wrap.latN >= 10, `${wrap.latFb} via fallback of ${wrap.latN}`);
    // Russian 'Политика конфиденциальности' on the Privacy button (auto size 16..28): TMP shrinks before it cuts a word
    await page.evaluate((id) => window.tui.txt.setLanguage(id), 'Russian');
    await page.waitForTimeout(500);
    const priv = await page.evaluate(async () => {
      const { engine, inst } = window.tui;
      const mod = await import('./js/engine/text.js');
      const n = inst.nodes.find((x) => x.name === 'Name' && x.parent && x.parent.parent && x.parent.parent.name === 'Button_DataPrivacy');
      const t = n.get('Text');
      const b = mod.buildText(engine.assets.fontSync(t.font), t, n.r.w, n.r.h);
      const lines = b.lines;
      // Discord: an icon wider than its HorizontalLayoutGroup (512 px sprite at ppu 77) stays centred on the button
      const ic = inst.nodes.find((x) => x.name === 'Icon' && x.parent && x.parent.name === 'Buy');
      const btn = inst.nodes.find((x) => x.name === 'Button_Discord');
      const a = engine.ui.screenRect(ic), c = engine.ui.screenRect(btn);
      return { text: t.text, lines, size: b.size, icon: a[0] + a[2] / 2, btn: c[0] + c[2] / 2, iconW: a[2], btnW: c[2] };
    });
    check('Russian privacy button text shrinks instead of cutting a word (2 lines)', priv.lines === 2, `${JSON.stringify(priv.text)} ${priv.lines} lines at ${priv.size && priv.size.toFixed ? priv.size.toFixed(1) : priv.size}`);
    check('Discord icon centred on its button (layout group narrower than the icon)', Math.abs(priv.icon - priv.btn) < 2 && priv.iconW <= priv.btnW + 1, `icon centre ${priv.icon.toFixed(0)} button ${priv.btn.toFixed(0)}, width ${priv.iconW.toFixed(0)}/${priv.btnW.toFixed(0)}`);
    await page.evaluate((id) => window.tui.txt.setLanguage(id), 'English');
    await page.close();
    check('no console / page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  } catch (e) {
    check('test crashed', false, e.stack || e.message);
  } finally {
    clearTimeout(killer);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
