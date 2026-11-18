// Shared browser launch for the repo3d tools: picks playwright-core and GPU flags per OS.
// PLAYWRIGHT_PATH overrides the module path. Windows uses ANGLE d3d11, Linux ANGLE gl-egl (reaches the real GPU headless).
'use strict';
const os = require('os');
const path = require('path');
const WIN = process.platform === 'win32';
const PW = process.env.PLAYWRIGHT_PATH || (WIN
  ? 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core'
  : path.join(os.homedir(), '.cache/pw-node/node_modules/playwright-core'));
const GPU_ARGS = WIN ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
const launch = (opts = {}) => require(PW).chromium.launch({ channel: 'chrome', headless: true, args: GPU_ARGS, ...opts });
const scratch = (name) => path.join(os.tmpdir(), 'repo3d-' + name);
module.exports = { PW, GPU_ARGS, launch, scratch };
