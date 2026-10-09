/*
 * Hộp hướng dẫn (V09): TutorialManager + TutorialPopup của bản gốc, dùng chuỗi tutorial.* trong data/strings.js.
 *   - Một hộp tại một thời điểm; mỗi bước chỉ hiện một lần mỗi ván lưu: DR.s.vars['tutorial-step-complete-<id>'] (đúng tên biến gốc,
 *     TutorialManager.SetTutorialStepComplete). Bước có điều kiện tiên quyết (prerequisiteSteps) chờ bước đó xong.
 *   - Bản gốc: hộp 420x200 canvas, nền PopupBackground đen, chữ trắng cỡ 22, thanh tiến trình 10 px ở đáy chạy theo điều kiện ẩn
 *     (TutorialStepData.GetProgress), vào/ra bằng UITransitionEffect tan biến 0,35 s (tutorialTransition trong art/ui/minigame/harvest_ui.js).
 *     Màu chữ: [C0] EMPHASIS #3b9795, [C1] POSITIVE #74d27a, [C2] NEGATIVE #dc2c38, [C3] CRITICAL #871d58 (DredgeStringLookupHelper.ColorSwappedString).
 *   - Ẩn tạm (không tính là xong) khi có hội thoại, khoang, màn câu, vòng chọn năng lực, bến, tạm dừng (GetShowResultFromUI); riêng bước 50 hiện cả khi vòng chọn mở
 *     (clip t=916 thấy hộp đèn đè lên vòng chọn).
 *   - Dữ liệu từng bước (TutorialData.asset + Tutorial_*.asset) là Odin SerializedScriptableObject nên AssetRipper chỉ giữ cái vỏ: điều kiện hiện/ẩn, vị trí và
 *     thời gian lấy từ clip ObBBFGMem5U (t=105 .. 988) và đánh dấu [ĐỀ XUẤT]; vị trí bước 30, 50, 60 đo trực tiếp trên khung hình.
 *   DRTutorial.debug() -> { showing, id, progress, done: [id...] }   DRTutorial.reset()   DRTutorial.STEPS
 */
(function (root) {
  'use strict';
  const COL = { 0: '#3b9795', 1: '#74d27a', 2: '#dc2c38', 3: '#871d58' };
  const HOLD = 10;                          // [ĐỀ XUẤT] giây hiện hộp: thanh tiến trình chạy 10-12 s rồi đóng (clip t=105)
  const VAR = id => 'tutorial-step-complete-' + id;

  // Phím trong chuỗi: {n} lấy từ keys[n]. 'mouse' = chuột trái, 'wheel' = con lăn (camera web điều khiển bằng chuột, không có phím Q/E).
  // Bản dịch: giữ cấu trúc chuỗi gốc tutorial.10/20/30/40/50/60 (data/strings.js), đổi phần nói về phím camera cho khớp điều khiển của bản web.
  const STEPS = [
    { id: 10, key: 'tutorial.10', keys: ['W', 'S', 'A', 'D'], pos: { l: '50% - 560', t: 170 },        // [ĐỀ XUẤT] "trên giữa lệch trái" (clip t=105)
      vi: '[C0]Tiến[/C0] bằng {0}\nDùng {1} để [C0]lùi[/C0].\n[C0]Rẽ[/C0] bằng {2} và {3}' },
    { id: 20, key: 'tutorial.20', keys: ['mouse', 'wheel'], pre: [10], pos: { r: 51, t: 330 },        // [ĐỀ XUẤT] "bên phải" (clip t=110)
      vi: '[C0]Xoay[/C0] camera: giữ {0} rồi kéo\n[C0]Thu phóng[/C0] bằng {1}' },
    { id: 30, key: 'tutorial.30', keys: ['F'], pre: [20], pos: { r: 51, b: 201 }, endOnHarvest: true,  // đo trên khung t=120: lề phải 51, lề dưới 201
      vi: 'Di chuyển tới một [C0]điểm câu[/C0].\nTìm những vệt bọt nước trên mặt biển.\n\nRồi nhấn {0} để [C1]bắt đầu câu[/C1].' },
    { id: 40, key: 'tutorial.40', keys: [], pre: [30], pos: { r: 51, b: 201 }, after: { id: 30, sec: 20 },   // [ĐỀ XUẤT] hiện sau bước 30 khoảng 20 s đi biển (t=175)
      vi: 'Thời gian chỉ trôi khi bạn đang [C0]di chuyển[/C0], [C0]câu cá[/C0] hay làm những việc đặc biệt khác.' },
    { id: 50, key: 'tutorial.50', keys: ['E', 'mouse'], pre: [10], pos: { l: 165, b: 171 }, radial: true,  // đo trên khung t=916: lề trái 165, lề dưới 171
      dusk: [0.72, 0.9],                                                                                    // [ĐỀ XUẤT] giờ 17:15 - 21:36 (clip: 18:21)
      vi: 'Chọn đèn bằng cách giữ {0} rồi bật / tắt bằng {1}.\n\nĐèn giúp bạn nhìn rõ, nhưng cũng khiến bạn [C0]dễ bị thấy[/C0] hơn.' },
    { id: 60, key: 'tutorial.60', keys: [], pre: [10], pos: { l: '50% - 210', t: 150 },               // đo trên khung t=988: giữa màn, cách đỉnh 150
      sanity: 0.9,                                                                                          // [ĐỀ XUẤT] khi đã mở mắt (Sanity <= .9): clip thấy ở 20:42, mắt đã xanh
      vi: 'Sương mù và [C3]những thứ khác[/C3] làm tăng [C3]nỗi hoảng loạn[/C3] <sprite name="eye-icon"/> của bạn.\n\nĐèn [C1]sáng[/C1] và việc [C1]ngủ[/C1] sẽ làm nó giảm.' }
  ];

  let box = null, textEl = null, barEl = null;
  let cur = null, t = 0, last = 0, sailT = 0;
  const doneAt = {};                                     // id -> thời điểm (s thực) bước xong, để tính "sau bước X N giây"

  const isDone = id => !!(root.DR && DR.s && DR.s.vars && DR.s.vars[VAR(id)]);
  const setDone = id => { if (root.DR && DR.s && DR.s.vars) DR.s.vars[VAR(id)] = true; doneAt[id] = performance.now() / 1000; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const KEYCAP = { mouse: ['Chuột trái', 'mouse'], wheel: ['Con lăn', 'wheel'] };
  function format(step) {
    let s = esc(step.vi);
    s = s.replace(/&lt;sprite name="eye-icon"\/&gt;|<sprite name="eye-icon"\/>/g, '<i class="tp-eye"></i>');
    s = s.replace(/\[C(\d)\]/g, (m, n) => '<span style="color:' + COL[n] + '">').replace(/\[\/C\d\]/g, '</span>');
    s = s.replace(/\{(\d)\}/g, (m, n) => {
      const k = step.keys[+n] || '?', c = KEYCAP[k];
      return c ? '<kbd class="' + c[1] + '">' + c[0] + '</kbd>' : '<kbd>' + esc(k) + '</kbd>';
    });
    return s.replace(/\n/g, '<br>');
  }

  function build() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'dr-tut'; box.className = 'dr-ui';
    box.innerHTML = '<div class="tp-text"></div><div class="tp-bar"><i></i></div>';
    document.body.appendChild(box);
    textEl = box.querySelector('.tp-text'); barEl = box.querySelector('.tp-bar i');
    const m = new URL('art/ui/sprites/Eye_Open.webp', document.baseURI).href;
    box.style.setProperty('--eye', 'url(' + m + ')');
  }

  // V = 1 đơn vị canvas tính ra px (css/ui.css :root --hu); vị trí có dạng 'p% - n' (n đơn vị canvas) hoặc số
  const at = v => typeof v === 'number' ? 'calc(' + v + 'px * var(--hu))' : 'calc(' + v.replace(/(\d+)%\s*([-+])\s*(\d+)/, '$1% $2 ' + '$3px * var(--hu)') + ')';
  function place(p) {
    const st = box.style;
    st.left = st.right = st.top = st.bottom = 'auto';
    if (p.l != null) st.left = at(p.l);
    if (p.r != null) st.right = at(p.r);
    if (p.t != null) st.top = at(p.t);
    if (p.b != null) st.bottom = at(p.b);
  }

  // Có được hiện bước này bây giờ không (GetShowResultFromUI)
  function uiOk(step) {
    const D = root.DR;
    if (!D || !D.s || D.mode !== 'sail') return false;
    if (root.DRIntro && DRIntro.playing) return false;
    if (root.DRDialogue && DRDialogue.isOpen()) return false;
    if (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) return false;
    if (root.DRMinigame && DRMinigame.isOpen && DRMinigame.isOpen()) return false;
    if (!step.radial && root.DRAbilities && DRAbilities.radialOpen) return false;
    const pz = document.getElementById('dr-pause');
    if (pz && !pz.hidden) return false;
    return true;
  }
  function showOk(step) {
    const D = root.DR, s = D.s;
    if (isDone(step.id)) return false;
    if (!(step.pre || []).every(isDone)) return false;
    if (step.after && !(isDone(step.after.id) && performance.now() / 1000 - (doneAt[step.after.id] || 0) >= step.after.sec)) return false;
    if (step.dusk) { const f = s.time - Math.floor(s.time); if (f < step.dusk[0] || f > step.dusk[1]) return false; }
    if (step.sanity != null && !(s.sanity != null && s.sanity <= step.sanity)) return false;
    if (step.id === 10 && sailT < 1) return false;       // đợi một nhịp sau khi rời bến
    return true;
  }

  function show(step) {
    cur = step; t = 0;
    textEl.innerHTML = format(step);
    place(step.pos);
    barEl.style.width = '0%';
    box.classList.add('on');
  }
  function hide(completed) {
    if (!cur) return;
    const id = cur.id;
    box.classList.remove('on');
    if (completed) setDone(id);
    cur = null;
  }

  function frame(now) {
    root.requestAnimationFrame(frame);
    if (!box || !root.DR || !DR.s) return;
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    sailT = DR.mode === 'sail' ? sailT + dt : 0;
    if (cur) {
      if (!uiOk(cur)) { hide(false); return; }                                    // ẩn tạm: hộp chạy lại từ đầu lần sau
      t += dt;
      barEl.style.width = Math.min(100, t / HOLD * 100).toFixed(1) + '%';
      if (t >= HOLD) hide(true);
      else if (cur.endOnHarvest && DR.mode !== 'sail') hide(true);                 // TutorialStepHarvestCondition.triggerOnHarvestEnter
      return;
    }
    // chờ hiện: bước đầu tiên trong danh sách đủ điều kiện
    for (const st of STEPS) if (uiOk(st) && showOk(st)) { show(st); return; }
  }

  function init() {
    build();
    root.requestAnimationFrame(t0 => { last = t0; root.requestAnimationFrame(frame); });
    // Bước 30 kết thúc ngay khi vào màn câu (hide condition HarvestCondition): uiOk() sẽ ẩn trước, nên bắt sự kiện chế độ để tính là xong.
    if (root.DR && DR.on) DR.on('mode', m => { if (cur && cur.endOnHarvest && m === 'harvest') hide(true); });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRTutorial = {
    STEPS,
    reset() { if (root.DR && DR.s && DR.s.vars) for (const s of STEPS) delete DR.s.vars[VAR(s.id)]; if (cur) hide(false); },
    debug: () => ({ showing: !!cur, id: cur ? cur.id : null, progress: cur ? Math.min(1, t / HOLD) : 0, done: STEPS.filter(s => isDone(s.id)).map(s => s.id), text: textEl ? textEl.textContent : '' })
  };
})(window);
