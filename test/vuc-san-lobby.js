/*
 * Vực Săn, sảnh trên trình duyệt: chọn phe, ghép trận giả, bốc bản đồ, đối đầu, gacha, kho nhân vật, kết quả, xoay ngang.
 * Chạy: node test/vuc-san-lobby.js   (VS_URL=<gốc> để chạy trên Pages; VS_SHOTS=<thư mục> để đặt chỗ lưu ảnh)
 *
 * Mọi cú bấm là chuột thật (page.mouse) vào tâm phần tử, và trước mỗi cú bấm đều khẳng định document.elementFromPoint
 * ở đúng điểm đó trả về chính nút định bấm (không có lớp nào đè lên). Thời gian của ghép trận, bốc bản đồ, đếm ngược
 * và lật thẻ đo bằng MutationObserver trong trang nên không phụ thuộc độ trễ của bài kiểm.
 * Ở nhánh này VS.sim chỉ là khung rỗng: onStart được thay bằng một bộ ghi trước khi vào luồng ghép trận.
 */
'use strict';
const T = require('./vuc-san-lib');

const VIEWPORTS = [{ name: '1366x650', width: 1366, height: 650 }, { name: '844x390', width: 844, height: 390 }];

// ───────────────────────── tiện ích chung ─────────────────────────
// Dựng bộ ghi trong trang: thời điểm đổi màn, số ghế đầy, số đếm ngược, bản đồ đã dừng, thứ tự lật thẻ; chặn onStart/onLeave.
async function instrument(page) {
  await page.evaluate(() => {
    const log = window.__log = { screens: [], seats: [], counts: [], landed: [], flips: [], queueFull: null, landInfo: null, versusInfo: null };
    const last = { screen: null, seats: -1, count: null, landed: null };
    const seen = new WeakSet();
    // Các màn thoáng qua (ghế vừa đầy 0,9 s, bản đồ vừa dừng 1,1 s, đối đầu 3 s) được chụp DOM ngay khi xuất hiện,
    // để bài kiểm đọc lại sau không phụ thuộc máy chậm tới đâu.
    const snapVersus = () => {
      const card = (c) => ({ n: c.querySelector('.vs-vp-n').textContent, lv: c.querySelector('.vs-lv').textContent, ping: c.querySelector('.vs-ping .vs-num').textContent, ch: c.querySelector('.vs-vp-c').textContent, me: c.classList.contains('me'), pt: !!c.querySelector('.vs-pt img, .vs-pt canvas') });
      return { diver: [...document.querySelectorAll('.vs-vt-diver .vs-vp')].map(card), shark: [...document.querySelectorAll('.vs-vt-shark .vs-vp')].map(card), map: document.querySelector('.vs-v-map b').textContent };
    };
    const scan = () => {
      const now = performance.now(), vs = document.querySelector('.vs');
      const sc = vs && vs.dataset.screen;
      if (sc && sc !== last.screen) {
        log.screens.push([now, sc]); last.screen = sc;
        if (sc === 'queue') { log.queueFull = null; log.landInfo = null; log.versusInfo = null; }
      }
      const qEl = document.querySelector('.vs-s-queue');
      if (qEl && qEl.dataset.full === '1' && !log.queueFull) {
        const first = document.querySelector('.vs-team-shark .vs-seat');
        log.queueFull = { at: now, seats: [...document.querySelectorAll('.vs-seat.on')].map((s) => ({ team: s.dataset.team, name: s.querySelector('.vs-seat-n').textContent, meta: s.querySelector('.vs-seat-m').textContent })), shark0: first ? { me: first.classList.contains('me'), name: first.querySelector('.vs-seat-n').textContent } : null };
      }
      const mEl = document.querySelector('.vs-s-map');
      if (mEl && mEl.dataset.landed === '1' && !log.landInfo) {
        const view = document.querySelector('.vs-roul').getBoundingClientRect(), lock = document.querySelector('.vs-mc.lock'), c = lock.getBoundingClientRect();
        log.landInfo = { at: now, map: mEl.dataset.map, locks: document.querySelectorAll('.vs-mc.lock').length, cards: new Set([...document.querySelectorAll('.vs-mc')].map((e) => e.dataset.map)).size, cardMap: lock.dataset.map, off: Math.abs(c.left + c.width / 2 - (view.left + view.width / 2)), name: document.querySelector('.vs-m-name b').textContent };
      }
      const vEl = document.querySelector('.vs-s-versus');
      if (vEl && vEl.dataset.count === '2' && !log.versusInfo) log.versusInfo = snapVersus();
      const seats = document.querySelectorAll('.vs-seat.on').length;
      if (seats !== last.seats) { log.seats.push([now, seats]); last.seats = seats; }
      const v = document.querySelector('.vs-s-versus');
      if (v && v.dataset.count && v.dataset.count !== last.count) { log.counts.push([now, v.dataset.count]); last.count = v.dataset.count; }
      const m = document.querySelector('.vs-s-map');
      if (m && m.dataset.landed && m.dataset.map !== last.landed) { log.landed.push([now, m.dataset.map]); last.landed = m.dataset.map; }
      document.querySelectorAll('.vs-rc.up').forEach((c) => {
        if (!seen.has(c)) { seen.add(c); log.flips.push([now, c.dataset.id, +c.dataset.rarity]); }
      });
    };
    new MutationObserver(scan).observe(document.getElementById('ui'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-screen', 'data-count', 'data-landed', 'data-full'] });
    scan();
    window.__starts = []; window.__leaves = [];
    VS.lobby.onStart = (cfg) => { window.__starts.push({ at: performance.now(), cfg: JSON.parse(JSON.stringify(cfg)) }); };
    VS.lobby.onLeave = () => { window.__leaves.push(performance.now()); };
  });
}

async function boot(page) {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await instrument(page);
}

// Chờ mọi hoạt ảnh hữu hạn (vào màn, hiện thẻ, lật) chạy xong để toạ độ nút đã đứng yên.
async function quiet(page) {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000))
  ]));
}
const saveOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('vs.save.v1')));
const screenOf = (page) => page.evaluate(() => VS.lobby.screen());
const textOf = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const numOf = (s) => parseInt(String(s).replace(/\D/g, ''), 10);

// Bấm chuột thật vào tâm phần tử, sau khi khẳng định ở tâm đó đúng là phần tử (hoặc con của nó).
async function press(page, P, sel, why) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await quiet(page);
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y, sel]) => {
    const t = document.elementFromPoint(x, y), el = document.querySelector(sel);
    return { ok: !!t && !!el && (t === el || el.contains(t)), got: t ? (t.tagName + '.' + String(t.className).slice(0, 40)) : null };
  }, [x, y, sel]);
  T.check(P + 'elementFromPoint ở tâm "' + why + '" trúng đúng nó', hit.ok, hit.got);
  await page.mouse.click(x, y);
  return b;
}

// Kiểm bố cục từng màn: chữ/nút/ảnh không tràn ra ngoài khung hình hay bị vùng ẩn cắt, hai khối chữ không đè nhau,
// chữ cắt "…" và đoạn cắt dòng được báo riêng. Thẻ bốc bản đồ chạy ngoài khung và lưới cuộn được là cố ý, không tính.
const AUDIT = () => {
  const out = { clipped: [], overlaps: [], truncated: [] };
  const W = innerWidth, H = innerHeight;
  const screen = document.querySelector('.vs-reveal') || document.querySelector('.vs-screen');   // có lớp phủ lật thẻ thì chỉ kiểm lớp đó
  if (!screen) return out;
  const tag = (el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.') + '"' + (el.textContent || '').trim().slice(0, 22) + '"';
  const own = (el) => [].some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim());
  const rects = [];
  for (const el of screen.querySelectorAll('*')) {
    if (el.closest('.vs-roul') && !el.closest('.vs-mc.lock')) continue;
    if (el.closest('.vs-avatar, .vs-seat-pt')) continue;      // chân dung cắt tròn trong khung tròn là cố ý
    if (el.closest('.vs-rc:not(.up) .vs-rc-f') || el.closest('.vs-rc.up .vs-rc-b')) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    const isText = own(el), isCtl = /^(BUTTON|IMG|CANVAS)$/.test(el.tagName);
    if (!isText && !isCtl) continue;
    let bad = null;
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) bad = 'ngoài khung hình';
    for (let a = el.parentElement; a && a !== document.body && !bad; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflowX === 'visible' && ac.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      const sx = /auto|scroll/.test(ac.overflowX), sy = /auto|scroll/.test(ac.overflowY);
      if (!sx && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5)) bad = 'bị cắt ngang bởi ' + tag(a);
      if (!sy && (r.bottom > ar.bottom + 1.5 || r.top < ar.top - 1.5)) bad = 'bị cắt dọc bởi ' + tag(a);
    }
    if (bad) out.clipped.push(tag(el) + ' ' + bad);
    if (isText) rects.push({ el, frags: [].map.call(el.getClientRects(), (q) => q).filter((q) => q.width > 1 && q.height > 1) });
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.truncated.push(tag(el));
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) out.truncated.push(tag(el) + ' (cắt dòng)');
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    // so từng đoạn dòng của chữ: chữ xuống dòng có khung bao lớn hơn phần chữ thật
    const hit = a.frags.some((p) => b.frags.some((q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 3 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 3));
    if (hit) out.overlaps.push(tag(a.el) + ' đè ' + tag(b.el));
  }
  return out;
};
async function audit(page, P, name, allowTruncated, noWait) {
  if (!noWait) await quiet(page);
  const r = await page.evaluate(AUDIT);
  T.check(P + name + ': chữ, nút, ảnh nằm trọn trong khung và không bị vùng ẩn cắt', r.clipped.length === 0, r.clipped.slice(0, 4).join(' | ') || 'sạch');
  T.check(P + name + ': không có hai khối chữ đè lên nhau', r.overlaps.length === 0, r.overlaps.slice(0, 4).join(' | ') || 'sạch');
  const trunc = allowTruncated ? [] : r.truncated;
  T.check(P + name + ': không có chữ nào bị cắt "…" hay cắt dòng', trunc.length === 0, trunc.slice(0, 4).join(' | ') || (r.truncated.length ? r.truncated.length + ' chỗ cắt được phép' : 'sạch'));
}

// ───────────────────────── từng luồng ─────────────────────────
async function flowLobby(page, P, snap) {
  console.log(P + 'sảnh');
  const info = await page.evaluate(() => {
    const s = VS.save.current, d = VS.DIVERS[s.pick.diver], k = VS.SHARKS[s.pick.shark];
    return { diver: { name: d.name, skill: VS.SKILL_DATA[d.skill].name, r: d.rarity }, shark: { name: k.name, skill: VS.SKILL_DATA[k.skill].name, r: k.rarity }, pearls: s.pearls };
  });
  T.check(P + 'màn đầu là sảnh, tiêu đề VỰC SĂN, ngọc trai và cấp đúng', (await screenOf(page)) === 'lobby' && (await textOf(page, '.vs-title')) === 'VỰC SĂN' &&
    numOf(await textOf(page, '[data-pearls]')) === info.pearls && (await textOf(page, '.vs-me .vs-lv')) === 'Lv.1', (await textOf(page, '[data-pearls]')) + ' ' + (await textOf(page, '.vs-me .vs-lv')));
  const cards = await page.evaluate(() => ['diver', 'shark'].map((t) => {
    const c = document.querySelector('.vs-side-' + t);
    return { name: c.querySelector('.vs-ch-name').textContent, stars: c.querySelectorAll('.vs-star').length, skill: c.querySelector('.vs-side-skill b').textContent, head: c.querySelector('.vs-side-name').textContent, hasPortrait: !!c.querySelector('.vs-side-pt img, .vs-side-pt canvas'), changeBtn: !!c.querySelector('[data-act^=change-]') };
  }));
  T.check(P + 'hai thẻ phe: THỢ LẶN và CÁ MẬP, mỗi thẻ có chân dung, tên, số sao bậc, kỹ năng và nút Đổi',
    cards[0].head === 'THỢ LẶN' && cards[1].head === 'CÁ MẬP' && cards.every((c) => c.hasPortrait && c.changeBtn) &&
    cards[0].name === info.diver.name && cards[0].stars === info.diver.r && cards[0].skill === info.diver.skill &&
    cards[1].name === info.shark.name && cards[1].stars === info.shark.r && cards[1].skill === info.shark.skill, JSON.stringify(cards));
  T.check(P + 'nút TÌM TRẬN, Gacha, Bộ sưu tập có mặt', (await textOf(page, '[data-act=find] .vs-play-t')) === 'TÌM TRẬN' &&
    (await textOf(page, '[data-act=gacha]')) === 'Gacha' && (await textOf(page, '[data-act=roster]')) === 'Bộ sưu tập');
  T.check(P + 'mặc định chọn phe THỢ LẶN: thẻ thợ lặn sáng, nút ghi "Phe THỢ LẶN"', (await page.evaluate(() => document.querySelector('.vs-side-diver').classList.contains('on') && !document.querySelector('.vs-side-shark').classList.contains('on'))) &&
    (await textOf(page, '.vs-play-s')) === 'Phe THỢ LẶN');
  await audit(page, P, 'sảnh');
  await snap('lobby');

  // chọn phe cá mập bằng chuột thật vào giữa thẻ
  await press(page, P, '.vs-side-shark', 'thẻ CÁ MẬP');
  await page.waitForFunction(() => document.querySelector('.vs-side-shark').classList.contains('on'));
  const after = await page.evaluate(() => ({ diverOn: document.querySelector('.vs-side-diver').classList.contains('on'), sub: document.querySelector('.vs-play-s').textContent, tag: document.querySelector('.vs-side-shark .vs-side-tag').textContent, pressed: document.querySelector('[data-act=side-shark]').getAttribute('aria-pressed') }));
  T.check(P + 'bấm thẻ CÁ MẬP: thẻ ấy sáng "ĐÃ CHỌN", thẻ thợ lặn tắt, nút ghi "Phe CÁ MẬP"', !after.diverOn && after.sub === 'Phe CÁ MẬP' && after.tag === 'ĐÃ CHỌN' && after.pressed === 'true', JSON.stringify(after));
  T.check(P + 'phe đã chọn được ghi vào localStorage (pick.team = shark)', (await saveOf(page)).pick.team === 'shark');
  await snap('lobby-shark');
}

async function flowQueue(page, P, snap) {
  console.log(P + 'ghép trận giả: cá mập → tìm trận → bốc bản đồ → đối đầu → vào trận');
  const sv = await saveOf(page);
  const mapsInfo = await page.evaluate(() => VS.MAPS.map((m) => ({ id: m.id, name: m.name })));
  await press(page, P, '[data-act=find]', 'TÌM TRẬN');
  await page.waitForFunction(() => VS.lobby.screen() === 'queue', null, { timeout: 5000 });
  await quiet(page);
  const q0 = await page.evaluate(() => ({
    title: document.querySelector('.vs-q-title').textContent, est: document.querySelector('.vs-q-est').textContent, clock: document.querySelector('.vs-q-clock').textContent,
    seats: document.querySelectorAll('.vs-seat').length, diverSeats: document.querySelectorAll('.vs-team-diver .vs-seat').length, sharkSeats: document.querySelectorAll('.vs-team-shark .vs-seat').length,
    on: document.querySelectorAll('.vs-seat.on').length, meSeat: !!document.querySelector('.vs-team-shark .vs-seat.me'), cancel: !!document.querySelector('[data-act=cancel]')
  }));
  T.check(P + 'màn ghép: "ĐANG TÌM TRẬN · PHE CÁ MẬP", đồng hồ 0:0x, ước tính ~0:09, nút HUỶ',
    /^ĐANG TÌM TRẬN\s*·\s*PHE CÁ MẬP$/.test(q0.title) && /^0:0\d$/.test(q0.clock) && /0:09/.test(q0.est) && q0.cancel, JSON.stringify(q0));
  T.check(P + '6 ghế (4 thợ lặn, 2 cá mập); lúc đầu chỉ ghế của bạn (cá mập) đã đầy', q0.seats === 6 && q0.diverSeats === 4 && q0.sharkSeats === 2 && q0.on >= 1 && q0.meSeat, JSON.stringify(q0));
  await audit(page, P, 'ghép trận lúc đầu', true);

  // chờ ghế đầy hết rồi tới màn bốc bản đồ; nội dung ghế và vị trí thẻ đích đọc từ ảnh chụp trong trang, thời điểm từ bộ ghi
  await page.waitForFunction(() => window.__log.queueFull, null, { timeout: 20000 });
  const qf = await page.evaluate(() => window.__log.queueFull);
  const seatsInfo = qf.seats, meSeat = !!qf.shark0 && qf.shark0.me && qf.shark0.name === sv.name;
  await page.waitForFunction(() => window.__log.landInfo, null, { timeout: 20000 });
  const log = await page.evaluate(() => window.__log);
  const at = (name) => (log.screens.filter((e) => e[1] === name).pop() || [NaN])[0];
  const qStart = at('queue'), mapStart = at('map');
  const seq = log.seats.filter((e) => e[0] >= qStart && e[0] < mapStart);
  const full = seq.find((e) => e[1] === 6);
  const filledAt = full ? (full[0] - qStart) / 1000 : NaN;
  const counts = seq.map((e) => e[1]);
  T.check(P + 'ghế đầy dần từng người một tới đủ 6, không có bước nhảy lùi', counts.every((n, i) => i === 0 || n > counts[i - 1]) && counts[counts.length - 1] === 6 && counts.length >= 4, counts.join('→'));
  T.check(P + 'đủ 6 người sau ' + filledAt.toFixed(2) + ' s (khoảng 3-12 s)', filledAt >= 2.9 && filledAt <= 12.3, filledAt.toFixed(2));
  const gaps = seq.slice(1).map((e, i) => (e[0] - seq[i][0]) / 1000);
  T.check(P + 'các ghế không vào cùng một lúc: khoảng cách giữa hai lần vào lớn nhất ≥ 0,25 s', Math.max.apply(null, gaps) >= 0.25, gaps.map((g) => g.toFixed(2)).join(', '));
  T.check(P + 'mỗi ghế đầy có tên, cấp và ping (Lv.n · n ms), 6 tên khác nhau',
    seatsInfo.length === 6 && seatsInfo.every((s) => s.name && /^Lv\.\d+ · \d+ ms$/.test(s.meta)) && new Set(seatsInfo.map((s) => s.name)).size === 6, JSON.stringify(seatsInfo.slice(0, 2)));
  T.check(P + 'ghế của bạn thuộc phe cá mập và đứng đầu đội cá mập, dùng đúng tên người chơi', meSeat);
  const landedAt = log.landed.slice(-1)[0];
  const spin = (landedAt[0] - mapStart) / 1000;
  T.check(P + 'bốc bản đồ chạy ' + spin.toFixed(2) + ' s (khoảng 1,6 s) rồi dừng', spin >= 1.4 && spin <= 3.2, spin.toFixed(2));
  const land = log.landInfo;
  const mapName = (mapsInfo.find((m) => m.id === land.map) || {}).name;
  T.check(P + 'dừng đúng MỘT bản đồ thuộc VS.MAPS, thẻ đó nằm chính giữa khung (lệch ' + land.off.toFixed(1) + ' px, ≤ 3) và hiện tên bản đồ',
    mapsInfo.some((m) => m.id === land.map) && land.locks === 1 && land.cardMap === land.map && land.off <= 3 && land.name === mapName, JSON.stringify(land));
  T.check(P + 'vòng quay có đủ mọi bản đồ trong kho (' + mapsInfo.length + ' bản)', land.cards === mapsInfo.length, land.cards);

  await page.waitForFunction(() => window.__log.versusInfo, null, { timeout: 20000 });
  const vs = await page.evaluate(() => window.__log.versusInfo);
  T.check(P + 'màn đối đầu: 4 thợ lặn và 2 cá mập đứng hai bên, mỗi người có chân dung, tên, cấp, ping',
    vs.diver.length === 4 && vs.shark.length === 2 && vs.diver.concat(vs.shark).every((p) => p.n && /^Lv\.\d+$/.test(p.lv) && /^\d+ ms$/.test(p.ping) && p.ch && p.pt), JSON.stringify(vs));
  T.check(P + 'bên cá mập, ghế đầu là bạn (khung vàng) với đúng con ' + 'cá mập đang chọn; tên bản đồ khớp bản vừa bốc', vs.shark[0].me && vs.shark[1].me === false && vs.map === mapName, JSON.stringify([vs.shark[0], vs.map, mapName]));

  await page.waitForFunction(() => window.__starts.length === 1, null, { timeout: 12000 });
  const log2 = await page.evaluate(() => window.__log);
  const versusStart = (log2.screens.filter((e) => e[1] === 'versus').pop() || [NaN])[0];
  const cd = log2.counts.filter((e) => e[0] >= versusStart);
  T.check(P + 'đếm ngược 3 → 2 → 1, mỗi số cách nhau khoảng 1 s', cd.map((e) => e[1]).join('') === '321' && cd.every((e, i) => i === 0 || Math.abs((e[0] - cd[i - 1][0]) - 1000) < 450), cd.map((e) => e[1] + '@' + Math.round(e[0] - versusStart)).join(' '));
  const st = await page.evaluate(() => window.__starts[0]);
  const cfg = st.cfg;
  T.check(P + 'sau đếm ngược gọi VS.lobby.onStart đúng một lần, khoảng 3 s sau khi vào màn đối đầu', Math.abs((st.at - versusStart) / 1000 - 3) < 0.7, ((st.at - versusStart) / 1000).toFixed(2));
  const humans = cfg.lineup.filter((x) => x.ctrl === 'human');
  T.check(P + 'cfg: seed là số nguyên không dấu, mapId đúng bản vừa bốc và thuộc VS.MAPS, lineup 6 ghế (4 thợ lặn rồi 2 cá mập)',
    Number.isInteger(cfg.seed) && cfg.seed >= 0 && cfg.seed < 4294967296 && cfg.mapId === land.map && cfg.lineup.length === 6 && cfg.lineup.map((x) => x.team).join() === 'diver,diver,diver,diver,shark,shark', JSON.stringify(cfg).slice(0, 200));
  const me = cfg.lineup[4];
  T.check(P + 'cfg: người chơi là một con cá mập (ghế 4) với đúng nhân vật save.pick.shark, tên người chơi, và là người duy nhất ctrl human',
    humans.length === 1 && !!me && me.ctrl === 'human' && me.team === 'shark' && me.defId === sv.pick.shark && me.name === sv.name, JSON.stringify(me));
  T.check(P + 'cfg: 5 ghế còn lại là bot có tên khác nhau, nhân vật có thật, cùng đội không trùng nhân vật', await page.evaluate((lineup) => {
    const bots = lineup.filter((x) => x.ctrl === 'bot');
    const ok = bots.length === 5 && new Set(lineup.map((x) => x.name)).size === 6 && bots.every((x) => (x.team === 'shark' ? VS.SHARKS : VS.DIVERS)[x.defId]);
    const dupe = ['diver', 'shark'].some((t) => { const ids = lineup.filter((x) => x.team === t).map((x) => x.defId); return new Set(ids).size !== ids.length; });
    return ok && !dupe;
  }, cfg.lineup));

  // tải trận: khung tải hiện tên bản đồ, thanh tiến độ chạy theo VS.lobby.loading, rồi match ẩn #ui
  T.check(P + 'ngay sau onStart màn chuyển sang "tải trận" và hiện tên bản đồ', (await screenOf(page)) === 'loading' && (await textOf(page, '.vs-l-map')) === mapName, (await textOf(page, '.vs-l-map')));
  await page.evaluate(() => VS.lobby.loading(0.5, { mapId: document.querySelector('.vs-s-loading').dataset.map }));
  await page.waitForTimeout(400);
  const ld = await page.evaluate(() => ({ pct: document.querySelector('.vs-l-pct').textContent, w: document.querySelector('.vs-lbar > i').style.width, tip: document.querySelector('.vs-tip').textContent, map: document.querySelector('.vs-l-map').textContent, theme: document.querySelector('.vs-l-theme').textContent }));
  T.check(P + 'VS.lobby.loading(0.5) đặt thanh 50%, hiện mẹo chơi, tên và chủ đề bản đồ', ld.pct === '50%' && ld.w === '50%' && /^MẸO /.test(ld.tip) && ld.tip.length > 20 && ld.map === mapName && ld.theme.length > 0, JSON.stringify(ld));
  await audit(page, P, 'tải trận');
  await snap('loading');
  await page.evaluate(() => VS.lobby.show('match'));
  const m = await page.evaluate(() => { const ui = document.getElementById('ui'); const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { hidden: ui.hidden, display: getComputedStyle(ui).display, hit: t && t.id, screen: VS.lobby.screen() }; });
  T.check(P + 'màn "match": #ui ẩn hẳn, chuột/cảm ứng rơi xuống canvas #gl', m.hidden && m.display === 'none' && m.hit === 'gl' && m.screen === 'match', JSON.stringify(m));
  await page.evaluate(() => VS.lobby.show('lobby'));
  T.check(P + 'từ "match" về sảnh thì #ui hiện lại', await page.evaluate(() => !document.getElementById('ui').hidden && VS.lobby.screen() === 'lobby'));
}

// Trang riêng với đồng hồ giả (page.clock): thời gian đứng yên cho tới khi bài kiểm bước từng đoạn. Nhờ vậy chụp được
// hàng đợi dở dang, màn bốc bản đồ đã dừng và màn đối đầu mà không phụ thuộc máy chậm hay nhanh, và chứng minh HUỶ dừng hẳn
// bằng cách cho 20 giây giả trôi qua. Hoạt ảnh CSS/Web Animations vẫn chạy bằng đồng hồ thật.
async function runFrozen(br, srv, vp) {
  const P = '[' + vp.name + '] ';
  console.log(P + 'đồng hồ giả: hàng đợi dở dang, HUỶ, bản đồ đã dừng, đếm ngược');
  const { page, ctx, problems } = await T.open(br, srv.base, 'index.html', { width: vp.width, height: vp.height });
  const snap = async (n) => T.shot(page, 'w3-' + n + '-' + vp.name);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await instrument(page);

  // (a) hàng đợi dở dang rồi HUỶ
  await press(page, P, '.vs-side-shark', 'thẻ CÁ MẬP');
  await press(page, P, '[data-act=find]', 'TÌM TRẬN');
  await page.waitForFunction(() => VS.lobby.screen() === 'queue');
  let filled = 0;
  for (let i = 0; i < 40; i++) {
    filled = await page.evaluate(() => document.querySelectorAll('.vs-seat.on').length);
    if (filled >= 3 && filled <= 5) break;
    await page.clock.runFor(400);
  }
  const q = await page.evaluate(() => ({ clock: document.querySelector('.vs-q-clock').textContent, status: document.querySelector('.vs-q-status').textContent, counts: [...document.querySelectorAll('.vs-q-n')].map((e) => e.textContent), screen: VS.lobby.screen() }));
  T.check(P + 'dừng đồng hồ khi đã đầy ' + filled + '/6 ghế (3-5): màn vẫn là ghép trận, dòng trạng thái và đếm theo phe khớp số ghế',
    q.screen === 'queue' && filled >= 3 && filled <= 5 && q.status === 'Đã tìm thấy ' + filled + '/6 người chơi…' && q.counts.reduce((a, c) => a + parseInt(c, 10), 0) === filled, JSON.stringify(q));
  T.check(P + 'đồng hồ đếm "Đã chờ" đúng bằng thời gian đã trôi (' + q.clock + ')', /^0:0\d$|^0:1[0-2]$/.test(q.clock), q.clock);
  await audit(page, P, 'ghép trận dở dang', true);
  await snap('queue');
  await press(page, P, '[data-act=cancel]', 'HUỶ');
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby');
  T.check(P + 'HUỶ khi ' + filled + '/6 ghế đã đầy → về sảnh, không còn phần tử ghép trận', await page.evaluate(() => !document.querySelector('.vs-seat, .vs-q-head')));
  await page.clock.runFor(20000);
  const later = await page.evaluate(() => ({ screen: VS.lobby.screen(), starts: window.__starts.length, seats: document.querySelectorAll('.vs-seat').length, maps: document.querySelectorAll('.vs-s-map').length }));
  T.check(P + 'cho 20 giây giả trôi sau HUỶ: vẫn ở sảnh, không sang bản đồ, không gọi onStart (bộ đếm giờ đã dừng hẳn)', later.screen === 'lobby' && later.starts === 0 && later.seats === 0 && later.maps === 0, JSON.stringify(later));

  // (b) bản đồ: chạy hoạt ảnh thật, dừng đúng ô, giữ nguyên vì thời gian giả đang đứng
  const plan = await page.evaluate(() => { const sv = VS.save.current; return VS.mmk.lineup(sv, 'shark', VS.rng(31)); });
  await page.evaluate((p) => VS.lobby.show('map', { plan: p }), plan);
  await page.clock.runFor(100);
  await page.waitForTimeout(700);
  await snap('map-spin');
  await page.waitForFunction(() => document.querySelector('.vs-s-map').dataset.landed === '1', null, { timeout: 15000, polling: 100 });
  const land = await page.evaluate(() => {
    const view = document.querySelector('.vs-roul').getBoundingClientRect(), c = document.querySelector('.vs-mc.lock').getBoundingClientRect();
    return { map: document.querySelector('.vs-s-map').dataset.map, locks: document.querySelectorAll('.vs-mc.lock').length, off: Math.abs(c.left + c.width / 2 - (view.left + view.width / 2)) };
  });
  T.check(P + 'vòng quay dừng đúng bản đồ của kế hoạch ghép trận (' + plan.mapId + '), đúng một thẻ sáng, tâm thẻ lệch tâm khung ' + land.off.toFixed(1) + ' px (≤ 2)', land.map === plan.mapId && land.locks === 1 && land.off <= 2, JSON.stringify(land));
  await audit(page, P, 'bản đồ đã dừng', true);
  await snap('map-landed');
  await page.clock.runFor(1200);
  T.check(P + 'sau thời gian giữ màn hình, tự sang màn đối đầu', (await screenOf(page)) === 'versus');

  // (c) đối đầu: đếm ngược đúng 3 → 2 → 1 từng giây rồi gọi onStart với đúng kế hoạch
  await quiet(page);
  const c3 = await page.evaluate(() => ({ n: document.querySelector('.vs-count').textContent, starts: window.__starts.length }));
  await audit(page, P, 'đối đầu');
  await snap('versus');
  await page.clock.runFor(1000);
  const c2 = await textOf(page, '.vs-count');
  await page.clock.runFor(1000);
  const c1 = await textOf(page, '.vs-count');
  const before = await page.evaluate(() => window.__starts.length);
  await page.clock.runFor(1000);
  const st = await page.evaluate(() => ({ starts: window.__starts.map((x) => x.cfg), screen: VS.lobby.screen() }));
  T.check(P + 'đếm ngược đúng từng giây: 3 → 2 → 1, chưa gọi onStart cho tới hết giây thứ ba', c3.n === '3' && c3.starts === 0 && c2 === '2' && c1 === '1' && before === 0, [c3.n, c2, c1, before].join(' '));
  T.check(P + 'hết giây thứ ba: onStart được gọi đúng một lần với cfg = { seed, mapId, lineup } đúng như kế hoạch ghép trận, màn chuyển sang tải trận',
    st.starts.length === 1 && st.starts[0].seed === plan.seed && st.starts[0].mapId === plan.mapId && JSON.stringify(st.starts[0].lineup) === JSON.stringify(plan.lineup) && st.screen === 'loading', JSON.stringify([st.starts.length, st.screen]));
  await ctx.close();
  return problems;
}

async function flowGacha(page, P, snap) {
  console.log(P + 'gacha banner cá mập: Quay 10');
  const before = await saveOf(page);
  await press(page, P, '[data-act=gacha]', 'Gacha');
  await page.waitForFunction(() => VS.lobby.screen() === 'gacha');
  await press(page, P, '[data-act=banner-ham-rang]', 'tab banner cá mập');
  await page.waitForFunction(() => document.querySelector('.vs-btab.shark.on'));
  const g = await page.evaluate(() => {
    const b = VS.gacha.banner('ham-rang'), f = VS.gacha.featured(b, VS.save.dayIndex()), sv = VS.save.current;
    return {
      f5: VS.SHARKS[f[5]].name, f4: f[4].map((id) => VS.SHARKS[id].name), sure: VS.gacha.sureAt(b), n5: sv.pity['ham-rang'].n5, soft: b.soft, cost: b.cost,
      domF5: document.querySelector('.vs-g5-name').textContent, domF4: [...document.querySelectorAll('.vs-g4c .vs-g4n')].map((e) => e.textContent),
      pityMain: document.querySelector('.vs-pity-main').textContent, rates: [...document.querySelectorAll('.vs-rrow')].map((r) => r.textContent),
      b1: document.querySelector('[data-act=pull1] .vs-pull-t').textContent + '|' + document.querySelector('[data-act=pull1] .vs-pull-c').textContent,
      b10: document.querySelector('[data-act=pull10] .vs-pull-t').textContent + '|' + document.querySelector('[data-act=pull10] .vs-pull-c').textContent
    };
  });
  T.check(P + 'banner cá mập hiện đúng 5★ lớn và hai 4★ nhỏ của hôm nay', g.domF5 === g.f5 && g.domF4.length === 2 && g.domF4.join() === g.f4.join(), JSON.stringify([g.domF5, g.domF4, g.f5, g.f4]));
  T.check(P + 'hiện "Còn ' + (g.sure - g.n5) + ' lượt chắc chắn ra 5★" (bảo hiểm ' + g.sure + ' lượt) và bảng tỉ lệ 5★/4★/3★', g.pityMain === 'Còn ' + (g.sure - g.n5) + ' lượt chắc chắn ra 5★' && g.rates.length === 3 && /^5★/.test(g.rates[0]) && /^4★/.test(g.rates[1]) && /^3★/.test(g.rates[2]), g.pityMain + ' | ' + g.rates.join(' / '));
  T.check(P + 'nút "Quay 1" ghi 160 và "Quay 10" ghi 1600', g.b1 === 'Quay 1|160' && g.b10 === 'Quay 10|1600', g.b1 + ' / ' + g.b10);
  await audit(page, P, 'gacha cá mập');
  await snap('gacha-shark');

  await press(page, P, '[data-act=pull10]', 'Quay 10');
  await page.waitForSelector('.vs-reveal');
  await page.waitForFunction(() => document.querySelectorAll('.vs-rc').length === 10);
  const down0 = await page.evaluate(() => document.querySelectorAll('.vs-rc:not(.up)').length);
  T.check(P + 'mười thẻ hiện ra úp mặt trước khi lật', down0 >= 9, down0);
  await page.waitForTimeout(1300);
  await snap('gacha-reveal-mid');
  await page.waitForFunction(() => document.querySelectorAll('.vs-rc.up').length === 10 && !document.querySelector('.vs-rv-done').disabled, null, { timeout: 15000 });
  await quiet(page);
  await snap('gacha-reveal');
  const rv = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.vs-rc')].map((c) => ({ id: c.dataset.id, rarity: +c.dataset.rarity, isNew: c.classList.contains('isnew'), note: c.querySelector('.vs-rc-note').textContent, badge: !!c.querySelector('.vs-rc-new'), name: c.querySelector('.vs-rc-n').textContent, stars: c.querySelectorAll('.vs-rc-f .vs-star').length }));
    return { cards, flips: window.__log.flips.slice(-10), pearls: document.querySelector('[data-pearls]').textContent };
  });
  T.check(P + 'đủ 10 thẻ đã lật', rv.cards.length === 10 && rv.flips.length === 10);
  const order = rv.flips.map((f) => f[2]);
  T.check(P + 'thứ tự lật tăng dần theo bậc: bậc cao nhất lật sau cùng (' + order.join('') + ')', order.every((r, i) => i === 0 || r >= order[i - 1]) && order[9] === Math.max.apply(null, order), order.join(','));
  const span = (rv.flips[9][0] - rv.flips[0][0]) / 1000;
  T.check(P + 'các thẻ lật lần lượt chứ không đồng loạt (trải ' + span.toFixed(2) + ' s)', span >= 1.0 && span < 6, span.toFixed(2));

  // đối chiếu với sổ sách tính độc lập từ save trước và sau
  const afterSave = await saveOf(page);
  const eco = await page.evaluate(() => VS.TUNING.economy.dupeRefund), tableRar = await page.evaluate(() => Object.fromEntries(Object.keys(VS.SHARKS).map((id) => [id, VS.SHARKS[id].rarity])));
  const have = Object.assign({}, before.owned.shark);
  let refunds = 0, bookOk = true, noteOk = true, newOk = true;
  rv.cards.forEach((c) => {
    const prev = have[c.id] || 0, isNew = prev === 0, refund = isNew ? 0 : eco[tableRar[c.id]];
    if (c.isNew !== isNew || c.badge !== isNew) newOk = false;
    if (isNew ? c.note !== 'MỚI' : c.note !== 'Trùng · +' + refund + ' ngọc trai') noteOk = false;
    if (c.rarity !== tableRar[c.id] || c.stars !== c.rarity) bookOk = false;
    refunds += refund; have[c.id] = prev + 1;
  });
  T.check(P + 'thẻ MỚI có huy hiệu NEW, thẻ trùng ghi "Trùng · +N ngọc trai" đúng bảng đổi theo bậc, số sao hiển thị = bậc', newOk && noteOk && bookOk, JSON.stringify(rv.cards.map((c) => c.note)));
  T.check(P + 'kho nhân vật trong save sau khi quay khớp sổ sách tính riêng (mỗi lần ra +1 bản)', JSON.stringify(afterSave.owned.shark) === JSON.stringify(have) || (Object.keys(have).length === Object.keys(afterSave.owned.shark).length && Object.keys(have).every((id) => afterSave.owned.shark[id] === have[id])), JSON.stringify(afterSave.owned.shark));
  T.check(P + 'ngọc trai: −1600 và + ' + refunds + ' ngọc hoàn từ bản trùng = ' + (before.pearls - 1600 + refunds) + ' (cả trên màn lẫn trong save)',
    afterSave.pearls === before.pearls - 1600 + refunds && numOf(rv.pearls) === afterSave.pearls && refunds > 0, JSON.stringify([before.pearls, afterSave.pearls, refunds, rv.pearls]));
  let n5 = before.pity['ham-rang'].n5, n4 = before.pity['ham-rang'].n4;
  rv.cards.forEach((c) => { n5++; n4++; if (c.rarity === 5) { n5 = 0; n4 = 0; } else if (c.rarity === 4) n4 = 0; });
  T.check(P + 'bộ đếm pity của banner cá mập khớp sổ sách tính riêng theo thứ tự ra thẻ (n5 = ' + n5 + ', n4 = ' + n4 + ')', afterSave.pity['ham-rang'].n5 === n5 && afterSave.pity['ham-rang'].n4 === n4, JSON.stringify(afterSave.pity['ham-rang']));
  T.check(P + 'banner thợ lặn không bị đụng tới', JSON.stringify(afterSave.pity['den-vuc']) === JSON.stringify(before.pity['den-vuc']) && JSON.stringify(afterSave.owned.diver) === JSON.stringify(before.owned.diver));
  await audit(page, P, 'kết quả quay', true);
  await press(page, P, '[data-act=done]', 'Xong');
  await page.waitForFunction(() => !document.querySelector('.vs-reveal'));
  const pity = await page.evaluate(() => ({ main: document.querySelector('.vs-pity-main').textContent, n5: VS.save.current.pity['ham-rang'].n5, sure: VS.gacha.sureAt(VS.gacha.banner('ham-rang')) }));
  T.check(P + 'bấm Xong: thẻ đóng, "Còn N lượt" cập nhật theo pity mới', pity.main === 'Còn ' + (pity.sure - pity.n5) + ' lượt chắc chắn ra 5★', pity.main);
  return { before, afterSave };
}

async function flowPoor(page, P) {
  console.log(P + 'gacha thiếu ngọc');
  await page.evaluate(() => { VS.save.current.pearls = 100; VS.save.store(VS.save.current); VS.lobby.show('gacha'); });
  await quiet(page);
  const a = await page.evaluate(() => ({ b1: document.querySelector('[data-act=pull1]').disabled, b10: document.querySelector('[data-act=pull10]').disabled, reason: document.querySelector('.vs-reason').textContent, pearls: document.querySelector('[data-pearls]').textContent }));
  T.check(P + 'còn 100 ngọc: cả Quay 1 và Quay 10 bị khoá, ghi rõ lý do "Thiếu 60 ngọc trai (có 100, cần 160)"', a.b1 && a.b10 && a.reason === 'Thiếu 60 ngọc trai (có 100, cần 160)', JSON.stringify(a));
  await press(page, P, '[data-act=pull1]', 'Quay 1 (đang khoá)');
  await page.waitForTimeout(400);
  T.check(P + 'bấm nút đang khoá không làm gì: không mở thẻ, ngọc vẫn 100', (await page.evaluate(() => !document.querySelector('.vs-reveal') && VS.save.current.pearls === 100)));
  await page.evaluate(() => { VS.save.current.pearls = 200; VS.save.store(VS.save.current); VS.lobby.show('gacha'); });
  await quiet(page);
  const b = await page.evaluate(() => ({ b1: document.querySelector('[data-act=pull1]').disabled, b10: document.querySelector('[data-act=pull10]').disabled, reason: document.querySelector('.vs-reason').textContent }));
  T.check(P + 'còn 200 ngọc: Quay 1 mở, Quay 10 khoá với lý do "Thiếu 1400 ngọc trai (có 200, cần 1600)"', !b.b1 && b.b10 && b.reason === 'Thiếu 1400 ngọc trai (có 200, cần 1600)', JSON.stringify(b));
  await page.evaluate(() => { VS.save.current.pearls = 1600; VS.save.store(VS.save.current); VS.lobby.show('gacha'); });
  await quiet(page);
  T.check(P + 'còn đúng 1600: cả hai nút mở, không còn dòng lý do', await page.evaluate(() => !document.querySelector('[data-act=pull1]').disabled && !document.querySelector('[data-act=pull10]').disabled && document.querySelector('.vs-reason').textContent === ''));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby', null, { timeout: 3000 });
  T.check(P + 'phím Esc trong gacha quay về sảnh', (await screenOf(page)) === 'lobby');
}

async function flowRoster(page, P, snap, afterGacha) {
  console.log(P + 'tải lại trang → bộ sưu tập → chọn cá mập mới');
  const ownedIds = Object.keys(afterGacha.afterSave.owned.shark);
  await page.reload();
  await boot(page);
  const persisted = await saveOf(page);
  T.check(P + 'sau khi tải lại, kho cá mập vẫn còn nguyên (save lưu bền)', Object.keys(persisted.owned.shark).length === ownedIds.length && ownedIds.every((id) => persisted.owned.shark[id] === afterGacha.afterSave.owned.shark[id]), JSON.stringify(persisted.owned.shark));
  T.check(P + 'sau khi tải lại, phe đã chọn (cá mập) vẫn là cá mập', (await page.evaluate(() => document.querySelector('.vs-side-shark').classList.contains('on'))));
  await press(page, P, '[data-act=change-shark]', 'Đổi (thẻ cá mập)');
  await page.waitForFunction(() => VS.lobby.screen() === 'roster');
  await page.waitForSelector('.vs-ch');
  const tabState = await page.evaluate(() => ({ shark: document.querySelector('[data-act=tab-shark]').getAttribute('aria-selected'), diver: document.querySelector('[data-act=tab-diver]').getAttribute('aria-selected'), cards: document.querySelectorAll('.vs-ch').length, cur: document.querySelector('.vs-ch.cur').dataset.id }));
  T.check(P + '"Đổi" mở bộ sưu tập ngay tab CÁ MẬP với 12 loài, loài đang dùng được đánh dấu', tabState.shark === 'true' && tabState.diver === 'false' && tabState.cards === 12 && tabState.cur === persisted.pick.shark, JSON.stringify(tabState));
  const r = await page.evaluate(() => ({
    own: [...document.querySelectorAll('.vs-ch[data-own="1"]')].map((c) => c.dataset.id), lock: document.querySelectorAll('.vs-ch[data-own="0"]').length,
    tab: document.querySelector('[data-act=tab-shark] small').textContent
  }));
  T.check(P + 'danh sách ghi đúng các loài đã sở hữu (' + ownedIds.length + '/12) và phần còn lại bị khoá', r.own.length === ownedIds.length && ownedIds.every((id) => r.own.includes(id)) && r.lock === 12 - ownedIds.length && r.tab === ownedIds.length + '/12', JSON.stringify(r));
  T.check(P + 'sau Quay 10 kho cá mập có thêm ít nhất một loài mới ngoài Cá Mập Vây Đen', r.own.length >= 2 && r.own.includes('Blacktip_Reefshark'), r.own.join(','));
  await audit(page, P, 'bộ sưu tập (cá mập)');
  await snap('roster-shark');

  // chọn một loài mới có được
  const target = r.own.find((id) => id !== 'Blacktip_Reefshark');
  const targetName = await page.evaluate((id) => VS.SHARKS[id].name, target);
  await press(page, P, '.vs-ch[data-id="' + target + '"]', 'thẻ ' + targetName);
  await page.waitForFunction((id) => document.querySelector('.vs-ch.sel') && document.querySelector('.vs-ch.sel').dataset.id === id, target);
  const det = await page.evaluate((id) => {
    const d = VS.SHARKS[id], sk = VS.SKILL_DATA[d.skill];
    return { name: document.querySelector('.vs-det-name').textContent, skill: document.querySelector('.vs-sk-name').textContent, desc: document.querySelector('.vs-sk-desc').textContent, want: { name: d.name, skill: sk.name, desc: sk.desc },
      stats: [...document.querySelectorAll('.vs-stat')].map((s) => s.textContent), own: document.querySelector('.vs-det-sao').textContent, act: document.querySelector('.vs-det-act button').dataset.act, hp: d.hp, bite: d.bite };
  }, target);
  T.check(P + 'khung chi tiết: tên, tên kỹ năng và mô tả lấy từ VS.SKILL_DATA, đủ 4 chỉ số (máu, tốc độ, lao, cắn)', det.name === det.want.name && det.skill === det.want.skill && det.desc === det.want.desc && det.stats.length === 4 &&
    det.stats[0].includes(String(det.hp)) && det.stats[3].includes(String(det.bite)), JSON.stringify(det.stats));
  T.check(P + 'khung chi tiết hiện số bản sao đã có và nút CHỌN', /Đã có/.test(det.own) && det.act === 'select', det.own + ' / ' + det.act);
  await audit(page, P, 'chi tiết cá mập mới');
  await press(page, P, '[data-act=select]', 'CHỌN');
  await page.waitForFunction((id) => VS.save.current.pick.shark === id, target);
  T.check(P + 'CHỌN ghi pick.shark vào save, thẻ thành "ĐANG DÙNG" và nút đổi thành ĐANG DÙNG (khoá)',
    (await saveOf(page)).pick.shark === target && (await page.evaluate((id) => document.querySelector('.vs-ch.cur').dataset.id === id && document.querySelector('.vs-det-act button').dataset.act === 'current' && document.querySelector('.vs-det-act button').disabled, target)));
  // thợ lặn chưa có: khoá
  await press(page, P, '[data-act=tab-diver]', 'tab THỢ LẶN');
  await page.waitForFunction(() => document.querySelector('[data-act=tab-diver]').getAttribute('aria-selected') === 'true');
  await press(page, P, '.vs-ch[data-id="vy"]', 'thẻ Vy (chưa có)');
  await page.waitForFunction(() => document.querySelector('.vs-ch.sel') && document.querySelector('.vs-ch.sel').dataset.id === 'vy');
  const lk = await page.evaluate(() => ({ act: document.querySelector('.vs-det-act button').dataset.act, dis: document.querySelector('.vs-det-act button').disabled, text: document.querySelector('.vs-det-act button').textContent, toGacha: !!document.querySelector('[data-act=to-gacha]'), pick: VS.save.current.pick.diver }));
  T.check(P + 'thợ lặn chưa sở hữu: nút CHƯA SỞ HỮU bị khoá, có đường tới Gacha, không đổi được pick', lk.act === 'locked' && lk.dis && lk.text === 'CHƯA SỞ HỮU' && lk.toGacha && lk.pick === 'dave', JSON.stringify(lk));
  await audit(page, P, 'bộ sưu tập (thợ lặn)');
  await snap('roster-diver');

  // quay về sảnh: thẻ cá mập hiện nhân vật vừa chọn
  await press(page, P, '[data-act=back]', 'Sảnh');
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby');
  const lob = await page.evaluate(() => ({ name: document.querySelector('.vs-side-shark .vs-ch-name').textContent, skill: document.querySelector('.vs-side-shark .vs-side-skill b').textContent, pick: VS.save.current.pick.shark }));
  const want = await page.evaluate((id) => ({ name: VS.SHARKS[id].name, skill: VS.SKILL_DATA[VS.SHARKS[id].skill].name }), target);
  T.check(P + 'về sảnh: thẻ CÁ MẬP hiện loài vừa chọn (' + want.name + ') và kỹ năng của nó', lob.name === want.name && lob.skill === want.skill && lob.pick === target, JSON.stringify(lob));
  await snap('lobby-new-shark');
  return target;
}

async function flowResult(page, P, snap, target) {
  console.log(P + 'kết quả trận');
  // Trận đã kết thúc dựng tay: người chơi là cá mập (ghế 4) với con vừa chọn. Phần thưởng lấy từ chính VS.meta.settle.
  const out = await page.evaluate((target) => {
    const blank = () => ({ banked: 0, revives: 0, dmg: 0, bites: 0, downs: 0, outs: 0, sharkOuts: 0 });
    const L = [['diver', 'dave', 'Minh Khôi', 'bot', { banked: 220, dmg: 48, outs: 1, revives: 1 }], ['diver', 'hai', 'SushiChua', 'bot', { banked: 0, outs: 2, revives: 2 }],
      ['diver', 'lan', 'Hải Đăng', 'bot', { banked: 130, dmg: 90 }], ['diver', 'bao', 'Lan Anh', 'bot', { banked: 40 }],
      ['shark', target, 'Bạn', 'human', { downs: 6, outs: 3, dmg: 12 }], ['shark', 'Frilled_Shark', 'ChuMuc_99', 'bot', { downs: 3, outs: 1 }]];
    const m = { mapId: VS.MAPS[0].id, t: 200, result: { winner: 'shark', reason: 'x' }, actors: L.map((a, i) => ({ id: i, team: a[0], defId: a[1], name: a[2], ctrl: a[3], stats: Object.assign(blank(), a[4]) })) };
    const sv = VS.save.current, p0 = sv.pearls, e0 = sv.exp;
    const rw = VS.meta.settle(sv, m, 4, VS.save.dayIndex());
    VS.save.store(sv);
    VS.lobby.showResult(m, rw);
    window.__m = m;
    return { rw, p0, p1: sv.pearls, e0, e1: sv.exp, level: sv.level };
  }, target);
  await page.waitForFunction(() => VS.lobby.screen() === 'result');
  await page.waitForTimeout(1700);   // đếm lên xong
  const d = await page.evaluate(() => ({
    banner: document.querySelector('.vs-banner-t').textContent, side: document.querySelector('.vs-banner-s b').textContent, rows: document.querySelectorAll('.vs-tbl-row').length,
    sides: [...document.querySelectorAll('.vs-tbl-side')].map((s) => s.textContent), heads: [...document.querySelectorAll('.vs-tbl th')].map((t) => t.textContent),
    table: [...document.querySelectorAll('.vs-tbl-row')].map((r) => ({ who: r.querySelector('.vs-who b').textContent, me: r.classList.contains('me'), cells: [...r.querySelectorAll('.vs-tbl-n')].map((c) => +c.textContent), keys: [...r.querySelectorAll('.vs-tbl-n')].map((c) => c.dataset.k) })),
    total: document.querySelector('.vs-rew-total').textContent, list: [...document.querySelectorAll('.vs-rew-list li')].map((l) => l.textContent), expHead: document.querySelector('.vs-rew-exp-h').textContent,
    again: !!document.querySelector('[data-act=again]'), leave: !!document.querySelector('[data-act=leave]')
  }));
  T.check(P + 'cá mập thắng: banner "THẮNG" cho phe CÁ MẬP', d.banner === 'THẮNG' && d.side === 'CÁ MẬP' && out.rw.win === true, d.banner + ' ' + d.side);
  T.check(P + 'bảng thống kê đúng 6 hàng, 5 cột số (Kho báu, Hạ gục, Loại, Sát thương, Cứu), hàng của bạn được tô', d.rows === 6 && d.heads.join('|') === 'Người chơi|Kho báu|Hạ gục|Loại|Sát thương|Cứu' && d.table.filter((r) => r.me).length === 1 && d.table[4].me, JSON.stringify(d.heads));
  const order = ['banked', 'downs', 'outs', 'dmg', 'revives'];
  // mỗi hàng theo thứ tự cột [banked, downs, outs, dmg, revives] của đúng trận đã dựng ở trên
  const expect = [[220, 0, 1, 48, 1], [0, 0, 2, 0, 2], [130, 0, 0, 90, 0], [40, 0, 0, 0, 0], [0, 6, 3, 12, 0], [0, 3, 1, 0, 0]];
  T.check(P + 'từng ô trong bảng khớp đúng số liệu Actor.stats của trận đã dựng (6 hàng × 5 cột)', d.table.every((r, i) => r.keys.join() === order.join() && r.cells.join() === expect[i].join()), JSON.stringify(d.table.map((r) => r.cells)));
  T.check(P + 'hai nhãn phe: THỢ LẶN ghi THUA, CÁ MẬP ghi THẮNG', /THỢ LẶN.*THUA/.test(d.sides[0]) && /CÁ MẬP.*THẮNG/.test(d.sides[1]), JSON.stringify(d.sides));
  T.check(P + 'phần thưởng đếm lên tới đúng ' + out.rw.pearls + ' ngọc trai (thắng 140 + 6 điểm × 10 + ngày đầu nếu có), save tăng đúng chừng đó',
    numOf(d.total) === out.rw.pearls && out.p1 - out.p0 === out.rw.pearls && out.rw.points === 6, JSON.stringify([d.total, out.rw]));
  T.check(P + 'danh sách thưởng có dòng thắng trận, dòng điểm "Hạ 6 thợ lặn (6 điểm)" và exp +' + out.rw.exp, d.list.length >= 2 && /Thắng trận/.test(d.list[0]) && /Hạ 6 thợ lặn \(6 điểm\)/.test(d.list[1]) && /\+100 EXP/.test(d.expHead) &&
    (out.rw.firstWin ? d.list.some((l) => /đầu tiên trong ngày/.test(l)) : true), JSON.stringify(d.list));
  await audit(page, P, 'kết quả (thắng)');
  await snap('result-win');

  // VỀ SẢNH gọi onLeave
  await page.evaluate(() => { window.__leaves.length = 0; });
  await press(page, P, '[data-act=leave]', 'VỀ SẢNH');
  await page.waitForFunction(() => window.__leaves.length >= 1);
  const lv = await page.evaluate(() => ({ leaves: window.__leaves.length, screen: VS.lobby.screen() }));
  T.check(P + 'VỀ SẢNH gọi VS.lobby.onLeave() đúng một lần', lv.leaves === 1, JSON.stringify(lv));
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby');
  T.check(P + 'sau VỀ SẢNH, vì onLeave không tự đổi màn nên sảnh tự hiện lại', (await screenOf(page)) === 'lobby');

  // trận thua của thợ lặn, rồi CHƠI TIẾP: xếp hàng lại cùng phe
  await page.evaluate(() => {
    const blank = () => ({ banked: 0, revives: 0, dmg: 0, bites: 0, downs: 0, outs: 0, sharkOuts: 0 });
    const L = [['diver', 'dave', 'Bạn', 'human', { banked: 99, revives: 1, outs: 1 }], ['diver', 'hai', 'SushiChua', 'bot', { banked: 90 }], ['diver', 'lan', 'Hải Đăng', 'bot', {}], ['diver', 'bao', 'Lan Anh', 'bot', { banked: 40 }],
      ['shark', 'Tiger_Shark', 'ChuMuc_99', 'bot', { downs: 5, outs: 4 }], ['shark', 'Frilled_Shark', 'Mực Ống', 'bot', { downs: 2 }]];
    const m = { mapId: VS.MAPS[1].id, t: 240, result: { winner: 'shark', reason: 'x' }, actors: L.map((a, i) => ({ id: i, team: a[0], defId: a[1], name: a[2], ctrl: a[3], stats: Object.assign(blank(), a[4]) })) };
    VS.save.current.pick.team = 'diver';
    const rw = VS.meta.settle(VS.save.current, m, 0, VS.save.dayIndex());
    VS.lobby.showResult(m, rw);
  });
  await page.waitForFunction(() => VS.lobby.screen() === 'result');
  await page.waitForTimeout(1500);
  const lose = await page.evaluate(() => ({ banner: document.querySelector('.vs-banner-t').textContent, side: document.querySelector('.vs-banner-s b').textContent, cls: document.querySelector('.vs-banner').className }));
  T.check(P + 'thợ lặn thua: banner "THUA" cho phe THỢ LẶN, kiểu thua', lose.banner === 'THUA' && lose.side === 'THỢ LẶN' && /lose/.test(lose.cls), JSON.stringify(lose));
  await audit(page, P, 'kết quả (thua)');
  await snap('result-lose');
  await page.evaluate(() => { window.__leaves.length = 0; });
  await press(page, P, '[data-act=again]', 'CHƠI TIẾP');
  await page.waitForFunction(() => VS.lobby.screen() === 'queue');
  const again = await page.evaluate(() => ({ title: document.querySelector('.vs-q-title').textContent, leaves: window.__leaves.length }));
  T.check(P + 'CHƠI TIẾP xếp hàng lại ngay cùng phe (THỢ LẶN) và báo cho main dọn trận cũ (onLeave)', /PHE THỢ LẶN$/.test(again.title) && again.leaves === 1, JSON.stringify(again));
  await press(page, P, '[data-act=cancel]', 'HUỶ');
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby');
}

async function flowPortrait(page, P, snap, vp) {
  console.log(P + 'xoay ngang');
  const landscape = await page.evaluate(() => getComputedStyle(document.querySelector('.vs-rot')).display);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const p = await page.evaluate(() => {
    const r = document.querySelector('.vs-rot'), cs = getComputedStyle(r), b = r.getBoundingClientRect(), hit = document.elementFromPoint(innerWidth / 2, innerHeight / 3);
    return { display: cs.display, w: Math.round(b.width), h: Math.round(b.height), covers: !!hit && !!hit.closest('.vs-rot'), text: r.textContent };
  });
  await snap('portrait');
  T.check(P + 'màn dọc 390×844: lớp "Xoay ngang màn hình" phủ kín, đè lên mọi nút, còn ở màn ngang thì ẩn', landscape === 'none' && p.display === 'flex' && p.w === 390 && p.h === 844 && p.covers && /Xoay ngang màn hình/.test(p.text), JSON.stringify([landscape, p]));
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(250);
  T.check(P + 'xoay lại ngang thì lớp nhắc biến mất', (await page.evaluate(() => getComputedStyle(document.querySelector('.vs-rot')).display)) === 'none');
}

// VS.diverSheet (W2) chưa có trong nhánh này: giả lập để chứng minh sảnh dùng nó khi có mặt.
async function flowSheetMock(page, P) {
  console.log(P + 'chân dung qua VS.diverSheet');
  const r = await page.evaluate(async () => {
    const calls = [], shared = document.createElement('canvas');   // bản dùng chung: sảnh phải chép chứ không được giành nhau
    shared.width = shared.height = 16;
    const g0 = shared.getContext('2d'); g0.fillStyle = '#ff00ff'; g0.fillRect(0, 0, 16, 16);
    VS.diverSheet = { portrait(id, px) { calls.push([id, px]); return Promise.resolve(shared); } };
    VS.lobby.show('roster', { team: 'diver' });
    await new Promise((res) => setTimeout(res, 600));
    const cvs = [...document.querySelectorAll('.vs-grid .vs-pt-diver canvas')];
    const px = cvs.map((c) => { const g = c.getContext('2d').getImageData(8, 8, 1, 1).data; return [g[0], g[1], g[2]].join(); });
    const det = document.querySelector('.vs-det-pt canvas');
    return { calls: calls.length, n: cvs.length, allMagenta: px.every((q) => q === '255,0,255'), det: !!det && det !== shared, sharedFree: !shared.parentNode, ids: Object.keys(VS.DIVERS), asked: [...new Set(calls.map((c) => c[0]))], reqs: [...new Set(calls.map((c) => c[1]))] };
  });
  T.check(P + 'khi VS.diverSheet.portrait có mặt, cả 10 ô thợ lặn trong kho và khung chi tiết đều có canvas riêng mang hình của nó (dù nó trả cùng một canvas), thay cho khung Dave tự vẽ',
    r.n === 10 && r.allMagenta && r.det && r.sharedFree && r.ids.every((id) => r.asked.includes(id)), JSON.stringify([r.n, r.allMagenta, r.det, r.sharedFree, r.reqs]));
  await page.evaluate(() => { delete VS.diverSheet; VS.lobby.show('lobby'); });
}

// Điện thoại ngang: chạm thật (touchscreen.tap) vào thẻ phe, nút Gacha, nút quay lại.
async function flowTouch(br, srv, vp) {
  const P = '[' + vp.name + ' cảm ứng] ';
  console.log(P + 'chạm');
  const { page, ctx, problems } = await T.open(br, srv.base, 'index.html', { width: vp.width, height: vp.height }, { hasTouch: true });
  await boot(page);
  const tap = async (sel, why) => {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible' });
    await quiet(page);
    const b = await loc.boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const hit = await page.evaluate(([x, y, sel]) => { const t = document.elementFromPoint(x, y); return !!t && document.querySelector(sel).contains(t); }, [x, y, sel]);
    T.check(P + 'elementFromPoint ở tâm "' + why + '" trúng đúng nó', hit);
    await page.touchscreen.tap(x, y);
  };
  await tap('.vs-side-shark', 'thẻ CÁ MẬP');
  await page.waitForFunction(() => document.querySelector('.vs-side-shark').classList.contains('on'));
  T.check(P + 'chạm thẻ CÁ MẬP chọn phe cá mập', (await saveOf(page)).pick.team === 'shark');
  await tap('[data-act=gacha]', 'Gacha');
  await page.waitForFunction(() => VS.lobby.screen() === 'gacha');
  await tap('[data-act=banner-ham-rang]', 'tab banner cá mập');
  await page.waitForFunction(() => document.querySelector('.vs-btab.shark.on'));
  await tap('[data-act=back]', 'Sảnh');
  await page.waitForFunction(() => VS.lobby.screen() === 'lobby');
  T.check(P + 'chạm vào Gacha, tab banner, rồi Sảnh đều chạy đúng', (await screenOf(page)) === 'lobby');
  const small = await page.evaluate(() => [...document.querySelectorAll('#ui button')].filter((b) => b.offsetParent !== null).map((b) => { const r = b.getBoundingClientRect(); return { act: b.dataset.act, w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.h < 36 || b.w < 56));
  T.check(P + 'mọi nút ở sảnh đủ lớn để chạm (cao ≥ 36 px, rộng ≥ 56 px)', small.length === 0, JSON.stringify(small));
  await ctx.close();
  return problems;
}

async function flowFlags(br, srv, vp, P) {
  console.log(P + 'cờ URL ?team ?map ?seed');
  const { page, ctx, problems } = await T.open(br, srv.base, 'index.html?team=shark&map=B04N&seed=77', { width: vp.width, height: vp.height });
  await boot(page);
  T.check(P + '?team=shark mở sảnh với phe cá mập đã chọn', await page.evaluate(() => document.querySelector('.vs-side-shark').classList.contains('on') && VS.save.current.pick.team === 'shark'));
  await press(page, P, '[data-act=find]', 'TÌM TRẬN (cờ URL)');
  await page.waitForFunction(() => window.__log.landInfo, null, { timeout: 25000 });
  const mp = await page.evaluate(() => window.__log.landInfo.map);
  await page.waitForFunction(() => window.__starts.length === 1, null, { timeout: 12000 });
  const cfg = await page.evaluate(() => window.__starts[0].cfg);
  T.check(P + '?map=B04N ép đúng bản đồ B04N ở vòng quay, ?seed=77 đặt seed của trận', mp === 'B04N' && cfg.mapId === 'B04N' && cfg.seed === 77, JSON.stringify([mp, cfg.mapId, cfg.seed]));
  await ctx.close();
  return problems;
}

// ───────────────────────── điều phối ─────────────────────────
async function runViewport(br, srv, vp) {
  const P = '[' + vp.name + '] ';
  console.log('\n== ' + vp.name + ' ==');
  const { page, ctx, problems } = await T.open(br, srv.base, 'index.html', { width: vp.width, height: vp.height });
  const snap = async (n) => T.shot(page, 'w3-' + n + '-' + vp.name);
  await boot(page);
  await flowLobby(page, P, snap);
  await flowQueue(page, P, snap);
  const g = await flowGacha(page, P, snap);
  await flowPoor(page, P);
  await page.evaluate(() => { VS.save.current.pearls = 3200; VS.save.store(VS.save.current); VS.lobby.show('lobby'); });
  const target = await flowRoster(page, P, snap, g);
  await flowResult(page, P, snap, target);
  await flowSheetMock(page, P);
  await flowPortrait(page, P, snap, vp);
  await ctx.close();
  return problems;
}

async function main() {
  const srv = await T.serve();
  const br = await T.browser();
  const all = [];
  try {
    for (const vp of VIEWPORTS.filter((v) => !process.env.VS_VP || v.name === process.env.VS_VP)) {
      all.push(...(await runViewport(br, srv, vp)).map((p) => '[' + vp.name + '] ' + p));
      all.push(...(await runFrozen(br, srv, vp)).map((p) => '[' + vp.name + '] ' + p));
    }
    all.push(...(await flowTouch(br, srv, VIEWPORTS[1])).map((p) => '[cảm ứng] ' + p));
    all.push(...(await flowFlags(br, srv, VIEWPORTS[0], '[' + VIEWPORTS[0].name + '] ')));
    console.log('\nTrang tải không lỗi');
    T.check('không pageerror, không console error, không requestfailed, không response >= 400 (cả hai khung hình)', all.length === 0, all.slice(0, 4).join(' | ') || 'sạch');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await br.close();
    srv.close();
  }
  T.done();
  if (T.SHOTS) console.log('ảnh chụp: ' + T.SHOTS);
}
main();
