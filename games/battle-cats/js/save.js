// Persistent progression for Battle Cats web (localStorage). Per-viewer only.
(function (root) {
  'use strict';
  var KEY = 'bc_save_v1';

  function def() {
    return {
      owned: [],        // cat uids the player has
      levels: {},       // uid -> level (>=1)
      lineup: [],       // chosen deploy slots (uids, max 10)
      baseLvl: 1,       // Cat Base level
      catFood: 150,     // gacha currency
      xp: 2000,         // upgrade currency
      cleared: {},      // stageId -> true
    };
  }

  function load() {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = def();
    var d = def();
    for (var k in d) if (!(k in s)) s[k] = d[k];
    return s;
  }

  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  var api = { load: load, save: save, def: def, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BCSave = api;
})(typeof window !== 'undefined' ? window : this);
