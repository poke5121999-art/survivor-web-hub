// Heroes: eleven original fighters. Each kit is a passive, two cooldown skills (F, C) and an ultimate (Q)
// charged by the damage the hero deals, the way hero shooters build a kit; the heroes themselves are ours.
// Voxel bodies for the pick screen and the co-op avatars, sleeves and gloves for the first-person arms.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  // s1 / s2: cd = seconds to recharge one charge, dur = how long an active effect lasts; ult.cost = damage to charge it
  const HEROES = [
    { id: 'gio', name: 'Gió', role: 'Lướt nhanh', color: 0x56c8ff, hp: 100, speed: 1.12,
      passive: 'Chạy nhanh hơn 12%.',
      s1: { key: 'dash', name: 'Lướt', cd: 2.6, charges: 3, desc: 'Lướt 6 m theo hướng đang đi, không mất máu khi lướt, chém mọi zombie trên đường.' },
      s2: { key: 'gust', name: 'Lốc xoáy', cd: 9, desc: 'Thả một cơn lốc lăn về phía trước 13 m, hất tung và quật ngã zombie trên đường.' },
      ult: { key: 'blades', name: 'Trảm Phong', cost: 1600, desc: 'Lao chém liền mạch qua 10 zombie gần nhất trong 20 m, mỗi nhát 160, không ai chạm được bạn.' },
      look: { skin: 0xe8b58a, hair: 0x2a1a10, eye: 0x1a3050, shirt: 0x2f9ad8, shirt2: 0xe8f4ff, pants: 0x2a3140, boot: 0x1c1c22 } },
    { id: 'thep', name: 'Thép', role: 'Lá chắn', color: 0xffc040, hp: 150, speed: 0.94,
      passive: '150 máu. Giáp tự hồi 2 mỗi giây, tới 50.',
      s1: { key: 'invuln', name: 'Khiên vàng', cd: 22, dur: 5, desc: 'Trong 5 giây không mất máu, khiên vàng hất văng và đốt zombie chạm vào người.' },
      s2: { key: 'charge', name: 'Húc', cd: 8, desc: 'Lao thẳng 10 m, húc ngã và đẩy dạt mọi zombie trên đường, chịu ít sát thương khi lao.' },
      ult: { key: 'quake', name: 'Động Đất', cost: 1400, desc: 'Nện đất: zombie trong 12 m ăn tới 340 sát thương, ngã nhào và lạnh cóng.' },
      look: { skin: 0xc8946a, hair: 0x101010, eye: 0x202020, shirt: 0x6a737e, shirt2: 0xffb030, pants: 0x3a3f46, boot: 0x22252a } },
    { id: 'yta', name: 'Y Tá', role: 'Hồi máu', color: 0x60e070, hp: 100, speed: 1,
      passive: 'Không trúng đòn 4 giây thì tự hồi 3 máu mỗi giây. Hồi máu cũng nạp tối thượng.',
      s1: { key: 'heal', name: 'Hồi máu', cd: 15, desc: 'Hồi 50 máu ngay, thêm 30 máu trong 4 giây, lính thuê trong 10 m hồi đầy máu.' },
      s2: { key: 'dart', name: 'Phi tiêu độc', cd: 7, desc: 'Phóng ống tiêm vỡ ra đám khí độc 3,5 m trong 4 giây, zombie trong đó trúng độc dồn.' },
      ult: { key: 'revive', name: 'Hồi Sinh', cost: 1100, desc: 'Cả đội đầy máu, người đã gục đứng dậy ngay; 6 giây sau đó bạn chịu nửa sát thương.' },
      look: { skin: 0xf0c8a0, hair: 0x6a3a1a, eye: 0x3a5a20, shirt: 0xf2f2ee, shirt2: 0xe02a2a, pants: 0x7ab0d8, boot: 0xe8e8e8 } },
    { id: 'mua', name: 'Mưa Đạn', role: 'Xả đạn', color: 0xff7a30, hp: 100, speed: 1,
      passive: 'Nạp đạn nhanh hơn 25%.',
      s1: { key: 'storm', name: 'Bão đạn', cd: 24, dur: 6, desc: 'Trong 6 giây bắn nhanh gấp đôi, không tốn đạn, mỗi phát toả thêm đạn lạc.' },
      s2: { key: 'cluster', name: 'Lựu đạn chùm', cd: 10, desc: 'Ném lựu đạn nổ rồi văng ra 5 quả con nổ tiếp.' },
      ult: { key: 'drones', name: 'Mưa Thép', cost: 1800, desc: 'Hai khẩu súng trên vai tự bắn zombie gần nhất trong 7 giây.' },
      look: { skin: 0xd8a070, hair: 0x2a1a10, eye: 0x101010, shirt: 0x222222, shirt2: 0xd8322a, pants: 0x55663c, boot: 0x2a2018 } },
    { id: 'bong', name: 'Bóng', role: 'Leo tường', color: 0xb070ff, hp: 90, speed: 1.06, wallRun: true, doubleJump: true,
      passive: 'Chạy trên tường, chạy lên tường, đạp tường bật nhảy, nhảy hai lần.',
      s1: { key: 'blink', name: 'Bước bóng', cd: 7, desc: 'Dịch chuyển 9 m, để lại một cái bóng nhử zombie trong 3 giây.' },
      s2: { key: 'shuriken', name: 'Phi tiêu', cd: 5, charges: 2, desc: 'Phóng 3 phi tiêu toả quạt, mỗi chiếc xuyên qua 3 zombie.' },
      ult: { key: 'vanish', name: 'Ám Sát', cost: 1500, desc: 'Tàng hình 7 giây: zombie mất dấu bạn, chạy nhanh hơn, mỗi đòn gây gấp 2,5 và luôn chí mạng.' },
      look: { skin: 0xe0b090, hair: 0x14101c, eye: 0xc080ff, shirt: 0x1c1826, shirt2: 0x8a40e0, pants: 0x18141e, boot: 0x0e0c12, mask: 0x8a40e0 } },
    { id: 'phao', name: 'Pháo Thủ', role: 'Không kích', color: 0xff4a3a, hp: 110, speed: 0.97,
      passive: 'Tên lửa của Pháo Thủ (không kích, Mưa Pháo, bazooka) và mìn nổ to hơn 25%.',
      s1: { key: 'strike', name: 'Không kích', cd: 28, desc: 'Đánh dấu chỗ đang ngắm, 1 giây sau 6 quả đạn pháo dội xuống.' },
      s2: { key: 'mine', name: 'Mìn dính', cd: 6, charges: 2, desc: 'Ném mìn dính xuống đất, nổ khi zombie tới gần 2 m.' },
      ult: { key: 'barrage', name: 'Mưa Pháo', cost: 1800, desc: '20 quả pháo cày một đường dài 30 m theo hướng bạn nhìn.' },
      look: { skin: 0xd09a70, hair: 0x3a2a1a, eye: 0x202020, shirt: 0x5a6a3a, shirt2: 0xd85a20, pants: 0x4a5532, boot: 0x2a2418, beard: 0x3a2a1a } },
    { id: 'bang', name: 'Băng', role: 'Đóng băng', color: 0x9ae8ff, hp: 100, speed: 1,
      passive: 'Đạn và lưỡi kiếm làm zombie chậm 25% trong 1 giây.',
      s1: { key: 'freeze', name: 'Sóng băng', cd: 18, desc: 'Đóng băng mọi zombie trong 9 m suốt 3,5 giây; chết khi đang đóng băng thì vỡ vụn.' },
      s2: { key: 'lance', name: 'Mũi băng', cd: 6, desc: 'Phóng mũi băng xuyên 35 m: 170 sát thương và hai lớp lạnh cho mọi zombie trên đường.' },
      ult: { key: 'blizzard', name: 'Kỷ Băng Hà', cost: 1500, desc: 'Bão tuyết 14 m quanh bạn trong 8 giây: zombie lạnh dần rồi đóng băng.' },
      look: { skin: 0xf4dcd0, hair: 0xe8f4ff, eye: 0x40e0ff, shirt: 0x8cc8e8, shirt2: 0xf4f8ff, pants: 0x3a5a7a, boot: 0xe8f0f8 } },
    { id: 'hoa', name: 'Hoả', role: 'Phóng lửa', color: 0xff6a20, hp: 110, speed: 1,
      passive: 'Một phần tư số đạn trúng làm zombie bốc cháy. Không bị lửa đốt.',
      s1: { key: 'molotov', name: 'Bom xăng', cd: 8, desc: 'Ném chai xăng thành vũng lửa 3 m cháy 5 giây.' },
      s2: { key: 'rocketjump', name: 'Phản lực', cd: 7, desc: 'Nổ dưới chân bắn bạn lên cao, đốt zombie quanh chỗ nổ.' },
      ult: { key: 'dragon', name: 'Hoả Long', cost: 1600, desc: 'Phun lửa 10 m trước mặt trong 6 giây.' },
      look: { skin: 0xd09a70, hair: 0x1a1010, eye: 0xffa020, shirt: 0x3a2a24, shirt2: 0xff6a20, pants: 0x2a2420, boot: 0x1a1410 } },
    { id: 'sam', name: 'Sấm', role: 'Gọi sét', color: 0x7ab0ff, hp: 100, speed: 1.02,
      passive: 'Cứ phát trúng thứ năm thì phóng điện, nhảy sang zombie bên cạnh.',
      s1: { key: 'orb', name: 'Cầu sét', cd: 9, desc: 'Thả quả cầu sét trôi chậm 4 giây, giật mọi zombie trong 4,5 m.' },
      s2: { key: 'smite', name: 'Lôi phạt', cd: 7, desc: 'Gọi sét đánh xuống chỗ đang ngắm: 125 sát thương trong 3 m.' },
      ult: { key: 'thunder', name: 'Thiên Lôi', cost: 1700, desc: 'Sáu giây sét giáng liên tục vào zombie trong 25 m quanh bạn.' },
      look: { skin: 0xe8c0a0, hair: 0xf0f0ff, eye: 0x9ad8ff, shirt: 0x1e2a4a, shirt2: 0xffe040, pants: 0x1a2236, boot: 0x10141e } },
    { id: 'doc', name: 'Độc', role: 'Gieo dịch', color: 0x8aff40, hp: 100, speed: 1,
      passive: 'Một phần năm số đạn trúng tẩm độc. Zombie chết khi đang trúng độc thì toả độc ra xung quanh.',
      s1: { key: 'cloud', name: 'Mây độc', cd: 9, desc: 'Ném bình khí độc thành đám mây 4,5 m trong 6 giây.' },
      s2: { key: 'drain', name: 'Hút sinh', cd: 10, desc: 'Rút sinh lực mọi zombie trong 14 m: 35 sát thương mỗi con, 70 nếu nó đang trúng độc, hồi máu cho bạn.' },
      ult: { key: 'plague', name: 'Đại Dịch', cost: 1500, desc: 'Sóng dịch 18 m tẩm 5 lớp độc, 8 giây sau zombie quanh bạn bị lây thêm.' },
      look: { skin: 0xb8c8a0, hair: 0x2a3a1a, eye: 0x9aff40, shirt: 0x2a3a24, shirt2: 0x8aff40, pants: 0x1e2a1a, boot: 0x141a10, mask: 0x3a4a30 } },
    { id: 'ky', name: 'Kỹ Sư', role: 'Dựng tháp', color: 0xffb020, hp: 105, speed: 0.98,
      passive: 'Có sẵn nhánh Kỹ sư cấp 1: đầu mỗi đợt tự dựng một tháp súng cạnh bạn.',
      s1: { key: 'turret', name: 'Dựng tháp', cd: 14, charges: 2, desc: 'Dựng ngay một tháp súng trước mặt.' },
      s2: { key: 'repair', name: 'Giáp khẩn', cd: 12, desc: 'Thêm 60 giáp cho bạn, lính thuê quanh 10 m hồi 60 máu.' },
      ult: { key: 'artillery', name: 'Pháo Đài', cost: 1800, desc: 'Dựng khẩu pháo lớn bắn tên lửa vào zombie gần nhất trong 14 giây.' },
      look: { skin: 0xd8a070, hair: 0x4a2a1a, eye: 0x202020, shirt: 0xd88a20, shirt2: 0x3a3a3a, pants: 0x5a4a32, boot: 0x2a2018 } },
    { id: 'soi', name: 'Sói', role: 'Hoá sói', color: 0xd08a40, hp: 110, speed: 1.08,
      passive: 'Mỗi con zombie hạ được hồi 4 máu. Chạy nhanh hơn 8%.',
      s1: { key: 'lunge', name: 'Vồ cắn', cd: 7, desc: 'Vồ 8 m tới chỗ tâm ngắm (ngửa lên thì vồ lên cao), đáp xuống cắn 90 sát thương kèm chảy máu, hồi 15 máu.' },
      s2: { key: 'howl', name: 'Tru gọi bầy', cd: 14, desc: 'Tru một tiếng: zombie trong 10 m hoảng sợ bỏ chạy 2,5 giây, ba con sói hồn lao ra cắn xé trong 8 giây.' },
      ult: { key: 'werewolf', name: 'Hoá Sói', cost: 1600, desc: 'Hoá người sói 12 giây: vuốt cào hai nhát chém lan 70, chạy nhanh hơn 35%, nhảy cao hơn, chịu ít hơn 40% sát thương, hút 15% máu; Vồ cắn hồi rất nhanh.' },
      look: { skin: 0xd0a07a, hair: 0x5a4632, eye: 0xffb030, shirt: 0x5a3e26, shirt2: 0x9a948a, pants: 0x3e3226, boot: 0x2a1e14, beard: 0x5a4632 } },
    { id: 'nhen', name: 'Nhện Đồng', role: 'Đu tơ', color: 0xe0a048, hp: 100, speed: 1.04, wallRun: true, doubleJump: true,
      passive: 'Chạy trên tường, chạy lên tường, đạp tường bật nhảy, nhảy hai lần.',
      s1: { key: 'swing', name: 'Đu tơ', cd: 5, charges: 2, desc: 'Bắn sợi tơ tới chỗ tâm ngắm chạm (tường, mái, đất) trong 30 m rồi đu theo cung tới đó; ngắm mép mái thì đu lên mái. Đáp xuống đá văng zombie quanh chân 90 sát thương kèm một lớp tơ.' },
      s2: { key: 'yank', name: 'Kéo tơ', cd: 7, desc: 'Bắn tơ dính zombie dưới tâm ngắm, giật nó về trước mặt rồi trói nó cùng tối đa 2 con cạnh bên 2 giây.' },
      ult: { key: 'webnet', name: 'Lưới Tơ Khổng Lồ', cost: 1300, desc: 'Tung tấm lưới rộng 12 m về phía trước: trói mọi zombie dưới lưới 3 giây, rồi tơ siết lại và nổ 300 sát thương.' },
      look: { skin: 0xc89a78, hair: 0x16161c, eye: 0xffb040, shirt: 0x1c1c22, shirt2: 0xc8863a, pants: 0x18181e, boot: 0x101014 } },
  ];
  // each hero fights with one weapon, the whole run
  const KIT = { gio: 'katana', thep: 'longsword', yta: 'dualpistol', mua: 'minigun', bong: 'shuriken', phao: 'bazooka', bang: 'spear', hoa: 'fists', sam: 'javelin', doc: 'glaive', ky: 'shotgun', soi: 'hatchet', nhen: 'webbow' };
  for (const h of HEROES) h.weapon = KIT[h.id];
  const ULT_DUR = { drones: 7, vanish: 7, blizzard: 8, dragon: 6, thunder: 6, plague: 8, artillery: 14, revive: 6, werewolf: 12, webnet: 3.6 };
  for (const h of HEROES) { h.skill = h.s1; h.ult.dur = ULT_DUR[h.ult.key] || 1; }
  BZ.HEROES = HEROES;
  const byId = (id) => HEROES.find((h) => h.id === id) || HEROES[3];
  const hx = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ---------- textures: face, shirt, sleeve and glove per hero ----------
  function textures(h) {
    const L = h.look; const id = h.id;
    BZ.defTex('h_' + id + '_face', 8, 8, ({ set }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hx(L.skin));
      for (let x = 0; x < 8; x++) { set(x, 0, hx(L.hair)); set(x, 1, hx(L.hair)); }
      set(0, 2, hx(L.hair)); set(7, 2, hx(L.hair));
      for (const ex of [2, 5]) { set(ex, 3, hx(L.eye)); set(ex + (ex < 4 ? -1 : 1), 3, [240, 240, 240]); }
      set(3, 6, shade(hx(L.skin), 0.6)); set(4, 6, shade(hx(L.skin), 0.6));
      if (L.mask) for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.mask), y === 5 ? 1.2 : 1));
      if (L.beard) for (let x = 2; x < 6; x++) set(x, 5, hx(L.beard));
      if (id === 'mua') for (let x = 0; x < 8; x++) set(x, 3, x === 0 || x === 7 ? hx(0x101010) : hx(0x181818));
      if (id === 'thep') { for (let x = 0; x < 8; x++) { set(x, 2, hx(0x5a626c)); set(x, 3, hx(0xffa020)); } }
      if (id === 'hoa') for (let y = 5; y < 8; y++) for (let x = 1; x < 7; x++) set(x, y, hx(y === 6 && (x === 2 || x === 5) ? 0x5a5a5a : 0x2a2a2a));
      if (id === 'sam') { set(1, 2, hx(0xf0f0ff)); set(6, 2, hx(0xf0f0ff)); set(3, 6, hx(0x9ad8ff)); }
      if (id === 'doc') for (const ex of [2, 5]) { set(ex, 3, hx(0x9aff40)); set(ex + (ex < 4 ? -1 : 1), 3, hx(0x9aff40)); }
      if (id === 'ky') for (let x = 1; x < 7; x++) set(x, 3, x === 1 || x === 6 ? hx(0x3a3a3a) : (x === 2 || x === 5 ? hx(0x60c8ff) : hx(0x3a3a3a)));
      // Sói: amber eyes under a heavy brow, stubble, a scar over the left eye
      if (id === 'soi') { for (let x = 1; x < 7; x++) set(x, 2, shade(hx(L.hair), 0.8)); for (let x = 1; x < 7; x++) set(x, 6, shade(hx(L.beard), x % 2 ? 1 : 0.8)); set(2, 7, hx(L.beard)); set(5, 7, hx(L.beard)); set(1, 4, hx(0xa86a5a)); set(2, 2, hx(0xa86a5a)); }
      // Nhện Đồng: a black helmet face, bronze mandibles, a cluster of small glowing eyes
      if (id === 'nhen') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hx(y === 2 ? 0xc8863a : 0x1c1c22)); for (const [x, y] of [[2, 3], [5, 3], [1, 4], [6, 4], [3, 4], [4, 4]]) set(x, y, hx(0xffb040)); for (const [x, y] of [[2, 6], [5, 6], [2, 7], [5, 7]]) set(x, y, hx(0xc8863a)); }
    }, { noMip: true });
    if (id === 'soi') for (const [k, c] of [['fur', 0x76644e], ['furL', 0xb4a48a], ['furD', 0x3e3428]]) BZ.defTex('h_soi_' + k, 8, 8, ({ set, rng }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(c), 0.82 + rng.next() * 0.3 + ((x + y * 3) % 5 === 0 ? -0.12 : 0) + (y % 3 === 0 ? 0.06 : 0)));
    }, { noMip: true });
    BZ.defTex('h_' + id + '_hair', 8, 8, ({ set, rng }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.hair), rng.chance(0.25) ? 1.25 : 1));
    }, { noMip: true });
    BZ.defTex('h_' + id + '_shirt', 8, 8, ({ set }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.shirt), y === 0 ? 1.15 : 1));
      if (id === 'yta') { for (let i = 2; i < 6; i++) { set(i, 3, hx(L.shirt2)); set(3, i - 1, hx(L.shirt2)); set(4, i - 1, hx(L.shirt2)); } }
      else if (id === 'mua') { for (let i = 0; i < 8; i++) { set(i, i, hx(0x6a4a20)); if (i % 2) set(i, i, hx(0xf2c23a)); } }
      else if (id === 'gio') { for (let y = 0; y < 8; y++) set(3, y, hx(L.shirt2)); for (let x = 0; x < 8; x++) set(x, 6, shade(hx(L.shirt), 0.7)); }
      else if (id === 'thep') { for (let x = 0; x < 8; x++) { set(x, 2, shade(hx(L.shirt), 1.3)); set(x, 5, shade(hx(L.shirt), 0.75)); } set(3, 3, hx(L.shirt2)); set(4, 3, hx(L.shirt2)); }
      else if (id === 'bong') { for (let y = 0; y < 8; y++) { set(y, y, hx(L.shirt2)); } }
      else if (id === 'phao') { for (let x = 0; x < 8; x++) set(x, 5, hx(0x3a2a18)); set(1, 2, hx(0x3a4422)); set(6, 2, hx(0x3a4422)); }
      else if (id === 'bang') { for (let x = 0; x < 8; x++) set(x, 0, hx(L.shirt2)); set(2, 4, hx(0xffffff)); set(5, 2, hx(0xffffff)); }
      else if (id === 'hoa') { for (let x = 0; x < 8; x++) { set(x, 6, hx(L.shirt2)); set(x, 7, hx(0xffc040)); } set(3, 2, hx(L.shirt2)); set(4, 3, hx(L.shirt2)); }
      else if (id === 'sam') { for (const [x, y] of [[4, 0], [3, 1], [3, 2], [4, 2], [5, 2], [4, 3], [3, 4], [3, 5]]) set(x, y, hx(L.shirt2)); }
      else if (id === 'doc') { for (let y = 0; y < 8; y++) { set(0, y, hx(L.shirt2)); set(7, y, hx(L.shirt2)); } set(3, 3, hx(L.shirt2)); set(4, 4, hx(L.shirt2)); }
      else if (id === 'ky') { for (let y = 0; y < 8; y++) { set(1, y, hx(L.shirt2)); set(6, y, hx(L.shirt2)); } for (let x = 2; x < 6; x++) set(x, 3, hx(0xb06a10)); }
      else if (id === 'soi') { for (let i = 0; i < 8; i++) set(i, Math.min(7, Math.floor(i * 0.9)), hx(0x2a1a10)); for (let x = 0; x < 8; x++) set(x, 0, hx(L.shirt2)); set(3, 4, hx(0xe8e0c8)); set(5, 5, hx(0xe8e0c8)); }
      else if (id === 'nhen') { for (let y = 0; y < 8; y++) { set(3, y, hx(L.shirt2)); set(4, y, shade(hx(L.shirt2), 0.8)); } for (const [x, y] of [[1, 2], [2, 3], [6, 2], [5, 3], [1, 5], [2, 4], [6, 5], [5, 4]]) set(x, y, hx(L.shirt2)); for (let x = 0; x < 8; x++) set(x, 7, shade(hx(L.shirt), 1.4)); }
    }, { noMip: true });
    BZ.defTex('h_' + id + '_sleeve', 16, 16, ({ set, rng }) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, shade(hx(L.shirt), 1 + (rng.next() - 0.5) * 0.12 + ((x + y) % 7 === 0 ? -0.12 : 0)));
      if (id === 'yta') for (let x = 0; x < 16; x++) { set(x, 3, hx(L.shirt2)); }
      if (['gio', 'bong', 'phao', 'hoa', 'sam', 'doc', 'nhen'].includes(id)) for (let x = 0; x < 16; x++) set(x, 12, hx(L.shirt2));
      if (id === 'soi') for (let x = 0; x < 16; x++) { set(x, 1, hx(L.shirt2)); set(x, 2, shade(hx(L.shirt2), 0.8)); }
    });
    BZ.defTex('h_' + id + '_glove', 4, 4, ({ set }) => {
      const g = id === 'yta' ? 0xe8f0f4 : id === 'bang' ? 0xd8f0ff : id === 'thep' ? 0x5a626c : id === 'ky' ? 0xd8b020 : id === 'nhen' ? 0x8a5a28 : id === 'soi' ? 0x4a3828 : L.boot;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, shade(hx(g), y === 3 ? 1.25 : x === 0 ? 1.1 : 1));
    }, { noMip: true });
  }

  // ---------- voxel body: hips / legs / torso / arms / head as separate pivots so it can pose ----------
  function heroModel(h) {
    textures(h);
    const L = h.look; const C = (c) => BZ.cellTex(c); const id = h.id;
    const part = (name, boxes) => {
      const B = new BZ.Builder('hero:' + id + ':' + name);
      for (const [a, b, m] of boxes) B.box(a, b, m, { uv: 'fit', vary: 0 });
      const matOpts = {}; matOpts[C(0x60e8ff)] = { emissive: 0x40c8ff }; matOpts[C(0xc080ff)] = { emissive: 0x9040ff }; matOpts[C(0xffa020)] = { emissive: 0xff8010 };
      matOpts[C(0x9ad8ff)] = { emissive: 0x4080ff }; matOpts[C(0x9aff40)] = { emissive: 0x40a010 }; matOpts[C(0xff8a20)] = { emissive: 0xff5a10 };
      matOpts[C(0xffb040)] = { emissive: 0xff9010 };
      return B.build({ cast: true, matOpts });
    };
    const shirt = 'h_' + id + '_shirt'; const face = { pz: 'h_' + id + '_face', side: 'h_' + id + '_hair', top: 'h_' + id + '_hair', bottom: C(L.skin) };
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const hips = new THREE.Group(); hips.position.y = 0.75; root.add(hips);
    // the spine bends and twists the whole upper body over the hips (lean, swing, recoil)
    const spine = new THREE.Group(); hips.add(spine);
    const bulk = id === 'thep' ? 0.04 : 0;
    const leg = (x) => {
      const g = new THREE.Group(); g.position.x = x; hips.add(g);
      g.add(part('thigh', [[[-0.13 - bulk, -0.4, -0.13 - bulk], [0.13 + bulk, 0.02, 0.13 + bulk], C(L.pants)]]));
      const knee = new THREE.Group(); knee.position.y = -0.38; g.add(knee);
      knee.add(part('shin', [[[-0.125 - bulk, -0.32, -0.125 - bulk], [0.125 + bulk, 0.02, 0.125 + bulk], C(L.pants)]]));
      const foot = new THREE.Group(); foot.position.y = -0.3; knee.add(foot);
      foot.add(part('boot', [[[-0.14 - bulk, -0.07, -0.15 - bulk], [0.14 + bulk, 0.09, 0.15 + bulk], C(L.boot)], [[-0.13 - bulk, -0.07, 0.15 + bulk], [0.13 + bulk, 0.02, 0.24], C(L.boot)]]));
      g.userData = { knee, foot }; return g;
    };
    const legL = leg(-0.13); const legR = leg(0.13);
    const torsoBoxes = [[[-0.26 - bulk, 0, -0.15 - bulk], [0.26 + bulk, 0.7, 0.15 + bulk], { pz: shirt, side: C(L.shirt), top: C(L.shirt), bottom: C(L.pants) }], [[-0.27 - bulk, -0.02, -0.16 - bulk], [0.27 + bulk, 0.08, 0.16 + bulk], C(0x2a2018)]];
    const extra = [];
    if (id === 'yta') extra.push([[0.2, 0.0, -0.1], [0.36, 0.2, 0.12], C(0xe02a2a)], [[0.22, 0.07, 0.12], [0.34, 0.13, 0.13], C(0xffffff)]);
    if (id === 'mua') extra.push([[-0.27, 0.06, -0.17], [0.27, 0.12, 0.17], C(0x6a4a20)], [[-0.24, 0.07, 0.17], [-0.16, 0.11, 0.18], C(0xf2c23a)], [[-0.08, 0.07, 0.17], [0.0, 0.11, 0.18], C(0xf2c23a)], [[0.08, 0.07, 0.17], [0.16, 0.11, 0.18], C(0xf2c23a)]);
    if (id === 'phao') extra.push([[-0.22, 0.12, -0.38], [0.22, 0.62, -0.15], C(0xd85a20)], [[-0.18, 0.2, -0.4], [0.18, 0.5, -0.38], C(0x8a3a10)], [[0.12, 0.62, -0.3], [0.15, 1.15, -0.27], C(0x2a2a2a)], [[0.11, 1.13, -0.31], [0.16, 1.17, -0.26], C(0xff4a3a)]);
    if (id === 'thep') extra.push([[-0.42, 0.5, -0.2], [-0.24, 0.74, 0.2], C(0x7a8490)], [[0.24, 0.5, -0.2], [0.42, 0.74, 0.2], C(0x7a8490)], [[-0.43, 0.7, -0.21], [-0.23, 0.74, 0.21], C(0xffb030)], [[0.23, 0.7, -0.21], [0.43, 0.74, 0.21], C(0xffb030)]);
    if (id === 'bang') extra.push([[-0.3, 0.6, -0.18], [0.3, 0.76, 0.18], C(0xf4f8ff)], [[-0.36, 0.62, -0.05], [-0.28, 0.8, 0.05], C(0x60e8ff)], [[0.28, 0.66, -0.04], [0.34, 0.86, 0.04], C(0x60e8ff)]);
    if (id === 'gio') extra.push([[-0.24, 0.55, -0.2], [0.24, 0.72, -0.15], C(L.shirt2)]);
    // Hoả: two fuel tanks and a hose on the back; Sấm: glowing coils on the shoulders; Độc: canisters on the belt; Kỹ Sư: tool belt and a backpack
    if (id === 'hoa') extra.push([[-0.22, 0.1, -0.36], [-0.04, 0.6, -0.16], C(0xc83a1a)], [[0.04, 0.1, -0.36], [0.22, 0.6, -0.16], C(0xc83a1a)], [[-0.2, 0.6, -0.34], [-0.06, 0.66, -0.18], C(0x5a5a5a)], [[0.06, 0.6, -0.34], [0.2, 0.66, -0.18], C(0x5a5a5a)], [[0.18, 0.15, -0.2], [0.24, 0.2, 0.1], C(0x2a2a2a)], [[-0.2, 0.3, 0.15], [0.2, 0.36, 0.16], C(0xff8a20)]);
    if (id === 'sam') extra.push([[-0.42, 0.56, -0.12], [-0.26, 0.76, 0.12], C(0x3a4a6a)], [[0.26, 0.56, -0.12], [0.42, 0.76, 0.12], C(0x3a4a6a)], [[-0.4, 0.76, -0.06], [-0.28, 0.84, 0.06], C(0x9ad8ff)], [[0.28, 0.76, -0.06], [0.4, 0.84, 0.06], C(0x9ad8ff)], [[-0.14, 0.1, -0.3], [0.14, 0.5, -0.15], C(0x2a3450)], [[-0.04, 0.5, -0.26], [0.04, 0.9, -0.2], C(0x9ad8ff)]);
    if (id === 'doc') extra.push([[-0.27, 0.04, -0.17], [0.27, 0.1, 0.17], C(0x3a2a18)], [[-0.24, -0.08, 0.15], [-0.14, 0.12, 0.24], C(0x9aff40)], [[-0.06, -0.08, 0.15], [0.04, 0.12, 0.24], C(0x9aff40)], [[0.12, -0.08, 0.15], [0.22, 0.12, 0.24], C(0x9aff40)], [[-0.28, 0.2, -0.17], [0.28, 0.72, 0.17], { pz: C(0x2a3a24), side: C(0x22301c), top: C(0x22301c), bottom: C(0x22301c) }]);
    if (id === 'ky') extra.push([[-0.27, 0.0, -0.17], [0.27, 0.1, 0.17], C(0x5a3a1a)], [[0.16, -0.12, 0.13], [0.26, 0.08, 0.22], C(0x9a9a9a)], [[-0.26, -0.1, 0.13], [-0.18, 0.06, 0.2], C(0xd8b020)], [[-0.2, 0.15, -0.36], [0.2, 0.62, -0.15], C(0x6a6a5a)], [[-0.16, 0.5, -0.38], [0.16, 0.56, -0.35], C(0xffb020)]);
    // Sói: a fur mantle over a leather vest, a strap across the chest, tooth charms on the belt
    if (id === 'soi') extra.push([[-0.31, 0.56, -0.2], [0.31, 0.76, 0.2], C(0x8a8478)], [[-0.22, 0.62, 0.2], [0.22, 0.74, 0.23], C(0x9a948a)], [[-0.34, 0.6, -0.12], [-0.24, 0.8, 0.12], C(0x7a746a)], [[0.24, 0.6, -0.12], [0.34, 0.8, 0.12], C(0x7a746a)],
      [[-0.27, 0.0, -0.17], [0.27, 0.08, 0.17], C(0x2a1a10)], [[-0.04, 0.0, 0.17], [0.04, 0.09, 0.18], C(0xb8863a)], [[-0.16, -0.08, 0.16], [-0.12, 0.0, 0.19], C(0xe8e0c8)], [[0.1, -0.08, 0.16], [0.14, 0.0, 0.19], C(0xe8e0c8)],
      [[-0.2, 0.08, -0.36], [0.06, 0.5, -0.16], C(0x4a3420)], [[-0.21, 0.4, -0.37], [0.07, 0.44, -0.35], C(0x9a948a)]);
    // Nhện Đồng: black plate with bronze trim, a bronze spider on the chest, the hub that carries the four legs
    if (id === 'nhen') extra.push([[-0.28, 0.1, -0.17], [0.28, 0.66, 0.18], { pz: C(0x26262e), side: C(0x1e1e24), top: C(0x26262e), bottom: C(0x1e1e24) }],
      [[-0.29, 0.64, -0.18], [0.29, 0.7, 0.19], C(0xc8863a)], [[-0.28, 0.0, -0.18], [0.28, 0.07, 0.18], C(0xc8863a)], [[-0.025, 0.07, 0.18], [0.025, 0.64, 0.19], C(0x8a5a28)],
      [[-0.06, 0.32, 0.18], [0.06, 0.5, 0.21], C(0xe0a048)], [[-0.04, 0.5, 0.18], [0.04, 0.57, 0.205], C(0xe0a048)], [[-0.16, 0.44, 0.18], [-0.06, 0.47, 0.2], C(0xc8863a)], [[0.06, 0.44, 0.18], [0.16, 0.47, 0.2], C(0xc8863a)],
      [[-0.16, 0.34, 0.18], [-0.06, 0.37, 0.2], C(0xc8863a)], [[0.06, 0.34, 0.18], [0.16, 0.37, 0.2], C(0xc8863a)], [[-0.03, 0.38, 0.21], [0.03, 0.44, 0.215], C(0xffb040)],
      [[-0.44, 0.52, -0.18], [-0.26, 0.74, 0.18], C(0x26262e)], [[0.26, 0.52, -0.18], [0.44, 0.74, 0.18], C(0x26262e)], [[-0.45, 0.5, -0.19], [-0.25, 0.54, 0.19], C(0xc8863a)], [[0.25, 0.5, -0.19], [0.45, 0.54, 0.19], C(0xc8863a)],
      [[-0.17, 0.28, -0.3], [0.17, 0.64, -0.16], C(0x2a2a32)], [[-0.18, 0.44, -0.31], [0.18, 0.48, -0.15], C(0xc8863a)], [[-0.06, 0.5, -0.32], [0.06, 0.6, -0.3], C(0xffb040)]);
    const torso = part('torso', torsoBoxes.concat(extra)); spine.add(torso);
    const arm = (x) => {
      const g = new THREE.Group(); g.position.set(x, 0.64, 0); spine.add(g);
      const bare = id === 'mua' || id === 'ky';
      g.add(part('upper', [[[-0.1 - bulk, -0.34, -0.1 - bulk], [0.1 + bulk, 0.06, 0.1 + bulk], C(L.shirt)]]));
      const elbow = new THREE.Group(); elbow.position.y = -0.32; g.add(elbow);
      const fore = [[[-0.095 - bulk, -0.22, -0.095 - bulk], [0.095 + bulk, 0.02, 0.095 + bulk], C(bare ? L.skin : L.shirt)], [[-0.105 - bulk, -0.38, -0.105 - bulk], [0.105 + bulk, -0.18, 0.105 + bulk], 'h_' + id + '_glove']];
      if (id === 'nhen') fore.push([[-0.11, -0.04, -0.11], [0.11, 0.04, 0.11], C(0xc8863a)], [[-0.1, -0.2, -0.1], [0.1, -0.16, 0.1], C(0xc8863a)]);
      if (id === 'soi') fore.push([[-0.105, -0.2, -0.105], [0.105, -0.12, 0.105], C(0x9a948a)]);
      elbow.add(part('fore', fore));
      const hand = new THREE.Group(); hand.position.set(0, -0.3, 0.05); elbow.add(hand);
      g.userData = { elbow, hand }; return g;
    };
    const armL = arm(-0.36); const armR = arm(0.36);
    const head = new THREE.Group(); head.position.y = 0.7; spine.add(head);
    const hb = [[[-0.25, 0, -0.25], [0.25, 0.5, 0.25], face]];
    if (id === 'gio') hb.push([[-0.26, 0.36, -0.26], [0.26, 0.42, 0.26], C(0xf4f8ff)], [[-0.06, 0.32, -0.6], [0.0, 0.4, -0.26], C(0xf4f8ff)], [[0.02, 0.28, -0.52], [0.08, 0.36, -0.26], C(0xf4f8ff)], [[-0.2, 0.42, 0.18], [0.2, 0.5, 0.27], C(0x60e8ff)]);
    if (id === 'thep') hb.push([[-0.28, 0.2, -0.28], [0.28, 0.58, 0.28], { pz: C(0x5a626c), side: C(0x6a737e), top: C(0x7a8490), bottom: C(0x5a626c) }], [[-0.22, 0.3, 0.28], [0.22, 0.36, 0.29], C(0xffa020)]);
    if (id === 'yta') hb.push([[-0.24, 0.5, -0.2], [0.24, 0.62, 0.22], C(0xf2f2ee)], [[-0.04, 0.52, 0.22], [0.04, 0.6, 0.23], C(0xe02a2a)], [[-0.09, 0.55, 0.22], [0.09, 0.57, 0.23], C(0xe02a2a)]);
    if (id === 'mua') hb.push([[-0.26, 0.4, -0.26], [0.26, 0.5, 0.26], C(0xd8322a)], [[-0.04, 0.38, -0.46], [0.04, 0.46, -0.26], C(0xd8322a)]);
    if (id === 'bong') hb.push([[-0.27, 0.26, -0.27], [0.27, 0.54, 0.27], { pz: C(0x14101c), side: C(0x14101c), top: C(0x14101c), bottom: C(0x14101c) }], [[-0.06, 0.1, -0.7], [0.06, 0.2, -0.26], C(0x8a40e0)]);
    if (id === 'phao') hb.push([[-0.29, 0.38, -0.29], [0.29, 0.56, 0.29], C(0x4a5532)], [[-0.22, 0.42, 0.27], [0.22, 0.5, 0.31], C(0x2a2a2a)], [[-0.18, 0.43, 0.3], [-0.04, 0.49, 0.32], C(0x60e8ff)], [[0.04, 0.43, 0.3], [0.18, 0.49, 0.32], C(0x60e8ff)]);
    if (id === 'bang') hb.push([[-0.3, -0.02, -0.3], [0.3, 0.56, -0.2], C(0xf4f8ff)], [[-0.3, 0.46, -0.3], [0.3, 0.58, 0.28], C(0xf4f8ff)], [[-0.3, -0.02, -0.3], [-0.24, 0.56, 0.28], C(0xf4f8ff)], [[0.24, -0.02, -0.3], [0.3, 0.56, 0.28], C(0xf4f8ff)]);
    if (id === 'hoa') hb.push([[-0.27, 0.0, 0.2], [0.27, 0.2, 0.32], C(0x2a2a2a)], [[-0.08, 0.02, 0.32], [0.08, 0.14, 0.4], C(0x4a4a4a)], [[-0.2, 0.26, 0.24], [-0.04, 0.36, 0.28], C(0xff8a20)], [[0.04, 0.26, 0.24], [0.2, 0.36, 0.28], C(0xff8a20)], [[-0.27, 0.42, -0.27], [0.27, 0.54, 0.27], C(0x2a2018)]);
    if (id === 'sam') hb.push([[-0.2, 0.5, -0.2], [-0.08, 0.72, -0.08], C(0xf0f0ff)], [[0.04, 0.5, -0.12], [0.16, 0.78, 0.0], C(0xf0f0ff)], [[-0.12, 0.5, 0.04], [0.0, 0.66, 0.16], C(0xf0f0ff)], [[-0.27, 0.3, 0.24], [0.27, 0.36, 0.28], C(0x9ad8ff)]);
    if (id === 'doc') hb.push([[-0.29, 0.1, -0.29], [0.29, 0.6, 0.18], C(0x22301c)], [[-0.29, 0.5, -0.29], [0.29, 0.6, 0.29], C(0x22301c)], [[-0.06, 0.08, 0.25], [0.06, 0.18, 0.46], C(0x3a4a30)], [[-0.2, 0.28, 0.25], [-0.06, 0.36, 0.27], C(0x9aff40)], [[0.06, 0.28, 0.25], [0.2, 0.36, 0.27], C(0x9aff40)]);
    if (id === 'ky') hb.push([[-0.29, 0.44, -0.29], [0.29, 0.6, 0.29], C(0xf2c020)], [[-0.32, 0.44, 0.2], [0.32, 0.48, 0.36], C(0xf2c020)], [[-0.04, 0.6, -0.2], [0.04, 0.64, 0.2], C(0xd8a010)]);
    if (id === 'soi') hb.push([[-0.27, 0.42, -0.27], [0.27, 0.56, 0.27], C(L.hair)], [[-0.26, 0.08, -0.29], [0.26, 0.46, -0.2], C(L.hair)], [[-0.28, 0.12, -0.06], [-0.24, 0.4, 0.2], C(L.hair)], [[0.24, 0.12, -0.06], [0.28, 0.4, 0.2], C(L.hair)],
      [[-0.2, 0.52, -0.1], [-0.08, 0.62, 0.08], C(0x6a5440)], [[0.06, 0.54, -0.16], [0.18, 0.64, 0.02], C(0x6a5440)], [[0.27, 0.16, 0.0], [0.3, 0.24, 0.04], C(0xe8e0c8)]);
    if (id === 'nhen') hb.push([[-0.28, -0.02, -0.28], [0.28, 0.56, 0.24], { pz: C(0x1c1c22), side: C(0x26262e), top: C(0x26262e), bottom: C(0x1c1c22) }], [[-0.04, 0.56, -0.26], [0.04, 0.63, 0.22], C(0xc8863a)],
      [[-0.29, 0.4, 0.24], [0.29, 0.45, 0.29], C(0xc8863a)], [[-0.22, 0.0, 0.24], [-0.08, 0.16, 0.3], C(0xc8863a)], [[0.08, 0.0, 0.24], [0.22, 0.16, 0.3], C(0xc8863a)], [[-0.27, 0.16, 0.24], [0.27, 0.4, 0.27], C(0x14141a)],
      [[-0.16, 0.27, 0.27], [-0.08, 0.33, 0.3], C(0xffb040)], [[0.08, 0.27, 0.27], [0.16, 0.33, 0.3], C(0xffb040)], [[-0.22, 0.22, 0.27], [-0.18, 0.26, 0.29], C(0xffb040)], [[0.18, 0.22, 0.27], [0.22, 0.26, 0.29], C(0xffb040)],
      [[-0.045, 0.34, 0.27], [-0.015, 0.37, 0.29], C(0xffb040)], [[0.015, 0.34, 0.27], [0.045, 0.37, 0.29], C(0xffb040)], [[-0.11, 0.36, 0.27], [-0.08, 0.385, 0.29], C(0xffb040)], [[0.08, 0.36, 0.27], [0.11, 0.385, 0.29], C(0xffb040)]);
    head.add(part('head', hb));
    const out = { root, hips, spine, legL, legR, kneeL: legL.userData.knee, kneeR: legR.userData.knee, footL: legL.userData.foot, footR: legR.userData.foot,
      armL, armR, elbowL: armL.userData.elbow, elbowR: armR.userData.elbow, handL: armL.userData.hand, handR: armR.userData.hand, head, torso };
    // Sói's beast form: fur over every limb, a snout, ears, a tail and big paws, hidden until he changes (BZ.heroExtras grows it in)
    if (id === 'soi') {
      const F = 'h_soi_fur'; const FL = 'h_soi_furL'; const FD = 'h_soi_furD'; const W = [];
      const add = (j, name, boxes) => { const m = part('wolf-' + name, boxes); m.visible = false; j.add(m); W.push(m); return m; };
      add(spine, 'torso', [[[-0.34, -0.05, -0.22], [0.34, 0.8, 0.22], { pz: FL, side: F, top: F, bottom: F }], [[-0.3, 0.52, -0.3], [0.3, 0.88, 0.06], FD], [[-0.1, 0.3, -0.29], [0.1, 0.64, -0.21], FD],
        [[-0.38, 0.6, -0.16], [-0.26, 0.86, 0.14], FD], [[0.26, 0.6, -0.16], [0.38, 0.86, 0.14], FD], [[-0.22, 0.12, 0.22], [0.22, 0.5, 0.25], FL]]);
      add(head, 'head', [[[-0.29, -0.04, -0.3], [0.29, 0.58, 0.27], { pz: F, side: F, top: F, bottom: FL }], [[-0.13, 0.02, 0.26], [0.13, 0.22, 0.58], { pz: F, side: F, top: F, bottom: FL }],
        [[-0.06, 0.15, 0.56], [0.06, 0.24, 0.62], C(0x14100c)], [[-0.11, -0.06, 0.24], [0.11, 0.03, 0.52], FL], [[-0.09, 0.02, 0.46], [-0.06, 0.08, 0.5], C(0xf4f0e0)], [[0.06, 0.02, 0.46], [0.09, 0.08, 0.5], C(0xf4f0e0)],
        [[-0.1, -0.02, 0.3], [-0.07, 0.03, 0.33], C(0xf4f0e0)], [[0.07, -0.02, 0.3], [0.1, 0.03, 0.33], C(0xf4f0e0)],
        [[-0.21, 0.3, 0.26], [-0.08, 0.37, 0.29], C(0xffb040)], [[0.08, 0.3, 0.26], [0.21, 0.37, 0.29], C(0xffb040)], [[-0.25, 0.37, 0.25], [0.25, 0.43, 0.3], FD],
        [[-0.27, 0.5, -0.1], [-0.11, 0.72, 0.06], F], [[-0.24, 0.72, -0.07], [-0.14, 0.84, 0.03], FD], [[-0.23, 0.53, 0.06], [-0.15, 0.68, 0.07], C(0xc88a7a)],
        [[0.11, 0.5, -0.1], [0.27, 0.72, 0.06], F], [[0.14, 0.72, -0.07], [0.24, 0.84, 0.03], FD], [[0.15, 0.53, 0.06], [0.23, 0.68, 0.07], C(0xc88a7a)],
        [[-0.3, 0.0, -0.24], [-0.24, 0.36, 0.2], FD], [[0.24, 0.0, -0.24], [0.3, 0.36, 0.2], FD]]);
      for (const a of [armL, armR]) {
        add(a, 'upper', [[[-0.14, -0.36, -0.14], [0.14, 0.1, 0.14], F], [[-0.15, -0.05, -0.15], [0.15, 0.12, 0.15], FD]]);
        add(a.userData.elbow, 'fore', [[[-0.13, -0.38, -0.13], [0.13, 0.03, 0.13], F], [[-0.15, -0.5, -0.12], [0.15, -0.34, 0.16], FD]]);
      }
      for (const l of [legL, legR]) {
        add(l, 'thigh', [[[-0.17, -0.42, -0.17], [0.17, 0.05, 0.17], F]]);
        add(l.userData.knee, 'shin', [[[-0.15, -0.34, -0.16], [0.15, 0.04, 0.14], F]]);
        add(l.userData.foot, 'paw', [[[-0.17, -0.08, -0.17], [0.17, 0.11, 0.3], FD], [[-0.14, -0.08, 0.3], [-0.09, 0.0, 0.36], C(0xf0ead8)], [[-0.025, -0.08, 0.3], [0.025, 0.0, 0.37], C(0xf0ead8)], [[0.09, -0.08, 0.3], [0.14, 0.0, 0.36], C(0xf0ead8)]]);
      }
      const tail = new THREE.Group(); tail.position.set(0, 0.06, -0.2); tail.rotation.x = -0.55; hips.add(tail);
      const t1 = new THREE.Group(); tail.add(t1); t1.add(part('wolf-tail', [[[-0.09, -0.09, -0.46], [0.09, 0.09, 0.02], F], [[-0.11, -0.1, -0.78], [0.11, 0.11, -0.44], F], [[-0.08, -0.08, -1.0], [0.08, 0.08, -0.76], FL]]));
      tail.visible = false; W.push(tail);
      out.wolf = { parts: W, tail, t1 }; out.formK = 0; out.formWant = 0;
    }
    // Nhện Đồng: four mechanical legs on the back (two segments each, bronze joints, glowing tips)
    if (id === 'nhen') {
      out.spider = [];
      for (const [sx, y, sw] of [[-1, 0.58, 0.55], [1, 0.58, 0.55], [-1, 0.38, 0.95], [1, 0.38, 0.95]]) {
        const g = new THREE.Group(); g.position.set(sx * 0.14, y, -0.26); spine.add(g);
        g.add(part('sleg1', [[[sx < 0 ? -0.56 : 0, -0.035, -0.04], [sx < 0 ? 0 : 0.56, 0.035, 0.04], C(0x26262e)], [[sx < 0 ? -0.08 : -0.02, -0.06, -0.06], [sx < 0 ? 0.02 : 0.08, 0.06, 0.06], C(0xc8863a)], [[sx < 0 ? -0.4 : 0.32, 0.03, -0.045], [sx < 0 ? -0.32 : 0.4, 0.05, 0.045], C(0xc8863a)]]));
        const knee = new THREE.Group(); knee.position.set(sx * 0.56, 0, 0); g.add(knee);
        knee.add(part('sleg2', [[[sx < 0 ? -0.66 : 0, -0.028, -0.032], [sx < 0 ? 0 : 0.66, 0.028, 0.032], C(0x1c1c22)], [[-0.055, -0.055, -0.055], [0.055, 0.055, 0.055], C(0xc8863a)], [[sx < 0 ? -0.74 : 0.62, -0.02, -0.022], [sx < 0 ? -0.62 : 0.74, 0.02, 0.022], C(0xffb040)]]));
        g.rotation.z = sx * 0.75; g.rotation.y = sx * sw; knee.rotation.z = -sx * 1.7;
        out.spider.push({ g, knee, sx, sw, i: out.spider.length });
      }
    }
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return out;
  }

  // One animator for every hero body on screen (your own in third person, the other players in co-op).
  // s: { speed, back, air, sprint, pitch, mode: 'gun'|'melee'|'none', swing 0..1 or -1, kick, reload 0..1, cast 0..1 }.
  // It keeps its own clock and stride phase in s and eases every joint, so states blend instead of snapping.
  const IK = { a: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3(), v: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), z: new THREE.Vector3(), x: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4() };
  const ease = (o, k, v, r, dt) => { o[k] = o[k] === undefined ? v : o[k] + (v - o[k]) * Math.min(1, r * dt); return o[k]; };
  BZ.animHero = (m, s, dt) => {
    const J = s.j || (s.j = {});
    s.t = (s.t || 0) + dt; s.phase = (s.phase || 0) + dt * Math.min(9, s.speed) * 2.2 * (s.back ? -1 : 1);
    const air = s.air || 0; const run = Math.min(1, s.speed / 3.6) * (1 - air); const ph = s.phase; const pitch = s.pitch || 0;
    const sprint = s.sprint ? 1 : 0;
    // legs: the thigh swings, the knee folds as the leg comes through, the foot rolls off the ground
    [[m.legL, m.kneeL, m.footL, 1], [m.legR, m.kneeR, m.footR, -1]].forEach(([leg, knee, foot, sg]) => {
      const a = Math.sin(ph) * sg; const through = Math.max(0, Math.cos(ph) * sg);
      const thigh = -a * (0.62 + sprint * 0.25) * run + air * (sg > 0 ? -1.0 : -0.35) - (s.crouch || 0) * 0.9;
      const kn = (0.08 + through * (1.05 + sprint * 0.35)) * run + air * (sg > 0 ? 1.5 : 0.7) + (s.crouch || 0) * 1.6;
      leg.rotation.x = ease(J, 'th' + sg, thigh, 14, dt); knee.rotation.x = ease(J, 'kn' + sg, kn, 14, dt);
      foot.rotation.x = ease(J, 'ft' + sg, -kn * 0.35 + Math.max(0, a) * 0.3 * run - air * 0.3, 14, dt);
    });
    m.hips.position.y = 0.75 + Math.abs(Math.cos(ph)) * 0.055 * run - air * 0.06 - (s.crouch || 0) * 0.25 + Math.sin(s.t * 2.1) * 0.006;
    m.hips.rotation.y = ease(J, 'hy', Math.sin(ph) * 0.14 * run, 12, dt);
    m.hips.rotation.z = Math.cos(ph) * 0.04 * run;
    // upper body: lean into a run, breathe, counter-twist against the hips, twist hard through a swing
    const sw = s.swing >= 0 ? s.swing : -1;
    let twist = -Math.sin(ph) * 0.18 * run; let lean = 0.05 * run + sprint * 0.18 * run + Math.sin(s.t * 2.1) * 0.02;
    const mode = s.mode; const bump = sw >= 0 ? Math.sin(Math.PI * Math.min(1, sw)) : 0; // 0 -> 1 -> 0 over a swing
    if (sw >= 0) {
      if (mode === 'spear') { twist += 0.3 * bump; lean += 0.22 * bump; }
      else if (mode === 'fists') { twist += (s.pat === 'jabL' ? -0.45 : 0.45) * bump; lean += 0.14 * bump; }
      else if (mode === 'throw') { twist += BZ.lerp(-0.5, 0.5, Math.min(1, sw / 0.6)); lean += 0.2 * bump; }
      else if (mode === 'claws') { twist += (s.pat === 'clawL' ? -0.6 : 0.6) * bump; lean += 0.2 * bump; }
      else { twist += sw < 0.3 ? BZ.lerp(0, 0.7, sw / 0.3) : sw < 0.6 ? BZ.lerp(0.7, -0.75, (sw - 0.3) / 0.3) : BZ.lerp(-0.75, 0, (sw - 0.6) / 0.4); lean += sw > 0.3 && sw < 0.7 ? 0.18 : 0; }
    }
    lean += -(s.cast || 0) * 0.15 - (s.kick || 0) * 0.02;
    m.spine.rotation.y = ease(J, 'twist', twist, sw >= 0 ? 30 : 12, dt); m.spine.rotation.x = ease(J, 'lean', lean, 10, dt);
    // arms: [shoulder x, shoulder z, elbow x] for each side
    let RA; let LA; let ik = null; // ik: the left hand rides the weapon shaft (towards the head: dir, along it by off)
    const mix = (x, y, k) => [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
    if (mode === 'gun') {
      const low = sprint * run; const rl = s.reload || 0;
      RA = [BZ.lerp(-1.42 - pitch * 0.95, -0.55, low) + (s.kick || 0) * 0.06 + rl * 0.5, 0, BZ.lerp(-0.28, -1.1, low) - rl * 0.5];
      LA = [BZ.lerp(-1.25 - pitch * 0.95, -0.4, low) + rl * 0.9, BZ.lerp(-0.42, -0.1, low), BZ.lerp(-0.62, -1.2, low) - rl * 0.6];
    } else if (mode === 'dual') {
      // a pistol in each hand, both arms out at the aim, each recoiling on its own
      const low = sprint * run; const rl = s.reload || 0;
      RA = [BZ.lerp(-1.42 - pitch * 0.95, -0.55, low) + (s.kick || 0) * 0.06 + rl * 0.5, 0.1, BZ.lerp(-0.28, -1.1, low) - rl * 0.5];
      LA = [BZ.lerp(-1.42 - pitch * 0.95, -0.55, low) + (s.kickL || 0) * 0.06 + rl * 0.5, -0.1, BZ.lerp(-0.28, -1.1, low) - rl * 0.5];
    } else if (mode === 'melee' || mode === 'sword2') {
      if (sw >= 0) {
        const up = sw < 0.3 ? sw / 0.3 : 0; const down = sw >= 0.3 && sw < 0.6 ? (sw - 0.3) / 0.3 : sw >= 0.6 ? 1 : 0; const back = sw >= 0.6 ? (sw - 0.6) / 0.4 : 0;
        RA = [BZ.lerp(BZ.lerp(-0.8, -2.9, up), -0.35, down) * (1 - back) + -0.8 * back, BZ.lerp(0.3, -0.5, down) * (1 - back), BZ.lerp(-1.3, -0.1, down) * (1 - back) - 0.9 * back];
        LA = [-0.6 - down * 0.4, -0.2, -0.9];
      } else {
        RA = [-0.7 - Math.sin(ph) * 0.3 * run, 0.1, -0.95]; LA = [-0.4 + Math.sin(ph) * 0.6 * run, -0.15, -0.6 - run * 0.4];
      }
      if (mode === 'sword2') ik = { off: -0.2, dir: [0, 0, 1] };
    } else if (mode === 'spear' || mode === 'glaive') {
      // two-handed polearm: the back hand at the hip, the shaft along the forearm, the head leading
      const aim = pitch * 0.7; const idle = [-0.85 - aim, 0.15, -0.95];
      if (sw >= 0 && mode === 'spear') {
        const pw = sw < 0.3 ? sw / 0.3 : 0; const st = sw >= 0.3 && sw < 0.6 ? (sw - 0.3) / 0.3 : sw >= 0.6 ? 1 : 0; const rec = sw >= 0.6 ? (sw - 0.6) / 0.4 : 0;
        RA = mix(mix(mix(idle, [-0.6 - aim, 0.15, -1.5], pw), [-1.25 - aim, 0.05, -0.35], st), idle, rec);
      } else if (sw >= 0) RA = [idle[0] - 0.25 * bump, idle[1], idle[2] + 0.2 * bump];
      else RA = [idle[0] - Math.sin(ph) * 0.2 * run, idle[1], idle[2]];
      LA = [-0.9, -0.2, -0.8];
      ik = { off: 0.7, dir: [0, -1, 0] };
    } else if (mode === 'fists') {
      // boxing guard, then a straight jab from either side or an uppercut from the right
      const gR = [-0.75, 0.12, -2.0]; const gL = [-0.75, -0.12, -2.0]; const wob = Math.sin(ph) * 0.1 * run;
      RA = [gR[0] + wob, gR[1], gR[2]]; LA = [gL[0] - wob, gL[1], gL[2]];
      if (sw >= 0) {
        const e = sw < 0.45 ? sw / 0.45 : 1 - (sw - 0.45) / 0.55; const ee = e * e * (3 - 2 * e);
        if (s.pat === 'jabL') LA = mix(gL, [-1.45 - pitch * 0.5, -0.05, -0.12], ee);
        else if (s.pat === 'upper') RA = sw < 0.3 ? mix(gR, [-0.25, 0.15, -0.7], sw / 0.3) : mix([-0.25, 0.15, -0.7], [-1.25, 0.05, -2.3], Math.min(1, (sw - 0.3) / 0.25)).map((v, i) => (sw > 0.55 ? v + (gR[i] - v) * (sw - 0.55) / 0.45 : v));
        else RA = mix(gR, [-1.45 - pitch * 0.5, 0.05, -0.12], ee);
      }
    } else if (mode === 'throw') {
      // carried forward at the ready; drawn back while the throw winds up, then driven through
      const rl = s.reload || 0;
      RA = [-1.15 - pitch * 0.5 + rl * 0.3, 0.15, -0.8 - rl * 0.3]; LA = [-0.5, -0.3, -0.5];
      if (s.wind) { RA = [0.5, 0.2, -1.0]; LA = [-1.0, -0.4, -0.4]; }
      if (sw >= 0) { const e = Math.min(1, sw / 0.55); const ee = e * e * (3 - 2 * e); RA = [BZ.lerp(-2.4, -0.7, ee), 0.1, BZ.lerp(-0.3, -0.5, ee)]; LA = [BZ.lerp(-0.6, -1.3, ee), -0.4, -0.5]; }
    } else if (mode === 'claws') {
      // the beast's guard: both paws up and forward, claws out; a swipe winds out high and tears across
      const br = Math.sin(s.t * 3) * 0.06 + Math.sin(ph) * 0.14 * run;
      const gR = [-0.9 - pitch * 0.5 + br, 0.45, -1.05]; const gL = [-0.9 - pitch * 0.5 - br, -0.45, -1.05];
      const swipe = (g, sg) => { const up = [-2.5, 1.15 * sg, -0.55]; const end = [-0.95, -0.5 * sg, -0.2]; return sw < 0.22 ? mix(g, up, sw / 0.22) : sw < 0.5 ? mix(up, end, (sw - 0.22) / 0.28) : mix(end, g, (sw - 0.5) / 0.5); };
      RA = gR; LA = gL;
      if (sw >= 0) { if (s.pat === 'clawL') LA = swipe(gL, -1); else RA = swipe(gR, 1); }
    } else if (mode === 'wrist') {
      // a crossbow strapped to the right wrist: that arm points straight down the aim, the left stays up in a guard
      const low = sprint * run; const rl = s.reload || 0;
      RA = [BZ.lerp(-1.5 - pitch * 0.95, -0.6, low) + (s.kick || 0) * 0.08 + rl * 0.7, 0.05, BZ.lerp(-0.08, -1.0, low) - rl * 0.9];
      LA = [BZ.lerp(-0.6, -0.3, low) + Math.sin(ph) * 0.3 * run, -0.3, BZ.lerp(-1.5, -0.8, low) - rl * 0.4];
    } else {
      RA = [Math.sin(ph) * 0.7 * run - air * 1.2, 0.05 + air * 0.3, -0.2 - run * 0.5]; LA = [-Math.sin(ph) * 0.7 * run - air * 1.2, -0.05 - air * 0.3, -0.2 - run * 0.5];
    }
    if (s.cast > 0) { const c = Math.min(1, s.cast); LA = [BZ.lerp(LA[0], -2.75, c), BZ.lerp(LA[1], -0.45, c), BZ.lerp(LA[2], -0.15, c)]; ik = null; }
    const fast = sw >= 0 ? 32 : 16;
    m.armR.rotation.x = ease(J, 'rax', RA[0], fast, dt); m.armR.rotation.z = ease(J, 'raz', RA[1], fast, dt); m.elbowR.rotation.x = ease(J, 'rex', RA[2], fast, dt);
    if (s.pat === 'spin360' && sw >= 0 && mode === 'glaive') m.hips.rotation.y = sw * sw * (3 - 2 * sw) * Math.PI * 2;
    if (ik) {
      // two-bone reach: the left hand goes to a point on the shaft held by the right hand
      m.root.updateMatrixWorld(true);
      const hp = IK.a.setFromMatrixPosition(m.handR.matrixWorld);
      IK.b.set(ik.dir[0], ik.dir[1], ik.dir[2]).transformDirection(m.handR.matrixWorld);
      m.armL.parent.worldToLocal(IK.t.copy(hp).addScaledVector(IK.b, ik.off));
      const sh = m.armL.position; const v = IK.v.copy(IK.t).sub(sh); const l1 = 0.32; const l2 = 0.305;
      const dist = Math.max(0.15, Math.min(v.length(), (l1 + l2) * 0.985)); v.normalize();
      const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist); const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
      const pp = IK.p.set(-0.6, -1, 0.1); pp.addScaledVector(v, -pp.dot(v)).normalize();
      const E = IK.e.copy(v).multiplyScalar(x).addScaledVector(pp, h);
      const ey = IK.u.copy(E).normalize().negate();
      const f = IK.f.copy(v).multiplyScalar(dist).sub(E).normalize();
      const ez = IK.z.copy(f).addScaledVector(ey, -f.dot(ey)).normalize();
      const ex = IK.x.crossVectors(ey, ez);
      IK.q.setFromRotationMatrix(IK.m.makeBasis(ex, ey, ez));
      m.armL.quaternion.slerp(IK.q, Math.min(1, 22 * dt));
      m.elbowL.rotation.x += (Math.atan2(-f.dot(ez), -f.dot(ey)) - m.elbowL.rotation.x) * Math.min(1, 22 * dt);
      J.lax = m.armL.rotation.x; J.laz = m.armL.rotation.z; J.lex = m.elbowL.rotation.x;
    } else {
      m.armL.rotation.y = 0;
      m.armL.rotation.x = ease(J, 'lax', LA[0], 16, dt); m.armL.rotation.z = ease(J, 'laz', LA[1], 16, dt); m.elbowL.rotation.x = ease(J, 'lex', LA[2], 16, dt);
    }
    // the head keeps looking where the hero aims while the body moves under it
    m.head.rotation.x = ease(J, 'hx', -pitch * 0.55 - lean * 0.6, 12, dt); m.head.rotation.y = -m.spine.rotation.y * 0.6 - m.hips.rotation.y;
    castAnim(m, s, dt);
    heroExtras(m, s, dt);
  };
  // the parts only some bodies carry: Sói's beast form growing in and its tail, Nhện Đồng's four back legs
  function heroExtras(m, s, dt) {
    const t = s.t || 0;
    if (m.wolf) {
      const want = m.formWant || 0; const k0 = m.formK || 0;
      const k = (m.formK = Math.abs(want - k0) < 0.002 ? want : k0 + (want - k0) * Math.min(1, dt * (want > k0 ? 5 : 7)));
      const bulge = want > 0.5 ? Math.sin(Math.min(1, k) * Math.PI) * 0.08 : 0; // swells past the full size for a moment as it changes
      m.root.scale.setScalar(1 + 0.3 * k + bulge);
      const on = k > 0.22; for (const w of m.wolf.parts) w.visible = on;
      if (on) {
        const sp = Math.min(1, (s.speed || 0) / 6);
        m.wolf.tail.rotation.y = Math.sin(t * (3 + sp * 6)) * (0.22 + sp * 0.2); m.wolf.tail.rotation.x = -0.55 + sp * 0.35 - (s.air || 0) * 0.3; m.wolf.t1.rotation.x = Math.sin(t * 2.2) * 0.08;
      }
    }
    if (m.spider) {
      const J = s.j || (s.j = {}); const act = s.act && s.act.key; const ak = act ? s.act.t : 0;
      const swing = s.swing >= 0 ? Math.sin(Math.PI * Math.min(1, s.swing)) : 0;
      const spread = Math.max(swing * 0.6, act === 'swing' || act === 'yank' ? 1 : 0, (s.air || 0) * 0.5);
      for (const L of m.spider) {
        // idle: a slow breathing sway and now and then a sharp twitch; casting: splayed wide; the net: four stabs in turn
        const tw = Math.sin(t * 2.3 + L.i * 1.7) * 0.06 + (Math.sin(t * 5.3 + L.i * 2.9) > 0.94 ? 0.2 : 0);
        let raise = 0.75 + tw + spread * 0.4; let sweep = L.sw - spread * 0.3; let bend = 1.7 - spread * 0.6 + tw * 0.6;
        if (act === 'webnet') { const k = ak / 1.3; const st = Math.max(0, Math.sin((k * 3.2 - L.i * 0.22) * Math.PI)); raise = 1.0 - st * 1.25; sweep = L.sw - 0.85 - st * 0.35; bend = 0.8 + (1 - st) * 0.7; }
        const r = dt > 0 ? 18 : 0;
        L.g.rotation.z = L.sx * (r ? ease(J, 'sr' + L.i, raise, r, dt) : raise); L.g.rotation.y = L.sx * (r ? ease(J, 'ss' + L.i, sweep, r, dt) : sweep); L.knee.rotation.z = -L.sx * (r ? ease(J, 'sb' + L.i, bend, r, dt) : bend);
      }
    }
  }
  BZ.heroExtras = heroExtras;

  // Skill body animations (js/castanim.js fills BZ.CAST_ANIM): { dur, prop, hand, beats: [k...], pose(set, k, m, s), beat(i, m, G) }.
  // `set(joint, axis, value)` blends from the running pose into the cast pose, fading in and out at the ends;
  // a prop (a hammer, a vial...) shows in the hand for the length of the cast; beats fire once each at their k.
  BZ.CAST_ANIM = BZ.CAST_ANIM || {}; BZ.CAST_PROPS = BZ.CAST_PROPS || {};
  function castAnim(m, s, dt) {
    const act = s.act; const props = m.props || (m.props = {});
    const C = act && BZ.CAST_ANIM[act.key];
    if (!C) { for (const k in props) props[k].visible = false; if (act) s.act = null; return; }
    act.t += dt; const k = act.t / C.dur;
    if (k >= 1) { s.act = null; for (const p in props) props[p].visible = false; return; }
    const w = Math.min(1, k / 0.12, (1 - k) / 0.15);
    const set = (o, ax, v) => { if (o) o.rotation[ax] += (v - o.rotation[ax]) * w; };
    C.pose(set, k, m, s);
    if (C.prop && BZ.CAST_PROPS[C.prop]) {
      let p = props[C.prop];
      if (!p) { p = props[C.prop] = BZ.CAST_PROPS[C.prop](); (C.hand === 'L' ? m.handL : m.handR).add(p); }
      p.visible = true;
    }
    if (C.beats && C.beat && window.__G) { act.b = act.b || 0; while (act.b < C.beats.length && k >= C.beats[act.b]) { C.beat(act.b, m, window.__G); act.b++; } }
  }
  BZ.heroModel = (id) => heroModel(byId(id));

  // ---------- the heavy cannon the engineer drops (built once, cloned per use) ----------
  let cannonParts = null;
  function cannonModel() {
    if (!cannonParts) {
      const base = new BZ.Builder('cannon-base');
      base.box([-0.8, 0, -0.8], [0.8, 0.3, 0.8], 'g_body2', { uv: 'fit', vary: 0 });
      base.box([-0.3, 0.3, -0.3], [0.3, 1.1, 0.3], 'g_body', { uv: 'fit', vary: 0 });
      for (const [x, z] of [[-0.95, -0.95], [0.7, -0.95], [-0.95, 0.7], [0.7, 0.7]]) base.box([x, 0, z], [x + 0.25, 0.12, z + 0.25], 'g_steel', { uv: 'fit', vary: 0 });
      const head = new BZ.Builder('cannon-head');
      head.box([-0.5, -0.3, -0.55], [0.5, 0.35, 0.55], 'g_body', { uv: 'fit', vary: 0 });
      head.box([-0.51, 0.05, -0.45], [0.51, 0.14, 0.45], 'g_orange', { uv: 'fit', vary: 0 });
      head.box([-0.18, -0.15, -1.7], [0.18, 0.2, -0.5], 'g_steel', { uv: 'fit', vary: 0 });
      head.box([-0.22, -0.19, -1.85], [0.22, 0.24, -1.65], 'g_body2', { uv: 'fit', vary: 0 });
      head.box([0.5, -0.2, -0.3], [0.8, 0.2, 0.3], 'g_red', { uv: 'fit', vary: 0 });
      cannonParts = { base: base.build({ cast: true }), head: head.build({ cast: true }) };
    }
    const root = new THREE.Group(); const b = cannonParts.base.clone(); const hd = cannonParts.head.clone(); hd.position.y = 1.3; root.add(b); root.add(hd);
    return { root, head: hd };
  }

  BZ.makeHeroes = (G) => {
    const H = { def: byId('mua'), slots: { s1: { n: 1, cd: 0 }, s2: { n: 1, cd: 0 } }, ult: 0, t: {}, decoy: null, strikes: [], effects: [], projs: [], mines: [], cannons: [], yanks: [], wolfOn: false, lunge: null, swing: null };
    const V = () => new THREE.Vector3();
    const P = () => G.player;
    const coop = () => G.coop && G.coop.on;
    const guest = () => G.coop && G.coop.guest;
    const me = () => (coop() ? G.coop.me : 'h');
    const mine = (a) => !a.by || a.by === me();
    const pow = () => G.build.powMul();
    // game-time delays: they pause with the game and run inside __sim, unlike setTimeout
    const timers = []; const later = (t, f) => timers.push({ t, f });

    // ---------- pick ----------
    function set(id) {
      const h = byId(id); H.def = h; H.id = h.id;
      for (const x of HEROES) textures(x);
      for (const m of Object.values(G.weapons.models || {})) {
        for (const k of ['handR', 'handL']) {
          const a = m.userData.parts[k]; if (!a) continue;
          a.traverse((o) => {
            if (!o.isMesh) return;
            const nm = o.userData.base || (o.userData.base = (o.material.map && o.material.map.name) || '');
            if (nm === 'bz_sleeve') { o.material.map = BZ.tex('h_' + h.id + '_sleeve'); o.material.needsUpdate = true; }
            if (nm === 'bz_glove') { o.material.map = BZ.tex('h_' + h.id + '_glove'); o.material.needsUpdate = true; }
          });
        }
      }
    }
    function reset() {
      const h = H.def; const p = P();
      const hp = Math.round(h.hp * (G.meta ? G.meta.hpMul(h.id) : 1)); p.maxHp = hp; p.hp = hp; p.invisT = 0;
      H.slots.s1 = { n: h.s1.charges || 1, cd: 0 }; H.slots.s2 = { n: h.s2.charges || 1, cd: 0 }; H.ult = 0;
      H.t = {}; H.decoy && G.scene.remove(H.decoy.g); H.decoy = null; H.strikes.length = 0; H.hurtT = 9; H.hitN = 0;
      for (const e of H.effects) if (e.m) G.scene.remove(e.m); H.effects.length = 0;
      for (const q of H.projs) G.scene.remove(q.m); H.projs.length = 0;
      for (const q of H.mines) G.scene.remove(q.m); H.mines.length = 0;
      for (const c of H.cannons) G.scene.remove(c.m.root); H.cannons.length = 0; timers.length = 0;
      H.yanks.length = 0; H.wolfOn = false; H.lunge = null; H.swing = null;
      ring.visible = false; strikeMark.visible = false;
    }
    const speedMul = () => (H.def.speed || 1) * ((H.t.vanish || 0) > 0 ? 1.2 : 1) * (H.wolfOn ? 1.35 : 1);
    const jumpMul = () => (H.wolfOn ? 1.3 : 1);
    const invuln = () => (H.t.invuln || 0) > 0 || (H.t.dash || 0) > 0 || (H.t.blades || 0) > 0;
    const storm = () => (H.t.storm || 0) > 0;
    // Hoả fights with bare fists in the thick of it, so the flame suit takes 40% off every hit
    const takenMul = (from) => ((H.t.revive || 0) > 0 ? 0.5 : 1) * ((H.t.charge || 0) > 0 ? 0.3 : 1) * (H.def.id === 'hoa' ? 0.6 : 1) * (H.wolfOn ? 0.6 : 1) * (G.weapons.takenMul ? G.weapons.takenMul(from) : 1);
    const dmgMul = () => ((H.t.vanish || 0) > 0 ? 2.5 : 1);
    const cdK = (slot) => (H.wolfOn && slot === 's1' ? 0.3 : 1);
    const critAdd = () => ((H.t.vanish || 0) > 0 ? 1 : 0);

    // ---------- casting ----------
    // A skill runs on the caster's machine: its look, its effect on the caster, and its damage through
    // G.zombies.damage (a guest's damage already travels to the host). Other players see it through 'hx'.
    // What only the host may change (freezing, summoning a turret, reviving) goes in `host`.
    function use(slot = 's1') {
      const p = P(); const h = H.def;
      if (!p.alive || G.state !== 'playing') return false;
      if (slot === 'ult') {
        if (H.ult < 1 || (H.t.ultOn || 0) > 0) { G.audio.play('deny', { gain: 0.4 }); return false; }
        if (!cast(h.ult.key)) return false;
        H.ult = 0; H.t.ultOn = h.ult.dur || 1;
        G.ui.announce(h.ult.name.toUpperCase(), h.name, 'hot'); G.audio.play('wave_start', { gain: 0.6, rate: 1.3 });
        if (G.build.has('overload')) G.gear.explode(p.pos.clone().setY(p.pos.y + 0.8), 5, 140);
        G.events.emit('skill', { hero: h.id, key: h.ult.key, ult: true });
        return true;
      }
      const S = H.slots[slot]; const def = h[slot];
      if (S.n <= 0) { G.audio.play('deny', { gain: 0.5 }); return false; }
      if (!cast(def.key)) return false;
      S.n--; if (S.cd <= 0) S.cd = def.cd * G.build.cdMul() * cdK(slot);
      if (G.build.has('overload')) G.gear.explode(p.pos.clone().setY(p.pos.y + 0.8), 4, 80);
      G.events.emit('skill', { hero: h.id, key: def.key });
      return true;
    }
    function cast(key) {
      const A = ABIL[key]; const a = A.aim ? A.aim() : {};
      if (!a) { G.audio.play('deny', { gain: 0.5 }); return false; }
      a.by = me(); a.k = key;
      H.act = { key, t: 0 };
      if (A.fx) A.fx(a);
      if (coop()) { if (guest()) G.coop.act({ k: 'hx', s: key, a }); else G.events.emit('hx', { s: key, a }); }
      if (A.host && !guest()) A.host(a, 'h');
      return true;
    }
    // ---------- aiming a throw ----------
    // Holding a throw skill's key draws the flight path and a ring where it will land; letting go throws it there.
    const aimDots = []; let aimRing = null; H.aiming = null;
    function aimable(slot) { const d = H.def[slot]; const A = d && ABIL[d.key]; return !!(A && A.throw) && (slot === 'ult' ? H.ult >= 1 : H.slots[slot] && H.slots[slot].n > 0); }
    function aimStart(slot) { if (!aimable(slot)) return use(slot); H.aiming = slot; return true; }
    function aimRelease(slot) { if (H.aiming !== slot) return false; H.aiming = null; hideAim(); return use(slot); }
    function hideAim() { for (const d of aimDots) d.visible = false; if (aimRing) aimRing.visible = false; }
    function drawAim() {
      const slot = H.aiming; if (!slot || G.state !== 'playing' || !P().alive) { if (slot && G.state !== 'playing') H.aiming = null; hideAim(); return; }
      const A = ABIL[H.def[slot].key]; const t = throwTo(A.throw); const col = H.def.color;
      if (!aimDots.length) for (let i = 0; i < 28; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false })); s.renderOrder = 9; G.scene.add(s); aimDots.push(s); }
      if (!aimRing) { aimRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false })); aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 9; G.scene.add(aimRing); }
      const pos = v3(t.p); const vel = v3(t.v); let n = 0; const step = Math.max(0.02, (t.to ? 0.9 * Math.max(0.35, v3(t.p).distanceTo(t.to) / 17) : 0.6) / 22);
      for (let i = 0; i < 60 && n < aimDots.length; i++) {
        const nx = pos.clone().addScaledVector(vel, step); vel.y -= 16 * step;
        const dir = nx.clone().sub(pos); const len = dir.length(); const wh = G.world.raycast(pos, dir.normalize(), len);
        if (wh || nx.y < 0.05) { if (wh) pos.addScaledVector(dir, wh.t); else pos.copy(nx).setY(0.05); break; }
        pos.copy(nx);
        if (pos.distanceTo(G.camera.position) > 2.2) { const d = aimDots[n++]; d.visible = true; d.position.copy(pos); d.scale.setScalar(0.2); d.material.color.setHex(col); d.material.opacity = 0.9 - n * 0.02; }
      }
      for (let i = n; i < aimDots.length; i++) aimDots[i].visible = false;
      aimRing.visible = true; aimRing.position.set(pos.x, Math.max(0.06, pos.y) + 0.04, pos.z); aimRing.scale.setScalar(A.area || 2.5); aimRing.material.color.setHex(col);
      aimRing.material.opacity = 0.55 + 0.3 * Math.sin(performance.now() / 120);
    }

    // a targeted effect a weapon sends (no cast animation): runs here and on every other screen like a skill
    function send(key, a) {
      const A = ABIL[key]; if (!A) return; a.by = me(); a.k = key;
      if (A.fx) A.fx(a);
      if (coop()) { if (guest()) G.coop.act({ k: 'hx', s: key, a }); else G.events.emit('hx', { s: key, a }); }
      if (A.host && !guest()) A.host(a, 'h');
    }
    // another player's skill: the look here, and the host-only part on the host
    function remote(key, a, by) {
      const A = ABIL[key]; if (!A || a.by === me()) return;
      if (G.coop && G.coop.castAnim) G.coop.castAnim(by || a.by, key);
      if (A.fx) A.fx(a);
      if (A.host && !guest()) A.host(a, by);
    }

    // ---------- helpers ----------
    const cam = () => { const c = G.camera; c.updateMatrixWorld(); return c; };
    const r3 = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const v3 = (a) => V().set(a[0], a[1], a[2]);
    function aimRay() { const c = cam(); const o = V(); const d = V(); c.getWorldPosition(o); c.getWorldDirection(d); if (G.tps) G.tps.fix(o, d); return { o, d }; }
    function aimPoint(max = 60) {
      const { o, d } = aimRay(); const wh = G.world.raycast(o, d, max); const zh = G.zombies.hitTest(o, d, wh ? wh.t : max);
      const t = zh ? zh.t : wh ? wh.t : max; const at = o.clone().addScaledVector(d, t); at.y = Math.max(0, zh ? zh.z.pos.y : at.y);
      return at;
    }
    // the caster's place and facing; another player's comes from their avatar
    function who(by) {
      if (!coop() || by === me()) { const p = P(); return { pos: p.pos, yaw: p.yaw, pitch: p.pitch, local: true }; }
      const a = G.coop.avatars.get(by); return a ? { pos: a.pos, yaw: a.yaw, pitch: a.pitch } : null;
    }
    const fwdOf = (w) => V().set(-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch));
    const near = (pos, r, dy = 4) => G.zombies.list.filter((z) => z.alive && Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < r * (z.T.boss ? 1 + 0.15 * z.T.scale : 1) && Math.abs(z.pos.y - pos.y) < dy);
    // damage from a skill; the 'hit' event gives damage numbers and charges the ultimate
    function hit(z, dmg, dir, opt = {}, part = 'body') {
      if (!z.alive) return false;
      const amount = dmg * pow() * dmgMul();
      const died = G.zombies.damage(z, amount, part, dir || V().set(0, 0, 1), opt.imp || 1, opt);
      G.events.emit('hit', { z, dmg: Math.round(amount), part, died, skill: true });
      return died;
    }
    const st = (kind, n = 1) => Array.from({ length: n }, () => [kind, 1]);
    function ring3(pos, r, c0, c1, life = 0.5) { G.fx.puff(V().set(pos.x, pos.y + 0.3, pos.z), { glow: true, s0: 0.6, s1: r * 2.2, life, c0, c1, a0: 1 }); }

    // thrown things (grenades, bottles, darts, mines): same arc on every machine; the caster's lands for real
    const projGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    function lob(a, color, onLand, opt = {}) {
      const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(v3(a.p)); m.scale.setScalar(opt.size || 1); G.scene.add(m); G.fx.halo(m, opt.trail || color, 1.1 * (opt.size || 1));
      H.projs.push({ m, pos: v3(a.p), vel: v3(a.v), g: opt.g === undefined ? 16 : opt.g, life: 4, onLand, a, trail: opt.trail || color });
    }
    function throwTo(maxR, g = 16) {
      const p = P(); const { o, d } = aimRay();
      const from = o.clone().addScaledVector(d, 0.6); from.y -= 0.2;
      let to = aimPoint(maxR);
      const flat = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
      if (to.y > p.pos.y + 2.5 || flat > maxR) { const k = Math.min(maxR, Math.max(4, flat)); const h = Math.hypot(d.x, d.z) || 1; to = V().set(p.pos.x + (d.x / h) * k, p.pos.y, p.pos.z + (d.z / h) * k); }
      const t = BZ.clamp(from.distanceTo(to) / 17, 0.35, 1.15);
      const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * g * t;
      return { p: r3(from), v: r3(vel), to };
    }
    function throwAim(speed = 16, up = 4) {
      const p = P(); const { o, d } = aimRay();
      const from = o.clone().addScaledVector(d, 0.6); from.y -= 0.2;
      const vel = d.clone().multiplyScalar(speed); vel.y += up;
      return { p: r3(from), v: r3(vel) };
    }
    function updateProjs(dt) {
      for (let i = H.projs.length - 1; i >= 0; i--) {
        const q = H.projs[i]; q.life -= dt; q.vel.y -= q.g * dt;
        const step = q.vel.length() * dt; const dir = q.vel.clone().normalize();
        const wh = G.world.raycast(q.pos, dir, step + 0.1);
        let hitZ = null; if (q.a.zhit && mine(q.a)) { const zh = G.zombies.hitTest(q.pos, dir, wh ? wh.t : step + 0.1); if (zh) hitZ = zh; }
        if (wh || hitZ || q.life <= 0 || q.pos.y < 0.05) {
          const at = hitZ ? q.pos.clone().addScaledVector(dir, hitZ.t) : wh ? q.pos.clone().addScaledVector(dir, Math.max(0, wh.t - 0.05)) : q.pos.clone();
          if (at.y < 0.05) at.y = 0.05;
          G.scene.remove(q.m); H.projs.splice(i, 1); q.onLand(at, q.a); continue;
        }
        q.pos.addScaledVector(q.vel, dt); q.m.position.copy(q.pos); q.m.rotation.x += dt * 10; q.m.rotation.z += dt * 7;
        G.fx.streak(q, q.pos, q.vel, q.trail, q.trail, 0.22 * (q.m.scale.x || 1), dt, 40);
      }
    }
    // a lasting effect (tornado, orb, blizzard, flame, cloud...): ticks on every machine, hurts only on the caster's
    function effect(key, a, dur, data = {}) { const e = Object.assign({ key, a, t: 0, dur, acc: 0, hitAt: new Map() }, data); H.effects.push(e); return e; }
    function ground(pos) { const g = pos.clone(); const wh = G.world.raycast(V().set(pos.x, pos.y + 0.5, pos.z), V().set(0, -1, 0), 30); g.y = wh ? pos.y + 0.5 - wh.t : 0; return g; }

    const ABIL = {
      // ---- Gió ----
      dash: {
        fx(a) {
          if (!mine(a)) return;
          const p = P(); const i = p.input;
          // along the look direction, pitch included, so looking up dashes into the air; strafe keys steer sideways
          const f = fwdOf({ yaw: p.yaw, pitch: p.pitch }); const fw = i.fwd < 0 ? -1 : (i.fwd > 0 || !i.side ? 1 : 0);
          const dv = V().set(f.x * fw + Math.cos(p.yaw) * i.side, f.y * fw, f.z * fw - Math.sin(p.yaw) * i.side).normalize();
          const dx = dv.x; const dz = dv.z;
          H.t.dash = 0.24; H.dashDir = [dv.x, dv.z, dv.y]; H.dashHit = new Set();
          ring3(p.pos, 2.2, 0xffffff, 0x56c8ff, 0.35); for (let i = 0; i < 8; i++) G.fx.puff(V().set(p.pos.x + dx * i * 0.7, p.pos.y + 0.9, p.pos.z + dz * i * 0.7), { glow: true, s0: 1, s1: 0.2, life: 0.45, c0: 0xe8f8ff, c1: 0x56c8ff, a0: 0.9, spin: 0 });
          p.vel.set(dv.x * 25, Math.max(dv.y * 25, 1.5), dv.z * 25);
          G.audio.play('heavy', { gain: 0.8, rate: 1.4 }); G.audio.play('slash', { gain: 0.6, rate: 0.8 });
          p.shake.v += 2; overlay('cyan', 0.25);
        },
      },
      gust: {
        aim() { const w = who(me()); const f = fwdOf({ yaw: w.yaw, pitch: 0 }); return { p: r3(V().set(w.pos.x, w.pos.y, w.pos.z).addScaledVector(f, 1.4)), d: r3(f) }; },
        fx(a) { const m = tornadoMesh(); m.position.copy(v3(a.p)); G.scene.add(m); effect('gust', a, 1.25, { pos: v3(a.p), dir: v3(a.d), m }); G.audio.playAt('heavy', v3(a.p), { gain: 0.9, rate: 0.6 }); G.audio.playAt('wind', v3(a.p), { gain: 0.8 }); },
        tick(e, dt) {
          e.pos.addScaledVector(e.dir, 11 * dt);
          const wh = G.world.raycast(V().set(e.pos.x, e.pos.y + 0.6, e.pos.z), e.dir, 0.6); if (wh) e.t = e.dur;
          const k = Math.min(1, e.t / 0.15, (e.dur - e.t) / 0.25); e.m.position.copy(e.pos); e.m.scale.set(k, 0.4 + 0.6 * k, k);
          e.m.children.forEach((c, i) => { c.rotation.y += dt * (14 - i * 2) * (i % 2 ? -1 : 1); c.material.opacity = (0.32 - i * 0.04) * Math.max(0.2, k); });
          for (let i = 0; i < 4; i++) { const ang = e.t * 16 + i * 1.6; const r = 0.5 + i * 0.4; G.fx.puff(V().set(e.pos.x + Math.cos(ang) * r, e.pos.y + 0.2 + i * 0.75, e.pos.z + Math.sin(ang) * r), { vel: V().set(-Math.sin(ang) * 4, 2, Math.cos(ang) * 4), s0: 0.5 + i * 0.15, s1: 0.15, life: 0.4, c0: 0xf4f8ff, c1: 0x98aab8, a0: 0.8 }); }
          if (G.rng.chance(dt * 20)) G.fx.burst(V().set(e.pos.x, e.pos.y + 0.2, e.pos.z), 2, [0x8a7a5a, 0x6a8a3a, 0xb0a890], { speed: 5, size: 0.07, life: 0.7, grav: 6 });
          if (!mine(e.a)) return;
          for (const z of near(e.pos, 2.4)) {
            const last = e.hitAt.get(z) || -1; if (e.t - last < 0.3) continue; e.hitAt.set(z, e.t);
            const out = V().set(z.pos.x - e.pos.x, 0, z.pos.z - e.pos.z).normalize().multiplyScalar(0.5).add(e.dir).normalize();
            hit(z, 45, out, { imp: 3.2 });
          }
        },
      },
      blades: {
        aim() {
          const p = P(); const list = near(p.pos, 20, 6).sort((x, y) => x.pos.distanceTo(p.pos) - y.pos.distanceTo(p.pos)).slice(0, 10);
          return list.length ? { n: list.length } : null;
        },
        fx(a) {
          if (!mine(a)) { const w = who(a.by); if (w) ring3(w.pos, 3, 0x9ae8ff, 0x56c8ff); return; }
          const p = P(); H.bladeList = near(p.pos, 20, 6).sort((x, y) => x.pos.distanceTo(p.pos) - y.pos.distanceTo(p.pos)).slice(0, 10);
          H.t.blades = 0.14 * H.bladeList.length + 0.2; H.bladeT = 0; overlay('cyan', H.t.blades); ring3(p.pos, 4, 0xffffff, 0x56c8ff, 0.5); G.fx.pop(V().set(p.pos.x, p.pos.y + 1, p.pos.z), 1.4, [0x9ae8ff, 0xffffff]);
          G.audio.play('saber_on', { gain: 0.8, rate: 1.4 });
        },
      },
      // ---- Thép ----
      invuln: { fx(a) { const w = who(a.by); if (w) { ring3(w.pos, 3, 0xfff0a0, 0xffc040, 0.6); G.fx.pop(V().set(w.pos.x, w.pos.y + 1, w.pos.z), 1.2, [0xffc040, 0xfff0a0]); } if (!mine(a)) return; H.t.invuln = H.def.s1.dur; G.audio.play('saber_on', { gain: 0.9, rate: 0.7 }); G.audio.play('buy', { gain: 0.6 }); overlay('gold', H.def.s1.dur); ring.visible = true; } },
      charge: {
        fx(a) {
          const w = who(a.by); if (!w) return;
          if (!mine(a)) { G.fx.burst(V().set(w.pos.x, w.pos.y + 0.3, w.pos.z), 14, [0x8a8478, 0x6e6a64], { speed: 3, size: 0.12, life: 0.6 }); return; }
          const p = P(); const f = fwdOf({ yaw: p.yaw, pitch: Math.max(0, p.pitch) }); H.chargeDir = [f.x, f.z, f.y]; H.t.charge = 0.55; H.chargeHit = new Set();
          G.audio.play('roar', { gain: 0.5, rate: 1.6 }); G.audio.play('heavy', { gain: 1, rate: 0.6 }); p.shake.v += 3; overlay('gold', 0.5);
        },
      },
      quake: {
        fx(a) { const w = who(a.by); if (!w) return; ring3(w.pos, 2, 0xffd890, 0x8a6a40, 0.3); later(0.3, () => ABIL.quake.slam(a)); },
        slam(a) {
          const w = who(a.by); if (!w) return; const at = V().set(w.pos.x, w.pos.y, w.pos.z);
          for (let i = 0; i < 3; i++) later(i * 0.11, () => ring3(at, 4 + i * 4, 0xffd890, 0x8a6a40, 0.55));
          G.fx.burst(at.clone().setY(at.y + 0.2), 60, [0x6e6a64, 0x8a8478, 0x4a4640, 0xffc040], { speed: 9, size: 0.2, life: 1.2 });
          G.audio.playAt('boom', at, { gain: 1.4, rate: 0.5 }); G.audio.playAt('heavy', at, { gain: 1, rate: 0.4 });
          const d = P().pos.distanceTo(at); if (d < 30) P().shake.v += (30 - d) * 0.9;
          if (!mine(a)) return;
          for (const z of near(at, 12, 3)) { const dd = z.pos.distanceTo(at); const dir = V().set(z.pos.x - at.x, 0, z.pos.z - at.z).normalize(); hit(z, 340 * (1 - dd / 16), dir, { imp: 5, status: st('chill', 3) }); }
        },
      },
      // ---- Y Tá ----
      // Y Tá's left pistol: a healing dart that mends whoever it reaches (a.to is that player's id)
      healdart: {
        fx(a) {
          const at = v3(a.p); G.fx.pop(at, 0.6, [0x60e070, 0xc0ffc0]); G.fx.burst(at, 10, [0x60e070, 0xffffff], { speed: 2, size: 0.07, life: 0.6, grav: -2 });
          if (a.to !== me()) return; const p = P(); const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + (a.n || 10));
          if (p.hp > before) { G.ui.pop('+' + Math.round(p.hp - before) + ' máu', 'heal'); G.audio.play('pickup', { gain: 0.4, rate: 1.6 }); }
        },
      },
      heal: {
        fx(a) {
          const w = who(a.by); if (!w) return;
          G.fx.burst(V().set(w.pos.x, w.pos.y + 0.8, w.pos.z), 26, [0x60e070, 0xc0ffc0, 0xffffff], { speed: 3, size: 0.1, life: 1.2, grav: -3, drag: 1 });
          ring3(w.pos, 3.2, 0xffffff, 0x60e070, 0.7); for (let i = 0; i < 8; i++) G.fx.puff(V().set(w.pos.x + Math.cos(i) * 0.5, w.pos.y + 0.2 + i * 0.3, w.pos.z + Math.sin(i) * 0.5), { glow: true, vel: V().set(0, 2.2, 0), s0: 0.4, s1: 0.1, life: 1, c0: 0xffffff, c1: 0x60e070, a0: 1, spin: 0, delay: i * 0.05 });
          if (!mine(a)) return;
          const p = P(); const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + 50); H.t.heal = 4; chargeHeal(p.hp - before + 30);
          G.audio.play('pickup', { gain: 0.9, rate: 1.2 }); G.ui.pop('+50 máu', 'heal'); overlay('green', 0.9);
        },
        host(a) { const w = who(a.by); if (!w) return; for (const al of G.allies.list) if (al.alive && Math.hypot(al.pos.x - w.pos.x, al.pos.z - w.pos.z) < 10) { al.hp = BZ.ALLY.hp; G.fx.burst(V().set(al.pos.x, 1.2, al.pos.z), 10, [0x60e070, 0xc0ffc0], { speed: 2, size: 0.1, life: 1, grav: -3 }); } },
      },
      dart: { throw: 26, area: 3.5,
        aim() { const t = throwTo(26); delete t.to; t.zhit = 1; return t; },
        fx(a) { lob(a, 0x9aff40, (at, aa) => cloudAt(at, aa, 3.5, 4, 4)); G.audio.play('swipe', { gain: 0.6, rate: 1.6 }); },
      },
      revive: {
        fx(a) {
          const w = who(a.by); if (!w) return;
          ring3(w.pos, 15, 0xc0ffc0, 0x60e070, 0.8);
          for (let i = 0; i < 30; i++) G.fx.puff(V().set(w.pos.x + G.rng.range(-1, 1), w.pos.y + i * 0.25, w.pos.z + G.rng.range(-1, 1)), { glow: true, vel: V().set(0, 3, 0), s0: 0.5, s1: 0.1, life: 0.9, c0: 0xe0ffe0, c1: 0x60e070, a0: 1 });
          G.audio.play('pickup', { gain: 1, rate: 0.7 }); G.audio.play('wave_clear', { gain: 0.6, rate: 1.2 });
          const p = P(); if (!p.alive) { p.alive = true; G.ui.banner('HỒI SINH', 'đồng đội kéo bạn dậy', 1.6); }
          const before = p.hp; p.hp = p.maxHp; overlay('green', 1.2);
          if (mine(a)) { H.t.revive = 6; chargeHeal(p.maxHp - before); }
        },
        host() { for (const al of G.allies.list) if (al.alive) al.hp = BZ.ALLY.hp; },
      },
      // ---- Mưa Đạn ----
      storm: { fx(a) { const w = who(a.by); if (w) { ring3(w.pos, 3, 0xffe0a0, 0xff7a30, 0.5); G.fx.burst(V().set(w.pos.x, w.pos.y + 1, w.pos.z), 20, [0xffd060, 0xff7a30, 0xffffff], { speed: 7, size: 0.08, life: 0.5, grav: 4 }); } if (!mine(a)) return; H.t.storm = H.def.s1.dur; G.audio.play('streak', { gain: 0.7 }); G.audio.play('rack', { gain: 0.9 }); overlay('orange', H.def.s1.dur); } },
      cluster: { throw: 24, area: 3.6,
        aim() { const t = throwTo(24); delete t.to; return t; },
        fx(a) {
          lob(a, 0x4a5a2a, (at, aa) => {
            G.audio.playAt('land', at, { gain: 0.6, rate: 1.4 });
            if (!mine(aa)) return;
            later(0.55, () => {
              G.gear.explode(at.clone().setY(at.y + 0.3), 3.6, 110 * pow());
              for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2 + G.rng.range(-0.3, 0.3); const r = G.rng.range(2.2, 3.6); const p2 = V().set(at.x + Math.cos(ang) * r, at.y + 0.3, at.z + Math.sin(ang) * r); G.fx.burst(p2, 4, [0x4a5a2a, 0x2a2a2a], { speed: 3, size: 0.08, life: 0.3 }); later(0.26 + i * 0.09, () => G.gear.explode(p2, 2.6, 70 * pow())); }
            });
          });
          G.audio.play('swipe', { gain: 0.7, rate: 0.9 });
        },
      },
      drones: { fx(a) { const w = who(a.by); if (w) { ring3(w.pos, 4, 0xffe0a0, 0xff7a30, 0.6); for (const sd of [-1, 1]) G.fx.pop(V().set(w.pos.x + Math.cos(w.yaw) * 0.45 * sd, w.pos.y + 1.75, w.pos.z - Math.sin(w.yaw) * 0.45 * sd), 0.8, [0xff7a30, 0xffd060]); } effect('drones', a, 7, { acc: 0, side: 1 }); if (mine(a)) overlay('orange', 7); G.audio.play('rack', { gain: 0.8, rate: 0.7 }); },
        tick(e, dt) {
          const w = who(e.a.by); if (!w) return; e.acc += dt; if (e.acc < 0.09) return; e.acc = 0; e.side = -e.side;
          const sh = V().set(w.pos.x + Math.cos(w.yaw) * 0.45 * e.side, w.pos.y + 1.75, w.pos.z - Math.sin(w.yaw) * 0.45 * e.side);
          let best = null; let bd = 30;
          for (const z of G.zombies.list) { if (!z.alive) continue; const d = z.pos.distanceTo(sh); if (d < bd && G.world.lineOfSight(sh, V().set(z.pos.x, z.pos.y + 1.2 * z.T.scale, z.pos.z))) { bd = d; best = z; } }
          if (!best) return;
          const head = G.rng.chance(0.3); const end = V().set(best.pos.x, best.pos.y + (head ? 1.7 : 1.1) * best.T.scale, best.pos.z);
          G.fx.tracer(sh, end); G.fx.muzzle(sh); G.audio.playAt('smg', sh, { gain: 0.35, rate: 1.3 });
          if (mine(e.a)) hit(best, head ? 48 : 30, end.clone().sub(sh).normalize(), { imp: 0.6 }, head ? 'head' : 'body');
        } },
      // ---- Bóng ----
      blink: {
        aim() {
          const p = P(); const o = V().set(p.pos.x, p.pos.y + 1.0, p.pos.z); const d = fwdOf({ yaw: p.yaw, pitch: BZ.clamp(p.pitch, -0.6, 1.2) });
          const wh = G.world.raycast(o, d, 9); let t = wh ? Math.max(0, wh.t - 0.6) : 9; const at = V();
          for (; t > 0.5; t -= 0.4) { at.set(p.pos.x + d.x * t, Math.max(0, p.pos.y + d.y * t), p.pos.z + d.z * t); if (!G.world.overlaps([at.x - 0.3, at.y + 0.05, at.z - 0.3], [at.x + 0.3, at.y + 1.7, at.z + 0.3])) return { from: r3(p.pos), to: r3(at) }; }
          return null;
        },
        fx(a) {
          const puff = (q) => G.fx.burst(V().set(q.x, q.y + 1, q.z), 22, [0x8a40ff, 0xc080ff, 0x2a1a4a], { speed: 3.5, size: 0.14, life: 0.7, grav: -1.5, drag: 1.5 });
          const from = v3(a.from); const at = v3(a.to); puff(from); puff(at);
          if (!mine(a)) return;
          const p = P(); const d = at.clone().sub(from).setY(0).normalize();
          p.pos.copy(at); p.vel.set(d.x * 4, Math.max(0, p.vel.y), d.z * 4);
          G.audio.play('screech', { gain: 0.35, rate: 1.8 }); G.audio.play('heavy', { gain: 0.6, rate: 1.6 });
          if (H.decoy) G.scene.remove(H.decoy.g);
          const m = heroModel(H.def); m.root.position.copy(from); m.root.rotation.y = p.yaw + Math.PI;
          m.root.traverse((q) => { if (q.isMesh) { q.material = q.material.clone(); q.material.transparent = true; q.material.opacity = 0.55; q.material.emissive = new THREE.Color(0x5020a0); q.castShadow = false; } });
          G.scene.add(m.root); H.decoy = { g: m.root, m, pos: m.root.position, t: 3, alive: true, isDecoy: true };
          overlay('purple', 0.3);
        },
      },
      shuriken: {
        aim() { const { o, d } = aimRay(); return { o: r3(o), d: r3(d) }; },
        fx(a) {
          const o = v3(a.o); const d = v3(a.d); const side = V().crossVectors(d, V().set(0, 1, 0)).normalize();
          G.audio.playAt('swipe', o, { gain: 0.7, rate: 1.9 });
          for (const s of [-0.1, 0, 0.1]) {
            const dir = d.clone().addScaledVector(side, s).normalize(); const wh = G.world.raycast(o, dir, 40); const max = wh ? wh.t : 40;
            effect('shuriken', a, Math.max(0.12, max / 55), { from: o.clone().addScaledVector(dir, 0.5), dir, len: max, m: starMesh() });
            if (!mine(a)) continue;
            const skip = new Set(); let from = o.clone();
            for (let n = 0; n < 3; n++) { const zh = G.zombies.hitTest(from, dir, max - from.distanceTo(o), skip); if (!zh) break; skip.add(zh.z); hit(zh.z, 75, dir, { cut: 'blade', imp: 1.2 }, zh.part); from = from.clone().addScaledVector(dir, zh.t + 0.05); }
          }
        },
        tick(e) { const k = Math.min(1, e.t / e.dur); e.m.position.copy(e.from).addScaledVector(e.dir, e.len * k); e.m.rotation.y += 0.9; if (k >= 1) e.t = e.dur; },
      },
      vanish: {
        fx(a) {
          const w = who(a.by); if (w) G.fx.burst(V().set(w.pos.x, w.pos.y + 1, w.pos.z), 40, [0x8a40ff, 0x2a1a4a, 0xc080ff], { speed: 4, size: 0.16, life: 0.9, grav: -1 });
          G.audio.play('screech', { gain: 0.3, rate: 2 });
          if (!mine(a)) { const av = G.coop && G.coop.avatars.get(a.by); if (av) av.vanishT = 7; return; }
          H.t.vanish = 7; P().invisT = 7; overlay('purple', 7);
        },
        host(a, by) { if (by === 'h' || by === me()) return; const av = G.coop.avatars.get(by); if (av && av.target) av.target.invisT = 7; },
      },
      // ---- Pháo Thủ ----
      strike: {
        aim() { const at = aimPoint(70); return { at: r3(at) }; },
        fx(a) {
          const at = v3(a.at);
          if (mine(a)) { strikeMark.position.set(at.x, at.y + 0.05, at.z); strikeMark.visible = true; G.audio.play('marker', { gain: 1 }); }
          G.audio.play('wave_start', { gain: 0.5, rate: 1.6 });
        },
        host(a) { strikeAt(v3(a.at)); },
      },
      mine: { throw: 16, area: 2,
        aim() { const t = throwTo(16); delete t.to; return t; },
        fx(a) {
          lob(a, 0x3a3a3a, (at, aa) => {
            G.audio.playAt('clank', at, { gain: 0.5, rate: 1.5 });
            const m = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0x3a3a34 })); const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2a20 })); l.position.y = 0.07; m.add(b); m.add(l);
            const g = ground(at); m.position.copy(g); G.scene.add(m);
            if (H.mines.length >= 6) { const o = H.mines.shift(); G.scene.remove(o.m); }
            H.mines.push({ m, light: l, pos: g, t: 0, life: 25, a: aa, id: aa.id });
          });
          G.audio.play('swipe', { gain: 0.5, rate: 1.2 });
        },
      },
      minepop: { fx(a) { const q = H.mines.find((x) => x.id === a.id); if (q) { G.scene.remove(q.m); H.mines.splice(H.mines.indexOf(q), 1); } } },
      barrage: {
        aim() { const p = P(); return { p: r3(p.pos), d: r3(V().set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw))) }; },
        fx(a) {
          const o = v3(a.p); const d = v3(a.d); const side = V().set(-d.z, 0, d.x);
          G.audio.play('wave_start', { gain: 0.6, rate: 0.8 });
          if (!mine(a)) return;
          for (let i = 0; i < 20; i++) {
            const t = 6 + i * 1.5; const at = o.clone().addScaledVector(d, t).addScaledVector(side, G.rng.range(-2.5, 2.5));
            H.strikes.push({ t: 0.6 + i * 0.15, x: at.x, z: at.z, y: o.y, mark: true });
          }
        },
      },
      // ---- Băng ----
      freeze: {
        fx(a) {
          const w = who(a.by); if (!w) return; const p = w.pos;
          for (let i = 0; i < 40; i++) { const ang = (i / 40) * Math.PI * 2; G.fx.burst(V().set(p.x + Math.cos(ang) * 1.2, p.y + 0.4, p.z + Math.sin(ang) * 1.2), 1, [0xbfefff, 0x60d8ff, 0xffffff], { dir: V().set(Math.cos(ang), 0.15, Math.sin(ang)), push: 12, speed: 1, size: 0.14, life: 0.8, grav: 2, drag: 1.2, bounce: 0 }); }
          G.audio.playAt('saber_hit', p, { gain: 1, rate: 1.8 }); G.audio.playAt('clank', p, { gain: 0.8, rate: 1.6 });
          if (mine(a)) { overlay('blue', 0.6); const n = G.zombies.list.filter((z) => z.alive && Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 9).length; G.ui.pop(n ? `đóng băng ${n}` : 'không có zombie gần', 'heal'); }
        },
        host(a) { const w = who(a.by); if (w) freezeAt(w.pos); },
      },
      lance: {
        aim() { const { o, d } = aimRay(); return { o: r3(o), d: r3(d) }; },
        fx(a) {
          const o = v3(a.o); const d = v3(a.d); const wh = G.world.raycast(o, d, 35); const max = wh ? wh.t : 35;
          for (let t = 0.8; t < max; t += 0.45) G.fx.puff(o.clone().addScaledVector(d, t).add(V().set(0, -0.15, 0)), { glow: true, s0: 0.35, s1: 0.06, life: 0.35 + t * 0.006, c0: 0xe8fbff, c1: 0x60c8ff, a0: 1 });
          G.fx.burst(o.clone().addScaledVector(d, max), 16, [0xdff6ff, 0x9ad8ff, 0xffffff], { speed: 4, size: 0.1, life: 0.6 });
          G.fx.pop(o.clone().addScaledVector(d, 0.8), 0.7, [0x9ad8ff, 0xffffff]);
          G.audio.playAt('saber_hit', o, { gain: 0.8, rate: 2.2 }); G.audio.playAt('clank', o, { gain: 0.5, rate: 2 });
          if (!mine(a)) return;
          const skip = new Set(); let from = o.clone();
          for (let n = 0; n < 8; n++) { const zh = G.zombies.hitTest(from, d, max - from.distanceTo(o), skip); if (!zh) break; skip.add(zh.z); hit(zh.z, 170, d, { imp: 0.8, status: st('chill', 2) }, zh.part); from = from.clone().addScaledVector(d, zh.t + 0.05); }
        },
      },
      blizzard: { fx(a) { effect('blizzard', a, 8); if (mine(a)) overlay('blue', 8); G.audio.play('wind', { gain: 0.6 }); },
        tick(e, dt) {
          const w = who(e.a.by); if (!w) return;
          for (let i = 0; i < 4; i++) { const ang = G.rng.range(0, 6.3); const r = G.rng.range(1, 14); G.fx.puff(V().set(w.pos.x + Math.cos(ang) * r, w.pos.y + G.rng.range(0.3, 4), w.pos.z + Math.sin(ang) * r), { vel: V().set(Math.sin(e.t * 3) * 3, -2, 1), s0: 0.12, s1: 0.06, life: 0.9, c0: 0xffffff, c1: 0xbfe8ff, a0: 0.9 }); }
          e.acc += dt; if (e.acc < 0.5 || !mine(e.a)) return; e.acc = 0;
          for (const z of near(w.pos, 14, 5)) hit(z, 16, V().set(z.pos.x - w.pos.x, 0, z.pos.z - w.pos.z).normalize(), { imp: 0.2, status: st('chill') });
        } },
      // ---- Hoả ----
      molotov: { throw: 22, area: 3,
        aim() { const t = throwTo(22); delete t.to; return t; },
        fx(a) { lob(a, 0xc87a2a, (at, aa) => { G.fx.burst(at, 20, [0xffd060, 0xff8a20, 0x8a8a8a], { speed: 4, size: 0.1, life: 0.6 }); G.audio.playAt('impact', at, { gain: 0.8, rate: 1.6 }); fireAt(at, aa, 3.2, 5); }); G.audio.play('swipe', { gain: 0.6, rate: 1.1 }); },
      },
      rocketjump: {
        fx(a) {
          const w = who(a.by); if (!w) return; const at = V().set(w.pos.x, w.pos.y + 0.2, w.pos.z);
          G.fx.explosion(at, 0.55); G.audio.playAt('boom', at, { gain: 0.9, rate: 1.3 });
          if (!mine(a)) return;
          const p = P(); p.vel.x += -Math.sin(p.yaw) * 7; p.vel.z += -Math.cos(p.yaw) * 7; p.vel.y = 13; p.onGround = false; p.shake.v += 3; H.t.rj = 1.2;
          for (const z of near(at, 3.5)) hit(z, 60, V().set(z.pos.x - at.x, 0, z.pos.z - at.z).normalize(), { imp: 2.5, status: st('burn') });
        },
      },
      dragon: { fx(a) { effect('dragon', a, 6); if (mine(a)) overlay('orange', 6); G.audio.play('rocket', { gain: 0.6, rate: 0.5 }); },
        tick(e, dt) {
          const w = who(e.a.by); if (!w) return; const f = fwdOf(w); const mouth = V().set(w.pos.x, w.pos.y + 1.4, w.pos.z).addScaledVector(f, 0.7);
          for (let i = 0; i < 3; i++) { const sp = f.clone().add(V().set(G.rng.range(-0.18, 0.18), G.rng.range(-0.12, 0.12), G.rng.range(-0.18, 0.18))).normalize(); G.fx.puff(mouth.clone(), { glow: true, vel: sp.multiplyScalar(G.rng.range(11, 15)), drag: 1.2, s0: 0.25, s1: 1.3, life: 0.65, c0: 0xffe080, c1: 0xff3a10, a0: 1 }); }
          e.acc += dt; if (e.acc < 0.1 || !mine(e.a)) return; e.acc = 0;
          for (const z of near(w.pos, 10.5, 4)) {
            const to = V().set(z.pos.x - mouth.x, z.pos.y + 1 - mouth.y, z.pos.z - mouth.z); const d = to.length(); if (d > 10.5) continue;
            if (to.normalize().dot(f) < 0.88 || !G.world.lineOfSight(mouth, V().set(z.pos.x, z.pos.y + 1, z.pos.z))) continue;
            const last = e.hitAt.get(z) || -1; const burn = e.t - last > 0.5; if (burn) e.hitAt.set(z, e.t);
            hit(z, 13, f, { imp: 0.25, status: burn ? st('burn') : undefined });
          }
        } },
      // ---- Sấm ----
      orb: {
        aim() { const w = who(me()); const f = fwdOf({ yaw: w.yaw, pitch: P().pitch }); return { p: r3(V().set(w.pos.x, w.pos.y + 1.2, w.pos.z).addScaledVector(f, 1)), d: r3(f) }; },
        fx(a) { const m = orbMesh(); m.position.copy(v3(a.p)); G.scene.add(m); const e = effect('orb', a, 4, { pos: v3(a.p), dir: v3(a.d), m }); e.light = m.userData.light; G.audio.play('saber_on', { gain: 0.6, rate: 1.8 }); },
        tick(e, dt) {
          const wh = G.world.raycast(e.pos, e.dir, 0.5); if (!wh) e.pos.addScaledVector(e.dir, 5 * dt);
          e.m.position.copy(e.pos); e.light.intensity = 5 + Math.sin(e.t * 40) * 2; const fl = 1 + Math.sin(e.t * 37) * 0.12; e.m.children[0].scale.setScalar(fl); e.m.children[1].scale.setScalar(1.6 - fl * 0.4); e.m.rotation.y += dt * 6; e.m.rotation.x += dt * 4;
          if (G.rng.chance(dt * 14)) { const r = V().set(G.rng.range(-1, 1), G.rng.range(-1, 1), G.rng.range(-1, 1)).normalize().multiplyScalar(G.rng.range(0.8, 1.4)); G.fx.arc(e.pos, e.pos.clone().add(r), 0xc8ecff); }
          if (e.t > e.dur - 0.25) e.m.scale.setScalar(Math.max(0.01, (e.dur - e.t) / 0.25));
          e.acc += dt; if (e.acc < 0.3) return; e.acc = 0;
          const zs = near(e.pos, 4.5, 4).slice(0, 3);
          for (const z of zs) { G.fx.arc(e.pos, V().set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z), 0x9ad8ff); if (mine(e.a)) hit(z, 34, V().set(z.pos.x - e.pos.x, 0, z.pos.z - e.pos.z).normalize(), { imp: 0.4, status: st('shock') }); }
          if (zs.length) G.audio.playAt('saber_hit', e.pos, { gain: 0.5, rate: 2.4 });
        } },
      smite: {
        aim() { return { at: r3(aimPoint(60)) }; },
        fx(a) {
          const at = v3(a.at); ring3(at, 3, 0xe0f0ff, 0x60a0ff, 0.45);
          later(0.45, () => {
            G.sky.strike(at, true);
            if (!mine(a)) return;
            for (const z of near(at, 3, 5)) hit(z, 125, V().set(z.pos.x - at.x, 0, z.pos.z - at.z).normalize(), { imp: 2, status: st('shock') });
          });
        },
      },
      thunder: { fx(a) { const w = who(a.by); if (w) { ring3(w.pos, 5, 0xffffff, 0x60a0ff, 0.6); for (const sd of [-1, 1]) G.fx.arc(V().set(w.pos.x + sd * 0.5, w.pos.y + 2, w.pos.z), V().set(w.pos.x + sd * 1.2, w.pos.y + 8, w.pos.z), 0xe0f0ff); } effect('thunder', a, 6); if (mine(a)) overlay('blue', 6); G.audio.play('thunder', { gain: 0.8 }); },
        tick(e, dt) {
          const w = who(e.a.by); if (!w) return; e.acc += dt; if (e.acc < 0.22) return; e.acc = 0;
          const zs = near(w.pos, 25, 8);
          if (!zs.length) return;
          const z = zs[G.rng.int(0, zs.length - 1)]; const at = V().set(z.pos.x, z.pos.y, z.pos.z);
          G.sky.strike(at, true);
          if (mine(e.a)) hit(z, 130, V().set(0, 0, 1), { imp: 1.5, status: st('shock') });
        } },
      // ---- Độc ----
      cloud: { throw: 22, area: 4.5,
        aim() { const t = throwTo(22); delete t.to; return t; },
        fx(a) { lob(a, 0x6a9a30, (at, aa) => { G.audio.playAt('gore', at, { gain: 0.6, rate: 0.7 }); cloudAt(at, aa, 4.5, 6, 1); }); G.audio.play('swipe', { gain: 0.6, rate: 1.1 }); },
      },
      drain: {
        // any zombie in reach can be drained; poisoned ones give the full drain
        aim() { const p = P(); return near(p.pos, 14, 6).length ? {} : null; },
        fx(a) {
          const w = who(a.by); if (!w) return; const me3 = V().set(w.pos.x, w.pos.y + 1.2, w.pos.z); let n = 0;
          for (const z of near(w.pos, 14, 6)) { const pz = poisoned(z); n += pz ? 1 : 0.5; G.fx.arc(V().set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z), me3, 0x9aff40); if (mine(a)) hit(z, pz ? 70 : 35, V().set(z.pos.x - w.pos.x, 0, z.pos.z - w.pos.z).normalize(), { imp: 0.6 }); }
          G.audio.playAt('saber_hit', me3, { gain: 0.7, rate: 0.7 });
          if (mine(a)) { const p = P(); const amt = Math.min(45, Math.round(n * 7)); p.hp = Math.min(p.maxHp, p.hp + amt); G.ui.pop('+' + amt + ' máu', 'heal'); overlay('green', 0.5); }
        },
      },
      plague: { fx(a) {
          const w = who(a.by); if (!w) return; ring3(w.pos, 18, 0xc0ff80, 0x3a8a20, 0.7);
          G.audio.playAt('gore', w.pos, { gain: 1.2, rate: 0.4 }); G.audio.playAt('boom', w.pos, { gain: 0.6, rate: 0.6 });
          effect('plague', a, 8); if (!mine(a)) return; overlay('green', 1);
          for (const z of near(w.pos, 18, 6)) hit(z, 20, V().set(z.pos.x - w.pos.x, 0, z.pos.z - w.pos.z).normalize(), { imp: 0.5, status: st('poison', 5) });
        },
        tick(e, dt) {
          const w = who(e.a.by); if (!w) return;
          if (G.rng.chance(dt * 12)) { const ang = G.rng.range(0, 6.3); const r = G.rng.range(0.5, 8); G.fx.puff(V().set(w.pos.x + Math.cos(ang) * r, w.pos.y + 0.2, w.pos.z + Math.sin(ang) * r), { vel: V().set(0, 0.8, 0), s0: 0.4, s1: 1.2, life: 1.2, c0: 0x9aff40, c1: 0x2a5a10, a0: 0.5 }); }
          e.acc += dt; if (e.acc < 0.5 || !mine(e.a)) return; e.acc = 0;
          for (const z of near(w.pos, 8, 4)) hit(z, 4, V().set(0, 0, 1), { imp: 0, status: st('poison') });
        } },
      // ---- Kỹ Sư ----
      turret: {
        // he kneels and hammers for ~1 s (CAST_ANIM.turret): a blue blueprint grows with every blow, the turret itself drops in after the last one
        fx(a) {
          const w = who(a.by); if (!w) return;
          const f = fwdOf({ yaw: w.yaw, pitch: 0 }); const at = V().set(w.pos.x, w.pos.y, w.pos.z).addScaledVector(f, 2);
          const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.9).translate(0, 0.62, 0), new THREE.MeshBasicMaterial({ color: 0x60c8ff, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
          ghost.position.copy(at); ghost.scale.set(1, 0.05, 1); G.scene.add(ghost);
          [0.29, 0.48, 0.67, 0.86].forEach((t, i) => later(t, () => { ghost.scale.y = 0.3 + 0.25 * i; G.fx.burst(V().set(at.x, at.y + 0.2 + i * 0.25, at.z), 8, [0xffb020, 0xffffff, 0x60c8ff], { speed: 3.5, size: 0.07, life: 0.4, grav: 6 }); G.audio.playAt('clank', at, { gain: 0.6, rate: 0.9 + i * 0.12 }); }));
          later(1.0, () => G.scene.remove(ghost));
        },
        host(a, by) { const w = who(a.by === me() ? me() : by); if (!w) return; const pos = w.pos.clone(); const yaw = w.yaw; later(1.0, () => G.gear.placeTurret({ pos, yaw })); },
      },
      repair: {
        fx(a) {
          const w = who(a.by); if (!w) return; ring3(w.pos, 10, 0x9ad8ff, 0x3a7ad8, 0.5);
          G.fx.burst(V().set(w.pos.x, w.pos.y + 1, w.pos.z), 24, [0x9ad8ff, 0xffffff, 0xffb020], { speed: 3, size: 0.08, life: 0.8, grav: -2 });
          G.audio.play('buy', { gain: 0.7, rate: 0.8 });
          if (mine(a)) { const p = P(); p.armor = Math.min(100, p.armor + 60); G.ui.pop('+60 giáp', 'heal'); }
        },
        host(a) { const w = who(a.by); if (!w) return; for (const al of G.allies.list) if (al.alive && Math.hypot(al.pos.x - w.pos.x, al.pos.z - w.pos.z) < 10) al.hp = Math.min(BZ.ALLY.hp, al.hp + 60); },
      },
      // ---- Sói ----
      // Vồ cắn: a ballistic leap to where the crosshair points (pitch included), a bite where he lands
      lunge: {
        aim() {
          const p = P(); const w = H.wolfOn ? 1 : 0; const R = w ? 9.5 : 8;
          const d = fwdOf({ yaw: p.yaw, pitch: BZ.clamp(p.pitch, -0.45, 1.15) });
          const o = V().set(p.pos.x, p.pos.y + 1.0, p.pos.z); const wh = G.world.raycast(o, d, R);
          const t = wh ? Math.max(0.6, wh.t - 0.55) : R; const to = o.clone().addScaledVector(d, t); to.y = Math.max(0, to.y - 1.0);
          return { from: r3(p.pos), to: r3(to), w };
        },
        fx(a) {
          const from = v3(a.from); const to = v3(a.to);
          ring3(from, 2.2, 0xfff0d0, a.w ? 0xff9a40 : 0xd08a40, 0.35);
          G.fx.burst(from.clone().setY(from.y + 0.15), 18, [0x8a7a5a, 0x6a5a40, 0xc8b890], { speed: 4.5, size: 0.12, life: 0.6, grav: 9 });
          G.audio.playAt('roar', from, { gain: 0.5, rate: a.w ? 1.05 : 1.55 }); G.audio.playAt('heavy', from, { gain: 0.8, rate: 1.1 });
          if (!mine(a)) { later(0.45, () => biteFx(to, a.w)); return; }
          const p = P(); const T = 0.48; const g = BZ.MOVE.gravity;
          const v = to.clone().sub(p.pos).divideScalar(T); v.y += 0.5 * g * T;
          p.vel.copy(v); p.onGround = false; H.lunge = { t: 0, T, v: v.clone(), w: a.w, done: false }; H.t.lunge = 1.0;
          p.shake.v += 2; overlay(a.w ? 'red' : 'orange', 0.3);
        },
      },
      // Tru gọi bầy: the howl scatters the zombies near him (host) and three spirit wolves run out to fight
      howl: {
        fx(a) {
          const w = who(a.by); if (!w) return; const at = V().set(w.pos.x, w.pos.y, w.pos.z);
          howlFx(at, 10, 0xd8e8ff, 0x7ab0ff);
          const root = new THREE.Group(); G.scene.add(root);
          const wolves = [-1, 0, 1].map((k) => { const m = spiritWolf(); const yaw = w.yaw + k * 0.8; m.g.position.set(at.x - Math.sin(yaw) * 0.8, at.y, at.z - Math.cos(yaw) * 0.8); m.g.rotation.y = yaw + Math.PI; root.add(m.g); return Object.assign(m, { yaw: yaw + Math.PI, bite: 0.2 + 0.15 * (k + 1), ph: k, jump: 0, tgt: null, home: k }); });
          effect('howl', a, 8, { m: root, wolves, own: true });
          if (mine(a)) overlay('blue', 0.6);
        },
        host(a) { const w = who(a.by); if (!w) return; for (const z of near(w.pos, 10, 4)) { if (z.T.boss) continue; z.fearT = 2.5; z.fearFrom = w.pos.clone(); z.windT = -1; } },
        tick(e, dt) { stepWolves(e, dt); },
      },
      // Hoá Sói: 12 s as the beast (claws in hand, bigger body); the end is sent as 'wolfend' so everyone sees the change back
      werewolf: {
        fx(a) {
          const w = who(a.by); if (!w) return; transformFx(V().set(w.pos.x, w.pos.y, w.pos.z), true);
          if (!mine(a)) return;
          H.t.wolf = 12; H.wolfOn = true; G.weapons.give('claws'); if (H.slots.s1.cd > 1.2) H.slots.s1.cd = 1.2;
          const p = P(); p.shake.v += 6; overlay('red', 0.9); G.hitStop = Math.max(G.hitStop || 0, 0.08);
          for (const z of near(p.pos, 5, 3)) hit(z, 40, V().set(z.pos.x - p.pos.x, 0, z.pos.z - p.pos.z).normalize(), { imp: 4.5 });
        },
      },
      wolfend: { fx(a) { const w = who(a.by); if (w) transformFx(V().set(w.pos.x, w.pos.y, w.pos.z), false); } },
      // ---- Nhện Đồng ----
      // Đu tơ: a line to the crosshair's hit point, then a reeling swing to it; a wall with a roof just above lands him on the roof
      swing: {
        aim() {
          const { o, d } = aimRay(); const wh = G.world.raycast(o, d, 34); if (!wh) return null;
          const at = o.clone().addScaledVector(d, wh.t); const p = P();
          if (at.distanceTo(V().set(p.pos.x, p.pos.y + 1.4, p.pos.z)) > 31) return null;
          return { at: r3(at), n: wh.normal.map((x) => +x.toFixed(2)) };
        },
        fx(a) {
          const at = v3(a.at); webSplat(at, v3(a.n));
          G.audio.playAt('swipe', at, { gain: 0.8, rate: 2.2 }); G.audio.play('swipe', { gain: 0.5, rate: 0.7 });
          const e = effect('webline', a, mine(a) ? 1.9 : 1.1, { at, m: webLine(), swing: true, own: true });
          if (!mine(a)) return;
          const p = P(); const n = v3(a.n); let tgt = at.clone(); let roof = false;
          if (Math.abs(n.y) < 0.5) {
            // a wall: look for a roof just above the hook, and aim to land a step in from its edge
            const probe = V().set(at.x - n.x * 0.9, at.y + 4.5, at.z - n.z * 0.9); const dn = G.world.raycast(probe, V().set(0, -1, 0), 8);
            const top = dn ? probe.y - dn.t : -99;
            if (dn && dn.t > 0.05 && top > at.y - 0.8 && top < at.y + 4.3) { tgt = V().set(at.x - n.x * 1.1, top + 0.4, at.z - n.z * 1.1); roof = true; }
            else tgt = at.clone().addScaledVector(n, 0.7).setY(Math.max(0, at.y - 1.3));
          } else if (n.y > 0.5) tgt.y += 0.25;
          else tgt = at.clone().setY(Math.max(0, at.y - 2.0));
          H.swing = { at, tgt, roof, t: 0, e }; H.t.swing = 1.9; p.onGround = false; p.vel.y = Math.max(p.vel.y, 5); p.shake.v += 1.5;
        },
      },
      // Kéo tơ: a line onto the zombie under the crosshair (or the nearest in a thin cone); the host drags it in and roots it and two beside it
      yank: {
        aim() {
          const { o, d } = aimRay(); const wh = G.world.raycast(o, d, 28); const zh = G.zombies.hitTest(o, d, wh ? wh.t : 28); let z = zh && zh.z;
          if (!z) { let best = 0.965; for (const q of G.zombies.list) { if (!q.alive) continue; const c = V().set(q.pos.x, q.pos.y + 1.1 * q.T.scale, q.pos.z); const v = c.clone().sub(o); const L = v.length(); if (L > 26) continue; const k = v.dot(d) / L; if (k > best && G.world.lineOfSight(o, c)) { best = k; z = q; } } }
          if (!z) return null; return { zi: G.zombies.list.indexOf(z), nb: yankGroup(z).slice(1).map((q) => G.zombies.list.indexOf(q)), at: r3(V().set(z.pos.x, z.pos.y + 1.1 * z.T.scale, z.pos.z)) };
        },
        fx(a) {
          const z = G.zombies.list[a.zi]; const at = v3(a.at); webSplat(at, null);
          effect('webline', a, 0.75, { at, z, m: webLine(), own: true });
          G.audio.playAt('swipe', at, { gain: 0.8, rate: 2.0 }); G.audio.playAt('heavy', at, { gain: 0.6, rate: 1.5 });
          if (!mine(a) || !z || !z.alive) return;
          const w = who(a.by); hit(z, 110, V().set(w.pos.x - z.pos.x, 0, w.pos.z - z.pos.z).normalize(), { imp: 0.2 });
          // the two caught beside it are tied where they stand: strands from it to them, a small hit
          for (const i of a.nb || []) { const q = G.zombies.list[i]; if (q && q.alive) { G.fx.arc(at, V().set(q.pos.x, q.pos.y + 1.0 * q.T.scale, q.pos.z), 0xf4f0e8); hit(q, 60, V().set(0, 0, 1), { imp: 0 }); } }
        },
        host(a) {
          const z = G.zombies.list[a.zi]; const w = who(a.by); if (!z || !z.alive || !w) return;
          for (const i of a.nb || []) { const q = G.zombies.list[i]; if (q && q.alive) G.zombies.applyStatus(q, 'root', 2); }
          if (z.T.boss) { G.zombies.applyStatus(z, 'root', 2); return; }
          const f = V().set(z.pos.x - w.pos.x, 0, z.pos.z - w.pos.z); const L = f.length(); f.divideScalar(L || 1);
          const to = V().set(w.pos.x + f.x * 1.7, Math.max(0, w.pos.y), w.pos.z + f.z * 1.7);
          if (G.world.overlaps([to.x - 0.3, to.y + 0.05, to.z - 0.3], [to.x + 0.3, to.y + 1.7, to.z + 0.3])) to.set(z.pos.x - f.x * Math.max(0, L - 2.2), z.pos.y, z.pos.z - f.z * Math.max(0, L - 2.2));
          H.yanks.push({ z, from: z.pos.clone(), to, t: 0, dur: 0.32 }); z.fearT = 0; z.windT = -1;
        },
      },
      // Lưới Tơ Khổng Lồ: a 12 m net flies out and lands; the host roots all under it, 3 s later the strands draw tight and burst
      webnet: {
        aim() {
          const p = P(); const f = V().set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); const o = V().set(p.pos.x, p.pos.y + 1.0, p.pos.z);
          const wh = G.world.raycast(o, f, 10); const dist = wh ? Math.max(3.5, wh.t - 1.2) : 8; const c = ground(o.clone().addScaledVector(f, dist));
          return { p: r3(V().set(p.pos.x, p.pos.y + 1.5, p.pos.z).addScaledVector(f, 0.8)), c: r3(c), yaw: +p.yaw.toFixed(2) };
        },
        fx(a) {
          const m = netMesh(); const from = v3(a.p); m.userData.net.position.copy(from);
          effect('webnet', a, 3.75, { m, from, c: v3(a.c), yaw: a.yaw, landed: false, blown: false, acc: 0, own: true });
          G.audio.playAt('swipe', from, { gain: 1, rate: 0.55 }); G.audio.playAt('wind', from, { gain: 0.3 });
          if (mine(a)) overlay('white', 0.5);
        },
        host(a) { const c = v3(a.c); later(0.55, () => { for (const z of near(c, 6.2, 3)) G.zombies.applyStatus(z, 'root', 3); }); },
        tick(e, dt) { stepNet(e, dt); },
      },
      artillery: {
        aim() { const p = P(); const f = V().set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)); const rt = V().set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); for (const d of [2.4, 1.6, 3.2]) { const c = p.pos.clone().addScaledVector(rt, d).addScaledVector(f, 0.8); if (!G.world.overlaps([c.x - 0.9, c.y + 0.05, c.z - 0.9], [c.x + 0.9, c.y + 2, c.z + 0.9])) return { p: r3(c), yaw: +p.yaw.toFixed(2) }; } return { p: r3(p.pos), yaw: +p.yaw.toFixed(2) }; },
        fx(a) {
          const m = cannonModel(); const at = ground(v3(a.p)); m.root.position.copy(at); m.root.scale.setScalar(0.01); G.scene.add(m.root);
          H.cannons.push({ m, pos: at, t: 0, life: 14, acc: 0, mine: mine(a), yaw: a.yaw });
          G.fx.burst(at.clone().setY(at.y + 0.5), 30, [0xffb020, 0x8a8478, 0xd8d8d8], { speed: 5, size: 0.14, life: 0.9 }); G.audio.playAt('heavy', at, { gain: 1.2, rate: 0.5 });
        },
      },
    };
    // ---------- Sói ----------
    function healMe(n) { const p = P(); if (!p.alive || !(n > 0)) return; const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + n); if (p.hp - b >= 5) G.ui.pop('+' + Math.round(p.hp - b) + ' máu', 'heal'); }
    function biteFx(at, w) {
      const c = V().set(at.x, at.y + 0.9, at.z);
      G.fx.burst(c, 26, [0xc0281e, 0x8a1410, 0xe8e0c8], { speed: 5, size: 0.1, life: 0.8 });
      G.fx.puff(c, { glow: true, s0: 0.8, s1: 3.2, life: 0.22, c0: 0xffffff, c1: w ? 0xff7a30 : 0xd08a40, a0: 1.1, spin: 0 });
      for (const sg of [-1, 1]) G.fx.puff(c.clone().setY(c.y + sg * 0.25), { glow: true, vel: V().set(0, -sg * 3, 0), drag: 4, s0: 0.9, s1: 0.2, life: 0.18, c0: 0xffffff, c1: 0xffd0a0, a0: 1, spin: 0 });
      ring3(at, w ? 3.2 : 2.6, 0xffe0c0, 0xc04a20, 0.4);
      G.audio.playAt('chop', c, { gain: 1, rate: 0.8 }); G.audio.playAt('gore', c, { gain: 0.7, rate: 1.2 });
    }
    function bite(w) {
      const p = P(); const at = V().set(p.pos.x, p.pos.y, p.pos.z);
      const list = near(at, w ? 3.2 : 2.6, 2.6).sort((x, y) => x.pos.distanceTo(at) - y.pos.distanceTo(at)).slice(0, w ? 6 : 3);
      list.forEach((z, i) => hit(z, (w ? 120 : 90) * (i ? 0.6 : 1), V().set(z.pos.x - at.x, 0.2, z.pos.z - at.z).normalize(), { imp: 2.4, cut: 'blade', status: st('bleed') }));
      if (list.length) { healMe(w ? 10 : 15); G.hitStop = Math.max(G.hitStop || 0, 0.06); p.shake.v += 3; }
      biteFx(at, w);
    }
    // a howl: rings of breath spreading on the ground, a column of pale light, the sound
    function howlFx(at, r, c0, c1) {
      for (let i = 0; i < 3; i++) later(i * 0.1, () => { ring3(at, r * (0.45 + i * 0.3), c0, c1, 0.6); shockRing(at, r * (0.6 + i * 0.25), c1, 0.55 + i * 0.1); });
      for (let i = 0; i < 10; i++) G.fx.puff(V().set(at.x, at.y + 1.8 + i * 0.25, at.z), { glow: true, vel: V().set(0, 3, 0), s0: 0.9, s1: 0.2, life: 0.7, c0: 0xffffff, c1: c1, a0: 0.8, spin: 0, delay: i * 0.03 });
      G.audio.playAt('roar', at, { gain: 1.1, rate: 0.75 }); G.audio.playAt('screech', at, { gain: 0.45, rate: 0.55 }); G.audio.playAt('wind', at, { gain: 0.4 });
      const d = P().pos.distanceTo(at); if (d < 14) P().shake.v += (14 - d) * 0.4;
    }
    function transformFx(at, on) {
      howlFx(at, on ? 7 : 5, 0xffe0b0, on ? 0xff6a20 : 0xc8a070);
      G.fx.burst(V().set(at.x, at.y + 1.2, at.z), on ? 60 : 30, [0x76644e, 0x3e3428, 0xb4a48a, 0xff9a40], { speed: on ? 7 : 4, size: 0.12, life: 1.1, grav: 4 });
      G.fx.puff(V().set(at.x, at.y + 1.2, at.z), { glow: true, s0: 1.5, s1: on ? 7 : 4, life: 0.35, c0: 0xffffff, c1: on ? 0xff6a20 : 0xd8b080, a0: 1.2, spin: 0 });
    }
    // a flat ring on the ground that runs out and fades
    const SHOCK_GEO = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
    function shockRing(at, r, col, life = 0.55) {
      const m = new THREE.Mesh(SHOCK_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const g = ground(at); m.position.set(at.x, g.y + 0.07, at.z); G.scene.add(m); effect('shock', {}, life, { m, r, own: true });
    }
    // a spirit wolf: pale blue, see-through, glowing; four legs on their own pivots so it can run
    const WOLF_PARTS = [[0.36, 0.34, 0.86, 0, 0.62, 0], [0.3, 0.28, 0.32, 0, 0.82, 0.55], [0.16, 0.13, 0.24, 0, 0.74, 0.8], [0.08, 0.16, 0.08, -0.09, 1.02, 0.5], [0.08, 0.16, 0.08, 0.09, 1.02, 0.5], [0.4, 0.2, 0.3, 0, 0.82, 0.22]];
    const BOX1 = new THREE.BoxGeometry(1, 1, 1);
    function spiritWolf() {
      const mat = new THREE.MeshBasicMaterial({ color: 0x8ac8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const eye = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
      for (const [w, h, d, x, y, z] of WOLF_PARTS) { const b = new THREE.Mesh(BOX1, mat); b.scale.set(w, h, d); b.position.set(x, y, z); body.add(b); }
      for (const sx of [-0.07, 0.07]) { const e = new THREE.Mesh(BOX1, eye); e.scale.set(0.05, 0.04, 0.02); e.position.set(sx, 0.88, 0.715); body.add(e); }
      const tail = new THREE.Mesh(BOX1, mat); tail.scale.set(0.1, 0.1, 0.5); tail.position.set(0, 0.78, -0.62); tail.rotation.x = -0.6; body.add(tail);
      const legs = [];
      for (const [x, z] of [[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]]) { const L = new THREE.Group(); L.position.set(x, 0.5, z); const b = new THREE.Mesh(BOX1, mat); b.scale.set(0.1, 0.5, 0.11); b.position.y = -0.25; L.add(b); body.add(L); legs.push(L); }
      G.fx.halo(body, 0x7ab8ff, 1.7).position.set(0, 0.7, 0);
      return { g, body, legs, mat, tail, pos: g.position };
    }
    function stepWolves(e, dt) {
      const w = who(e.a.by); const fade = Math.min(1, e.t / 0.3, Math.max(0, e.dur - e.t) / 0.5);
      const taken = new Set();
      for (const W of e.wolves) {
        if (!W.tgt || !W.tgt.alive || (w && W.tgt.pos.distanceTo(w.pos) > 22)) {
          W.tgt = null; let bd = 18;
          for (const z of G.zombies.list) { if (!z.alive || taken.has(z)) continue; const d = z.pos.distanceTo(W.pos); if (d < bd && (!w || z.pos.distanceTo(w.pos) < 20)) { bd = d; W.tgt = z; } }
        }
        if (W.tgt) taken.add(W.tgt);
        const goal = W.tgt ? W.tgt.pos : w ? V().set(w.pos.x + Math.cos(e.t + W.home * 2.1) * 2.2, w.pos.y, w.pos.z + Math.sin(e.t + W.home * 2.1) * 2.2) : W.pos;
        const dx = goal.x - W.pos.x; const dz = goal.z - W.pos.z; const d = Math.hypot(dx, dz);
        const reach = W.tgt ? 0.9 + 0.35 * W.tgt.T.scale : 0.6; let sp = 0;
        if (d > reach) { sp = W.tgt ? 11 : Math.min(9, d * 3); W.pos.x += (dx / d) * sp * dt; W.pos.z += (dz / d) * sp * dt; }
        W.pos.y += ((goal.y || 0) - W.pos.y) * Math.min(1, dt * 8);
        if (d > 0.05) W.yaw += BZ.wrapAngle(Math.atan2(dx, dz) - W.yaw) * Math.min(1, dt * 12);
        W.g.rotation.y = W.yaw; W.ph += dt * (sp * 1.6 + 1);
        W.bite -= dt;
        if (W.tgt && d <= reach + 0.15 && W.bite <= 0) {
          W.bite = 0.5; W.jump = 0.28; const z = W.tgt; const c = V().set(z.pos.x, z.pos.y + 1.0 * z.T.scale, z.pos.z);
          G.fx.burst(c, 10, [0xc0281e, 0x8a1410, 0xbfe4ff], { speed: 3, size: 0.08, life: 0.5 }); G.fx.puff(c, { glow: true, s0: 0.5, s1: 1.4, life: 0.15, c0: 0xffffff, c1: 0x7ab8ff, a0: 1, spin: 0 });
          G.audio.playAt('chop', c, { gain: 0.45, rate: 1.4 });
          if (mine(e.a)) hit(z, 30, V().set(dx, 0, dz).normalize(), { imp: 0.8, status: G.rng.chance(0.3) ? st('bleed') : undefined });
        }
        W.jump = Math.max(0, W.jump - dt); const j = W.jump > 0 ? Math.sin((1 - W.jump / 0.28) * Math.PI) : 0;
        const run = Math.min(1, sp / 6);
        W.body.position.y = Math.abs(Math.sin(W.ph)) * 0.08 * run + j * 0.35; W.body.rotation.x = -j * 0.5 + Math.sin(W.ph * 2) * 0.04 * run;
        W.legs.forEach((L, i) => { L.rotation.x = Math.sin(W.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.8 * run - j * (i < 2 ? 0.9 : -0.6); });
        W.tail.rotation.y = Math.sin(e.t * 9 + W.home) * 0.4;
        W.mat.opacity = (0.5 + Math.sin(e.t * 13 + W.home * 2) * 0.07) * fade;
        if (G.rng.chance(dt * 18 * fade)) G.fx.puff(V().set(W.pos.x, W.pos.y + 0.7, W.pos.z), { glow: true, vel: V().set(0, 0.6, 0), s0: 0.45, s1: 0.1, life: 0.5, c0: 0xd8f0ff, c1: 0x4a88ff, a0: 0.7 * fade });
        if (e.t >= e.dur - 0.02 && !W.gone) { W.gone = true; G.fx.burst(V().set(W.pos.x, W.pos.y + 0.7, W.pos.z), 16, [0xbfe4ff, 0x7ab8ff, 0xffffff], { speed: 2.5, size: 0.09, life: 0.7, grav: -2 }); }
      }
    }
    // ---------- Nhện Đồng ----------
    // where the web leaves from: the caster's right hand (the wrist bow), seen from wherever this screen looks at it
    function handFrom(a) {
      if (mine(a)) {
        const T = G.tps; if (T && T.on && T.model && T.model.root.visible) { T.model.root.updateMatrixWorld(true); return T.model.handR.getWorldPosition(V()); }
        const c = cam(); const o = V(); c.getWorldPosition(o); const f = V(); c.getWorldDirection(f); const rt = V().set(1, 0, 0).applyQuaternion(c.quaternion); const up = V().set(0, 1, 0).applyQuaternion(c.quaternion);
        return o.addScaledVector(f, 0.6).addScaledVector(rt, 0.2).addScaledVector(up, -0.13);
      }
      const av = G.coop && G.coop.avatars && G.coop.avatars.get(a.by); if (!av) return null;
      av.root.updateMatrixWorld(true); return av.m.handR.getWorldPosition(V());
    }
    const LINE_GEO = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    function webLine() {
      const g = new THREE.Group();
      const core = new THREE.Mesh(LINE_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, fog: false })); core.scale.set(0.024, 0.024, 1);
      const glow = new THREE.Mesh(LINE_GEO, new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.scale.set(0.075, 0.075, 1);
      g.add(core, glow); g.userData = { core, glow }; g.renderOrder = 4; G.scene.add(g); return g;
    }
    function placeLine(g, from, to, k, a) { g.position.copy(from); g.lookAt(to); g.scale.set(1, 1, Math.max(0.01, from.distanceTo(to) * k)); g.userData.core.material.opacity = 0.95 * a; g.userData.glow.material.opacity = 0.3 * a; }
    // where a line lands: a white splash and a few strands
    function webSplat(at, n) {
      G.fx.puff(at.clone(), { glow: true, s0: 0.5, s1: 1.6, life: 0.25, c0: 0xffffff, c1: 0xffd8a0, a0: 1.1, spin: 0 });
      G.fx.burst(at.clone(), 14, [0xffffff, 0xe8e8f0, 0xd8c8a8], { dir: n || undefined, push: n ? 2.5 : 0, speed: 2.5, size: 0.06, life: 0.5, grav: 3 });
    }
    // the zombie pulled in and the two nearest it, all rooted when the pull ends
    const yankGroup = (z) => [z, ...G.zombies.list.filter((q) => q !== z && q.alive && q.pos.distanceTo(z.pos) < 3.5).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos)).slice(0, 2)];
    // the giant net: a canvas web on a plane (one white layer, one warm glow layer) and loose strands up to whatever it caught
    let webTex = null;
    function webTexture() {
      if (webTex) return webTex;
      const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d'); c.translate(256, 256);
      const N = 18; const R = 246; c.lineCap = 'round'; c.lineJoin = 'round';
      const draw = (w, col, blur) => {
        c.strokeStyle = col; c.shadowColor = 'rgba(255,214,150,0.95)'; c.shadowBlur = blur; c.lineWidth = w;
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke(); }
        for (let r = 1; r <= 8; r++) {
          const rr = R * (r / 8.2) * (r % 2 ? 1 : 0.97); c.beginPath();
          for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const x = Math.cos(a) * rr; const y = Math.sin(a) * rr; if (!i) c.moveTo(x, y); else { const m = ((i - 0.5) / N) * Math.PI * 2; c.quadraticCurveTo(Math.cos(m) * rr * 0.88, Math.sin(m) * rr * 0.88, x, y); } }
          c.stroke();
        }
      };
      draw(7, 'rgba(255,240,210,0.35)', 18); draw(3.2, 'rgba(255,255,255,0.97)', 6);
      c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fillStyle = '#fff'; c.fill();
      webTex = new THREE.CanvasTexture(cv); webTex.colorSpace = THREE.SRGBColorSpace; webTex.anisotropy = 4; return webTex;
    }
    const NET_GEO = new THREE.PlaneGeometry(12, 12);
    function netMesh() {
      const root = new THREE.Group(); const net = new THREE.Group(); root.add(net);
      const tilt = new THREE.Group(); net.add(tilt);
      const a = new THREE.Mesh(NET_GEO, new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const b = new THREE.Mesh(NET_GEO, new THREE.MeshBasicMaterial({ map: webTexture(), color: 0xffb860, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      b.scale.setScalar(1.03); b.position.z = 0.02; tilt.add(a, b); a.renderOrder = 3; b.renderOrder = 3;
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 2 * 3), 3)); sg.setDrawRange(0, 0);
      const strands = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); strands.frustumCulled = false; root.add(strands);
      root.userData = { net, tilt, a, b, strands }; G.scene.add(root); return root;
    }
    function stepNet(e, dt) {
      const U = e.m.userData; const FLY = 0.55; const c = e.c;
      if (e.t < FLY) {
        // in flight: spinning open, standing up toward where it goes, laid flat as it lands
        const k = e.t / FLY; const ek = 1 - (1 - k) * (1 - k);
        U.net.position.lerpVectors(e.from, V().set(c.x, c.y + 0.12, c.z), ek); U.net.position.y += Math.sin(k * Math.PI) * 1.6;
        U.net.rotation.set(0, e.yaw, 0); U.tilt.rotation.set(BZ.lerp(-0.25, -Math.PI / 2, ek), 0, e.t * 5); U.tilt.scale.setScalar(0.12 + 0.88 * ek);
        if (G.rng.chance(dt * 40)) G.fx.puff(U.net.position.clone(), { glow: true, s0: 0.6, s1: 0.1, life: 0.35, c0: 0xffffff, c1: 0xffc880, a0: 0.8 });
        return;
      }
      if (!e.landed) {
        e.landed = true; U.net.position.set(c.x, c.y + 0.12, c.z); U.tilt.rotation.set(-Math.PI / 2, 0, FLY * 5); U.tilt.scale.setScalar(1);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; G.fx.puff(V().set(c.x + Math.cos(a) * 5.6, c.y + 0.3, c.z + Math.sin(a) * 5.6), { vel: V().set(Math.cos(a) * 2, 0.4, Math.sin(a) * 2), drag: 2, s0: 0.6, s1: 1.8, life: 0.8, c0: 0xe8e4dc, c1: 0xa8a49c, a0: 0.5 }); }
        shockRing(c, 6.4, 0xffd8a0, 0.5); G.audio.playAt('land', c, { gain: 1, rate: 0.7 }); G.audio.playAt('clank', c, { gain: 0.5, rate: 0.6 });
        if (mine(e.a)) for (const z of near(c, 6.2, 3)) hit(z, 15, V().set(0, 0, 1), { imp: 0 });
      }
      // caught: strands from the net up to every body on it; then drawn tight (3.0 - 3.25 s) and blown
      const tight = BZ.clamp((e.t - 3.0) / 0.25, 0, 1); const blown = e.t >= 3.25;
      U.tilt.scale.setScalar(1 - 0.45 * tight * tight + (blown ? -0.2 : 0)); U.tilt.rotation.z = FLY * 5 + tight * 0.6;
      const pulse = 0.5 + Math.sin(e.t * 9) * 0.1; U.b.material.opacity = (0.4 + 0.5 * tight) * (blown ? Math.max(0, 1 - (e.t - 3.25) / 0.4) : 1) + pulse * 0.1;
      U.a.material.opacity = 0.95 * (blown ? Math.max(0, 1 - (e.t - 3.25) / 0.4) : 1);
      const arr = U.strands.geometry.attributes.position.array; let n = 0;
      if (!blown) for (const z of G.zombies.list) {
        if (!z.alive || n >= 48 || Math.hypot(z.pos.x - c.x, z.pos.z - c.z) > 6.4 * (1 - 0.45 * tight)) continue;
        const top = V().set(z.pos.x, z.pos.y + 1.2 * z.T.scale, z.pos.z);
        for (const [ox, oz] of [[0.9, 0.2], [-0.7, 0.6]]) { if (n >= 48) break; const g0 = V().set(z.pos.x + ox * (1 - tight) + (c.x - z.pos.x) * tight * 0.5, c.y + 0.12, z.pos.z + oz * (1 - tight) + (c.z - z.pos.z) * tight * 0.5); arr.set([g0.x, g0.y, g0.z, top.x, top.y, top.z], n * 6); n++; }
      }
      U.strands.geometry.setDrawRange(0, n * 2); U.strands.geometry.attributes.position.needsUpdate = true; U.strands.material.opacity = 0.6 + 0.4 * tight;
      if (tight > 0 && !blown && G.rng.chance(dt * 30)) G.fx.puff(V().set(c.x + G.rng.range(-4, 4), c.y + 0.3, c.z + G.rng.range(-4, 4)), { glow: true, s0: 0.5, s1: 0.1, life: 0.2, c0: 0xffffff, c1: 0xffb860, a0: 1 });
      if (blown && !e.blown) {
        e.blown = true;
        G.fx.explosion(V().set(c.x, c.y + 0.3, c.z), 0.8);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const q = V().set(c.x + Math.cos(a) * 3.4, c.y + 0.4, c.z + Math.sin(a) * 3.4); later(0.04 * i, () => { G.fx.puff(q, { glow: true, s0: 1.2, s1: 3.6, life: 0.3, c0: 0xffffff, c1: 0xffa040, a0: 1.2, spin: 0 }); G.fx.burst(q, 14, [0xffffff, 0xffe0b0, 0xffa040], { speed: 7, size: 0.08, life: 0.7, grav: 6 }); }); }
        shockRing(c, 8, 0xffffff, 0.45); shockRing(c, 6, 0xffa040, 0.6);
        G.audio.playAt('boom', c, { gain: 1.3, rate: 1.15 }); G.audio.playAt('saber_hit', c, { gain: 0.8, rate: 1.2 });
        const d = P().pos.distanceTo(c); if (d < 20) P().shake.v += (20 - d) * 0.6;
        if (mine(e.a)) for (const z of near(c, 6.5, 3)) { const dd = Math.hypot(z.pos.x - c.x, z.pos.z - c.z); hit(z, 300 * (1 - 0.3 * dd / 6.5), V().set(z.pos.x - c.x, 0.4, z.pos.z - c.z).normalize(), { imp: 3.2 }); }
      }
    }
    const poisoned = (z) => (z.st && z.st.poison) || (z.stFlags & 128);
    // a toxic cloud or a pool of fire on the ground: looks on every machine, hurts on the caster's
    function cloudAt(at, a, r, dur, stacks) {
      const g = ground(at); G.zombies.kinds.hazard('acid', g, r * 0.8, dur, true);
      const e = effect('cloud', a, dur, { pos: g, r });
      if (mine(a)) for (const z of near(g, r, 3)) hit(z, 6, V().set(0, 0, 1), { imp: 0, status: st('poison', stacks) });
      return e;
    }
    function fireAt(at, a, r, dur) { const g = ground(at); G.zombies.kinds.hazard('fire', g, r, dur, true); return effect('fire', a, dur, { pos: g, r }); }
    const ZONE = {
      shock(e) { const k = e.t / e.dur; e.m.scale.setScalar(Math.max(0.05, e.r * (0.25 + 0.75 * (1 - (1 - k) * (1 - k))))); e.m.material.opacity = 0.9 * (1 - k); },
      webline(e, dt) {
        const from = handFrom(e.a); if (!from) { e.t = e.dur; return; }
        if (e.z && e.z.alive) e.at = V().set(e.z.pos.x, e.z.pos.y + 1.1 * e.z.T.scale, e.z.pos.z);
        if (e.swing && mine(e.a) && !H.swing && e.t < e.dur - 0.15) e.t = e.dur - 0.15;
        placeLine(e.m, from, e.at, Math.min(1, e.t / 0.09), Math.min(1, (e.dur - e.t) / 0.15));
        if (G.rng.chance(dt * 16)) G.fx.puff(from.clone().lerp(e.at, G.rng.next()), { glow: true, s0: 0.22, s1: 0.05, life: 0.25, c0: 0xffffff, c1: 0xffc880, a0: 0.8 });
      },
      cloud(e, dt) {
        if (G.rng.chance(dt * 10)) G.fx.puff(V().set(e.pos.x + G.rng.range(-e.r, e.r) * 0.7, e.pos.y + G.rng.range(0.2, 1.4), e.pos.z + G.rng.range(-e.r, e.r) * 0.7), { vel: V().set(0, 0.4, 0), s0: 0.6, s1: 1.6, life: 1.4, c0: 0x9aff40, c1: 0x3a6a20, a0: 0.45 });
        e.acc += dt; if (e.acc < 0.5 || !mine(e.a)) return; e.acc = 0;
        for (const z of near(e.pos, e.r, 3)) hit(z, 3, V().set(0, 0, 1), { imp: 0, status: st('poison') });
      },
      fire(e, dt) {
        e.acc += dt; if (e.acc < 0.5 || !mine(e.a)) return; e.acc = 0;
        for (const z of near(e.pos, e.r, 2)) hit(z, 8, V().set(0, 0, 1), { imp: 0, status: st('burn') });
      },
    };
    function updateEffects(dt) {
      for (let i = H.effects.length - 1; i >= 0; i--) {
        const e = H.effects[i]; e.t += dt;
        const f = (ABIL[e.key] && ABIL[e.key].tick) || ZONE[e.key]; if (f) f(e, dt);
        if (e.t >= e.dur) { if (e.m) { G.scene.remove(e.m); if (e.own) e.m.traverse((o) => { if (o.material && !o.isSprite) o.material.dispose(); }); } H.effects.splice(i, 1); }
      }
    }
    // Lốc xoáy: three nested open cones spinning against each other; Cầu sét: a white core in a blue shell with its own light
    const TWIST = [0, 1, 2].map((i) => new THREE.CylinderGeometry(0.9 + i * 0.45, 0.25 + i * 0.12, 2.6 + i * 0.4, 9, 1, true).translate(0, 1.3 + i * 0.2, 0));
    function tornadoMesh() { const g = new THREE.Group(); TWIST.forEach((geo, i) => g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i ? 0xd8e4ec : 0xf4f8ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })))); return g; }
    const ORB_CORE = new THREE.IcosahedronGeometry(0.28, 0); const ORB_SHELL = new THREE.IcosahedronGeometry(0.55, 1);
    function orbMesh() { const g = new THREE.Group(); g.add(new THREE.Mesh(ORB_CORE, new THREE.MeshBasicMaterial({ color: 0xf4fbff }))); g.add(new THREE.Mesh(ORB_SHELL, new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true }))); const l = new THREE.PointLight(0x9ad8ff, 6, 9, 1.5); g.add(l); g.userData.light = l; return g; }
    const starGeo = new THREE.BoxGeometry(0.34, 0.03, 0.34);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xd8c8ff });
    function starMesh() { const m = new THREE.Mesh(starGeo, starMat); m.rotation.x = 0.3; G.scene.add(m); return m; }
    let mineId = 0;
    function updateMines(dt) {
      for (let i = H.mines.length - 1; i >= 0; i--) {
        const q = H.mines[i]; q.t += dt; q.light.material.color.setHex(q.t > 0.6 && Math.sin(q.t * 12) > 0 ? 0xff2a20 : 0x401010);
        if (!mine(q.a)) { if (q.t > q.life + 2) { G.scene.remove(q.m); H.mines.splice(i, 1); } continue; }
        const trig = q.t > 0.6 && G.zombies.list.some((z) => z.alive && Math.hypot(z.pos.x - q.pos.x, z.pos.z - q.pos.z) < 2.2 && Math.abs(z.pos.y - q.pos.y) < 2);
        if (trig || q.t > q.life) {
          G.scene.remove(q.m); H.mines.splice(i, 1);
          G.gear.explode(q.pos.clone().setY(q.pos.y + 0.3), 4.5 * H.blastMul(), 135 * pow() * H.blastMul());
          if (coop()) { const a = { by: me(), id: q.id }; if (guest()) G.coop.act({ k: 'hx', s: 'minepop', a }); else G.events.emit('hx', { s: 'minepop', a }); }
        }
      }
    }
    ABIL.mine.aim = ((f) => () => { const a = f(); a.id = me() + ':' + (++mineId); return a; })(ABIL.mine.aim);
    function updateCannons(dt) {
      for (let i = H.cannons.length - 1; i >= 0; i--) {
        const c = H.cannons[i]; c.t += dt; const s = Math.min(1, c.t / 0.35); c.m.root.scale.setScalar(s < 1 ? s * (1.15 - 0.15 * s) : 1);
        if (c.t > c.life) { G.fx.burst(c.pos.clone().setY(c.pos.y + 1), 26, [0x8a8478, 0xffb020], { speed: 4, size: 0.14, life: 0.8 }); G.scene.remove(c.m.root); H.cannons.splice(i, 1); continue; }
        const muzzle = V().set(c.pos.x, c.pos.y + 1.4, c.pos.z);
        let best = null; let bd = 38;
        for (const z of G.zombies.list) { if (!z.alive) continue; const d = z.pos.distanceTo(c.pos); if (d < bd && d > 3 && G.world.lineOfSight(muzzle, V().set(z.pos.x, z.pos.y + 1, z.pos.z))) { bd = d; best = z; } }
        const want = best ? Math.atan2(-(best.pos.x - c.pos.x), -(best.pos.z - c.pos.z)) : c.yaw + c.t * 0.3;
        c.m.head.rotation.y += BZ.wrapAngle(want - c.m.head.rotation.y) * Math.min(1, dt * 6);
        c.acc += dt; if (!best || c.acc < 0.7 || !c.mine) continue; c.acc = 0;
        const dir = V().set(best.pos.x - muzzle.x, best.pos.y + 1 - muzzle.y, best.pos.z - muzzle.z).normalize();
        G.gear.fireRocket(muzzle.clone().addScaledVector(dir, 1.9), dir); G.fx.muzzle(muzzle); G.audio.playAt('rocket', muzzle, { gain: 0.7, rate: 0.8 });
      }
    }

    // golden shell around the player while invulnerable; red target ring for the air strike
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.visible = false; G.scene.add(ring);
    const strikeMark = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    strikeMark.visible = false; G.scene.add(strikeMark);
    const fxEl = document.getElementById('skillfx'); let fxT = 0;
    function overlay(kind, secs) { if (!fxEl) return; fxEl.className = 'on ' + kind; fxT = secs; }

    // the ultimate fills from damage dealt (and healing for Y Tá), a little on its own, faster with the Tối thượng upgrade
    function chargeDmg(d) { if ((H.t.ultOn || 0) > 0 || H.ult >= 1) return; const was = H.ult; H.ult = Math.min(1, H.ult + d / H.def.ult.cost * G.build.ultMul()); if (was < 1 && H.ult >= 1) { G.ui.banner('TỐI THƯỢNG SẴN SÀNG', H.def.ult.name + ' · bấm Q', 1.6); G.audio.play('marker', { gain: 0.8, rate: 1.3 }); } }
    function chargeHeal(n) { if (H.def.id === 'yta') chargeDmg(n * 2); }
    G.events.on('hit', ({ dmg }) => chargeDmg(dmg || 0));
    G.events.on('hit', ({ dmg, melee }) => { if (H.wolfOn && melee) healMe((dmg || 0) * 0.15); });

    function update(dt) {
      drawAim();
      const p = P(); const h = H.def;
      for (const k of ['s1', 's2']) {
        const S = H.slots[k]; const def = h[k]; const max = def.charges || 1;
        if (S.n < max) { S.cd -= dt; if (S.cd <= 0) { S.n++; S.cd = S.n < max ? def.cd * G.build.cdMul() * cdK(k) : 0; if (S.n === max) G.audio.play('marker', { gain: 0.4, rate: k === 's1' ? 0.7 : 0.9 }); } }
      }
      if (G.state === 'playing' && p.alive) chargeDmg(dt * 8);
      for (const k of Object.keys(H.t)) H.t[k] = Math.max(0, H.t[k] - dt);
      if (fxT > 0) { fxT -= dt; if (fxT <= 0 && fxEl) fxEl.className = ''; }
      H.hurtT = (H.hurtT || 0) + dt;
      if (p.invisT > 0) p.invisT -= dt;
      // passives
      if (h.id === 'thep' && p.alive && p.armor < 50) p.armor = Math.min(50, p.armor + 2 * dt);
      if (h.id === 'yta' && p.alive && H.hurtT > 4 && p.hp < p.maxHp) { const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + 3 * dt); chargeHeal(p.hp - b); }
      if (H.t.heal > 0 && p.alive) { const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + 7.5 * dt); chargeHeal(p.hp - b); }
      // dash: keep the burst going, cut through whatever is in the way
      if (H.t.dash > 0) {
        const [dx, dz, dy] = H.dashDir; p.vel.x = dx * 25; p.vel.z = dz * 25; if (dy > 0.06) p.vel.y = dy * 25;
        if (G.rng.chance(0.8)) G.fx.burst(V().set(p.pos.x, p.pos.y + 1, p.pos.z), 2, [0x9ae8ff, 0xffffff, 0x56c8ff], { speed: 0.6, size: 0.1, life: 0.35, grav: 0, drag: 2, bounce: 0 });
        for (const z of G.zombies.list) {
          if (!z.alive || H.dashHit.has(z)) continue;
          if (Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 1.4 * z.T.scale && Math.abs(z.pos.y - p.pos.y) < 1.5) { H.dashHit.add(z); hit(z, 70, V().set(dx, 0, dz), { cut: 'blade', imp: 2 }); G.audio.playAt('chop', z.pos, { gain: 0.8 }); G.hitStop = Math.max(G.hitStop || 0, 0.035); }
        }
        if (H.t.dash <= 0) { p.vel.x *= 0.3; p.vel.z *= 0.3; if (p.vel.y > 0) p.vel.y *= 0.35; }
      }
      // charge: a straight rush that knocks zombies aside, stops at a wall
      if (H.t.charge > 0) {
        const [dx, dz, dy] = H.chargeDir; p.vel.x = dx * 18; p.vel.z = dz * 18; if (dy > 0.1 && H.t.charge > 0.35) p.vel.y = dy * 16;
        if (G.rng.chance(0.7)) G.fx.burst(V().set(p.pos.x, p.pos.y + 0.2, p.pos.z), 3, [0x8a8478, 0x6e6a64, 0xffc040], { speed: 1.5, size: 0.12, life: 0.5 });
        for (const z of G.zombies.list) {
          if (!z.alive || H.chargeHit.has(z)) continue;
          const ox = z.pos.x - p.pos.x; const oz = z.pos.z - p.pos.z;
          if (Math.hypot(ox, oz) < 1.5 * z.T.scale && Math.abs(z.pos.y - p.pos.y) < 1.6) {
            H.chargeHit.add(z); const side = Math.sign(ox * dz - oz * dx) || 1;
            hit(z, 110, V().set(dx + -dz * side * 0.8, 0, dz + dx * side * 0.8).normalize(), { imp: 4 }); G.audio.playAt('heavy', z.pos, { gain: 0.8, rate: 0.7 }); p.shake.v += 1.5;
          }
        }
        if (G.world.raycast(V().set(p.pos.x, p.pos.y + 1, p.pos.z), V().set(dx, 0, dz), 0.7)) { H.t.charge = 0; p.shake.v += 4; G.audio.play('land', { gain: 0.9, rate: 0.6 }); }
        if (H.t.charge <= 0) { p.vel.x *= 0.2; p.vel.z *= 0.2; }
      }
      // Trảm Phong: hop from zombie to zombie, one cut each
      if (H.t.blades > 0 && H.bladeList) {
        H.bladeT -= dt;
        if (H.bladeT <= 0) {
          H.bladeT = 0.14;
          const z = H.bladeList.shift();
          if (z && z.alive) {
            const from = p.pos.clone(); const to = V().set(z.pos.x - p.pos.x, 0, z.pos.z - p.pos.z); const d = to.length() || 1; to.divideScalar(d);
            const at = V().set(z.pos.x - to.x * 1.1, Math.max(z.pos.y, 0), z.pos.z - to.z * 1.1);
            if (!G.world.overlaps([at.x - 0.3, at.y + 0.05, at.z - 0.3], [at.x + 0.3, at.y + 1.7, at.z + 0.3])) p.pos.copy(at);
            p.yaw = Math.atan2(-to.x, -to.z); p.vel.set(0, 0, 0);
            G.fx.arc(V().set(from.x, from.y + 1.2, from.z), V().set(p.pos.x, p.pos.y + 1.2, p.pos.z), 0x9ae8ff);
            hit(z, 160, to, { cut: 'blade', imp: 2.5 }); G.audio.playAt('slash', z.pos, { gain: 0.9, rate: 1.2 }); G.hitStop = Math.max(G.hitStop || 0, 0.05); p.shake.v += 2;
          }
          if (!H.bladeList.length) H.t.blades = Math.min(H.t.blades, 0.15);
        }
      }
      // Vồ cắn: hold the leap's line through the air, bite on landing or on running into a zombie
      if (H.lunge) {
        const L = H.lunge; L.t += dt;
        if (!L.done) {
          if (L.t < L.T + 0.05) { p.vel.x = L.v.x; p.vel.z = L.v.z; } // past the aim point (a leap into open air) he just falls
          if (G.rng.chance(dt * 30)) G.fx.puff(V().set(p.pos.x, p.pos.y + 0.9, p.pos.z), { glow: true, s0: 0.7, s1: 0.15, life: 0.3, c0: 0xffe8c0, c1: L.w ? 0xff6a20 : 0xd08a40, a0: 0.8, spin: 0 });
          const into = G.zombies.list.some((z) => z.alive && Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 1.15 * z.T.scale && p.pos.y > z.pos.y - 0.6 && p.pos.y < z.pos.y + 2 * z.T.scale);
          if ((L.t > 0.12 && (p.onGround || into)) || L.t > 0.95 || !p.alive) { L.done = true; if (p.alive) bite(L.w); p.vel.x *= 0.25; p.vel.z *= 0.25; }
        }
        if (L.t > 1.2) H.lunge = null;
      }
      // Đu tơ: reel toward the target; gravity only partly cancelled and a dip at the start, so the path swings in an arc
      if (H.swing) {
        const S = H.swing; S.t += dt;
        const to = S.tgt.clone().sub(p.pos); const d = to.length(); const dir = to.divideScalar(d || 1);
        const want = dir.multiplyScalar(Math.min(25, 9 + S.t * 42)); want.y -= 5 * Math.max(0, 1 - S.t / 0.3);
        if (S.roof && p.pos.y < S.tgt.y - 0.1 && Math.hypot(S.tgt.x - p.pos.x, S.tgt.z - p.pos.z) < 2.5) want.y = Math.max(want.y, 9);
        p.vel.lerp(want, 1 - Math.exp(-7 * dt)); p.vel.y += BZ.MOVE.gravity * 0.8 * dt; p.onGround = false;
        const landed = S.roof && p.pos.y > S.tgt.y - 0.7 && Math.hypot(S.tgt.x - p.pos.x, S.tgt.z - p.pos.z) < 1.2;
        if (d < 1.0 || landed || S.t > 1.8 || !p.alive) {
          p.vel.multiplyScalar(S.roof ? 0.3 : 0.55); if (p.vel.y > 3) p.vel.y = 3; H.swing = null; H.t.swing = 0; G.audio.play('land', { gain: 0.4, rate: 1.4 });
          // he comes in feet first: zombies where he lands are kicked aside and stuck with silk
          const kz = near(p.pos, 2.8, 2.2); for (const z of kz) hit(z, 90, V().set(z.pos.x - p.pos.x, 0.3, z.pos.z - p.pos.z).normalize(), { imp: 2.5, status: st('web') });
          if (kz.length) { ring3(p.pos, 2.8, 0xffffff, 0xffc880, 0.35); p.shake.v += 2; G.audio.play('heavy', { gain: 0.7, rate: 0.8 }); }
        }
      }
      // Kéo tơ, on the host: each pulled zombie slides in on a low arc and is rooted where it lands (the two beside it were rooted at the cast)
      for (let i = H.yanks.length - 1; i >= 0; i--) {
        const Y = H.yanks[i]; Y.t += dt; const z = Y.z; if (!z.alive) { H.yanks.splice(i, 1); continue; }
        const k = Math.min(1, Y.t / Y.dur); const ek = k * k * (3 - 2 * k);
        z.pos.lerpVectors(Y.from, Y.to, ek); z.pos.y += Math.sin(k * Math.PI) * 0.8; z.vel.set(0, 0, 0); z.rootAt = null;
        if (k >= 1) { H.yanks.splice(i, 1); G.zombies.applyStatus(z, 'root', 2); }
      }
      // Hoá Sói ends: time up, dead or a new run; the claws go and the hatchet comes back
      if (H.wolfOn && (!(H.t.wolf > 0) || !p.alive)) {
        H.wolfOn = false; H.t.wolf = 0; if (G.weapons.cur() === 'claws') G.weapons.give(H.def.weapon);
        send('wolfend', {}); if (p.alive) overlay('orange', 0.4);
      }
      // invulnerable: shell follows the player, zombies that touch it are thrown back and burned
      ring.visible = H.t.invuln > 0;
      if (ring.visible) {
        ring.position.set(p.pos.x, p.pos.y + 0.9 + Math.sin(performance.now() / 120) * 0.5, p.pos.z); ring.rotation.y += dt * 4;
        ring.material.opacity = H.t.invuln < 1 ? (Math.sin(performance.now() / 60) > 0 ? 0.8 : 0.2) : 0.8;
        H.auraT = (H.auraT || 0) - dt;
        for (const z of G.zombies.list) {
          if (!z.alive) continue;
          const dx = z.pos.x - p.pos.x; const dz = z.pos.z - p.pos.z; const d = Math.hypot(dx, dz);
          if (d < 1.6 * z.T.scale && Math.abs(z.pos.y - p.pos.y) < 1.5) {
            z.vel.x += (dx / (d || 1)) * 9 * dt * 10; z.vel.z += (dz / (d || 1)) * 9 * dt * 10;
            if (H.auraT <= 0) { hit(z, 12, V().set(dx, 0, dz).normalize(), { imp: 1.5 }); G.fx.burst(V().set(z.pos.x, z.pos.y + 1, z.pos.z), 6, [0xffd060, 0xffa030], { speed: 2, size: 0.07, life: 0.4 }); }
          }
        }
        if (H.auraT <= 0) H.auraT = 0.4;
      }
      // decoy shadow
      if (H.decoy) {
        H.decoy.t -= dt; const m = H.decoy.m; const k = Math.sin(performance.now() / 90);
        m.armL.rotation.x = -0.4 + k * 0.2; m.armR.rotation.x = -0.4 - k * 0.2;
        if (H.decoy.t <= 0) { G.fx.burst(V().set(H.decoy.pos.x, H.decoy.pos.y + 1, H.decoy.pos.z), 16, [0x8a40ff, 0x2a1a4a], { speed: 2.5, size: 0.12, life: 0.6, grav: -1 }); G.scene.remove(H.decoy.g); H.decoy = null; }
      }
      // air strikes: shells fall one after another onto the marked spots
      if (strikeMark.visible) { strikeMark.rotation.y += dt * 2; strikeMark.material.opacity = 0.5 + Math.sin(performance.now() / 70) * 0.3; }
      for (let i = H.strikes.length - 1; i >= 0; i--) {
        const s = H.strikes[i]; s.t -= dt;
        if (s.mark && s.t < 0.5 && !s.marked) { s.marked = true; ring3(V().set(s.x, s.y, s.z), 1.6, 0xff6a40, 0xff2a10, 0.5); }
        if (s.t <= 0) { H.strikes.splice(i, 1); G.gear.fireRocket(V().set(s.x + G.rng.range(-1, 1), s.y + 26, s.z + 6), V().set(G.rng.range(-0.04, 0.04), -1, -0.22).normalize()); if (!H.strikes.length) setTimeout(() => { strikeMark.visible = false; }, 600); }
      }
      for (let i = timers.length - 1; i >= 0; i--) { const q = timers[i]; q.t -= dt; if (q.t <= 0) { timers.splice(i, 1); q.f(); } }
      updateProjs(dt); updateEffects(dt); updateMines(dt); updateCannons(dt);
      // other players' vanish: their avatar fades while it lasts
      if (G.coop && G.coop.on) for (const av of G.coop.avatars.values()) { if (av.vanishT > 0) { av.vanishT -= dt; av.root.visible = Math.sin(performance.now() / 50) > 0.85; } else if (av.vanishT !== undefined) { av.root.visible = true; av.vanishT = undefined; } if (av.target && av.target.invisT > 0) av.target.invisT -= dt; }
    }
    // the player's jump in the air: wall jump off a wall, else one extra jump (Bóng only)
    function airJump(p, wallN) {
      if (!H.def.doubleJump) return false;
      const V3 = V();
      if (wallN) {
        p.vel.x = wallN[0] * 7 + p.vel.x * 0.4; p.vel.z = wallN[1] * 7 + p.vel.z * 0.4; p.vel.y = 8.6; p.wallT = 0; p.jumps = 0;
        G.fx.burst(V3.set(p.pos.x - wallN[0] * 0.3, p.pos.y + 1, p.pos.z - wallN[1] * 0.3), 10, [0xc080ff, 0x8a40ff, 0xd0d0d0], { speed: 2, size: 0.08, life: 0.4 });
        G.audio.play('land', { gain: 0.5, rate: 1.4 }); return true;
      }
      if ((p.jumps || 0) < 1) {
        p.jumps = (p.jumps || 0) + 1; p.vel.y = 7.6;
        G.fx.burst(V3.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 12, [0xc080ff, 0x8a40ff, 0xffffff], { speed: 2.5, size: 0.08, life: 0.4, grav: 0, drag: 2 });
        G.audio.play('swipe', { gain: 0.5, rate: 1.5 }); return true;
      }
      return false;
    }
    function onHurt() { H.hurtT = 0; }
    // the host's part of Sóng băng and Không kích, also reached from a guest's old-style actions
    function freezeAt(pos) {
      let n = 0;
      for (const z of G.zombies.list) { if (!z.alive) continue; if (Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < 9 && Math.abs(z.pos.y - pos.y) < 6) { z.frozen = z.T.boss ? 1.4 : 3.5; z.vel.set(0, 0, 0); n++; } }
      return n;
    }
    function strikeAt(at) { for (let i = 0; i < 6; i++) H.strikes.push({ t: 1.0 + i * 0.14, x: at.x + G.rng.range(-3.5, 3.5), z: at.z + G.rng.range(-3.5, 3.5), y: at.y }); }
    // passives that ride on the player's own hits (build.onHit adds these procs)
    function procs(z, dmg, melee) {
      const id = H.def.id; const out = [];
      if (id === 'hoa' && G.rng.chance(0.25)) out.push(['burn', 1]);
      if (id === 'doc' && G.rng.chance(0.2)) out.push(['poison', 1]);
      if (id === 'sam' && ++H.hitN % 5 === 0) out.push(['shock', 1]);
      return out;
    }
    // Độc: a zombie that dies poisoned breathes its poison onto the ones around it
    function onKill(z) {
      if (H.def.id === 'soi') healMe(4);
      if (H.def.id !== 'doc' || !poisoned(z)) return;
      const at = V().set(z.pos.x, z.pos.y + 0.6, z.pos.z);
      G.fx.puff(at.clone(), { glow: true, s0: 0.6, s1: 3.5, life: 0.5, c0: 0xc0ff80, c1: 0x3a8a20, a0: 0.8 });
      for (const o of near(z.pos, 3)) if (o !== z) hit(o, 4, V().set(0, 0, 1), { imp: 0, status: st('poison', 2) });
    }
    // while vanished the zombies chase where the player was last seen
    function ghost(p) {
      if (!(p.invisT > 0)) return null;
      if (!p.ghost || p.ghostT !== Math.floor(p.invisT)) { p.ghostT = Math.floor(p.invisT); p.ghost = { pos: p.pos.clone().add(V().set(G.rng.range(-4, 4), 0, G.rng.range(-4, 4))), alive: true, isDecoy: true }; }
      return p.ghost;
    }
    const slotFrac = (k) => { const S = H.slots[k]; const def = H.def[k]; return S.n >= (def.charges || 1) ? 0 : Math.min(1, S.cd / (def.cd * G.build.cdMul() * cdK(k))); };
    return Object.assign(H, { HEROES, set, reset, use, aimStart, aimRelease, aimable, aimPreview: () => (aimRing && aimRing.visible ? aimRing.position.clone() : null), send, me: () => me(), update, freezeAt, strikeAt, speedMul, jumpMul, invuln, storm, airJump, onHurt, byId, remote, procs, onKill, ghost, takenMul, dmgMul, critAdd, slotFrac,
      reloadMul: () => (H.def.id === 'mua' ? 1.25 : 1), blastMul: () => (H.def.id === 'phao' ? 1.25 : 1), chill: () => H.def.id === 'bang',
      ready: (k = 's1') => H.slots[k].n > 0, cdFrac: () => slotFrac('s1') });
  };
})();
