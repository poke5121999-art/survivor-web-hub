// node tools/ui_tree.mjs <path under Canvas> [depth] : print the exported uGUI subtree
import fs from 'fs';
const u = JSON.parse(fs.readFileSync(new URL('../art/ui/ui.json', import.meta.url)));
const [path = '', depth = '4'] = process.argv.slice(2);
let n = u.roots.canvas;
for (const seg of path.split('/').filter(Boolean)) n = (n.kids || []).find(k => k.n === seg);
(function w(n, d, p) {
  if (d > +depth) return;
  const t = n.txt ? ` "${n.txt.t.slice(0, 40).replace(/\n/g, ' ')}"` : '';
  const im = n.img && n.img.s ? ` [${n.img.s}]` : '';
  console.log(`${'  '.repeat(d)}${n.n}${n.on ? '' : ' (off)'}${n.btn ? ' BTN' : ''}${im}${t}`);
  (n.kids || []).forEach(k => w(k, d + 1));
})(n, 0);
