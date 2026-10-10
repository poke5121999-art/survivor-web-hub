// Khu Thí Luyện đợt 2: Thí Luyện Thuần Túy (đồng hồ, điều kiện, trận Tước Sĩ cuối), lính e_bossrush_minion_*, vé Lông Vũ Valkyrie,
// trùm tầng 4 trong bể trùm. Nạp trước js/lobby.js để bộ nghe runEnd của tệp này chạy trước bộ tính đá quý của sảnh.
// Nguồn: [LOC] bossrush_intro_tips4-7, br_puremode_fail_tips1, item/br_*, ui_game_entry_pureMode_desc; [WIKI] Rush to Purity, Boss Rush, Feather of Valkyrie;
// [CFG] enemies.e_bossrush_minion_a..d (HP 300, tốc 5), skillSummonData (strengthenFactor 0.07). Món không có số gốc ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, D = SK.D;
  const B2 = SK.bossrush2 = {};

  // ---------------------------------------------------------------- hằng số
  // [WIKI Rush to Purity] 12 phút (Thường) / 17 phút (Lợi Hại), chỉ tính lúc ở ngoài phòng khởi đầu. Bản web có 15 ải trước trận cuối
  // (wiki: 13 ải) nên mốc kiểm là lúc vào cổng ải 3-5 [ƯỚC LƯỢNG]; tầng 4 tuỳ chọn (+6 phút) chưa có nên bỏ.
  B2.LIMIT = { normal: 12 * 60, badass: 17 * 60 };
  B2.FEATHER_START = 3;      // [WIKI] 3 lông vũ đầu mua từ Valkyrie trong ván; web không có Valkyrie trong hầm nên tặng một lần [ƯỚC LƯỢNG]
  B2.FEATHER_BOUNTY = 2;     // [WIKI] nhiệm vụ treo thưởng ô dưới-trái thưởng 2 lông vũ; web gắn vào việc "thu thập" của Cảnh Sát [ƯỚC LƯỢNG]
  B2.DAILY = 3;              // [WIKI] 3 lượt mỗi ngày
  B2.F4_RATE = 0.25;         // xác suất một ải 3-x đổi sang vùng tầng 4 (trùm tầng 4 vào bể) [ƯỚC LƯỢNG]
  B2.SUMMON_EVERY = 14;      // giây giữa hai đợt lính của Tước Sĩ [ƯỚC LƯỢNG: gốc không ghi chu kỳ]
  B2.SUMMON_CAP = 6;         // số lính sống tối đa cùng lúc [ƯỚC LƯỢNG]
  B2.STRENGTHEN = 0.07;      // [CFG skillSummonData.strengthenFactor] mỗi đợt sau mạnh hơn 7%
  B2.nextPure = false;       // sảnh đặt true trước khi vào ván để bật Thí Luyện Thuần Túy

  // ---------------------------------------------------------------- lính Tước Sĩ: dựng từ prefab e_bossrush_minion_a..d
  const MINIONS = ['e_bossrush_minion_a', 'e_bossrush_minion_b', 'e_bossrush_minion_c', 'e_bossrush_minion_d'];
  // Đạn gốc không bóc được (bullet_e_bossrush_minion_b, bullet_e_34_b) dùng đạn gần nhất đã có [ƯỚC LƯỢNG].
  const BULLET_FB = { bullet_e_bossrush_minion_b: 'bullet_e_34', bullet_e_34_b: 'bullet_e_34' };
  const sub = (a, b) => [Math.round((a[0] - b[0]) * 100) / 100, Math.round((a[1] - b[1]) * 100) / 100];
  function minionDef(id) {
    const parts = D.prefabs && D.prefabs[id];
    if (!parts) return null;
    const by = {}; for (const q of parts) by[q.n] = q;
    const root = parts[0], mb = root.mbs || {}, ra = mb.RoleAttribute || {};
    const aiCls = Object.keys(mb).find(c => /^EnemyAI/.test(c));
    const wp = by['/img/h1/weapon'], wcls = wp && wp.mbs && Object.keys(wp.mbs).find(c => /^E(Gun|Sword)/.test(c));
    if (!aiCls || !wp || !wcls) return null;
    const cir = by['/collider'] && by['/collider'].col, hb = root.col && root.col.box;
    const a = root.a || {}, pick = re => { const k = Object.keys(a).find(x => re.test(x)); return k && a[k]; };
    // Controller knight01 dùng chung đồ thị (ide/run/dead + hai lớp phụ): ghép khoá trạng thái của nó với clip của lính.
    const anims = { enemy01_ide: pick(/(^|_)ide$/), enemy01_run: pick(/(^|_)run$/), enemy01_dead: pick(/dead$/) };
    for (const k of Object.keys(a)) if (/^L2\./.test(k)) anims[k] = a[k];
    let bullet = String(wp.mbs[wcls].bullet || '').replace(/^@/, '');
    if (!(D.bullets && D.bullets[bullet])) bullet = BULLET_FB[bullet] || 'bullet_e_1';
    const wAnims = wp.a || {}, wctrl = (Object.values(wAnims)[0] || '').split('/')[0];
    const wsp = by['/img/h1/weapon/w'], gp = by['/img/h1/weapon/w/gun_point'];
    const w = {
      cls: wcls, p: wp.mbs[wcls], at: wp.at, path: 'img/h1/weapon', bullet, anims: wAnims,
      sprite: wsp && wsp.f, spriteOff: wsp ? sub(wsp.at, wp.at) : [0, 0], gunPoint: gp ? sub(gp.at, wp.at) : [8, 0], muzzle: (gp && gp.f) || 'nothing'
    };
    if (wctrl && D.ctrl && D.ctrl[wctrl]) w.ctrl = wctrl;
    const dead = by['/dead_tap'];
    const d = {
      theme: 'forest', level: 3, hp: ra.max_hp || 300, speed: ra.speed || 5, crit: ra.critical || 0,
      ai: [{ cls: aiCls, p: Object.assign({}, mb[aiCls]) }], anims, ctrl: D.ctrl && D.ctrl.knight01 ? 'knight01' : undefined,
      col: { hurt_box: hb || { trig: true, off: [0, 12.8], size: [12.8, 16] }, circle: (cir && cir.circle) || { trig: false, off: [0, 8], r: 6.4 } },
      hands: [by['/img/h1'].at], weapons: [w], body: by['/img/body'].f, bodyPath: 'img/body',
      shadow: by['/shadow'] && by['/shadow'].f, shadowOff: by['/shadow'] ? by['/shadow'].at : [0, 0]
    };
    if (dead) d.nodes = { dead_tap: { at: dead.at, f: dead.f, on: 0, o: 0 } };
    return d;
  }
  for (const id of MINIONS) if (!D.enemies[id]) { const d = minionDef(id); if (d) D.enemies[id] = d; }
  B2.minionIds = () => MINIONS.filter(id => D.enemies[id]);

  // ---------------------------------------------------------------- vé Lông Vũ Valkyrie
  const KEY = 'sk.bossrush2.v1';
  let S = null;
  const today = () => (SK.profile && SK.profile.dayIndex != null ? SK.profile.dayIndex : Math.floor(Date.now() / 864e5));
  function load() {
    if (S) return S;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* hồ sơ trắng */ }
    S = Object.assign({ feather: B2.FEATHER_START, day: -1, used: 0 }, o || {});
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* chế độ riêng tư */ } }
  function sync() { const s = load(), d = today(); if (s.day !== d) { s.day = d; s.used = 0; save(); } return s; }
  B2.feathers = () => sync().feather;
  B2.left = () => Math.max(0, B2.DAILY - sync().used);
  B2.addFeather = n => { const s = sync(); s.feather = Math.max(0, s.feather + n); save(); return s.feather; };
  B2.reset = () => { S = null; try { localStorage.removeItem(KEY); } catch (_) { /* không có kho */ } };
  // Vào cửa: tốn 1 lông vũ và 1 lượt trong ngày [WIKI Boss Rush]. canEnter trả lý do chặn hoặc null.
  B2.canEnter = () => { const s = sync(); return s.feather < 1 ? 'feather' : s.used >= B2.DAILY ? 'daily' : null; };
  B2.spend = () => { if (B2.canEnter()) return false; const s = sync(); s.feather--; s.used++; save(); return true; };

  // Treo thưởng của Cảnh Sát (js/hall_ext.js phát 'bounty' khi nhận thưởng): việc "thu thập" thưởng thêm 2 lông vũ.
  SK.on('bounty', (G, q) => {
    if (!q || q.type !== 'collect') return;
    B2.addFeather(B2.FEATHER_BOUNTY);
    if (G && G.toast) G.toast('Nhận thêm ' + B2.FEATHER_BOUNTY + ' Lông Vũ Valkyrie từ nhiệm vụ treo thưởng.', 4);
  });

  // Hộp thoại Valkyrie ở thẻ Khu Thí Luyện: hỏi, trừ vé rồi gọi go() (js/lobby.js móc một dòng).
  B2.ask = function (go) {
    const L = SK.lobby;
    if (!L || !L.dialog) { go(); return; }
    const why = B2.canEnter();
    const enter = pure => () => {
      if (!B2.spend()) return;
      L.closeDialog(); B2.nextPure = !!pure; go();
      if (SK.G && SK.G.toast) SK.G.toast('Hôm nay còn ' + B2.left() + ' lần.', 3);
    };
    L.dialog('<h3>Khu Thí Luyện</h3><p>Đang sợ hãi sao? Đã sẵn sàng đón nhận thử thách chưa?</p>' +
      '<p id="br-feather">Lông Vũ Valkyrie: <b>' + B2.feathers() + '</b> · hôm nay còn <b>' + B2.left() + '</b> lần</p>' +
      (why === 'feather' ? '<p class="hs-bad" id="br-short">Lông Vũ không đủ? Hãy đi tìm Cảnh Sát hoàn thành Nhiệm Vụ Treo Thưởng!</p>' : '') +
      (why === 'daily' ? '<p class="hs-bad" id="br-short">Số lần Khu Thí Luyện hôm nay đã đạt tối đa, hãy quay lại vào ngày mai.</p>' : '') +
      '<p class="hs-note">Thí Luyện Thuần Túy: không thiên phú, không nhặt vũ khí mới, qua ải 3-5 trong ' + Math.round(B2.LIMIT.normal / 60) + ' phút (Lợi Hại ' +
      Math.round(B2.LIMIT.badass / 60) + ' phút) để gặp Tước Sĩ. Kịp giờ thì đá quý nhận được gấp đôi, trượt thì bị giảm một nửa.</p>',
    [{ id: 'br-enter', label: 'Vào Khu Thí Luyện', cls: 'ok', disabled: !!why, fn: enter(false) },
      { id: 'br-pure', label: 'Thí Luyện Thuần Túy', disabled: !!why, fn: enter(true) },
      { id: 'br-cancel', label: 'Huỷ' }]);
  };

  // ---------------------------------------------------------------- Thí Luyện Thuần Túy
  const heldIds = p => [p.weapons[0], p.weapons[1], p.extraW].filter(w => w && w.id).map(w => w.id);
  SK.on('runStart', G => {
    G.pure = null; G.brWave = 0; sumT = B2.SUMMON_EVERY * 0.3;
    const want = B2.nextPure; B2.nextPure = false;
    if (G.mode !== 'bossrush' || !G.player) return;
    if (want && !(G.factors && G.factors.length)) G.pure = { on: true, t: 0, limit: B2.LIMIT[G.badass ? 'badass' : 'normal'], failed: null, start: heldIds(G.player), passed: false };
    // Trùm tầng 4 vào bể: vài ải 3-x lấy vùng tầng 4, trùm bốc từ các trùm tầng 4 đã có AI (js/floor4.js SK.bossWaves).
    // Dùng Math.random để không xê dịch dãy số của ván (bộ kiểm cố định seed).
    const F4 = SK.floor4;
    if (F4 && F4.ZONES && F4.ZONES.length && SK.BOSS_AIS && (F4.BOSSES45 || []).some(id => SK.BOSS_AIS[id])) {
      const rate = B2.f4Rate != null ? B2.f4Rate : B2.F4_RATE;
      for (const st of SK.STAGES) if (st.br && st.level === 3 && !st.final && st.n > 1 && Math.random() < rate) {
        st.theme = F4.ZONES[Math.floor(Math.random() * F4.ZONES.length)]; st.f4pool = true;
      }
    }
  });
  function fail(G, why) {
    const q = G.pure;
    if (!q || !q.on || q.failed) return;
    q.failed = why;
    G.toast('Thí luyện của bạn đã thất bại. Lợi ích bị giảm.', 4);
  }
  // Đang giữ vũ khí ngoài vũ khí khởi đầu thì tạm mất thuần túy; vứt đi thì hợp lệ lại [WIKI: nhặt vũ khí mới thì tắt ngay, bỏ xuống thì bật lại].
  B2.pureLive = G => {
    const q = G && G.pure; if (!q || !q.on || q.failed || !G.player) return false;
    return heldIds(G.player).every(id => q.start.indexOf(id) >= 0);
  };
  function tickPure(G, dt) {
    const q = G.pure;
    if (!q || !q.on || G.state !== 'stage' || !G.stage || G.stage.final) return;
    if (G.phase !== 'play' || !G.room || G.room.type === 'start') return;   // đồng hồ chạy ngoài phòng khởi đầu [WIKI]
    q.t += dt;
    if (q.t > q.limit && !q.passed) fail(G, 'time');
  }

  SK.on('buffTake', G => { if (G.mode === 'bossrush') fail(G, 'talent'); });
  // Bảng thiên phú bắt buộc chọn: ở Thuần Túy cho bỏ qua bằng phím 0 để giữ điều kiện.
  SK.on('buffChoice', G => { if (B2.pureLive(G)) G.toast('Thuần Túy: bấm 0 để bỏ qua thiên phú', 4); });
  B2.skipChoice = () => {
    const G = SK.G, R = SK.ROOMS;
    if (!G || !R || !R.choice || !R.choice.open || !B2.pureLive(G)) return false;
    R.choice.open = false; G.hold = false; return true;
  };
  addEventListener('keydown', e => { if (/^(?:Digit|Numpad)0$/.test(e.code) && B2.skipChoice()) e.preventDefault(); });

  // Cổng ải 3-5: kịp giờ, không thiên phú, không vũ khí lạ thì mở trận Tước Sĩ (ải 3-6); trượt thì bỏ ải đó, qua cổng là thắng.
  SK.on('portalEnter', (G, stage) => {
    if (G.mode !== 'bossrush' || !stage || stage.label !== '3-5' || stage.final) return;
    const q = G.pure, ok = !!q && q.on && B2.pureLive(G) && q.t <= q.limit;
    if (q && q.on) {
      if (ok) { q.passed = true; G.toast('Thí Luyện Thuần Túy hoàn thành. Tước Sĩ đang chờ.', 4); }
      else fail(G, q.t > q.limit ? 'time' : 'weapon');
    }
    if (!ok) { const i = SK.STAGES.findIndex(s => s.final); if (i >= 0) SK.STAGES.splice(i, 1); }
  });

  // Đá quý cuối lượt [WIKI Rush to Purity]: thắng trận Tước Sĩ thì gấp đôi, đã chọn Thuần Túy mà trượt thì giảm một nửa.
  SK.on('runEnd', (G, r) => {
    const q = G.pure;
    if (!q || !q.on || G.mode !== 'bossrush' || !r) return;
    const win = !!(r.won && G.stage && G.stage.final);
    r.pure = win ? 'win' : 'fail';
    r.gemMul = (r.gemMul || 1) * (win ? 2 : 0.5);
  });

  // Đồng hồ trên màn chơi.
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return (s / 60 | 0) + ':' + ('0' + s % 60).slice(-2); };
  SK.on('hud', (ctx, G) => {
    const q = G.pure;
    if (!q || !q.on || G.mode !== 'bossrush' || (G.state !== 'stage' && G.state !== 'pause') || !G.stage) return;
    let col = '#bfe6ff', txt;
    if (G.stage.final) txt = 'Thí Luyện Thuần Túy · Tước Sĩ';
    else if (q.failed) { col = '#ff6a5a'; txt = 'Thuần Túy thất bại'; }
    else if (!B2.pureLive(G)) { col = '#ffd060'; txt = 'Thuần Túy tạm tắt (đang giữ vũ khí lạ)'; }
    else { if (q.limit - q.t < 60) col = '#ff9a5a'; txt = 'Thuần Túy ' + mmss(q.limit - q.t); }
    SK.text(ctx, txt, 8, 48, 9, col, 'left', '#000');   // dưới khung HP/giáp/năng lượng
  });

  // ---------------------------------------------------------------- lính trong trận Tước Sĩ
  const bossOf = G => G.enemies.find(e => e.bossKey && /^boss_bossrush_final/.test(e.bossKey) && !e.deathDone && e.st !== 'dead');
  B2.summon = function (G, n) {
    const boss = bossOf(G), ids = B2.minionIds();
    if (!boss || !ids.length) return [];
    G.brWave = (G.brWave | 0) + 1;
    const alive = () => G.enemies.filter(e => e.room === boss.room && e.st !== 'dead' && /^e_bossrush_minion_/.test(e.id)).length;
    const out = [], pool = SK.shuffle(ids.slice());
    for (let i = 0; i < n && alive() < B2.SUMMON_CAP; i++) {
      const id = pool[i % pool.length], a = SK.rand() * Math.PI * 2, r = 36 + SK.rand() * 30;
      const [x, y] = SK.freeNear([boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r * 0.7]);
      const m = SK.makeEnemy(G, id, x, y, boss.room);
      m.hp = m.hpMax = Math.round(m.hpMax * (1 + B2.STRENGTHEN * (G.brWave - 1)));
      m.noReward = true; m.brMinion = G.brWave;
      G.enemies.push(m); out.push(m);
    }
    return out;
  };
  let sumT = 0;
  function tickSummon(G, dt) {
    if (G.mode !== 'bossrush' || !G.stage || !G.stage.final || G.state !== 'stage') { sumT = B2.SUMMON_EVERY * 0.3; return; }
    const b = bossOf(G);
    if (!b || !b.arena || b.arena.introT < 3 || b.arena.done) return;
    sumT += dt;
    if (sumT >= B2.SUMMON_EVERY) { sumT = 0; B2.summon(G, 3); }
  }

  // Một móc bước chung: game.js gọi SK.updatePlayer(G, dt) mỗi bước khi đang chơi (tạm dừng thì không gọi).
  const up = SK.updatePlayer;
  SK.updatePlayer = function (G, dt) { tickPure(G, dt); tickSummon(G, dt); return up.apply(this, arguments); };
})();
