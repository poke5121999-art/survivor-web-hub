/*
 * Bản đồ: tải JSON, đặt mảnh, tra độ cao / đi được / landType.
 *
 * ── KHUÔN DỮ LIỆU (data/maps/<id>.json) ─────────────────────────────────────────────────────────────────────────
 * Hai khối giữ ĐÚNG tên trường của game (D:\wos-ref\notes\MAPBUILD.md §1), để đổi _client.dat + _tile.dat 1:1:
 *
 * client: ClientMapData {
 *   width, height,                    // số ô; ô (x,z): x = index % width, z = floor(index / width); 1 ô = 1 m
 *   floors:   (int|null)[width*height]  // độ cao đỉnh đi được (m) = tầng cao nhất + 1; null = không có đất (-999)
 *   landType: (int|null)[width*height]  // -1 None, 0 Ground, 1 Grass, 2 Stone, 3 Water, 4 Snow, 5 Sand (tiếng bước chân)
 *   cameraMoveRect: { startX, startY, endX, endY, fov }   // giới hạn camera theo ô (Y của rect = trục z)
 *   verticalFogData: { height, farDistance, nearDistance, color:[r,g,b,a], fogPosDynamic }
 *   bgm: string,                      // tên sự kiện Wwise (audio/index.json events)
 *   mapBackgroundType, mapLightType: int,
 *   positionMarkerDatas: [{ type:int, pos:[x,z] }]        // [ĐỀ XUẤT] type 0 = chỗ xuất phát của người chơi
 * }
 * tile: TileMapData {
 *   width, height,
 *   layers: [{ floors: [{ floor:int, tiles: [TileData] }] }]
 * }
 * TileData { index:int, name:string, rotation:[x,y,z] (euler độ, Unity ZXY), scale:[x,y,z] (âm = lật),
 *            isInvisible:bool, useImposterObject:bool }
 * collide: { width: 2*W, height: 2*H, cell: 0.5, flags: int[] }   // map_type_{id}_collide.dat (MiniMapLoader.GetColors):
 *   lưới 0.5 m, ô con (sx, sz) = flags[sx + sz*2W]; bit k = MapCollisionFlag k+1: bit0 WALL, bit1 EXCLUSIVE,
 *   bit2..5 SLIDE_UP/RIGHT/DOWN/LEFT, bit6 WATER, bit7 JUMP, bit8 ICE; 0 = ENABLE (đi được). tools/import_maps.py
 * tile.layers[k]: k = MapObject.LayerTypes - 1 (0 Common, 1 Common_Second, 2 Route, 3 Route_New, 4 Shadow, 6 Water, 7/8 Route_*_Second)
 * Ngoài khuôn game (chỉ bản web):  _dev:bool (bản đồ thử), id, name,
 *   web: { blocked:int[] }  // [ĐỀ XUẤT] chỉ bản đồ thử (không có collide): ô có cây/đá chặn đi
 *
 * ── CÁCH ĐẶT (MAPBUILD §7) ─────────────────────────────────────────────────────────────────────────────────────
 * Mảnh 'Map/<name>' = node con cùng tên trong map/<folder>.glb (map/index.json pieces[name].glb).
 * Unity: localPosition = (x + 0.5, floor, z + 0.5); Path_* cộng 0.005 (createPlaneHeight); rotation = Euler ZXY.
 * GLB đã lật trục X (EXPORT_MAP.md): three = (-ux, uy, uz), quaternion (qx, -qy, -qz, qw).
 * Gộp: mỗi (mảnh, mesh con) là một InstancedMesh. Mảnh có xương/anim thì clone riêng.
 *
 * API dùng toạ độ Unity (ux, uz) cho logic; chỉ phần dựng cảnh đổi sang three.
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, loadJSON, loadTex, assetUrl, expectBytes } from '../assets.js?v=20261022f';
import { envMaterial } from './envmat.js?v=20261022f';
import { MOVE } from '../config.js?v=20261022f';
import { PROPS } from '../../data/portals.js?v=20261022f';

export const LAND = { NONE: -1, GROUND: 0, GRASS: 1, STONE: 2, WATER: 3, SNOW: 4, SAND: 5 };
const D2R = Math.PI / 180;

// Unity euler (độ, thứ tự ZXY: q = qy * qx * qz) -> quaternion three sau khi lật X.
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
export function unityEulerToThree(rot, out = new THREE.Quaternion()) {
  _e.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'YXZ');   // three 'YXZ' = R = Ry * Rx * Rz = Unity ZXY
  _q.setFromEuler(_e);
  return out.set(_q.x, -_q.y, -_q.z, _q.w);
}

export async function loadMapData(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('map load failed: ' + url + ' (http ' + r.status + ')');
  return r.json();
}

export class GameMap {
  constructor(data) {
    this.data = data;
    const c = data.client;
    this.width = c.width; this.height = c.height;
    this.floors = c.floors; this.landType = c.landType;
    this.blocked = new Set((data.web && data.web.blocked) || []);
    this.collide = data.collide || null;   // lưới va chạm thật của server (0.5 m)
    this.stairs = [];            // { minX, maxX, minZ, maxZ, axis:'x'|'z', lowAt:'min'|'max', h0, h1 } (Unity)
    this.root = new THREE.Group(); this.root.name = 'Map';
    this.water = new THREE.Group(); this.water.name = 'Map_Water';
    this.root.add(this.water);
    this.stats = { tiles: 0, pieces: 0, instanced: 0, cloned: 0, missing: [] };
  }

  index(ux, uz) {
    const x = Math.floor(ux), z = Math.floor(uz);
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return -1;
    return x + z * this.width;
  }
  // MapController.GetFloorHeightFromMapData: -999 khi null hoặc ngoài lưới.
  floorHeight(ux, uz) {
    const i = this.index(ux, uz);
    const v = i < 0 ? null : this.floors[i];
    return v == null ? -999 : v;
  }
  // MapController.GetHeight: độ cao ô, cầu thang (HeightPropData) thì nội suy.
  getHeight(ux, uz) {
    for (const s of this.stairs) {
      if (ux < s.minX || ux > s.maxX || uz < s.minZ || uz > s.maxZ) continue;
      const v = s.axis === 'x' ? ux : uz, lo = s.axis === 'x' ? s.minX : s.minZ, hi = s.axis === 'x' ? s.maxX : s.maxZ;
      let t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      if (s.lowAt === 'max') t = 1 - t;
      return s.h0 + (s.h1 - s.h0) * t;
    }
    return this.floorHeight(ux, uz);
  }
  onStair(ux, uz) {
    return this.stairs.some(s => ux >= s.minX && ux <= s.maxX && uz >= s.minZ && uz <= s.maxZ);
  }
  landTypeAt(ux, uz) {
    const i = this.index(ux, uz);
    const v = i < 0 ? null : this.landType[i];
    return v == null ? LAND.NONE : v;
  }
  // cờ va chạm ô con 0.5 m (MapCollisionFlag bit); -1 = ngoài lưới
  collideAt(ux, uz) {
    const c = this.collide; if (!c) return null;
    const sx = Math.floor(ux * 2), sz = Math.floor(uz * 2);
    if (sx < 0 || sz < 0 || sx >= c.width || sz >= c.height) return -1;
    return c.flags[sx + sz * c.width];
  }
  // Đi được: có lưới va chạm thật thì theo nó (WALL bit0, WATER bit6 chặn); không thì theo floors/landType/web.blocked.
  // Bậc không quá MOVE.stepMax (trừ trên cầu thang).
  canStand(ux, uz, fromH) {
    const i = this.index(ux, uz);
    if (i < 0) return false;
    if (this.collide) {
      const f = this.collideAt(ux, uz);
      if (f < 0 || (f & 1) || (f & 64)) return false;
      if (this.floors[i] == null && !this.onStair(ux, uz)) return false;
    } else {
      if (this.floors[i] == null) return false;
      if (this.landType[i] === LAND.WATER) return false;
      if (this.blocked.has(i)) return false;
    }
    const h = this.getHeight(ux, uz);
    if (fromH != null && Math.abs(h - fromH) > MOVE.stepMax) return false;
    return true;
  }

  async build({ onProgress } = {}) {
    const idx = await loadJSON('map/index.json');
    const pieceInfo = new Map(idx.pieces.map(p => [p.name, p]));
    // gom tile theo tên mảnh
    const byName = new Map();
    this.data.tile.layers.forEach((layer, li) => { for (const fl of layer.floors) for (const t of fl.tiles) {
      if (t.isInvisible) continue;
      if (!byName.has(t.name)) byName.set(t.name, []);
      byName.get(t.name).push({ t, floor: fl.floor, layer: li });
    } });
    const glbs = new Set();
    for (const n of byName.keys()) {
      const p = pieceInfo.get(n);
      if (p) glbs.add(p.glb); else this.stats.missing.push(n);
    }
    // byte dự kiến của từng GLB (map/index.json bundles[].kb) cho thanh tải
    for (const b of Object.values(idx.bundles || {})) if (glbs.has(b.glb) && b.kb) expectBytes(b.glb, b.kb * 1024);
    onProgress && onProgress(0, '');   // báo đã biết tổng byte của bản đồ (màn tải mới bắt đầu tính %)
    let done = 0;
    const loaded = {};
    await Promise.all([...glbs].map(async g => {
      loaded[g] = await loadGLB(g);
      onProgress && onProgress(++done / glbs.size, g);
    }));
    // material.extras.tex ghi uri tương đối với GLB ("tex/<hash>.webp"), index.json thì ghi "map/tex/..."
    const texForGlb = g => (uri, ramp) => loadTex(/^(map|prop|slime|npc|player)\//.test(uri) ? uri : g.replace(/[^/]+$/, '') + uri, { nearest: !!ramp });
    const nodeOf = {};
    for (const [g, gl] of Object.entries(loaded)) {
      gl.scene.updateMatrixWorld(true);
      const lib = gl.scene.children[0];
      const texFor = texForGlb(g);
      for (const k of lib.children) nodeOf[k.userData.name || k.name] = { node: k, gltf: gl, texFor };
    }

    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    // Route: createPlaneHeight 0.005 + routeOverlappedHeight. [ĐỀ XUẤT] lớp Route_New (3) nằm trên Route (2) thêm 0.005
    // (GetOverlappedRouteAddHeight chưa dịch ngược) để mép đường t01-C_b không z-fight với tâm t01-C_a.
    const ROUTE_ADD = { 2: 0, 3: 0.005, 7: 0.01, 8: 0.015 };
    const tileMatrix = (t, floor, out, layer = 0) => {
      const x = t.index % this.width, z = Math.floor(t.index / this.width);
      let y = floor;
      if (t.name.startsWith('Path')) y += 0.005 + (ROUTE_ADD[layer] || 0);
      pos.set(-(x + 0.5), y, z + 0.5);
      unityEulerToThree(t.rotation || [0, 0, 0], quat);
      const s = t.scale || [1, 1, 1];
      scl.set(Math.abs(s[0]) > 0 ? s[0] : 1, Math.abs(s[1]) > 0 ? s[1] : 1, Math.abs(s[2]) > 0 ? s[2] : 1);
      return out.compose(pos, quat, scl);
    };

    for (const [name, list] of byName) {
      const src = nodeOf[THREE.PropertyBinding.sanitizeNodeName(name)] || nodeOf[name];
      if (!src) { if (!this.stats.missing.includes(name)) this.stats.missing.push(name); continue; }
      this.stats.pieces++; this.stats.tiles += list.length;
      const info = pieceInfo.get(name) || {};
      const piece = src.node, texFor = src.texFor;
      const isWater = name.startsWith('Water');
      const parent = isWater ? this.water : this.root;
      if (/stair/i.test(name)) this._addStair(info, list);
      // Shadow Projector (shadow_001..004, lớp Shadow): hộp 8x8x25 chiếu _ShadowTex lên mesh nằm dưới nó. Ở 257/478 các
      // hộp đặt ngoài mép phòng, bên dưới không có mesh nào nhận bóng; vẽ thành mặt phẳng thì ra một mảng sáng giữa
      // nền tối (đã thử, ảnh 3_storage). Chưa có projector thật nên bỏ qua. [ĐỀ XUẤT]
      if (/^(ter01_)?shadow_00\d$/.test(name)) { this.stats.skipped = (this.stats.skipped || 0) + list.length; continue; }
      let skinned = false; piece.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
      if (skinned) {
        // mảnh có xương: clone riêng từng tile
        for (const { t, floor } of list) {
          const o = SkeletonUtils.clone(piece);
          o.traverse(k => { if (k.isMesh) { k.material = envMaterial(k.material, { hasVColor: !!k.geometry.attributes._color, skinned: true, texFor }); k.frustumCulled = false; } });
          tileMatrix(t, floor, m4).decompose(o.position, o.quaternion, o.scale);
          parent.add(o); this.stats.cloned++;
        }
        continue;
      }
      const inv = new THREE.Matrix4().copy(piece.matrixWorld).invert();
      const meshes = []; piece.traverse(o => { if (o.isMesh) meshes.push(o); });
      for (const mesh of meshes) {
        const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const mat = envMaterial(mesh.material, { hasVColor: !!mesh.geometry.attributes._color, texFor });
        const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
        im.name = name + '/' + mesh.name;
        list.forEach(({ t, floor, layer }, i) => im.setMatrixAt(i, tileMatrix(t, floor, m4, layer).multiply(rel)));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        if (mat.transparent) im.renderOrder = 2;
        parent.add(im); this.stats.instanced++;
      }
    }
    await this._props(PROPS[this.data.id] || []);
    return this;
  }

  // Đồ đạc server gửi (data/portals.js PROPS, F5a): mỗi vật là node `piece` trong prop GLB, đặt ở mặt sàn floors[] (Unity
  // x,z -> three (-x, h, z)), xoay yaw Unity quanh Y. Bỏ transform gốc của prefab như mảnh bản đồ (game đặt vật bằng
  // position/rotation của server, đè rotation gốc).
  async _props(list) {
    this.props = [];
    for (const pr of list) {
      try {
        const g = await loadGLB(pr.glb);
        g.scene.updateMatrixWorld(true);
        const src = g.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(pr.piece)) || g.scene.children[0];
        const texFor = (uri, ramp) => loadTex(/^(map|prop|slime|npc|player)\//.test(uri) ? uri : pr.glb.replace(/[^/]+$/, '') + uri, { nearest: !!ramp });
        const o = new THREE.Group(); o.name = 'prop:' + pr.piece;
        const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
        src.traverse(k => {
          if (!k.isMesh || k.isSkinnedMesh) return;
          const m = new THREE.Mesh(k.geometry, envMaterial(k.material, { hasVColor: !!k.geometry.attributes._color, texFor }));
          new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld).decompose(m.position, m.quaternion, m.scale);
          if (m.material.transparent) m.renderOrder = 2;
          o.add(m);
        });
        const h = this.floorHeight(pr.x, pr.z);
        o.position.set(-pr.x, h > -100 ? h : 0, pr.z);
        o.rotation.y = -(pr.yaw || 0) * D2R;
        this.root.add(o); this.props.push(o);
      } catch (e) { this.stats.missing.push('prop ' + pr.piece + ': ' + e.message); }
    }
  }

  // HeightPropData..ctor: hộp = Collider.bounds (thế giới) của BoxCollider mảnh cầu thang; minHeight/maxHeight = y của hộp.
  // Collider trong map/index.json ở hệ glTF (X lật, export_map.py collider()): Unity x = -center[0].
  // Hướng leo: game dùng rotation (yaw/90) + reverseX/Z (scale âm) trong TranslateHeightPosition; ở đây lấy trục có
  // floors[] hai đầu chênh nhau nhiều nhất, đầu cao là đầu có floors gần maxHeight.
  _addStair(info, list) {
    const box = (info.colliders || []).find(c => c.type === 'BoxCollider' && c.size && c.enabled !== false);
    // hộp collider; trap 7 (ARCH): ter01_stair_001 collider ngắn hơn mesh, hai đầu rơi vào cùng tầng -> thử lại bằng bounds mesh
    const boxes = [];
    if (box) {
      const cx = -box.center[0], cy = box.center[1], cz = box.center[2];
      boxes.push([cx - box.size[0] / 2, cx + box.size[0] / 2, cz - box.size[2] / 2, cz + box.size[2] / 2, cy - box.size[1] / 2, cy + box.size[1] / 2]);
    }
    if (info.bounds) { const b = info.bounds; boxes.push([-b.max[0], -b.min[0], b.min[2], b.max[2], b.min[1], b.max[1]]); }
    for (const { t, floor } of list) {
      for (let bi = 0; bi < boxes.length; bi++) {
        const s = this._stairBox(t, floor, ...boxes[bi]);
        if (s.fit || bi === boxes.length - 1) { this.stairs.push(s); break; }
      }
    }
  }
  _stairBox(t, floor, lx0, lx1, lz0, lz1, y0, y1) {
    {
      const x = t.index % this.width, z = Math.floor(t.index / this.width);
      const sc = t.scale || [1, 1, 1], yaw = ((t.rotation || [0, 0, 0])[1]) * D2R;
      // 4 góc: scale rồi xoay Unity Euler(0, yaw, 0): (x, z) -> (x cos + z sin, -x sin + z cos)
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const [px, pz] of [[lx0, lz0], [lx1, lz0], [lx0, lz1], [lx1, lz1]]) {
        const qx = px * sc[0], qz = pz * sc[2];
        const wx = x + 0.5 + qx * cs + qz * sn, wz = z + 0.5 - qx * sn + qz * cs;
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      }
      const s = { minX, maxX, minZ, maxZ, h0: floor + y0 * sc[1], h1: floor + y1 * sc[1], name: t.name, x, z };
      // ô ngay ngoài bốn cạnh (lấy giá trị hợp lệ gần tâm cạnh nhất)
      const side = (ax, v) => {
        const mid = ax === 'x' ? (minZ + maxZ) / 2 : (minX + maxX) / 2;
        for (const o of [0, -1, 1, -2, 2]) {
          const h = ax === 'x' ? this.floorHeight(v, mid + o) : this.floorHeight(mid + o, v);
          if (h > -100) return h;
        }
        return null;
      };
      const ends = { x: [side('x', minX - 0.5), side('x', maxX + 0.5)], z: [side('z', minZ - 0.5), side('z', maxZ + 0.5)] };
      const near = (h, v) => h != null && Math.abs(h - v) < 0.6;
      // trục leo: trục có một đầu khớp maxHeight; đầu kia khớp minHeight (hoặc không có đất: lối ra như quán trọ 257)
      const fit = e => (near(e[0], s.h1) && !near(e[1], s.h1)) ? 'min' : (near(e[1], s.h1) && !near(e[0], s.h1)) ? 'max' : null;
      const fx = fit(ends.x), fz = fit(ends.z);
      s.axis = fx && !fz ? 'x' : fz && !fx ? 'z' : (maxX - minX) >= (maxZ - minZ) ? 'x' : 'z';
      const hiAt = (s.axis === 'x' ? fx : fz) || 'max';
      s.fit = !!(fx || fz);
      s.lowAt = hiAt === 'max' ? 'min' : 'max';
      return s;
    }
  }

  spawn() {
    const m = (this.data.client.positionMarkerDatas || []).find(p => p.type === 0);
    return m ? { x: m.pos[0], z: m.pos[1] } : { x: this.width / 2, z: this.height / 2 };
  }
}
