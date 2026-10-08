/*
 * Hệ hạt dùng chung cho mọi prefab ParticleSystem của bản gốc, gọi theo đúng tên prefab/GameObject gốc.
 *   DRParticles.init(scene)                         gọi một lần khi tải xong thế giới
 *   DRParticles.spawn('RelicParticles', { pos:[x,y,z] | Vector3, parent:Object3D, yaw, scale, loop }) → { stop(), alive }
 *   DRParticles.has(name)                            có dữ liệu cho prefab ấy chưa
 *   DRParticles.update(dt, cam)                      mỗi khung, từ main.js
 * Bản này là khung rỗng: chưa có prefab nào, spawn chỉ cảnh báo một lần cho mỗi tên và trả về tay cầm rỗng.
 * tools/particles.py + bản đầy đủ của tệp này thay thế nó; test/dredge-asset-keys.js liệt kê các tên đang gọi mà chưa có dữ liệu.
 */
(function (root) {
  'use strict';
  const warned = {};
  const none = { stop() {}, alive: false };
  function spawn(name) {
    if (!warned[name]) { warned[name] = true; console.warn('[particles] prefab not ported:', name); }
    return none;
  }
  root.DRParticles = { init() {}, update() {}, spawn, has: () => false, names: () => [] };
})(typeof window !== 'undefined' ? window : globalThis);
