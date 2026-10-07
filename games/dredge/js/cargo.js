/*
 * Màn hình khoang thuyền: kéo thả đồ giữa các lưới DR (INVENTORY, STORAGE) bằng DRGrid.canPlace/move/place/remove.
 *   DRCargo.open({ keys:['INVENTORY'] | ['INVENTORY','STORAGE'], title, holding, onClose })
 *   holding = instance đồ vừa kiếm được chưa có chỗ ({id, size, fresh...}); phải đặt hoặc vứt thì mới đóng được.
 * Tab / I bật tắt khi đang lái (DR.setMode('cargo') rồi trả lại chế độ trước). Đồ lắp (moveMode INSTALL) chỉ dời được lúc cập bến.
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
  const GRID_NAME = { INVENTORY: 'Khoang thuyền', STORAGE: 'Kho ở bến' };
  const FRESH_VN = { fresh: 'Tươi', stale: 'Hơi ươn', rotting: 'Ươn' };
  const FILTER = {
    stale: 'sepia(.55) saturate(.85) drop-shadow(0 2px 2px rgba(0,0,0,.8))',
    rotting: 'hue-rotate(55deg) saturate(.6) brightness(.72) drop-shadow(0 2px 2px rgba(0,0,0,.8))',
    inf: 'hue-rotate(250deg) saturate(1.4) drop-shadow(0 2px 2px rgba(0,0,0,.8))'
  };
  const MIN_CS = 22, MAX_CS = 64;

  let host = null, wrap = null, gridsBox = null, foot = null, tip = null, ghost = null, confirmEl = null;
  let S = null;

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
  const defOf = inst => DR.item(inst.id);
  const sizeCm = (def, inst) => def.minSizeCentimeters != null && inst.size != null
    ? Math.round(def.minSizeCentimeters + (def.maxSizeCentimeters - def.minSizeCentimeters) * inst.size) : null;
  const freshOf = inst => DRRules.freshLabel(DR_CONFIG, inst.fresh == null ? DR_CONFIG.maxFreshness : inst.fresh);

  function bbox(def, rot) {
    const fp = G.footprint(def, 0, 0, rot);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of fp) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { minX: x0, minY: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function ensureDom() {
    if (host) return;
    host = el('div', 'dr-screen dr-ui', document.body); host.id = 'dr-cargo';
    const panel = el('div', 'dr-panel', host);
    wrap = el('div', 'dc-wrap', panel);
    gridsBox = el('div', 'dc-grids');
    tip = el('div', 'dc-tip dr-ui', document.body);
    ghost = el('div', 'dc-ghost dr-ui', document.body); ghost.style.display = 'none';
    confirmEl = el('div', 'dc-confirm', host);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('contextmenu', e => { e.preventDefault(); if (S && S.held) rotate(); });
    host.addEventListener('wheel', e => { if (S && S.held) { e.preventDefault(); rotate(); } }, { passive: false });
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('resize', () => { if (S) render(); });
  }

  function canMoveInstalled() { return DR.mode === 'dock' || (S && S.prevMode === 'dock'); }
  function lockedFor(def) {
    return def.moveMode === 'NONE' || (def.moveMode === 'INSTALL' && !canMoveInstalled());
  }

  // ---------------------------------------------------------------- layout / render
  function layout() {
    const cols = S.grids.reduce((n, g) => n + g.g.cols, 0), rows = Math.max.apply(null, S.grids.map(g => g.g.rows));
    const small = root.innerHeight < 470 || root.innerWidth < 900;
    const availW = root.innerWidth - (small ? 40 : 90) - 22 * (S.grids.length - 1);
    const availH = root.innerHeight - (small ? 128 : 190);
    S.cs = Math.max(MIN_CS, Math.min(MAX_CS, Math.floor(Math.min(availW / cols, availH / rows))));
  }

  function render() {
    layout();
    wrap.innerHTML = '';
    const head = el('div', 'dc-head', wrap);
    const t = el('div', 'dr-title', head, S.title || 'Khoang thuyền');
    el('div', 'sp', head);
    const x = el('button', 'dr-btn', head, 'Đóng'); x.dataset.act = 'close';
    x.onclick = () => close();
    S.closeBtn = x;
    gridsBox = el('div', 'dc-grids', wrap);
    for (const gr of S.grids) renderGrid(gr);
    foot = el('div', 'dc-foot', wrap);
    S.hintEl = el('div', 'hint', foot);
    const rb = el('button', 'dr-btn', foot, 'Xoay (R)'), db = el('button', 'dr-btn', foot, 'Vứt (X)');
    rb.dataset.act = 'rotate'; db.dataset.act = 'discard';
    rb.onclick = () => rotate(); db.onclick = () => discardHeld();
    S.rotBtn = rb; S.disBtn = db;
    wrap.appendChild(confirmEl);
    refreshChrome();
    updateGhost();
  }

  function renderGrid(gr) {
    const g = gr.g, cs = S.cs;
    const col = el('div', 'dc-col', gridsBox);
    el('h4', '', col, GRID_NAME[gr.key] || gr.key);
    const box = el('div', 'dc-grid', col);
    box.style.width = g.cols * cs + 'px'; box.style.height = g.rows * cs + 'px';
    box.dataset.key = gr.key;
    gr.el = box;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      if (!G.usable(g, x, y)) continue;
      const cell = g.cells[y * g.cols + x], c = el('div', 'dc-cell', box);
      if ((cell.type & G.TYPE.EQUIPMENT) && !(cell.type & G.TYPE.GENERAL)) c.classList.add('eq');
      if (G.isDamaged(g, x, y)) c.classList.add('dmg');
      c.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
    }
    for (const inst of g.items) {
      const def = defOf(inst);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of inst.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const it = el('div', 'dc-item', box);
      it.style.cssText = 'left:' + x0 * cs + 'px;top:' + y0 * cs + 'px;width:' + (x1 - x0 + 1) * cs + 'px;height:' + (y1 - y0 + 1) * cs + 'px';
      it._ref = { key: gr.key, inst };
      if (S.held && S.held.inst === inst) it.classList.add('lifted');
      if (lockedFor(def)) it.classList.add('locked');
      it.appendChild(itemImg(def, inst, inst.rot, cs));
      if (isFish(def)) {
        const lab = inst.infected ? 'inf' : freshOf(inst);
        el('span', 'tag ' + lab, it, inst.infected ? 'Nhiễm' : FRESH_VN[lab]);
      }
      it.addEventListener('pointerenter', e => showTip(e, def, inst));
      it.addEventListener('pointermove', e => { if (!S.held) moveTip(e); });
      it.addEventListener('pointerleave', hideTip);
    }
    gr.pv = el('div', '', box); gr.pv.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  }

  function itemImg(def, inst, rot, cs) {
    const im = new Image();
    im.src = def.sprite; im.draggable = false;
    im.style.width = def.w * cs + 'px'; im.style.height = def.h * cs + 'px';
    im.style.transform = 'translate(-50%,-50%) rotate(' + (-rot) + 'deg)';
    const f = inst.infected ? 'inf' : isFish(def) ? freshOf(inst) : null;
    if (f && FILTER[f]) im.style.filter = FILTER[f];
    im.onerror = () => { im.style.visibility = 'hidden'; };
    return im;
  }

  function refreshChrome() {
    const h = S.held, newItem = h && h.srcKey == null;
    S.rotBtn.style.display = S.disBtn.style.display = h ? '' : 'none';
    S.closeBtn.disabled = !!newItem;
    S.hintEl.classList.toggle('warn', !!newItem);
    S.hintEl.textContent = newItem
      ? 'Con cá vừa câu chưa có chỗ: đặt vào khoang (chạm hoặc nhả chuột trên ô trống) hoặc vứt đi (Delete / X) trước khi đóng.'
      : h ? 'Đang cầm đồ: nhả vào ô xanh để đặt · R, lăn chuột hoặc chuột phải: xoay · Delete / X: vứt · Esc: trả lại chỗ cũ.'
        : 'Kéo thả để sắp xếp · R / lăn chuột / chuột phải: xoay khi đang cầm · Esc hoặc I: đóng.';
  }

  // ---------------------------------------------------------------- tooltip
  function showTip(e, def, inst) {
    if (S.held) return;
    tip.innerHTML = '';
    el('b', '', tip, def.name);
    if (def.desc) el('p', '', tip, def.desc);
    const lines = [];
    if (isFish(def)) {
      const cm = sizeCm(def, inst);
      if (cm != null) lines.push('Dài: ' + cm + ' cm');
      lines.push('Độ tươi: ' + (inst.infected ? 'Nhiễm bệnh' : FRESH_VN[freshOf(inst)]));
      lines.push('Giá bán ước tính: $' + DRRules.sellPrice(DR_CONFIG, def, inst, 1, 1).toFixed(2));
    } else lines.push('Giá trị: $' + Number(def.value || 0).toFixed(2));
    if (def.moveMode === 'INSTALL') lines.push(lockedFor(def) ? 'Thiết bị: chỉ tháo lắp được khi cập bến' : 'Thiết bị lắp đặt');
    for (const l of lines) el('small', '', tip, l);
    tip.style.display = 'block';
    moveTip(e);
  }
  function moveTip(e) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(root.innerWidth - w - 6, e.clientX + 16) + 'px';
    tip.style.top = Math.min(root.innerHeight - h - 6, e.clientY + 16) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  // ---------------------------------------------------------------- holding
  function pick(ref, e) {
    const def = defOf(ref.inst);
    if (lockedFor(def)) { play('ui.grid.error'); toast(def.moveMode === 'NONE' ? 'Không dời được món này' : 'Cần cập bến mới tháo lắp được thiết bị'); return; }
    S.held = { inst: ref.inst, srcKey: ref.key, rot: ref.inst.rot, dragging: true, down: { x: e.clientX, y: e.clientY }, moved: false };
    play(isFish(def) ? 'ui.grid.pick.organic' : 'ui.grid.pick.inorganic');
    hideTip();
    render();
    onMove(e);
  }

  function updateGhost() {
    if (!S || !S.held) { ghost.style.display = 'none'; clearPreview(); return; }
    const h = S.held, def = defOf(h.inst), cs = S.cs, bb = bbox(def, h.rot);
    ghost.style.display = 'block';
    ghost.style.width = bb.w * cs + 'px'; ghost.style.height = bb.h * cs + 'px';
    ghost.style.transform = 'translate(' + (S.ptr.x - bb.w * cs / 2) + 'px,' + (S.ptr.y - bb.h * cs / 2) + 'px)';
    if (h.ghostRot !== h.rot || h.ghostId !== h.inst) {
      ghost.innerHTML = '';
      ghost.appendChild(itemImg(def, h.inst, h.rot, cs));
      h.ghostRot = h.rot; h.ghostId = h.inst;
    }
    preview();
  }

  function candidate() {
    const h = S.held, def = defOf(h.inst), cs = S.cs, bb = bbox(def, h.rot);
    for (const gr of S.grids) {
      const r = gr.el.getBoundingClientRect();
      if (S.ptr.x < r.left - cs / 2 || S.ptr.x > r.right + cs / 2 || S.ptr.y < r.top - cs / 2 || S.ptr.y > r.bottom + cs / 2) continue;
      const bx = Math.round((S.ptr.x - r.left) / cs - bb.w / 2), by = Math.round((S.ptr.y - r.top) / cs - bb.h / 2);
      const rx = bx - bb.minX, ry = by - bb.minY;
      const ok = G.canPlace(gr.g, def, rx, ry, h.rot, h.srcKey != null ? h.inst : null);
      return { gr, rx, ry, ok, def };
    }
    return null;
  }

  function clearPreview() { if (S) for (const gr of S.grids) if (gr.pv) gr.pv.innerHTML = ''; }
  function preview() {
    clearPreview();
    const c = candidate();
    if (!c) return;
    const cs = S.cs;
    for (const [x, y] of G.footprint(c.def, c.rx, c.ry, S.held.rot)) {
      if (x < 0 || y < 0 || x >= c.gr.g.cols || y >= c.gr.g.rows) continue;
      const d = el('div', 'dc-cell pv ' + (c.ok ? 'ok' : 'bad'), c.gr.pv);
      d.style.cssText = 'left:' + x * cs + 'px;top:' + y * cs + 'px;width:' + cs + 'px;height:' + cs + 'px';
    }
  }

  function rotate() {
    if (!S || !S.held) return;
    S.held.rot = (S.held.rot + 90) % 360;
    play('ui.grid.rotate');
    updateGhost();
  }

  function tryDrop(fromDrag) {
    const h = S.held, c = candidate();
    if (!c || !c.ok) {
      if (fromDrag && h.srcKey != null) { cancelHold(); return false; }
      play('ui.grid.error');
      return false;
    }
    const inst = h.inst, def = c.def, g = c.gr.g, srcG = h.srcKey != null ? DR.grid(h.srcKey) : null;
    if (srcG === g) G.move(g, inst, def, c.rx, c.ry, h.rot);
    else {
      if (srcG) G.remove(srcG, inst);
      inst.uid = g.seq++; inst.x = c.rx; inst.y = c.ry; inst.rot = h.rot; inst.cells = G.footprint(def, c.rx, c.ry, h.rot);
      g.items.push(inst);
    }
    if (srcG !== g && root.DR && DR.emit) DR.emit('cargo', c.gr.key, inst);
    play(isFish(def) ? 'ui.grid.place.organic' : 'ui.grid.place.inorganic');
    if (h.srcKey == null) S.result = 'placed';
    S.held = null;
    render();
    return true;
  }

  function cancelHold() {
    if (!S.held || S.held.srcKey == null) return;
    S.held = null;
    render();
  }

  function discardHeld() {
    if (!S || !S.held) return;
    const h = S.held, def = defOf(h.inst);
    if (def.canBeDiscardedByPlayer === false) { play('ui.grid.error'); toast('Món này không vứt được'); return; }
    const doIt = () => {
      if (h.srcKey != null) G.remove(DR.grid(h.srcKey), h.inst); else S.result = 'discarded';
      play('ui.grid.discard.trinket');
      S.held = null;
      render();
    };
    if (isFish(def)) return doIt();
    confirmEl.innerHTML = '';
    const p = el('div', 'dr-panel', confirmEl);
    el('p', '', p, 'Vứt "' + def.name + '" xuống biển?');
    const row = el('div', 'row', p);
    const y = el('button', 'dr-btn gold', row, 'Vứt'), n = el('button', 'dr-btn', row, 'Giữ lại');
    y.dataset.act = 'confirm-yes';
    y.onclick = () => { confirmEl.classList.remove('on'); doIt(); };
    n.onclick = () => confirmEl.classList.remove('on');
    confirmEl.classList.add('on');
  }

  // ---------------------------------------------------------------- pointer
  function onDown(e) {
    if (!S || confirmEl.classList.contains('on') && !e.target.closest('.dc-confirm .dr-panel')) return;
    if (e.target.closest('button') || e.target.closest('.dc-confirm')) return;
    S.ptr = { x: e.clientX, y: e.clientY };
    if (e.button === 2) return;
    if (S.held) { if (!S.held.dragging) tryDrop(false); return; }
    const it = e.target.closest('.dc-item');
    if (it && it._ref) pick(it._ref, e);
  }
  function onMove(e) {
    if (!S) return;
    S.ptr = { x: e.clientX, y: e.clientY };
    if (S.held) {
      if (S.held.dragging && !S.held.moved && S.held.down && Math.hypot(e.clientX - S.held.down.x, e.clientY - S.held.down.y) > 8) S.held.moved = true;
      updateGhost();
    }
  }
  function onUp() {
    if (!S || !S.held || !S.held.dragging) return;
    if (S.held.moved) tryDrop(true);
    else { S.held.dragging = false; refreshChrome(); }   // chạm không kéo = bế đồ lên, chạm ô khác để đặt
  }

  // ---------------------------------------------------------------- open / close
  function open(opts) {
    if (!root.DR || !DR.s) return false;
    if (S) close(true);
    ensureDom();
    const keys = (opts && opts.keys && opts.keys.length ? opts.keys : ['INVENTORY']).filter(k => DR.s.grids[k]);
    S = {
      keys, title: opts && opts.title, onClose: opts && opts.onClose, ptr: { x: root.innerWidth / 2, y: root.innerHeight / 2 },
      grids: keys.map(k => ({ key: k, g: DR.grid(k) })), held: null, changed: false, prevMode: DR.mode, result: null
    };
    if (DR.mode === 'sail') S.changed = DR.setMode('cargo');
    if (opts && opts.holding) {
      const inst = opts.holding;
      inst.rot = inst.rot || 0;
      S.held = { inst, srcKey: null, rot: inst.rot, dragging: false };
    }
    host.classList.add('on');
    play('ui.grid.open');
    render();
    if (S.held) {
      const r = S.grids[0].el.getBoundingClientRect();
      S.ptr = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      updateGhost();
    }
    return true;
  }

  function close(force) {
    if (!S) return;
    if (S.held && S.held.srcKey == null && !force) { play('ui.grid.error'); toast('Hãy đặt hoặc vứt con cá vừa câu trước khi đóng'); return false; }
    const s = S; S = null;
    host.classList.remove('on');
    ghost.style.display = 'none'; hideTip();
    if (s.changed && DR.mode === 'cargo') DR.setMode(s.prevMode === 'cargo' ? 'sail' : s.prevMode);
    play('ui.journal.close');
    if (s.onClose) s.onClose({ holding: s.result });
    return true;
  }

  root.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (root.DRMinigame && DRMinigame.isOpen()) return;
    if (S) {
      const k = e.code;
      if (k === 'KeyR') { rotate(); }
      else if (k === 'Delete' || k === 'KeyX') { discardHeld(); }
      else if (k === 'Escape') {
        if (confirmEl.classList.contains('on')) confirmEl.classList.remove('on');
        else if (S.held && S.held.srcKey != null) cancelHold();
        else close();
      } else if (k === 'Tab' || k === 'KeyI') { if (S.changed) close(); else if (k === 'Tab') { /* khoá Tab trong màn dock */ } }
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
    if ((e.code === 'Tab' || e.code === 'KeyI') && root.DR && DR.s && DR.mode === 'sail' && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation();
      open({ keys: ['INVENTORY'], title: 'Khoang thuyền' });
    }
  }, true);

  if (root.DR && DR.on) DR.on('mode', m => { if (S && m !== 'cargo' && m !== 'dock' && S.changed) { S.changed = false; close(true); } });

  root.DRCargo = {
    open, close: () => close(), isOpen: () => !!S,
    _debug: () => S && {
      cs: S.cs, ptr: S.ptr, held: S.held && { id: S.held.inst.id, rot: S.held.rot, src: S.held.srcKey, dragging: S.held.dragging },
      grids: S.grids.map(gr => { const r = gr.el.getBoundingClientRect(); return { key: gr.key, cols: gr.g.cols, rows: gr.g.rows, x: r.left, y: r.top, w: r.width, h: r.height }; })
    }
  };
})(window);
