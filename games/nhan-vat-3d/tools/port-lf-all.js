// Runs every Lanternfall port generator in dependency order and writes lib/lf/*.js.
// Usage: node tools/port-lf-all.js [outDir=lib/lf]
// env LF_SRC = Lanternfall checkout (default ~/lanternfall-ref/repo, then D:/lanternfall-ref on the office PC)
'use strict';
require('./lf-port-lib.js').run('all');
