#!/bin/sh
# Original AudioClips (AssetRipper export, already Ogg Vorbis) -> art/sfx/*.mp3 (Safari-safe). Music at 96k, sfx at 64k.
# usage: sh tools/export_audio.sh [assets dir]
set -eu
SRC=${1:-/run/media/bui-thanh-thuong/C0E02AC6E02AC310/farmland-ref/udk/assets/ExportedProject/Assets/AudioClip}
OUT=$(dirname "$0")/../art/sfx
mkdir -p "$OUT"
for f in "$SRC"/*.ogg; do
  n=$(basename "$f" .ogg)
  case "$n" in Audio.Homa.*) continue ;; esac
  case "$n" in
    "Into The Light"*) dst=music2 br=96k ;;
    "Morning Mandolin"*) dst=music1 br=96k ;;
    *) dst=$n br=64k ;;
  esac
  timeout 60 ffmpeg -nostdin -loglevel error -y -i "$f" -ac 1 -b:a "$br" "$OUT/$dst.mp3"
done
ls "$OUT" | wc -l
