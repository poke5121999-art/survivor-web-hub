// Generates lib/lf/heroes.js from Lanternfall src/21-heroes.js (whole file): the six heroes (warden, reaver, fletcher,
// lamplighter, apothecary, rimebinder) with build() and animation style, plus DOWN_POSE, lanternBack, finishHero, RB, rdy.
// LF.HEROES / LF.HERO_ORDER stay on the host LF object and are also exported as HEROES / HERO_ORDER.
// Usage: node tools/port-lf-heroes.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  let code = L.readSrc('src/21-heroes.js').slice(1, 284);
  code = L.replaceAll(code, [
    ['LF.HEROES = {};', 'const HEROES = LF.HEROES = {};', 1],
    ['LF.HERO_ORDER = [', 'const HERO_ORDER = LF.HERO_ORDER = [', 1],
  ], 'heroes');
  return { name: 'heroes', out: 'heroes.js', tool: 'tools/port-lf-heroes.js', from: [['src/21-heroes.js', 1, 284]], code };
};
if (require.main === module) L.run('heroes');
