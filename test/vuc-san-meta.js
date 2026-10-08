/*
 * Vực Săn, phần sảnh thuần (Node, không trình duyệt): lưu/đọc, quyết toán, gacha, ghép trận giả.
 * Chạy: node test/vuc-san-meta.js
 *
 * Các giá trị giải tích (tỉ lệ 5★, 4★, tỉ lệ nhân vật nổi bật) được tính ngay trong bài kiểm từ dữ liệu banner bằng
 * chuỗi Markov riêng, không gọi hàm tính của gacha.js, và không chép số nào vào bài: đổi data/banners.js thì bài tự theo.
 * Cách đọc luật "soft pity" được ghim bằng phép dò ngưỡng (rng hằng số) chứ không chép lại công thức của mã cần kiểm.
 */
'use strict';
const T = require('./vuc-san-lib');

const FILES = ['data/tuning.js', 'data/sharks.js', 'data/divers.js', 'data/skills.js', 'data/maps.js', 'data/banners.js', 'data/names.js',
  'js/sim/rng.js', 'js/meta/save.js', 'js/meta/gacha.js', 'js/meta/mmk.js'];

function fresh() {
  const W = T.nodeSim(FILES);
  return { W, VS: W.VS };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const tableOf = (VS, team) => (team === 'shark' ? VS.SHARKS : VS.DIVERS);

// ───────────────────────── lưu / đọc / làm sạch ─────────────────────────
function testSave() {
  console.log('Lưu, đọc, làm sạch');
  let { W, VS } = fresh();
  const d = VS.save.load();
  T.check('không có localStorage: load() trả bản mặc định, ngọc trai = TUNING.economy.start',
    d.pearls === VS.TUNING.economy.start && d.level === 1 && d.exp === 0 && d.v === 1, d.pearls);
  T.check('mặc định sở hữu đúng Dave và Cá Mập Vây Đen, mỗi người một bản',
    sameJson(d.owned, { diver: { dave: 1 }, shark: { Blacktip_Reefshark: 1 } }), JSON.stringify(d.owned));
  T.check('mặc định pick = diver / dave / Blacktip_Reefshark',
    sameJson(d.pick, { team: 'diver', diver: 'dave', shark: 'Blacktip_Reefshark' }), JSON.stringify(d.pick));
  T.check('mặc định có bộ đếm pity riêng cho từng banner, bằng 0',
    VS.BANNERS.length === 2 && VS.BANNERS.every((b) => sameJson(d.pity[b.id], { n5: 0, n4: 0, guar: false })), JSON.stringify(d.pity));
  T.check('mặc định thống kê bằng 0, seq = 0, chưa nhận thưởng ngày',
    sameJson(d.stats, { matches: 0, wins: 0, asDiver: 0, asShark: 0 }) && d.seq === 0 && d.daily.firstWin === false);

  const s1 = VS.save.load();
  s1.pearls = 123;
  T.check('load() mỗi lần trả một đối tượng mới (sửa bản này không dính bản kia)', VS.save.load().pearls === VS.TUNING.economy.start);

  d.pearls = 777; d.owned.shark.Tiger_Shark = 3; d.pick.team = 'shark';
  VS.save.store(d);
  const back = VS.save.load();
  T.check('store → load khi không có localStorage đi qua bộ nhớ tạm, giữ nguyên',
    back.pearls === 777 && back.owned.shark.Tiger_Shark === 3 && back.pick.team === 'shark' && back !== d);

  // localStorage giả: dữ liệu bẩn
  ({ W, VS } = fresh());
  const bag = {};
  W.localStorage = { getItem: (k) => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); } };
  const b0 = VS.BANNERS[0], b1 = VS.BANNERS[1];
  bag['vs.save.v1'] = JSON.stringify({
    v: 1, name: '   ', level: 'x', exp: 99999, pearls: -5,
    owned: {
      diver: { dave: 9, ghost: 2, vy: 2.7, hai: 0, '__proto__': 3, lan: 'abc' },
      shark: { Tiger_Shark: 4, Whale: 2, Zebra_Shark: 123456 }
    },
    pick: { team: 'cá', diver: 'vy', shark: 'Megamouth_Shark' },
    pity: { [b0.id]: { n5: 500, n4: -3, guar: 'yes' }, [b1.id]: { n5: 3.9, n4: 7, guar: true }, 'ma': { n5: 1 } },
    daily: { day: -4, firstWin: 'x' }, stats: { matches: -1, wins: 'a', asDiver: 3.9, asShark: null }, seq: NaN
  });
  const g = VS.save.load();
  T.check('localStorage thật: id lạ bị bỏ; số bản sao là số nguyên ≥ 1 và bị chặn ở copyCap (không còn trần 6 sao)',
    sameJson(g.owned.diver, { dave: 9, vy: 2, hai: 1, lan: 1 }) &&
    sameJson(g.owned.shark, { Tiger_Shark: 4, Zebra_Shark: VS.META.copyCap, Blacktip_Reefshark: 1 }) && !('ghost' in g.owned.diver) && VS.META.copyCap >= 100,
    JSON.stringify(g.owned));
  T.check('level chữ → 1, exp vượt → 499, ngọc âm → 0, tên rỗng → mặc định',
    g.level === 1 && g.exp === 499 && g.pearls === 0 && g.name === 'Bạn', [g.level, g.exp, g.pearls, g.name].join(','));
  T.check('pick: phe lạ → diver, nhân vật đang sở hữu giữ nguyên, nhân vật chưa sở hữu về mặc định',
    sameJson(g.pick, { team: 'diver', diver: 'vy', shark: 'Blacktip_Reefshark' }), JSON.stringify(g.pick));
  T.check('pity: n5 bị chặn ở hard-1, số âm → 0, guar chữ → false, số lẻ cắt xuống, banner lạ bị bỏ',
    sameJson(g.pity[b0.id], { n5: b0.hard - 1, n4: 0, guar: false }) && sameJson(g.pity[b1.id], { n5: 3, n4: 7, guar: true }) && !('ma' in g.pity),
    JSON.stringify(g.pity));
  T.check('daily, stats, seq xấu → 0 / false', g.daily.day === 0 && g.daily.firstWin === false && g.stats.matches === 0 &&
    g.stats.wins === 0 && g.stats.asDiver === 3 && g.stats.asShark === 0 && g.seq === 0, JSON.stringify([g.daily, g.stats, g.seq]));

  VS.save.store(g);
  T.check('store ghi đúng khoá vs.save.v1 vào localStorage', typeof bag['vs.save.v1'] === 'string' && JSON.parse(bag['vs.save.v1']).pick.diver === 'vy');
  bag['vs.save.v1'] = '{không phải json';
  const bad = VS.save.load();
  T.check('JSON hỏng → bản mặc định, không ném lỗi', bad.pearls === VS.TUNING.economy.start && sameJson(bad.owned.diver, { dave: 1 }));
  W.localStorage = { getItem() { throw new Error('bị chặn'); }, setItem() { throw new Error('bị chặn'); } };
  let threw = false;
  try { VS.save.store(bad); VS.save.load(); } catch (e) { threw = true; }
  T.check('localStorage ném lỗi (chế độ riêng tư) không làm sảnh sập', !threw);

  T.check('dayIndex: cùng ngày dương lịch địa phương cho cùng số, hôm sau hơn 1',
    VS.save.dayIndex(new Date(2026, 9, 8, 0, 5)) === VS.save.dayIndex(new Date(2026, 9, 8, 23, 55)) &&
    VS.save.dayIndex(new Date(2026, 9, 9, 0, 5)) === VS.save.dayIndex(new Date(2026, 9, 8, 23, 55)) + 1);
}

// ───────────────────────── quyết toán cuối trận ─────────────────────────
function matchOf(team, stats, winner) {
  const blank = () => ({ banked: 0, revives: 0, dmg: 0, bites: 0, downs: 0, outs: 0, sharkOuts: 0 });
  const actors = [0, 1, 2, 3].map((i) => ({ id: i, team: 'diver', stats: blank() })).concat([4, 5].map((i) => ({ id: i, team: 'shark', stats: blank() })));
  const me = actors[team === 'diver' ? 0 : 4];
  Object.assign(me.stats, stats);
  return { actors, result: { winner, reason: 'test' }, viewer: me.id };
}

function testSettle() {
  console.log('Quyết toán cuối trận');
  const { VS } = fresh();
  const eco = VS.TUNING.economy;
  const save = VS.save.load();
  const DAY = 20000;
  const start = save.pearls;

  // 150 kho báu = 3 điểm, thêm 1 lần cứu = 4 điểm → 40 ngọc; thắng 140; ngày đầu 200
  let m = matchOf('diver', { banked: 150, revives: 1 }, 'diver');
  let r = VS.meta.settle(save, m, m.viewer, DAY);
  T.check('thợ lặn nộp 150 + cứu 1, thắng, ngày chưa thắng lần nào: 140 + 4×10 + 200 = 380 ngọc trai',
    r.win === true && r.points === 4 && r.pearls === 380 && r.firstWin === true && r.exp === 100 && r.levelUp === false, JSON.stringify(r));
  T.check('save: ngọc +380, exp 100, thống kê 1 trận 1 thắng 1 lần làm thợ lặn',
    save.pearls === start + 380 && save.exp === 100 && save.level === 1 && sameJson(save.stats, { matches: 1, wins: 1, asDiver: 1, asShark: 0 }), JSON.stringify(save.stats));
  T.check('các con số này khớp tuning: thắng 140, mỗi điểm 10 ngọc, thưởng ngày đầu 200, trần điểm 80 (đổi tuning thì sửa dòng này, không sửa mã)',
    eco.win === 140 && eco.perPoint === 10 && eco.firstWin === 200 && eco.pointCap === 80, JSON.stringify([eco.win, eco.perPoint, eco.firstWin, eco.pointCap]));

  m = matchOf('diver', { banked: 150, revives: 1 }, 'diver');
  r = VS.meta.settle(save, m, m.viewer, DAY);
  T.check('thắng lần hai cùng ngày: 140 + 40, không còn thưởng ngày đầu', r.pearls === 180 && r.firstWin === false && save.pearls === start + 380 + 180, JSON.stringify(r));

  m = matchOf('shark', { downs: 9, banked: 99999, revives: 7 }, 'diver');
  r = VS.meta.settle(save, m, m.viewer, DAY);
  T.check('cá mập thua với 9 lần hạ gục: 60 + min(9×10, 80) = 140, exp 50; điểm lấy từ downs, không từ banked hay revives',
    r.win === false && r.points === 9 && r.pearls === 140 && r.exp === 50 && r.firstWin === false, JSON.stringify(r));
  T.check('thống kê cộng thêm 1 lần làm cá mập, không cộng thắng', sameJson(save.stats, { matches: 3, wins: 2, asDiver: 2, asShark: 1 }), JSON.stringify(save.stats));

  const lose = (stats) => { const s = VS.save.load(), mm = matchOf('diver', stats, 'shark'); return VS.meta.settle(s, mm, mm.viewer, 5); };
  r = lose({ banked: 49 });
  T.check('nộp 49 chưa đủ 50: 0 điểm, thua: 60 ngọc trai', r.points === 0 && r.pearls === 60, JSON.stringify(r));
  r = lose({ banked: 50 });
  T.check('nộp đúng 50: 1 điểm = 10 ngọc, thua: 70', r.points === 1 && r.pearls === 70, JSON.stringify(r));
  r = lose({ banked: 99, revives: 2 });
  T.check('nộp 99 + cứu 2 lần: floor(99/50) + 2 = 3 điểm, thua: 60 + 30 = 90', r.points === 3 && r.pearls === 90, JSON.stringify(r));
  r = lose({ banked: 0, revives: 3 });
  T.check('chỉ cứu 3 lần, không nộp gì: vẫn 3 điểm (cứu người được tính công)', r.points === 3 && r.pearls === 90, JSON.stringify(r));
  r = lose({ banked: 5000 });
  T.check('nộp 5000 → 100 điểm; ngọc từ điểm bị chặn ở pointCap (tính bằng ngọc): 60 + 80 = 140', r.points === 100 && r.pearls === 140, JSON.stringify(r));
  const sWin = VS.save.load();
  m = matchOf('diver', { banked: 450 }, 'diver');
  r = VS.meta.settle(sWin, m, m.viewer, 5);
  T.check('thắng với 450 nộp = 9 điểm (90 ngọc) bị chặn ở 80, ngày đầu: 140 + 80 + 200 = 420', r.points === 9 && r.pearls === 420 && r.firstWin === true, JSON.stringify(r));
  m = matchOf('shark', { downs: 3, revives: 5 }, 'shark');
  r = VS.meta.settle(VS.save.load(), m, m.viewer, 5);
  T.check('cá mập thắng với 3 hạ gục (revives không tính cho cá mập): 140 + 30 + 200 = 370', r.points === 3 && r.pearls === 370 && r.win === true, JSON.stringify(r));

  // ngày mới: được thưởng lại; thua không ăn mất thưởng
  const s2 = VS.save.load();
  m = matchOf('diver', { banked: 0 }, 'shark');
  VS.meta.settle(s2, m, m.viewer, 100);
  m = matchOf('diver', { banked: 0 }, 'diver');
  r = VS.meta.settle(s2, m, m.viewer, 100);
  T.check('thua trước rồi thắng cùng ngày: trận thắng vẫn nhận thưởng ngày đầu (140 + 0 + 200)', r.firstWin === true && r.pearls === 340, JSON.stringify(r));
  m = matchOf('diver', { banked: 0 }, 'diver');
  r = VS.meta.settle(s2, m, m.viewer, 101);
  T.check('sang ngày mới thắng lại: thưởng ngày đầu trở lại', r.firstWin === true && r.pearls === 340 && s2.daily.day === 101, JSON.stringify(r));

  // lên cấp mỗi 500 exp
  const s3 = VS.save.load();
  s3.exp = 450;
  m = matchOf('diver', { banked: 0 }, 'diver');
  r = VS.meta.settle(s3, m, m.viewer, 5);
  T.check('exp 450 + 100 = 550: lên cấp 2, còn dư 50', r.levelUp === true && s3.level === 2 && s3.exp === 50, [s3.level, s3.exp].join(','));
  s3.exp = 450;
  m = matchOf('diver', { banked: 0 }, 'shark');
  r = VS.meta.settle(s3, m, m.viewer, 5);
  T.check('exp 450 + 50 = 500 cũng lên cấp (chạm đúng mốc), còn dư 0', r.levelUp === true && s3.level === 3 && s3.exp === 0, [s3.level, s3.exp].join(','));
  s3.exp = 10;
  m = matchOf('diver', { banked: 0 }, 'shark');
  r = VS.meta.settle(s3, m, m.viewer, 5);
  T.check('exp 10 + 50 = 60: không lên cấp', r.levelUp === false && s3.level === 3 && s3.exp === 60);

  // người xem là người khác: dùng đúng actor theo id
  m = matchOf('diver', { banked: 300 }, 'shark');
  m.actors[1].stats.banked = 700;
  r = VS.meta.settle(VS.save.load(), m, 1, 9);
  T.check('viewerId chọn đúng actor (id 1 nộp 700 → 14 điểm → ngọc từ điểm chạm trần 80)', r.points === 14 && r.pearls === 60 + 80, JSON.stringify(r));
  m = matchOf('diver', { banked: 300 }, null);
  m.result = null;
  r = VS.meta.settle(VS.save.load(), m, 0, 9);
  T.check('trận chưa có kết quả tính là thua, không ném lỗi', r.win === false && r.pearls === 60 + 60 && r.points === 6, JSON.stringify(r));
}

// ───────────────────────── gacha ─────────────────────────
function seeded(VS, seed) { return VS.rng(seed); }
const constant = (u) => () => u;

// Chuỗi Markov (a = số lượt từ 5★ trước, c = số lượt từ ≥4★ trước) cho phân phối dừng của ba bậc.
// hazard5(k) là tỉ lệ 5★ ở lượt thứ k (k = 1 là lượt đầu sau 5★), ghim bởi phép dò ngưỡng ở testPity.
function hazard5(b, k) {
  if (k >= b.hard) return 1;
  let r = b.rates[5];
  if (k >= b.soft) r += (k - b.soft + 1) * b.softStep;
  return Math.min(1, r);
}
function analytic(b) {
  // (1) chu kỳ giữa hai 5★: trung bình và phương sai
  let alive = 1, mean = 0, m2 = 0;
  for (let k = 1; k <= b.hard; k++) {
    const p = hazard5(b, k), pk = alive * p;
    mean += k * pk; m2 += k * k * pk; alive *= 1 - p;
  }
  const varGap = m2 - mean * mean;
  // (2) phân phối dừng của chuỗi hai chiều (a, c) bằng lặp luỹ thừa
  const A = b.hard, C = b.pity4, idx = (a, c) => a * C + c;
  let pi = new Float64Array(A * C).fill(1 / (A * C));
  for (let it = 0; it < 4000; it++) {
    const nx = new Float64Array(A * C);
    for (let a = 0; a < A; a++) for (let c = 0; c < C; c++) {
      const w = pi[idx(a, c)]; if (!w) continue;
      const a1 = a + 1, c1 = c + 1, p5 = hazard5(b, a1), p4 = c1 >= C ? 1 : b.rates[4];
      nx[idx(0, 0)] += w * p5;
      if (a1 < A) {
        nx[idx(a1, 0)] += w * (1 - p5) * p4;
        if (c1 < C) nx[idx(a1, c1)] += w * (1 - p5) * (1 - p4);
      }
    }
    pi = nx;
  }
  let r5 = 0, r4 = 0;
  for (let a = 0; a < A; a++) for (let c = 0; c < C; c++) {
    const w = pi[idx(a, c)], p5 = hazard5(b, a + 1), p4 = c + 1 >= C ? 1 : b.rates[4];
    r5 += w * p5; r4 += w * (1 - p5) * p4;
  }
  return { mean, varGap, rate5: 1 / mean, rate5chain: r5, rate4: r4, rate3: 1 - r5 - r4 };
}

// 50/50 có bảo đảm: trạng thái N (chưa bảo đảm) và G (đã trượt, chắc chắn lần sau). Phân phối dừng của chuỗi hai trạng thái.
function featuredShare() {
  let pN = 1, pG = 0;
  for (let i = 0; i < 200; i++) { const nN = pN * 0.5 + pG * 1, nG = pN * 0.5; pN = nN; pG = nG; }
  return pN * 0.5 + pG * 1;
}

const mod = (a, n) => ((a % n) + n) % n;
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function testFeatured() {
  console.log('Nhân vật tăng tỉ lệ theo ngày (một 5★, hai 4★ liền nhau)');
  const { VS } = fresh();
  VS.BANNERS.forEach((b) => {
    const l5 = b.featured[5], l4 = b.featured[4], tb = tableOf(VS, b.team);
    const f0 = VS.gacha.featured(b, 0);
    T.check('[' + b.id + '] ngày 0: 5★ là phần tử đầu danh sách, hai 4★ là hai phần tử đầu', f0[5] === l5[0] && f0[4].length === 2 && f0[4][0] === l4[0] && f0[4][1] === l4[1], JSON.stringify(f0));
    const period = l5.length * l4.length / gcd(l5.length, l4.length);
    let okShape = true, okStep = true, okNeg = true;
    const cnt5 = {}, cnt4 = {};
    for (let d = -2 * period; d < 2 * period; d++) {
      const f = VS.gacha.featured(b, d), g = VS.gacha.featured(b, d + 1);
      const i5 = l5.indexOf(f[5]), i40 = l4.indexOf(f[4][0]), i41 = l4.indexOf(f[4][1]);
      if (i5 < 0 || i40 < 0 || i41 < 0 || f[4].length !== 2 || i41 !== (i40 + 1) % l4.length) okShape = false;
      if (tb[f[5]].rarity !== 5 || !f[4].every((id) => tb[id] && tb[id].rarity === 4)) okShape = false;
      if (l5.indexOf(g[5]) !== (i5 + 1) % l5.length || l4.indexOf(g[4][0]) !== (i40 + 1) % l4.length) okStep = false;
      if (d < 0 && (i5 < 0 || i40 < 0)) okNeg = false;
      if (d >= 0 && d < period) { cnt5[f[5]] = (cnt5[f[5]] || 0) + 1; cnt4[f[4][0]] = (cnt4[f[4][0]] || 0) + 1; }
    }
    T.check('[' + b.id + '] mỗi ngày đúng một 5★ và hai 4★ khác nhau liền nhau trong danh sách (kể cả ngày âm), đúng phe và đúng bậc', okShape && okNeg);
    T.check('[' + b.id + '] sang ngày kế thì cả 5★ lẫn cặp 4★ nhích đúng một phần tử', okStep);
    T.check('[' + b.id + '] sau ' + period + ' ngày mỗi 5★ và mỗi 4★ làm "đầu cặp" đúng số lần đều nhau',
      l5.every((id) => cnt5[id] === period / l5.length) && l4.every((id) => cnt4[id] === period / l4.length), JSON.stringify([cnt5, cnt4]));
    T.check('[' + b.id + '] tuần hoàn: ngày d và d + chu kỳ giống hệt nhau; ngày lẻ cắt xuống số nguyên',
      sameJson(VS.gacha.featured(b, 5), VS.gacha.featured(b, 5 + period)) && sameJson(VS.gacha.featured(b, 5.9), VS.gacha.featured(b, 5)));
  });
}

function freshSave(VS) { const s = VS.save.load(); s.pearls = VS.TUNING.economy.start; return s; }

function testPull() {
  console.log('Quay: giá, từ chối, trùng nhân vật đổi ngọc');
  let { VS } = fresh();
  const eco = VS.TUNING.economy, dupe = eco.dupeRefund, refundOf = (res) => sum(res.map((x) => x.refund));
  const cost1 = VS.BANNERS[0].cost, cost10 = cost1 * 10;
  T.check('bảng đổi ngọc theo bậc có đủ 3 bậc, dương và tăng dần theo bậc', [3, 4, 5].every((r) => dupe[r] > 0) && dupe[3] < dupe[4] && dupe[4] < dupe[5], JSON.stringify(dupe));

  // rng luôn xui: lượt đầu của một save mới chắc chắn ra một 3★ chưa có (cuối danh sách), nên không có hoàn ngọc
  let save = VS.save.load();
  let r = VS.gacha.pull(save, 'den-vuc', 1, constant(0.9999999), 0);
  T.check('quay 1 trừ đúng giá banner (cost = ' + cost1 + ') khi không trùng', r.ok && r.cost === cost1 && r.results[0].isNew && r.results[0].refund === 0 && save.pearls === eco.start - cost1, save.pearls);
  r = VS.gacha.pull(save, 'ham-rang', 10, seeded(VS, 99), 0);
  T.check('quay 10 báo cost = 10 × giá và ngọc giảm đúng cost − tổng ngọc hoàn của các bản trùng',
    r.ok && r.cost === cost10 && r.results.length === 10 && save.pearls === eco.start - cost1 - r.cost + refundOf(r.results), save.pearls);
  T.check('mỗi kết quả có đủ team/id/rarity/isNew/featured/copies/refund, đúng phe banner, rarity khớp bảng nhân vật, không còn trường stars',
    r.results.every((x) => x.team === 'shark' && VS.SHARKS[x.id] && VS.SHARKS[x.id].rarity === x.rarity && typeof x.isNew === 'boolean' &&
      typeof x.featured === 'boolean' && x.copies >= 1 && typeof x.refund === 'number' && !('stars' in x)));
  T.check('hoàn ngọc chỉ có ở bản trùng và đúng bảng theo bậc: bản mới = 0, bản trùng = dupeRefund[bậc]',
    r.results.every((x) => x.refund === (x.isNew ? 0 : dupe[x.rarity])));
  T.check('pity của hai banner đếm riêng', save.pity['den-vuc'].n5 + save.pity['ham-rang'].n5 > 0 && save.pity['den-vuc'].n5 <= 1 && save.pity['ham-rang'].n5 <= 10);

  save = freshSave(VS);
  const before = save.pearls;
  save.pearls = cost1 - 1;
  const snap = clone(save);
  r = VS.gacha.pull(save, 'den-vuc', 1, seeded(VS, 3), 0);
  T.check('còn ' + (cost1 - 1) + ' ngọc: quay 1 bị từ chối vì thiếu ngọc, save không đổi', r.ok === false && r.why === 'pearls' && sameJson(save, snap));
  save.pearls = cost1;
  r = VS.gacha.pull(save, 'den-vuc', 1, constant(0.9999999), 0);
  T.check('còn đúng ' + cost1 + ': quay 1 được và về 0 (bản mới không hoàn ngọc)', r.ok === true && save.pearls === 0 && r.cost === cost1);
  save.pearls = cost10 - 1;
  r = VS.gacha.pull(save, 'den-vuc', 10, seeded(VS, 3), 0);
  T.check('còn ' + (cost10 - 1) + ': quay 10 bị từ chối', r.ok === false && r.why === 'pearls' && save.pearls === cost10 - 1);
  save.pearls = cost10;
  r = VS.gacha.pull(save, 'den-vuc', 10, seeded(VS, 3), 0);
  T.check('còn đúng ' + cost10 + ': quay 10 được, ngọc còn lại = tổng hoàn của bản trùng', r.ok === true && r.cost === cost10 && save.pearls === refundOf(r.results), save.pearls);
  save.pearls = 5000;
  T.check('số lượt lạ (5) và banner lạ bị từ chối, không trừ ngọc',
    VS.gacha.pull(save, 'den-vuc', 5, seeded(VS, 3), 0).why === 'count' && VS.gacha.pull(save, 'khong-co', 1, seeded(VS, 3), 0).why === 'banner' && save.pearls === 5000);
  void before;

  // sổ sách sở hữu độc lập với mã: tự theo dõi isNew / copies / refund
  ({ VS } = fresh());
  save = VS.save.load(); save.pearls = 1e9;
  const have = clone(save.owned.shark);
  let ok = true, why = '', pearlsOk = true, tot = 0;
  const rg = seeded(VS, 4242);
  for (let i = 0; i < 400 && ok; i++) {
    const p0 = save.pearls;
    const out = VS.gacha.pull(save, 'ham-rang', 1, rg, 0).results[0];
    const prev = have[out.id] || 0;
    const expectRefund = prev === 0 ? 0 : VS.TUNING.economy.dupeRefund[VS.SHARKS[out.id].rarity];
    if (out.isNew !== (prev === 0) || out.copies !== prev + 1 || out.refund !== expectRefund) { ok = false; why = 'lượt ' + i + ' ' + JSON.stringify(out) + ' prev=' + prev; }
    if (save.pearls !== p0 - 160 + expectRefund) pearlsOk = false;
    tot += expectRefund;
    have[out.id] = prev + 1;
  }
  T.check('400 lượt: isNew, copies (+1 mỗi lần trùng, không trần 6) và refund khớp sổ sách tính riêng, kho cuối khớp', ok && sameJson(have, save.owned.shark), why);
  T.check('400 lượt: ngọc đổi đúng −giá + hoàn của từng lượt (tổng hoàn ' + tot + ')', pearlsOk && tot > 0);

  // đã có mọi nhân vật: 10 lượt toàn bản trùng, mỗi bản hoàn đúng theo bậc
  ({ VS } = fresh());
  save = VS.save.load();
  Object.keys(VS.DIVERS).forEach((id) => { save.owned.diver[id] = 1; });
  const p0 = save.pearls;
  r = VS.gacha.pull(save, 'den-vuc', 10, seeded(VS, 5), 0);
  const refunds = r.results.map((x) => x.refund);
  const seen = {};   // một nhân vật có thể ra hai lần trong cùng mười lượt: số bản sao đếm theo từng lần ra
  const copiesOk = r.results.every((x) => { seen[x.id] = (seen[x.id] || 1) + 1; return x.copies === seen[x.id]; });
  T.check('đã có mọi thợ lặn: quay 10 ra 10 bản trùng, mỗi bản hoàn theo bậc (3★ ' + dupe[3] + ', 4★ ' + dupe[4] + ', 5★ ' + dupe[5] + ') và ngọc đổi −1600 + tổng hoàn',
    r.results.every((x) => !x.isNew && x.refund === dupe[x.rarity]) && copiesOk && save.pearls === p0 - cost10 + sum(refunds), save.pearls - p0);
  T.check('quay 10 luôn có ≥ 1 bản 4★ trở lên (pity4), nên tổng hoàn lớn hơn 10 × hoàn 3★', r.results.some((x) => x.rarity >= 4) && sum(refunds) > 10 * dupe[3]);
  for (let i = 0; i < 12; i++) VS.gacha.pull(save, 'den-vuc', 1, seeded(VS, 50 + i), 0);
  T.check('quay thêm nhiều lần: số bản sao chỉ tăng, không bị chặn ở 6 và không ảnh hưởng gì khác',
    Object.keys(save.owned.diver).every((id) => save.owned.diver[id] >= 1) && Math.max.apply(null, Object.keys(save.owned.diver).map((id) => save.owned.diver[id])) >= 2);

  // lượt 4★ chia theo "nổi bật": 50% trong hai nhân vật đang tăng, 50% đều trong cả kho 4★ → 0,5 + 0,5 × (số nổi bật / kho 4★)
  ({ VS } = fresh());
  save = VS.save.load(); save.pearls = 1e12;
  const b = VS.BANNERS[0], feat = VS.gacha.featured(b, 7), rg4 = seeded(VS, 31337);
  const pool4 = Object.keys(VS.DIVERS).filter((id) => VS.DIVERS[id].rarity === 4).length;
  const want4 = 0.5 + 0.5 * feat[4].length / pool4;
  let n4 = 0, f4 = 0, flagOk = true;
  for (let i = 0; i < 200000; i++) {
    const x = VS.gacha.pull(save, b.id, 1, rg4, 7).results[0];
    if (x.rarity === 4) { n4++; if (x.featured) f4++; if (x.featured !== (feat[4].indexOf(x.id) >= 0)) flagOk = false; }
    if (x.rarity === 5 && x.featured !== (x.id === feat[5])) flagOk = false;
  }
  const share4 = f4 / n4, sd4 = Math.sqrt(want4 * (1 - want4) / n4);
  T.check('cờ featured khớp danh sách tăng tỉ lệ của ngày (5★ và 4★)', flagOk);
  T.check('tỉ lệ 4★ thuộc nhóm tăng = ' + want4.toFixed(3) + ' (0,5 + 0,5 × ' + feat[4].length + '/' + pool4 + ') trong 3σ', Math.abs(share4 - want4) < 3 * sd4, share4.toFixed(4) + ' ± ' + sd4.toFixed(4) + ' (n=' + n4 + ')');
}

function testPity() {
  console.log('Bảo hiểm (pity)');
  const { VS } = fresh();
  const b = VS.BANNERS[0];

  // Ghim cách đọc soft pity bằng phép dò: rng hằng số u. Lượt 5★ đầu tiên là lượt nhỏ nhất k mà u < rate5(k).
  function firstFive(banner, u) {
    const save = VS.save.load(); save.pearls = 1e9;
    for (let i = 1; i <= 400; i++) if (VS.gacha.pull(save, banner.id, 1, constant(u), 0).results[0].rarity === 5) return i;
    return -1;
  }
  const soft = b.soft, step = b.softStep, base = b.rates[5];
  T.check('dò ngưỡng: u ngay dưới tỉ lệ gốc + 1 bước soft thì 5★ rơi đúng vào lượt soft (' + soft + ')',
    firstFive(b, base + step - 1e-9) === soft, firstFive(b, base + step - 1e-9));
  T.check('dò ngưỡng: u vừa trên đó thì 5★ rơi vào lượt soft + 1', firstFive(b, base + step + 1e-9) === soft + 1, firstFive(b, base + step + 1e-9));
  T.check('dò ngưỡng: u ngay dưới tỉ lệ gốc thì 5★ ra ngay lượt đầu, trước khi soft bắt đầu', firstFive(b, base - 1e-9) === 1, firstFive(b, base - 1e-9));
  let expectSure = 1; while (hazard5(b, expectSure) < 1) expectSure++;
  const worst = firstFive(b, 0.9999999);
  T.check('rng luôn xui (u = 0,9999999): 5★ ra đúng ở lượt đầu tiên tỉ lệ chạm 100% — tính độc lập từ dữ liệu banner',
    worst === expectSure && worst <= b.hard, 'lượt ' + worst + ' (soft ' + b.soft + ', hard ' + b.hard + ')');
  T.check('VS.gacha.sureAt khớp lượt đó (màn gacha nói thật về "chắc chắn")', VS.gacha.sureAt(b) === expectSure, VS.gacha.sureAt(b));

  // Chứng minh pity cứng thật sự nổ: banner nhân bản tắt soft, rng luôn xui → 5★ đúng ở lượt hard, đều đặn.
  const synth = Object.assign({}, b, { id: 'thu-hard', soft: 100000 });
  VS.BANNERS.push(synth);
  const save = VS.save.load(); save.pearls = 1e9;
  const at = [], want = [];
  for (let i = 1; i <= 8 * b.hard; i++) if (VS.gacha.pull(save, synth.id, 1, constant(0.9999999), 0).results[0].rarity === 5) at.push(i);
  for (let p = b.hard; p <= 8 * b.hard; p += b.hard) want.push(p);
  T.check('tắt soft + rng luôn xui: 5★ ra đúng ở các lượt ' + want.slice(0, 3).join(', ') + ', … (mỗi ' + b.hard + ' lượt, pity cứng nổ)', at.join(',') === want.join(','), at.join(','));
  VS.BANNERS.pop();

  // Chuỗi rarity khi rng luôn xui trên banner thật: 4★ ở mỗi lượt thứ pity4, rồi 5★ reset cả hai bộ đếm.
  const s2 = VS.save.load(); s2.pearls = 1e9;
  const seq = [], wantSeq = [];
  for (let i = 1; i <= expectSure + 12; i++) seq.push(VS.gacha.pull(s2, b.id, 1, constant(0.9999999), 0).results[0].rarity);
  for (let i = 1; i <= expectSure + 12; i++) {
    const sinceFive = i <= expectSure ? i : i - expectSure;
    wantSeq.push(i === expectSure ? 5 : (sinceFive % b.pity4 === 0 ? 4 : 3));
  }
  T.check('rng luôn xui: đúng 4★ ở mỗi lượt thứ ' + b.pity4 + ' kể từ ≥4★ trước, 5★ ở lượt ' + expectSure + ' rồi đếm lại từ đầu',
    sameJson(seq, wantSeq), seq.join('') + ' vs ' + wantSeq.join(''));

  // 300 nghìn lượt quay có hạt giống trên từng banner: giới hạn tuyệt đối + thống kê
  VS.BANNERS.forEach((bn, bi) => {
    const sv = VS.save.load(); sv.pearls = 1e12;
    const rg = seeded(VS, 777 + bi);
    const N = 300000, an = analytic(bn), feat = VS.gacha.featured(bn, 3);
    let run = 0, maxRun = 0, run3 = 0, maxRun3 = 0, n5 = 0, n4 = 0, f5 = 0, afterLostBad = 0, expectGuard = false, losses = 0;
    for (let i = 0; i < N; i++) {
      const x = VS.gacha.pull(sv, bn.id, 1, rg, 3).results[0];
      if (x.rarity === 5) { n5++; if (run > maxRun) maxRun = run; run = 0; } else run++;
      if (x.rarity === 3) { run3++; if (run3 > maxRun3) maxRun3 = run3; } else run3 = 0;
      if (x.rarity === 4) n4++;
      if (x.rarity === 5) {
        const isF = x.id === feat[5];
        if (isF) f5++;
        if (expectGuard && !isF) afterLostBad++;
        expectGuard = !isF; if (!isF) losses++;
      }
    }
    T.check('[' + bn.id + '] ' + N + ' lượt: không có chuỗi ' + bn.hard + ' lượt liền không 5★ (dài nhất ' + maxRun + ', pity cứng chặn ở ' + (bn.hard - 1) + ')', maxRun < bn.hard && n5 > 1000, 'n5 = ' + n5);
    T.check('[' + bn.id + '] ' + N + ' lượt: không có ' + bn.pity4 + ' lượt liền dưới 4★ (dài nhất ' + maxRun3 + ')', maxRun3 < bn.pity4 && n4 > 1000, 'n4 = ' + n4);

    const mean = N * an.rate5, sd = Math.sqrt(N * an.varGap / Math.pow(an.mean, 3));
    T.check('[' + bn.id + '] hai cách tính giải tích (chu kỳ và chuỗi Markov hai chiều) cho cùng tỉ lệ 5★ hợp nhất',
      Math.abs(an.rate5 - an.rate5chain) < 1e-9, an.rate5.toFixed(6) + ' vs ' + an.rate5chain.toFixed(6));
    T.check('[' + bn.id + '] số 5★ = ' + (an.rate5 * 100).toFixed(3) + '% × ' + N + ' trong 3σ', Math.abs(n5 - mean) < 3 * sd,
      n5 + ' vs ' + mean.toFixed(1) + ' ± ' + sd.toFixed(1) + ' (σ = ' + (Math.abs(n5 - mean) / sd).toFixed(2) + ')');
    const sd4 = Math.sqrt(N * an.rate4 * (1 - an.rate4));
    T.check('[' + bn.id + '] số 4★ = ' + (an.rate4 * 100).toFixed(3) + '% × ' + N + ' trong 3σ (σ nhị thức, rộng hơn thật)', Math.abs(n4 - N * an.rate4) < 3 * sd4,
      n4 + ' vs ' + (N * an.rate4).toFixed(1) + ' ± ' + sd4.toFixed(1));

    const share = featuredShare(), sdS = Math.sqrt(share * (1 - share) / n5);
    T.check('[' + bn.id + '] tỉ lệ 5★ đúng nhân vật nổi bật = 2/3 (chuỗi 50/50 có bảo đảm) trong 3σ', Math.abs(share - 2 / 3) < 1e-12 && Math.abs(f5 / n5 - share) < 3 * sdS,
      (f5 / n5).toFixed(4) + ' vs ' + share.toFixed(4) + ' ± ' + sdS.toFixed(4));
    T.check('[' + bn.id + '] sau mỗi lần trượt 50/50 (' + losses + ' lần) 5★ kế tiếp luôn là nhân vật nổi bật', afterLostBad === 0 && losses > 500, afterLostBad + ' vi phạm');
  });
}

// ───────────────────────── ghép trận giả ─────────────────────────
function testMmk() {
  console.log('Ghép trận giả');
  const { VS } = fresh();
  const save = VS.save.load();
  save.owned.shark.Tiger_Shark = 1; save.pick.shark = 'Tiger_Shark'; save.name = 'Thuong'; save.level = 12;
  const mapIds = VS.MAPS.map((m) => m.id);

  const a = VS.mmk.lineup(save, 'diver', VS.rng(2026));
  const b = VS.mmk.lineup(save, 'diver', VS.rng(2026));
  T.check('cùng chuỗi rng cho đúng cùng đội hình (seed, bản đồ, tên, nhân vật, ping, cấp)', sameJson(a, b));
  const c = VS.mmk.lineup(save, 'diver', VS.rng(2027));
  T.check('chuỗi rng khác cho đội hình khác', !sameJson(a, c));
  T.check('6 ghế: 4 thợ lặn rồi 2 cá mập, lineup và players cùng thứ tự',
    a.lineup.length === 6 && a.players.length === 6 && a.lineup.map((x) => x.team).join() === 'diver,diver,diver,diver,shark,shark' &&
    a.players.every((p, i) => p.team === a.lineup[i].team && p.defId === a.lineup[i].defId && p.name === a.lineup[i].name));
  T.check('người chơi phe thợ lặn ở ghế 0 với nhân vật đang chọn, ctrl human; 5 ghế còn lại là bot',
    a.lineup[0].ctrl === 'human' && a.lineup[0].defId === 'dave' && a.lineup[0].name === 'Thuong' && a.lineup.filter((x) => x.ctrl === 'human').length === 1 &&
    a.players[0].human === true && a.players.filter((p) => p.human).length === 1 && a.players[0].level === 12);
  const sk = VS.mmk.lineup(save, 'shark', VS.rng(2026));
  T.check('người chơi phe cá mập ở ghế đầu của đội cá mập (ghế 4) với Tiger_Shark, 4 ghế thợ lặn đều là bot',
    sk.lineup[4].ctrl === 'human' && sk.lineup[4].defId === 'Tiger_Shark' && sk.lineup[4].team === 'shark' && sk.lineup[5].ctrl === 'bot' &&
    sk.lineup.slice(0, 4).every((x) => x.ctrl === 'bot') && sk.players[4].human === true);
  T.check('mapId nằm trong VS.MAPS và seed là số nguyên không dấu 32 bit', mapIds.includes(a.mapId) && mapIds.includes(sk.mapId) &&
    Number.isInteger(a.seed) && a.seed >= 0 && a.seed < 4294967296, a.mapId + ' / ' + a.seed);
  T.check('cùng rng thì cùng seed và bản đồ bất kể phe (bản đồ chỉ phụ thuộc rng)', a.seed === sk.seed && a.mapId === sk.mapId);

  let uniqueNames = true, uniqueDef = true, validDef = true, rangeOk = true, onlyPool = true;
  const mapCount = {}, rar = { diver: { 3: 0, 4: 0, 5: 0 }, shark: { 3: 0, 4: 0, 5: 0 } };
  const L = 3000;
  for (let i = 0; i < L; i++) {
    const t = i % 2 ? 'shark' : 'diver', r = VS.mmk.lineup(save, t, VS.rng(1000 + i));
    mapCount[r.mapId] = (mapCount[r.mapId] || 0) + 1;
    const names = r.players.map((p) => p.name);
    if (new Set(names).size !== 6) uniqueNames = false;
    if (!names.every((n, k) => r.players[k].human ? n === 'Thuong' : VS.NAMES.includes(n))) onlyPool = false;
    ['diver', 'shark'].forEach((team) => {
      const ids = r.lineup.filter((x) => x.team === team).map((x) => x.defId);
      if (new Set(ids).size !== ids.length) uniqueDef = false;
      const tb = tableOf(VS, team);
      if (!ids.every((id) => tb[id])) validDef = false;
      r.lineup.forEach((x) => { if (x.team === team && x.ctrl === 'bot') rar[team][tb[x.defId].rarity]++; });
    });
    r.players.forEach((p) => { if (!(Number.isInteger(p.ping) && p.ping >= 14 && p.ping <= 144 && Number.isInteger(p.level) && p.level >= 1)) rangeOk = false; });
  }
  T.check(L + ' đội hình: 6 tên không trùng nhau, bot lấy tên từ VS.NAMES', uniqueNames && onlyPool);
  T.check('tên trong kho: ≥ 60, không trùng, tối đa 14 ký tự', VS.NAMES.length >= 60 && new Set(VS.NAMES).size === VS.NAMES.length && VS.NAMES.every((n) => n.length <= 14), VS.NAMES.length);
  T.check(L + ' đội hình: cùng đội không có hai nhân vật giống nhau, mọi defId có thật', uniqueDef && validDef);
  T.check(L + ' đội hình: ping 14–144 ms, cấp ≥ 1, đều là số nguyên', rangeOk);
  const fair = L / mapIds.length;
  T.check('bản đồ bốc đều trên cả ' + mapIds.length + ' bản (mỗi bản trong 5σ quanh ' + fair.toFixed(0) + ')',
    mapIds.every((id) => Math.abs((mapCount[id] || 0) - fair) < 5 * Math.sqrt(L * (1 / mapIds.length) * (1 - 1 / mapIds.length))), JSON.stringify(mapCount));
  ['diver', 'shark'].forEach((team) => {
    const rr = rar[team];
    T.check('bot ' + (team === 'diver' ? 'thợ lặn' : 'cá mập') + ' nghiêng về 3★: 3★ > 4★ > 5★', rr[3] > rr[4] && rr[4] > rr[5] && rr[5] > 0, JSON.stringify(rr));
  });
  const f = VS.mmk.lineup(save, 'diver', VS.rng(5));
  T.check('đội hình dùng được làm cfg.lineup của VS.sim.createMatch: mỗi mục có đủ team, defId, name, ctrl',
    f.lineup.every((x) => x.team && x.defId && x.name && (x.ctrl === 'human' || x.ctrl === 'bot')));
}

console.log('Vực Săn: bài kiểm sảnh thuần (Node)');
testSave();
testSettle();
testFeatured();
testPull();
testPity();
testMmk();
T.done();
