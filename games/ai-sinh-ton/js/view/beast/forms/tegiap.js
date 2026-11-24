// Tê Giáp (tank, earth): a chubby rhino calf that grows shields, then either a mossy fortress on its back or a spiked
// armour ball (SCOPE 3.1 #1).
import { quad, palette } from '../families.js?v=20261124a';
import { shade } from '../kit.js?v=20261124a';

const P0 = palette(0xa89480, { belly: 0xeadfca, snout: 0xcdbca6, dark: 0x4a3a30, plate: 0xe8ac3c, horn: 0xf6ecd4, ear: 0xd09a90 });

function rhinoHorn(K, g, len, r, col, back = 0) {
  const [, hy, hz] = g.head; const y = hy + g.hr * 0.12; const z = hz + g.hr * (1.02 - back);
  K.horn('head', [[0, y - 0.02, z], [0, y + len * 0.5, z + len * 0.12], [0, y + len, z - len * 0.12]], r, { col, pow: 0.9 });
}
function plate(K, bone, c, r, rz, col, rivet) {
  K.blob(bone, c, r, { col, n: 3.2, rot: [0, 0, rz], steps: K.hi ? 10 : 6 });
  if (rivet) for (const dz of [-0.6, 0, 0.6]) K.blob(bone, [c[0] + Math.sign(c[0]) * r[1] * 0.9, c[1] + r[1] * 0.4, c[2] + dz * r[2]], [0.022, 0.022, 0.022], { col: rivet, steps: 3, seg: 6 });
}

export default {
  'tegiap.1': {
    height: 1.05, move: 'walk', attack: 'butt',
    build(K) {
      const P = P0;
      const g = quad(K, { pal: P, len: 0.72, rx: 0.34, ry: 0.3, n: 2.6, leg: 0.22, legR: 0.1, hr: 0.34, snout: [0.72, 0.5, 0.6], ears: 'round', earK: 0.7, neck: 0, headUp: 0.02, tail: { len: 0.2, r: 0.045, up: 0.6, segs: 3, taper: 0.5 } });
      rhinoHorn(K, g, 0.2, 0.075, P.horn);
      for (const s of [-1, 1]) plate(K, 'chest', [s * g.rx * 0.78, g.hipY + g.ry * 0.5, g.cz], [0.17, 0.055, 0.19], s * 0.75, P.plate);
      K.blob(g.tail[2], g.tail.end, [0.06, 0.06, 0.07], { col: P.dark, steps: 4 });
      return { legLen: g.leg };
    },
  },
  'tegiap.2': {
    height: 1.2, move: 'gallop', attack: 'butt',
    build(K) {
      const P = P0;
      const g = quad(K, { pal: P, len: 0.9, rx: 0.38, ry: 0.33, n: 2.7, leg: 0.28, legR: 0.12, hr: 0.36, snout: [0.75, 0.5, 0.64], ears: 'round', earK: 0.6, tail: { len: 0.48, r: 0.07, up: 0.35, segs: 4, taper: 0.55 } });
      rhinoHorn(K, g, 0.34, 0.09, P.horn); rhinoHorn(K, g, 0.15, 0.06, P.horn, 0.45);
      // curved shields over the shoulders, riveted
      for (const s of [-1, 1]) plate(K, 'chest', [s * g.rx * 0.92, g.hipY + g.ry * 0.3, g.cz + 0.02], [0.26, 0.06, 0.34], s * 1.05, P.plate, 0x7a5420);
      // a ridge of plates down the back
      [['hip', -0.3], ['body', -0.04], ['chest', 0.22]].forEach(([b, z], i) => K.blob(b, [0, g.top + 0.01, z], [0.22 - i * 0.02, 0.06, 0.13], { col: shade(P.plate, 0.85), n: 3, rot: [0.2, 0, 0] }));
      // club tail: a stone ball with studs
      const end = g.tail.end; const last = g.tail[3];
      K.blob(last, end, [0.13, 0.12, 0.14], { col: 0x6a5a4c, n: 2.2 });
      K.spikes(last, end, [0.12, 0.11, 0.13], 7, 0.08, { col: P.horn, r: 0.035 });
      return { legLen: g.leg };
    },
  },
  'tegiap.3a': {
    height: 1.5, move: 'stomp', attack: 'butt',
    build(K) {
      const P = { ...P0, body: 0x988f84, belly: 0xd8cfbe, moss: 0x62a83e, moss2: 0x86c850, stone: 0xbcb09a };
      const g = quad(K, { pal: P, len: 1.0, rx: 0.42, ry: 0.34, n: 2.8, leg: 0.3, legR: 0.14, hr: 0.36, snout: [0.78, 0.52, 0.64], ears: 'round', earK: 0.5, tail: { len: 0.3, r: 0.07, up: 0.3, segs: 3, taper: 0.5 } });
      const [, hy, hz] = g.head;
      // crystal horn
      K.crystal('head', [0, hy + g.hr * 0.1, hz + g.hr * 1.0], [0, 1, 0.35], 0.36, 0.08, 0x7ff0d0, { sides: 6 });
      K.crystal('head', [0, hy + g.hr * 0.5, hz + g.hr * 0.45], [0, 1, 0.1], 0.16, 0.05, 0x7ff0d0);
      // the tower: a plinth on the back, a round keep, battlements, a lit window and a beacon crystal on top
      // a square keep of stacked stone courses, corner turrets with battlements, lit arrow slits, a beacon crystal
      const by = g.top + 0.04; const tz = -0.08;
      K.blob('body', [0, by, tz], [0.34, 0.1, 0.4], { col: P.stone, n: 4 });
      for (let i = 0; i < 3; i++) K.blob('body', [0, by + 0.14 + i * 0.13, tz], [0.25 - i * 0.012, 0.07, 0.27 - i * 0.012], { col: i % 2 ? shade(P.stone, 0.86) : P.stone, n: 5 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * 0.22; const z = tz + sz * 0.24;
        K.blob('body', [x, by + 0.36, z], [0.085, 0.24, 0.085], { col: shade(P.stone, 0.95), n: 3, rot: [-Math.PI / 2, 0, 0] });
        K.blob('body', [x, by + 0.6, z], [0.11, 0.05, 0.11], { col: P.stone, n: 4, steps: 4 });
        K.horn('body', [[x, by + 0.62, z], [x, by + 0.7, z], [x, by + 0.8, z]], 0.08, { col: 0x8a5a3a, seg: 4 });
      }
      for (const [x, y, z] of [[0, by + 0.3, tz + 0.27], [0.25, by + 0.2, tz], [-0.25, by + 0.2, tz], [0, by + 0.44, tz + 0.26]]) K.blob('body', [x, y, z], [x ? 0.02 : 0.04, 0.06, z > tz ? 0.02 : 0.04], { col: 0xffd860, buf: 'glow', n: 3, steps: 4 });
      K.crystal('body', [0, by + 0.5, tz], [0, 1, 0], 0.34, 0.09, 0x7ff0d0, { sides: 6 });
      // moss: lumps hanging over the plinth edge, on the shoulders and the crown of the head
      const moss = [[0.3, by - 0.02, 0.18], [-0.31, by - 0.03, 0.05], [0.28, by - 0.02, -0.3], [-0.24, by, -0.34], [0, by + 0.05, 0.32], [0.2, by + 0.5, -0.32], [-0.22, by + 0.42, 0.14], [0.05, by + 0.4, tz - 0.27]];
      moss.forEach((c, i) => K.blob('body', c, [0.11, 0.06, 0.1], { col: i % 2 ? P.moss : P.moss2, steps: 4 }));
      for (const s of [-1, 1]) { plate(K, 'chest', [s * g.rx * 0.92, g.hipY + g.ry * 0.3, g.cz], [0.24, 0.07, 0.3], s * 1.0, 0xa89c88); K.blob('chest', [s * g.rx * 0.95, g.hipY + g.ry * 0.62, g.cz], [0.12, 0.05, 0.14], { col: P.moss2, steps: 4 }); }
      K.blob('head', [0, hy + g.hr * 0.8, hz - g.hr * 0.2], [0.14, 0.05, 0.12], { col: P.moss, steps: 4 });
      return { legLen: g.leg };
    },
  },
  'tegiap.3b': {
    height: 1.15, move: 'roll', attack: 'butt', ball: true, ballR: 0.5,
    build(K) {
      const P = { ...P0, a: 0xe0a238, b: 0x9a6e3a };
      K.bone('body', 'root', [0, 0.5, 0]); K.bone('chest', 'body', [0, 0.5, 0.2]); K.bone('hip', 'body', [0, 0.5, -0.2]);
      K.bone('neck', 'chest', [0, 0.36, 0.38]); K.bone('head', 'neck', [0, 0.36, 0.48]);
      // the shell: armour bands round the ball, then spikes everywhere except the face
      K.blob('body', [0, 0.5, 0], [0.5, 0.48, 0.5], { col: P.a, steps: K.hi ? 16 : 10, colAt: (t) => (Math.floor((t + 1) * 4.5) % 2 ? P.a : P.b) });
      K.spikes('body', [0, 0.5, 0], [0.5, 0.48, 0.5], K.hi ? 34 : 24, 0.2, { keep: (nm) => !(nm.z > 0.55 && nm.y < 0.3), col: P.horn, tip: 0xd84a2a, r: 0.055, vary: 0.4 });
      // the face peeking out of the front, low
      K.blob('head', [0, 0.36, 0.42], [0.22, 0.19, 0.16], { col: P.snout, n: 2.3 });
      K.blob('head', [0, 0.3, 0.55], [0.1, 0.07, 0.06], { col: P.dark });
      K.eyes('head', [0.1, 0.42, 0.54], 0.07, { yaw: 0.3 });
      K.horn('head', [[0, 0.36, 0.56], [0, 0.44, 0.62], [0, 0.52, 0.6]], 0.045, { col: P.horn });
      for (const [nm, s, f] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) {
        const x = s * 0.22; const z = f * 0.2;
        K.bone(`leg.${nm}.0`, 'body', [x, 0.16, z]); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, [x, 0.08, z]);
        K.tube([{ p: [x, 0.18, z], rx: 0.08, bone: `leg.${nm}.0` }, { p: [x, 0.05, z + 0.02], rx: 0.07, bone: `leg.${nm}.1` }], { col: P.dark });
        K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: f > 0, side: s });
      }
      return { legLen: 0.15 };
    },
  },
};
