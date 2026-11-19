import { quotaFor } from './quota.js';
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { quatY } from './physics.js';
import { FLOOR_DY, RAMP_LEN, heightAt as floorHeightAt } from './floors.js';

// Turns a housegen layout into a walkable 3D house: merged walls/floors/ceilings, swing doors, furniture, loot, pads, lamps.
// Layout tile (x, y) = world (x, z), 1 tile = 1 m. Everything static is merged into per-material 12 m chunks so frustum culling works.

const H = CFG.wallH;
const STAND_CAP = 2 * (CFG.player.halfHeight + CFG.player.radius);   // a robot needs this much air to stand on something
const CHUNK = 12;
const DOOR_H = 2.3;
const FLOOR_T = 0.2;

// ------------------------------------------------------------------ theme data
const THEMES = {
  vampire: {
    ambient: [0x8a7a9a, 0x3a2a2a, 0.55], fog: [0x0a0508, 0.045], lamp: 0xffb070, lampI: 5.5, lampKind: 'chandelier',
    loot: [1, 3, 1], door: { base: 0x3a2214, trim: 0x8a6a2a, panel: 0x2a170d },
    pal: { wood: 0x3a2214, wood2: 0x5a3820, fabric: 0x7a1822, fabric2: 0x2a1a30, metal: 0xb59a4a, stone: 0x4a4650, plant: 0x2f5a2a, plant2: 0x6a2a40, glass: 0x2a3a50 },
  },
  pyramid: {
    ambient: [0xb09a78, 0x4a3a28, 0.6], fog: [0x0d0904, 0.04], lamp: 0xffa860, lampI: 5, lampKind: 'chandelier',
    loot: [3, 1, 1], door: { base: 0xb89a62, trim: 0xd2a93a, panel: 0x8f7442 },
    pal: { wood: 0x6a4a2a, wood2: 0x8a6a3a, fabric: 0x2a5a7a, fabric2: 0xc8b070, metal: 0xd2a93a, stone: 0xc8a870, plant: 0x5a6a2a, plant2: 0x7a8a3a, glass: 0x40a0a0 },
  },
  vietnam: {
    ambient: [0xb0b890, 0x504830, 0.6], fog: [0x0a0c06, 0.035], lamp: 0xffd890, lampI: 5, lampKind: 'chandelier',
    loot: [1, 1, 3], door: { base: 0x6a3a1c, trim: 0x2a1a0a, panel: 0x7e4a26 },
    pal: { wood: 0x7a4a24, wood2: 0xa8743a, fabric: 0xa03030, fabric2: 0xe0d0a0, metal: 0x8a7a50, stone: 0x8a8a80, plant: 0x3a7a30, plant2: 0x5a9a40, glass: 0x6090a0 },
  },
  spacestation: {
    ambient: [0x8aa0c0, 0x303844, 0.65], fog: [0x04070c, 0.04], lamp: 0xaadfff, lampI: 6, lampKind: 'panel',
    loot: [1, 2, 1], door: { base: 0x6a7480, trim: 0x40d0e8, panel: 0x4a545e },
    pal: { wood: 0x56606a, wood2: 0x7a8794, fabric: 0x2a6a8a, fabric2: 0x4a2a7a, metal: 0xaab4be, stone: 0x3a4048, plant: 0x3acaa0, plant2: 0xa05ae0, glass: 0x40c0e0 },
  },
  asylum: {
    ambient: [0xb0c8b8, 0x405048, 0.65], fog: [0x060a08, 0.04], lamp: 0xe0ffe8, lampI: 5.5, lampKind: 'panel',
    loot: [2, 1, 2], door: { base: 0x9ab8a4, trim: 0x6a8a74, panel: 0x7a9a86 },
    pal: { wood: 0x6a6a5a, wood2: 0x8a8a78, fabric: 0x4a6a58, fabric2: 0xb0b8a8, metal: 0x9aa4a0, stone: 0x8a9088, plant: 0x4a7a4a, plant2: 0x8a4a7a, glass: 0x80a0a8 },
  },
};
const MATS = ['ceramic', 'wood', 'metal'];
const LEVELS = [1, 3, 6, 10, 15];

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const _c = new THREE.Color();
function rgb(hex, k = 1) { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; }

// ------------------------------------------------------------------ procedural textures (canvas)
function canvas(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, w, h); return c;
}
function speckle(g, w, h, rnd, n, amp, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * amp})`;
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
}
function blotches(g, w, h, rnd, n, rgbStr, amp) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgbStr},${amp * rnd()})`); gr.addColorStop(1, `rgba(${rgbStr},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const shade = (hex, k) => { _c.setHex(hex); _c.multiplyScalar(k); return '#' + _c.getHexString(); };
function jitter(hex, rnd, amt) { return shade(hex, 1 + (rnd() - 0.5) * 2 * amt); }

// walls are 2 m wide x 2.8 m high (256 px per metre), bottom of the canvas = floor
function wallTexture(theme, rnd) {
  const W = 512, Hh = 717, S = 256;
  return canvas(W, Hh, (g) => {
    if (theme === 'vampire') {
      g.fillStyle = '#4b1016'; g.fillRect(0, 0, W, Hh);
      for (let x = 0; x < W; x += 32) { g.fillStyle = x % 64 ? 'rgba(0,0,0,0.12)' : 'rgba(120,30,40,0.14)'; g.fillRect(x, 0, 16, Hh); }
      g.strokeStyle = 'rgba(150,60,60,0.35)'; g.lineWidth = 2;
      for (let y = -64; y < Hh; y += 128) for (let x = 0; x < W; x += 128) {
        g.beginPath(); g.moveTo(x + 64, y); g.lineTo(x + 128, y + 64); g.lineTo(x + 64, y + 128); g.lineTo(x, y + 64); g.closePath(); g.stroke();
        g.fillStyle = 'rgba(170,70,60,0.28)'; g.beginPath(); g.ellipse(x + 64, y + 64, 10, 22, 0, 0, 7); g.fill();
        g.beginPath(); g.ellipse(x + 64, y + 64, 22, 8, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      }
      blotches(g, W, Hh, rnd, 18, '0,0,0', 0.3);
      const wy = Hh - Math.round(0.95 * S);
      g.fillStyle = '#2b1810'; g.fillRect(0, wy, W, Hh - wy);
      for (let x = 0; x < W; x += 128) { g.strokeStyle = '#4a2c1c'; g.lineWidth = 4; g.strokeRect(x + 14, wy + 26, 100, Hh - wy - 56); g.strokeStyle = '#150a06'; g.strokeRect(x + 20, wy + 32, 88, Hh - wy - 68); }
      g.fillStyle = '#5a3822'; g.fillRect(0, wy, W, 16); g.fillStyle = '#1a0d08'; g.fillRect(0, wy + 16, W, 4);
      g.fillStyle = '#1c0f09'; g.fillRect(0, Hh - 22, W, 22); g.fillStyle = '#4a2c1c'; g.fillRect(0, Hh - 24, W, 3);
      g.fillStyle = '#2a0a10'; g.fillRect(0, 0, W, 14); g.fillStyle = '#7a5a2a'; g.fillRect(0, 14, W, 3);
    } else if (theme === 'pyramid') {
      g.fillStyle = '#7a5f3a'; g.fillRect(0, 0, W, Hh);
      const rows = 6, rh = Hh / rows;
      for (let r = 0; r < rows; r++) {
        let x = 0; const n = 3 + (r % 2);
        const cuts = [0]; for (let i = 1; i < n; i++) cuts.push(Math.round(W * (i + (rnd() - 0.5) * 0.4) / n)); cuts.push(W);
        const off = r % 2 ? 0 : 0;
        for (let i = 0; i < n; i++) {
          const x0 = cuts[i] + off, x1 = cuts[i + 1], y0 = r * rh;
          const base = r === rows - 1 ? 0xa88a58 : 0xcaa56a;
          g.fillStyle = jitter(base, rnd, 0.1); g.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, rh - 4);
          g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, 5);
          g.fillStyle = 'rgba(40,20,0,0.3)'; g.fillRect(x0 + 2, y0 + rh - 9, x1 - x0 - 4, 7); g.fillRect(x1 - 7, y0 + 2, 5, rh - 4);
        }
      }
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(30,20,10,0.55)'; const gx = 16 + (i % 13) * 38, gy = 10 + rh + Math.floor(i / 13) * 30; g.fillRect(gx, gy + 20 * rnd(), 8 + rnd() * 14, 4); g.fillRect(gx + 4, gy, 3, 14 + rnd() * 12); }
      g.fillStyle = 'rgba(210,169,58,0.6)'; g.fillRect(0, rh * 1 - 2, W, 4);
      blotches(g, W, Hh, rnd, 20, '60,40,10', 0.25); speckle(g, W, Hh, rnd, 9000, 0.12);
    } else if (theme === 'vietnam') {
      g.fillStyle = '#d6ac45'; g.fillRect(0, 0, W, Hh);
      blotches(g, W, Hh, rnd, 40, '255,235,160', 0.22); blotches(g, W, Hh, rnd, 30, '110,80,20', 0.22);
      const gr = g.createLinearGradient(0, Hh - 260, 0, Hh); gr.addColorStop(0, 'rgba(70,80,30,0)'); gr.addColorStop(1, 'rgba(60,70,30,0.5)'); g.fillStyle = gr; g.fillRect(0, Hh - 260, W, 260);
      g.strokeStyle = 'rgba(70,50,20,0.45)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { let x = rnd() * W, y = rnd() * Hh * 0.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 24; y += 12 + rnd() * 18; g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = '#efe2bd'; g.fillRect(0, Hh - 26, W, 26); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, Hh - 28, W, 3);
      g.fillStyle = '#8f6a2a'; g.fillRect(0, 0, W, 12);
      speckle(g, W, Hh, rnd, 9000, 0.1);
    } else if (theme === 'spacestation') {
      g.fillStyle = '#58626c'; g.fillRect(0, 0, W, Hh);
      const pw = 256, ph = 358;
      for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
        const x0 = px * pw, y0 = py * ph;
        const gr = g.createLinearGradient(0, y0, 0, y0 + ph); gr.addColorStop(0, '#6d7883'); gr.addColorStop(1, '#4a545e');
        g.fillStyle = gr; g.fillRect(x0 + 3, y0 + 3, pw - 6, ph - 6);
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x0 + 3, y0 + 3, pw - 6, ph - 6);
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(x0 + 8, y0 + 8, pw - 16, ph - 16);
        g.fillStyle = '#2c3138'; for (const [rx, ry] of [[14, 14], [pw - 14, 14], [14, ph - 14], [pw - 14, ph - 14]]) { g.beginPath(); g.arc(x0 + rx, y0 + ry, 4, 0, 7); g.fill(); }
        if ((px + py) % 2 === 0) { g.fillStyle = '#1e2329'; for (let i = 0; i < 6; i++) g.fillRect(x0 + 60, y0 + 90 + i * 14, pw - 120, 6); }
      }
      g.fillStyle = '#50f0ff'; g.fillRect(0, Hh - 0.95 * S - 3, W, 6); g.fillStyle = 'rgba(80,240,255,0.18)'; g.fillRect(0, Hh - 0.95 * S - 12, W, 24);
      for (let x = 0; x < W; x += 32) { g.fillStyle = (x / 32) % 2 ? '#d8b020' : '#16181a'; g.beginPath(); g.moveTo(x, Hh - 26); g.lineTo(x + 32, Hh - 26); g.lineTo(x + 16, Hh); g.lineTo(x - 16, Hh); g.fill(); }
      speckle(g, W, Hh, rnd, 5000, 0.1);
    } else {
      g.fillStyle = '#cdd5c0'; g.fillRect(0, 0, W, Hh);
      blotches(g, W, Hh, rnd, 24, '90,100,60', 0.18);
      for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(60,70,40,${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * W, 0, 4 + rnd() * 6, Hh * (0.3 + rnd() * 0.7)); }
      const th = Math.round(1.6 * S), ty = Hh - th, ts = 51;
      for (let y = ty; y < Hh; y += ts) for (let x = 0; x < W; x += ts) { g.fillStyle = jitter(0xa9c3a0, rnd, 0.06); g.fillRect(x + 1, y + 1, ts - 2, ts - 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1, y + 1, ts - 2, 3); }
      g.fillStyle = 'rgba(40,50,30,0.25)'; for (let y = ty; y < Hh; y += ts) g.fillRect(0, y, W, 1);
      g.fillStyle = '#5f8a66'; g.fillRect(0, ty - 8, W, 10); g.fillStyle = '#3a5a42'; g.fillRect(0, Hh - 14, W, 14);
      blotches(g, W, Hh, rnd, 12, '50,40,20', 0.22); speckle(g, W, Hh, rnd, 5000, 0.1);
    }
  });
}

// floors: 2 m x 2 m
function floorTexture(theme, variant, rnd) {
  const S = 512;
  return canvas(S, S, (g) => {
    if (theme === 'vampire') {
      g.fillStyle = '#1a0e08'; g.fillRect(0, 0, S, S);
      const base = variant ? 0x2e1b12 : 0x4d3020;
      const pw = 41;
      for (let p = 0; p * pw < S; p++) {
        let x = -rnd() * 200;
        while (x < S) {
          const len = 140 + rnd() * 200;
          g.save(); if (variant) { g.translate(0, 0); }
          const col = jitter(base, rnd, 0.16); g.fillStyle = col;
          if (variant) g.fillRect(p * pw + 1, x + 1, pw - 2, len - 2); else g.fillRect(x + 1, p * pw + 1, len - 2, pw - 2);
          g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
          for (let k = 0; k < 5; k++) { const o = 6 + rnd() * (pw - 12); g.beginPath(); if (variant) { g.moveTo(p * pw + o, x); g.lineTo(p * pw + o + (rnd() - 0.5) * 4, x + len); } else { g.moveTo(x, p * pw + o); g.lineTo(x + len, p * pw + o + (rnd() - 0.5) * 4); } g.stroke(); }
          g.restore(); x += len;
        }
      }
      blotches(g, S, S, rnd, 10, '0,0,0', 0.3);
    } else if (theme === 'pyramid') {
      g.fillStyle = '#5a4528'; g.fillRect(0, 0, S, S);
      const n = variant ? 4 : 2, sz = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        g.fillStyle = jitter(variant ? 0x9a7e50 : 0xb99b66, rnd, 0.1); g.fillRect(i * sz + 3, j * sz + 3, sz - 6, sz - 6);
        g.strokeStyle = 'rgba(40,25,5,0.5)'; g.lineWidth = 2; g.beginPath(); const x0 = i * sz + rnd() * sz, y0 = j * sz + 4; g.moveTo(x0, y0); g.lineTo(x0 + (rnd() - 0.5) * 40, y0 + sz * 0.5); g.stroke();
      }
      blotches(g, S, S, rnd, 16, '70,50,20', 0.25); speckle(g, S, S, rnd, 9000, 0.14);
    } else if (theme === 'vietnam') {
      const n = variant ? 4 : 5, sz = S / n;
      g.fillStyle = '#3a2418'; g.fillRect(0, 0, S, S);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        g.fillStyle = jitter(variant ? 0xa5603c : 0xb2562f, rnd, 0.1); g.fillRect(i * sz + 2, j * sz + 2, sz - 4, sz - 4);
        g.fillStyle = 'rgba(255,200,160,0.12)'; g.fillRect(i * sz + 2, j * sz + 2, sz - 4, 4);
      }
      blotches(g, S, S, rnd, 14, '40,25,10', 0.3); speckle(g, S, S, rnd, 7000, 0.14);
    } else if (theme === 'spacestation') {
      g.fillStyle = variant ? '#252b31' : '#3a424a'; g.fillRect(0, 0, S, S);
      if (!variant) {
        g.fillStyle = 'rgba(255,255,255,0.1)';
        for (let y = 0; y < S; y += 24) for (let x = 0; x < S; x += 24) { g.save(); g.translate(x + 12, y + 12); g.rotate(((x + y) / 24) % 2 ? 0.8 : -0.8); g.fillRect(-9, -2, 18, 4); g.restore(); }
      } else {
        g.fillStyle = '#0f1317'; for (let i = 0; i < S; i += 16) { g.fillRect(i, 0, 8, S); }
        g.fillStyle = 'rgba(70,200,230,0.5)'; g.fillRect(0, 0, S, 4); g.fillRect(0, 0, 4, S);
      }
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4; g.strokeRect(2, 2, S - 4, S - 4); g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
      speckle(g, S, S, rnd, 6000, 0.12);
    } else {
      const n = variant ? 10 : 5, sz = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const dark = (i + j) % 2;
        g.fillStyle = jitter(variant ? (dark ? 0xaab6ba : 0xb9c4c8) : (dark ? 0xa6b6a4 : 0xc9d3c5), rnd, 0.04); g.fillRect(i * sz, j * sz, sz, sz);
        g.strokeStyle = 'rgba(40,50,40,0.35)'; g.lineWidth = 2; g.strokeRect(i * sz, j * sz, sz, sz);
      }
      blotches(g, S, S, rnd, 22, '70,60,30', 0.25); speckle(g, S, S, rnd, 6000, 0.12);
    }
  });
}

function ceilTexture(theme, rnd) {
  const S = 256;
  const base = { vampire: 0x2d1b16, pyramid: 0x8f7448, vietnam: 0xc8b07a, spacestation: 0x4a5560, asylum: 0xd8ddd0 }[theme];
  return canvas(S, S, (g) => {
    g.fillStyle = shade(base, 1); g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 4;
    if (theme === 'vampire') { g.strokeRect(6, 6, S - 12, S - 12); g.strokeStyle = 'rgba(160,110,60,0.35)'; g.strokeRect(20, 20, S - 40, S - 40); }
    else if (theme === 'vietnam') { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; for (let y = 0; y < S; y += 64) g.strokeRect(0, y, S, 64); }
    else if (theme === 'asylum') { g.lineWidth = 2; for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 64) g.strokeRect(x, y, 64, 64); }
    else g.strokeRect(2, 2, S - 4, S - 4);
    blotches(g, S, S, rnd, 8, '0,0,0', 0.25); speckle(g, S, S, rnd, 2500, 0.12);
  });
}

function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ geometry batches
class Batch {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  vert(x, y, z, nx, ny, nz, u, v, col) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(col[0], col[1], col[2]); return this.v++; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // a,b,c,d are corners in order around the quad; the winding is flipped to face n
  quad(a, b, c, d, n, uv, col) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const pts = [a, b, c, d];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { pts.reverse(); uv = [uv[3], uv[2], uv[1], uv[0]]; }
    const ids = pts.map((q, k) => this.vert(q[0], q[1], q[2], n[0], n[1], n[2], uv[k][0], uv[k][1], col));
    this.tri(ids[0], ids[1], ids[2]); this.tri(ids[0], ids[2], ids[3]);
  }
  get empty() { return this.v === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const WHITE = [1, 1, 1];
const FACE = { top: 1, side: 0.86, side2: 0.78, bottom: 0.5 };

// axis-aligned box into a vertex-colored batch (uv unused)
function aabb(b, x0, y0, z0, x1, y1, z1, col) {
  const t = col.map((v) => v * FACE.top), s = col.map((v) => v * FACE.side), s2 = col.map((v) => v * FACE.side2), bo = col.map((v) => v * FACE.bottom);
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  b.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], uv, t);
  b.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uv, bo);
  b.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], uv, s);
  b.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], uv, s);
  b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uv, s2);
  b.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], uv, s2);
}
// box with chamfered edges (c m): 6 inset faces, 12 edge strips catching light, 8 corner triangles
function bevel(b, x0, y0, z0, x1, y1, z1, c, col) {
  c = Math.max(0.004, Math.min(c, (x1 - x0) / 3, (y1 - y0) / 3, (z1 - z0) / 3));
  const X0 = x0 + c, X1 = x1 - c, Y0 = y0 + c, Y1 = y1 - c, Z0 = z0 + c, Z1 = z1 - c, r = Math.SQRT1_2, q = 0.577;
  const t = col.map((v) => v * FACE.top), s = col.map((v) => v * FACE.side), s2 = col.map((v) => v * FACE.side2), bo = col.map((v) => v * FACE.bottom);
  const hi = col.map((v) => Math.min(1, v * 1.12));   // worn edges read a little lighter
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  b.quad([X0, y1, Z0], [X1, y1, Z0], [X1, y1, Z1], [X0, y1, Z1], [0, 1, 0], uv, t);
  b.quad([X0, y0, Z0], [X1, y0, Z0], [X1, y0, Z1], [X0, y0, Z1], [0, -1, 0], uv, bo);
  b.quad([x1, Y0, Z0], [x1, Y1, Z0], [x1, Y1, Z1], [x1, Y0, Z1], [1, 0, 0], uv, s);
  b.quad([x0, Y0, Z0], [x0, Y1, Z0], [x0, Y1, Z1], [x0, Y0, Z1], [-1, 0, 0], uv, s);
  b.quad([X0, Y0, z1], [X1, Y0, z1], [X1, Y1, z1], [X0, Y1, z1], [0, 0, 1], uv, s2);
  b.quad([X0, Y0, z0], [X1, Y0, z0], [X1, Y1, z0], [X0, Y1, z0], [0, 0, -1], uv, s2);
  for (const [yE, yI, sy] of [[y1, Y1, 1], [y0, Y0, -1]]) {   // top and bottom edges
    const k = sy > 0 ? hi : bo;
    b.quad([X1, yE, Z0], [x1, yI, Z0], [x1, yI, Z1], [X1, yE, Z1], [r, sy * r, 0], uv, k);
    b.quad([x0, yI, Z0], [X0, yE, Z0], [X0, yE, Z1], [x0, yI, Z1], [-r, sy * r, 0], uv, k);
    b.quad([X0, yE, Z1], [X1, yE, Z1], [X1, yI, z1], [X0, yI, z1], [0, sy * r, r], uv, k);
    b.quad([X0, yI, z0], [X1, yI, z0], [X1, yE, Z0], [X0, yE, Z0], [0, sy * r, -r], uv, k);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {   // corner triangles
      const a = [sx > 0 ? X1 : X0, yE, sz > 0 ? Z1 : Z0], bb = [sx > 0 ? x1 : x0, yI, sz > 0 ? Z1 : Z0], cc = [sx > 0 ? X1 : X0, yI, sz > 0 ? z1 : z0];
      const n = [sx * q, sy * q, sz * q], ids = [a, bb, cc].map((p) => b.vert(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0, k));
      const e1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
      const d = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
      if (d >= 0) b.tri(ids[0], ids[1], ids[2]); else b.tri(ids[0], ids[2], ids[1]);
    }
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {   // vertical edges
    const xa = sx > 0 ? X1 : X0, xb = sx > 0 ? x1 : x0, za = sz > 0 ? z1 : z0, zb = sz > 0 ? Z1 : Z0;
    b.quad([xa, Y0, za], [xb, Y0, zb], [xb, Y1, zb], [xa, Y1, za], [sx * r, 0, sz * r], uv, hi.map((v, i) => (v + s[i]) / 2));
  }
}
// lumpy rock: an ellipsoid pushed in and out by seeded noise, flat underside, moss on the up-facing part, darker cracks
function rock(b, cx, cy, cz, rx, ry, rz, col, rnd, moss = null, seg = 9, rings = 6) {
  const ids = [], ph = [rnd() * 9, rnd() * 9, rnd() * 9];
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI, row = [];
    for (let i = 0; i <= seg; i++) {
      const a = ((i % seg) / seg) * Math.PI * 2, nx = Math.sin(th) * Math.cos(a), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(a);
      const n1 = Math.sin(nx * 3.1 + ph[0]) * Math.sin(ny * 2.7 + ph[1]) * Math.sin(nz * 3.3 + ph[2]);
      const k = 1 + 0.32 * n1 + 0.12 * Math.sin(a * 5 + ph[0]) + 0.06 * Math.sin(th * 7 + ph[2]), facet = Math.round(k * 5) / 5;
      let y = cy + ny * ry * facet; if (y < cy - ry * 0.05) y = cy - ry * 0.05 + (y - cy + ry * 0.05) * 0.15;   // sits on the floor
      const crack = Math.abs(Math.sin(a * 3 + th * 4 + ph[1])) < 0.1 ? 0.4 : 1;
      let c = col.map((v) => v * (0.62 + 0.3 * (ny * 0.5 + 0.5)) * crack);
      if (moss && ny > 0.1) { const m = Math.min(1, (ny - 0.1) * 2.5) * (0.7 + 0.3 * Math.sin(a * 4 + ph[2])); c = c.map((v, q) => v * (1 - m) + moss[q] * m); }
      row.push(b.vert(cx + nx * rx * facet, y, cz + nz * rz * facet, nx, ny, nz, 0, 0, c));
    }
    ids.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { b.tri(ids[j][i], ids[j + 1][i + 1], ids[j + 1][i]); b.tri(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1]); }
}
function cylinder(b, cx, y0, cz, r0, r1, h, col, seg = 10, ry = 1) {
  const rings = [[y0, r0], [y0 + h, r1]];
  const slope = (r0 - r1) / h;
  const ids = rings.map(([y, r]) => { const row = []; for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); const l = Math.hypot(1, slope); row.push(b.vert(cx + cs * r, y, cz + sn * r, cs / l, slope / l, sn / l, i / seg, y, col)); } return row; });
  for (let i = 0; i < seg; i++) { b.tri(ids[0][i], ids[1][i], ids[1][i + 1]); b.tri(ids[0][i], ids[1][i + 1], ids[0][i + 1]); b.tri(ids[0][i], ids[1][i + 1], ids[1][i]); b.tri(ids[0][i], ids[0][i + 1], ids[1][i + 1]); }
  if (r1 > 0.001) { const c = b.vert(cx, y0 + h, cz, 0, 1, 0, 0, 0, col.map((v) => v * 1.05)); const ring = []; for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; ring.push(b.vert(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1, 0, 1, 0, 0, 0, col.map((v) => v * 1.05))); } for (let i = 0; i < seg; i++) b.tri(c, ring[i + 1], ring[i]); }
}
function ellipsoid(b, cx, cy, cz, rx, ry, rz, col, seg = 8, rings = 5) {
  const ids = [];
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI, row = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; const nx = Math.sin(th) * Math.cos(a), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(a); row.push(b.vert(cx + nx * rx, cy + ny * ry, cz + nz * rz, nx, ny, nz, 0, 0, col.map((v) => v * (0.75 + 0.3 * (ny * 0.5 + 0.5))))); }
    ids.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { b.tri(ids[j][i], ids[j + 1][i + 1], ids[j + 1][i]); b.tri(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1]); }
}

// frame-aware drawing: local (x right, z front) of one prop; rot in quarter turns
class Frame {
  constructor(b, cx, cz, q) { this.b = b; this.cx = cx; this.cz = cz; this.q = ((q % 4) + 4) % 4; const a = this.q * Math.PI / 2; this.cs = Math.round(Math.cos(a)); this.sn = Math.round(Math.sin(a)); }
  wx(lx, lz) { return this.cx + lx * this.cs + lz * this.sn; }
  wz(lx, lz) { return this.cz - lx * this.sn + lz * this.cs; }
  box(lx, y, lz, sx, sy, sz, col) {
    const odd = this.q & 1, w = odd ? sz : sx, d = odd ? sx : sz;
    const x = this.wx(lx, lz), z = this.wz(lx, lz);
    aabb(this.b, x - w / 2, y, z - d / 2, x + w / 2, y + sy, z + d / 2, col);
  }
  bev(lx, y, lz, sx, sy, sz, c, col) {
    const odd = this.q & 1, w = odd ? sz : sx, d = odd ? sx : sz;
    const x = this.wx(lx, lz), z = this.wz(lx, lz);
    bevel(this.b, x - w / 2, y, z - d / 2, x + w / 2, y + sy, z + d / 2, c, col);
  }
  rock(lx, y, lz, rx, ry, rz, col, rnd, moss) { const odd = this.q & 1; rock(this.b, this.wx(lx, lz), y, this.wz(lx, lz), odd ? rz : rx, ry, odd ? rx : rz, col, rnd, moss); }
  cyl(lx, y, lz, r0, r1, h, col, seg = 10) { cylinder(this.b, this.wx(lx, lz), y, this.wz(lx, lz), r0, r1, h, col, seg); }
  ell(lx, y, lz, rx, ry, rz, col, seg = 8, rings = 5) { const odd = this.q & 1; ellipsoid(this.b, this.wx(lx, lz), y, this.wz(lx, lz), odd ? rz : rx, ry, odd ? rx : rz, col, seg, rings); }
}

// ------------------------------------------------------------------ prop classification and furniture
const WALL_RE = /^(picture|framed_picture|mirror_|window|lamp_wall|torch_wall|clock_wall|poster|vent_wall|panel_wall|screen_wall|camera_security|alarm_button|phone_wall|sign_|wall_calendar|light_strip|light_tube|control_box_wall|radio_panel|conical_hats_wall|landscape_painting|utensil_rack|tube_light|decor_cobweb|ruin_wall|shelf_medicine|potion_shelf_wall|specimen_jar_plant)/;
const GROUND_RE = /^(grass|water_|water$|mud|pebble|straw|weed|reed|tall_grass|lily|lotus_pink_pads|stairs|temple_stairs|wooden_dock|bandage|pills|seedling|radish|crop|vegetable_bed|beet|carrot|corn|winnowing|rock_waterside_flat|water_hyacinth|mud_reed|hair_)/;
const RUG_RE = /(rug|carpet|mat_|^mat|stairs_red)/;
const RULES = [
  [/coffin|sarcophag|tomb_slab|cat_mummy_slab|slab/, 'coffin', 0.65],
  [/stasis|capsule|pod|teleporter|tube/, 'pod', 2.0],
  [/bed|bunk|gurney|hammock|bathtub/, 'bed', 0.6],
  [/sofa|^ofa_|armchair|bench|couch|chairs_/, 'sofa', 0.85],
  [/chair|hair_|stool|throne|wheelchair|seat|toilet|urinal/, 'chair', 0.9],
  [/fireplace/, 'fireplace', 1.5],
  [/lamp|candle|brazier|torch|lantern|light_post/, 'lamp', 1.4],
  [/pillar|column|obelisk|stone_post|wood_post|statue|pedestal|sphinx|jackal|anubis|bastet|thoth|gargoyle|gravestone|tombstone|ark_|mannequin|cape_stand/, 'statue', 1.9],
  [/plant|tree|palm|banana|bamboo|bush|grove|flower|bonsai|orchid|camellia|jackfruit|coconut|trellis|potted|monstera|planter|terrarium|pot_glowing|vase_.*(flowers|roses|lilies)|tall_grass|reed_clump/, 'plant', 1.0],
  [/^(car_|carriage|motorbike|rowboat|ox_cart|boat)/, 'vehicle', 1.3],
  [/tank|reactor/, 'tank', 2.0],
  [/server|locker|wardrobe|cabinet|shelf|rack|fridge|clock|display|case|cupboard|pantry|radiator|cooler|bookshelf|boxes_stacked/, 'cabinet', 1.9],
  [/jar|urn|amphora|pot_|pots_|vase|barrel|bucket|tub|canopic|bin|clay|water_barrel|kettle|drum/, 'jar', 0.8],
  [/chest|crate|box|trunk|hay|sack|logs|firewood|basket|mummy/, 'crate', 0.7],
  [/desk|counter|console|kiosk|cart|stove|kitchen|terminal|monitor|machine|ultrasound|sink|cockpit|control|stand|gadget|altar|tray|iv_|computer|restraint|radio|dresser|phone|toolbox|table_control|diagram/, 'desk', 0.9],
  [/table|bar_|nightstand/, 'table', 0.78],
  [/pond|water_/, 'water', 0.1],
  [/fence|rail/, 'fence', 0.9],
  [/rock|boulder|stone|well|ruin|brick|wall_block|fountain|stairs|dock|screen_divider|divider|mud/, 'rock', 0.8],
];
function classify(name, blocks) {
  const n = name.replace(/ \(\d+\)$/, '').toLowerCase();
  if (!blocks) {
    if (WALL_RE.test(n)) return { n, cat: 'wall', h: 0 };
    if (RUG_RE.test(n)) return { n, cat: 'rug', h: 0.025 };
    if (GROUND_RE.test(n)) return { n, cat: 'ground', h: 0.02 };
    return { n, cat: 'small', h: 0 };
  }
  for (const [re, cat, h] of RULES) if (re.test(n)) {
    let hh = h;
    if (cat === 'cabinet' && /low|cooler|fridge_narrow|boxes_stacked|pantry|radiator|rack_weapons|rack_restraint|drying/.test(n)) hh = /fridge|pantry/.test(n) ? 1.7 : 1.0;
    if (cat === 'statue' && /pillar|column/.test(n)) hh = /broken|toppled|cracked/.test(n) ? (/toppled/.test(n) ? 0.6 : 1.3) : H - 0.02;
    if (cat === 'statue' && /obelisk/.test(n)) hh = 2.4;
    if (cat === 'plant' && /tree|palm|banana|jackfruit|coconut|bamboo_clump|alien_tall|grove/.test(n)) hh = 2.4;
    if (cat === 'rock' && /boulder|ruin|brick|wall_block/.test(n)) hh = 1.1;
    if (cat === 'lamp' && /candle|brazier|oil_lamp/.test(n) && !/tall|stand/.test(n)) hh = 0.9;
    return { n, cat, h: hh };
  }
  return { n, cat: 'box', h: 1.0 };
}

const col = (hex, k = 1) => rgb(hex, k);
function dark(c, k) { return c.map((v) => v * k); }
function glowCol(hex) { return rgb(hex, 1); }

// builds the visible furniture for one prop. L = size along the local x axis, D = along local z, y up.
// per-theme furniture finish: trim colour (edges, handles, molding), moss for stones, metal bodies for the modern houses
const FINISH = {
  vampire: { trim: 0xb08a3a, moss: null, metalBody: false, book: [0x5a1418, 0x2a1a3a, 0x1f3a2a, 0x6a4a1a, 0x3a1010] },
  pyramid: { trim: 0xc8a050, moss: null, metalBody: false, book: [0xb89a60, 0x8a6a38, 0x5a3a20, 0xd8c08a, 0x3a5a6a] },
  vietnam: { trim: 0x6a4a28, moss: 0x2a4a16, metalBody: false, book: [0xa83a2a, 0x2a5a3a, 0xd8b04a, 0x3a3a5a, 0x7a2a1a] },
  spacestation: { trim: 0x9ab0c0, moss: null, metalBody: true, book: [0x3a5a7a, 0x2a2a30, 0x6a7a8a, 0xb84a2a, 0x2a6a6a] },
  asylum: { trim: 0x8a9a8a, moss: 0x4a5a3a, metalBody: true, book: [0x8a8a7a, 0x5a6a5a, 0x7a5a4a, 0xa8a898, 0x4a4a52] },
};
function furnish(F, G, cls, L, D, pal, rnd) {
  const { cat, n } = cls; const hh = cls.h;
  const fin = FINISH[pal.theme] || FINISH.vampire, trim = col(fin.trim, 0.9 + rnd() * 0.2);
  const wood = col(pal.wood, 0.85 + rnd() * 0.3), wood2 = col(pal.wood2, 0.85 + rnd() * 0.3), fab = col(pal.fabric, 0.85 + rnd() * 0.3);
  const metal = col(pal.metal), stone = col(pal.stone, 0.85 + rnd() * 0.3), fab2 = col(pal.fabric2);
  const glowBlue = glowCol(0x60d0ff), glowGreen = glowCol(0x60ff90), glowOrange = glowCol(0xff9a40);
  const m = Math.min(L, D);
  switch (cat) {
    case 'table': case 'desk': {
      const monitor = /monitor|screen|console|terminal|computer|hologram|kiosk|cockpit|ultrasound/.test(n);
      if (cat === 'table') {
        F.bev(0, hh - 0.07, 0, L - 0.04, 0.07, D - 0.04, 0.025, wood2);
        F.bev(0, hh - 0.09, 0, L - 0.12, 0.03, D - 0.12, 0.01, dark(wood2, 0.75));
        const lx = L / 2 - 0.12, lz = D / 2 - 0.12;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { F.cyl(sx * lx, 0, sz * lz, 0.03, 0.045, hh - 0.09, wood, 8); F.cyl(sx * lx, hh * 0.35, sz * lz, 0.05, 0.05, 0.06, dark(wood, 0.8), 8); }
        F.bev(0, hh - 0.2, 0, L - 0.26, 0.11, D - 0.26, 0.012, dark(wood, 0.72));
        F.box(0, hh - 0.16, D / 2 - 0.13, L - 0.4, 0.02, 0.012, trim);
        if (/tea|candle|stone_tools|pottery|canopic|scroll|tablets|ankh/.test(n)) for (let i = 0; i < Math.min(4, Math.floor(L)); i++) F.cyl(-L / 2 + 0.35 + i * 0.4 + rnd() * 0.1, hh, (rnd() - 0.5) * (D - 0.5), 0.06, 0.05, 0.1, col(0xe8e0d0), 8);
      } else {
        const bodyD = fin.metalBody ? col(pal.metal, 0.75) : dark(wood, 0.8);
        F.bev(0, 0.05, 0, L - 0.12, hh - 0.1, D - 0.12, 0.02, bodyD);
        F.bev(0, hh - 0.06, 0, L, 0.06, D, 0.02, fin.metalBody ? col(pal.metal, 0.95) : wood2);
        F.box(0, 0, 0, L - 0.16, 0.05, D - 0.16, dark(bodyD, 0.5));
        const drawers = Math.max(1, Math.round(L / 0.8));
        for (let i = 0; i < drawers; i++) for (const yy of [hh * 0.62, hh * 0.32]) {
          const x = -L / 2 + (i + 0.5) * (L / drawers);
          F.bev(x, yy, D / 2 - 0.07, L / drawers - 0.1, 0.22, 0.03, 0.008, dark(bodyD, 1.18));
          F.box(x, yy + 0.09, D / 2 - 0.035, 0.14, 0.025, 0.025, trim);
        }
      }
      if (monitor) {
        const k = Math.max(1, Math.min(3, Math.floor(L / 1.2)));
        for (let i = 0; i < k; i++) { const x = -L / 2 + (i + 0.5) * (L / k); F.box(x, hh, -D * 0.2, Math.min(0.8, L / k - 0.1), 0.45, 0.05, [0.05, 0.06, 0.07]); F.box(x, hh + 0.04, -D * 0.2 + 0.03, Math.min(0.72, L / k - 0.18), 0.37, 0.01, glowBlue.map((v) => v * 0.9)); }
      }
      break;
    }
    case 'chair': {
      const s = Math.min(0.5, m - 0.1);
      if (/stool|round/.test(n)) { F.cyl(0, 0, 0, s * 0.45, s * 0.4, 0.46, fab, 10); F.cyl(0, 0.46, 0, s * 0.5, s * 0.5, 0.06, wood2, 10); break; }
      const th = /throne/.test(n);
      F.box(0, 0.42, 0, s, 0.07, s, th ? fab : wood2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(sx * (s / 2 - 0.04), 0, sz * (s / 2 - 0.04), 0.05, 0.42, 0.05, wood);
      F.box(0, 0.49, -s / 2 + 0.04, s, th ? 1.2 : 0.5, 0.07, th ? dark(fab, 0.9) : wood);
      if (th) { F.box(0, 1.55, -s / 2 + 0.04, s * 1.2, 0.3, 0.08, metal); for (const sx of [-1, 1]) F.box(sx * s / 2, 0.5, 0, 0.06, 0.25, s, wood); }
      break;
    }
    case 'sofa': {
      const long = L, dep = Math.min(D, 1.0);
      F.box(0, 0.05, 0, long, 0.38, dep, dark(fab, 0.8));
      const nseat = Math.max(1, Math.round(long / 0.9));
      for (let i = 0; i < nseat; i++) F.box(-long / 2 + (i + 0.5) * (long / nseat), 0.43, dep * 0.08, long / nseat - 0.06, 0.14, dep * 0.78, fab);
      F.box(0, 0.4, -dep / 2 + 0.11, long, 0.5, 0.22, dark(fab, 0.9));
      for (const sx of [-1, 1]) F.box(sx * (long / 2 - 0.09), 0.3, 0, 0.18, 0.35, dep, dark(fab, 0.75));
      break;
    }
    case 'bed': {
      const long = Math.max(L, D) === L ? L : L, dep = D;
      F.box(0, 0.12, 0, L, 0.2, D, dark(wood, 0.8));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(sx * (L / 2 - 0.06), 0, sz * (D / 2 - 0.06), 0.1, 0.14, 0.1, wood);
      F.box(0, 0.32, 0, L - 0.06, 0.2, D - 0.06, /dirty|restraint|worn/.test(n) ? col(0x8a8576) : fab2);
      F.box(-L / 2 + 0.28, 0.5, 0, 0.45, 0.1, Math.min(0.9, D - 0.2), col(0xe4e0d4));
      F.box(L / 2 - 0.05, 0.12, 0, 0.1, 0.6, D, wood);
      if (/restraint/.test(n)) for (const sz of [-0.3, 0.3]) F.box(0, 0.5, sz * D / 2, L * 0.7, 0.03, 0.06, dark(metal, 0.5));
      break;
    }
    case 'coffin': {
      F.box(0, 0, 0, L - 0.1, hh - 0.1, D - 0.1, dark(stone.map((v, i) => v * [1, 0.9, 0.85][i]), 0.9));
      F.box(0, hh - 0.1, 0, L - 0.16, 0.1, D - 0.16, wood2);
      F.box(0, hh, 0, L * 0.6, 0.04, D * 0.35, metal);
      if (/open/.test(n)) F.box(0, hh - 0.08, 0, L * 0.5, 0.08, D * 0.5, col(0x2a1a10));
      break;
    }
    case 'pod': {
      const r = Math.max(0.3, Math.min(m, 1.6) / 2 - 0.1);
      F.cyl(0, 0, 0, r + 0.12, r + 0.12, 0.2, dark(col(pal.metal), 0.6), 14);
      F.cyl(0, 0.2, 0, r, r, hh - 0.5, glowBlue.map((v) => v * 0.28), 14);
      F.cyl(0, hh - 0.3, 0, r + 0.12, r + 0.12, 0.3, dark(col(pal.metal), 0.6), 14);
      F.cyl(0, 0.3, 0, r * 0.35, r * 0.35, hh - 0.9, glowGreen.map((v) => v * 0.5), 8);
      break;
    }
    case 'tank': {
      const r = Math.max(0.4, m / 2 - 0.08);
      F.cyl(0, 0, 0, r + 0.08, r + 0.08, 0.25, dark(metal, 0.5), 14);
      F.cyl(0, 0.25, 0, r, r, hh - 0.55, (/slime|alien|purple/.test(n) ? glowGreen : glowBlue).map((v) => v * 0.45), 14);
      F.cyl(0, hh - 0.3, 0, r + 0.08, r + 0.08, 0.3, dark(metal, 0.5), 14);
      break;
    }
    case 'cabinet': {
      const books = /book|shelf|rack|display|case|pantry|cupboard|potion/.test(n) && !/locker|fridge|wardrobe|server|clock/.test(n);
      const glass = /display|showcase|glass|vitrine/.test(n) || (/case/.test(n) && !/book/.test(n));   // 'bookcase' is books, not glass
      if (/server/.test(n)) {
        F.box(0, 0, 0, L - 0.04, hh, D - 0.04, [0.07, 0.08, 0.1]);
        for (let y = 0.2; y < hh - 0.2; y += 0.22) for (let x = -L / 2 + 0.2; x < L / 2 - 0.15; x += 0.3) F.box(x, y, D / 2 - 0.03, 0.14, 0.05, 0.02, rnd() < 0.5 ? glowGreen : glowBlue);
      } else if (/clock/.test(n)) {
        F.box(0, 0, 0, Math.min(L, 0.7), hh, Math.min(D, 0.5), wood); F.cyl(0, 1.5, Math.min(D, 0.5) / 2 - 0.0, 0.2, 0.2, 0.02, col(0xe8e4d0), 14);
      } else if (books) {
        const bodyB = fin.metalBody ? col(pal.metal, 0.7) : wood;
        const deep = D > 0.9;   // a 2-cell-deep case stands in the room: two-faced, divider in the middle
        F.box(0, 0, deep ? 0 : -D / 2 + 0.03, L, hh, 0.06, dark(bodyB, 0.6));
        for (const sx of [-1, 1]) F.bev(sx * (L / 2 - 0.035), 0, 0, 0.07, hh, D, 0.015, bodyB);
        F.bev(0, hh - 0.02, 0.01, L + 0.08, 0.09, D + 0.06, 0.025, dark(bodyB, 1.1));   // crown molding
        F.box(0, hh - 0.05, D / 2 + 0.02, L - 0.1, 0.025, 0.02, trim);
        F.bev(0, 0, 0.01, L + 0.02, 0.1, D + 0.03, 0.015, dark(bodyB, 0.7));          // plinth
        const sh = Math.max(3, Math.round(hh / 0.4));
        for (let s = 0; s <= sh; s++) {
          const y = Math.min(hh - 0.04, 0.1 + s * ((hh - 0.14) / sh)); F.bev(0, y, 0, L - 0.08, 0.045, D, 0.01, fin.metalBody ? col(pal.metal, 0.9) : wood2);
          if (s < sh && glass) for (let i = 0; i < 2; i++) {   // a display case shows a curio or two per shelf
            const x = (i ? 0.25 : -0.25) * (L - 0.3), c1 = col([pal.metal, 0xe8e0d0, pal.glass, fin.trim][(rnd() * 4) | 0], 0.8 + rnd() * 0.4);
            if (rnd() < 0.5) { F.cyl(x, y + 0.05, 0, 0.06, 0.03, 0.18 + rnd() * 0.08, c1, 10); F.ell(x, y + 0.27, 0, 0.05, 0.03, 0.05, c1, 8, 4); }
            else { F.bev(x, y + 0.05, 0, 0.08, 0.04, 0.08, 0.01, dark(c1, 0.6)); F.ell(x, y + 0.16, 0, 0.06, 0.08, 0.04, c1, 8, 5); }
          }
          if (s < sh && !glass) {
            let x = -L / 2 + 0.1, lean = 0;
            const faces = deep ? [1, -1] : [1];
            for (const side of faces) { x = -L / 2 + 0.1; lean = 0;
            while (x < L / 2 - 0.16) {
              const bw = 0.045 + rnd() * 0.07, bh = Math.min((hh - 0.14) / sh - 0.07, 0.2 + rnd() * 0.14), c0 = col(fin.book[(rnd() * fin.book.length) | 0], 0.75 + rnd() * 0.4);
              if (rnd() < 0.1) { x += bw; continue; }   // a gap
              const tall = lean > 0 ? bh * 0.92 : bh;
              const zc = side * (D / 2 - 0.2), zs = side * (D / 2 - 0.079);   // books stand at the open face, spines out
              F.bev(x + bw / 2, y + 0.045, zc, bw - 0.006, tall, 0.24, 0.006, c0);
              F.box(x + bw / 2, y + 0.045 + tall * 0.18, zs, bw - 0.012, 0.012, 0.004, c0.map((v) => Math.min(1, v * 1.7)));   // spine bands
              F.box(x + bw / 2, y + 0.045 + tall * 0.78, zs, bw - 0.012, 0.012, 0.004, c0.map((v) => Math.min(1, v * 1.7)));
              x += bw; lean = rnd() < 0.08 ? 1 : 0;
            }
            }
          }
        }
        if (glass) { F.box(0, 0.12, D / 2 - 0.02, L - 0.14, hh - 0.2, 0.012, glowBlue.map((v) => v * 0.12)); for (const sx of [-1, 0, 1]) F.box(sx * (L / 2 - 0.08) * (sx ? 1 : 0), 0.1, D / 2 - 0.01, 0.03, hh - 0.16, 0.02, trim); F.cyl(0, 1.0, 0, 0.1, 0.1, 0.3, metal, 8); }
      } else {
        const bodyC = /locker|fridge|server/.test(n) || fin.metalBody ? col(pal.metal, 0.7) : wood;
        F.bev(0, 0.08, 0, L - 0.02, hh - 0.08, D - 0.02, 0.025, bodyC);
        F.bev(0, hh, 0, L + 0.06, 0.07, D + 0.05, 0.02, dark(bodyC, 1.2));   // cornice
        F.bev(0, 0, 0, L + 0.02, 0.09, D + 0.01, 0.015, dark(bodyC, 0.6));   // plinth
        const dn = Math.max(1, Math.round(L / 0.7));
        for (let i = 0; i < dn; i++) {
          const x = -L / 2 + (i + 0.5) * (L / dn), dw = L / dn - 0.06;
          F.box(x - L / dn / 2 + 0.01, 0.1, D / 2 - 0.0, 0.015, hh - 0.14, 0.025, dark(bodyC, 0.45));
          for (const [y0, y1] of [[0.18, hh * 0.45], [hh * 0.5, hh - 0.1]]) F.bev(x, y0, D / 2 - 0.005, dw - 0.12, y1 - y0, 0.03, 0.012, dark(bodyC, 1.12));   // raised panels
          if (/locker/.test(n)) for (let v = 0; v < 4; v++) F.box(x, hh - 0.35 - v * 0.05, D / 2 + 0.03, dw * 0.5, 0.012, 0.01, dark(bodyC, 0.4));   // vents
          F.box(x + dw / 2 - 0.08, hh * 0.47, D / 2 + 0.03, 0.03, 0.18, 0.035, trim);
        }
      }
      break;
    }
    case 'crate': {
      const hhh = Math.min(hh, 0.8);
      const c = /gold|hieroglyph/.test(n) ? col(pal.wood2, 0.9) : wood2;
      F.box(0, 0, 0, L - 0.04, hhh, D - 0.04, c);
      F.box(0, hhh * 0.45, 0, L - 0.0, 0.06, D + 0.0, dark(c, 0.55)); F.box(0, 0, 0, L - 0.0, 0.07, D, dark(c, 0.55));
      F.box(0, hhh - 0.01, 0, L - 0.0, 0.07, D, dark(c, 0.8));
      if (/gold|chest/.test(n)) F.box(0, hhh * 0.5, D / 2 - 0.01, 0.1, 0.12, 0.05, metal);
      break;
    }
    case 'jar': {
      const cnt = Math.max(1, Math.round(L * D / 1.2)); const r = Math.min(0.32, m / 2 - 0.05);
      for (let i = 0; i < Math.min(cnt, 4); i++) {
        const lx = cnt === 1 ? 0 : (i % 2 ? 0.25 : -0.25) * (L > 1 ? 1.4 : 0.5), lz = cnt === 1 ? 0 : (i < 2 ? -0.18 : 0.2) * (D > 1 ? 1.2 : 0.5);
        const c = /canopic|gold/.test(n) ? col(pal.metal, 0.9) : /blue/.test(n) ? col(0x3a60a0) : col(pal.wood2, 0.8);
        F.cyl(lx, 0, lz, r * 0.7, r * 0.7, 0.04, c, 10); F.ell(lx, hh * 0.45, lz, r, hh * 0.45, r, c, 10, 6); F.cyl(lx, hh * 0.85, lz, r * 0.5, r * 0.6, 0.12, dark(c, 0.8), 10);
      }
      break;
    }
    case 'statue': {
      if (/pillar|column|post|obelisk|stone_post/.test(n)) {
        const r = Math.max(0.2, m / 2 - 0.12);
        if (/toppled/.test(n)) { F.box(0, 0, 0, L - 0.1, 0.5, Math.min(D, 1) - 0.1, stone); break; }
        F.box(0, 0, 0, r * 2 + 0.2, 0.2, r * 2 + 0.2, dark(stone, 0.8));
        F.cyl(0, 0.2, 0, r, /obelisk/.test(n) ? r * 0.35 : r * 0.92, hh - 0.35, stone, 10);
        if (!/broken|obelisk/.test(n)) F.box(0, hh - 0.16, 0, r * 2 + 0.2, 0.16, r * 2 + 0.2, dark(stone, 0.9));
        if (/lotus|painted/.test(n)) F.cyl(0, hh * 0.55, 0, r * 1.03, r * 1.03, 0.18, col(0x2a8a9a), 10);
      } else if (/pedestal|stand/.test(n)) {
        F.box(0, 0, 0, Math.min(L, 0.8), 1.0, Math.min(D, 0.8), stone); F.box(0, 1.0, 0, Math.min(L, 0.8) + 0.08, 0.06, Math.min(D, 0.8) + 0.08, dark(stone, 1.1));
        F.ell(0, 1.28, 0, 0.18, 0.22, 0.18, /gold/.test(n) ? metal : col(0xe0d8c8), 8, 5);
      } else if (/sphinx|jackal|bastet|lying|gargoyle_wide|chest/.test(n)) {
        F.box(0, 0, 0, L - 0.2, 0.55, Math.min(D, 1.2) - 0.2, stone); F.ell(L / 2 - 0.45, 0.55, 0, 0.3, 0.38, 0.28, stone, 8, 5);
        F.box(L / 2 - 0.1, 0.55, 0, 0.2, 0.05, 0.4, metal);
      } else {
        F.box(0, 0, 0, Math.min(L, 1) - 0.1, 0.35, Math.min(D, 1) - 0.1, dark(stone, 0.85));
        F.cyl(0, 0.35, 0, 0.26, 0.2, 1.0, stone, 8); F.ell(0, 1.4, 0, 0.2, 0.24, 0.2, stone, 8, 5);
        F.box(0, 1.1, 0.0, 0.8, 0.12, 0.14, stone);
        if (/gargoyle/.test(n)) { F.box(-0.35, 1.35, -0.05, 0.3, 0.05, 0.4, stone); F.box(0.35, 1.35, -0.05, 0.3, 0.05, 0.4, stone); }
        if (/jackal|anubis/.test(n)) { F.box(-0.08, 1.55, 0, 0.05, 0.3, 0.05, stone); F.box(0.08, 1.55, 0, 0.05, 0.3, 0.05, stone); }
      }
      break;
    }
    case 'plant': {
      const cells = Math.max(1, Math.round(L * D)); const tall = hh > 1.5;
      const cx = Math.max(1, Math.round(L)), cz = Math.max(1, Math.round(D));
      for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) {
        const lx = -L / 2 + (i + 0.5) * (L / cx), lz = -D / 2 + (j + 0.5) * (D / cz);
        const g1 = col(pal.plant, 0.8 + rnd() * 0.4), g2 = col(rnd() < 0.5 ? pal.plant : pal.plant2, 0.8 + rnd() * 0.4);
        if (tall) { F.cyl(lx, 0, lz, 0.1, 0.07, 1.5, col(0x5a3a22), 6); F.ell(lx, 1.8, lz, 0.55, 0.45, 0.55, g1, 8, 5); F.ell(lx + 0.2, 1.55, lz - 0.1, 0.4, 0.3, 0.4, g2, 8, 5); }
        else { F.cyl(lx, 0, lz, 0.17, 0.12, 0.3, col(/terracotta|clay/.test(n) ? 0xa05a3a : pal.wood2, 0.9), 8); F.ell(lx, 0.55, lz, 0.28, 0.28, 0.28, g1, 7, 4); F.ell(lx + 0.08, 0.78, lz, 0.2, 0.2, 0.2, g2, 7, 4); if (/flower|rose|lilies|orchid|vase/.test(n)) F.ell(lx, 0.85, lz, 0.1, 0.1, 0.1, col(rnd() < 0.5 ? 0xd04060 : 0xe0d060), 5, 3); }
      }
      break;
    }
    case 'lamp': {
      const brazier = /brazier/.test(n), candle = /candle/.test(n);
      if (brazier) { F.cyl(0, 0, 0, 0.18, 0.12, 0.6, dark(metal, 0.5), 8); F.cyl(0, 0.6, 0, 0.3, 0.2, 0.2, dark(metal, 0.45), 10); F.ell(0, 0.82, 0, 0.2, 0.25, 0.2, /green/.test(n) ? glowGreen : glowOrange, 6, 4); }
      else if (candle) { F.cyl(0, 0, 0, 0.12, 0.05, 0.8, metal, 8); F.cyl(0, 0.8, 0, 0.06, 0.06, 0.08, col(0xf0e8d0), 6); F.ell(0, 0.92, 0, 0.03, 0.06, 0.03, glowOrange, 5, 3); }
      else { F.cyl(0, 0, 0, 0.22, 0.2, 0.05, dark(metal, 0.5), 10); F.cyl(0, 0.05, 0, 0.03, 0.03, hh - 0.35, dark(metal, 0.5), 6); F.cyl(0, hh - 0.35, 0, 0.12, 0.2, 0.3, (/blue|space/.test(n) ? glowBlue : /green/.test(n) ? glowGreen : glowOrange).map((v) => v * 0.9), 10); }
      break;
    }
    case 'fireplace': {
      F.box(0, 0, 0, L, 1.4, Math.min(D, 1.0), stone); F.box(0, 1.4, 0, L + 0.2, 0.12, Math.min(D, 1.0) + 0.12, dark(stone, 1.15));
      F.box(0, 0.1, Math.min(D, 1.0) / 2 + 0.005, L * 0.5, 0.8, 0.02, [0.02, 0.01, 0.01]);
      F.box(0, 0.1, Math.min(D, 1.0) / 2 + 0.01, L * 0.3, 0.3, 0.02, glowOrange);
      break;
    }
    case 'vehicle': {
      const long = L >= D ? L : D;
      F.box(0, 0.25, 0, L - 0.1, 0.55, D - 0.1, /red/.test(n) ? col(0x8a1a1a) : /gold/.test(n) ? col(pal.metal, 0.8) : col(pal.wood, 1.1));
      F.box(0, 0.8, -0.1, L * 0.55, 0.5, D - 0.3, dark(col(pal.glass), 0.5));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.cyl(sx * (L / 2 - 0.4), 0.1, sz * (D / 2 - 0.05), 0.28, 0.28, 0.12, [0.05, 0.05, 0.05], 10);
      break;
    }
    case 'water': { F.box(0, 0, 0, L, 0.08, D, [0.04, 0.2, 0.28]); break; }
    case 'fence': {
      const long = L >= D; const len = long ? L : D;
      F.box(0, 0.5, 0, long ? L : 0.07, 0.07, long ? 0.07 : D, wood2); F.box(0, 0.8, 0, long ? L : 0.07, 0.07, long ? 0.07 : D, wood2);
      for (let i = 0; i <= Math.round(len); i++) { const o = -len / 2 + i * (len / Math.max(1, Math.round(len))); F.box(long ? o : 0, 0, long ? 0 : o, 0.09, hh, 0.09, wood); }
      break;
    }
    case 'rock': {
      const cnt = Math.max(1, Math.round(L * D / 2));
      if (/well/.test(n)) { F.cyl(0, 0, 0, Math.min(m / 2 - 0.1, 0.8), Math.min(m / 2 - 0.1, 0.8), 0.7, stone, 12); F.box(0, 0.7, 0, 0.1, 1.1, 0.1, wood); break; }
      if (/brick|ruin|wall_block|dock|divider/.test(n)) {
        const rows = Math.max(2, Math.round(hh / 0.25));
        for (let r = 0; r < rows; r++) { const y = r * hh / rows, off = r & 1 ? 0.2 : 0; let x = -L / 2 + 0.02 - off; while (x < L / 2 - 0.05) { const w = Math.min(0.42 + rnd() * 0.12, L / 2 - 0.02 - x); if (w > 0.06) F.bev(Math.max(x, -L / 2 + 0.02) + w / 2, y, 0, w - 0.02, hh / rows - 0.02, D - 0.04, 0.02, dark(stone, 0.8 + rnd() * 0.35)); x += w; } }
        break;
      }
      const moss = fin.moss ? col(fin.moss) : null;
      for (let i = 0; i < Math.min(cnt + 1, 5); i++) F.rock((rnd() - 0.5) * (L - 0.8), 0, (rnd() - 0.5) * (D - 0.8), 0.4 + rnd() * 0.3, hh * (0.5 + rnd() * 0.5), 0.4 + rnd() * 0.3, dark(stone, 0.8 + rnd() * 0.3), rnd, moss);
      break;
    }
    default: {
      F.box(0, 0, 0, L - 0.06, Math.min(hh, 1.0), D - 0.06, /locker|metal|crate/.test(n) ? col(pal.metal, 0.6) : wood);
      F.box(0, Math.min(hh, 1.0) - 0.02, 0, L - 0.0, 0.05, D - 0.0, dark(wood, 1.2));
    }
  }
}

// small non-blocking items (on the floor or on top of a table)
function smallItem(F, G, n, y, pal, rnd) {
  const gold = col(pal.metal, 1.1);
  if (/gold|coin|treasure|nugget|gem|scarab|goblet/.test(n)) { F.ell(0, y, 0, 0.16 + rnd() * 0.1, 0.07, 0.14, gold, 7, 3); F.ell(0.1, y, 0.06, 0.08, 0.05, 0.08, col(0xf4d060), 6, 3); return 0.1; }
  if (/skull|bone|skeleton|head|hand/.test(n)) { F.ell(0, y + 0.1, 0, 0.1, 0.1, 0.1, col(0xe6e0cc), 7, 4); F.box(0.2, y, 0.05, 0.3, 0.04, 0.05, col(0xd8d0b8)); return 0.2; }
  if (/potion|flask|jar|specimen|vase/.test(n)) { F.cyl(0, y, 0, 0.07, 0.07, 0.16, glowCol(/blood|red/.test(n) ? 0xc02030 : 0x50d0a0).map((v) => v * 0.7), 8); F.cyl(0, y + 0.16, 0, 0.03, 0.03, 0.06, col(0xd0d0d0), 6); return 0.22; }
  if (/book|scroll|papyrus|paper|record/.test(n)) { for (let i = 0; i < 3; i++) F.box((i - 1) * 0.08, y, 0, 0.07, 0.2 - i * 0.03, 0.16, rgb([pal.fabric, pal.fabric2, pal.wood2][i], 0.9)); return 0.2; }
  if (/lamp|candle|lantern|light/.test(n)) { F.cyl(0, y, 0, 0.05, 0.05, 0.25, dark(gold, 0.6), 6); F.ell(0, y + 0.3, 0, 0.07, 0.09, 0.07, glowCol(0xffa040), 6, 3); return 0.4; }
  if (/plate|tray|tea|wine|drink|cup|banh|fruit|food/.test(n)) { F.cyl(0, y, 0, 0.16, 0.14, 0.03, col(0xe0dccc), 10); F.cyl(0.0, y + 0.03, 0, 0.06, 0.05, 0.08, col(pal.fabric, 1), 7); return 0.1; }
  if (/plant|sprout|grass|leaf|flower|bonsai|lotus|seedling/.test(n)) { F.cyl(0, y, 0, 0.1, 0.07, 0.14, col(pal.wood2), 7); F.ell(0, y + 0.22, 0, 0.14, 0.12, 0.14, col(pal.plant), 6, 3); return 0.3; }
  F.box(0, y, 0, 0.22, 0.14, 0.18, col(pal.wood2, 0.9)); F.box(0.02, y + 0.14, 0, 0.14, 0.03, 0.1, col(pal.fabric2, 0.9));
  return 0.18;
}

// things on a wall; local origin = the wall surface point, +z points into the room
function wallThing(F, n, pal, rnd, theme, y0) {
  const gold = col(pal.metal);
  if (/picture|painting|poster|calendar|mugshot/.test(n)) {
    const pw = 0.6 + rnd() * 0.3, ph = 0.75 + rnd() * 0.3;
    F.box(0, 1.35, 0.03, pw + 0.12, ph + 0.12, 0.06, dark(gold, 0.55)); F.box(0, 1.41, 0.065, pw, ph, 0.02, rgb([0x3a2a20, 0x28323a, 0x4a3a2a, 0x2a2a2a, 0x40403a][Math.floor(rnd() * 5)], 1));
    F.ell(0, 1.62, 0.085, 0.14, 0.17, 0.02, col(0xc8a888, 0.6), 6, 4);
  } else if (/mirror/.test(n)) { F.box(0, 1.2, 0.03, 0.7, 1.1, 0.06, dark(gold, 0.6)); F.box(0, 1.26, 0.065, 0.58, 0.98, 0.02, col(0x9fb4c4, 1.0)); }
  else if (/window/.test(n)) {
    const sp = theme === 'spacestation', c = sp ? [0.02, 0.03, 0.12] : theme === 'pyramid' ? glowCol(0xfff0c0).map((v) => v * 0.8) : [0.35, 0.45, 0.6];
    F.box(0, 1.1, 0.02, 1.4, 1.1, 0.06, dark(col(pal.stone), 0.7)); F.box(0, 1.17, 0.055, 1.2, 0.96, 0.02, c);
    if (sp) for (let i = 0; i < 14; i++) F.box((rnd() - 0.5) * 1.1, 1.2 + rnd() * 0.85, 0.07, 0.025, 0.025, 0.01, [0.9, 0.9, 1]);
    F.box(0, 1.17, 0.07, 0.04, 0.96, 0.02, dark(col(pal.stone), 0.7)); F.box(0, 1.6, 0.07, 1.2, 0.04, 0.02, dark(col(pal.stone), 0.7));
  } else if (/sconce|torch|lamp_wall|lantern|tube_light|light_tube|light_strip/.test(n)) {
    const fc = /blue|space/.test(n) ? glowCol(0x70c8ff) : /green/.test(n) ? glowCol(0x70ff98) : /tube|strip|caged/.test(n) ? glowCol(theme === 'asylum' ? 0xe8fff0 : 0xbfe8ff) : glowCol(0xffa04a);
    if (/tube|strip|caged|light_tube|light_strip/.test(n)) { F.box(0, 2.1, 0.05, 1.0, 0.07, 0.07, fc); F.box(0, 2.05, 0.02, 1.08, 0.04, 0.04, dark(gold, 0.4)); }
    else { F.box(0, 1.7, 0.04, 0.08, 0.25, 0.08, dark(gold, 0.5)); F.box(0, 1.9, 0.12, 0.05, 0.05, 0.2, dark(gold, 0.5)); F.ell(0, 2.0, 0.2, 0.07, 0.12, 0.07, fc, 6, 4); }
  } else if (/clock/.test(n)) { F.box(0, 1.9, 0.03, 0.42, 0.42, 0.05, col(0xe8e4d0)); F.box(0, 2.1, 0.06, 0.02, 0.14, 0.01, [0, 0, 0]); }
  else if (/screen|panel/.test(n)) { F.box(0, 1.0, 0.03, 1.1, 0.8, 0.06, [0.06, 0.07, 0.09]); F.box(0, 1.05, 0.065, 0.95, 0.65, 0.01, glowCol(rnd() < 0.5 ? 0x2a90c0 : 0x30c080).map((v) => v * 0.7)); }
  else if (/vent/.test(n)) { F.box(0, 0.5, 0.02, 0.8, 0.5, 0.04, dark(col(pal.metal), 0.4)); for (let i = 0; i < 5; i++) F.box(0, 0.32 + i * 0.09, 0.045, 0.7, 0.03, 0.02, [0.02, 0.02, 0.02]); }
  else if (/sign|alarm|camera|phone|radio|control/.test(n)) { F.box(0, 1.8, 0.04, 0.5, 0.3, 0.06, /exit/.test(n) ? glowCol(0x30e070).map((v) => v * 0.8) : dark(col(pal.metal), 0.45)); }
  else if (/cobweb/.test(n)) { F.box(0, 2.3, 0.01, 0.5, 0.4, 0.01, [0.75, 0.75, 0.75]); }
  else { F.box(0, 1.3, 0.03, 0.6, 0.5, 0.06, dark(col(pal.wood), 0.9)); }
}

// ------------------------------------------------------------------ grid helpers
function mergeRects(w, h, keyAt) {
  const used = new Uint8Array(w * h), out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (used[i]) continue;
    const k = keyAt(x, y); if (k < 0) continue;
    let x1 = x + 1; while (x1 < w && !used[y * w + x1] && keyAt(x1, y) === k) x1++;
    let y1 = y + 1;
    grow: while (y1 < h) { for (let xx = x; xx < x1; xx++) if (used[y1 * w + xx] || keyAt(xx, y1) !== k) break grow; y1++; }
    for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) used[yy * w + xx] = 1;
    out.push({ x, y, w: x1 - x, h: y1 - y, k });
  }
  return out;
}

// ------------------------------------------------------------------ main
export function buildHouse(G, layout, theme) {
  const t0 = performance.now();
  const { scene, phys, renderer } = G;
  const T = THEMES[theme] || THEMES.vampire;
  const bright0 = { vampire: 1, pyramid: 0.5, vietnam: 0.55, spacestation: 1, asylum: 0.8 }[theme] ?? 1;
  // night grade per theme (tools/look.js gates the frame mean 30-55 with the torch brightest): ambient fill and lamp
  // multipliers; the service station keeps its shop lighting
  const station = layout.rooms?.[0]?.template === 'station';
  const NIGHT = { vampire: { hemi: 6, lamp: 2.8 }, pyramid: { hemi: 0.8, lamp: 0.9 }, vietnam: { hemi: 1, lamp: 1 }, spacestation: { hemi: 0.75, lamp: 0.22 }, asylum: { hemi: 0.18, lamp: 0.28 } };
  const night = station ? { hemi: 1, lamp: 1 } : NIGHT[theme] || { hemi: 1, lamp: 1 };
  const bright = bright0 * night.lamp;
  const seed = layout.meta?.seed ?? 7;
  const rnd = mulberry32(seed * 7919 + 13);
  const pal = T.pal;
  const W = layout.w, Hh = layout.h, grid = layout.grid, block = layout.block;
  const root = new THREE.Group(); root.name = 'house'; scene.add(root);
  const bodies = [], disposables = [];
  const stats = { colliders: 0, wallRects: 0, floorRects: 0, props: 0, propColliders: 0, tris: 0, meshes: 0 };

  // floors (js/floors.js): every placement below draws at its floor's height through curY (batches are keyed by it and
  // moved up or down when baked; addBox and lamps add it); a house without floors keeps curY 0 everywhere
  const FL = layout.floorOf || null, HC = layout.hcell || null, SO = layout.stairOf || null, STAIRS = layout.stairs || [];
  const levels = layout.floors?.levels || [0];
  const roomFloor = (id) => (layout.rooms[id]?.floor || 0);
  const stairOfRoom = new Map(STAIRS.map((st) => [st.room, st]));
  const roomTop = (id) => { const st = stairOfRoom.get(id); return st ? Math.max(st.hD, st.hS) : roomFloor(id) * FLOOR_DY; };
  let curY = 0;
  const stairCols = new Set();   // ramp and landing colliders: foes and bots follow the height map instead
  const addBox = (x, y, z, hx, hy, hz, tag) => { const b = phys.fixedBox(x, y + curY, z, hx, hy, hz); bodies.push(b); stats.colliders++; if (tag === 'stair') stairCols.add(b); return b; };
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && (grid[y * W + x] === 1 || grid[y * W + x] === 3);
  const isWall = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && grid[y * W + x] === 2;

  // ---- materials
  const aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const mk = (c) => { const t = tex(c); t.anisotropy = aniso; disposables.push(t); return t; };
  const wallTex = mk(wallTexture(theme, mulberry32(seed + 1)));
  const floorA = mk(floorTexture(theme, 0, mulberry32(seed + 2))), floorB = mk(floorTexture(theme, 1, mulberry32(seed + 3)));
  const ceilTex = mk(ceilTexture(theme, mulberry32(seed + 4)));
  const rough = { vampire: 0.8, pyramid: 0.92, vietnam: 0.85, spacestation: 0.45, asylum: 0.55 }[theme];
  const metalness = theme === 'spacestation' ? 0.35 : 0;
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallTex, vertexColors: true, roughness: rough, metalness }),
    floor0: new THREE.MeshStandardMaterial({ map: floorA, roughness: theme === 'asylum' ? 0.4 : rough, metalness }),
    floor1: new THREE.MeshStandardMaterial({ map: floorB, roughness: theme === 'asylum' ? 0.4 : rough, metalness }),
    ceil: new THREE.MeshStandardMaterial({ map: ceilTex, vertexColors: true, roughness: 0.95 }),
    // basement floor: the same boards or tiles, darker, cold and wet (low roughness catches the torch as puddles)
    floorW0: new THREE.MeshStandardMaterial({ map: floorA, color: 0x7d8790, roughness: 0.22, metalness }),
    floorW1: new THREE.MeshStandardMaterial({ map: floorB, color: 0x7d8790, roughness: 0.22, metalness }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: theme === 'spacestation' ? 0.25 : 0.05 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  for (const m of Object.values(M)) disposables.push(m);

  // chunked batches
  const batches = new Map();
  const batch = (kind, x, z) => {
    const key = kind + ':' + curY + ':' + Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let b = batches.get(key); if (!b) { b = new Batch(); b.kind = kind; b.yOff = curY; batches.set(key, b); } return b;
  };

  // ---- rooms of each cell (floor variant)
  const roomOf = new Int16Array(W * Hh).fill(-1);
  for (const r of layout.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x < W && y < Hh && grid[y * W + x] === 1) roomOf[y * W + x] = r.id;
  for (const d of layout.doors) for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) roomOf[y * W + x] = -1;

  // ---- floors, ceilings (visual by variant, physics merged), one pass per floor level; ramps are drawn by the stairs
  const lvAt = (x, y) => (FL ? FL[y * W + x] : 0);
  const isRamp = (x, y) => !!SO && SO[y * W + x] >= 0;
  const inStair = (x, y) => STAIRS.length > 0 && stairOfRoom.has(roomOf[y * W + x]);
  const cm = { vampire: 1, pyramid: 1.1, vietnam: 1.2, spacestation: 1.4, asylum: 1.7 }[theme] ?? 1, ceilCol = [cm, cm, cm];
  const WH = FL ? FLOOR_DY : H;   // wall height per floor pass: floors stack walls 3 m apart
  for (const lv of levels) {
    curY = lv * FLOOR_DY;
    const floorKey = (x, y) => { const g = grid[y * W + x]; if ((g !== 1 && g !== 3) || lvAt(x, y) !== lv || isRamp(x, y)) return -1; return (g === 3 ? 0 : (roomOf[y * W + x] & 1)) + (inStair(x, y) ? 2 : 0); };
    for (const r of mergeRects(W, Hh, floorKey)) {
      stats.floorRects++;
      const x0 = r.x, x1 = r.x + r.w, z0 = r.y, z1 = r.y + r.h;
      const bf = batch((lv < 0 ? 'floorW' : 'floor') + (r.k & 1), (x0 + x1) / 2, (z0 + z1) / 2);
      bf.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]], WHITE);
      if (r.k & 2) continue;   // stair rooms get one ceiling over the top of the stair
      const bc = batch('ceil', (x0 + x1) / 2, (z0 + z1) / 2);
      bc.quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]], ceilCol);
    }
    for (const r of mergeRects(W, Hh, (x, y) => (walk(x, y) && lvAt(x, y) === lv && !isRamp(x, y) ? (inStair(x, y) ? 1 : 0) : -1))) {
      const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
      if (r.k === 1) {   // stair landing: solid down to the bottom of the stair (the cliff beside the ramp)
        const st = stairOfRoom.get(roomOf[r.y * W + r.x]), bot = Math.min(st.hD, st.hS) - curY - FLOOR_T;
        addBox(cx, bot / 2, cz, r.w / 2, Math.max(FLOOR_T, -bot) / 2, r.h / 2);
        continue;
      }
      addBox(cx, -FLOOR_T / 2, cz, r.w / 2, FLOOR_T / 2, r.h / 2);
      addBox(cx, H + FLOOR_T / 2, cz, r.w / 2, FLOOR_T / 2, r.h / 2);
    }
  }

  // ---- walls: cells that touch a floor cell of the pass's level (stair rooms count on both their levels)
  const stairLv = (x, y) => { const st = stairOfRoom.get(roomOf[y * W + x]); return st ? st.floors : null; };
  for (const lv of levels) {
    curY = lv * FLOOR_DY;
    const present = (x, y) => walk(x, y) && (lvAt(x, y) === lv || (stairLv(x, y)?.includes(lv) ?? false));
    const touches = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (present(x + dx, y + dy)) return true; return false; };
    const wr = mergeRects(W, Hh, (x, y) => (isWall(x, y) && touches(x, y) ? 0 : -1));
    stats.wallRects += wr.length;
    const dark = lv < 0 ? 0.72 : 1;   // basement walls: damp and darker
    for (const r of wr) {
      const x0 = r.x, x1 = r.x + r.w, z0 = r.y, z1 = r.y + r.h;
      addBox((x0 + x1) / 2, WH / 2, (z0 + z1) / 2, r.w / 2, WH / 2, r.h / 2);
      const b = batch('wall', (x0 + x1) / 2, (z0 + z1) / 2);
      const tint = (0.92 + rnd() * 0.12) * dark, cc = [tint, tint, tint * (lv < 0 ? 1.04 : 1)];
      const v0 = 0, v1 = WH / H;
      b.quad([x1, 0, z0], [x1, WH, z0], [x1, WH, z1], [x1, 0, z1], [1, 0, 0], [[z0 / 2, v0], [z0 / 2, v1], [z1 / 2, v1], [z1 / 2, v0]], cc);
      b.quad([x0, 0, z0], [x0, WH, z0], [x0, WH, z1], [x0, 0, z1], [-1, 0, 0], [[z0 / 2, v0], [z0 / 2, v1], [z1 / 2, v1], [z1 / 2, v0]], cc);
      b.quad([x0, 0, z1], [x1, 0, z1], [x1, WH, z1], [x0, WH, z1], [0, 0, 1], [[x0 / 2, v0], [x1 / 2, v0], [x1 / 2, v1], [x0 / 2, v1]], cc);
      b.quad([x0, 0, z0], [x1, 0, z0], [x1, WH, z0], [x0, WH, z0], [0, 0, -1], [[x0 / 2, v0], [x1 / 2, v0], [x1 / 2, v1], [x0 / 2, v1]], cc);
      b.quad([x0, WH, z0], [x1, WH, z0], [x1, WH, z1], [x0, WH, z1], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.2, 0.2, 0.2]);
    }
  }

  // ---- stairs: the ramp (one sloped quad, a sloped collider and solid rows under it), cliff faces between the ramp and
  // the landing, one ceiling over the whole stair room at the top level
  for (const st of STAIRS) {
    curY = 0;
    const L = RAMP_LEN, top = Math.max(st.hD, st.hS) + H, lo = Math.min(st.hD, st.hS);
    const hAt = (u) => st.hD + (st.hS - st.hD) * Math.max(0, Math.min(1, (u - st.e0) * st.sgn / L));
    for (const q of mergeRects(W, Hh, (x, y) => (roomOf[y * W + x] === st.room || (SO && SO[y * W + x] >= 0 && STAIRS[SO[y * W + x]] === st) ? 0 : -1))) {
      const x0 = q.x, x1 = q.x + q.w, z0 = q.y, z1 = q.y + q.h;
      batch('ceil', (x0 + x1) / 2, (z0 + z1) / 2).quad([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], [0, -1, 0], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]], ceilCol);
      addBox((x0 + x1) / 2, top + FLOOR_T / 2, (z0 + z1) / 2, q.w / 2, FLOOR_T / 2, q.h / 2);
    }
    const { x0, y0, x1, y1 } = st, uA = st.axis === 0 ? x0 : y0, uB = st.axis === 0 ? x1 : y1;
    const hA = hAt(uA), hB = hAt(uB), slope = (hB - hA) / (uB - uA), th = Math.atan(slope);
    const P3 = (u, v, hh) => (st.axis === 0 ? [u, hh, v] : [v, hh, u]);
    const vA = st.axis === 0 ? y0 : x0, vB = st.axis === 0 ? y1 : x1;
    const nrm = st.axis === 0 ? [-Math.sin(th), Math.cos(th), 0] : [0, Math.cos(th), -Math.sin(th)];
    const bf = batch(lo < 0 ? 'floorW0' : 'floor0', (x0 + x1) / 2, (y0 + y1) / 2);
    const uvr = (u, v) => (st.axis === 0 ? [u / 2, v / 2] : [v / 2, u / 2]);
    bf.quad(P3(uA, vA, hA), P3(uB, vA, hB), P3(uB, vB, hB), P3(uA, vB, hA), nrm, [uvr(uA, vA), uvr(uB, vA), uvr(uB, vB), uvr(uA, vB)], WHITE);
    // nosings: a light strip every metre so the slope reads as a stair
    const nb = batch('prop', (x0 + x1) / 2, (y0 + y1) / 2), nc = rgb(T.door.trim, 0.9);
    for (let u = uA + 0.5; u < uB; u += 1) { const hh = hAt(u); const [a, , c] = P3(u - 0.04, vA + 0.05, hh), [b, , d] = P3(u + 0.04, vB - 0.05, hh); aabb(nb, Math.min(a, b), hh, Math.min(c, d), Math.max(a, b), hh + 0.025, Math.max(c, d), nc); }
    // sloped collider
    const t = 0.12, len = Math.hypot(uB - uA, hB - hA), um = (uA + uB) / 2, vm = (vA + vB) / 2, hm = (hA + hB) / 2;
    const ctr = P3(um, vm, hm); const cx = ctr[0] - nrm[0] * t, cy = ctr[1] - nrm[1] * t, cz = ctr[2] - nrm[2] * t;
    const qq = st.axis === 0 ? { x: 0, y: 0, z: Math.sin(th / 2), w: Math.cos(th / 2) } : { x: Math.sin(-th / 2), y: 0, z: 0, w: Math.cos(-th / 2) };
    const body = phys.world.createRigidBody(phys.R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation(qq));
    const hx = st.axis === 0 ? len / 2 : (vB - vA) / 2, hz = st.axis === 0 ? (vB - vA) / 2 : len / 2;
    phys.world.createCollider(phys.R.ColliderDesc.cuboid(hx, t, hz).setFriction(0.8), body); bodies.push(body); stairCols.add(body); stats.colliders++;
    // solid rows under the ramp, up to each row's lower edge
    for (let u = uA; u < uB; u += 1) {
      const h0 = Math.min(hAt(u), hAt(u + 1)) - 0.02; if (h0 - lo < 0.05) continue;
      const c = P3(u + 0.5, vm, (h0 + lo) / 2);
      addBox(c[0], c[1], c[2], st.axis === 0 ? 0.5 : (vB - vA) / 2, (h0 - lo) / 2, st.axis === 0 ? (vB - vA) / 2 : 0.5, 'stair');
    }
    // cliff faces along the two long sides of the ramp
    const wb = batch('wall', (x0 + x1) / 2, (y0 + y1) / 2), cc = lo < 0 ? [0.66, 0.66, 0.7] : [0.88, 0.88, 0.88];
    for (const [v, out] of [[vA, -1], [vB, 1]]) for (let u = uA; u < uB; u++) {
      const nx = st.axis === 0 ? u : v + (out > 0 ? 0 : -1), nz = st.axis === 0 ? v + (out > 0 ? 0 : -1) : u;
      if (!walk(nx, nz)) continue;
      const hn = HC[nz * W + nx], ha = hAt(u), hb = hAt(u + 1);
      if (Math.abs(hn - ha) < 0.02 && Math.abs(hn - hb) < 0.02) continue;
      const up = hn > (ha + hb) / 2;   // the landing is above the ramp: the face looks onto the ramp
      const n = st.axis === 0 ? [0, 0, up ? -out : out] : [up ? -out : out, 0, 0];
      wb.quad(P3(u, v, hn), P3(u + 1, v, hn), P3(u + 1, v, hb), P3(u, v, ha), n, [[u / 2, hn / H], [(u + 1) / 2, hn / H], [(u + 1) / 2, hb / H], [u / 2, ha / H]], cc);
    }
  }
  curY = 0;

  // ---- props
  const coverIdx = new Map();   // cell -> blocking prop record
  const propRecs = [];
  for (const p of layout.props) {
    const cls = classify(p.name, p.blocks);
    const rec = { p, cls, cx: p.x + p.w / 2, cz: p.y + p.h / 2 };
    propRecs.push(rec);
    if (p.blocks) { for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) coverIdx.set(y * W + x, rec); }
  }
  const lamps = [];
  const lampPush = (l) => lamps.push({ ...l, y: l.y + curY });
  const lampColorFor = (n) => (/blue|space|crystal|screen/.test(n) ? 0x70c8ff : /green|portal_green/.test(n) ? 0x70ff98 : /red/.test(n) ? 0xff6a50 : /torch|brazier|fire|candle|sconce/.test(n) ? 0xff9a50 : T.lamp);
  for (const rec of propRecs) {
    const { p, cls } = rec, nm = cls.n;
    curY = roomFloor(p.roomId) * FLOOR_DY;
    const r = mulberry32(Math.floor(hash(nm + p.x + ',' + p.y) * 4294967296));
    const pb = batch('prop', rec.cx, rec.cz), gb = batch('glow', rec.cx, rec.cz);
    stats.props++;
    if (cls.cat === 'wall') {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const own = grid[p.y * W + p.x];
      let mount = null;
      for (const [dx, dz] of dirs) {
        if ((own === 1 || own === 3) && isWall(p.x + dx, p.y + dz)) { mount = { x: p.x + 0.5 + dx * 0.5, z: p.y + 0.5 + dz * 0.5, fx: -dx, fz: -dz }; break; }
        if (own === 2 && walk(p.x + dx, p.y + dz)) { mount = { x: p.x + 0.5 + dx * 0.5, z: p.y + 0.5 + dz * 0.5, fx: dx, fz: dz }; break; }
      }
      if (!mount) continue;
      const q = Math.round(Math.atan2(mount.fx, mount.fz) / (Math.PI / 2));
      const F = new Frame(pb, mount.x, mount.z, q), FG = new Frame(gb, mount.x, mount.z, q);
      // split solid and emissive: the glow-colored parts are bright enough to read as lit; draw all into prop batch except bright ones
      wallThingSplit(F, FG, nm, pal, r, theme);
      if (/sconce|torch|lamp_wall|lantern|light_strip|tube|light_tube|caged/.test(nm)) lampPush({ x: mount.x + mount.fx * 0.3, z: mount.z + mount.fz * 0.3, y: /tube|strip|caged/.test(nm) ? 2.1 : 1.95, color: lampColorFor(nm), i: 10, d: 11 });
      continue;
    }
    if (cls.cat === 'rug' || cls.cat === 'ground') {
      if (coverIdx.has(p.y * W + p.x)) continue;
      const c = /grass|weed|reed|crop|vegetable|seedling|straw/.test(nm) ? col(0x4a7a30, 0.7 + r() * 0.4) : /water|lily|lotus/.test(nm) ? col(0x1a4a5a) : /stairs/.test(nm) ? col(0x7a2a2a) : rgb([pal.fabric, pal.fabric2, pal.wood2, pal.plant2][Math.floor(r() * 4)], 0.75);
      const hgt = cls.h;
      const ins = cls.cat === 'ground' ? 0 : 0.04;
      aabb(pb, p.x + ins, 0.001, p.y + ins, p.x + p.w - ins, hgt, p.y + p.h - ins, c);
      continue;
    }
    if (cls.cat === 'small') {
      const cov = coverIdx.get(p.y * W + p.x);
      if (!walk(p.x, p.y) && !cov) continue;
      const y = cov ? cov.cls.h : 0;
      if (y > 1.3) continue;
      const F = new Frame(pb, p.x + 0.5, p.y + 0.5, 0);
      smallItem(F, G, nm, y, pal, r);
      if (/lamp|candle|lantern|torch|light/.test(nm)) lampPush({ x: p.x + 0.5, z: p.y + 0.5, y: y + 0.45, color: lampColorFor(nm), i: 4, d: 8 });
      continue;
    }
    // blocking furniture
    const L0 = p.w, D0 = p.h, hh = cls.h;
    let q = 0, L = L0, D = D0;
    if (/(sofa|ofa|chair|hair|bed|bunk|gurney|bench|armchair|console|counter|fireplace|cabinet|wardrobe|locker|shelf)/.test(nm)) {
      if (L0 < D0) { q = 1; L = D0; D = L0; }
      // face the open floor: of the two turns along the long side, take the one with walkable cells in front (was: always
      // the same turn, so about half the cabinets, shelves and sofas showed their backs to the room)
      const open = (qq) => { const a = qq * Math.PI / 2, fx = Math.round(Math.sin(a)), fz = Math.round(Math.cos(a)); let n = 0;
        for (let t = -1; t <= 1; t++) { const x = Math.floor(rec.cx + fx * (D / 2 + 0.5) + (fz ? t * L * 0.3 : 0)), z = Math.floor(rec.cz + fz * (D / 2 + 0.5) + (fx ? t * L * 0.3 : 0));
          if (x >= 0 && z >= 0 && x < W && z < Hh && (grid[z * W + x] === 1 || grid[z * W + x] === 3) && !coverIdx.has(z * W + x)) n++; }
        return n; };
      if (open(q + 2) > open(q)) q += 2;
      if (/backview/.test(nm)) q += 2;
    }
    rec.q = q;
    const F = new Frame(pb, rec.cx, rec.cz, q);
    furnish(F, G, { ...cls, h: hh }, L, D, { ...pal, theme }, r);
    if (cls.cat === 'lamp' || cls.cat === 'fireplace' || /portal/.test(nm)) lampPush({ x: rec.cx, z: rec.cz, y: hh + 0.1, color: lampColorFor(nm), i: 10, d: 11 });
    const trim = cls.cat === 'fence' ? 0.12 : 0.04;
    const fw = cls.cat === 'fence' ? (p.w >= p.h ? p.w : 0.2) : p.w, fd = cls.cat === 'fence' ? (p.w >= p.h ? 0.2 : p.h) : p.h;
    if (cls.cat !== 'water') { addBox(rec.cx, hh / 2, rec.cz, fw / 2 - trim / 2, hh / 2, fd / 2 - trim / 2); stats.propColliders++; }
    // a stair room is two floors tall: a robot dropped from the landing could stand on a tall prop out of a foe's reach
    // (1.6 m up; tools/jump.js). Its air is closed off up to the stair ceiling, as a normal room's ceiling does at H.
    const stR = stairOfRoom.get(roomOf[Math.floor(rec.cz) * W + Math.floor(rec.cx)]);
    if (stR && p.blocks && cls.cat !== 'water' && hh > H - STAND_CAP) { const topY = Math.max(stR.hD, stR.hS) + H - curY; if (topY > hh + 0.1) addBox(rec.cx, (hh + topY) / 2, rec.cz, fw / 2 - trim / 2, (topY - hh) / 2, fd / 2 - trim / 2); }
  }

  curY = 0;
  // glow for wall lights goes through the split helper
  function wallThingSplit(F, FG, nm, pal, r, th) {
    // walls things are drawn into the solid batch; emissive pieces use their bright colour, which reads fine under tone mapping
    wallThing(F, nm, pal, r, th);
  }

  // ---- ceiling lamps
  const spawnCell = (r) => {
    const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
    for (let rad = 0; rad < 8; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < W && y < Hh && grid[y * W + x] === 1 && roomOf[y * W + x] === r.id) return { x, y };
    }
    return null;
  };
  const lampCol = rgb(T.lamp, 1.2);
  const roomInfo = layout.rooms.map((r) => {
    const c = spawnCell(r);
    return { id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, cx: (c ? c.x : r.x + r.w / 2) + 0.5, cz: (c ? c.y : r.y + r.h / 2) + 0.5, template: r.template, floor: roomFloor(r.id) };
  });
  roomInfo.forEach((r, i) => {
    curY = roomTop(r.id);
    if (roomFloor(r.id) < 0) return;   // basement rooms get bare hanging bulbs instead (below)
    if (hash(seed + ':' + i) > 0.62 && i !== 0 && roomFloor(r.id) === 0) return;   // upper rooms always keep theirs
    const gb = batch('glow', r.cx, r.cz), pb = batch('prop', r.cx, r.cz);
    if (T.lampKind === 'panel') { aabb(gb, r.cx - 0.6, H - 0.06, r.cz - 0.15, r.cx + 0.6, H - 0.01, r.cz + 0.15, lampCol); aabb(pb, r.cx - 0.66, H - 0.08, r.cz - 0.21, r.cx + 0.66, H - 0.06, r.cz + 0.21, [0.15, 0.15, 0.16]); }
    else { cylinder(pb, r.cx, H - 0.05, r.cz, 0.02, 0.02, 0.05, [0.1, 0.08, 0.05], 6); cylinder(pb, r.cx, H - 0.5, r.cz, 0.01, 0.01, 0.45, [0.1, 0.08, 0.05], 5); cylinder(gb, r.cx, H - 0.72, r.cz, 0.22, 0.05, 0.22, lampCol, 10); cylinder(pb, r.cx, H - 0.5, r.cz, 0.3, 0.3, 0.02, [0.12, 0.1, 0.06], 12); }
    lampPush({ x: r.cx, z: r.cz, y: H - 0.5, color: T.lamp, i: T.lampI * 7, d: 18, ceiling: true });
  });
  curY = 0;
  // layout lights that props did not provide (name heuristic list)
  for (const l of layout.lights || []) {
    curY = roomFloor(l.roomId) * FLOOR_DY;
    const nm = l.name.replace(/ \(\d+\)$/, '').toLowerCase();
    if (/window|portal/.test(nm)) continue;
    if (!/lamp|torch|candle|lantern|brazier|sconce|light|fire/.test(nm)) continue;
    if (lamps.some((q) => Math.hypot(q.x - l.x, q.z - l.y) < 0.9)) continue;
    lampPush({ x: l.x, z: l.y, y: /floor|post/.test(nm) ? 1.4 : /table|desk/.test(nm) ? 1.0 : 1.8, color: lampColorFor(nm), i: 7, d: 10 });
  }

  // ---- floor mood: basement rooms get pipes under the ceiling and bare bulbs that buzz and drop out (lights.js, buzz);
  // upper rooms get moonlit windows on their outside walls (a pale pane, a mullion cross and a cold low light)
  const moonCol = glowCol(0xb8ccff), frameCol = rgb(T.door.trim, 0.55), pipeCol = rgb(0x4a4038), pipeCol2 = rgb(0x5a6266);
  for (const r of roomInfo) {
    const lv = roomFloor(r.id); if (!lv || stairOfRoom.has(r.id)) continue;
    curY = lv * FLOOR_DY;
    const rm = layout.rooms[r.id];
    if (lv < 0) {
      const pb = batch('prop', r.cx, r.cz), gb = batch('glow', r.cx, r.cz), alongX = rm.w >= rm.h;
      const a0 = (alongX ? rm.x : rm.y) + 1, a1 = (alongX ? rm.x + rm.w : rm.y + rm.h) - 1, side = alongX ? rm.y + 1.35 : rm.x + 1.35;
      for (const [k, c, t] of [[0, pipeCol, 0.09], [1, pipeCol2, 0.06]]) {
        const o = side + k * 0.32, y = H - 0.16 - k * 0.1;
        if (alongX) aabb(pb, a0, y - t, o - t, a1, y + t, o + t, c); else aabb(pb, o - t, y - t, a0, o + t, y + t, a1, c);
        for (let u = a0 + 1; u < a1; u += 2.5) if (alongX) aabb(pb, u - 0.03, y + t, o - 0.02, u + 0.03, H, o + 0.02, pipeCol); else aabb(pb, o - 0.02, y + t, u - 0.03, o + 0.02, H, u + 0.03, pipeCol);
      }
      // one or two bulbs on cords, their light buzzes and drops out on its own
      const nB = Math.max(1, Math.min(3, Math.round((rm.w - 2) * (rm.h - 2) / 90))), spots = Array.from({ length: nB }, (_, k) => [nB === 1 ? 0 : (k / (nB - 1) - 0.5) * 0.6, 0]);
      for (const [fx] of spots) {
        const bx = alongX ? r.cx + fx * rm.w : r.cx, bz = alongX ? r.cz : r.cz + fx * rm.h;
        aabb(pb, bx - 0.008, H - 0.62, bz - 0.008, bx + 0.008, H, bz + 0.008, [0.05, 0.05, 0.05]);
        aabb(pb, bx - 0.045, H - 0.68, bz - 0.045, bx + 0.045, H - 0.62, bz + 0.045, [0.12, 0.1, 0.08]);
        cylinder(gb, bx, H - 0.74, bz, 0.05, 0.05, 0.08, glowCol(0xffc080), 8);
        lampPush({ x: bx, z: bz, y: H - 0.78, color: 0xffb070, i: 10, d: 11, buzz: true });
      }
      continue;
    }
    // upper floor: windows where the room's wall faces the outside (void behind the wall cell)
    let n = 0;
    const tryWin = (wx, wz, dx, dz) => {   // (dx, dz): from the wall cell into the room
      if (n >= 2 || !isWall(wx, wz)) return;
      const ox = wx - dx, oz = wz - dz; if (ox >= 0 && oz >= 0 && ox < W && oz < Hh && grid[oz * W + ox] !== 0) return;
      for (const t of [-1, 1]) { const ax = wx + (dz ? t : 0), az = wz + (dx ? t : 0); if (!isWall(ax, az) || !walk(ax + dx, az + dz)) return; }
      const px = wx + 0.5 + dx * 0.5 + dx * 0.012, pz = wz + 0.5 + dz * 0.5 + dz * 0.012;
      const gb = batch('glow', px, pz), pb = batch('prop', px, pz), hw = 0.6, y0 = 1.0, y1 = 2.25;
      const P = (s, y) => (dx ? [px, y, pz + s] : [px + s, y, pz]), nn = [dx, 0, dz];
      gb.quad(P(-hw, y0), P(hw, y0), P(hw, y1), P(-hw, y1), nn, [[0, 0], [1, 0], [1, 1], [0, 1]], moonCol);
      const f = 0.05;
      const box = (a, b, c, d) => { const [x0, x1] = dx ? [px - 0.03 + dx * 0.03, px + 0.03 + dx * 0.03] : [px + a, px + c], [z0, z1] = dx ? [pz + a, pz + c] : [pz - 0.03 + dz * 0.03, pz + 0.03 + dz * 0.03]; aabb(pb, x0, b, z0, x1, d, z1, frameCol); };
      box(-hw - f, y0 - f, hw + f, y0); box(-hw - f, y1, hw + f, y1 + f); box(-hw - f, y0, -hw, y1); box(hw, y0, hw + f, y1); box(-f / 2, y0, f / 2, y1); box(-hw, (y0 + y1) / 2 - f / 2, hw, (y0 + y1) / 2 + f / 2);
      lampPush({ x: px + dx * 0.9, z: pz + dz * 0.9, y: 1.7, color: 0x8fb0ff, i: 2.2, d: 6, moon: true });
      n++;
    };
    const midX = Math.floor(rm.x + rm.w / 2), midZ = Math.floor(rm.y + rm.h / 2);
    for (const [wx, wz, dx, dz] of [[rm.x, midZ, 1, 0], [rm.x + rm.w - 1, midZ, -1, 0], [midX, rm.y, 0, 1], [midX, rm.y + rm.h - 1, 0, -1], [rm.x, midZ - 3, 1, 0], [rm.x + rm.w - 1, midZ + 3, -1, 0], [midX - 4, rm.y, 0, 1], [midX + 4, rm.y + rm.h - 1, 0, -1]]) tryWin(wx, wz, dx, dz);
  }
  curY = 0;
  // ---- doors (a 3 m wide connector zone; the door plane sits in its middle)
  const doorList = [];
  const leafGeoms = {};
  const doorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: theme === 'spacestation' ? 0.5 : 0.1 });
  disposables.push(doorMat);
  function leafGeometry(len) {
    const key = len.toFixed(2);
    if (leafGeoms[key]) return leafGeoms[key];
    const b = new Batch(), D = T.door;
    const base = rgb(D.base), panel = rgb(D.panel), trim = rgb(D.trim);
    aabb(b, 0, 0, -0.045, len, DOOR_H, 0.045, base);
    for (const s of [-1, 1]) {
      const zz = s * 0.045;
      aabb(b, 0.12, 0.2, s > 0 ? zz : zz - 0.015, len - 0.12, DOOR_H * 0.5 - 0.05, s > 0 ? zz + 0.015 : zz, panel);
      aabb(b, 0.12, DOOR_H * 0.5 + 0.05, s > 0 ? zz : zz - 0.015, len - 0.12, DOOR_H - 0.15, s > 0 ? zz + 0.015 : zz, panel);
      aabb(b, 0, 0, s > 0 ? zz : zz - 0.01, len, 0.1, s > 0 ? zz + 0.01 : zz, trim);
      aabb(b, 0, DOOR_H - 0.1, s > 0 ? zz : zz - 0.01, len, DOOR_H, s > 0 ? zz + 0.01 : zz, trim);
      aabb(b, len - 0.28, 1.0, s > 0 ? zz : zz - 0.04, len - 0.2, 1.08, s > 0 ? zz + 0.04 : zz, rgb(0xd8c070));
    }
    if (theme === 'asylum') aabb(b, 0.3, 1.45, -0.05, len - 0.3, 1.9, 0.05, [0.04, 0.06, 0.06]);
    if (theme === 'spacestation') aabb(b, 0.15, 1.2, -0.05, len - 0.15, 1.28, 0.05, glowCol(0x40d0e8));
    const g = b.geometry(); disposables.push(g); leafGeoms[key] = g; return g;
  }
  const jamBar = new Batch();
  for (const d of layout.doors) {
    const alongX = d.dir === 0;
    // plane centre: middle of the 2-thick zone along the walk axis
    const px = alongX ? d.x0 + d.zw / 2 : d.x0 + d.zw / 2, pz = d.y0 + d.zh / 2;
    const span = alongX ? d.zh : d.zw;   // opening width across the walk axis
    const leafLen = span / 2;
    const cxw = d.x0 + d.zw / 2, czw = d.y0 + d.zh / 2;
    curY = FL ? FL[d.y * W + d.x] * FLOOR_DY : 0;   // a stair door sits at the floor it opens from
    const rec = { door: d, cx: cxw, cz: czw, cy: curY, leaves: [], open: 0, target: 0, side: 1, jammed: d.jammed, span };
    // header over the opening
    const hx = alongX ? d.zw / 2 : span / 2, hz = alongX ? span / 2 : d.zh / 2;
    addBox(cxw, (DOOR_H + H) / 2, czw, hx, (H - DOOR_H) / 2, hz);
    const wb = batch('wall', cxw, czw);
    const x0 = d.x0, x1 = d.x0 + d.zw, z0 = d.y0, z1 = d.y0 + d.zh, ya = DOOR_H;
    const cc = [0.9, 0.9, 0.9], uvq = (a, b) => [[a / 2, ya / H], [b / 2, ya / H], [b / 2, 1], [a / 2, 1]];
    wb.quad([x0, ya, z0], [x1, ya, z0], [x1, H, z0], [x0, H, z0], [0, 0, -1], uvq(x0, x1), cc);
    wb.quad([x0, ya, z1], [x1, ya, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], uvq(x0, x1), cc);
    wb.quad([x0, ya, z0], [x0, ya, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], uvq(z0, z1), cc);
    wb.quad([x1, ya, z0], [x1, ya, z1], [x1, H, z1], [x1, H, z0], [1, 0, 0], uvq(z0, z1), cc);
    wb.quad([x0, ya, z0], [x1, ya, z0], [x1, ya, z1], [x0, ya, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.3, 0.3, 0.3]);
    // hinges at the jambs, leaves extend toward the middle
    for (const s of [-1, 1]) {
      const hingeX = alongX ? cxw : cxw + s * span / 2, hingeZ = alongX ? czw + s * span / 2 : czw;
      const ex = alongX ? 0 : -s, ez = alongX ? -s : 0;   // leaf extension direction
      const base = Math.atan2(-ez, ex);
      const pivot = new THREE.Group(); pivot.position.set(hingeX, curY, hingeZ);
      const mesh = new THREE.Mesh(leafGeometry(leafLen), doorMat); mesh.rotation.y = base; mesh.castShadow = true; mesh.receiveShadow = true;
      pivot.add(mesh); root.add(pivot); stats.meshes++;
      let body;
      if (d.jammed) {
        body = phys.world.createRigidBody(phys.R.RigidBodyDesc.fixed().setTranslation(hingeX, curY, hingeZ));
      } else {
        body = phys.world.createRigidBody(phys.R.RigidBodyDesc.kinematicPositionBased().setTranslation(hingeX, curY, hingeZ));
      }
      const cd = phys.R.ColliderDesc.cuboid(leafLen / 2, DOOR_H / 2, 0.05).setTranslation(ex * leafLen / 2, DOOR_H / 2, ez * leafLen / 2).setRotation(quatY(base)).setFriction(0.5);
      phys.world.createCollider(cd, body); stats.colliders++;
      bodies.push(body);
      rec.leaves.push({ pivot, body, ex, ez, theta: 0, hx: hingeX, hz: hingeZ });
    }
    if (d.jammed) {
      const gb = new Batch();   // its own mesh, so Pick's unlock can take the red bars away
      for (const s of [-1, 1]) {
        const o = 0.07 * s;
        if (alongX) aabb(gb, cxw + o - 0.03, 0.95, d.y0 + 0.1, cxw + o + 0.03, 1.1, d.y0 + d.zh - 0.1, [0.75, 0.06, 0.06]);
        else aabb(gb, d.x0 + 0.1, 0.95, czw + o - 0.03, d.x0 + d.zw - 0.1, 1.1, czw + o + 0.03, [0.75, 0.06, 0.06]);
      }
      rec.bars = new THREE.Mesh(gb.geometry(), M.glow); disposables.push(rec.bars.geometry);
      rec.bars.position.y = curY; rec.bars.matrixAutoUpdate = false; rec.bars.updateMatrix(); root.add(rec.bars); stats.meshes++;
    }
    doorList.push(rec);
  }
  curY = 0;

  // ---- pads
  const padDefs = [...layout.pads].sort((a, b) => a.order - b.order);
  const padMeshes = [];
  const padHalf = CFG.extract.padSize / 2;
  for (const p of padDefs) {
    const py = roomFloor(p.roomId) * FLOOR_DY; p.py = py;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c4030, emissive: 0x2bff9a, emissiveIntensity: 0.25, roughness: 0.6 });
    disposables.push(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(padHalf * 2, 0.03, padHalf * 2), mat);
    mesh.position.set(p.fx, py + 0.016, p.fy); mesh.receiveShadow = true; root.add(mesh); disposables.push(mesh.geometry);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(padHalf * 2 + 0.2, 0.02, padHalf * 2 + 0.2), new THREE.MeshStandardMaterial({ color: 0x101410, roughness: 0.8 }));
    ring.position.set(p.fx, py + 0.008, p.fy); root.add(ring); disposables.push(ring.geometry, ring.material);
    padMeshes.push(mesh);
  }

  // ---- bake batches into meshes
  const matFor = { wall: M.wall, floor0: M.floor0, floor1: M.floor1, floorW0: M.floorW0, floorW1: M.floorW1, ceil: M.ceil, prop: M.prop, glow: M.glow };
  for (const b of batches.values()) {
    if (b.empty) continue;
    const g = b.geometry(); disposables.push(g);
    if (b.yOff) { g.translate(0, b.yOff, 0); g.computeBoundingSphere(); }
    const mesh = new THREE.Mesh(g, matFor[b.kind]);
    mesh.castShadow = b.kind === 'wall' || b.kind === 'prop';
    mesh.receiveShadow = b.kind !== 'glow';
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    root.add(mesh); stats.meshes++; stats.tris += b.i.length / 3;
  }

  // ---- loot
  const rngL = mulberry32(seed * 31 + 5);
  const weights = T.loot, wsum = weights[0] + weights[1] + weights[2];
  const lootItems = [];
  const freeNear = (x, y) => {
    if (!block[y * W + x] && walk(x, y)) return [x, y];
    for (let rad = 1; rad < 4; rad++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const xx = x + dx * rad, yy = y + dy * rad; if (walk(xx, yy) && !block[yy * W + xx]) return [xx, yy];
    }
    return null;
  };
  const sizes = CFG.loot.sizes;
  for (const s of layout.loot) {
    let r = rngL() * wsum; const mi = r < weights[0] ? 0 : r < weights[0] + weights[1] ? 1 : 2;
    r = rngL(); const size = r < 0.45 ? 'small' : r < 0.82 ? 'medium' : 'big';
    const half = sizes[size].half;
    let x = s.x, y = s.y, topY = 0;
    const cov = coverIdx.get(y * W + x);
    if (s.place === 'table' && cov && cov.cls.h <= 1.2) topY = cov.cls.h;
    else { const f = freeNear(x, y); if (!f) continue; x = f[0]; y = f[1]; }
    const jx = (rngL() - 0.5) * 0.3, jz = (rngL() - 0.5) * 0.3;
    const rec = G.loot.spawn({ material: MATS[mi], size, pos: { x: x + 0.5 + jx, y: (HC ? HC[y * W + x] : 0) + topY + half * 1.3 + 0.06, z: y + 0.5 + jz }, rng: rngL });
    lootItems.push(rec);
  }
  const lootSum = lootItems.reduce((a, i) => a + i.value0, 0);
  const level = LEVELS[Math.max(0, Math.min(4, (layout.meta?.houseIndex || 1) - 1))];
  // crew = the lead plus bot mates of the running shift (run.js re-splits the same formula once the bots exist)
  const crew = G.run?.crew ?? 1;
  const quota = Math.round(quotaFor(lootSum, level, crew) / Math.max(1, padDefs.length) / 10) * 10;
  const pads = padDefs.map((p) => ({ x: p.fx, z: p.fy, y: p.py || 0, half: padHalf, quota, order: p.order, roomId: p.roomId }));

  // ---- lights
  scene.background = new THREE.Color(T.fog[0]);
  scene.fog = new THREE.FogExp2(T.fog[0], T.fog[1] * 0.6);
  const hemiBase = T.ambient[2] * 6 * bright0 * night.hemi;
  const hemi = new THREE.HemisphereLight(T.ambient[0], T.ambient[1], hemiBase); root.add(hemi);
  let dim = 1;   // escape phase: lamps and ambient fall to this factor (run.js)
  const setDim = (k) => { dim = k; hemi.intensity = hemiBase * k * fillK; };
  const POOL = 8, SHADOW = 2;
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 12, 2);
    if (i < SHADOW) { l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.003; l.shadow.camera.near = 0.2; l.shadow.camera.far = 14; }
    l.userData = { lamp: -1, k: 0 };
    root.add(l); pool.push(l);
  }
  const padLight = new THREE.PointLight(0x40ffa0, 1.4, 5, 2); root.add(padLight);
  let lastLampUpdate = 0;
  function updateLights(pos, dt) {
    const sc = lamps.map((l, i) => [i, (l.x - pos.x) ** 2 + (l.z - pos.z) ** 2 + 2 * (l.y - 1.6 - pos.y) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, POOL);
    const want = new Set(sc.map((s) => s[0]));
    const free = pool.filter((l) => !want.has(l.userData.lamp));
    for (const [i] of sc) if (!pool.some((l) => l.userData.lamp === i)) { const l = free.shift(); if (l) { l.userData.lamp = i; l.userData.k = 0; } }
    for (const l of pool) {
      const L = lamps[l.userData.lamp];
      if (!L || !want.has(l.userData.lamp)) { l.userData.k = Math.max(0, l.userData.k - dt * 3); if (l.userData.k <= 0) { l.intensity = 0; l.userData.lamp = -1; continue; } }
      else l.userData.k = Math.min(1, l.userData.k + dt * 2.5);
      const Lm = lamps[l.userData.lamp]; if (!Lm) continue;
      l.position.set(Lm.x, Lm.y, Lm.z); l.color.setHex(Lm.color); l.distance = Lm.d; l.intensity = Lm.i * bright * dim * l.userData.k * (Lm.y > FLOOR_DY - 0.5 ? FT[2 + 1] : Lm.y < -0.5 ? FT[2] : 1) * (G.lights ? G.lights.lampK(l.userData.lamp, Lm) : 1);
    }
  }

  // ---- per-frame
  let tNow = 0;
  function step(dt, pos, others = []) {
    for (const d of doorList) {
      if (d.jammed) continue;
      // nearest opener of THIS door; a local, so the next door measures from the player again
      let who = pos, dist = Math.hypot(pos.x - d.cx, pos.z - d.cz);
      for (const o of others) {
        const od = Math.hypot(o.x - d.cx, o.z - d.cz);
        if (od < dist) { dist = od; who = o; }
      }
      if (dist < 2.6 && d.target === 0) {
        d.target = 1;
        if (d.open === 0) {
        G.events?.emit('door:open', { x: d.cx, z: d.cz });
        // swing away from the player: side of the door plane by the walk axis
        const along = d.door.dir === 0 ? who.x - d.cx : who.z - d.cz;
        d.side = along >= 0 ? -1 : 1;
        }
      } else if (dist > 3.4 && d.target === 1) d.target = 0;
      const goal = d.target ? 1.75 : 0;
      if (d.open !== goal) {
        const sp = 3.2 * dt;
        d.open = d.open < goal ? Math.min(goal, d.open + sp) : Math.max(goal, d.open - sp);
        for (const lf of d.leaves) {
          // rotating the leaf direction e by theta about Y gives derivative (ez, -ex); choose the sign that moves it along n
          const nx = d.door.dir === 0 ? d.side : 0, nz = d.door.dir === 0 ? 0 : d.side;
          const sgn = Math.sign(lf.ez * nx - lf.ex * nz) || 1;
          lf.theta = d.open * sgn;
          lf.pivot.rotation.y = lf.theta;
          lf.body.setNextKinematicRotation(quatY(lf.theta));
        }
      }
    }
    tNow += dt;
  }
  let lastT = performance.now();
  // ambient fill by the floor the camera is on (tools/floors.js shots gate the frame mean 30-55 on every floor): the
  // basement has no ceiling lamps, only bulbs, so it gets a little more fill; the upper floor has moonlit windows
  // per theme: [basement fill, upper fill, basement lamps, upper lamps]
  const FT = { vampire: [2.6, 0.98, 1.6, 1], pyramid: [1.75, 0.62, 1.1, 1], vietnam: [0.95, 0.48, 1, 0.6], spacestation: [2.7, 1.9, 1.4, 1.7], asylum: [1.35, 0.55, 1, 0.6] }[theme] || [1.35, 0.62, 1, 1];
  const FLOOR_FILL = { '-1': FT[0], 0: 1, 1: FT[1] };
  let fillK = 1;
  function update(camPos) {
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (FL) { const cx = Math.floor(camPos.x), cz = Math.floor(camPos.z); const lv = cx >= 0 && cz >= 0 && cx < W && cz < Hh ? FL[cz * W + cx] : 0; const k = FLOOR_FILL[lv] ?? 1; if (k !== fillK) { fillK = k; hemi.intensity = hemiBase * dim * fillK; } }
    updateLights(camPos, dt);
    const ex = G.extract;
    if (ex) {
      for (let i = 0; i < padMeshes.length; i++) {
        const p = ex.pads[i], m = padMeshes[i].material;
        if (!p) continue;
        const act = i === ex.active, done = p.done;
        m.emissiveIntensity = done ? 0.04 : act ? 0.9 + 0.3 * Math.sin(now / 300) : 0.12;
        m.color.setHex(done ? 0x222a26 : act ? 0x1c5a40 : 0x1a2a24);
      }
      const ap = ex.pads[ex.active];
      if (ap && !ap.done) { padLight.position.set(ap.x, (ap.y || 0) + 0.7, ap.z); padLight.intensity = 1.6; } else padLight.intensity = 0;
    }
  }

  // ---- spawn: truck room start cell facing the first door of the truck room
  const st = layout.start;
  let yaw = 0;
  const td = layout.doors.find((d) => d.a === 0 || d.b === 0);
  if (td) { const dx = td.x0 + td.zw / 2 - (st.x + 0.5), dz = td.y0 + td.zh / 2 - (st.y + 0.5); yaw = Math.atan2(-dx, -dz); }
  const spawn = { x: st.x + 0.5, z: st.y + 0.5, yaw };

  stats.buildMs = performance.now() - t0;
  stats.loot = lootItems.length; stats.lootValue = lootSum; stats.quota = quota; stats.lamps = lamps.length;
  try { stats.worldColliders = phys.world.colliders.len(); } catch (e) { /* older api */ }

  // Removing a Rapier body twice panics inside wasm and leaves the world borrowed: every later call then throws
  // "recursive use of an object". dispose() must therefore run its removals once only.
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    for (const b of bodies) phys.world.removeRigidBody(b);
    bodies.length = 0;
    for (const d of disposables) d.dispose?.();
    for (const it of lootItems) if (!it.dead) G.loot.destroy(it, false);
  }

  /** Pick's unlock: every jammed door within r of (x, z) becomes a normal swing door. Returns how many. */
  function unjam(x, z, r) {
    let n = 0;
    for (const d of doorList) {
      if (!d.jammed || Math.hypot(d.cx - x, d.cz - z) > r) continue;
      d.jammed = false; d.door.jammed = false;
      for (const lf of d.leaves) lf.body.setBodyType(phys.R.RigidBodyType.KinematicPositionBased, true);
      if (d.bars) { root.remove(d.bars); d.bars = null; }
      n++;
    }
    return n;
  }
  const jammedNear = (x, z, r) => doorList.filter((d) => d.jammed && Math.hypot(d.cx - x, d.cz - z) <= r).length;

  return {
    unjam, jammedNear, doorRecs: doorList,
    props: propRecs.map((r) => ({ cat: r.cls.cat, n: r.cls.n, x: r.cx, z: r.cz, w: r.p.w, d: r.p.h, h: r.cls.h, blocks: !!r.p.blocks, q: r.q ?? 0 })),
    spawn, pads, rooms: roomInfo, doors: doorList.map((d) => ({ x: d.cx, z: d.cz, dir: d.door.dir, jammed: d.jammed, a: d.door.a, b: d.door.b })),
    step, update, dispose, stats, layout, theme, lamps, setDim, root,
    levels, stairCols, heightAt: (x, z) => floorHeightAt(layout, x, z), floorAt: (x, z) => (FL ? FL[Math.floor(z) * W + Math.floor(x)] || 0 : 0),
  };
}
