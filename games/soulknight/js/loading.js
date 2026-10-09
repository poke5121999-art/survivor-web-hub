// Màn tải giữa hai ải, dựng từ scene gốc loading.ab › Canvas_Loading (SK_UI.prefabs.loading) [THẤY
// https://youtu.be/LyMmXTQFcq8?t=2]: nền xám, "{0} ải sau sẽ nhận Thiên Phú mới!" (Tip_Buff), mẹo I_tip_* (Tip), xoáy cổng ở giữa.
// Khi có bảng chọn thiên phú (SK.ROOMS.choice) thì hiện ui_buff_bar với 3 thẻ buff_tpl3 thay cho xoáy [THẤY ?t=44].
// ld = {on, t, outT, tip}: on từ lúc bước vào cổng; sau khi vào ải mới giữ HOLD giây rồi mờ dần FADE giây.
(function () {
  'use strict';
  const SK = window.SK, U = window.SK_UI;
  if (!U || !U.prefabs.loading) return;
  const BG = '#202020';                     // [THẤY] nền màn tải
  const FADE_IN = 0.2, HOLD = 0.6, FADE = 0.3, GROW = 0.45;   // [ƯỚC LƯỢNG] nhịp mờ/hiện
  const ld = { on: false, t: 0, outT: -1, tip: '' };
  SK.loading = ld;
  let L = null, CARD = [];

  function ui() {
    if (L || !SK.ugui || !SK.ugui.ok) return L;
    L = SK.ugui.inst('loading');
    for (const p of ['team_info_loading', 'ui_buff_bar/body/finger', 'ui_buff_bar/body/select_buff_tips', 'ui_buff_bar/body/mask']) {
      const n = L.q(p); if (n) n.off = 1;
    }
    L.q('ui_buff_bar/body/title/text').txt.s = U.terms.ui_loading_new_title;
    // Nút đổi: biến thể miễn phí (free_icon, hai mũi tên) như bản gốc, không phải biến thể xem quảng cáo [THẤY ?t=44].
    const RB = 'ui_buff_bar/body/safe_area/reroll_btn/';
    L.q(RB + 'ad_icon').off = 1; L.q(RB + 'free_icon').off = 0;
    L.q(RB + 'name').txt.s = U.terms['uiloading/reroll'];
    CARD = L.q('ui_buff_bar/body/grid').k;
    // Nhân tố Thiên Phú Tự Chọn (+2 thẻ) cần tới 5 thẻ: nhân bản thẻ đầu vào cùng lưới; thẻ thừa tự tắt (off) khi không có buff.
    while (CARD.length < 5) CARD.push(SK.ugui.clone(CARD[0]));
    CARD.forEach((c, i) => { c.n = 'card' + i; });   // ba bản ghép cùng tên buff_tpl3: đặt tên riêng để tra đường dẫn
    L.reindex();
    CARD.forEach((c, i) => {
      // Mô tả dài co chữ cho vừa khung thay vì tràn lên ô icon [ƯỚC LƯỢNG cỡ tối thiểu 26].
      c.k.find(k => k.n === 'desc').txt.bf = [26, 40];
      const icon = c.k.find(k => k.n === 'middle').k.find(k => k.n === 'icon');
      icon.draw = (ctx, R) => { const id = SK.ROOMS.choice.cards[i]; if (id != null) fit(ctx, SK.ROOMS.buffIcon(id), R); };
    });
    return L;
  }
  function fit(ctx, name, R) {
    const f = SK.frame(name);
    if (!f) return;
    const sc = Math.min(R.w / f[3], R.h / f[4]);
    SK.draw(ctx, name, R.x + R.w / 2 - (f[3] / 2 - f[5]) * sc, R.y + R.h / 2 - (f[4] / 2 - f[6]) * sc, { sx: sc, sy: sc });
  }

  // Số ải tới lần chọn thiên phú kế (đếm từ ải sắp vào); 0 = không còn lần nào.
  function stagesToBuff(G) {
    const after = (SK.ROOMS && SK.ROOMS.BUFF_AFTER) || [];
    for (let i = G.stageIdx + 1; i < SK.STAGES.length; i++) if (after.indexOf(SK.STAGES[i].label) >= 0) return i - G.stageIdx;
    return 0;
  }

  function refresh(G) {
    if (!ui()) return;
    const ch = SK.ROOMS && SK.ROOMS.choice, choosing = !!(ch && ch.open);
    L.q('ui_buff_bar').off = choosing ? 0 : 1;
    // Số thẻ khác 3 (Nhân tố thiên phú): xếp lại hàng thẻ giữa màn, thu nhỏ khi nhiều để chừa chỗ nút đổi.
    const nCard = choosing ? ch.cards.length : 3, sc = nCard <= 3 ? 1 : nCard === 4 ? 0.8 : 0.62, step = nCard <= 3 ? 310 : nCard === 4 ? 250 : 190;
    CARD.forEach((c, i) => { c.p = [(i - (nCard - 1) / 2) * step, c.p[1]]; c.sc = [sc, sc]; });
    CARD.forEach((c, i) => {
      const id = choosing ? ch.cards[i] : null;
      c.off = id == null ? 1 : 0;
      if (id == null) return;
      c.k.find(k => k.n === 'title').txt.s = SK.ROOMS.buffName(id);
      c.k.find(k => k.n === 'desc').txt.s = SK.ROOMS.buffDesc(id);
    });
    const rb = L.q('ui_buff_bar/body/safe_area/reroll_btn'), rt = L.q('ui_buff_bar/body/safe_area/reroll_text');
    rb.off = rt.off = choosing && ch.rerolls > 0 ? 0 : 1;
    rt.txt.s = '(' + (ch ? ch.rerolls : 0) + '/2)';
    const n = choosing ? 0 : stagesToBuff(G);
    L.q('Tip_Buff').off = n > 0 ? 0 : 1;
    L.q('Tip_Buff/text').txt.s = U.terms.ui_loading_new_when_buff_popup.replace('{0}', n);
    L.q('Tip').txt.s = choosing ? '' : ld.tip;
  }

  function show() {
    ld.on = true; ld.t = 0; ld.outT = -1;
    ld.tip = U.tips && U.tips.length ? U.tips[Math.floor(Math.random() * U.tips.length)] : '';
  }

  SK.on('portalEnter', () => show());
  SK.on('stageEnter', () => { if (ld.on) ld.outT = 0; });
  SK.on('runStart', () => { ld.on = false; });
  SK.on('runEnd', () => { ld.on = false; });

  // Vẽ trên canvas HUD sau mọi thứ (đăng ký sau rooms.js nên chạy cuối trong sự kiện 'hud').
  SK.on('hud', (ctx, G) => {
    if (!ld.on) return;
    const dt = Math.min(0.1, Math.max(0, (G.t || 0) - (ld.lastT || 0))); ld.lastT = G.t || 0;
    ld.t += dt;
    let a = Math.min(1, ld.t / FADE_IN);
    if (ld.outT >= 0) {
      ld.outT += dt;
      a = Math.min(a, 1 - Math.max(0, ld.outT - HOLD) / FADE);
      if (a <= 0) { ld.on = false; return; }
    }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    const choosing = SK.ROOMS && SK.ROOMS.choice && SK.ROOMS.choice.open;
    if (!choosing) {
      // Xoáy cổng: prefab transfer_gate, lớn dần từ một chấm [THẤY https://youtu.be/B9Gb2Y26Cow?t=5], cao ~42% màn [THẤY ?t=2 bản 7.8].
      const g = Math.min(1, ld.t / GROW), k = H / 720 * 7 * (0.15 + 0.85 * g * (2 - g));
      ctx.imageSmoothingEnabled = true;
      // Prefab căn giữa tại điểm neo (hộp bao −42…+43 px ở tỉ lệ 1, đo trên canvas); tâm xoáy ở giữa màn [THẤY].
      SK.drawPrefab(ctx, SK.art.object('portal'), W / 2, H * 0.5, { t: ld.t, state: 'transfer_gate', scale: 0.5 * k });
    }
    if (ui()) { refresh(G); L.tick(dt); L.draw(ctx, W, H); }
    ctx.restore();
  });

  // Chạm thẻ / nút đổi: toạ độ CSS → điểm ảnh HUD → rect của nút.
  addEventListener('pointerdown', e => {
    const ch = SK.ROOMS && SK.ROOMS.choice;
    if (!ld.on || !ch || !ch.open || !ui()) return;
    const hud = SK.hudCtx.canvas, r = hud.getBoundingClientRect(), dpr = hud.width / r.width;
    const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const inR = R => R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h;
    for (let i = 0; i < CARD.length; i++) {
      if (!CARD[i].off && inR(L.rectOf('ui_buff_bar/body/grid/card' + i, hud.width, hud.height))) { SK.ROOMS.pick(i); e.stopPropagation(); return; }
    }
    if (inR(L.rectOf('ui_buff_bar/body/safe_area/reroll_btn', hud.width, hud.height))) { SK.ROOMS.reroll(); e.stopPropagation(); }
  }, true);

  // Móc kiểm thử: rect CSS của thẻ thứ i.
  ld.cardRect = i => {
    if (!ui()) return null;
    const hud = SK.hudCtx.canvas, r = hud.getBoundingClientRect(), dpr = hud.width / r.width;
    const R = L.rectOf('ui_buff_bar/body/grid/card' + i, hud.width, hud.height);
    return R && { x: r.left + R.x / dpr, y: r.top + R.y / dpr, w: R.w / dpr, h: R.h / dpr };
  };
  ld.text = path => { const n = ui() && L.q(path); return n && n.txt ? String(n.txt.s) : null; };
})();
