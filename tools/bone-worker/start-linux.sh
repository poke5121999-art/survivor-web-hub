#!/bin/sh
# Idempotent: starts the linux:claude bone worker in tmux session "bone", window "worker".
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HOME/bone-worker"
mkdir -p "$WORK"

if tmux has-session -t bone 2>/dev/null && tmux list-windows -t bone -F '#W' | grep -qx worker; then
  if pgrep -f -- '--id linux:claude .*bone-worker' >/dev/null 2>&1; then
    echo "worker linux:claude đã chạy"
    exit 0
  fi
  tmux kill-window -t bone:worker
fi

CMD="cd '$HERE' && node worker.mjs --id linux:claude --label 'Linux · claude' --account claude --priority 0 --delay 0 --work-dir '$WORK' 2>&1 | tee -a '$WORK/stdout-claude.log'"
if tmux has-session -t bone 2>/dev/null; then
  tmux new-window -d -t bone -n worker "$CMD"
else
  tmux new-session -d -s bone -n worker "$CMD"
fi
echo "đã bật worker linux:claude (tmux attach -t bone)"
