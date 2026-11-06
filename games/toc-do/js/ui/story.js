// Cốt Truyện: bản đồ chương (nền và ghim ải theo career map gốc), thẻ ải, lời thoại, plugin trận chấm mục tiêu trực tiếp và khi về đích.
// Dữ liệu ải, chấm sao: data/story.js. Một ải = TD.MODES.story được ghi lại theo ải trước mỗi lần vào trận (đúng một ải chạy tại một thời điểm).
(function (TD) {
  'use strict';
  const S = TD.Story;
  const U = {};
  const A = 'art/story/';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (e) => TD.audio && TD.audio.play(e);
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const save = () => TD.save.d.story;
  const root = () => document.getElementById('ui');
  // Nền bản đồ theo chương (uitextures/id_career/careermap, mapdetail); thừa chương thì quay vòng.
  const BG = ['careermap_BG_Map6', 'careermap_BG_Map7', 'careermap_BG_Map8', 'mapdetail_CareerMapBK2'];
  // Vị trí ghim theo chỉ số ải trong chương (% của vùng bản đồ): đường ngoằn ngoèo trái sang phải.
  const POS_Y = [68, 46, 66, 44, 64, 42, 62, 40];
  const px = (i, n) => ({ x: n < 2 ? 50 : 9 + 82 * i / (n - 1), y: POS_Y[i % POS_Y.length] });

  // ---------- bản lưu ----------
  // story = { stars: { <id ải>: 1..3 }, chapter: số chương đang xem, got: { <số chương>: 1 } đã nhận thưởng chương }.
  TD.save.norms.push((o) => {
    const s = o.story && typeof o.story === 'object' ? o.story : {}, stars = {}, got = {};
    for (const L of S.levels) {
      const v = Math.floor(Number(s.stars && s.stars[L.id])) || 0;
      if (v > 0) stars[L.id] = Math.min(v, L.goals.length);
    }
    for (const c of S.chapters) if (s.got && s.got[c.n]) got[c.n] = 1;
    const ch = Math.floor(Number(s.chapter)) || 1;
    o.story = { stars, chapter: Math.min(Math.max(ch, 1), S.chapters.length), got };
  });

  // ---------- thưởng chương ----------
  // Xe thưởng: xe rẻ nhất (theo giá gara) chưa sở hữu; hết xe thì cộng thêm 500 xu (chọn).
  function pickCar() {
    const G = TD.garage;
    if (!G || !G.ownedIds) return null;
    const own = G.ownedIds();
    return Object.keys(TD.CARS).filter((id) => own.indexOf(id) < 0).sort((a, b) => G.priceOf(a) - G.priceOf(b))[0] || null;
  }
  function claim(c) {
    const d = TD.save.d, sv = d.story;
    if (sv.got[c.n] || !S.chapterCleared(sv, c)) return null;
    sv.got[c.n] = 1;
    const out = { coins: c.reward.coins, xp: c.reward.xp, car: null };
    if (c.reward.car) {
      const id = pickCar();
      if (id) { d.owned = TD.garage.ownedIds().concat(id); out.car = id; } else out.coins += 500;
    }
    d.coins += out.coins; d.xp += out.xp;
    TD.save.save();
    return out;
  }
  const claimable = () => S.chapters.filter((c) => !save().got[c.n] && S.chapterCleared(save(), c)).length;

  // ---------- lời thoại ----------
  let dlg = null;
  function portrait(npc) {
    const n = S.NPC[npc] || S.NPC.quat;
    const img = npc === 'me' ? 'art/lobby/avatar_' + (TD.save.d.driver === 'nu' ? 'nu' : 'nam') + '.webp' : n.img;
    return { name: npc === 'me' ? TD.save.d.name : n.name, img };
  }
  // lines = [[npc, chữ]]; xong (hoặc bấm Bỏ qua) thì gọi done.
  U.dialogue = function (lines, done) {
    closeDlg();
    if (!lines || !lines.length) { if (done) done(); return; }
    const el = document.createElement('div');
    el.className = 'st-dlg';
    root().appendChild(el);
    dlg = { el, lines, i: 0, done, timer: 0, full: '' };
    show();
  };
  function closeDlg() {
    if (!dlg) return;
    clearInterval(dlg.timer);
    dlg.el.remove();
    dlg = null;
  }
  function show() {
    const d = dlg, [npc, text] = d.lines[d.i], p = portrait(npc), side = npc === 'me' ? 'right' : 'left';
    d.full = text;
    d.el.innerHTML = `<button class="st-skip btn gray" data-d="skip">Bỏ qua</button>
  <div class="st-dbox ${side}">${p.img ? `<img class="st-dface" src="${p.img}" alt="">` : ''}
    <div class="st-dtext"><b>${esc(p.name)}</b><p></p><i class="st-dnext">▼</i></div></div>`;
    const out = d.el.querySelector('p');
    let n = 0;
    clearInterval(d.timer);
    d.typing = true;
    d.timer = setInterval(() => { n += 2; out.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(d.timer); d.typing = false; } }, 22);
    d.out = out;
    d.el.onclick = (e) => {
      const b = e.target.closest('button');
      sfx('Play_UI_Click');
      if (b && b.dataset.d === 'skip') return finish();
      if (d.typing) { clearInterval(d.timer); d.typing = false; d.out.textContent = d.full; return; }
      if (++d.i >= d.lines.length) finish(); else show();
    };
  }
  function finish() { const f = dlg && dlg.done; closeDlg(); if (f) f(); }

  // ---------- bản đồ ----------
  const V = { ch: 1, sel: null, post: null };   // post = { id, win } lời thoại sau trận chờ phát khi mở lại bản đồ
  const stars3 = (n, max) => Array.from({ length: max || 3 }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');

  function trackName(L) { const T = TD.TRACKS[S.trackOf(L.slot)]; return T ? T.name : '?'; }

  function nodeHtml(L, i, n, cur) {
    const sv = save(), st = S.starsOf(sv, L), open = S.unlocked(sv, L), p = px(i, n), on = V.sel === L.id;
    const kind = !open ? 'lock' : on || (cur && cur.id === L.id) ? 'cur' : L.boss ? 'boss' : 'norm';
    const pin = kind === 'boss' ? 'BG_LevelDetailsBoss' : kind === 'cur' ? 'BG_LevelDetailsCurrent' : 'BG_LevelDetailsNormal';
    return `<button class="st-node ${kind}${on ? ' sel' : ''}${st ? ' done' : ''}" data-lv="${L.id}" style="left:${p.x}%;top:${p.y}%" aria-label="Ải ${L.ch}-${L.i} ${esc(L.name)}">
      <img class="st-base" src="${A}careermap_${kind === 'boss' || kind === 'cur' ? 'BG_LevelBottomBoss' : 'BG_LevelBottomNormal'}.webp" alt="">
      <img class="st-pin" src="${A}careermap_${pin}.webp" alt=""><b>${L.i}</b>
      ${open ? `<span class="st-nstars">${stars3(st, L.goals.length)}</span>` : `<img class="st-lock" src="${A}careermap_BG_ChapterLocked.webp" alt="">`}
      ${kind === 'cur' && !on ? `<img class="st-flag" src="${A}careermap_BG_MapFlag01.webp" alt="">` : ''}</button>`;
  }

  function cardHtml(L) {
    const sv = save(), st = S.starsOf(sv, L), open = S.unlocked(sv, L), goals = S.resolve(L);
    const rv = L.rival ? S.NPC[L.rival.npc] : null, guide = S.NPC[S.chapters[L.ch - 1].npc];
    const first = S.reward(L, 0, 1);
    return `<div class="st-card panel">
  <div class="st-chead">${(rv || guide).img ? `<img src="${(rv || guide).img}" alt="">` : ''}
    <div><small>Ải ${L.ch}-${L.i}${L.boss ? ' · Trùm' : ''}</small><h3>${esc(L.name)}</h3>
    <em>${esc(trackName(L))} · ${L.laps} vòng · ${L.karts} xe${L.items ? ' · Đạo cụ' : ''}</em></div></div>
  ${rv ? `<div class="st-rival">Đối thủ: <b>${esc(rv.name)}</b></div>` : ''}
  ${open ? `<ul class="st-goals">${goals.map((g, i) => `<li class="${i === 0 ? 'main ' : ''}${st && i === 0 ? 'ok' : ''}"><i>${i === 0 ? 'Vượt ải' : '★'}</i><span>${esc(g.text)}</span></li>`).join('')}</ul>
  <div class="st-card-stars" aria-label="${st} sao">${stars3(st, goals.length)}</div>
  <div class="st-rw">Thưởng lần đầu: <b>${fmt(first.coins)}</b> xu · <b>${first.xp}</b> XP · mỗi sao mới +${S.STAR_COINS} xu</div>
  <button class="st-go btn yellow" data-act="start">${st ? 'CHƠI LẠI' : 'BẮT ĐẦU'}</button>`
    : `<p class="st-locked">Ải chưa mở khóa, cần vượt ải trước đó</p>`}
  </div>`;
  }

  function mapHtml() {
    const sv = save(), c = S.chapters[V.ch - 1], tot = S.levels.reduce((a, L) => a + S.starsOf(sv, L), 0), max = S.levels.reduce((a, L) => a + L.goals.length, 0);
    const cur = S.firstOpen(sv), cs = S.chapterStars(sv, c), cm = S.chapterMax(c), cleared = S.chapterCleared(sv, c), got = sv.got[c.n];
    const n = c.levels.length;
    const L = V.sel && S.levelById(V.sel);
    // đường nối các ghim (viewBox 100×100, kéo giãn theo vùng bản đồ)
    const path = c.levels.map((l, i) => { const p = px(i, n); return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ');
    return `<div class="st">
  <div class="st-bg" style="background-image:url('${A}${BG[(V.ch - 1) % BG.length]}.webp')"></div>
  <header class="st-top">
    <button class="st-back btn gray" data-act="back" aria-label="Về sảnh">‹ Về sảnh</button>
    <nav class="st-tabs">${S.chapters.map((x) => { const o = S.chapterOpen(sv, x); return `<button class="st-tab${x.n === V.ch ? ' on' : ''}${o ? '' : ' off'}" data-ch="${x.n}">${o ? '' : `<img src="${A}careermap_BG_ChapterLocked.webp" alt="">`}Chương ${x.n}${claimableDot(x)}</button>`; }).join('')}</nav>
    <div class="st-stat"><span><i>★</i>${tot}/${max}</span><span class="st-coins"><img src="art/lobby/coin.webp" alt="">${fmt(TD.save.d.coins)}</span></div>
  </header>
  <div class="st-map">
    <div class="st-ctitle"><small>Chương ${c.n}</small><b>${esc(c.title)}</b><em>${esc(c.sub)}</em></div>
    <svg class="st-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" vector-effect="non-scaling-stroke"/></svg>
    ${c.levels.map((l, i) => nodeHtml(l, i, n, cur)).join('')}
  </div>
  ${L ? cardHtml(L) : `<div class="st-card panel st-intro"><img src="${S.NPC[c.npc].img}" alt=""><b>${esc(S.NPC[c.npc].name)}</b><p>${esc(c.intro[0][1])}</p><small>Chọn một ải trên bản đồ.</small></div>`}
  <footer class="st-foot">
    <div class="st-prog"><span>Sao chương: ${cs}/${cm}</span><i><b style="width:${Math.round(100 * cs / cm)}%"></b></i></div>
    <div class="st-rwd"><span>Thưởng chương: <b>${fmt(c.reward.coins)}</b> xu · <b>${c.reward.xp}</b> XP${c.reward.car ? ' · 1 xe' : ''}</span>
      <button class="btn ${cleared && !got ? 'yellow' : 'gray'}" data-act="claim" ${cleared && !got ? '' : 'disabled'}>${got ? 'Đã nhận' : 'Nhận'}</button></div>
  </footer>
</div>`;
  }
  const claimableDot = (x) => (!save().got[x.n] && S.chapterCleared(save(), x) ? '<em class="st-dot"></em>' : '');

  function render() {
    const r = root();
    r.innerHTML = mapHtml();
    r.onclick = (e) => { const b = e.target.closest('button'); if (b && !b.disabled) onClick(b); };
  }

  function onClick(b) {
    const sv = save();
    sfx('Play_UI_Click');
    if (b.dataset.act === 'back') { sfx('Play_UI_Back'); TD.lobby.show(); return; }
    if (b.dataset.ch) {
      const c = S.chapters[b.dataset.ch - 1];
      if (!S.chapterOpen(sv, c)) { toast('Cần vượt ải trước đó'); return; }
      V.ch = c.n; V.sel = null; sv.chapter = c.n; render(); return;
    }
    if (b.dataset.lv) { V.sel = b.dataset.lv; render(); return; }
    if (b.dataset.act === 'claim') {
      const c = S.chapters[V.ch - 1], r = claim(c);
      if (r) { sfx('Play_UI_Confirm'); render(); rewardModal(c, r); }
      return;
    }
    if (b.dataset.act === 'start') {
      const L = S.levelById(V.sel);
      if (!L || !S.unlocked(sv, L)) return;
      sfx('Play_UI_Confirm');
      U.dialogue(L.pre, () => U.start(L));
    }
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

  function rewardModal(c, r) {
    const m = document.createElement('div');
    m.className = 'st-modal';
    const car = r.car && TD.CARS[r.car];
    m.innerHTML = `<div class="st-mbox panel"><b>Hoàn thành Chương ${c.n}</b><p>${esc(c.title)}</p>
      <div class="st-mrw"><span><b>+${fmt(r.coins)}</b> xu</span><span><b>+${r.xp}</b> XP</span>${car ? `<span>Xe mới: <b>${esc(car.name)}</b></span>` : ''}</div>
      <button class="btn yellow" data-m="ok">Nhận</button></div>`;
    m.onclick = (e) => { if (e.target.closest('[data-m]')) { sfx('Play_UI_Click'); m.remove(); } };
    root().appendChild(m);
  }

  // Mở bản đồ: sel = id ải chọn sẵn (mặc định ải đang chơi dở). Có lời thoại sau trận thì phát trước.
  U.open = function (sel) {
    const sv = save(), cur = sel ? S.levelById(sel) : S.firstOpen(sv);
    V.ch = cur.ch; V.sel = cur.id; sv.chapter = cur.ch;
    render();
    if (V.post) {
      const p = V.post, L = S.levelById(p.id);
      V.post = null;
      U.dialogue(p.win ? L.win : L.lose, () => {
        // Qua ải xong: chuyển sang ải kế (có thể sang chương mới) và báo thưởng chương nếu vừa đủ điều kiện.
        if (p.win) { const nx = S.nextOf(L); if (nx && S.unlocked(save(), nx)) { V.ch = nx.ch; V.sel = nx.id; render(); } }
        const c = S.chapters[L.ch - 1];
        if (p.win && S.chapterCleared(save(), c) && !save().got[c.n]) toast('Đủ điều kiện nhận thưởng Chương ' + c.n);
      });
    }
  };

  // ---------- vào trận ----------
  U.cur = null;
  // Ghi TD.MODES.story theo ải rồi vào trận (startRace đọc đường từ bản lưu và chế độ từ bảng này).
  U.start = function (L) {
    const d = TD.save.d;
    TD.MODES.story = { id: 'story', name: 'Cốt Truyện', karts: L.karts, teams: 0, items: L.items, laps: L.laps, story: L.id };
    d.track = S.trackOf(L.slot);
    U.cur = L;
    V.post = null;
    closeDlg();
    TD.lobby.screen = null;
    TD.main.startRace({ mode: 'story' });
  };

  // ---------- plugin trận ----------
  const P = { L: null, goals: null, c: null, rival: null, ctx: null };
  const plugin = {
    start(ctx) {
      const L = ctx.R.mode.story ? S.levelById(ctx.R.mode.story) : null;
      P.L = L; P.ctx = ctx; P.added = false;
      if (!L) return;
      P.goals = S.resolve(L);
      P.c = { itemsGot: 0, itemHits: 0, gap: 0 };
      // Bot theo ải: kỹ năng rải đều từ skill[0] đến skill[1] (xe đứng trước mạnh nhất); đối thủ riêng lấy tên và kỹ năng của NPC.
      const bots = ctx.R.karts.filter((k) => k !== ctx.me);
      bots.forEach((k, i) => TD.Bot.init(k, ctx.R, L.skill[1] - (L.skill[1] - L.skill[0]) * (bots.length > 1 ? i / (bots.length - 1) : 0)));
      P.rival = null;
      if (L.rival) {
        P.rival = bots[0];
        TD.Bot.init(P.rival, ctx.R, L.rival.skill);
        P.rival.name = S.NPC[L.rival.npc].name;
      }
    },
    event(e, mine, ctx) {
      if (!P.L || ctx !== P.ctx) return;
      if (e.type === 'item_get' && mine) P.c.itemsGot++;
      else if (e.type === 'item_hit' && e.by === ctx.me.id && e.kart !== ctx.me.id) P.c.itemHits++;
      else if (e.type === 'finish' && mine) {
        // Khoảng dẫn trước = tiến độ của mình trừ xe còn chạy xa nhất lúc về đích (chỉ có nghĩa khi về nhất).
        const rest = ctx.R.karts.filter((k) => k !== ctx.me && !k.done).map((k) => k.progress);
        P.c.gap = e.place === 1 && rest.length ? Math.max(0, Math.round(ctx.me.progress - Math.max(...rest))) : 0;
      }
    },
    settle(F, ctx) {
      if (!P.L || ctx !== P.ctx) return;
      const L = P.L, d = TD.save.d, sv = d.story;
      const ev = S.evaluate(P.goals, S.stats(ctx.R, ctx.me, P.c, P.rival));
      const old = S.starsOf(sv, L), now = Math.max(old, ev.stars), rw = S.reward(L, old, now);
      if (now > old) sv.stars[L.id] = now;
      sv.chapter = L.ch;
      d.coins += rw.coins; d.xp += rw.xp;
      F.reward += rw.coins; F.xp += rw.xp;
      F.lvAfter = TD.LEVEL.of(d.xp); F.levelUp = F.lvAfter.lv > F.lvBefore.lv;
      F.story = { id: L.id, ev, rw, stars: now };
      V.post = { id: L.id, win: ev.cleared };
      F.cards.push(`<div class="fin-card st-fcard ${ev.cleared ? 'up' : 'dn'}">
        <h4>Cốt Truyện · Ải ${L.ch}-${L.i}</h4>
        <div class="st-fstars">${stars3(ev.stars, P.goals.length)}</div>
        <div class="fin-gain">${ev.cleared ? 'VƯỢT ẢI' : 'CHƯA QUA'}</div>
        <ul class="st-fgoals">${P.goals.map((g, i) => `<li class="${ev.met[i] ? 'ok' : ''}"><i>${ev.met[i] ? '✓' : '✕'}</i>${esc(g.text)}</li>`).join('')}</ul>
        <small>${rw.coins ? '+' + fmt(rw.coins) + ' xu · ' : ''}${rw.xp ? '+' + rw.xp + ' XP' : rw.newStars ? 'sao mới +' + rw.newStars : 'không có thưởng thêm'}</small>
      </div>`);
    },
    // Màn kết quả: thay hàng nút bằng Đua lại / Bản đồ / Ải tiếp (một lần cho mỗi trận).
    update() {
      if (!P.L || P.added || !TD.main.resultShown) return;
      const acts = document.querySelector('.result .fin-table .acts');
      if (!acts) return;
      P.added = true;
      const f = TD.main.fin && TD.main.fin.story, nx = f && f.ev.cleared ? S.nextOf(P.L) : null;
      acts.innerHTML = `<button class="btn yellow" data-r="again">ĐUA LẠI</button><button class="btn blue" data-st="map">BẢN ĐỒ</button>${nx ? '<button class="btn blue" data-st="next">ẢI TIẾP</button>' : ''}`;
      acts.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation(); sfx('Play_UI_Click');
        const to = b.dataset.st === 'next' ? nx.id : P.L.id;
        TD.main.toLobby();
        if (b.dataset.st === 'next') V.post = null;
        U.open(to);
      }));
    },
    end() { if (P.L) closeDlg(); P.L = null; P.ctx = null; },
    // Danh sách mục tiêu góc trái: ✓ xanh đã đạt, ✕ đỏ đã hỏng, ○ đang chờ.
    draw(g, H) {
      if (!P.L || P.ctx !== TD.main.ctx || !TD.main.race) return;
      const st = S.stats(TD.main.race, TD.main.me, P.c, P.rival);
      const u = H.h / 720, fs = Math.max(11, Math.round(16 * u)), row = Math.round(fs * 1.7), pad = Math.round(8 * u) + 2;
      const rows = P.goals.map((gl) => {
        const s = S.status(gl, st);
        let prog = '';
        if (gl.type === 'time') prog = s.need ? mm(Math.max(0, s.need - s.val)) : '';
        else if (gl.type === 'place') prog = 'hạng ' + (st.place || '-');
        else if (gl.type !== 'rival' && gl.type !== 'gap') prog = s.val + '/' + s.need;
        return { text: gl.text, prog, s };
      });
      g.save();
      g.font = fs + 'px Cafeta, system-ui, sans-serif'; g.textBaseline = 'middle';
      const w = Math.max(...rows.map((r) => g.measureText(r.text + ' ' + r.prog).width)) + fs * 2.4 + pad * 2, x = Math.round(14 * u) + 4, y = Math.round(256 * u);
      g.fillStyle = 'rgba(6,16,40,.66)'; g.fillRect(x, y, w, rows.length * row + pad * 2);
      g.fillStyle = '#ffd23a'; g.fillRect(x, y, 3, rows.length * row + pad * 2);
      rows.forEach((r, i) => {
        const cy = y + pad + row * i + row / 2;
        g.fillStyle = r.s.done ? '#5be37a' : r.s.failed ? '#ff6a5e' : '#ffffff';
        g.fillText(r.s.done ? '✓' : r.s.failed ? '✕' : '○', x + pad + 3, cy);
        g.fillStyle = r.s.failed ? 'rgba(255,255,255,.55)' : '#fff';
        g.fillText(r.text, x + pad + fs * 1.4, cy);
        g.fillStyle = '#ffd23a'; g.textAlign = 'right';
        g.fillText(r.prog, x + w - pad, cy); g.textAlign = 'left';
      });
      g.restore();
    },
  };
  const mm = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push(plugin);
  TD.lobby.add({ id: 'story', where: 'tile', label: 'Cốt Truyện', icon: 'art/lobby/tile_story.webp', order: 1, badge: claimable, open: () => U.open() });
  U.plugin = plugin; U.V = V; U.claim = claim; U.state = P;
  TD.story = U;
})(globalThis.TD = globalThis.TD || {});
