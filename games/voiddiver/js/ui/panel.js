// Khung bảng UI của sảnh theo ảnh Steam (ss08 "Trade", ss09 "Combat Trait"): nền tối trong mờ, dải tiêu đề góc trái trên,
// ví (Đồng xu cõi khác đã đăng ký + Tiền vốn) góc phải trên, gợi ý phím dưới (Esc/X Đóng, chuột Chọn). Chữ Pretendard, nhấn vàng.
// Mỗi bảng: VD.ui.open({ id, title, cls, build(body, api) }) — api: { el, body, refresh(), close(), setTitle(s) }.
// Tiện ích: rich() đổi chuỗi LocalizedText có <color>, {E:id} (Expression.Text), {EStatType:X}… sang HTML; cell() ô hàng hoá; cost().
(function (VD) {
  'use strict';
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const P = () => VD.profile;

  const U = { stack: [], panels: Object.create(null) };
  U.$ = $;
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  U.fmt = n => (Math.round(n) || 0).toLocaleString('vi-VN');

  // ---------------------------------------------------------------- chữ giàu định dạng của LocalizedText
  let EXPR = null;
  function expr(id) {
    if (!EXPR) { EXPR = new Map(); for (const r of (VD.T && VD.T.Expression) || []) EXPR.set(String(r.Id), r.Text); }
    return EXPR.has(String(id)) ? EXPR.get(String(id)) : '?';
  }
  U.rich = function (s) {
    if (s == null) return '';
    s = U.esc(VD.lua ? VD.lua.text(String(s)) : String(s));
    s = s.replace(/\{E:(\d+)\}/g, (m, id) => expr(id))
      .replace(/\{(EStatType|EStatusEffectTag|EGoodsType|EDifficulty|EThemeType):([A-Za-z0-9_]+)\}/g, (m, k, v) => TX(k + '_' + v) || v)
      .replace(/&lt;color=(#[0-9a-fA-F]{3,8})&gt;/g, '<span style="color:$1">').replace(/&lt;\/color&gt;/g, '</span>')
      .replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>').replace(/&lt;\/?size[^&]*&gt;/g, '')
      .replace(/\\n|\n/g, '<br>');
    return s;
  };

  // ---------------------------------------------------------------- hàng hoá
  const G = () => VD.goods;
  U.gname = g => (g.type === 'Gold' ? TX('EGoodsType_Gold') : g.type === 'Coin' ? TX('EGoodsType_Coin') : G().name(g));
  U.gicon = g => (g.type === 'Gold' ? 'art/ui/icon_common/Gold.webp' : g.type === 'Coin' ? 'art/ui/icon_common/Coin.webp' : G().icon(g));
  U.grade = g => ((g.type === 'Gold' || g.type === 'Coin') ? 'Normal' : G().grade(g));
  // Ô hàng: icon gốc, viền màu bậc, số lượng. opts: { count, sel, onclick, title, cls, dur }
  U.cell = function (g, opts) {
    opts = opts || {};
    const el = $('div', 'vd-gcell g-' + String(U.grade(g)).toLowerCase() + (opts.cls ? ' ' + opts.cls : '') + (opts.sel ? ' sel' : ''));
    const n = opts.count != null ? opts.count : g.count;
    el.innerHTML = `<img src="${U.gicon(g)}" alt="">${n > 1 ? `<span class="n">${U.fmt(n)}</span>` : ''}`;
    el.querySelector('img').onerror = function () { this.style.visibility = 'hidden'; };
    el.title = opts.title || U.gname(g);
    if (opts.onclick) el.onclick = ev => { ev.stopPropagation(); opts.onclick(ev); };
    el.addEventListener('pointerenter', () => U.tip(g, el));
    el.addEventListener('pointerleave', () => U.tip(null));
    return el;
  };
  // Tooltip hàng hoá: tên, bậc, loại, mô tả gốc, giá trị.
  let tipEl = null;
  U.tip = function (g, anchor) {
    if (!g) { if (tipEl) tipEl.style.display = 'none'; return; }
    if (!tipEl) tipEl = $('div', 'vd-gtip', document.getElementById('ui'));
    const row = G().row(g) || {};
    const grade = U.grade(g);
    tipEl.innerHTML = `<div class="gr g-${String(grade).toLowerCase()}">${TX('EGoodsGradeType_' + grade) || grade}${row.GoodsType ? ' · ' + (TX('EGoodsType_' + row.GoodsType) || row.GoodsType) : ''}</div>
      <div class="nm">${U.esc(U.gname(g))}</div><div class="ds">${U.rich(G().desc ? G().desc(g) : '')}</div>
      ${row.Worth ? `<div class="wo"><img src="art/ui/icon_common/Gold.webp">${U.fmt(row.Worth)}</div>` : ''}`;
    tipEl.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = r.right + 8, y = r.top;
    if (x + w > innerWidth - 8) x = r.left - w - 8;
    if (x < 8) x = 8;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
  };
  // Danh sách chi phí: icon + số, đỏ khi thiếu. list: GoodsData[]
  U.cost = function (list, mult) {
    mult = mult || 1;
    const items = (list || []).map(x => P().parse(x)).filter(g => g && g.type !== 'None' && g.count > 0);
    if (!items.length) return `<span class="vd-cost free">—</span>`;
    return items.map(g => {
      const need = g.count * mult, have = P().count(g.type, g.id);
      return `<span class="vd-cost ${have >= need ? 'ok' : 'lack'}" title="${U.esc(U.gname(g))}"><img src="${U.gicon(g)}" onerror="this.style.visibility='hidden'">` +
        (g.type === 'Gold' || g.type === 'Coin' ? U.fmt(need) : `${U.fmt(have)}/${U.fmt(need)}`) + '</span>';
    }).join('');
  };
  U.mulList = (list, k) => (list || []).map(x => { const g = P().parse(x); return g ? Object.assign({}, g, { count: Math.round(g.count * k) }) : g; }).filter(Boolean);

  // ---------------------------------------------------------------- khung bảng
  U.isOpen = () => U.stack.length > 0;
  U.top = () => U.stack[U.stack.length - 1] || null;
  U.open = function (def) {
    const el = $('div', 'vd-panel ' + (def.cls || ''), document.getElementById('ui'));
    el.innerHTML = `
      <div class="vd-panel-head"><div class="ttl"></div><div class="wal">
        <div><span>${TX('OwnedCoin') || 'Đồng xu cõi khác (đã đăng ký)'}</span><img src="art/ui/icon_common/Coin.webp"><b class="coin"></b></div>
        <div><span>${TX('OwnedCurrency') || 'Tiền vốn'}</span><img src="art/ui/icon_common/Gold.webp"><b class="gold"></b></div></div></div>
      <div class="vd-panel-body"></div>
      <div class="vd-panel-foot"><span><b>Esc</b><b>X</b> ${TX('Close') || 'Đóng'}</span><span><b>🖱</b> ${TX('Select') || 'Chọn'}</span><span class="extra"></span></div>
      <button class="vd-panel-x" title="${TX('Close') || 'Đóng'}">✕</button>`;
    const api = {
      id: def.id, el, body: el.querySelector('.vd-panel-body'), def,
      setTitle(s) { el.querySelector('.ttl').textContent = s; },
      foot(html) { el.querySelector('.vd-panel-foot .extra').innerHTML = html || ''; },
      refresh() { paintWallet(); if (def.build) { api.body.innerHTML = ''; def.build(api.body, api); } },
      close() { U.close(api); },
    };
    api.setTitle(def.title || '');
    el.querySelector('.vd-panel-x').onclick = () => api.close();
    function paintWallet() {
      const p = P().get();
      el.querySelector('.coin').textContent = U.fmt(p.wallet.coin);
      el.querySelector('.gold').textContent = U.fmt(p.wallet.gold);
    }
    api.paintWallet = paintWallet;
    U.stack.push(api);
    VD.input.enabled = false; VD.input.clear();
    api.refresh();
    document.body.dataset.panel = def.id || '';
    return api;
  };
  U.close = function (api) {
    const i = U.stack.indexOf(api);
    if (i < 0) return;
    U.stack.splice(i, 1);
    if (api.def.onClose) try { api.def.onClose(); } catch (e) { console.error(e); }
    api.el.remove();
    U.tip(null);
    if (VD.lounge) { VD.lounge.markDirty(); VD.lounge.questTickSoon = true; }
    document.body.dataset.panel = U.top() ? U.top().id || '' : '';
    if (!U.stack.length && !(VD.dialog && VD.dialog.open) && !(VD.npc && VD.npc.isOpen())) { VD.input.enabled = true; VD.input.clear(); }
  };
  U.closeAll = () => { while (U.stack.length) U.close(U.top()); };
  addEventListener('keydown', e => {
    if (!U.stack.length) return;
    if (U.modal) { if (e.code === 'Escape') { e.preventDefault(); U.modal.cancel(); } return; }
    if (e.code === 'Escape' || e.code === 'KeyX') { e.preventDefault(); U.close(U.top()); }
  });

  // Hộp xác nhận trong bảng (nút Hủy/Xác nhận gốc). Trả Promise<bool>.
  U.confirm = function (title, bodyHtml, okLabel) {
    return new Promise(res => {
      const el = $('div', 'vd-modal', document.getElementById('ui'));
      el.innerHTML = `<div class="box"><h3></h3><div class="bd"></div><div class="btns"><button class="no">${TX('Cancel') || 'Hủy'}</button><button class="yes">${U.esc(okLabel || TX('Confirm') || 'Xác nhận')}</button></div></div>`;
      el.querySelector('h3').textContent = title;
      el.querySelector('.bd').innerHTML = bodyHtml || '';
      const done = v => { el.remove(); U.modal = null; res(v); };
      U.modal = { cancel: () => done(false) };
      el.querySelector('.no').onclick = () => done(false);
      el.querySelector('.yes').onclick = () => done(true);
    });
  };
  U.toast = s => { if (VD.dialog && VD.dialog.toast) VD.dialog.toast(s); };

  VD.ui = U;
})(window.VD = window.VD || {});
