/*
 * ĐO ĐỘ MƯỢT & SĂN LỖI KẸT TRẠNG THÁI cho games/dragonproj (Săn Rồng).
 * Chạy: node test/dragonproj-perf.js
 *
 * Vì sao cần bộ này, tách khỏi test/dragonproj-suite.js:
 *   - dragonproj-suite.js kiểm "đúng luật" (số liệu, cử chỉ, phần thưởng).
 *   - bộ này kiểm "chơi có sướng không": khung hình có tụt không, mảng có phình
 *     lên mãi không, và quan trọng nhất — máy trạng thái người chơi có bao giờ
 *     kẹt lại ở 'lag'/'charge'/'aim' rồi không nhận input nữa không.
 *
 * Nguyên tắc giữ nguyên: mọi thao tác chiến đấu đi qua PointerEvent thật trên
 * canvas, tức đi qua đúng js/punicon.js. Không gọi tắt hàm nội bộ để "làm xanh".
 * Chỗ duy nhất chạm vào ruột game là ÉP tình huống hiếm (ép máu về 0, ép boss
 * chết) — vì không ép thì phải chơi hàng giờ mới gặp.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const URL = root + '/games/dragonproj/index.html';

// DP_QUICK=1 rút ngắn các đoạn đo dài (chỉ dùng khi sửa chính bộ test này;
// số liệu FPS/rò rỉ lấy từ lần chạy đầy đủ mới có ý nghĩa).
const QUICK = !!process.env.DP_QUICK;
const T_FPS = QUICK ? 4000 : 30000;      // thời lượng mỗi lần đo FPS
const T_LEAKN = QUICK ? 3 : 13;          // số mẫu rò rỉ (cách nhau 5s)
const T_STUCK = QUICK ? 8000 : 150000;   // thời lượng bot chạy săn kẹt

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function info(line) { results.push('    · ' + line); }

/* ---------------------------------------------------------------- MÃ TRONG TRANG
 * Cài một bộ đồ nghề nhỏ vào trang: bắn PointerEvent thô (để mô phỏng "ngón đặt
 * xuống rồi GIỮ NGUYÊN, không sinh thêm sự kiện nào" — điều mà DPBot._hold không
 * làm được vì nó luôn bắn thêm move/up), móc đo thời gian mỗi khung hình, và
 * bộ lấy mẫu trạng thái.
 */
const INSTALL = function () {
  var T = window.__T = {
    fr: [], frOn: false,      // khoảng thời gian giữa hai khung hình của game
    st: [], stIv: null,       // mẫu trạng thái người chơi
    keep: null
  };
  var cv = document.getElementById('view');

  // PointerEvent thô, toạ độ trong hệ 540x960 giống bot.
  T.pe = function (type, x, y, id) {
    var r = cv.getBoundingClientRect();
    var e = new PointerEvent(type, {
      pointerId: id, bubbles: true, cancelable: true, isPrimary: true,
      clientX: r.left + x * (r.width / 540), clientY: r.top + y * (r.height / 960),
      pointerType: 'touch'
    });
    (type === 'pointerdown' ? cv : window).dispatchEvent(e);
  };

  // Móc vào Battle.prototype.step: đây là khung hình THẬT của game (do
  // requestAnimationFrame gọi), nên đo ở đây là đo đúng cái mắt người thấy.
  var _step = DP.Battle.prototype.step, _prev = 0;
  DP.Battle.prototype.step = function (now) {
    if (T.frOn) { if (_prev) T.fr.push(now - _prev); _prev = now; } else { _prev = 0; }
    return _step.call(this, now);
  };

  // Trang bị nhanh một lớp vũ khí để kiểm đủ 5 kiểu đặc thù (guard/cleave/lunge/
  // ranbu/snipe). Dùng đúng đường craft của game, chỉ bỏ qua khâu tốn tài nguyên.
  var SRC = { sword: 'felnarog', great: 'vaccahorn', spear: 'grouton', dual: 'shurak', bow: 'yggdragis' };
  // Giữ lại bộ đồ khởi đầu — nó là bộ DUY NHẤT có sẵn Magi gắn vào ô, cần cho
  // phép kiểm "xả Magi khi đang guard".
  T.startLoadout = DP.UI.save.loadout.weapons.slice();
  T.restore = function () {
    DP.UI.save.loadout.weapons = T.startLoadout.slice();
    DP.UI.battle.setWeapon(0, true);
    return { special: DP.UI.battle.W.special, magi: DP.UI.battle.wp.magi.length };
  };
  T.equip = function (cls) {
    var S = DP.UI.save;
    var g = S.gear.find(function (x) { return x.kind === 'weapon' && x.wclass === cls; });
    if (!g) { g = DP.forgeGear(SRC[cls], 'weapon', 'perf'); g.lv = 30; S.gear.push(g); }
    S.loadout.weapons[0] = g.uid;
    DP.UI.battle.setWeapon(0, true);          // true = đổi tức thì, không vào trạng thái 'switch'
    return DP.UI.battle.W.special;
  };

  // Dọn sân để kiểm Punicon: không quái, không boss đánh, không Sudden Behemoth.
  // Nếu không dọn thì một cú cắn của quái đẩy state sang 'hurt' và làm nhiễu.
  T.clean = function () {
    var b = DP.UI.battle; if (!b) return;
    b.mobs.length = 0; b.suddenDone = true; b.portalOpen = false; b.needKills = 9999;
    b.telegraphs.length = 0; b.projs.length = 0; b.fx.length = 0; b.msgs.length = 0;
    // Nhả sạch cần gạt, để mỗi phép kiểm bắt đầu từ trang giấy trắng.
    b.puni.active = false; b.puni.holding = false; b.puni.pointerId = null;
    b.puni.moveVec = { x: 0, y: 0, m: 0 }; b.puni.slideHint = -1;
    b.player.state = 'idle'; b.player.down = false; b.player.hp = b.player.maxHp;
    b.player.dodgeCd = 0; b.player.iframe = 0; b.player.counterUntil = 0;
    if (b.boss) { b.boss.cd = 1e9; b.boss.state = 'idle'; }
  };

  T.state = function () {
    var b = DP.UI.battle;
    return b ? { s: b.player.state, hold: b.puni.holding, act: b.puni.active,
                 cen: b.puni.centeredT === null ? null : 1, run: b.running } : null;
  };

  T.frStart = function () { T.fr.length = 0; T.frOn = true; };
  // Trả kèm tình trạng trận lúc dừng đo — nếu mảng khung hình rỗng thì phải biết
  // ngay là "trận đã kết thúc giữa chừng" chứ không phải "game đứng hình".
  T.frStop = function () {
    T.frOn = false;
    var b = DP.UI.battle;
    return { fr: T.fr.slice(),
             run: !!(b && b.running), mode: b ? b.mode : null,
             res: b && b.result ? JSON.stringify(Object.keys(b.result)) : null,
             scr: (document.querySelector('.screen.on') || {}).id || null };
  };

  // Lấy mẫu trạng thái + stateT. stateT cần thiết để phân biệt "kẹt ở 'attack'"
  // với "đánh liên tiếp nhiều đòn": đòn mới làm stateT tụt về 0.
  T.seenBattles = 0;
  T.stStart = function () {
    T.st.length = 0; T.seenBattles = 0;
    clearInterval(T.stIv);
    T.stIv = setInterval(function () {
      var b = DP.UI.battle;
      if (!b || !b.running || b.paused) { T.st.push({ s: '-', T: 0, t: performance.now() }); return; }
      if (b.__id === undefined) b.__id = ++T.seenBattles;
      T.st.push({ s: b.player.state, T: b.player.stateT | 0, t: performance.now(),
                  w: b.W.id, d: b.player.down ? 1 : 0, m: b.mode, b: b.__id,
                  x: Math.round(b.player.x), y: Math.round(b.player.y),
                  pa: b.puni.active ? 1 : 0, ph: b.puni.holding ? 1 : 0 });
    }, 100);
  };
  T.stStop = function () { clearInterval(T.stIv); T.stIv = null; return T.st.slice(); };

  // Giữ trận sống để đo đủ lâu (không thì boss SS lv48 hạ người chơi trong 10s
  // và trận kết thúc giữa lúc đang đo).
  T.keepOn = function (freezeField) {
    clearInterval(T.keep);
    T.keep = setInterval(function () {
      var b = DP.UI.battle; if (!b || !b.running) return;
      b.player.hp = b.player.maxHp; b.player.down = false; b.player.downT = 0;
      b.timeLeft = 300000;
      if (b.boss) b.boss.hp = b.boss.maxHp;
      if (freezeField) { b.portalOpen = false; b.needKills = 9999; b.suddenDone = true; }
    }, 400);
  };
  T.keepOff = function () { clearInterval(T.keep); T.keep = null; };

  // Chó canh trận: khi không còn trận nào chạy (thắng, thua, hết giờ, wipe) thì
  // sau ~3s tự mở trận mới, xen kẽ field và boss. Nhờ vậy đoạn săn kẹt luôn ở
  // TRONG trận thay vì phụ thuộc bot bấm menu — và đi qua nhiều trận, đúng yêu cầu.
  T.autoIv = null; T.battles = 0;
  T.autoOn = function () {
    clearInterval(T.autoIv);
    var idle = 0;
    var BOSS = ['grouton', 'frogrid', 'mumu', 'dodonki', 'galidon', 'vaccahorn'];
    T.autoIv = setInterval(function () {
      var b = DP.UI.battle;
      if (b && b.running) { idle = 0; return; }
      if (++idle < 6) return;
      idle = 0; T.battles++;
      if (T.battles % 2) DP.UI.startBoss(BOSS[T.battles % BOSS.length], 5 + (T.battles % 4) * 4, false);
      else DP.UI.startField('tior', T.battles % 7);
    }, 500);
  };
  T.autoOff = function () { clearInterval(T.autoIv); T.autoIv = null; return T.battles; };

  // Lấy mẫu độ dài các mảng — để bắt rò rỉ.
  T.arrays = function () {
    var b = DP.UI.battle; if (!b) return null;
    return {
      fx: b.fx.length, msgs: b.msgs.length, projs: b.projs.length,
      tel: b.telegraphs.length, mobs: b.mobs.length,
      mobsDead: b.mobs.filter(function (m) { return m.dead; }).length,
      chests: b.chests.length,
      heap: (performance.memory && performance.memory.usedJSHeapSize) || 0
    };
  };

  // Đo độ trễ chạm: bấm giờ NGAY TRƯỚC pointerdown, dừng khi state = 'attack'.
  // Đo trong trang để không lẫn độ trễ đi-về của CDP.
  T.tapLatency = function (n) {
    return new Promise(function (done) {
      var out = [], i = 0, id = 9000;
      function one() {
        var b = DP.UI.battle;
        b.player.state = 'idle'; b.player.down = false; b.player.combo = 0;
        b.player.counterUntil = 0; b.player.queued = false;
        var t0 = performance.now();
        T.pe('pointerdown', 270, 640, ++id);
        setTimeout(function () { T.pe('pointerup', 270, 640, id); }, 60);
        (function poll() {
          if (DP.UI.battle.player.state === 'attack') {
            out.push(performance.now() - t0);
            if (++i >= n) return done(out);
            setTimeout(one, 420);   // chờ hết đòn rồi bấm tiếp
            return;
          }
          if (performance.now() - t0 > 900) { out.push(-1); if (++i >= n) return done(out); setTimeout(one, 420); return; }
          requestAnimationFrame(poll);
        })();
      }
      one();
    });
  };
};

/* ---------------------------------------------------------------- TIỆN ÍCH NODE */
function stats(fr) {
  if (!fr.length) return null;
  const s = fr.slice().sort((a, b) => a - b);
  const sum = fr.reduce((a, b) => a + b, 0);
  const avg = sum / fr.length;
  const p99 = s[Math.min(s.length - 1, Math.floor(s.length * 0.99))];
  const worst1 = s.slice(Math.floor(s.length * 0.99));
  const worstAvg = worst1.reduce((a, b) => a + b, 0) / Math.max(1, worst1.length);
  return {
    n: fr.length, avgFps: 1000 / avg, p99ms: p99, low1Fps: 1000 / worstAvg,
    jank50: fr.filter(x => x > 50).length, jank100: fr.filter(x => x > 100).length,
    max: s[s.length - 1]
  };
}
function fmtFps(k) {
  return 'TB ' + k.avgFps.toFixed(1) + 'fps, 1% thấp ' + k.low1Fps.toFixed(1) + 'fps, ' +
    k.jank50 + '/' + k.n + ' khung >50ms (max ' + k.max.toFixed(0) + 'ms)';
}
// Gộp mẫu thành các đoạn liên tục cùng trạng thái. Cắt đoạn khi stateT tụt
// (= một hành động mới bắt đầu) để không nhầm "đánh liên tiếp" thành "kẹt".
function runs(samples) {
  const out = [];
  let cur = null;
  for (const s of samples) {
    if (!cur || cur.s !== s.s || s.T < cur.lastT) {
      if (cur) out.push(cur);
      cur = { s: s.s, t0: s.t, t1: s.t, lastT: s.T, w: s.w, m: s.m, d: s.d };
    } else { cur.t1 = s.t; cur.lastT = s.T; }
  }
  if (cur) out.push(cur);
  return out.map(r => ({ ...r, ms: r.t1 - r.t0 }));
}

const VALID = ['idle', 'attack', 'dodge', 'guard', 'charge', 'aim', 'cleave',
               'lunge', 'ranbu', 'lag', 'hurt', 'cast', 'switch'];

const WCLS = ['sword', 'great', 'spear', 'dual', 'bow'];
// Trạng thái ĐẶC THÙ hợp lệ mà mỗi lớp vũ khí phải vào khi GIỮ giữa màn hình.
const SPECIAL_OK = {
  sword: ['guard'],
  great: ['charge'],
  spear: ['aim'],
  dual:  ['charge', 'ranbu', 'lag', 'idle'],   // Song Kiếm tự phát loạn vũ / bật Overdrive
  bow:   ['aim']
};
const SPECIAL_ANY = ['guard', 'charge', 'aim', 'cleave', 'lunge', 'ranbu'];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 860 }, isMobile: true,
    hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(URL);
  await p.waitForTimeout(900);
  await p.evaluate(INSTALL);

  /* ================================================================ 1. FPS ==
   * Đo khung hình thật trong hai cảnh nặng nhất: boss SS cấp cao (nhiều đạn,
   * nhiều vùng báo đỏ) và map field đông quái. Đây là hai cảnh mà máy yếu sẽ tụt.
   */
  results.push('\n── 1. ĐỘ MƯỢT (FPS thật, đo bằng khoảng cách giữa các khung hình) ──');

  // --- boss SS lv48
  await p.evaluate(() => { DP.UI.startBoss('felnarog', 48, false); });
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__T.keepOn(false); DPBot.on(150); window.__T.frStart(); });
  await p.waitForTimeout(T_FPS);
  const dBoss = await p.evaluate(() => { const f = window.__T.frStop(); DPBot.off(); window.__T.keepOff(); return f; });
  const kBoss = stats(dBoss.fr);
  if (!kBoss) info('KHÔNG thu được khung hình nào: ' + JSON.stringify(dBoss));
  check('boss SS lv48 (' + (T_FPS/1000) + 's, bot đánh): trung bình >= 50fps',
    !!kBoss && kBoss.avgFps >= 50, kBoss ? fmtFps(kBoss) : 'không đo được khung hình nào');
  check('boss SS lv48: khung giật (>50ms) dưới 2% số khung',
    !!kBoss && kBoss.jank50 / kBoss.n < 0.02, kBoss ? kBoss.jank50 + '/' + kBoss.n +
    ' = ' + (100 * kBoss.jank50 / kBoss.n).toFixed(2) + '%' : 'không đo được');

  // --- field đông quái (map cuối vùng cấp cao)
  await p.evaluate(() => { DP.UI.startField('rakshard', 6); });
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__T.keepOn(true); DPBot.on(150); window.__T.frStart(); });
  await p.waitForTimeout(T_FPS);
  const dField = await p.evaluate(() => { const f = window.__T.frStop(); DPBot.off(); window.__T.keepOff(); return f; });
  const kField = stats(dField.fr);
  if (!kField) info('KHÔNG thu được khung hình nào: ' + JSON.stringify(dField));
  check('field đông quái (' + (T_FPS/1000) + 's, bot đánh): trung bình >= 50fps',
    !!kField && kField.avgFps >= 50, kField ? fmtFps(kField) : 'không đo được khung hình nào');
  check('field: khung giật (>50ms) dưới 2% số khung',
    !!kField && kField.jank50 / kField.n < 0.02, kField ? kField.jank50 + '/' + kField.n +
    ' = ' + (100 * kField.jank50 / kField.n).toFixed(2) + '%' : 'không đo được');

  /* ============================================== 2. RÒ RỈ / MẢNG PHÌNH ==
   * Trong js/game.js, mảng mobs được lọc bằng `!m.dead || m.hp > 0` và có một
   * setTimeout 2.2s sinh thêm quái sau mỗi con chết. Nếu điều kiện lọc hụt hoặc
   * setTimeout sinh quá tay thì mobs phình dần và FPS tụt sau vài phút chơi.
   * fx/msgs/projs/telegraphs cũng phải quay về mức thấp khi ngừng đánh.
   */
  results.push('\n── 2. RÒ RỈ BỘ NHỚ / MẢNG PHÌNH (field, 60s bot đánh, lấy mẫu mỗi 5s) ──');
  await p.evaluate(() => { DP.UI.startField('rakshard', 6); });
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__T.keepOn(true); DPBot.on(150); });
  const samples = [];
  for (let i = 0; i < T_LEAKN; i++) {
    samples.push(await p.evaluate(() => window.__T.arrays()));
    await p.waitForTimeout(5000);
  }
  await p.evaluate(() => { DPBot.off(); window.__T.keepOff(); });

  const KEYS = ['fx', 'msgs', 'projs', 'tel', 'mobs', 'chests'];
  const growth = {};
  for (const k of KEYS) {
    const v = samples.map(s => s[k]);
    // "tăng đơn điệu" = không lần nào giảm VÀ cuối > đầu đáng kể.
    let mono = true;
    for (let i = 1; i < v.length; i++) if (v[i] < v[i - 1]) { mono = false; break; }
    growth[k] = { v, mono, first: v[0], last: v[v.length - 1], max: Math.max(...v) };
    info(k + ': ' + v.join(' → '));
  }
  const leaky = KEYS.filter(k => growth[k].mono && growth[k].last > growth[k].first + 3);
  check('không mảng nào tăng đơn điệu suốt 60s', leaky.length === 0,
    leaky.length ? 'nghi rò rỉ: ' + leaky.join(', ') : 'tất cả đều lên xuống bình thường');
  check('mảng mobs không phình quá 20 con', growth.mobs.max <= 20,
    'đỉnh ' + growth.mobs.max + ' con');
  const deadLeft = samples.map(s => s.mobsDead);
  check('quái chết được dọn khỏi mảng mobs ngay (không tồn dư)',
    Math.max(...deadLeft) === 0, 'tồn dư tối đa ' + Math.max(...deadLeft) + ' xác');
  check('fx không phình (đỉnh < 400)', growth.fx.max < 400, 'đỉnh ' + growth.fx.max);
  check('msgs không phình (đỉnh < 200)', growth.msgs.max < 200, 'đỉnh ' + growth.msgs.max);
  check('chests không phình (đỉnh < 60)', growth.chests.max < 60, 'đỉnh ' + growth.chests.max);
  if (samples[0].heap) {
    const h0 = samples[0].heap / 1048576, h1 = samples[samples.length - 1].heap / 1048576;
    info('heap JS: ' + h0.toFixed(1) + 'MB → ' + h1.toFixed(1) + 'MB');
    check('heap JS không tăng quá gấp đôi sau 60s', h1 < h0 * 2.2 || h1 < 60,
      h0.toFixed(1) + 'MB → ' + h1.toFixed(1) + 'MB');
  } else {
    info('performance.memory không có trong build này — bỏ qua đo heap');
  }

  /* =========================================== 3. SĂN KẸT TRẠNG THÁI ==
   * Bot chơi liên tục 150 giây, đi qua nhiều trận (thắng/thua/kết quả/vào lại).
   * Lấy mẫu player.state mỗi 100ms rồi gộp thành đoạn. Một trạng thái hành động
   * kéo dài quá 3 giây liên tục mà stateT không reset = KẸT.
   */
  results.push('\n── 3. KẸT TRẠNG THÁI (bot chơi 150s qua nhiều trận, lấy mẫu 100ms) ──');
  await p.evaluate(() => { DP.UI.startField('tior', 0); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__T.stStart(); window.__T.autoOn(); DPBot.on(160); });
  await p.waitForTimeout(T_STUCK);
  const st = await p.evaluate(() => { DPBot.off(); return window.__T.stStop(); });
  const nBattles = await p.evaluate(() => window.__T.autoOff());

  const rs = runs(st.filter(s => s.s !== '-'));
  const unknown = [...new Set(st.map(s => s.s))].filter(s => s !== '-' && VALID.indexOf(s) < 0);
  check('player.state không bao giờ nhận giá trị lạ', unknown.length === 0,
    unknown.length ? unknown.join(', ') : [...new Set(st.map(s => s.s))].filter(s => s !== '-').join(','));

  // Bảng thời gian giữ dài nhất theo từng trạng thái, để nhìn ra ngay cái nào bất thường.
  const worst = {};
  for (const r of rs) {
    if (!worst[r.s] || r.ms > worst[r.s].ms) worst[r.s] = r;
  }
  Object.keys(worst).sort((a, c) => worst[c].ms - worst[a].ms).forEach(k => {
    info('giữ lâu nhất ở "' + k + '": ' + Math.round(worst[k].ms) + 'ms (vũ khí ' + worst[k].w +
         ', chế độ ' + worst[k].m + ')');
  });
  // 'idle' được phép lâu (đang chạy/đang chờ). Mọi trạng thái hành động thì không.
  const ACTION = VALID.filter(s => s !== 'idle');
  const stuck = ACTION.filter(s => worst[s] && worst[s].ms > 3000);
  check('không trạng thái hành động nào bị giữ quá 3 giây',
    stuck.length === 0,
    stuck.length ? stuck.map(s => s + '=' + Math.round(worst[s].ms) + 'ms').join(', ') : 'cao nhất ' +
      Math.round(Math.max(0, ...ACTION.map(s => (worst[s] ? worst[s].ms : 0)))) + 'ms');
  // 'idle' được phép kéo dài (đang chạy, đang chờ hồi chiêu). Nhưng 'idle' mà
  // đứng CHÔN CHÂN trong lúc ngón vẫn đặt trên màn hình thì là khoảng chết input
  // — chính là kiểu kẹt mà mục (f) dựng lại được. Ở đây soi xem bot có gặp không.
  let frozen = 0, frozenMax = 0, cur = 0, px = 0, py = 0;
  for (const s of st) {
    if (s.s === 'idle' && s.pa && !s.d && Math.hypot(s.x - px, s.y - py) < 2) {
      cur += 100; if (cur > frozenMax) frozenMax = cur;
      if (cur >= 1000) frozen++;
    } else cur = 0;
    px = s.x; py = s.y;
  }
  info('đứng chôn chân trong lúc ngón vẫn chạm: dài nhất ' + frozenMax + 'ms');
  check('không có khoảng "idle + ngón đang chạm + không nhúc nhích" quá 1.5 giây',
    frozenMax < 1500, 'dài nhất ' + frozenMax + 'ms');

  const total = st.filter(s => s.s !== '-').length;
  const seenB = new Set(st.filter(x => x.b).map(x => x.b)).size;
  const modes = new Set(st.filter(x => x.m).map(x => x.m));
  info('đã đi qua ' + seenB + ' trận (' + [...modes].join('+') + '), watchdog phải cứu ' + nBattles + ' lần, ' +
       total + '/' + st.length + ' mẫu nằm trong trận');
  // Đòi >=3 trận để chắc chắn có đi qua chuỗi kết-thúc-trận / vào-trận-mới —
  // đó mới là chỗ dễ để sót trạng thái treo từ trận trước.
  check('đoạn săn kẹt đi qua ít nhất 3 trận', seenB >= 3,
    seenB + ' trận, chế độ: ' + [...modes].join('+'));
  // Vòng tự chơi phải tự đi tiếp được sau khi hết trận. Nếu "chó canh trận" của
  // bộ test phải ra tay thì nghĩa là DPBot kẹt ở ngoài trận — xem js/bot.js, nhánh
  // `if (rb) { rb.click(); return; }`: #rBack vẫn còn trong DOM sau khi bảng kết
  // quả đã tắt, nên bot bấm mãi nút đó và không bao giờ đi tới màn Quest.
  check('vòng tự chơi tự đi tiếp được sau mỗi trận (không cần watchdog cứu)',
    nBattles === 0, 'watchdog phải mở hộ ' + nBattles + ' trận trong ' + (T_STUCK / 1000) + 's');
  check('phần lớn thời gian ở TRONG trận (mẫu đo mới có giá trị)',
    total > st.length * 0.7, Math.round(100 * total / st.length) + '% thời gian trong trận');
  const idlePct = 100 * st.filter(s => s.s === 'idle').length / Math.max(1, total);
  info('tỉ lệ thời gian ở idle: ' + idlePct.toFixed(1) + '% (' + total + ' mẫu trong trận)');
  check('bot có thật sự hành động (không đứng idle >95% thời gian)', idlePct < 95,
    idlePct.toFixed(1) + '% idle');

  /* ================================== 3b. ÉP CÁC TÌNH HUỐNG HIẾM ==
   * Năm tình huống mà người chơi thật gặp nhưng bot hiếm khi gặp đúng khung.
   * Sau mỗi tình huống: chờ 2 giây, trạng thái phải hợp lệ (và không phải một
   * đòn đặc thù còn treo), Punicon phải nhả sạch, và game phải còn nhận input.
   */
  results.push('\n── 3b. ÉP TÌNH HUỐNG DỄ KẸT ──');

  // Đưa về sân sạch, không ai đánh mình, để kết quả không bị nhiễu bởi 'hurt'.
  async function freshField(cls) {
    await p.evaluate(() => { DP.UI.startField('tior', 0); });
    await p.waitForTimeout(500);
    await p.evaluate(c => { window.__T.clean(); window.__T.equip(c); }, cls);
    await p.waitForTimeout(120);
  }
  // Sau tình huống: state hợp lệ + không treo đặc thù + Punicon sạch + nhận input.
  async function assertRecovered(label) {
    await p.waitForTimeout(2000);
    const s = await p.evaluate(() => window.__T.state());
    const okState = s && VALID.indexOf(s.s) >= 0 && SPECIAL_ANY.indexOf(s.s) < 0;
    check(label + ': trạng thái trở về hợp lệ sau 2s', okState, 'state=' + (s ? s.s : 'null'));
    check(label + ': Punicon nhả sạch (active=false, holding=false)',
      s && s.act === false && s.hold === false,
      'active=' + (s && s.act) + ' holding=' + (s && s.hold));
    // Còn nhận input không? Chạm một cái, phải ra đòn.
    await p.evaluate(() => { const b = DP.UI.battle; b.player.state = 'idle'; b.player.down = false; DPBot._tap(270, 640); });
    await p.waitForTimeout(160);
    const after = await p.evaluate(() => DP.UI.battle.player.state);
    check(label + ': game vẫn nhận input (chạm ra đòn)', after === 'attack', 'state=' + after);
    await p.waitForTimeout(400);
  }

  // (a) Đổi vũ khí ĐANG khi đang charge / aim / ranbu.
  for (const [cls, want] of [['great', 'charge'], ['bow', 'aim'], ['dual', 'ranbu']]) {
    await freshField(cls);
    const got = await p.evaluate(([c, w]) => {
      const b = DP.UI.battle, pl = b.player;
      pl.state = 'idle';
      if (w === 'ranbu') b.startRanbu(); else b.holdStart(40, 0);   // vào đúng trạng thái cần
      const before = pl.state;
      b.setWeapon(1);                                              // đổi vũ khí giữa chừng (có độ trễ)
      return { before: before, after: pl.state };
    }, [cls, want]);
    info('(a) ' + cls + ': ' + got.before + ' → đổi vũ khí → ' + got.after);
    await assertRecovered('(a) đổi vũ khí khi đang ' + want + ' (' + cls + ')');
  }

  // (b) Né ngay lúc đang cleave. Theo thiết kế, cleave/ranbu KHÔNG hủy được —
  // kiểm rằng nó vẫn tự kết thúc chứ không đứng im mãi.
  await freshField('great');
  const cleaveRes = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    pl.state = 'idle'; b.holdStart(40, 0); b.holdEnd(40, 0, 900);   // -> cleave
    const inCleave = pl.state;
    pl.dodgeCd = 0; b.tryDodge(1, 0);                               // né ngay giữa cú chém
    return { inCleave, afterDodge: pl.state };
  });
  info('(b) cleave → né: ' + cleaveRes.inCleave + ' → ' + cleaveRes.afterDodge);
  check('(b) né khi đang cleave KHÔNG hủy cú chém (đúng thiết kế)',
    cleaveRes.inCleave === 'cleave' && cleaveRes.afterDodge === 'cleave');
  await assertRecovered('(b) né giữa cú cleave');

  // (c) Xả Magi khi đang guard.
  await freshField('sword');
  const starter = await p.evaluate(() => window.__T.restore());   // bộ khởi đầu có Magi sẵn
  info('(c) vũ khí khởi đầu: đặc thù=' + starter.special + ', số Magi gắn=' + starter.magi);
  const magiRes = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    // Bảo đảm có ít nhất một Magi để xả.
    if (!(b.wp && b.wp.magi[0])) return { skip: true };
    pl.state = 'idle'; pl.magi = 100;
    b.holdStart(0, 0);                       // -> guard
    const inGuard = pl.state;
    b.castMagi(0);                           // xả Magi ngay trong thế thủ
    return { inGuard, afterCast: pl.state, magi: pl.magi };
  });
  if (magiRes.skip) { info('(c) không có Magi gắn sẵn — bỏ qua'); }
  else {
    info('(c) guard → xả Magi: ' + magiRes.inGuard + ' → ' + magiRes.afterCast);
    check('(c) xả Magi khi đang guard vào được trạng thái cast',
      magiRes.inGuard === 'guard' && magiRes.afterCast === 'cast', JSON.stringify(magiRes));
    await assertRecovered('(c) xả Magi giữa thế thủ');
  }

  // (d) Người chơi ngã ĐANG khi đang ranbu / charge.
  for (const [cls, how] of [['dual', 'ranbu'], ['great', 'charge']]) {
    await freshField(cls);
    const dres = await p.evaluate(([c, h]) => {
      const b = DP.UI.battle, pl = b.player;
      pl.state = 'idle';
      if (h === 'ranbu') b.startRanbu(); else b.holdStart(40, 0);
      const before = pl.state;
      pl.hp = 0;                                  // để chính game xử lý cái chết ở khung sau
      return { before };
    }, [cls, how]);
    await p.waitForTimeout(2000);
    const d2 = await p.evaluate(() => {
      const b = DP.UI.battle;
      return { s: b.player.state, down: b.player.down, hold: b.puni.holding, act: b.puni.active };
    });
    info('(d) ' + cls + ': ' + dres.before + ' → hp=0 → state=' + d2.s + ', down=' + d2.down);
    check('(d) ngã khi đang ' + how + ': state hợp lệ, không treo đặc thù',
      VALID.indexOf(d2.s) >= 0 && SPECIAL_ANY.indexOf(d2.s) < 0, 'state=' + d2.s);
    check('(d) ngã khi đang ' + how + ': Punicon nhả sạch',
      d2.act === false && d2.hold === false);
    // Đứng dậy rồi phải chơi lại được ngay.
    await p.evaluate(() => { DP.UI.battle.revivePlayer(1); });
    await p.waitForTimeout(150);
    await p.evaluate(() => { DP.UI.battle.player.state = 'idle'; DPBot._tap(270, 640); });
    await p.waitForTimeout(160);
    check('(d) đứng dậy sau khi ngã giữa ' + how + ' thì chơi lại được',
      await p.evaluate(() => DP.UI.battle.player.state === 'attack'));
  }

  // (e) Boss chết ĐANG khi người chơi đang aim.
  await p.evaluate(() => { DP.UI.startBoss('grouton', 8, false); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__T.clean(); window.__T.equip('bow'); });
  const eres = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    pl.state = 'idle'; b.holdStart(40, 0);                    // -> aim (snipe)
    const before = pl.state;
    b.boss.hp = 1;
    b.dealToBoss({ phys: 99999, elem: 0, el: 'none' }, b.boss.x, b.boss.y, {});
    return { before };
  });
  await p.waitForTimeout(2600);
  const eAfter = await p.evaluate(() => ({ s: DP.UI.battle ? DP.UI.battle.player.state : null,
                                           run: DP.UI.battle ? DP.UI.battle.running : null }));
  info('(e) boss chết khi đang ' + eres.before + ': state=' + eAfter.s + ', trận còn chạy=' + eAfter.run);
  check('(e) boss chết giữa lúc aim thì trận kết thúc gọn', eAfter.run === false, 'running=' + eAfter.run);
  // Điều thật sự quan trọng: trận SAU phải sạch, không thừa kế trạng thái treo.
  await p.evaluate(() => { DP.UI.startBoss('grouton', 8, false); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { window.__T.clean(); });
  const eNew = await p.evaluate(() => window.__T.state());
  check('(e) trận mới bắt đầu ở trạng thái sạch', eNew.s === 'idle' && eNew.hold === false && eNew.act === false,
    JSON.stringify(eNew));
  await p.evaluate(() => { DPBot._tap(270, 640); });
  await p.waitForTimeout(160);
  check('(e) trận mới vẫn nhận input', await p.evaluate(() => DP.UI.battle.player.state === 'attack'));

  // (f) GIỮ TAY TRONG LÚC CÒN CỨNG ĐÒN. Đây là tình huống người chơi gặp liên tục:
  // vừa vung xong (state 'lag'/'attack') thì đặt ngón xuống định nạp đòn đặc thù.
  // Punicon.tick() bật holding=true và gọi onHoldStart, nhưng Battle.holdStart
  // (js/game.js) từ chối vì busy(). Punicon KHÔNG biết mình bị từ chối nên vẫn ở
  // holding: onMove trả về sớm, moveVec đứng ở 0 => nhân vật vừa KHÔNG ra đòn đặc
  // thù vừa KHÔNG đi được, cho tới khi nhấc tay. Đó là một khoảng chết input.
  await freshField('sword');
  const busyHold = await p.evaluate(() => new Promise(res => {
    const T = window.__T, b = DP.UI.battle, pl = b.player;
    pl.state = 'lag'; pl.stateT = 0; pl.stateDur = 350;    // còn cứng đòn
    const id = 5100;
    T.pe('pointerdown', 270, 640, id);                      // đặt ngón GIỮA, không nhúc nhích
    setTimeout(() => {
      const afterHold = { s: pl.state, holding: b.puni.holding };
      const x0 = pl.x, y0 = pl.y;
      let k = 0;
      const iv = setInterval(() => {                        // giờ mới kéo để chạy
        k++; T.pe('pointermove', 270 + 55, 640 + (k % 3), id);
        if (k >= 25) {
          clearInterval(iv);
          const moved = Math.hypot(pl.x - x0, pl.y - y0);
          const st2 = pl.state, h2 = b.puni.holding;
          T.pe('pointerup', 270 + 55, 640, id);
          setTimeout(() => res({ afterHold, moved: moved, s2: st2, h2: h2, s3: pl.state }), 220);
        }
      }, 60);
    }, 700);
  }));
  info('(f) giữ khi đang cứng đòn: sau 700ms state=' + busyHold.afterHold.s +
       ', puni.holding=' + busyHold.afterHold.holding +
       '; kéo 1.5s đi được ' + Math.round(busyHold.moved) + 'px (state=' + busyHold.s2 + ')');
  check('(f) giữ tay khi đang cứng đòn KHÔNG được khoá cần gạt lại',
    busyHold.h2 === false || busyHold.moved > 30,
    'holding=' + busyHold.h2 + ', đi được ' + Math.round(busyHold.moved) + 'px trong 1.5s kéo');
  check('(f) nhấc tay ra thì hồi phục về idle', busyHold.s3 === 'idle', 'state=' + busyHold.s3);

  /* ================================= 4. LUẬT PUNICON (phần quan trọng nhất) ==
   * Luật (xem đầu js/punicon.js): cách chạy của Punicon là kéo cần gạt ra rồi
   * GIỮ NGUYÊN ngón ở đó. Nếu HOLD chỉ đo "ngón có nhúc nhích không" thì mọi lần
   * chạy dài đều tự biến thành đòn đặc thù — đúng cái lỗi vừa được sửa.
   * Điều kiện đúng phải là VỊ TRÍ cần gạt: chỉ khi nằm trong holdZone (nhân vật
   * đứng yên) mới được tính giữ.
   *
   * Mô phỏng phải THẬT: pointerdown, một pointermove ra 60px, rồi KHÔNG bắn thêm
   * sự kiện nào trong 3 giây — đúng như ngón tay đặt yên. DPBot._drag không dùng
   * được vì nó bắn move liên tục.
   */
  results.push('\n── 4. LUẬT PUNICON: chạy dài KHÔNG được tự thành đòn đặc thù ──');

  for (const cls of WCLS) {
    await freshField(cls);
    const special = await p.evaluate(c => window.__T.equip(c), cls);

    // (4.1) kéo ra 60px rồi GIỮ NGUYÊN 3 giây -> phải luôn 'idle', không bao giờ đặc thù.
    const held = await p.evaluate(() => new Promise(res => {
      const T = window.__T, b = DP.UI.battle;
      b.player.state = 'idle';
      const id = 4100 + Math.floor(Math.random() * 100);
      T.pe('pointerdown', 270, 640, id);
      T.pe('pointermove', 270 + 60, 640, id);      // ra ngoài holdZone (=20)
      const seen = {}, t0 = performance.now();
      let holdingSeen = false, centeredSeen = false;
      const iv = setInterval(() => {
        const pl = DP.UI.battle.player;
        seen[pl.state] = (seen[pl.state] || 0) + 1;
        if (DP.UI.battle.puni.holding) holdingSeen = true;
        if (DP.UI.battle.puni.centeredT !== null) centeredSeen = true;
        if (performance.now() - t0 >= 3000) {
          clearInterval(iv);
          T.pe('pointerup', 270 + 60, 640, id);
          res({ seen, holdingSeen, centeredSeen, after: DP.UI.battle.player.state });
        }
      }, 50);
    }));
    const bad = Object.keys(held.seen).filter(s => SPECIAL_ANY.indexOf(s) >= 0);
    check('[' + cls + '] kéo ra rồi GIỮ NGUYÊN 3s: KHÔNG tự thành đòn đặc thù',
      bad.length === 0 && held.holdingSeen === false,
      bad.length ? 'lọt vào: ' + bad.join(',') : 'chỉ thấy: ' + Object.keys(held.seen).join(','));
    check('[' + cls + '] trong lúc chạy, đồng hồ giữ bị hủy (centeredT = null)',
      held.centeredSeen === false);

    await p.waitForTimeout(300);
    await p.evaluate(() => { window.__T.clean(); });

    // (4.2) chạm giữa, KHÔNG di chuyển, 400ms -> phải vào đúng đặc thù của vũ khí.
    const still = await p.evaluate(() => new Promise(res => {
      const T = window.__T;
      DP.UI.battle.player.state = 'idle';
      const id = 4200 + Math.floor(Math.random() * 100);
      T.pe('pointerdown', 270, 640, id);
      setTimeout(() => {
        const s = DP.UI.battle.player.state, h = DP.UI.battle.puni.holding;
        T.pe('pointerup', 270, 640, id);
        res({ s, h });
      }, 400);
    }));
    check('[' + cls + '] chạm giữa & không nhúc nhích 400ms → vào đòn đặc thù (' + special + ')',
      still.h === true && SPECIAL_OK[cls].indexOf(still.s) >= 0, 'state=' + still.s + ', holding=' + still.h);

    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__T.clean(); });

    // (4.3) kéo ra 60px rồi kéo VỀ giữa, giữ 400ms -> lại được phép ra đòn đặc thù.
    const back = await p.evaluate(() => new Promise(res => {
      const T = window.__T;
      DP.UI.battle.player.state = 'idle';
      const id = 4300 + Math.floor(Math.random() * 100);
      T.pe('pointerdown', 270, 640, id);
      T.pe('pointermove', 270 + 60, 640, id);
      setTimeout(() => {
        T.pe('pointermove', 270, 640, id);      // thả cần gạt về giữa
        setTimeout(() => {
          const s = DP.UI.battle.player.state, h = DP.UI.battle.puni.holding;
          T.pe('pointerup', 270, 640, id);
          res({ s, h });
        }, 400);
      }, 600);
    }));
    check('[' + cls + '] kéo ra rồi thả cần gạt VỀ GIỮA, giữ 400ms → ra được đòn đặc thù',
      back.h === true && SPECIAL_OK[cls].indexOf(back.s) >= 0, 'state=' + back.s + ', holding=' + back.h);
    await p.waitForTimeout(300);
  }

  // Kiểm bổ sung: chạy ĐỔI HƯỚNG liên tục rất lâu (như người chơi thật đảo ngón)
  // cũng không được thành đòn đặc thù, và nhân vật phải thật sự di chuyển.
  await freshField('sword');
  const longRun = await p.evaluate(() => new Promise(res => {
    const T = window.__T, b = DP.UI.battle;
    b.player.state = 'idle';
    let px = b.player.x, py = b.player.y, path = 0;
    const id = 4400;
    T.pe('pointerdown', 270, 640, id);
    let k = 0, bad = null, holdSeen = false;
    const iv = setInterval(() => {
      k++;
      const a = k * 0.35;
      T.pe('pointermove', 270 + Math.cos(a) * 60, 640 + Math.sin(a) * 60, id);
      const pl = DP.UI.battle.player;
      // Đo QUÃNG ĐƯỜNG đi được, không phải khoảng cách tới điểm xuất phát —
      // ngón đảo vòng nên nhân vật chạy vòng và quay về gần chỗ cũ.
      path += Math.hypot(pl.x - px, pl.y - py); px = pl.x; py = pl.y;
      if (pl.state !== 'idle' && !bad) bad = pl.state;
      if (DP.UI.battle.puni.holding) holdSeen = true;
      if (k >= 70) {                     // ~3.5 giây chạy liên tục
        clearInterval(iv);
        T.pe('pointerup', 270, 640, id);
        res({ bad, holdSeen, moved: path });
      }
    }, 50);
  }));
  check('chạy đổi hướng liên tục 3.5s: không tự thành đòn đặc thù',
    longRun.bad === null && longRun.holdSeen === false,
    longRun.bad ? 'lọt vào ' + longRun.bad : (longRun.holdSeen ? 'puni.holding đã bật' : 'luôn idle'));
  check('chạy liên tục thì nhân vật thật sự di chuyển', longRun.moved > 150,
    'quãng đường ' + Math.round(longRun.moved) + 'px trong 3.5s');

  /* ================================================= 5. ĐỘ TRỄ PHẢN HỒI ==
   * Từ lúc ngón chạm xuống tới lúc đòn bắt đầu. Tap của bot là down + up sau
   * 60ms (giống ngón thật), nên 60ms đó nằm trong con số đo được.
   */
  results.push('\n── 5. ĐỘ TRỄ PHẢN HỒI KHI CHẠM (20 lần) ──');
  await freshField('sword');
  const lat = await p.evaluate(() => window.__T.tapLatency(20));
  const okLat = lat.filter(x => x >= 0);
  const latAvg = okLat.reduce((a, c) => a + c, 0) / Math.max(1, okLat.length);
  const latMax = Math.max(...okLat);
  check('20/20 cú chạm đều ra đòn', okLat.length === 20, okLat.length + '/20');
  check('độ trễ trung bình < 120ms', latAvg < 120, latAvg.toFixed(1) + 'ms');
  check('độ trễ lớn nhất < 120ms', latMax < 120, latMax.toFixed(1) + 'ms');
  info('chi tiết (ms): ' + okLat.map(x => x.toFixed(0)).join(' '));
  info('trong đó 60ms là quãng ngón giữ xuống của cú tap — phần game xử lý ≈ ' +
    (latAvg - 60).toFixed(1) + 'ms');

  /* ------------------------------------------------------------- LỖI JS -- */
  results.push('\n── console ──');
  check('không có lỗi JavaScript trong suốt bài đo', errs.length === 0, errs.slice(0, 3).join(' | '));

  await ctx.close(); await b.close();

  console.log(results.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
