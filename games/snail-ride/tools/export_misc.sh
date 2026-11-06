#!/bin/sh
# Audio wav->mp3, fonts, localization -> game dir. Usage: export_misc.sh REF_DIR GAME_DIR TOOLS_DIR
REF=$1; G=$2; T=$3
mkdir -p "$G/audio" "$G/art/fonts"
for f in "$REF"/dump/audio/*.wav; do
  n=$(basename "$f" .wav)
  timeout 60 ffmpeg -nostdin -loglevel error -y -i "$f" -codec:a libmp3lame -q:a 5 "$G/audio/$n.mp3" || echo "FAIL $n"
done
cp "$REF/dump/font/Linotte_Bold__47.ttf" "$G/art/fonts/linotte-bold.ttf"
timeout 60 python3 -I "$T/export_lang.py" "$REF/dump/text" "$G/data/lang.json"
