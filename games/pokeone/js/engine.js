/*
 * Luật chơi thuần, không đụng DOM: Pokémon trong túi (mon), EXP, và một trận đấu.
 *
 * Trận chạy trên @pkmn/sim (Pokémon Showdown) vì máy chủ PokéOne cũng là Showdown
 * (lớp BattleRequest/BattleActive trong il2cpp, learnset dạng Showdown) — xem ARCH.md.
 * Showdown không có túi đồ, bóng, hay bỏ chạy. Ba thứ đó làm ở đây, rồi cho Pokémon
 * của mình "bỏ lượt" bằng volatile mustrecharge để đối thủ vẫn ra đòn trong lượt ấy.
 */
(function (P1) {
  'use strict';
  const Sim = window.PkmnSim;
  const Dex = Sim.Dex.forGen(7);
  const FORMAT = 'gen7customgame@@@!Team Preview';
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

  const GROWTH = {
    'fast': n => Math.floor(4 * n ** 3 / 5),
    'medium': n => n ** 3,
    'medium-slow': n => Math.floor(6 / 5 * n ** 3 - 15 * n ** 2 + 100 * n - 140),
    'slow': n => Math.floor(5 * n ** 3 / 4),
    'slow-then-very-fast': n =>
      n < 50 ? Math.floor(n ** 3 * (100 - n) / 50) :
      n < 68 ? Math.floor(n ** 3 * (150 - n) / 100) :
      n < 98 ? Math.floor(n ** 3 * Math.floor((1911 - 10 * n) / 3) / 500) :
      Math.floor(n ** 3 * (160 - n) / 100),
    'fast-then-very-slow': n =>
      n < 15 ? Math.floor(n ** 3 * (Math.floor((n + 1) / 3) + 24) / 50) :
      n < 36 ? Math.floor(n ** 3 * (n + 14) / 50) :
      Math.floor(n ** 3 * (Math.floor(n / 2) + 32) / 50),
  };

  // Tỉ lệ bóng theo wiki PokéOne (RESEARCH.md §3). Hàm trả hệ số; không đạt điều kiện thì 1.
  const BALLS = {
    pokeball: () => 1, premierball: () => 1, cherishball: () => 1, healball: () => 1,
    friendball: () => 1, luxuryball: () => 1,
    greatball: () => 1.5, ultraball: () => 2, masterball: () => 255,
    netball: c => (c.foeTypes.includes('Bug') || c.foeTypes.includes('Water')) ? 3.5 : 1,
    nestball: c => c.foeLevel < 20 ? 3 : c.foeLevel < 30 ? 2 : 1,
    quickball: c => c.turn <= 1 ? 5 : 1,
    timerball: c => c.turn >= 30 ? 4 : c.turn >= 20 ? 3 : c.turn >= 10 ? 2 : 1,
    duskball: c => c.dark ? 3.5 : 1,
    levelball: c => c.myLevel >= 4 * c.foeLevel ? 8 : c.myLevel >= 2 * c.foeLevel ? 4 : c.myLevel > c.foeLevel ? 2 : 1,
  };

  // Khoá = BattleID của vật phẩm. Số hồi máu theo Gen 7 (Hyper Potion 200 từ Gen VII).
  const ITEM_EFFECT = {
    potion: { heal: 20 }, superpotion: { heal: 60 }, hyperpotion: { heal: 200 }, maxpotion: { heal: 'full' },
    fullrestore: { heal: 'full', cure: 'all' }, fullheal: { cure: 'all' },
    antidote: { cure: ['psn', 'tox'] }, paralyzeheal: { cure: ['par'] }, burnheal: { cure: ['brn'] },
    iceheal: { cure: ['frz'] }, awakening: { cure: ['slp'] },
    revive: { revive: 0.5 }, maxrevive: { revive: 1 },
    freshwater: { heal: 30 }, sodapop: { heal: 50 }, lemonade: { heal: 70 }, moomoomilk: { heal: 100 },
    oranberry: { heal: 10 }, sitrusberry: { heal: 'quarter' },
  };

  function rng() { return (P1.rng || Math.random)(); }
  function rint(n) { return Math.floor(rng() * n); }
  function species(dex) { return Dex.species.get(Dex.species.all().find(s => s.num === dex && !s.forme).name); }
  const speciesCache = {};
  function spec(dex) { return speciesCache[dex] || (speciesCache[dex] = species(dex)); }
  function info(dex) { return (P1.SPECIES && P1.SPECIES[dex]) || {}; }

  function expAt(dex, level) {
    if (level <= 1) return 0;
    return Math.max(0, GROWTH[info(dex).expRate || 'medium'](level));
  }

  function levelMoves(dex, level) {
    const id = spec(dex).id;
    const ls = (Dex.data.Learnsets[id] || {}).learnset || {};
    const out = [];
    for (const move in ls) {
      for (const src of ls[move]) {
        const m = /^7L(\d+)$/.exec(src);
        if (m) out.push({ move, level: +m[1] });
      }
    }
    return out.filter(x => x.level <= level).sort((a, b) => a.level - b.level);
  }

  function moveSlot(id) {
    const mv = Dex.moves.get(id);
    return { id: mv.id, pp: mv.pp, ppMax: mv.pp };
  }

  let uidSeq = 0;
  const mon = {
    create(dex, level, opt) {
      opt = opt || {};
      const sp = spec(dex), inf = info(dex);
      const ivs = {}, evs = {};
      for (const s of STATS) { ivs[s] = rint(32); evs[s] = 0; }
      const natures = Dex.natures.all();
      const abil = Object.values(sp.abilities);
      const hidden = sp.abilities.H;
      const normal = [sp.abilities[0], sp.abilities[1]].filter(Boolean);
      const ability = hidden && rng() < 0.02 ? hidden : normal[rint(normal.length)] || abil[0];
      const male = inf.male != null ? inf.male : (sp.gender === 'N' ? -1 : sp.genderRatio ? sp.genderRatio.M * 100 : 50);
      const gender = sp.gender === 'N' || male < 0 ? '' : sp.gender ? sp.gender : (rng() * 100 < male ? 'M' : 'F');
      const learned = levelMoves(dex, level);
      const seen = new Set(), moves = [];
      for (let i = learned.length - 1; i >= 0 && moves.length < 4; i--) {
        if (seen.has(learned[i].move)) continue;
        seen.add(learned[i].move);
        moves.unshift(moveSlot(learned[i].move));
      }
      const m = {
        uid: Date.now().toString(36) + (uidSeq++).toString(36),
        dex, nick: null, level, exp: expAt(dex, level),
        nature: natures[rint(natures.length)].name, ivs, evs, ability, gender,
        shiny: opt.shiny != null ? opt.shiny : rint(4096) === 0,
        ball: opt.ball || 'pokeball', item: '', happiness: inf.happiness != null ? inf.happiness : sp.baseSpecies ? 70 : 70,
        moves, hp: 0, status: '', ot: opt.ot || '', metAt: opt.metAt || '', metLevel: level,
      };
      m.hp = mon.stats(m).hp;
      return m;
    },
    name(m) { return m.nick || spec(m.dex).name; },
    species: spec,
    stats(m) {
      const base = spec(m.dex).baseStats, nat = Dex.natures.get(m.nature), out = {};
      for (const s of STATS) {
        const core = Math.floor((2 * base[s] + m.ivs[s] + Math.floor(m.evs[s] / 4)) * m.level / 100);
        if (s === 'hp') out.hp = spec(m.dex).id === 'shedinja' ? 1 : core + m.level + 10;
        else out[s] = Math.floor((core + 5) * (nat.plus === s ? 1.1 : nat.minus === s ? 0.9 : 1));
      }
      return out;
    },
    expAt,
    expToNext(m) { return m.level >= 100 ? 0 : expAt(m.dex, m.level + 1) - m.exp; },
    ivTotal(m) { return STATS.reduce((a, s) => a + m.ivs[s], 0); },
    // Màu tên theo tổng IV (wiki PokéOne: Xám 0-47 … Vàng 156-186; hai mốc giữa chia đều, chưa có nguồn).
    ivColor(m) {
      const t = mon.ivTotal(m);
      return t >= 156 ? 'gold' : t >= 125 ? 'purple' : t >= 94 ? 'blue' : t >= 63 ? 'green' : t >= 48 ? 'white' : 'grey';
    },
    heal(m) {
      m.hp = mon.stats(m).hp; m.status = '';
      for (const s of m.moves) s.pp = s.ppMax;
    },
    fainted(m) { return m.hp <= 0; },
    /* Cộng EXP, trả danh sách việc xảy ra theo thứ tự. Học chiêu và tiến hoá để ngoài trận xử lý. */
    gainExp(m, amount) {
      const ev = [];
      if (m.level >= 100) return ev;
      m.exp += amount;
      while (m.level < 100 && m.exp >= expAt(m.dex, m.level + 1)) {
        const before = mon.stats(m);
        m.level++;
        const after = mon.stats(m);
        m.hp = Math.max(1, m.hp + after.hp - before.hp);
        ev.push({ type: 'level', level: m.level, before, after });
        for (const x of levelMoves(m.dex, m.level)) {
          if (x.level !== m.level || m.moves.some(s => s.id === x.move)) continue;
          ev.push({ type: 'learn', move: Dex.moves.get(x.move).id });
        }
      }
      return ev;
    },
    learn(m, moveId, replaceIndex) {
      const slot = moveSlot(moveId);
      if (replaceIndex == null) m.moves.push(slot); else m.moves[replaceIndex] = slot;
    },
    evolution(m) {
      const sp = spec(m.dex);
      for (const name of sp.evos || []) {
        const e = Dex.species.get(name);
        if (e.gen > 7 || e.forme) continue;
        if (!e.evoType && e.evoLevel && m.level >= e.evoLevel) return e.num;
      }
      return 0;
    },
    evolve(m, dex) {
      const before = mon.stats(m);
      m.dex = dex;
      const after = mon.stats(m);
      m.hp = Math.max(0, m.hp + after.hp - before.hp);
    },
    addEvs(m, yieldEvs) {
      let total = STATS.reduce((a, s) => a + m.evs[s], 0);
      for (const s of STATS) {
        const add = Math.min(yieldEvs[s] || 0, 252 - m.evs[s], 510 - total);
        if (add > 0) { m.evs[s] += add; total += add; }
      }
    },
  };

  /* ---------- trận đấu ---------- */

  function packSet(m, key) {
    return {
      name: key, species: spec(m.dex).name, item: m.item || '', ability: m.ability, gender: m.gender,
      nature: m.nature, evs: m.evs, ivs: m.ivs, level: m.level, shiny: m.shiny,
      moves: m.moves.map(s => s.id), happiness: m.happiness, pokeball: m.ball,
    };
  }

  const NOISE = new Set(['', 't:', 'gametype', 'player', 'gen', 'tier', 'rule', 'clearpoke', 'poke',
    'teampreview', 'start', 'upkeep', 'split', 'teamsize']);

  function parseLine(line) {
    const parts = line.slice(1).split('|');
    const cmd = parts.shift();
    const args = [], kw = {};
    for (const p of parts) {
      const m = /^\[(\w+)\]\s*(.*)$/.exec(p);
      if (m) kw[m[1]] = m[2] === '' ? true : m[2]; else args.push(p);
    }
    return { cmd, args, kw };
  }

  /* Đưa HP / trạng thái / PP hiện tại của Pokémon trong túi vào con tương ứng trong sim. */
  function syncIn(p, m) {
    p.hp = Math.min(m.hp, p.maxhp);
    if (p.hp <= 0) { p.hp = 0; p.fainted = true; }
    if (m.status) { p.status = m.status; p.statusState = { id: m.status, target: p, time: 2, startTime: 2 }; }
    m.moves.forEach((s, k) => { if (p.moveSlots[k]) p.moveSlots[k].pp = s.pp; });
  }

  /* Dòng log mới của obj.sim kể từ obj.cursor → sự kiện. |split| đi kèm dòng số thật (lấy) và dòng % (bỏ). */
  function drainLog(obj, keep) {
    const log = obj.sim.log, out = [];
    for (; obj.cursor < log.length; obj.cursor++) {
      const line = log[obj.cursor];
      if (line.startsWith('|split|')) {
        out.push(parseLine(log[obj.cursor + 1]));
        obj.cursor += 2;
        continue;
      }
      const e = parseLine(line);
      if (NOISE.has(e.cmd) || (keep && !keep(e))) continue;
      if (e.cmd === 'turn') obj.turn = +e.args[0];
      out.push(e);
    }
    return out;
  }

  /* Điểm của một chiêu lên một mục tiêu: uy lực × hệ × STAB × chính xác (chiêu trạng thái điểm cố định). */
  function scoreMove(mv, user, target) {
    if (mv.category === 'Status' || !target) return 15;
    const types = target.getTypes();
    if (!Dex.getImmunity(mv.type, types)) return 0;
    return (mv.basePower || 40) * Math.pow(2, Dex.getEffectiveness(mv.type, types)) *
      (user.hasType(mv.type) ? 1.5 : 1) * ((mv.accuracy === true ? 100 : mv.accuracy) / 100);
  }

  class Battle {
    /*
     * opt.me   = { name, party: [mon…] }
     * opt.foe  = { kind: 'wild' | 'trainer', name, party: [mon…], money }   (boss đánh chung: CoopBattle bên dưới)
     * opt.ctx  = { dark, terrain } cho tỉ lệ bóng
     */
    constructor(opt) {
      this.me = opt.me; this.foe = opt.foe; this.ctx = opt.ctx || {};
      this.kind = opt.foe.kind;
      this.turn = 0; this.runs = 0; this.result = null; this.caught = null;
      this.cursor = 0; this.passNext = false;
      this.fought = new Map();                               // uid của đối thủ → Set uid bên mình đã ra sân
      this.sim = new Sim.Battle({ formatid: FORMAT, seed: opt.seed });
      const lead = this.me.party.findIndex(m => m.hp > 0);
      this.order = this.me.party.map((m, i) => i);
      if (lead > 0) { this.order.splice(lead, 1); this.order.unshift(lead); }
      this.sim.setPlayer('p1', { name: 'p1', team: Sim.Teams.pack(this.order.map(i => packSet(this.me.party[i], 'M' + i))) });
      this.sim.setPlayer('p2', { name: 'p2', team: Sim.Teams.pack(this.foe.party.map((m, i) => packSet(m, 'F' + i))) });
      for (const i of this.order) syncIn(this.simMon('p1', i), this.me.party[i]);
      this.foe.party.forEach((m, i) => syncIn(this.simMon('p2', i), m));
      this.markFought();
    }

    simMon(side, index) {
      const key = (side === 'p1' ? 'M' : 'F') + index;
      return this.sim[side].pokemon.find(p => p.name === key);
    }
    /* "p1a: M3" → { side:'p1', pos:'p1a', mon, index } */
    who(ident) {
      const m = /^(p[12])([a-z]?): ([MF])(\d+)$/.exec(ident || '');
      if (!m) return null;
      const index = +m[4];
      return { side: m[1], pos: m[1] + (m[2] || 'a'), index, mon: (m[1] === 'p1' ? this.me : this.foe).party[index] };
    }
    active(side) {
      const p = this.sim[side].active[0];
      return p ? this.who(side + 'a: ' + p.name) : null;
    }

    syncOut() {
      for (const i of this.order) {
        const p = this.simMon('p1', i), m = this.me.party[i];
        m.hp = p.hp; m.status = p.status || '';
        m.moves.forEach((s, k) => { if (p.moveSlots[k] && p.moveSlots[k].id === s.id) s.pp = p.moveSlots[k].pp; });
      }
    }

    markFought() {
      const f = this.active('p2'), me = this.active('p1');
      if (!f || !me) return;
      if (!this.fought.has(f.mon.uid)) this.fought.set(f.mon.uid, new Set());
      this.fought.get(f.mon.uid).add(me.mon.uid);
    }

    /* Dòng log mới kể từ lần đọc trước → sự kiện. */
    drain() {
      return drainLog(this, (e) => {
        if (e.cmd === '-mustrecharge' && this.passNext) return false;
        if (e.cmd === 'cant' && e.args[1] === 'recharge' && this.passNext) { this.passNext = false; return false; }
        return true;
      });
    }

    begin() {
      const ev = this.drain();
      return ev;
    }

    request() {
      const r = this.sim.p1.activeRequest;
      if (!r || r.wait) return null;
      if (r.forceSwitch) return { kind: 'switch', forced: true };
      const act = r.active[0];
      return {
        kind: 'move',
        trapped: !!act.trapped,
        moves: act.moves.map((mv, k) => ({ id: mv.id, name: mv.move, pp: mv.pp, maxpp: mv.maxpp, disabled: !!mv.disabled, slot: k + 1 })),
      };
    }

    switchable() {
      const act = this.sim.p1.active[0];
      return this.order.map(i => ({ index: i, mon: this.me.party[i], sim: this.simMon('p1', i) }))
        .filter(x => x.sim !== act && !x.sim.fainted && x.sim.hp > 0);
    }

    /* AI đối thủ chọn cho p2 theo request hiện tại. */
    foeChoice() {
      const r = this.sim.p2.activeRequest;
      if (!r || r.wait) return null;
      if (r.forceSwitch) {
        const next = this.sim.p2.pokemon.findIndex(p => !p.fainted && p.hp > 0 && !p.isActive);
        return next < 0 ? 'pass' : 'switch ' + (next + 1);
      }
      const act = r.active[0], p = this.sim.p2.active[0], target = this.sim.p1.active[0];
      const usable = act.moves.map((mv, k) => ({ mv, k })).filter(x => !x.mv.disabled && (x.mv.pp > 0 || x.mv.maxpp == null));
      if (!usable.length) return 'move 1';
      if (this.kind === 'wild' || rng() < 0.2) return 'move ' + (usable[rint(usable.length)].k + 1);
      let best = usable[0], bestScore = -1;
      for (const x of usable) {
        const mv = Dex.moves.get(x.mv.id);
        let score = 0;
        if (mv.category !== 'Status' && target) {
          const types = target.getTypes();
          const imm = Dex.getImmunity(mv.type, types);
          score = imm ? (mv.basePower || 40) * Math.pow(2, Dex.getEffectiveness(mv.type, types)) *
            (p.hasType(mv.type) ? 1.5 : 1) * ((mv.accuracy === true ? 100 : mv.accuracy) / 100) : 0;
        } else score = 15 + rng() * 20;
        if (score > bestScore) { bestScore = score; best = x; }
      }
      return 'move ' + (best.k + 1);
    }

    commit(myChoice) {
      // Sim từ chối (vd. chiêu hai lượt đang khoá, chỉ còn một lựa chọn): để Showdown tự chọn thay vì kẹt cả trận.
      if (!this.sim.choose('p1', myChoice)) {
        console.warn('sim refused choice: ' + myChoice + ' — ' + (this.sim.p1.choice.error || ''));
        this.sim.choose('p1', 'default');
      }
      const ev = this.drain();
      this.settleFoe(ev);
      this.afterTurn(ev);
      return ev;
    }

    /* Đối thủ chọn mỗi khi mình đã chọn xong hoặc đang chờ (vd. nó phải thay con vừa ngất). */
    settleFoe(ev) {
      for (let guard = 0; guard < 6 && !this.sim.ended; guard++) {
        const r1 = this.sim.p1.activeRequest, r2 = this.sim.p2.activeRequest;
        if (!r2 || r2.wait || this.sim.p2.isChoiceDone()) break;
        if (r1 && !r1.wait && !this.sim.p1.isChoiceDone()) break;
        this.sim.choose('p2', this.foeChoice());
        ev.push(...this.drain());
      }
    }

    /* Lượt mình không đánh (dùng đồ, ném bóng hụt, chạy hụt): đối thủ vẫn ra đòn. */
    passTurn() {
      const p = this.sim.p1.active[0];
      p.addVolatile('mustrecharge');
      this.passNext = true;
      return this.commit('move 1');
    }

    /* Mọi hành động của người chơi đi qua đây. Trả mảng sự kiện để màn trận diễn. */
    act(a) {
      if (this.result) return [];
      if (a.type === 'move') { const ev = this.commit('move ' + a.slot); return ev; }
      if (a.type === 'switch') {
        const ev = this.commit('switch ' + (this.sim.p1.pokemon.indexOf(this.simMon('p1', a.index)) + 1));
        return ev;
      }
      if (a.type === 'item') return this.useItem(a);
      if (a.type === 'ball') return this.throwBall(a.ball);
      if (a.type === 'run') return this.run();
      throw new Error('unknown action ' + a.type);
    }

    useItem(a) {
      const p = this.simMon('p1', a.index), m = this.me.party[a.index];
      const pre = [{ cmd: 'p1-item', args: [a.item, 'p1a: M' + a.index], kw: {} }];
      const eff = ITEM_EFFECT[a.item];
      if (eff) {
        if (eff.heal && !p.fainted) {
          const amt = eff.heal === 'full' ? p.maxhp : eff.heal === 'quarter' ? Math.floor(p.maxhp / 4) : eff.heal;
          p.hp = Math.min(p.maxhp, p.hp + amt);
          pre.push({ cmd: '-heal', args: ['p1a: M' + a.index, p.hp + '/' + p.maxhp], kw: { from: 'item: ' + a.item } });
        }
        if (eff.cure && p.status && !p.fainted && (eff.cure === 'all' || eff.cure.includes(p.status))) {
          pre.push({ cmd: '-curestatus', args: ['p1a: M' + a.index, p.status], kw: { msg: true } });
          p.setStatus('');
        }
        if (eff.revive && p.fainted) {
          p.fainted = false; p.faintQueued = false; p.hp = Math.floor(p.maxhp * eff.revive);
          pre.push({ cmd: '-revive', args: ['p1a: M' + a.index, p.hp + '/' + p.maxhp], kw: {} });
        }
      }
      m.hp = p.hp;
      return pre.concat(this.passTurn());
    }

    /* Công thức bắt Gen 7 (Bulbapedia "Catch rate"), hệ số bóng theo wiki PokéOne. */
    throwBall(ball) {
      if (this.kind !== 'wild') return [{ cmd: 'p1-noball', args: [], kw: {} }];
      const p = this.sim.p2.active[0], foe = this.active('p2').mon;
      const me = this.sim.p1.active[0];
      const rate = info(foe.dex).catchRate || spec(foe.dex).catchRate || 45;
      const mult = (BALLS[ball] || BALLS.pokeball)({
        foeTypes: p.getTypes(), foeLevel: p.level, myLevel: me ? me.level : 1, turn: this.turn, dark: !!this.ctx.dark,
      });
      const st = p.status === 'slp' || p.status === 'frz' ? 2.5 : p.status ? 1.5 : 1;
      const a = mult >= 255 ? 255 : ((3 * p.maxhp - 2 * p.hp) * rate * mult) / (3 * p.maxhp) * st;
      let shakes = 0, caught = false;
      if (a >= 255) { shakes = 3; caught = true; }
      else {
        const b = 65536 / Math.pow(255 / a, 0.1875);
        while (shakes < 4 && rint(65536) < b) shakes++;
        caught = shakes === 4;
        shakes = Math.min(shakes, 3);
      }
      const ev = [{ cmd: 'p1-ball', args: [ball, 'p2a: ' + p.name, String(shakes), caught ? '1' : '0'], kw: {} }];
      if (caught) {
        foe.hp = p.hp; foe.status = p.status || ''; foe.ball = ball;
        if (ball === 'healball') { foe.hp = mon.stats(foe).hp; foe.status = ''; }
        if (ball === 'friendball') foe.happiness = 200;
        this.caught = foe;
        this.finish('caught');
        return ev;
      }
      return ev.concat(this.passTurn());
    }

    /* Công thức chạy trốn Gen 3+ (Bulbapedia "Escape"). */
    run() {
      if (this.kind !== 'wild') return [{ cmd: 'p1-norun', args: [], kw: {} }];
      const me = this.sim.p1.active[0], foe = this.sim.p2.active[0];
      this.runs++;
      const a = me.getStat('spe'), b = foe.getStat('spe');
      const ok = a >= b || rint(256) < ((Math.floor(a * 128 / Math.max(1, b)) + 30 * this.runs) % 256);
      const ev = [{ cmd: 'p1-run', args: [ok ? '1' : '0'], kw: {} }];
      if (ok) { this.finish('ran'); return ev; }
      return ev.concat(this.passTurn());
    }

    afterTurn(ev) {
      this.markFought();
      if (this.sim.ended) this.finish(this.sim.winner === 'p1' ? 'win' : this.sim.winner === 'p2' ? 'lose' : 'tie');
    }

    finish(result) {
      if (this.result) return;
      this.result = result;
      this.syncOut();
    }

    /* EXP khi một con của đối thủ ngất: công thức Gen 7, mỗi con đã ra sân nhận trọn phần (Gen VI+). */
    expFor(foeMon) {
      const set = this.fought.get(foeMon.uid) || new Set();
      const b = info(foeMon.dex).baseExp || spec(foeMon.dex).baseStats.hp;
      const a = this.kind === 'trainer' ? 1.5 : 1;
      const out = [];
      for (const uid of set) {
        const i = this.me.party.findIndex(m => m.uid === uid);
        if (i < 0) continue;
        const p = this.simMon('p1', i);
        if (!p || p.fainted || p.hp <= 0) continue;
        const L = foeMon.level, Lp = this.me.party[i].level;
        const exp = Math.floor(((a * b * L) / 5 * Math.pow((2 * L + 10) / (L + Lp + 10), 2.5) + 1) *
          (this.me.party[i].ot && this.me.party[i].ot !== this.me.name ? 1.5 : 1));
        out.push({ index: i, exp, evs: info(foeMon.dex).evs || {} });
      }
      return out;
    }

    /* Lên cấp giữa trận: cập nhật chỉ số trong sim để lượt sau đánh bằng chỉ số mới. */
    applyLevel(index) {
      const p = this.simMon('p1', index), m = this.me.party[index];
      const st = mon.stats(m);
      const lost = p.maxhp - p.hp;
      p.level = m.level; p.set.level = m.level;
      p.baseMaxhp = st.hp; p.maxhp = st.hp;
      p.hp = p.fainted ? 0 : Math.max(1, st.hp - lost);
      for (const s of STATS) if (s !== 'hp') { p.baseStoredStats[s] = st[s]; p.storedStats[s] = st[s]; }
      m.hp = p.hp;
    }
  }

  /* ---------- trận boss chung (co-op kiểu PokéOne) ---------- */

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // 1 người đánh đơn, 2 người đánh đôi Gen 7, 3 người đánh ba (Showdown chỉ có ở Gen 6) [đo 2026-09-28].
  const COOP_FORMAT = [null, 'gen7customgame@@@!Team Preview', 'gen7doublescustomgame@@@!Team Preview', 'gen6triplescustomgame@@@!Team Preview'];
  const COOP_TURNS = 60;
  const TARGETED = new Set(['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf']);
  const LETTER = 'abc';

  /*
   * Người chơi đứng chung phe p1 trên MỘT trận Showdown; phe p2 là đội của huấn luyện viên boss, n con đầu ra sân
   * (phe ít con hơn số ô làm sim sập, nên số người ≤ số Pokémon của boss). Mỗi máy dựng cùng một trận từ (seed, đội,
   * nhật ký lựa chọn) và áp cùng các mục nhật ký theo cùng thứ tự → cùng kết quả trên mọi máy (lockstep). Chủ phòng
   * chỉ quyết mục kế tiếp; xem NET.md §Boss.
   *
   * opt.players = [{ id, name, mons:[mon] }]  theo thứ tự vào phòng, mỗi người 1–3 con, con đầu ra sân ở ô của mình
   * opt.foes    = [mon]   đội boss, ≥ số người; opt.seed uint32
   *
   * Ô p1 thứ i do CHỦ của con đang đứng ở ô đó điều khiển. Khi một người hết Pokémon mà đồng đội còn dự bị, Showdown
   * bắt phải thay vào (không cho 'pass' [đo]) → con của đồng đội ra ô ấy và đồng đội điều khiển luôn ô đó.
   */
  class CoopBattle {
    constructor(opt) {
      this.players = opt.players;
      this.n = opt.players.length;
      this.foes = opt.foes;
      if (this.foes.length < this.n) throw new Error('boss team smaller than the party: ' + this.foes.length + ' < ' + this.n);
      this.roster = [];                                     // chỉ số k (tên sim 'M<k>') → { owner, mon }
      this.players.forEach((p) => this.roster.push({ owner: p.id, mon: p.mons[0] }));
      this.players.forEach((p) => p.mons.slice(1).forEach((m) => this.roster.push({ owner: p.id, mon: m })));
      this.log = []; this.cursor = 0; this.turn = 0; this.result = null;
      const r = mulberry(opt.seed >>> 0);
      this.sim = new Sim.Battle({ formatid: COOP_FORMAT[this.n], seed: [0, 0, 0, 0].map(() => Math.floor(r() * 65536)) });
      this.sim.setPlayer('p1', { name: 'p1', team: Sim.Teams.pack(this.roster.map((x, k) => packSet(x.mon, 'M' + k))) });
      this.sim.setPlayer('p2', { name: 'p2', team: Sim.Teams.pack(this.foes.map((m, i) => packSet(m, 'F' + i))) });
      this.roster.forEach((x, k) => syncIn(this.simMon('p1', k), x.mon));
      this.foes.forEach((m, i) => syncIn(this.simMon('p2', i), m));
    }

    simMon(side, index) {
      const key = (side === 'p1' ? 'M' : 'F') + index;
      return this.sim[side].pokemon.find((p) => p.name === key);
    }
    keyOf(p) { return +p.name.slice(1); }
    /* "p1b: M4" → { side, pos:'p1b', slot:1, index:4, mon, owner } */
    who(ident) {
      const m = /^(p[12])([a-c]?): ([MF])(\d+)$/.exec(ident || '');
      if (!m) return null;
      const side = m[1], index = +m[4];
      const x = side === 'p1' ? this.roster[index] : this.foes[index] && { owner: null, mon: this.foes[index] };
      if (!x) return null;
      let slot = m[2] ? LETTER.indexOf(m[2]) : -1;
      if (slot < 0) slot = this.sim[side].active.findIndex((p) => p && p.name === m[3] + index);
      return { side, pos: side + LETTER[Math.max(0, slot)], slot, index, mon: x.mon, owner: x.owner };
    }
    /* Con đang đứng ở ô `slot` của phe `side` (kể cả đã gục chưa thay), hoặc null. */
    at(side, slot) {
      const p = this.sim[side].active[slot];
      return p ? this.who(side + LETTER[slot] + ': ' + p.name) : null;
    }

    begin() { return this.drain(); }
    drain() { return drainLog(this); }

    /* Dự bị còn đánh được (không ở sân, chưa gục); owner = chỉ của một người. */
    bench(owner) {
      return this.roster.map((x, k) => ({ index: k, owner: x.owner, mon: x.mon, sim: this.simMon('p1', k) }))
        .filter((x) => (!owner || x.owner === owner) && !x.sim.isActive && !x.sim.fainted && x.sim.hp > 0);
    }

    /* Ai điều khiển từng ô p1 ở lượt chọn hiện tại (null = không ai: ô trống hoặc buộc 'pass'). */
    controllers() {
      const r = this.sim.p1.activeRequest, act = this.sim.p1.active, out = act.map(() => null);
      if (!r || r.wait || this.result) return out;
      if (!r.forceSwitch) {
        act.forEach((p, i) => { if (p && !p.fainted) out[i] = this.roster[this.keyOf(p)].owner; });
        return out;
      }
      const left = {};
      for (const x of this.bench()) left[x.owner] = (left[x.owner] || 0) + 1;
      r.forceSwitch.forEach((f, i) => {
        if (!f) return;
        const own = act[i] ? this.roster[this.keyOf(act[i])].owner : null;
        const who = own && left[own] ? own : (this.players.find((p) => left[p.id]) || {}).id;
        if (who) { left[who]--; out[i] = who; }
      });
      return out;
    }

    /* Mục tiêu hợp lệ của chiêu mv khi con ở ô i phe `side` dùng (trận 1 ô: rỗng, sim tự chọn). */
    targetsFor(side, i, target) {
      if (this.n < 2 || !TARGETED.has(target)) return [];
      const src = this.sim[side].active[i], foe = side === 'p1' ? 'p2' : 'p1', out = [];
      for (let s = 0; s < this.n; s++) {
        for (const loc of [s + 1, -(s + 1)]) {
          if (!this.sim.validTargetLoc(loc, src, target)) continue;
          const onSide = loc > 0 ? foe : side, p = this.sim[onSide].active[s];
          out.push({ loc, pos: onSide + LETTER[s], alive: !!(p && !p.fainted), ally: loc < 0 });
        }
      }
      const alive = out.filter((t) => t.alive).sort((a, b) => a.ally - b.ally || Math.abs(a.loc) - Math.abs(b.loc));
      return alive.length ? alive : out.slice(0, 1);
    }

    /*
     * Việc người `id` phải chọn lúc này, hoặc null. n = độ dài nhật ký (lượt chọn nào). bench = dự bị CỦA MÌNH.
     * slots[k] = { slot, kind:'move'|'switch', index, moves:[{ slot, id, name, pp, maxpp, disabled, targets }], trapped }
     */
    requestFor(id) {
      const r = this.sim.p1.activeRequest;
      if (!r || r.wait || this.result) return null;
      const slots = [];
      this.controllers().forEach((c, i) => {
        if (c !== id) return;
        const p = this.sim.p1.active[i];
        if (r.forceSwitch) { slots.push({ slot: i, kind: 'switch', index: p ? this.keyOf(p) : -1 }); return; }
        const a = r.active[i];
        slots.push({
          slot: i, kind: 'move', index: this.keyOf(p), trapped: !!(a.trapped || a.maybeTrapped),
          moves: a.moves.map((mv, k) => ({ slot: k + 1, id: mv.id, name: mv.move, pp: mv.pp, maxpp: mv.maxpp,
            disabled: !!mv.disabled, targets: this.targetsFor('p1', i, mv.target) })),
        });
      });
      return slots.length ? { n: this.log.length, slots, bench: this.bench(id) } : null;
    }

    /* pick { t:'move', m, tg } | { t:'switch', k } của ô i → chuỗi Showdown, hoặc null nếu không hợp lệ. */
    pickString(i, pick, owner, used) {
      const r = this.sim.p1.activeRequest;
      if (!pick || typeof pick !== 'object') return null;
      if (pick.t === 'switch') {
        if (r.active && r.active[i] && (r.active[i].trapped || r.active[i].maybeTrapped)) return null;
        const b = this.bench(owner).find((x) => x.index === pick.k);
        if (!b || used.has(b.index)) return null;
        used.add(b.index);
        return 'switch ' + (this.sim.p1.pokemon.indexOf(b.sim) + 1);
      }
      if (pick.t !== 'move' || r.forceSwitch) return null;
      const mv = r.active[i] && r.active[i].moves[(pick.m | 0) - 1];
      if (!mv || mv.disabled || (mv.pp === 0 && mv.maxpp != null)) return null;
      const tg = this.targetsFor('p1', i, mv.target);
      if (!tg.length) return 'move ' + (pick.m | 0);
      const t = tg.find((x) => x.loc === (pick.tg | 0)) || tg[0];
      return 'move ' + (pick.m | 0) + ' ' + t.loc;
    }

    /* AI một ô: chiêu gây sát thương tốt nhất lên mục tiêu tốt nhất; `wild` = tỉ lệ chọn bừa. */
    aiMove(side, i, wild) {
      const r = this.sim[side].activeRequest, a = r.active[i], user = this.sim[side].active[i];
      const usable = a.moves.map((mv, k) => ({ mv, k })).filter((x) => !x.mv.disabled && (x.mv.pp > 0 || x.mv.maxpp == null));
      if (!usable.length) return 'move 1';
      const foe = side === 'p1' ? 'p2' : 'p1';
      const opts = [];
      for (const x of usable) {
        const mv = Dex.moves.get(x.mv.id);
        const tg = this.targetsFor(side, i, x.mv.target);
        if (!tg.length) {
          const t = this.sim[foe].active.find((p) => p && !p.fainted);
          opts.push({ s: 'move ' + (x.k + 1), score: scoreMove(mv, user, t) });
          continue;
        }
        for (const t of tg) {
          if (t.ally && mv.category !== 'Status') continue;
          const p = this.sim[t.pos.slice(0, 2)].active[LETTER.indexOf(t.pos[2])];
          opts.push({ s: 'move ' + (x.k + 1) + ' ' + t.loc, score: t.ally ? 5 : scoreMove(mv, user, t.alive ? p : null) });
        }
      }
      if (!opts.length) return 'move 1';
      if (wild && rng() < wild) return opts[rint(opts.length)].s;
      return opts.reduce((b, o) => (o.score > b.score ? o : b)).s;
    }

    /* Chuỗi lựa chọn phe p1 từ picks { [ô]: pick }; ô thiếu hoặc sai → tự chọn. null khi p1 không phải chọn. */
    p1Choice(picks) {
      const r = this.sim.p1.activeRequest;
      if (!r || r.wait || this.result) return null;
      const ctrl = this.controllers(), used = new Set(), parts = [];
      this.sim.p1.active.forEach((p, i) => {
        if (r.forceSwitch) {
          if (!r.forceSwitch[i]) return;
          if (!ctrl[i]) { parts.push('pass'); return; }
          const s = this.pickString(i, picks && picks[i], ctrl[i], used);
          if (s) { parts.push(s); return; }
          const b = this.bench(ctrl[i]).find((x) => !used.has(x.index));
          used.add(b.index);
          parts.push('switch ' + (this.sim.p1.pokemon.indexOf(b.sim) + 1));
          return;
        }
        if (!p || p.fainted) { parts.push('pass'); return; }
        parts.push(this.pickString(i, picks && picks[i], ctrl[i], used) || this.aiMove('p1', i, 0));
      });
      return parts.join(', ');
    }

    /* AI phe boss: con gục thì tung con dự bị kế tiếp theo thứ tự đội; hết dự bị thì 'pass'. */
    foeChoice() {
      const r = this.sim.p2.activeRequest;
      if (!r || r.wait || this.result) return null;
      if (r.forceSwitch) {
        const bench = this.sim.p2.pokemon.filter((p) => !p.isActive && !p.fainted && p.hp > 0);
        return r.forceSwitch.filter(Boolean).map(() => {
          const p = bench.shift();
          return p ? 'switch ' + (this.sim.p2.pokemon.indexOf(p) + 1) : 'pass';
        }).join(', ');
      }
      return this.sim.p2.active.map((p, i) => (p && !p.fainted ? this.aiMove('p2', i, 0.2) : 'pass')).join(', ');
    }

    /* Chủ phòng: quyết mục nhật ký kế tiếp từ picks của mọi người. */
    decide(picks) { return [this.p1Choice(picks), this.foeChoice()]; }

    /*
     * Mọi máy (kể cả chủ phòng) áp một mục nhật ký [chuỗi p1, chuỗi p2]. Chuỗi sim từ chối → 'default' (sim tự chọn,
     * tất định). Trả mục đã được nhận để chủ phòng ghi lại đúng cái sim chấp nhận, và sự kiện để diễn.
     */
    apply(entry) {
      if (this.result) return { entry, events: [] };
      const acc = [null, null];
      ['p1', 'p2'].forEach((side, s) => {
        const c = entry && entry[s];
        const r = this.sim[side].activeRequest;
        if (c == null || !r || r.wait || this.sim.ended) return;
        if (this.sim.choose(side, c)) acc[s] = c;
        else { this.sim.choose(side, 'default'); acc[s] = 'default'; }
      });
      this.log.push(acc);
      const events = this.drain();
      if (this.sim.ended) this.result = this.sim.winner === 'p1' ? 'win' : 'lose';
      else if (this.turn > COOP_TURNS) this.result = 'lose';
      return { entry: acc, events };
    }

    /* HP / trạng thái / PP cuối của con thứ k bên p1, để chủ của nó chép về túi. */
    finalOf(k) {
      const p = this.simMon('p1', k);
      return { hp: p.hp, status: p.status || '', pp: p.moveSlots.map((s) => s.pp) };
    }
  }

  P1.Dex = Dex;
  P1.mon = mon;
  P1.Battle = Battle;
  P1.CoopBattle = CoopBattle;
  P1.mulberry = mulberry;
  P1.parseLine = parseLine;
  P1.BALLS = BALLS;
  P1.ITEM_EFFECT = ITEM_EFFECT;
})(window.P1 = window.P1 || {});
