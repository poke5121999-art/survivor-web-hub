/*
 * BỘ CRAWLER UI cho games/dragonproj (Săn Rồng).
 * Chạy: node test/dragonproj-uicrawl.js
 *
 * Khác với test/dragonproj-suite.js (kiểm luật chơi), file này đi BẤM THẬT mọi
 * nút đang hiển thị trên từng màn hình, rồi soi bốn thứ mà mắt người hay bỏ sót:
 *   1. lỗi console/pageerror sinh ra ĐÚNG lúc bấm nút nào, ở màn nào;
 *   2. chuỗi rác lọt ra giao diện ("undefined", "NaN", "[object Object]", "null")
 *      — đây là dấu hiệu một biến bị thiếu chứ không phải lỗi thẩm mỹ;
 *   3. tiền tệ âm — nghĩa là có đường trừ tiền không qua canPay;
 *   4. nút chết: bấm mà DOM không đổi, không toast, không đổi màn.
 * Sau đó là một loạt kiểm tra BẢO TOÀN TÀI NGUYÊN gọi thẳng API DP.*, và cuối
 * cùng là một lượt chơi từ số 0 do bot điều khiển.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const URL = root + '/games/dragonproj/index.html';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function note(s) { results.push(s); }

// Gom lại để in một cục ở cuối, thay vì đỏ 200 dòng cho cùng một lỗi.
const bugs = [];       // lỗi console/pageerror kèm ngữ cảnh nút
const dirty = [];      // chuỗi rác trên giao diện
const deadBtns = [];   // nút bấm không phản hồi
const negMoney = [];   // tiền tệ âm
const deadReal = [];   // nút chết thật sự (đã loại nút game cố ý khoá)
const ignoreErr = [];  // lỗi do test CỐ TÌNH tái hiện, không tính vào tổng cuối

/* ------------------------------------------------------------ MỞ TRANG -- */
async function open(b) {
  const ctx = await b.newContext({
    viewport: { width: 430, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  // hMenu dùng confirm(); nếu vô tình chạm phải thì đừng để treo cả phiên.
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto(URL);
  await p.waitForTimeout(900);
  return { ctx, p, errs };
}

/* Bơm tài nguyên để mọi nút "chế/nâng/mua" đều bấm được THẬT.
 * Nếu không làm bước này thì crawler chỉ đo được đường "không đủ tiền", tức là
 * bỏ sót đúng những nhánh code hay hỏng nhất. */
const SEED = () => {
  const S = DP.UI.save;
  S.gold = 9e6; S.gem = 9e4; S.ticket = 9e3; S.pikke = 9e4; S.medal = 9e3;
  ['str_stone', 'magi_frag', 'crystal', 'lapis_b', 'lapis_a', 'lapis_s', 'lapis_ss']
    .forEach(m => { S.mats[m] = 9999; });
  S.bossKills = { amarok: 5, lich: 5, grouton: 5 };
  // Một bộ đồ SS thật để mở hết nhánh giao diện (ô Magi thứ 3 chỉ hiện khi LB4).
  ['weapon', 'head', 'body', 'arm', 'leg'].forEach(k => {
    const r = DP.craft(S, 'amarok', k);
    if (r.ok) { for (let i = 0; i < 4; i++) DP.limitBreak(S, r.gear); r.gear.lv = DP.MAX_LV; }
  });
  S.bossKills = { amarok: 5, lich: 5, grouton: 5 };
  DP.summonMagi(S, 24, false);          // đủ Magi mọi hình dạng để nút "Lắp" có gì mà chọn
  S.inv = { gold_potion: 5, exp_potion: 5, luck_potion: 5, hunter_potion: 5 };
  DP.UI.saveNow(); DP.UI.show('home');
};

/* ------------------------------------------------- CÁC HÀM CHẠY TRONG TRANG */
// Danh sách phần tử bấm được đang hiển thị của một màn.
const SEL = 'button,[data-act],[data-gear],[data-map],[data-area],[data-craft],[data-buy],' +
  '[data-use],[data-slot],[data-putmagi],[data-upmagi],[data-nav],[data-filter],[data-w],' +
  '[data-wslot],[data-aslot],[data-cy],[data-buyp],[data-unslot]';

// Danh sách phần tử bấm được đang hiển thị của một màn.
const PAGE_LIST = (a) => {
  const scr = document.getElementById('scr-' + a.id);
  if (!scr) return [];
  const ATT = ['data-act', 'data-gear', 'data-map', 'data-area', 'data-craft', 'data-buy', 'data-use',
    'data-slot', 'data-putmagi', 'data-upmagi', 'data-nav', 'data-filter', 'data-w', 'data-wslot',
    'data-aslot', 'data-cy', 'data-buyp', 'data-unslot'];
  return Array.prototype.filter.call(scr.querySelectorAll(a.sel),
      el => el.offsetParent !== null && !el.disabled)
    .map(el => {
      const at = [];
      ATT.forEach(k => { if (el.hasAttribute(k)) at.push(k.slice(5) + '=' + el.getAttribute(k)); });
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      return { key: at.join(',') || el.tagName.toLowerCase(), txt: t,
               dis: /(^| )dis( |$)/.test(el.className),
               sel: /(^| )(sel|on)( |$)/.test(el.className) };
    });
};

// Bấm phần tử thứ idx của màn — tính lại danh sách ngay trong trang cho khớp.
const PAGE_CLICK = (a) => {
  const scr = document.getElementById('scr-' + a.id);
  const l = Array.prototype.filter.call(scr.querySelectorAll(a.sel),
    el => el.offsetParent !== null && !el.disabled);
  if (l[a.idx]) l[a.idx].click();
};

// Ảnh chụp trạng thái để so trước/sau khi bấm.
const PAGE_SNAP = () => {
  const S = DP.UI.save;
  const on = document.querySelector('#screens .screen.on');
  return {
    html: document.getElementById('screens').innerHTML.length + '|' +
          (on ? on.innerHTML.length + ':' + on.innerHTML.slice(0, 4000) : ''),
    scr: on ? on.id : '',
    toasts: document.getElementById('toasts').children.length,
    save: JSON.stringify(S),
    money: { gold: S.gold, gem: S.gem, ticket: S.ticket, pikke: S.pikke, medal: S.medal },
    text: on ? (on.innerText || '') : '',
    battle: !!DP.UI.battle
  };
};

/* ============================================================== CHẠY ===== */
(async () => {
  const b = await chromium.launch();
  const { ctx, p, errs } = await open(b);

  note('\n── nạp tài nguyên để crawl được sâu ──');
  await p.evaluate(SEED);
  await p.waitForTimeout(300);
  const seeded = await p.evaluate(() => ({
    gold: DP.UI.save.gold, gear: DP.UI.save.gear.length, magi: DP.UI.save.magi.length,
    lb: (DP.UI.save.gear.find(g => g.src === 'amarok' && g.kind === 'weapon') || {}).lb
  }));
  check('bơm được tài nguyên và đồ SS', seeded.gold > 1e6 && seeded.gear >= 9 && seeded.magi >= 24,
    seeded.gear + ' món, ' + seeded.magi + ' magi');
  check('vũ khí SS lên tới Limit Break 4 (mở ô Magi thứ 3)', seeded.lb === 4, 'lb=' + seeded.lb);

  /* ------------------------------------------------------------- CRAWL --- */
  // 'gear' không có đường vào trực tiếp: phải chọn một món trong Kho đồ trước.
  // Crawl hai biến thể (vũ khí / giáp) vì hai nhánh render khác hẳn nhau.
  async function openGear(filter) {
    await p.evaluate(async (f) => {
      DP.UI.show('armory');
      const fb = document.querySelector('#body-armory [data-filter="' + f + '"]');
      if (fb) fb.click();
      // Mở món SÂU nhất (limit break/cấp cao nhất) chứ không phải món đầu danh
      // sách: chỉ món limit break 4 mới hiện ô Magi thứ 3 và nút tiến hóa.
      const list = DP.UI.save.gear.filter(g => g.kind === f)
        .sort((a, b2) => (b2.lb - a.lb) || (b2.lv - a.lv));
      const el = list.length ? document.querySelector('#body-armory [data-gear="' + list[0].uid + '"]')
                             : document.querySelector('#body-armory [data-gear]');
      if (el) el.click();
    }, filter);
    await p.waitForTimeout(180);
  }
  // selMagiSlot là biến dùng chung của cả màn "gear". Nếu để nó treo ở một ô
  // không tồn tại trên món kế tiếp thì rGear() nổ ngay khi render (lỗi thật của
  // game — kiểm riêng bên dưới), nên trước mỗi lần đổi món phải đưa nó về -1.
  async function resetMagiSel() {
    await p.evaluate(() => {
      const s0 = document.querySelector('#body-gear [data-slot="0"]');
      if (s0) s0.click();
    });
    await p.waitForTimeout(90);
    await p.evaluate(() => {
      const pm = document.querySelector('#body-gear [data-putmagi]');
      if (pm) pm.click();
    });
    await p.waitForTimeout(90);
  }

  const TARGETS = [
    { id: 'home' }, { id: 'quest' }, { id: 'armory' }, { id: 'gacha' }, { id: 'more' },
    { id: 'forge' }, { id: 'magi' }, { id: 'shop' }, { id: 'help' }, { id: 'bosslist' },
    { id: 'gear', pre: 'weapon' }, { id: 'gear', pre: 'head' }
  ];
  const RUBBISH = ['undefined', 'NaN', '[object Object]'];

  note('\n── crawl mọi nút trên mọi màn hình ──');
  let clicks = 0;
  for (const T of TARGETS) {
    const tag = T.id + (T.pre ? '/' + T.pre : '');
    // Trước khi sang biến thể giáp phải đưa selMagiSlot về ô hợp lệ, nếu không
    // rGear() nổ ngay khi render (xem lỗi #1 trong báo cáo).
    if (T.id === 'gear') {
      await resetMagiSel();
      await openGear(T.pre);
      await resetMagiSel();
    }
    // Phải mở màn ra rồi mới đếm được nút: phần tử ẩn có offsetParent = null.
    await p.evaluate(id => DP.UI.show(id), T.id);
    await p.waitForTimeout(80);
    const n0 = await p.evaluate(PAGE_LIST, { id: T.id, sel: SEL });
    let scanned = 0;
    for (let i = 0; i < 140; i++) {
      // Render lại màn trước mỗi lần bấm để chỉ số i luôn trỏ đúng phần tử.
      if (T.id === 'gear') {
        await p.evaluate(() => DP.UI.show('gear'));
        // Trong lúc crawl có thể bấm trúng "Rã lấy Lapis" — món biến mất, màn
        // gear rỗng và crawl dừng sớm. Mở món khác để đi tiếp.
        const gone = await p.evaluate(() =>
          /Không tìm thấy/.test(document.getElementById('body-gear').innerText || ''));
        if (gone) { await openGear(T.pre); await resetMagiSel(); await p.evaluate(() => DP.UI.show('gear')); }
      } else await p.evaluate(id => DP.UI.show(id), T.id);
      await p.waitForTimeout(60);
      const list = await p.evaluate(PAGE_LIST, { id: T.id, sel: SEL });
      if (i >= list.length) break;
      const it = list[i];
      // Hai nút này nạp lại cả trang, crawl tới đâu mất trạng thái tới đó:
      //   act=wipe   → xoá save rồi reload (kiểm ở phần "chơi lại từ số 0")
      //   act=reload → nạp lại bản mới    (kiểm riêng ngay dưới vòng crawl)
      if (it.key.indexOf('act=wipe') >= 0 || it.key.indexOf('act=reload') >= 0) { scanned++; continue; }

      // Dọn toast cũ: toast tự tắt sau 1,75s, nên nếu không dọn thì một toast
      // hết hạn giữa hai lần chụp sẽ triệt tiêu toast mới và crawler báo nhầm
      // "nút chết". Đây là nguồn flaky đáng kể nhất của bộ này.
      await p.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
      const before = await p.evaluate(PAGE_SNAP);
      const e0 = errs.length;
      await p.evaluate(PAGE_CLICK, { id: T.id, sel: SEL, idx: i });
      await p.waitForTimeout(140);
      clicks++; scanned++;

      const label = tag + ' » ' + it.key + (it.txt ? ' «' + it.txt + '»' : '');
      if (errs.length > e0) bugs.push(label + '  →  ' + errs.slice(e0).join(' | '));

      const after = await p.evaluate(PAGE_SNAP);
      // 1. rác trên giao diện
      const found = RUBBISH.filter(r => after.text.indexOf(r) >= 0);
      if (/(^|[\s>(])null([\s<),.]|$)/.test(after.text)) found.push('null');
      if (found.length) {
        const ln = (after.text.split('\n').find(x => found.some(r => x.indexOf(r) >= 0)) || '').trim();
        dirty.push(label + '  →  ' + found.join(',') + '   dòng: "' + ln.slice(0, 90) + '"');
      }
      // 2. tiền tệ âm
      for (const k in after.money) if (after.money[k] < 0) negMoney.push(label + ' → ' + k + '=' + after.money[k]);
      // 3. nút chết
      let changed = after.html !== before.html || after.scr !== before.scr ||
        after.toasts > before.toasts || after.save !== before.save || after.battle !== before.battle;
      // Nút "Lắp"/"Đổi" của ô Magi chỉ đổi biến selMagiSlot rồi vẽ lại bảng chọn.
      // Hai ô CÙNG HÌNH DẠNG cho ra bảng chọn giống hệt nhau từng byte, nên so
      // HTML sẽ báo nhầm là nút chết. Ở đây coi là có phản hồi khi bảng chọn hiện
      // ra — còn chuyện bảng đó không nói rõ đang lắp vào ô nào thì kiểm riêng.
      if (!changed && it.key.indexOf('slot=') === 0 && /Lắp vào ô số/.test(after.text)) changed = true;
      const selfNav = it.key === 'nav=' + T.id;   // nav về chính màn đang đứng: không đổi là đúng
      if (!changed && !selfNav) {
        // .dis = nút game CỐ Ý khoá (map chưa mở, chưa đủ điều kiện nhận thưởng);
        // .sel/.on = nút đang phản ánh đúng trạng thái hiện tại (vùng đất đang chọn).
        const benign = it.dis || it.sel;
        deadBtns.push((benign ? '[cố ý khoá] ' : '[NGHI CHẾT] ') + label);
        if (!benign) deadReal.push(label);
      }

      // Nếu bị kéo vào trận thì thoát ra để crawl tiếp.
      if (after.battle) { await p.evaluate(() => DP.UI.leave()); await p.waitForTimeout(200); }
    }
    note('    · ' + tag + ': ' + scanned + '/' + n0.length + ' nút');
  }
  check('crawl chạy xong toàn bộ màn hình', clicks > 100, clicks + ' lần bấm');
  check('không có lỗi JS nào khi bấm nút', bugs.length === 0, bugs.length + ' nút gây lỗi');
  check('không có chuỗi rác (undefined/NaN/[object Object]/null) trên giao diện',
    dirty.length === 0, dirty.length + ' chỗ');
  check('không có tiền tệ nào âm sau khi bấm', negMoney.length === 0, negMoney.length + ' chỗ');
  // Bảng chọn Magi phải nói rõ đang lắp vào Ô SỐ MẤY. Nếu hai ô cùng hình dạng
  // thì bảng hiện ra giống hệt nhau và người chơi không biết mình đang lắp ô nào.
  const slotHint = await p.evaluate(() => {
    const deepest = DP.UI.save.gear.filter(g => g.kind === 'weapon')
      .sort((a, b2) => (b2.lb - a.lb) || (b2.lv - a.lv))[0];
    // Ép ba ô cùng hình dạng cho bài kiểm chạy ổn định: bể hình dạng của vũ khí
    // là ['star','star','heart','diamond'] nên ô trùng hình là chuyện thường gặp.
    deepest.shapes = ['star', 'star', 'star']; deepest.lb = 4;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    document.querySelector('#body-armory [data-gear="' + deepest.uid + '"]').click();
    const out = [];
    [0, 1, 2].forEach(i => {
      const btn = document.querySelector('#body-gear [data-slot="' + i + '"]');
      if (!btn) return;
      btn.click();
      const t = document.getElementById('body-gear').innerText || '';
      // Nhãn bảng chọn giờ là "Lắp vào ô số N — chọn Magi hình ...", và chính con số
      // ô là thứ bài kiểm này cần thấy khác nhau giữa ba lần bấm.
      const m = /Lắp vào ô số[^\n]*/.exec(t);
      out.push(m ? m[0] : '(không có bảng chọn)');
    });
    return { shapes: deepest.shapes.slice(), panels: out };
  });
  const uniq = new Set(slotHint.panels);
  check('bảng chọn Magi cho biết đang lắp vào Ô SỐ MẤY (ba ô cùng hình dạng)',
    slotHint.panels.length === 3 && uniq.size === 3,
    slotHint.panels.length + ' ô (' + slotHint.shapes.join('/') + ') nhưng chỉ ' + uniq.size +
    ' bảng khác nhau: ' + slotHint.panels.join(' | '));

  // Đã limit break tối đa mà nút vẫn ghi "Limit Break 5/4" và báo giá tiền.
  const lbText = await p.evaluate(() => {
    const g = DP.UI.save.gear.filter(x => x.lb >= 4).sort((a, b2) => b2.lb - a.lb)[0];
    if (!g) return null;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="' + g.kind + '"]').click();
    document.querySelector('#body-armory [data-gear="' + g.uid + '"]').click();
    const b = document.querySelector('#body-gear [data-act="lb"]');
    return { lb: g.lb, txt: (b ? b.innerText : '').replace(/\s+/g, ' ').trim() };
  });
  if (lbText) {
    check('món đã Limit Break tối đa không còn hiện "5/4" và giá tiền',
      !/5\/4/.test(lbText.txt), 'lb=' + lbText.lb + ' → nút ghi: "' + lbText.txt + '"');
  }

  // Nút ⟳ trên thanh hub: nạp lại trang bằng ?fresh=… nhưng PHẢI lưu trước,
  // nếu không người chơi bấm nhầm là mất tiến độ của phiên đang chơi.
  await p.evaluate(() => { DP.UI.show('home'); DP.UI.save.gold = 424242; });
  await Promise.all([
    p.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    p.evaluate(() => document.querySelector('#scr-home [data-act="reload"]').click())
  ]);
  await p.waitForTimeout(1100);
  const afterReload = await p.evaluate(() => ({ gold: DP.UI.save.gold, url: location.search }));
  check('nút ⟳ nạp lại trang và GIỮ tiến độ', afterReload.gold === 424242,
    'gold sau khi nạp lại = ' + afterReload.gold);
  check('nút ⟳ có nạp lại thật (đổi query ?fresh=)', /fresh=/.test(afterReload.url), afterReload.url);
  await p.evaluate(SEED); await p.waitForTimeout(250);

  check('không có nút chết (bỏ qua nút game cố ý khoá)', deadReal.length === 0,
    deadReal.length + ' nghi chết / ' + deadBtns.length + ' bấm mà không đổi gì');

  /* ------------------------------------ LỖI ĐÃ BIẾT: ô Magi 3 của giáp ---- */
  // Giáp chỉ có 2 hình dạng ô (shapes = ['circle','circle']) nhưng rGear() luôn vẽ
  // 3 dòng => dòng thứ 3 đọc g.shapes[2] === undefined. Kiểm riêng cho rõ.
  note('\n── ô Magi thứ 3 của giáp ──');
  // Crawl ở trên có bấm cả nút "Rã lấy Lapis" nên bộ đồ SS có thể đã biến mất —
  // nạp lại trước khi kiểm, để bài kiểm này luôn chạy trên cùng một tình huống.
  await p.evaluate(SEED); await p.waitForTimeout(300);
  const armorSlot = await p.evaluate(() => {
    const S = DP.UI.save;
    const g = S.gear.find(x => x.kind === 'head');
    return { shapes: g.shapes.slice(), len: g.shapes.length };
  });
  const armorTxt = await p.evaluate(() => {
    const S = DP.UI.save;
    const g = S.gear.find(x => x.kind === 'head');
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="head"]').click();
    document.querySelector('#body-armory [data-gear="' + g.uid + '"]').click();
    return document.getElementById('body-gear').innerText || '';
  });
  check('màn chi tiết GIÁP không lòi chữ "undefined" ở ô Magi',
    armorTxt.indexOf('undefined') < 0 && armorTxt.length > 40,
    'giáp có ' + armorSlot.len + ' hình dạng ô (' + armorSlot.shapes.join(', ') +
    ') — đúng thiết kế: 1 ô, ô thứ 2 mở khi limit break 4');

  // Và cú nổ khi selMagiSlot=2 còn treo lại rồi mở một món giáp.
  // window.onerror trên file:// bị bóp thành "Script error." — nên bắt lỗi bằng
  // pageerror của Playwright, chính xác tới tận thông điệp.
  const eCrash = errs.length;
  const crash = await p.evaluate(async () => {
    let err = null;
    const deepest = k => DP.UI.save.gear.filter(g => g.kind === k)
      .sort((a, b2) => (b2.lb - a.lb) || (b2.lv - a.lv))[0];
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    document.querySelector('#body-armory [data-gear="' + deepest('weapon').uid + '"]').click();
    const s2 = document.querySelector('#body-gear [data-slot="2"]');
    if (!s2) return { skipped: true };
    s2.click();                                   // chọn ô thứ 3 của VŨ KHÍ
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="head"]').click();
    try { document.querySelector('#body-armory [data-gear="' + deepest('head').uid + '"]').click(); }
    catch (e) { err = e.message; }
    const body = document.getElementById('body-gear').innerText || '';
    return { err: err, empty: body.length < 20 };
  });
  await p.waitForTimeout(200);
  const crashErrs = errs.slice(eCrash);
  crashErrs.forEach(x => ignoreErr.push(x));
  check('chọn ô 3 của vũ khí rồi mở một món GIÁP không làm nổ màn hình',
    !crash.skipped && !crash.err && !crash.empty && crashErrs.length === 0,
    crashErrs[0] || crash.err || (crash.empty ? 'màn gear rỗng' : 'ok'));
  await p.evaluate(SEED); await p.waitForTimeout(200);

  /* ------------------------------------------- BẢO TOÀN TÀI NGUYÊN ------- */
  note('\n── bảo toàn tài nguyên (gọi thẳng API DP.*) ──');
  // Mọi phép dưới đây chạy trên một save nháp, không đụng save thật, để nếu
  // crawler ở trên có làm bẩn dữ liệu thì kết quả vẫn sạch.
  const eco = await p.evaluate(() => {
    const mk = () => {
      const s = DP.starterKit(DP.newSave('T'));
      s.gold = 5e6; s.gem = 5e3; s.ticket = 500; s.pikke = 5e4;
      ['str_stone', 'magi_frag', 'crystal', 'lapis_b', 'lapis_a', 'lapis_s', 'lapis_ss']
        .forEach(m => { s.mats[m] = 500; });
      s.bossKills = { amarok: 5 };
      return s;
    };
    const out = {};

    // --- ENHANCE: trừ đúng gold + str_stone ---
    let s = mk(); let g = DP.craft(s, 'amarok', 'weapon').gear;
    let c = DP.enhanceCost(g), g0 = s.gold, m0 = s.mats.str_stone, lv0 = g.lv;
    let r = DP.enhance(s, g);
    out.enhance = { ok: r.ok, gold: g0 - s.gold === c.gold, mat: m0 - s.mats.str_stone === c.mat.str_stone,
                    lv: g.lv === lv0 + 1 };
    // hết tiền thì phải từ chối, và không được đụng vào gì
    s.gold = 0; g0 = s.gold; m0 = s.mats.str_stone; lv0 = g.lv;
    r = DP.enhance(s, g);
    out.enhanceBroke = { ok: r.ok === false, untouched: s.gold === g0 && s.mats.str_stone === m0 && g.lv === lv0 };

    // --- LIMIT BREAK ---
    s = mk(); g = DP.craft(s, 'amarok', 'weapon').gear;
    c = DP.limitBreakCost(g); g0 = s.gold; m0 = s.mats.lapis_ss;
    r = DP.limitBreak(s, g);
    out.lb = { ok: r.ok, gold: g0 - s.gold === c.gold, mat: m0 - s.mats.lapis_ss === c.mat.lapis_ss, lb: g.lb === 1 };
    s.mats.lapis_ss = 0; g0 = s.gold;
    r = DP.limitBreak(s, g);
    out.lbBroke = { ok: r.ok === false, untouched: s.gold === g0 && g.lb === 1 };

    // --- EVOLVE ---
    s = mk(); g = DP.craft(s, 'amarok', 'weapon').gear; g.lv = DP.MAX_LV;
    c = DP.evolveCost(g); g0 = s.gold; m0 = s.mats.crystal;
    r = DP.evolve(s, g);
    out.evo = { ok: r.ok, gold: g0 - s.gold === c.gold, mat: m0 - s.mats.crystal === c.mat.crystal,
                reset: g.lv === 1 && g.evo === 1 };
    s.mats.crystal = 0; g.lv = DP.MAX_LV; g0 = s.gold;
    r = DP.evolve(s, g);
    out.evoBroke = { ok: r.ok === false, untouched: s.gold === g0 && g.evo === 1 };

    // --- REROLL ability ---
    s = mk(); g = DP.craft(s, 'amarok', 'weapon').gear;
    c = DP.rerollCost(g); g0 = s.gold;
    r = DP.reroll(s, g);
    out.rr = { ok: r.ok, gold: g0 - s.gold === c.gold };
    s.gold = c.gold - 1; g0 = s.gold;
    r = DP.reroll(s, g);
    out.rrBroke = { ok: r.ok === false, untouched: s.gold === g0 };

    // --- CRAFT: trừ gold + đúng 1 Tablet ---
    s = mk();
    const bh = DP.behemothById('amarok');
    c = DP.craftCost(bh, 'head'); g0 = s.gold; const t0 = s.bossKills.amarok;
    r = DP.craft(s, 'amarok', 'head');
    out.craft = { ok: r.ok, gold: g0 - s.gold === c.gold, tablet: t0 - s.bossKills.amarok === 1 };
    // không đủ gold thì KHÔNG được ăn mất Tablet
    s.gold = 0; const t1 = s.bossKills.amarok;
    r = DP.craft(s, 'amarok', 'body');
    out.craftBroke = { ok: r.ok === false, tablet: s.bossKills.amarok === t1, gold: s.gold === 0 };
    // chế trùng món phải bị chặn
    s.gold = 5e6; const t2 = s.bossKills.amarok;
    r = DP.craft(s, 'amarok', 'head');
    out.craftDup = { ok: r.ok === false, tablet: s.bossKills.amarok === t2 };

    // --- MAGI ---
    s = mk();
    let inst = s.magi[0];
    c = DP.magiEnhanceCost({ rank: DP.magiById(inst.id).rank, lv: inst.lv });
    g0 = s.gold; m0 = s.mats.magi_frag;
    r = DP.enhanceMagi(s, inst);
    out.magi = { ok: r.ok, gold: g0 - s.gold === c.gold, mat: m0 - s.mats.magi_frag === c.mat.magi_frag,
                 lv: inst.lv === 2 };
    s.mats.magi_frag = 0; g0 = s.gold; const ml = inst.lv;
    r = DP.enhanceMagi(s, inst);
    out.magiBroke = { ok: r.ok === false, untouched: s.gold === g0 && inst.lv === ml };

    // --- GỌI HAI LẦN VỚI TÀI NGUYÊN CHỈ ĐỦ MỘT LẦN ---
    s = mk(); g = DP.craft(s, 'amarok', 'weapon').gear;
    c = DP.enhanceCost(g); s.gold = c.gold; s.mats.str_stone = c.mat.str_stone;
    const a1 = DP.enhance(s, g), a2 = DP.enhance(s, g);
    out.twice = { first: a1.ok === true, second: a2.ok === false,
                  gold: s.gold === 0, mat: s.mats.str_stone === 0, lv: g.lv === 2 };

    // --- USE POTION: một bình chỉ dùng được một lần ---
    s = mk(); s.inv.gold_potion = 1;
    const p1 = DP.usePotion(s, 'gold_potion'), p2 = DP.usePotion(s, 'gold_potion');
    out.potion = { first: p1.ok === true, second: p2.ok === false, inv: s.inv.gold_potion === 0 };

    // --- canPay=false thì mọi hàm phải trả ok:false ---
    s = mk(); g = DP.craft(s, 'amarok', 'weapon').gear; g.lv = DP.MAX_LV;
    s.gold = 0; s.mats = {};
    out.allRefuse = [DP.enhance(s, g), DP.limitBreak(s, g), DP.evolve(s, g), DP.reroll(s, g),
                     DP.enhanceMagi(s, s.magi[0])].every(x => x.ok === false);

    // --- DISMANTLE: gỡ khỏi loadout, trả Magi về kho, không để magi mồ côi ---
    s = mk();
    const w = s.gear.find(x => x.kind === 'weapon');
    const magiOn = w.magi.filter(Boolean).slice();
    const wasEquipped = s.loadout.weapons.indexOf(w.uid) >= 0;
    const nMagi = s.magi.length;
    const dr = DP.dismantle(s, w);
    const stillInLoadout = JSON.stringify(s.loadout).indexOf(w.uid) >= 0;
    const stillInBag = s.gear.some(x => x.uid === w.uid);
    const orphan = magiOn.some(u => s.gear.some(x => x.magi.indexOf(u) >= 0));
    const magiKept = magiOn.every(u => s.magi.some(m => m.uid === u));
    out.dis = { ok: dr.ok, wasEquipped: wasEquipped, gotLapis: (s.mats[dr.lapis] || 0) >= dr.n,
                outLoadout: !stillInLoadout, outBag: !stillInBag, orphan: orphan,
                magiKept: magiKept, count: s.magi.length === nMagi };

    // --- EQUIP MAGI: một viên không được nằm ở hai chỗ ---
    s = mk();
    const w2 = s.gear.find(x => x.kind === 'weapon');
    const star = s.magi.find(m => DP.magiById(m.id).shape === 'star');
    // ép cả hai ô đầu của vũ khí cùng hình 'star' rồi thử lắp một viên vào cả hai
    w2.shapes = ['star', 'star', 'star'];
    DP.equipMagi(s, w2, 0, star.uid);
    DP.equipMagi(s, w2, 1, star.uid);
    const twoPlaces = w2.magi.filter(u => u === star.uid).length;
    // và sang một món khác
    const w3 = DP.craft(s, 'amarok', 'weapon').gear; w3.shapes = ['star', 'star', 'star'];
    s.gear.push;
    DP.equipMagi(s, w3, 0, star.uid);
    const across = s.gear.reduce((n, x) => n + x.magi.filter(u => u === star.uid).length, 0);
    out.eqMagi = { single: twoPlaces === 1, across: across === 1 };
    // ô chưa mở thì không được lắp
    const armor = s.gear.find(x => x.kind === 'head');
    out.lockedSlot = DP.equipMagi(s, armor, 1, null).ok === false;

    return out;
  });

  check('nâng cấp trừ đúng gold + nguyên liệu', eco.enhance.ok && eco.enhance.gold && eco.enhance.mat && eco.enhance.lv,
    JSON.stringify(eco.enhance));
  check('nâng cấp khi hết tiền: từ chối và không đụng gì', eco.enhanceBroke.ok && eco.enhanceBroke.untouched);
  check('limit break trừ đúng gold + Lapis', eco.lb.ok && eco.lb.gold && eco.lb.mat && eco.lb.lb, JSON.stringify(eco.lb));
  check('limit break khi hết Lapis: từ chối, không trừ gold', eco.lbBroke.ok && eco.lbBroke.untouched);
  check('tiến hóa trừ đúng gold + Crystal và reset Lv', eco.evo.ok && eco.evo.gold && eco.evo.mat && eco.evo.reset,
    JSON.stringify(eco.evo));
  check('tiến hóa khi hết Crystal: từ chối, không trừ gold', eco.evoBroke.ok && eco.evoBroke.untouched);
  check('đổi ability trừ đúng gold', eco.rr.ok && eco.rr.gold);
  check('đổi ability khi thiếu 1 gold: từ chối', eco.rrBroke.ok && eco.rrBroke.untouched);
  check('chế đồ trừ đúng gold + đúng 1 Tablet', eco.craft.ok && eco.craft.gold && eco.craft.tablet,
    JSON.stringify(eco.craft));
  check('chế đồ khi không đủ gold: KHÔNG ăn mất Tablet', eco.craftBroke.ok && eco.craftBroke.tablet && eco.craftBroke.gold,
    JSON.stringify(eco.craftBroke));
  check('chế trùng món: từ chối và không mất Tablet', eco.craftDup.ok && eco.craftDup.tablet);
  check('nâng Magi trừ đúng gold + mảnh', eco.magi.ok && eco.magi.gold && eco.magi.mat && eco.magi.lv,
    JSON.stringify(eco.magi));
  check('nâng Magi khi hết mảnh: từ chối, không trừ gold', eco.magiBroke.ok && eco.magiBroke.untouched);
  check('gọi hai lần với tài nguyên đủ MỘT lần: lần hai fail, không âm',
    eco.twice.first && eco.twice.second && eco.twice.gold && eco.twice.mat && eco.twice.lv,
    JSON.stringify(eco.twice));
  check('một bình chỉ uống được một lần', eco.potion.first && eco.potion.second && eco.potion.inv);
  check('canPay=false thì mọi hàm nâng cấp đều trả ok:false', eco.allRefuse);
  check('rã đồ: gỡ khỏi loadout', eco.dis.wasEquipped && eco.dis.outLoadout);
  check('rã đồ: biến mất khỏi túi và nhận Lapis', eco.dis.outBag && eco.dis.gotLapis);
  check('rã đồ: KHÔNG để Magi mồ côi (không món nào còn tham chiếu uid đã rã)',
    !eco.dis.orphan && eco.dis.magiKept && eco.dis.count);
  check('một viên Magi không nằm ở hai ô cùng lúc', eco.eqMagi.single, 'trong cùng một món');
  check('một viên Magi không nằm ở hai MÓN cùng lúc', eco.eqMagi.across);
  check('ô Magi chưa mở thì không lắp được', eco.lockedSlot);

  /* ------------------------------------- MUA Ở TIỆM (đường đi qua UI) ---- */
  note('\n── tiệm Pikke: đường mua đi qua nút thật ──');
  const shop = await p.evaluate(async () => {
    const S = DP.UI.save;
    const it = DP.SHOP.find(x => x.id === 'p_gold');   // 10.000 Gold, giá 500 Pikke
    DP.UI.show('shop');
    // 1) thiếu 1 Pikke -> không được mua
    S.pikke = it.price.pikke - 1; DP.UI.show('shop');
    let g0 = S.gold;
    document.querySelector('#body-shop [data-buy="p_gold"]').click();
    const poor = { pikke: S.pikke === it.price.pikke - 1, gold: S.gold === g0 };
    // 2) đủ đúng 1 lần -> mua được, và lần hai phải trượt
    S.pikke = it.price.pikke; DP.UI.show('shop'); g0 = S.gold;
    document.querySelector('#body-shop [data-buy="p_gold"]').click();
    const one = { pikke: S.pikke === 0, gold: S.gold === g0 + it.give.gold };
    DP.UI.show('shop'); g0 = S.gold;
    document.querySelector('#body-shop [data-buy="p_gold"]').click();
    const two = { pikke: S.pikke === 0, gold: S.gold === g0 };
    // 3) bình cao cấp mua bằng Gem
    const P = DP.ITEMS.hunter_potion;
    S.gem = P.price.gem - 1; DP.UI.show('shop');
    const inv0 = S.inv.hunter_potion || 0;
    document.querySelector('#body-shop [data-buyp="hunter_potion"]').click();
    const gemPoor = { gem: S.gem === P.price.gem - 1, inv: (S.inv.hunter_potion || 0) === inv0 };
    S.gem = P.price.gem; DP.UI.show('shop');
    document.querySelector('#body-shop [data-buyp="hunter_potion"]').click();
    const gemOk = { gem: S.gem === 0, inv: (S.inv.hunter_potion || 0) === inv0 + 1 };
    return { poor, one, two, gemPoor, gemOk };
  });
  check('thiếu Pikke thì nút mua không trừ gì', shop.poor.pikke && shop.poor.gold);
  check('đủ Pikke thì mua đúng một lần, trừ đúng giá', shop.one.pikke && shop.one.gold);
  check('bấm mua lần hai khi đã hết Pikke: không được gì, không âm', shop.two.pikke && shop.two.gold);
  check('thiếu Gem thì không mua được bình cao cấp', shop.gemPoor.gem && shop.gemPoor.inv);
  check('đủ Gem thì mua được đúng một bình', shop.gemOk.gem && shop.gemOk.inv);

  /* ---------------------------------------- GACHA: vé/gem trừ đúng ------- */
  note('\n── gacha: vé và gem ──');
  const gac = await p.evaluate(() => {
    const S = DP.UI.save;
    S.ticket = 50; S.gem = 250; S.magi = []; DP.UI.show('gacha');
    const m0 = S.magi.length;
    document.querySelector('#body-gacha [data-act="b10"]').click();
    const t = { ticket: S.ticket === 0, pending: !!S.pendingBoss };
    DP.UI.show('gacha');
    document.querySelector('#body-gacha [data-act="b10"]').click();   // hết vé
    const t2 = S.ticket === 0;
    DP.UI.show('gacha');
    document.querySelector('#body-gacha [data-act="m10"]').click();
    const g = { gem: S.gem === 0, magi: S.magi.length === m0 + 11 };
    DP.UI.show('gacha');
    document.querySelector('#body-gacha [data-act="m10"]').click();   // hết gem
    const g2 = { gem: S.gem === 0, magi: S.magi.length === m0 + 11 };
    return { t, t2, g, g2 };
  });
  check('quay 10+1 boss trừ đúng 50 vé và đưa một con lên chờ', gac.t.ticket && gac.t.pending);
  check('hết vé thì không quay được nữa (vé không âm)', gac.t2);
  check('quay 10+1 magi trừ đúng 250 Gem và vào kho 11 viên', gac.g.gem && gac.g.magi);
  check('hết Gem thì không quay được nữa (gem không âm, kho không tăng)', gac.g2.gem && gac.g2.magi);

  /* ================================ LUỒNG ĐẦU-CUỐI: chơi lại từ số 0 ===== */
  note('\n── chơi lại từ số 0 (bot điều khiển) ──');
  // Xoá dữ liệu bằng CHÍNH nút trong màn "Khác" — đây cũng là nút duy nhất
  // crawler ở trên bỏ qua, vì nó reload cả trang.
  await p.evaluate(() => { DP.UI.show('more'); });
  await p.waitForTimeout(150);
  await Promise.all([
    p.waitForNavigation({ timeout: 15000 }).catch(() => {}),
    p.evaluate(() => document.querySelector('#body-more [data-act="wipe"]').click())
  ]);
  await p.waitForTimeout(1200);
  const fresh = await p.evaluate(() => {
    const S = DP.UI.save;
    return { gold: S.gold, lv: S.lv, gear: S.gear.length, boss: Object.keys(S.bossKills).length,
             scr: (document.querySelector('#screens .screen.on') || {}).id };
  });
  check('nút "Xóa dữ liệu" đưa game về đúng trạng thái mới tinh',
    fresh.gold === 3000 && fresh.lv === 1 && fresh.gear === 5 && fresh.boss === 0,
    JSON.stringify(fresh));

  // --- FIELD: vào map đầu, bot cày 25 giây ---
  await p.evaluate(() => {
    DP.UI.startField('tior', 0);
    // Chốt lại kết quả ngay khi màn kết thúc hiện ra, và tắt bot để nó đừng
    // bấm "Về Guild" mất trước khi test kịp đọc.
    window.__res = null;
    const el = document.getElementById('resultScr');
    new MutationObserver(() => {
      if (el.classList.contains('on') && !window.__res) {
        window.__res = { text: el.innerText, save: JSON.parse(JSON.stringify(DP.UI.save)) };
        DPBot.off();
      }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await p.waitForTimeout(400);
  check('vào được map đầu', await p.evaluate(() => !!(DP.UI.battle && DP.UI.battle.running)));

  const eField = errs.length;
  await p.evaluate(() => DPBot.on(140));
  const track = { kill: 0, gold: 0, mats: 0, moved: 0, stuckSamples: 0, chests: 0 };
  let lastPos = null;
  for (let t = 0; t < 25; t++) {
    await p.waitForTimeout(1000);
    const s = await p.evaluate(() => {
      const b = DP.UI.battle;
      if (!b) return null;
      return { killed: b.killed || 0, x: Math.round(b.player.x), y: Math.round(b.player.y),
               bag: b.bag || { gold: 0, mats: {} }, mode: b.mode, hp: b.player.hp,
               chests: b.chests.length, running: b.running };
    });
    if (!s) break;
    track.kill = Math.max(track.kill, s.killed);
    track.gold = Math.max(track.gold, s.bag.gold || 0);
    track.mats = Math.max(track.mats, Object.keys(s.bag.mats || {}).length);
    track.chests = s.chests;                 // số rương CÒN NẰM TRÊN ĐẤT lúc lấy mẫu
    if (lastPos && Math.hypot(s.x - lastPos.x, s.y - lastPos.y) < 4) track.stuckSamples++;
    else track.moved++;
    lastPos = s;
    if (!s.running) break;
  }
  await p.evaluate(() => DPBot.off());
  check('bot giết được quái trong map', track.kill > 0,
    track.kill + ' con, nhặt được ' + track.gold + ' gold / ' + track.mats +
    ' loại nguyên liệu, còn ' + track.chests + ' rương nằm trên đất');
  check('bot không bị kẹt một chỗ', track.moved >= 8,
    track.moved + ' lần di chuyển / ' + track.stuckSamples + ' lần đứng yên');
  const noJs = errs.slice(eField).filter(e => e.indexOf('PAGEERROR') === 0);
  check('cày map 25 giây không sinh lỗi JS', noJs.length === 0, noJs.slice(0, 2).join(' | '));

  // Thí nghiệm có kiểm soát, không phụ thuộc may rủi của bot: đặt người chơi
  // đứng ĐÚNG tầm với của vũ khí — tức đúng chỗ đứng lúc đánh — rồi giết con
  // quái đó và đứng yên. Rương rơi ngay chỗ quái chết, cách người chơi bằng tầm
  // với (kiếm 62px), trong khi bán kính nhặt chỉ 32px (game.js:1043).
  await p.evaluate(() => { DP.UI.startField('tior', 0); });
  await p.waitForTimeout(500);
  const loot = await p.evaluate(() => new Promise(res => {
    const bt = DP.UI.battle, pl = bt.player;
    // Không phụ thuộc vào việc map còn quái sống hay không: đồng đội NPC có thể đã
    // dọn sạch trước khi tới đây. Tự dựng một con để bài kiểm luôn chạy y hệt nhau.
    let m = bt.mobs.find(x => !x.dead);
    if (!m) { m = bt.makeMob('purun', 1, false, false); bt.mobs.push(m); }
    m.x = bt.wW / 2; m.y = bt.wH / 2;
    const a = Math.atan2(pl.y - m.y, pl.x - m.x);
    pl.x = m.x + Math.cos(a) * bt.W.reach;
    pl.y = m.y + Math.sin(a) * bt.W.reach;
    bt.chests.length = 0;
    bt.killMob(m);
    var mine = bt.chests[bt.chests.length - 1];   // đúng rương của con vừa giết
    setTimeout(function () {
      res({ reach: bt.W.reach, left: bt.chests.indexOf(mine) >= 0 ? 1 : 0,
            reaches: Object.keys(DP.WEAPONS).map(k => k + '=' + DP.WEAPONS[k].reach).join(' ') });
    }, 800);
  }));
  check('giết quái ở đúng tầm đánh thì nhặt được rương nó rơi ra',
    !!loot && loot.left === 0,
    loot ? ('đứng cách xác quái ' + loot.reach + 'px, rương tự hút về và nhặt được — tầm với: ' +
            loot.reaches) : 'không tìm được quái để thử');

  // --- BOSS: grouton lv8 ---
  await p.evaluate(() => {
    const el = document.getElementById('resultScr');
    el.classList.remove('on');
    window.__res = null;
    DP.UI.startBoss('grouton', 8, false);
  });
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => {
    const S = DP.UI.save;
    return { gold: S.gold, gem: S.gem, medal: S.medal, kills: S.bossKills.grouton || 0,
             hp: DP.UI.battle.boss.hp, maxHp: DP.UI.battle.boss.maxHp };
  });
  // Rương rơi khi PHÁ BỘ PHẬN (game.js:579) được đẩy vào this.chests, nhưng
  // vòng nhặt rương chỉ nằm trong updateField() — trận boss gọi updateBoss()
  // nên rương đó không bao giờ nhặt được, cũng không bao giờ tự biến mất.
  await p.evaluate(() => {
    const bt = DP.UI.battle;
    bt.chests.length = 0;
    bt.chests.push({ x: bt.player.x, y: bt.player.y, kind: 'red', t: 0, mat: null, part: true });
  });
  await p.waitForTimeout(600);
  const bossChest = await p.evaluate(() => (DP.UI.battle ? DP.UI.battle.chests.length : -1));
  check('trong trận boss, rương nằm ngay dưới chân vẫn nhặt được', bossChest === 0,
    bossChest + ' rương còn nguyên sau 0,6s đứng đè lên');

  await p.evaluate(() => DPBot.on(140));
  let done = false;
  for (let t = 0; t < 40; t++) {
    await p.waitForTimeout(1000);
    done = await p.evaluate(() => !!window.__res);
    if (done) break;
  }
  const midHp = done ? 0 : await p.evaluate(() => (DP.UI.battle && DP.UI.battle.boss) ? DP.UI.battle.boss.hp : 0);
  check('bot đánh boss có tiến triển rõ rệt', done || midHp < before.hp * 0.7,
    done ? 'hạ xong trong 40s' : Math.round((1 - midHp / before.maxHp) * 100) + '% máu boss');

  if (!done) {
    // Bot chưa kịp hạ trong 40s: kết liễu bằng API để vẫn kiểm được đường TRẢ
    // THƯỞNG (đây là kiểm luồng phần thưởng, không phải giả kết quả của bot).
    await p.evaluate(() => {
      DPBot.off();
      const b = DP.UI.battle;
      b.player.usedMagi = true;
      b.dealToBoss({ phys: 9e9, elem: 0, el: 'none' }, b.boss.x, b.boss.y, {});
    });
    for (let t = 0; t < 8 && !done; t++) { await p.waitForTimeout(500); done = await p.evaluate(() => !!window.__res); }
  }
  await p.evaluate(() => DPBot.off());

  const res = await p.evaluate(() => window.__res);
  check('màn kết quả hiện ra sau khi hạ boss', !!res && /HẠ GỤC/.test(res.text || ''),
    res ? (res.text || '').split('\n')[0] : 'không thấy màn kết quả');
  if (res) {
    const S2 = res.save;
    check('phần thưởng được cộng vào save: Tablet của grouton',
      (S2.bossKills.grouton || 0) > before.kills, before.kills + ' → ' + (S2.bossKills.grouton || 0));
    check('phần thưởng được cộng vào save: Gold tăng', S2.gold > before.gold,
      before.gold + ' → ' + S2.gold);
    check('phần thưởng được cộng vào save: Gem/Medal tăng',
      S2.gem >= before.gem && S2.medal > before.medal, 'gem ' + before.gem + '→' + S2.gem +
      ', medal ' + before.medal + '→' + S2.medal);
    check('màn kết quả không lộ chuỗi rác', !/undefined|NaN|\[object Object\]/.test(res.text || ''),
      (res.text || '').split('\n').find(x => /undefined|NaN/.test(x)) || 'sạch');
    // Lưu rồi nạp lại: phần thưởng phải còn.
    await p.evaluate(() => DP.UI.saveNow());
    await p.reload(); await p.waitForTimeout(900);
    const kept = await p.evaluate(() => ({ gold: DP.UI.save.gold, kills: DP.UI.save.bossKills.grouton || 0 }));
    check('phần thưởng còn nguyên sau khi nạp lại', kept.kills > before.kills && kept.gold > before.gold,
      JSON.stringify(kept));
  }

  /* --------------------------------------------------------- TỔNG KẾT ---- */
  note('\n── console cả phiên ──');
  // Bỏ qua đúng những lỗi mà test CỐ TÌNH tái hiện ở phần "ô Magi thứ 3".
  const pageErrs = errs.filter(e => e.indexOf('PAGEERROR') === 0 && ignoreErr.indexOf(e) < 0);
  check('không có pageerror nào trong cả phiên', pageErrs.length === 0,
    pageErrs.slice(0, 3).join(' | '));

  await ctx.close(); await b.close();

  console.log(results.join('\n'));

  if (bugs.length) {
    console.log('\n=== NÚT GÂY LỖI JS (' + bugs.length + ') ===');
    bugs.slice(0, 40).forEach(x => console.log('  • ' + x));
  }
  if (dirty.length) {
    console.log('\n=== CHUỖI RÁC TRÊN GIAO DIỆN (' + dirty.length + ') ===');
    const seen = new Set();
    dirty.forEach(x => { const k = x.split('→')[0]; if (!seen.has(k)) { seen.add(k); console.log('  • ' + x); } });
  }
  if (negMoney.length) {
    console.log('\n=== TIỀN TỆ ÂM (' + negMoney.length + ') ===');
    negMoney.slice(0, 30).forEach(x => console.log('  • ' + x));
  }
  if (deadBtns.length) {
    console.log('\n=== NÚT KHÔNG PHẢN HỒI (' + deadBtns.length + ') ===');
    deadBtns.slice(0, 60).forEach(x => console.log('  • ' + x));
  }

  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
