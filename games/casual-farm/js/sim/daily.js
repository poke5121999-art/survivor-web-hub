// Daily spin, gems and the welcome-mart cash (rules/census-daily-shop.md sections 2, 3, 6; values from the
// DailySpinScreen prefab, tools/export_menus.py). State lives in the global save: gems, spin {day, used}, the cash
// multiplier inputs (maxLevel, maxItems), the marts already welcomed and the one-time gem gift.

// DailySpin_*_Index<n>: [zRotationMin, zRotationMax) of the wheel's final angle, what the slot pays.
export const SLOTS = [
  { kind: 'booster', z: [300, 360] },
  { kind: 'cash', z: [0, 60], mult: 3, golden: true },
  { kind: 'gems', z: [60, 120], coupons: 2 },
  { kind: 'booster', z: [120, 180] },
  { kind: 'cash', z: [180, 240], mult: 1 },
  { kind: 'booster', z: [240, 300] },
];
// DailySpinMenuController.OnPressSpinButton: one Random.value cut at 0.8 / 0.6 / 0.4 / 0.25 / 0.1.
const CUTS = [[0.8, 0], [0.6, 3], [0.4, 5], [0.25, 4], [0.1, 2], [-1, 1]];
export const SPIN_TIME = 5.25, SPIN_TURNS = 3600, WHEEL_START = 24.81;
export const FREE_SPINS = 1, AD_SPINS = 3;
// GemManager: RvToGem(1) = trunc(4.0 x 1); CouponToGem(c) = max(1, trunc(c / 1.0)).
export const GEM_SPIN = 4;
export const couponToGem = c => Math.max(1, Math.trunc(c));
// DailySpinRewardScreen.OnPressClaimButton: every booster lasts 300 s; GetRandomBooster draws without repeats.
export const BOOST_TIME = 300;
export const BOOSTER_KINDS = ['customer', 'player', 'machine', 'cash', 'worker'];
// RC_MartWelcomeScreen.martCashAmounts by scene build index (level<n>), paid once on the first visit, x2 from the ad.
const MART_CASH = [0, 0, 300, 600, 500, 500, 800, 1000, 1500, 2000, 3000, 4500, 6000, 1000, 7000, 1000, 8000, 888, 10000, 1700, 15000];
export const martCash = level => MART_CASH[+String(level).replace(/\D/g, '')] || 0;
// RC_CashMultiplier freeCashMultiplier: only Store (scene 1) has rows, by distinct items unlocked there.
const FREE_CASH = { 1: [1.0, 2.0, 3.0, 5.0, 6.0] };
export function freeCashMultiplier(g) {
  const rows = FREE_CASH[g.maxLevel || 0];
  return rows ? rows[Math.min(g.maxItems || 0, rows.length - 1)] : 1.0;
}

// UpdateLimitAds: the counters reset when the day of the year changes (local clock, TimeManager's fallback).
export function dayKey(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  return `${d.getFullYear()}-${Math.floor((d - start) / 86400000)}`;
}

export function secondsToMidnight(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return Math.max(0, (m - d) / 1000);
}

export function spinState(g, now = new Date()) {
  const k = dayKey(now);
  if (!g.spin || g.spin.day !== k) g.spin = { day: k, used: 0 };
  const used = g.spin.used;
  return { used, free: used < FREE_SPINS, ads: Math.max(0, FREE_SPINS + AD_SPINS - Math.max(used, FREE_SPINS)) };
}

export function rollSlot(r) {
  return CUTS.find(([cut]) => r > cut)[1];
}

// Wheel angle (degrees, counter-clockwise like Unity's z) for a landing on slot i: Random.Range(zMin, zMax), reached
// by +3600 degrees plus the difference from the current angle.
export function landing(from, i, r) {
  const [a, b] = SLOTS[i].z, target = a + r * (b - a);
  return from + SPIN_TURNS + (((target - from) % 360) + 360) % 360;
}

export function slotAt(angle) {
  const z = ((angle % 360) + 360) % 360;
  return SLOTS.findIndex(s => z >= s.z[0] && z < s.z[1]);
}

// The wheel as the menu opens (DailySpinMenuController.Awake): each booster slot gets its own booster type.
export function dealWheel(rng) {
  const pool = [...BOOSTER_KINDS];
  return SLOTS.map(s => (s.kind === 'booster' ? pool.splice(Math.floor(rng() * pool.length), 1)[0] : null));
}

// What slot i pays: DailySpinExtraCash = trunc(trunc(multiplier x cheapest mat) x FreeCashMultiplier()).
export function reward(i, wheel, { cheapest, g }) {
  const s = SLOTS[i];
  if (s.kind === 'booster') return { kind: 'boost', boost: wheel[i], seconds: BOOST_TIME };
  if (s.kind === 'gems') return { kind: 'gems', amount: couponToGem(s.coupons) };
  return { kind: 'cash', amount: Math.trunc(Math.trunc(s.mult * cheapest) * freeCashMultiplier(g)) };
}
