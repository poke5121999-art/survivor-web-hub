/*
 * POKÉONE — vỏ game kiểu PRO: màn đầu, tạo nhân vật, HUD, menu, hộp thoại (js/title.js, js/creator.js,
 * js/menus.js, css/p1.css). Hợp đồng và bố cục tham chiếu: brain/plans/pokeone-2d-pro.md.
 *
 * Chạy:  node test/pokeone-shell.js
 * Playwright thật (page.mouse / page.keyboard / page.click) trên index.html, ở 1366×768 và 844×390.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/pokeone-shell-shots). Phần tử dùng thuộc tính data-p1="..." làm
 * móc kiểm thử ổn định (menus.js không còn cây NGUI để dò theo đường dẫn như bản 3D cũ).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-shell-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
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

// Tài sản/luồng khác chưa xong tại thời điểm chạy bài kiểm này (âm thanh, tile/NPC bản đồ, hoạt ảnh
// chiêu...) không phải lỗi của vỏ game: lọc khỏi danh sách lỗi HTTP thay vì làm bài kiểm đỏ oan.
const EXPECTED_MISSING = [/\/audio\//, /\/art\/pro\/tiles\//, /\/art\/pro\/npc\//, /\/art\/pro\/bg\//,
  /\/art\/pro\/ball\//, /\/art\/pro\/anim\//, /supabase-config\.js/];

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    const A = window.Audio;
    window.__audios = [];
    window.Audio = function (src) { const a = new A(src); window.__audios.push(a); return a; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !EXPECTED_MISSING.some(re => re.test(r.url()))) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  let shotN = 0;
  const shot = async name => {
    await page.waitForTimeout(150);
    const f = path.join(SHOTS, tag + '-' + String(++shotN).padStart(2, '0') + '-' + name + '.png');
    await page.screenshot({ path: f });
  };
  const ev = f => page.evaluate(f);
  const click = sel => page.click(sel, { timeout: 8000 }).then(() => page.waitForTimeout(100));
  const drag = async (fromSel, toSel) => {
    const a = await page.locator(fromSel).boundingBox(), b = await page.locator(toSel).boundingBox();
    const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  /* Cảnh 'world' giả: chỉ nếu js/world.js thật sự vắng mặt (chưa tới lượt luồng World 2D). Hiện tại
     js/world.js đã có bản 2D thật nên nhánh này thường không chạy — giữ lại để bài kiểm không kẹt
     nếu chạy sớm hơn tiến độ luồng kia. */
  function stubWorldIfAbsent() {
    if (document.querySelector('script[src*="js/world.js"]')) return false;
    P1.scene.add('world', {
      mode: 'explore',
      enter() { this.hud = P1.ui.hud(); if (P1.audio && P1.audio.music) P1.audio.music('pallet_town'); },
      exit() { if (this.hud) this.hud.destroy(); },
      render() { const v = P1.view(); v.ctx.fillStyle = '#3a6b3a'; v.ctx.fillRect(0, 0, v.w, v.h); },
    });
    return true;
  }

  // ---------- màn đầu → tạo nhân vật → thế giới
  await page.goto(base + '/games/pokeone/index.html');
  await page.waitForFunction(() => window.P1 && P1.scene && P1.scene.name === 'title', null, { timeout: 30000 });
  const stubbed = await ev(stubWorldIfAbsent);
  out.push('    cảnh world: ' + (stubbed ? 'giả (js/world.js chưa có)' : 'js/world.js thật'));
  await page.waitForFunction(() => P1.titleBackdrop && P1.titleBackdrop.ready, null, { timeout: 20000 }).catch(() => {});
  check('màn đầu: nền đã tải, nhạc title', await ev(() => P1.titleBackdrop.ready && P1.audio.musicKey() === 'title'));
  check('màn đầu chưa có bản lưu: chỉ có nút Chơi mới, không có Tiếp tục',
    await ev(() => !!document.querySelector('[data-p1="title-new"]') && !document.querySelector('[data-p1="title-continue"]')));
  await shot('title');
  await click('[data-p1="title-new"]');
  await page.waitForFunction(() => P1.scene.name === 'creator', null, { timeout: 10000 });
  await shot('creator-start');

  const before = await ev(() => P1.scene.current.selection);
  await click('[data-p1="creator-gender-f"]');
  await click('[data-p1="creator-hair-next"]');
  await click('[data-p1="creator-hair-next"]');
  await click('[data-p1="creator-cloth-next"]');
  await click('[data-p1="creator-body-next"]');
  await click('[data-p1="creator-hat-next"]');
  await page.click('[data-p1="creator-name-input"]');
  await page.keyboard.type('Leaf');
  const sel = await ev(() => P1.scene.current.selection);
  check('tạo nhân vật: đổi giới tính/tóc/dáng người/trang phục/mũ bằng chuột, gõ tên',
    sel.name === 'Leaf' && sel.gender === 'female' && sel.look.hair !== before.look.hair &&
    sel.look.body !== before.look.body && sel.look.cloth !== before.look.cloth && sel.look.hat !== '', sel);
  // Hình xem trước xoay 4 hướng + bước chân: canvas phải đổi khung hình theo thời gian.
  const frame0 = await ev(() => document.querySelector('.p1-creator-canvas').toDataURL());
  await page.waitForTimeout(1300);
  const frame1 = await ev(() => document.querySelector('.p1-creator-canvas').toDataURL());
  check('hình xem trước đổi khung theo thời gian (xoay hướng/bước chân)', frame0 !== frame1);
  await shot('creator-edited');
  await click('[data-p1="creator-accept"]');
  await page.waitForFunction(() => P1.scene.name === 'world', null, { timeout: 15000 });
  await page.waitForTimeout(250);
  check('vào world: người chơi đúng như đã tạo', await ev(() => P1.state.player.name === 'Leaf' && P1.state.player.gender === 'female'));
  // HUD lẽ ra do world.js tự dựng lúc enter(); phòng khi luồng World 2D chưa gắn (cảnh giả ở trên).
  await ev(() => { if (!document.querySelector('.p1-hud') && P1.ui && P1.ui.hud) window.__hud = P1.ui.hud(); });
  // world thật mở đầu bằng lời thoại kịch bản của bản đồ (mode 'script'): bấm Space qua cho tới khi đi lại được.
  for (let i = 0; i < 40 && !(await ev(() => !P1.scene.current.mode || P1.scene.current.mode === 'explore')); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(200);

  // ---------- trạng thái mẫu
  await ev(() => {
    const s = P1.state, c = (dex, lv) => P1.mon.create(dex, lv, { ot: s.player.name });
    const bulba = c(1, 12), char = c(4, 10), pidgey = c(16, 6);
    ['tackle', 'growl', 'scratch', 'ember'].forEach((id, i) => { if (i < bulba.moves.length) bulba.moves[i] = { id, pp: 20, ppMax: 20 }; else bulba.moves.push({ id, pp: 20, ppMax: 20 }); });
    char.hp = 3;
    pidgey.status = 'psn';
    s.party = [bulba, char, pidgey];
    s.box = [c(19, 3), c(10, 4)];
    s.bag = { potion: 3, pokeball: 5, antidote: 1 };
    s.money = 5000;
    s.trainerExp = 300;
    [1, 4, 10, 16, 19].forEach(d => P1.seen(d));
    [1, 4, 16].forEach(d => P1.caught(d));
    P1.ui.refresh();
  });
  await shot('hud');

  // ---------- Esc → menu
  await page.keyboard.press('Escape');
  check('Esc mở menu, isOpen() = true', await ev(() => P1.ui.top() === 'menu' && P1.ui.isOpen()));
  await shot('menu');
  await page.keyboard.press('Escape');
  check('Esc đóng menu', await ev(() => !P1.ui.isOpen()));

  // ---------- đội: chọn Charmander (yếu), xem chiêu/IV, dùng Potion
  await click('[data-p1="hud-menu-party"]');
  check('mở màn Đội từ HUD', await ev(() => P1.ui.top() === 'party'));
  await click('[data-p1="party-row-1"]');
  await shot('party-info');
  await click('[data-p1="party-tab-1"]');
  await shot('party-moves');
  await click('[data-p1="party-tab-2"]');
  await shot('party-ivs');
  await click('[data-p1="party-tab-0"]');   // nút "Dùng vật phẩm" chỉ có ở thẻ Info
  const hp0 = await ev(() => P1.state.party[1].hp);
  await click('[data-p1="party-use"]');   // màn Đội: dùng đồ áp thẳng lên Pokémon đang xem, không hỏi lại
  await click('[data-p1="pick-item-potion"]');
  const used = await ev(() => ({ hp: P1.state.party[1].hp, max: P1.mon.stats(P1.state.party[1]).hp, potion: P1.state.bag.potion }));
  check('Potion hồi 20 HP cho Charmander, túi còn 2', used.hp === Math.min(used.max, hp0 + 20) && used.potion === 2, Object.assign({ hp0 }, used));
  await click('[data-p1="close"]');
  check('đóng màn Đội', await ev(() => !P1.ui.isOpen()));

  // ---------- túi đồ
  await click('[data-p1="hud-menu-bag"]');
  check('mở túi đồ từ HUD', await ev(() => P1.ui.top() === 'bag'));
  await shot('bag');
  await click('[data-p1="bag-pocket-Pokeball"]');
  await shot('bag-pokeball');
  await click('[data-p1="close"]');

  // ---------- Pokédex
  await click('[data-p1="hud-menu-dex"]');
  check('Pokédex: đếm đã thấy/đã bắt', await ev(() => /Đã thấy: 5/.test(document.querySelector('.p1-dex-counts').textContent) && /Đã bắt: 3/.test(document.querySelector('.p1-dex-counts').textContent)));
  await click('[data-p1="dex-cell-4"]');
  check('chọn Charmander hiện mô tả', await ev(() => /Charmander|#4/.test(document.querySelector('.p1-dex-name').textContent)));
  await shot('dex');
  await click('[data-p1="close"]');

  // ---------- thẻ huấn luyện viên
  await click('[data-p1="hud-menu-trainer"]');
  check('thẻ huấn luyện viên hiện tên', await ev(() => document.querySelector('.p1-trainer-name').textContent.includes('Leaf')));
  await shot('trainer');
  await click('[data-p1="close"]');

  // ---------- cài đặt
  await click('[data-p1="hud-menu-options"]');
  const music0 = await ev(() => P1.settings.musicVolume);
  await page.fill('[data-p1="opt-music"]', '0.8');
  await page.dispatchEvent('[data-p1="opt-music"]', 'input');
  const vol = await ev(() => ({ s: P1.settings.musicVolume, saved: JSON.parse(localStorage.getItem('pokeone.settings.v1')).musicVolume }));
  check('kéo Âm nhạc lên 0.8: P1.settings và localStorage cùng đổi', Math.abs(vol.s - 0.8) < 0.03 && vol.saved === vol.s, Object.assign({ music0 }, vol));
  await shot('options');
  await click('[data-p1="close"]');

  // ---------- cửa hàng: mua 2 Poké Ball
  await ev(() => { window.__shop = 0; P1.ui.shop([{ id: 'pokeball', price: 200 }, { id: 'potion', price: 300 }]).then(() => { window.__shop = 1; }); });
  await click('[data-p1="shop-item-0"]');
  await click('[data-p1="shop-more"]');
  const m0 = await ev(() => ({ money: P1.state.money, balls: P1.state.bag.pokeball }));
  await shot('shop');
  await click('[data-p1="shop-buy"]');
  const m1 = await ev(() => ({ money: P1.state.money, balls: P1.state.bag.pokeball }));
  check('mua 2 Poké Ball: trừ 400, túi +2', m1.money === m0.money - 400 && m1.balls === m0.balls + 2, { m0, m1 });
  await click('[data-p1="close"]');
  check('đóng cửa hàng thì promise xong', await ev(() => window.__shop === 1));

  // ---------- hộp PC
  await ev(() => { P1.ui.open('pokebox'); });
  await shot('pokebox');
  await click('[data-p1="box-cell-0"]');
  check('bấm Pokémon trong hộp: rút về đội', await ev(() => P1.state.party.length === 4 && P1.state.box.length === 1));
  await page.keyboard.press('Escape');

  // ---------- hồi máu
  await ev(() => { window.__healed = 0; P1.ui.heal().then(() => { window.__healed = 1; }); });
  await page.waitForTimeout(450);
  check('hồi máu: isOpen() khoá di chuyển lúc màn đen', await ev(() => P1.ui.isOpen()));
  await shot('heal');
  await page.waitForFunction(() => window.__healed === 1, null, { timeout: 10000 });
  check('hồi máu: cả đội đầy HP, hết trạng thái', await ev(() => P1.state.party.every(m => m.hp === P1.mon.stats(m).hp && !m.status)));

  // ---------- hộp thoại: gõ chữ, click bỏ qua, chọn bằng phím
  await ev(() => { window.__said = 0; P1.dialog.say(['Xin chào! Chào mừng đến với thế giới POKéMON!', 'Tôi là OAK, Giáo sư POKéMON.'], { name: 'Oak' }).then(() => { window.__said = 1; }); });
  await page.waitForTimeout(300);
  const partial = await ev(() => document.querySelector('.p1-dialog-text').textContent);
  check('chữ hiện dần theo thời gian', partial.length > 0 && partial.length < 'Xin chào! Chào mừng đến với thế giới POKéMON!'.length, partial);
  await click('[data-p1="dialog-box"]');   // bỏ qua gõ trang 1
  await shot('dialog');
  await click('[data-p1="dialog-box"]');   // sang trang 2 (bắt đầu gõ lại)
  await click('[data-p1="dialog-box"]');   // bỏ qua gõ trang 2
  await click('[data-p1="dialog-box"]');   // hết trang cuối → xong
  await page.waitForTimeout(100);
  check('click hộp thoại: bỏ qua gõ rồi sang trang, hết trang thì xong', await ev(() => window.__said === 1));
  await ev(() => { window.__pick = -1; P1.dialog.choose('Bạn chọn Pokémon nào?', ['Bulbasaur', 'Charmander', 'Squirtle']).then(i => { window.__pick = i; }); });
  await page.waitForTimeout(700);
  await shot('choose');
  await page.keyboard.press('2');
  await page.waitForTimeout(100);
  check('chọn bằng phím số 2 → chỉ số 1', await ev(() => window.__pick === 1));

  // ---------- học chiêu (đã đủ 4 chiêu → hiện màn chọn quên), tiến hoá
  await ev(() => { window.__lm = 'wait'; P1.ui.learnMove(P1.state.party[0], 'razorleaf').then(i => { window.__lm = i; }); });
  await shot('learn-move');
  await click('[data-p1="learn-forget-0"]');
  check('quên chiêu đầu để học Vòi Lá', await ev(() => window.__lm === 0 && P1.state.party[0].moves[0].id === 'razorleaf'));
  await ev(() => { window.__ev = 'wait'; P1.ui.evolve(P1.state.party[0], 2).then(b => { window.__ev = b; }); });
  await page.waitForTimeout(300);
  await shot('evolve');
  await click('[data-p1="evolve-yes"]');
  await page.waitForFunction(() => window.__ev !== 'wait', null, { timeout: 5000 });
  check('tiến hoá: Bulbasaur → Ivysaur', await ev(() => window.__ev === true && P1.state.party[0].dex === 2 && P1.state.dex.caught[2] === 1));

  check('không lỗi trang / console / HTTP bất ngờ', errors.length === 0, errors.slice(0, 8).join(' | '));
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;   // BASE=<url Pages> để kiểm bản trên mạng
  const browser = await chromium.launch();
  try {
    for (const [W, H] of [[1366, 768], [844, 390]]) {
      try { await run(browser, base, W, H); } catch (e) { check('chạy hết kịch bản ' + W + 'x' + H, false, e.message.split('\n')[0]); }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
