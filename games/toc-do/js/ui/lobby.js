// Sảnh chính, chọn chế độ, Huấn Luyện, ghép phòng, thẻ người chơi ở màn tải (nhánh Sảnh).
// Bố cục theo sảnh gốc og_lb_lobbyview + clip hhbJeuMU1ms t=0: xe 3D bên trái, thông tin người chơi góc trên trái, xu và cài đặt
// góc trên phải, cụm ô chế độ bên phải, thanh chức năng dưới cùng. Chọn chế độ theo og_selectgamemodeldialog, ghép phòng theo
// og_quickmatchdialog, thẻ người chơi theo loadingplayerblue/red/yellowitem. Ảnh: art/lobby (tools/export_lobby_ui.py).
(function (TD) {
  'use strict';
  const L = { screen: null, roster: null };
  const A = 'art/lobby/';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (e) => TD.audio && TD.audio.play(e);
  const root = () => document.getElementById('ui');
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');

  // Chế độ của màn "Chọn kiểu phòng đua" (thứ tự và nhãn "Tiến Cử" như og_selectgamemodeldialog) và màn Huấn Luyện.
  // bg/ic: ảnh thẻ gốc; ba chế độ luyện tập không có thẻ riêng trong APK nên mượn thẻ đua (chọn).
  const ART = {
    speed: { bg: 'mode_speed', ic: 'icon_speed', tag: true },
    speedTeam: { bg: 'mode_speedTeam', ic: 'icon_speedTeam' },
    item: { bg: 'mode_item', ic: 'icon_item' },
    itemTeam: { bg: 'mode_itemTeam', ic: 'icon_itemTeam', tag: true },
    free: { bg: 'mode_speedTeam', ic: 'icon_speed' },
    itemPractice: { bg: 'mode_item', ic: 'icon_item' },
    shadow: { bg: 'mode_speed', ic: 'icon_speed', ghost: true },
  };
  const matchModes = () => Object.values(TD.MODES).filter((m) => m.match);
  const practiceModes = () => Object.values(TD.MODES).filter((m) => m.practice);
  // src: uitextures/id_thing/id_car/01ncar/ncar_<id>; xe thêm sau mà chưa xuất biểu tượng thì thẻ không có hình xe.
  const CAR_ICONS = ['04', '06', '16', '55', '175', '254', '284', '297'];
  const carImg = (id) => (CAR_ICONS.indexOf(id) >= 0 ? `<img class="lb-ccar" src="${A}car_${id}.webp" alt="">` : '');

  // ---------- camera phòng trưng bày ----------
  // Xe đứng ở 27% bề ngang màn (sảnh gốc: nhân vật + xe ở nửa trái), dịch camera sang phải theo tỉ lệ khung hình.
  // fov 36 như Main Camera của Lobby_L_Art; gần và thấp hơn camera gốc (cao 3,5 m, cách 10 m) để xe đủ lớn khi chỉ có xe, không có nhân vật đứng.
  const CAM = { fov: 36, dist: 8.2, y: 2.3, lookY: 1.0, at: 0.27 };
  function applyCam() {
    if (!TD.main) return;
    if (L.screen !== 'home') { TD.main.lobbyCam = { pos: [0, 1.6, 6.2], look: [0, 0.5, 0], fov: CAM.fov }; return; }
    const half = CAM.dist * Math.tan(CAM.fov / 2 * Math.PI / 180) * innerWidth / innerHeight;
    const dx = (0.5 - CAM.at) * 2 * half;
    TD.main.lobbyCam = { pos: [dx, CAM.y, CAM.dist], look: [dx, CAM.lookY, 0], fov: CAM.fov };
  }
  addEventListener('resize', () => { if (L.screen) applyCam(); });

  // ---------- sân khấu 3D ----------
  // Sân khấu Lobby_L_Art gốc (art/lobby/stage.glb, tools/export_lobby_ui.py --stage) thêm vào phòng trưng bày của main.js.
  // Camera gốc nhìn +z về phía xe ở gốc toạ độ; phòng trưng bày nhìn −z nên xoay sân khấu nửa vòng.
  // Shader gốc là shader riêng (QF gamma); vẽ MeshBasic theo extras.kind như js/view/podium.js.
  function loadStage() {
    const S = TD.main && TD.main.show;
    if (L.stage || !S) return;
    const THREE = window.THREE;
    L.stage = fetch(A + 'stage.glb?v=' + (TD.REV || '')).then((r) => { if (!r.ok) throw new Error('stage.glb http ' + r.status); return r.arrayBuffer(); })
      .then((b) => new Promise((ok, no) => { const l = new THREE.GLTFLoader(); l.setMeshoptDecoder(window.MeshoptDecoder); l.parse(b, '', ok, no); }))
      .then((g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          const ex = Object.assign({ kind: 'opaque', tint: [1, 1, 1] }, o.material.userData), map = o.material.map || null;
          const add = ex.kind === 'add', op = ex.kind === 'opaque';
          o.material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(...ex.tint), transparent: !op, depthWrite: op, side: THREE.DoubleSide,
            vertexColors: !op && !!o.material.vertexColors, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
          o.renderOrder = /Sky/.test(ex.shader || '') ? -10 : op ? 0 : add ? 3 : 2;
          o.frustumCulled = false;
        });
        g.scene.rotation.y = Math.PI;
        S.scene.add(g.scene);
      });
  }

  function mount(screen, html, onclick) {
    loadStage();
    L.screen = screen;
    clearTimeout(L.matchT); clearInterval(L.clockT);
    // Canvas HUD giữ khung cuối của trận (toLobby không xoá) và nằm trên cảnh 3D: xoá để sảnh không lộ HUD cũ.
    const H = TD.hud;
    if (H && H.ctx) { H.ctx.setTransform(1, 0, 0, 1, 0, 0); H.ctx.clearRect(0, 0, H.canvas.width, H.canvas.height); }
    const r = root();
    r.innerHTML = html;
    r.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) onclick(b, e); };
    applyCam();
  }

  function toast(msg) {
    const r = root(), old = r.querySelector('.lb-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'lb-toast';
    t.textContent = msg;
    r.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  // ---------- sảnh chính ----------
  function rankInfo() {
    if (!TD.RANK) return '';
    const r = TD.RANK.of(TD.save.d.rank.pts);
    return `<img class="lb-badge" src="${r.badge}" alt=""><small class="lb-rk">${esc(r.name)}</small>`;
  }
  const dot = (n) => (n > 0 ? `<i class="lb-dot">${n}</i>` : '');

  // Mục sảnh do module khác đăng ký (PET, thời trang, xưởng, bạn bè, thư, cốt truyện, sự kiện…):
  //   TD.lobby.add({ id, where: 'bar' | 'top' | 'tile', label, icon, order, open(), badge?() })
  // where 'tile' với id 'story' / 'events' mở ô Cốt Truyện / Khu Giải Trí (khoá khi chưa có ai đăng ký).
  L.entries = [];
  L.add = function (e) { L.entries = L.entries.filter((x) => x.id !== e.id).concat(e).sort((a, b) => (a.order || 0) - (b.order || 0)); };
  const entry = (id) => L.entries.find((e) => e.id === id);
  const badgeOf = (e) => { try { return e.badge ? e.badge() | 0 : 0; } catch (err) { console.error(err); return 0; } };
  const entryBtn = (e, cls) => `<button class="${cls}" data-entry="${e.id}"><img src="${e.icon}" alt=""><span>${esc(e.label)}</span>${dot(badgeOf(e))}</button>`;
  function tile(id, cls, img, label) {
    const e = entry(id);
    return e ? `<button class="lb-tile ${cls}" data-entry="${id}"><img class="bg" src="${A}${img}" alt="">${dot(badgeOf(e))}<span class="lb-tl">${label}</span></button>`
      : `<button class="lb-tile ${cls} off" data-act="locked"><img class="bg" src="${A}${img}" alt=""><img class="lk" src="${A}lock.webp" alt=""><span class="lb-tl">${label}</span></button>`;
  }

  L.show = function () {
    const d = TD.save.d, lv = TD.LEVEL.of(d.xp);
    const b = TD.garage && TD.garage.badges ? TD.garage.badges() : { quests: 0, ach: 0 };
    L.roster = null;   // về sảnh thì lần ghép sau gặp đối thủ mới
    const bar = [['cars', 'bar_garage', 'Gara'], ['skills', 'bar_skills', 'Kỹ Năng'], ['ach', 'bar_ach', 'Thành Tựu'], ['shop', 'bar_shop', 'Cửa Hàng']];
    mount('home', `
<div class="lb lobby lb-home">
  <div class="lb-me">
    <div class="lb-av"><img src="${A}avatar_${d.driver === 'nu' ? 'nu' : 'nam'}.webp" alt=""><img class="ring" src="${A}avatar_ring.webp" alt=""></div>
    <div class="lb-meinfo"><b>${esc(d.name)}</b>
      <div class="lb-lv"><span>Lv.</span><em>${lv.lv}</em><i class="lb-exp"><b style="width:${lv.need ? Math.round(100 * lv.into / lv.need) : 100}%"></b></i><small>${lv.into}/${lv.need}</small></div>
    </div>
  </div>
  <div class="lb-tr">
    ${L.entries.filter((e) => e.where === 'top').map((e) => entryBtn(e, 'lb-top')).join('')}
    <div class="lb-coins"><img src="${A}coin.webp" alt=""><b>${fmt(d.coins)}</b></div>
    <button class="lb-gear" data-act="settings" aria-label="Thiết lập"><img src="${A}gear.webp" alt=""></button>
  </div>
  <div class="lb-tiles">
    <button class="lb-tile t-rank" data-act="ranked"><img class="bg" src="${A}tile_rank.webp" alt="">${rankInfo()}<span class="lb-tl">Giải Đấu</span></button>
    <button class="lb-tile t-start" data-act="start"><img class="bg" src="${A}tile_start.webp" alt=""><span class="lb-tl">Xuất Phát</span></button>
    <button class="lb-tile t-train" data-act="practice"><img class="bg" src="${A}tile_training.webp" alt=""><span class="lb-tl">Huấn Luyện</span></button>
    ${tile('story', 't-story', 'tile_story.webp', 'Cốt Truyện')}
    ${tile('events', 't-leisure', 'tile_leisure.webp', 'Khu Giải Trí')}
  </div>
  <nav class="lb-bar${L.entries.some((e) => e.where === 'bar') ? ' many' : ''}">
    ${L.entries.filter((e) => e.where === 'bar').map((e) => entryBtn(e, 'lb-bt')).join('')}
    ${bar.map(([t, ic, n]) => `<button class="lb-bt" data-tab="${t}"><img src="${A}${ic}.webp" alt=""><span>${n}</span>${dot(t === 'ach' ? b.ach : 0)}</button>`).join('')}
    <button class="lb-bt lb-quest" data-tab="quests"><img src="${A}bar_quests.webp" alt=""><span>Nhiệm Vụ</span>${dot(b.quests)}</button>
  </nav>
</div>`, (bt) => {
      sfx('Play_UI_Click');
      const act = bt.dataset.act, tab = bt.dataset.tab, en = bt.dataset.entry && entry(bt.dataset.entry);
      if (en) { L.screen = null; TD.main.lobbyCam = null; en.open(); }
      else if (tab) { if (TD.garage && TD.garage.open) { L.screen = null; TD.garage.open(tab); } else toast('Chưa mở'); }
      else if (act === 'start') L.modes();
      else if (act === 'practice') L.practice();
      else if (act === 'ranked') { if (TD.ranked && TD.ranked.show) { L.screen = null; TD.main.lobbyCam = null; TD.ranked.show(); } else toast('Chưa mở'); }
      else if (act === 'locked') toast('Chưa mở');
      else if (act === 'settings') TD.menu.settings(() => L.show());
    });
  };

  // ---------- chọn chế độ / Huấn Luyện (cùng khung: thẻ chế độ + chọn đường) ----------
  function trackPane(T, go) {
    const d = TD.save.d, ids = Object.keys(TD.TRACKS), best = d.best[T.id];
    return `<div class="lb-pane">
    <div class="lb-track" style="background-image:url('art/maps/${T.id}.jpg')">
      <div class="lb-tname"><b>${esc(T.name)}</b><small>${T.laps} vòng · ${(T.length / 1000).toFixed(1)} km · Kỷ lục ${best ? TD.fmtTime(best) : '--:--.--'}</small></div>
    </div>
    <div class="lb-tracks">${ids.map((id) => `<button class="lb-th ${id === T.id ? 'on' : ''}" data-track="${id}" aria-label="${esc(TD.TRACKS[id].name)}" style="background-image:url('art/maps/${id}.jpg')"></button>`).join('')}</div>
    <button class="lb-go" data-act="go"><span>${go}</span></button>
  </div>`;
  }

  function modeCard(m, on) {
    const a = ART[m.id] || ART.speed;
    return `<button class="lb-mode ${on ? 'on' : ''}${a.ghost ? ' ghost' : ''}" data-mode="${m.id}">
      <img class="bg" src="${A}${a.bg}.webp" alt=""><img class="ic" src="${A}${a.ic}.webp" alt="">
      <span>${esc(m.name)}</span>${a.tag && !m.practice ? '<em class="lb-tag">Tiến Cử</em>' : ''}</button>`;
  }

  // kind = 'match' (Xuất Phát → Ghép phòng) hoặc 'practice' (Huấn Luyện → Bắt đầu, vào thẳng trận).
  function pickScreen(kind) {
    const d = TD.save.d, list = kind === 'match' ? matchModes() : practiceModes();
    if (!TD.TRACKS[d.track]) d.track = Object.keys(TD.TRACKS)[0];
    const sel = list.some((m) => m.id === d.mode) ? d.mode : list[0].id;
    const title = kind === 'match' ? 'Chọn kiểu phòng đua' : 'Huấn Luyện';
    const go = kind === 'match' ? 'Ghép phòng' : 'Bắt đầu';
    const T = TD.TRACKS[d.track];
    mount(kind, `
<div class="lb lb-pick lb-k-${kind}">
  <button class="lb-back" data-act="back" aria-label="Về sảnh"><img src="${A}back.webp" alt=""></button>
  <div class="lb-title"><img src="${A}title_arrow.webp" alt=""><b>${title}</b></div>
  <div class="lb-modes">${list.map((m) => modeCard(m, m.id === sel)).join('')}</div>
  ${trackPane(T, go)}
</div>`, (b) => {
      if (b.dataset.act === 'back') { sfx('Play_UI_Back'); L.show(); return; }
      sfx('Play_UI_Click');
      if (b.dataset.mode) { d.mode = b.dataset.mode; TD.save.save(); pickScreen(kind); }
      else if (b.dataset.track) { d.track = b.dataset.track; TD.save.save(); pickScreen(kind); }
      else if (b.dataset.act === 'go') {
        d.mode = sel; TD.save.save();
        sfx('Play_UI_Confirm');
        if (kind === 'match') L.match(TD.MODES[sel]); else { L.screen = null; TD.main.startRace({ mode: sel }); }
      }
    });
    const on = root().querySelector('.lb-th.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  L.modes = () => pickScreen('match');
  L.practice = () => pickScreen('practice');

  // ---------- đối thủ ----------
  // Danh sách theo thứ tự xe trong trận như TD.main.startRace dựng: người chơi ở ô cuối, đội xen kẽ theo ô (mình luôn Đội Xanh).
  function makeRoster(mode) {
    const d = TD.save.d, n = mode.karts, slot = n - 1, me = TD.LEVEL.of(d.xp).lv;
    const names = TD.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const list = [];
    for (let i = 0; i < n; i++) {
      const team = mode.teams ? TD.teamOf(i, slot, mode.teams) : null;
      if (i === slot) list.push({ me: true, name: d.name, lv: me, av: d.driver === 'nu' ? 'nu' : 'nam', car: d.car, team });
      // chọn: bot cùng tầm cấp người chơi ±6, ảnh đại diện nam/nữ ngẫu nhiên
      else list.push({ name: names[i % names.length], lv: Math.max(1, Math.min(99, me + Math.round(Math.random() * 12 - 6))), av: Math.random() < 0.5 ? 'nam' : 'nu', car: null, team });
    }
    return { mode: mode.id, list };
  }
  L.rosterFor = function (mode, fresh) {
    if (fresh || !L.roster || L.roster.mode !== mode.id || L.roster.list.length !== mode.karts) L.roster = makeRoster(mode);
    return L.roster;
  };

  // Thẻ người chơi: mình vàng (loadingplayeryellowitem), Đội Xanh xanh (blue), Đội Đỏ đỏ (red); đua đơn bot xanh.
  function card(p, i, hidden) {
    const col = p.me ? 'gold' : p.team === 1 || p.team == null ? 'blue' : 'red';
    return `<div class="lb-card ${col}${hidden ? ' wait' : ''}" data-k="${i}"><img class="lb-cbg" src="${A}card_${col}.webp" alt="">
      <img class="lb-cav" src="${A}avatar_${p.av}.webp" alt=""><b>${esc(p.name)}</b><small>Lv.${p.lv}</small>${p.car ? carImg(p.car) : '<i class="lb-ccar"></i>'}</div>`;
  }
  // Mỗi đội một cột (đội mình trước), hoặc chia đôi khi đua đơn. Trả HTML; thẻ ẩn (đang chờ) có lớp wait.
  function rosterHTML(r, hidden) {
    const idx = r.list.map((p, i) => i);
    const me = r.list.length - 1;
    let cols;
    if (r.list[0].team != null) {
      const n = Math.max(...r.list.map((p) => p.team)) + 1, order = [1].concat([...Array(n).keys()].filter((t) => t !== 1));
      cols = order.map((t) => idx.filter((i) => r.list[i].team === t).sort((a, b) => (b === me) - (a === me)));
    }
    else { const o = [me].concat(idx.filter((i) => i !== me)), h = Math.ceil(o.length / 2); cols = [o.slice(0, h), o.slice(h)]; }
    return cols.map((c, ci) => `<div class="lb-col c${ci}">${c.map((i) => card(r.list[i], i, hidden && hidden.has(i))).join('')}</div>`).join('');
  }

  // ---------- ghép phòng ----------
  // chọn: mỗi đối thủ vào sau 0,25–0,6 s, đủ người thì chờ 0,7 s rồi vào trận (bản gốc ghép qua máy chủ).
  L.match = function (mode) {
    const r = L.rosterFor(mode, true), T = TD.TRACKS[TD.save.d.track];
    const me = r.list.length - 1, wait = new Set(r.list.map((p, i) => i).filter((i) => i !== me));
    mount('matching', `
<div class="lb lb-match" style="background-image:url('${A}match_bg.webp')">
  <div class="lb-mhead"><b class="lb-mstate">Đang ghép...</b><span>${esc(mode.name)} · ${esc(T.name)}</span><em class="lb-mtime">00:00</em></div>
  <div class="lb-roster">${rosterHTML(r, wait)}</div>
  <button class="lb-cancel" data-act="cancel"><img src="${A}btn_cancel.webp" alt=""><span>Hủy ghép</span></button>
</div>`, (b) => {
      if (b.dataset.act !== 'cancel') return;
      sfx('Play_UI_Back');
      L.roster = null;
      L.modes();
    });
    const t0 = Date.now();
    L.clockT = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000), el = root().querySelector('.lb-mtime');
      if (el) el.textContent = '00:' + (s < 10 ? '0' : '') + s;
    }, 250);
    const order = [...wait].sort(() => Math.random() - 0.5);
    const next = () => {
      if (L.screen !== 'matching') return;
      const i = order.shift();
      if (i == null) {
        const st = root().querySelector('.lb-mstate');
        if (st) st.textContent = 'Ghép thành công';
        L.matchT = setTimeout(() => { if (L.screen === 'matching') { L.screen = null; clearInterval(L.clockT); TD.main.startRace({ mode: mode.id }); } }, 700);
        return;
      }
      const el = root().querySelector(`.lb-card[data-k="${i}"]`);
      if (el) el.classList.remove('wait');
      sfx('Play_UI_Select');
      L.matchT = setTimeout(next, 250 + Math.random() * 350);
    };
    L.matchT = setTimeout(next, 500);
  };

  // ---------- màn tải (TD.menu.loading gọi) ----------
  // Thẻ của trận sắp đua; xe của bot chỉ biết khi TD.main.startRace đã dựng trận, nên theo dõi tới lúc đó rồi điền hình xe.
  L.loadingCards = function (mode) {
    if (mode.karts < 2) return '';
    const r = L.rosterFor(mode), race0 = TD.main.race;
    const watch = () => {
      const box = root().querySelector('.ld-cards');
      if (!box) return;
      const R = TD.main.race;
      if (!R || R === race0 || R.karts.length !== r.list.length) { requestAnimationFrame(watch); return; }
      R.karts.forEach((k, i) => {
        const c = box.querySelector(`.lb-card[data-k="${i}"] .lb-ccar`);
        if (c && c.tagName !== 'IMG' && CAR_ICONS.indexOf(k.carId) >= 0) c.outerHTML = carImg(k.carId);
      });
    };
    requestAnimationFrame(watch);
    return `<div class="ld-cards lb-roster">${rosterHTML(r)}</div>`;
  };

  // Tên đối thủ trong trận lấy theo danh sách đã ghép (startRace tự xáo tên riêng).
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push({
    start(ctx) {
      const r = L.roster;
      if (!r || r.mode !== ctx.R.mode.id || r.list.length !== ctx.R.karts.length) return;
      ctx.R.karts.forEach((k, i) => { if (k.ctrl !== 'human') k.name = r.list[i].name; });
    },
  });

  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !L.screen || L.screen === 'home' || !TD.main || TD.main.state !== 'lobby') return;
    const b = root().querySelector('.lb-back, .lb-cancel');
    if (b) b.click();
  });

  TD.lobby = L;
})(globalThis.TD = globalThis.TD || {});
