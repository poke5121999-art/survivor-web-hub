// Feature "telescope" (sim part): the star telescope (Work 50, UI_Telescope), the observatory (Work 110, UI_Observatory: new look /
// new skill with tickets) and the star-tree event (UI_eventStarTree). Contract: js/sim/registry.js.
// Rules and citations: D:/catsoup-ref/rules/telescope.md. Tables: data/telescope.json (tools/export_telescope.py).
//
// State game.state.telescope = {
//   season, quarter, active: the season record of TelescopeData (_telescopeSeason / Quarter / _isActive)
//   obs: 0..9              observation counter toward the guaranteed fairy-tale star (_telescopeObservCount)
//   free: bool             the single free observation was used (_useFreeOne)
//   owned: { <rewardType>: [rewardValue] }   fairy-tale items already won this season (_telescopeOwnedTaleItems)
//   stash: { <rewardType>: n }               rewards no feature could take (kept so nothing is lost)
//   ads:   { day, n }      free "new look" ads used today
//   star:  { event, cat, next: {skill: ms}, count, points, gotP: [index], gotG: [level] }   the star-tree event
// }
// Lenses (item 6001) and every ticket (1401-1408, 1501-1524) are kept by the collection feature in state.collection.items.

const LENS = 6001;
export const FREE_FIRST = 1;
export const GUARANTEE = 10;           // UI_Telescope+CoTelescopeGetStart: the 10th observation is a fairy-tale star
export const TALE_WEIGHT = 8;
export const ADS_PER_DAY = 3;          // guidebook_observ_2 "Xem 3 quang cao moi ngay de tim dien mao moi"
export const MIN_CATS = 3;             // DataManager.CheckTelescopeSeason runs only with 3 or more cats
export const TICKET = { normal: 1401, special: 1402, select: [1403, 1404, 1405], limit: 1406, kitty: 1407, randomFat: 1408, limited0: 1501 };
// Group key -> weight, in the order UI_Telescope.UpdateWeightedRandomSelector adds them (float hex decoded). A number key is the
// rewardType the rows are searched by; 'limit' = ticket_cat_limit rows, 'select' = ticket_cat_select rows.
export const WEIGHTS = [['limit', 0.2], ['select', 0.3], [24, 1.7], [7107, 2.8], [1402, 5], [7106, 5], [23, 7], [1401, 10], [1103, 10], [1203, 10], [1102, 20], [1202, 20]];
// Ticket 1501 + i turns a cat into CatType LIMITED[i] (GameExtensions.GetLimitedChangeCatType, a table in the binary that was not
// recovered: the 24 types are the ones the lang file names ticketObservatory_catType<N>, in ascending order (inferred)).
export const LIMITED = [27, 36, 38, 41, 44, 47, 51, 56, 58, 60, 62, 64, 66, 69, 71, 72, 73, 74, 76, 88, 89, 93, 98, 101];
// star tree (solo model of a server event, rules section 4): crowd exp and exp per skill point are (inferred)
export const CROWD_SHARE = 0.9;
export const EXP_PER_POINT = 1000;

const S = g => g.state.telescope;
const D = g => g.data.telescope;
const nowMs = g => (g._now ? g._now() : Date.now());

// ---- calendar (local days as YYYYMMDD, like Entity_*.Param.IsActiveDate) ----
export function dayOf(ms) {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
export const dayMs = day => new Date(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100).getTime();
export const today = g => dayOf(nowMs(g));
// end of a day-inclusive range: the next local midnight (the table adds one day to the end date)
const endMs = day => new Date(Math.floor(day / 10000), Math.floor(day / 100) % 100 - 1, day % 100 + 1).getTime();

export const seasonAt = (g, day = today(g)) => D(g).seasons.find(s => s.start <= day && day <= s.end) || null;
// Entity_TelescopeSeason+Param.GetQuarter: 1 up to quarter1EndDay, 2 up to quarter2EndDay, 3 up to the season end
export const quarterAt = (s, day) => (!s || day < s.start || day > s.end ? 0 : day <= s.q1 ? 1 : day <= s.q2 ? 2 : 3);
export const seasonRemain = g => { const s = seasonAt(g); return s ? Math.max(0, endMs(s.end) - nowMs(g)) : 0; };   // ms
export const splitRemain = ms => ({ days: Math.floor(ms / 86400000), hours: Math.floor(ms % 86400000 / 3600000), mins: Math.floor(ms % 3600000 / 60000) });

// ---- item storage (collection feature) ----
export const count = (g, type) => g.itemCount(type);
export const spend = (g, type, n = 1) => g.spendItem(type, n);
export const lens = g => count(g, LENS);
const ticketCount = (g, type) => count(g, type);
export const normalTickets = g => ticketCount(g, TICKET.normal);
export const specialTickets = g => ticketCount(g, TICKET.special);
export const limitedTickets = g => LIMITED.map((cat, i) => ({ type: TICKET.limited0 + i, cat, n: ticketCount(g, TICKET.limited0 + i) }));

// DataManager.GetReward; a reward nobody keeps goes to the stash
export function give(g, type, value) {
  const out = g.reward(type, value, type === 5 || type === 6 ? { equip: value, count: 1 } : {});
  if (out) return out;
  const st = S(g).stash;
  st[type] = (st[type] || 0) + Number(value);
  return { type, value: Number(value), stashed: true };
}

// ---- season (DataManager.CheckTelescopeSeason, TelescopeData.ResetTelescopeData) ----
export function sync(g) {
  const t = S(g);
  if (g.state.cats.length < MIN_CATS) return false;
  const day = today(g), s = seasonAt(g, day);
  if (!s) { t.active = false; return false; }
  const q = quarterAt(s, day);
  if (t.season !== s.index) {                       // a new season clears the won items and the lenses
    t.owned = {};
    g.spendItem(LENS, g.itemCount(LENS));
    t.obs = 0; t.season = s.index; t.quarter = q; t.active = true;
    g.emit('telescopeSeason', { season: s.index, quarter: q });
  } else if (t.quarter !== q || !t.active) {        // a new quarter only restarts the counter
    t.obs = 0; t.quarter = q; t.active = true;
    g.emit('telescopeSeason', { season: s.index, quarter: q });
  }
  return true;
}
export const isActive = g => !!S(g).active && g.state.cats.length >= MIN_CATS;
export const seasonRow = g => D(g).seasons.find(s => s.index === S(g).season) || null;

// ---- fairy-tale items of the season (UI_Telescope.MakeTaleRewards) ----
const isOwned = (g, type, value) => (S(g).owned[type] || []).includes(value);
export function taleList(g) {
  const s = seasonRow(g);
  if (!s) return [];
  return D(g).telescope.filter(r => r.type === 'tale' && r.season === s.name).map(r => ({ ...r, owned: isOwned(g, r.rt, r.rv), locked: r.quarter > S(g).quarter }));
}
// rows still to win: special rows of the season with quarter <= the current quarter and not owned
export const remainingTale = g => taleList(g).filter(r => !r.owned && !r.locked);
export const remainTaleCount = g => remainingTale(g).length;
export const untilGuarantee = g => GUARANTEE - S(g).obs;   // "Dong Tich Cổ tích trong N lần"
const rowsOf = (g, pred) => D(g).telescope.filter(r => r.type !== 'tale' && pred(r));

// UpdateWeightedRandomSelector: the tale group first (weight 8) while one is left, then the fixed table
export function weights(g) {
  const out = [];
  if (remainTaleCount(g) > 0) out.push({ key: 'tale', weight: TALE_WEIGHT });
  for (const [key, weight] of WEIGHTS) out.push({ key, weight });
  return out;
}
export function probabilities(g) {
  const w = weights(g), sum = w.reduce((a, x) => a + x.weight, 0);
  return w.map(x => ({ key: x.key, weight: x.weight, percent: x.weight / sum * 100 }));
}
const rnd = (g, n) => Math.floor(g.rng() * n);
// CumulativeWeightRandom.Select (inferred): r in [0, total), the first group whose running sum passes r
export function pickGroup(g, r = g.rng()) {
  const w = weights(g), sum = w.reduce((a, x) => a + x.weight, 0);
  let acc = 0;
  for (const x of w) { acc += x.weight; if (r * sum < acc) return x.key; }
  return w[w.length - 1].key;
}
// GetTelescopeReward(forceTale): { tale, type, value } or null
export function roll(g, forceTale = false, r = g.rng()) {
  if (forceTale) {
    const left = remainingTale(g);
    if (!left.length) return null;
    const row = left[rnd(g, left.length)];
    return { tale: true, type: row.rt, value: row.rv, index: row.index };
  }
  const key = pickGroup(g, r);
  let rows;
  if (key === 'tale') rows = remainingTale(g);
  else if (key === 'limit') rows = rowsOf(g, x => x.type === 'ticket_cat_limit');
  else if (key === 'select') rows = rowsOf(g, x => x.type === 'ticket_cat_select');
  else rows = rowsOf(g, x => x.rt === key);
  if (!rows.length) return null;
  const row = rows.length === 1 ? rows[0] : rows[rnd(g, rows.length)];
  return { tale: key === 'tale', type: row.rt, value: row.rv, index: row.index };
}

// One tap of "1 observation" / "5 observations" (UI_Telescope.OnClick_UseTelescope_One / _Five, CoTelescopeGetStart).
export function canObserve(g, n) {
  if (!isActive(g)) return false;
  if (n === 1) return !S(g).free || lens(g) >= 1;
  return lens(g) >= n;
}
export function observe(g, n) {
  const t = S(g);
  if (n !== 1 && n !== 5) return { ok: false, reason: 'count' };
  if (!isActive(g)) return { ok: false, reason: 'season' };
  if (!canObserve(g, n)) return { ok: false, reason: 'lens' };
  const rewards = [];
  for (let i = 0; i < n; i++) {
    if (n === 1 && !t.free) t.free = true;                          // the one free observation
    else spend(g, LENS, 1);                                         // ConsumeMoney(6001, -1)
    t.obs += 1;
    const force = remainTaleCount(g) > 0 && t.obs >= GUARANTEE;
    if (t.obs >= GUARANTEE) t.obs = 0;
    const got = roll(g, force);
    if (!got || !(got.value > 0)) continue;
    rewards.push({ ...got, given: null });
    if (got.tale) {                                                 // AddOwnedTaleItem, UpdateTaleReward, counter back to 0
      (t.owned[got.type] ||= []).push(got.value);
      t.obs = 0;
    }
  }
  for (const r of rewards) r.given = give(g, r.type, r.value);
  g.emit('telescope', { n, rewards });
  return { ok: true, rewards, tales: rewards.filter(r => r.tale).length };
}

// The building: Work 110 "Dai quan sat" (type 8, eventType 4, needWork 8, cost 0). Tapping it opens the observatory; the quick menu
// reaches the telescope and the observatory only while it stands (UI_QuickMenu.c:405 / :685 FindWork(0x6e)).
export const OBS = 110, OBS_NEEDS = 8;
export const obsWork = g => g.state.works.find(w => w.a === OBS) || g.state.storage.find(w => w.a === OBS) || null;
export const canBuildObs = g => !obsWork(g) && g.copies(OBS_NEEDS) > 0 && !!g.autoCell();
export function buildObs(g) {
  if (!canBuildObs(g)) return null;
  const w = g.place(OBS, g.autoCell(), 0);
  g.state.stats.built += 1;
  return w;
}

// ================= observatory (UI_Observatory, DataManager.ChangeNewLook / ChangeNewSkill / ChangeNewUnit) =================
const CAT = 101, SUBS = 102;                                        // Ability.type of a cat main / sub skill
const shopRow = (g, i) => D(g).shop[i];
export const adsLeft = g => { const a = S(g).ads; return a.day === today(g) ? Math.max(0, ADS_PER_DAY - a.n) : ADS_PER_DAY; };
const catRow = (g, type) => g.t.CatType.find(c => c.index === type);
// the cat's fat group: fatFactor < 0 thin (0), = 0 soft (1), > 0 plump (2) (UI_FatTypeCatChange+<>c__DisplayClass9_0 b__0..b__2)
export const fatOf = r => (r.fatFactor < 0 ? 0 : r.fatFactor === 0 ? 1 : 2);
export const fatCats = (g, fat, except) => g.catTypes.filter(c => fatOf(c) === fat && c.index !== except);
const isLimitedLook = (g, cat) => { const r = catRow(g, cat.type); return !!r && r.eventType !== 0; };

function skillsOf(g, cat) {
  const C = g.feat.cats, x = C.ensureCat(g, cat);
  return { main: { ...x.main }, sub: x.sub };
}
export const skillText = skillsOf;

// What a change costs: gems (Shop rows 1, 2, 35, 139, 140) or the ticket that replaces them. kind: 'newcat' | 'look' | 'skill' | 'ads' | 'limited' | 'select' | 'randomFat'
export function cost(g, kind, arg = 0) {
  if (kind === 'newcat') return specialTickets(g) >= 1 ? { ticket: TICKET.special, n: 1, gems: 0 } : { gems: shopRow(g, 1).cost };
  if (kind === 'look') return normalTickets(g) >= 1 ? { ticket: TICKET.normal, n: 1, gems: 0 } : { gems: shopRow(g, 2).cost };
  if (kind === 'ads') return { ads: true, gems: 0 };
  if (kind === 'skill') {
    const row = shopRow(g, [35, 139, 140][arg]);
    const need = Math.floor(row.cost / 500);                        // UI_Observatory.ChangeNewSkill_Inner: iVar6 = cost / 500 special tickets
    return specialTickets(g) >= need ? { ticket: TICKET.special, n: need, gems: 0 } : { gems: row.cost };
  }
  if (kind === 'limited') return { ticket: TICKET.limited0 + arg, n: 1, gems: 0 };
  if (kind === 'select') return { ticket: TICKET.select[arg], n: 1, gems: 0 };
  if (kind === 'randomFat') return { ticket: TICKET.randomFat, n: 1, gems: 0 };
  return null;
}
export function canPay(g, c) {
  if (!c) return false;
  if (c.ads) return adsLeft(g) > 0;
  if (c.ticket) return count(g, c.ticket) >= c.n;
  return g.state.gem >= c.gems;
}
function pay(g, c) {
  if (!canPay(g, c)) return false;
  if (c.ads) { const a = S(g).ads; if (a.day !== today(g)) { a.day = today(g); a.n = 0; } a.n += 1; return true; }
  if (c.ticket) return spend(g, c.ticket, c.n);
  g.state.gem -= c.gems;
  return true;
}

// the warnings of UI_Observatory.CheckPopupMsg (lang keys), asked before a change
export function warnings(g, cat, kind, slot = 0) {
  const out = [];
  const sk = skillsOf(g, cat);
  if (kind === 'skill' || kind === 'newcat') {
    const keepMain = kind === 'skill' && slot === 1, keepSub = kind === 'skill' && slot === 2;
    if (!keepMain && sk.main.lv >= 4) out.push('warning_highGrade');
    else if (!keepSub && sk.sub != null) out.push('warning_extraSkill');
  }
  if ((kind === 'look' || kind === 'ads' || kind === 'newcat' || kind === 'select' || kind === 'randomFat') && isLimitedLook(g, cat)) out.push('warning_limitedCat');
  return out;
}

// GetRandomBodyType(restrict): uniform over the plain cat types, the current one skipped to the next
export function randomLook(g, current) {
  const list = g.catTypes;
  let i = rnd(g, list.length);
  if (list[i].index === current) i = (i + 1) % list.length;
  return list[i].index;
}
// DataManager.GetRandomSkill(unit, mode): 0 both new, 1 keep the main skill (the sub one is searched again), 2 keep the sub one
export function rollSkill(g, cat, mode) {
  const C = g.feat.cats, x = C.ensureCat(g, cat);
  const mains = g.t.Ability.filter(a => a.type === CAT && !a.eventType), subs = g.t.Ability.filter(a => a.type === SUBS && !a.eventType);
  const old = { main: { ...x.main }, sub: x.sub };
  let main = old.main, sub = null;
  if (mode !== 1) {                                                // a new main skill, never the same one (the closure captures firstKey)
    const list = mains.filter(a => a.index !== old.main.a);
    main = { a: list[rnd(g, list.length)].index, lv: C.rollSkillLevel(rnd(g, 1000) + 1) };
  }
  if (mode === 2) sub = old.sub;
  else if (rnd(g, 1000) + 1 > 800) {                               // GetUnitSpecialSkillRate: about 20 %
    const list = subs.filter(a => a.index !== old.sub);
    sub = (list.length ? list : subs)[rnd(g, (list.length ? list : subs).length)].index;
  }
  x.main = main; x.sub = sub;
  return { before: old, after: { main: { ...main }, sub } };
}
function setLook(g, cat, type) {
  const was = cat.type;
  cat.type = type;
  if (g.feat.collection && g.feat.collection.scan) g.feat.collection.scan(g, 0);   // DataManager.CheckCollection(0, type)
  g.emit('catLook', { cat, was, type });
  return was;
}

// Run one observatory change on `cat`. kind as in cost(); arg = skill slot (0 normal, 1 lock main, 2 lock sub), limited ticket
// offset (0..23) or fat group (0..2). Returns { ok, ... } and emits 'observatory'.
export function change(g, cat, kind, arg = 0) {
  if (typeof cat !== 'object') cat = g.state.cats.find(c => c.id === cat);
  if (!cat || !g.state.cats.includes(cat)) return { ok: false, reason: 'cat' };
  const c = cost(g, kind, arg);
  if (!c) return { ok: false, reason: 'kind' };
  if (!canPay(g, c)) return { ok: false, reason: c.ads ? 'ads' : c.ticket ? 'ticket' : 'gems', cost: c };
  const before = { type: cat.type, ...skillsOf(g, cat) };
  let target = null;
  if (kind === 'limited') target = LIMITED[arg];
  else if (kind === 'select' || kind === 'randomFat') {
    const fat = kind === 'select' ? arg : rnd(g, 3);
    const list = fatCats(g, fat, cat.type);
    if (!list.length) return { ok: false, reason: 'none' };
    target = list[rnd(g, list.length)].index;
  } else if (kind === 'look' || kind === 'ads' || kind === 'newcat') target = randomLook(g, cat.type);
  if (target != null && !catRow(g, target)) return { ok: false, reason: 'cattype' };
  if (!pay(g, c)) return { ok: false, reason: 'pay' };
  if (target != null) setLook(g, cat, target);
  if (kind === 'newcat') rollSkill(g, cat, 0);
  if (kind === 'skill') rollSkill(g, cat, arg === 1 ? 1 : arg === 2 ? 2 : 0);
  const after = { type: cat.type, ...skillsOf(g, cat) };
  g.emit('observatory', { cat, kind, before, after, cost: c });
  return { ok: true, kind, cost: c, before, after };
}

// ================= star tree (UI_eventStarTree, EventStarTreeData) =================
const ST = g => D(g).star;
export const starEvent = (g, day = today(g)) => ST(g).event.find(e => e.start <= day && day <= e.end) || null;
export const starActive = g => !!starEvent(g);
export const starRemain = g => { const e = starEvent(g); return e ? Math.max(0, endMs(e.end) - nowMs(g)) : 0; };
// the three partner cats in the order of set_selectstartreecat / icon_1..3: Kiki (cat 23), Teety (32), Pawpaw (31)
export const STAR_ORDER = [23, 32, 31];
export const starCats = g => ST(g).cats.filter(c => c.selected === 1).sort((a, b) => STAR_ORDER.indexOf(a.catType) - STAR_ORDER.indexOf(b.catType));
export const starState = g => S(g).star;
const starFresh = ev => ({ event: ev, cat: 0, next: {}, count: 0, points: 0, gotP: [], gotG: [] });

export function starSync(g) {
  const e = starEvent(g), s = S(g);
  if (e && s.star.event !== e.index) { s.star = starFresh(e.index); g.emit('starTreeReset', { event: e.index }); }   // ApplyStarTreeResetSeqIfChanged
  return !!e;
}
// choose the partner cat once (startree_popup_partner_confirm_desc: it cannot be changed later); i = 1..3
export function starPick(g, i) {
  const s = S(g).star;
  const cats = starCats(g);
  if (!starActive(g) || s.cat || !cats[i - 1]) return false;
  s.cat = i;
  g.emit('starTreeCat', { cat: i, catType: cats[i - 1].catType });
  return true;
}
export const starSkills = g => ST(g).skills;
export const starCooldown = (g, skill) => Math.max(0, (S(g).star.next[skill] || 0) - nowMs(g));      // ms
export function starUse(g, skill) {
  const s = S(g).star, row = ST(g).skills.find(k => k.index === skill);
  if (!row || !starActive(g) || !s.cat) return null;
  if (starCooldown(g, skill) > 0) return null;
  s.next[skill] = nowMs(g) + row.cooldown * 1000;                   // SetSkillNextUseTime
  s.points += row.point;
  s.count += 1;                                                     // _skillUseCount: what the participation rewards count
  g.emit('starTreeSkill', { skill, point: row.point });
  return { skill, point: row.point, level: starLevel(g) };
}
// The pooled exp is kept by the server in the original. Solo model (inferred): the crowd fills CROWD_SHARE of the last level's
// requirement evenly over the event days, and each skill point of this player adds EXP_PER_POINT.
export function starExp(g) {
  const e = starEvent(g) || ST(g).event.find(x => x.index === S(g).star.event);
  if (!e) return 0;
  const total = ST(g).growth[ST(g).growth.length - 2].exp;           // exp that reaches the top level
  const a = dayMs(e.start), b = endMs(e.end);
  const f = Math.min(1, Math.max(0, (nowMs(g) - a) / (b - a)));
  return Math.floor(total * CROWD_SHARE * f) + S(g).star.points * EXP_PER_POINT;
}
// level n needs exp >= growth[n-2].exp (the row's required_exp is what is needed to leave that level; the last row is the top)
export function starLevel(g, exp = starExp(g)) {
  const rows = ST(g).growth;
  let lv = 1;
  for (let i = 0; i < rows.length - 1; i++) if (exp >= rows[i].exp) lv = i + 2;
  return lv;
}
export const starMax = g => ST(g).growth.length;
export function starProgress(g) {
  const exp = starExp(g), lv = starLevel(g, exp), rows = ST(g).growth;
  if (lv >= rows.length) return { exp, level: lv, into: 0, need: 0, ratio: 1 };
  const from = lv >= 2 ? rows[lv - 2].exp : 0, to = rows[lv - 1].exp;
  return { exp, level: lv, into: exp - from, need: to - from, ratio: (exp - from) / (to - from) };
}
// groups' points: the partner cat's group carries this player's points on top of an equal third of the crowd
export function starGroups(g) {
  const s = S(g).star, crowd = starExp(g) - s.points * EXP_PER_POINT;
  return [1, 2, 3].map(i => Math.floor(crowd / 3) + (s.cat === i ? s.points * EXP_PER_POINT : 0));
}
export const starRewardsP = g => ST(g).reward.map(r => ({ ...r, got: S(g).star.gotP.includes(r.index), ready: !S(g).star.gotP.includes(r.index) && !!S(g).star.cat && S(g).star.count >= r.count }));
export const starRewardsG = g => ST(g).growth.map(r => ({ ...r, got: S(g).star.gotG.includes(r.level), ready: !S(g).star.gotG.includes(r.level) && starLevel(g) >= r.level }));
export function starClaimP(g, index) {
  const r = starRewardsP(g).find(x => x.index === index);
  if (!r || !r.ready) return null;
  S(g).star.gotP.push(index);
  const given = give(g, r.rt, r.rv);
  g.emit('starTreeClaim', { kind: 'participate', index, given });
  return given;
}
export function starClaimG(g, level) {
  const r = starRewardsG(g).find(x => x.level === level);
  if (!r || !r.ready) return null;
  S(g).star.gotG.push(level);
  const given = give(g, r.rt, r.rv);
  g.emit('starTreeClaim', { kind: 'growth', level, given });
  return given;
}
export const starDot = g => starActive(g) && (!S(g).star.cat || starRewardsP(g).some(r => r.ready) || starRewardsG(g).some(r => r.ready) || ST(g).skills.some(k => starCooldown(g, k.index) <= 0));

export default {
  id: 'telescope',
  data: ['telescope'],

  init(g) {
    const s = g.state;
    if (!s.telescope) s.telescope = { season: 0, quarter: 0, active: false, obs: 0, free: false, owned: {}, stash: {}, ads: { day: 0, n: 0 }, star: starFresh(0) };
    const t = s.telescope;
    t.owned ||= {}; t.stash ||= {}; t.ads ||= { day: 0, n: 0 }; t.star ||= starFresh(0); t.since = 0;
    sync(g);
    starSync(g);
  },

  tick(g, dt) {
    const t = S(g);
    if (!t) return;
    t.since = (t.since || 0) + dt;
    if (t.since < 5) return;                                        // a calendar check every 5 s
    t.since = 0;
    sync(g);
    starSync(g);
  },

  offline(g) { if (S(g)) { sync(g); starSync(g); } },

  onEvent(g, e) {
    if (e.type === 'cat' && S(g)) sync(g);                          // the third cat starts the season
  },

  // actions
  dayOf, dayMs, today, seasonAt, quarterAt, seasonRemain, splitRemain, seasonRow, isActive, sync,
  lens, count, spend, give, normalTickets, specialTickets, limitedTickets,
  taleList, remainingTale, remainTaleCount, untilGuarantee, weights, probabilities, pickGroup, roll, canObserve, observe,
  obsWork, canBuildObs, buildObs, adsLeft, fatOf, fatCats, cost, canPay, warnings, randomLook, rollSkill, change, skillsOf,
  starEvent, starActive, starRemain, starCats, starState, starSync, starPick, starSkills, starCooldown, starUse, starExp, starLevel,
  starMax, starProgress, starGroups, starRewardsP, starRewardsG, starClaimP, starClaimG, starDot,
};
