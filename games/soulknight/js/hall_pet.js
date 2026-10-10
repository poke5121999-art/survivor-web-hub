// Bảng chọn thú cưng trong sảnh đi: bấm E cạnh thú cưng đang theo chủ (js/hall.js) hoặc ô Thức Ăn Mèo (pet_food).
// Lưới thú cưng (ảnh từ prefab, trạng thái ide), tên, kỹ năng + mô tả, giá / điều kiện, nút Chọn / Mua / Cho ăn.
// Luật theo wiki trang Pets [WIKI Pets], số liệu ở data/sk-pets.js (unlock, food, affMax); hồ sơ: SK.profile.petOwned/buyPet/setPet/petAff/feedPet.
// Dựng bằng hộp thoại sẵn có (SK.HALL_UI.dlg), không dùng prefab UI choose_pet.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, L = SK.lobby, P = SK.profile, USE = SK.HALL_USE, UI = SK.HALL_UI;
  if (!L || !P || !USE || !UI || !window.SK_PETS) return;
  const { esc, fmt, gemImg } = L, { dlg, CLOSE } = UI;
  const GRAIN = 'material_grain', TREAT_PRICE = 50;   // giá Thức ăn cho pet bằng đá [ƯỚC LƯỢNG]; wiki không nêu
  const FOOD_VI = { Meat: 'Thịt', Vegetables: 'Thực Vật', Seafood: 'Cá', Mechanical: 'Robot', Misc: 'Tạp phẩm', Fertilizer: 'Phân Bón',   // [LOC pet_food_*]
    Bamboo: 'Tre', 'Millennia Bamboo': 'Tre Ngàn Năm', 'Candied Hawberries': 'Hồ Lô Ngào Đường', 'Grilled Carrot': 'Cà Rốt Nướng',
    'Grilled Fish': 'Cá Nướng', 'Grilled Green Onion': 'Hành Lá Nướng' };
  const st = document.createElement('style');
  st.textContent = '#hs-dlg .hs-btns{flex-wrap:wrap}.sk-pets{max-height:24vh!important}.sk-pets div{cursor:pointer;position:relative}' +
    '.sk-pets div.on{border-color:#ffd452}.sk-pets div.lk canvas{filter:grayscale(1) brightness(.55)}' +
    '.sk-pets small{display:block;color:#9aa3b0}.sk-aff{height:calc(var(--u)*1.6);background:#12171f;border:1px solid #2c3340;border-radius:4px;margin:calc(var(--u)*.6) 0;position:relative}' +
    '.sk-aff i{display:block;height:100%;background:#4fb35a}.sk-aff b{position:absolute;top:0;bottom:0;width:2px;background:#ffd452}';
  document.head.appendChild(st);

  const ids = () => SK_PETS.order.filter(id => SK_PETS.pets[id].vi);
  const info = id => SK_PETS.pets[id];
  function thumb(id) {
    const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56;
    const ctx = cv.getContext('2d'), parts = D.prefabs[id];
    ctx.imageSmoothingEnabled = false;
    if (parts) { ctx.translate(28, 44); ctx.scale(2, 2); try { SK.drawPrefab(ctx, parts, 0, 0, { state: 'ide', t: 0 }); } catch (_) { /* ảnh chưa nạp: ô trống */ } }
    return cv;
  }
  const foodVi = d => d.food.length ? d.food.map(f => FOOD_VI[f] || f).join(', ') : 'Không kén';
  function condition(d) {   // dòng giá / điều kiện cho con chưa sở hữu
    const u = d.unlock;
    if (u.kind === 'gems') return { price: gemImg + ' ' + fmt(u.cost) };
    if (u.kind === 'fish') return { price: fmt(u.cost) + ' Cá Khô' };
    if (u.kind === 'achievement') return { lock: u.text || 'Mở bằng thành tựu (bản web chưa có hệ thành tựu).' };
    if (u.kind === 'season') return { lock: 'Phần thưởng mùa giải (bản web chưa có).' };
    if (u.kind === 'event') return { lock: 'Nhận từ sự kiện (bản web chưa có).' };
    return { lock: 'Hiện không có.' };
  }
  const food = id => (P.item(GRAIN) > 0 ? GRAIN : (P.PET_FEED.material_fertilize.only && info(id).food.indexOf(P.PET_FEED.material_fertilize.only) >= 0 && P.item('material_fertilize') > 0 ? 'material_fertilize' : null));

  let sel = null;
  function panel(z, note) {
    if (!sel || !info(sel)) sel = P.pet();
    const d = info(sel), owned = P.petOwned(sel), cur = P.pet() === sel, max = P.petAffMax(sel), aff = P.petAff(sel), on = P.petSkillOn(sel);
    const cond = owned ? null : condition(d), grain = P.item(GRAIN);
    let html = '<h3>Thú cưng</h3><div class="sk-grid sk-pets" id="sk-pets">' + ids().map(id => '<div data-id="' + id + '" class="' + (id === sel ? 'on ' : '') + (P.petOwned(id) ? '' : 'lk') + '">' +
      '<span class="sk-pc"></span>' + esc(info(id).vi) + '<small>' + (P.pet() === id ? 'Đang chọn' : P.petOwned(id) ? 'Đã có' : 'Khóa') + '</small></div>').join('') + '</div>' +
      '<p id="sk-pet-name"><b>' + esc(d.vi) + '</b>' + (cur ? ' · đang chọn' : '') + '</p>' +
      '<p id="sk-pet-skill">Kỹ năng <b>' + esc(d.skill.vi || '—') + '</b>: ' + esc(d.skill.desc || 'Chưa có mô tả.') + '</p>' +
      '<p class="hs-note">Món ưa thích: ' + esc(foodVi(d)) + '</p>';
    if (owned) {
      html += '<p id="sk-pet-aff">Thân mật: <b>' + aff + '/' + max + '</b> · ' + (on ? 'kỹ năng đã mở' : 'đạt ' + Math.ceil(max / 2) + ' để mở kỹ năng') + '</p>' +
        '<div class="sk-aff"><i style="width:' + Math.round(aff / max * 100) + '%"></i><b style="left:50%"></b></div>' +
        '<p class="hs-note">Thức ăn cho pet: ' + grain + ' · cho ăn ' + P.petFed(sel) + '/' + P.PET_FEED_MAX + ' lần ở ván này</p>';
    } else if (cond.price) {
      html += '<p class="hs-price" id="sk-pet-price">' + cond.price + '</p>';
    } else html += '<p class="hs-bad" id="sk-pet-lock">' + esc(cond.lock) + '</p>';
    if (note) html += '<p id="sk-pet-note">' + esc(note) + '</p>';
    const btns = [];
    if (owned) {
      btns.push({ id: 'sk-pet-pick', label: cur ? 'Đã chọn' : 'Chọn', cls: 'ok', disabled: cur, fn() { P.setPet(sel); panel(z, 'Đã chọn ' + d.vi + '.'); } });
      btns.push({ id: 'sk-pet-feed', label: 'Cho ăn [' + grain + ']', fn() {
        if (P.petFed(sel) >= P.PET_FEED_MAX) { panel(z, 'No quá rồi. Dẫn tôi đi đánh nhau đi.'); return; }   // [LOC pet_full]
        const f = food(sel);
        if (!f) { panel(z, 'Hết thức ăn, hãy mua thêm.'); return; }
        const r = P.feedPet(sel, f);
        panel(z, r.ok ? 'Ăn ngon! Thân mật +' + r.pts + '.' : r.err);
      } });
      btns.push({ id: 'sk-pet-buyfeed', label: 'Mua ăn · ' + TREAT_PRICE, fn() {
        if (!P.spend(TREAT_PRICE)) { panel(z, 'Không đủ đá quý.'); return; }
        P.addItem(GRAIN, 1); panel(z, 'Đã mua 1 thức ăn cho pet.');
      } });
    } else if (cond.price) {
      const u = d.unlock, can = u.kind === 'gems' ? P.gems >= u.cost : P.fish >= u.cost;
      btns.push({ id: 'sk-pet-buy', label: 'Mua', cls: 'ok', disabled: !can, fn() {
        const r = P.buyPet(sel); panel(z, r.ok ? 'Đã mở ' + d.vi + '!' : 'Không mua được: ' + r.err + '.');
      } });
      if (!can) html += '<p class="hs-bad" id="sk-pet-short">' + (u.kind === 'gems' ? 'Không đủ đá quý.' : 'Không đủ Cá Khô — mua ở Mèo Chiêu Tài.') + '</p>';
    }
    btns.push(CLOSE);
    dlg(html, btns);
    const grid = document.getElementById('sk-pets');
    for (const el of grid.children) {
      el.querySelector('.sk-pc').replaceWith(thumb(el.dataset.id));
      el.onclick = () => { sel = el.dataset.id; panel(z); };
    }
    const on2 = grid.querySelector('.on'); if (on2 && on2.scrollIntoView) on2.scrollIntoView({ block: 'nearest' });
  }
  USE.pet_food = z => { sel = P.pet(); panel(z); };
})();
