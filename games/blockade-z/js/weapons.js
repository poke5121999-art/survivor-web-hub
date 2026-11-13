// Weapons: a stat table, blocky viewmodels built from boxes, hitscan, and spring-driven feel.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  const WEAPONS = {
    pistol: { name: 'Súng lục', key: '1', price: 120, dmg: 34, head: 2, rpm: 380, auto: false, mag: 12, reserve: Infinity, pellets: 1, spread: 0.006, moveSpread: 0.018, range: 90, reload: 1.15, snd: 'pistol', impulse: 1, crit: 0.14,
      kick: { back: 0.05, rise: 2.2, yaw: 0.6, cam: 0.012 }, adsFov: 62 },
    shotgun: { name: 'Shotgun', key: '2', price: 350, dmg: 20, head: 1.5, rpm: 70, auto: false, mag: 6, reserve: 30, pellets: 9, spread: 0.065, moveSpread: 0.075, range: 32, perShell: 0.42, snd: 'shotgun', impulse: 0.45,
      kick: { back: 0.14, rise: 6, yaw: 1.4, cam: 0.045 }, adsFov: 64 },
    smg: { name: 'SMG', key: '3', price: 0, dmg: 21, head: 1.8, rpm: 780, auto: true, mag: 40, reserve: Infinity, pellets: 1, spread: 0.016, moveSpread: 0.03, range: 60, reload: 1.6, snd: 'smg', impulse: 0.55,
      kick: { back: 0.035, rise: 1.2, yaw: 0.8, cam: 0.006 }, adsFov: 60, tracer: 3 },
    rifle: { name: 'Súng trường', key: '4', price: 900, dmg: 46, head: 2.5, rpm: 540, auto: true, mag: 30, reserve: 120, pellets: 1, spread: 0.005, moveSpread: 0.022, range: 120, reload: 2.0, snd: 'rifle', impulse: 1.4, pierce: 2,
      kick: { back: 0.05, rise: 1.8, yaw: 0.9, cam: 0.01 }, adsFov: 45, tracer: 2 },
    bazooka: { name: 'Bazooka', key: '5', price: 1200, dmg: 0, head: 1, rpm: 50, auto: false, mag: 1, reserve: 10, pellets: 1, spread: 0.002, moveSpread: 0.012, range: 150, reload: 2.8, snd: 'rocket', impulse: 3, rocket: true,
      kick: { back: 0.3, rise: 7, yaw: 1, cam: 0.06 }, adsFov: 55 },
    // melee: swing = seconds per swing, hitAt = when the edge lands, arc = half-angle of the cone it sweeps, cleave = bodies per swing
    katana: { name: 'Katana', price: 300, melee: true, cut: 'blade', dmg: 58, head: 1.7, swing: 0.36, hitAt: 0.13, range: 2.7, arc: 1.05, cleave: 3, impulse: 1.3, crit: 0.22, lunge: 3.2, stop: 0.055,
      snd: 'slash', hitSnd: 'chop', combo: ['r2l', 'l2r', 'over'], trail: 0xa8fff0, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.012 }, adsFov: 70 },
    axe: { name: 'Rìu', price: 250, melee: true, cut: 'axe', dmg: 105, head: 1.6, swing: 0.66, hitAt: 0.3, range: 2.6, arc: 0.85, cleave: 2, impulse: 3, crit: 0.12, lunge: 2.2, stop: 0.1,
      snd: 'heavy', hitSnd: 'cleave', combo: ['over', 'r2l'], trail: 0xffd8a0, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.03 }, adsFov: 70 },
    saber: { name: 'Kiếm ánh sáng', price: 1500, melee: true, cut: 'saber', dmg: 82, head: 1.5, swing: 0.4, hitAt: 0.15, range: 3.0, arc: 1.25, cleave: 4, impulse: 1.1, crit: 0.2, lunge: 3.6, stop: 0.06,
      snd: 'saber_swing', hitSnd: 'saber_hit', combo: ['r2l', 'l2r', 'spin'], trail: 0x60f0ff, glow: 0x60e8ff, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.014 }, adsFov: 70 },
    // pf: per-pattern overrides (arc, dmg, imp, cleave, range, fall, shove); fall = damage kept by each further body in a swing
    spear: { name: 'Thương', price: 700, melee: true, hold: 'spear', cut: 'blade', dmg: 54, head: 1.8, swing: 0.34, hitAt: 0.12, range: 3.9, arc: 0.2, cleave: 4, fall: 0.9, impulse: 1.5, crit: 0.18, lunge: 2.2, stop: 0.04,
      snd: 'slash', hitSnd: 'chop', combo: ['thrust', 'thrust', 'thrust'], idleKF: 'idleSpear', trail: 0x8fdcff, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.012 }, adsFov: 70 },
    longsword: { name: 'Trường kiếm', price: 900, melee: true, hold: 'sword2', cut: 'blade', dmg: 96, head: 1.6, swing: 0.6, hitAt: 0.26, range: 2.9, arc: 1.15, cleave: 4, impulse: 2.2, crit: 0.2, lunge: 2.6, stop: 0.085,
      snd: 'heavy', hitSnd: 'cleave', combo: ['r2l', 'l2r', 'over'], pf: { over: { dmg: 1.6, imp: 1.5, arc: 0.9 } }, idleKF: 'idleSword', trail: 0xdfe8ff, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.026 }, adsFov: 70 },
    glaive: { name: 'Đại đao', price: 1100, melee: true, hold: 'glaive', cut: 'blade', dmg: 74, head: 1.5, swing: 0.5, hitAt: 0.2, range: 3.5, arc: 1.2, cleave: 4, impulse: 1.8, crit: 0.16, lunge: 2.4, stop: 0.07,
      snd: 'heavy', hitSnd: 'cleave', combo: ['gr2l', 'gl2r', 'spin360'], pf: { spin360: { arc: Math.PI, dmg: 1.3, cleave: 9, imp: 2, range: 3.3, fall: 0.9 } }, idleKF: 'idleGlaive', trail: 0xa8ff70, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.022 }, adsFov: 70 },
    fists: { name: 'Nắm đấm', price: 0, melee: true, hold: 'fists', noTrail: true, dmg: 28, head: 1.8, swing: 0.24, hitAt: 0.08, range: 2.1, arc: 0.6, cleave: 1, impulse: 0.8, crit: 0.15, lunge: 1.8, stop: 0.03,
      snd: 'swipe', hitSnd: 'hit', combo: ['jabR', 'jabL', 'upper'], pf: { upper: { dmg: 2.6, imp: 3.2, shove: 7, arc: 0.8, cleave: 2, range: 2.3 } }, idleKF: 'idleFist', mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.01 }, adsFov: 70 },
    // spinUp = seconds of barrel spin before the first round; slow = per-frame speed kept while the trigger is held; carry = keep the fractional wait between rounds
    minigun: { name: 'Súng máy', key: '6', price: 0, dmg: 17, head: 1.6, rpm: 1300, auto: true, mag: 240, reserve: Infinity, pellets: 1, spread: 0.028, moveSpread: 0.05, range: 70, reload: 3.2, snd: 'smg', impulse: 0.45, crit: 0.05,
      kick: { back: 0.02, rise: 0.5, yaw: 0.5, cam: 0.003 }, adsFov: 64, tracer: 2, spinUp: 0.4, slow: 0.95, carry: true, noAds: true },
    dualpistol: { name: 'Súng đôi', key: '7', price: 0, dmg: 46, head: 2, rpm: 520, auto: true, mag: 30, reserve: Infinity, pellets: 1, spread: 0.012, moveSpread: 0.03, range: 80, reload: 1.5, snd: 'pistol', impulse: 0.8, crit: 0.12,
      kick: { back: 0.03, rise: 1.3, yaw: 0.9, cam: 0.007 }, adsFov: 62, tracer: 2, carry: true, dual: true, noAds: true, hipX: -0.2 },
    // thrown: real projectiles. speed m/s, grav m/s2, windup = seconds the arm draws back before the release, hide = seconds the item is gone from the hand
    javelin: { name: 'Phi lao', key: '8', price: 0, dmg: 170, head: 2, rpm: 80, auto: false, mag: 3, reserve: Infinity, pellets: 1, spread: 0.004, moveSpread: 0.02, range: 110, reload: 1.0, snd: 'heavy', impulse: 2.4, crit: 0.15,
      thrown: 'javelin', hold: 'throw', speed: 58, grav: 8, pierce: 3, windup: 0.11, throwT: 0.42, hide: 0.5, kick: { back: 0.15, rise: -3, yaw: 0.4, cam: 0.02 }, adsFov: 58, noAds: true, rsnd: [[0.25, 'switch'], [0.7, 'rack']] },
    shuriken: { name: 'Phi tiêu', key: '9', price: 0, dmg: 46, head: 1.8, rpm: 190, auto: true, mag: 15, reserve: Infinity, pellets: 3, fan: 0.075, spread: 0.004, moveSpread: 0.02, range: 70, reload: 1.0, snd: 'swipe', impulse: 0.7, crit: 0.14,
      thrown: 'shuriken', hold: 'throw', speed: 52, grav: 0, pierce: 1, windup: 0.04, throwT: 0.28, hide: 0.2, kick: { back: 0.05, rise: -1, yaw: 0.3, cam: 0.006 }, adsFov: 58, noAds: true, rsnd: [[0.3, 'switch'], [0.7, 'mag_in']] },
    // Sói: a quick one-handed hunting hatchet (every third hit that lands opens a bleed); in the beast form, two claws that tear across
    hatchet: { name: 'Rìu săn', price: 0, melee: true, cut: 'blade', dmg: 60, head: 1.6, swing: 0.32, hitAt: 0.11, range: 2.6, arc: 0.95, cleave: 2, impulse: 1.6, crit: 0.16, lunge: 2.8, stop: 0.05,
      snd: 'slash', hitSnd: 'chop', combo: ['r2l', 'l2r', 'over'], pf: { over: { dmg: 1.25, imp: 1.4 } }, idleKF: 'idleHatchet', trail: 0xffc890, mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.018 }, adsFov: 70 },
    claws: { name: 'Vuốt sói', price: 0, melee: true, hold: 'claws', noTrail: true, cut: 'blade', dmg: 70, head: 1.4, swing: 0.26, hitAt: 0.09, range: 2.9, arc: 1.1, cleave: 4, fall: 0.85, impulse: 1.6, crit: 0.15, lunge: 3.2, stop: 0.045,
      snd: 'slash', hitSnd: 'chop', combo: ['clawR', 'clawL'], idleKF: 'idleFist', mag: Infinity, reserve: Infinity, spread: 0, moveSpread: 0, kick: { cam: 0.016 }, adsFov: 70 },
    // Nhện Đồng: a crossbow strapped to the wrist; each bolt leaves a web stack, the third roots the zombie
    webbow: { name: 'Nỏ tơ', key: '0', price: 0, dmg: 74, head: 2, rpm: 330, auto: true, mag: 14, pierce: 2, reserve: Infinity, pellets: 1, spread: 0.005, moveSpread: 0.016, range: 70, reload: 1.4, snd: 'swipe', impulse: 0.6, crit: 0.12,
      hold: 'wrist', web: true, kick: { back: 0.04, rise: 1.4, yaw: 0.5, cam: 0.008 }, adsFov: 58, tracer: 1, rsnd: [[0.25, 'switch'], [0.7, 'rack']] },
  };
  BZ.WEAPONS = WEAPONS;
  // how a body holds each weapon (BZ.animHero reads it in third person and for co-op avatars)
  BZ.holdOf = (W) => (W && (W.hold || (W.melee ? 'melee' : 'gun'))) || 'none';
  const ORDER = ['pistol', 'shotgun', 'smg', 'rifle', 'bazooka', 'katana', 'axe', 'saber', 'spear', 'longsword', 'glaive', 'fists', 'minigun', 'dualpistol', 'javelin', 'shuriken', 'hatchet', 'claws', 'webbow'];
  const START = 'smg';

  // elemental cells for each hero's signature weapon; the glowing ones get an emissive in GLOW below
  const EL = { wind: BZ.cellTex(0x9ff8ec), ice: BZ.cellTex(0xc4ecff), iceGlow: BZ.cellTex(0x7fd4ff), poison: BZ.cellTex(0x3f8a2c), shadowGlow: BZ.cellTex(0xc080ff), fire: BZ.cellTex(0xff6a1a), shield: BZ.cellTex(0x2c5aa8),
    amber: BZ.cellTex(0xffb440), web: BZ.cellTex(0xf6f4ff), fur: BZ.cellTex(0x5a4a3a), bone: BZ.cellTex(0xece4d0), leather: BZ.cellTex(0x6a3e22) };
  // the beast's arms in first person: shaggy fur sleeves and dark paws
  BZ.defTex('g_fur', 16, 16, ({ set, rng }) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = 0.8 + rng.next() * 0.35 + ((x * 3 + y * 5) % 7 === 0 ? -0.2 : 0) + (y % 4 === 0 ? 0.08 : 0); set(x, y, [118 * k, 100 * k, 78 * k]); } });
  BZ.defTex('g_paw', 4, 4, ({ set }) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, y === 3 ? [86, 70, 54] : x === 0 ? [70, 58, 44] : [58, 48, 38]); }, { noMip: true });
  const swapTex = (parts, map) => parts.map((p) => { const q = p.slice(); if (map[q[6]]) q[6] = map[q[6]]; return q; });

  // Viewmodel shapes: many small flat-colour voxels, gun points along -z, grip near origin.
  // Each gun: dark body, a light edge stripe, one saturated accent, one emissive cell.
  const GUNS = {
    pistol: { port: [0.045, 0.09, -0.07], muzzle: [0, 0.075, -0.3], lh: [-0.05, -0.1, 0.0], magHand: [0, -0.22, 0.03], parts: [
      [-0.04, 0.04, -0.26, 0.04, 0.11, 0.04, 'g_body2', 'slide'], [-0.041, 0.108, -0.26, 0.041, 0.118, 0.04, 'g_edge', 'slide'],
      [-0.042, 0.05, -0.005, 0.042, 0.1, 0.008, 'g_body', 'slide'], [-0.042, 0.05, 0.016, 0.042, 0.1, 0.029, 'g_body', 'slide'],
      [-0.035, 0.0, -0.22, 0.035, 0.042, 0.02, 'g_body'], [-0.036, 0.014, -0.2, 0.036, 0.03, -0.08, 'g_orange'],
      [-0.018, 0.058, -0.29, 0.018, 0.092, -0.26, 'g_steel'], [-0.01, 0.118, -0.245, 0.01, 0.136, -0.225, 'g_body', 'slide'],
      [-0.026, 0.118, 0.012, -0.008, 0.136, 0.03, 'g_body', 'slide'], [0.008, 0.118, 0.012, 0.026, 0.136, 0.03, 'g_body', 'slide'],
      [-0.012, -0.045, -0.085, 0.012, 0.0, -0.072, 'g_body'], [-0.012, -0.048, -0.085, 0.012, -0.036, -0.02, 'g_body'],
      [0.041, 0.068, -0.07, 0.044, 0.09, -0.02, 'g_glow_orange', 'slide'],
    ], grip: [[-0.033, -0.17, -0.025, 0.033, 0.0, 0.06, 'g_grip'], [-0.035, -0.14, -0.005, 0.035, -0.04, 0.045, 'g_orange'], [-0.027, -0.19, -0.012, 0.027, -0.02, 0.048, 'g_body2', 'mag'], [-0.029, -0.2, -0.015, 0.029, -0.185, 0.051, 'g_orange', 'mag']] },
    shotgun: { port: [0.05, 0.07, -0.12], shellColor: 'red', muzzle: [0, 0.075, -0.94], lh: [0, -0.06, -0.55], magHand: [0, -0.06, -0.55], parts: [
      [-0.045, 0.0, -0.3, 0.045, 0.11, 0.06, 'g_body'], [-0.046, 0.105, -0.3, 0.046, 0.116, 0.06, 'g_edge'],
      [-0.028, 0.05, -0.9, 0.028, 0.1, -0.3, 'g_steel'], [-0.024, 0.0, -0.82, 0.024, 0.046, -0.3, 'g_body2'],
      [-0.05, -0.016, -0.66, 0.05, 0.056, -0.44, 'g_red', 'pump'],
      [-0.052, -0.002, -0.62, 0.052, 0.042, -0.605, 'g_body', 'pump'], [-0.052, -0.002, -0.565, 0.052, 0.042, -0.55, 'g_body', 'pump'], [-0.052, -0.002, -0.51, 0.052, 0.042, -0.495, 'g_body', 'pump'],
      [-0.031, 0.044, -0.925, 0.031, 0.106, -0.9, 'g_edge'], [-0.008, 0.1, -0.885, 0.008, 0.116, -0.865, 'g_gold'],
      [-0.04, -0.06, 0.06, 0.04, 0.09, 0.4, 'g_body2'], [-0.041, 0.0, 0.15, 0.041, 0.03, 0.4, 'g_red'], [-0.042, -0.07, 0.39, 0.042, 0.1, 0.42, 'g_grip'],
      [0.045, 0.02, -0.25, 0.06, 0.075, -0.225, 'g_red'], [0.045, 0.02, -0.21, 0.06, 0.075, -0.185, 'g_red'], [0.045, 0.02, -0.17, 0.06, 0.075, -0.145, 'g_red'],
      [0.045, 0.075, -0.25, 0.06, 0.09, -0.145, 'g_gold'],
      [0.046, 0.065, -0.07, 0.049, 0.088, -0.0, 'g_glow_red'],
    ], grip: [[-0.035, -0.16, 0.0, 0.035, 0.0, 0.08, 'g_grip']] },
    smg: { port: [0.045, 0.09, -0.16], muzzle: [0, 0.06, -0.54], lh: [0, -0.02, -0.41], magHand: [0, -0.3, -0.165], parts: [
      [-0.042, 0.0, -0.34, 0.042, 0.115, 0.06, 'g_body'], [-0.043, 0.06, -0.34, 0.043, 0.074, 0.06, 'g_lime'], [0.042, 0.078, -0.12, 0.064, 0.1, -0.085, 'g_steel', 'bolt'],
      [-0.03, 0.115, -0.32, 0.03, 0.132, 0.02, 'g_body2'],
      [-0.031, 0.132, -0.3, 0.031, 0.142, -0.285, 'g_body'], [-0.031, 0.132, -0.25, 0.031, 0.142, -0.235, 'g_body'], [-0.031, 0.132, -0.2, 0.031, 0.142, -0.185, 'g_body'],
      [-0.03, 0.03, -0.48, 0.03, 0.09, -0.34, 'g_body2'],
      [0.03, 0.05, -0.46, 0.033, 0.07, -0.44, 'g_grip'], [0.03, 0.05, -0.42, 0.033, 0.07, -0.4, 'g_grip'], [0.03, 0.05, -0.38, 0.033, 0.07, -0.36, 'g_grip'],
      [-0.021, 0.039, -0.53, 0.021, 0.081, -0.48, 'g_steel'],
      [-0.024, -0.26, -0.2, 0.024, 0.0, -0.13, 'g_body2', 'mag'], [-0.027, -0.285, -0.205, 0.027, -0.255, -0.125, 'g_lime', 'mag'],
      [-0.012, 0.02, 0.06, 0.012, 0.05, 0.3, 'g_steel'], [-0.035, -0.04, 0.28, 0.035, 0.09, 0.31, 'g_body'],
      [-0.026, 0.132, -0.13, 0.026, 0.18, -0.04, 'g_body'], [-0.016, 0.142, -0.042, 0.016, 0.17, -0.038, 'g_glow_lime'],
      [0.043, 0.02, -0.3, 0.046, 0.042, -0.25, 'g_glow_lime'],
    ], grip: [[-0.03, -0.15, 0.0, 0.03, 0.0, 0.07, 'g_grip']] },
    rifle: { port: [0.043, 0.09, -0.22], muzzle: [0, 0.055, -0.98], lh: [0, -0.06, -0.6], magHand: [0, -0.29, -0.27], parts: [
      [-0.04, 0.0, -0.46, 0.04, 0.115, 0.08, 'g_body'], [-0.041, 0.03, -0.42, 0.041, 0.085, -0.25, 'g_blue'], [0.04, 0.074, -0.08, 0.064, 0.098, -0.045, 'g_steel', 'bolt'],
      [-0.041, 0.11, -0.46, 0.041, 0.12, 0.08, 'g_edge'],
      [-0.045, -0.01, -0.7, 0.045, 0.1, -0.46, 'g_body2'],
      [0.045, 0.03, -0.66, 0.048, 0.06, -0.62, 'g_grip'], [0.045, 0.03, -0.6, 0.048, 0.06, -0.56, 'g_grip'], [0.045, 0.03, -0.54, 0.048, 0.06, -0.5, 'g_grip'],
      [-0.016, 0.04, -0.92, 0.016, 0.07, -0.7, 'g_steel'], [-0.026, 0.03, -0.97, 0.026, 0.08, -0.92, 'g_body'], [-0.008, 0.08, -0.75, 0.008, 0.13, -0.73, 'g_body'],
      [-0.026, -0.16, -0.3, 0.026, 0.0, -0.2, 'g_body2', 'mag'], [-0.026, -0.26, -0.33, 0.026, -0.15, -0.22, 'g_body2', 'mag'], [-0.027, -0.2, -0.32, 0.027, -0.18, -0.21, 'g_blue', 'mag'],
      [-0.038, -0.06, 0.08, 0.038, 0.1, 0.42, 'g_body2'], [-0.039, 0.02, 0.2, 0.039, 0.05, 0.42, 'g_blue'], [-0.04, -0.07, 0.41, 0.04, 0.11, 0.44, 'g_grip'],
      [-0.03, 0.13, -0.3, 0.03, 0.19, -0.06, 'g_body'], [-0.015, 0.12, -0.26, 0.015, 0.13, -0.22, 'g_body2'], [-0.015, 0.12, -0.14, 0.015, 0.13, -0.1, 'g_body2'],
      [-0.022, 0.14, -0.302, 0.022, 0.18, -0.298, 'g_glow_blue'], [-0.02, 0.142, -0.062, 0.02, 0.178, -0.058, 'g_glow_blue'],
      [0.041, 0.09, -0.2, 0.044, 0.108, -0.12, 'g_glow_blue'],
    ], grip: [[-0.032, -0.15, -0.02, 0.032, 0.0, 0.06, 'g_grip']] },
  };
  GUNS.bazooka = { port: [0.07, 0.1, 0.2], muzzle: [0, 0.05, -1.0], lh: [0, -0.08, -0.45], magHand: [0, 0.05, -1.25], parts: [
    [-0.075, -0.02, -0.9, 0.075, 0.12, 0.45, 'g_body2'], [-0.09, -0.035, -0.96, 0.09, 0.135, -0.86, 'g_edge'], [-0.09, -0.035, 0.4, 0.09, 0.135, 0.5, 'g_edge'],
    [-0.076, 0.03, -0.6, 0.076, 0.07, 0.2, 'g_red'], [-0.03, 0.12, -0.35, 0.03, 0.2, -0.15, 'g_body'], [-0.02, 0.15, -0.36, 0.02, 0.19, -0.34, 'g_glow_red'],
    [-0.03, -0.18, -0.4, 0.03, -0.02, -0.32, 'g_grip'], [0.076, 0.0, -0.1, 0.09, 0.06, 0.1, 'g_body'],
    [-0.05, 0.0, -1.06, 0.05, 0.1, -0.9, 'g_red', 'mag'], [-0.035, 0.015, -1.13, 0.035, 0.085, -1.06, 'g_gold', 'mag'],
  ], grip: [[-0.032, -0.16, -0.02, 0.032, 0.0, 0.06, 'g_grip']] };
  GUNS.katana = { tip: [0, 1.1, 0], mid: [0, 0.62, 0], lh: [0, -0.12, 0.02], oneHand: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 1.1, 0], parts: [
    [-0.022, -0.16, -0.025, 0.022, 0.16, 0.025, 'g_tsuka'], [-0.026, -0.19, -0.029, 0.026, -0.16, 0.029, 'g_gold'],
    [-0.03, 0.16, -0.075, 0.03, 0.186, 0.075, 'g_gold'], [-0.034, 0.165, -0.06, 0.034, 0.181, 0.06, 'g_body'], [-0.016, 0.186, -0.03, 0.016, 0.22, 0.03, 'g_gold'],
    [-0.008, 0.22, -0.012, 0.008, 0.5, 0.022, 'g_blade', 'blade'], [-0.005, 0.22, -0.024, 0.005, 0.5, -0.012, 'g_edge', 'blade'],
    [-0.008, 0.5, -0.008, 0.008, 0.82, 0.026, 'g_blade', 'blade'], [-0.005, 0.5, -0.02, 0.005, 0.82, -0.008, 'g_edge', 'blade'],
    [-0.008, 0.82, -0.002, 0.008, 1.02, 0.03, 'g_blade', 'blade'], [-0.005, 0.82, -0.014, 0.005, 1.02, -0.002, 'g_edge', 'blade'],
    [-0.007, 1.02, 0.004, 0.007, 1.08, 0.03, 'g_blade', 'blade'], [-0.004, 1.02, -0.008, 0.004, 1.12, 0.012, 'g_edge', 'blade'],
    [-0.004, 0.24, 0.022, 0.004, 0.5, 0.027, EL.wind, 'blade'], [-0.004, 0.5, 0.026, 0.004, 0.82, 0.031, EL.wind, 'blade'], [-0.004, 0.82, 0.03, 0.004, 1.02, 0.035, EL.wind, 'blade'],
    [-0.012, -0.3, -0.012, 0.012, -0.19, 0.012, EL.wind], [-0.02, -0.34, -0.006, 0.02, -0.3, 0.006, EL.wind],
  ], grip: [] };
  GUNS.axe = { tip: [0, 0.72, -0.31], mid: [0, 0.68, -0.2], lh: [0, 0.3, 0.02], oneHand: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 0.72, -0.31], parts: [
    [-0.022, -0.2, -0.026, 0.022, 0.8, 0.026, 'g_wood'], [-0.026, -0.2, -0.03, 0.026, 0.06, 0.03, 'g_grip'], [-0.027, 0.48, -0.031, 0.027, 0.52, 0.031, 'g_red'],
    [-0.036, 0.58, -0.055, 0.036, 0.82, 0.055, 'g_body2'], [-0.021, 0.56, -0.25, 0.021, 0.84, -0.055, 'g_steel'], [-0.021, 0.48, -0.3, 0.021, 0.62, -0.18, 'g_steel'],
    [-0.012, 0.48, -0.33, 0.012, 0.87, -0.25, 'g_edge'], [-0.019, 0.66, 0.055, 0.019, 0.74, 0.17, 'g_body'], [-0.028, 0.82, -0.045, 0.028, 0.85, 0.045, 'g_body'],
    [-0.022, 0.6, -0.2, 0.022, 0.64, -0.08, 'g_gold'],
  ], grip: [] };
  GUNS.saber = { tip: [0, 1.16, 0], mid: [0, 0.7, 0], lh: [-0.2, -0.7, 0.4], oneHand: true, saber: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 1.16, 0], parts: [
    [-0.027, -0.14, -0.027, 0.027, 0.2, 0.027, 'g_steel'], [-0.031, -0.17, -0.031, 0.031, -0.14, 0.031, 'g_body2'],
    [-0.031, -0.06, -0.031, 0.031, -0.04, 0.031, 'g_body'], [-0.031, 0.0, -0.031, 0.031, 0.02, 0.031, 'g_body'], [-0.031, 0.06, -0.031, 0.031, 0.08, 0.031, 'g_body'],
    [0.027, 0.1, -0.012, 0.036, 0.13, 0.012, 'g_red'], [-0.035, 0.2, -0.035, 0.035, 0.245, 0.035, 'g_body'], [-0.03, 0.245, -0.03, 0.03, 0.26, 0.03, 'g_edge'],
    [-0.012, 0.26, -0.012, 0.012, 1.16, 0.012, 'g_saber_core', 'blade'], [-0.006, 1.16, -0.006, 0.006, 1.18, 0.006, 'g_saber_core', 'blade'],
  ], grip: [] };
  // ---- spear / longsword / glaive: shaft along +y, the right hand at the origin (lh: where the second hand rides the shaft)
  GUNS.spear = { tip: [0, 2.44, 0], mid: [0, 1.8, 0], lh: [0, 0.8, 0], rh: [0, -0.02, 0.03], hrot: [1.3, 1.3], hyaw: [-0.35, 0.55], magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 2.44, 0], parts: [
    [-0.017, -0.55, -0.017, 0.017, 1.9, 0.017, 'g_wood'], [-0.022, -0.12, -0.022, 0.022, 0.22, 0.022, 'g_grip'], [-0.024, 0.21, -0.024, 0.024, 0.235, 0.024, 'g_gold'], [-0.024, -0.135, -0.024, 0.024, -0.115, 0.024, 'g_gold'],
    [-0.025, -0.6, -0.025, 0.025, -0.55, 0.025, 'g_gold'], [-0.027, 1.88, -0.027, 0.027, 1.94, 0.027, 'g_gold'],
    [-0.034, 1.7, -0.034, 0.034, 1.86, 0.034, 'g_red'], [-0.042, 1.62, -0.042, 0.042, 1.7, 0.042, 'g_red'], [-0.03, 1.56, -0.03, 0.03, 1.62, 0.03, 'g_red'],
    [-0.034, 1.94, -0.008, 0.034, 2.03, 0.008, 'g_blade'], [-0.05, 2.03, -0.008, 0.05, 2.17, 0.008, 'g_blade'], [-0.036, 2.17, -0.008, 0.036, 2.31, 0.008, 'g_blade'], [-0.016, 2.31, -0.007, 0.016, 2.44, 0.007, 'g_blade'],
    [-0.005, 1.94, 0.0075, 0.005, 2.4, 0.0105, 'g_edge'], [-0.005, 1.94, -0.0105, 0.005, 2.4, -0.0075, 'g_edge'], [-0.003, 2.05, 0.0102, 0.003, 2.26, 0.0118, 'g_glow_saber'], [-0.003, 2.05, -0.0118, 0.003, 2.26, -0.0102, 'g_glow_saber'],
  ], grip: [] };
  GUNS.longsword = { tip: [0, 1.3, 0], mid: [0, 0.75, 0], lh: [0, -0.22, 0.02], rh: [0, -0.05, 0.025], magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 1.3, 0], parts: [
    [-0.021, -0.3, -0.021, 0.021, 0.12, 0.021, 'g_grip'], [-0.024, -0.24, -0.024, 0.024, -0.22, 0.024, 'g_gold'], [-0.024, -0.16, -0.024, 0.024, -0.14, 0.024, 'g_gold'], [-0.024, -0.08, -0.024, 0.024, -0.06, 0.024, 'g_gold'],
    [-0.034, -0.37, -0.034, 0.034, -0.3, 0.034, 'g_gold'], [-0.012, -0.355, 0.034, 0.012, -0.325, 0.04, 'g_glow_blue'],
    [-0.14, 0.12, -0.024, 0.14, 0.16, 0.024, 'g_gold'], [-0.155, 0.1, -0.02, -0.12, 0.18, 0.02, 'g_steel'], [0.12, 0.1, -0.02, 0.155, 0.18, 0.02, 'g_steel'], [-0.014, 0.125, 0.024, 0.014, 0.156, 0.032, 'g_glow_blue'],
    [-0.03, 0.16, -0.009, 0.03, 0.24, 0.009, 'g_blade'], [-0.036, 0.24, -0.009, 0.036, 0.9, 0.009, 'g_blade'], [-0.03, 0.9, -0.008, 0.03, 1.12, 0.008, 'g_blade'], [-0.02, 1.12, -0.007, 0.02, 1.22, 0.007, 'g_blade'], [-0.01, 1.22, -0.006, 0.01, 1.3, 0.006, 'g_blade'],
    [-0.006, 0.24, 0.0085, 0.006, 1.1, 0.0105, 'g_edge'], [-0.006, 0.24, -0.0105, 0.006, 1.1, -0.0085, 'g_edge'], [-0.039, 0.24, -0.004, -0.034, 1.0, 0.004, 'g_edge'], [0.034, 0.24, -0.004, 0.039, 1.0, 0.004, 'g_edge'],
    [-0.002, 0.3, 0.0105, 0.002, 1.0, 0.012, 'g_glow_blue'], [-0.002, 0.3, -0.012, 0.002, 1.0, -0.0105, 'g_glow_blue'],
  ], grip: [] };
  GUNS.glaive = { tip: [0.03, 2.28, 0], mid: [0.06, 1.85, 0], lh: [0, 0.75, 0], rh: [0, -0.02, 0.03], hrot: [1.3, 1.3], hyaw: [-0.35, 0.55], magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0.03, 2.28, 0], parts: [
    [-0.02, -0.55, -0.02, 0.02, 1.55, 0.02, 'g_wood'], [-0.024, -0.12, -0.024, 0.024, 0.24, 0.024, 'g_grip'], [-0.026, 0.9, -0.026, 0.026, 0.94, 0.026, 'g_red'], [-0.026, 1.2, -0.026, 0.026, 1.24, 0.026, 'g_red'],
    [-0.03, -0.62, -0.03, 0.03, -0.55, 0.03, 'g_gold'], [-0.012, -0.72, -0.012, 0.012, -0.62, 0.012, 'g_steel'],
    [-0.034, 1.5, -0.034, 0.034, 1.64, 0.034, 'g_gold'], [-0.04, 1.46, -0.04, 0.04, 1.5, 0.04, 'g_red'],
    [-0.02, 1.64, -0.012, 0.05, 1.72, 0.012, 'g_blade'], [-0.02, 1.72, -0.012, 0.085, 1.87, 0.012, 'g_blade'], [-0.02, 1.87, -0.012, 0.095, 2.0, 0.012, 'g_blade'], [-0.02, 2.0, -0.012, 0.075, 2.1, 0.012, 'g_blade'],
    [-0.02, 2.1, -0.012, 0.045, 2.2, 0.012, 'g_blade'], [-0.02, 2.2, -0.012, 0.016, 2.3, 0.012, 'g_blade'],
    [-0.024, 1.64, -0.016, -0.004, 2.28, 0.016, 'g_steel'], [0.04, 1.72, -0.0125, 0.052, 1.86, 0.0125, 'g_edge'], [0.075, 1.86, -0.0125, 0.097, 2.0, 0.0125, 'g_edge'], [0.06, 2.0, -0.0125, 0.078, 2.1, 0.0125, 'g_edge'], [0.03, 2.1, -0.0125, 0.048, 2.2, 0.0125, 'g_edge'],
    [0.0, 1.74, 0.0115, 0.04, 2.1, 0.0135, 'g_glow_red'], [0.0, 1.74, -0.0135, 0.04, 2.1, -0.0115, 'g_glow_red'],
    [-0.034, 1.78, -0.03, -0.02, 1.92, 0.03, 'g_gold'], [-0.034, 2.0, -0.026, -0.02, 2.1, 0.026, 'g_gold'],
  ], grip: [] };
  // fists: no body, the hands are the weapon. 'knuckle' parts ride on each glove (viewmodel) and on the hand (world model)
  GUNS.fists = { tip: [0, 0, -0.1], mid: [0, 0, 0], lh: [-0.2, -0.07, -0.22], rh: [0.17, -0.03, -0.18], magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 0, -0.1], parts: [
    [-0.052, -0.045, -0.078, 0.052, 0.05, -0.056, 'g_steel', 'knuckle'], [-0.05, 0.05, -0.078, 0.05, 0.062, -0.054, 'g_glow_orange', 'knuckle'], [-0.04, -0.012, -0.086, 0.04, 0.014, -0.078, 'g_glow_orange', 'knuckle'],
    [-0.045, -0.03, -0.086, -0.025, 0.04, -0.078, 'g_edge', 'knuckle'], [-0.01, -0.03, -0.086, 0.01, 0.04, -0.078, 'g_edge', 'knuckle'], [0.025, -0.03, -0.086, 0.045, 0.04, -0.078, 'g_edge', 'knuckle'],
  ], grip: [] };
  // minigun: six barrels around the axis (role 'barrels' spins), the housing and the ammo box behind
  GUNS.minigun = (() => {
    // vs: the viewmodel is drawn smaller than the world model

    const P = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2; const cx = +(Math.cos(a) * 0.05).toFixed(4); const cy = +(Math.sin(a) * 0.05).toFixed(4);
      P.push([cx - 0.014, cy - 0.014, -0.98, cx + 0.014, cy + 0.014, -0.28, i === 0 ? 'g_red' : i % 2 ? 'g_steel' : 'g_body2', 'barrels']);
      P.push([cx - 0.017, cy - 0.017, -0.99, cx + 0.017, cy + 0.017, -0.95, 'g_edge', 'barrels']);
    }
    P.push([-0.032, -0.032, -0.98, 0.032, 0.032, -0.28, 'g_body', 'barrels']);
    for (const z of [-0.66, -0.4]) P.push([-0.074, 0.054, z, 0.074, 0.074, z + 0.04, 'g_gold', 'barrels'], [-0.074, -0.074, z, 0.074, -0.054, z + 0.04, 'g_gold', 'barrels'], [-0.074, -0.054, z, -0.054, 0.054, z + 0.04, 'g_gold', 'barrels'], [0.054, -0.054, z, 0.074, 0.054, z + 0.04, 'g_gold', 'barrels']);
    P.push(
      [-0.1, -0.1, -0.28, 0.1, 0.1, 0.14, 'g_body'], [-0.1, 0.1, -0.28, 0.1, 0.11, 0.14, 'g_edge'], [-0.112, -0.05, -0.24, -0.1, 0.05, 0.06, 'g_orange'], [0.1, -0.05, -0.24, 0.112, 0.05, 0.06, 'g_orange'],
      [0.1, 0.055, -0.2, 0.116, 0.09, -0.12, 'g_glow_orange'], [-0.078, -0.078, -0.34, 0.078, 0.078, -0.28, 'g_body2'], [-0.03, 0.11, -0.2, 0.03, 0.19, -0.17, 'g_body'], [-0.03, 0.11, -0.02, 0.03, 0.19, 0.01, 'g_body'], [-0.036, 0.19, -0.21, 0.036, 0.215, 0.02, 'g_grip'],
      [-0.06, -0.06, 0.14, 0.06, 0.06, 0.22, 'g_body2'], [-0.03, -0.03, 0.22, 0.03, 0.03, 0.3, 'g_steel'],
      [-0.09, -0.3, -0.12, 0.09, -0.1, 0.1, 'g_body2', 'mag'], [-0.093, -0.23, -0.125, 0.093, -0.2, 0.105, 'g_orange', 'mag'], [-0.096, -0.305, -0.13, 0.096, -0.295, 0.11, 'g_body', 'mag'],
      [-0.03, -0.3, 0.1, 0.03, -0.1, 0.17, 'g_grip'], [-0.026, -0.2, -0.3, 0.026, -0.1, -0.25, 'g_grip']);
    return { vs: 0.7, port: [0.11, 0.02, -0.05], muzzle: [0, 0, -1.0], lh: [0, -0.2, -0.275], rh: [0, -0.22, 0.135], magHand: [0, -0.3, -0.01], parts: P, grip: [] };
  })();
  // dual pistols: the pistol twice, right at +x and left at -x (the left slide is its own part so each side cycles alone)
  GUNS.dualpistol = (() => {
    const P = GUNS.pistol; const D = 0.23;
    const mv = (p, dx, left) => { const q = [p[0] + dx, p[1], p[2], p[3] + dx, p[4], p[5], p[6]]; if (p[7]) q.push(left && p[7] === 'slide' ? 'slideL' : p[7]); return q; };
    return { dual: true, port: [0.045 + D, 0.09, -0.07], portL: [0.045 - D, 0.09, -0.07], muzzle: [D, 0.075, -0.3], muzzleL: [-D, 0.075, -0.3], lh: [-D, -0.07, 0.025], rh: [D, -0.07, 0.025], magHand: [-D, -0.22, 0.03],
      parts: [...P.parts.map((p) => mv(p, D, false)), ...P.parts.map((p) => mv(p, -D, true))], grip: [...P.grip.map((p) => mv(p, D, false)), ...P.grip.map((p) => mv(p, -D, true))] };
  })();
  // javelin: points along -z with the grip at the origin; every part is an 'item' that leaves the hand on the throw
  GUNS.javelin = { rh: [0, -0.01, 0.06], port: [0, 0, 0], muzzle: [0, 0, -1.3], lh: [0, 0, 0], oneHand: true, magHand: [0, 0, 0], parts: [
    [-0.014, -0.014, -1.0, 0.014, 0.014, 0.62, 'g_wood'], [-0.019, -0.019, -0.1, 0.019, 0.019, 0.22, 'g_grip'], [-0.021, -0.021, 0.22, 0.021, 0.021, 0.245, 'g_gold'], [-0.021, -0.021, -0.125, 0.021, 0.021, -0.1, 'g_gold'],
    [-0.017, -0.017, 0.62, 0.017, 0.017, 0.66, 'g_gold'], [-0.022, -0.022, -1.03, 0.022, 0.022, -0.99, 'g_gold'], [-0.019, -0.019, -1.0, 0.019, 0.019, -0.97, 'g_glow_blue'],
    [-0.02, -0.006, -1.1, 0.02, 0.006, -1.03, 'g_blade'], [-0.03, -0.006, -1.2, 0.03, 0.006, -1.1, 'g_blade'], [-0.014, -0.006, -1.3, 0.014, 0.006, -1.2, 'g_blade'], [-0.004, -0.0065, -1.28, 0.004, 0.0065, -1.05, 'g_edge'],
    [-0.004, -0.045, 0.46, 0.004, 0.045, 0.62, 'g_red'], [-0.045, -0.004, 0.46, 0.045, 0.004, 0.62, 'g_red'], [-0.004, -0.03, 0.38, 0.004, 0.03, 0.46, 'g_red'], [-0.03, -0.004, 0.38, 0.03, 0.004, 0.46, 'g_red'],
  ], grip: [] };
  // shuriken: a four-point star (flat in x/y); three fanned in the hand, one flying
  const starParts = (ox, oy, oz, k) => {
    const s = (v) => +(v * k).toFixed(4); const T = 0.006 * k; const out = [[ox + s(-0.02), oy + s(-0.02), oz - T, ox + s(0.02), oy + s(0.02), oz + T, 'g_glow_red']];
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const [a0, a1, hw, tex] of [[0.02, 0.045, 0.016, 'g_steel'], [0.045, 0.07, 0.01, 'g_edge'], [0.07, 0.088, 0.004, 'g_edge']]) {
        const x0 = ax ? Math.min(ax * a0, ax * a1) : -hw; const x1 = ax ? Math.max(ax * a0, ax * a1) : hw; const y0 = ay ? Math.min(ay * a0, ay * a1) : -hw; const y1 = ay ? Math.max(ay * a0, ay * a1) : hw;
        out.push([ox + s(x0), oy + s(y0), oz - T, ox + s(x1), oy + s(y1), oz + T, tex]);
      }
    }
    return out;
  };
  GUNS.shuriken = { rh: [0, -0.07, 0.025], port: [0, 0, 0], muzzle: [0, 0.02, -0.3], lh: [0, 0, 0], oneHand: true, magHand: [0, 0, 0], parts: [...starParts(-0.085, 0.0, -0.09, 1.0), ...starParts(0, 0.04, -0.12, 1.0), ...starParts(0.085, 0.0, -0.09, 1.0)], grip: [] };
  GUNS.starProj = { port: [0, 0, 0], muzzle: [0, 0, 0], lh: [0, 0, 0], magHand: [0, 0, 0], parts: starParts(0, 0, 0, 1), grip: [] };
  // Sói's hatchet: a short bearded head on a leather-wrapped haft, a wolf tooth tied under it, a fur tuft at the butt
  GUNS.hatchet = { tip: [0, 0.68, -0.27], mid: [0, 0.58, -0.15], lh: [0, 0.3, 0.02], oneHand: true, magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 0.68, -0.27], parts: [
    [-0.02, -0.18, -0.024, 0.02, 0.66, 0.024, 'g_wood'], [-0.024, -0.18, -0.028, 0.024, 0.14, 0.028, EL.leather], [-0.026, -0.1, -0.03, 0.026, -0.08, 0.03, 'g_gold'], [-0.026, 0.12, -0.03, 0.026, 0.14, 0.03, 'g_gold'],
    [-0.034, -0.27, -0.034, 0.034, -0.18, 0.034, EL.fur], [-0.026, -0.31, -0.026, 0.026, -0.27, 0.026, EL.fur],
    [-0.032, 0.5, -0.05, 0.032, 0.68, 0.05, 'g_body2'], [-0.017, 0.48, -0.22, 0.017, 0.7, -0.05, 'g_steel'], [-0.017, 0.4, -0.27, 0.017, 0.52, -0.16, 'g_steel'],
    [-0.01, 0.4, -0.295, 0.01, 0.71, -0.24, 'g_edge'], [-0.014, 0.56, 0.05, 0.014, 0.62, 0.14, 'g_body'], [-0.019, 0.6, -0.2, 0.019, 0.63, -0.1, EL.amber],
    [-0.027, 0.44, -0.032, 0.027, 0.48, 0.032, EL.leather], [-0.006, 0.33, 0.026, 0.006, 0.44, 0.034, EL.leather], [-0.014, 0.28, 0.022, 0.014, 0.35, 0.04, EL.bone],
  ], grip: [] };
  // Sói's claws (beast form): three long bone claws over each paw, an amber line down the inside of each
  GUNS.claws = { tip: [0, 0, -0.3], mid: [0, 0, -0.15], lh: [-0.2, -0.07, -0.22], rh: [0.17, -0.03, -0.18], magHand: [0, 0, 0], port: [0, 0, 0], muzzle: [0, 0, -0.3], kscale: 1.3, sleeve: 'g_fur', glove: 'g_paw', parts: [
    [-0.06, -0.05, -0.095, 0.06, 0.045, -0.05, EL.fur, 'knuckle'],
    ...[-0.04, 0, 0.04].flatMap((x) => [[x - 0.013, -0.022, -0.2, x + 0.013, 0.014, -0.09, EL.bone, 'knuckle'], [x - 0.01, -0.034, -0.27, x + 0.01, 0.004, -0.2, 'g_edge', 'knuckle'], [x - 0.006, -0.042, -0.31, x + 0.006, -0.012, -0.27, 'g_edge', 'knuckle'], [x - 0.004, 0.014, -0.19, x + 0.004, 0.02, -0.1, EL.amber, 'knuckle']]),
  ], grip: [] };
  // Nhện Đồng's wrist bow: a bracer on the forearm, a small bow across the back of the hand, a glowing bolt laid in, the silk gland underneath
  GUNS.webbow = { vs: 0.8, rh: [0, -0.07, 0.025], hrot: [0.04, 0], armR: [0.1, 0.1], oneHand: true, port: [0.03, 0.1, -0.05], muzzle: [0, 0.112, -0.42], lh: [0, 0, 0], magHand: [0, 0.1, -0.1], parts: [
    [-0.062, -0.062, 0.04, 0.062, 0.062, 0.3, 'g_body'], [-0.066, -0.066, 0.04, 0.066, 0.066, 0.07, 'g_gold'], [-0.066, -0.066, 0.26, 0.066, 0.066, 0.29, 'g_gold'],
    [-0.035, -0.1, 0.1, 0.035, -0.062, 0.24, EL.amber], [0.062, 0.0, 0.12, 0.068, 0.03, 0.18, EL.amber], [-0.068, 0.0, 0.12, -0.062, 0.03, 0.18, EL.amber],
    [-0.026, 0.062, -0.2, 0.026, 0.1, 0.26, 'g_body'], [-0.012, 0.1, -0.26, 0.012, 0.11, 0.1, 'g_gold'],
    [-0.045, 0.06, -0.25, 0.045, 0.1, -0.18, 'g_body2'], [-0.15, 0.07, -0.235, -0.045, 0.09, -0.205, 'g_body'], [0.045, 0.07, -0.235, 0.15, 0.09, -0.205, 'g_body'],
    [-0.17, 0.066, -0.22, -0.14, 0.094, -0.15, 'g_gold'], [0.14, 0.066, -0.22, 0.17, 0.094, -0.15, 'g_gold'], [-0.15, 0.077, -0.16, 0.15, 0.082, -0.15, EL.web],
    [-0.008, 0.104, -0.38, 0.008, 0.118, -0.06, EL.web], [-0.017, 0.098, -0.43, 0.017, 0.124, -0.37, EL.amber], [-0.02, 0.1, -0.08, 0.02, 0.122, -0.05, 'g_gold'],
  ], grip: [] };
  // ---- the elements: Băng's ice spear, Độc's poison glaive, Bóng's shadow stars, Hoả's burning gloves, Y Tá's healing left pistol ----
  GUNS.spear.parts = [...swapTex(GUNS.spear.parts, { g_blade: EL.ice, g_glow_saber: EL.iceGlow, g_red: 'g_blue' }),
    [-0.05, 1.84, -0.01, -0.034, 1.99, 0.01, EL.iceGlow], [0.034, 1.84, -0.01, 0.05, 1.99, 0.01, EL.iceGlow], [-0.01, 1.84, -0.05, 0.01, 1.99, -0.034, EL.iceGlow], [-0.01, 1.84, 0.034, 0.01, 1.99, 0.05, EL.iceGlow]];
  GUNS.spear.glow = { at: [0, 2.2, 0], col: 0x7fd4ff, size: 0.55 };
  GUNS.glaive.parts = swapTex(GUNS.glaive.parts, { g_glow_red: 'g_glow_lime', g_red: EL.poison });
  GUNS.glaive.glow = { at: [0.04, 1.9, 0], col: 0x9cff50, size: 0.6 };
  for (const g of [GUNS.shuriken, GUNS.starProj]) g.parts = swapTex(g.parts, { g_glow_red: EL.shadowGlow });
  GUNS.fists.parts = swapTex(GUNS.fists.parts, { g_glow_orange: EL.fire, g_steel: 'g_body2' });
  {
    const D = GUNS.dualpistol; const heal = { g_orange: 'g_lime', g_glow_orange: 'g_glow_lime' }; const half = D.parts.length / 2; const halfG = D.grip.length / 2;
    D.parts = [...D.parts.slice(0, half), ...swapTex(D.parts.slice(half), heal)]; D.grip = [...D.grip.slice(0, halfG), ...swapTex(D.grip.slice(halfG), heal)];
    GUNS.pistolHeal = { ...GUNS.pistol, parts: swapTex(GUNS.pistol.parts, heal), grip: swapTex(GUNS.pistol.grip, heal) };
  }
  GUNS.javelin.parts.push([-0.005, 0.014, -0.95, 0.005, 0.018, 0.42, 'g_glow_blue'], [-0.005, -0.018, -0.95, 0.005, -0.014, 0.42, 'g_glow_blue']);
  // Thép's heater shield, front face toward -z; it rides the left forearm
  GUNS.shield = { port: [0, 0, 0], muzzle: [0, 0, 0], lh: [0, 0, 0], magHand: [0, 0, 0], grip: [], parts: [
    [-0.24, 0.0, -0.02, 0.24, 0.3, 0.02, EL.shield], [-0.2, -0.12, -0.02, 0.2, 0.0, 0.02, EL.shield], [-0.14, -0.22, -0.02, 0.14, -0.12, 0.02, EL.shield], [-0.07, -0.3, -0.02, 0.07, -0.22, 0.02, EL.shield],
    [-0.265, 0.29, -0.03, 0.265, 0.33, 0.03, 'g_steel'], [-0.265, 0.0, -0.03, -0.235, 0.29, 0.03, 'g_steel'], [0.235, 0.0, -0.03, 0.265, 0.29, 0.03, 'g_steel'],
    [-0.235, -0.13, -0.03, -0.195, 0.0, 0.03, 'g_steel'], [0.195, -0.13, -0.03, 0.235, 0.0, 0.03, 'g_steel'], [-0.175, -0.23, -0.03, -0.135, -0.12, 0.03, 'g_steel'], [0.135, -0.23, -0.03, 0.175, -0.12, 0.03, 'g_steel'],
    [-0.105, -0.31, -0.03, -0.065, -0.22, 0.03, 'g_steel'], [0.065, -0.31, -0.03, 0.105, -0.22, 0.03, 'g_steel'], [-0.065, -0.34, -0.03, 0.065, -0.3, 0.03, 'g_steel'],
    [-0.03, -0.2, -0.04, 0.03, 0.26, -0.02, 'g_gold'], [-0.17, 0.08, -0.04, 0.17, 0.14, -0.02, 'g_gold'], [-0.04, 0.07, -0.052, 0.04, 0.15, -0.04, 'g_glow_blue'],
    [-0.05, -0.04, 0.02, 0.05, 0.22, 0.045, 'g_grip'], [-0.16, 0.05, 0.02, -0.11, 0.17, 0.04, 'g_body2'], [0.11, 0.05, 0.02, 0.16, 0.17, 0.04, 'g_body2'],
  ] };
  const GLOW = { g_glow_orange: 0xff8a20, g_glow_red: 0xff3a2a, g_glow_lime: 0x9cff50, g_glow_blue: 0x50c0ff, g_saber_core: 0xe8ffff, g_glow_saber: 0x60e8ff,
    [EL.wind]: 0x70e8d8, [EL.iceGlow]: 0x50c0ff, [EL.shadowGlow]: 0xa050ff, [EL.fire]: 0xff4a10, [EL.amber]: 0xff9a20, [EL.web]: 0x9a98a8 };
  // a soft additive sprite for weapons whose head glows (the ice spear, the poison glaive)
  const glowSprite = (col, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: BZ.tex('glow'), color: col, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.setScalar(size); return s; };
  // a plain world-space copy (no arms, fogged, lit like the scene) for weapons lying on the ground or in a soldier's hands
  const worldCache = {};
  BZ.worldGun = (id) => {
    if (!worldCache[id]) {
      const D = GUNS[id]; const B = new BZ.Builder('wgun:' + id); const BB = new BZ.Builder('wgun:' + id + ':b');
      const tilt = new THREE.Matrix4().makeRotationX(0.28);
      for (const p of D.parts) (p[7] === 'barrels' ? BB : B).box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true });
      for (const p of D.grip) { B.push(tilt); B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true }); B.pop(); }
      const matOpts = {}; for (const k of Object.keys(GLOW)) matOpts[k] = { emissive: GLOW[k] };
      const main = B.build({ cast: false, matOpts });
      if (BB.batches.size) { const grp = new THREE.Group(); grp.add(main); const bar = BB.build({ cast: false, matOpts }); bar.name = 'barrels'; grp.add(bar); worldCache[id] = grp; } else worldCache[id] = main;
    }
    const g = worldCache[id].clone();
    if (GUNS[id].saber) { const h = saberHalo(1.0); h.position.y = 0.72; g.add(h); }
    if (GUNS[id].glow) { const q = GUNS[id].glow; const s = glowSprite(q.col, q.size); s.position.set(...q.at); g.add(s); }
    g.userData.muzzle = new THREE.Vector3(...(GUNS[id].muzzle || [0, 0, 0]));
    return g;
  };
  // put the weapon of `id` in a hero body's hands (third person, co-op avatars). Returns the gun group and the muzzle markers.
  BZ.equipWeapon = (m, id) => {
    const W = BZ.WEAPONS[id]; const out = { gun: null, tip: null, tipL: null };
    for (const h of [m.handR, m.handL]) for (let i = h.children.length - 1; i >= 0; i--) if (h.children[i].userData.wgun) h.remove(h.children[i]);
    if (!W) return out;
    const hold = BZ.holdOf(W);
    const put = (hand, gid, scale) => {
      const g = BZ.worldGun(gid); g.userData.wgun = true;
      if (hold === 'spear' || hold === 'glaive') g.rotation.x = Math.PI; // the head leads along the forearm
      else if (W.melee && hold !== 'fists' && hold !== 'claws') g.rotation.x = Math.PI / 2; else g.rotation.set(-Math.PI / 2, 0, Math.PI);
      g.scale.setScalar(scale); hand.add(g);
      const tip = new THREE.Object3D(); tip.position.copy(g.userData.muzzle); g.add(tip); g.userData.tipObj = tip;
      return g;
    };
    if (id === 'dualpistol') { out.gun = put(m.handR, 'pistol', 0.9); const l = put(m.handL, 'pistolHeal', 0.9); out.tip = out.gun.userData.tipObj; out.tipL = l.userData.tipObj; }
    else if (id === 'fists' || id === 'claws') { out.gun = put(m.handR, id, id === 'claws' ? 1.5 : 1.25); put(m.handL, id, id === 'claws' ? 1.5 : 1.25); out.tip = out.gun.userData.tipObj; }
    else { out.gun = put(m.handR, id, id === 'webbow' ? 1.3 : 0.9); out.tip = out.gun.userData.tipObj; }
    if (m.wolf) m.formWant = id === 'claws' ? 1 : 0;
    if (id === 'longsword') {
      const s = BZ.worldGun('shield'); s.userData.wgun = true; s.userData.shield = true; s.scale.setScalar(0.85); m.handL.add(s); out.shield = s;
      BZ.shieldPose(s, 0);
    }
    return out;
  };
  // the shield on a body's left hand: k = 0 strapped flat on the forearm, k = 1 raised square in front of the chest.
  // The raised pose is given in the body's own space (root), so it holds whatever the arm animation is doing.
  const SH = { low: new THREE.Vector3(-0.13, 0.12, 0.02), lowQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), up: new THREE.Matrix4().compose(new THREE.Vector3(-0.12, 1.2, 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, Math.PI, 0)), new THREE.Vector3(1, 1, 1)),
    m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  BZ.shieldPose = (s, k, root) => {
    s.position.copy(SH.low); s.quaternion.copy(SH.lowQ);
    if (!(k > 0.01) || !root || !s.parent) return;
    root.updateMatrixWorld(true);
    SH.m.copy(s.parent.matrixWorld).invert().multiply(root.matrixWorld).multiply(SH.up).decompose(SH.p, SH.q, SH.s);
    s.position.lerp(SH.p, k); s.quaternion.slerp(SH.q, k);
  };
  function saberHalo(o) {
    // nested additive shells, each wider and fainter, read as a soft glow around the white core
    const shell = (w, c, a) => new THREE.Mesh(new THREE.BoxGeometry(w, 0.92 + w, w), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: a * o, depthWrite: false, blending: THREE.AdditiveBlending }));
    const m = shell(0.042, 0x60e8ff, 0.55); m.add(shell(0.07, 0x30b8ff, 0.2)); m.add(shell(0.11, 0x1a70ff, 0.08));
    return m;
  }
  // BZ.makeHand's frame (fingers down -y, knuckles along z) into the viewmodel's (fingers forward -z, knuckles up y)
  const HAND_FP = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  function buildGun(id) {
    const D = GUNS[id];
    // One builder per moving part (body, slide, bolt, pump, mag) so reloads can animate them.
    const builders = {};
    const builder = (r) => (builders[r] = builders[r] || new BZ.Builder('gun:' + id + ':' + r));
    const box = (B, p) => B.box([p[0], p[1], p[2]], [p[3], p[4], p[5]], p[6], { uv: 'fit', vary: 0, flat: true });
    for (const p of D.parts) if (p[7] !== 'knuckle') box(builder(p[7] || 'body'), p);
    const tilt = new THREE.Matrix4().makeRotationX(0.28);
    for (const p of D.grip) { const B = builder(p[7] || 'body'); B.push(tilt); box(B, p); B.pop(); }
    const matOpts = {}; for (const k of Object.keys(GLOW)) matOpts[k] = { emissive: GLOW[k] };
    const g = new THREE.Group(); const parts = {};
    for (const [r, B] of Object.entries(builders)) { const m = B.build({ matOpts }); m.name = r; g.add(m); parts[r] = m; }
    const items = Object.values(parts).slice(); // what leaves the hand when it is thrown
    if (id === 'shotgun') {
      const SB = new BZ.Builder('shell');
      SB.box([-0.018, -0.018, -0.05], [0.018, 0.018, 0.03], 'g_red', { uv: 'fit', vary: 0, flat: true });
      SB.box([-0.019, -0.019, 0.03], [0.019, 0.019, 0.05], 'g_gold', { uv: 'fit', vary: 0, flat: true });
      parts.shell = SB.build(); parts.shell.visible = false; g.add(parts.shell);
    }
    // Arms: gloved hand at the origin, camo forearm running back and down out of frame.
    const arm = (yaw, pitch, side) => {
      const AB = new BZ.Builder('arm');
      AB.box([-0.047, -0.052, 0.03], [0.047, 0.052, 0.06], D.glove || 'glove', { uv: 'fit', vary: 0, tint: [0.7, 0.7, 0.7] });
      AB.push(new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(pitch)));
      AB.box([-0.05, -0.055, 0.04], [0.05, 0.055, 0.22], D.sleeve ? D.sleeve : 'g_body2', { uv: 'fit', vary: 0 });
      AB.box([-0.055, -0.06, 0.2], [0.055, 0.06, 0.62], D.sleeve || 'sleeve', { uv: 'world', uvScale: 6, vary: 0 });
      AB.pop();
      const out = AB.build();
      // the hand itself: a palm and fourteen finger joints in one mesh (BZ.makeHand), turned so the fingers reach forward and wrap what is held
      const f = BZ.makeHand(D.glove || 'glove', side, { scale: 0.62 }); f.mesh.applyMatrix4(HAND_FP); f.mesh.position.set(0, 0, 0.045); f.mesh.castShadow = false; out.add(f.mesh); out.userData.fingers = f;
      return out;
    };
    parts.handR = arm(...(D.armR || [0.35, 0.5]), -1); parts.handR.position.set(...(D.rh || [0, -0.07, 0.025])); parts.handR.rotation.x = D.hrot ? D.hrot[0] : 0.28; if (D.hyaw) parts.handR.rotation.y = D.hyaw[0]; g.add(parts.handR);
    parts.handL = arm(-0.55, 0.35, 1); parts.handL.rotation.x = D.hrot ? D.hrot[1] : D.dual ? 0.28 : 0; if (D.hyaw) parts.handL.rotation.y = D.hyaw[1]; g.add(parts.handL);
    if (D.parts.some((p) => p[7] === 'knuckle')) {
      const KB = new BZ.Builder('knuckle'); for (const p of D.parts) if (p[7] === 'knuckle') box(KB, p);
      for (const h of [parts.handR, parts.handL]) { h.add(KB.build({ matOpts })); h.scale.setScalar(D.kscale || 1.18); }
    }
    g.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.fog = false; } });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: BZ.tex('flash'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flash.position.set(...D.muzzle); flash.visible = false;
    g.add(flash);
    let flashL = null;
    if (WEAPONS[id].web) flash.material.color.setHex(0xe8eaff);
    if (D.muzzleL) { flashL = flash.clone(); flashL.material = flash.material.clone(); flashL.material.color.setHex(0x90ff90); flashL.position.set(...D.muzzleL); g.add(flashL); }
    if (D.glow) { const s = glowSprite(D.glow.col, D.glow.size); s.position.set(...D.glow.at); g.add(s); parts.glow = s; }
    if (D.saber) { const h = saberHalo(1); h.position.y = 0.72; h.traverse((q) => { if (q.material) q.material.fog = false; }); g.add(h); parts.halo = h; }
    if (D.oneHand) parts.handL.visible = false;
    if (WEAPONS[id].melee && WEAPONS[id].hold !== 'fists' && WEAPONS[id].hold !== 'claws') g.scale.setScalar(0.85);
    if (D.vs) g.scale.setScalar(D.vs);
    const magDir = id === 'bazooka' ? new THREE.Vector3(0, 0.15, -1).normalize() : id === 'pistol' || id === 'dualpistol' ? new THREE.Vector3(0, -1, 0).applyMatrix4(tilt) : new THREE.Vector3(0, -1, 0.12).normalize();
    g.userData = { muzzle: new THREE.Vector3(...D.muzzle), flash, parts, magDir, lh: new THREE.Vector3(...D.lh), magHand: new THREE.Vector3(...D.magHand), port: new THREE.Vector3(...D.port), shellColor: D.shellColor, tip: D.tip && new THREE.Vector3(...D.tip), mid: D.mid && new THREE.Vector3(...D.mid),
      muzzleL: D.muzzleL && new THREE.Vector3(...D.muzzleL), portL: D.portL && new THREE.Vector3(...D.portL), flashL, items, dual: !!D.dual, barrels: parts.barrels };
    return g;
  }
  BZ.GUN_PARTS = GUNS;

  const DRAW_FP = 0.45; // seconds a weapon takes to come out in first person
  const seg = (t, a, b) => BZ.clamp((t - a) / (b - a), 0, 1);
  const ease = (x) => x * x * (3 - 2 * x);
  const RELOAD_SOUNDS = [[0.15, 'mag_out'], [0.6, 'mag_in'], [0.8, 'rack']];

  BZ.makeWeapons = (G) => {
    const vmScene = new THREE.Scene();
    const vmCam = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    vmScene.add(new THREE.HemisphereLight(0xc8d6f4, 0x6a5a48, 1.5));
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.2); sun.position.set(-0.6, 0.8, 0.5); vmScene.add(sun);
    const rig = new THREE.Group(); vmScene.add(rig);
    const models = {};
    // viewmodel particles: sparks from the muzzle, casings from the ejection port
    const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 48);
    sparkMesh.frustumCulled = false; sparkMesh.count = 0; sparkMesh.setColorAt(0, new THREE.Color()); vmScene.add(sparkMesh);
    const sparks = [];
    const casingGeo = new THREE.BoxGeometry(0.014, 0.014, 0.034);
    const casingMats = { brass: new THREE.MeshLambertMaterial({ color: 0xe8b84a, emissive: 0x3a2808 }), red: new THREE.MeshLambertMaterial({ color: 0xd8322a, emissive: 0x300808 }) };
    const casings = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(casingGeo, casingMats.brass); m.visible = false; vmScene.add(m); casings.push({ m, life: 0, v: new THREE.Vector3(), spin: new THREE.Vector3() }); }
    let casingI = 0;
    const tmpV = new THREE.Vector3(); const tmpM = new THREE.Matrix4(); const tmpQ = new THREE.Quaternion(); const tmpC = new THREE.Color();
    function emitSparks(n, side, cols) {
      const m = models[S.cur]; rig.updateMatrixWorld(true);
      const at = m.localToWorld((side && m.userData.muzzleL || m.userData.muzzle).clone()); const fwd = new THREE.Vector3(0, 0, -1).transformDirection(m.matrixWorld);
      for (let i = 0; i < n; i++) {
        if (sparks.length >= 48) sparks.shift();
        const v = fwd.clone().multiplyScalar(G.rng.range(1.5, 4)).add(new THREE.Vector3(G.rng.range(-1, 1), G.rng.range(-0.6, 1.2), G.rng.range(-1, 1)).multiplyScalar(1.4));
        sparks.push({ p: at.clone(), v, life: 0, max: G.rng.range(0.06, 0.16), s: G.rng.range(0.006, 0.014), c: G.rng.pick(cols || [0xfff2a0, 0xffc040, 0xff8a20]) });
      }
    }
    function ejectCasing(side) {
      const m = models[S.cur]; rig.updateMatrixWorld(true);
      const c = casings[casingI++ % casings.length];
      c.m.material = casingMats[m.userData.shellColor || 'brass'];
      c.m.scale.setScalar(m.userData.shellColor ? 1.6 : 1);
      c.m.position.copy(m.localToWorld((side && m.userData.portL || m.userData.port).clone()));
      c.v.set(G.rng.range(1.2, 1.8), G.rng.range(1.0, 1.6), G.rng.range(0.1, 0.5)).transformDirection(m.matrixWorld).multiplyScalar(G.rng.range(1.4, 1.9));
      c.spin.set(G.rng.range(-20, 20), G.rng.range(-20, 20), G.rng.range(-20, 20)); c.life = 0.7; c.m.visible = true;
      setTimeout(() => G.audio.play('casing', { gain: 0.22 }), 380);
    }
    // the spent magazine: a copy of the mag part, released into the viewmodel scene to fall and tumble
    const drops = [];
    function dropMag() {
      const m = models[S.cur]; const part = m.userData.parts.mag; if (!part) return;
      rig.updateMatrixWorld(true);
      const c = part.clone(); part.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      vmScene.add(c);
      const v = m.userData.magDir.clone().transformDirection(m.matrixWorld).multiplyScalar(1.2).add(new THREE.Vector3(-0.3, 0, 0.2));
      drops.push({ m: c, v, spin: new THREE.Vector3(G.rng.range(-6, 6), G.rng.range(-3, 3), G.rng.range(-8, -3)), life: 0.7 });
      setTimeout(() => G.audio.play('casing', { gain: 0.35, rate: 0.6 }), 420);
    }
    function updateVmFx(dt) {
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.life -= dt; d.v.y -= 6 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt;
        if (d.life <= 0) { vmScene.remove(d.m); drops.splice(i, 1); }
      }
      let n = 0;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life += dt; if (s.life > s.max) { sparks.splice(i, 1); continue; }
        s.p.addScaledVector(s.v, dt); s.v.y -= 3 * dt;
        const k = s.s * (1 - s.life / s.max);
        tmpM.compose(s.p, tmpQ, tmpV.set(k, k, k * 3)); sparkMesh.setMatrixAt(n, tmpM); sparkMesh.setColorAt(n, tmpC.setHex(s.c)); n++;
      }
      sparkMesh.count = n; sparkMesh.instanceMatrix.needsUpdate = true; if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
      for (const c of casings) {
        if (c.life <= 0) continue;
        c.life -= dt; c.v.y -= 9 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
        if (c.life <= 0) c.m.visible = false;
      }
    }
    for (const id of ORDER) { models[id] = buildGun(id); models[id].visible = false; rig.add(models[id]); }

    const state = {};
    const S = {
      inv: [START], cur: START, next: null, combo: 0, comboT: 0, swing: null, vmPose: null, phase: 'ready', t: 0, cool: 0, bloom: 0, ads: 0, trigger: false, held: false,
      shots: 0, hits: 0, evt: {}, cycle: 9, pumpT: 0, rackPlayed: true, spin: 0, spinAng: 0, wind: null, hideT: 0, thrT: 9, side: 1, cyc: [9, 9], lastPat: 'r2l',
      kZ: BZ.spring(420, 26), kP: BZ.spring(300, 22), kY: BZ.spring(260, 20), kR: BZ.spring(260, 18), swX: BZ.spring(120, 14), swY: BZ.spring(120, 14), drop: BZ.spring(160, 20),
    };
    for (const id of ORDER) state[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    models.smg.visible = true;
    const HIP = new THREE.Vector3(0.25, -0.25, -0.56); const ADS = new THREE.Vector3(0, -0.125, -0.32);

    const W = () => WEAPONS[S.cur];
    // the build stretches every magazine and reserve
    const magOf = (w) => (w.melee ? Infinity : Math.max(1, Math.round(w.mag * G.build.magMul())));
    const resOf = (w) => (w.reserve === Infinity ? Infinity : Math.round(w.reserve * G.build.magMul()));
    const ammo = () => state[S.cur];

    // ---------- the one weapon in hand ----------
    const has = (id) => S.inv.includes(id);
    function select(id) {
      if (!has(id) || (id === S.cur && S.phase !== 'holster')) return;
      S.next = id; S.phase = 'holster'; S.t = 0; S.swing = null;
    }
    // the weapon in hand changes at once (a test hands one over): show it without a holster dip
    function forceTo(id) {
      models[S.cur].visible = false; models[S.cur].userData.flash.visible = false;
      S.cur = id; S.next = null; models[id].visible = true; S.phase = 'draw'; S.t = 0; S.swing = null; S.drop.x = 1;
      G.audio.play('switch', { gain: 0.7 }); if (id === 'saber') G.audio.play('saber_on', { gain: 0.8 });
    }
    // test hook: put a weapon in the hand
    function give(id) { state[id].mag = magOf(WEAPONS[id]); state[id].reserve = Infinity; if (S.cur !== id) { S.inv = [id]; forceTo(id); } }
    function refill(k = 1) { for (const id of S.inv) { const r = resOf(WEAPONS[id]); if (r !== Infinity) state[id].reserve = Math.max(state[id].reserve, Math.round(r * k)); } }
    // ---------- melee: keyframed swings (pos x,y,z, yaw, pitch, roll, twist about the blade) ----------
    const KF = {
      idle: [0.3, -0.38, -0.5, 0.12, -0.5, -0.3, 0.25], idleAxe: [0.33, -0.44, -0.48, 0.22, -0.32, -0.25, 0.35],
      r2l: [[0.52, -0.14, -0.46, -0.9, -1.3, -0.35, 1.57], [-0.4, -0.34, -0.52, 0.95, -1.45, 0.35, 1.57]],
      l2r: [[-0.36, -0.1, -0.48, 0.9, -1.3, 0.35, -1.57], [0.5, -0.36, -0.5, -0.95, -1.45, -0.35, -1.57]],
      over: [[0.26, -0.06, -0.5, 0.1, 0.22, -0.25, 0], [0.04, -0.52, -0.62, 0, -2.0, 0, 0]],
      spin: [[0.5, -0.2, -0.44, -1.35, -1.4, -0.3, 1.57], [-0.4, -0.32, -0.5, 1.5, -1.45, 0.3, 1.57]],
      // a full turn about the hand: the yaw runs 350 degrees inside one swing
      spin360: [[0.4, -0.2, -0.5, -1.2, -1.25, -0.2, 0], [-0.3, -0.25, -0.52, 4.9, -1.3, 0.2, 0]],
      // the long weapons: the spear is driven along its own length, the longsword and glaive are held in two hands
      idleSpear: [0.27, -0.26, -0.52, -0.06, -1.15, -0.05, 0], thrust: [[0.3, -0.2, -0.34, -0.03, -1.1, -0.05, 0], [0.2, -0.17, -1.0, -0.06, -1.25, 0, 0]],
      idleSword: [0.3, -0.42, -0.5, 0.1, -0.4, -0.2, 0.3], idleGlaive: [0.28, -0.3, -0.5, 0.0, -1.0, -0.05, 0],
      gr2l: [[0.5, -0.12, -0.46, -0.9, -1.25, -0.2, 0], [-0.4, -0.2, -0.52, 0.95, -1.3, 0.2, 0]], gl2r: [[-0.36, -0.1, -0.48, 0.9, -1.25, 0.2, 0], [0.5, -0.22, -0.5, -0.95, -1.3, -0.2, 0]],
      idleFist: [0, -0.14, -0.55, 0, 0, 0, 0],
      // the hatchet rides low and leans forward, so its head does not fill the view
      idleHatchet: [0.34, -0.47, -0.6, 0.28, -0.8, -0.32, 0.55],
    };
    const PATDIR = { gr2l: -1, gl2r: 1, r2l: -1, l2r: 1, over: 0, spin: -1, thrust: 0, jabR: 0, jabL: 0, upper: 0, spin360: -1, clawR: -1, clawL: 1 };
    const lerpK = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const easeOut = (x) => 1 - (1 - x) * (1 - x);
    const qa = new THREE.Quaternion(); const qb = new THREE.Quaternion(); const ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
    function meleePose(w) {
      const idle = KF[w.idleKF || (S.cur === 'axe' ? 'idleAxe' : 'idle')]; const sw = S.swing;
      let p = idle;
      if (w.hold === 'fists' || w.hold === 'claws') { S.vmPose = idle; return idle; } // the fists and claws move on their own, see fistPose / clawPose
      if (sw) {
        const a = w.hitAt * 0.55; const b = Math.min(w.swing * 0.72, w.hitAt * 1.5); const [wu, en] = KF[sw.pat]; const t = sw.t;
        p = t < a ? lerpK(sw.from, wu, easeOut(t / a)) : t < b ? lerpK(wu, en, ease((t - a) / (b - a))) : lerpK(en, idle, ease(seg(t, b, w.swing)));
      }
      S.vmPose = p;
      return p;
    }
    function applyPose(p, off) {
      rig.position.set(p[0] + off.x, p[1] + off.y, p[2] + off.z);
      rig.quaternion.setFromAxisAngle(ax.y, p[3]).multiply(qa.setFromAxisAngle(ax.x, p[4])).multiply(qa.setFromAxisAngle(ax.z, p[5])).multiply(qb.setFromAxisAngle(ax.y, p[6]));
    }
    // blade trail: a ribbon swept by the blade over the last fifth of a second. Three rows: a white-hot edge at the tip,
    // the weapon's colour through the middle, nothing at the base; it narrows and fades as it ages.
    const TRAIL_N = 26; const TRAIL_LIFE = 0.2;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3 * 3), 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3 * 3), 3));
    const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); } trailGeo.setIndex(idx);
    const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    trail.frustumCulled = false; vmScene.add(trail);
    const trailPts = [];
    function updateTrail(dt, w) {
      for (const p of trailPts) p.age += dt;
      while (trailPts.length && trailPts[0].age > TRAIL_LIFE) trailPts.shift();
      const sw = S.swing;
      if (w.melee && !w.noTrail && sw && sw.t > w.hitAt * 0.3 && sw.t < Math.min(w.swing * 0.85, w.hitAt * 1.8)) {
        const m = models[S.cur]; rig.updateMatrixWorld(true);
        trailPts.push({ a: m.localToWorld(m.userData.tip.clone()), b: m.localToWorld(m.userData.mid.clone()), age: 0 });
        if (trailPts.length > TRAIL_N) trailPts.shift();
      }
      const pos = trailGeo.attributes.position.array; const col = trailGeo.attributes.color.array; const c = tmpC.setHex(w.trail || 0xffffff);
      const n = trailPts.length; const gain = S.cur === 'saber' ? 1.2 : 0.7;
      for (let i = 0; i < TRAIL_N; i++) {
        const p = trailPts[Math.max(0, Math.min(n - 1, i - (TRAIL_N - n)))]; const o3 = i * 9;
        if (!p) { for (let j = 0; j < 9; j++) { pos[o3 + j] = 0; col[o3 + j] = 0; } continue; }
        const k = Math.pow(Math.max(0, 1 - p.age / TRAIL_LIFE), 1.4) * (i >= TRAIL_N - n ? 1 : 0) * gain; const mk = 0.35 + 0.3 * (1 - k / gain);
        pos[o3] = p.a.x; pos[o3 + 1] = p.a.y; pos[o3 + 2] = p.a.z;
        pos[o3 + 3] = p.a.x + (p.b.x - p.a.x) * mk; pos[o3 + 4] = p.a.y + (p.b.y - p.a.y) * mk; pos[o3 + 5] = p.a.z + (p.b.z - p.a.z) * mk;
        pos[o3 + 6] = p.b.x; pos[o3 + 7] = p.b.y; pos[o3 + 8] = p.b.z;
        col[o3] = (0.55 + c.r * 0.45) * k; col[o3 + 1] = (0.55 + c.g * 0.45) * k; col[o3 + 2] = (0.55 + c.b * 0.45) * k;
        col[o3 + 3] = c.r * k * 0.5; col[o3 + 4] = c.g * k * 0.5; col[o3 + 5] = c.b * k * 0.5; col[o3 + 6] = col[o3 + 7] = col[o3 + 8] = 0;
      }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
      trail.visible = n > 1;
    }
    function startSwing(w) {
      const pat = w.combo[S.combo % w.combo.length]; S.combo++; S.comboT = 0.7; S.lastPat = pat;
      S.swing = { t: 0, pat, hit: false, n: S.combo, from: (S.vmPose || KF.idle).slice() };
      S.cool = w.swing * 0.72;
      setTimeout(() => G.audio.play(w.snd, { gain: 0.85, rate: G.rng.range(0.92, 1.08) * (pat === 'over' ? 0.9 : 1) }), w.hitAt * 400);
      const P = G.player;
      // lunge a step toward a zombie that is just out of reach
      const cam = G.camera; cam.getWorldDirection(d);
      const near = G.zombies.list.some((z) => z.alive && Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z) < w.range * 2);
      if (near && P.onGround) { const fl = Math.hypot(d.x, d.z) || 1; P.vel.x += (d.x / fl) * w.lunge; P.vel.z += (d.z / fl) * w.lunge; }
      S.shots++;
    }
    const sweep = new THREE.Vector3(); const toZ = new THREE.Vector3(); const chest = new THREE.Vector3();
    function meleeHit(w, sw) {
      const P = G.player; const cam = G.camera;
      cam.updateMatrixWorld(); cam.getWorldPosition(o); cam.getWorldDirection(d); right.set(1, 0, 0).applyQuaternion(cam.quaternion); if (G.tps) G.tps.fix(o, d);
      const fl = Math.hypot(d.x, d.z) || 1e-3; const fx = d.x / fl; const fz = d.z / fl;
      const pf = (w.pf && w.pf[sw.pat]) || {}; const arc = pf.arc ?? w.arc; const reach = pf.range ?? w.range; const cleave = pf.cleave ?? w.cleave; const fall = pf.fall ?? w.fall ?? 0.75; const full = arc >= Math.PI - 1e-3;
      const dirX = PATDIR[sw.pat] ?? -1; const high = sw.pat === 'over' || sw.pat === 'upper';
      sweep.set(right.x * dirX, sw.pat === 'over' ? -0.6 : sw.pat === 'upper' ? 0.9 : 0.15, right.z * dirX).add(new THREE.Vector3(fx, 0, fz).multiplyScalar(0.5)).normalize();
      const cands = [];
      for (const z of G.zombies.list) {
        if (!z.alive) continue;
        const s = z.T.scale; const dx = z.pos.x - o.x; const dz = z.pos.z - o.z; const hd = Math.hypot(dx, dz);
        if (hd - 0.45 * s > reach * G.build.meleeRange()) continue;
        const top = z.pos.y + (z.crawl ? 0.7 : z.T.fly ? 1.6 : 2.0) * s;
        if (top < o.y - 2.1 || z.pos.y > o.y + 1.1) continue;
        if (!full && hd > 0.9 * s && (dx * fx + dz * fz) / hd < Math.cos(arc)) continue;
        chest.set(z.pos.x, z.pos.y + (z.crawl ? 0.35 : 1.1) * s, z.pos.z);
        if (!G.world.lineOfSight(o, chest)) continue;
        cands.push({ z, hd, dx, dz });
      }
      cands.sort((a, b) => a.hd - b.hd);
      const hit = cands.slice(0, cleave);
      let kills = 0; let heads = false;
      const bleedNow = S.cur === 'hatchet' && hit.length > 0 && ++SG.axeN % 3 === 0;
      hit.forEach((c, i) => {
        const z = c.z; const s = z.T.scale;
        // the edge passes a little below the eye line on flat swings: aiming straight ahead cuts the chest, aim up for the neck
        const rel = (o.y + (d.y / fl) * c.hd - (high ? 0.2 : 0.5) - z.pos.y) / s;
        let part = z.crawl ? (high && G.rng.chance(0.5) ? 'head' : 'body') : rel > 1.42 || (high && rel > 1.12) ? 'head' : rel < 0.72 ? 'leg' : 'body';
        if (z.headless && part === 'head') part = 'body';
        const crit = rollCrit(w);
        let dmg = w.dmg * G.build.dmgMul() * G.hero.dmgMul() * G.build.meleeMul() * (part === 'head' ? w.head : part === 'leg' ? 0.85 : 1) * (pf.dmg || 1) * (i ? fall : 1) * (crit ? G.build.critMul() : 1);
        toZ.set(c.dx, 0, c.dz).normalize().multiplyScalar(0.6).addScaledVector(sweep, 0.8).setY(0).normalize();
        let status = G.build.onHit(z, dmg, true);
        // Băng's spear chills, and a thrust into a frozen body shatters it (the shock sets off the shatter reaction); Hoả's punches burn
        if (S.cur === 'spear' && i === 0) { const frozen = z.frozen > 0; status = status.concat([[frozen ? 'shock' : 'chill', 1]]); if (frozen) shatterFx(z); } // the tip only: the bodies behind it are pierced, not chilled
        else if (S.cur === 'fists') status = status.concat([['burn', 0.3]]);
        if (bleedNow) status = status.concat([['bleed', 1]]);
        const died = G.zombies.damage(z, dmg, part, toZ, w.impulse * (pf.imp || 1) * (i ? 0.8 : 1), { cut: w.cut, status });
        if (pf.shove && !died && z.vel) { z.vel.x += toZ.x * pf.shove; z.vel.z += toZ.z * pf.shove; z.vel.y = Math.max(z.vel.y, pf.shove * 0.45); }
        if (died) kills++; heads = heads || part === 'head';
        G.events.emit('hit', { z, dmg: Math.round(dmg), part, died, crit, melee: true });
        const at = new THREE.Vector3(z.pos.x, z.pos.y + (part === 'head' ? 1.7 : part === 'leg' ? 0.5 : 1.1) * s * (z.crawl ? 0.3 : 1), z.pos.z);
        if (w.cut === 'saber') G.fx.burst(at, 14, [0xffe0a0, 0xffa040, 0x80f0ff, 0x3a3a3c], { dir: sweep, push: 3, speed: 3, size: 0.07, life: 0.5 });
        else G.fx.burst(at, 22, [0xc0281e, 0x8a1410, 0xb3201a], { dir: sweep, push: 5.5, speed: 3.5, size: 0.09, life: 0.9 });
        // the cut itself: a bright line across the body along the way the blade travelled, in the weapon's colour
        if (i < 3) G.fx.slash(at, w.trail || 0xfff0d0, sw.pat === 'over' || sw.pat === 'upper' ? 1.45 + G.rng.range(-0.2, 0.2) : sw.pat === 'thrust' || sw.pat === 'jabL' || sw.pat === 'jabR' ? G.rng.range(0, 3.1) : (dirX > 0 ? -0.35 : 0.35) + G.rng.range(-0.25, 0.25), (w.hold === 'fists' || sw.pat === 'thrust' ? 0.7 : 1) * Math.min(1.6, s));
        if (i === 0) G.audio.playAt(w.hitSnd, at, { gain: 1, rate: G.rng.range(0.9, 1.1) });
      });
      if (hit.length) {
        S.hits++;
        G.hitStop = Math.max(G.hitStop || 0, w.stop * (1 + 0.35 * (hit.length - 1)) * (kills ? 1.3 : 1));
        P.shake.v += 2 + (w.cut === 'axe' ? 3 : 1) * hit.length;
        P.kick(w.kick.cam * (1 + hit.length * 0.4), dirX * 0.012);
        S.kZ.v -= 2.5; S.kR.v += dirX * 4;
        G.audio.play('marker', { gain: heads ? 1 : 0.6 });
      } else {
        const wh = G.world.raycast(o, d, reach * 0.8);
        if (wh) {
          const at = o.clone().addScaledVector(d, wh.t);
          G.fx.burst(at, 10, [0xfff2a0, 0xffc040, 0xd0d4d8], { dir: new THREE.Vector3(...wh.normal), push: 3, speed: 3, size: 0.05, life: 0.4 });
          G.audio.playAt('clank', at, { gain: 0.8 }); G.hitStop = Math.max(G.hitStop || 0, 0.03); P.shake.v += 1.5; S.kZ.v -= 3;
        }
      }
      if (bleedNow) {
        SG.bleeds++; const z = hit[0].z; const at = chestOf(z);
        G.fx.burst(at, 30, [0xc0281e, 0x8a1410, 0x5a0a08], { dir: sweep, push: 6, speed: 4, size: 0.1, life: 1 }); G.fx.puff(at, { glow: true, s0: 0.6, s1: 1.8, life: 0.2, c0: 0xffe0c0, c1: 0xc0281e, a0: 1, spin: 0 });
        G.ui.pop('CHẢY MÁU', 'critword', at.clone().setY(at.y + 1.2)); G.audio.playAt('gore', at, { gain: 0.8, rate: 1.1 });
      }
      if (S.cur === 'claws') { clawMarks(o, fx, fz, dirX < 0 ? 1 : -1); if (hit.length) G.audio.playAt('gore', o, { gain: 0.35, rate: 1.4 }); }
      const pi = ((sw.n || 1) - 1) % w.combo.length;
      if (S.cur === 'katana' && pi === 2) windBlade(o.clone().addScaledVector(d, 0.6).setY(o.y - 0.3), d, w, false);
      else if (S.cur === 'fists' && pi === 2) fireRing(P.pos.clone(), false);
      if (S.cur === 'glaive') poisonArc(P.pos, fx, fz, sw.pat, false);
      G.events.emit('fired', { weapon: S.cur, kills });
    }
    function meleeUpdate(dt, w, input) {
      if (G.hero && G.hero.storm()) dt *= 1.5;
      dt *= G.build.rateMul();
      const sw = S.swing;
      if (sw) {
        sw.t += dt;
        if (!sw.hit && sw.t >= w.hitAt) { sw.hit = true; meleeHit(w, sw); }
        if (sw.t >= w.swing) S.swing = null;
      } else { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
      const can = S.phase === 'ready' && G.player.alive && !(S.guard > 0.3);
      if (input.fire && can && (!S.swing || S.swing.t >= w.swing * 0.72)) startSwing(w);
    }
    const saberLight = new THREE.PointLight(0x50d8ff, 0, 7, 2); G.scene.add(saberLight);
    function startReload() {
      const w = W(); const a = ammo();
      if (S.phase !== 'ready' || a.mag >= magOf(w) || a.reserve <= 0) return;
      S.phase = 'reload'; S.t = 0; S.shellT = 0; S.evt = {};
    }

    const o = new THREE.Vector3(); const d = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3();
    // ---------- thrown weapons: javelin and shuriken fly as real projectiles ----------
    const projs = [];
    const PROJ = { javelin: { c0: 0xbfeaff, c1: 0x3a8cff, size: 0.16, rate: 75, halo: 0x6ad0ff, haloSize: 0.75, burst: [0x9ad8ff, 0x3a8cff] }, shuriken: { c0: 0xf0dcff, c1: 0x8a3aff, size: 0.1, rate: 80, halo: 0xb060ff, haloSize: 0.5, burst: [0xb060ff, 0xf0d0ff] } };
    function projMesh(kind) {
      const root = new THREE.Group(); const spin = new THREE.Group(); root.add(spin);
      if (kind === 'javelin') { const g = BZ.worldGun('javelin'); g.rotation.y = Math.PI; spin.add(g); } // the model points along -z, the flight along +z
      else for (const [rot, sc] of [[0, 1.6], [Math.PI / 4, 1.25]]) { const g = BZ.worldGun('starProj'); g.rotation.z = rot; g.scale.setScalar(sc); spin.add(g); }
      const P = PROJ[kind]; G.fx.halo(root, P.halo, P.haloSize);
      if (kind === 'javelin') for (const c of root.children) if (c.isSprite) c.position.z = 1.15;
      root.userData.spin = spin;
      return root;
    }
    function spawnProj(w, from, dir, fake, grp) {
      const m = projMesh(w.thrown); m.position.copy(from); G.scene.add(m);
      if (projs.length > 60) G.scene.remove(projs.shift().m);
      const q = { w, kind: w.thrown, m, p: from.clone(), v: dir.clone().multiplyScalar(w.speed), grav: w.grav, pierce: w.pierce || 1, skip: new Set(), power: 1, age: 0, life: 0, stuck: false, fake: !!fake, grp: grp || {}, acc: 0, dmg: w.dmg,
        spin: w.thrown === 'shuriken' ? (G.rng.chance(0.5) ? 1 : -1) * G.rng.range(26, 34) : 0 };
      m.lookAt(q.p.clone().add(q.v)); projs.push(q);
      return q;
    }
    function stickProj(q, at, normal, life) {
      q.stuck = true; q.v.set(0, 0, 0); q.spin = 0; q.life = life; q.p.copy(at);
      if (q.kind === 'shuriken' && normal) { q.m.lookAt(q.p.clone().add(normal)); q.p.addScaledVector(normal, 0.02); }
      q.m.position.copy(q.p);
      for (const c of q.m.children) if (c.isSprite) c.visible = false;
    }
    function projHit(q, h, dir) {
      const w = q.w; const z = h.z; const PJ = PROJ[q.kind];
      const mult = h.part === 'head' ? w.head : h.part === 'leg' ? 0.7 : 1;
      const crit = rollCrit(w);
      const dmg = q.dmg * G.build.dmgMul() * G.hero.dmgMul() * mult * q.power * (crit ? G.build.critMul() : 1);
      const at = q.p.clone().addScaledVector(dir, h.t);
      const chainNow = q.kind === 'javelin' && !q.grp.chained; if (chainNow) q.grp.chained = true;
      const died = G.zombies.damage(z, dmg, h.part, dir.clone(), (w.impulse || 1) * q.power, { status: G.build.onHit(z, dmg, false).concat(chainNow ? [['shock', 1]] : []) });
      if (chainNow) chainLightning(z, at, q.dmg * G.build.dmgMul() * G.hero.dmgMul() * 0.5, false);
      if (q.kind === 'shuriken') setMark(z);
      q.power *= 0.8;
      G.events.emit('hit', { z, dmg: Math.round(dmg), part: h.part, died, crit });
      G.fx.burst(at, 14, [0xc0281e, 0x8a1410, 0xb3201a], { dir, push: 4, speed: 3, size: 0.08, life: 0.8 });
      G.fx.pop(at, 0.3, PJ.burst);
      G.audio.playAt(q.kind === 'javelin' ? 'cleave' : 'chop', at, { gain: 0.9, rate: G.rng.range(0.9, 1.15) });
      if (!q.fake) {
        if (!q.grp.counted) { q.grp.counted = true; S.hits++; } // one hit per throw, so a fan of three cannot push accuracy past 100%
        G.audio.play(h.part === 'head' ? 'head' : 'hit', { gain: 0.7 }); G.audio.play('marker', { gain: h.part === 'head' ? 1 : 0.6 });
        G.hitStop = Math.max(G.hitStop || 0, 0.02);
      }
    }
    const pPos = new THREE.Vector3(); const pDir = new THREE.Vector3();
    function stepProjs(dt) {
      for (let i = projs.length - 1; i >= 0; i--) {
        const q = projs[i]; const PJ = PROJ[q.kind];
        if (q.stuck) {
          q.life -= dt;
          if (q.life < 0.4) q.m.scale.setScalar(Math.max(0.001, q.life / 0.4));
          if (q.life <= 0) { G.scene.remove(q.m); projs.splice(i, 1); }
          continue;
        }
        q.age += dt;
        const n = Math.max(1, Math.ceil(q.v.length() * dt / 1.5)); const hs = dt / n;
        for (let k = 0; k < n && !q.stuck; k++) {
          q.v.y -= q.grav * hs;
          const sp = q.v.length(); pDir.copy(q.v).multiplyScalar(1 / sp); const len = sp * hs;
          const wh = G.world.raycast(q.p, pDir, len); const lim = wh ? wh.t : len;
          if (q.fake && q.kind === 'javelin' && !q.arced) {
            const hz = G.zombies.hitTest(q.p, pDir, lim);
            if (hz) { q.arced = true; chainLightning(hz.z, pPos.copy(q.p).addScaledVector(pDir, hz.t).clone(), 0, true); stickProj(q, pPos.copy(q.p).addScaledVector(pDir, hz.t - 1.0), null, 0.7); break; }
          }
          while (!q.fake && !q.stuck) {
            const hz = G.zombies.hitTest(q.p, pDir, lim, q.skip); if (!hz) break;
            q.skip.add(hz.z); projHit(q, hz, pDir); q.pierce--;
            if (q.pierce <= 0) stickProj(q, pPos.copy(q.p).addScaledVector(pDir, hz.t - (q.kind === 'javelin' ? 1.0 : 0)), null, q.kind === 'javelin' ? 0.7 : 0.02);
          }
          if (q.stuck) break;
          if (wh) {
            const end = pPos.copy(q.p).addScaledVector(pDir, wh.t); const nrm = new THREE.Vector3(...wh.normal);
            G.fx.hole(end.clone(), wh.normal); G.fx.impact(end.clone(), wh.normal, wh.tag);
            G.fx.burst(end.clone(), 8, [0xfff2a0, 0xffc040, 0xd0d4d8], { dir: nrm, push: 3, speed: 3, size: 0.05, life: 0.4 });
            G.audio.playAt(q.kind === 'javelin' ? 'clank' : 'impact', end, { gain: 0.7 });
            if (G.destruct && !q.fake) G.destruct.hit(wh.s, end, q.dmg * 0.5);
            stickProj(q, end.addScaledVector(pDir, q.kind === 'javelin' ? -1.15 : 0), nrm, q.kind === 'javelin' ? 3 : 2.2);
          } else q.p.addScaledVector(pDir, len);
        }
        if (q.stuck) continue;
        q.m.position.copy(q.p); pPos.copy(q.p).add(q.v); q.m.lookAt(pPos);
        if (q.spin) q.m.userData.spin.rotation.z += q.spin * dt;
        G.fx.streak(q, q.p, q.v, PJ.c0, PJ.c1, PJ.size, dt, PJ.rate);
        if (q.age > 5 || q.p.y < -8) { G.scene.remove(q.m); projs.splice(i, 1); }
      }
    }
    function launch(w, storm, spread) {
      const P = G.player; const n = w.pellets + (storm ? 2 : 0);
      const from = o.clone().addScaledVector(d, 0.7);
      if (G.tps && G.tps.on) G.tps.muzzle(from); else from.addScaledVector(right, 0.2).addScaledVector(up, -0.12);
      // lift the aim so the arc comes down on whatever the crosshair is on
      const wh = G.world.raycast(o, d, 70); const zh = G.zombies.hitTest(o, d, wh ? wh.t : 70);
      const D = Math.max(8, zh ? zh.t : wh ? wh.t : 45);
      const tgt = o.clone().addScaledVector(d, D); const T = D / w.speed; tgt.y += 0.5 * w.grav * T * T;
      const base = tgt.sub(from).normalize();
      const grp = {};
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i - (n - 1) / 2) * (w.fan || 0) : 0;
        const dir = base.clone().addScaledVector(right, off + (G.rng.next() - 0.5) * spread).addScaledVector(up, (G.rng.next() - 0.5) * spread).normalize();
        spawnProj(w, from, dir, false, grp);
      }
      G.audio.play(w.snd, { gain: 0.9, rate: w.thrown === 'shuriken' ? G.rng.range(1.3, 1.6) : G.rng.range(0.8, 0.9) });
      S.hideT = w.hide;
      const k = w.kick; S.kZ.v += k.back * 30; S.kP.v += k.rise; S.kY.v += (G.rng.next() - 0.5) * k.yaw * 2; S.kR.v += (G.rng.next() - 0.5) * k.yaw * 3;
      P.kick(k.cam, (G.rng.next() - 0.5) * k.cam * 0.4);
      G.events.emit('fired', { weapon: S.cur, kills: 0 });
    }
    // co-op: another player's throw is drawn here, it hurts nobody
    function cosmeticThrow(id, from, dir) { const w = WEAPONS[id]; if (!w || !w.thrown) return; spawnProj(w, from, dir, true); }
    // the two bare fists: guard, jab (right, left) and the uppercut; everything is in the rig's own space
    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    function fistPose(w) {
      const U = models.fists.userData.parts; const sw = S.swing; const t = performance.now() / 1000;
      const gR = [0.17, -0.03 + Math.sin(t * 2.4) * 0.008, -0.18]; const gL = [-0.2, -0.07 - Math.sin(t * 2.4) * 0.008, -0.22];
      let R = gR; let L = gL; let rx = 0.28; let lx = 0.28;
      if (sw) {
        const k = sw.t / w.swing; const hk = w.hitAt / w.swing; const back = ease(seg(k, hk, 0.95));
        const out = k < hk ? ease(k / hk) : 1 - back;
        if (sw.pat === 'jabR') { R = lerp3(gR, [0.06, 0.0, -0.8], out); rx = 0.28 - 0.3 * out; }
        else if (sw.pat === 'jabL') { L = lerp3(gL, [-0.06, 0.0, -0.8], out); lx = 0.28 - 0.3 * out; }
        else {
          const dip = [0.14, -0.38, -0.14]; const top = [0.02, 0.22, -0.66];
          R = k < hk * 0.6 ? lerp3(gR, dip, ease(k / (hk * 0.6))) : lerp3(dip, top, ease(seg(k, hk * 0.6, hk)));
          if (k > hk) R = lerp3(top, gR, back);
          rx = 0.28 - 0.5 * (k < hk ? ease(seg(k, hk * 0.6, hk)) : 1 - back);
        }
      }
      U.handR.position.set(R[0], R[1], R[2]); U.handL.position.set(L[0], L[1], L[2]); U.handR.rotation.x = rx; U.handL.rotation.x = lx;
    }
    // the two claws: raised in a guard, claws up; a swipe winds out high on its side and rakes down across the view
    function clawPose(w) {
      const U = models.claws.userData.parts; const sw = S.swing; const t = performance.now() / 1000; const b = Math.sin(t * 2.6) * 0.01;
      const gR = [0.2, -0.06 + b, -0.27]; const gL = [-0.22, -0.08 - b, -0.29];
      let R = gR; let L = gL; let rzR = -0.25; let rzL = 0.25; let rxR = 0.55; let rxL = 0.55;
      if (sw) {
        const k = sw.t / w.swing; const hk = w.hitAt / w.swing; const sg = sw.pat === 'clawL' ? -1 : 1;
        const up = [0.36 * sg, 0.16, -0.3]; const end = [-0.24 * sg, -0.24, -0.44]; const g = sg > 0 ? gR : gL;
        const P3 = k < hk * 0.55 ? lerp3(g, up, ease(k / (hk * 0.55))) : k < hk * 1.5 ? lerp3(up, end, ease(seg(k, hk * 0.55, hk * 1.5))) : lerp3(end, g, ease(seg(k, hk * 1.5, 1)));
        const rz = k < hk * 0.55 ? -0.9 * sg : k < hk * 1.5 ? BZ.lerp(-0.9, 0.7, seg(k, hk * 0.55, hk * 1.5)) * sg : BZ.lerp(0.7 * sg, -0.25 * sg, seg(k, hk * 1.5, 1));
        if (sg > 0) { R = P3; rzR = rz; rxR = 0.3; } else { L = P3; rzL = rz; rxL = 0.3; }
      }
      U.handR.position.set(R[0], R[1], R[2]); U.handL.position.set(L[0], L[1], L[2]);
      U.handR.rotation.set(rxR, 0, rzR); U.handL.rotation.set(rxL, 0, rzL);
    }
    // three glowing rake marks across the air in front of a claw swipe (also drawn for other players' swipes)
    function clawMarks(o, fx, fz, sg) {
      const rt = V().set(-fz, 0, fx);
      for (let j = -1; j <= 1; j++) for (let i = 0; i < 7; i++) {
        const k = i / 6; const at = V().set(o.x + fx * 1.5, o.y - 0.15 + BZ.lerp(0.45, -0.35, k) + j * 0.13, o.z + fz * 1.5).addScaledVector(rt, BZ.lerp(0.75, -0.75, k) * sg);
        G.fx.puff(at, { glow: true, s0: 0.24, s1: 0.04, life: 0.2, c0: 0xffffff, c1: 0xff7a24, a0: 1, spin: 0, delay: i * 0.01 });
      }
    }

    // ================= signatures: the one thing each hero's weapon does that no other weapon does =================
    const SG = { t: 0, heat: 0, jamT: 0, mark: null, tpCd: 0, sureCrit: false, altHeld: false, blockT: 0, blockSnd: 0, chainN: 0, healed: 0, healCd: new Map(), booms: 0, splits: 0, pinned: 0, tps: 0, later: [], axeN: 0, bleeds: 0, webs: 0 };
    S.guard = 0;
    const V = () => new THREE.Vector3();
    const guest = () => !!(G.coop && G.coop.guest);
    const chestOf = (z) => V().set(z.pos.x, z.pos.y + (z.crawl ? 0.35 : 1.1) * z.T.scale, z.pos.z);
    function rollCrit(w) { if (SG.sureCrit) { SG.sureCrit = false; return true; } return G.rng.chance((w.crit || 0.08) + G.build.critAdd() + G.hero.critAdd()); }
    const fade = (m, k) => { for (const c of m.children) if (c.material) c.material.opacity = c.userData.op * k; };
    const addMesh = (geo, col, op, normal) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.userData.op = op; return m; };
    const drop = (m) => { G.scene.remove(m); m.traverse((c) => { if (c.material && c.material.dispose && !c.userData.keep) c.material.dispose(); }); };

    // ---- Gió: every third katana cut throws a crescent of wind that flies 14 m and cuts all it passes ----
    const blades = []; let bladeGeo = null;
    function windBlade(from, dir, w, fake) {
      if (!bladeGeo) bladeGeo = [new THREE.RingGeometry(0.8, 1.3, 30, 1, Math.PI / 2 - 1.2, 2.4).translate(0, -0.9, 0), new THREE.RingGeometry(1.08, 1.2, 30, 1, Math.PI / 2 - 1.1, 2.2).translate(0, -0.9, 0)];
      const h = V().set(dir.x, 0, dir.z); if (h.lengthSq() < 1e-6) return; h.normalize();
      const g = new THREE.Group(); g.add(addMesh(bladeGeo[0], 0x3fc8bc, 0.5, true), addMesh(bladeGeo[1], 0xf4fffd, 0.95, true));
      g.position.copy(from); g.lookAt(from.clone().add(h)); g.rotateZ((G.rng.chance(0.5) ? 1 : -1) * G.rng.range(0.45, 0.8)); g.rotateX(-0.35); g.renderOrder = 5; G.scene.add(g);
      blades.push({ g, p: from.clone(), dir: h, v: h.clone().multiplyScalar(26), left: 14, skip: new Set(), w, fake, age: 0, sl: {}, sr: {} });
      G.audio.playAt('saber_swing', from, { gain: 0.75, rate: 1.7 }); G.audio.playAt('swipe', from, { gain: 0.6, rate: 0.7 });
    }
    function stepBlades(dt) {
      for (let i = blades.length - 1; i >= 0; i--) {
        const b = blades[i]; b.age += dt;
        const step = Math.min(b.left, 26 * dt); const wh = G.world.raycast(b.p, b.dir, step); const seg = wh ? wh.t : step;
        if (!b.fake) for (const z of G.zombies.list) {
          if (!z.alive || b.skip.has(z)) continue;
          const s = z.T.scale; const rx = z.pos.x - b.p.x; const rz = z.pos.z - b.p.z;
          const t = BZ.clamp(rx * b.dir.x + rz * b.dir.z, 0, seg);
          if (Math.hypot(rx - b.dir.x * t, rz - b.dir.z * t) > 1.0 + 0.3 * s) continue;
          const top = z.pos.y + (z.crawl ? 0.7 : z.T.fly ? 1.6 : 2.0) * s; if (top < b.p.y - 1.2 || z.pos.y > b.p.y + 0.8) continue;
          b.skip.add(z);
          const crit = rollCrit(b.w); const dmg = b.w.dmg * 0.6 * G.build.dmgMul() * G.hero.dmgMul() * G.build.meleeMul() * (crit ? G.build.critMul() : 1);
          const at = chestOf(z);
          const died = G.zombies.damage(z, dmg, 'body', b.dir.clone(), 0.9, { cut: 'blade', status: G.build.onHit(z, dmg, true) });
          G.events.emit('hit', { z, dmg: Math.round(dmg), part: 'body', died, crit, melee: true, sig: 'wind' });
          G.fx.burst(at, 14, [0xc0281e, 0x8a1410, 0xd8fff8], { dir: b.dir, push: 4, speed: 3, size: 0.08, life: 0.7 });
          G.fx.puff(at, { glow: true, s0: 0.5, s1: 1.6, life: 0.18, c0: 0xffffff, c1: 0x60e8d8, a0: 0.9 });
          G.audio.playAt('chop', at, { gain: 0.6, rate: 1.3 });
        }
        b.p.addScaledVector(b.dir, seg); b.left -= seg; b.g.position.copy(b.p);
        b.g.scale.setScalar(0.7 + 0.5 * Math.min(1, b.age / 0.25)); fade(b.g, BZ.clamp(b.left / 4, 0, 1));
        const sx = b.dir.z * 0.95; const sz = -b.dir.x * 0.95;
        G.fx.streak(b, b.p, b.v, 0xe8fffa, 0x40c8c0, 0.4, dt, 40);
        G.fx.streak(b.sl, V().set(b.p.x + sx, b.p.y, b.p.z + sz).addScaledVector(b.dir, -0.4), b.v, 0xc8fff4, 0x30a8a0, 0.25, dt, 35);
        G.fx.streak(b.sr, V().set(b.p.x - sx, b.p.y, b.p.z - sz).addScaledVector(b.dir, -0.4), b.v, 0xc8fff4, 0x30a8a0, 0.25, dt, 35);
        if (wh || b.left <= 0.01) {
          if (wh) G.fx.puff(b.p.clone(), { glow: true, s0: 0.8, s1: 2.4, life: 0.25, c0: 0xffffff, c1: 0x60e8d8, a0: 0.9 });
          drop(b.g); blades.splice(i, 1);
        }
      }
    }

    // ---- Thép: a shield on the left arm; held up (right mouse) it takes 80% off hits from the front, but he walks slowly and cannot swing ----
    const shieldVm = BZ.worldGun('shield'); shieldVm.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.fog = false; m.userData.keep = true; } });
    shieldVm.scale.setScalar(0.5); shieldVm.visible = false; vmScene.add(shieldVm);
    const SHV = { lo: new THREE.Vector3(-0.44, -0.5, -0.6), hi: new THREE.Vector3(-0.2, -0.22, -0.55), qlo: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0.75, 0.2)), qhi: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.22, 0.04)) };
    const flashMats = (g, k) => { const c = tmpC.setRGB(0.08 * k, 0.18 * k, 0.4 * k); g.traverse((m) => { if (m.isMesh && m.material.emissive && m.name !== 'g_glow_blue') m.material.emissive.copy(c); }); };
    function takenMul(from) {
      if (S.cur !== 'longsword' || S.guard < 0.5 || !from || !G.player.alive) return 1;
      const P = G.player; const dx = from.x - P.pos.x; const dz = from.z - P.pos.z; const l = Math.hypot(dx, dz); if (l < 1e-3) return 1;
      if ((dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / l < Math.cos((50 * Math.PI) / 180)) return 1;
      SG.blockT = 0.22; S.kZ.v += 3; S.kR.v -= 2; P.shake.v += 1.5;
      const at = V().set(P.pos.x - Math.sin(P.yaw) * 0.7, P.pos.y + 1.25, P.pos.z - Math.cos(P.yaw) * 0.7);
      G.fx.burst(at, 10, [0xfff2a0, 0xffd080, 0xd0e4ff], { dir: V().set(dx / l, 0.3, dz / l), push: 3, speed: 3, size: 0.05, life: 0.35 });
      G.fx.puff(at, { glow: true, s0: 0.6, s1: 1.4, life: 0.12, c0: 0xffffff, c1: 0x60a0ff, a0: 1 });
      if (SG.t - SG.blockSnd > 0.08) { SG.blockSnd = SG.t; G.audio.play('clank', { gain: 0.9, rate: G.rng.range(0.85, 1.0) }); G.ui.pop('ĐỠ', 'critword', at.clone().setY(at.y + 0.5)); }
      return 0.2;
    }

    // ---- Y Tá: a dart passing a teammate or a hired soldier heals 10 ----
    function healAlong(a, b) {
      const ab = V().subVectors(b, a).addScaledVector(V().subVectors(b, a).normalize(), 2); const L2 = ab.lengthSq() || 1;
      const near = (p) => { const t = BZ.clamp(V().subVectors(p, a).dot(ab) / L2, 0, 1); return V().copy(a).addScaledVector(ab, t).distanceTo(p) < 1.5; };
      const ready = (k) => { if ((SG.healCd.get(k) || 0) > SG.t) return false; SG.healCd.set(k, SG.t + 0.3); return true; };
      for (const al of G.allies.list) {
        if (!al.alive || al.puppet || al.hp >= BZ.ALLY.hp) continue;
        const c = V().set(al.pos.x, al.pos.y + 1.1, al.pos.z); if (!near(c) || !ready(al)) continue;
        const n = Math.min(10, BZ.ALLY.hp - al.hp); al.hp += n; SG.healed += n;
        G.fx.pop(c, 0.5, [0x60e070, 0xc0ffc0]); G.fx.burst(c, 8, [0x60e070, 0xffffff], { speed: 2, size: 0.06, life: 0.5, grav: -2 }); G.ui.pop('+' + Math.round(n), 'dmg ally', c.clone().setY(c.y + 1.1));
      }
      if (G.coop && G.coop.on) for (const [pid, av] of G.coop.avatars) {
        if (!av.alive) continue;
        const c = V().set(av.pos.x, av.pos.y + 1.1, av.pos.z); if (!near(c) || !ready(pid)) continue;
        G.hero.send('healdart', { to: pid, n: 10, p: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] }); SG.healed += 10;
      }
    }

    // ---- Mưa: heat; at 100% the minigun jams for 1.2 s and vents steam ----
    function jam() {
      SG.jamT = 1.2; S.cool = Math.max(S.cool, 0.2);
      G.audio.play('clank', { gain: 0.9, rate: 0.6 }); G.audio.play('jet', { gain: 0.7, rate: 0.6 });
    }
    function heatGlow(g, k) {
      if (!g) return;
      if (!g.userData.own) { g.userData.own = true; g.traverse((m) => { if (m.isMesh) m.material = m.material.clone(); }); }
      const e = BZ.clamp((k - 0.35) / 0.65, 0, 1); const r = e; const gg = e * e * 0.35; const b = e * e * e * 0.12;
      g.traverse((m) => { if (m.isMesh && m.material.emissive) m.material.emissive.setRGB(r, gg, b); });
    }
    function muzzleNow(out) {
      const c = G.camera; c.updateMatrixWorld(); c.getWorldPosition(out); const f = V(); c.getWorldDirection(f); const rt = V().set(1, 0, 0).applyQuaternion(c.quaternion);
      out.addScaledVector(f, 0.9).addScaledVector(rt, 0.18).y -= 0.15;
      if (G.tps && G.tps.on) G.tps.muzzle(out);
      return out;
    }

    // ---- Bóng: a star marks the zombie it hits for 4 s; right mouse steps behind the mark and makes the next hit a sure crit ----
    const markSpr = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.translate(32, 32);
      const gr = c.createRadialGradient(0, 0, 4, 0, 0, 31); gr.addColorStop(0, 'rgba(200,140,255,0.7)'); gr.addColorStop(1, 'rgba(120,40,220,0)'); c.fillStyle = gr; c.fillRect(-32, -32, 64, 64);
      c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 7 : 25; const an = (i * Math.PI) / 4 - Math.PI / 2; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.closePath();
      c.fillStyle = '#e4c4ff'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#3a0a6a'; c.stroke(); c.fillStyle = '#5a1aa0'; c.beginPath(); c.arc(0, 0, 4, 0, 7); c.fill();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false })); s.renderOrder = 8; s.visible = false; G.scene.add(s); return s;
    })();
    function setMark(z) {
      if (!z.alive) return; const fresh = !SG.mark || SG.mark.z !== z; SG.mark = { z, t: 4 };
      if (fresh) { G.fx.puff(chestOf(z).setY(z.pos.y + 2.3 * z.T.scale), { glow: true, s0: 1.2, s1: 0.3, life: 0.25, c0: 0xffffff, c1: 0xa050ff, a0: 1 }); G.audio.play('marker', { gain: 0.5, rate: 0.6 }); }
    }
    function blink() {
      const P = G.player; const z = SG.mark && SG.mark.z;
      if (SG.tpCd > 0 || !z || !z.alive || !P.alive) { G.audio.play('deny', { gain: 0.5 }); return false; }
      let dx = z.pos.x - P.pos.x; let dz = z.pos.z - P.pos.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const dh = V().set(dx, 0, dz); let back = 1.1 + 0.45 * z.T.scale;
      for (const y of [0.4, 1.4]) { const wh = G.world.raycast(V().set(z.pos.x, z.pos.y + y, z.pos.z), dh, back + 0.45); if (wh) back = Math.min(back, wh.t - 0.45); }
      back = Math.max(0.55, back);
      const from = V().set(P.pos.x, P.pos.y + 1, P.pos.z);
      P.pos.set(z.pos.x + dx * back, z.pos.y, z.pos.z + dz * back); P.vel.set(0, 0, 0);
      P.yaw = Math.atan2(dx, dz); P.pitch = Math.atan2(z.pos.y + 1.2 * z.T.scale - (P.pos.y + 1.6), back) * 0.6;
      const to = V().set(P.pos.x, P.pos.y + 1, P.pos.z);
      for (const at of [from, to]) { G.fx.pop(at, 0.9, [0xb060ff, 0x5a20a0]); for (let i = 0; i < 6; i++) G.fx.puff(at.clone().add(V().set(G.rng.range(-0.4, 0.4), G.rng.range(-0.8, 0.6), G.rng.range(-0.4, 0.4))), { vel: V().set(0, 0.8, 0), drag: 1.5, s0: 0.5, s1: 1.4, life: 0.8, c0: 0x2a1040, c1: 0x5a3080, a0: 0.7 }); }
      G.audio.play('saber_on', { gain: 0.8, rate: 1.9 }); G.audio.play('swipe', { gain: 0.8, rate: 0.6 });
      SG.sureCrit = true; SG.tpCd = 6; SG.mark = null; SG.tps++;
      G.ui.pop('CHÍ MẠNG KẾ', 'critword', V().set(z.pos.x, z.pos.y + 2.6 * z.T.scale, z.pos.z));
      return true;
    }

    // ---- Pháo Thủ: the rocket breaks into three bomblets after 0.35 s or on its first hit ----
    const rockets = []; let rkGeo = null; let bmGeo = null;
    function clusterRocket(from, dir, fake) {
      if (!rkGeo) {
        const o2 = { uv: 'fit', vary: 0 }; const RB = new BZ.Builder('crocket');
        RB.box([-0.06, -0.06, -0.3], [0.06, 0.06, 0.25], 'g_body2', o2); RB.box([-0.05, -0.05, -0.42], [0.05, 0.05, -0.3], 'g_red', o2); RB.box([-0.12, -0.01, 0.12], [0.12, 0.01, 0.25], 'g_steel', o2);
        RB.box([-0.065, -0.065, -0.22], [0.065, 0.065, -0.17], 'g_gold', o2); RB.box([-0.065, -0.065, -0.08], [0.065, 0.065, -0.03], 'g_gold', o2); rkGeo = RB.build();
        const BB = new BZ.Builder('bomblet'); BB.box([-0.11, -0.11, -0.11], [0.11, 0.11, 0.11], 'g_red', o2); BB.box([-0.12, -0.035, -0.12], [0.12, 0.035, 0.12], 'g_gold', o2); bmGeo = BB.build();
      }
      const m = rkGeo.clone(); m.position.copy(from); m.lookAt(from.clone().add(dir)); m.rotateY(Math.PI); G.scene.add(m); G.fx.halo(m, 0xffa040, 0.9).position.z = 0.4;
      rockets.push({ kind: 'rocket', m, pos: from.clone(), vel: dir.clone().multiplyScalar(40), g: 1.5, age: 0, fake: !!fake });
    }
    function split(at, vel, onHit, fake) {
      const fwd = V().copy(vel).normalize(); const side = V().set(fwd.z, 0, -fwd.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      G.fx.pop(at, 0.8, [0xffd060, 0xff6a20]); G.audio.playAt('rack', at, { gain: 0.9, rate: 1.5 }); G.audio.playAt('impact', at, { gain: 0.7, rate: 1.3 });
      if (!fake) SG.splits++;
      // struck early: the warhead still bursts where it hit and the bomblets come off smaller; split in flight they carry it all
      const k = G.hero ? G.hero.blastMul() : 1;
      if (onHit && !fake) { G.gear.explode(at.clone(), 5 * k, 220 * k); SG.booms++; }
      for (let j = 0; j < 3; j++) {
        const off = j - 1;
        const v = onHit ? fwd.clone().multiplyScalar(off ? -1.5 : 1.5).addScaledVector(side, off * 5.5).add(V().set(0, 4.5, 0)) : fwd.clone().multiplyScalar(24).addScaledVector(side, off * 4.5).add(V().set(0, 1.5, 0));
        const m = bmGeo.clone(); m.position.copy(at); G.scene.add(m); G.fx.halo(m, 0xffa040, 0.9);
        rockets.push({ kind: 'bomb', m, pos: at.clone().addScaledVector(fwd, onHit ? -0.25 : 0), vel: v, g: 16, age: 0, fuse: onHit ? 0.24 + j * 0.05 : 1.8, fake: !!fake, R: onHit ? 3.2 : 3.6, dmg: onHit ? 110 : 165 });
      }
    }
    function stepRockets(dt) {
      for (let i = rockets.length - 1; i >= 0; i--) {
        const s = rockets[i]; s.age += dt; s.vel.y -= s.g * dt;
        const step = s.vel.length() * dt; const dir = V().copy(s.vel).normalize();
        const wh = G.world.raycast(s.pos, dir, step + 0.2); let hit = wh ? wh.t : null;
        if (s.kind === 'rocket' || s.age > 0.1) { const zh = G.zombies.hitTest(s.pos, dir, wh ? wh.t : step + 0.3); if (zh) hit = zh.t; }
        if (s.kind === 'rocket') G.fx.trail(s.pos.clone().addScaledVector(dir, -0.4)); else G.fx.streak(s, s.pos, s.vel, 0xffe070, 0xff5010, 0.22, dt, 30);
        const end = hit !== null || (s.kind === 'rocket' ? s.age >= 0.35 : s.age >= s.fuse || s.pos.y < 0.08) || s.age > 4 || s.pos.y < -1;
        if (end) {
          const at = hit !== null ? s.pos.clone().addScaledVector(dir, Math.max(0, hit - 0.1)) : s.pos.clone();
          G.scene.remove(s.m); rockets.splice(i, 1);
          if (s.kind === 'rocket') split(at, s.vel, hit !== null, s.fake);
          else if (!s.fake) { const k = G.hero ? G.hero.blastMul() : 1; G.gear.explode(at, s.R * k, s.dmg * k); SG.booms++; }
          continue;
        }
        s.pos.addScaledVector(s.vel, dt); s.m.position.copy(s.pos);
        if (s.kind === 'rocket') { s.m.lookAt(s.pos.clone().add(s.vel)); s.m.rotateY(Math.PI); } else { s.m.rotation.x += dt * 9; s.m.rotation.z += dt * 6; }
      }
    }

    // ---- Băng: the shatter burst (the reaction itself is the zombies' own, set off by the shock) ----
    function shatterFx(z) {
      const at = chestOf(z);
      G.fx.burst(at, 30, [0xf4fbff, 0xbfe6ff, 0x7fd4ff, 0xffffff], { speed: 6, size: 0.13, life: 0.9 });
      G.fx.puff(at, { glow: true, s0: 1.2, s1: 4, life: 0.3, c0: 0xffffff, c1: 0x60c8ff, a0: 1.2 });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; G.fx.puff(at.clone(), { glow: true, vel: V().set(Math.cos(a) * 6, G.rng.range(0, 2), Math.sin(a) * 6), drag: 3, s0: 0.35, s1: 0.05, life: 0.45, c0: 0xffffff, c1: 0x7fd4ff, a0: 1, spin: 0 }); }
      G.audio.playAt('clank', at, { gain: 1, rate: 1.8 }); G.hitStop = Math.max(G.hitStop || 0, 0.08); SG.shatters = (SG.shatters || 0) + 1;
    }

    // ---- Hoả: the uppercut lights a 3.5 m ring of fire around him (his suit is fireproof) ----
    const rings = [];
    function fireRing(pos, fake) {
      const g = V().set(pos.x, pos.y, pos.z); const R = 3.5;
      G.zombies.kinds.hazard('fire', g, R, 3, true);
      for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; const c = Math.cos(a); const s = Math.sin(a);
        G.fx.puff(V().set(g.x + c * 0.6, g.y + 0.3, g.z + s * 0.6), { glow: true, vel: V().set(c * 9, 1.2, s * 9), drag: 2.6, s0: 0.9, s1: 0.3, life: 0.55, c0: 0xffe080, c1: 0xff3a10, a0: 1.1, spin: 0 }); }
      for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; G.fx.puff(V().set(g.x + Math.cos(a) * R * 0.9, g.y + 0.2, g.z + Math.sin(a) * R * 0.9), { glow: true, delay: 0.1 + G.rng.range(0, 0.1), vel: V().set(0, 2.6, 0), drag: 1, s0: 1.0, s1: 0.2, life: 0.8, c0: 0xffe080, c1: 0xff3a10, a0: 1 }); }
      G.fx.puff(V().set(g.x, g.y + 0.5, g.z), { glow: true, s0: 1.5, s1: 6, life: 0.25, c0: 0xffe8a0, c1: 0xff5010, a0: 1 });
      G.audio.playAt('boom', g, { gain: 0.55, rate: 1.7 });
      if (fake) return;
      rings.push({ p: g, r: R, t: 3, acc: 0.5 });
      for (const z of G.zombies.list) { if (!z.alive) continue; const dx = z.pos.x - g.x; const dz = z.pos.z - g.z; const l = Math.hypot(dx, dz); if (l > R || Math.abs(z.pos.y - g.y) > 1.6 || !z.vel) continue; z.vel.x += (dx / (l || 1)) * 1.5; z.vel.z += (dz / (l || 1)) * 1.5; }
    }
    // ---- Độc: each glaive swing leaves poison clouds along its arc for 3 s ----
    const clouds = [];
    function poisonArc(pos, fx, fz, pat, fake) {
      const base = Math.atan2(fx, fz); const pts = pat === 'spin360' ? [0, 1, 2, 3, 4, 5].map((k) => (k / 6) * Math.PI * 2) : [-0.75, 0, 0.75];
      const r = pat === 'spin360' ? 2.4 : 2.2;
      for (const a of pts) {
        const p = V().set(pos.x + Math.sin(base + a) * r, pos.y + 0.5, pos.z + Math.cos(base + a) * r);
        if (clouds.length >= 12) clouds.shift();
        clouds.push({ p, r: 1.4, t: 3, acc: 0, fake: !!fake });
        G.fx.puff(p.clone(), { vel: V().set(0, 0.4, 0), drag: 1.2, s0: 0.6, s1: 2.0, life: 1.0, c0: 0xb8ff70, c1: 0x3a8a20, a0: 0.6 });
      }
    }
    function stepAreas(dt) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const h = rings[i]; h.t -= dt; h.acc += dt; if (h.t <= 0) { rings.splice(i, 1); continue; }
        if (h.acc < 0.5) continue; h.acc = 0;
        for (const z of G.zombies.list) { if (!z.alive) continue; const dx = z.pos.x - h.p.x; const dz = z.pos.z - h.p.z; if (Math.hypot(dx, dz) > h.r || Math.abs(z.pos.y - h.p.y) > 1.6) continue; G.zombies.damage(z, 3, 'body', V().set(dx, 0, dz).normalize(), 0.1, { status: [['burn', 0.5]] }); }
      }
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i]; c.t -= dt; c.acc += dt; if (c.t <= 0) { clouds.splice(i, 1); continue; }
        if (G.rng.chance(dt * 5)) G.fx.puff(c.p.clone().add(V().set(G.rng.range(-0.8, 0.8), G.rng.range(-0.3, 0.4), G.rng.range(-0.8, 0.8))), { vel: V().set(G.rng.range(-0.2, 0.2), 0.25, G.rng.range(-0.2, 0.2)), drag: 1, s0: 0.7, s1: 1.7, life: 1.3, c0: 0xa8ff60, c1: 0x2a6a18, a0: 0.4 * Math.min(1, c.t) });
        if (c.fake || c.acc < 0.5) continue; c.acc = 0;
        for (const z of G.zombies.list) { if (!z.alive) continue; if (Math.hypot(z.pos.x - c.p.x, z.pos.z - c.p.z) > c.r + 0.3 * z.T.scale || z.pos.y > c.p.y + 1 || z.pos.y + 2 * z.T.scale < c.p.y - 1) continue; G.zombies.damage(z, 2, 'body', V().set(0, 0, 1), 0, { status: [['poison', 1]] }); c.ticks = (c.ticks || 0) + 1; SG.cloudTicks = (SG.cloudTicks || 0) + 1; }
      }
    }

    // ---- Sấm: the javelin's impact jumps as lightning to the 4 nearest zombies within 7 m ----
    function chainLightning(z, at, dmg, fake) {
      const near = G.zombies.list.filter((q) => q !== z && q.alive && q.pos.distanceTo(z.pos) < 7).sort((a, b) => a.pos.distanceTo(z.pos) - b.pos.distanceTo(z.pos)).slice(0, 4);
      G.fx.puff(at.clone(), { glow: true, s0: 1.6, s1: 5.5, life: 0.2, c0: 0xffffff, c1: 0x80c0ff, a0: 1.3 });
      G.fx.muzzle(at.clone()); G.audio.playAt('saber_hit', at, { gain: 0.9, rate: 2.2 }); G.audio.playAt('boom', at, { gain: 0.35, rate: 2.6 });
      let from = at;
      for (const q of near) {
        const b = chestOf(q); G.fx.bolt(at, b, 0x4a9cff); G.fx.arc(from, b, 0xbfe4ff);
        G.fx.burst(b, 6, [0xffffff, 0x9ad8ff], { speed: 3, size: 0.05, life: 0.3 });
        if (!fake) { const died = G.zombies.damage(q, dmg, 'body', V().subVectors(b, at).setY(0).normalize(), 0.6, { status: [['shock', 1]] }); G.events.emit('hit', { z: q, dmg: Math.round(dmg), part: 'body', died, chain: true }); }
        from = b;
      }
      if (!fake) SG.chainN = near.length;
    }

    // ---- Kỹ Sư: a nail that hits a zombie with a wall close behind it drives it into the wall and pins it there ----
    const pins = []; const nails = []; const nailGeo = new THREE.BoxGeometry(0.03, 0.03, 0.26); const nailMat = new THREE.MeshLambertMaterial({ color: 0xc0ccd8, emissive: 0x202830 });
    function pinZ(z, pin, died) {
      const n = new THREE.Mesh(nailGeo, nailMat); n.position.copy(pin.at).addScaledVector(pin.dh, -0.08); n.lookAt(pin.at.clone().add(pin.dh)); G.scene.add(n); nails.push({ m: n, t: 1.6 });
      if (nails.length > 12) G.scene.remove(nails.shift().m);
      G.fx.burst(pin.at.clone(), 14, [0xfff6c0, 0xffd080, 0xd0e0f0], { dir: pin.dh.clone().negate(), push: 4, speed: 4, size: 0.04, life: 0.4 });
      G.fx.puff(pin.at.clone(), { glow: true, s0: 0.5, s1: 0.2, life: 0.08, c0: 0xffffff, c1: 0xffc060, a0: 1 });
      G.audio.playAt('clank', pin.at, { gain: 0.8, rate: G.rng.range(1.3, 1.6) });
      if (died || z.T.boss || !z.alive) return;
      SG.pinned++;
      if (guest()) return;
      const k = Math.max(0, pin.t - 0.35); const old = pins.find((p) => p.z === z);
      const tgt = { z, x: z.pos.x + pin.dh.x * k, zz: z.pos.z + pin.dh.z * k, t: 1.2 };
      if (old) Object.assign(old, tgt); else pins.push(tgt);
      z.slowT = Math.max(z.slowT || 0, 1.4);
    }
    function stepPins(dt) {
      for (let i = nails.length - 1; i >= 0; i--) { const n = nails[i]; n.t -= dt; if (n.t <= 0) { G.scene.remove(n.m); nails.splice(i, 1); } }
      for (let i = pins.length - 1; i >= 0; i--) {
        const p = pins[i]; p.t -= dt; const z = p.z; if (!z.alive || p.t <= 0) { pins.splice(i, 1); continue; }
        const k = 1 - Math.exp(-22 * dt); z.pos.x += (p.x - z.pos.x) * k; z.pos.z += (p.zz - z.pos.z) * k; if (z.vel) { z.vel.x = 0; z.vel.z = 0; }
      }
    }

    // ---- per frame: timers, the shield, the blink, the heat, everything flying or lingering, and the HUD bar ----
    function sigUpdate(dt, input, w) {
      const P = G.player; SG.t += dt;
      for (let i = SG.later.length - 1; i >= 0; i--) { const L = SG.later[i]; L.t -= dt; if (L.t <= 0) { SG.later.splice(i, 1); L.f(); } }
      const wantGuard = S.cur === 'longsword' && input.ads && S.phase === 'ready' && P.alive;
      S.guard = BZ.damp(S.guard, wantGuard ? 1 : 0, 16, dt); if (S.guard < 0.01) S.guard = 0;
      if (S.guard > 0.5) { P.slowT = Math.max(P.slowT || 0, 0.05); P.sprinting = false; }
      SG.blockT = Math.max(0, SG.blockT - dt);
      SG.tpCd = Math.max(0, SG.tpCd - dt);
      if (S.cur === 'shuriken') { if (input.ads && !SG.altHeld && S.phase === 'ready') blink(); SG.altHeld = input.ads; } else SG.altHeld = false;
      if (SG.mark) { const z = SG.mark.z; SG.mark.t -= dt; if (!z.alive || SG.mark.t <= 0) SG.mark = null; }
      markSpr.visible = !!SG.mark && G.state === 'playing';
      if (SG.mark) { const z = SG.mark.z; const blinkOff = SG.mark.t < 1 && Math.sin(SG.mark.t * 30) < 0; markSpr.position.set(z.pos.x, z.pos.y + (z.crawl ? 1.2 : 2.45) * z.T.scale, z.pos.z); markSpr.scale.setScalar(0.62 + Math.sin(SG.t * 7) * 0.06); markSpr.material.rotation += dt * 2; markSpr.material.opacity = blinkOff ? 0.25 : 1; }
      if (SG.jamT > 0) {
        SG.jamT -= dt; SG.heat = Math.max(0.45, SG.heat - dt * 0.45);
        if (S.cur === 'minigun' && G.rng.chance(dt * 30)) { const m = muzzleNow(V()); G.fx.puff(m.add(V().set(G.rng.range(-0.1, 0.1), 0, G.rng.range(-0.1, 0.1))), { vel: V().set(G.rng.range(-0.3, 0.3), 1.6, G.rng.range(-0.3, 0.3)), drag: 1.2, s0: 0.25, s1: 1.1, life: 0.9, c0: 0xf4f8fc, c1: 0xb8c0c8, a0: 0.55 }); }
        if (SG.jamT <= 0) { SG.jamT = 0; SG.heat = 0.45; G.audio.play('rack', { gain: 0.8 }); }
      } else if (!(S.cur === 'minigun' && input.fire && S.spin >= 1)) SG.heat = Math.max(0, SG.heat - dt * 0.3);
      stepBlades(dt); stepRockets(dt); stepAreas(dt); stepPins(dt);
      sigHud();
    }
    // ---- per frame, after the viewmodel is posed: the shield, the burning gloves, the glowing barrels, the third-person body ----
    function sigPose(dt) {
      const P = G.player;
      shieldVm.visible = S.cur === 'longsword' && P.alive;
      if (shieldVm.visible) {
        const k = ease(BZ.clamp(S.guard, 0, 1)); shieldVm.position.lerpVectors(SHV.lo, SHV.hi, k); shieldVm.quaternion.slerpQuaternions(SHV.qlo, SHV.qhi, k);
        shieldVm.position.y -= S.drop.x * 0.4 + S.sprintK * 0.08; shieldVm.position.z += SG.blockT * 0.25;
        flashMats(shieldVm, SG.blockT / 0.22);
      }
      if (S.cur === 'fists' && models.fists.visible) {
        rig.updateMatrixWorld(true); const U = models.fists.userData.parts;
        for (const h of [U.handR, U.handL]) if (G.rng.chance(dt * 45)) {
          if (sparks.length >= 48) sparks.shift();
          const p = h.localToWorld(V().set(G.rng.range(-0.04, 0.04), G.rng.range(0.0, 0.05), G.rng.range(-0.08, 0.02)));
          sparks.push({ p, v: V().set(G.rng.range(-0.15, 0.15), G.rng.range(0.5, 1.0), G.rng.range(-0.15, 0.15)), life: 0, max: G.rng.range(0.18, 0.36), s: G.rng.range(0.01, 0.02), c: G.rng.pick([0xffe070, 0xffa030, 0xff5a10]) });
        }
      }
      heatGlow(models.minigun.userData.barrels, SG.jamT > 0 ? 1 : SG.heat);
      if (models.spear.userData.parts.glow) models.spear.userData.parts.glow.material.opacity = 0.6 + Math.sin(SG.t * 5) * 0.12;
      const T = G.tps; if (T && T.on && T.model) {
        bodyFx(T.model, S.cur, dt, { heat: SG.jamT > 0 ? 1 : SG.heat });
      }
    }
    // the look on a hero body (third person and the other players): burning gloves, hot barrels
    function bodyFx(m, wid, dt, st) {
      if (wid === 'fists' && m.root.visible) for (const h of [m.handR, m.handL]) if (G.rng.chance(dt * 16)) {
        const p = h.getWorldPosition(V()); G.fx.puff(p.add(V().set(G.rng.range(-0.06, 0.06), 0, G.rng.range(-0.06, 0.06))), { glow: true, vel: V().set(0, 1.3, 0), s0: 0.24, s1: 0.05, life: 0.35, c0: 0xffd060, c1: 0xff3a10, a0: 1 });
      }
      if (wid === 'minigun' && m.gun) heatGlow(m.gun.getObjectByName('barrels'), st && st.heat || 0);
    }
    // another player's swing, seen here: the same wind blade, fire ring, poison clouds or ice burst, hurting nobody
    function remoteSwing(a, pi) {
      const W = BZ.WEAPONS[a.weapon]; if (!W || !W.melee) return;
      const fx = -Math.sin(a.yaw); const fz = -Math.cos(a.yaw); const pat = W.combo[pi]; const pos = a.pos.clone();
      SG.later.push({ t: W.hitAt, f: () => {
        if (a.weapon === 'katana' && pi === 2) windBlade(V().set(pos.x + fx * 0.8, pos.y + 1.2, pos.z + fz * 0.8), V().set(fx, 0, fz), W, true);
        else if (a.weapon === 'fists' && pi === 2) fireRing(pos, true);
        else if (a.weapon === 'glaive') poisonArc(pos, fx, fz, pat, true);
        else if (a.weapon === 'spear') G.fx.puff(V().set(pos.x + fx * 3, pos.y + 1.3, pos.z + fz * 3), { glow: true, s0: 0.6, s1: 1.6, life: 0.2, c0: 0xffffff, c1: 0x7fd4ff, a0: 0.9 });
        else if (a.weapon === 'claws') clawMarks(V().set(pos.x, pos.y + 1.9, pos.z), fx, fz, pat === 'clawL' ? -1 : 1);
        else if (a.weapon === 'hatchet' && pi === 2) G.fx.burst(V().set(pos.x + fx * 1.8, pos.y + 1.1, pos.z + fz * 1.8), 14, [0xc0281e, 0x8a1410], { speed: 3, size: 0.08, life: 0.7 });
      } });
    }
    const hud = { el: null, k: '' };
    function sigHud() {
      if (!hud.el) { hud.el = document.getElementById('sigbar'); if (!hud.el) return; hud.lab = hud.el.querySelector('small'); hud.bar = hud.el.querySelector('i'); }
      const alt = document.body.classList.contains('touch') ? 'NÚT NGẮM' : 'CHUỘT PHẢI';
      let label = ''; let frac = 0; let cls = '';
      if (S.cur === 'minigun') { label = SG.jamT > 0 ? 'KẸT ĐẠN · XẢ HƠI' : SG.heat > 0.6 ? 'NÓNG · ĐẠN LỬA' : 'NHIỆT NÒNG'; frac = SG.jamT > 0 ? SG.jamT / 1.2 : SG.heat; cls = SG.jamT > 0 ? 'jam' : SG.heat > 0.6 ? 'hot' : 'heat'; }
      else if (S.cur === 'shuriken') { const rdy = SG.tpCd <= 0; label = !rdy ? 'DỊCH CHUYỂN ' + SG.tpCd.toFixed(1) + ' s' : SG.mark ? alt + ' · DỊCH CHUYỂN' : 'DỊCH CHUYỂN · CẦN ĐÁNH DẤU'; frac = rdy ? 1 : 1 - SG.tpCd / 6; cls = rdy && SG.mark ? 'ready' : 'cd'; }
      else if (S.cur === 'longsword') { label = S.guard > 0.5 ? 'GIƠ KHIÊN · CHẶN 80%' : alt + ' · GIƠ KHIÊN'; frac = S.guard; cls = 'shield'; }
      else if (S.cur === 'hatchet') { const n = SG.axeN % 3; label = n === 2 ? 'NHÁT KẾ · CHẢY MÁU' : 'CHẢY MÁU · ' + (n + 1) + '/3'; frac = (n + 1) / 3; cls = n === 2 ? 'ready' : 'cd'; }
      const key = label + cls + Math.round(frac * 40);
      if (key === hud.k) return; hud.k = key;
      hud.el.className = label ? 'on ' + cls : ''; if (!label) return;
      hud.lab.textContent = label; hud.bar.style.width = (frac * 100).toFixed(1) + '%';
    }
    function sigReset() {
      for (const b of blades) drop(b.g); blades.length = 0;
      for (const r of rockets) G.scene.remove(r.m); rockets.length = 0;
      for (const n of nails) G.scene.remove(n.m); nails.length = 0;
      rings.length = 0; clouds.length = 0; pins.length = 0; SG.later.length = 0; SG.healCd.clear();
      Object.assign(SG, { heat: 0, jamT: 0, mark: null, tpCd: 0, sureCrit: false, altHeld: false, blockT: 0, chainN: 0, axeN: 0 });
      S.guard = 0; markSpr.visible = false;
    }

    function fire() {
      const w = W(); const a = ammo(); const P = G.player;
      if (a.mag <= 0) { G.audio.play('empty'); S.cool = 0.25; if (a.reserve > 0) startReload(); return; }
      const storm = G.hero && G.hero.storm();
      const iv = 60 / w.rpm / (storm ? 2.2 : 1) / G.build.rateMul();
      if (!storm) a.mag--; S.cool = w.carry ? Math.max(S.cool, -0.02) + iv : iv; S.shots++; S.cycle = 0; S.rackPlayed = false; S.shellOut = false;
      const side = w.dual ? (S.side = 1 - S.side) : 0; if (w.dual) S.cyc[side] = 0;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldPosition(o);
      cam.getWorldDirection(d); if (G.tps) G.tps.fix(o, d);
      right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      const moving = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) + (P.onGround ? 0 : 1);
      const spread = (w.spread + w.moveSpread * moving) * (1 - S.ads * 0.6) + S.bloom + (G.env ? G.env.spread : 0);
      if (w.thrown) { launch(w, storm, spread); if (a.mag === 0 && a.reserve > 0) S.autoReload = 0.25; return; }
      let anyHit = false; let head = false;
      // Y Tá's left pistol fires healing darts; Mưa's minigun heats up, past 60% its rounds burn; Kỹ Sư's shotgun fires nails
      const dart = S.cur === 'dualpistol' && side === 1; const nails = S.cur === 'shotgun'; const web = !!w.web;
      const hot = !!w.spinUp && SG.heat > 0.6;
      if (w.spinUp) { SG.heat = Math.min(1, SG.heat + 1 / 95); if (SG.heat >= 1) jam(); }
      if (w.rocket) {
        const from = new THREE.Vector3().copy(o).addScaledVector(d, 1.0); if (!(G.tps && G.tps.on)) from.addScaledVector(right, 0.15).addScaledVector(up, -0.05);
        const aim = d.clone().addScaledVector(right, (G.rng.next() - 0.5) * spread).addScaledVector(up, (G.rng.next() - 0.5) * spread).normalize();
        clusterRocket(from, aim, false);
      }
      const muzzleW = new THREE.Vector3().copy(o).addScaledVector(d, 0.6).addScaledVector(right, side ? -0.18 : 0.18).addScaledVector(up, -0.12); if (G.tps) G.tps.muzzle(muzzleW, side);
      const pend = new Map();
      const pellets = w.rocket ? 0 : w.pellets + (storm ? 2 : 0);
      for (let i = 0; i < pellets; i++) {
        const r = Math.sqrt(G.rng.next()) * (i >= w.pellets ? spread + 0.06 : spread); const th = G.rng.next() * Math.PI * 2;
        const dir = d.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
        const wh = G.world.raycast(o, dir, w.range);
        // a rifle round keeps going through the first body (pierce), losing 40% each time
        const skip = new Set(); let zh = null; let power = 1;
        for (let p = 0; p < (w.pierce || 1); p++) {
          const h = G.zombies.hitTest(o, dir, wh ? wh.t : w.range, skip);
          if (!h) break;
          if (!zh) zh = h;
          skip.add(h.z);
          const mult = h.part === 'head' ? w.head : h.part === 'leg' ? 0.7 : 1;
          const fall = w.pellets > 1 ? BZ.clamp(1.25 - h.t / w.range, 0.35, 1) : 1;
          const e = pend.get(h.z) || { dmg: 0, part: 'leg', dir, imp: 0, crit: false };
          const crit = rollCrit(w); if (crit) e.crit = true;
          e.dmg += w.dmg * (dart ? 0.6 : 1) * G.build.dmgMul() * G.hero.dmgMul() * mult * fall * power * (crit ? G.build.critMul() : 1); e.imp += (w.impulse || 1) * fall * power;
          if (nails && !e.pin && p === 0) { const zc = chestOf(h.z); const dh = V().set(dir.x, 0, dir.z).normalize(); const ww = G.world.raycast(zc, dh, 1.8); if (ww) e.pin = { t: ww.t, dh, at: zc.clone().addScaledVector(dh, ww.t) }; }
          if (h.part === 'head' || (h.part === 'body' && e.part === 'leg')) e.part = h.part;
          pend.set(h.z, e);
          anyHit = true; head = head || h.part === 'head';
          power *= 0.6;
        }
        const end = o.clone().addScaledVector(dir, zh ? zh.t : wh ? wh.t : w.range);
        if (zh) {
          // hits accounted above
        } else if (wh) {
          G.fx.hole(end, wh.normal);
          const n = new THREE.Vector3(...wh.normal);
          const dust = { grass: [0x5fae3c, 0x8a5a35], wood: [0xc8954f, 0x8f6232], metal: [0xd0d4d8, 0xffd080], leaves: [0x3d8a2c, 0x4ea03a] }[wh.tag] || [0x9a9c9e, 0x6e6e70];
          G.fx.burst(end, 3, dust, { dir: n, push: 2, size: 0.07, life: 0.6 }); G.fx.impact(end, wh.normal, wh.tag);
          if (G.destruct) G.destruct.hit(wh.s, end, w.dmg || 20);
          if (i === 0) G.audio.playAt('impact', end, { gain: 0.5 });
        }
        if (dart) { G.fx.tracer(muzzleW, end, 0x50ff70); G.fx.puff(end, { glow: true, s0: 0.35, s1: 0.1, life: 0.15, c0: 0xd0ffd0, c1: 0x40e060, a0: 1 }); healAlong(o, end); }
        else if (web) { G.fx.tracer(muzzleW, end, 0xf0f0ff); G.fx.puff(end, { glow: true, s0: 0.45, s1: 0.9, life: 0.2, c0: 0xffffff, c1: 0xffc880, a0: 1 }); G.fx.burst(end, 6, [0xffffff, 0xe8e8f0], { speed: 1.8, size: 0.05, life: 0.4, grav: 4 }); }
        else if (nails && i < 2) G.fx.tracer(muzzleW, end, 0xa0b8d0);
        else if ((w.tracer && S.shots % w.tracer === 0 && i === 0) || (storm && i >= w.pellets)) G.fx.tracer(muzzleW, end, hot ? 0xff5010 : undefined);
      }
      let kills = 0;
      for (const [z, e] of pend) {
        const died = G.zombies.damage(z, e.dmg, e.part, e.dir, e.imp, { status: G.build.onHit(z, e.dmg, false).concat(hot ? [['burn', 1]] : [], web ? [['web', 1]] : []) });
        if (web) SG.webs++;
        if (e.pin) pinZ(z, e.pin, died);
        if (died) kills++;
        G.events.emit('hit', { z, dmg: Math.round(e.dmg), part: e.part, died, crit: e.crit });
      }
      if (anyHit) { S.hits++; G.audio.play(head ? 'head' : 'hit', { gain: 0.7 }); G.audio.play('marker', { gain: head ? 1 : 0.6 }); }
      G.audio.play(w.snd, { gain: 1 }); G.audio.duck();
      G.fx.muzzle(muzzleW);
      const m = models[S.cur]; const fl = side ? m.userData.flashL : m.userData.flash; fl.visible = true; fl.rotation.z = G.rng.next() * 3; S.flashT = 0.045;
      emitSparks(S.cur === 'shotgun' ? 14 : w.spinUp ? 3 : 6, side, dart ? [0xd0ffd0, 0x60ff70, 0x30c050] : hot ? [0xffe070, 0xff6a10, 0xff3a00] : web ? [0xffffff, 0xf0e8d8, 0xffc880] : null);
      if (S.cur !== 'shotgun' && !w.rocket && !web && !(w.spinUp && S.shots % 2)) ejectCasing(side);
      if (w.rocket) { G.fx.burst(new THREE.Vector3().copy(o).addScaledVector(d, -0.6), 10, [0xd0d0d0, 0xa0a0a0, 0xffb040], { speed: 2, size: 0.25, life: 0.9, grav: -0.5, drag: 0.8, bounce: 0 }); }
      // feel: spring kicks + camera pitch kick
      const k = w.kick; const adsK = 1 - S.ads * 0.5;
      S.kZ.v += k.back * 30 * adsK; S.kP.v += k.rise * adsK; S.kY.v += (G.rng.next() - 0.5) * k.yaw * 2; S.kR.v += (G.rng.next() - 0.5) * k.yaw * 3;
      P.kick(k.cam * adsK, (G.rng.next() - 0.5) * k.cam * 0.4);
      S.bloom = Math.min(0.06, S.bloom + w.spread * 0.6);
      if (w.dual) { S.kR.v += side ? 2.2 : -2.2; S.kY.v += side ? -1 : 1; }
      G.events.emit('fired', { weapon: S.cur, kills });
      if (a.mag === 0 && a.reserve > 0) S.autoReload = 0.25;
    }

    function update(dt, input) {
      const w = W(); const a = ammo(); const P = G.player;
      S.cool -= dt; S.bloom = Math.max(0, S.bloom - dt * 0.12);
      if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) { const U = models[S.cur].userData; U.flash.visible = false; if (U.flashL) U.flashL.visible = false; } }
      stepProjs(dt); sigUpdate(dt, input, w);
      const wantAds = input.ads && S.phase === 'ready' && !P.sprinting && !w.melee && !w.noAds;
      S.ads = BZ.damp(S.ads, wantAds ? 1 : 0, 14, dt);

      if (S.phase === 'holster') {
        S.t += dt; S.drop.x = Math.min(1, S.t / 0.18);
        if (S.t >= 0.18) {
          models[S.cur].visible = false; models[S.cur].userData.flash.visible = false;
          S.cur = S.next; S.next = null; models[S.cur].visible = true; S.phase = 'draw'; S.t = 0; G.audio.play('switch', { gain: 0.7 }); if (S.cur === 'saber') G.audio.play('saber_on', { gain: 0.8 });
        }
      } else if (S.phase === 'draw') {
        // the weapon comes up in the first half; the rest is that weapon's own flourish, which a shot or a swing cuts short
        S.t += dt; S.drop.x = 1 - Math.min(1, S.t / 0.22);
        if (S.t >= DRAW_FP || (S.t >= 0.22 && (input.fire || input.ads))) { S.phase = 'ready'; S.drop.x = 0; S.drawK = 1; }
      } else if (S.phase === 'reload') {
        const rdt = dt * (G.hero ? G.hero.reloadMul() : 1) * G.build.reloadMul(); S.t += rdt;
        if (w.perShell) {
          S.shellT += rdt;
          if (S.shellT >= w.perShell) {
            S.shellT = 0; const n = Math.min(1, a.reserve); a.mag += n; a.reserve -= n; G.audio.play('shell_in', { gain: 0.8 }); S.kZ.v -= 1.2; S.kR.v += 1.5;
            if (a.mag >= magOf(w) || a.reserve <= 0) { S.phase = 'ready'; S.pumpT = 0.38; G.audio.play('rack', { gain: 0.8 }); }
          }
          if (input.fire && a.mag > 0 && S.t > 0.2) { S.phase = 'ready'; }
        } else {
          const t = S.t / w.reload;
          for (const [at, snd] of w.rsnd || RELOAD_SOUNDS) if (t >= at && !S.evt[snd]) { S.evt[snd] = true; G.audio.play(snd, { gain: 0.8 }); if (snd === 'mag_in') { S.kZ.v -= 1.5; S.kP.v -= 2; } if (snd === 'rack') S.kZ.v += 1.2; }
          if (S.t >= w.reload) {
            const need = magOf(w) - a.mag; const n = Math.min(need, a.reserve);
            a.mag += n; a.reserve -= n; S.phase = 'ready';
          }
        }
      }
      if (S.autoReload > 0) { S.autoReload -= dt; if (S.autoReload <= 0) startReload(); }

      if (w.melee) meleeUpdate(dt, WEAPONS[S.cur], input);
      else {
        S.hideT = Math.max(0, S.hideT - dt); S.thrT += dt;
        if (w.spinUp) {
          const want = input.fire && S.phase === 'ready' && P.alive && !P.sprinting && a.mag > 0 && !(SG.jamT > 0);
          if (want && S.spin === 0) G.audio.play('saber_on', { gain: 0.45, rate: 2.4 });
          S.spin = BZ.clamp(S.spin + (want ? dt / w.spinUp : -dt / (w.spinUp * 3)), 0, 1);
          S.spinAng = (S.spinAng + S.spin * dt * 46) % (Math.PI * 2);
        }
        const canFire = S.phase === 'ready' && S.cool <= 0 && P.alive && !P.sprinting && (!w.spinUp || (S.spin >= 1 && !(SG.jamT > 0)));
        if (w.windup) {
          if (S.wind) { S.wind.t += dt; if (S.wind.t >= w.windup) { S.wind = null; if (S.phase === 'ready' && P.alive) fire(); } }
          else if (input.fire && canFire && (w.auto || !S.held)) { if (a.mag > 0) { S.wind = { t: 0 }; S.thrT = 0; } else fire(); }
        } else if (input.fire && canFire && (w.auto || !S.held)) fire();
        if (w.slow && input.fire && S.spin > 0.5 && P.onGround) { const k = Math.pow(w.slow, dt * 60); P.vel.x *= k; P.vel.z *= k; }
      }
      S.held = input.fire;

      // viewmodel pose: springs + sway + bob + reload dip + ADS
      const kz = S.kZ.step(dt); const kp = S.kP.step(dt); const ky = S.kY.step(dt); const kr = S.kR.step(dt);
      const sx = S.swX.step(dt, BZ.clamp(-input.lookX * 0.0009, -0.05, 0.05)); const sy = S.swY.step(dt, BZ.clamp(input.lookY * 0.0009, -0.05, 0.05));
      const bobA = (1 - S.ads * 0.85) * Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4) * (P.onGround ? 1 : 0.2);
      const run = 1 + (S.sprintK || 0) * 1.6;
      const bx = Math.sin(P.stride * Math.PI) * 0.012 * bobA * run; const by = -Math.abs(Math.cos(P.stride * Math.PI)) * 0.014 * bobA * run;
      const tilt = pose(dt);
      updateVmFx(dt);
      // a skill cast: the gun dips and tips down for a beat, as if the other hand did something
      S.castT = Math.max(0, (S.castT || 0) - dt); const castK = S.castT > 0 ? Math.sin((1 - S.castT / 0.32) * Math.PI) : 0;
      const shellGun = !!w.perShell;
      const rp = tilt * (shellGun ? 0.12 : 0.16); const rr = tilt * (shellGun ? 0.5 : 0.32); const ry = 0;
      const sprintTilt = P.sprinting ? 1 : 0;
      S.sprintK = BZ.damp(S.sprintK || 0, sprintTilt, 10, dt);
      const pos = HIP.clone().lerp(ADS, S.ads); pos.x += (w.hipX || 0) * (1 - S.ads);
      const lx = shellGun ? 0.05 : 0.17; const ly = shellGun ? 0.07 : 0.2; const lz = shellGun ? 0.02 : 0.08;
      rig.position.set(pos.x + sx + bx - tilt * lx, pos.y + sy + by - S.drop.x * 0.35 - P.landDip * 0.4 + tilt * ly - S.sprintK * 0.05 - castK * 0.12, pos.z + kz * 0.06 + tilt * lz + castK * 0.05);
      rig.rotation.order = 'XYZ';
      rig.rotation.set(kp * 0.02 + rp - S.drop.x * 0.6 - castK * 0.4 - S.sprintK * (0.2 + Math.abs(Math.cos(P.stride * Math.PI)) * 0.08) + 0.05 * (1 - S.ads), ky * 0.02 + ry * 0.6 + S.sprintK * 0.5 + 0.3 * (1 - S.ads), kr * 0.02 + sx * 2 + S.sprintK * 0.25 + 0.06 * (1 - S.ads) + rr + (S.sprintK || 0) * Math.sin(P.stride * Math.PI) * 0.09);
      const wm = WEAPONS[S.cur];
      if (wm.thrown) {
        // arm draws back, then drives through: the whole item rides it
        const tw = wm.windup; const tf = S.thrT; const back = tf < tw ? ease(tf / tw) : 0; const fw = tf >= tw ? Math.sin(Math.PI * seg(tf, tw, tw + 0.32)) : 0;
        rig.position.z += 0.12 * back - 0.34 * fw; rig.position.y += 0.08 * back - 0.05 * fw; rig.rotation.x += 0.4 * back - 0.5 * fw;
      }
      if (models.minigun && models.minigun.userData.barrels) models.minigun.userData.barrels.rotation.z = S.spinAng;
      if (wm.melee) {
        const p = meleePose(wm);
        tmpV.set(sx + bx * 1.4 + kr * 0.004, sy + by * 1.4 - S.drop.x * 0.5 - P.landDip * 0.4 - S.sprintK * 0.06 + Math.sin(performance.now() / 700) * 0.006, kz * 0.05);
        applyPose(p, tmpV);
        if (S.drop.x > 0) rig.rotateX(-S.drop.x * 0.8);
        if (wm.hold === 'fists') fistPose(wm); else if (wm.hold === 'claws') clawPose(wm);
        if (S.guard > 0) { rig.position.x += 0.07 * S.guard; rig.position.y -= 0.12 * S.guard; rig.rotateZ(-0.35 * S.guard); }
      }
      drawPose(wm, dt); fingerPose(wm, dt, castK);
      sigPose(dt);
      updateTrail(dt, wm);
      const saberOn = S.cur === 'saber' && S.phase !== 'holster' && P.alive;
      saberLight.intensity = saberOn ? 2.4 + Math.sin(performance.now() / 45) * 0.25 + (S.swing ? 1.2 : 0) : 0;
      if (saberOn) { const c = G.camera; c.getWorldPosition(o); c.getWorldDirection(d); if (G.tps) G.tps.fix(o, d); right.set(1, 0, 0).applyQuaternion(c.quaternion); saberLight.position.copy(o).addScaledVector(d, 0.7).addScaledVector(right, 0.3); }
      if (models.saber.userData.parts.halo) models.saber.userData.parts.halo.material.opacity = 0.5 + Math.sin(performance.now() / 37) * 0.06;
      vmCam.fov = BZ.lerp(62, 50, S.ads); vmCam.updateProjectionMatrix();
    }

    // Drawing a weapon, each in its own way. k runs 0..1 over DRAW_FP; e is what is left of the move (1 -> 0, eased out).
    function drawPose(wm, dt) {
      const k = S.phase === 'draw' ? Math.min(1, S.t / DRAW_FP) : S.phase === 'holster' ? 0 : 1; S.drawK = k;
      if (k >= 1) { S.drawEvt = 0; return; }
      const e = (1 - k) * (1 - k); const id = S.cur; const hold = wm.hold || (wm.melee ? 'melee' : 'gun'); const once = (n, at, fn) => { if (k >= at && !(S.drawEvt & n)) { S.drawEvt |= n; fn(); } };
      if (id === 'minigun') { rig.position.y -= 0.22 * e; rig.rotateZ(0.5 * e); if (k > 0.45) S.spinAng += dt * 30 * (1 - k) * 2; }                          // heaved up, then the barrels spin once to test
      else if (id === 'bazooka') { rig.position.x += 0.32 * e; rig.position.y += 0.2 * e; rig.rotateZ(-1.1 * e); rig.rotateX(0.5 * e); }                       // swung down off the shoulder
      else if (id === 'shotgun') { rig.rotateZ(0.6 * e); rig.rotateY(-0.4 * e); once(1, 0.55, () => { S.pumpT = 0.38; G.audio.play('rack', { gain: 0.7 }); }); } // up, then racked
      else if (hold === 'dual') { rig.rotateX(-Math.PI * 2 * e); }                                                                                              // both pistols twirl round the trigger fingers
      else if (hold === 'throw') { rig.rotateZ(Math.PI * 4 * e); rig.position.y -= 0.1 * e; }                                                                   // flicked out and spun between the fingers
      else if (hold === 'spear') { rig.rotateX(Math.PI * 2 * e); rig.position.z -= 0.15 * e; }                                                                  // spun end over end, then levelled
      else if (hold === 'glaive') { rig.rotateZ(Math.PI * 2 * e); rig.position.y -= 0.12 * e; once(1, 0.8, () => { S.kZ.v += 1.5; G.audio.play('land', { gain: 0.5, rate: 1.4 }); }); } // one full turn, then planted
      else if (hold === 'sword2') { rig.rotateX(1.5 * e); rig.position.y += 0.34 * e; rig.position.z += 0.1 * e; }                                              // carried down off the shoulder
      else if (hold === 'fists') { const b = Math.sin(Math.PI * Math.min(1, k * 1.4)); const U = models.fists.userData.parts; U.handR.position.x -= 0.13 * b; U.handL.position.x += 0.16 * b; U.handR.position.z -= 0.08 * b; U.handL.position.z -= 0.04 * b;
        once(1, 0.36, () => { G.audio.play('clank', { gain: 0.7, rate: 0.8 }); S.kZ.v += 2; G.player.shake.v += 1.2; if (models.fists.userData.flash) { const f = models.fists.userData.flash; f.visible = true; f.position.set(0, -0.04, -0.3); f.scale.setScalar(0.7); f.material.opacity = 1; S.flashT = 0.07; } }); } // the gloves knock together
      else if (hold === 'claws') { rig.rotateX(1.0 * e); rig.position.y -= 0.2 * e; once(1, 0.3, () => G.audio.play('slash', { gain: 0.5, rate: 1.5 })); }       // the claws spring out
      else if (hold === 'wrist') { rig.rotateZ(1.3 * e); rig.position.x += 0.1 * e; once(1, 0.4, () => G.audio.play('mag_in', { gain: 0.7, rate: 1.4 })); }      // the bow snaps open off the wrist
      else if (wm.melee) { rig.rotateZ(-2.0 * e); rig.position.x += 0.22 * e; rig.position.y += 0.26 * e; once(1, 0.25, () => G.audio.play('slash', { gain: 0.45, rate: 1.3 })); } // pulled from over the shoulder
      else { rig.rotateZ(0.8 * e); rig.rotateY(-0.5 * e); rig.position.y -= 0.05 * e; }                                                                           // from the hip, rolled level
    }
    // Fingers: every weapon has its own grip; the trigger finger works with the shot, a throw opens the hand,
    // the left hand takes the magazine in a reload and opens for a cast; a dead hand lets go.
    function fingerPose(wm, dt, castK) {
      const U = models[S.cur].userData.parts; const fr = U.handR && U.handR.userData.fingers; const fl = U.handL && U.handL.userData.fingers; if (!fr) return;
      const hold = wm.hold || (wm.melee ? 'melee' : 'gun'); const P = G.player;
      let R = hold === 'fists' ? 'fist' : hold === 'claws' ? 'claw' : hold === 'throw' ? 'pinch' : hold === 'wrist' ? 'fist' : wm.melee ? 'grip' : 'trigger';
      let L = hold === 'fists' ? 'fist' : hold === 'claws' ? 'claw' : wm.melee ? (hold === 'melee' ? 'relax' : 'grip') : 'hold';
      if (hold === 'dual') L = 'trigger';
      if (hold === 'throw' && (S.hideT > 0 || S.thrT < (wm.windup || 0) + 0.3) && S.thrT >= (wm.windup || 0)) R = 'open';
      if (wm.melee && S.swing) R = 'fist';
      if (S.phase === 'reload') { const t = S.t / (wm.reload || 1); L = t > 0.1 && t < 0.7 ? 'grip' : 'hold'; }
      if (S.phase === 'draw' && S.drawK < 0.3) R = 'open';
      if (castK > 0.1) L = 'open';
      if (!P.alive) R = L = 'open';
      const sq = wm.melee || hold === 'throw' ? 0 : Math.max(0, 1 - S.cycle / 0.12);
      fr.set(R, dt, hold === 'dual' ? Math.max(0, 1 - S.cyc[0] / 0.12) : sq); if (fl) fl.set(L, dt, hold === 'dual' ? Math.max(0, 1 - S.cyc[1] / 0.12) : 0);
    }
    // dying in first person: the hands open and the weapon drops away out of view
    function deadTick(dt) {
      S.deadK = Math.min(1, (S.deadK || 0) + dt / 0.9); const k = S.deadK; const e = k * k;
      const wm = WEAPONS[S.cur]; fingerPose(wm, dt, 0);
      rig.position.y -= dt * (0.5 + 2.2 * e); rig.position.x += dt * 0.12; rig.rotateZ(dt * (0.8 + 2 * e)); rig.rotateX(-dt * 1.2 * e);
      return k;
    }

    // Moving parts. Reload timeline for magazine guns (t = 0..1 of the reload time):
    // tilt in -> old mag drops (0.14-0.34) -> new mag rises in (0.42-0.62) -> slide/bolt pulled (0.66-0.76), released (0.8) -> tilt out.
    function pose(dt) {
      const w = W(); const a = ammo(); const P = models[S.cur].userData.parts; const dir = models[S.cur].userData.magDir;
      S.cycle += dt; if (S.pumpT > 0) S.pumpT = Math.max(0, S.pumpT - dt);
      let tilt = 0; let mag = 0; let magVis = true; let slide = 0; let pump = 0; let shell = -1;
      if (S.phase === 'reload' && !w.perShell) {
        const t = S.t / w.reload;
        tilt = ease(seg(t, 0, 0.14)) * (1 - ease(seg(t, 0.86, 1)));
        if (t >= 0.14 && !S.evt.dropped) { S.evt.dropped = true; if (!w.rocket) dropMag(); }
        if (t < 0.38) { mag = 0; magVis = t < 0.14; }
        else { mag = -(1 - ease(seg(t, 0.42, 0.62))) * 0.32; magVis = t >= 0.42; }
        if (t >= 0.66) slide = t < 0.8 ? ease(seg(t, 0.66, 0.76)) : 1 - seg(t, 0.8, 0.84);
      } else if (S.phase === 'reload') {
        tilt = ease(Math.min(1, S.t / 0.18)); shell = S.shellT / w.perShell;
      }
      if (S.cur === 'shotgun') {
        if (S.cycle < 0.55) pump = Math.sin(Math.PI * seg(S.cycle, 0.22, 0.5));
        if (S.cycle >= 0.22 && !S.rackPlayed) { S.rackPlayed = true; G.audio.play('rack', { gain: 0.7 }); }
        if (S.cycle >= 0.32 && !S.shellOut) { S.shellOut = true; ejectCasing(); }
        if (S.pumpT > 0) pump = Math.max(pump, Math.sin(Math.PI * (1 - S.pumpT / 0.38)));
      } else if (S.cycle < 0.1) slide = Math.max(slide, 1 - seg(S.cycle, 0.025, 0.1));
      if (S.cur === 'pistol' && a.mag === 0 && S.phase !== 'reload') slide = 1;
      if (w.rocket && a.mag === 0 && S.phase !== 'reload') magVis = false;
      const U = models[S.cur].userData; const hand = P.handL;
      if (U.dual) { const sl = (c) => (c < 0.1 ? 1 - seg(c, 0.025, 0.1) : 0); const sr = S.phase === 'reload' ? slide : 0; P.slide.position.z = 0.055 * Math.max(sl(S.cyc[0]), sr); P.slideL.position.z = 0.055 * Math.max(sl(S.cyc[1]), sr); }
      else if (P.slide) P.slide.position.z = 0.055 * slide;
      S.cyc[0] = Math.min(9, S.cyc[0] + dt); S.cyc[1] = Math.min(9, S.cyc[1] + dt);
      if (w.thrown) { const hid = S.hideT > 0 || (S.phase === 'reload' && S.t / w.reload < 0.55); for (const it of U.items) it.visible = !hid; }
      if (P.bolt) P.bolt.position.z = 0.06 * slide;
      if (P.pump) P.pump.position.z = 0.15 * pump;
      if (P.mag) { P.mag.position.copy(dir).multiplyScalar(-mag); P.mag.visible = magVis; }
      // left hand: rests on the front grip / pump, grabs the magazine during a reload, feeds shells into the shotgun
      hand.position.copy(U.lh);
      if (P.pump) hand.position.z += 0.15 * pump;
      if (S.phase === 'reload' && !w.perShell) {
        const t = S.t / w.reload; const grab = ease(seg(t, 0.06, 0.16)) * (1 - ease(seg(t, 0.62, 0.72)));
        const at = U.magHand.clone().addScaledVector(dir, -mag);
        hand.position.lerp(at, grab);
      }
      if (P.shell) {
        const k = ease(seg(shell, 0, 0.6));
        P.shell.visible = shell >= 0 && shell < 0.7;
        P.shell.position.set(0.05 + 0.14 * (1 - k), 0.035 - 0.12 * (1 - k), -0.2 + 0.06 * (1 - k));
        P.shell.rotation.set(0, -0.9 * (1 - k), 0.4 * (1 - k));
        if (P.shell.visible) hand.position.lerp(P.shell.position.clone().add(new THREE.Vector3(0, -0.05, 0.03)), Math.min(1, S.t / 0.15));
      }
      return tilt;
    }

    function render(renderer) {
      vmCam.aspect = G.camera.aspect; vmCam.updateProjectionMatrix();
      if (G.tps && G.tps.on) return;
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
    }

    // each hero's own gun (endless reserve, there is nowhere else to get ammo for it) and blade
    const kit = () => [(G.hero && G.hero.def && G.hero.def.weapon) || START];
    function reset() {
      const K = kit(); S.inv = K.slice(); S.swing = null; S.combo = 0; trailPts.length = 0;
      for (const id of ORDER) { state[id].mag = magOf(WEAPONS[id]); state[id].reserve = resOf(WEAPONS[id]); models[id].visible = false; }
      state[K[0]].reserve = Infinity;
      S.cur = K[0]; S.next = null; S.phase = 'draw'; S.t = 0; models[K[0]].visible = true; S.ads = 0; S.bloom = 0; S.shots = 0; S.hits = 0; S.pumpT = 0; S.cycle = 9;
      S.spin = 0; S.spinAng = 0; S.wind = null; S.hideT = 0; S.thrT = 9; S.side = 1; S.cyc = [9, 9]; S.lastPat = 'r2l';
      for (const q of projs) G.scene.remove(q.m); projs.length = 0;
      sigReset();
    }

    const sig = () => ({ ...SG, guard: S.guard, blades: blades.length, rockets: rockets.length, rings: rings.slice(), clouds: clouds.slice(), pins: pins.slice() });
    return { deadTick, DRAW_FP, S, state, WEAPONS, ORDER, cosmeticThrow, takenMul, sig, remoteSwing, bodyFx, heatGlow, cosmeticRocket: (from, dir) => clusterRocket(from, dir, true), magOf, resOf, update, render, startReload, give, refill, reset, has, cur: () => S.cur, ammo, spread: () => (W().spread + S.bloom) * (1 - S.ads * 0.6), adsFov: () => W().adsFov };
  };
})();
