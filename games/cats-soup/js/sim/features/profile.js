// Feature "profile" (sim part): the player profile (nickname, introduction, title, picture, frame) and the photo mission
// behind the camera button. Rules: D:/catsoup-ref/rules/profile.md. Pure JS: the view draws the windows.
// Contract: js/sim/registry.js.
import * as B from '../big.js';

export const NICK_MAX = 16;        // characters (the original limits bytes through BALANCE; inferred)
export const INTRO_MAX = 200;      // lang UI_ProfileIntro_Guide_Rule: under 200 characters
export const PHOTO_SECONDS = 60;          // BALANCE Income_ScreenShot (specials.md row 12)
export const SPECIAL_SECONDS = 600;       // BALANCE Speical_ScreenShot_Income (row 86)
export const SPECIAL_SIZE = 4;            // BALANCE Special_ScreenShot_MapSize (row 71)
export const SPECIAL_PER_DAY = 1;         // Special_ScreenShot_Count (row 72)
export const SPECIAL_RATE = 50;           // Special_ScreenShot_Rate (row 73), percent
export const MISSION_EVERY = 4;           // Spawn.TimeFlow: a photo mission is offered when timeCount % 4 == 1
export const MISSION_SPECIAL_RATE = 30;   // JudgeRate 30 (0x41f00000) in Spawn+_TimeFlow_d__177.c
export const PHOTO_ABILITY = 1001;        // sub skill "photo reward" (abilityS_1001): Ability.subIndex of the cat sub skill row 1100 and the fish collection row 500
const CAT_SUB_FIRST = 1100;               // Ability.index of the first cat sub skill (type 102); subIndex 1001 is row 1100, 1002 row 1101, ...

export const DEFAULT_ALIAS = 'noName';

const S = g => g.state.profile;
const D = g => g.data.profile;

export function init(g) {
  const s = g.state;
  if (!s.profile) s.profile = {};
  const p = s.profile;
  if (p.nick == null) p.nick = '';
  if (p.intro == null) p.intro = '';
  if (p.title == null) p.title = 0;          // PlayerTitle index, 0 = none selected
  if (p.image == null) p.image = 0;          // PrimaryImage index
  if (p.frame == null) p.frame = 0;          // PrimaryOutline index
  if (p.maxCats == null) p.maxCats = 0;
  if (p.photos == null) p.photos = 0;
  if (p.mission == null) p.mission = 0;      // 0 none, 1 photo gold waiting, 2 special photo gold waiting
  if (p.lastTime == null) p.lastTime = s.timeCount || 1;
  if (!p.special) p.special = { day: -1, n: 0 };
  if (!p.deco) p.deco = { frame: 0 };        // last photo frame the player picked
}

const cats = g => Math.max(g.state.cats.length, S(g).maxCats);

// ---- unlocks: condition type 0 always, 1 = cats collected >= value, 2 = event reward (not obtainable here) ----
function owned(g, row) { return row.type === 0 || (row.type === 1 && cats(g) >= row.value); }
export const unlockedTitles = g => D(g).titles.filter(r => owned(g, r)).map(r => r.index);
export const ownsTitle = (g, idx) => D(g).titles.some(r => r.index === idx && owned(g, r));
export const ownsImage = (g, idx) => D(g).images.some(r => r.index === idx && owned(g, r));
export const ownsOutline = (g, idx) => D(g).outlines.some(r => r.index === idx && owned(g, r));
export const ownsSticker = (g, idx) => D(g).stickers.some(r => r.index === idx && owned(g, r));
export const ownsFrame = (g, idx) => D(g).frames.some(r => r.index === idx && owned(g, r));

export const row = (g, list, idx) => D(g)[list].find(r => r.index === idx) || null;
export const isOwned = (g, r) => owned(g, r);

// ---- editable fields ----
// The shown name: the chosen one, else the hub account name, else lang "noName".
export function nickname(g, fallback) { return S(g).nick || fallback || ''; }
export function setNick(g, text) {
  const t = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
  if (t.length < 1 || t.length > NICK_MAX) return false;
  S(g).nick = t;
  g.emit('profile', { field: 'nick' });
  return true;
}
export function setIntro(g, text) {
  const t = String(text == null ? '' : text);
  if (t.length >= INTRO_MAX) return false;
  S(g).intro = t;
  g.emit('profile', { field: 'intro' });
  return true;
}
// Title: 0 releases it (UI_PlayerTitle_Release_Confirm); a locked title cannot be chosen.
export function setTitle(g, idx) {
  if (idx !== 0 && !ownsTitle(g, idx)) return false;
  S(g).title = idx;
  g.emit('profile', { field: 'title' });
  return true;
}
export function setImage(g, idx) {
  if (!ownsImage(g, idx)) return false;
  S(g).image = idx;
  g.emit('profile', { field: 'image' });
  return true;
}
export function setFrame(g, idx) {
  if (!ownsOutline(g, idx)) return false;
  S(g).frame = idx;
  g.emit('profile', { field: 'frame' });
  return true;
}

// The numbers shown on the profile card (lang UI_Profile_CatCount / ForestLevel / BuildingCount).
export function stats(g) {
  const s = g.state;
  return { cats: s.cats.length, forest: s.mapSize + 1, buildings: s.works.length + (s.storage ? s.storage.length : 0), photos: S(g).photos };
}

// ---- photo mission ----
// Spawn.TimeFlow: every 4th time step a photo mission turns on (1), special (2) with 30 % when the forest is big enough.
// The camera pays the gold once and turns it off again (DataManager.SetScreenShotMissionOn).
export function tick(g) {
  const p = S(g);
  if (g.state.cats.length > p.maxCats) p.maxCats = g.state.cats.length;
  const t = g.state.timeCount;
  if (t === p.lastTime) return;
  p.lastTime = t;
  if (p.mission === 0 && t % MISSION_EVERY === 1) {
    p.mission = (g.state.mapSize >= SPECIAL_SIZE && g.rng() * 100 < MISSION_SPECIAL_RATE) ? 2 : 1;
    g.emit('photoMission', { mission: p.mission });
  }
}

// Cat sub skills (row 1100 = subIndex 1001) plus the fish collection set bonus (Ability type 11, subIndex 1001; collection.md).
export function photoPercent(g) {
  const cat = g.feat.cats && g.feat.cats.subSkillPercent ? g.feat.cats.subSkillPercent(g, CAT_SUB_FIRST + PHOTO_ABILITY - 1001) : 0;
  const col = g.feat.collection && g.feat.collection.subPercent ? g.feat.collection.subPercent(g, PHOTO_ABILITY) : 0;
  return cat + col;
}

// GetScreenShotGold: avgGoldIncome x seconds x (1 + photo ability % / 100).
export function photoGold(g, special) {
  return B.mul(B.mul(g.averageIncome(), special ? SPECIAL_SECONDS : PHOTO_SECONDS), 1 + photoPercent(g) / 100);
}

// A photo was taken (saved). opt.day (days since epoch) and opt.special (force the special roll) are for tests.
// Pays when a mission is waiting; the special one also needs a free daily slot and the 50 % roll. Always emits 'photo'.
export function photo(g, opt = {}) {
  const p = S(g);
  const day = opt.day != null ? opt.day : Math.floor(Date.now() / 864e5);
  p.photos += 1;
  let gold = null, special = false;
  if (p.mission > 0) {
    if (p.special.day !== day) p.special = { day, n: 0 };
    if (p.mission === 2 && g.state.mapSize >= SPECIAL_SIZE && p.special.n < SPECIAL_PER_DAY
      && (opt.special != null ? opt.special : g.rng() * 100 < SPECIAL_RATE)) { special = true; p.special.n += 1; }
    gold = photoGold(g, special);
    g.reward(1, gold);
    p.mission = 0;
  }
  g.emit('photo', { gold, special });
  return { gold, special };
}

export default {
  id: 'profile', data: ['profile'], init, tick,
  unlockedTitles, ownsTitle, ownsImage, ownsOutline, ownsSticker, ownsFrame, row, isOwned,
  nickname, setNick, setIntro, setTitle, setImage, setFrame, stats, photoGold, photoPercent, photo,
  NICK_MAX, INTRO_MAX,
};
