// Màn DOM: sảnh (chọn xe, tay đua, đường đua), màn tải, lớp phủ trong trận (băng rôn, chữ nảy, tạm dừng), kết quả.
// Sprite lấy từ art/ui (TD.UI, bóc từ atlas gốc); sprite có chữ Hoa của bản gốc (完美, 第1名, 挑战结束) không dùng,
// thay bằng chữ Việt vẽ bằng font Cafeta gốc.
(function (TD) {
  'use strict';
  const UI = { root: null };
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => TD.audio && TD.audio.play('Play_UI_Click');
  const STAT = [['speed', 'Tốc độ'], ['accel', 'Tăng tốc'], ['handling', 'Lái'], ['drift', 'Drift'], ['nitro', 'Nitro']];

  UI.init = function () {
    UI.root = document.getElementById('ui');
    UI.root.addEventListener('pointerdown', () => TD.audio.unlock(), { capture: true });
  };

  function show(html) { UI.root.innerHTML = html; UI.root.scrollTop = 0; }

  function statBars(c) {
    return STAT.map(([k, n]) => {
      const v = Math.max(0, Math.min(10, (c.stats && c.stats[k]) || 0));
      return `<div class="stat"><span>${n}</span><i><b style="width:${v * 10}%"></b></i></div>`;
    }).join('');
  }

  UI.lobby = function () {
    const d = TD.save.d, cars = Object.values(TD.CARS), tracks = Object.values(TD.TRACKS), T = TD.TRACKS[d.track];
    const car = TD.CARS[d.car];
    show(`
<div class="lobby">
  <div class="top">
    <div class="me"><div class="avatar">${d.driver === 'nu' ? '♀' : '♂'}</div><div><b>${esc(d.name)}</b><small>${d.races} trận · ${d.wins} lần về nhất</small></div></div>
    <div class="coins"><img src="art/ui/coin.png" alt=""> ${d.coins.toLocaleString('vi-VN')}</div>
    <button class="icon gear" data-act="settings" aria-label="Cài đặt">⚙</button>
  </div>
  <div class="carinfo">
    <h2>${esc(car.name)}</h2>
    ${statBars(car)}
    <div class="drivers">${Object.values(TD.DRIVERS).map((x) => `<button class="chip ${x.id === d.driver ? 'on' : ''}" data-driver="${x.id}">${esc(x.name)}</button>`).join('')}</div>
  </div>
  <div class="cars">${cars.map((c) => `<button class="card ${c.id === d.car ? 'on' : ''}" data-car="${c.id}"><span>${esc(c.name)}</span><em>${'★'.repeat(1 + Math.round(((c.stats.speed || 0) + (c.stats.accel || 0)) / 4))}</em></button>`).join('')}</div>
  <div class="trackpick">
    <button class="arrow" data-track="-1" aria-label="Đường trước">‹</button>
    <div class="trackcard" style="background-image:url('art/maps/${T.id}.jpg')">
      <div class="tname"><b>${esc(T.name)}</b><small>${T.laps} vòng · ${(T.length / 1000).toFixed(1)} km${d.best[T.id] ? ' · Kỷ lục ' + TD.fmtTime(d.best[T.id]) : ''}</small></div>
    </div>
    <button class="arrow" data-track="1" aria-label="Đường sau">›</button>
  </div>
  <button class="go" data-act="race"><span>ĐUA NGAY</span></button>
  <div class="keys">${TD.input.isTouch() ? 'Nút trái/phải để lái · DRIFT để trượt · nút lửa để phun' : '←/→ lái · Shift drift · Space phun · ↓ phanh · R về đường · Esc dừng'}</div>
</div>`);
    UI.root.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      click();
      if (b.dataset.car) { d.car = b.dataset.car; TD.save.save(); TD.main.showCar(d.car, d.driver); UI.lobby(); }
      else if (b.dataset.driver) { d.driver = b.dataset.driver; TD.save.save(); TD.main.showCar(d.car, d.driver); UI.lobby(); }
      else if (b.dataset.track) {
        const ids = tracks.map((t) => t.id), i = ids.indexOf(d.track);
        d.track = ids[(i + Number(b.dataset.track) + ids.length) % ids.length]; TD.save.save(); UI.lobby();
      } else if (b.dataset.act === 'race') { TD.audio.play('Play_UI_Confirm'); TD.main.startRace(); }
      else if (b.dataset.act === 'settings') UI.settings(() => UI.lobby());
    };
  };

  UI.settings = function (back) {
    const s = TD.save.d.settings;
    const row = (k, n) => `<label class="tog"><input type="checkbox" data-set="${k}" ${s[k] !== false ? 'checked' : ''}><span>${n}</span></label>`;
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="panel"><h3>Cài đặt</h3>${row('music', 'Nhạc nền')}${row('sfx', 'Âm thanh')}${row('shake', 'Rung màn hình')}
      <label class="name">Tên tay đua <input maxlength="14" value="${esc(TD.save.d.name)}" data-name></label>
      <button class="btn blue" data-close>Xong</button></div>`;
    UI.root.appendChild(wrap);
    wrap.addEventListener('change', (e) => {
      const k = e.target.dataset.set;
      if (k) { s[k] = e.target.checked; TD.save.save(); TD.audio.applySettings(); }
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

  UI.loading = function (T, p) {
    if (!$('.loading', UI.root)) {
      show(`<div class="loading" style="background-image:url('art/maps/${T.id}.jpg')"><div class="lbox"><b>${esc(T.name)}</b>
        <div class="bar"><i></i></div><small>Mẹo: thả drift rồi bấm phun ngay để có phun nhỏ. Drift đúng góc 35–50° ra "Hoàn hảo".</small></div></div>`);
      UI.root.onclick = null;
    }
    $('.loading .bar i', UI.root).style.width = Math.round(p * 100) + '%';
  };

  UI.race = function (T) {
    show(`<div class="race"><div class="intro"><small>ĐƯỜNG ĐUA</small><b>${esc(T.name)}</b></div>
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

  function rows(R, me) {
    const list = R.karts.slice().sort((a, b) => (a.place || 9) - (b.place || 9));
    return list.map((k) => {
      const done = k.st === 'finish' && k.finishT != null;
      const time = done ? (k.dnf ? 'Chưa về' : TD.fmtTime(k.finishT)) : '…';
      const best = k.stats.bestLap != null ? TD.fmtTime(k.stats.bestLap) : '--';
      const rankImg = k.place <= 5 ? `<img src="art/ui/${['', 'rank_1st', 'rank_2nd', 'rank_3rd', 'rank_4th', 'rank_5th'][k.place]}.png" alt="${k.place}">` : `<b class="n">${k.place}</b>`;
      return `<div class="row ${k === me ? 'me' : ''}">${rankImg}<span class="nm">${esc(k.name)}<small>${esc((TD.CARS[k.carId] || {}).name || '')}</small></span><span class="tm">${time}<small>Vòng nhanh ${best}</small></span></div>`;
    }).join('');
  }

  UI.result = function (R, me, o) {
    const d = TD.save.d;
    show(`<div class="result"><div class="panel res">
      <div class="head ${me.place === 1 ? 'gold' : ''}"><img src="art/ui/${me.place <= 3 ? 'cup_' + me.place : 'trophy_cup'}.png" alt=""><div><b>${me.place === 1 ? 'VỀ NHẤT!' : 'HẠNG ' + me.place}</b>
        <small>${esc(TD.TRACKS[R.trackId].name)} · ${TD.fmtTime(me.finishT)}${o.newRecord ? ' · <em>KỶ LỤC MỚI</em>' : ''}</small></div>
        <div class="gain"><img src="art/ui/coin.png" alt=""> +${o.reward}</div></div>
      <div class="rows">${rows(R, me)}</div>
      <div class="acts"><button class="btn yellow" data-r="again">ĐUA LẠI</button><button class="btn blue" data-r="lobby">VỀ SẢNH</button></div>
      <div class="sum">Drift ${me.stats.drifts} · Phun nhỏ ${me.stats.miniBoosts} · Nitro ${me.stats.nitros} · Va tường ${me.stats.wallHits} · Tổng xu ${d.coins.toLocaleString('vi-VN')}</div>
    </div></div>`);
    UI.root.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      click();
      if (b.dataset.r === 'again') TD.main.startRace(); else { TD.audio.play('Play_UI_Back'); TD.main.toLobby(); }
    };
  };

  UI.updateResult = function (R, me) {
    const box = $('.result .rows', UI.root);
    if (!box) return;
    const sig = R.karts.map((k) => k.place + ':' + (k.finishT || 0)).join(',');
    if (sig !== UI._sig) { UI._sig = sig; box.innerHTML = rows(R, me); }
  };

  TD.menu = UI;
})(globalThis.TD = globalThis.TD || {});
