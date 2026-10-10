// X.Hạng-Tốc Độ: sảnh xếp hạng (huy hiệu bậc, sao, điểm, lịch sử), thẻ kết quả trận và màn thăng/hạ cấp.
// Chuỗi tiếng Việt lấy từ Localization_VN_Base: Điểm bậc 23e2e815, Bậc cao nhất 649dcad1, Thắng liên tục e11a27c3,
// Tăng cấp thành công aab732ea, Tăng cấp thất bại f0d9d00c, Vòng Trong 436d39fc, Mở vòng trong 27aa30fa, Hạ cấp 27bbb90d, Sao 4e337bc5,
// Cao nhất mùa giải này 4ff76cab, Mùa giải kết thúc còn 21c8c959, Mùa giải đã kết thúc 7abf8630, Xu Xếp Hạng 74ca6593.
(function (TD) {
  'use strict';
  const R = {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => TD.audio && TD.audio.play('Play_UI_Click');
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hm = (h) => String(h).padStart(2, '0') + ':00';

  // Bản lưu: rank.xu/shield/season/series/day/dn tự thêm ở js/sim/rank.js; sửa bản hỏng hoặc từ đám mây cũ.
  TD.save.norms.push((o) => {
    const r = TD.RANK.rankOf(o);
    r.shield = Math.min(r.shield, TD.RANK.MAX_SHIELD);
    r.season = Math.max(0, Math.floor(Number(r.season) || 0));
    r.day = typeof r.day === 'string' ? r.day.slice(0, 12) : '';
    const s = r.series;
    r.series = s && typeof s === 'object' && Array.isArray(s.r) && s.r.length < TD.RANK.SERIES_OF ? { tier: s.tier | 0, r: s.r.map((x) => (x ? 1 : 0)) } : null;
    if (!Array.isArray(r.hist)) r.hist = [];
    r.hist = r.hist.slice(0, 10);
  });

  const stars = (r) => r.maxStars ? `<div class="rk-stars" aria-label="${r.stars} sao">${Array.from({ length: r.maxStars }, (_, i) => `<i class="${i < r.stars ? 'on' : ''}">★</i>`).join('')}</div>` : '';
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  // Vòng Trong: SERIES_OF ô, xanh = top 3, đỏ = trượt, trống = chưa đua.
  const pips = (ser) => `<div class="rk-pips" aria-label="Vòng Trong">${Array.from({ length: TD.RANK.SERIES_OF }, (_, i) => {
    const v = ser && ser.r[i]; return `<i class="${v === 1 ? 'win' : v === 0 ? 'lose' : ''}">${v === 1 ? '✓' : v === 0 ? '✕' : i + 1}</i>`; }).join('')}</div>`;

  function histRows(h) {
    if (!h.length) return '<div class="rk-empty">Chưa có trận nào</div>';
    return h.slice(0, 3).map((x) => `<div class="rk-h ${x.d > 0 ? 'up' : x.d < 0 ? 'dn' : ''}"><span>${x.place ? 'Hạng ' + x.place + '/' + x.n : 'Hết giờ'}</span><em>${signed(x.s)} ★</em><b>${signed(x.d)}</b></div>`).join('');
  }

  let view = 'hall';   // 'hall' | 'shop'
  let ticker = 0;

  function shopHtml(rk) {
    return `<div class="rk-modal"><div class="rk-shop panel">
      <div class="rk-shophead"><b>Cửa Hàng Xu Xếp Hạng</b><span class="rk-xu"><i class="rk-xuic">★</i><b>${fmt(rk.xu)}</b></span></div>
      <div class="rk-items">${TD.RANK.SHOP.map((it) => `<button class="rk-item ${rk.xu < it.cost ? 'poor' : ''}" data-buy="${it.id}">
        <b>${esc(it.name)}</b><small>${esc(it.desc)}</small><span class="rk-cost"><i class="rk-xuic">★</i>${it.cost}</span></button>`).join('')}</div>
      <p class="rk-msg" role="status">${esc(msg)}</p>
      <button class="btn gray rk-close" data-act="close">Đóng</button></div></div>`;
  }
  let msg = '';

  function seasonModal(rw) {
    return `<div class="rk-modal"><div class="rk-shop panel rk-season">
      <b>Mùa giải đã kết thúc</b>
      <img src="${rw.badge}" alt="${esc(rw.name)}">
      <small>Cao nhất mùa giải S${rw.season}: ${esc(rw.name)}</small>
      <p>Thưởng theo bậc cao nhất: <b>${fmt(rw.coins)} xu</b> và <b>${rw.xu} Xu Xếp Hạng</b></p>
      <small>Bậc đầu mùa giải mới: ${esc(rw.start)}</small>
      <button class="btn yellow rk-close" data-act="close">Nhận</button></div></div>`;
  }

  // ---------- sảnh xếp hạng ----------
  R.show = function () {
    const now = new Date(), d = TD.save.d;
    const rw = TD.RANK.rollover(d, now);
    if (rw) { TD.save.save(); R.render(seasonModal(rw)); } else R.render('');
  };
  R.render = function (modal) {
    clearInterval(ticker);
    const now = new Date(), d = TD.save.d, rk = TD.RANK.rankOf(d), cur = TD.RANK.of(rk.pts), best = TD.RANK.of(rk.best);
    const A = TD.RANK, ser = rk.series, left = A.seasonLeft(now), win = A.noLoss(now), dl = A.dailyLeft(d, now);
    const bar = cur.top ? 100 : Math.round(cur.inSub / cur.subW * 100);
    const root = document.getElementById('ui');
    const hero = ser ? `${pips(ser)}<div class="rk-series"><b>Vòng Trong</b><small>Về top 3 trong ${A.SERIES_WIN} trên ${A.SERIES_OF} trận để lên bậc</small></div>`
      : `${stars(cur)}<div class="rk-prog"><i style="width:${bar}%"></i></div>
      <small class="rk-next">${cur.top ? 'Bậc cao nhất' : 'Còn ' + cur.toNext + ' điểm lên ' + esc(cur.nextName)}</small>`;
    root.innerHTML = `<div class="rk">
  <button class="rk-back btn gray" data-act="back" aria-label="Về sảnh">‹ Về sảnh</button>
  <div class="rk-title"><b>X.Hạng-Tốc Độ</b><small>Mùa giải S${A.seasonOf(now)} · Mùa giải kết thúc còn: ${left.days} ngày ${left.hours} giờ</small></div>
  <button class="rk-wallet btn gray" data-act="shop" aria-label="Cửa Hàng Xu Xếp Hạng"><i class="rk-xuic">★</i><b>${fmt(rk.xu)}</b><small>Cửa hàng</small></button>
  <div class="rk-main">
    <div class="rk-hero">
      <img class="rk-badge" src="${cur.badge}" alt="${esc(cur.tierName)}">
      <h2>${esc(cur.name)}</h2>
      ${hero}
    </div>
    <div class="rk-side panel">
      <div class="rk-stat"><span>Điểm bậc</span><b>${rk.pts}</b></div>
      <div class="rk-stat"><span>Cao nhất mùa giải này:</span><b>${esc(best.name)}</b></div>
      <div class="rk-stat"><span>Thắng liên tục</span><b>${rk.streak}</b></div>
      <div class="rk-stat"><span>Số trận · thắng</span><b>${rk.games} · ${rk.wins}</b></div>
      <div class="rk-chip ${win ? 'on' : ''}" data-chip="noloss">${win ? 'Đang mở: không mất điểm đến ' + hm(A.NOLOSS[1]) : 'Đua Xếp Hạng không mất điểm mở: ' + hm(A.NOLOSS[0]) + '-' + hm(A.NOLOSS[1])}</div>
      <div class="rk-chip ${dl ? 'on' : ''}" data-chip="daily">3 trận đầu Đua Xếp Hạng mỗi ngày: ${dl ? 'còn ' + dl + ' trận (+1 sao, gấp đôi Xu)' : 'đã dùng hết'}</div>
      ${rk.shield ? `<div class="rk-chip on" data-chip="shield">Khiên Giữ Sao: ${rk.shield}</div>` : ''}
      <div class="rk-hist">${histRows(rk.hist || [])}</div>
    </div>
  </div>
  <button class="rk-go btn yellow" data-act="race">${ser && !ser.r.length ? 'Mở vòng trong' : ser ? 'Vòng Trong' : 'THI ĐẤU'}</button>
  ${view === 'shop' ? shopHtml(rk) : modal}
</div>`;
    // Khung giờ không mất điểm và đồng hồ mùa đổi theo giờ máy: vẽ lại mỗi phút khi không có hộp thoại.
    ticker = setInterval(() => { if (document.querySelector('.rk') && !document.querySelector('.rk-modal')) R.render(''); else if (!document.querySelector('.rk')) clearInterval(ticker); }, 60000);
    root.onclick = (e) => {
      const buy = e.target.closest('[data-buy]');
      if (buy) { click(); const o = TD.RANK.buy(d, buy.dataset.buy); msg = o.ok ? 'Đã mua ' + o.item.name : o.why; if (o.ok) TD.save.save(); R.render(''); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      click();
      if (b.dataset.act === 'back') { clearInterval(ticker); view = 'hall'; (TD.lobby && TD.lobby.show) ? TD.lobby.show() : TD.main.toLobby(); }
      else if (b.dataset.act === 'shop') { view = 'shop'; msg = ''; R.render(''); }
      else if (b.dataset.act === 'close') { view = 'hall'; R.render(''); }
      else {
        clearInterval(ticker);
        const ids = Object.keys(TD.TRACKS);
        d.track = ids[(Math.random() * ids.length) | 0];   // chọn: đường ngẫu nhiên mỗi trận như ghép trận xếp hạng gốc
        TD.main.startRace({ mode: 'ranked' });
      }
    };
  };

  // ---------- thẻ kết quả trong màn thưởng ----------
  function card(res, place, n, dnf) {
    const a = res.after, sr = res.series;
    const tag = res.promoted ? 'Tăng cấp thành công' : res.failed ? 'Tăng cấp thất bại' : res.seriesOpened ? 'Mở vòng trong' : res.demoted ? 'Hạ cấp' : res.subUp ? 'Lên bậc ' + a.subLabel : res.subDown ? 'Xuống bậc ' + a.subLabel : '';
    const line = sr ? `Vòng Trong ${sr.wins}/${sr.need} thắng · ${sr.losses} thua` : `${esc(a.name)} · ${a.pts} điểm${res.streak >= 2 ? ' · thắng liên tục ' + res.streak : ''}`;
    const extra = [res.daily ? '3 trận đầu ngày' : '', res.noLoss ? 'không mất điểm' : '', res.shield ? 'Khiên Giữ Sao đã dùng' : ''].filter(Boolean).join(' · ');
    return `<div class="fin-card rk-card ${res.stars > 0 || res.promoted ? 'up' : res.stars < 0 || res.failed ? 'dn' : ''}">
        <h4>X.Hạng · ${dnf ? 'hết giờ' : 'hạng ' + place + '/' + n}</h4>
        <img class="rk-cardbadge" src="${a.badge}" alt="${esc(a.tierName)}">
        <div class="fin-gain">${sr ? (sr.good ? 'Top 3' : 'Trượt') : signed(res.stars) + ' ★'}</div>
        <small>${line}</small>
        <small class="rk-cardxu">+${res.xu} Xu Xếp Hạng${extra ? ' · ' + extra : ''}</small>
        ${tag ? `<div class="rk-tag">${tag}</div>` : ''}
        ${res.season ? `<small class="rk-cardxu">Mùa mới: nhận ${fmt(res.season.coins)} xu, ${res.season.xu} Xu Xếp Hạng</small>` : ''}
      </div>`;
  }

  // ---------- thăng / hạ cấp: huy hiệu cũ + điểm → biến hình → huy hiệu mới to → "Tiếp tục" ----------
  let pending = null, over = null, timers = [];
  function clearOver() {
    timers.forEach(clearTimeout); timers = [];
    if (over) over.remove();
    over = null;
  }
  function playOver(res) {
    clearOver();
    const up = res.promoted, o = res.before, a = res.after;
    const title = up ? 'Tăng cấp thành công' : res.failed ? 'Tăng cấp thất bại' : 'Hạ cấp';
    over = document.createElement('div');
    over.className = 'rk-over ' + (up ? 'up' : 'dn');
    over.dataset.stage = '1';
    over.innerHTML = `<div class="rk-ray"></div>
  <div class="rk-stage">
    <img class="rk-old" src="${o.badge}" alt="${esc(o.tierName)}">
    <img class="rk-new" src="${a.badge}" alt="${esc(a.tierName)}">
  </div>
  <div class="rk-oname">${esc(o.name)}</div>
  <div class="rk-nname"><b>${title}</b><span>${esc(a.name)}</span></div>
  <div class="rk-pts"><small>Điểm bậc</small><b>${o.pts}</b></div>
  <button class="rk-cont btn yellow">Tiếp tục</button>`;
    document.body.appendChild(over);
    const pts = $('.rk-pts b', over), t0 = performance.now();
    // Điểm chạy từ số cũ tới số mới trong lúc huy hiệu biến hình.
    timers.push(setTimeout(() => { over.dataset.stage = '2'; TD.audio && TD.audio.play(up ? 'Play_UI_Win' : 'Play_UI_Lose'); }, 1400));
    timers.push(setTimeout(() => { over.dataset.stage = '3'; }, 2300));
    (function tick() {
      if (!over) return;
      const k = Math.min(1, Math.max(0, (performance.now() - t0 - 1400) / 900));
      pts.textContent = Math.round(o.pts + (a.pts - o.pts) * k);
      if (k < 1) requestAnimationFrame(tick);
    })();
    $('.rk-cont', over).onclick = () => { click(); clearOver(); };
  }

  TD.racePlugins = TD.racePlugins || [];
  R.plugin = {
    start() { pending = null; clearOver(); },
    settle(F, ctx) {
      if (!ctx.R.mode.ranked || !TD.RANK) return;
      const n = ctx.R.karts.length, res = TD.RANK.settle(TD.save.d, ctx.me.place, n, F.dnf, new Date());
      F.rank = res;
      F.cards.push(card(res, ctx.me.place, n, F.dnf));
      pending = res.promoted || res.demoted || res.failed ? res : null;
    },
    // Màn thăng/hạ cấp chờ bảng kết quả hiện (TD.main.resultShown) rồi mới phủ lên.
    update() {
      if (pending && TD.main.resultShown) { const r = pending; pending = null; playOver(r); }
    },
    end() { pending = null; clearOver(); },
  };
  TD.racePlugins.push(R.plugin);

  TD.ranked = R;
})(globalThis.TD = globalThis.TD || {});
