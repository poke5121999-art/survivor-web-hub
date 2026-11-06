/*
 * Thành tựu (WORLD-GAPS.md Phase C): danh sách cúp cục bộ, không có nền tảng.
 *
 * Nguồn: AchievementManager.cs (đăng ký sự kiện :69-103, EvaluateAchievement :296-328, các OnXxx :188-293),
 *        AchievementData.cs (Evaluate = mọi điều kiện đúng; không có điều kiện = chỉ kích hoạt tay),
 *        AchievementCondition + IntCondition / DecimalCondition / BoolCondition / QuestCompleteCondition / UpgradeOwnedCondition /
 *        ResearchCompleteCondition / NodeVisitedCondition / EngineSpeedCondition / FishingSpeedCondition / LightStrengthCondition /
 *        AchievementEarnedCondition, DefaultAchievementStrategy (bản gốc Steam: trạng thái nằm ở Steam; web: DR.s.achievements).
 *   Dữ liệu (tên, mô tả, điều kiện, biểu tượng) sinh bởi tools/achievements.py -> data/achievements.js (window.DR_ACHIEVEMENTS).
 *   39 thành tựu gốc + From the Depths = 40; 20 thành tựu DLC (DLC_3_*, DLC_4_*) chưa làm (DLC để sau cùng): bỏ, liệt kê ở dlcSkipped.
 *
 * Sổ lưu: DR.s.achievements = { <ID>: { day } } (day = ngày game lúc đạt); nằm trong sổ nên theo save/load ô lưu.
 *   Đạt rồi không đạt lại (EvaluateAchievement chỉ chạy khi chưa đạt) -> không có thông báo đôi.
 *
 * Đánh giá theo sự kiện như AchievementManager (DR.on):
 *   'upgrade' -> HULL_*                       'researchCompleted' -> RESEARCH_*
 *   'cargo' (= OnItemInventoryChanged + OnPlayerStatsChanged) -> FULL_CARGO, FULL_EQUIPMENT, STAT_*, DISCARD_FISH, CATCH_* (tồn kho đổi)
 *   'quest' completed / 'questState' -> chương, INTRODUCTIONS, COMPLETE_ALL_SIDE_QUESTS
 *   'mode' dock -> DISCOVER_ALL_DOCKS          'itemSold' -> SELL_*            'nodeVisited' -> SOLVE_ALL_SHRINES
 *   'catch' / 'trawlCatch' / 'potCollected' -> CATCH_* (+ CATCH_ALL_REGULAR_FISH / CATCH_ALL_ABERRATIONS)
 *   'spotDepleted' (js/spots.js, seam thêm) -> fish-depleted-count++ rồi DEPLETE_FISH_SPOTS
 *   'threatBanished' (countForAchievement = payload.active !== false) -> threats-banished++ rồi ABILITY_BANISH
 *   Khi nạp sổ / ván mới: đánh giá lại hết (AchievementManager.Subscribe :103-105).
 * Kích hoạt tay (không có điều kiện trong asset):
 *   ENDING / ENDING_ALT  lệnh Yarn "SetAchievementState <ID> <bool>" (Finale_*: data/yarn.js), ghi đè stub trong js/yarn.js
 *   ABILITY_MANIFEST     TeleportAbility.cs:39  đích cách vị trí cũ > achievementDistance (350)   <- DR.on('manifest')
 *   ABILITY_ATROPHY      AtrophyAbility.cs:87   thuyền cách điểm câu >= achievementDistance (40)   <- DR.on('atrophy')
 *   ABILITY_BAIT         BaitAbility.cs:144     bầy mồi có >= 3 loài và >= 3 con                  <- DR.on('baitDeployed')
 *   ABILITY_HASTE        BoostAbility.cs:207    nhiệt >= achievementBurnThreshold (0,5) liên tục achievementBurnDuration (10 s)
 *   ABILITY_FOGHORN      GhostFoghorn.EndReplaying (:140): hết đợt còi ma phát lại             <- DRScares.debug.foghorn().replaying
 *   ABILITY_SPYGLASS     SpyglassUI.cs:301: ghi spied-<loại> rồi đánh giá BoolCondition          <- ống nhòm đang ngắm một điểm câu
 *   CATCH_ALL_*          AchievementManager.OnFishCaught :215-225 (không có điều kiện trong asset)
 *   FULL_CARGO / FULL_EQUIPMENT  OnItemInventoryChanged :163-166 / OnPlayerStatsChanged :147-160
 *
 * API: DRAch.list() / get(id) / earned(id) / count() / set(id, bool) / evaluate(id) / evaluateAll()
 *      DRAch.open() / close() / isOpen / toasts (hàng đợi thông báo) / progress(id) / debug
 * Giao diện (css/achievements.css): thông báo nhỏ góc trên phải như cửa sổ nền tảng; danh sách mở từ nút "Thành tựu"
 *   ở màn chính và màn tạm dừng (tự chèn, không sửa js/menus.js). Tên + mô tả giữ nguyên tiếng Anh của Steam, nhãn là tiếng Việt.
 */
(function (root) {
  'use strict';
  const D = root.DR, DATA = root.DR_ACHIEVEMENTS;
  if (!D || !DATA) { console.error('[achievements] DR or DR_ACHIEVEMENTS missing'); return; }
  const doc = document, S = () => D.s, ITEMS = root.DR_ITEMS || {}, CFG = root.DR_CONFIG || {};
  const AB = ((root.DR_BOAT || {}).physics || {}).abilities || {};
  const ORDER = DATA.order, LIST = DATA.list;
  const guard = (fn, tag) => { try { return fn(); } catch (e) { console.error('[achievements] ' + tag + ':', e); return undefined; } };

  // ------------------------------------------------------------------ sổ
  function book() {
    const s = S();
    if (!s) return null;
    if (!s.achievements) s.achievements = {};
    if (!s.vars) s.vars = {};
    return s.achievements;
  }
  const has = id => { const b = book(); return !!(b && b[id]); };
  const count = () => ORDER.filter(has).length;

  // ------------------------------------------------------------------ điều kiện
  const vars = () => (S() && S().vars) || {};
  function cmp(v, target, mode) {   // NumericalEvaluationMode: GTE, GT, LTE, LT, EQUAL (Int/DecimalCondition.Evaluate)
    switch (mode | 0) { case 1: return v > target; case 2: return v <= target; case 3: return v < target; case 4: return v === target; default: return v >= target; }
  }
  const stats = () => {   // PlayerStats: số mới tính từ khoang hiện tại (không phụ thuộc thứ tự nghe 'cargo')
    const inv = S() && D.grid('INVENTORY');
    return inv && root.DRRules ? root.DRRules.stats(CFG, inv, ITEMS) : null;
  };
  const COND = {
    int: c => cmp(vars()[c.key] || 0, c.target, c.mode),
    decimal: c => cmp(vars()[c.key] || 0, c.target, c.mode),
    bool: c => c.keys.every(k => !!vars()[k] === c.state),                                            // SaveData.GetBoolVariable
    quests: c => !!root.DRQuests && c.ids.every(q => root.DRQuests.isCompleted(q)),                   // QuestManager.IsQuestCompleted
    upgrades: c => !!root.DRUpgrade && c.ids.every(u => root.DRUpgrade.owned(u)),                     // SaveData.GetIsUpgradeOwned
    research: c => c.ids.every(i => (S().itemIdsResearched || []).includes(i)),                       // SaveData.GetIsItemResearched
    nodes: c => !!root.DRYarn && c.names.every(n => root.DRYarn.visited(n)),                          // DialogueRunner.GetHasVisitedNode
    engineSpeed: c => { const t = stats(); return !!t && t.moveMod >= c.target; },                    // PlayerStats.MovementSpeedModifier
    fishingSpeed: c => { const t = stats(); return !!t && t.fishingDisplay >= c.target; },            // PlayerStats.FishingSpeedModifier
    lightStrength: c => { const t = stats(); return !!t && t.lumens >= c.target; },                   // PlayerStats.LightLumens
    achievements: c => c.ids.every(has)                                                               // AchievementEarnedCondition
  };
  function holds(a) {   // AchievementData.Evaluate: có điều kiện và mọi điều kiện đúng
    if (!a.cond) return false;
    const f = COND[a.cond.t];
    return !!f && !!guard(() => f(a.cond), 'condition ' + a.id);
  }

  // ------------------------------------------------------------------ cấp / thu hồi
  const queue = [];   // thông báo đang chờ { id, at }
  function set(id, state) {   // AchievementManager.SetAchievementState (:329-340)
    const a = LIST[id], b = book();
    if (!a || !b) return false;
    if (has(id) === !!state) return false;
    if (state) {
      b[id] = { day: Math.floor(S().time || 0) };
      queue.push({ id });
      pump();
      evaluate('ALL_ACHIEVEMENTS');
      if (D.emit) D.emit('achievement', id);
    } else delete b[id];
    return true;
  }
  function evaluate(id) {   // EvaluateAchievement: chỉ khi chưa đạt
    const a = LIST[id];
    if (!a || has(id) || !book()) return false;
    return holds(a) ? set(id, true) : false;
  }
  const evalIds = ids => { for (const id of ids) evaluate(id); };
  const evaluateAll = () => { for (let k = 0; k < 2; k++) evalIds(ORDER); };   // lượt hai: ALL_ACHIEVEMENTS sau cùng

  // ------------------------------------------------------------------ cá: CATCH_ALL_* (OnFishCaught :215-225)
  let fishSets = null;
  function fish() {
    if (fishSets) return fishSets;
    const f = Object.values(ITEMS).filter(d => d.cls === 'FishItemData' && (d.entitlementsRequired || []).includes('NONE'));
    fishSets = { regular: f.filter(d => !d.isAberration).map(d => d.id), aberrant: f.filter(d => d.isAberration).map(d => d.id) };
    return fishSets;
  }
  function onFishCaught() {
    evalIds(['CATCH_FISH_ROD_1', 'CATCH_FISH_NET_1', 'CATCH_CRABS_POT_1']);
    const c = S().caught || {}, f = fish();
    if (!has('CATCH_ALL_REGULAR_FISH') && f.regular.every(i => c[i] > 0)) set('CATCH_ALL_REGULAR_FISH', true);
    if (!has('CATCH_ALL_ABERRATIONS') && f.aberrant.every(i => c[i] > 0)) set('CATCH_ALL_ABERRATIONS', true);
  }

  // ------------------------------------------------------------------ khoang: FULL_CARGO / FULL_EQUIPMENT
  function gridInfo() {
    const G = root.DRGrid, inv = S() && D.grid('INVENTORY');
    if (!G || !inv) return null;
    const nonHidden = inv.cells.filter(c => !c.hidden).length;
    const cellOf = it => inv.cells[it.y * inv.cols + it.x];
    const size = d => (d.dims ? d.dims.length : (d.w | 0) * (d.h | 0));
    // SerializableGrid.GetFilledCells(sub): ô gốc của món không ẩn; GetFilledCells(ALL, DREDGE): mọi món trừ loại DREDGE
    const filled = pred => inv.items.reduce((n, it) => { const d = ITEMS[it.id]; return d && pred(G.subOf(d), cellOf(it)) ? n + size(d) : n; }, 0);
    return { G, inv, nonHidden, filled };
  }
  function onInventory() {
    const gi = gridInfo();
    if (!gi) return;
    const { G, inv, nonHidden, filled } = gi;
    if (!has('FULL_CARGO') && nonHidden > 0 && filled(sub => !(sub & G.SUB.DREDGE)) / nonHidden >= 1) set('FULL_CARGO', true);
    if (!has('FULL_EQUIPMENT')) {
      const eq = filled((sub, cell) => !!cell && !cell.hidden && (sub & (G.SUB.ENGINE | G.SUB.ROD | G.SUB.NET | G.SUB.LIGHT)) !== 0);
      const accepting = inv.cells.filter(c => !c.hidden && (c.type & G.TYPE.EQUIPMENT) === G.TYPE.EQUIPMENT).length;   // GetCountCellsAcceptingType(EQUIPMENT)
      if (eq >= accepting) set('FULL_EQUIPMENT', true);
    }
  }

  // ------------------------------------------------------------------ sự kiện
  const STAT = ['STAT_ENGINE_SPEED', 'STAT_FISHING_SPEED', 'STAT_LIGHT_STRENGTH'];
  function wire() {
    D.on('upgrade', () => evalIds(['HULL_2', 'HULL_3', 'HULL_4']));
    D.on('researchCompleted', () => evalIds(['RESEARCH_ENGINES', 'RESEARCH_RODS', 'RESEARCH_NETS', 'RESEARCH_POTS']));
    D.on('cargo', () => { if (!S()) return; evalIds(STAT); onInventory(); evaluate('DISCARD_FISH'); onFishCaught(); });
    D.on('bookCompleted', () => evalIds(STAT));                                // sách đọc xong đổi PlayerStats (nghiên cứu cộng thêm)
    D.on('quest', ev => { if (ev && ev.kind === 'completed') questDone(); });
    D.on('questState', () => questDone());
    D.on('mode', m => { if (m === 'dock' && S()) evaluate('DISCOVER_ALL_DOCKS'); if (m === 'title') { queue.length = 0; hideToast(); } });
    D.on('itemSold', () => evalIds(['SELL_FISH_VALUE_1', 'SELL_TRINKETS_VALUE_1']));
    D.on('itemDestroyed', () => evaluate('DISCARD_FISH'));
    D.on('nodeVisited', () => evaluate('SOLVE_ALL_SHRINES'));
    D.on('catch', () => { if (S()) onFishCaught(); });
    D.on('trawlCatch', () => { if (S()) onFishCaught(); });
    D.on('potCollected', () => { if (S()) onFishCaught(); });
    D.on('spotDepleted', () => { if (S()) bump('fish-depleted-count'); evaluate('DEPLETE_FISH_SPOTS'); });   // SaveData.DepletedSpotCount++
    D.on('threatBanished', p => {                                              // OnThreatBanished(countForAchievement)
      if (!S() || (p && p.active === false)) return;
      bump('threats-banished');
      evaluate('ABILITY_BANISH');
    });
    D.on('load', () => { fishSets = null; queue.length = 0; book(); guard(evaluateAll, 'load'); });
    D.on('newgame', () => { queue.length = 0; book(); });
    // phép: điều kiện kích hoạt tay của từng năng lực
    D.on('manifest', e => { if (e && e.from && e.to && Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z) > ((AB.TeleportAbility || {}).achievementDistance || 350)) set('ABILITY_MANIFEST', true); });
    D.on('atrophy', e => {
      if (!S()) return;
      bump('fish-depleted-count');                                             // POIDataModel.AtrophyStock: DepletedSpotCount++ + TriggerFishingSpotDepleted
      evaluate('DEPLETE_FISH_SPOTS');
      const sp = root.DRSpots && root.DRSpots.list.find(s => s.id === e.spot), b = S().boat;
      if (sp && Math.hypot(sp.x - b.x, sp.z - b.z) >= ((AB.AtrophyAbility || {}).achievementDistance || 40)) set('ABILITY_ATROPHY', true);
    });
    D.on('baitDeployed', e => { if (e && e.fish && e.fish.length >= 3 && new Set(e.fish).size >= 3) set('ABILITY_BAIT', true); });
  }
  const bump = k => { const v = vars(); v[k] = (v[k] || 0) + 1; };
  function questDone() {
    if (!S()) return;
    evalIds(['INTRODUCTIONS', 'COMPLETE_ALL_SIDE_QUESTS', 'COMPLETE_CHAPTER_1', 'COMPLETE_CHAPTER_2', 'COMPLETE_CHAPTER_3', 'COMPLETE_CHAPTER_4', 'COMPLETE_CHAPTER_5']);
  }

  // lệnh Yarn: AchievementManager.SetAchievementState(string id, bool state): Enum.TryParse; id lạ bị bỏ (bản gốc rơi về giá trị đầu enum, coi là lỗi)
  if (root.DRYarn && root.DRYarn.command) {
    root.DRYarn.command('SetAchievementState', a => {
      const id = String(a[0] || ''), on = /^true$/i.test(String(a[1]));
      if (LIST[id]) set(id, on); else console.warn('[achievements] SetAchievementState: unknown id', id);
    });
  }

  // ------------------------------------------------------------------ vòng thăm dò: điều kiện gắn với thời gian / trạng thái năng lực
  const POLL = { haste: 0, last: 0, foghornReplaying: false, spied: null };
  const HS = AB.BoostAbility || {};
  function poll() {
    const now = performance.now(), dt = Math.min(0.5, (now - (POLL.last || now)) / 1000) * (D.timeScale == null ? 1 : D.timeScale);
    POLL.last = now;
    if (!S() || D.mode === 'title') return;
    // BoostAbility.cs:204-220: currentBurnProp >= ngưỡng liên tục đủ achievementBurnDuration
    if (!has('ABILITY_HASTE') && root.DRAbilities && root.DRAbilities.hasteHeat) {
      if (root.DRAbilities.hasteHeat() >= (HS.achievementBurnThreshold == null ? 0.5 : HS.achievementBurnThreshold)) {
        POLL.haste += dt;
        if (POLL.haste >= (HS.achievementBurnDuration || 10)) set('ABILITY_HASTE', true);
      } else POLL.haste = 0;
    }
    // GhostFoghorn.EndReplaying: replaying true -> false
    const gf = root.DRScares && root.DRScares.debug && root.DRScares.debug.foghorn ? root.DRScares.debug.foghorn() : null;
    if (gf) { if (POLL.foghornReplaying && !gf.replaying) set('ABILITY_FOGHORN', true); POLL.foghornReplaying = !!gf.replaying; }
    // SpyglassUI.cs:296-301: đang ngắm một điểm câu -> spied-<loại món đầu> rồi đánh giá ABILITY_SPYGLASS
    if (!has('ABILITY_SPYGLASS') && root.DRAbilities && root.DRAbilities.spyglassActive) spied();
  }
  function spied() {
    const info = root.DRAbilities.debug && root.DRAbilities.debug(), fid = info && info.spyglass && info.spyglass.focus;
    const sp = fid && root.DRSpots && root.DRSpots.list.find(s => s.id === fid);
    if (!sp || !root.DRRules) return;
    const day = root.DRSky && root.DRSky.env ? root.DRSky.env.isDay : true;
    const l = root.DRRules.spotList(sp.d, day), id = (l && l.length ? l : (sp.d.items || sp.d.nightItems || []))[0], it = ITEMS[id];
    if (!it || !it.harvestableType || it.harvestableType === 'NONE') return;
    vars()['spied-' + String(it.harvestableType).toLowerCase()] = true;     // SaveData.SetHasSpiedHarvestCategory
    evaluate('ABILITY_SPYGLASS');
  }

  // ------------------------------------------------------------------ tiến độ (cho danh sách)
  function progress(id, s) {   // { v, of } cho điều kiện đếm được; null nếu không có số. s = sổ nguồn (mặc định ván đang chơi)
    s = s || S() || {};
    const a = LIST[id], c = a && a.cond, v = s.vars || {};
    if (!c) {
      if (id === 'CATCH_ALL_REGULAR_FISH' || id === 'CATCH_ALL_ABERRATIONS') {
        const ids = id === 'CATCH_ALL_REGULAR_FISH' ? fish().regular : fish().aberrant, ca = s.caught || {};
        return { v: ids.filter(i => ca[i] > 0).length, of: ids.length };
      }
      return null;
    }
    if (c.t === 'int' || c.t === 'decimal') return { v: Math.min(v[c.key] || 0, c.target), of: c.target, money: c.t === 'decimal' };
    if (c.t === 'bool') return { v: c.keys.filter(k => !!v[k] === c.state).length, of: c.keys.length };
    if (c.t === 'quests') return { v: c.ids.filter(q => root.DRQuests && root.DRQuests.isCompleted(q)).length, of: c.ids.length };
    if (c.t === 'nodes') return { v: c.names.filter(n => root.DRYarn && root.DRYarn.visited(n)).length, of: c.names.length };
    if (c.t === 'research') return { v: c.ids.filter(i => (s.itemIdsResearched || []).includes(i)).length, of: c.ids.length };
    if (c.t === 'achievements') return { v: c.ids.filter(i => !!(s.achievements || {})[i]).length, of: c.ids.length };
    return null;
  }

  // ------------------------------------------------------------------ giao diện
  const el = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const iconUrl = a => new URL(a.icon, doc.baseURI).href;
  let toastEl = null, toastTimer = 0, showing = null;
  const TOAST_MS = 4800, TOAST_GAP = 350;
  function hideToast() { clearTimeout(toastTimer); showing = null; if (toastEl) toastEl.classList.remove('on'); }
  function pump() {
    if (showing || !queue.length || D.mode === 'title') return;
    if (!toastEl) {
      toastEl = el('div', 'ach-toast', doc.body); toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      el('i', 'ach-ic', toastEl); const t = el('div', 'ach-tx', toastEl);
      el('b', 'ach-kick', t, 'Thành tựu đã đạt'); el('span', 'ach-name', t); el('span', 'ach-desc', t);
    }
    showing = queue.shift();
    const a = LIST[showing.id];
    toastEl.querySelector('.ach-ic').style.backgroundImage = 'url("' + iconUrl(a) + '")';
    toastEl.querySelector('.ach-name').textContent = a.name;
    toastEl.querySelector('.ach-desc').textContent = a.desc;
    toastEl.dataset.id = a.id;
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    toastTimer = setTimeout(() => { toastEl.classList.remove('on'); toastTimer = setTimeout(() => { showing = null; pump(); }, TOAST_GAP + 250); }, TOAST_MS);
  }

  let M = null, body = null, head = null, openFrom = null;
  const fmt = n => String(Math.round(n * 100) / 100);   // như mô tả gốc: $2500, không có dấu ngăn nghìn
  function build() {
    if (M) return;
    const scrim = el('div', 'ach-scrim', doc.body); scrim.hidden = true;
    const win = el('div', 'ach-win', scrim); win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Thành tựu');
    const h = el('div', 'ach-head', win);
    el('h2', '', h, 'Thành tựu');
    head = el('span', 'ach-count', h);
    const x = el('button', 'ach-x', h, '×'); x.title = 'Đóng (Esc)'; x.setAttribute('aria-label', 'Đóng'); x.onclick = close;
    body = el('div', 'ach-body', win);
    const foot = el('div', 'ach-foot', win);
    el('span', 'ach-note', foot, DATA.dlcSkipped.length + ' thành tựu của DLC (The Pale Reach, The Iron Rig) chưa có vì bản web chưa làm DLC.');
    const back = el('button', 'ach-btn', foot, 'Quay lại'); back.onclick = close;
    scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); });
    M = { scrim, win };
  }
  // Nguồn để vẽ: ván đang chơi; ở màn chính chưa có ván thì đọc sổ ô lưu hiện tại (chỉ đọc)
  function viewSource() {
    if (S()) return S();
    try { const raw = localStorage.getItem(D.saveKey()); if (raw) return JSON.parse(raw) || {}; } catch (e) { /* sổ hỏng / không có localStorage */ }
    return {};
  }
  function render() {
    const src = viewSource(), ach = src.achievements || {};
    head.textContent = ORDER.filter(i => ach[i]).length + ' / ' + ORDER.length;
    body.textContent = '';
    for (const id of ORDER) {
      const a = LIST[id], got = !!ach[id], row = el('div', 'ach-row' + (got ? ' got' : ' lock'), body);
      row.dataset.id = id;
      el('i', 'ach-ic', row).style.backgroundImage = 'url("' + iconUrl(a) + '")';
      const t = el('div', 'ach-tx', row);
      const secret = a.hidden && !got;
      el('b', 'ach-name', t, secret ? '???' : a.name);
      const desc = secret ? 'Thành tựu bí mật' : (a.desc || '');
      if (desc) el('span', 'ach-desc', t, desc);
      const side = el('div', 'ach-side', row);
      if (got) el('span', 'ach-day', side, 'Ngày ' + ((ach[id].day | 0) + 1));
      else {
        const p = secret ? null : progress(id, src);
        if (p) {
          el('span', 'ach-prog', side, (p.money ? '$' : '') + fmt(p.v) + ' / ' + (p.money ? '$' : '') + fmt(p.of));
          const bar = el('i', 'ach-bar', side); bar.style.setProperty('--p', Math.max(0, Math.min(1, p.v / p.of)));
        }
      }
    }
  }
  function open() {
    build(); render();
    if (!M.scrim.hidden) return true;
    openFrom = doc.activeElement;
    M.scrim.hidden = false;
    const b = M.win.querySelector('.ach-btn'); if (b) b.focus();
    return true;
  }
  function close() {
    if (!M || M.scrim.hidden) return;
    M.scrim.hidden = true;
    if (openFrom && openFrom.focus) { try { openFrom.focus(); } catch (e) { /* phần tử đã gỡ */ } }
  }
  function bindUi() {
    const title = doc.getElementById('dr-title'), st = doc.getElementById('btn-settings');
    if (title && st && !doc.getElementById('btn-achievements')) {
      const b = el('button', 'tt-bar', null, 'Thành tựu'); b.id = 'btn-achievements';
      b.onclick = open;
      st.parentNode.insertBefore(b, st.nextSibling);
    }
    const pause = doc.getElementById('dr-pause');
    if (pause && !doc.getElementById('btn-pause-achievements')) {
      const b = el('button', 'eng-btn', null, 'Thành tựu'); b.id = 'btn-pause-achievements';
      b.onclick = open;
      const q = doc.getElementById('btn-quit'); if (q) pause.insertBefore(b, q); else pause.appendChild(b);
    }
    root.addEventListener('keydown', e => {
      if (e.code === 'Escape' && M && !M.scrim.hidden) { close(); e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }

  wire();
  bindUi();
  setInterval(() => guard(poll, 'poll'), 100);
  D.on('mode', m => { if (m !== 'title') pump(); });

  root.DRAch = {
    list: () => ORDER.map(id => Object.assign({ earned: has(id) }, LIST[id])), get: id => LIST[id] || null, earned: has, count, total: ORDER.length,
    set, evaluate, evaluateAll, progress, open, close,
    get isOpen() { return !!(M && !M.scrim.hidden); },
    get toasts() { return { showing: showing && showing.id, queued: queue.map(q => q.id) }; },
    dlcSkipped: DATA.dlcSkipped
  };
})(window);
