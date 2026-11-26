import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + '/.cache/pw-node/node_modules/playwright-core');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const oggDir = path.join(root, 'assets/res/sfx');
const wavDir = process.env.HOME + '/chestrain-ref/build/res/res/sfx';

function wavInfo(file) {
  const b = readFileSync(file);
  let off = 12, ch = 0, rate = 0, bits = 0, dataLen = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    if (id === 'data') { dataLen = Math.min(len, b.length - off - 8); break; }
    off += 8 + len + (len & 1);
  }
  return { ch, rate, duration: dataLen / (ch * bits / 8) / rate };
}

const picks = ['arrowshower_0', 'bosshit_1', 'nature/v2/rain'].filter((n) =>
  readdirSync(path.dirname(path.join(oggDir, n + '.ogg'))).includes(path.basename(n) + '.ogg'));
assert.equal(picks.length, 3, 'three sample .ogg files present');
const expected = picks.map((n) => ({ name: n, ...wavInfo(path.join(wavDir, n + '.wav')) }));
const dataUrls = Object.fromEntries(picks.map((n) =>
  [n, 'data:audio/ogg;base64,' + readFileSync(path.join(oggDir, n + '.ogg')).toString('base64')]));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.join(root, 'js/host/webaudio.js') });

  const r = await page.evaluate(async ({ picks, dataUrls }) => {
    const rate = 44100;
    AudioContext.nativeFactory = (sr) => new OfflineAudioContext(2, rate * 2, sr);
    const ctx = new AudioContext().$ctor(rate);
    const osc = ctx.CreateOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;
    const bq = ctx.CreateBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = 4000;
    const g = ctx.CreateGain();
    g.gain.value = 0;
    g.gain.SetValueAtTime(0, 0).LinearRampToValueAtTime(0.5, 0.2).SetValueAtTime(0.5, 1.2)
      .ExponentialRampToValueAtTime(0.0001, 1.6);
    const comp = ctx.CreateDynamicsCompressor();
    comp.threshold.value = -12;
    const chain = osc.Connect$AudioNode(bq);
    const returned = chain.Connect$AudioNode(g) === g;
    g.Connect$AudioNode(comp);
    const dest = comp.Connect$AudioNode(ctx.destination);
    osc.Start$d(0);
    osc.Stop(1.9);
    const stateBefore = ctx.state;
    const rendered = await ctx.native.startRendering();
    const d = rendered.getChannelData(0);
    const rms = (a, b) => {
      let s = 0;
      for (let i = Math.floor(a * rate); i < Math.floor(b * rate); i++) s += d[i] * d[i];
      return Math.sqrt(s / (Math.floor(b * rate) - Math.floor(a * rate)));
    };
    let cross = 0;
    for (let i = Math.floor(0.5 * rate) + 1; i < Math.floor(1.0 * rate); i++) if (d[i - 1] < 0 && d[i] >= 0) cross++;

    const sm = await preloadSfx(ctx, picks, (n) => dataUrls[n]);
    const decoded = picks.map((n) => {
      const b = sm.get(n);
      const c0 = b.GetChannelData(0);
      let s = 0;
      for (let i = 0; i < c0.length; i++) s += c0[i] * c0[i];
      return { name: n, ch: b.numberOfChannels, duration: b.duration, rms: Math.sqrt(s / c0.length), cls: b.constructor.name };
    });
    const src = sfxSource(sm);
    const lookup = [src('Nature/V2/RAIN') === sm.get('nature/v2/rain'), src('missing') === null];
    return {
      returned, destIsWrapper: dest === ctx.destination, stateBefore, gainRead: g.gain.value,
      rmsPre: rms(0, 0.02), rmsMid: rms(0.5, 1.0), rmsTail: rms(1.7, 1.9), cross,
      mapSize: sm.size, decoded, lookup, sampleRate: ctx.sampleRate,
    };
  }, { picks, dataUrls });

  console.log(JSON.stringify(r, null, 1));
  assert.ok(r.returned && r.destIsWrapper, 'Connect$AudioNode returns the destination wrapper');
  assert.equal(r.stateBefore, 0, 'offline context state maps to Suspended (0)');
  assert.equal(r.sampleRate, 44100);
  assert.ok(r.rmsPre < 0.01, 'silent at gain 0: rms ' + r.rmsPre);
  assert.ok(r.rmsMid > 0.05, 'non-silent after ramp: rms ' + r.rmsMid);
  assert.ok(r.rmsTail < 0.001, 'silent after exponential ramp: rms ' + r.rmsTail);
  assert.ok(Math.abs(r.cross - 220) <= 3, '440 Hz over 0.5 s gives about 220 crossings, got ' + r.cross);
  assert.equal(r.mapSize, 3);
  assert.deepEqual(r.lookup, [true, true]);
  for (const e of expected) {
    const got = r.decoded.find((x) => x.name === e.name);
    assert.equal(got.cls, 'AudioBuffer');
    assert.equal(got.ch, e.ch, e.name + ' channel count');
    assert.ok(Math.abs(got.duration - e.duration) / e.duration < 0.01,
      `${e.name} duration ${got.duration} vs ${e.duration}`);
    assert.ok(got.rms > 0.001, e.name + ' non-silent, rms ' + got.rms);
  }
  console.log('audio-smoke: PASS');
} finally {
  await browser.close();
}
