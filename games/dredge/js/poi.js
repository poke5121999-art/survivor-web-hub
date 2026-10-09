/*
 * Điểm kiểm tra trên biển (InspectPOI, V17): phao, xác tàu, bia đá, kho bờ biển. Dữ liệu data/poi.js do tools/poi.py bóc từ Game.unity.
 *
 * Gốc (PlayerPOIInteraction.OnPOIsChanged, InspectPOIHandler, InteractPointUI, ConversationPOI):
 *   - thuyền vào cầu tương tác của điểm (SphereCollider, bán kính r) thì hiện dấu "?" nổi lên 2 m trên điểm (InteractPointUI: appearY 2,
 *     disappearY -0,25, fade 0,75 s OutExpo, sprite inspectSprite = poi-interact-icon trong khung interact-prompt-frame)
 *     và gợi ý "Inspect F" (prompt.inspect) góc phải dưới;
 *   - thứ tự ưu tiên: điểm câu hợp lệ > bến > điểm kiểm tra (flag2 > flag3 > flag5): điểm kiểm tra nhường cả hai;
 *   - F chạy node Yarn (conversationNodeName); chạy xong gỡ khoá và đợi 0,25 s mới nhận F lại (DelayedInputReenable);
 *   - ConversationPOI.RefreshStatus: ẩn điểm khi isOneTimeOnly và đã thăm node, hoặc đã thăm một node trong otherNodeNames
 *     (kho bờ biển: node `<tên>_Emptied` chạy khi lưới Found Items trống); chỉ hiện khi mọi enableNodeNames đã thăm.
 *   - Xác tàu: node Yarn có lệnh ShowQuestGrid <Tên>ShoreCache<n>: lưới Found Items (REVISITABLE, isSaved) mở bằng DRCargo.open
 *     (bảng trái "Found Items" + khoang bên phải), đồ lấy rồi thì không còn khi quay lại, kết quả 1 khi lưới trống.
 *
 *   DRPoi._debug() → { near, shown, prop, active, prompt, marker, points, enabledNow }    DRPoi.start(id)    DRPoi.enabled(point)
 *
 * Mối nối đã dùng (không sửa tệp nào của chủ khác): DRDialogue.start, DRYarn.visited/hasNode, DRCargo.open, DRCamera.cam (chiếu dấu "?"),
 *   DR.view.nearSpot / nearDock (nhường ưu tiên). Hai chỗ bọc lúc chạy, chỉ có tác dụng khi một cuộc kiểm tra đang diễn ra:
 *   DRInput.axes trả 0 (lớp input DIALOGUE khoá lái: InspectPOIHandler.StartDialogue → SetActiveActionLayer) và DRStoryGrid.show
 *   đổi sang DRCargo.open (bản rút gọn trong dialogue.js chỉ có nút "Cất vào khoang").
 * [ĐỀ XUẤT] camera ảo của điểm (InspectPOI_VCam, camera trôi gần phao khi đọc) chưa dựng: camera vẫn bám thuyền.
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  const base = f => new URL('../' + f + ver, (me && me.src) || location.href).href;
  if (!document.querySelector('link[href*="poi.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base('css/poi.css'); document.head.appendChild(l);
  }
  const P = (root.DR_POI && root.DR_POI.points) || [];
  const BOAT_R = 1.5;            // [ĐỀ XUẤT] nửa bề ngang thân thuyền: collider của người chơi chạm cầu tương tác sớm hơn tâm thuyền
  const FADE = 0.75;             // InteractPointUI.fadeDurationSec
  const APPEAR_Y = 2, DISAPPEAR_Y = -0.25;
  const MARK_M = 1.1;            // [ĐỀ XUẤT] đường kính khung dấu "?" trong thế giới (m), đo bằng mắt trên clip ObBBFGMem5U t=166
  const REENABLE = 0.25;         // InspectPOIHandler.DelayedInputReenable
  const VI = { 'Found Items': 'Đồ tìm thấy', 'Old Wreck': 'Xác tàu cũ' };      // tiêu đề bảng trái (QuestGridConfig.titleString)
  const visited = n => !!(root.DRYarn && DRYarn.visited(n));
  const dist = p => { const b = DR.s.boat; return Math.hypot(b.x - p.x, b.z - p.z); };
  const outExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);                  // DOTween Ease.OutExpo

  let host = null, mk = null, prompt = null;
  let near = null, shown = null, active = null, lockUntil = 0;
  let prop = 0, from = 0, to = 0, tw = 0;                                      // tween prop của InteractPointUI
  let T3 = null;

  // ConversationPOI.RefreshStatus
  function enabled(p) {
    if (p.once && visited(p.node)) return false;
    if (p.needs.length && !p.needs.every(visited)) return false;
    if (p.hideAfter.some(visited)) return false;
    return !!(root.DRYarn && DRYarn.hasNode(p.node));
  }

  function build() {
    if (host) return;
    host = document.createElement('div'); host.id = 'dr-poi';
    mk = document.createElement('div'); mk.className = 'poi-mk';
    mk.innerHTML = '<img class="fr" alt="" src="' + base('art/ui/sprites/interact-prompt-frame.webp') + '"><img class="ic" alt="" src="' +
      base('art/ui/sprites/poi-interact-icon.webp') + '">';
    host.appendChild(mk);
    document.body.appendChild(host);
    // gợi ý như HUD (cùng kiểu .hud-prompt, nằm trong #dr-hud để dùng chung --hu)
    prompt = document.createElement('div'); prompt.className = 'hud-prompt poi-prompt';
    prompt.innerHTML = '<b data-orig="' + ((root.DR_STR && DR_STR['prompt.inspect']) || 'Inspect') + '">Kiểm tra <kbd>F</kbd></b>';
    prompt.onclick = () => start(near);
    (document.getElementById('dr-hud') || document.body).appendChild(prompt);
  }

  const paused = () => { const e = document.getElementById('dr-pause'); return !!e && !e.hidden; };
  const idle = () => !!DR.s && DR.mode === 'sail' && !active && performance.now() >= lockUntil && !paused() &&
    !(root.DRDialogue && DRDialogue.isOpen()) && !(root.DRCargo && DRCargo.isOpen()) && !(root.DRIntro && DRIntro.playing);

  function pick() {
    const v = DR.view || {}, sp = v.nearSpot;
    if ((sp && (!sp.status || sp.status === 'ok')) || v.nearDock) return null;      // flag2 / flag3 thắng flag5
    let best = null, bd = 1e9;
    for (const p of P) {
      const d = dist(p);
      if (d > p.r + BOAT_R || d >= bd || !enabled(p)) continue;
      best = p; bd = d;
    }
    return best;
  }

  function start(p) {
    if (!p || p !== near || !idle() || !root.DRDialogue) return false;
    active = p;
    DR.emit('poiInspect', p.id, p.node);                                    // người nghe âm thanh / thống kê (chưa ai dùng)
    const done = () => { active = null; lockUntil = performance.now() + REENABLE * 1000; };
    let r = null;
    try { r = DRDialogue.start(p.node, { onEnd: done }); } catch (e) { console.warn('[poi] dialogue failed:', e.message); }
    if (!r && active && !DRDialogue.isOpen()) done();                       // node rỗng: DRYarn.run đã gọi onEnd, hoặc lỗi
    return true;
  }

  // ---- bọc lúc chạy: chỉ tác động khi `active` -------------------------------------------------------------------------------
  function wrap() {
    if (root.DRInput && DRInput.axes && !DRInput.axes._poi) {
      const o = DRInput.axes;
      DRInput.axes = () => active ? { x: 0, y: 0 } : o();
      DRInput.axes._poi = true;
    }
    if (root.DRStoryGrid && DRStoryGrid.show && !DRStoryGrid.show._poi) {
      const o = DRStoryGrid.show;
      DRStoryGrid.show = function (name, cb) {
        const q = ((root.DR_QUESTS || {}).QuestGridConfig || {})[name];
        const ok = active && root.DRCargo && DR.s && q && q.isSaved && q.questGridExitMode === 'REVISITABLE' && q.presetGridMode === 'CREATE' &&
          (q.completeConditions || []).every(c => c._t === 'EmptyCondition');
        if (!ok) return o.call(this, name, cb);
        const h = DRCargo.open({
          right: { tabs: ['INVENTORY'] },
          left: { kind: 'quest', quest: q, title: VI[q.titleString] || q.titleString },
          onClose: res => cb(res && res.complete ? 1 : 0)                   // QuestGridResult: 1 = COMPLETE (lưới trống), 0 = INCOMPLETE
        });
        if (!h) return o.call(this, name, cb);
      };
      DRStoryGrid.show._poi = true;
    }
  }

  // F: bắt ở pha capture để main.js (câu / cập bến) không chạy cùng lúc, và để F không rò vào main.js khi hội thoại đang mở.
  root.addEventListener('keydown', e => {
    if (e.code !== 'KeyF' || !host || !root.DR || !DR.s) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (active) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!e.repeat && near && idle() && start(near)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  if (root.DRInput && DRInput.on) DRInput.on('interact', () => { if (near && !active) start(near); });     // tay cầm / nút cảm ứng (không qua phím F)

  // ---- mỗi khung: chọn điểm, dấu "?" và gợi ý ------------------------------------------------------------------------------
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (!host || !root.DR || !DR.s) return;
    const want = idle() ? pick() : null;
    if (want !== near) { near = want; if (near) shown = near; }
    const target = near ? 1 : 0;
    if (target !== to) { to = target; from = prop; tw = 0; }
    if (prop !== to) {
      tw = Math.min(1, tw + dt / FADE);
      prop = from + (to - from) * outExpo(tw);
      if (tw >= 1) { prop = to; if (!to) shown = null; }
    }
    const hudOn = !!document.querySelector('#dr-hud .hud-prompt.on:not(.poi-prompt)');
    const on = !!near && !hudOn;
    if (prompt.classList.contains('on') !== on) prompt.classList.toggle('on', on);
    renderMarker();
  }

  function renderMarker() {
    const cam = root.DRCamera && DRCamera.cam, T = root.THREE;
    if (!shown || !cam || !T || prop <= 0.003) { if (mk.style.opacity !== '0') mk.style.opacity = '0'; return; }
    T3 = T3 || new T.Vector3();
    const y = DISAPPEAR_Y + (APPEAR_Y - DISAPPEAR_Y) * prop;
    T3.set(shown.x, y, shown.z);
    const dpos = T3.distanceTo(cam.position);
    T3.project(cam);
    if (T3.z > 1 || T3.z < -1) { mk.style.opacity = '0'; return; }
    const W = root.innerWidth, H = root.innerHeight;
    const focal = (H / 2) / Math.tan(cam.fov * Math.PI / 360);
    const px = Math.max(26, Math.min(96, MARK_M * focal / Math.max(dpos, 1)));
    mk.style.opacity = prop.toFixed(3);
    mk.style.width = mk.style.height = px.toFixed(1) + 'px';
    mk.style.transform = 'translate(' + ((T3.x * 0.5 + 0.5) * W - px / 2).toFixed(1) + 'px,' + ((-T3.y * 0.5 + 0.5) * H - px / 2).toFixed(1) + 'px)';
  }

  function init() { build(); wrap(); requestAnimationFrame(frame); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRPoi = {
    start: id => start(P.find(p => p.id === id)),
    enabled, points: P,
    _debug: () => ({ near: near && near.id, shown: shown && shown.id, prop: +prop.toFixed(3), active: active && active.id, prompt: !!prompt && prompt.classList.contains('on'),
      marker: mk ? { opacity: +mk.style.opacity || 0, w: parseFloat(mk.style.width) || 0 } : null, points: P.length,
      enabledNow: root.DR && DR.s ? P.filter(enabled).map(p => p.id) : [] })
  };
})(window);
