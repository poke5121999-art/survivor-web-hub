// Economy of the original, driven by data/meta.json (tools/build_meta.py): items, XP road, level-mode road, modes, theme.
// Rewards are granted through one table keyed by resource kind; unlock texts through one table keyed by unlock method.
import { owns, grant } from './save.js';

const KINDS = { skin: 'skins', rope: 'ropes', trail: 'trails' };
export const XP_ROAD = 'progression.xp';
export const NORMAL_ROAD = 'achieved_level_mode.normal';
export const CHALLENGE_LEVELS = 'unlocked_level_mode.challenge';
export const SKIP_TICKETS = 'currency.skip_tickets';
// Quantities without a field of their own (save.inv), keyed by resource id
export const qty = (s, res) => s.inv[res] || 0;
export const addQty = (s, res, q) => { s.inv[res] = qty(s, res) + q; };

function hex(c) {
  const n = parseInt(c.slice(1), 16), a = c.length > 7 ? (n & 255) / 255 : 1;
  const v = c.length > 7 ? n >>> 8 : n;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, a];
}

// How each unlock method fills its textTemplate's {0}, and whether this build can reach it (`live`).
const UNLOCK = {
  default_item: { live: true },
  progression_road_progression_xp: { live: true, arg: (m, it) => m.rankOf(it.value) },
  progression_road_achieved_level_mode_normal: { live: true, arg: (m, it) => it.value },
  progression_road_achieved_level_mode_challenge: { live: true, arg: (m, it) => it.value },
  progression_road_achieved_level_mode_grapple: { live: true, arg: (m, it) => it.value },
  seasonal_event_mode_easter_event: { live: true },
  seasonal_event_mode_valentine_day: { live: true },
  progression_road_progression_cards_perk_level: { arg: (m, it) => it.value },
  lucky_wheel: { live: true },
  piggy_bank: { live: true },
  pachinko: { live: true },
};

export class Meta {
  constructor(d) {
    this.d = d;
    this.items = d.items.map((a) => {
      const it = Object.fromEntries(d.itemFields.map((f, i) => [f, a[i]]));
      const [prefix, name] = it.id.split('.');
      it.kind = KINDS[prefix];
      it.name = name;
      it.asset = it.asset || name.replace(/_/g, '');
      it.rarity = d.rarityIds[it.rarity];
      it.unlock = d.unlockIds[it.unlock];
      it.fx = it.fx ? d.fx[it.fx - 1] : null;
      it.title = a[6];
      return it;
    });
    for (const i of d.noShadow) this.items[i].noShadow = true;
    this.byId = new Map(this.items.map((it) => [it.id, it]));
    this.xpRoad = d.roads[XP_ROAD];
  }

  item(kind, name) { return this.byId.get(Object.keys(KINDS).find((k) => KINDS[k] === kind) + '.' + name); }

  // theme.levelColors cycles every nbLevelsPerTheme levels: [camera, effect, shadow, targets, finishLight, walls]
  // (4 levels: the server value seen in every clip, tools/build_meta.py NB_LEVELS_PER_THEME)
  theme(levelIndex) {
    const t = this.d.theme;
    return colors(t.levels[Math.floor(levelIndex / t.perTheme) % t.levels.length]);
  }

  // ThemeService.SetGameModeTheme: a mode listed in theme.gameModes uses its colours, any other mode (Grapple) gets
  // levelColors[0] [asm 0x118fc4c..0x118fcc8]. Normal cycles with the level (theme above).
  themeFor(modeId, levelIndex) {
    if (modeId === 'mode.normal') return this.theme(levelIndex);
    const t = this.d.theme;
    return colors(t.modes[modeId] || t.levels[0]);
  }

  // How much of `res` the reached steps of a road grant (each XP road step grants one Challenge level).
  roadGranted(road, res, value) {
    let n = 0;
    for (const [v, rewards] of this.d.roads[road]) if (v <= value) for (const [r, q] of rewards) if (r === res) n += q;
    return n;
  }

  // Rank = 1-based position of the last XP road step reached. [ĐỀ XUẤT] the original fills {{level}} from the road state.
  rankOf(xp) {
    let r = 0;
    for (const s of this.xpRoad) if (s[0] <= xp) r++;
    return Math.max(1, r);
  }

  xpBar(xp) {
    const steps = this.xpRoad, i = Math.max(0, this.rankOf(xp) - 1);
    const lo = steps[i][0], hi = steps[i + 1] ? steps[i + 1][0] : lo;
    return { rank: i + 1, lo, hi, k: hi > lo ? (xp - lo) / (hi - lo) : 1, league: this.league(xp) };
  }

  league(xp) {
    let id = null;
    for (const s of this.xpRoad) if (s[0] <= xp && s[2]) id = s[2];
    return this.d.leagues[id] || '';
  }

  unlockInfo(it) {
    const u = UNLOCK[it.unlock] || {};
    const tpl = this.d.unlocks[this.d.unlockIds.indexOf(it.unlock)] || '';
    return { text: tpl.replace('{0}', u.arg ? u.arg(this, it) : ''), live: !!u.live };
  }

  // Unlock XP of an item, plus the collection's XP once every item of it is owned.
  grantItem(s, it, out) {
    if (owns(s, it.kind, it.name)) return;
    grant(s, it.kind, it.name);
    s.xp += it.xp;
    out.push({ item: it });
    const col = it.collection;
    if (s.collections.includes(col)) return;
    if (this.items.every((o) => o.collection !== col || owns(s, o.kind, o.name))) {
      s.collections.push(col);
      s.xp += this.d.collections[col][4];
      out.push({ collection: col });
    }
  }

  // One reward [resourceId, qty] -> save. Kinds without a system in this build go to `pending`.
  grantReward(s, [res, q], out) {
    const kind = res.split('.')[0];
    const by = REWARDS[kind] || REWARDS.later;
    by(this, s, res, q, out);
  }

  // Claims every reached, unclaimed step of a road in order (ProgressionRoadService.ClaimAllRewards).
  claim(s, road, value) {
    const out = [];
    const done = s.claimed[road] ?? -1;
    for (const [v, rewards] of this.d.roads[road]) {
      if (v <= done || v > value) continue;
      for (const r of rewards) this.grantReward(s, r, out);
      s.claimed[road] = v;
    }
    return out;
  }

  claimable(s) {
    const done = s.claimed[XP_ROAD] ?? -1;
    return this.xpRoad.filter(([v, r]) => v > done && v <= s.xp && r.length).length;
  }

  // NormalGamePlayController.GiveEndGameRewards: XP for the level, then the achieved-level road.
  // XP only on a level's first completion: the original never replays a finished Normal level.
  levelComplete(s, levelIndex) {
    const first = levelIndex + 1 > s.best;
    s.best = Math.max(s.best, levelIndex + 1);
    if (first) s.xp += this.d.xpPerLevel;
    return { xp: first ? this.d.xpPerLevel : 0, got: this.claim(s, NORMAL_ROAD, s.best) };
  }

  // Any mode level: XP on its first completion, then the mode's achieved-level road (highest level finished), then the
  // event skin of that level. `slot` is the mode's progress in the save ({best, done}).
  // [ĐỀ XUẤT] event level N gives the event's N-th skin (customization table order): the original's reward list comes
  // from the server (SeasonalEventDto.Rewards, empty in the bundled config), one reward per day.
  modeLevelComplete(s, slot, levelIndex, road, rewardUnlock) {
    const done = slot.done || [];
    const first = !done.includes(levelIndex);
    if (first) { slot.done = [...done, levelIndex]; s.xp += this.d.xpPerLevel; }
    slot.best = Math.max(slot.best || 0, levelIndex + 1);
    const got = road ? this.claim(s, road, slot.best) : [];
    if (first && rewardUnlock) {
      const it = this.items.filter((o) => o.unlock === rewardUnlock)[levelIndex];
      if (it) this.grantItem(s, it, got);
    }
    return { xp: first ? this.d.xpPerLevel : 0, got };
  }

  // `open`: the unlock threshold is reached (XP, or Normal level for the events).
  // Display name of a resource: the item title, or a booster's name without its rich-text tags.
  resTitle(res) {
    const it = this.byId.get(res);
    if (it) return it.title;
    const b = this.d.boosters[res];
    return b ? b[0].replace(/<[^>]+>/g, '') : res;
  }

  ownsRes(s, res) {
    const it = this.byId.get(res);
    return it ? owns(s, it.kind, it.name) : qty(s, res) > 0;
  }

  // Rewards that a road granted before their system existed: grant again, whatever still has no system stays pending.
  deliverPending(s) {
    const was = s.pending, out = [];
    s.pending = [];
    for (const r of was) this.grantReward(s, r, out);
    return out.filter((g) => !g.later);
  }

  modeState(s, [id, name, unlock]) {
    if (!unlock) return { id, name, open: true };
    const [road, value] = unlock;
    const have = road === XP_ROAD ? s.xp : s.best;
    return { id, name, open: have >= value, need: have < value ? { road, value } : null };
  }
}

function colors(c) {
  // effect (effectBackgroundColor) tints the GradientVertical overlay: the bottom of the background in every clip
  return { bg: c[0].slice(0, 7), effect: hex(c[1]).slice(0, 3), shadow: hex(c[2]), targets: hex(c[3]).slice(0, 3),
    walls: hex(c[5]).slice(0, 3) };
}

const REWARDS = {
  currency(m, s, res, q, out) {
    if (res === SKIP_TICKETS) { addQty(s, res, q); out.push({ tickets: q }); return; }
    if (res === 'currency.adventure_tokens') { addQty(s, res, q); out.push({ tokens: q }); return; }
    if (res !== 'currency.skin_coins') return REWARDS.later(m, s, res, q, out);
    s.coins += q;
    out.push({ coins: q });
  },
  skin: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  rope: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  trail: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  progression(m, s, res, q, out) {
    if (res !== XP_ROAD) return REWARDS.later(m, s, res, q, out);
    s.xp += q;
    out.push({ xp: q });
  },
  mode(m, s, res, q, out) { s.modes[res] = { ...(s.modes[res] || {}), unlocked: true }; out.push({ mode: res }); },
  unlocked_level_mode(m, s, res, q, out) {
    const id = 'mode.' + res.split('.')[1];
    const st = s.modes[id] || {};
    s.modes[id] = { ...st, levels: (st.levels || 0) + q };
    out.push({ mode: id, levels: q });
  },
  flag(m, s, res, q, out) { s.flags[res] = q; out.push({ flag: res }); },
  later(m, s, res, q, out) { s.pending.push([res, q]); out.push({ later: res }); },
};
