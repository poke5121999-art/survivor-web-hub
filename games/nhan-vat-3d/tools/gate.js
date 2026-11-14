// Gate: regenerate every lib/lf module from the pinned Lanternfall source into a scratch folder and require the
// result to be byte-identical to the committed lib/lf/*.js (and lib/lf to hold nothing else).
// Usage: node tools/gate.js            exit 0 = PASS
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const L = require('./lf-port-lib.js');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-gate-'));
  try {
    const built = await L.main('all', tmp);
    const dir = path.join(L.ROOT, 'lib', 'lf');
    let bad = 0;
    for (const n of L.ORDER) {
      const f = built[n].file, a = fs.readFileSync(path.join(tmp, f)), b = fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f)) : null;
      const same = b && Buffer.compare(a, b) === 0;
      console.log((same ? 'same ' : 'DIFF ') + f + '  ' + a.length + ' bytes');
      if (!same) bad++;
    }
    const expected = new Set(L.ORDER.map((n) => built[n].file));
    for (const f of fs.readdirSync(dir)) if (!expected.has(f)) { console.log('EXTRA ' + f + ' (lib/lf must hold generated files only)'); bad++; }
    console.log(bad ? `GATE FAIL (${bad})` : `GATE PASS: ${L.ORDER.length} modules byte-identical to a fresh run against Lanternfall @ ${L.COMMIT.slice(0, 7)}`);
    process.exitCode = bad ? 1 : 0;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error('GATE FAIL: ' + e.message); process.exit(1); });
