// Đợt polish 3 theo clip: cột sáng rơi xuống nhân vật lúc vào ải, hộp thoại NPC/trùm có nút SKIP, công tắc "Bỏ qua cốt truyện" của Thần Điện.
// Số đo từ khung clip https://youtu.be/LyMmXTQFcq8 (bản 7.8, 1280x576): cột sáng ở ?t=5.0 trắng, rộng ~6% bề ngang, viền xanh lơ, từ mép trên
// màn tới chân nhân vật; ?t=5.4 còn một vạch mảnh, nhân vật hiện ra; ?t=5.8 hết [ƯỚC LƯỢNG thời lượng ~0,9 s: không tìm ra prefab gốc
// trong common/ui theo regex born|appear|spawn|light|beam, nên vẽ bằng canvas].
// Hộp thoại [THẤY https://youtu.be/B9Gb2Y26Cow?t=890]: thanh tối ở 75% chiều cao tới đáy, tên ở góc trái, chữ ở 16% bề ngang, "SKIP>>" ở góc phải dưới.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK) return;
  const P3 = SK.polish3 = {};

  // ---------------------------------------------------------------- 1. cột sáng vào ải
  const BEAM = { delay: 0.95, life: 0.9, wMax: 15, wMin: 1.2 };   // đơn vị khung nhìn (400x225); trễ = đợi màn tải mờ xong
  const beam = P3.beam = { on: false, t: 0, wait: 0, w: 0, a: 0, lastT: 0 };
  SK.on('stageEnter', G => {
    beam.on = true; beam.t = 0; beam.lastT = G.t || 0;
    beam.wait = SK.loading && SK.loading.on ? BEAM.delay : 0;
    beam.w = beam.a = 0;
  });
  SK.on('runStart', () => { beam.on = false; });
  SK.on('runEnd', () => { beam.on = false; });
  function drawBeam(ctx, G) {
    if (!beam.on || !G.player) return;
    const dt = Math.min(0.1, Math.max(0, (G.t || 0) - beam.lastT)); beam.lastT = G.t || 0;
    if (beam.wait > 0) { beam.wait -= dt; beam.w = beam.a = 0; return; }
    beam.t += dt;
    const k = beam.t / BEAM.life;
    if (k >= 1) { beam.on = false; beam.w = beam.a = 0; return; }
    // rộng nhất lúc đầu, thu mảnh dần tới vạch; mờ ở 30% cuối
    beam.w = BEAM.wMin + (BEAM.wMax - BEAM.wMin) * Math.pow(1 - k, 1.6);
    beam.a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const cam = G.view || G.cam, x = G.player.x - cam.x, y = G.player.y - cam.y;
    ctx.save();
    ctx.globalAlpha = beam.a;
    const glow = ctx.createLinearGradient(x - beam.w * 1.1, 0, x + beam.w * 1.1, 0);
    glow.addColorStop(0, 'rgba(120,220,255,0)'); glow.addColorStop(0.28, 'rgba(120,220,255,0.85)');
    glow.addColorStop(0.72, 'rgba(120,220,255,0.85)'); glow.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - beam.w * 1.1, 0, beam.w * 2.2, y);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - beam.w / 2, 0, beam.w, y);
    // chân cột: quầng sáng tròn trên sàn
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, beam.w * 1.6);
    g2.addColorStop(0, 'rgba(255,255,255,0.9)'); g2.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g2; ctx.fillRect(x - beam.w * 1.6, y - beam.w * 1.6, beam.w * 3.2, beam.w * 3.2);
    ctx.restore();
  }

  // ---------------------------------------------------------------- 2. hộp thoại + SKIP
  const dlg = P3.dialog = { on: false, name: '', lines: [], i: 0, t: 0, auto: 0, lastT: 0, skipRect: null, done: null };
  const CPS = 38, HOLD = 3.2;   // chữ chạy 38 ký tự/giây, mỗi câu giữ 3,2 s rồi tự sang câu kế [ƯỚC LƯỢNG]
  P3.say = function (name, lines, done) {
    dlg.on = true; dlg.name = name; dlg.lines = lines.slice(); dlg.i = 0; dlg.t = 0; dlg.auto = 0; dlg.done = done || null;
    dlg.lastT = (SK.G && SK.G.t) || 0;
  };
  function dlgClose() {
    const f = dlg.done; dlg.on = false; dlg.done = null; dlg.skipRect = null;
    if (f) f();
  }
  P3.skip = dlgClose;
  P3.next = function () { if (!dlg.on) return; if (++dlg.i >= dlg.lines.length) dlgClose(); else { dlg.t = 0; dlg.auto = 0; } };
  function drawDialog(ctx, G) {
    if (!dlg.on) return;
    const dt = Math.min(0.1, Math.max(0, (G.t || 0) - dlg.lastT)); dlg.lastT = G.t || 0;
    dlg.t += dt;
    const line = dlg.lines[dlg.i] || '', shown = Math.min(line.length, Math.floor(dlg.t * CPS));
    if (shown >= line.length) { dlg.auto += dt; if (dlg.auto > HOLD) { P3.next(); return; } }
    const v = SK.view, y0 = v.h * 0.75;
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, v.w, 0);
    bg.addColorStop(0, 'rgba(26,32,44,0.94)'); bg.addColorStop(0.85, 'rgba(26,32,44,0.94)'); bg.addColorStop(1, 'rgba(26,32,44,0.2)');
    ctx.fillStyle = bg; ctx.fillRect(0, y0, v.w, v.h - y0);
    SK.text(ctx, dlg.name, v.w * 0.05, v.h * 0.93, 8, '#fff', 'center', 'rgba(0,0,0,0.9)');
    SK.text(ctx, line.slice(0, shown), v.w * 0.16, y0 + v.h * 0.07, 10, '#fff', 'left', 'rgba(0,0,0,0.6)');
    const sx = v.w * 0.95, sy = v.h * 0.945;
    SK.text(ctx, 'SKIP>>', sx, sy, 10, '#c9d0da', 'right', 'rgba(0,0,0,0.6)');
    dlg.skipRect = { x: sx - 44, y: sy - 8, w: 54, h: 16 };
    ctx.restore();
  }
  // Chạm: vào SKIP thì đóng hết, chạm chỗ khác trong hộp thì sang câu kế (chặn không cho lọt xuống nút chơi).
  addEventListener('pointerdown', e => {
    if (!dlg.on || !SK.hudCtx) return;
    const c = SK.hudCtx.canvas, r = c.getBoundingClientRect(), v = SK.view;
    const x = (e.clientX - r.left) / r.width * v.w, y = (e.clientY - r.top) / r.height * v.h, s = dlg.skipRect;
    if (s && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) { dlgClose(); e.stopPropagation(); return; }
    if (y >= v.h * 0.75) { P3.next(); e.stopPropagation(); }
  }, true);

  // Zulan Di Tích (boss30) chết thì có thoại như clip [THẤY]; lời Việt [ƯỚC LƯỢNG] từ câu "You have to... protect...".
  SK.on('enemyKill', (G, e) => {
    if (e && e.id === 'boss30') P3.say('Zulan Di Tích', ['Ngươi phải... bảo vệ...']);
  });
  SK.on('runStart', () => { dlg.on = false; });
  SK.on('runEnd', () => { dlg.on = false; });

  SK.on('hud', (ctx, G) => { drawBeam(ctx, G); drawDialog(ctx, G); });

  // ---------------------------------------------------------------- 3. công tắc "Bỏ qua cốt truyện" của Thần Điện [LOC defence/skip_plot]
  // Nằm dưới mô tả thẻ Thần Điện Thủ Hộ trong bảng chọn chế độ (lobby.js dựng bảng; tệp này chỉ chèn thêm một nút khi thẻ đó đang chọn).
  const KEY = 'sk_defence_skipplot';
  try { if (SK.defence && localStorage.getItem(KEY) === '1') SK.defence.skipPlot = true; } catch (_) { /* không có localStorage */ }
  function sync() {
    const title = document.getElementById('hs-mode-title'), desc = document.getElementById('hs-mode-desc');
    if (!title || !desc || !SK.defence) return;
    let el = document.getElementById('hs-skipplot');
    const want = title.textContent === 'Thần Điện Thủ Hộ';
    if (!want) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'hs-skipplot'; el.className = 'hs-mode-diff';
      el.innerHTML = '<button type="button"></button>';
      el.firstChild.onclick = () => {
        SK.defence.skipPlot = !SK.defence.skipPlot;
        try { localStorage.setItem(KEY, SK.defence.skipPlot ? '1' : '0'); } catch (_) { /* bỏ qua */ }
        sync();
      };
      desc.after(el);
    }
    el.hidden = false;
    const b = el.firstChild; b.textContent = 'Bỏ qua cốt truyện: ' + (SK.defence.skipPlot ? 'Bật' : 'Tắt');
    b.classList.toggle('sel', !!SK.defence.skipPlot);
  }
  P3.syncSkipPlot = sync;
  function watch() {
    const t = document.getElementById('hs-mode-title'), m = document.getElementById('hs-modes');
    if (!t || !m) return;
    const ob = new MutationObserver(sync);
    ob.observe(t, { childList: true, characterData: true, subtree: true });
    ob.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
