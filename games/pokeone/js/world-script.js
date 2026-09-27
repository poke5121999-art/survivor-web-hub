/*
 * Chạy kịch bản NPC (P1.SCRIPTS, dịch từ tools/maps/*.txt bởi tools/build_maps.js).
 * Kịch bản là danh sách lệnh phẳng; rẽ nhánh bằng chỉ số lệnh (nhãn đã dịch sẵn), -1 = kết thúc.
 * Mỗi lệnh là một mục trong bảng OPS: world.js không có nhánh riêng cho từng NPC.
 * ScriptHandler gốc (dump.cs) cũng chạy lệnh tuần tự và khoá người chơi (FreezePlayer) trong lúc chạy.
 */
(function (P1) {
  'use strict';

  const RIVAL = 'Gary';

  function fill(text) {
    const st = P1.state;
    return String(text || '')
      .replace(/\\n/g, '\n')
      .replace(/\{player\}/g, (st.player && st.player.name) || 'Trainer')
      .replace(/\{rival\}/g, RIVAL);
  }

  // BattleID trong items.txt mất chữ "é" (Poké Ball = "pokball"); túi đồ dùng 'pokeball'.
  const itemKey = s => String(s).replace(/pok[eé]?/g, 'pok');
  function itemName(id) {
    for (const k in P1.ITEMS) if (itemKey(P1.ITEMS[k].battleId) === itemKey(id)) return P1.ITEMS[k].name;
    return id;
  }

  /* Điều kiện: 'cờ', 'quest=<id>' (nhiệm vụ đang làm), 'done=<id>', 'party' (có Pokémon), 'item=<id>'. */
  function test(cond) {
    const st = P1.state;
    const [k, v] = cond.split('=');
    if (v !== undefined) {
      if (k === 'quest') return st.quest === v;
      if (k === 'done') return !!st.flags['quest_done_' + v];
      if (k === 'item') return (st.bag[v] || 0) > 0;
      return false;
    }
    if (cond === 'party') return st.party.length > 0;
    return !!st.flags[cond];
  }

  /*
   * run(name | ops, ctx) -> Promise. ctx = { world, actor }  (actor = NPC đang nói, có thể null).
   * world cung cấp: say, choose, battle(opts)->Promise<outcome>, heal(), shop(items), actorById(id),
   *   moveActor(actor, steps), faceActor(actor, dir|'player'), warp(map,x,y,face), refreshActors(), showMon(dex)...
   */
  async function run(script, ctx) {
    const ops = typeof script === 'string' ? P1.SCRIPTS[script] : script;
    if (!ops) { console.warn('script not found: ' + script); return; }
    const w = ctx.world;
    let pc = 0, guard = 0;
    while (pc >= 0 && pc < ops.length) {
      if (++guard > 5000) throw new Error('script ' + script + ' runs away');
      const o = ops[pc++];
      const next = await OPS[o.op](o, ctx, w);
      if (typeof next === 'number') pc = next;
    }
  }

  const who = (o, ctx, w) => (o.who ? (o.who === 'player' ? w.player : w.actorById(o.who.replace(/ /g, '_'))) : ctx.actor);
  const speaker = (o, ctx) => (o.who ? o.who : ctx.actor && ctx.actor.kind !== 'sign' && ctx.actor.kind !== 'item' ? ctx.actor.name : '');

  const OPS = {
    async say(o, ctx, w) { await w.say(fill(o.text), speaker(o, ctx)); },
    async choose(o, ctx, w) {
      const i = await w.choose(fill(o.text), o.options.map(x => fill(x.text)), speaker(o, ctx));
      const opt = o.options[i];
      return opt && opt.goto != null ? opt.goto : undefined;
    },
    if(o) { if (test(o.cond)) return o.goto; },
    ifnot(o) { if (!test(o.cond)) return o.goto; },
    goto(o) { return o.goto; },
    end() { return -1; },
    set(o) { P1.state.flags[o.arg] = 1; },
    clear(o) { delete P1.state.flags[o.arg]; },
    async hide(o, ctx, w) { P1.state.flags[o.arg] = 1; w.refreshActors(); },
    async show(o, ctx, w) { delete P1.state.flags[o.arg]; w.refreshActors(); },
    async wait(o) { await new Promise(r => setTimeout(r, o.n * 1000)); },
    sfx(o) { P1.audio.sfx(o.arg); },
    music(o, ctx, w) { if (o.arg === 'map') w.playMapMusic(); else P1.audio.music(o.arg); },
    cry(o) { P1.audio.cry(o.n); },
    async showmon(o, ctx, w) { w.showMon(o.n); },
    async hidemon(o, ctx, w) { w.showMon(0); },
    async emote(o, ctx, w) { await w.emote(who(o, ctx, w), o.arg); },
    async face(o, ctx, w) {
      const a = who(o, ctx, w);
      if (a) w.faceActor(a, o.arg);
    },
    async move(o, ctx, w) {
      const a = o.who === 'player' ? w.player : o.who && o.who !== 'self' ? w.actorById(o.who) : ctx.actor;
      if (a) await w.moveActor(a, o.steps);
    },
    async warp(o, ctx, w) { await w.warp(o.map, o.x, o.y, o.face, { kind: 'script' }); },
    async heal(o, ctx, w) { await w.heal(); },
    lastheal(o, ctx, w) { w.setLastHeal(); },
    async shop(o, ctx, w) { await w.shop(o.items); },
    async pc(o, ctx, w) { await w.openPc(); },
    async give(o, ctx, w) {
      const bag = P1.state.bag;
      bag[o.item] = (bag[o.item] || 0) + o.n;
      P1.audio.sfx('item');
      await w.say(fill('{player} received ' + (o.n > 1 ? o.n + '× ' : '') + itemName(o.item) + '!'), '');
    },
    async givemon(o, ctx, w) {
      const m = P1.mon.create(o.dex, o.level, { ot: (P1.state.player && P1.state.player.name) || 'Trainer', metAt: P1.state.map, ball: 'pokeball' });
      if (P1.state.party.length < 6) P1.state.party.push(m); else P1.state.box.push(m);
      P1.caught(o.dex);
      P1.audio.sfx('recieve_pokemon');
      w.refreshFollower();
      await w.say(fill('{player} received ' + P1.mon.name(m) + '!'), '');
    },
    async money(o, ctx, w) { P1.state.money = Math.max(0, P1.state.money + o.n); w.refreshHud(); },
    async exp(o, ctx, w) { P1.state.trainerExp = (P1.state.trainerExp || 0) + o.n; w.refreshHud(); },
    async quest(o, ctx, w) { await w.quests.start(o.arg); },
    async questdone(o, ctx, w) { await w.quests.complete(o.arg); },
    async battle(o, ctx, w) {
      const tr = o.self && ctx.actor && ctx.actor.data && ctx.actor.data.trainer;
      const team = tr ? tr.team : o.team;
      const res = await w.trainerBattle({
        name: tr ? ctx.actor.name : o.name, team, money: tr ? tr.money : o.money,
        music: (tr && tr.music) || o.music || 'trainer_battle', canLose: o.canLose, actor: tr ? ctx.actor : null,
        exp: tr ? tr.exp : 0,
      });
      if (res === 'win' && o.win !== '' && o.win != null) return o.win;
      if (res !== 'win') {
        if (o.lose !== '' && o.lose != null && o.canLose) return o.lose;
        if (!o.canLose) return -1;
      }
    },
  };

  P1.script = { run, test, fill, OPS, itemName };
})(window.P1 = window.P1 || {});
