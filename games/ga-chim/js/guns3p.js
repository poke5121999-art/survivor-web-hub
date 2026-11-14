// Third-person rifles assembled from interchangeable parts (handguard, stock, magazine, optic, grip),
// so every raider's silhouette differs. Gun space: barrel along -Z, metres.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, extrude, lathe } from './kit.js';

function side(points, t, bevel) {
  const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1 });
  g.translate(0, 0, -t / 2); g.rotateY(Math.PI / 2); return g;
}

export function buildRifleParts(r, mats) {
  const k = new Kit();
  // receiver (always)
  k.add(side([[-0.1, 0], [0.12, 0], [0.12, 0.05], [-0.09, 0.05]], 0.034, 0.003), 'gun');
  k.add(side([[-0.09, 0], [0.1, 0], [0.09, -0.02], [0.08, -0.07], [0.03, -0.07], [0.02, -0.025], [-0.09, -0.02]], 0.032, 0.003), 'gun');
  k.box(0.022, 0.008, 0.2, 'gun', 0, 0.056, 0.0, 0.002);
  for (let i = 0; i < 18; i++) k.box(0.02, 0.004, 0.005, 'gun', 0, 0.062, 0.09 - i * 0.011, 0.001);
  k.add(side([[-0.05, -0.02], [-0.02, -0.02], [-0.045, -0.12], [-0.075, -0.12], [-0.06, -0.02]], 0.028, 0.004), 'poly');
  // handguard variants
  const hg = Math.floor(r() * 3);
  const hgLen = [0.26, 0.32, 0.2][hg];
  if (hg === 0) { k.box(0.05, 0.05, hgLen, 'gun', 0, 0.025, -0.12 - hgLen / 2, 0.012); for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) k.box(0.004, 0.012, 0.03, 'poly', sx * 0.026, 0.025, -0.15 - i * 0.055, 0.002); }
  else if (hg === 1) { k.cyl(0.03, hgLen, 'gun', 0, 0.025, -0.12 - hgLen / 2, 8, 'z'); k.box(0.02, 0.008, hgLen, 'gun', 0, 0.058, -0.12 - hgLen / 2, 0.002); }
  else { k.box(0.055, 0.055, hgLen, 'poly', 0, 0.023, -0.12 - hgLen / 2, 0.018); }
  const barrelEnd = -0.12 - hgLen - 0.1;
  k.cyl(0.0095, 0.12, 'metal', 0, 0.025, -0.12 - hgLen - 0.05, 10, 'z');
  const brake = lathe([[0, 0], [0.013, 0], [0.013, 0.05], [0, 0.05]], 12); brake.rotateX(-Math.PI / 2); brake.translate(0, 0.025, barrelEnd + 0.0);
  k.add(brake, 'metal');
  // stock variants
  const st = Math.floor(r() * 3);
  if (st === 0) { k.cyl(0.015, 0.18, 'gun', 0, 0.026, 0.19, 12, 'z'); k.add(side([[-0.2, 0.045], [-0.33, 0.05], [-0.34, -0.07], [-0.3, -0.06], [-0.22, -0.01]].map(([z, y]) => [z, y]), 0.04, 0.004), 'poly'); }
  else if (st === 1) { k.add(side([[-0.1, 0.04], [-0.32, 0.03], [-0.33, -0.08], [-0.28, -0.08], [-0.2, -0.02], [-0.1, -0.02]], 0.035, 0.004), 'poly'); }
  else { for (const sy of [0.035, -0.04]) k.cyl(0.006, 0.22, 'metal', 0, sy, 0.21, 8, 'z'); k.box(0.04, 0.11, 0.015, 'poly', 0, -0.003, 0.32, 0.004); }
  // magazine variants
  const mg = Math.floor(r() * 4);
  if (mg === 3) { for (const sx of [-1, 1]) k.cyl(0.055, 0.04, 'poly', sx * 0.03, -0.13, -0.05, 18, 'x'); k.box(0.03, 0.08, 0.05, 'poly', 0, -0.06, -0.05, 0.006); }
  else { const curve = mg === 1 ? 0.05 : mg === 2 ? 0.0 : 0.025; k.add(side([[0.03, -0.02], [0.085, -0.02], [0.09 + curve, -0.2], [0.04 + curve, -0.21]], 0.026, 0.003), 'poly'); }
  // optic variants
  const op = Math.floor(r() * 3);
  if (op === 0) { k.box(0.03, 0.035, 0.06, 'gun', 0, 0.085, 0.0, 0.005); k.box(0.034, 0.03, 0.004, 'metal', 0, 0.095, -0.03, 0.001); }
  else if (op === 1) { const tube = lathe([[0.016, -0.03], [0.018, -0.03], [0.018, 0.03], [0.016, 0.03]], 16); tube.rotateX(Math.PI / 2); tube.translate(0, 0.09, 0.0); k.add(tube, 'gun'); }
  else { k.box(0.012, 0.03, 0.01, 'gun', 0, 0.075, 0.08, 0.002); k.box(0.012, 0.03, 0.01, 'gun', 0, 0.075, -0.1, 0.002); }
  // grip variants
  const gp = Math.floor(r() * 3);
  if (gp === 0) k.add(side([[0.17, 0], [0.2, 0], [0.198, -0.09], [0.172, -0.09]], 0.026, 0.004), 'poly');
  else if (gp === 1) k.add(side([[0.15, 0], [0.24, 0], [0.2, -0.04]], 0.026, 0.003), 'poly');
  // laser / light box on the side rail
  if (r() < 0.5) k.box(0.025, 0.03, 0.06, 'poly', 0.034, 0.03, -0.2, 0.004);
  const group = k.build(mats);
  return { group, muzzleZ: barrelEnd - 0.01 };
}
