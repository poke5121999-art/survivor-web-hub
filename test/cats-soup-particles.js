#!/usr/bin/env node
/* Meo & Sup feature "particles" in node: data/particles.json (tools/export_particles.py) holds the literal values of the
 * Unity ParticleSystem / ParticleSystemRenderer components read from the facility prefab assets (places/place0, lamp/lamp0),
 * and the curve / colour helpers of js/view/features/particles.js evaluate them.
 *   node test/cats-soup-particles.js */
'use strict';
const path = require('path');
const fs = require('fs');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const D = JSON.parse(fs.readFileSync(path.join(G, 'data', 'particles.json'), 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const n = Object.values(D).reduce((a, v) => a + Object.keys(v).length, 0);
check('every main-forest prefab with particle nodes plus lamp0: 129 prefabs, 666 systems', Object.keys(D).length === 129 && n === 666, `${Object.keys(D).length} / ${n}`);
check('keyed by prefab and node path', !!D['places/place0']['place0/targetObj/pt_steam'] && !!D['lamp/lamp0']['lamp0/pt_firebase']);

// soup pot steam (place0 targetObj/pt_steam): one 8 s puff of a 4x4 smoke sheet, ambient alpha-blend material pt_smoke2
const st = D['places/place0']['place0/targetObj/pt_steam'];
check('pt_steam main: not looping, not play-on-awake, life 8 s, size 0.6 x 0.8 x 0.6', st.main.loop === false && st.main.playOnAwake === false && st.main.life === 8 && eq(st.main.size, [0.6, 0.8, 0.6]));
check('pt_steam emission: one burst of 1 at t=0, rate 0', st.emission.rate === 0 && eq(st.emission.bursts, [{ t: 0, n: 1, cycles: 1, every: 0.01, p: 1 }]));
check('pt_steam sheet: 4 x 4 tiles, 8 cycles; vertical billboard (render mode 3)', st.sheet.x === 4 && st.sheet.y === 4 && st.sheet.cycles === 8 && st.renderer.mode === 3);
const sm = st.renderer.materials[0];
check('pt_steam material: Custom/Mobile Alpha Blend Ambient, SrcAlpha OneMinusSrcAlpha, texture pt_smoke2 256 px', sm.shader === 'Custom/Mobile Alpha Blend Ambient' && eq(sm.blend, [5, 10]) && sm.tex._MainTex.name.startsWith('pt_smoke2-') && eq(sm.tex._MainTex.size, [256, 256]));
check('pt_steam colour over lifetime fades in and out (alpha keys 0, 1, 1, 0)', eq(st.colorOL.g.a.map(k => k[1]), [0, 1, 1, 0]));

// pot bubbles (place0 pt_boil): random size between 0.06 and 0.12, 6 per second, 1 s life, looping
const bo = D['places/place0']['place0/pt_boil'];
check('pt_boil: loop, rate 6/s, life 1 s, size random 0.06..0.12', bo.main.loop === true && bo.emission.rate === 6 && bo.main.life === 1 && eq(bo.main.size, [{ r: [0.06, 0.12] }]));
check('pt_boil shape: circle of radius > 0', bo.shape.kind === 'circle' && bo.shape.radius > 0);

// flame glow under the pot and the lantern flame
const fb = D['places/place0']['place0/pt_fire/pt_firebase'];
check('pot fire glow: additive (SrcAlpha One), size 1.5, orange start colour', eq(fb.renderer.materials[0].blend, [5, 1]) && fb.main.size[0] === 1.5 && eq(fb.main.color, { m: 0, c: [1, 0.65031, 0.03302, 1] }));
const lf = D['lamp/lamp0']['lamp0/pt_firebase'];
check('lantern flame lamp0/pt_firebase: size 0.5, loop, additive, texture pt_handLight', lf.main.size[0] === 0.5 && lf.main.loop === true && eq(lf.renderer.materials[0].blend, [5, 1]) && lf.renderer.materials[0].tex._MainTex.name.startsWith('pt_handLight-'));

// water spray (curve emission) keeps the curve keys of the asset
const w = D['places/place0']['place0/p_tool/tool/pt_water'];
check('pt_water rate is a curve x 500 with first key 0.66901', w.emission.rate.m === 500 && w.emission.rate.c[0][1] === 0.66901 && w.emission.rate.c.length === 7);

// every referenced texture exists on disk
let miss = 0;
for (const v of Object.values(D)) for (const s of Object.values(v)) for (const m of s.renderer.materials) for (const t of Object.values(m.tex)) if (!fs.existsSync(path.join(G, 'art', 'particles', `${t.name}.webp`))) miss++;
check('every material texture is in art/particles', miss === 0, `${miss} missing`);
check('no JSON number is out of range (infinite slopes exported as 1e9)', !/Infinity|NaN/.test(fs.readFileSync(path.join(G, 'data', 'particles.json'), 'utf8')));

(async () => {
  // the view module's curve and colour evaluators (pure functions, THREE needed only by the rest of the file)
  const src = fs.readFileSync(path.join(G, 'js/view/features/particles.js'), 'utf8');
  check('view module exposes curve and colorFn', /export function curve/.test(src) && /export function colorFn/.test(src));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
