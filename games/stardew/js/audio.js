/*
 * audio.js - every sound in the game, generated in code.
 *
 * Same rule as the art: no files. Not one .ogg, not one .mp3. Everything here
 * is oscillators, a single noise buffer and envelopes, which keeps the page
 * the size it is, keeps it working with no network, and keeps us clear of
 * shipping somebody else's soundtrack - none of this is Stardew's music, it is
 * music written to the same recipe.
 *
 * That recipe, from how the original was actually composed (ConcernedApe's own
 * account plus a track teardown):
 *   - major / minor / mixolydian, nothing more exotic;
 *   - a plucked arpeggio outlining the chord (banjo's job), a bass on the root
 *     and fifth, a mallet-toned melody with a fast attack (marimba's job), and
 *     a shaker for drive;
 *   - phrases answer each other rather than run continuously;
 *   - notes sit slightly behind the beat, which is what makes it amble;
 *   - one mood per season - hopeful spring, bright summer, warm melancholy
 *     autumn, sparse winter - and several variations that come up at random so
 *     a long session does not loop audibly.
 *
 * Three layers, mixed separately so the player can turn any of them down:
 *   MUSIC     - the tune for wherever you are
 *   AMBIENCE  - birds, crickets, surf, rain, cave drip, room tone
 *   SFX       - one-shots: the axe, the hoe, coins, the door, a level-up
 *
 * Nothing starts until the player touches the page, because every browser
 * refuses to make noise before that.
 */
(function (global) {
  'use strict';

  var A = null;                 // AudioContext, made on first gesture
  var master, musicGain, ambGain, sfxGain;
  var noiseBuf = null;
  var started = false;

  var settings = { music: 0.5, amb: 0.55, sfx: 0.7, muted: false };
  var KEY = 'sdv.audio.v1';

  function loadSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          ['music', 'amb', 'sfx'].forEach(function (k) {
            if (typeof v[k] === 'number') settings[k] = Math.max(0, Math.min(1, v[k]));
          });
          settings.muted = !!v.muted;
        }
      }
    } catch (e) { /* private mode: defaults are fine */ }
  }
  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
  }
  loadSettings();

  // ------------------------------------------------------------------ setup
  function ensure() {
    if (A) return A;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    A = new Ctx();
    master = A.createGain();
    master.gain.value = settings.muted ? 0 : 1;
    master.connect(A.destination);
    musicGain = A.createGain(); musicGain.gain.value = settings.music;
    ambGain = A.createGain(); ambGain.gain.value = settings.amb;
    sfxGain = A.createGain(); sfxGain.gain.value = settings.sfx;
    musicGain.connect(master); ambGain.connect(master); sfxGain.connect(master);

    // one second of white noise, reused by every wind, wave, footstep and axe
    var n = A.sampleRate;
    noiseBuf = A.createBuffer(1, n, n);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return A;
  }

  function now() { return A ? A.currentTime : 0; }

  /* One plucked or blown note. `wave` picks the timbre, `curve` the envelope:
   * 'pluck' for anything struck (banjo, marimba), 'pad' for anything held. */
  function note(freq, t0, dur, opt) {
    if (!A || !freq) return;
    opt = opt || {};
    var dest = opt.dest || musicGain;
    var o = A.createOscillator();
    o.type = opt.wave || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (opt.glide) o.frequency.exponentialRampToValueAtTime(opt.glide, t0 + dur);
    var g = A.createGain();
    var peak = (opt.gain == null ? 0.22 : opt.gain);
    var atk = opt.attack == null ? 0.008 : opt.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    if (opt.curve === 'pad') {
      g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    var tail = o;
    if (opt.filter) {
      var f = A.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opt.filter, t0);
      o.connect(f); tail = f;
    }
    tail.connect(g); g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /* A burst of filtered noise: shakers, footsteps, splashes, the axe. */
  function noise(t0, dur, opt) {
    if (!A || !noiseBuf) return;
    opt = opt || {};
    var src = A.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = A.createBiquadFilter();
    f.type = opt.type || 'bandpass';
    f.frequency.setValueAtTime(opt.freq || 1200, t0);
    if (opt.sweep) f.frequency.exponentialRampToValueAtTime(opt.sweep, t0 + dur);
    f.Q.value = opt.q == null ? 1 : opt.q;
    var g = A.createGain();
    var peak = opt.gain == null ? 0.2 : opt.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(opt.dest || sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------------ notes
  var SEMI = Math.pow(2, 1 / 12);
  function hz(midi) { return 440 * Math.pow(SEMI, midi - 69); }

  // scale degrees in semitones, the three modes the original actually uses
  var MODES = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
  };

  function degree(root, mode, d) {
    var sc = MODES[mode] || MODES.major;
    var oct = Math.floor(d / 7);
    var i = ((d % 7) + 7) % 7;
    return root + oct * 12 + sc[i];
  }

  /* One tune. Chords are scale degrees of the root, so a progression written
   * once works in every key and mode. */
  var TUNES = {
    spring: { root: 57, mode: 'major', bpm: 96,
              chords: [0, 3, 4, 3, 0, 5, 4, 4], bright: 1.0 },
    summer: { root: 60, mode: 'mixolydian', bpm: 112,
              chords: [0, 4, 5, 3, 0, 4, 3, 4], bright: 1.15 },
    fall:   { root: 55, mode: 'major', bpm: 88,
              chords: [0, 5, 3, 4, 0, 5, 1, 4], bright: 0.85 },
    winter: { root: 53, mode: 'minor', bpm: 74,
              chords: [0, 5, 3, 4, 0, 2, 5, 4], bright: 0.7 },
    town:   { root: 62, mode: 'major', bpm: 104,
              chords: [0, 3, 4, 0, 5, 3, 4, 4], bright: 1.05 },
    indoor: { root: 57, mode: 'major', bpm: 80,
              chords: [0, 5, 3, 4], bright: 0.75, quiet: true },
    saloon: { root: 52, mode: 'mixolydian', bpm: 120,
              chords: [0, 0, 3, 3, 4, 3, 0, 4], bright: 1.1 },
    mine:   { root: 45, mode: 'minor', bpm: 68,
              chords: [0, 5, 0, 6, 0, 3, 5, 6], bright: 0.55, sparse: true },
    night:  { root: 55, mode: 'minor', bpm: 70,
              chords: [0, 3, 5, 4], bright: 0.6, quiet: true },
    beach:  { root: 59, mode: 'major', bpm: 84,
              chords: [0, 4, 5, 3], bright: 0.95 }
  };

  // ------------------------------------------------------------------ music
  var music = {
    name: null, tune: null, bar: 0, nextAt: 0, timer: null, seed: 1
  };

  function rnd() {
    // deterministic within a bar, so the "random" variation is repeatable
    music.seed = (music.seed * 1664525 + 1013904223) >>> 0;
    return music.seed / 4294967296;
  }

  /* Schedule one bar. Called a little ahead of time so the audio clock, not
   * the frame rate, decides when a note lands - a tune driven off
   * requestAnimationFrame stutters the moment the game does. */
  function scheduleBar(t0) {
    var T = music.tune;
    if (!T) return;
    var beat = 60 / T.bpm;
    var bar = music.bar++;
    var chordDeg = T.chords[bar % T.chords.length];
    var root = T.root, mode = T.mode;
    var base = degree(root, mode, chordDeg) - 12;
    var vol = T.quiet ? 0.55 : 1;

    // bass: root, then fifth, the whole job of the bass in this style
    note(hz(base - 12), t0, beat * 1.6,
         { wave: 'sine', gain: 0.20 * vol, filter: 400, curve: 'pad' });
    note(hz(degree(root, mode, chordDeg + 4) - 24), t0 + beat * 2, beat * 1.6,
         { wave: 'sine', gain: 0.16 * vol, filter: 400, curve: 'pad' });

    // the plucked arpeggio that outlines the chord - the banjo's role
    var arp = [0, 2, 4, 2, 0, 4, 2, 4];
    for (var i = 0; i < 8; i++) {
      if (T.sparse && (i % 2)) continue;
      /* Slightly behind the beat. This is the whole difference between a
       * tune that ambles and a tune that marches, and it is the one thing
       * every teardown of this style points at. */
      var lag = (i % 2 ? 0.016 : 0) + rnd() * 0.012;
      note(hz(degree(root, mode, chordDeg + arp[i])),
           t0 + i * beat * 0.5 + lag, beat * 0.42,
           { wave: 'triangle', gain: 0.085 * vol * T.bright,
             filter: 2400 * T.bright, attack: 0.004 });
    }

    // a held pad underneath, so the plucking has something to sit on
    note(hz(degree(root, mode, chordDeg + 2)), t0, beat * 3.8,
         { wave: 'sine', gain: 0.05 * vol, filter: 900, curve: 'pad',
           attack: 0.25 });

    // melody: call on even bars, answer on odd ones, always in the scale
    var phraseBar = bar % 4;
    if (phraseBar === 0 || phraseBar === 2) {
      var start = chordDeg + (phraseBar === 0 ? 7 : 9);
      var shape = [0, 1, -1, 2, 0, -2];
      var t = t0 + beat * (phraseBar === 0 ? 0 : 0.5);
      for (var m = 0; m < shape.length; m++) {
        if (rnd() < 0.18) continue;                 // leave room to breathe
        var len = rnd() < 0.3 ? beat : beat * 0.5;
        note(hz(degree(root, mode, start + shape[m])), t, len * 0.95,
             { wave: 'triangle', gain: 0.13 * vol * T.bright,
               filter: 3000, attack: 0.006 });
        t += len;
        if (t > t0 + beat * 3.6) break;
      }
    }

    // shaker on the offbeats, quiet, just for drive
    if (!T.sparse) {
      for (var k = 0; k < 4; k++) {
        noise(t0 + k * beat + beat * 0.5, 0.06,
              { freq: 6500, q: 1.4, gain: 0.028 * vol, dest: musicGain });
      }
    }
    return beat * 4;
  }

  function musicTick() {
    if (!A || !music.tune) return;
    var ahead = now() + 0.6;
    var guard = 0;
    while (music.nextAt < ahead && guard++ < 4) {
      var len = scheduleBar(Math.max(music.nextAt, now() + 0.05));
      music.nextAt = Math.max(music.nextAt, now() + 0.05) + len;
    }
  }

  function playMusic(name) {
    if (!A || music.name === name) return;
    music.name = name;
    music.tune = TUNES[name] || TUNES.spring;
    music.bar = 0;
    music.nextAt = now() + 0.1;
    music.seed = 1 + (name || '').length * 7919;
  }

  function stopMusic() { music.name = null; music.tune = null; }

  // --------------------------------------------------------------- ambience
  var amb = { name: null, nodes: [], timer: 0 };

  function clearAmbience() {
    amb.nodes.forEach(function (n) {
      try { n.stop ? n.stop() : n.disconnect(); } catch (e) {}
    });
    amb.nodes = [];
    amb.name = null;
  }

  /* A continuous bed: looping noise through a filter, slowly wobbling so it
   * does not sit dead in the ear. */
  function bed(freq, q, gain, type, wobble) {
    var src = A.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var f = A.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    var g = A.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(ambGain);
    src.start();
    amb.nodes.push(src);
    if (wobble) {
      var lfo = A.createOscillator();
      lfo.frequency.value = wobble.rate;
      var lg = A.createGain(); lg.gain.value = wobble.depth;
      lfo.connect(lg); lg.connect(g.gain);
      lfo.start();
      amb.nodes.push(lfo);
    }
    return g;
  }

  var AMB = {
    /* Each of these is the sound of a place, built from the same two parts. */
    day:    function () { bed(900, 0.6, 0.014, 'bandpass', { rate: 0.09, depth: 0.008 }); },
    night:  function () { bed(4200, 6, 0.012, 'bandpass', { rate: 5.5, depth: 0.010 });
                          bed(300, 0.5, 0.010, 'lowpass'); },
    rain:   function () { bed(2200, 0.4, 0.055, 'bandpass', { rate: 0.5, depth: 0.012 });
                          bed(600, 0.3, 0.030, 'lowpass'); },
    beach:  function () { bed(500, 0.35, 0.045, 'lowpass', { rate: 0.14, depth: 0.030 }); },
    cave:   function () { bed(140, 0.6, 0.035, 'lowpass', { rate: 0.07, depth: 0.012 }); },
    indoor: function () { bed(220, 0.5, 0.012, 'lowpass'); },
    town:   function () { bed(700, 0.5, 0.012, 'bandpass', { rate: 0.11, depth: 0.006 }); }
  };

  function playAmbience(name) {
    if (!A || amb.name === name) return;
    clearAmbience();
    amb.name = name;
    var fn = AMB[name];
    if (fn) fn();
  }

  /* Things that happen occasionally on top of the bed: a bird in the morning,
   * a cricket at night, a drip in the cave, a gull at the beach. */
  function ambienceSpark() {
    if (!A || !amb.name) return;
    var t = now() + 0.02;
    switch (amb.name) {
      case 'day': case 'town': {
        // a two- or three-note bird call, always in a pleasant interval
        var b = 1800 + Math.random() * 1400;
        note(b, t, 0.07, { wave: 'sine', gain: 0.045, dest: ambGain });
        note(b * 1.26, t + 0.09, 0.06, { wave: 'sine', gain: 0.038, dest: ambGain });
        if (Math.random() < 0.5) {
          note(b * 1.5, t + 0.18, 0.05, { wave: 'sine', gain: 0.03, dest: ambGain });
        }
        break;
      }
      case 'night':
        note(2600 + Math.random() * 300, t, 0.03,
             { wave: 'square', gain: 0.012, dest: ambGain });
        break;
      case 'cave':
        note(1400 + Math.random() * 900, t, 0.16,
             { wave: 'sine', gain: 0.05, glide: 700, dest: ambGain });
        break;
      case 'beach':
        note(1500 + Math.random() * 700, t, 0.12,
             { wave: 'sine', gain: 0.03, glide: 1100, dest: ambGain });
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------- sfx
  /* One entry per thing the player does. Each is a couple of oscillators and
   * a noise burst - which is all an arcade sound effect has ever been. */
  var SFX = {
    tap:      function (t) { note(880, t, 0.05, { wave: 'square', gain: 0.06, dest: sfxGain }); },
    open:     function (t) { note(520, t, 0.07, { wave: 'triangle', gain: 0.10, dest: sfxGain });
                             note(780, t + 0.05, 0.09, { wave: 'triangle', gain: 0.08, dest: sfxGain }); },
    close:    function (t) { note(700, t, 0.06, { wave: 'triangle', gain: 0.07, dest: sfxGain });
                             note(440, t + 0.04, 0.08, { wave: 'triangle', gain: 0.06, dest: sfxGain }); },
    /* Axe: the thud of the blade, then the dry crack of the wood. */
    chop:     function (t) { noise(t, 0.10, { freq: 320, q: 1.2, gain: 0.30, sweep: 140 });
                             noise(t + 0.02, 0.16, { freq: 1600, q: 2.5, gain: 0.16, sweep: 700 }); },
    fell:     function (t) { noise(t, 0.55, { freq: 900, q: 0.7, gain: 0.22, sweep: 180 });
                             note(90, t + 0.25, 0.4, { wave: 'sine', gain: 0.18, dest: sfxGain }); },
    /* Pick on stone: a hard tick and a scatter of chips. */
    smash:    function (t) { noise(t, 0.07, { freq: 2600, q: 3, gain: 0.26, sweep: 1400 });
                             noise(t + 0.03, 0.22, { freq: 800, q: 0.8, gain: 0.16, sweep: 300 }); },
    /* Sword: air, then the bite. */
    slash:    function (t) { noise(t, 0.13, { freq: 900, q: 0.8, gain: 0.20, sweep: 3200 });
                             note(320, t + 0.04, 0.10, { wave: 'sawtooth', gain: 0.10,
                                                         glide: 120, dest: sfxGain }); },
    hoe:      function (t) { noise(t, 0.18, { freq: 500, q: 0.7, gain: 0.20, sweep: 180 }); },
    water:    function (t) { noise(t, 0.30, { freq: 1400, q: 0.6, gain: 0.16, sweep: 3000 }); },
    weed:     function (t) { noise(t, 0.12, { freq: 3000, q: 1.5, gain: 0.16, sweep: 1200 }); },
    /* Coins: the two-tone chime every arcade game has used since 1985. */
    coin:     function (t) { note(1046, t, 0.07, { wave: 'square', gain: 0.10, dest: sfxGain });
                             note(1568, t + 0.06, 0.14, { wave: 'square', gain: 0.09, dest: sfxGain }); },
    pickup:   function (t) { note(784, t, 0.05, { wave: 'triangle', gain: 0.09, dest: sfxGain });
                             note(1175, t + 0.045, 0.08, { wave: 'triangle', gain: 0.07, dest: sfxGain }); },
    plant:    function (t) { noise(t, 0.10, { freq: 700, q: 1, gain: 0.14, sweep: 300 });
                             note(523, t + 0.05, 0.08, { wave: 'sine', gain: 0.07, dest: sfxGain }); },
    harvest:  function (t) { note(659, t, 0.06, { wave: 'triangle', gain: 0.10, dest: sfxGain });
                             note(880, t + 0.05, 0.06, { wave: 'triangle', gain: 0.09, dest: sfxGain });
                             note(1318, t + 0.10, 0.12, { wave: 'triangle', gain: 0.08, dest: sfxGain }); },
    /* A short rising arpeggio for anything that goes right. */
    levelup:  function (t) { [523, 659, 784, 1046].forEach(function (f, i) {
                               note(f, t + i * 0.09, 0.22,
                                    { wave: 'triangle', gain: 0.11, dest: sfxGain }); }); },
    bundle:   function (t) { [659, 784, 988, 1318, 1568].forEach(function (f, i) {
                               note(f, t + i * 0.08, 0.30,
                                    { wave: 'sine', gain: 0.10, dest: sfxGain }); }); },
    error:    function (t) { note(220, t, 0.10, { wave: 'square', gain: 0.09, dest: sfxGain });
                             note(165, t + 0.09, 0.16, { wave: 'square', gain: 0.08, dest: sfxGain }); },
    door:     function (t) { noise(t, 0.16, { freq: 420, q: 1.4, gain: 0.16, sweep: 200 });
                             note(180, t + 0.08, 0.12, { wave: 'sine', gain: 0.08, dest: sfxGain }); },
    warp:     function (t) { note(440, t, 0.22, { wave: 'sine', gain: 0.09,
                                                  glide: 880, dest: sfxGain }); },
    cast:     function (t) { noise(t, 0.20, { freq: 1200, q: 0.8, gain: 0.14, sweep: 4000 }); },
    nibble:   function (t) { note(1046, t, 0.05, { wave: 'square', gain: 0.10, dest: sfxGain });
                             note(1046, t + 0.10, 0.05, { wave: 'square', gain: 0.10, dest: sfxGain }); },
    reel:     function (t) { for (var i = 0; i < 6; i++) {
                               noise(t + i * 0.05, 0.03, { freq: 2200, q: 4, gain: 0.08 }); } },
    catchfish: function (t) { [784, 988, 1318].forEach(function (f, i) {
                               note(f, t + i * 0.07, 0.20,
                                    { wave: 'triangle', gain: 0.11, dest: sfxGain }); }); },
    hurt:     function (t) { note(300, t, 0.14, { wave: 'sawtooth', gain: 0.14,
                                                  glide: 90, dest: sfxGain }); },
    monster:  function (t) { note(160, t, 0.18, { wave: 'sawtooth', gain: 0.10,
                                                  glide: 70, dest: sfxGain });
                             noise(t, 0.14, { freq: 500, q: 0.8, gain: 0.10, sweep: 180 }); },
    /* Going to bed: a soft descending figure, then the night. */
    sleep:    function (t) { [659, 523, 440, 330].forEach(function (f, i) {
                               note(f, t + i * 0.16, 0.45,
                                    { wave: 'sine', gain: 0.10, dest: sfxGain,
                                      attack: 0.05 }); }); },
    rooster:  function (t) { note(880, t, 0.12, { wave: 'sawtooth', gain: 0.10,
                                                  glide: 1200, dest: sfxGain });
                             note(1200, t + 0.13, 0.22, { wave: 'sawtooth', gain: 0.09,
                                                          glide: 700, dest: sfxGain }); },
    step:     function (t) { noise(t, 0.05, { freq: 260, q: 1.6, gain: 0.05, sweep: 160 }); }
  };

  var lastSfxAt = {};
  function play(name) {
    if (!A || settings.muted) return;
    var fn = SFX[name];
    if (!fn) return;
    /* The same effect firing four times in a frame is a click, not a sound.
     * One of each per 40 ms is plenty. */
    var t = now();
    if (lastSfxAt[name] && t - lastSfxAt[name] < 0.04) return;
    lastSfxAt[name] = t;
    fn(t + 0.005);
  }

  // ------------------------------------------------------------------ mixer
  function setLevel(which, v) {
    settings[which] = Math.max(0, Math.min(1, v));
    if (A) {
      var g = which === 'music' ? musicGain : which === 'amb' ? ambGain : sfxGain;
      g.gain.setTargetAtTime(settings[which], now(), 0.05);
    }
    saveSettings();
  }
  function setMuted(on) {
    settings.muted = !!on;
    if (master) master.gain.setTargetAtTime(settings.muted ? 0 : 1, now(), 0.05);
    saveSettings();
  }

  // ------------------------------------------------------------------ drive
  /* What should be playing, decided from where the player is and what time it
   * is. Called every second or so; both setters ignore a repeat. */
  function follow(game) {
    if (!A || !game || !game.sim) return;
    var sim = game.sim;
    var area = game.world.area();
    var id = game.world.current;
    var night = sim.time >= 19 * 60 || sim.time < 6 * 60;
    var raining = sim.weather === 'rain' || sim.weather === 'storm';
    var season = String(sim.season() || 'Spring').toLowerCase();

    var tune;
    if (id === 'mine' || id === 'skull' || id === 'volcano' || area.depth) tune = 'mine';
    else if (id === 'saloon') tune = 'saloon';
    else if (id === 'town') tune = night ? 'night' : 'town';
    else if (id === 'beach') tune = 'beach';
    else if (!area.outdoor) tune = 'indoor';
    else if (night) tune = 'night';
    else tune = TUNES[season] ? season : 'spring';
    playMusic(tune);

    var bedName;
    if (id === 'mine' || id === 'skull' || id === 'volcano' || area.depth) bedName = 'cave';
    else if (!area.outdoor) bedName = 'indoor';
    else if (raining) bedName = 'rain';
    else if (id === 'beach') bedName = 'beach';
    else if (night) bedName = 'night';
    else if (id === 'town') bedName = 'town';
    else bedName = 'day';
    playAmbience(bedName);
  }

  var sparkAt = 0;
  function tick(game, dt) {
    if (!A || !started) return;
    musicTick();
    sparkAt -= dt;
    if (sparkAt <= 0) {
      sparkAt = 3 + Math.random() * 7;
      if (Math.random() < 0.75) ambienceSpark();
    }
  }

  /* Browsers will not make a sound before the player has touched the page, so
   * the whole engine waits for the first gesture and then starts. */
  function start(game) {
    if (started) return;
    if (!ensure()) return;
    started = true;
    if (A.state === 'suspended') A.resume();
    follow(game);
  }

  function armGesture(game) {
    function go() {
      start(game);
      if (A && A.state === 'suspended') A.resume();
    }
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
      global.addEventListener(ev, go, { passive: true });
    });
  }

  /* Two seams for the test harness, and for anyone debugging a silent page.
   *
   * `state()` says what the engine thinks it is playing, so a test can assert
   * that walking into the mine changes the music without needing ears.
   * `tap()` hangs an analyser off the master bus so a test can measure that
   * a real signal is coming out - "it scheduled some oscillators" is not the
   * same claim as "it made a sound". */
  function state() {
    return { started: started, ctx: A ? A.state : null,
             music: music.name, ambience: amb.name,
             bars: music.bar, muted: settings.muted };
  }
  function tap() {
    if (!ensure()) return null;
    if (!master._tap) {
      var an = A.createAnalyser();
      an.fftSize = 2048;
      master.connect(an);
      master._tap = an;
    }
    return master._tap;
  }

  global.SDV_AUDIO = {
    armGesture: armGesture, start: start, follow: follow, tick: tick,
    state: state, tap: tap,
    play: play, playMusic: playMusic, stopMusic: stopMusic,
    playAmbience: playAmbience, setLevel: setLevel, setMuted: setMuted,
    settings: settings, TUNES: TUNES, SFX: SFX,
    isStarted: function () { return started; }
  };
})(window);
