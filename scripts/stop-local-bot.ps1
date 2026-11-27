# Stop any local node process running this repo (avoid duplicate Discord sessions).
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$root = $repo.Path.Replace("\", "/")
$pidFile = Join-Path $repo.Path ".local-bot.pid"
if (Test-Path $pidFile) {
  $pid = Get-Content -Raw $pidFile | ForEach-Object { $_.Trim() }
  if ($pid -match '^\d+$') {
    Write-Host "Stopping PID $pid (.local-bot.pid)"
    Stop-Process -Id [int]$pid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $cmd = $_.CommandLine
    $cmd -and (
      $cmd -match [regex]::Escape($root) -or
      $cmd -match "discord-coin-sender-bot" -or
      $cmd -match "test[/\\]run\.js"
    )
  } |
  ForEach-Object {
    Write-Host "Stopping PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }