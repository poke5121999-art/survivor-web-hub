// Chợ Việt: Store 1 of My Mini Mart dressed as a Vietnamese village market. The engine (games/casual-farm) runs
// unchanged; main.js calls these hooks (window.MM_THEME). Gameplay, progression and prices stay the original's: this
// module renames goods and tasks, ends the game at Store 1 (no van to a next mart), dresses everyone in Vietnamese
// clothes and sets props round the yard.
import { dress, LOOKS } from './vnlooks.js';
import { placeProps, obstacles } from './props.js';

// Store 1's goods. like: draw it as that original item (mesh and icon); icon: our own icon instead.
const ICONS = '../../../cho-viet/art/icons/'; // relative to casual-farm/art/items/, where the HUD looks
const ITEMS = {
  0: { name: 'Lúa', like: 62 },
  1: { name: 'Cà chua' },
  2: { name: 'Bột mì' },
  3: { name: 'Tương cà' },
  6: { name: 'Bánh mì', like: 126, icon: 'banh-mi.webp' },
  10: { name: 'Trứng gà' },
  12: { name: 'Sữa bò' },
};

// Task texts (TaskController.taskDescription) and HUD strings, exact match.
export const TEXT = {
  'Pick tomatoes': 'Hái cà chua',
  'Shelf tomatoes': 'Bày cà chua lên kệ',
  'Checkout customer': 'Tính tiền cho khách',
  'Feed chicken': 'Cho gà ăn',
  'Pick up eggs': 'Nhặt trứng',
  'Shelf eggs': 'Bày trứng lên kệ',
  'Upgrade your carry': 'Tăng sức mang',
  'Upgrade your carry!': 'Tăng sức mang!',
  'Blend tomatoes': 'Xay cà chua',
  'Pick up sauces': 'Lấy tương cà',
  'Shelf tomato sauces': 'Bày tương cà lên kệ',
  'UPGRADES': 'NÂNG CẤP', 'Workers': 'Nhân viên', 'Machines': 'Máy móc', 'Animals': 'Vật nuôi',
  'Stack': 'Sức mang', 'Speed': 'Tốc độ', 'CARRY': 'MANG', 'SPEED': 'TỐC ĐỘ', 'MAX': 'TỐI ĐA', 'Free': 'Miễn phí',
  'SETTINGS': 'CÀI ĐẶT', 'Sound': 'Âm thanh', 'Music': 'Nhạc', 'Vibration': 'Rung',
  'Delete Account': 'Xoá tài khoản', 'Erase all progress': 'Xoá toàn bộ tiến trình', 'Delete': 'Xoá', 'DELETE': 'XOÁ', 'Cancel': 'Huỷ',
  'SHOP': 'CỬA HÀNG', 'Claim': 'Nhận', 'Collect': 'Nhận', 'COLLECT': 'NHẬN', 'Reward': 'Phần thưởng', 'Spin': 'Quay',
  'Extra Spin': 'Quay thêm', 'Congratulations!': 'Chúc mừng!', 'Customize': 'Trang phục', 'Coming soon!': 'Sắp có!',
  'ORDER': 'ĐƠN HÀNG', 'GO!': 'ĐI!', 'Go': 'Đi', 'SKIP': 'BỎ QUA', 'NEW!': 'MỚI!', 'Gems': 'Đá quý',
  'Hats': 'Mũ', 'Outfits': 'Quần áo', 'Pets': 'Thú cưng', 'Skins': 'Trang phục', 'Save...': 'Đang lưu...',
  'Use': 'Dùng', 'to skip ads and get rewards': 'để bỏ qua quảng cáo và nhận thưởng', 'Here are some free gems': 'Tặng bạn ít đá quý',
  "Here's your reward:": 'Phần thưởng của bạn:', 'Rewards:': 'Phần thưởng:', 'Offers': 'Ưu đãi', 'Claim offers to unlock more!': 'Nhận ưu đãi để mở thêm!',
  'Welcome to your': 'Chào mừng đến', 'New Mart !': 'Chợ mới!', 'Rolling': 'Đang quay', 'Income:': 'Thu nhập:',
  'Max Income': 'Thu nhập tối đa', 'Max Income:': 'Thu nhập tối đa:', 'Not enough Goldbars': 'Không đủ vàng thỏi',
  'All your marts, cash, gems, gold and outfits will be erased, here and in your hub account. This cannot be undone.':
    'Toàn bộ chợ, tiền, đá quý, vàng và trang phục sẽ bị xoá, cả ở đây lẫn trong tài khoản hub. Không hoàn tác được.',
  'Coin Bundles': 'Gói tiền', 'Gem Bundles': 'Gói đá quý', 'Daily Deals': 'Ưu đãi hôm nay', 'Player': 'Chủ tiệm',
  'Double income': 'Gấp đôi thu nhập', 'Extra customers': 'Thêm khách', 'Extra Customers': 'Thêm khách',
  'Faster machines': 'Máy chạy nhanh', 'Faster Machines': 'Máy chạy nhanh', 'Faster workers': 'Nhân viên nhanh',
  'Faster Workers': 'Nhân viên nhanh', 'Faster Animals': 'Vật nuôi nhanh', 'Faster Player': 'Chủ tiệm đi nhanh',
  'Speed boost': 'Tăng tốc', 'Extra Speed': 'Tăng tốc', 'Revenue Boost': 'Tăng doanh thu', 'Super Worker': 'Nhân viên siêu tốc',
  'Free gifts! Claim one by one': 'Quà miễn phí! Nhận lần lượt', 'Daily spin for free gems': 'Quay mỗi ngày nhận đá quý',
  'Shop: cash & gem bundles': 'Cửa hàng: gói tiền và đá quý', 'Dress up: skins, outfits, pets': 'Thay đồ: trang phục, quần áo, thú cưng',
  'Car order: fill it for big cash': 'Đơn xe: gom đủ hàng để nhận nhiều tiền',
};

// Customer looks, one per scene template (_CustomerAgent_1..8); hand props would clash with the carried box.
const CUSTOMER_LOOKS = ['Nông dân áo xanh', 'Cô áo tím', 'Cô gái áo dài', 'Chú xe ôm', 'Bà chủ sạp', 'Bé đi học', 'Bác bảo vệ', 'Ông đồ'];
const WORKER_LOOK = { _Worker_FarmerA: 'Nông dân áo xanh', _Worker_ChefA: 'Bà chủ sạp' };

function handFree(name) {
  const L = LOOKS[name];
  return { ...L, parts: L.parts.filter(([bone]) => !/Hand$/.test(bone)) };
}

export const CREDITS = [
  ['Trâu (Bull)', 'Quaternius', 'CC0', 'https://poly.pizza/m/a8PIIYwF7r'],
  ['Cây dừa (Palm Tree)', 'Quaternius', 'CC0', 'https://poly.pizza/m/A6cKJYFsIb'],
  ['Bụi tre (Bamboo)', 'Quaternius', 'CC0', 'https://poly.pizza/m/xBPj13w3JQ'],
  ['Chòi (Hut)', 'Quaternius', 'CC0', 'https://poly.pizza/m/wxi3kAu5ey'],
  ['Sạp chợ (Market Stand)', 'Quaternius', 'CC0', 'https://poly.pizza/m/DGIM5HGISb'],
  ['Xe đẩy gỗ (Cart)', 'Quaternius', 'CC0', 'https://poly.pizza/m/l7bDe7ak6j'],
  ['Đống rơm (Hay)', 'Quaternius', 'CC0', 'https://poly.pizza/m/Yu8TOERkpw'],
  ['Lồng đèn đỏ (red lantern)', 'Sophie Kim', 'CC-BY 3.0', 'https://poly.pizza/m/7PZhxLFiGc2'],
  ['Xe Vespa (Vespa)', 'Jasmine Roberts', 'CC-BY 3.0', 'https://poly.pizza/m/blGLclvvdEM'],
  ['Xe đạp (Bicycle)', 'Poly by Google', 'CC-BY 3.0', 'https://poly.pizza/m/5pBoRkAPQk6'],
];

export default {
  id: 'cho-viet',
  mart: 'store1',
  text: TEXT,

  // Before the store is built: one mart only, the goods renamed and redrawn, the props' obstacles in the navmesh.
  data({ data, items, marts, nav }) {
    const NEXT = 'Mat_Activate_NextMart';
    data.mats = data.mats.filter(m => m.name !== NEXT);
    for (const m of data.mats) {
      const k = m.activate.indexOf(NEXT);
      if (k >= 0) { m.activate.splice(k, 1); if (m.delays.length > k) m.delays.splice(k, 1); }
      m.highlight = m.highlight.filter(n => n !== NEXT);
    }
    for (const [t, o] of Object.entries(ITEMS)) {
      const it = items.types[t];
      if (o.like != null) { it.mesh = items.types[o.like].mesh; it.icon = items.types[o.like].icon; }
      if (o.icon) it.icon = ICONS + o.icon;
      it.name = o.name;
    }
    const m = marts.find(x => x.id === this.mart);
    m.name = 'Chợ Việt';
    nav.obstacles = [...(nav.obstacles || []), ...obstacles()];
  },

  // After the world, view and looks exist: clothes, props and their animation.
  async world({ world, store, view, looks, gltfLoader }) {
    const pose = o => { const r = view.rigOf(o); if (r) { r.play('Idle', 0); r.update(0); } };
    // Recoloured outfits copy the shared palette's pixels, so wait for the full image (the 16 px one comes first).
    const palette = looks.mats[0].mat.uniforms.map.value, t0 = performance.now();
    await new Promise(ok => { const f = () => ((palette.image && palette.image.width > 16) || performance.now() - t0 > 15000 ? ok() : setTimeout(f, 50)); f(); });
    const outfits = palette.image && palette.image.width > 16 ? looks : null;
    [...view.agentTemplates.values()].forEach((o, k) => { pose(o); dress(o, handFree(CUSTOMER_LOOKS[k % CUSTOMER_LOOKS.length]), outfits); });
    for (const o of world.objects) {
      if (!/^_Worker_/.test(o.name)) continue;
      pose(o);
      const name = WORKER_LOOK[o.name] || 'Cô áo tím';
      dress(o, { parts: LOOKS[name].parts });
    }
    // The player keeps its cosmetics outfit; the nón lá replaces the hat (put back whenever the hat changes).
    const player = world.objects[store.player.node];
    pose(player);
    dress(player, { parts: LOOKS['Chủ tiệm (người chơi)'].parts });
    const apply = looks.apply.bind(looks);
    const noHats = () => player.traverse(x => { if (x !== player && /^(hat_|Santa Hat|Reindeer|stickman_Player_Hat)/.test(x.name)) x.visible = false; });
    looks.apply = eq => { const r = apply(eq); noHats(); return r; };
    noHats();
    const mixers = await placeProps(gltfLoader, world.root);
    // The frame loop ticks world.rigs; the herd rides along.
    world.rigs.push({ update: dt => mixers.forEach(m => m.update(dt)) });
  },
};
