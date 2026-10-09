/* Chợ Phiên — lõi vòng chơi: RNG lưu trong run, sao chép, giá, bàn (tay 10 ô có khoá / kho 10 ô / kỹ năng 4), XP và cấp.
   Luật: D:\bazaar-ref\notes\CODE-RUN.md (trích `File.cs:line`). Hàm ở đây nhận `ctx = {run, events}` (run là bản sao
   đang được reducer sửa) hoặc `run` trần khi chỉ đọc. Không chạm DOM. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};
  var BZ = function () { return root.BZSim; };
  var T = function () { return R.TUNING; };

  R.TIERS = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary'];
  R.SIZE = { Small: 1, Medium: 2, Large: 3 };
  R.HAND_SLOTS = 10;   // BazaarBoard.cs:104 Socket_0..9
  R.tierIndex = function (t) { var i = R.TIERS.indexOf(t); return i < 0 ? 0 : i; };

  // ---------- dữ liệu ----------
  R.mode = function () { return root.BZ_MODE.mode; };
  R.tpl = function (id) { return BZ().tpl(id); };
  R.enc = function () { return root.BZ_ENCOUNTERS; };
  R.title = function (tpl) { return (tpl && tpl.Localization && tpl.Localization.Title && tpl.Localization.Title.Text) || (tpl && tpl.InternalName) || '?'; };
  R.isSkill = function (tpl) { return !!tpl && (tpl.$type === 'TCardSkill' || tpl.Type === 'Skill'); };

  // ---------- RNG mulberry32, trạng thái là một số nguyên trong run.rng (lưu được, tất định) ----------
  R.rand = function (run) {
    var a = (run.rng + 0x6D2B79F5) >>> 0;
    run.rng = a;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  R.randInt = function (run, n) { return Math.floor(R.rand(run) * n); };
  R.pick = function (run, arr) { return arr.length ? arr[R.randInt(run, arr.length)] : undefined; };
  R.seedInt = function (run) { return (R.randInt(run, 0x7fffffff) + 1) >>> 0; };
  R.rollWeights = function (run, weights) { // chỉ số theo trọng số; tổng 0 → -1
    var tot = 0, i; for (i = 0; i < weights.length; i++) tot += weights[i] || 0;
    if (tot <= 0) return -1;
    var x = R.rand(run) * tot;
    for (i = 0; i < weights.length; i++) { x -= weights[i] || 0; if (x < 0) return i; }
    return weights.length - 1;
  };
  R.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // ---------- sự kiện cho giao diện + nhật ký ----------
  R.emit = function (ctx, e) { ctx.events.push(e); return e; };
  R.log = function (ctx, e) {
    var run = ctx.run;
    e.d = run.day; e.h = run.hour;
    run.log.push(e);
    if (run.log.length > T().LOG_MAX) run.log.splice(0, run.log.length - T().LOG_MAX);
  };
  R.gold = function (ctx, delta, why) {
    if (!delta) return;
    var run = ctx.run, before = run.gold;
    run.gold = Math.max(0, run.gold + delta);
    var d = run.gold - before;
    if (d) R.emit(ctx, { type: 'gold', delta: d, why: why || null });
  };
  R.income = function (ctx, delta) {
    if (!delta) return;
    ctx.run.income += delta;
    R.emit(ctx, { type: 'income', delta: delta });
  };
  R.prestige = function (ctx, delta) {
    if (!delta) return;
    var run = ctx.run, max = R.mode().Prestige.PrestigeMax, before = run.prestige, next = Math.min(max, run.prestige + delta);
    // Lần đầu về <= 0: về FATES_PRESTIGE_AFTER và hẹn pha Fates ở đầu giờ kế (https://youtu.be/PSP75k4R4Pk?t=245); lần hai: về 0, hết run
    if (next <= 0 && !run.fatesUsed) { run.fatesUsed = true; run.fatesPending = true; next = T().FATES_PRESTIGE_AFTER; }
    run.prestige = Math.max(0, next);
    if (run.prestige !== before) R.emit(ctx, { type: 'prestige', delta: run.prestige - before });
  };

  // ---------- giá (game_modes.json StandardPrices; ghi đè theo bậc CardController.cs:635-676) ----------
  R.price = function (ci, tier) {
    var tpl = ci && ci.Tiers ? ci : R.tpl(ci && ci.id);
    if (!tpl) return { buy: 0, sell: 0 };
    tier = tier || (ci && ci.tier) || tpl.StartingTier || 'Bronze';
    var sp = R.mode().StandardPrices, sz = tpl.Size || (R.isSkill(tpl) ? 'Medium' : 'Small'), buy, sell;
    var B = R.isSkill(tpl) ? sp.SkillBuyPrices : sp.ItemBuyPrices, Sl = R.isSkill(tpl) ? sp.SkillSellPrices : sp.ItemSellPrices;
    buy = (B[sz] || B.Medium || {})[tier]; sell = (Sl[sz] || Sl.Medium || {})[tier]; // kỹ năng: bảng chỉ có hàng Medium
    var a = BZ().tierAttrs(tpl, tier);
    if (a.BuyPrice != null) buy = a.BuyPrice;
    if (a.SellPrice != null) sell = a.SellPrice;
    return { buy: buy || 0, sell: sell || 0 };
  };

  // ---------- thẻ của người chơi ----------
  // cardInst = hình của sim {uid, id, tier, ench, socket, size, section} + `mods` {thuộc tính: chênh lệch vĩnh viễn ngoài trận}
  R.newInst = function (ctx, id, tier, ench) {
    var run = ctx.run, tpl = R.tpl(id);
    run.uidN = (run.uidN || 0) + 1;
    return { uid: 'p' + run.uidN, id: id, tier: tier || tpl.StartingTier || 'Bronze', ench: ench || null, socket: 0,
      size: R.isSkill(tpl) ? 1 : (R.SIZE[tpl.Size] || 1), section: R.isSkill(tpl) ? 'skills' : 'hand', mods: {} };
  };
  // ---------- quest trên thẻ (TCardItem.Quests: List<TQuestGroup>, Domain.Cards.Quests\*.cs) ----------
  // Tiến độ lưu trên inst: ci.qp = {'g.e': số}, ci.qd = ['g.e', ...] (mục đã xong). Phần thưởng (TQuestReward: Abilities, Auras,
  // Tags, HiddenTags, Attributes, Tiers[t].Attributes, Localization) phủ lên thẻ như một enchantment. Sim chỉ đọc mẫu thẻ theo id
  // nên thẻ đã xong quest dùng một MẪU DẪN XUẤT đăng ký vào BZSim.extraCards với id `<id gốc>~q<g.e>+<g.e>` (chỉ ở bàn đưa vào
  // sim: R.simCard / R.playerBoard / phase.boards; run.board giữ id gốc). R.baseId(id) bỏ hậu tố.
  R.baseId = function (id) { var s = String(id || ''), k = s.indexOf('~q'); return k < 0 ? s : s.slice(0, k); };
  // Đăng ký lại mẫu dẫn xuất từ id (bàn đã lưu trong phase.boards sau khi nạp run): trả về id dùng được với BZSim.tpl
  R.ensureTpl = function (id) {
    var s = String(id || ''), k = s.indexOf('~q');
    if (k < 0) return s;
    return R.questTplId({ id: s.slice(0, k), qd: s.slice(k + 2).split('+') });
  };
  R.questTplId = function (ci) {
    if (!ci || !ci.qd || !ci.qd.length) return ci && ci.id;
    var keys = ci.qd.slice().sort(), did = ci.id + '~q' + keys.join('+'), BZ0 = BZ();
    BZ0.extraCards = BZ0.extraCards || {};
    if (BZ0.extraCards[did]) return did;
    var base = BZ0.tpl(ci.id);
    if (!base || !base.Quests) return ci.id;
    var t = R.clone(base), tierKeys = Object.keys(t.Tiers || {});
    t.Abilities = t.Abilities || {}; t.Auras = t.Auras || {}; t.Tags = (t.Tags || []).slice(); t.HiddenTags = (t.HiddenTags || []).slice();
    t.Localization = t.Localization || {}; t.Localization.Tooltips = (t.Localization.Tooltips || []).slice();
    keys.forEach(function (key) {
      var p = key.split('.'), g = base.Quests[+p[0]], e = g && g.Entries && g.Entries[+p[1]], rw = e && e.Reward;
      if (!rw) return;
      var k, nid;
      for (k in (rw.Abilities || {})) { nid = 'Q' + key + ':' + k; t.Abilities[nid] = rw.Abilities[k]; tierKeys.forEach(function (tk) { (t.Tiers[tk].AbilityIds = t.Tiers[tk].AbilityIds || []).push(nid); }); }
      for (k in (rw.Auras || {})) { nid = 'Q' + key + ':' + k; t.Auras[nid] = rw.Auras[k]; tierKeys.forEach(function (tk) { (t.Tiers[tk].AuraIds = t.Tiers[tk].AuraIds || []).push(nid); }); }
      (rw.Tags || []).forEach(function (x) { if (t.Tags.indexOf(x) < 0) t.Tags.push(x); });
      (rw.HiddenTags || []).forEach(function (x) { if (t.HiddenTags.indexOf(x) < 0) t.HiddenTags.push(x); });
      tierKeys.forEach(function (tk) {
        var A = t.Tiers[tk].Attributes = t.Tiers[tk].Attributes || {};
        for (k in (rw.Attributes || {})) A[k] = rw.Attributes[k];
        var rt = rw.Tiers && rw.Tiers[tk];
        for (k in ((rt && rt.Attributes) || {})) A[k] = rt.Attributes[k];
      });
      ((rw.Localization && rw.Localization.Tooltips) || []).forEach(function (tip) {
        var idx = t.Localization.Tooltips.length;
        t.Localization.Tooltips.push(tip);
        tierKeys.forEach(function (tk) { if (t.Tiers[tk].TooltipIds) t.Tiers[tk].TooltipIds.push(idx); });
      });
    });
    t.BaseId = ci.id;
    BZ0.extraCards[did] = t;
    return did;
  };

  // Thẻ cho sim: thuộc tính tuyệt đối = bậc (+ enchantment) + mods; luôn có SellPrice/BuyPrice để aura "Value" (Golden ×2) tính đúng
  R.simCard = function (ci) {
    var tpl = R.tpl(ci.id), out = { uid: ci.uid, id: R.questTplId(ci), tier: ci.tier, ench: ci.ench || null, socket: ci.socket, size: ci.size, section: ci.section };
    if (out.id !== ci.id) out.baseId = ci.id;
    if (!tpl) return out;
    var base = BZ().tierAttrs(tpl, ci.tier), E = ci.ench && tpl.Enchantments ? tpl.Enchantments[ci.ench] : null, k;
    if (E && E.Attributes) for (k in E.Attributes) base[k] = E.Attributes[k];
    var p = R.price(tpl, ci.tier), attrs = {};
    attrs.SellPrice = (base.SellPrice != null ? base.SellPrice : p.sell) + ((ci.mods && ci.mods.SellPrice) || 0);
    attrs.BuyPrice = (base.BuyPrice != null ? base.BuyPrice : p.buy) + ((ci.mods && ci.mods.BuyPrice) || 0);
    for (k in (ci.mods || {})) if (k !== 'SellPrice' && k !== 'BuyPrice') attrs[k] = (base[k] || 0) + ci.mods[k];
    out.attrs = attrs;
    return out;
  };
  R.allCards = function (run) { var b = run.board; return b.hand.concat(b.stash, b.skills); };
  R.findCard = function (run, uid) {
    var all = R.allCards(run);
    for (var i = 0; i < all.length; i++) if (all[i].uid === uid) return all[i];
    return null;
  };
  R.removeCard = function (run, uid) {
    ['hand', 'stash', 'skills'].forEach(function (s) { run.board[s] = run.board[s].filter(function (c) { return c.uid !== uid; }); });
  };

  // ---------- ô tay mở theo cấp (BazaarBoard.cs:123-129, BazaarDeckTools.cs:1170-1230) ----------
  // Bắt đầu 3,4,5,6; mỗi cấp mở NumCarpetSocketsUnlockPerLevel ô: số ô mở chẵn → trái-1, lẻ → phải+1.
  R.unlockedSockets = function (level) {
    var open = [3, 4, 5, 6], per = R.mode().NumCarpetSocketsUnlockPerLevel || 2, n = (Math.max(1, level) - 1) * per;
    for (var i = 0; i < n && open.length < R.HAND_SLOTS; i++) {
      if (open.length % 2 === 0) open.unshift(open[0] - 1); else open.push(open[open.length - 1] + 1);
    }
    var mask = []; for (var s = 0; s < R.HAND_SLOTS; s++) mask.push(open.indexOf(s) >= 0);
    return mask;
  };
  function occupied(run, section, ignoreUid) {
    var len = section === 'hand' ? R.HAND_SLOTS : section === 'stash' ? T().STASH_SLOTS : T().SKILL_SLOTS, occ = [];
    for (var i = 0; i < len; i++) occ.push(false);
    run.board[section].forEach(function (c) {
      if (c.uid === ignoreUid) return;
      for (var k = 0; k < (section === 'skills' ? 1 : c.size); k++) if (c.socket + k < len) occ[c.socket + k] = true;
    });
    return occ;
  }
  // Đặt được thẻ cỡ `size` vào `section` ở ô `socket`? (bỏ qua chính thẻ ignoreUid khi di chuyển)
  R.canPlace = function (run, section, socket, size, ignoreUid) {
    if (section !== 'hand' && section !== 'stash' && section !== 'skills') return false;
    var occ = occupied(run, section, ignoreUid), n = section === 'skills' ? 1 : size;
    if (socket == null || socket < 0 || socket + n > occ.length || socket !== Math.floor(socket)) return false;
    var lock = section === 'hand' ? R.unlockedSockets(run.level) : null;
    for (var k = 0; k < n; k++) { if (occ[socket + k]) return false; if (lock && !lock[socket + k]) return false; }
    return true;
  };
  R.firstFit = function (run, section, size) {
    var len = section === 'hand' ? R.HAND_SLOTS : section === 'stash' ? T().STASH_SLOTS : T().SKILL_SLOTS;
    for (var s = 0; s < len; s++) if (R.canPlace(run, section, s, size)) return s;
    return -1;
  };
  // Chỗ trống cho thẻ mới: kỹ năng → ô kỹ năng (không trùng id); vật phẩm → tay trước, đầy thì kho (Dealer:1587-1868)
  R.autoPlace = function (run, ci, prefer) {
    var tpl = R.tpl(ci.id);
    if (R.isSkill(tpl)) {
      if (run.board.skills.some(function (c) { return c.id === ci.id; })) return null;
      var k = R.firstFit(run, 'skills', 1);
      return k < 0 ? null : { section: 'skills', socket: k };
    }
    var order = prefer === 'stash' ? ['stash', 'hand'] : ['hand', 'stash'];
    for (var i = 0; i < order.length; i++) {
      var s = R.firstFit(run, order[i], ci.size);
      if (s >= 0) return { section: order[i], socket: s };
    }
    return null;
  };
  R.placeAt = function (run, ci, section, socket) {
    ci.section = section; ci.socket = socket;
    run.board[section].push(ci);
    run.board[section].sort(function (a, b) { return a.socket - b.socket; });
  };
  // Bản sở hữu cùng id + cùng bậc, bậc < Diamond và còn bậc kế → nhập (fuse) thay vì chiếm ô (Dealer:3184-3211)
  R.fuseTarget = function (run, id, tier) {
    var tpl = R.tpl(id);
    if (!tpl || R.isSkill(tpl) || R.tierIndex(tier) >= 3 || !BZ().nextTier(tpl, tier)) return null;
    var all = run.board.hand.concat(run.board.stash);
    for (var i = 0; i < all.length; i++) if (all[i].id === id && all[i].tier === tier) return all[i];
    return null;
  };
  // Nhận một thẻ (mua / được tặng): nhập nếu được, không thì đặt (ô chỉ định hoặc tự tìm). Trả về inst hoặc null nếu hết chỗ.
  R.gainCard = function (ctx, card, section, socket, why, noFuse) {
    var run = ctx.run, f = noFuse ? null : R.fuseTarget(run, card.id, card.tier);
    if (f) {
      R.upgradeInst(ctx, f, why || 'fuse');
      return f;
    }
    var ci = R.newInst(ctx, card.id, card.tier, card.ench);
    if (card.mods) ci.mods = R.clone(card.mods);
    var spot = null;
    if (section && socket != null) {
      if (R.isSkill(R.tpl(ci.id)) !== (section === 'skills')) return null;
      if (section === 'skills' && run.board.skills.some(function (c) { return c.id === ci.id; })) return null;
      if (R.canPlace(run, section, socket, ci.size)) spot = { section: section, socket: socket };
      else return null;
    } else spot = R.autoPlace(run, ci);
    if (!spot) { run.uidN--; return null; }
    R.placeAt(run, ci, spot.section, spot.socket);
    R.emit(ctx, { type: 'gain', uid: ci.uid, id: ci.id, tier: ci.tier, section: spot.section, socket: spot.socket, why: why || null });
    return ci;
  };
  R.canGain = function (run, card) {
    if (R.fuseTarget(run, card.id, card.tier)) return true;
    var tpl = R.tpl(card.id);
    return !!R.autoPlace(run, { id: card.id, size: R.isSkill(tpl) ? 1 : (R.SIZE[tpl.Size] || 1) });
  };
  R.upgradeInst = function (ctx, ci, why) {
    var nt = BZ().nextTier(R.tpl(ci.id), ci.tier);
    if (!nt) return false;
    var from = ci.tier; ci.tier = nt;
    R.emit(ctx, { type: 'upgrade', uid: ci.uid, from: from, to: nt, why: why || null });
    R.log(ctx, { t: 'upgrade', id: ci.id, to: nt });
    if (R.ooc) R.ooc.fire(ctx, 'TTriggerOnCardUpgraded', { uid: ci.uid });
    return true;
  };

  // ---------- XP, cấp, máu (Dealer:5278-5341; level_ups.json khoá theo cấp hiện tại) ----------
  R.hpAtLevel = function (level) {
    var hp = T().START_HP, ups = root.BZ_MODE.levelUps;
    for (var L = 1; L < level; L++) { var row = ups.filter(function (r) { return r.Level === L; })[0]; hp += row ? row.HealthIncrease : 0; }
    return hp;
  };
  // Máu bóng PvP theo ngày (TUNING.GHOST_HP_BY_DAY, clip wUzq6Q4u9Jc); quá bảng thì cộng GHOST_HP_STEP_AFTER mỗi ngày
  R.ghostHp = function (day) {
    var t = T().GHOST_HP_BY_DAY, d = Math.max(1, Math.floor(day));
    return d <= t.length ? t[d - 1] : t[t.length - 1] + (d - t.length) * T().GHOST_HP_STEP_AFTER;
  };
  R.gainXp = function (ctx, n, why) {
    if (!n) return;
    var run = ctx.run, per = R.mode().ExperiencePerLevel;
    run.xp = Math.max(0, run.xp + n);
    R.emit(ctx, { type: 'xp', delta: n, why: why || null });
    while (Math.floor(run.xp / per) + 1 > run.level) {
      var row = root.BZ_MODE.levelUps.filter(function (r) { return r.Level === run.level; })[0];
      var hp = row ? row.HealthIncrease : 0;
      run.healthMax += hp;
      run.level++;
      run.pendingLevelUps = (run.pendingLevelUps || 0) + 1;
      R.emit(ctx, { type: 'levelUp', level: run.level, health: hp, sockets: R.unlockedSockets(run.level) });
      R.log(ctx, { t: 'level', level: run.level });
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
