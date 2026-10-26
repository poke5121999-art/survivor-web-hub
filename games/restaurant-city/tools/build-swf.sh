#!/bin/sh
# Build Restaurant City game.swf from decompiled AS3 with local patches applied.
# Usage: build-swf.sh [client_checkout=D:/rc-ref/client] [flex_sdk=D:/flex]
set -eu
CLIENT=${1:-D:/rc-ref/client}
FLEX=${2:-D:/flex}
HERE=$(cd "$(dirname "$0")" && pwd)
# RC_PATCHES / RC_SWF_OUT: build a trial SWF from another patch set (swf/<name>.swf, open with index.html?swf=<name>.swf).
PATCHES=${RC_PATCHES:-$HERE/patches}
OUT=${RC_SWF_OUT:-$HERE/../swf/game.swf}
PG=$FLEX/frameworks/libs/player/25.0/playerglobal.swc
[ -f "$FLEX/lib/mxmlc.jar" ] || { echo "mxmlc.jar not found in $FLEX/lib" >&2; exit 1; }
[ -f "$PG" ] || { echo "playerglobal.swc not found at $PG" >&2; exit 1; }
[ -d "$CLIENT/scripts" ] || { echo "client scripts/ not found in $CLIENT" >&2; exit 1; }
echo "client commit: $(git -C "$CLIENT" rev-parse HEAD)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp -r "$CLIENT/scripts" "$TMP/scripts"
for p in "$PATCHES"/*.diff; do
  [ -f "$p" ] || continue
  echo "applying $(basename "$p")"
  # --directory/--unsafe-paths keep git apply inside the temp copy (no repo there)
  ( cd "$TMP" && git apply --whitespace=nowarn "$p" ) || { echo "patch failed to apply: $p" >&2; exit 1; }
done
mkdir -p "$(dirname "$OUT")"
cd "$TMP"
timeout 900 java -jar "$FLEX/lib/mxmlc.jar" +flexlib="$FLEX/frameworks" -load-config= \
  -source-path+=scripts -external-library-path+="$PG" -target-player=25.0 -swf-version=25 \
  -default-size 760 600 -default-frame-rate=25 -static-link-runtime-shared-libraries=true \
  -includes+=away3d.events.BillboardEvent -warnings=false -debug=false \
  -output="$TMP/game.swf" -- scripts/com/playfish/games/cooking/Engine.as
cp "$TMP/game.swf" "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
