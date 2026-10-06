// Bản đồ 3x3 chunk của Hide And Seek, dựng thành lưới ô cho va chạm + cấu trúc `map` mà SK.world.drawFloor/collect vẽ được.
// Toạ độ thế giới = toạ độ Unity trừ (ox, oy); 1 đơn vị = 1 ô = 16 px (gameplay.md 5.1).
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, D = SK.D, HM = window.HS_MAP;
  const VOID = 0, FLOOR = 1, WALL = 2;
  const KIND = { FREE: 0, WALL: 1, TABLE: 2 };   // chặn đường: tường chặn mọi người, bàn chỉ chặn người tìm (người trốn nhảy qua)
  const PAD = 0.2;                                 // nới hình chữ nhật khi tô ô, để tường 1.4 phủ trọn ô chạm vào

  // tô mọi ô có tâm nằm trong hình chữ nhật xoay của item (toạ độ Unity)
  function rasterize(it, ox, oy, pad, fn) {
    const hw = it.w / 2 + pad, hh = it.h / 2 + pad, rad = (it.rot || 0) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const ext = Math.abs(hw * c) + Math.abs(hh * s), exy = Math.abs(hw * s) + Math.abs(hh * c);
    const ux = it.x, uy = it.y;
    for (let ty = Math.floor(uy - exy - oy); ty <= Math.ceil(uy + exy - oy); ty++)
      for (let tx = Math.floor(ux - ext - ox); tx <= Math.ceil(ux + ext - ox); tx++) {
        const dx = tx + ox + 0.5 - ux, dy = ty + oy + 0.5 - uy;
        const lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) fn(tx, ty);
      }
  }

  function shapes(rng) {
    const items = HM.static.map(i => Object.assign({}, i));
    const chosen = HM.anchors.map(() => 'MapRandom' + (1 + Math.floor(rng() * 3)));
    HM.anchors.forEach((a, i) => {
      for (const it of HM.chunks[chosen[i]].items) items.push(Object.assign({}, it, { x: it.x + a[0], y: it.y + a[1] }));
    });
    return { items, chosen };
  }

  function extent(items) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const it of items) {
      if (it.k !== 'wall') continue;
      const m = Math.max(it.w, it.h) / 2 + 1;
      x0 = Math.min(x0, it.x - m); y0 = Math.min(y0, it.y - m); x1 = Math.max(x1, it.x + m); y1 = Math.max(y1, it.y + m);
    }
    return { ox: Math.floor(x0), oy: Math.floor(y0), W: Math.ceil(x1) - Math.floor(x0), H: Math.ceil(y1) - Math.floor(y0) };
  }

  const idx = (map, tx, ty) => ty * map.W + tx;
  const inMap = (map, tx, ty) => tx >= 0 && ty >= 0 && tx < map.W && ty < map.H;
  function kindAt(map, tx, ty) { return inMap(map, tx, ty) ? map.kind[idx(map, tx, ty)] : KIND.WALL; }

  // ô còn trống ở gần (x,y) nhất (vòng xoắn), trả toạ độ tâm ô
  function nearestFree(map, x, y, needReach) {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let r = 0; r < 40; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx, ty = cy + dy;
        if (kindAt(map, tx, ty) === KIND.FREE && (!needReach || map.reach[idx(map, tx, ty)])) return { x: tx + 0.5, y: ty + 0.5 };
      }
    return { x: x, y: y };
  }

  function floodReach(map, sx, sy) {
    const reach = map.reach, q = [idx(map, sx, sy)];
    reach[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % map.W, y = (i / map.W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(map, nx, ny)) continue;
        const j = idx(map, nx, ny);
        if (reach[j] || map.kind[j] === KIND.WALL) continue;
        reach[j] = 1; q.push(j);
      }
    }
  }

  function addObstacle(map, name, tx, ty, kind) {
    const parts = SK.prefab(name);
    if (!parts) return;
    map.obs.set(idx(map, tx, ty), { name, parts, tx, ty, x: tx * 16 + 8, y: (ty + 1) * 16, t: 0, kind, solid: false });
  }

  function tileWorld(map, it) { return { x: it.x - map.ox, y: it.y - map.oy }; }

  TT.buildMap = function (rng) {
    const { items, chosen } = shapes(rng), e = extent(items), n = e.W * e.H;
    const th = D.themes.forest, art = SK.art.tiles('forest');
    const map = {
      theme: 'forest', th, lib: th.lib, W: e.W, H: e.H, ox: e.ox, oy: e.oy, rooms: [], obs: new Map(), tiles: new Uint8Array(n), deco: new Uint8Array(n),
      door: new Int16Array(n), art: { floor: art.floor, walls: [art.walls[1] || art.walls[0]] }, bush: art.walls[0], bg: th.bg, chosen,
      kind: new Uint8Array(n), grass: new Uint8Array(n), water: new Uint8Array(n), reach: new Uint8Array(n), tableOf: new Int16Array(n).fill(-1),
      hidePos: [], boxPoints: [], trash: [], puddleSpots: [], tables: []
    };
    const set = (arr, v, pad) => it => rasterize(it, map.ox, map.oy, pad, (tx, ty) => { if (inMap(map, tx, ty)) arr[idx(map, tx, ty)] = v; });
    const spawns = [];
    for (const it of items) {
      if (it.k === 'wall') set(map.kind, KIND.WALL, it.w >= 5 ? 0 : PAD)(it);
      else if (it.k === 'table') rasterize(it, map.ox, map.oy, 0.1, (tx, ty) => { const i = idx(map, tx, ty); if (inMap(map, tx, ty) && map.kind[i] === KIND.FREE) map.kind[i] = KIND.TABLE; });
    }
    for (const it of items) {
      if (it.k === 'grass') { const t = tileWorld(map, it); const tx = Math.floor(t.x), ty = Math.floor(t.y); if (inMap(map, tx, ty)) map.grass[idx(map, tx, ty)] = 1; }
      else if (it.k === 'grassarea') set(map.grass, 1, 0)(it);
      else if (it.k === 'water') set(map.water, 1, 0)(it);
      else if (it.k === 'spawn') spawns.push(tileWorld(map, it));
      else if (it.k === 'box') map.boxPoints.push(tileWorld(map, it));
      else if (it.k === 'trash') map.trash.push(Object.assign(tileWorld(map, it), { r: 0.8, state: 'idle' }));
      else if (it.k === 'other' && /TrashWater puddle/.test(it.n || '')) map.puddleSpots.push(Object.assign(tileWorld(map, it), { w: it.w, h: it.h }));
    }
    for (let i = 0; i < n; i++) {
      if (map.kind[i] === KIND.WALL) map.grass[i] = 0;
      map.deco[i] = rng() < 0.55 ? 0 : 1 + Math.floor(rng() * 5);
    }
    // vùng đi được: loang từ giữa bản đồ; ô không tới được thành VOID để khỏi vẽ sàn ngoài tường
    const c = nearestFree(map, map.W / 2, map.H / 2, false);
    floodReach(map, Math.floor(c.x), Math.floor(c.y));
    for (let i = 0; i < n; i++) map.tiles[i] = map.kind[i] === KIND.WALL ? WALL : map.reach[i] ? FLOOR : VOID;
    buildProps(map, rng);
    spawns.forEach((p, i) => { if (i % 3 === 0) map.hidePos.push(nearestFree(map, p.x, p.y, true)); });   // SpawnRandomBox.cs:66-81, mỗi điểm thứ 3
    for (const p of map.boxPoints) { const q = nearestFree(map, p.x, p.y, true); p.x = q.x; p.y = q.y; }
    return map;
  };

  // bàn, bụi, nước, thùng rác thành obstacle để W.collect vẽ; tường sâu (không kề sàn) bỏ vẽ cho nhẹ
  function buildProps(map, rng) {
    for (let ty = 0; ty < map.H; ty++) for (let tx = 0; tx < map.W; tx++) {
      const i = idx(map, tx, ty);
      if (map.kind[i] === KIND.TABLE && map.reach[i]) addObstacle(map, 'box02', tx, ty, 'box');
      else if (map.water[i] && map.reach[i] && map.kind[i] === KIND.FREE) addObstacle(map, 'speed_down', tx, ty, 'pad');
      if (map.kind[i] === KIND.WALL && !touchesFloor(map, tx, ty)) map.tiles[i] = VOID;
    }
    for (const t of map.trash) { const tx = Math.floor(t.x), ty = Math.floor(t.y); t.tx = tx; t.ty = ty; addObstacle(map, 'cask_red_2', tx, ty, 'box'); }
  }
  function touchesFloor(map, tx, ty) {
    for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(map, tx + dx, ty + dy) && map.tiles[idx(map, tx + dx, ty + dy)] === FLOOR) return true;
    return false;
  }

  // vị trí (x,y) có va chạm ô với hộp bán kính r? mask = các KIND chặn
  function boxBlocked(map, x, y, r, tableBlocks) {
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++)
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        const k = kindAt(map, tx, ty);
        if (k === KIND.WALL || (k === KIND.TABLE && tableBlocks)) return true;
      }
    return false;
  }

  TT.KIND = KIND;
  TT.mapUtil = { idx, inMap, kindAt, nearestFree, boxBlocked, addObstacle, VOID, FLOOR, WALL };
})();
