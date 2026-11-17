// Skins (js/skins.js): the table covers every tank, ids are cleaned on every trust line (save, lobby, roster), and the
// v2 save migration refunds the old paints, glows and decals once.
//   timeout 60 node tools/skins-test.mjs
import { MECHS, MECH_ORDER, BOSSES } from '../js/data.js';
import { SKINS, GRADES, GRADE_ORDER, SKIN_PRICE, AURAS, SIGILS, BASE_SKIN, skinOf, cleanSkin } from '../js/skins.js';
import { makeMeta, legacyRefund } from '../js/meta.js';
import { createMatch } from '../js/sim.js';
import { roster, matchOptions } from '../js/netstate.js';

let fail = 0, n = 0;
const check = (name, ok, info) => { n++; if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (!ok && info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const hex = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

// ---- the table
const missing = MECH_ORDER.filter((k) => !SKINS[k]), extra = Object.keys(SKINS).filter((k) => !MECHS[k]);
check(`every tank of MECH_ORDER (${MECH_ORDER.length}) has skins, no skins for unknown keys`, !missing.length && !extra.length, { missing, extra });
const bad = [];
for (const k of MECH_ORDER) {
  const list = SKINS[k] || [];
  const grades = list.map((s) => s.grade).join();
  if (grades !== 'A,S,SS') bad.push(`${k}: grades ${grades}`);
  if (list[0] && (list[0].id !== BASE_SKIN || list[0].price !== 0 || list[0].pal !== null)) bad.push(`${k}: first skin is not the free base look`);
  if (new Set(list.map((s) => s.id)).size !== list.length) bad.push(`${k}: duplicate ids`);
  for (const s of list) {
    if (!GRADES[s.grade] || s.price !== SKIN_PRICE[s.grade]) bad.push(`${k}.${s.id}: grade ${s.grade} price ${s.price}`);
    if (typeof s.name !== 'string' || s.name.length < 3) bad.push(`${k}.${s.id}: name`);
    if (s.pal && !['body', 'deep', 'trim', 'glow'].every((f) => hex(s.pal[f]))) bad.push(`${k}.${s.id}: palette`);
    if (s.grade !== 'A' && !s.pal) bad.push(`${k}.${s.id}: a premium skin without a palette`);
    if (s.aura && !AURAS[s.aura]) bad.push(`${k}.${s.id}: aura ${s.aura}`);
    if (s.grade === 'SS' && (!s.flair || !SIGILS.includes(s.flair.sigil) || !hex(s.flair.pulse) || !s.aura)) bad.push(`${k}.${s.id}: SS without sigil, pulse and aura`);
  }
}
check('each tank has A (free base look) / S / SS with prices 0 / 800 / 2000, valid palettes, SS with sigil, pulse colour and aura', !bad.length, bad.slice(0, 6).join('; '));
const names = MECH_ORDER.flatMap((k) => SKINS[k].slice(1).map((s) => s.name));
check('premium skin names are unique across tanks', new Set(names).size === names.length, names.filter((x, i) => names.indexOf(x) !== i));
const pals = MECH_ORDER.flatMap((k) => SKINS[k].slice(1).map((s) => [s.pal.body, s.pal.trim, s.pal.glow].join()));
check('premium palettes are not copies of each other', new Set(pals).size === pals.length);
check('SS is clearly pricier than S', SKIN_PRICE.SS >= 2 * SKIN_PRICE.S && GRADE_ORDER.join() === 'A,S,SS');

// ---- cleanSkin: the one validator on every input
const cs = [cleanSkin('soi', 's'), cleanSkin('soi', 'ss'), cleanSkin('soi', 'goc'), cleanSkin('soi', 'zzz'), cleanSkin('soi', 7), cleanSkin('soi', null), cleanSkin('ghost', 's'), cleanSkin('titan', 's'), cleanSkin('soi', '__proto__'), cleanSkin('constructor', 's')];
check('cleanSkin keeps known non-base ids and drops base, unknown, typed-wrong, boss and prototype keys to null', JSON.stringify(cs) === JSON.stringify(['s', 'ss'].concat(Array(8).fill(null))), cs);
check('skinOf falls back to the base row for an unknown id, null for bosses', skinOf('soi', 'zzz').id === BASE_SKIN && skinOf('soi', 'ss').grade === 'SS' && skinOf('titan', 'ss') === null && skinOf(Object.keys(BOSSES)[0]) === null);

// ---- online: a roster that crosses the wire is cleaned on both ends by createMatch
const rosterIn = [
  { team: 0, mech: 'soi', name: 'A', bot: true, diff: 'normal', skin: 'ss' },
  { team: 0, mech: 'ung', name: 'B', bot: true, diff: 'normal', skin: 'zzz' },
  { team: 0, mech: 'hac', name: 'C', bot: true, diff: 'normal', skin: { evil: 1 } },
  { team: 1, mech: 'loi', name: 'D', bot: true, diff: 'normal', skin: 's' },
  { team: 1, mech: 'bang', name: 'E', bot: true, diff: 'normal', skin: 'goc' },
  { team: 1, mech: 'tho', name: 'F', bot: true, diff: 'normal' },
];
const m = createMatch({ map: 'denrung', seed: 7, roster: rosterIn });
check('host: createMatch keeps valid skins and drops unknown, typed-wrong and base ids to null', m.units.map((u) => u.skin).join('|') === 'ss|||s||', m.units.map((u) => u.skin));
const wire = JSON.parse(JSON.stringify(roster(m)));
check('the start roster carries skin and nothing of the old paint / glow / decal', wire.units.map((u) => u.skin).join('|') === 'ss|||s||' && wire.units.every((u) => !('paint' in u) && !('glow' in u) && !('decal' in u)), wire.units[0]);
wire.units[1].skin = 'ss'; wire.units[2].skin = 'nope'; wire.units[4].skin = 's';
const g = createMatch(matchOptions(wire));
check('guest: a roster edited on the wire is cleaned again (valid ids kept, bad ones dropped), so both ends draw from SKINS', g.units.map((u) => u.skin).join('|') === 'ss|ss||s|s|', g.units.map((u) => u.skin));

// ---- save: migration and skin ownership on an in-memory store
const mem = (raw) => { const st = new Map(); if (raw !== undefined) st.set('dtt.save.v1', JSON.stringify(raw)); return { getItem: (k) => (st.has(k) ? st.get(k) : null), setItem: (k, v) => st.set(k, String(v)), st }; };
const v2 = { v: 2, coins: 50, gems: 3, owned: ['trau', 'soi', 'ung', 'hac', 'loi'], ownedPaints: ['goc', 'vang', 'den', 'den', 'zzz', 7], ownedGlows: ['goc', 'luc'], ownedDecals: ['goc', 'sao', 'soc'], paints: { loi: 'vang' }, glows: { soi: 'luc' }, decals: { trau: 'sao' } };
check('legacyRefund prices the old items once each (vang 200 + den 250 + luc 250 + sao 200 + soc 150 = 1050), 0 for a v3 save', legacyRefund(v2) === 1050 && legacyRefund({ ...v2, v: 3 }) === 0 && legacyRefund(null) === 0);
const s1 = mem(v2), a = makeMeta({ storage: s1 }), ad = a.get(), saved = JSON.parse(s1.st.get('dtt.save.v1'));
check('a v2 save loads as v3 with 1050 coins refunded, written back at once without the old fields', ad.v === 3 && ad.coins === 1100 && ad.gems === 3 && a.refunded === 1050 && saved.v === 3 && saved.coins === 1100 && !['ownedPaints', 'ownedGlows', 'ownedDecals', 'paints', 'glows', 'decals'].some((f) => f in saved), { coins: ad.coins, refunded: a.refunded, keys: Object.keys(saved) });
const b = makeMeta({ storage: s1 });
check('loading it again refunds nothing more', b.get().coins === 1100 && b.refunded === 0, b.get().coins);
const s3 = mem({ ...v2, v: 3, coins: 10 });
check('a v3 save that still has old fields is not refunded', makeMeta({ storage: s3 }).get().coins === 10);
const c = makeMeta({ storage: mem() }), cd = c.get();
cd.coins = 900;
const buys = [c.buySkin('soi', 's'), cd.coins, c.buySkin('soi', 'ss'), cd.coins, c.setSkin('soi', 's'), cd.skins.soi, c.skinFor('soi'), c.setSkin('loi', 's'), c.ownsSkin('loi', 'goc'), c.ownsSkin('soi', 'ss')];
check('buySkin charges 800 for S, refuses SS when short; setSkin equips an owned skin of an owned tank; the base skin is always owned', buys.join('|') === 'true|100|false|100|true|s|s|false|true|false', buys);

console.log(`${n - fail} / ${n} ok`);
process.exitCode = fail ? 1 : 0;
