// Việc làm của từng món nội thất trong sảnh đi (SK.HALL_USE[slot] = fn(zone), gọi từ js/hall.js khi bấm E / Enter / chạm):
// Két Sắt, Nhân Viên Chuyển Phát, Hộp Thư, Máy Đổi, Thùng Rác, Du Lịch Lợi Hại, Standee (Gallery), Máy Game. Món khác: hall.js
// hiện tên + "Chưa có ở bản web". Lời thoại là chuỗi Việt chính thức [LOC <khoá>]; số liệu ghi nguồn tại chỗ (HALL.md mục 1-3).
// Hộp thoại dùng SK.lobby.dialog (DOM #hs-modal của lobby.js). Kinh tế đọc/ghi qua SK.profile (không đọc hồ sơ trực tiếp).
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, L = SK.lobby, P = SK.profile, USE = SK.HALL_USE;
  const DB = window.SK_ITEMS || { items: {}, drops: {} };
  if (!L || !P || !USE) return;
  const { esc, fmt, gemImg } = L;

  // Kiểu nhỏ cho danh sách trong hộp thoại (icon cắt từ art/items/items0.png).
  const st = document.createElement('style');
  st.textContent = '.sk-list{list-style:none;margin:calc(var(--u)*1) 0;padding:0;max-height:46vh;overflow:auto;text-align:left}' +
    '.sk-list li{display:flex;align-items:center;gap:calc(var(--u)*1.4);padding:calc(var(--u)*.9) 0;border-bottom:1px solid #2c3340;font-size:calc(var(--u)*3)}' +
    '.sk-list li>b{margin-left:auto;color:#ffd452;font-weight:400}' +
    '.sk-list li small{display:block;color:#9aa3b0;font-size:calc(var(--u)*2.4)}' +
    '.sk-list .hs-btn{min-width:0;padding:calc(var(--u)*.8) calc(var(--u)*2);font-size:calc(var(--u)*3)!important}' +
    '.sk-ic{display:inline-block;flex:none;vertical-align:middle;image-rendering:pixelated;background-repeat:no-repeat}' +
    '.sk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*17),1fr));gap:calc(var(--u)*1.2);margin:calc(var(--u)*1.2) 0;max-height:46vh;overflow:auto}' +
    '.sk-grid div{background:#12171f;border:1px solid #2c3340;border-radius:6px;padding:calc(var(--u)*1);text-align:center;font-size:calc(var(--u)*2.4)}' +
    '.sk-grid canvas{display:block;margin:0 auto calc(var(--u)*.6);image-rendering:pixelated}';
  document.head.appendChild(st);

  const itemOf = k => DB.items[k];
  const itemName = k => (itemOf(k) ? itemOf(k).vi : k);
  function icon(k) {
    const d = itemOf(k), ic = d && d.icon;
    if (!ic) return '<span class="sk-ic" style="width:24px;height:24px"></span>';
    return '<span class="sk-ic" style="width:' + ic[2] + 'px;height:' + ic[3] + 'px;background-image:url(' + DB.sheet + '?v=20261010e);background-position:-' + ic[0] + 'px -' + ic[1] + 'px"></span>';
  }
  const wName = id => (DS.weapons[id] && DS.weapons[id].name) || id;
  const CLOSE = { label: 'Đóng', id: 'hs-close' };

  // Mở hộp thoại rồi đưa tiêu điểm vào nút chính để Enter / Space bấm được ngay.
  function dlg(html, buttons) {
    L.dialog(html, buttons);
    setTimeout(() => {
      const b = document.querySelector('#hs-dlg .hs-btn.ok:not([disabled])') || document.querySelector('#hs-dlg .hs-btn:not([disabled])');
      if (b) b.focus();
    }, 0);
  }
  const msg = (title, body, back) => dlg('<h3>' + esc(title) + '</h3>' + body, back ? [{ label: 'Quay lại', id: 'hs-back', cls: 'ok', fn: back }, CLOSE] : [CLOSE]);
  addEventListener('keydown', e => { if (e.key === 'Escape' && SK.G.state === 'hall' && L.dialogOpen) L.closeDialog(); });

  // ---------------------------------------------------------------- kho vật liệu (xem trong Két Sắt)
  const TYPE_VI = { mat: 'Vật liệu', seed: 'Hạt Giống', bp: 'Bản Vẽ', token: 'Vé Đổi' };   // [LOC items/seed, items/blueprint, mall/itemtype_token]
  function openInv(back) {
    const inv = P.items(), keys = Object.keys(inv).filter(k => itemOf(k)).sort((a, b) => {
      const A = itemOf(a), B = itemOf(b);
      return Object.keys(TYPE_VI).indexOf(A.t) - Object.keys(TYPE_VI).indexOf(B.t) || A.vi.localeCompare(B.vi, 'vi');
    });
    let html = '<h3>Nguyên liệu</h3>';
    if (!keys.length) html += '<p>Chưa có vật liệu nào. Hạ quái trong hầm để nhặt vật liệu, hạt giống và bản vẽ.</p>';
    else {
      html += '<ul class="sk-list" id="sk-inv">' + keys.map(k => '<li data-k="' + esc(k) + '">' + icon(k) + '<span>' + esc(itemName(k)) +
        '<small>' + esc(TYPE_VI[itemOf(k).t] || '') + '</small></span><b>×' + fmt(inv[k]) + '</b></li>').join('') + '</ul>';
    }
    dlg(html, [{ label: 'Quay lại', id: 'hs-back', cls: 'ok', fn: back }, CLOSE]);
  }

  // ---------------------------------------------------------------- Két Sắt: nâng cấp bằng đá, tăng vàng đầu ván
  function safe(z, note) {
    const s = P.safe, gems = P.gems;
    let html = '<h3>Két Sắt</h3><p>Vàng ban đầu: <b>+' + s.gold + '</b> mỗi ván (cấp ' + s.level + '/' + s.max + ')</p>';
    const btns = [];
    if (!s.open) html += '<p class="hs-bad" id="sk-safe-lock">Chưa mở: vượt ải 2-2 một lần để mở Két Sắt (ván xa nhất: ' + P.stats.best + ' màn).</p>';
    else if (s.level >= s.max) html += '<p>Đã đạt cấp tối đa.</p>';
    else {
      html += '<p class="hs-price">' + gemImg + ' ' + fmt(s.nextCost) + '</p><p>Nâng lên cấp ' + (s.level + 1) + ': vàng ban đầu +' + s.nextGold + '. Bạn đang có ' + fmt(gems) + ' đá quý.</p>';
      if (gems < s.nextCost) html += '<p class="hs-bad" id="sk-safe-short">Không đủ đá quý — thiếu ' + fmt(s.nextCost - gems) + '.</p>';
      btns.push({ id: 'sk-safe-up', label: 'Nâng cấp', cls: 'ok', disabled: gems < s.nextCost, fn() {
        const r = P.upgradeSafe();
        safe(z, r.ok ? 'Đã nâng Két Sắt lên cấp ' + r.level + ': vàng ban đầu +' + r.gold + ' (đã trừ ' + fmt(r.cost) + ' đá).' : 'Không nâng được.');
      } });
    }
    if (note) html += '<p id="sk-safe-note">' + esc(note) + '</p>';
    // [LOC I_tip_12]; giá/vàng cấp 1 và 5 theo [WIKI], cấp giữa nội suy [ƯỚC LƯỢNG].
    html += '<p class="hs-note">Tăng cấp vật phẩm trong phòng nhận cường hóa thuộc tính vĩnh viễn.</p>';
    btns.push({ id: 'sk-safe-inv', label: 'Nguyên liệu', fn: () => openInv(() => safe(z)) }, CLOSE);
    dlg(html, btns);
  }
  USE.safe = z => safe(z);

  // ---------------------------------------------------------------- Nhân Viên Chuyển Phát: 500 đá + 1 vũ khí, một lần mỗi ngày
  const POST_GEMS = 500, POST_PLUS = 100;   // [WIKI soul-knight.fandom.com/wiki/Gems; LOC item/postmanUpgrade_desc +100]
  const POST_PRICE = 1.99;                  // nâng cấp gốc = 20 Cá Khô (tiền thật); giá USD giả lập [ƯỚC LƯỢNG]
  function upgradeBtn(z) {
    return P.postmanPlus ? [] : [{ id: 'sk-post-up', label: 'Tăng dịch vụ chuyển phát nhanh', fn: () => L.fakePay('Tăng dịch vụ chuyển phát nhanh (+' + POST_PLUS + ' đá mỗi ngày)', POST_PRICE, () => {
      P.upgradePostman(); postman(z, 'Đã nâng cấp: mỗi ngày nhận thêm +' + POST_PLUS + ' đá.');
    }) }];
  }
  function postman(z, note) {
    const gems = POST_GEMS + (P.postmanPlus ? POST_PLUS : 0);
    if (P.dailyDone('postman')) {
      dlg('<h3>Nhân Viên Chuyển Phát</h3><p id="sk-post-gone">Mai gặp</p>' + (note ? '<p id="sk-post-note">' + esc(note) + '</p>' : ''), upgradeBtn(z).concat([CLOSE]));
      return;
    }
    dlg('<h3>Nhân Viên Chuyển Phát</h3><p>Bạn có bưu kiện, vui lòng ký nhận</p><p>Gói Hàng: <b>+' + fmt(gems) + '</b> ' + gemImg + ' và 1 vũ khí ngẫu nhiên (cất vào hòm vũ khí).</p>' +
      (note ? '<p id="sk-post-note">' + esc(note) + '</p>' : ''),
    [{ id: 'sk-post-sign', label: 'Ký nhận', cls: 'ok', fn() {
      if (P.boxFull) { postman(z, 'Hòm vũ khí đầy, hãy bỏ bớt vũ khí ở Thùng Rác rồi quay lại.'); return; }
      const id = SK.pick(DS.weaponPool(2, 'chest', SK.rand));
      P.addBox(id); P.addGems(gems); P.markDaily('postman');
      postman(z, 'Đã nhận ' + fmt(gems) + ' đá và ' + wName(id) + '.');
    } }].concat(upgradeBtn(z), [CLOSE]));
  }
  USE.postman = z => postman(z);

  // ---------------------------------------------------------------- Hộp Thư
  const rewardText = r => [r.gems ? fmt(r.gems) + ' ' + gemImg : ''].concat(Object.keys(r.items || {}).map(k => esc(itemName(k)) + ' ×' + r.items[k])).filter(Boolean).join(' · ');
  const hasReward = r => !!(r && (r.gems || Object.keys(r.items || {}).length));
  function mailbox(z, note) {
    const mails = P.mail;
    let html = '<h3>Hộp Thư</h3>';
    if (!mails.length) html += '<p id="sk-mail-empty">Hộp thư trồng...</p>';
    else {
      html += '<ul class="sk-list" id="sk-mail">' + mails.map(m => '<li data-id="' + esc(m.id) + '"><span><b style="font-weight:400;color:#fff">' + esc(m.title) + '</b><small>' + esc(m.body) + '</small>' +
        (hasReward(m.reward) ? '<small>Thưởng: ' + rewardText(m.reward) + '</small>' : '') + '</span>' +
        '<button class="hs-btn ok" data-act="' + (hasReward(m.reward) ? 'claim' : 'del') + '" data-id="' + esc(m.id) + '">' + (hasReward(m.reward) ? 'Nhận' : 'Xóa') + '</button></li>').join('') + '</ul>';
    }
    if (note) html += '<p id="sk-mail-note">' + esc(note) + '</p>';
    const claimable = mails.filter(m => hasReward(m.reward));
    dlg(html, [claimable.length > 1 ? { id: 'sk-mail-all', label: 'Nhận nhanh', cls: 'ok', fn() {
      let g = 0; for (const m of claimable) g += (P.claimMail(m.id) || {}).gems | 0;
      mailbox(z, 'Đã nhận ' + claimable.length + ' thư' + (g ? ', +' + fmt(g) + ' đá' : '') + '.');
    } } : null, { id: 'sk-mail-delread', label: 'Xóa đã đọc', fn() {
      const n = mails.filter(m => !hasReward(m.reward) && P.deleteMail(m.id)).length;
      mailbox(z, n ? 'Đã xóa ' + n + ' thư.' : 'Không có thư nào để xóa.');
    } }, CLOSE].filter(Boolean));
    for (const b of document.querySelectorAll('#sk-mail button')) {
      b.onclick = () => {
        if (b.dataset.act === 'claim') { const r = P.claimMail(b.dataset.id); mailbox(z, r ? 'Đã nhận thưởng' + (r.gems ? ': +' + fmt(r.gems) + ' đá' : '') + '.' : ''); }
        else { P.deleteMail(b.dataset.id); mailbox(z); }
      };
    }
  }
  USE.mail_box = z => mailbox(z);

  // ---------------------------------------------------------------- Máy Đổi: Vé Đổi -> vũ khí / hạt giống theo ItemLevel
  // [CFG items.TokenTicket: TokenType 1 vũ khí, 3 hạt giống; ItemLevel = độ hiếm 0..5]. Vé skin/anh hùng/bản vẽ/phụ kiện: chưa có
  // đích đổi ở web nên báo "Không có vật phẩm có thể đổi" [LOC item/token_machine_nothing].
  const tokenKind = k => (/^token_(weapon|seed)_/.exec(k) || [])[1] || null;
  function redeemTarget(k) {
    const lv = (itemOf(k) || {}).level | 0, kind = tokenKind(k);
    if (kind === 'weapon') {
      const g = DS.weaponGrades || {}, grade = Math.min(5, lv + 1);
      return (g[grade] || []).length ? { kind, grade } : null;
    }
    if (kind === 'seed') return Object.keys(DB.items).some(s => DB.items[s].t === 'seed' && DB.items[s].level === lv) ? { kind, lv } : null;
    return null;
  }
  function redeem(k) {
    const t = redeemTarget(k);
    if (!t) return null;
    if (t.kind === 'weapon') {
      if (P.boxFull) return { err: 'Hòm vũ khí đầy, hãy bỏ bớt vũ khí ở Thùng Rác.' };
      P.spendItem(k, 1);
      const id = SK.pick(DS.weaponGrades[t.grade]);
      P.addBox(id);
      return { text: wName(id) + ' (cất vào hòm vũ khí)' };
    }
    P.spendItem(k, 1);
    const seed = SK.pick(Object.keys(DB.items).filter(s => DB.items[s].t === 'seed' && DB.items[s].level === t.lv));
    P.addItem(seed, 1);
    return { text: itemName(seed) };
  }
  function tokenMachine(z, note) {
    const inv = P.items(), toks = Object.keys(inv).filter(k => itemOf(k) && itemOf(k).t === 'token');
    let html = '<h3>Máy Đổi</h3><p>Không biết dùng Vé Đổi ở đâu? Lại đây thử xem.</p>';
    if (!toks.length) html += '<p class="hs-bad" id="sk-token-none">Cần Vé Đổi</p>';
    else {
      html += '<ul class="sk-list" id="sk-tokens">' + toks.map(k => '<li>' + icon(k) + '<span>' + esc(itemName(k)) + '<small>×' + inv[k] + (redeemTarget(k) ? '' : ' · Không có vật phẩm có thể đổi') + '</small></span>' +
        '<button class="hs-btn ok" data-k="' + esc(k) + '"' + (redeemTarget(k) ? '' : ' disabled') + '>Đổi</button></li>').join('') + '</ul>';
    }
    if (note) html += '<p id="sk-token-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    for (const b of document.querySelectorAll('#sk-tokens button')) {
      b.onclick = () => { const r = redeem(b.dataset.k); tokenMachine(z, r ? (r.err || 'Nhận: ' + r.text) : 'Không có vật phẩm có thể đổi'); };
    }
  }
  USE.token_machine = z => tokenMachine(z);

  // ---------------------------------------------------------------- Thùng Rác: bỏ vũ khí trong hòm
  function trash(z, note) {
    const box = P.box;
    let html = '<h3>Thùng Rác</h3>';
    if (!box.length) html += '<p id="sk-trash-empty">Hòm vũ khí đang trống, không có vũ khí để bỏ.</p>';
    else html += '<p>Muốn bỏ vũ khí hiện tại?</p><ul class="sk-list" id="sk-trash">' + box.map((id, i) => '<li><span>' + esc(wName(id)) + '</span><button class="hs-btn ok" data-i="' + i + '">Bỏ</button></li>').join('') + '</ul>';
    if (note) html += '<p id="sk-trash-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    for (const b of document.querySelectorAll('#sk-trash button')) {
      b.onclick = () => { const id = box[+b.dataset.i]; P.dropBox(id); trash(z, 'Đã bỏ ' + wName(id) + '.'); };
    }
  }
  USE.trash_can = z => trash(z);

  // ---------------------------------------------------------------- Du Lịch Lợi Hại: công tắc độ khó (SK.profile.setBadass)
  function hostess(z, note) {
    const open = P.badassOpen(), bad = P.badass;
    if (!open) {
      dlg('<h3>Du Lịch Lợi Hại</h3><p id="sk-host-lock">Chưa mở: vượt Chế độ Ải một lần để mở độ khó Lợi Hại.</p>', [CLOSE]);
      return;
    }
    dlg('<h3>Du Lịch Lợi Hại</h3><p>Hiện tại: <b>' + (bad ? 'Du Lịch Lợi Hại' : 'Du Lịch Bình Thường') + '</b></p><p id="sk-host-ask">' +
      (bad ? 'Đổi sang trạng thái Du Lịch Bình Thường?' : 'Đổi sang Du Lịch Lợi Hại?') + '</p>' + (note ? '<p id="sk-host-note">' + esc(note) + '</p>' : ''),
    [{ id: 'sk-host-yes', label: 'Đổi', cls: 'ok', fn() { P.setBadass(!bad); hostess(z, 'Du lịch vui vẻ!'); } }, { label: 'Thôi' }]);
  }
  USE.hostess = z => hostess(z);

  // ---------------------------------------------------------------- Standee (Gallery): hình nhân vật đã mở khoá
  function heroCanvas(id) {
    const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56;
    const hd = SK.heroSkin && SK.heroSkin(id, P.skinOf ? P.skinOf(id) : 0), ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (hd) {
      const name = SK.animFrame(hd.idle, 0), f = SK.frame(name);
      if (f) { const k = Math.max(1, Math.floor(Math.min(52 / f[3], 52 / f[4], 3))); SK.draw(ctx, name, 28, 54, { sx: k, sy: k }); }
    }
    return cv;
  }
  function gallery() {
    const ids = P.unlocked, total = Object.keys(DS.heroes).length;
    dlg('<h3>Standee</h3><p id="sk-gal-count">Đã mở khóa ' + ids.length + '/' + total + ' nhân vật.</p><div class="sk-grid" id="sk-gal"></div>', [CLOSE]);
    const g = document.getElementById('sk-gal');
    for (const id of ids) {
      if (P.skinOf && P.skinOf(id) && SK.loadPack) SK.loadPack(id);
      const d = document.createElement('div');
      d.appendChild(heroCanvas(id));
      d.appendChild(document.createTextNode(DS.heroes[id].name));
      g.appendChild(d);
    }
  }
  USE.gallery = () => gallery();

  // ---------------------------------------------------------------- Máy Game: bốn câu bảo trì quay vòng [LOC arcade_machine/talk_0..3]
  const ARCADE = ['Máy Game đang bảo trì, xin hãy chờ!', 'Các kỹ sư đang nghiên cứu, xin hãy chờ!', 'Đang viết code game, xin hãy chờ!', 'Đang vẽ đồ họa, xin hãy chờ!'];
  let arcadeN = 0;
  USE.arcade_machine = () => msg('Máy Game', '<p id="sk-arcade-talk">' + esc(ARCADE[arcadeN++ % ARCADE.length]) + '</p>');
})();
