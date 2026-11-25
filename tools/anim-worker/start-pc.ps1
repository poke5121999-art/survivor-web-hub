# Trien khai: chep start-pc.ps1 + worker.mjs vao C:\anim-worker\app\ (task hub-workers-up goi file nay moi 5 phut).
# File C:\anim-worker\PAUSE ton tai thi khong bat worker. Idempotent: bat worker pc:gpu (priority 0, nhan ngay; Claude goi qua tai khoan linux, PC chi cho GPU)
# trong cua so thu nho, song sau khi dong phien. Engine o C:\anim-studio (docs/anim-studio.md, muc "Cai tren PC").
# Tran bo nho: commit trong < MinFreeGb thi worker khong nhan job.
param([int]$MinFreeGb = 25)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "C:\anim-worker\PAUSE") { Write-Host "PAUSE co mat, khong bat worker"; exit 0 }
$home2 = "C:\anim-studio"
$work = "$home2\worker"
New-Item -ItemType Directory -Force $work | Out-Null
if (-not (Test-Path "$home2\bin\anim-gen.cmd")) { Write-Error "chua cai engine o $home2"; exit 1 }

# da chay chua: khop theo duong dan day du cua worker.mjs (id pc:claude trung voi worker Bone/VFX)
$mine = "$here\worker.mjs"
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$mine*" }
if ($running) { Write-Host "worker anim already running (PID $($running.ProcessId))"; exit 0 }
$id = "pc:gpu"
$env:ANIM_ENGINE_CMD = "$home2\bin\anim-gen.cmd"
$env:ANIM_HOME = $home2
$env:ANIM_LABEL = "PC $([char]0xB7) GPU (acc linux)"
$env:ANIM_COMFY_FLAGS = "--disable-smart-memory"
$cmd = "node `"$mine`" --id $id --account gpu --claude-bin `"$here\claude-linux.mjs`" --priority 0 --delay 0 --engine framepack --min-free-gb $MinFreeGb --min-free-vram 6 --work-dir `"$work`" >> `"$work\worker-console.log`" 2>&1"
Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "title anim-$id && $cmd" | Out-Null
Start-Sleep 3
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$mine*" } | ForEach-Object { (Get-Process -Id $_.ProcessId).PriorityClass = "BelowNormal" }
Write-Host "started worker $id (min_free_gb $MinFreeGb)"
