#!/bin/sh
# Idempotent: starts the linux:claude worker in tmux session "vfx", window "worker".
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HOME/vfx-worker"
mkdir -p "$WORK"

# Cửa sổ "worker" tự đóng khi node thoát, nên còn cửa sổ là worker còn chạy. Không dò bằng pgrep "--id linux:claude":
# worker Xưởng Anim cũng mang id đó, dò vậy thì thấy nhầm worker kia và không bật VFX.
if tmux has-session -t vfx 2>/dev/null && tmux list-windows -t vfx -F '#W' | grep -qx worker; then
  echo "worker linux:claude đã chạy"
  exit 0
fi

CMD="cd '$HERE' && node worker.mjs --id linux:claude --label 'Linux · claude' --account claude --priority 0 --delay 0 --work-dir '$WORK' 2>&1 | tee -a '$WORK/stdout-claude.log'"
if tmux has-session -t vfx 2>/dev/null; then
  tmux new-window -d -t vfx -n worker "$CMD"
else
  tmux new-session -d -s vfx -n worker "$CMD"
fi
echo "đã bật worker linux:claude (tmux attach -t vfx)"
