// Bảng thợ lặn. Mọi người lặn dùng sheet Dave (../ho-xanh/art/dave/dave.png), khác nhau ở bảng màu (pal),
// súng xiên (gun = tên ảnh trong ../ho-xanh/art/dave/harpoon/<gun>.png) và kỹ năng.
// pal theo cách đổi màu của games/biet-doi-lan/js/mates.js (genSheet): suit = độ màu (0-360) của đồ lặn,
// head = mũ trùm, gear = bình + chân vịt, stripe = vạch trên bình, detail = chi tiết trên đầu (bow|cap|hat|chef|halo), dc = màu chi tiết.
// pal null = giữ nguyên màu gốc của Dave.
// o2: dưỡng khí tối đa, cũng là máu. speed: m/s. dmg: máu cá mập trừ mỗi phát xiên. reload: giây giữa hai phát.
(function (VS) {
  VS.DIVERS = {
    dave: {
      name: 'Dave', rarity: 3, o2: 100, speed: 2.6, gun: 'HarpoonGun', dmg: 24, reload: 1.0, skill: 'binh-o2',
      pal: null,
      blurb: 'Lặn vì cá, ở lại vì sushi. Luôn mang theo một bình dưỡng khí phụ.'
    },
    hai: {
      name: 'Hải Pháo Sáng', rarity: 3, o2: 100, speed: 2.6, gun: 'OldHarpoonGun', dmg: 20, reload: 0.8, skill: 'phao-sang',
      pal: { suit: 2, head: '#2a2a30', gear: '#e04a2a', stripe: '#f2f2f2', detail: 'cap', dc: '#f24a2a' },
      blurb: 'Cựu thợ lặn cứu hộ. Ném pháo sáng là cả vùng biển phải lộ mặt.'
    },
    lan: {
      name: 'Lan Mực', rarity: 3, o2: 105, speed: 2.7, gun: 'PumpHarpoonGun', dmg: 22, reload: 0.9, skill: 'bom-muc',
      pal: { suit: 245, head: '#1e1e2e', gear: '#3b3f8f', stripe: '#c9c9ff', detail: 'bow', dc: '#2b2b6b' },
      blurb: 'Học mẹo của bạch tuộc: phun một đám mực rồi biến mất.'
    },
    bao: {
      name: 'Bảo Lồng Thép', rarity: 4, o2: 115, speed: 2.5, gun: 'MermanHarpoonGun', dmg: 28, reload: 1.1, skill: 'long-thep',
      pal: { suit: 205, head: '#3a3f46', gear: '#9aa0a8', stripe: '#30343a', detail: 'hat', dc: '#5a5f66' },
      blurb: 'Quay phim cá mập ba mươi năm, chưa lần nào ra khỏi lồng.'
    },
    mai: {
      name: 'Mai Lưới', rarity: 4, o2: 100, speed: 2.7, gun: 'HarpoonGun', dmg: 22, reload: 0.9, skill: 'sung-luoi',
      pal: { suit: 150, head: '#2b2b33', gear: '#4e7a3a', stripe: '#d9c27a', detail: 'bow', dc: '#d8283c' },
      blurb: 'Ngư dân ba đời. Lưới của cô giữ được cả cá mập.'
    },
    tung: {
      name: 'Tùng Mìn', rarity: 4, o2: 100, speed: 2.6, gun: 'PumpHarpoonGun', dmg: 24, reload: 1.0, skill: 'min-cam-bien',
      pal: { suit: 40, head: '#4a3a20', gear: '#c98a1b', stripe: '#1e1e1e', detail: 'cap', dc: '#3a3a1a' },
      blurb: 'Gỡ mìn thời chiến, giờ đặt mìn dưới đáy biển.'
    },
    ngoc: {
      name: 'Ngọc Dưỡng Khí', rarity: 4, o2: 110, speed: 2.6, gun: 'HarpoonGun', dmg: 22, reload: 1.0, skill: 'may-o2',
      pal: { suit: 195, head: '#ececf4', gear: '#4fb3d9', stripe: '#ffffff' },
      blurb: 'Kỹ sư khí nén. Đứng gần cô thì không ai phải nín thở.'
    },
    vy: {
      name: 'Vy Mũi Mê', rarity: 5, o2: 100, speed: 2.8, gun: 'NewMVHarpoonGun', dmg: 26, reload: 1.0, skill: 'phi-tieu-me',
      pal: { suit: 290, head: '#5c3c8c', gear: '#c0a0d8', stripe: '#ffffff', detail: 'bow', dc: '#b04fc4' },
      blurb: 'Bác sĩ thú y đại dương. Một mũi tiêm, cá mập ngủ như em bé.'
    },
    khoa: {
      name: 'Khoa Xạ Thủ', rarity: 5, o2: 100, speed: 2.6, gun: 'NewMVHarpoonGun', dmg: 34, reload: 1.4, skill: 'ong-ngam',
      pal: { suit: 220, head: '#1a1a1f', gear: '#2e2e36', stripe: '#d03030', detail: 'cap', dc: '#202024' },
      blurb: 'Không bao giờ bắn phát thứ hai.'
    },
    linh: {
      name: 'Linh Tốc Hành', rarity: 5, o2: 105, speed: 2.8, gun: 'AlloyHarpoonGun', dmg: 30, reload: 1.0, skill: 'may-day',
      pal: { suit: 50, head: '#f4b83a', gear: '#f6f6f6', stripe: '#f0d060', detail: 'halo', dc: '#f8e070' },
      blurb: 'Vô địch lặn tự do. Gắn thêm máy đẩy Utara thì không cá mập nào theo kịp.'
    }
  };
  Object.keys(VS.DIVERS).forEach(function (id) { VS.DIVERS[id].id = id; });
})(window.VS = window.VS || {});
