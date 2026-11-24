// Body plans, one per family (SCOPE section 3): each lays the skeleton and the base body on a Kit and returns the
// anchors the form files hang their parts on. All beasts are chibi: a head as wide as the body, short legs.
// Model space: +z forward, y up, sizes before the height fit (index.js scales the finished beast).
import { shade, tint } from './kit.js?v=20261124a';

// default palette from one colour
export function palette(hex, o = {}) {
  return { body: hex, belly: tint(hex, 0xfff4e0, 0.55), dark: shade(hex, 0.35), snout: tint(hex, 0xfff0e0, 0.4), accent: o.accent ?? tint(hex, 0xffffff, 0.3), ...o };
}

// ---- quad: four legs ----
// o: { len, rx, ry, n, leg, legR, hr, neck, headUp, snout:[w,h,l], ears:'round'|'pointy'|'long'|'none', earK, tail:{...}|null, pal }
export function quad(K, o = {}) {
  const P = o.pal; const L = o.len ?? 0.8; const rx = o.rx ?? 0.3; const ry = o.ry ?? 0.27; const n = o.n ?? 2.3;
  const leg = o.leg ?? 0.3; const legR = o.legR ?? 0.085; const hr = o.hr ?? 0.34;
  const hipY = leg + ry * 0.7; const cz = L * 0.3; const chestUp = o.chestUp ?? 0.03;
  K.bone('body', 'root', [0, hipY, 0]);
  K.bone('chest', 'body', [0, hipY + chestUp, cz]); K.bone('hip', 'body', [0, hipY, -cz]);
  const nk = [0, hipY + ry * 0.55 + (o.neck ?? 0.05), L * 0.48];
  K.bone('neck', 'chest', nk);
  const hd = [0, nk[1] + hr * 0.55 + (o.headUp ?? 0.06), nk[2] + hr * 0.42];
  K.bone('head', 'neck', hd);
  const bel = P.belly;
  K.tube([
    { p: [0, hipY + 0.03, -L * 0.52], rx: rx * 0.55, ry: ry * 0.55, bone: 'hip' },
    { p: [0, hipY, -cz], rx: rx * 0.98, ry: ry * 0.96, bone: 'hip' },
    { p: [0, hipY + 0.01, 0], rx: rx, ry: ry, bone: 'body' },
    { p: [0, hipY + chestUp + 0.01, cz], rx: rx * (o.chestK ?? 1.05), ry: ry * (o.chestK ?? 1.05), bone: 'chest' },
    { p: [0, hipY + chestUp + ry * 0.35, L * 0.48], rx: rx * 0.62, ry: ry * 0.6, bone: 'neck' },
  ], { col: P.body, belly: bel, n });
  // a long neck gets its own tube from the shoulders into the head, so the head never floats off the body
  if ((o.neck ?? 0.05) > 0.06) K.tube([{ p: [0, nk[1] - ry * 0.25, nk[2] - 0.04], rx: rx * 0.55, ry: ry * 0.5, bone: 'neck' }, { p: [0, hd[1] - hr * 0.45, hd[2] - hr * 0.15], rx: hr * 0.42, bone: 'head' }], { col: P.body, belly: bel, n });
  // head: wide rounded box, a snout, a nose, cheeks
  const [hx, hy, hz] = hd;
  K.blob('head', hd, [hr * 1.06, hr * 0.94, hr * 0.92], { col: P.body, n: o.headN ?? 2.4, colAt: (t) => (t > 0.55 ? P.snout : P.body) });
  const sn = o.snout ?? [0.55, 0.42, 0.45];
  const snz = hz + hr * 0.7; const sny = hy - hr * 0.3;
  K.blob('head', [hx, sny, snz], [hr * sn[0], hr * sn[1], hr * sn[2]], { col: P.snout, n: 2.2 });
  K.mouth = [hx, sny, snz + hr * sn[2]];
  K.blob('head', [hx, sny + hr * sn[1] * 0.55, snz + hr * sn[2] * 0.85], [hr * 0.16, hr * 0.11, hr * 0.1], { col: P.dark });
  K.eyes('head', [hr * 0.5, hy + hr * 0.12, hz + hr * 0.68], hr * (o.eyeK ?? 0.26), { iris: o.iris, yaw: 0.42, brow: shade(P.body, 0.45) });
  for (const s of [-1, 1]) K.blob('head', [s * hr * 0.72, sny + hr * 0.06, hz + hr * 0.55], [hr * 0.15, hr * 0.09, hr * 0.06], { col: tint(P.body, 0xff7080, 0.5), steps: 4, seg: 8 });
  // ears on spring bones
  const ears = o.ears ?? 'round'; const ek = o.earK ?? 1;
  if (ears !== 'none') for (const s of [-1, 1]) {
    const base = [s * hr * 0.62, hy + hr * 0.62, hz - hr * 0.15];
    const tipUp = ears === 'long' ? 0.55 : ears === 'pointy' ? 0.42 : 0.26;
    const tip = [s * hr * (ears === 'long' ? 1.2 : 0.9), hy + hr * (0.62 + tipUp * ek), hz - hr * (ears === 'long' ? 0.35 : 0.2)];
    const nm = K.chain(s < 0 ? 'earR' : 'earL', 'head', [base], 'ear')[0];
    const w = hr * (ears === 'round' ? 0.26 : 0.2) * ek;
    K.horn(nm, [base, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2], tip], w, { ry: w * 0.45, pow: ears === 'round' ? 0.45 : 0.8, col: P.body, tip: o.earTip ?? P.body });
  }
  // legs: two bones each, a stubby tube and a dark hoof/paw
  const legX = rx * 0.62;
  const legs = [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]];
  for (const [nm, s, f] of legs) {
    const z = f > 0 ? cz * 1.02 : -cz * 1.0; const top = hipY - ry * 0.25; const knee = leg * 0.5;
    const par = f > 0 ? 'chest' : 'hip';
    K.bone(`leg.${nm}.0`, par, [s * legX, top, z]); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, [s * legX, knee, z + 0.01 * f]);
    K.tube([
      { p: [s * legX, top + 0.05, z], rx: legR * 1.35, bone: `leg.${nm}.0` },
      { p: [s * legX, knee, z], rx: legR, bone: `leg.${nm}.1` },
      { p: [s * legX, 0.06, z + 0.01], rx: legR * (o.pawK ?? 1.05), bone: `leg.${nm}.1` },
    ], { col: o.legCol ?? P.body, n: 2.2 });
    K.blob(`leg.${nm}.1`, [s * legX, 0.04, z + 0.025], [legR * (o.pawK ?? 1.1) * 1.05, 0.045, legR * 1.25 * (o.pawK ?? 1)], { col: o.hoof ?? P.dark, n: 2.6, steps: 4 });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: f > 0, side: s });
  }
  // tail: a spring chain from the rump
  let tail = null;
  if (o.tail) {
    const T = o.tail; const segs = T.segs ?? 4; const len = T.len ?? 0.4; const up = T.up ?? 0.4;
    const z0 = -L * 0.5; const y0 = hipY + ry * 0.2; const pts = [];
    for (let i = 0; i < segs; i++) { const k = i / segs; pts.push([0, y0 + Math.sin(k * 1.4) * len * up, z0 - k * len * (1 - up * 0.3)]); }
    tail = K.chain('tail', 'hip', pts, 'tail', T.stiff ?? 1);
    const end = [0, y0 + Math.sin(1.4) * len * up, z0 - len * (1 - up * 0.3)];
    K.tube([...pts.map((p, i) => ({ p, rx: (T.r ?? 0.06) * (1 - (i / segs) * (1 - (T.taper ?? 0.4))), bone: tail[i] })), { p: end, rx: (T.r ?? 0.06) * (T.taper ?? 0.4), bone: tail[segs - 1] }], { col: T.col ?? P.body, n: T.n ?? 2 });
    tail.end = end;
  }
  return { hipY, L, rx, ry, hr, head: hd, neck: nk, cz, leg, legR, tail, top: hipY + ry, P };
}

// ---- generic placeholders for the families whose beasts W-creature-2 draws (dạng 1 look from def.color) ----
export function bird(K, P) {
  K.bone('body', 'root', [0, 0.42, 0]); K.bone('chest', 'body', [0, 0.45, 0.1]); K.bone('hip', 'body', [0, 0.4, -0.12]);
  K.bone('neck', 'chest', [0, 0.62, 0.08]); K.bone('head', 'neck', [0, 0.8, 0.1]);
  K.blob('body', [0, 0.45, 0], [0.32, 0.34, 0.33], { col: P.body, colAt: (t) => (t > 0.4 ? P.belly : P.body) });
  K.blob('head', [0, 0.8, 0.1], [0.3, 0.27, 0.27], { col: P.body, n: 2.3 });
  K.horn('head', [[0, 0.76, 0.34], [0, 0.72, 0.42], [0, 0.68, 0.46]], 0.07, { col: 0xf0b030, ry: 0.05 });
  K.eyes('head', [0.15, 0.84, 0.3], 0.085, { yaw: 0.3 });
  for (const s of [-1, 1]) {
    const nm = s < 0 ? 'wingR' : 'wingL'; K.bone(nm, 'chest', [s * 0.28, 0.55, 0.05]);
    K.fin(nm, [s * 0.28, 0.55, 0.05], [s, 0, 0], [0, -0.3, -1], [[0, 0], [0.32, 0.1], [0.42, 0.32], [0.1, 0.42]], 0.05, shade(P.body, 0.8));
    K.roles.wings.push({ bone: nm, side: s, rest: -0.2, open: 0.2 });
    const lg = s < 0 ? 'leg.FR' : 'leg.FL'; K.bone(lg + '.0', 'hip', [s * 0.12, 0.18, 0]); K.bone(lg + '.1', lg + '.0', [s * 0.12, 0.1, 0]);
    K.horn(lg + '.0', [[s * 0.12, 0.2, 0], [s * 0.12, 0.1, 0], [s * 0.12, 0.02, 0.05]], 0.04, { col: 0xf0b030, pow: 0 });
    K.roles.legs.push({ up: lg + '.0', low: lg + '.1', front: true, side: s });
  }
  return { legLen: 0.18 };
}
export function reptile(K, P) {
  const g = quad(K, { pal: P, len: 1.0, rx: 0.26, ry: 0.2, leg: 0.16, legR: 0.07, hr: 0.3, neck: 0.0, headUp: 0.0, snout: [0.7, 0.4, 0.75], ears: 'none', tail: { len: 0.7, r: 0.12, up: 0.05, segs: 5, taper: 0.15 } });
  K.spikes('body', [0, g.hipY + 0.05, 0], [0.18, 0.2, 0.5], 8, 0.09, { keep: (nm) => nm.y > 0.8, col: P.accent });
  return { legLen: 0.16 };
}
export function amphib(K, P) {
  const g = quad(K, { pal: P, len: 0.55, rx: 0.36, ry: 0.28, leg: 0.16, legR: 0.08, hr: 0.38, neck: -0.05, headUp: -0.05, snout: [0.9, 0.35, 0.35], ears: 'none', eyeK: 0.34 });
  void g; return { legLen: 0.16 };
}
export function insect(K, P) {
  K.bone('body', 'root', [0, 0.3, 0]); K.bone('chest', 'body', [0, 0.32, 0.18]); K.bone('hip', 'body', [0, 0.3, -0.2]); K.bone('neck', 'chest', [0, 0.36, 0.32]); K.bone('head', 'neck', [0, 0.4, 0.42]);
  K.blob('hip', [0, 0.32, -0.15], [0.34, 0.26, 0.38], { col: P.body, n: 2.2 });
  K.blob('chest', [0, 0.32, 0.18], [0.22, 0.18, 0.16], { col: shade(P.body, 0.8) });
  K.blob('head', [0, 0.4, 0.42], [0.24, 0.22, 0.2], { col: P.body });
  K.eyes('head', [0.12, 0.45, 0.56], 0.08, {});
  for (const s of [-1, 1]) K.horn('head', [[s * 0.08, 0.55, 0.5], [s * 0.16, 0.75, 0.6], [s * 0.22, 0.85, 0.72]], 0.02, { col: P.dark });
  const ids = [['FL', 1, 0.28], ['FR', -1, 0.28], ['BL', 1, 0.05], ['BR', -1, 0.05], ['ML', 1, 0.16], ['MR', -1, 0.16]];
  for (const [nm, s, z] of ids) {
    K.bone(`leg.${nm}.0`, 'chest', [s * 0.16, 0.3, z]); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, [s * 0.34, 0.26, z]);
    K.horn([`leg.${nm}.0`, `leg.${nm}.1`, `leg.${nm}.1`], [[s * 0.16, 0.3, z], [s * 0.34, 0.3, z], [s * 0.4, 0.02, z]], 0.035, { col: P.dark, pow: 0.3 });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: nm[0] === 'F', side: s });
  }
  return { legLen: 0.2 };
}
export function fish(K, P) {
  K.bone('body', 'root', [0, 0.5, 0]); K.bone('chest', 'body', [0, 0.5, 0.15]); K.bone('hip', 'body', [0, 0.5, -0.15]); K.bone('neck', 'chest', [0, 0.52, 0.3]); K.bone('head', 'neck', [0, 0.54, 0.35]);
  K.blob('body', [0, 0.5, 0], [0.5, 0.12, 0.42], { col: P.body, n: 2.2, colAt: (t) => (t > 0.5 ? P.belly : P.body) });
  K.eyes('head', [0.12, 0.6, 0.32], 0.07, { yaw: 0.2 });
  for (const s of [-1, 1]) { const nm = s < 0 ? 'wingR' : 'wingL'; K.bone(nm, 'body', [s * 0.3, 0.5, 0]); K.fin(nm, [s * 0.3, 0.5, 0], [s, 0, 0], [0, 0, 1], [[0, -0.3], [0.45, -0.1], [0.2, 0.3], [0, 0.3]], 0.04, shade(P.body, 0.85)); K.roles.wings.push({ bone: nm, side: s, rest: 0, open: 0 }); }
  const tl = K.chain('tail', 'hip', [[0, 0.5, -0.4], [0, 0.5, -0.6], [0, 0.5, -0.8]], 'tail');
  K.horn(tl, [[0, 0.5, -0.4], [0, 0.5, -0.7], [0, 0.5, -1.0]], 0.04, { col: P.dark });
  return { legLen: 0.2 };
}
export function mollusk(K, P) {
  K.bone('body', 'root', [0, 0.2, 0]); K.bone('chest', 'body', [0, 0.2, 0.2]); K.bone('hip', 'body', [0, 0.2, -0.2]); K.bone('neck', 'chest', [0, 0.3, 0.35]); K.bone('head', 'neck', [0, 0.38, 0.42]);
  K.tube([{ p: [0, 0.12, -0.45], rx: 0.12, ry: 0.06, bone: 'hip' }, { p: [0, 0.15, 0], rx: 0.22, ry: 0.13, bone: 'body' }, { p: [0, 0.3, 0.38], rx: 0.18, ry: 0.2, bone: 'head' }], { col: P.belly });
  K.blob('body', [0, 0.45, -0.1], [0.3, 0.34, 0.32], { col: P.body, n: 2.2 });
  K.torus('body', [0, 0.45, -0.1], 0.18, 0.08, { rot: [0, Math.PI / 2, 0], col: shade(P.body, 0.8) });
  K.eyes('head', [0.1, 0.42, 0.52], 0.07, {});
  for (const s of [-1, 1]) { const ch = K.chain(s < 0 ? 'antR' : 'antL', 'head', [[s * 0.07, 0.48, 0.45], [s * 0.1, 0.62, 0.5]], 'ear'); K.horn([ch[0], ch[1], ch[1]], [[s * 0.07, 0.48, 0.45], [s * 0.1, 0.62, 0.5], [s * 0.12, 0.72, 0.55]], 0.025, { col: P.belly, tip: P.accent }); }
  return { legLen: 0.2 };
}
