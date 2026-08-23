/* Con bot chơi hộ, để một bài kiểm tra tự động có thể chạy hết một ván.
 *
 * WHY: không ai ngồi bấm tay 6 tuần chơi mỗi lần sửa một dòng. Bot đi qua đúng
 * những màn hình mà người chơi đi qua — bản đồ, bảng chọn đồ, màn trận đánh —
 * nên nếu một nút chết thì bot đứng lại đúng chỗ đó.
 * ROOT-CAUSE: bài kiểm tra chỉ chụp ảnh màn hình thì không phân biệt được
 * "đang chơi" với "đứng im nhưng vẫn vẽ đẹp".
 * SEE: docs/memory/pixel-tests-cannot-see-controls.md
 */
(function (global) {
  'use strict';

  var timer = null, stats = null;

  function visible(sel) {
    var e = document.querySelector(sel);
    return e && e.style.display !== 'none' && e.offsetParent !== null;
  }

  var HEAL = { campfire: 1, house: 1 };

  /* Ô đáng đi tới nhất: sự kiện chưa dùng đã nhìn thấy, nếu không thì rìa
     vùng đã khám phá (chỗ tối gần nhất). Máu thấp thì chỉ tìm chỗ nghỉ. */
  function chooseTarget(w, healOnly) {
    var best = null, bestD = 1e9, i;
    for (i = 0; i < w.events.length; i++) {
      var e = w.events[i];
      if (e.used || !w.explored[w.idx(e.x, e.y)]) continue;
      // Lái buôn / golem / vạc nấu không bao giờ bị "dùng hết", nên phải tự nhớ
      // là đã ghé rồi — nếu không bot đi tới đi lui một ô cho tới hết ván.
      if (stats.visited[e.x + ',' + e.y]) continue;
      var d = Math.abs(e.x - w.px) + Math.abs(e.y - w.py);
      if (d > 0 && d < bestD) { bestD = d; best = { x: e.x, y: e.y }; }
    }
    if (best) return best;
    if (healOnly) return null;

    for (var y = 1; y < w.h - 1; y++) {
      for (var x = 1; x < w.w - 1; x++) {
        if (w.blocked(x, y) || !w.explored[w.idx(x, y)]) continue;
        var frontier = false;
        var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var k = 0; k < 4; k++) {
          var nx = x + d4[k][0], ny = y + d4[k][1];
          if (w.inside(nx, ny) && !w.explored[w.idx(nx, ny)]) { frontier = true; break; }
        }
        if (!frontier) continue;
        var dd = Math.abs(x - w.px) + Math.abs(y - w.py);
        if (dd > 0 && dd < bestD) { bestD = dd; best = { x: x, y: y }; }
      }
    }
    return best;
  }

  /* Đánh thử một trận trong đầu; chỉ vào thật nếu thắng mà còn hơn 1/4 máu. */
  function worthFighting(run, def) {
    try {
      var res = global.HIC_resolveBattle(run.playerCreature(), run.foeCreature(def),
        { seed: 1234, verbose: false });
      return res.playerWon && res.playerHp > res.playerMaxHp * 0.25;
    } catch (e) {
      return false;
    }
  }

  function clickFirst(list) {
    for (var i = 0; i < list.length; i++) {
      var e = document.querySelector(list[i]);
      if (e) { e.click(); return true; }
    }
    return false;
  }

  /* Chấm điểm thô một món đồ. Không thay được mắt người chơi, nhưng đủ để bot
     không nhặt bừa món đầu tiên và chết ở tuần 1 mỗi lần chạy kiểm tra. */
  function score(it) {
    var s = (it.attack || 0) * 3 + (it.armor || 0) * 2 +
      (it.health || 0) * 1.2 + (it.speed || 0) * 1.5;
    if (it.effect) s += 2;
    if (it.rarity === 'heroic') s += 1.5;
    if (it.rarity === 'rare') s += 0.8;
    /* Lấy một vũ khí là VỨT vũ khí đang cầm — chỉ có một ô vũ khí. Không trừ
       điểm ở đây thì bot đổi xuống gậy gỗ giữa tuần. */
    if (it.weapon) {
      var run = global.HIC_UI.run;
      var cur = run && run.inv.items[0];
      if (cur && cur.weapon) {
        var curScore = (cur.attack || 0) * 3 + (cur.bonusAttack || 0) * 3 + (cur.effect ? 2 : 0);
        if (s <= curScore) s -= 100;
      }
    }
    return s;
  }

  function pickBest() {
    var cards = document.querySelectorAll('#hic-panel .hic-card.pickable');
    if (!cards.length) return false;
    // Bảng "Hết ô đồ" hỏi ngược lại: bỏ món nào. Ở đó phải chọn món TỆ nhất.
    var head = document.querySelector('#hic-panel .hic-phead h3');
    var dropping = head && head.textContent.indexOf('Hết ô') === 0;
    var best = null, bestScore = dropping ? 1e9 : -1e9, plain = null;
    for (var i = 0; i < cards.length; i++) {
      var it = cards[i].__hicItem;
      if (!it) { if (!plain) plain = cards[i]; continue; }
      var v = score(it);
      if (dropping ? v < bestScore : v > bestScore) { bestScore = v; best = cards[i]; }
    }
    (best || plain || cards[0]).click();
    return true;
  }

  function stepOnce() {
    stats.ticks++;
    var UI = global.HIC_UI;

    /* Màn trận đánh phải xử lý TRƯỚC khi kiểm tra ván đã kết thúc chưa.
       WHY: cờ "thua rồi" được bật ngay lúc tính xong trận, trong khi màn hình
       trận vẫn đang mở. Thoát ở đây là bỏ dở đúng cú bấm mở ra màn hình kết
       thúc — và bài kiểm tra sẽ báo "game treo" trong khi game vẫn đúng. */
    if (visible('#hic-battle')) {
      stats.battles++;
      if (!clickFirst(['#hic-battle .hic-btn.primary'])) {
        clickFirst(['#hic-battle .hic-btn']);
      }
      return;
    }

    // Ván đã kết thúc: đứng yên, để màn hình kết thúc còn nguyên cho bài kiểm tra đọc.
    if (UI.run && UI.run.over) { stats.done = true; return; }

    // Bảng đang mở: chọn món đáng giá nhất, không thì bấm nút đầu tiên.
    if (visible('#hic-panel')) {
      stats.panels++;
      if (UI.world) stats.visited[UI.world.px + ',' + UI.world.py] = 1;

      /* Cửa thoát hiểm: nếu cùng một bảng đứng yên quá lâu thì bấm nút CUỐI —
         theo bố cục thì nút cuối luôn là nút rời đi. Không có nó thì một bảng
         kẹt sẽ treo cả bài kiểm tra và không ai biết bảng nào gây ra. */
      var head = document.querySelector('#hic-panel .hic-phead h3');
      var sig = (head ? head.textContent : '') + '|' +
        document.querySelectorAll('#hic-panel .hic-card').length;
      if (sig === stats.lastPanel) stats.samePanel++;
      else { stats.lastPanel = sig; stats.samePanel = 0; }
      if (stats.samePanel > 25) {
        stats.stuckPanels = (stats.stuckPanels || 0) + 1;
        stats.lastStuck = sig;
        var btns = document.querySelectorAll('#hic-panel .hic-btn');
        if (btns.length) btns[btns.length - 1].click();
        else clickFirst(['#hic-panel .hic-x']);
        stats.samePanel = 0;
        return;
      }

      /* Bảng nghỉ ngơi: chỉ nghỉ khi thật sự cần. Nghỉ ném đi cả phần còn lại
         của ngày, nên bấm bừa vào đây là tự cắt ngắn tuần của mình. */
      var rest = document.querySelector('#hic-panel .hic-rest-yes');
      if (rest) {
        var r0 = UI.run;
        var f = r0.hp() / Math.max(1, r0.stats().maxHp);
        (f < 0.55 ? rest : document.querySelector('#hic-panel .hic-rest-no')).click();
        return;
      }

      if (pickBest()) return;
      if (clickFirst(['#hic-panel .hic-btn.primary', '#hic-panel .hic-btn'])) return;
      clickFirst(['#hic-panel .hic-x']);
      return;
    }

    var run = UI.run, w = UI.world;
    if (!run || !w || run.over) { stats.done = true; return; }
    if (stats.world !== w) { stats.world = w; stats.visited = {}; }

    var frac = run.hp() / Math.max(1, run.stats().maxHp);
    var hurt = frac < 0.4;

    /* Quái đứng cạnh: đánh thử trong đầu trước đã.
       WHY: bộ máy trận đánh không có tác dụng phụ, nên bot chạy được đúng trận
       đó rồi mới quyết định — giống hệt việc người chơi đọc chỉ số con quái. */
    var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var k = 0; k < 4; k++) {
      var mob = w.monsterAt(w.px + d4[k][0], w.py + d4[k][1]);
      if (!mob) continue;
      if (!worthFighting(run, mob.def)) continue;
      UI.tryStep(d4[k][0], d4[k][1]);
      return;
    }

    // Máu thấp: ưu tiên đống lửa hoặc căn nhà; không có thì đi tiếp như thường.
    var t = hurt ? chooseTarget(w, true) : null;
    if (!t) t = chooseTarget(w);
    if (!t) {
      // Không còn gì để tới: đi đại một bước cho đồng hồ chạy tiếp.
      var dir = d4[stats.ticks % 4];
      UI.tryStep(dir[0], dir[1]);
      return;
    }
    var path = w.pathTo(t.x, t.y) || w.pathTo(t.x, t.y, true);
    if (!path || !path.length) {
      var dir2 = d4[(stats.ticks + 1) % 4];
      UI.tryStep(dir2[0], dir2[1]);
      return;
    }
    var n = path[0];
    UI.tryStep(n.x - w.px, n.y - w.py);
  }

  global.HIC_BOT = {
    start: function (intervalMs) {
      if (timer) clearInterval(timer);
      stats = { ticks: 0, battles: 0, panels: 0, done: false, visited: {}, world: null,
        lastPanel: '', samePanel: 0, stuckPanels: 0, lastStuck: null };
      timer = setInterval(function () {
        try { stepOnce(); } catch (e) { stats.error = String(e && e.message || e); }
      }, intervalMs || 30);
      return true;
    },
    stop: function () { if (timer) clearInterval(timer); timer = null; return stats; },
    stats: function () { return stats; },
    running: function () { return !!timer; }
  };
})(window);
