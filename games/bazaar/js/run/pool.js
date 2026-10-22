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
  var JUNK_RE = /^\[|TEMPLATE|DEBUG|Debug|effectdata|Test Subject|Art Test/;
  // cộng thẻ ẩn vì không có art (TUNING.HIDDEN_CARDS)
  var hiddenSet = null;
  var JUNK = { test: function (name) {
    if (JUNK_RE.test(name)) return true;
    if (!hiddenSet) { hiddenSet = {}; (T().HIDDEN_CARDS || []).forEach(function (h) { hiddenSet[h.name] = 1; }); }
    return !!hiddenSet[name];
  } };
  R.isJunk = function (tpl) { return !!tpl && JUNK.test(tpl.InternalName || ''); };
  // Đồ quái rơi chung (tag Loot, hero Common: Sharpening Stone, Pelt, Coupon) và đồ chỉ để bán lấy vàng (Bar of Gold, Chunk of Gold,
  // Bag of Jewels: tooltip duy nhất "Sells for Gold"). Bể bazaardb là suy từ lượt chơi cộng đồng và có chúng ở Curio / Aimbot; chủ dự án
  // (người chơi bản thật) xác nhận sạp không bán loại này, nên thương nhân không bày.
  // [WIKI2 M3] mọi thẻ tag Loot (kể cả Catalyst: Loot của riêng Mak, wiki collection "Monster, Junk"), không chỉ Loot Common.
  R.isMonsterLoot = function (tpl) {
    if (!tpl) return false;
    var tags = (tpl.Tags || []).concat(tpl.HiddenTags || []), tips = (tpl.Localization && tpl.Localization.Tooltips) || [];
    if (tags.indexOf('Loot') >= 0) return true;
    return tips.length === 1 && /^Sells for Gold$/i.test(String((tips[0].Content || {}).Text || '').trim());
  };
  // [WIKI2 M1/M2] Đồ của quái theo wiki: trang {{Item}} có collection Monster / Junk (BZ_SHOPS.monsterItems, tools/bazaardb.py đọc
  // bản chép wiki) cộng R.isMonsterLoot. Junk Items.wiki: "can only be obtained through Monster encounters or from the Curio Merchant";
  // JayJay / Luxe / Serafina: "excluding Monster items". Nên mọi thương nhân KHÔNG bày chúng, trừ Curio (Curio.wiki "Sells Bronze-tier junk
  // items"; Bar of Gold.wiki "From the Curio merchant"; Scrap / Sharpening Stone / Gland / Med Kit...: "can be bought via the merchant Curio").
  var monSet = null, monSrc = null;
  R.isMonsterItem = function (tpl) {
    if (!tpl) return false;
    var S = root.BZ_SHOPS, list = S && S.monsterItems;
    if (list !== monSrc) { monSrc = list; monSet = {}; (list || []).forEach(function (id) { monSet[id] = 1; }); }
    return !!monSet[tpl.Id] || R.isMonsterLoot(tpl);
  };
  R.MONSTER_ITEM_MERCHANTS = ['Curio']; // thương nhân được bày đồ của quái (tên bazaardb / InternalName)
  R.sellsMonsterItems = function (e) { return !!e && R.MONSTER_ITEM_MERCHANTS.indexOf(e.InternalName) >= 0; };
  var HEROES = ['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok'];
  R.heroData = function (hero) { var H = root.BZ_HEROES; return (H && H.heroes && H.heroes[hero]) || null; };
  // Hero chơi được: BZ_HEROES.heroes[h].playable nếu có data/heroes.js (tools/data.py),
  // không thì mọi hero có bể vật phẩm đủ trong data/cards.js (TUNING.HERO_MIN_ITEMS) [ĐỀ XUẤT]. Tính lại mỗi lần đọc vì
  // thẻ có thể nạp theo hero sau khi trang mở.
  var heroCount = { n: -1, list: null };
  function heroesPlayable() {
    var H = root.BZ_HEROES;
    if (H && H.heroes) { // data/heroes.js: {order: [...], heroes: {Vanessa: {playable, start, levelUp, ...}}}
      return (H.order || Object.keys(H.heroes)).filter(function (h) { return H.heroes[h] && H.heroes[h].playable && HEROES.indexOf(h) >= 0; });
    }
    var C = root.BZ_CARDS || {}, ids = Object.keys(C);
    if (heroCount.n === ids.length && heroCount.list) return heroCount.list;
    var cnt = {};
    ids.forEach(function (id) {
      var t = C[id];
      if (JUNK.test(t.InternalName || '') || R.isSkill(t)) return;
      (t.Heroes || []).forEach(function (h) { cnt[h] = (cnt[h] || 0) + 1; });
    });
    heroCount = { n: ids.length, list: HEROES.filter(function (h) { return (cnt[h] || 0) >= T().HERO_MIN_ITEMS; }) };
    return heroCount.list;
  }
  Object.defineProperty(R, 'HEROES_PLAYABLE', { get: heroesPlayable, enumerable: true, configurable: true });
  R.HEROES_ALL = HEROES;

  // Tên thẻ khớp một cụm chữ không trùng hẳn tên nào ("get a Premium Piggle" → Premium Green/Red/... Piggles): mọi từ của cụm
  // phải có trong tên (bỏ số nhiều -s), trừ thẻ excludeId. Trả về danh sách tên (cùng khoá với vocab.titles).
  // Bộ lọc có đọc ra gì không (tên, tag, kỹ năng, hero, cỡ, bậc, bản sao)
  R.filterEmpty = function (f) {
    return !(f.names.length || f.any.length || f.kind === 'skill' || f.hero || (f.sizes && f.sizes.length) || (f.tiers && f.tiers.length) || f.copy);
  };
  // "get a Premium Piggle" / "Get a Gumball": cụm sau "get a|an|another|N" → các tên thẻ chứa mọi từ của cụm (R.findTitles)
  R.phraseFilter = function (text, excludeId) {
    var s = String(text || '').replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    var m = /\bget (?:(?:a|an|another|\d+)\s+)?([A-Za-z' ]+?)(?=\s+(?:from|and|to|for|with)\b|[.,;!]|\s*$)/i.exec(s);
    var names = m ? R.findTitles(m[1], excludeId) : [];
    return names.length ? { kind: 'item', tiers: null, sizes: null, any: [], not: [], hero: null, names: names, enchanted: false, copy: false } : null;
  };
  R.findTitles = function (phrase, excludeId) {
    freshCaches();
    var V = vocab || buildVocab(), stem = function (w) { return w.toLowerCase().replace(/([^s])s$/, '$1'); };
    var same = function (a, b) { return a === b || a === b + 'e' || b === a + 'e'; };
    var words = String(phrase || '').split(/[^A-Za-z']+/).filter(function (w) { return w.length >= 3 && !/^(the|and|from|any|item|items)$/i.test(w); }).map(stem);
    if (!words.length) return [];
    return Object.keys(V.titles).filter(function (n) {
      if (excludeId && V.titles[n].indexOf(excludeId) >= 0) return false;
      var tw = n.split(/[^A-Za-z']+/).filter(Boolean).map(stem);
      // danh từ chính của cụm phải là danh từ chính của tên: "Gumball" → Red/Blue Gumball, không phải Gumball Machine
      return same(tw[tw.length - 1], words[words.length - 1]) && words.every(function (w) { return tw.some(function (x) { return same(x, w); }); });
    });
  };

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
  // Chủ đề đồ của tên kỹ năng trong chữ thương nhân (Maximus), xem R.parseFilter
  var SKILL_THEME = { Speed: ['Haste', 'Cooldown'], Strength: ['Damage'], Toughness: ['Shield'], Health: ['Health', 'Heal', 'Regen'] };

  // Đọc chữ → bộ lọc {kind, tiers, sizes, any, not, hero, names, enchanted, copy, unparsed}
  var parseCache = {};
  R.parseFilter = function (desc, opts) {
    freshCaches();
    var key = (desc || '') + '|' + ((opts && opts.hero) || '');
    if (parseCache[key]) return R.clone(parseCache[key]);
    var V = vocab || buildVocab(), f = { kind: null, tiers: null, sizes: null, any: [], not: [], hero: null, names: [], enchanted: false, copy: false };
    var s = String(desc || '').replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, ' '), named = [];
    if (/copy of any item on your board/i.test(s)) f.copy = true;
    // tên thẻ cụ thể ("Get a Bronze-tier Sharpening Stone (+Damage), Extract (+Poison) and Cinders (+Burn)")
    V.tnames.forEach(function (n) {
      // tên số nhiều cũng khớp số ít ("Gumballs" ← "Get a Gumball")
      var stemN = n.length > 4 && /[^s]s$/.test(n) ? n.slice(0, -1) : n;
      var re = new RegExp('\\b' + esc(stemN) + '(e?s)?\\b', 'i');
      if (!re.test(s)) return;
      // bậc viết liền trước tên, không có "-tier" ("Get 5 Bronze Chocolate Bars" của Eating Contest)
      var tw = new RegExp('\\b(Bronze|Silver|Gold|Diamond|Legendary)\\s+' + esc(stemN) + '(e?s)?\\b').exec(s);
      if (tw) named.push(tw[1]);
      f.names.push(n); s = s.replace(re, ' ');
    });
    s = s.replace(/\([^)]*\)/g, ' ');
    if (/\bskills?\b/i.test(s)) f.kind = 'skill'; else if (/\bitems?\b/i.test(s) || f.names.length) f.kind = 'item';
    var tm = (s.match(/\b(Bronze|Silver|Gold|Diamond|Legendary)(?=-tier| or (?:Bronze|Silver|Gold|Diamond|Legendary)-tier)/g) || []).concat(named);
    if (tm.length) f.tiers = tm.filter(function (x, i) { return tm.indexOf(x) === i; });
    // cỡ viết thường cũng là cỡ ("get a small item from another Hero" của Scavenger)
    var sm = (s.match(/\b(Small|Medium|Large)\b/gi) || []).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase(); });
    if (sm.length) f.sizes = sm.filter(function (x, i) { return sm.indexOf(x) === i; });
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
    // "Sells Health, Speed, Strength and Toughness items" (Maximus): Speed / Strength / Toughness là tên kỹ năng, ở đây là chủ đề đồ.
    // Lọc vật phẩm mà khớp tên kỹ năng thì đổi tên thành chủ đề (SKILL_THEME); để nguyên là sạp rỗng. Đợt 9e (R1-5): trước lấy mọi tag của
    // thẻ kỹ năng (Strength mang tag Weapon nên mọi vũ khí lọt, kể cả món không gây sát thương), nay bảng chặt: Speed = Haste / giảm hồi chiêu,
    // Strength = gây Damage, Toughness = Shield; "Health" đứng cùng chúng = Health (Max Health) / Heal / Regen. Maximus không có trang wiki /
    // bazaardb nên bảng là [ĐỀ XUẤT].
    if (f.kind === 'item' && /\bitems?\b/i.test(s)) {
      var themed = false;
      f.names = f.names.filter(function (n) {
        var ids = V.titles[n] || [], tp = ids.length && R.tpl(ids[0]);
        if (!tp || !R.isSkill(tp) || ids.some(function (id) { return !R.isSkill(R.tpl(id)); })) return true;
        var th = SKILL_THEME[n] || (tp.Tags || []).concat(tp.HiddenTags || []).map(function (g) { return g.replace(/Reference$/, ''); });
        th.forEach(function (g) { if (f.any.indexOf(g) < 0) f.any.push(g); });
        if (SKILL_THEME[n]) themed = true;
        return false;
      });
      if (themed && f.any.indexOf('Health') >= 0) SKILL_THEME.Health.forEach(function (g) { if (f.any.indexOf(g) < 0) f.any.push(g); });
    }
    parseCache[key] = R.clone(f);
    return f;
  };

  // ---------- bể theo hero ----------
  // Bộ đệm tính lại khi số thẻ đã nạp đổi (data/cards-<hero>.js nạp sau)
  var poolCache = {}, cacheN = -1;
  function freshCaches() {
    var P = root.BZ_CARDS_PARTS, n = P ? Object.keys(P).join() : Object.keys(root.BZ_CARDS || {}).length; // phần thẻ đã nạp (data/cards-*.js)
    if (n !== cacheN) { cacheN = n; poolCache = {}; vocab = null; parseCache = {}; }
  }
  R.pool = function (kind) {
    freshCaches();
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
  // Bậc có của thẻ gần `tier` nhất (đúng bậc, rồi thấp hơn trước cao hơn): Boar Roast khi Wild Boar Vàng → Vàng
  R.nearTier = function (t, tier) {
    if (!t || !t.Tiers) return null;
    if (t.Tiers[tier]) return tier;
    for (var i = R.tierIndex(tier), d = 1; d < R.TIERS.length; d++) {
      if (R.TIERS[i - d] && t.Tiers[R.TIERS[i - d]]) return R.TIERS[i - d];
      if (R.TIERS[i + d] && t.Tiers[R.TIERS[i + d]]) return R.TIERS[i + d];
    }
    return null;
  };
  R.ownedSkill = function (run, id) { return run.board.skills.some(function (c) { return c.id === id; }); };
  // RUN-07: kỹ năng sở hữu còn nhập được (cùng id + cùng bậc, bậc < Diamond, còn bậc kế) — SkillCard.CanFuseWith (Domain.Models.Cards/SkillCard.cs:8)
  R.skillFusable = function (c) {
    var tpl = R.tpl(c.id);
    return !!tpl && R.tierIndex(c.tier) < 3 && !!root.BZSim.nextTier(tpl, c.tier);
  };
  R.ownedSkillInst = function (run, id) { return run.board.skills.filter(function (c) { return c.id === id; })[0] || null; };
  R.ownedTier = function (run, id) {
    var best = null;
    run.board.hand.concat(run.board.stash).forEach(function (c) { if (c.id === id && (!best || R.tierIndex(c.tier) > R.tierIndex(best))) best = c.tier; });
    return best;
  };
  // [WIKI2 R6] một bảng bậc theo ngày cho mọi thẻ chia ra (wiki "Item Skill Spawn Tier Percentage by Day"): bảng bazaardb của
  // thương nhân (R.shopTierWeights); TIER_ODDS_BY_DAY chỉ khi không có data/shops.js hoặc gọi kèm bảng riêng
  R.rollTier = function (run, table) {
    if (!table && root.BZ_SHOPS && root.BZ_SHOPS.tierOdds) { var j = R.rollWeights(run, R.shopTierWeights(run)); return R.TIERS[j < 0 ? 0 : j]; }
    var row = (table || T().TIER_ODDS_BY_DAY), w = row[Math.min(row.length, Math.max(1, run.day)) - 1];
    var i = R.rollWeights(run, w);
    return R.TIERS[i < 0 ? 0 : i];
  };
  R.bandTier = function (run) { var b = T().BAND_BY_DAY; return b[Math.min(b.length, Math.max(1, run.day)) - 1]; };
  // opts.notEnchant: loại yểm bùa (mở màn: không Golden / Radiant, wiki Start of Run); opts.icyHalf: Icy nửa trọng số (Serafina,
  // Version 0.1.3 "Reduced the rate that Serafina ... will sell Icy items" [WIKI2 M4, ĐỀ XUẤT ×0,5: bản vá không ghi số])
  function enchantKeys(t, opts) {
    var not = (opts && opts.notEnchant) || [];
    return Object.keys(t.Enchantments || {}).filter(function (k) { return not.indexOf(k) < 0; });
  }
  function randomEnchant(run, t, opts) {
    var ks = enchantKeys(t, opts);
    if (!ks.length) return null;
    var i = R.rollWeights(run, ks.map(function (k) { return opts && opts.icyHalf && k === 'Icy' ? 0.5 : 1; }));
    return ks[i < 0 ? 0 : i];
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
    var kinds = f.kind === 'skill' ? ['skill'] : ['item'];
    // Bể của hero đang chơi cạn thì lấy của mọi hero, nhưng giữ tag / cỡ / tên: bỏ chúng là chia bừa (Gumball ra Rune Axe, sạp
    // "Sells Potions" bày đồ quái rơi). Đồ quái rơi (R.isMonsterLoot) chỉ ra khi chữ gọi đích danh hoặc gọi "Loot".
    var noLoot = !(f.names && f.names.length) && (f.any || []).indexOf('Loot') < 0;
    var relax = [f, Object.assign({}, f, { hero: 'any' })];
    var matched = []; // thẻ khớp bộ lọc ở từng mức nới (tính một lần cho cả lần chia)
    var matchedAt = function (r) {
      if (matched[r]) return matched[r];
      var list = [];
      kinds.forEach(function (kd) {
        R.pool(kd).forEach(function (id) {
          if (ex[id] || (noLoot && !opts.allowLoot && R.isMonsterLoot(R.tpl(id)))) return; // allowLoot: Pearl's Dig Site (bể Monster)
          if (opts.noMonster && R.isMonsterItem(R.tpl(id))) return; // thương nhân không phải Curio (R.dealFor)
          if (f.enchanted && !enchantKeys(R.tpl(id), opts).length) return; // "an Enchanted item": thẻ phải có enchantment (được phép) để yểm
          if (kd === 'skill' && !opts.allowOwnedSkills) { var os = R.ownedSkillInst(run, id); if (os && !R.skillFusable(os)) return; }
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
      // CONTENT-05: thầy dạy chia kỹ năng theo dải bậc nên kỹ năng khởi đầu Kim cương không bao giờ ra; thỉnh thoảng chia mọi kỹ năng
      // khớp bộ lọc ở đúng bậc khởi đầu của nó [ĐỀ XUẤT]. Bộ lọc khoá bậc (Pip/Argenta/Orlin/Adira) giữ nguyên.
      if (f.kind === 'skill' && opts.tierMode === 'band' && !(f.tiers && f.tiers.length) && T().SKILL_ORPHAN_FALLBACK && R.rand(run) < T().SKILL_ANY_CHANCE) {
        var anyL = matchedAt(0).filter(function (id) { return !used[id]; });
        if (anyL.length) { var aid = anyL[R.randInt(run, anyL.length)]; cands.push({ id: aid, tier: R.tpl(aid).StartingTier || 'Bronze' }); }
      }
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
            // Hàng thương nhân: bỏ thẻ giá mua 0 ở bậc đó (Nanobot, Blue Piggles R...: thẻ chỉ sinh ra từ hiệu ứng, bản gốc không bán) [FLOW-7]
            if (opts.priced && R.price(R.tpl(id), tiers[ti][0]).buy <= 0) continue;
            cands.push({ id: id, tier: tiers[ti][0] });
          }
        }
      }
      if (!cands.length) break;
      var pickc = cands[R.randInt(run, cands.length)], tpl = R.tpl(pickc.id);
      if (!(f.names && f.names.length)) used[pickc.id] = 1; // tên cụ thể ("Get 3 Chocolate Bars"): được trùng
      var ownedSk = R.isSkill(tpl) ? R.ownedSkillInst(run, pickc.id) : null; // kỹ năng đã có: chia đúng bậc bản đó để nhập
      var owned = ownedSk ? ownedSk.tier : R.ownedTier(run, pickc.id);
      // TierDuplicateCardHandling: bản đã có thì chia đúng bậc bản đó, trừ khi chữ khoá bậc ("Get a Silver-tier ...", rương Bạc):
      // khi đó bậc của nguồn thắng (không ra Chef Hat Đồng ở sạp "Diamond-tier", Sharpening Stone Vàng ở rương Bạc)
      var dealt = owned && R.tierIndex(owned) < 3 && tpl.Tiers[owned] && !(f.tiers && f.tiers.length) ? owned : pickc.tier;
      out.push({ id: pickc.id, tier: dealt, ench: f.enchanted ? randomEnchant(run, tpl, opts) : null });
    }
    return out;
  };

  // ---------- bể thật của bazaardb.gg (data/shops.js, tools/bazaardb.py) ----------
  // Có bể cho gặp gỡ này thì chia từ đó (đúng như trang bazaardb hiện: hero đang chơi + Common, trừ khi "from any Hero"); không thì
  // rơi về bộ đọc chữ ở trên và đếm lại (R.shopStats.fallback) để biết còn bao nhiêu thương nhân / thầy chưa có bể.
  R.shopStats = { pool: 0, fallback: 0, byName: {} };
  R.shopRec = function (e) {
    var S = root.BZ_SHOPS;
    return (S && e && (S.merchants[e.Id] || S.trainers[e.Id])) || null;
  };
  // Bản live chỉ bày thương nhân / thầy cho hero có hàng ở đó (Eli chỉ Mak, Colt chỉ Vanessa, sạp "Vanessa" mọi hero trừ Vanessa)
  R.shopHeroOk = function (e, run) {
    var rec = R.shopRec(e);
    return !rec || !rec.heroes || rec.heroes.indexOf(run.hero) >= 0;
  };
  // Bảng bậc theo ngày (bazaardb /shop-odds, ngày > 16 dùng hàng cuối): trọng số Đồng/Bạc/Vàng/Kim cương
  R.shopTierWeights = function (run) {
    var rows = root.BZ_SHOPS.tierOdds, r = rows[Math.min(rows.length, Math.max(1, Math.floor(run.day))) - 1];
    return [r.bronze, r.silver, r.gold, r.diamond];
  };
  // Thẻ khớp chủ đề của chữ bộ lọc f (any / not): tag hoặc tag ...Reference, hoặc từ đó có trong tooltip của thẻ (không tính enchantment:
  // Turbo của món nào cũng nhắc Haste)
  var themeText = {};
  R.themeOk = function (t, f) {
    if (!t) return false;
    var tags = (t.Tags || []).concat(t.HiddenTags || []).map(function (g) { return g.replace(/Reference$/, ''); });
    if ((f.not || []).some(function (g) { return tags.indexOf(g) >= 0; })) return false;
    var any = (f.any || []).map(function (g) { return g.replace(/Reference$/, ''); });
    if (!any.length || any.some(function (g) { return tags.indexOf(g) >= 0; })) return true;
    var key = t.Id || t.InternalName, x = themeText[key];
    if (x == null) x = themeText[key] = ((t.Localization || {}).Tooltips || []).map(function (tt) { return ((tt || {}).Content || {}).Text || ''; }).join(' ');
    return any.some(function (g) { return new RegExp('\\b' + esc(g), 'i').test(x); });
  };
  var HERO_MODE = { any: 'any', other: 'other', common: 'Common' };
  function shopHeroFilter(rec, e, run) {
    if (rec.hero === 'this') { var m = /^(\w+) \(Hero Merchant\)/.exec((e && e.InternalName) || ''); return { hero: m ? m[1] : run.hero }; }
    return { hero: HERO_MODE[rec.hero] || null };
  }
  // opts: {exclude, priced, tierMode: 'day'|'band', allowOwnedSkills}. Trả về null nếu không có bể dùng được.
  R.dealShop = function (run, e, n, opts) {
    var rec = R.shopRec(e);
    if (!rec || !rec.pool || !rec.pool.length) return null;
    opts = opts || {};
    var ex = opts.exclude || {}, hf = shopHeroFilter(rec, e, run), skill = !!(rec.pool.length && R.isSkill(R.tpl(rec.pool[0])));
    var tf = R.parseFilter((e && e.Desc) || ''), sizes = tf.sizes; // bể bản live có món đổi cỡ so với demo (Eagle Sigil: Small ở "Sells Medium items")
    var src = rec.pool, enchant = false;
    if (rec.enchantedPool && /enchanted/i.test((e && e.Desc) || '')) { src = rec.enchantedPool; enchant = true; }
    var list = src.filter(function (id) {
      var t = R.tpl(id);
      if (!t || R.isJunk(t) || (t.HiddenTags || []).indexOf('Ticket') >= 0 || ex[id] || R.isSkill(t) !== skill || !heroOk(t, hf, run)) return false;
      if (sizes && !skill && sizes.indexOf(t.Size) < 0) return false;
      if (!R.sellsMonsterItems(e) && R.isMonsterItem(t)) return false; // đồ của quái: chỉ Curio bày [WIKI2 M1/M2]
      if (skill && !opts.allowOwnedSkills) { var os = R.ownedSkillInst(run, id); if (os && !R.skillFusable(os)) return false; }
      return true;
    });
    // Bể bazaardb suy từ lượt chơi cộng đồng, có món lạc chủ đề (Chronos "Sells Haste items" bày Refractor: không tag Haste, chữ không
    // nhắc Haste). Vật phẩm phải mang tag chữ nêu (kể cả tag ...Reference) hoặc nhắc từ đó trong tooltip; lọc hết thì giữ bể cũ.
    if (!skill && ((tf.any || []).length || (tf.not || []).length)) {
      var themed = list.filter(function (id) { return R.themeOk(R.tpl(id), tf); });
      if (themed.length) list = themed;
    }
    if (!list.length) return null;
    var out = [], used = {}, band = opts.tierMode === 'band';
    for (var k = 0; k < n; k++) {
      var tier = rec.tiers && rec.tiers.length ? rec.tiers[R.randInt(run, rec.tiers.length)]
        : band ? R.bandTier(run) : R.TIERS[Math.max(0, R.rollWeights(run, R.shopTierWeights(run)))];
      var cands = [];
      // thầy dạy chia kỹ năng theo dải bậc: thỉnh thoảng chia kỹ năng ở đúng bậc khởi đầu (xem R.deal, CONTENT-05)
      if (skill && band && !(rec.tiers && rec.tiers.length) && T().SKILL_ORPHAN_FALLBACK && R.rand(run) < T().SKILL_ANY_CHANCE) {
        var anyL = list.filter(function (id) { return !used[R.title(R.tpl(id))]; });
        if (anyL.length) { var aid = anyL[R.randInt(run, anyL.length)]; cands.push({ id: aid, tier: R.tpl(aid).StartingTier || 'Bronze' }); }
      }
      var order = [R.tierIndex(tier)], d, u;
      for (d = order[0] - 1; d >= 0; d--) order.push(d);
      for (u = order[0] + 1; u < 4; u++) order.push(u);
      for (var oi = 0; oi < order.length && !cands.length; oi++) {
        var tn = R.TIERS[order[oi]];
        list.forEach(function (id) {
          var t = R.tpl(id);
          if (used[R.title(t)] || !tierOk(t, tn, false)) return;
          if (opts.priced && R.price(t, tn).buy <= 0) return; // thẻ chỉ sinh từ hiệu ứng, bản gốc không bán [FLOW-7]
          cands.push({ id: id, tier: tn });
        });
      }
      if (!cands.length) break;
      var pk = cands[R.randInt(run, cands.length)], tpl = R.tpl(pk.id);
      used[R.title(tpl)] = 1;
      var ownedSk = skill ? R.ownedSkillInst(run, pk.id) : null, owned = ownedSk ? ownedSk.tier : R.ownedTier(run, pk.id);
      var dealt = owned && R.tierIndex(owned) < 3 && tpl.Tiers[owned] && !(rec.tiers && rec.tiers.length) ? owned : pk.tier; // như R.deal
      out.push({ id: pk.id, tier: dealt, ench: enchant ? randomEnchant(run, tpl) : null });
    }
    return out.length ? out : null;
  };
  // Cửa chung cho thương nhân / thầy: bể bazaardb trước, bộ đọc chữ sau (đếm). opts.shop = true khi gặp gỡ này đáng có bể.
  R.dealFor = function (run, e, f, n, opts) {
    // thương nhân (không phải Curio) đọc chữ khi không có bể bazaardb (Serafina): cũng không bày đồ của quái [WIKI2 M2]
    if (opts && opts.shop && e && e.Kind === 'merchant' && !R.sellsMonsterItems(e)) opts = Object.assign({}, opts, { noMonster: true });
    if (opts && e && e.InternalName === 'Serafina') opts = Object.assign({}, opts, { icyHalf: true });
    var cards = root.BZ_SHOPS ? R.dealShop(run, e, n, opts) : null;
    if (cards) { R.shopStats.pool++; return cards; }
    if (root.BZ_SHOPS && opts && opts.shop) {
      R.shopStats.fallback++;
      var nm = (e && (e.Title || e.InternalName)) || '?';
      R.shopStats.byName[nm] = (R.shopStats.byName[nm] || 0) + 1;
    }
    return R.deal(run, f, n, opts);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
