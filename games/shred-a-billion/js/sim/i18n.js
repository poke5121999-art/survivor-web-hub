// Localization from the original's own tables (data/text/{vi,en}.json, keys exactly as in the game).
let table = {}, fallback = {};
export let lang = 'vi';
// {action:Primary} etc. are input-glyph slots in the original; filled with a key/button label
let glyphs = {};
export function setGlyphs(g) { glyphs = g || {}; }
export function setText(t, fb, l) { table = t || {}; fallback = fb || {}; lang = l || lang; }
// PocketsVoice.TeamNow (online with more than one player): T(key) tries key + ".team" first ("partners", "we")
let team = false;
export function setTeam(on) { team = !!on; }
// {0} {1} positional, {0:1} format hint ignored; plural keys "key#one" / "key#other"
export function T(key, ...args) {
  let s = (team && (table[key + '.team'] ?? fallback[key + '.team'])) || (table[key] ?? fallback[key]);
  if (s == null) return key;
  if (args.length) s = s.replace(/\{(\d+)(:[^}]*)?\}/g, (m, i) => (args[+i] ?? m));
  if (s.indexOf('{action:') >= 0) s = s.replace(/\{action:(\w+)\}/g, (m, a) => glyphs[a] ?? a);
  return s;
}
export function has(key) { return key in table || key in fallback; }
export function plural(key, n) { return T(key + (n === 1 ? '#one' : '#other')); }
