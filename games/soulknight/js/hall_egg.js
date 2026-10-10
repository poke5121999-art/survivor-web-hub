// Máy Quay Trứng + Mèo Chiêu Tài của sảnh đi (HALL.md 2.5, 2.7, bước 5). Bảng xác suất thật của Máy Quay Trứng chỉ có trên web chính
// thức [LOC item/egg_sign] nên toàn bộ tỉ lệ dưới đây là [ƯỚC LƯỢNG] theo đề xuất HALL.md 2.5; lời thoại là chuỗi chính thức [LOC ...].
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, L = SK.lobby, P = SK.profile, USE = SK.HALL_USE, UI = SK.HALL_UI;
  if (!L || !P || !USE || !UI) return;
  const { esc, fmt, gemImg, fakePay } = L, { dlg, icon, itemName, DB, wName, CLOSE } = UI;
  const IT = DB.items || {};
  const keysOf = f => Object.keys(IT).filter(k => f(IT[k], k));

  // ---------------------------------------------------------------- Máy Quay Trứng
  const EGG_COST = 100, EGG_COST10 = 900, EGG_DAILY = 20, EGG_PITY = 19;   // 100 đá/lượt, 10 lượt 900, 20 lượt/ngày; bảo đảm 19 lượt [ƯỚC LƯỢNG; LOC ui/2025_egg_june_intro_desc_1]
  // Nhóm thưởng: vũ khí 35, vật liệu 35, hạt giống 10, đá 15 (đã gộp thuốc nổ 5), mảnh skin 5 [HALL.md 2.5: nhân tố thử thách 10% gộp vào vật liệu vì web chưa có kho nhân tố].
  const KIND = [['weapon', 35], ['material', 35], ['seed', 10], ['gems', 15], ['skin', 5]];
  const GRADE_W = [[1, 55], [2, 25], [3, 12], [4, 6], [5, 2]];   // trắng/lục/lam/tím/cam [HALL.md 2.5]; DS.grade = độ hiếm + 1
  const MAT_W = [['material_iron', 30, 1, 3], ['material_wood', 25, 1, 3], ['material_gear', 20, 1, 3], ['material_battery', 10, 1, 2], ['material_cell', 8, 1, 2],
    ['material_magic_red', 2, 1, 1], ['material_magic_blue', 2, 1, 1], ['material_magic_green', 2, 1, 1], ['material_magic_cyan', 1, 1, 1]];   // [key, trọng số, min, max] [ƯỚC LƯỢNG]
  const SEED_W = [[0, 55], [1, 30], [2, 15]];                      // theo ItemLevel hạt giống [ƯỚC LƯỢNG]
  const GEM_W = [[50, 50], [100, 30], [200, 15], [500, 5]];        // [đá, trọng số] [ƯỚC LƯỢNG]
  function wpick(list, rnd, i) {
    i = i == null ? 1 : i;
    let tot = 0; for (const r of list) tot += r[i];
    let x = rnd() * tot;
    for (const r of list) { x -= r[i]; if (x < 0) return r; }
    return list[list.length - 1];
  }
  const pickIn = (arr, rnd) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
  const eggWeapons = g => (DS.weaponGrades[g] || []).filter(id => !DS.weapons[id].starter);
  const skinKeys = () => keysOf((d, k) => /^material_skin_fragment_/.test(k));

  // Một lượt quay -> {kind, ...}. forceSkin: lượt bảo đảm.
  function roll(rnd, forceSkin) {
    rnd = rnd || SK.rand;
    const kind = forceSkin ? 'skin' : wpick(KIND, rnd)[0];
    if (kind === 'weapon') {
      let g = wpick(GRADE_W, rnd)[0];
      while (g > 0 && !eggWeapons(g).length) g--;
      return { kind, id: pickIn(eggWeapons(g), rnd), grade: g };
    }
    if (kind === 'material') { const m = wpick(MAT_W, rnd); return { kind, key: m[0], n: m[2] + Math.floor(rnd() * (m[3] - m[2] + 1)) }; }
    if (kind === 'seed') {
      const lv = wpick(SEED_W, rnd)[0], seeds = keysOf(d => d.t === 'seed' && d.level === lv);
      return { kind, key: pickIn(seeds.length ? seeds : keysOf(d => d.t === 'seed'), rnd), n: 1 };
    }
    if (kind === 'gems') return { kind, n: wpick(GEM_W, rnd)[0] };
    return { kind: 'skin', key: pickIn(skinKeys(), rnd), n: 1 };
  }
  // Nhận phần thưởng vào hồ sơ; hòm vũ khí đầy thì đổi vũ khí thành đá bằng tiền một lượt quay.
  function grant(r) {
    if (r.kind === 'weapon') {
      if (P.addBox(r.id)) return { text: wName(r.id) + ' (cất vào hòm vũ khí)' };
      P.addGems(EGG_COST); return { text: wName(r.id) + ': hòm đầy, đổi thành ' + fmt(EGG_COST) + ' đá' };
    }
    if (r.kind === 'gems') { P.addGems(r.n); return { text: fmt(r.n) + ' đá' }; }
    P.addItem(r.key, r.n);
    return { text: itemName(r.key) + ' ×' + r.n };
  }
  const eggLeft = () => Math.max(0, EGG_DAILY - P.dailyCount('egg'));
  // Quay n lượt: kiểm lượt/ngày + đá, trừ đá, đếm lượt, bộ đếm bảo đảm. Trả {ok, results} hoặc {ok:false, err}.
  function spin(n, rnd) {
    const cost = n >= 10 ? EGG_COST10 * Math.floor(n / 10) + EGG_COST * (n % 10) : EGG_COST * n;
    if (eggLeft() < n) return { ok: false, err: 'Hôm nay không thể rút nữa' };    // [LOC item/egg_machine_nomore]
    if (P.gems < cost) return { ok: false, err: 'Không đủ đá quý — thiếu ' + fmt(cost - P.gems) + '.' };
    P.spend(cost); P.bumpDaily('egg', n);
    const results = [];
    for (let i = 0; i < n; i++) {
      const force = P.eggPity >= EGG_PITY, r = roll(rnd, force);
      P.setEggPity(r.kind === 'skin' ? 0 : P.eggPity + 1);
      results.push(Object.assign(r, grant(r)));
    }
    return { ok: true, results, cost };
  }
  function egg(z, note, results) {
    const left = eggLeft();
    let html = '<h3>Máy Quay Trứng</h3><p class="hs-note">Xoay thử một cái đi, toàn hàng ngon, thật đó!</p>' +                // [LOC object/gashapon_machines_disc]
      '<p id="sk-egg-left">Số lần hôm nay còn: <b>' + left + '</b>' + (left ? '' : ' — Hôm nay không thể rút nữa') + '</p>' +
      '<p>Bạn đang có ' + fmt(P.gems) + ' ' + gemImg + ' · ' + (EGG_PITY - P.eggPity > 0 ? 'còn ' + (EGG_PITY - P.eggPity) + ' lượt nữa trước khi bảo đảm ra mảnh skin' : 'lượt này chắc chắn ra mảnh skin') + '.</p>';
    if (results) html += '<p>Nhận được:</p><ul class="sk-list" id="sk-egg-res">' + results.map(r => '<li><span>' + esc(r.text) + '</span></li>').join('') + '</ul>';
    if (note) html += '<p id="sk-egg-note" class="hs-bad">' + esc(note) + '</p>';
    dlg(html, [{ id: 'sk-egg-1', label: 'Quay 1 lần (' + EGG_COST + ')', cls: 'ok', disabled: !left, fn: () => ask(z, 1) },
      { id: 'sk-egg-10', label: 'Quay 10 lần (' + EGG_COST10 + ')', disabled: left < 10, fn: () => ask(z, 10) }, CLOSE]);
  }
  function ask(z, n) {
    const cost = n >= 10 ? EGG_COST10 : EGG_COST * n;
    dlg('<h3>Máy Quay Trứng</h3><p id="sk-egg-ask">Tiêu ' + fmt(cost) + ' Đá quay ' + n + ' lần?</p>',   // [LOC ui/egg_machine_ask]
      [{ id: 'sk-egg-go', label: 'Quay', cls: 'ok', fn() { const r = spin(n); egg(z, r.ok ? '' : r.err, r.results); } }, { label: 'Thôi', fn: () => egg(z) }]);
  }
  USE.egg_machine = z => egg(z);

  // ---------------------------------------------------------------- Mèo Chiêu Tài: tiệm Cá Khô giả lập
  // Cá Khô gốc là tiền thật [LOC item/fishChip_description]; web dùng fakePay. Gói Cá Khô và giá món [ƯỚC LƯỢNG]; nâng cấp chuyển phát = 20 Cá Khô [WIKI fandom Gems].
  const FISH_PACKS = [[1.99, 20], [4.99, 60], [9.99, 130]];
  const GOODS = [
    { id: 'postman', name: 'Tăng dịch vụ chuyển phát nhanh', desc: 'Mỗi ngày người chuyển phát tặng thêm +100 đá.', price: 20, once: true },   // [LOC mall/ui_fish_chip_get_reward_3]
    { id: 'token_weapon_none_0', price: 5 }, { id: 'token_weapon_none_1', price: 10 }, { id: 'token_weapon_none_2', price: 15 },
    { id: 'token_seed_none_0', price: 5 }, { id: 'token_seed_none_1', price: 15 }
  ].filter(g => g.id === 'postman' || IT[g.id]);
  const gName = g => g.name || itemName(g.id);
  const sold = g => (g.once ? !!P.postmanPlus : P.dailyCount('fish_' + g.id) >= 1);   // vé: mỗi món 1 lần mỗi ngày ("bán không định kỳ" [LOC multi_room_skin_ui_fish_chip_store])
  function buyGood(g) {
    if (sold(g)) return 'Hôm nay đã mua món này';
    if (!P.spendFish(g.price)) return 'Không đủ Cá Khô';
    if (g.once) P.upgradePostman(); else { P.addItem(g.id, 1); P.bumpDaily('fish_' + g.id, 1); }
    return 'Đã mua ' + gName(g);
  }
  function cat(z, note) {
    let html = '<h3>Mèo Chiêu Tài</h3><p class="hs-note">Nhà phát hành hỗ trợ · Cá Khô Cống Hiến</p><p class="hs-note">Mua Cá Khô được nhận Trọng Đãi Mèo Chiêu Tài và đổi thương phẩm hiếm!</p>' +   // [LOC Object_plutus_info1,2, tips/fishchip]
      '<p id="sk-cat-fish">Cá Khô: <b>' + fmt(P.fish) + '</b></p><p class="hs-note">Tiệm Cá Khô bán không định kỳ</p><ul class="sk-list" id="sk-cat-goods">' +
      GOODS.map(g => '<li>' + (g.once ? '' : icon(g.id)) + '<span>' + esc(gName(g)) + '<small>' + esc(g.desc || '') + '</small></span><b>' + g.price + ' Cá Khô</b>' +
        '<button class="hs-btn ok" data-id="' + esc(g.id) + '"' + (sold(g) ? ' disabled' : '') + '>' + (sold(g) ? 'Đã mua' : 'Mua') + '</button></li>').join('') + '</ul>';
    if (note) html += '<p id="sk-cat-note">' + esc(note) + '</p>';
    dlg(html, [{ id: 'sk-cat-packs', label: 'Mua Cá Khô', fn: () => packs(z) }, CLOSE]);
    for (const b of document.querySelectorAll('#sk-cat-goods button')) b.onclick = () => cat(z, buyGood(GOODS.find(g => g.id === b.dataset.id)));
  }
  function packs(z) {
    dlg('<h3>Mua Cá Khô</h3><p class="hs-note">Mọi gói đều mua giả lập — không trừ tiền thật.</p><div class="hs-packs">' +
      FISH_PACKS.map(([usd, n], i) => '<button class="hs-pack" data-pack="' + i + '"><b>' + n + ' Cá Khô</b><span>$' + usd.toFixed(2) + '</span></button>').join('') + '</div>',
    [{ label: 'Quay lại', id: 'hs-back', cls: 'ok', fn: () => cat(z) }, CLOSE]);
    for (const el of document.querySelectorAll('.hs-pack')) el.onclick = () => {
      const [usd, n] = FISH_PACKS[+el.dataset.pack];
      fakePay(n + ' Cá Khô', usd, () => { P.addFish(n); cat(z, 'Đã nhận ' + n + ' Cá Khô.'); });
    };
  }
  USE.plutus_cat = z => cat(z);
  SK.hallEgg = { roll, spin, KIND, GRADE_W, EGG_COST, EGG_COST10, EGG_DAILY, EGG_PITY, left: eggLeft };
})();
