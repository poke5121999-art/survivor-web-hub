// Decodes data/bz-cast.js in Node and checks it. Usage: node D:/voxel-chars/tools/check-bz-cast.js [file]
// Prints per character: nodes, parts, voxels, clips with frame counts. Exit code 1 on any mismatch
// (RLE not decoding to exactly nx*ny*nz cells, palette index out of range, voxel count mismatch, clip data size, bad node parents).
'use strict';
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'bz-cast.js'));
(async () => {
  const { BZ_CAST } = await import(pathToFileURL(FILE).href);
  const bad = []; const tot = { chars: 0, vox: 0 }; const per = {};
  const u8 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
  console.log('version', BZ_CAST.version, 'made', BZ_CAST.made, 'source', BZ_CAST.source, 'size', (fs.statSync(FILE).size / 1048576).toFixed(2) + ' MB');
  for (const c of BZ_CAST.chars) {
    const tag = c.group + '/' + c.id; tot.chars++; per[c.group] = per[c.group] || { n: 0, vox: 0 }; per[c.group].n++;
    // node tree
    c.nodes.forEach((n, i) => { if (i === 0 ? n.parent !== -1 : !(n.parent >= 0 && n.parent < i)) bad.push(tag + ': node ' + i + ' parent ' + n.parent); if (n.p.length !== 3 || n.q.length !== 4 || n.s.length !== 3) bad.push(tag + ': node ' + i + ' bad p/q/s length'); });
    let vox = 0;
    c.parts.forEach((p, pi) => {
      const raw = u8(p.rle); if (raw.length % 4) { bad.push(tag + ': part ' + pi + ' rle length not a multiple of 4'); return; }
      const u16 = new Uint16Array(raw.buffer, raw.byteOffset, raw.length / 2); let cells = 0; let solid = 0;
      for (let i = 0; i < u16.length; i += 2) { cells += u16[i]; if (u16[i + 1]) { solid += u16[i]; if (u16[i + 1] >= p.pal.length) bad.push(tag + ': part ' + pi + ' palette index ' + u16[i + 1] + ' >= ' + p.pal.length); } }
      if (cells !== p.nx * p.ny * p.nz) bad.push(tag + ': part ' + pi + ' rle covers ' + cells + ' cells, grid is ' + p.nx + 'x' + p.ny + 'x' + p.nz + ' = ' + p.nx * p.ny * p.nz);
      if (!(p.node >= 0 && p.node < c.nodes.length)) bad.push(tag + ': part ' + pi + ' node ' + p.node + ' out of range');
      vox += solid;
    });
    if (vox !== c.vox) bad.push(tag + ': voxel count ' + c.vox + ' but parts decode to ' + vox);
    tot.vox += vox; per[c.group].vox += vox;
    const cl = [];
    for (const k in c.clips) {
      const q = c.clips[k]; const need = q.frames * q.nodes.length * 10 * 2; const d = u8(q.data);
      if (d.length !== need) bad.push(tag + ': clip ' + k + ' has ' + d.length + ' bytes, expected ' + need);
      if (q.nodes.some((n) => !(n >= 0 && n < c.nodes.length))) bad.push(tag + ': clip ' + k + ' node index out of range');
      cl.push(k + ':' + q.frames + (q.loop ? 'L' : ''));
    }
    console.log(tag.padEnd(18), String(c.name).padEnd(18), 'h=' + c.height, 'nodes=' + c.nodes.length, 'parts=' + c.parts.length, 'vox=' + vox, cl.join(' '));
  }
  console.log('TOTAL', tot.chars, 'characters,', tot.vox, 'voxels', JSON.stringify(per));
  if (bad.length) { console.log('FAIL ' + bad.length + ' problems'); for (const b of bad.slice(0, 40)) console.log('  ' + b); process.exit(1); }
  console.log('OK'); process.exit(0);
})().catch((e) => { console.log('ERR', e); process.exit(2); });
