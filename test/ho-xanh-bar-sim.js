/*
 * HỐ XANH — mô phỏng kinh tế quán sushi, không cần trình duyệt.
 *
 * Chạy:  node test/ho-xanh-bar-sim.js [số đêm] [hạt giống]
 * Đọc thẳng số của game: khối `var T = {...}` và SEAT_ORDER trong js/bar.js, bảng BAR / servingsOf / dishOf của data/meta.js,
 * giá món, tốc độ khách, thời gian ăn/chờ [DtD] của data/bar_assets.js. Sửa số trong game thì mô phỏng theo luôn.
 *
 * Mỗi đêm: tủ ~8 con cá vùng nông A (bốc theo trọng số sinh cá của js/fish.js), thực đơn tự điền như bếp,
 * một người chơi giỏi: luôn đi thẳng tới việc gần nhất (đưa món đang bưng → rót trà → nhận món ở quầy), rót trà luôn "perfect".
 * In vàng mỗi ngày và số ngày tới các mốc nâng cấp.
 */
'use strict';
const fs = require('fs'), path = require('path');
globalThis.window = globalThis;
const GAME = path.resolve(__dirname, '../games/ho-xanh');
['data/tuning.js', 'data/assets.js', 'data/gear_sheet.js', 'data/boat_assets.js', 'data/bar_assets.js', 'data/meta.js']
  .forEach(f => require(path.join(GAME, f)));
const M = window.HX_META, BA = window.HX_BAR_ASSETS, FISH = window.HX_ASSETS.fish, FT = window.HX_TUNING.fish;

// số của pha quán, lấy nguyên văn từ js/bar.js
const src = fs.readFileSync(path.join(GAME, 'js/bar.js'), 'utf8');
const T = new Function('return ' + src.match(/var T = (\{[\s\S]*?\n {2}\});/)[1])();
const SEAT_ORDER = new Function('return ' + src.match(/var SEAT_ORDER = (\[[\s\S]*?\]);/)[1])();
const R = BA.room, U = R.pxPerUnit, DOOR_X = R.marks.Door[0], EAT = BA.customerEat;
const SEATS = {};
R.seats.forEach(s => { SEATS[s.name] = s; });

let seed = +(process.argv[3] || 1);
function rnd() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// cá vùng A theo trọng số của pickSpecies (js/fish.js): hạng ≥ 3 lấy FT.rareWeight
function catchDay(n, zone) {
  const pool = FISH.filter(s => s.zone === zone && s.rank > 0);
  const w = pool.map(s => (s.rank >= 3 ? FT.rareWeight : 1)), tot = w.reduce((a, b) => a + b, 0);
  const fr = {};
  for (let i = 0; i < n; i++) {
    let r = rnd() * tot, k = 0;
    while (r > w[k]) { r -= w[k]; k++; }
    fr[pool[k].id] = (fr[pool[k].id] || 0) + 1;
  }
  return fr;
}
// giá bán = giá gốc × hệ số giá của cấp trang trí, như buildMenu của js/bar.js
function buildMenu(fridge, look) {
  return Object.keys(fridge).map(id => {
    const sp = FISH.find(s => s.id === id), per = M.servingsOf(sp), d = M.dishOf(sp);
    return { id, price: Math.max(1, Math.round(d.price * look.price)), per, fish: fridge[id], servings: per * fridge[id], sold: 0, pending: 0 };
  }).sort((a, b) => b.price - a.price || a.id.localeCompare(b.id)).slice(0, T.menuSlots);
}

function night(save, fridge) {
  const look = M.tier(save), menu = buildMenu(fridge, look), dt = 0.05;
  const seats = SEAT_ORDER.slice(0, M.stat(save, 'seats')).map(k => SEATS[k]);
  const chef = M.stat(save, 'chef'), teaPrice = M.stat(save, 'tea');
  const cust = [], plates = [];
  const d = { x: 620, carry: [], busy: 0, job: null };
  let t = 0, open = true, spawnT = T.firstGuest, money = { dish: 0, tip: 0, tea: 0 }, guests = 0, angry = 0, served = 0, teaN = 0;
  const avail = m => m.servings - m.sold - m.pending;
  const waiting = c => c.st === 'order' || c.st === 'angry';
  while (t < 2000) {
    t += dt;
    if (open && t >= T.night) open = false;
    if (open && menu.length && menu.every(m => m.sold >= m.servings)) open = false;
    if (open && (spawnT -= dt) <= 0) {
      const free = seats.filter(s => !cust.some(c => c.seat === s));
      if (free.length && (menu.some(m => avail(m) > 0) || teaPrice > 0)) {
        const ch = BA.customers[Math.floor(rnd() * BA.customers.length)];
        const seat = free[Math.floor(rnd() * free.length)];
        cust.push({ ch, seat, st: 'enter', t: 0, walk: (seat.sit[0] - (DOOR_X - 20)) / (ch.data.EnterSpeed * U), E: EAT[ch.data.EatLevel] || EAT[1] });
        guests++;
      }
      spawnT = look.visitEvery * (1 + (rnd() * 2 - 1) * T.guestJitter);
    }
    // khách
    for (const c of cust) {
      c.t += dt;
      const E = c.E;
      if (c.st === 'enter' && c.t >= c.walk) { c.st = 'sit'; c.t = 0; }
      else if (c.st === 'sit' && c.t >= E.PreOrderDelay) { c.st = 'menu'; c.t = 0; }
      else if (c.st === 'menu' && c.t >= E.OrderTime) {
        const menus = menu.filter(m => avail(m) > 0), teaOk = !c.seat.noDrinkQTE && teaPrice > 0;
        if (teaOk && rnd() < c.ch.data.OrderDrinkChance) c.order = { tea: true };
        else if (menus.length) c.order = { m: menus[Math.floor(rnd() * menus.length)] };
        else if (teaOk) c.order = { tea: true };
        if (!c.order) { c.st = 'gone'; continue; }
        c.st = 'order'; c.t = 0;
        if (c.order.m) {
          c.order.m.pending++;
          const need = cust.filter(x => waiting(x) && x.order && x.order.m === c.order.m).length - plates.filter(p => p.m === c.order.m).length;
          if (need > 0) plates.push({ m: c.order.m, st: 'queued', t: 0 });
        }
      } else if (c.st === 'order' && !c.pouring && c.t >= (c.order.tea ? E.MaxDrinkWaitTime : E.MaxServingWaitTime)) { c.st = 'angry'; c.t = 0; }
      else if (c.st === 'angry' && !c.pouring && c.t >= (c.order.tea ? E.MaxEndureDrinkWaitTime : E.MaxEndureAngerTime)) {
        if (c.order.m) c.order.m.pending--;
        c.st = 'gone'; angry++;
      } else if (c.st === 'eat' && c.t >= E.EatingTime + 0.833 + E.AfterEatDelay) {
        money.dish += c.pay.price; money.tip += c.pay.tip; served++;
        c.st = 'pay'; c.t = 0;
      } else if (c.st === 'pay' && c.t >= 1.3) c.st = 'gone';
    }
    for (let i = cust.length - 1; i >= 0; i--) if (cust[i].st === 'gone') cust.splice(i, 1);
    // bếp
    let ck = plates.find(p => p.st === 'cooking') || plates.find(p => p.st === 'queued');
    if (ck) { ck.st = 'cooking'; ck.t += dt; if (ck.t >= T.cook / chef) ck.st = 'ready'; }
    // Dave: người chơi giỏi
    if (d.busy > 0) { d.busy -= dt; if (d.busy <= 0 && d.job) { d.job(); d.job = null; } }
    else {
      const goals = [];
      cust.filter(waiting).forEach(c => {
        if (c.order.tea) goals.push({ x: c.seat.sit[0], c, tea: true });
        else if (d.carry.some(p => p.m === c.order.m)) goals.push({ x: c.seat.sit[0], c });
      });
      const ready = plates.filter(p => p.st === 'ready');
      if (ready.length && d.carry.length < T.carry) goals.push({ x: T.passX, pick: true });
      goals.sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x));
      const g = goals[0];
      if (g) {
        const step = T.daveSpeed * dt;
        if (Math.abs(g.x - d.x) > T.reach) d.x += Math.sign(g.x - d.x) * step;
        else if (g.pick) {
          while (d.carry.length < T.carry && plates.some(p => p.st === 'ready')) { const p = plates.find(p => p.st === 'ready'); p.st = 'carried'; d.carry.push(p); }
        } else if (g.tea) {
          g.c.pouring = true;
          d.busy = T.pour * 0.95 + 0.9;   // giữ tới ~95 % vòng rồi 0,9 s chấm điểm
          d.job = () => {
            const c = g.c;
            c.pouring = false;
            if (!waiting(c)) return;
            const tip = Math.round(teaPrice * T.tipK);
            money.tea += teaPrice + tip; teaN++;
            c.st = 'pay'; c.t = 0;
          };
        } else {
          const c = g.c, p = d.carry.find(p => p.m === c.order.m);
          d.carry.splice(d.carry.indexOf(p), 1); plates.splice(plates.indexOf(p), 1);
          c.order.m.pending--; c.order.m.sold++;
          const pat = c.st === 'order' ? Math.max(0, 1 - c.t / c.E.MaxServingWaitTime) : 0;
          c.pay = { price: c.order.m.price, tip: Math.max(0, Math.round(c.order.m.price * T.tipK * pat)) };
          c.st = 'eat'; c.t = 0;
        }
      }
    }
    if (!open && !cust.length && d.busy <= 0) break;
  }
  const used = {};
  menu.forEach(m => { if (m.sold) used[m.id] = Math.min(m.fish, Math.ceil(m.sold / m.per)); });
  const total = money.dish + money.tip + money.tea;
  return { total, money, guests, served, teaN, angry, t, menu, used, servings: menu.reduce((a, m) => a + m.servings, 0) };
}

const N = +(process.argv[2] || 14), SEED = seed;
// tủ cá của từng ngày bốc trước, để ba cách chơi dưới đây bán cùng một mẻ cá
const FRIDGES = [];
for (let d = 0; d < N; d++) FRIDGES.push(catchDay(8, 'A'));
const perGuest = r => (r.served + r.teaN ? r.total / (r.served + r.teaN) : 0);
function row(day, r, gold, extra) {
  return 'ngày ' + String(day).padStart(2) + ': ' + String(r.total).padStart(5) + ' vàng (món ' + r.money.dish + ' · tip ' + r.money.tip + ' · trà ' + r.money.tea +
    ') · ' + r.served + '/' + r.servings + ' suất · ' + r.teaN + ' trà · ' + r.guests + ' khách, ' + r.angry + ' bỏ về · ' +
    perGuest(r).toFixed(1) + ' vàng/khách · đêm ' + Math.round(r.t) + ' s · cộng dồn ' + gold + (extra || '');
}

// 1) Không nâng cấp gì (cấp trang trí 0).
seed = SEED + 1;
let save = M.defaults(), gold = 0, rows = [], firstAt = {};
const MARKS = [M.BAR_TIERS[1].cost, 300, 400, M.BAR_TIERS[2].cost, 1500];
console.log('— không nâng cấp gì (ca ' + T.night + ' s, cấp trang trí 0 "' + M.BAR_TIERS[0].name + '")');
for (let day = 1; day <= N; day++) {
  const r = night(save, FRIDGES[day - 1]);
  gold += r.total;
  MARKS.forEach(k => { if (gold >= k && !firstAt[k]) firstAt[k] = day; });
  rows.push(r.total);
  console.log(row(day, r, gold));
}
const sorted = rows.slice().sort((a, b) => a - b);
console.log('trung bình ' + Math.round(gold / N) + ' vàng/ngày · trung vị ' + sorted[N >> 1] + ' · thấp nhất ' + sorted[0] + ' · cao nhất ' + sorted[N - 1]);
console.log('tích luỹ đủ: ' + MARKS.map(k => k + ' vàng → ngày ' + (firstAt[k] || '>' + N)).join(' · '));

// 2) Mua cấp trang trí kế tiếp ngay khi đủ tiền (sáng hôm sau, trước khi ra khơi). Cùng hạt giống.
seed = SEED + 1; save = M.defaults(); gold = 0;
console.log('\n— mua cấp trang trí kế tiếp ngay khi đủ tiền');
for (let day = 1; day <= N; day++) {
  let bought = '';
  for (;;) { const b = M.buy(save, 'decor'); if (!b.ok) break; save = b.save; bought += ' · mua "' + M.tier(save).name + '" (' + b.cost + ')'; }
  const r = night(save, FRIDGES[day - 1]);
  save.gold += r.total; gold += r.total;
  console.log(row(day, r, gold, ' · cấp ' + M.level(save, 'decor') + ' ×' + M.tier(save).price + bought));
}

// 3) Cùng 14 tủ cá, mỗi cấp trang trí: vàng mỗi đêm và mỗi khách trả tiền.
console.log('\n— cùng ' + N + ' tủ cá, từng cấp trang trí (ghế, bếp, trà cấp 0)');
M.BAR_TIERS.forEach((t, i) => {
  seed = SEED + 1;
  let tot = 0, pay = 0, g = 0;
  for (let day = 1; day <= N; day++) {
    const s = M.defaults(); s.bar.decor = i;
    const r = night(s, FRIDGES[day - 1]);
    tot += r.total; pay += r.served + r.teaN; g += r.guests;
  }
  console.log('cấp ' + i + ' "' + t.name + '" ×' + t.price + ' giá, ' + t.visitEvery + ' s/khách, giá ' + t.cost + ': ' +
    Math.round(tot / N) + ' vàng/đêm · ' + (tot / pay).toFixed(1) + ' vàng/khách trả tiền · ' + (g / N).toFixed(1) + ' khách/đêm');
});
