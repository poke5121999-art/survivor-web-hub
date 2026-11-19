export function createInput(canvas) {
  const keys = new Set();
  const I = { keys, dx: 0, dy: 0, wheel: 0, grab: false, grabPressed: false, locked: false, pressed: new Set() };
  addEventListener('keydown', (e) => { if (!keys.has(e.code)) I.pressed.add(e.code); keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); I.grab = false; I.melee = false; });
  canvas.addEventListener('click', () => { if (!I.locked) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === canvas; if (!I.locked) I.grab = false; });
  addEventListener('mousemove', (e) => { if (I.locked) { I.dx += e.movementX; I.dy += e.movementY; } });
  addEventListener('mousedown', (e) => { if (I.locked && e.button === 0) { I.grab = true; I.grabPressed = true; } if (I.locked && e.button === 2) I.melee = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) I.grab = false; if (e.button === 2) I.melee = false; });
  addEventListener('contextmenu', (e) => { if (I.locked) e.preventDefault(); });   // right mouse: melee (js/melee.js)
  addEventListener('wheel', (e) => { if (I.locked) I.wheel += Math.sign(e.deltaY); }, { passive: true });
  I.down = (code) => keys.has(code);
  I.tap = (code) => I.pressed.has(code);
  I.endFrame = () => { I.dx = 0; I.dy = 0; I.wheel = 0; I.grabPressed = false; I.pressed.clear(); };
  return I;
}
