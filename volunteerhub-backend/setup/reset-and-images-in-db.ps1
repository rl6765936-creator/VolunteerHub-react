$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $PSScriptRoot 'reset-and-images.txt'
Set-Location $root
"VolunteerHub reset + images-in-db log $(Get-Date -Format s)" | Set-Content -Encoding utf8 $log
function Log($t) { Write-Host $t; Add-Content -Encoding utf8 $log $t }
function Run($label, [scriptblock]$cmd) {
  Log "---- $label"
  $out = & $cmd 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  Add-Content -Encoding utf8 $log ($out | Out-String)
  $out | Write-Host
  Log "exit code: $code"
  return $code
}

$countSql = @"
SELECT 'admins', count(*) FROM "User" WHERE role = 'ADMIN'
UNION ALL SELECT 'other users', count(*) FROM "User" WHERE role <> 'ADMIN'
UNION ALL SELECT 'help requests', count(*) FROM "HelpRequest"
UNION ALL SELECT 'offers', count(*) FROM "HelpOffer"
UNION ALL SELECT 'tasks', count(*) FROM "VolunteerTask"
UNION ALL SELECT 'registrations', count(*) FROM "TaskRegistration"
UNION ALL SELECT 'images', count(*) FROM "MediaAttachment"
UNION ALL SELECT 'categories', count(*) FROM "Category";
"@

$deleteSql = @"
BEGIN;
TRUNCATE TABLE "AuditLog", "Notification", "MediaAttachment", "StatusHistory",
  "TaskRegistration", "VolunteerTask", "HelpOffer", "HelpRequest";
DELETE FROM "User" WHERE role <> 'ADMIN';
COMMIT;
"@

$utf8 = New-Object Text.UTF8Encoding($false)
$countFile = Join-Path $env:TEMP 'volunteerhub-reset-count.sql'
$deleteFile = Join-Path $env:TEMP 'volunteerhub-reset-delete.sql'
[IO.File]::WriteAllText($countFile, $countSql, $utf8)
[IO.File]::WriteAllText($deleteFile, $deleteSql, $utf8)

try {
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { throw '.env not found.' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $v = $Matches[2]; if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
      Set-Item -Path "Env:$($Matches[1])" -Value $v
    }
  }
  $u = [Uri]$env:DATABASE_URL
  $db = $u.AbsolutePath.TrimStart('/')
  Log "---- 1. Database: host=$($u.Host) database=$db"
  if (@('localhost', '127.0.0.1', '::1') -notcontains $u.Host) { throw 'DATABASE_URL is not a local database. Stopping.' }
  if ($db -ne 'volunteerhub_dev') { throw "DATABASE_URL points to '$db', expected volunteerhub_dev. Stopping." }
  if ($env:NODE_ENV -eq 'production') { throw 'NODE_ENV is production. Stopping.' }
  if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) {
    throw 'The VolunteerHub backend is running on port 3001. Stop it (Ctrl+C) and run this again.'
  }
  $bin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin' -Directory -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
  if (-not $bin) { throw 'PostgreSQL bin folder not found.' }
  $psql = Join-Path $bin 'psql.exe'; $pgdump = Join-Path $bin 'pg_dump.exe'
  $uploadDir = if ($env:UPLOAD_DIR) { $env:UPLOAD_DIR } else { 'uploads' }
  if (-not [IO.Path]::IsPathRooted($uploadDir)) { $uploadDir = Join-Path $root $uploadDir }

  Log '---- 2. Before:'
  $before = & $psql $env:DATABASE_URL -tAF ': ' -f $countFile
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the database with psql.' }
  $before | ForEach-Object { Log "  $_" }
  $admins = [int](($before | Where-Object { $_ -like 'admins:*' }) -replace '\D', '')
  if ($admins -lt 1) { throw 'No admin user found. Stopping, so you do not lose access.' }
  $imageFiles = @(Get-ChildItem $uploadDir -File -ErrorAction SilentlyContinue)
  Log "  image files in uploads: $($imageFiles.Count)"

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dump = Join-Path $PSScriptRoot "backup-volunteerhub_dev-$stamp.dump"
  Log "---- 3. Backup -> $dump"
  & $pgdump --dbname=$env:DATABASE_URL -Fc -f $dump
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dump)) { throw 'Database backup failed. Nothing was deleted.' }
  if ($imageFiles.Count -gt 0) {
    $imgBackup = Join-Path $PSScriptRoot "backup-uploads-$stamp"
    New-Item -ItemType Directory -Path $imgBackup | Out-Null
    Copy-Item $imageFiles.FullName $imgBackup
    Log "  images copied to $imgBackup"
  }

  Write-Host ''
  Write-Host 'This deletes all users except admins, all help requests, offers, tasks, registrations,' -ForegroundColor Yellow
  Write-Host 'images, notifications, history and the audit log. Categories are kept. A backup was made above.' -ForegroundColor Yellow
  $answer = Read-Host 'Type DELETE to continue (anything else cancels)'
  if ($answer -ne 'DELETE') { throw 'Cancelled by you. Nothing was deleted (the backup files stay).' }

  Log '---- 5. Deleting data'
  $out = & $psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $deleteFile 2>&1
  $out | ForEach-Object { Log "  $_" }
  if ($LASTEXITCODE -ne 0) { throw 'Delete failed and was rolled back. Nothing was deleted.' }
  if ($imageFiles.Count -gt 0) {
    Remove-Item $imageFiles.FullName -Force
    Log "  deleted $($imageFiles.Count) image files from uploads"
  }
  Log '---- 6. After:'
  & $psql $env:DATABASE_URL -tAF ': ' -f $countFile | ForEach-Object { Log "  $_" }

  $results = [ordered]@{}
  $results['migrate deploy'] = Run '7. prisma migrate deploy' { npx prisma migrate deploy }
  if ($results['migrate deploy'] -ne 0) { throw 'The migration failed. Send me the log.' }
  $results['generate'] = Run '8. prisma generate' { npx prisma generate }
  $results['typecheck'] = Run '9. typecheck' { npm run typecheck }
  $results['lint'] = Run '10. lint' { npm run lint }
  $results['tests'] = Run '11. tests (volunteerhub_test only)' { npm test }
  Log ''
  Log 'SUMMARY (0 = OK):'
  foreach ($k in $results.Keys) { Log ("  {0}: {1}" -f $k, $results[$k]) }
  Log 'Start the backend again with "npm run dev".'
  Log "To restore the old data: pg_restore --clean --dbname=<DATABASE_URL> `"$dump`" (before the migration only)."
}
catch { Log "ERROR: $($_.Exception.Message)" }
finally {
  Remove-Item $countFile, $deleteFile -ErrorAction SilentlyContinue
  Write-Host ''
  Read-Host 'Press Enter to close'
}
