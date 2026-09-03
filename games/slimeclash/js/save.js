/*
 * SlimeClash — lưu tiến trình.
 *
 * Hai tầng, đúng bất biến của hub (games/BRIDGE.md): localStorage là tầng CHÍNH và luôn
 * chạy; HubSave (cloud) là tầng phụ nằm DƯỚI. Mở game ngoài hub, offline, hoặc chưa đăng
 * nhập thì mọi lời gọi cloud rơi về "không có tài khoản" và game vẫn chạy bình thường.
 */
(function (root) {
  'use strict';

  var CFG = root.CFG || require('./config.js');
  var DATA = root.DATA || require('./data.js');

  function freshState() {
    var owned = {};
    DATA.starterIds.forEach(function (id) { owned[id] = { level: 1, shards: 0 }; });
    return {
      v: 1,
      chapter: 1,
      day: 1,
      gold: 300,
      gem: 20,
      shards: 0,
      heroLevel: 1,
      owned: owned,
      deck: DATA.starterIds.slice(0, CFG.deck.size),
      dailyStamp: 0,
      tickets: 0,
      gemToday: 0,
      heroPackToday: 0,
      epicPackToday: 0,
      lowGoldPackToday: 0,
      winBoxToday: 0,
      preBoostToday: 0,
      reviveAdToday: 0,
      chapterGold: 0,
      chapterCards: 0,
      lossStreak: 0,
      failPackClaimed: false,
      boughtOnce: [],
      stats: { battles: 0, wins: 0 }
    };
  }

  function loadLocal() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(CFG.saveKey);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.v === 1) ? s : null;
    } catch (e) { return null; }
  }

  function saveLocal(state) {
    try {
      if (root.localStorage) root.localStorage.setItem(CFG.saveKey, JSON.stringify(state));
    } catch (e) { /* private mode / quota — bỏ qua, game vẫn chạy */ }
  }

  function pushCloud(state) {
    try {
      if (root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable()) {
        root.HubSave.storeSave(CFG.gameId, state);
      }
    } catch (e) { /* cloud là tầng phụ, hỏng thì kệ */ }
  }

  // Trả về Promise<state>. Cloud thắng nếu nó mới hơn theo tiến trình (chương, rồi ngày).
  function load() {
    var local = loadLocal() || freshState();
    if (!(root.HubSave && root.HubSave.isAvailable && root.HubSave.isAvailable())) {
      return Promise.resolve(local);
    }
    return root.HubSave.loadSave(CFG.gameId).then(function (r) {
      if (!r || !r.ok || !r.found || !r.payload || r.payload.v !== 1) return local;
      var c = r.payload;
      var localScore = local.chapter * 1000 + local.day;
      var cloudScore = c.chapter * 1000 + c.day;
      return cloudScore > localScore ? c : local;
    }).catch(function () { return local; });
  }

  function save(state) {
    saveLocal(state);
    pushCloud(state);
  }

  root.SlimeSave = { freshState: freshState, load: load, save: save, saveLocal: saveLocal };
  if (typeof module === 'object' && module.exports) module.exports = root.SlimeSave;
})(typeof window !== 'undefined' ? window : globalThis);
