/*
 * Màn hình bến: khi DR.mode thành 'dock' kèm info.dockId, hiện tên bến và các điểm đến info.destinations
 * ({ id, cls, titleKey, speaker }). Cài MarketDestination (bán cá), ShipyardDestination (thợ đóng tàu: mua đồ, sửa thân),
 * StorageDestination (mở DRCargo INVENTORY + STORAGE), RestDestination (ngủ tới 06:00), CharacterDestination, Rời bến.
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  if (!document.querySelector('link[href*="ui.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../css/ui.css', (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }
  const G = root.DRGrid;
  const FRESH_VN = { fresh: 'Tươi', stale: 'Hơi ươn', rotting: 'Ươn' };
  const SHOP_TABS = [
    ['Shipwright_Rods', 'Cần câu'], ['Shipwright_Engines', 'Động cơ'], ['Shipwright_Lights', 'Đèn'], ['Shipwright_Nets', 'Lưới'], ['repair', 'Sửa thân tàu']
  ];
  const ICON = {
    MarketDestination: 'FishIcon', ShipyardDestination: 'RepairIcon', StorageDestination: 'StorageIcon',
    RestDestination: 'SleepIcon', UndockDestination: 'UndockIcon'
  };
  // Biến CSS giải url() theo tệp css, không theo trang: đưa đường dẫn tuyệt đối.
  const maskUrl = n => 'url(' + new URL('art/ui/sprites/' + n + '.webp', document.baseURI).href + ')';
  const money = v => '$' + Number(v).toFixed(2);

  let host = null, D = null;
  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* audio optional */ } };
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const isFish = def => !!(G.subOf(def) & G.SUB.FISH);
  const freshOf = inst => DRRules.freshLabel(DR_CONFIG, inst.fresh == null ? DR_CONFIG.maxFreshness : inst.fresh);
  const sizeCm = (def, inst) => def.minSizeCentimeters != null && inst.size != null
    ? Math.round(def.minSizeCentimeters + (def.maxSizeCentimeters - def.minSizeCentimeters) * inst.size) : null;
  const str = k => (root.DR_STR && DR_STR[k]) || null;

  function dockName(dockId) {
    const d = DR_WORLD.DockData[dockId] || {};
    return str(d.dockNameKey) || str(dockId) || d.dockNameKey || dockId;
  }

  function destTitle(dest) {
    if (dest.cls === 'MarketDestination') return /fishmonger/.test(dest.id) ? 'Người buôn cá' : 'Chợ';
    if (dest.cls === 'ShipyardDestination') return 'Thợ đóng tàu';
    if (dest.cls === 'StorageDestination') return 'Kho của tôi';
    if (dest.cls === 'RestDestination') return 'Nghỉ ngơi';
    if (dest.cls === 'UndockDestination') return 'Rời bến';
    if (dest.cls === 'CharacterDestination') {
      const sd = DR_WORLD.SpeakerData[dest.speaker];
      return (sd && str(sd.speakerNameKey)) || dest.speaker || 'Nhân vật';
    }
    return str(dest.titleKey) || dest.id;
  }

  // ---------------------------------------------------------------- screen frame
  function ensureDom() {
    if (host) return;
    host = el('div', 'dr-screen dr-ui', document.body); host.id = 'dr-dock';
  }

  function show(info) {
    ensureDom();
    const dests = (info.destinations || []).slice();
    D = { dockId: info.dockId, dests, sel: null, tab: null };
    if (!dests.some(d => d.cls === 'UndockDestination')) D.hasUndockBtn = true;
    const first = dests.find(d => d.cls !== 'UndockDestination');
    D.sel = first ? first.id : null;
    host.classList.add('on');
    DR.save();
    // Nhạc bến: khoá music.dock.<tên> trùng id bến; không có thì giữ nhạc hiện tại.
    const tail = String(info.dockId).replace(/^dock\./, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = Object.keys(root.DR_AUDIO || {}).find(k => k.startsWith('music.dock.') && k.slice(11).toLowerCase() === tail);
    if (key) { try { DRAudio.music(key); } catch (e) { /* audio optional */ } }
    render();
  }
  function hide() {
    if (!D) return;
    D = null;
    host.classList.remove('on');
    if (root.DRCargo && DRCargo.isOpen()) DRCargo.close();
  }

  function render() {
    if (!D) return;
    host.innerHTML = '';
    const panel = el('div', 'dr-panel', host), wrap = el('div', 'dk-wrap', panel);
    const head = el('div', 'dk-head', wrap);
    el('h2', '', head, dockName(D.dockId)); D.nameEl = head.firstChild;
    el('div', 'sp', head);
    const dd = DR_WORLD.DockData[D.dockId] || {};
    if (dd.dockProgressType === 'GM_REPAYMENTS') {
      const debt = DR.s.vars['gm-debt'] || 0, paid = DR.s.vars['gm-repayments'] || 0, left = Math.max(0, debt - paid);
      const box = el('div', 'dk-debt', head, left > 0 ? 'Nợ tàu còn lại: ' + money(left) + ' / ' + money(debt) : 'Đã trả hết nợ tàu');
      box.dataset.debtLeft = left;
      el('div', 'bar', box).appendChild(Object.assign(el('i'), { style: 'width:' + Math.min(100, paid / (debt || 1) * 100) + '%' }));
    }
    el('div', 'dr-money dk-funds', head, money(DR.s.funds)).style.fontSize = '24px';

    const body = el('div', 'dk-body', wrap);
    const nav = el('div', 'dk-nav', body);
    // Danh sách cuộn riêng, nút Rời bến nằm ngoài nó: bến đông nhân vật (GM có 9 điểm đến) từng đẩy nút ra khỏi màn hình.
    const list = el('div', 'dk-list', nav);
    for (const d of D.dests) {
      if (d.cls === 'UndockDestination') continue;
      const b = el('button', 'dr-btn' + (d.id === D.sel ? ' sel' : ''), list);
      b.dataset.dest = d.id;
      if (d.cls === 'CharacterDestination') {
        const sd = DR_WORLD.SpeakerData[d.speaker];
        const ic = el('span', 'dk-ic face', b);
        if (sd && sd.smallPortraitSprite) ic.style.backgroundImage = 'url(' + sd.smallPortraitSprite + ')';
      } else {
        const ic = el('span', 'dk-ic mask', b);
        ic.style.setProperty('--m', maskUrl(ICON[d.cls] || 'MerchantIcon'));
      }
      el('span', '', b, destTitle(d));
      b.onclick = () => { play('ui.button.select'); D.sel = d.id; D.tab = null; render(); if (d.cls === 'StorageDestination') openStorage(); };
    }
    const u = el('button', 'dr-btn gold', nav); u.dataset.act = 'undock';
    const ic = el('span', 'dk-ic mask', u); ic.style.setProperty('--m', maskUrl('UndockIcon')); ic.style.backgroundColor = '#1b1410';
    el('span', '', u, 'Rời bến');
    u.onclick = () => { play('ui.button.back'); DR.setMode('sail'); };

    D.main = el('div', 'dk-main', body);
    renderMain();
  }

  function renderMain() {
    const m = D.main, dest = D.dests.find(d => d.id === D.sel);
    m.innerHTML = '';
    if (!dest) { el('div', 'dk-empty', m, 'Bến này chưa có điểm đến nào.'); return; }
    const fn = { MarketDestination: market, ShipyardDestination: shipyard, StorageDestination: storage, RestDestination: rest, CharacterDestination: character }[dest.cls];
    if (fn) fn(m, dest); else el('div', 'dk-empty', m, 'Điểm đến "' + destTitle(dest) + '" chưa có trong bản này.');
  }
  // Tiền / kho đổi thì vẽ lại phần giữa mà không nhảy tab.
  function refresh() {
    if (!D) return;
    const y = D.main && D.main.scrollTop;
    render();
    if (D.main) D.main.scrollTop = y;
  }

  // ---------------------------------------------------------------- market
  const repaymentLeft = () => Math.max(0, (DR.s.vars['gm-debt'] || 0) - (DR.s.vars['gm-repayments'] || 0));
  const repayShare = price => Math.min(repaymentLeft(), Math.round(price * DR_CONFIG.greaterMarrowDebtRepaymentProportion * 100) / 100);
  const priceOf = inst => DRRules.sellPrice(DR_CONFIG, DR.item(inst.id), inst, 1, 1);

  function sellItems(insts) {
    const inv = DR.grid('INVENTORY');
    let gross = 0, repaid = 0;
    for (const inst of insts) {
      const p = priceOf(inst), r = repayShare(p);
      if (!G.remove(inv, inst)) continue;
      DR.s.vars['gm-repayments'] = Math.round(((DR.s.vars['gm-repayments'] || 0) + r) * 100) / 100;
      DR.addFunds(Math.round((p - r) * 100) / 100);
      gross += p; repaid += r;
    }
    if (!gross && !insts.length) return;
    play('ui.sell');
    toast('Đã bán ' + insts.length + ' món: ' + money(gross) + (repaid ? ' (trả nợ ' + money(repaid) + ')' : ''));
    DR.save();
    refresh();
  }

  function market(m, dest) {
    // id thật trong scene là destination.<bến>-fishmonger (vd destination.gm-fishmonger)
    const fishMarket = /fishmonger/.test(dest.id);
    const inv = DR.grid('INVENTORY');
    const rows = inv.items.filter(inst => {
      const def = DR.item(inst.id);
      if (def.canBeSoldByPlayer === false) return false;
      return fishMarket ? isFish(def) : !isFish(def);
    }).map(inst => ({ inst, def: DR.item(inst.id), price: priceOf(inst) })).sort((a, b) => b.price - a.price);
    el('h3', '', m, destTitle(dest)).appendChild(el('small', '', null, fishMarket ? 'Mua cá tươi, trả theo cỡ và độ tươi' : 'Mua đồ nhặt được'));
    if (!rows.length) { el('div', 'dk-empty', m, fishMarket ? 'Trong khoang không có con cá nào để bán.' : 'Không có món nào ông này muốn mua.'); return; }
    for (const r of rows) {
      const row = el('div', 'dk-row', m); row.dataset.uid = r.inst.uid;
      const im = el('img', 'thumb', row); im.src = r.def.sprite;
      const nm = el('div', 'nm', row);
      el('b', '', nm, r.def.name);
      const cm = sizeCm(r.def, r.inst);
      el('span', '', nm, isFish(r.def) ? (cm != null ? cm + ' cm · ' : '') + (r.inst.infected ? 'Nhiễm bệnh' : FRESH_VN[freshOf(r.inst)]) : r.def.cls.replace('ItemData', ''));
      el('div', 'pr', row, money(r.price));
      const b = el('button', 'dr-btn gold', row, 'Bán'); b.dataset.act = 'sell';
      b.onclick = () => sellItems([r.inst]);
    }
    const bulk = rows.filter(r => r.def.canBeSoldInBulkAction !== false);
    const bar = el('div', 'dk-bulk', m);
    const total = bulk.reduce((s, r) => s + r.price, 0), debtNow = repaymentLeft();
    const note = el('div', 'note', bar, debtNow > 0
      ? 'Một phần mỗi lần bán (' + Math.round(DR_CONFIG.greaterMarrowDebtRepaymentProportion * 100) + '%) tự trả khoản nợ tàu, còn ' + money(debtNow) + '.'
      : 'Nợ tàu đã trả xong, tiền bán về hết túi bạn.');
    el('div', 'dr-money', bar, money(total)).style.fontSize = '20px';
    const all = el('button', 'dr-btn gold', bar, 'Bán tất cả'); all.dataset.act = 'sell-all';
    all.disabled = !bulk.length;
    all.onclick = () => sellItems(bulk.map(r => r.inst));
  }

  // ---------------------------------------------------------------- shipyard
  function shopStock(key) {
    const sh = DR_WORLD.ShopData[key];
    if (!sh) return [];
    const day = Math.floor(DR.s.time), v = DR.s.vars;
    if (!v.shopTaken || v.shopTaken.day !== day) v.shopTaken = { day };      // ShopRestocker: nhập hàng lại mỗi ngày
    const taken = v.shopTaken[key] || {}, out = [];
    const add = e => {
      const def = DR_ITEMS[e.itemData];
      if (!def || e.chance <= 0) return;
      if (!(def.researchPointsRequired === 0 || def.buyableWithoutResearch)) return;
      const left = e.count - (taken[e.itemData] || 0);
      if (!out.some(o => o.def === def)) out.push({ def, left, key });
    };
    (sh.alwaysInStock || []).forEach(add);
    for (const p of sh.phaseLinkedShopData || []) if ((DR.s.worldPhase || 0) >= p.phase) (p.itemData || []).forEach(add);
    return out;
  }

  function buy(row) {
    const def = row.def, price = DRRules.buyPrice(def, 1), inv = DR.grid('INVENTORY');
    if (DR.s.funds < price) { play('ui.error'); toast('Không đủ tiền'); return; }
    if (!G.findSpot(inv, def, 0, false)) { play('ui.error'); toast('Khoang không còn chỗ hợp để đặt món này'); return; }
    DR.addFunds(-price);
    DR.give(def.id);
    const t = DR.s.vars.shopTaken;
    t[row.key] = t[row.key] || {};
    t[row.key][def.id] = (t[row.key][def.id] || 0) + 1;
    play('ui.buy');
    toast('Đã mua ' + def.name + ' (' + money(price) + ')');
    DR.save();
    refresh();
  }

  function shipyard(m, dest) {
    const tab = D.tab || SHOP_TABS[0][0];
    el('h3', '', m, destTitle(dest));
    const tabs = el('div', 'dk-tabs', m);
    for (const [k, label] of SHOP_TABS) {
      const b = el('button', 'dr-btn' + (k === tab ? ' sel' : ''), tabs, label); b.dataset.tab = k;
      b.onclick = () => { D.tab = k; renderMain(); };
    }
    if (tab === 'repair') return repair(m);
    const stock = shopStock(tab);
    if (!stock.length) { el('div', 'dk-empty', m, 'Hôm nay không có hàng loại này.'); return; }
    for (const r of stock) {
      const price = DRRules.buyPrice(r.def, 1), row = el('div', 'dk-row', m); row.dataset.item = r.def.id;
      const im = el('img', 'thumb', row); im.src = r.def.sprite;
      const nm = el('div', 'nm', row);
      el('b', '', nm, r.def.name);
      el('span', 'd', nm, r.def.desc || '');
      el('span', '', nm, 'Chiếm ' + r.def.w + '×' + r.def.h + ' ô · còn ' + Math.max(0, r.left));
      el('div', 'pr', row, money(price));
      const b = el('button', 'dr-btn gold', row, 'Mua'); b.dataset.act = 'buy';
      b.disabled = r.left <= 0 || DR.s.funds < price;
      b.onclick = () => buy(r);
    }
  }

  function repair(m) {
    const inv = DR.grid('INVENTORY'), n = inv.damage.length, each = DR_CONFIG.hullRepairCostPerSquare;
    if (!n) { el('div', 'dk-empty', m, 'Thân tàu còn nguyên vẹn, không có ô nào cần sửa.'); return; }
    const row = el('div', 'dk-row', m);
    const nm = el('div', 'nm', row);
    el('b', '', nm, 'Ô thân tàu bị hỏng: ' + n);
    el('span', '', nm, money(each) + ' mỗi ô');
    const one = el('button', 'dr-btn gold', row, 'Sửa 1 ô'), all = el('button', 'dr-btn gold', row, 'Sửa hết ' + money(n * each));
    one.dataset.act = 'repair-one'; all.dataset.act = 'repair-all';
    const doRepair = cnt => {
      const cost = cnt * each;
      if (DR.s.funds < cost) { play('ui.error'); toast('Không đủ tiền sửa'); return; }
      DR.addFunds(-cost);
      inv.damage.splice(inv.damage.length - cnt, cnt);
      play('ui.upgrade.complete');
      toast('Đã sửa ' + cnt + ' ô thân tàu (' + money(cost) + ')');
      DR.save();
      refresh();
    };
    one.disabled = DR.s.funds < each; all.disabled = DR.s.funds < n * each;
    one.onclick = () => doRepair(1); all.onclick = () => doRepair(n);
  }

  // ---------------------------------------------------------------- storage / rest / character
  function openStorage() {
    if (root.DRCargo) DRCargo.open({ keys: ['INVENTORY', 'STORAGE'], title: 'Kho của tôi', onClose: () => { if (D) refresh(); } });
  }
  function storage(m, dest) {
    el('h3', '', m, destTitle(dest));
    el('div', 'dk-empty', m, 'Cất đồ từ khoang thuyền vào kho, hoặc lấy ra. Đồ trong kho không bị hỏng và không ươn thêm theo luật khoang.');
    const b = el('button', 'dr-btn gold', m, 'Mở kho'); b.dataset.act = 'open-storage';
    b.onclick = openStorage;
  }

  function rest(m, dest) {
    const hrs = DRRules.hoursToMorning(DR.s.time), f = DR.s.time - Math.floor(DR.s.time);
    const hh = Math.floor(f * 24), mm = Math.floor((f * 24 - hh) * 60), p = n => (n < 10 ? '0' : '') + n;
    el('h3', '', m, destTitle(dest));
    el('div', 'dk-empty', m, 'Bây giờ là ' + p(hh) + ':' + p(mm) + '. Ngủ tới 06:00 sẽ mất khoảng ' + Math.round(hrs * 10) / 10 + ' giờ, đầu óc bớt hoảng loạn.');
    const b = el('button', 'dr-btn gold', m, 'Ngủ đến 06:00'); b.dataset.act = 'sleep';
    b.onclick = () => {
      DR.emit('passTime', DRRules.hoursToMorning(DR.s.time), 'SLEEP');   // engine thực hiện việc trôi thời gian
      toast('Bạn chìm vào giấc ngủ…');
      setTimeout(refresh, 400);
    };
  }

  function firstLine(sd, speakerId) {
    const dlg = root.DR_STR_DIALOGUE || {};
    const key = sd && sd.speakerNameKey ? sd.speakerNameKey.replace(/^character\./, '').replace(/\.name$/, '').replace(/-/g, '_').toUpperCase() + '_NAME_KEY'
      : String(speakerId).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase() + '_NAME_KEY';
    const pre = key + ': ';
    for (const k in dlg) {
      const s = dlg[k];
      if (typeof s === 'string' && s.startsWith(pre) && s.length > pre.length + 12) {
        return s.slice(pre.length).replace(/\[\/?[A-Za-z0-9]+\]/g, '').replace(/<[^>]+>/g, '');
      }
    }
    return null;
  }
  function character(m, dest) {
    const sd = DR_WORLD.SpeakerData[dest.speaker];
    el('h3', '', m, destTitle(dest));
    const box = el('div', 'dk-char', m);
    if (sd && sd.smallPortraitSprite) el('img', '', box).src = sd.smallPortraitSprite;
    const col = el('div', '', box);
    const line = firstLine(sd, dest.speaker);
    el('blockquote', '', col, line || 'Chào người lạ. Biển đêm nay lặng quá, nhớ về bến trước khi sương xuống.');
    el('div', 'ph', col, line ? 'Câu đầu tiên của nhân vật này trong dữ liệu lời thoại gốc (tiếng Anh, chưa có cây hội thoại).'
      : '(Lời thoại giữ chỗ, chưa có hội thoại gốc cho nhân vật này.)');
  }

  // ---------------------------------------------------------------- wiring
  function wire() {
    if (!root.DR || !DR.on) return;
    DR.on('mode', (mode, info) => {
      if (mode === 'dock' && info && info.dockId) show(info);
      else if (mode === 'dock' && D) host.classList.add('on');
      else if (mode !== 'cargo') hide();
    });
    DR.on('funds', () => { if (D) refresh(); });
  }
  wire();

  root.DRDock = { show, hide, isOpen: () => !!D, _debug: () => D && { dockId: D.dockId, sel: D.sel, tab: D.tab } };
})(window);
