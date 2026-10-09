/*
 * Cửa sổ Thư tín (MessagesWindow, V17): danh sách thư đã nhặt + thẻ giấy kem hiện nội dung thư đang chọn.
 *
 * Gốc (MessagesWindow.cs, MessageListEntry.cs, MessageDetailWindow.cs, ShortcutResponder.cs, DredgeControlBindings.cs:371):
 *   - phím I (OpenMessages) mở / đóng; nút MessagesButton ở tab CABIN (js/cargo.js CABIN_BTN) mở cùng cửa sổ;
 *   - RefreshUI: lấy SaveData.GetMessages() thuộc set đang xem (MessageItemData.set; mỗi set một tab của TabbedPanelContainer),
 *     xếp isNew giảm dần rồi chronologicalOrder tăng dần; bộ đếm "<đã có> / <tổng MessageItemData cùng set>";
 *   - PostRefreshUI: chọn thư đầu danh sách; OnEntrySubmitted mở chi tiết và MarkNonSpatialItemAsSeen (bỏ chấm "mới").
 *   Trên clip (t=1622, t=2070) chi tiết hiện ngay dưới danh sách là thẻ giấy kem, tiêu đề (ngày thư) căn phải; bản web
 *   gộp hai bước (chọn = mở chi tiết = đã xem) vì chuột / bàn phím đều chọn được tức thì [ĐỀ XUẤT].
 *   Thư nhặt từ chai (ItemPOI "message-N") do js/poi.js thêm vào DR.s.ownedNonSpatial; thư từ Yarn (AddItemById) cũng nằm ở đó.
 *
 * Phím: ↑ ↓ ← → hoặc Q E chọn thư trước / sau; PageUp / PageDown (hoặc bấm nhãn) đổi set; I, Esc, X hoặc "Quay lại" đóng.
 * Đóng băng thời gian và nuốt phím lái như Bản đồ / Bách khoa: DRBook.modalOn / modalOff (js/book_kit.js).
 * Lời thư giữ tiếng Anh gốc (data/items.js messageBodyKey: chưa có bản dịch); nhãn bằng tiếng Việt.
 *
 *   DRMessages.open()  close()  isOpen()  _debug() → { open, set, sets, count, total, selected, order[], newCount }
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  if (!document.querySelector('link[href*="messages.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/messages.css' + ver, (me && me.src) || location.href).href; document.head.appendChild(l);
  }
  const D = () => root.DR;
  const SET_VI = { 0: 'Thư', 1: 'Ghi chú', 2: 'Nhật ký' };      // [ĐỀ XUẤT] messages.tab.* (Notes / Journals / Messages) không nói set nào là tab nào; nhãn theo nội dung từng set
  const isMsg = id => { const d = root.DR_ITEMS && DR_ITEMS[id]; return !!d && d.cls === 'MessageItemData'; };
  const owned = () => (D().s && D().s.ownedNonSpatial || []).filter(e => isMsg(e.id));
  const allOf = set => Object.values(root.DR_ITEMS || {}).filter(d => d.cls === 'MessageItemData' && d.set === set);
  const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?)i&gt;/g, '<$1i>');   // TMP rich text: chỉ <i>
  const play = k => { try { root.DRAudio && DRAudio.play(k); } catch (e) { /* tiếng là phần phụ */ } };

  let host = null, S = null;

  function entries() {
    return owned().filter(e => DR_ITEMS[e.id].set === S.set)
      .sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || DR_ITEMS[a.id].chronologicalOrder - DR_ITEMS[b.id].chronologicalOrder);
  }
  function setsAvail() {
    const s = new Set([0]);
    for (const e of owned()) s.add(DR_ITEMS[e.id].set);
    return [...s].sort((a, b) => a - b);
  }

  function build() {
    host = document.createElement('div'); host.id = 'dr-msg';
    host.innerHTML = '<div class="mg-panel"><div class="mg-tabs"></div><div class="mg-title">Thư tín</div><div class="mg-count"></div>' +
      '<div class="mg-list"></div><div class="mg-card none"><h2></h2><div class="mg-body"></div></div>' +
      '</div><div class="mg-back"><span>Quay lại</span><kbd>Esc</kbd></div>';
    host.querySelector('.mg-back').onclick = () => close();
    host.addEventListener('mousedown', e => { if (e.target === host) close(); });
    document.body.appendChild(host);
  }

  function render() {
    const list = host.querySelector('.mg-list'), card = host.querySelector('.mg-card');
    const es = S.es;
    if (S.sel >= es.length) S.sel = es.length - 1;
    if (S.sel < 0 && es.length) S.sel = 0;
    list.textContent = '';
    es.forEach((e, i) => {
      const d = DR_ITEMS[e.id];
      const row = document.createElement('div'); row.className = 'mg-ent' + (i === S.sel ? ' sel' : ''); row.dataset.id = e.id;
      row.innerHTML = (e.isNew && i !== S.sel ? '<i class="new"></i>' : '') + '<b>' + html(d.name) + '</b><span>' + html(d.messageBodyKey.replace(/<\/?i>/g, '').replace(/\s+/g, ' ')) + '</span>';
      row.onclick = () => { S.sel = i; render(); play('ui.messages.open.one'); };
      list.appendChild(row);
    });
    if (!es.length) { const m = document.createElement('div'); m.className = 'mg-empty'; m.textContent = 'Chưa nhặt được thư nào.'; list.appendChild(m); }
    const cur = es[S.sel];
    card.classList.toggle('none', !cur);
    if (cur) {
      const d = DR_ITEMS[cur.id];
      card.querySelector('h2').textContent = d.name;
      card.querySelector('.mg-body').innerHTML = d.messageBodyKey.split(/\n\s*\n/).map(p => '<p>' + html(p.replace(/^\n+|\n+$/g, '')) + '</p>').join('');
      card.scrollTop = 0;
      const sel = list.querySelector('.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      if (cur.isNew) {                                                          // MarkNonSpatialItemAsSeen: chấm "mới" còn lần vẽ này, mất ở lần sau
        cur.isNew = false; if (D().save) D().save();
      }
    }
    host.querySelector('.mg-count').textContent = es.length + ' / ' + allOf(S.set).length;
    const tabs = host.querySelector('.mg-tabs'), sets = setsAvail();
    tabs.textContent = '';
    if (sets.length > 1) for (const s of sets) {
      const b = document.createElement('button'); b.textContent = SET_VI[s] || ('Bộ ' + s); b.className = s === S.set ? 'on' : '';
      b.onclick = () => { S.set = s; S.sel = 0; S.es = entries(); render(); };
      tabs.appendChild(b);
    }
  }

  function key(e) {
    if (!S) return;
    const k = e.code, n = (S.es || []).length;
    if (k === 'KeyI') { close(); return; }
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'KeyE') { if (S.sel < n - 1) { S.sel++; render(); play('ui.messages.open.one'); } }
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'KeyQ') { if (S.sel > 0) { S.sel--; render(); play('ui.messages.open.one'); } }
    else if (k === 'PageDown' || k === 'PageUp') {
      const sets = setsAvail(), i = sets.indexOf(S.set), j = i + (k === 'PageDown' ? 1 : -1);
      if (j >= 0 && j < sets.length) { S.set = sets[j]; S.sel = 0; S.es = entries(); render(); }
    }
  }

  function canOpen() {
    const d = D();
    if (!d || !d.s || !(d.mode === 'sail' || d.mode === 'dock')) return false;
    return !(root.DRBook && DRBook.busy());
  }
  function open() {
    if (S) return true;
    if (!root.DRBook || !canOpen()) return false;
    if (!host) build();
    S = { set: 0, sel: 0, es: [] };
    S.es = entries();                                                           // thứ tự chốt lúc mở: chấm "mới" tắt khi xem không làm danh sách nhảy
    host.classList.add('on'); host.classList.remove('show');
    DRBook.modalOn('msg', close, key);
    render();
    requestAnimationFrame(() => { if (S) host.classList.add('show'); });
    play('ui.messages.open');
    return true;
  }
  function close() {
    if (!S) return false;
    S = null;
    host.classList.remove('on', 'show');
    DRBook.modalOff('msg');
    play('ui.messages.close');
    return true;
  }

  // Phím I mở (ShortcutResponder: OpenMessages, Key.I). Chạy sau book_kit.js: khi cửa sổ khác đang mở thì book_kit đã nuốt phím.
  root.addEventListener('keydown', e => {
    if (e.code !== 'KeyI' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!S && canOpen() && open()) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  root.DRMessages = { open, close, isOpen: () => !!S,
    _debug: () => S ? { open: true, set: S.set, sets: setsAvail(), count: S.es.length, total: allOf(S.set).length, selected: S.es[S.sel] ? S.es[S.sel].id : null,
      order: S.es.map(e => e.id), newCount: S.es.filter(e => e.isNew).length } : { open: false } };
})(window);
