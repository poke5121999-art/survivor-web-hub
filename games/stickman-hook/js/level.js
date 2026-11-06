// Level assembly, ported from StickmanHook.Services.PatternSpawner (libil2cpp 0x12a2518..0x12a2f38).
// Levels 1..64 are fixed pattern lists; from level 65 on, each slot (start, middle, finish) picks a pattern whose
// entry junction overlaps the previous exit, using a fresh System.Random(levelIndex) per slot.

const MBIG = 2147483647;
const MSEED = 161803398;

// System.Random with an explicit seed (the .NET "Net5CompatSeedImpl" subtractive generator).
export class NetRandom {
  constructor(seed) {
    const sa = new Array(56).fill(0);
    const sub = seed === -2147483648 ? 2147483647 : Math.abs(seed);
    let mj = MSEED - sub;
    sa[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      sa[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = sa[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        sa[i] -= sa[1 + ((i + 30) % 55)];
        if (sa[i] < 0) sa[i] += MBIG;
      }
    }
    this.sa = sa;
    this.inext = 0;
    this.inextp = 21;
  }
  sample() {
    let ln = this.inext + 1, lnp = this.inextp + 1;
    if (ln >= 56) ln = 1;
    if (lnp >= 56) lnp = 1;
    let r = this.sa[ln] - this.sa[lnp];
    if (r === MBIG) r--;
    if (r < 0) r += MBIG;
    this.sa[ln] = r;
    this.inext = ln;
    this.inextp = lnp;
    return r * (1 / MBIG);
  }
  next(max) {
    return Math.floor(this.sample() * max);
  }
}

export function patternNames(data, levelIndex) {
  if (levelIndex < data.levels.length) return data.levels[levelIndex];
  let junction = 7;
  const names = [];
  for (const pool of data.random) {
    const fits = pool.filter((n) => (data.patterns[n].entry & junction) !== 0);
    const name = fits[new NetRandom(levelIndex).next(fits.length)];
    names.push(name);
    junction = data.patterns[name].exit;
  }
  return names;
}

// levels.json drops each draw item's sorting order when 0 and its SpriteShadow when it is the sprite's usual one
// (build_data.py pack_defaults, first-load budget); this puts both back, once, in place.
export function unpackDefaults(data) {
  if (!data.shd) return data;
  for (const p of Object.values(data.patterns)) {
    for (const d of p.draw) {
      d.o ??= 0;
      if (d.sh === undefined) { if (data.shd[d.s]) d.sh = data.shd[d.s]; } else if (d.sh === 0) delete d.sh;
    }
  }
  delete data.shd;
  return data;
}

// buildLevel input of a non-Normal mode: its own patterns (data/mode-<file>.json) over Normal's, and its level lists.
export function modeData(normal, file, modeId) {
  const set = file.sets[modeId];
  return { patterns: { ...normal.patterns, ...file.patterns }, levels: set.levels, random: set.random || [] };
}

// Places each pattern at the previous pattern's end point and flattens everything into one world.
export function buildLevel(data, levelIndex) {
  const names = patternNames(data, levelIndex);
  const world = {
    index: levelIndex, names, draw: [], targets: [], bumpers: [], caps: [], polys: [],
    finishX: Infinity, spawn: null, camMin: 0, camMax: 0,
  };
  let ox = 0, oy = 0;
  names.forEach((name, pi) => {
    const p = data.patterns[name];
    const t0 = world.targets.length, b0 = world.bumpers.length, d0 = world.draw.length;
    for (const [x, y] of p.targets) world.targets.push({ x: x + ox, y: y + oy, state: 0 });
    for (const d of p.draw) {
      const m = d.m;
      world.draw.push({
        ...d, m: [m[0], m[1], m[2], m[3], m[4] + ox, m[5] + oy],
        target: d.target != null ? d.target + t0 : undefined,
        bumper: d.bumper != null ? d.bumper + b0 : undefined,
      });
    }
    for (const b of p.bumpers) {
      const c = b.cap;
      world.bumpers.push({ cap: [c[0] + ox, c[1] + oy, c[2] + ox, c[3] + oy, c[4]], draw: b.draw + d0,
        bounce: b.bounce, force: b.force, anim: -1 });
    }
    for (const c of p.caps) world.caps.push([c[0] + ox, c[1] + oy, c[2] + ox, c[3] + oy, c[4]]);
    for (const poly of p.polys) world.polys.push(poly.map((v, i) => v + (i % 2 ? oy : ox)));
    if (p.finish) for (const fx of p.finish) world.finishX = Math.min(world.finishX, fx + ox);
    if (pi === 0) {
      world.camMin = (p.cam[0] ?? 0) + ox;
      if (p.spawn) world.spawn = { x: p.spawn[0] + ox, y: p.spawn[1] + oy };
    }
    world.camMax = (p.cam[1] ?? p.end[0]) + ox;
    ox += p.end[0];
    oy += p.end[1];
  });
  world.draw.sort((a, b) => a.o - b.o);
  world.draw.forEach((d, i) => { if (d.bumper != null) world.bumpers[d.bumper].draw = i; });
  if (!world.spawn) world.spawn = { x: world.camMin + 1.5, y: 2 };
  return world;
}
