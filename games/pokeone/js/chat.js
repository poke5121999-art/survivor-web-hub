/*
 * Khung chat toàn cục kiểu PRO (GameGUI/ChatBox: HUD_chat_bg, HUD_chat_topline, thẻ HUD_chat_tab_right,
 * ô HUD_chat_textimput) ở góc dưới phải, và các cửa sổ popup dùng chung cho chat/raid/chợ (P1.social).
 *
 * Kênh 'global': broadcast chat {text}, show {card}, boss_invite {room, boss, host, slots, expires};
 * presence {name, map, lvl} → số người online.
 *   P1.chat.showMon(mon)   khoe Pokémon       P1.chat.openCard(card)   thẻ Pokémon kiểu ChatLinkPokeCard
 *   P1.chat.invite(inv)    raid.js gọi khi mở phòng
 *   P1.chat.mount()/unmount()  — tự gọi theo cảnh: hiện ở 'world', ẩn ở cảnh khác.
 */
(function (P1) {
  'use strict';

  const MAX_LINES = 100, MAX_TEXT = 140, SEND_GAP_MS = 1500;
  const net = () => P1.net;
  const esc = s => P1.net.esc(s);

  /* ---------------------------------------------------------------- popup dùng chung (khung PRO) */

  function uiRoot() { return document.getElementById('ui') || document.body; }
  function sprite(el, name, opt) { if (P1.proui && P1.proui.has(name)) { try { P1.proui.apply(el, name, opt); } catch (e) { /* atlas chưa nạp */ } } return el; }

  function button(label, opt) {
    opt = opt || {};
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'p1s-btn' + (opt.primary ? ' primary' : '') + (opt.cls ? ' ' + opt.cls : '');
    b.textContent = label;
    sprite(b, opt.primary ? 'shop_button_buy_normal' : 'Battle_attack_normal', { scale: opt.primary ? 0.5 : 1 });
    b.addEventListener('pointerenter', () => { if (!opt.primary && !b.disabled) sprite(b, 'Battle_attack_hover'); });
    b.addEventListener('pointerleave', () => { if (!opt.primary) sprite(b, 'Battle_attack_normal'); });
    if (opt.onClick) b.addEventListener('click', e => { e.stopPropagation(); if (!b.disabled) opt.onClick(e); });
    return b;
  }

  const popups = [];
  // { name, title, w } → { el, body, foot, close(), setTitle() }. Cùng name thì đóng cái cũ.
  function popup(o) {
    const old = popups.find(p => p.name === o.name);
    if (old) old.close();
    const wrap = document.createElement('div');
    wrap.className = 'p1s-pop ' + (o.cls || '');
    wrap.dataset.pop = o.name;
    const win = document.createElement('div');
    win.className = 'p1s-win';
    win.style.width = (o.w || 360) + 'px';
    sprite(win, 'backpack_no_scrollbar_bg');
    const head = document.createElement('div');
    head.className = 'p1s-head';
    const title = document.createElement('span');
    title.textContent = o.title || '';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'p1s-x'; x.setAttribute('aria-label', 'Đóng');
    sprite(x, 'Button_round_X_normal');
    head.append(title, x);
    const body = document.createElement('div');
    body.className = 'p1s-body';
    const foot = document.createElement('div');
    foot.className = 'p1s-foot';
    win.append(head, body, foot);
    wrap.appendChild(win);
    ['pointerdown', 'keydown', 'wheel'].forEach(ev => wrap.addEventListener(ev, e => e.stopPropagation()));
    uiRoot().appendChild(wrap);
    if (P1.input) P1.input.clear();
    const p = {
      name: o.name, el: wrap, win, body, foot, closed: false,
      setTitle(t) { title.textContent = t; },
      close() {
        if (p.closed) return;
        p.closed = true;
        wrap.remove();
        popups.splice(popups.indexOf(p), 1);
        if (o.onClose) o.onClose();
      },
    };
    x.addEventListener('click', () => p.close());
    popups.push(p);
    return p;
  }

  function toast(text) {
    if (P1.ui && P1.ui.toast) { try { P1.ui.toast(text); return; } catch (e) { /* UI chưa sẵn */ } }
    const t = document.createElement('div');
    t.className = 'p1s-toast';
    t.textContent = text;
    uiRoot().appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // Hỏi xác nhận trong khung PRO. fields: [{ key, label, type:'number'|'select', value, options:[[v,label]] }].
  function ask(o) {
    return new Promise(res => {
      let done = false;
      const p = popup({ name: 'ask', title: o.title, w: o.w || 320, cls: 'p1s-ask', onClose: () => { if (!done) res(null); } });
      if (o.html) { const d = document.createElement('div'); d.innerHTML = o.html; p.body.appendChild(d); }
      const inputs = {};
      (o.fields || []).forEach(f => {
        const row = document.createElement('label');
        row.className = 'p1s-field';
        row.innerHTML = '<span>' + esc(f.label) + '</span>';
        let inp;
        if (f.type === 'select') {
          inp = document.createElement('select');
          f.options.forEach(([v, l]) => { const op = document.createElement('option'); op.value = v; op.textContent = l; inp.appendChild(op); });
        } else {
          inp = document.createElement('input');
          inp.type = 'number'; inp.min = f.min != null ? f.min : 0; if (f.max != null) inp.max = f.max;
          inp.placeholder = f.placeholder || '';
        }
        inp.value = f.value != null ? f.value : '';
        inp.dataset.key = f.key;
        row.appendChild(inp);
        p.body.appendChild(row);
        inputs[f.key] = inp;
      });
      const err = document.createElement('div');
      err.className = 'p1s-err';
      p.body.appendChild(err);
      p.foot.append(
        button(o.no || 'Huỷ', { onClick: () => p.close() }),
        button(o.yes || 'Đồng ý', { primary: true, onClick: () => {
          const vals = {};
          Object.keys(inputs).forEach(k => { vals[k] = inputs[k].value; });
          const bad = o.check ? o.check(vals) : '';
          if (bad) { err.textContent = bad; return; }
          done = true; p.close(); res(vals);
        } }));
      const first = p.body.querySelector('input,select');
      if (first) first.focus();
    });
  }

  /* ---------------------------------------------------------------- thẻ Pokémon (ChatLinkPokeCard) */

  const IV_LABEL = [['hp', 'HP'], ['atk', 'Công'], ['def', 'Thủ'], ['spa', 'C.Đặc biệt'], ['spd', 'T.Đặc biệt'], ['spe', 'Tốc độ']];

  function speciesName(dex) {
    try { return P1.mon.species(dex).name; } catch (e) { return '#' + dex; }
  }
  function monLabel(card) {
    return (card.nick || speciesName(card.dex)) + (card.shiny ? ' ★' : '') + ' Lv' + card.level;
  }
  function frontUrl(card) { return 'art/pro/poke/front/' + card.dex + (card.shiny ? 's' : '') + '.png'; }

  function cardHtml(card) {
    const sp = speciesName(card.dex);
    const total = IV_LABEL.reduce((a, [k]) => a + card.ivs[k], 0);
    const gender = card.gender === 'M' ? '<i class="g m">♂</i>' : card.gender === 'F' ? '<i class="g f">♀</i>' : '';
    return '<div class="p1s-card">' +
      '<div class="pc-top"><div class="pc-art"><img alt="" src="' + esc(frontUrl(card)) + '" onerror="this.style.visibility=\'hidden\'"></div>' +
      '<div class="pc-id"><div class="pc-name">' + esc(card.nick || sp) + gender + (card.shiny ? ' <i class="shiny">★</i>' : '') + '</div>' +
      (card.nick ? '<div class="pc-sp">' + esc(sp) + '</div>' : '') +
      '<div class="pc-lv">Lv ' + card.level + ' · #' + card.dex + '</div>' +
      '<div class="pc-kv"><span>Tính cách</span><b>' + esc(card.nature || '—') + '</b></div>' +
      '<div class="pc-kv"><span>Đặc tính</span><b>' + esc(card.ability || '—') + '</b></div>' +
      '<div class="pc-kv"><span>Bóng</span><b>' + esc(card.ball) + '</b></div>' +
      (card.ot ? '<div class="pc-kv"><span>OT</span><b>' + esc(card.ot) + '</b></div>' : '') +
      '</div></div>' +
      '<div class="pc-sec">IV <b class="pc-total">' + total + '/186</b></div><div class="pc-ivs">' +
      IV_LABEL.map(([k, l]) => '<div><span>' + l + '</span><i style="--v:' + (card.ivs[k] / 31) + '"></i><b>' + card.ivs[k] + '</b></div>').join('') +
      '</div><div class="pc-sec">Chiêu</div><div class="pc-moves">' +
      (card.moves.length ? card.moves.map(m => '<div>' + esc(m) + '</div>').join('') : '<div>—</div>') +
      '</div></div>';
  }

  function openCard(card, owner) {
    const p = popup({ name: 'pokecard', title: owner ? 'Pokémon của ' + owner : 'Thẻ Pokémon', w: 340, cls: 'p1s-cardpop' });
    p.body.innerHTML = cardHtml(card);
    return p;
  }

  /* ---------------------------------------------------------------- khung chat */

  const lines = [];               // { kind:'chat'|'show'|'invite'|'sys', from, text, card, inv, t }
  let ch = null, box = null, logEl = null, inputEl = null, onlineEl = null, unreadEl = null;
  let mounted = false, minimised = false, unread = 0, lastSent = 0, lastMap = '';

  function ensureChannel() {
    if (ch) return ch;
    ch = net().channel('global');
    ch.on('chat', (p, from) => { const text = net().clip(p.text, MAX_TEXT); if (text) add({ kind: 'chat', from, text }); });
    ch.on('show', (p, from) => { const card = net().parseCard(p.card); if (card) add({ kind: 'show', from, card }); });
    ch.on('boss_invite', (p, from) => {
      const inv = P1.raid && P1.raid.parseInvite ? P1.raid.parseInvite(p) : null;
      if (inv) add({ kind: 'invite', from, inv });
    });
    ch.on('presence', updateOnline);
    net().onStatus(s => {
      if (s === 'connecting' && lines.length) sys('Mất kết nối chat, đang nối lại…', 'net');
      if (s === 'on') { const i = lines.findIndex(l => l.tag === 'net'); if (i >= 0) sys('Đã nối lại chat.'); }
      updateOnline();
    });
    trackMe();
    return ch;
  }

  function trackMe() {
    if (!ch) return;
    const s = P1.state || {};
    const lead = (s.party || [])[0];
    lastMap = s.map || '';
    ch.track({ map: lastMap, lvl: lead ? lead.level : 0 });
  }

  function sys(text, tag) { add({ kind: 'sys', text, tag }); }

  function add(line) {
    line.t = Date.now();
    lines.push(line);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    if (!logEl) return;
    logEl.appendChild(lineEl(line));
    while (logEl.childElementCount > MAX_LINES) logEl.firstElementChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
    if (minimised && line.kind !== 'sys') { unread++; renderUnread(); }
  }

  function who(from, mine) {
    return '<b class="n' + (mine ? ' me' : '') + '">' + esc(from ? from.name : '?') + '</b>';
  }

  function lineEl(l) {
    const d = document.createElement('div');
    d.className = 'l ' + l.kind;
    const mine = l.from && l.from.id === net().me.id;
    if (l.kind === 'sys') d.textContent = l.text;
    else if (l.kind === 'chat') d.innerHTML = who(l.from, mine) + ': ' + esc(l.text);
    else if (l.kind === 'show') {
      d.innerHTML = who(l.from, mine) + ' khoe <a class="mon" href="#">[' + esc(monLabel(l.card)) + ']</a>';
      d.querySelector('a').addEventListener('click', e => { e.preventDefault(); openCard(l.card, l.from && l.from.name); });
    } else if (l.kind === 'invite') {
      const inv = l.inv;
      d.innerHTML = who(l.from, mine) + ' mời đánh boss <i class="boss">' + esc(inv.label) + '</i> (' + inv.slots + '/4) ';
      const b = button('Tham gia', { cls: 'join', onClick: () => { if (P1.raid) P1.raid.join(inv.room); } });
      if (mine || Date.now() > inv.expires) b.disabled = true;
      d.appendChild(b);
    }
    return d;
  }

  function updateOnline() {
    if (!onlineEl) return;
    const st = net().status;
    const n = ch ? ch.presence().length : 0;
    onlineEl.textContent = st === 'offline' ? 'ngoại tuyến' : st === 'on' ? n + ' online' : 'đang nối…';
  }

  function renderUnread() { if (unreadEl) { unreadEl.textContent = unread ? String(unread) : ''; unreadEl.hidden = !unread; } }

  function canSend() {
    const now = Date.now();
    if (now - lastSent < SEND_GAP_MS) { sys('Gửi chậm lại một chút.'); return false; }
    lastSent = now;
    return true;
  }

  function sendText(raw) {
    const text = net().clip(raw, MAX_TEXT);
    if (!text || !canSend()) return false;
    ensureChannel().send('chat', { text });
    add({ kind: 'chat', from: { id: net().me.id, name: net().me.name }, text });
    return true;
  }

  function showMon(mon) {
    const card = net().cardOf(mon);
    if (!canSend()) return false;
    ensureChannel().send('show', { card });
    add({ kind: 'show', from: { id: net().me.id, name: net().me.name }, card: net().parseCard(card) || card });
    if (!mounted) toast('Đã khoe ' + monLabel(card) + ' lên chat.');
    return true;
  }

  function invite(inv) {
    ensureChannel().send('boss_invite', inv);
    const parsed = P1.raid.parseInvite(inv);
    if (parsed) add({ kind: 'invite', from: { id: net().me.id, name: net().me.name }, inv: parsed });
  }

  function build() {
    box = document.createElement('div');
    box.className = 'p1-chat';
    box.innerHTML =
      '<div class="tabs"><div class="tab on">Toàn cầu</div><span class="online"></span>' +
      '<span class="unread" hidden></span><button type="button" class="min" aria-label="Thu nhỏ"></button></div>' +
      '<div class="win"><div class="top"></div><div class="log" role="log" aria-live="polite"></div></div>' +
      '<form class="in"><input type="text" maxlength="' + MAX_TEXT + '" placeholder="Enter để chat…" autocomplete="off" spellcheck="false"></form>';
    sprite(box.querySelector('.tab'), 'HUD_chat_tab_right');
    sprite(box.querySelector('.win'), 'HUD_chat_BG');
    sprite(box.querySelector('.top'), 'HUD_chat_topline');
    sprite(box.querySelector('.in'), 'HUD_chat_textimput');
    const min = box.querySelector('.min');
    sprite(min, 'chat_button_minimize_normal');
    logEl = box.querySelector('.log');
    inputEl = box.querySelector('input');
    onlineEl = box.querySelector('.online');
    unreadEl = box.querySelector('.unread');
    min.addEventListener('click', () => setMinimised(!minimised));
    box.querySelector('.tabs').addEventListener('dblclick', () => setMinimised(!minimised));
    box.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      if (sendText(inputEl.value)) inputEl.value = '';
      inputEl.blur();
    });
    inputEl.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { inputEl.blur(); }
    });
    inputEl.addEventListener('focus', () => { if (P1.input) P1.input.clear(); });
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    lines.forEach(l => logEl.appendChild(lineEl(l)));
  }

  function setMinimised(v) {
    minimised = v;
    if (box) box.classList.toggle('mini', v);
    if (!v) { unread = 0; renderUnread(); if (logEl) logEl.scrollTop = logEl.scrollHeight; }
  }

  function mount() {
    if (mounted) return;
    if (!box) {
      build();
      // Màn điện thoại (844×390): khung chat mở sẵn che gần nửa màn chơi, nên bắt đầu thu gọn.
      if (Math.min(window.innerWidth, window.innerHeight) < 500) setMinimised(true);
    }
    ensureChannel();
    uiRoot().appendChild(box);
    mounted = true;
    updateOnline();
    logEl.scrollTop = logEl.scrollHeight;
    if (!lines.length) sys(net().status === 'offline' ? 'Chat ngoại tuyến: chưa cấu hình máy chủ.' : 'Chat toàn cầu. Enter để gõ, khoe Pokémon từ menu đội.');
  }

  function unmount() {
    if (!mounted) return;
    if (document.activeElement === inputEl) inputEl.blur();
    box.remove();
    mounted = false;
  }

  // Bắt ở pha capture, trước core.js: popup của lớp mạng đang mở thì phím không tới nhân vật (Esc đóng popup trên cùng);
  // Enter mở ô chat kiểu PRO thay vì thành nút A.
  window.addEventListener('keydown', e => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (popups.length) {
      if (e.key === 'Escape') popups[popups.length - 1].close();
      if (P1.input && P1.input.map[e.code]) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (!mounted || minimised || e.key !== 'Enter' || e.repeat || (t && t.tagName === 'BUTTON')) return;
    if ((P1.ui && P1.ui.isOpen && safe(() => P1.ui.isOpen())) || (P1.dialog && P1.dialog.active)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    inputEl.focus();
  }, true);
  function safe(f) { try { return f(); } catch (e) { return false; } }

  // Theo cảnh: chỉ đổi khi tên cảnh đổi, để mount()/unmount() gọi tay vẫn giữ tới lần đổi cảnh sau.
  let lastScene = null;
  setInterval(() => {
    const name = P1.scene ? P1.scene.name : '';
    if (name !== lastScene) {
      lastScene = name;
      if (name === 'world') mount(); else unmount();
    }
    if (ch && P1.state && P1.state.map !== lastMap) trackMe();
  }, 250);

  P1.social = { popup, button, ask, toast, sprite, closeAll: () => popups.slice().forEach(p => p.close()), popups };
  P1.chat = {
    mount, unmount, showMon, invite, openCard, cardHtml, monLabel, speciesName, send: sendText, sys,
    get lines() { return lines; },
    get mounted() { return mounted; },
    minimise: setMinimised,
  };
})(window.P1 = window.P1 || {});
