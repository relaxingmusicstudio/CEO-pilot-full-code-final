param(
  [string]$Base = "https://pipe-profit-pilot.vercel.app"
)

try {
  Add-Type -AssemblyName System.Net.Http
} catch {
  # Best-effort load; fallback errors are handled per request.
}

$script:JsonDepthSupported = $false
try {
  $script:JsonDepthSupported = (Get-Command ConvertFrom-Json).Parameters.ContainsKey("Depth")
} catch {
  $script:JsonDepthSupported = $false
}

$script:Failed = $false

function Write-Check($Label, $Ok) {
  if ($Ok) {
    Write-Host "PASS: $Label" -ForegroundColor Green
  } else {
    Write-Host "FAIL: $Label" -ForegroundColor Red
    $script:Failed = $true
  }
}

function Run-Command($Label, [scriptblock]$Command) {
  Write-Host "`n=== $Label ===`n" -ForegroundColor Cyan
  & $Command
  Write-Check $Label ($LASTEXITCODE -eq 0)
}

function Assert-Json($Label, $Result) {
  $ok = $Result -and $Result.Json
  Write-Check "$Label JSON" $ok
}

function Invoke-JsonRequest($Method, $Url, $Body) {
  $client = New-Object System.Net.Http.HttpClient
  try {
    $client.DefaultRequestHeaders.Accept.Clear()
    $client.DefaultRequestHeaders.Accept.Add(
      [System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("application/json")
    )
    $content = $null
    if ($Body) {
      $json = $Body | ConvertTo-Json -Depth 12
      $content = New-Object System.Net.Http.StringContent(
        $json,
        [System.Text.Encoding]::UTF8,
        "application/json"
      )
    }

    if ($Method -eq "GET") {
      $response = $client.GetAsync($Url).GetAwaiter().GetResult()
    } else {
      $response = $client.PostAsync($Url, $content).GetAwaiter().GetResult()
    }

    $status = [int]$response.StatusCode
    $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $parsed = $null
    if ($text) {
      try {
        if ($script:JsonDepthSupported) {
          $parsed = $text | ConvertFrom-Json -Depth 12
        } else {
          $parsed = $text | ConvertFrom-Json
        }
      } catch {
        $parsed = $null
      }
    }

    return @{
      Status = $status
      Body = $text
      Json = $parsed
    }
  } catch {
    return @{
      Error = $_
    }
  } finally {
    $client.Dispose()
  }
}

Write-Host "`n=== PROOFGATE (lint/test/build + prod endpoints) ===`n" -ForegroundColor Cyan

Run-Command "npm run lint -- --max-warnings=0" { npm run lint -- --max-warnings=0 }
Run-Command "npm test" { npm test }
Run-Command "npm run build" { npm run build }

Write-Host "`n=== GET /api/save-analytics ===`n" -ForegroundColor Cyan
$health = Invoke-JsonRequest "GET" "$Base/api/save-analytics" $null
if ($health.Error) {
  $health.Error | Out-String
  Write-Check "GET /api/save-analytics" $false
} else {
  if ($health.Json) {
    $health.Json | ConvertTo-Json -Depth 12
  } else {
    $health.Body
  }
  Assert-Json "GET /api/save-analytics" $health
  $ok = $health.Json -and $health.Json.status -eq "ok" -and $health.Json.method -eq "GET"
  Write-Check "GET /api/save-analytics health" $ok
}

Write-Host "`n=== POST /api/save-analytics (track_event) ===`n" -ForegroundColor Cyan
$trackPayload = @{
  action = "track_event"
  data = @{
    visitorId = "proofgate-visitor"
    sessionId = "proofgate-session"
    eventType = "proofgate_event"
    eventData = @{ source = "proofgate" }
    pageUrl = "/proofgate"
  }
}
$trackResult = Invoke-JsonRequest "POST" "$Base/api/save-analytics" $trackPayload
if ($trackResult.Error) {
  $trackResult.Error | Out-String
  Write-Check "POST /api/save-analytics track_event" $false
} else {
  if ($trackResult.Json) {
    $trackResult.Json | ConvertTo-Json -Depth 12
  } else {
    $trackResult.Body
  }
  Assert-Json "POST /api/save-analytics track_event" $trackResult
  $ok = $false
  if ($trackResult.Json) {
    if ($trackResult.Json.ok -eq $true) {
      $ok = $true
    } elseif ($trackResult.Json.ok -eq $false -and $trackResult.Json.code -eq "upstream_error") {
      $ok = $true
    }
  }
  Write-Check "POST /api/save-analytics track_event" $ok
}

Write-Host "`n=== POST /api/save-analytics (upsert_visitor) ===`n" -ForegroundColor Cyan
$visitorPayload = @{
  action = "upsert_visitor"
  data = @{
    visitorId = "proofgate-visitor"
    device = "proofgate"
    browser = "proofgate"
    landingPage = "/"
  }
}
$visitorResult = Invoke-JsonRequest "POST" "$Base/api/save-analytics" $visitorPayload
if ($visitorResult.Error) {
  $visitorResult.Error | Out-String
  Write-Check "POST /api/save-analytics upsert_visitor" $false
} else {
  if ($visitorResult.Json) {
    $visitorResult.Json | ConvertTo-Json -Depth 12
  } else {
    $visitorResult.Body
  }
  Assert-Json "POST /api/save-analytics upsert_visitor" $visitorResult
  $ok = $false
  if ($visitorResult.Json) {
    if ($visitorResult.Json.ok -eq $true) {
      $ok = $true
    } elseif ($visitorResult.Json.ok -eq $false -and $visitorResult.Json.code -eq "upstream_error") {
      $ok = $true
    }
  }
  Write-Check "POST /api/save-analytics upsert_visitor" $ok
}

Write-Host "`n=== GET /api/search-decision ===`n" -ForegroundColor Cyan
$searchHealth = Invoke-JsonRequest "GET" "$Base/api/search-decision" $null
if ($searchHealth.Error) {
  $searchHealth.Error | Out-String
  Write-Check "GET /api/search-decision" $false
} else {
  if ($searchHealth.Json) {
    $searchHealth.Json | ConvertTo-Json -Depth 12
  } else {
    $searchHealth.Body
  }
  Assert-Json "GET /api/search-decision" $searchHealth
  $ok = $searchHealth.Json -and $searchHealth.Json.status -eq "ok"
  Write-Check "GET /api/search-decision health" $ok
}

Write-Host "`n=== POST /api/search-decision (mock) ===`n" -ForegroundColor Cyan
$searchPayload = @{
  query = "HVAC response times in Austin"
  mode = "mock"
}
$searchResult = Invoke-JsonRequest "POST" "$Base/api/search-decision" $searchPayload
$decisionId = $null
if ($searchResult.Error) {
  $searchResult.Error | Out-String
  Write-Check "POST /api/search-decision mock" $false
} else {
  if ($searchResult.Json) {
    $searchResult.Json | ConvertTo-Json -Depth 12
  } else {
    $searchResult.Body
  }
  Assert-Json "POST /api/search-decision mock" $searchResult
  $ok = $false
  if ($searchResult.Json) {
    $decisionId = $searchResult.Json.decision.decision_id
    $ok = $searchResult.Json.ok -eq $true -and $decisionId
  }
  Write-Check "POST /api/search-decision mock" $ok
}

Write-Host "`n=== POST /api/search-decision (live fail) ===`n" -ForegroundColor Cyan
$searchFailPayload = @{
  query = "HVAC response times in Austin"
  mode = "live"
}
$searchFailResult = Invoke-JsonRequest "POST" "$Base/api/search-decision" $searchFailPayload
if ($searchFailResult.Error) {
  $searchFailResult.Error | Out-String
  Write-Check "POST /api/search-decision live" $false
} else {
  if ($searchFailResult.Json) {
    $searchFailResult.Json | ConvertTo-Json -Depth 12
  } else {
    $searchFailResult.Body
  }
  Assert-Json "POST /api/search-decision live" $searchFailResult
  $ok = $searchFailResult.Json -and $searchFailResult.Json.ok -eq $true -and $searchFailResult.Json.decision.status -eq "failed"
  Write-Check "POST /api/search-decision live failed status" $ok
}

Write-Host "`n=== GET /api/decision/:id ===`n" -ForegroundColor Cyan
if (-not $decisionId) {
  Write-Check "GET /api/decision/:id" $false
} else {
  $decisionResult = Invoke-JsonRequest "GET" "$Base/api/decision/$decisionId" $null
  if ($decisionResult.Error) {
    $decisionResult.Error | Out-String
    Write-Check "GET /api/decision/:id" $false
  } else {
    if ($decisionResult.Json) {
      $decisionResult.Json | ConvertTo-Json -Depth 12
    } else {
      $decisionResult.Body
    }
    Assert-Json "GET /api/decision/:id" $decisionResult
    $ok = $decisionResult.Json -and $decisionResult.Json.ok -eq $true -and $decisionResult.Json.decision
    Write-Check "GET /api/decision/:id" $ok
  }
}

Write-Host "`n=== GET /api/alex-chat (chat health) ===`n" -ForegroundColor Cyan
$chatHealth = Invoke-JsonRequest "GET" "$Base/api/alex-chat" $null
if ($chatHealth.Error) {
  $chatHealth.Error | Out-String
  Write-Check "GET /api/alex-chat" $false
} else {
  if ($chatHealth.Json) {
    $chatHealth.Json | ConvertTo-Json -Depth 12
  } else {
    $chatHealth.Body
  }
  Assert-Json "GET /api/alex-chat" $chatHealth
  $ok = $chatHealth.Json -and $chatHealth.Json.status -eq "ok"
  Write-Check "GET /api/alex-chat health" $ok
}

if ($script:Failed) {
  Write-Host "`nPROOFGATE FAILED" -ForegroundColor Red
  exit 1
}

Write-Host "`nPROOFGATE PASSED" -ForegroundColor Green
exit 0
