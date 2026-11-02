// Builds a Game with every feature and its data. json(path) reads a file under the game folder: fetch in the page,
// fs in node tests (test/cats-soup-*.js), so both run the same setup.
import { Game } from './game.js';
import { FEATURES } from './registry.js';

export async function makeGame(json, rng = Math.random) {
  const names = [...new Set(FEATURES.flatMap(f => f.data || []))];
  const [tables, fields, ...files] = await Promise.all([json('data/tables.json'), json('data/fields.json'), ...names.map(n => json(`data/${n}.json`))]);
  const data = Object.fromEntries(names.map((n, i) => [n, files[i]]));
  return new Game(tables, fields, rng, FEATURES, data);
}
