// Mobile: MainJoystick (JoystickPack) bên trái, DefaultAttackButton bên phải, dash/huýt/skill quanh nút đánh,
// chụm hai ngón để zoom (CameraController.CollectPinchTouchPositions). Sprite thật từ ui/index.json (thư mục Game/).
import { assetUrl } from '../assets.js?v=20261021a';

const SPR = {
  joyBG: 'ui/Game/UI_PlayScene_JoystickBG.webp', joyHandle: 'ui/Game/UI_Joystick_Handle.webp',
  btnBG: 'ui/Game/Icon_ButtonBG01.webp', btnBG2: 'ui/Game/Icon_ButtonBG02.webp', skillBG: 'ui/Game/Icon_ButtonBG_Skill.webp',
  attack: 'ui/Game/Icon_Attack.webp', dash: 'ui/Game/Icon_Dash.webp', whistle: 'ui/Game/Icon_Whistle.webp',
};

function el(tag, cls, parent, style = {}) {
  const e = document.createElement(tag); e.className = cls; Object.assign(e.style, style); parent.appendChild(e); return e;
}

export function attachMobile(intent, root, { onPinch } = {}) {
  const ui = el('div', 'm-ui', root);
  // cần điều khiển: nền 150 px, tay cầm 70 px, bán kính 55 px
  const joy = el('div', 'm-joy', ui);
  const bg = el('img', 'm-joy-bg', joy); bg.src = assetUrl(SPR.joyBG); bg.draggable = false;
  const hd = el('img', 'm-joy-hd', joy); hd.src = assetUrl(SPR.joyHandle); hd.draggable = false;
  const R = 55;
  let joyId = null, cx = 0, cy = 0;
  const setHandle = (dx, dy) => { hd.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const joyStart = e => {
    for (const t of e.changedTouches) {
      if (joyId !== null) break;
      joyId = t.identifier;
      const r = bg.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      joyMove(e);
    }
    e.preventDefault();
  };
  const joyMove = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      setHandle(dx, dy);
      intent.move.x = dx / R; intent.move.y = -dy / R; intent.source = 'touch';
      // đẩy hết cần (> 0.95) thì chạy [ĐỀ XUẤT]: game mobile dùng speedStep 0..10 theo độ đẩy
      intent.run = Math.hypot(dx, dy) / R > 0.95;
    }
    e.preventDefault();
  };
  const joyEnd = e => {
    for (const t of e.changedTouches) if (t.identifier === joyId) {
      joyId = null; setHandle(0, 0); intent.move.x = intent.move.y = 0; intent.run = false;
    }
  };
  joy.addEventListener('touchstart', joyStart, { passive: false });
  addEventListener('touchmove', e => { if (joyId !== null) joyMove(e); }, { passive: false });
  addEventListener('touchend', joyEnd); addEventListener('touchcancel', joyEnd);

  // nút bên phải
  const button = (cls, bgSrc, icon, name, hold) => {
    const b = el('div', 'm-btn ' + cls, ui);
    const i0 = el('img', 'm-btn-bg', b); i0.src = assetUrl(bgSrc); i0.draggable = false;
    if (icon) { const i1 = el('img', 'm-btn-ic', b); i1.src = assetUrl(icon); i1.draggable = false; }
    b.addEventListener('touchstart', e => { intent.pressed.add(name); if (hold) intent[hold] = true; b.classList.add('on'); intent.source = 'touch'; e.preventDefault(); }, { passive: false });
    const up = () => { if (hold) intent[hold] = false; b.classList.remove('on'); };
    b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    return b;
  };
  button('m-attack', SPR.btnBG, SPR.attack, 'attack', 'attack');
  button('m-dash', SPR.btnBG2, SPR.dash, 'dash');
  button('m-whistle', SPR.btnBG2, SPR.whistle, 'whistle');
  ['m-sk0', 'm-sk1', 'm-sk2'].forEach((c, i) => button('m-skill ' + c, SPR.skillBG, null, 'skill' + i));

  // chụm zoom: hai ngón trên vùng trống (không phải cần/nút)
  const pinch = new Map(); let lastD = 0;
  root.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) if (!t.target.closest('.m-joy, .m-btn')) pinch.set(t.identifier, t);
    if (pinch.size === 2) { const [a, b] = [...pinch.values()]; lastD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (pinch.has(t.identifier)) pinch.set(t.identifier, t);
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (lastD > 0 && onPinch) onPinch(lastD / d);
      lastD = d;
    }
  }, { passive: true });
  const pend = e => { for (const t of e.changedTouches) pinch.delete(t.identifier); if (pinch.size < 2) lastD = 0; };
  root.addEventListener('touchend', pend); root.addEventListener('touchcancel', pend);
  return ui;
}
