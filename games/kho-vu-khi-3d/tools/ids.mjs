import { weapons } from '../weapons/index.js'; import fs from 'node:fs';
const ids = {}; weapons.forEach((w, i) => { ids[i + 1] = w.id; });
fs.writeFileSync(new URL('../ref/ids.json', import.meta.url), JSON.stringify(ids));
const head = ['| # | cell image | weapon id | name |', '|---|---|---|---|'];
const rows = ['## Sheet 1 (owner-weapons-sheet.png, 1477x718)', '', ...head];
const cells = JSON.parse(fs.readFileSync(new URL('../ref/cells.json', import.meta.url)));
let sheet = 1;
weapons.forEach((w, i) => {
  const c = cells[i];
  if (c.sheet !== sheet) { sheet = c.sheet; rows.push('', '## Sheet 2 (owner-tools-sheet.png, 2000x1125)', '', ...head); }
  rows.push(`| ${String(i + 1).padStart(2, '0')} | cells/${String(i + 1).padStart(2, '0')}.png | ${w.id} | ${w.name} |`);
});
fs.writeFileSync(new URL('../ref/weapons.md', import.meta.url), '# Reference cells\n\nOne crop per weapon from the owner sheets (cells/NN.png). Bounding boxes used by the showcase layout are in cells.json; tools/crop.py regenerates them.\n\n' + rows.join('\n') + '\n');
