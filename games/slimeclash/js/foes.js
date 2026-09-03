/*
 * SlimeClash — danh sách quái.
 *
 * `slug` là tên gốc trong APK (res/enemyicon/<slug>.bytes) — đó là khoá tra ảnh, không đổi.
 * `name` là tên tiếng Việt TÔI ĐẶT để hiển thị; bản gốc chỉ có id chuỗi chưa giải mã được
 * (mục 8 của _research/slime-legion-apk-datamine.md), nên đây KHÔNG phải tên chính chủ.
 * `boss: true` = con đủ hầm hố để đứng ngày 5 và ngày 10.
 *
 * Muốn thay ảnh: thay assets/enemies/<slug>.png rồi chạy lại script sinh asset-map.
 * Muốn thêm quái: thêm một dòng ở đây, không đụng code chỗ khác.
 */
(function (root) {
  'use strict';

  var LIST = [
    { slug: 'academydoll',          name: 'Búp bê học viện' },
    { slug: 'ace',                  name: 'Át chủ bài' },
    { slug: 'acrobaticmonkey',      name: 'Khỉ nhào lộn' },
    { slug: 'acrobaticpirate',      name: 'Cướp biển nhào lộn' },
    { slug: 'adultchimera',         name: 'Chimera trưởng thành', boss: true },
    { slug: 'adultpegasus',         name: 'Thiên mã trưởng thành' },
    { slug: 'alin',                 name: 'A Lâm' },
    { slug: 'anbuninja',            name: 'Ninja mật vụ' },
    { slug: 'ancienttreearcher',    name: 'Cung thủ cây cổ' },
    { slug: 'ancienttreeassassin',  name: 'Sát thủ cây cổ' },
    { slug: 'ancienttreeelf',       name: 'Tinh linh cây cổ' },
    { slug: 'ancienttreeguard',     name: 'Vệ binh cây cổ' },
    { slug: 'ancienttreeguard1',    name: 'Vệ binh cây cổ II' },
    { slug: 'ancientwarrior',       name: 'Chiến binh cổ đại' },
    { slug: 'angel',                name: 'Thiên thần' },
    { slug: 'angelcommander',       name: 'Thống lĩnh thiên thần', boss: true },
    { slug: 'anubis',               name: 'Anubis', boss: true },
    { slug: 'apegod',               name: 'Viên thần', boss: true },
    { slug: 'apollo',               name: 'Apollo', boss: true },
    { slug: 'babychimera',          name: 'Chimera non' },
    { slug: 'bahamut',              name: 'Bahamut', boss: true },
    { slug: 'balloonpirate',        name: 'Cướp biển bóng bay' },
    { slug: 'barbarianwarrior',     name: 'Chiến binh man tộc' },
    { slug: 'bombpirate',           name: 'Cướp biển bom' },
    { slug: 'burningninja',         name: 'Ninja lửa' },
    { slug: 'cactus',               name: 'Xương rồng' },
    { slug: 'calamitybird',         name: 'Chim tai ương', boss: true },
    { slug: 'captainangel',         name: 'Đội trưởng thiên thần' },
    { slug: 'carrotelf',            name: 'Tinh linh cà rốt' },
    { slug: 'cavalrycaptain',       name: 'Đội trưởng kỵ binh' },
    { slug: 'cavalrygeneral',       name: 'Tướng kỵ binh', boss: true },
    { slug: 'charizard',            name: 'Rồng lửa', boss: true },
    { slug: 'chimeralord',          name: 'Chúa tể Chimera', boss: true },
    { slug: 'chosenbelievers',      name: 'Tín đồ được chọn' },
    { slug: 'claypotflyingcarpet',  name: 'Thảm bay hũ sành' },
    { slug: 'collegeowl',           name: 'Cú học đường' },
    { slug: 'crazymage',            name: 'Pháp sư điên' },
    { slug: 'crystalbeast',         name: 'Thú pha lê', boss: true },
    { slug: 'cuttlefish',           name: 'Mực khổng lồ' },
    { slug: 'cuttlefishonvacation', name: 'Mực đi nghỉ mát' },
    { slug: 'defensewarrior',       name: 'Chiến binh thủ' },
    { slug: 'desertmage',           name: 'Pháp sư sa mạc' },
    { slug: 'divinityofficer',      name: 'Thần quan', boss: true },
    { slug: 'djduck',               name: 'Vịt DJ' },
    { slug: 'doublebladedsamurai',  name: 'Samurai song kiếm' },
    { slug: 'doubleshieldknight',   name: 'Hiệp sĩ song khiên' },
    { slug: 'doubleshieldpirate',   name: 'Cướp biển song khiên' },
    { slug: 'dualswordpirate',      name: 'Cướp biển song đao' }
  ];

  // Chỉ giữ những con THẬT SỰ có ảnh — thiếu ảnh thì quái không có mặt mũi, thà bỏ.
  function usable() {
    if (!root.Atlas) return LIST;
    return LIST.filter(function (f) { return root.Atlas.has('foe.' + f.slug); });
  }

  /* Chọn quái cho (chương, ngày) — tất định, cùng chương-ngày luôn ra cùng con. */
  function pick(chapter, day, isBoss) {
    var pool = usable().filter(function (f) { return !!f.boss === !!isBoss; });
    if (!pool.length) pool = usable();
    if (!pool.length) return { slug: null, name: 'Quái' };
    var i = (chapter * 31 + day * 7) % pool.length;
    return pool[i];
  }

  root.FOES = { list: LIST, usable: usable, pick: pick };
  if (typeof module === 'object' && module.exports) module.exports = root.FOES;
})(typeof window !== 'undefined' ? window : globalThis);
