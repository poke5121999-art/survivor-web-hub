// Quái Thú Trỗi Dậy: giao diện, vẽ trận và nối sảnh (lõi ở js/monsterrise.js). Chế độ có trạng thái riêng G.state = 'monsterrise'
// (SK.MODES, như Season). Giao diện là lớp DOM phủ lên màn hình, trận vẽ trên canvas riêng bằng hình gốc của prefab trong monster_rise.ab
// (tools/extra/monsterrise.json: M_* qua SK_DATA.prefabs, khung hoạt ảnh lấy từ SpriteAnimationProxy.spriteSets).
(function () {
  'use strict';
  const SK = window.SK, MR = SK.monsterrise, C = MR.C, MON = MR.MON, G = SK.G;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let root = null, R = null, B = null, cv = null, cx = null, sel = null, selShop = null, ritual = null, msg = '';
  const CW = 720, CH = 330, CELL = 60;
  MR.drawn = {};   // khoá prefab gốc đã vẽ thành công (kiểm thử)

  const css = '#mr{position:fixed;inset:0;z-index:3;display:flex;flex-direction:column;background:#16241a;color:#eef;font:15px/1.35 system-ui,sans-serif;overflow:auto}' +
    '#mr[hidden]{display:none}#mr button{font:inherit;cursor:pointer;color:#fff;background:#3a6a48;border:2px solid #9be0a8;border-radius:6px;padding:5px 12px}' +
    '#mr button:disabled{opacity:.45;cursor:default}#mr button.sel{background:#7a5a1a;border-color:#ffd24a}' +
    '#mr-top{display:flex;gap:18px;align-items:center;padding:8px 14px;background:#0d1610;border-bottom:2px solid #2d4a36;flex-wrap:wrap}' +
    '#mr-top b{color:#ffd24a}#mr-main{flex:1;padding:10px 14px;display:flex;flex-direction:column;gap:8px;align-items:center}' +
    '#mr-squad{display:flex;gap:8px;padding:8px 14px;background:#0d1610;border-top:2px solid #2d4a36;flex-wrap:wrap;min-height:70px}' +
    '.mr-card{background:#24402d;border:2px solid #4a7a58;border-radius:8px;padding:6px 8px;display:flex;gap:8px;align-items:center;min-width:150px;cursor:pointer}' +
    '.mr-card.sel{border-color:#ffd24a}.mr-card.big{flex-direction:column;width:200px;text-align:center}.mr-card .n{font-weight:700}' +
    '.mr-bar{height:6px;background:#400;border-radius:3px;overflow:hidden;width:100%}.mr-bar i{display:block;height:100%;background:#4ad86a}' +
    '.mr-map{display:flex;gap:26px;align-items:center;justify-content:center;flex-wrap:wrap}.mr-col{display:flex;flex-direction:column;gap:10px}' +
    '.mr-node{min-width:92px;text-align:center}.mr-node.cur{outline:3px solid #ffd24a}.mr-node.done{opacity:.4}' +
    '.mr-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.mr-msg{color:#ffd24a;min-height:20px}' +
    '#mr canvas.mr-ic{width:44px;height:44px;image-rendering:pixelated;flex:none}#mr canvas#mr-cv{width:min(100%,720px);aspect-ratio:720/330;image-rendering:pixelated;background:#243;border:2px solid #4a7a58;border-radius:6px}';

  // ---------------------------------------------------------------- hình
  const frameCache = {};
  function framesOf(key) {   // các khung hoạt ảnh [idle[], walk[]] có trong atlas
    if (frameCache[key]) return frameCache[key];
    const P = SK.prefab(MON[key].prefab), A = window.SK_ATLAS && window.SK_ATLAS.f || {};
    const px = P && P[0] && P[0].mbs && P[0].mbs.SpriteAnimationProxy, out = [[], []];
    if (px && px.spriteSets) for (let i = 0; i < 2; i++) {
      const s = px.spriteSets[i]; if (!s) continue;
      for (const n of s.sprites) { const nm = String(n).replace(/^@/, ''); if (A[nm] && out[i][out[i].length - 1] !== nm) out[i].push(nm); }
    }
    if (!out[0].length) { const f0 = MON[key].prefab + '_0'; if (A[f0]) out[0].push(f0); }
    return (frameCache[key] = out);
  }
  function drawMon(c, key, x, y, o) {   // chân quái ở (x, y)
    o = o || {};
    const fr = framesOf(key), set = o.moving && fr[1].length ? fr[1] : fr[0];
    if (!set.length) return false;
    const nm = set[Math.floor((o.t || 0) * 8) % set.length];
    const ok = SK.draw(c, nm, x, y, { sx: (o.scale || 1) * (o.flip ? -1 : 1), sy: o.scale || 1, alpha: o.alpha });
    if (ok) MR.drawn[MON[key].prefab] = (MR.drawn[MON[key].prefab] || 0) + 1;
    return ok;
  }
  function icon(key, size) {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 44; cvs.className = 'mr-ic';
    const c = cvs.getContext('2d'); c.imageSmoothingEnabled = false;
    const f = framesOf(key)[0][0], A = window.SK_ATLAS.f[f];
    if (A) { const k = Math.min(1, 40 / Math.max(A[3], A[4])); drawMon(c, key, 22, 40, { scale: k }); }
    return cvs;
  }

  // ---------------------------------------------------------------- giao diện
  const hpPct = r => Math.max(0, Math.min(100, Math.round(100 * r.hp / MR.maxHp(r))));
  function card(r, extra) {
    const m = MON[r.key];
    return '<div class="mr-card' + (sel === r ? ' sel' : '') + '" data-uid="' + r.uid + '"><span class="ic" data-key="' + r.key + '"></span><div style="flex:1"><div class="n">' + esc(m.name) + (r.lvl > 1 ? ' · Cấp ' + r.lvl : '') +
      '</div><div class="mr-bar"><i style="width:' + hpPct(r) + '%"></i></div><small>' + Math.round(r.hp) + '/' + MR.maxHp(r) + ' HP' + (r.badges.length ? ' · ' + r.badges.map(b => MR.BADGES[b].name).join(', ') : '') + '</small>' + (extra || '') + '</div></div>';
  }
  function fillIcons() { for (const el of root.querySelectorAll('.ic')) { el.replaceWith(icon(el.dataset.key)); } }
  function top() {
    const used = MR.used(R), n = MR.node(R, R.cur);
    return '<span>' + esc(MR.floorName(R.floor)) + ' · Tầng ' + (R.floor + 1) + '/' + C.floors + '</span><span>Vàng <b id="mr-coins">' + R.coins + '</b></span><span>Thức ăn <b id="mr-food">' + R.food + '</b></span>' +
      '<span>Quy mô đội <b>' + used + '/' + R.cap + '</b></span><span>' + esc(MR.typeName(n ? n.type : 'start')) + '</span><span style="flex:1"></span><button id="mr-quit">Bỏ cuộc</button>';
  }
  const need = () => MR.foodNeed(R, Object.keys(R.placed).length ? Object.keys(R.placed).map(u => R.mons.find(r => r.uid == u).key) : null);

  function ui() {
    if (!root || !R) return;
    root.hidden = !!R.over;
    root.querySelector('#mr-top').innerHTML = top();
    const main = root.querySelector('#mr-main'), sq = root.querySelector('#mr-squad');
    sq.innerHTML = R.mons.length ? R.mons.map(r => card(r)).join('') : '<i>Không còn quái thú nào.</i>';
    cv = null;
    let h = '';
    const sc = R.screen;
    if (sc === 'start') {
      h = '<h2>Giải Vô Địch Quái Thú Trỗi Dậy</h2><p>Sương mù nguy hiểm đang lan rộng. Hãy chiêu mộ quái thú để chạy thoát. Chọn ' + C.startKeep + ' quái thú xuất phát (' + R.mons.length + '/' + C.startKeep + ').</p><div class="mr-row">' +
        R.starters.map(k => { const m = MON[k]; return '<div class="mr-card big" data-start="' + k + '"><span class="ic" data-key="' + k + '"></span><div class="n">' + esc(m.name) + '</div><small>' + MR.raceName(m.race) + ' · ' + MR.roleName(m.role) + '<br>HP ' + m.hp + ' · Tấn công ' + m.atk + ' · Tầm ' + m.range + '</small><button ' + (R.mons.some(r => r.key === k) ? 'disabled' : '') + '>Chọn</button></div>'; }).join('') + '</div>';
    } else if (sc === 'map') {
      const cur = MR.node(R, R.cur);
      h = '<h3>Hãy xác định địa điểm trạm tiếp theo:</h3><div class="mr-map">' + R.map.cols.map(col => '<div class="mr-col">' + col.map(n => {
        const can = cur.next.includes(n.id), isCur = n.id === R.cur;
        return '<button class="mr-node' + (isCur ? ' cur' : '') + '" data-node="' + n.id + '" ' + (can ? '' : 'disabled') + '>' + esc(MR.typeName(n.type)) + '</button>';
      }).join('') + '</div>').join('') + '</div>';
    } else if (sc === 'prep') {
      h = '<h3>Giai đoạn chuẩn bị: chọn quái rồi bấm ô bên trái sân</h3><canvas id="mr-cv" width="' + CW + '" height="' + CH + '"></canvas>' +
        '<div class="mr-row" id="mr-tray">' + R.mons.map(r => '<button data-tray="' + r.uid + '" class="' + (R.placed[r.uid] ? 'sel' : '') + '">' + esc(MON[r.key].name) + ' (' + MON[r.key].cost + ')</button>').join('') + '</div>' +
        '<div id="mr-foodinfo">Chiến đấu sẽ tốn ' + need() + ' thức ăn' + (need() > R.food ? ' · Chết Đói: quái phe ta gây ít hơn ' + Math.round(C.starve * 100) + '% sát thương' : '') + '</div>' +
        '<div class="mr-row"><button id="mr-auto">Tự xếp</button><button id="mr-go" ' + (Object.keys(R.placed).length ? '' : 'disabled') + '>Bắt đầu</button></div>';
    } else if (sc === 'battle') {
      h = '<canvas id="mr-cv" width="' + CW + '" height="' + CH + '"></canvas><div class="mr-row"><span id="mr-time"></span>' + [1, 2, 4].map(s => '<button data-speed="' + s + '" class="' + (B && B.speed === s ? 'sel' : '') + '">x' + s + '</button>').join('') + '</div>';
    } else if (sc === 'result') {
      const w = R.bt && R.bt.won;
      h = '<h2 style="color:' + (w ? '#ffd24a' : '#ff7a7a') + '">' + (w ? 'Thắng trận!' : 'Thất Bại') + '</h2><p>' + esc(R.bt && R.bt.text || '') + '</p><button id="mr-next">' + (w ? 'Tiếp tục' : 'Kết thúc') + '</button>';
    } else if (sc === 'shop') {
      h = '<h3>Cửa hàng</h3><p>Chọn một quái bên dưới trước khi mua huy hiệu.</p><div class="mr-row">' + R.shop.map(it => {
        const nm = it.kind === 'monster' ? MON[it.key].name : it.kind === 'badge' ? 'Huy hiệu ' + MR.BADGES[it.key].name : it.kind === 'pot' ? 'Bình hồi phục (40% HP cả đội)' : it.kind === 'food' ? 'Thức ăn x' + C.foodPack : 'Hồi sinh quái đã mất';
        const dsc = it.kind === 'badge' ? '<small>' + esc(MR.BADGES[it.key].desc) + '</small>' : it.kind === 'monster' ? '<small>' + MR.raceName(MON[it.key].race) + ' · HP ' + MON[it.key].hp + ' · Quy mô ' + MON[it.key].cost + '</small>' : '';
        return '<div class="mr-card big"><div class="n">' + esc(nm) + '</div>' + dsc + '<button data-buy="' + it.i + '" ' + (it.sold ? 'disabled' : '') + '>' + (it.sold ? 'Đã bán' : it.price + ' Vàng') + '</button></div>';
      }).join('') + '</div><button id="mr-leave">Rời đi</button>';
    } else if (sc === 'rest') {
      h = '<h3>Nghỉ ngơi</h3><div class="mr-row"><button id="mr-rest">Nghỉ ngơi (hồi ' + Math.round(C.restFrac * 100) + '% HP)</button><button id="mr-meal">Bữa ăn thịnh soạn (hồi ' + Math.round(C.restMeal * 100) + '% HP, tốn ' + C.foodRest + ' thức ăn)</button></div><button id="mr-leave">Tiếp tục</button>';
    } else if (sc === 'ritual') {
      h = '<h3>Nghi lễ</h3><p>Quái thú bên trái sẽ hi sinh để quái thú bên phải nhận thiên phú mới.</p><div class="mr-row" id="mr-rit"><span>Hi sinh: <b>' + (ritual && ritual.sac ? esc(MON[ritual.sac.key].name) : '?') + '</b></span><span>Nhận thiên phú: <b>' + (ritual && ritual.gain ? esc(MON[ritual.gain.key].name) : '?') + '</b></span></div>' +
        '<div class="mr-row"><button id="mr-rit-go" ' + (ritual && ritual.sac && ritual.gain ? '' : 'disabled') + '>Thực hiện</button><button id="mr-leave">Rời đi</button></div>';
    } else if (sc === 'event') {
      const E = MR.EVENTS[R.event.id];
      h = '<h3>' + esc(E.title) + '</h3><p>' + esc(E.text(R.event.kv)) + '</p>' + (R.event.done ? '<button id="mr-leave">Tiếp tục</button>' : '<div class="mr-row"><button data-ev="a">' + esc(E.a.label) + '</button><button data-ev="b">' + esc(E.b.label) + '</button></div>');
    }
    main.innerHTML = h + '<div class="mr-msg" id="mr-msg">' + esc(msg) + '</div>';
    cv = main.querySelector('#mr-cv'); cx = cv ? cv.getContext('2d') : null; if (cx) cx.imageSmoothingEnabled = false;
    fillIcons();
    bind(main, sq);
  }
  function say(m) { msg = m; const e = root && root.querySelector('#mr-msg'); if (e) e.textContent = m; }
  const recOf = el => R.mons.find(r => r.uid == el.closest('[data-uid]').dataset.uid);

  function bind(main, sq) {
    root.querySelector('#mr-quit').onclick = () => finish(false, 'Bạn đã bỏ cuộc');
    for (const el of sq.querySelectorAll('[data-uid]')) el.onclick = () => {
      const r = recOf(el);
      if (R.screen === 'ritual') { ritual = ritual || {}; if (!ritual.sac) ritual.sac = r; else if (ritual.sac !== r) ritual.gain = r; msg = ''; ui(); return; }
      sel = sel === r ? null : r; ui();
    };
    for (const el of main.querySelectorAll('[data-start]')) el.querySelector('button').onclick = () => { MR.pickStarter(R, el.dataset.start); msg = ''; ui(); };
    for (const el of main.querySelectorAll('[data-node]')) el.onclick = () => { if (MR.go(R, el.dataset.node)) { msg = ''; sel = null; ritual = null; R.placed = {}; ui(); } };
    for (const el of main.querySelectorAll('[data-tray]')) el.onclick = () => {
      const u = el.dataset.tray; if (R.placed[u]) { delete R.placed[u]; trayPick = null; } else trayPick = u; ui();
    };
    if (cv && R.screen === 'prep') cv.onclick = e => {
      const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * CW, y = (e.clientY - b.top) / b.height * CH;
      const c = Math.floor(x / CELL), r = Math.floor((y - 15) / CELL);
      if (c < 0 || c >= C.half || r < 0 || r >= C.rows) return;
      const at = Object.keys(R.placed).find(u => R.placed[u][0] === c && R.placed[u][1] === r);
      if (at) { delete R.placed[at]; ui(); return; }
      if (trayPick) { R.placed[trayPick] = [c, r]; trayPick = null; ui(); }
    };
    const g = id => main.querySelector('#' + id);
    if (g('mr-auto')) g('mr-auto').onclick = () => { autoPlace(); ui(); };
    if (g('mr-go')) g('mr-go').onclick = () => startBattle();
    for (const el of main.querySelectorAll('[data-speed]')) el.onclick = () => { if (B) B.speed = +el.dataset.speed; ui(); };
    if (g('mr-next')) g('mr-next').onclick = () => afterResult();
    if (g('mr-leave')) g('mr-leave').onclick = () => { MR.leaveNode(R); msg = ''; ritual = null; ui(); };
    for (const el of main.querySelectorAll('[data-buy]')) el.onclick = () => {
      const it = R.shop[+el.dataset.buy], r = MR.buy(R, it, sel);
      msg = r.ok ? 'Đã mua.' : r.why; ui();
    };
    if (g('mr-rest')) g('mr-rest').onclick = () => { MR.rest(R, false); msg = 'Cả đội đã hồi sức.'; R.screen = 'map'; ui(); };
    if (g('mr-meal')) g('mr-meal').onclick = () => { const r = MR.rest(R, true); msg = r.ok ? 'Bữa ăn thịnh soạn, cả đội đã hồi sức.' : r.why; if (r.ok) R.screen = 'map'; ui(); };
    if (g('mr-rit-go')) g('mr-rit-go').onclick = () => {
      const r = MR.ritual(R, ritual.sac, ritual.gain);
      if (r.ok) { msg = 'Quái thú đã thức tỉnh thiên phú mới: ' + MR.BADGES[r.badge].name + '.'; ritual = null; R.screen = 'map'; } else msg = r.why;
      ui();
    };
    for (const el of main.querySelectorAll('[data-ev]')) el.onclick = () => {
      const r = MR.eventAct(R, R.event, el.dataset.ev);
      if (!r.ok) { msg = r.why; ui(); return; }
      msg = r.msg;
      if (r.fight) { R.foes = MR.spawnFoes(R, 'fight'); R.boss = false; R.screen = 'prep'; R.placed = {}; R.afterEvent = true; } else R.event.done = true;
      ui();
    };
  }
  let trayPick = null;
  function autoPlace() {   // tank ra trước, xạ thủ/pháp sư ra sau
    R.placed = {}; const used = {};
    const order = R.mons.slice().sort((a, b) => MON[a.key].range - MON[b.key].range);
    order.forEach(r => {
      const m = MON[r.key], cols = m.range <= 1.5 ? [5, 4, 3, 2, 1, 0] : [2, 1, 0, 3, 4, 5];
      for (const c of cols) for (const row of [2, 1, 3, 0, 4]) if (!used[c + ':' + row]) { used[c + ':' + row] = 1; R.placed[r.uid] = [c, row]; return; }
    });
  }

  // ---------------------------------------------------------------- trận
  function startBattle() {
    const keys = Object.keys(R.placed); if (!keys.length) return;
    const allies = keys.map(u => { const rec = R.mons.find(r => r.uid == u); return { rec, x: R.placed[u][0], y: R.placed[u][1] }; });
    const food = MR.foodNeed(R, allies.map(a => a.rec.key));
    const starving = food > R.food; R.stats.foodUsed += Math.min(food, R.food); R.food = Math.max(0, R.food - food);
    B = MR.startBattle(R, allies, R.foes, { starving, boss: R.boss }); B.speed = 1; B.beat = 0; MR.B = B;
    R.screen = 'battle'; msg = starving ? 'Chết Đói: quái phe ta gây ít sát thương hơn.' : ''; ui();
  }
  function endBattle() { MR.concludeBattle(R, B); R.screen = 'result'; ui(); }
  function afterResult() {
    const r = MR.advance(R);
    if (r === 'lose') { finish(false, 'Kẻ địch mạnh hơn ta ước tính'); return; }
    if (r === 'win') { finish(true, 'Vô địch Quái Thú Trỗi Dậy'); return; }
    if (R.bt.boss) msg = 'Bạn đã tới khu vực mới, sương mù vẫn đang lan rộng.';   // [LOC monsrise/ev_continue_text]
    R.placed = {}; ui();
  }

  // ---------------------------------------------------------------- kết thúc ván (đường thật: runEnd -> Gems ở js/lobby.js)
  function finish(won, why) {
    if (!R || R.ended) return;
    R.ended = true; R.over = true; R.won = won; G.state = 'monsterrise';
    if (root) root.hidden = true;
    SK.setOverlay(won ? 'sk-win' : 'sk-over');
    G.stageIdx = R.stats.rooms; G.stage = { label: 'Quái Thú ' + (R.floor + 1), theme: '' };
    SK.emit('runEnd', G, { won, stage: 'Quái Thú ' + (R.floor + 1) + '/' + C.floors, kills: R.kills, gold: 0 });
    const info = document.getElementById(won ? 'sk-win-info' : 'sk-over-info');
    if (info) info.textContent = (won ? 'Vô địch Quái Thú Trỗi Dậy · ' : why + ' · ') + 'Tầng ' + (R.floor + 1) + '/' + C.floors + ' · Hạ ' + R.kills + ' quái · ' + R.stats.battles + ' trận';
  }
  MR.finish = finish;

  // ---------------------------------------------------------------- vào chế độ
  MR.start = function (heroId) {
    heroId = heroId && SK.DS.heroes[heroId] ? heroId : 'knight';
    if (!root) {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      root = document.createElement('div'); root.id = 'mr'; root.innerHTML = '<div id="mr-top"></div><div id="mr-main"></div><div id="mr-squad"></div>'; document.body.appendChild(root);
    }
    G.heroId = heroId; G.player = SK.makePlayer(heroId, 0, 0); G.player.gold = 0;
    G.mode = 'monsterrise'; G.state = 'monsterrise'; G.map = null; G.kills = 0; G.stageIdx = 0; G.t = G.t || 0; G.badass = false; G.factors = []; G.mods = {};
    G.stage = { label: 'Quái Thú 1', theme: '' };
    SK.setOverlay(null);
    const hm = document.getElementById('hs-modes'); if (hm) hm.hidden = true;
    R = MR.R = MR.newRun(heroId); B = MR.B = null; sel = null; ritual = null; msg = ''; trayPick = null;
    root.hidden = false; ui();
    return true;
  };

  // ---------------------------------------------------------------- vòng lặp + vẽ
  let tAnim = 0;
  SK.MODES = SK.MODES || {};
  SK.MODES.monsterrise = {
    step(dt) {
      tAnim += dt;
      if (!R || R.over || R.screen !== 'battle' || !B || B.over) { if (R && R.screen === 'battle' && B && B.over && !R.settling) { R.settling = true; endBattle(); R.settling = false; } return; }
      let t = dt * (B.speed || 1);
      while (t > 1e-6 && !B.over) { const s = Math.min(0.05, t); MR.battleStep(B, s); t -= s; }
      if (B.over) { R.settling = true; endBattle(); R.settling = false; }
    },
    render(ctx) {
      const v = SK.view; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#16241a'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (!R || !cx) return;
      if (R.screen === 'prep') drawField(R.foes, null);
      else if (R.screen === 'battle' && B) { drawField(null, B); const te = root.querySelector('#mr-time'); if (te) te.textContent = 'Thời gian đấu ' + Math.floor(B.time) + ' giây' + (B.mist ? ' · Sương mù đang nuốt đội' : ''); }
    }
  };
  function drawField(foes, bt) {
    const c = cx, Y0 = 15;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, CW, CH);
    c.fillStyle = '#2e5a38'; c.fillRect(0, 0, CW, CH);
    for (let r = 0; r < C.rows; r++) for (let q = 0; q < C.cols; q++) {
      c.fillStyle = (q + r) % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; c.fillRect(q * CELL, Y0 + r * CELL, CELL, CELL);
      if (q < C.half) { c.fillStyle = 'rgba(80,140,255,.10)'; c.fillRect(q * CELL, Y0 + r * CELL, CELL, CELL); } else { c.fillStyle = 'rgba(255,80,80,.10)'; c.fillRect(q * CELL, Y0 + r * CELL, CELL, CELL); }
    }
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(C.half * CELL, Y0); c.lineTo(C.half * CELL, Y0 + C.rows * CELL); c.stroke();
    const items = [];
    if (bt) for (const u of bt.units) { if (u.alive) items.push({ u, x: u.x * CELL, y: Y0 + u.y * CELL, side: u.side, key: u.key, hp: u.hp, max: u.max, sh: u.shield, mv: u.mv, flip: (u.face || (u.side === 'a' ? 1 : -1)) < 0 }); }
    else {
      for (const f of foes || []) items.push({ x: f.x * CELL, y: Y0 + f.y * CELL, side: 'e', key: f.key, hp: f.hp, max: f.max, sh: f.shield, flip: true });
      for (const u of Object.keys(R.placed)) { const r = R.mons.find(m => m.uid == u); if (r) items.push({ x: (R.placed[u][0] + 0.5) * CELL, y: Y0 + (R.placed[u][1] + 0.5) * CELL, side: 'a', key: r.key, hp: r.hp, max: MR.maxHp(r), sh: r.badges.includes('precaution') ? 12 : 0 }); }
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const sc = 1.15, fy = it.y + 20;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(it.x, fy, 15, 6, 0, 0, 6.3); c.fill();
      if (!drawMon(c, it.key, it.x, fy, { t: tAnim + (it.x * 0.01), moving: it.mv, flip: it.flip, scale: sc })) { c.fillStyle = it.side === 'a' ? '#6ab0ff' : '#ff7a7a'; c.fillRect(it.x - 10, fy - 30, 20, 30); }
      c.fillStyle = '#300'; c.fillRect(it.x - 18, fy - 48, 36, 5); c.fillStyle = it.side === 'a' ? '#4ad86a' : '#ff6a4a'; c.fillRect(it.x - 18, fy - 48, 36 * Math.max(0, it.hp / it.max), 5);
      if (it.sh > 0) { c.fillStyle = '#8ad8ff'; c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillText('▣' + Math.floor(it.sh), it.x, fy - 52); }
    }
    if (bt) for (const f of bt.fx) {
      const k = f.t / f.dur; c.globalAlpha = Math.max(0, 1 - k);
      if (f.k === 'txt') { c.fillStyle = f.col; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText(f.txt, f.x * CELL, Y0 + f.y * CELL - k * 20); }
      else if (f.k === 'shot' || f.k === 'bolt') { c.strokeStyle = f.col; c.lineWidth = f.k === 'bolt' ? 3 : 2; c.beginPath(); c.moveTo(f.x * CELL, Y0 + f.y * CELL - 14); c.lineTo(f.x2 * CELL, Y0 + f.y2 * CELL - 14); c.stroke(); }
      else if (f.k === 'ring') { c.strokeStyle = f.col; c.lineWidth = 2; c.beginPath(); c.ellipse(f.x * CELL, Y0 + f.y * CELL + 16, 10 + 26 * k, 5 + 12 * k, 0, 0, 6.3); c.stroke(); }
      else if (f.k === 'slash') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(f.x * CELL, Y0 + f.y * CELL - 6, 12, -1 + k, 1 + k); c.stroke(); }
      else if (f.k === 'puff') { c.fillStyle = '#ddd'; c.beginPath(); c.arc(f.x * CELL, Y0 + f.y * CELL, 6 + 16 * k, 0, 6.3); c.fill(); }
      c.globalAlpha = 1;
    }
  }
  MR.ui = ui;
})();
