param(
  [Parameter(Mandatory = $true)][string]$ListJson,
  [Parameter(Mandatory = $true)][string]$OutJson
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.VisualBasic

$items = @()
if (Test-Path -LiteralPath $ListJson) {
  $raw = [System.IO.File]::ReadAllText($ListJson, [System.Text.Encoding]::UTF8)
  $parsed = ConvertFrom-Json -InputObject $raw
  $items = @($parsed)
} else {
  throw "list file not found: $ListJson"
}

$results = New-Object System.Collections.ArrayList
foreach ($item in $items) {
  $p = [string]$item
  $entry = [ordered]@{ path = $p; ok = $false; error = '' }
  try {
    if (-not (Test-Path -LiteralPath $p)) {
      $entry.error = 'not found'
    } elseif (-not (Test-Path -LiteralPath $p -PathType Container)) {
      $entry.error = 'not a directory'
    } else {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
        $p,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
      )
      if (Test-Path -LiteralPath $p) {
        $entry.error = 'still present after recycle'
      } else {
        $entry.ok = $true
      }
    }
  } catch {
    $entry.error = $_.Exception.Message
  }
  [void]$results.Add($entry)
}

$json = ConvertTo-Json -InputObject @($results) -Depth 4 -Compress
[System.IO.File]::WriteAllText($OutJson, $json, (New-Object System.Text.UTF8Encoding($false)))

