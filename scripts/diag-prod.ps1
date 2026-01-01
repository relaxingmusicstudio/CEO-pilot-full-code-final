param(
  [string]$Base = "https://pipe-profit-pilot.vercel.app"
)

Write-Host "`n=== vercel inspect --production ===`n" -ForegroundColor Cyan
$inspectRaw = npx vercel inspect --production 2>&1
$inspectRaw

$prodUrl = $null
try {
  $json = $inspectRaw | ConvertFrom-Json -ErrorAction Stop
  if ($json.url) {
    $prodUrl = $json.url
  }
} catch {
  $prodUrl = $null
}

if (-not $prodUrl) {
  $match = [regex]::Match($inspectRaw, "(https?://[^\\s]+)")
  if ($match.Success) {
    $prodUrl = $match.Value
  } else {
    $urlLine = [regex]::Match($inspectRaw, "(?im)^\\s*url\\s*:?\\s*([^\\s]+)")
    if ($urlLine.Success) {
      $prodUrl = $urlLine.Groups[1].Value
    }
  }
}

if ($prodUrl -and ($prodUrl -notmatch "^https?://")) {
  $prodUrl = "https://$prodUrl"
}

if ($prodUrl) {
  Write-Host "`nParsed production deployment URL: $prodUrl`n" -ForegroundColor Green
} else {
  Write-Host "`nUsing Base URL for API checks; production logs will use the Base URL.`n" -ForegroundColor Yellow
}

$logTarget = if ($prodUrl) { $prodUrl } else { $Base }

Write-Host "`n=== vercel logs (before) ===`n" -ForegroundColor Cyan
npx vercel logs $logTarget 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARN: vercel logs failed for $logTarget (check CLI auth or use deployment URL)." -ForegroundColor Yellow
}

Write-Host "`n=== POST /api/save-analytics ===`n" -ForegroundColor Cyan
$payload = @{
  action = "track_event"
  data = @{
    visitorId = "diag-prod-visitor"
    sessionId = "diag-prod-session"
    eventType = "diag_prod_event"
    eventData = @{ source = "diag-prod" }
    pageUrl = "/diag-prod"
  }
}

try {
  $json = $payload | ConvertTo-Json -Depth 10
  $response = Invoke-RestMethod -Method Post -Uri "$Base/api/save-analytics" -ContentType "application/json" -Body $json
  $response | ConvertTo-Json -Depth 10
} catch {
  Write-Host "POST failed:" -ForegroundColor Red
  if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.ReadToEnd()
  } else {
    $_ | Out-String
  }
}

Write-Host "`n=== vercel logs (after) ===`n" -ForegroundColor Cyan
npx vercel logs $logTarget 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARN: vercel logs failed for $logTarget (check CLI auth or use deployment URL)." -ForegroundColor Yellow
}
