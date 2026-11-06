/*
 * DREDGE — Biển Mù: kiểm tiến trình (paudit). Mọi chuỗi nhiệm vụ của bản gốc (bỏ DLC) chơi tới COMPLETED trên trang thật, rồi cả hai cảnh kết.
 *
 * Cách lái (không có kịch bản viết tay cho từng nhiệm vụ):
 *   - Mỗi vòng, với mỗi nhiệm vụ chưa xong: đích = lệnh Yarn làm nó tiến một bước (SetQuestStarted/Available, SetQuestStepCompleted(Silent) <bước>,
 *     SetQuestCompleted; QuestManager.cs + DredgeDialogueRunner.cs:380-410), hoặc điều kiện tự xong của bước (ItemInventory / ItemSeen / Aberrant /
 *     OtherQuest), hoặc cối của Phi công (MortarQuestStepAnimatorTriggerable.cs:23).
 *   - Tìm node chứa lệnh đích trong DR_YARN, lần ngược theo RunNode tới một lối vào mà bản web đang hiện: node gốc của bến, nút người nói,
 *     điểm đến, bước showAtDock/showAtSpeaker, POI (F), điểm nổ. Lái thật tới đó: dịch thuyền (DR_DEBUG.teleport, móc gỡ lỗi duy nhất để đi),
 *     Space cập bến, bấm nút người nói / điểm đến trong DOM, F ở POI.
 *   - Trong hội thoại: dòng thì DRDialogue.next() (như Space), lựa chọn thì DRDialogue.choose(i) với i là lựa chọn mà đồ thị điều khiển của node
 *     (nhánh của nhãn lựa chọn → RunNode) dẫn gần đích nhất; không nhánh nào dẫn tới thì chọn #exit.
 *   - Đồ: lưới nhiệm vụ đòi món gì (QuestGridConfig.completeConditions) thì đưa đúng món đó ngay lúc lưới mở; món đường đi hỏi qua hàm ...ById mà là cá
 *     thì đưa cá; món nằm ở HarvestPOI (relic, khung cối...) thì lái tới điểm đó, Space, DR_DEBUG.catchNow (bỏ qua minigame); thiếu đồ nghề cho
 *     harvestableType thì đưa đồ nghề (ghi lại). Hết đường thì qua một ngày (DR.s.time += 1) rồi thử lại.
 *   - Cảnh kết: chụp sổ trước khi chọn, chạy Collector_PickupAccept → Finale_Root → Finale_BadRegular; nạp lại sổ, LighthouseKeeper_FinaleAccepted → Finale_Good.
 * Chạy:  node test/dredge-paudit.js                     (máy chủ tĩnh cục bộ)
 *        DR_URL=https://poke5121999-art.github.io/survivor-web-hub node test/dredge-paudit.js
 *        PA_ONLY=Quest_Intro,Quest_StrangeFish ...      chỉ báo các nhiệm vụ này (vẫn chơi phụ thuộc của chúng)
 *        PA_QUESTS=a,b      chỉ giải các nhiệm vụ này     PA_STATE=<state.json>  chơi tiếp từ sổ (mỗi vòng ghi %TEMP%/dredge-paudit/state.json)
 *        PA_ENDING=good     chỉ kết tốt                   PA_BUDGET_MIN=<phút>   hạn vòng giải (mặc định 45; ván đầy đủ ~100 phút)
 * Bẫy đã sập (ghi lại): DRDialogue.choose() không bỏ qua được 0,75 s chờ của nút (t0 nằm trong closure) → đợi 0,85 s rồi mới chọn;
 *   chợ cá không có bảng hàng (DRCargo left = null) nên nhận ra chợ qua DRShop._debug(); khoang tier 1 chỉ có 3 ô đồ nghề liền (rod5 1x3 không vừa
 *   nếu không xếp lại) → PA.fit / PA.makeRoom; quest-corpse cần ba lần (đừng coi "đã từng có" là xong với món từ lưới); OldMayor_Intro cần
 *   "old-mayor-available" (js/worldstate.js).
 * Ra:   một dòng ✔/✘ mỗi nhiệm vụ (Quest_*: COMPLETED), mỗi cảnh kết; nhật ký ở %TEMP%/dredge-paudit/log.txt.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-paudit');
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt');
fs.writeFileSync(LOG, '');
const log = s => { fs.appendFileSync(LOG, s + '\n'); if (process.env.PA_VERBOSE) console.log(s); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// ====================================================================== thư viện chạy trong trang
function LIB() {
  if (window.PA) return;
  const Y = DR_YARN, OPS = Y.ops, OP = {}; OPS.forEach((n, i) => { OP[n] = i; });
  const W = DR_WORLD, Q = DR_QUESTS, ITEMS = DR_ITEMS, G = DRGrid;
  const PA = window.PA = { ran: [], gave: [], trace: [], grids: [], sold: false };

  // ---- đồ thị điều khiển trong node: từ chỉ số k, các lệnh gặp và các node nhảy tới
  const CF = {};
  function cfg(name) {
    if (CF[name]) return CF[name];
    const ins = Y.nodes[name].i, lab = Y.nodes[name].l;
    const succ = ins.map((x, k) => {
      const op = x[0];
      if (op === OP.JumpTo) return [lab[x[1]]];
      if (op === OP.JumpIfFalse) return [k + 1, lab[x[1]]];
      if (op === OP.Stop || op === OP.RunNode || op === OP.Jump) return [];
      if (op === OP.ShowOptions) {                       // nhánh = nhãn của các AddOption từ ShowOptions trước đó
        const o = [];
        for (let j = k - 1; j >= 0 && ins[j][0] !== OP.ShowOptions; j--) if (ins[j][0] === OP.AddOption) o.push(lab[ins[j][2]]);
        return o;
      }
      return [k + 1];
    });
    return (CF[name] = { ins, lab, succ });
  }
  function reach(name, from) {
    const { ins, succ } = cfg(name), seen = new Set(), st = [from], cmds = [], jumps = [];
    while (st.length) {
      const k = st.pop();
      if (k == null || k >= ins.length || seen.has(k)) continue;
      seen.add(k);
      const x = ins[k];
      if (x[0] === OP.RunCommand) cmds.push(x[1]);
      if (x[0] === OP.RunNode && k && ins[k - 1][0] === OP.PushString && Y.nodes[ins[k - 1][1]]) jumps.push(ins[k - 1][1]);
      for (const s of succ[k]) st.push(s);
    }
    return { cmds, jumps };
  }
  const NJ = {}, NC = {};
  for (const n of Object.keys(Y.nodes)) { const r = reach(n, 0); NJ[n] = r.jumps; NC[n] = r.cmds; }
  const RJ = {};
  for (const [n, js] of Object.entries(NJ)) for (const j of js) (RJ[j] = RJ[j] || []).push(n);

  // goal = { re: chuỗi regex của lệnh } | { nodes: [...] }
  function goalNodes(goal) {
    if (goal.nodes) return goal.nodes.filter(n => Y.nodes[n]);
    const re = new RegExp(goal.re);
    return Object.keys(NC).filter(n => NC[n].some(c => re.test(c)));
  }
  function dist(goal) {
    const d = {}, q = goalNodes(goal);
    for (const n of q) d[n] = 0;
    for (let i = 0; i < q.length; i++) for (const p of RJ[q[i]] || []) if (d[p] == null) { d[p] = d[q[i]] + 1; q.push(p); }
    return d;
  }
  PA.goalNodes = goalNodes;

  // ---- lối vào đang hiện trên bản web
  const avail = () => DRYarn.ensure();
  function entries() {
    const s = avail(), E = [];
    const spOk = sp => { const sd = W.SpeakerData[sp]; return !!sd && (sd.alwaysAvailable || s.availableSpeakers.includes(sp)); };
    const STEPS = Q.QuestStepData;
    const active = DRQuests.activeSteps();
    for (const [did, d] of Object.entries(W.DockData)) {
      const dk = DRDocks.byId[did];
      if (!dk) continue;                                    // DLC (js/docks.js) hoặc không có trên bản đồ
      if (d.yarnRootNode) E.push({ kind: 'dock', dock: did, node: d.yarnRootNode, ok: true });
      for (const sp of d.speakers || []) E.push({ kind: 'speaker', dock: did, speaker: sp, node: (W.SpeakerData[sp] || {}).yarnRootNode, ok: spOk(sp) });
      for (const de of ((Y.docks[did] || {}).dests || [])) {
        const ok = !!de.always || s.availableDestinations.includes(de.id);
        let node = de.root || (de.speaker && (W.SpeakerData[de.speaker] || {}).yarnRootNode);
        if (de.speaker) {
          const sid = active.find(x => STEPS[x] && STEPS[x].showAtSpeaker && STEPS[x].stepSpeaker === de.speaker && DRQuests.canBeShown(x));
          if (sid && STEPS[sid].yarnRootNode) node = STEPS[sid].yarnRootNode;
        }
        if (node) E.push({ kind: 'dest', dock: did, dest: de.id, node, ok });
      }
    }
    for (const sid of active) {
      const st = STEPS[sid];
      if (st && st.showAtDock && st.stepSpeaker && st.yarnRootNode && DRQuests.canBeShown(sid)) E.push({ kind: 'speaker', dock: st.stepDock, speaker: st.stepSpeaker, node: st.yarnRootNode, ok: true, step: sid });
    }
    for (const p of DRPoi.points.concat(DRPoi.extra || [])) if (p.node) E.push({ kind: 'poi', id: p.id, node: p.node, x: p.x, z: p.z, r: p.r || 5, ok: DRPoi.enabled(p) });
    return E.filter(e => e.node && Y.nodes[e.node]);
  }
  // các lối vào xếp theo khoảng cách tới đích (chỉ lối đang hiện)
  PA.plan = goal => {
    const d = dist(goal);
    return entries().filter(e => e.ok && d[e.node] != null).sort((a, b) => d[a.node] - d[b.node] || (a.kind === 'dock') - (b.kind === 'dock'))
      .map(e => Object.assign(e, { d: d[e.node] }));
  };
  PA.allPlans = goal => { const d = dist(goal); return entries().filter(e => d[e.node] != null).map(e => Object.assign(e, { d: d[e.node] })); };

  // ---- món đường đi hỏi: hàm ...ById (đối số chuỗi trước CallFunc)
  PA.needs = goal => {
    const d = dist(goal), out = {};
    for (const n of Object.keys(d)) {
      const ins = Y.nodes[n].i;
      ins.forEach((x, k) => {
        if (x[0] !== OP.CallFunc || !/ById|AndCondition|^GetNumItemsByType|^GetNumTrophyFish|^GetNumAberrantFish|^GetNumShopTransaction|^GetShopTransactionTotal|^GetDockPro|^GetHasVisitedNode$/.test(x[1])) return;
        const a = []; for (let j = k - 2; j >= 0 && a.length < 3 && ins[j][0] !== OP.CallFunc; j--) if (ins[j][0] === OP.PushString || ins[j][0] === OP.PushFloat) a.unshift(ins[j][1]);
        let id = a.find(v => typeof v === 'string' && ITEMS[v]);
        // hàm đếm theo loại: cá thường / cá cúp / cá dị dạng (chỉ khi js/progress.js đã cho bắt dị dạng)
        if (!id && /^GetNumItemsByType/.test(x[1]) && a.includes('FISH')) id = '__fish';
        if (!id && /^GetNumTrophyFish/.test(x[1])) id = '__trophy';
        if (!id && /^GetNumAberrantFish/.test(x[1]) && DR.s.vars['can-catch-aberrations']) id = '__aberrant';
        // nợ tàu Greater Marrow (GreaterMarrowDebt 50): Mayor_DebtRepaid chỉ chạy khi đã trả đủ (CaughtToOrder_Step3Pre)
        if (!id && (/^GetDockProportionalProgress|^GetDockProgressRemaining/.test(x[1]) || (x[1] === 'GetHasVisitedNode' && a.includes('Mayor_DebtRepaid')))) id = '__debt';
        // lịch sử chợ (Intro_Sell: GetNumShopTransactionDaysUnique destination.gm-fishmonger > 0): phải bán ở đó một lần
        if (!id && /^GetNumShopTransaction|^GetShopTransactionTotal/.test(x[1])) { const dd = a.find(v => typeof v === 'string' && /^destination\./.test(v)); if (dd) id = '__shop:' + dd; }
        // hàm có điều kiện độ tươi (GetNumFishByIdAndCondition) thắng hàm đếm trơn: món phải đúng độ tươi
        if (id && d[n] <= 3 && !(out[id] && /AndCondition/.test(out[id].fn))) out[id] = { fn: x[1], args: a, node: n };
      });
    }
    return out;
  };

  // ---- ghi lại lệnh nhiệm vụ đã chạy
  for (const name of ['SetQuestAvailable', 'SetQuestStarted', 'SetQuestStartedSilent', 'SetQuestCompleted', 'SetQuestCompletedWithResolution', 'SetQuestStepCompleted', 'SetQuestStepCompletedSilent']) {
    const c = DRYarn.commands[name], f = c.f;
    c.f = function (a, r, resume) { PA.ran.push(name + ' ' + a.join(' ')); return f.call(this, a, r, resume); };
  }
  PA.deaths = [];
  DR.on('death', why => PA.deaths.push({ why: String(why), x: Math.round(DR.s.boat.x), z: Math.round(DR.s.boat.z), t: +DR.s.time.toFixed(2) }));
  DR.on('nodeStart', n => { PA.trace.push(n); if (PA.trace.length > 400) PA.trace.splice(0, 100); });

  // ---- đồ cho lưới nhiệm vụ: đưa đúng món mà completeConditions đòi, ngay khi lưới mở
  const fishFresh = () => DR_CONFIG.maxFreshness;
  function giveItem(id, why, extra) {
    const def = ITEMS[id];
    if (!def) return null;
    const x = Object.assign({}, (G.subOf(def) & G.SUB.FISH) ? { size: 0.5, fresh: fishFresh() } : {}, extra || {});
    let inst = DR.give(id, x);
    if (!inst) { PA.tidy(true); inst = DR.give(id, x) || PA.fit(id, x); }
    PA.gave.push(id + (why ? ' (' + why + ')' : '') + (inst ? '' : ' [khoang đầy]'));
    return inst;
  }
  PA.give = giveItem;
  // dọn chỗ cho một món như người chơi: dọn khoang, cất relic / đồ nhiệm vụ khác vào Kho (fetchNeeds lấy ra lại khi cần), xếp lại đồ nghề
  PA.makeRoom = id => {
    const inv = DR.grid('INVENTORY'), d = ITEMS[id];
    if (!d || G.findSpot(inv, d, 0, false)) return true;
    PA.tidy(true);
    if (G.findSpot(inv, d, 0, false)) return true;
    if (DR.s.grids.STORAGE) {
      const st = DR.grid('STORAGE');
      for (const it of inv.items.slice()) {
        const dd = ITEMS[it.id];
        if (!dd || it.id === id || (G.typeOf(dd) & G.TYPE.EQUIPMENT) || !(dd.subtype === 'RELIC' || /^quest-/.test(it.id))) continue;
        const ex = Object.assign({}, it); delete ex.id; delete ex.x; delete ex.y; delete ex.cells; delete ex.uid;
        if (G.autoPlace(st, dd, ex)) { G.remove(inv, it); PA.trace.push('  · cất ' + it.id + ' vào Kho'); }
        if (G.findSpot(inv, d, 0, false)) break;
      }
      DR.emit('cargo', 'STORAGE', null); DR.emit('cargo', 'INVENTORY', null);
    }
    return !!G.findSpot(inv, d, 0, false);
  };
  // xếp lại khoang như người chơi kéo đồ: nhấc hết đồ nghề ra, đặt món mới trước rồi đặt lại đồ nghề; không vừa thì trả nguyên trạng
  const strip = i => { const ex = Object.assign({}, i); delete ex.id; delete ex.x; delete ex.y; delete ex.cells; delete ex.uid; delete ex.rot; return ex; };
  PA.fit = (id, extra) => {
    const inv = DR.grid('INVENTORY'), keep = inv.items.slice();
    const eq = inv.items.filter(i => ITEMS[i.id] && (G.typeOf(ITEMS[i.id]) & G.TYPE.EQUIPMENT));
    for (const e of eq) G.remove(inv, e);
    let inst = G.autoPlace(inv, ITEMS[id], extra || {}), ok = !!inst;
    for (const e of eq) if (ok && !G.autoPlace(inv, ITEMS[e.id], strip(e))) ok = false;
    if (!ok) { inv.items.length = 0; for (const k of keep) inv.items.push(k); return null; }
    DR.emit('cargo', 'INVENTORY', inst);
    return inst;
  };
  const anyAberration = () => Object.values(ITEMS).find(i => i.isAberration && (i.minWorldPhaseRequired || 0) <= (DR.s.worldPhase || 0) && (i.entitlementsRequired || ['NONE'])[0] === 'NONE' && i.dims.length <= 3);
  function prepareGrid(name) {
    const c = Q.QuestGridConfig[name];
    if (!c) return;
    const inv = DR.grid('INVENTORY');
    for (const x of c.completeConditions || []) {
      if (x._t === 'ItemCountCondition') {
        const d = ITEMS[x.item];
        const have = inv.items.filter(i => i.id === x.item || (x.allowLinkedAberrations && d && (d.aberrations || []).includes(i.id))).length;
        for (let k = have; k < x.count; k++) giveItem(x.item, 'lưới ' + name);
      } else if (x._t === 'AberrationCountCondition') {
        const have = inv.items.filter(i => ITEMS[i.id] && ITEMS[i.id].isAberration).length;
        for (let k = have; k < x.targetItemCount; k++) giveItem(anyAberration().id, 'lưới ' + name);
      } else if (x._t === 'CellCountOfItemTypeAndSubtypeCondition') {
        const T = G.mask(x.itemType, G.TYPE), Sb = G.mask(x.itemSubtype, G.SUB);
        let cells = inv.items.filter(i => { const d = ITEMS[i.id]; return d && (G.typeOf(d) & T) && (G.subOf(d) & Sb); }).reduce((n, i) => n + ITEMS[i.id].dims.length, 0);
        const f = Object.values(ITEMS).find(d => (G.typeOf(d) & T) && (G.subOf(d) & Sb) && !d.isAberration && (d.entitlementsRequired || ['NONE'])[0] === 'NONE');
        while (cells < x.targetCellCount && f && giveItem(f.id, 'lưới ' + name)) cells += f.dims.length;
      }
    }
  }
  const SG = DRStoryGrid, o = SG.show;
  SG.show = function (name, cb) {
    PA.grids.push(name);
    try { prepareGrid(name); } catch (e) { console.warn('[paudit] prepareGrid', name, e.message); }
    // cờ của lớp bọc cũ (poi.js _poi, questcmds.js _qc) phải còn để chúng không bọc lại
    return o.call(this, name, cb);
  };
  Object.assign(SG.show, { _poi: true, _qc: true });

  // ---- dọn khoang: bỏ cá / đồ lặt vặt không thuộc nhiệm vụ để còn chỗ
  PA.tidy = hard => {
    const inv = DR.grid('INVENTORY'), keep = new Set(PA.keep || []);
    const free = inv.cells ? inv.cells.filter(c => !c.hidden && c.type !== 0).length - inv.items.reduce((n, i) => n + (ITEMS[i.id].dims || []).length, 0) : 99;
    if (!hard && free > 20) return 0;
    let n = 0;
    for (const it of inv.items.slice()) {
      const d = ITEMS[it.id];
      if (!d || keep.has(it.id) || /^quest-|^relic/.test(it.id) || d.subtype === 'RELIC') continue;
      if (d.subtype === 'FISH' || d.subtype === 'TRINKET' || d.subtype === 'MATERIAL' || (PA.gear || []).includes(it.id)) { G.remove(inv, it); n++; }
    }
    // còn chật: cất đồ nhiệm vụ / relic / linh kiện vào Kho (người chơi làm ở bất kỳ bến nào; fetchNeeds lấy ra lại khi đường đi hỏi)
    if (hard && DR.s.grids.STORAGE) {
      const st = DR.grid('STORAGE');
      for (const it of inv.items.slice()) {
        const d = ITEMS[it.id];
        if (!d || keep.has(it.id) || d.subtype === 'RELIC' || (G.typeOf(d) & G.TYPE.EQUIPMENT && !(PA.gear || []).includes(it.id))) continue;
        const ex = Object.assign({}, it); delete ex.id; delete ex.x; delete ex.y; delete ex.cells; delete ex.uid;
        if (G.autoPlace(st, d, ex)) { G.remove(inv, it); n++; }
      }
      DR.emit('cargo', 'STORAGE', null);
    }
    if (n) DR.emit('cargo', 'INVENTORY', null);
    return n;
  };
  // lấy món từ Kho ra khoang
  PA.fromStorage = id => {
    if (!DR.s.grids.STORAGE) return false;
    const st = DR.grid('STORAGE'), it = st.items.find(i => i.id === id);
    if (!it) return false;
    const ex = Object.assign({}, it); delete ex.id; delete ex.x; delete ex.y; delete ex.cells; delete ex.uid;
    if (!DR.give(id, ex)) { PA.tidy(); if (!DR.give(id, ex)) return false; }
    G.remove(st, it); DR.emit('cargo', 'STORAGE', null);
    return true;
  };

  // ---- lưới kéo-thả trong DRCargo (poi.js, questcmds.js): nhận hết hoặc đặt đủ món, rồi đóng
  function questOfKey(key) {
    for (const [n, c] of Object.entries(Q.QuestGridConfig)) if ((c.gridKey && c.gridKey !== 'NONE' ? c.gridKey : 'QUEST_' + (c.asset || 'grid')) === key) return [n, c];
    return [null, null];
  }
  function handleCargo() {
    const dbg = DRCargo._debug();
    if (!dbg) return;
    if (dbg.held) {
      // món Yarn đưa khi khoang đầy (DRYarn.addItem → DRCargo bắt xếp chỗ): dọn khoang, xếp món vào chỗ trống như người chơi đặt,
      // rồi mở lại khoang để bỏ món đang cầm (DRCargo.open đóng phiên cũ bằng close(true))
      // đồ nghề do test đưa (PA.gear) nhường chỗ cho món thật của cốt truyện (vd dredge1 của Collector)
      const invg = DR.grid('INVENTORY');
      for (const it of invg.items.slice()) if ((PA.gear || []).includes(it.id)) G.remove(invg, it);
      PA.gear = [];
      PA.tidy(true);
      const h = DRCargo.held();
      if (h) {
        const ex = Object.assign({}, h); delete ex.id; delete ex.x; delete ex.y; delete ex.cells; delete ex.uid;
        if (DR.give(h.id, ex) || PA.fit(h.id, ex) || (PA.makeRoom(h.id) && (DR.give(h.id, ex) || PA.fit(h.id, ex)))) { PA.trace.push('  · xếp ' + h.id + ' vào khoang'); DRCargo.open({ keys: ['INVENTORY'] }); }
        else if (G.typeOf(ITEMS[h.id]) & G.TYPE.EQUIPMENT && DR.grid('INVENTORY').items.some(i => i.id === h.id)) {
          PA.trace.push('  · bỏ ' + h.id + ' trùng (đã có một cái trong khoang)'); DRCargo.open({ keys: ['INVENTORY'] });
        }
        else PA.trace.push('  ! khoang đầy, không xếp được ' + h.id + ' [' + DR.grid('INVENTORY').items.map(i => i.id).join(',') + ']');
      }
    }
    if (dbg.leftKind === 'quest') {
      const left = dbg.grids.find(g => g.key !== 'INVENTORY' && g.key !== 'STORAGE');
      const [name, c] = left ? questOfKey(left.key) : [null, null];
      if (c && DR.s.grids[left.key]) {
        const g = DR.grid(left.key), inv = DR.grid('INVENTORY');
        const conds = (c.completeConditions || []).filter(x => x._t !== 'EmptyCondition');
        if (name === 'BaitInput' && !g.items.length) {
          const f = inv.items.find(i => ITEMS[i.id] && ITEMS[i.id].subtype === 'FISH') || giveItem('cod', 'BaitInput');
          if (f) { G.remove(inv, f); G.autoPlace(g, ITEMS[f.id], f); }
        } else if (name === 'DogTagInput') {
          for (const t of inv.items.filter(i => i.id === 'quest-dog-tag')) { G.remove(inv, t); G.autoPlace(g, ITEMS[t.id], t); }
        } else if (conds.length) {
          for (const x of conds) {
            if (x._t === 'ItemCountCondition') {
              const d = ITEMS[x.item];
              const match = i => i.id === x.item || (x.allowLinkedAberrations && d && (d.aberrations || []).includes(i.id));
              let have = g.items.filter(match).length;
              for (const i of inv.items.filter(match)) { if (have >= x.count) break; G.remove(inv, i); if (G.autoPlace(g, ITEMS[i.id], i)) have++; }
            } else if (x._t === 'AberrationCountCondition') {
              let have = g.items.filter(i => ITEMS[i.id].isAberration).length;
              for (const i of inv.items.filter(i => ITEMS[i.id].isAberration)) { if (have >= x.targetItemCount) break; G.remove(inv, i); if (G.autoPlace(g, ITEMS[i.id], i)) have++; }
            }
          }
        } else {
          // nhận: chuyển hết sang khoang
          for (const i of g.items.slice()) { const ex = Object.assign({}, i); delete ex.id; delete ex.x; delete ex.y; delete ex.cells;
            if (DR.give(i.id, ex) || (PA.tidy(true), DR.give(i.id, ex))) G.remove(g, i); }
        }
        DR.emit('cargo', left.key, null); DR.emit('cargo', 'INVENTORY', null);
        DRCargo.refresh();
      }
    }
    // chợ: bán một con cá như bấm F (ghi giao dịch: GetNumShopTransactionDaysUnique, Intro_Sell)
    const sh = window.DRShop && DRShop._debug();
    PA.trace.push('  · khoang mở: ' + dbg.leftKind + (sh ? ' ' + sh.dest + ' ' + sh.cls : ''));
    if (sh && sh.cls === 'MarketDestination' && !PA.sold) {                  // chợ cá không có bảng hàng bên trái (left = null)
      const inv = DR.grid('INVENTORY'), f = inv.items.find(i => ITEMS[i.id] && ITEMS[i.id].subtype === 'FISH' && !ITEMS[i.id].isAberration && !(PA.keep || []).includes(i.id) && DRShop.accepts(sh.dest, ITEMS[i.id]));
      if (f) { DRYarn.sellInsts([['INVENTORY', f]], 1, sh.dest); PA.sold = true; }
    }
    DRCargo.close();
  }

  // ---- bơm hội thoại / giao diện tới khi yên
  PA.pump = (goal, ms) => new Promise(resolve => {
    const d = goal ? dist(goal) : {}, tried = {}, t0 = performance.now();
    let idle = 0, lastOpt = 0, optKey = '', optAt = 0;
    const exitBtn = () => document.querySelector('#dr-dlg .sg-panel [data-act="take"]') || document.querySelector('#dr-dlg .sg-panel [data-act="deliver"]:not([disabled])') || document.querySelector('#dr-dlg .sg-panel [data-act="leave"]');
    const timer = setInterval(() => {
      try {
        if (performance.now() - t0 > (ms || 90000)) { clearInterval(timer); resolve({ timeout: true }); return; }
        if (window.DRMinigame && DRMinigame.isOpen && DRMinigame.isOpen()) { idle = 0; return; }
        if (DRCargo.isOpen()) { idle = 0; handleCargo(); return; }
        const sg = document.querySelector('#dr-dlg .sg-panel');
        if (sg && sg.style.display !== 'none') { idle = 0; const b = exitBtn(); if (b) b.click(); return; }
        if (window.DRResearch && DRResearch.isOpen()) { idle = 0; DRResearch.close(); return; }
        if (window.DRUpgrade && DRUpgrade.isOpen && DRUpgrade.isOpen()) { idle = 0; DRUpgrade.close && DRUpgrade.close(); return; }
        if (DRDialogue.isOpen()) {
          idle = 0;
          const st = DRDialogue.state();
          if (!st) return;
          if (st.kind === 'options') {
            const r = DRYarn.current();
            if (!r || !r.opts || !r.opts.length) return;
            // nút lựa chọn chỉ nhận bấm sau OPT_CLICK_DELAY 0,75 s kể từ lúc hiện (js/dialogue.js: t0 trong closure của nút)
            const ok = r.name + '@' + r.pc + '#' + r.seq;
            if (ok !== optKey) { optKey = ok; optAt = performance.now(); return; }
            if (performance.now() - optAt < 850 || performance.now() - lastOpt < 1000) return;
            lastOpt = performance.now();
            // đích đã chạy (lệnh khớp / node đích đã vào): thôi tìm, ra bằng #exit
            if (goal && !goal.done && ((goal.re && PA.ran.some(c => new RegExp(goal.re).test(c))) || (goal.nodes && goal.nodes.some(n => PA.trace.includes(n))))) goal.done = true;
            let best = -1, bs = Infinity;
            if (!(goal && goal.done)) r.opts.forEach((op, i) => {
              if (!op.available) return;
              const seg = reach(r.name, cfg(r.name).lab[op.dest]);
              let s = Infinity;
              if (goal && goal.re && seg.cmds.some(c => new RegExp(goal.re).test(c))) s = 0;
              for (const j of seg.jumps) if (d[j] != null) s = Math.min(s, d[j] + 1);
              if (goal && goal.nodes && seg.jumps.some(j => goal.nodes.includes(j))) s = 0;
              s += (tried[r.name + '#' + i] || 0) * 3;
              if (s < bs) { bs = s; best = i; }
            });
            if (best < 0 || bs === Infinity) {
              const ex = r.opts.findIndex(op => op.available && (op.line.meta || []).includes('exit'));
              best = ex >= 0 ? ex : r.opts.map((op, i) => op.available ? i : -1).filter(i => i >= 0).pop();
            }
            if (best == null || best < 0) return;
            tried[r.name + '#' + best] = (tried[r.name + '#' + best] || 0) + 1;
            if (tried[r.name + '#' + best] > 8) { PA.trace.push('  ! vòng lặp lựa chọn ở ' + r.name + ', dừng hội thoại'); r.stop(); return; }
            PA.trace.push('  > ' + (r.opts[best].line.text || '').slice(0, 50));
            DRDialogue.choose(best);
          } else DRDialogue.next();
          return;
        }
        const dk = window.DRDock && DRDock._debug();
        if (dk && dk.phase === 'dest') { idle = 0; DRDock.leaveDest(); return; }
        if (++idle > 12) { clearInterval(timer); resolve({ ok: true }); }
      } catch (e) { clearInterval(timer); resolve({ error: e.message }); }
    }, 70);
  });
}

// ====================================================================== lái
async function run(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  const ev = (f, a) => page.evaluate(f, a);
  const lib = '(' + LIB.toString() + ')()';

  async function boot(url) {
    await page.goto(url);
    await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
    await ev(lib);
  }
  // nạp sổ (chuỗi JSON của DR.s) qua nút "Tiếp tục" như người chơi
  async function loadState(json) {
    await ev(s => { DR.save = () => false; localStorage.clear(); localStorage.setItem(DR.saveKey(0), s); }, json);   // trang cũ thôi ghi sổ
    await boot(base + '/games/dredge/index.html');
    const cont = await page.click('#btn-continue', { timeout: 5000 }).then(() => true, () => false);
    if (!cont) log('! không có nút Tiếp tục');
    await page.waitForFunction(() => DR.mode === 'sail' || DR.mode === 'dock', null, { timeout: 30000 }).catch(() => {});
    await ev(() => PA.pump(null, 30000));
  }
  await boot(base + '/games/dredge/index.html?fresh=1');
  if (process.env.PA_STATE) {
    // PA_STATE=<tệp>: chơi tiếp từ sổ đã chụp (state.json mà lần chạy trước ghi sau mỗi vòng) để gỡ lỗi nhanh
    await loadState(fs.readFileSync(process.env.PA_STATE, 'utf8'));
    log('nạp sổ ' + process.env.PA_STATE);
  } else {
    await page.click('#btn-new');
    await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
    await ev(() => window.DRIntro && DRIntro.playing && DRIntro.skip());
    await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 15000 }).catch(() => {});
    await ev(() => PA.pump({ re: '^SetQuestStarted Quest_Intro$' }));
  }

  const QUESTS = await ev(() => Object.keys(DR_QUESTS.QuestData));
  // DLC: thư mục DLC* của dự án AssetRipper (giống tools/progress_audit.py)
  const DLC = new Set(QUESTS.filter(q => /^Quest_(DLC|IceCutter|Icebreaker|TheNarwhal|UnderTheIce|HoodedFigure5)/.test(q)));
  // PA_QUESTS=a,b: chỉ giải các nhiệm vụ này (gỡ lỗi nhanh); mặc định mọi nhiệm vụ gốc
  const BASE = QUESTS.filter(q => !DLC.has(q) && (!process.env.PA_QUESTS || process.env.PA_QUESTS.split(',').includes(q)));
  // cốt truyện chính trước (mở thế giới, Collector), rồi theo thứ tự dữ liệu
  const FIRST = ['Quest_Intro', 'Quest_StrangeFish', 'Quest_Relics', 'Quest_RelicSub1'];
  BASE.sort((a, b) => ((FIRST.indexOf(a) + 1) || 99) - ((FIRST.indexOf(b) + 1) || 99));
  const ONLY = process.env.PA_ONLY ? process.env.PA_ONLY.split(',') : null;

  // ---- đi lại
  // spotId: chỗ đứng phải gần điểm này hơn mọi HarvestPOI khác (DR.view.nearSpot lấy điểm gần nhất)
  async function sailNear(x, z, rMax, spotId) {
    const p = await ev(([x, z, rMax, spotId]) => {
      const others = spotId ? DRSpots.list.filter(s => s.id !== spotId && Math.hypot(s.x - x, s.z - z) < rMax + 6) : [];
      for (let r = 2.5; r <= rMax; r += 0.5) for (let a = 0; a < 6.28; a += 0.25) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (others.some(s => Math.hypot(s.x - px, s.z - pz) <= r)) continue;
        if (DRWorld.sdf(px, pz) > 1.8) return { x: px, z: pz, yaw: Math.atan2(px - x, pz - z) };   // mũi hướng vào đích: yaw π/2 = tiến về (−1, 0) (test/dredge-w6finale.js)
      }
      return null;
    }, [x, z, rMax || 9, spotId || null]);
    if (!p) return false;
    await ev(p => { if (DRDialogue.isOpen()) { const c = DRYarn.current(); if (c) c.stop(); } if (DRCargo.isOpen()) DRCargo.close();
      if (DR.mode === 'dock' && DRDock.isOpen()) DRDock.leave();          // DockUI.Leave (cờ can-show-finale-hijack)
      DR_DEBUG.teleport(p.x, p.z, p.yaw); }, p);
    await sleep(500);
    return true;
  }
  // trả trò chơi về lái thuyền: dừng hội thoại, đóng khoang / chợ / minigame
  async function reset() {
    // thuyền chìm (quái, đâm đá): "Về bến đã lưu" như người chơi, ghi lại lý do
    if (await ev(() => DR.mode === 'over')) {
      log('    ! thuyền chìm: ' + JSON.stringify(await ev(() => PA.deaths.slice(-1)[0])) + ' → Về bến đã lưu');
      await page.click('#btn-reload').catch(() => {});
      await page.waitForFunction(() => DR.mode === 'sail' || DR.mode === 'dock', null, { timeout: 30000 }).catch(() => {});
      await ev(() => PA.pump(null, 20000));
    }
    await ev(() => {
      try { const c = DRYarn.current(); if (c) c.stop(); } catch (e) { /* */ }
      try { if (DRCargo.isOpen()) DRCargo.close(); } catch (e) { /* */ }
      try { if (window.DRMinigame && DRMinigame.isShown && DRMinigame.isShown()) DRMinigame.hide(); } catch (e) { /* */ }
      if (DR.mode === 'harvest') { DRSpots.cur = null; DRSpots.fishing = false; }
      if (DR.mode !== 'sail' && DR.mode !== 'dock') DR.setMode('sail');
      const p = document.querySelector('#dr-pause:not([hidden])'); if (p) document.getElementById('btn-resume').click();
    });
  }
  async function toDock(dockId, goal) {
    // luôn cập bến lại từ ngoài khơi: node gốc của bến (DockUI.Show) chỉ chạy lúc cập bến / rời điểm đến
    await ev(() => { if (DR.mode === 'dock') { if (DRDock.isOpen()) DRDock.leave(); else DR.setMode('sail'); } });
    const dk = await ev(id => { const d = DRDocks.byId[id]; return d && { x: d.poi.x, z: d.poi.z }; }, dockId);
    if (!dk) return false;
    await ev(() => { if (DRDialogue.isOpen()) { const c = DRYarn.current(); if (c) c.stop(); } });
    await ev(() => DR_DEBUG.setTime(0.4));
    for (let r = 3; r <= 12; r += 4) {
      if (!(await sailNear(dk.x, dk.z, r + 4))) continue;
      const near = await page.waitForFunction(() => DR.view.nearDock, null, { timeout: 3000 }).then(() => true, () => false);
      if (!near) continue;
      await page.keyboard.press('Space');
      const ok = await page.waitForFunction(id => DR.mode === 'dock' && DR.s.dock === id, dockId, { timeout: 25000 }).then(() => true, () => false);
      if (ok) { await sleep(400); await ev(g => PA.pump(g, 90000), goal); return true; }
    }
    log('    ! không cập được bến ' + dockId + ': ' + JSON.stringify(await ev(() => ({ mode: DR.mode, dlg: DRDialogue.isOpen(), cargo: DRCargo.isOpen(), poi: DRPoi._debug().active, near: DR.view.nearDock, docking: !!DRDocks.docking, auto: !!DRBoat.auto }))));
    await reset();
    return false;
  }
  async function enter(e, goal) {
    await reset();
    if (e.kind === 'poi') {
      await ev(() => { if (DR.mode === 'dock') DR.setMode('sail'); });
      await sailNear(e.x, e.z, Math.max(4, e.r - 0.5));
      let near = await page.waitForFunction(id => DRPoi._debug().near === id, e.id, { timeout: 4000 }).then(() => true, () => false);
      if (near) await page.keyboard.press('KeyF');
      else { log('    ! POI ' + e.id + ': không tới được vùng tương tác, gọi DRPoi.start'); await ev(id => DRPoi.start(id), e.id); }
      await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
      await ev(g => PA.pump(g, 90000), goal);
      return true;
    }
    if (!(await toDock(e.dock, goal))) return false;
    if (e.kind === 'dock') return true;
    await page.waitForFunction(() => DRDock._debug() && DRDock._debug().phase === 'ui', null, { timeout: 8000 }).catch(() => {});
    await sleep(900);
    const sel = e.kind === 'speaker' ? '.dk-speaker[data-speaker="' + e.speaker + '"]' : '.dk-dest[data-dest="' + e.dest + '"]';
    let ok = await page.click(sel, { timeout: 3000 }).then(() => true, () => false);
    if (!ok) {
      // nút có trong DOM nhưng bị lớp khác che (thông báo, bảng): bấm thẳng phần tử
      const info = await ev(sel => { const b = document.querySelector(sel); if (b) b.click(); return { has: !!b, dk: DRDock._debug(), cargo: DRCargo.isOpen(), dlg: DRDialogue.isOpen() }; }, sel);
      ok = info.has;
      if (!ok) { log('    ! không có nút ' + sel + ' ở ' + e.dock + ': ' + JSON.stringify(info)); return false; }
    }
    await sleep(300);
    await ev(g => PA.pump(g, 120000), goal);
    return true;
  }

  // ---- lấy món ở HarvestPOI (relic, khung cối...): lái tới điểm, Space, catchNow
  const harvFail = {};
  async function harvest(id) {
    const day = await ev(() => Math.floor(DR.s.time));
    if (harvFail[id] === day) return false;
    harvFail[id] = day;                                     // một lần mỗi ngày cho mỗi món
    for (let k = 0; k < 2; k++) {
      if (await ev(id => DR.grid('INVENTORY').items.some(i => i.id === id), id)) return true;
      const sp = await ev(id => { const b = DR.s.boat; return DR_DEBUG.spotNear([id], b.x, b.z); }, id);
      if (!sp) { log('    ! không có HarvestPOI nào cho ' + id); return false; }
      const gear = await ev(id => {
        const d = DR_ITEMS[id], ht = d.harvestableType;
        if (DRYarn.functions.GetHasEquipmentForHarvestType(ht)) return null;
        const g = Object.values(DR_ITEMS).find(e => (e.harvestableTypes || []).includes(ht) && !/^tir-/.test(e.id));
        if (g) { PA.give(g.id, 'đồ nghề ' + ht + ' để lấy ' + id); (PA.gear = PA.gear || []).push(g.id); }
        return g && g.id;
      }, id);
      if (gear) log('    · đưa đồ nghề ' + gear + ' cho ' + id);
      const night = !(sp.items || []).includes(id);
      await ev(n => { if (DR.mode === 'dock') DR.setMode('sail'); DR_DEBUG.setTime(n ? 0.9 : 0.45); }, night);
      await ev(() => { if (DR.mode === 'dock') DR.setMode('sail'); });
      if (!(await sailNear(sp.x, sp.z, Math.max(3, (sp.r || 4) * 0.9), sp.id))) {
        // điểm sát bờ / trong lạch hẹp: đặt thuyền ở nước rộng gần nhất (≤ 18 m), mũi hướng vào điểm, giữ W tới khi vào tầm (lái thật)
        let ok = false;
        if (await sailNear(sp.x, sp.z, 18)) {
          await page.keyboard.down('KeyW');
          for (let t = 0; t < 40 && !ok; t++) { await sleep(150); ok = await ev(id => (DR.view.nearSpot || {}).id === id, sp.id); }
          await page.keyboard.up('KeyW');
          await sleep(500);
        }
        if (!ok) {
          log('    ! điểm ' + sp.id + ' không có nước quanh / lái không tới');
          if (await clearDebris(sp)) continue;
          break;
        }
      }
      if (!(await page.waitForFunction(id => (DR.view.nearSpot || {}).id === id, sp.id, { timeout: 4000 }).then(() => true, () => false))) { log('    ! không tới gần được điểm ' + sp.id + ' (gần ' + JSON.stringify(await ev(() => DR.view.nearSpot && DR.view.nearSpot.id)) + ')'); continue; }
      await ev(id => PA.makeRoom(id), id);                     // món câu được phải có chỗ, không thì rơi khi đóng khoang
      await page.keyboard.press('Space');
      if (!(await page.waitForFunction(() => DR.mode === 'harvest', null, { timeout: 5000 }).then(() => true, () => false))) { log('    ! không vào được màn câu ở ' + sp.id + ': ' + JSON.stringify(await ev(() => DR.view.nearSpot))); continue; }
      for (let j = 0; j < 4; j++) {
        const got = await ev(id => { DR_DEBUG.catchNow(); return DR.grid('INVENTORY').items.some(i => i.id === id); }, id);
        await sleep(400);
        if (got || !(await ev(() => DR.mode === 'harvest'))) break;
      }
      await ev(() => { if (DR.mode === 'harvest') { try { DRMinigame.hide(); } catch (e) { /* */ } if (DRCargo.isOpen()) DRCargo.close(); DRSpots.cur = null; DRSpots.fishing = false; DR.setMode('sail'); } });
      await sleep(300);
    }
    return ev(id => DR.grid('INVENTORY').items.some(i => i.id === id), id);
  }
  // điểm câu sau mảng đá chặn lối (ExplosivePOI): có thuốc nổ thì tới mảng đá gần nhất, F, chọn nổ (Explosives_Choice → DetonateExplosives)
  async function clearDebris(sp) {
    const e = await ev(sp => {
      const L = (window.DRExplosives && DRExplosives.list) || [];
      const c = L.filter(x => !DRExplosives.isDetonated(x.id)).map(x => [x, Math.hypot(x.x - sp.x, x.z - sp.z)]).sort((a, b) => a[1] - b[1])[0];
      return c && c[1] < 70 ? { id: c[0].id, d: c[1] } : null;
    }, sp);
    if (!e) return false;
    // thuốc nổ bán ở Whaling Yards sau Hermitage (ShopData.Explosives, dialogueLinked): chưa xong Hermitage thì người chơi chưa có
    const can = await ev(() => DRQuests.isCompleted('Quest_Hermitage') || DRQuests.isStepCompleted('Hermitage_DetonateExplosives'));
    if (!can) { log('    ! mảng đá ' + e.id + ' chặn điểm ' + sp.id + ', chưa mua được thuốc nổ'); return false; }
    await ev(() => { if (!DR.grid('INVENTORY').items.some(i => i.id === 'explosives')) PA.give('explosives', 'mua ở Whaling Yards để nổ mảng đá'); });
    const poi = await ev(id => { const p = DRPoi.extra.find(x => x.id === id || x.eid === id) || DRPoi.extra.find(x => x.path && x.path.includes('[' + id + ']')); return p && { kind: 'poi', id: p.id, node: p.node, x: p.x, z: p.z, r: p.r || 7 }; }, e.id);
    if (!poi) { log('    ! không thấy POI của mảng đá ' + e.id); return false; }
    log('    · nổ mảng đá ' + e.id + ' (cách điểm ' + Math.round(e.d) + ' m)');
    await enter(poi, { re: '^DetonateExplosives$' });
    return ev(id => DRExplosives.isDetonated(id), e.id);
  }
  // món chỉ có từ lưới nhiệm vụ (CREATE preset) hoặc AddItemById: tìm node mở lưới / đưa món, đi tới đó (Chunk of Flesh ở Trap_InspectCorpse...)
  const acquired = {};
  async function acquire(id, why) {
    const day = await ev(() => Math.floor(DR.s.time));
    if (acquired[id] === day) return false;
    acquired[id] = day;
    const re = await ev(id => {
      const g = Object.entries(DR_QUESTS.QuestGridConfig).filter(([, c]) => ((c.presetGrid || {}).spatialItems || []).some(x => x.id === id)).map(([n]) => n);
      return (g.length ? '^ShowQuestGrid (' + g.join('|') + ')$|' : '') + '^AddItemById ' + id + '$';
    }, id);
    const plan = await ev(re => PA.plan({ re }), re);
    if (!plan.length) { log('    ! không có lối nào lấy được ' + id + ' (' + why + ')'); return false; }
    const n0 = await ev(id => DR.grid('INVENTORY').items.filter(i => i.id === id).length, id);
    for (const e of plan.slice(0, 4)) {                       // vd ba bẫy cùng khoảng cách: thử tới khi có món
      log('    · đi lấy ' + id + ' qua ' + e.kind + ' ' + (e.id || e.speaker || e.dest || e.dock) + ' (' + why + ')');
      await enter(e, { re });
      if (await ev(([id, n0]) => DR.grid('INVENTORY').items.filter(i => i.id === id).length > n0, [id, n0])) return true;
    }
    return false;
  }
  // món mà đường tới đích hỏi qua hàm ...ById: cá thì đưa, đồ ở HarvestPOI thì đi lấy
  async function fetchNeeds(goal) {
    const needs = await ev(g => PA.needs(g), goal);
    for (const [id, n] of Object.entries(needs)) {
      if (id === '__debt') {
        const left = await ev(() => { const v = DR.s.vars, d = v['gm-debt'] != null ? v['gm-debt'] : DR_CONFIG.greaterMarrowDebt; return Math.round((d - (v['gm-repayments'] || 0)) * 100) / 100; });
        if (left > 0) {
          // tiền như bán cá; trả ở Mayor_RepayDebt ("trả hết": RepayDebt GM_REPAYMENTS -1)
          await ev(left => { if (DR.s.funds < left) { DR.addFunds(left - DR.s.funds + 1); PA.gave.push('$' + left + ' (trả nợ tàu)'); } }, left);
          const g = { re: '^RepayDebt GM_REPAYMENTS -1$' }, plan = await ev(g => PA.plan(g), g);
          log('    · trả nợ tàu $' + left + ' (' + n.fn + ' ở ' + n.node + ')' + (plan.length ? '' : ': không có lối'));
          if (plan.length) await enter(plan[0], g);
        }
        continue;
      }
      if (id.startsWith('__shop:')) {
        const dest = id.slice(7);
        const where = await ev(dest => {
          const h = (DR.s.shopHistories || {})[dest];
          if (h && h.transactionDays && h.transactionDays.length) return null;
          for (const [did, d] of Object.entries(DR_YARN.docks)) if ((d.dests || []).some(x => x.id === dest) && DRDocks.byId[did]) return did;
          return null;
        }, dest);
        if (where) {
          await ev(() => { if (!DR.grid('INVENTORY').items.some(i => DR_ITEMS[i.id].subtype === 'FISH')) PA.give('cod', 'để bán'); });
          log('    · bán một con cá ở ' + dest + ' (' + n.fn + ' ở ' + n.node + ')');
          await ev(() => { PA.trace = []; PA.sold = false; });
          await enter({ kind: 'dest', dock: where, dest }, null);
          log('      ' + JSON.stringify(await ev(dest => ({ sold: PA.sold, hist: (DR.s.shopHistories || {})[dest], trace: PA.trace.slice(-12).join(' > ') }), dest)));
        }
        continue;
      }
      if (id[0] === '_') {
        const r = await ev(([id, n]) => {
          const inv = DR.grid('INVENTORY').items, F = i => DR_ITEMS[i.id] && DR_ITEMS[i.id].subtype === 'FISH';
          if (id === '__fish' && !inv.some(F)) { PA.give('cod', n.fn + ' ở ' + n.node); return 'cod'; }
          if (id === '__trophy' && !inv.some(i => F(i) && i.size >= (DR_CONFIG.trophyMaxSize || 0.85))) { PA.give('cod', n.fn + ' ở ' + n.node, { size: 0.95 }); return 'cod cúp'; }
          if (id === '__aberrant' && !inv.some(i => F(i) && DR_ITEMS[i.id].isAberration)) {
            const a = Object.values(DR_ITEMS).find(x => x.isAberration && (x.minWorldPhaseRequired || 0) <= (DR.s.worldPhase || 0) && (x.entitlementsRequired || ['NONE'])[0] === 'NONE' && x.dims.length <= 4);
            if (a) { PA.give(a.id, n.fn + ' ở ' + n.node); (PA.keep = PA.keep || []).push(a.id); return a.id; }
          }
          return null;
        }, [id, n]);
        if (r) log('    · đưa ' + r + ' (' + n.fn + ' ở ' + n.node + ')');
        continue;
      }
      const info = await ev(([id, n]) => {
        const d = DR_ITEMS[id], fr = i => (i.fresh == null ? DR_CONFIG.maxFreshness : i.fresh);
        const inRange = i => n.fn !== 'GetNumFishByIdAndCondition' || (fr(i) >= +n.args[1] && fr(i) < +n.args[2]);
        const have = DR.grid('INVENTORY').items.filter(i => i.id === id && inRange(i)).length + (DR.s.grids.STORAGE && n.fn !== 'GetNumFishByIdAndCondition' ? DR.grid('STORAGE').items.filter(i => i.id === id).length : 0);
        const harv = DRSpots.list.some(s => (s.d.items || []).concat(s.d.nightItems || []).includes(id));
        if (harv && /^(quest-|relic)/.test(id) && !have && (DR.s.itemsOwned || []).includes(id)) return { have: 1, inv: 1 };
        // món nhiệm vụ một lần (quest-*) đã từng có thì đã nộp rồi: không đi tìm lại
        // món HarvestPOI một lần (quest-*, relic*) đã từng có thì đã nộp rồi: không đi tìm lại (lưới nhiệm vụ thì vẫn tìm: quest-corpse ×3)
        return { have, inv: DR.grid('INVENTORY').items.filter(i => i.id === id).length, fish: d.subtype === 'FISH' && !/^quest-/.test(id), harv, fn: n.fn, args: n.args };
      }, [id, n]);
      if (info.have) { if (info.inv === 0) await ev(id => PA.fromStorage(id), id); continue; }
      if (info.fish) {
        await ev(([id, n]) => {
          let fresh;
          if (n.fn === 'GetNumFishByIdAndCondition') fresh = +n.args[1] + 0.01;          // (id, lo, hi): độ tươi trong [lo, hi)
          PA.give(id, n.fn + ' ở ' + n.node, fresh != null ? { fresh } : null);
        }, [id, n]);
        log('    · đưa ' + id + ' (' + n.fn + ' ở ' + n.node + ')');
      } else if (info.harv) {
        log('    · đi lấy ' + id + ' ở HarvestPOI (' + n.fn + ' ở ' + n.node + ')');
        await harvest(id);
      } else await acquire(id, n.fn + ' ở ' + n.node);
    }
  }

  // ---- đích của nhiệm vụ lúc này
  async function goalOf(q) {
    return ev(q => {
      const QD = DR_QUESTS.QuestData[q], S = DR_QUESTS.QuestStepData, st = DRQuests.state(q), e = DR.s.quests[q];
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (st === 'COMPLETED') return null;
      if (st === 'UNAVAILABLE') return { kind: 'start', re: '^(SetQuestStarted|SetQuestStartedSilent|SetQuestAvailable) ' + esc(q) + '$', auto: !!QD.canBeOfferedAutomatically };
      const sid = e.activeStepId, sd = S[sid] || {};
      const parts = ['^SetQuestStepCompleted(Silent)? ' + esc(sid) + '$', '^SetQuestCompleted(WithResolution)? ' + esc(q) + '( \\d+)?$'];
      if (st === 'OFFERED') parts.push('^(SetQuestStarted|SetQuestStartedSilent) ' + esc(q) + '$');
      return { kind: 'step', step: sid, re: parts.join('|'), auto: sd.allowAutomaticCompletion ? (sd.completeConditions || []) : null };
    }, q);
  }
  // điều kiện tự xong: đưa / lấy món
  async function satisfyAuto(conds) {
    for (const c of conds) {
      const id = c.itemId;
      if ((c._t === 'ItemInventoryCondition' || c._t === 'ItemSeenCondition' || c._t === 'ItemNetCondition') && id) {
        const have = await ev(id => DR.grid('INVENTORY').items.some(i => i.id === id) || (DR.s.itemsOwned || []).includes(id), id);
        if (have && c._t !== 'ItemInventoryCondition') continue;
        if (await ev(id => DR.grid('INVENTORY').items.some(i => i.id === id) || PA.fromStorage(id), id)) continue;
        const kind = await ev(id => ({ fish: DR_ITEMS[id].subtype === 'FISH', harv: DRSpots.list.some(s => (s.d.items || []).concat(s.d.nightItems || []).includes(id)) }), id);
        if (kind.harv) { log('    · đi lấy ' + id + ' (' + c._t + ')'); await harvest(id); }
        else if (kind.fish) { await ev(id => PA.give(id, 'điều kiện tự xong'), id); log('    · đưa ' + id + ' (' + c._t + ')'); }
        else await acquire(id, c._t);
      } else if (c._t === 'AberrantItemInventoryCondition') {
        // chỉ khi js/progress.js đã cho bắt cá dị dạng (AberrationEnabler.cs:17-24, ngày 4): trước đó người chơi không thể có
        await ev(() => { if (DR.s.vars['can-catch-aberrations'] && !DR.grid('INVENTORY').items.some(i => DR_ITEMS[i.id].isAberration)) PA.give(Object.values(DR_ITEMS).find(i => i.isAberration && i.dims.length <= 3 && (i.minWorldPhaseRequired || 0) <= (DR.s.worldPhase || 0)).id, 'AberrantItemInventoryCondition'); });
      }
    }
    await ev(() => DRQuests.evaluate());
  }
  const sig = () => ev(() => [Object.keys(DR.s.quests).sort().map(k => k + DR.s.quests[k].state + (DR.s.quests[k].completedStepIds || []).length).join(''), DR.s.worldPhase, Math.floor(DR.s.time),
    DR.s.availableSpeakers.length, DR.s.availableDestinations.length, DR.grid('INVENTORY').items.filter(i => /^quest-|^relic/.test(i.id)).map(i => i.id).sort().join(',')].join('|'));
  const qsum = q => ev(q => { const e = DR.s.quests[q]; return e ? e.state + ':' + e.activeStepId + ':' + e.completedStepIds.length : 'UNAVAILABLE'; }, q);

  // ---- vòng giải
  const lastTry = {}, stuck = {};
  const T0 = Date.now(), BUDGET = +(process.env.PA_BUDGET_MIN || 45) * 60000;
  let idlePasses = 0;
  for (let pass = 0; pass < 60 && Date.now() - T0 < BUDGET; pass++) {
    let progress = false;
    const left = [];
    for (const q of BASE) {
      const g = await goalOf(q);
      if (!g) continue;
      left.push(q);
      const before = await qsum(q);
      if (g.kind === 'step' && /^SoldierSubMonster\d_Wait$/.test(g.step)) {
        // cối bắn khi hoạt ảnh bẫy (20,567 s) chạy xong: MortarQuestStepAnimatorTriggerable.cs:23
        await ev(() => { if (DR.mode === 'dock') DR.setMode('sail'); });
        await page.waitForFunction(s => DRQuests.isStepCompleted(s), g.step, { timeout: 40000 }).catch(() => {});
      }
      if (g.auto && g.auto.length) await satisfyAuto(g.auto);
      if ((await qsum(q)) !== before) { progress = true; log(q + ': ' + before + ' -> ' + (await qsum(q)) + ' (tự xong)'); continue; }
      const s = await sig();
      if (lastTry[q + g.re] === s) continue;
      if ((stuck[q + g.re] || 0) >= 3) continue;           // 3 ngày liền không tiến: coi là kẹt, báo ở cuối
      lastTry[q + g.re] = s;
      const plan = await ev(gg => PA.plan(gg), g);
      if (!plan.length) { log(q + ': chưa có lối vào hiện cho ' + g.re); continue; }
      await ev(() => { PA.keep = []; PA.tidy(); });      // dọn trước, rồi mới đưa món đường đi hỏi (không thì dọn mất)
      await fetchNeeds(g);
      for (const e of plan.slice(0, 4)) {
        await ev(() => { PA.ran = []; PA.trace = []; PA.sold = false; });
        log(q + ' [' + (g.step || g.kind) + '] qua ' + e.kind + ' ' + (e.speaker || e.dest || e.id || '') + ' @' + (e.dock || '') + ' node ' + e.node + ' (cách ' + e.d + ')');
        await enter(e, g);
        const after = await qsum(q);
        const ran = await ev(() => PA.ran.slice());
        log('    ran: ' + ran.join(' | ') + '  trace: ' + (await ev(() => PA.trace.slice(-25).join(' > '))));
        if (after !== before) { progress = true; log('    ' + before + ' -> ' + after); break; }
      }
      if ((await qsum(q)) === before) stuck[q + g.re] = (stuck[q + g.re] || 0) + 1; else delete stuck[q + g.re];
    }
    fs.writeFileSync(path.join(OUT, 'state.json'), await ev(() => JSON.stringify(DR.s)));
    if (!left.length) break;
    // mỗi vòng qua một ngày (GetDaysSince..., DayCondition, AberrationEnabler ngày 4); 5 vòng liền không tiến thì dừng
    idlePasses = progress ? 0 : idlePasses + 1;
    if (progress) for (const k of Object.keys(stuck)) delete stuck[k];   // thế giới đổi: thử lại cả những đích từng kẹt
    if (idlePasses > 5) break;
    await ev(() => { if (DR.mode === 'dock') { if (DRDock.isOpen()) DRDock.leave(); else DR.setMode('sail'); } DR.s.time += 1; });
    log('— qua ngày ' + (await ev(() => Math.floor(DR.s.time))) + ', còn ' + left.length + ' nhiệm vụ');
    await sleep(1500);
  }

  // ---- kết quả từng nhiệm vụ
  const summary = await ev(B => B.map(q => [q, DRQuests.state(q), (DR.s.quests[q] || {}).activeStepId || '']), BASE);
  for (const [q, st, step] of summary) {
    if (ONLY && !ONLY.includes(q)) continue;
    check(q + ' COMPLETED', st === 'COMPLETED', st === 'COMPLETED' ? '' : st + ' @' + step);
  }
  const gave = await ev(() => PA.gave.slice());
  out.push('  · món đưa thẳng (' + gave.length + '): ' + [...new Set(gave)].slice(0, 60).join(', '));
  out.push('  · lưới nhiệm vụ đã mở: ' + (await ev(() => [...new Set(PA.grids)].join(', '))));

  // ---- cảnh kết
  const snap = await ev(() => JSON.stringify(DR.s));
  fs.writeFileSync(path.join(OUT, 'before-finale.json'), snap);
  // đi tới khi node đã chạy: lối vào gần nhất, món đường đi hỏi, hết lối thì qua ngày (chuỗi sách của Collector, OldMayor...)
  async function reachNode(node, tries) {
    for (let k = 0; k < (tries || 8); k++) {
      if (await ev(n => DRYarn.visited(n), node)) return true;
      const g = { nodes: [node] };
      const plan = await ev(g => PA.plan(g), g);
      if (plan.length) {
        await ev(() => { PA.keep = []; PA.tidy(); });
        await fetchNeeds(g);
        for (const e of plan.slice(0, 3)) {
          await ev(() => { PA.ran = []; PA.trace = []; });
          await enter(e, g);
          log('  ' + node + ' qua ' + e.kind + ' ' + (e.id || e.speaker || e.dest || e.dock) + ': ' + (await ev(() => PA.trace.slice(-14).join(' > '))));
          if (await ev(n => DRYarn.visited(n), node)) return true;
        }
      } else log('  ' + node + ': chưa có lối vào');
      await ev(() => { if (DR.mode === 'dock') { if (DRDock.isOpen()) DRDock.leave(); else DR.setMode('sail'); } DR.s.time += 1; });
    }
    return ev(n => DRYarn.visited(n), node);
  }
  async function ending(steps, finNode, tag) {
    await ev(() => { DRFinale.timeScale = 10; if (window.DRMenus && DRMenus.credits) DRMenus.credits.timeScale = 25; });
    for (const st of steps) {
      const ok = await reachNode(st);
      check('cảnh kết ' + tag + ': chạy ' + st, ok, ok ? '' : await ev(() => PA.trace.slice(-10).join(' > ')));
      if (!ok) return;
    }
    const plan = await ev(n => PA.plan({ nodes: [n] }), finNode);
    if (!plan.length) { check('cảnh kết ' + tag + ': Finale_Root hiện', false); return; }
    await enter(plan[0], { nodes: [finNode] });
    const reached = await ev(n => DRYarn.visited(n) || PA.trace.includes(n), finNode);
    check('cảnh kết ' + tag + ': tới ' + finNode + ' qua ' + plan[0].kind + ' ' + (plan[0].id || plan[0].node), reached, await ev(() => PA.trace.slice(-6).join(' > ')));
    const title = await page.waitForFunction(() => { const t = document.getElementById('dr-title'); return t && !t.hidden && getComputedStyle(t).display !== 'none'; }, null, { timeout: 120000 }).then(() => true, () => false);
    check('cảnh kết ' + tag + ': cảnh cuối + credits chạy xong, về màn tiêu đề', title, JSON.stringify(await ev(() => window.DRFinale && DRFinale.state && { cut: !!DRFinale.state().cut, voyage: DRFinale.state().voyage })));
  }
  const relicsDone = await ev(() => DRQuests.state('Quest_Relics') === 'COMPLETED' || DRYarn.visited('Collector_AllRelicsFound'));
  check('đủ 5 relic trước cảnh kết (Quest_Relics xong hoặc Collector_AllRelicsFound)', relicsDone);
  if (process.env.PA_ENDING !== 'good') await ending(['Collector_PickupAccept'], 'Finale_BadRegular', 'xấu');   // PA_ENDING=good: chỉ kết tốt
  // nạp lại sổ trước cảnh kết cho kết tốt
  await loadState(snap);
  // kết tốt: gặp Old Mayor ở trại (OldMayor_Intro mở câu hỏi về sách), Lighthouse Keeper hỏi sách (LighthouseKeeper_BookAsk), sách của Collector (Collector_Book1..5 → Collector_Revealed) rồi Lighthouse Keeper ("I have the book.")
  await ending(['OldMayor_Intro', 'LighthouseKeeper_BookAsk', 'Collector_Revealed', 'LighthouseKeeper_FinaleAccepted'], 'Finale_Good', 'tốt');

  out.push('  · lệnh Yarn còn stub: ' + (await ev(() => DRYarn.stubs().join(', '))));
  const errs = errors.filter(e => !/favicon/.test(e));
  check('không có pageerror / console error / HTTP >= 400', errs.length === 0, errs.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  try { await run(browser, base); } catch (e) { fail++; out.push('  ✘ lỗi bất ngờ: ' + (e && e.stack || e)); }
  await browser.close();
  if (srv) srv.close();
  console.log('DREDGE paudit — ' + base);
  console.log(out.join('\n'));
  console.log('\nNhật ký: ' + LOG);
  console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
