// PC: đúng bảng phím gốc SMActions / Gameplay (D:\wos-ref\code\input_bindings.txt, CODE.md §9).
// Move WASD (không có mũi tên: mũi tên chỉ thuộc map UI/Navigate), KeyboardInteractAttack Space, chuột trái đánh theo
// hướng chuột (MouseAimInputSource), Dash + Slot1 = LShift, Slot2..4 = Q/E/R, EquipMonster1..6 = 1..6, Switch C,
// Minimap Tab, WorldMap M, Inventory I, SlimeIndex B, SlimeInventory N, Quest J, Party P, Perk K, Community O,
// Chat Enter, DialogueSkip LCtrl, Escape, CombatMode H. Lăn chuột zoom (CameraController, WheelNotchValue = 120).
// Game gốc không có phím chạy: tốc độ là speedStep = round(|cần| * 10), phím WASD luôn cho |v| = 1 nên PC đi tốc độ tối đa.
export const KEYMAP = {
  Space: ['interactAttack'],
  ShiftLeft: ['dash', 'slot1'],
  KeyQ: ['slot2'], KeyE: ['slot3'], KeyR: ['slot4'],
  Digit1: ['equip0'], Digit2: ['equip1'], Digit3: ['equip2'], Digit4: ['equip3'], Digit5: ['equip4'], Digit6: ['equip5'],
  KeyC: ['switch'], Tab: ['minimap'], KeyM: ['worldmap'], KeyI: ['inventory'], KeyB: ['slimeindex'], KeyN: ['slimeinventory'],
  KeyJ: ['quest'], KeyP: ['party'], KeyK: ['perk'], KeyO: ['community'], Enter: ['chat'], ControlLeft: ['dialogueskip'],
  Escape: ['escape'], KeyH: ['combatmode'],
};

export function attachPC(intent, canvas, { onWheel } = {}) {
  const keys = new Set();
  const update = () => {
    const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    intent.move.x = x / l; intent.move.y = y / l;
  };
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();   // Space cuộn trang, Tab đổi focus
    if (e.repeat) return;
    keys.add(e.code); intent.source = 'pc';
    for (const a of KEYMAP[e.code] || []) intent.pressed.add(a);
    update();
  });
  addEventListener('keyup', e => { keys.delete(e.code); update(); });
  addEventListener('blur', () => { keys.clear(); update(); });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    intent.mouse = { x: e.clientX, y: e.clientY };
    intent.attack = true; intent.pressed.add('attack'); intent.source = 'pc';
  });
  addEventListener('pointerup', e => { if (e.button === 0) intent.attack = false; });
  canvas.addEventListener('pointermove', e => { intent.mouse = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); onWheel && onWheel(e.deltaY / 120); }, { passive: false });
}
