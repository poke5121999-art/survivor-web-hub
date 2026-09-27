/*
 * POKÉONE — vỏ game: màn đầu, tạo nhân vật, HUD, menu, hộp thoại (js/title.js, js/creator.js, js/menus.js).
 *
 * Chạy:  node test/pokeone-shell.js
 * Chuột và phím thật (page.mouse / page.keyboard) trên index.html, ở 1280x720 và 844x390.
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/pokeone-shell-shots). Hợp đồng và chỗ khác bản gốc: games/pokeone/tools/README-shell.md.
 * Chưa có js/world.js thì bài kiểm đăng ký một cảnh 'world' giả ngay trong trang (chỉ gắn HUD, phát nhạc).
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

// Cảnh 'world' giả: chỉ khi trang chưa nạp js/world.js.
function stubWorld() {
  if (document.querySelector('script[src*="js/world.js"]')) return false;
  P1.scene.add('world', {
    mode: 'explore',
    enter() { this.hud = P1.ui.hud(); P1.audio.music('pallet_town'); },
    exit() { if (this.hud) this.hud.destroy(); },
    render() { const r = P1.renderer(); r.setClearColor(0x3a6b3a, 1); r.clear(); },
  });
  return true;
}

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  // Đếm phần tử <audio> nhạc do core.js tạo để đọc âm lượng thật sau khi kéo thanh trượt.
  await ctx.addInitScript(() => {
    const A = window.Audio;
    window.__audios = [];
    window.Audio = function (src) { const a = new A(src); window.__audios.push(a); return a; };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  let shotN = 0;
  const shot = async name => {
    await page.waitForTimeout(150);
    await page.evaluate(() => P1.ngui.ready());
    const f = path.join(SHOTS, tag + '-' + String(++shotN).padStart(2, '0') + '-' + name + '.png');
    await page.screenshot({ path: f });
  };
  // Tâm nút NGUI trên màn, và phần tử thật nằm trên cùng ở đó (phải là chính nút, không bị lớp khác đè).
  const at = (view, p) => page.evaluate(([view, p]) => {
    const v = view === 'scene' ? P1.scene.current.view : P1.ui.view(view);
    if (!v) return { err: 'view not open: ' + view };
    let n;
    const m = /^(.*)#(\d+)$/.exec(p);
    if (m) { const [par, name] = [m[1].split('/').slice(0, -1).join('/'), m[1].split('/').pop()]; n = v.find(par).kids.filter(k => k.name === name)[+m[2]]; }
    else n = v.find(p);
    if (!n || !n.el) return { err: 'node not found: ' + p };
    const b = n.el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, l: b.left, w: b.width, h: b.height, own: hit === n.el || n.el.contains(hit), hit: hit ? (hit.dataset.name || hit.tagName) : null };
  }, [view, p]);
  const click = async (view, p) => {
    const r = await at(view, p);
    if (r.err) throw new Error(r.err);
    if (!r.own) throw new Error('"' + p + '" is covered by ' + r.hit);
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(90);
  };
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const ev = f => page.evaluate(f);

  // ---------- màn đầu → tạo nhân vật → thế giới
  await page.goto(base + '/games/pokeone/index.html');
  await page.waitForFunction(() => window.P1 && P1.scene && P1.scene.name === 'title', null, { timeout: 30000 });
  const stubbed = await ev(stubWorld);
  out.push('    cảnh world: ' + (stubbed ? 'giả (chưa có js/world.js)' : 'js/world.js thật'));
  await page.waitForFunction(() => P1.titleBackdrop.ready, null, { timeout: 20000 }).catch(() => {});
  check('màn đầu: đảo 3D nạp xong, nhạc title', await ev(() => P1.titleBackdrop.ready && P1.audio.musicKey() === 'title'));
  check('màn đầu chưa có bản lưu: có New Game, không có Continue',
    await ev(() => { const v = P1.scene.current.view; return v.find('Button - New Game').activeInHierarchy && !v.find('Button - Login').activeInHierarchy; }));
  await shot('title');
  await click('scene', 'Button - New Game');
  await page.waitForFunction(() => P1.scene.name === 'creator');
  await shot('creator-start');
  const before = await ev(() => P1.scene.current.selection);
  await click('scene', 'Select - Hair/Button - Add');
  await click('scene', 'Select - Hair/Button - Add');
  await click('scene', 'Select - Skin/Button - Add');
  for (let i = 0; i < 3; i++) await click('scene', 'Select - Clothes/Button - Add');
  await click('scene', 'Select - Hat/Button - Add');
  await click('scene', 'Button - Female');
  const nameBox = await at('scene', 'Input - Name');
  await page.mouse.click(nameBox.x, nameBox.y);
  await page.keyboard.type('Leaf');
  const sel = await ev(() => P1.scene.current.selection);
  check('tạo nhân vật: đổi tóc, da, áo, mũ, giới tính bằng chuột; gõ tên',
    sel.name === 'Leaf' && sel.gender === 'female' && sel.look.hair !== before.look.hair && sel.look.body !== before.look.body &&
    sel.look.clothe !== before.look.clothe && sel.look.hat !== '', sel);
  const johto = await ev(() => P1.scene.current.view.find('Button - Johto').state);
  check('Johto hiện nhưng tắt', johto === 'disabled', johto);
  const uvs = new Set();
  for (let i = 0; i < 18; i++) { uvs.add(await ev(() => P1.scene.current.view.find('Character/Body').w.uv.join(','))); await page.waitForTimeout(150); }
  const rows = new Set([...uvs].map(u => u.split(',')[1])), cols = new Set([...uvs].map(u => u.split(',')[0]));
  check('hình xem trước: có bước chân (≥2 cột) và xoay hướng (≥2 hàng) trong 2,7 s', rows.size >= 2 && cols.size >= 2, [...uvs]);
  await shot('creator-edited');
  await click('scene', 'Button - Accept');
  await page.waitForFunction(() => P1.scene.name === 'world');
  // world thật mở đầu bằng lời Mẹ (mode 'script'); bấm qua tới khi được đi lại.
  for (let i = 0; i < 40 && !(await ev(() => !P1.scene.current.mode || P1.scene.current.mode === 'explore')); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(200);
  if (!(await ev(() => !!P1.ui.view('hud')))) await ev(() => { window.__hud = P1.ui.hud(); });
  check('vào world, người chơi đúng như đã tạo', await ev(() => P1.state.player.name === 'Leaf' && P1.state.player.gender === 'female' && P1.state.region === 'kanto'));

  // ---------- trạng thái mẫu
  await ev(() => {
    const s = P1.state, c = (d, l) => P1.mon.create(d, l, { ot: s.player.name });
    s.party = [c(1, 12), c(4, 10), c(16, 6)];
    s.party[1].hp = 3;
    s.party[2].status = 'psn';
    s.box = [c(19, 3), c(10, 4)];
    s.bag = { potion: 3, pokeball: 5, antidote: 1, oranberry: 2 };
    s.money = 5000;
    s.trainerExp = 300;
    [1, 4, 7, 10, 16, 19, 25].forEach(P1.seen);
    [1, 4, 16].forEach(P1.caught);
    P1.ui.refresh();
  });
  await shot('hud');

  // ---------- Esc → menu
  await page.keyboard.press('Escape');
  check('Esc mở Panel - Menu, isOpen() = true', await ev(() => P1.ui.top() === 'menu' && P1.ui.isOpen()));
  await shot('menu');
  await click('menu', 'Button - (1)');
  check('Save Game ghi bản lưu', await ev(() => P1.hasSave()));
  await click('menu', 'Button - (2)');
  check('Options mở từ menu', await ev(() => P1.ui.top() === 'options'));

  // ---------- Options: 4 thẻ, thanh trượt nhạc, danh sách thả xuống, phím
  await shot('options-graphics');
  await click('options', 'Button - Catagory (1)');
  const sl = await at('options', 'Grid/r00/Slider');
  await drag({ x: sl.l + sl.w * 0.3, y: sl.y }, { x: sl.l + sl.w * 0.8, y: sl.y });
  const vol = await ev(() => ({ s: P1.settings.sMusicVolume, alias: P1.settings.musicVolume,
    el: window.__audios.length ? window.__audios[window.__audios.length - 1].volume : null,
    saved: JSON.parse(localStorage.getItem('pokeone.settings.v1')).sMusicVolume }));
  check('kéo Music Volume tới 0,8: P1.settings, nhạc đang phát và localStorage cùng đổi',
    Math.abs(vol.s - 0.8) < 0.03 && Math.abs(vol.alias - vol.s) < 1e-9 && Math.abs(vol.el - vol.s) < 1e-6 && vol.saved === vol.s, vol);
  await shot('options-audio');
  await click('options', 'Button - Catagory (2)');
  await click('options', 'Grid/r00/Drop Down - Setting');
  await shot('options-popup');
  await click('options', 'Popup/popopt1');
  const cam = await ev(() => ({ k: P1.settings.sBattleCamera, b: P1.settings.battleCamera, label: P1.ui.view('options').find('Grid/r00/Drop Down - Setting/Label').w.text }));
  check('Battle Camera: chọn "Set" trong danh sách', cam.k === 1 && cam.b === false && cam.label === 'Set', cam);
  const hidden = await ev(() => P1.ui.view('options').find('Scroll View - Settings/Grid').kids.map(k => k.def.key));
  check('dòng offline (Chat Filter, Trade...) bị ẩn', !hidden.includes('sChatFilter') && !hidden.includes('sTrade') && hidden.includes('sBattleFlash'), hidden);
  await click('options', 'Button - Catagory (3)');
  const keyLabel = await ev(() => P1.ui.view('options').find('Grid/r01/Button - Set Key/Label').w.text);
  check('thẻ Controls hiện phím gán', /Up Arrow/.test(keyLabel) && /W/.test(keyLabel), keyLabel);
  await shot('options-controls');
  await click('options', 'Button - Close');
  check('đóng Options', await ev(() => !P1.ui.isOpen()));

  // ---------- túi đồ: Potion cho con đang yếu
  await click('hud', 'Interface Buttons/Button - Bag');
  check('biểu tượng túi mở Inventory', await ev(() => P1.ui.top() === 'bag'));
  await shot('bag');
  await click('bag', 'Tab - Medicine');
  await shot('bag-medicine');
  const hp0 = await ev(() => P1.state.party[1].hp);
  await click('bag', 'Grid/it00');
  await shot('bag-item');
  await click('item', 'Button - Use');
  await shot('bag-select');
  await click('select', 'Window/PokeButton#1');
  const used = await ev(() => ({ hp: P1.state.party[1].hp, max: P1.mon.stats(P1.state.party[1]).hp, potion: P1.state.bag.potion }));
  check('Potion hồi 20 HP cho Charmander, túi còn 2', used.hp === Math.min(used.max, hp0 + 20) && used.potion === 2, Object.assign({ hp0 }, used));
  await click('bag', 'Sprite Title Bar/Button - Close');

  // ---------- đội: thẻ Pokémon, các thẻ con, kéo đổi thứ tự trên HUD
  await click('hud', 'Table/Button - Pokemon');
  check('bấm HUD mở thẻ Pokémon', await ev(() => P1.ui.top() === 'party'));
  await shot('party-info');
  await click('party', 'Tab - Move');
  const moves = await ev(() => P1.ui.view('party').find('Pokemon Moves/Grid').kids.length);
  check('thẻ Moves có đủ chiêu', moves === (await ev(() => P1.state.party[0].moves.length)), moves);
  await shot('party-moves');
  await click('party', 'Tab - IV');
  const ivc = await ev(() => { const m = P1.state.party[0]; return { col: P1.mon.ivColor(m), name: P1.ui.view('party').find('Label - Pokemon Name').w.text }; });
  check('tên tô màu theo tổng IV (P1.mon.ivColor)', ivc.name.startsWith('['), ivc);
  await shot('party-ivs');
  await click('party', 'Tab - EV');
  await shot('party-evs');
  await click('party', 'Sprite Title Bar/Button - Close');
  const uids = await ev(() => P1.state.party.map(m => m.uid));
  await drag(await at('hud', 'Table/Button - Pokemon'), await at('hud', 'Table/Button - Pokemon (2)'));
  const uids2 = await ev(() => P1.state.party.map(m => m.uid));
  check('kéo chuột ô 1 sang ô 3 đổi chỗ trong đội', uids2[0] === uids[2] && uids2[2] === uids[0] && uids2[1] === uids[1], { uids, uids2 });
  check('kéo xong không mở thẻ', await ev(() => !P1.ui.isOpen()));

  // ---------- Pokédex, thẻ huấn luyện viên
  await click('hud', 'Interface Buttons/Button - Pokedex');
  check('Pokédex: đếm đã thấy 7, đã bắt 3', await ev(() => { const v = P1.ui.view('dex'); return v.find('Label - Scene').w.text === '7' && v.find('Label - Caught').w.text === '3'; }));
  await click('dex', 'Pokemons/dp01');
  check('chọn Charmander hiện mô tả', await ev(() => /Charmander/.test(P1.ui.view('dex').find('Label - Pokemon Name').w.text)));
  await shot('dex');
  await click('dex', 'Tab - Moves');
  await shot('dex-moves');
  await page.keyboard.press('Escape');
  check('Esc đóng cửa sổ đang mở', await ev(() => !P1.ui.isOpen()));
  await click('hud', 'Interface Buttons/Button - Trainer');
  check('thẻ huấn luyện viên: tên + số đã bắt', await ev(() => { const v = P1.ui.view('trainer'); return v.find('Label - Username').w.text === 'Leaf' && v.find('Label - Values').w.text.split('\n')[3] === '3'; }));
  await shot('trainer');
  await page.keyboard.press('Escape');

  // ---------- cửa hàng: mua 2 Poké Ball
  await ev(() => { window.__shop = 0; P1.ui.shop([{ id: 'pokeball', price: 200 }, { id: 'potion', price: 300 }, { id: 'greatball', price: 600 }]).then(() => { window.__shop = 1; }); });
  const m0 = await ev(() => ({ money: P1.state.money, balls: P1.state.bag.pokeball }));
  await click('shop', 'Grid/si00');
  await click('shop', 'Choose Amount/Button - Add');
  await shot('shop');
  await click('shop', 'Button - Buy');
  const m1 = await ev(() => ({ money: P1.state.money, balls: P1.state.bag.pokeball }));
  check('mua 2 Poké Ball: trừ 400, túi +2', m1.money === m0.money - 400 && m1.balls === m0.balls + 2, { m0, m1 });
  await click('shop', 'Button - Close (1)');
  check('đóng cửa hàng thì promise xong', await ev(() => window.__shop === 1));

  // ---------- hộp PC: rút ra bằng click, gửi vào bằng kéo từ HUD
  await ev(() => { P1.ui.open('pokebox'); });
  await shot('pokebox');
  await click('pokebox', 'BoxView/Grid/pb00');
  check('bấm Pokémon trong hộp: rút về đội', await ev(() => P1.state.party.length === 4 && P1.state.box.length === 1));
  await drag(await at('hud', 'Table/Button - Pokemon (3)'), await at('pokebox', 'BoxView'));
  check('kéo ô HUD thứ 4 vào hộp: gửi lại', await ev(() => P1.state.party.length === 3 && P1.state.box.length === 2));
  await shot('pokebox-after');
  await page.keyboard.press('Escape');

  // ---------- hồi máu
  await ev(() => { window.__healed = 0; P1.ui.heal().then(() => { window.__healed = 1; }); });
  await page.waitForTimeout(500);
  check('hồi máu: isOpen() khoá di chuyển lúc màn đen', await ev(() => P1.ui.isOpen()));
  await shot('heal');
  await page.waitForFunction(() => window.__healed === 1, null, { timeout: 10000 });
  check('hồi máu: cả đội đầy HP, hết trạng thái', await ev(() => P1.state.party.every(m => m.hp === P1.mon.stats(m).hp && !m.status)));

  // ---------- hộp thoại: gõ chữ, Space, chọn bằng phím 2
  await ev(() => { window.__said = 0; P1.dialog.say(['Hello there! Welcome to the world of POKéMON!', 'My name is OAK! People call me the POKéMON PROF!'], { name: 'Oak' }).then(() => { window.__said = 1; }); });
  await page.waitForTimeout(400);
  const partial = await ev(() => P1.ui.view('dialog').find('Label - Script Text').w.text);
  check('chữ hiện dần (TypewriterEffect 35 ký tự/giây)', /\[ffffff00\]/.test(partial), partial.slice(0, 60));
  await page.keyboard.press('Space');
  await shot('dialog');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  check('Space: bỏ qua gõ rồi sang trang, hết trang thì xong', await ev(() => window.__said === 1));
  await ev(() => { window.__pick = -1; P1.dialog.choose('Which Pokémon will you choose?', ['Bulbasaur', 'Charmander', 'Squirtle']).then(i => { window.__pick = i; }); });
  await page.waitForTimeout(900);
  await shot('choose');
  await page.keyboard.press('2');
  await page.waitForTimeout(100);
  check('chọn 3 đường bằng phím 2 → 1', await ev(() => window.__pick === 1));

  // ---------- học chiêu, tiến hoá
  await ev(() => { const m = P1.state.party.find(x => x.dex === 1); window.__lm = 'wait'; P1.ui.learnMove(m, 'razorleaf').then(i => { window.__lm = i; }); });
  await shot('learn-move');
  await click('learn', 'Button - Learn Move');
  check('quên chiêu 1 để học Razor Leaf', await ev(() => window.__lm === 0 && P1.state.party.find(x => x.dex === 1).moves[0].id === 'razorleaf'));
  await ev(() => { const m = P1.state.party.find(x => x.dex === 1); window.__ev = 'wait'; P1.ui.evolve(m, 2).then(b => { window.__ev = b; }); });
  await page.waitForTimeout(700);
  await shot('evolve');
  await click('evolve', 'Button - Yes');
  await page.waitForFunction(() => window.__ev !== 'wait', null, { timeout: 5000 });
  check('tiến hoá: Bulbasaur → Ivysaur', await ev(() => window.__ev === true && P1.state.party.some(m => m.dex === 2) && P1.state.dex.caught[2] === 1));

  // ---------- lưu, tải lại, Continue
  await page.keyboard.press('Escape');
  await click('menu', 'Button - (1)');
  const snap = await ev(() => JSON.stringify({ n: P1.state.player.name, p: P1.state.party.map(m => m.uid + m.dex), b: P1.state.bag, $: P1.state.money }));
  await page.reload();
  await page.waitForFunction(() => window.P1 && P1.scene && P1.scene.name === 'title', null, { timeout: 30000 });
  await ev(stubWorld);
  check('tải lại: màn đầu có Continue', await ev(() => P1.scene.current.view.find('Button - Login').activeInHierarchy));
  await page.waitForFunction(() => P1.titleBackdrop.ready, null, { timeout: 20000 }).catch(() => {});
  await shot('title-continue');
  await click('scene', 'Button - Login');
  await page.waitForFunction(() => P1.scene.name === 'world');
  const snap2 = await ev(() => JSON.stringify({ n: P1.state.player.name, p: P1.state.party.map(m => m.uid + m.dex), b: P1.state.bag, $: P1.state.money }));
  check('Continue nạp đúng bản đã lưu', snap === snap2, snap2);
  await page.waitForTimeout(200);
  await shot('continued');

  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 6).join(' | '));
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;   // BASE=<url Pages> để kiểm bản trên mạng
  const browser = await chromium.launch();
  try {
    for (const [W, H] of [[1280, 720], [844, 390]]) {
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
