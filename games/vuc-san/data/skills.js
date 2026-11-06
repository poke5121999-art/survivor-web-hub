// Số của từng kỹ năng. Hành vi nằm ở js/sim/skills.js, khoá theo đúng id này; mọi con số chỉnh ở đây.
// cd: hồi chiêu (s). dur: thời gian hiệu lực (s). r: bán kính (m). Các khoá còn lại đọc theo tên ở desc.
// icon: 'hx:' = ../ho-xanh/, 'bdl:' = ../biet-doi-lan/, null = HUD tự vẽ ký hiệu.
(function (VS) {
  VS.SKILL_DATA = {
    // ---- cá mập ----
    'lao-vut': { team: 'shark', name: 'Lao Vút', cd: 9, dur: 1.8, speedMul: 1.8, refillStamina: true, resetBite: true, icon: null,
      desc: 'Tăng tốc gấp 1,8 trong 1,8 giây, nạp đầy sức phóng và cắn được ngay.' },
    'lach-khe': { team: 'shark', name: 'Lách Khe', cd: 16, dur: 5, rMul: 0.55, speedMul: 1.1, icon: null,
      desc: 'Ép mình nhỏ lại còn 55% trong 5 giây, chui lọt khe thợ lặn đang trốn. Hết giờ mà chưa ra chỗ đủ rộng thì vẫn nhỏ tới khi ra.' },
    'lua-bay': { team: 'shark', name: 'Lùa Bầy', cd: 20, dur: 8, r: 3.2, range: 10, slow: 0.3, icon: null,
      desc: 'Lùa một khối cá mòi tới chỗ ngắm (tối đa 10 m): chặn ánh đèn, thợ lặn bên trong chậm 30%.' },
    'an-day': { team: 'shark', name: 'Ẩn Đáy', cd: 18, dur: 6, revealR: 2.5, ambushStun: 1.0, icon: null,
      desc: 'Tàng hình 6 giây, chỉ lộ khi thợ lặn ở trong 2,5 m. Cú cắn đầu tiên làm choáng 1 giây.' },
    'toc-bien': { team: 'shark', name: 'Tốc Biến', cd: 14, dur: 2.5, speedMul: 2.2, biteMul: 1.6, icon: null,
      desc: 'Tăng tốc gấp 2,2 trong 2,5 giây; cú cắn kế tiếp mạnh gấp 1,6.' },
    'quat-duoi': { team: 'shark', name: 'Quất Đuôi', cd: 12, r: 4.5, arc: 140, stun: 0.8, push: 6, lightOff: 4, icon: null,
      desc: 'Quất đuôi theo cung 140° bán kính 4,5 m: choáng 0,8 giây, hất văng, đèn pin tắt 4 giây.' },
    'cua-xe': { team: 'shark', name: 'Cưa Xẻ', cd: 12, dist: 6, width: 1.4, dmg: 18, bleed: 4, bleedDur: 5, icon: null,
      desc: 'Lao 6 m cưa mọi thứ trên đường: trừ 18 O₂, chảy máu mất 4 O₂/giây trong 5 giây, phá lưới và lồng.' },
    'khoet-thit': { team: 'shark', name: 'Khoét Thịt', cd: 15, range: 4, dur: 5, drain: 8, shakeT: 1.2, icon: null,
      desc: 'Bám vào thợ lặn trong 4 m, hút 8 O₂/giây tới 5 giây. Thợ lặn tăng tốc liền 1,2 giây hoặc đồng đội bắn trúng con cá mập thì nó rơi ra.' },
    'nuot-chung': { team: 'shark', name: 'Nuốt Chửng', cd: 20, range: 3, lowO2: 20, heal: 0.3, armor: 0.4, dur: 6, icon: null,
      desc: 'Nuốt thợ lặn đang gục hoặc còn dưới 20 O₂ trong 3 m (loại luôn) và hồi 30% máu; không có ai thì giáp 40% trong 6 giây.' },
    'cam-dien': { team: 'shark', name: 'Cảm Điện', cd: 22, dur: 5, icon: null,
      desc: 'Cả đội cá mập thấy mọi thợ lặn trên bản đồ, xuyên vách, trong 5 giây; trừ người đang trong đám mực hoặc lồng thép.' },
    'vo-ran': { team: 'shark', name: 'Vồ Rắn', cd: 13, dist: 9, speed: 18, pull: 4, stun: 0.8, icon: null,
      desc: 'Phóng hàm xa 9 m; thợ lặn đầu tiên trúng bị kéo về 4 m và choáng 0,8 giây.' },
    'hut-nuoc': { team: 'shark', name: 'Hút Nước', cd: 18, dur: 2.5, range: 8, arc: 70, pullSpeed: 2.5, icon: null,
      desc: 'Hút nước theo nón 70° dài 8 m trong 2,5 giây: kéo thợ lặn về miệng và giật kho báu họ đang mang rơi ra tại chỗ.' },

    // ---- thợ lặn ----
    'binh-o2': { team: 'diver', name: 'Bình O₂ Phụ', cd: 24, o2: 40, icon: 'hx:art/gear/icon/SubO2Tank_Thumbnail.png',
      desc: 'Nạp ngay 40 O₂.' },
    'phao-sang': { team: 'diver', name: 'Pháo Sáng', cd: 18, dur: 8, r: 10, range: 9, slow: 0.2, icon: null,
      desc: 'Ném pháo sáng xa 9 m: soi sáng bán kính 10 m trong 8 giây, cá mập trong vùng sáng chậm 20%.' },
    'bom-muc': { team: 'diver', name: 'Bom Mực', cd: 20, dur: 6, r: 3.5, icon: 'bdl:art/dtd/icon/InkBomb_Thumbnail.png',
      desc: 'Phun đám mực bán kính 3,5 m tại chỗ trong 6 giây: chặn ánh sáng, cá mập bên trong mù hẳn.' },
    'long-thep': { team: 'diver', name: 'Lồng Cá Mập', cd: 26, dur: 6, r: 2.2, o2Regen: 2, icon: null,
      desc: 'Thả lồng thép bán kính 2,2 m trong 6 giây: cá mập không vào được, thợ lặn bên trong hồi 2 O₂/giây.' },
    'sung-luoi': { team: 'diver', name: 'Súng Lưới', cd: 14, speed: 12, range: 10, slow: 0.6, dur: 3, icon: 'hx:art/gear/icon/NetGun_Thumbnail.png',
      desc: 'Bắn lưới xa 10 m: cá mập trúng lưới chậm 60% và không lao được trong 3 giây.' },
    'min-cam-bien': { team: 'diver', name: 'Mìn Cảm Biến', cd: 16, charges: 2, r: 2.5, dmg: 60, stun: 1.5, life: 40, icon: 'bdl:art/dtd/icon/Trap_SensorBomb_Thumbnail.png',
      desc: 'Đặt mìn (giữ tối đa 2 quả): cá mập vào trong 2,5 m thì nổ, mất 60 máu và choáng 1,5 giây.' },
    'may-o2': { team: 'diver', name: 'Máy Tạo O₂', cd: 24, dur: 8, r: 4, o2Regen: 6, reviveMul: 2, icon: 'bdl:art/dtd/icon/OxygenGenerator_Thumbnail.png',
      desc: 'Đặt máy tạo O₂ 8 giây: đồng đội trong 4 m hồi 6 O₂/giây, cứu người nhanh gấp đôi.' },
    'phi-tieu-me': { team: 'diver', name: 'Phi Tiêu Mê', cd: 20, speed: 16, range: 12, sleep: 3, reveal: 10, icon: 'hx:art/gear/icon/SleepGun_Thumbnail.png',
      desc: 'Bắn phi tiêu mê xa 12 m: cá mập trúng ngủ 3 giây (trúng đòn khác thì tỉnh) và bị cả đội thấy trong 10 giây.' },
    'ong-ngam': { team: 'diver', name: 'Ống Ngắm', cd: 16, window: 4, rangeMul: 2, beamMul: 1.5, dmg: 70, icon: 'hx:art/gear/icon/Sniper_Thumbnail.png',
      desc: 'Trong 4 giây, đèn pin soi xa gấp rưỡi và phát xiên kế tiếp bay xa gấp đôi, trừ 70 máu, xuyên qua mục tiêu.' },
    'may-day': { team: 'diver', name: 'Máy Đẩy Utara', cd: 22, dur: 4, speedMul: 1.9, icon: 'bdl:art/dtd/icon/UtaraPowerBooster_Thumbnail.png',
      desc: 'Bơi nhanh gấp 1,9 trong 4 giây, không bị cắn giữ, bám hay kéo.' }
  };
  Object.keys(VS.SKILL_DATA).forEach(function (id) { VS.SKILL_DATA[id].id = id; });
})(window.VS = window.VS || {});
