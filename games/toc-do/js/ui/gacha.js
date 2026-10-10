// Xưởng: chế tạo (gacha) một người chơi (nhánh Xưởng). Bố cục theo clip 1KS1R0ZWQz4 t=0 / t=133: ba mẫu chọn ở trên,
// nút "Chế tạo 1 lần / 10 lần", màn "Nhận được" có tia sáng theo độ hiếm. Ảnh hiệu ứng lấy từ effects/fx_ui/og_unrealgaragedlg_v36
// (chouzhong = lúc quay, get = lúc nhận) của APK qua tools/export_gacha.py -> art/gacha.
// Bản gốc có bảng xác suất và tên mẫu trên máy chủ (không nằm trong APK): mọi con số dưới đây là chọn, ghi `chọn:`.
// Chữ gốc dùng lại: "Chế tạo", "Nhận được", "Chạm vị trí bất kỳ để tiếp tục", "Cực Phẩm", "Mảnh".
// Phần lõi (roll / pull / norm) không đụng DOM nên chạy được trong Node (test/toc-do-gacha.js).
(function (TD) {
  'use strict';
  const X = TD.gacha = {};
  const A = 'art/gacha/';

  // Độ hiếm: mảnh nhận khi trùng. chọn: Thường 5, Hiếm 20, Cực Phẩm 80; 50 mảnh đổi 1 vé nên một Cực Phẩm trùng ≈ 1,6 vé.
  X.TIERS = [
    { id: 'n', name: 'Thường', color: '#9fb4d0', shards: 5 },
    { id: 'r', name: 'Hiếm', color: '#4aa8ff', shards: 20 },
    { id: 'e', name: 'Cực Phẩm', color: '#ffb52e', shards: 80 },
  ];
  // Mẫu chế tạo (blueprint). rates = xác suất Thường/Hiếm/Cực Phẩm. chọn: mẫu xe khó ra Cực Phẩm nhất vì phần thưởng đắt nhất.
  X.POOLS = [
    { id: 'car', name: 'Mẫu Xe Đua', sub: 'Xe mới cho Gara', rates: [0.72, 0.24, 0.04], art: 'light_00003_6' },
    { id: 'gear', name: 'Mẫu PET & Thời Trang', sub: 'Thú cưng, bộ đồ tay đua', rates: [0.66, 0.28, 0.06], art: 'light_00003_3' },
    { id: 'mat', name: 'Mẫu Vật Liệu', sub: 'Xu, Mảnh, Vé Chế Tạo', rates: [0.75, 0.2, 0.05], art: 'light_00003_2' },
  ];
  X.HARD = 30;              // chọn: lần chế tạo thứ 30 kể từ Cực Phẩm trước chắc chắn ra Cực Phẩm (mỗi mẫu đếm riêng)
  X.TEN_GUARD = 1;          // chọn: lượt 10 lần luôn có ít nhất một món Hiếm trở lên
  X.COIN = 1200;            // chọn: xu cho một lần ≈ 4–8 trận thưởng (300/220/160… xu một trận)
  X.COIN10 = 10800;         // chọn: 10 lần giảm 10%
  X.SHARD_TICKET = 50;      // chọn: 50 mảnh đổi 1 vé
  X.START_TICKETS = 3;      // chọn: vé tặng lần đầu mở bản lưu, đủ thử một lượt 1 lần và vài lần nữa
  const HIST = 30;
  // Vật liệu: kỳ vọng ≈ 700 xu mỗi lần, thấp hơn 1200 xu giá chế tạo nên không đổi xu lấy xu được.
  const MAT = [
    [{ kind: 'coins', n: 300 }, { kind: 'shards', n: 10 }],
    [{ kind: 'coins', n: 1200 }, { kind: 'shards', n: 40 }],
    [{ kind: 'coins', n: 5000 }, { kind: 'shards', n: 150 }, { kind: 'tickets', n: 3 }],
  ];

  const save = () => TD.save.d;
  const fresh = () => ({ tickets: X.START_TICKETS, shards: 0, pity: { car: 0, gear: 0, mat: 0 }, n: 0, history: [] });
  const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  X.norm = function (o) {
    const g = o.gacha;
    if (!g || typeof g !== 'object') { o.gacha = fresh(); return; }
    const pity = {};
    for (const p of X.POOLS) pity[p.id] = int(g.pity && g.pity[p.id], 0, X.HARD - 1);
    o.gacha = { tickets: int(g.tickets, 0, 9999), shards: int(g.shards, 0, 99999), pity, n: int(g.n, 0, 1e7),
      history: (Array.isArray(g.history) ? g.history : []).filter((h) => typeof h === 'string' && /^[a-z]+:[\w.-]+:[0-2]$/.test(h)).slice(0, HIST) };
  };
  TD.save.norms.push(X.norm);
  const st = () => { const d = save(); if (!d.gacha) X.norm(d); return d.gacha; };
  X.state = st;

  // ---------- kho phần thưởng ----------
  // Xe theo hạng Gara: S = Cực Phẩm, A = Hiếm, B/C = Thường.
  const carTier = (id) => { const c = TD.garage ? TD.garage.classOf(id) : 'C'; return c === 'S' ? 2 : c === 'A' ? 1 : 0; };
  const outTier = (o) => (o.price >= 3600 ? 2 : o.price >= 2600 ? 1 : 0);   // chọn: theo giá bộ ở Thời Trang
  // -> [[item]] theo độ hiếm. Mỗi mô-đun (xe, PET, thời trang) có thì mới vào kho; tầng trống thì rơi về xu.
  X.items = function (poolId) {
    const t = [[], [], []];
    if (poolId === 'car') {
      for (const id of Object.keys(TD.CARS)) t[carTier(id)].push({ kind: 'car', id });
    } else if (poolId === 'gear') {
      if (TD.pet && TD.PETS) for (const p of TD.PETS) t[p.rarity].push({ kind: 'pet', id: p.id });
      if (TD.fashion && TD.OUTFITS) for (const o of Object.values(TD.OUTFITS)) if (o.kind === 'bo' && o.price > 0) t[outTier(o)].push({ kind: 'outfit', id: o.id });
    } else {
      MAT.forEach((l, i) => l.forEach((m) => t[i].push({ kind: m.kind, id: m.kind, n: m.n })));
    }
    t.forEach((l, i) => { if (!l.length) l.push({ kind: 'coins', id: 'coins', n: MAT[i][0].n }); });
    return t;
  };

  // ---------- quay ----------
  // rng: () => [0,1). Trả { tier, item } và cập nhật pity của mẫu trong s (= bản lưu gacha).
  X.roll = function (poolId, rng, s, minTier) {
    const pool = X.POOLS.find((p) => p.id === poolId);
    s.pity[poolId]++;
    let tier;
    if (s.pity[poolId] >= X.HARD) tier = 2;
    else { const r = rng(); tier = r < pool.rates[2] ? 2 : r < pool.rates[2] + pool.rates[1] ? 1 : 0; }
    if (minTier && tier < minTier) tier = minTier;
    if (tier === 2) s.pity[poolId] = 0;
    const list = X.items(poolId)[tier];
    return { tier, item: list[Math.floor(rng() * list.length) % list.length] };
  };

  // Trao một món: xe/bộ đồ trùng đổi thành mảnh, PET trùng do pet.js hoàn xu. -> chi tiết hiển thị.
  X.grant = function (item, tier) {
    const d = save(), g = st(), T = X.TIERS[tier];
    const out = { kind: item.kind, id: item.id, tier, isNew: true, shards: 0, coins: 0, tickets: 0 };
    if (item.kind === 'car') {
      out.name = TD.CARS[item.id].name;
      if (TD.garage.owns(item.id)) { out.isNew = false; out.shards = T.shards; }
      else { d.owned = TD.garage.ownedIds().concat(item.id); }
    } else if (item.kind === 'pet') {
      out.name = TD.pet.def(item.id).name;
      const r = TD.pet.grant(item.id);
      out.isNew = r.isNew; out.coins = r.refund || 0;
    } else if (item.kind === 'outfit') {
      out.name = TD.OUTFITS[item.id].name;
      out.isNew = TD.fashion.grant(item.id);
      if (!out.isNew) out.shards = T.shards;
    } else if (item.kind === 'coins') { out.name = item.n.toLocaleString('vi-VN') + ' xu'; out.coins = item.n; out.isNew = false; }
    else if (item.kind === 'shards') { out.name = item.n + ' Mảnh'; out.shards = item.n; out.isNew = false; }
    else { out.name = item.n + ' Vé Chế Tạo'; out.tickets = item.n; out.isNew = false; }
    d.coins += out.coins; g.shards = int(g.shards + out.shards, 0, 99999); g.tickets = int(g.tickets + out.tickets, 0, 9999);
    return out;
  };

  X.cost = (n) => ({ tickets: n, coins: n === 10 ? X.COIN10 : X.COIN * n });
  // Dùng vé nếu đủ, không thì xu. -> { ok, results, paid: 'vé'|'xu', spent } hoặc { ok: false, why }
  X.pull = function (poolId, n, rng) {
    const d = save(), g = st(), c = X.cost(n);
    rng = rng || Math.random;
    if (!X.POOLS.some((p) => p.id === poolId)) return { ok: false, why: 'không có mẫu này' };
    let paid;
    if (g.tickets >= c.tickets) { g.tickets -= c.tickets; paid = 'vé'; }
    else if (d.coins >= c.coins) { d.coins -= c.coins; paid = 'xu'; }
    else return { ok: false, why: 'không đủ vé và xu: cần ' + c.tickets + ' vé hoặc ' + c.coins.toLocaleString('vi-VN') + ' xu' };
    const rolls = [];
    for (let i = 0; i < n; i++) rolls.push(X.roll(poolId, rng, g, n === 10 && i === 9 && X.TEN_GUARD && !rolls.some((r) => r.tier >= 1) ? 1 : 0));
    const results = rolls.map((r) => X.grant(r.item, r.tier));
    g.n += n;
    g.history = results.map((r) => r.kind + ':' + r.id + ':' + r.tier).reverse().concat(g.history).slice(0, HIST);
    TD.save.save();
    return { ok: true, results, paid, spent: paid === 'vé' ? c.tickets : c.coins };
  };
  X.exchange = function () {
    const g = st();
    if (g.shards < X.SHARD_TICKET) return { ok: false, why: 'cần ' + X.SHARD_TICKET + ' Mảnh để đổi 1 vé' };
    g.shards -= X.SHARD_TICKET; g.tickets++;
    TD.save.save();
    return { ok: true };
  };
  X.untilHard = (poolId) => X.HARD - st().pity[poolId];

  // ---------- vé từ trận ----------
  // chọn: mỗi trận về đích 1 vé, lên bục (hạng ≤ 3) thêm 1; luyện tập và bỏ cuộc không có.
  X.ticketsFor = (place, dnf, practice) => (dnf || practice ? 0 : place <= 3 ? 2 : 1);
  TD.racePlugins.push({
    settle(F) {
      const n = X.ticketsFor(F.place, F.dnf, F.mode && F.mode.practice);
      if (!n) return;
      st().tickets = int(st().tickets + n, 0, 9999);
      F.cards.push(`<div class="fin-card"><h4>Xưởng</h4><div class="fin-gain">+${n} Vé Chế Tạo</div><small>Mở Xưởng ở sảnh để dùng</small></div>`);
    },
  });

  if (typeof document === 'undefined') return;

  // ================= giao diện =================
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const sfx = (e) => TD.audio && TD.audio.play(e);
  const root = () => document.getElementById('ui');
  const coinImg = '<img src="art/ui/coin.png" alt="">';
  const S = { pool: 'car', open: false, msg: '', msgT: 0, ov: null, timers: [], showing: null };

  function icon(r) {
    if (r.kind === 'pet') return `<img class="gx-ic" src="art/pets/icon_${r.id}.webp" alt="">`;
    if (r.kind === 'outfit') return `<img class="gx-ic" src="art/outfits/${r.id}.webp" alt="" onerror="this.outerHTML='<span class=&quot;gx-ic gx-cls&quot;>Bộ</span>'">`;
    if (r.kind === 'coins') return `<img class="gx-ic" src="art/ui/coin.png" alt="">`;
    if (r.kind === 'car') return `<span class="gx-ic gx-cls">${TD.garage.classOf(r.id)}</span>`;
    return `<span class="gx-ic gx-tk ${r.kind}">${r.kind === 'shards' ? '◆' : 'VÉ'}</span>`;
  }
  const kindName = { car: 'Xe', pet: 'PET', outfit: 'Bộ đồ', coins: 'Xu', shards: 'Mảnh', tickets: 'Vé' };

  function card(r, extra) {
    const T = X.TIERS[r.tier];
    const note = r.kind === 'car' || r.kind === 'outfit' || r.kind === 'pet'
      ? (r.isNew ? '<em class="gx-new">Mới</em>' : r.coins ? `<em class="gx-dup">Trùng +${fmt(r.coins)} xu</em>` : `<em class="gx-dup">Trùng +${r.shards} Mảnh</em>`) : '';
    return `<div class="gx-card t${r.tier}${extra || ''}" style="--c:${T.color}">${icon(r)}<b>${esc(r.name)}</b><small>${T.name} · ${kindName[r.kind]}</small>${note}</div>`;
  }

  // ---------- màn chính ----------
  function rateRows(p) {
    return X.TIERS.map((t, i) => `<div class="gx-rate" style="--c:${t.color}"><span>${t.name}</span><b>${(p.rates[i] * 100).toFixed(p.rates[i] * 100 % 1 ? 1 : 0).replace('.', ',')}%</b></div>`).join('');
  }
  const nameOf = (it) => it.kind === 'car' ? TD.CARS[it.id].name : it.kind === 'pet' ? TD.pet.def(it.id).name : it.kind === 'outfit' ? TD.OUTFITS[it.id].name
    : it.kind === 'coins' ? fmt(it.n) + ' xu' : it.kind === 'shards' ? it.n + ' Mảnh' : it.n + ' Vé';
  function topList(p) {
    const items = X.items(p.id)[2];
    return items.slice(0, 6).map((it) => `<span class="gx-chip">${icon(it)}<i>${esc(nameOf(it))}</i></span>`).join('')
      + (items.length > 6 ? `<span class="gx-chip more">+${items.length - 6}</span>` : '');
  }
  // Lịch sử lưu dạng 'loại:id:độ hiếm'; món đã bị gỡ khỏi dữ liệu thì bỏ qua.
  function histList() {
    return st().history.slice(0, 10).map((h) => {
      const [kind, id, tier] = h.split(':');
      const it = { kind, id };
      try { if (kind === 'car' ? !TD.CARS[id] : kind === 'pet' ? !(TD.pet && TD.pet.def(id)) : kind === 'outfit' ? !(TD.OUTFITS && TD.OUTFITS[id]) : false) return ''; } catch (e) { return ''; }
      const label = kind === 'coins' || kind === 'shards' || kind === 'tickets' ? kindName[kind] : nameOf(it);
      return `<span class="gx-chip" style="--c:${X.TIERS[tier].color}">${icon(it)}<i>${esc(label)}</i></span>`;
    }).join('');
  }
  function btnCost(n) {
    const c = X.cost(n), g = st();
    return g.tickets >= c.tickets ? `<span class="gx-cost">VÉ ${c.tickets}</span>` : `<span class="gx-cost">${coinImg}${fmt(c.coins)}</span>`;
  }
  function draw() {
    const g = st(), d = save(), pool = X.POOLS.find((p) => p.id === S.pool);
    const left = X.untilHard(pool.id);
    root().innerHTML = `<div class="gr gx">
      <div class="gtop"><button class="gback" data-do="back" aria-label="Về sảnh">‹</button>
        <div class="pt-title"><b>Xưởng</b><small>Chế tạo ${fmt(g.n)} lần</small></div>
        <div class="gx-res" aria-label="Vé Chế Tạo"><b class="gx-tk tickets">VÉ</b><span>${fmt(g.tickets)}</span></div>
        <div class="gx-res" aria-label="Mảnh"><b class="gx-tk shards">◆</b><span>${fmt(g.shards)}</span></div>
        <div class="gcoins" aria-label="Xu">${coinImg}<b>${fmt(d.coins)}</b></div></div>
      <div class="gx-pools">${X.POOLS.map((p) => `<button class="gx-pool${p.id === S.pool ? ' on' : ''}" data-pool="${p.id}">
        <img class="gx-pfx" src="${A}fx_${p.art}.webp" alt=""><b>${esc(p.name)}</b><small>${esc(p.sub)}</small>
        <i class="gx-pp" aria-hidden="true"><u style="width:${(g.pity[p.id] / X.HARD) * 100}%"></u></i></button>`).join('')}</div>
      <div class="gx-stage gpanel">
        <div class="gx-info"><h3>Tỉ lệ nhận</h3>${rateRows(pool)}
          <p class="gnote">Chắc chắn có ${X.TIERS[2].name} sau ${X.HARD} lần chưa ra: còn <b>${left}</b> lần. Mỗi lượt 10 lần có ít nhất một món Hiếm.</p></div>
        <div class="gx-top"><h3>${X.TIERS[2].name} trong mẫu</h3><div class="gx-chips">${topList(pool)}</div></div>
        ${g.history.length ? `<div class="gx-hist"><h3>Vừa nhận</h3><div class="gx-chips">${histList()}</div></div>` : ''}
      </div>
      <div class="gx-act">
        <button class="gbtn gray gx-ex" data-do="ex" ${g.shards < X.SHARD_TICKET ? 'disabled' : ''}>Đổi ${X.SHARD_TICKET} Mảnh<br><small>lấy 1 Vé</small></button>
        <button class="gbtn blue gx-go" data-do="p1">Chế tạo 1 lần${btnCost(1)}</button>
        <button class="gbtn gold gx-go" data-do="p10">Chế tạo 10 lần${btnCost(10)}</button>
      </div>
      ${S.msg ? `<div class="gmsg">${esc(S.msg)}</div>` : ''}</div>`;
  }
  function say(t) {
    S.msg = t; clearTimeout(S.msgT);
    S.msgT = setTimeout(() => { S.msg = ''; if (S.open && !S.ov) draw(); }, 2400);
  }

  // ---------- màn nhận ----------
  const later = (fn, ms) => { S.timers.push(setTimeout(fn, ms)); };
  function closeOv() {
    S.timers.forEach(clearTimeout); S.timers = [];
    if (S.ov) S.ov.remove();
    S.ov = null;
    restoreCar();
    if (S.open) draw();
  }
  // Một lần nhận xe: trưng chính chiếc xe ở sảnh sau lớp sáng (cảnh 3D của sảnh vẫn chạy sau #ui).
  function showCar(id) {
    if (!TD.main || !TD.main.showCar) return;
    S.showing = id;
    TD.main.showCar(id, save().driver);
  }
  function restoreCar() {
    if (!S.showing) return;
    S.showing = null;
    TD.main.showCar(save().car, save().driver);
  }
  function reveal(res) {
    const best = Math.max(...res.results.map((r) => r.tier)), T = X.TIERS[best], one = res.results.length === 1;
    const ov = S.ov = document.createElement('div');
    ov.className = 'gx-ov' + (one ? ' one' : ' ten');
    ov.style.setProperty('--c', T.color);
    const fx = (cls, tex) => `<i class="gx-fx ${cls}" style="--t:url(../${A}fx_${tex}.webp)"></i>`;
    ov.innerHTML = `<div class="gx-fxs">${fx('glow', 'glow_00011_12')}${fx('beam', 'glow_09604_1_clamp')}${fx('star', 'light_00003_6')}${fx('spark', 'noise_00023_1')}</div>
      <h2 class="gx-title"></h2>
      <div class="gx-cards">${res.results.map((r, i) => card(r, '').replace('gx-card', 'gx-card hid').replace('style="', `style="--i:${i};`)).join('')}</div>
      <p class="gx-tip"></p>`;
    root().appendChild(ov);
    const title = ov.querySelector('.gx-title'), tip = ov.querySelector('.gx-tip');
    title.textContent = 'Đang chế tạo…';
    ov.classList.add('charge');
    sfx('Play_UI_Click');
    const cards = [...ov.querySelectorAll('.gx-card')];
    let shown = 0;
    const showCard = () => {
      if (shown >= cards.length) return;
      const c = cards[shown++];
      c.classList.remove('hid'); c.classList.add('in');
      sfx(c.classList.contains('t2') ? 'Play_UI_Win' : 'Play_UI_Confirm');
      if (one && res.results[0].kind === 'car') showCar(res.results[0].id);
    };
    const finish = () => {
      S.timers.forEach(clearTimeout); S.timers = [];
      while (shown < cards.length) showCard();
      ov.classList.add('done');
      title.textContent = best === 2 ? 'Nhận vật phẩm Cực Phẩm' : 'Nhận được';
      tip.textContent = 'Chạm vị trí bất kỳ để tiếp tục';
    };
    later(() => {
      ov.classList.remove('charge'); ov.classList.add('burst');
      title.textContent = best === 2 ? 'Nhận vật phẩm Cực Phẩm' : 'Nhận được';
      const step = one ? 0 : 230;
      cards.forEach((_, i) => later(showCard, i * step));
      later(() => { ov.classList.add('done'); tip.textContent = 'Chạm vị trí bất kỳ để tiếp tục'; }, cards.length * step + 500);
    }, one ? 1300 : 1500);
    ov.onclick = () => { if (ov.classList.contains('done')) closeOv(); else finish(); };
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled || S.ov) return;
    sfx('Play_UI_Click');
    if (b.dataset.pool) { S.pool = b.dataset.pool; return draw(); }
    const act = b.dataset.do;
    if (act === 'back') return X.leave();
    if (act === 'ex') { const r = X.exchange(); say(r.ok ? 'Đã đổi 1 Vé Chế Tạo' : r.why[0].toUpperCase() + r.why.slice(1)); return draw(); }
    const n = act === 'p10' ? 10 : 1, r = X.pull(S.pool, n);
    if (!r.ok) { say(r.why[0].toUpperCase() + r.why.slice(1)); return draw(); }
    draw();
    reveal(r);
  }
  function onKey(ev) {
    if (!S.open || ev.code !== 'Escape') return;
    if (S.ov) closeOv(); else X.leave();
  }

  X.open = function () {
    S.open = true; S.msg = '';
    root().onclick = onClick;
    draw();
  };
  X.leave = function () {
    S.open = false; S.msg = ''; clearTimeout(S.msgT);
    S.timers.forEach(clearTimeout); S.timers = []; S.ov = null;
    restoreCar();
    root().onclick = null;
    if (TD.lobby && TD.lobby.show) TD.lobby.show();
  };
  addEventListener('keydown', onKey);

  TD.lobby.add({ id: 'gacha', where: 'bar', label: 'Xưởng', icon: A + 'icon.webp', order: 30, open: X.open, badge: () => Math.min(st().tickets, 99) });
})(window.TD = window.TD || {});
