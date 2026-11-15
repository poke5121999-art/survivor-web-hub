#!/bin/sh
# Snapshot the sibling code-only kits into ./ext so the scene pages are self-contained (relative paths, Pages-ready):
#   D:/stylized-props   lib/ props/      -> ext/stylized-props/
#   D:/stylized-weapons lib/ weapons/    -> ext/stylized-weapons/
# Their own three.js copy is NOT copied: the scene pages' import map points it at ./vendor/three.module.min.js so the
# whole page shares one three instance (same r170). Re-run after those kits change. Usage: sh tools/sync-ext.sh
set -e
cd "$(dirname "$0")/.."
PROPS_SRC=${PROPS_SRC:-D:/stylized-props}; WEAP_SRC=${WEAP_SRC:-D:/stylized-weapons}
for d in ext/stylized-props/lib ext/stylized-props/props ext/stylized-weapons/lib ext/stylized-weapons/weapons; do rm -rf "$d"; done
mkdir -p ext/stylized-props ext/stylized-weapons
cp -r "$PROPS_SRC/lib" "$PROPS_SRC/props" ext/stylized-props/
cp -r "$WEAP_SRC/lib" "$WEAP_SRC/weapons" ext/stylized-weapons/
for k in stylized-props stylized-weapons; do src=$PROPS_SRC; [ $k = stylized-weapons ] && src=$WEAP_SRC
  { echo "snapshot of $src at $(date '+%Y-%m-%d %H:%M')"; (cd "$src" && git rev-parse --short HEAD 2>/dev/null || echo "no git"); } > ext/$k/SNAPSHOT.txt; done
echo synced
