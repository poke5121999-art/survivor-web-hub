// The save, port of FG.Meta Save/Profile.cs + ProfileJson.cs. A profile is a plain object whose
// keys and order are those of the serialized form, so C# and JS saves are interchangeable.
import { MetaTime } from './rng.js';
import { Reward } from './types.js';
import {
  FormatError, parseJson, writeJson, f32, field, getI, getL, getF, getB, getS, getInts, getStrings,
} from './json.js';

export const CurrentVersion = 1;

export const newSkinProgress = (id, level = 1, tokens = 0) => ({ id, level, tokens });

/** new Profile() defaults. */
export function createProfile() {
  return {
    version: CurrentVersion,
    createdAt: 0,
    saveCounter: 0,
    name: 'Player',
    nameCustomized: false,
    tutorialDone: false,
    gameCount: 0,
    coins: 0,
    gems: 0,
    skinSelected: 1,
    skins: [newSkinProgress(1)],
    newSkins: [],
    skinPity: 10,
    trophies: 0,
    trophiesShown: 0,
    lastLeagueChange: 0,
    roadClaimed: [],
    leaguePacksBought: [],
    difficulty: 0,
    modeDeck: [],
    stageUnlocked: [1, 2, 3],
    fridge: {
      stars: 0, stock: 6, lastRefillHour: 0, unlocked: 0, openCount: 0,
      specialCounter: 0, specialThreshold: 0, special3Counter: 0, special3Threshold: 0, pendingBox: 0,
    },
    missions: { unlocked: false, week: -1, missionSkin: 0, slots: [] },
    daily: { day: -1, gifts: [], specialOffer: null, claimed: [], paidOfferDay: -1, vip1Ads: 0, vip2Ads: 0 },
    vipUntil: 0,
    hasMadePurchase: false,
    stats: {
      kills: 0, deaths: 0, boxesOpened: 0, jumps: 0, wins: 0, losses: 0,
      missionsCompleted: 0, battles: 0, dailyOffersClaimed: 0, goldCollected: 0,
    },
    achievements: [],
    settings: { musicMute: false, sfxMute: false, vibrationMute: false, fps: 60, language: '' },
  };
}

/** Profile instance members of the C# class, as functions over the plain object. */
export const Profile = {
  CurrentVersion,
  create: createProfile,
  skin(p, id) { return p.skins.find(s => s.id === id) ?? null; },
  hasSkin(p, id) { return Profile.skin(p, id) !== null; },
  level(p, skinId) { return Profile.skin(p, skinId)?.level ?? 1; },
  isVip(p, utcNow) { return MetaTime.seconds(utcNow) < p.vipUntil; },
  maxSkinLevel(p) {
    let m = 1;
    for (const s of p.skins) if (s.level > m) m = s.level;
    return m;
  },
};

/** MissionSlot.RewardAvailable */
export const missionRewardAvailable = s => s.completed && !s.rewardClaimed;

export const newMissionSlot = (index, missionId) => ({
  index, missionId, progress: 0, completed: false, reward: null, rewardClaimed: false, forcedSkins: [],
});

export const ProfileJson = {
  /** Same bytes as ProfileJson.ToJson. */
  toJson(p) {
    const f = p.fridge, m = p.missions, d = p.daily, st = p.stats, se = p.settings;
    return writeJson({
      version: p.version, createdAt: p.createdAt, saveCounter: p.saveCounter,
      name: p.name, nameCustomized: p.nameCustomized, tutorialDone: p.tutorialDone,
      gameCount: p.gameCount, coins: p.coins, gems: p.gems, skinSelected: p.skinSelected,
      skins: p.skins.map(s => ({ id: s.id, level: s.level, tokens: s.tokens })),
      newSkins: p.newSkins, skinPity: f32(p.skinPity),
      trophies: p.trophies, trophiesShown: p.trophiesShown, lastLeagueChange: p.lastLeagueChange,
      roadClaimed: p.roadClaimed, leaguePacksBought: p.leaguePacksBought,
      difficulty: f32(p.difficulty), modeDeck: p.modeDeck, stageUnlocked: p.stageUnlocked,
      fridge: {
        stars: f.stars, stock: f.stock, lastRefillHour: f.lastRefillHour, unlocked: f.unlocked, openCount: f.openCount,
        specialCounter: f.specialCounter, specialThreshold: f.specialThreshold,
        special3Counter: f.special3Counter, special3Threshold: f.special3Threshold, pendingBox: f.pendingBox,
      },
      missions: {
        unlocked: m.unlocked, week: m.week, missionSkin: m.missionSkin,
        slots: m.slots.map(s => ({
          index: s.index, missionId: s.missionId, progress: s.progress, completed: s.completed,
          reward: Reward.toPlain(s.reward), rewardClaimed: s.rewardClaimed, forcedSkins: s.forcedSkins,
        })),
      },
      daily: {
        day: d.day, gifts: d.gifts.map(Reward.toPlain), specialOffer: Reward.toPlain(d.specialOffer),
        claimed: d.claimed, paidOfferDay: d.paidOfferDay, vip1Ads: d.vip1Ads, vip2Ads: d.vip2Ads,
      },
      vipUntil: p.vipUntil, hasMadePurchase: p.hasMadePurchase,
      stats: {
        kills: st.kills, deaths: st.deaths, boxesOpened: st.boxesOpened, jumps: st.jumps, wins: st.wins,
        losses: st.losses, missionsCompleted: st.missionsCompleted, battles: st.battles,
        dailyOffersClaimed: st.dailyOffersClaimed, goldCollected: st.goldCollected,
      },
      achievements: p.achievements,
      settings: {
        musicMute: se.musicMute, sfxMute: se.sfxMute, vibrationMute: se.vibrationMute, fps: se.fps, language: se.language,
      },
    });
  },

  /** Parses a save over a default profile (missing fields keep defaults). FormatException for a non-profile. */
  fromJson(json) {
    const n = parseJson(json);
    if (n === null || typeof n !== 'object' || Array.isArray(n)) throw new FormatError('profile: root is not an object');
    const version = getI(n, 'version', 0);
    if (version > CurrentVersion) {
      throw new FormatError('profile: save version ' + version + ' is newer than this build (' + CurrentVersion + ')');
    }
    const p = createProfile();
    p.createdAt = getL(n, 'createdAt', p.createdAt);
    p.saveCounter = getL(n, 'saveCounter', p.saveCounter);
    p.name = getS(n, 'name', p.name);
    p.nameCustomized = getB(n, 'nameCustomized', p.nameCustomized);
    p.tutorialDone = getB(n, 'tutorialDone', p.tutorialDone);
    p.gameCount = getI(n, 'gameCount', p.gameCount);
    p.coins = getI(n, 'coins', p.coins);
    p.gems = getI(n, 'gems', p.gems);
    p.skinSelected = getI(n, 'skinSelected', p.skinSelected);
    const skins = field(n, 'skins');
    if (Array.isArray(skins)) p.skins = skins.map(s => newSkinProgress(getI(s, 'id'), getI(s, 'level', 1), getI(s, 'tokens')));
    if (has(n, 'newSkins')) p.newSkins = getInts(n, 'newSkins');
    p.skinPity = getF(n, 'skinPity', p.skinPity);
    p.trophies = getI(n, 'trophies', p.trophies);
    p.trophiesShown = getI(n, 'trophiesShown', p.trophiesShown);
    p.lastLeagueChange = getL(n, 'lastLeagueChange', p.lastLeagueChange);
    if (has(n, 'roadClaimed')) p.roadClaimed = getInts(n, 'roadClaimed');
    if (has(n, 'leaguePacksBought')) p.leaguePacksBought = getStrings(n, 'leaguePacksBought');
    p.difficulty = getF(n, 'difficulty', p.difficulty);
    if (has(n, 'modeDeck')) p.modeDeck = getInts(n, 'modeDeck');
    if (has(n, 'stageUnlocked')) p.stageUnlocked = getInts(n, 'stageUnlocked');

    const fn = field(n, 'fridge');
    if (fn !== undefined) {
      const f = p.fridge;
      f.stars = getI(fn, 'stars', f.stars);
      f.stock = getI(fn, 'stock', f.stock);
      f.lastRefillHour = getL(fn, 'lastRefillHour', f.lastRefillHour);
      f.unlocked = getI(fn, 'unlocked', f.unlocked);
      f.openCount = getI(fn, 'openCount', f.openCount);
      f.specialCounter = getI(fn, 'specialCounter', f.specialCounter);
      f.specialThreshold = getI(fn, 'specialThreshold', f.specialThreshold);
      f.special3Counter = getI(fn, 'special3Counter', f.special3Counter);
      f.special3Threshold = getI(fn, 'special3Threshold', f.special3Threshold);
      f.pendingBox = getI(fn, 'pendingBox', f.pendingBox);
    }

    const mn = field(n, 'missions');
    if (mn !== undefined) {
      const m = p.missions;
      m.unlocked = getB(mn, 'unlocked', m.unlocked);
      m.week = getI(mn, 'week', m.week);
      m.missionSkin = getI(mn, 'missionSkin', m.missionSkin);
      const slots = field(mn, 'slots');
      if (Array.isArray(slots)) {
        for (const s of slots) {
          m.slots.push({
            index: getI(s, 'index'), missionId: getI(s, 'missionId'), progress: getI(s, 'progress'),
            completed: getB(s, 'completed'), reward: Reward.read(field(s, 'reward')),
            rewardClaimed: getB(s, 'rewardClaimed'), forcedSkins: getInts(s, 'forcedSkins'),
          });
        }
      }
    }

    const dn = field(n, 'daily');
    if (dn !== undefined) {
      const d = p.daily;
      d.day = getL(dn, 'day', d.day);
      d.gifts = Reward.readList(field(dn, 'gifts'));
      d.specialOffer = Reward.read(field(dn, 'specialOffer'));
      if (has(dn, 'claimed')) d.claimed = getInts(dn, 'claimed');
      d.paidOfferDay = getL(dn, 'paidOfferDay', d.paidOfferDay);
      d.vip1Ads = getI(dn, 'vip1Ads', d.vip1Ads);
      d.vip2Ads = getI(dn, 'vip2Ads', d.vip2Ads);
    }

    p.vipUntil = getL(n, 'vipUntil', p.vipUntil);
    p.hasMadePurchase = getB(n, 'hasMadePurchase', p.hasMadePurchase);

    const sn = field(n, 'stats');
    if (sn !== undefined) {
      const st = p.stats;
      st.kills = getI(sn, 'kills'); st.deaths = getI(sn, 'deaths'); st.boxesOpened = getI(sn, 'boxesOpened');
      st.jumps = getI(sn, 'jumps'); st.wins = getI(sn, 'wins'); st.losses = getI(sn, 'losses');
      st.missionsCompleted = getI(sn, 'missionsCompleted'); st.battles = getI(sn, 'battles');
      st.dailyOffersClaimed = getI(sn, 'dailyOffersClaimed'); st.goldCollected = getL(sn, 'goldCollected');
    }
    if (has(n, 'achievements')) p.achievements = getStrings(n, 'achievements');

    const en = field(n, 'settings');
    if (en !== undefined) {
      const se = p.settings;
      se.musicMute = getB(en, 'musicMute'); se.sfxMute = getB(en, 'sfxMute'); se.vibrationMute = getB(en, 'vibrationMute');
      se.fps = getI(en, 'fps', se.fps); se.language = getS(en, 'language', se.language);
    }

    migrate(p, version);
    return p;
  },

  /** Bumps the save counter and writes the profile to the store. */
  save(store, p) {
    p.saveCounter++;
    store.save(ProfileJson.toJson(p));
  },

  /** Loads the stored profile, or null when the store is empty. */
  load(store) {
    const json = store.load();
    return json === null || json === undefined || json === '' ? null : ProfileJson.fromJson(json);
  },
};

// JsonNode: n["x"] != null is true for a present key even when its value is JSON null
function has(n, key) { return field(n, key) !== undefined; }

function migrate(p, fromVersion) {
  // version 0 = file written before versioning; nothing to convert yet.
  void fromVersion;
  if (!p.hasMadePurchase && p.leaguePacksBought.length > 0) p.hasMadePurchase = true; // LoadUserAsync fix-up (§1.1)
  p.version = CurrentVersion;
}

/**
 * Where the save lives: { load(): string|null, save(json), delete() }. Swap in another object with the
 * same three methods (the hub cloud save) without touching the meta.
 */
export class MemoryProfileStore {
  constructor() { this.json = null; }
  load() { return this.json; }
  save(json) { this.json = json; }
  delete() { this.json = null; }
}

export class LocalStorageProfileStore {
  constructor(key = 'food-gang-profile', storage = globalThis.localStorage) {
    if (!storage) throw new Error('localStorage not available');
    this.key = key;
    this.storage = storage;
  }
  load() { return this.storage.getItem(this.key); }
  save(json) { this.storage.setItem(this.key, json); }
  delete() { this.storage.removeItem(this.key); }
}
