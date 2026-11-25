# Bật lại worker Xưởng Anim (GPU) trên PC nếu nó không chạy. Worker Xưởng VFX chỉ chạy trên linux: chủ dự án chỉ cho dùng tài khoản Claude của linux.
# Task Scheduler "hub-workers-up" gọi lúc đăng nhập và 5 phút một lần; mỗi start script tự bỏ qua worker đã chạy.
$log = "C:\hub-workers\hub-workers-up.log"
$scripts = @("D:\vfx-worker\app\vfx-worker\start-pc.ps1", "C:\anim-worker\app\start-pc.ps1")
foreach ($s in $scripts) {
  if (-not (Test-Path $s)) { continue }
  $out = (& powershell -NoProfile -ExecutionPolicy Bypass -File $s 2>&1 | Out-String).Trim()
  if ($out -match "started|đã bật|lỗi|error") { Add-Content -Encoding utf8 $log ("{0:yyyy-MM-dd HH:mm:ss} {1}: {2}" -f (Get-Date), $s, $out) }
}
