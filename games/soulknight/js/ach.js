// Thành tựu + Sổ Tay (sảnh bước 8, HALL.md mục 13 và 2.8): bộ đếm theo sự kiện ván, mở thành tựu khi đạt mục tiêu, thưởng nhận trong Sổ Tay
// (ô handbook_entry, phím E), tab Thành tựu (lưới icon, tiến độ, thưởng, nút Nhận) và tab Thống kê.
// Dữ liệu: data/sk-ach.js (tools/achievements/build_ach.py, 154 mục). Bảng IMPL dưới đây là các achievementType tính được ở bản web;
// loại còn lại hiện ra nhưng khoá ("Chưa có ở bản web", xem GAPS.md). Trạng thái lưu trong hồ sơ: SK.profile.ach() = {done, claimed, c}.
// Chỉ nghe SK.on(...) của game, không sửa game.js / actors.js / rooms.js. Thêm: SK.emit('plant') ở garden.js; số lần rèn / quay trứng bọc
// SK.profile.addForged / bumpDaily('egg').
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, D = SK.D, L = SK.lobby, P = SK.profile, DB = window.SK_ACH;
  if (!SK || !P || !P.ach || !DB || !L) return;
  const ITEMS = (window.SK_ITEMS && SK_ITEMS.items) || {};
  const A = P.ach(), LIST = DB.list, BY = {};
  for (const a of LIST) BY[a.id] = a;
  const { esc, fmt, gemImg } = L;

  // ---------------------------------------------------------------- bộ đếm bền vững
  if (!A.c) A.c = { kills: P.stats.kills | 0, wins: P.stats.pass | 0 };   // hồ sơ đã chơi trước khi có thành tựu: lấy số thống kê sẵn có làm vốn
  const C = A.c;
  for (const k of ['kills', 'wins', 'winsN', 'winsB', 'fastN', 'fastB', 'brN', 'brB', 'brFastN', 'brFastB', 'brClean', 'brBoss', 'noSkillB',
    'boss', 'shop', 'egg', 'forge', 'tv', 'bestFast', 'maxGold', 'runs']) C[k] = Math.max(0, Math.floor(+C[k] || 0));
  for (const k of ['by', 'skill', 'buffs', 'fac', 'plants']) if (!C[k] || typeof C[k] !== 'object') C[k] = {};
  const save = () => P.achSave();

  // Chỉ số hero (D.heroes[id].s0.index) -> id nhân vật, để đối chiếu targetHero.
  const heroId = {};
  for (const id of Object.keys(D.heroes || {})) heroId[D.heroes[id].s0.index] = id;
  const norm = id => String(id || '').replace(/^ex_/, 'e_');   // quái tinh anh ex_x tính chung với e_x
  const isBoss = e => !!(e && (e.arena || e.isBoss || /^boss/i.test(e.id || '')));

  // ---------------------------------------------------------------- loại điều kiện tính được: cur(a) và max(a)
  const wid = k => (DS.weaponId ? DS.weaponId(k) : k);
  const maxedPets = () => (window.SK_PETS ? SK_PETS.order.filter(id => P.petOwned(id) && P.petAff(id) >= P.petAffMax(id)).length : 0);
  const nKeys = o => Object.keys(o).length;
  const IMPL = {
    1: { cur: () => C.kills },                          // tổng quái hạ
    2: { cur: () => C.wins },                           // vượt Chế độ Ải (mọi nhân vật)
    3: { cur: () => C.winsN, max: 1 }, 4: { cur: () => C.winsB, max: 1 },
    7: { cur: () => C.maxGold },                        // vàng giữ nhiều nhất trong một ván (xấp xỉ "nhận 800 vàng trong một lần")
    10: { cur: a => C.skill[a.hero] | 0 },              // số lần dùng kỹ năng của nhân vật targetHero
    13: { cur: a => (P.picked(wid(a.str)) > 0 ? 1 : 0), max: 1 },   // nhận được vũ khí targetStr
    14: { cur: () => Math.floor(C.tv / 60) },           // phút đứng trước tivi ở sảnh
    16: { cur: a => (a.items || [a.str]).filter(k => (C.by[k] | 0) >= a.target).length, max: a => (a.items || [a.str]).length },   // mỗi loại quái đủ targetInt lần hạ
    21: { cur: () => C.fastN, max: 1 }, 22: { cur: () => C.fastB, max: 1 },     // vượt Ải-Thường trong 20 phút / Ải-Lợi Hại trong 23 phút
    29: { cur: () => C.brN, max: 1 }, 30: { cur: () => C.brB, max: 1 },         // vượt Khu Thí Luyện Thường / Lợi Hại
    31: { cur: () => C.brFastN, max: 1 }, 32: { cur: () => C.brFastB, max: 1 }, // trong 10 / 15 phút
    49: { cur: () => nKeys(C.buffs) },                  // thiên phú khác nhau đã nhận
    50: { cur: () => nKeys(C.fac) },                    // Nhân Tố Thử Thách khác nhau đã mang khi vượt Ải
    53: { cur: a => (heroId[a.hero] && P.isUnlocked(heroId[a.hero]) ? 1 : 0), max: 1 },   // mở khoá nhân vật
    62: { cur: maxedPets }, 65: { cur: maxedPets },     // số pet thân mật tối đa (loại 63/64 mèo/chó cần phân loài: khoá)
    78: { cur: () => C.brBoss, max: 1 },                // Khu Thí Luyện: hạ 1 Thủ Lĩnh không mất HP/Khiên
    79: { cur: () => C.brClean, max: 1 },               // vượt Khu Thí Luyện không mất HP/Khiên
    82: { cur: () => (DS.weaponGrades && DS.weaponGrades[6] ? DS.weaponGrades[6].filter(id => P.picked(id) > 0).length : 0) },   // vũ khí thần thoại đã nhặt
    90: { cur: () => C.shop },                          // lần mua trong tiệm
    96: { cur: () => C.bestFast, fixedMax: 5 },         // vào phòng kế trong 2,5 giây sau trận, 5 lần trong một ván (targetInt gốc = 0)
    102: { cur: () => C.egg },                          // lượt dùng Máy Quay Trứng
    117: { cur: () => nKeys(C.plants) },                // loại cây khác nhau đã trồng
    121: { cur: () => C.forge },                        // lần rèn vũ khí
    122: { cur: () => C.noSkillB, max: 1 }              // vượt Ải-Lợi Hại không dùng kỹ năng
  };
  for (const t of [17, 18, 19, 20]) IMPL[t] = { cur: a => C.by[a.str] | 0 };   // hạ 500 quái loại targetStr (mở thú cưỡi do js/mounts.js)
  const impl = a => IMPL[a.type] || null;
  const maxOf = a => { const m = impl(a); if (!m) return Math.max(1, a.target); if (m.fixedMax) return m.fixedMax; return typeof m.max === 'function' ? m.max(a) : (m.max || Math.max(1, a.target)); };
  const curOf = a => { const m = impl(a); return m ? Math.max(0, +m.cur(a) || 0) : 0; };

  // ---------------------------------------------------------------- mở thành tựu
  let toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'sk-ach-toast';
      toastEl.style.cssText = 'position:fixed;left:50%;top:6%;transform:translateX(-50%);z-index:60;background:#12171fee;border:2px solid #ffd452;border-radius:8px;color:#fff;padding:8px 16px;font:600 15px sans-serif;pointer-events:none;display:none';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text; toastEl.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.display = 'none'; }, 3200);
  }
  const doneOf = id => !!A.done[id];
  function syncGarden() {   // Ô vườn 7 mở khi đạt thành tựu "Tường Than Thở" (js/garden.js, SK_GARDEN.plots[6].ac)
    const g = P.garden && P.garden(), pl = window.SK_GARDEN && SK_GARDEN.plots;
    if (!g || !pl) return;
    let ch = false;
    pl.forEach((c, i) => { if (c.kind === 'achievement' && doneOf(c.ac) && !g.open[i]) { g.open[i] = true; ch = true; } });
    if (ch) P.gardenSave();
  }
  function unlock(id) {
    if (doneOf(id) || !BY[id]) return false;
    A.done[id] = 1; save();
    syncGarden();
    toast('Đạt thành tựu ' + BY[id].vi + '!');
    return true;
  }
  let busy = false;
  function check() {
    if (busy) return 0;
    busy = true;
    let n = 0;
    try { for (const a of LIST) if (!doneOf(a.id) && impl(a) && curOf(a) >= maxOf(a) && unlock(a.id)) n++; } finally { busy = false; }
    return n;
  }
  function count(k, n) { C[k] += n == null ? 1 : n; }
  function after() { save(); check(); }

  // ---------------------------------------------------------------- sự kiện ván
  let R = { hurt: 0, hurtRoom: 0, skill: 0, lastClear: -99, fast: 0 };
  SK.on('runStart', () => { R = { hurt: 0, hurtRoom: 0, skill: 0, lastClear: -99, fast: 0 }; C.runs++; save(); });
  SK.on('enemyKill', (G, e) => {
    count('kills');
    const k = norm(e.id); C.by[k] = (C.by[k] | 0) + 1;
    if (isBoss(e)) {
      count('boss');   // thống kê hồ sơ P.stats.boss do js/drops.js cộng
      if (G.mode === 'bossrush' && !R.hurtRoom) C.brBoss = 1;
    }
    after();
  });
  SK.on('playerHurt', () => { R.hurt++; R.hurtRoom++; });
  SK.on('roomEnter', () => { R.hurtRoom = 0; });
  SK.on('skill', (G, p) => {
    R.skill++;
    const idx = D.heroes[p.hero] ? D.heroes[p.hero].s0.index : -1;
    if (idx >= 0) C.skill[idx] = (C.skill[idx] | 0) + 1;
    after();
  });
  SK.on('pickup', (G, kind) => { if (kind === 'coin' && G.player) { C.maxGold = Math.max(C.maxGold, G.player.gold | 0); after(); } });
  SK.on('buffTake', (G, id) => { C.buffs[id] = 1; after(); });
  SK.on('shopBuy', () => { count('shop'); after(); });
  SK.on('plant', (seed) => { C.plants[seed] = 1; after(); });
  SK.on('roomClear', G => { R.lastClear = G.t; });
  SK.on('roomEnter', G => {   // vào phòng kế trong 2,5 giây sau khi trận chiến kết thúc
    if (G.t - R.lastClear <= 2.5) { R.fast++; C.bestFast = Math.max(C.bestFast, R.fast); R.lastClear = -99; after(); }
  });
  SK.on('runEnd', (G, r) => {
    const bad = !!G.badass, mins = (G.t || 0) / 60;
    if (G.player) C.maxGold = Math.max(C.maxGold, G.player.gold | 0);
    if (r.won && G.mode === 'level') {
      count('wins'); count(bad ? 'winsB' : 'winsN');
      if (!bad && mins <= 20) C.fastN = 1;
      if (bad && mins <= 23) C.fastB = 1;
      for (const k of G.factors || []) C.fac[k] = 1;
      if (bad && !R.skill) C.noSkillB = 1;
    }
    if (r.won && G.mode === 'bossrush') {
      C[bad ? 'brB' : 'brN'] = 1;
      if (!bad && mins <= 10) C.brFastN = 1;
      if (bad && mins <= 15) C.brFastB = 1;
      if (!R.hurt) C.brClean = 1;
    }
    after();
  });

  // Rèn vũ khí / quay trứng: bọc hàm hồ sơ (hall_forge.js, hall_egg.js gọi qua SK.profile).
  const addForged = P.addForged;
  P.addForged = function (id) { const r = addForged.apply(this, arguments); if (r) { count('forge'); after(); } return r; };
  const bumpDaily = P.bumpDaily;
  P.bumpDaily = function (name, n) { const r = bumpDaily.apply(this, arguments); if (name === 'egg') { count('egg', n == null ? 1 : n); after(); } return r; };

  // Tivi trong sảnh: mỗi giây đứng cạnh ô "tv" cộng 1 giây. Đồng thời quét điều kiện dựa vào hồ sơ (nhân vật, thân mật pet, vũ khí).
  let tick = 0;
  setInterval(() => {
    if (!SK.G || SK.G.state !== 'hall' || !SK.hall || !SK.hallState || !SK.hallState.me) return;
    tick++;
    const me = SK.hallState.me;
    if (SK.hall.state && SK.hall.state.mode === 'walk' && SK.hall.nearAt(me.x, me.y) === 'tv' && !L.dialogOpen) { C.tv++; if (tick % 5 === 0) save(); }
    if (tick % 3 === 0) { check(); syncGarden(); }
  }, 1000);

  // ---------------------------------------------------------------- thưởng
  const itemName = k => (ITEMS[k] ? ITEMS[k].vi : k);
  function rewardParts(a) {   // [{text, web}] web=false: chưa nhận được ở bản web
    return a.awards.map(w => {
      if (w.k === 'material_gem') return { text: fmt(w.n) + ' ' + gemImg, web: true, gems: w.n };
      if (w.k && !w.t) return { text: esc(itemName(w.k)) + ' ×' + w.n, web: !!ITEMS[w.k], item: w.k, n: w.n };
      if (w.t === 'token') return { text: esc(itemName(w.k)) + ' ×' + w.n, web: !!ITEMS[w.k], item: w.k, n: w.n };
      if (w.t === 'weapon') { const id = wid(w.w); return { text: 'Vũ khí ' + esc((DS.weapons[id] && DS.weapons[id].name) || w.w), web: !!DS.weapons[id], weapon: id }; }
      if (w.t === 'pet') { const pid = Object.keys(DB.pets).find(k => DB.pets[k] === a.id); const d = pid && SK_PETS.pets[pid]; return { text: 'Thú cưng ' + esc(d ? d.vi : w.p), web: true }; }
      if (w.t === 'skin') return { text: 'Skin nhân vật', web: false };
      return { text: '?', web: false };
    });
  }
  function claim(id) {
    const a = BY[id];
    if (!a || !doneOf(id)) return { ok: false, err: 'Chưa đạt thành tựu' };
    if (A.claimed[id]) return { ok: false, err: 'Đã nhận thưởng rồi' };
    const parts = rewardParts(a);
    if (parts.some(q => q.weapon) && P.boxFull) return { ok: false, err: 'Hòm vũ khí đầy, hãy bỏ bớt vũ khí ở Thùng Rác rồi quay lại.' };
    let gems = 0; const got = [];
    for (const q of parts) {
      if (!q.web) continue;
      if (q.gems) { P.addGems(q.gems); gems += q.gems; }
      else if (q.item) { P.addItem(q.item, q.n); got.push(itemName(q.item) + ' ×' + q.n); }
      else if (q.weapon) { P.addBox(q.weapon); got.push((DS.weapons[q.weapon] && DS.weapons[q.weapon].name) || q.weapon); }
    }
    A.claimed[id] = 1; save();
    return { ok: true, gems, items: got, skipped: parts.filter(q => !q.web).length };
  }
  const claimable = () => LIST.filter(a => doneOf(a.id) && !A.claimed[a.id] && a.awards.length);

  // ---------------------------------------------------------------- Sổ Tay (giao diện)
  const UI = SK.HALL_UI, USE = SK.HALL_USE;
  const st = document.createElement('style');
  const SW = DB.cell * 14, SH = DB.cell * Math.ceil(LIST.length / 14), Z = 1.5;
  st.textContent = '#hs-dlg .hs-btns{flex-wrap:wrap}.sk-ach{grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*17),1fr))!important;max-height:34vh!important}' +
    '.sk-ach div{cursor:pointer;position:relative}.sk-ach div.on{border-color:#ffd452}.sk-ach div.ok{border-color:#4fb35a}.sk-ach div.ok.claim{border-color:#ffd452;background:#2a2410}' +
    '.sk-ach div.lk .sk-ai{filter:grayscale(1) brightness(.5)}.sk-ach small{display:block;color:#9aa3b0}' +
    '.sk-ai{display:block;margin:0 auto calc(var(--u)*.6);width:' + DB.cell * Z + 'px;height:' + DB.cell * Z + 'px;image-rendering:pixelated;background-repeat:no-repeat;background-size:' + SW * Z + 'px ' + SH * Z + 'px}' +
    '.sk-abar{height:calc(var(--u)*1.6);background:#12171f;border:1px solid #2c3340;border-radius:4px;margin:calc(var(--u)*.6) 0;position:relative}.sk-abar i{display:block;height:100%;background:#4fb35a}' +
    '.sk-stat{list-style:none;margin:calc(var(--u)*1) 0;padding:0;text-align:left}.sk-stat li{display:flex;justify-content:space-between;gap:calc(var(--u)*2);padding:calc(var(--u)*.9) 0;border-bottom:1px solid #2c3340;font-size:calc(var(--u)*3)}' +
    '.sk-stat li b{color:#ffd452;font-weight:400}';
  document.head.appendChild(st);
  const iconStyle = a => 'background-image:url(' + DB.sheet + '?v=20261010j);background-position:-' + a.icon[0] * Z + 'px -' + a.icon[1] * Z + 'px';
  const nameOf = a => (a.hide && !doneOf(a.id) ? 'Thành tựu ẩn' : a.vi);
  const descOf = a => (a.hide && !doneOf(a.id) ? 'Hoàn thành điều kiện bí mật để mở.' : (a.desc || 'Chưa có mô tả.'));
  const state = a => (A.claimed[a.id] ? 'claimed' : doneOf(a.id) ? 'done' : 'open');
  let tab = 'ach', sel = null, note = '';
  const CLOSE = UI && UI.CLOSE;

  function detail(a) {
    const m = maxOf(a), c = Math.min(curOf(a), m), runnable = !!impl(a), s = state(a), parts = rewardParts(a);
    let h = '<p id="sk-ach-name"><b>' + esc(nameOf(a)) + '</b>' + (s === 'claimed' ? ' · đã nhận thưởng' : s === 'done' ? ' · đã đạt' : '') + '</p><p id="sk-ach-desc">' + esc(descOf(a)) + '</p>';
    if (!runnable && !doneOf(a.id)) h += '<p class="hs-bad" id="sk-ach-lock">Chưa có ở bản web.</p>';
    else h += '<p id="sk-ach-prog">Tiến độ: <b>' + fmt(doneOf(a.id) ? m : c) + '/' + fmt(m) + '</b></p><div class="sk-abar"><i style="width:' + Math.round((doneOf(a.id) ? m : c) / m * 100) + '%"></i></div>';
    if (parts.length) h += '<p id="sk-ach-rew">Thưởng: ' + parts.map(q => q.text + (q.web ? '' : ' (chưa có ở bản web)')).join(' · ') + '</p>';
    return h;
  }
  function sortKey(a) { return state(a) === 'done' ? 0 : state(a) === 'open' ? 1 : 2; }
  function panel(z) {
    check();
    const done = LIST.filter(a => doneOf(a.id)).length, can = claimable().length;
    let html = '<h3>Sổ Tay Soul Knight</h3>';
    const btns = [{ id: 'sk-hb-tab-ach', label: 'Thành Tựu', cls: tab === 'ach' ? 'ok' : '', fn() { tab = 'ach'; note = ''; panel(z); } },
      { id: 'sk-hb-tab-stat', label: 'Thống kê', cls: tab === 'stat' ? 'ok' : '', fn() { tab = 'stat'; note = ''; panel(z); } }];
    if (tab === 'ach') {
      if (!sel || !BY[sel]) sel = LIST[0].id;
      const a = BY[sel], runN = LIST.filter(x => impl(x)).length;
      html += '<p id="sk-ach-sum">Đã đạt <b>' + done + '/' + LIST.length + '</b> · chờ nhận thưởng <b>' + can + '</b> · tính được ở bản web ' + runN + '</p><div class="sk-grid sk-ach" id="sk-ach">' +
        LIST.slice().sort((x, y) => sortKey(x) - sortKey(y) || x.id - y.id).map(x => {
          const s = state(x), m = maxOf(x), c = Math.min(curOf(x), m);
          return '<div data-id="' + x.id + '" class="' + (x.id === sel ? 'on ' : '') + (s !== 'open' ? 'ok ' : 'lk ') + (s === 'done' ? 'claim' : '') + '"><span class="sk-ai" style="' + iconStyle(x) + '"></span>' +
            esc(nameOf(x)) + '<small>' + (s === 'claimed' ? 'Đã nhận' : s === 'done' ? 'Nhận thưởng' : impl(x) ? fmt(c) + '/' + fmt(m) : 'Khóa') + '</small></div>';
        }).join('') + '</div><div id="sk-ach-det">' + detail(a) + '</div>';
      if (note) html += '<p id="sk-ach-note">' + esc(note) + '</p>';
      if (doneOf(a.id) && !A.claimed[a.id] && a.awards.length) btns.push({ id: 'sk-ach-claim', label: 'Nhận', cls: 'ok', fn() { reply(z, claim(a.id), a); } });
      if (can > 1 || (can === 1 && !(doneOf(a.id) && !A.claimed[a.id]))) btns.push({ id: 'sk-ach-claimall', label: 'Nhận tất cả (' + can + ')', cls: 'ok', fn() {
        let g = 0, n = 0, err = '';
        for (const x of claimable()) { const r = claim(x.id); if (r.ok) { n++; g += r.gems; } else err = r.err; }
        note = 'Đã nhận thưởng ' + n + ' thành tựu' + (g ? ', +' + fmt(g) + ' đá' : '') + '.' + (err ? ' ' + err : ''); panel(z);
      } });
    } else {
      const s = P.stats;
      const rows = [['Tổng số địch đánh bại', C.kills], ['Tổng số Thủ Lĩnh đánh bại', s.boss], ['Số lần vượt', s.pass], ['Số lần vượt (Chế độ Thường)', C.winsN],
        ['Số lần vượt (Chế độ Lợi Hại)', C.winsB], ['Số lượng tử vong', s.dead], ['Số ải xa nhất đã vượt', s.best], ['Số ván đã chơi', C.runs],
        ['Số lần mua trong tiệm', C.shop], ['Số lần dùng Máy Quay Trứng', C.egg], ['Số lần rèn vũ khí', C.forge], ['Số loại cây đã trồng', nKeys(C.plants)],
        ['Số thiên phú khác nhau đã nhận', nKeys(C.buffs)], ['Thành tựu đã đạt', done + '/' + LIST.length]];
      html += '<ul class="sk-stat" id="sk-stat">' + rows.map((r, i) => '<li data-i="' + i + '"><span>' + esc(r[0]) + '</span><b>' + (typeof r[1] === 'number' ? fmt(r[1]) : r[1]) + '</b></li>').join('') + '</ul>';
    }
    btns.push(CLOSE);
    UI.dlg(html, btns);
    if (tab === 'ach') {
      const g = document.getElementById('sk-ach');
      for (const el of g.children) el.onclick = () => { sel = +el.dataset.id; note = ''; panel(z); };
      const on = g.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
  }
  function reply(z, r, a) {
    note = r.ok ? 'Đã nhận thưởng "' + a.vi + '"' + (r.gems ? ': +' + fmt(r.gems) + ' đá' : '') + (r.items.length ? (r.gems ? ', ' : ': ') + r.items.join(', ') : '') + '.' +
      (r.skipped ? ' Một phần thưởng chưa có ở bản web.' : '') : r.err;
    panel(z);
  }
  if (USE && UI) USE.handbook_entry = z => { note = ''; panel(z); };

  // ---------------------------------------------------------------- API
  SK.ach = {
    list: LIST, get: id => BY[id], done: doneOf, claimed: id => !!A.claimed[id], claim, claimable,
    impl: a => !!impl(typeof a === 'number' ? BY[a] : a),
    progress: id => ({ cur: Math.min(curOf(BY[id]), maxOf(BY[id])), max: maxOf(BY[id]), web: !!impl(BY[id]) }),
    counters: () => JSON.parse(JSON.stringify(C)), check, syncGarden,
    // Thú cưng mở bằng thành tựu: SK.profile.petOwned hỏi ở đây (DB.pets: {petId: id thành tựu}).
    petOwned: petId => !!(DB.pets[petId] && doneOf(DB.pets[petId])),
    // Móc kiểm thử: mở thẳng một thành tựu / cộng giây tivi.
    grant: id => { const r = unlock(id); check(); return r; }, addTv: s => { C.tv += s | 0; after(); },
    open: z => panel(z || {}), toast
  };
  check(); syncGarden();
})();
