// Meta systems ported from the decompiled C#: RandomSkin, MissionSystem, GiftSystem, AdRewardSystem, MinigameSystem helpers,
// MenuController.CheckSpecialSkin. Numbers come from the code (see ~/snail-ride-ref/CODE.md).
import { A, tr } from '../engine/assets.js?v=20261102a';
import { Game, addCurrency, saveUser, timestamp, rnd, rndi, skinById } from './user.js?v=20261102a';
import { publish } from './events.js?v=20261102a';

const U = () => Game.User;

// ---------- RandomSkin ----------
const rate = s => (s.availability !== 0 ? 10 : 25); // Availability.MiniGame = 0 -> 25
export function randomSkin(pNew, miniGameOnly, exclude = null) {
  const own = [], fresh = []; let tOwn = 0, tNew = 0;
  for (const s of A.game.skins) {
    if ((exclude && exclude.includes(s.id)) || (miniGameOnly && s.availability !== 0)) continue;
    const r = rate(s);
    if (U().m_skins.includes(s.id)) { own.push(s); tOwn += r; } else { fresh.push(s); tNew += r; }
  }
  const roll = pNew ? rnd(0, tNew) : rnd(0, tOwn);
  let acc = 0;
  for (const s of (pNew ? fresh : own)) { acc += rate(s); if (roll <= acc) return s; }
  return A.game.skins[0];
}

// ---------- Missions ----------
const NORMAL_TEMPLATE = [1, 1, 1, 1, 1, 2, 2, 3];
export const MissionType = { Global: 0, Session: 1, SessionWithTimer: 2 };
export const MissionGoal = { Survive: 0, Score: 1, Travel: 2, DodgeSpike: 3, Collect: 4, DestroySpike: 5, DestroyBugs: 6, DodgeBugs: 7 };
export function missionData(name) { return A.game.missions.find(m => m.m_name === name) || null; }
export const missionReward = d => (d.m_difficulty === 3 ? 500 : d.m_difficulty === 2 ? 300 : 150);
export function missionCurrent() { const m = U().m_mission; return m && missionData(m.m_missionData) ? m : null; }
export function missionDescription(m) {
  const d = missionData(m.m_missionData);
  let s = tr(d.m_text).replace('[X]', String(d.m_goalValue)).replace('[T]', String(d.m_timer));
  if (d.m_conditionSkin) { const sk = skinById(m.m_conditionSkin); s = s.replace('[Z]', sk ? sk.name : ''); }
  return s;
}
export const missionPercent = m => m.m_progression / missionData(m.m_missionData).m_goalValue;
export const missionFinished = m => !!(m._success || m._failed);
function newMissionObj(d) {
  const m = { m_gameCount: 0, m_missionData: d.m_name, m_progression: 0, m_new: true, m_conditionSkin: 0, m_conditionAction: 0, m_reward: missionReward(d) };
  if (d.m_conditionSkin && m.m_conditionSkin <= 0) m.m_conditionSkin = randomSkin(false, false).id;
  return m;
}
export const missionTimer = () => (U().m_missionCount > 2 ? 10800 : 0);
export const missionRemaining = () => U().m_nextMissionTimestamp - timestamp();
export function newMissionStack() {
  const u = U();
  if (u.m_missionCount < 3) {
    for (const n of ['Mission 16', 'Mission 07', 'Mission 01']) if (missionData(n) && !u.m_missionStack.includes(n)) u.m_missionStack.push(n);
    return;
  }
  const by = d => A.game.missions.filter(m => m.m_difficulty === d);
  const l1 = by(1), l2 = by(2), l3 = by(3);
  let guard = 0;
  while (u.m_missionStack.length < NORMAL_TEMPLATE.length && guard++ < 1000) {
    const t = NORMAL_TEMPLATE[u.m_missionStack.length];
    let d = null;
    if (t === 1) d = l1[rndi(0, l1.length)];
    else if (t === 2) d = u.m_bestScore >= 300 ? l2[rndi(0, l2.length)] : l1[rndi(0, l1.length)];
    else d = u.m_bestScore >= 600 ? l3[rndi(0, l3.length)] : l2[rndi(0, l2.length)];
    if (d && !u.m_missionStack.includes(d.m_name)) u.m_missionStack.push(d.m_name);
  }
}
export function refreshMission() {
  const u = U(); const m = missionCurrent();
  if (m) {
    if (missionPercent(m) >= 1) m._success = true;
    const d = missionData(m.m_missionData);
    if (!m._success && (d.m_type === 1 || d.m_type === 2)) { m.m_progression = 0; m._failed = false; }
  }
  if (u.m_nextMissionTimestamp < 0 && !missionCurrent() && u.m_minigameCount > 0) u.m_nextMissionTimestamp = timestamp() + missionTimer();
}
export function newMission() {
  const u = U();
  if (missionCurrent()) return;
  if (!u.m_missionStack.length) newMissionStack();
  let name = u.m_missionStack[0];
  if (u.m_missionCount >= 3) name = u.m_missionStack[rndi(0, u.m_missionStack.length)];
  u.m_mission = newMissionObj(missionData(name));
  u.m_missionStack.splice(u.m_missionStack.indexOf(name), 1);
  publish('MissionStackUpdateEvent');
}
export function nextMissionTimerExpired() {
  const u = U(); const now = timestamp(); let guard = 0;
  while (u.m_nextMissionTimestamp <= now && !missionCurrent() && guard++ < 100) { u.m_nextMissionTimestamp += missionTimer(); newMission(); }
  if (missionCurrent()) u.m_nextMissionTimestamp = -1;
}
export function replaceMission() { U().m_mission = null; newMission(); }
export let missionLastReward = 0;
export function claimMission(m) {
  missionLastReward = m.m_reward; addCurrency(missionLastReward); U().m_mission = null; refreshMission();
}
// Success flag lives on the object at runtime in C# (non-serialized property): restore from progression on load.
export function missionCheckSuccess(m) {
  const d = missionData(m.m_missionData);
  if (m.m_progression >= d.m_goalValue && !m._success) { m._success = true; m._failed = false; U().m_missionCount++; publish('MissionSuccessEvent', { mission: m }); }
}
export function missionProgress(m, v) {
  if (!m || missionFinished(m) || m.m_progression === v) return;
  m.m_progression = Math.min(v, missionData(m.m_missionData).m_goalValue);
  publish('MissionUpdateEvent', { mission: m, audio: true });
  missionCheckSuccess(m);
}
export function missionResetSession() {
  const m = missionCurrent();
  if (m && !m._success) { const d = missionData(m.m_missionData); if (d.m_type === 1 || d.m_type === 2) { m.m_progression = 0; m._failed = false; } }
  publish('MissionResetEvent');
}
// Per-frame update during a run (MissionSystem.Update). ctx: {started, paused, resuming, gameOver, time, score, speedCoef, coefDistance, skinId}
export function missionUpdate(dt, ctx) {
  const m = missionCurrent();
  if (m && !missionFinished(m)) {
    const d = missionData(m.m_missionData);
    const live = ctx.started && !ctx.paused && !ctx.resuming && !ctx.gameOver && (!d.m_conditionSkin || ctx.skinId === m.m_conditionSkin);
    if (d.m_type === 2 && ctx.time >= d.m_timer) {
      if (m.m_progression === d.m_goalValue) missionCheckSuccess(m);
      else { publish('MissionFailureEvent', { mission: m }); m._failed = true; m._success = false; }
    }
    if (live && d.m_goal === 0) { if (m.m_progression < d.m_goalValue) m.m_progression += dt; else missionCheckSuccess(m); }
    if (live && d.m_goal === 2) {
      if (m.m_progression < d.m_goalValue) { const a = m.m_progression | 0; m.m_progression += dt * ctx.speedCoef * ctx.coefDistance; if ((m.m_progression | 0) !== a) publish('MissionUpdateEvent', { mission: m, audio: false }); }
      else missionCheckSuccess(m);
    }
    if (live && d.m_goal === 1) {
      if (m.m_progression < d.m_goalValue) { const a = m.m_progression | 0; m.m_progression = ctx.score; if ((m.m_progression | 0) !== a) publish('MissionUpdateEvent', { mission: m, audio: false }); }
      else missionCheckSuccess(m);
    }
  }
  if (U().m_nextMissionTimestamp > 0 && U().m_nextMissionTimestamp <= timestamp()) nextMissionTimerExpired();
}
const skinOk = (m, d, skinId) => !d.m_conditionSkin || skinId === m.m_conditionSkin;
export function missionOnCollect(skinId) { const m = missionCurrent(); if (!m) return; const d = missionData(m.m_missionData); if (d.m_goal === 4 && skinOk(m, d, skinId)) missionProgress(m, m.m_progression + 1); }
export function missionOnDodge(bug, skinId) { const m = missionCurrent(); if (!m) return; const d = missionData(m.m_missionData); if (((d.m_goal === 7 && bug) || (d.m_goal === 3 && !bug)) && skinOk(m, d, skinId)) missionProgress(m, m.m_progression + 1); }
export function missionOnDestroy(bug, skinId) { const m = missionCurrent(); if (!m) return; const d = missionData(m.m_missionData); if (((d.m_goal === 6 && bug) || (d.m_goal === 5 && !bug)) && skinOk(m, d, skinId)) missionProgress(m, m.m_progression + 1); }

// ---------- Gift ----------
const GIFT_TEMPLATE = [150, 150, 150, 150, 150, 300, 300, 500];
export const giftTimer = () => (U().m_giftCounter === 0 ? 180 : U().m_giftCounter === 1 ? 600 : 10800);
export const giftRemaining = () => U().m_nextGiftTimestamp - timestamp();
const shuffle = a => { const r = a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]); return r; };
export let giftLastReward = 0;
export function claimGift() {
  const u = U(); let n = 0;
  if (giftRemaining() <= 0) {
    if (u.m_giftCounter <= 0) n = 500;
    else { if (!u.m_giftStack.length) u.m_giftStack = shuffle(GIFT_TEMPLATE); n = u.m_giftStack.shift(); }
    u.m_nextGiftTimestamp = timestamp() + giftTimer();
    addCurrency(n); u.m_giftCounter++; giftLastReward = n;
  }
  return n;
}

// ---------- Ad reward (ads are granted instantly on the web) ----------
const AD_TEMPLATE = [150, 150, 150, 150, 150, 150, 150, 300];
export function claimAdReward() {
  const u = U();
  if (!u.m_adRewardStack.length) u.m_adRewardStack = shuffle(AD_TEMPLATE);
  const n = u.m_adRewardStack.shift(); addCurrency(n); u.m_adRewardCounter++; return n;
}
export function watchAd(type) { U().m_adWatchCount++; saveUser(); publish('WatchAdEvent', { type }); }

// ---------- Minigame helpers ----------
export const NEW_SKIN_TEMPLATE = [3, 4, 3, 4, 3, 4, 2, 3, 4, 4, 3, 4, 4, 2, 4, 4, 3, 4, 4, 4, 2, 3, 4, 4, 3, 4, 4, 2];
export const minigameSkinAvailable = () => A.game.skins.some(s => s.availability === 0 && !U().m_skins.includes(s.id));

// ---------- MenuController.CheckSpecialSkin ----------
const SPECIAL = [[36, u => u.m_minigameFailCount >= 5], [39, u => u.m_adWatchCount >= 50], [33, u => u.m_shareCount >= 5], [40, u => u.m_playTime >= 3000],
  [35, u => u.m_currencyCount >= 20000], [37, u => u.m_deadCount >= 200], [34, u => u.m_giftCounter >= 20], [38, u => u.m_missionCount >= 30]];
export function checkSpecialSkins() {
  const u = U();
  for (const [id, cond] of SPECIAL) if (!u.m_skins.includes(id) && !u.m_animationSkinUnlocked.includes(id) && cond(u)) { u.m_animationSkinUnlocked.push(id); publish('NewSkinEvent', { type: 'Special', id }); }
}
export const SPECIAL_HINT = { 36: 'fail', 40: 'playtime', 39: 'ad', 33: 'share', 45: 'doublecurrency', 46: 'doubleminigame', 37: 'dead', 35: 'currency', 34: 'gift', 38: 'mission' };
export function skinHint(s) { return SPECIAL_HINT[s.id] ? tr('info.special.' + SPECIAL_HINT[s.id]) : ''; }
export function formatTime(sec) {
  sec = Math.max(0, sec | 0); const h = (sec / 3600) | 0, m = ((sec % 3600) / 60) | 0, s = sec % 60; // TimeSpan.Hours wraps at 24
  const p = n => String(n).padStart(2, '0');
  if (h % 24 > 0) return `${h % 24}h${p(m)}m`;
  if (m > 0) return `${m}m${p(s)}s`;
  return `${s}s`;
}
export function formatNumber(n) { return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '0'; }

// ---------- Promote / skin purchase (IAP replaced: paid skins unlock directly on the web) ----------
let loopPromote = 0;
export function hasPromoteSkin() { return A.game.skins.some(s => s.availability !== 1 && s.rarity !== 0 && !U().m_skins.includes(s.id)); }
export function promoteSkin() {
  const l = A.game.skins.filter(s => s.availability !== 0 && s.availability !== 1 && !U().m_skins.includes(s.id));
  const l2 = A.game.skins.filter(s => s.availability === 0 && s.rarity === 1 && !U().m_skins.includes(s.id));
  if (!l.length && !l2.length) return null;
  let r = null, guard = 0;
  while (!r && guard++ < 10) { if (loopPromote % 2 === 0 && l2.length) r = l2[rndi(0, l2.length)]; else if (loopPromote % 2 === 1 && l.length) r = l[rndi(0, l.length)]; loopPromote++; }
  return r;
}
export function iapPrice() { return tr('info.free') !== 'info.free' ? tr('info.free') : 'FREE'; }
function unlockAnim(s) { if (!U().m_animationSkinUnlocked.includes(s.id)) U().m_animationSkinUnlocked.push(s.id); saveUser(); }
export function unlockPromoted(s) { if (s && !U().m_skins.includes(s.id)) { unlockAnim(s); publish('NewSkinEvent', { type: 'Promotion', id: s.id }); } }
export function unlockPaid(s) { if (s && !U().m_skins.includes(s.id)) { U().m_purchaseCount++; U().m_skins.push(s.id); unlockAnim(s); publish('NewSkinEvent', { type: 'Pay', id: s.id }); } }
export function payCurrency(s) {
  if (!s || U().m_skins.includes(s.id) || U().m_currency < s.price) return false;
  unlockAnim(s); U().m_currency -= s.price; saveUser(); publish('PurchaseCurrencyEvent', { id: s.id }); return true;
}
export function localizedRarity(s) { return s.rarity === 0 ? '' : s.rarity === 1 ? tr('rarity.rare') : s.rarity === 2 ? tr('rarity.legendary') : tr('rarity.special'); }
export function rarityColor(s) { const c = s.rarity === 0 ? null : s.rarity === 1 ? A.game.colors.rare : s.rarity === 2 ? A.game.colors.legendary : A.game.colors.special; return c ? [c.r, c.g, c.b, c.a] : [1, 1, 1, 1]; }
