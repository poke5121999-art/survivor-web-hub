import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodeGIF } from '../src/gif.js';

const DIR = '/tmp/claude-1000/-home-bui-thanh-thuong/8d6e1e9c-0e2a-421f-83e6-95eb3dbe2ee1/scratchpad';
mkdirSync(DIR, { recursive: true });

function decode(file) {
  const r = spawnSync('timeout', ['30', '/usr/bin/ffmpeg', '-v', 'error', '-i', file, '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, 'ffmpeg failed: ' + r.stderr);
  return new Uint8Array(r.stdout);
}
const mk = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};

test('exact colors and transparency survive (<=255 colors)', () => {
  const W = 20, H = 12;
  const pal = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [17, 34, 51], [250, 250, 5], [0, 0, 0], [255, 255, 255]];
  const frames = [0, 1, 2].map((n) => mk(W, H, (x, y) => {
    if ((x + y + n) % 5 === 0) return [9, 9, 9, 0];
    const c = pal[(x * 3 + y * 5 + n * 2) % pal.length];
    return [c[0], c[1], c[2], 255];
  }));
  const file = `${DIR}/exact.gif`;
  const gif = encodeGIF(frames, { delayMs: 100 });
  writeFileSync(file, gif);
  assert.equal(String.fromCharCode(...gif.subarray(0, 6)), 'GIF89a');
  const raw = decode(file);
  assert.equal(raw.length, W * H * 4 * 3, 'frame count / size');
  for (let f = 0; f < 3; f++) for (let i = 0; i < W * H; i++) {
    const s = frames[f].data, o = f * W * H * 4 + i * 4;
    if (s[i * 4 + 3] === 0) { assert.equal(raw[o + 3], 0, `f${f} px${i} alpha`); continue; }
    for (let c = 0; c < 4; c++) assert.equal(raw[o + c], s[i * 4 + c], `f${f} px${i} ch${c}`);
  }
});

test('gradient with >256 colors stays within 24 per channel', () => {
  const W = 64, H = 64;
  const frames = [0, 1, 2].map((n) => mk(W, H, (x, y) => [x * 4 + n * 3, y * 4, (x + y) * 2 + n * 10, 255]));
  const file = `${DIR}/gradient.gif`;
  writeFileSync(file, encodeGIF(frames, { delayMs: 80, loop: false }));
  const raw = decode(file);
  assert.equal(raw.length, W * H * 4 * 3);
  let max = 0;
  for (let f = 0; f < 3; f++) for (let i = 0; i < W * H * 4; i++)
    max = Math.max(max, Math.abs(raw[f * W * H * 4 + i] - frames[f].data[i]));
  console.log('gradient max channel error', max);
  assert.ok(max <= 24, `max error ${max}`);
});

test('timing: 30 frames of 300x300', () => {
  const frames = Array.from({ length: 30 }, (_, n) => mk(300, 300, (x, y) =>
    [(x + n * 7) & 255, (y * 2 + n) & 255, ((x ^ y) + n * 3) & 255, (x + y) % 50 === 0 ? 0 : 255]));
  const t = performance.now();
  const gif = encodeGIF(frames, { delayMs: 60 });
  console.log(`encode 30x300x300: ${(performance.now() - t).toFixed(0)} ms, ${gif.length} bytes`);
  writeFileSync(`${DIR}/big.gif`, gif);
  const raw = decode(`${DIR}/big.gif`);
  assert.equal(raw.length, 300 * 300 * 4 * 30);
});
