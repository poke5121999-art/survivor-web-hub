// Economy tables and pure rules: gacha, hero level costs, stage rewards. No DOM, no three.js: the browser and the
// Node tools (tools/economy.mjs) run the same code.

export const HERO_RARITY = {
  R: { name: 'Hiếm', color: 0x4aa8ff, craft: 30, dupe: 20 },
  SR: { name: 'Sử Thi', color: 0xb46cff, craft: 60, dupe: 30 },
  SSR: { name: 'Huyền Thoại', color: 0xffb030, craft: 100, dupe: 40 },
};

export const GACHA = {
  cost: 100,
  cost10: 900,
  pity: 50,
  // p in percent; the rows sum to 100
  table: [
    { id: 'hero_ssr', p: 1.5, kind: 'hero', rarity: 'SSR' },
    { id: 'hero_sr', p: 4.5, kind: 'hero', rarity: 'SR' },
    { id: 'hero_r', p: 9, kind: 'hero', rarity: 'R' },
    { id: 'shard_ssr', p: 5, kind: 'shard', rarity: 'SSR', n: 5 },
    { id: 'shard_sr', p: 15, kind: 'shard', rarity: 'SR', n: 8 },
    { id: 'shard_r', p: 25, kind: 'shard', rarity: 'R', n: 12 },
    { id: 'gold', p: 25, kind: 'gold', n: 400 },
    { id: 'item', p: 15, kind: 'item' },
  ],
};

const GOOD = new Set(['hero_ssr', 'hero_sr', 'shard_ssr', 'shard_sr']);

// One pull. `acc` is the account ({ heroes: {id: {level, shards}}, pity }), `roster` the hero defs ({id, rarity}),
// `rng` a () => [0,1). Returns what dropped; apply it with grant().
export function rollGacha(acc, roster, rng, forceGood) {
  let row;
  if ((acc.pity || 0) + 1 >= GACHA.pity) row = GACHA.table[0];
  else {
    const rows = forceGood ? GACHA.table.filter((r) => GOOD.has(r.id)) : GACHA.table;
    const total = rows.reduce((s, r) => s + r.p, 0);
    let x = rng() * total;
    row = rows[rows.length - 1];
    for (const r of rows) { x -= r.p; if (x < 0) { row = r; break; } }
  }
  const out = { row: row.id, kind: row.kind, rarity: row.rarity || null, n: row.n || 0, hero: null, isNew: false };
  if (row.kind === 'hero' || row.kind === 'shard') {
    const pool = roster.filter((h) => h.rarity === row.rarity);
    out.hero = pool[Math.floor(rng() * pool.length) % pool.length].id;
    if (row.kind === 'hero') {
      out.isNew = !acc.heroes[out.hero];
      if (!out.isNew) { out.kind = 'shard'; out.n = HERO_RARITY[row.rarity].dupe; out.dupe = true; }
    }
  }
  return out;
}

// The tenth pull of a ten-pull is forced to an SR-or-better row when the first nine had none.
export function rollTen(acc, roster, rng, onEach) {
  const outs = [];
  let good = false;
  for (let i = 0; i < 10; i++) {
    const o = rollGacha(acc, roster, rng, i === 9 && !good);
    if (GOOD.has(o.row)) good = true;
    outs.push(o);
    onEach(o);
  }
  return outs;
}

// cost to go from level L to L + 1; both columns rise with every level and never stop
export function levelCost(L) {
  return { shards: Math.ceil(4 * Math.pow(L, 1.5)), gold: Math.ceil(50 * Math.pow(L, 1.8)) };
}

// stat multiplier of a hero at level L (attack and health)
export function levelMul(L) {
  return 1 + 0.08 * (L - 1);
}

export function cumulativeCost(toLevel) {
  let shards = 0; let gold = 0;
  for (let L = 1; L < toLevel; L++) { const c = levelCost(L); shards += c.shards; gold += c.gold; }
  return { shards, gold };
}

// what clearing `stage` pays; `first` is the first clear of that stage. Shards go to each hero of the team.
export function stageReward(stage, first) {
  const k = first ? 3 : 1;
  return {
    gold: (120 + 30 * stage) * k,
    gems: 20 + (first ? 100 : 0),
    teamShards: (3 + Math.floor(stage / 3)) * k,
    items: first ? 3 : 1,
    mats: 2 + Math.floor(stage / 4),
  };
}

// a lost stage still pays for the waves that were cleared
export function lossReward(stage, wavesCleared) {
  return { gold: Math.round((120 + 30 * stage) * 0.12 * wavesCleared), gems: 0, teamShards: wavesCleared >= 3 ? 1 : 0, items: 0, mats: 0 };
}

export const DAILY = { gems: 150, gold: 500, shards: 10, stones: 2 };
export const START = { gold: 1500, gems: 1000, heroes: ['tegiap', 'nhim', 'loc', 'chon'] };

// ---- evolution (SCOPE section 4) ----
// what reaching form 2 and form 3 asks: beast level, shards, gold, Đá Mầm of the beast's element, Lõi Cổ, stages cleared.
// The levels are set by tools/pacing.mjs (first form 2 in minutes 40-60, first form 3 in hours 4-6): the real account bot
// reaches level 10 only after 1.5-3 hours and level 13-16 after 8, so SCOPE's 10 and 25 became 8 and 14; the form-3 price is
// 35000 gold and 25 Đá Mầm (SCOPE 30000 and 30). Gold, not Đá Mầm, carries the time: stones come in lumps from first clears and
// the bots that stall at the stage-50 boss never gather 33 or more, while gold comes from every match. Level 13 and 20000 gold
// held when stages 35-41 were walls (bot median 4.9 h); the layouts of W-maps2 opened them and the median fell to 3.1 h.
export const EVOLVE = {
  2: { level: 8, shards: 30, gold: 5000, stones: 10, cores: 0, cleared: 0 },
  3: { level: 14, shards: 80, gold: 35000, stones: 25, cores: 3, cleared: 15 },
};
// changing the form-3 branch afterwards costs this share of the form-3 price, Lõi Cổ excepted
export const REBRANCH = 0.5;
export const rebranchCost = () => { const c = EVOLVE[3]; return { level: 0, shards: Math.ceil(c.shards * REBRANCH), gold: Math.ceil(c.gold * REBRANCH), stones: Math.ceil(c.stones * REBRANCH), cores: 0, cleared: 0 }; };
export const STONE_IDS = ['dat', 'lua', 'bang', 'gio', 'set', 'moc'];
// the two elements each chapter's biome drops (SCOPE section 8); chapter c = ceil(stage / 5), cycling after 10
export const CHAPTER_STONES = [['moc', 'dat'], ['dat', 'set'], ['lua', 'dat'], ['moc', 'bang'], ['lua', 'set'], ['bang', 'gio'], ['bang', 'moc'], ['set', 'dat'], ['gio', 'set'], ['lua', 'gio']];
export const chapterOf = (stage) => Math.max(1, Math.ceil(stage / 5));
export const stonesOf = (stage) => CHAPTER_STONES[(chapterOf(stage) - 1) % CHAPTER_STONES.length];
export const STONE_DROP = { first: 4, again: 1, coreFirst: 3, coreAgain: 1 };
// what a won stage drops for evolution: Đá Mầm of the chapter's two elements, Lõi Cổ from the chapter's last (boss) stage
export function evoDrop(stage, first, rng) {
  const els = stonesOf(stage); const stone = {};
  const n = first ? STONE_DROP.first : STONE_DROP.again;
  for (let i = 0; i < n; i++) { const e = els[Math.floor(rng() * els.length) % els.length]; stone[e] = (stone[e] || 0) + 1; }
  const core = stage % 5 === 0 ? (first ? STONE_DROP.coreFirst : STONE_DROP.coreAgain) : 0;
  return { stone, core };
}
