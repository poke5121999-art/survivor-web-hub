// Account level, the unlock table and the first-session guide (FTUE). Pure rules: meta.js stores the state,
// the screens ask isUnlocked() and show lockText() on a padlock, tools/pacing.mjs reports when each thing opens.
import { SLOTS, TIERS } from './equip.js?v=20261121b';

// ---- account level (separate from hero levels) ----
export const XP = { wave: 10, clear: 30, first: 60 };

// xp to go from account level L to L + 1
export function xpNeed(L) { return 80 + 30 * (L - 1); }

export function xpForResult({ won, wavesCleared, first }) {
  return XP.wave * wavesCleared + (won ? XP.clear : 0) + (won && first ? XP.first : 0);
}

// { level, xp } after adding `gain`
export function addXp(level, xp, gain) {
  xp += gain;
  while (xp >= xpNeed(level)) { xp -= xpNeed(level); level++; }
  return { level, xp };
}

// ---- unlock table ----
// need: { stage: N } = stage N cleared, { level: N } = account level N, { after: N } = N stages cleared since Trang Bị opened
// (acc.equipAt), { triple: true } = the bag holds 3 identical items (latched in acc.mergeOpen), { upgrades: N } = N item
// upgrades done (acc.stats.upgrades). `slots` lists the equipment slots a row opens. `guide` names the one-time guided step.
export const UNLOCKS = [
  { id: 'ult', name: 'Tung tối thượng', need: {}, guide: 'ult' },
  { id: 'cards', name: 'Thẻ nâng cấp', need: {}, guide: 'pick' },
  { id: 'slot2', name: 'Ô đội hình 2', need: { stage: 1 }, guide: 'team' },
  { id: 'levelup', name: 'Lên cấp tướng', need: { stage: 1 }, guide: 'levelup' },
  { id: 'gacha', name: 'Triệu hồi', need: { stage: 1 }, guide: 'gacha' },
  { id: 'spectate', name: 'Xem qua mắt tướng', need: { stage: 2 }, guide: 'spectate' },
  { id: 'speed', name: 'Tốc độ x2', need: { level: 3 }, guide: 'speed' },
  { id: 'slot3', name: 'Ô đội hình 3', need: { level: 4 }, guide: 'team' },
  { id: 'daily', name: 'Rương ngày', need: { level: 4 }, guide: 'daily' },
  { id: 'autopick', name: 'Tự chọn thẻ', need: { level: 5 } },
  { id: 'chapter', name: 'Rương chương', need: { stage: 5 }, guide: 'chapter' },
  { id: 'equip', name: 'Trang bị', need: { level: 6 }, guide: 'equip' },
  { id: 'upgrade', name: 'Nâng cấp trang bị', need: { upgrades: 1 } },
  { id: 'slot_armor', name: 'Ô Giáp', need: { after: 1 }, slots: ['armor'] },
  { id: 'slot4', name: 'Ô đội hình 4', need: { level: 7 }, guide: 'team' },
  { id: 'autoult', name: 'Tự tung tối thượng', need: { level: 8 } },
  { id: 'slot_hands', name: 'Ô Găng Tay và Giày', need: { after: 2 }, slots: ['gloves', 'boots'] },
  { id: 'slot_charm', name: 'Ô Dây Chuyền và Thắt Lưng', need: { after: 4 }, slots: ['necklace', 'belt'] },
  { id: 'merge', name: 'Ghép trang bị', need: { triple: true }, guide: 'merge' },
];
export const UNLOCK = Object.fromEntries(UNLOCKS.map((u) => [u.id, u]));

// the groups of identical exact-merge items the merge screen accepts: `need` copies, of which at most one (the main piece) is worn.
// Returns [{ main, copies }] with the main piece first (a worn one if any) and the free copies by uid.
export function mergeTriples(bag, wornUids) {
  const worn = wornUids || new Set(), groups = new Map(), out = [];
  for (const it of Array.isArray(bag) ? bag : []) {
    if (!TIERS[it.tier] || !TIERS[it.tier].exact || !TIERS[it.tier].need) continue;
    const k = it.item + '|' + it.tier;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  for (const g of groups.values()) {
    const need = TIERS[g[0].tier].need;
    g.sort((a, b) => a.uid - b.uid);
    const free = g.filter((i) => !worn.has(i.uid)), held = g.filter((i) => worn.has(i.uid));
    if (g.length < need || free.length < need - 1) continue;
    const main = held[0] || free[0];
    out.push({ main, copies: free.filter((i) => i !== main).slice(0, need - 1) });
  }
  return out;
}
export const wornOf = (acc) => { const s = new Set(); for (const e of Object.values(acc.equip || {})) for (const u of Object.values(e || {})) if (u) s.add(u); return s; };
export const hasTriple = (bag, wornUids) => mergeTriples(bag, wornUids).length > 0;

// acc needs { level, cleared } and, for the equipment rows, equipAt, mergeOpen, bag and stats.upgrades when it has them
export function isUnlocked(acc, id) {
  const u = UNLOCK[id];
  if (!u) return true;
  const n = u.need;
  if (n.stage !== undefined && !(acc.cleared >= n.stage)) return false;
  if (n.level !== undefined && !(acc.level >= n.level)) return false;
  if (n.after !== undefined && !(isUnlocked(acc, 'equip') && Number.isFinite(acc.equipAt) && acc.cleared >= acc.equipAt + n.after)) return false;
  if (n.triple && !(isUnlocked(acc, 'equip') && (acc.mergeOpen || hasTriple(acc.bag, wornOf(acc))))) return false;
  if (n.upgrades !== undefined && !(acc.stats && acc.stats.upgrades >= n.upgrades)) return false;
  return true;
}

export function lockText(id, acc) {
  const n = UNLOCK[id].need;
  if (n.after !== undefined) return acc && Number.isFinite(acc.equipAt) ? `Rơi từ ải ${Math.max(1, acc.equipAt + n.after + 1)} trở đi` : 'Mở sau khi có Trang Bị';
  if (n.triple) return 'Có 3 món giống nhau thì mở';
  if (n.upgrades !== undefined) return 'Nâng cấp một món để mở';
  return n.level !== undefined ? `Mở ở cấp ${n.level}` : n.stage !== undefined ? `Mở khi qua ải ${n.stage}` : '';
}

// ---- the equipment slots: weapon with Trang Bị, the rest by stages cleared after it ----
const SLOT_ROW = {};
for (const u of UNLOCKS) for (const s of u.slots || []) SLOT_ROW[s] = u.id;
export function slotOpen(acc, slot) {
  if (acc.cheatUnlock) return true;
  if (!isUnlocked(acc, 'equip')) return false;
  return !SLOT_ROW[slot] || isUnlocked(acc, SLOT_ROW[slot]);
}
export const openSlots = (acc) => SLOTS.map((s) => s.id).filter((s) => slotOpen(acc, s));
// the one short line a dimmed slot gives
export function slotLine(acc, slot) {
  const name = SLOTS.find((s) => s.id === slot).name;
  return `${name}: ${SLOT_ROW[slot] ? lockText(SLOT_ROW[slot], acc) : 'ô đầu tiên'}`;
}
// gold paid in place of equipment while it is not open yet
export const EQUIP_GOLD = { item: 30, mat: 10, pullItem: 300 };

export function teamSlots(acc) { return 1 + ['slot2', 'slot3', 'slot4'].filter((id) => isUnlocked(acc, id)).length; }

// ids that are open now and were not open at (level0, cleared0): what the reveal animation shows
export function newUnlocks(before, after) {
  return UNLOCKS.filter((u) => !isUnlocked(before, u.id) && isUnlocked(after, u.id)).map((u) => u.id);
}

// team size the stages are tuned for: the slots a player who clears every stage once has open when entering stage n
export function expectedSlots(n) {
  let level = 1; let xp = 0;
  for (let s = 1; s < n; s++) ({ level, xp } = addXp(level, xp, xpForResult({ won: true, wavesCleared: 5, first: true })));
  return teamSlots({ level, cleared: n - 1 });
}

// ---- gifts that hand the player a team as the slots open ----
export const FIRST_HERO = 'gio';
// a brand-new account: one hero, a little gold, gems for three pulls after the free one
export const NEW_ACCOUNT = { gold: 500, gems: 300, heroes: [FIRST_HERO] };
export const GIFTS = [
  { at: 'tutorial', hero: 'yta', why: 'Y Tá nhập đội giữa ải đầu' },
  { at: 'firstPull', hero: 'mua', why: 'Lượt triệu hồi đầu miễn phí, chắc chắn ra Mưa Đạn' },
  { at: { stage: 2 }, hero: 'thep', why: 'Quà qua ải 2' },
];

// ---- the first session, in order. `where` is the screen, `target` the id of the one 3D button to press. ----
// A step is shown when its `when` holds and it is not in acc.ftue.done; pressing the target (or the event) completes it.
export const FTUE = [
  { id: 'intro', where: 'battle', when: 'tutorial:start', text: 'Tướng tự đánh. Bạn chỉ cần xem!', target: null, wait: 3 },
  { id: 'ult', where: 'battle', when: 'tutorial:ult_ready', text: 'Lửa đã cháy! Chạm để tung tối thượng', target: 'ult0', freeze: true },
  { id: 'pick', where: 'pick', when: 'tutorial:pick', text: 'Chọn 1 thẻ nâng cấp cho tướng', target: 'card1' },
  { id: 'join', where: 'battle', when: 'tutorial:join', text: 'Y Tá nhập đội!', target: null, wait: 2.5 },
  { id: 'boss', where: 'battle', when: 'tutorial:boss', text: 'Boss tới! Né vùng đỏ, dồn tối thượng', target: null, wait: 3 },
  { id: 'reward', where: 'result', when: 'tutorial:won', text: 'Nhận thưởng', target: 'home', allow: ['tab-stats'] },
  { id: 'levelup', where: 'heroes', when: 'home', text: 'Dùng mảnh và vàng để lên cấp tướng', path: ['tab-heroes', 'hero-gio', 'levelup', 'back'] },
  { id: 'gacha', where: 'gacha', when: 'home', text: 'Lượt triệu hồi đầu miễn phí!', path: ['tab-gacha', 'pull1', 'done'] },
  { id: 'team', where: 'heroes', when: 'home', text: 'Đưa tướng mới vào ô đội hình vừa mở', path: ['tab-heroes', 'hero-mua', 'team-toggle', 'back'] },
  { id: 'start2', where: 'home', when: 'home', text: 'Vào ải 2!', path: ['tab-battle', 'stage-next', 'start'] },
];
// one-time steps that come later, each when its unlock opens
export const LATER_GUIDES = {
  spectate: { text: 'Chạm con mắt để xem trận qua mắt tướng', target: 'eye0' },
  speed: { text: 'Chạm để đánh nhanh gấp đôi', target: 'speed' },
  daily: { text: 'Mỗi ngày một rương', path: ['tab-rewards', 'daily'] },
  chapter: { text: 'Qua hết chương là có rương chương', path: ['tab-rewards', 'chapter0'] },
  // path entries: a target id (tokens bag-first, bag-main, bag-copy1, bag-copy2 name the gift and the triple), or { wait } for a
  // pause with no target; `line` is the one short line of that entry, `only: 'multiHero'` skips it with a single hero
  equip: { text: 'Mặc trang bị cho tướng', path: [
    { id: 'tab-equip', line: 'Mở Trang Bị' },
    { id: 'equip-hero', line: 'Chọn tướng', only: 'multiHero' },
    { id: 'bag-first', line: 'Chạm món đồ mới' },
    { id: 'wear', line: 'Bấm MẶC' },
    { wait: 2.2, line: 'Công tăng lên!' },
    { id: 'slot-weapon', line: 'Chạm món vừa mặc' },
    { id: 'upgrade', line: 'Nâng cấp miễn phí' },
    { wait: 2.6, line: 'Thắng ải để nhặt thêm trang bị' },
  ] },
  merge: { text: 'Ghép 3 món giống nhau thành món bậc cao hơn', path: [
    { id: 'tab-equip', line: 'Mở Trang Bị' },
    { id: 'merge', line: 'Bấm GHÉP' },
    { id: 'bag-main', line: 'Chọn món chính' },
    { id: 'bag-copy1', line: 'Chọn món giống' },
    { id: 'bag-copy2', line: 'Thêm một món giống nữa' },
    { id: 'merge-do', line: 'Bấm GHÉP' },
  ] },
};

// The scripted first stage: one hero, weak waves, the second hero joins when wave 2 is cleared, a small boss last.
// battle.js reads it like any stage object; `tutorial` switches on the scripted events.
export function tutorialStage(base) {
  // ordinary packs arrive three times larger and weaker, like every stage's horde (stages.js HORDE); the giant stays one body
  const H = 3;
  const g = (kind, n, at, ang) => (kind === 'giant' ? { kind, n, at, ang, spread: 0.7 } : { kind, n: n * H, at: at * 0.6, ang, spread: 1.3, hpK: Math.pow(H, -0.62), atkK: Math.pow(H, -1.12), ccK: Math.pow(H, -0.5) });
  return {
    ...base, n: 1, tutorial: true, name: 'Phố Hoang 1', hpMul: base.hpMul * 0.6, atkMul: base.atkMul * 0.45, bossHp: base.bossHp * 0.3, bossTier: 1,
    waves: [
      { groups: [g('walker', 4, 0, 0.5), g('walker', 4, 5, 3.4)], boss: null },
      { groups: [g('walker', 5, 0, 1.5), g('runner', 3, 5, 4.5)], boss: null, join: 'yta' },
      { groups: [g('walker', 5, 0, 2.2), g('runner', 4, 4, 5.4), g('walker', 4, 8, 0.6)], boss: null },
      { groups: [g('runner', 5, 0, 3.0), g('walker', 6, 4, 0.2), g('spitter', 2, 8, 4.4)], boss: null },
      { groups: [g('giant', 1, 1.5, 1), g('walker', 4, 5, 4)], boss: 'giant' },
    ],
  };
}
