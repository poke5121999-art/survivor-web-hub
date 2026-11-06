/*
 * Nhiệm vụ (Pursuits) chép theo QuestManager.cs của bản gốc, dữ liệu từ DR_QUESTS (tools/data.py: QuestData, QuestStepData).
 *
 * Sổ lưu: DR.s.quests = { <questId>: { id, state, activeStepId, completedStepIds[], resolutionIndex, hasUnseenUpdate } }
 *   (SerializedQuestEntry). state: UNAVAILABLE | OFFERED | STARTED | COMPLETED (QuestState.cs).
 *
 *   DRQuests.offer(id)  start(id, silent)  complete(id, resolution, silent)  completeStep(stepId, silent)
 *   DRQuests.state(id)  isStepActive(stepId)  isStepCompleted(stepId)  activeSteps()  canBeShown(stepId)
 *   DRQuests.title(id)  stepText(stepId, 'short'|'long'|'done')  list()  markSeen(id)
 * Sự kiện: DR.emit('quest', { kind: 'started'|'updated'|'completed', id, step }) cho HUD (NotificationType QUEST_*).
 * Tự xét điều kiện như bản gốc: khi có đồ vào khoang (OnItemAdded), khi trạng thái nhiệm vụ đổi (OnQuestStateChanged),
 * khi sang ngày mới (OnDayChanged → EvaluateUnavailableQuests).
 */
(function (root) {
  'use strict';
  const Q = root.DR_QUESTS || { QuestData: {}, QuestStepData: {} };
  const QUESTS = Q.QuestData, STEPS = Q.QuestStepData;

  // bước → nhiệm vụ (steps + onOfferedQuestStep), QuestManager.GetQuestDataByStepId
  const stepQuest = {};
  for (const [qid, q] of Object.entries(QUESTS)) {
    for (const s of q.steps || []) stepQuest[s] = qid;
    if (q.onOfferedQuestStep) stepQuest[q.onOfferedQuestStep] = qid;
  }

  const D = () => root.DR;
  function entries() {
    const s = D().s;
    if (!s) return {};
    if (!s.quests) s.quests = {};
    return s.quests;
  }
  const entry = id => entries()[id] || null;
  const state = id => (entry(id) || {}).state || 'UNAVAILABLE';
  const emit = (kind, id, step) => { try { D().emit('quest', { kind, id, step }); } catch (e) { console.error('[quests] listener failed:', e); } };

  function offer(id) {
    const q = QUESTS[id];
    if (!q) { console.warn('[quests] offer: quest not found:', id); return; }
    if (state(id) !== 'UNAVAILABLE') return;
    entries()[id] = { id, state: 'OFFERED', activeStepId: q.onOfferedQuestStep || null, completedStepIds: [], resolutionIndex: 0, hasUnseenUpdate: false };
    changed(id, 'OFFERED');
  }

  function start(id, silent) {
    const q = QUESTS[id];
    if (!q) { console.warn('[quests] start: quest not found:', id); return; }
    if (!q.steps || !q.steps.length) { console.warn('[quests] start: quest has no steps:', id); return; }
    const st = state(id);
    if (st === 'STARTED' || st === 'COMPLETED') return;
    let e = entry(id);
    if (!e) e = entries()[id] = { id, completedStepIds: [], resolutionIndex: 0 };
    e.state = 'STARTED';
    e.activeStepId = q.steps[0];
    addMarkers(STEPS[q.steps[0]] && STEPS[q.steps[0]].mapMarkersToAddOnStart);
    if (q.showUnseenIndicators) e.hasUnseenUpdate = true;
    if (!silent) emit('started', id, e.activeStepId);
    changed(id, 'STARTED');
  }

  function complete(id, resolutionIndex, silent) {
    const q = QUESTS[id];
    if (!q) { console.warn('[quests] complete: quest not found:', id); return; }
    if (state(id) === 'COMPLETED') return;
    let e = entry(id);
    if (!e) e = entries()[id] = { id, completedStepIds: [] };
    e.resolutionIndex = resolutionIndex || 0;
    e.state = 'COMPLETED';
    e.hasUnseenUpdate = false;
    removeMarkers(q.mapMarkersToRemoveOnCompletion);
    changed(id, 'COMPLETED');
    if (!silent) emit('completed', id, null);
  }

  // QuestManager.CompleteQuestStep: bỏ qua nếu nhiệm vụ chưa mở / đã xong / bước đã xong / bước hiện tại đã đi qua bước này
  function completeStep(stepId, suppressNotifications, suppressUnseen) {
    const qid = stepQuest[stepId], q = QUESTS[qid];
    if (!q) { console.warn('[quests] completeStep: no quest owns step:', stepId); return; }
    const e = entry(qid);
    if (!e) { console.warn('[quests] completeStep: quest entry not in save:', qid, stepId); return; }
    const idx = q.steps.indexOf(stepId);
    if (e.state === 'UNAVAILABLE' || e.state === 'COMPLETED' || e.completedStepIds.includes(stepId) || q.steps.indexOf(e.activeStepId) > idx) return;
    e.completedStepIds.push(stepId);
    removeMarkers(STEPS[stepId] && STEPS[stepId].mapMarkersToDeleteOnCompletion);
    if (idx < q.steps.length - 1) {
      e.activeStepId = q.steps[idx + 1];
      // bản gốc gọi RemoveMapMarker cho mapMarkersToAddOnStart của bước kế (QuestManager.cs) — giữ nguyên hành vi
      removeMarkers(STEPS[e.activeStepId] && STEPS[e.activeStepId].mapMarkersToAddOnStart);
      if (q.showUnseenIndicators && !suppressUnseen) e.hasUnseenUpdate = true;
      if (!suppressNotifications) emit(e.state === 'OFFERED' ? 'started' : 'updated', qid, e.activeStepId);
      e.state = 'STARTED';
    } else {
      complete(qid, 0, suppressNotifications);
    }
    D().emit('questStep', stepId);
  }

  function addMarkers(list) {
    if (!list || !list.length) return;
    const s = D().s; s.mapMarkers = s.mapMarkers || [];
    for (const m of list) if (!s.mapMarkers.includes(m)) s.mapMarkers.push(m);
  }
  function removeMarkers(list) {
    if (!list || !list.length) return;
    const s = D().s; if (!s.mapMarkers) return;
    s.mapMarkers = s.mapMarkers.filter(m => !list.includes(m));
  }

  let evaluating = false;
  function changed(id, st) {
    D().emit('questState', id, st);
    if (evaluating) return;
    evaluating = true;
    try { evaluateUnavailable(); evaluateActive(); } finally { evaluating = false; }
  }

  function activeSteps() {
    const out = [];
    for (const e of Object.values(entries())) {
      if ((e.state === 'OFFERED' || e.state === 'STARTED') && QUESTS[e.id] && e.activeStepId && STEPS[e.activeStepId]) out.push(e.activeStepId);
    }
    return out;
  }
  const isStepActive = stepId => {
    const qid = stepQuest[stepId];
    if (!qid) { console.warn('[quests] isStepActive: no quest owns step:', stepId); return false; }
    const e = entry(qid);
    return !!e && e.activeStepId === stepId && e.state !== 'COMPLETED';
  };
  const isStepCompleted = stepId => {
    const qid = stepQuest[stepId];
    if (!qid) { console.warn('[quests] isStepCompleted: no quest owns step:', stepId); return false; }
    const e = entry(qid);
    return !!e && e.completedStepIds.includes(stepId);
  };

  // ---- điều kiện (QuestStepCondition và các lớp con)
  function countInv(id, key) {
    const g = D().grid(key || 'INVENTORY');
    return g ? g.items.filter(i => i.id === id).length : 0;
  }
  function aberrantCount() {
    let n = 0;
    for (const k of ['INVENTORY', 'STORAGE', 'TRAWL_NET']) {
      const g = D().s.grids[k] ? D().grid(k) : null;
      if (g) for (const it of g.items) { const d = root.DR_ITEMS[it.id]; if (d && d.isAberration) n++; }
    }
    return n;
  }
  function cond(c) {
    switch (c._t) {
      case 'ItemInventoryCondition': return countInv(c.itemId) > 0;
      case 'ItemSeenCondition': return (D().s.itemsOwned || []).includes(c.itemId);
      case 'ItemNetCondition': return D().s.grids.TRAWL_NET ? countInv(c.itemId, 'TRAWL_NET') > 0 : false;
      case 'OtherQuestCondition': return state(c.quest) === c.state;
      case 'AberrantItemInventoryCondition': return aberrantCount() > 0;
      case 'DayCondition': return Math.floor(D().s.time) >= c.day;
      case 'QuestCompleteCondition': return state(c.quest || c.questData) === 'COMPLETED';
      case 'BuildingConstructedCondition': return !!(D().s.vars || {})[String(c.buildingTierId) + '-is-constructed'];
      default:
        console.info('[quests] condition type has no system yet:', c._t);
        return false;
    }
  }
  function canBeShown(stepId) {
    const s = STEPS[stepId];
    return !s || !s.showConditions || !s.showConditions.length || s.showConditions.every(cond);
  }

  function evaluateUnavailable() {
    for (const [id, q] of Object.entries(QUESTS)) {
      if (state(id) !== 'UNAVAILABLE' || !q.canBeOfferedAutomatically) continue;
      if ((q.offerConditions || []).every(cond)) offer(id);
    }
  }
  function evaluateActive() {
    for (const sid of activeSteps()) {
      const s = STEPS[sid];
      if (!s.allowAutomaticCompletion || !s.completeConditions) continue;
      let ok = false, silent = false;
      if (s.conditionMode === 'ANY') {
        const hit = s.completeConditions.find(cond);
        if (hit) { ok = true; silent = !!hit.silent; }
      } else {
        ok = s.completeConditions.every(cond);
        silent = s.completeConditions.every(c => c.silent);
      }
      if (ok) completeStep(sid, silent, silent);
    }
  }
  function evaluate() {
    if (!D().s || evaluating) return;
    evaluating = true;
    try { evaluateUnavailable(); evaluateActive(); } finally { evaluating = false; }
  }

  // ---- chữ (QuestData.titleKey ... là chuỗi tiếng Anh gốc; {biến} thay bằng DR.s.vars)
  const fill = t => String(t || '').replace(/\{_?([A-Za-z0-9_-]+)\}/g, (m, k) => {
    const v = (D().s.vars || {})[k] != null ? D().s.vars[k] : (D().s.vars || {})['_' + k];
    return v != null ? String(v) : '0';
  });
  // nhiệm vụ ẩn (vd Quest_RelicSub1, SetQuestStartedSilent) không có titleKey: trả '' chứ không lộ id thô
  const title = id => fill((QUESTS[id] || {}).titleKey || '');
  function stepText(stepId, kind) {
    const s = STEPS[stepId] || {};
    return fill(kind === 'done' ? s.completedKey : kind === 'long' ? (s.longActiveKey || s.shortActiveKey) : (s.shortActiveKey || s.longActiveKey));
  }
  // Sổ nhiệm vụ: JournalWindow/QuestEntryUI — đang làm trước, xong sau. Nhiệm vụ con (QuestData.subquests, vd Quest_RelicSub1..5) không có dòng
  // riêng: QuestDetailWindow.Init hiện bước của nó ngay dưới bước của nhiệm vụ cha (ShowQuestData cho cha rồi subquests.ForEach)
  const isSub = {};
  for (const q of Object.values(QUESTS)) for (const c of q.subquests || []) isSub[c] = true;
  function stepsOf(id) {
    const q = QUESTS[id], e = entries()[id], steps = [];
    if (!q || !e || (e.state !== 'STARTED' && e.state !== 'COMPLETED')) return steps;
    for (const sid of q.steps) {
      const s = STEPS[sid] || {};
      const done = e.completedStepIds.includes(sid);
      if (done && s.hiddenWhenComplete) continue;
      if (!done && sid !== e.activeStepId) continue;
      if (!done && s.hiddenWhenActive) continue;
      if (s.hideIfThisStepIsComplete && e.completedStepIds.includes(s.hideIfThisStepIsComplete)) continue;
      steps.push({ id: sid, done, text: stepText(sid, done ? 'done' : 'long'), short: stepText(sid, 'short') });
    }
    return steps;
  }
  function list() {
    const out = [];
    for (const e of Object.values(entries())) {
      const q = QUESTS[e.id];
      if (!q || isSub[e.id] || (e.state !== 'STARTED' && e.state !== 'COMPLETED')) continue;
      const steps = stepsOf(e.id);
      for (const c of q.subquests || []) steps.push(...stepsOf(c));
      out.push({
        id: e.id, title: title(e.id), summary: fill(q.summaryKey), state: e.state, unseen: !!e.hasUnseenUpdate,
        resolution: e.state === 'COMPLETED' && q.resolutionKeys && q.resolutionKeys.length ? fill(q.resolutionKeys[e.resolutionIndex || 0]) : null,
        active: e.state === 'STARTED' ? e.activeStepId : null, steps
      });
    }
    out.sort((a, b) => (a.state === 'COMPLETED') - (b.state === 'COMPLETED'));
    return out;
  }
  const markSeen = id => { const e = entry(id); if (e) e.hasUnseenUpdate = false; };

  // ---- móc sự kiện
  function wire() {
    const DR = D();
    if (!DR || !DR.on) return;
    DR.on('newgame', () => { DR.s.quests = {}; });
    DR.on('cargo', (key, inst) => {
      if (!DR.s) return;
      if (inst && inst.id) {
        const own = DR.s.itemsOwned = DR.s.itemsOwned || [];
        if (!own.includes(inst.id)) own.push(inst.id);
      }
      evaluate();
    });
    // OnDayChanged
    let lastDay = null;
    setInterval(() => {
      if (!DR.s) return;
      const d = Math.floor(DR.s.time);
      if (lastDay !== null && d !== lastDay) evaluate();
      lastDay = d;
    }, 1000);
  }
  wire();

  root.DRQuests = {
    offer, start, complete, completeStep, state, isStepActive, isStepCompleted, activeSteps, canBeShown, evaluate,
    title, stepText, list, markSeen, cond, questOfStep: s => stepQuest[s] || null,
    isInactive: id => state(id) === 'UNAVAILABLE', isAvailable: id => state(id) === 'OFFERED',
    isStarted: id => state(id) === 'STARTED', isCompleted: id => state(id) === 'COMPLETED'
  };
})(window);
