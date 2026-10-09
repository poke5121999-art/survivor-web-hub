#!/bin/sh
# Chạy lần lượt mọi test/dredge-*.js, in một dòng tổng kết mỗi bộ và các dòng ✘/FAIL của bộ đó.
#   sh test/run-dredge.sh                      máy chủ tĩnh cục bộ (mỗi bộ tự dựng)
#   DR_URL=https://poke5121999-art.github.io/survivor-web-hub sh test/run-dredge.sh   chạy trên Pages
# Bỏ qua dredge-tour.js (chụp ảnh, không kiểm) và dredge-water-table.js (bảng đo). Bộ đỏ khi máy tải nặng: chạy riêng lại trước khi đào.
cd "$(dirname "$0")/.." || exit 1
for f in test/dredge-*.js; do
  case $f in *tour*|*water-table*) continue ;; esac
  out=$(timeout 1500 node "$f" 2>&1); rc=$?
  printf '%s rc=%s | %s\n' "$f" "$rc" "$(printf '%s' "$out" | grep -iE 'pass|đạt|fail|trượt|hỏng' | tail -1)"
  printf '%s\n' "$out" | grep -E '✘|^\s*FAIL' | head -5
done
