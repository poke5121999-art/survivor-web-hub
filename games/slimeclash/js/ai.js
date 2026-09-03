/*
 * SlimeClash — AI của địch.
 *
 * Cố ý KHÔNG làm AI mạnh. Độ khó của game đến từ ngân sách bước và hệ số máu theo ngày
 * ([APK] hp_ratio x1.15/ngày, attack_ratio = 1 nghĩa là sát thương quái KHÔNG tăng),
 * chứ không đến từ việc địch chơi giỏi. Xem _research/slime-legion-apk-datamine.md mục 5:
 * "Độ khó là bài toán đủ DPS trong 6 bước, không phải né chết."
 *
 * AI tham lam 1 bước: thử mọi (nhấc, thả) hợp lệ, chấm điểm bàn cờ sau nước đi, chọn cao nhất.
 */
(function (root) {
  'use strict';

  var CFG = root.CFG || require('./config.js');

  function snapshot(board) {
    return board.cells.map(function (row) {
      return row.map(function (u) { return u ? Object.assign({}, u) : null; });
    });
  }
  function restore(board, snap) {
    board.cells = snap.map(function (row) {
      return row.map(function (u) { return u ? Object.assign({}, u) : null; });
    });
  }

  // Điểm: ưu tiên tạo đội hình tấn công, rồi tường, rồi gom cùng màu theo cột.
  function score(board) {
    var s = 0, r, c;
    var colColor = {};
    for (r = 0; r < board.rows; r++) {
      for (c = 0; c < board.cols; c++) {
        var u = board.cells[r][c];
        if (!u) continue;
        if (u.kind === 'charging') s += 12 + u.power * 0.5;
        else if (u.kind === 'wall') s += 4;
        else {
          var k = c + ':' + u.color;
          colColor[k] = (colColor[k] || 0) + 1;
          s += colColor[k];               // thưởng dồn cùng màu trong cột
        }
      }
    }
    return s;
  }

  function takeTurn(battle) {
    var board = battle.enemy;
    var moves = CFG.movesPerTurn;

    while (moves > 0) {
      var best = null;
      var snap = snapshot(board);

      for (var r = 0; r < board.rows; r++) {
        for (var c = 0; c < board.cols; c++) {
          if (!board.isFree(r, c)) continue;
          for (var t = 0; t < board.cols; t++) {
            if (t === c) continue;
            restore(board, snap);
            var u = board.removeAt(r, c);
            if (!u) continue;
            if (!board.dropInto(t, u)) continue;
            board.detectFormations();
            var sc = score(board);
            if (!best || sc > best.score) best = { score: sc, r: r, c: c, t: t };
          }
        }
      }

      restore(board, snap);
      if (!best) break;

      var unit = board.removeAt(best.r, best.c);
      if (!unit) break;
      board.dropInto(best.t, unit);
      board.detectFormations();
      board.refill();
      moves--;
    }
  }

  root.SlimeAI = { takeTurn: takeTurn, score: score };
  if (typeof module === 'object' && module.exports) module.exports = root.SlimeAI;
})(typeof window !== 'undefined' ? window : globalThis);
