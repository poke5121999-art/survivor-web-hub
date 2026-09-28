/*
 * Chợ trời: đấu giá Pokémon giữa thành viên hub. Bảng và hàm ở db/pokeone-market.sql, giao thức ở NET.md §Chợ trời.
 *
 *   P1.market.open()                    cửa sổ chợ (HUD "Chợ trời")
 *   P1.market.listMon(mon, from, index) đăng bán từ menu đội/PC ('party'|'box', vị trí trong mảng)
 *
 * Tiền và Pokémon đang "treo" (đang gửi lên máy chủ) nằm trong hộp thư đi P1.state.market.outbox, lưu cùng
 * bản lưu. Mỗi lệnh mang nonce; gửi lại cùng nonce là vô hại, nên tắt trình duyệt giữa chừng hay mất mạng
 * đều hội tụ: lần mở chợ sau gửi lại, máy chủ trả kết quả cũ hoặc từ chối → trả lại đồ.
 */
(function (P1) {
  'use strict';

  const CLAIM_EVERY_MS = 30000, HOURS = [1, 6, 24], PRICE_MAX = 9999999;
  const ERR = {
    not_signed_in: 'Cần đăng nhập hub.', bad_duration: 'Thời gian không hợp lệ.', bad_price: 'Giá không hợp lệ (giá mua đứt phải cao hơn giá khởi điểm).',
    bad_name: 'Tên huấn luyện viên không hợp lệ.', bad_mon: 'Pokémon này không đăng được.', too_many: 'Bạn đã có 10 phiên đang mở.',
    no_listing: 'Phiên không còn.', own_listing: 'Không trả giá phiên của chính mình được.', ended: 'Phiên đã kết thúc.',
    bid_low: 'Giá quá thấp.', has_bids: 'Đã có người trả giá, không huỷ được.', not_yours: 'Không phải phiên của bạn.', bad_token: 'Lỗi nhận đồ.',
  };

  const net = () => P1.net;
  const S = () => P1.social;
  const esc = s => P1.net.esc(s);

  /* ---------------------------------------------------------------- phần thuần (bộ kiểm gọi thẳng) */

  // Giá tối thiểu cho lượt kế: như p1_bid trên máy chủ.
  function minBid(l) {
    return l.top_bid == null ? l.start_price : Math.max(l.start_price, l.top_bid + Math.max(1, Math.ceil(l.top_bid * 0.05)));
  }
  function priceOf(l) { return l.top_bid == null ? l.start_price : l.top_bid; }

  // Kết quả một lệnh gửi lên: 'ok' | 'reject' (chắc chắn không ghi) | 'unknown' (có thể đã ghi → giữ, gửi lại sau).
  function outcome(r) {
    if (r.ok) return 'ok';
    if (r.noAccount || net().notInstalled(r)) return 'reject';
    if (r.unreachable || !r.status || r.status >= 500 || r.status === 408 || r.status === 429) return 'unknown';
    return 'reject';
  }
  function errText(r) {
    if (r.noAccount) return 'Cần đăng nhập hub.';
    if (net().notInstalled(r)) return notInstalledText;
    const m = /^p1:(\w+)(?: (\d+))?/.exec(r.message || '');
    if (m && m[1] === 'bid_low' && m[2]) return 'Giá tối thiểu hiện tại là ₽' + m[2] + '.';
    return (m && ERR[m[1]]) || 'Máy chủ từ chối (' + (r.status || '?') + ').';
  }
  const notInstalledText = 'Chợ chưa mở: chủ hub cần chạy db/pokeone-market.sql.';

  function sortListings(list, by, query) {
    const q = String(query || '').trim().toLowerCase();
    const name = l => (l.card.nick + ' ' + P1.chat.speciesName(l.card.dex)).toLowerCase();
    const out = list.filter(l => !q || name(l).includes(q) || String(l.card.dex) === q);
    const cmp = {
      ending: (a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at),
      cheap: (a, b) => priceOf(a) - priceOf(b),
      pricey: (a, b) => priceOf(b) - priceOf(a),
      newest: (a, b) => b.id - a.id,
    }[by] || ((a, b) => 0);
    return out.sort(cmp);
  }

  // Một dòng p1_listings từ máy chủ → mô hình đã kiểm (thẻ Pokémon đi qua parseCard).
  function parseListing(row) {
    const card = row && net().parseCard(row.card);
    if (!card || !(row.id > 0)) return null;
    return {
      id: row.id, seller: String(row.seller || ''), seller_name: net().clip(row.seller_name, 24), card,
      start_price: row.start_price | 0, buyout: row.buyout == null ? null : row.buyout | 0,
      ends_at: String(row.ends_at || ''), top_bid: row.top_bid == null ? null : row.top_bid | 0,
      top_bidder: row.top_bidder || null, top_bidder_name: net().clip(row.top_bidder_name, 24), cancelled: !!row.cancelled,
    };
  }
  function isOpen(l, now) { return !l.cancelled && Date.parse(l.ends_at) > (now || Date.now()); }

  /* ---------------------------------------------------------------- hộp thư đi + nhận đồ */

  function mstate() {
    const s = P1.state;
    s.market = s.market || {};
    s.market.outbox = s.market.outbox || [];
    return s.market;
  }
  function uid() { const s = window.HubSession && window.HubSession.get(); return s && s.kind === 'member' ? s.userId : ''; }

  function send(entry) {
    if (entry.op === 'list') return net().rpc('p1_list', entry.args);
    return net().rpc('p1_bid', entry.args);
  }

  // Áp kết quả một lệnh lên bản lưu. Trả chuỗi thông báo (hoặc '' khi còn treo).
  function settle(entry, r) {
    const ms = mstate(), kind = outcome(r);
    if (kind === 'unknown') return '';
    ms.outbox.splice(ms.outbox.indexOf(entry), 1);
    let msg;
    if (entry.op === 'list') {
      if (kind === 'ok') msg = 'Đã đăng ' + P1.chat.monLabel(net().cardOf(entry.mon)) + ' lên chợ.';
      else { net().giveMon(entry.mon); msg = errText(r) + ' ' + P1.chat.monLabel(net().cardOf(entry.mon)) + ' đã về lại.'; }
    } else if (kind === 'ok') {
      const paid = Math.min(entry.money, (r.data && r.data.amount) | 0 || entry.money);
      P1.state.money += entry.money - paid;
      msg = (r.data && r.data.ended ? 'Đã mua đứt với ₽' : 'Đã trả giá ₽') + paid + '.';
    } else {
      P1.state.money += entry.money;
      msg = errText(r) + ' Hoàn ₽' + entry.money + '.';
    }
    P1.save();
    if (kind === 'ok') net().channel('global').send('market', { listing: (r.data && (r.data.listing || r.data.id)) | 0 });
    return msg;
  }

  function submit(entry) {
    mstate().outbox.push(entry);
    P1.save();
    return send(entry).then(r => {
      if (net().notInstalled(r)) gate = 'notInstalled';
      const msg = settle(entry, r);
      return { ok: outcome(r) === 'ok', msg: msg || 'Mất mạng: lệnh được giữ lại và sẽ gửi lại khi mở chợ.', r };
    });
  }

  let flushing = null;
  function flushOutbox() {
    if (flushing) return flushing;
    const list = mstate().outbox.slice();
    flushing = list.reduce((p, e) => p.then(() => send(e).then(r => { const m = settle(e, r); if (m) note(m); })), Promise.resolve())
      .then(() => { flushing = null; }, () => { flushing = null; });
    return flushing;
  }

  // p1_claim lặp lại được: token lưu vào bản lưu TRƯỚC khi gọi. Mất phản hồi → lần sau gửi lại cùng token,
  // máy chủ trả lại đúng những món đã đánh dấu cho token đó.
  let claiming = null;
  function claim() {
    if (claiming) return claiming;
    const ms = mstate();
    if (!ms.claim) { ms.claim = net().uuid(); P1.save(); }
    const token = ms.claim;
    claiming = net().rpc('p1_claim', { p_token: token }).then(r => {
      claiming = null;
      if (!r.ok) return { ok: false, r, items: [] };
      // Áp đồ, xoá token và lưu trong cùng một nhịp đồng bộ: không có lúc nào đã áp mà token còn treo.
      const got = applyClaim(Array.isArray(r.data) ? r.data : []);
      ms.claim = null;
      P1.save();
      return { ok: true, items: got };
    }, () => { claiming = null; return { ok: false, items: [] }; });
    return claiming;
  }

  function applyClaim(items) {
    const got = [];
    items.forEach(it => {
      if (!it || typeof it !== 'object') return;
      if (it.kind === 'money') {
        const amt = Math.max(0, Math.min(PRICE_MAX, it.amount | 0));
        P1.state.money += amt;
        got.push((it.reason === 'sold' ? 'Bán được ₽' : 'Hoàn ₽') + amt);
      } else if (it.kind === 'mon') {
        const mon = net().parseMon(it.mon);
        if (!mon) return;
        const where = net().giveMon(mon);
        if (P1.caught) P1.caught(mon.dex);
        got.push((it.reason === 'won' ? 'Nhận ' : 'Trả lại ') + P1.chat.monLabel(net().cardOf(mon)) + (where === 'box' ? ' (PC)' : ''));
      }
    });
    if (got.length) note('Chợ trời: ' + got.join(', ') + '.');
    return got;
  }

  function note(msg) {
    S().toast(msg);
    if (P1.chat && P1.chat.sys) P1.chat.sys(msg);
  }

  /* ---------------------------------------------------------------- cửa sổ chợ */

  let win = null, tab = 'open', sortBy = 'ending', query = '', listings = [], mine = [], myBids = [], gate = '', timer = 0, refreshT = 0;

  function gateOf() {
    if (net().status === 'offline') return 'offline';
    if (!net().me.member) return 'noAccount';
    return gate === 'notInstalled' ? 'notInstalled' : '';
  }

  function open() {
    if (win) { render(); return win; }
    win = S().popup({ name: 'market', title: 'Chợ trời', w: 600, cls: 'p1s-market', onClose: () => { win = null; clearInterval(timer); } });
    render();
    if (!gateOf()) {
      load();
      tick();
      timer = setInterval(tick, CLAIM_EVERY_MS);
    }
    const ch = net().status === 'offline' ? null : net().channel('global');
    if (ch && !open.hooked) { open.hooked = true; ch.on('market', () => { if (win) { clearTimeout(refreshT); refreshT = setTimeout(load, 500); } }); }
    return win;
  }

  function tick() { flushOutbox().then(claim).then(() => { if (win) render(); }); }

  function load() {
    const now = new Date().toISOString();
    const cols = 'id,seller,seller_name,card,start_price,buyout,ends_at,top_bid,top_bidder,top_bidder_name,cancelled';
    const me = uid();
    return Promise.all([
      net().rest('/p1_listings?select=' + cols + '&cancelled=is.false&ends_at=gt.' + encodeURIComponent(now) + '&order=ends_at.asc&limit=100', { member: true }),
      net().rest('/p1_listings?select=' + cols + '&seller=eq.' + encodeURIComponent(me) + '&order=id.desc&limit=30', { member: true }),
      net().rest('/p1_bids?select=listing_id,amount,created_at&bidder=eq.' + encodeURIComponent(me) + '&order=id.desc&limit=50', { member: true }),
    ]).then(([a, b, c]) => {
      if ([a, b, c].some(r => net().notInstalled(r))) { gate = 'notInstalled'; clearInterval(timer); render(); return; }
      if (a.noAccount) { render(); return; }
      if (!a.ok) { status('Không tải được chợ (' + (a.unreachable ? 'mất mạng' : a.status) + ').'); return; }
      listings = (a.data || []).map(parseListing).filter(Boolean);
      mine = b.ok ? (b.data || []).map(parseListing).filter(Boolean) : [];
      const bids = c.ok && Array.isArray(c.data) ? c.data : [];
      const ids = [...new Set(bids.map(x => x.listing_id | 0))].slice(0, 30);
      if (!ids.length) { myBids = []; render(); return; }
      return net().rest('/p1_listings?select=' + cols + '&id=in.(' + ids.join(',') + ')', { member: true }).then(d => {
        const byId = {};
        (d.ok ? d.data || [] : []).map(parseListing).filter(Boolean).forEach(l => { byId[l.id] = l; });
        myBids = ids.map(id => byId[id] && { l: byId[id], mine: Math.max(...bids.filter(x => x.listing_id === id).map(x => x.amount | 0)) }).filter(Boolean);
        render();
      });
    });
  }

  function status(t) { const s = win && win.body.querySelector('.mk-status'); if (s) s.textContent = t; }

  function left(l) {
    const ms = Date.parse(l.ends_at) - Date.now();
    if (l.cancelled) return 'Đã huỷ';
    if (ms <= 0) return 'Đã kết thúc';
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? Math.floor(m / 60) + ' giờ ' + (m % 60) + ' ph' : m + ' ph';
  }

  function rowEl(l, extra) {
    const d = document.createElement('div');
    d.className = 'p1s-row mk-row';
    d.innerHTML = '<img class="ic" alt="" src="art/pro/poke/icon/' + l.card.dex + (l.card.shiny ? 's' : '') + '.png" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="grow"><b>' + esc(P1.chat.monLabel(l.card)) + '</b><div class="sub">' + esc(l.seller_name) + ' · ' + left(l) + (extra ? ' · ' + extra : '') + '</div></div>' +
      '<div class="mk-price"><b>₽' + priceOf(l) + '</b>' + (l.buyout ? '<div class="sub">Mua đứt ₽' + l.buyout + '</div>' : '') +
      '<div class="sub">' + (l.top_bid == null ? 'chưa ai trả' : esc(l.top_bidder_name) + ' dẫn') + '</div></div>';
    d.addEventListener('click', () => detail(l));
    return d;
  }

  function render() {
    if (!win) return;
    const g = gateOf();
    win.body.innerHTML = '';
    win.foot.innerHTML = '';
    if (g) {
      const msg = g === 'offline' ? 'Chợ trời cần mạng: hub chưa cấu hình máy chủ.'
        : g === 'noAccount' ? 'Đăng nhập hub để dùng chợ.' : notInstalledText;
      win.body.innerHTML = '<div class="p1s-gate">' + esc(msg) + (g === 'noAccount' ? '<p><a href="' + esc(net().hubUrl) + '">Mở trang đăng nhập hub</a></p>' : '') + '</div>';
      return;
    }
    const pend = mstate().outbox.length;
    const bar = document.createElement('div');
    bar.className = 'mk-bar';
    bar.innerHTML = '<div class="mk-tabs">' + [['open', 'Đang bán'], ['mine', 'Của tôi']].map(([k, t]) =>
      '<button type="button" data-tab="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + t + '</button>').join('') + '</div>' +
      '<input class="mk-q" type="search" placeholder="Tìm tên / số dex" value="' + esc(query) + '">' +
      '<select class="mk-sort"><option value="ending">Sắp hết giờ</option><option value="cheap">Giá thấp</option><option value="pricey">Giá cao</option><option value="newest">Mới đăng</option></select>';
    bar.querySelectorAll('[data-tab]').forEach(b => {
      S().sprite(b, 'Tab_up');
      b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
    });
    S().sprite(bar.querySelector('.mk-q'), 'pdex_list_search_input');
    const qEl = bar.querySelector('.mk-q'), sEl = bar.querySelector('.mk-sort');
    sEl.value = sortBy;
    qEl.addEventListener('input', () => { query = qEl.value; renderList(list); });
    sEl.addEventListener('change', () => { sortBy = sEl.value; renderList(list); });
    const list = document.createElement('div');
    list.className = 'mk-list';
    const st = document.createElement('div');
    st.className = 'mk-status';
    st.textContent = 'Tiền: ₽' + (P1.state.money | 0) + (pend ? ' · ' + pend + ' lệnh đang chờ mạng' : '');
    win.body.append(bar, list, st);
    renderList(list);
    win.foot.append(S().button('Làm mới', { onClick: () => { load(); tick(); } }));
  }

  function renderList(list) {
    list.innerHTML = '';
    if (tab === 'open') {
      const rows = sortListings(listings.filter(l => isOpen(l)), sortBy, query);
      if (!rows.length) list.innerHTML = '<div class="p1s-note">Chưa có Pokémon nào đang bán. Đăng từ menu đội hoặc PC.</div>';
      rows.forEach(l => list.appendChild(rowEl(l)));
      return;
    }
    const h1 = document.createElement('div'); h1.className = 'mk-h'; h1.textContent = 'Phiên của tôi';
    list.appendChild(h1);
    if (!mine.length) list.insertAdjacentHTML('beforeend', '<div class="p1s-note">Chưa đăng phiên nào.</div>');
    mine.forEach(l => list.appendChild(rowEl(l, l.cancelled ? 'đã huỷ' : !isOpen(l) ? (l.top_bid == null ? 'ế — Pokémon về qua nhận đồ' : 'đã bán') : '')));
    const h2 = document.createElement('div'); h2.className = 'mk-h'; h2.textContent = 'Tôi đã trả giá';
    list.appendChild(h2);
    if (!myBids.length) list.insertAdjacentHTML('beforeend', '<div class="p1s-note">Chưa trả giá phiên nào.</div>');
    myBids.forEach(({ l, mine: amt }) => {
      const lead = l.top_bidder === uid();
      list.appendChild(rowEl(l, 'giá của tôi ₽' + amt + ' · ' + (isOpen(l) ? (lead ? 'đang dẫn' : 'bị vượt') : (lead ? 'THẮNG' : 'thua'))));
    });
  }

  function detail(l) {
    const p = S().popup({ name: 'market-detail', title: 'Phiên #' + l.id + ' — ' + l.seller_name, w: 360, cls: 'p1s-cardpop' });
    const low = minBid(l), open_ = isOpen(l), own = l.seller === uid();
    p.body.innerHTML = P1.chat.cardHtml(l.card) +
      '<div class="mk-info"><div><span>Giá hiện tại</span><b>₽' + priceOf(l) + '</b></div>' +
      '<div><span>Người dẫn</span><b>' + (l.top_bid == null ? '—' : esc(l.top_bidder_name)) + '</b></div>' +
      (l.buyout ? '<div><span>Mua đứt</span><b>₽' + l.buyout + '</b></div>' : '') +
      '<div><span>Còn</span><b>' + left(l) + '</b></div><div><span>Tiền của bạn</span><b>₽' + (P1.state.money | 0) + '</b></div></div>' +
      '<div class="p1s-err"></div>';
    const err = p.body.querySelector('.p1s-err');
    if (!open_) return p;
    if (own) {
      if (l.top_bid == null) p.foot.appendChild(S().button('Huỷ phiên', { onClick: () => cancel(l, p, err) }));
      return p;
    }
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = low; inp.value = low; inp.className = 'mk-amt';
    p.foot.appendChild(inp);
    p.foot.appendChild(S().button('Trả giá', { primary: true, onClick: () => bid(l, +inp.value, p, err) }));
    if (l.buyout) p.foot.appendChild(S().button('Mua đứt ₽' + l.buyout, { onClick: () => bid(l, l.buyout, p, err) }));
    return p;
  }

  function bid(l, amount, p, err) {
    amount = Math.floor(amount);
    const low = minBid(l);
    if (!(amount >= low) && !(l.buyout && amount >= l.buyout)) { err.textContent = 'Giá tối thiểu là ₽' + low + '.'; return Promise.resolve(false); }
    if (amount > PRICE_MAX) { err.textContent = 'Giá quá lớn.'; return Promise.resolve(false); }
    if ((P1.state.money | 0) < amount) { err.textContent = 'Không đủ tiền (cần ₽' + amount + ').'; return Promise.resolve(false); }
    P1.state.money -= amount;                       // ký quỹ ngay; bị vượt giá thì p1_claim hoàn lại
    const entry = { op: 'bid', nonce: net().uuid(), money: amount, args: null };
    entry.args = { p_nonce: entry.nonce, p_listing: l.id, p_amount: amount, p_name: net().me.name };
    return submit(entry).then(res => {
      if (res.ok) { note(res.msg); if (p) p.close(); load(); } else if (err) err.textContent = res.msg;
      return res.ok;
    });
  }

  function cancel(l, p, err) {
    return net().rpc('p1_cancel', { p_listing: l.id }).then(r => {
      if (!r.ok) { err.textContent = errText(r); return false; }
      p.close();
      note('Đã huỷ phiên. Pokémon sẽ về qua mục nhận đồ.');
      return claim().then(load).then(() => true);
    });
  }

  /* ---------------------------------------------------------------- đăng bán */

  function listMon(mon, from, index) {
    const s = P1.state, arr = from === 'box' ? s.box : s.party;
    if (arr[index] !== mon) { S().toast('Không tìm thấy Pokémon này.'); return Promise.resolve(false); }
    if (from === 'party' && !s.party.some((m, i) => i !== index && m.hp > 0)) {
      S().toast('Không đăng được Pokémon còn sức cuối cùng trong đội.'); return Promise.resolve(false);
    }
    if (mon.item) { S().toast('Cất vật phẩm Pokémon đang cầm trước khi đăng.'); return Promise.resolve(false); }
    if (gateOf()) { open(); return Promise.resolve(false); }
    const card = net().cardOf(mon);
    return S().ask({
      title: 'Đăng lên chợ trời', w: 360, yes: 'Đăng bán',
      html: P1.chat.cardHtml(card),
      fields: [
        { key: 'start', label: 'Giá khởi điểm ₽', value: 1000, min: 1, max: PRICE_MAX },
        { key: 'buyout', label: 'Giá mua đứt ₽ (để trống = không)', value: '', min: 0, max: PRICE_MAX },
        { key: 'hours', label: 'Thời gian', type: 'select', value: 24, options: HOURS.map(h => [h, h + ' giờ']) },
      ],
      check: v => {
        const a = Math.floor(+v.start), b = v.buyout === '' ? null : Math.floor(+v.buyout);
        if (!(a >= 1 && a <= PRICE_MAX)) return 'Giá khởi điểm từ ₽1 đến ₽' + PRICE_MAX + '.';
        if (b != null && !(b > a && b <= PRICE_MAX)) return 'Giá mua đứt phải cao hơn giá khởi điểm.';
        return '';
      },
    }).then(v => {
      if (!v) return false;
      if (arr[index] !== mon) { S().toast('Đội đã đổi, thử lại.'); return false; }
      arr.splice(index, 1);                         // giữ trong hộp thư đi cho tới khi máy chủ nhận
      const clean = JSON.parse(JSON.stringify(mon));
      delete clean.boxNo;
      const entry = { op: 'list', nonce: net().uuid(), mon: clean, args: null };
      entry.args = {
        p_nonce: entry.nonce, p_mon: clean, p_card: card, p_name: net().me.name,
        p_start_price: Math.floor(+v.start), p_buyout: v.buyout === '' ? null : Math.floor(+v.buyout), p_hours: +v.hours,
      };
      return submit(entry).then(res => { note(res.msg); if (res.ok && win) load(); return res.ok; });
    });
  }

  P1.market = {
    open, listMon, claim, flushOutbox,
    close: () => { if (win) win.close(); },
    // phần thuần cho bộ kiểm
    minBid, priceOf, outcome, errText, sortListings, parseListing, settle,
    get gate() { return gateOf(); },
  };
})(window.P1 = window.P1 || {});
