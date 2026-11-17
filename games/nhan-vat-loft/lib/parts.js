// Page glue for the parts prototype: a hero's code parts (fits/parts/<hero>.js, written by parts-proto/fit-parts.mjs)
// -> one skinned mesh in the same shape lib/char.js buildCharacter returns, so makeCharacter(table, { arr }) reuses
// the skeleton, clips, springs and the face decal of the whole-character table unchanged.
// reps = { bodyLoft: module, shell: module, ... } (parts-proto/rep/*.mjs), passed in so this file has no node imports.
// Each rep build(table, ctx) returns { pos, idx, col?, si?, sw? } in bind-pose world metres; parts without col / si / sw
// get the palette's first colour and the slot's default bone.
import { buildCharacter } from './char.js';

const DEFAULT_BONE = { hair: 'Head_M', hat: 'Head_M', ears: 'Head_M', accessory: 'Head_M' };

export function buildFromParts(heroTable, partsFile, reps) {
  const base = buildCharacter(heroTable), names = heroTable.skel.names;
  const ctx = { hero: { name: heroTable.hero, joint: base.joints }, skel: heroTable.skel, body: null };
  const list = [...partsFile.parts].sort((a, b) => (b.rep === 'bodyLoft') - (a.rep === 'bodyLoft'));
  const body = list.find((p) => p.rep === 'bodyLoft'); if (body) ctx.body = body.table;
  const pos = [], col = [], idx = [], si = [], sw = [], part = [], partNames = [];
  const buildOne = (rep, table) => {
    if (rep.includes('+')) return table.parts.map((p) => buildOne(p.rep, p.table)).flat();
    const R = reps[rep]; if (!R) throw new Error(`rep module ${rep} not passed to buildFromParts`);
    return [R.build(table, ctx)];
  };
  for (const p of list) {
    const k = partNames.length; partNames.push(p.id);
    const fallbackBone = Math.max(0, names.indexOf(DEFAULT_BONE[p.slot] || 'Root_M')), grey = (heroTable.palette && heroTable.palette[0]) || [0.8, 0.8, 0.8];
    for (const g of buildOne(p.rep, p.table)) {
      const v0 = pos.length / 3, nv = g.pos.length / 3;
      for (let i = 0; i < g.pos.length; i++) pos.push(g.pos[i]);
      for (let i = 0; i < nv; i++) {
        if (g.col && g.col.length === nv * 3) col.push(g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]); else col.push(...grey);
        if (g.si && g.sw && g.si.length === nv * 4) for (let c = 0; c < 4; c++) { si.push(g.si[i * 4 + c]); sw.push(g.sw[i * 4 + c]); }
        else si.push(fallbackBone, 0, 0, 0), sw.push(1, 0, 0, 0);
        part.push(k);
      }
      for (let i = 0; i < g.idx.length; i++) idx.push(g.idx[i] + v0);
    }
  }
  // head: the whole-character table's SH head (fitted to the face meshes) carries the code-drawn face decal
  { const hp = base.partNames.indexOf('head'), map = new Map(), k = partNames.length; partNames.push('head');
    for (let v = 0; v < base.part.length; v++) if (base.part[v] === hp) {
      map.set(v, pos.length / 3); pos.push(base.position[v * 3], base.position[v * 3 + 1], base.position[v * 3 + 2]);
      col.push(base.color[v * 3], base.color[v * 3 + 1], base.color[v * 3 + 2]); part.push(k);
      for (let c = 0; c < 4; c++) { si.push(base.skinIndex[v * 4 + c]); sw.push(base.skinWeight[v * 4 + c]); } }
    for (let t = 0; t < base.index.length; t += 3) { const a = map.get(base.index[t]), b = map.get(base.index[t + 1]), c = map.get(base.index[t + 2]); if (a !== undefined && b !== undefined && c !== undefined) idx.push(a, b, c); } }
  const nv = pos.length / 3;
  return { position: new Float32Array(pos), color: new Float32Array(col), index: new Uint32Array(idx), skinIndex: new Uint16Array(si), skinWeight: new Float32Array(sw),
    part: Uint8Array.from(part), tfrac: new Float32Array(nv), outlineW: new Float32Array(nv).fill(1), partNames, chains: base.chains,
    face: base.face, restWorld: base.restWorld, joints: base.joints, headCenter: base.headCenter };
}
