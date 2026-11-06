/*
 * Đọc sách theo thời gian của DREDGE (ResearchCoroutine.cs, ResearchableItemInstance.cs, PlayerStats.CalculateResearchedBenefits).
 *  - ResearchCoroutine (prefab ResearchCoroutine.prefab: secondsBetweenChecks = 1): mỗi giây thật so TimeAndDay với lần trước;
 *    chỉ tính khi CẢ HAI đầu khoảng không có thời gian cưỡng bức (TimePassageMode.NONE, ResearchCoroutine.cs:27-34). Tức là đi thuyền,
 *    câu cá (thời gian chạy bình thường) đều tính; ngủ ở bến / lắp đồ / PassTime của hội thoại (SLEEP, INSTALL, OTHER) KHÔNG tính.
 *    Brief ghi "sleeping" nhưng mã gốc loại nó; theo mã gốc.
 *  - AdjustResearchProgress (ResearchCoroutine.cs:41-62): chỉ cuốn đang đọc (isActive); progress += dNgày / daysToResearch, kẹp 0..1;
 *    xong (qua 1 từ dưới 1): isActive = false, phát OnBookReadCompleted -> BannersUI.ShowBook (js/banner.js kind 'book').
 *    Cuốn kế trên kệ vẫn "ON SHELF" tới khi người chơi chọn (cargo.js đặt isActive; ItemManager.SetActiveResearchableItem).
 *  - Lợi ích (PlayerStats.cs:310-350): gộp theo GameConfigData.ResearchBenefitCalculationStrategies (DR_CONFIG, hiện toàn CUMULATIVE)
 *    trên các cuốn đã xong (progress >= 1). BARTER: 1 + giá trị, kẹp 1..1,99.
 * Dữ liệu cuốn: DR_ITEMS[id] cls ResearchableItemData (daysToResearch, researchBenefitType, researchBenefitValue).
 * Sổ: DR.s.ownedNonSpatial[] = { id, isNew, isActive, progress } (cùng trường cargo.js đọc để vẽ kệ sách).
 * Sách tới tay qua hội thoại AddItemById (js/yarn.js), không có cửa hàng bán sách trong bản gốc (Shipwright_GiveBook, quest thưởng).
 *   DRBooks.benefits() -> { MOVEMENT_SPEED: 0.05, ... }   DRBooks.mod(type)   DRBooks.barter()   DRBooks.active()   DRBooks.select(id)
 *   DRBooks.tick(dtDay)  DRBooks._debug()
 * Sự kiện phát: DR.emit('bookProgress', entry), DR.emit('bookCompleted', entry)  (GameEvents.OnBookReadProgressed / OnBookReadCompleted).
 */
(function (root) {
  'use strict';
  const D = root.DR;
  if (!D) { console.error('[books] DR state not loaded; books disabled'); return; }
  const CHECK_MS = 1000;                                     // ResearchCoroutine.prefab: secondsBetweenChecks
  const ITEMS = () => root.DR_ITEMS || {};
  const TYPES = ['FISHING_SUSTAIN', 'BARTER', 'FISHING_SPEED', 'MOVEMENT_SPEED', 'SANITY_RESILIENCE', 'EQUIPMENT_MAINTENANCE', 'ABERRATION_CATCH_BONUS'];
  const isBook = d => !!d && d.cls === 'ResearchableItemData';
  const S = () => D.s;

  // ItemManager.CreateItem: ResearchableItemInstance sinh ra progress 0, isActive false; AddNonSpatialItemInstance không nhận trùng id
  function normalize() {
    const s = S(); if (!s || !Array.isArray(s.ownedNonSpatial)) return;
    const seen = new Set();
    s.ownedNonSpatial = s.ownedNonSpatial.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    for (const e of s.ownedNonSpatial) {
      if (!isBook(ITEMS()[e.id])) continue;
      if (typeof e.progress !== 'number') e.progress = 0;
      if (typeof e.isActive !== 'boolean') e.isActive = false;
    }
  }
  const owned = () => { const s = S(); return s && Array.isArray(s.ownedNonSpatial) ? s.ownedNonSpatial.filter(e => isBook(ITEMS()[e.id])) : []; };
  const active = () => owned().find(e => e.isActive) || null;
  const strategy = t => ((root.DR_CONFIG || {}).ResearchBenefitCalculationStrategies || {})[t] || 'CUMULATIVE';

  // PlayerStats.GetResearchedBenefitValueForList: CUMULATIVE cộng, HIGHEST lấy lớn nhất, LOWEST lấy nhỏ nhất (khởi đầu 0; LOWEST bắt đầu từ 1)
  function benefits() {
    const done = owned().filter(e => e.progress >= 1).map(e => ITEMS()[e.id]);
    const out = {};
    for (const t of TYPES) {
      const strat = strategy(t); let v = strat === 'LOWEST' ? 1 : 0;
      for (const d of done) {
        if (d.researchBenefitType !== t) continue;
        const x = +d.researchBenefitValue || 0;
        if (strat === 'CUMULATIVE') v += x; else if (strat === 'HIGHEST') { if (x > v) v = x; } else if (x < v) v = x;
      }
      out[t] = v;
    }
    return out;
  }
  const mod = t => benefits()[t] || 0;
  const barter = () => Math.min(1.99, Math.max(1, 1 + mod('BARTER')));   // ResearchedBarteringModifier

  function restat() { if (root.DRBoat && DRBoat.refresh && S()) { try { DRBoat.refresh(); } catch (e) { /* thuyền chưa dựng */ } } }

  // ResearchCoroutine.AdjustResearchProgress
  function tick(dayDelta) {
    if (!(dayDelta > 0)) return null;
    const e = active(); if (!e) return null;
    const d = ITEMS()[e.id];
    const was = e.progress >= 1;
    e.progress = Math.min(1, Math.max(0, e.progress + dayDelta / (+d.daysToResearch || 1)));
    const now = e.progress >= 1;
    D.emit('bookProgress', e);
    if (!was && now) {
      e.isActive = false;
      D.emit('bookCompleted', e);
      restat();
      if (root.DRBanner && DRBanner.add) DRBanner.add({ kind: 'book', id: e.id, item: d, sfx: 'Book - Complete' });   // BannersUI.OnBookReadCompleted
      if (D.save) D.save();
    }
    return e;
  }

  // ItemManager.SetActiveResearchableItem
  function select(id) {
    const own = owned(), tgt = own.find(e => e.id === id);
    if (!tgt || tgt.progress >= 1) return false;
    for (const e of own) e.isActive = e === tgt;
    return true;
  }

  // vòng ResearchLoop: ảnh chụp đầu khoảng, so với cuối khoảng
  let snap = null;
  function check() {
    const s = S();
    if (!s || D.mode === 'title' || D.mode === 'over') { snap = null; return; }
    const forced = !!(root.DRSky && DRSky.forced);
    const cur = { s, t: s.time, forced };
    if (snap && snap.s === s && !snap.forced && !cur.forced) tick(cur.t - snap.t);
    snap = cur;
  }
  setInterval(check, CHECK_MS);
  D.on('load', () => { snap = null; normalize(); });
  D.on('nonSpatial', () => normalize());
  D.on('mode', () => normalize());

  root.DRBooks = {
    benefits, mod, barter, active, select, tick, normalize, owned,
    _debug: () => ({ active: (active() || {}).id || null, books: owned().map(e => ({ id: e.id, progress: e.progress, isActive: e.isActive })), benefits: benefits(), barter: barter() })
  };
})(window);
