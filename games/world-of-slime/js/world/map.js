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
 * Ngoài khuôn game (chỉ bản web):  _dev:bool (bản đồ thử), id, name,
 *   web: { blocked:int[] }  // [ĐỀ XUẤT] ô có cây/đá chặn đi; va chạm thật là dữ liệu server chưa có
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
import { loadGLB, loadJSON, loadTex, assetUrl } from '../assets.js?v=20261021a';
import { envMaterial } from './envmat.js?v=20261021a';
import { MOVE } from '../config.js?v=20261021a';

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
  // Đi được: có đất, không phải nước, không bị chặn, bậc không quá MOVE.stepMax (trừ trên cầu thang).
  canStand(ux, uz, fromH) {
    const i = this.index(ux, uz);
    if (i < 0 || this.floors[i] == null) return false;
    if (this.landType[i] === LAND.WATER) return false;
    if (this.blocked.has(i)) return false;
    const h = this.getHeight(ux, uz);
    if (fromH != null && Math.abs(h - fromH) > MOVE.stepMax) return false;
    return true;
  }

  async build({ onProgress } = {}) {
    const idx = await loadJSON('map/index.json');
    const pieceInfo = new Map(idx.pieces.map(p => [p.name, p]));
    // gom tile theo tên mảnh
    const byName = new Map();
    for (const layer of this.data.tile.layers) for (const fl of layer.floors) for (const t of fl.tiles) {
      if (t.isInvisible) continue;
      if (!byName.has(t.name)) byName.set(t.name, []);
      byName.get(t.name).push({ t, floor: fl.floor });
    }
    const glbs = new Set();
    for (const n of byName.keys()) {
      const p = pieceInfo.get(n);
      if (p) glbs.add(p.glb); else this.stats.missing.push(n);
    }
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
    const tileMatrix = (t, floor, out) => {
      const x = t.index % this.width, z = Math.floor(t.index / this.width);
      let y = floor;
      if (t.name.startsWith('Path')) y += 0.005;
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
        list.forEach(({ t, floor }, i) => im.setMatrixAt(i, tileMatrix(t, floor, m4).multiply(rel)));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        if (mat.transparent) im.renderOrder = 2;
        parent.add(im); this.stats.instanced++;
      }
    }
    return this;
  }

  // HeightPropData từ BoxCollider của mảnh cầu thang: trục dài = hướng leo; đầu thấp/cao lấy theo floors[] hai đầu.
  _addStair(info, list) {
    // Game dựng HeightPropData từ BoxCollider; collider ở đây ngắn hơn mesh (ter01_stair_001: z -2.7..0.7 so với
    // mesh -3.5..1.5) nên hai đầu rơi vào ô cùng tầng. Dùng bounds của mesh, collider chỉ là dự phòng.
    const box = (info.colliders || []).find(c => c.type === 'BoxCollider' && c.size);
    const b = info.bounds ? { c: info.bounds.min.map((v, i) => (v + info.bounds.max[i]) / 2),
      s: info.bounds.min.map((v, i) => info.bounds.max[i] - v) } : box && { c: box.center, s: box.size };
    if (!b) return;
    for (const { t, floor } of list) {
      const x = t.index % this.width, z = Math.floor(t.index / this.width);
      const yaw = Math.round(((t.rotation || [0, 0, 0])[1] % 360 + 360) % 360 / 90) % 4;
      // tâm hộp trong toạ độ Unity cục bộ (glTF lật X), xoay theo yaw Unity (chiều kim đồng hồ nhìn từ trên)
      let cx = -b.c[0], cz = b.c[2], sx = b.s[0], sz = b.s[2];
      for (let k = 0; k < yaw; k++) { [cx, cz] = [cz, -cx]; [sx, sz] = [sz, sx]; }
      const wx = x + 0.5 + cx, wz = z + 0.5 + cz;
      const s = { minX: wx - sx / 2, maxX: wx + sx / 2, minZ: wz - sz / 2, maxZ: wz + sz / 2 };
      s.axis = sz >= sx ? 'z' : 'x';
      const mid = s.axis === 'z' ? (s.minX + s.maxX) / 2 : (s.minZ + s.maxZ) / 2;
      const end = v => s.axis === 'z' ? this.floorHeight(mid, v) : this.floorHeight(v, mid);
      const lo = s.axis === 'z' ? s.minZ : s.minX, hi = s.axis === 'z' ? s.maxZ : s.maxX;
      const hLo = end(lo - 0.5), hHi = end(hi + 0.5);
      s.lowAt = hLo <= hHi ? 'min' : 'max';
      s.h0 = Math.min(hLo, hHi); s.h1 = Math.max(hLo, hHi);
      if (s.h0 < -100) s.h0 = floor; if (s.h1 < -100) s.h1 = floor + 2;
      this.stairs.push(s);
    }
  }

  spawn() {
    const m = (this.data.client.positionMarkerDatas || []).find(p => p.type === 0);
    return m ? { x: m.pos[0], z: m.pos[1] } : { x: this.width / 2, z: this.height / 2 };
  }
}
