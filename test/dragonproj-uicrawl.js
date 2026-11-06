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
  S.gold = 9e6; S.gem = 9e4; S.core = 999;
  S.bossKills = { amarok: 5, lich: 5, grouton: 5 };
  // Một bộ đồ SS thật để mở hết nhánh giao diện. Đột phá giờ ăn ĐỒ, nên phải
  // rèn sẵn một xấp đồ nướng — không có nó thì bộ SS đứng ở Đột phá 0 và cả
  // nhánh giao diện đó không bao giờ được crawl tới.
  ['weapon', 'head', 'body', 'arm', 'leg'].forEach(k => {
    const g = DP.forgeGear('amarok', k, 'seed');
    S.gear.push(g);
    for (let i = 0; i < 4; i++) {
      const need = DP.breakFodder(g);
      const fod = [];
      for (let j = 0; j < need.n; j++) {
        const f = DP.forgeGear('amarok', 'head', 'fod' + k + i + j);
        f.rank = 'SS'; S.gear.push(f); fod.push(f.uid);
      }
      DP.limitBreak(S, g, fod);
    }
    g.lv = DP.MAX_LV;
  });
  // Vài ải đã phá để màn Ải có cả ải xong, ải đang mở và ải khoá.
  ['tior-1', 'tior-2', 'tior-3'].forEach(id => { S.cleared[id] = true; });
  S.inv = { gold_potion: 5, exp_potion: 5, luck_potion: 5, hunter_potion: 5 };
  DP.UI.saveNow(); DP.UI.show('home');
};

/* ------------------------------------------------- CÁC HÀM CHẠY TRONG TRANG */
// Danh sách phần tử bấm được đang hiển thị của một màn.
const SEL = 'button,[data-act],[data-gear],[data-stage],[data-craft],[data-buy],' +
  '[data-evol],[data-pull],[data-tab],[data-fate],[data-fod],[data-use],[data-nav],[data-filter],[data-w],' +
  '[data-wslot],[data-aslot],[data-cy],[data-buyp],[data-unslot]';

// Danh sách phần tử bấm được đang hiển thị của một màn.
const PAGE_LIST = (a) => {
  const scr = document.getElementById('scr-' + a.id);
  if (!scr) return [];
  const ATT = ['data-act', 'data-gear', 'data-stage', 'data-craft', 'data-iap', 'data-buy', 'data-buym', 'data-buyk', 'data-use',
    'data-nav', 'data-filter', 'data-w', 'data-wslot',
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
    money: { gold: S.gold, gem: S.gem, core: S.core || 0 },
    text: on ? (on.innerText || '') : '',
    battle: !!DP.UI.battle
  };
};

/* ============================================================== CHẠY ===== */
// Ba id banner, đọc một lần từ trong trang để phía node lặp được trên chúng.
let DP_BANNERS = ['char', 'weapon', 'std'];

(async () => {
  const b = await chromium.launch();
  const { ctx, p, errs } = await open(b);
  DP_BANNERS = await p.evaluate(() => DP.BANNERS.map(x => x.id));

  note('\n── nạp tài nguyên để crawl được sâu ──');
  await p.evaluate(SEED);
  await p.waitForTimeout(300);
  const seeded = await p.evaluate(() => ({
    gold: DP.UI.save.gold, gear: DP.UI.save.gear.length,
    lb: (DP.UI.save.gear.find(g => g.src === 'amarok' && g.kind === 'weapon') || {}).lb
  }));
  check('bơm được tài nguyên và đồ SS', seeded.gold > 1e6 && seeded.gear >= 9,
    seeded.gear + ' món');
  check('vũ khí SS lên tới Limit Break 4', seeded.lb === 4, 'lb=' + seeded.lb);

  /* ------------------------------------------------------------- CRAWL --- */
  // 'gear' không có đường vào trực tiếp: phải chọn một món trong Kho đồ trước.
  // Crawl hai biến thể (vũ khí / giáp) vì hai nhánh render khác hẳn nhau.
  async function openGear(filter) {
    await p.evaluate(async (f) => {
      DP.UI.show('armory');
      const fb = document.querySelector('#body-armory [data-filter="' + f + '"]');
      if (fb) fb.click();
      // Mở món SÂU nhất (limit break/cấp cao nhất) chứ không phải món đầu danh
      // sách: chỉ món limit break 4 mới hiện nút tiến hoá.
      const list = DP.UI.save.gear.filter(g => g.kind === f)
        .sort((a, b2) => (b2.lb - a.lb) || (b2.lv - a.lv));
      const el = list.length ? document.querySelector('#body-armory [data-gear="' + list[0].uid + '"]')
                             : document.querySelector('#body-armory [data-gear]');
      if (el) el.click();
    }, filter);
    await p.waitForTimeout(180);
  }
  const TARGETS = [
    { id: 'home' }, { id: 'quest' }, { id: 'armory' }, { id: 'gacha' }, { id: 'more' },
    { id: 'evol' }, { id: 'shop' }, { id: 'help' }, { id: 'bosslist' },
    { id: 'gear', pre: 'weapon' }, { id: 'gear', pre: 'head' }
  ];
  const RUBBISH = ['undefined', 'NaN', '[object Object]'];

  /* ---------------------------------------- ĐỦ NÚT Ở MÀN CHI TIẾT ĐỒ ---- */
  // Đợt dọn hệ Magi đã CẮT NHẦM nguyên thẻ "Nâng cấp" của màn chi tiết đồ, mang
  // theo cả nút Trang bị và Rã đồ — và không phép kiểm nào kêu, vì crawler chỉ
  // bấm những nút CÓ MẶT chứ không hỏi nút nào PHẢI có mặt. Chốt lại ở đây:
  // mỗi hành động mà rGear biết xử lý đều phải có một cái nút gọi tới nó.
  await openGear('weapon');
  const gearActs = await p.evaluate(() => {
    const b = document.getElementById('body-gear');
    return [...b.querySelectorAll('[data-act]')].map(x => x.getAttribute('data-act'));
  });
  ['enhance', 'lb', 'evolve', 'reroll', 'equip', 'dismantle'].forEach(a => {
    check('màn chi tiết đồ có nút "' + a + '"', gearActs.indexOf(a) >= 0,
      'đang có: ' + gearActs.join(', '));
  });

  // Bấm Trang bị thì món đó phải THẬT SỰ vào tay người đang chọn.
  const eqTest = await p.evaluate(() => {
    const S = DP.UI.save;
    const h = DP.party(S).filter(Boolean)[0];
    const d = DP.heroDef(h);
    // phải là món ĐÚNG LỚP của người đó, người khác lớp thì từ chối là đúng
    const g = S.gear.find(x => x.kind === 'weapon' && x.wclass === d.wclass && !DP.holderOf(S, x.uid));
    if (!g) return { skip: true };
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    document.querySelector('#body-armory [data-gear="' + g.uid + '"]').click();
    document.querySelector('#body-gear [data-act="equip"]').click();
    return { on: (DP.holderOf(DP.UI.save, g.uid) || {}).uid === h.uid, name: g.name };
  });
  if (!eqTest.skip) {
    check('bấm "Trang bị" thì món về đúng người đang chọn', eqTest.on, eqTest.name);
  }

  /* ---------------------------------------- KÉO MÓN THẢ VÀO KHE --------- */
  // Ba thứ phải đúng cùng lúc, thiếu một là thao tác thành khó chịu:
  //   giữ rồi kéo mới bốc được món (không thì hết cuộn danh sách),
  //   khe không hợp loại thì không nhận,
  //   và cú click sau khi thả phải bị nuốt (không thì vừa lắp xong nhảy màn).
  async function dragGear(uid, slotSel) {
    await p.evaluate(u => {
      document.querySelector('#body-armory [data-gear="' + u + '"]').scrollIntoView({ block: 'center' });
    }, uid);
    await p.waitForTimeout(180);
    const c = await p.evaluate(u => {
      const r = document.querySelector('#body-armory [data-gear="' + u + '"]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, uid);
    await p.mouse.move(c.x, c.y);
    await p.mouse.down();
    await p.waitForTimeout(240);                        // GIỮ cho qua ngưỡng 180ms
    const top = await p.evaluate(() => document.getElementById('body-armory').getBoundingClientRect().top);
    for (let i = 1; i <= 8; i++) { await p.mouse.move(c.x, c.y + (top + 30 - c.y) * i / 8); await p.waitForTimeout(20); }
    await p.waitForTimeout(1100);                       // đứng ở mép cho nó tự cuộn lên
    const sl = await p.evaluate(sel => {
      const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, slotSel);
    if (!sl) { await p.mouse.up(); return { hot: false }; }
    await p.mouse.move(sl.x, sl.y);
    await p.waitForTimeout(110);
    const hot = await p.evaluate(sel => document.querySelector(sel).classList.contains('drop-hot'), slotSel);
    await p.mouse.up();
    await p.waitForTimeout(320);
    return { hot: hot };
  }

  const dg1 = await p.evaluate(() => {
    const S = DP.UI.save;
    const h0 = DP.party(S).filter(Boolean)[0]; h0.gear.head = null;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="head"]').click();
    const g = S.gear.find(x => x.kind === 'head');
    return { uid: g.uid, name: g.name };
  });
  await p.waitForTimeout(200);
  const r1 = await dragGear(dg1.uid, '#body-armory [data-aslot="head"]');
  const on1 = await p.evaluate(u => {
    const h = DP.party(DP.UI.save).filter(Boolean)[0];
    return h.gear.head === u;
  }, dg1.uid);
  check('kéo giáp thả vào khe Đầu thì lắp được', r1.hot && on1, dg1.name);

  const dg2 = await p.evaluate(() => {
    const S = DP.UI.save;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    const g = S.gear.find(x => x.kind === 'weapon');
    const h = DP.party(S).filter(Boolean)[0];
    return { uid: g.uid, head: h.gear.head };
  });
  await p.waitForTimeout(200);
  const r2 = await dragGear(dg2.uid, '#body-armory [data-aslot="head"]');
  const same = await p.evaluate(x => {
    const h = DP.party(DP.UI.save).filter(Boolean)[0];
    return h.gear.head === x;
  }, dg2.head);
  check('khe Đầu KHÔNG nhận vũ khí', !r2.hot && same);

  const dg3 = await p.evaluate(() => {
    const S = DP.UI.save;
    const h = DP.party(S).filter(Boolean)[0], d = DP.heroDef(h);
    h.gear.weapon = null;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    const g = S.gear.find(x => x.kind === 'weapon' && x.wclass === d.wclass);
    return { uid: g.uid, hero: h.uid };
  });
  await p.waitForTimeout(200);
  const r3 = await dragGear(dg3.uid, '#body-armory [data-wslot="0"]');
  const on3 = await p.evaluate(x => DP.heroOf(DP.UI.save, x.hero).gear.weapon === x.uid, dg3);
  check('kéo vũ khí đúng lớp thả vào ô vũ khí thì lắp được', r3.hot && on3);

  // Vũ khí SAI LỚP: ô không được sáng, và thả vào cũng không lắp.
  const dg4 = await p.evaluate(() => {
    const S = DP.UI.save;
    const h = DP.party(S).filter(Boolean)[0], d = DP.heroDef(h);
    const g = S.gear.find(x => x.kind === 'weapon' && x.wclass !== d.wclass);
    if (!g) return null;
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
    return { uid: g.uid, hero: h.uid, was: h.gear.weapon };
  });
  if (dg4) {
    await p.waitForTimeout(200);
    const r4 = await dragGear(dg4.uid, '#body-armory [data-wslot="0"]');
    const keep = await p.evaluate(x => DP.heroOf(DP.UI.save, x.hero).gear.weapon === x.was, dg4);
    check('vũ khí SAI LỚP: ô không sáng và không lắp được', !r4.hot && keep);
  }

  // Thả xong không được nhảy sang màn chi tiết, và cú chạm KẾ TIẾP phải sống.
  const after = await p.evaluate(() => {
    const scr = [...document.querySelectorAll('.screen.on')].map(s => s.id).join(',');
    document.querySelector('#body-armory [data-filter="head"]').click();
    return { scr: scr, filterTook: document.querySelector('#body-armory [data-filter="head"]').classList.contains('pri') };
  });
  check('thả xong vẫn ở màn Kho đồ, và cú chạm kế tiếp không bị nuốt',
    after.scr === 'scr-armory' && after.filterTook, JSON.stringify(after));

  // Chạm nhanh (không giữ) vẫn là mở chi tiết món, không phải kéo.
  await p.evaluate(() => {
    DP.UI.show('armory');
    document.querySelector('#body-armory [data-filter="weapon"]').click();
  });
  await p.waitForTimeout(200);
  const tapPt = await p.evaluate(() => {
    const e = document.querySelector('#body-armory [data-gear]');
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await p.waitForTimeout(150);
  await p.mouse.click(tapPt.x, tapPt.y);
  await p.waitForTimeout(300);
  const tapScr = await p.evaluate(() => [...document.querySelectorAll('.screen.on')].map(s => s.id).join(','));
  check('chạm nhanh vẫn mở màn chi tiết món (không bị hiểu thành kéo)',
    tapScr === 'scr-gear', tapScr);

  note('\n── crawl mọi nút trên mọi màn hình ──');
  let clicks = 0;
  for (const T of TARGETS) {
    const tag = T.id + (T.pre ? '/' + T.pre : '');
    // rGear() nổ ngay khi render (xem lỗi #1 trong báo cáo).
    if (T.id === 'gear') {
      await openGear(T.pre);
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
        if (gone) { await openGear(T.pre); await p.evaluate(() => DP.UI.show('gear')); }
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

  /* ------------------------------------------- BẢO TOÀN TÀI NGUYÊN ------- */
  note('\n── bảo toàn tài nguyên (gọi thẳng API DP.*) ──');
  // Mọi phép dưới đây chạy trên một save nháp, không đụng save thật, để nếu
  // crawler ở trên có làm bẩn dữ liệu thì kết quả vẫn sạch.
  const eco = await p.evaluate(() => {
    const mk = () => {
      const s = DP.starterKit(DP.newSave('T'));
      s.gold = 5e6; s.gem = 5e5; s.core = 500;
      s.bossKills = { amarok: 5 };
      return s;
    };
    let seq = 0;
    const mkGear = (s, kind) => { const g = DP.forgeGear('amarok', kind, 'eco' + (seq++)); s.gear.push(g); return g; };
    // Rèn một xấp đồ hạng SS chưa lắp lên ai, để dành làm nguyên liệu đột phá.
    const mkFodder = (s, n) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const g = DP.forgeGear('amarok', 'head', 'fod' + (seq++));
        g.rank = 'SS'; s.gear.push(g); out.push(g.uid);
      }
      return out;
    };
    const out = {};

    // --- NÂNG CẤP: trừ đúng gold ---
    let s = mk(); let g = mkGear(s, 'weapon');
    let c = DP.enhanceCost(g), g0 = s.gold, lv0 = g.lv;
    let r = DP.enhance(s, g);
    out.enhance = { ok: r.ok, gold: g0 - s.gold === c.gold, lv: g.lv === lv0 + 1 };
    s.gold = 0; g0 = s.gold; lv0 = g.lv;
    r = DP.enhance(s, g);
    out.enhanceBroke = { ok: r.ok === false, untouched: s.gold === g0 && g.lv === lv0 };

    // --- ĐỘT PHÁ: ăn ĐỒ, và món đem nướng phải biến mất ---
    s = mk(); g = mkGear(s, 'weapon');
    c = DP.limitBreakCost(g); g0 = s.gold;
    const fod = mkFodder(s, c.fodder.n);
    const bag0 = s.gear.length;
    r = DP.limitBreak(s, g, fod);
    out.lb = { ok: r.ok, gold: g0 - s.gold === c.gold, lb: g.lb === 1,
               burned: bag0 - s.gear.length === c.fodder.n,
               gone: fod.every(u => !s.gear.some(x => x.uid === u)) };
    // không còn đồ để nướng -> từ chối, và KHÔNG trừ gold
    g0 = s.gold;
    r = DP.limitBreak(s, g, []);
    out.lbBroke = { ok: r.ok === false, untouched: s.gold === g0 && g.lb === 1 };
    // gửi lên uid của món ĐANG LẮP -> phải từ chối, không được xoá nhầm
    s = mk(); g = mkGear(s, 'weapon');
    const worn = s.gear.filter(x => DP.holderOf(s, x.uid));
    const wornN = worn.length;
    r = DP.limitBreak(s, g, worn.slice(0, DP.breakFodder(g).n).map(x => x.uid));
    out.lbWorn = { refused: r.ok === false, kept: worn.every(x => s.gear.some(y => y.uid === x.uid)),
                   n: wornN };

    // --- TINH LUYỆN ---
    s = mk(); g = mkGear(s, 'weapon'); g.lv = DP.MAX_LV;
    c = DP.evolveCost(g); g0 = s.gold; let core0 = s.core;
    r = DP.evolve(s, g);
    out.evo = { ok: r.ok, gold: g0 - s.gold === c.gold, core: core0 - s.core === c.core,
                reset: g.lv === 1 && g.evo === 1 };
    s.core = 0; g.lv = DP.MAX_LV; g0 = s.gold;
    r = DP.evolve(s, g);
    out.evoBroke = { ok: r.ok === false, untouched: s.gold === g0 && g.evo === 1 };

    // --- ĐỔI ABILITY ---
    s = mk(); g = mkGear(s, 'weapon');
    c = DP.rerollCost(g); g0 = s.gold;
    r = DP.reroll(s, g);
    out.rr = { ok: r.ok, gold: g0 - s.gold === c.gold };
    s.gold = c.gold - 1; g0 = s.gold;
    r = DP.reroll(s, g);
    out.rrBroke = { ok: r.ok === false, untouched: s.gold === g0 };

    // --- TIẾN HOÁ ---
    s = mk();
    const t = DP.EVOL.tracks[0];
    let ec = DP.evolCost(s, t.id); g0 = s.gold;
    r = DP.evolUp(s, t.id);
    out.evol = { ok: r.ok, gold: g0 - s.gold === ec.gold, lv: DP.evolLv(s, t.id) === 1 };
    s.gold = 0; g0 = s.gold;
    r = DP.evolUp(s, t.id);
    out.evolBroke = { ok: r.ok === false, untouched: s.gold === g0 && DP.evolLv(s, t.id) === 1 };

    // --- QUAY: món mới vào túi, món trùng thành Lõi Rồng ---
    s = DP.newSave('T'); s.core = 0; s.gem = 9e6;
    const n0 = s.gear.length + s.heroes.length;
    /* Quay cho tới khi thấy CẢ HAI đường trùng, không chỉ đường đầu tiên gặp:
     *   - trùng NGƯỜI  -> ra Lõi Rồng   (x.dupe)
     *   - trùng ĐỒ     -> ra món thật   (x.spare)
     * Bản trước dừng ngay khi gặp trùng người, mà trùng người xảy ra sớm hơn
     * hẳn — 43 nhân vật so với 56 con x 5 ô đồ. Nên nó thoát ra trước khi kịp
     * có món trùng nào, rồi phép kiểm ngay dưới báo "0 món thừa" và trông như
     * một lỗi thật của game. Chờ đủ cả hai thì phép kiểm đo đúng thứ nó định đo. */
    let dup = null, spareSeen = false;
    for (let i = 0; i < 400 && !(dup && spareSeen); i++) {
      const res = DP.pull(s, 'std', 10);
      dup = dup || res.results.filter(x => x.dupe)[0] || null;
      spareSeen = spareSeen || res.results.some(x => x.spare);
    }
    out.gear = { grew: s.gear.length + s.heroes.length > n0,
                 dupFound: !!dup, cores: dup ? dup.cores === DP.DUPE_CORE[dup.rank] : false,
                 stock: (s.core || 0) > 0,
                 // Túi PHẢI cho phép đồ trùng: đó là kho nguyên liệu của Đột phá.
                 // Trùng người thì ra Lõi, trùng đồ thì ra một món thật.
                 spares: s.gear.length - new Set(s.gear.map(g => g.src + '|' + g.kind)).size,
                 heroDupOnly: !s.heroes.some((h, i) => s.heroes.findIndex(x => x.id === h.id) !== i) };
    // Lõi Rồng không được có đường cày nào
    out.coreFarm = JSON.stringify(DP.ITEMS).indexOf('core') >= 0 ||
                   !!DP.rollMobDrop('purun', true, true, 99, 40).core ||
                   !!DP.rollBossDrop(DP.behemothById('amarok'), 4, 99, 60).core;

    // --- GỌI HAI LẦN VỚI TÀI NGUYÊN CHỈ ĐỦ MỘT LẦN ---
    s = mk(); g = mkGear(s, 'weapon');
    c = DP.enhanceCost(g); s.gold = c.gold;
    const a1 = DP.enhance(s, g), a2 = DP.enhance(s, g);
    out.twice = { first: a1.ok === true, second: a2.ok === false,
                  gold: s.gold === 0, lv: g.lv === 2 };

    // --- BÌNH: một bình chỉ dùng được một lần ---
    s = mk(); s.inv.gold_potion = 1;
    const p1 = DP.usePotion(s, 'gold_potion'), p2 = DP.usePotion(s, 'gold_potion');
    out.potion = { first: p1.ok === true, second: p2.ok === false, inv: s.inv.gold_potion === 0 };

    // --- hết sạch tiền thì mọi hàm nâng cấp đều phải trả ok:false ---
    s = mk(); g = mkGear(s, 'weapon'); g.lv = DP.MAX_LV;
    s.gold = 0; s.core = 0;
    out.allRefuse = [DP.enhance(s, g), DP.limitBreak(s, g, []), DP.evolve(s, g),
                     DP.reroll(s, g), DP.evolUp(s, DP.EVOL.tracks[0].id)].every(x => x.ok === false);

    // --- RÃ ĐỒ: gỡ khỏi tay người đang giữ, biến mất khỏi túi, trả về Gold ---
    s = mk();
    const w = s.gear.find(x => x.kind === 'weapon');
    const wasEquipped = !!DP.holderOf(s, w.uid);
    g0 = s.gold;
    const dr = DP.dismantle(s, w);
    out.dis = { ok: dr.ok, wasEquipped: wasEquipped,
                gotGold: s.gold - g0 === dr.gold && dr.gold > 0,
                outLoadout: JSON.stringify(s.heroes).indexOf(w.uid) < 0,
                outBag: !s.gear.some(x => x.uid === w.uid) };

    return out;
  });

  check('nâng cấp trừ đúng gold', eco.enhance.ok && eco.enhance.gold && eco.enhance.lv,
    JSON.stringify(eco.enhance));
  check('nâng cấp khi hết tiền: từ chối và không đụng gì', eco.enhanceBroke.ok && eco.enhanceBroke.untouched);
  check('đột phá trừ gold VÀ nướng đúng số món', eco.lb.ok && eco.lb.gold && eco.lb.lb && eco.lb.burned && eco.lb.gone,
    JSON.stringify(eco.lb));
  check('đột phá khi không có đồ nướng: từ chối, không trừ gold', eco.lbBroke.ok && eco.lbBroke.untouched);
  check('đột phá KHÔNG bao giờ nướng món đang lắp lên người',
    eco.lbWorn.n > 0 && eco.lbWorn.refused && eco.lbWorn.kept, eco.lbWorn.n + ' món đang lắp');
  check('tinh luyện trừ đúng gold + Lõi Rồng và reset Lv', eco.evo.ok && eco.evo.gold && eco.evo.core && eco.evo.reset,
    JSON.stringify(eco.evo));
  check('tinh luyện khi hết Lõi Rồng: từ chối, không trừ gold', eco.evoBroke.ok && eco.evoBroke.untouched);
  check('đổi ability trừ đúng gold', eco.rr.ok && eco.rr.gold);
  check('đổi ability khi thiếu 1 gold: từ chối', eco.rrBroke.ok && eco.rrBroke.untouched);
  check('Tiến Hoá trừ đúng gold và lên đúng một cấp', eco.evol.ok && eco.evol.gold && eco.evol.lv,
    JSON.stringify(eco.evol));
  check('Tiến Hoá khi hết gold: từ chối, không đụng gì', eco.evolBroke.ok && eco.evolBroke.untouched);
  check('quay ra thứ mới thì vào thẳng túi', eco.gear.grew, JSON.stringify(eco.gear));
  check('quay ra thứ trùng thì thành Lõi Rồng đúng số lượng', eco.gear.dupFound && eco.gear.cores && eco.gear.stock);
  /* ĐỒ TRÙNG PHẢI Ở LẠI TRONG TÚI, không tan thành Lõi Rồng — nếu tan hết thì
   * không bao giờ có nguyên liệu để Đột phá, và cả một bậc nâng cấp thành bất
   * khả thi. (Trùng NGƯỜI thì vẫn ra Lõi; đó là hai đường khác nhau.)
   *
   * Ngưỡng phải suy ra từ dữ liệu chứ không cắm cứng: mười bốn lớp và năm mươi
   * sáu con Behemoth thì số tổ hợp món tăng lên, nên số lượt quay cần để chắc
   * chắn đụng một món trùng cũng tăng. Cắm cứng "20 lượt" là phép kiểm sẽ hỏng
   * mỗi lần thêm nội dung, mà hỏng vì lý do không liên quan gì tới thứ nó đo. */
  check('túi GIỮ đồ trùng để làm nguyên liệu đột phá', eco.gear.spares > 0,
    eco.gear.spares + ' món thừa / ' + eco.gear.stock + ' món trong túi');
  check('roster KHÔNG bao giờ có hai bản của cùng một nhân vật', eco.gear.heroDupOnly);
  check('Lõi Rồng không nằm trong bảng rơi hay quầy nào (không cày được)', eco.coreFarm === false);
  check('gọi hai lần với tài nguyên đủ MỘT lần: lần hai fail, không âm',
    eco.twice.first && eco.twice.second && eco.twice.gold && eco.twice.lv,
    JSON.stringify(eco.twice));
  check('một bình chỉ uống được một lần', eco.potion.first && eco.potion.second && eco.potion.inv);
  check('hết sạch tiền thì mọi hàm nâng cấp đều trả ok:false', eco.allRefuse);
  check('rã đồ: gỡ khỏi tay người đang giữ', eco.dis.wasEquipped && eco.dis.outLoadout);
  check('rã đồ: biến mất khỏi túi và trả về Gold', eco.dis.outBag && eco.dis.gotGold);

  /* ------------------------------------- MUA Ở TIỆM (đường đi qua UI) ---- */
  note('\n── tiệm: đường mua đi qua nút thật ──');
  const shop = await p.evaluate(async () => {
    const S = DP.UI.save;
    const P = DP.ITEMS.gold_potion;
    // 1) thiếu 1 Gold -> không được mua
    S.gold = P.price.gold - 1; DP.UI.show('shop');
    let inv0 = S.inv.gold_potion || 0;
    document.querySelector('#body-shop [data-buy="gold_potion"]').click();
    const poor = { gold: S.gold === P.price.gold - 1, inv: (S.inv.gold_potion || 0) === inv0 };
    // 2) đủ đúng một lần -> mua được, lần hai trượt
    S.gold = P.price.gold; DP.UI.show('shop'); inv0 = S.inv.gold_potion || 0;
    document.querySelector('#body-shop [data-buy="gold_potion"]').click();
    const one = { gold: S.gold === 0, inv: (S.inv.gold_potion || 0) === inv0 + 1 };
    DP.UI.show('shop'); inv0 = S.inv.gold_potion || 0;
    document.querySelector('#body-shop [data-buy="gold_potion"]').click();
    const two = { gold: S.gold === 0, inv: (S.inv.gold_potion || 0) === inv0 };
    // 3) tiệm KHÔNG được đụng tới Gem — gem chỉ tiêu ở màn Triệu Hồi
    S.gem = 1234; DP.UI.show('shop');
    S.gold = 9e6; DP.UI.show('shop');
    document.querySelector('#body-shop [data-buy="hunter_potion"]').click();
    const gemUntouched = S.gem === 1234;
    return { poor, one, two, gemUntouched };
  });
  check('thiếu Gold thì nút mua không trừ gì', shop.poor.gold && shop.poor.inv);
  check('đủ Gold thì mua đúng một lần, trừ đúng giá', shop.one.gold && shop.one.inv);
  check('bấm mua lần hai khi đã hết Gold: không được gì, không âm', shop.two.gold && shop.two.inv);
  check('tiệm KHÔNG bao giờ đụng tới Gem', shop.gemUntouched);

  /* ---------------------------------------- QUAY: gem trừ đúng ---------- */
  note('\n── triệu hồi: gem trừ đúng, ba banner đều chạy ──');
  const gac = await p.evaluate(() => {
    const S = DP.UI.save;
    const out = {};
    DP.BANNERS.forEach(bn => {
      S.gem = DP.REWARD.pull10; DP.UI.show('gacha');
      const tab = document.querySelector('#body-gacha [data-tab="' + bn.id + '"]');
      tab.click();
      const n0 = S.gear.length + S.heroes.length, c0 = S.core || 0;
      document.querySelector('#body-gacha [data-pull="10"]').click();
      const grew = (S.gear.length + S.heroes.length) - n0 + ((S.core || 0) - c0 > 0 ? 1 : 0);
      // hết gem -> bấm lần hai không được gì
      DP.UI.show('gacha');
      const n1 = S.gear.length + S.heroes.length;
      const btn = document.querySelector('#body-gacha [data-pull="10"]');
      if (btn) btn.click();
      out[bn.id] = { spentAll: S.gem === 0, grew: grew > 0,
                     noSecond: (S.gear.length + S.heroes.length) === n1 };
    });
    return out;
  });
  DP_BANNERS.forEach(id => {
    check('banner ' + id + ': quay 10 trừ đúng gem và ra đồ', gac[id].spentAll && gac[id].grew,
      JSON.stringify(gac[id]));
    check('banner ' + id + ': hết gem thì không quay được nữa', gac[id].noSecond);
  });

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
    return { gold: S.gold, lv: S.lv, gear: S.gear.length, cleared: Object.keys(S.cleared).length,
             core: S.core || 0, gem: S.gem,
             scr: (document.querySelector('#screens .screen.on') || {}).id };
  });
  check('nút "Xóa dữ liệu" đưa game về đúng trạng thái mới tinh',
    /* 18 món: 3 cây của ba nhân vật mở đầu + 11 cây dự phòng cho mười một lớp
     * còn lại + 4 mảnh giáp. MƯỜI BỐN LỚP thì phải đủ mười bốn cây — thiếu một
     * cây là có một lớp quay được người mà không có gì để lắp, và người chơi
     * ngồi nhìn một nhân vật không đánh được. Con số này bám theo độ dài của
     * G.WEAPON_ORDER, nên thêm lớp mà quên sửa đây là phép kiểm sẽ nói. */
    fresh.gold === 3000 && fresh.lv === 1 && fresh.gear === 18 && fresh.cleared === 0 &&
    fresh.core === 0 && fresh.gem === 1600,
    JSON.stringify(fresh));

  // --- CHẶNG QUÁI: vào ải đầu, bot cày 25 giây ---
  await p.evaluate(() => {
    DP.UI.startStage('tior-1');
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
  check('vào được ải đầu', await p.evaluate(() => !!(DP.UI.battle && DP.UI.battle.running)));

  const eField = errs.length;
  await p.evaluate(() => DPBot.on(140));
  const track = { kill: 0, gold: 0, moved: 0, stuckSamples: 0, chests: 0, paused: 0 };
  let lastPos = null;
  for (let t = 0; t < 25; t++) {
    await p.waitForTimeout(1000);
    const s = await p.evaluate(() => {
      const b = DP.UI.battle;
      if (!b) return null;
      return { killed: b.killed || 0, x: Math.round(b.player.x), y: Math.round(b.player.y),
               bag: b.bag || { gold: 0 }, phase: b.phase, hp: b.player.hp,
               chests: b.chests.length, running: b.running, paused: !!b.paused };
    });
    if (!s) break;
    track.kill = Math.max(track.kill, s.killed);
    track.gold = Math.max(track.gold, s.bag.gold || 0);
    track.chests = s.chests;                 // số rương CÒN NẰM TRÊN ĐẤT lúc lấy mẫu
    if (s.paused) track.paused++;
    if (lastPos && Math.hypot(s.x - lastPos.x, s.y - lastPos.y) < 4) track.stuckSamples++;
    else track.moved++;
    lastPos = s;
    if (!s.running) break;
  }
  await p.evaluate(() => DPBot.off());
  check('bot giết được quái trong ải', track.kill > 0,
    track.kill + ' con, nhặt được ' + track.gold + ' gold, còn ' +
    track.chests + ' rương nằm trên đất');
  /* Phép kiểm "bot bốc được bài" đã bỏ cùng cả hệ lên-cấp-trong-trận. Thay vào
   * đó khoá lại điều ngược lại: trận KHÔNG được dừng vì bất cứ lý do gì trong
   * suốt hai mươi lăm giây cày. Màn bốc bài từng là thứ duy nhất dừng được trận,
   * nên nếu có ai lỡ tay thêm lại một cái cửa chặn nào nữa thì chỗ này báo. */
  check('trận không bị dừng lần nào trong suốt lượt cày',
    track.paused === 0, track.paused + ' lần dừng');
  check('bot không bị kẹt một chỗ', track.moved >= 8,
    track.moved + ' lần di chuyển / ' + track.stuckSamples + ' lần đứng yên');
  const noJs = errs.slice(eField).filter(e => e.indexOf('PAGEERROR') === 0);
  check('cày ải 25 giây không sinh lỗi JS', noJs.length === 0, noJs.slice(0, 2).join(' | '));

  // Thí nghiệm có kiểm soát, không phụ thuộc may rủi của bot: đặt người chơi
  // đứng ĐÚNG tầm với của vũ khí — tức đúng chỗ đứng lúc đánh — rồi giết con
  // quái đó và đứng yên. Rương rơi ngay chỗ quái chết, cách người chơi bằng tầm
  // với (kiếm 62px), trong khi bán kính nhặt chỉ 32px (game.js:1043).
  await p.evaluate(() => { DP.UI.startStage('tior-1'); });
  await p.waitForTimeout(500);
  const loot = await p.evaluate(() => new Promise(res => {
    const bt = DP.UI.battle, pl = bt.player;
    const clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;
    // Tự dựng một con quái để bài kiểm luôn chạy y hệt nhau, không phụ thuộc
    // vào việc trên sân còn con nào sống hay đã sang chặng boss.
    let m = bt.mobs.find(x => !x.dead);
    if (!m) { m = bt.makeMob('purun', 1, false, false); bt.mobs.push(m); }
    m.x = bt.wW / 2; m.y = bt.wH / 2;
    const a = Math.atan2(pl.y - m.y, pl.x - m.x);
    /* Đứng ở CỰ LY BẮN thật của cây, không phải "tầm với" của bản cận chiến —
     * W.reach không còn tồn tại. Lấy 60% tầm bắn: đó là chỗ người chơi thật sự
     * đứng, đủ xa để an toàn và đủ gần để không trượt. Rương phải HÚT được về
     * từ đó, nếu không thì bắn xong lại phải chạy tới nhặt từng cái. */
    const stand = Math.min(bt.W.range * 0.6, 300);
    pl.x = clamp2(m.x + Math.cos(a) * stand, 30, bt.wW - 30);
    pl.y = clamp2(m.y + Math.sin(a) * stand, 30, bt.wH - 30);
    bt.chests.length = 0;
    bt.killMob(m);
    var mine = bt.chests[bt.chests.length - 1];   // đúng rương của con vừa giết
    setTimeout(function () {
      res({ reach: Math.round(stand), left: bt.chests.indexOf(mine) >= 0 ? 1 : 0,
            reaches: Object.keys(DP.WEAPONS).map(k => k + '=' + DP.WEAPONS[k].range).join(' ') });
    }, 800);
  }));
  check('giết quái ở đúng tầm đánh thì nhặt được rương nó rơi ra',
    !!loot && loot.left === 0,
    loot ? ('đứng cách xác quái ' + loot.reach + 'px (60% tầm bắn), rương tự hút về và nhặt được — tầm bắn: ' +
            loot.reaches) : 'không tìm được quái để thử');

  // --- BOSS: grouton lv8 ---
  await p.evaluate(() => {
    const el = document.getElementById('resultScr');
    el.classList.remove('on');
    window.__res = null;
    DP.UI.startStage('tior-1');
    DP.UI.battle.startBossPhase();      // vào thẳng chặng trùm, khỏi dọn quái
  });
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => {
    const S = DP.UI.save;
    return { gold: S.gold, gem: S.gem, medal: S.medal, kills: S.bossKills.grouton || 0,
             cleared: !!S.cleared['tior-1'],
             hp: DP.UI.battle.boss.hp, maxHp: DP.UI.battle.boss.maxHp };
  });
  // Rương rơi khi PHÁ BỘ PHẬN được đẩy vào this.chests. Trước đây vòng nhặt rương
  // chỉ chạy ở chặng quái, nên rương của chặng boss không bao giờ nhặt được — và
  // cũng không bao giờ tự biến mất. Bài kiểm này chốt lại chuyện đó.
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
      b.player.usedSkill = true;
      b.dealToBoss({ phys: 9e9, elem: 0, el: 'none' }, b.boss.x, b.boss.y, {});
    });
    for (let t = 0; t < 8 && !done; t++) { await p.waitForTimeout(500); done = await p.evaluate(() => !!window.__res); }
  }
  await p.evaluate(() => DPBot.off());

  const res = await p.evaluate(() => window.__res);
  check('màn kết quả hiện ra sau khi phá ải', !!res && /PHÁ ẢI/.test(res.text || ''),
    res ? (res.text || '').split('\n')[0] : 'không thấy màn kết quả');
  if (res) {
    const S2 = res.save;
    check('phá xong thì ải được đánh dấu đã qua', S2.cleared['tior-1'] === true);
    check('ải kế tiếp mở ra sau khi phá', !!S2.cleared['tior-1']);
    check('phần thưởng được cộng vào save: Gold tăng', S2.gold > before.gold,
      before.gold + ' → ' + S2.gold);
    check('phần thưởng được cộng vào save: Gem tăng',
      S2.gem > before.gem, 'gem ' + before.gem + '→' + S2.gem);
    check('màn kết quả không lộ chuỗi rác', !/undefined|NaN|\[object Object\]/.test(res.text || ''),
      (res.text || '').split('\n').find(x => /undefined|NaN/.test(x)) || 'sạch');
    // Lưu rồi nạp lại: phần thưởng phải còn.
    await p.evaluate(() => DP.UI.saveNow());
    await p.reload(); await p.waitForTimeout(900);
    const kept = await p.evaluate(() => ({ gold: DP.UI.save.gold, cleared: !!DP.UI.save.cleared['tior-1'] }));
    check('tiến độ ải và phần thưởng còn nguyên sau khi nạp lại', kept.cleared && kept.gold > before.gold,
      JSON.stringify(kept));
  }

  /* --------------------------------------------------------- TỔNG KẾT ---- */
  note('\n── console cả phiên ──');
  // Bỏ qua đúng những lỗi mà test CỐ TÌNH tái hiện.
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
