// Mọi con số chỉnh được của trận và kinh tế. Đơn vị: mét, giây, m/s. O₂ thợ lặn đầy = o2 trong data/divers.js.
// Đổi số ở đây, không rải hằng số trong js/.
// Tốc độ: max = def.speed × các hệ số hiệu ứng (sàn effects.slowFloor). accel (1/s) là tốc độ vận tốc tiến về
// vận tốc mong muốn (v += (muốn − v) × min(1, accel × dt)); drag (1/s) là hãm khi không bấm hướng.
(function (VS) {
  VS.TUNING = {
    match: {
      divers: 4, sharks: 2,
      intro: 4,            // s đếm ngược trước khi thả người (đếm bằng phaseT, m.t vẫn là 0)
      length: 240,         // s chơi; m.t chỉ đếm thời gian chơi, hết khi m.t >= length
      tickets: 4,          // lượt hồi sinh chung của đội thợ lặn
      targetPct: 0.6,      // chỉ tiêu = tỉ lệ này × tổng giá trị kho báu của trận
      spawnImmune: 3       // s miễn sát thương sau khi sinh hoặc hồi sinh (cả hai phe)
    },
    diver: {
      r: 0.3,
      accel: 6, drag: 2.6,
      boostMul: 1.4, boostDrainMul: 2.5,
      o2Drain: 0.6,        // O₂/s khi bơi thường: bình 100 cạn sau ~167 s, phải ghé rương O₂
      downT: 12,           // s nằm gục chờ cứu
      reviveT: 2, reviveO2: 35, interactR: 1.6,   // cứu tự động: đồng đội đứng trong interactR đủ reviveT giây liền
      respawnT: 7,
      kgSlow: 0.02,        // mỗi kg mang theo trừ 2% tốc độ
      maxKg: 20,
      harpoonRange: 9, harpoonSpeed: 18,
      harpoonSlow: 0.3, harpoonSlowT: 0.5,
      iframes: 1.2,        // s miễn bị cắn, tính từ lúc được nhả ra (không phải lúc bị cắn)
      struggleCut: 0.15    // mỗi lần đổi chiều mx khi bị ngậm, thời gian ngậm còn lại giảm chừng này
    },
    shark: {
      turnRate: 3.2,       // rad/s
      accel: 3, drag: 1.6,
      biteCd: 1.6, lungeT: 0.35, biteReach: 0.6,
      holdT: 1.5,          // s ngậm thợ lặn sau cú cắn trúng; con khác không cắn được người đang bị ngậm
      holdDrain: 12,       // O₂/s khi đang bị ngậm
      staminaMax: 100,
      staminaUse: 45,      // mỗi giây phóng (giữ boost)
      staminaRegen: 22,    // mỗi giây không phóng
      outT: 8,
      regen: 6, regenDelay: 5,
      creditWindow: 10     // s: cá mập cuối cùng làm mất O₂ trong khoảng này được tính công hạ gục
    },
    effects: {
      slowFloor: 0.4,      // tốc độ không xuống dưới 40% dù chồng bao nhiêu hiệu ứng chậm (chậm lấy max, không cộng)
      slowImmune: 2,       // s miễn chậm sau khi một hiệu ứng chậm hết
      ccImmune: 2          // s miễn choáng/ngủ/bị ngậm sau khi một cái như thế hết
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
    pod: {
      r: 2.0,              // thợ lặn đang bơi (st 'swim') chạm vào là nộp hết kho báu đang mang
      safeR: 5             // cá mập không vào được trong bán kính này quanh khoang (chống canh cửa)
    },
    vision: {
      beamAngle: 60, beamRange: 13, beamRays: 48,
      selfGlow: 2.0, podGlow: 5, o2Glow: 2.5,
      sharkSense: 7,
      beacon: 18,          // cá mập thấy thợ lặn đang bật đèn trong 18 m nếu không bị vách che
      bloodPct: 0.3, bloodRange: 30,
      // độ sáng còn lại ngoài vùng thấy được, theo chủ đề bản đồ; thợ lặn vẫn lờ mờ thấy vách để đi đường
      dark: { day: 0.18, kelp: 0.14, evening: 0.14, rain: 0.12, night: 0.08 },
      sharkDark: 0.35      // cá mập thấy địa hình rõ hơn; thợ lặn vẫn ẩn nếu cá mập không "thấy" theo luật
    },
    economy: {
      start: 3200,         // ngọc trai lúc mới chơi
      win: 140, lose: 60,
      perPoint: 10,        // ngọc trai mỗi điểm: thợ lặn 1 điểm mỗi 50 kho báu nộp + 1 mỗi lần cứu; cá mập 1 điểm mỗi thợ lặn hạ gục
      pointCap: 80,        // trần ngọc trai từ điểm
      firstWin: 200,       // thắng trận đầu mỗi ngày
      dupeRefund: { 3: 10, 4: 60, 5: 400 }   // quay trùng nhân vật đã có thì đổi ra ngọc trai theo bậc sao
    },
    bots: {
      think: 0.25,         // s giữa hai lần nghĩ
      aimError: 0.12,      // rad lệch tay khi bắn
      reaction: 0.35       // s từ lúc thấy tới lúc phản ứng
    }
  };
})(window.VS = window.VS || {});
