/*
 * Sprite giao diện PRO (atlas NGUI MainUIAtlasTrilinear, bảng ô ở data/pro-ui.js).
 * border-image không cắt được một vùng con của atlas, nên mỗi sprite được cắt ra canvas riêng
 * một lần rồi dùng dataURL. Sprite có viền (bl/br/bt/bb) vẽ kiểu 9 mảnh, không viền thì kéo giãn.
 *
 *   await P1.proui.ready();
 *   P1.proui.el('HUD_chat_bg', { w: 420, h: 180 })   → <div> đã gắn ảnh
 *   P1.proui.apply(nút, 'Battle_attack_normal')       → gắn ảnh vào phần tử có sẵn
 *   P1.proui.url('HUD_menu_button_icon_pokedex')       → dataURL (sau ready)
 */
(function (P1) {
  'use strict';
  const A = P1.PRO_UI;
  const urls = {};
  let atlas = null;

  const ready = P1.img(A.img).then(img => { atlas = img; });

  function rect(name) {
    const r = A.s[name];
    if (!r) throw new Error('PRO sprite not found: ' + name);
    return r;
  }

  function url(name) {
    if (urls[name]) return urls[name];
    if (!atlas) throw new Error('PRO atlas not loaded yet: ' + name);
    const [x, y, w, h] = rect(name);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, w, h);
    return (urls[name] = c.toDataURL());
  }

  /* scale: hệ số phóng viền 9 mảnh (UI PRO thiết kế ở 1366×768). */
  function apply(el, name, opt) {
    const r = rect(name), s = (opt && opt.scale) || 1;
    const [, , w, h, bl, br, bt, bb] = r;
    const u = url(name);
    if (bl || br || bt || bb) {
      el.style.borderStyle = 'solid';
      el.style.borderWidth = `${bt * s}px ${br * s}px ${bb * s}px ${bl * s}px`;
      el.style.borderImage = `url(${u}) ${bt} ${br} ${bb} ${bl} fill / ${bt * s}px ${br * s}px ${bb * s}px ${bl * s}px stretch`;
      el.style.background = 'none';
    } else {
      el.style.backgroundImage = `url(${u})`;
      el.style.backgroundSize = '100% 100%';
      el.style.backgroundRepeat = 'no-repeat';
    }
    if (opt && opt.natural) { el.style.width = w * s + 'px'; el.style.height = h * s + 'px'; }
    return el;
  }

  function el(name, opt) {
    opt = opt || {};
    const e = document.createElement(opt.tag || 'div');
    if (opt.cls) e.className = opt.cls;
    if (opt.w != null) e.style.width = opt.w + 'px';
    if (opt.h != null) e.style.height = opt.h + 'px';
    if (opt.w == null && opt.h == null) opt = Object.assign({ natural: true }, opt);
    return apply(e, name, opt);
  }

  P1.proui = { ready: () => ready, rect, url, apply, el, has: name => !!A.s[name] };
})(window.P1 = window.P1 || {});
