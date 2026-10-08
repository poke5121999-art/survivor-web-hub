// Mọi con số chỉnh được của trận và kinh tế. Đơn vị: mét, giây, m/s. O₂ thợ lặn đầy = o2 trong data/divers.js.
// Đổi số ở đây, không rải hằng số trong js/.
(function (VS) {
  VS.TUNING = {
    match: {
      divers: 4, sharks: 2,
      intro: 4,            // s đếm ngược trước khi thả người
      length: 240,         // s chơi
      tickets: 4,          // lượt hồi sinh chung của đội thợ lặn
      targetPct: 0.6       // chỉ tiêu = tỉ lệ này × tổng giá trị kho báu của trận
    },
    diver: {
      r: 0.3,
      accel: 9, drag: 2.6,
      boostMul: 1.4, boostDrainMul: 2.5,
      dash: 5.5, dashT: 0.32, dashCd: 0.9,
      o2Drain: 0.35,       // O₂/s khi bơi thường
      downT: 12,           // s nằm gục chờ cứu
      reviveT: 2, reviveO2: 35, interactR: 1.6,
      respawnT: 7,
      kgSlow: 0.02,        // mỗi kg mang theo trừ 2% tốc độ
      maxKg: 20,
      harpoonRange: 9, harpoonSpeed: 18,
      harpoonSlow: 0.3, harpoonSlowT: 1.0,
      iframes: 0.8         // s miễn cắn sau một cú cắn
    },
    shark: {
      turnRate: 3.2,       // rad/s
      accel: 7, drag: 1.6,
      biteCd: 1.6, lungeT: 0.35, biteReach: 0.6,
      holdT: 1.5,          // s ngậm thợ lặn sau cú cắn trúng (con mồi giãy hoặc đồng đội bắn thì nhả)
      holdDrain: 12,       // O₂/s khi đang bị ngậm
      staminaMax: 100, staminaUse: 45, staminaRegen: 22,
      outT: 8,
      regen: 6, regenDelay: 5
    },
    loot: {
      count: { A: 12, B: 16, C: 18 },
      tiers: [
        { w: 0.55, value: [40, 80], kg: [2, 4] },
        { w: 0.35, value: [100, 150], kg: [6, 8] },
        { w: 0.10, value: [220, 300], kg: [12, 15] }
      ]
    },
    o2box: { amount: 35, cooldown: 20, r: 1.2 },
    pod: { r: 2.0 },
    vision: {
      beamAngle: 60, beamRange: 13, beamRays: 48,
      selfGlow: 2.0, podGlow: 5, o2Glow: 2.5,
      sharkSense: 7, beacon: 24,
      bloodPct: 0.3, bloodRange: 30,
      dark: 0.08           // độ sáng còn lại ngoài vùng thấy được (0 = đen kịt)
    },
    economy: {
      start: 3200,         // ngọc trai lúc mới chơi
      win: 140, lose: 60,
      perPoint: 10, pointCap: 80,   // điểm = mỗi 100 kho báu nộp (thợ lặn) hoặc mỗi lần hạ (cá mập)
      firstWin: 200        // thắng trận đầu mỗi ngày
    },
    bots: {
      think: 0.25,         // s giữa hai lần nghĩ
      aimError: 0.12,      // rad lệch tay khi bắn
      reaction: 0.35       // s từ lúc thấy tới lúc phản ứng
    }
  };
})(window.VS = window.VS || {});
