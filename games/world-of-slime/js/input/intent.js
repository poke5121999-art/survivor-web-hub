// Một mô hình ý định chung cho PC và mobile (giống MainJoystick.FixedUpdate: cả hai đường cùng gửi MoveRequest).
// move: vec2 trên màn hình (x phải, y lên = +z thế giới), độ lớn 0..1. Các nút còn lại là bool, *Pressed bật một khung.
export function makeIntent() {
  return {
    move: { x: 0, y: 0 }, run: false, attack: false, skill: [false, false, false], dash: false, whistle: false, interact: false,
    aim: null,              // { x, z } toạ độ Unity điểm chuột chỉ trên mặt đất (PC), null nếu không có
    pressed: new Set(),     // tên nút vừa nhấn trong khung này: 'attack','dash','whistle','interact','skill0'..
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

export function endFrame(intent) { intent.pressed.clear(); }
