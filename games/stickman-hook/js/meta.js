// Economy of the original, driven by data/meta.json (tools/build_meta.py): items, XP road, level-mode road, modes, theme.
// Rewards are granted through one table keyed by resource kind; unlock texts through one table keyed by unlock method.
import { owns, grant } from './save.js';

const KINDS = { skin: 'skins', rope: 'ropes', trail: 'trails' };
export const XP_ROAD = 'progression.xp';
export const NORMAL_ROAD = 'achieved_level_mode.normal';
export const CHALLENGE_LEVELS = 'unlocked_level_mode.challenge';
export const SKIP_TICKETS = 'currency.skip_tickets';
// progression_road.progressions[progression.xp].claimedResourceId: the XP value the XP road popup has animated and
// claimed up to. XP above it is "pending" (ProgressionRoadStateController.GetPendingProgressions [asm 0x2f9fde8]).
export const XP_CLAIMED = 'progression.xp_claimed';
const SEASONAL_FLAG = 'flag.seasonal_event';
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
  progression_road_progression_cards_perk_level: { live: true, arg: (m, it) => it.value },
  lucky_wheel: { live: true },
  piggy_bank: { live: true },
  pachinko: { live: true },
  rewarded: { live: true },
  vip: { live: true },
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

  // Rank = index of the last XP road step reached, the first step (0 XP) being rank 0: the 2026 clip (0:16) shows the
  // 1850 XP step (index 21) as rank 21. Earlier builds counted from 1.
  rankOf(xp) {
    let r = 0;
    for (const s of this.xpRoad) if (s[0] <= xp) r++;
    return Math.max(0, r - 1);
  }

  xpBar(xp) {
    const steps = this.xpRoad, i = this.rankOf(xp);
    const lo = steps[i][0], hi = steps[i + 1] ? steps[i + 1][0] : lo;
    return { rank: i, lo, hi, k: hi > lo ? (xp - lo) / (hi - lo) : 1, league: this.league(xp) };
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

  // ResourceBoostingService: a grant of `res` from `source` adds the matching card's bonus as a second grant
  // (js/cards.js Cards.boost; 0 while the cards module is not loaded, i.e. the save holds no card).
  bonus(s, res, source, q) {
    const n = this.cards ? this.cards.boost(s, res, source, q) : 0;
    if (n > 0) { if (res === XP_ROAD) s.xp += n; else if (res === 'currency.skin_coins') s.coins += n; else addQty(s, res, n); this.onBoost?.(res, source, n); }
    return n;
  }

  // Unlock XP of an item (source unlocked_<kind>), plus the collection's XP once every item of it is owned.
  grantItem(s, it, out) {
    if (owns(s, it.kind, it.name)) return;
    grant(s, it.kind, it.name);
    s.xp += it.xp + this.bonus(s, XP_ROAD, 'unlocked_' + it.id.split('.')[0], it.xp);
    out.push({ item: it });
    const col = it.collection;
    if (s.collections.includes(col)) return;
    if (this.items.every((o) => o.collection !== col || owns(s, o.kind, o.name))) {
      s.collections.push(col);
      const x = this.d.collections[col][4];
      s.xp += x + this.bonus(s, XP_ROAD, 'collection_complete', x);
      out.push({ collection: col });
    }
  }

  // One reward [resourceId, qty] -> save, `source` for the card boosts. Kinds without a system go to `pending`.
  grantReward(s, [res, q], out, source) {
    const kind = res.split('.')[0];
    const by = REWARDS[kind] || REWARDS.later;
    by(this, s, res, q, out, source);
  }

  // Claims every reached, unclaimed step of a road in order (ProgressionRoadService.ClaimAllRewards).
  claim(s, road, value) {
    const out = [];
    const done = s.claimed[road] ?? -1;
    for (const [v, rewards] of this.d.roads[road]) {
      if (v <= done || v > value) continue;
      for (const r of rewards) this.grantReward(s, r, out, 'progression_road_' + road);
      s.claimed[road] = v;
    }
    return out;
  }

  claimable(s) {
    const done = s.claimed[XP_ROAD] ?? -1;
    return this.xpRoad.filter(([v, r]) => v > done && v <= s.xp && r.length).length;
  }

  // XP not yet shown by the XP road popup. XpRoadService.OnXpChanged enqueues XpRoadPopup.AutomaticTrophyRoadPopupConfig
  // when it is > 0 [asm 0x11a0310..0x11a046c]; XpRoadRecoveryPromptController ('xp_road_recovery') shows the same popup
  // on the home page while it is > 0 [asm 0x1192fa0..0x119313c].
  xpPending(s) { return Math.max(0, s.xp - qty(s, XP_CLAIMED)); }

  // XpRoadPopup.OnShowEndedAsync after the bar animation: ProgressionRoadService.ClaimAllRewards('progression.xp')
  // [asm 0x1240c38]: every reached step, in order; the claimed XP catches up with the XP. Rewards that add XP
  // (item unlocks, xp steps) leave new pending XP, which shows the popup again.
  claimRoad(s) {
    const from = qty(s, XP_CLAIMED);
    s.inv[XP_CLAIMED] = s.xp;
    return { from, to: s.xp, got: this.claim(s, XP_ROAD, s.xp) };
  }

  // Saves from before the claimed-XP counter: start it at the last step claimed with the old "claim" button, so the
  // XP earned since then is pending and the automatic popup claims the rest on the next home visit (or level end).
  // A Challenge level granted before the mode flag existed (OnModeLevelUnlocked sets the mode too) unlocks the mode.
  migrate(s) {
    let changed = false;
    if (s.inv[XP_CLAIMED] === undefined) { s.inv[XP_CLAIMED] = Math.max(0, s.claimed[XP_ROAD] ?? 0); changed = true; }
    for (const [id, st] of Object.entries(s.modes)) {
      if (st.levels > 0 && !st.unlocked) { st.unlocked = true; changed = true; }
      if (id === 'mode.challenge' && !st.levels && st.unlocked) { st.levels = 1; changed = true; }
    }
    return changed;
  }

  // NormalGamePlayController.GiveEndGameRewards: XP for the level, then the achieved-level road.
  // XP only on a level's first completion: the original never replays a finished Normal level.
  levelComplete(s, levelIndex) {
    const first = levelIndex + 1 > s.best;
    s.best = Math.max(s.best, levelIndex + 1);
    const xp = first ? this.d.xpPerLevel + this.bonus(s, XP_ROAD, 'finish_level_normal', this.d.xpPerLevel) : 0;
    if (first) s.xp += this.d.xpPerLevel;
    return { xp, got: this.claim(s, NORMAL_ROAD, s.best) };
  }

  // Any mode level: XP on its first completion, then the mode's achieved-level road (highest level finished), then the
  // event skin of that level. `slot` is the mode's progress in the save ({best, done}).
  // [ĐỀ XUẤT] event level N gives the event's N-th skin (customization table order): the original's reward list comes
  // from the server (SeasonalEventDto.Rewards, empty in the bundled config), one reward per day.
  modeLevelComplete(s, slot, levelIndex, road, rewardUnlock, modeId) {
    const done = slot.done || [];
    const first = !done.includes(levelIndex);
    let xp = 0;
    if (first) {
      slot.done = [...done, levelIndex]; s.xp += this.d.xpPerLevel;
      xp = this.d.xpPerLevel + this.bonus(s, XP_ROAD, 'finish_level_' + (modeId || '').split('.')[1], this.d.xpPerLevel);
    }
    slot.best = Math.max(slot.best || 0, levelIndex + 1);
    const got = road ? this.claim(s, road, slot.best) : [];
    if (first && rewardUnlock) {
      const it = this.items.filter((o) => o.unlock === rewardUnlock)[levelIndex];
      if (it) this.grantItem(s, it, got);
    }
    return { xp, got };
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

  // GameModesService.IsUnlocked: the mode resource is in the inventory, i.e. its road reward was claimed (seasonal
  // events: flag.seasonal_event, claimed by the Normal level road at level 10) [asm 0x1296df4..0x1296ee8].
  // `need` is the road step that grants it (GetUnlockText), shown while the mode is locked.
  modeState(s, [id, name, unlock]) {
    if (!unlock) return { id, name, open: true };
    const [road, value] = unlock;
    const open = road === XP_ROAD ? !!s.modes[id]?.unlocked : (s.flags[SEASONAL_FLAG] || 0) > 0;
    return { id, name, open, need: open ? null : { road, value } };
  }

  // GameModesService.HasUnlockedLevel (level = 0-based index): autoUnlockNextLevel modes are open; otherwise
  // GetMaxLevelUnlocked >= level, the count of unlocked_level_mode.<mode> granted by claimed road steps
  // [asm 0x1296bf4..0x1296d14]; FixUnlockDiscrepancies raises it to the level achieved [asm 0x12962f4..0x1296350].
  // [ĐỀ XUẤT] the achieved level is the 0-based index of the highest level finished (best - 1), so finishing the last
  // open level does not open the next one.
  levelsUnlocked(s, id) {
    const st = s.modes[id] || {};
    return Math.max(st.levels || 0, (st.best || 0) - 1);
  }
}

function colors(c) {
  // effect (effectBackgroundColor) tints the GradientVertical overlay: the bottom of the background in every clip
  return { bg: c[0].slice(0, 7), effect: hex(c[1]).slice(0, 3), shadow: hex(c[2]), targets: hex(c[3]).slice(0, 3),
    walls: hex(c[5]).slice(0, 3) };
}

const REWARDS = {
  currency(m, s, res, q, out, src) {
    if (res === SKIP_TICKETS) { addQty(s, res, q); out.push({ tickets: q }); return; }
    if (res === 'currency.adventure_tokens') { addQty(s, res, q); out.push({ tokens: q + (src ? m.bonus(s, res, src, q) : 0) }); return; }
    if (res !== 'currency.skin_coins') return REWARDS.later(m, s, res, q, out);
    s.coins += q;
    out.push({ coins: q + (src ? m.bonus(s, res, src, q) : 0) });
  },
  // a booster opens at once in a popup (BoosterIncentiveController): queued for js/cardsui.js; pending until cards load
  booster(m, s, res, q, out) {
    if (!m.cards) return REWARDS.later(m, s, res, q, out);
    m.cards.queue(s, res, q);
    out.push({ booster: res, q });
  },
  card(m, s, res, q, out) { if (!m.cards) return REWARDS.later(m, s, res, q, out); m.cards.addCard(s, res, q, out); out.push({ card: res, q }); },
  skin: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  rope: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  trail: (m, s, res, q, out) => m.grantItem(s, m.byId.get(res), out),
  progression(m, s, res, q, out) {
    if (res !== XP_ROAD) return REWARDS.later(m, s, res, q, out);
    s.xp += q;
    out.push({ xp: q });
  },
  // OnModeUnlocked: a mode without unlocked levels gets unlocked_level_<mode> = 1 [asm 0x1297c1c..0x1297c5c]
  mode(m, s, res, q, out) {
    const st = s.modes[res] || {};
    s.modes[res] = { ...st, unlocked: true, levels: Math.max(1, st.levels || 0) };
    out.push({ mode: res, ...(st.unlocked ? {} : { unlocked: true }) });
  },
  // OnModeLevelUnlocked: the first level grant of a locked mode unlocks the mode too (and shows ModeUnlockedPopup)
  // [asm 0x1297dec..0x1297f68]
  unlocked_level_mode(m, s, res, q, out) {
    const id = 'mode.' + res.split('.')[1];
    const st = s.modes[id] || {};
    s.modes[id] = { ...st, unlocked: true, levels: (st.levels || 0) + q };
    out.push({ mode: id, levels: q, ...(st.unlocked ? {} : { unlocked: true }) });
  },
  flag(m, s, res, q, out) { s.flags[res] = q; out.push({ flag: res }); },
  later(m, s, res, q, out) { s.pending.push([res, q]); out.push({ later: res }); },
};
