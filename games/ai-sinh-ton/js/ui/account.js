// Account deletion panel: a modal over whatever is showing. Warning on the left, the two buttons on the right; HUỶ closes it,
// a continuous 2 s hold on the red button deletes the account (game.deleteAccount, which reloads the game as a new account).
// Design frame 780 x 360. The fill grows while the finger is on the hold button and is back at 0 on release, cancel or when the
// finger leaves the button. A tap, or two short holds, never add up.
export const HOLD_SECS = 2;

export function createAccountPanel(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('account', { modal: true });
  let open = false, hold = null, held = 0;

  scr.put(new THREE.Mesh(new THREE.PlaneGeometry(900, 460), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })), 390, 180, 0);
  scr.put(ui.panel({ w: 580, h: 276, r: 26, color: 0x4a1f3f, depth: 6, bevel: 3, gloss: false }), 100, 42, 1);
  const texts = [];
  const put = (t, x, y, z = 14) => { texts.push(t); scr.put(t, x, y, z); return t; };
  put(ui.text('XOÁ TÀI KHOẢN?', { size: 26, align: 'center', valign: 'mid', color: 0xffd0d0 }), 390, 82);
  put(ui.text('Mất toàn bộ thú, trang bị, vàng, kim cương và tiến trình trên máy này. Không khôi phục được.', { size: 16, align: 'left', maxW: 270, lineH: 23 }), 132, 124);
  put(ui.text('Tài khoản đăng nhập vào hub được giữ nguyên.', { size: 13, align: 'left', maxW: 270, lineH: 19, color: 0xffe9a8, outlineW: 1.4 }), 132, 250);
  const holdBtn = ui.button({ id: 'acct-hold', w: 250, h: 56, r: 18, color: PAL.red, label: 'GIỮ 2 GIÂY ĐỂ XOÁ', size: 17, onTap: () => ui.toast('Giữ nút 2 giây liên tục') }); scr.put(holdBtn, 410, 120, 14);
  const bar = ui.bar({ w: 250, h: 14, color: PAL.gold, value: 0 }); scr.put(bar, 410, 190, 14); bar.set(0, true);
  const cancel = ui.button({ id: 'acct-cancel', w: 250, h: 48, r: 16, color: PAL.blue, label: 'HUỶ', size: 18, onTap: () => hide() }); scr.put(cancel, 410, 232, 14);

  const setHeld = (v) => { held = v; bar.set(v, true); };
  const stop = (e) => { if (hold && (!e || e.pointerId === hold.id)) { hold = null; setHeld(0); } };
  const frameEl = document.getElementById('frame');
  frameEl.addEventListener('pointerdown', (e) => { if (open && !hold && ui.hitAt(e.clientX, e.clientY) === 'acct-hold') hold = { id: e.pointerId, t: 0 }; });
  frameEl.addEventListener('pointermove', (e) => { if (hold && e.pointerId === hold.id && ui.hitAt(e.clientX, e.clientY) !== 'acct-hold') stop(e); });
  frameEl.addEventListener('pointerup', stop); frameEl.addEventListener('pointercancel', stop);

  function show() { open = true; stop(); ui.show('account', { transition: 'pop' }); }
  function hide() { open = false; stop(); ui.hide('account', { transition: 'pop' }); }
  function update(dt) {
    if (!open || !hold) return;
    hold.t += dt; setHeld(Math.min(1, hold.t / HOLD_SECS));
    if (hold.t >= HOLD_SECS) { hold = null; open = false; game.deleteAccount(); }
  }
  game.openAccountDelete = () => show();
  return [{ name: 'account', show, hide, update, dbg() { return { open, hold: held, texts: texts.map((t) => ({ w: t.w * t.scale.x, h: t.h })) }; } }];
}
