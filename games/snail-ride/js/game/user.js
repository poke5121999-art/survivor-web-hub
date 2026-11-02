// UserData port + save/load in localStorage (original: encrypted JSON in user.dat).
import { A } from '../engine/assets.js?v=20261102a';
const KEY = 'snailride.user.v1';
export function newUser() {
  return {
    m_localNotificationReminderAsked: false, m_animationSkinUnlocked: [], m_newSkin: 0, m_missionCount: 0, m_minigameFailCount: 0,
    m_forcedAd: 0, m_forcedAdTime: 0, m_forcedAdCounter: 0, m_adWatchCount: 0, m_shareCount: 0, m_playTime: 0, m_currencyCount: 0,
    m_deadCount: 0, m_missionTimerCount: 0, m_gameCounter: 0, m_giftCounter: 0, m_adRewardCounter: 0, m_currency: 0, m_bestScore: 0,
    m_skins: [1], m_skinSelected: 0, m_nextGiftTimestamp: -1, m_randomSelection: false, m_mission: null, m_missionStack: [],
    m_giftStack: [], m_adRewardStack: [], m_minigameCount: 0, m_purchaseCount: 0, m_nextMissionTimestamp: -1, m_musicMute: false, m_sfxMute: false,
    m_language: null,
  };
}
export const Game = { User: newUser() };
export function loadUser() {
  try { const s = localStorage.getItem(KEY); if (s) Object.assign(Game.User, JSON.parse(s)); } catch (e) { console.warn('save unreadable', e); }
  return Game.User;
}
export function saveUser() { try { localStorage.setItem(KEY, JSON.stringify(Game.User)); } catch (e) { console.warn('save failed', e); } }
export function resetUser() { Game.User = newUser(); saveUser(); }
export function addCurrency(n) {
  const u = Game.User;
  u.m_currency += n; u.m_currencyCount += n;
  if (u.m_skins.includes(45)) { u.m_currency += n; u.m_currencyCount += n; } // DoubleCurrency special skin
  u.m_currency = Math.max(0, Math.min(99999999, u.m_currency));
}
export function skins() { return A.game.skins; }
export function skinById(id) { return A.game.skins.find(s => s.id === id) || null; }
export function skinSelected() {
  const u = Game.User;
  if (u.m_randomSelection) return null;
  return A.game.skins.find(s => u.m_skinSelected > 0 && s.id === u.m_skinSelected) || null;
}
export const timestamp = () => Math.floor(Date.now() / 1000);
export const rnd = (a, b) => a + Math.random() * (b - a);           // Random.Range(float, float)
export const rndi = (a, b) => a + Math.floor(Math.random() * (b - a)); // Random.Range(int, int) max exclusive
