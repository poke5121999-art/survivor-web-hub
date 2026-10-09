#!/usr/bin/env node
/*
 * Chợ Phiên — cần gạt sinh "người chơi khác" (bóng PvP) mặc định, không cần máy chủ (chủ dự án 2026-10-10: không dùng Supabase).
 *
 * Cách làm: cho bot thông minh chơi nhiều run mỗi hero (luật thật js/run/*), chụp bàn ngay trước trận PvP mỗi ngày,
 * lọc ra "người chơi tạm được" (thắng ≥ 50% quái cùng ngày trong sim), chọn 12-20 bóng/ngày đa dạng hero + kiểu bàn,
 * rồi ghi games/bazaar/data/ghosts.js:  window.BZ_GHOSTS = { v:1, byDay: { "1": [ghost...], ... "10": [...] } }
 * ghost = { name, hero, level, day, wins, healthMax, cards:[{id,tier,ench,socket,size,section}] }  (hình thẻ của sim)
 *
 * Chạy lại:  node games/bazaar/tools/ghosts.js            (cùng dữ liệu + cùng tham số ⇒ cùng tệp ra, tất định)
 *   RUNS=100   số run mỗi hero (mặc định 100)      PER_DAY=16   số bóng giữ mỗi ngày (12-20)
 *   SEED=7     hạt giống gốc                        MIN_WIN=0.5  ngưỡng thắng quái (nới dần nếu thiếu)
 *   DRY=1      chỉ in số liệu, không ghi tệp
 * Hero lấy từ BZRun.HEROES_PLAYABLE (hero nào có dữ liệu thẻ + luật cho chơi thì tự có mặt). Chạy lại khi thêm hero.
 * Các hằng bot (trọng số điểm, tính cách) là [ĐỀ XUẤT]: bản demo không có bot hay bóng thật (bóng nằm trên máy chủ).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
['cards', 'monsters', 'mode', 'encounters'].forEach(f => require(path.join(ROOT, 'games/bazaar/data/' + f + '.js')));
const R = require(path.join(ROOT, 'games/bazaar/js/run/index.js'));
const BZ = globalThis.BZSim;
const OUT = path.join(ROOT, 'games/bazaar/data/ghosts.js');
const RUNS = +(process.env.RUNS || 100);
const PER_DAY = Math.max(12, Math.min(20, +(process.env.PER_DAY || 16)));
const SEED = +(process.env.SEED || 7);
const MIN_WIN = +(process.env.MIN_WIN || 0.5);
const DRY = !!process.env.DRY;
const MAX_BYTES = 600 * 1024;

// ---------- số ngẫu nhiên tất định ----------
function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = n => Math.floor(f() * n);
  f.pick = a2 => a2[Math.floor(f() * a2.length)];
  return f;
}

// ---------- đặc trưng thẻ ----------
const infoCache = {};
const OFFENSE = ['DamageAmount', 'BurnApplyAmount', 'PoisonApplyAmount'];
const DEFENSE = ['ShieldApplyAmount', 'HealAmount', 'RegenApplyAmount'];
function info(id, tier) {
  const key = id + '|' + tier;
  if (infoCache[key]) return infoCache[key];
  const tpl = R.tpl(id), a = BZ.tierAttrs(tpl, tier) || {}, cd = (a.CooldownMax || 0) / 1000, mc = a.Multicast || 1;
  const off = ((a.DamageAmount || 0) + (a.BurnApplyAmount || 0) * 0.7 + (a.PoisonApplyAmount || 0) * 0.8) * mc;
  const def = ((a.ShieldApplyAmount || 0) * 0.8 + (a.HealAmount || 0) * 0.7 + (a.RegenApplyAmount || 0) * 1.5) * mc;
  const util = ((a.FreezeAmount || 0) * (a.FreezeTargets || 1) * 0.004 + (a.HasteAmount || 0) * (a.HasteTargets || 1) * 0.003 +
    (a.SlowAmount || 0) * (a.SlowTargets || 1) * 0.002 + (a.ChargeAmount || 0) * (a.ChargeTargets || 1) * 0.002) * mc;
  const per = cd > 0 ? 1 / cd : 0.12; // không có hồi chiêu = nội tại: giá trị nhỏ cố định
  const size = R.SIZE[tpl.Size] || 1, ti = R.tierIndex(tier);
  const tags = {}, refs = {};
  (tpl.Tags || []).forEach(t => { tags[t] = 1; });
  (tpl.HiddenTags || []).forEach(t => { if (/Reference$/.test(t)) refs[t.replace(/Reference$/, '')] = 1; else tags[t] = 1; });
  const o = { tpl, skill: R.isSkill(tpl), off: off * per, def: def * per, util: util * per, size, ti, tags, refs,
    base: (off + def + util) * per + 2 + 2.5 * ti, heroes: tpl.Heroes || [] };
  return (infoCache[key] = o);
}

// ---------- bot ----------
const FOCUS = ['Burn', 'Poison', 'Freeze', 'Shield', 'Heal', 'Haste', 'Slow', 'Crit', 'Charge', 'Regen', 'Ammo', 'Weapon', 'Damage', 'Flying', 'Health', 'Tech', 'Aquatic', 'Friend', 'Tool'];
function personality(r) {
  return { focus: r.pick(FOCUS), focusW: 0.15 + r() * 0.35, defTarget: 0.12 + r() * 0.36, noise: r() * 0.25, startItem: r() < 0.4,
    rerollGold: 6 + r.int(8), merchantBias: 0.5 + r() * 0.5, riskSeek: r() };
}
function boardItems(run) { return run.board.hand.concat(run.board.stash).map(c => info(c.id, c.tier)).filter(x => !x.skill); }
function balance(items) {
  let o = 0, d = 0; items.forEach(x => { o += x.off; d += x.def; });
  return o + d > 0 ? d / (o + d) : 0.3;
}
// Điểm một thẻ trong bối cảnh bàn hiện có
function score(run, P, id, tier, ench, items, noiseR) {
  const x = info(id, tier);
  let s = x.base / Math.pow(x.size, 0.45);
  if (x.skill) return 7 + 3.5 * x.ti + (noiseR ? noiseR() * 2 : 0);
  let syn = 0;
  items.forEach(b => {
    for (const r in x.refs) if (b.tags[r]) syn += 1.2;
    for (const r in b.refs) if (x.tags[r]) syn += 1.2;
    for (const t in x.tags) if (b.tags[t] && t !== 'Damage' && t !== 'Weapon') syn += 0.15;
  });
  s *= 1 + 0.1 * Math.min(syn, 8);
  if (x.heroes.indexOf(run.hero) >= 0) s *= 1.2; else if (x.heroes.indexOf('Common') < 0) s *= 0.9;
  if (x.tags[P.focus]) s *= 1 + P.focusW;
  if (ench) s *= 1.12;
  const bal = balance(items);
  if (x.def > x.off && bal < P.defTarget) s *= 1.25;
  else if (x.off >= x.def && bal > P.defTarget + 0.25) s *= 1.2;
  else if (x.def > x.off && bal > P.defTarget + 0.2) s *= 0.8;
  if (noiseR) s *= 1 + (noiseR() - 0.5) * P.noise;
  return s;
}
function ownScore(run, P, ci) { return score(run, P, ci.id, ci.tier, ci.ench, boardItems(run)); }
function weakest(run, P) {
  let best = null, bs = Infinity;
  run.board.hand.concat(run.board.stash).forEach(c => { const s = ownScore(run, P, c); if (s < bs) { bs = s; best = c; } });
  return best ? { ci: best, score: bs } : null;
}
// Giá trị mua một thẻ (đã trừ thẻ phải bán nếu hết chỗ); null nếu không đáng/không làm được
function buyGain(run, P, card, price, noiseR) {
  const x = info(card.id, card.tier), items = boardItems(run);
  if (x.skill) {
    if (run.board.skills.some(c => c.id === card.id)) return null;
    if (run.board.skills.length >= R.TUNING.SKILL_SLOTS) {
      let w = Infinity; run.board.skills.forEach(c => { w = Math.min(w, score(run, P, c.id, c.tier, c.ench, items)); });
      const s = score(run, P, card.id, card.tier, card.ench, items, noiseR);
      return s > w * 1.3 ? s - w : null;
    }
    return score(run, P, card.id, card.tier, card.ench, items, noiseR);
  }
  const same = run.board.hand.concat(run.board.stash).find(c => c.id === card.id && c.tier === card.tier && !(c.ench && card.ench && c.ench !== card.ench));
  let s = score(run, P, card.id, card.tier, card.ench, items, noiseR);
  if (same && x.ti < 3 && BZ.nextTier(x.tpl, card.tier)) {
    const nt = BZ.nextTier(x.tpl, card.tier);
    return Math.max(0.1, score(run, P, card.id, nt, same.ench, items) - s * 0.5) * 1.5 + s * 0.3;
  }
  if (R.firstFit(run, 'hand', x.size) < 0 && !same) {
    // tay đã đầy: chỉ mua nếu hơn hẳn thẻ yếu nhất trong tay
    let wh = Infinity; run.board.hand.forEach(c => { wh = Math.min(wh, ownScore(run, P, c)); });
    if (s < wh * 1.15) return null;
  }
  if (!R.canGain(run, card)) {
    const w = weakest(run, P);
    if (!w || s < w.score * 1.25) return null;
    return s - w.score;
  }
  return s;
}

function arrange(run, P) {
  const stash = run.board.stash.slice().sort((a, b) => ownScore(run, P, b) - ownScore(run, P, a));
  // 1) thẻ từ kho vào ô tay trống
  for (const c of stash) {
    const k = R.firstFit(run, 'hand', c.size);
    if (k >= 0) return { t: 'move', uid: c.uid, section: 'hand', socket: k };
  }
  // 2) đổi chỗ thẻ kho mạnh hơn hẳn thẻ trong tay (lệnh swap của luật)
  const hand = run.board.hand.slice().sort((a, b) => ownScore(run, P, a) - ownScore(run, P, b));
  for (const sc of stash) {
    const ss = ownScore(run, P, sc);
    for (const h of hand) {
      if (ss < ownScore(run, P, h) * 1.15) break;
      const cmd = { t: 'swap', a: sc.uid, b: h.uid };
      if (R.apply(run, cmd).ok) return cmd;
    }
  }
  // 3) bán đồ rác trong kho (yếu hẳn so với tay, không phải bản nhập được)
  const hs = run.board.hand.map(h => ownScore(run, P, h)), avg = hs.length ? hs.reduce((x, y) => x + y, 0) / hs.length : 0;
  for (const c of stash.slice().reverse()) {
    const dup = run.board.hand.concat(run.board.stash).some(o => o.uid !== c.uid && o.id === c.id);
    if (!dup && ownScore(run, P, c) < avg * 0.55 && hs.length >= 4) return { t: 'sell', uid: c.uid };
  }
  return null;
}

function sellWeakest(run, P, below) {
  const w = weakest(run, P);
  return w && (below == null || w.score < below) ? { t: 'sell', uid: w.ci.uid } : null;
}

function pveBoardOf(o) {
  const c = R.enc().combats[o.id], m = (globalThis.BZ_MONSTERS || []).find(x => x.Id === c.Monster);
  return m ? BZ.boardFromMonster(m, 'm') : null;
}

function botStep(run, P, st, br) {
  const ph = run.phase, L = R.legal(run), has = t => L.filter(c => c.t === t);
  const key = run.day + '.' + run.hour + '.' + ph.kind;
  if (st.arrKey !== key) { st.arrKey = key; st.arrN = 0; }
  if (['choose', 'merchant', 'event', 'loot', 'levelUp', 'fight'].indexOf(ph.kind) >= 0 && st.arrN < 8) {
    const mv = arrange(run, P);
    if (mv && R.apply(run, mv).ok) { st.arrN++; return mv; }
  }
  switch (ph.kind) {
    case 'heroSelect': return { t: 'pickHero', hero: P.hero };
    case 'choose': {
      if (run.hour === R.TUNING.PVE_HOUR) {
        // chọn quái bậc cao nhất mà bàn hiện tại thắng được (sim thử); không thắng được cái nào thì lấy bậc thấp nhất
        // thử từ bậc cao xuống: thắng được (1 trận sim) thì lấy luôn; không thắng được cái nào thì bậc thấp nhất
        const me = R.playerBoard(run), order = ph.options.map((o, i) => i).sort((x, y) => R.tierIndex(ph.options[y].tier) - R.tierIndex(ph.options[x].tier));
        let pick = order[order.length - 1];
        for (let k = 0; k < order.length - 1; k++) {
          const b = pveBoardOf(ph.options[order[k]]); if (!b) continue;
          if (P.riskSeek < 0.3 && k === 0 && run.day < 3) continue; // tính cách rụt rè: bỏ qua bậc cao ở ngày đầu
          const r = BZ.run({ boards: [JSON.parse(JSON.stringify(me)), b], seed: 11, combatType: 'PVE', day: run.day, hour: 3, frames: false });
          if (r.winner === 0) { pick = order[k]; break; }
        }
        return { t: 'pick', i: pick };
      }
      const prefer = o => {
        let v = o.type === 'merchant' ? (run.gold >= 4 ? 5 * P.merchantBias + Math.min(run.gold, 30) / 8 : 0.5) : 2;
        if (o.kind === 'pile') v += 3; else if (o.kind === 'instant') v += 2;
        if (o.type === 'merchant' && /Sells/.test(o.desc || '')) v += 0.5;
        return v + R.tierIndex(o.tier) * 0.1;
      };
      let bi = 0; ph.options.forEach((o, i) => { if (prefer(o) > prefer(ph.options[bi])) bi = i; });
      return { t: 'pick', i: bi };
    }
    case 'merchant': {
      let best = null, bg = 0.2;
      has('buy').forEach(c => { const s = ph.stock[c.i]; const g = buyGain(run, P, s.card, s.price, st.nr); if (g != null && g > bg) { bg = g; best = c; } });
      if (best) {
        const s = ph.stock[best.i];
        if (!R.canGain(run, s.card) && !info(s.card.id, s.card.tier).skill) { const sw = sellWeakest(run, P); if (sw && st.sellGuard++ < 40) return sw; }
        else if (!R.canGain(run, s.card)) { const sk = run.board.skills.slice().sort((a, b) => score(run, P, a.id, a.tier, a.ench, []) - score(run, P, b.id, b.tier, b.ench, []))[0]; if (sk) return { t: 'sell', uid: sk.uid }; }
        else return best;
      }
      // đồ có thể mua mà chưa đáng: nếu thừa vàng thì xáo lại
      if (has('reroll').length && run.gold >= P.rerollGold && st.rerolled < 3) { st.rerolled++; return { t: 'reroll' }; }
      st.rerolled = 0; st.sellGuard = 0;
      return { t: 'leave' };
    }
    case 'event': case 'levelUp': case 'fates': {
      const cs = has('choose');
      if (cs.length) {
        const val = c => {
          const ch = ph.choices[c.i];
          if (ph.kind === 'event' && ph.eventId === 'start') return ch.key === 'income' ? (P.startItem ? 1 : 3) : ch.key === 'item' ? (P.startItem ? 3 : 1.5) : 1;
          if (ph.kind === 'fates') return ch.id === 'legacy' ? 3 : ch.id === 'vitality' ? 2 : 2.5;
          if (ch.card) return 2 + score(run, P, ch.card.id, ch.card.tier, ch.card.ench, boardItems(run)) / 4;
          if (ch.kind === 'pile') return /Skill/.test(ch.desc || '') ? 3 : 4;
          if (ch.kind === 'step') return /Upgrade/.test(ch.desc || ch.name || '') ? 4.5 : 2.5;
          return 2;
        };
        return cs.reduce((a, b) => val(b) > val(a) ? b : a);
      }
      if (has('leave').length) return { t: 'leave' };
      break;
    }
    case 'loot': {
      const cs = has('choose');
      if (cs.length) {
        const pick = cs.reduce((a, b) => { const sa = buyGain(run, P, ph.picks[a.i].card, 0, null), sb = buyGain(run, P, ph.picks[b.i].card, 0, null); return (sb == null ? -1 : sb) > (sa == null ? -1 : sa) ? b : a; });
        return pick;
      }
      // hết chỗ: bán thẻ yếu nhất rồi thử lại (không quá 3 lần mỗi pha)
      const key2 = run.day + '.' + run.hour + '.loot';
      if (st.lootKey !== key2) { st.lootKey = key2; st.lootSold = 0; }
      const sw = ph.picks.length && st.lootSold < 3 ? sellWeakest(run, P) : null;
      if (sw) { st.lootSold++; return sw; }
      return { t: 'leave' };
    }
    case 'pedestal': {
      const cs = has('choose');
      if (cs.length) { const sc = i => { const c = R.findCard(run, ph.eligible[i]); return c ? ownScore(run, P, c) : 0; }; return cs.reduce((a, b) => sc(b.i) > sc(a.i) ? b : a); }
      return { t: 'leave' };
    }
    case 'fight': return { t: 'fight' };
    case 'fightResult': return { t: 'next' };
  }
  const any = has('leave')[0] || has('next')[0] || has('choose')[0];
  if (any) return any;
  const sw = sellWeakest(run, P); if (sw) return sw;
  return null;
}

function snapshot(run) {
  const cards = [];
  ['hand', 'stash', 'skills'].forEach(sec => run.board[sec].forEach(c => cards.push({ id: c.id, tier: c.tier, ench: c.ench || null, socket: c.socket, size: c.size, section: sec })));
  return { hero: run.hero, day: run.day, wins: run.wins, level: run.level, healthMax: run.healthMax, cards };
}

function playRun(hero, seed) {
  const P = personality(rng(seed * 7919 + 13)); P.hero = hero;
  const st = { nr: rng(seed * 31 + 5), rerolled: 0, sellGuard: 0, arrKey: '', arrN: 0 };
  let run = R.newRun({ hero, seed }), n = 0;
  const snaps = [];
  let pending = null;
  while (run.phase.kind !== 'end') {
    if (++n > 6000) throw new Error('bot kẹt (6000 lệnh) ở pha ' + run.phase.kind);
    let cmd = botStep(run, P, st);
    if (cmd && cmd.t === 'fight' && run.phase.combatType === 'PVP') pending = snapshot(run);
    if (!cmd) throw new Error('bot không có lệnh hợp lệ ở pha ' + run.phase.kind);
    let r = R.apply(run, cmd);
    if (!r.ok) {
      // lệnh bot đề xuất bị từ chối: lui về lệnh an toàn
      const L = R.legal(run).filter(c => c.t !== 'move' && c.t !== 'sell' && c.t !== 'buy' && c.t !== 'reroll');
      cmd = L[0] || R.legal(run).filter(c => c.t === 'sell')[0];
      if (!cmd) throw new Error('bot kẹt, lệnh bị từ chối: ' + r.events[0].reason);
      r = R.apply(run, cmd);
      if (!r.ok) throw new Error('lệnh dự phòng cũng bị từ chối: ' + r.events[0].reason);
    }
    run = r.run;
    if (pending && run.phase.kind === 'fightResult' && run.phase.combatType === 'PVP') { pending.beatOld = run.phase.won; snaps.push(pending); pending = null; }
  }
  return { snaps, run };
}

// ---------- đánh giá ----------
function ghostBoard(g, prefix) {
  return { name: g.name || 'ghost', hero: g.hero, level: g.level, healthMax: g.healthMax,
    cards: g.cards.map((c, i) => ({ uid: prefix + i, id: c.id, tier: c.tier, ench: c.ench, socket: c.socket, size: c.size, owner: null, section: c.section })) };
}
const monCache = {};
function monstersFor(day) {
  if (monCache[day]) return monCache[day];
  const E = R.enc().combats, T = R.TUNING, byId = {}; (globalThis.BZ_MONSTERS || []).forEach(m => { byId[m.Id] = m; });
  const out = [];
  T.PVE_SLOTS.forEach(slot => {
    const list = [];
    Object.keys(E).forEach(id => {
      const c = E[id], m = byId[c.Monster];
      if (!m || !c.Gold || T.PVE_EXCLUDE.test(c.InternalName || '') || slot.tiers.indexOf(c.StartingTier) < 0) return;
      const L = ((m.Player || {}).Attributes || {}).Level || 1;
      if (L >= day + slot.lo && L <= day + slot.hi) list.push(m);
    });
    list.sort((a, b) => (a.Id < b.Id ? -1 : 1));
    const seen = {}; list.forEach(m => { if (!seen[m.Id]) { seen[m.Id] = 1; out.push(m); } });
  });
  // tối đa 8 quái, chia đều theo thứ tự đã sắp (tất định)
  const step = Math.max(1, out.length / 8), pick = [];
  for (let i = 0; i < out.length && pick.length < 8; i += step) pick.push(out[Math.floor(i)]);
  return (monCache[day] = pick.map(m => BZ.boardFromMonster(m, 'm')));
}
function winVsMonsters(g, day) {
  const ms = monstersFor(day); let w = 0, n = 0;
  ms.forEach((mb, i) => {
    const r = BZ.run({ boards: [ghostBoard(g, 'g'), JSON.parse(JSON.stringify(mb))], seed: 100 + i, combatType: 'PVE', day, hour: 3, frames: false });
    n++; if (r.winner === 0) w++;
  });
  return n ? w / n : 0;
}
function oldGhosts(day, k) {
  const out = [];
  for (let i = 0; i < k; i++) { const run = R.newRun({ hero: R.HEROES_PLAYABLE[0], seed: 500 + i }); run.day = day; out.push(R.ENCOUNTERS.combat.ghost(run).board); }
  return out;
}
function duel(a, b, day, seed) {
  const r = BZ.run({ boards: [a, b], seed, combatType: 'PVP', day, hour: 5, frames: false });
  return r.winner === 0 ? 1 : 0;
}

// ---------- tên ----------
const ADJ = ['Silent', 'Rusty', 'Lucky', 'Crimson', 'Quick', 'Mellow', 'Grim', 'Neon', 'Dusty', 'Frosty', 'Salty', 'Tiny', 'Brave', 'Sneaky', 'Wobbly', 'Golden', 'Cosmic', 'Sleepy', 'Jolly', 'Rogue', 'Mighty', 'Foggy', 'Spicy', 'Velvet', 'Hollow', 'Zesty', 'Gloomy', 'Turbo', 'Pixel', 'Odd'];
const NOUN = ['Fox', 'Pickle', 'Barnacle', 'Otter', 'Wizard', 'Goblin', 'Teapot', 'Falcon', 'Moth', 'Walrus', 'Comet', 'Biscuit', 'Raven', 'Gizmo', 'Mango', 'Badger', 'Lantern', 'Pigeon', 'Cobra', 'Anchor', 'Noodle', 'Yeti', 'Sparrow', 'Mantis', 'Kettle', 'Newt', 'Beetle', 'Crab', 'Nimbus', 'Tinker'];
function makeName(r, used) {
  for (let t = 0; t < 50; t++) {
    const a = r.pick(ADJ), b = r.pick(NOUN), num = r.int(100), form = r.int(5);
    let nm = form === 0 ? a + b + num : form === 1 ? (a + '_' + b).toLowerCase() + num : form === 2 ? b + (10 + r.int(990)) : form === 3 ? a.toLowerCase() + b + '_' + num : a + b;
    if (!used[nm]) { used[nm] = 1; return nm; }
  }
  return 'Player' + r.int(100000);
}

// ---------- kiểu bàn ----------
const ARCH = ['Burn', 'Poison', 'Freeze', 'Shield', 'Heal', 'Haste', 'Slow', 'Crit', 'Charge', 'Regen', 'Ammo', 'Flying', 'Weapon', 'Tech', 'Aquatic', 'Friend', 'Tool', 'Health', 'Damage'];
function archetype(g) {
  const cnt = {};
  g.cards.forEach(c => { const x = info(c.id, c.tier); if (x.skill) return; for (const t in x.tags) cnt[t] = (cnt[t] || 0) + 1; });
  let best = 'Damage', bn = -1;
  ARCH.forEach(t => { if ((cnt[t] || 0) > bn + (t === 'Damage' || t === 'Weapon' ? 0 : 0.5)) { best = t; bn = cnt[t] || 0; } });
  return best;
}

// ---------- chính ----------
function main() {
  const t0 = Date.now(), heroes = R.HEROES_PLAYABLE.slice();
  console.log('hero chơi được: ' + heroes.join(', ') + ' | ' + RUNS + ' run/hero, hạt giống ' + SEED);
  const cand = {}; for (let d = 1; d <= 10; d++) cand[d] = [];
  let runs = 0, errors = 0;
  // các run độc lập ⇒ chia cho tiến trình con (kết quả gom lại theo thứ tự công việc nên vẫn tất định)
  const jobs = [], CH = 10;
  heroes.forEach((hero, hi) => { for (let a = 0; a < RUNS; a += CH) jobs.push({ hero, hi, from: a, to: Math.min(RUNS, a + CH) }); });
  const CACHE = process.env.CACHE; // đường dẫn tệp tạm: lưu/đọc ứng viên để chỉnh khâu chọn mà khỏi chơi lại (chỉ để dev)
  if (CACHE && fs.existsSync(CACHE)) { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); console.log('  đọc ứng viên từ ' + CACHE); return Promise.resolve(c.results).then(results => proceed(results)); }
  return runJobs(jobs).then(results => { if (CACHE) fs.writeFileSync(CACHE, JSON.stringify({ results })); return proceed(results); });
  function proceed(results) {
    results.forEach(res => { runs += res.runs; errors += res.errors; res.errs.forEach(m => console.log('  lỗi ' + m)); res.snaps.forEach(s => { if (s.day >= 1 && s.day <= 10) cand[s.day].push(s); }); });
    console.log('  chơi xong (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    finish(heroes, cand, runs, errors, t0);
  }
}
function runJobs(jobs) {
  const cp = require('child_process'), N = Math.max(1, Math.min(10, require('os').cpus().length - 2)), out = new Array(jobs.length);
  let next = 0, done = 0;
  return new Promise(resolve => {
    function spawn() {
      const c = cp.fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      c.on('message', m => { if (m.ready) return pump(c); out[m.i] = m.res; done++; if (done === jobs.length) { c.kill(); resolve(out); } else pump(c); });
    }
    function pump(c) { if (next < jobs.length) { const i = next++; c.send({ i, job: jobs[i] }); } else c.kill(); }
    for (let k = 0; k < Math.min(N, jobs.length); k++) spawn();
  });
}
function doJob(job) {
  const res = { runs: 0, errors: 0, errs: [], snaps: [] };
  for (let i = job.from; i < job.to; i++) {
    try { const r = playRun(job.hero, SEED * 100000 + job.hi * 1000 + i + 1); res.runs++;
      r.snaps.forEach(g => { if (g.day >= 1 && g.day <= 10) { g.win = winVsMonsters(g, g.day); g.arch = archetype(g); res.snaps.push(g); } }); }
    catch (e) { res.errors++; res.errs.push(job.hero + ' #' + i + ': ' + e.message); }
  }
  return res;
}
function finish(heroes, cand, runs, errors, t0) {
  const byDay = {}, rep = [], used = {}, nameR = rng(SEED * 17 + 3);
  let totalBytes = 0;
  for (let d = 1; d <= 10; d++) {
    const pool = cand[d];
    pool.forEach((g, i) => { g.i = i; });
    // loại trùng bàn y hệt
    const seen = {}, uniq = pool.filter(g => { const k = g.hero + JSON.stringify(g.cards.map(c => [c.id, c.tier, c.ench, c.socket])); if (seen[k]) return false; seen[k] = 1; return true; });
    // "tạm được" = thắng quái ≥ ngưỡng, nhưng bỏ nhóm mạnh nhất (trên phân vị 65 của ngày): bóng phải ngang người chơi thường, không phải bàn tối ưu
    const ws = uniq.map(g => g.win).sort((a, b) => a - b), cap = Math.max(MIN_WIN, ws[Math.floor(ws.length * 0.65)] || 1);
    let thr = MIN_WIN, ok = uniq.filter(g => g.win >= thr && g.win <= cap);
    while (ok.length < PER_DAY && thr > 0.2) { thr -= 0.05; ok = uniq.filter(g => g.win >= thr && g.win <= cap); }
    if (ok.length < PER_DAY) ok = uniq.filter(g => g.win >= thr);
    if (ok.length < PER_DAY) ok = uniq.slice().sort((a, b) => b.win - a.win).slice(0, Math.max(PER_DAY, 12));
    // chọn đa dạng: lần lượt lấy bóng làm ít hero/kiểu đã có nhất, hoà thì thắng quái nhiều hơn rồi chỉ số
    const hc = {}, ac = {}, kept = [], left = ok.slice().sort((a, b) => a.i - b.i);
    while (kept.length < PER_DAY && left.length) {
      let bi = 0, bs = Infinity;
      left.forEach((g, i) => { const sc = (hc[g.hero] || 0) * 10 + (ac[g.arch] || 0) * 3 + Math.abs(g.win - 0.55) * 4 + g.i * 1e-6; if (sc < bs) { bs = sc; bi = i; } });
      const g = left.splice(bi, 1)[0]; kept.push(g); hc[g.hero] = (hc[g.hero] || 0) + 1; ac[g.arch] = (ac[g.arch] || 0) + 1;
    }
    kept.sort((a, b) => a.i - b.i);
    byDay[d] = kept.map(g => ({ name: makeName(nameR, used), hero: g.hero, level: g.level, day: g.day, wins: g.wins, healthMax: g.healthMax, cards: g.cards }));
    // thống kê
    const olds = oldGhosts(d, 4), keptNew = byDay[d];
    let vsOldKept = 0, nOld = 0, botVsKept = 0, nBot = 0, winM = 0;
    keptNew.forEach((g, ki) => {
      winM += kept[ki].win;
      olds.forEach((ob, oi) => { const o = JSON.parse(JSON.stringify(ob)); o.cards.forEach((c, i) => { c.uid = 'o' + i; }); vsOldKept += duel(ghostBoard(g, 'g'), o, d, 900 + oi); nOld++; });
    });
    // "bot" = toàn bộ ứng viên (quần thể người chơi bot) đấu bóng đã giữ
    const sample = uniq.filter((_, i) => i % Math.max(1, Math.floor(uniq.length / 20)) === 0).slice(0, 20);
    keptNew.forEach((g, ki) => sample.forEach((b, bi) => { if (b !== kept[ki]) { botVsKept += duel(ghostBoard(b, 'b'), ghostBoard(g, 'g'), d, 1200 + bi); nBot++; } }));
    const per = {}; keptNew.forEach(g => { per[g.hero] = (per[g.hero] || 0) + 1; });
    rep.push({ d, cand: pool.length, uniq: uniq.length, thr, kept: keptNew.length, per, winM: winM / Math.max(1, keptNew.length), vsOld: vsOldKept / Math.max(1, nOld), botVsNew: botVsKept / Math.max(1, nBot),
      beatOld: pool.reduce((s, g) => s + (g.beatOld ? 1 : 0), 0) / Math.max(1, pool.length), arch: Object.keys(ac).length });
  }
  const json = JSON.stringify({ v: 1, byDay });
  const body = '/* generated by games/bazaar/tools/ghosts.js (bot thông minh chơi luật thật, lọc bằng sim) - do not edit.\n   Bóng PvP mặc định thay máy chủ: ' + heroes.join(', ') + '; ' + RUNS + ' run/hero, hạt giống ' + SEED + '.\n   Rerun: node games/bazaar/tools/ghosts.js */\n(function(g){g.BZ_GHOSTS=' + json + ';})(typeof window!==\'undefined\'?window:globalThis);\n';
  totalBytes = Buffer.byteLength(body);
  console.log('\nrun đã chơi: ' + runs + ' (lỗi ' + errors + '), ứng viên: ' + Object.keys(cand).map(d => cand[d].length).reduce((a, b) => a + b, 0) + ', ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  console.log('ngày | ứng viên | giữ | ngưỡng | thắng quái TB | bot ngày đó thắng bóng cũ(quái) | bóng mới thắng bóng cũ | bot thắng bóng mới | kiểu | hero');
  rep.forEach(r => console.log([r.d, r.cand, r.kept, r.thr.toFixed(2), (r.winM * 100).toFixed(0) + '%', (r.beatOld * 100).toFixed(0) + '%', (r.vsOld * 100).toFixed(0) + '%', (r.botVsNew * 100).toFixed(0) + '%', r.arch, JSON.stringify(r.per)].join(' | ')));
  console.log('kích thước: ' + (totalBytes / 1024).toFixed(0) + ' KB' + (totalBytes > MAX_BYTES ? '  VƯỢT 600 KB!' : ''));
  console.log('sim errors: ' + BZ.errors.length);
  if (totalBytes > MAX_BYTES) process.exit(2);
  if (!DRY) { fs.writeFileSync(OUT, body); console.log('đã ghi ' + path.relative(ROOT, OUT)); }
}
if (process.argv.indexOf('--worker') >= 0) {
  process.on('message', m => { process.send({ i: m.i, res: doJob(m.job) }); });
  process.send({ ready: 1 });
} else if (require.main === module) main();
