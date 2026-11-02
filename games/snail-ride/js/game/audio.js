// AudioSystem port on WebAudio. Clips: audio/<clipName>.mp3 ; keys -> clip names from AudioDB (data/game.json audioDB).
import { A, url } from '../engine/assets.js?v=20261102c';
import { Game } from './user.js?v=20261102c';
let ctx = null, master = null, musicGain = null, sfxGain = null;
const buffers = new Map();
let music = null, musicKey = null, muteAll = false, sfxPaused = false;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.connect(master); sfxGain = ctx.createGain(); sfxGain.gain.value = 0.3; sfxGain.connect(master);
  }
  return ctx;
}
export function unlock() { const c = audioCtx(); if (c && c.state !== 'running') c.resume().catch(() => {}); }
function clipName(key) { return (A.game.audioDB && A.game.audioDB[key]) || key; }
export function buffer(name) {
  if (!buffers.has(name)) {
    const c = audioCtx();
    buffers.set(name, fetch(url(`audio/${name}.mp3`)).then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej))).catch(e => { console.warn('audio', name, e); return null; }));
  }
  return buffers.get(name);
}
export function preload(keys) { if (!audioCtx()) return; for (const k of keys) buffer(clipName(k)); }
function sfxOff() { return Game.User.m_sfxMute || muteAll || sfxPaused; }
export function playSFX(key, volume = 1) {
  if (!key || sfxOff() || !audioCtx()) return null;
  const h = { stopped: false, src: null };
  buffer(clipName(key)).then(b => { if (!b || h.stopped) return; const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = volume; s.connect(g); g.connect(sfxGain); s.start(); h.src = s; });
  h.stop = () => { h.stopped = true; try { h.src && h.src.stop(); } catch (e) {} };
  return h;
}
// An AudioSource: one voice that can loop, pause, stop (used by obstacles, bonus loop, hook).
export class Source {
  constructor(volume = 1) { this.volume = volume; this.node = null; this.key = null; this.loop = false; this.offset = 0; this.started = 0; this.paused = false; this.gen = 0; }
  play(key, loop = false) {
    this.stop(); if (!key || sfxOff() || !audioCtx()) return;
    this.key = key; this.loop = loop; const gen = ++this.gen;
    buffer(clipName(key)).then(b => { if (!b || gen !== this.gen) return; this._start(b, 0); });
  }
  _start(b, off) {
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = this.loop; const g = ctx.createGain(); g.gain.value = this.volume;
    s.connect(g); g.connect(master); s.start(0, off % b.duration); this.node = s; this.buf = b; this.started = ctx.currentTime - off;
    s.onended = () => { if (this.node === s) this.node = null; };
  }
  get isPlaying() { return !!this.node; }
  stop() { this.gen++; if (this.node) { try { this.node.stop(); } catch (e) {} this.node = null; } this.paused = false; }
  pause() { if (this.node) { this.offset = ctx.currentTime - this.started; this.stop(); this.paused = true; this.gen++; } }
  unpause() { if (this.paused && this.buf) { this.paused = false; this._start(this.buf, this.offset); } }
}
export function playMusic(key) {
  const c = audioCtx(); if (!c) return;
  if (musicKey === key && music) return;
  stopMusic(); musicKey = key;
  const gen = musicKey;
  buffer(clipName(key)).then(b => { if (!b || musicKey !== gen) return; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(musicGain); s.start(); music = s; });
  applyMute();
}
export function stopMusic() { if (music) { try { music.stop(); } catch (e) {} music = null; } musicKey = null; }
export function applyMute() { if (musicGain) musicGain.gain.value = (Game.User.m_musicMute || muteAll) ? 0 : 1; }
export function setMuteAll(b) { muteAll = b; applyMute(); }
export function setSfxPaused(b) { sfxPaused = b; }
export function currentMusic() { return musicKey; }
