// Vật liệu / hạt giống / bản vẽ rơi từ quái và trùm (bảng rơi gốc `enemies.Drops` + `DropGroups`, data/sk-items.js do
// tools/items/build_items.py sinh). Quái chết (sự kiện 'enemyKill', cả trùm) tung xúc xắc theo id quái (e_orc01, ex_orc01, boss07...),
// sinh vật nhặt kiểu 'material'; nhặt thì vào kho hồ sơ ngay (SK.profile.addItem) nên không mất khi chết, như gốc.
// p > 100: chắc chắn floor(p/100) món + (p mod 100)% thêm một món. Nhóm DropGroups (g): mỗi lần tung rơi tối đa một món trong nhóm.
(function () {
  'use strict';
  const SK = window.SK, DB = window.SK_ITEMS;
  if (!DB || !SK.pickupKinds) return;
  const sheet = new Image();
  sheet.src = DB.sheet + '?v=20261010e';
  const COLOR = { mat: '#ffe9a0', seed: '#9cff9c', bp: '#8fd2ff', token: '#ffb3ff' };
  const SCALE = 0.7;   // icon gốc 15-30 px; hạ cho vừa cạnh xu (7 px) và nhân vật [ƯỚC LƯỢNG]

  // Tung xúc xắc cho một loại quái -> [{key, n}]. rnd: hàm 0..1 (kiểm thử truyền vào hàm chắc chắn).
  function roll(id, rnd) {
    rnd = rnd || SK.rand;
    const rows = (DB.drops || {})[id];
    if (!rows) return [];
    const out = {}, groups = {};
    for (const r of rows) {
      if (r[2]) { (groups[r[2]] = groups[r[2]] || []).push(r); continue; }
      const n = Math.floor(r[1] / 100) + (rnd() * 100 < r[1] % 100 ? 1 : 0);
      if (n) out[r[0]] = (out[r[0]] || 0) + n;
    }
    for (const g of Object.values(groups)) {
      let x = rnd() * 100;
      for (const r of g) if ((x -= r[1]) < 0) { out[r[0]] = (out[r[0]] || 0) + 1; break; }
    }
    return Object.keys(out).map(key => ({ key, n: out[key] }));
  }

  const it = key => DB.items[key];
  SK.pickupKinds.material = {
    range: () => 6 * SK.PPU,
    take(G, p, k) {
      SK.profile.addItem(k.key, k.n || 1);
      const d = it(k.key);
      SK.num(G, p.x, p.y - 26, '+' + (k.n || 1) + ' ' + (d ? d.vi : k.key), COLOR[d && d.t] || '#fff');
      return true;
    },
    draw(ctx, k, t) {
      const d = it(k.key), ic = d && d.icon, bob = Math.sin(t * 5) * 0.8 + 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(k.x, k.y, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      const y = k.y - k.z - bob;
      if (ic && sheet.complete && sheet.naturalWidth) {
        ctx.imageSmoothingEnabled = false;
        // ic = [x, y, w, h, ax, ay]; đặt giữa theo x, đáy ảnh nằm trên bóng
        ctx.drawImage(sheet, ic[0], ic[1], ic[2], ic[3], Math.round(k.x - ic[2] * SCALE / 2), Math.round(y - ic[3] * SCALE), Math.round(ic[2] * SCALE), Math.round(ic[3] * SCALE));
      } else { ctx.fillStyle = COLOR[d && d.t] || '#fff'; ctx.fillRect(Math.round(k.x - 2), Math.round(y - 6), 4, 4); }
    }
  };

  function dropFor(G, e) {
    if (e._dropped || !G.player) return;
    e._dropped = true;
    if (e.bossKey && SK.profile.addStat) SK.profile.addStat('boss', 1);
    for (const r of roll(e.id)) for (let i = 0; i < r.n; i++) SK.dropPickup(G, 'material', e.x, e.y - 4, { key: r.key, n: 1 });
  }
  SK.on('enemyKill', dropFor);
  SK.drops = { roll, table: DB.drops, items: DB.items };
})();
