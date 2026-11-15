// Character composer for the chibi preset (hand-written). A spec (lib/roster/*.js) is plain data:
//   { id, name, role, body: { k, belly, bust, kz, head, sh, hp }, skin, face, hair, beard,
//     top, bottom, shoes, socks, gloves, wear: [[name, opts], ...], head: [[name, opts], ...],
//     props: [[name, opts], ...], pose, dirt, pet: { kind: 'dog', ... }, zombie: { eyes, brain, wounds } }
// Colours are sRGB hex numbers (>= 0x10000) anywhere in the spec; buildChibi converts them to linear once.
// The result is a Lanternfall-shaped def ({ build, style, scale, death, grip }) that lib/chibi/stage.js shows.
import { C, PI, TAU, lerp } from '../lf/util.js';
import { Geo, Figure } from '../lf/kit.js';
import { DOWN_POSE } from '../lf/heroes.js';
import { chibiRig, SCALE, J, shoe, fist, head, hair, beard, headFrontZ, HZ, EYE_Y, torsoRing } from './body.js';
import { top, bottom, skinBody, WEAR, mat, tatters } from './wear.js';
import { legRings, TW } from './body.js';
import { HEADGEAR } from './headgear.js';
import { PROPS } from './props.js';
import { POSES, mirrorPose } from './poses.js';
import { toonify, S_GLOW, S_EYE, S_SKIN, S_HAIR, S_CLOTH } from './mat.js';

export const SKIN = { pale: 0xf3cfb0, light: 0xe9b58f, tan: 0xcf9466, brown: 0xa0653d, dark: 0x6e4129, deep: 0x4c2b1b,
  zteal: 0x2fa796, zgreen: 0x4fb848, zlime: 0x9bd94a, zmint: 0x6fcfa0 };
const isCol = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0x10000;
function lin(v) { if (isCol(v)) return C(v); if (Array.isArray(v)) return (v.length === 3 && v.every((x) => typeof x === 'number' && x <= 1 && !Number.isInteger(x))) ? v : v.map(lin); if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = lin(v[k]); return o; } return v; }

function zombieFace(g, z, skin) {
  g.bone('head');
  const ey = EYE_Y + 0.012, ex = 0.08, eyeCol = z.eyes === 'orange' ? [1, 0.45, 0.05] : z.eyes === 'red' ? [1, 0.12, 0.1] : z.eyes === 'pink' ? [1, 0.45, 0.6] : null;
  for (const s of [1, -1]) {
    const zz = headFrontZ(s * ex, ey), k = (s === (z.big || 1) ? 1.15 : 1) * 1.3;
    g.mat([0.94, 0.94, 0.9], 0.25, 0, S_EYE, 0); g.tr(s * ex, ey, zz - 0.012, 0, s * 0.35, 0); g.sphere(0.046 * k, 0.05 * k, 0.03, 12, 8); g.pop();
    if (eyeCol) { g.mat(eyeCol, 0.3, 0, S_GLOW, 1.4); g.tr(s * ex, ey, zz + 0.014, 0, s * 0.35, 0); g.sphere(0.03 * k, 0.032 * k, 0.008, 10, 6); g.pop(); }
    g.mat([0.03, 0.02, 0.02], 0.2, 0, S_EYE, 0); g.tr(s * (ex - 0.004), ey - 0.004, zz + 0.019, 0, s * 0.35, 0); g.sphere(0.012 * k, 0.013 * k, 0.004, 8, 4); g.pop();
    g.mat(skin.map((v) => v * 0.7), 0.6, 0, S_SKIN, 0); g.tube([[s * 0.025, ey + 0.06, headFrontZ(s * 0.03, ey + 0.06) - 0.004], [s * 0.075, ey + 0.065, headFrontZ(s * 0.075, ey + 0.065)], [s * 0.115, ey + 0.05, headFrontZ(s * 0.11, ey + 0.05) - 0.01]], 0.011, { seg: 6, sub: 2, flatten: 0.6 });
  }
  // open mouth with teeth
  const my = 1.815, mz = headFrontZ(0, my);
  g.mat([0.12, 0.02, 0.03], 0.6, 0, S_SKIN, 0); g.tr(0, my - 0.01, mz - 0.012); g.sphere(0.06, 0.055, 0.02, 12, 6); g.pop();
  g.mat([0.92, 0.9, 0.78], 0.4, 0, S_SKIN, 0); for (const x of [-0.026, 0.0, 0.028]) { g.tr(x, my + 0.028, mz + 0.01); g.box(0.016, 0.02, 0.01, 4); g.pop(); }
  g.tr(0.014, my - 0.05, mz + 0.008); g.box(0.016, 0.016, 0.01, 4); g.pop();
  if (z.brain) { g.mat([0.95, 0.5, 0.6], 0.5, 0, S_SKIN, 0); g.tr(0.02, 2.12, HZ - 0.02); g.sphere(0.13, 0.07, 0.12, 14, 8); g.pop(); g.mat([0.75, 0.3, 0.4], 0.5, 0, S_SKIN, 0); for (const a of [-0.05, 0.03, 0.09]) g.tube([[a, 2.18, 0.08], [a + 0.02, 2.19, -0.02], [a - 0.01, 2.18, -0.1]], 0.008, { seg: 4, sub: 2 }); }
}
function wounds(c, list) {
  const { g, P } = c;
  for (const w of list) {
    const s = w.side || 1;
    g.mat(w.col || [1, 0.18, 0.08], 0.4, 0, S_GLOW, w.glow || 0.9);
    if (w.at === 'knee') { g.bone(s > 0 ? 'lShin' : 'rShin'); g.tr(s * (P.hp + 0.005), 0.5, 0.085); g.sphere(0.045, 0.06, 0.014, 10, 6); g.pop(); }
    else if (w.at === 'arm') { g.bone(s > 0 ? 'lFore' : 'rFore'); g.tr(s * (P.sh + 0.07), 1.18, 0.05); g.sphere(0.03, 0.06, 0.02, 8, 5); g.pop(); }
    else if (w.at === 'shin') { g.bone(s > 0 ? 'lShin' : 'rShin'); g.tr(s * (P.hp + 0.005), 0.3, 0.07); g.sphere(0.035, 0.06, 0.014, 8, 5); g.pop(); }
  }
}

export function buildChibi(raw) {
  const sp = lin(raw), b = sp.body || {}, P = { sh: b.sh || 0.23, hp: b.hp || 0.11 }, B = { k: b.k || 1, kz: b.kz || 1, belly: b.belly || 0, bust: b.bust || 0 };
  const skin = sp.skin || C(SKIN.light), hk = b.head || 1, zombie = sp.zombie;
  let meta = [];
  function build() {
    const rig = chibiRig(P), g = new Geo(rig), c = { g, P, B, skin, dirt: sp.dirt === undefined ? 0.3 : sp.dirt, glove: null, spec: sp };
    skinBody(c, sp);
    if (sp.bottom) bottom(c, sp.bottom);
    if (sp.top) top(c, sp.top);
    const sh = sp.shoes || {};
    for (const s of [1, -1]) shoe(g, P, s, Object.assign({ col: C(0x2a2a2e), sole: C(0xe8e6e0), dirt: c.dirt * 0.6 }, sh, s < 0 && sh.right ? sh.right : {}));
    meta = [];
    for (const [n, o] of sp.wear || []) { if (!WEAR[n]) throw new Error('wear piece not found: ' + n); WEAR[n](c, o || {}); }
    for (const s of [1, -1]) fist(g, P, s, c.glove || skin, { type: c.glove ? S_CLOTH : S_SKIN, cuff: c.gloveCuff });
    if (zombie && zombie.wounds) wounds(c, zombie.wounds);
    if (zombie && zombie.torn !== false) { // ragged hems on the shirt and trouser legs
      const tc = sp.top && (sp.top.col || (sp.top.stripes && sp.top.stripes[0])), bc = sp.bottom && (sp.bottom.col || (sp.bottom.stripes && sp.bottom.stripes[0]));
      if (tc && sp.top.kind !== 'bare') tatters(c, (y) => torsoRing(B, y, 0.016), sp.top.y0 || 0.95, tc.map((v) => v * 0.8), { bone: TW, n: 10, len: 0.1, seed: 3 });
      const end = sp.bottom && (sp.bottom.end || (sp.bottom.kind === 'shorts' ? 0.6 : sp.bottom.kind === 'capri' ? 0.36 : 0));
      if (bc && end > 0.2) for (const s of [1, -1]) tatters(c, (y) => { const r = legRings(P, s, y - 0.01, y + 0.01, 0.014, 1.04)[0]; return r; }, end, bc.map((v) => v * 0.8), { bone: s > 0 ? 'lShin' : 'rShin', n: 7, len: 0.08, seed: 7 + s });
    }
    // head group, scaled about the neck so a bigger head keeps its seat
    g.tr(0, J.head, 0, 0, 0, 0, hk, hk, hk); g.tr(0, -J.head, 0);
    head(g, Object.assign({ skin }, sp.face || {}, zombie ? { eyeK: 0.001 } : {}));
    if (zombie) zombieFace(g, zombie, skin);
    hair(g, sp.hair); beard(g, sp.beard);
    for (const [n, o] of sp.head || []) { if (!HEADGEAR[n]) throw new Error('headgear not found: ' + n); HEADGEAR[n](c, o || {}); }
    g.pop(); g.pop();
    for (const [n, o] of sp.props || []) { if (!PROPS[n]) throw new Error('prop not found: ' + n); meta.push(PROPS[n](c, o || {}) || {}); }
    const fig = new Figure(g, rig); fig.P = P; fig.fx = {};
    return toonify(fig);
  }
  // pose: explicit > first prop's pose > idle
  const probe = build(); probe.dispose();
  let pname = sp.pose || (meta.find((m) => m.pose) || {}).pose || (zombie ? 'zombie-forward' : 'idle');
  // unarmed characters get a pose from the idle library, picked from the id so it is stable; half are mirrored
  let h = 0; for (const ch of String(raw.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  if (pname === 'idle') pname = ['contra', 'hip1', 'contra', 'wave', 'crossed', 'hip1', 'hips', 'contra'][h % 8];
  const PZ0 = POSES[pname]; if (!PZ0) throw new Error('pose not found: ' + pname);
  const mir = sp.mirror !== undefined ? sp.mirror : (PZ0.library && pname !== 'wave' && ((h >> 3) & 1) === 1);
  const PZ = mir ? Object.assign({}, PZ0, { carry: mirrorPose(PZ0.carry), ready: PZ0.ready }) : PZ0;
  const grip = (meta.find((m) => m.grip) || {}).grip || null;
  const twoHanded = pname === 'rifle' || pname === 'twohand' || pname === 'twohandLow' || pname === 'rifleRelaxed' || pname === 'inspect';
  const style = { carry: PZ.carry, ready: PZ.ready || PZ.carry, clips: PZ.clips || {}, swingL: PZ.swingL === undefined ? (PZ.swing || 0.85) : PZ.swingL, swingR: PZ.swingR === undefined ? (PZ.swing || 0.85) : PZ.swingR,
    strideAmp: 1, stride: PZ.stride || 1, gait: PZ.gait || { bounce: 1, sway: 1, lean: 1 }, downPose: DOWN_POSE, readyRoot: -0.03, post: PZ.post };
  return { id: raw.id, name: raw.name, role: raw.role, build, style, scale: SCALE * (b.h || 1), death: 'down', grip: twoHanded ? grip : null, pet: sp.pet || null,
    pose: pname + (mir ? ' (mirrored)' : ''), noWalk: !!PZ.noWalk, speedK: PZ.speedK || 1, zombie: !!zombie };
}
