# Deploy discord-coin-sender-bot to Linux over SSH/SCP (secrets stay local, never git).
# Usage:
#   $env:DEPLOY_HOST = "192.168.0.99"
#   $env:DEPLOY_USER = "server"
#   $env:DEPLOY_PASS = "your-password"   # do not commit
#   powershell -File scripts/deploy-to-linux.ps1
#
# Requires: Posh-SSH (Install-Module Posh-SSH -Scope CurrentUser)

param(
  [string]$SshHost = $env:DEPLOY_HOST,
  [string]$SshUser = $env:DEPLOY_USER,
  [string]$RemoteDir = $env:DEPLOY_DIR,
  [string]$Pm2Name = "discord-coin-bot"
)

$ErrorActionPreference = "Stop"
if (-not $SshHost) { throw "Set DEPLOY_HOST or -SshHost" }
if (-not $SshUser) { throw "Set DEPLOY_USER or -SshUser" }
if (-not $RemoteDir) { $RemoteDir = "/home/$SshUser/discord-coin-sender-bot" }

$root = Split-Path $PSScriptRoot -Parent

Import-Module Posh-SSH -ErrorAction Stop

$pass = $env:DEPLOY_PASS
if (-not $pass) {
  $secIn = Read-Host "SSH password for ${SshUser}@${SshHost}" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secIn)
  try { $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
$sec = ConvertTo-SecureString $pass -AsPlainText -Force
$cred = New-Object PSCredential($SshUser, $sec)

$archive = Join-Path $env:TEMP "discord-coin-sender-bot-deploy.tgz"
if (Test-Path $archive) { Remove-Item $archive -Force }

Push-Location $root
& tar -czf $archive `
  --exclude=node_modules `
  --exclude=.git `
  --exclude=.cwallet-browser-profile `
  --exclude=*.log `
  .
Pop-Location

Write-Host "Archive: $archive ($((Get-Item $archive).Length) bytes)"

$session = New-SSHSession -ComputerName $SshHost -Credential $cred -AcceptKey -Force
try {
  Invoke-SSHCommand -SessionId $session.SessionId -Command "mkdir -p '$RemoteDir'" | Out-Null
  Set-SCPItem -ComputerName $SshHost -Credential $cred -AcceptKey -Force -Path $archive -Destination "/tmp/"
  $remote = @"
set -e
export NVM_DIR="`$HOME/.nvm"
if [ -s "`$NVM_DIR/nvm.sh" ]; then . "`$NVM_DIR/nvm.sh"; else
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  . "`$NVM_DIR/nvm.sh"
fi
nvm install 22
nvm use 22
cd '$RemoteDir'
tar -xzf /tmp/discord-coin-sender-bot-deploy.tgz
rm -f /tmp/discord-coin-sender-bot-deploy.tgz
npm install --omit=dev
test -f .env || { echo 'Missing .env on server'; exit 1; }
node scripts/init-db.js
pm2 delete $Pm2Name 2>/dev/null || true
pm2 start src/index.js --name $Pm2Name --interpreter "`$(which node)"
pm2 save
pm2 list
"@
  $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $remote
  $result.Output | ForEach-Object { Write-Host $_ }
  if ($result.ExitStatus -ne 0) {
    throw "Remote deploy failed exit $($result.ExitStatus)"
  }
}
finally {
  Remove-SSHSession -SessionId $session.SessionId -ErrorAction SilentlyContinue | Out-Null
}

Remove-Item $archive -Force -ErrorAction SilentlyContinue
Write-Host "Done. Bot should run on ${SshUser}@${SshHost} ($RemoteDir)"