// Phó bản monsters and chapter bosses in the steel style (steel.js Kit): dark gunmetal bodies, matte panel inserts in the boss colour, red and
// amber lamps, ribbed guns, missile boxes, sensors. They should read as heavier and meaner than any player tank next to them.
// Same contract as STEEL_DESIGNS (steel-tanks.js): (b, st, trim, form) -> info; models face +x, the ground is y = 0.
import { Kit, LAMP, X } from './steel.js';

const done = (k, info) => Object.assign(info, { parts: k.parts.concat(info.parts || []) });
// Every boss is drawn at form III with a hot red glow instead of its pale tint.
// Panels a shade darker than a player tank's (dark), so the gunmetal and the lamps carry the look. Bosses at form III, monsters at II.
const kit = (b, st, trim, glow, form = 3, dark = 0.72) => { const k = new Kit(b, { ...st, glow }, trim, form); k.c.panel.multiplyScalar(dark); k.c.panelDeep.multiplyScalar(dark); return k; };

export const PVE_STEEL = {
  // ---- the five Phó bản monsters, same gunmetal-plus-accent language at a smaller scale (form II detail) ----
  // Ong Sắt, drone: a flat hex body with a panel top and a red eye, four ducted rotor pods on short arms (the rotors spin), a stinger gun underneath.
  ong(b, st, trim) {
    const k = kit(b, st, trim, 0xffb22a, 2, 0.62);
    b.use('hull');
    k.prism([[0.62, 0], [0.32, 0.3], [-0.42, 0.3], [-0.7, 0], [-0.42, -0.3], [0.32, -0.3]], 0.62, 0.86, 'gun', 0.05);
    k.prism([[0.5, 0], [0.26, 0.22], [-0.36, 0.22], [-0.58, 0], [-0.36, -0.22], [0.26, -0.22]], 0.86, 0.96, 'panel', 0.03);
    k.blk(-0.5, 0.95, 0, 0.18, 0.08, 0.36, 'dark', 0.02);
    for (const [x, z] of [[0.3, 0.55], [0.3, -0.55], [-0.4, 0.55], [-0.4, -0.55]]) {
      k.beam([x * 0.5, 0.82, z * 0.4], [x, 0.9, z], 0.08, 0.06, 'gun');
      k.oct(x, 0.9, z, 0.17, 0.16, 'dark', 0.02);
      k.strip(x, 0.98, z, 0.3, 'x', LAMP.amber, 0.02);
    }
    k.light(0.63, 0.75, 0, 0.06, LAMP.red, '+x');
    b.use('rotor');
    k.use('steel'); for (let i = 0; i < 2; i++) b.push().rotY(i * Math.PI / 2).box(0.44, 0.015, 0.05).pop();
    b.use('turret');
    k.oct(0.25, 0.55, 0, 0.14, 0.12, 'gun');
    const tip = k.gatling(0.3, 0.5, 0, 0.4, 0.035, 4, { stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 0.5, S: 1, height: 1.15, hover: true,
      parts: [{ name: 'rotor', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 22, at: [[0.3, 1.0, 0.55], [0.3, 1.0, -0.55], [-0.4, 1.0, 0.55], [-0.4, 1.0, -0.55]] }] });
  },
  // Ụ Pháo, emplacement: a wide octagonal plinth ringed with sandbag blocks and a hazard band, an armoured gun house with one long
  // ribbed barrel, a sensor and an antenna.
  uphao(b, st, trim) {
    const k = kit(b, st, trim, 0xffb22a, 2, 0.8);
    b.use('hull');
    k.oct(0, 0.22, 0, 1.55, 0.44, 'under', 0.05);
    k.oct(0, 0.5, 0, 1.38, 0.14, 'gun', 0.03);
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; k.plate(Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5, 0.34, 0.34, 0.9, { col: 'gunLite', insert: null, ry: -a, ch: 0.08 }); }
    for (const s of [-1, 1]) k.decal('stripe', 0, 0.58, s * 1.0, 0.6, '+y');
    b.use('turret');
    k.oct(0, 0.64, 0, 0.98, 0.14, 'dark');
    k.oct(-0.05, 0.98, 0, 0.88, 0.56, 'gun', 0.07, 1.15);
    k.oct(-0.2, 1.32, 0, 0.6, 0.12, 'panel', 0.04, 1.15);
    k.sensor(0.55, 1.2, 0.5, 0.28, LAMP.red, 2);
    k.antenna(-0.7, 1.3, -0.4, 0.9);
    b.use('barrel');
    k.blk(0.95, 1.05, 0, 0.36, 0.36, 0.5, 'gun', 0.05);
    const tip = k.cannon(1.1, 1.05, 0, 1.45, 0.13, { ribs: 5, stripe: LAMP.amber });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.05, S: 1, height: 1.9, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.35 }] });
  },
  // Xe Bộ Binh, light tank: two track pods, a wedge hull with a raised dozer blade, a small octagonal turret with one short gun.
  xebb(b, st, trim) {
    const k = kit(b, st, trim, 0xffb22a, 2, 0.85);
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(0, s * 0.62, 2.0, 0.36, 0.5, { insert: 'panel', light: LAMP.amber });
    k.prism([[0.95, 0.42], [1.1, 0.18], [1.1, -0.18], [0.95, -0.42], [-0.95, -0.44], [-1.05, -0.3], [-1.05, 0.3], [-0.95, 0.44]], 0.25, 0.68, 'under', 0.05);
    k.plate(-0.1, 0.7, 0, 1.4, 0.08, 0.8);
    k.plate(1.3, 0.32, 0, 0.12, 0.44, 1.7, { col: 'panelDeep', insert: null, rz: -0.35 });
    k.beam([1.0, 0.42, 0.5], [1.25, 0.34, 0.6], 0.06, 0.06, 'steel'); k.beam([1.0, 0.42, -0.5], [1.25, 0.34, -0.6], 0.06, 0.06, 'steel');
    b.use('turret');
    k.oct(0.05, 0.78, 0, 0.46, 0.08, 'dark');
    k.oct(0.0, 0.96, 0, 0.42, 0.28, 'gun', 0.05, 1.2);
    k.oct(-0.1, 1.12, 0, 0.26, 0.06, 'panel', 0.02, 1.2);
    k.light(0.48, 0.98, 0.12, 0.04, LAMP.red, '+x');
    k.antenna(-0.4, 1.1, 0.2, 0.6);
    b.use('barrel');
    const tip = k.cannon(0.45, 0.96, 0, 0.75, 0.08, { ribs: 3, stripe: LAMP.amber });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 0.96, S: 1, height: 1.3, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.25 }] });
  },
  // Pháo Cối, mortar carrier: a six-wheeled flatbed with two outrigger feet, ammo crates, and a fat mortar tube raised at 50 degrees.
  phaocoi(b, st, trim) {
    const k = kit(b, st, trim, 0xffb22a, 2, 0.85);
    b.use('hull');
    for (const s of [-1, 1]) {
      for (const x of [-0.7, 0, 0.7]) { k.use('rubber'); b.push().move(x, 0.28, s * 0.72).rotX(X).cyl(0.28, 0.28, 0.22, 12).pop(); k.use('steel'); b.push().move(x, 0.28, s * 0.84).rotX(X).cyl(0.12, 0.12, 0.03, 8).pop(); }
      k.beam([-0.9, 0.42, s * 0.5], [-1.25, 0.08, s * 1.0], 0.08, 0.08, 'gun');
      k.oct(-1.27, 0.05, s * 1.02, 0.16, 0.06, 'dark', 0.01);
    }
    k.prism([[1.0, 0.5], [1.15, 0.25], [1.15, -0.25], [1.0, -0.5], [-1.05, -0.5], [-1.05, 0.5]], 0.38, 0.66, 'under', 0.05);
    k.plate(0.82, 0.8, 0, 0.5, 0.3, 0.9, { col: 'panel', insert: null });
    k.light(1.08, 0.82, 0.25, 0.05, LAMP.amber, '+x'); k.light(1.08, 0.82, -0.25, 0.05, LAMP.amber, '+x');
    for (const z of [-0.28, 0.28]) k.blk(-0.8, 0.78, z, 0.36, 0.24, 0.24, 'panelDeep', 0.03);
    b.use('turret');
    k.oct(-0.1, 0.72, 0, 0.5, 0.1, 'dark');
    k.blk(-0.1, 0.88, 0, 0.5, 0.22, 0.7, 'gun', 0.04);
    b.use('barrel');
    k.use('steel'); b.push().move(-0.1, 1.0, 0).rotX(X).cyl(0.26, 0.26, 0.5, 12).pop();
    k.beam([-0.25, 0.85, 0], [0.75, 2.05, 0], 0.46, 0.46, 'gun', 0.06);
    k.use('steel'); b.rod([0.68, 1.96, 0], [0.82, 2.13, 0], 0.29, 12);
    k.strip(0.2, 1.5, 0.24, 0.6, 'x', LAMP.amber);
    b.use('hull');
    return done(k, { muzzle: 0.75, muzzleY: 1.75, S: 1, height: 1.9, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.2 }] });
  },
  // Khiên Vệ, shield guard: heavy track pods, a gun house behind a tall curved tower shield (gunmetal segments with panel inserts and
  // a lamp slit), three short barrels over its rim.
  khienve(b, st, trim) {
    const k = kit(b, st, trim, 0xff3a1a, 2, 0.8);
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.05, s * 0.88, 2.5, 0.48, 0.6, { cover: false, skirt: true, skirtH: 0.36, decal: 'x' });
    k.prism([[0.9, 0.62], [1.05, 0.3], [1.05, -0.3], [0.9, -0.62], [-1.1, -0.62], [-1.1, 0.62]], 0.3, 1.0, 'under', 0.06);
    k.plate(-0.5, 1.02, 0, 1.0, 0.08, 1.1);
    b.use('turret');
    k.oct(-0.1, 1.08, 0, 0.62, 0.12, 'dark');
    k.oct(-0.2, 1.36, 0, 0.56, 0.44, 'gun', 0.05, 1.2);
    const segs = 7, R = 1.25, span = 1.5;
    for (let i = 0; i < segs; i++) {
      const a = -span / 2 + (i + 0.5) * span / segs;
      k.plate(Math.cos(a) * (R - 0.35), 1.15, Math.sin(a) * (R - 0.35), 0.16, 1.45, 2 * R * Math.sin(span / segs / 2) + 0.02, { col: 'gun', insert: null, ry: -a });
      k.plate(Math.cos(a) * (R - 0.25), 1.2, Math.sin(a) * (R - 0.25), 0.04, 1.1, 2 * R * Math.sin(span / segs / 2) - 0.08, { col: i % 3 === 1 ? 'trim' : 'panel', insert: null, ry: -a });
    }
    k.blk(0.92, 1.9, 0, 0.22, 0.12, 1.65, 'dark', 0.03);
    k.strip(1.04, 1.45, 0, 1.1, 'z', LAMP.red, 0.05);
    b.use('barrel');
    let tip = 0;
    for (const z of [-0.32, 0, 0.32]) tip = k.cannon(0.45, 2.02, z, 0.7, 0.07, { ribs: 2, stripe: LAMP.red, brake: false });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 2.02, S: 1, height: 2.45, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.18 }] });
  },

  // Cự Thần, giant tank: two track pods a side (the outer pair skirted and striped), a long wedge hull with a sloped glacis,
  // rear missile racks, a three-step octagonal turret with a cupola, a sensor block and a roof gatling, twin ribbed cannons.
  cuthan(b, st, trim) {
    const k = kit(b, st, trim, 0xff3a1a);
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.1, s * 1.5, 6.4, 0.8, 1.3, { insert: 'panel' });
      k.trackPod(0.3, s * 2.45, 6.0, 0.75, 1.2, { cover: false, skirt: true, skirtH: 0.7, decal: 'stripe', light: LAMP.red });
      k.strip(-0.4, 0.95, s * 2.93, 4.0, 'x', LAMP.red);
    }
    k.prism([[3.1, 1.1], [3.6, 0.5], [3.6, -0.5], [3.1, -1.1], [-3.2, -1.15], [-3.5, -0.8], [-3.5, 0.8], [-3.2, 1.15]], 0.5, 1.6, 'under', 0.08);
    k.plate(2.7, 1.5, 0, 1.4, 0.16, 2.0, { rz: -0.35 });
    k.plate(-0.5, 1.68, 0, 4.2, 0.16, 2.1);
    k.blk(-3.15, 1.45, 0, 0.6, 0.5, 1.8, 'dark');
    for (const s of [-1, 1]) {
      k.light(3.62, 1.0, s * 0.6, 0.12, LAMP.red, '+x');
      k.missileBox(-2.5, 2.05, s * 0.75, 2, 3, 0.2, { elev: 0.3 });
    }
    b.use('turret');
    k.oct(0.2, 1.85, 0, 1.9, 0.2, 'dark');
    k.oct(0.0, 2.25, 0, 1.7, 0.6, 'gun', 0.08, 1.25);
    k.oct(-0.2, 2.65, 0, 1.25, 0.24, 'panel', 0.06, 1.25);
    k.oct(-0.7, 2.92, 0.6, 0.45, 0.26, 'gun');
    k.light(-0.7, 3.06, 0.6, 0.1, LAMP.red, '+y');
    k.sensor(1.15, 2.8, -0.75, 0.38, LAMP.red, 4);
    k.gatling(0.6, 3.0, 0.7, 0.9, 0.08, 6, { stripe: LAMP.red });
    k.antenna(-1.6, 2.75, -0.8, 1.6); k.antenna(-1.75, 2.75, 0.8, 1.3);
    k.strip(-0.2, 2.42, 1.66, 2.0, 'x', LAMP.red); k.strip(-0.2, 2.42, -1.66, 2.0, 'x', LAMP.red);
    b.use('barrel');
    k.blk(1.95, 2.3, 0, 0.6, 0.7, 1.5, 'gun', 0.08);
    let tip = 0;
    for (const z of [-0.42, 0.42]) tip = k.cannon(2.15, 2.3, z, 2.9, 0.2, { ribs: 6, stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 2.3, S: 1, height: 3.8, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.6 }] });
  },

  // Chiến Hạm, warship: a long armoured hull riding low, panelled deck, a stepped bridge with a lit window band and a sensor,
  // a raked funnel, a mast with a turning radar, a CIWS gatling on the bow. Its deck guns are separate units (chphao).
  chienham(b, st, trim) {
    const k = kit(b, st, trim, 0xffa21a);
    const hull = [[5.6, 0], [4.6, 1.15], [2.5, 1.55], [-4.5, 1.5], [-5.6, 1.1], [-5.8, 0], [-5.6, -1.1], [-4.5, -1.5], [2.5, -1.55], [4.6, -1.15]];
    b.use('hull');
    k.prism(hull, -0.2, 0.55, 'under', 0.06);
    k.prism(hull.map((p) => [p[0] * 0.97, p[1] * 0.95]), 0.55, 0.9, 'gun', 0.05);
    for (const x of [-4.4, 4.0]) k.plate(x, 0.93, 0, 1.6, 0.06, 1.7);
    for (const s of [-1, 1]) { k.strip(0, 0.5, s * 1.53, 8.4, 'x', LAMP.amber); k.decal('stripe', 3.3, 0.7, s * 1.49, 0.5, s > 0 ? '+z' : '-z'); }
    k.light(5.55, 0.7, 0, 0.12, LAMP.red, '+x');
    k.plate(-1.6, 1.35, 0, 2.3, 0.9, 2.0, { col: 'gun' });
    k.plate(-1.3, 2.15, 0, 1.6, 0.7, 1.6, { col: 'panel', insert: null });
    k.blk(-1.0, 2.68, 0, 1.0, 0.3, 1.7, 'dark');
    k.strip(-0.48, 2.2, 0, 1.3, 'z', LAMP.amber, 0.06);
    k.sensor(-0.6, 2.95, 0.4, 0.3, LAMP.red, 2);
    k.oct(-3.0, 1.85, 0, 0.5, 1.5, 'dark', 0.04);
    k.oct(-3.0, 2.65, 0, 0.42, 0.12, 'panel', 0.02);
    k.antenna(-1.4, 3.0, -0.5, 1.4);
    k.use('steel'); b.rod([-1.8, 2.8, 0], [-1.8, 4.3, 0], 0.07, 6);
    b.use('radar');
    k.use('steel'); b.push().rotZ(X).lathe([[0.03, -0.1], [0.5, 0], [0.62, 0.14]], 12).pop();
    b.use('turret');
    k.oct(1.2, 1.05, 0, 0.42, 0.3, 'gun');
    const tip = k.gatling(1.35, 1.25, 0, 0.8, 0.07, 6, { stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.25, S: 1, height: 4.4, hover: true,
      parts: [{ name: 'radar', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 1.4, p: [-1.8, 4.35, 0] }] });
  },
  // Deck gun of the warship: an armoured plinth at deck height, an octagonal gun house with a panel roof and twin ribbed barrels.
  chphao(b, st, trim) {
    const k = kit(b, st, trim, 0xffa21a);
    b.use('hull');
    k.oct(0, 0.48, 0, 1.0, 0.95, 'under', 0.05);
    k.strip(0, 0.9, 0, 1.6, 'z', LAMP.amber);
    b.use('turret');
    k.oct(0, 1.02, 0, 0.85, 0.14, 'dark');
    k.oct(-0.05, 1.33, 0, 0.75, 0.5, 'gun', 0.06, 1.2);
    k.oct(-0.15, 1.62, 0, 0.5, 0.1, 'panel', 0.03, 1.2);
    k.light(0.82, 1.42, 0, 0.07, LAMP.red, '+x');
    b.use('barrel');
    let tip = 0;
    for (const z of [-0.22, 0.22]) tip = k.cannon(0.75, 1.32, z, 1.3, 0.1, { ribs: 4, stripe: LAMP.amber });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.32, S: 1, height: 1.9, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.3 }] });
  },

  // Đầu Tàu, locomotive: a long ribbed boiler on a dark frame, six big drive wheels, a smokestack and steam dome, the cab
  // behind with lit windows, a steel cowcatcher, a big amber headlamp; a roof gatling over the cab.
  dautau(b, st, trim) {
    const k = kit(b, st, trim, 0xff5a1a);
    b.use('hull');
    for (const s of [-1, 1]) {
      for (const x of [-1.2, 0, 1.2]) {
        k.use('steel'); b.push().move(x, 0.55, s * 0.82).rotX(X).cyl(0.5, 0.5, 0.14, 14).pop();
        k.use('dark'); b.push().move(x, 0.55, s * 0.9).rotX(X).cyl(0.2, 0.2, 0.04, 8).pop();
      }
      k.beam([-1.2, 0.55, s * 0.96], [1.2, 0.55, s * 0.96], 0.06, 0.1, 'panel');
      k.strip(0.2, 1.0, s * 0.78, 2.6, 'x', LAMP.red);
    }
    k.blk(0, 0.68, 0, 4.4, 0.36, 1.45, 'under');
    k.use('gun'); b.push().move(0.4, 1.45, 0).rotZ(X).cyl(0.76, 0.76, 3.0, 16).pop();
    for (const x of [-0.6, 0.4, 1.4]) { k.use('panel'); b.push().move(x, 1.45, 0).rotZ(X).cyl(0.8, 0.8, 0.12, 16).pop(); }
    k.use('dark'); b.push().move(1.95, 1.45, 0).rotZ(X).cyl(0.72, 0.76, 0.12, 16).pop();
    k.light(2.03, 1.62, 0, 0.16, LAMP.amber, '+x');
    k.oct(1.3, 2.45, 0, 0.3, 1.0, 'dark', 0.03);
    k.oct(1.3, 2.97, 0, 0.36, 0.08, 'gunLite', 0.02);
    k.oct(0.2, 2.26, 0, 0.32, 0.26, 'panel', 0.04);
    k.plate(-1.6, 1.75, 0, 1.3, 1.7, 2.3, { col: 'gun', insert: null });
    k.plate(-1.6, 2.66, 0, 1.6, 0.14, 2.6, { col: 'panel' });
    for (const s of [-1, 1]) k.light(-1.6, 2.0, s * 1.16, 0.16, LAMP.amber, s > 0 ? '+z' : '-z');
    // smoke deflectors flare out beside the smokebox: a wide T at the nose that a hull never has
    for (const s of [-1, 1]) { k.plate(1.55, 1.55, s * 1.08, 0.9, 1.2, 0.08, { col: 'gun', insert: null, ry: s * 0.25 }); k.strip(1.55, 2.1, s * 1.13, 0.7, 'x', LAMP.red); }
    k.prism([[2.75, 0], [2.2, 0.8], [2.05, 0.8], [2.05, -0.8], [2.2, -0.8]], 0.08, 0.85, 'steel', 0.03);
    for (const z of [-0.45, 0, 0.45]) k.beam([2.12, 0.8, z], [2.6, 0.12, z * 0.4], 0.06, 0.06, 'dark');
    k.oct(1.3, 3.08, 0, 0.42, 0.12, 'dark', 0.02); k.strip(1.3, 3.0, 0, 0.7, 'z', LAMP.red);
    b.use('turret');
    k.oct(-1.6, 2.82, 0, 0.42, 0.16, 'dark');
    const tip = k.gatling(-1.3, 2.98, 0, 0.8, 0.07, 6, { stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 2.98, S: 1.6, height: 3.1 });
  },
  // Toa Pháo, gun carriage: a flatbed on two bogies, armoured side walls with panel inserts and a red strip, a gun house on top.
  toaxe(b, st, trim) {
    const k = kit(b, st, trim, 0xff5a1a);
    b.use('hull');
    for (const s of [-1, 1]) for (const x of [-1.3, -0.7, 0.7, 1.3]) { k.use('steel'); b.push().move(x, 0.4, s * 0.78).rotX(X).cyl(0.36, 0.36, 0.12, 12).pop(); }
    k.blk(0, 0.62, 0, 3.9, 0.3, 1.5, 'under');
    for (const s of [-1, 1]) { k.plate(0, 1.15, s * 0.72, 3.6, 0.8, 0.16, { col: 'gun', insert: null }); k.plate(0, 1.15, s * 0.82, 3.0, 0.5, 0.04, { col: 'panel', insert: null }); k.strip(0, 1.45, s * 0.84, 3.0, 'x', LAMP.red); }
    k.plate(0, 0.9, 0, 3.6, 0.2, 1.3, { col: 'dark', insert: null });
    k.beam([1.95, 0.6, 0], [2.4, 0.6, 0], 0.12, 0.12, 'steel'); k.beam([-1.95, 0.6, 0], [-2.4, 0.6, 0], 0.12, 0.12, 'steel');
    b.use('turret');
    k.oct(0, 1.62, 0, 0.8, 0.16, 'dark');
    k.oct(-0.05, 1.95, 0, 0.72, 0.52, 'gun', 0.05, 1.25);
    k.oct(-0.15, 2.25, 0, 0.5, 0.1, 'panel', 0.03, 1.25);
    k.light(0.82, 2.0, 0.2, 0.07, LAMP.red, '+x'); k.light(0.82, 2.0, -0.2, 0.07, LAMP.red, '+x');
    k.sensor(-0.55, 2.4, 0.3, 0.24, LAMP.red, 2);
    b.use('barrel');
    k.blk(0.8, 2.0, 0, 0.3, 0.3, 0.42, 'gun', 0.04);
    let tip = 0;
    for (const z of [-0.14, 0.14]) tip = k.cannon(0.9, 2.0, z, 1.25, 0.09, { ribs: 4, stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 2.0, S: 1.6, height: 2.5, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.3 }] });
  },

  // Ngoại Tinh, alien saucer: a wide gunmetal disc with panel rings and a ring of green lamps, three jointed claw arms under it,
  // a dark dome with a glowing eye band, an emitter on the dome and a sensor cluster.
  ngoaitinh(b, st, trim) {
    const k = kit(b, st, trim, 0x3affd0, 3, 0.6);
    b.use('hull');
    k.use('under'); b.push().move(0, 1.4, 0).lathe([[0.3, -0.5], [1.4, -0.35], [2.5, 0], [2.6, 0.08], [2.4, 0.2], [1.2, 0.45], [0.2, 0.55]], 24).pop();
    k.use('gun'); b.push().move(0, 1.63, 0).lathe([[2.4, 0], [2.48, 0.05], [1.6, 0.26], [1.2, 0.3]], 24).pop();
    for (let i = 0; i < 6; i++) k.plate(Math.cos(i * Math.PI / 3) * 1.85, 1.79, Math.sin(i * Math.PI / 3) * 1.85, 0.7, 0.06, 0.4, { col: 'panel', insert: null, ry: -i * Math.PI / 3 });
    k.use('gun'); b.push().move(0, 1.42, 0).cyl(2.62, 2.62, 0.08, 24).pop();
    k.use('dark'); b.push().move(0, 1.32, 0).cyl(2.66, 2.5, 0.26, 24).pop();
    for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI; k.blk(Math.cos(a) * 2.6, 1.33, Math.sin(a) * 2.6, 0.2, 0.16, 0.22, 'gun', 0.02); k.lamp('glow', () => b.push().move(Math.cos(a) * 2.69, 1.33, Math.sin(a) * 2.69).box(0.06, 0.08, 0.12).pop()); }
    k.oct(0, 1.85, 0, 1.3, 0.14, 'panel', 0.03);
    for (let j = 0; j < 3; j++) { const a = j * 2 * Math.PI / 3 + 1.55, c = Math.cos(a), s = Math.sin(a); k.oct(c * 1.0, 0.82, s * 1.0, 0.24, 0.34, 'gun', 0.03); k.lamp('glow', () => b.push().move(c * 1.0, 0.6, s * 1.0).cyl(0.16, 0.08, 0.14, 8).pop()); }
    for (let j = 0; j < 3; j++) {
      const a = j * 2 * Math.PI / 3 + 0.5, c = Math.cos(a), s = Math.sin(a);
      k.beam([c * 0.9, 1.0, s * 0.9], [c * 1.6, 0.6, s * 1.6], 0.2, 0.2, 'dark');
      k.beam([c * 1.6, 0.6, s * 1.6], [c * 1.4, 0.12, s * 1.4], 0.16, 0.16, 'gun');
      k.blk(c * 1.38, 0.08, s * 1.38, 0.24, 0.12, 0.24, 'steel');
    }
    k.lamp(LAMP.green, () => b.push().move(0, 0.92, 0).ball(0.28, 1).pop());
    b.use('turret');
    k.use('dark'); b.push().move(0, 1.95, 0).ball(1.0, 2, 0.55).pop();
    k.lamp('glow', () => b.push().move(0, 2.05, 0).cyl(1.0, 1.0, 0.06, 24).pop());
    k.use('gunLite'); b.push().move(0, 2.5, 0).cyl(0.22, 0.36, 0.14, 10).pop();
    k.lamp('glow', () => b.push().move(0, 2.6, 0).ball(0.14, 1).pop());
    k.sensor(0.55, 2.35, 0, 0.3, LAMP.green, 4);
    k.blk(0.95, 1.95, 0, 0.5, 0.26, 0.3, 'gun');
    k.use('steel'); b.push().move(1.25, 1.95, 0).rotZ(X).cyl(0.1, 0.16, 0.5, 8).pop();
    k.lamp(LAMP.green, () => b.push().move(1.52, 1.95, 0).ball(0.1, 1).pop());
    b.use('hull');
    return done(k, { muzzle: 1.55, muzzleY: 1.95, S: 1, height: 2.6, hover: true });
  },
};
