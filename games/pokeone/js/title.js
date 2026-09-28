/*
 * Cảnh 'title' (2D): nền là bản đồ Kanto trong mây của PRO (Texture2D 'bg 1', xuất một lần bằng
 * tools/pro/rip_title_bg.py → art/pro/ui/title_bg.png), tên game "PokéOne" (không dùng logo PRO),
 * Tiếp tục / Chơi mới / Cài đặt. P1.titleBackdrop.ready báo ảnh nền đã tải xong (bài kiểm chờ mốc này).
 */
(function (P1) {
  'use strict';

  const BG_URL = 'art/pro/ui/title_bg.png';
  const STAGE_W = 1366, STAGE_H = 768;

  const B = { ready: false, t: 0 };
  P1.titleBackdrop = B;

  let host = null, onKey = null;

  function summary(st) {
    const sec = Math.floor(st.playSeconds || 0);
    const lv = P1.trainerLevel ? P1.trainerLevel(st.trainerExp).level : 5;
    return st.player.name + '   Lv ' + lv + '   ' + Math.floor(sec / 3600) + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') +
      '   Đã bắt ' + Object.keys(st.dex.caught).length;
  }

  function stageWrap(parent) {
    const s = document.createElement('div');
    s.className = 'p1-stage p1-title-stage';
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

  P1.scene.add('title', {
    enter() {
      B.t = 0; B.ready = false;
      P1.audio.music('title');
      P1.img(BG_URL).then(() => { B.ready = true; }).catch(() => { B.ready = true; });

      host = document.createElement('div');
      host.className = 'p1-scene p1-title';
      document.getElementById('ui').appendChild(host);
      const stage = stageWrap(host);

      const logo = document.createElement('div');
      logo.className = 'p1-title-logo';
      logo.textContent = 'PokéOne';
      stage.appendChild(logo);

      const saved = P1.hasSave();
      const box = document.createElement('div');
      box.className = 'p1-title-box';
      stage.appendChild(box);
      if (saved) {
        const p = document.createElement('div');
        p.className = 'p1-title-summary';
        p.textContent = summary(P1.state);
        box.appendChild(p);
      }
      const row = document.createElement('div');
      row.className = 'p1-title-buttons';
      box.appendChild(row);

      function mk(label, hook, fn) {
        const b = document.createElement('div');
        b.className = 'p1-title-btn';
        b.dataset.p1 = hook;
        b.tabIndex = 0;
        b.textContent = label;
        b.addEventListener('click', fn);
        b.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } });
        row.appendChild(b);
        return b;
      }
      const goContinue = () => { if (!P1.load()) return; P1.scene.go('world', {}); };
      const goFresh = async () => {
        const start = () => { P1.newGame(); P1.scene.go('creator', {}); };
        if (!saved) { start(); return; }
        const ok = await P1.ui.message({ title: 'Chơi mới?', text: 'Bắt đầu lại từ đầu? Bản lưu cũ sẽ bị ghi đè ở lần lưu kế tiếp.', yes: 'Đồng ý', no: 'Thôi' });
        if (ok) start();
      };
      if (saved) mk('Tiếp tục', 'title-continue', goContinue);
      mk('Chơi mới', 'title-new', goFresh);
      mk('Cài đặt', 'title-options', () => { if (P1.ui && !P1.ui.isOpen()) P1.ui.open('options'); });

      onKey = ev => {
        if (ev.code !== 'Enter' || (P1.ui && P1.ui.isOpen())) return;
        const t = ev.target;
        if (t && t.tagName === 'INPUT') return;
        (saved ? goContinue : goFresh)();
      };
      window.addEventListener('keydown', onKey);
    },
    exit() {
      if (onKey) window.removeEventListener('keydown', onKey);
      onKey = null;
      if (P1.ui) P1.ui.closeAll();
      if (host) host.remove();
      host = null;
    },
    render(dt) {
      B.t += dt;
      const v = P1.view();
      const ctx = v.ctx;
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, v.w, v.h);
      const img = P1.imgNow(BG_URL);
      if (img) {
        // Phủ kín khung hình (kiểu object-fit: cover) và trôi rất nhẹ để màn đầu không tĩnh cứng.
        const s = Math.max(v.w / img.width, v.h / img.height) * 1.06;
        const dw = img.width * s, dh = img.height * s;
        const dx = (v.w - dw) / 2 + Math.sin(B.t * 0.04) * 14;
        const dy = (v.h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.fillStyle = 'rgba(8,12,22,.4)';
        ctx.fillRect(0, 0, v.w, v.h);
      }
    },
  });
})(window.P1 = window.P1 || {});
