/*
 * Ca Trực Đêm: Biệt Đội — vòng đời: khởi động, khung hình, điều khiển, kết ca.
 *
 * Toàn bộ API cho bài kiểm thử nằm ở `window.SQUAD` cuối file — bài test lái game
 * qua chính các hàm người chơi bấm, chứ không gọi tắt vào trong.
 * SEE memory: verify-through-the-gesture-not-around-it.
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;
  const G = SQ.game = {};
  const $ = s => document.querySelector(s);

  let cv, ctx, R = null, raf = 0, last = 0, speed = 1;
  let input = { move: { x: 0, y: 0 }, skill: false };
  const keys = {};
  let botOn = false;
  let paused = false;
  let frames = 0;

  // ---------------------------------------------------------------------------
  function fit() {
    const stage = $('#stage');
    const pad = 0;
    const availW = stage.clientWidth - pad, availH = stage.clientHeight - pad;
    // Khung dọc 9:16 khi chỗ trống cao hơn rộng; xoay máy ngang thì khung cũng nằm
    // ngang 16:9 để chơi được thật, chứ không phải nhìn một dải dọc hẹp giữa màn hình.
    const land = availW > availH;
    document.body.classList.toggle('landscape', land);
    let w, h;
    if (land) {
      // Nằm ngang thì TRÀN HẾT chỗ trống, không ép về 16:9.
      // WHY: ép 16:9 để lại hai vệt đen hai bên, mà chiều cao máy nằm ngang vốn đã
      //   ngắn — mất luôn bề ngang nữa thì ô còn nhỏ hơn cả lúc cầm dọc. Game MOBA
      //   trên điện thoại (Liên Quân) không chừa vệt nào: khung ăn trọn màn hình.
      // Chặn ở 2.8:1 để màn siêu rộng của máy bàn không thành một dải quá dẹt. Điện
      // thoại nằm ngang cao nhất cũng chỉ tới ~2.6 sau khi trừ hai thanh, nên không chạm.
      w = availW; h = availH;
      if (w / h > 2.8) w = h * 2.8;
    } else {
      w = availW; h = w * 16 / 9;
      if (h > availH) { h = availH; w = h * 9 / 16; }
    }
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.__w = w; cv.__h = h;
    const ui = $('#play');
    ui.style.width = w + 'px'; ui.style.height = h + 'px';
  }

  // ---------------------------------------------------------------------------
  function enter(mapId, seed) {
    R = SQ.startRun(mapId, seed);
    G.R = R;
    // WHY: cờ "đã hiện bảng" phải reset ở đây. Nếu không, một ca bỏ dở sẽ khoá luôn
    // bảng kết quả của ca sau, và ca sau thắng cũng không ai cộng thưởng.
    endShown = false;
    if (root.SquadBot) root.SquadBot.reset();
    document.body.classList.add('in-run');
    SQ.ui.buildHud();
    wireHud();
    SQ.ui.closePanel();
    paused = false;
    fit();
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  G.enter = enter;

  function leaveToMenu() {
    document.body.classList.remove('in-run');
    R = null; G.R = null;
    SQ.ui.render();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!R) return;
    frames++;
    if (!paused) {
      const n = Math.min(8, Math.max(1, Math.round(speed)));
      R.autoplay = botOn;
      for (let i = 0; i < n; i++) {
        if (botOn) botDrive(dt);
        SQ.stepRun(R, dt, input);
        if (R.state !== 'play') break;
      }
      input.skill = false;
    }
    SQ.draw(ctx, R, cv.__w, cv.__h);
    SQ.ui.updateHud(R);
    if (R.state === 'floorclear') onFloorClear();
    else if (R.state === 'win') onEnd(true);
    else if (R.state === 'lose') onEnd(false);
  }

  // ---------------------------------------------------------------------------
  let endShown = false;
  function onFloorClear() {
    if (endShown) return;
    endShown = true;
    const last = R.floor >= R.map.floors;
    SQ.ui.panel(
      last ? 'Tầng cuối xong!' : 'Xong tầng ' + R.floor,
      [
        'Đã giao: <b>' + SQ.money(R.W.pad.delivered) + '</b> / ' + SQ.money(R.W.quota),
        'Cả ca tới giờ: <b>' + SQ.money(R.stats.loot) + '</b> · hạ ' + R.stats.kills + ' con quái',
        last ? 'Hết tầng là hết map — nhận thưởng thôi.' : 'Ai gục sẽ được dựng dậy và cả tổ được băng bó một ít.'
      ],
      [[last ? 'Nhận thưởng' : 'Xuống tầng ' + (R.floor + 1), 'big', () => { endShown = false; SQ.nextFloor(R); }]]
    );
  }

  function onEnd(won) {
    if (endShown) return;
    endShown = true;
    const res = {
      mapId: R.mapId, floorsDone: R.stats.floorsDone, won: won,
      lootValue: R.stats.loot, kills: R.stats.kills, skills: R.stats.skills, revives: R.stats.revives
    };
    const reward = SQ.finishRun(res);
    G.lastReward = reward;
    const lines = [
      won ? '<b class="good">PHÁ ĐẢO ' + R.map.name.toUpperCase() + '</b>' : '<b class="bad">Ca hỏng — cả tổ nằm lại</b>',
      'Đã giao: <b>' + SQ.money(res.lootValue) + '</b> · qua ' + res.floorsDone + '/' + R.map.floors + ' tầng · hạ ' + res.kills + ' con',
      'Thưởng: ' + SQ.WALLET_KEYS.filter(k => reward[k]).map(k => SQ.WALLET_ICON[k] + SQ.money(reward[k])).join(' ')
    ];
    if (reward.first) lines.push('<b class="good">Thưởng phá đảo lần đầu đã cộng.</b>');
    SQ.ui.panel(won ? 'Xong ca' : 'Hỏng ca', lines, [
      ['Về sảnh', 'big', () => { endShown = false; leaveToMenu(); }],
      ['Đi lại map này', 'ghost', () => { endShown = false; enter(res.mapId); }]
    ], won ? 'win' : 'lose');
  }

  function quitRun() {
    if (!R) return;
    SQ.ui.panel('Bỏ ca giữa chừng?', [
      'Bạn vẫn nhận vàng theo số đồ đã giao (' + SQ.money(R.stats.loot) + ').',
      'Nhưng không tính là phá đảo map.'
    ], [
      ['Bỏ ca', 'danger', () => { SQ.abandonRun(R); }],
      ['Chơi tiếp', 'ghost', () => {}]
    ]);
  }

  // ---------------------------------------------------------------------------
  // điều khiển
  // ---------------------------------------------------------------------------
  function wireHud() {
    const stick = $('#hStick'), knob = $('#hKnob');
    let sid = null, sx = 0, sy = 0;
    const RAD = 46;
    function down(e) {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      sid = t.identifier != null ? t.identifier : 'm';
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      move(e);
      e.preventDefault();
    }
    function move(e) {
      if (sid === null) return;
      const t = pointOf(e);
      if (!t) return;
      let dx = t.clientX - sx, dy = t.clientY - sy;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / RAD);
      input.move.x = dx / d * k; input.move.y = dy / d * k;
      knob.style.transform = 'translate(' + (dx / d * k * RAD) + 'px,' + (dy / d * k * RAD) + 'px)';
      e.preventDefault();
    }
    function up(e) {
      sid = null; input.move.x = 0; input.move.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
    function pointOf(e) {
      if (!e.changedTouches) return e;
      for (const t of e.changedTouches) if ((t.identifier != null ? t.identifier : 'm') === sid) return t;
      return null;
    }
    stick.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);

    $('#hSkill').addEventListener('pointerdown', e => { e.preventDefault(); input.skill = true; });
    $('#hQuit').addEventListener('click', quitRun);
  }

  function keyVec() {
    let x = 0, y = 0;
    if (keys.a || keys.arrowleft) x -= 1;
    if (keys.d || keys.arrowright) x += 1;
    if (keys.w || keys.arrowup) y -= 1;
    if (keys.s || keys.arrowdown) y += 1;
    return { x: x, y: y };
  }

  // ---------------------------------------------------------------------------
  // Bot tự chơi: lái ĐÚNG người chơi, qua đúng cái input mà ngón tay dùng.
  // ---------------------------------------------------------------------------
  function botDrive(dt) {
    if (!R || R.state !== 'play') return;
    if (root.SquadBot) root.SquadBot.drive(R, input, dt);
  }
  G.setBot = function (on) {
    botOn = !!on;
    const b = $('#botBtn');
    if (b) b.setAttribute('aria-pressed', botOn ? 'true' : 'false');
    if (!botOn) { input.move.x = 0; input.move.y = 0; }
  };
  G.bot = () => botOn;

  // ---------------------------------------------------------------------------
  function boot() {
    cv = $('#view'); ctx = cv.getContext('2d');
    SQ.load();
    SQ.ui.render();
    fit();
    root.addEventListener('resize', fit);

    root.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (!R) return;
      if (k === ' ' || k === 'e') { input.skill = true; e.preventDefault(); }
      if (k === 'p') paused = !paused;
      if (k === 'escape') quitRun();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
    });
    root.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    // bàn phím trộn với cần gạt: cái nào đang được đẩy thì cái đó thắng.
    setInterval(() => {
      if (!R || botOn) return;
      const kv = keyVec();
      if (kv.x || kv.y) { input.move.x = kv.x; input.move.y = kv.y; }
      else if (!$('#hKnob') || $('#hKnob').style.transform === 'translate(0px, 0px)' || !$('#hKnob').style.transform) {
        // cần gạt đang ở giữa và bàn phím không bấm gì -> đứng yên
        if (!lastStickActive()) { input.move.x = 0; input.move.y = 0; }
      }
    }, 30);
    function lastStickActive() {
      const t = $('#hKnob') && $('#hKnob').style.transform;
      return !!(t && t !== 'translate(0px, 0px)' && t !== 'translate(0,0)');
    }

    const bb = $('#botBtn');
    if (bb) bb.addEventListener('click', () => G.setBot(!botOn));
    const sb = $('#spdBtn');
    if (sb) sb.addEventListener('click', () => {
      speed = speed >= 4 ? 1 : speed * 2;
      sb.textContent = 'Tốc độ ×' + speed;
    });

    // đồng bộ tài khoản hub, nếu có — không được chặn gì
    if (SQ.syncFromHub) SQ.syncFromHub().then(r => {
      if (r && r.took === 'cloud') { SQ.ui.render(); SQ.ui.toast('Đã lấy tiến độ từ tài khoản hub.', true); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) SQ.save(true); });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // API cho bài kiểm thử — mọi thứ ở đây đi qua đúng đường người chơi đi.
  // ---------------------------------------------------------------------------
  root.SQUAD = {
    SQ: SQ,
    boot: boot,
    enter: (mapId, seed) => { enter(mapId, seed); return SQ.runState(G.R); },
    state: () => G.R ? SQ.runState(G.R) : null,
    meta: () => ({
      gold: SQ.M.gold, gem: SQ.M.gem, core: SQ.M.core,
      ticketX: SQ.M.ticketX, ticketE: SQ.M.ticketE,
      chars: Object.keys(SQ.M.chars).length, inv: SQ.M.inv.length,
      power: SQ.squadPower(), evol: SQ.evolTotal(),
      maps: Object.keys(SQ.M.maps).map(id => ({ id: id, cleared: SQ.M.maps[id].cleared, floor: SQ.M.maps[id].floor })),
      counters: SQ.M.counters
    }),
    setBot: on => G.setBot(on),
    setSpeed: n => { speed = Math.max(1, Math.min(8, n | 0)); },
    speed: () => speed,
    frames: () => frames,
    ui: SQ.ui,
    screen: () => SQ.ui.current(),
    // Rời màn chơi trước rồi mới mở menu — nếu không, menu vẫn bị lớp trong-trận che
    // và người gọi tưởng là menu hỏng.
    go: n => { if (R && R.state !== 'play') leaveToMenu(); SQ.ui.go(n); },
    toMenu: () => leaveToMenu(),
    nextFloor: () => { if (G.R) SQ.nextFloor(G.R); return G.R ? SQ.runState(G.R) : null; },
    quit: () => { if (G.R) SQ.abandonRun(G.R); },
    skill: () => { input.skill = true; },
    move: (x, y) => { input.move.x = x; input.move.y = y; },
    warp: (x, y) => { if (G.R) { G.R.units[0].x = x; G.R.units[0].y = y; G.R.units[0].path = null; } },
    units: () => G.R ? G.R.units.map(u => ({
      id: u.charId, player: u.player, tactic: u.tactic, hp: Math.round(u.hp), hpMax: Math.round(u.hpMax),
      down: u.down, out: u.out, bag: u.bag.length, held: SQ.bagValue(u),
      mass: Math.round(SQ.bagMass(u)), carry: Math.round(u.stats.carry), skillT: +u.skillT.toFixed(2),
      x: Math.round(u.x), y: Math.round(u.y)
    })) : [],
    foes: () => G.R ? G.R.W.foes.filter(f => !f.dead).map(f => ({
      kind: f.kind, hp: Math.round(f.hp), stun: +f.stun.toFixed(2), freeze: +f.freeze.toFixed(2),
      chasing: !!f.target, x: Math.round(f.x), y: Math.round(f.y)
    })) : [],
    pull: (banner, n, ticket) => SQ.pull(banner, n, ticket),
    grant: r => SQ.grant(r),
    reset: () => SQ.hardReset(),
    save: () => SQ.save(true)
  };
  root.__boot = boot;

})(window);
