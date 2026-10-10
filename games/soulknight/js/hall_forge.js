// Khu Xưởng của sảnh đi (HALL.md 1.2, 2.3-2.4, bước 4-5): Bàn Thiết Kế (nghiên cứu bản vẽ), Bàn Rèn (rèn vũ khí từ vật liệu), Rương
// (chọn vũ khí mang vào ván kế). Dữ liệu: data/sk-forge.js (tools/items/build_forge.py: weapons.Materials + items.BluePrint).
// Quy ước nguồn: [LOC khoá] = localization_en_vi.json, [CFG bảng.khoá] = config 8.6, [WIKI] = số fandom/touchtapplay, [ƯỚC LƯỢNG] = tự đặt.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, L = SK.lobby, P = SK.profile, USE = SK.HALL_USE, UI = SK.HALL_UI, F = window.SK_FORGE;
  if (!L || !P || !USE || !UI || !F) return;
  const { esc, fmt } = L, { dlg, icon, itemName, itemOf, wName, CLOSE } = UI;

  // Công thức theo id vũ khí của web (khoá config = tên prefab; DS.weaponId đổi sang slug wiki khi có).
  const toId = DS.weaponId || (x => x);
  const RECIPE = {};
  for (const pf of Object.keys(F.forge)) { const id = toId(pf); if (DS.weapons[id]) RECIPE[id] = Object.assign({ pf }, F.forge[pf]); }
  // Số lần nhận để mở rèn theo độ hiếm trắng/lục/lam/tím/cam/đỏ = 2/3/4/6/6/8 [LOC forge/intro_tips_1]; thần thoại: nhận thưởng 1 lần [LOC forge/intro_tips_2].
  const NEED = [2, 3, 4, 6, 6, 8, 1];
  const GRADE_VI = ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam', 'Đỏ', 'Thần Thoại'];
  const GRADE_COL = ['#e8e8e8', '#7be07b', '#6fb7ff', '#c58cff', '#ffae4a', '#ff6b6b', '#ffd452'];
  const need = r => NEED[r.grade] || 8;
  const matName = k => (k === 'material_gem' ? 'Đá' : itemName(k));
  const have = k => (k === 'material_gem' ? P.gems : P.item(k));
  const canPay = mats => mats.every(([k, n]) => have(k) >= n);
  function pay(mats) {   // trừ đủ hoặc không trừ gì
    if (!canPay(mats)) return false;
    for (const [k, n] of mats) { if (k === 'material_gem') P.spend(n); else P.spendItem(k, n); }
    return true;
  }
  const matsHtml = mats => mats.map(([k, n]) => '<span style="color:' + (have(k) >= n ? '#9dffcb' : '#ff8a8a') + '">' + esc(matName(k)) + ' ' + fmt(Math.min(have(k), n)) + '/' + fmt(n) + '</span>').join(' · ');
  const bpName = k => (itemOf(k) ? itemName(k) : 'Bản Vẽ ' + ((F.blueprints[k] && F.blueprints[k].target) || k.replace(/^blueprint_/, '')));
  const unlocked = (id, r) => P.picked(id) >= need(r) && (!r.bp || P.devd(r.bp));
  const byName = (a, b) => wName(a).localeCompare(wName(b), 'vi');

  // ---------------------------------------------------------------- Bàn Rèn
  const FORGE_DISC = 'Búa nhỏ 40, búa lớn 80! Gì cơ, bạn chỉ dùng một nhát mà đã rèn ra đúng Vũ Khí mong muốn?';   // [LOC object/forge_disc]
  function forge(z, note) {
    const ids = Object.keys(RECIPE), ok = ids.filter(id => unlocked(id, RECIPE[id]));
    ok.sort((a, b) => (canPay(RECIPE[b].mats) - canPay(RECIPE[a].mats)) || RECIPE[b].grade - RECIPE[a].grade || byName(a, b));
    // Đang mở khoá: đã nhận ít nhất 1 lần nhưng chưa đủ (hoặc đủ lần mà còn thiếu bản vẽ).
    const prog = ids.filter(id => !ok.includes(id) && P.picked(id) > 0).sort((a, b) => RECIPE[b].grade - RECIPE[a].grade || byName(a, b)).slice(0, 30);
    const fg = P.forged;
    let html = '<h3>Bàn Rèn</h3><p class="hs-note">' + esc(FORGE_DISC) + '</p><p id="sk-forge-count">Đồ đã rèn: <b>' + fg.length + '/4</b>' +
      (fg.length ? ' — ' + fg.map(id => esc(wName(id))).join(', ') : '') + '</p>';
    if (!ok.length) html += '<p class="hs-bad" id="sk-forge-empty">Không có vũ khí có thể chế tạo</p>';
    else html += '<ul class="sk-list" id="sk-forge">' + ok.map(id => { const r = RECIPE[id];
      return '<li data-id="' + esc(id) + '"><span><b style="font-weight:400;color:' + GRADE_COL[r.grade] + '">' + esc(wName(id)) + '</b><small>' + matsHtml(r.mats) + '</small></span>' +
        '<button class="hs-btn ok" data-id="' + esc(id) + '">Rèn</button></li>'; }).join('') + '</ul>';
    if (prog.length) html += '<p class="hs-note">Tiến độ mở khóa rèn:</p><ul class="sk-list" id="sk-forge-prog">' + prog.map(id => { const r = RECIPE[id], n = P.picked(id);
      return '<li data-id="' + esc(id) + '"><span>' + esc(wName(id)) + '<small>' + (n >= need(r) ? 'Cần nghiên cứu bản vẽ ở Bàn Thiết Kế' : 'Mở khóa rèn vũ khí này (' + n + '/' + need(r) + ')') + '</small></span></li>'; }).join('') + '</ul>';
    if (note) html += '<p id="sk-forge-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    for (const b of document.querySelectorAll('#sk-forge button')) b.onclick = () => {
      const id = b.dataset.id, r = RECIPE[id];
      if (P.forgedFull) { forge(z, 'Không thể để thêm vũ khí nữa'); return; }                   // [LOC object/forge_full]
      if (!pay(r.mats)) { forge(z, 'Nguyên liệu không đủ'); return; }                           // [LOC object/no_enough_material]
      P.addForged(id);
      forge(z, 'Đã rèn ' + wName(id) + '. Mang vào ván kế ở Rương.');
    };
  }
  USE.forge = z => forge(z);

  // ---------------------------------------------------------------- Bàn Thiết Kế
  const BP_TYPE = { 7: 'Vũ khí', 8: 'Tiến hóa vũ khí', 5: 'Skin', 4: 'Kỹ năng', 6: 'Biến thân anh hùng', 3: 'Nội thất', 0: 'Khung vườn', 1: 'Phòng nối máy', 2: 'Cơ giáp' };   // [CFG items.BluePrint.BlueprintType]
  function station(z, note) {
    const inv = P.items(), keys = Object.keys(inv).filter(k => /^blueprint_/.test(k) && F.blueprints[k]).sort((a, b) => bpName(a).localeCompare(bpName(b), 'vi'));
    const done = Object.keys(P.devdAll).length;
    let html = '<h3>Bàn Thiết Kế</h3><p class="hs-note">Chỉ cần mang nguyên liệu cần thiết, cái gì cũng làm được.</p><p id="sk-station-done">Đã nghiên cứu: <b>' + done + '</b> bản vẽ.</p>';   // [LOC object/weapon_station_disc]
    if (!keys.length) html += '<p class="hs-bad" id="sk-station-empty">Chưa thu thập được Bản Vẽ Vũ Khí</p>';                                       // [LOC object/weapon_station_no_bluprint]
    else html += '<ul class="sk-list" id="sk-station">' + keys.map(k => { const b = F.blueprints[k];
      return '<li data-k="' + esc(k) + '">' + icon(k) + '<span>' + esc(bpName(k)) + ' ×' + inv[k] + '<small>' + esc(BP_TYPE[b.type] || '') + (P.devd(k) ? ' · đã nghiên cứu' : '') + '</small>' +
        '<small>' + (b.mats.length ? matsHtml(b.mats) : 'Miễn phí') + '</small></span><button class="hs-btn ok" data-k="' + esc(k) + '">Nghiên cứu</button></li>'; }).join('') + '</ul>';
    if (note) html += '<p id="sk-station-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    for (const b of document.querySelectorAll('#sk-station button')) b.onclick = () => {
      const k = b.dataset.k, def = F.blueprints[k];
      if (P.item(k) < 1) { station(z); return; }
      if (!canPay(def.mats)) { station(z, 'Nguyên liệu không đủ'); return; }
      pay(def.mats); P.spendItem(k, 1); P.markDevd(k);
      const rid = def.type === 7 ? toId(def.target) : null, r = rid && RECIPE[rid];
      const tail = r ? ' Rèn được ' + wName(rid) + ' khi đủ ' + need(r) + ' lần nhận.' : def.type === 3 ? ' Nội thất đã dựng xong, dùng được ngay trong sảnh.' : '';
      station(z, 'Đã nghiên cứu ' + bpName(k) + '.' + tail);
    };
  }
  USE.station = z => station(z);

  // ---------------------------------------------------------------- Rương: 1 vũ khí miễn phí cho mỗi lượt [LOC Object_chest_L1]
  function chest(z, note) {
    const box = P.box, fg = P.forged, c = P.carry;
    const row = (id, from, i) => '<li><span>' + esc(wName(id)) + '<small>' + (from === 'forged' ? 'Đồ rèn, dùng một ván' : 'Vũ khí trong hòm') + '</small></span>' +
      (c && c.id === id && c.from === from ? '<b>Đã chọn</b>' : '<button class="hs-btn ok" data-id="' + esc(id) + '" data-from="' + from + '">Mang vào ván</button>') + '</li>';
    let html = '<h3>Rương</h3><p class="hs-note">Cất vật phẩm. 1 vũ khí miễn phí cho mỗi lượt.</p>';
    html += c ? '<p id="sk-chest-pick">Ván kế mang theo: <b>' + esc(wName(c.id)) + '</b></p>' : '<p id="sk-chest-pick">Chưa chọn vũ khí mang theo.</p>';
    if (!box.length && !fg.length) html += '<p id="sk-chest-empty">Rương trống: nhận vũ khí từ Nhân Viên Chuyển Phát, Máy Đổi, Máy Quay Trứng hoặc rèn ở Bàn Rèn.</p>';
    else html += '<ul class="sk-list" id="sk-chest">' + fg.map((id, i) => row(id, 'forged', i)).join('') + box.map((id, i) => row(id, 'box', i)).join('') + '</ul>';
    if (note) html += '<p id="sk-chest-note">' + esc(note) + '</p>';
    dlg(html, (c ? [{ id: 'sk-chest-clear', label: 'Bỏ chọn', fn() { P.setCarry(null); chest(z, 'Đã bỏ chọn.'); } }] : []).concat([CLOSE]));
    for (const b of document.querySelectorAll('#sk-chest button[data-id]')) b.onclick = () => {
      if (P.setCarry(b.dataset.id, b.dataset.from)) chest(z, 'Ván kế sẽ mang ' + wName(b.dataset.id) + ' ở ô vũ khí thứ hai.');
    };
  }
  USE.chest = z => chest(z);
  SK.hallForge = { recipes: RECIPE, need, unlocked: id => !!RECIPE[id] && unlocked(id, RECIPE[id]) };
})();
