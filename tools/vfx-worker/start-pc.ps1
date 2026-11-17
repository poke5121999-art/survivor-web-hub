# Idempotent: starts the pc:claude and pc:claude2 workers in minimized windows.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = "D:\vfx-worker"
New-Item -ItemType Directory -Force $work | Out-Null

$workers = @(
  @{ Id = "pc:claude";  Label = "PC - claude";  Account = "claude";  Cfg = "$HOME\.claude";      Priority = 1; Delay = 20 },
  @{ Id = "pc:claude2"; Label = "PC - claude2"; Account = "claude2"; Cfg = "$HOME\.claude-acc2"; Priority = 2; Delay = 40 }
)

foreach ($w in $workers) {
  $running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*worker.mjs*--id $($w.Id) *" }
  if ($running) { Write-Host "worker $($w.Id) already running (PID $($running.ProcessId))"; continue }
  $cmd = "node `"$here\worker.mjs`" --id $($w.Id) --label `"$($w.Label)`" --account $($w.Account) --config-dir `"$($w.Cfg)`" --priority $($w.Priority) --delay $($w.Delay) --work-dir `"$work`""
  Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "title vfx-$($w.Id) && $cmd"
  Write-Host "started worker $($w.Id)"
}
