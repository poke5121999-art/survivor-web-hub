// Account level, the unlock table and the first-session guide (FTUE). Pure rules: meta.js stores the state,
// the screens ask isUnlocked() and show lockText() on a padlock, tools/pacing.mjs reports when each thing opens.

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
// need: { stage: N } = stage N cleared, { level: N } = account level N. `guide` names the one-time guided step.
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
  { id: 'slot4', name: 'Ô đội hình 4', need: { level: 7 }, guide: 'team' },
  { id: 'autoult', name: 'Tự tung tối thượng', need: { level: 8 } },
  { id: 'merge', name: 'Ghép trang bị', need: { level: 9 }, guide: 'merge' },
];
export const UNLOCK = Object.fromEntries(UNLOCKS.map((u) => [u.id, u]));

// acc needs { level, cleared }
export function isUnlocked(acc, id) {
  const u = UNLOCK[id];
  if (!u) return true;
  return (u.need.stage === undefined || acc.cleared >= u.need.stage) && (u.need.level === undefined || acc.level >= u.need.level);
}

export function lockText(id) {
  const n = UNLOCK[id].need;
  return n.level !== undefined ? `Mở ở cấp ${n.level}` : n.stage !== undefined ? `Mở khi qua ải ${n.stage}` : '';
}

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
  { id: 'reward', where: 'result', when: 'tutorial:won', text: 'Nhận thưởng', target: 'home' },
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
  equip: { text: 'Mặc trang bị cho tướng', path: ['tab-equip'] },
  merge: { text: 'Ghép 3 món giống nhau thành món bậc cao hơn', path: ['tab-equip', 'merge'] },
};

// The scripted first stage: one hero, weak waves, the second hero joins when wave 2 is cleared, a small boss last.
// battle.js reads it like any stage object; `tutorial` switches on the scripted events.
export function tutorialStage(base) {
  const g = (kind, n, at, ang) => ({ kind, n, at, ang, spread: 0.7 });
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
