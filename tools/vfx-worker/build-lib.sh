#!/bin/sh
# Dựng vfx/pixelfx-lib.js và bundle mẫu từ bản clone pixelfx. Dùng: sh tools/vfx-worker/build-lib.sh <đường dẫn clone pixelfx>
set -e
PFX="${1:-$PIXELFX_DIR}"
[ -n "$PFX" ] || { echo "thiếu đường dẫn clone pixelfx (đối số 1 hoặc PIXELFX_DIR)"; exit 1; }
HUB="$(cd "$(dirname "$0")/../.." && pwd)"
ES="$PFX/node_modules/.bin/esbuild"
cd "$PFX"
printf 'export { effects, categories } from "./src/fx/index.js";\nexport * from "./src/core/index.js";\n' > .vfx-lib-entry.js
"$ES" .vfx-lib-entry.js --bundle --format=esm --minify --legal-comments=none --outfile="$HUB/vfx/pixelfx-lib.js"
printf 'export * as fx from "./src/fx/fire/campfire.js";\nexport * from "./src/core/index.js";\n' > .vfx-mock-entry.js
"$ES" .vfx-mock-entry.js --bundle --format=esm --minify --legal-comments=none --outfile="$HUB/vfx/mock/campfire.bundle.js"
rm -f .vfx-lib-entry.js .vfx-mock-entry.js
cp LICENSE "$HUB/vfx/LICENSE-pixelfx.txt"
printf '\n\n----- NOTICE.md -----\n\n' >> "$HUB/vfx/LICENSE-pixelfx.txt"
cat NOTICE.md >> "$HUB/vfx/LICENSE-pixelfx.txt"
