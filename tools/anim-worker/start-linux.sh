#!/bin/sh
# Idempotent: bật worker Xưởng Anim (id linux:claude) trong tmux session "anim-worker".
# Session tự đóng khi node thoát, nên còn session là worker còn chạy. Cron gọi script này lúc khởi động máy
# và 5 phút một lần (tools/hub-workers-up.sh). Engine: ANIM_ENGINE_CMD (mặc định ~/anim-studio/bin/anim-gen).
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HOME/anim-worker"
mkdir -p "$WORK"

# Có file PAUSE thì không bật lại (khi cần mượn GPU để thử engine): touch ~/anim-worker/PAUSE, xong thì xoá file.
if [ -f "$WORK/PAUSE" ]; then
  echo "worker linux:claude tạm dừng ($WORK/PAUSE)"
  exit 0
fi

if tmux has-session -t anim-worker 2>/dev/null; then
  echo "worker linux:claude đã chạy"
  exit 0
fi

ENGINE="${ANIM_ENGINE_CMD:-$HOME/anim-studio/bin/anim-gen}"
CMD="cd '$HERE' && ANIM_ENGINE_CMD='$ENGINE' node worker.mjs --id linux:claude --label 'Linux · claude' --account claude --priority 0 --delay 0 --engine framepack --min-free-vram 4 --work-dir '$WORK' 2>&1 | tee -a '$WORK/stdout.log'"
tmux new-session -d -s anim-worker "$CMD"
echo "đã bật worker linux:claude (tmux attach -t anim-worker)"
