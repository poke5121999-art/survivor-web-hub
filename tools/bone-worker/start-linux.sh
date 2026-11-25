#!/bin/sh
# Idempotent: starts the linux:claude bone worker in tmux window claude:bone-worker.
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HOME/bone-worker"
mkdir -p "$WORK"

if tmux has-session -t claude 2>/dev/null && tmux list-windows -t claude -F '#W' | grep -qx bone-worker; then
  if pgrep -f -- '--id linux:claude .*bone-worker' >/dev/null 2>&1; then
    echo "worker linux:claude đã chạy"
    exit 0
  fi
  tmux kill-window -t claude:bone-worker
fi

CMD="cd '$HERE' && node worker.mjs --id linux:claude --label 'Linux · claude' --account claude --priority 0 --delay 0 --work-dir '$WORK' 2>&1 | tee -a '$WORK/stdout-claude.log'"
if tmux has-session -t claude 2>/dev/null; then
  tmux new-window -d -t claude -n bone-worker "$CMD"
else
  tmux new-session -d -s claude -n bone-worker "$CMD"
fi
echo "đã bật worker linux:claude (tmux select-window -t claude:bone-worker)"
