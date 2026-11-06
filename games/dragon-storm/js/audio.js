// WebAudio player for the original SFX/BGM. The context starts suspended and is resumed on the first
// touch/key (browser autoplay rule). Every play is logged so tests can see which sounds fired.
export function createAudio(muted) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = AC ? new AC() : null;
  const master = ctx ? ctx.createGain() : null;
  if (master) { master.gain.value = muted ? 0 : 1; master.connect(ctx.destination); }
  const buffers = {};
  const log = [];
  let bgm = null;
  let bgmName = null;

  async function load(name, url) {
    if (!ctx) return;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      buffers[name] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) {
      console.warn(`sound ${name} not loaded: ${e.message}`);
    }
  }

  function play(name, vol = 1) {
    log.push(name);
    if (!ctx || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(master);
    src.start();
  }

  function music(name) {
    if (bgmName === name) return;
    if (bgm) { try { bgm.stop(); } catch (e) { /* already stopped */ } bgm = null; }
    bgmName = name;
    log.push(`bgm:${name || 'off'}`);
    if (!name || !ctx || !buffers[name]) return;
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(g).connect(master);
    src.start();
    bgm = src;
  }

  function unlock() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return { load, play, music, unlock, log };
}
