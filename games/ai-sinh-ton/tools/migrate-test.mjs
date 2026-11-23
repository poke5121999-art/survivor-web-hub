// Save migration, account version 1 (the human heroes) -> 2 (the beasts). The version-1 saves are made by the REAL old
// account module: js/ of commit 28102a33 (the 20261122a release) is extracted from git and its createMeta plays a few
// accounts through the same commands the old screens called. Each save is then loaded by today's js/meta.js: nothing the
// player had may be lost, every old hero id becomes its beast, and loading, saving and loading again changes nothing.
// Usage: node games/ai-sinh-ton/tools/migrate-test.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMeta, LEGACY_IDS } from '../js/meta.js';
import { HERO } from '../js/data/heroes.js';

const OLD_COMMIT = '28102a33';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const KEY = 'aisinhton.save.v1';
const store = (init) => { const m = new Map(init ? [[KEY, init]] : []); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-migrate-'));
const top = execSync('git rev-parse --show-toplevel', { cwd: ROOT }).toString().trim();
execSync(`git -C "${top}" archive ${OLD_COMMIT} games/ai-sinh-ton/js | tar -x -C "${dir}"`);
const old = await import(path.join(dir, 'games/ai-sinh-ton/js/meta.js'));
const oldHeroes = (await import(path.join(dir, 'games/ai-sinh-ton/js/data/heroes.js'))).HEROES;
check(oldHeroes.length === 13 && oldHeroes.every((h) => LEGACY_IDS[h.id] && HERO[LEGACY_IDS[h.id]]), `commit ${OLD_COMMIT} has the 13 human heroes and every one has a beast (${oldHeroes.map((h) => h.id + '->' + LEGACY_IDS[h.id]).join(' ')})`);

// three old players: a new one in the guided first session, one mid-game with equipment, a veteran owning every hero
let clock = new Date(2026, 10, 20, 9, 0, 0);
function oldPlayer(kind) {
  const s = store();
  const M = old.createMeta({ storage: s, now: () => clock, preset: kind === 'vet' ? 'vet' : undefined }); M.load();
  if (kind === 'new') { M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 70 }); M.ftueDone('levelup'); M.save(); return s; }
  for (let n = 1; n <= (kind === 'vet' ? 18 : 9); n++) {
    M.finishStage({ stage: n, won: true, wavesCleared: 5, seconds: 60 + n });
    if (M.acc.freePull) M.pull(1);
    M.acc.gems += 2000; for (let k = 0; k < 3; k++) M.pull(10);
    for (const id of Object.keys(M.acc.heroes)) for (let j = 0; j < 3; j++) M.levelUp(id);
    if (M.unlocked('equip')) for (const id of M.acc.team) M.equipBest(id);
    if (M.unlocked('daily') && M.canClaimDaily()) M.claimDaily();
    clock = new Date(clock.getTime() + 86400000);
  }
  M.finishStage({ stage: 99, won: false, wavesCleared: 2, seconds: 40 });
  if (kind === 'vet') { for (const h of oldHeroes) if (!M.acc.heroes[h.id] || !M.acc.heroes[h.id].level) M.acc.heroes[h.id] = { level: 4, shards: 17 }; M.setTeam(['soi', 'sam', 'nhen', 'yta']); M.equipBest('soi'); M.equipBest('nhen'); }
  M.save();
  return s;
}

const mapId = (id) => LEGACY_IDS[id];
for (const kind of ['new', 'mid', 'vet']) {
  const s1 = oldPlayer(kind); const raw = s1.getItem(KEY); const v1 = JSON.parse(raw);
  check(v1.v === 1 && Object.keys(v1.heroes).every((id) => mapId(id)), `${kind}: the old module wrote a version-1 save with old ids (${Object.keys(v1.heroes).join(',')})`);
  const M = createMeta({ storage: s1, now: () => clock }); M.load();
  const a = M.acc;
  check(a.v === 2 && !M.readOnly, `${kind}: loaded as version 2, writable`);
  const heroesOk = Object.entries(v1.heroes).every(([id, h]) => { const b = a.heroes[mapId(id)]; return b && b.level === h.level && b.shards === h.shards && b.form === 1 && b.branch === null; });
  check(heroesOk && Object.keys(a.heroes).length === Object.keys(v1.heroes).length, `${kind}: every hero is its beast with the same level and shards, form 1, no branch (${Object.keys(a.heroes).length} beasts)`);
  check(JSON.stringify(a.team) === JSON.stringify(v1.team.map(mapId)), `${kind}: team kept in order (${v1.team.join(',')} -> ${a.team.join(',')})`);
  const equipOk = Object.entries(v1.equip || {}).every(([id, slots]) => JSON.stringify(a.equip[mapId(id)]) === JSON.stringify(slots)) && Object.keys(a.equip).length === Object.keys(v1.equip || {}).length;
  check(equipOk, `${kind}: worn equipment stays on the same beast, slot by slot (${Object.keys(v1.equip || {}).length} heroes dressed)`);
  const same = ['gold', 'gems', 'pity', 'cleared', 'best', 'bag', 'mats', 'uidSeq', 'daily', 'chapters', 'stats', 'level', 'xp', 'ftue', 'freePull', 'equipAt', 'mergeOpen', 'seen'];
  const lost = same.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(v1[k]));
  check(lost.length === 0, `${kind}: gold, gems, pity, stages, best times, bag, forge stock, daily, chapters, stats, account level, FTUE kept${lost.length ? ' (changed: ' + lost.join(', ') + ')' : ''}`);
  const flagsKept = ['seenUnlock', 'visited'].every((k) => Object.keys(v1[k] || {}).every((id) => a[k][id] === true));
  check(flagsKept, `${kind}: every unlock reveal already seen and every tab already visited stays so`);
  check(Object.values(a.evo.stone).every((n) => n === 0) && a.evo.core === 0, `${kind}: evolution stock starts empty`);
  check(M.teamSpec().every((t) => t.form === 1 && HERO[t.id]), `${kind}: the team fights as form-1 beasts`);
  // idempotent: save the migrated account, load it again, save again
  M.save(); const once = s1.getItem(KEY);
  const N = createMeta({ storage: s1, now: () => clock }); N.load(); N.save(); const twice = s1.getItem(KEY);
  check(once === twice && JSON.parse(once).v === 2, `${kind}: loading the migrated save again changes nothing (${once.length} bytes both times)`);
  // a version-1 save loaded twice without a save between gives the same account each time
  const P = createMeta({ storage: store(raw), now: () => clock }); P.load(); const Q = createMeta({ storage: store(raw), now: () => clock }); Q.load();
  check(JSON.stringify(P.acc) === JSON.stringify(Q.acc) && JSON.stringify(P.acc) === JSON.stringify(a), `${kind}: the same version-1 save migrates to the same account every time`);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} FAILED\n` + fails.map((f) => '  - ' + f).join('\n') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
