// Sảnh chọn nhân vật + chọn chế độ + cửa hàng đá quý (mua bằng tiền thật là GIẢ LẬP): thay SK.lobby,
// gọi SK.startRun(heroId). Bố cục theo ảnh chụp SK 8.6 (màn chọn nhân vật + màn chọn chế độ).
(function () {
  'use strict';
  const SK = window.SK, G = SK.G, D = SK.D, DS = SK.DS, A = SK.A;
  const $ = id => document.getElementById(id);
  const ART = 'art/lobby/';
  const LA = () => window.SK_LOBBY_ART || {};
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fmt = n => Math.round(n).toLocaleString('vi-VN');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Chữ Việt + bảng biểu tượng kỹ năng sinh bởi art/lobby/build_lobby_art.py; nạp bằng thẻ script để chạy được từ file://.
  let built = false;
  (function () {
    const s = document.createElement('script');
    s.src = ART + 'lobby-art.js?v=20260929b';
    s.onload = () => { if (built) refresh(); };
    s.onerror = () => SK.warnOnce('lobbyart', 'lobby art not loaded');
    document.head.appendChild(s);
  })();

  // ---------------------------------------------------------------- hồ sơ người chơi (localStorage)
  const KEY = 'sk.profile.v1';
  function loadProfile() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }
  const P = Object.assign({ gems: 0, unlocked: ['knight'], selected: 'knight', skills: {}, slot: {}, level: {}, view: 'art', demo: true },
    loadProfile() || {});
  if (!Array.isArray(P.unlocked)) P.unlocked = [];
  if (P.unlocked.indexOf('knight') < 0) P.unlocked.push('knight');
  if (!DS.heroes[P.selected]) P.selected = 'knight';
  P.gems = Math.max(0, Math.floor(+P.gems || 0));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* chế độ riêng tư: chơi tiếp, không lưu */ } }

  const HEROES = Object.keys(DS.heroes).filter(id => D.heroes && D.heroes[id])
    .sort((a, b) => D.heroes[a].s0.index - D.heroes[b].s0.index);

  SK.profile = {
    get gems() { return P.gems; },
    get unlocked() { return P.unlocked.slice(); },
    get selected() { return P.selected; },
    addGems(n) { P.gems = Math.max(0, P.gems + Math.floor(n)); save(); if (built) refresh(); return P.gems; },
    spend(n) { if (P.gems < n) return false; P.gems -= n; save(); return true; },
    isUnlocked: id => P.unlocked.indexOf(id) >= 0,
    unlock(id) { if (DS.heroes[id] && P.unlocked.indexOf(id) < 0) { P.unlocked.push(id); save(); if (built) refresh(); } return !!DS.heroes[id]; },
    select(id) { return select(id); },
    isSkillUnlocked: (id, slot) => slot === 0 || ((P.skills[id] || []).indexOf(slot) >= 0),
    unlockSkill(id, slot) { const a = P.skills[id] = P.skills[id] || []; if (a.indexOf(slot) < 0) a.push(slot); save(); if (built) refresh(); },
    skillSlot: id => P.slot[id] || 0,
    level: id => P.level[id] || 0,
    reset() { try { localStorage.removeItem(KEY); } catch (_) { /* bỏ qua */ } }
  };
  const isUnlocked = SK.profile.isUnlocked;

  // ---------------------------------------------------------------- giá
  const FAKE_HERO_GEMS = 10000;   // nhân vật mở bằng thành tựu / nguyên liệu → đổi đá quý [ƯỚC LƯỢNG]
  const FAKE_SKILL_GEMS = 8000;   // kỹ năng mở ở Bàn thiết kế → đổi đá quý [ƯỚC LƯỢNG]
  const KIND_VI = { achievement: 'hoàn thành thành tựu', materials: 'nộp nguyên liệu', other: 'vật phẩm sự kiện',
    design_table: 'chế ở Bàn thiết kế' };
  function heroPrice(id) {
    const u = DS.heroes[id].unlock || {};
    if (u.kind === 'free' || u.kind === 'default') return { kind: 'free' };
    if (u.kind === 'gems' && u.amount) return { kind: 'gems', amount: u.amount };
    if (u.kind === 'real_money' && u.amount) return { kind: 'money', amount: u.amount };
    return { kind: 'gems', amount: FAKE_HERO_GEMS, orig: (KIND_VI[u.kind] || 'cách khác') + (u.text ? ' (' + u.text + ')' : '') };
  }
  function skillPrice(id, slot) {
    const byName = LA().skillUnlockByName || {};
    const u = (byName[DS.heroes[id].nameEn] || [])[slot];
    if (!u || u.kind === 'default') return slot === 0 ? { kind: 'free' } : { kind: 'gems', amount: FAKE_SKILL_GEMS, orig: 'không rõ' };
    if (u.kind === 'gems' && u.amount) return { kind: 'gems', amount: u.amount };
    if (u.kind === 'real_money' && u.amount) return { kind: 'money', amount: u.amount };
    return { kind: 'gems', amount: FAKE_SKILL_GEMS, orig: KIND_VI[u.kind] || u.kind };
  }
  const priceText = pr => pr.kind === 'money' ? '$' + pr.amount.toFixed(2) : pr.kind === 'gems' ? fmt(pr.amount) + ' đá quý' : 'Miễn phí';

  // ---------------------------------------------------------------- chữ hiển thị
  const tr = id => (LA().tr || {})[id] || {};
  const heroName = id => tr(id).name || DS.heroes[id].name;
  function skillList(id) {
    const h = DS.heroes[id], vi = tr(id).skills || [];
    return (h.skills || [h.skill]).map((s, i) => ({ name: (vi[i] && vi[i].name) || s.name, desc: (vi[i] && vi[i].desc) || s.desc || '',
      cd: s.cd, en: s.name, icon: ((LA().skills || {})[id] || [])[i] }));
  }
  function weaponName(id) {
    const h = DS.heroes[id];
    return h.weapon === 'bad_pistol' ? DS.weapons.bad_pistol.name : (tr(id).weapon || DS.weapons[h.weapon].name);
  }
  const UP_VI = [[/^\+(\d+) Health/i, '+$1 Máu'], [/^\+(\d+) Armor/i, '+$1 Giáp'], [/^\+(\d+) Energy/i, '+$1 Năng lượng'],
    [/^-(\d+)s Skill Cooldown/i, 'Hồi chiêu −$1 giây'], [/Skill Cooldown/i, 'Giảm hồi chiêu'], [/Skill Upgrade/i, 'Nâng cấp kỹ năng'],
    [/Passive Buff/i, 'Tăng nội tại'], [/Enhance Starting Weapon/i, 'Cường hoá vũ khí khởi đầu'], [/Valued Badge/i, 'Huy hiệu quý (bộ đàm)']];
  function upVi(s) { for (const [re, v] of UP_VI) if (re.test(s)) return s.replace(re, v).replace(/\s*\(.*\)$/, ''); return s; }
  // Chỉ máu / giáp / năng lượng có hiệu lực ở bản web; phần còn lại là đổi kỹ năng/nội tại chưa làm.
  function upgradeBonus(id) {
    const b = { hp: 0, armor: 0, energy: 0 }, lv = P.level[id] || 0;
    for (const u of (DS.heroes[id].upgrades || []).slice(0, lv)) {
      let m;
      if ((m = /^\+(\d+) Health/i.exec(u.upgrade))) b.hp += +m[1];
      else if ((m = /^\+(\d+) Armor/i.exec(u.upgrade))) b.armor += +m[1];
      else if ((m = /^\+(\d+) Energy/i.exec(u.upgrade))) b.energy += +m[1];
    }
    return b;
  }
  const upgradeLive = s => /^\+\d+ (Health|Armor|Energy)/i.test(s);

  // ---------------------------------------------------------------- vẽ khung atlas vào canvas DOM
  function drawFit(cv, name, o) {
    const ctx = cv.getContext('2d'), f = A.f[name];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!f) return;
    const k = Math.max(1, Math.floor(Math.min((cv.width - 2) / f[3], (cv.height - 2) / f[4], (o && o.max) || 9)));
    if (o && o.feet) SK.draw(ctx, name, cv.width / 2, cv.height - 2, { sx: k, sy: k });
    else SK.draw(ctx, name, Math.round(cv.width / 2 - f[3] * k / 2 + f[5] * k), Math.round(cv.height / 2 - f[4] * k / 2 + f[6] * k), { sx: k, sy: k });
  }
  const heroAnim = (id, kind) => D.heroes[id] && D.heroes[id].s0 && D.heroes[id].s0[kind];
  const heroFrame0 = id => { const a = SK.anim(heroAnim(id, 'idle')); return a && a.f[0]; };

  // ---------------------------------------------------------------- dựng DOM
  const STATS = [
    { k: 'hp', label: 'MÁU', color: '#d8373a', max: 12, icon: 'hp' },        // thang thanh đo bằng mắt trên ảnh chụp [ƯỚC LƯỢNG]
    { k: 'armor', label: 'GIÁP', color: '#9ca3ad', max: 9, icon: 'armor' },
    { k: 'energy', label: 'NĂNG LƯỢNG', color: '#3d7fe0', max: 320, atlas: 'bullet_16' },
    { k: 'crit', label: 'CHÍ MẠNG', color: '#f08a1c', max: 10, icon: 'crit' }
  ];
  function build() {
    if (built) return;
    built = true;
    $('hs-stats').innerHTML = STATS.map(s => '<div class="hs-stat">' +
      (s.icon ? '<img src="' + ART + 'ui/' + s.icon + '.png" alt="">' : '<canvas width="16" height="16" data-atlas="' + s.atlas + '"></canvas>') +
      '<div class="hs-bar"><i id="hs-bar-' + s.k + '" style="background:' + s.color + '"></i><span>' + s.label + '</span></div>' +
      '<b id="hs-val-' + s.k + '"></b></div>').join('');
    for (const cv of document.querySelectorAll('#hs-stats canvas[data-atlas]')) drawFit(cv, cv.dataset.atlas);
    $('hs-list').innerHTML = HEROES.map(id => '<button class="hs-hero" data-id="' + id + '" title="' + esc(heroName(id)) +
      '"><canvas width="32" height="32"></canvas></button>').join('');
    for (const b of document.querySelectorAll('#hs-list .hs-hero')) {
      const f = heroFrame0(b.dataset.id);
      if (f) drawFit(b.firstChild, f, { max: 1, feet: true });
      b.onclick = () => select(b.dataset.id);
    }
    $('hs-prev').onclick = () => step(-1);
    $('hs-next').onclick = () => step(1);
    $('hs-view').onclick = () => { P.view = P.view === 'pix' ? 'art' : 'pix'; save(); refresh(); };
    $('hs-demo').onchange = e => { P.demo = e.target.checked; save(); };
    $('hs-shop').onclick = openShop;
    $('hs-path').onclick = openPath;
    $('hs-passive').onclick = () => info('Nội tại', '<p>' + esc(tr(P.selected).passive || DS.heroes[P.selected].passive || '—') + '</p>' +
      '<p class="hs-note">' + esc(DS.heroes[P.selected].passive || '') + ' — hiệu ứng nội tại do mô-đun kỹ năng lo.</p>');
    $('hs-weapon').onclick = () => {
      const w = DS.weapons[DS.heroes[P.selected].weapon];
      info('Vũ khí khởi đầu', '<p>' + esc(weaponName(P.selected)) + '</p><p class="hs-note">Sát thương ' + w.dmg + ' · Năng lượng ' + (w.cost || 0) +
        ' · Chí mạng ' + (w.crit || 0) + '% · Lệch ' + (w.spread || 0) + '°</p>');
    };
    $('hs-jewel').onclick = () => info('Trang sức', '<p>Chưa đeo trang sức.</p><p class="hs-note">Trang sức chưa có ở bản web.</p>');
    $('hs-back').onclick = openModes;
    $('hs-mode-close').onclick = () => { $('hs-modes').hidden = true; };
    $('hs-portrait').onerror = function () { this.style.visibility = 'hidden'; };
    $('hs-portrait').onload = function () { this.style.visibility = ''; };
    $('hs-modal').onclick = e => { if (e.target === $('hs-modal')) closeDialog(); };
  }

  function select(id) {
    if (!DS.heroes[id] || !(D.heroes && D.heroes[id])) return false;
    P.selected = id; save();
    demoT = 0;
    refresh();
    return true;
  }
  function step(d) {
    const i = HEROES.indexOf(P.selected);
    select(HEROES[(i + d + HEROES.length) % HEROES.length]);
  }

  function refresh() {
    if (!built) return;
    const id = P.selected, h = DS.heroes[id], b = upgradeBonus(id), lv = P.level[id] || 0, open = isUnlocked(id);
    $('hs-name').textContent = heroName(id);
    $('hs-gems').textContent = fmt(P.gems);
    const vals = { hp: h.hp + b.hp, armor: h.armor + b.armor, energy: h.energy + b.energy, crit: h.crit || 0 };
    $('sk-hero-line').textContent = heroName(id) + ' — Máu ' + vals.hp + ' · Giáp ' + vals.armor + ' · Năng lượng ' + vals.energy;
    for (const s of STATS) {
      $('hs-bar-' + s.k).style.width = Math.min(100, vals[s.k] / s.max * 100) + '%';
      $('hs-val-' + s.k).textContent = vals[s.k];
    }
    const nUp = Math.min(7, (h.upgrades || []).length || 7);
    $('hs-stars').innerHTML = Array.from({ length: nUp }, (_, i) =>
      '<img src="' + ART + 'ui/' + (i < lv ? 'star_on' : 'star_off') + '.png" alt="">').join('');
    const f = DS.weapons[h.weapon] && DS.weapons[h.weapon].sprite;
    if (f) drawFit($('hs-weapon-cv'), f, { max: 2 });
    $('hs-weapon').title = weaponName(id);
    $('hs-passive').title = tr(id).passive || h.passive || '';

    const pt = $('hs-portrait');
    const src = (LA().portraits || {})[id] ? ART + 'portrait/' + id + '.png' : '';
    if (pt.getAttribute('src') !== src) { if (src) pt.src = src; else pt.removeAttribute('src'); }
    pt.className = 'hs-portrait' + (P.view === 'pix' || !src ? ' pix' : '') + (open ? '' : ' locked');
    pt.alt = heroName(id);
    $('hs-demo').checked = P.demo !== false;

    const pr = heroPrice(id), lock = $('hs-lockbar');
    lock.hidden = open;
    if (!open) lock.innerHTML = 'Chưa mở khoá · ' + (pr.kind === 'gems' ? '<img src="' + ART + 'ui/gem.png" alt="" style="width:1.1em;vertical-align:-.2em"> ' + fmt(pr.amount) : priceText(pr)) +
      (pr.orig ? ' <small style="opacity:.7">(gốc: ' + esc(pr.orig) + ')</small>' : '');
    $('hs-start-label').textContent = open ? 'Bắt đầu' : 'Mở khoá';
    $('sk-start').classList.toggle('buy', !open);

    renderSkills();
    for (const el of document.querySelectorAll('#hs-list .hs-hero')) {
      el.classList.toggle('sel', el.dataset.id === id);
      el.classList.toggle('locked', !isUnlocked(el.dataset.id));
    }
    const list = $('hs-list'), cur = list.querySelector('.hs-hero.sel');
    if (cur) list.scrollLeft = cur.offsetLeft - list.offsetLeft - (list.clientWidth - cur.offsetWidth) / 2;
  }

  function skillIconStyle(idx) {
    if (idx == null || idx < 0) return '';
    return 'background-position:calc(var(--s) * -' + (idx % 16) + ') calc(var(--s) * -' + Math.floor(idx / 16) + ')';
  }
  function renderSkills() {
    const id = P.selected, list = skillList(id), cur = Math.min(P.slot[id] || 0, list.length - 1);
    const ORD = ['Kỹ năng 1', 'Kỹ năng 2', 'Kỹ năng 3'];
    // Như ảnh chụp: kỹ năng đang dùng mở rộng, xếp đúng thứ tự 1-2-3.
    $('hs-skills').innerHTML = list.map((s, i) => {
      const open = SK.profile.isSkillUnlocked(id, i), on = i === cur, pr = skillPrice(id, i);
      const icon = '<span class="hs-si" style="' + skillIconStyle(s.icon) + '"></span>';
      const sub = on ? 'Đang dùng' : open ? ORD[i] : 'Trả phí để mở · ' + priceText(pr);
      if (on) {
        return '<button class="hs-sk on" data-slot="' + i + '"><span class="hs-sk-top">' + icon + '<span class="hs-sn"><b>' + esc(s.name) +
          '</b><small>' + sub + '</small></span></span><span class="hs-desc">' + esc(s.desc) +
          (s.cd ? '<br><em>Hồi chiêu ' + String(s.cd).replace('.', ',') + ' giây</em>' : '') + '</span></button>';
      }
      return '<button class="hs-sk' + (open ? '' : ' locked') + '" data-slot="' + i + '">' + icon + (open ? '' : '<i class="hs-lk"></i>') +
        '<span class="hs-sn"><b>' + esc(s.name) + '</b><small>' + esc(sub) + '</small></span></button>';
    }).join('');
    for (const el of document.querySelectorAll('#hs-skills .hs-sk')) el.onclick = () => clickSkill(+el.dataset.slot);
  }
  function clickSkill(slot) {
    const id = P.selected;
    if (SK.profile.isSkillUnlocked(id, slot)) { P.slot[id] = slot; save(); refresh(); return; }
    const s = skillList(id)[slot];
    if (!isUnlocked(id)) { info('Kỹ năng ' + (slot + 1), '<p>Mở khoá ' + esc(heroName(id)) + ' trước đã.</p>'); return; }
    buy({ title: 'Mở kỹ năng: ' + s.name, price: skillPrice(id, slot), done() { SK.profile.unlockSkill(id, slot); P.slot[id] = slot; save(); refresh(); } });
  }

  // ---------------------------------------------------------------- hộp thoại
  function dialog(html, buttons) {
    const dlg = $('hs-dlg');
    dlg.innerHTML = html + '<div class="hs-btns">' + buttons.map((b, i) => '<button class="hs-btn' + (b.cls ? ' ' + b.cls : '') + '" data-i="' + i + '"' +
      (b.id ? ' id="' + b.id + '"' : '') + (b.disabled ? ' disabled' : '') + '>' + esc(b.label) + '</button>').join('') + '</div>';
    for (const el of dlg.querySelectorAll('.hs-btns button')) el.onclick = () => { const b = buttons[+el.dataset.i]; (b.fn || closeDialog)(); };
    $('hs-modal').hidden = false;
  }
  function closeDialog() { $('hs-modal').hidden = true; }
  const info = (title, body) => dialog('<h3>' + esc(title) + '</h3>' + body, [{ label: 'Đóng', id: 'hs-close' }]);
  const gemImg = '<img src="' + ART + 'ui/gem.png" alt="">';

  // Mua một món: đá quý thì trừ ngay (không đủ thì chặn), tiền thật thì qua hộp thanh toán giả.
  function buy(item) {
    const pr = item.price;
    if (pr.kind === 'free') { item.done(); return; }
    if (pr.kind === 'money') { fakePay(item.title, pr.amount, () => { item.done(); toastDlg('Đã mở khoá!', item.title); }); return; }
    const enough = P.gems >= pr.amount;
    dialog('<h3>' + esc(item.title) + '</h3><p class="hs-price">' + gemImg + ' ' + fmt(pr.amount) + '</p>' +
      '<p>Bạn đang có ' + fmt(P.gems) + ' đá quý.</p>' +
      (pr.orig ? '<p class="hs-note">Game gốc: ' + esc(pr.orig) + '. Bản web cho đổi bằng đá quý (giá ước lượng).</p>' : '') +
      (enough ? '' : '<p class="hs-bad" id="hs-short">Không đủ đá quý — thiếu ' + fmt(pr.amount - P.gems) + '.</p>'),
    enough
      ? [{ id: 'hs-buy', label: 'Mua', cls: 'ok', fn() { if (SK.profile.spend(pr.amount)) { item.done(); toastDlg('Đã mở khoá!', item.title); } } }, { label: 'Huỷ' }]
      : [{ id: 'hs-buy', label: 'Mua', disabled: true }, { id: 'hs-to-shop', label: 'Cửa hàng', cls: 'ok', fn: openShop }, { label: 'Huỷ' }]);
  }
  function fakePay(title, usd, done) {
    dialog('<h3 class="hs-fake">Thanh toán giả lập — không trừ tiền thật</h3><p>' + esc(title) + '</p>' +
      '<p class="hs-price">$' + usd.toFixed(2) + '</p>' +
      '<p class="hs-note">Bản web làm lại: không nối cổng thanh toán nào, bấm mua là nhận ngay.</p>',
    [{ id: 'hs-pay-ok', label: 'Xác nhận mua', cls: 'ok', fn: done }, { label: 'Huỷ' }]);
  }
  function toastDlg(title, body) { dialog('<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>', [{ label: 'OK', id: 'hs-close', cls: 'ok' }]); }

  // Gói đá quý [ƯỚC LƯỢNG] theo giá cửa hàng SK.
  const PACKS = [[0.99, 500], [1.99, 1100], [4.99, 3000], [9.99, 6500], [19.99, 14000], [49.99, 38000]];
  function openShop() {
    dialog('<h3>Cửa hàng đá quý</h3><p class="hs-note">Mọi gói đều mua giả lập — không trừ tiền thật.</p><div class="hs-packs">' +
      PACKS.map(([usd, g], i) => '<button class="hs-pack" data-pack="' + i + '">' + gemImg + '<b>' + fmt(g) + '</b><span>$' + usd.toFixed(2) + '</span></button>').join('') +
      '</div>', [{ label: 'Đóng', id: 'hs-close' }]);
    for (const el of document.querySelectorAll('.hs-pack')) {
      el.onclick = () => {
        const [usd, g] = PACKS[+el.dataset.pack];
        fakePay(fmt(g) + ' đá quý', usd, () => { SK.profile.addGems(g); toastDlg('Đã nhận ' + fmt(g) + ' đá quý', 'Số dư: ' + fmt(P.gems)); });
      };
    }
  }

  function openPath() {
    const id = P.selected, ups = DS.heroes[id].upgrades || [], lv = P.level[id] || 0, nx = ups[lv];
    const rows = ups.map((u, i) => '<li class="' + (i < lv ? 'done' : '') + '"><span>Cấp ' + u.level + ' · ' + esc(upVi(u.upgrade)) +
      (upgradeLive(u.upgrade) ? '' : ' <small>(chưa có hiệu lực ở bản web)</small>') + '</span><span>' + (i < lv ? 'Xong' : gemImg.replace('alt=""', 'alt="" style="width:1em;vertical-align:-.15em"') + ' ' + fmt(u.cost)) + '</span></li>').join('');
    const btn = !isUnlocked(id) ? [{ label: 'Mở khoá nhân vật trước', disabled: true }]
      : nx ? [{ id: 'hs-up', label: 'Nâng lên cấp ' + nx.level + ' (' + fmt(nx.cost) + ')', cls: 'ok', disabled: P.gems < nx.cost,
        fn() { if (SK.profile.spend(nx.cost)) { P.level[id] = lv + 1; save(); refresh(); openPath(); } } }] : [];
    dialog('<h3>Lộ trình nâng cấp — ' + esc(heroName(id)) + '</h3><ul class="hs-ups">' + rows + '</ul>', btn.concat([{ label: 'Đóng', id: 'hs-close' }]));
  }

  // ---------------------------------------------------------------- chọn chế độ (ảnh i)
  const MODES = [
    { id: 'level', name: 'Chế độ màn chơi', img: 'mode_level.png', ok: true,
      desc: 'Ba tầng Rừng Rậm → Lâu Đài → Núi Lửa, mỗi tầng 5 màn, trùm ở màn cuối. Chơi một mình.' },
    { id: 'season', name: 'Chế độ mùa giải', img: 'mode_season.png', isNew: true, desc: 'Sắp ra mắt — giai đoạn sau sẽ làm chế độ này.' },
    { id: 'warfront', name: 'Tiền tuyến cổ đại', img: 'mode_warfront.png', desc: 'Sắp ra mắt.' }
  ];
  let modeSel = 'level';
  function openModes() {
    $('hs-mode-list').innerHTML = MODES.map(m => '<button class="hs-mode' + (m.id === modeSel ? ' sel' : '') + '" data-mode="' + m.id +
      '" style="background-image:url(' + ART + m.img + ')">' + (m.isNew ? '<i class="hs-new">MỚI!</i>' : '') +
      (m.ok ? '' : '<i class="hs-soon">Sắp ra mắt</i>') + '<span>' + m.name + '</span></button>').join('');
    for (const el of document.querySelectorAll('.hs-mode')) el.onclick = () => { modeSel = el.dataset.mode; openModes(); };
    const m = MODES.find(x => x.id === modeSel);
    $('hs-mode-title').textContent = m.name;
    $('hs-mode-name').textContent = m.name;
    $('hs-mode-img').src = ART + m.img;
    $('hs-mode-desc').textContent = m.desc;
    const go = $('hs-mode-go');
    go.disabled = !m.ok;
    go.textContent = m.ok ? 'Bắt đầu' : 'Sắp ra mắt';
    go.onclick = () => { if (m.ok) $('hs-modes').hidden = true; };
    const f = heroFrame0(P.selected);
    if (f) drawFit($('hs-mode-face'), f, { feet: true });
    $('hs-modes').hidden = false;
  }

  // ---------------------------------------------------------------- vào trận / kết quả
  function applySkillSlot(id) {
    const h = DS.heroes[id];
    if (!h._skill0) h._skill0 = h.skill;
    const slot = P.slot[id] || 0, sk = (h.skills || [])[slot];
    // Kỹ năng 2/3 chỉ dùng khi mô-đun kỹ năng đã có; chưa có thì giữ kỹ năng 1 (actors.js sẽ rơi về Song Thủ).
    h.skill = slot > 0 && sk && SK.SKILLS && SK.SKILLS[slug(sk.name)]
      ? Object.assign({}, h._skill0, { id: slug(sk.name), name: sk.name, cd: sk.cd || h._skill0.cd, dur: 0 })
      : h._skill0;
  }
  function onStart() {
    if (!$('hs-modes').hidden) return;
    const id = P.selected;
    if (!isUnlocked(id)) {
      buy({ title: 'Mở khoá ' + heroName(id), price: heroPrice(id), done() { SK.profile.unlock(id); refresh(); } });
      return;
    }
    closeDialog();
    applySkillSlot(id);
    SK.startRun(id);
  }

  SK.on('runStart', G2 => {
    const p = G2.player; if (!p) return;
    const b = upgradeBonus(p.hero);
    p.hpMax += b.hp; p.hp += b.hp; p.armorMax += b.armor; p.armor += b.armor; p.energyMax += b.energy; p.energy += b.energy;
  });

  // Đá quý cuối lượt: theo số quái hạ + số màn đã qua [ƯỚC LƯỢNG]; SK gốc cũng trả theo quái hạ + tầng đạt được.
  let pending = null;
  SK.on('runEnd', (G2, r) => {
    const cleared = r.won ? SK.STAGES.length : G2.stageIdx;
    const gems = Math.round(r.kills + cleared * 10 + (r.won ? 100 : 0));
    P.gems += gems; save();
    pending = { hero: G2.player ? G2.player.hero : P.selected, stage: r.stage, kills: r.kills, gold: r.gold, won: r.won, cleared, gems };
  });
  function showSummary() {
    const s = pending; pending = null;
    dialog('<h3>' + (s.won ? 'Chiến thắng!' : 'Kết quả lượt chơi') + '</h3>' +
      '<p>' + esc(heroName(s.hero)) + ' · tới màn ' + esc(s.stage) + ' · qua ' + s.cleared + ' màn</p>' +
      '<p>Hạ ' + s.kills + ' quái · ' + s.gold + ' vàng</p>' +
      '<p class="hs-price">+' + fmt(s.gems) + ' ' + gemImg + '</p>' +
      '<p class="hs-note">Đá quý = số quái hạ + 10 mỗi màn qua (+100 khi thắng) — công thức ước lượng.</p>',
    [{ label: 'Nhận', id: 'hs-claim', cls: 'ok' }]);
  }

  // ---------------------------------------------------------------- nền sảnh + nhân vật pixel trên canvas chính
  const hall = new Image();
  hall.src = ART + 'hall.png';
  const CIRCLE = [215, 297];   // tâm vòng phép trong hall.png (đo trên ảnh)
  let t = 0, demoT = 0;

  function drawPixelHero(ctx, id, x, y, tt) {
    const moving = P.demo !== false && Math.abs(Math.cos(tt * 0.9)) > 0.3;
    const face = P.demo !== false ? (Math.cos(tt * 0.9) >= 0 ? 1 : -1) : 1;
    const key = moving ? heroAnim(id, 'run') : heroAnim(id, 'idle');
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    SK.draw(ctx, SK.animFrame(key, tt), x, y, { flip: face < 0 });
    const w = DS.weapons[DS.heroes[id].weapon];
    const hand = DS.heroes[id].hand || [3, 6];
    if (w && SK.drawGun) SK.drawGun(ctx, w.sprite, x + hand[0] * face, y - hand[1], face > 0 ? 0 : Math.PI, null, {});
  }

  SK.lobby = {
    enter() {
      G.state = 'lobby'; G.player = null; G.map = null;
      SK.setOverlay('sk-lobby');
      build();
      $('hs-modes').hidden = true;
      closeDialog();
      $('sk-start').onclick = onStart;
      refresh();
      if (pending) showSummary();
    },
    update(dt) {
      t += dt; demoT += dt;
      const I = SK.input;
      const busy = !$('hs-modal').hidden || !$('hs-modes').hidden;
      const ae = document.activeElement, onBtn = ae && ae.tagName === 'BUTTON' && !ae.classList.contains('hs-hero');
      if (I.hit('confirm') && !busy && !onBtn) onStart();
      if (!busy) { if (I.hit('left')) step(-1); if (I.hit('right')) step(1); }
    },
    render(ctx) {
      const v = SK.view, pix = P.view === 'pix', id = P.selected;
      ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, v.w, v.h);
      const z = pix ? Math.max(2, Math.round(v.h / 64)) : 1;
      const cx = Math.round(v.w / 2), cy = Math.round(v.h * (pix ? 0.6 : 0.5));
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(z, z);
      const ox = pix ? CIRCLE[0] : hall.width / 2, oy = pix ? CIRCLE[1] : hall.height / 2;
      if (hall.complete && hall.naturalWidth) ctx.drawImage(hall, -Math.round(ox), -Math.round(oy));
      if (pix) {
        const x = P.demo !== false ? Math.round(Math.sin(demoT * 0.9) * 22) : 0;
        drawPixelHero(ctx, id, x, 2, demoT);
      }
      ctx.restore();
      if (!pix) { ctx.fillStyle = 'rgba(4,10,18,0.6)'; ctx.fillRect(0, 0, v.w, v.h); }
      if (built) {
        const av = $('hs-avatar'), a = av.getContext('2d');
        a.imageSmoothingEnabled = false;
        a.clearRect(0, 0, av.width, av.height);
        SK.draw(a, SK.animFrame(heroAnim(id, 'idle'), t), av.width / 2, av.height - 3);
      }
    },
    select, openModes, openShop, refresh
  };
})();
