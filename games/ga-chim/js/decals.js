// Stencil markings drawn on canvases: wagon reporting marks, data panels, hazard plates, container codes, signs.
import * as THREE from '../vendor/three.module.min.js';
import { rng } from './rng.js';
import { noMask } from './mats.js';

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const texCache = new Map();

function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  // weathering: knock out specks so the paint looks sprayed and worn
  const id = g.getImageData(0, 0, w, h); const r = rng(key);
  for (let i = 0; i < id.data.length; i += 4) {
    if (id.data[i + 3] > 0) {
      const n = r();
      if (n < 0.06) id.data[i + 3] = 0; else if (n < 0.25) id.data[i + 3] *= 0.7;
    }
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  texCache.set(key, t); return t;
}

function stencil(g, text, x, y, size, color, align, weight) {
  g.font = `${weight || 700} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align || 'left'; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

const decalMats = new Map();
function decalMat(tex, rough) {
  const key = tex.uuid + rough;
  if (decalMats.has(key)) return decalMats.get(key);
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: false, alphaTest: 0.35, roughness: rough ?? 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, color: 0xb8b8b8 });
  noMask(m); decalMats.set(key, m); return m;
}
function plane(group, tex, w, h, m4, rough) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(tex, rough));
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(m4); mesh.receiveShadow = true;
  group.add(mesh); return mesh;
}

export function wagonTex(seed, mark) {
  const r = rng('w' + seed);
  const num = mark || `${r.int(10, 99)} ${r.int(100, 999)} ${r.int(1000, 9999)}-${r.int(1, 9)}`;
  return canvasTex('wagon' + num, 1024, 256, (g, w, h) => {
    stencil(g, 'ĐSVN', 30, 70, 74, '#e9e4d6');
    stencil(g, num, 30, 150, 56, '#e9e4d6');
    stencil(g, 'TẢI TRỌNG 52 T   TỰ TRỌNG 23.4 T', 30, 210, 26, '#d8d2c2', 'left', 600);
    g.strokeStyle = '#e9e4d6'; g.lineWidth = 4; g.strokeRect(700, 40, 290, 150);
    stencil(g, 'GA CHÌM — KHO 7', 845, 80, 30, '#e9e4d6', 'center', 700);
    stencil(g, 'KIỂM TRA 03.2041', 845, 125, 26, '#d8d2c2', 'center', 600);
    stencil(g, 'Ⓡ  14.6 m', 845, 165, 26, '#d8d2c2', 'center', 600);
  });
}
function containerTex(seed) {
  const r = rng('c' + seed);
  const owners = ['GCHU', 'TRLU', 'MSKU', 'SLNU', 'VNLU', 'HCMU'];
  const code = `${r.pick(owners)} ${r.int(100000, 999999)} ${r.int(0, 9)}`;
  return canvasTex('cont' + code, 512, 256, (g) => {
    stencil(g, code, 24, 52, 46, '#f1ede2');
    stencil(g, '22G1', 24, 104, 38, '#f1ede2');
    stencil(g, 'MAX GROSS 30,480 KG', 24, 170, 22, '#e2ddd0', 'left', 600);
    stencil(g, 'TARE 2,230 KG', 24, 200, 22, '#e2ddd0', 'left', 600);
  });
}
function containerLogo(seed) {
  const r = rng('L' + seed);
  const names = ['TRANSOCEANIC', 'SÔNG HỒNG', 'NAM HẢI LINE', 'BẮC NAM', 'ĐÔNG DƯƠNG'];
  const n = r.pick(names);
  return canvasTex('logo' + n, 1024, 256, (g) => {
    g.strokeStyle = '#f2eee4'; g.lineWidth = 14; g.beginPath(); g.arc(120, 128, 80, 0.5, 5.8); g.stroke();
    stencil(g, n, 240, 132, 120, '#f2eee4', 'left', 700);
  });
}
function hazardTex() {
  return canvasTex('haz', 256, 256, (g) => {
    g.save(); g.translate(128, 128); g.rotate(Math.PI / 4);
    g.fillStyle = '#d23a1e'; g.fillRect(-80, -80, 160, 160); g.strokeStyle = '#f2eee4'; g.lineWidth = 8; g.strokeRect(-70, -70, 140, 140);
    g.rotate(-Math.PI / 4); stencil(g, '3', 0, 40, 60, '#f2eee4', 'center'); stencil(g, '🔥', 0, -24, 60, '#f2eee4', 'center');
    g.restore();
  });
}
function signTex(text) {
  return canvasTex('sign' + text, 1024, 256, (g, w, h) => {
    g.fillStyle = '#1f3d2b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e9e4d6'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
    stencil(g, text, w / 2, h / 2 + 6, 140, '#e9e4d6', 'center', 700);
  });
}
function stripeTex() {
  return canvasTex('stripe', 512, 64, (g, w, h) => {
    for (let i = -2; i < 20; i++) { g.fillStyle = i % 2 ? '#e2b52a' : '#141414'; g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 32, h); g.lineTo(i * 32 + 64, 0); g.lineTo(i * 32 + 32, 0); g.fill(); }
  });
}

export function buildDecals(list, group) {
  const M = (m, x, y, z, ry) => m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z)).multiply(new THREE.Matrix4().makeRotationY(ry || 0));
  for (const d of list) {
    if (d.kind === 'wagon') {
      const s = d.side;
      const t = wagonTex(d.seed, d.mark);
      const w = d.small ? 4.2 : 5.6;
      plane(group, t, w, w / 4, M(d.m, s * 1.585, d.y0 + d.h * 0.42, s * -d.len * 0.22, s * Math.PI / 2));
    } else if (d.kind === 'tank') {
      const s = d.side;
      plane(group, wagonTex(d.seed), 4.2, 1.05, M(d.m, s * (d.R + 0.03), d.y, -2.6 * s, s * Math.PI / 2));
      plane(group, hazardTex(), 0.6, 0.6, M(d.m, s * (d.R + 0.03), d.y + 0.15, 3.4 * s, s * Math.PI / 2));
    } else if (d.kind === 'container') {
      for (const s of [-1, 1]) {
        plane(group, containerLogo(d.seed), 3.6, 0.9, M(d.m, s * (d.w / 2 + 0.02), d.h * 0.62, 0, s * Math.PI / 2), 0.5);
      }
      plane(group, containerTex(d.seed), 1.2, 0.6, M(d.m, 0.55, d.h * 0.82, d.l / 2 + 0.14, 0), 0.5);
    } else if (d.kind === 'sign') {
      plane(group, signTex(d.text), d.w, d.h, d.m, 0.6);
    } else if (d.kind === 'loco') {
      for (const s of [-1, 1]) plane(group, stripeTex(), 12, 0.35, M(d.m, s * 1.165, 1.95, -2.8, s * Math.PI / 2), 0.4);
      plane(group, signTex('D19E-962'), 1.6, 0.4, M(d.m, 0, 4.25, 6.75, 0), 0.5);
    }
  }
}
