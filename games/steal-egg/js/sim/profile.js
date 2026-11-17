// Front-end profile (rules/menus-flow.md 2, 3, 6; rules/ads-iap.md 1.3, 5). Pure: no DOM, no storage; runs in node.
// It is the MainMenu scene's PlayerPrefs plus the run choice, kept as the `profile` sub-object of the steal-egg-v1
// save (save(state, p) / load(state)).
//
// Original keys kept:
//   UnlockedPlayers  comma-joined ints, e.g. "0,3" (PurchaseAbleCharacterSelection.SaveUnlockedPlayers). The SAME key
//                    backs the character, brainrot (studentSelection) and weapon (weaponSelection) panels, so
//                    unlocking index k in one panel unlocks k in the other two (studentSelection.c:87,
//                    weaponSelection.c:77). Every panel's OnEnable forces 0 into the set without saving it; the next
//                    save then writes it ("0,3").
//   SoundEnabled, MusicEnabled (int, default 1), sensitivity (int, default 10)  Settings.c:13, SoundManager.c:17.
// Run choice: character = GoToGamePlay.playerIndex (written by charSelection for every previewed index, locked or not;
// the only choice gameplay reads); brainrot / weapon = studentSelection / weaponSelection cursor (cosmetic in the
// original: no gameplay reader); mode 'story' (ModeSelection/StealMode, the "Story Mode" tile) and environment 'day'
// (dayN9ight/StealMode, the "Day" tile) are the only live tiles, the others are "Comming" tiles with no handler.
// Ads: every menu ad grants at once (ads-iap.md decision). Character/brainrot/weapon unlock = UnlockPlayerWithAd,
// coin button = coins.WatchAds -> RewardCoind (+100). Coins belong to the sim (state.coins); coins earned in the menu
// wait in pendingCoins until the game takes them (takePendingCoins). IAP (AllInApp, RemoveAds, char/student/wepon)
// stays 0 for ever, so no IAP flag is stored.

export const SLOTS = 6;                    // previews per panel: players[6] in all three selection scripts
export const UNLOCKED_KEY = 'UnlockedPlayers';
export const AD_COINS = 100;               // coins.RewardCoind: CoinAmount + 100 (coins.c:474)
export const PANELS = ['character', 'brainrot', 'weapon'];
export const PROFILE_VERSION = 1;

export function newProfile() {
  return {
    v: PROFILE_VERSION,
    prefs: { [UNLOCKED_KEY]: null, SoundEnabled: 1, MusicEnabled: 1, sensitivity: 10 },
    character: 0, brainrot: 0, weapon: 0, mode: 'story', environment: 'day',
    adUnlocks: { character: 0, brainrot: 0, weapon: 0 },   // ad unlocks granted, per panel
    adCoinTaps: 0,                                         // coin ad buttons pressed in the menu
    pendingCoins: 0,                                       // menu ad coins not yet added to the sim
  };
}

// LoadUnlockedPlayers: split on ',' and keep what parses as an int (TryParse), in stored order, no duplicates.
export function parseUnlocked(str) {
  const out = [];
  if (typeof str !== 'string' || !str) return out;
  for (const part of str.split(',')) {
    const t = part.trim();
    if (!/^[+-]?\d+$/.test(t)) continue;
    const n = parseInt(t, 10);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

export const formatUnlocked = list => list.join(',');

// The set a panel works with after OnEnable: stored list plus index 0.
export function unlockedList(p) {
  const list = parseUnlocked(p.prefs[UNLOCKED_KEY]);
  if (!list.includes(0)) list.push(0);
  return list;
}

export const isUnlocked = (p, i) => unlockedList(p).includes(i);

// UnlockPlayerWithAd (ad reward at once): add the current index to the shared set and save the whole set.
// Returns true when it was locked before.
export function unlock(p, panel, i) {
  checkPanel(panel);
  const list = unlockedList(p), fresh = !list.includes(i);
  if (fresh) list.push(i);
  p.prefs[UNLOCKED_KEY] = formatUnlocked(list);
  if (fresh) p.adUnlocks[panel] = (p.adUnlocks[panel] || 0) + 1;
  return fresh;
}

// SelectPlayer(i) on a panel: the cursor moves whether i is unlocked or not (the original writes
// GoToGamePlay.playerIndex for every previewed character); the Next button only shows for unlocked ones.
export function select(p, panel, i) {
  checkPanel(panel);
  if (!Number.isInteger(i) || i < 0 || i >= SLOTS) throw new Error(`slot ${i} out of range 0..${SLOTS - 1}`);
  p[panel] = i;
  return isUnlocked(p, i);
}

export function adCoins(p) {
  p.adCoinTaps++;
  p.pendingCoins += AD_COINS;
  return AD_COINS;
}

export function takePendingCoins(p) {
  const n = p.pendingCoins;
  p.pendingCoins = 0;
  return n;
}

export function setSetting(p, key, value) {
  if (key === 'sensitivity') p.prefs.sensitivity = Math.trunc(value);   // Settings.ChangeSensitivity: (int)slider.value
  else if (key === 'SoundEnabled' || key === 'MusicEnabled') p.prefs[key] = value ? 1 : 0;
  else throw new Error(`setting "${key}" not found`);
}

// The run the menu hands to the game.
export const choice = p => ({ character: p.character, brainrot: p.brainrot, weapon: p.weapon, mode: p.mode, environment: p.environment });

function checkPanel(panel) {
  if (!PANELS.includes(panel)) throw new Error(`panel "${panel}" not found`);
}

const int = (v, d) => (Number.isFinite(+v) ? Math.trunc(+v) : d);

// Profile from a steal-egg-v1 save (object or JSON string) or from a bare profile object; defaults for anything missing.
export function load(state) {
  let s = state;
  if (typeof s === 'string') {
    try { s = JSON.parse(s); } catch (e) { s = null; }
  }
  const src = s && typeof s === 'object' ? (s.profile && typeof s.profile === 'object' ? s.profile : (s.prefs ? s : null)) : null;
  const p = newProfile();
  if (!src) return p;
  const pr = src.prefs || {};
  p.prefs[UNLOCKED_KEY] = typeof pr[UNLOCKED_KEY] === 'string' ? pr[UNLOCKED_KEY] : null;
  p.prefs.SoundEnabled = int(pr.SoundEnabled, 1) ? 1 : 0;
  p.prefs.MusicEnabled = int(pr.MusicEnabled, 1) ? 1 : 0;
  p.prefs.sensitivity = int(pr.sensitivity, 10);
  for (const k of PANELS) {
    const v = int(src[k], 0);
    p[k] = v >= 0 && v < SLOTS ? v : 0;
    p.adUnlocks[k] = Math.max(0, int(src.adUnlocks && src.adUnlocks[k], 0));
  }
  if (typeof src.mode === 'string') p.mode = src.mode;
  if (typeof src.environment === 'string') p.environment = src.environment;
  p.adCoinTaps = Math.max(0, int(src.adCoinTaps, 0));
  p.pendingCoins = Math.max(0, int(src.pendingCoins, 0));
  return p;
}

// Writes the profile into a save state object (a copy; the caller's state is not touched) and returns it.
export function save(state, p) {
  const base = state && typeof state === 'object' ? state : {};
  return { ...base, profile: JSON.parse(JSON.stringify(p)) };
}
