// Season Mode: 38 nhiệm vụ thật (task_tbescapetaskconfig 8.6.0) — chữ tiếng Việt chính thức, điều kiện, phần thưởng.
// Nhiệm vụ làm được trong Căn Cứ + Vành Đai Căn Cứ thì chạy thật; còn lại hiện "chưa có ở bản web" kèm lý do.
(function () {
  'use strict';
  const SK = window.SK;
  const SS = SK.SEASON = SK.SEASON || {};
  const inv = SS.inv, T = SS.T || {};
  const L = (k, d) => SS.L(k, d);
  const DEFS = (T.tasks || []).map(t => Object.assign({}, t));
  const WORLD = (window.SK_SEASON && window.SK_SEASON.world) || { maps: {} };
  const S1 = WORLD.maps.s1 || {};
  const AREAS = new Set((S1.investigate || []).map(a => a.id));
  // [ĐO EscapeHeroRescueConfig + điểm HeroRescue của Scene1] người cứu được ở Vành Đai Căn Cứ
  const RESCUABLE = new Set(['rescued_esc_npc_explorer', 'rescued_Ranger', 'rescued_Mage', 'rescued_Assassin', 'rescued_Alchemist',
    'rescued_Engineer', 'rescued_Vampire', 'rescued_Priest']);
  const NPC_PREFAB = {};
  for (const k in T.npcs || {}) NPC_PREFAB[k] = T.npcs[k].prefab;

  // lý do không làm được ở bản web (null = làm được)
  function webBlock(d, seen) {
    seen = seen || {};
    if (seen[d.id]) return null;
    seen[d.id] = 1;
    for (const u of d.unlock) if (!RESCUABLE.has(u)) return 'Cần giải cứu nhân vật ở khu vực chưa mở';
    for (const [kind, key] of d.checks) {
      if (kind === 'KillEnemy' && key !== 'Any') return 'Trùm ở khu vực chưa mở';
      if (kind === 'InvestigateArea' && !AREAS.has(key)) return 'Khu vực chưa mở ở bản web';
      if (kind === 'PlaceBeacon') return 'Đèn hiệu ở khu vực chưa mở';
      if (kind === 'RescueHero' && !RESCUABLE.has('rescued_' + (key === 'esc_npc_explorer' ? key : NPC_PREFAB[key] || key))) return 'Nhân vật ở khu vực chưa mở';
    }
    for (const p of d.pre) { const q = DEFS.find(x => x.id === p); const w = q && webBlock(q, seen); if (w) return w; }
    return null;
  }
  for (const d of DEFS) d.web = webBlock(d);

  const Q = SS.quests = { defs: DEFS };
  function st() {
    const S = inv.state;
    if (!S.quests || !S.quests.acc) S.quests = { acc: [], done: [], prog: {} };
    return S.quests;
  }
  const byId = id => DEFS.find(d => d.id === id);
  Q.byId = byId;
  Q.isDone = id => st().done.indexOf(id) >= 0;
  Q.isAccepted = id => st().acc.indexOf(id) >= 0;
  const npcHere = npc => npc === 'esc_npc_trainer' || inv.node(npc === 'esc_npc_explorer' ? 'rescued_esc_npc_explorer' : 'rescued_' + NPC_PREFAB[npc]);
  // Mở được khi xong nhiệm vụ trước + có điều kiện mở + NPC giao việc đang ở căn cứ [ĐO PreTaskID, ExtraUnlockConditions, NpcId]
  Q.unlocked = d => !Q.isDone(d.id) && d.pre.every(Q.isDone) && d.unlock.every(k => inv.node(k)) && npcHere(d.npc);
  // Nhận tự động khi mở (bảng Nhiệm vụ của ảnh h chỉ có mục "Đã nhận")
  function refresh() {
    let any = false;
    for (const d of DEFS) if (Q.unlocked(d) && !Q.isAccepted(d.id)) { st().acc.push(d.id); any = true; }
    if (any) inv.save();
  }
  Q.refresh = refresh;
  Q.accepted = () => { refresh(); return DEFS.filter(d => Q.isAccepted(d.id) && !Q.isDone(d.id)); };
  Q.finished = () => st().done.map(byId).filter(Boolean);
  Q.locked = d => !!d.web;
  Q.all = () => DEFS;

  // tiến độ từng điều kiện
  Q.progress = function (d, i) {
    const [kind, key, n] = d.checks[i];
    if (Q.isDone(d.id)) return n;
    if (kind === 'BuildingLevel') return Math.min(n, inv.buildLevel(key));
    if (kind === 'RescueHero') return inv.node(key === 'esc_npc_explorer' ? 'rescued_esc_npc_explorer' : 'rescued_' + (NPC_PREFAB[key] || key)) ? n : 0;
    if (kind === 'SubmitItem') return Math.min(n, inv.count(key, 'all'));
    const p = st().prog[d.id];
    return Math.min(n, (p && p[i]) || 0);
  };
  Q.objDone = (d, i) => Q.progress(d, i) >= d.checks[i][2];
  Q.complete = d => d.checks.every((c, i) => Q.objDone(d, i));
  Q.needsSubmit = d => d.checks.some(c => c[0] === 'SubmitItem');
  Q.label = function (c) {
    const [kind, key] = c;
    const item = id => (SS.itemDef(id) || {}).name || id;
    if (kind === 'KillEnemy') return L('esc_task_target_kill', 'Tiêu Diệt {0}').replace('{0}', key === 'Any' ? L('esc_task_target_any_enemy', 'Kẻ địch bất kỳ') : key === 'e_escape_macaque_boss' ? 'Tộc Trưởng Khỉ Đuôi Dài' : 'Tù Trưởng Vượn');
    if (kind === 'SuccessTimes') return L('esc_task_target_extraction_count', 'Rút lui thành công {0} lần').replace('{0}', c[2]);
    if (kind === 'UseConsumable') return L('esc_task_target_use', 'Sử dụng {0}').replace('{0}', item(key));
    if (kind === 'BuildingLevel') return L('esc_task_target_build', 'Xây Dựng {0}').replace('{0}', (T.buildings.find(b => b.id === key) || {}).name || key) + (c[2] > 1 ? ' cấp ' + c[2] : '');
    if (kind === 'CraftItem') return 'Chế tạo ' + item(key);
    if (kind === 'RescueHero') return L('esc_task_target_rescue', 'Giải Cứu {0}').replace('{0}', (T.npcs[key] || {}).name || key);
    if (kind === 'InvestigateArea') return L('esc_task_target_investigate', 'Điều Tra {0}').replace('{0}', L('esc_task_target_area', 'Khu vực') + ' ' + key.split('_')[1]);
    if (kind === 'SubmitItem') return L('esc_task_target_submit_item', 'Nộp Vật Phẩm {0}').replace('{0}', item(key));
    if (kind === 'PlaceBeacon') return L('esc_task_target_unlock', 'Mở Khóa {0}').replace('{0}', 'Đèn hiệu');
    return kind;
  };

  function bump(kind, match, k) {
    let any = false;
    for (const d of Q.accepted()) {
      d.checks.forEach((c, i) => {
        if (c[0] !== kind || !match(c[1]) || Q.objDone(d, i)) return;
        const p = st().prog[d.id] = st().prog[d.id] || [];
        p[i] = Math.min(c[2], (p[i] || 0) + (k || 1));
        any = true;
        if (Q.complete(d)) Q.notify(d);
      });
    }
    if (any) inv.save();
  }
  const notified = {};
  Q.notify = function (d) {
    if (notified[d.id]) return;
    notified[d.id] = 1;
    const G = SK.G;
    if (G && G.toast) G.toast('Nhiệm vụ xong: ' + d.title + ' — gặp ' + ((T.npcs[d.npc] || {}).name || '') + ' để nhận thưởng', 3);
    SK.emit('seasonQuestDone', G, d.id);
  };
  // Nộp vật phẩm (esc_task_submit_button) rồi nhận thưởng
  Q.claim = function (id) {
    const d = byId(id);
    if (!d || !Q.isAccepted(id) || Q.isDone(id)) return 'Chưa nhận nhiệm vụ';
    if (d.web) return d.web;
    if (!Q.complete(d)) return 'Chưa hoàn thành';
    for (const [kind, key, n] of d.checks) if (kind === 'SubmitItem') inv.remove(key, n, 'all');
    for (const [rid, n] of d.rewards) {
      let left = inv.add(rid, n);
      if (left) left = inv.addTo('warehouse', rid, left);
    }
    if (d.coins) inv.state.coins += d.coins;
    st().done.push(id);
    delete st().prog[id];
    inv.changed(); inv.save();
    refresh();
    SK.emit('seasonQuestClaim', SK.G, id);
    return null;
  };
  Q.claimAll = () => Q.accepted().filter(d => !d.web && Q.complete(d)).map(d => (Q.claim(d.id), d.id));
  Q.wantsArea = id => Q.accepted().some(d => d.checks.some((c, i) => c[0] === 'InvestigateArea' && c[1] === id && !Q.objDone(d, i)));
  Q.wantsRescue = npc => Q.accepted().some(d => d.checks.some(c => c[0] === 'RescueHero' && c[1] === npc));
  // Dấu trên đầu NPC: '?' xong việc chờ nhận thưởng, '!' có việc [ĐO NpcHint_0/1 của EscapeNpcInteraction]
  Q.npcHint = function (npc) {
    const acc = Q.accepted().filter(d => d.npc === npc && !d.web);
    if (acc.some(Q.complete)) return '?';
    return acc.length ? '!' : '';
  };

  SK.on('seasonKill', (G, e) => bump('KillEnemy', k => k === 'Any' || k === e.pid));
  SK.on('seasonExtract', () => bump('SuccessTimes', () => true));
  SK.on('seasonUse', (G, id) => bump('UseConsumable', k => k === id));
  SK.on('seasonCraft', (G, id, n) => bump('CraftItem', k => k === id, n || 1));
  SK.on('seasonInvestigate', (G, id) => bump('InvestigateArea', k => k === id));
  SK.on('seasonUpgrade', () => { for (const d of Q.accepted()) if (!d.web && Q.complete(d)) Q.notify(d); });
  SK.on('seasonRescue', () => { refresh(); for (const d of Q.accepted()) if (!d.web && Q.complete(d)) Q.notify(d); });
})();
