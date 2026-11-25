#!/bin/sh
# Idempotent: bật worker linux:claude trong tmux session "anim", window "worker".
# Engine: ANIM_ENGINE_CMD (mặc định ~/anim-studio/bin/anim-gen). Khoá worker: ~/.anim-worker-key.
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$HOME/anim-worker"
mkdir -p "$WORK"

if tmux has-session -t anim 2>/dev/null && tmux list-windows -t anim -F '#W' | grep -qx worker; then
  if ps -eo args | grep -v grep | grep -q -- '--id linux:claude '; then
    echo "worker linux:claude đã chạy"
    exit 0
  fi
  tmux kill-window -t anim:worker
fi

ENGINE="${ANIM_ENGINE_CMD:-$HOME/anim-studio/bin/anim-gen}"
CMD="cd '$HERE' && ANIM_ENGINE_CMD='$ENGINE' node worker.mjs --id linux:claude --label 'Linux · claude' --account claude --priority 0 --delay 0 --work-dir '$WORK' 2>&1 | tee -a '$WORK/stdout-claude.log'"
if tmux has-session -t anim 2>/dev/null; then
  tmux new-window -d -t anim -n worker "$CMD"
else
  tmux new-session -d -s anim -n worker "$CMD"
fi
echo "đã bật worker linux:claude (tmux attach -t anim)"
