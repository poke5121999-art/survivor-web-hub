/*
 * soak.js — chạy nhanh trọn một ván trong trình duyệt, KHÔNG vẽ.
 *
 * Tiêm vào trang qua drive.js. Không kiểm "chơi có vui không" — kiểm ba thứ máy
 * tự bắt được:
 *   1. cả 600 giây không ném lỗi nào;
 *   2. các mốc thật sự xảy ra (lên cấp, swarm, mini-boss, boss, chạy thoát);
 *   3. không chỉ số nào chạy loạn (NaN, quái vô hạn, linh thú lạc mất).
 *
 * NGƯỜI CHƠI GIẢ ở đây cố ý chỉ giỏi VỪA ĐỦ, ba luật:
 *   - quái tới gần thì lùi ra (người thật ai cũng làm)
 *   - không có quái thì đi tới vỉa quặng gần nhất mà đục
 *   - không thấy quặng thì đi lang thang
 * Bot đi giỏi quá thì không bao giờ chạm vào chỗ mà người thật hay chết; bot
 * ngu quá thì mọi phép đo cân bằng đều vô nghĩa vì nó chết vì lý do của riêng nó.
 */
(function () {
  var G = window.DC;
  var g = G.game;

  // Không còn màn chọn thẻ nào để tự bấm: hệ "lên cấp chọn 1 trong 3" đã bỏ,
  // sức mạnh giữa ván nay nằm trong các hốc kín chôn dưới đá và nhận tự động.
  G.Screens.results = function (res, rw) { window.__RESULT = { res: res, rw: rw }; };
  G.Screens.hideAll = function () {};

  // Cũng đọc từ chuỗi truy vấn (?b=lava&lv=4) để chạy được cả loạt đo bằng
  // một dòng lệnh mà không phải sinh ra mỗi ván một tệp kịch bản riêng.
  var Q = new URLSearchParams(location.search);
  var biome = window.__BIOME || Q.get('b') || 'dirt';
  var lvl = window.__LEVEL || parseInt(Q.get('lv'), 10) || 1;

  /* Ải cao thì phải đo NGƯỜI CÓ ĐỒ.
   *
   * Từ khi bản lưu mới vào game với kho rỗng, chạy đo ải 5 bằng người trần là
   * đo một tình huống không ai gặp: muốn mở tới ải 5 thì đã chơi hàng chục ván
   * và quay được cả mớ trang bị. Bản đo trước bỏ qua chuyện này và cho ra 5/6
   * ván thua — con số đúng về mặt máy móc mà vô nghĩa về mặt trò chơi.
   * Bốn lần quay cho mỗi ải là mức đi kèm tự nhiên với vàng/ngọc kiếm được. */
  if (lvl > 1) {
    G.Meta.s.gem += (lvl - 1) * 4 * 160;
    for (var gq = 0; gq < (lvl - 1) * 4; gq++) G.Meta.pull('gear', 1);
  }
  g.startRun(biome, lvl);

  // Chế độ bất tử: dùng để kiểm RIÊNG đoạn cuối (boss, chạy thoát, bảng kết
  // quả) mà không phụ thuộc chuyện cân bằng sát thương. Hai thứ đó hỏng vì hai
  // lý do khác nhau, nên phải đo tách ra.
  if (window.__GOD) {
    g.hurtPlayer = function () { return 0; };
    g.player.hurt = function () { return 0; };
  }

  var T = 16;
  var wanderA = 0, wanderT = 0;

  g.readDir = function () {
    var p = g.player, w = g.world;
    // 0) đang chạy thoát thì chỉ có một việc: về khoang
    if (g.escaping && g.exit) {
      var ex = g.exit.x - p.x, ey = g.exit.y - p.y;
      var em = Math.hypot(ex, ey) || 1;
      return { x: ex / em, y: ey / em };
    }
    // 0b) boss đang lên gân nhảy -> tránh khỏi vòng đích. Người thật nhìn vòng
    //     báo trước là né; bot không biết né thì mọi phép đo về boss đều sai.
    if (g.boss && !g.boss.dead && g.boss.state === 'squash') {
      var bx = p.x - g.boss.markX, by = p.y - g.boss.markY;
      var bm = Math.hypot(bx, by) || 1;
      if (bm < 90) return { x: bx / bm, y: by / bm };
    }
    for (var z = 0; z < g.enemies.length; z++) {
      var ez = g.enemies[z];
      // né luôn con sắp nổ và con đang tích lao
      if (!ez.dead && (ez.state === 'fuse' || ez.state === 'wind')) {
        var fx2 = p.x - ez.x, fy2 = p.y - ez.y;
        var fm = Math.hypot(fx2, fy2) || 1;
        if (fm < 78) return { x: fx2 / fm, y: fy2 / fm };
      }
    }

    // 1) CHỈ lùi khi quái đã chạm người (≤34px). Bản trước lùi từ 70px và hoá
    //    ra đó là một con bot rất tệ: chạy liên tục thì kéo cả bầy linh thú ra
    //    khỏi tầm đánh, không con nào giết được gì, rồi bị dồn vào vách. Người
    //    thật giữ quái ở tầm trung chứ không chạy trốn — và luật "kề bên"
    //    (+25% sát thương lên quái gần chủ) cũng thưởng đúng cách chơi đó.
    // Giữ quái ở khoảng 60px: đủ xa để không bị gõ liên tục, đủ gần để vẫn nằm
    // trong vùng "kề bên" 120px (linh thú +25% sát thương lên quái quanh chủ).
    // Đó chính là chỗ đứng mà game muốn dạy, nên bot cũng phải chơi như vậy —
    // để 34px thì bot chỉ đang đo xem "đứng yên cho quái gõ" sống được bao lâu.
    var near = null, nd = 60;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i];
      if (e.dead || e.harmless) continue;
      var d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nd) { nd = d; near = e; }
    }
    if (near) {
      // lùi CHÉO chứ không lùi thẳng: lùi thẳng hay dí lưng vào vách rồi kẹt
      var a = Math.atan2(p.y - near.y, p.x - near.x) + 0.7;
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    // 1b) đông quái quanh mình thì bấm GỌI
    var cnt = 0;
    for (var j = 0; j < g.enemies.length; j++) {
      if (!g.enemies[j].dead &&
          Math.hypot(g.enemies[j].x - p.x, g.enemies[j].y - p.y) < 140) cnt++;
    }
    if (cnt >= 3 && g.run.rallyCd <= 0) g.rally();
    // 2) HỐC KÍN hiện dấu trên bản đồ nhỏ -> đục thẳng tới. Bot dùng ĐÚNG luật
    //    mà bản đồ nhỏ dùng để hiện dấu (trong 11 ô), nên nó biết đúng ngần ấy
    //    thứ mà người chơi biết, không hơn. Không có bước này thì bot không bao
    //    giờ có lý do đục vào lòng đá, và phép đo sẽ nói là "bỏ thẻ lên cấp làm
    //    game sập" trong khi thật ra chỉ là con bot không biết đường đi.
    var tx = p.tileX(), ty = p.tileY(), best = null, bd = 1e9;
    var cl = w.caches || [], ci;
    for (ci = 0; ci < cl.length; ci++) {
      var cc = cl[ci];
      if (cc.taken) continue;
      if (Math.abs(cc.tx - tx) > 11 || Math.abs(cc.ty - ty) > 11) continue;
      var cd = (cc.tx - tx) * (cc.tx - tx) + (cc.ty - ty) * (cc.ty - ty);
      if (cd < bd) { bd = cd; best = [cc.tx, cc.ty]; }
    }
    if (best) {
      var cx2 = best[0] * T + 8 - p.x, cy2 = best[1] * T + 8 - p.y;
      var cm = Math.hypot(cx2, cy2) || 1;
      return { x: cx2 / cm, y: cy2 / cm };
    }
    bd = 1e9;
    for (var y = ty - 8; y <= ty + 8; y++) {
      for (var x = tx - 8; x <= tx + 8; x++) {
        if (!w.inside(x, y) || w.kind[w.idx(x, y)] !== G.TK.ORE) continue;
        var dd = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (dd < bd) { bd = dd; best = [x, y]; }
      }
    }
    if (best) {
      var gx = best[0] * T + 8 - p.x, gy = best[1] * T + 8 - p.y;
      var m = Math.hypot(gx, gy) || 1;
      return { x: gx / m, y: gy / m };
    }
    // 3) không thấy quặng quanh mình -> ĐI THEO MŨI TÊN NHIỆM VỤ, đúng như
    //    người chơi thật làm. Bot cũ chỉ đi lang thang, nên chỉ tiêu Morkite
    //    xong được đúng một trên sáu ván — con số đó đo con bot chứ không đo
    //    cái game.
    var qt = g.hud.questTarget(g);
    if (qt) {
      var qx = qt.x - p.x, qy = qt.y - p.y;
      var qm = Math.hypot(qx, qy) || 1;
      return { x: qx / qm, y: qy / qm };
    }
    // 4) lang thang
    wanderT -= 1 / 60;
    if (wanderT <= 0) { wanderT = 1.4 + Math.random(); wanderA = Math.random() * 6.283; }
    return { x: Math.cos(wanderA), y: Math.sin(wanderA) };
  };

  var marks = [], lastPhase = '', maxEnemies = 0, nan = 0, lost = 0;
  var maxParts = 0, hpLow = 1e9;
  var DT = 1 / 60;
  var STEPS = 60 * 660;
  var t = 0;
  for (var i = 0; i < STEPS; i++) {
    if (g.state === 'over') break;
    if (g.state === 'levelup') g.state = 'play';
    t += DT;
    try {
      g.update(DT);
    } catch (e) {
      return JSON.stringify({ CRASH: String(e && e.stack || e), giay: +t.toFixed(1) });
    }
    if (g.dir.phase !== lastPhase) {
      lastPhase = g.dir.phase;
      marks.push(t.toFixed(0) + 's→' + lastPhase);
    }
    if (g.enemies.length > maxEnemies) maxEnemies = g.enemies.length;
    if (g.fx.parts.length > maxParts) maxParts = g.fx.parts.length;
    if (g.player.hp < hpLow) hpLow = g.player.hp;
    if (!isFinite(g.player.x) || !isFinite(g.player.hp)) { nan++; break; }
    for (var k = 0; k < g.pets.length; k++) {
      var q = g.pets[k];
      if (Math.hypot(q.x - g.player.x, q.y - g.player.y) > (q.def.leash || 200) * 2.2) lost++;
    }
  }

  var dug = 0;
  for (var o in g.player.carry) dug += g.player.carry[o];

  return JSON.stringify({
    ketThuc: g.state,
    giay: +t.toFixed(1),
    hocDaMo: g.world.caches.filter(function (c) { return c.taken; }).length +
           '/' + g.world.caches.length,
    mauCuoi: Math.round(g.player.hp) + '/' + Math.round(g.run.st.hp),
    mauThapNhat: Math.round(hpLow),
    giet: g.run.kills,
    quangDaoDuoc: dug,
    tuiQuang: g.player.carry,
    nhiemVu: g.mission.type.id + ' ' + g.mission.have + '/' + g.mission.need +
             (g.mission.done ? ' XONG' : ''),
    linhThu: g.pets.map(function (p) { return p.def.id + '.b' + p.tier; }),

    quaiToiDa: maxEnemies,
    hatToiDa: maxParts,
    linhThuLac: lost,
    nan: nan,
    moc: marks,
    ketQua: window.__RESULT ? (window.__RESULT.res.won ? 'THẮNG' : 'THUA') + ' — ' +
            window.__RESULT.res.why : null,
    thuong: window.__RESULT ? window.__RESULT.rw : null
  });
})()
