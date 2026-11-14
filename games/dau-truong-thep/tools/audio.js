// Audio diagnostic: renders every sound, stem and ambience bed in headless Chrome and gates levels, tone, length, distinctness, event coverage,
// the music's chords, and a 20 s busy-fight mixdown through the real mixer on an OfflineAudioContext.
// Run: timeout 900 node tools/audio.js   (DTT_BASE=https://host to test a deployed copy). Listening copies: node tools/audio-export.js <sheetsDir> <wavDir>
'use strict';
const path = require('path');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { serve } = require('../../../tools/thumb-lib.js');

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const f = (x, n = 2) => Number(x).toFixed(n);
const dist = (a, b) => Math.sqrt(a.env.reduce((q, v, i) => q + (v - b.env[i]) ** 2, 0) / a.env.length);

// Per sound: spectral centroid (Hz) range, duration range (s), minimum share of energy under 150 Hz, minimum time to 90% of the energy (a tail).
const SPEC = {
  fire_shell: { cen: [300, 1300], dur: [0.8, 1.6], low: 0.35, t90: 0.3 },
  fire_bullet: { cen: [1000, 3500], dur: [0.15, 0.4] },
  fire_rail: { cen: [1000, 3000], dur: [1.2, 2.2], t90: 0.3 },
  fire_pulse: { cen: [400, 1500], dur: [0.3, 0.7] },
  fire_rocket: { cen: [1000, 3000], dur: [0.6, 1.2] },
  fire_mortar: { cen: [200, 900], dur: [0.6, 1.3], low: 0.25, t90: 0.2 },
  fire_pellet: { cen: [1500, 5500], dur: [0.3, 0.8] },
  fire_frost: { cen: [2000, 6000], dur: [0.25, 0.7] },
  fire_rivet: { cen: [600, 3000], dur: [0.15, 0.4] },
  fire_tower: { cen: [500, 2000], dur: [0.5, 1.2], low: 0.1 },
  hit_metal: { cen: [400, 2000], dur: [0.2, 0.5] }, hit_heavy: { cen: [200, 900], dur: [0.35, 0.8], low: 0.25 }, hit_wall: { cen: [800, 3000], dur: [0.2, 0.5] },
  hit_shield: { cen: [800, 3000], dur: [0.3, 0.7] }, hit_dome: { cen: [300, 1500], dur: [0.4, 0.9] },
  expl_small: { cen: [400, 1500], dur: [0.6, 1.5], low: 0.2 }, expl_big: { cen: [350, 1100], dur: [1.8, 3.2], low: 0.3, t90: 0.7 },
  death: { cen: [350, 1000], dur: [2.2, 4], low: 0.35, t90: 0.9 },
  tower_hit: { cen: [200, 900], dur: [0.3, 0.7], low: 0.3 }, tower_block: { cen: [700, 2500], dur: [0.4, 1] },
  tower_down: { cen: [400, 1400], dur: [2.8, 4.5], low: 0.35, t90: 1.2, late: 0.03 }, tower_fall: { cen: [500, 1600], dur: [4.5, 6.5], low: 0.35, t90: 2.0, late: 0.03 },
  sk_quake_slam: { low: 0.4 }, sk_beam_fire: { low: 0.25 }, sk_heavy_call: { low: 0.3 },
  ui_click: { dur: [0.04, 0.15] }, ui_hover: { dur: [0.03, 0.12] }, ui_confirm: { dur: [0.15, 0.5] }, ui_back: { dur: [0.1, 0.4] }, ui_deny: { dur: [0.2, 0.6] },
  ui_countdown: { dur: [0.2, 0.6] }, ui_start: { dur: [1, 2], low: 0.2 }, win: { dur: [2.5, 4.5] }, lose: { dur: [2.5, 4.5], low: 0.25 },
  sting_final: { dur: [1.8, 3], low: 0.4 }, sting_tower: { dur: [1.5, 2.5] },
};
// Loudest 100 ms RMS times the table's playback level, per bus.
const LOUD = { gun: [0.03, 0.55], world: [0.05, 0.55], ui: [0.03, 0.4] };
const MECH_WEAPONS = ['fire_shell', 'fire_bullet', 'fire_rail', 'fire_pulse', 'fire_mortar', 'fire_pellet', 'fire_frost', 'fire_rivet'];
const BED_SPEC = { jungle: { cen: [2500, 9000] }, desert: { cen: [600, 2200] }, ice: { cen: [800, 2500] }, lava: { cen: [400, 1600], low: 0.4 }, city: { cen: [300, 1200], low: 0.25 },
  swamp: { cen: [1200, 3500] }, autumn: { cen: [1200, 3500] }, canyon: { cen: [300, 1100] } };
const ULTS = ['sk_quake_slam', 'sk_beam_fire', 'sk_dome', 'sk_rain', 'sk_heavy_call', 'sk_blizzard', 'sk_minefield'];

(async () => {
  const srv = process.env.DTT_BASE ? { base: process.env.DTT_BASE.replace(/\/$/, ''), close() {} } : await serve();
  await require('./lib.js').lockChrome();
  const br = await require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let code = 1;
  try {
    const page = await (await br.newContext()).newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(srv.base + '/games/dau-truong-thep/tools/audio-harness.html');
    await page.waitForFunction('window.__harnessReady === true', null, { timeout: 30000 });

    const timing = await page.evaluate('window.__timing()');
    console.log(`INFO synth ${timing.sfxMs} ms for ${timing.buffers} sound buffers (${timing.sounds} sounds), ${timing.stemMs} ms for ${timing.stems} stems, ${timing.bedAllMs} ms for ${timing.beds} beds (${timing.bedOneMs} ms for the one in use)`);
    const d = await page.evaluate('window.__audioDiag()');
    const items = [...d.sounds.map((s) => ({ ...s, label: s.name + '#' + s.variant, kind: 'sfx' })), ...d.stems.map((s) => ({ ...s, label: s.name, kind: 'stem' })), ...d.beds.map((s) => ({ ...s, label: 'bed ' + s.name, kind: 'bed' }))];
    for (const s of items) {
      check(s.nan === 0, `${s.label} no NaN`);
      check(s.clipped === 0, `${s.label} no clipping (${s.clipped})`);
      if (s.kind === 'bed') {
        check(s.peak <= 0.99 && s.rms >= 0.08 && s.rms <= 0.3, `${s.label} peak ${f(s.peak)} rms ${f(s.rms, 3)} (0.08..0.3)`);
        check(Math.abs(s.dur - s.expected) < 0.01, `${s.label} is ${f(s.dur)}s`);
        check(s.seam < 4, `${s.label} loop seam ${f(s.seam)} (jump / typical sample step)`);
        continue;
      }
      check(s.peak >= 0.25 && s.peak <= 0.99, `${s.label} peak ${f(s.peak)}`);
      check(s.rms > 0.01, `${s.label} rms ${f(s.rms, 3)}`);
      if (s.kind === 'stem') {
        check(Math.abs(s.dur - s.expected) < 0.002, `${s.label} duration ${f(s.dur, 3)}s`);
        check(s.loopJump < 0.1, `${s.label} loop seam ${f(s.loopJump, 3)}`);
        continue;
      }
      check(s.dur >= 0.03 && s.dur <= 6.5, `${s.label} duration ${f(s.dur, 3)}s`);
      check(Math.abs(s.dur - s.expected) < 0.002, `${s.label} matches table dur ${s.expected}`);
      const lv = s.loud * s.vol, [lo, hi] = LOUD[s.bus];
      check(lv >= lo && lv <= hi, `${s.label} loudness ${f(lv, 3)} on ${s.bus} bus (${lo}..${hi})`);
    }

    // Per-category tone, length, weight and tail.
    for (const [name, sp] of Object.entries(SPEC)) {
      const v0 = d.sounds.find((s) => s.name === name && s.variant === 0);
      if (!v0) { check(false, `${name} exists`); continue; }
      for (const v0s of d.sounds.filter((s) => s.name === name)) {
        const v = { ...v0s, label: v0s.name + "#" + v0s.variant };
        if (sp.cen) check(v.centroid >= sp.cen[0] && v.centroid <= sp.cen[1], `${v.label} centroid ${f(v.centroid, 0)} Hz in ${sp.cen.join('..')}`);
        if (sp.dur) check(v.dur >= sp.dur[0] && v.dur <= sp.dur[1], `${v.label} length ${f(v.dur)} s in ${sp.dur.join('..')}`);
        if (sp.low !== undefined) check(v.lowFrac >= sp.low, `${v.label} weight: ${f(v.lowFrac * 100, 0)}% of energy under 150 Hz (>= ${sp.low * 100}%)`);
        if (sp.t90) check(v.t90 >= sp.t90, `${v.label} has a tail: 90% of energy by ${f(v.t90)} s (>= ${sp.t90})`);
        if (sp.late) check(v.lateFrac >= sp.late, `${v.label} rubble/tail: ${f(v.lateFrac * 100, 1)}% of energy in the second half (>= ${sp.late * 100}%)`);
      }
    }
    const c = Object.fromEntries(d.sounds.filter((s) => s.variant === 0).map((s) => [s.name, s]));
    const lower = (a, b) => check(c[a].centroid < c[b].centroid, `centroid ${a} (${f(c[a].centroid, 0)} Hz) lower than ${b} (${f(c[b].centroid, 0)} Hz)`);
    lower('fire_shell', 'fire_bullet'); lower('fire_shell', 'fire_rail'); lower('fire_mortar', 'fire_pellet'); lower('expl_big', 'expl_small');
    lower('hit_wall', 'hit_shield'); lower('ui_click', 'ui_hover'); lower('sk_quake_slam', 'shield_break'); lower('tower_hit', 'tower_block'); lower('hit_heavy', 'hit_metal');
    check(c.sk_quake_slam.lowFrac > c.hit_metal.lowFrac * 3, 'quake slam is far heavier than an armour tick');
    check(c.tower_fall.dur > c.tower_down.dur && c.tower_fall.dur > c.expl_big.dur * 1.8, 'main tower collapse is the longest sound, sub tower collapse longer than a big explosion');
    check(c.tower_fall.lowFrac > c.tower_block.lowFrac * 5, 'tower collapse is heavy, ward block is not');
    const names = d.sounds.map((s) => s.name + s.variant);
    check(new Set(d.sounds.map((s) => s.centroid.toFixed(2) + s.rms.toFixed(4))).size === d.sounds.length, 'no two sounds are identical');
    check(new Set(names).size === names.length, 'sound names unique');
    console.log(`INFO ${new Set(d.sounds.map((s) => s.name)).size} table sounds, ${d.sounds.length} buffers, ${d.stems.length} stems, ${d.beds.length} beds, slowest sync render ${f(Math.max(...d.sounds.map((s) => s.ms)), 0)} ms`);

    // Weapons: every mech has its own, 3+ variants, and no two share a spectral shape.
    for (const n of MECH_WEAPONS) check(d.sounds.filter((s) => s.name === n).length >= 3, `${n} has 3+ variants (${d.sounds.filter((s) => s.name === n).length})`);
    const W = MECH_WEAPONS.map((n) => c[n]);
    let minPair = 99, minName = '';
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) { const x = dist(W[i], W[j]); if (x < minPair) { minPair = x; minName = W[i].name + ' / ' + W[j].name; } }
    check(minPair >= 4.5, `mech weapons are distinct: closest pair ${minName} at ${f(minPair, 1)} dB spectral distance (>= 4.5)`);
    for (const n of ['fire_rocket', 'fire_tower']) {
      const m2 = Math.min(...[...MECH_WEAPONS, n === 'fire_rocket' ? 'fire_tower' : 'fire_rocket'].map((o) => dist(c[n], c[o])));
      check(m2 >= 3, `${n} differs from every other weapon (closest ${f(m2, 1)} dB, >= 3)`);
    }
    const mw = MECH_WEAPONS.map((n) => c[n].loud * c[n].vol);
    check(Math.max(...mw) / Math.min(...mw) <= 5, `mech weapons sit within 14 dB of each other (${f(Math.max(...mw) / Math.min(...mw), 1)}x)`);
    const spread = (n) => { const v = d.sounds.filter((s) => s.name === n); return Math.max(...v.map((a) => Math.max(...v.map((b) => (a === b ? 0 : dist(a, b)))))); };
    for (const n of MECH_WEAPONS) check(spread(n) > 0.3, `${n} variants differ from one another (${f(spread(n), 2)} dB)`);
    // Skills and ultimates.
    for (const n of ULTS) check(c[n].dur >= 1.0 && c[n].loud * c[n].vol >= 0.14, `ultimate sound ${n}: ${f(c[n].dur)} s, loudness ${f(c[n].loud * c[n].vol, 3)}`);
    // Ambience: one bed per theme, each its own.
    for (const th of d.themes) {
      const b = d.beds.find((x) => x.name === th), sp = BED_SPEC[th];
      check(!!b, `theme ${th} has an ambience bed`);
      if (!b || !sp) { check(!!sp, `theme ${th} has a bed spec`); continue; }
      check(b.centroid >= sp.cen[0] && b.centroid <= sp.cen[1], `bed ${th} centroid ${f(b.centroid, 0)} Hz in ${sp.cen.join('..')}`);
      if (sp.low) check(b.lowFrac >= sp.low, `bed ${th} rumble: ${f(b.lowFrac * 100, 0)}% under 150 Hz (>= ${sp.low * 100}%)`);
    }
    let minBed = 99, bedPair = '';
    for (let i = 0; i < d.beds.length; i++) for (let j = i + 1; j < d.beds.length; j++) { const x = dist(d.beds[i], d.beds[j]); if (x < minBed) { minBed = x; bedPair = d.beds[i].name + ' / ' + d.beds[j].name; } }
    check(minBed >= 3.5, `ambience beds are distinct: closest pair ${bedPair} at ${f(minBed, 1)} dB (>= 3.5)`);
    // Music.
    check(d.stems.filter((s) => s.scene === 'match').length >= 6 && d.stems.filter((s) => s.scene === 'menu').length >= 5, `stems: ${d.stems.filter((s) => s.scene === 'match').length} match, ${d.stems.filter((s) => s.scene === 'menu').length} menu`);
    const L = d.stemLevels;
    check(L.m_drums[0] === 0 && L.m_drums[1] > 0.9, 'drums are silent when calm and full at high intensity');
    check(L.m_lead[0] === 0 && L.m_lead[1] > 0.9 && L.m_lead[2] > 0.3, 'lead motif enters with intensity and with tension');
    check(L.m_tension[0] === 0 && L.m_tension[1] === 0 && L.m_tension[2] === 1, 'tension stem plays only under tension');
    check(L.m_pad[0] > 0 && L.m_bass[0] > 0, 'pad and bass are the always-on bed');
    const roots = await page.evaluate('window.__bassRoots()');
    check(roots.measured.every((m, i) => ((m - roots.expected[i]) % 12 + 12) % 12 === 0), `bass plays the chord roots bar by bar (${roots.measured.join(' ')} vs ${roots.expected.join(' ')})`);
    check(new Set(roots.expected).size >= 5, `progression moves through ${new Set(roots.expected).size} different roots`);
    const AMIN = new Set([9, 11, 0, 2, 4, 5, 7, 8]);
    for (const [label, mo] of [['match motif', roots.motif], ['menu motif', roots.menuMotif]]) {
      const notes = mo.flat();
      check(notes.every(([, midi]) => AMIN.has(midi % 12)), `${label} stays in A minor (with the G sharp)`);
      check(mo.length === 8 && mo.every((bar) => bar.length >= 2) && new Set(notes.map((q) => q[1])).size >= 7, `${label}: ${notes.length} notes over 8 bars, ${new Set(notes.map((q) => q[1])).size} pitches`);
      check(notes.every(([st, , len]) => st + len <= 16), `${label} notes fit their bars`);
    }
    const ten = await page.evaluate('window.__tension()');
    check(ten.calm === 0 && ten.none === 0 && ten.over === 0, 'no tension in a calm mid-match, none without a match, none after it is over');
    check(ten.last30 >= 0.5 && ten.last5 > ten.last30 && ten.last5 <= 1, `tension rises through the last 30 s (${f(ten.last30)} -> ${f(ten.last5)})`);
    check(ten.towerOk === 0 && ten.towerLow >= 0.6 && ten.foeLow >= 0.6, `tower tension: healthy 0, own tower low ${f(ten.towerLow)}, enemy tower low ${f(ten.foeLow)}`);

    // Events and UI.
    const cov = await page.evaluate('window.__audioCoverage()');
    check(cov.types.length >= 20, `README lists ${cov.types.length} event types`);
    check(cov.missing.length === 0, 'every noisy event type maps to a sound' + (cov.missing.length ? ' (missing: ' + cov.missing.join(', ') + ')' : ''));
    check(cov.silent.length === 0, 'silent events stay silent');
    for (const [v, n] of Object.entries(cov.vis)) check(n > 0, `weapon vis '${v}' has a fire sound`);
    for (const [k, n] of Object.entries(cov.skills)) check(n > 0, `skill '${k}' makes a sound`);
    for (const [k, n] of cov.sub) check(n > 0, `${k} makes a sound`);
    check(cov.double.length === 0, 'no skill plays both its own sound and a companion event' + (cov.double.length ? ' (double: ' + cov.double.join(', ') + ')' : ''));
    check(Object.keys(cov.skills).length === 24, `all ${Object.keys(cov.skills).length} skill ids covered (expect 24)`);
    const bySound = {};
    for (const [k, snd] of Object.entries(cov.skillSounds)) (bySound[snd] = bySound[snd] || []).push(k);
    const dup = Object.entries(bySound).filter(([, ks]) => ks.length > 1);
    check(dup.length === 0, 'every skill has its own sound' + (dup.length ? ' (shared: ' + dup.map(([s, ks]) => s + ' by ' + ks.join('+')).join('; ') + ')' : ''));
    for (const v of ['shell', 'bullet', 'rail', 'pulse', 'mortar', 'pellet', 'frost', 'rivet']) check(cov.vis[v] > 0, `all-mechs weapon vis '${v}' present`);
    for (const n of ['hover', 'click', 'confirm', 'back', 'error', 'countdown', 'start', 'win', 'lose']) check(cov.uiNames.includes(n), `ui sound '${n}' exists`);

    // The real engine.
    const boot = await page.evaluate('window.__audioBoot()');
    check(boot.errors.length === 0, 'engine accepts every event and ui call' + (boot.errors.length ? ': ' + boot.errors[0] : ''));
    check(boot.noopCall && JSON.stringify(boot.noopMethods) === JSON.stringify(boot.methods), 'noaudio object has the same methods');
    check(boot.progress === 1, 'boot reports progress to 1');
    check(boot.stats.queued === 0 && boot.stats.state === 'running', `background render drained in ${(boot.drainMs / 1000).toFixed(1)}s, context ${boot.stats.state}`);
    check(boot.stats.maxPumpMs < 15, `longest render slice ${f(boot.stats.maxPumpMs, 1)} ms (budget 6), slowest step ${f(boot.stats.maxStepMs, 1)} ms in ${boot.stats.slowest}`);
    check(boot.stats.bed === 'swamp', `ambience bed follows the match theme (playing: ${boot.stats.bed})`);
    check(boot.dom.hover === 1 && boot.dom.back === 1 && boot.dom.confirm === 1 && boot.dom.click === 1 && boot.dom.deny === 1, `page buttons reach the ui sounds by themselves: ${JSON.stringify(boot.dom)}`);

    // The mixer, offline: a 20 s fight with ten mechs.
    const mix = await page.evaluate('window.__mixdown(1)');
    console.log(`INFO busy fight: ${mix.events} events, peak ${f(mix.peak)}, rms ${f(mix.rms, 3)}, crest ${f(mix.crest, 1)}, stolen ${mix.stolen}, dropped ${mix.dropped}, voices ${JSON.stringify(mix.peakVoices)}`);
    check(mix.comp.threshold === -3 && mix.comp.ratio === 2, `master compressor threshold ${mix.comp.threshold} dB ratio ${mix.comp.ratio}`);
    check(mix.nan === 0 && mix.peak <= 0.95, `busy fight peak ${f(mix.peak)} (<= 0.95)`);
    check(mix.pinned < 0.002, `busy fight not pinned at the limiter: ${f(mix.pinned * 100, 3)}% of samples >= 0.95`);
    check(mix.crest >= 3.2, `busy fight keeps dynamics: crest factor ${f(mix.crest, 1)} (>= 3.2)`);
    check(mix.rms >= 0.06 && mix.rms <= 0.25, `busy fight loudness rms ${f(mix.rms, 3)} (0.06..0.25)`);
    check(mix.hiSec / mix.loSec <= 3.5 && mix.loSec > 0.03, `busy fight breathes: loudest second ${f(mix.hiSec, 3)}, quietest ${f(mix.loSec, 3)}`);
    check(mix.stolen + mix.dropped > 0 && mix.peakVoices.gun <= 14 && mix.peakVoices.world <= 20, `voice limits held under load: gun ${mix.peakVoices.gun}/14, world ${mix.peakVoices.world}/20, ${mix.stolen} stolen, ${mix.dropped} dropped`);
    check(mix.notReady === 0, 'nothing skipped for want of a rendered buffer once the queue is drained');
    check(mix.bed === 'jungle', 'mixdown carries the jungle bed');
    const pr = await page.evaluate('window.__mixProbe()');
    const mono = (a) => (a[0] + a[1]) / 2;
    check(mono(pr.own) > mono(pr.near) * 1.4, `own shot louder than the same shot 6 m away (${f(mono(pr.own), 3)} vs ${f(mono(pr.near), 3)})`);
    check(mono(pr.near) > mono(pr.right), `nearer is louder than 12 m (${f(mono(pr.near), 3)} vs ${f(mono(pr.right), 3)})`);
    check(Math.abs(pr.own[0] - pr.own[1]) < 0.02, 'own sound is centred');
    check(pr.right[1] > pr.right[0] * 1.2 && pr.left[0] > pr.left[1] * 1.2, `pan follows screen position: right ${f(pr.right[0], 3)}/${f(pr.right[1], 3)}, left ${f(pr.left[0], 3)}/${f(pr.left[1], 3)}`);
    check(mono(pr.far) < mono(pr.right) * 0.85, `out of earshot adds nothing (${f(mono(pr.far), 3)} vs ${f(mono(pr.right), 3)})`);
    check(pr.ducks >= 2, `heavy shots duck the world bus (${pr.ducks})`);
    check(problems.length === 0, 'page has no console errors' + (problems.length ? ': ' + problems[0] : ''));
    console.log(`INFO boot ${f(boot.bootMs, 0)} ms to first sounds`);
  } catch (e) {
    check(false, 'harness crashed: ' + (e && e.message));
  } finally {
    await br.close();
    srv.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
