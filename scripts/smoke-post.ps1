param(
 [string]$Base = "https://pipe-profit-pilot.vercel.app"
)

Write-Host "`n=== SMOKE POST (single call) ===`n" -ForegroundColor Cyan

$payload = @{
 action = "track_event"
 event = "smoke_test_event"
 source = "manual_post"
 meta = @{ step = "smoke" }
} | ConvertTo-Json -Depth 10

try {
 $res = Invoke-RestMethod -Method Post -Uri "$Base/api/save-analytics" -ContentType "application/json" -Body $payload
 Write-Host "OK" -ForegroundColor Green
 $res | ConvertTo-Json -Depth 10
} catch {
 Write-Host "FAIL" -ForegroundColor Red
 if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
 $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
 $reader.ReadToEnd()
 } else {
 $_ | Out-String
 }
}
