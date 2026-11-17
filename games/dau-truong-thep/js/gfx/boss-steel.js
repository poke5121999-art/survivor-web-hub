// Phó bản chapter bosses in the steel style (steel.js Kit): dark gunmetal bodies, matte panel inserts in the boss colour, red and
// amber lamps, ribbed guns, missile boxes, sensors. They should read as heavier and meaner than any player tank next to them.
// Same contract as STEEL_DESIGNS (steel-tanks.js): (b, st, trim, form) -> info; models face +x, the ground is y = 0.
import { Kit, LAMP, X } from './steel.js';

const done = (k, info) => Object.assign(info, { parts: k.parts.concat(info.parts || []) });
// Every boss is drawn at form III with a hot red glow instead of its pale tint.
// Panels a shade darker than a player tank's, so the gunmetal and the lamps carry the look.
const kit = (b, st, trim, glow) => { const k = new Kit(b, { ...st, glow }, trim, 3); k.c.panel.multiplyScalar(0.72); k.c.panelDeep.multiplyScalar(0.72); return k; };

export const BOSS_STEEL = {
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
    k.plate(-1.6, 1.75, 0, 1.3, 1.7, 1.7, { col: 'gun', insert: null });
    k.plate(-1.6, 2.66, 0, 1.5, 0.14, 1.9, { col: 'panel' });
    for (const s of [-1, 1]) k.light(-1.6, 2.0, s * 0.86, 0.16, LAMP.amber, s > 0 ? '+z' : '-z');
    k.prism([[2.6, 0], [2.2, 0.75], [2.1, 0.75], [2.1, -0.75], [2.2, -0.75]], 0.12, 0.75, 'steel', 0.03);
    b.use('turret');
    k.oct(-1.6, 2.82, 0, 0.42, 0.16, 'dark');
    const tip = k.gatling(-1.3, 2.98, 0, 0.8, 0.07, 6, { stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 2.98, S: 1, height: 3.1 });
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
    k.oct(0, 1.62, 0, 0.7, 0.16, 'dark');
    k.oct(-0.05, 1.9, 0, 0.62, 0.42, 'gun', 0.05, 1.2);
    k.oct(-0.15, 2.14, 0, 0.42, 0.08, 'panel', 0.03, 1.2);
    k.light(0.7, 1.95, 0, 0.07, LAMP.red, '+x');
    b.use('barrel');
    const tip = k.cannon(0.6, 1.92, 0, 1.2, 0.13, { ribs: 4, stripe: LAMP.red });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.92, S: 1, height: 2.3, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.3 }] });
  },

  // Ngoại Tinh, alien saucer: a wide gunmetal disc with panel rings and a ring of green lamps, three jointed claw arms under it,
  // a dark dome with a glowing eye band, an emitter on the dome and a sensor cluster.
  ngoaitinh(b, st, trim) {
    const k = kit(b, st, trim, 0x5aff9a);
    b.use('hull');
    k.use('under'); b.push().move(0, 1.4, 0).lathe([[0.3, -0.5], [1.4, -0.35], [2.5, 0], [2.6, 0.08], [2.4, 0.2], [1.2, 0.45], [0.2, 0.55]], 24).pop();
    k.use('gun'); b.push().move(0, 1.63, 0).lathe([[2.4, 0], [2.48, 0.05], [1.6, 0.26], [1.2, 0.3]], 24).pop();
    for (let i = 0; i < 6; i++) k.plate(Math.cos(i * Math.PI / 3) * 1.85, 1.79, Math.sin(i * Math.PI / 3) * 1.85, 0.7, 0.06, 0.4, { col: 'panel', insert: null, ry: -i * Math.PI / 3 });
    k.use('gun'); b.push().move(0, 1.42, 0).cyl(2.62, 2.62, 0.08, 24).pop();
    for (let i = 0; i < 10; i++) { const a = i / 10 * 2 * Math.PI; k.light(Math.cos(a) * 2.63, 1.42, Math.sin(a) * 2.63, 0.07, LAMP.green, '+y'); }
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
    k.sensor(0.55, 2.35, 0, 0.3, LAMP.green, 4);
    k.blk(0.95, 1.95, 0, 0.5, 0.26, 0.3, 'gun');
    k.use('steel'); b.push().move(1.25, 1.95, 0).rotZ(X).cyl(0.1, 0.16, 0.5, 8).pop();
    k.lamp(LAMP.green, () => b.push().move(1.52, 1.95, 0).ball(0.1, 1).pop());
    b.use('hull');
    return done(k, { muzzle: 1.55, muzzleY: 1.95, S: 1, height: 2.6, hover: true });
  },
};
