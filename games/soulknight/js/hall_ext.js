// Sảnh bước 7 + 9 (tools/polish/HALL.md): nội thất mở bằng bản vẽ và Cảnh Sát.
//   Bản vẽ nội thất (blueprint_room_decorate_*, nghiên cứu ở Bàn Thiết Kế, P.devd) quyết định món có dùng được không: chưa nghiên cứu thì món vẽ
//   xám trong khung nét đứt "Cần bản vẽ" (SK.HALL_LOCK, js/hall.js), nghiên cứu xong thì dùng được ngay. Vật liệu trừ ở Bàn Thiết Kế theo
//   [CFG items.blueprint_room_decorate_*] (3000 đá...), bản wiki cũ ghi 300 đá nên không trừ thêm lần hai ở món.
//   Máy Nước (drink_seller)   : mua đồ uống bằng đá, mang vào ván kế (SK.profile.drinks), tối đa 3 ly.
//   Hồ Cá (fish_bowl)          : câu cá (bấm Thu Cần khi cá trùng nút), cá = vũ khí dùng một ván (vào ô đồ rèn, tự chọn mang theo).
//   Giếng Phép Thuật (Vườn)     : uống một lần mỗi ván, Cầu Năng Lượng hồi thêm 1 điểm (9 thay vì 8) cả ván kế.
//   Tượng Tín Ngưỡng            : 300 đá lần đầu mỗi ngày, +100 mỗi lần, tối đa 1300; chúc phúc 1/10 tượng, kích hoạt khi dùng kỹ năng (rooms.js).
//   Cảnh Sát / Bảng nhiệm vụ    : nhận treo thưởng (Nhân Tố Thử Thách + đánh bại / thu thập), xong ván thì nhận thưởng, bản vẽ nội thất rơi ở đây.
//   Trang trí sảnh              : js/hall_deco.js.
// Trạng thái riêng lưu ở localStorage 'sk.hall4.v1' (không đụng hồ sơ chính). Nguồn: [LOC khoá], [CFG bảng.khoá], [WIKI], [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, D = SK.D, L = SK.lobby, P = SK.profile, USE = SK.HALL_USE, UI = SK.HALL_UI, H = window.SK_HALL;
  if (!L || !P || !USE || !UI || !H || !SK.hall || !SK.hall.addZone) return;
  const { esc, fmt, gemImg } = L, { dlg, icon, itemName, itemOf, wName, CLOSE } = UI, U = SK.PPU;

  // ---------------------------------------------------------------- trạng thái
  const KEY = 'sk.hall4.v1';
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function load() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* hồ sơ trắng */ }
    o = isObj(o) ? o : {};
    const s = {
      drinks: Array.isArray(o.drinks) ? o.drinks.filter(k => typeof k === 'string').slice(0, 3) : [],
      stock: isObj(o.stock) && Array.isArray(o.stock.list) ? { day: +o.stock.day | 0, list: o.stock.list.filter(isObj).map(q => ({ k: String(q.k), sold: !!q.sold })) } : { day: -1, list: [] },
      well: o.well ? 1 : 0, statue: Math.max(0, Math.min(10, +o.statue | 0)),
      quest: isObj(o.quest) ? o.quest : {}
    };
    const q = s.quest;
    q.day = Number.isFinite(+q.day) ? +q.day : -1; q.n = Math.max(0, +q.n | 0); q.claimed = Math.max(0, +q.claimed | 0);
    q.offers = Array.isArray(q.offers) ? q.offers.filter(isObj) : [];
    q.active = isObj(q.active) ? q.active : null;
    return s;
  }
  const S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* chế độ riêng tư */ } }

  // ---------------------------------------------------------------- bản vẽ nội thất
  const BP = { drink_seller: 'blueprint_room_decorate_drink_seller', fish_bowl: 'blueprint_room_decorate_fishbowl', magic_well: 'blueprint_room_decorate_magic_well',
    statue: 'blueprint_room_decorate_mysteriou_statue' };
  const TITLE = { drink_seller: 'Máy Bán Nước Uống Tự Động', fish_bowl: 'Hồ Cá', magic_well: 'Giếng Phép Thuật', statue: 'Tượng Tín Ngưỡng' };   // [LOC object/*]
  const BPNAME = { drink_seller: 'Bản Vẽ Máy Bán Nước Uống Tự Động', fish_bowl: 'Bản Vẽ Hồ Cá', magic_well: 'Bản Vẽ Giếng Phép Thuật', statue: 'Bản Vẽ Tượng Tín Ngưỡng' };
  // Tên + biểu tượng cho kho / Bàn Thiết Kế (SK_ITEMS chưa có 4 bản vẽ này): dùng lại biểu tượng bản vẽ có sẵn.
  const IT = window.SK_ITEMS && window.SK_ITEMS.items;
  if (IT) for (const s of Object.keys(BP)) if (!IT[BP[s]]) IT[BP[s]] = { vi: BPNAME[s], en: BPNAME[s], t: 'bp', level: 0, icon: IT.blueprint_m_mech_4 ? IT.blueprint_m_mech_4.icon : null };
  SK.HALL_LOCK = slot => (BP[slot] && !P.devd(BP[slot]) ? BP[slot] : null);

  function lockedDlg(slot) {
    const bp = BP[slot], have = P.item(bp) > 0;
    dlg('<h3>' + esc(TITLE[slot]) + '</h3><p class="hs-bad" id="sk-lock">Cần bản vẽ</p><p>' + esc(BPNAME[slot]) + (have ? ': bạn đã có, hãy nghiên cứu ở Bàn Thiết Kế.' :
      ': chưa có. Hoàn thành treo thưởng khó của Cảnh Sát để nhận bản vẽ nội thất.') + '</p>', [CLOSE]);   // nguồn bản vẽ: HALL.md bước 7 (nguồn gốc chưa rõ) [ƯỚC LƯỢNG]
  }
  const gate = (slot, fn) => z => (SK.HALL_LOCK(slot) ? lockedDlg(slot) : fn(z));
  const day = () => P.dayIndex;
  const rng = seed => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
  const toast = (t, sec) => { const G = SK.G; if (G && G.toast) G.toast(t, sec || 3); };

  // ---------------------------------------------------------------- Máy Nước: đồ uống
  // Bảng ra [CFG random_objects.drink_seller] (trọng số), công dụng [LOC drink_*_desc]; số cộng và giá [ƯỚC LƯỢNG] (config không có). Máy sảnh "hiệu quả gấp đôi"
  // [LOC object/drink_seller_disc] nên số cộng gấp đôi con số trong ải (HP 2, giáp 2, năng lượng 80, bạo kích 10%, tốc đánh 20%, hồi chiêu -20%); phòng thủ giảm 1
  // mỗi đòn (không nhân đôi: đòn 2 sát thương mà trừ 2 là miễn nhiễm).
  const DRINKS = {
    wine: { vi: 'Rượu Vang', desc: 'Tăng HP tối đa +2', w: 3, price: 150, on(G, p) { p.hpMax += 2; p.hp += 2; } },
    coconut: { vi: 'Nước Dừa', desc: 'Tăng hộ giáp tối đa +2', w: 3, price: 150, on(G, p) { p.armorMax += 2; p.armor += 2; } },
    juice: { vi: 'Nước Ép', desc: 'Tăng năng lượng tối đa +80', w: 3, price: 120, on(G, p) { p.energyMax += 80; p.energy += 80; } },
    bloody_mary: { vi: 'Mary Khát Máu', desc: 'Tăng tỉ lệ bạo kích +10%', w: 3, price: 200, on(G, p) { p.crit = (p.crit || 0) + 10; } },
    milk: { vi: 'Sữa Bò', desc: 'Tăng phòng thủ: mỗi đòn nhận bớt 1 sát thương (tối thiểu 1)', w: 1, price: 200, on(G, p) { p._milk = (p._milk || 0) + 1; } },
    coffee: { vi: 'Cà Phê', desc: 'Tăng tốc độ tấn công +20%', w: 3, price: 200, on(G, p) { p.rateMul = (p.rateMul == null ? 1 : p.rateMul) * 1.2; } },
    tea: { vi: 'Trà', desc: 'Tăng 1 vị trí thiên phú', w: 3, price: 300, on(G) { G.mods = G.mods || {}; G.mods.buffSlots = (G.mods.buffSlots || 0) + 1; } },
    soda: { vi: 'Nước Soda', desc: 'Giảm thời gian chờ kỹ năng 20%', w: 1, price: 150, on(G) { G.mods = G.mods || {}; G.mods.skillCdMul = (G.mods.skillCdMul || 1) * 0.8; } },
    redbull: { vi: 'Thức Uống', desc: 'Năng lượng tối đa +40, tốc độ di chuyển +10%', w: 3, price: 150, on(G, p) {
      p.energyMax += 40; p.energy += 40; G.mods = G.mods || {}; G.mods.moveMul = (G.mods.moveMul || 1) * 1.1; } },
    jade_elixir: { vi: 'Nước Ép Ngọc Bích', desc: 'HP tối đa +2, tốc độ di chuyển -10%', w: 3, price: 100, on(G, p) {
      p.hpMax += 2; p.hp += 2; G.mods = G.mods || {}; G.mods.moveMul = (G.mods.moveMul || 1) * 0.9; } },
    garlic_juice: { vi: 'Nước Ép Tỏi', desc: 'Hộ giáp tối đa +2, HP tối đa -1', w: 3, price: 100, on(G, p) {
      p.armorMax += 2; p.armor += 2; if (p.hpMax > 1) { p.hpMax -= 1; p.hp = Math.min(p.hp, p.hpMax); } } }
  };
  const DRINK_MAX = 3, STOCK_N = 4;   // [LOC item/drink_limit "Thật sự không thể uống nữa"]; số ngăn máy [ƯỚC LƯỢNG]
  function stock() {
    const d = day();
    if (S.stock.day !== d || !S.stock.list.length) {
      const r = rng(d + 7), pool = Object.keys(DRINKS), list = [];
      while (list.length < STOCK_N && pool.length) {
        const tot = pool.reduce((a, k) => a + DRINKS[k].w, 0);
        let x = r() * tot, i = 0;
        for (; i < pool.length - 1; i++) { x -= DRINKS[pool[i]].w; if (x < 0) break; }
        list.push({ k: pool.splice(i, 1)[0], sold: false });
      }
      S.stock = { day: d, list }; save();
    }
    return S.stock.list;
  }
  function buyDrink(i) {
    const q = stock()[i], dk = q && DRINKS[q.k];
    if (!dk || q.sold) return { ok: false, text: 'Máy bán hàng đã bán hết!' };   // [LOC item/drink_seller_talk1]
    if (S.drinks.length >= DRINK_MAX) return { ok: false, text: 'Thật sự không thể uống nữa' };   // [LOC item/drink_limit]
    if (!P.spend(dk.price)) return { ok: false, text: 'Không đủ đá quý — thiếu ' + fmt(dk.price - P.gems) + '.' };
    q.sold = true; S.drinks.push(q.k); save();
    return { ok: true, text: 'Đã mua ' + dk.vi + '. Uống ở ván kế.' };
  }
  function drinkDlg(note) {
    const list = stock();
    let html = '<h3>Máy Bán Nước Uống Tự Động</h3><p class="hs-note">Muốn vào địa lao à? Uống chút nước ngọt trước đi, hiệu quả gấp đôi!</p>' +   // [LOC object/drink_seller_disc]
      '<p>' + (list.every(q => q.sold) ? 'Máy bán hàng đã bán hết!' : 'Mua đồ uống không?') + '</p>' +   // [LOC item/drink_seller_talk1,2]
      '<p id="sk-drink-have">Đang mang: <b>' + (S.drinks.length ? S.drinks.map(k => esc(DRINKS[k].vi)).join(', ') : 'chưa có') + '</b> (' + S.drinks.length + '/' + DRINK_MAX + ') · đá quý: ' + fmt(P.gems) + '</p>';
    html += '<ul class="sk-list" id="sk-drinks">' + list.map((q, i) => { const d = DRINKS[q.k];
      return '<li data-k="' + q.k + '"><span>' + esc(d.vi) + '<small>' + esc(d.desc) + '</small></span><b>' + (q.sold ? 'Hết' : gemImg + ' ' + d.price) + '</b>' +
        '<button class="hs-btn ok" data-i="' + i + '"' + (q.sold ? ' disabled' : '') + '>Mua</button></li>'; }).join('') + '</ul>';
    if (note) html += '<p id="sk-drink-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    for (const b of document.querySelectorAll('#sk-drinks button')) b.onclick = () => drinkDlg(buyDrink(+b.dataset.i).text);
  }
  USE.drink_seller = gate('drink_seller', () => drinkDlg());

  // ---------------------------------------------------------------- Hồ Cá: câu cá
  // Cơ chế gốc [LOC fishing_intro_tips6-8]: có nút Thu Cần và một con cá bơi gần nút; cá trùng nút thì nút phát sáng, bấm ngay là câu được.
  // Cá là vũ khí dùng một ván [LOC guide/fishbowl]: vào ô đồ rèn (tối đa 4) và tự chọn mang theo nếu chưa chọn gì. Bảng cá [ƯỚC LƯỢNG].
  const FISH = [['weapon_093', 40], ['weapon_279', 12], ['weapon_laserfishee', 20], ['weapon_bladefish', 15], ['weapon_swordfish', 10], ['weapon_hammerhead', 6],
    ['weapon_094', 6], ['weapon_deepwaterlaserfish', 4], ['weapon_280', 3]].map(([id, w]) => [DS.weaponId ? DS.weaponId(id) : id, w]).filter(([id]) => DS.weapons[id]);
  const FISH_DAILY = 6, TRASH_P = 0.25, ZONE_W = 0.16, FISH_SPEED = 0.8;   // lần câu mỗi ngày / tỉ lệ rác / nửa bề rộng vùng sáng / tốc độ cá (bar/s) [ƯỚC LƯỢNG]
  const TRASH = ['Cá Khô Nhựa', 'Vịt Vàng', 'Mảnh Rách Nát'];   // [LOC trash_*]
  const fish = { on: false, pos: 0.1, dir: 1, timer: 0, t0: 0 };
  const inZone = () => Math.abs(fish.pos - 0.5) <= ZONE_W / 2;
  function fishStop() { if (fish.timer) { clearInterval(fish.timer); fish.timer = 0; } fish.on = false; }
  function pickFish(r) {
    const tot = FISH.reduce((a, f) => a + f[1], 0); let x = (r == null ? SK.rand() : r) * tot;
    for (const f of FISH) { x -= f[1]; if (x < 0) return f[0]; }
    return FISH[0][0];
  }
  // Thu cần: trả {ok, text, id?}; bấm trúng vùng sáng mới câu được (không trúng: cá trốn). Một lần câu tốn một lượt trong ngày.
  function reel() {
    if (!fish.on) return { ok: false, text: '' };
    const hit = inZone(); fishStop();
    P.bumpDaily('fishing');
    if (!hit) return { ok: false, text: 'Cá trốn rồi' };   // [LOC fishing_tips5]
    if (SK.rand() < TRASH_P) return { ok: false, text: 'Bạn câu được một miếng rác: ' + SK.pick(TRASH) + '. Không câu được gì hết...' };   // [LOC fishing_tips4,3]
    const id = pickFish();
    if (P.forgedFull) return { ok: false, text: 'Không thể để thêm vũ khí nữa. Cá ' + wName(id) + ' tuột mất.' };   // [LOC object/forge_full]
    P.addForged(id);
    const auto = !P.carry; if (auto) P.setCarry(id, 'forged');
    return { ok: true, id, text: 'Bạn câu được ' + wName(id) + '! ' + (auto ? 'Cá được mang vào ván kế ở ô vũ khí thứ hai.' : 'Mang vào ván kế ở Rương.') };   // [LOC fishing_tips2]
  }
  function fishDlg(note, casting) {
    fishStop();
    const left = FISH_DAILY - P.dailyCount('fishing');
    let html = '<h3>Hồ Cá</h3><p class="hs-note">Một bể cá lớn tuyệt đẹp! Có mức độ thưởng thức nhất định, ngoài ra cũng có thể đến đây luyện trình câu cá. Đôi khi cũng có thể đem cá ở đây đi để làm vũ khí.</p>' +   // [LOC guide/fishbowl]
      '<p id="sk-fish-left">Lần câu hôm nay còn: <b>' + Math.max(0, left) + '</b>/' + FISH_DAILY + ' · vũ khí cá đang giữ: <b>' + P.forged.length + '/4</b></p>' +
      '<div id="sk-fish-bar" style="position:relative;height:calc(var(--u)*6);margin:calc(var(--u)*2) 0;background:#12303f;border:1px solid #2c5a70;border-radius:6px;overflow:hidden;' + (casting ? '' : 'display:none') + '">' +
      '<div id="sk-fish-btn" style="position:absolute;top:0;bottom:0;left:' + (50 - ZONE_W * 50) + '%;width:' + ZONE_W * 100 + '%;background:#3a4a58;border-left:2px solid #6c8aa0;border-right:2px solid #6c8aa0"></div>' +
      '<div id="sk-fish-fish" style="position:absolute;top:20%;height:60%;width:calc(var(--u)*6);margin-left:calc(var(--u)*-3);background:#ffae4a;border-radius:50% 20% 20% 50%;left:5%"></div></div>';
    if (note) html += '<p id="sk-fish-note">' + esc(note) + '</p>';
    if (!casting) {
      dlg(html, [{ id: 'sk-fish-cast', label: 'Thả Câu', cls: 'ok', disabled: left <= 0, fn() {
        if (P.dailyCount('fishing') >= FISH_DAILY) { fishDlg('Hôm nay câu đủ rồi, mai quay lại.'); return; }
        fishDlg('Cá bơi qua nút Thu Cần: nút sáng lên thì bấm ngay!', true);
      } }, CLOSE]);
      return;
    }
    dlg(html, [{ id: 'sk-fish-reel', label: 'Thu Cần', cls: 'ok', fn() { const r = reel(); fishDlg(r.text); } }, { id: 'sk-fish-cancel', label: 'Bỏ qua', fn() { fishStop(); fishDlg('Cá trốn rồi'); } }]);
    fish.on = true; fish.pos = 0.05; fish.dir = 1; fish.t0 = performance.now();
    const fe = document.getElementById('sk-fish-fish'), btn = document.getElementById('sk-fish-btn');
    fish.timer = setInterval(() => {
      if (!document.getElementById('sk-fish-fish') || !L.dialogOpen) { fishStop(); return; }
      const now = performance.now(), dt = (now - fish.t0) / 1000; fish.t0 = now;
      fish.pos += fish.dir * FISH_SPEED * dt;
      if (fish.pos > 0.95) { fish.pos = 0.95; fish.dir = -1; } else if (fish.pos < 0.05) { fish.pos = 0.05; fish.dir = 1; }
      fe.style.left = fish.pos * 100 + '%';
      btn.style.background = inZone() ? '#ffd452' : '#3a4a58';
    }, 30);
  }
  USE.fish_bowl = gate('fish_bowl', () => fishDlg());

  // ---------------------------------------------------------------- Tượng Tín Ngưỡng
  const STATUE_BASE = 300, STATUE_STEP = 100, STATUE_MAX = 1300;   // [LOC guide/mysteriou_statue]
  const statuePrice = () => Math.min(STATUE_MAX, STATUE_BASE + STATUE_STEP * P.dailyCount('statue'));
  const RM = () => SK.ROOMS || {};
  const sName = id => (RM().statueName ? RM().statueName(id) : 'Tượng ' + id) || 'Tượng ' + id;
  const sDesc = id => (RM().statueDesc ? RM().statueDesc(id) : '') || '';
  function statuePray(forceId) {   // trả {ok, text, id}
    const cur = S.statue, id = forceId || 1 + Math.floor(SK.rand() * 10);
    if (id === cur) return { ok: false, same: true, id, text: 'Đã có chúc phúc tượng này' };   // [LOC statue_has_same_statue] không trừ đá
    const price = statuePrice();
    if (P.gems < price) return { ok: false, text: 'Không đủ đá quý — thiếu ' + fmt(price - P.gems) + '.' };
    P.spend(price); P.bumpDaily('statue');
    S.statue = id; save();
    return { ok: true, id, price, text: 'Cảm giác tràn đầy sức mạnh thần bí' };   // [LOC object/mysteriou_statue_talk3]
  }
  function statueDlg(note, pendingId) {
    const price = statuePrice(), n = P.dailyCount('statue');
    let html = '<h3>Tượng Tín Ngưỡng</h3><p class="hs-note">Hãy hiến tế nó, bạn sẽ trở nên mạnh hơn! Tất nhiên, mạnh hơn cũng phải trả giá.</p><p>Thờ tượng?</p>' +   // [LOC object/mysteriou_statue_disc, talk1]
      '<p class="hs-price" id="sk-statue-price">' + gemImg + ' ' + fmt(price) + '</p><p id="sk-statue-info">Hôm nay đã thờ: <b>' + n + '</b> lần · đá quý: ' + fmt(P.gems) + '</p>' +
      '<p id="sk-statue-cur">' + (S.statue ? 'Chúc phúc ván kế: <b>' + esc(sName(S.statue)) + '</b><small>' + esc(sDesc(S.statue)) + '</small>' : 'Chưa có chúc phúc nào.') + '</p>';
    if (note) html += '<p id="sk-statue-note">' + esc(note) + '</p>';
    const btns = [{ id: 'sk-statue-pray', label: 'Thờ', cls: 'ok', disabled: P.gems < price, fn() {
      const id = 1 + Math.floor(SK.rand() * 10);
      if (S.statue && id !== S.statue) { statueAsk(id); return; }
      const r = statuePray(id);
      statueDlg(r.ok ? r.text + ': ' + sName(r.id) + '. ' + sDesc(r.id) : r.text);
    } }, CLOSE];
    dlg(html, btns);
  }
  function statueAsk(id) {   // trùng: không hỏi; khác tượng đang có: hỏi thay [LOC statue_is_replace]
    dlg('<h3>Tượng Tín Ngưỡng</h3><p id="sk-statue-ask">Thay thế cho ' + esc(sName(S.statue)) + '?</p><p>Tượng mới: <b>' + esc(sName(id)) + '</b><small>' + esc(sDesc(id)) + '</small></p>' +
      '<p class="hs-price">' + gemImg + ' ' + fmt(statuePrice()) + '</p>', [
      { id: 'sk-statue-yes', label: 'Thay', cls: 'ok', fn() { const r = statuePray(id); statueDlg(r.ok ? r.text + ': ' + sName(r.id) + '. ' + sDesc(r.id) : r.text); } },
      { id: 'sk-statue-no', label: 'Thôi', fn: () => statueDlg() }]);
  }

  // ---------------------------------------------------------------- Giếng Phép Thuật
  // Uống một lần mỗi ván [WIKI Garden; LOC guide/magic_well]: Cầu Năng Lượng hồi thêm 1 điểm trong ván kế. Chưa vào ván thì không uống được nữa.
  function wellDlg(note) {
    dlg('<h3>Giếng Phép Thuật</h3><p>' + (S.well ? 'Không uống được nữa' : 'Giếng nước trong lành') + '</p>' +   // [LOC object/magic_well_talk2,1]
      '<p class="hs-note">Uống nước giếng: ván kế Cầu Năng Lượng hồi phục thêm 1 điểm năng lượng (dùng một lần mỗi ván).</p>' +
      (S.well ? '<p id="sk-well-state">Đã uống: Cầu Năng Lượng +1 ở ván kế.</p>' : '') + (note ? '<p id="sk-well-note">' + esc(note) + '</p>' : ''),
    [{ id: 'sk-well-drink', label: 'Uống', cls: 'ok', disabled: !!S.well, fn() { S.well = 1; save(); wellDlg('Có thể nhận buff hồi năng lượng: Cầu Năng Lượng +1 ở ván kế.'); } }, CLOSE]);   // [LOC magic_well_description]
  }

  // ---------------------------------------------------------------- đặt vào sảnh
  const WELL_AT = [-27.6, 0.9], STATUE_AT = [-16.2, -4.6], OFFICER_AT = [-15.4, 5.6];   // chỗ sàn trống đo bằng mặt nạ đi được (ngoài vùng mọi món khác) [ĐO]
  const locked = slot => !!SK.HALL_LOCK(slot);
  function lockWrap(ctx, z, fn) {
    if (locked(z.slot)) { ctx.save(); ctx.globalAlpha = 0.3; fn(); ctx.restore(); SK.hall.drawLock(ctx, z); } else fn();
  }
  SK.hall.addZone('magic_well', WELL_AT[0], WELL_AT[1], 'magic_well_0_normal', {
    name: 'Giếng Phép Thuật', loc: 'object/magic_well', use: gate('magic_well', () => wellDlg()),
    draw(ctx, x, y, t, z) {
      const parts = D.prefabs.magic_well_0_normal;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      lockWrap(ctx, z, () => SK.drawPrefab(ctx, parts, x, y, { t, skip: p => /fishing/.test(p.n) }));
    }
  });
  SK.hall.addZone('statue', STATUE_AT[0], STATUE_AT[1], null, {
    name: 'Tượng Tín Ngưỡng', loc: 'object/mysteriou_statue', use: gate('statue', () => statueDlg()), box: [STATUE_AT[0] - 1, STATUE_AT[1] - 0.8, STATUE_AT[0] + 1, STATUE_AT[1] + 1.2],
    draw(ctx, x, y, t, z) {
      const id = S.statue || 1, pf = SK.prefab('statue_' + (id < 10 ? '0' + id : id));
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      if (pf) lockWrap(ctx, z, () => SK.drawPrefab(ctx, pf, x, y, { t }));
    }
  });

  // ---------------------------------------------------------------- Cảnh Sát / Bảng nhiệm vụ
  // Treo thưởng [LOC Object_quest_type1,3; officer/*]: mỗi ngày 3 việc (Nhân Tố Thử Thách có sẵn SK.FACTORS + đánh bại hoặc thu thập). Nhận việc thì ván Ải kế
  // tự gắn nhân tố đó; xong ván (thắng hay thua) đạt chỉ tiêu thì nói chuyện với Cảnh Sát nhận thưởng. Mở khi đã chơi 3 ván [LOC task_bountyTaskPanelLocked].
  // Chỉ tiêu, thưởng, giới hạn 3 việc mỗi ngày là [ƯỚC LƯỢNG]; việc "hộ tống" chưa làm (cần NPC hộ tống).
  const Q_RUNS = 3, Q_DAILY = 3;
  const TIER = { 'dễ': { gems: 200, kills: 40, gold: 60, mat: 2 }, 'vừa': { gems: 400, kills: 60, gold: 90, mat: 3 }, 'khó': { gems: 800, kills: 80, gold: 120, mat: 4, bp: true } };
  const MATS = ['material_iron', 'material_wood', 'material_gear'];
  const runsPlayed = () => { const s = P.stats; return (s.pass | 0) + (s.dead | 0); };
  const qOpen = () => runsPlayed() >= Q_RUNS;
  const fVi = k => (SK.FACTORS[k] && SK.FACTORS[k].vi) || k;
  function qText(o) {
    const t = TIER[o.tier];
    return (o.type === 'defeat' ? 'Nhiệm vụ đánh bại: hạ ít nhất ' + o.target + ' quái trong một ván' : 'Nhiệm vụ thu thập: gom ít nhất ' + o.target + ' vàng trong một ván') + ' với nhân tố "' + fVi(o.factor) + '"';
  }
  function qReward(o) { const t = TIER[o.tier]; return fmt(t.gems) + ' đá' + ' + ' + t.mat + ' vật liệu' + (t.bp ? ' + 1 bản vẽ nội thất' : ''); }
  function makeOffers() {
    const q = S.quest, r = rng(day() * 31 + q.n * 7 + 3), keys = Object.keys(SK.FACTORS || {}), offers = [];
    const pool = keys.slice();
    for (let i = 0; i < 3 && pool.length; i++) {
      const f = pool.splice(Math.floor(r() * pool.length), 1)[0], tier = SK.FACTORS[f].tier in TIER ? SK.FACTORS[f].tier : 'vừa';
      const type = i === 1 ? 'collect' : 'defeat';
      offers.push({ id: day() + '-' + q.n + '-' + i, type, factor: f, tier, target: TIER[tier][type === 'defeat' ? 'kills' : 'gold'] });
    }
    return offers;
  }
  function qSync() {
    const q = S.quest;
    if (q.day !== day()) { q.day = day(); q.n = 0; q.claimed = 0; q.offers = makeOffers(); save(); }
    if (!q.offers.length) { q.offers = makeOffers(); save(); }
    return q;
  }
  function qAccept(i) {
    const q = qSync(), o = q.offers[i];
    if (!o || q.active) return false;
    q.active = Object.assign({}, o, { done: false }); save(); return true;
  }
  function qCancel() { S.quest.active = null; save(); }
  function qClaim() {
    const q = qSync(), a = q.active;
    if (!a || !a.done) return null;
    const t = TIER[a.tier], items = {};
    P.addGems(t.gems);
    const m = MATS[Math.floor(SK.rand() * MATS.length)]; P.addItem(m, t.mat); items[m] = t.mat;
    let bp = null;
    if (t.bp) {
      const left = Object.keys(BP).map(s => BP[s]).filter(k => P.item(k) < 1 && !P.devd(k));
      if (left.length) { bp = left[Math.floor(SK.rand() * left.length)]; P.addItem(bp, 1); }
    }
    q.active = null; q.claimed++; q.n++; q.offers = makeOffers(); save();
    SK.emit('bounty', SK.G, a);
    return { gems: t.gems, items, bp, quest: a };
  }
  function officerDlg(note) {
    if (!qOpen()) { dlg('<h3>Cảnh Sát</h3><p class="hs-bad" id="sk-off-lock">Hãy tiếp tục khiêu chiến chế độ ải, để mở khóa nội dung treo thưởng!</p><p class="hs-note">Đã chơi ' + runsPlayed() + '/' + Q_RUNS + ' ván.</p>', [CLOSE]); return; }
    const q = qSync(), a = q.active;
    let html = '<h3>Cảnh Sát</h3><p class="hs-note">Treo thưởng mới ra lò! Thật sự không định nhận một cái sao? Phần thưởng đảm bảo hấp dẫn.</p>';   // [LOC object/task_board_disc]
    const btns = [];
    if (a && a.done) {
      html += '<p id="sk-off-done">Không ngờ bạn đã hoàn thành treo thưởng ' + esc(fVi(a.factor)) + '. Quả nhiên bạn không làm tôi thất vọng.</p><p>Thưởng: ' + esc(qReward(a)) + '</p>';   // [LOC officer/challenge_done, welldone]
      btns.push({ id: 'sk-off-claim', label: 'Nhận thưởng', cls: 'ok', fn() {
        const r = qClaim();
        officerDlg(r ? 'Đây là thưởng của bạn: ' + fmt(r.gems) + ' đá, ' + Object.keys(r.items).map(k => itemName(k) + ' ×' + r.items[k]).join(', ') + (r.bp ? ', ' + itemName(r.bp) : '') + '.' : '');   // [LOC officer/reward]
      } });
    } else if (a) {
      html += '<p id="sk-off-active">Đang nhận: ' + esc(qText(a)) + '</p><p>Thưởng: ' + esc(qReward(a)) + '</p><p class="hs-note">Chúc bạn may mắn. Ván Ải kế sẽ tự gắn nhân tố này.</p>';   // [LOC officer/hi]
      btns.push({ id: 'sk-off-cancel', label: 'Hủy nhiệm vụ', fn() { qCancel(); officerDlg('Tôi biết mà'); } });   // [LOC officer/success_cancel]
    } else if (q.claimed >= Q_DAILY) {
      html += '<p id="sk-off-out">Hôm nay bạn đã hoàn thành đủ treo thưởng. Mai quay lại nhé.</p>';
    } else {
      html += '<p>Nhận nhiệm vụ?</p><ul class="sk-list" id="sk-off-list">' + q.offers.map((o, i) => '<li><span>' + esc(qText(o)) + '<small>Thưởng: ' + esc(qReward(o)) + '</small></span>' +
        '<button class="hs-btn ok" data-i="' + i + '">Nhận</button></li>').join('') + '</ul>';   // [LOC Object_quest_talk]
    }
    if (note) html += '<p id="sk-off-note">' + esc(note) + '</p>';
    html += '<p class="hs-note">Hôm nay đã hoàn thành ' + q.claimed + '/' + Q_DAILY + ' treo thưởng.</p>';
    btns.push(CLOSE);
    dlg(html, btns);
    for (const b of document.querySelectorAll('#sk-off-list button')) b.onclick = () => { qAccept(+b.dataset.i); officerDlg('Chúc bạn may mắn'); };
  }
  SK.hall.addZone('officer', OFFICER_AT[0], OFFICER_AT[1], null, {
    name: 'Cảnh Sát', loc: 'Object_officer', use: () => officerDlg(), box: [OFFICER_AT[0] - 1.6, OFFICER_AT[1] - 0.9, OFFICER_AT[0] + 1.2, OFFICER_AT[1] + 1.2],
    draw(ctx, x, y, t) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      // bảng nhiệm vụ: tấm gỗ có giấy treo thưởng
      ctx.fillStyle = '#4a3322'; ctx.fillRect(x - 25, y - 30, 17, 26); ctx.fillStyle = '#6b4b32'; ctx.fillRect(x - 24, y - 29, 15, 24);
      ctx.fillStyle = '#e9dcb9'; ctx.fillRect(x - 22, y - 27, 5, 7); ctx.fillRect(x - 15, y - 25, 5, 8); ctx.fillRect(x - 21, y - 17, 6, 8);
      ctx.fillStyle = '#4a3322'; ctx.fillRect(x - 17, y - 4, 2, 4); ctx.fillRect(x - 13, y - 4, 2, 4);
      const hd = SK.heroSkin && DS.heroes.officer && D.heroes.officer ? SK.heroSkin('officer', 0) : null;
      if (hd) SK.draw(ctx, SK.animFrame(hd.idle, t), x + 4, y, { flip: true });
      if (S.quest.active && S.quest.active.done) { ctx.fillStyle = '#ffd452'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x + 4, y - 40 + Math.sin(t * 5) * 2); }
    }
  });
  USE.officer = () => officerDlg();

  // Nhận nhân tố của việc đang làm vào ván Ải kế (bọc startRun: nhân tố phải có trước khi SK.factorsOn dựng G.mods).
  const startRun0 = SK.startRun;
  SK.startRun = function (heroId, mode, factors) {
    const a = S.quest.active;
    if (a && !a.done && (mode == null || mode === 'level') && SK.FACTORS[a.factor]) {
      const f = (Array.isArray(factors) ? factors : []).slice();
      if (f.indexOf(a.factor) < 0) { if (f.length >= (SK.FACTOR_MAX || 3)) f.pop(); f.push(a.factor); }
      factors = f;
    }
    return startRun0.call(this, heroId, mode, factors);
  };
  // Xong ván (thắng hay thua) đạt chỉ tiêu thì việc chuyển sang "đã xong, chờ nhận thưởng".
  SK.on('runEnd', (G, r) => {
    const a = S.quest.active;
    if (!a || a.done || G.mode !== 'level' || !(G.factors || []).includes(a.factor)) return;
    const v = a.type === 'defeat' ? r.kills : r.gold;
    if (v >= a.target) { a.done = true; save(); toast('Treo thưởng hoàn thành: ' + fVi(a.factor) + '. Gặp Cảnh Sát nhận thưởng.', 4); }
  });

  // ---------------------------------------------------------------- vào ván: đồ uống, Giếng, Tượng
  const hurt0 = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {   // Sữa Bò: mỗi đòn nhận bớt phòng thủ, không xuống dưới 1
    const p = G && G.player;
    if (p && p._milk && dmg > 1) dmg = Math.max(1, dmg - p._milk);
    return hurt0.call(this, G, dmg, ...rest);
  };
  SK.on('runStart', G => {
    const p = G.player; if (!p || G.mode === 'bossrush') return;
    const run = G.hallRun = { drinks: S.drinks.slice(), well: !!S.well, statue: S.statue };
    for (const k of S.drinks) if (DRINKS[k]) DRINKS[k].on(G, p);
    if (S.drinks.length) toast('Đã uống: ' + S.drinks.map(k => DRINKS[k].vi).join(', '), 3);
    if (S.well) { G.hallWell = true; }
    if (S.statue) {
      const id = S.statue;
      p.statues = [id]; p.statueCds = { [id]: 0 };
      toast('Chúc phúc tượng: ' + sName(id), 3);
    }
    S.drinks = []; S.well = 0; S.statue = 0; save();
    void run;
  });
  SK.on('pickup', (G, kind) => {   // Cầu Năng Lượng +1 [LOC guide/magic_well]: 8 → 9
    const p = G.player;
    if (kind === 'energy' && G.hallWell && p) p.energy = Math.min(p.energyMax, p.energy + 1);
  });

  Object.defineProperty(P, 'drinks', { get: () => S.drinks.slice(), configurable: true });
  SK.hallExt = {
    DRINKS, state: () => JSON.parse(JSON.stringify(S)), stock, buyDrink, drinkPrice: k => DRINKS[k].price,
    statuePrice, statuePray, fish: { state: () => ({ on: fish.on, pos: fish.pos, zone: [0.5 - ZONE_W / 2, 0.5 + ZONE_W / 2], inZone: inZone(), list: FISH.map(f => f[0]), daily: FISH_DAILY }), reel, pickFish },
    quest: { sync: qSync, accept: qAccept, claim: qClaim, open: qOpen, text: qText, TIER }, BP, runsPlayed
  };
})();
