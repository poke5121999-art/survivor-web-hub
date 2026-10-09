// Màn DOM: cài đặt, màn tải, lớp phủ trong trận (băng rôn, chữ nảy, tạm dừng), kết quả.
// Sprite lấy từ art/ui (TD.UI, bóc từ atlas gốc); sprite có chữ Hoa của bản gốc (完美, 第1名, 挑战结束) không dùng,
// thay bằng chữ Việt vẽ bằng font Cafeta gốc. Sảnh, chọn chế độ, ghép phòng ở js/ui/lobby.js.
(function (TD) {
  'use strict';
  const UI = { root: null };
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => TD.audio && TD.audio.play('Play_UI_Click');

  UI.init = function () {
    UI.root = document.getElementById('ui');
    UI.root.addEventListener('pointerdown', () => TD.audio.unlock(), { capture: true });
  };

  function show(html) { UI.root.innerHTML = html; UI.root.scrollTop = 0; }

  UI.settings = function (back) {
    const s = TD.save.d.settings;
    const row = (k, n) => `<label class="tog"><input type="checkbox" data-set="${k}" ${s[k] !== false ? 'checked' : ''}><span>${n}</span></label>`;
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="panel"><h3>Cài đặt</h3>${row('music', 'Nhạc nền')}${row('sfx', 'Âm thanh')}${row('shake', 'Rung màn hình')}
      <label class="tog"><input type="checkbox" data-hand ${s.hand === 'twoside' ? 'checked' : ''}><span>Nút cảm ứng hai bên</span></label>
      <label class="name">Tên tay đua <input maxlength="14" value="${esc(TD.save.d.name)}" data-name></label>
      <button class="btn blue" data-close>Xong</button></div>`;
    UI.root.appendChild(wrap);
    wrap.addEventListener('change', (e) => {
      const k = e.target.dataset.set;
      if (k) { s[k] = e.target.checked; TD.save.save(); TD.audio.applySettings(); }
      if (e.target.matches('[data-hand]')) { s.hand = e.target.checked ? 'twoside' : 'one'; TD.save.save(); if (TD.hud.inst) TD.hud.setTouch(TD.hud.touch); }
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) {
        e.stopPropagation();
        const n = wrap.querySelector('[data-name]').value.trim();
        if (n) TD.save.d.name = n;
        TD.save.save(); wrap.remove(); click(); back && back();
      }
    });
  };

  // Màn tải: ảnh đường, tên chế độ + đường, thẻ người chơi của trận (TD.lobby.loadingCards), thanh tiến độ.
  UI.loading = function (T, p) {
    if (!$('.loading', UI.root)) {
      const mode = TD.MODES[TD.save.d.mode] || TD.MODES.speed;
      show(`<div class="loading" style="background-image:url('art/maps/${T.id}.jpg')">
        <div class="ld-head"><small>${esc(mode.name)}</small><b>${esc(T.name)}</b><span>${T.laps} vòng · ${(T.length / 1000).toFixed(1)} km</span></div>
        ${TD.lobby ? TD.lobby.loadingCards(mode) : ''}
        <div class="lbox"><div class="bar"><i></i></div><small>Mẹo: thả drift rồi bấm phun ngay để có phun nhỏ. Drift đúng góc 35–50° ra "Hoàn hảo".</small>
        <small class="ld-keys">${TD.input.isTouch() ? 'Nút trái/phải để lái · DRIFT để trượt · nút lửa để phun' : '←/→ lái · Shift drift · Space phun · ↓ phanh · R về đường · Esc dừng'}</small></div></div>`);
      UI.root.onclick = null;
    }
    $('.loading .bar i', UI.root).style.width = Math.round(p * 100) + '%';
  };

  UI.race = function (T, mode) {
    show(`<div class="race"><div class="intro"><small>${esc(mode && mode.id !== 'speed' ? mode.name : 'ĐƯỜNG ĐUA')}</small><b>${esc(T.name)}</b></div>
      <div class="banner"></div><div class="pops"></div><button class="icon pause" data-act="pause" aria-label="Tạm dừng"><img src="art/ui/btn_pause.png" alt=""></button></div>`);
    UI.root.onclick = (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.act === 'pause') { click(); TD.input.pauseQ++; }
    };
    setTimeout(() => { const i = $('.intro', UI.root); if (i) i.classList.add('out'); }, 2300);
  };

  UI.banner = function (text, big) {
    const b = $('.race .banner', UI.root);
    if (!b) return;
    b.textContent = text; b.className = 'banner show' + (big ? ' big' : '');
    clearTimeout(UI._bt); UI._bt = setTimeout(() => { b.className = 'banner'; }, big ? 2600 : 1600);
  };

  const POP = { perfect: 'HOÀN HẢO', dual: 'PHUN ĐÔI', mini: 'PHUN NHỎ', n2o: '+1 NITRO' };
  UI.pop = function (kind, n) {
    const box = $('.race .pops', UI.root);
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'pop ' + kind;
    if (kind === 'rank') el.innerHTML = `<img src="art/ui/${['', 'rank_1st', 'rank_2nd', 'rank_3rd', 'rank_4th', 'rank_5th'][n] || 'rank_5th'}.png" alt="">`;
    else el.textContent = POP[kind] || kind;
    el.style.top = (box.children.length * 1.15) + 'em';
    box.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  };

  UI.pause = function (on) {
    const old = $('.modal.pausebox', UI.root);
    if (!on) { if (old) old.remove(); return; }
    if (old) return;
    const w = document.createElement('div');
    w.className = 'modal pausebox';
    w.innerHTML = `<div class="panel"><h3>Tạm dừng</h3><button class="btn yellow" data-p="resume">Tiếp tục</button>
      <button class="btn blue" data-p="restart">Đua lại</button><button class="btn gray" data-p="lobby">Về sảnh</button>
      <button class="btn gray" data-p="settings">Cài đặt</button></div>`;
    UI.root.appendChild(w);
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      e.stopPropagation(); click();
      const p = b.dataset.p;
      if (p === 'resume') { TD.main.paused = false; w.remove(); }
      else if (p === 'restart') { TD.main.paused = false; TD.audio.stopAll(); TD.main.startRace(); }
      else if (p === 'lobby') { TD.main.paused = false; TD.audio.play('Play_UI_Back'); TD.main.toLobby(); }
      else if (p === 'settings') UI.settings();
    });
  };

  // ---------- về đích (xem main.js finishStep) ----------
  const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
  const race$ = () => $('.race', UI.root);

  // Chữ GOAL! khi xe còn chạy (bản gốc vẽ chữ 3D dưới cổng đích, không có sprite).
  UI.goal = function (ok) {
    const r = race$();
    if (!r) return;
    const g = document.createElement('div');
    g.className = 'fin-goal' + (ok ? '' : ' dnf');
    g.textContent = ok ? 'GOAL!' : 'HẾT GIỜ';
    r.appendChild(g);
    setTimeout(() => g.remove(), 2200);
  };

  // Cận cảnh ăn mừng: bỏ nút tạm dừng/chữ nảy, hiện hạng, băng kỷ lục trượt từ trên, dải thống kê.
  UI.celebrate = function (F, me) {
    const r = race$();
    if (!r) return;
    for (const el of r.querySelectorAll('.pause, .pops, .banner, .intro')) el.style.display = 'none';
    const t = TD.fmtTime(me.finishT);
    const box = document.createElement('div');
    box.className = 'fin-cel';
    box.innerHTML = `
      <div class="fin-rank ${F.place <= 3 ? 'top' : ''}"><b>${ORD[F.place] || F.place + 'th'}</b></div>
      <div class="fin-rec"><b>${F.newRecord ? 'KỶ LỤC MỚI' : (F.dnf ? 'HẾT GIỜ' : 'HẠNG ' + F.place)}</b><span>${F.dnf ? '--:--.--' : t}</span></div>
      <div class="fin-strip">
        <div><small>Drift</small><b>${F.stats.drifts}</b></div>
        <div><small>Phun</small><b>${F.stats.boosts}</b></div>
        <div><small>Va chạm</small><b>${F.stats.hits}</b></div>
        <div><small>Tốc độ TB</small><b>${F.stats.avg.toFixed(1)}</b><i>km/h</i></div>
      </div>`;
    r.appendChild(box);
  };
  UI.celebrateEnd = function () { const c = $('.fin-cel', UI.root); if (c) c.classList.add('out'); };

  const pct = (l) => Math.round(100 * l.into / l.need);
  function rows(R, me) {
    const F = UI._fin;
    const list = R.karts.slice().sort((a, b) => (a.place || 9) - (b.place || 9));
    return list.map((k) => {
      // k.st có thể rời 'finish' (xe đứng sau về đích bị hồi sinh); finishT mới là dấu hiệu đã về.
      const time = k.finishT != null && !k.dnf ? TD.fmtTime(k.finishT) : '<em class="dnf">Chưa về</em>';
      const st = k.stats, mine = k === me;
      const rankImg = k.place <= 3 ? `<img src="art/ui/rank_big_${k.place}.png" alt="${k.place}">` : `<b class="n">${k.place}</b>`;
      const rec = mine && F && F.newRecord ? '<img class="newrec" src="art/ui/result_new_record.png" alt="Kỷ lục mới">' : '';
      return `<div class="row ${mine ? 'me' : ''}${k.team != null ? ' team' + k.team : ''}"><span class="rk">${rankImg}</span><span class="nm">${esc(k.name)}<small>${esc((TD.CARS[k.carId] || {}).name || '')}</small></span>` +
        `<span class="tm">${rec}${time}</span><span class="c">${st.drifts}</span><span class="c">${st.miniBoosts + st.nitros}</span><span class="c">${mine && F ? F.stats.hits : st.wallHits}</span></div>`;
    }).join('');
  }

  // Thẻ thưởng (chạm để tiếp tục) rồi bảng xếp hạng. Cả hai dựng sẵn trong một nút gốc .result; data-stage chọn lớp hiện.
  UI.result = function (R, me, F) {
    const d = TD.save.d, T = TD.TRACKS[R.trackId];
    UI._fin = F; UI._stage = 'card'; UI._cardT = 0; UI._sig = null;
    const lb = F.lvBefore, la = F.lvAfter;
    const from = F.levelUp ? 0 : pct(lb), to = pct(la);
    show(`<div class="result fin" data-stage="card">
  <div class="fin-cardlayer">
    <div class="fin-congrats">CHÚC MỪNG!</div>
    <div class="fin-cards">
      <div class="fin-card">
        <h4>${esc(d.name)}</h4>
        <div class="fin-avatar">${d.driver === 'nu' ? '♀' : '♂'}</div>
        <div class="fin-gain">+${F.xp}</div>
        <div class="fin-lv"><span>LV.${la.lv}</span><div class="fin-bar"><i data-to="${to}" style="width:${from}%"></i></div><em>${la.into}/${la.need}</em></div>
        <small>XP · hạng ${F.place}</small>
        ${F.levelUp ? `<div class="fin-up"><b>LEVEL UP</b><span>Lv.${lb.lv} → Lv.${la.lv}</span></div>` : ''}
      </div>
      ${(F.cards || []).join('')}
      <div class="fin-card">
        <h4>Xu</h4>
        <img class="fin-coin" src="art/ui/coin.png" alt="">
        <div class="fin-gain">+${F.reward}</div>
        <small>Tổng ${d.coins.toLocaleString('vi-VN')}</small>
      </div>
    </div>
    <div class="fin-hint">Chạm để tiếp tục</div>
  </div>
  <div class="fin-table panel">
    <div class="fin-title"><b>${esc(T.name)}</b>${F.team ? `<span class="fin-team">${TD.TEAMS.map((t, i) => `<i class="team${i}">${t.name} ${F.team.pts[i]}</i>`).join(' · ')} · <em>${F.team.win === me.team ? 'ĐỘI THẮNG' : 'ĐỘI THUA'}</em></span>` : ''}<span>${F.dnf ? 'Hết giờ' : 'Hạng ' + F.place + ' · ' + TD.fmtTime(me.finishT)}${F.newRecord ? ' · <em>KỶ LỤC MỚI</em>' : ''}${F.levelUp ? ' · <em>LEVEL UP Lv.' + la.lv + '</em>' : ''}</span></div>
    <div class="fin-cols"><span>Hạng</span><span>Tên</span><span>Thời gian</span><span>Drift</span><span>Phun</span><span>Va chạm</span></div>
    <div class="rows">${rows(R, me)}</div>
    <div class="acts"><button class="btn yellow" data-r="again">ĐUA LẠI</button><button class="btn blue" data-r="lobby">VỀ SẢNH</button></div>
  </div>
</div>`);
    // Thanh XP chạy từ mức cũ lên mức mới sau khi thẻ hiện.
    setTimeout(() => { const i = $('.fin-bar i', UI.root); if (i) i.style.width = i.dataset.to + '%'; }, 500);
    UI.root.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (b) {
        click();
        if (b.dataset.r === 'again') TD.main.startRace(); else { TD.audio.play('Play_UI_Back'); TD.main.toLobby(); }
      } else if (UI._stage === 'card') { click(); UI._advance(); }
    };
  };

  UI._advance = function () {
    if (UI._stage !== 'card') return;
    UI._stage = 'table';
    const r = $('.result', UI.root);
    if (r) r.dataset.stage = 'table';
    TD.main.resultShown = true;
  };
  // Không chạm thì thẻ tự qua bảng sau 8 s mô phỏng (tính theo dt của trận để bài kiểm tua nhanh vẫn chạy).
  UI.tickResult = function (dt) {
    if (UI._stage !== 'card' || !$('.result', UI.root)) return;
    UI._cardT += dt;
    if (UI._cardT > 8) UI._advance();
  };

  UI.updateResult = function (R, me) {
    const box = $('.result .rows', UI.root);
    if (!box) return;
    const sig = R.karts.map((k) => k.place + ':' + (k.finishT || 0)).join(',');
    if (sig !== UI._sig) { UI._sig = sig; box.innerHTML = rows(R, me); }
  };

  TD.menu = UI;
})(globalThis.TD = globalThis.TD || {});
