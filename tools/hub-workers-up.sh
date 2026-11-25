#!/bin/sh
# Bật lại các worker của hub (Xưởng VFX, Xưởng Anim) trên máy linux nếu chúng không chạy.
# Cron gọi lúc khởi động máy và 5 phút một lần; mỗi start script tự bỏ qua khi worker đã chạy.
export PATH="$HOME/.local/bin:$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOG="$HOME/hub-workers-up.log"
date '+%F %T' > "$HOME/hub-workers-up.last"
for s in "$HOME/vfx-worker/app/vfx-worker/start-linux.sh" "$HOME/anim-worker/app/start-linux.sh"; do
  [ -f "$s" ] || { echo "$(date '+%F %T') thiếu $s" >> "$LOG"; continue; }
  out=$(sh "$s" 2>&1)
  case "$out" in *"đã chạy"*|*"tạm dừng"*) ;; *) echo "$(date '+%F %T') $s: $out" >> "$LOG" ;; esac
done
