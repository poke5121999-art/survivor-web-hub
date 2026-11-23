// Đuối Băng (melee, control, ice): a little ray skimming the air with a whip tail, then frost spines down its back and
// clear fins, then a glacier ray with a vast wingspan, crystal slabs on its back and a split tail (SCOPE 3.1 #7).
import { palette } from '../families.js?v=20261122a';
import { shade } from '../kit.js?v=20261122a';

const P0 = palette(0x5aa8d8, { belly: 0xf0f8ff, dark: 0x1a3a5a, edge: 0x9ad8f4, ice: 0xb8f0ff });

// the ray body plan: a flat disc floating above the ground, wings raised in a shallow V that wave (fins role), eyes
// on top, a mouth under the front edge and a tail drooping to the ground. o: { pal, y, w, span, chord, lift, tail }
function ray(K, o) {
  const P = o.pal; const y = o.y ?? 0.55; const w = o.w ?? 0.24; const span = o.span ?? 0.5; const ch = o.chord ?? 0.34; const lift = o.lift ?? 0.35;
  K.bone('body', 'root', [0, y, 0]); K.bone('chest', 'body', [0, y + 0.01, 0.12]); K.bone('hip', 'body', [0, y - 0.01, -0.12]);
  K.bone('neck', 'chest', [0, y + 0.02, 0.22]); K.bone('head', 'neck', [0, y + 0.03, 0.26]);
  K.blob('body', [0, y, 0.02], [w, 0.11, 0.34], { col: P.body, belly: P.belly, n: 2.2 });
  K.blob('head', [0, y + 0.02, 0.22], [w * 0.8, 0.09, 0.14], { col: P.body, belly: P.belly });
  const ul = Math.hypot(1, lift);
  for (const s of [-1, 1]) {
    const nm = s < 0 ? 'wingR' : 'wingL'; const o0 = [s * w * 0.7, y + 0.01, 0.04]; K.bone(nm, 'body', o0);
    // counter-clockwise in (u, v), so the fin's faces point out
    const pts = o.wing || [[0, -ch * 0.75], [span * 0.2, -ch * 0.8], [span * 0.65, -ch * 0.5], [span, -ch * 0.1], [span * 0.5, ch * 0.45], [0, ch]];
    K.fin(nm, o0, [s / ul, lift / ul, 0], [0, 0, 1], pts, 0.07, o.wingCol ?? P.body, { edge: P.edge, buf: o.wingBuf });
    K.roles.fins.push({ bone: nm, axis: 'z', f: o.flapF ?? 3, amp: o.flap ?? 0.32, side: s });
  }
  K.eyes('head', [w * 0.5, y + 0.09, 0.26], 0.07, { yaw: 0.55, iris: o.iris });
  for (const s of [-1, 1]) K.horn('head', [[s * w * 0.55, y - 0.01, 0.3], [s * w * 0.6, y - 0.02, 0.38], [s * w * 0.5, y - 0.04, 0.42]], 0.035, { col: P.body, ry: 0.02 });
  K.torus('head', [0, y - 0.03, 0.26], 0.1, 0.012, { arc: 0.5, col: P.dark });
  K.mouth = [0, y - 0.02, 0.38];
  const T = o.tail ?? 1;
  const tp = [[0, y - 0.01, -0.28], [0, y - 0.08 * T, -0.46], [0, y - 0.24 * T, -0.6], [0, y - 0.4 * T, -0.68]];
  const tb = T ? K.chain('tail', 'hip', tp, 'tail', 0.7) : null;
  const end = [0, Math.max(0.03, y - 0.52 * T), -0.72];
  return { y, w, span, ch, tb, tp, end, lift, ul, legLen: 0.3 };
}

export default {
  'duoi.1': {
    height: 1.0, move: 'swimAir', attack: 'bite', airH: 0.35,
    build(K) {
      const P = P0;
      const g = ray(K, { pal: P });
      K.horn([...g.tb, g.tb[3]], [...g.tp, g.end], 0.04, { col: P.body, tip: P.dark, pow: 0.7 });
      for (const s of [-1, 1]) K.blob('body', [s * 0.07, g.y + 0.08, -0.06], [0.04, 0.02, 0.06], { col: P.ice, steps: 4 });
      return { legLen: g.legLen };
    },
  },
  'duoi.2': {
    height: 1.15, move: 'swimAir', attack: 'bite', airH: 0.5,
    build(K) {
      const P = { ...P0, body: 0x3a88c8, belly: 0xe8f6ff, edge: 0xd8f8ff, ice: 0xc8f4ff };
      // clear fins (the ghost mesh) on a longer body, a row of frost spines from the head to the tail
      const g = ray(K, { pal: P, w: 0.2, span: 0.56, chord: 0.36, lift: 0.5, wingBuf: 'ghost', wingCol: 0x9ad8ff, tail: 1.1, flap: 0.4 });
      K.horn([...g.tb, g.tb[3]], [...g.tp, g.end], 0.045, { col: P.body, tip: P.ice, pow: 0.7 });
      for (const s of [-1, 1]) K.fin(s < 0 ? 'wingR' : 'wingL', [s * g.w * 0.7, g.y + 0.012, 0.04], [s / g.ul, g.lift / g.ul, 0], [0, 0, 1], [[0, -0.2], [0.42, -0.04], [0.2, 0.12], [0, 0.22]], 0.03, P.body, { edge: P.edge });
      [[0.2, 0.16, 'chest'], [0.06, 0.2, 'body'], [-0.08, 0.17, 'body'], [-0.2, 0.13, 'hip'], [-0.32, 0.1, 'hip']].forEach(([z, h, b]) => K.crystal(b, [0, g.y + 0.08, z], [0, 1, -0.45], h, 0.04, P.ice, { sides: 4 }));
      for (let i = 1; i < 4; i++) { const p = g.tp[i]; K.crystal(g.tb[i], [p[0], p[1] + 0.02, p[2]], [0, 0.6, -1], 0.08, 0.025, P.ice, { sides: 4 }); }
      return { legLen: g.legLen };
    },
  },
  'duoi.3': {
    height: 1.4, move: 'fly', attack: 'bite', airH: 1.3,
    build(K) {
      const P = { ...P0, body: 0x2a5a9a, belly: 0xdcefff, edge: 0xb8ecff, ice: 0xbff4ff, deep: 0x16305a };
      // a vast wingspan with a pale leading edge, crystal slabs standing on the back, a split tail
      const wing = [[0, -0.5], [0.3, -0.62], [0.72, -0.4], [1.0, -0.06], [0.78, 0.06], [0.42, 0.28], [0, 0.36]];
      const g = ray(K, { pal: P, y: 0.7, w: 0.26, span: 1.0, chord: 0.4, lift: 0.18, wing, flap: 0.28, flapF: 2.2, tail: 0 });
      for (const s of [-1, 1]) {
        const nm = s < 0 ? 'wingR' : 'wingL';
        [[0.25, 0.05], [0.5, -0.05], [0.75, -0.18]].forEach(([u, v], i) => K.crystal(nm, [s * (g.w * 0.7 + u / g.ul), g.y + 0.04 + u * g.lift / g.ul, 0.04 + v], [s * 0.3, 1, -0.4], 0.16 - i * 0.03, 0.035, P.ice, { sides: 4 }));
        const pts = [[s * 0.06, g.y - 0.01, -0.3], [s * 0.16, g.y - 0.08, -0.52], [s * 0.26, g.y - 0.26, -0.7], [s * 0.3, g.y - 0.5, -0.8]];
        const tb = K.chain(s < 0 ? 'tailR' : 'tailL', 'hip', pts, 'tail', 0.7);
        K.horn([...tb, tb[3]], [...pts, [s * 0.3, 0.05, -0.82]], 0.045, { col: P.body, tip: P.ice, pow: 0.7 });
        K.crystal(tb[3], [s * 0.3, 0.1, -0.82], [0, -1, 0], 0.12, 0.04, P.ice, { sides: 4 });
      }
      [[0.16, 0.34], [0.0, 0.46], [-0.16, 0.36], [-0.3, 0.22]].forEach(([z, h], i) => {
        const b = z > 0.1 ? 'chest' : z < -0.1 ? 'hip' : 'body';
        K.crystal(b, [0, g.y + 0.06, z], [0, 1, -0.25], h, 0.075, i % 2 ? P.ice : 0x8ae0ff, { sides: 5 });
        for (const s of [-1, 1]) K.crystal(b, [s * 0.09, g.y + 0.05, z - 0.04], [s * 0.5, 1, -0.3], h * 0.5, 0.04, P.ice, { sides: 4 });
      });
      K.blob('body', [0, g.y - 0.02, 0.02], [0.24, 0.06, 0.3], { col: P.deep, steps: 4 });
      return { legLen: g.legLen };
    },
  },
};
