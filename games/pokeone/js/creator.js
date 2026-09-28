/*
 * Cảnh 'creator': tạo nhân vật trên lớp PRO (art/pro/player/<m|f>/<lớp>/<tên>_<tư thế>.png).
 * Danh sách lựa chọn theo lớp: P1.PRO.player.{m,f}.{body,cloth,hair,hat} (data/pro.js, luồng bóc tài
 * sản viết song song — nếu chưa có thì mỗi ô chọn hiện "(chưa có dữ liệu)" và vô hiệu mũi tên, không
 * vỡ màn hình). Xem trước xoay 4 hướng bằng P1.ui.paintPlayer. Ghi P1.state.player rồi vào 'world'.
 */
(function (P1) {
  'use strict';

  const STAGE_W = 1366, STAGE_H = 768;
  const DIRS = ['down', 'left', 'up', 'right'];
  const DIR_LABEL_NONE = '';  // mũ có thể rỗng = không đội
  const BG_URL = 'art/pro/ui/title_bg.png';   // cùng ảnh nền của màn đầu (title.js), cho liền mạch

  let host = null, raf = 0, bgT = 0;

  function stageWrap(parent) {
    const s = document.createElement('div');
    s.className = 'p1-stage p1-creator-stage';
    s.style.width = STAGE_W + 'px'; s.style.height = STAGE_H + 'px';
    parent.appendChild(s);
    const fit = () => {
      const k = Math.max(0.32, Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H));
      s.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
    };
    fit();
    window.addEventListener('resize', fit);
    return s;
  }

  function el(tag, cls, parent) {
    const e = document.createElement(tag || 'div');
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  P1.scene.add('creator', {
    enter() {
      host = document.createElement('div');
      host.className = 'p1-scene p1-creator';
      document.getElementById('ui').appendChild(host);
      const stage = stageWrap(host);

      // Khung panel kiểu PRO (cùng sprite backpack_no_scrollbar_bg mà các cửa sổ trong game dùng),
      // nổi trên nền title_bg (vẽ ở render()) thay vì mảng màu phẳng như trước.
      const panel = el('div', 'p1-creator-panel', stage);
      panel.appendChild(P1.proui.el('backpack_no_scrollbar_bg', { w: 560, h: 740 }));

      const prevPlayer = (P1.state && P1.state.player) || {};
      const state = {
        name: prevPlayer.name && prevPlayer.name !== 'Trainer' ? prevPlayer.name : '',
        gender: prevPlayer.gender === 'female' ? 'female' : 'male',
        look: { body: '', cloth: '', hair: '', hat: '' },
      };
      const gKey = () => (state.gender === 'female' ? 'f' : 'm');
      // Danh sách theo lớp (rỗng nếu chưa bóc): mũ luôn có tuỳ chọn đầu '' = không đội.
      function listFor(layer) {
        const src = (P1.PRO && P1.PRO.player && P1.PRO.player[gKey()] && P1.PRO.player[gKey()][layer]) || [];
        return layer === 'hat' ? [''].concat(src) : src.slice();
      }
      // Chọn giá trị đầu còn hợp lệ cho mỗi lớp khi đổi giới tính hoặc lần đầu vào màn.
      function ensureLook() {
        ['body', 'cloth', 'hair', 'hat'].forEach(layer => {
          const list = listFor(layer);
          if (!list.includes(state.look[layer])) state.look[layer] = list[0] != null ? list[0] : '';
        });
      }
      ensureLook();

      const title = el('div', 'p1-creator-title', panel); title.textContent = 'Tạo nhân vật';

      /* -- giới tính */
      const genderRow = el('div', 'p1-creator-gender', panel);
      const genderBtn = (label, val, hook) => {
        const b = el('div', 'p1-creator-gender-btn', genderRow);
        b.textContent = label; b.dataset.p1 = hook; b.tabIndex = 0;
        b.addEventListener('click', () => { state.gender = val; ensureLook(); refresh(); });
        b.addEventListener('keydown', ev => { if (ev.key === 'Enter') b.click(); });
        return b;
      };
      const mBtn = genderBtn('Nam', 'male', 'creator-gender-m');
      const fBtn = genderBtn('Nữ', 'female', 'creator-gender-f');

      /* -- khung xem trước, xoay 4 hướng */
      const previewWrap = el('div', 'p1-creator-preview', panel);
      const canvas = el('canvas', 'p1-creator-canvas', previewWrap);
      canvas.width = 220; canvas.height = 220;

      /* -- bốn ô chọn: dáng người, tóc, trang phục, mũ */
      const pickers = el('div', 'p1-creator-pickers', panel);
      const LAYERS = [
        { key: 'body', label: 'Dáng người' },
        { key: 'hair', label: 'Tóc' },
        { key: 'cloth', label: 'Trang phục' },
        { key: 'hat', label: 'Mũ' },
      ];
      const pickerEls = {};
      LAYERS.forEach(L => {
        const row = el('div', 'p1-creator-picker', pickers);
        el('div', 'p1-creator-picker-label', row).textContent = L.label;
        const ctl = el('div', 'p1-creator-picker-ctl', row);
        const prev = el('div', 'p1-btn-round p1-creator-arrow', ctl); prev.textContent = '‹'; prev.dataset.p1 = 'creator-' + L.key + '-prev'; prev.tabIndex = 0;
        const value = el('div', 'p1-creator-picker-value', ctl);
        const next = el('div', 'p1-btn-round p1-creator-arrow', ctl); next.textContent = '›'; next.dataset.p1 = 'creator-' + L.key + '-next'; next.tabIndex = 0;
        function step(d) {
          const list = listFor(L.key);
          if (!list.length) return;
          const i = list.indexOf(state.look[L.key]);
          state.look[L.key] = list[(i < 0 ? 0 : (i + d + list.length) % list.length)];
          refresh();
        }
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        pickerEls[L.key] = { value, prev, next };
      });

      /* -- tên */
      const nameRow = el('div', 'p1-creator-name', panel);
      el('div', 'p1-creator-picker-label', nameRow).textContent = 'Tên';
      const nameInput = el('input', 'p1-input p1-creator-name-input', nameRow);
      nameInput.type = 'text'; nameInput.maxLength = 12; nameInput.placeholder = 'Tên của bạn';
      nameInput.value = state.name;
      nameInput.dataset.p1 = 'creator-name-input';
      nameInput.addEventListener('input', () => { state.name = nameInput.value; });

      /* -- xác nhận */
      const accept = el('div', 'p1-btn-round p1-creator-accept', panel);
      accept.textContent = 'Bắt đầu'; accept.tabIndex = 0; accept.dataset.p1 = 'creator-accept';
      accept.addEventListener('click', () => {
        P1.state.player = {
          name: (state.name || '').trim() || 'Trainer',
          gender: state.gender,
          look: Object.assign({}, state.look),
        };
        P1.scene.go('world', {});
      });
      accept.addEventListener('keydown', ev => { if (ev.key === 'Enter') accept.click(); });

      function refresh() {
        mBtn.classList.toggle('p1-active', state.gender === 'male');
        fBtn.classList.toggle('p1-active', state.gender === 'female');
        LAYERS.forEach(L => {
          const list = listFor(L.key);
          const v = state.look[L.key];
          pickerEls[L.key].value.textContent = !list.length ? '(chưa có dữ liệu)' : (L.key === 'hat' && v === '' ? 'Không đội' : v);
          const has = list.length > 1;
          pickerEls[L.key].prev.classList.toggle('p1-disabled', !has);
          pickerEls[L.key].next.classList.toggle('p1-disabled', !has);
        });
      }
      refresh();

      /* -- hoạt cảnh xem trước: bước chân + xoay lần lượt 4 hướng */
      let t0 = performance.now(), dirIndex = 0;
      const ctx2d = canvas.getContext('2d');
      function loop(now) {
        const t = (now - t0) / 1000;
        dirIndex = Math.floor(t / 1.1) % DIRS.length;
        const frame = Math.floor(t * 6) % 3;
        P1.ui.paintPlayer(canvas, state.look, state.gender, DIRS[dirIndex], frame);
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      Object.defineProperty(this, 'selection', { configurable: true, get: () => ({ name: state.name, gender: state.gender, look: Object.assign({}, state.look) }) });
    },
    exit() {
      cancelAnimationFrame(raf);
      if (host) host.remove();
      host = null;
      bgT = 0;
    },
    render(dt) {
      // Nền: cùng ảnh 'bg 1' của màn đầu (title.js) thay vì mảng màu phẳng, cho panel PRO nổi lên trên.
      bgT += dt || 0;
      const v = P1.view();
      const ctx = v.ctx;
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, v.w, v.h);
      const img = P1.imgNow(BG_URL);
      if (img) {
        const s = Math.max(v.w / img.width, v.h / img.height) * 1.06;
        const dw = img.width * s, dh = img.height * s;
        const dx = (v.w - dw) / 2 + Math.sin(bgT * 0.04) * 14;
        const dy = (v.h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.fillStyle = 'rgba(8,12,22,.55)';
        ctx.fillRect(0, 0, v.w, v.h);
      } else {
        P1.img(BG_URL).catch(() => {});
      }
    },
  });
})(window.P1 = window.P1 || {});
