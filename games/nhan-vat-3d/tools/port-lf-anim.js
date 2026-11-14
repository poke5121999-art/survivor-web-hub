// Generates lib/lf/anim.js from Lanternfall src/25-anim.js (whole file): mkClip keyframe clips, sampTrack, eulerToR,
// rotUV and HumanAnim (layered pose composer: carry/ready, procedural walk/run, clips, stagger, downed pose, cloak
// springs, lantern pendulum, hip smoothing, two-bone leg IK).
// Usage: node tools/port-lf-anim.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  const code = L.readSrc('src/25-anim.js').slice(1, 208);
  for (const k of ['function mkClip(hit, keys, base)', 'class HumanAnim {', 'legIK(dt, speed) {']) if (!code.includes(k)) throw new Error('anim anchor missing: ' + k);
  return { name: 'anim', out: 'anim.js', tool: 'tools/port-lf-anim.js', from: [['src/25-anim.js', 1, 208]], code };
};
if (require.main === module) L.run('anim');
