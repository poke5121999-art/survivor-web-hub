/*
 * Máy ảo Yarn Spinner 2.2 (VirtualMachine.cs của Yarn Spinner 2.2.0, bản trong Plugins/YarnSpinner.dll của DREDGE)
 * chạy chương trình đã biên dịch DR_YARN (tools/yarn.py bóc từ Dredge.asset), cộng sổ lệnh/hàm của DREDGE
 * (DredgeDialogueRunner.cs:38-176 và các AddCommandHandler rải rác: AchievementManager, BanishMachine, DSAltarFlame,
 * FinaleCutsceneLogic, FinaleLookAtCam, FinalePOIEnabler, LighthouseBeam, PortraitVFXEnabler).
 *
 *   const r = DRYarn.run('GreaterMarrow_Root', view)   view = { line(l, next), options(opts, choose), end(), portrait(id), hidePortrait(), clear() }
 *   l = { id, text, raw, character (MAYOR_NAME_KEY), speaker (tên SpeakerData), meta: [...], auto, immediate }
 *   opts = [{ index, id, text, meta, available }]
 *   DRYarn.visited(node)  DRYarn.lineText(id)  DRYarn.commands / DRYarn.functions (sổ đăng ký)  DRYarn.missing (lệnh chưa có hệ thống)
 *
 * Sổ lưu: DR.s.visitedNodes (SaveData.visitedNodes: tên node xong + id lựa chọn đã bấm), DR.s.yarnVars (InMemoryVariableStorage),
 * DR.s.temporalMarkers {id: timeAndDay}, DR.s.shopHistories {id: {visits, visitDays[], transactionDays[], total}},
 * DR.s.itemTransactions {id: {sold, bought}}, DR.s.availableDestinations[], DR.s.availableSpeakers[], DR.s.vars (bool/int của SaveData).
 */
(function (root) {
  'use strict';
  const Y = root.DR_YARN;
  const OP = { JumpTo: 0, Jump: 1, RunLine: 2, RunCommand: 3, AddOption: 4, ShowOptions: 5, PushString: 6, PushFloat: 7,
    PushBool: 8, PushNull: 9, JumpIfFalse: 10, Pop: 11, CallFunc: 12, PushVariable: 13, StoreVariable: 14, Stop: 15, RunNode: 16 };
  const DR = () => root.DR;
  const S = () => root.DR.s;
  const G = root.DRGrid;

  // ------------------------------------------------------------ sổ lưu
  function ensure(s) {
    s = s || S();
    if (!s) return s;
    if (!Array.isArray(s.visitedNodes)) s.visitedNodes = [];
    if (!s.yarnVars) s.yarnVars = {};
    if (!s.temporalMarkers) s.temporalMarkers = {};
    if (!s.shopHistories) s.shopHistories = {};
    if (!s.itemTransactions) s.itemTransactions = {};
    if (!Array.isArray(s.availableDestinations)) s.availableDestinations = [];
    if (!Array.isArray(s.availableSpeakers)) s.availableSpeakers = [];
    if (!Array.isArray(s.ownedNonSpatial)) s.ownedNonSpatial = [];
    if (!s.vars) s.vars = {};
    return s;
  }
  const visited = n => ensure().visitedNodes.includes(n);
  function markVisited(n) {
    const v = ensure().visitedNodes;
    if (!v.includes(n)) v.push(n);
    DR().emit('nodeVisited', n);
  }

  // ------------------------------------------------------------ dòng chữ
  const lineText = id => (Y && Y.lines[id]) || '';
  // DialogueRunner: "TÊN_KEY: câu" → CharacterName + TextWithoutCharacterName; "\[" là ký tự [ thật
  function parseLine(id) {
    let raw = lineText(id);
    let character = null;
    const m = raw.match(/^([A-Z0-9_]+): /);
    if (m) { character = m[1]; raw = raw.slice(m[0].length); }
    const lookup = ((root.DR_WORLD || {}).SpeakerDataLookup || {}).SpeakerDataLookup;
    const speaker = character && lookup && lookup.lookupTable ? lookup.lookupTable[character.toUpperCase()] || null : null;
    return { id, raw, text: raw.replace(/\\\[/g, '[').replace(/\\\]/g, ']'), character, speaker, meta: (Y && Y.meta[id]) || [] };
  }

  // ------------------------------------------------------------ giá trị (Yarn.Value.ConvertTo)
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    return false;
  }
  function toNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
    return 0;
  }
  function toStr(v) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return String(v);
  }

  // ------------------------------------------------------------ thư viện chuẩn (Yarn.Library + Dialogue.cs StandardLibrary)
  const F = {};
  const fn = (name, f) => { F[name] = f; };
  fn('Number.Add', (a, b) => toNum(a) + toNum(b));
  fn('Number.Minus', (a, b) => toNum(a) - toNum(b));
  fn('Number.Multiply', (a, b) => toNum(a) * toNum(b));
  fn('Number.Divide', (a, b) => toNum(a) / toNum(b));
  fn('Number.Modulo', (a, b) => toNum(a) % toNum(b));
  fn('Number.UnaryMinus', a => -toNum(a));
  fn('Number.EqualTo', (a, b) => toNum(a) === toNum(b));
  fn('Number.NotEqualTo', (a, b) => toNum(a) !== toNum(b));
  fn('Number.GreaterThan', (a, b) => toNum(a) > toNum(b));
  fn('Number.GreaterThanOrEqualTo', (a, b) => toNum(a) >= toNum(b));
  fn('Number.LessThan', (a, b) => toNum(a) < toNum(b));
  fn('Number.LessThanOrEqualTo', (a, b) => toNum(a) <= toNum(b));
  fn('Bool.EqualTo', (a, b) => toBool(a) === toBool(b));
  fn('Bool.NotEqualTo', (a, b) => toBool(a) !== toBool(b));
  fn('Bool.And', (a, b) => toBool(a) && toBool(b));
  fn('Bool.Or', (a, b) => toBool(a) || toBool(b));
  fn('Bool.Xor', (a, b) => toBool(a) !== toBool(b));
  fn('Bool.Not', a => !toBool(a));
  fn('String.EqualTo', (a, b) => toStr(a) === toStr(b));
  fn('String.NotEqualTo', (a, b) => toStr(a) !== toStr(b));
  fn('String.Add', (a, b) => toStr(a) + toStr(b));
  fn('visited', n => visited(toStr(n)));
  fn('visited_count', n => visited(toStr(n)) ? 1 : 0);   // DREDGE chỉ lưu tập node đã xong, không đếm
  fn('random', () => Math.random());
  fn('random_range', (a, b) => Math.floor(toNum(a) + Math.random() * (toNum(b) - toNum(a) + 1)));
  fn('dice', n => 1 + Math.floor(Math.random() * toNum(n)));
  fn('round', n => Math.round(toNum(n)));
  fn('round_places', (n, p) => { const k = Math.pow(10, toNum(p)); return Math.round(toNum(n) * k) / k; });
  fn('floor', n => Math.floor(toNum(n)));
  fn('ceil', n => Math.ceil(toNum(n)));
  fn('inc', n => { n = toNum(n); return Math.floor(n) === n ? n + 1 : Math.ceil(n); });
  fn('dec', n => { n = toNum(n); return Math.floor(n) === n ? n - 1 : Math.floor(n); });
  fn('decimal', n => toNum(n) - Math.trunc(toNum(n)));
  fn('int', n => Math.trunc(toNum(n)));
  fn('string', v => toStr(v));
  fn('number', v => toNum(v));
  fn('bool', v => toBool(v));

  // ------------------------------------------------------------ máy ảo
  let current = null;
  class Runner {
    constructor(view) {
      this.view = view || {};
      this.state = 'Stopped';     // ExecutionState: Stopped, WaitingOnOptionSelection, WaitingForContinue, DeliveringContent, Running
      this.flags = { auto: false, immediate: false, showUnavailable: false, exitDestination: false };
      this.lastGrid = 0;
      this.didLines = false;
      this.done = null;
      this.seq = 0;
    }

    setNode(name) {
      const nd = Y.nodes[name];
      if (!nd) throw new Error('yarn node not found: ' + name);
      // Dialogue.SetNode → ResetState: ngăn xếp và lựa chọn bị xoá khi sang node mới
      this.name = name; this.nd = nd; this.pc = 0; this.stack = []; this.opts = [];
      DR().emit('nodeStart', name);
    }

    start(name) {
      ensure();
      current = this;
      this.setNode(name);
      this.state = 'Running';
      this.loop();
      return this;
    }

    label(l) {
      const at = this.nd.l[l];
      if (at == null) throw new Error('yarn label not found: ' + l + ' in ' + this.name);
      return at;
    }

    continue() {
      if (this.state === 'Stopped') return;
      if (this.state === 'WaitingOnOptionSelection') throw new Error('yarn: cannot continue while waiting for an option');
      this.state = 'Running';
      this.loop();
    }

    loop() {
      while (this.state === 'Running') {
        const ins = this.nd.i[this.pc];
        if (!ins) { this.nodeComplete(); this.finish(); return; }
        this.exec(ins);
        this.pc++;
        if (this.state === 'Running' && this.pc >= this.nd.i.length) { this.nodeComplete(); this.finish(); return; }
      }
    }

    nodeComplete() { markVisited(this.name); }

    finish() {
      if (this.state === 'Ended') return;
      this.state = 'Stopped';
      this.state = 'Ended';
      if (current === this) current = null;
      try { if (this.view.end) this.view.end(this); }
      finally { if (this.done) this.done(this); DR().emit('dialogueEnd', this); }
    }

    stop() { if (this.state !== 'Ended') { this.state = 'Stopped'; this.finish(); } }

    pop() { if (!this.stack.length) throw new Error('yarn stack empty in ' + this.name + ' @' + this.pc); return this.stack.pop(); }
    peek() { if (!this.stack.length) throw new Error('yarn stack empty in ' + this.name + ' @' + this.pc); return this.stack[this.stack.length - 1]; }

    exec(ins) {
      const op = ins[0];
      switch (op) {
        case OP.JumpTo: this.pc = this.label(ins[1]) - 1; break;
        case OP.Jump: this.pc = this.label(toStr(this.peek())) - 1; break;
        case OP.RunLine: {
          const n = ins.length > 2 ? toNum(ins[2]) : 0;
          const subs = []; for (let k = n - 1; k >= 0; k--) subs[k] = toStr(this.pop());
          const l = parseLine(ins[1]);
          if (subs.length) l.text = l.text.replace(/\{(\d+)\}/g, (m, k) => subs[+k] != null ? subs[+k] : m);
          l.auto = this.flags.auto; l.immediate = this.flags.immediate;
          this.flags.auto = false; this.flags.immediate = false;
          this.didLines = true;
          this.state = 'DeliveringContent';
          // LineHandler: view gọi next() khi người chơi bấm tiếp; gọi ngay trong lúc giao dòng thì chạy tiếp luôn
          const seq = ++this.seq;
          let sync = true, early = false;
          const next = () => {
            if (sync) { early = true; return; }
            if (this.state === 'WaitingForContinue' && this.seq === seq) this.continue();
          };
          if (this.view.line) this.view.line(l, next); else early = true;
          sync = false;
          if (this.state === 'DeliveringContent') this.state = early ? 'Running' : 'WaitingForContinue';
          break;
        }
        case OP.RunCommand: {
          let text = ins[1];
          const n = ins.length > 2 ? toNum(ins[2]) : 0;
          if (n) { const subs = []; for (let k = n - 1; k >= 0; k--) subs[k] = toStr(this.pop()); text = text.replace(/\{(\d+)\}/g, (m, k) => subs[+k]); }
          this.state = 'DeliveringContent';
          const seq = ++this.seq;
          let sync = true, waitedDone = false;
          const resume = () => {
            if (sync) { waitedDone = true; return; }
            if (this.state === 'WaitingForContinue' && this.seq === seq) this.continue();
          };
          runCommand(text, this, resume);
          sync = false;
          if (this.state === 'DeliveringContent') {
            if (waitedDone) this.state = 'Running';
            else this.state = 'WaitingForContinue';
          }
          break;
        }
        case OP.AddOption: {
          const n = ins.length > 3 ? toNum(ins[3]) : 0;
          // VirtualMachine.cs AddOption: lấy các giá trị thay thế trước, rồi mới tới giá trị điều kiện <<if>> (toán hạng thứ 4)
          const subs = []; for (let k = n - 1; k >= 0; k--) subs[k] = toStr(this.pop());
          let ok = true;
          if (ins.length > 4 && ins[4]) ok = toBool(this.pop());
          const l = parseLine(ins[1]);
          if (subs.length) l.text = l.text.replace(/\{(\d+)\}/g, (m, k) => subs[+k] != null ? subs[+k] : m);
          this.opts.push({ line: l, dest: ins[2], available: ok });
          break;
        }
        case OP.ShowOptions: {
          if (!this.opts.length) { this.state = 'Stopped'; this.finish(); return; }
          this.state = 'WaitingOnOptionSelection';
          const opts = this.opts.map((o, i) => ({ index: i, id: o.line.id, text: o.line.text, meta: o.line.meta, available: o.available }));
          const choose = i => {
            if (this.state !== 'WaitingOnOptionSelection') return;
            const o = this.opts[i];
            if (!o) throw new Error('yarn option index out of range: ' + i);
            markVisited(o.line.id);   // TextOptionButton.DoSelect ghi id dòng lựa chọn vào visitedNodes
            this.stack.push(o.dest);
            this.opts = [];
            this.state = 'WaitingForContinue';
            this.continue();
          };
          if (this.view.options) this.view.options(opts, choose, this.flags.showUnavailable);
          break;
        }
        case OP.PushString: this.stack.push(ins[1]); break;
        case OP.PushFloat: this.stack.push(toNum(ins[1])); break;
        case OP.PushBool: this.stack.push(!!ins[1]); break;
        case OP.PushNull: this.stack.push(null); break;
        case OP.JumpIfFalse: if (!toBool(this.peek())) this.pc = this.label(ins[1]) - 1; break;
        case OP.Pop: this.pop(); break;
        case OP.CallFunc: {
          const name = ins[1];
          const argc = toNum(this.pop());
          const args = []; for (let k = argc - 1; k >= 0; k--) args[k] = this.pop();
          const f = F[name];
          let ret;
          if (!f) { missingFn(name); ret = 0; }
          else ret = f.apply(this, args);
          if (ret !== undefined) this.stack.push(typeof ret === 'bigint' ? Number(ret) : ret);
          break;
        }
        case OP.PushVariable: {
          const k = ins[1], vars = ensure().yarnVars;
          if (k in vars) this.stack.push(vars[k]);
          else if (Y.init && k in Y.init) this.stack.push(Y.init[k]);
          else throw new Error('yarn variable has no value: ' + k);
          break;
        }
        case OP.StoreVariable: ensure().yarnVars[ins[1]] = this.peek(); break;
        case OP.Stop: this.nodeComplete(); this.state = 'Stopped'; this.finish(); return;
        case OP.RunNode: {
          const to = toStr(this.pop());
          this.nodeComplete();
          this.setNode(to);
          this.pc = -1;
          break;
        }
        default: throw new Error('yarn opcode not supported: ' + op);
      }
    }
  }

  // ------------------------------------------------------------ lệnh
  // Tách như DialogueRunner.SplitCommandText: cách bằng dấu cách, giữ nguyên chuỗi trong ngoặc kép.
  function split(text) {
    const out = []; let cur = '', q = false, any = false;
    for (const ch of text.trim()) {
      if (ch === '"') { q = !q; any = true; continue; }
      if (ch === ' ' && !q) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
      cur += ch;
    }
    if (cur || any) out.push(cur);
    return out;
  }
  const C = {};          // name → { f(args, runner, resume) → 'wait' | undefined, sys: true|false }
  const missing = {};    // lệnh/hàm gọi tới mà game web chưa có hệ thống
  function cmd(name, f, opts) { C[name] = Object.assign({ f }, opts || {}); }
  function stub(name, why) { C[name] = { f: () => { info(name, why); }, stub: true, why }; }
  function info(name, why) {
    missing[name] = (missing[name] || 0) + 1;
    console.info('[yarn] command without a system yet: ' + name + (why ? ' (' + why + ')' : ''));
  }
  function missingFn(name) {
    missing['fn:' + name] = (missing['fn:' + name] || 0) + 1;
    console.info('[yarn] function without a system yet: ' + name);
  }
  function runCommand(text, runner, resume) {
    const a = split(text), name = a.shift();
    const c = C[name];
    if (!c) { info(name, 'unknown command "' + text + '"'); resume(); return; }
    let r;
    try { r = c.f(a, runner, resume); }
    catch (e) { console.error('[yarn] command failed:', text, e); r = undefined; }
    if (r !== 'wait') resume();
  }
  const bool = v => /^true$/i.test(String(v));
  const int = v => parseInt(v, 10) || 0;
  const num = v => parseFloat(v) || 0;

  // ---- tiện ích kho
  const grid = k => (S().grids[k] ? DR().grid(k) : null);
  const itemsIn = (k, id) => { const g = grid(k); return g ? g.items.filter(i => !id || i.id === id) : []; };
  const def = id => (root.DR_ITEMS || {})[id];
  const isFishDef = d => d && !!(G.subOf(d) & G.SUB.FISH);
  const isTrophy = inst => inst.size != null && inst.size >= (root.DR_CONFIG.trophyMaxSize || 0.85);
  function fishWhere(test, keys) {
    const out = [];
    for (const k of keys) for (const it of itemsIn(k)) { const d = def(it.id); if (isFishDef(d) && test(it, d)) out.push([k, it]); }
    return out;
  }
  function removeInst(k, inst) { const g = grid(k); if (g && G.remove(g, inst)) { DR().emit('cargo', k, null); return true; } return false; }
  function toast(t) { if (root.DRHud && DRHud.toast) DRHud.toast(t); }
  const money = v => '$' + Number(v).toFixed(2);

  // ItemManager.SellItems + phần trả nợ của MarketDestinationUI (dùng chung với dock.js)
  function sellInsts(list, mult, shopId) {
    let total = 0;
    for (const [k, inst] of list) {
      const p = root.DRRules ? DRRules.sellPrice(root.DR_CONFIG, def(inst.id), inst, mult == null ? 1 : mult, 1) : (def(inst.id).value || 0);
      if (!removeInst(k, inst)) continue;
      total += p;
      recordItemTransaction(inst.id, true);
      DR().emit('itemSold', inst.id, p);
    }
    total = Math.round(total * 100) / 100;
    if (total) DR().addFunds(total);
    if (shopId) recordShopTransaction(shopId, total);
    return total;
  }
  function recordItemTransaction(id, sold) {
    const t = ensure().itemTransactions[id] = ensure().itemTransactions[id] || { sold: 0, bought: 0 };
    if (sold) t.sold++; else t.bought++;
  }
  function recordShopVisit(id) {
    const h = ensure().shopHistories[id] = ensure().shopHistories[id] || { visits: 0, visitDays: [], transactionDays: [], total: 0 };
    h.visits++;
    const d = Math.floor(S().time);
    if (!h.visitDays.includes(d)) h.visitDays.push(d);
  }
  function recordShopTransaction(id, value) {
    const h = ensure().shopHistories[id] = ensure().shopHistories[id] || { visits: 0, visitDays: [], transactionDays: [], total: 0 };
    h.total = Math.round((h.total + value) * 100) / 100;
    const d = Math.floor(S().time);
    if (!h.transactionDays.includes(d)) h.transactionDays.push(d);
  }

  // DredgeDialogueRunner.AddItemById
  function addItem(id, gridKey) {
    const d = def(id);
    if (!d) { console.warn('[yarn] AddItemById: item not found:', id); return null; }
    const own = ensure().itemsOwned = S().itemsOwned || [];
    if (!own.includes(id)) own.push(id);
    if (/NonSpatial|Message|Book|Researchable/.test(d.cls || '') || d.w == null) {
      S().ownedNonSpatial.push({ id, isNew: true });
      toast('Nhận được: ' + (d.name || id));
      DR().emit('nonSpatial', id);
      return { id };
    }
    const g = grid(gridKey || 'INVENTORY');
    const extra = isFishDef(d) ? { size: 0.5, fresh: root.DR_CONFIG.maxFreshness } : null;
    const inst = g ? G.autoPlace(g, d, extra) : null;
    if (inst) {
      DR().emit('cargo', gridKey || 'INVENTORY', inst);
      toast('Nhận được: ' + d.name);
      if (d.isAberration) S().vars['num-aberrations-caught'] = (S().vars['num-aberrations-caught'] || 0) + 1;
    } else if (root.DRCargo && !gridKey) {
      // khoang đầy: bắt người chơi xếp chỗ hoặc vứt, như lúc câu được cá mà khoang kín
      const holding = Object.assign({ id, rot: 0 }, extra || {});
      DRCargo.open({ keys: ['INVENTORY'], holding, title: 'Khoang thuyền' });
    }
    return inst;
  }

  // ---- DredgeDialogueRunner.cs:59-176
  cmd('AddItemById', a => { addItem(a[0]); });
  cmd('SellItemById', a => {
    const id = a[0]; let n = a.length > 1 ? int(a[1]) : 1; const m = a.length > 2 ? num(a[2]) : 1;
    const list = itemsIn('INVENTORY', id).map(i => ['INVENTORY', i]).concat(itemsIn('TRAWL_NET', id).map(i => ['TRAWL_NET', i]));
    if (n === -1) n = itemsIn('INVENTORY', id).length;
    sellInsts(list.slice(0, n), m);
  });
  cmd('SellSingleTrophyFish', a => { const f = fishWhere(isTrophy, ['INVENTORY', 'TRAWL_NET'])[0]; if (f) sellInsts([f], a.length ? num(a[0]) : 1); });
  cmd('SellSingleAberrantFish', a => { const f = fishWhere((i, d) => !!d.isAberration, ['INVENTORY', 'TRAWL_NET'])[0]; if (f) sellInsts([f], a.length ? num(a[0]) : 1); });
  function removeById(id, n, keys) {
    const d = def(id);
    if (!d) { console.warn('[yarn] RemoveItemById: item not found:', id); return; }
    if (n === -1) n = itemsIn('INVENTORY', id).length;
    let left = n;
    for (const k of keys) for (const inst of itemsIn(k, id)) { if (left === 0) break; if (removeInst(k, inst)) left--; }
    const ns = S().ownedNonSpatial;
    for (let i = ns.length - 1; i >= 0 && left !== 0; i--) if (ns[i].id === id) { ns.splice(i, 1); left--; }
    toast('Đã giao: ' + (d.name || id));
  }
  cmd('RemoveItemById', a => removeById(a[0], a.length > 1 ? int(a[1]) : 1, ['INVENTORY']));
  cmd('RemoveItemByIdInInventoryAndStorage', a => removeById(a[0], -2, ['INVENTORY', 'STORAGE']));
  cmd('RemoveFishByIdAndCondition', a => {
    const [id, lo, hi] = [a[0], num(a[1]), num(a[2])]; let n = int(a[3]);
    if (n === -1) n = itemsIn('INVENTORY', id).length;
    const fr = i => (i.fresh == null ? root.DR_CONFIG.maxFreshness : i.fresh);
    itemsIn('INVENTORY', id).filter(i => fr(i) < hi && fr(i) >= lo).slice(0, n).forEach(i => removeInst('INVENTORY', i));
  });
  cmd('UnlockAbility', a => {
    S().abilities = S().abilities || {};
    if (!S().abilities[a[0]]) { S().abilities[a[0]] = true; DR().emit('ability', a[0]); toast('Mở khoá năng lực: ' + a[0]); }
  });
  cmd('AddItemToGrid', a => { if (grid(a[1])) addItem(a[0], a[1]); else info('AddItemToGrid', 'grid ' + a[1] + ' does not exist in this build'); });
  cmd('ChangeFunds', a => {
    const v = num(a[0]); DR().addFunds(v);
    toast((v >= 0 ? 'Nhận ' : 'Mất ') + money(Math.abs(v)));
  });
  cmd('SetTemporalMarker', a => { const m = ensure().temporalMarkers; if (!(a[0] in m) || bool(a[1])) m[a[0]] = S().time; });
  cmd('RemoveTemporalMarker', a => { delete ensure().temporalMarkers[a[0]]; });
  // PassTime(hours, reasonKey): TimeController.ForcefullyPassTime, đợi trôi xong
  function passTime(hours, reason, resume) {
    if (!(hours > 0)) return;
    let done = false;
    const fin = () => { if (done) return; done = true; resume(); };
    DR().on('passTimeDone', fin);
    DR().emit('passTime', hours, reason || 'OTHER');
    setTimeout(fin, 8000);   // [ĐỀ XUẤT] không có ai trôi giờ thì không kẹt hội thoại
    return 'wait';
  }
  cmd('PassTime', (a, r, resume) => passTime(int(a[0]), a[1], resume));
  cmd('PassTimeUntil', (a, r, resume) => {
    const target = int(a[0]) / 24, t = S().time % 1;
    let d = t > target ? 1 - t + target : t < target ? t - target : 0;   // DredgeDialogueRunner.PassTimeUntil (giữ cả dấu như mã gốc)
    return passTime(d * 24, a[1], resume);
  });
  cmd('AutoResolveNextLine', (a, r) => { r.flags.auto = true; });
  cmd('ImmediatelyResolveNextLine', (a, r) => { r.flags.immediate = true; r.flags.auto = true; });
  cmd('RequestExitDestination', (a, r) => { r.flags.exitDestination = true; });
  cmd('ShowUnavailableOptions', (a, r) => { r.flags.showUnavailable = bool(a[0]); });
  cmd('SetRollDice', a => { ensure().yarnVars.$roll = Math.floor(Math.random() * int(a[0])); });
  function sfxKey(name) {
    const A = root.DR_AUDIO || {};
    const n = String(name).toLowerCase();
    return Object.keys(A).find(k => A[k].orig && A[k].orig.toLowerCase().split('/').pop().replace(/\.(wav|ogg|mp3)$/, '') === n) || null;
  }
  cmd('PlayClip', a => { const k = sfxKey(a.join(' ')); if (k && root.DRAudio) DRAudio.play(k); else info('PlayClip', 'clip "' + a.join(' ') + '" not shipped'); });
  let loopKey = null;
  cmd('PlayLoopingDialogueAudio', a => {
    const k = sfxKey(a.join(' '));
    if (k && root.DRAudio) { if (loopKey) DRAudio.loop(loopKey, 0); loopKey = k; DRAudio.loop(k, 0.8); }
    else info('PlayLoopingDialogueAudio', 'clip "' + a.join(' ') + '" not shipped');
  });
  cmd('StopLoopingDialogueAudio', () => { if (loopKey && root.DRAudio) DRAudio.loop(loopKey, 0); loopKey = null; });
  cmd('ShowQuestGrid', (a, r, resume) => {
    if (!root.DRStoryGrid) { r.lastGrid = 0; info('ShowQuestGrid', a[0]); return; }
    DRStoryGrid.show(a[0], res => { r.lastGrid = res; resume(); });
    return 'wait';
  });
  cmd('ClearQuestGrid', a => {
    const c = ((root.DR_QUESTS || {}).QuestGridConfig || {})[a[0]];
    if (!c) { console.warn('[yarn] ClearQuestGrid: quest grid not found:', a[0]); return; }
    if (c.gridKey && c.gridKey !== 'NONE' && S().grids[c.gridKey]) { S().grids[c.gridKey].items = []; delete S().grids[c.gridKey]._rt; }
  });
  cmd('SellAllItemsInQuestGrid', a => {
    const c = ((root.DR_QUESTS || {}).QuestGridConfig || {})[a[0]];
    if (c && c.gridKey && S().grids[c.gridKey]) sellInsts(itemsIn(c.gridKey).map(i => [c.gridKey, i]), num(a[1]));
    else info('SellAllItemsInQuestGrid', a[0]);
  });
  cmd('ShowPortrait', (a, r) => { if (r.view.portrait) r.view.portrait(a[0]); });
  cmd('HidePortrait', (a, r) => { if (r.view.hidePortrait) r.view.hidePortrait(); });
  cmd('ClearDialogue', (a, r) => { if (r.view.clear) r.view.clear(); });
  function boatVar(key, v, why) { S().vars[key] = v; DR().emit('boatCosmetic', key, v); info(why, 'saved ' + key + '=' + v + ', boat model has no paint/flag slots yet'); }
  cmd('ChangeBoatColor', a => { boatVar(int(a[0]) === 0 ? 'roof-color-index' : 'hull-color-index', int(a[1]), 'ChangeBoatColor'); S().vars['has-changed-boat-colors'] = true; });
  cmd('ChangeBoatFlag', a => boatVar('boat-flag-style', int(a[0]), 'ChangeBoatFlag'));
  cmd('ChangeBoatBunting', a => boatVar('is-boat-bunting-enabled', int(a[0]) !== 0, 'ChangeBoatBunting'));
  cmd('ChangeBoatHorn', a => boatVar('foghorn-style-index', int(a[0]), 'ChangeBoatHorn'));
  cmd('RestartWorldMusic', () => {
    if (!root.DRAudio) return;
    const dk = S().dock && root.DRDocks && DRDocks.byId[S().dock];
    DRAudio.music(dk && dk.music ? dk.music : null);
  });
  cmd('SetQuestAvailable', a => root.DRQuests.offer(a[0]));
  cmd('SetQuestStarted', a => root.DRQuests.start(a[0]));
  cmd('SetQuestStartedSilent', a => root.DRQuests.start(a[0], true));
  cmd('SetQuestCompleted', a => root.DRQuests.complete(a[0]));
  cmd('SetQuestCompletedWithResolution', a => root.DRQuests.complete(a[0], int(a[1])));
  cmd('SetQuestStepCompleted', a => root.DRQuests.completeStep(a[0]));
  cmd('SetQuestStepCompletedSilent', a => root.DRQuests.completeStep(a[0], true));
  cmd('SetActiveTrapState', a => { S().vars['trap-' + int(a[0]) + '-state'] = int(a[1]); });
  cmd('IncreaseWorldPhase', () => { S().worldPhase = (S().worldPhase || 0) + 1; DR().emit('worldPhase', S().worldPhase); });
  cmd('IncreaseTPRWorldPhase', () => { S().vars['tpr-world-phase'] = (S().vars['tpr-world-phase'] || 0) + 1; });
  cmd('SetTIRWorldPhase', a => { S().vars['tir-world-phase'] = int(a[0]); DR().emit('tirWorldPhase', int(a[0])); });
  cmd('RecordRelicHandedIn', () => { S().vars['relics-relinquished'] = (S().vars['relics-relinquished'] || 0) + 1; });
  cmd('SetDestinationAvailable', a => {
    const L = ensure().availableDestinations, on = bool(a[1]), i = L.indexOf(a[0]);
    if (on && i < 0) L.push(a[0]); else if (!on && i >= 0) L.splice(i, 1);
    DR().emit('availability', 'destination', a[0], on);
  });
  cmd('SetSpeakerAvailability', a => {
    const L = ensure().availableSpeakers, on = bool(a[1]), i = L.indexOf(a[0]);
    if (on && i < 0) L.push(a[0]); else if (!on && i >= 0) L.splice(i, 1);
    DR().emit('availability', 'speaker', a[0], on);
  });
  cmd('SetIcebreakerEquipped', a => { S().vars['icebreaker-equipped'] = bool(a[0]); info('SetIcebreakerEquipped', 'no icebreaker model'); });
  // DredgeDialogueRunner.RepayDebt: -1 = trả hết phần còn lại; chỉ trả khi đủ tiền
  cmd('RepayDebt', a => {
    if (a[0] !== 'GM_REPAYMENTS') return;
    const v = S().vars, debt = v['gm-debt'] != null ? v['gm-debt'] : root.DR_CONFIG.greaterMarrowDebt;
    let amt = num(a[1]);
    if (amt === -1) amt = Math.round((debt - (v['gm-repayments'] || 0)) * 100) / 100;
    if (S().funds >= amt) {
      DR().addFunds(-amt);
      v['gm-repayments'] = Math.round(((v['gm-repayments'] || 0) + amt) * 100) / 100;
      toast('Trả nợ: -' + money(amt));
    }
  });
  cmd('ChangeWeather', a => { S().weather = a[0]; DR().emit('weather', a[0]); });
  cmd('RequestImmediateShopRestock', () => { delete S().vars.shopTaken; });
  cmd('RefreshDockVCams', () => { DR().emit('refreshDockVCams'); });
  cmd('SetBoolVariable', a => { S().vars[a[0]] = bool(a[1]); });
  cmd('SetIntVariable', a => { S().vars[a[0]] = int(a[1]); });
  cmd('AdjustIntVariable', a => { S().vars[a[0]] = (int(S().vars[a[0]]) || 0) + int(a[1]); });
  cmd('SetHasFlag', a => { S().vars['has-flag-' + a[0]] = bool(a[1]); });
  cmd('SetHasPaint', a => { S().vars['has-paint-' + a[0]] = bool(a[1]); });
  cmd('AddMapMarker', a => { const m = S().mapMarkers = S().mapMarkers || []; if (!m.includes(a[0])) m.push(a[0]); info('AddMapMarker', 'saved ' + a[0] + ', no map screen yet'); });
  cmd('RemoveMapMarker', a => { S().mapMarkers = (S().mapMarkers || []).filter(x => x !== a[0]); });
  cmd('wait', (a, r, resume) => { setTimeout(resume, num(a[0]) * 1000); return 'wait'; });
  cmd('ToggleFreezeTime', a => { S().vars['time-frozen'] = bool(a[0]); info('ToggleFreezeTime', 'saved flag only; clock in sky.js does not read it'); });
  stub('MakeBait', 'bait grids (BAIT_INPUT/OUTPUT) not built');
  stub('ConstructBuildingTier', 'Iron Rig buildings not built');
  stub('DetonateExplosives', 'ExplosivePOI not built');
  stub('EmitLightning', 'weather lightning not built');
  stub('DoFinalePreparations', 'finale not built');
  stub('DoFinaleCutscenePreparations', 'finale not built');
  stub('ShowRigTentacles', 'Iron Rig not built');
  stub('EndDemo', 'demo build only');
  stub('TransitionToAudioMixerSnapshot', 'no audio mixer snapshots');
  stub('ShowAndWaitForAnimation', 'scene animations not built');
  stub('SetAchievementState', 'no achievements');                    // AchievementManager.cs:98
  stub('ActivateBanishMachine', 'banish machine not built');         // BanishMachine.cs:24
  stub('ToggleDSAltarFlame', 'Devil\'s Spine altar not built');        // DSAltarFlame.cs:31
  stub('PlayBadFinaleCutscene', 'finale not built');                 // FinaleCutsceneLogic.cs:93
  stub('PlayGoodFinaleCutscene', 'finale not built');
  stub('UnlockPlayerMovement', 'finale not built');
  stub('ToggleLookAtFinaleVCam', 'finale not built');                // FinaleLookAtCam.cs:12
  stub('EnableBadFinalePOI', 'finale not built');                    // FinalePOIEnabler.cs:15
  stub('EnableGoodFinalePOI', 'finale not built');
  stub('TogglePointToFinalePOI', 'lighthouse beam not built');       // LighthouseBeam.cs:44
  stub('TogglePortraitVFX', 'portrait VFX not built');               // PortraitVFXEnabler.cs:12

  // ---- hàm (AddFunction)
  const inv = id => itemsIn('INVENTORY', id).length;
  fn('GetCanAffordItemById', id => { const d = def(id); return d ? S().funds >= (d.value || 0) : true; });
  fn('GetNumItemInInventoryById', inv);
  fn('GetNumItemInInventoryAndStorageById', id => inv(id) + itemsIn('STORAGE', id).length);
  fn('GetNumItemInInventoryAndNetById', id => inv(id) + itemsIn('TRAWL_NET', id).length);
  fn('GetNumItemInStorageById', id => itemsIn('STORAGE', id).length);
  fn('GetNumItemAnywhereById', id => inv(id) + itemsIn('TRAWL_NET', id).length + itemsIn('STORAGE', id).length);
  fn('GetNumFishByIdAndCondition', (id, lo, hi) => itemsIn('INVENTORY', id).filter(i => { const f = i.fresh == null ? root.DR_CONFIG.maxFreshness : i.fresh; return f < toNum(hi) && f >= toNum(lo); }).length);
  const typeMatch = (d, t, s) => (G.typeOf(d) & G.mask(t, G.TYPE)) && (s == null || (G.subOf(d) & G.mask(s, G.SUB)));
  fn('GetNumItemsByType', t => itemsIn('INVENTORY').filter(i => typeMatch(def(i.id), t)).length);
  fn('GetNumItemsByTypeAndSubtype', (t, s) => itemsIn('INVENTORY').filter(i => typeMatch(def(i.id), t, s)).length);
  fn('GetNumItemsByTypeAndSubtypeIncludingStorage', (t, s) => itemsIn('INVENTORY').concat(itemsIn('STORAGE')).filter(i => typeMatch(def(i.id), t, s)).length);
  fn('GetHasEquipmentForHarvestType', ht => itemsIn('INVENTORY').some(i => { const d = def(i.id); return d && (d.harvestableTypes || []).includes(ht); }));
  fn('GetNumTrophyFish', () => fishWhere(isTrophy, ['INVENTORY', 'TRAWL_NET', 'STORAGE']).length);
  fn('GetNumAberrantFish', () => fishWhere((i, d) => !!d.isAberration, ['INVENTORY', 'TRAWL_NET', 'STORAGE']).length);
  fn('GetNumAberrantFishInInventory', () => fishWhere((i, d) => !!d.isAberration, ['INVENTORY']).length);
  fn('GetNumOwnedItemsThatCanCatchFish', () => {
    const rods = k => itemsIn(k).filter(i => { const d = def(i.id); return d && (G.subOf(d) & G.SUB.ROD) && (d.harvestableTypes || []).length; }).length;
    const sub = s => itemsIn('INVENTORY').filter(i => { const d = def(i.id); return d && (G.subOf(d) & s); }).length;
    return rods('INVENTORY') + rods('STORAGE') + sub(G.SUB.POT) + sub(G.SUB.NET);
  });
  fn('GetNumItemInGridById', (id, k) => itemsIn(k, id).length);
  fn('GetNumDamage', () => { const g = grid('INVENTORY'); return g ? g.damage.length : 0; });
  fn('GetNumDamagedDeployables', () => 0);
  fn('GetHasSpaceForItem', id => { const d = def(id); const g = grid('INVENTORY'); return !!(d && g && G.findSpot(g, d, 0, false)); });
  fn('GetFunds', () => S().funds);
  fn('GetNumDaysPassed', () => Math.floor(S().time));
  fn('GetDayPeriod', () => Math.floor((S().time % 1) / 0.25));
  fn('GetHour', () => Math.floor((S().time % 1) * 24));
  fn('GetTemporalMarkerExists', id => id in ensure().temporalMarkers);
  // GetHoursSince/DaysSince: không có mốc thì int.MaxValue
  fn('GetHoursSinceTemporalMarker', id => { const m = ensure().temporalMarkers[id]; return m == null ? 2147483647 : Math.round((S().time - m) * 24); });
  fn('GetDaysSinceTemporalMarker', id => { const m = ensure().temporalMarkers[id]; return m == null ? 2147483647 : Math.floor(S().time) - Math.floor(m); });
  fn('GetHasVisitedNode', n => visited(n));
  fn('GetLastQuestGridResult', function () { return this.lastGrid || 0; });
  fn('GetHasDeluxeEntitlement', () => false);
  const hist = id => ensure().shopHistories[id];
  const day = () => Math.floor(S().time);
  fn('GetNumShopVisits', id => (hist(id) || {}).visits || 0);
  fn('GetShopTransactionTotalById', id => (hist(id) || {}).total || 0);
  fn('GetDaysSinceFirstTransaction', id => { const h = hist(id); return h ? day() - Math.min(day(), ...h.transactionDays) : 0; });
  fn('GetDaysSinceLastTransaction', id => { const h = hist(id); return h ? day() - Math.max(0, ...h.transactionDays) : 0; });
  fn('GetDaysSinceLastVisit', id => { const h = hist(id); return h ? day() - Math.max(0, ...h.visitDays) : 0; });
  fn('GetDaysSinceFirstVisit', id => { const h = hist(id); return h ? day() - Math.min(day(), ...h.visitDays) : 0; });
  fn('GetNumShopVisitDaysUnique', id => ((hist(id) || {}).visitDays || []).length);
  fn('GetNumShopTransactionDaysUnique', id => ((hist(id) || {}).transactionDays || []).length);
  fn('GetNumItemsSoldById', id => (ensure().itemTransactions[id] || {}).sold || 0);
  fn('GetHasEverOwnedItem', id => (S().itemsOwned || []).includes(id));
  const Qs = () => root.DRQuests;
  fn('GetIsQuestInactive', id => Qs().isInactive(id));
  fn('GetIsQuestAvailable', id => Qs().isAvailable(id));
  fn('GetIsQuestCanBeStarted', id => !Qs().isStarted(id) && !Qs().isCompleted(id));
  fn('GetIsQuestStarted', id => Qs().isStarted(id));
  fn('GetIsQuestInProgress', id => Qs().isStarted(id) && !Qs().isCompleted(id));
  fn('GetIsQuestCompleted', id => Qs().isCompleted(id));
  fn('GetIsQuestStepActive', id => Qs().isStepActive(id));
  fn('GetIsQuestStepCompleted', id => Qs().isStepCompleted(id));
  fn('GetIsBuildingTierConstructed', id => !!S().vars[id + '-is-constructed']);
  fn('GetCanBuildingTierBeConstructed', () => false);
  const debt = () => (S().vars['gm-debt'] != null ? S().vars['gm-debt'] : root.DR_CONFIG.greaterMarrowDebt);
  fn('GetDockProportionalProgress', t => t === 'GM_REPAYMENTS' ? (S().vars['gm-repayments'] || 0) / debt() : 0);
  fn('GetDockProgressRemainingRaw', t => t === 'GM_REPAYMENTS' ? Math.round((debt() - (S().vars['gm-repayments'] || 0)) * 100) / 100 : 0);
  fn('GetActiveTrapState', id => S().vars['trap-' + id + '-state'] || 0);
  fn('GetSpeakerAvailability', id => ensure().availableSpeakers.includes(id));
  fn('GetCurrentZone', () => (root.DR.view && DR().view.zoneId) || 'THE_MARROWS');
  fn('GetWorldPhase', () => S().worldPhase || 0);
  fn('GetTPRWorldPhase', () => S().vars['tpr-world-phase'] || 0);
  fn('GetTIRWorldPhase', () => S().vars['tir-world-phase'] || 0);
  fn('GetIsDemoMode', () => false);
  fn('GetPlayerSanity', () => S().sanity);
  fn('GetBoolVariable', k => !!S().vars[k]);
  fn('GetIntVariable', k => int(S().vars[k]));
  fn('GetHasPaint', id => !!S().vars['has-paint-' + id]);
  fn('GetHasFlag', id => !!S().vars['has-flag-' + id]);
  fn('GetIdOfFlagInInventoryAndStorage', () => {
    for (const it of itemsIn('INVENTORY').concat(itemsIn('STORAGE'))) { const m = /^flag-([1-7])$/.exec(it.id); if (m) return +m[1]; }
    return 0;
  });
  fn('GetOozePatchArea', () => { missingFn('GetOozePatchArea'); return 0; });
  fn('GetIsAnyOozeInWorld', () => false);
  fn('GetDidAddEnoughFishToMakeBait', () => { missingFn('GetDidAddEnoughFishToMakeBait'); return false; });
  fn('TryConvertDogTags', () => { missingFn('TryConvertDogTags'); return false; });

  // ------------------------------------------------------------ móc
  function wire() {
    if (!root.DR || !DR().on) return;
    DR().on('newgame', () => {
      const s = S(), tpl = root.DR_CONFIG.saveDataTemplate || {};
      s.visitedNodes = []; s.yarnVars = {}; s.temporalMarkers = {}; s.shopHistories = {}; s.itemTransactions = {};
      s.availableDestinations = (tpl.availableDestinations || []).slice();
      s.availableSpeakers = (tpl.availableSpeakers || []).slice();      // SaveDataTemplateProd: ["Dockworker"]
      s.ownedNonSpatial = []; s.itemsOwned = [];
      for (const it of ((tpl.grids || {}).INVENTORY || {}).spatialItems || []) if (!s.itemsOwned.includes(it.id)) s.itemsOwned.push(it.id);
      if (s.vars['gm-debt'] == null) s.vars['gm-debt'] = root.DR_CONFIG.greaterMarrowDebt;
    });
    DR().on('load', () => ensure());
  }
  wire();

  function run(node, view, done) {
    if (!Y || !Y.nodes) throw new Error('DR_YARN not loaded');
    if (current) current.stop();
    const r = new Runner(view);
    r.done = done || null;
    return r.start(node);
  }

  root.DRYarn = {
    run, Runner, visited, markVisited, lineText, parseLine, split, commands: C, functions: F, missing,
    recordShopVisit, recordShopTransaction, recordItemTransaction, sellInsts, addItem, ensure,
    current: () => current, hasNode: n => !!(Y && Y.nodes[n]),
    stubs: () => Object.keys(C).filter(k => C[k].stub)
  };
})(window);
