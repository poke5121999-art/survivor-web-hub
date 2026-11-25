# Idempotent: bật worker pc:claude (priority 1, nhường 20 s cho linux:claude) trong cửa sổ thu nhỏ.
# Đặt ANIM_ENGINE_CMD trước khi chạy (đường dẫn anim-gen trên PC). Trần bộ nhớ: commit trống < min_free_gb thì không nhận job.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = "D:\anim-worker"
New-Item -ItemType Directory -Force $work | Out-Null
if (-not $env:ANIM_ENGINE_CMD) { Write-Warning "ANIM_ENGINE_CMD chưa đặt: worker sẽ tìm $HOME\anim-studio\bin\anim-gen.cmd" }

$id = "pc:claude"
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*anim-worker*worker.mjs*--id $id *" }
if ($running) { Write-Host "worker $id already running (PID $($running.ProcessId))"; exit 0 }
$cmd = "node `"$here\worker.mjs`" --id $id --label `"PC - claude`" --account claude --config-dir `"$HOME\.claude`" --priority 1 --delay 20 --work-dir `"$work`""
Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "title anim-$id && $cmd"
Write-Host "started worker $id"
