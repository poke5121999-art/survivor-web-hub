#!/bin/sh
# rcc.sh "<op args>" ["<op args>" ...]: xếp lệnh cho phiên rc-live.js, chờ ack lệnh cuối, in 4 dòng log cuối + ảnh chụp.
# Lệnh "q" chỉ xếp vào rồi thoát, không chờ.
OUT=${RC_OUT:-D:/rc-ref/live}
id=$(wc -l < "$OUT/cmd.txt" | tr -d ' ')
for c in "$@"; do id=$((id + 1)); echo "$id $c" >> "$OUT/cmd.txt"; done
[ "$c" = "q" ] && exit 0
i=0
while [ "$(cat "$OUT/ack.txt" 2>/dev/null || echo 0)" -lt "$id" ]; do
  i=$((i + 1)); [ $i -gt 600 ] && { echo "timeout waiting for $id" >&2; exit 1; }
  sleep 0.5
done
tail -4 "$OUT/log.txt"
echo "$OUT/live-$id.png"
