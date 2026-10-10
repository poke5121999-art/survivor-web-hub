// Khu Giải Trí: màn chọn chế độ sự kiện (ô "Khu Giải Trí" ở sảnh) và plugin trận cho 4 chế độ của js/sim/events.js
// (HUD, xu 3D, thẻ tổng kết, kỷ lục, thưởng sự kiện của ngày). Luật nằm ở sim; tệp này chỉ vẽ và nhận kết quả.
// Chuỗi: "Khu Giải Trí" 8221af55, "Cách chơi Giải Trí" 1d7eb342, "Đã bị loại" 8a06bc8e; còn lại là chuỗi chọn.
(function (TD) {
  'use strict';
  const E = TD.Events;
  E.install();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (n, o) => TD.audio && TD.audio.play(n, o);
  const REV = () => '?v=' + (TD.REV || '');
  const A = 'art/events/';
  const DAILY = 0.5, FIRST = 200;   // chọn: sự kiện của ngày +50% xu thưởng; lần chơi đầu tiên mỗi ngày +200 xu

  TD.save.norms.push(E.norm);
  const saved = () => { const d = TD.save.d; if (!d.events) E.norm(d); return d.events; };

  // ---------- màn Khu Giải Trí ----------
  const ICON = { elim: A + 'eliminate.png', coins: 'art/ui/coin.png', cops: A + 'cops.png', limit: A + 'clock.png' };
  const HUE = { elim: ['#7a2438', '#d4506a'], coins: ['#7a5a10', '#e8b830'], cops: ['#1c3c7a', '#4a8cf0'], limit: ['#1c5a52', '#3cc8a8'] };
  // Chỉ đường vòng (laps ≥ 2): đường A→B không có vạch về đích nên trận theo giờ/loại vẫn chạy được nhưng Đua Giới Hạn thì không kết thúc.
  const loopTracks = () => Object.keys(TD.TRACKS).filter((id) => TD.TRACKS[id].laps >= 2);

  const S = { track: null };
  function show() {
    const d = TD.save.d, ev = saved(), today = E.today(), loops = loopTracks();
    if (!S.track || !loops.includes(S.track)) S.track = loops.includes(d.track) ? d.track : loops[0];
    const root = document.getElementById('ui');
    const claimed = ev.day === E.dayKey();
    root.innerHTML = `<div class="ev">
  <button class="ev-back btn gray" data-act="back" aria-label="Về sảnh">‹ Về sảnh</button>
  <div class="ev-title"><b>Khu Giải Trí</b><small>Sự kiện hôm nay: ${esc(E.DEFS[today].name)} · thưởng +${Math.round(DAILY * 100)}% xu${claimed ? '' : ', lần chơi đầu +' + FIRST + ' xu'}</small></div>
  <div class="ev-cards">${E.LIST.map((id) => {
    const D = E.DEFS[id], b = ev.best[id], h = HUE[id];
    return `<div class="ev-card${id === today ? ' today' : ''}" style="--c0:${h[0]};--c1:${h[1]}">
      ${id === today ? '<em class="ev-flag">Hôm nay +50%</em>' : ''}
      <img class="ev-ic" src="${ICON[id]}" alt="">
      <h3>${esc(D.name)}</h3>
      <p>${esc(D.rule)}</p>
      <div class="ev-best"><span>Kỷ lục</span><b>${b ? b + E.UNIT[id] : '--'}</b></div>
      <button class="btn yellow" data-play="${id}">CHƠI</button>
    </div>`;
  }).join('')}</div>
  <div class="ev-tracks">${loops.map((id) => `<button class="ev-th${id === S.track ? ' on' : ''}" data-track="${id}" aria-label="${esc(TD.TRACKS[id].name)}" style="background-image:url('art/maps/${id}.jpg')"></button>`).join('')}</div>
</div>`;
    root.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sfx('Play_UI_Click');
      if (b.dataset.act === 'back') { sfx('Play_UI_Back'); TD.lobby.show(); }
      else if (b.dataset.track) { S.track = b.dataset.track; show(); }
      else if (b.dataset.play) { d.track = S.track; TD.save.save(); sfx('Play_UI_Confirm'); TD.main.startRace({ mode: b.dataset.play }); }
    };
  }
  TD.lobby.add({ id: 'events', where: 'tile', label: 'Khu Giải Trí', icon: 'art/lobby/tile_leisure.webp', order: 50, open: show,
    badge: () => (saved().day === E.dayKey() ? 0 : 1) });

  // ---------- plugin trận ----------
  const P = { ctx: null };

  // Xu 3D: mô hình gốc props_item_goldcoin (art/events/coin_*.glb) dựng InstancedMesh; mỗi khung ghi lại ma trận các xu đang hiện.
  const glbCache = {};
  function loadGlb(name) {
    if (!glbCache[name]) {
      glbCache[name] = fetch(A + name + '.glb' + REV()).then((r) => { if (!r.ok) throw new Error(name + ' http ' + r.status); return r.arrayBuffer(); })
        .then((buf) => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)))
        .then((g) => {
          let mesh = null;
          g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
          const geo = mesh.geometry.clone(); geo.computeBoundingBox();
          const c = geo.boundingBox.getCenter(new THREE.Vector3()), sz = geo.boundingBox.getSize(new THREE.Vector3());
          geo.translate(-c.x, -c.y, -c.z);
          const map = mesh.material.map; if (map) map.encoding = THREE.sRGBEncoding;
          return { geo, map, dia: Math.max(sz.x, sz.y) };
        });
    }
    return glbCache[name];
  }
  const DIA = { small: 1.9, big: 2.8 };   // chọn: đường kính xu 1,9 m / 2,8 m (mô hình gốc ~3 m, to quá so với xe ~4 m; nhỏ hơn thì khó thấy từ camera đuổi)
  function buildCoins(ctx) {
    const S = ctx.R.ev, grp = new THREE.Group();
    P.coinRoot = grp; ctx.root.add(grp);
    P.pools = {};
    for (const kind of ['small', 'big']) {
      const n = kind === 'big' ? S.list.filter((c) => c.big).length : S.list.length - S.list.filter((c) => c.big).length;
      P.pools[kind] = { n: n + (kind === 'small' ? 64 : 0), mesh: null, count: 0 };
      loadGlb('coin_' + kind).then((g) => {
        if (P.ctx !== ctx) return;
        const mat = new THREE.MeshBasicMaterial({ map: g.map });
        const im = new THREE.InstancedMesh(g.geo, mat, P.pools[kind].n);
        im.frustumCulled = false; im.count = 0;
        P.pools[kind].mesh = im; P.pools[kind].k = DIA[kind] / g.dia; grp.add(im);
      }).catch((e) => TD.warnOnce('coin' + kind, String(e)));
    }
  }
  const dummy = new THREE.Object3D();
  function updateCoins(R, t) {
    const S = R.ev, me = P.ctx.me, until = S.until[me.id], big = P.pools.big, small = P.pools.small;
    const put = (pool, c, spin, lift) => {
      if (!pool.mesh || pool.count >= pool.n) return;
      dummy.position.set(c.x, c.y + lift, c.z); dummy.rotation.set(0, spin, 0); dummy.scale.setScalar(pool.k); dummy.updateMatrix();
      pool.mesh.setMatrixAt(pool.count++, dummy.matrix);
    };
    big.count = 0; small.count = 0;
    S.list.forEach((c, i) => {
      if (until[i] > R.t || Math.abs(c.x - me.x) > 260 || Math.abs(c.z - me.z) > 260) return;   // chỉ xu gần xe mới vẽ
      put(c.big ? big : small, c, t * 3 + i, Math.sin(t * 2 + i) * 0.12);
    });
    S.pile.forEach((c, i) => put(small, c, t * 5 + i, 0.2 + Math.sin(t * 4 + i) * 0.1));
    for (const p of [big, small]) if (p.mesh) { p.mesh.count = p.count; p.mesh.instanceMatrix.needsUpdate = true; }
  }

  // ---------- HUD ----------
  const font = (s) => '700 ' + s + 'px skui_CafetaBold, Cafeta, sans-serif';
  function pill(g, x, y, w, h, col) {
    g.fillStyle = col; g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, Math.min(h / 2, 16)); else g.rect(x, y, w, h);
    g.fill();
  }
  function text(g, s, x, y, col) { g.lineWidth = 4; g.strokeStyle = 'rgba(6,20,50,0.9)'; g.strokeText(s, x, y); g.fillStyle = col || '#fff'; g.fillText(s, x, y); }
  const mmss = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); };

  // Nội dung bảng trên cùng theo chế độ: [dòng nhỏ, số lớn, màu số, thanh 0..1 hoặc null]
  function panelOf(R) {
    const S = R.ev, t = R.goT == null ? 0 : R.t - R.goT, h = E.HUDS(R, S, t);
    if (S.kind === 'elim') {
      const e = TD.Events.TUNE;
      return h.left <= 1 ? ['Đua Loại', 'CHUNG CUỘC', '#ffe27a', null]
        : [h.warm ? 'Đua Loại · khởi động' : 'Loại xe hạng cuối sau', Math.ceil(h.next) + 's', h.next <= 5 ? '#ff6a6a' : '#fff', 1 - h.next / (h.warm ? e.elimStart : e.elimEvery), 'Còn ' + h.left + '/' + R.karts.length + ' xe'];
    }
    if (S.kind === 'coins') return ['Săn Xu · ' + mmss(h.left), String(h.mine), '#ffe27a', h.left / E.TUNE.coinTime, 'Dẫn đầu ' + h.best + ' xu'];
    if (S.kind === 'cops') return [h.cop ? 'Cảnh Sát · ' + mmss(h.left) : 'Cướp', h.caught + '/' + h.total, '#9fd0ff', h.left / E.TUNE.copTime, 'Bạn bắt ' + h.mine + ' tên'];
    return ['Giới hạn · cổng ' + h.gate, h.clock.toFixed(1) + 's', h.clock < 5 ? '#ff6a6a' : '#fff', Math.min(1, h.clock / 30), '+' + h.bonus.toFixed(1) + 's mỗi cổng'];
  }

  // Thẻ nổi trên đầu xe (chiếu điểm 3D lên màn hình).
  const v3 = new THREE.Vector3();
  function tag(g, hud, k, label, col) {
    v3.set(k.x, k.y + 2.1, k.z).project(P.ctx.M.camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) return;
    const x = (v3.x * 0.5 + 0.5) * hud.w, y = (-v3.y * 0.5 + 0.5) * hud.h, u = hud.h / 720, fs = Math.max(10, Math.round(15 * u));
    g.save(); g.font = font(fs); g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(label).width + fs;
    pill(g, x - w / 2, y - fs * 0.9, w, fs * 1.8, col);
    g.fillStyle = '#fff'; g.fillText(label, x, y + 1);
    g.fillStyle = col; g.beginPath(); g.moveTo(x - fs * 0.4, y + fs * 0.9); g.lineTo(x + fs * 0.4, y + fs * 0.9); g.lineTo(x, y + fs * 1.5); g.fill();
    g.restore();
  }

  function draw(g, hud) {
    if (!P.ctx) return;
    const R = P.ctx.R, S = R.ev; if (!S) return;
    const p = panelOf(R), u = hud.h / 720, fb = Math.max(18, Math.round(40 * u)), fs = Math.max(10, Math.round(14 * u));
    const w = Math.max(fb * 4.2, fs * 15), h = fb + fs * 2.6 + 14, y0 = Math.round(14 * u), cx = hud.w * 0.5 - 52 * u - w / 2;   // bên trái nút tạm dừng
    g.save(); pill(g, cx - w / 2, y0, w, h, 'rgba(6,16,40,0.6)');
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.font = font(fs); text(g, p[0], cx, y0 + 6, '#9fd0ff');
    g.font = font(fb); text(g, p[1], cx, y0 + fs + 8, p[2]);
    if (p[3] != null) { const bw = w * 0.8, by = y0 + fs + fb + 12; pill(g, cx - bw / 2, by, bw, 6, 'rgba(255,255,255,0.18)'); pill(g, cx - bw / 2, by, Math.max(6, bw * Math.min(1, Math.max(0, p[3]))), 6, p[3] < 0.2 ? '#ff6a6a' : '#5fe1ff'); }
    if (p[4]) { g.font = font(fs); text(g, p[4], cx, y0 + h - fs - 5, '#dff0ff'); }
    g.restore();
    // thẻ trên đầu xe
    if (S.kind === 'cops') {
      for (const k of R.karts) if (!k.done && k !== P.ctx.me) tag(g, hud, k, S.role[k.id] === 'cop' ? 'CẢNH SÁT' : 'CƯỚP', S.role[k.id] === 'cop' ? '#2f6ad8' : '#d8432f');
    } else if (S.kind === 'elim') {
      const t = R.goT == null ? 0 : R.t - R.goT, live = R.karts.filter((k) => !k.done).sort((a, b) => a.progress - b.progress);
      if (live.length > 1 && S.next - t < 6 && t > 1 && live[0] !== P.ctx.me) tag(g, hud, live[0], 'SẮP BỊ LOẠI', '#d8432f');
    }
    // chữ nổi "+n" khi nhặt xu / cộng giờ
    for (const q of P.pops) {
      const a = 1 - q.t / 1.1, y = hud.h * 0.42 - q.t * 50 * u;
      g.save(); g.globalAlpha = Math.max(0, a); g.font = font(Math.round(30 * u)); g.textAlign = 'center'; g.textBaseline = 'middle';
      text(g, q.s, hud.w * 0.5 + q.dx, y, q.col); g.restore();
    }
  }

  // ---------- plugin ----------
  P.pops = [];
  const plugin = {
    start(ctx) {
      P.ctx = null;
      if (!ctx.R.mode.event) return;
      E.prepare(ctx.R);
      P.ctx = ctx; P.pops = []; P.pools = null; P.coinRoot = null;
      if (ctx.R.ev.kind === 'coins') buildCoins(ctx);
      const tot = TD.hud.q('StaticUI/AnchorTopRight/Offset/IG_MiniMapContainer/Turns/FGLap/Label_Nums');
      if (tot && tot.txt) tot.txt.s = '--';   // số vòng 99 chỉ là cách tắt về đích theo vòng
    },
    update(dt, ctx) {
      if (P.ctx !== ctx) return;
      const R = ctx.R, S = R.ev, sdt = dt * (ctx.M.timeScale || 1);
      for (const k of R.karts) if (k.out && k !== ctx.me && ctx.M.views[k.id]) ctx.M.views[k.id].root.visible = false;
      P.pops = P.pops.filter((q) => (q.t += sdt) < 1.1);
      if (S && S.kind === 'coins' && P.pools) updateCoins(R, ctx.M.t);
    },
    event(e, isMine, ctx) {
      if (P.ctx !== ctx) return;
      const R = ctx.R, k = e.kart != null ? R.karts[e.kart] : null, menu = TD.menu;
      if (e.type === 'out' && k) {
        if (isMine) menu.banner(e.why === 'time' ? 'HẾT GIỜ' : 'BẠN BỊ LOẠI', true);
        else menu.banner(k.name + ' bị loại');
        sfx('Play_UI_Lose', { vol: isMine ? 0.9 : 0.5 });
      } else if (e.type === 'caught' && k) {
        const by = R.karts[e.by];
        menu.banner(by === ctx.me ? 'BẠN BẮT ĐƯỢC ' + k.name.toUpperCase() : k.name + ' bị bắt');
        sfx('Play_Race_FinalLap');
      } else if (e.type === 'coin' && isMine) {
        P.pops.push({ s: '+' + e.v, t: 0, dx: (Math.random() - 0.5) * 90, col: e.v > 1 ? '#ffd23a' : '#fff6c0' });
        sfx('Play_UI_Select', { vol: 0.35 });
      } else if (e.type === 'coin_drop' && isMine) {
        menu.banner('Rơi ' + e.n + ' xu!');
      } else if (e.type === 'gate' && isMine && R.mode.event === 'limit') {
        P.pops.push({ s: '+' + R.ev.bonus.toFixed(1) + 's', t: 0, dx: 0, col: '#5fe1ff' });
        sfx('Play_Race_Lap', { vol: 0.5 });
      }
    },
    draw(g, hud) { draw(g, hud); },
    settle(F, ctx) {
      if (P.ctx !== ctx) return;
      const R = ctx.R, me = ctx.me, id = R.mode.event, ev = saved(), score = E.score(R, me), prev = ev.best[id];
      const newBest = score > 0 && (!prev || score > prev);
      if (newBest) ev.best[id] = Math.min(99999, score);
      const D = TD.save.d, today = E.today() === id, key = E.dayKey();
      let bonus = 0, note = [];
      if (today) { bonus += Math.round(F.reward * DAILY); note.push('Sự kiện hôm nay +' + Math.round(DAILY * 100) + '%'); }
      if (ev.day !== key) { bonus += FIRST; ev.day = key; note.push('Lần đầu hôm nay +' + FIRST); }
      D.coins += bonus; F.reward += bonus;
      const win = F.place === 1;
      F.cards.push(`<div class="fin-card ev-fin"><h4>${esc(E.DEFS[id].name)}${win ? ' · THẮNG' : ''}</h4><div class="fin-gain">${score}${E.UNIT[id]}</div>` +
        `<small>${newBest ? '<b>KỶ LỤC MỚI</b>' : 'Kỷ lục ' + (ev.best[id] || 0) + E.UNIT[id]}${note.length ? '<br>' + note.join(' · ') : ''}</small></div>`);
    },
    end() {
      if (P.coinRoot && P.coinRoot.parent) P.coinRoot.parent.remove(P.coinRoot);
      P.coinRoot = null; P.pools = null; P.ctx = null; P.pops = [];
    },
  };
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push(plugin);
  TD.eventsUI = { show, panelOf, debug: () => ({ pools: P.pools && Object.fromEntries(Object.entries(P.pools).map(([k, v]) => [k, v.count || 0])) }) };
})(globalThis.TD = globalThis.TD || {});
