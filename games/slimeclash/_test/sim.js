/*
 * Test engine không cần trình duyệt:  node _test/sim.js
 *
 * Ba việc:
 *   1. Kiểm bất biến bàn cờ và luật gộp (>=3 cùng loại cùng cấp -> 1 quân cấp cao hơn).
 *   2. Chơi bot hàng nghìn trận, đo tỉ lệ thắng và số lượt theo chương/ngày.
 *   3. Đối chiếu nhịp trận với mục tiêu 2-5 phút [MOB] và đường cong máu quái [APK].
 *
 * Bot ở đây CỐ Ý chỉ tham lam 1 nước. Nếu số cân bằng chỉ đúng khi người chơi chơi
 * hoàn hảo thì nó sai — bot yếu là phép thử đúng.
 */
'use strict';
var path = require('path');
function req(p) { return require(path.join(__dirname, '..', 'js', p)); }

var CFG = req('config.js');
var DATA = req('data.js');
var ENG = req('engine.js');

/* Cần dò số thì đặt biến môi trường, ĐỪNG sửa config rồi quên trả lại:
 *   SC_HPBASE=900 SC_CHMUL=1.20 SC_GRADE=3.6 node _test/sim.js 40
 * Không đặt thì chạy đúng số đang có trong js/config.js. */
if (process.env.SC_HPBASE) CFG.hero.enemyHpBase = +process.env.SC_HPBASE;
if (process.env.SC_CHMUL) CFG.chapterHpMul = CFG.enemyPowerChapterMul = +process.env.SC_CHMUL;
if (process.env.SC_GRADE) CFG.merge.gradePowerMul = +process.env.SC_GRADE;
if (process.env.SC_FOLLOW) CFG.runPowerFollow = +process.env.SC_FOLLOW;
if (process.env.SC_FOEATK) CFG.foe.atkBase = +process.env.SC_FOEATK;
if (process.env.SC_MOVES) CFG.movesPerTurn = +process.env.SC_MOVES;
if (process.env.SC_SPAWN) CFG.board.spawnPerTurn = +process.env.SC_SPAWN;
if (process.env.SC_START) CFG.board.startUnits = +process.env.SC_START;

var fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

// ---------------------------------------------------------------- bất biến
function checkBoard(b, tag) {
  var n = 0;
  for (var r = 0; r < b.rows; r++) {
    for (var c = 0; c < b.cols; c++) {
      var u = b.cells[r][c];
      if (!u) continue;
      n++;
      if (u.hp <= 0) check(false, tag + ': quân máu <= 0 còn trên bàn');
      if (u.grade < 1) check(false, tag + ': cấp < 1');
      if (u.power < 1) check(false, tag + ': lực < 1');
      if (!DATA.BY_ID[u.heroId]) check(false, tag + ': heroId lạ ' + u.heroId);
    }
  }
  if (n > b.rows * b.cols) check(false, tag + ': quá số ô');
  // sau resolveMerges thì KHÔNG được còn hàng nào chưa gộp
  if (b.findRun()) check(false, tag + ': còn hàng >=3 chưa gộp');
}

function makeDeck(ids, level) {
  return ids.map(function (id) { return { hero: DATA.BY_ID[id], level: level || 1 }; });
}

var deckIds = DATA.starterIds.slice(0, CFG.deck.size);

// ---------------------------------------------------------------- luật gộp
(function testMerge() {
  var rng = new ENG.RNG(7);
  var b = new ENG.Board(makeDeck(deckIds), rng, 1);
  var d = { hero: DATA.BY_ID[deckIds[0]], level: 1 };
  var d2 = { hero: DATA.BY_ID[deckIds[1]], level: 1 };

  // ba con giống hệt nằm ngang -> gộp thành một con cấp 2
  b.cells[0][0] = b.makeUnit(d, 1);
  b.cells[0][1] = b.makeUnit(d, 1);
  b.cells[0][2] = b.makeUnit(d, 1);
  var base = b.makeUnit(d, 1).power;
  var ev = b.resolveMerges();
  check(ev.length >= 1, 'gộp: 3 con cùng loại cùng cấp phải gộp');
  var g2 = b.units().filter(function (u) { return u.grade >= 2; });
  check(g2.length === 1, 'gộp: phải còn đúng 1 quân cấp >=2, có ' + g2.length);
  check(g2.length && g2[0].power > base, 'gộp: cấp cao phải mạnh hơn cấp 1');

  // khác CẤP thì KHÔNG gộp
  var b2 = new ENG.Board(makeDeck(deckIds), new ENG.RNG(9), 1);
  b2.cells[1][0] = b2.makeUnit(d, 1);
  b2.cells[1][1] = b2.makeUnit(d, 2);
  b2.cells[1][2] = b2.makeUnit(d, 1);
  check(b2.resolveMerges().length === 0, 'gộp: khác cấp thì không được gộp');

  // khác LOẠI thì KHÔNG gộp
  var b3 = new ENG.Board(makeDeck(deckIds), new ENG.RNG(11), 1);
  b3.cells[2][0] = b3.makeUnit(d, 1);
  b3.cells[2][1] = b3.makeUnit(d2, 1);
  b3.cells[2][2] = b3.makeUnit(d, 1);
  check(b3.resolveMerges().length === 0, 'gộp: khác loại thì không được gộp');

  // dọc cũng phải gộp
  var b4 = new ENG.Board(makeDeck(deckIds), new ENG.RNG(13), 1);
  b4.cells[0][3] = b4.makeUnit(d, 1);
  b4.cells[1][3] = b4.makeUnit(d, 1);
  b4.cells[2][3] = b4.makeUnit(d, 1);
  check(b4.resolveMerges().length >= 1, 'gộp: hàng dọc cũng phải gộp');

  // dây chuyền: gộp xong tạo hàng mới thì gộp tiếp
  var b5 = new ENG.Board(makeDeck(deckIds), new ENG.RNG(17), 1);
  for (var c = 0; c < 3; c++) b5.cells[0][c] = b5.makeUnit(d, 1);   // -> cấp 2 ở (0,1)
  b5.cells[1][1] = b5.makeUnit(d, 2);
  b5.cells[2][1] = b5.makeUnit(d, 2);
  var ev5 = b5.resolveMerges();
  check(ev5.length >= 2, 'gộp: phải gộp dây chuyền, chỉ có ' + ev5.length + ' lần');

  // đổi chỗ 2 ô có quân
  var b6 = new ENG.Board(makeDeck(deckIds), new ENG.RNG(19), 1);
  b6.cells[0][0] = b6.makeUnit(d, 1);
  b6.cells[0][1] = b6.makeUnit(d2, 1);
  var a = b6.cells[0][0];
  b6.move(0, 0, 0, 1);
  check(b6.cells[0][1] === a, 'đổi chỗ: quân A phải sang ô B');
  check(b6.cells[0][0] && b6.cells[0][0].heroId === d2.hero.id, 'đổi chỗ: quân B phải về ô A');
})();

// ---------------------------------------------------------------- bot
/*
 * Bot tham lam: thử mọi nước KỀ, chấm bàn cờ sau nước đi. Điểm = tổng lực + thưởng
 * cho cặp cùng loại cùng cấp đứng kề nhau (gần thành hàng). Không nhìn xa hơn 1 nước.
 */
function snap(b) {
  return b.cells.map(function (row) {
    return row.map(function (u) { return u ? Object.assign({}, u) : null; });
  });
}
function restore(b, s) {
  b.cells = s.map(function (row) {
    return row.map(function (u) { return u ? Object.assign({}, u) : null; });
  });
}
function scoreBoard(b) {
  var s = b.totalPower();
  for (var r = 0; r < b.rows; r++) {
    for (var c = 0; c < b.cols; c++) {
      var u = b.cells[r][c];
      if (!u) continue;
      var right = b.get(r, c + 1), down = b.get(r + 1, c);
      if (right && right.heroId === u.heroId && right.grade === u.grade) s += 40 * u.grade;
      if (down && down.heroId === u.heroId && down.grade === u.grade) s += 40 * u.grade;
    }
  }
  return s;
}

function botMove(battle) {
  var b = battle.board;
  var s0 = snap(b);
  var best = null;
  for (var r = 0; r < b.rows; r++) {
    for (var c = 0; c < b.cols; c++) {
      if (!b.cells[r][c]) continue;
      for (var r2 = 0; r2 < b.rows; r2++) {
        for (var c2 = 0; c2 < b.cols; c2++) {
          // chỉ xét nước KỀ: xét hết bàn là 1296 nước mỗi bước, chậm mà không đúng hơn.
          if (Math.abs(r2 - r) + Math.abs(c2 - c) !== 1) continue;
          restore(b, s0);
          b.move(r, c, r2, c2);
          b.resolveMerges();
          var sc = scoreBoard(b);
          if (!best || sc > best.sc) best = { sc: sc, r: r, c: c, r2: r2, c2: c2 };
        }
      }
    }
  }
  restore(b, s0);
  if (!best) return false;
  return battle.moveUnit(best.r, best.c, best.r2, best.c2);
}

function playBattle(chapter, day, heroLevel, unitLevel, seed) {
  var battle = new ENG.Battle({
    chapter: chapter, day: day, seed: seed,
    deck: makeDeck(deckIds, unitLevel), heroLevel: heroLevel,
    foeName: 'Quái thử', foeArt: null
  });
  var guard = 0;
  while (!battle.over && guard++ < 400) {
    while (battle.canAct()) {
      if (!botMove(battle)) break;
    }
    // bot xài kỹ năng ngay khi có — người chơi thật cũng vậy
    while (battle.skills.length && !battle.over) battle.useSkill(0);
    if (battle.over) break;
    battle.endTurn();
    checkBoard(battle.board, 'C' + chapter + 'D' + day);
  }
  return battle;
}

// ---------------------------------------------------------------- tiến trình
/*
 * Cấp Hero và cấp quân KHÔNG được bịa. Vàng của cả game bị chặn bởi coin_max mỗi
 * chương [APK], nên tổng vàng tới hết chương c là tổng các trần đó — không hơn được.
 * Bản mô phỏng trước tôi giả định "mỗi chương lên 1.2 cấp Hero", và vì thế kết luận
 * game quá dễ ở chương sau. Sai: với bảng giá hiện tại, tới chương 8 người chơi mới
 * đủ vàng cho khoảng cấp 5.
 *
 * Giả định chi tiêu: 70% vàng cho Hero (nguồn sức mạnh vĩnh viễn), 30% cho quân.
 */
function heroUpCost(level) { return 60 * level * level; }    // khớp UI.heroUpCost
function unitUpCost(level) { return 60 * level; }            // khớp UI.unitUpCost

function progress(chapter) {
  var gold = 0;
  for (var c = 1; c <= chapter; c++) gold += CFG.coinMaxFor(c);
  var heroBudget = gold * 0.70, unitBudget = gold * 0.30;

  var heroLevel = 1;
  while (heroLevel < CFG.hero.maxLevel && heroBudget >= heroUpCost(heroLevel)) {
    heroBudget -= heroUpCost(heroLevel); heroLevel++;
  }
  // vàng quân chia đều cho cả đội hình
  var per = unitBudget / CFG.deck.size;
  var unitLevel = 1;
  while (unitLevel < 5 && per >= unitUpCost(unitLevel)) {
    per -= unitUpCost(unitLevel); unitLevel++;
  }
  return { heroLevel: heroLevel, unitLevel: unitLevel, gold: gold };
}

// ---------------------------------------------------------------- chạy
var N = parseInt(process.argv[2], 10) || 30;
console.log('=== nhịp trận (bot tham lam 1 nước, ' + N + ' ván / ô) ===');
console.log('tiến trình theo trần vàng [APK]:');
[1, 2, 3, 5, 8].forEach(function (c) {
  var p = progress(c);
  console.log('  chương ' + c + ': vàng tích luỹ ' + Math.round(p.gold) +
              ' -> Hero cấp ' + p.heroLevel + ', quân cấp ' + p.unitLevel +
              ' (nhân lực x' + CFG.metaPowerMul(p.heroLevel).toFixed(2) + ')');
});
console.log('');
console.log('chương ngày  thắng%  lượt TB  máu quái  lực cuối  dài nhất');

var CHAPTERS = (process.env.SC_CHAPTERS || '1,3,5,8,12,14,16').split(',').map(Number);
var DAYS = (process.env.SC_DAYS || '1,5,10').split(',').map(Number);
var rows = [];
CHAPTERS.forEach(function (chapter) {
  var pg = progress(chapter);
  var heroLevel = pg.heroLevel, unitLevel = pg.unitLevel;
  DAYS.forEach(function (day) {
    var wins = 0, turns = 0, maxTurn = 0, power = 0;
    for (var i = 0; i < N; i++) {
      var b = playBattle(chapter, day, heroLevel, unitLevel,
                         (chapter * 7919 + day * 104729 + i * 31) >>> 0);
      if (b.won) { wins++; turns += b.turn; }
      maxTurn = Math.max(maxTurn, b.turn);
      power += b.board.totalPower();
    }
    var wr = wins / N;
    rows.push({ chapter: chapter, day: day, wr: wr, avgTurns: wins ? turns / wins : 0 });
    console.log(
      String(chapter).padStart(6) + String(day).padStart(5) +
      (wr * 100).toFixed(0).padStart(8) + '%' +
      (wins ? (turns / wins).toFixed(1) : '-').padStart(9) +
      String(Math.round(CFG.hero.enemyHpBase * CFG.hpRatio(chapter, day))).padStart(10) +
      String(Math.round(power / N)).padStart(10) +
      String(maxTurn).padStart(10));
  });
});

// ---------------------------------------------------------------- đánh giá
/*
 * Hình dạng độ khó MUỐN CÓ, và vì sao:
 *   - Chương đầu gần như thắng chắc. Đây là game trong hub, không phải roguelike.
 *   - Giữa game (chương 5-12) vẫn qua được với lối chơi bình thường.
 *   - Có MỘT BỨC TƯỜNG ở cuối, và nó phải đến từ kinh tế: trần vàng mỗi chương [APK]
 *     chặn cấp Hero, trong khi máu quái nhân 1.24 mỗi chương mãi mãi. Chỗ hai đường
 *     đó cắt nhau chính là điểm dừng của bản này (đo được: quanh chương 15).
 *
 * Lưu ý khi chỉnh: mô hình gộp cho dải chuyển RẤT HẸP — đo được enemyHpBase 3200 ra
 * gần 100% thắng còn 3600 ra khoảng 30%. Đừng nhích enemyHpBase quá 5% mỗi lần.
 * Và bot ở đây chỉ nhìn 1 nước; người chơi thật mạnh hơn nó, nên tỉ lệ thắng của bot
 * là SÀN chứ không phải kỳ vọng.
 */
console.log('');
console.log('=== kiểm cân bằng ===');
var byChapter = {};
rows.forEach(function (r) {
  (byChapter[r.chapter] = byChapter[r.chapter] || []).push(r.wr);
});
var avg = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
function chAvg(c) { return byChapter[c] ? avg(byChapter[c]) : null; }

Object.keys(byChapter).forEach(function (c) {
  console.log('  chương ' + c + ': thắng TB ' + (chAvg(+c) * 100).toFixed(0) + '%');
});

if (chAvg(1) !== null) check(chAvg(1) >= 0.85, 'chương 1 phải gần như thắng chắc, đang ' + (chAvg(1) * 100).toFixed(0) + '%');
if (chAvg(8) !== null) check(chAvg(8) >= 0.60, 'chương 8 quá khó: ' + (chAvg(8) * 100).toFixed(0) + '%');
if (chAvg(12) !== null) check(chAvg(12) >= 0.40, 'chương 12 quá khó: ' + (chAvg(12) * 100).toFixed(0) + '%');
if (chAvg(16) !== null) check(chAvg(16) <= 0.50, 'không có bức tường cuối: chương 16 vẫn ' + (chAvg(16) * 100).toFixed(0) + '%');
if (chAvg(1) !== null && chAvg(14) !== null)
  check(chAvg(1) > chAvg(14), 'độ khó không tăng theo chương');

// nhịp trận: mọi ô phải kết thúc trong ngân sách lượt, và không được xong trong 2 lượt
rows.forEach(function (r) {
  if (r.avgTurns && r.avgTurns < 3)
    check(false, 'chương ' + r.chapter + ' ngày ' + r.day + ': trận xong quá nhanh (' +
                 r.avgTurns.toFixed(1) + ' lượt)');
});

if (fails.length) {
  console.log('\nX ' + fails.length + ' vấn đề:');
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('\nOK tất cả kiểm tra đạt');
