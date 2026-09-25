// NpcFunction "ArtifactDeal" (khách 6000xx): đàm phán cổ vật bằng lá bài, theo ảnh Steam ss08 "Trade".
// Dữ liệu: ArtifactDeal (khách: PreferCategories, PreferPrefixIds + số lượng Min/Max, DislikePrefixIds, AllowGiveUp, thoại bong bóng),
// ArtifactDealCard (Weight, SuccessPercent, SuccessEffects/FailEffects), ArtifactPrefix (PriceMultiplier, Weight, Prefer/Dislike %),
// Const ArtifactDeal* (số lá trên tay 5, lượt đề xuất 5, đổ lại 2 × rút 3, thẻ ưa thích tối đa 8, tỉ lệ thành công 5–95 %,
// hệ số khớp thẻ ×1,1 (2 khớp) … ×2,3 (≥ 8), EXP = giá × ArtifactDeal<Bậc>ExpMultiplier).
// Luật dựng lại [SUY LUẬN, docs/LOUNGE.md §5]: giá gốc (Coin) = Worth × (1 + Σ PriceMultiplier của tiền tố) / Const.CoinToGoldRate,
// sàn Const.ArtifactPriceMinPercent; mỗi tiền tố cổ vật khớp thẻ ưa thích +PreferPriceBonusPercent, khớp thẻ ghét +DislikePricePenaltyPercent;
// chốt giao dịch trả Coin (Demo 2.0: "Otherworldly Coin" thay cho bán trực tiếp — WEB.md §2), gửi ELuaEvent.ArtifactDeal (giá trị = NpcId khách).
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const U = () => VD.ui;
  const C = (n, d) => VD.combatDB().c(n, d);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const weighted = (items, w) => { let s = 0; for (const x of items) s += Math.max(0, w(x)); let r = Math.random() * s; for (const x of items) { r -= Math.max(0, w(x)); if (r <= 0) return x; } return items[items.length - 1]; };
  const prefixRow = id => (T().ArtifactPrefix || []).find(p => p.Id === id) || null;
  const pname = id => TX('TArtifactPrefix_Name_' + id) || ('#' + id);

  // Tiền tố của một cổ vật (gán lần đầu, lưu trên món hàng): số lượng Const.ArtifactPrefixMin/Max<Bậc>, tiền tố xấu Const.ArtifactPrefixNegativePercent %,
  // rút theo ArtifactPrefix.Weight; SpecifiedArtifactPrefixIds luôn có. [SUY LUẬN]
  function prefixesOf(g) {
    if (g.prefixes) return g.prefixes;
    const r = VD.goods.row(g) || {}, grade = r.Grade || 'Normal';
    const lo = C('ArtifactPrefixMin' + grade, 0), hi = C('ArtifactPrefixMax' + grade, 0);
    const out = (r.SpecifiedArtifactPrefixIds || []).slice();
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    const pos = (T().ArtifactPrefix || []).filter(p => p.Weight > 0 && p.Id < 20000), neg = (T().ArtifactPrefix || []).filter(p => p.Weight > 0 && p.Id >= 20000);
    for (let i = 0; out.length < n + (r.SpecifiedArtifactPrefixIds || []).length && i < 40; i++) {
      const pool = (Math.random() * 100 < C('ArtifactPrefixNegativePercent', 30) ? neg : pos).filter(p => out.indexOf(p.Id) < 0);
      if (!pool.length) break;
      out.push(weighted(pool, p => p.Weight).Id);
    }
    g.prefixes = out;
    P().save();
    return out;
  }
  function basePrice(g) {
    const r = VD.goods.row(g) || {};
    const k = 1 + prefixesOf(g).reduce((a, id) => a + ((prefixRow(id) || {}).PriceMultiplier || 0), 0);
    const worth = (r.Worth || 0) * Math.max(C('ArtifactPriceMinPercent', 30) / 100, k);
    return Math.max(1, Math.round(worth / C('CoinToGoldRate', 48)));
  }
  const MATCH = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'AndAboveEight'];
  function state(deal) {
    const pre = prefixesOf(deal.goods);
    const likeHit = pre.filter(id => deal.like.indexOf(id) >= 0), hateHit = pre.filter(id => deal.hate.indexOf(id) >= 0);
    let pct = deal.bonus;
    for (const id of likeHit) pct += (prefixRow(id) || {}).PreferPriceBonusPercent || 0;
    for (const id of hateHit) pct += (prefixRow(id) || {}).DislikePricePenaltyPercent || 0;
    const mk = likeHit.length >= 2 ? C('ArtifactDealMatchBonusMultiplierOn' + MATCH[Math.min(8, likeHit.length)], 1) : 1;
    const price = Math.max(1, Math.round(deal.base * (1 + pct / 100) * mk));
    const grade = (VD.goods.row(deal.goods) || {}).Grade || 'Normal';
    const exp = Math.round(price * C('CoinToGoldRate', 48) * C('ArtifactDeal' + grade + 'ExpMultiplier', 0.1));
    return { likeHit, hateHit, pct: Math.round((price / deal.base - 1) * 100), price, exp };
  }
  function bubble(deal, kind) {
    const list = deal.row[kind + ':Localized'] || [];
    deal.say = list.length ? TX(pick(list)) : '';
  }
  function drawCards(deal, n) {
    const cards = T().ArtifactDealCard || [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(weighted(cards, c => {
      // Bài có ích trong tình huống hiện tại được ưu tiên (Const.ArtifactDealCardRelevanceWeightPercent). [SUY LUẬN]
      const eff = (c.SuccessEffects || [])[0] || [];
      const rel = (eff[0] === 'RemoveDislikeTags' && state(deal).hateHit.length) || (eff[0] === 'AddSpecificPreferTag' && prefixesOf(deal.goods).indexOf(+eff[1]) >= 0 && deal.like.indexOf(+eff[1]) < 0);
      return c.Weight * (rel ? C('ArtifactDealCardRelevanceWeightPercent', 300) / 100 : 1);
    }));
    return out;
  }
  function newDeal(npcId, goods) {
    const row = (T().ArtifactDeal || []).find(r => r.NpcId === npcId);
    const cnt = (lo, hi) => lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1));
    const takeN = (arr, n) => { const a = arr.slice(), o = []; while (a.length && o.length < n) o.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return o; };
    const deal = { npcId, row, goods, like: takeN(row.PreferPrefixIds || [], cnt(row.PreferPrefixCountMin, row.PreferPrefixCountMax)),
      hate: takeN(row.DislikePrefixIds || [], cnt(row.DislikePrefixCountMin, row.DislikePrefixCountMax)),
      bonus: 0, plays: C('ArtifactDealPlayCardCount', 5), rerolls: C('ArtifactDealRerollCount', 2), hand: [], log: null, done: false };
    deal.base = basePrice(goods);
    deal.hand = drawCards(deal, C('ArtifactDealHandsCount', 5));
    bubble(deal, 'BubbleTextsOnDealStart');
    return deal;
  }
  function effText(e) { let s = TX('EArtifactDealCardEffectType_' + e[0]) || e[0]; return s.replace('{0}', e[0] === 'AddSpecificPreferTag' ? pname(+e[1]) : e[1]); }
  function applyEff(deal, e) {
    const [k, v] = e, n = +v;
    const maxLike = C('ArtifactDealMaxPreferTagCount', 8), pre = prefixesOf(deal.goods);
    const pool = (T().ArtifactPrefix || []).filter(p => p.Weight > 0 && deal.like.indexOf(p.Id) < 0);
    if (k === 'IncreasePricePercent') deal.bonus += n;
    else if (k === 'DecreasePricePercent') deal.bonus -= n;
    else if (k === 'RemoveDislikeTags') { for (let i = 0; i < n && deal.hate.length; i++) { const hit = deal.hate.filter(id => pre.indexOf(id) >= 0); const id = hit.length ? pick(hit) : pick(deal.hate); deal.hate.splice(deal.hate.indexOf(id), 1); } }
    else if (k === 'AddPreferTags' || k === 'RerollPreferTags') {
      for (let i = 0; i < n; i++) {
        if (k === 'RerollPreferTags' && deal.like.length) { const miss = deal.like.filter(id => pre.indexOf(id) < 0); const id = miss.length ? pick(miss) : pick(deal.like); deal.like.splice(deal.like.indexOf(id), 1); }
        if (deal.like.length >= maxLike) break;
        const want = pool.filter(p => pre.indexOf(p.Id) >= 0 && deal.like.indexOf(p.Id) < 0);
        const pc = k === 'AddPreferTags' ? C('ArtifactDealAddPreferMatchPercent', 35) : C('ArtifactDealRerollPreferAddMatchPercent', 35);
        const src = want.length && Math.random() * 100 < pc ? want : pool.filter(p => deal.like.indexOf(p.Id) < 0);
        if (src.length) deal.like.push(weighted(src, p => p.Weight).Id);
      }
    } else if (k === 'AddSpecificPreferTag') { if (deal.like.indexOf(n) < 0 && deal.like.length < maxLike) deal.like.push(n); }
  }
  function playCard(deal, i) {
    if (deal.plays <= 0 || deal.done) return;
    const c = deal.hand[i];
    const eff = (c.SuccessEffects || [])[0] || [];
    if (eff[0] === 'AddSpecificPreferTag' && deal.like.indexOf(+eff[1]) >= 0) return U().toast(TX('ArtifactDealCannotPlayAlreadyHavePreferTag'));
    if (eff[0] === 'RemoveDislikeTags' && !deal.hate.length) return U().toast(TX('ArtifactDealCannotPlayNoDislikeTagsToRemove'));
    const sp = Math.max(C('ArtifactDealMinSuccessPercent', 5), Math.min(C('ArtifactDealMaxSuccessPercent', 95), c.SuccessPercent));
    const ok = Math.random() * 100 < sp;
    for (const e of (ok ? c.SuccessEffects : c.FailEffects) || []) applyEff(deal, e);
    deal.plays--;
    deal.hand.splice(i, 1);
    deal.hand.push(...drawCards(deal, 1));
    deal.log = { ok, card: c };
    bubble(deal, ok ? (eff[0] === 'IncreasePricePercent' ? 'BubbleTextsOnCardSuccessPrice' : eff[0] === 'RemoveDislikeTags' ? 'BubbleTextsOnCardSuccessDislikeTag' : 'BubbleTextsOnCardSuccessPreferTag') : 'BubbleTextsOnCardFail');
    if (deal.plays <= 0) bubble(deal, 'BubbleTextsOnPlayCountExhausted');
  }
  function seal(deal) {
    const s = state(deal), p = P().get();
    const i = p.stash.indexOf(deal.goods);
    if (i >= 0) p.stash.splice(i, 1); else { const j = p.pack.indexOf(deal.goods); if (j >= 0) p.pack.splice(j, 1); }
    P().giveCoin(s.price);
    P().addExp(s.exp);
    deal.done = true;
    bubble(deal, 'BubbleTextsOnResultSuccess');
    p.dealsDone = p.dealsDone || {}; p.dealsDone[deal.npcId] = (p.dealsDone[deal.npcId] || 0) + 1;
    P().save();
    VD.lounge.broadcast(VD.lua.EV.ArtifactDeal, deal.npcId);
    return s;
  }

  // ---------------------------------------------------------------- bảng
  const catOk = (row, g) => { const c = (VD.goods.row(g) || {}).ArtifactCategory; return (row.PreferCategories || []).some(x => x === 'All' || x === c); };
  function artifacts(row) {
    const p = P().get();
    return p.stash.concat(p.pack).filter(g => g.type === 'Equipment' && (VD.goods.row(g) || {}).GoodsType === 'Artifact' && catOk(row, g));
  }
  function build(body, api) {
    const $ = U().$;
    const row = (T().ArtifactDeal || []).find(r => r.NpcId === api.npcId);
    if (!row) { body.innerHTML = '<i class="dim">—</i>'; return; }
    const deal = api.deal;
    api.setTitle(TX('ENpcFunctionType_ArtifactDeal') || 'Đàm phán Cổ vật');
    const wanted = `<div class="want"><h4>${U().esc(TX('UArtifactDealPanel_TItle_Text') || '')}</h4>${(row.PreferCategories || []).slice(0, C('ArtifactDealPreferCategoryCount', 2) + 1).map(c => `<span class="vd-tag gold">${U().esc(TX('EArtifactCategory_' + c) || c)}</span>`).join('')}</div>`;
    if (!deal) {
      // Chọn cổ vật
      body.innerHTML = `<div class="vd-cols vd-deal pickart"><div class="vd-col grow"><h4>${U().esc((TX('ArtifactDealStartDealFormat') || '{0}').replace('{0}', TX('TNpc_Name_' + api.npcId)))}</h4>
        <div class="vd-grid arts"></div><p class="vd-desc dim small">${U().esc(TX('ConfirmArtifactDeal'))}</p></div><div class="vd-col side">${wanted}</div></div>`;
      const g = body.querySelector('.arts');
      const list = artifacts(row);
      if (!list.length) g.innerHTML = `<i class="dim">${U().esc(TX('UInventoryPanel_ArtifactFilterEmpty_Text'))}</i>`;
      for (const a of list) g.appendChild(U().cell(a, { onclick: () => { api.deal = newDeal(api.npcId, a); api.refresh(); } }));
      return;
    }
    const s = state(deal), pre = prefixesOf(deal.goods), r = VD.goods.row(deal.goods) || {};
    const tag = id => `<span class="vd-tag ${deal.like.indexOf(id) >= 0 ? 'like' : deal.hate.indexOf(id) >= 0 ? 'hate' : ''}">${U().esc(pname(id))}</span>`;
    body.innerHTML = `<div class="vd-deal">
      <div class="item vd-col"><div class="cellbox"></div><div class="gr g-${String(r.Grade || 'Normal').toLowerCase()}">${U().esc(TX('EGoodsGradeType_' + r.Grade) || '')}</div>
        <h3>${U().esc(U().gname(deal.goods))}</h3><div class="tags"><span class="vd-tag">${U().esc(TX('EArtifactCategory_' + r.ArtifactCategory) || '')}</span>${pre.map(tag).join('')}</div>
        <dl class="vd-kv"><dt>Ô nhiễm</dt><dd>${r.Corruption || 0}</dd><dt>Giá trị</dt><dd><img class="ci" src="art/ui/icon_common/Coin.webp">${U().fmt(deal.base)} (<img class="ci" src="art/ui/icon_common/Gold.webp">${U().fmt(r.Worth)})</dd></dl>
        <p class="vd-desc small">${U().rich(VD.goods.desc(deal.goods))}</p></div>
      <div class="mid"><div class="offer vd-col"><dl class="vd-kv"><dt>EXP</dt><dd>${U().fmt(s.exp)}</dd><dt>Giá đề nghị</dt><dd class="pr"><img class="ci" src="art/ui/icon_common/Coin.webp">${U().fmt(s.price)} <span class="${s.pct >= 0 ? 'up' : 'down'}">${s.pct >= 0 ? '▲' : '▼'}${Math.abs(s.pct)}%</span></dd></dl></div>
        <div class="plays">${U().esc((TX('ArtifactDealRemainPlayCountFormat') || '{0}/{1}').replace('{0}', deal.plays).replace('{1}', C('ArtifactDealPlayCardCount', 5)))}</div>
        <div class="talk"><div class="bub"></div><div class="res"></div></div></div>
      <div class="side vd-col">${wanted}<h4>▲ ${U().esc(TX('Like') || 'Thích')}</h4><div class="tags">${deal.like.map(id => `<span class="vd-tag ${pre.indexOf(id) >= 0 ? 'like' : ''}">${U().esc(pname(id))}</span>`).join('') || '—'}</div>
        <h4>▼ ${U().esc(TX('Dislike') || 'Không thích')}</h4><div class="tags">${deal.hate.map(id => `<span class="vd-tag ${pre.indexOf(id) >= 0 ? 'hate' : ''}">${U().esc(pname(id))}</span>`).join('') || '—'}</div>
        <div class="btns col"><button class="vd-btn warn give">${U().esc(TX('ArtifactDealGiveUpAskMassage') || 'Từ bỏ')}</button><button class="vd-btn main sealb">Chốt giao dịch</button></div></div>
      <div class="hand"><button class="vd-btn reroll">↻ ${U().esc((TX('ArtifactDealRerollFormat') || '{0}/{1}').replace('{0}', deal.rerolls).replace('{1}', C('ArtifactDealRerollCount', 2)))}</button></div></div>`;
    body.querySelector('.cellbox').appendChild(U().cell(deal.goods));
    body.querySelector('.bub').textContent = deal.say || '';
    if (deal.log) body.querySelector('.res').innerHTML = `<b class="${deal.log.ok ? 'ok' : 'bad'}">${U().esc(TX(deal.log.ok ? 'ArtifactDealCardPlaySuccess' : 'ArtifactDealCardPlayFailure'))}</b> <span>${U().esc(TX('TArtifactDealCard_Name_' + deal.log.card.Id))}</span>`;
    const hand = body.querySelector('.hand');
    deal.hand.forEach((c, i) => {
      const b = $('button', 'card r-' + String(c.RarityType).toLowerCase(), hand);
      b.dataset.i = i;
      b.innerHTML = `<small>Tỉ lệ ${Math.max(C('ArtifactDealMinSuccessPercent', 5), Math.min(C('ArtifactDealMaxSuccessPercent', 95), c.SuccessPercent))}%</small><b>${U().esc(TX('TArtifactDealCard_Name_' + c.Id))}</b>
        <span class="ok">${(c.SuccessEffects || []).map(effText).map(U().esc).join('<br>')}</span><span class="bad">${(c.FailEffects || []).map(effText).map(U().esc).join('<br>')}</span>`;
      b.disabled = deal.plays <= 0 || deal.done;
      b.onclick = () => { playCard(deal, i); api.refresh(); };
    });
    const rr = body.querySelector('.reroll');
    rr.disabled = deal.rerolls <= 0 || deal.done;
    rr.onclick = () => { if (deal.rerolls <= 0) return U().toast(TX('ArtifactDealNoMoreRerollCount')); deal.rerolls--; deal.hand.splice(0, Math.min(deal.hand.length, C('ArtifactDealRerollDrawCards', 3))); deal.hand.unshift(...drawCards(deal, C('ArtifactDealHandsCount', 5) - deal.hand.length)); bubble(deal, 'BubbleTextsOnReroll'); api.refresh(); };
    const give = body.querySelector('.give');
    give.disabled = !row.AllowGiveUp || deal.done;
    give.onclick = () => { bubble(deal, 'BubbleTextsOnDealGiveUp'); U().toast(TX('ArtifactDealGiveUpNoticeFail')); api.deal = null; api.close(); };
    const sb = body.querySelector('.sealb');
    sb.disabled = deal.done;
    sb.onclick = () => { const r2 = seal(deal); U().toast(`${U().gname(deal.goods)} → ${U().fmt(r2.price)} ${TX('EGoodsType_Coin')} · EXP +${U().fmt(r2.exp)}`); api.refresh(); setTimeout(() => api.close(), 900); };
  }
  VD.ui.panels.deal = { id: 'deal', title: TX('ENpcFunctionType_ArtifactDeal'), cls: 'p-deal', build };
  VD.npc.register('ArtifactDeal', { open: npcId => VD.ui.open(Object.assign({}, VD.ui.panels.deal, { build: (b, a) => { a.npcId = npcId; build(b, a); } })) });
  VD.uiDeal = { prefixesOf, basePrice, newDeal, playCard, seal, state };
})(window.VD = window.VD || {});
