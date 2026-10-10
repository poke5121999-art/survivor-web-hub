// Sảnh chọn nhân vật + chọn chế độ + cửa hàng đá quý (mua bằng tiền thật là GIẢ LẬP): thay SK.lobby,
// gọi SK.startRun(heroId). Màn chọn nhân vật là prefab uGUI gốc 8.6 (common.ab › ui_choose_hero.prefab, lớp
// ChooseHeroView) dựng lại bằng SK.ugui trên canvas #hs-ui; chọn chế độ và các hộp thoại vẫn là DOM.
(function () {
  'use strict';
  const SK = window.SK, G = SK.G, D = SK.D, DS = SK.DS;
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
  const P = Object.assign({ gems: 0, unlocked: ['knight'], selected: 'knight', skills: {}, slot: {}, level: {}, view: 'art', demo: true, won: {} },
    loadProfile() || {});
  if (!Array.isArray(P.unlocked)) P.unlocked = [];
  if (P.unlocked.indexOf('knight') < 0) P.unlocked.push('knight');
  if (!DS.heroes[P.selected]) P.selected = 'knight';
  if (!P.won || typeof P.won !== 'object') P.won = {};
  if (!P.skin || typeof P.skin !== 'object') P.skin = {};
  if (!P.wonBadass || typeof P.wonBadass !== 'object') P.wonBadass = {};
  if (!Array.isArray(P.factors)) P.factors = [];   // khoá Nhân Tố Thử Thách đã chọn (SK.FACTORS, js/factors.js)
  // Lợi Hại mở sau khi vượt Chế độ Ải một lần [WIKI]; bản gốc còn đòi mở hết vật phẩm Phòng Khách [LOC I_tip_09] — sảnh web
  // chưa có kinh tế vật phẩm nên bỏ điều kiện này (GAPS.md).
  const badassOpen = () => Object.keys(P.won).length > 0;
  P.gems = Math.max(0, Math.floor(+P.gems || 0));
  // Sảnh kiểu Nhà Kỵ Sĩ (HALL.md): kho vật liệu, vũ khí đã nhặt, ngày, thư, két sắt, thống kê. Hồ sơ cũ thiếu trường thì rỗng.
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const cleanMap = o => { const r = {}; if (isObj(o)) for (const k of Object.keys(o)) { const n = Math.floor(+o[k]); if (n > 0) r[k] = n; } return r; };
  P.inv = cleanMap(P.inv);                       // {khoá vật phẩm: số} (SK_ITEMS: vật liệu, hạt giống, vé đổi, bản vẽ)
  P.picked = cleanMap(P.picked);                 // {id vũ khí: số lần đã nhặt} (điều kiện mở Bàn Rèn, bước 4)
  P.day = typeof P.day === 'string' ? P.day : '';   // YYYY-MM-DD giờ máy; đổi ngày thì xoá daily
  P.daily = isObj(P.daily) ? P.daily : {};       // việc làm một lần mỗi ngày: {postman: 1, ...}
  P.mail = Array.isArray(P.mail) ? P.mail.filter(m => m && m.id && m.title) : [];   // [{id, title, body, reward:{gems?, items?}}]
  P.safe = Math.max(0, Math.min(5, Math.floor(+P.safe || 0)));   // cấp Két Sắt 0..5
  P.box = Array.isArray(P.box) ? P.box.filter(id => DS.weapons[id]) : [];   // hòm vũ khí chờ mang vào ván (bưu kiện, Máy Đổi)
  // Bàn Thiết Kế / Bàn Rèn / Rương / Máy Quay Trứng / Mèo Chiêu Tài (HALL.md bước 4-5).
  P.devd = cleanMap(P.devd);                     // {khoá bản vẽ: 1} đã nghiên cứu
  P.forged = Array.isArray(P.forged) ? P.forged.filter(id => DS.weapons[id]).slice(0, 4) : [];   // đồ rèn chờ mang vào ván (tối đa 4 [WIKI touchtapplay forge])
  P.carry = isObj(P.carry) && DS.weapons[P.carry.id] && (P.carry.from === 'box' || P.carry.from === 'forged') ? { id: P.carry.id, from: P.carry.from } : null;   // vũ khí mang vào ván kế (ô thứ 2)
  P.eggPity = Math.max(0, Math.floor(+P.eggPity || 0));   // số lượt quay liên tiếp chưa ra mảnh skin (bảo đảm lượt 20)
  P.fish = Math.max(0, Math.floor(+P.fish || 0));         // Cá Khô (tiền của tiệm Mèo Chiêu Tài)
  // Thú cưng (HALL.md mục 15, js/hall_pet.js): đã mua, đang chọn, độ thân mật, số lần đã cho ăn trong lượt chơi hiện tại.
  P.pets = Array.isArray(P.pets) ? P.pets.filter(id => typeof id === 'string') : [];
  P.petSel = typeof P.petSel === 'string' ? P.petSel : 'pet0';
  P.aff = cleanMap(P.aff);
  P.fed = cleanMap(P.fed);
  P.stats = Object.assign({ kills: 0, boss: 0, pass: 0, dead: 0, best: 0 }, isObj(P.stats) ? P.stats : {});
  for (const k of Object.keys(P.stats)) P.stats[k] = Math.max(0, Math.floor(+P.stats[k] || 0));
  // Thành tựu (js/ach.js): done/claimed {id: 1}, c = bộ đếm theo loại điều kiện. Hồ sơ cũ thiếu thì rỗng; ach.js tự điền c.
  P.ach = isObj(P.ach) ? P.ach : {};
  P.ach.done = cleanMap(P.ach.done); P.ach.claimed = cleanMap(P.ach.claimed); P.ach.c = isObj(P.ach.c) ? P.ach.c : null;
  // Vườn (js/garden.js): 8 ô trồng {seed, stage, watered, fert}, ô đã mở, chỉ số ngày đã xử lý, sản phẩm chờ vào ván kế (thiên phú, ô thiên phú,
  // thức uống, thú cưng). Hồ sơ cũ thiếu trường thì mặc định: 3 ô đầu mở sẵn, vườn trống.
  const GARDEN_PLOTS = 8;
  if (!isObj(P.garden)) P.garden = {};
  P.garden.open = Array.from({ length: GARDEN_PLOTS }, (_, i) => (Array.isArray(P.garden.open) ? !!P.garden.open[i] : false) || i < 3);
  P.garden.plots = Array.from({ length: GARDEN_PLOTS }, (_, i) => {
    const q = Array.isArray(P.garden.plots) && isObj(P.garden.plots[i]) ? P.garden.plots[i] : null;
    return q && typeof q.seed === 'string' ? { seed: q.seed, stage: Math.max(0, Math.floor(+q.stage || 0)), watered: !!q.watered, fert: !!q.fert } : { seed: null, stage: 0, watered: false, fert: false };
  });
  P.garden.day = Number.isFinite(+P.garden.day) && P.garden.day != null ? Math.floor(+P.garden.day) : null;
  P.garden.buffs = Array.isArray(P.garden.buffs) ? P.garden.buffs.map(Number).filter(n => n > 0) : [];
  P.garden.slots = Math.max(0, Math.floor(+P.garden.slots || 0));
  P.garden.drink = isObj(P.garden.drink) ? { hp: Math.max(0, +P.garden.drink.hp | 0), energy: Math.max(0, +P.garden.drink.energy | 0) } : { hp: 0, energy: 0 };
  P.garden.pets = Array.isArray(P.garden.pets) ? P.garden.pets.filter(k => typeof k === 'string') : [];
  const two = n => (n < 10 ? '0' : '') + n;
  let dayShift = 0;   // móc kiểm thử: lùi/tiến ngày của hồ sơ (shiftDay)
  const todayStr = () => { const d = new Date(Date.now() + dayShift * 864e5); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); };
  function rollDay() { const t = todayStr(); if (P.day !== t) { P.day = t; P.daily = {}; save(); } }
  let mailSeq = 0;
  const mailId = () => 'm' + Date.now().toString(36) + (mailSeq++).toString(36);
  // Thư chào [LOC mailbox/welcome_title, welcome_content], không kèm thưởng: gửi một lần cho hồ sơ chưa có hộp thư.
  if (!P.welcomed) {
    P.welcomed = 1;
    P.mail.push({ id: mailId(), title: 'Huấn luyện đạt', body: 'Chúc mừng bạn đã hoàn thành giáo trình huấn luyện, nhưng trong Nhà Ngục còn nhiều quái vật nguy hiểm. Mau cầm vũ khí đánh bại chúng!', reward: {} });
  }
  // Két Sắt: cấp 1..5 cộng vàng đầu ván 2/4/6/8/10, giá 500..2500 đá; mở sau khi qua ải 2-2 [WIKI soul-knight.fandom.com/wiki/Safe].
  // Các cấp giữa nội suy tuyến tính [ƯỚC LƯỢNG]. best = số màn đã vượt xa nhất (2-2 = màn thứ 7 trong SK.STAGES).
  const SAFE_COST = [500, 1000, 1500, 2000, 2500], SAFE_GOLD = [2, 4, 6, 8, 10], SAFE_OPEN_BEST = 7;
  // Vàng còn lại cuối ván đổi thành đá [LOC I_tip_10]; tỉ lệ không có trong config → 1 vàng = 1 đá [ƯỚC LƯỢNG].
  const GOLD_GEM = 1;
  // Thú cưng: Thức ăn cho pet = material_grain +10 [WIKI Pets "Pet Treat 10"]; Phân Bón chỉ cho con có món Fertilizer, 10 [ƯỚC LƯỢNG];
  // các món khác của wiki (Meat, Fish, Bamboo...) chưa có trong SK_ITEMS nên bỏ. Tối đa 7 lần mỗi ván [WIKI]; +10 khi xong ván [ƯỚC LƯỢNG].
  const PET_FEED = { material_grain: { pts: 10 }, material_fertilize: { pts: 10, only: 'Fertilizer' } }, PET_FEED_MAX = 7, PET_RUN_AFF = 10;
  const petData = id => (window.SK_PETS && SK_PETS.pets[id]) || null;
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
    skinOf: id => P.skin[id] || 0,
    get badass() { return P.diff === 'badass' && badassOpen(); },
    // Nhân Tố Thử Thách: khoá hợp lệ, không trùng, tối đa SK.FACTOR_MAX; chỉ dùng khi vào trận từ thẻ "Nhân Tố Thử Thách".
    get factors() { return P.factors.filter((k, i) => SK.FACTORS && SK.FACTORS[k] && P.factors.indexOf(k) === i).slice(0, SK.FACTOR_MAX || 3); },
    setFactors(list) { P.factors = (list || []).filter((k, i, a) => SK.FACTORS && SK.FACTORS[k] && a.indexOf(k) === i).slice(0, SK.FACTOR_MAX || 3); save(); return P.factors.slice(); },
    toggleFactor(k) {
      const cur = this.factors, i = cur.indexOf(k);
      if (i >= 0) cur.splice(i, 1); else if (SK.FACTORS && SK.FACTORS[k] && cur.length < (SK.FACTOR_MAX || 3)) cur.push(k); else return false;
      this.setFactors(cur); return true;
    },
    setBadass(on) { if (on && !badassOpen()) return false; P.diff = on ? 'badass' : 'normal'; save(); return true; },
    badassOpen: () => badassOpen(),
    // ---- kho vật liệu: khoá trong SK_ITEMS.items; n âm = tiêu (không xuống dưới 0)
    item: key => P.inv[key] | 0,
    items() { return Object.assign({}, P.inv); },
    addItem(key, n) {
      n = Math.floor(n == null ? 1 : n);
      const v = Math.max(0, (P.inv[key] | 0) + n);
      if (v) P.inv[key] = v; else delete P.inv[key];
      save(); return v;
    },
    spendItem(key, n) { if ((P.inv[key] | 0) < n) return false; this.addItem(key, -n); return true; },
    // ---- vũ khí đã nhặt (đếm mỗi lần nhặt, giữ qua các ván)
    pickWeapon(id) { if (!DS.weapons[id]) return 0; P.picked[id] = (P.picked[id] | 0) + 1; save(); return P.picked[id]; },
    picked: id => P.picked[id] | 0,
    // ---- hòm vũ khí chờ mang vào ván
    get box() { return P.box.slice(); },
    get boxFull() { return P.box.length >= BOX_MAX; },
    addBox(id) { if (!DS.weapons[id] || P.box.length >= BOX_MAX) return false; P.box.push(id); save(); return true; },
    dropBox(id) { const i = P.box.indexOf(id); if (i < 0) return false; P.box.splice(i, 1); save(); return true; },
    // ---- nghiên cứu bản vẽ (Bàn Thiết Kế), đồ rèn (Bàn Rèn), vũ khí mang vào ván (Rương)
    devd: key => !!P.devd[key],
    get devdAll() { return Object.assign({}, P.devd); },
    markDevd(key) { P.devd[key] = 1; save(); },
    get forged() { return P.forged.slice(); },
    get forgedFull() { return P.forged.length >= FORGED_MAX; },
    addForged(id) { if (!DS.weapons[id] || P.forged.length >= FORGED_MAX) return false; P.forged.push(id); save(); return true; },
    get carry() { return P.carry && Object.assign({}, P.carry); },
    setCarry(id, from) {
      if (id == null) { P.carry = null; save(); return true; }
      const src = from === 'forged' ? P.forged : P.box;
      if (!DS.weapons[id] || src.indexOf(id) < 0) return false;
      P.carry = { id, from: from === 'forged' ? 'forged' : 'box' }; save(); return true;
    },
    // Dùng món mang theo: đồ rèn bỏ khỏi danh sách (dùng một ván), vũ khí trong hòm vẫn còn ("1 vũ khí miễn phí cho mỗi lượt").
    takeCarry() {
      const c = P.carry; if (!c) return null;
      P.carry = null;
      if (c.from === 'forged') { const i = P.forged.indexOf(c.id); if (i >= 0) P.forged.splice(i, 1); }
      save(); return c.id;
    },
    get eggPity() { return P.eggPity; },
    setEggPity(n) { P.eggPity = Math.max(0, Math.floor(n)); save(); },
    get fish() { return P.fish; },
    addFish(n) { P.fish = Math.max(0, P.fish + Math.floor(n)); save(); return P.fish; },
    spendFish(n) { if (P.fish < n) return false; P.fish -= n; save(); return true; },
    // ---- thú cưng: sở hữu / chọn / thân mật / cho ăn [WIKI Pets]. Số liệu: data/sk-pets.js (unlock, food, affMax).
    petOwned: id => { const d = petData(id); return !!d && (d.unlock.kind === 'free' || P.pets.indexOf(id) >= 0 || (d.unlock.kind === 'achievement' && !!SK.ach && SK.ach.petOwned(id))); },
    pet() { return petData(P.petSel) && this.petOwned(P.petSel) ? P.petSel : 'pet0'; },
    setPet(id) { if (!this.petOwned(id)) return false; P.petSel = id; save(); return true; },
    buyPet(id) {
      const d = petData(id), u = d && d.unlock;
      if (!d) return { ok: false, err: 'không có thú cưng này' };
      if (this.petOwned(id)) return { ok: false, err: 'đã sở hữu' };
      if (u.kind === 'gems') { if (!this.spend(u.cost)) return { ok: false, err: 'không đủ đá quý' }; }
      else if (u.kind === 'fish') { if (!this.spendFish(u.cost)) return { ok: false, err: 'không đủ Cá Khô' }; }
      else return { ok: false, err: 'không bán' };
      P.pets.push(id); save(); if (built) refresh();
      return { ok: true, cost: u.cost, kind: u.kind };
    },
    petAff: id => Math.min(P.aff[id] | 0, (petData(id) || { affMax: 240 }).affMax),
    petAffMax: id => (petData(id) || { affMax: 240 }).affMax,
    petSkillOn: id => (P.aff[id] | 0) >= (petData(id) || { affMax: 240 }).affMax * 0.5,   // đạt 50% thì mở kỹ năng [WIKI Pets]
    petFed: id => P.fed[id] | 0,
    PET_FEED, PET_FEED_MAX,
    // Cho ăn: tối đa PET_FEED_MAX lần mỗi lượt chơi; điểm theo món (bảng PET_FEED); tốn 1 vật phẩm.
    feedPet(id, item) {
      const d = petData(id), pts = (PET_FEED[item] || {}).pts;
      if (!d || !this.petOwned(id)) return { ok: false, err: 'chưa sở hữu' };
      if (!pts || (PET_FEED[item].only && d.food.indexOf(PET_FEED[item].only) < 0)) return { ok: false, err: 'món này không dùng được' };
      if ((P.fed[id] | 0) >= PET_FEED_MAX) return { ok: false, full: true, err: 'No quá rồi. Dẫn tôi đi đánh nhau đi.' };
      if (this.petAff(id) >= d.affMax) return { ok: false, maxed: true, err: 'độ thân mật đã đầy' };
      if (!this.spendItem(item, 1)) return { ok: false, err: 'hết món này' };
      const before = this.petAff(id);
      P.aff[id] = Math.min(d.affMax, before + pts); P.fed[id] = (P.fed[id] | 0) + 1; save();
      return { ok: true, pts: P.aff[id] - before, aff: P.aff[id], n: P.fed[id] };
    },
    // Xong một ván: thú cưng đang theo +PET_RUN_AFF thân mật, đặt lại số lần cho ăn.
    petRunEnd(id) {
      const d = petData(id);
      if (d && this.petOwned(id)) P.aff[id] = Math.min(d.affMax, (P.aff[id] | 0) + PET_RUN_AFF);
      P.fed = {}; save();
    },
    // ---- Vườn: đối tượng sống P.garden (js/garden.js đọc/ghi rồi gọi gardenSave), chỉ số ngày liên tục, móc kiểm thử đổi ngày
    garden() { return P.garden; },
    gardenSave() { save(); },
    get dayIndex() { rollDay(); const m = /^(\d+)-(\d+)-(\d+)$/.exec(P.day); return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5); },
    shiftDay(n) { dayShift += Math.floor(n); rollDay(); return P.day; },
    dailyCount(name) { rollDay(); return P.daily[name] | 0; },
    bumpDaily(name, n) { rollDay(); P.daily[name] = (P.daily[name] | 0) + (n == null ? 1 : n); save(); return P.daily[name]; },
    // ---- ngày + việc hằng ngày
    get day() { rollDay(); return P.day; },
    dailyDone(name) { rollDay(); return !!P.daily[name]; },
    markDaily(name) { rollDay(); P.daily[name] = 1; save(); },
    // ---- thư: reward {gems?, items?: {khoá: số}}; nhận thư thì cộng thưởng rồi xoá thư
    get mail() { return P.mail.map(m => Object.assign({}, m, { reward: Object.assign({}, m.reward) })); },
    addMail(m) {
      const id = mailId();
      P.mail.push({ id, title: String(m.title || ''), body: String(m.body || ''), reward: Object.assign({}, m.reward) });
      save(); if (built) refresh(); return id;
    },
    claimMail(id) {
      const i = P.mail.findIndex(m => m.id === id); if (i < 0) return null;
      const r = P.mail[i].reward || {};
      P.mail.splice(i, 1);
      if (r.gems) P.gems += Math.max(0, Math.floor(r.gems));
      for (const k of Object.keys(r.items || {})) P.inv[k] = (P.inv[k] | 0) + Math.max(0, Math.floor(r.items[k]));
      save(); if (built) refresh();
      return { gems: r.gems | 0, items: Object.assign({}, r.items) };
    },
    deleteMail(id) {
      const i = P.mail.findIndex(m => m.id === id), r = i >= 0 && P.mail[i].reward;
      if (i < 0 || (r && (r.gems || Object.keys(r.items || {}).length))) return false;   // thưởng chưa nhận thì không xoá [LOC mailbox/confirm_delete_read]
      P.mail.splice(i, 1); save(); return true;
    },
    // ---- két sắt
    get safe() {
      const lv = P.safe;
      return { level: lv, max: SAFE_COST.length, gold: lv ? SAFE_GOLD[lv - 1] : 0, nextCost: lv < SAFE_COST.length ? SAFE_COST[lv] : 0,
        nextGold: lv < SAFE_COST.length ? SAFE_GOLD[lv] : 0, open: P.stats.best >= SAFE_OPEN_BEST };
    },
    upgradeSafe() {
      const s = this.safe;
      if (!s.open) return { ok: false, reason: 'locked' };
      if (s.level >= s.max) return { ok: false, reason: 'max' };
      if (P.gems < s.nextCost) return { ok: false, reason: 'gems', need: s.nextCost - P.gems };
      P.gems -= s.nextCost; P.safe++; save(); if (built) refresh();
      return { ok: true, level: P.safe, gold: SAFE_GOLD[P.safe - 1], cost: s.nextCost };
    },
    // ---- thành tựu: đối tượng sống P.ach (js/ach.js đọc/ghi rồi gọi achSave)
    ach() { return P.ach; },
    achSave() { save(); },
    // ---- thống kê
    get stats() { return Object.assign({}, P.stats); },
    addStat(k, n) { if (k in P.stats) { P.stats[k] += Math.max(0, Math.floor(n == null ? 1 : n)); save(); } },
    // ---- chuyển phát: 500 đá/ngày (+100 sau nâng cấp) [WIKI soul-knight.fandom.com/wiki/Gems; LOC item/postmanUpgrade_desc]
    get postmanPlus() { return !!P.postmanPlus; },
    upgradePostman() { P.postmanPlus = 1; save(); },
    reset() { try { localStorage.removeItem(KEY); } catch (_) { /* bỏ qua */ } }
  };
  const isUnlocked = SK.profile.isUnlocked;
  const FORGED_MAX = 4;
  const BOX_MAX = 8;   // chỗ hòm vũ khí [ƯỚC LƯỢNG]; Bàn Rèn gốc giữ tối đa 4 món rèn [WIKI touchtapplay forge]

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
  function heroStats(id) {
    const h = DS.heroes[id], b = upgradeBonus(id);
    return { hp: h.hp + b.hp, armor: h.armor + b.armor, energy: h.energy + b.energy, crit: h.crit || 0 };
  }

  // ---------------------------------------------------------------- vẽ khung atlas
  // Skin của hero: 0 = mặc định; skin khác vẽ khi gói data/skins/<hero>.js đã nạp (SK.loadPack), chưa nạp thì s0.
  const skinList = id => [0].concat(((window.SK_SKINS && SK_SKINS[id]) || { skins: [] }).skins.map(x => +x[0].slice(1)));
  const heroAnim = (id, kind, skin) => { const e = SK.heroSkin(id, skin == null ? P.skin[id] : skin); return e && e[kind]; };
  const heroFrame0 = (id, skin) => { const a = SK.anim(heroAnim(id, 'idle', skin)); return a && a.f[0]; };
  function drawFit(cv, name, o) {
    const ctx = cv.getContext('2d'), f = SK.frame(name);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!f) return;
    const k = Math.max(1, Math.floor(Math.min((cv.width - 2) / f[3], (cv.height - 2) / f[4], (o && o.max) || 9)));
    if (o && o.feet) SK.draw(ctx, name, cv.width / 2, cv.height - 2, { sx: k, sy: k });
    else SK.draw(ctx, name, Math.round(cv.width / 2 - f[3] * k / 2 + f[5] * k), Math.round(cv.height / 2 - f[4] * k / 2 + f[6] * k), { sx: k, sy: k });
  }
  // Khung atlas game (nhân vật, súng) vừa khít rect R của một nút uGUI.
  function fitSprite(ctx, name, R, fill) {
    const f = SK.frame(name);
    if (!f) return;
    const sc = Math.min(R.w / f[3], R.h / f[4]) * (fill || 1);
    SK.draw(ctx, name, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h / 2 - (f[4] / 2 - f[6]) * sc, { sx: sc, sy: sc });
  }
  const skillSheet = new Image();
  skillSheet.src = ART + 'skills.png';
  function drawSkillIcon(ctx, idx, R) {
    if (idx == null || idx < 0 || !skillSheet.complete || !skillSheet.naturalWidth) return;
    ctx.drawImage(skillSheet, (idx % 16) * 32, Math.floor(idx / 16) * 32, 32, 32, R.x, R.y, R.w, R.h);
  }
  const portraits = {};
  // Tranh skin n (art/lobby/portrait/<hero>_s<n>.png, tools/skins/build_skins.py); skin không có tranh tĩnh thì tranh skin 0.
  function portrait(id) {
    if (!(LA().portraits || {})[id]) return null;
    const sk = P.skin[id] || 0, ix = window.SK_SKINS && SK_SKINS[id];
    const file = sk && ix && ix.d.indexOf(sk) >= 0 ? id + '_s' + sk : id;
    let im = portraits[file];
    if (!im) { im = portraits[file] = new Image(); im.src = ART + 'portrait/' + file + '.png'; }
    return im.complete && im.naturalWidth ? im : null;
  }

  // ---------------------------------------------------------------- prefab ChooseHeroView
  const U = window.SK_UI;
  const TERM = k => (U && U.terms && U.terms[k]) || k;
  const VIEW = U && U.prefabs.choose_hero && U.prefabs.choose_hero.mbd ? U.prefabs.choose_hero.mbd.ChooseHeroView : {};
  const SCROLL = U && U.prefabs.choose_hero ? (U.prefabs.choose_hero.k.find(n => n.n === 'mask_down').k
    .find(n => n.n === 'skin_scroll_view').mbd || {}) : {};
  const CELL = U && U.prefabs.skin_cell;
  const ATTR = 'ui_left/panel/hero_attributes/';
  const SKP = 'ui_right/skill_panel/';
  const CAR = 'mask_down/skin_scroll_view/viewport/content';
  const CUR = 'mask_up/show_currency_group_widget/';
  // Nút mã gốc chỉ bật theo sự kiện / chế độ khác (nhiều người, mùa giải, dùng thử, hướng dẫn lần đầu) nên tắt.
  const HIDE = ['bubbles', 'upgrade_hero_popup_window', 'count_down', 'btn_group/btn_reward', 'btn_group/btn_shop',
    'btn_group/btn_multi_room_info', 'btn_group/vertical_bar', 'btn_group/btn_hero_list', 'btn_group/btn_home',
    'btn_group/show_currency_group_widget/show_currency_widget/Bg/TextChangeAnim',
    'mask_up/ticket', 'mask_up/wave_energy', 'mask_up/layout/text_name/background',
    'ui_left/ui_choose_jewelry', 'ui_left/mech_panel', ATTR + 'level_panel/super_star', ATTR + 'upgraded_detail_button/upgrade_tip',
    ATTR + 'detail_arrow', ATTR + 'detail_bg', SKP + 'skill_detail_super_hero', SKP + 'skill_demo_tip',
    SKP + 'skill_detail/icon_bg/trial', SKP + 'skill_detail/btn_unlock_skill', SKP + 'skill_detail/fragment_tips',
    'mask_down/super_hero_scroll_view', 'mask_down/switch_to_season_equipments_button', 'mask_down/fullLevelTipText',
    'mask_down/ui_left_button/redPoint', 'mask_down/ui_right_button/redPoint',
    'mask_down/btn_ok/try', 'mask_down/btn_ok/try_skin', 'mask_down/btn_ok/try_skin_active', 'mask_down/btn_ok/use_item',
    'mask_down/center_buttons/btn_upgrade', 'mask_down/center_buttons/btn_unlock/Image', 'mask_down/center_buttons/btn_unlock/limit_sale',
    'mask_down/center_buttons/btn_upgrade_activity', 'mask_down/center_buttons/unlock_way', 'mask_down/center_buttons/unlock_hero_first',
    'mask_down/center_buttons/unlock_by_activity', 'mask_down/center_buttons/btn_unlock_season_irontide',
    'mask_down/center_buttons/unlock_skin_first', 'ui_choose_hero_drawing_buttons/left_btn_customization'];
  // [ĐO] ChooseHeroView..cctor: HideEndValues = (0,180), (0,-300), (-550,0), (550,0) cho mask_up, mask_down, ui_left,
  // ui_right; ShowOrHideView gọi DOTween.To tới ShowEndValues (0,0) trong AnimationDuration = 0,25 s.
  // [SUY] Ease mặc định của DOTween (OutQuad): mã gốc không gọi SetEase.
  const SLIDE = [['mask_up', [0, 180]], ['mask_down', [0, -300]], ['ui_left', [-550, 0]], ['ui_right', [550, 0]]];
  const SLIDE_T = 0.25;
  // [ĐO] ChooseHeroView.AttributesMaxNum = {12, 10, 320, 10}; RefreshHeroAttributes: Image.sizeDelta =
  // (min(giá trị / max × 248, 248), 28), ImageAddition cùng cỡ, Text = giá trị.
  const ATTR_MAX = [12, 10, 320, 10], BAR_W = 248, BAR_H = 28;
  // [ĐO] ChooseHeroView.SkillsPosition[ô đang dùng] = y của skill_1..3; bảng chi tiết (skill_detail) thay chỗ ô đang dùng.
  const SKILL_Y = [[245, -95, -190], [200, 150, -190], [200, 105, 55]];
  // [ĐO] RefreshSkills: ô khoá → icon GrayColor (0,7), tên (147,148,150), chữ phụ (136,137,139); ô mở → tên (206,206,207),
  // chữ phụ (187,188,189); vạch trái blueLine khi đang dùng, grayLine khi không. RefreshSkillDetail: "In Use" màu (60,143,245).
  const C255 = (r, g, b, a) => [r / 255, g / 255, b / 255, a == null ? 1 : a];
  const SK_COL = { lockIcon: [0.7, 0.7, 0.7, 0.7], lockName: C255(147, 148, 150), lockSub: C255(136, 137, 139),
    name: C255(206, 206, 207), sub: C255(187, 188, 189), inUse: C255(60, 143, 245) };
  // [ĐO] FoldPanel / UnfoldPanel: detail_arrow + detail_bg bật khi mở, nút "Cách tăng cấp" ở y -200 (gập) / -275 (mở),
  // panel/bg sizeDelta.y 0 → 80; mũi tên đặt ở (x ô được bấm, -130).
  const FOLD_Y = -200, UNFOLD_Y = -275, UNFOLD_GROW = 80;
  // [ĐO] SkinScrollView: cellInterval 0,2, scrollOffset 0,5, loop; Scroller: scrollSensitivity 5, snap 0,3 s Easing 24
  // (InOutCubic); vị trí ô = (chỉ số − vị trí cuộn) × 0,2 + 0,5, clip skin_item_scroll của ô xếp x/scale/alpha theo nó.
  const CELL_IV = SCROLL.SkinScrollView ? SCROLL.SkinScrollView.cellInterval : 0.2;
  const CELL_OFF = SCROLL.SkinScrollView ? SCROLL.SkinScrollView.scrollOffset : 0.5;
  const SNAP_T = SCROLL.Scroller ? SCROLL.Scroller.snap.Duration : 0.3;
  const SENS = SCROLL.Scroller ? SCROLL.Scroller.scrollSensitivity : 5;
  const VIEWPORT_W = 550;
  // [SUY] Tranh nhân vật: mã gốc nạp prefab tranh vào cảnh; đo trên ảnh chụp 8.6 thì tranh ~1,1 đơn vị canvas mỗi điểm ảnh,
  // tâm cao ~345 đơn vị tính từ đỉnh.
  const DRAW_SCALE = 1.1, DRAW_CY = 345;
  // [SUY] Ô đá quý góc trên phải: ảnh chụp 8.6 đặt nó ngang hàng tên nhân vật (tâm y ≈ 49, mép phải cách 48).
  const CURRENCY_P = [-48, -19];

  let UI = null, cv = null, cx2 = null, slideAt = 0, detail = null;
  const car = { pos: 0, from: 0, to: 0, t0: 0, anim: false, drag: null };
  const now = () => performance.now() / 1000;
  const easeInOutCubic = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const easeOutQuad = x => 1 - (1 - x) * (1 - x);
  const sfx = name => { if (name && SK.sfx && SK.sfx.play) SK.sfx.play(name, { poly: 2, gap: 0.05, vol: 0.7 }); };

  function ui() {
    if (UI || !SK.ugui || !SK.ugui.ok || !U.prefabs.choose_hero) return UI;
    UI = SK.ugui.inst('choose_hero');
    for (const p of HIDE) { const n = UI.q(p); if (n) n.off = 1; }
    // Ô tiền tệ của btn_group bị dải đen mask_up (vẽ sau) che mất; ở bản gốc nó nằm trên canvas riêng phía trên.
    // Chuyển nó thành con cuối của mask_up (cùng neo góc trên phải màn hình) để vẽ đè lên dải đen.
    const grp = UI.q('btn_group'), cur = grp.k.find(n => n.n === 'show_currency_group_widget');
    grp.k = grp.k.filter(n => n !== cur);
    UI.q('mask_up').k.push(cur);
    cur.p = CURRENCY_P.slice();
    UI.reindex();
    // [SUY] Icon đá quý: ui_102 (viên đá xanh của nút cửa hàng gốc); prefab để ui_361 (đồng vàng) làm chỗ giữ.
    UI.q(CUR + 'show_currency_widget/Bg/Image/Icon').img.sp = 'ui_102';
    UI.q(ATTR + 'level_panel/hero_icon').draw = (ctx, R) => fitSprite(ctx, heroFrame0(P.selected), R);
    UI.q(ATTR + 'weapon/icon').draw = (ctx, R) => {
      const w = DS.weapons[DS.heroes[P.selected].weapon];
      fitSprite(ctx, w && w.sprite, { x: R.x - R.w * 0.2, y: R.y - R.h * 0.2, w: R.w * 1.4, h: R.h * 1.4 });
    };
    UI.q(SKP + 'skill_detail/icon_bg/icon').draw = (ctx, R) => drawSkillIcon(ctx, (skillList(P.selected)[curSlot()] || {}).icon, R);
    const price = UI.q('mask_down/center_buttons/btn_unlock/Layout/Text2');
    price.sc = [1, 1]; price.sz = [260, 50];
    price.draw = drawPrice;
    UI.q('mask_down/center_buttons/btn_unlock/Layout/Text1').txt.s = TERM('UNLOCK');
    UI.q(SKP + 'skill_detail/content').txt.s = TERM('multi_room_skin_ui_using');
    UI.q(SKP + 'skill_detail/content').txt.c = SK_COL.inUse;
    // [ĐO] ChooseHeroView.<FixedSkillDescriptionSize>d__244.MoveNext: scroll_view.sizeDelta = (310, 190),
    // anchoredPosition = (-13, -18) khi không có nút mở kỹ năng (22 khi có) — prefab lưu (310, 112) ở y 22.
    const sv = UI.q(SKP + 'skill_detail/scroll_view');
    sv.p = [-13, -18]; sv.sz = [310, 190];
    for (let i = 1; i <= 3; i++) {
      const b = SKP + 'skill_' + i + '/up/';
      UI.q(b + 'icon_bg/trial').off = 1;
      UI.q(b + 'icon_bg/icon').draw = (ctx, R) => {
        const n = UI.q(b + 'icon_bg/icon');
        const a = ctx.globalAlpha;
        ctx.globalAlpha *= n.img.c[3];
        if (n.gray) ctx.filter = 'grayscale(1) brightness(0.7)';
        drawSkillIcon(ctx, (skillList(P.selected)[i - 1] || {}).icon, R);
        ctx.globalAlpha = a;
      };
    }
    return UI;
  }

  // Giá trên nút "Mở khóa" giữa màn: font số bitmap `number` của bản gốc ("g500": g = viên đá) không xuất được,
  // vẽ icon đá quý gốc ui_102 + số bằng pixel_bold.
  function drawPrice(ctx, R) {
    const pr = heroPrice(P.selected), gem = pr.kind === 'gems';
    const s = pr.kind === 'money' ? '$' + pr.amount.toFixed(2) : String(pr.amount || 0);
    ctx.font = '40px "skui_pixel_bold", "skui_BeVietnamPro-Regular", monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const tw = ctx.measureText(s).width, iw = gem ? 40 : 0, gap = gem ? 8 : 0, x0 = R.x + (R.w - tw - iw - gap) / 2, cy = R.y + R.h / 2;
    if (gem) SK.ugui.drawFrame(ctx, 'ui_102', { x: x0, y: cy - 18, w: 40, h: 36 });
    ctx.fillStyle = '#000'; ctx.fillText(s, x0 + iw + gap + 3, cy + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(s, x0 + iw + gap, cy);
  }

  const curSlot = () => { const n = skillList(P.selected).length; return Math.min(P.slot[P.selected] || 0, n - 1); };

  // ---------------------------------------------------------------- bơm dữ liệu vào prefab
  function refresh() {
    if (!built) return;
    const id = P.selected, h = DS.heroes[id], lv = P.level[id] || 0, open = isUnlocked(id), vals = heroStats(id);
    $('sk-hero-line').textContent = heroName(id) + ' — Máu ' + vals.hp + ' · Giáp ' + vals.armor + ' · Năng lượng ' + vals.energy;
    if (!ui()) return;
    UI.q('mask_up/layout/text_name').txt.s = heroName(id);
    UI.q(CUR + 'show_currency_widget/Bg/Text').txt.s = String(P.gems);
    // Thanh chỉ số
    [vals.hp, vals.armor, vals.energy, vals.crit].forEach((v, i) => {
      const b = ATTR + 'value' + (i + 1) + '/', w = Math.min(v / ATTR_MAX[i] * BAR_W, BAR_W);
      UI.q(b + 'Text').txt.s = String(v);
      UI.q(b + 'Image').sz = [w, BAR_H];
      UI.q(b + 'ImageAddition').sz = [w, BAR_H];
    });
    // Sao cấp: hàng sao đen = số cấp tối đa, hàng sao sáng = cấp đã nâng.
    const nUp = Math.min(8, (h.upgrades || []).length || 7);
    UI.q(ATTR + 'level_panel/stars/bg').k.forEach((s, i) => { if (i < nUp) delete s.off; else s.off = 1; });
    UI.q(ATTR + 'level_panel/stars/layout').k.forEach((s, i) => { if (i < Math.min(lv, nUp)) delete s.off; else s.off = 1; });
    if (lv >= 8) delete UI.q(ATTR + 'level_panel/super_star').off; else UI.q(ATTR + 'level_panel/super_star').off = 1;
    if (open) UI.q(ATTR + 'buff/lock').off = 1; else delete UI.q(ATTR + 'buff/lock').off;
    refreshDetail();
    refreshSkills();
    // Ô tick "Trình diễn kỹ năng": sprite checkboxSelected / checkboxUnselected của ChooseHeroView.
    UI.q('mask_down/skill_demo_checkbox/checkbox').img.sp = P.demo !== false ? (VIEW.checkboxSelected || 'ui_255') : (VIEW.checkboxUnselected || 'ui_254');
    // Nhân vật khoá: nút "Bắt đầu" xám (RefreshConfirmButton gán RGMaterial/ui_gray.mat), hiện nút "Mở khóa" + giá giữa màn.
    UI.q('mask_down/btn_ok').gray = !open;
    const unlock = UI.q('mask_down/center_buttons/btn_unlock');
    if (open) unlock.off = 1; else { delete unlock.off; unlock.p = [0, 120]; }
    // Nút lưu tranh chỉ hiện khi nhân vật có tranh (ảnh chụp 8.6: tranh pixel của Cassandra không có nút này).
    const saveBtn = UI.q('ui_choose_hero_drawing_buttons/save_drawing_button');
    if ((LA().portraits || {})[id]) delete saveBtn.off; else saveBtn.off = 1;
  }

  function refreshSkills() {
    const id = P.selected, list = skillList(id), cur = curSlot(), ys = SKILL_Y[cur] || SKILL_Y[0];
    for (let i = 0; i < 3; i++) {
      const n = UI.q(SKP + 'skill_' + (i + 1)), s = list[i];
      if (!s || i === cur) { n.off = 1; continue; }
      delete n.off;
      n.p = [0, ys[i]];
      const b = SKP + 'skill_' + (i + 1) + '/', open = SK.profile.isSkillUnlocked(id, i) && isUnlocked(id);
      const pr = skillPrice(id, i);
      UI.q(b + 'up/name').txt.s = s.name;
      UI.q(b + 'up/name').txt.c = open ? SK_COL.name : SK_COL.lockName;
      const sub = UI.q(b + 'up/mask/content');
      sub.txt.s = open ? TERM('tips/skill_' + (i + 1)) : pr.kind === 'gems' ? TERM('tips/gem_unlock') : TERM('tips/iap_unlock');
      sub.txt.c = open ? SK_COL.sub : SK_COL.lockSub;
      const icon = UI.q(b + 'up/icon_bg/icon');
      icon.img.c = open ? [1, 1, 1, 1] : SK_COL.lockIcon;
      icon.gray = !open;
      if (open) UI.q(b + 'up/icon_bg/lock').off = 1; else delete UI.q(b + 'up/icon_bg/lock').off;
      UI.q(b + 'line').img.sp = VIEW.grayLine || 'ui_262';
    }
    const d = UI.q(SKP + 'skill_detail'), s = list[cur];
    d.p = [d.p[0], ys[cur]];
    UI.q(SKP + 'skill_detail/name').txt.s = s.name;
    if (isUnlocked(id)) UI.q(SKP + 'skill_detail/icon_bg/lock').off = 1; else delete UI.q(SKP + 'skill_detail/icon_bg/lock').off;
    // [ĐO] GetSkillDetailDescription ghép mô tả với dòng "skill_cd_description" trong thẻ <color=#cececf>.
    const cd = s.cd ? '\n<color=#cececf>' + TERM('skill_cd_description').replace('{0}', String(s.cd).replace('.', ',')) + '</color>' : '';
    const desc = UI.q(SKP + 'skill_detail/scroll_view/viewport/content/description');
    if (desc.txt.s !== s.desc + cd) { desc.txt.s = s.desc + cd; descScroll = 0; }
  }

  // Ô mô tả kỹ năng cuộn được (ScrollRect gốc): con lăn / kéo.
  let descScroll = 0;
  function descLayout() {
    const desc = UI.q(SKP + 'skill_detail/scroll_view/viewport/content/description');
    const view = UI.q(SKP + 'skill_detail/scroll_view'), h = SK.ugui.textSize(desc.txt, desc.sz[0]).h + 4;
    const maxS = Math.max(0, h - view.sz[1]);
    descScroll = Math.max(0, Math.min(maxS, descScroll));
    UI.q(SKP + 'skill_detail/scroll_view/viewport/content').p = [-140, descScroll];
    const size = Math.min(1, view.sz[1] / h), v = maxS > 0 ? 1 - descScroll / maxS : 1, lo = v * (1 - size);
    UI.q(SKP + 'skill_detail/scroll_view/scrollbar/Sliding Area/Handle').a = [0, lo, 1, lo + size];
  }

  function refreshDetail() {
    const b = ATTR, arrow = UI.q(b + 'detail_arrow'), bg = UI.q(b + 'detail_bg'), btn = UI.q(b + 'upgraded_detail_button');
    const panelBg = UI.q('ui_left/panel/bg');
    if (!detail) {
      arrow.off = 1; bg.off = 1; btn.p = [btn.p[0], FOLD_Y]; panelBg.sz = [0, 0];
      return;
    }
    delete arrow.off; delete bg.off; btn.p = [btn.p[0], UNFOLD_Y]; panelBg.sz = [0, UNFOLD_GROW];
    arrow.p = [UI.q(b + detail).p[0], -130];
    const id = P.selected, text = UI.q(b + 'detail_bg/text'), wi = UI.q(b + 'detail_bg/weapon_info');
    if (detail === 'buff') {
      delete text.off; wi.off = 1;
      text.txt.s = tr(id).passive || DS.heroes[id].passive || '—';
      text.txt.f = 'pixel_bold'; text.txt.fs = 22;
    } else {
      text.off = 1; delete wi.off;
      const w = DS.weapons[DS.heroes[id].weapon] || {};
      UI.q(b + 'detail_bg/weapon_info/atk/text').txt.s = String(w.dmg || 0);
      UI.q(b + 'detail_bg/weapon_info/consume/text').txt.s = String(w.cost || 0);
      UI.q(b + 'detail_bg/weapon_info/critic/text').txt.s = String(w.crit || 0);
      UI.q(b + 'detail_bg/weapon_info/accurate/text').txt.s = String(w.spread || 0);
    }
  }

  // ---------------------------------------------------------------- thanh trượt skin (SkinScrollView + skin_cell)
  // Bản gốc: thanh dưới là các skin của nhân vật đang chọn (SkinScrollView; nút "unlock hero first" khi chọn skin của
  // nhân vật chưa mở), hai mũi tên ui_left_button / ui_right_button đổi nhân vật.
  const mod = (a, n) => ((a % n) + n) % n;
  const cells = {};
  function cellOf(id, sk) {
    const key = id + ':' + sk;
    let c = cells[key];
    if (!c) {
      c = cells[key] = SK.ugui.clone(CELL);
      c.n = 'skin:' + sk;
      for (const k of c.k) if (k.n === 'redPoint' || k.n === 'trial' || k.n === 'skin_trial') k.off = 1;
      const img = c.k.find(k => k.n === 'img');
      img.draw = (ctx, R) => fitSprite(ctx, heroFrame0(id, sk), R);
    }
    return c;
  }
  function carouselTick() {
    const SKS = skinList(P.selected), N = SKS.length, t = now();
    if (car.anim) {
      const u = Math.min(1, (t - car.t0) / SNAP_T);
      car.pos = car.from + (car.to - car.from) * easeInOutCubic(u);
      if (u >= 1) car.anim = false;
    }
    const content = UI.q(CAR), clip = CELL.an.skin_item_scroll, mb = CELL.mbd.SkinCell, base = Math.round(car.pos);
    content.k = [];
    for (let o = -3; o <= 3; o++) {
      const idx = base + o, pos = (idx - car.pos) * CELL_IV + CELL_OFF;
      if (pos < -0.001 || pos > 1.001) continue;
      const sk = SKS[mod(idx, N)], c = cellOf(P.selected, sk), sel = sk === (P.skin[P.selected] || 0), open = isUnlocked(P.selected);
      SK.ugui.pose(c, clip, pos);
      const part = n => c.k.find(k => k.n === n);
      part('bg').img.sp = sel ? mb.lightBackground : mb.darkBackground;
      part('img').gray = !open;
      if (open) part('lock').off = 1; else delete part('lock').off;
      // Khung + sao dưới ô = đã phá đảo bằng nhân vật này (PassGameLevel); bản web ghi khi thắng một lượt.
      for (const k of ['frame', 'star']) { if (P.won[P.selected] && sel) delete part(k).off; else part(k).off = 1; }
      content.k.push(c);
    }
  }
  function nearestIdx(i0, N) {
    const base = Math.round(car.pos);
    let best = base, bd = 1e9;
    for (let o = -N; o <= N; o++) { const i = base + o; if (mod(i, N) === i0 && Math.abs(i - car.pos) < bd) { bd = Math.abs(i - car.pos); best = i; } }
    return best;
  }
  function scrollTo(sk, instant) {
    const SKS = skinList(P.selected), target = nearestIdx(Math.max(0, SKS.indexOf(sk)), SKS.length);
    if (instant) { car.pos = car.to = target; car.anim = false; return; }
    Object.assign(car, { from: car.pos, to: target, t0: now(), anim: true });
  }

  function select(id, instant) {
    if (!DS.heroes[id] || !(D.heroes && D.heroes[id])) return false;
    P.selected = id; save();
    demoT = 0; detail = null;
    SK.loadPack(id);
    car.pos = 0;
    scrollTo(P.skin[id] || 0, true);
    refresh();
    return true;
  }
  function selectSkin(sk, instant) {
    if (skinList(P.selected).indexOf(sk) < 0) return false;
    if (sk) P.skin[P.selected] = sk; else delete P.skin[P.selected];
    save(); demoT = 0;
    SK.loadPack(P.selected);
    scrollTo(sk, instant || !UI);
    refresh();
    return true;
  }
  function step(d) {
    const i = HEROES.indexOf(P.selected);
    select(HEROES[(i + d + HEROES.length) % HEROES.length]);
  }

  // ---------------------------------------------------------------- vẽ + bấm
  function canvasSize() {
    const dpr = SK.view.dpr || 1, W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  function drawUI() {
    if (!cv || !ui()) return;
    canvasSize();
    const u = Math.min(1, (now() - slideAt) / SLIDE_T), e = easeOutQuad(u);
    for (const [path, hide] of SLIDE) UI.q(path).p = [hide[0] * (1 - e), hide[1] * (1 - e)];
    carouselTick();
    descLayout();
    cx2.setTransform(1, 0, 0, 1, 0, 0);
    cx2.clearRect(0, 0, cv.width, cv.height);
    if (P.view !== 'pix') drawPortrait();
    UI.draw(cx2, cv.width, cv.height);
    const r = rect('mask_down/btn_ok'), b = $('sk-start').style;
    if (r) { b.left = r.x + 'px'; b.top = r.y + 'px'; b.width = r.w + 'px'; b.height = r.h + 'px'; }
  }
  function drawPortrait() {
    const im = portrait(P.selected);
    if (!im) return;
    const k = cv.height / 720, w = im.naturalWidth * DRAW_SCALE * k, h = im.naturalHeight * DRAW_SCALE * k;
    cx2.imageSmoothingEnabled = false;
    cx2.drawImage(im, Math.round(cv.width / 2 - w / 2), Math.round(DRAW_CY * k - h / 2), Math.round(w), Math.round(h));
  }

  function rectPx(path) { return UI && UI.rectOf(path, cv.width, cv.height); }
  // Rect CSS px của một nút prefab ('skin:<n>' = ô skin n trên thanh trượt, 'skill:<i>' = ô kỹ năng i).
  function rect(path) {
    if (!ui()) return null;
    if (path.startsWith('skin:')) path = CAR + '/' + path + '/bg';
    else if (path.startsWith('skill:')) {
      const i = +path.slice(6);
      path = i === curSlot() ? SKP + 'skill_detail' : SKP + 'skill_' + (i + 1) + '/bg';
    }
    const r = rectPx(path), d = SK.view.dpr || 1;
    return r && { x: r.x / d, y: r.y / d, w: r.w / d, h: r.h / d };
  }
  const busy = () => !$('hs-modal').hidden || !$('hs-modes').hidden;

  function click(x, y) {
    const inR = p => { const r = rect(p); return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
    const tap = () => sfx(VIEW.tapClip);
    if (inR('mask_down/center_buttons/btn_unlock')) { tap(); buyHero(); return; }
    if (inR('mask_up/btn_back')) { tap(); if (SK.QUICK || !SK.hall) openModes(); else SK.hall.enter('select'); return; }
    if (inR(CUR + 'show_currency_widget')) { tap(); openShop(); return; }
    if (inR('mask_down/ui_left_button/button')) { tap(); step(-1); return; }
    if (inR('mask_down/ui_right_button/button')) { tap(); step(1); return; }
    if (inR('mask_down/skill_demo_checkbox')) { tap(); P.demo = P.demo === false; save(); refresh(); return; }
    if (inR(ATTR + 'upgraded_detail_button')) { tap(); openPath(); return; }
    for (const k of ['buff', 'weapon']) {
      if (inR(ATTR + k)) { tap(); detail = detail === k ? null : k; refreshDetail(); return; }
    }
    if (inR(ATTR + 'jewelry')) { tap(); info('Trang sức', '<p>Chưa đeo trang sức.</p><p class="hs-note">Trang sức chưa có ở bản web.</p>'); return; }
    const db = 'ui_choose_hero_drawing_buttons/';
    if (inR(db + 'change_button')) { tap(); P.view = P.view === 'pix' ? 'art' : 'pix'; save(); refresh(); return; }
    if (inR(db + 'save_drawing_button')) { tap(); saveDrawing(); return; }
    if (inR(db + 'customization_button')) { tap(); info('Tuỳ chỉnh', '<p class="hs-note">Tuỳ chỉnh ngoại hình chưa có ở bản web.</p>'); return; }
    for (let i = 0; i < 3; i++) {
      if (i !== curSlot() && inR('skill:' + i)) { clickSkill(i); return; }
    }
    for (const sk of skinList(P.selected)) {
      if (inR('skin:' + sk)) { if (sk !== (P.skin[P.selected] || 0)) { tap(); selectSkin(sk); } return; }
    }
    if (detail && !inR('ui_left/panel')) { detail = null; refreshDetail(); }
  }
  function saveDrawing() {
    const id = P.selected;
    const a = document.createElement('a');
    a.href = ART + 'portrait/' + id + '.png'; a.download = id + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function bindCanvas() {
    let down = null;
    const toCss = e => [e.clientX, e.clientY];
    cv.addEventListener('pointerdown', e => {
      if (G.state !== 'lobby' || busy()) return;
      const [x, y] = toCss(e), inR = p => { const r = rect(p); return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
      down = { x, y, moved: false, car: inR('mask_down/skin_scroll_view'), desc: inR(SKP + 'skill_detail/scroll_view'), pos: car.pos, scroll: descScroll };
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* đã nhả */ }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      if (!down) return;
      const [x, y] = toCss(e), k = (SK.view.dpr || 1) * 720 / cv.height;
      if (Math.hypot(x - down.x, y - down.y) > 8) down.moved = true;
      if (!down.moved) return;
      // [ĐO] Scroller.OnDrag: vị trí = bắt đầu − Δx / bề ngang viewport × scrollSensitivity.
      if (down.car) { car.anim = false; car.pos = down.pos - (x - down.x) * k / VIEWPORT_W * SENS; }
      else if (down.desc) descScroll = down.scroll - (y - down.y) * k;
    });
    const up = e => {
      if (!down) return;
      const d = down; down = null;
      if (!d.moved) { click(d.x, d.y); return; }
      if (d.car) {
        const SKS = skinList(P.selected), idx = Math.round(car.pos), sk = SKS[mod(idx, SKS.length)];
        Object.assign(car, { from: car.pos, to: idx, t0: now(), anim: true });
        if (sk !== (P.skin[P.selected] || 0)) { if (sk) P.skin[P.selected] = sk; else delete P.skin[P.selected]; save(); demoT = 0; refresh(); sfx(VIEW.tapClip); }
      }
      void e;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { down = null; });
    cv.addEventListener('wheel', e => {
      if (G.state !== 'lobby' || busy()) return;
      const x = e.clientX, y = e.clientY, r = rect(SKP + 'skill_detail/scroll_view');
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { descScroll += e.deltaY * 0.5; e.preventDefault(); }
    }, { passive: false });
  }

  function build() {
    if (built) return;
    built = true;
    cv = $('hs-ui'); cx2 = cv.getContext('2d');
    bindCanvas();
    $('hs-mode-close').onclick = () => { $('hs-modes').hidden = true; };
    $('hs-modal').onclick = e => { if (e.target === $('hs-modal')) closeDialog(); };
  }

  function clickSkill(slot) {
    const id = P.selected;
    if (SK.profile.isSkillUnlocked(id, slot) && isUnlocked(id)) { sfx(VIEW.selectSkillClip); P.slot[id] = slot; save(); refresh(); return; }
    sfx(VIEW.tapClip);
    const s = skillList(id)[slot];
    if (!isUnlocked(id)) { info('Kỹ năng ' + (slot + 1), '<p>' + esc(TERM('tips/unlock_character_first')) + ' (' + esc(heroName(id)) + ').</p>'); return; }
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
        fn() { if (SK.profile.spend(nx.cost)) { P.level[id] = lv + 1; save(); sfx(VIEW.upgradeClip); refresh(); openPath(); } } }] : [];
    dialog('<h3>Lộ trình nâng cấp — ' + esc(heroName(id)) + '</h3><ul class="hs-ups">' + rows + '</ul>', btn.concat([{ label: 'Đóng', id: 'hs-close' }]));
  }

  // ---------------------------------------------------------------- chọn chế độ (ảnh i)
  const MODES = [
    { id: 'level', name: 'Chế độ màn chơi', img: 'mode_level.png', ok: true,
      start: () => { if (SK.G.state === 'hall') launch(P.selected); },
      desc: 'Ba tầng, mỗi tầng một vùng đất ngẫu nhiên (Rừng Rậm, Băng Nguyên, Lâu Đài, Núi Lửa...), 5 màn, trùm ở màn cuối. Chơi một mình.' },
    // Khu Thí Luyện [LOC gamemode/bossrush]: 15 ải 1-1..3-5, ải nào cũng là một trận trùm (game.js buildStages). Biểu tượng
    // ui_game_entry_icon_shilian (ui.ab). Vé Lông Vũ Valkyrie và trận Tước Sĩ cuối chưa có (GAPS.md).
    // Nhân Tố Thử Thách [LOC gamemode/challenge]: Chế độ Ải kèm vài nhân tố đổi luật (SK.FACTORS); chưa có biểu tượng riêng nên dùng ảnh Chế độ Ải.
    { id: 'challenge', name: 'Nhân Tố Thử Thách', img: 'mode_level.png', ok: true,
      start: () => { if (SK.G.state === 'hall') launch(P.selected, 'level'); },
      desc: 'Chế độ Ải kèm vài nhân tố thử thách: mỗi nhân tố đổi một luật của lượt chơi. Chọn tối đa ba, không trùng nhau.' },
    { id: 'bossrush', name: 'Khu Thí Luyện', img: 'mode_bossrush.png', icon: true, ok: true,
      start: () => { if (SK.G.state === 'hall') launch(P.selected, 'bossrush'); },
      desc: 'Mười lăm ải liền, ải nào cũng là một Lãnh Chúa của vùng đất ngẫu nhiên; giữa các trận có rương và phòng phụ. Chơi một mình.' },
    // Mê Trận Tà Vương [LOC gamemode/looptravel]: Chế độ Ải không hồi kết (js/matrix.js), Uy Áp tăng mỗi tầng, Tà Vương chấm điểm ở x-5.
    // Như Khu Thí Luyện: không mang vật phẩm ngoài thế giới [LOC guide/mode_loop] nên bỏ vàng Két Sắt và vũ khí mang theo.
    { id: 'matrix', name: 'Mê Trận Tà Vương', img: 'mode_loop.png', ok: true,
      start: () => { if (SK.G.state === 'hall') launch(P.selected, 'matrix', []); },
      desc: 'Cuộc thám hiểm không có hồi kết: qua mỗi tầng Uy Áp tăng, quái thêm máu và đánh đau hơn; cuối mỗi tầng Tà Vương ban thưởng hoặc trừng phạt. Gom Pha Lê Tà Vương.' },
    { id: 'season', name: 'Chế độ mùa giải', img: 'mode_season.png', isNew: true, ok: true,
      desc: 'Thoát khỏi Monkia: căn cứ giữa rừng thông, qua cổng xoáy ra Ngoại ô căn cứ, đánh khỉ, mở thùng, về điểm rút lui mang đồ về.',
      start: () => SK.SEASON && SK.SEASON.start && SK.SEASON.start(SK.profile.selected || 'knight') },
    { id: 'warfront', name: 'Tiền tuyến cổ đại', img: 'mode_warfront.png', desc: 'Sắp ra mắt.' }
  ];
  let modeSel = 'level';
  function openModes() {
    $('hs-mode-list').innerHTML = MODES.map(m => '<button class="hs-mode' + (m.id === modeSel ? ' sel' : '') + (m.icon ? ' icon' : '') + '" data-mode="' + m.id +
      '" style="background-image:url(' + ART + m.img + ')">' + (m.isNew ? '<i class="hs-new">MỚI!</i>' : '') +
      (m.ok ? '' : '<i class="hs-soon">Sắp ra mắt</i>') + '<span>' + m.name + '</span></button>').join('');
    for (const el of document.querySelectorAll('.hs-mode')) el.onclick = () => { modeSel = el.dataset.mode; openModes(); };
    const m = MODES.find(x => x.id === modeSel);
    $('hs-mode-title').textContent = m.name;
    $('hs-mode-name').textContent = m.name;
    $('hs-mode-img').src = ART + m.img;
    $('hs-mode-desc').textContent = m.desc;
    diffUi(m);
    factorUi(m);
    const go = $('hs-mode-go');
    go.disabled = !m.ok;
    go.textContent = m.ok ? 'Bắt đầu' : 'Sắp ra mắt';
    go.onclick = () => { if (m.ok) { $('hs-modes').hidden = true; if (m.start) m.start(); } };
    const f = heroFrame0(P.selected);
    if (f) drawFit($('hs-mode-face'), f, { feet: true });
    $('hs-modes').hidden = false;
  }

  // Hai nút độ khó dưới mô tả Chế độ Ải [LOC difficulty/normal, difficulty/badass]; Lợi Hại khoá thì xám kèm điều kiện.
  function diffUi(m) {
    let el = $('hs-mode-diff');
    if (!el) {
      el = document.createElement('div'); el.id = 'hs-mode-diff'; el.className = 'hs-mode-diff';
      $('hs-mode-desc').after(el);
    }
    el.hidden = m.id !== 'level' && m.id !== 'bossrush';
    if (el.hidden) return;
    const open = badassOpen(), bad = SK.profile.badass;
    // Ảnh thẻ theo độ khó: ui_game_entry_icon_difficulty_1/_2 (ui.ab) cho Chế độ Ải.
    if (m.id === 'level') $('hs-mode-img').src = ART + (bad ? 'diff_2.png' : 'mode_level.png');
    el.innerHTML = '<button data-d="normal" class="' + (bad ? '' : 'sel') + '">Độ khó thường</button>' +
      '<button data-d="badass" class="' + (bad ? 'sel' : '') + '"' + (open ? '' : ' disabled') + '>Độ khó Lợi Hại' +
      (open ? '' : '<small>Vượt Chế độ Ải một lần để mở</small>') + '</button>';
    for (const b of el.querySelectorAll('button')) b.onclick = () => { if (SK.profile.setBadass(b.dataset.d === 'badass')) { sfx(VIEW.tapClip); diffUi(m); } };
  }

  // Danh sách Nhân Tố Thử Thách dưới mô tả thẻ "Nhân Tố Thử Thách": bấm để bật/tắt, tối đa SK.FACTOR_MAX; thay cho ảnh thẻ.
  const TIER_ORDER = { 'dễ': 0, 'vừa': 1, 'khó': 2 };
  function factorUi(m) {
    let el = $('hs-mode-factors');
    if (!el) {
      el = document.createElement('div'); el.id = 'hs-mode-factors'; el.className = 'hs-mode-factors';
      $('hs-mode-desc').after(el);
    }
    const on = m.id === 'challenge';
    el.hidden = !on;
    document.querySelector('.hs-mode-pic').style.display = on ? 'none' : '';
    if (!on) return;
    const sel = SK.profile.factors, max = SK.FACTOR_MAX || 3;
    const keys = Object.keys(SK.FACTORS || {}).sort((a, b) => TIER_ORDER[SK.FACTORS[a].tier] - TIER_ORDER[SK.FACTORS[b].tier]);
    el.innerHTML = '<div class="hs-fcount">Đã chọn <b>' + sel.length + '/' + max + '</b></div><div class="hs-flist">' + keys.map(k => {
      const f = SK.FACTORS[k];
      return '<button data-f="' + k + '" class="t' + TIER_ORDER[f.tier] + (sel.indexOf(k) >= 0 ? ' sel' : '') + '"><b>' + esc(f.vi) + '</b><small>' + esc(f.desc) + '</small></button>';
    }).join('') + '</div>';
    for (const b of el.querySelectorAll('button')) b.onclick = () => {
      const ok = SK.profile.toggleFactor(b.dataset.f), top = el.querySelector('.hs-flist').scrollTop;
      if (ok) sfx(VIEW.tapClip);
      factorUi(m);
      el.querySelector('.hs-flist').scrollTop = top;
      if (!ok) el.querySelector('.hs-fcount').innerHTML = 'Tối đa <b>' + max + '</b> nhân tố — bỏ bớt một nhân tố trước';
    };
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
  function buyHero() {
    const id = P.selected;
    buy({ title: 'Mở khoá ' + heroName(id), price: heroPrice(id), done() { SK.profile.unlock(id); refresh(); } });
  }
  // Bấm chuột vào #sk-start thì sfx.js đã phát fx_btn_start; phím Enter thì tự phát startClip của ChooseHeroView.
  function onStart(e) {
    if (!$('hs-modes').hidden) return;
    const id = P.selected, key = !e;
    if (!isUnlocked(id)) { if (key) sfx(VIEW.tapClip); buyHero(); return; }
    if (key) sfx(VIEW.startClip);
    closeDialog();
    // Bản gốc: chọn xong thì điều khiển nhân vật trong sảnh, đi vào cửa mới ra bảng chế độ. ?quick=1 vào hầm luôn.
    if (SK.QUICK || !SK.hall) launch(id); else SK.hall.enter('walk', id);
  }
  // factors: mảng khoá Nhân Tố Thử Thách. Bỏ trống: lấy nhân tố đã chọn khi thẻ đang chọn là "Nhân Tố Thử Thách" (Chế độ Ải thường
  // và Khu Thí Luyện không có nhân tố).
  function launch(id, mode, factors) {
    if (factors === undefined) factors = modeSel === 'challenge' && mode !== 'bossrush' ? SK.profile.factors : [];
    applySkillSlot(id); SK.G.badass = SK.profile.badass; SK.startRun(id, mode, factors);
  }

  SK.on('runStart', G2 => {
    const p = G2.player; if (!p) return;
    const b = upgradeBonus(p.hero);
    p.hpMax += b.hp; p.hp += b.hp; p.armorMax += b.armor; p.armor += b.armor; p.energyMax += b.energy; p.energy += b.energy;
    // Két Sắt: vàng khởi đầu mỗi ván [LOC Object_safe_info "Vàng ban đầu"]; Khu Thí Luyện không có vàng nên bỏ.
    const noOutside = G2.mode === 'bossrush' || G2.mode === 'matrix';   // chế độ không mang đồ ngoài thế giới
    if (!noOutside) p.gold += SK.profile.safe.gold;
    // Rương: vũ khí đã chọn (hòm hoặc đồ rèn) vào ô thứ hai; chế độ một vũ khí / Khu Thí Luyện không nhận, giữ lại cho ván sau.
    const c = SK.profile.carry;
    if (c && !noOutside && !(G2.mods && G2.mods.oneWeapon) && !p.weapons[1]) { SK.profile.takeCarry(); p.weapons[1] = SK.makeWeapon(c.id); G2.carried = c.id; }
  });

  // Đá quý cuối lượt: theo số quái hạ + số màn đã qua [ƯỚC LƯỢNG]; SK gốc cũng trả theo quái hạ + tầng đạt được.
  let pending = null;
  SK.on('runEnd', (G2, r) => {
    const cleared = r.won ? SK.STAGES.length : G2.stageIdx;
    const bad = !!G2.badass, firstBad = bad && r.won && !Object.keys(P.wonBadass).length;
    const runGems = Math.round((r.kills + cleared * 10 + (r.won ? 100 : 0)) * (bad ? DS.badass.gemMul : 1)) + (firstBad ? DS.badass.firstWinGems : 0);
    // Vàng còn lại đổi thành đá [LOC I_tip_10] (GOLD_GEM: ước lượng), cộng thống kê hồ sơ.
    const goldGems = Math.floor(Math.max(0, r.gold | 0) * GOLD_GEM), base = runGems + goldGems;
    // Thợ Mỏ Đá Quý: rooms.js (bộ runEnd chạy trước) gắn r.gemMul = 1,25 [WIKI Gem Generosity].
    const gemExtra = Math.floor(base * ((r.gemMul || 1) - 1)), gems = base + gemExtra;
    if (gemExtra > 0) r.gemExtra = gemExtra;
    const hero = G2.player ? G2.player.hero : P.selected;
    P.gems += gems;
    SK.profile.petRunEnd(SK.profile.pet());
    P.stats.kills += Math.max(0, r.kills | 0);
    if (r.won) P.stats.pass++; else P.stats.dead++;
    if (G2.mode !== 'bossrush') P.stats.best = Math.max(P.stats.best, cleared);
    if (r.won) P.won[hero] = 1;
    if (r.won && bad) P.wonBadass[hero] = 1;
    save();
    pending = { hero, stage: r.stage, kills: r.kills, gold: r.gold, won: r.won, cleared, gems, goldGems, gemExtra, bad, firstBad, factors: (G2.factors || []).slice() };
  });
  function showSummary() {
    const s = pending; pending = null;
    dialog('<h3>' + (s.won ? 'Chiến thắng!' : 'Kết quả lượt chơi') + '</h3>' +
      '<p>' + esc(heroName(s.hero)) + (s.bad ? ' · Lợi Hại' : '') + ' · tới màn ' + esc(s.stage) + ' · qua ' + s.cleared + ' màn</p>' +
      (s.firstBad ? '<p>Lần đầu vượt Lợi Hại: +' + fmt(DS.badass.firstWinGems) + ' đá quý</p>' : '') +
      (s.factors && s.factors.length ? '<p>Nhân Tố Thử Thách: ' + s.factors.map(k => esc(SK.FACTORS && SK.FACTORS[k] ? SK.FACTORS[k].vi : k)).join(', ') + '</p>' : '') +
      '<p>Hạ ' + s.kills + ' quái · ' + s.gold + ' vàng</p>' +
      (s.goldGems ? '<p>Vàng còn lại quy đổi: +' + fmt(s.goldGems) + ' đá (1 vàng = 1 đá, tỉ lệ ước lượng)</p>' : '') +
      (s.gemExtra ? '<p>Thợ Mỏ Đá Quý: +' + fmt(s.gemExtra) + ' đá</p>' : '') +
      '<p class="hs-price">+' + fmt(s.gems) + ' ' + gemImg + '</p>' +
      '<p class="hs-note">Đá quý = số quái hạ + 10 mỗi màn qua (+100 khi thắng) + vàng còn lại — công thức ước lượng.</p>',
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
    const hand = SK.heroHand(id, P.skin[id]);
    if (w && SK.drawGun) SK.drawGun(ctx, w.sprite, x + hand[0] * face, y - hand[1], face > 0 ? 0 : Math.PI, null, {});
  }

  SK.lobby = {
    enter() {
      G.state = 'lobby'; G.player = null; G.map = null; G.badass = false; G.mods = null; G.factors = [];
      SK.setOverlay('sk-lobby');
      $('sk-lobby').classList.remove('only-modes');
      build();
      $('hs-modes').hidden = true;
      closeDialog();
      $('sk-start').onclick = onStart;
      detail = null;
      slideAt = now();
      SK.loadPack(P.selected);
      car.pos = 0;
      scrollTo(P.skin[P.selected] || 0, true);
      refresh();
      if (pending) showSummary();
    },
    update(dt) {
      t += dt; demoT += dt;
      const I = SK.input;
      const ae = document.activeElement, onBtn = ae && ae.tagName === 'BUTTON' && ae.id !== 'sk-start';
      if (I.hit('confirm') && !busy() && !onBtn) onStart();
      if (!busy()) { if (I.hit('left')) step(-1); if (I.hit('right')) step(1); }
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
      drawUI();
    },
    select, selectSkin, openModes, openShop, refresh, launch,
    // Dùng chung cho sảnh đi (js/hall.js, js/hall_use.js): hộp thoại DOM của lobby, thanh toán giả, định dạng.
    dialog, closeDialog, toast: toastDlg, fakePay, fmt, esc, gemImg,
    get dialogOpen() { return !$('hs-modal').hidden; },
    // Móc kiểm thử: rect CSS px của nút prefab, chữ đang hiện trên nút, và trạng thái màn.
    rect,
    text: path => { const n = ui() && UI.q(path); return n && n.txt ? String(n.txt.s) : null; },
    state: () => ({ ready: !!ui(), selected: P.selected, name: UI && UI.q('mask_up/layout/text_name').txt.s,
      startGray: !!(UI && UI.q('mask_down/btn_ok').gray), unlockShown: !!(UI && !UI.q('mask_down/center_buttons/btn_unlock').off),
      view: P.view, demo: P.demo !== false, detail, slot: curSlot(), carousel: car.pos,
      cells: UI ? UI.q(CAR).k.map(c => +c.n.slice(5)) : [], heroes: HEROES.slice(), skills: skillList(P.selected).length,
      skin: P.skin[P.selected] || 0, skins: skinList(P.selected) })
  };
})();
