/*
 * POKÉONE — cây UI NGUI gốc vẽ bằng js/ngui.js (data/ui.js, data/atlas.js, art/ui/*).
 *
 * Chạy:  node test/pokeone-ui.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/pokeone-ui-shots): trận đấu, đội, túi, cài đặt, hộp thoại, đăng nhập
 * ở 1280x720 và 844x390. Mở ra xem, so với bố cục NGUI (tools/README-ui.md).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-ui-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// Mỗi cảnh: panel cần dựng + việc chỉnh trong trang (chạy trong trình duyệt, `ui` = kết quả P1.ngui.build).
// Thanh máu nằm sẵn ngoài mép màn (anchor OnStart của FoeHealth: trái -276..-26) rồi BattleHandler trượt vào;
// khoảng trượt không có trong dữ liệu cảnh, ở đây dịch 300 đơn vị NGUI (đoán).
function battleBase(ui) {
  ['Battle Window/FoeHealth (1)', 'Battle Window/FoeHealth (2)', 'Battle Window/User Health Bar (1)',
    'Battle Window/User Health Bar (2)', 'BattlePanel/Panel', 'Attacks/Mega Button', 'Attacks/Z Moves',
    'Attacks/Button - Attack (5)', 'Attacks/Button - Attack (6)', 'Attacks/Button - Attack (7)', 'Attacks/Button - Attack (8)']
    .forEach((p) => ui.show(p, false));
  ui.offset('Battle Window/FoeHealth', 300, 0);
  ui.offset('Battle Window/User Health Bar', -300, 0);
  ui.label('Battle Window/FoeHealth/lblPokemonname', 'Pidgey [F]');
  ui.label('Battle Window/FoeHealth/Label - Level', '[Lv]3');
  ui.label('Battle Window/FoeHealth/Label - HP', '100%');
  ui.label('Battle Window/User Health Bar/lblPokemonname', 'Bulbasaur [M]');
  ui.label('Battle Window/User Health Bar/Label - Level', '[Lv]5');
  ui.label('Battle Window/User Health Bar/Label - HP', '12/20');
  ui.label('Debug Log/Label', 'A wild Pidgey appeared!\nGo! Bulbasaur!');
}

// Mỗi cảnh: panel cần dựng + việc chỉnh trong trang (chạy trong trình duyệt, `ui` = kết quả P1.ngui.build).
const SCENES = {
  battle: {
    panel: 'BattlePanel',
    setup: `(ui) => { (${battleBase})(ui); ui.show('Attacks', false); }`,
  },
  moves: {
    panel: 'BattlePanel',
    setup: `(ui) => {
      (${battleBase})(ui);
      ui.show('Button - Attack', false);
      [['Tackle', '35/35'], ['Growl', '40/40'], ['Vine Whip', '25/25'], ['Leech Seed', '10/10']].forEach(([m, pp], i) => {
        ui.label('Attacks/Attacks/Button - Attack ' + (i + 1) + '/Label - Attack Name', m);
        ui.label('Attacks/Attacks/Button - Attack ' + (i + 1) + '/Label - PP', pp);
      });
    }`,
  },
  party: { panel: 'Panel - Game GUI', setup: () => {} },
  bag: {
    panel: 'Panel - Inventory',
    setup: (ui) => {
      ['Poké Ball', 'Great Ball', 'Potion', 'Super Potion', 'Antidote', 'Paralyze Heal', 'Awakening', 'Burn Heal',
        'Ice Heal', 'Escape Rope', 'Repel', 'Oran Berry', 'Pecha Berry', 'Rare Candy', 'Full Heal', 'Revive',
        'Ether', 'Max Repel', 'Lemonade', 'Soda Pop'].forEach((name, i) => {
        const it = ui.add('Panel - Inventory Items/Grid', 'prefab:Inventory Item', 'item' + i);
        ui.label(it.path + '/Label - Name', name);
        ui.label(it.path + '/Label - QTY', 'x' + (i + 1));
        if (i === 0) ui.texture(it.path + '/Sprite/Texture - Icon', 'art/ui/tex/pokeballload.png');
      });
    },
  },
  options: {
    panel: 'Panel - Options',
    setup: (ui) => {
      const grid = 'Scroll View - Settings/Grid';
      const kinds = { choice: 'prefab:Button - Setting Dropdown', toggle: 'prefab:Button - Setting Dropdown',
        slider: 'prefab:Button - Setting Slider', key: 'prefab:Button - Key Setting', button: 'prefab:Button - Reset Keys' };
      const defs = (P1.SETTINGS_DEF || []).filter((d) => d.cat === (P1.SETTINGS_DEF[0] || {}).cat);
      defs.forEach((d, i) => {
        const row = ui.add(grid, kinds[d.kind] || kinds.choice, 'row' + i);
        ui.label(row.path + '/Label - Title', d.label);
        if (d.kind === 'slider') ui.value(row.path + '/Slider', typeof d.def === 'number' ? d.def : 0.5);
        else if (d.key === 'sResolution') ui.label(row.path + '/Drop Down - Setting/Label', innerWidth + ' x ' + innerHeight);
        else if (Array.isArray(d.options) && typeof d.def === 'number') {
          ui.label(row.path + '/Drop Down - Setting/Label', String(d.options[d.def] != null ? d.options[d.def] : d.def));
        }
      });
    },
  },
  dialogue: {
    panel: 'Panel - Scripts',
    setup: (ui) => {
      ui.show('Sprite - Select Container', false);
      ui.label('Normal Text/Label - Script Text', 'Hello there! Welcome to the world of POKéMON!');
    },
  },
  title: { panel: 'title:Panel - Login', setup: () => {} },
};

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  for (const [name, sc] of Object.entries(SCENES)) {
    await page.goto('about:blank');
    await page.goto(base + '/games/pokeone/tools/ui-viewer.html?panel=' + encodeURIComponent(sc.panel));
    await page.waitForFunction(() => window.viewerReady);
    await page.evaluate(`(${sc.setup})(window.viewer)`);
    await page.evaluate(() => window.viewerReady.then(() => P1.ngui.ready()));
    await page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
    const info = await page.evaluate(() => {
      const ui = window.viewer.ui;
      let sprites = 0, painted = 0, labels = 0, offscreen = [];
      ui.top.walk((n) => {
        if (!n.el || n.el.style.display === 'none' || !n.w) return;
        const r = n.el.getBoundingClientRect();
        if (n.w.kind === 'sprite' && n.w.atlas && ui.finalAlpha(n) > 0.05) {
          sprites++;
          const c = n.el, g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < g.length; i += 4 * 7) if (g[i] > 0) { painted++; break; }
        }
        if (n.w.kind === 'label') labels++;
        if (ui.finalAlpha(n) > 0.05 && (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight)) offscreen.push(n.path);
      });
      const fams = new Set();
      ui.top.walk((n) => { if (n.el && n.w && n.w.kind === 'label' && n.el.style.display !== 'none') fams.add(n.el.style.fontFamily.split(',')[0].trim()); });
      const missing = [...fams].filter((f) => !document.fonts.check('16px ' + f));
      return { sprites, painted, labels, offscreen: offscreen.slice(0, 5), nOff: offscreen.length, fonts: [...fams].join(' '), missing };
    });
    check(name + ': sprite có điểm ảnh', info.sprites > 0 && info.painted === info.sprites, info.painted + '/' + info.sprites);
    check(name + ': font web đã nạp', info.fonts && info.missing.length === 0, info.fonts + (info.missing.length ? ' thiếu ' + info.missing : ''));
    out.push('    ' + JSON.stringify(info));
    SCENES[name].info = SCENES[name].info || {};
    SCENES[name].info[tag] = info;
  }

  // Bố cục theo UIRoot: nút Fight neo giữa đáy màn (bottom +71..+135); thanh máu địch neo mép trái
  // (-276..-26, nằm ngoài màn lúc đầu), thanh của ta neo mép phải (+26..+276).
  await page.goto('about:blank');
  await page.goto(base + '/games/pokeone/tools/ui-viewer.html?panel=BattlePanel');
  await page.waitForFunction(() => window.viewerReady);
  const rect = (p) => page.evaluate((p) => {
    const b = window.viewer.find(p).el.getBoundingClientRect();
    return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), k: window.viewer.ui.scr.k };
  }, p);
  const fight = await rect('Button - Attack/UISlicedSprite');
  const k = fight.k;
  const near = (a, b) => Math.abs(a - b) < 1.5;
  check('Fight ở giữa, đáy cách mép 71 đơn vị', near((fight.l + fight.r) / 2, W / 2) && near(fight.b, H - 71 * k), JSON.stringify(fight));
  const foe0 = await rect('Battle Window/FoeHealth'), user0 = await rect('Battle Window/User Health Bar');
  check('thanh máu địch lúc đầu nằm ngoài mép trái (phải = -26)', near(foe0.r, -26 * k) && near(foe0.t, 30 * k), JSON.stringify(foe0));
  check('thanh máu ta lúc đầu nằm ngoài mép phải (trái = W+26)', near(user0.l, W + 26 * k) && near(user0.b, H - 11 * k), JSON.stringify(user0));
  await page.evaluate(() => { window.viewer.offset('Battle Window/FoeHealth', 300, 0); window.viewer.offset('Battle Window/User Health Bar', -300, 0); });
  const foe1 = await rect('Battle Window/FoeHealth'), user1 = await rect('Battle Window/User Health Bar');
  check('offset(300) đưa thanh máu địch vào màn', near(foe1.l, 24 * k) && foe1.r < W / 2, JSON.stringify(foe1));
  check('offset(-300) đưa thanh máu ta vào màn', near(user1.r, W - 24 * k) && user1.l > W / 2, JSON.stringify(user1));

  // ResizeFreely: khung thoại (anchor theo label) giãn theo chữ như NGUI.
  await page.goto('about:blank');
  await page.goto(base + '/games/pokeone/tools/ui-viewer.html?panel=' + encodeURIComponent('Panel - Scripts'));
  await page.waitForFunction(() => window.viewerReady);
  const bubble = await page.evaluate(async () => {
    const v = window.viewer, r = (p) => v.find(p).el.getBoundingClientRect();
    const w0 = r('Normal Text/Sprite - Background').width;
    v.label('Normal Text/Label - Script Text', 'A much longer line of NPC dialogue text here');
    await P1.ngui.ready();
    const bg = r('Normal Text/Sprite - Background'), lb = v.find('Normal Text/Label - Script Text').el.firstChild.getBoundingClientRect();
    return { w0, w1: bg.width, bgL: bg.left, bgR: bg.right, txtL: lb.left, txtR: lb.right };
  });
  check('khung thoại giãn theo chữ, chữ nằm trong khung', bubble.w1 > bubble.w0 + 100 && bubble.txtL >= bubble.bgL && bubble.txtR <= bubble.bgR,
    JSON.stringify(bubble));

  // Túi đồ: 14 ô prefab xếp lưới 2 cột (UIGrid), vùng clip cắt ô thứ 8 trở đi, lăn chuột thật thì cuộn.
  await page.goto('about:blank');
  await page.goto(base + '/games/pokeone/tools/ui-viewer.html?panel=' + encodeURIComponent('Panel - Inventory'));
  await page.waitForFunction(() => window.viewerReady);
  await page.evaluate(`(${SCENES.bag.setup})(window.viewer)`);
  const grid = await page.evaluate(() => {
    const v = window.viewer, r = (p) => v.find(p).el.getBoundingClientRect();
    const a = r('Grid/item0'), b = r('Grid/item1'), c = r('Grid/item2');
    const clip = v.find('Panel - Inventory Items').panelEl.style.clipPath;
    return { a: [a.left, a.top], b: [b.left, b.top], c: [c.left, c.top], k: v.ui.scr.k, clip };
  });
  check('UIGrid: 2 cột cách 181, hàng cách 46', Math.abs(grid.b[0] - grid.a[0] - 181 * grid.k) < 1 && Math.abs(grid.c[1] - grid.a[1] - 46 * grid.k) < 1 &&
    grid.a[1] === grid.b[1], JSON.stringify(grid));
  const wheelAt = await page.evaluate(() => { const b = window.viewer.find('Grid/item2').el.getBoundingClientRect(); return [b.left + 20, b.top + 10]; });
  await page.mouse.move(wheelAt[0], wheelAt[1]);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(50);
  const scrolled = await page.evaluate((y0) => window.viewer.find('Grid/item0').el.getBoundingClientRect().top - y0, grid.a[1]);
  check('lăn chuột thật 200 cuộn danh sách lên 100 đơn vị', Math.abs(scrolled + 100 * grid.k) < 1, 'dy=' + scrolled.toFixed(1));
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(50);
  const end = await page.evaluate(() => {
    const v = window.viewer, last = v.find('Grid/item19').el.getBoundingClientRect();
    const ys = v.find('Panel - Inventory Items').panelEl.style.clipPath.match(/[\d.]+px/g).map(parseFloat).filter((_, i) => i % 2);
    return { lastBottom: last.bottom, clipBottom: Math.max(...ys) * v.ui.scr.k };
  });
  check('cuộn quá tay thì kẹp: ô cuối chạm đáy vùng clip', Math.abs(end.lastBottom - end.clipBottom) < 1.5, JSON.stringify(end));

  await page.goto('about:blank');
  await page.goto(base + '/games/pokeone/tools/ui-viewer.html?panel=BattlePanel');
  await page.waitForFunction(() => window.viewerReady);
  // Nút bấm thật: rê chuột vào Fight đổi sang màu hover của UIButton.
  const fightBox = await page.evaluate(() => { const b = window.viewer.find('Button - Attack/UISlicedSprite').el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  let clicked = await page.evaluate(() => { window.__clicked = 0; window.viewer.on('Button - Attack', () => window.__clicked++); return 0; });
  await page.mouse.move(fightBox[0], fightBox[1]);
  await page.mouse.down();
  await page.mouse.up();
  clicked = await page.evaluate(() => window.__clicked);
  const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.dataset.name; }, fightBox);
  check('bấm chuột thật vào Fight gọi on(\'Button - Attack\')', clicked === 1, 'clicked=' + clicked + ' elementFromPoint=' + hit);

  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    await run(browser, base, 1280, 720);
    await run(browser, base, 844, 390);
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
