// Một mô hình ý định chung cho PC và mobile (giống MainJoystick.FixedUpdate: cả hai đường cùng gửi MoveRequest).
// move: vec2 trên màn hình (x phải, y lên = +z thế giới), độ lớn 0..1 (PC luôn 0 hoặc 1, cần ảo thì theo độ đẩy).
// pressed: tên hành động SMActions vừa nhấn trong khung này ('interactAttack', 'attack' (chuột/nút đánh), 'dash',
// 'slot1'..'slot4', 'equip0'..'equip5', 'switch', 'minimap', 'worldmap', 'inventory', 'slimeindex', 'slimeinventory',
// 'quest', 'party', 'perk', 'community', 'chat', 'dialogueskip', 'escape', 'combatmode', 'return' (nút huýt sáo)).
export function makeIntent() {
  return {
    move: { x: 0, y: 0 }, attack: false,
    mouse: null,            // { x, y } px màn hình (PC), để ngắm
    pressed: new Set(),
    released: new Set(),    // F3: hành động vừa nhả (Q/E/R: nhả = ném Cube, như SkillUsePress / SkillUseReleaseRequest)
    source: 'none',
  };
}

// speedStep = round(|v| * 10) (0..10) và handleAngle lượng tử 32 hướng (11.25 độ), CODE.md §8.
export function quantizeMove(move, dirs = 32) {
  const mag = Math.min(1, Math.hypot(move.x, move.y));
  const speedStep = Math.round(mag * 10);
  if (speedStep === 0) return { speedStep: 0, angle: 0, x: 0, y: 0 };
  const step = (Math.PI * 2) / dirs;
  const angle = Math.round(Math.atan2(move.y, move.x) / step) * step;
  return { speedStep, angle, x: Math.cos(angle) * speedStep / 10, y: Math.sin(angle) * speedStep / 10 };
}

export function endFrame(intent) { intent.pressed.clear(); intent.released.clear(); }
