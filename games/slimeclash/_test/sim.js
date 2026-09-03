/*
 * Test engine không cần trình duyệt:  node _test/sim.js
 *
 * Ba việc:
 *   1. Kiểm bất biến bàn cờ (trọng lực, không quân lơ lửng, không đội hình ma).
 *   2. Chơi bot vs bot hàng nghìn trận, đo tỉ lệ thắng và số lượt.
 *   3. Đối chiếu nhịp trận với mục tiêu 2-5 phút [MOB] và đường cong x1.15/ngày [APK].
 */
'use strict';
var path = require('path');
function req(p) { return require(path.join(__dirname, '..', 'js', p)); }

var CFG = req('config.js');
var DATA = req('data.js');
var ENG = req('engine.js');
req('ai.js');

var fails = [];
function check(cond, msg) { if (!cond) fails.push(msg); }

// ---------------------------------------------------------------- bất biến
function checkBoard(b, tag) {
  for (var c = 0; c < b.cols; c++) {
    var seenEmptyBelow = false;
    // đi từ hàng TRƯỚC (rows-1) ngược về sau: gặp trống rồi thì không được gặp quân nữa
    for (var r = b.rows - 1; r >= 0; r--) {
      if (!b.cells[r][c]) seenEmptyBelow = true;
      else if (seenEmptyBelow) { check(false, tag + ': quân lơ lửng ở cột ' + c); return; }
    }
  }
  for (var r2 = 0; r2 < b.rows; r2++)
    for (var c2 = 0; c2 < b.cols; c2++) {
      var u = b.cells[r2][c2];
      if (u && u.hp <= 0) check(false, tag + ': quân máu <= 0 còn trên bàn');
      if (u && u.kind === 'charging' && u.fid === 0) check(false, tag + ': đang nạp mà không có fid');
    }
}

function makeDeck(ids, level) {
  return ids.map(function (id) { return { hero: DATA.BY_ID[id], level: level || 1 }; });
}

var starter = DATA.starterIds.slice(0, 3);
var eliteId = DATA.HEROES.filter(function (h) { return h.klass === 'elite'; })[0].id;
var champId = DATA.HEROES.filter(function (h) { return h.klass === 'champion'; })[0].id;
var deckIds = starter.concat([eliteId, champId]);

// ---------------------------------------------------------------- mô phỏng
// Bot người chơi: dùng chính hàm chấm điểm của AI để tự đánh.
var AI = global.SlimeAI;

function playerBotMove(battle) {
  var b = battle.player;
  var best = null;
  var snap = b.cells.map(function (row) { return row.map(function (u) { return u ? Object.assign({}, u) : null; }); });
  function restore() {
    b.cells = snap.map(function (row) { return row.map(function (u) { return u ? Object.assign({}, u) : null; }); });
  }
  for (var r = 0; r < b.rows; r++) {
    for (var c = 0; c < b.cols; c++) {
      if (!b.isFree(r, c)) continue;
      for (var t = 0; t < b.cols; t++) {
        if (t === c) continue;
        restore();
        var u = b.removeAt(r, c);
        if (!u) continue;
        if (!b.dropInto(t, u)) continue;
        b.detectFormations();
        var sc = AI.score(b);
        if (!best || sc > best.score) best = { score: sc, r: r, c: c, t: t };
      }
    }
  }
  restore();
  if (!best) return false;
  return battle.pickUp(best.r, best.c) && battle.dropAt(best.t);
}

function runBattle(chapter, day, seed, level, heroLevel) {
  var battle = new ENG.Battle({
    chapter: chapter, day: day, seed: seed,
    deck: makeDeck(deckIds, level || 1),
    enemyDeck: makeDeck(deckIds, level || 1),
    heroLevel: arguments.length > 4 ? arguments[4] : 1
  });
  var guard = 0;
  while (!battle.over && guard++ < 400) {
    while (battle.canAct()) {
      if (!playerBotMove(battle)) break;
    }
    // dùng hết kỹ năng cầm tay cho giống người chơi thật
    while (battle.skills.length > 4) battle.useSkill(0);
    checkBoard(battle.player, 'player ch' + chapter + 'd' + day);
    checkBoard(battle.enemy, 'enemy ch' + chapter + 'd' + day);
    battle.endTurn();
  }
  check(guard < 400, 'trận không kết thúc (ch' + chapter + ' d' + day + ')');
  return battle;
}

console.log('=== 1. bất biến + mô phỏng ===');
var results = [];
for (var day = 1; day <= 10; day++) {
  var wins = 0, turns = 0, n = 60;
  for (var i = 0; i < n; i++) {
    var b = runBattle(1, day, 1234 + i * 7 + day * 101);
    if (b.won) wins++;
    turns += b.turn;
  }
  results.push({ day: day, win: wins / n, turns: turns / n });
}

console.log('ngày | hp_ratio | máu hero địch | tỉ lệ thắng bot | lượt TB | phút ước tính');
results.forEach(function (r) {
  var ratio = CFG.hpRatio(1, r.day);
  var hp = Math.round(CFG.hero.enemyHpBase * ratio);
  var mins = (r.turns * 17 / 60);   // ~17 giây/lượt (3 move + đọc bàn)
  console.log(
    String(r.day).padStart(4) + ' | ' +
    ratio.toFixed(2).padStart(8) + ' | ' +
    String(hp).padStart(13) + ' | ' +
    (r.win * 100).toFixed(0).padStart(15) + '% | ' +
    r.turns.toFixed(1).padStart(7) + ' | ' +
    mins.toFixed(1).padStart(13)
  );
});

console.log('');
console.log('=== 2. kiểm chương sau (đường cong x1.15) ===');
[1, 2, 3, 5].forEach(function (ch) {
  var w = 0, N = 30;
  var lv = Math.min(5, ch), hl = ch;   // cấp Hero lên theo chương (mua bằng vàng)
  for (var i = 0; i < N; i++) if (runBattle(ch, 10, 999 + i * 13, lv, hl).won) w++;
  console.log('  chương ' + ch + ' ngày 10: hp_ratio ' + CFG.hpRatio(ch, 10).toFixed(2) +
              ', bot thắng ' + Math.round(w / N * 100) + '% (quân cấp ' + lv + ', Hero cấp ' + hl + ')');
});

console.log('');
console.log('=== 3. kinh tế: trần chương có chặn thật không ===');
var ECON = req('economy.js');
var SAVE = req('save.js');
var st = SAVE.freshState();
var eco = new ECON.Economy(st);
eco.rollDaily();
var before = st.gold;
for (var k = 0; k < 50; k++) eco.grant({ gold: 1000, gem: 100, shard: 20 });
console.log('  sau 50 lần cố nhận 1000 vàng: chapterGold = ' + st.chapterGold +
            ' (trần chương 1 = ' + CFG.coinMaxFor(1) + ')');
console.log('  kim cương nhận hôm nay = ' + st.gemToday + ' (trần ngày = ' + CFG.economy.gemCapPerDay + ')');
console.log('  mảnh hero chương này = ' + st.chapterCards + ' (trần = ' + CFG.cardMaxFor(1) + ')');
check(st.chapterGold <= CFG.coinMaxFor(1), 'THỦNG trần vàng');
check(st.gemToday <= CFG.economy.gemCapPerDay, 'THỦNG trần kim cương ngày');
check(st.chapterCards <= CFG.cardMaxFor(1), 'THỦNG trần mảnh hero');

console.log('');
console.log('=== 4. phiếu ưu đãi có chặn mở gói không ===');
var st2 = SAVE.freshState();
var eco2 = new ECON.Economy(st2);
eco2.rollDaily();
var bought = 0;
for (var q = 0; q < 40; q++) if (eco2.buyPack('small').ok) bought++;
console.log('  mua gói "small" 40 lần -> thành công ' + bought +
            ' (phiếu/ngày = ' + CFG.economy.ticketsPerDay + ')');
check(bought <= CFG.economy.ticketsPerDay, 'THỦNG ngân sách phiếu');

console.log('');
if (fails.length) {
  console.log('LỖI (' + fails.length + '):');
  fails.slice(0, 20).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('OK — không có lỗi bất biến.');
