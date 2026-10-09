/* Chợ Phiên — bể thẻ và bộ lọc. Bộ lọc thật (TSpawnContextQuery.Groups/Behaviors) bị máy chủ xoá ([BazaarObfuscate],
   CODE-RUN §0.2) nên đọc lại từ chữ mô tả của chính thẻ gặp gỡ, đúng như CODE-RUN §3.2 đề nghị: "Sells Large items",
   "Get a Silver-tier Weapon", "Teaches Freeze skills", "Get a Bronze-tier Sharpening Stone (+Damage), Extract (+Poison)...".
   Một bộ đọc dùng chung cho thương nhân, đống đồ, bước sự kiện và hiệu ứng ngoài trận của vật phẩm.
   Chia bài: mỗi ô gieo bậc theo bảng ngày (TUNING.TIER_ODDS_BY_DAY), lấy đều trong các thẻ có StartingTier ≤ bậc
   (xác suất NATIVE_TIER_PROB lấy đúng bậc), không lặp trong một lần chia, trùng bản sở hữu thì theo bậc bản đó
   (Dealer:3446-3641, 4476-4498). */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var T = function () { return R.TUNING; };

  // Thẻ mẫu / gỡ lỗi / vé thám hiểm không bao giờ được chia
  var JUNK = /^\[|TEMPLATE|DEBUG|Debug|effectdata|Test Subject|Art Test/;
  var HEROES = ['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok'];
  R.HEROES_PLAYABLE = ['Vanessa', 'Pygmalien', 'Dooley']; // data/cards.js chỉ chở đủ bể thẻ của ba hero này (tools/data.py HEROES)

  var vocab = null;
  function buildVocab() {
    var C = root.BZ_CARDS, tags = {}, hidden = {}, titles = {}, id, t;
    for (id in C) {
      t = C[id];
      (t.Tags || []).forEach(function (x) { tags[x] = 1; });
      (t.HiddenTags || []).forEach(function (x) { if (!/Reference$/.test(x)) hidden[x] = 1; });
    }
    var words = {};
    function add(w, list) { words[w.toLowerCase()] = list; }
    Object.keys(tags).forEach(function (x) { add(x, [x]); add(x + 's', [x]); });
    Object.keys(hidden).forEach(function (x) { if (!words[x.toLowerCase()]) add(x, [x]); });
    add('Max Health', ['Health']); add('Health', ['Health']); add('Economic', ['EconomyReference', 'Value', 'Income', 'Gold']);
    add('Crit', ['Crit']); add('Cooldown', ['Cooldown', 'Haste', 'Charge']);
    delete words.gold; delete words.income; delete words.value; delete words.level; delete words.experience; // từ tiền tệ, không phải thẻ
    for (id in C) {
      t = C[id];
      if (JUNK.test(t.InternalName || '')) continue;
      var name = R.title(t);
      if (!name || name.length < 4 || words[name.toLowerCase()] || /^(Gold|Income|Loot|Item)$/i.test(name)) continue;
      (titles[name] = titles[name] || []).push(id);
    }
    // tên dài trước để "Sharpening Stone" thắng "Stone"
    var tnames = Object.keys(titles).sort(function (a, b) { return b.length - a.length; });
    vocab = { words: words, titles: titles, tnames: tnames };
    return vocab;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Đọc chữ → bộ lọc {kind, tiers, sizes, any, not, hero, names, enchanted, copy, unparsed}
  var parseCache = {};
  R.parseFilter = function (desc, opts) {
    var key = (desc || '') + '|' + ((opts && opts.hero) || '');
    if (parseCache[key]) return R.clone(parseCache[key]);
    var V = vocab || buildVocab(), f = { kind: null, tiers: null, sizes: null, any: [], not: [], hero: null, names: [], enchanted: false, copy: false };
    var s = String(desc || '').replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    if (/copy of any item on your board/i.test(s)) f.copy = true;
    // tên thẻ cụ thể ("Get a Bronze-tier Sharpening Stone (+Damage), Extract (+Poison) and Cinders (+Burn)")
    V.tnames.forEach(function (n) {
      var re = new RegExp('\\b' + esc(n) + '(e?s)?\\b', 'i');
      if (re.test(s)) { f.names.push(n); s = s.replace(re, ' '); }
    });
    s = s.replace(/\([^)]*\)/g, ' ');
    if (/\bskills?\b/i.test(s)) f.kind = 'skill'; else if (/\bitems?\b/i.test(s) || f.names.length) f.kind = 'item';
    var tm = s.match(/\b(Bronze|Silver|Gold|Diamond|Legendary)(?=-tier| or (?:Bronze|Silver|Gold|Diamond|Legendary)-tier)/g);
    if (tm) f.tiers = tm.filter(function (x, i) { return tm.indexOf(x) === i; });
    var sm = s.match(/\b(Small|Medium|Large)\b/g);
    if (sm) f.sizes = sm.filter(function (x, i) { return sm.indexOf(x) === i; });
    if (/Buys your/i.test(s)) { // "Sells Small and Medium items. Buys your Large items at +X value": chỉ câu đầu là bộ lọc bán
      var first = s.split(/\.\s*/)[0];
      sm = first.match(/\b(Small|Medium|Large)\b/g); f.sizes = sm ? sm.filter(function (x, i) { return sm.indexOf(x) === i; }) : null;
    }
    if (/from any hero|any hero/i.test(s)) f.hero = 'any';
    else if (/other Heroes|another Hero/i.test(s)) f.hero = 'other';
    else if (/\bNeutral\b/.test(s)) f.hero = 'Common';
    else if (/this Hero/i.test(s) && opts && opts.hero) f.hero = opts.hero;
    var um = s.match(/unique to (\w+)|Teaches (\w+) Skills/i);
    if (um && HEROES.indexOf(um[1] || um[2]) >= 0) f.hero = um[1] || um[2];
    if (/enchanted/i.test(s)) f.enchanted = true;
    var nm = s.match(/\bnon-(\w+)/gi);
    (nm || []).forEach(function (x) { var w = V.words[x.slice(4).toLowerCase()]; if (w) f.not = f.not.concat(w); });
    s = s.replace(/\bnon-\w+/gi, ' ');
    // từ ghép trước ("Max Health"), rồi từng từ
    Object.keys(V.words).filter(function (w) { return w.indexOf(' ') > 0; }).forEach(function (w) {
      var re = new RegExp('\\b' + esc(w) + '\\b', 'i');
      if (re.test(s)) { f.any = f.any.concat(V.words[w]); s = s.replace(re, ' '); }
    });
    s.split(/[^A-Za-z]+/).forEach(function (w) {
      var hit = V.words[w.toLowerCase()];
      if (hit && !/^(Bronze|Silver|Gold|Diamond|Legendary|Small|Medium|Large)$/.test(w)) hit.forEach(function (x) { if (f.any.indexOf(x) < 0) f.any.push(x); });
    });
    parseCache[key] = R.clone(f);
    return f;
  };

  // ---------- bể theo hero ----------
  var poolCache = {};
  R.pool = function (kind) {
    if (poolCache[kind]) return poolCache[kind];
    var C = root.BZ_CARDS, out = [];
    for (var id in C) {
      var t = C[id];
      if (JUNK.test(t.InternalName || '')) continue;
      if ((t.HiddenTags || []).indexOf('Ticket') >= 0) continue;
      if (kind === 'skill' ? !R.isSkill(t) : R.isSkill(t)) continue;
      out.push(id);
    }
    poolCache[kind] = out;
    return out;
  };
  function heroOk(t, f, run) {
    var hs = t.Heroes || [];
    if (f.hero === 'any') return true;
    if (f.hero === 'other') return hs.indexOf(run.hero) < 0 && hs.indexOf('Common') < 0;
    if (f.hero) return hs.indexOf(f.hero) >= 0;
    return hs.indexOf(run.hero) >= 0 || hs.indexOf('Common') >= 0;
  }
  function hasAny(t, list) {
    if (!list.length) return true;
    var tg = (t.Tags || []).concat(t.HiddenTags || []);
    for (var i = 0; i < list.length; i++) if (tg.indexOf(list[i]) >= 0) return true;
    return false;
  }
  function hasNone(t, list) {
    var tg = (t.Tags || []).concat(t.HiddenTags || []);
    for (var i = 0; i < list.length; i++) if (tg.indexOf(list[i]) >= 0) return false;
    return true;
  }
  // Thẻ mẫu khớp bộ lọc (chưa xét bậc)
  R.matchTpl = function (t, f, run) {
    if (f.names && f.names.length) return f.names.indexOf(R.title(t)) >= 0; // tên cụ thể: bỏ qua hero
    if (!heroOk(t, f, run)) return false;
    if (f.sizes && !R.isSkill(t) && f.sizes.indexOf(t.Size) < 0) return false;
    return hasAny(t, f.any || []) && hasNone(t, f.not || []);
  };
  function tierOk(t, tier, exact) {
    if (!t.Tiers || !t.Tiers[tier]) return false;
    var st = R.tierIndex(t.StartingTier || 'Bronze'), ti = R.tierIndex(tier);
    return exact ? st === ti : st <= ti;
  }
  R.ownedSkill = function (run, id) { return run.board.skills.some(function (c) { return c.id === id; }); };
  R.ownedTier = function (run, id) {
    var best = null;
    run.board.hand.concat(run.board.stash).forEach(function (c) { if (c.id === id && (!best || R.tierIndex(c.tier) > R.tierIndex(best))) best = c.tier; });
    return best;
  };
  R.rollTier = function (run, table) {
    var row = (table || T().TIER_ODDS_BY_DAY), w = row[Math.min(row.length, Math.max(1, run.day)) - 1];
    var i = R.rollWeights(run, w);
    return R.TIERS[i < 0 ? 0 : i];
  };
  R.bandTier = function (run) { var b = T().BAND_BY_DAY; return b[Math.min(b.length, Math.max(1, run.day)) - 1]; };
  function randomEnchant(run, t) {
    var ks = Object.keys(t.Enchantments || {});
    return ks.length ? ks[R.randInt(run, ks.length)] : null;
  }

  // Chia n thẻ theo bộ lọc. opts: {tierMode: 'day'|'band', exclude: {id:1}, allowOwnedSkills}
  // Trả về [{id, tier, ench}] (có thể ít hơn n nếu bể cạn). Bể rỗng thì nới dần: bỏ từ khoá → bỏ cỡ → bỏ hero [ĐỀ XUẤT].
  R.deal = function (run, f, n, opts) {
    opts = opts || {};
    var out = [], used = {}, ex = opts.exclude || {};
    if (f.copy) { // "Get a copy of any item on your board"
      var mine = run.board.hand.concat(run.board.stash);
      for (var c = 0; c < n && mine.length; c++) { var m = mine.splice(R.randInt(run, mine.length), 1)[0]; out.push({ id: m.id, tier: m.tier, ench: m.ench }); }
      return out;
    }
    var kinds = f.kind === 'skill' ? ['skill'] : f.kind === 'item' ? ['item'] : ['item'];
    var relax = [f, Object.assign({}, f, { any: [], not: [] }), Object.assign({}, f, { any: [], not: [], sizes: null }),
      Object.assign({}, f, { any: [], not: [], sizes: null, hero: null, names: [] })];
    var matched = []; // thẻ khớp bộ lọc ở từng mức nới (tính một lần cho cả lần chia)
    var matchedAt = function (r) {
      if (matched[r]) return matched[r];
      var list = [];
      kinds.forEach(function (kd) {
        R.pool(kd).forEach(function (id) {
          if (ex[id]) return;
          if (kd === 'skill' && !opts.allowOwnedSkills && R.ownedSkill(run, id)) return;
          if (R.matchTpl(R.tpl(id), relax[r], run)) list.push(id);
        });
      });
      matched[r] = list;
      return list;
    };
    for (var k = 0; k < n; k++) {
      var tier = f.tiers && f.tiers.length ? f.tiers[R.randInt(run, f.tiers.length)]
        : (opts.tierMode === 'band' ? R.bandTier(run) : R.rollTier(run));
      var exact = !(f.tiers && f.tiers.length) && R.rand(run) < T().NATIVE_TIER_PROB;
      var cands = [];
      for (var r = 0; r < relax.length && !cands.length; r++) {
        var list = matchedAt(r);
        // bậc: thử bậc gieo, rồi đi xuống, rồi đi lên (RollEncounterTierAndFilter đi tiếp các bậc khi rỗng)
        var tiers = exact && r === 0 ? [[tier, true], [tier, false]] : [[tier, false]];
        for (var d = R.tierIndex(tier) - 1; d >= 0; d--) tiers.push([R.TIERS[d], false]);
        for (var u = R.tierIndex(tier) + 1; u < 4; u++) tiers.push([R.TIERS[u], false]);
        for (var ti = 0; ti < tiers.length && !cands.length; ti++) {
          for (var li = 0; li < list.length; li++) {
            var id = list[li];
            if (used[id] || !tierOk(R.tpl(id), tiers[ti][0], tiers[ti][1])) continue;
            cands.push({ id: id, tier: tiers[ti][0] });
          }
        }
      }
      if (!cands.length) break;
      var pickc = cands[R.randInt(run, cands.length)], tpl = R.tpl(pickc.id);
      if (!(f.names && f.names.length)) used[pickc.id] = 1; // tên cụ thể ("Get 3 Chocolate Bars"): được trùng
      var owned = R.ownedTier(run, pickc.id);
      var dealt = owned && R.tierIndex(owned) < 3 && tpl.Tiers[owned] ? owned : pickc.tier; // TierDuplicateCardHandling
      out.push({ id: pickc.id, tier: dealt, ench: f.enchanted ? randomEnchant(run, tpl) : null });
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
