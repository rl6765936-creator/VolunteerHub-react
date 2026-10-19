# VolunteerHub local setup for Windows. Safe to run again: it never drops databases or deletes data.
# Every password is typed by you in this window. Nothing secret is shown, logged or sent anywhere.
# Native tools (npm, psql) write warnings to stderr; failures are checked through exit codes.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'setup-volunteerhub.txt'
Set-Location $root
"VolunteerHub setup log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($text) { Write-Host $text; Add-Content -Encoding utf8 $log $text }
function Plain($secure) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)) }
function Step($text) { Write-Host ''; Write-Host "=== $text ===" -ForegroundColor Cyan; Add-Content -Encoding utf8 $log "=== $text" }

try {
  Step 'Step 1 of 5: checks'
  $nodeVersion = (node -v) 2>$null
  if (-not $nodeVersion) { throw 'Node.js was not found. Install Node.js 22 LTS or newer from https://nodejs.org' }
  $major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
  if ($major -lt 22) { throw "Node.js $nodeVersion is too old. Install Node.js 22 LTS or newer." }
  Log "Node.js $nodeVersion"
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object { $n = 0; [void][int]::TryParse($_.Directory.Parent.Name, [ref]$n); $n } -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not $psql) { throw 'psql.exe was not found under C:\Program Files\PostgreSQL. Is PostgreSQL installed?' }
  Log "psql: $psql"

  Step 'Step 2 of 5: database user and databases'
  $envFile = Join-Path $root '.env'
  $keepEnv = Test-Path $envFile
  if ($keepEnv) {
    Log '.env already exists: keeping it (delete it first if you want to choose new passwords).'
    $dbUrl = (Select-String -Path $envFile -Pattern '^\s*DATABASE_URL\s*=\s*(.+)$').Matches[0].Groups[1].Value.Trim('"')
    $uri = [Uri]$dbUrl
    $appPass = [Uri]::UnescapeDataString($uri.UserInfo.Split(':', 2)[1])
    $appPassUrl = [Uri]::EscapeDataString($appPass)
    if ($uri.AbsolutePath.TrimStart('/') -ne 'volunteerhub_dev') { throw 'DATABASE_URL in .env does not point to volunteerhub_dev. Stopping.' }
  }
  Write-Host 'Tip: switch the keyboard to ENGLISH before typing passwords.' -ForegroundColor Yellow
  $pgPass = Plain (Read-Host 'Password of the "postgres" user (chosen when PostgreSQL was installed)' -AsSecureString)
  if (-not $keepEnv) {
    Write-Host 'Choose a NEW password for the VolunteerHub database user "volunteerhub":'
    Write-Host '  at least 8 characters; English letters, digits and symbols like ! @ # $ % - _ (no spaces or quotes)'
    $appPass = Plain (Read-Host 'New "volunteerhub" database password' -AsSecureString)
    if ($appPass -notmatch '^[\x21-\x7E]{8,}$' -or $appPass -match "['`"\\]") {
      throw 'The volunteerhub password must be at least 8 characters: English letters, digits or symbols, without spaces, quotes or backslashes.'
    }
    $appPassUrl = [Uri]::EscapeDataString($appPass)
  }

  $env:PGPASSWORD = $pgPass
  & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "SELECT 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect as "postgres". Check the password and that the PostgreSQL service is running.' }
  $exists = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='volunteerhub'"
  if ($exists -eq '1') {
    if (-not $keepEnv) {
      & $psql -h localhost -U postgres -d postgres -q -c "ALTER ROLE volunteerhub WITH LOGIN CREATEDB PASSWORD '$appPass'"
      Log 'Database user volunteerhub existed: its password was updated to the new one.'
    } else { Log 'Database user volunteerhub exists.' }
  } else {
    & $psql -h localhost -U postgres -d postgres -q -c "CREATE ROLE volunteerhub WITH LOGIN CREATEDB PASSWORD '$appPass'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the volunteerhub database user.' }
    Log 'Created database user volunteerhub.'
  }
  foreach ($db in 'volunteerhub_dev', 'volunteerhub_test') {
    $has = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'"
    if ($has -ne '1') {
      & $psql -h localhost -U postgres -d postgres -q -c "CREATE DATABASE $db OWNER volunteerhub"
      if ($LASTEXITCODE -ne 0) { throw "Could not create database $db." }
      Log "Created database $db."
    } else { Log "Database $db already exists (kept as is)." }
  }
  Remove-Item Env:PGPASSWORD
  $pgPass = $null

  if (-not $keepEnv) {
    Step 'Step 3 of 5: admin account and JWT secret (.env)'
    $adminEmail = Read-Host 'Email for the first VolunteerHub admin account'
    if ($adminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'That does not look like an email address.' }
    Write-Host 'Choose a password for that admin account (at least 12 characters):'
    $adminPass = Plain (Read-Host 'VolunteerHub admin password' -AsSecureString)
    if ($adminPass.Length -lt 12) { throw 'The admin password must be at least 12 characters.' }
    if ($adminPass -notmatch '^[\x20-\x7E]+$' -or $adminPass -match '["\r\n]') {
      throw 'Use English letters, digits and symbols only, without double quotes.'
    }
    Write-Host 'Choose the JWT secret: a long random text used to sign logins (at least 32 characters, no spaces or quotes):'
    $jwt = Plain (Read-Host 'JWT secret' -AsSecureString)
    if ($jwt.Length -lt 32) { throw 'The JWT secret must be at least 32 characters.' }
    if ($jwt -notmatch '^[\x21-\x7E]+$' -or $jwt -match '"') { throw 'The JWT secret must use English letters, digits and symbols, without spaces or double quotes.' }
    $envText = @"
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
DATABASE_URL=postgresql://volunteerhub:$appPassUrl@localhost:5432/volunteerhub_dev
DATABASE_URL_TEST=postgresql://volunteerhub:$appPassUrl@localhost:5432/volunteerhub_test
JWT_SECRET=$jwt
JWT_EXPIRES_IN_SECONDS=7200
CORS_ORIGINS=http://localhost:5173
UPLOAD_DIR=uploads
TIME_ZONE=Asia/Jerusalem
SEED_ADMIN_EMAIL=$adminEmail
SEED_ADMIN_PASSWORD="$adminPass"
SEED_ADMIN_NAME=VolunteerHub Admin
"@
    [IO.File]::WriteAllText($envFile, $envText, (New-Object Text.UTF8Encoding($false)))
    $adminPass = $null; $jwt = $null
    Log '.env written (passwords and the JWT secret are only in .env, never in this log).'
  } else { Step 'Step 3 of 5: .env kept' }

  Step 'Step 4 of 5: npm install (a few minutes)'
  npm install 2>&1 | Tee-Object -Variable out | Write-Host
  $engineBlocked = $false
  if ($LASTEXITCODE -ne 0) {
    Add-Content -Encoding utf8 $log (($out | Select-Object -Last 20) | Out-String)
    Log 'npm install failed (probably a blocked Prisma download). Retrying without install scripts...'
    npm install --ignore-scripts 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    # Generating the client does not need the blocked engine; point Prisma at an existing file.
    $env:PRISMA_SCHEMA_ENGINE_BINARY = (Get-Command node).Source
    npx prisma generate 2>&1 | Tee-Object -Variable out | Write-Host
    Add-Content -Encoding utf8 $log ($out | Out-String)
    Remove-Item Env:PRISMA_SCHEMA_ENGINE_BINARY
    if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed.' }
    $engineBlocked = $true
  }
  Log 'npm install: OK'

  Step 'Step 5 of 5: migrations, seed and tests'
  $migrated = $false
  if (-not $engineBlocked) {
    npx prisma migrate deploy 2>&1 | Tee-Object -Variable out | Write-Host
    Add-Content -Encoding utf8 $log ($out | Out-String)
    $migrated = ($LASTEXITCODE -eq 0)
  }
  if (-not $migrated) {
    Log 'prisma migrate deploy is unavailable; applying the migration SQL files with psql instead.'
    $env:PGPASSWORD = $appPass
    $count = & $psql -h localhost -U volunteerhub -d volunteerhub_dev -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
    if ([int]$count -eq 0) {
      Get-ChildItem (Join-Path $root 'prisma\migrations') -Directory | Sort-Object Name | ForEach-Object {
        & $psql -h localhost -U volunteerhub -d volunteerhub_dev -v ON_ERROR_STOP=1 -q -f (Join-Path $_.FullName 'migration.sql')
        if ($LASTEXITCODE -ne 0) { throw "Migration $($_.Name) failed." }
        Log "Applied $($_.Name)"
      }
    } else { Log 'Tables already exist; skipped applying migrations (nothing was changed).' }
    Remove-Item Env:PGPASSWORD
  }
  npm run db:seed 2>&1 | Tee-Object -Variable out | Write-Host
  Add-Content -Encoding utf8 $log ($out | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Seed failed.' }
  $env:DATABASE_URL_TEST = "postgresql://volunteerhub:$appPassUrl@localhost:5432/volunteerhub_test"
  npm test 2>&1 | Tee-Object -Variable out | Write-Host
  Add-Content -Encoding utf8 $log (($out | Select-Object -Last 15) | Out-String)
  $testsOk = ($LASTEXITCODE -eq 0)
  Remove-Item Env:DATABASE_URL_TEST
  if (-not $testsOk) { throw 'Some tests failed (see above).' }

  Log ''
  Log 'ALL DONE. Start the server with:  npm run dev'
  Log 'Then open http://localhost:3001/api/docs (Swagger) and http://localhost:3001/api/health/ready'
}
catch {
  Log "ERROR: $($_.Exception.Message)"
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL_TEST -ErrorAction SilentlyContinue
  $pgPass = $null; $appPass = $null; $adminPass = $null; $jwt = $null
  Write-Host ''
  Read-Host 'Press Enter to close'
}
