// X.Hạng-Tốc Độ: sảnh xếp hạng (huy hiệu bậc, sao, điểm, lịch sử), thẻ kết quả trận và màn thăng/hạ cấp.
// Chuỗi tiếng Việt lấy từ Localization_VN_Base: Điểm bậc 23e2e815, Bậc cao nhất 649dcad1, Thắng liên tục e11a27c3,
// Tăng cấp thành công aab732ea, Hạ cấp 27bbb90d, Sao 4e337bc5.
(function (TD) {
  'use strict';
  const R = {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => TD.audio && TD.audio.play('Play_UI_Click');
  const SEASON = 'Mùa giải S1';   // chọn: APK chỉ có chuỗi mùa S1/S2 gốc, bản web chạy một mùa duy nhất

  const stars = (r) => r.maxStars ? `<div class="rk-stars" aria-label="${r.stars} sao">${Array.from({ length: r.maxStars }, (_, i) => `<i class="${i < r.stars ? 'on' : ''}">★</i>`).join('')}</div>` : '';
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

  function histRows(h) {
    if (!h.length) return '<div class="rk-empty">Chưa có trận nào</div>';
    return h.map((x) => `<div class="rk-h ${x.d > 0 ? 'up' : x.d < 0 ? 'dn' : ''}"><span>${x.place ? 'Hạng ' + x.place + '/' + x.n : 'Hết giờ'}</span><em>${signed(x.s)} ★</em><b>${signed(x.d)}</b></div>`).join('');
  }

  // ---------- sảnh xếp hạng ----------
  R.show = function () {
    const d = TD.save.d, rk = d.rank, cur = TD.RANK.of(rk.pts), best = TD.RANK.of(rk.best);
    const bar = cur.top ? 100 : Math.round(cur.inSub / cur.subW * 100);
    const root = document.getElementById('ui');
    root.innerHTML = `<div class="rk">
  <button class="rk-back btn gray" data-act="back" aria-label="Về sảnh">‹ Về sảnh</button>
  <div class="rk-title"><b>X.Hạng-Tốc Độ</b><small>${SEASON}</small></div>
  <div class="rk-main">
    <div class="rk-hero">
      <img class="rk-badge" src="${cur.badge}" alt="${esc(cur.tierName)}">
      <h2>${esc(cur.name)}</h2>
      ${stars(cur)}
      <div class="rk-prog"><i style="width:${bar}%"></i></div>
      <small class="rk-next">${cur.top ? 'Bậc cao nhất' : 'Còn ' + cur.toNext + ' điểm lên ' + esc(cur.nextName)}</small>
    </div>
    <div class="rk-side panel">
      <div class="rk-stat"><span>Điểm bậc</span><b>${rk.pts}</b></div>
      <div class="rk-stat"><span>Bậc cao nhất</span><b>${esc(best.name)}</b></div>
      <div class="rk-stat"><span>Thắng liên tục</span><b>${rk.streak}</b></div>
      <div class="rk-stat"><span>Số trận · thắng</span><b>${rk.games} · ${rk.wins}</b></div>
      <div class="rk-hist">${histRows(rk.hist || [])}</div>
    </div>
  </div>
  <button class="rk-go btn yellow" data-act="race">THI ĐẤU</button>
</div>`;
    root.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      click();
      if (b.dataset.act === 'back') (TD.lobby && TD.lobby.show) ? TD.lobby.show() : TD.main.toLobby();
      else {
        const ids = Object.keys(TD.TRACKS);
        d.track = ids[(Math.random() * ids.length) | 0];   // chọn: đường ngẫu nhiên mỗi trận như ghép trận xếp hạng gốc
        TD.main.startRace({ mode: 'ranked' });
      }
    };
  };

  // ---------- thẻ kết quả trong màn thưởng ----------
  function card(res, place, n, dnf) {
    const a = res.after, tag = res.promoted ? 'Tăng cấp!' : res.demoted ? 'Hạ cấp' : res.subUp ? 'Lên bậc ' + a.subLabel : res.subDown ? 'Xuống bậc ' + a.subLabel : '';
    return `<div class="fin-card rk-card ${res.stars > 0 ? 'up' : res.stars < 0 ? 'dn' : ''}">
        <h4>X.Hạng · ${dnf ? 'hết giờ' : 'hạng ' + place + '/' + n}</h4>
        <img class="rk-cardbadge" src="${a.badge}" alt="${esc(a.tierName)}">
        <div class="fin-gain">${signed(res.stars)} ★</div>
        <small>${esc(a.name)} · ${a.pts} điểm${res.streak >= 2 ? ' · thắng liên tục ' + res.streak : ''}</small>
        ${tag ? `<div class="rk-tag">${tag}</div>` : ''}
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
    over = document.createElement('div');
    over.className = 'rk-over ' + (up ? 'up' : 'dn');
    over.dataset.stage = '1';
    over.innerHTML = `<div class="rk-ray"></div>
  <div class="rk-stage">
    <img class="rk-old" src="${o.badge}" alt="${esc(o.tierName)}">
    <img class="rk-new" src="${a.badge}" alt="${esc(a.tierName)}">
  </div>
  <div class="rk-oname">${esc(o.name)}</div>
  <div class="rk-nname"><b>${up ? 'Tăng cấp thành công' : 'Hạ cấp'}</b><span>${esc(a.name)}</span></div>
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
      const n = ctx.R.karts.length, res = TD.RANK.settle(TD.save.d, ctx.me.place, n, F.dnf);
      F.rank = res;
      F.cards.push(card(res, ctx.me.place, n, F.dnf));
      pending = res.promoted || res.demoted ? res : null;
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
