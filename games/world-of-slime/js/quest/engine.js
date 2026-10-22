// Máy trạng thái nhiệm vụ: đọc bảng js/quest/data.js, giữ bản lưu (js/state.js loadSave/writeSave), đẩy HUD
// (state.quest = nhiệm vụ đang theo dõi, state.player.level/exp, slime HP/MP/thể lực, cảnh báo thể lực) và gọi js/ui/story.js
// để hiện hội thoại, băng chữ, log. game.js chỉ gọi: engine.interactAt(), engine.talk(npc), engine.tick(), engine.onMap().
import { QUESTS, QUEST, TALK, GUIDES, FIRST_QUEST, EXP_TO_NEXT, START_GOLD, HEAL_COST, BOXES, PERKS, ITEM_ICON, INTERACT_RANGE, TALK_RANGE } from './data.js?v=20261022e';
import { state, set, loadSave, writeSave } from '../state.js?v=20261022e';
import { L } from '../../data/quest_text.js?v=20261022e';
import { Roster } from '../party/roster.js?v=20261022e';

export class QuestEngine {
  constructor(story, hooks = {}) {
    this.story = story; story.engine = this;
    this.hooks = hooks;           // { pushback(), npcObject(name), playerObject() }
    this.save = loadSave(START_GOLD);
    this.events = [];             // nhật ký cho test: [{ t, kind, ... }]
    this.roster = new Roster(this);   // F3: túi slime / kho / bách khoa (js/party/roster.js)
    if (!this.save.quick.some(x => x != null)) for (const it of [1, 4]) this.autoQuick(it);   // bản lưu cũ đã có đồ
    this.sync();
  }
  ev(kind, data = {}) { this.events.push({ t: Math.round(performance.now()), kind, ...data }); if (this.events.length > 300) this.events.shift(); }
  persist() { writeSave(this.save); this.sync(); }

  // ---- trạng thái nhiệm vụ
  qs(id) { return this.save.quests[id]; }
  count(qid, oid) { const q = this.qs(qid); return q && q.c[oid] || 0; }
  status(id, npc) {
    const s = this.qs(id); if (!s) return 'none';
    if (s.s === 'done') return 'done';
    const q = QUEST[id];
    const ok = q.objectives.every(o => o.kind === 'talk' ? npc === q.target : this.count(id, o.id) >= o.need);
    return ok ? 'ready' : 'active';
  }
  active() { return QUESTS.filter(q => this.qs(q.id) && this.qs(q.id).s === 'active'); }
  listQuests(tab) { return QUESTS.filter(q => this.qs(q.id) && (tab === 'done' ? this.qs(q.id).s === 'done' : this.qs(q.id).s === 'active')).reverse(); }
  progressOf(q) {
    const s = this.qs(q.id); const need = q.objectives.reduce((a, o) => a + (o.kind === 'talk' ? 1 : o.need), 0);
    const done = s && s.s === 'done' ? need : q.objectives.reduce((a, o) => a + Math.min(o.kind === 'talk' ? 0 : this.count(q.id, o.id), o.need), 0);
    return { done, need };
  }
  objText(q, o) { return o.kind === 'talk' || o.kind === 'none' ? L(o.text) : L(o.text) + ' ' + Math.min(this.count(q.id, o.id), o.need) + '/' + o.need; }
  // F4: bộ đếm theo bảng (QUESTS[].objectives kind/model/item/rect): mọi nhiệm vụ đang làm có mục tiêu khớp đều được cộng
  bump(match, n = 1) {
    for (const q of this.active()) for (const o of q.objectives) if (match(o) && this.count(q.id, o.id) < o.need) this.obj(q.id, o.id, Math.min(n, o.need - this.count(q.id, o.id)));
  }
  onKill(model) { this.bump(o => o.kind === 'kill' && (!o.model || o.model === model)); }
  onUse(item) { this.bump(o => o.kind === 'use' && +o.item === +item); }
  onBuy(item, n) { this.bump(o => o.kind === 'buy' && +o.item === +item, n); }
  // gate của dòng TALK: { started: q } = q đã nhận (đang làm hoặc xong), { done: q } = q đã xong
  gateOk(g) { return !g || ((!g.started || !!this.qs(g.started)) && (!g.done || this.status(g.done) === 'done')); }
  talkEntry(npc) {
    const list = TALK[npc] || [];
    return list.find(r => (!r.flag || this.save[r.flag]) && this.gateOk(r.gate) && (!r.when || this.status(r.when.q, npc) === r.when.s)) || null;
  }

  start(id, { silent } = {}) {
    if (!id || this.qs(id)) return;
    this.save.quests[id] = { s: 'active', c: {} };
    this.ev('start', { q: id });
    if (!silent) this.story.questStart(QUEST[id]);
    this.persist();
  }
  complete(id) {
    const q = QUEST[id], s = this.qs(id); if (!s || s.s === 'done') return;
    s.s = 'done';
    for (const [it, n] of Object.entries(q.take || {})) this.save.items[it] = Math.max(0, (this.save.items[it] || 0) - n);
    this.ev('complete', { q: id });
    this.story.questComplete(q);
    const r = q.rewards || {};
    if (r.gold) { this.save.gold += r.gold; this.story.log(L('ui.gold') === 'ui.gold' ? 'Gold' : L('ui.gold'), '+ ' + r.gold); }
    for (const [it, n] of Object.entries(r.items || {})) this.give(+it, n);
    if (r.exp) this.addExp(r.exp);
    this.persist();
    if (q.next) this.start(q.next);
  }
  addExp(n) {
    this.save.exp += n;
    this.story.log(L('ui.userExp'), '+ ' + n, 'img/item/Item_EXP.webp');   // F4: biểu tượng cuộn EXP như 7:28, 10:15, 11:03
    this.ev('exp', { n });
    while (this.save.exp >= EXP_TO_NEXT(this.save.level)) {
      this.save.exp -= EXP_TO_NEXT(this.save.level); this.save.level++; this.save.sp++;
      this.ev('levelup', { level: this.save.level });
      this.story.levelUp(this.save.level);
    }
  }
  give(item, n) {
    this.save.items[item] = (this.save.items[item] || 0) + n;
    this.autoQuick(item);
    this.story.log(L('item.' + item) + ' × ' + n, null, ITEM_ICON[item]);
    this.ev('item', { item, n });
  }
  obj(qid, oid, n = 1) {
    if (this.status(qid) === 'none' || this.status(qid) === 'done') return;
    const s = this.qs(qid), before = s.c[oid] || 0; s.c[oid] = before + n;
    this.ev('obj', { q: qid, o: oid, c: s.c[oid] });
    // F4: mục tiêu vừa đủ -> dòng giữa trên "<tên> / ✓ <mục tiêu> n/n" (6:27, 7:30, 9:54 QuestProgressGoalLayout)
    const q = QUEST[qid], o = q && q.objectives.find(x => x.id === oid);
    if (o && o.kind !== 'talk' && before < o.need && s.c[oid] >= o.need && this.story.goalDone)
      this.story.goalDone(L(q.title), q.objectives.filter(x => x.kind !== 'talk' && x.kind !== 'none').map(x => ({ text: this.objText(q, x), done: this.count(qid, x.id) >= x.need })));
    this.persist();
  }
  // F3: món đầu tiên có thể đặt ô nhanh tự vào ô như khung gmwall_hud_party_bar (Q = thuốc, E = Cube) nếu ô đó trống [ĐỀ XUẤT]
  autoQuick(item) {
    const auto = { 1: 0, 4: 1 }[item];
    if (auto != null && this.save.items[item] > 0 && !this.save.quick.includes(item) && this.save.quick[auto] == null) this.save.quick[auto] = item;
  }
  bagCount() { return Object.values(this.save.items).filter(n => n > 0).length; }

  // ---- HUD
  sync() {
    const sv = this.save, lv = sv.level;
    // HUD: nhiệm vụ đầu (cũ nhất) ghim sao + mục tiêu, các nhiệm vụ song song chỉ hiện tên (6:54, 7:30, 8:33, 11:03)
    const [a, ...rest] = this.active();
    const quest = a ? { id: a.id, title: L(a.title), objectives: a.objectives.map(o => ({ text: this.objText(a, o), done: o.kind !== 'talk' && o.kind !== 'none' && this.count(a.id, o.id) >= o.need })),
      more: rest.map(q => ({ id: q.id, title: L(q.title) })) } : null;
    const act = this.roster.active();
    this.roster.sync();
    set({ quest, warnStamina: !!act && act.stamina < 0.3, player: { ...state.player, level: lv, exp: Math.min(1, sv.exp / EXP_TO_NEXT(lv)) } });
    this.story.hud.setMarkers(n => this.markerFor(n));
  }
  markerFor(npc) {
    let mk = null;
    for (const q of this.active()) {
      if (q.target !== npc) continue;
      const s = this.status(q.id, npc);
      if (s === 'ready') return 'complete';
      mk = 'progress';
    }
    if (mk) return mk;
    const e = this.talkEntry(npc);   // có việc giao (dòng TALK s: 'none' mở cổng) -> "!"
    return e && e.when && e.when.s === 'none' && e.gate ? 'before' : null;
  }

  // ---- tương tác
  // điểm gần nhất trong tầm: NPC có hội thoại (TALK) hoặc hộp trôi dạt (chỉ khi đang làm "The Herb in the Box" và hộp chưa mở)
  interactAt(mapId, x, z, npcs) {
    let best = null, bd = Infinity;
    for (const n of npcs) {
      if (!this.talkEntry(n.name)) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < (TALK_RANGE[n.name] || INTERACT_RANGE) && d < bd) { bd = d; best = { kind: 'npc', name: n.name }; }
    }
    if (String(mapId) === '110' && this.status('q4') === 'active') {
      for (const b of BOXES) {
        if (this.save.boxes.includes(b.id)) continue;
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < INTERACT_RANGE && d < bd) { bd = d; best = { kind: 'box', box: b }; }
      }
    }
    return best;
  }
  interact(target) {
    if (!target) return Promise.resolve();
    if (target.kind === 'box') return this.dialog('bx1', { box: target.box });
    return this.talk(target.name);
  }
  talk(npc, extra = {}) {
    const e = this.talkEntry(npc);
    if (!e) return Promise.resolve();
    // nhiệm vụ "nói chuyện với X": xong ngay khi mở hội thoại? Không: xong ở hành động complete:q cuối mạch (như clip)
    return this.dialog(e.start, { npc, ...extra });
  }
  dialog(start, ctx) {
    this.ev('dialog', { start, npc: ctx.npc || null });
    const after = [];
    const c = {
      ...ctx, cost: HEAL_COST,
      npcObject: ctx.npc && this.hooks.npcObject ? this.hooks.npcObject(ctx.npc) : null,
      npcHeight: ctx.npc && this.hooks.npcHeight ? this.hooks.npcHeight(ctx.npc) : null,
      playerObject: this.hooks.playerObject ? this.hooks.playerObject() : null,
      playerHeight: this.hooks.playerHeight ? this.hooks.playerHeight() : null,
      act: (cmd, node) => {
        let goto;
        for (const part of cmd.split(';')) {
          const [op, arg] = part.split(':');
          this.ev('act', { op, arg: arg || null, node });
          if (op === 'start') this.start(arg);
          else if (op === 'complete') this.complete(arg);
          else if (op === 'obj') { const [q, o] = arg.split('.'); this.obj(q, o); }
          else if (op === 'heal') goto = this.heal() ? undefined : 'alHno';
          else if (op === 'box') goto = this.openBox(ctx.box);
          else if (op === 'perk' || op === 'shop' || op === 'notbuilt' || op === 'pushback' || op === 'sell' || op === 'duel' || op === 'storage') after.push(op);
          else if (op === 'guide' || op === 'call' || op === 'notice') after.push(op + ':' + arg);   // F4
        }
        return goto;
      },
    };
    return this.story.talk(start, c).then(async () => {
      for (const op0 of after) {
        const [op, arg] = op0.split(':');
        if (op === 'perk') await this.story.openPerk();
        else if (op === 'guide') await this.guide(arg);
        else if (op === 'call') { await this.story.whenIdle(); await this.dialog(arg, {}); }   // NPC gọi từ xa (7:46): chân dung theo node, không chibi, camera không quay
        else if (op === 'notice') await this.story.notice(L(arg));
        else if (op === 'shop') await this.story.openShop(ctx.npc);
        else if (op === 'sell') this.story.toast(L('c.sell') + ' · chưa có');
        else if (op === 'notbuilt') await this.story.notice(L('ui.notBuilt'));
        else if (op === 'pushback' && this.hooks.pushback) this.hooks.pushback();
        else if (op === 'duel' && this.hooks.duel) this.hooks.duel();   // js/combat: sang sân đấu Rudga
        else if (op === 'storage' && this.hooks.storage) await this.hooks.storage();   // F3: Slime Storage (js/ui/panels.js)
      }
      this.sync();
    });
  }
  // F4: màn chỉ nút (GUIDES[id]) rồi hành động `then` của bước cuối (vd. complete:q10 như 11:01 -> 11:03)
  async guide(id) {
    const steps = GUIDES[id] || [];
    this.ev('guide', { id });
    for (const st of steps) {
      await this.story.guide(st, this.hooks.npcObject ? this.hooks.npcObject(st.npc) : null, this.hooks.npcHeight ? this.hooks.npcHeight(st.npc) : null);
      for (const part of (st.then || '').split(';').filter(Boolean)) {
        const [op, arg] = part.split(':');
        if (op === 'complete') this.complete(arg); else if (op === 'start') this.start(arg);
      }
    }
    this.sync();
  }
  heal() {
    if (this.save.gold < HEAL_COST) return false;
    this.save.gold -= HEAL_COST;
    this.roster.healAll();
    this.ev('heal', { gold: this.save.gold });
    if (this.status('q3') === 'active') this.obj('q3', 'heal'); else this.persist();
    return true;
  }
  openBox(box) {
    if (!box) return 'bxEmpty';
    if (!this.save.boxes.includes(box.id)) this.save.boxes.push(box.id);
    this.ev('box', { id: box.id, herb: box.herb });
    if (box.herb && this.status('q4') === 'active') { this.give(773, 1); this.obj('q4', 'herb'); this.persist(); return undefined; }
    this.persist();
    return 'bxEmpty';
  }
  learnPerk(id) {
    const p = PERKS.find(x => x.id === id), lv = this.save.perks[id] || 0;
    if (!p || lv >= p.max || this.save.sp < p.cost) { this.ev('perkFail', { id }); return { ok: false }; }
    this.save.sp -= p.cost; this.save.perks[id] = lv + 1;
    this.ev('perk', { id, lv: lv + 1 });
    if (this.status('q5') === 'active') this.obj('q5', 'perk'); else this.persist();
    return { ok: true };
  }
  buy(entry, n) {
    const total = entry.price * n;
    if (this.save.gold < total) return { ok: false };
    this.save.gold -= total;
    this.give(entry.item, n);
    this.ev('buy', { item: entry.item, n, gold: this.save.gold });
    this.onBuy(entry.item, n);   // F4: "Purchase Cube 0/3" (10:45)
    this.persist();
    return { ok: true };
  }
  // nhiệm vụ 1 bắt đầu khi người chơi rời chỗ tỉnh dậy (clip 1:12 "No quest." -> 1:21 băng "An Unfamiliar Place") [ĐỀ XUẤT 2 m]
  tick(P, start, mapId) {
    if (!this.qs(FIRST_QUEST) && Math.hypot(P.x - start.x, P.z - start.z) > 2) this.start(FIRST_QUEST);
    // F4: mục tiêu 'reach' (Patrol): bước vào vùng rect của bản đồ map
    if (mapId != null) this.bump(o => o.kind === 'reach' && String(o.map) === String(mapId) && P.x >= o.rect[0] && P.z >= o.rect[1] && P.x <= o.rect[2] && P.z <= o.rect[3]);
  }
}
